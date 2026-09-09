import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { repoCaja } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * El estado del turno para la pantalla de corte (F1.1-C-10).
 *
 * ── Lo que esta consulta NO devuelve, y es la decisión que importa ─────────
 * **No devuelve el efectivo esperado.** El conteo es a ciegas: si la pantalla
 * dice «deberías tener $4,380.00» antes de contar, nadie cuenta — se teclea esa
 * cifra y el corte deja de servir para lo único que sirve, que es detectar un
 * faltante. Se enseña el fondo, las ventas y los movimientos manuales; lo
 * esperado y la diferencia aparecen DESPUÉS de decir cuánto hay.
 *
 * Ese número lo calcula `cerrarCaja` dentro de su propia transacción, así que
 * tampoco existe la ventana en la que la pantalla enseñe un esperado que ya
 * cambió porque entró otra venta.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const TODOS = ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'] as const;

export const entradaEstadoCaja = z.object({});

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
}

export const estadoDeCaja = definirComando<Transaccion, typeof entradaEstadoCaja, EstadoCaja>({
  nombre: 'caja.estado',
  entidad: 'sesion_caja',
  escribe: false,
  roles: [...ROLES],
  paquetes: [...TODOS],
  entrada: entradaEstadoCaja,
  async ejecutar(ctx) {
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
      // El esperado va DENTRO de `arqueo` y aquí se descarta a conciencia.
      movimientos: movimientos.map((m) => ({
        tipo: m.tipo,
        montoCentavos: m.montoCentavos.toString(),
        motivo: m.motivo,
        registradoEn: m.registradoEn.toISOString(),
      })),
    };
  },
});
