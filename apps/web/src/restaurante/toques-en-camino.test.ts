import { describe, expect, it } from 'vitest';

import { conLosToques, conToque, sinToque, type ToquesEnCamino } from './toques-en-camino.ts';

/**
 * DP-7 · LOS TOQUES DE LA COCINA QUE VAN EN CAMINO.
 *
 * La cocina relee su lista al contestar cada toque y cada dos segundos. Una lectura que salió
 * antes de que otro toque llegara a la base lo trae en su estado viejo, y pisaba lo que la
 * pantalla ya había pintado: la comanda regresaba a «Nuevos» un instante y el cocinero tocaba
 * la equivocada. Aquí se prueba la regla: mientras un toque va en camino, su comanda se pinta
 * como la dejó el toque, diga lo que diga la lectura.
 */

interface Comanda {
  readonly id: string;
  readonly estado: string;
  readonly fecha_inicio?: string;
  readonly fecha_listo?: string;
}

const A: Comanda = { id: 'a', estado: 'nuevo' };
const B: Comanda = { id: 'b', estado: 'nuevo' };
const vacio: ToquesEnCamino<Comanda> = new Map();

describe('los toques en camino sobre lo que se leyó', () => {
  it('una lectura vieja no regresa la comanda cuyo toque va en camino', () => {
    const toques = conToque(vacio, 'b', 1, { estado: 'en_preparacion' });

    expect(conLosToques([A, B], toques)).toEqual([A, { id: 'b', estado: 'en_preparacion' }]);
  });

  it('sin toques, la lectura se pinta tal cual', () => {
    expect(conLosToques([A, B], vacio)).toEqual([A, B]);
  });

  it('un toque de una comanda que la lectura no trae no inventa una fila', () => {
    const toques = conToque(vacio, 'z', 1, { estado: 'listo' });

    expect(conLosToques([A], toques)).toEqual([A]);
  });

  it('lo que no es una lista se lee como ninguna comanda', () => {
    expect(conLosToques(undefined, vacio)).toEqual([]);
    expect(conLosToques(null, vacio)).toEqual([]);
  });
});

describe('cuándo se suelta un toque', () => {
  it('al contestar el PRIMER toque de una comanda no se suelta el segundo, que sigue en camino', () => {
    // «Preparar» (toque 1) y luego «Listo» (toque 3) sobre la misma comanda; contesta el 1.
    const preparar = conToque(vacio, 'a', 1, { estado: 'en_preparacion', fecha_inicio: 't1' });
    const listo = conToque(preparar, 'a', 3, { estado: 'listo', fecha_listo: 't3' });
    const contestoElPrimero = sinToque(listo, 'a', 1);

    expect(conLosToques([A], contestoElPrimero)).toEqual([
      { id: 'a', estado: 'listo', fecha_inicio: 't1', fecha_listo: 't3' },
    ]);
  });

  it('al contestar el último, la comanda vuelve a pintarse como la lee el servidor', () => {
    const toques = conToque(vacio, 'a', 1, { estado: 'en_preparacion' });
    const leida: Comanda = { id: 'a', estado: 'en_preparacion', fecha_inicio: 'servidor' };

    expect(conLosToques([leida], sinToque(toques, 'a', 1))).toEqual([leida]);
  });

  it('soltar un toque que no está no cambia nada', () => {
    const toques = conToque(vacio, 'a', 2, { estado: 'listo' });

    expect(sinToque(toques, 'b', 2)).toBe(toques);
    expect(sinToque(toques, 'a', 1)).toBe(toques);
  });

  it('poner y soltar no tocan los toques de antes', () => {
    const antes = conToque(vacio, 'a', 1, { estado: 'en_preparacion' });
    const despues = conToque(antes, 'b', 2, { estado: 'en_preparacion' });
    sinToque(despues, 'a', 1);

    expect([...antes.keys()]).toEqual(['a']);
    expect([...despues.keys()]).toEqual(['a', 'b']);
    expect(vacio.size).toBe(0);
  });
});
