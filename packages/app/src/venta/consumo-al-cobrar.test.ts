import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calcularConsumo, type LineaParaConsumo } from '@morphiqpos/domain/inventario';
import { describe, expect, it } from 'vitest';

/**
 * EL CONTRATO QUE HABRÍA CAZADO EL INVENTARIO QUE NO SE MOVÍA.
 *
 * `planearConsumo` traducía SÓLO los productos con estrategia `sku`, con un
 * comentario que decía «recetas llegan en F1.3». En una tiendita eso basta: un
 * producto es un artículo del almacén. En un restaurante NO.
 *
 * Cobré una mesa de verdad para comprobarlo: la cerveza —que sí es `sku`— bajó
 * dos; **la arrachera y el guacamole no movieron un gramo**. El inventario no se
 * descontaba nunca y la pantalla de Inventario era decoración.
 *
 * Y ninguna prueba lo veía, porque `calcularConsumo` del dominio SÍ sabe hacer
 * recetas y tiene sus pruebas: lo que faltaba era el cable entre la orden y el
 * dominio. Las pruebas del dominio pasaban con el cable cortado.
 *
 * Este archivo prueba las dos mitades: que el dominio calcula bien la receta, y
 * que el traductor del cobro CONTEMPLA la estrategia. La segunda es la que
 * faltaba.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

describe('el consumo por receta, tal como lo usa el cobro', () => {
  it('multiplica la receta por la cantidad vendida', () => {
    // Dos arracheras: 280 g de arrachera, 150 g de frijol y 4 tortillas cada
    // una. Es la receta de la semilla de demostración, y el número que salió al
    // cobrar de verdad la mesa 5.
    const linea: LineaParaConsumo = {
      organizacionId: 'org',
      almacenId: 'alm',
      ordenId: 'orden',
      lineaId: 'linea',
      cantidad: '2',
      permiteVentaSinStock: false,
      estrategiaConsumo: 'receta',
      receta: [
        { insumoId: 'arrachera', cantidad: '280', unidad: 'g', unidadBase: 'g' },
        { insumoId: 'frijol', cantidad: '150', unidad: 'g', unidadBase: 'g' },
        { insumoId: 'tortilla', cantidad: '4', unidad: 'pieza', unidadBase: 'pieza' },
      ],
    };
    const movimientos = calcularConsumo([linea]);
    const porInsumo = Object.fromEntries(movimientos.map((m) => [m.insumoId, m.cantidad]));
    expect(porInsumo['arrachera']).toBe('560');
    expect(porInsumo['frijol']).toBe('300');
    expect(porInsumo['tortilla']).toBe('8');
  });

  it('la merma viene en POR CIENTO, no en puntos base', () => {
    // La base guarda `merma_bp` (500 = 5 %) y el dominio espera por ciento.
    // Pasar 500 donde va 5 descontaría CIEN VECES de más: 100 g se volverían
    // 600 g, y el inventario se vaciaría en una tarde sin que nadie entendiera
    // por qué. Por eso el traductor divide entre cien.
    const conMerma = calcularConsumo([
      {
        organizacionId: 'org',
        almacenId: 'alm',
        ordenId: 'orden',
        lineaId: 'linea',
        cantidad: '1',
        permiteVentaSinStock: false,
        estrategiaConsumo: 'receta',
        receta: [
          { insumoId: 'x', cantidad: '100', unidad: 'g', unidadBase: 'g', mermaPorcentaje: '5' },
        ],
      },
    ]);
    expect(conMerma[0]?.cantidad).toBe('105');
  });

  it('un producto de receta sin líneas no descuenta, y no revienta la venta', () => {
    // Una receta recién vaciada es un estado legítimo. Bloquear el cobro por
    // eso dejaría al cajero sin poder cobrar por un dato de catálogo.
    const movimientos = calcularConsumo([
      {
        organizacionId: 'org',
        almacenId: 'alm',
        ordenId: 'orden',
        lineaId: 'linea',
        cantidad: '1',
        permiteVentaSinStock: false,
        estrategiaConsumo: 'receta',
        receta: [],
      },
    ]);
    expect(movimientos).toEqual([]);
  });
});

/**
 * El cable. Se afirma sobre el CUERPO de `planearConsumo` y no sobre el archivo
 * entero: la palabra «receta» aparece nueve veces en los comentarios de
 * `cobrar.ts`, y un contrato que la busque suelta pasaría con la función
 * traduciendo sólo `sku` — que es exactamente el estado en el que estaba.
 */
describe('el traductor del cobro contempla todas las estrategias que vende', () => {
  const fuente = readFileSync(join(AQUI, 'cobrar.ts'), 'utf8');
  const inicio = fuente.indexOf('async function planearConsumo');
  const cuerpo = fuente.slice(inicio);

  it('la función existe y se pudo recortar', () => {
    // Sin esto el contrato pasaría vacío el día que alguien la renombre,
    // afirmando en su nombre algo que ya no mira.
    expect(inicio).toBeGreaterThan(0);
    expect(cuerpo).toContain('calcularConsumo');
  });

  it('traduce `sku` Y `receta`', () => {
    // Sin comentarios: la explicación de por qué las recetas entran aquí está
    // justo encima de la función, y un contrato no puede afirmar sobre su
    // propia prosa.
    const codigo = cuerpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(codigo, 'el cobro dejó de descontar por SKU').toContain("=== 'sku'");
    expect(
      codigo,
      'el cobro NO descuenta por receta: vender una arrachera no movería un gramo',
    ).toContain("=== 'receta'");
  });
});
