import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { z } from 'zod';

import { cerrarAvisosDeLaMesa } from './avisos-de-la-mesa.ts';
import { esViolacionDeUnicidad } from './datos.ts';
import type { entradaAbrirMesa } from './esquemas.ts';
import { sellarTransicionDeMesa } from './sala-escrituras.ts';

/**
 * Las escrituras de `abrir_mesa` y `liberar_mesa`.
 *
 * Viven aparte de los comandos para que en `mesas.ts` se lea la REGLA —que sólo
 * una mesa libre se abre, que una cuenta sin cobrar no se libera— sin que la
 * tape el SQL que la cumple.
 */

/** Los índices que la base puede hacer saltar al abrir una mesa (F1-04 §35.5). */
const INDICES_DE_MESA_OCUPADA = ['ordenes_una_activa_por_mesa', 'mesas_una_orden_activa'] as const;

/** Los estados de orden desde los que la cuenta ya no se debe (F1-04 §6.6). */
export const ORDEN_YA_CERRADA = ['pagada', 'cancelada'] as const;

/**
 * Los estados de una PARTE de una cuenta dividida que ya no esperan cobro: cobrada —aunque
 * después se haya devuelto— o cancelada. Cualquier otro la deja viva, y mientras haya una
 * viva la mesa sigue ocupada.
 */
const PARTE_SALDADA = ['pagada', 'parcialmente_reembolsada', 'reembolsada', 'cancelada'] as const;

/**
 * Cuántas partes de una cuenta dividida siguen sin cobrar. `excepto` deja fuera la que se
 * está cobrando ahora mismo: la transacción del cobro todavía no la ha marcado pagada.
 */
export async function partesSinSaldar(
  tx: Transaccion,
  organizacionId: string,
  madreId: string,
  excepto?: string,
): Promise<number> {
  const vivas = await tx
    .selectFrom('ordenes')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('orden_padre_id', '=', madreId)
    .where('estado', 'not in', [...PARTE_SALDADA])
    .execute();
  return vivas.filter((parte) => parte.id !== excepto).length;
}

interface DatosDeApertura {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly terminalId: string | null;
  readonly empleoId: string;
  readonly mesaId: string;
  readonly entrada: z.infer<typeof entradaAbrirMesa>;
}

export async function crearOrdenDeMesa(tx: Transaccion, datos: DatosDeApertura): Promise<string> {
  const { entrada } = datos;
  try {
    const fila = await tx
      .insertInto('ordenes')
      .values({
        organizacion_id: datos.organizacionId,
        sucursal_id: datos.sucursalId,
        terminal_id: datos.terminalId,
        mesa_id: datos.mesaId,
        empleado_atiende_id: datos.empleoId,
        estado: 'borrador',
        // Los dos ejes de F1-04 §6.5: por dónde entró y cómo se entrega.
        estrategia_captura: 'mesa',
        estrategia_cumplimiento: 'preparacion',
        personas: entrada.personas,
        cliente_nombre: vacioANulo(entrada.clienteNombre),
        notas: vacioANulo(entrada.notas),
        notas_alergias: vacioANulo(entrada.notasAlergias),
        celebracion_especial: entrada.celebracionEspecial,
        tipo_celebracion: entrada.celebracionEspecial ? vacioANulo(entrada.tipoCelebracion) : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return fila.id;
  } catch (error) {
    // Dos meseros abriendo la misma mesa a la vez: el segundo INSERT choca con
    // `ordenes_una_activa_por_mesa`. Traducirlo es lo que hace que al mesero le
    // llegue «esa mesa ya está abierta» y no un 500 sin explicación.
    if (esViolacionDeUnicidad(error, INDICES_DE_MESA_OCUPADA)) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        'Esa mesa ya está abierta: alguien se te adelantó por un segundo. Ábrela desde su cuenta.',
      );
    }
    throw error;
  }
}

interface DatosDeAtadura {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly mesaId: string;
  readonly ordenId: string;
  readonly empleoId: string;
  readonly estadoAnterior: string;
  readonly tomarLaAtencion: boolean;
  readonly ahora: Date;
  readonly entrada: z.infer<typeof entradaAbrirMesa>;
}

export async function atarMesaAOrden(tx: Transaccion, datos: DatosDeAtadura): Promise<void> {
  const { entrada, estadoAnterior } = datos;
  const resultado = await tx
    .updateTable('mesas')
    .set({
      estado: 'esperando_orden',
      orden_activa_id: datos.ordenId,
      personas_actuales: entrada.personas,
      cliente_temporal: vacioANulo(entrada.clienteNombre),
      notas_alergias: vacioANulo(entrada.notasAlergias),
      celebracion_especial: entrada.celebracionEspecial,
      tipo_celebracion: entrada.celebracionEspecial ? vacioANulo(entrada.tipoCelebracion) : null,
      ...(datos.tomarLaAtencion ? { empleado_atiende_id: datos.empleoId } : {}),
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.mesaId)
    // El `where` no es decoración: es lo que hace que dos aperturas concurrentes
    // no se pisen. La segunda actualiza cero filas y revierte su transacción.
    .where('estado', '=', 'libre')
    .where('orden_activa_id', 'is', null)
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'MESA_YA_ABIERTA',
      'Esa mesa dejó de estar libre mientras se abría. Vuelve a intentarlo.',
    );
  }

  await sellarTransicionDeMesa(tx, {
    organizacionId: datos.organizacionId,
    sucursalId: datos.sucursalId,
    mesaId: datos.mesaId,
    ordenId: datos.ordenId,
    estadoAnterior,
    estadoNuevo: 'esperando_orden',
    personas: entrada.personas,
    empleadoId: datos.empleoId,
    ahora: datos.ahora,
  });
}

/** ¿Consumió algo esta cuenta? Una fila basta: no hace falta contarlas todas. */
export async function tieneLineas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<boolean> {
  const fila = await tx
    .selectFrom('orden_lineas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    // F-324 · Una cuenta cuyas líneas se anularon TODAS no tiene nada que
    // cobrar, así que su mesa se libera como la de una cuenta vacía. Sin este
    // filtro la mesa quedaría fuera de servicio esperando un cobro de $0.
    .where('anulada_en', 'is', null)
    .executeTakeFirst();

  return fila !== undefined;
}

export interface DatosDeCancelacion {
  readonly organizacionId: string;
  readonly ordenId: string;
  /** Va a `motivo_cancelacion`: el `check` lo exige y el corte lo lee. */
  readonly motivo: string;
  readonly empleoId: string;
  readonly ahora: Date;
}

/**
 * Cierra la orden como `cancelada`. Devuelve cuántas filas cambió.
 *
 * Devuelve el número en vez de lanzar porque los dos que la usan fallan con
 * códigos distintos: liberar una mesa que cambió es `MESA_NO_LIBERABLE`, y
 * cancelar una cuenta que otro acaba de cobrar es `ORDEN_NO_EDITABLE`. Cero
 * filas significa siempre lo mismo —alguien la cerró primero— pero no significa
 * lo mismo para quien está mirando la pantalla.
 *
 * El `where estado not in ('pagada','cancelada')` es lo que hace que cancelar y
 * cobrar a la vez no se pisen: el segundo cambia cero filas y revierte.
 */
export async function cerrarOrdenCancelada(
  tx: Transaccion,
  datos: DatosDeCancelacion,
): Promise<number> {
  const resultado = await tx
    .updateTable('ordenes')
    .set({
      estado: 'cancelada',
      // Los `check` de la tabla exigen las columnas juntas:
      // `orden_cancelada_con_motivo` y `orden_cerrada_con_fecha`.
      motivo_cancelacion: datos.motivo,
      cancelada_en: datos.ahora,
      cancelada_por: datos.empleoId,
      cerrada_en: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .where('estado', 'not in', [...ORDEN_YA_CERRADA])
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}

export async function cancelarOrdenVacia(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  empleoId: string,
  ahora: Date,
): Promise<void> {
  const filas = await cerrarOrdenCancelada(tx, {
    organizacionId,
    ordenId,
    motivo: 'Mesa liberada sin consumo',
    empleoId,
    ahora,
  });

  if (filas !== 1) {
    throw new ErrorDominio(
      'MESA_NO_LIBERABLE',
      'La cuenta de esa mesa cambió mientras se liberaba. Vuelve a intentarlo.',
    );
  }
}

export interface SelloDeLiberacion {
  readonly sucursalId: string;
  readonly estadoAnterior: string;
  readonly empleoId: string;
  readonly ahora: Date;
}

/**
 * Devuelve la mesa al servicio y SELLA la transición.
 *
 * El sello no es opcional a propósito. Un ledger al que se le olvida una
 * liberación no deja un hueco: fusiona ese ciclo con el siguiente y da una
 * ocupación del doble de larga, que es peor que no tener el dato (F-305).
 */
export async function limpiarMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  sello: SelloDeLiberacion,
): Promise<void> {
  await tx
    .updateTable('mesas')
    .set({
      estado: 'libre',
      orden_activa_id: null,
      personas_actuales: 0,
      // F-305 · El reloj de ocupación se para aquí. Dejarlo puesto haría que la
      // siguiente mesa que se sentara heredara el inicio de la anterior y que
      // la rotación saliera peor de lo que es.
      ocupada_desde: null,
      cliente_temporal: null,
      // Datos del comensal anterior: se van con él (`Mesero.jsx:234-241`).
      notas_alergias: null,
      celebracion_especial: false,
      tipo_celebracion: null,
      // `empleado_asignado_id` NO se toca: la asignación de mesero es
      // configuración de la sala, no del comensal que acaba de irse.
      empleado_atiende_id: null,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .execute();

  // Los avisos del comensal que se fue se van con él: ver `avisos-de-la-mesa.ts`.
  await cerrarAvisosDeLaMesa(tx, organizacionId, mesaId, sello.ahora);

  await sellarTransicionDeMesa(tx, {
    organizacionId,
    sucursalId: sello.sucursalId,
    mesaId,
    ordenId: null,
    estadoAnterior: sello.estadoAnterior,
    estadoNuevo: 'libre',
    empleadoId: sello.empleoId,
    ahora: sello.ahora,
  });
}

/**
 * LA MESA DE UNA CUENTA COBRADA PASA A LIMPIEZA.
 *
 * ── El defecto que esto arregla ───────────────────────────────────────────
 * La pantalla de cobro dice, con estas palabras: «Cobrado · cambio $X · la mesa
 * pasa sola a limpieza». No pasaba. `venta.cobrar` no tocaba `mesas`, así que una
 * mesa cobrada se quedaba en `cuenta_solicitada` con su orden ya `pagada`:
 *
 *   · el mapa de mesas enseñaba «la cuenta está pedida» sobre una cuenta pagada,
 *   · y `restaurante.abrir_mesa` contestaba «la mesa 1 ya está abierta» para
 *     siempre, así que **esa mesa no volvía al servicio** hasta que alguien
 *     recordara pulsar «mesa limpia» sin ninguna señal de que hacía falta.
 *
 * Medido: dos corridas del recorrido de restaurante sobre la misma demostración,
 * y la segunda no podía sentar a nadie en la mesa 1.
 *
 * ── Por qué a LIMPIEZA y no a LIBRE ──────────────────────────────────────
 * Porque la mesa no está lista: hay platos encima. `limpieza` es el estado que
 * `sala-escrituras` ya impide sentar, y volverla `libre` aquí sentaría a la
 * siguiente pareja sobre la mesa sin recoger. El paso de limpieza a libre lo da
 * quien limpia, con `restaurante.liberar_mesa` —el botón «mesa limpia»—, y desde
 * una orden ya `pagada` ese comando pasa sin más: `ORDEN_YA_CERRADA` la incluye.
 *
 * `orden_activa_id` NO se borra: es lo que deja saber de qué cuenta viene la mesa
 * mientras se recoge, y es lo que `liberar_mesa` lee para no cancelar nada.
 *
 * ── Una cuenta DIVIDIDA recoge su mesa con la ÚLTIMA parte ────────────────
 * Cada parte se cobra por separado y ninguna es la cuenta activa de la mesa —lo es la madre,
 * que quedó `dividida`—. Sin esto la mesa de una cuenta dividida se quedaba ocupada para
 * siempre aunque todas sus partes estuvieran cobradas, y quien la liberaba a mano cancelaba
 * la madre como «mesa liberada sin consumo» (ver `liberarMesa`). La mesa pasa a limpieza
 * cuando se cobra la última parte viva, y ninguna antes: mientras quede una, hay gente
 * sentada esperando su cuenta.
 *
 * Devuelve la mesa que cambió, o `null` cuando la orden no era de ninguna mesa
 * —una venta de mostrador, que es la mayoría—.
 */
export async function pasarMesaCobradaALimpieza(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  quien: { readonly empleoId: string; readonly ahora: Date },
): Promise<{ readonly mesaId: string; readonly numero: number } | null> {
  const encontrada = await mesaDeLaCuenta(tx, organizacionId, ordenId);
  if (encontrada === undefined) return null;
  const { mesa, cuentaDeLaMesa } = encontrada;
  // Ya está: cobrar dos veces la misma cuenta no puede pasar, pero un reintento
  // idempotente sí, y el segundo no es un error ni una transición nueva.
  if (mesa.estado === 'limpieza' || mesa.estado === 'libre') {
    return { mesaId: mesa.id, numero: mesa.numero };
  }

  await tx
    .updateTable('mesas')
    .set({ estado: 'limpieza' })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesa.id)
    .execute();

  // El sello, igual que en la liberación: un ledger al que se le olvida una
  // transición fusiona dos ciclos y da una ocupación del doble de larga (F-305).
  await sellarTransicionDeMesa(tx, {
    organizacionId,
    sucursalId: mesa.sucursalId,
    mesaId: mesa.id,
    // La cuenta de la MESA —en una división, la madre—, que es la que el ledger de la mesa
    // conoce desde que se abrió.
    ordenId: cuentaDeLaMesa,
    estadoAnterior: mesa.estado,
    estadoNuevo: 'limpieza',
    empleadoId: quien.empleoId,
    ahora: quien.ahora,
  });

  // Si era la principal de un grupo, el grupo entero se recoge con ella.
  await cerrarElGrupoDeLaMesa(tx, organizacionId, mesa.id, {
    estado: 'limpieza',
    ordenId: cuentaDeLaMesa,
    empleoId: quien.empleoId,
    ahora: quien.ahora,
  });

  return { mesaId: mesa.id, numero: mesa.numero };
}

/**
 * UN GRUPO DE MESAS UNIDAS SE VA JUNTO (cierre del restaurante, 21-10).
 *
 * El grupo se cobra —o se cancela— en la cuenta de la PRINCIPAL, y las mesas miembro no la
 * tienen: `unirMesas` les quita `orden_activa_id` para que nadie comande en la 5 mientras el
 * grupo se cobra en la 4. Por eso el cobro sólo encontraba a la principal: las demás se
 * quedaban en «Pedido enviado» con la cuenta ya pagada, y «mesa limpia» las rechazaba por ser
 * de un grupo que nadie cerraba (separar existe, pero ninguna pantalla lo ofrece al cobrar).
 *
 * Aquí el grupo se CIERRA con su cuenta y cada miembro sigue a la principal: a `limpieza` si
 * se cobró —hay platos encima; «mesa limpia» la libera—, a `libre` si se canceló. Cada una con
 * su sello en el ledger. Sin grupo abierto no hace nada. Devuelve cuántas mesas miembro tenía.
 */
export async function cerrarElGrupoDeLaMesa(
  tx: Transaccion,
  organizacionId: string,
  principalId: string,
  destino: {
    readonly estado: 'limpieza' | 'libre';
    readonly ordenId: string;
    readonly empleoId: string;
    readonly ahora: Date;
  },
): Promise<number> {
  const union = await tx
    .selectFrom('uniones_mesa')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('mesa_principal_id', '=', principalId)
    .where('cerrada_en', 'is', null)
    .executeTakeFirst();
  if (union === undefined) return 0;

  const miembros = await tx
    .selectFrom('union_mesa_miembros')
    .innerJoin('mesas', 'mesas.id', 'union_mesa_miembros.mesa_id')
    .select(['mesas.id as id', 'mesas.estado as estado', 'mesas.sucursal_id as sucursalId'])
    .where('union_mesa_miembros.union_id', '=', union.id)
    .where('mesas.organizacion_id', '=', organizacionId)
    .execute();

  for (const miembro of miembros) {
    if (miembro.estado === destino.estado || miembro.estado === 'libre') continue;
    if (destino.estado === 'libre') {
      await limpiarMesa(tx, organizacionId, miembro.id, {
        sucursalId: miembro.sucursalId,
        estadoAnterior: miembro.estado,
        empleoId: destino.empleoId,
        ahora: destino.ahora,
      });
      continue;
    }
    await tx
      .updateTable('mesas')
      .set({ estado: 'limpieza' })
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', miembro.id)
      .execute();
    await sellarTransicionDeMesa(tx, {
      organizacionId,
      sucursalId: miembro.sucursalId,
      mesaId: miembro.id,
      ordenId: destino.ordenId,
      estadoAnterior: miembro.estado,
      estadoNuevo: 'limpieza',
      empleadoId: destino.empleoId,
      ahora: destino.ahora,
    });
  }

  // Cerrar la unión dispara el trigger que apaga `union_abierta` en los miembros: vuelven a
  // poder unirse a otro grupo, y «mesa limpia» deja de rechazarlas.
  await tx
    .updateTable('uniones_mesa')
    .set({ cerrada_en: destino.ahora, empleado_cierra_id: destino.empleoId })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', union.id)
    .where('cerrada_en', 'is', null)
    .execute();
  return miembros.length;
}

interface MesaDeUnaCuenta {
  readonly mesa: {
    readonly id: string;
    readonly numero: number;
    readonly estado: string;
    readonly sucursalId: string;
  };
  /** La cuenta que la mesa tiene por activa: la misma que se cobró, o la madre de la parte. */
  readonly cuentaDeLaMesa: string;
}

/**
 * La mesa a la que pertenece una cuenta que se acaba de cobrar, si la recoge este cobro.
 *
 * Es la que la tiene por `orden_activa_id`. Una parte de una cuenta dividida no lo es de
 * ninguna mesa —las hijas nacen sin ella—: su mesa es la de su madre, y sólo se recoge si no
 * queda otra parte por cobrar (la que se está cobrando no cuenta: su transacción todavía no
 * la ha marcado pagada).
 */
async function mesaDeLaCuenta(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<MesaDeUnaCuenta | undefined> {
  const columnas = ['id', 'numero', 'estado', 'sucursal_id as sucursalId'] as const;

  const propia = await tx
    .selectFrom('mesas')
    .select(columnas)
    .where('organizacion_id', '=', organizacionId)
    .where('orden_activa_id', '=', ordenId)
    .executeTakeFirst();
  if (propia !== undefined) return { mesa: propia, cuentaDeLaMesa: ordenId };

  const cuenta = await tx
    .selectFrom('ordenes')
    .select('orden_padre_id as madreId')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .executeTakeFirst();
  const madreId = cuenta?.madreId ?? null;
  if (madreId === null) return undefined;
  // El candado de la guarda (cierre del 21-10): dos cajas cobrando a la vez las dos últimas
  // partes se veían vivas la una a la otra y ninguna recogía la mesa. Hoy no pasa sólo porque
  // el folio serializa los cobros de la sucursal; con la madre tomada, el segundo cobro espera
  // al primero y cuenta las partes ya confirmadas, sea cual sea el folio.
  await tx
    .selectFrom('ordenes')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', madreId)
    .forUpdate()
    .execute();
  if ((await partesSinSaldar(tx, organizacionId, madreId, ordenId)) > 0) return undefined;

  const deLaMadre = await tx
    .selectFrom('mesas')
    .select(columnas)
    .where('organizacion_id', '=', organizacionId)
    .where('orden_activa_id', '=', madreId)
    .executeTakeFirst();
  return deLaMadre === undefined ? undefined : { mesa: deLaMadre, cuentaDeLaMesa: madreId };
}

/** El frontend manda cadenas vacías donde la base quiere `null` (F1-04 §0.1). */
function vacioANulo(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}
