import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

/**
 * Las escrituras que mueven una cuenta POR EL SALÓN: F-302 y F-303.
 *
 * ── Por qué aquí y no en `packages/data` ───────────────────────────────────
 * F-321 y F-324 dejaron su SQL en `packages/data/src/repos/ordenes` porque
 * tocan una sola familia de tablas. Éstas tocan cinco a la vez —`mesas`,
 * `ordenes`, `comandas`, `eventos_mesa` y `movimientos_cuenta`— y todas dentro
 * de la MISMA transacción. Repartirlas entre dos paquetes obligaría a leer dos
 * archivos para saber qué pasa cuando alguien se cambia de mesa, y es
 * exactamente el caso en que un paso que se olvida deja la mesa vieja ocupada
 * con una cuenta que ya no está ahí.
 *
 * `mesas-escrituras.ts`, su vecino, hace lo mismo con la apertura y el cierre.
 */

/** Registra una transición en el ledger de F-305. Inmutable: sólo se inserta. */
export async function registrarEventoMesa(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly sucursalId: string;
    readonly mesaId: string;
    readonly ordenId: string | null;
    readonly estadoAnterior: string | null;
    readonly estadoNuevo: string;
    readonly personas: number | null;
    readonly empleadoId: string | null;
    readonly ahora: Date;
  },
): Promise<void> {
  // Un evento que no mueve nada es ruido que ensuciaría la rotación: la 072 lo
  // prohíbe con un `check` y aquí se evita antes de llegar a él.
  if (datos.estadoAnterior === datos.estadoNuevo) return;

  await tx
    .insertInto('eventos_mesa')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.sucursalId,
      mesa_id: datos.mesaId,
      orden_id: datos.ordenId,
      estado_anterior: datos.estadoAnterior,
      estado_nuevo: datos.estadoNuevo,
      personas: datos.personas,
      empleado_id: datos.empleadoId,
      ocurrido_en: datos.ahora,
    })
    .execute();
}

export interface MesaEnSala {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly sucursalId: string;
  readonly ordenActivaId: string | null;
  readonly personas: number;
  readonly ocupadaDesde: Date | null;
  readonly empleadoAtiendeId: string | null;
  readonly clienteTemporal: string | null;
  readonly notasAlergias: string | null;
  readonly celebracionEspecial: boolean;
  readonly tipoCelebracion: string | null;
}

/** La mesa con TODO lo que viaja cuando el comensal se cambia de sitio. */
export async function mesaEnSala(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
): Promise<MesaEnSala> {
  const fila = await tx
    .selectFrom('mesas')
    .select([
      'id',
      'numero',
      'estado',
      'activa',
      'sucursal_id as sucursalId',
      'orden_activa_id as ordenActivaId',
      'personas_actuales as personas',
      'ocupada_desde as ocupadaDesde',
      'empleado_atiende_id as empleadoAtiendeId',
      'cliente_temporal as clienteTemporal',
      'notas_alergias as notasAlergias',
      'celebracion_especial as celebracionEspecial',
      'tipo_celebracion as tipoCelebracion',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .executeTakeFirst();

  if (fila?.activa !== true) {
    throw new ErrorDominio('MESA_NO_ENCONTRADA', 'Esa mesa no existe o está dada de baja.');
  }

  return {
    id: fila.id,
    numero: fila.numero,
    estado: fila.estado,
    sucursalId: fila.sucursalId,
    ordenActivaId: fila.ordenActivaId,
    personas: fila.personas,
    ocupadaDesde: fila.ocupadaDesde,
    empleadoAtiendeId: fila.empleadoAtiendeId,
    clienteTemporal: fila.clienteTemporal,
    notasAlergias: fila.notasAlergias,
    celebracionEspecial: fila.celebracionEspecial,
    tipoCelebracion: fila.tipoCelebracion,
  };
}

export interface DatosDeCambioDeMesa {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly origen: MesaEnSala;
  readonly destino: MesaEnSala;
  readonly empleadoId: string;
  readonly ahora: Date;
}

export interface CambioDeMesaEscrito {
  readonly comandasReapuntadas: number;
}

/**
 * F-303 · La cuenta se muda de mesa, y todo lo suyo se muda con ella.
 *
 * ── Lo que se rompía sin esto ──────────────────────────────────────────────
 * «Nos pasamos a la terraza» obligaba a cerrar la cuenta y reabrirla. La
 * comanda ya enviada seguía apuntando a la mesa vieja, así que cocina sacaba el
 * plato a un lugar vacío mientras la gente esperaba a cuatro metros.
 *
 * ── La ocupación NO se reinicia ────────────────────────────────────────────
 * `ocupada_desde` viaja con la cuenta. Si el destino arrancara su reloj de
 * nuevo, F-305 contaría dos ocupaciones de veinte minutos donde hubo una de
 * cuarenta, y la rotación media del negocio saldría el doble de buena de lo que
 * es. Ese número es del que depende su decisión de poner más mesas.
 */
export async function cambiarDeMesa(
  tx: Transaccion,
  datos: DatosDeCambioDeMesa,
): Promise<CambioDeMesaEscrito> {
  const { origen, destino } = datos;

  // El destino tiene que estar REALMENTE libre. El `where` no es decoración:
  // es lo que hace que dos meseros que mueven cuentas distintas a la misma
  // terraza no acaben con dos cuentas vivas en una mesa. El segundo actualiza
  // cero filas y revierte.
  //
  // Son DOS columnas y cada una tapa un hueco distinto. `estado = 'libre'`
  // impide sentar a alguien sobre una mesa en limpieza, que está sin cuenta y
  // no está disponible. `orden_activa_id is null` impide mover la cuenta sobre
  // una mesa HUÉRFANA —libre pero apuntando todavía a una venta—, que es el
  // estado imposible que `detectarHuerfano` busca hoy con heurísticas.
  const tomada = await tx
    .updateTable('mesas')
    .set({
      estado: origen.estado,
      orden_activa_id: datos.ordenId,
      personas_actuales: origen.personas,
      ocupada_desde: origen.ocupadaDesde ?? datos.ahora,
      cliente_temporal: origen.clienteTemporal,
      notas_alergias: origen.notasAlergias,
      celebracion_especial: origen.celebracionEspecial,
      tipo_celebracion: origen.tipoCelebracion,
      empleado_atiende_id: origen.empleadoAtiendeId,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', destino.id)
    .where('estado', '=', 'libre')
    .where('orden_activa_id', 'is', null)
    .executeTakeFirst();

  if (Number(tomada.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'MESA_YA_ABIERTA',
      `La mesa ${destino.numero} dejó de estar libre mientras se movía la cuenta.`,
    );
  }

  await tx
    .updateTable('ordenes')
    .set({ mesa_id: destino.id, updated_at: datos.ahora })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .execute();

  // LA MITAD QUE NADIE SE ACUERDA DE HACER. Sin esto la comanda viva sigue
  // diciendo «mesa 4» y el plato sale a una mesa vacía.
  const comandas = await tx
    .updateTable('comandas')
    .set({ mesa_id: destino.id })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('orden_id', '=', datos.ordenId)
    .executeTakeFirst();

  await tx
    .updateTable('mesas')
    .set({
      estado: 'libre',
      orden_activa_id: null,
      personas_actuales: 0,
      ocupada_desde: null,
      cliente_temporal: null,
      notas_alergias: null,
      celebracion_especial: false,
      tipo_celebracion: null,
      empleado_atiende_id: null,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', origen.id)
    .execute();

  await registrarEventoMesa(tx, {
    organizacionId: datos.organizacionId,
    sucursalId: origen.sucursalId,
    mesaId: origen.id,
    ordenId: null,
    estadoAnterior: origen.estado,
    estadoNuevo: 'libre',
    personas: null,
    empleadoId: datos.empleadoId,
    ahora: datos.ahora,
  });

  await registrarEventoMesa(tx, {
    organizacionId: datos.organizacionId,
    sucursalId: destino.sucursalId,
    mesaId: destino.id,
    ordenId: datos.ordenId,
    estadoAnterior: destino.estado,
    estadoNuevo: origen.estado,
    personas: origen.personas,
    empleadoId: datos.empleadoId,
    ahora: datos.ahora,
  });

  await tx
    .insertInto('movimientos_cuenta')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: origen.sucursalId,
      tipo: 'cambio_mesa',
      orden_origen_id: datos.ordenId,
      mesa_origen_id: origen.id,
      mesa_destino_id: destino.id,
      // La cuenta entera se movió: no hay líneas sueltas que congelar, pero la
      // 070 exige que `lineas` no esté vacío, así que se anota el hecho.
      lineas: JSON.stringify([
        { mesa_origen: origen.numero, mesa_destino: destino.numero, personas: origen.personas },
      ]),
      empleado_id: datos.empleadoId,
      created_at: datos.ahora,
    })
    .execute();

  return { comandasReapuntadas: Number(comandas.numUpdatedRows) };
}
