import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR, validarEntorno } from '@morphiqpos/contracts';
import { repoOrdenes, type Transaccion } from '@morphiqpos/data';
import { centavos, repartirPorPesos } from '@morphiqpos/domain/dinero';
import { evaluarDescuento, puedeAutorizar } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { leerAutorizacion } from '../identidad/supervisor.ts';

import { exigirBorrador } from './carrito.ts';
import { cotizar } from './cotizar.ts';
import { topeDe } from './descuento.ts';

/**
 * EL DESCUENTO DEL MOSTRADOR, con su tope y su supervisor (F-205, D-28 de la 2.4).
 *
 * Cada `02-DINERO-Y-CAJA §3` de los giros de mostrador dice lo mismo con sus cifras: el
 * dueño sin tope, el encargado hasta un tope chico, la cajera casi nada; por encima de
 * su tope, el PIN de un supervisor, y el PIN queda en la bitácora. Hasta la 2.4 el
 * mostrador no tenía descuento NINGUNO —el cobro de la tienda no tenía dónde ponerlo— y
 * `venta.autorizar_descuento` escribía autorizaciones que nadie aplicaba.
 *
 * ── Cómo se aplica ───────────────────────────────────────────────────────────
 * Al borrador, antes de cobrar, como un importe sobre toda la venta. Se reparte entre
 * las líneas en proporción a su importe, EXACTO —`repartirPorPesos`, sin centavo que
 * sobre ni que falte— y los totales salen de `cotizar`, la misma del cobro: el IVA se
 * calcula sobre lo ya descontado y el costo no baja (un descuento baja la venta, no lo
 * que costó, y el margen lo enseña). Volver a aplicar REEMPLAZA el anterior.
 *
 * ── El tope y la autorización ────────────────────────────────────────────────
 * Si cabe en el tope del puesto de quien cobra (`topes_descuento`), se aplica. Si no,
 * hace falta la autorización firmada que emite `/api/identidad/supervisor` cuando el
 * supervisor teclea SU PIN en esta terminal: vigente, de este negocio, pedida por esta
 * persona, y de alguien cuyo tope cubra el descuento ENTERO. Entonces se escribe la fila
 * de `autorizaciones_descuento` con quién la dio: ésa es la bitácora del §3.
 */

const ROLES_DE_VENTA = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAplicarDescuento = z.object({
  ordenId: z.uuid(),
  descuentoCentavos: z.number().int().min(1).max(100_000_000),
  motivo: z.string().trim().min(4).max(200),
  /** La autorización firmada del supervisor, cuando el descuento pasa del tope propio. */
  autorizacion: z.string().min(20).max(2_000).optional(),
});

export interface ResultadoDescuentoDeMostrador {
  readonly descuentoCentavos: string;
  readonly totalCentavos: string;
  /** El empleo de quien autorizó, o `null` si cupo en el tope propio. */
  readonly autorizadoPor: string | null;
}

/** El secreto se lee por invocación, no al cargar el módulo (igual que la pimienta). */
function secreto(): string {
  return validarEntorno(process.env).SESSION_SECRET;
}

export const aplicarDescuento = definirComando<
  Transaccion,
  typeof entradaAplicarDescuento,
  ResultadoDescuentoDeMostrador
>({
  nombre: 'venta.aplicar_descuento',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_VENTA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAplicarDescuento,
  async ejecutar(ctx, entrada) {
    await ctx.paso('exigir_borrador', () =>
      exigirBorrador(ctx.tx, ctx.ambito.organizacionId, entrada.ordenId),
    );
    const hecho = await descontarLaOrden(ctx, entrada.ordenId, entrada);

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: {
        descuentoCentavos: hecho.descuentoCentavos.toString(),
        baseCentavos: hecho.baseCentavos.toString(),
        motivo: entrada.motivo,
        autorizadoPor: hecho.autorizadoPor,
      },
    });
    return {
      descuentoCentavos: hecho.descuentoCentavos.toString(),
      totalCentavos: hecho.totalCentavos.toString(),
      autorizadoPor: hecho.autorizadoPor,
    };
  },
});

/** Lo que se pide descontar: cuánto, por qué y, si pasa del tope, quién lo autorizó. */
export interface PedidoDeDescuento {
  readonly descuentoCentavos: number;
  readonly motivo: string;
  readonly autorizacion?: string | undefined;
}

export interface DescuentoAplicado {
  readonly descuentoCentavos: bigint;
  /** Lo que valía la orden antes del descuento: la base del porcentaje del tope. */
  readonly baseCentavos: bigint;
  readonly totalCentavos: bigint;
  /** El empleo de quien autorizó, o `null` si cupo en el tope propio. */
  readonly autorizadoPor: string | null;
}

/**
 * EL DESCUENTO SOBRE UNA ORDEN, con su tope y su supervisor: el cuerpo de
 * `venta.aplicar_descuento`, en UN sitio (bloque D de la 2.4).
 *
 * Lo usan dos llamadores con la misma regla y la misma bitácora: el carrito de la tienda
 * —un borrador, que el comando exige antes de llamar— y la NOTA de la ferretería, que el
 * mostradorista negocia con el cliente enfrente y nace `confirmada` al mandarse a caja
 * (`ferreteria.crear_nota_mostrador`). Una segunda copia del tope y de la autorización
 * sería la que se queda atrás el día que el tope cambie.
 *
 * No exige el estado: eso lo decide quien llama. No audita: `definirComando` guarda sólo
 * la primera entrada del rastro, y cada llamador anota la suya.
 */
export async function descontarLaOrden(
  ctx: ContextoComando<Transaccion>,
  ordenId: string,
  pedido: PedidoDeDescuento,
): Promise<DescuentoAplicado> {
  const { organizacionId, sucursalId, empleoId, rol } = ctx.ambito;
  const lineas = await ctx.paso('leer_lineas', () =>
    repoOrdenes.lineasDeOrden(ctx.tx, organizacionId, ordenId),
  );
  if (lineas.length === 0) {
    throw new ErrorDominio('ORDEN_VACIA', 'No hay nada en la venta a qué descontarle.');
  }
  const base = lineas.reduce((suma, l) => suma + l.subtotalCentavos, 0n);
  const descuento = BigInt(pedido.descuentoCentavos);
  if (descuento >= base) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Un descuento no puede llevarse la venta entera: eso es una cortesía, y se registra aparte.',
      { baseCentavos: base.toString() },
    );
  }

  const tope = await topeDe(ctx, rol);
  const veredicto = evaluarDescuento({ baseCentavos: base, descuentoCentavos: descuento, tope });
  let autorizadoPor: string | null = null;
  if (veredicto.veredicto !== 'libre') {
    autorizadoPor = await ctx.paso('autorizar', async () => {
      const carga =
        pedido.autorizacion === undefined
          ? null
          : leerAutorizacion(
              pedido.autorizacion,
              { organizacionId, solicitaEmpleoId: empleoId },
              secreto(),
              ctx.ahora,
            );
      if (carga === null) {
        throw new ErrorDominio(
          'PUESTO_NO_OTORGABLE',
          pedido.autorizacion === undefined
            ? 'Ese descuento pasa de tu tope: que lo autorice un supervisor con su PIN.'
            : 'La autorización venció o no es de esta venta: que el supervisor teclee su PIN otra vez.',
          {
            porque: veredicto.porque,
            topeCentavos: veredicto.topeCentavos.toString(),
            topeBp: veredicto.topeBp,
          },
        );
      }
      const topeDeQuienAutoriza = await topeDe(ctx, carga.rol);
      if (!puedeAutorizar(descuento, base, topeDeQuienAutoriza)) {
        throw new ErrorDominio(
          'PUESTO_NO_OTORGABLE',
          'Ese descuento pasa también del tope de quien lo autoriza: tiene que ser alguien por encima.',
          { topeCentavos: topeDeQuienAutoriza.topeCentavos.toString() },
        );
      }
      await ctx.tx
        .insertInto('autorizaciones_descuento')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          orden_id: ordenId,
          solicita_empleo_id: empleoId,
          autoriza_empleo_id: carga.supervisor,
          autoriza_rol: carga.rol,
          descuento_centavos: descuento,
          tope_centavos: tope.topeCentavos,
          // Las dos ramas del tope (180): un descuento que pasa por PORCENTAJE y no por
          // importe se rechazaba en la base con 23514 y no se podía autorizar nunca.
          base_centavos: base,
          tope_bp: tope.topeBp,
          motivo: pedido.motivo,
          created_at: ctx.ahora,
        })
        .execute();
      return carga.supervisor;
    });
  }

  // El reparto EXACTO entre líneas, en proporción a lo que cada una vale.
  const partes = repartirPorPesos(
    centavos(descuento),
    lineas.map((l) => Number(l.subtotalCentavos)),
  );
  await ctx.paso('repartir', async () => {
    for (const [i, linea] of lineas.entries()) {
      const parte = BigInt(partes[i] ?? 0n);
      await ctx.tx
        .updateTable('orden_lineas')
        .set({
          descuento_centavos: parte,
          total_centavos: linea.subtotalCentavos - parte,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', ordenId)
        .where('id', '=', linea.id)
        .execute();
    }
  });

  const { totales } = await ctx.paso('recalcular', () => cotizar(ctx.tx, organizacionId, ordenId));
  await ctx.paso('anotar_totales', () =>
    repoOrdenes.anotarTotales(ctx.tx, organizacionId, ordenId, totales),
  );

  return {
    descuentoCentavos: descuento,
    baseCentavos: base,
    totalCentavos: totales.totalCentavos,
    autorizadoPor,
  };
}

export const entradaTopeDeDescuento = z.object({});

export interface QuienAutoriza {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
}

export interface ResultadoTopeDeDescuento {
  readonly topeCentavos: string;
  readonly topeBp: number;
  /** Los supervisores del negocio que pueden teclear su PIN aquí. Sin la persona que pregunta. */
  readonly quienesAutorizan: readonly QuienAutoriza[];
}

/**
 * Lo que la pantalla necesita ANTES de cobrar: el tope de quien cobra —para decidir si
 * pide el PIN de un supervisor o no— y a quién se le puede pedir. El servidor vuelve a
 * comprobar todo al aplicar; esto sólo evita preguntar de más o de menos.
 */
export const topeDeDescuento = definirComando<
  Transaccion,
  typeof entradaTopeDeDescuento,
  ResultadoTopeDeDescuento
>({
  nombre: 'venta.tope_de_descuento',
  entidad: 'orden',
  escribe: false,
  roles: [...ROLES_DE_VENTA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaTopeDeDescuento,
  async ejecutar(ctx) {
    const { organizacionId, empleoId, rol } = ctx.ambito;
    const tope = await topeDe(ctx, rol);
    const supervisores = await ctx.paso('leer_supervisores', () =>
      ctx.tx
        .selectFrom('empleos')
        .innerJoin('personas', 'personas.id', 'empleos.persona_id')
        .select(['empleos.id as empleoId', 'personas.nombre as nombre', 'empleos.rol as rol'])
        .where('empleos.organizacion_id', '=', organizacionId)
        .where('empleos.activo', '=', true)
        .where('empleos.rol', 'in', ['gerente', 'administrador', 'dueno'])
        .where('empleos.id', '<>', empleoId)
        .orderBy('personas.nombre')
        .execute(),
    );
    return {
      topeCentavos: tope.topeCentavos.toString(),
      topeBp: tope.topeBp,
      quienesAutorizan: supervisores,
    };
  },
});
