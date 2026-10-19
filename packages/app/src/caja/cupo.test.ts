import type { Ambito } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { entradaAbrirCaja } from '../venta/esquemas.ts';

import { abrirCaja } from './sesion.ts';

/**
 * F-235 · EL CUPO DE CAJAS DE LA SUCURSAL (179, destapado por el día completo de la 2.4).
 *
 * Lo que se defiende: con el cupo en uno —el de todo negocio que no lo cambió— una
 * segunda caja se rechaza igual que con el índice de la 046; con el cupo en dos, la
 * segunda caja abre y la tercera no.
 *
 * Lo que la base falsa NO puede probar, y por eso vive en la integración contra Postgres
 * (`caja/cupo.integracion.test.ts`): el nombre de la terminal que tiene la caja (sale de
 * un `leftJoin`), el gasto que sale del cajón de SU terminal (una fecha calculada en SQL)
 * y el disparador de la 179, que es quien de verdad hace cumplir el cupo.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const TERMINAL = '33333333-3333-4333-8333-333333333333';
const BARRA_2 = '34444444-4444-4444-8444-444444444444';
const BARRA_3 = '35555555-5555-4555-8555-555555555555';
const EMPLEO = '55555555-5555-4555-8555-555555555555';
const AHORA = new Date('2026-10-10T15:00:00.000Z');

const ambito = (terminalId = TERMINAL): Ambito => ({
  organizacionId: ORG,
  sucursalId: SUCURSAL,
  terminalId,
  identidadId: '44444444-4444-4444-8444-444444444444',
  empleoId: EMPLEO,
  rol: 'cajero',
});

function abierta(id: string, terminalId: string): Fila {
  return {
    id,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    terminal_id: terminalId,
    estado: 'abierta',
    serie: 'A',
    folio: null,
    fondo_inicial_centavos: 100_000n,
    abierta_en: new Date('2026-10-10T13:00:00.000Z'),
  };
}

function base(cupo: number, abiertas: readonly Fila[]) {
  return crearBaseFalsa({
    sucursales: [{ id: SUCURSAL, organizacion_id: ORG, cajas_simultaneas: cupo }],
    terminales: [
      { id: BARRA_2, organizacion_id: ORG, nombre: 'Barra 2' },
      { id: BARRA_3, organizacion_id: ORG, nombre: 'Barra 3' },
    ],
    organizaciones: [{ id: ORG, zona_horaria: 'America/Mexico_City' }],
    sesiones_caja: [...abiertas],
    movimientos_caja: [],
  });
}

const abrir = (b: ReturnType<typeof base>, terminal = TERMINAL) =>
  abrirCaja.ejecutar(
    contextoFalso(b.tx, ambito(terminal), AHORA).ctx,
    entradaAbrirCaja.parse({ fondoInicialCentavos: 80_000 }),
  );

describe('F-235 · cuántas cajas abre una sucursal', () => {
  it('con el cupo en uno, la segunda se rechaza', async () => {
    const b = base(1, [abierta('s-barra-2', BARRA_2)]);
    await expect(abrir(b)).rejects.toMatchObject({ codigo: 'CAJA_YA_ABIERTA' });
    expect(b.filas('sesiones_caja')).toHaveLength(1);
  });

  it('con el cupo en dos, la segunda abre y la tercera no', async () => {
    const b = base(2, [abierta('s-barra-2', BARRA_2)]);
    await abrir(b);
    expect(b.filas('sesiones_caja').filter((f) => f['estado'] === 'abierta')).toHaveLength(2);
    await expect(abrir(b, BARRA_3)).rejects.toMatchObject({ codigo: 'CAJA_YA_ABIERTA' });
  });
});
