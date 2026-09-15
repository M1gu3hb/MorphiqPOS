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

export interface DatosDeUnion {
  readonly organizacionId: string;
  readonly principal: MesaEnSala;
  readonly ordenPrincipalId: string;
  readonly miembros: readonly { readonly mesa: MesaEnSala; readonly ordenId: string | null }[];
  readonly empleadoId: string;
  readonly ahora: Date;
}

export interface UnionEscrita {
  readonly unionId: string;
  readonly lineasMovidas: number;
  readonly cuentasAbsorbidas: number;
}

/** Estados de cuenta que todavía están sobre una mesa. */
const CUENTAS_VIVAS = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

/**
 * F-302 · Diez personas juntan las mesas 4 y 5, y el sistema deja de ver dos.
 *
 * ── Lo que duele hoy ───────────────────────────────────────────────────────
 * Las mesas se juntan físicamente y el sistema sigue viendo dos cuentas: el
 * mesero comanda partido y la cuenta sale partida. Se resuelve a mano pasando
 * todo a una mesa, que es teclear el pedido dos veces con la gente esperando.
 *
 * ── El consumo se MUEVE, no se copia ───────────────────────────────────────
 * Las líneas de las cuentas absorbidas cambian de `orden_id`. Copiarlas dejaría
 * el mismo platillo en dos cuentas y el comensal lo pagaría dos veces; y la
 * cuenta absorbida pasa a `absorbida`, un estado que el trigger de la 071
 * impide cobrar por la misma razón.
 *
 * ── Las mesas miembro se quedan SIN cuenta propia ──────────────────────────
 * `orden_activa_id` a nulo. Es lo que hace imposible que alguien comande en la
 * mesa 5 mientras el grupo se cobra en la 4, que es exactamente el descuadre
 * que esta función viene a cerrar.
 */
export async function unirMesas(tx: Transaccion, datos: DatosDeUnion): Promise<UnionEscrita> {
  const union = await tx
    .insertInto('uniones_mesa')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.principal.sucursalId,
      mesa_principal_id: datos.principal.id,
      orden_id: datos.ordenPrincipalId,
      abierta_en: datos.ahora,
      empleado_id: datos.empleadoId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  let lineasMovidas = 0;
  let cuentasAbsorbidas = 0;
  let personas = datos.principal.personas;

  for (const miembro of datos.miembros) {
    const { mesa, ordenId } = miembro;

    if (ordenId !== null) {
      const movidas = await tx
        .updateTable('orden_lineas')
        .set({ orden_id: datos.ordenPrincipalId, updated_at: datos.ahora })
        .where('organizacion_id', '=', datos.organizacionId)
        .where('orden_id', '=', ordenId)
        .executeTakeFirst();
      lineasMovidas += Number(movidas.numUpdatedRows);

      // Se sella DESPUÉS de mover: mientras las líneas viajaban, la cuenta
      // absorbida seguía siendo su dueña y el `where` de estado seguía valiendo.
      const sellada = await tx
        .updateTable('ordenes')
        .set({
          estado: 'absorbida',
          union_id: union.id,
          subtotal_centavos: 0n,
          descuento_centavos: 0n,
          impuestos_centavos: 0n,
          total_centavos: 0n,
          costo_total_centavos: 0n,
          utilidad_centavos: 0n,
          margen_bp: 0,
          updated_at: datos.ahora,
        })
        .where('organizacion_id', '=', datos.organizacionId)
        .where('id', '=', ordenId)
        .where('estado', 'in', [...CUENTAS_VIVAS])
        .executeTakeFirst();

      if (Number(sellada.numUpdatedRows) !== 1) {
        throw new ErrorDominio(
          'ORDEN_NO_EDITABLE',
          `La cuenta de la mesa ${mesa.numero} cambió mientras se unían las mesas.`,
        );
      }
      cuentasAbsorbidas += 1;
    }

    await tx
      .insertInto('union_mesa_miembros')
      .values({
        union_id: union.id,
        mesa_id: mesa.id,
        orden_absorbida_id: ordenId,
        union_abierta: true,
      })
      .execute();

    // SIN cuenta propia. Ver el docblock: es lo que impide comandar en la 5
    // mientras el grupo se cobra en la 4.
    await tx
      .updateTable('mesas')
      .set({
        estado: datos.principal.estado,
        orden_activa_id: null,
        ocupada_desde: mesa.ocupadaDesde ?? datos.ahora,
        empleado_atiende_id: datos.principal.empleadoAtiendeId,
      })
      .where('organizacion_id', '=', datos.organizacionId)
      .where('id', '=', mesa.id)
      .execute();

    await registrarEventoMesa(tx, {
      organizacionId: datos.organizacionId,
      sucursalId: mesa.sucursalId,
      mesaId: mesa.id,
      ordenId: datos.ordenPrincipalId,
      estadoAnterior: mesa.estado,
      estadoNuevo: datos.principal.estado,
      personas: mesa.personas,
      empleadoId: datos.empleadoId,
      ahora: datos.ahora,
    });

    personas += mesa.personas;
  }

  await tx
    .updateTable('ordenes')
    .set({ union_id: union.id, updated_at: datos.ahora })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenPrincipalId)
    .execute();

  // La principal recibe a toda la gente: es la que va a decir «mesa de diez».
  await tx
    .updateTable('mesas')
    .set({ personas_actuales: personas })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.principal.id)
    .execute();

  await tx
    .insertInto('movimientos_cuenta')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.principal.sucursalId,
      tipo: 'union',
      orden_origen_id: datos.ordenPrincipalId,
      mesa_origen_id: datos.principal.id,
      lineas: JSON.stringify(
        datos.miembros.map((m) => ({
          mesa: m.mesa.numero,
          orden_absorbida_id: m.ordenId,
          personas: m.mesa.personas,
        })),
      ),
      empleado_id: datos.empleadoId,
      created_at: datos.ahora,
    })
    .execute();

  return { unionId: union.id, lineasMovidas, cuentasAbsorbidas };
}

export interface DatosDeSeparacion {
  readonly organizacionId: string;
  readonly unionId: string;
  readonly empleadoId: string;
  readonly ahora: Date;
}

export interface SeparacionEscrita {
  readonly mesasLiberadas: number;
  readonly ordenPrincipalId: string;
}

/**
 * F-302 · Deshacer el grupo.
 *
 * ── Lo que NO deshace, y hay que decirlo ───────────────────────────────────
 * **El consumo no vuelve a repartirse.** Las líneas que se movieron a la cuenta
 * principal se quedan ahí: separar cierra el grupo y devuelve las mesas al
 * servicio, no reconstruye quién pidió qué. Para eso está F-321, que divide la
 * cuenta por consumo y es una decisión distinta —y de caja, no de sala—.
 *
 * Modelarlo al revés sería peor: «separar» devolvería cada platillo a la mesa
 * de donde vino aunque la gente se haya movido de silla, y el mesero acabaría
 * corrigiendo a mano lo que el sistema adivinó.
 */
export async function separarMesas(
  tx: Transaccion,
  datos: DatosDeSeparacion,
): Promise<SeparacionEscrita> {
  const union = await tx
    .selectFrom('uniones_mesa')
    .select(['id', 'mesa_principal_id', 'orden_id', 'sucursal_id', 'cerrada_en'])
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.unionId)
    .executeTakeFirst();

  if (union === undefined) {
    throw new ErrorDominio('MESA_NO_ENCONTRADA', 'Ese grupo de mesas no existe en este negocio.');
  }
  if (union.cerrada_en !== null) {
    throw new ErrorDominio('MESA_NO_LIBERABLE', 'Ese grupo de mesas ya estaba separado.');
  }

  const miembros = await tx
    .selectFrom('union_mesa_miembros')
    .select(['mesa_id'])
    .where('union_id', '=', datos.unionId)
    .execute();

  for (const miembro of miembros) {
    const previa = await tx
      .selectFrom('mesas')
      .select(['estado', 'sucursal_id'])
      .where('organizacion_id', '=', datos.organizacionId)
      .where('id', '=', miembro.mesa_id)
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
      .where('id', '=', miembro.mesa_id)
      .execute();

    await registrarEventoMesa(tx, {
      organizacionId: datos.organizacionId,
      sucursalId: previa?.sucursal_id ?? union.sucursal_id,
      mesaId: miembro.mesa_id,
      ordenId: null,
      estadoAnterior: previa?.estado ?? null,
      estadoNuevo: 'libre',
      personas: null,
      empleadoId: datos.empleadoId,
      ahora: datos.ahora,
    });
  }

  // Cerrar la unión es lo que dispara el trigger que apaga `union_abierta` en
  // los miembros, y con él el índice que impedía reusarlas en otro grupo.
  const cerrada = await tx
    .updateTable('uniones_mesa')
    .set({ cerrada_en: datos.ahora, empleado_cierra_id: datos.empleadoId })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.unionId)
    .where('cerrada_en', 'is', null)
    .executeTakeFirst();

  if (Number(cerrada.numUpdatedRows) !== 1) {
    throw new ErrorDominio('MESA_NO_LIBERABLE', 'Ese grupo se separó mientras se separaba.');
  }

  await tx
    .insertInto('movimientos_cuenta')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: union.sucursal_id,
      tipo: 'separacion',
      orden_origen_id: union.orden_id,
      mesa_origen_id: union.mesa_principal_id,
      lineas: JSON.stringify(miembros.map((m) => ({ mesa_id: m.mesa_id }))),
      empleado_id: datos.empleadoId,
      created_at: datos.ahora,
    })
    .execute();

  return { mesasLiberadas: miembros.length, ordenPrincipalId: union.orden_id };
}

/**
 * El grupo abierto al que pertenece una mesa, si pertenece a alguno.
 *
 * Mira los dos lados porque la principal NO está en `union_mesa_miembros`: es
 * la que conserva la cuenta. Sin el segundo `select`, liberar la mesa 4 de un
 * grupo vivo dejaría al grupo apuntando a una cuenta que ya no existe.
 */
export async function unionAbiertaDeMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
): Promise<string | null> {
  const fila = await tx
    .selectFrom('union_mesa_miembros')
    .select(['union_id'])
    .where('mesa_id', '=', mesaId)
    .where('union_abierta', '=', true)
    .executeTakeFirst();

  if (fila !== undefined) return fila.union_id;

  const principal = await tx
    .selectFrom('uniones_mesa')
    .select(['id'])
    .where('organizacion_id', '=', organizacionId)
    .where('mesa_principal_id', '=', mesaId)
    .where('cerrada_en', 'is', null)
    .executeTakeFirst();

  return principal?.id ?? null;
}
