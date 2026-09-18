import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { altaAutorizado, bajaAutorizado, cerrarObra, crearObra } from './obras.ts';

/**
 * F-639 y F-638 · La obra y quién puede retirar a su nombre.
 *
 * Ninguna de las dos se borra: la obra se cierra y el autorizado se da de baja.
 * Las remisiones que cuelgan de ellas tienen que poder consultarse años después,
 * y borrarlas rompería la trazabilidad justo del caso que importa — la cuenta
 * impugnada.
 */

const CLIENTE = 'c1111111-1111-4111-8111-111111111111';
const OBRA = 'b1111111-1111-4111-8111-111111111111';
const CHAVA = 'z1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T15:00:00.000Z');
const ANTES = new Date('2026-01-01T00:00:00.000Z');

function ferreteria(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    clientes: [{ id: CLIENTE, organizacion_id: ORG, nombre: 'Ing. Loera' }],
    obras: [
      {
        id: OBRA,
        organizacion_id: ORG,
        cliente_id: CLIENTE,
        nombre: 'Las Torres',
        estado: 'activa',
        cerrada_en: null,
      },
    ],
    autorizados_cuenta: [
      {
        id: CHAVA,
        organizacion_id: ORG,
        cliente_id: CLIENTE,
        obra_id: null,
        nombre: 'Salvador',
        activo: true,
        dado_de_baja_en: null,
      },
    ],
    remisiones: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(ferreteria(extra), {
    predeterminados: {
      obras: { direccion: null, limite_centavos: null, cerrada_en: null },
      autorizados_cuenta: {
        obra_id: null,
        telefono: null,
        identificacion: null,
        foto_url: null,
        tope_por_salida_centavos: null,
        dado_de_baja_en: null,
        alta_por: null,
      },
    },
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('credito.crear_obra', () => {
  it('LA OBRA NACE ACTIVA, colgada de su cliente', async () => {
    const base = baseDe({ obras: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await crearObra.ejecutar(ctx, { clienteId: CLIENTE, nombre: 'Casa del centro' });

    expect(salida.estado).toBe('activa');
    expect(base.campo('obras', 'cliente_id')).toBe(CLIENTE);
  });

  it('un cliente de otro negocio no tiene obras', async () => {
    const base = baseDe({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => crearObra.ejecutar(ctx, { clienteId: CLIENTE, nombre: 'X' }))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});

describe('credito.cerrar_obra', () => {
  it('SE CIERRA CON SU FECHA, en la misma escritura', async () => {
    // La 112 exige que vayan juntas: una obra cerrada sin fecha es una obra que
    // ninguna consulta de histórico puede situar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await cerrarObra.ejecutar(ctx, { obraId: OBRA });

    expect(base.campo('obras', 'estado')).toBe('cerrada');
    expect(base.campo('obras', 'cerrada_en')).toEqual(AHORA);
  });

  it('UNA OBRA QUE TODAVÍA DEBE NO SE CIERRA', async () => {
    // Cerrarla la sacaría de la lista de cobranza con dinero dentro, que es la
    // forma más limpia de perder $18,400 sin que nadie lo note hasta el cierre.
    const base = baseDe({
      remisiones: [
        {
          id: 'r1',
          organizacion_id: ORG,
          obra_id: OBRA,
          cliente_id: CLIENTE,
          saldo_documento_centavos: 1_840_000n,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(await codigoDe(() => cerrarObra.ejecutar(ctx, { obraId: OBRA }))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
    expect(base.campo('obras', 'estado')).toBe('activa');
  });

  it('LA OBRA SALDADA SÍ SE CIERRA', async () => {
    const base = baseDe({
      remisiones: [
        {
          id: 'r1',
          organizacion_id: ORG,
          obra_id: OBRA,
          cliente_id: CLIENTE,
          saldo_documento_centavos: 0n,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect((await cerrarObra.ejecutar(ctx, { obraId: OBRA })).estado).toBe('cerrada');
  });

  it('cerrar dos veces no vuelve a mover la fecha', async () => {
    const base = baseDe({
      obras: [
        {
          id: OBRA,
          organizacion_id: ORG,
          cliente_id: CLIENTE,
          nombre: 'Las Torres',
          estado: 'cerrada',
          cerrada_en: ANTES,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(await codigoDe(() => cerrarObra.ejecutar(ctx, { obraId: OBRA }))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
    expect(base.campo('obras', 'cerrada_en')).toEqual(ANTES);
  });
});

describe('credito.alta_autorizado y baja', () => {
  it('QUEDA ESCRITO QUIÉN LO AUTORIZÓ', async () => {
    // Sin esto, la lista es una lista sin responsable y la impugnación se gana
    // sola.
    const base = baseDe({ autorizados_cuenta: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await altaAutorizado.ejecutar(ctx, {
      clienteId: CLIENTE,
      nombre: 'Un muchacho',
      identificacion: 'INE 1234',
    });

    expect(base.campo('autorizados_cuenta', 'alta_por')).not.toBeNull();
    expect(base.campo('autorizados_cuenta', 'identificacion')).toBe('INE 1234');
  });

  it('UNA OBRA DE OTRO CLIENTE no autoriza a nadie', async () => {
    const base = baseDe({
      autorizados_cuenta: [],
      obras: [
        {
          id: OBRA,
          organizacion_id: ORG,
          cliente_id: 'otro',
          nombre: 'Las Torres',
          estado: 'activa',
          cerrada_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(
      await codigoDe(() =>
        altaAutorizado.ejecutar(ctx, { clienteId: CLIENTE, obraId: OBRA, nombre: 'X' }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('SE DA DE BAJA, NUNCA SE BORRA', async () => {
    // Las remisiones que firmó siguen siendo válidas y auditables.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await bajaAutorizado.ejecutar(ctx, { autorizadoId: CHAVA });

    expect(base.filas('autorizados_cuenta')).toHaveLength(1);
    expect(base.campo('autorizados_cuenta', 'activo')).toBe(false);
    expect(base.campo('autorizados_cuenta', 'dado_de_baja_en')).toEqual(AHORA);
  });

  it('dar de baja dos veces no mueve la fecha', async () => {
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);
    await bajaAutorizado.ejecutar(uno.ctx, { autorizadoId: CHAVA });

    const dos = contextoFalso(base.tx, ambitoDe('dueno'), new Date('2026-10-01T00:00:00.000Z'));
    expect(await codigoDe(() => bajaAutorizado.ejecutar(dos.ctx, { autorizadoId: CHAVA }))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
    expect(base.campo('autorizados_cuenta', 'dado_de_baja_en')).toEqual(AHORA);
  });
});
