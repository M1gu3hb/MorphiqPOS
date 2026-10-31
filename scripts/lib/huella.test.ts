import { describe, expect, it } from 'vitest';

import { compararHuellas, type Huella, type MesaAbsorbida } from './huella.mjs';

/**
 * PAR-1 · LA COMPARACIÓN DE DOS HUELLAS. Pura: decide qué cambio se esperaba (el relleno de la
 * 187) y cuál no. La toma contra Postgres se ensaya de punta a punta con `paridad-laptop.mjs`.
 */
const NEGOCIOS = [
  { id: 'org-a', slug: 'a' },
  { id: 'org-b', slug: 'b' },
];

const mesaAbsorbida = (unida: string | null): MesaAbsorbida => ({
  mesa: 'mesa-2',
  principal: 'mesa-1',
  org: 'org-a',
  md5: 'resto-de-la-mesa-2',
  unida,
});

function huella(cambios: Partial<Huella> = {}): Huella {
  return {
    tomada: '2026-10-31T00:00:00.000Z',
    organizaciones: NEGOCIOS,
    tablas: {
      mesas: {
        columnas: ['id', 'numero'],
        nueva: false,
        porNegocio: { 'org-a': { n: 11, md5: 'm-a' }, 'org-b': { n: 4, md5: 'm-b' } },
      },
      productos: {
        columnas: ['id', 'nombre'],
        nueva: false,
        porNegocio: { 'org-a': { n: 27, md5: 'p-a' }, 'org-b': { n: 18, md5: 'p-b' } },
      },
    },
    absorbidas: [mesaAbsorbida(null)],
    marcadas: [],
    ...cambios,
  };
}

describe('la comparación de dos huellas', () => {
  it('dos tomas iguales: idéntica, sin relleno', () => {
    const r = compararHuellas(huella(), huella());
    expect(r.diferencias).toEqual([]);
    expect(r.relleno).toBe(0);
  });

  it('después de la 187: el relleno marca la absorbida y las tablas nuevas están vacías', () => {
    const despues = huella({
      tablas: {
        ...huella().tablas,
        carritos_mesa: { columnas: ['mesa_id'], nueva: true, porNegocio: {} },
      },
      absorbidas: [mesaAbsorbida('mesa-1')],
      marcadas: ['mesa-2'],
    });
    const r = compararHuellas(huella(), despues);
    expect(r.diferencias).toEqual([]);
    expect(r.relleno).toBe(1);
    expect(r.uniones).toBe(1);
    expect(r.nuevas).toEqual(['carritos_mesa']);
  });

  it('una fila de OTRO negocio que cambió es una diferencia, con su tabla y su negocio', () => {
    const despues = huella();
    const tablas = {
      ...despues.tablas,
      productos: {
        ...despues.tablas['productos']!,
        porNegocio: { 'org-a': { n: 27, md5: 'p-a' }, 'org-b': { n: 18, md5: 'OTRO' } },
      },
    };
    const r = compararHuellas(huella(), { ...despues, tablas });
    expect(r.diferencias).toEqual([
      'productos · org-b: 18 → 18 filas (mismas filas, contenido distinto)',
    ]);
  });

  it('una tabla nueva con filas no es «nueva y vacía»', () => {
    const despues = huella({
      tablas: {
        ...huella().tablas,
        carritos_mesa: {
          columnas: ['mesa_id'],
          nueva: true,
          porNegocio: { 'org-a': { n: 1, md5: 'x' } },
        },
      },
    });
    expect(compararHuellas(huella(), despues).diferencias).toEqual([
      'carritos_mesa: tabla nueva con 1 filas',
    ]);
  });

  it('una absorbida marcada con otra principal, o una mesa de más marcada, se denuncian', () => {
    const mal = compararHuellas(
      huella(),
      huella({ absorbidas: [mesaAbsorbida('mesa-9')], marcadas: ['mesa-2'] }),
    );
    expect(mal.diferencias).toContain(
      'unida_a_mesa_id no marca exactamente a las mesas absorbidas',
    );
    const demas = compararHuellas(
      huella(),
      huella({ absorbidas: [mesaAbsorbida('mesa-1')], marcadas: ['mesa-2', 'mesa-7'] }),
    );
    expect(demas.diferencias).toContain(
      'unida_a_mesa_id no marca exactamente a las mesas absorbidas',
    );
  });

  it('una absorbida a la que le cambió algo más que su relleno se denuncia', () => {
    const r = compararHuellas(
      huella(),
      huella({
        absorbidas: [{ ...mesaAbsorbida('mesa-1'), md5: 'otra-cosa' }],
        marcadas: ['mesa-2'],
      }),
    );
    expect(r.diferencias).toEqual(['mesa absorbida mesa-2: cambió algo más que su relleno']);
  });

  it('un negocio de más o de menos cambia la lista', () => {
    const r = compararHuellas(huella(), huella({ organizaciones: [NEGOCIOS[0]!] }));
    expect(r.diferencias).toContain('cambió la lista de negocios');
  });
});
