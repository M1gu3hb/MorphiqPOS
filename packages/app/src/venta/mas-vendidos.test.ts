import { describe, expect, it } from 'vitest';

import { transaccionGrabadora } from '../pruebas/grabadora.ts';
import { masVendidosDe } from './mas-vendidos.ts';

/**
 * «LOS OCHO DE SIEMPRE», CONTADOS EN EL SERVIDOR (C.10 de la 2.4).
 *
 * Se afirma sobre el SQL que emite de verdad —el compilador de Postgres real sobre una
 * conexión que lo apunta—, porque es SQL crudo y la base falsa devolvería lo mismo a una
 * consulta que olvidara su negocio. Lo que Postgres devuelve lo dice el e2e de la tienda.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const DESDE = new Date('2026-08-26T00:00:00Z');

async function compilada() {
  const { tx, conexion } = transaccionGrabadora([[{ productoId: 'p1', vendidas: '40.0000' }]]);
  const filas = await masVendidosDe(tx, ORG, DESDE, 8);
  const consulta = conexion.consultas[0];
  if (consulta === undefined) throw new Error('no salió ninguna consulta');
  const texto = consulta.sql.replace(/\s+/g, ' ');
  return { filas, texto, parametros: consulta.parameters };
}

describe('venta.mas_vendidos', () => {
  it('cuenta sólo en ESTE negocio', async () => {
    const { texto, parametros } = await compilada();
    expect(texto).toMatch(/where l\.organizacion_id = \$1/);
    expect(parametros[0]).toBe(ORG);
    // La orden, del mismo negocio que su línea: un id ajeno no se cuela por el join.
    expect(texto).toMatch(/o\.organizacion_id = l\.organizacion_id/);
  });

  it('cuenta sólo lo VENDIDO en la ventana', async () => {
    const { texto, parametros } = await compilada();
    expect(texto).toMatch(/o\.estado in \(\$2, \$3\)/);
    expect(parametros.slice(1, 3)).toEqual(['pagada', 'parcialmente_reembolsada']);
    expect(texto).toMatch(/>= \$4/);
    expect(parametros[3]).toEqual(DESDE);
  });

  it('sin anuladas ni canjes, por piezas, de más a menos, y sólo los que pide', async () => {
    const { texto, parametros } = await compilada();
    expect(texto).toContain('l.anulada_en is null');
    expect(texto).toContain("l.tipo_linea = 'venta'");
    expect(texto).toMatch(/order by sum\(l\.cantidad\) desc/);
    expect(texto).toMatch(/limit \$5/);
    expect(parametros[4]).toBe(8);
  });

  it('devuelve lo que contó, sin rellenar', async () => {
    const { filas } = await compilada();
    expect(filas).toEqual([{ productoId: 'p1', vendidas: '40.0000' }]);
  });
});
