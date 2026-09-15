import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { productosDeComanda } from './catalogo-comanda.ts';
import { insertarComandas, insertarItems } from './comandas.ts';
import { estacionesActivas, ordenDeMesa } from './datos.ts';
import { agruparEnComandas, resolverEstacion } from './estaciones.ts';
import type { LineaPreparada } from './lineas.ts';

/**
 * `restaurante.marchar_tiempo` — F-323.
 *
 * ── La operación normal del servicio de mesa en México ─────────────────────
 * Se comandan las entradas, se RETIENEN los fuertes, y el mesero los «marcha»
 * cuando ve que la mesa va terminando la sopa. Hoy el sistema manda todo de
 * golpe y el fuerte se enfría en la barra. No lo cubre F-310 —enviar— ni F-314
 * —estados—: retener y liberar es otra cosa.
 *
 * ── Marchar es CREAR la comanda, no cambiar su estado ──────────────────────
 * Una línea retenida no tiene comanda: si la tuviera, la pantalla de cocina la
 * enseñaría desde el primer minuto y el cocinero la empezaría. Por eso este
 * comando agrupa, escribe comandas y escribe items, exactamente como
 * `enviar_pedido`, sobre las líneas que estaban esperando.
 *
 * ── Y por eso el reloj de F-315 arranca aquí ───────────────────────────────
 * `comandas.marchada_en` es el instante de esta transacción. Medir desde la
 * captura pondría en rojo a una cocina que todavía no había recibido el plato.
 */

export const entradaMarcharTiempo = z.object({
  ordenId: z.uuid(),
  /** 1 la entrada, 2 el fuerte, 3 el postre. */
  tiempoServicio: z.number().int().min(1).max(6),
});

export interface ComandaMarchada {
  readonly id: string;
  readonly area: string;
  readonly estacionNombre: string | null;
  readonly items: number;
}

export interface ResultadoMarcha {
  readonly ordenId: string;
  readonly tiempoServicio: number;
  readonly lineasMarchadas: number;
  readonly comandas: readonly ComandaMarchada[];
}

/**
 * Marchar lo hace SALA, y es lo correcto.
 *
 * Es el mesero el que ve que la mesa va terminando; obligar a que baje el
 * cajero a soltar el segundo tiempo convertiría la función en algo que nadie
 * usa y el fuerte volvería a salir con la sopa.
 */
const ROLES = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

const ORDEN_ADMITE_MARCHA = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

export const marcharTiempo = definirComando<
  Transaccion,
  typeof entradaMarcharTiempo,
  ResultadoMarcha
>({
  nombre: 'restaurante.marchar_tiempo',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  modulo: 'cocina',
  entrada: entradaMarcharTiempo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ordenDeMesa(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (!(ORDEN_ADMITE_MARCHA as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya se cerró: no se le puede marchar nada más.',
        { estado: orden.estado },
      );
    }

    const lineas = await ctx.paso('cargar_retenidas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select([
          'id',
          'producto_id as productoId',
          'cantidad',
          'unidad',
          'notas',
          'orden_visual as ordenVisual',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', orden.id)
        .where('marcha_estado', '=', 'retenida')
        .where('tiempo_servicio', '=', entrada.tiempoServicio)
        // Una línea anulada no se cocina aunque estuviera esperando su tiempo.
        .where('anulada_en', 'is', null)
        .orderBy('orden_visual')
        .execute(),
    );

    if (lineas.length === 0) {
      throw new ErrorDominio(
        'COMANDA_NO_ENCONTRADA',
        `No hay nada retenido en el tiempo ${entrada.tiempoServicio} de esa cuenta.`,
        { tiempoServicio: entrada.tiempoServicio },
      );
    }

    const conProducto = lineas.filter(
      (l): l is typeof l & { productoId: string } => l.productoId !== null,
    );

    const [productos, estaciones] = await ctx.paso('cargar_catalogo', () =>
      Promise.all([
        productosDeComanda(
          ctx.tx,
          organizacionId,
          conProducto.map((l) => l.productoId),
        ),
        estacionesActivas(ctx.tx, organizacionId),
      ]),
    );

    const preparadas: LineaPreparada[] = [];
    for (const linea of conProducto) {
      const producto = productos.get(linea.productoId);
      // Un producto archivado entre la captura y la marcha no puede bloquear el
      // servicio: la línea ya está en la cuenta y se cobra igual. Lo que no se
      // puede es inventarle una estación.
      if (producto === undefined || producto.areaPreparacion === '') continue;

      preparadas.push({
        id: linea.id,
        producto,
        // La comanda sólo necesita cantidad y unidad: el precio ya se fijó al
        // capturar y marchar no lo vuelve a tocar.
        valorada: { cantidad: linea.cantidad, unidad: linea.unidad } as LineaPreparada['valorada'],
        estacion: resolverEstacion(producto.estacionDeCategoriaId, estaciones),
        areaPreparacion: producto.areaPreparacion,
        tiempoServicio: entrada.tiempoServicio,
        marchaEstado: 'inmediata',
        notas: linea.notas,
        ordenVisual: linea.ordenVisual,
      });
    }

    // Se sueltan PRIMERO y se comandan después: el trigger de la 074 rechaza un
    // `comanda_items` que apunte a una línea todavía retenida, y con razón.
    const soltadas = await ctx.paso('soltar_lineas', () =>
      ctx.tx
        .updateTable('orden_lineas')
        .set({ marcha_estado: 'marchada', updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', orden.id)
        .where('marcha_estado', '=', 'retenida')
        .where('tiempo_servicio', '=', entrada.tiempoServicio)
        .where('anulada_en', 'is', null)
        .executeTakeFirst(),
    );

    const grupos = agruparEnComandas(preparadas);
    const comandas = grupos.map((grupo) => ({ id: crypto.randomUUID(), grupo }));

    if (comandas.length > 0) {
      await ctx.paso('escribir_comandas', () =>
        insertarComandas(ctx.tx, {
          organizacionId,
          orden,
          notas: null,
          comandas,
          // EL RELOJ DE F-315 ARRANCA AQUÍ, no cuando se capturó el plato.
          marchadaEn: ctx.ahora,
        }),
      );
      await ctx.paso('escribir_items', () => insertarItems(ctx.tx, organizacionId, comandas));
    }

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        tiempoServicio: entrada.tiempoServicio,
        lineasMarchadas: Number(soltadas.numUpdatedRows),
        comandas: comandas.length,
      },
    });

    return {
      ordenId: orden.id,
      tiempoServicio: entrada.tiempoServicio,
      lineasMarchadas: Number(soltadas.numUpdatedRows),
      comandas: comandas.map(({ id, grupo }) => ({
        id,
        area: grupo.area,
        estacionNombre: grupo.estacion.nombre,
        items: grupo.lineas.length,
      })),
    };
  },
});
