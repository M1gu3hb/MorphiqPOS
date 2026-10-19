import { describe, expect, it } from 'vitest';

import { apartarNota, notasEnEspera, retomarNota } from './notas-en-espera.ts';

const AHORA = new Date('2026-09-25T17:00:00.000Z');
const TORNILLOS = [{ productoId: 'tornillo', cantidad: 20, presentacion: null }];
const CAJA = [
  {
    productoId: 'tornillo',
    cantidad: 1,
    presentacion: { id: 'caja', etiqueta: 'Caja (100)', precioCentavos: 30_000 },
  },
];

describe('las notas que esperan', () => {
  it('se aparta con el número libre más chico, que se dice en voz alta', () => {
    const una = apartarNota([], TORNILLOS, 'el de la gorra', AHORA);
    expect(una?.numero).toBe(1);
    const dos = apartarNota(una?.lista ?? [], CAJA, null, AHORA);
    expect(dos?.numero).toBe(2);
    // Se retoma la 1: el siguiente que se aparte vuelve a ser la 1.
    const tras = retomarNota(dos?.lista ?? [], 1);
    expect(apartarNota(tras.lista, TORNILLOS, null, AHORA)?.numero).toBe(1);
  });

  it('retomarla la devuelve TAL CUAL, con su caja, y la quita de la espera', () => {
    const apartada = apartarNota([], CAJA, '  ', AHORA);
    const { lista, nota } = retomarNota(apartada?.lista ?? [], 1);
    expect(nota).toEqual({ numero: 1, quien: null, partidas: CAJA, desde: AHORA.toISOString() });
    expect(lista).toEqual([]);
    expect(retomarNota(lista, 7).nota).toBeNull();
  });

  it('una nota vacía no se aparta', () => {
    expect(apartarNota([], [], 'nadie', AHORA)).toBeNull();
  });

  it('lo guardado que no tiene forma de nota se descarta', () => {
    const texto = JSON.stringify([
      { numero: 1, quien: null, partidas: TORNILLOS, desde: AHORA.toISOString() },
      { numero: 'dos', quien: null, partidas: TORNILLOS, desde: AHORA.toISOString() },
      { numero: 3, quien: null, partidas: [], desde: AHORA.toISOString() },
      { numero: 4, quien: 5, partidas: TORNILLOS, desde: AHORA.toISOString() },
    ]);
    expect(notasEnEspera(texto).map((n) => n.numero)).toEqual([1]);
    expect(notasEnEspera('{roto')).toEqual([]);
  });
});
