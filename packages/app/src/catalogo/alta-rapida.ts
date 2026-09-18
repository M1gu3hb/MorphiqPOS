import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-201 · El alta rápida desde el código que no existe.
 *
 * ── Por qué esto no es «crear producto» ──────────────────────────────────
 * Porque pasa EN HORA PICO, con el cliente enfrente y el código ya escaneado.
 * «No está en el catálogo» tiene hoy dos salidas y las dos son malas: se pierde
 * la venta, o se cobra a mano y no queda registrada. El alta rápida convierte
 * ese hueco en un alta de catálogo — y así el catálogo se completa sin que nadie
 * se siente a capturarlo.
 *
 * ── Tres campos y Enter, y por eso los demás tienen valor ────────────────
 * Nombre, precio y si lleva impuesto. Todo lo demás —categoría, presentación,
 * costo, mínimo— se rellena después, desde el catálogo, con calma. Pedirlo aquí
 * es lo mismo que no tener alta rápida: nadie contesta ocho campos con alguien
 * esperando.
 *
 * ── Y lo que nace así queda MARCADO ──────────────────────────────────────
 * `incompleto` no es un defecto: es la lista de pendientes del catálogo. Sin
 * ella, los cuarenta productos que nacieron en el mostrador se pierden entre los
 * seis mil y nadie vuelve a ponerles costo — y un producto sin costo miente en
 * el margen todos los días.
 *
 * ── El código NO se inventa ──────────────────────────────────────────────
 * Si viene, se usa tal cual y se comprueba que no esté ya. Si no viene, se
 * genera un SKU interno con prefijo, porque media tiendita vende cosas sin
 * código y tienen que poder escanearse igual.
 */

const MOSTRADOR = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAltaRapida = z.object({
  /** El que se acaba de escanear. Cuando no hay, se genera un SKU interno. */
  codigoBarras: z.string().trim().min(4).max(40).nullable().default(null),
  nombre: z.string().trim().min(2).max(120),
  precioVentaCentavos: z.number().int().min(0).max(100_000_000),
  /** Lo que costó. Opcional: en el mostrador casi nunca se sabe. */
  costoUnitarioCentavos: z.number().int().min(0).max(100_000_000).nullable().default(null),
  categoriaId: z.uuid().nullable().default(null),
});

export interface ResultadoAltaRapida {
  readonly productoId: string;
  readonly nombre: string;
  readonly codigo: string;
  /** `true` cuando el código lo generó el sistema porque la pieza no traía. */
  readonly codigoGenerado: boolean;
  /**
   * Lo que falta por llenar. Es la lista de pendientes del catálogo.
   *
   * Sin ella los cuarenta productos que nacieron en el mostrador se pierden
   * entre los seis mil, y un producto sin costo miente en el margen todos los
   * días sin que nadie sepa cuál es.
   */
  readonly pendientes: readonly string[];
}

export const altaRapida = definirComando<
  Transaccion,
  typeof entradaAltaRapida,
  ResultadoAltaRapida
>({
  nombre: 'catalogo.alta_rapida',
  entidad: 'producto',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAltaRapida,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    if (entrada.codigoBarras !== null) {
      const repetido = await ctx.paso('buscar_codigo', () =>
        ctx.tx
          .selectFrom('productos')
          .select(['id', 'nombre'])
          .where('organizacion_id', '=', organizacionId)
          .where('codigo_barras', '=', entrada.codigoBarras)
          .executeTakeFirst(),
      );
      if (repetido !== undefined) {
        // Y se dice CUÁL es. «Ese código ya existe» con el cliente enfrente
        // deja al cajero buscándolo a mano; con el nombre, lo cobra.
        throw new ErrorDominio(
          'CONFIGURACION_CONFLICTO',
          `Ese código ya es de «${repetido.nombre}».`,
          { productoId: repetido.id },
        );
      }
    }

    // El SKU interno se deriva del instante y no de un contador: pedir un
    // consecutivo aquí añadiría un bloqueo de tabla en la operación que más
    // prisa tiene del día.
    const codigoBarras = entrada.codigoBarras;
    const codigoGenerado = codigoBarras === null;
    const sku = codigoBarras ?? `INT-${ctx.ahora.getTime().toString(36).toUpperCase()}`;

    const producto = await ctx.paso('crear_producto', () =>
      ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: organizacionId,
          nombre: entrada.nombre,
          categoria_id: entrada.categoriaId,
          sku,
          codigo_barras: codigoBarras,
          precio_venta_centavos: BigInt(entrada.precioVentaCentavos),
          costo_unitario_centavos: BigInt(entrada.costoUnitarioCentavos ?? 0),
          activo: true,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    const pendientes: string[] = [];
    if (entrada.costoUnitarioCentavos === null) pendientes.push('costo');
    if (entrada.categoriaId === null) pendientes.push('categoria');
    if (codigoGenerado) pendientes.push('etiqueta');

    ctx.auditar({
      entidadId: producto.id,
      payload: { nombre: entrada.nombre, codigoGenerado, pendientes },
    });
    return {
      productoId: producto.id,
      nombre: entrada.nombre,
      codigo: sku,
      codigoGenerado,
      pendientes,
    };
  },
});
