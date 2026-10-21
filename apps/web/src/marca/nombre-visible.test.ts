import { describe, expect, it } from 'vitest';

import {
  MARCA_DE_PLATAFORMA,
  NOMBRE_DEL_SISTEMA,
  marcaVisibleDePlataforma,
  nombreVisibleDelNegocio,
  nombreVisibleDelSistema,
} from './nombre-visible';

describe('nombreVisibleDelNegocio', () => {
  it('quita el prefijo de demostración con que nace cada demo', () => {
    expect(nombreVisibleDelNegocio('Demo del acople · restaurante')).toBe('Restaurante');
    expect(nombreVisibleDelNegocio('Demo del acople · tienda')).toBe('Tienda');
  });

  it('devuelve el acento que el alta automática no puso', () => {
    expect(nombreVisibleDelNegocio('Demo del acople · cafeteria')).toBe('Cafetería');
    expect(nombreVisibleDelNegocio('Demo del acople · ferreteria')).toBe('Ferretería');
    expect(nombreVisibleDelNegocio('Demo del acople · estetica')).toBe('Estética');
  });

  it('tolera otros separadores y mayúsculas en el prefijo', () => {
    expect(nombreVisibleDelNegocio('DEMO DEL ACOPLE - tienda')).toBe('Tienda');
    expect(nombreVisibleDelNegocio('  demo del acople:  tienda ')).toBe('Tienda');
    expect(nombreVisibleDelNegocio('Demo del acople — Mi café')).toBe('Mi café');
  });

  it('con un resto que no es un giro, sólo le pone la mayúscula inicial', () => {
    expect(nombreVisibleDelNegocio('Demo del acople · taquería el güero')).toBe(
      'Taquería el güero',
    );
  });

  it('no retoca un nombre que escribió una persona', () => {
    expect(nombreVisibleDelNegocio('iStore Tijuana')).toBe('iStore Tijuana');
    expect(nombreVisibleDelNegocio('Restaurante MH')).toBe('Restaurante MH');
    expect(nombreVisibleDelNegocio('café jacaranda')).toBe('café jacaranda');
  });

  it('sólo quita «Demo del acople» al inicio y como palabra completa', () => {
    expect(nombreVisibleDelNegocio('Mi demo del acople · x')).toBe('Mi demo del acople · x');
    expect(nombreVisibleDelNegocio('Demo del acoplexyz')).toBe('Demo del acoplexyz');
  });

  it('cae a la marca cuando no queda nada que mostrar', () => {
    expect(nombreVisibleDelNegocio('')).toBe(MARCA_DE_PLATAFORMA);
    expect(nombreVisibleDelNegocio('   ')).toBe(MARCA_DE_PLATAFORMA);
    expect(nombreVisibleDelNegocio('Demo del acople')).toBe(MARCA_DE_PLATAFORMA);
    expect(nombreVisibleDelNegocio('Demo del acople · ')).toBe(MARCA_DE_PLATAFORMA);
  });

  it('cambia la marca anterior por la de hoy', () => {
    expect(nombreVisibleDelNegocio('MH Astral Systems')).toBe('Morphiq');
    expect(nombreVisibleDelNegocio('mh-astral-systems')).toBe('Morphiq');
  });

  it('nunca lanza, venga lo que venga', () => {
    expect(nombreVisibleDelNegocio(null)).toBe(MARCA_DE_PLATAFORMA);
    expect(nombreVisibleDelNegocio(undefined)).toBe(MARCA_DE_PLATAFORMA);
    expect(nombreVisibleDelNegocio(42)).toBe(MARCA_DE_PLATAFORMA);
    expect(nombreVisibleDelNegocio({})).toBe(MARCA_DE_PLATAFORMA);
  });

  it('es idempotente: aplicarla dos veces da lo mismo que una', () => {
    const entradas = [
      'Demo del acople · restaurante',
      'Demo del acople · Demo del acople · tienda',
      'MH Astral Systems',
      'Café Jacaranda',
      '',
      'Demo del acople',
    ];
    for (const entrada of entradas) {
      const una = nombreVisibleDelNegocio(entrada);
      expect(nombreVisibleDelNegocio(una)).toBe(una);
    }
  });
});

describe('marcaVisibleDePlataforma', () => {
  it('pone Morphiq donde faltaba o donde decía la marca anterior', () => {
    expect(marcaVisibleDePlataforma('')).toBe('Morphiq');
    expect(marcaVisibleDePlataforma(undefined)).toBe('Morphiq');
    expect(marcaVisibleDePlataforma('MH Astral Systems')).toBe('Morphiq');
  });

  it('respeta la marca que el negocio escribió a propósito', () => {
    expect(marcaVisibleDePlataforma('Agencia Aurora')).toBe('Agencia Aurora');
    expect(marcaVisibleDePlataforma('Morphiq')).toBe('Morphiq');
  });

  it('el nombre de código del producto («MorphiqPOS») se lee Morphiq, no el del repositorio', () => {
    // El documento del corte lo usa como marca cuando el negocio no escribió una.
    expect(marcaVisibleDePlataforma('MorphiqPOS')).toBe('Morphiq');
    expect(marcaVisibleDePlataforma('Morphiq POS')).toBe('Morphiq');
  });

  it('es idempotente', () => {
    for (const entrada of ['', 'MH Astral Systems', 'MorphiqPOS', 'Agencia Aurora']) {
      const una = marcaVisibleDePlataforma(entrada);
      expect(marcaVisibleDePlataforma(una)).toBe(una);
    }
  });
});

describe('nombreVisibleDelSistema', () => {
  it('corrige el nombre anterior del sistema conservando el resto de la frase', () => {
    expect(nombreVisibleDelSistema('MH Astral POS')).toBe('Morphiq POS');
    expect(nombreVisibleDelSistema('MH Astral Systems POS')).toBe('Morphiq POS');
    expect(nombreVisibleDelSistema('MH-Astral-Systems')).toBe('Morphiq');
  });

  it('con el campo vacío dice Morphiq POS', () => {
    expect(nombreVisibleDelSistema(null)).toBe(NOMBRE_DEL_SISTEMA);
    expect(nombreVisibleDelSistema('  ')).toBe('Morphiq POS');
  });

  it('respeta un nombre escrito a mano', () => {
    expect(nombreVisibleDelSistema('Caja del Jacaranda')).toBe('Caja del Jacaranda');
  });

  it('separa el nombre de código: «MorphiqPOS» se lee «Morphiq POS»', () => {
    expect(nombreVisibleDelSistema('MorphiqPOS')).toBe('Morphiq POS');
  });
});
