import { describe, expect, it } from 'vitest';

import {
  conLosToques,
  conToque,
  crearFilaPorClave,
  sinToque,
  type ToquesEnCamino,
} from './toques-en-camino.ts';

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

describe('los toques de UNA comanda van en fila', () => {
  /** Una tarea que no termina hasta que se le dice, y anota cuándo empezó y terminó. */
  function tarea(nombre: string, bitacora: string[], falla = false) {
    let soltar: () => void = () => undefined;
    const lista = new Promise<void>((resolver) => {
      soltar = resolver;
    });
    const correr = async (): Promise<string> => {
      bitacora.push(`empieza ${nombre}`);
      await lista;
      bitacora.push(`termina ${nombre}`);
      if (falla) throw new Error(nombre);
      return nombre;
    };
    return { correr, soltar: () => soltar() };
  }

  it('«Listo» sale hasta que contestó el «Preparar» de la misma comanda', async () => {
    const bitacora: string[] = [];
    const fila = crearFilaPorClave();
    const preparar = tarea('preparar', bitacora);
    const listo = tarea('listo', bitacora);

    const primero = fila.encolar('a', preparar.correr);
    const segundo = fila.encolar('a', listo.correr);
    await Promise.resolve();
    expect(bitacora).toEqual(['empieza preparar']);

    preparar.soltar();
    await primero;
    await new Promise((r) => setTimeout(r, 0));
    expect(bitacora).toEqual(['empieza preparar', 'termina preparar', 'empieza listo']);
    listo.soltar();
    expect(await segundo).toBe('listo');
  });

  it('dos comandas distintas no se esperan entre sí', async () => {
    const bitacora: string[] = [];
    const fila = crearFilaPorClave();
    const a = tarea('a', bitacora);
    const b = tarea('b', bitacora);

    void fila.encolar('a', a.correr);
    void fila.encolar('b', b.correr);
    await Promise.resolve();
    expect(bitacora).toEqual(['empieza a', 'empieza b']);
    a.soltar();
    b.soltar();
  });

  it('un toque que falla no traba los que siguen, y su fallo llega a quien lo pidió', async () => {
    const bitacora: string[] = [];
    const fila = crearFilaPorClave();
    const malo = tarea('malo', bitacora, true);
    const bueno = tarea('bueno', bitacora);

    const primero = fila.encolar('a', malo.correr);
    const segundo = fila.encolar('a', bueno.correr);
    malo.soltar();
    await expect(primero).rejects.toThrow('malo');
    bueno.soltar();
    expect(await segundo).toBe('bueno');
  });
});
