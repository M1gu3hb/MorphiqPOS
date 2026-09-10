import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

import { mesaOperable } from './datos.ts';
import type { Movimiento } from './transiciones.ts';

/**
 * Los avisos del comensal y la asignación de mesero (E7-3, lado del PERSONAL).
 *
 * `portal/solicitudes.ts` es el otro extremo: el comensal crea el aviso desde
 * su teléfono, sin sesión. Aquí está lo que el personal hace con él —atenderlo,
 * resolverlo, cancelarlo, limpiar el historial— y la asignación de la mesa.
 *
 * ── El defecto que se cierra: la atribución viajaba en el cuerpo ───────────
 * `SolicitudesQRTab.jsx:114` (y sus gemelos `SolicitudesQRPanel.jsx:80` y
 * `SolicitudesQRCardList.jsx:79`) mandan esto desde el navegador:
 *
 *     await api.entidades.SolicitudQR.update(s.id, {
 *       estado: 'atendida',
 *       fecha_atendida: ahora,           // reloj del navegador
 *       atendido_por_id: posUser?.id,    // quien llama elige a quién acredita
 *       atendido_por_nombre: posUser?.nombre,
 *     });
 *
 * Con eso cualquiera se atribuye el trabajo de otro —o se lo endosa— desde la
 * consola del navegador. Y la fecha es la del dispositivo: un teléfono con la
 * hora mal puesta escribe una atención en el futuro.
 *
 * Aquí `atendido_por_id` NO SE ACEPTA. No es disciplina: el esquema de entrada
 * no lo declara y `validar()` corre en modo `strict()`, así que mandarlo es un
 * `ENTRADA_INVALIDA`. El empleo sale de `ctx.ambito`, que arma `resolverSesion`
 * desde una cookie firmada y releída de la base en cada petición, y la fecha
 * sale de `ctx.ahora`, que es el reloj del servidor.
 *
 * `atendido_por_nombre` ni siquiera es una columna: el puente lo DERIVA de
 * `empleados_visibles.nombre` al leer (`puente/mapa.ts:941`). Aceptarlo del
 * cliente creaba una segunda copia del nombre que envejecía sola.
 *
 * ── Lo que este módulo NO toca ─────────────────────────────────────────────
 * Ni la mesa ni la venta. Que el comensal pida la cuenta mueve la mesa a
 * `cuenta_solicitada`, y eso ya lo hace `portal.pedir_cuenta` cuando el aviso
 * NACE. Atenderlo es acusar recibo, no cobrar.
 */

/** Mesero en adelante. Los mismos cinco de `mesas.ts` (E6-2). */
const ROLES_DE_SALA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Quién puede borrarlo TODO. Mismo par que el mantenimiento reversible (F1-07 §4.3). */
const ROLES_DE_ADMINISTRACION = ['dueno', 'administrador'] as const;

// ────────────────────────────────────────── las entradas, sin ámbito ni dinero

export const entradaAtenderSolicitud = z.object({
  solicitudId: z.uuid(),
  /**
   * `pendiente` NO está, igual que `nuevo` no está en `entradaTransicionarPedido`.
   * Es el estado con el que nace el aviso, y volver a él sería el retroceso que
   * la monotonía existe para impedir. Además reabriría el hueco que cerró el
   * índice único parcial `solicitudes_qr_una_pendiente` (046 §35.11): dos avisos
   * pendientes del mismo tipo en la misma mesa, que es el D-17 del portal.
   */
  estado: z.enum(['atendida', 'resuelta', 'cancelada']),
});

/**
 * Los dos comandos de limpieza no llevan campos, y eso es deliberado.
 *
 * Había uno solo, con `alcance: 'antiguas' | 'todas'`, y el estrechamiento de
 * `todas` a dueño y administrador vivía DENTRO del cuerpo. Funcionaba y quedaba
 * auditado, pero el contrato publicado —el que genera `pnpm docs:comandos` y el
 * que F1.5 va a sembrar en `permisos_rol` (`definicion.ts:60`)— decía que un
 * mesero podía vaciar el historial entero. Un permiso que sólo existe dentro de
 * una función no es un permiso declarado: es un comentario con suerte.
 *
 * Partido en dos, la lista de roles ES la regla, la comprueba el envoltorio
 * antes de tocar la base (`comando.ts:98`) y el rechazo queda igual de auditado
 * (`comando.ts:99`).
 */
export const entradaLimpiarSolicitudes = z.object({});
export const entradaVaciarSolicitudes = z.object({});

export const entradaAsignarMesero = z.object({
  mesaId: z.uuid(),
});

// ──────────────────────────────────────── la tabla de transiciones del aviso

export const ESTADOS_SOLICITUD = ['pendiente', 'atendida', 'resuelta', 'cancelada'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Los dos estados en los que el aviso ya no es trabajo vivo. */
const ESTADOS_SOLICITUD_CERRADOS = ['resuelta', 'cancelada'] as const;

/**
 * Qué puede seguir a qué. Monotónica, como la de comandas (`transiciones.ts`).
 *
 * Los saltos hacia adelante se admiten —el mesero que ya llevó la cuenta marca
 * «resuelta» sin pasar por «atendida»—; los saltos hacia atrás no existen. Un
 * toque que se quedó en la red y llega tarde pidiendo `atendida` sobre un aviso
 * ya resuelto NO lo devuelve a la lista de pendientes del compañero.
 *
 * Ninguna lista contiene `pendiente`: eso es lo que hace que este comando no
 * pueda chocar nunca contra `solicitudes_qr_una_pendiente`.
 */
const TRANSICIONES_SOLICITUD: Readonly<Record<EstadoSolicitud, readonly EstadoSolicitud[]>> = {
  pendiente: ['atendida', 'resuelta', 'cancelada'],
  atendida: ['resuelta', 'cancelada'],
  resuelta: [],
  cancelada: [],
};

export function esTransicionDeSolicitudValida(
  desde: EstadoSolicitud,
  hacia: EstadoSolicitud,
): boolean {
  return TRANSICIONES_SOLICITUD[desde].includes(hacia);
}

/**
 * Evalúa el cambio pedido. Lanza si retrocede; `sin_cambio` no es un error.
 *
 * Dos meseros tocando «atendida» sobre el mismo aviso describen el mismo hecho,
 * y fallarle al segundo sería ruido en la pantalla de alguien que hizo bien su
 * trabajo.
 */
export function evaluarSolicitud(desde: EstadoSolicitud, hacia: EstadoSolicitud): Movimiento {
  if (desde === hacia) return { tipo: 'sin_cambio' };
  if (esTransicionDeSolicitudValida(desde, hacia)) return { tipo: 'avanza' };
  throw new ErrorDominio(
    'TRANSICION_INVALIDA',
    `Esa solicitud está en "${desde}" y ya no puede pasar a "${hacia}".`,
    { desde, hacia },
  );
}

// ─────────────────────────────────────────────────────── lecturas y escrituras

interface SolicitudDelPersonal {
  readonly id: string;
  readonly estado: EstadoSolicitud;
  readonly tipo: string;
  readonly mesaId: string;
  readonly atendidaEn: Date | null;
  readonly resueltaEn: Date | null;
  readonly empleadoAtiendeId: string | null;
}

/**
 * El aviso, o el error de que ya no existe.
 *
 * El filtro por organización va SIEMPRE, aunque el id sea un uuid: sin él,
 * conocer un id ajeno basta para mover el aviso de otro negocio.
 *
 */
async function solicitudPorId(
  tx: Transaccion,
  organizacionId: string,
  solicitudId: string,
): Promise<SolicitudDelPersonal> {
  const fila = await tx
    .selectFrom('solicitudes_qr')
    .select([
      'id',
      'estado',
      'tipo',
      'mesa_id as mesaId',
      'atendida_en as atendidaEn',
      'resuelta_en as resueltaEn',
      'empleado_atiende_id as empleadoAtiendeId',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', solicitudId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio(
      'SOLICITUD_NO_ENCONTRADA',
      'Ese aviso ya no está en la lista. Actualiza la pantalla.',
    );
  }

  return { ...fila, estado: fila.estado as EstadoSolicitud };
}

interface DatosDelMovimiento {
  readonly organizacionId: string;
  readonly solicitudId: string;
  readonly desde: EstadoSolicitud;
  readonly hacia: EstadoSolicitud;
  readonly atendidaEn: Date | null;
  readonly resueltaEn: Date | null;
  readonly empleadoAtiendeId: string | null;
}

/** Mueve el aviso. Devuelve cuántas filas cambió: cero es una carrera perdida. */
async function moverSolicitud(tx: Transaccion, datos: DatosDelMovimiento): Promise<number> {
  const resultado = await tx
    .updateTable('solicitudes_qr')
    .set({
      estado: datos.hacia,
      atendida_en: datos.atendidaEn,
      resuelta_en: datos.resueltaEn,
      empleado_atiende_id: datos.empleadoAtiendeId,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.solicitudId)
    // El `where estado = <el que leímos>` no es decoración: es lo que hace que
    // dos pantallas de mesero abiertas a la vez no se pisen. La segunda cambia
    // cero filas y revierte, en vez de sobrescribir lo que decidió la primera.
    // `updated_at` no se escribe: lo pone el trigger `tocar_updated_at` (045).
    .where('estado', '=', datos.desde)
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}

// ────────────────────────────────────────── 1 · restaurante.atender_solicitud

export interface ResultadoAtenderSolicitud {
  readonly solicitudId: string;
  readonly estado: EstadoSolicitud;
  readonly estadoAnterior: EstadoSolicitud;
  /** El empleo al que queda acreditado el trabajo. De la sesión, no del cuerpo. */
  readonly atendidaPorId: string | null;
}

export const atenderSolicitud = definirComando<
  Transaccion,
  typeof entradaAtenderSolicitud,
  ResultadoAtenderSolicitud
>({
  nombre: 'restaurante.atender_solicitud',
  entidad: 'solicitud_qr',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaAtenderSolicitud,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const solicitud = await ctx.paso('cargar_solicitud', () =>
      solicitudPorId(ctx.tx, organizacionId, entrada.solicitudId),
    );

    // Lanza TRANSICION_INVALIDA si el destino retrocede o si el aviso ya estaba
    // cerrado. Es la LECTURA QUE DECIDE, y va antes de escribir nada.
    const movimiento = evaluarSolicitud(solicitud.estado, entrada.estado);

    if (movimiento.tipo === 'sin_cambio') {
      ctx.auditar({
        entidadId: solicitud.id,
        payload: { estado: solicitud.estado, tipo: solicitud.tipo, sinCambio: true },
      });
      return {
        solicitudId: solicitud.id,
        estado: solicitud.estado,
        estadoAnterior: solicitud.estado,
        atendidaPorId: solicitud.empleadoAtiendeId,
      };
    }

    const atribucion = atribuir(solicitud, entrada.estado, empleoId, ctx.ahora);

    const filas = await ctx.paso('mover_solicitud', () =>
      moverSolicitud(ctx.tx, {
        organizacionId,
        solicitudId: solicitud.id,
        desde: solicitud.estado,
        hacia: entrada.estado,
        ...atribucion,
      }),
    );

    if (filas !== 1) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Un compañero movió ese aviso mientras lo atendías. Actualiza la pantalla.',
        { desde: solicitud.estado, hacia: entrada.estado },
      );
    }

    ctx.auditar({
      entidadId: solicitud.id,
      payload: {
        de: solicitud.estado,
        a: entrada.estado,
        tipo: solicitud.tipo,
        mesaId: solicitud.mesaId,
        // Queda constancia de a quién se acreditó: es el dato que hoy elige el
        // navegador y el que después nadie puede reconstruir.
        atendidaPorId: atribucion.empleadoAtiendeId,
      },
    });

    return {
      solicitudId: solicitud.id,
      estado: entrada.estado,
      estadoAnterior: solicitud.estado,
      atendidaPorId: atribucion.empleadoAtiendeId,
    };
  },
});

interface Atribucion {
  readonly atendidaEn: Date | null;
  readonly resueltaEn: Date | null;
  readonly empleadoAtiendeId: string | null;
}

/**
 * Quién se lleva el crédito y con qué fechas. Todo del servidor.
 *
 *   · Quien lo tomó primero lo conserva. Es la regla de `SolicitudesQRTab:119`
 *     (`s.atendido_por_id || posUser?.id`), que allí es una preferencia del
 *     cliente —revocable desde la consola— y aquí es la única forma de que salga.
 *   · Cancelar NO atribuye: descartar un aviso no es atenderlo, y acreditárselo
 *     a quien lo descarta inflaría su trabajo del turno. Quién canceló queda en
 *     la auditoría, que es donde va el actor de cualquier comando.
 *   · Las fechas son `ctx.ahora`, el reloj del servidor, y se ponen UNA vez: la
 *     hora de atención no se reescribe al resolver.
 */
function atribuir(
  solicitud: SolicitudDelPersonal,
  destino: EstadoSolicitud,
  empleoId: string,
  ahora: Date,
): Atribucion {
  if (destino === 'cancelada') {
    return {
      atendidaEn: solicitud.atendidaEn,
      resueltaEn: solicitud.resueltaEn,
      empleadoAtiendeId: solicitud.empleadoAtiendeId,
    };
  }

  return {
    atendidaEn: solicitud.atendidaEn ?? ahora,
    resueltaEn: destino === 'resuelta' ? (solicitud.resueltaEn ?? ahora) : solicitud.resueltaEn,
    empleadoAtiendeId: solicitud.empleadoAtiendeId ?? empleoId,
  };
}

// ───────────────────────────────────────── 2 · restaurante.limpiar_solicitudes

/**
 * Cuántas horas lleva cerrado un aviso para contar como antiguo. Un día.
 *
 * Su `cleanupOldSolicitudes` cortaba por `hora_inicio_dia_operativo` leyendo la
 * configuración EN EL NAVEGADOR, y borraba también las PENDIENTES: el aviso que
 * nadie atendió desaparecía sin que quedara constancia de que nadie lo atendió.
 * Aquí sólo se van las cerradas.
 */
const HORAS_PARA_CONSIDERARLA_ANTIGUA = 24;
const MILISEGUNDOS_POR_HORA = 3_600_000;

export interface ResultadoLimpiarSolicitudes {
  readonly alcance: 'antiguas' | 'todas';
  /** Las que la base dice que borró. No un contador de intentos. */
  readonly borradas: number;
}

/**
 * Borra el historial de avisos en UNA sentencia (E7-3).
 *
 * ── El bucle que sustituye ─────────────────────────────────────────────────
 * `SolicitudesQRTab.jsx:73` baja 500 solicitudes al navegador y las borra una
 * por una dentro de un `try { … } catch {}` VACÍO, incrementando `borradas`
 * sólo en el camino feliz. Si falla la número 200 nadie se entera: la pantalla
 * dice «Solicitudes borradas: 199», las 301 restantes se quedan a medio camino
 * y no hay transacción que revertir.
 *
 * Aquí es un `delete` con `where`, dentro de la transacción del comando: o se
 * borran todas o no se borra ninguna, y el número que devuelve es
 * `numDeletedRows` —lo que la base borró de verdad—, que es el que la pantalla
 * enseña.
 */
export const limpiarSolicitudes = definirComando<
  Transaccion,
  typeof entradaLimpiarSolicitudes,
  ResultadoLimpiarSolicitudes
>({
  nombre: 'restaurante.limpiar_solicitudes',
  entidad: 'solicitud_qr',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaLimpiarSolicitudes,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;

    const borradas = await ctx.paso('borrar_solicitudes', () =>
      borrarSolicitudes(ctx.tx, organizacionId, 'antiguas', ctx.ahora),
    );

    ctx.auditar({
      entidadId: null,
      payload: { alcance: 'antiguas', borradas, horas: HORAS_PARA_CONSIDERARLA_ANTIGUA },
    });

    return { alcance: 'antiguas', borradas };
  },
});

/**
 * Vaciarlo TODO, incluido lo de hoy y lo pendiente (E7-3).
 *
 * Eso no es limpiar: es borrar. Por eso es un comando aparte y no un campo del
 * anterior — un `alcance: 'todas'` metía a mesero, cajero y gerente en la lista
 * declarada de un comando que se lleva el historial entero del negocio.
 *
 * NO pide la frase de confirmación de `mantenimiento/confirmacion.ts`, y es una
 * decisión, no un olvido: esto borra avisos de «llamar al mesero», no ventas ni
 * cortes ni inventario —lo dice su propio diálogo, «No se tocan ventas, mesas,
 * pedidos ni cortes»— y su pantalla resuelve hoy con un `confirm()` del
 * navegador (`SolicitudesQRTab.jsx:65`). Exigir aquí el nombre del negocio le
 * cambiaría la pantalla a Miguel para proteger algo que no tiene ese peso.
 */
export const vaciarSolicitudes = definirComando<
  Transaccion,
  typeof entradaVaciarSolicitudes,
  ResultadoLimpiarSolicitudes
>({
  nombre: 'restaurante.vaciar_solicitudes',
  entidad: 'solicitud_qr',
  escribe: true,
  roles: [...ROLES_DE_ADMINISTRACION],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaVaciarSolicitudes,
  async ejecutar(ctx) {
    const { organizacionId } = ctx.ambito;

    const borradas = await ctx.paso('borrar_solicitudes', () =>
      borrarSolicitudes(ctx.tx, organizacionId, 'todas', ctx.ahora),
    );

    ctx.auditar({ entidadId: null, payload: { alcance: 'todas', borradas } });

    return { alcance: 'todas', borradas };
  },
});

/**
 * Un solo `delete`, siempre acotado por organización.
 *
 * El corte por antigüedad mira `created_at` —cuándo lo pidió el comensal— y no
 * la fecha de cierre, porque una solicitud `cancelada` puede no tener ninguna:
 * el DDL sólo declara `atendida_en` y `resuelta_en` (045:411).
 */
async function borrarSolicitudes(
  tx: Transaccion,
  organizacionId: string,
  alcance: 'antiguas' | 'todas',
  ahora: Date,
): Promise<number> {
  let consulta = tx.deleteFrom('solicitudes_qr').where('organizacion_id', '=', organizacionId);

  if (alcance === 'antiguas') {
    const corte = new Date(
      ahora.getTime() - HORAS_PARA_CONSIDERARLA_ANTIGUA * MILISEGUNDOS_POR_HORA,
    );
    // `atendida` NO entra: sigue siendo trabajo en curso —el filtro «activas»
    // de la pantalla la cuenta como viva (`SolicitudesQRTab.jsx:101`)— y
    // limpiar no puede llevarse lo que alguien está haciendo.
    consulta = consulta
      .where('estado', 'in', [...ESTADOS_SOLICITUD_CERRADOS])
      .where('created_at', '<', corte);
  }

  const resultado = await consulta.executeTakeFirst();
  return Number(resultado.numDeletedRows);
}

// ──────────────────────────────────────────── 3 · restaurante.asignar_mesero

export interface ResultadoAsignarMesero {
  readonly mesaId: string;
  readonly mesaNumero: number;
  readonly atendidaPorId: string;
  /** `true` cuando ya era suya: dos toques al botón son el mismo hecho. */
  readonly yaEraTuya: boolean;
}

/**
 * El mesero toma la mesa (E6-2, modo SIN asignación de sala).
 *
 * `Mesero.jsx:364-367` escribe `atendido_por_id`, `atendido_por_nombre` y
 * `atendido_por_color` desde el navegador, en una llamada suelta con
 * `.catch(() => {})` encima. Tres problemas en tres líneas: la atribución la
 * elige quien llama, el nombre se duplica en una columna que envejece, y si la
 * escritura falla no se entera nadie.
 *
 * ── Por qué esto no puede robar una mesa ──────────────────────────────────
 * El `update` lleva `where empleado_atiende_id is null`. Dos meseros pulsando a
 * la vez: el primero cambia una fila, el segundo cambia cero y se va con un
 * mensaje que lo dice. No hay lectura-y-luego-escritura entre las que quepa
 * otro dispositivo.
 *
 * `empleado_asignado_id` NO se toca: ésa es la asignación de sala que configura
 * el gerente (`MesaEditDialog.jsx`), otra columna y otra decisión.
 */
export const asignarMesero = definirComando<
  Transaccion,
  typeof entradaAsignarMesero,
  ResultadoAsignarMesero
>({
  nombre: 'restaurante.asignar_mesero',
  entidad: 'mesa',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaAsignarMesero,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const mesa = await ctx.paso('cargar_mesa', () =>
      mesaOperable(ctx.tx, organizacionId, entrada.mesaId),
    );

    // Ya era suya: el segundo toque describe el mismo hecho y no es un error.
    if (mesa.empleadoAtiendeId === empleoId) {
      ctx.auditar({ entidadId: mesa.id, payload: { mesaNumero: mesa.numero, yaEraTuya: true } });
      return { mesaId: mesa.id, mesaNumero: mesa.numero, atendidaPorId: empleoId, yaEraTuya: true };
    }

    if (mesa.empleadoAtiendeId !== null) {
      // Quién la atiende ya lo enseña la pantalla: el puente deriva
      // `atendido_por_nombre` del join con `empleados_visibles`. Repetirlo aquí
      // sería una segunda consulta para decir lo que ya está en la tarjeta.
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `La mesa ${mesa.numero} ya la atiende otro compañero. Pídesela a él o al gerente.`,
        { mesaNumero: mesa.numero },
      );
    }

    const filas = await ctx.paso('tomar_mesa', () =>
      tomarLaMesa(ctx.tx, organizacionId, mesa.id, empleoId),
    );

    if (filas !== 1) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Otro compañero tomó la mesa ${mesa.numero} un segundo antes. Actualiza la pantalla.`,
        { mesaNumero: mesa.numero },
      );
    }

    ctx.auditar({
      entidadId: mesa.id,
      payload: { mesaNumero: mesa.numero, atendidaPorId: empleoId, yaEraTuya: false },
    });

    return { mesaId: mesa.id, mesaNumero: mesa.numero, atendidaPorId: empleoId, yaEraTuya: false };
  },
});

/**
 * Toma la atención de la mesa si nadie la tiene. Devuelve cuántas filas cambió.
 *
 * El color no se guarda: no existe columna para él. `atendido_por_color` es un
 * DERIVADO del puente que sale de `empleos.color` y, cuando está vacío, de
 * `colorDePersona(id)` (`puente/consultar.ts:339`). Es presentación, la calcula
 * el servidor al leer, y guardarla aquí crearía una tercera copia del mismo
 * dato —la del navegador, la de la columna y la del empleo— que se desincronizan
 * en cuanto el gerente le cambie el color a alguien.
 */
async function tomarLaMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  empleoId: string,
): Promise<number> {
  const resultado = await tx
    .updateTable('mesas')
    .set({ empleado_atiende_id: empleoId })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    // La guarda que impide el robo. Sin ella, entre la lectura de arriba y esta
    // escritura cabe otro mesero, otra pestaña y otro dispositivo.
    .where('empleado_atiende_id', 'is', null)
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}
