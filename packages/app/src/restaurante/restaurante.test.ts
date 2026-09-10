import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { esErrorDominio } from '@morphiqpos/contracts';

import {
  agruparEnComandas,
  areasDe,
  resolverEstacion,
  type EstacionCandidata,
  type EstacionResuelta,
} from './estaciones.ts';
import {
  entradaAbrirMesa,
  entradaEnviarPedido,
  entradaEntregarPedidos,
  entradaLiberarMesa,
  entradaSolicitarCuenta,
  entradaTransicionarPedido,
} from './esquemas.ts';
import {
  esTransicionValida,
  estadoComandaDeItem,
  estadoItemDe,
  estadosItemPorDebajoDe,
  evaluarTransicion,
  mesaTrasComanda,
  ESTADOS_COMANDA,
  type EstadoComanda,
} from './transiciones.ts';

/**
 * Las pruebas del módulo de restaurante. Unitarias y SIN base de datos.
 *
 * Cubren las cuatro decisiones que, si se equivocan, no dan error: mandan el
 * plato a la pantalla equivocada, devuelven un pedido listo al fuego, parten mal
 * una comanda, o dejan que el cliente elija lo que paga.
 */

const GENERAL: EstacionCandidata = {
  id: 'est-general',
  nombre: 'Cocina general',
  color: '#4A5568',
  esGeneral: true,
};
const PARRILLA: EstacionCandidata = {
  id: 'est-parrilla',
  nombre: 'Parrilla',
  color: '#B7410E',
  esGeneral: false,
};
const BARRA: EstacionCandidata = {
  id: 'est-barra',
  nombre: 'Barra fría',
  color: '#1E6091',
  esGeneral: false,
};

describe('resolución de estación · Producto → Categoría → General (F1-04 §11.2)', () => {
  it('usa la estación de la categoría cuando está activa', () => {
    const resuelta = resolverEstacion(PARRILLA.id, [GENERAL, PARRILLA]);

    expect(resuelta).toEqual({
      id: 'est-parrilla',
      nombre: 'Parrilla',
      color: '#B7410E',
      porRespaldo: false,
    });
  });

  it('cae a la general cuando el producto no tiene categoría', () => {
    const resuelta = resolverEstacion(null, [PARRILLA, GENERAL]);

    expect(resuelta.id).toBe('est-general');
    expect(resuelta.porRespaldo).toBe(true);
  });

  it('cae a la general cuando la estación de la categoría se desactivó', () => {
    // La lista sólo trae las activas: la parrilla apagada no está en ella. Sin
    // este tramo, el pedido apuntaría a una estación que ninguna pantalla lee.
    const resuelta = resolverEstacion(PARRILLA.id, [GENERAL]);

    expect(resuelta.id).toBe('est-general');
    expect(resuelta.porRespaldo).toBe(true);
  });

  it('falla con ESTACION_NO_ENCONTRADA cuando no hay ninguna general', () => {
    // El original `preparacionEstacionUtils.js` devuelve aquí un objeto
    // sintético con id vacío y la comanda se pierde en silencio. Aquí grita.
    expect(() => resolverEstacion(PARRILLA.id, [BARRA])).toThrow(/estación de preparación activa/i);

    try {
      resolverEstacion(null, []);
      expect.unreachable('tenía que lanzar');
    } catch (error) {
      expect(esErrorDominio(error)).toBe(true);
      if (esErrorDominio(error)) expect(error.codigo).toBe('ESTACION_NO_ENCONTRADA');
    }
  });
});

describe('tabla de transiciones de comanda (F1-04 §8.2 y §10)', () => {
  const VALIDAS: readonly (readonly [EstadoComanda, EstadoComanda])[] = [
    ['nuevo', 'en_preparacion'],
    ['nuevo', 'listo'],
    ['nuevo', 'cancelado'],
    ['en_preparacion', 'listo'],
    ['en_preparacion', 'cancelado'],
    ['listo', 'entregado'],
    ['listo', 'cancelado'],
  ];

  const INVALIDAS: readonly (readonly [EstadoComanda, EstadoComanda])[] = [
    // LA QUE IMPORTA: la respuesta que llega tarde no devuelve el plato al fuego.
    ['listo', 'en_preparacion'],
    ['listo', 'nuevo'],
    ['en_preparacion', 'nuevo'],
    // No se entrega lo que nadie marcó listo: es la regla de `entregaPedidos.js:110`.
    ['en_preparacion', 'entregado'],
    ['entregado', 'nuevo'],
    ['entregado', 'listo'],
    ['cancelado', 'listo'],
    ['entregado', 'en_preparacion'],
    ['entregado', 'cancelado'],
    ['cancelado', 'nuevo'],
    ['cancelado', 'en_preparacion'],
    ['cancelado', 'entregado'],
    ['nuevo', 'entregado'],
  ];

  for (const [desde, hacia] of VALIDAS) {
    it(`admite ${desde} → ${hacia}`, () => {
      expect(esTransicionValida(desde, hacia)).toBe(true);
      expect(evaluarTransicion(desde, hacia)).toEqual({ tipo: 'avanza' });
    });
  }

  for (const [desde, hacia] of INVALIDAS) {
    it(`rechaza ${desde} → ${hacia} con TRANSICION_INVALIDA`, () => {
      expect(esTransicionValida(desde, hacia)).toBe(false);
      try {
        evaluarTransicion(desde, hacia);
        expect.unreachable(`${desde} → ${hacia} tenía que lanzar`);
      } catch (error) {
        expect(esErrorDominio(error)).toBe(true);
        if (esErrorDominio(error)) expect(error.codigo).toBe('TRANSICION_INVALIDA');
      }
    });
  }

  it('pedir el estado que ya tiene no es un error: es el mismo hecho contado dos veces', () => {
    for (const estado of ESTADOS_COMANDA) {
      expect(evaluarTransicion(estado, estado)).toEqual({ tipo: 'sin_cambio' });
    }
  });

  it('la tabla es completa: cada par de estados es válido, inválido o sin cambio', () => {
    // Sin esta prueba, añadir un sexto estado dejaría un hueco que nadie ve.
    const cubiertos = new Set([
      ...VALIDAS.map(([a, b]) => `${a}>${b}`),
      ...INVALIDAS.map(([a, b]) => `${a}>${b}`),
      ...ESTADOS_COMANDA.map((e) => `${e}>${e}`),
    ]);
    expect(cubiertos.size).toBe(ESTADOS_COMANDA.length * ESTADOS_COMANDA.length);
  });

  it('el item usa "pendiente" donde la comanda usa "nuevo"', () => {
    expect(estadoItemDe('nuevo')).toBe('pendiente');
    expect(estadoItemDe('listo')).toBe('listo');
  });

  it('la traducción item <-> comanda es reversible en los cinco estados', () => {
    // La rama por plato suelto evalúa la MISMA tabla sobre el item. Si esta
    // traducción perdiera un estado, un plato en `pendiente` no encontraría
    // fila en la tabla y la cocina se quedaría sin poder marcarlo.
    for (const estado of ESTADOS_COMANDA) {
      expect(estadoComandaDeItem(estadoItemDe(estado))).toBe(estado);
    }
    expect(estadoComandaDeItem('pendiente')).toBe('nuevo');
    expect(estadoComandaDeItem('entregado')).toBe('entregado');
  });

  it('el propagado a items sólo avanza: nunca reabre uno entregado o cancelado', () => {
    expect(estadosItemPorDebajoDe('en_preparacion')).toEqual(['pendiente']);
    expect(estadosItemPorDebajoDe('listo')).toEqual(['pendiente', 'en_preparacion']);
    expect(estadosItemPorDebajoDe('entregado')).toEqual(['pendiente', 'en_preparacion', 'listo']);
    for (const destino of ['en_preparacion', 'listo', 'entregado', 'cancelado'] as const) {
      expect(estadosItemPorDebajoDe(destino)).not.toContain('entregado');
      expect(estadosItemPorDebajoDe(destino)).not.toContain('cancelado');
    }
  });
});

describe('la mesa sigue a la comanda (F1-04 §8.2)', () => {
  it('un pedido enviado pone la mesa en pedido_enviado', () => {
    expect(mesaTrasComanda('esperando_orden', 'nuevo', false)).toBe('pedido_enviado');
  });

  it('la cocina que empieza pone la mesa en en_preparacion', () => {
    expect(mesaTrasComanda('pedido_enviado', 'en_preparacion', false)).toBe('en_preparacion');
  });

  it('una estación lista con otra todavía trabajando NO mueve la mesa', () => {
    // La regla de `Cocina.jsx:249-259`: si la barra terminó pero la cocina
    // sigue, el mesero no debe ver la mesa como lista para recoger.
    expect(mesaTrasComanda('en_preparacion', 'listo', true)).toBeNull();
    expect(mesaTrasComanda('en_preparacion', 'listo', false)).toBe('en_espera_entrega');
  });

  it('entregado sin nada pendiente devuelve la mesa a ocupada', () => {
    expect(mesaTrasComanda('en_espera_entrega', 'entregado', false)).toBe('ocupada');
    expect(mesaTrasComanda('en_espera_entrega', 'entregado', true)).toBeNull();
  });

  it('la cocina no pisa una mesa con la cuenta pedida, pagada, libre o en limpieza', () => {
    for (const cerrado of [
      'cuenta_solicitada',
      'pagada',
      'cancelada',
      'libre',
      'limpieza',
    ] as const) {
      expect(mesaTrasComanda(cerrado, 'listo', false)).toBeNull();
      expect(mesaTrasComanda(cerrado, 'entregado', false)).toBeNull();
    }
  });

  it('no devuelve un destino igual al estado que la mesa ya tiene', () => {
    expect(mesaTrasComanda('en_preparacion', 'en_preparacion', false)).toBeNull();
  });
});

describe('reparto en comandas por área y estación', () => {
  const enParrilla: EstacionResuelta = { ...PARRILLA, porRespaldo: false };
  const enBarra: EstacionResuelta = { ...BARRA, porRespaldo: false };

  it('un producto de área "ambos" produce DOS comandas: cocina y barra', () => {
    const grupos = agruparEnComandas([
      { nombre: 'Sangría con botana', areaPreparacion: 'ambos', estacion: enParrilla },
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.area)).toEqual(['cocina', 'barra']);
    // La MISMA línea viaja a las dos: es un solo plato con dos preparaciones.
    expect(grupos[0]?.lineas).toEqual(grupos[1]?.lineas);
    expect(grupos.every((g) => g.estacion.id === 'est-parrilla')).toBe(true);
  });

  it('dos platos de la misma área y estación comparten una sola comanda', () => {
    const grupos = agruparEnComandas([
      { nombre: 'Arrachera', areaPreparacion: 'cocina', estacion: enParrilla },
      { nombre: 'Costilla', areaPreparacion: 'cocina', estacion: enParrilla },
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.lineas.map((l) => l.nombre)).toEqual(['Arrachera', 'Costilla']);
  });

  it('la misma área en estaciones distintas son comandas distintas', () => {
    const grupos = agruparEnComandas([
      { nombre: 'Arrachera', areaPreparacion: 'cocina', estacion: enParrilla },
      { nombre: 'Ceviche', areaPreparacion: 'cocina', estacion: enBarra },
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.estacion.id)).toEqual(['est-parrilla', 'est-barra']);
  });

  it('un producto de área "ninguno" no genera comanda', () => {
    expect(areasDe('ninguno')).toEqual([]);
    expect(areasDe('lo-que-sea')).toEqual([]);
    expect(areasDe('cocina')).toEqual(['cocina']);
    expect(areasDe('ambos')).toEqual(['cocina', 'barra']);

    const grupos = agruparEnComandas([
      { nombre: 'Refresco de botella', areaPreparacion: 'ninguno', estacion: enParrilla },
    ]);
    expect(grupos).toHaveLength(0);
  });

  it('mezcla real: "ambos" abre barra y se junta con la bebida que ya iba ahí', () => {
    const grupos = agruparEnComandas([
      { nombre: 'Arrachera', areaPreparacion: 'cocina', estacion: enParrilla },
      { nombre: 'Sangría con botana', areaPreparacion: 'ambos', estacion: enParrilla },
      { nombre: 'Limonada', areaPreparacion: 'barra', estacion: enParrilla },
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos[0]?.area).toBe('cocina');
    expect(grupos[0]?.lineas.map((l) => l.nombre)).toEqual(['Arrachera', 'Sangría con botana']);
    expect(grupos[1]?.area).toBe('barra');
    expect(grupos[1]?.lineas.map((l) => l.nombre)).toEqual(['Sangría con botana', 'Limonada']);
  });
});

/**
 * «El endpoint no acepta importes del cliente» y «autorización por sesión,
 * nunca por un campo del body». Las dos, comprobadas sobre los esquemas reales.
 */
describe('ningún esquema de entrada acepta un importe ni un rol', () => {
  const PARECE_IMPORTE = /(centavos|precio|importe|monto|costo|subtotal|descuento|total)/i;
  const PARECE_AMBITO =
    /^(rol|roles|ambito|organizacion_?id|sucursal_?id|identidad_?id|empleo_?id|terminal_?id)$/i;

  const ESQUEMAS = {
    abrir_mesa: entradaAbrirMesa,
    liberar_mesa: entradaLiberarMesa,
    enviar_pedido: entradaEnviarPedido,
    transicionar_pedido: entradaTransicionarPedido,
    entregar_pedidos: entradaEntregarPedidos,
    solicitar_cuenta: entradaSolicitarCuenta,
  } as const;

  for (const [nombre, esquema] of Object.entries(ESQUEMAS)) {
    it(`restaurante.${nombre} no declara dinero ni ámbito`, () => {
      const claves = clavesDe(esquema);
      expect(claves.length).toBeGreaterThan(0);
      expect(claves.filter((c) => PARECE_IMPORTE.test(c))).toEqual([]);
      expect(claves.filter((c) => PARECE_AMBITO.test(c))).toEqual([]);
    });
  }

  it('el recorrido entra en los arreglos anidados', () => {
    // Sin esto, un recorrido que devolviera sólo el primer nivel dejaría pasar
    // `lineas: [{ precioCentavos }]` y las seis pruebas de arriba pasarían igual.
    expect(clavesDe(entradaEnviarPedido)).toContain('productoId');
    expect(clavesDe(entradaEnviarPedido)).toContain('cantidad');
  });

  it('el detector reconoce un importe y un rol cuando los hay', () => {
    // La prueba de la prueba: si los patrones dejaran de encajar, lo de arriba
    // pasaría por vacío y no diría nada.
    const trampa = z.object({
      totalEsperadoCentavos: z.number(),
      rol: z.string(),
      lineas: z.array(z.object({ precioUnitario: z.number() })),
    });
    const claves = clavesDe(trampa);
    expect(claves.filter((c) => PARECE_IMPORTE.test(c))).toEqual([
      'totalEsperadoCentavos',
      'precioUnitario',
    ]);
    expect(claves.filter((c) => PARECE_AMBITO.test(c))).toEqual(['rol']);
  });
});

/** Nombres de propiedad de un esquema zod, entrando en objetos y arreglos. */
interface NodoZod {
  readonly shape?: Readonly<Record<string, unknown>>;
  readonly element?: unknown;
  readonly unwrap?: () => unknown;
}

function clavesDe(esquema: unknown, profundidad = 0): readonly string[] {
  if (profundidad > 8 || typeof esquema !== 'object' || esquema === null) return [];
  const nodo = esquema as NodoZod;

  if (nodo.shape !== undefined) {
    return Object.entries(nodo.shape).flatMap(([clave, valor]) => [
      clave,
      ...clavesDe(valor, profundidad + 1),
    ]);
  }
  if (nodo.element !== undefined) return clavesDe(nodo.element, profundidad + 1);
  if (typeof nodo.unwrap === 'function') return clavesDe(nodo.unwrap(), profundidad + 1);
  return [];
}
