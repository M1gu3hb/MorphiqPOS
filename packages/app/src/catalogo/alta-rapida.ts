import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';
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

/**
 * TODO VIAJA COMO TEXTO, y quien convierte es el servidor.
 *
 * Es la regla del sistema y la pantalla ya la cumplía: `Math.round(x * 100)` en el
 * navegador pierde el medio centavo justo en el caso que importa —`1234.995 * 100`
 * da `123499.4999…`— y un producto dado de alta a 45.54 en vez de 45.55 miente en
 * el margen todos los días. Aquí entra la cadena y `desdeTexto` la convierte una
 * vez, con la regla única del dominio.
 *
 * El campo vacío se acepta y significa «no sé»: en el mostrador, con el cliente
 * enfrente, el costo y el mínimo casi nunca se saben. Obligarlos sería no tener
 * alta rápida.
 */
const importe = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Pesos y centavos.');
const importeOpcional = z.union([z.literal(''), importe]).default('');
const cantidadOpcional = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\d{1,10}(?:\.\d{1,4})?$/),
  ])
  .default('');

export const entradaAltaRapida = z.object({
  /**
   * El que se acaba de escanear. Cuando no hay, se genera un SKU interno.
   *
   * La cadena VACÍA vale y significa «sin código»: la pantalla se monta también
   * sin haber escaneado nada —media tiendita vende cosas sin código— y mandar
   * `null` desde el navegador para decir lo mismo es una forma de que un día
   * llegue `""` y el alta se caiga con «datos incompletos».
   */
  codigo: z
    .union([z.literal(''), z.string().trim().min(4).max(40)])
    .nullable()
    .default(null)
    .transform((valor) => (valor === '' ? null : valor)),
  nombre: z.string().trim().min(2).max(120),
  precio: importe,
  /** Lo que costó. Vacío es «no sé», y queda como pendiente del catálogo. */
  costo: importeOpcional,
  categoriaId: z.uuid().nullable().default(null),
  /**
   * Lo que hay AHORA de ese producto, y su mínimo.
   *
   * Sin esto el alta rápida creaba un producto que no se podía contar: la tiendita
   * registraba la venta y el inventario seguía diciendo que no tenía ninguno. Se
   * piden aquí porque el cajero acaba de tener la caja en la mano; vacío es cero, y
   * cero es legítimo —«lo vendí y ya no queda»—.
   */
  stockInicial: cantidadOpcional,
  stockMinimo: cantidadOpcional,
});

export interface ResultadoAltaRapida {
  readonly productoId: string;
  /** El insumo que lleva su existencia. Sin él el producto no se puede contar. */
  readonly insumoId: string;
  /** Lo que quedó registrado en el almacén, en unidades de venta. */
  readonly existencia: string;
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
    const { organizacionId, sucursalId } = ctx.ambito;

    if (entrada.codigo !== null) {
      const repetido = await ctx.paso('buscar_codigo', () =>
        ctx.tx
          .selectFrom('productos')
          .select(['id', 'nombre'])
          .where('organizacion_id', '=', organizacionId)
          .where('codigo_barras', '=', entrada.codigo)
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
    const codigoBarras = entrada.codigo;
    const codigoGenerado = codigoBarras === null;
    const sku = codigoBarras ?? `INT-${ctx.ahora.getTime().toString(36).toUpperCase()}`;

    // Los importes y las cantidades, convertidos UNA vez y en el servidor.
    const precioCentavos = desdeTexto(entrada.precio);
    const costoCentavos = entrada.costo === '' ? null : desdeTexto(entrada.costo);
    const inicial = cantidad(entrada.stockInicial === '' ? '0' : entrada.stockInicial);
    const minimo = cantidadATexto(cantidad(entrada.stockMinimo === '' ? '0' : entrada.stockMinimo));

    const producto = await ctx.paso('crear_producto', () =>
      ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: organizacionId,
          nombre: entrada.nombre,
          categoria_id: entrada.categoriaId,
          sku,
          codigo_barras: codigoBarras,
          precio_venta_centavos: precioCentavos,
          costo_unitario_centavos: costoCentavos ?? 0n,
          // `sku` y no `receta`: lo que nace en el mostrador es una pieza que se
          // vende como viene. Sin la estrategia, el cobro no descuenta nada y la
          // existencia que se acaba de registrar no baja nunca.
          estrategia_consumo: 'sku',
          activo: true,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    /**
     * SU INSUMO, que es lo que lleva la existencia.
     *
     * Un producto sin insumo no se puede contar ni descontar: el conteo no lo
     * lista, el cobro no baja nada y el inventario sigue diciendo que no hay
     * ninguno del producto que se acaba de vender. El alta rápida creaba el
     * producto y nada más, así que los cuarenta que nacen en el mostrador cada mes
     * quedaban fuera del inventario.
     */
    const insumo = await ctx.paso('crear_insumo', () =>
      ctx.tx
        .insertInto('insumos')
        .values({
          organizacion_id: organizacionId,
          producto_id: producto.id,
          nombre: entrada.nombre,
          unidad_base: 'pieza',
          costo_unitario_centavos: costoCentavos ?? 0n,
          stock_minimo: minimo,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // Y LO QUE HAY, si se dijo cuánto. El almacén es el principal de la sucursal:
    // el cajero no elige bodega con alguien esperando.
    let existencia = '0';
    if (inicial > 0n && sucursalId !== null) {
      const almacenId = await ctx.paso('almacen', () =>
        repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
      );
      if (almacenId !== null) {
        const cuanto = cantidadATexto(inicial);
        const saldo = await ctx.paso('registrar_existencia', () =>
          sql<{ cantidad: string }>`
            insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
            values (${organizacionId}, ${almacenId}, ${insumo.id}, ${cuanto})
            on conflict (almacen_id, insumo_id) do update
            set cantidad = existencias.cantidad + excluded.cantidad, actualizado_en = now()
            returning cantidad
          `.execute(ctx.tx),
        );
        // El movimiento, para que el kardex explique de dónde salió esa existencia.
        // Una existencia sin movimiento es un número que nadie puede auditar.
        await ctx.paso('anotar_movimiento', () =>
          ctx.tx
            .insertInto('movimientos_stock')
            .values({
              organizacion_id: organizacionId,
              almacen_id: almacenId,
              insumo_id: insumo.id,
              tipo: 'inventario_inicial',
              cantidad: cuanto,
              unidad: 'pieza',
              costo_unitario_centavos: costoCentavos ?? 0n,
              referencia_tipo: 'manual',
              empleado_id: ctx.ambito.empleoId,
            })
            .execute(),
        );
        existencia = saldo.rows[0]?.cantidad ?? cuanto;
      }
    }

    const pendientes: string[] = [];
    if (costoCentavos === null) pendientes.push('costo');
    if (entrada.categoriaId === null) pendientes.push('categoria');
    if (codigoGenerado) pendientes.push('etiqueta');

    ctx.auditar({
      entidadId: producto.id,
      payload: {
        nombre: entrada.nombre,
        codigoGenerado,
        pendientes,
        insumoId: insumo.id,
        existencia,
      },
    });
    return {
      productoId: producto.id,
      insumoId: insumo.id,
      existencia,
      nombre: entrada.nombre,
      codigo: sku,
      codigoGenerado,
      pendientes,
    };
  },
});
