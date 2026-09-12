import { esErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { crearComando } from '../comando.ts';
import { validar } from '../errores.ts';
import { crearFabrica, ejecutorDeProduccion } from '../pruebas/dobles.ts';
import type { RepositorioComandos } from '../repositorio.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import { actualizacion } from './pruebas/constructor-falso.ts';
import { ambitoDe, mesa, EMPLEO, MESA_5, ORG, PREDETERMINADOS } from './pruebas/sala.ts';
import {
  asignarMesero,
  atenderSolicitud,
  entradaAsignarMesero,
  entradaAtenderSolicitud,
  entradaLimpiarSolicitudes,
  entradaVaciarSolicitudes,
  esTransicionDeSolicitudValida,
  evaluarSolicitud,
  limpiarSolicitudes,
  vaciarSolicitudes,
  ESTADOS_SOLICITUD,
  type EstadoSolicitud,
} from './solicitudes.ts';

/**
 * Las pruebas del lado del PERSONAL del portal QR (E7-3) y de la asignación de
 * mesero (E6-2).
 *
 * Las cuatro que exige el encargo, y ninguna de adorno:
 *
 *   · el camino feliz de los tres comandos;
 *   · el rechazo por rol —cocina no toca la sala, y un mesero no vacía el
 *     historial del negocio—;
 *   · la idempotencia: dos llamadas con la misma clave, un solo borrado;
 *   · el caso que la base impide —una solicitud resuelta no vuelve a
 *     pendiente— comprobando que falla con NUESTRO mensaje.
 */

const AHORA = new Date('2026-09-10T21:00:00.000Z');
/** Hace tres horas: cerrada, pero todavía del turno de hoy. */
const RECIENTE = new Date('2026-09-10T18:00:00.000Z');
/** Anteayer: cerrada y pasada de las 24 horas. */
const VIEJA = new Date('2026-09-08T21:00:00.000Z');

const SOLICITUD = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
const OTRA_SOLICITUD = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
const OTRO_EMPLEO = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e';
const OTRA_ORG = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const CLAVE = 'clave-de-limpieza-0001';

const baseDe = (datos: TablasFalsas) => crearBaseFalsa(datos, { predeterminados: PREDETERMINADOS });

/** Una solicitud QR con los NOMBRES DE COLUMNA reales, como la siembra `sala.ts`. */
function solicitud(estado: string, cambios: Fila = {}): Fila {
  return {
    id: SOLICITUD,
    organizacion_id: ORG,
    mesa_id: MESA_5,
    orden_id: null,
    tipo: 'ayuda',
    estado,
    atendida_en: null,
    resuelta_en: null,
    empleado_atiende_id: null,
    empleado_destino_id: null,
    ruteo_modo: 'general',
    origen: 'portal_qr',
    created_at: RECIENTE,
    ...cambios,
  };
}

/**
 * Mete a OTRO usuario justo entre la lectura del comando y su escritura.
 *
 * Es la única forma honesta de probar un `where` de guarda anti-carrera. La
 * prueba que había sustituía `updateTable` entero por `actualizacion([])`, que
 * devuelve cero filas PASE LO QUE PASE: eso comprueba el manejo de
 * `filas !== 1`, no la cláusula. Quitando `.where('empleado_atiende_id','is',
 * null)` del código real, aquella prueba seguía verde.
 *
 * Aquí la escritura interferente pasa por la MISMA base falsa, así que la fila
 * cambia de verdad y es el `where` del comando —y sólo él— el que decide si
 * encuentra algo. Si alguien lo borra, esta prueba se pone roja.
 */
function conInterferencia(tx: Transaccion, interferir: () => Promise<unknown>): Transaccion {
  let pendiente = true;

  const envolver = (objeto: unknown): unknown => {
    if (typeof objeto !== 'object' || objeto === null) return objeto;
    return new Proxy(objeto as Record<string, unknown>, {
      get(destino, prop, receptor) {
        const valor: unknown = Reflect.get(destino, prop, receptor);
        if (typeof valor !== 'function') return valor;
        return (...args: unknown[]): unknown => {
          const salida: unknown = (valor as (...a: unknown[]) => unknown).apply(destino, args);
          if (salida instanceof Promise) {
            return salida.then(async (resultado: unknown) => {
              if (pendiente) {
                pendiente = false;
                await interferir();
              }
              return resultado;
            });
          }
          return envolver(salida);
        };
      },
    });
  };

  const original = tx as unknown as Record<string, unknown>;
  return {
    ...original,
    selectFrom: (tabla: string) =>
      envolver((original['selectFrom'] as (t: string) => unknown)(tabla)),
  } as unknown as Transaccion;
}

interface Fallo {
  readonly codigo: string;
  readonly mensaje: string;
}

async function falla(promesa: Promise<unknown>): Promise<Fallo> {
  try {
    await promesa;
    return { codigo: 'NO_LANZO', mensaje: '' };
  } catch (error) {
    return {
      codigo: esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`,
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * El ejecutor REAL de comandos, atado a una base falsa.
 *
 * `ejecutorDeProduccion` sólo sirve para los rechazos anteriores a la
 * transacción: su `conTransaccion` entrega un `TxFalsa` que no sabe consultar.
 * Aquí se conserva su contabilidad de idempotencia —la fila sólo se hace
 * visible al confirmar, igual que en Postgres— y se cambia únicamente la
 * transacción que recibe el cuerpo.
 *
 * El cambio de tipo del repositorio es el mismo de `pruebas/dobles.ts:192` y
 * por la misma razón: el envoltorio está parametrizado sobre el tipo de la
 * transacción y no hace nada con ella salvo pasarla.
 */
function ejecutorSobre(tx: Transaccion) {
  const fabrica = crearFabrica('restaurante_pro');
  const ejecutar = crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: <T>(fn: (transaccion: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(tx)),
    ahora: () => AHORA,
  });
  return { ejecutar, fabrica };
}

// ═════════════════════════════════════ la tabla de transiciones del aviso

describe('transiciones de una solicitud QR · monotónicas como las de comanda', () => {
  const VALIDAS: readonly (readonly [EstadoSolicitud, EstadoSolicitud])[] = [
    ['pendiente', 'atendida'],
    // El mesero que ya llevó la cuenta marca «resuelta» sin pasar por «atendida».
    ['pendiente', 'resuelta'],
    ['pendiente', 'cancelada'],
    ['atendida', 'resuelta'],
    ['atendida', 'cancelada'],
  ];

  const INVALIDAS: readonly (readonly [EstadoSolicitud, EstadoSolicitud])[] = [
    // LA QUE IMPORTA: el toque que llega tarde no reabre el aviso del compañero.
    ['resuelta', 'atendida'],
    ['resuelta', 'pendiente'],
    ['resuelta', 'cancelada'],
    ['atendida', 'pendiente'],
    ['cancelada', 'pendiente'],
    ['cancelada', 'atendida'],
    ['cancelada', 'resuelta'],
  ];

  for (const [desde, hacia] of VALIDAS) {
    it(`admite ${desde} → ${hacia}`, () => {
      expect(esTransicionDeSolicitudValida(desde, hacia)).toBe(true);
      expect(evaluarSolicitud(desde, hacia)).toEqual({ tipo: 'avanza' });
    });
  }

  for (const [desde, hacia] of INVALIDAS) {
    it(`rechaza ${desde} → ${hacia} con TRANSICION_INVALIDA`, () => {
      expect(esTransicionDeSolicitudValida(desde, hacia)).toBe(false);
      expect(() => evaluarSolicitud(desde, hacia)).toThrow(/ya no puede pasar/i);
    });
  }

  it('pedir el estado que ya tiene no es un error: es el mismo hecho dos veces', () => {
    for (const estado of ESTADOS_SOLICITUD) {
      expect(evaluarSolicitud(estado, estado)).toEqual({ tipo: 'sin_cambio' });
    }
  });

  it('la tabla es completa: cada par es válido, inválido o sin cambio', () => {
    // Sin esto, añadir un quinto estado dejaría un hueco que nadie ve.
    const cubiertos = new Set([
      ...VALIDAS.map(([a, b]) => `${a}>${b}`),
      ...INVALIDAS.map(([a, b]) => `${a}>${b}`),
      ...ESTADOS_SOLICITUD.map((e) => `${e}>${e}`),
    ]);
    expect(cubiertos.size).toBe(ESTADOS_SOLICITUD.length * ESTADOS_SOLICITUD.length);
  });

  it('NINGUNA transición vuelve a «pendiente», ni por la entrada ni por la tabla', () => {
    // Es lo que impide chocar contra `solicitudes_qr_una_pendiente` (046 §35.11):
    // si un aviso pudiera regresar a pendiente, la mesa tendría dos del mismo
    // tipo y volvería el D-17 que el índice cerró.
    for (const desde of ESTADOS_SOLICITUD) {
      expect(esTransicionDeSolicitudValida(desde, 'pendiente')).toBe(false);
    }
    expect(
      entradaAtenderSolicitud.safeParse({ solicitudId: SOLICITUD, estado: 'pendiente' }).success,
    ).toBe(false);
  });
});

// ═══════════════════════════════════════ 1 · restaurante.atender_solicitud

describe('atender_solicitud · la atribución sale de la sesión', () => {
  it('camino feliz: pendiente → atendida, con el empleo y el reloj del SERVIDOR', async () => {
    const base = baseDe({ solicitudes_qr: [solicitud('pendiente')] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await atenderSolicitud.ejecutar(ctx, {
      solicitudId: SOLICITUD,
      estado: 'atendida',
    });

    expect(salida).toEqual({
      solicitudId: SOLICITUD,
      estado: 'atendida',
      estadoAnterior: 'pendiente',
      atendidaPorId: EMPLEO,
    });
    expect(base.campo('solicitudes_qr', 'estado')).toBe('atendida');
    // Ni el id ni la fecha vinieron del cuerpo: no había forma de mandarlos.
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBe(EMPLEO);
    expect(base.campo('solicitudes_qr', 'atendida_en')).toEqual(AHORA);
    expect(base.campo('solicitudes_qr', 'resuelta_en')).toBeNull();
  });

  it('resolver pone resuelta_en y conserva a quien la atendió primero', async () => {
    // El endoso al revés: quien resuelve NO se queda con el crédito del que
    // atendió. `SolicitudesQRTab.jsx:119` lo pide («s.atendido_por_id || …»),
    // pero allí es una preferencia del cliente y se puede cambiar en la consola.
    const base = baseDe({
      solicitudes_qr: [
        solicitud('atendida', { empleado_atiende_id: OTRO_EMPLEO, atendida_en: RECIENTE }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await atenderSolicitud.ejecutar(ctx, {
      solicitudId: SOLICITUD,
      estado: 'resuelta',
    });

    expect(salida.atendidaPorId).toBe(OTRO_EMPLEO);
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBe(OTRO_EMPLEO);
    // La hora de atención NO se reescribe: pasó cuando pasó.
    expect(base.campo('solicitudes_qr', 'atendida_en')).toEqual(RECIENTE);
    expect(base.campo('solicitudes_qr', 'resuelta_en')).toEqual(AHORA);
  });

  it('cancelar no acredita a nadie: descartar un aviso no es atenderlo', async () => {
    const base = baseDe({ solicitudes_qr: [solicitud('pendiente')] });
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await atenderSolicitud.ejecutar(ctx, { solicitudId: SOLICITUD, estado: 'cancelada' });

    expect(base.campo('solicitudes_qr', 'estado')).toBe('cancelada');
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBeNull();
    expect(base.campo('solicitudes_qr', 'atendida_en')).toBeNull();
    // Quién canceló no se pierde: va en la auditoría, con el actor del comando.
    expect(auditorias[0]?.payload).toMatchObject({ de: 'pendiente', a: 'cancelada' });
  });

  it('el cuerpo NO puede traer atendido_por_id ni fecha_atendida', async () => {
    // Ésta es la prueba del defecto. Se valida por el camino real —`validar()`,
    // que aplica `strict()`—, no por el esquema pelado: un `parse` normal
    // ignoraría las claves de más y las dejaría pasar hasta el `update`.
    const conAtaque = validar(atenderSolicitud.entrada, {
      solicitudId: SOLICITUD,
      estado: 'atendida',
      atendido_por_id: OTRO_EMPLEO,
      atendido_por_nombre: 'Quien no fue',
      fecha_atendida: '2020-01-01T00:00:00.000Z',
    });

    expect(conAtaque.ok).toBe(false);
    if (conAtaque.ok) return;
    expect(conAtaque.error.codigo).toBe('ENTRADA_INVALIDA');

    // Y el cuerpo legítimo sí pasa: una guarda que rechaza todo también
    // «pasaría» la afirmación de arriba.
    const limpia = validar(atenderSolicitud.entrada, {
      solicitudId: SOLICITUD,
      estado: 'atendida',
    });
    expect(limpia.ok).toBe(true);
    await Promise.resolve();
  });

  it('una solicitud resuelta no vuelve atrás, y lo dice en español', async () => {
    const base = baseDe({
      solicitudes_qr: [
        solicitud('resuelta', { empleado_atiende_id: OTRO_EMPLEO, resuelta_en: RECIENTE }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await falla(
      atenderSolicitud.ejecutar(ctx, { solicitudId: SOLICITUD, estado: 'atendida' }),
    );

    expect(fallo.codigo).toBe('TRANSICION_INVALIDA');
    expect(fallo.mensaje).toBe(
      'Esa solicitud está en "resuelta" y ya no puede pasar a "atendida".',
    );
    // Lo que NO puede llegar a la pantalla del mesero.
    expect(fallo.mensaje).not.toMatch(/23505|violates|constraint|null value|pg_/i);
    // Y la fila se queda como estaba: no hay escritura a medias.
    expect(base.campo('solicitudes_qr', 'estado')).toBe('resuelta');
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBe(OTRO_EMPLEO);
  });

  it('un aviso que ya no existe falla con un mensaje, no con un 500', async () => {
    const base = baseDe({ solicitudes_qr: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await falla(
      atenderSolicitud.ejecutar(ctx, { solicitudId: SOLICITUD, estado: 'atendida' }),
    );

    expect(fallo.mensaje).toMatch(/ya no está en la lista/i);
  });

  it('marcar dos veces atendida no reescribe nada', async () => {
    const base = baseDe({
      solicitudes_qr: [
        solicitud('atendida', { empleado_atiende_id: OTRO_EMPLEO, atendida_en: RECIENTE }),
      ],
    });
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await atenderSolicitud.ejecutar(ctx, {
      solicitudId: SOLICITUD,
      estado: 'atendida',
    });

    expect(salida.estado).toBe('atendida');
    expect(pasos).not.toContain('mover_solicitud');
    expect(base.campo('solicitudes_qr', 'atendida_en')).toEqual(RECIENTE);
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBe(OTRO_EMPLEO);
  });

  it('si otro lo movió entre la lectura y la escritura, se revierte con su mensaje', async () => {
    // El `where estado = <el que leímos>` del `update` encuentra cero filas.
    // Se modela sustituyendo SÓLO `updateTable` por uno sobre un arreglo vacío:
    // es exactamente lo que ve Postgres cuando la fila ya cambió de estado.
    const base = baseDe({ solicitudes_qr: [solicitud('pendiente')] });
    const txConCarreraPerdida = {
      ...(base.tx as unknown as Record<string, unknown>),
      updateTable: () => actualizacion([]),
    } as unknown as Transaccion;
    const { ctx } = contextoFalso(txConCarreraPerdida, ambitoDe('mesero'), AHORA);

    const fallo = await falla(
      atenderSolicitud.ejecutar(ctx, { solicitudId: SOLICITUD, estado: 'atendida' }),
    );

    expect(fallo.codigo).toBe('TRANSICION_INVALIDA');
    expect(fallo.mensaje).toMatch(/movió ese aviso mientras lo atendías/i);
  });
  it('una solicitud de OTRO negocio no existe para éste', async () => {
    // El filtro por organización de `solicitudPorId` es lo único que separa a
    // dos inquilinos aquí: el id es un uuid, pero conocerlo —de un enlace, de
    // un registro, de una captura— no puede bastar para mover el aviso de otro
    // restaurante. Sin esta prueba, quitar ese `where` no ponía nada en rojo.
    const base = baseDe({
      solicitudes_qr: [solicitud('pendiente', { organizacion_id: OTRA_ORG })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await falla(
      atenderSolicitud.ejecutar(ctx, { solicitudId: SOLICITUD, estado: 'atendida' }),
    );

    expect(fallo.codigo).toBe('SOLICITUD_NO_ENCONTRADA');
    // Y no la tocó: sigue pendiente en su propio negocio.
    expect(base.campo('solicitudes_qr', 'estado')).toBe('pendiente');
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBe(null);
  });

  it('dos meseros a la vez: el segundo no pisa lo que decidió el primero', async () => {
    // El aviso está `pendiente` cuando el comando lo LEE, y otro mesero lo
    // resuelve antes de que ESCRIBA. Lo único que lo salva es el
    // `where estado = <el que leímos>` de `moverSolicitud`.
    //
    // Nota sobre el `where organizacion_id` de ESA MISMA sentencia: es defensa
    // en profundidad y ninguna prueba puede distinguirlo, porque el `where id`
    // que lo acompaña ya es la clave primaria. Se deja dicho aquí en vez de
    // fingir que está cubierto.
    const base = baseDe({ solicitudes_qr: [solicitud('pendiente')] });
    const tx = conInterferencia(base.tx, () =>
      base.tx
        .updateTable('solicitudes_qr')
        .set({ estado: 'resuelta', resuelta_en: AHORA, empleado_atiende_id: OTRO_EMPLEO })
        .where('id', '=', SOLICITUD)
        .executeTakeFirst(),
    );
    const { ctx } = contextoFalso(tx, ambitoDe('mesero'), AHORA);

    const fallo = await falla(
      atenderSolicitud.ejecutar(ctx, { solicitudId: SOLICITUD, estado: 'atendida' }),
    );

    expect(fallo.codigo).not.toBe('NO_LANZO');
    // Lo que decidió el primero sigue en pie.
    expect(base.campo('solicitudes_qr', 'estado')).toBe('resuelta');
    expect(base.campo('solicitudes_qr', 'empleado_atiende_id')).toBe(OTRO_EMPLEO);
  });
});

describe('atender_solicitud · el rol se comprueba en el servidor', () => {
  it('cocina no atiende avisos de sala, y el rechazo llega antes de la base', async () => {
    // Sin base falsa a propósito: si el envoltorio dejara pasar el rol, el
    // cuerpo reventaría al consultar y la prueba no distinguiría un rechazo de
    // un accidente. Aquí el `TxFalsa` no sabe consultar: llegar ahí es fallar.
    const ejecutar = ejecutorDeProduccion('restaurante_pro');

    const salida = await ejecutar(atenderSolicitud, {
      entrada: { solicitudId: SOLICITUD, estado: 'atendida' },
      ambito: ambitoDe('cocina'),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
  });

  it('los cuatro comandos excluyen a cocina y a almacén, y exigen idempotencia', () => {
    for (const comando of [
      atenderSolicitud,
      limpiarSolicitudes,
      vaciarSolicitudes,
      asignarMesero,
    ]) {
      expect(comando.roles, comando.nombre).not.toContain('cocina');
      expect(comando.roles, comando.nombre).not.toContain('almacen');
      // `escribe: true` es lo que obliga a la clave de ocho caracteres (R10).
      expect(comando.escribe, comando.nombre).toBe(true);
    }
  });

  it('la lista declarada de cada comando ES su regla, sin estrechamientos ocultos', () => {
    // Los tres de sala llegan hasta el mesero.
    for (const comando of [atenderSolicitud, limpiarSolicitudes, asignarMesero]) {
      expect(comando.roles, comando.nombre).toContain('mesero');
    }

    // `vaciar` NO. Y esta es la prueba que faltaba: antes había un solo comando
    // con `alcance: 'antiguas' | 'todas'` cuya lista declarada incluía al
    // mesero, y el estrechamiento de `todas` vivía dentro del cuerpo. El
    // comportamiento era correcto, pero el contrato que publica
    // `pnpm docs:comandos` —y el que F1.5 sembrará en `permisos_rol`— decía que
    // un mesero podía vaciar el historial entero del negocio.
    expect(vaciarSolicitudes.roles).toEqual(['dueno', 'administrador']);
    expect(vaciarSolicitudes.roles).not.toContain('mesero');
    expect(vaciarSolicitudes.roles).not.toContain('cajero');
    expect(vaciarSolicitudes.roles).not.toContain('gerente');
  });
});

// ══════════════════════════════════════ 2 · restaurante.limpiar_solicitudes

interface FiltroLocal {
  readonly columna: string;
  readonly operador: string;
  readonly valor: unknown;
}

/**
 * Una base con `deleteFrom` que sabe comparar fechas.
 *
 * `pruebas/constructor-falso.ts` implementa `=`, `<>`, `in` y `not in`; el corte
 * por antigüedad necesita `<`. Ese archivo lo comparten los demás comandos de
 * restaurante y no se toca en esta tanda, así que aquí se modela sólo la ÚNICA
 * sentencia que `limpiar_solicitudes` emite. Que sea una sola es justamente lo
 * que se está probando.
 */
function baseDeBorrado(iniciales: readonly Fila[]) {
  const filas = iniciales.map((f) => ({ ...f }));

  const borrado = () => {
    const filtros: FiltroLocal[] = [];
    const constructor = {
      where(columna: string, operador: string, valor: unknown) {
        filtros.push({ columna, operador, valor });
        return constructor;
      },
      async executeTakeFirst() {
        const sobreviven = filas.filter((fila) => !filtros.every((f) => cumpleLocal(fila, f)));
        const borradas = filas.length - sobreviven.length;
        filas.splice(0, filas.length, ...sobreviven);
        return { numDeletedRows: BigInt(borradas) };
      },
    };
    return constructor;
  };

  return {
    tx: { deleteFrom: borrado } as unknown as Transaccion,
    ids: () => filas.map((f) => f['id']),
    cuantas: () => filas.length,
  };
}

function cumpleLocal(fila: Fila, filtro: FiltroLocal): boolean {
  const actual = fila[filtro.columna] ?? null;
  switch (filtro.operador) {
    case '=':
      return actual === filtro.valor;
    case 'in': {
      const lista: readonly unknown[] = Array.isArray(filtro.valor) ? filtro.valor : [];
      return lista.includes(actual);
    }
    case '<':
      return (
        actual instanceof Date &&
        filtro.valor instanceof Date &&
        actual.getTime() < filtro.valor.getTime()
      );
    default:
      throw new Error(`La base de esta prueba no modela el operador «${filtro.operador}».`);
  }
}

/** Seis avisos: dos borrables por antigüedad, tres vivos y uno de otro negocio. */
const HISTORIAL: readonly Fila[] = [
  solicitud('pendiente', { id: 'a1', created_at: VIEJA }),
  solicitud('atendida', { id: 'a2', created_at: VIEJA }),
  solicitud('resuelta', { id: 'a3', created_at: VIEJA }),
  solicitud('cancelada', { id: 'a4', created_at: VIEJA }),
  solicitud('resuelta', { id: 'a5', created_at: RECIENTE }),
  solicitud('resuelta', { id: 'a6', created_at: VIEJA, organizacion_id: OTRA_ORG }),
];

describe('limpiar_solicitudes · un solo delete y el conteo REAL', () => {
  it('«antiguas» se lleva las cerradas de ayer y respeta lo vivo y lo ajeno', async () => {
    const base = baseDeBorrado(HISTORIAL);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await limpiarSolicitudes.ejecutar(ctx, {});

    // El número sale de `numDeletedRows`, no de un contador de intentos como el
    // del bucle de `SolicitudesQRTab.jsx:73`.
    expect(salida).toEqual({ alcance: 'antiguas', borradas: 2 });
    // Sobreviven: la pendiente que nadie atendió, la atendida que sigue en
    // curso, la resuelta de hoy y la del otro negocio.
    expect(base.ids()).toEqual(['a1', 'a2', 'a5', 'a6']);
  });

  it('«todas» vacía el historial del negocio y sólo el suyo', async () => {
    const base = baseDeBorrado(HISTORIAL);
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await vaciarSolicitudes.ejecutar(ctx, {});

    expect(salida.borradas).toBe(5);
    expect(base.ids()).toEqual(['a6']);
    expect(auditorias[0]?.payload).toMatchObject({ alcance: 'todas', borradas: 5 });
  });

  it('un mesero NO puede vaciarlo todo, y el intento queda auditado', async () => {
    // Antes esto lo decidía un `if` dentro del cuerpo, y la lista declarada del
    // comando —la que publica `pnpm docs:comandos` y la que F1.5 sembrará en
    // `permisos_rol`— seguía diciendo que el mesero podía. Ahora `vaciar` es un
    // comando aparte con su propia lista, y quien rechaza es el envoltorio,
    // ANTES de tocar la base. Se ejecuta con el envoltorio entero justamente
    // para comprobar que el rechazo deja su fila de auditoría.
    const base = baseDeBorrado(HISTORIAL);
    const { ejecutar, fabrica } = ejecutorSobre(base.tx);

    const salida = await ejecutar(vaciarSolicitudes, {
      entrada: {},
      ambito: ambitoDe('mesero'),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
    expect(base.cuantas()).toBe(6);
    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
    expect(fabrica.auditoriaConfirmada()[0]?.payload).toMatchObject({
      resultado: 'denegado',
      codigo: 'SIN_PERMISO',
    });
  });

  it('ese mismo mesero SÍ puede limpiar las antiguas', async () => {
    // El contraste: una guarda que rechazara los dos alcances también «pasaría»
    // la prueba de arriba.
    const base = baseDeBorrado(HISTORIAL);
    const { ejecutar } = ejecutorSobre(base.tx);

    const salida = await ejecutar(limpiarSolicitudes, {
      entrada: {},
      ambito: ambitoDe('mesero'),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.datos).toEqual({ alcance: 'antiguas', borradas: 2 });
  });

  it('IDEMPOTENCIA: dos llamadas con la misma clave borran UNA vez', async () => {
    // Sin la clave, el segundo intento —un reintento de red, un doble clic—
    // devolvería «borradas: 0» y la pantalla diría que no había nada que
    // limpiar. Con ella, la segunda respuesta es la primera, tal cual.
    const base = baseDeBorrado(HISTORIAL);
    const { ejecutar } = ejecutorSobre(base.tx);
    const peticion = {
      entrada: {},
      ambito: ambitoDe('dueno'),
      idempotencyKey: CLAVE,
    };

    const primera = await ejecutar(vaciarSolicitudes, peticion);
    const restantes = base.cuantas();
    const segunda = await ejecutar(vaciarSolicitudes, peticion);

    expect(primera.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    if (!primera.ok || !segunda.ok) return;

    expect(primera.reintento).toBe(false);
    expect(segunda.reintento).toBe(true);
    expect(segunda.datos).toEqual(primera.datos);
    expect(segunda.datos.borradas).toBe(5);
    // El efecto ocurrió una sola vez: la segunda no volvió a tocar la base.
    expect(base.cuantas()).toBe(restantes);
  });

  it('sin clave de idempotencia no se borra nada', async () => {
    const base = baseDeBorrado(HISTORIAL);
    const { ejecutar } = ejecutorSobre(base.tx);

    const salida = await ejecutar(limpiarSolicitudes, {
      entrada: {},
      ambito: ambitoDe('dueno'),
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('IDEMPOTENCIA_REQUERIDA');
    expect(base.cuantas()).toBe(6);
  });
});

// ═════════════════════════════════════════ 3 · restaurante.asignar_mesero

describe('asignar_mesero · la mesa se toma, no se roba', () => {
  it('camino feliz: una mesa sin mesero queda con el empleo de la SESIÓN', async () => {
    const base = baseDe({
      mesas: [mesa('libre', { empleado_atiende_id: null, orden_activa_id: null })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await asignarMesero.ejecutar(ctx, { mesaId: MESA_5 });

    expect(salida).toEqual({
      mesaId: MESA_5,
      mesaNumero: 5,
      atendidaPorId: EMPLEO,
      yaEraTuya: false,
    });
    expect(base.campo('mesas', 'empleado_atiende_id')).toBe(EMPLEO);
  });

  it('no guarda el color ni toca la asignación de sala', async () => {
    // `Mesero.jsx:366` escribe `atendido_por_color` desde el navegador. Aquí el
    // color es presentación: lo deriva el puente al leer, de `empleos.color` o
    // de `colorDePersona(id)`. Guardarlo sería una tercera copia del mismo dato.
    const base = baseDe({
      mesas: [mesa('ocupada', { empleado_atiende_id: null, empleado_asignado_id: OTRO_EMPLEO })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await asignarMesero.ejecutar(ctx, { mesaId: MESA_5 });

    const fila = base.filas('mesas')[0];
    expect(Object.keys(fila ?? {})).not.toContain('atendido_por_color');
    expect(fila?.['empleado_asignado_id']).toBe(OTRO_EMPLEO);
  });

  it('si ya la atiende otro NO se la quita, y el mensaje lo explica', async () => {
    const base = baseDe({ mesas: [mesa('ocupada', { empleado_atiende_id: OTRO_EMPLEO })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await falla(asignarMesero.ejecutar(ctx, { mesaId: MESA_5 }));

    expect(fallo.codigo).toBe('TRANSICION_INVALIDA');
    expect(fallo.mensaje).toBe(
      'La mesa 5 ya la atiende otro compañero. Pídesela a él o al gerente.',
    );
    expect(base.campo('mesas', 'empleado_atiende_id')).toBe(OTRO_EMPLEO);
  });

  it('tocar dos veces el botón sobre tu propia mesa no es un error', async () => {
    const base = baseDe({ mesas: [mesa('ocupada', { empleado_atiende_id: EMPLEO })] });
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await asignarMesero.ejecutar(ctx, { mesaId: MESA_5 });

    expect(salida.yaEraTuya).toBe(true);
    expect(pasos).not.toContain('tomar_mesa');
  });

  it('una mesa dada de baja no se puede tomar', async () => {
    const base = baseDe({ mesas: [mesa('libre', { activa: false, empleado_atiende_id: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await falla(asignarMesero.ejecutar(ctx, { mesaId: MESA_5 }));

    expect(fallo.codigo).toBe('MESA_NO_ENCONTRADA');
  });

  it('dos meseros a la vez: el segundo cambia cero filas y se entera', async () => {
    // La mesa está libre cuando el comando la LEE, y otro mesero se la queda
    // antes de que ESCRIBA. Lo único que puede salvarla es el
    // `where empleado_atiende_id is null` de `tomarLaMesa`.
    const base = baseDe({
      mesas: [mesa('libre', { empleado_atiende_id: null, orden_activa_id: null })],
    });
    const tx = conInterferencia(base.tx, () =>
      base.tx
        .updateTable('mesas')
        .set({ empleado_atiende_id: OTRO_EMPLEO })
        .where('id', '=', MESA_5)
        .executeTakeFirst(),
    );
    const { ctx } = contextoFalso(tx, ambitoDe('mesero'), AHORA);

    const fallo = await falla(asignarMesero.ejecutar(ctx, { mesaId: MESA_5 }));

    expect(fallo.codigo).toBe('TRANSICION_INVALIDA');
    expect(fallo.mensaje).toMatch(/tomó la mesa 5 un segundo antes/i);
    // Y lo que importa de verdad: la mesa sigue siendo del que llegó primero.
    expect(base.campo('mesas', 'empleado_atiende_id')).toBe(OTRO_EMPLEO);
  });
});

// ══════════════════════════════════════════════ los contratos de la entrada

describe('ninguna de las tres entradas acepta ámbito, atribución ni dinero', () => {
  const PARECE_IMPORTE = /(centavos|precio|importe|monto|costo|subtotal|descuento|total)/i;
  const PARECE_AMBITO =
    /^(rol|roles|ambito|organizacion_?id|sucursal_?id|identidad_?id|empleo_?id|terminal_?id)$/i;
  /** La atribución del trabajo: es el defecto que estos comandos cierran. */
  const PARECE_ATRIBUCION = /^(atendido_por|atendida_por|usuario|user|pos_?user)/i;

  const ESQUEMAS = {
    atender_solicitud: entradaAtenderSolicitud,
    asignar_mesero: entradaAsignarMesero,
  } as const;

  for (const [nombre, esquema] of Object.entries(ESQUEMAS)) {
    it(`restaurante.${nombre} declara sólo lo que el cliente puede elegir`, () => {
      const claves = Object.keys(esquema.shape);
      expect(claves.length).toBeGreaterThan(0);
      expect(claves.filter((c) => PARECE_IMPORTE.test(c))).toEqual([]);
      expect(claves.filter((c) => PARECE_AMBITO.test(c))).toEqual([]);
      expect(claves.filter((c) => PARECE_ATRIBUCION.test(c))).toEqual([]);
    });
  }

  it('el detector reconoce una atribución cuando la hay', () => {
    // La prueba de la prueba: si el patrón dejara de encajar, lo de arriba
    // pasaría por vacío y no diría nada.
    expect(PARECE_ATRIBUCION.test('atendido_por_id')).toBe(true);
    expect(PARECE_ATRIBUCION.test('atendido_por_nombre')).toBe(true);
    expect(PARECE_ATRIBUCION.test('solicitudId')).toBe(false);
  });

  it('el id de la solicitud y el de la mesa tienen que ser uuid', () => {
    expect(
      entradaAtenderSolicitud.safeParse({ solicitudId: 'a3', estado: 'atendida' }).success,
    ).toBe(false);
    expect(entradaAsignarMesero.safeParse({ mesaId: 'la-de-siempre' }).success).toBe(false);
  });

  it('los dos comandos de limpieza no aceptan NINGUN campo, ni siquiera de adorno', () => {
    // Su entrada es `z.object({})` a propósito: el alcance ya no es un dato del
    // cliente, es la identidad del comando. Zod a secas ESTRIPARÍA `alcance` en
    // silencio, pero `validar()` aplica `estrictoSiEsObjeto` (`errores.ts:59`),
    // que es el camino real de una petición, y ahí un campo de más es un
    // ENTRADA_INVALIDA en vez de una intención tragada.
    for (const esquema of [entradaLimpiarSolicitudes, entradaVaciarSolicitudes]) {
      expect(validar(esquema, {}).ok).toBe(true);
      const conAlcance = validar(esquema, { alcance: 'todas' });
      expect(conAlcance.ok).toBe(false);
      if (conAlcance.ok) return;
      expect(conAlcance.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('otra solicitud de la misma mesa no comparte identidad con la primera', () => {
    // Guarda de las semillas: si `OTRA_SOLICITUD` fuera igual a `SOLICITUD`,
    // varias afirmaciones de arriba pasarían por accidente.
    expect(OTRA_SOLICITUD).not.toBe(SOLICITUD);
    expect(
      entradaAtenderSolicitud.safeParse({ solicitudId: OTRA_SOLICITUD, estado: 'resuelta' })
        .success,
    ).toBe(true);
  });
});
