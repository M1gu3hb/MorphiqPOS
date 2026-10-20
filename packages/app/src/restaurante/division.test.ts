import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { dividirCuentaComando } from './division.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import {
  ambitoDe,
  COMANDA,
  comandaItem,
  CUENTA,
  LINEA,
  linea,
  mesa,
  MESA_5,
  ordenDeMesa,
  PREDETERMINADOS,
} from './pruebas/sala.ts';

/**
 * F-321 · El comando entero, contra la base falsa.
 *
 * `domain/venta/division.test.ts` vigila la ARITMÉTICA. Ésta vigila lo demás:
 * que las hijas nazcan sin mesa, que la madre quede sellada, que las líneas
 * cambien de dueño y que quede bitácora. Un reparto perfecto que deja la madre
 * cobrable cobra el consumo dos veces, y eso ninguna suma lo detecta.
 *
 * Y lo que el día completo del restaurante destapó (2.4): que las hijas nazcan COBRABLES —
 * pedidas, con su propina y su código, sin gastar folio—, que la cuenta con la cuenta ya
 * pedida se pueda dividir, y que una línea de dos unidades repartida entre dos cuentas se
 * PARTA de verdad en lugar de quedarse entera en la primera.
 */

const OTRA_LINEA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
const EMPLEADO = '55555555-5555-4555-8555-555555555555';
const SERIE = 'A';

// El folio se toma con SQL crudo (`UPDATE folios … RETURNING`) y la base falsa
// responde lo mismo a cada llamada, así que las dos hijas salen con folio 1.
// Aquí se afirma sobre el NÚMERO de hijas y sus totales; que cada folio sea
// único lo impone `tomarFolio` y se prueba en su sitio.
const PRIMER_FOLIO = [{ siguiente: 1n }];

/** Dos líneas vivas: $100 y $150. La madre suma $250. */
function salon(
  cambiosDeOrden: Fila = {},
  lineas?: readonly Fila[],
  estadoDeLaMesa = 'pedido_enviado',
): TablasFalsas {
  return {
    ordenes: [
      ordenDeMesa('confirmada', {
        serie: SERIE,
        total_centavos: 25_000n,
        empleado_atiende_id: EMPLEADO,
        orden_padre_id: null,
        division_indice: null,
        ...cambiosDeOrden,
      }),
    ],
    orden_lineas: lineas ?? [
      linea({ anulada_en: null }),
      // Una línea es coherente: su total es su subtotal menos su descuento (el que cobra `cotizar`).
      linea({
        id: OTRA_LINEA,
        subtotal_centavos: 15_000n,
        total_centavos: 15_000n,
        anulada_en: null,
      }),
    ],
    movimientos_cuenta: [],
    mesas: [mesa(estadoDeLaMesa)],
    eventos_mesa: [],
  };
}

const baseDe = (cambios: Fila = {}, lineas?: readonly Fila[], estadoDeLaMesa?: string) =>
  crearBaseFalsa(salon(cambios, lineas, estadoDeLaMesa), {
    predeterminados: PREDETERMINADOS,
    filasCrudas: PRIMER_FOLIO,
  });

/** Una línea entera para cada comensal. */
const EN_DOS = {
  ordenId: CUENTA,
  particiones: [
    { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
    { tomas: [{ lineaId: OTRA_LINEA, cantidad: 1 }] },
  ],
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-321 · dividir la cuenta de una mesa', () => {
  it('crea una hija por parte, cada una con su total', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    expect(salida.hijas).toHaveLength(2);
    expect(salida.hijas.map((h) => h.totalCentavos)).toEqual(['10000', '15000']);
    expect(salida.totalCentavos).toBe('25000');
  });

  it('LAS HIJAS NACEN SIN MESA — o la segunda chocaría con ordenes_una_activa_por_mesa', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    const hijas = base.filas('ordenes').filter((o) => o['orden_padre_id'] === CUENTA);
    expect(hijas).toHaveLength(2);
    for (const hija of hijas) {
      expect(hija['mesa_id']).toBeNull();
      // Pedida, no «confirmada»: la mesa pidió cuentas separadas y la caja las cobra.
      expect(hija['estado']).toBe('cuenta_solicitada');
    }
    expect(hijas.map((h) => h['division_indice'])).toEqual([1, 2]);
  });

  it('LA MADRE QUEDA SELLADA — una cuenta dividida ya no se cobra', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    const madre = base.filas('ordenes').find((o) => o['id'] === CUENTA);
    expect(madre?.['estado']).toBe('dividida');
    // Y conserva la mesa: es la madre la que la mantiene ocupada mientras se
    // cobran las partes.
    expect(madre?.['mesa_id']).toBe(MESA_5);
  });

  it('cada línea cambia de dueño: ninguna se queda en la madre', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    const huerfanas = base.filas('orden_lineas').filter((l) => l['orden_id'] === CUENTA);
    expect(huerfanas).toEqual([]);
  });

  it('deja bitácora con las líneas congeladas y la parte a la que fueron', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    const movimientos = base.filas('movimientos_cuenta');
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]?.['tipo']).toBe('division');
    expect(movimientos[0]?.['mesa_origen_id']).toBe(MESA_5);
    expect(movimientos[0]?.['empleado_id']).toBe(EMPLEADO);

    const anotadas = JSON.parse(String(movimientos[0]?.['lineas'])) as readonly {
      linea_id: string;
      importe_centavos: string;
      parte: number;
    }[];
    expect(anotadas.map((l) => l.importe_centavos)).toEqual(['10000', '15000']);
    expect(anotadas.map((l) => l.parte)).toEqual([1, 2]);
  });

  it('UNA LÍNEA ANULADA NO SE REPARTE — nadie paga comida que se canceló', async () => {
    // La anulada vale $150 y está fuera del reparto: las dos partes suman sólo
    // los $200 vivos. Si el comando la cargara, o las partes no cuadrarían o
    // alguien pagaría un platillo que la cocina nunca sirvió.
    const base = baseDe({ total_centavos: 20_000n }, [
      linea({
        cantidad: '2.0000',
        subtotal_centavos: 20_000n,
        total_centavos: 20_000n,
        anulada_en: null,
      }),
      linea({
        id: OTRA_LINEA,
        subtotal_centavos: 15_000n,
        total_centavos: 15_000n,
        anulada_en: new Date('2026-09-14T00:00:00.000Z'),
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, {
      ordenId: CUENTA,
      particiones: [
        { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
        { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
      ],
    });

    expect(salida.totalCentavos).toBe('20000');
    expect(salida.hijas.map((h) => h.totalCentavos)).toEqual(['10000', '10000']);
    // La anulada se queda con la madre, que es donde queda su rastro.
    const anulada = base.filas('orden_lineas').find((l) => l['id'] === OTRA_LINEA);
    expect(anulada?.['orden_id']).toBe(CUENTA);
  });

  it('audita cuántas partes salieron y con qué folios', async () => {
    const base = baseDe();
    const { ctx, auditorias, pasos } = contextoFalso(base.tx, ambitoDe('gerente'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    expect(auditorias).toHaveLength(1);
    expect(auditorias[0]?.entidadId).toBe(CUENTA);
    expect(auditorias[0]?.payload['partes']).toBe(2);
    expect(auditorias[0]?.payload['totalCentavos']).toBe('25000');
    expect(pasos).toEqual([
      'cargar_orden',
      'cargar_lineas',
      'cargar_mesa',
      'escribir_division',
      'pedir_cuenta_en_mesa',
    ]);
  });
});

/** Un platillo de una cuenta de mesa: `unidades` a `unitario`, con su costo. */
function platillo(
  id: string,
  nombre: string,
  unidades: number,
  unitario: bigint,
  costo: bigint,
): Fila {
  const total = unitario * BigInt(unidades);
  return linea({
    id,
    producto_nombre: nombre,
    cantidad: `${String(unidades)}.0000`,
    precio_unitario_centavos: unitario,
    costo_unitario_centavos: costo,
    subtotal_centavos: total,
    total_centavos: total,
    utilidad_centavos: total - costo * BigInt(unidades),
    material_centavos: 0n,
    cantidad_variable: null,
    cantidad_porciones: null,
    anulada_en: null,
  });
}

/** Lo que cocina tiene de una línea: el item de su comanda, ya servido. */
function itemDe(id: string, lineaId: string, nombre: string, unidades: number): Fila {
  return comandaItem('entregado', {
    id,
    orden_linea_id: lineaId,
    producto_nombre: nombre,
    cantidad: `${String(unidades)}.0000`,
    cantidad_variable: null,
    cantidad_porciones: null,
  });
}

const ARRACHERA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1';
const SOPA = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2';
const CERVEZA = 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaa3';

/** La mesa de cuatro: dos arracheras, una sopa y dos cervezas, $883.00, la cuenta ya pedida. */
function mesaDeCuatro() {
  return crearBaseFalsa(
    {
      ordenes: [
        ordenDeMesa('cuenta_solicitada', {
          serie: SERIE,
          total_centavos: 88_300n,
          empleado_atiende_id: EMPLEADO,
          orden_padre_id: null,
          division_indice: null,
          codigo_caja: 'M05-4821',
          propina_tipo: 'porcentaje',
          propina_puntos_base: 1000,
          propina_origen: 'mesero',
        }),
      ],
      orden_lineas: [
        platillo(ARRACHERA, 'Arrachera al carbón', 2, 32_900n, 10_440n),
        platillo(SOPA, 'Sopa de tortilla', 1, 11_500n, 3_000n),
        platillo(CERVEZA, 'Cerveza clara 355 ml', 2, 5_500n, 2_200n),
      ],
      comanda_items: [
        itemDe('eeeeeeee-0000-4eee-8eee-000000000001', ARRACHERA, 'Arrachera al carbón', 2),
        itemDe('eeeeeeee-0000-4eee-8eee-000000000002', SOPA, 'Sopa de tortilla', 1),
        itemDe('eeeeeeee-0000-4eee-8eee-000000000003', CERVEZA, 'Cerveza clara 355 ml', 2),
      ],
      movimientos_cuenta: [],
      mesas: [mesa('cuenta_solicitada')],
      eventos_mesa: [],
    },
    { predeterminados: PREDETERMINADOS, filasCrudas: PRIMER_FOLIO },
  );
}

/** «Yo pago mi arrachera y mi cerveza; nosotros, el resto»: las unidades se reparten. */
const CADA_QUIEN_LO_SUYO = {
  ordenId: CUENTA,
  particiones: [
    {
      tomas: [
        { lineaId: ARRACHERA, cantidad: 1 },
        { lineaId: CERVEZA, cantidad: 1 },
      ],
    },
    {
      tomas: [
        { lineaId: ARRACHERA, cantidad: 1 },
        { lineaId: SOPA, cantidad: 1 },
        { lineaId: CERVEZA, cantidad: 1 },
      ],
    },
  ],
};

const sumaDe = (filas: readonly Fila[], columna: string): bigint =>
  filas.reduce((suma, fila) => {
    const valor = fila[columna];
    return suma + (typeof valor === 'bigint' ? valor : 0n);
  }, 0n);

describe('F-321 · las partes nacen COBRABLES', () => {
  it('UNA CUENTA CON LA CUENTA YA PEDIDA SE DIVIDE — que es cuando la mesa pide «separadas»', async () => {
    const base = baseDe(
      {
        estado: 'cuenta_solicitada',
        codigo_caja: 'M05-4821',
        propina_tipo: 'porcentaje',
        propina_puntos_base: 1000,
        propina_origen: 'mesero',
      },
      undefined,
      'cuenta_solicitada',
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    expect(salida.hijas).toHaveLength(2);
    expect(base.campo('ordenes', 'estado')).toBe('dividida');
    // La mesa ya estaba pedida: no hay transición que sellar.
    expect(salida.estadoMesa).toBe('cuenta_solicitada');
    expect(base.filas('eventos_mesa')).toEqual([]);
  });

  it('CADA PARTE ES UNA CUENTA PEDIDA, con su código, su nombre y la propina que acordó la mesa', async () => {
    const base = baseDe({
      codigo_caja: 'M05-4821',
      propina_tipo: 'porcentaje',
      propina_puntos_base: 1000,
      propina_origen: 'mesero',
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    expect(salida.hijas.map((h) => h.codigoCaja)).toEqual(['M05-4821-1', 'M05-4821-2']);
    expect(salida.hijas.map((h) => h.etiqueta)).toEqual([
      'Mesa 5 · cuenta 1 de 2',
      'Mesa 5 · cuenta 2 de 2',
    ]);
    const hijas = base.filas('ordenes').filter((o) => o['orden_padre_id'] === CUENTA);
    for (const hija of hijas) {
      expect(hija['estado']).toBe('cuenta_solicitada');
      // El 10 % de la mesa lo aplica cada parte sobre SU consumo: no se pierde en la división.
      expect(hija['propina_tipo']).toBe('porcentaje');
      expect(hija['propina_puntos_base']).toBe(1000);
      expect(hija['propina_origen']).toBe('mesero');
    }
    expect(hijas.map((h) => h['cliente_nombre'])).toEqual([
      'Mesa 5 · cuenta 1 de 2',
      'Mesa 5 · cuenta 2 de 2',
    ]);
  });

  it('SI NADIE HABÍA PEDIDO LA CUENTA, dividir la pide: la mesa lo dice y la transición se sella', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    expect(salida.estadoMesa).toBe('cuenta_solicitada');
    expect(base.filas('mesas')[0]?.['estado']).toBe('cuenta_solicitada');
    const eventos = base.filas('eventos_mesa');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.['estado_anterior']).toBe('pedido_enviado');
    expect(eventos[0]?.['estado_nuevo']).toBe('cuenta_solicitada');
    expect(eventos[0]?.['orden_id']).toBe(CUENTA);
    // Sin código ni propina previos, cada parte lo recibe de la mesa y la propina la decide la caja.
    const hijas = base.filas('ordenes').filter((o) => o['orden_padre_id'] === CUENTA);
    expect(hijas.map((h) => h['codigo_caja'])).toEqual([
      expect.stringMatching(/^M05-\d{4}-1$/u),
      expect.stringMatching(/^M05-\d{4}-2$/u),
    ]);
    for (const hija of hijas) {
      expect(hija['propina_tipo']).toBe('decidir_en_caja');
      expect(hija['propina_puntos_base']).toBe(0);
      expect(hija['propina_origen']).toBe('caja');
    }
  });

  it('UN MONTO A MANO NO SE REPARTE: cada parte lo vuelve a decidir en la caja', async () => {
    const base = baseDe({ propina_tipo: 'monto_manual', propina_puntos_base: 0 });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    const hijas = base.filas('ordenes').filter((o) => o['orden_padre_id'] === CUENTA);
    expect(hijas.map((h) => h['propina_tipo'])).toEqual(['decidir_en_caja', 'decidir_en_caja']);
  });

  it('«SIN PROPINA» SE HEREDA: la mesa ya dijo que no, y la caja no se lo vuelve a preguntar', async () => {
    const base = baseDe({ propina_tipo: 'sin_propina', propina_puntos_base: 0 });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    const hijas = base.filas('ordenes').filter((o) => o['orden_padre_id'] === CUENTA);
    expect(hijas.map((h) => h['propina_tipo'])).toEqual(['sin_propina', 'sin_propina']);
  });

  it('LAS PARTES NO GASTAN FOLIO: se toma al cobrar, como en cualquier cuenta de mesa', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, EN_DOS);

    // Un folio al dividir y otro al cobrar dejaba un hueco permanente por cada parte.
    const hijas = base.filas('ordenes').filter((o) => o['orden_padre_id'] === CUENTA);
    expect(hijas.map((h) => h['folio'] ?? null)).toEqual([null, null]);
  });
});

describe('F-321 · repartir UNIDADES de una misma línea', () => {
  it('LA LÍNEA DE DOS SE PARTE: cada cuenta se queda con SU unidad y SU cuota del importe', async () => {
    const base = mesaDeCuatro();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, CADA_QUIEN_LO_SUYO);

    // $329 + $55 y $329 + $115 + $55: lo que dijo la mesa, no lo que quedó de mover filas.
    expect(salida.hijas.map((h) => h.totalCentavos)).toEqual(['38400', '49900']);
    const lineas = base.filas('orden_lineas');
    for (const hija of salida.hijas) {
      const suyas = lineas.filter((l) => l['orden_id'] === hija.ordenId);
      // El defecto: la primera cuenta se quedaba con las dos arracheras y las dos cervezas
      // (768.00) y la segunda con la sopa sola (115.00). Las líneas tienen que sumar lo que
      // la cuenta dice que vale.
      expect(sumaDe(suyas, 'total_centavos')).toBe(BigInt(hija.totalCentavos));
      expect(sumaDe(suyas, 'subtotal_centavos')).toBe(BigInt(hija.totalCentavos));
    }
    expect(lineas.filter((l) => l['orden_id'] === CUENTA)).toEqual([]);
    expect(lineas).toHaveLength(5);
  });

  it('cada fila lleva SU cantidad, y la utilidad se reparte igual que el importe', async () => {
    const base = mesaDeCuatro();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, CADA_QUIEN_LO_SUYO);

    const [primera, segunda] = salida.hijas;
    const deLa = (id: string | undefined) =>
      base
        .filas('orden_lineas')
        .filter((l) => l['orden_id'] === id)
        .map((l) => [l['producto_nombre'], l['cantidad']]);
    expect(deLa(primera?.ordenId)).toEqual([
      ['Arrachera al carbón', '1.0000'],
      ['Cerveza clara 355 ml', '1.0000'],
    ]);
    expect(deLa(segunda?.ordenId)).toEqual([
      ['Sopa de tortilla', '1.0000'],
      ['Arrachera al carbón', '1.0000'],
      ['Cerveza clara 355 ml', '1.0000'],
    ]);
    const arracheras = base
      .filas('orden_lineas')
      .filter((l) => l['producto_nombre'] === 'Arrachera al carbón');
    expect(arracheras.map((l) => l['utilidad_centavos'])).toEqual([22_460n, 22_460n]);
  });

  it('COCINA LA SIGUE: cada fila hermana tiene su item, o el cobro la mandaría otra vez a la plancha', async () => {
    const base = mesaDeCuatro();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await dividirCuentaComando.ejecutar(ctx, CADA_QUIEN_LO_SUYO);

    const lineas = base.filas('orden_lineas');
    const items = base.filas('comanda_items');
    // Cinco filas, cinco items —el de la línea de dos pasó a dos de una—.
    expect(items).toHaveLength(5);
    for (const linea of lineas) {
      const deLaLinea = items.filter((i) => i['orden_linea_id'] === linea['id']);
      expect(deLaLinea, `«${String(linea['producto_nombre'])}» se quedó sin su item`).toHaveLength(
        1,
      );
      expect(deLaLinea[0]?.['cantidad']).toBe(linea['cantidad']);
      // Siguen en la comanda de siempre y con el estado que tenían: lo servido no se vuelve a pedir.
      expect(deLaLinea[0]?.['comanda_id']).toBe(COMANDA);
      expect(deLaLinea[0]?.['estado']).toBe('entregado');
    }
  });

  it('TRES PARTES de una línea que no se parte pareja: ningún centavo se pierde', async () => {
    // Tres tacos que suman $100.00 se reparten 33.34 · 33.33 · 33.33.
    const base = baseDe({ total_centavos: 10_000n }, [
      {
        ...platillo(ARRACHERA, 'Tacos al pastor', 3, 3_333n, 1_000n),
        subtotal_centavos: 10_000n,
        total_centavos: 10_000n,
      },
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await dividirCuentaComando.ejecutar(ctx, {
      ordenId: CUENTA,
      particiones: [
        { tomas: [{ lineaId: ARRACHERA, cantidad: 1 }] },
        { tomas: [{ lineaId: ARRACHERA, cantidad: 1 }] },
        { tomas: [{ lineaId: ARRACHERA, cantidad: 1 }] },
      ],
    });

    expect(salida.hijas.map((h) => h.totalCentavos)).toEqual(['3334', '3333', '3333']);
    const lineas = base.filas('orden_lineas');
    for (const hija of salida.hijas) {
      const suyas = lineas.filter((l) => l['orden_id'] === hija.ordenId);
      expect(sumaDe(suyas, 'total_centavos')).toBe(BigInt(hija.totalCentavos));
    }
    expect(sumaDe(lineas, 'total_centavos')).toBe(10_000n);
  });

  it('una línea que no tiene unidades enteras NO se parte: va entera a una cuenta', async () => {
    const base = baseDe({ total_centavos: 25_000n }, [
      linea({
        cantidad: '2.5000',
        total_centavos: 25_000n,
        subtotal_centavos: 25_000n,
        utilidad_centavos: 10_000n,
        material_centavos: 0n,
        cantidad_variable: null,
        cantidad_porciones: null,
        anulada_en: null,
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const codigo = await codigoDe(() =>
      dividirCuentaComando.ejecutar(ctx, {
        ordenId: CUENTA,
        particiones: [
          { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
          { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
        ],
      }),
    );

    expect(codigo).toBe('DIVISION_NO_CUADRA');
  });
});

describe('F-321 · lo que el comando rechaza', () => {
  it('una cuenta que ya se cobró', async () => {
    const base = baseDe({ estado: 'pagada' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => dividirCuentaComando.ejecutar(ctx, EN_DOS))).toBe(
      'ORDEN_NO_EDITABLE',
    );
  });

  it('una cuenta YA DIVIDIDA — las hijas de las hijas dejarían de sumar a la madre', async () => {
    const base = baseDe({ estado: 'dividida' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => dividirCuentaComando.ejecutar(ctx, EN_DOS))).toBe(
      'ORDEN_NO_EDITABLE',
    );
  });

  it('UNA PARTE NO SE VUELVE A DIVIDIR — la mesa se recoge al cobrar las partes de la madre', async () => {
    const base = baseDe({
      estado: 'cuenta_solicitada',
      mesa_id: null,
      orden_padre_id: '99999999-9999-4999-8999-999999999990',
      division_indice: 1,
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => dividirCuentaComando.ejecutar(ctx, EN_DOS))).toBe(
      'ORDEN_NO_EDITABLE',
    );
  });

  it('una cuenta de OTRO negocio se ve igual que una inexistente', async () => {
    const base = baseDe({ organizacion_id: '00000000-0000-4000-8000-000000000000' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => dividirCuentaComando.ejecutar(ctx, EN_DOS))).toBe(
      'ORDEN_NO_ENCONTRADA',
    );
  });

  it('una cuenta sin consumo', async () => {
    const base = baseDe({}, []);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    expect(await codigoDe(() => dividirCuentaComando.ejecutar(ctx, EN_DOS))).toBe('ORDEN_VACIA');
  });

  it('un reparto que cobra dos veces el mismo platillo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const codigo = await codigoDe(() =>
      dividirCuentaComando.ejecutar(ctx, {
        ordenId: CUENTA,
        particiones: [
          { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
          { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
        ],
      }),
    );

    expect(codigo).toBe('DIVISION_NO_CUADRA');
  });

  it('NO ESCRIBE NADA cuando el reparto no cuadra', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    await codigoDe(() =>
      dividirCuentaComando.ejecutar(ctx, {
        ordenId: CUENTA,
        particiones: [
          { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
          { tomas: [{ lineaId: LINEA, cantidad: 1 }] },
        ],
      }),
    );

    expect(base.filas('ordenes')).toHaveLength(1);
    expect(base.filas('movimientos_cuenta')).toEqual([]);
    expect(base.campo('ordenes', 'estado')).toBe('confirmada');
  });
});

describe('F-321 · quién divide, y qué puede mandar', () => {
  it('el mesero NO: es quien tiene el incentivo más directo sobre su cuenta', () => {
    expect(dividirCuentaComando.roles).not.toContain('mesero');
    expect(dividirCuentaComando.roles).toContain('cajero');
  });

  it('EL CLIENTE NO MANDA IMPORTES: la entrada sólo acepta líneas y cantidades', () => {
    const analisis = dividirCuentaComando.entrada.safeParse({
      ordenId: CUENTA,
      particiones: [
        { tomas: [{ lineaId: LINEA, cantidad: 1, importeCentavos: 1 }] },
        { tomas: [{ lineaId: OTRA_LINEA, cantidad: 1 }] },
      ],
    });

    expect(analisis.success).toBe(true);
    const tomada = analisis.success ? analisis.data.particiones[0]?.tomas[0] : undefined;
    expect(tomada).toEqual({ lineaId: LINEA, cantidad: 1 });
  });

  it('dividir en una sola parte no pasa ni de la entrada', () => {
    const analisis = dividirCuentaComando.entrada.safeParse({
      ordenId: CUENTA,
      particiones: [{ tomas: [{ lineaId: LINEA, cantidad: 1 }] }],
    });

    expect(analisis.success).toBe(false);
  });
});
