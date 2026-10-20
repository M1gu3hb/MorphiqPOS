import { describe, expect, it } from 'vitest';

import {
  FALLOS_SEGUIDOS_PARA_AVISAR,
  MS_ENTRE_LECTURAS,
  avisoDeListaVieja,
  cambioLaLista,
} from './lista-por-cobrar.ts';

/**
 * D.1 de la 2.4 · La lista de «Cobrar» se mantiene al día sola.
 *
 * El defecto: la recepción cobraba a la primera clienta, la estilista cerraba el servicio de
 * la siguiente, y la tablet seguía diciendo «ninguna cita está lista para cobrar» hasta que
 * alguien tocaba «Volver a mirar». Estas pruebas fijan lo que decide si hay que releer.
 */

const cita = (id: string) => ({ id });

describe('cambioLaLista', () => {
  it('una cita nueva es un cambio: la que acaba de cerrar la estilista', () => {
    expect(cambioLaLista([], [cita('dany')])).toBe(true);
    expect(cambioLaLista([cita('karla')], [cita('karla'), cita('dany')])).toBe(true);
  });

  it('una que ya no está también: se cobró en otra caja', () => {
    expect(cambioLaLista([cita('karla'), cita('dany')], [cita('dany')])).toBe(true);
  });

  it('el mismo conjunto en otro orden NO es una novedad', () => {
    expect(cambioLaLista([cita('karla'), cita('dany')], [cita('dany'), cita('karla')])).toBe(false);
    expect(cambioLaLista([], [])).toBe(false);
  });

  it('una sale y otra entra a la vez: el total es el mismo y es un cambio', () => {
    expect(cambioLaLista([cita('karla')], [cita('dany')])).toBe(true);
  });
});

describe('avisoDeListaVieja', () => {
  it('un fallo suelto no alarma a nadie', () => {
    expect(avisoDeListaVieja(0)).toBeNull();
    expect(avisoDeListaVieja(1)).toBeNull();
    expect(avisoDeListaVieja(FALLOS_SEGUIDOS_PARA_AVISAR - 1)).toBeNull();
    // Y «seguidos» son varios: con uno solo bastaría un tropiezo de la red para alarmar.
    expect(FALLOS_SEGUIDOS_PARA_AVISAR).toBeGreaterThanOrEqual(2);
  });

  it('con los latidos fallando, dice qué puede faltar y qué hacer', () => {
    const aviso = avisoDeListaVieja(FALLOS_SEGUIDOS_PARA_AVISAR);
    expect(aviso).toContain('Puede faltar alguna cita');
    expect(aviso).toContain('Volver a mirar');
  });
});

describe('el latido', () => {
  it('es de segundos y no de minutos: la clienta está parada frente al mostrador', () => {
    expect(MS_ENTRE_LECTURAS).toBeGreaterThanOrEqual(2_000);
    expect(MS_ENTRE_LECTURAS).toBeLessThanOrEqual(10_000);
  });
});
