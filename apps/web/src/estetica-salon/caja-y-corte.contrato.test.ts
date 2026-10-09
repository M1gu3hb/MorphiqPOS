import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * D.1 de la 2.4 · LO QUE SALE DEL CAJÓN DEL SALÓN, por su pantalla.
 *
 * El gasto, la devolución, el retiro y el corte de turno existían en `src/venta/` y en la
 * caja de la tienda, y «Caja y corte» del salón no montaba ninguno: el dinero salía del
 * cajón a mano y el arqueo cerraba con un faltante sin explicación. Esta prueba lee el
 * código de las pantallas (sin comentarios: una pieza nombrada en un comentario no se
 * monta) y exige:
 *
 *   · que el salón monte las cuatro piezas, y las tres que sacan dinero DETRÁS de
 *     `estado.puedeAdministrar` —el servidor lo exige igual; enseñárselas a quien no puede
 *     es un botón que contesta 403—;
 *   · que el retiro sea UNO: el de `venta/RetiroDeCaja`, en la tienda y en el salón, con
 *     los `id` que leen los días completos;
 *   · que «El día» no vuelva a leer los campos que `caja.estado` no tiene.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function codigo(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SALON = 'estetica-salon/CajaYCorte.tsx';

describe('«Caja y corte» del salón', () => {
  it('monta el gasto, el retiro y la devolución, sólo para quien administra', () => {
    const fuente = codigo(SALON);
    const puerta = fuente.indexOf('estado.puedeAdministrar ?');
    expect(
      puerta,
      'Las piezas que sacan dinero no van detrás de `puedeAdministrar`.',
    ).toBeGreaterThan(-1);
    const detras = fuente.slice(puerta, fuente.indexOf(') : null}', puerta));
    for (const pieza of ['<GastoDeCaja', '<RetiroDeCaja', '<DevolucionDeVenta']) {
      expect(detras, `«Caja y corte» no monta ${pieza} para quien administra.`).toContain(pieza);
    }
  });

  it('monta el corte de turno con la caja abierta, para quien la tenga', () => {
    const fuente = codigo(SALON);
    expect(fuente).toMatch(/cerrado \? null : \([\s\S]*<CorteDeTurno \/>/);
  });

  it('«El día» lee sólo lo que `caja.estado` devuelve', () => {
    const fuente = codigo(SALON);
    for (const inexistente of [
      'cobradoCentavos',
      'liquidacionesCentavos',
      'propinasEntregadasCentavos',
      'rentasCobradasCentavos',
      'citasSinCerrar',
    ]) {
      expect(fuente, `«Caja y corte» vuelve a leer \`${inexistente}\`.`).not.toContain(inexistente);
    }
    expect(fuente).toContain('estadoDelSalon(');
  });
});

describe('el retiro es uno', () => {
  it('la tienda usa el de `venta/RetiroDeCaja` y no tiene el suyo', () => {
    const tienda = codigo('abarrotes/Caja.tsx');
    expect(tienda).toContain('<RetiroDeCaja');
    expect(tienda).not.toContain('retiro-importe');
  });

  it('con los `id` y el botón que leen los días completos', () => {
    const retiro = codigo('venta/RetiroDeCaja.tsx');
    expect(retiro).toContain('id="retiro-importe"');
    expect(retiro).toContain('id="retiro-motivo"');
    expect(retiro).toContain('Registrar el retiro');
    expect(retiro).toContain("'/api/caja/movimiento'");
  });
});
