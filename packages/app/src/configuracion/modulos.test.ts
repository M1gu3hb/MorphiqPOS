import { esErrorDominio, MODULOS_POR_PLANTILLA } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { fijarModulo, modulosDelNegocio, restablecerModulo } from './modulos.ts';

/**
 * F-015 y F-016 · Que la plantilla y las perillas GOBIERNEN, no que existan.
 *
 * Lo que se prueba aquí no es la aritmética de `modulosActivos()` —ésa ya tiene
 * su unitaria en `contracts`— sino las dos cosas que faltaban de verdad:
 *
 *   1. que el giro y la columna de la base se traduzcan a una plantilla, con
 *      los SEIS valores posibles, porque la 058 no está aplicada;
 *   2. que apagar una perilla y quitarla sean operaciones DISTINTAS.
 *
 * El caso que más importa es el de La Broca: giro `ferreteria`, paquete
 * `operativo`. Un renombre plano la mandaría a `cafeteria` —recetas y portal QR
 * donde deberían ir presentaciones y código de barras— y es un cliente que
 * paga.
 */

const AHORA = new Date('2026-09-15T18:00:00.000Z');

function negocio(giro: string, paquete: string, extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    organizaciones: [{ id: ORG, giro, paquete, activa: true }],
    organizacion_modulos: [],
    ...extra,
  };
}

const baseDe = (tablas: TablasFalsas) =>
  crearBaseFalsa(tablas, {
    predeterminados: {
      organizacion_modulos: { motivo: null, empleado_id: null },
    },
  });

describe('F-015 · la plantilla sale del giro Y del paquete, no de uno solo', () => {
  it('manda la ferretería en `operativo` a SU plantilla, nunca a `cafeteria`', async () => {
    const base = baseDe(negocio('ferreteria', 'operativo'));

    const perfil = await modulosDelNegocio(base.tx, ORG);

    // Éste es el caso de Ferretería La Broca. Un `update` plano de
    // `operativo → cafeteria` la habría dejado con mesero y cocina. Y desde la
    // 166 tampoco cae en la plantilla genérica de mostrador: tiene la SUYA, que
    // es la de tienda más mostrador por medida, corte, cotizaciones, crédito y
    // facturación.
    expect(perfil?.plantilla).toBe('ferreteria');
    expect(perfil?.activos.has('corte_de_material')).toBe(true);
    expect(perfil?.activos.has('recetas')).toBe(true);
    expect(perfil?.activos.has('mesero')).toBe(false);
  });

  it('deja al café con paquete completo en `restaurante`, aunque su giro sea cafetería', async () => {
    const base = baseDe(negocio('cafeteria', 'restaurante_pro'));

    const perfil = await modulosDelNegocio(base.tx, ORG);

    // Café Jacaranda. Bajarlo a `cafeteria` le quitaría mesero y cocina, que
    // son módulos que paga. El giro dice qué negocio es; la plantilla qué compró.
    expect(perfil?.plantilla).toBe('restaurante');
    expect(perfil?.activos.has('mesero')).toBe(true);
    expect(perfil?.activos.has('cocina')).toBe(true);
  });

  it('entiende también los nombres NUEVOS, porque la 058 puede estar aplicada', async () => {
    const base = baseDe(negocio('cafeteria', 'cafeteria'));

    const perfil = await modulosDelNegocio(base.tx, ORG);

    expect(perfil?.plantilla).toBe('cafeteria');
  });

  it('un giro desconocido cae a la plantilla más restrictiva, no a la más permisiva', async () => {
    const base = baseDe(negocio('lo_que_sea', 'restaurante_pro'));

    const perfil = await modulosDelNegocio(base.tx, ORG);

    expect(perfil?.plantilla).toBe('tienda');
    expect(perfil?.activos.has('mesero')).toBe(false);
  });

  it('devuelve null cuando la organización no está activa: no se puede fallar abierto', async () => {
    const base = baseDe({
      organizaciones: [{ id: ORG, giro: 'tienda', paquete: 'operativo', activa: false }],
      organizacion_modulos: [],
    });

    expect(await modulosDelNegocio(base.tx, ORG)).toBeNull();
  });
});

describe('F-016 · las perillas, que son excepciones al preajuste', () => {
  it('una perilla apagada quita el módulo del preajuste', async () => {
    const base = baseDe(
      negocio('ferreteria', 'operativo', {
        organizacion_modulos: [
          { organizacion_id: ORG, modulo: 'recetas', activo: false, motivo: 'no cocina nada' },
        ],
      }),
    );

    const perfil = await modulosDelNegocio(base.tx, ORG);

    expect(MODULOS_POR_PLANTILLA.tienda.includes('recetas')).toBe(true);
    expect(perfil?.activos.has('recetas')).toBe(false);
    expect(perfil?.personalizados).toEqual(['recetas']);
  });

  it('una perilla encendida añade un módulo que la plantilla no trae', async () => {
    const base = baseDe(
      negocio('ferreteria', 'operativo', {
        organizacion_modulos: [
          {
            organizacion_id: ORG,
            modulo: 'mesero',
            activo: true,
            motivo: 'tiene mesas en la terraza',
          },
        ],
      }),
    );

    const perfil = await modulosDelNegocio(base.tx, ORG);

    // Esto es lo que vende: «sí, y además te pongo mesas», sin inventar una
    // plantilla nueva por cada negociación.
    expect(perfil?.activos.has('mesero')).toBe(true);
  });

  it('una perilla con un módulo que ya no existe se ignora en vez de romper', async () => {
    const base = baseDe(
      negocio('tienda', 'operativo', {
        organizacion_modulos: [
          { organizacion_id: ORG, modulo: 'modulo_que_se_retiro', activo: true, motivo: 'viejo' },
        ],
      }),
    );

    const perfil = await modulosDelNegocio(base.tx, ORG);

    expect(perfil?.personalizados).toEqual([]);
    expect(perfil?.activos.has('inventario')).toBe(true);
  });

  it('`fijarModulo` escribe la perilla con su motivo y dice si cambia algo', async () => {
    const base = baseDe(negocio('tienda', 'operativo'));
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'), AHORA);

    const salida = await fijarModulo.ejecutar(ctx, {
      modulo: 'recetas',
      activo: false,
      motivo: 'La tienda no prepara nada y el menú confunde al cajero',
    });

    expect(base.campo('organizacion_modulos', 'modulo')).toBe('recetas');
    expect(base.campo('organizacion_modulos', 'activo')).toBe(false);
    expect(base.campo('organizacion_modulos', 'motivo')).toBe(
      'La tienda no prepara nada y el menú confunde al cajero',
    );
    // El preajuste de `tienda` SÍ trae recetas, así que apagarlo sí cambia algo.
    expect(salida.coincideConElPreajuste).toBe(false);
    expect(salida.plantilla).toBe('tienda');
  });

  it('avisa cuando la perilla no cambia nada, para no dejar basura que confunda', async () => {
    const base = baseDe(negocio('tienda', 'operativo'));
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await fijarModulo.ejecutar(ctx, {
      modulo: 'inventario',
      activo: true,
      motivo: 'quiero asegurarme de que está',
    });

    expect(salida.coincideConElPreajuste).toBe(true);
  });

  it('no escribe nada si no pudo leer la plantilla del negocio', async () => {
    const base = baseDe({ organizaciones: [], organizacion_modulos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await fijarModulo
      .ejecutar(ctx, { modulo: 'recetas', activo: false, motivo: 'da igual' })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('organizacion_modulos')).toHaveLength(0);
  });

  it('restablecer NO es apagar: devuelve el módulo a lo que diga la plantilla', async () => {
    const base = baseDe(
      negocio('tienda', 'operativo', {
        organizacion_modulos: [
          { organizacion_id: ORG, modulo: 'recetas', activo: false, motivo: 'no cocina' },
        ],
      }),
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'), AHORA);

    const salida = await restablecerModulo.ejecutar(ctx, { modulo: 'recetas' });

    expect(salida.habiaPerilla).toBe(true);
    // Sin la fila, el módulo vuelve a seguir al preajuste, que lo trae encendido.
    expect(salida.activo).toBe(true);
    expect(base.filas('organizacion_modulos')).toHaveLength(0);
  });

  it('restablecer un módulo sin perilla no falla, y lo dice', async () => {
    const base = baseDe(negocio('tienda', 'operativo'));
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'), AHORA);

    const salida = await restablecerModulo.ejecutar(ctx, { modulo: 'mesero' });

    expect(salida.habiaPerilla).toBe(false);
    // `mesero` no está en el preajuste de `tienda`: restablecer lo deja apagado.
    expect(salida.activo).toBe(false);
  });
});

describe('F-016 · quién puede tocar las perillas', () => {
  it('sólo administrador y dueño, porque una perilla es una decisión comercial', () => {
    expect([...fijarModulo.roles].sort()).toEqual(['administrador', 'dueno']);
    expect([...restablecerModulo.roles].sort()).toEqual(['administrador', 'dueno']);
  });

  it('el comando de perillas NO declara módulo: apagarlo dejaría el negocio sin forma de volver', () => {
    // Si `configuracion.fijar_modulo` colgara de una perilla, apagar esa perilla
    // sería un candado sin llave: no habría comando para volver a encenderla.
    expect(fijarModulo.modulo).toBeUndefined();
    expect(restablecerModulo.modulo).toBeUndefined();
  });
});
