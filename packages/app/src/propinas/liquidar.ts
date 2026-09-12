import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import {
  desglosarPagos,
  servirDesglose,
  type DesgloseServible,
  type PropinaDeMesero,
} from './desglose.ts';
import { entradaLiquidarPropinas } from './esquemas.ts';
import { tomarFolioDeLiquidacion } from './folio.ts';
import {
  desgloseDeOrdenes,
  ordenesDeOtraLiquidacion,
  propinasPorMeseroDeOrdenes,
  reclamarOrdenes,
} from './liquidadas.ts';
import { resolverRango } from './rango.ts';
import { explicarReclamo } from './reclamo.ts';

/**
 * `propinas.liquidar` — E6-7, una de las 14 operaciones transaccionales.
 *
 * UNA transacción crea la liquidación con su folio de la serie `LIQ` y marca las
 * N órdenes del periodo. O las dos cosas, o ninguna.
 *
 * ── Qué se arregla exactamente ─────────────────────────────────────────────
 * `LiquidarPropinasDialog.jsx:93-126` hace tres cosas mal a la vez:
 *
 *   · crea la `LiquidacionPropina` y DESPUÉS marca las ventas en lotes de cinco,
 *     así que un fallo a mitad deja la liquidación hecha y ventas sin marcar;
 *   · en `:122` se traga esos errores con un `console.error`, de modo que la
 *     pantalla dice «liquidado» y la propina se vuelve a liquidar mañana;
 *   · manda `total_liquidado` calculado en el navegador (`:103`) sobre una lista
 *     que lleva minutos abierta.
 *
 * Aquí el total lo suma el servidor de `pagos.propina_centavos`, y lo suma sobre
 * las órdenes que ESTA transacción reclamó, no sobre las que una lectura anterior
 * vio. Y `propina_liquidada` no se guarda: se deriva de
 * `propina_liquidacion_id is not null` (F1-04 §6.4). Un booleano que puede
 * desincronizarse del puntero acaba desincronizándose.
 */

/** La serie del folio de liquidación. `folios.serie` exige `^[A-Z]{1,6}$`. */
export const SERIE_LIQUIDACION = 'LIQ';

export interface ResultadoLiquidacion {
  readonly liquidacionId: string;
  /** `LIQ-000042`. Sustituye a `LIQ-AAAAMMDD-HHMMSS` de `:92` (D-20). */
  readonly folio: string;
  readonly totalCentavos: string;
  readonly numeroVentas: number;
  readonly desglose: DesgloseServible;
  readonly meseros: readonly PropinaDeMesero[];
}

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export const liquidarPropinas = definirComando<
  Transaccion,
  typeof entradaLiquidarPropinas,
  ResultadoLiquidacion
>({
  nombre: 'propinas.liquidar',
  entidad: 'liquidacion_propina',
  escribe: true,
  // Sólo el administrador liquida, como hoy: el diálogo vive en Dashboard y en
  // Registros, y `permissions.js:5,19` reserva las dos a `ROLES.ADMIN`. En el
  // modelo nuevo ese rol son tres (`F1-04` §12.3): dueño, administrador y gerente.
  roles: ROLES,
  // La propina es dinero de meseros: existe donde se sirve comida en mesa.
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaLiquidarPropinas,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Para liquidar propinas hace falta estar en una sucursal.',
      );
    }

    const rango = resolverRango(entrada.desde, entrada.hasta);
    const meseroId = entrada.meseroId ?? null;
    // Sin repetidos. Un identificador repetido —una lista construida por
    // concatenación, un doble render— hacía `solicitadas.length` 2 contra
    // `reclamadas.length` 1, y `explicarReclamo` abortaba con
    // LIQUIDACION_INVALIDA una liquidación que estaba perfectamente bien.
    const solicitadas = [...new Set(entrada.ordenIds ?? [])];
    // `undefined` (no `length === 0`) es lo único que significa «sin filtro de
    // ids». Colapsar `[]` en `null` liquidaba TODO el periodo cuando la pantalla
    // mandaba una lista vacía, que es exactamente lo contrario de lo que una
    // lista vacía pide. Hoy el esquema ya rechaza `[]` con `.min(1)`
    // (`esquemas.ts`), y esto lo vuelve a decir aquí para que quitar una de las
    // dos guardas no reabra el hueco en silencio.
    const filtroIds = entrada.ordenIds === undefined ? null : solicitadas;

    // 1 · El folio, DENTRO de la transacción y consecutivo POR ORGANIZACIÓN,
    //     que es lo que exige `liquidaciones_folio_unico`. El porqué —y por qué
    //     no puede salir de `folios`— está en `folio.ts`.
    const folio = await ctx.paso('tomar_folio', () =>
      tomarFolioDeLiquidacion(ctx.tx, organizacionId, SERIE_LIQUIDACION),
    );

    // 2 · La cabecera nace con total cero a propósito: el importe se sabe DESPUÉS
    //     de reclamar, y el reclamo necesita este id para apuntar las órdenes.
    const liquidacion = await ctx.paso('crear_liquidacion', () =>
      ctx.tx
        .insertInto('liquidaciones_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          serie: folio.serie,
          folio: folio.folio,
          liquidada_en: ctx.ahora,
          rango_inicio: rango.inicio,
          rango_fin: rango.fin,
          rango_tipo: entrada.rangoTipo,
          empleado_id: meseroId,
          total_centavos: 0n,
          empleado_liquida_id: empleoId,
          notas: entrada.notas ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // 3 · El reclamo. Es la protección, y es un solo `UPDATE`: la guarda
    //     `propina_liquidacion_id is null` va en el `WHERE`, así que dos
    //     liquidaciones simultáneas del mismo periodo se serializan en la fila y
    //     la segunda no vuelve a reclamar lo que la primera ya marcó. No hay un
    //     `if` previo que otra transacción pueda invalidar.
    const ids = await ctx.paso('reclamar_ordenes', () =>
      reclamarOrdenes(ctx.tx, {
        // `sucursalId` va en el filtro y no sólo en la cabecera: la fila se
        // sella con la sucursal de la SESIÓN, así que reclamar órdenes de otra
        // sucursal dejaba las ventas de Norte apuntando a una liquidación de
        // Centro — sus meseros veían «$0.00 pendiente» y su propina figuraba en
        // la caja de la otra sucursal.
        filtro: { organizacionId, sucursalId, meseroId, ...rango },
        liquidacionId: liquidacion.id,
        ahora: ctx.ahora,
        ordenIds: filtroIds,
      }),
    );

    // 4 · Explicar la diferencia, si la hay. La base ya decidió; esto sólo
    //     traduce su decisión a algo que el administrador entienda, y aborta la
    //     transacción entera en vez de liquidar «casi todas».
    const yaLiquidadas =
      solicitadas.length > 0 && ids.length !== solicitadas.length
        ? await ordenesDeOtraLiquidacion(ctx.tx, organizacionId, solicitadas, liquidacion.id)
        : [];
    const problema = explicarReclamo({ solicitadas, reclamadas: ids, yaLiquidadas });
    if (problema !== null) throw problema;

    // 5 · El importe, del servidor y sobre lo reclamado. Exacto por método: cada
    //     fila de `pagos` trae su `metodo` y su `propina_centavos`, así que esto
    //     es una suma por grupo y nunca un reparto proporcional (regla 3).
    const renglones = await ctx.paso('sumar_propinas', () =>
      desgloseDeOrdenes(ctx.tx, organizacionId, ids),
    );
    const desglose = desglosarPagos(renglones);

    await ctx.paso('fijar_total', () =>
      ctx.tx
        .updateTable('liquidaciones_propina')
        .set({ total_centavos: desglose.propinasCentavos })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', liquidacion.id)
        .executeTakeFirstOrThrow(),
    );

    // `venta_ids` y `desglose_meseros` NO se guardan como JSON (F1-04 §30.1):
    // se derivan de `ordenes.propina_liquidacion_id`, que además hace
    // consultable qué ventas entraron, que es lo que hace falta para revertirla.
    //
    // Va envuelta en `ctx.paso` como todo lo demás: era la única lectura del
    // comando sin nombre, y sin nombre no se puede interrumpir desde
    // `peticion.interrumpirEn` (`comando.ts:170-176`), que es el mecanismo con
    // el que este repositorio prueba que la reversión se lleva TODO.
    const meseros = await ctx.paso('desglose_meseros', () =>
      propinasPorMeseroDeOrdenes(ctx.tx, organizacionId, ids),
    );

    ctx.auditar({
      entidadId: liquidacion.id,
      payload: {
        folio: folioVisible(folio.serie, folio.folio),
        totalCentavos: desglose.propinasCentavos.toString(),
        numeroVentas: ids.length,
        rangoTipo: entrada.rangoTipo,
        meseroId,
      },
    });

    return {
      liquidacionId: liquidacion.id,
      folio: folioVisible(folio.serie, folio.folio),
      totalCentavos: desglose.propinasCentavos.toString(),
      numeroVentas: ids.length,
      desglose: servirDesglose(desglose),
      meseros,
    };
  },
});

/** `LIQ` + consecutivo a seis cifras, igual que el folio de venta (§6.2). */
export function folioVisible(serie: string, folio: bigint): string {
  return `${serie}-${folio.toString().padStart(6, '0')}`;
}
