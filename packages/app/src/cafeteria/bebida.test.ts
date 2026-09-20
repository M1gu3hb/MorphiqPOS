import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type BaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  CARRITO_MOSTRADOR,
  ORG,
  PREDETERMINADOS,
  PRODUCTO,
  ordenDeMostrador,
  producto,
} from '../restaurante/pruebas/sala.ts';
import { agregarBebida } from './bebida.ts';

/**
 * F-027 · La bebida con sus opciones, que es la mitad de lo que vende una
 * cafetería.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que las opciones MUEVAN EL PRECIO y queden congeladas. Ningún comando del
 * sistema escribía `orden_linea_modificadores`: la leche de avena, el tamaño y el
 * «sin crema» se elegían en la pantalla y no se guardaban en ninguna parte, así
 * que ni se cobraban ni se podían contar a fin de mes.
 *
 * Que una opción de OTRO NEGOCIO no entre. Las opciones no llevan
 * `organizacion_id` —cuelgan de su grupo— así que sin la guarda del grupo, un
 * identificador ajeno metería en la cuenta una opción con el precio de otro
 * negocio.
 *
 * Y que las ALERGIAS se acumulen. Una cuenta lleva dos bebidas de dos personas, y
 * perder la alergia de la primera al anotar la segunda es exactamente el error que
 * esa columna existe para evitar.
 */

const AHORA = new Date('2026-09-19T17:00:00.000Z');
const GRUPO_LECHE = 'e1111111-1111-4111-8111-111111111111';
const GRUPO_AJENO = 'e2222222-2222-4222-8222-222222222222';
const AVENA = 'f1111111-1111-4111-8111-111111111111';
const SIN_CREMA = 'f2222222-2222-4222-8222-222222222222';
const OPCION_AJENA = 'f3333333-3333-4333-8333-333333333333';
const OTRA_ORG = 'a9999999-9999-4999-8999-999999999999';

function opcion(id: string, cambios: Fila = {}): Fila {
  return {
    id,
    modificador_id: GRUPO_LECHE,
    nombre: 'Leche de avena',
    precio_extra_centavos: 1_000n,
    delta_precio_centavos: 0n,
    activa: true,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}): BaseFalsa {
  return crearBaseFalsa(
    {
      productos: [producto({ precio_venta_centavos: 5_500n })],
      modificadores: [
        { id: GRUPO_LECHE, organizacion_id: ORG, nombre: 'Leche', activo: true },
        { id: GRUPO_AJENO, organizacion_id: OTRA_ORG, nombre: 'Leche', activo: true },
      ],
      modificador_opciones: [
        opcion(AVENA),
        // Firmada y negativa: «sin crema» abarata, y por eso el delta manda.
        opcion(SIN_CREMA, {
          nombre: 'Sin crema',
          precio_extra_centavos: 0n,
          delta_precio_centavos: -500n,
        }),
        opcion(OPCION_AJENA, { modificador_id: GRUPO_AJENO, nombre: 'Leche de otro negocio' }),
      ],
      ordenes: [],
      orden_lineas: [],
      orden_linea_modificadores: [],
      ...extra,
    },
    { predeterminados: PREDETERMINADOS },
  );
}

const bebida = (cambios: Record<string, unknown> = {}) => ({
  productoId: PRODUCTO,
  cantidad: '1',
  opciones: [] as string[],
  alergias: [] as string[],
  nota: '',
  ...cambios,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-027 · la bebida con sus opciones', () => {
  it('LA OPCIÓN MUEVE EL PRECIO y queda congelada dos veces', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarBebida.ejecutar(ctx, bebida({ opciones: [AVENA] }));

    // 55.00 de base + 10.00 de la leche de avena.
    expect(salida.precioUnitarioCentavos).toBe('6500');
    expect(base.campo('orden_lineas', 'precio_unitario_centavos')).toBe(6_500n);

    // La CONSULTABLE, con los dos nombres congelados: un modificador renombrado
    // no puede cambiar lo que dice un ticket de hace seis meses.
    expect(base.filas('orden_linea_modificadores')).toHaveLength(1);
    expect(base.campo('orden_linea_modificadores', 'opcion_nombre')).toBe('Leche de avena');
    expect(base.campo('orden_linea_modificadores', 'modificador_nombre')).toBe('Leche');
    expect(base.campo('orden_linea_modificadores', 'precio_extra_centavos')).toBe(1_000n);

    // Y la del TICKET, en la propia línea, para imprimirla sin un join.
    expect(String(base.campo('orden_lineas', 'opciones'))).toContain('Leche de avena');
  });

  it('EL DELTA FIRMADO ABARATA: «sin crema» resta', async () => {
    // `precio_extra_centavos` no sabe restar, y hay opciones que quitan algo. Con
    // el extra sin signo, «sin crema» costaría lo mismo que con crema.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarBebida.ejecutar(ctx, bebida({ opciones: [SIN_CREMA] }));

    expect(salida.precioUnitarioCentavos).toBe('5000');
  });

  it('UNA OPCIÓN DE OTRO NEGOCIO NO ENTRA', async () => {
    // Las opciones no llevan `organizacion_id`: cuelgan de su grupo, y es el grupo
    // el que se filtra. Sin eso, un id ajeno entra con el precio de otro negocio.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => agregarBebida.ejecutar(ctx, bebida({ opciones: [OPCION_AJENA] }))),
    ).toBe('CONFIGURACION_INVALIDA');
    // Y no deja media bebida escrita.
    expect(base.filas('orden_lineas')).toEqual([]);
  });

  it('DOS BEBIDAS CAEN EN LA MISMA CUENTA', async () => {
    // Es lo que pasa en la barra: se piden dos y se cobran juntas. Crear una orden
    // por bebida partiría la cuenta en dos y el cliente pagaría dos veces.
    const base = baseDe({ ordenes: [ordenDeMostrador()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarBebida.ejecutar(ctx, bebida({ opciones: [AVENA] }));

    expect(salida.ordenId).toBe(CARRITO_MOSTRADOR);
    expect(base.filas('ordenes')).toHaveLength(1);
  });

  it('LAS ALERGIAS SE ACUMULAN en la cuenta', async () => {
    const base = baseDe({ ordenes: [ordenDeMostrador()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await agregarBebida.ejecutar(ctx, bebida({ alergias: ['nuez'] }));
    await agregarBebida.ejecutar(ctx, bebida({ alergias: ['lactosa'] }));

    // Las dos, y en la orden: el vaso se prepara mirando esa línea.
    expect(String(base.campo('ordenes', 'notas_alergias'))).toContain('nuez');
    expect(String(base.campo('ordenes', 'notas_alergias'))).toContain('lactosa');
  });

  it('SIN OPCIONES es una bebida normal, sin modificadores escritos', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarBebida.ejecutar(ctx, bebida());

    expect(salida.precioUnitarioCentavos).toBe('5500');
    expect(base.filas('orden_linea_modificadores')).toEqual([]);
  });
});
