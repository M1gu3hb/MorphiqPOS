import {
  INICIO_POR_PLANTILLA,
  MODULOS,
  MODULOS_POR_PLANTILLA,
  navegacionDePlantilla,
  PLANTILLAS,
} from '@morphiqpos/contracts';
import { readFileSync } from 'node:fs';
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
 * ── Los dos defectos que estas pruebas impiden que vuelvan ─────────────────
 * **El primero:** `getCurrentPackage` sólo entendía los tres nombres
 * comerciales viejos y caía en un valor por omisión con cualquier otro. Cuando
 * el servidor empezó a normalizar a los nombres de D-01, «cualquier otro»
 * pasaron a ser TODOS los negocios, y ese valor por omisión era el paquete más
 * permisivo: una tienda de abarrotes recibía el menú de sala entero.
 *
 * **El segundo:** de las tres plantillas, DOS ERAN LA MISMA. `tienda` y
 * `cafeteria` tenían los mismos 28 módulos uno por uno, y ferretería y estética
 * no tenían ninguna propia. La plantilla no decidía nada para dos de los cinco
 * modelos construidos, y ninguna prueba lo decía porque ninguna comparaba las
 * plantillas ENTRE SÍ.
 */

/** Los módulos de sala. Sólo un restaurante puede traerlos. */
const MODULOS_DE_SALA = ['mesas', 'mesero', 'pedidos_mesa', 'mapa_mesas'] as const;

/** Las rutas de sala del punto de venta heredado. */
const RUTAS_DE_SALA = ['/mesero', '/mesas'] as const;

describe('T2 · plantillas reconocidas', () => {
  it.each(PLANTILLAS)('«%s» se resuelve a sí misma', (plantilla) => {
    expect(getCurrentPackage({ paquete_modo: plantilla })).toBe(plantilla);
  });

  it.each([
    ['esencial', 'tienda'],
    ['operativo', 'tienda'],
    ['restaurante_pro', 'restaurante'],
  ] as const)('el alias «%s» se traduce a «%s»', (viejo, nuevo) => {
    expect(getCurrentPackage({ paquete_modo: viejo })).toBe(nuevo);
    expect([...(PACKAGE_MODULES[getCurrentPackage({ paquete_modo: viejo })] ?? [])].sort()).toEqual(
      [...(PACKAGE_MODULES[nuevo] ?? [])].sort(),
    );
  });

  it.each([
    ['un nombre inventado', 'plan_oro'],
    ['el nombre de un giro que no es plantilla', 'farmacia'],
    ['vacío', ''],
    ['ausente', undefined],
    ['nulo', null],
    ['un número', 7],
  ] as const)('lo irreconocible (%s) cae en la MÁS RESTRICTIVA', (_caso, valor) => {
    // La dirección importa más que el nombre: un dato roto no puede abrir
    // módulos que nadie contrató. Se fija por las dos vías.
    expect(getCurrentPackage({ paquete_modo: valor })).toBe('tienda');
    for (const modulo of MODULOS_DE_SALA) {
      expect(canAccessModule(modulo, valor)).toBe(false);
    }
  });
});

describe('T2 · módulos visibles por plantilla', () => {
  it.each(PLANTILLAS)('«%s» trae caja y el bloque de operación (D-01)', (plantilla) => {
    expect(canAccessModule('caja_directa', plantilla)).toBe(true);

    // D-01 con todas sus letras: *una tienda sin inventario no es una tienda,
    // es una calculadora*.
    expect(canAccessModule('inventario', plantilla)).toBe(true);
    expect(canAccessModule('compras', plantilla)).toBe(true);
    expect(canAccessModule('gastos', plantilla)).toBe(true);
    expect(canAccessModule('recetas', plantilla)).toBe(true);
  });

  it.each(PLANTILLAS)('la sala de «%s» sólo la trae un restaurante', (plantilla) => {
    const haySala = plantilla === 'restaurante';
    for (const modulo of MODULOS_DE_SALA) {
      expect(canAccessModule(modulo, plantilla)).toBe(haySala);
    }
    // El escáner es de mostrador: se escanea una botella, no una orden de tacos.
    expect(canAccessModule('escaner_codigo_barras', plantilla)).toBe(!haySala);
  });

  it('la barra la traen el restaurante y la cafetería, y nadie más', () => {
    for (const plantilla of PLANTILLAS) {
      const esperado = plantilla === 'restaurante' || plantilla === 'cafeteria';
      expect(canAccessModule('barra', plantilla)).toBe(esperado);
    }
  });

  it.each([
    ['tienda', false],
    ['cafeteria', false],
    ['restaurante', true],
    ['ferreteria', false],
    ['estetica', false],
    ['esencial', false],
    ['operativo', false],
    ['restaurante_pro', true],
    ['plan_oro', false],
  ] as const)('las rutas de sala con «%s» se permiten: %s', (paquete, permitidas) => {
    for (const ruta of RUTAS_DE_SALA) {
      expect(isRouteAllowed(ruta, paquete)).toBe(permitidas);
    }
    for (const ruta of ['/', '/caja', '/productos', '/inventario', '/compras']) {
      expect(isRouteAllowed(ruta, paquete)).toBe(true);
    }
    // Una ruta que no está en el mapa no la gobierna la plantilla.
    expect(isRouteAllowed('/corte-caja', paquete)).toBe(true);
  });
});

/**
 * EL CONTRATO QUE FALTABA: las cinco plantillas son CINCO, no tres con dos
 * repetidas.
 */
describe('T2 · las cinco plantillas se distinguen de verdad', () => {
  it('son cinco', () => {
    expect([...PLANTILLAS].sort()).toEqual(
      ['cafeteria', 'estetica', 'ferreteria', 'restaurante', 'tienda'].sort(),
    );
  });

  it('no hay dos con el mismo conjunto de módulos', () => {
    const huellas = new Map<string, string>();
    for (const plantilla of PLANTILLAS) {
      const huella = [...(PACKAGE_MODULES[plantilla] ?? [])].sort().join('|');
      const gemela = huellas.get(huella);
      expect(
        gemela,
        `«${plantilla}» y «${gemela ?? '?'}» tienen EXACTAMENTE los mismos módulos. Si de verdad ` +
          'no se distinguen, se funden en una; si se distinguen, la diferencia va en ' +
          'MODULOS_POR_PLANTILLA. Dos plantillas idénticas son una plantilla y una mentira.',
      ).toBeUndefined();
      huellas.set(huella, plantilla);
    }
  });

  /**
   * Y CADA PAR se distingue, que no es lo mismo que «cada una tiene algo
   * exclusivo».
   *
   * `tienda` es un subconjunto ESTRICTO de `ferreteria`, y eso es correcto: una
   * ferretería es una tiendita que además corta por medida, fía a la obra y
   * factura. Exigirle a `tienda` un módulo que nadie más tenga obligaría a
   * inventar una diferencia para que la prueba pasara, que es la peor forma de
   * satisfacer un contrato. Lo que sí no puede pasar es que dos plantillas se
   * distingan por cero módulos — ése era el defecto.
   */
  it('cada par de plantillas se distingue en al menos un módulo', () => {
    for (const a of PLANTILLAS) {
      for (const b of PLANTILLAS) {
        if (a >= b) continue;
        const enA = new Set<string>(PACKAGE_MODULES[a] ?? []);
        const enB = new Set<string>(PACKAGE_MODULES[b] ?? []);
        const diferencia =
          [...enA].filter((m) => !enB.has(m)).length + [...enB].filter((m) => !enA.has(m)).length;
        expect(diferencia, `«${a}» y «${b}» no se distinguen en ningún módulo.`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * EL OTRO CONTRATO: el menú del navegador y el gate del servidor dicen lo mismo.
 *
 * Aquí había una comparación módulo a módulo entre dos listas copiadas —una en
 * `packageConfig.js` y otra en `plantillas.ts`—. Ya no hay dos listas: el
 * navegador LEE la del servidor. Lo que se comprueba ahora es que no vuelva a
 * haber dos.
 */
describe('T2 · el frontend no declara módulos por su cuenta', () => {
  it('cubre exactamente las mismas plantillas', () => {
    expect(Object.keys(PACKAGE_MODULES).sort()).toEqual([...PLANTILLAS].sort());
  });

  it.each(PLANTILLAS)('«%s» tiene el mismo conjunto de módulos en los dos lados', (plantilla) => {
    const frontend = [...(PACKAGE_MODULES[plantilla] ?? [])].sort();
    const servidor = [...(MODULOS_POR_PLANTILLA[plantilla] ?? [])].sort();

    expect(frontend).toEqual(servidor);
    expect(new Set(frontend).size).toBe(frontend.length);
  });

  it('`packageConfig.js` no vuelve a copiar la lista de módulos', () => {
    // La copia existió y por eso hizo falta un contrato que la vigilara. Ahora
    // el archivo importa `MODULOS_POR_PLANTILLA`; si alguien vuelve a teclear
    // los bloques, esta prueba lo dice en vez de esperar a que divergan.
    const fuente = readFileSync(
      new URL('../../heredado/lib/packageConfig.js', import.meta.url),
      'utf8',
    );
    expect(fuente).toContain('MODULOS_POR_PLANTILLA');
    expect(fuente).not.toMatch(/const\s+MODULOS_(BASE|OPERACION|SALA)\s*=/);
  });

  it('cada ruta del menú exige un módulo que el servidor conoce', () => {
    const conocidos: readonly string[] = MODULOS;
    for (const [ruta, modulo] of Object.entries(
      ROUTE_TO_MODULE as Readonly<Record<string, string>>,
    )) {
      expect(conocidos, `La ruta ${ruta} exige «${modulo}», que no existe en MODULOS`).toContain(
        modulo,
      );
    }
  });
});

/**
 * Y EL TERCERO, que es el que faltaba entero: se puede LLEGAR a las pantallas.
 *
 * Las 61 pantallas de los cinco modelos estaban construidas, contadas y
 * respondiendo — y ninguna colgaba de un menú. Para abrir cualquiera había que
 * teclear la URL.
 */
describe('T2 · las pantallas de los modelos cuelgan de un menú', () => {
  it.each(PLANTILLAS)('«%s» ofrece un menú con pantallas de su modelo', (plantilla) => {
    const entradas = navegacionDePlantilla(plantilla);
    expect(entradas.length).toBeGreaterThan(8);

    const deModelo = entradas.filter((entrada) => entrada.ruta.split('/').length === 3);
    expect(
      deModelo.length,
      `«${plantilla}» no ofrece ninguna pantalla de modelo: su menú son sólo las ` +
        'entradas heredadas, que es exactamente el estado que hacía falta arreglar.',
    ).toBeGreaterThan(8);
  });

  it.each(PLANTILLAS)('«%s» sólo ofrece lo que sus módulos incluyen', (plantilla) => {
    const modulos = new Set<string>(PACKAGE_MODULES[plantilla] ?? []);
    for (const entrada of navegacionDePlantilla(plantilla)) {
      expect(
        modulos,
        `«${plantilla}» ofrece ${entrada.ruta} por «${entrada.modulo}», que no incluye`,
      ).toContain(entrada.modulo);
    }
  });

  it.each(PLANTILLAS)('«%s» abre en una pantalla de su propio menú', (plantilla) => {
    const inicio = INICIO_POR_PLANTILLA[plantilla];
    expect(inicio).toBeDefined();
    expect(navegacionDePlantilla(plantilla).map((e) => e.ruta)).toContain(inicio);
    // Y es una pantalla del MODELO, no el tablero genérico: el día de un
    // negocio no empieza mirando un tablero, empieza donde se trabaja.
    expect(inicio.split('/').length).toBe(3);
  });

  it('las cinco abren en pantallas distintas', () => {
    const inicios = PLANTILLAS.map((plantilla) => INICIO_POR_PLANTILLA[plantilla]);
    expect(new Set(inicios).size).toBe(inicios.length);
  });
});
