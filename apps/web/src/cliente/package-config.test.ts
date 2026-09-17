import { MODULOS, MODULOS_POR_PLANTILLA, PLANTILLAS } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  PACKAGE_MODULES,
  ROUTE_TO_MODULE,
  canAccessModule,
  getCurrentPackage,
  isRouteAllowed,
} from './package-config.ts';

/**
 * T2 · La PLANTILLA decide lo que se ve, y decide lo mismo que el servidor.
 *
 * ── El defecto que estas pruebas impiden que vuelva ────────────────────────
 * `getCurrentPackage` sólo entendía los tres nombres comerciales viejos
 * —`esencial`, `operativo`, `restaurante_pro`— y caía en un valor por omisión
 * con cualquier otro. Cuando el servidor empezó a normalizar a los nombres de
 * D-01, «cualquier otro» pasaron a ser TODOS los negocios: una tienda de
 * abarrotes recibía el menú de sala entero y el dashboard del restaurante,
 * porque ese valor por omisión era el paquete más permisivo.
 *
 * Por eso aquí no basta con comprobar que los tres nombres nuevos se reconocen:
 * hay que fijar la DIRECCIÓN del valor por omisión y la correspondencia con
 * `MODULOS_POR_PLANTILLA`, que es lo que el servidor consulta antes de aceptar
 * un POST. Un menú que ofrece lo que el POST rechaza es peor que un menú corto.
 */

/** Los módulos de sala. Ninguno de los dos mostradores puede traerlos. */
const MODULOS_DE_SALA = ['mesas', 'mesero', 'cocina', 'barra', 'pedidos_mesa'] as const;

/** Las rutas de sala, tal como las filtra el menú lateral. */
const RUTAS_DE_SALA = ['/mesero', '/cocina', '/barra', '/mesas'] as const;

describe('T2 · plantillas reconocidas', () => {
  it.each(PLANTILLAS)('«%s» se resuelve a sí misma', (plantilla) => {
    expect(getCurrentPackage({ paquete_modo: plantilla })).toBe(plantilla);
  });

  /**
   * Los nombres viejos siguen entrando mientras la migración del renombre no
   * esté aplicada, y mientras un navegador pueda tener cacheada una pestaña
   * anterior al despliegue.
   *
   * `operativo` cae en `tienda` y NO en `cafeteria` a propósito: aquí no hay
   * giro, y el servidor sólo manda `operativo` a `cafeteria` cuando el giro es
   * de alimentos (D-12). Traducirlo a `cafeteria` sin saber el giro pondría a
   * Ferretería La Broca en la plantilla de un negocio de café. Las dos traen
   * exactamente los mismos módulos, así que no se pierde ni se gana ninguno.
   */
  it.each([
    ['esencial', 'tienda'],
    ['operativo', 'tienda'],
    ['restaurante_pro', 'restaurante'],
  ] as const)('el nombre heredado «%s» se traduce a «%s»', (heredado, plantilla) => {
    expect(getCurrentPackage({ paquete_modo: heredado })).toBe(plantilla);
    expect(PACKAGE_MODULES[plantilla]).toEqual(
      PACKAGE_MODULES[getCurrentPackage({ paquete_modo: heredado })],
    );
  });

  it.each([
    ['un nombre inventado', 'plan_oro'],
    ['el nombre de un giro que no es plantilla', 'ferreteria'],
    ['vacío', ''],
    ['ausente', undefined],
    ['nulo', null],
    ['un número', 3],
  ] as const)('%s cae en la plantilla MÁS RESTRICTIVA', (_caso, valor) => {
    expect(getCurrentPackage({ paquete_modo: valor })).toBe('tienda');
    expect(getCurrentPackage(null)).toBe('tienda');

    // Lo que importa no es que sea `tienda`, sino que NO abra la sala. Si
    // mañana la plantilla más restrictiva cambia de nombre, esto sigue siendo
    // la condición de verdad.
    for (const modulo of MODULOS_DE_SALA) {
      expect(canAccessModule(modulo, valor)).toBe(false);
    }
  });
});

describe('T2 · módulos visibles por plantilla', () => {
  it.each([
    ['tienda', false],
    ['cafeteria', false],
    ['restaurante', true],
  ] as const)('%s enseña la sala sólo si le toca', (plantilla, haySala) => {
    expect(canAccessModule('caja_directa', plantilla)).toBe(true);

    // D-01 con todas sus letras: *una tienda sin inventario no es una tienda,
    // es una calculadora*. El viejo `esencial` no lo traía; `tienda` sí.
    expect(canAccessModule('inventario', plantilla)).toBe(true);
    expect(canAccessModule('compras', plantilla)).toBe(true);
    expect(canAccessModule('gastos', plantilla)).toBe(true);
    expect(canAccessModule('recetas', plantilla)).toBe(true);

    for (const modulo of MODULOS_DE_SALA) {
      expect(canAccessModule(modulo, plantilla)).toBe(haySala);
    }

    // El escáner es de mostrador: se escanea una botella, no una orden de tacos.
    expect(canAccessModule('escaner_codigo_barras', plantilla)).toBe(!haySala);
  });

  it.each([
    ['tienda', false],
    ['cafeteria', false],
    ['restaurante', true],
    // Los alias tienen que dar la MISMA respuesta que su plantilla.
    ['esencial', false],
    ['operativo', false],
    ['restaurante_pro', true],
    ['plan_oro', false],
  ] as const)('las rutas de sala con «%s» se permiten: %s', (paquete, permitidas) => {
    for (const ruta of RUTAS_DE_SALA) {
      expect(isRouteAllowed(ruta, paquete)).toBe(permitidas);
    }

    // Las de mostrador se permiten siempre, venga la plantilla que venga.
    for (const ruta of ['/', '/caja', '/ventas', '/productos', '/inventario', '/compras']) {
      expect(isRouteAllowed(ruta, paquete)).toBe(true);
    }

    // Una ruta que no está en el mapa no la gobierna la plantilla.
    expect(isRouteAllowed('/corte-caja', paquete)).toBe(true);
  });
});

/**
 * EL CONTRATO: el menú del navegador y el gate del servidor dicen lo mismo.
 *
 * Las dos listas son exactamente comparables —`MODULOS_BASE`,
 * `MODULOS_OPERACION` y `MODULOS_SALA` de `packageConfig.js` son módulo a
 * módulo `BASE`, `OPERACION` y `SALA` de `plantillas.ts`—, así que se comparan
 * como CONJUNTOS y en las dos direcciones. Si divergieran, el menú ofrecería
 * una pantalla que el comando rechaza, o le escondería a un negocio algo que
 * contrató, y ninguna de las dos cosas puede pasar en silencio.
 */
describe('T2 · el frontend no puede contradecir a MODULOS_POR_PLANTILLA', () => {
  it('cubre exactamente las mismas plantillas', () => {
    expect(Object.keys(PACKAGE_MODULES).sort()).toEqual([...PLANTILLAS].sort());
  });

  it.each(PLANTILLAS)('«%s» tiene el mismo conjunto de módulos en los dos lados', (plantilla) => {
    const frontend = [...PACKAGE_MODULES[plantilla]].sort();
    const servidor = [...MODULOS_POR_PLANTILLA[plantilla]].sort();

    expect(frontend).toEqual(servidor);
    // Sin duplicados: un módulo repetido pasaría desapercibido en la comparación
    // de conjuntos y delataría un bloque pegado dos veces.
    expect(new Set(frontend).size).toBe(frontend.length);
  });

  it('cada ruta del menú exige un módulo que el servidor conoce', () => {
    const conocidos: readonly string[] = MODULOS;
    for (const [ruta, modulo] of Object.entries(
      ROUTE_TO_MODULE as Readonly<Record<string, string>>,
    )) {
      // Una ruta que exigiera un módulo inexistente estaría oculta para siempre
      // y sin que nadie pudiera explicar por qué: `canAccessModule` devolvería
      // falso en las tres plantillas y no habría error en ninguna parte.
      expect(conocidos, `La ruta ${ruta} exige «${modulo}», que no existe en MODULOS`).toContain(
        modulo,
      );
    }
  });
});
