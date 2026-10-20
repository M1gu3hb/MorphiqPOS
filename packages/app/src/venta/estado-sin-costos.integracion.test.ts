import type { Rol } from '@morphiqpos/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  armarVenta,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { estadoDeVenta } from './consultas.ts';

/**
 * LA CUENTA SIN SU COSTO PARA QUIEN COBRA Y QUIEN ATIENDE · contra Postgres (cierre del 21-10).
 *
 * `venta.estado` devolvía el costo, la utilidad y el margen de la cuenta a la caja y al
 * mesero: con el precio a la vista, el margen de cada platillo. El puente ya lo cerraba en
 * `Venta`; el comando de la pantalla de venta lo dejaba abierto. Aquí se pide el estado de
 * la misma cuenta con tres puestos y se mira la respuesta del comando de producción.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;
let ordenId = '';

const ambitoCon = (rol: Rol) => ({
  ...ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null),
  rol,
});

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Cuenta con costo', rol: 'cajero' });
  sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1'] });
  const platillo = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Tacos al pastor',
    precioCentavos: 12_000n,
    existencia: '10',
  });
  ({ ordenId } = await armarVenta(ambitoCon('cajero'), [
    { productoId: platillo.productoId, cantidad: '2' },
  ]));
});

async function cotizacionCon(rol: Rol) {
  const estado = exigirOk(
    await comando(estadoDeVenta, { entrada: { ordenId }, ambito: ambitoCon(rol) }),
    `venta.estado (${rol})`,
  );
  if (estado.cotizacion === null) throw new Error('La cuenta no se cotizó.');
  return estado.cotizacion;
}

describe('venta.estado · el costo de la cuenta es de dirección', () => {
  it.each(['cajero', 'mesero'] as const)(
    '%s: el total sí, el costo, la utilidad y el margen no',
    async (rol) => {
      const cotizacion = await cotizacionCon(rol);
      expect(cotizacion.totalCentavos).toBe('24000');
      expect(cotizacion).toMatchObject({
        costoTotalCentavos: null,
        utilidadCentavos: null,
        margenBp: null,
      });
    },
  );

  it('la gerente sí los ve', async () => {
    const cotizacion = await cotizacionCon('gerente');
    expect(cotizacion.totalCentavos).toBe('24000');
    expect(cotizacion.costoTotalCentavos).not.toBeNull();
    expect(cotizacion.utilidadCentavos).not.toBeNull();
    expect(cotizacion.margenBp).not.toBeNull();
  });
});
