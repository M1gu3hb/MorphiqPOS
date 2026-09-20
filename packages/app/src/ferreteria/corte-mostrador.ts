import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { cantidad, cantidadATexto, desdeDiezmilesimas } from '@morphiqpos/domain/catalogo';
import { repoOrdenes, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import { valorarLinea } from '../venta/valorar.ts';
import { ejecutarCorte } from './corte.ts';
import { abrirNotaDeMostrador } from './nota-de-mostrador.ts';

/**
 * `ferreteria.cortar_y_agregar` — la pantalla de CORTAR Y AGREGAR (F-145, F-150).
 *
 * ── Por qué hacía falta, y qué había ─────────────────────────────────────
 * `ferreteria/CorteDeMaterial.tsx` publicaba en `/api/ferreteria/cortar`, **una
 * ruta que no existe**, con `{materialId, piezaId, medida, desperdicio,
 * destinoSobrante}`. El comando que sí existe —`inventario.cortar_material`, en
 * `/api/inventario/cortar`— pide otra cosa: la PARTIDA de venta a la que se
 * cuelga el corte, el almacén, y las medidas en unidad base. Nada de eso lo tiene
 * la pantalla, así que el botón de la función más propia de una ferretería no
 * hacía nada.
 *
 * ── LA DECISIÓN: el corte cuelga de una partida, y la partida de una NOTA ─
 * La base lo exige —`cortes_material.orden_linea_id` es `not null` y `unique`—
 * y tiene razón: un corte sin partida es material que salió del almacén sin que
 * nadie lo cobrara. Pero el mostrador arma su venta en el navegador y no crea la
 * orden hasta pulsar «Mandar a caja», así que **no hay partida donde colgarlo**.
 *
 * Así que este comando abre la nota él mismo, con la misma función que usa
 * «Mandar a caja», y mete la partida cortada. Es lo correcto y no un atajo:
 * cortar es IRREVERSIBLE —los 60.4 m no vuelven al rollo si el cliente se
 * arrepiente— y dejar esa partida viviendo sólo en el estado de un navegador
 * significaría que cerrar la pestaña deja el material cortado, la merma real y la
 * venta en ninguna parte. La nota es el registro que hace seguro el corte.
 *
 * El cliente se lo lleva a la caja con el folio de esa nota, como cualquier otra.
 *
 * ── Y el cobro NO vuelve a descontar esa partida ─────────────────────────
 * El corte ya sacó del almacén lo entregado y la merma. `planearConsumo` en
 * `venta.cobrar` salta las líneas que tienen corte; sin eso, el cable saldría dos
 * veces del inventario por una sola venta.
 *
 * ── La escala ────────────────────────────────────────────────────────────
 * La pantalla habla en unidades de VENTA con decimales —«6.8 m»— y el corte en
 * unidad base, que son diezmilésimas. La conversión está aquí, en un sitio, con
 * `cantidad()`, que es la misma que usa el resto del inventario.
 */

/** Los tres destinos del sobrante que nombra el documento. Ninguno inventado. */
const DESTINOS = ['abierto', 'remate', 'baja'] as const;

/** Medidas: la pantalla manda números; se acepta también el texto. */
const medida = z.union([z.string().trim().min(1).max(20), z.number()]);

export const entradaCortarYAgregar = z.object({
  materialId: z.uuid(),
  /** De qué pieza. La pantalla siempre la manda: es su primera decisión. */
  piezaId: z.uuid(),
  medida,
  /** Lo que destruye el corte. Cero es legítimo: hay material que no se pierde. */
  desperdicio: medida.default(0),
  destinoSobrante: z.enum(DESTINOS).default('abierto'),
  /** La nota puede ser de un cliente con cuenta, o de quien pasaba por ahí. */
  clienteId: z.uuid().nullable().default(null),
});

export interface ResultadoCorteMostrador {
  readonly ordenId: string;
  readonly notaId: string;
  readonly folio: string;
  readonly corteId: string;
  /** En unidades de venta, ya listos para la pantalla. */
  readonly entregado: string;
  readonly merma: string;
  readonly queda: string;
  readonly destino: string;
  readonly totalCentavos: string;
}

/** Texto con hasta cuatro decimales, que es lo que `cantidad()` admite. */
function comoTexto(valor: string | number): string {
  return typeof valor === 'number' ? valor.toFixed(4) : valor;
}

export const cortarYAgregar = definirComando<
  Transaccion,
  typeof entradaCortarYAgregar,
  ResultadoCorteMostrador
>({
  nombre: 'ferreteria.cortar_y_agregar',
  entidad: 'corte_material',
  escribe: true,
  roles: ['dueno', 'administrador', 'gerente', 'cajero', 'almacen', 'mesero'],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCortarYAgregar,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Para cortar hace falta una sucursal dada de alta: el material sale de su almacén.',
      );
    }

    // De qué almacén sale. La pantalla no lo pregunta —el mostradorista corta
    // del rack que tiene detrás— y preguntarlo sería una decisión de más en una
    // pantalla que ya tiene tres.
    const almacenId = await ctx.paso('almacen', () =>
      repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
    );
    if (almacenId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esta sucursal no tiene almacén principal: el corte no sabría de dónde descontar.',
      );
    }

    const producto = await ctx.paso('cargar_material', () =>
      repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, entrada.materialId),
    );
    // Un material de otra organización responde igual que uno inexistente:
    // distinguirlos permitiría sondear el catálogo ajeno con identificadores.
    if (producto === null) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese material no está disponible.');
    }

    const medidaTexto = comoTexto(entrada.medida);
    const mermaTexto = comoTexto(entrada.desperdicio);
    // `cantidad()` rechaza lo que no cabe en cuatro decimales y lo que no es un
    // número: la medida entra por aquí antes de tocar el almacén.
    const medidaBase = cantidad(medidaTexto);
    const mermaBase = cantidad(mermaTexto);
    if (medidaBase === 0n) {
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'Un corte de cero no es un corte.');
    }

    // La NOTA primero: el corte necesita una partida, y la partida una orden.
    const nota = await abrirNotaDeMostrador(ctx, {
      clienteId: entrada.clienteId,
      obraId: null,
    });

    // La partida se cobra por lo ENTREGADO, no por lo consumido: la merma es del
    // negocio, no del cliente. Es la regla que hace que la merma se registre en
    // vez de esconderse en el precio.
    // La unidad la decide el catálogo: el mostrador corta en la unidad de venta
    // del material, no en una que la pantalla pudiera mandar.
    const valorada = valorarLinea(producto, medidaTexto, undefined);
    const lineaId = await ctx.paso('insertar_partida', () =>
      repoOrdenes.agregarLinea(ctx.tx, {
        organizacionId,
        ordenId: nota.ordenId,
        productoId: producto.id,
        productoNombre: producto.nombre,
        sku: producto.sku,
        codigoBarras: producto.codigoBarras,
        cantidad: valorada.cantidad,
        unidad: valorada.unidad,
        precioUnitarioCentavos: valorada.precio.precioUnitarioCentavos,
        costoUnitarioCentavos: producto.costoUnitarioCentavos,
        subtotalCentavos: valorada.precio.subtotalCentavos,
        totalCentavos: valorada.precio.subtotalCentavos,
        esMayoreo: valorada.precio.esMayoreo,
        tipoVenta: producto.tipoVenta,
        ordenVisual: 1,
      }),
    );

    // Y EL CORTE, con el cuerpo compartido: los dos movimientos de stock, la
    // resta de existencia y la pieza como quedó.
    const corte = await ejecutarCorte(ctx, {
      ordenLineaId: lineaId,
      productoId: producto.id,
      almacenId,
      medidaSolicitadaBase: Number(medidaBase),
      mermaBase: Number(mermaBase),
      // De la pieza que el mostradorista eligió, no de la que el servidor
      // preferiría: él es el que tiene el rack delante.
      piezaAbiertaId: entrada.piezaId,
    });

    const sobrante = BigInt(corte.sobranteBase);
    await destinoDelSobrante(ctx, {
      destino: entrada.destinoSobrante,
      piezaId: corte.piezaResultanteId,
      sobrante,
      almacenId,
      // El insumo lo resuelve el catálogo al cargar el material: la existencia
      // cuelga de `insumos`, y el id del producto no encuentra ninguna fila.
      insumoId: producto.insumoId ?? '',
      unidad: valorada.unidad,
      costoCentavos: producto.costoUnitarioCentavos,
    });

    // El total de la nota, con la misma cuenta que hará el cobro.
    const { totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, nota.ordenId),
    );
    await ctx.paso('anotar_totales', () =>
      repoOrdenes.anotarTotales(ctx.tx, organizacionId, nota.ordenId, totales),
    );

    ctx.auditar({
      entidadId: corte.corteId,
      payload: {
        ordenId: nota.ordenId,
        notaId: nota.notaId,
        folio: nota.folio,
        materialId: producto.id,
        entregadoBase: corte.entregadoBase,
        mermaBase: corte.mermaBase,
        sobranteBase: corte.sobranteBase,
        destinoSobrante: entrada.destinoSobrante,
        totalCentavos: totales.totalCentavos.toString(),
      },
    });

    return {
      ordenId: nota.ordenId,
      notaId: nota.notaId,
      folio: nota.folio,
      corteId: corte.corteId,
      entregado: cantidadATexto(desdeDiezmilesimas(BigInt(corte.entregadoBase))),
      merma: cantidadATexto(desdeDiezmilesimas(BigInt(corte.mermaBase))),
      queda: cantidadATexto(desdeDiezmilesimas(sobrante)),
      destino: corte.destino,
      totalCentavos: totales.totalCentavos.toString(),
    };
  },
});

interface DatosDelSobrante {
  readonly destino: (typeof DESTINOS)[number];
  readonly piezaId: string | null;
  readonly sobrante: bigint;
  readonly almacenId: string;
  /** El INSUMO, no el producto: es a `insumos` a lo que apunta la existencia. */
  readonly insumoId: string;
  readonly unidad: string;
  readonly costoCentavos: bigint;
}

/**
 * LA TERCERA DECISIÓN DE LA PANTALLA: qué se hace con lo que queda.
 *
 * ── Por qué las tres opciones tienen que existir aquí ────────────────────
 * Porque si el sistema no las pide, se toman igual pero fuera del sistema: el
 * retazo se queda en el rack a precio de lista y no se vende nunca, o se tira sin
 * que el costo aparezca en ninguna parte. `03-INVENTARIO.md` §9 lo dice con
 * nombre: el inventario de material continuo se vuelve ficción en semanas.
 *
 * - `abierto` no hace nada: `ejecutarCorte` ya dejó la pieza con su restante, y
 *   pasa a `retazo` sola si cruzó el umbral del material.
 * - `remate` le pone precio para que salga. La sugerencia es el COSTO —«que salga
 *   sin perder dinero»—, que es la misma regla que sirve la vista
 *   `materiales_continuos`; un porcentaje inventado no se puede explicar.
 * - `baja` lo saca del almacén con su movimiento de MERMA y cierra la pieza. Sin
 *   el movimiento, dar de baja un retazo sería hacerlo desaparecer del sistema
 *   sin que el costo se reconozca en ningún sitio, que es exactamente el
 *   descuadre que este giro viene a cerrar.
 */
async function destinoDelSobrante(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDelSobrante,
): Promise<void> {
  // Sin sobrante no hay decisión: la pieza se cerró al agotarse.
  if (datos.sobrante === 0n || datos.piezaId === null) return;
  if (datos.destino === 'abierto') return;

  if (datos.destino === 'remate') {
    await ctx.paso('marcar_remate', () =>
      ctx.tx
        .updateTable('piezas_abiertas')
        .set({ estado: 'retazo', precio_remate_centavos: datos.costoCentavos })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', datos.piezaId ?? '')
        .execute(),
    );
    return;
  }

  // `baja`: sale del almacén como merma y la pieza se cierra.
  const movimiento = await ctx.paso('anotar_baja', () =>
    ctx.tx
      .insertInto('movimientos_stock')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        almacen_id: datos.almacenId,
        insumo_id: datos.insumoId,
        tipo: 'merma',
        cantidad: `-${cantidadATexto(desdeDiezmilesimas(datos.sobrante))}`,
        unidad: datos.unidad,
        referencia_tipo: 'corte',
        referencia_id: datos.piezaId,
        empleado_id: ctx.ambito.empleoId,
        // La clave de `motivos_merma`, no una frase: la columna tiene foránea a esa
        // tabla y cualquier otra cosa revienta el movimiento entero.
        motivo: 'retazo_invendible',
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  // La resta, en unidades de almacén y con la misma guarda que el corte: sin el
  // `cantidad >=`, dar de baja un retazo dejaría la existencia en negativo, que es
  // material que el sistema cree que debe.
  const aRestar = cantidadATexto(desdeDiezmilesimas(datos.sobrante));
  const bajada = await ctx.paso('bajar_existencia', () =>
    sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad - ${aRestar}, actualizado_en = now()
       where organizacion_id = ${ctx.ambito.organizacionId}
         and almacen_id = ${datos.almacenId}
         and insumo_id = ${datos.insumoId}
         and cantidad >= ${aRestar}
      returning cantidad
    `.execute(ctx.tx),
  );
  if (bajada.rows.length !== 1) {
    throw new ErrorDominio(
      'STOCK_INSUFICIENTE',
      'No hay existencia suficiente para dar de baja ese retazo.',
      { sobrante: aRestar },
    );
  }

  await ctx.paso('cerrar_pieza_de_baja', () =>
    ctx.tx
      .updateTable('piezas_abiertas')
      .set({
        estado: 'cerrada',
        medida_restante_base: 0n,
        cerrada_en: ctx.ahora,
        movimiento_cierre_id: movimiento.id,
      })
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', datos.piezaId ?? '')
      .execute(),
  );
}
