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
}

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

    const [arqueo, movimientos] = await Promise.all([
      repoCaja.arqueoDeSesion(ctx.tx, organizacionId, sesion.id),
      repoCaja.movimientosDeCorte(ctx.tx, organizacionId, sesion.id),
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
      movimientos: movimientos.map((m) => ({
        tipo: m.tipo,
        montoCentavos: m.montoCentavos.toString(),
        motivo: m.motivo,
        registradoEn: m.registradoEn.toISOString(),
      })),
    };
  },
});
