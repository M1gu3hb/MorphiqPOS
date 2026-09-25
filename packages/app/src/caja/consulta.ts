import 'server-only';

import { PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * El estado del turno para la pantalla de corte (F1.1-C-10).
 *
 * ── Lo que esta consulta NO devuelve, y es la decisión que importa ─────────
 * **No devuelve el efectivo esperado antes del conteo.** El conteo es a ciegas:
 * si la pantalla dice «deberías tener $4,380.00» antes de contar, nadie cuenta
 * — se teclea esa cifra y el corte deja de servir para lo único que sirve, que
 * es detectar un faltante. Cuando ya recibió el efectivo contado, devuelve el
 * esperado y la diferencia calculados aquí, sin una fórmula paralela en el
 * navegador.
 *
 * `cerrarCaja` vuelve a derivar el número dentro de su propia transacción. La
 * vista previa puede cambiar si entra otra venta antes del clic final; el corte
 * y el PDF siempre conservan el resultado definitivo de esa transacción.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
export const entradaEstadoCaja = z.object({
  efectivoContadoCentavos: z.number().int().nonnegative().max(1_000_000_000).optional(),
});

export interface MovimientoVisible {
  readonly tipo: string;
  readonly montoCentavos: string;
  readonly motivo: string | null;
  readonly registradoEn: string;
}

export interface EstadoCaja {
  readonly abierta: boolean;
  readonly sesionCajaId: string | null;
  readonly abiertaEn: string | null;
  readonly fondoInicialCentavos: string;
  readonly ventasCentavos: string;
  readonly numeroVentas: number;
  readonly movimientos: readonly MovimientoVisible[];
  readonly efectivoEsperadoCentavos?: string;
  readonly diferenciaCentavos?: string;
  /**
   * EL FONDO POR MONTONES, como se contó al abrir (C.6 de la 2.4). La apertura ya lo
   * guardaba y nadie lo devolvía, así que el aviso de cambio de la cafetería vivía sólo
   * mientras su pestaña siguiera abierta. `null` cuando la sesión se abrió sin desglose
   * —todo quedó en «monedas» por convención—: decir «sin desglose» es más honesto que
   * enseñar como morralla un fondo del que nadie declaró la forma.
   */
  readonly fondoDesglosado?: DesgloseDelFondo;
}

export type DesgloseDelFondo = {
  readonly monedasCentavos: string;
  readonly chicosCentavos: string;
  readonly grandesCentavos: string;
} | null;

export const estadoDeCaja = definirComando<Transaccion, typeof entradaEstadoCaja, EstadoCaja>({
  nombre: 'caja.estado',
  entidad: 'sesion_caja',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEstadoCaja,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId } = ctx.ambito;

    const vacia: EstadoCaja = {
      abierta: false,
      sesionCajaId: null,
      abiertaEn: null,
      fondoInicialCentavos: '0',
      ventasCentavos: '0',
      numeroVentas: 0,
      movimientos: [],
    };

    if (terminalId === null) return vacia;

    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) return vacia;

    const [arqueo, movimientos, fondo] = await Promise.all([
      repoCaja.arqueoDeSesion(ctx.tx, organizacionId, sesion.id),
      repoCaja.movimientosDeCorte(ctx.tx, organizacionId, sesion.id),
      repoCaja.fondoPorMontones(ctx.tx, organizacionId, sesion.id),
    ]);

    return {
      abierta: true,
      sesionCajaId: sesion.id,
      abiertaEn: sesion.abiertaEn.toISOString(),
      fondoInicialCentavos: arqueo.fondoInicialCentavos.toString(),
      ventasCentavos: arqueo.ventasCentavos.toString(),
      numeroVentas: arqueo.numeroVentas,
      ...(entrada.efectivoContadoCentavos === undefined
        ? {}
        : {
            efectivoEsperadoCentavos: arqueo.efectivoEsperadoCentavos.toString(),
            diferenciaCentavos: (
              BigInt(entrada.efectivoContadoCentavos) - arqueo.efectivoEsperadoCentavos
            ).toString(),
          }),
      fondoDesglosado: desgloseDeclarado(fondo),
      movimientos: movimientos.map((m) => ({
        tipo: m.tipo,
        montoCentavos: m.montoCentavos.toString(),
        motivo: m.motivo,
        registradoEn: m.registradoEn.toISOString(),
      })),
    };
  },
});

/**
 * El desglose, si se declaró. Sin desglose la apertura deja todo en «monedas» con chicos y
 * grandes en cero: eso se lee como «sin desglose», no como un fondo entero en morralla.
 */
export function desgloseDeclarado(fondo: {
  readonly monedas: bigint;
  readonly chicos: bigint;
  readonly grandes: bigint;
}): DesgloseDelFondo {
  if (fondo.chicos === 0n && fondo.grandes === 0n) return null;
  return {
    monedasCentavos: fondo.monedas.toString(),
    chicosCentavos: fondo.chicos.toString(),
    grandesCentavos: fondo.grandes.toString(),
  };
}
