import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoFolios, repoOrdenes, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import { valorarLinea } from '../venta/valorar.ts';

/**
 * `ferreteria.crear_nota_mostrador` — la nota que el pasillo manda a la caja.
 *
 * ── Por qué hacía falta un comando nuevo, y no el carrito ──────────────────
 * El recorrido de una ferretería son DOS personas: el mostradorista arma la nota
 * en el pasillo y la manda a caja; el cajero la cobra. La pantalla del mostrador
 * publicaba en `/api/venta/nota-mostrador`, que sirve a `apartarNota` —«déjamelo
 * apartado», F-140, otra función— y pedía otra forma, así que **la nota nunca se
 * creaba**: ni con el índice del mostrador arreglado se podía vender.
 *
 * Y el carrito de mostrador no sirve para esto, por una razón de la base y no de
 * gusto: `venta.crear_orden` tiene idempotencia natural por TERMINAL —«si ya hay
 * borrador, se devuelve ese»— y un índice único parcial que permite UN borrador
 * por terminal. Con eso, la segunda nota del día se pegaría a la primera: el
 * mostradorista manda la nota de Don Julián a caja, empieza la de la señora que
 * acaba de entrar, y sus tres bultos de cemento entran en la nota de Don Julián.
 *
 * ── Por qué la nota nace `confirmada` ─────────────────────────────────────
 * Porque `confirmada` es lo que ya significa «cerrada y en camino» en este
 * sistema —es el estado en el que el restaurante deja una cuenta que ya pasó por
 * cocina— y está en `ESTADOS_COBRABLES`, así que `venta.cobrar` la cobra sin
 * tocar nada más. El puente la sirve como `enviada`, que es como la lista la caja.
 *
 * No se inventó un estado `pendiente_cobro`: la pantalla de la caja lo tecleaba y
 * **no existe en el `check` de `ordenes.estado`**, así que su lista de notas
 * pendientes no podía tener una fila nunca.
 *
 * ── Qué NO hace ───────────────────────────────────────────────────────────
 * No cobra, no toma folio y no toca el inventario: eso es `venta.cobrar`, en la
 * caja, con la sesión de caja de esa terminal. Una nota mandada a caja no ha
 * movido dinero todavía — y si el cliente se arrepiente, se cancela sin haber
 * gastado un folio.
 */

const partida = z.object({
  productoId: z.uuid(),
  /** Con decimales: la ferretería vende metros y kilos, no sólo piezas. */
  cantidad: z.union([z.string().trim().min(1).max(20), z.number().positive()]),
  /** Para material por medida. Sin ella, la decide el catálogo. */
  unidad: z.string().trim().min(1).max(12).optional(),
});

export const entradaCrearNotaMostrador = z.object({
  /** La nota puede ser de un cliente con cuenta, o de quien pasaba por ahí. */
  clienteId: z.uuid().nullable().default(null),
  obraId: z.uuid().optional(),
  /**
   * El nombre escrito a mano, para el cliente sin ficha —que es la mayoría—.
   *
   * La base exige uno de los dos (`nota_con_alguien`): una nota sin cliente y
   * sin nombre no se le puede devolver a nadie cuando aparece la camioneta.
   * Cuando no llega ninguno se escribe «Mostrador», que es la verdad.
   */
  nombreLibre: z.string().trim().min(2).max(120).optional(),
  telefono: z.string().trim().max(30).optional(),
  partidas: z.array(partida).min(1).max(120),
});

export interface ResultadoNotaMostrador {
  readonly ordenId: string;
  /** La fila de `notas_mostrador`: lo que `apartar` y `entregar` reciben. */
  readonly notaId: string;
  /** `N-114`. Es lo que el cliente dice en la caja y lo que la caja busca. */
  readonly folio: string;
  readonly partidas: number;
  readonly totalCentavos: string;
}

/** Una nota recién abierta: su orden, su fila de nota y su folio. */
export interface NotaAbierta {
  readonly ordenId: string;
  readonly notaId: string;
  readonly folio: string;
}

export interface DatosDeNota {
  readonly clienteId: string | null;
  readonly obraId: string | null;
  /** Para el cliente sin ficha. Sin ninguno de los dos se escribe «Mostrador». */
  readonly nombreLibre?: string | undefined;
  readonly telefono?: string | undefined;
}

/**
 * ABRIR LA NOTA: la orden, su folio y su fila de `notas_mostrador`.
 *
 * ── Por qué es una función y no un bloque dentro del comando ──────────────
 * Porque hay DOS pantallas que empiezan una nota: «Mandar a caja», que arma
 * varias partidas, y el CORTE DE MATERIAL, que cuelga una sola partida de un
 * corte que ya se hizo. Las dos necesitan lo mismo —una orden cobrable, un folio
 * en la serie `N` y la fila de la nota— y copiarlo sería tener dos sitios donde
 * se decide cómo nace una nota, con el segundo quedándose sin lo que el primero
 * aprenda.
 *
 * No cotiza ni escribe totales: eso depende de las partidas, que las mete quien
 * llama. Y no audita, por la misma razón que `ejecutarCorte`: `definirComando`
 * guarda sólo la primera entrada del rastro.
 */
export async function abrirNotaDeMostrador(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeNota,
): Promise<NotaAbierta> {
  const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
  if (sucursalId === null) {
    throw new ErrorDominio(
      'VENTA_SIN_TERMINAL',
      'Para armar una nota hace falta una sucursal dada de alta.',
    );
  }

  const ordenId = await ctx.paso('crear_orden_de_nota', () =>
    repoOrdenes.crearNotaDeMostrador(ctx.tx, {
      organizacionId,
      sucursalId,
      // La terminal del PASILLO, que no es la que cobra. Puede ser nula: el
      // mostradorista lleva una tablet que nadie enroló como caja.
      terminalId,
      empleadoAtiendeId: empleoId,
      // Sin sesión de caja: la nota no ha tocado dinero. La sesión la pone el
      // cobro, en la caja, con la terminal que de verdad tiene el cajón.
      sesionCajaId: null,
      clienteId: datos.clienteId,
      obraId: datos.obraId,
    }),
  );

  // El folio de la NOTA, en su propia serie. No comparte consecutivo con el
  // ticket: dos documentos en la misma serie hacen que el 480 sea a veces una
  // venta y a veces una nota, y entonces nadie puede citarlo por teléfono.
  const tomado = await ctx.paso('tomar_folio', () =>
    repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId, 'N'),
  );
  const folio = `${tomado.serie}-${tomado.folio.toString()}`;

  // La NOTA, que es el envoltorio de mostrador de esta orden (F-140). Nace
  // `por_cobrar` porque eso es «mandada a caja», y es el estado que la caja
  // lista. Sin esta fila, `nota_mostrador.apartar` y `.entregar` reciben un
  // `notaId` que ningún comando podía crear: las dos funciones existían y
  // ninguna era alcanzable.
  const nota = await ctx.paso('crear_nota', () =>
    ctx.tx
      .insertInto('notas_mostrador')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        orden_id: ordenId,
        folio,
        estado: 'por_cobrar',
        cliente_id: datos.clienteId,
        // Uno de los dos, siempre. Con ficha no se copia el nombre —se leería
        // viejo el día que el cliente se cambie de razón social—; sin ficha se
        // escribe lo que haya, y «Mostrador» cuando no hay nada.
        nombre_libre: datos.clienteId === null ? (datos.nombreLibre ?? 'Mostrador') : null,
        telefono_libre: datos.telefono ?? null,
        mostradorista_id: empleoId,
        armada_en: ctx.ahora,
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  // El código que la caja busca va también en la orden: la lista de la caja y el
  // ticket lo leen de ahí, y derivarlo con un join en cada pantalla es cómo una
  // de las dos acaba enseñando otro número.
  await ctx.paso('sellar_codigo', () =>
    ctx.tx
      .updateTable('ordenes')
      .set({ codigo_caja: folio })
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', ordenId)
      .execute(),
  );

  return { ordenId, notaId: nota.id, folio };
}

export const crearNotaMostrador = definirComando<
  Transaccion,
  typeof entradaCrearNotaMostrador,
  ResultadoNotaMostrador
>({
  nombre: 'ferreteria.crear_nota_mostrador',
  entidad: 'orden',
  escribe: true,
  roles: ['dueno', 'administrador', 'gerente', 'cajero', 'mesero'],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCrearNotaMostrador,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const { ordenId, notaId, folio } = await abrirNotaDeMostrador(ctx, {
      clienteId: entrada.clienteId,
      obraId: entrada.obraId ?? null,
      nombreLibre: entrada.nombreLibre,
      telefono: entrada.telefono,
    });

    for (const [indice, pedida] of entrada.partidas.entries()) {
      const producto = await ctx.paso(`cargar_material_${String(indice)}`, () =>
        repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, pedida.productoId),
      );
      // Un material de otra organización responde igual que uno inexistente:
      // distinguirlos permitiría sondear el catálogo ajeno con identificadores.
      if (producto === null) {
        throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese material no está disponible.');
      }

      const cantidad =
        typeof pedida.cantidad === 'number' ? String(pedida.cantidad) : pedida.cantidad;
      const valorada = valorarLinea(producto, cantidad, pedida.unidad);

      await ctx.paso(`insertar_partida_${String(indice)}`, () =>
        repoOrdenes.agregarLinea(ctx.tx, {
          organizacionId,
          ordenId,
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
          ordenVisual: indice + 1,
        }),
      );
    }

    // EL TOTAL, con la MISMA cuenta que hará el cobro: `cotizar` suma las líneas
    // ya escritas y aplica el impuesto del negocio. Sumar aquí los subtotales a
    // mano daría otro número en cuanto el negocio tuviera IVA, y entonces la caja
    // enseñaría uno y `venta.cobrar` rechazaría por «el total cambió».
    const { totales } = await ctx.paso('cotizar', () => cotizar(ctx.tx, organizacionId, ordenId));
    // Y se escribe en la orden, porque a esta nota la lee OTRA persona en OTRA
    // pantalla: `marcarPagada` no ha corrido, y hasta que corra `total_centavos`
    // vale cero. Medido: la caja enseñaba «$0.00» con la nota bien armada.
    await ctx.paso('anotar_totales', () =>
      repoOrdenes.anotarTotales(ctx.tx, organizacionId, ordenId, totales),
    );
    const total = totales.totalCentavos;

    ctx.auditar({
      entidadId: ordenId,
      payload: {
        notaId,
        folio,
        partidas: entrada.partidas.length,
        totalCentavos: total.toString(),
        clienteId: entrada.clienteId,
      },
    });

    return {
      ordenId,
      notaId,
      folio,
      partidas: entrada.partidas.length,
      totalCentavos: total.toString(),
    };
  },
});
