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
import { entradaPropinasPendientes } from './esquemas.ts';
import { resolverRango } from './rango.ts';
import {
  desglosePendiente,
  propinasPorMeseroPendientes,
  ventasConPropinaPendiente,
  type VentaConPropina,
} from './repositorio.ts';

/**
 * `propinas.pendientes` — lo que alimenta el diálogo de liquidación y el panel
 * de propinas del corte.
 *
 * Todo derivado. No hay ninguna columna `propina_liquidada` que consultar:
 * pendiente ES `propina_liquidacion_id is null`, y por eso no puede mentir
 * (F1-04 §6.4).
 *
 * Devuelve el desglose por método EXACTO. Hoy la pantalla lo calcula en el
 * navegador con `desgloseMetodosPagoExacto` (`tipsUtils.js:92-155`) y 45 líneas de
 * respaldo para las ventas antiguas que no traían el desglose. Ese respaldo deja
 * de tener causa: no existe una fila de `pagos` sin `metodo` (F1-04 §6.1).
 *
 * Es una consulta y no toca nada, pero se declara como comando para que pase por
 * las mismas puertas que una escritura: rol de la SESIÓN, paquete y ámbito. La
 * propina por mesero es dinero de la gente; no se lee desde una ruta abierta.
 */

export interface PropinasPendientes {
  readonly desde: string;
  readonly hasta: string;
  readonly meseroId: string | null;
  /** Suma de propinas pendientes del periodo. Sin topar: se agrega en la base. */
  readonly totalCentavos: string;
  readonly numeroVentas: number;
  readonly desglose: DesgloseServible;
  readonly meseros: readonly PropinaDeMesero[];
  /** Listado para dibujar. Va topado por `limite` y NO decide ningún importe. */
  readonly ventas: readonly VentaConPropina[];
  /** `true` si hay más ventas que las listadas: la pantalla debe decirlo. */
  readonly hayMasVentas: boolean;
}

const ROLES = ['dueno', 'administrador', 'gerente', 'cajero'] as const;

export const propinasPendientes = definirComando<
  Transaccion,
  typeof entradaPropinasPendientes,
  PropinasPendientes
>({
  nombre: 'propinas.pendientes',
  entidad: 'liquidacion_propina',
  escribe: false,
  // El cajero entra además de los tres de `liquidar`: el desglose de propinas
  // por método es parte de su corte (`Caja.jsx:160-173`), aunque liquidar no lo sea.
  roles: ROLES,
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaPropinasPendientes,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    // Exactamente el mismo requisito que `liquidar`, y no por simetría estética:
    // esta consulta y aquel `UPDATE` comparten `condicionPendiente` porque tienen
    // que cubrir lo mismo. Si la lectura fuera de toda la organización y la
    // escritura de una sucursal, la pantalla volvería a enseñar ocho ventas
    // mientras el botón liquida siete — el defecto que este módulo existe para
    // cerrar, sólo que del otro lado.
    //
    // `empleos.sucursal_id` es nulable (`001_plataforma.sql:159`), así que un
    // empleo sin sucursal existe. Para ése se falla en voz alta en vez de
    // ensancharle el alcance en silencio: sin este corte, un cajero de Norte
    // recibía el nombre y el importe de propina de cada mesero de Centro. Un
    // panel de toda la organización es otra pregunta —agregada POR sucursal— y
    // necesita su propio comando, no el ensanchamiento accidental de éste.
    if (sucursalId === null) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Para ver las propinas pendientes hace falta estar en una sucursal.',
      );
    }

    const rango = resolverRango(entrada.desde, entrada.hasta);
    const filtro = {
      organizacionId,
      sucursalId,
      meseroId: entrada.meseroId ?? null,
      ...rango,
    };

    const [renglones, meseros, ventas] = await ctx.paso('leer_pendientes', () =>
      Promise.all([
        desglosePendiente(ctx.tx, filtro),
        propinasPorMeseroPendientes(ctx.tx, filtro),
        ventasConPropinaPendiente(ctx.tx, filtro, entrada.limite),
      ]),
    );

    const desglose = desglosarPagos(renglones);
    // El número de ventas sale del agrupado por mesero, que cubre el periodo
    // entero. Contar `ventas.length` daría el tamaño de la página y el diálogo
    // enseñaría «50 ventas» de un periodo con trescientas.
    const numeroVentas = meseros.reduce((suma, mesero) => suma + mesero.numeroVentas, 0);

    return {
      desde: rango.inicio.toISOString(),
      hasta: rango.fin.toISOString(),
      meseroId: filtro.meseroId,
      totalCentavos: desglose.propinasCentavos.toString(),
      numeroVentas,
      desglose: servirDesglose(desglose),
      meseros,
      ventas,
      hayMasVentas: numeroVentas > ventas.length,
    };
  },
});
