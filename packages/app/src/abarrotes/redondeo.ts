import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoCaja, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { dentroDelTope } from '@morphiqpos/domain/dinero';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * `venta.registrar_redondeo` — F-257.
 *
 * ── El descuadre que nadie busca ─────────────────────────────────────────
 * «No tengo cambio, ¿le doy un chicle?» es una operación real y diaria, y hoy
 * el chicle sale del anaquel sin registro y el cajón descuadra por pesos
 * sueltos que a fin de mes son cientos. Un descuadre chico es peor que uno
 * grande: el grande se busca, el chico se asume, y en cuanto se asume el arqueo
 * deja de detectar el robo, que es para lo que existe.
 *
 * ── Por qué se escribe el movimiento de caja gemelo ──────────────────────
 * Porque el redondeo ES la explicación de la diferencia. La orden dice que se
 * cobraron $47.30 y en el cajón hay $47.50; sin la fila gemela, el corte ve los
 * veinte centavos y no puede decir de dónde salieron. `05-DATOS-Y-BACKEND.md`
 * §1.9 declara la tabla sin `movimiento_caja_id`; se corrige, porque una
 * explicación que el corte no puede leer no explica nada.
 *
 * ── Por qué el especie sale del stock ────────────────────────────────────
 * El chicle es producto. Darlo sin descontarlo hace que el inventario diga que
 * está en el anaquel, y el día del conteo aparece como faltante sin causa —el
 * mismo faltante que F-149 viene a explicar—.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaRegistrarRedondeo = z.object({
  ordenId: z.uuid(),
  tipo: z.enum(['a_favor', 'en_contra', 'especie']),
  /**
   * SIN signo: la magnitud de los centavos que sobraron. El signo lo pone el
   * servidor a partir del tipo — aceptarlo de la pantalla dejaría mandar un
   * `a_favor` negativo, que en el corte resta lo que el cajón tiene de más.
   */
  importeCentavos: z.number().int().min(1).max(100),
  /** El chicle. Obligatorio cuando el redondeo fue en especie. */
  productoEspecieId: z.uuid().optional(),
});

export interface ResultadoRedondeo {
  readonly redondeoId: string;
  readonly tipo: 'a_favor' | 'en_contra' | 'especie';
  /** Con signo: positivo a favor del negocio. */
  readonly importeCentavos: string;
  readonly movimientoCajaId: string;
}

export const registrarRedondeo = definirComando<
  Transaccion,
  typeof entradaRegistrarRedondeo,
  ResultadoRedondeo
>({
  nombre: 'venta.registrar_redondeo',
  entidad: 'redondeo',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaRegistrarRedondeo,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId, terminalId } = ctx.ambito;

    if (entrada.tipo === 'especie' && entrada.productoEspecieId === undefined) {
      // Un redondeo en especie sin producto es un redondeo que se disfraza de
      // chicle: el cajón cuadra y el anaquel no.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Un redondeo en especie tiene que decir qué producto se dio.',
      );
    }

    // El signo lo pone el servidor, a partir del tipo. `en_contra` es lo que el
    // negocio puso de más y por eso resta.
    const importe =
      entrada.tipo === 'en_contra'
        ? -BigInt(entrada.importeCentavos)
        : BigInt(entrada.importeCentavos);

    if (!dentroDelTope(importe)) {
      // Un redondeo de $50 no es un redondeo: es un descuento sin autorizar con
      // otro nombre. El tope está también en la 097; aquí para poder decirlo
      // con palabras en vez de con un `check` violado.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Eso ya no es un redondeo: pásalo por un descuento autorizado.',
        { importeCentavos: entrada.importeCentavos },
      );
    }

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'sesion_caja_id as sesionCajaId'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe en este negocio.');
    }

    const yaHay = await ctx.paso('mirar_redondeo', () =>
      ctx.tx
        .selectFrom('redondeos')
        .select(['id'])
        .where('orden_id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (yaHay !== undefined) {
      // Dos redondeos sobre el mismo ticket son la forma corta de convertirlo
      // en un descuento repetible de un peso en un peso.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa venta ya tiene su redondeo registrado.',
        { redondeoId: yaHay.id },
      );
    }

    const sesionId = await sesionDelRedondeo(ctx, orden.sesionCajaId, terminalId);

    const redondeo = await ctx.paso('anotar_redondeo', () =>
      ctx.tx
        .insertInto('redondeos')
        .values({
          organizacion_id: organizacionId,
          orden_id: entrada.ordenId,
          tipo: entrada.tipo,
          importe_centavos: importe,
          producto_especie_id: entrada.productoEspecieId ?? null,
          sesion_caja_id: sesionId,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // El gemelo. `ajuste` y no `deposito`: no entró dinero nuevo, cambió lo que
    // el corte tiene que esperar del mismo cobro.
    const movimiento = await ctx.paso('anotar_caja', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesionId,
        tipo: 'ajuste',
        montoCentavos: importe,
        motivo: entrada.tipo === 'especie' ? 'redondeo en especie' : `redondeo ${entrada.tipo}`,
        empleadoId: empleoId,
        referenciaTipo: 'redondeo',
        referenciaId: redondeo.id,
      }),
    );

    // ── El chicle sale del anaquel ────────────────────────────────────────
    // Darlo sin descontarlo hace que el inventario diga que está ahí, y el día
    // del conteo aparece como faltante sin causa: el mismo faltante que F-149
    // viene a explicar. `salida_consumo_interno` y no `salida_venta` porque
    // nadie lo pagó: meterlo en ventas inflaría el ticket con un producto que
    // se regaló.
    const salida =
      entrada.tipo === 'especie'
        ? await sacarLaEspecie(ctx, entrada.productoEspecieId, redondeo.id)
        : null;

    await ctx.paso('ligar_gemelo', () =>
      ctx.tx
        .updateTable('redondeos')
        .set({ movimiento_caja_id: movimiento.id, movimiento_stock_id: salida })
        .where('id', '=', redondeo.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: redondeo.id,
      payload: {
        ordenId: entrada.ordenId,
        tipo: entrada.tipo,
        importeCentavos: importe.toString(),
        productoEspecieId: entrada.productoEspecieId ?? null,
      },
    });

    return {
      redondeoId: redondeo.id,
      tipo: entrada.tipo,
      importeCentavos: importe.toString(),
      movimientoCajaId: movimiento.id,
    };
  },
});

/**
 * Descuenta la pieza que se dio en vez de monedas.
 *
 * ── Por qué se busca el insumo y no se descuenta el producto ─────────────
 * Porque la existencia vive en `insumos`, no en `productos`: es la misma regla
 * que V3 aplica al six. Un chicle sin insumo asociado es un producto que no
 * lleva existencia, y ahí no hay nada que descontar — se registra el redondeo
 * igual y se dice que no hubo movimiento, en vez de inventar uno.
 */
async function sacarLaEspecie(
  ctx: ContextoComando<Transaccion>,
  productoId: string | undefined,
  redondeoId: string,
): Promise<string | null> {
  if (productoId === undefined) return null;

  const insumo = await ctx.paso('cargar_insumo_especie', () =>
    ctx.tx
      .selectFrom('insumos')
      .select(['id', 'unidad_base as unidadBase'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('producto_id', '=', productoId)
      .where('activo', '=', true)
      .executeTakeFirst(),
  );
  if (insumo === undefined) return null;

  const sucursalId = ctx.ambito.sucursalId;
  const almacenId =
    sucursalId === null
      ? null
      : await ctx.paso('almacen', () =>
          repoVentaCatalogo.almacenPrincipal(ctx.tx, ctx.ambito.organizacionId, sucursalId),
        );
  // Sin almacén no hay de dónde descontar. El redondeo se registra igual —el
  // dinero sí pasó— y se dice que no hubo movimiento de stock, en vez de
  // inventar uno contra un almacén que no existe.
  if (almacenId === null) return null;

  const movimiento = await ctx.paso('sacar_especie', () =>
    ctx.tx
      .insertInto('movimientos_stock')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        almacen_id: almacenId,
        insumo_id: insumo.id,
        tipo: 'salida_consumo_interno',
        // Una pieza. El redondeo en especie es siempre una pieza: dos chicles
        // por veinte centavos ya no es un redondeo, es un descuento.
        cantidad: '-1.0000',
        unidad: insumo.unidadBase,
        referencia_tipo: 'redondeo',
        referencia_id: redondeoId,
        empleado_id: ctx.ambito.empleoId,
        // La CLAVE, que la 172 dio de alta. La frase iba a una columna con
        // foránea a `motivos_merma` y abortaba el redondeo entero.
        motivo: 'redondeo_especie',
        nota: 'redondeo entregado en especie',
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  return movimiento.id;
}

/**
 * El turno al que pertenece el redondeo.
 *
 * ── Por qué el de la ORDEN manda sobre el de la terminal ─────────────────
 * Porque un redondeo se registra segundos después del cobro, y en el cambio de
 * turno esos segundos caen del otro lado. Tomarlo de la terminal metería la
 * diferencia en el turno de quien entra, que no cobró esa venta, y le dejaría
 * un descuadre que no puede explicar.
 */
async function sesionDelRedondeo(
  ctx: ContextoComando<Transaccion>,
  sesionDeLaOrden: string | null,
  terminalId: string | null,
): Promise<string> {
  if (sesionDeLaOrden !== null) return sesionDeLaOrden;

  if (terminalId === null) {
    throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Esto toca el cajón: hace falta una terminal.');
  }

  const sesion = await ctx.paso('cargar_caja', () =>
    repoCaja.sesionAbiertaDeTerminal(ctx.tx, ctx.ambito.organizacionId, terminalId),
  );
  if (sesion === null) {
    throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de registrar el redondeo.');
  }
  return sesion.id;
}
