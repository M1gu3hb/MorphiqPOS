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
  CUENTA,
  LINEA,
  linea,
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
function salon(cambiosDeOrden: Fila = {}, lineas?: readonly Fila[]): TablasFalsas {
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
      linea({ id: OTRA_LINEA, total_centavos: 15_000n, anulada_en: null }),
    ],
    movimientos_cuenta: [],
  };
}

const baseDe = (cambios: Fila = {}, lineas?: readonly Fila[]) =>
  crearBaseFalsa(salon(cambios, lineas), {
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
      expect(hija['estado']).toBe('confirmada');
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
      linea({ cantidad: '2.0000', total_centavos: 20_000n, anulada_en: null }),
      linea({
        id: OTRA_LINEA,
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
    expect(pasos).toEqual(['cargar_orden', 'cargar_lineas', 'escribir_division']);
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
