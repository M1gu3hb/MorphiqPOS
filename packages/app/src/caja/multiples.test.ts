import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { PULSO_CAJON, abrirCajon, cajasAbiertas } from './multiples.ts';

/**
 * F-235 · Varias cajas a la vez · F-984 · El cajón de dinero.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que un cajero NO pueda operar el cajón de otra terminal. Un movimiento
 * registrado en el cajón ajeno es un descuadre DOBLE: sobra en uno y falta en
 * el otro, y los dos son reales. No es una regla de permisos —el cajero sí hace
 * movimientos— es de ámbito.
 *
 * Y que abrir el cajón SIN venta quede registrado con motivo y autor. Es la
 * única apertura que puede esconder un faltante: la del cobro la dispara el
 * cobro y tiene su ticket detrás.
 */

const AHORA = new Date('2026-09-16T22:00:00.000Z');
const OTRA_TERMINAL = 'f0000000-0000-4000-8000-0000000000ff';
const OTRA_SESION = '5e000000-0000-4000-8000-0000000000ff';

function sesion(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SESION_CAJA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    empleado_abre_id: 'e0000000-0000-4000-8000-000000000001',
    estado: 'abierta',
    abierta_en: new Date('2026-09-16T14:00:00.000Z'),
    fondo_inicial_centavos: 50_000n,
    ...cambios,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(
    { sesiones_caja: [sesion()], movimientos_caja: [], ...extra },
    {
      predeterminados: {
        movimientos_caja: { referencia_id: null, sesion_caja_id: null, motivo: null },
      },
    },
  );

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-235 · varias cajas abiertas a la vez', () => {
  it('sin pedirlas todas, sólo sale LA MÍA', async () => {
    const base = baseDe({
      sesiones_caja: [sesion(), sesion({ id: OTRA_SESION, terminal_id: OTRA_TERMINAL })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cajasAbiertas.ejecutar(ctx, { todas: false });

    expect(salida.abiertas).toHaveLength(1);
    expect(salida.abiertas[0]?.esLaMia).toBe(true);
  });

  it('la gerencia SÍ ve las de todos', async () => {
    const base = baseDe({
      sesiones_caja: [sesion(), sesion({ id: OTRA_SESION, terminal_id: OTRA_TERMINAL })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await cajasAbiertas.ejecutar(ctx, { todas: true });

    expect(salida.abiertas).toHaveLength(2);
    // Y se distingue cuál es la suya: es lo que evita cerrar la del compañero.
    expect(salida.abiertas.filter((c) => c.esLaMia)).toHaveLength(1);
  });

  it('un CAJERO no puede ver las de los demás', async () => {
    // Su corte enseña lo suyo; lo de los otros no es asunto de la barra.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => cajasAbiertas.ejecutar(ctx, { todas: true }));

    expect(codigo).toBe('PUENTE_SIN_PERMISO');
  });

  it('cuenta las que llevan más de un turno abiertas', async () => {
    // Es la cifra de las diez de la noche: «¿quién no ha cerrado?».
    const base = baseDe({
      sesiones_caja: [
        sesion({ abierta_en: new Date('2026-09-15T08:00:00.000Z') }),
        sesion({ id: OTRA_SESION, terminal_id: TERMINAL, abierta_en: AHORA }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await cajasAbiertas.ejecutar(ctx, { todas: false });

    expect(salida.sinCerrarDesdeAyer).toBe(1);
  });

  it('una caja cerrada no aparece', async () => {
    const base = baseDe({ sesiones_caja: [sesion({ estado: 'cerrada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect((await cajasAbiertas.ejecutar(ctx, { todas: false })).abiertas).toEqual([]);
  });
});

describe('F-984 · el cajón que se abre SIN venta', () => {
  it('queda registrado con su motivo, en el mismo sitio que todo lo del turno', async () => {
    // Un registro aparte sería un segundo lugar donde mirar cuando el arqueo no
    // cuadra, y nadie mira dos sitios a las diez de la noche.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirCajon.ejecutar(ctx, {
      sesionCajaId: SESION_CAJA,
      motivo: 'dar_cambio',
      nota: 'billete de 500',
    });

    expect(salida.pulso).toEqual(PULSO_CAJON);
    const movimiento = base.filas('movimientos_caja')[0];
    // Cero pesos: no mueve dinero, y aun así deja rastro.
    expect(movimiento?.['monto_centavos']).toBe(0n);
    expect(movimiento?.['motivo']).toContain('dar_cambio');
    expect(movimiento?.['motivo']).toContain('billete de 500');
  });

  it('EL CAJÓN DE OTRA TERMINAL NO SE ABRE', async () => {
    const base = baseDe({
      sesiones_caja: [sesion({ id: OTRA_SESION, terminal_id: OTRA_TERMINAL })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      abrirCajon.ejecutar(ctx, { sesionCajaId: OTRA_SESION, motivo: 'conteo' }),
    );

    expect(codigo).toBe('PUENTE_SIN_PERMISO');
    expect(base.filas('movimientos_caja')).toEqual([]);
  });

  it('el de una caja CERRADA tampoco', async () => {
    // Sería sacar dinero de un arqueo ya firmado. Si hace falta, se reabre la
    // caja, y eso deja rastro.
    const base = baseDe({ sesiones_caja: [sesion({ estado: 'cerrada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      abrirCajon.ejecutar(ctx, { sesionCajaId: SESION_CAJA, motivo: 'conteo' }),
    );

    expect(codigo).toBe('CAJA_CERRADA');
  });

  it('una caja que no existe no se inventa', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      abrirCajon.ejecutar(ctx, { sesionCajaId: SESION_CAJA, motivo: 'conteo' }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('el pulso es el estándar de Epson, con sus dos tiempos', () => {
    // `ESC p 0 25 250`: conector 2, 25 ms de subida y 250 de bajada. Con menos,
    // un cajón duro no alcanza a saltar y el cajero lo abre con la llave.
    expect(PULSO_CAJON).toEqual([27, 112, 0, 25, 250]);
  });
});
