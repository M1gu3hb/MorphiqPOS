import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';

import { ErrorDominio, type Ambito } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb, repoSesion, type Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { resetearDemo } from '../demostracion/resetear.ts';
import { resolverTerminal, terminalPorToken } from '../identidad/entrar.ts';
import { comando } from '../produccion.ts';
import { sembrarHistorialDePresentacion } from './historial.ts';
import { diaDeInstante, sumarDias, ZONA_DEL_HISTORIAL } from './historial-fechas.ts';
import {
  DURACION_SESION_SEGUNDOS,
  firmarSesion,
  nuevoIdDeSesion,
  type CargaSesion,
} from '../sesion/token.ts';

/**
 * EL CONTEXTO DE PRESENTACIÓN DEL RESTAURANTE (cierre del 21-10).
 *
 * Miguel enseña el restaurante a un cliente con treinta días de actividad, y al terminar
 * vuelve a SUS datos exactamente como estaban. Las dos cosas a la vez sólo se pueden si la
 * presentación vive en otra parte: aquí es una organización interna —el ESPEJO— con el
 * catálogo, las mesas y la configuración del restaurante real, y su propio historial.
 *
 * ── Por qué una organización y no una marca en cada fila ──────────────────────────────
 * El aislamiento por organización ya existe en cada consulta, cada comando y cada índice
 * único (R16). Marcar las filas «simuladas» obligaría a filtrar en todos esos sitios, y el
 * sitio que se olvidara mezclaría la venta inventada con la de verdad. Con una organización
 * aparte, la caja, el inventario y los cortes no se pueden cruzar por construcción.
 *
 * ── Por qué no se ve como otro restaurante ─────────────────────────────────────────────
 * El espejo no está en `ORGANIZACION`: no sale en la entrada ni en «Modelos de negocio».
 * Sólo se llega a él porque el restaurante real está EN presentación, y entonces quien entra
 * con su PIN de siempre cae en su gemelo del espejo (`sesionDePresentacion`). Al apagarla,
 * las sesiones del espejo dejan de valer (`resolverSesion`) y cada puesto vuelve a entrar en
 * el real.
 *
 * ── Las llaves, en la configuración ───────────────────────────────────────────────────
 * Restaurante real: `presentacion_modo = { espejoId, activo }`.
 * Espejo: `presentacion_espejo_de` (el real), `presentacion_activa`, `presentacion_gemelos`
 * (empleo real → empleo del espejo) y `presentacion_preparado`.
 */

export interface ModoDePresentacion {
  readonly espejoId: string | null;
  readonly activo: boolean;
}

export interface Gemelo {
  readonly espejoId: string;
  readonly empleoId: string;
  readonly identidadId: string;
  readonly sucursalId: string | null;
}

type Registro = Readonly<Record<string, unknown>>;

function registro(valor: unknown): Registro | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Registro)
    : null;
}

export function modoDePresentacion(valores: unknown): ModoDePresentacion {
  const modo = registro(registro(valores)?.['presentacion_modo']);
  const espejoId = modo?.['espejoId'];
  return {
    espejoId: typeof espejoId === 'string' && espejoId !== '' ? espejoId : null,
    activo: modo?.['activo'] === true,
  };
}

export function espejoDe(valores: unknown): string | null {
  const origen = registro(valores)?.['presentacion_espejo_de'];
  return typeof origen === 'string' && origen !== '' ? origen : null;
}

function gemelosDe(valores: unknown): Readonly<Record<string, string>> {
  const mapa = registro(registro(valores)?.['presentacion_gemelos']);
  if (mapa === null) return {};
  return Object.fromEntries(
    Object.entries(mapa).filter((par): par is [string, string] => typeof par[1] === 'string'),
  );
}

/** Lo que NO pasa del real al espejo: la concesión del dueño general y las llaves del modo. */
const LLAVES_QUE_NO_SE_COPIAN = new Set([
  'presentacion_modo',
  'presentacion_destinos',
  'presentacion_dueno_empleo',
  'presentacion_password_hash',
  'presentacion_espejo_de',
  'presentacion_activa',
  'presentacion_gemelos',
  'presentacion_preparado',
  'presentacion_historial',
]);

async function valoresDe(tx: Transaccion, organizacionId: string): Promise<Registro> {
  const fila = await tx
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  return registro(fila?.valores) ?? {};
}

/** Une llaves a la configuración, sube su versión y la crea si no existe. */
async function mezclar(tx: Transaccion, organizacionId: string, cambios: Registro): Promise<void> {
  await sql`
    insert into configuracion (organizacion_id, valores, version)
    values (${organizacionId}, ${JSON.stringify(cambios)}::jsonb, 1)
    on conflict (organizacion_id)
    do update set valores = configuracion.valores || excluded.valores,
                  version = configuracion.version + 1
  `.execute(tx);
}

/** Dos dispositivos que preparan o encienden a la vez se forman aquí. */
async function bloquear(tx: Transaccion, origenId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`presentacion:${origenId}`}))`.execute(tx);
}

/** El modo del restaurante real, y si su espejo ya está listo para usarse. */
export async function estadoDePresentacion(origenId: string): Promise<{
  readonly modo: ModoDePresentacion;
  readonly preparado: boolean;
  readonly historial: readonly string[];
}> {
  return conTransaccion(async (tx) => {
    const modo = modoDePresentacion(await valoresDe(tx, origenId));
    if (modo.espejoId === null) return { modo, preparado: false, historial: [] };
    const espejo = await valoresDe(tx, modo.espejoId);
    const dias = registro(espejo['presentacion_historial'])?.['dias'];
    return {
      modo,
      preparado: espejo['presentacion_preparado'] === true,
      historial: Array.isArray(dias) ? dias.filter((d): d is string => typeof d === 'string') : [],
    };
  });
}

/**
 * El restaurante real detrás de un contexto: él mismo, o el real si es su espejo.
 * `null` si el negocio no es un restaurante (el modo es de su giro).
 */
export async function restauranteDelContexto(organizacionId: string): Promise<string | null> {
  return conTransaccion(async (tx) => {
    const origen = espejoDe(await valoresDe(tx, organizacionId)) ?? organizacionId;
    const org = await tx
      .selectFrom('organizaciones')
      .select('giro')
      .where('id', '=', origen)
      .where('activa', '=', true)
      .executeTakeFirst();
    return org?.giro === 'restaurante' ? origen : null;
  });
}

interface Creado {
  readonly espejoId: string;
  readonly sucursalId: string;
  readonly duenoEmpleoId: string;
  readonly duenoIdentidadId: string;
}

/**
 * Crea la fila del espejo con lo mínimo para correr la siembra del restaurante: la
 * organización, su sucursal, el gemelo del dueño que prepara y las llaves del modo.
 */
async function crearEspejo(
  tx: Transaccion,
  origenId: string,
  duenoOrigenId: string,
): Promise<Creado> {
  const origen = await tx
    .selectFrom('organizaciones')
    .selectAll()
    .where('id', '=', origenId)
    .executeTakeFirstOrThrow();
  const sucursal = await tx
    .selectFrom('sucursales')
    .selectAll()
    .where('organizacion_id', '=', origenId)
    .where('activa', '=', true)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  const dueno = await tx
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .select(['personas.nombre', 'personas.apellidos', 'empleos.rol'])
    .where('empleos.id', '=', duenoOrigenId)
    .where('empleos.organizacion_id', '=', origenId)
    .executeTakeFirst();
  if (dueno?.rol !== 'dueno')
    throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Sólo el dueño prepara la presentación.');

  const espejoId = randomUUID();
  const sucursalId = randomUUID();
  const personaId = randomUUID();
  const duenoIdentidadId = randomUUID();
  const duenoEmpleoId = randomUUID();
  await tx
    .insertInto('organizaciones')
    .values({
      id: espejoId,
      nombre: origen.nombre,
      slug: `${origen.slug.slice(0, 40)}-presentacion-${randomBytes(3).toString('hex')}`,
      giro: origen.giro,
      paquete: origen.paquete,
      moneda: origen.moneda,
      zona_horaria: origen.zona_horaria,
    })
    .execute();
  await tx
    .insertInto('sucursales')
    .values({
      id: sucursalId,
      organizacion_id: espejoId,
      nombre: sucursal?.nombre ?? 'Matriz',
      direccion: sucursal?.direccion ?? null,
      telefono: sucursal?.telefono ?? null,
      cajas_simultaneas: sucursal?.cajas_simultaneas ?? 1,
    })
    .execute();
  await tx
    .insertInto('personas')
    .values({
      id: personaId,
      organizacion_id: espejoId,
      nombre: dueno.nombre,
      apellidos: dueno.apellidos,
    })
    .execute();
  await tx
    .insertInto('identidades')
    .values({ id: duenoIdentidadId, persona_id: personaId })
    .execute();
  await tx
    .insertInto('empleos')
    .values({
      id: duenoEmpleoId,
      persona_id: personaId,
      organizacion_id: espejoId,
      sucursal_id: sucursalId,
      rol: 'dueno',
    })
    .execute();
  await mezclar(tx, espejoId, {
    presentacion_espejo_de: origenId,
    presentacion_activa: false,
    presentacion_preparado: false,
    presentacion_gemelos: { [duenoOrigenId]: duenoEmpleoId },
  });
  await mezclar(tx, origenId, { presentacion_modo: { espejoId, activo: false } });
  return { espejoId, sucursalId, duenoEmpleoId, duenoIdentidadId };
}

/** El gemelo del dueño que prepara, para correr la siembra con su ámbito. */
async function ambitoDelDuenoEnElEspejo(
  tx: Transaccion,
  espejoId: string,
  duenoOrigenId: string,
): Promise<Ambito> {
  const gemeloId = gemelosDe(await valoresDe(tx, espejoId))[duenoOrigenId];
  const fila =
    gemeloId === undefined
      ? undefined
      : await tx
          .selectFrom('empleos')
          .innerJoin('identidades', 'identidades.persona_id', 'empleos.persona_id')
          .select([
            'empleos.id as empleoId',
            'empleos.sucursal_id as sucursalId',
            'identidades.id as identidadId',
          ])
          .where('empleos.id', '=', gemeloId)
          .where('empleos.organizacion_id', '=', espejoId)
          .where('empleos.rol', '=', 'dueno')
          .executeTakeFirst();
  if (fila === undefined)
    throw new ErrorDominio(
      'ACCESO_NO_ENCONTRADO',
      'Sólo el dueño que la creó prepara esta presentación.',
    );
  return {
    organizacionId: espejoId,
    sucursalId: fila.sucursalId,
    terminalId: null,
    identidadId: fila.identidadId,
    empleoId: fila.empleoId,
    rol: 'dueno',
  };
}

/**
 * Lo que el espejo toma del restaurante real después de sembrarse: la configuración (estilo,
 * impuesto, portal QR…), la distribución de mesas con sus zonas, y precio, imagen y estado
 * de cada platillo por su nombre. Nada operativo: ni ventas, ni existencias, ni cortes.
 */
async function copiarDelReal(
  tx: Transaccion,
  origenId: string,
  espejoId: string,
  gemelos: Readonly<Record<string, string>>,
): Promise<void> {
  const delReal = await valoresDe(tx, origenId);
  const copiables = Object.fromEntries(
    Object.entries(delReal).filter(([llave]) => !LLAVES_QUE_NO_SE_COPIAN.has(llave)),
  );
  await mezclar(tx, espejoId, copiables);

  // Las zonas por nombre: las que el real tiene y el espejo no, se crean.
  const zonasReal = await tx
    .selectFrom('zonas')
    .select(['id', 'nombre', 'orden', 'activa'])
    .where('organizacion_id', '=', origenId)
    .execute();
  const zonasEspejo = new Map(
    (
      await tx
        .selectFrom('zonas')
        .select(['id', 'nombre'])
        .where('organizacion_id', '=', espejoId)
        .execute()
    ).map((z) => [z.nombre.toLocaleLowerCase('es-MX'), z.id]),
  );
  const zonaEspejoDe = new Map<string, string>();
  for (const zona of zonasReal) {
    let id = zonasEspejo.get(zona.nombre.toLocaleLowerCase('es-MX'));
    if (id === undefined) {
      const fila = await tx
        .insertInto('zonas')
        .values({ organizacion_id: espejoId, nombre: zona.nombre, orden: zona.orden })
        .returning('id')
        .executeTakeFirstOrThrow();
      id = fila.id;
    }
    zonaEspejoDe.set(zona.id, id);
  }

  // Las mesas: la distribución del real reemplaza a la sembrada. El espejo está recién
  // sembrado —ninguna mesa tiene cuenta—, y cada mesa nace con SU token: el QR del real no
  // abre el espejo ni al revés.
  const sucursal = await tx
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', espejoId)
    .orderBy('created_at', 'asc')
    .executeTakeFirstOrThrow();
  await tx.deleteFrom('mesas').where('organizacion_id', '=', espejoId).execute();
  const mesas = await tx
    .selectFrom('mesas')
    .selectAll()
    .where('organizacion_id', '=', origenId)
    .where('activa', '=', true)
    .orderBy('numero')
    .execute();
  if (mesas.length > 0) {
    await tx
      .insertInto('mesas')
      .values(
        mesas.map((m) => ({
          organizacion_id: espejoId,
          sucursal_id: sucursal.id,
          zona_id: m.zona_id === null ? null : (zonaEspejoDe.get(m.zona_id) ?? null),
          numero: m.numero,
          nombre: m.nombre,
          capacidad: m.capacidad,
          forma: m.forma,
          tamano: m.tamano,
          posicion_x: m.posicion_x,
          posicion_y: m.posicion_y,
          orden: m.orden,
          qr_activa: m.qr_activa,
          qr_token: randomBytes(24).toString('base64url'),
          // La mesa asignada a alguien del real queda asignada a su gemelo.
          empleado_asignado_id:
            m.empleado_asignado_id === null ? null : (gemelos[m.empleado_asignado_id] ?? null),
        })),
      )
      .execute();
  }

  // Los platillos, por nombre: lo que Miguel cambió en su carta se ve en la presentación.
  const productos = await tx
    .selectFrom('productos')
    .select([
      'nombre',
      'descripcion',
      'imagen_url',
      'precio_venta_centavos',
      'activo',
      'visible_en_pos',
      'visible_en_menu_digital',
      'area_preparacion',
    ])
    .where('organizacion_id', '=', origenId)
    .execute();
  for (const p of productos) {
    await tx
      .updateTable('productos')
      .set({
        descripcion: p.descripcion,
        imagen_url: p.imagen_url,
        precio_venta_centavos: p.precio_venta_centavos,
        activo: p.activo,
        visible_en_pos: p.visible_en_pos,
        visible_en_menu_digital: p.visible_en_menu_digital,
        area_preparacion: p.area_preparacion,
      })
      .where('organizacion_id', '=', espejoId)
      .where('nombre', '=', p.nombre)
      .execute();
  }
}

/**
 * LOS GEMELOS DEL PERSONAL: cada empleo activo del real con el suyo en el espejo.
 *
 * La siembra trae al equipo de la demostración con sus nombres; se emparejan por nombre y
 * puesto. Quien no tenga pareja —un mesero nuevo que Miguel dio de alta— recibe un empleo
 * nuevo con su nombre y su puesto. Nadie entra al espejo con PIN: entra al real y la sesión
 * se abre en su gemelo, así que el gemelo no necesita credencial.
 */
/** Un empleo nuevo en el espejo con el nombre y el puesto de alguien del real. */
async function crearGemelo(
  tx: Transaccion,
  origenId: string,
  espejoId: string,
  empleoOrigenId: string,
): Promise<string | null> {
  const real = await tx
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .select(['empleos.rol', 'personas.nombre', 'personas.apellidos'])
    .where('empleos.id', '=', empleoOrigenId)
    .where('empleos.organizacion_id', '=', origenId)
    .where('empleos.activo', '=', true)
    .executeTakeFirst();
  if (real === undefined) return null;
  const sucursal = await tx
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', espejoId)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  const personaId = randomUUID();
  const gemeloId = randomUUID();
  await tx
    .insertInto('personas')
    .values({
      id: personaId,
      organizacion_id: espejoId,
      nombre: real.nombre,
      apellidos: real.apellidos,
    })
    .execute();
  await tx.insertInto('identidades').values({ persona_id: personaId }).execute();
  await tx
    .insertInto('empleos')
    .values({
      id: gemeloId,
      persona_id: personaId,
      organizacion_id: espejoId,
      sucursal_id: sucursal?.id ?? null,
      rol: real.rol,
      ve_todas_las_estaciones: true,
    })
    .execute();
  await mezclar(tx, espejoId, {
    presentacion_gemelos: {
      ...gemelosDe(await valoresDe(tx, espejoId)),
      [empleoOrigenId]: gemeloId,
    },
  });
  return gemeloId;
}

async function emparejarPersonal(
  tx: Transaccion,
  origenId: string,
  espejoId: string,
): Promise<Record<string, string>> {
  const gemelos: Record<string, string> = { ...gemelosDe(await valoresDe(tx, espejoId)) };
  const reales = await tx
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .select(['empleos.id', 'empleos.rol', 'personas.nombre'])
    .where('empleos.organizacion_id', '=', origenId)
    .where('empleos.activo', '=', true)
    .execute();
  const delEspejo = await tx
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .select(['empleos.id', 'empleos.rol', 'personas.nombre'])
    .where('empleos.organizacion_id', '=', espejoId)
    .where('empleos.activo', '=', true)
    .execute();
  const tomados = new Set(Object.values(gemelos));
  for (const real of reales) {
    const actual = gemelos[real.id];
    if (actual !== undefined && delEspejo.some((e) => e.id === actual)) continue;
    const pareja = delEspejo.find(
      (e) =>
        !tomados.has(e.id) &&
        e.rol === real.rol &&
        e.nombre.toLocaleLowerCase('es-MX') === real.nombre.toLocaleLowerCase('es-MX'),
    );
    if (pareja !== undefined) {
      gemelos[real.id] = pareja.id;
      tomados.add(pareja.id);
    }
  }
  await mezclar(tx, espejoId, { presentacion_gemelos: gemelos });
  // Quien no tiene pareja en la siembra —el dueño general, un mesero dado de alta por Miguel—
  // recibe su gemelo ya, no hasta que entre: así todos tienen dónde caer al encender.
  for (const real of reales) {
    if (gemelos[real.id] !== undefined) continue;
    const nuevo = await crearGemelo(tx, origenId, espejoId, real.id);
    if (nuevo !== null) gemelos[real.id] = nuevo;
  }
  return gemelos;
}

/** Que el dueño general pueda pasar al espejo con la misma concesión que a sus modelos. */
async function concederElEspejo(
  tx: Transaccion,
  origenId: string,
  espejoId: string,
  gemelos: Readonly<Record<string, string>>,
): Promise<void> {
  const valores = await valoresDe(tx, origenId);
  const general = valores['presentacion_dueno_empleo'];
  const destinos = valores['presentacion_destinos'];
  if (typeof general !== 'string' || !Array.isArray(destinos)) return;
  const gemelo = gemelos[general];
  if (gemelo === undefined) return;
  const yaEsta = destinos.some(
    (d) => registro(d)?.['empleoId'] === gemelo && registro(d)?.['organizacionId'] === espejoId,
  );
  if (yaEsta) return;
  await mezclar(tx, origenId, {
    presentacion_destinos: [
      ...(destinos as unknown[]),
      { empleoId: gemelo, organizacionId: espejoId },
    ],
  });
}

/**
 * EL ESPEJO, listo para encenderse. Idempotente: si ya existe y está preparado no hace nada;
 * si quedó a medias (la siembra falló), la repite entera.
 */
export async function asegurarEspejo(
  origenId: string,
  duenoOrigenId: string,
): Promise<{ readonly espejoId: string; readonly creado: boolean }> {
  const fase = await conTransaccion(async (tx) => {
    await bloquear(tx, origenId);
    const valores = await valoresDe(tx, origenId);
    if (espejoDe(valores) !== null)
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esto ya es una presentación.');
    const org = await tx
      .selectFrom('organizaciones')
      .select(['giro', 'activa'])
      .where('id', '=', origenId)
      .executeTakeFirst();
    if (org?.activa !== true || org.giro !== 'restaurante')
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'El modo presentación es del restaurante.');
    const modo = modoDePresentacion(valores);
    if (modo.espejoId !== null) {
      const espejo = await tx
        .selectFrom('organizaciones')
        .select('id')
        .where('id', '=', modo.espejoId)
        .executeTakeFirst();
      if (espejo !== undefined) {
        const preparado = (await valoresDe(tx, modo.espejoId))['presentacion_preparado'] === true;
        return { espejoId: modo.espejoId, creado: false, preparado };
      }
    }
    const creado = await crearEspejo(tx, origenId, duenoOrigenId);
    return { espejoId: creado.espejoId, creado: true, preparado: false };
  });
  if (fase.preparado) return { espejoId: fase.espejoId, creado: false };

  // La siembra del restaurante: la MISMA máquina que repone la demostración (catálogo,
  // recetas, equipo, sala, proveedor) sobre el espejo, con el ámbito del gemelo del dueño.
  const ambito = await conTransaccion((tx) =>
    ambitoDelDuenoEnElEspejo(tx, fase.espejoId, duenoOrigenId),
  );
  const siembra = await comando(resetearDemo, {
    entrada: { confirmacion: 'RESETEAR', espejo: true },
    ambito,
    idempotencyKey: randomUUID(),
  });
  if (!siembra.ok)
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `No se pudo preparar la presentación: ${siembra.error.mensaje}`,
    );

  await conTransaccion(async (tx) => {
    await bloquear(tx, origenId);
    const gemelos = await emparejarPersonal(tx, origenId, fase.espejoId);
    await copiarDelReal(tx, origenId, fase.espejoId, gemelos);
    await concederElEspejo(tx, origenId, fase.espejoId, gemelos);
    await mezclar(tx, fase.espejoId, {
      presentacion_preparado: true,
      presentacion_historial: { dias: [] },
    });
  });
  return { espejoId: fase.espejoId, creado: fase.creado };
}

/** Enciende o apaga el modo. Las dos llaves cambian juntas o ninguna. */
export async function cambiarModoDePresentacion(origenId: string, activo: boolean): Promise<void> {
  await conTransaccion(async (tx) => {
    await bloquear(tx, origenId);
    const modo = modoDePresentacion(await valoresDe(tx, origenId));
    if (modo.espejoId === null) {
      if (!activo) return;
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Prepara la presentación antes de encenderla.',
      );
    }
    if (activo && (await valoresDe(tx, modo.espejoId))['presentacion_preparado'] !== true)
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La presentación todavía se está preparando.',
      );
    await mezclar(tx, origenId, { presentacion_modo: { espejoId: modo.espejoId, activo } });
    await mezclar(tx, modo.espejoId, { presentacion_activa: activo });
    await tx
      .insertInto('auditoria')
      .values({
        organizacion_id: origenId,
        accion: activo ? 'presentacion.encender' : 'presentacion.apagar',
        entidad: 'organizacion',
        entidad_id: modo.espejoId,
        payload: JSON.stringify({ espejoId: modo.espejoId }),
      })
      .execute();
  });
}

/**
 * El gemelo en el espejo de alguien del real, si el real está EN presentación. Lo crea si
 * todavía no tiene (alguien dado de alta después de preparar), bajo el mismo candado.
 */
export async function gemeloEnPresentacion(
  origenId: string,
  empleoOrigenId: string,
): Promise<Gemelo | null> {
  const lectura = await conTransaccion(async (tx) => {
    const modo = modoDePresentacion(await valoresDe(tx, origenId));
    return modo.activo ? modo.espejoId : null;
  });
  if (lectura === null) return null;
  const espejoId = lectura;
  return conTransaccion(async (tx) => {
    await bloquear(tx, origenId);
    let gemeloId: string | null = gemelosDe(await valoresDe(tx, espejoId))[empleoOrigenId] ?? null;
    const vivo =
      gemeloId !== null &&
      (await tx
        .selectFrom('empleos')
        .select('id')
        .where('id', '=', gemeloId)
        .where('organizacion_id', '=', espejoId)
        .where('activo', '=', true)
        .executeTakeFirst()) !== undefined;
    if (!vivo) gemeloId = await crearGemelo(tx, origenId, espejoId, empleoOrigenId);
    if (gemeloId === null) return null;
    // El dueño general entra delegado: su gemelo tiene que estar en su concesión aunque la
    // presentación la haya preparado otro dueño.
    await concederElEspejo(tx, origenId, espejoId, { [empleoOrigenId]: gemeloId });
    const fila = await tx
      .selectFrom('empleos')
      .innerJoin('identidades', 'identidades.persona_id', 'empleos.persona_id')
      .select(['identidades.id as identidadId', 'empleos.sucursal_id as sucursalId'])
      .where('empleos.id', '=', gemeloId)
      .where('empleos.organizacion_id', '=', espejoId)
      .where('empleos.activo', '=', true)
      .where('identidades.activa', '=', true)
      .executeTakeFirst();
    if (fila === undefined) return null;
    return {
      espejoId,
      empleoId: gemeloId,
      identidadId: fila.identidadId,
      sucursalId: fila.sucursalId,
    };
  });
}

/**
 * La terminal del navegador EN EL ESPEJO, con la misma identidad de dispositivo que en el
 * real: la fila del espejo lleva el mismo hash. Así entrar y salir de la presentación no
 * cambia la cookie del dispositivo, y la caja abierta del real sigue siendo de esa terminal
 * cuando se vuelve a él.
 */
async function terminalEnElEspejo(
  deviceToken: string,
  pimienta: string,
  secreto: string,
  origenId: string,
  gemelo: Gemelo,
  ahora: Date,
): Promise<{ readonly terminalId: string | null; readonly deviceToken: string | null }> {
  const yaEsta = await terminalPorToken(deviceToken, pimienta, gemelo.espejoId);
  if (yaEsta !== null) return { terminalId: yaEsta.terminalId, deviceToken: null };
  if (gemelo.sucursalId === null) return { terminalId: null, deviceToken: null };
  const sucursalReal = await obtenerDb()
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', origenId)
    .where('activa', '=', true)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  const real = await resolverTerminal(
    {
      empleoId: gemelo.empleoId,
      organizacionId: origenId,
      pin: '',
      deviceToken,
      pimienta,
      secretoSesion: secreto,
    },
    sucursalReal?.id ?? null,
    ahora,
  );
  if (real.terminalId === null) return { terminalId: null, deviceToken: null };
  const realId = real.terminalId;
  const sucursalId = gemelo.sucursalId;
  const terminalId = await conTransaccion(async (tx) => {
    const fila = await tx
      .selectFrom('terminales')
      .select(['nombre', 'device_token_hash'])
      .where('id', '=', realId)
      .executeTakeFirstOrThrow();
    // Con el MISMO nombre que en el real, que es el que la cajera ve en los avisos de caja;
    // el sufijo sólo si ese nombre ya está tomado en la presentación.
    const terminal = (nombre: string) => ({
      organizacion_id: gemelo.espejoId,
      sucursal_id: sucursalId,
      nombre,
      device_token_hash: fila.device_token_hash,
      enrolada_en: ahora,
      ultima_actividad: ahora,
      activa: true,
    });
    const igual = await tx
      .insertInto('terminales')
      .values(terminal(fila.nombre))
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    const nueva =
      igual ??
      (await tx
        .insertInto('terminales')
        .values(terminal(`${fila.nombre} · ${randomBytes(2).toString('hex')}`))
        .returning('id')
        .executeTakeFirstOrThrow());
    return nueva.id;
  });
  return { terminalId, deviceToken: real.deviceToken };
}

export interface SesionEnElEspejo {
  readonly token: string;
  readonly maxEdadSegundos: number;
  readonly deviceToken: string | null;
  readonly organizacionId: string;
  readonly empleoId: string;
}

/**
 * Abre la sesión del gemelo en el espejo. Con `presentador` —el dueño general— es una sesión
 * delegada, como la de «Modelos de negocio»: depende de su sesión raíz y de su concesión.
 */
export async function abrirSesionEnElEspejo(peticion: {
  readonly origenId: string;
  readonly gemelo: Gemelo;
  readonly deviceToken: string;
  readonly pimienta: string;
  readonly secreto: string;
  readonly presentador?: CargaSesion;
}): Promise<SesionEnElEspejo> {
  const ahora = new Date();
  const terminal = await terminalEnElEspejo(
    peticion.deviceToken,
    peticion.pimienta,
    peticion.secreto,
    peticion.origenId,
    peticion.gemelo,
    ahora,
  );
  const sid = nuevoIdDeSesion();
  const exp =
    peticion.presentador?.exp ?? Math.floor(ahora.getTime() / 1000) + DURACION_SESION_SEGUNDOS;
  await conTransaccion(async (tx) => {
    await repoSesion.crearSesion(tx, {
      sid,
      organizacionId: peticion.gemelo.espejoId,
      empleoId: peticion.gemelo.empleoId,
      creadaEn: ahora,
      expiraEn: new Date(exp * 1000),
    });
    await tx
      .insertInto('auditoria')
      .values({
        organizacion_id: peticion.gemelo.espejoId,
        identidad_id: peticion.gemelo.identidadId,
        terminal_id: terminal.terminalId,
        accion: 'presentacion.entrar',
        entidad: 'organizacion',
        entidad_id: peticion.gemelo.espejoId,
        payload: JSON.stringify({ origen: peticion.origenId }),
      })
      .execute();
  });
  const presentador = peticion.presentador;
  const token = firmarSesion(
    {
      sid,
      identidadId: peticion.gemelo.identidadId,
      empleoId: peticion.gemelo.empleoId,
      terminalId: terminal.terminalId,
      exp,
      ...(presentador === undefined
        ? {}
        : {
            presentador: {
              sid: presentador.sid,
              identidadId: presentador.identidadId,
              empleoId: presentador.empleoId,
              terminalId: presentador.terminalId,
            },
          }),
    },
    peticion.secreto,
  );
  return {
    token,
    maxEdadSegundos: DURACION_SESION_SEGUNDOS,
    deviceToken: terminal.deviceToken,
    organizacionId: peticion.gemelo.espejoId,
    empleoId: peticion.gemelo.empleoId,
  };
}

/**
 * EL HISTORIAL DEL ESPEJO, por tramos: los treinta días que terminan AYER (hora de México), de
 * `maxDias` en `maxDias`. Idempotente por día (`sembrarHistorialDePresentacion`): llamarlo otra
 * vez, desde otro dispositivo o al día siguiente sólo siembra lo que falta de la ventana.
 */
export async function prepararHistorial(
  origenId: string,
  maxDias: number,
): Promise<{ readonly sembrados: number; readonly pendientes: number }> {
  const { modo } = await estadoDePresentacion(origenId);
  if (modo.espejoId === null)
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Prepara la presentación antes de sembrarla.');
  const ayer = sumarDias(diaDeInstante(new Date(), ZONA_DEL_HISTORIAL), -1);
  const resultado = await sembrarHistorialDePresentacion({
    organizacionId: modo.espejoId,
    hastaDia: ayer,
    dias: DIAS_DE_HISTORIAL,
    maxDiasPorLlamada: maxDias,
  });
  return {
    sembrados: resultado.sembrados.length + resultado.yaExistian.length,
    pendientes: resultado.pendientes.length,
  };
}

/** Los días que enseña la presentación. */
const DIAS_DE_HISTORIAL = 30;
