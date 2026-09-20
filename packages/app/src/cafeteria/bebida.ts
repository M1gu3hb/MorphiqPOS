import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoOrdenes, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { valorarLinea } from '../venta/valorar.ts';

/**
 * `cafeteria.agregar_bebida` — la bebida CON SUS OPCIONES (F-027).
 *
 * ── Por qué hacía falta un comando propio ────────────────────────────────
 * `cafeteria/OpcionesDeLaBebida.tsx` publicaba en `/api/cafeteria/agregar-linea`,
 * una ruta que no existe, con `{productoId, opciones, alergias, nota}`. La que sí
 * existe —`/api/venta/agregar-linea`— pide `{ordenId, productoId, cantidad}` y
 * **no sabe nada de opciones**: ningún comando del sistema escribía
 * `orden_linea_modificadores`, así que la leche de avena, el tamaño y el «sin
 * crema» no se guardaban en ninguna parte.
 *
 * En una cafetería eso no es un detalle: la mitad de las bebidas se piden
 * modificadas, cada opción mueve el precio, y lo que no se registra no se cobra.
 *
 * ── Por qué también crea el carrito ──────────────────────────────────────
 * Porque la pantalla de opciones se abre DESDE el menú, sin pasar por ninguna que
 * cree la orden, y pedirle el `ordenId` sería pedirle un dato que no tiene. Se usa
 * el borrador de la terminal —el mismo que `venta.crear_orden`, con su
 * idempotencia natural— así que dos bebidas seguidas caen en la misma cuenta, que
 * es lo que pasa de verdad en la barra.
 *
 * ── El precio se calcula AQUÍ y no en la pantalla ────────────────────────
 * El navegador pinta «+$10» para que el cliente lo vea, pero el importe que se
 * cobra sale del catálogo dentro de esta transacción. Si la pantalla mandara el
 * precio, un cliente con la consola abierta se pondría el latte a un peso.
 *
 * ── Y las dos instantáneas, que no son una duplicada ─────────────────────
 * `orden_linea_modificadores` es la forma CONSULTABLE —«¿cuántos pidieron leche de
 * avena este mes?», que es lo que decide qué se compra— y `orden_lineas.opciones`
 * es la del TICKET, para imprimirlo sin un join. Las dos se congelan con el nombre
 * de la opción, porque un modificador renombrado no puede cambiar lo que dice un
 * ticket de hace seis meses.
 */

const ROLES = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAgregarBebida = z.object({
  productoId: z.uuid(),
  /** Con decimales por si la barra vende dobles: `cantidadDecimal` del carrito. */
  cantidad: z
    .string()
    .regex(/^\d{1,4}(?:\.\d{1,3})?$/)
    .default('1'),
  /** Las opciones elegidas, en el orden en el que la pantalla las enseña. */
  opciones: z.array(z.uuid()).max(20).default([]),
  /**
   * Lo que la clienta NO puede tomar, escrito con sus palabras.
   *
   * Va a `ordenes.notas_alergias`, que es columna y no una clave dentro de un
   * jsonb: una alergia dentro de un jsonb es una alergia que nadie consulta, y en
   * una barra el vaso se prepara mirando esa línea.
   */
  alergias: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  nota: z.string().trim().max(200).default(''),
});

export interface ResultadoBebida {
  readonly ordenId: string;
  readonly lineaId: string;
  readonly opciones: number;
  readonly precioUnitarioCentavos: string;
  readonly subtotalCentavos: string;
}

interface OpcionElegida {
  readonly id: string;
  readonly nombre: string;
  readonly modificadorId: string;
  readonly modificadorNombre: string;
  /** Lo que mueve el precio, con signo: «sin crema» abarata. */
  readonly deltaCentavos: bigint;
}

export const agregarBebida = definirComando<
  Transaccion,
  typeof entradaAgregarBebida,
  ResultadoBebida
>({
  nombre: 'cafeteria.agregar_bebida',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAgregarBebida,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Para vender hace falta una terminal dada de alta en una sucursal.',
      );
    }

    const producto = await ctx.paso('cargar_producto', () =>
      repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, entrada.productoId),
    );
    // Un producto de otra organización responde igual que uno inexistente:
    // distinguirlos permitiría sondear el catálogo ajeno con identificadores.
    if (producto === null) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Esa bebida no está disponible.');
    }

    // ── Las opciones, LEÍDAS DEL CATÁLOGO ─────────────────────────────────
    // Con su grupo, para congelar los dos nombres, y acotadas a esta
    // organización: sin el filtro, un id ajeno metería en la cuenta una opción
    // de otro negocio con el precio de otro negocio.
    const elegidas = await leerOpciones(ctx, entrada.opciones);
    if (elegidas.length !== entrada.opciones.length) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Alguna de esas opciones ya no está en el menú.',
      );
    }

    const delta = elegidas.reduce((suma, o) => suma + o.deltaCentavos, 0n);

    // El borrador de ESTA terminal, con la idempotencia natural del carrito: dos
    // bebidas seguidas caen en la misma cuenta, que es lo que pasa en la barra.
    const existente = await ctx.paso('buscar_borrador', () =>
      repoOrdenes.borradorDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    const ordenId =
      existente?.id ??
      (await ctx.paso('crear_borrador', () =>
        repoOrdenes.crearBorrador(ctx.tx, {
          organizacionId,
          sucursalId,
          terminalId,
          empleadoAtiendeId: empleoId,
          sesionCajaId: null,
        }),
      ));

    // El precio base lo pone el catálogo; las opciones lo mueven. El mínimo es
    // cero: un descuento por «sin crema» no puede volver la bebida negativa.
    const valorada = valorarLinea(producto, entrada.cantidad, undefined);
    const unitario =
      valorada.precio.precioUnitarioCentavos + delta > 0n
        ? valorada.precio.precioUnitarioCentavos + delta
        : 0n;
    const cantidadNumero = Number(valorada.cantidad);
    const subtotal = BigInt(Math.round(Number(unitario) * cantidadNumero));

    const visual = await repoOrdenes.siguienteOrdenVisual(ctx.tx, organizacionId, ordenId);
    const lineaId = await ctx.paso('insertar_linea', () =>
      repoOrdenes.agregarLinea(ctx.tx, {
        organizacionId,
        ordenId,
        productoId: producto.id,
        productoNombre: producto.nombre,
        sku: producto.sku,
        codigoBarras: producto.codigoBarras,
        cantidad: valorada.cantidad,
        unidad: valorada.unidad,
        precioUnitarioCentavos: unitario,
        costoUnitarioCentavos: producto.costoUnitarioCentavos,
        subtotalCentavos: subtotal,
        totalCentavos: subtotal,
        esMayoreo: valorada.precio.esMayoreo,
        tipoVenta: producto.tipoVenta,
        ordenVisual: visual,
      }),
    );

    // ── Las dos instantáneas ──────────────────────────────────────────────
    for (const opcion of elegidas) {
      await ctx.paso(`anotar_opcion_${opcion.id}`, () =>
        ctx.tx
          .insertInto('orden_linea_modificadores')
          .values({
            orden_linea_id: lineaId,
            modificador_id: opcion.modificadorId,
            modificador_nombre: opcion.modificadorNombre,
            opcion_id: opcion.id,
            opcion_nombre: opcion.nombre,
            precio_extra_centavos: opcion.deltaCentavos,
          })
          .execute(),
      );
    }

    // La del TICKET, en la propia línea: se imprime sin un join, y el `null` de
    // la nota es distinto de la cadena vacía —no es lo mismo «sin nota» que «».
    await ctx.paso('sellar_opciones', () =>
      ctx.tx
        .updateTable('orden_lineas')
        .set({
          opciones: JSON.stringify(
            elegidas.map((o) => ({
              grupo: o.modificadorNombre,
              opcion: o.nombre,
              deltaCentavos: o.deltaCentavos.toString(),
            })),
          ),
          notas: entrada.nota === '' ? null : entrada.nota,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', lineaId)
        .execute(),
    );

    // ── Y LAS ALERGIAS, en la orden ───────────────────────────────────────
    // Se ACUMULAN: una cuenta puede llevar dos bebidas de dos personas, y perder
    // la alergia de la primera al anotar la segunda es exactamente el error que
    // esta columna existe para evitar.
    if (entrada.alergias.length > 0) {
      const previas = existente === null ? null : await notasDeAlergia(ctx, ordenId);
      const juntas = [...(previas === null ? [] : [previas]), ...entrada.alergias]
        .join(' · ')
        .slice(0, 500);
      await ctx.paso('anotar_alergias', () =>
        ctx.tx
          .updateTable('ordenes')
          .set({ notas_alergias: juntas })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', ordenId)
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: ordenId,
      payload: {
        lineaId,
        productoId: producto.id,
        opciones: elegidas.map((o) => o.nombre),
        deltaCentavos: delta.toString(),
        alergias: entrada.alergias.length,
      },
    });

    return {
      ordenId,
      lineaId,
      opciones: elegidas.length,
      precioUnitarioCentavos: unitario.toString(),
      subtotalCentavos: subtotal.toString(),
    };
  },
});

type Contexto = Parameters<typeof agregarBebida.ejecutar>[0];

/**
 * Las opciones con su grupo, acotadas a esta organización.
 *
 * ── Por qué DOS consultas y no un `join` ─────────────────────────────────
 * Porque `modificador_opciones` no lleva `organizacion_id` —cuelga de su grupo—
 * y el filtro por organización tiene que ser sobre el GRUPO. Con dos lecturas la
 * guarda queda explícita: sólo sobreviven las opciones cuyo grupo es de este
 * negocio, y una opción ajena desaparece de la lista en vez de colarse con el
 * precio de otro. Y de paso el comando se puede probar sin falsear un planificador
 * de `join`, que es la otra mitad de lo que estas pruebas cuidan.
 */
async function leerOpciones(ctx: Contexto, ids: readonly string[]): Promise<OpcionElegida[]> {
  if (ids.length === 0) return [];

  const opciones = await ctx.paso('leer_opciones', () =>
    ctx.tx
      .selectFrom('modificador_opciones')
      .select(['id', 'modificador_id', 'nombre', 'precio_extra_centavos', 'delta_precio_centavos'])
      .where('activa', '=', true)
      .where('id', 'in', [...ids])
      .execute(),
  );
  if (opciones.length === 0) return [];

  const grupos = await ctx.paso('leer_grupos', () =>
    ctx.tx
      .selectFrom('modificadores')
      .select(['id', 'nombre'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('activo', '=', true)
      .where('id', 'in', [...new Set(opciones.map((o) => o.modificador_id))])
      .execute(),
  );
  const porGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));

  const elegidas: OpcionElegida[] = [];
  for (const opcion of opciones) {
    const grupo = porGrupo.get(opcion.modificador_id);
    // Sin grupo de este negocio, la opción no existe para este negocio.
    if (grupo === undefined) continue;
    elegidas.push({
      id: opcion.id,
      nombre: opcion.nombre,
      modificadorId: opcion.modificador_id,
      modificadorNombre: grupo,
      // El FIRMADO manda cuando lo hay: «sin crema» abarata, y `precio_extra` no
      // sabe restar. Cuando es cero se usa el extra clásico, que es como está
      // capturado el menú que ya existe.
      deltaCentavos:
        opcion.delta_precio_centavos === 0n
          ? opcion.precio_extra_centavos
          : opcion.delta_precio_centavos,
    });
  }
  return elegidas;
}

/** Lo que la orden ya tenía anotado de alergias. */
async function notasDeAlergia(ctx: Contexto, ordenId: string): Promise<string | null> {
  const fila = await ctx.paso('leer_alergias', () =>
    ctx.tx
      .selectFrom('ordenes')
      .select(['notas_alergias'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', ordenId)
      .executeTakeFirst(),
  );
  const previas = fila?.notas_alergias ?? null;
  return previas === null || previas.trim() === '' ? null : previas;
}
