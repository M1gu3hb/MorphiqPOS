import { describe, expect, it } from 'vitest';

import type { Giro } from './ambito.ts';
import {
  MODULOS_POR_PLANTILLA,
  modulosActivos,
  plantillaDe,
  PLANTILLAS,
  type Modulo,
} from './plantillas.ts';

/**
 * F-015 · El renombre de plantillas NO puede arrastrar a un cliente a la
 * plantilla equivocada.
 *
 * ── Lo que esta prueba impide ──────────────────────────────────────────────
 * Un `update` plano de `operativo → cafeteria` manda a **Abarrotes Don Chuy y
 * Ferretería La Broca** —los dos en `operativo` hoy— a la plantilla de un
 * negocio de café. Dos clientes que pagan, operando, con módulos de recetas y
 * portal QR donde debería haber presentaciones y código de barras.
 *
 * Por eso cada caso de abajo nombra al negocio real: si alguien simplifica
 * `plantillaDe` a un `Record<string, Plantilla>` —que es la forma obvia y
 * equivocada— estos cuatro casos se ponen rojos con el nombre del cliente que
 * habría roto.
 */

const VIVOS: readonly {
  readonly negocio: string;
  readonly giro: Giro;
  readonly paqueteHoy: string;
  readonly esperada: string;
  readonly porque: string;
}[] = [
  {
    negocio: 'Restaurante MH',
    giro: 'restaurante',
    paqueteHoy: 'restaurante_pro',
    esperada: 'restaurante',
    porque: 'giro de alimentos con el paquete completo',
  },
  {
    negocio: 'Café Jacaranda',
    giro: 'cafeteria',
    paqueteHoy: 'restaurante_pro',
    esperada: 'restaurante',
    porque:
      'SU GIRO ES CAFETERÍA Y AUN ASÍ QUEDA EN restaurante: tiene contratado ' +
      'mesero y cocina, y bajarlo a cafeteria le quitaría módulos que paga',
  },
  {
    negocio: 'Abarrotes Don Chuy',
    giro: 'tienda',
    paqueteHoy: 'operativo',
    esperada: 'tienda',
    porque: 'operativo NO es cafeteria cuando el giro no es de alimentos',
  },
  {
    negocio: 'Ferretería La Broca',
    giro: 'ferreteria',
    paqueteHoy: 'operativo',
    esperada: 'tienda',
    porque: 'mismo caso: operativo de retail va a tienda, no a cafeteria',
  },
];

describe('F-015 · plantillaDe reparte POR GIRO, no por paquete (D-12)', () => {
  for (const caso of VIVOS) {
    it(`${caso.negocio} (${caso.giro} · ${caso.paqueteHoy}) → ${caso.esperada}`, () => {
      expect(plantillaDe(caso.giro, caso.paqueteHoy), caso.porque).toBe(caso.esperada);
    });
  }

  it('el giro decide: el MISMO paquete cae en dos plantillas distintas', () => {
    // Éste es el invariante entero en una línea. Si `plantillaDe` dejara de
    // mirar el giro, estas dos devolverían lo mismo y el caso de Don Chuy
    // dejaría de estar protegido.
    expect(plantillaDe('cafeteria', 'operativo')).toBe('cafeteria');
    expect(plantillaDe('ferreteria', 'operativo')).toBe('tienda');
  });

  it('esencial va a tienda sea cual sea el giro', () => {
    for (const giro of ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'] as const) {
      expect(plantillaDe(giro, 'esencial')).toBe('tienda');
    }
  });

  it('un valor ya migrado se respeta y el giro NO vuelve a decidir', () => {
    // Si la 058 ya corrió, la columna trae el nombre nuevo. Volver a derivarlo
    // del giro reabriría la decisión y podría cambiar una plantilla que alguien
    // ajustó a mano después de migrar.
    expect(plantillaDe('cafeteria', 'restaurante')).toBe('restaurante');
    expect(plantillaDe('restaurante', 'tienda')).toBe('tienda');
  });

  it('un valor desconocido cae a la plantilla MÁS RESTRICTIVA', () => {
    // Fallback restrictivo: un dato roto no puede abrir módulos que nadie
    // contrató. Lo contrario —caer a `restaurante`— regalaría sala y cocina.
    for (const basura of [undefined, null, '', 'pro', 'premium', 42, {}]) {
      expect(plantillaDe('restaurante', basura)).toBe('tienda');
    }
  });

  it('una estética cae en `tienda` por los tres caminos', () => {
    // El giro `estetica` lo abre la 164 y NO trae plantilla propia: `salon` no
    // existe y no va a existir —`PAQUETES` tiene tres valores—. La plantilla de
    // un salón es `tienda`: mostrador, caja e inventario, sin sala. Sale así
    // porque `estetica` no está en `GIROS_DE_ALIMENTOS`, y este caso es el que se
    // cae el día que alguien la meta ahí «porque vende productos».
    expect(plantillaDe('estetica', 'operativo')).toBe('tienda');
    expect(plantillaDe('estetica', 'esencial')).toBe('tienda');

    // Y con basura, incluida la plantilla que el FILE-MAP del modelo declaraba
    // como destino: un valor que no se reconoce cae en la MÁS RESTRICTIVA.
    for (const basura of [undefined, null, '', 'salon', 'spa', 'barberia', 42, {}]) {
      expect(plantillaDe('estetica', basura)).toBe('tienda');
    }

    // El que no puede pasar de ninguna manera: sala en un salón. Aquí se degrada,
    // igual que `organizaciones_paquete_compatible_con_giro` lo impide en la base.
    expect(plantillaDe('estetica', 'restaurante_pro')).toBe('tienda');
  });

  it('restaurante_pro en un giro que no es de alimentos NO da módulos de sala', () => {
    // La 054 lo impide con un `check`, así que esto sólo pasa con un dato
    // corrupto. Aun así se degrada en vez de confiar.
    expect(plantillaDe('ferreteria', 'restaurante_pro')).toBe('tienda');
    expect(plantillaDe('farmacia', 'restaurante_pro')).toBe('tienda');
  });
});

describe('F-016 · las perillas son EXCEPCIONES sobre el preajuste', () => {
  it('sin perillas, los módulos son los de la plantilla', () => {
    for (const plantilla of PLANTILLAS) {
      expect([...modulosActivos(plantilla)].sort()).toEqual(
        [...MODULOS_POR_PLANTILLA[plantilla]].sort(),
      );
    }
  });

  it('una perilla encendida AÑADE un módulo que la plantilla no trae', () => {
    const sinMesas = modulosActivos('tienda');
    expect(sinMesas.has('mesas')).toBe(false);

    const conMesas = modulosActivos('tienda', [{ modulo: 'mesas', activo: true }]);
    expect(conMesas.has('mesas')).toBe(true);
    // Es el «sí, y además te pongo mesas» de la decisión pendiente P-01.
  });

  it('una perilla apagada QUITA un módulo que la plantilla sí trae', () => {
    expect(modulosActivos('restaurante').has('cocina')).toBe(true);
    expect(modulosActivos('restaurante', [{ modulo: 'cocina', activo: false }]).has('cocina')).toBe(
      false,
    );
  });

  it('la tienda trae inventario: el nombre miente sin él (D-01)', () => {
    // «Una tienda sin inventario no es una tienda, es una calculadora.»
    const tienda = modulosActivos('tienda');
    for (const modulo of ['inventario', 'movimientos_inventario', 'compras'] as const) {
      expect(tienda.has(modulo), `la plantilla tienda necesita ${modulo}`).toBe(true);
    }
  });

  it('el escáner de barras es de mostrador y NO está en restaurante', () => {
    // Estaba así en `packageConfig.js` antes de esta fase y se conserva: el
    // renombre no es una excusa para cambiar lo que Miguel ya decidió.
    expect(modulosActivos('tienda').has('escaner_codigo_barras')).toBe(true);
    expect(modulosActivos('cafeteria').has('escaner_codigo_barras')).toBe(true);
    expect(modulosActivos('restaurante').has('escaner_codigo_barras')).toBe(false);
  });

  it('sólo restaurante trae los módulos de sala', () => {
    const sala: readonly Modulo[] = ['mesas', 'mesero', 'cocina', 'pedidos_mesa'];
    for (const modulo of sala) {
      expect(modulosActivos('restaurante').has(modulo)).toBe(true);
      expect(modulosActivos('cafeteria').has(modulo), `cafeteria no tiene ${modulo}`).toBe(false);
      expect(modulosActivos('tienda').has(modulo), `tienda no tiene ${modulo}`).toBe(false);
    }
  });

  it('el conjunto que devuelve no deja modificar el preajuste por referencia', () => {
    // Un `Set` compartido dejaría que encender una perilla en un negocio se la
    // encendiera a todos los que usan esa plantilla en el mismo proceso.
    const primero = modulosActivos('tienda', [{ modulo: 'mesas', activo: true }]);
    const segundo = modulosActivos('tienda');
    expect(primero.has('mesas')).toBe(true);
    expect(segundo.has('mesas')).toBe(false);
  });
});
