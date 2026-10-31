import { describe, expect, it } from 'vitest';

import {
  EVENTOS,
  MAPA,
  RECETAS,
  TECLAS_A_ELEGIR,
  esEventoDeSonido,
  recetaDe,
  type NombreDeReceta,
} from './mapa';
import {
  CLAVE_DEL_SONIDO,
  SONIDO_DE_OMISION,
  gananciaDe,
  guardarPreferenciaDeSonido,
  leerPreferenciaDeSonido,
} from './perfil-del-aparato';
import {
  ENTRE_REPETICIONES_MS,
  VENTANA_DE_LA_ACCION_MS,
  callaPorUnaAccion,
  debeSonar,
  esAccion,
  silencioDelPortal,
  type EstadoDelGestor,
} from './reglas-del-gestor';

/**
 * DP-11.3 · LOS SONIDOS DE LA INTERFAZ: el mapa de eventos, el perfil de cada aparato y cuándo
 * un sonido suena o se calla.
 */

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
  };
}

describe('el mapa', () => {
  it('los que escogió Miguel están en el mapa', () => {
    const usadas = new Set(EVENTOS.map((e) => MAPA[e].receta));
    for (const receta of ['felt', 'nib', 'pebble', 'bead', 'notch', 'halo', 'boop'] as const)
      expect(usadas.has(receta), receta).toBe(true);
  });

  it('cada evento suena con una receta de la biblioteca', () => {
    for (const evento of EVENTOS) expect(RECETAS).toContain(MAPA[evento].receta);
  });

  it('el teclado suena con lo que eligió el negocio; lo demás, con su receta', () => {
    for (const tecla of TECLAS_A_ELEGIR) expect(recetaDe('tecla', tecla)).toBe(tecla);
    expect(recetaDe('cobro', 'thock')).toBe('halo');
    expect(recetaDe('toque', 'keycap')).toBe('felt');
  });

  it('reconoce sus eventos y nada más', () => {
    expect(esEventoDeSonido('cobro')).toBe(true);
    expect(esEventoDeSonido('toString')).toBe(false);
    expect(esEventoDeSonido('ninguno')).toBe(false);
  });
});

describe('el sonido de este aparato', () => {
  it('sin nada guardado: «Suave» al 70', () => {
    expect(leerPreferenciaDeSonido(almacen())).toEqual({ perfil: 'suave', volumen: 70 });
    expect(leerPreferenciaDeSonido(null)).toEqual(SONIDO_DE_OMISION);
  });

  it('se guarda y se vuelve a leer', () => {
    const a = almacen();
    expect(guardarPreferenciaDeSonido(a, { perfil: 'normal', volumen: 40 })).toBe(true);
    expect(leerPreferenciaDeSonido(a)).toEqual({ perfil: 'normal', volumen: 40 });
    expect(a.datos.has(CLAVE_DEL_SONIDO)).toBe(true);
  });

  it('lo que no tiene forma se lee como lo de omisión, campo por campo', () => {
    const leer = (valor: unknown) =>
      leerPreferenciaDeSonido(almacen({ [CLAVE_DEL_SONIDO]: JSON.stringify(valor) }));
    expect(leerPreferenciaDeSonido(almacen({ [CLAVE_DEL_SONIDO]: '{roto' }))).toEqual(
      SONIDO_DE_OMISION,
    );
    expect(leer({ perfil: 'fuerte', volumen: 30 })).toEqual({ perfil: 'suave', volumen: 30 });
    expect(leer({ perfil: 'apagado', volumen: 130 })).toEqual({ perfil: 'apagado', volumen: 70 });
    expect(leer({ perfil: 'normal', volumen: -1 })).toEqual({ perfil: 'normal', volumen: 70 });
    expect(leer({ perfil: 'normal', volumen: 100 })).toEqual({ perfil: 'normal', volumen: 100 });
    expect(leer({ perfil: 'normal', volumen: 0 })).toEqual({ perfil: 'normal', volumen: 0 });
    expect(leer(null)).toEqual(SONIDO_DE_OMISION);
  });

  it('con el almacén bloqueado no lanza y dice que no guardó', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(leerPreferenciaDeSonido(roto)).toEqual(SONIDO_DE_OMISION);
    expect(guardarPreferenciaDeSonido(roto, SONIDO_DE_OMISION)).toBe(false);
    expect(guardarPreferenciaDeSonido(null, SONIDO_DE_OMISION)).toBe(false);
  });

  it('apagado no suena; suave suena más bajo que normal al mismo volumen', () => {
    expect(gananciaDe({ perfil: 'apagado', volumen: 100 })).toBe(0);
    expect(gananciaDe({ perfil: 'normal', volumen: 100 })).toBe(1);
    expect(gananciaDe({ perfil: 'normal', volumen: 50 })).toBe(0.5);
    const suave = gananciaDe({ perfil: 'suave', volumen: 100 });
    expect(suave).toBeGreaterThan(0.3);
    expect(suave).toBeLessThan(0.4);
  });
});

describe('cuándo suena', () => {
  const listo: EstadoDelGestor = {
    desbloqueado: true,
    ganancia: 1,
    hablando: false,
    silencioDelPortal: false,
    ultimas: new Map(),
  };
  const felt: NombreDeReceta = 'felt';

  it('listo, suena', () => {
    expect(debeSonar(listo, felt, 1_000)).toBe(true);
  });

  it('antes del primer toque, apagado, con la voz hablando o en el portal sin sonidos, no', () => {
    expect(debeSonar({ ...listo, desbloqueado: false }, felt, 1_000)).toBe(false);
    expect(debeSonar({ ...listo, ganancia: 0 }, felt, 1_000)).toBe(false);
    expect(debeSonar({ ...listo, hablando: true }, felt, 1_000)).toBe(false);
    expect(debeSonar({ ...listo, silencioDelPortal: true }, felt, 1_000)).toBe(false);
  });

  it('el mismo sonido no se repite antes de 80 ms; otro sí', () => {
    const ultimas = new Map<NombreDeReceta, number>([[felt, 1_000]]);
    const estado = { ...listo, ultimas };
    expect(ENTRE_REPETICIONES_MS).toBe(80);
    expect(debeSonar(estado, felt, 1_079)).toBe(false);
    expect(debeSonar(estado, felt, 1_080)).toBe(true);
    expect(debeSonar(estado, 'notch', 1_001)).toBe(true);
  });
});

describe('el contrato con el servidor', () => {
  it('los sonidos del teclado son los mismos que el servidor acepta al guardar', async () => {
    const { TECLAS_DE_SONIDO } = await import('@morphiqpos/app/configuracion');
    expect([...TECLAS_A_ELEGIR]).toEqual([...TECLAS_DE_SONIDO]);
    // Importar el paquete del servidor en frío tarda: el tope es para eso, no para la prueba.
  }, 30_000);
});

describe('el portal del comensal', () => {
  it('calla por omisión; suena si el negocio se lo da; el resto del POS no cambia', () => {
    expect(silencioDelPortal('/qr/abc123', false)).toBe(true);
    expect(silencioDelPortal('/qr/abc123', true)).toBe(false);
    expect(silencioDelPortal('/caja', false)).toBe(false);
    expect(silencioDelPortal('/configuracion?tab=sonidos', false)).toBe(false);
  });
});

describe('una acción calla a su alrededor', () => {
  it('el diálogo que cierra o abre y el toque, por un momento; lo demás, no', () => {
    expect(VENTANA_DE_LA_ACCION_MS).toBe(400);
    for (const evento of ['cobro', 'enviarACocina', 'agregar', 'ticket'] as const)
      expect(esAccion(evento), evento).toBe(true);
    expect(esAccion('abrir')).toBe(false);
    expect(callaPorUnaAccion('abrir', 1_000, 1_400)).toBe(true);
    expect(callaPorUnaAccion('cerrar', 1_399, 1_400)).toBe(true);
    expect(callaPorUnaAccion('toque', 1_000, 1_400)).toBe(true);
    expect(callaPorUnaAccion('abrir', 1_400, 1_400)).toBe(false);
    expect(callaPorUnaAccion('error', 1_000, 1_400)).toBe(false);
    expect(callaPorUnaAccion('cobro', 1_000, 1_400)).toBe(false);
  });
});
