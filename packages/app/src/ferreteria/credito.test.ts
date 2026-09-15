import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { evaluarSalida, registrarRemision } from './credito.ts';

/**
 * F-638, F-639 y F-606 · El material que sale firmado.
 *
 * Las tres puertas del crédito. La regla que las gobierna: **aviso, no muro**,
 * salvo la mora, que siempre tiene llave del dueño. Un sistema que le impida a
 * Beto surtirle a su mejor cliente en una emergencia se apaga esa misma tarde.
 */

const CLIENTE = 'c1111111-1111-4111-8111-111111111111';
const ORDEN = 'o1111111-1111-4111-8111-111111111111';
const OBRA = 'b1111111-1111-4111-8111-111111111111';
const OTRA_OBRA = 'b2222222-2222-4222-8222-222222222222';
const CHAVA = 'z1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T14:40:00.000Z');

function ferreteria(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    clientes: [
      {
        id: CLIENTE,
        organizacion_id: ORG,
        nombre: 'Ing. Loera',
        saldo_pendiente_centavos: 0n,
        limite_credito_centavos: 5_000_000n,
        bloqueado_por_mora: false,
      },
    ],
    obras: [
      {
        id: OBRA,
        organizacion_id: ORG,
        cliente_id: CLIENTE,
        nombre: 'Las Torres',
        estado: 'activa',
        limite_centavos: null,
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
        tope_por_salida_centavos: null,
      },
    ],
    ordenes: [{ id: ORDEN, organizacion_id: ORG, estado: 'cobrada' }],
    remisiones: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(ferreteria(extra), {
    // `tomarFolio` usa SQL crudo: es la única consulta cruda de este comando.
    filasCrudas: [{ siguiente: 114n }],
    predeterminados: {
      remisiones: {
        obra_id: null,
        autorizado_id: null,
        firma_url: null,
        entregada_por: null,
      },
      ordenes: { obra_id: null, autorizado_id: null, mostradorista_id: null },
    },
  });

const remision = (extra: Record<string, unknown> = {}) => ({
  ordenId: ORDEN,
  clienteId: CLIENTE,
  importeCentavos: 600_000,
  nombreFirmante: 'Salvador',
  autorizadoId: CHAVA,
  autorizacionDelDueno: false,
  ...extra,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('credito.evaluar_salida', () => {
  it('SE MIRA ANTES DE DESPACHAR, no en el cobro', async () => {
    // En una venta a crédito NO HAY COBRO: una comprobación colgada del cobro
    // es una comprobación que en este giro no corre nunca.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await evaluarSalida.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 600_000,
      autorizadoId: CHAVA,
    });

    expect(salida.veredicto).toBe('libre');
    expect(salida.disponibleDespuesCentavos).toBe('4400000');
  });

  it('EL QUE NO ESTÁ EN LA LISTA AVISA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await evaluarSalida.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 600_000,
    });

    expect(salida.veredicto).toBe('aviso');
    expect(salida.motivos).toEqual(['no_autorizado']);
  });

  it('EL AUTORIZADO DE OTRA OBRA no vale para ésta', async () => {
    // El albañil de Las Torres no puede retirar para la casa del centro. Sin
    // esto, la lista de autorizados pierde justo la parte que la hace útil.
    const base = baseDe({
      obras: [
        {
          id: OBRA,
          organizacion_id: ORG,
          cliente_id: CLIENTE,
          nombre: 'Las Torres',
          estado: 'activa',
          limite_centavos: null,
        },
        {
          id: OTRA_OBRA,
          organizacion_id: ORG,
          cliente_id: CLIENTE,
          nombre: 'Casa del centro',
          estado: 'activa',
          limite_centavos: null,
        },
      ],
      autorizados_cuenta: [
        {
          id: CHAVA,
          organizacion_id: ORG,
          cliente_id: CLIENTE,
          obra_id: OTRA_OBRA,
          nombre: 'Salvador',
          activo: true,
          tope_por_salida_centavos: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await evaluarSalida.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 600_000,
      obraId: OBRA,
      autorizadoId: CHAVA,
    });

    expect(salida.motivos).toEqual(['no_autorizado']);
  });

  it('UNA OBRA DE OTRO CLIENTE NO ES UN AVISO: es un tecleo', async () => {
    // Cargarla ahí metería el material en la cuenta equivocada, y eso no se
    // arregla con una llamada.
    const base = baseDe({
      obras: [
        {
          id: OBRA,
          organizacion_id: ORG,
          cliente_id: 'otro-cliente',
          nombre: 'Las Torres',
          estado: 'activa',
          limite_centavos: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        evaluarSalida.ejecutar(ctx, {
          clienteId: CLIENTE,
          importeCentavos: 600_000,
          obraId: OBRA,
          autorizadoId: CHAVA,
        }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('EL SALDO DE LA OBRA SE DERIVA DE SUS REMISIONES', async () => {
    const base = baseDe({
      obras: [
        {
          id: OBRA,
          organizacion_id: ORG,
          cliente_id: CLIENTE,
          nombre: 'Las Torres',
          estado: 'activa',
          limite_centavos: 2_000_000n,
        },
      ],
      remisiones: [
        {
          id: 'r1',
          organizacion_id: ORG,
          obra_id: OBRA,
          cliente_id: CLIENTE,
          saldo_documento_centavos: 1_800_000n,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await evaluarSalida.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 600_000,
      obraId: OBRA,
      autorizadoId: CHAVA,
    });

    expect(salida.motivos).toEqual(['excede_limite_de_la_obra']);
  });
});

describe('credito.registrar_remision', () => {
  it('EL SALDO SUBE CON LA ENTREGA, no con la factura', async () => {
    // Facturar no vuelve a ser venta: la venta ya se reconoció aquí. Es el
    // error contable más común del giro.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRemision.ejecutar(ctx, remision());

    expect(salida.saldoClienteCentavos).toBe('600000');
    expect(base.campo('clientes', 'saldo_pendiente_centavos')).toBe(600_000n);
    expect(base.campo('remisiones', 'saldo_documento_centavos')).toBe(600_000n);
  });

  it('SE SELLA SI ESTABA EN LA LISTA, no se deriva después', async () => {
    // El autorizado puede darse de baja entre la entrega y el pleito, y
    // entonces la derivación diría que no estaba cuando sí estaba.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRemision.ejecutar(ctx, remision());

    expect(salida.autorizadoEstabaEnLista).toBe(true);
    expect(base.campo('remisiones', 'autorizado_estaba_en_lista')).toBe(true);
  });

  it('EL QUE NO ESTABA EN LA LISTA SE LLEVA EL MATERIAL, y queda escrito', async () => {
    // A veces el nuevo sí viene de parte del inge. Lo que hace falta es que
    // quede el nombre y que el sistema lo haya dicho antes, no un muro.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRemision.ejecutar(
      ctx,
      remision({ autorizadoId: undefined, nombreFirmante: 'Un muchacho' }),
    );

    expect(salida.motivos).toEqual(['no_autorizado']);
    expect(salida.autorizadoEstabaEnLista).toBe(false);
    // Y queda ESCRITO en el documento, que es lo que se mira cuando se impugna.
    expect(base.campo('remisiones', 'autorizado_estaba_en_lista')).toBe(false);
    expect(base.campo('remisiones', 'nombre_firmante')).toBe('Un muchacho');
    expect(base.filas('remisiones')).toHaveLength(1);
  });

  it('LA MORA SÍ ES MURO, y la llave es del dueño', async () => {
    const base = baseDe({
      clientes: [
        {
          id: CLIENTE,
          organizacion_id: ORG,
          nombre: 'Ing. Loera',
          saldo_pendiente_centavos: 0n,
          limite_credito_centavos: 5_000_000n,
          bloqueado_por_mora: true,
        },
      ],
    });
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarRemision.ejecutar(uno.ctx, remision()))).toBe(
      'PUENTE_SIN_PERMISO',
    );
    expect(base.filas('remisiones')).toEqual([]);

    // Con la llave del dueño, sale.
    const dos = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);
    const salida = await registrarRemision.ejecutar(
      dos.ctx,
      remision({ autorizacionDelDueno: true }),
    );

    expect(salida.veredicto).toBe('requiere_llave');
    expect(base.filas('remisiones')).toHaveLength(1);
  });

  it('EL LÍMITE REBASADO AVISA Y DEJA PASAR', async () => {
    // Rebasar por $300 en una compra de $6,000 es un juicio de mostrador, no
    // una condición que el dueño decidió en frío.
    const base = baseDe({
      clientes: [
        {
          id: CLIENTE,
          organizacion_id: ORG,
          nombre: 'Ing. Loera',
          saldo_pendiente_centavos: 4_800_000n,
          limite_credito_centavos: 5_000_000n,
          bloqueado_por_mora: false,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRemision.ejecutar(ctx, remision());

    expect(salida.motivos).toEqual(['excede_limite_del_cliente']);
    expect(base.filas('remisiones')).toHaveLength(1);
  });

  it('UNA ORDEN, UNA REMISIÓN', async () => {
    // Dos remisiones de la misma entrega suman dos veces al saldo del cliente,
    // y ése es el descuadre que se descubre cuando el contratista reclama.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await registrarRemision.ejecutar(uno.ctx, remision());

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(await codigoDe(() => registrarRemision.ejecutar(dos.ctx, remision()))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
    expect(base.campo('clientes', 'saldo_pendiente_centavos')).toBe(600_000n);
  });

  it('LA REMISIÓN LLEVA SU PROPIA SERIE de folio', async () => {
    // Dos documentos distintos en la misma serie hacen que el folio 480 sea a
    // veces una venta y a veces una entrega, y la cobranza no lo puede citar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRemision.ejecutar(ctx, remision());

    expect(salida.folio).toBe('REM-114');
  });

  it('LA ORDEN QUEDA MARCADA con obra, autorizado y quién despachó', async () => {
    // En una venta a crédito no hay cobro, así que sin `mostradorista_id` no
    // queda registro de quién atendió.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarRemision.ejecutar(ctx, remision({ obraId: OBRA }));

    expect(base.campo('ordenes', 'obra_id')).toBe(OBRA);
    expect(base.campo('ordenes', 'autorizado_id')).toBe(CHAVA);
    expect(base.campo('ordenes', 'mostradorista_id')).not.toBeNull();
  });

  it('un cliente de otro negocio', async () => {
    const base = baseDe({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarRemision.ejecutar(ctx, remision()))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});
