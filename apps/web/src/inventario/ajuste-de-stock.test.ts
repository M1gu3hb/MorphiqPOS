import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { entradaAjustarStock } from '@morphiqpos/app/inventario';
import { describe, expect, it } from 'vitest';

import { cuerpoDelAjuste, puedeAjustarStock } from './ajuste-de-stock.ts';

/**
 * D.1 de la 2.4 · EL AJUSTE DE STOCK QUE MANDA LA PANTALLA, el que el servidor acepta.
 *
 * El diálogo mandaba una frase como `motivo` —la clave de `motivos_merma`— y todo ajuste
 * volvía rechazado; y el botón sólo lo veía el administrador aunque el almacén también
 * puede ajustar.
 */

const HEREDADO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'heredado');

describe('el ajuste de stock', () => {
  it('manda la CLAVE del motivo y lo escrito como nota, y el servidor lo acepta', () => {
    const cuerpo = cuerpoDelAjuste({
      almacenId: '11111111-1111-4111-8111-111111111111',
      insumoId: '22222222-2222-4222-8222-222222222222',
      cantidad: '-1',
      tipoLegible: 'Corrección de conteo',
      texto: '  conteo del anaquel: falta uno ',
    });

    expect(cuerpo.motivo).toBe('ajuste_conteo');
    expect(cuerpo.nota).toBe('Corrección de conteo: conteo del anaquel: falta uno');
    // El esquema del comando de verdad: una frase de más de 60 letras en `motivo` lo rompe.
    expect(entradaAjustarStock.safeParse(cuerpo).success).toBe(true);
  });

  it('la nota no pasa del largo que el comando admite', () => {
    const cuerpo = cuerpoDelAjuste({
      almacenId: 'a',
      insumoId: 'b',
      cantidad: '1',
      tipoLegible: 'Otro ajuste',
      texto: 'x'.repeat(400),
    });
    expect(cuerpo.nota).toHaveLength(300);
  });

  it('«Ajustar» lo ven el administrador y el almacén, como el servidor', () => {
    expect(puedeAjustarStock('administrador')).toBe(true);
    expect(puedeAjustarStock('almacen')).toBe(true);
    expect(puedeAjustarStock('caja')).toBe(false);
    expect(puedeAjustarStock(undefined)).toBe(false);
  });

  it('el diálogo y el inventario heredados usan las dos', () => {
    const dialogo = readFileSync(
      join(HEREDADO, 'components', 'inventario', 'AjustarStockDialog.jsx'),
      'utf8',
    );
    expect(dialogo).toContain('cuerpoDelAjuste({');
    const inventario = readFileSync(join(HEREDADO, 'pages', 'Inventario.jsx'), 'utf8');
    expect(inventario).toMatch(/\{puedeAjustar && \(\s*<Button[\s\S]*?Ajustar<\/span>/);
  });
});
