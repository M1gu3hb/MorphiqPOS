import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import {
  cerrarCotizacion,
  convertirCotizacion,
  crearCotizacion,
  registrarAprobacion,
  registrarEnvio,
  registrarSurtido,
  versionarCotizacion,
} from './cotizacion.ts';

/**
 * F-600 a F-605 y F-607 · La cotización, de punta a punta.
 *
 * ── Qué se prueba y por qué eso ──────────────────────────────────────────
 * Las cuatro puertas por las que este bloque pierde dinero de verdad:
 *
 *   1 · Que los TOTALES los calcule el servidor. Aceptar el del cliente es
 *       aceptar su precio, y en una cotización de cien mil pesos eso no es un
 *       redondeo.
 *   2 · Que versionar CREE y no edite. La versión que el cliente aprobó tiene
 *       que seguir existiendo el día de la entrega.
 *   3 · Que una VENCIDA no se convierta. Honrarla tres meses después es cerrar
 *       en pérdida la venta que se celebró — el estado de hoy con el Excel.
 *   4 · Que perder EXIJA motivo. «Se perdió» sin motivo no enseña nada, y es
 *       justo lo único que este bloque tiene que producir.
 */

const AHORA = new Date('2026-09-15T12:00:00.000Z');
const COTIZACION = 'c0000000-0000-4000-8000-000000000001';
const LINEA = 'a0000000-0000-4000-8000-000000000001';
const ORDEN = '0d000000-0000-4000-8000-000000000001';

const LINEAS_DE_ENTRADA = [
  {
    productoId: null,
    descripcion: 'Varilla del 3',
    cantidad: '10.0000',
    unidad: 'pieza',
    precioUnitarioCentavos: 12_500,
  },
  {
    productoId: null,
    descripcion: 'Bulto de cemento',
    cantidad: '4.5000',
    unidad: 'bulto',
    precioUnitarioCentavos: 24_000,
  },
];

function tabla(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return { cotizaciones: [], cotizacion_lineas: [], cotizacion_eventos: [], ...extra };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(tabla(extra), {
    predeterminados: {
      cotizaciones: {
        version_anterior_id: null,
        orden_id: null,
        motivo_cierre: null,
        competidor: null,
        enviada_en: null,
        aprobada_en: null,
        cerrada_en: null,
        obra_id: null,
        correo_libre: null,
        telefono_libre: null,
      },
      cotizacion_lineas: { producto_id: null, surtida: '0.0000' },
      cotizacion_eventos: { medio: null, nota: null, empleado_id: null },
    },
  });

function cotizacionGuardada(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: COTIZACION,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    folio: 'COT-1',
    version: 1,
    vigente: true,
    cliente_id: null,
    nombre_libre: 'Obra Reforma',
    estado: 'borrador',
    vence_el: '2026-09-30',
    subtotal_centavos: 233_000n,
    descuento_centavos: 0n,
    total_centavos: 233_000n,
    ...cambios,
  };
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-600 · crear', () => {
  it('EL TOTAL LO CALCULA EL SERVIDOR, línea por línea', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await crearCotizacion.ejecutar(ctx, {
      folio: 'COT-1',
      venceEl: '2026-09-30',
      clienteId: null,
      obraId: null,
      nombreLibre: 'Obra Reforma',
      correoLibre: null,
      telefonoLibre: null,
      descuentoCentavos: 0,
      lineas: LINEAS_DE_ENTRADA,
    });

    // 10 × $125 = $1,250 · 4.5 × $240 = $1,080 · total $2,330.
    expect(salida.totalCentavos).toBe('233000');
    const lineas = base.filas('cotizacion_lineas');
    expect(lineas[0]?.['total_centavos']).toBe(125_000n);
    // La cantidad fraccionaria NO pierde el decimal: 4.5 × 24 000 = 108 000.
    expect(lineas[1]?.['total_centavos']).toBe(108_000n);
  });

  it('el descuento se resta del subtotal y no de cada línea', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await crearCotizacion.ejecutar(ctx, {
      folio: 'COT-2',
      venceEl: '2026-09-30',
      clienteId: null,
      obraId: null,
      nombreLibre: 'Obra Reforma',
      correoLibre: null,
      telefonoLibre: null,
      descuentoCentavos: 30_000,
      lineas: LINEAS_DE_ENTRADA,
    });

    expect(salida.totalCentavos).toBe('203000');
    // Y las líneas conservan su precio íntegro: es lo que se honra al surtir.
    expect(base.filas('cotizacion_lineas')[0]?.['total_centavos']).toBe(125_000n);
  });

  it('un descuento mayor que el subtotal se rechaza', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      crearCotizacion.ejecutar(ctx, {
        folio: 'COT-3',
        venceEl: '2026-09-30',
        clienteId: null,
        obraId: null,
        nombreLibre: 'Obra Reforma',
        correoLibre: null,
        telefonoLibre: null,
        descuentoCentavos: 999_999,
        lineas: LINEAS_DE_ENTRADA,
      }),
    );

    expect(codigo).toBe('DINERO_PORCENTAJE_INVALIDO');
  });

  it('NO puede nacer vencida', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      crearCotizacion.ejecutar(ctx, {
        folio: 'COT-4',
        venceEl: '2026-09-01',
        clienteId: null,
        obraId: null,
        nombreLibre: 'Obra Reforma',
        correoLibre: null,
        telefonoLibre: null,
        descuentoCentavos: 0,
        lineas: LINEAS_DE_ENTRADA,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('sin cliente y sin nombre no es una cotización', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      crearCotizacion.ejecutar(ctx, {
        folio: 'COT-5',
        venceEl: '2026-09-30',
        clienteId: null,
        obraId: null,
        nombreLibre: null,
        correoLibre: null,
        telefonoLibre: null,
        descuentoCentavos: 0,
        lineas: LINEAS_DE_ENTRADA,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('F-601 · versionar CREA, nunca edita', () => {
  it('la versión anterior sigue existiendo, apagada', async () => {
    const base = baseDe({ cotizaciones: [cotizacionGuardada()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await versionarCotizacion.ejecutar(ctx, {
      cotizacionId: COTIZACION,
      venceEl: '2026-10-15',
      descuentoCentavos: 0,
      lineas: [LINEAS_DE_ENTRADA[0]!],
    });

    expect(salida.version).toBe(2);
    const filas = base.filas('cotizaciones');
    // DOS filas: la de antes no se tocó más que para apagarse.
    expect(filas).toHaveLength(2);
    expect(filas[0]?.['vigente']).toBe(false);
    expect(filas[0]?.['total_centavos']).toBe(233_000n);
    expect(filas[1]?.['vigente']).toBe(true);
    expect(filas[1]?.['version_anterior_id']).toBe(COTIZACION);
  });

  it('una ganada ya no se versiona: la vuelta siguiente empieza de cero', async () => {
    const base = baseDe({
      cotizaciones: [cotizacionGuardada({ estado: 'ganada', orden_id: ORDEN })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      versionarCotizacion.ejecutar(ctx, {
        cotizacionId: COTIZACION,
        venceEl: '2026-10-15',
        descuentoCentavos: 0,
        lineas: [LINEAS_DE_ENTRADA[0]!],
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });
});

describe('F-602 y F-603 · el rastro', () => {
  it('mandar sella la fecha, que es de lo único que vive el seguimiento', async () => {
    const base = baseDe({ cotizaciones: [cotizacionGuardada()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarEnvio.ejecutar(ctx, { cotizacionId: COTIZACION, medio: 'whatsapp' });

    expect(base.filas('cotizaciones')[0]?.['enviada_en']).toEqual(AHORA);
    expect(base.filas('cotizacion_eventos')[0]?.['medio']).toBe('whatsapp');
  });

  it('sólo se aprueba lo que se MANDÓ', async () => {
    // Aprobar un borrador es aprobar un precio que el cliente nunca vio, y es
    // la vía por la que una prueba acaba en venta.
    const base = baseDe({ cotizaciones: [cotizacionGuardada()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      registrarAprobacion.ejecutar(ctx, { cotizacionId: COTIZACION }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('aprobar una VENCIDA se corta antes de convertir', async () => {
    const base = baseDe({
      cotizaciones: [cotizacionGuardada({ estado: 'enviada', vence_el: '2026-09-01' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      registrarAprobacion.ejecutar(ctx, { cotizacionId: COTIZACION }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });
});

describe('F-604 · convertir', () => {
  it('la ganada queda con orden Y fecha de cierre a la vez', async () => {
    const base = baseDe({ cotizaciones: [cotizacionGuardada({ estado: 'aprobada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await convertirCotizacion.ejecutar(ctx, { cotizacionId: COTIZACION, ordenId: ORDEN });

    const fila = base.filas('cotizaciones')[0];
    expect(fila?.['estado']).toBe('ganada');
    expect(fila?.['orden_id']).toBe(ORDEN);
    // Sin fecha, la ganada no se puede sacar del embudo del mes.
    expect(fila?.['cerrada_en']).toEqual(AHORA);
  });

  it('UNA VENCIDA NO SE CONVIERTE', async () => {
    const base = baseDe({
      cotizaciones: [cotizacionGuardada({ estado: 'aprobada', vence_el: '2026-08-01' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      convertirCotizacion.ejecutar(ctx, { cotizacionId: COTIZACION, ordenId: ORDEN }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });
});

describe('F-605 · el surtido parcial, que es el caso normal', () => {
  it('entregar parte deja el resto pendiente, a prorrata', async () => {
    const base = baseDe({
      cotizaciones: [cotizacionGuardada({ estado: 'ganada', orden_id: ORDEN })],
      cotizacion_lineas: [
        {
          id: LINEA,
          organizacion_id: ORG,
          cotizacion_id: COTIZACION,
          orden_visual: 0,
          descripcion: 'Varilla del 3',
          cantidad: '10.0000',
          unidad: 'pieza',
          precio_unitario_centavos: 12_500n,
          total_centavos: 125_000n,
          surtida: '0.0000',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarSurtido.ejecutar(ctx, {
      cotizacionId: COTIZACION,
      entregas: [{ lineaId: LINEA, cantidad: '4.0000' }],
    });

    expect(salida.completa).toBe(false);
    expect(salida.lineasPendientes).toBe(1);
    expect(salida.pendienteCentavos).toBe('75000');
    expect(base.filas('cotizacion_lineas')[0]?.['surtida']).toBe('4.0000');
  });

  it('entregar MÁS de lo cotizado se rechaza, diciendo qué línea', async () => {
    const base = baseDe({
      cotizaciones: [cotizacionGuardada({ estado: 'ganada', orden_id: ORDEN })],
      cotizacion_lineas: [
        {
          id: LINEA,
          organizacion_id: ORG,
          cotizacion_id: COTIZACION,
          orden_visual: 0,
          descripcion: 'Varilla del 3',
          cantidad: '10.0000',
          unidad: 'pieza',
          precio_unitario_centavos: 12_500n,
          total_centavos: 125_000n,
          surtida: '8.0000',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      registrarSurtido.ejecutar(ctx, {
        cotizacionId: COTIZACION,
        entregas: [{ lineaId: LINEA, cantidad: '5.0000' }],
      }),
    );

    expect(codigo).toBe('CANTIDAD_INVALIDA');
    // Y NADA se escribió: la comprobación va antes de tocar ninguna línea.
    expect(base.filas('cotizacion_lineas')[0]?.['surtida']).toBe('8.0000');
  });
});

describe('F-607 · el seguimiento', () => {
  it('PERDER EXIGE MOTIVO', async () => {
    const base = baseDe({ cotizaciones: [cotizacionGuardada({ estado: 'enviada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() =>
      cerrarCotizacion.ejecutar(ctx, {
        cotizacionId: COTIZACION,
        resultado: 'perdida',
        competidor: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('con motivo se cierra, y el competidor se guarda al lado', async () => {
    const base = baseDe({ cotizaciones: [cotizacionGuardada({ estado: 'enviada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await cerrarCotizacion.ejecutar(ctx, {
      cotizacionId: COTIZACION,
      resultado: 'perdida',
      motivo: 'precio: 8 % arriba',
      competidor: 'La Broca',
    });

    const fila = base.filas('cotizaciones')[0];
    expect(fila?.['estado']).toBe('perdida');
    expect(fila?.['motivo_cierre']).toBe('precio: 8 % arriba');
    expect(fila?.['competidor']).toBe('La Broca');
    expect(fila?.['cerrada_en']).toEqual(AHORA);
  });

  it('la VENCIDA se cierra sola, con su motivo por omisión', async () => {
    const base = baseDe({ cotizaciones: [cotizacionGuardada({ estado: 'enviada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await cerrarCotizacion.ejecutar(ctx, {
      cotizacionId: COTIZACION,
      resultado: 'vencida',
      competidor: null,
    });

    expect(base.filas('cotizaciones')[0]?.['motivo_cierre']).toBe('venció sin respuesta');
  });
});
