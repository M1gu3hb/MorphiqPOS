import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import * as consultas from './consultas.ts';
import * as mostrador from './extras-mostrador.ts';
import * as salon from './extras-salon.ts';
import * as extras from './extras.ts';
import { transaccionGrabadora } from '../../pruebas/grabadora.ts';

/**
 * EL SQL QUE LA HOJA DEL CORTE EMITE DE VERDAD (C.6 de la 2.4).
 *
 * Las consultas de la hoja van en `sql` crudo, y la base falsa de las pruebas devuelve lo
 * mismo a cualquier consulta crudo: una consulta que olvidara su organización seguiría en
 * verde. Aquí hay un Kysely REAL con el compilador de Postgres sobre una conexión que
 * apunta lo que se le pide, y se afirma sobre lo compilado: cada consulta lleva el
 * negocio como parámetro —un corte de otro negocio no se cuela— y se acota a SU sesión o
 * a la ventana de su sesión, nunca a «todo».
 *
 * Lo que este archivo NO puede decir es que Postgres devuelva lo que creemos: eso lo dicen
 * los cinco e2e, que cierran por la pantalla y leen la hoja pintada contra la base viva.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SESION = '22222222-2222-4222-8222-222222222222';
const VENTANA = {
  sucursalId: '33333333-3333-4333-8333-333333333333',
  abiertaEn: new Date('2026-09-25T14:00:00Z'),
  cerradaEn: new Date('2026-09-26T03:00:00Z'),
};
const AHORA = new Date('2026-09-26T03:00:00Z');

const grabadora = () => transaccionGrabadora();

type Acotada = 'sesion' | 'ventana' | 'negocio';

/** Cada consulta de la hoja, con lo que la acota además del negocio. */
const CONSULTAS: readonly (readonly [string, Acotada, (tx: Transaccion) => Promise<unknown>])[] = [
  ['leerSesion', 'sesion', (tx) => consultas.leerSesion(tx, ORG, SESION)],
  ['movimientosPorTipo', 'sesion', (tx) => consultas.movimientosPorTipo(tx, ORG, SESION)],
  ['conteoDelCierre', 'sesion', (tx) => consultas.conteoDelCierre(tx, ORG, SESION)],
  ['ventasPorMetodo', 'sesion', (tx) => consultas.ventasPorMetodo(tx, ORG, SESION)],
  ['resumenDeVentas', 'sesion', (tx) => consultas.resumenDeVentas(tx, ORG, SESION)],
  ['detalleDeVentas', 'sesion', (tx) => consultas.detalleDeVentas(tx, ORG, SESION)],
  ['productosVendidos', 'sesion', (tx) => consultas.productosVendidos(tx, ORG, SESION)],
  ['ventasPorPersona', 'sesion', (tx) => consultas.ventasPorPersona(tx, ORG, SESION)],
  ['gastosDelCorte', 'sesion', (tx) => consultas.gastosDelCorte(tx, ORG, SESION)],
  ['cancelacionesDelCorte', 'ventana', (tx) => consultas.cancelacionesDelCorte(tx, ORG, VENTANA)],
  ['descuentosPorUsuario', 'sesion', (tx) => consultas.descuentosPorUsuario(tx, ORG, SESION)],
  ['alertasDeInventario', 'negocio', (tx) => consultas.alertasDeInventario(tx, ORG, AHORA)],
  ['insumosConsumidos', 'sesion', (tx) => consultas.insumosConsumidos(tx, ORG, SESION)],
  ['salidasSinVenta', 'ventana', (tx) => consultas.salidasSinVenta(tx, ORG, VENTANA)],
  ['propinasPorMesero', 'sesion', (tx) => extras.propinasPorMesero(tx, ORG, SESION)],
  ['ventasPorCanal', 'sesion', (tx) => extras.ventasPorCanal(tx, ORG, SESION)],
  ['consumoPorCanal', 'sesion', (tx) => extras.consumoPorCanal(tx, ORG, SESION)],
  ['modificadoresUsados', 'sesion', (tx) => extras.modificadoresUsados(tx, ORG, SESION)],
  ['repartoDelBote', 'sesion', (tx) => extras.repartoDelBote(tx, ORG, SESION)],
  ['mermaDeBarra', 'sesion', (tx) => extras.mermaDeBarra(tx, ORG, SESION)],
  ['consumoDeLaCasa', 'ventana', (tx) => extras.consumoDeLaCasa(tx, ORG, VENTANA)],
  ['sellosDelTurno', 'ventana', (tx) => extras.sellosDelTurno(tx, ORG, VENTANA)],
  ['noRecogidos', 'ventana', (tx) => extras.noRecogidos(tx, ORG, VENTANA)],
  ['carteraDelDia', 'ventana', (tx) => mostrador.carteraDelDia(tx, ORG, VENTANA)],
  ['saldosMasViejos', 'negocio', (tx) => mostrador.saldosMasViejos(tx, ORG, VENTANA)],
  ['cobrosDeCartera', 'sesion', (tx) => mostrador.cobrosDeCartera(tx, ORG, SESION)],
  ['operacionesDeTerceros', 'sesion', (tx) => mostrador.operacionesDeTerceros(tx, ORG, SESION)],
  ['salioSinCobrarse', 'ventana', (tx) => mostrador.salioSinCobrarse(tx, ORG, VENTANA)],
  ['materialCortado', 'ventana', (tx) => mostrador.materialCortado(tx, ORG, VENTANA)],
  ['turnosDelDia', 'sesion', (tx) => mostrador.turnosDelDia(tx, ORG, SESION)],
  ['comprasDelDia', 'ventana', (tx) => mostrador.comprasDelDia(tx, ORG, VENTANA)],
  ['cuentasPorPagar', 'negocio', (tx) => mostrador.cuentasPorPagar(tx, ORG, AHORA)],
  ['garantiasAbiertas', 'negocio', (tx) => mostrador.garantiasAbiertas(tx, ORG, AHORA)],
  ['autorizacionesDelDia', 'ventana', (tx) => mostrador.autorizacionesDelDia(tx, ORG, VENTANA)],
  ['faltantesDelConteo', 'ventana', (tx) => mostrador.faltantesDelConteo(tx, ORG, VENTANA)],
  ['serviciosDeMostrador', 'sesion', (tx) => mostrador.serviciosDeMostrador(tx, ORG, SESION)],
  [
    'liquidacionPorProfesional',
    'ventana',
    (tx) => salon.liquidacionPorProfesional(tx, ORG, VENTANA),
  ],
  ['productoDeCabina', 'ventana', (tx) => salon.productoDeCabina(tx, ORG, VENTANA)],
  ['serviciosSinFormula', 'ventana', (tx) => salon.serviciosSinFormula(tx, ORG, VENTANA)],
  ['cortesiasYRehechos', 'ventana', (tx) => salon.cortesiasYRehechos(tx, ORG, VENTANA)],
  ['contrapartidasDeComision', 'ventana', (tx) => salon.contrapartidasDeComision(tx, ORG, VENTANA)],
  ['paquetesDelDia', 'ventana', (tx) => salon.paquetesDelDia(tx, ORG, VENTANA)],
  ['anticiposDelDia', 'sesion', (tx) => salon.anticiposDelDia(tx, ORG, SESION, VENTANA)],
];

describe('la hoja del corte · cada consulta, acotada', () => {
  it.each(CONSULTAS)('%s lleva el negocio y se acota a su %s', async (_nombre, acotada, correr) => {
    const { tx, conexion } = grabadora();
    await correr(tx);
    expect(conexion.consultas).toHaveLength(1);
    const [consulta] = conexion.consultas;
    const parametros = consulta?.parameters ?? [];
    expect(
      parametros,
      'La consulta no lleva la organización: leería de todos los negocios.',
    ).toContain(ORG);
    expect(consulta?.sql).toMatch(/organizacion_id = \$\d+/);
    if (acotada === 'sesion') {
      expect(parametros, 'La consulta no se acota a la sesión del corte.').toContain(SESION);
    }
    if (acotada === 'ventana') {
      expect(
        parametros.some((p) => p instanceof Date && p.getTime() === VENTANA.abiertaEn.getTime()),
        'La consulta no se acota a la ventana de la sesión: sumaría días que no son del corte.',
      ).toBe(true);
    }
  });
});
