import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { declararEquivalenciaDicha } from './equivalencia-dicha.ts';

/**
 * F-060 · Lo que el mostradorista teclea, resuelto contra el catálogo.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que un texto que encaja con VARIAS piezas no escriba nada. Es la prueba que
 * importa: una equivalencia declarada sobre la pieza equivocada le ofrece al
 * cliente algo que no le sirve, y con la confianza de que alguien lo comprobó.
 *
 * Que la CLAVE gane al nombre, porque quien teclea una clave está señalando una
 * pieza concreta y no describiendo una.
 *
 * Que los comodines de `ilike` vayan escapados: teclear un «%» no puede pedir el
 * catálogo entero.
 *
 * Y que lo tecleado quede en la nota, que es lo que hay que leer después si la
 * pieza resultó ser la equivocada.
 */

const AHORA = new Date('2026-09-19T15:00:00.000Z');
const PIEZA = 'b1111111-1111-4111-8111-111111111111';
const METRICO = 'b2222222-2222-4222-8222-222222222222';
const OTRO = 'b3333333-3333-4333-8333-333333333333';

function producto(id: string, nombre: string, extra: Fila = {}): Fila {
  return {
    id,
    organizacion_id: ORG,
    nombre,
    activo: true,
    sku: null,
    codigo_barras: null,
    ...extra,
  };
}

function baseDe(productos: readonly Fila[]) {
  return crearBaseFalsa(
    { productos: [...productos], equivalencias: [] },
    { predeterminados: { equivalencias: { bidireccional: false } } },
  );
}

describe('F-060 · declarar el equivalente que se dijo en el mostrador', () => {
  it('UN NOMBRE QUE ENCAJA CON UNA SOLA PIEZA la declara, con lo tecleado en la nota', async () => {
    const base = baseDe([
      producto(PIEZA, 'Tornillo tirafondo 1/2 × 2 galvanizado'),
      producto(METRICO, 'Tornillo tirafondo 13 mm × 50 mm galvanizado'),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await declararEquivalenciaDicha.ejecutar(ctx, {
      piezaId: PIEZA,
      texto: '13 mm',
      tipo: 'sustituto',
      nota: null,
    });

    expect(salida.equivalenteId).toBe(METRICO);
    expect(base.filas('equivalencias')).toHaveLength(1);
    expect(base.campo('equivalencias', 'producto_id')).toBe(PIEZA);
    expect(base.campo('equivalencias', 'equivalente_id')).toBe(METRICO);
    // Un sustituto va y viene: si la de 13 mm sirve por la de 1/2, la de 1/2
    // sirve por la de 13.
    expect(base.campo('equivalencias', 'bidireccional')).toBe(true);
    expect(String(base.campo('equivalencias', 'nota'))).toContain('13 mm');
  });

  it('UN TEXTO QUE ENCAJA CON VARIAS no escribe nada, y dice cuáles', async () => {
    const base = baseDe([
      producto(PIEZA, 'Tornillo tirafondo 1/2 × 2 galvanizado'),
      producto(METRICO, 'Tornillo tirafondo 13 mm × 50 mm galvanizado'),
      producto(OTRO, 'Tornillo tirafondo 13 mm × 75 mm inoxidable'),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await declararEquivalenciaDicha
      .ejecutar(ctx, { piezaId: PIEZA, texto: '13 mm', tipo: 'sustituto', nota: null })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(esErrorDominio(fallo) && fallo.message).toContain('50 mm');
    expect(base.filas('equivalencias')).toEqual([]);
  });

  it('LA CLAVE GANA AL NOMBRE cuando la clave aparece dentro de otro nombre', async () => {
    const base = baseDe([
      producto(PIEZA, 'Tornillo tirafondo 1/2 × 2 galvanizado'),
      producto(METRICO, 'Tornillo métrico 6 mm', { sku: 'TIR-6X50' }),
      producto(OTRO, 'Juego TIR-6X50 con tuerca'),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await declararEquivalenciaDicha.ejecutar(ctx, {
      piezaId: PIEZA,
      texto: 'tir-6x50',
      tipo: 'sustituto',
      nota: null,
    });

    // La de la clave, no el juego que la lleva en el nombre.
    expect(salida.equivalenteId).toBe(METRICO);
  });

  it('UN COMODÍN TECLEADO no pide el catálogo entero', async () => {
    const base = baseDe([
      producto(PIEZA, 'Tornillo tirafondo 1/2 × 2 galvanizado'),
      producto(METRICO, 'Tornillo métrico 6 mm'),
      producto(OTRO, 'Tuerca 6 mm'),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await declararEquivalenciaDicha
      .ejecutar(ctx, { piezaId: PIEZA, texto: '%', tipo: 'sustituto', nota: null })
      .catch((e: unknown) => e);

    // Sin escapar, el `%` encajaría con las tres y el mensaje hablaría de un
    // conflicto; escapado, no encaja con ninguna porque ningún nombre lleva «%».
    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PRODUCTO_NO_ENCONTRADO');
    expect(base.filas('equivalencias')).toEqual([]);
  });

  it('UNA PIEZA QUE NO ESTÁ EN EL CATÁLOGO lo dice, y no la da de alta', async () => {
    const base = baseDe([producto(PIEZA, 'Tornillo tirafondo 1/2 × 2 galvanizado')]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await declararEquivalenciaDicha
      .ejecutar(ctx, { piezaId: PIEZA, texto: 'birlo de 9 mm', tipo: 'sustituto', nota: null })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PRODUCTO_NO_ENCONTRADO');
    // Y el catálogo queda con la pieza que ya tenía: un alta sin precio ni costo
    // llenaría la búsqueda del mostrador de claves inservibles.
    expect(base.filas('productos')).toHaveLength(1);
  });

  it('UNA PIEZA DE OTRO NEGOCIO no se puede declarar equivalente', async () => {
    const base = baseDe([
      producto(PIEZA, 'Tornillo tirafondo 1/2 × 2 galvanizado'),
      producto(METRICO, 'Tornillo métrico 6 mm', {
        organizacion_id: 'a9999999-9999-4999-8999-999999999999',
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await declararEquivalenciaDicha
      .ejecutar(ctx, { piezaId: PIEZA, texto: 'métrico', tipo: 'sustituto', nota: null })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PRODUCTO_NO_ENCONTRADO');
    expect(base.filas('equivalencias')).toEqual([]);
  });
});
