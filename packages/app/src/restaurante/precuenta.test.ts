import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { imprimirPrecuenta } from './precuenta.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type OpcionesBase,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import { ambitoDe, CUENTA, linea, mesa, ordenDeMesa, PREDETERMINADOS } from './pruebas/sala.ts';

/**
 * F-330 · La precuenta impresa, y la hoja que dice cuál hoja es.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que una cuenta YA COBRADA no imprima precuenta. Un papel que dice PRE-CUENTA
 * sobre algo pagado es la puerta por la que se cobra dos veces la misma mesa.
 *
 * Que una mesa sin consumo no imprima una hoja en blanco: una hoja vacía manda al
 * comensal a caja sin nada que revisar.
 *
 * Que el total salga de `cotizar` —el mismo código que cobra— y no de lo que la
 * pantalla haya sumado: la hoja y la caja no pueden discrepar.
 *
 * Y que la copia que devuelve sea la que dice la BASE. El número es lo que hace
 * que el cajero mire el total cuando la mesa siguió consumiendo entre dos hojas.
 */

const AHORA = new Date('2026-09-19T21:40:00.000Z');

const baseDe = (datos: TablasFalsas, opciones: OpcionesBase = {}) =>
  crearBaseFalsa(datos, { predeterminados: PREDETERMINADOS, ...opciones });

/** Lo que contesta el `update … returning precuentas_impresas` de la base. */
const hoja = (copia: number): OpcionesBase => ({ filasCrudas: [{ copia }] });

const mesaConsumiendo = (estadoOrden = 'cuenta_solicitada', cambios = {}) => ({
  ordenes: [ordenDeMesa(estadoOrden, cambios)],
  mesas: [mesa('cuenta_pedida')],
  orden_lineas: [linea()],
});

describe('restaurante.imprimir_precuenta', () => {
  it('LA PRIMERA HOJA sale con el total de `cotizar` y es la copia 1', async () => {
    const base = baseDe(mesaConsumiendo(), hoja(1));
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const impresa = await imprimirPrecuenta.ejecutar(ctx, { ordenId: CUENTA, anchoMm: 80 });

    expect(impresa.copia).toBe(1);
    expect(impresa.lineas.length).toBeGreaterThan(0);
    // El total no es cero: si `cotizar` no hubiera corrido, lo sería, y la hoja
    // saldría prometiendo una cuenta que la caja no va a cobrar.
    expect(BigInt(impresa.totalCentavos)).toBeGreaterThan(0n);
    expect(impresa.impresaEn).toBe(AHORA.toISOString());
    // El rastro lleva la copia y el total: es lo que se mira cuando una cuenta
    // se pagó con la hoja vieja.
    expect(auditorias[0]?.payload['copia']).toBe(1);
    expect(auditorias[0]?.payload['totalCentavos']).toBe(impresa.totalCentavos);
  });

  it('LA SEGUNDA HOJA devuelve la copia que dice la base, no un 1 otra vez', async () => {
    const base = baseDe(mesaConsumiendo('cuenta_solicitada', { precuentas_impresas: 1 }), hoja(2));
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const impresa = await imprimirPrecuenta.ejecutar(ctx, { ordenId: CUENTA, anchoMm: 80 });

    // La pantalla marca la hoja con esto. Contarlo en el servidor y no en el
    // navegador es lo que hace que la segunda hoja salga marcada también cuando
    // la imprime el mesero que releva, desde otra terminal.
    expect(impresa.copia).toBe(2);
  });

  it('UNA CUENTA YA PAGADA no tiene precuenta: tiene ticket', async () => {
    const base = baseDe(mesaConsumiendo('pagada'), hoja(1));
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await imprimirPrecuenta
      .ejecutar(ctx, { ordenId: CUENTA, anchoMm: 80 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('ORDEN_NO_EDITABLE');
  });

  it('UNA MESA SIN CONSUMO no imprime una hoja en blanco', async () => {
    const base = baseDe(
      { ordenes: [ordenDeMesa('confirmada')], mesas: [mesa('pedido_enviado')], orden_lineas: [] },
      hoja(1),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await imprimirPrecuenta
      .ejecutar(ctx, { ordenId: CUENTA, anchoMm: 80 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('ORDEN_VACIA');
  });

  it('UNA CUENTA DE OTRO NEGOCIO contesta como una que no existe', async () => {
    const base = baseDe(
      {
        ordenes: [
          ordenDeMesa('confirmada', { organizacion_id: 'a9999999-9999-4999-8999-999999999999' }),
        ],
        mesas: [mesa('cuenta_pedida')],
        orden_lineas: [linea()],
      },
      hoja(1),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const fallo = await imprimirPrecuenta
      .ejecutar(ctx, { ordenId: CUENTA, anchoMm: 80 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('ORDEN_NO_ENCONTRADA');
  });
});
