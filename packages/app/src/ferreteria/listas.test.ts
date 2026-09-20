import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { capturarListaTrabajo, cerrarListaTrabajo } from './listas.ts';

/**
 * F-153 · La lista de trabajo: el papel del albañil.
 *
 * ── Lo que esta prueba defiende ──────────────────────────────────────────
 * Que se guarde LO QUE PIDIERON y no sólo lo que el mostradorista tradujo. La
 * mitad de los renglones son «cemento del gris» y «medio bulto de cal»; si el
 * sistema guarda únicamente la clave de catálogo, la discusión de la tarde —«yo
 * pedí varilla del 3, no del 4»— no se puede resolver con nada.
 *
 * Y que cerrar deje SIEMPRE fecha: una lista cerrada sin fecha no sale de la
 * bandeja del día y vuelve a aparecer cada mañana, hasta que alguien deja de
 * mirar la bandeja.
 */

const AHORA = new Date('2026-09-15T12:00:00.000Z');
const LISTA = '11500000-0000-4000-8000-000000000001';
const PRODUCTO = 'b0000000-0000-4000-8000-000000000002';

function tabla(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return { listas_trabajo: [], lineas_lista_trabajo: [], ...extra };
}

/**
 * `filasCrudas` es lo que devuelve `tomarFolio`.
 *
 * El folio ya no lo manda la pantalla —no tiene ninguno que dar— y lo toma el
 * servidor con `update folios … returning`, que es SQL crudo. La base falsa
 * contesta a lo crudo con lo que la prueba declara aquí, así que la primera lista
 * de esta sucursal sale con `LT-1`, que es exactamente lo que se afirma abajo.
 */
const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(tabla(extra), {
    filasCrudas: [{ siguiente: 1n }],
    predeterminados: {
      listas_trabajo: {
        cliente_id: null,
        obra_id: null,
        nombre_libre: null,
        telefono_libre: null,
        orden_id: null,
        capturada_por: null,
        cerrada_en: null,
        nota: null,
      },
      lineas_lista_trabajo: {
        producto_id: null,
        cantidad: null,
        unidad: null,
        surtida: '0.0000',
        orden_linea_id: null,
        sin_existencia: false,
        nota: null,
      },
    },
  });

function listaGuardada(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LISTA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    folio: 'LT-1',
    titulo: 'Losa del 3er piso',
    nombre_libre: 'Don Beto',
    estado: 'abierta',
    cerrada_en: null,
    nota: null,
    ...cambios,
  };
}

const RENGLONES = [
  {
    textoPedido: 'cemento del gris',
    productoId: null,
    cantidad: null,
    unidad: null,
  },
  {
    textoPedido: 'varilla del 3, veinte piezas',
    productoId: PRODUCTO,
    cantidad: '20.0000',
    unidad: 'pieza',
  },
];

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-153 · capturar', () => {
  it('GUARDA LO QUE PIDIERON, traducido o no', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await capturarListaTrabajo.ejecutar(ctx, {
      titulo: 'Losa del 3er piso',
      clienteId: null,
      obraId: null,
      nombreLibre: 'Don Beto',
      telefonoLibre: null,
      renglones: RENGLONES,
    });

    expect(salida.renglones).toBe(2);
    // El folio lo puso el SERVIDOR, en la serie de las listas.
    expect(salida.folio).toBe('LT-1');
    expect(base.filas('listas_trabajo')[0]?.['folio']).toBe('LT-1');
    const lineas = base.filas('lineas_lista_trabajo');
    // El renglón sin traducir conserva su texto y NO inventa producto.
    expect(lineas[0]?.['texto_pedido']).toBe('cemento del gris');
    expect(lineas[0]?.['producto_id']).toBeNull();
    // Y el traducido conserva el texto ADEMÁS de la clave: es lo que resuelve
    // «yo pedí varilla del 3, no del 4».
    expect(lineas[1]?.['texto_pedido']).toBe('varilla del 3, veinte piezas');
    expect(lineas[1]?.['producto_id']).toBe(PRODUCTO);
  });

  it('una cantidad SIN producto no se guarda: es un número sin unidad', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await capturarListaTrabajo.ejecutar(ctx, {
      titulo: 'Losa del 3er piso',
      clienteId: null,
      obraId: null,
      nombreLibre: 'Don Beto',
      telefonoLibre: null,
      renglones: [
        {
          textoPedido: 'medio bulto de cal',
          productoId: null,
          cantidad: '0.5000',
          unidad: 'bulto',
        },
      ],
    });

    const linea = base.filas('lineas_lista_trabajo')[0];
    expect(linea?.['cantidad']).toBeNull();
    expect(linea?.['unidad']).toBeNull();
  });

  it('el orden de los renglones es el que se dictó', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await capturarListaTrabajo.ejecutar(ctx, {
      titulo: 'Losa del 3er piso',
      clienteId: null,
      obraId: null,
      nombreLibre: 'Don Beto',
      telefonoLibre: null,
      renglones: RENGLONES,
    });

    expect(base.filas('lineas_lista_trabajo').map((l) => l['orden_visual'])).toEqual([0, 1]);
  });

  it('sin cliente y sin nombre no se le puede devolver a nadie', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      capturarListaTrabajo.ejecutar(ctx, {
        titulo: 'Losa del 3er piso',
        clienteId: null,
        obraId: null,
        nombreLibre: null,
        telefonoLibre: null,
        renglones: RENGLONES,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('listas_trabajo')).toEqual([]);
  });
});

describe('F-153 · cerrar', () => {
  it('surtida deja SIEMPRE fecha', async () => {
    const base = baseDe({ listas_trabajo: [listaGuardada()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cerrarListaTrabajo.ejecutar(ctx, { listaId: LISTA, resultado: 'surtida' });

    const fila = base.filas('listas_trabajo')[0];
    expect(fila?.['estado']).toBe('surtida');
    // Sin fecha no sale de la bandeja del día y reaparece cada mañana.
    expect(fila?.['cerrada_en']).toEqual(AHORA);
  });

  it('CANCELAR EXIGE MOTIVO', async () => {
    // Tres semanas después el albañil vuelve preguntando por su material, y
    // «cancelada» a secas no explica nada.
    const base = baseDe({ listas_trabajo: [listaGuardada()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      cerrarListaTrabajo.ejecutar(ctx, { listaId: LISTA, resultado: 'cancelada' }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('listas_trabajo')[0]?.['estado']).toBe('abierta');
  });

  it('con motivo, la cancelada se cierra y lo guarda', async () => {
    const base = baseDe({ listas_trabajo: [listaGuardada()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cerrarListaTrabajo.ejecutar(ctx, {
      listaId: LISTA,
      resultado: 'cancelada',
      motivo: 'compró en otro lado',
    });

    const fila = base.filas('listas_trabajo')[0];
    expect(fila?.['estado']).toBe('cancelada');
    expect(fila?.['nota']).toBe('compró en otro lado');
  });

  it('una lista ya cerrada no se vuelve a cerrar', async () => {
    const base = baseDe({
      listas_trabajo: [listaGuardada({ estado: 'surtida', cerrada_en: AHORA })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      cerrarListaTrabajo.ejecutar(ctx, { listaId: LISTA, resultado: 'surtida' }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('la PARCIAL sí se puede cerrar: surtir a medias es el caso normal', async () => {
    const base = baseDe({ listas_trabajo: [listaGuardada({ estado: 'parcial' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cerrarListaTrabajo.ejecutar(ctx, { listaId: LISTA, resultado: 'surtida' });

    expect(base.filas('listas_trabajo')[0]?.['estado']).toBe('surtida');
  });
});
