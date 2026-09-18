import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { devolverRenta, sacarEnRenta } from './renta.ts';

/**
 * F-147 · La herramienta que sale y tiene que volver.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el cobro salga del TIEMPO FUERA y de la tarifa, no de lo que teclee el
 * mostrador. Con una rotativa de $400 al día, la diferencia entre dos días y
 * tres la pone alguien de memoria, y siempre a la baja.
 *
 * Que las unidades empezadas se cobren enteras y el mínimo sea una: devolverla
 * a los diez minutos sigue costando, porque eso es lo que se le dijo al cliente.
 *
 * Que NO SE PUEDA RETENER más de lo que el cliente dejó: es dinero que sale del
 * cajón sin respaldo, y es el error de teclado que nadie revisa.
 *
 * Y que «perdida» lleve escrito qué pasó. Un rotomartillo que desapareció sin
 * razón es una discusión que en tres meses nadie puede reconstruir.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const ROTATIVA = 'f1000000-0000-4000-8000-00000000000a';
const RENTA = 'f7000000-0000-4000-8000-000000000001';
const CLIENTE = 'f8000000-0000-4000-8000-000000000001';

const horas = (n: number) => new Date(AHORA.getTime() + n * 3_600_000);

function renta(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RENTA,
    organizacion_id: ORG,
    producto_id: ROTATIVA,
    piezas: 1,
    tarifa_centavos: 40_000n,
    unidad_tarifa: 'dia',
    deposito_centavos: 100_000n,
    estado: 'fuera',
    salio_en: horas(-50),
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      productos: [{ id: ROTATIVA, organizacion_id: ORG, nombre: 'Rotomartillo SDS' }],
      rentas_herramienta: [],
      movimientos_caja: [],
      sesiones_caja: [
        {
          id: SESION_CAJA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          terminal_id: TERMINAL,
          serie: 'A',
          estado: 'abierta',
          fondo_inicial_centavos: 100_000n,
          abierta_en: horas(-8),
        },
      ],
      ...extra,
    },
    {
      predeterminados: {
        rentas_herramienta: {
          sucursal_id: null,
          cliente_id: null,
          nombre_libre: null,
          telefono_libre: null,
          volvio_en: null,
          cobro_centavos: null,
          deposito_devuelto_centavos: null,
          danos: null,
          orden_id: null,
          empleado_id: null,
        },
      },
    },
  );
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-147 · sacar la herramienta', () => {
  it('sale con su compromiso de retorno', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await sacarEnRenta.ejecutar(ctx, {
      productoId: ROTATIVA,
      piezas: 1,
      clienteId: CLIENTE,
      nombreLibre: null,
      telefonoLibre: null,
      tarifaCentavos: 40_000,
      unidadTarifa: 'dia',
      depositoCentavos: 100_000,
      compromisoRetorno: horas(48).toISOString(),
    });

    expect(salida.compromisoRetorno).toBe(horas(48).toISOString());
    expect(base.campo('rentas_herramienta', 'estado')).toBe('fuera');
  });

  it('EL DEPÓSITO ENTRA COMO DEPÓSITO, nunca como venta', async () => {
    // Contarlo como ingreso infla el día de la renta y descuadra el de la
    // devolución, con dos errores iguales y de signo contrario que nadie ve.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await sacarEnRenta.ejecutar(ctx, {
      productoId: ROTATIVA,
      piezas: 1,
      clienteId: CLIENTE,
      nombreLibre: null,
      telefonoLibre: null,
      tarifaCentavos: 40_000,
      unidadTarifa: 'dia',
      depositoCentavos: 100_000,
      compromisoRetorno: horas(48).toISOString(),
    });

    expect(base.campo('movimientos_caja', 'tipo')).toBe('deposito');
    expect(base.campo('movimientos_caja', 'referencia_tipo')).toBe('renta_herramienta');
  });

  it('SIN DEPÓSITO no toca la caja', async () => {
    // Una herramienta que sale sin depósito no mueve dinero, y un movimiento de
    // cero en el corte es una línea que hay que leer y que no dice nada.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await sacarEnRenta.ejecutar(ctx, {
      productoId: ROTATIVA,
      piezas: 1,
      clienteId: CLIENTE,
      nombreLibre: null,
      telefonoLibre: null,
      tarifaCentavos: 40_000,
      unidadTarifa: 'dia',
      depositoCentavos: 0,
      compromisoRetorno: horas(48).toISOString(),
    });

    expect(base.filas('movimientos_caja')).toHaveLength(0);
  });

  it('NO SALE A NOMBRE DE NADIE', async () => {
    // Una rotativa sin nombre no se puede ir a buscar, y ése es todo el valor
    // de este registro.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      sacarEnRenta.ejecutar(ctx, {
        productoId: ROTATIVA,
        piezas: 1,
        clienteId: null,
        nombreLibre: null,
        telefonoLibre: null,
        tarifaCentavos: 40_000,
        unidadTarifa: 'dia',
        depositoCentavos: 0,
        compromisoRetorno: horas(48).toISOString(),
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('rentas_herramienta')).toHaveLength(0);
  });

  it('un nombre a mano basta: no todo el mundo tiene ficha', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await sacarEnRenta.ejecutar(ctx, {
      productoId: ROTATIVA,
      piezas: 1,
      clienteId: null,
      nombreLibre: 'Don Chuy, el de la obra de enfrente',
      telefonoLibre: '5512345678',
      tarifaCentavos: 40_000,
      unidadTarifa: 'dia',
      depositoCentavos: 0,
      compromisoRetorno: horas(24).toISOString(),
    });

    expect(salida.rentaId).toBeDefined();
  });

  it('un compromiso que ya pasó se rechaza', async () => {
    // Mete la pieza en la lista de la mañana siguiente sin que nadie la haya
    // tenido ni un día.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      sacarEnRenta.ejecutar(ctx, {
        productoId: ROTATIVA,
        piezas: 1,
        clienteId: CLIENTE,
        nombreLibre: null,
        telefonoLibre: null,
        tarifaCentavos: 40_000,
        unidadTarifa: 'dia',
        depositoCentavos: 0,
        compromisoRetorno: horas(-1).toISOString(),
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('F-147 · devolverla', () => {
  it('EL COBRO SALE DEL TIEMPO FUERA, no de la pantalla', async () => {
    // 50 horas fuera con tarifa por día: tres días empezados, $1,200.
    const base = baseDe({ rentas_herramienta: [renta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await devolverRenta.ejecutar(ctx, {
      rentaId: RENTA,
      estado: 'devuelta',
      retenerDelDepositoCentavos: 0,
      danos: null,
    });

    expect(salida.unidadesCobradas).toBe(3);
    expect(salida.cobroCentavos).toBe('120000');
  });

  it('LA UNIDAD EMPEZADA SE COBRA ENTERA y el mínimo es una', async () => {
    // Devolverla a los diez minutos sigue costando: es lo que se le dijo.
    const base = baseDe({ rentas_herramienta: [renta({ salio_en: horas(-0.2) })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await devolverRenta.ejecutar(ctx, {
      rentaId: RENTA,
      estado: 'devuelta',
      retenerDelDepositoCentavos: 0,
      danos: null,
    });

    expect(salida.unidadesCobradas).toBe(1);
  });

  it('el cobro se multiplica por las PIEZAS', async () => {
    const base = baseDe({ rentas_herramienta: [renta({ piezas: 3, salio_en: horas(-2) })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await devolverRenta.ejecutar(ctx, {
      rentaId: RENTA,
      estado: 'devuelta',
      retenerDelDepositoCentavos: 0,
      danos: null,
    });

    expect(salida.cobroCentavos).toBe('120000');
  });

  it('NO SE PUEDE RETENER MÁS DE LO QUE DEJÓ', async () => {
    // Es dinero que sale del cajón sin respaldo.
    const base = baseDe({ rentas_herramienta: [renta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      devolverRenta.ejecutar(ctx, {
        rentaId: RENTA,
        estado: 'dañada',
        retenerDelDepositoCentavos: 150_000,
        danos: 'mandril roto',
      }),
    );

    expect(codigo).toBe('DINERO_PORCENTAJE_INVALIDO');
    expect(base.campo('rentas_herramienta', 'estado')).toBe('fuera');
  });

  it('lo retenido se resta del depósito devuelto', async () => {
    const base = baseDe({ rentas_herramienta: [renta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await devolverRenta.ejecutar(ctx, {
      rentaId: RENTA,
      estado: 'dañada',
      retenerDelDepositoCentavos: 30_000,
      danos: 'mandril roto',
    });

    expect(salida.depositoDevueltoCentavos).toBe('70000');
    expect(salida.retenidoCentavos).toBe('30000');
  });

  it('PERDIDA lleva escrito qué pasó', async () => {
    // Sin razón es una discusión que en tres meses nadie reconstruye.
    const base = baseDe({ rentas_herramienta: [renta()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      devolverRenta.ejecutar(ctx, {
        rentaId: RENTA,
        estado: 'perdida',
        retenerDelDepositoCentavos: 100_000,
        danos: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('una devuelta no se devuelve dos veces', async () => {
    const base = baseDe({
      rentas_herramienta: [
        renta({ estado: 'devuelta', volvio_en: horas(-1), cobro_centavos: 40_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      devolverRenta.ejecutar(ctx, {
        rentaId: RENTA,
        estado: 'devuelta',
        retenerDelDepositoCentavos: 0,
        danos: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('la tarifa por SEMANA cuenta semanas, no días', async () => {
    const base = baseDe({
      rentas_herramienta: [renta({ unidad_tarifa: 'semana', salio_en: horas(-200) })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await devolverRenta.ejecutar(ctx, {
      rentaId: RENTA,
      estado: 'devuelta',
      retenerDelDepositoCentavos: 0,
      danos: null,
    });

    // 200 horas son una semana y media: dos semanas empezadas.
    expect(salida.unidadesCobradas).toBe(2);
  });
});
