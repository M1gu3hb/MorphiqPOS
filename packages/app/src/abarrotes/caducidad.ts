import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-106 · La caducidad SIN lote.
 *
 * ── Por qué no es V4 ─────────────────────────────────────────────────────
 * El lote completo —con trazabilidad hacia atrás y PEPS obligatorio— es de
 * farmacia. Una tiendita no maneja lote: maneja «la leche que llegó el jueves».
 * Pedirle a Don Chuy que capture un número de lote por cada caja de leche es
 * pedirle algo que no va a hacer, y una función que no se usa en la semana
 * cuatro no existe. Esto cubre el 90 % del dolor con el 10 % de la captura.
 *
 * ── Lo consumido NO se resta de lo que entró ─────────────────────────────
 * Y ésa es la decisión que da el número. Si se restara, la fila diría cuánto
 * queda y se perdería cuánto entró; con las dos columnas, la diferencia entre
 * ellas ES la merma que ese producto genera en ese anaquel — el número que el
 * negocio nunca ha tenido y que decide si se deja de pedir esa marca.
 *
 * ── Una fecha, un producto, un almacén ───────────────────────────────────
 * La segunda captura del mismo lote de leche SUMA a la fila que ya existe. Dos
 * filas hermanas dejarían a alguien decidiendo cuál rematar primero, y las dos
 * caducan el mismo día.
 *
 * ── Y la urgencia se mide en días, no en «pronto» ────────────────────────
 * «Se vence pronto» no es accionable. «Quedan 3 días y hay 14 piezas por
 * $420» sí: es lo que decide si se remata al 30 % o se tira.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaRegistrarCaducidad = z.object({
  almacenId: z.uuid(),
  productoId: z.uuid(),
  caducaEl: z.iso.date(),
  cantidad: z.string().regex(CANTIDAD, 'La cantidad va con hasta cuatro decimales.'),
  compraId: z.uuid().nullable().default(null),
});

export const entradaProximasACaducar = z.object({
  almacenId: z.uuid().nullable().default(null),
  /** Cuántos días adelante mirar. Siete es la semana que se puede rematar. */
  dias: z.number().int().min(0).max(365).default(7),
});

export const entradaConsumirCaducidad = z.object({
  caducidadId: z.uuid(),
  cantidad: z.string().regex(CANTIDAD, 'La cantidad va con hasta cuatro decimales.'),
  /** `venta` cuando se vendió a tiempo; `merma` cuando se tiró. */
  motivo: z.enum(['venta', 'merma']),
});

export interface ResultadoCaducidad {
  readonly caducidadId: string;
  readonly caducaEl: string;
  readonly cantidad: string;
  /** `true` si sumó a una fila que ya existía en vez de crear otra. */
  readonly sumoAExistente: boolean;
}

export interface LoteQueCaduca {
  readonly caducidadId: string;
  readonly productoId: string;
  readonly nombre: string;
  readonly caducaEl: string;
  readonly porVencer: string;
  /** Negativo cuando ya venció. Es lo que separa «remata» de «tira». */
  readonly diasRestantes: number;
  readonly valorCentavos: string;
}

export interface ResultadoProximas {
  readonly lotes: readonly LoteQueCaduca[];
  readonly valorEnRiesgoCentavos: string;
  /** Lo que YA venció y sigue contado como existencia vendible. */
  readonly vencidos: number;
}

export interface ResultadoConsumo {
  readonly caducidadId: string;
  readonly consumida: string;
  readonly restante: string;
  /** `true` cuando la fila quedó agotada: ya no sale en la lista de la mañana. */
  readonly agotada: boolean;
}

const MS_POR_DIA = 86_400_000;
const ESCALA = 10_000n;

export const registrarCaducidad = definirComando<
  Transaccion,
  typeof entradaRegistrarCaducidad,
  ResultadoCaducidad
>({
  nombre: 'inventario.registrar_caducidad',
  entidad: 'caducidad',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaRegistrarCaducidad,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'controla_caducidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }
    if (producto.controla_caducidad !== true) {
      // Capturar caducidad de lo que no caduca es trabajo que no sirve, y una
      // lista de la mañana llena de tornillos deja de leerse.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `«${producto.nombre}» no lleva control de caducidad.`,
      );
    }

    const cantidad = aEscala(entrada.cantidad);
    if (cantidad <= 0n) {
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'Una caducidad de cero no es una caducidad.');
    }

    const existente = await ctx.paso('buscar_fila', () =>
      ctx.tx
        .selectFrom('caducidades')
        .select(['id', 'cantidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', '=', entrada.almacenId)
        .where('producto_id', '=', entrada.productoId)
        .where('caduca_el', '=', entrada.caducaEl)
        .executeTakeFirst(),
    );

    // La segunda captura del mismo lote SUMA. Dos filas hermanas dejarían a
    // alguien decidiendo cuál rematar primero, y las dos caducan el mismo día.
    if (existente !== undefined) {
      const total = aEscala(existente.cantidad) + cantidad;
      await ctx.paso('sumar_a_fila', () =>
        ctx.tx
          .updateTable('caducidades')
          .set({ cantidad: deEscala(total) })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', existente.id)
          .execute(),
      );
      ctx.auditar({
        entidadId: existente.id,
        payload: { sumado: entrada.cantidad, total: deEscala(total) },
      });
      return {
        caducidadId: existente.id,
        caducaEl: entrada.caducaEl,
        cantidad: deEscala(total),
        sumoAExistente: true,
      };
    }

    const fila = await ctx.paso('registrar', () =>
      ctx.tx
        .insertInto('caducidades')
        .values({
          organizacion_id: organizacionId,
          almacen_id: entrada.almacenId,
          producto_id: entrada.productoId,
          caduca_el: entrada.caducaEl,
          cantidad: deEscala(cantidad),
          compra_id: entrada.compraId,
          registrada_en: ctx.ahora,
          registrada_por: empleoId,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: { productoId: entrada.productoId, caducaEl: entrada.caducaEl },
    });
    return {
      caducidadId: fila.id,
      caducaEl: entrada.caducaEl,
      cantidad: deEscala(cantidad),
      sumoAExistente: false,
    };
  },
});

export const proximasACaducar = definirComando<
  Transaccion,
  typeof entradaProximasACaducar,
  ResultadoProximas
>({
  nombre: 'inventario.proximas_a_caducar',
  entidad: 'caducidad',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaProximasACaducar,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const hasta = new Date(ctx.ahora.getTime() + entrada.dias * MS_POR_DIA)
      .toISOString()
      .slice(0, 10);

    let consulta = ctx.tx
      .selectFrom('caducidades')
      .select(['id', 'producto_id', 'caduca_el', 'cantidad', 'consumida'])
      .where('organizacion_id', '=', organizacionId)
      .where('caduca_el', '<=', hasta)
      .orderBy('caduca_el', 'asc');
    if (entrada.almacenId !== null) {
      consulta = consulta.where('almacen_id', '=', entrada.almacenId);
    }

    const filas = await ctx.paso('leer_caducidades', () => consulta.execute());
    // Lo agotado no sale: ya se vendió o ya se tiró, y una lista que repite lo
    // resuelto deja de leerse a la tercera mañana.
    const vivas = filas.filter((f) => aEscala(f.consumida) < aEscala(f.cantidad));
    if (vivas.length === 0) {
      return { lotes: [], valorEnRiesgoCentavos: '0', vencidos: 0 };
    }

    const productos = await ctx.paso('leer_productos', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'precio_venta_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where(
          'id',
          'in',
          vivas.map((f) => f.producto_id),
        )
        .execute(),
    );
    const porId = new Map(productos.map((p) => [p.id, p]));

    const hoy = ctx.ahora.toISOString().slice(0, 10);
    let valor = 0n;
    let vencidos = 0;

    const lotes = vivas.map((f) => {
      const producto = porId.get(f.producto_id);
      const porVencer = aEscala(f.cantidad) - aEscala(f.consumida);
      const precio = producto?.precio_venta_centavos ?? 0n;
      const enRiesgo = (porVencer * precio) / ESCALA;
      valor += enRiesgo;

      // En días enteros y con signo. «Se vence pronto» no es accionable;
      // «quedan 3 días y hay 14 piezas por $420» decide si se remata o se tira.
      const diasRestantes = Math.round(
        (new Date(`${f.caduca_el}T00:00:00.000Z`).getTime() -
          new Date(`${hoy}T00:00:00.000Z`).getTime()) /
          MS_POR_DIA,
      );
      if (diasRestantes < 0) vencidos += 1;

      return {
        caducidadId: f.id,
        productoId: f.producto_id,
        nombre: producto?.nombre ?? 'Sin nombre',
        caducaEl: f.caduca_el,
        porVencer: deEscala(porVencer),
        diasRestantes,
        valorCentavos: enRiesgo.toString(),
      };
    });

    return { lotes, valorEnRiesgoCentavos: valor.toString(), vencidos };
  },
});

export const consumirCaducidad = definirComando<
  Transaccion,
  typeof entradaConsumirCaducidad,
  ResultadoConsumo
>({
  nombre: 'inventario.consumir_caducidad',
  entidad: 'caducidad',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaConsumirCaducidad,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const fila = await ctx.paso('leer_fila', () =>
      ctx.tx
        .selectFrom('caducidades')
        .select(['id', 'cantidad', 'consumida'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.caducidadId)
        .executeTakeFirst(),
    );
    if (fila === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa caducidad no existe en este negocio.');
    }

    const cantidad = aEscala(fila.cantidad);
    const consumidaAntes = aEscala(fila.consumida);
    const consumidaDespues = consumidaAntes + aEscala(entrada.cantidad);
    if (consumidaDespues > cantidad) {
      // Consumir más de lo que entró deja la fila diciendo que se vendieron
      // quince cartones de un lote de doce, y la merma sale negativa.
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'Eso es más de lo que quedaba en ese lote.', {
        quedaba: deEscala(cantidad - consumidaAntes),
      });
    }

    // `consumida` SUBE; `cantidad` no se toca. La diferencia entre las dos es
    // la merma de ese producto en ese anaquel, y restar de `cantidad` la haría
    // desaparecer.
    await ctx.paso('consumir', () =>
      ctx.tx
        .updateTable('caducidades')
        .set({ consumida: deEscala(consumidaDespues) })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.caducidadId)
        .where('consumida', '=', fila.consumida)
        .execute(),
    );

    ctx.auditar({
      entidadId: entrada.caducidadId,
      payload: { motivo: entrada.motivo, cantidad: entrada.cantidad },
    });
    return {
      caducidadId: entrada.caducidadId,
      consumida: deEscala(consumidaDespues),
      restante: deEscala(cantidad - consumidaDespues),
      agotada: consumidaDespues >= cantidad,
    };
  },
});

/** `numeric(14,4)` como entero: cuatro decimales, sin flotantes. */
function aEscala(valor: string): bigint {
  const [entero = '0', decimal = ''] = valor.trim().split('.');
  return BigInt(entero) * ESCALA + BigInt(decimal.padEnd(4, '0').slice(0, 4));
}

function deEscala(valor: bigint): string {
  const entero = valor / ESCALA;
  const resto = (valor % ESCALA).toString().padStart(4, '0');
  return `${entero}.${resto}`;
}
