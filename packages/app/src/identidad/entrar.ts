import 'server-only';

import { randomBytes } from 'node:crypto';

import { conTransaccion, obtenerDb, repoIdentidad, repoSesion } from '@morphiqpos/data';

import { DURACION_SESION_SEGUNDOS, firmarSesion, nuevoIdDeSesion } from '../sesion/token.ts';
import { esperaTrasFallo, FORMA_PIN, INTENTOS_ANTES_DE_BLOQUEAR, verificarPin } from './pin.ts';
import { hashearDispositivo, VIGENCIA_DISPOSITIVO_SEGUNDOS } from './dispositivo.ts';

/**
 * Entrada con PIN (F1.1-A-03, revisada en T2 del port del restaurante).
 *
 * No pasa por `comando()` porque `comando()` exige un `Ambito` y aquí es donde
 * el ámbito nace. Lo que sí conserva es todo lo demás: valida la entrada, falla
 * cerrado, cuenta intentos y no filtra por qué falló.
 *
 * ── Se retiró el enrolamiento de terminal ─────────────────────────────────
 * Antes hacía falta que alguien fuera a gestión, generara un código de seis
 * dígitos y lo tecleara en la tableta ANTES de que nadie pudiera entrar. Ese
 * paso no lo pidió nadie: en el sistema de Miguel un navegador es una caja y
 * punto. Ahora el dispositivo se da de alta SOLO, y sólo **después** de que el
 * PIN se verificó — sin credencial correcta no se crea nada, así que la puerta
 * no se abrió, sólo dejó de haber un trámite delante.
 *
 * Lo que NO cambió, y era lo importante: el PIN se verifica en el servidor con
 * Argon2id y pimienta, el hash no sale de la base, el bloqueo por intentos
 * sigue igual, y el ámbito se resuelve leyendo la base, no lo que llegó.
 *
 * ── La respuesta es siempre la misma ──────────────────────────────────────
 * PIN incorrecto o empleo inexistente: `credenciales`. Un mensaje distinto por
 * caso deja enumerar qué empleos existen probando ids (`morphiq-prs §10`). El
 * servidor sí distingue —lo audita— pero no lo dice.
 */

export interface PeticionEntrar {
  readonly empleoId: string;
  readonly pin: string;
  /** Token de dispositivo de la cookie. Vacío si este navegador es nuevo. */
  readonly deviceToken: string;
  /** La organización del despliegue. Nunca llega del cliente (R16). */
  readonly organizacionId: string;
  readonly pimienta: string;
  readonly secretoSesion: string;
}

export type ResultadoEntrar =
  | {
      readonly ok: true;
      readonly token: string;
      readonly maxEdadSegundos: number;
      readonly organizacionId: string;
      readonly rol: string;
      readonly nombre: string;
      /**
       * Sólo cuando este dispositivo se acaba de dar de alta: va a su cookie
       * y no se vuelve a ver en claro nunca más.
       */
      readonly deviceToken?: string;
      readonly maxEdadDispositivoSegundos?: number;
    }
  | {
      readonly ok: false;
      readonly motivo: 'credenciales' | 'bloqueada';
      /** Segundos que faltan para poder reintentar. Sólo en `bloqueada`. */
      readonly esperaSegundos?: number;
    };

export async function entrarConPin(
  peticion: PeticionEntrar,
  ahora: Date = new Date(),
): Promise<ResultadoEntrar> {
  if (!FORMA_PIN.test(peticion.pin)) return { ok: false, motivo: 'credenciales' };

  const db = obtenerDb();

  // 1 · La credencial, buscada por empleo dentro de la organización del
  //     despliegue. El cliente no elige la organización.
  const credencial = await repoIdentidad.credencialParaVerificar(
    db,
    peticion.organizacionId,
    peticion.empleoId,
  );
  if (credencial === null) return { ok: false, motivo: 'credenciales' };

  // 2 · Bloqueo activo: ni siquiera se comprueba el PIN.
  if (credencial.bloqueadaHasta !== null && credencial.bloqueadaHasta.getTime() > ahora.getTime()) {
    const restan = Math.ceil((credencial.bloqueadaHasta.getTime() - ahora.getTime()) / 1000);
    return { ok: false, motivo: 'bloqueada', esperaSegundos: restan };
  }

  // 3 · Argon2id con pimienta, en el servidor. Nunca en el navegador.
  const correcto = await verificarPin(peticion.pin, credencial.pinHash, peticion.pimienta);

  if (!correcto) {
    const intentos = credencial.intentosFallidos + 1;
    const espera = esperaTrasFallo(intentos);
    const bloqueadaHasta = espera === 0 ? null : new Date(ahora.getTime() + espera * 1000);
    await conTransaccion((tx) =>
      repoIdentidad.registrarIntentoFallido(tx, credencial.credencialId, bloqueadaHasta),
    );
    return intentos >= INTENTOS_ANTES_DE_BLOQUEAR
      ? { ok: false, motivo: 'bloqueada', esperaSegundos: espera }
      : { ok: false, motivo: 'credenciales' };
  }

  // 4 · El ámbito se resuelve desde la base, no desde lo que llegó.
  const ambito = await repoSesion.resolverAmbito(db, credencial.identidadId, credencial.empleoId);
  if (ambito === null) return { ok: false, motivo: 'credenciales' };

  // 5 · La terminal. Ya con el PIN verificado, y sólo entonces.
  const terminal = await resolverTerminal(peticion, ambito.sucursalId, ahora);

  const sid = nuevoIdDeSesion();
  const exp = Math.floor(ahora.getTime() / 1000) + DURACION_SESION_SEGUNDOS;
  const expiraEn = new Date(exp * 1000);

  // La fila y la limpieza del bloqueo confirman juntas. La cookie sólo se
  // firma después: nunca se entrega un sid que la base no haya registrado.
  await conTransaccion(async (tx) => {
    await repoIdentidad.limpiarIntentos(tx, credencial.credencialId);
    await repoSesion.crearSesion(tx, {
      sid,
      organizacionId: ambito.organizacionId,
      empleoId: credencial.empleoId,
      creadaEn: ahora,
      expiraEn,
    });
    await repoSesion.purgarSesionesAntiguas(tx, new Date(ahora.getTime() - RETENCION_SESIONES_MS));
  });

  const token = firmarSesion(
    {
      sid,
      identidadId: credencial.identidadId,
      empleoId: credencial.empleoId,
      terminalId: terminal.terminalId,
      exp,
    },
    peticion.secretoSesion,
  );

  return {
    ok: true,
    token,
    maxEdadSegundos: DURACION_SESION_SEGUNDOS,
    organizacionId: ambito.organizacionId,
    rol: ambito.rol,
    nombre: ambito.nombrePersona,
    ...(terminal.deviceToken === null
      ? {}
      : {
          deviceToken: terminal.deviceToken,
          maxEdadDispositivoSegundos: VIGENCIA_DISPOSITIVO_SEGUNDOS,
        }),
  };
}

interface TerminalDeLaSesion {
  readonly terminalId: string | null;
  /** No `null` sólo cuando se acaba de crear: hay que ponerlo en la cookie. */
  readonly deviceToken: string | null;
}

/**
 * La terminal de esta sesión: la que ya tenía el dispositivo, o una nueva.
 *
 * Un dueño sin sucursal asignada se queda **sin terminal**, igual que antes:
 * puede ver gestión desde su teléfono y no puede abrir caja. Esa distinción es
 * la que hace que el arqueo signifique algo, y no se toca.
 */
async function resolverTerminal(
  peticion: PeticionEntrar,
  sucursalId: string | null,
  ahora: Date,
): Promise<TerminalDeLaSesion> {
  const conocida = await terminalPorToken(
    peticion.deviceToken,
    peticion.pimienta,
    peticion.organizacionId,
  );
  if (conocida !== null) return { terminalId: conocida.terminalId, deviceToken: null };

  if (sucursalId === null) return { terminalId: null, deviceToken: null };

  const deviceToken = randomBytes(32).toString('base64url');
  const deviceTokenHash = hashearDispositivo(deviceToken, peticion.pimienta);
  const yaHay = await repoIdentidad.contarTerminales(
    obtenerDb(),
    peticion.organizacionId,
    sucursalId,
  );

  // El nombre es unico por sucursal, y dos cajas que entran por primera vez a
  // la vez proponen el mismo numero. Se reintenta con el siguiente en vez de
  // devolverle al cajero un error que no significa nada para el.
  for (let intento = 0; intento < INTENTOS_DE_NOMBRE; intento += 1) {
    const terminalId = await conTransaccion((tx) =>
      repoIdentidad.crearTerminalParaDispositivo(tx, {
        organizacionId: peticion.organizacionId,
        sucursalId,
        nombre: `Caja ${String(yaHay + 1 + intento)}`,
        deviceTokenHash,
        ahora,
      }),
    );
    if (terminalId !== null) return { terminalId, deviceToken };
  }

  // Cinco choques seguidos ya no es una carrera: es que alguien nombro sus
  // cajas a mano. Un sufijo del reloj no puede chocar y la caja entra igual;
  // el nombre se cambia despues desde la pantalla.
  const terminalId = await conTransaccion((tx) =>
    repoIdentidad.crearTerminalParaDispositivo(tx, {
      organizacionId: peticion.organizacionId,
      sucursalId,
      nombre: `Caja ${String(ahora.getTime())}`,
      deviceTokenHash,
      ahora,
    }),
  );

  // Si hasta eso choca, la sesion sigue: sin terminal se puede ver gestion y no
  // abrir caja, que es el mismo camino del dueno sin sucursal.
  return { terminalId, deviceToken: terminalId === null ? null : deviceToken };
}

/** Cinco es de sobra: son colisiones de milisegundos, no de configuracion. */
const INTENTOS_DE_NOMBRE = 5;

/** Rastro operativo antes de eliminar sesiones vencidas. */
const RETENCION_SESIONES_MS = 7 * 24 * 60 * 60 * 1000;

/** Quién puede entrar en este negocio. Nombre y rol; nunca el hash. */
export async function empleadosParaEntrar(
  organizacionId: string,
  deviceToken: string,
  pimienta: string,
): Promise<repoIdentidad.EmpleadoParaEntrar[]> {
  // Si el dispositivo ya es una caja de una sucursal, se enseña la plantilla de
  // ESA sucursal. Si es nuevo, la del negocio: es la primera vez que alguien
  // entra desde aquí y todavía no hay sucursal que acotar.
  const terminal = await terminalPorToken(deviceToken, pimienta, organizacionId);
  return repoIdentidad.empleadosConPin(obtenerDb(), organizacionId, terminal?.sucursalId ?? null);
}

interface TerminalIdentificada {
  readonly terminalId: string;
  readonly organizacionId: string;
  readonly sucursalId: string;
}

async function terminalPorToken(
  deviceToken: string,
  pimienta: string,
  organizacionId: string,
): Promise<TerminalIdentificada | null> {
  if (deviceToken === '') return null;
  const fila = await obtenerDb()
    .selectFrom('terminales')
    .select(['id as terminalId', 'organizacion_id as organizacionId', 'sucursal_id as sucursalId'])
    .where('device_token_hash', '=', hashearDispositivo(deviceToken, pimienta))
    .where('activa', '=', true)
    .where('enrolada_en', 'is not', null)
    // Una cookie de otra organización no sirve aquí. Sin este filtro, un
    // dispositivo enrolado en otro negocio arrastraría su terminal a éste.
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  return fila ?? null;
}
