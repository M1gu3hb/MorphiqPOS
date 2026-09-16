import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  COMANDA,
  CUENTA,
  ORG,
  PREDETERMINADOS,
  SUCURSAL,
} from '../restaurante/pruebas/sala.ts';
import { deshacerEntrega, entregarPedidoDeBarra, llamarPedido, marcarNoRecogido } from './barra.ts';

/**
 * F-328 y F-329 · La fila de despacho de mostrador.
 *
 * Se cobra y el vaso desaparece del sistema: quince personas esperando algo que
 * el punto de venta no sabe que existe. Lo que estas pruebas vigilan es lo que
 * convierte «le grité» en un dato, y las dos decisiones que no se pueden
 * negociar: que no se abandone una bebida pagada sin tres llamados, y que el
 * «deshacer» lo limite el SERVIDOR y no la pantalla.
 */

const COBRADO = new Date('2026-09-15T08:30:00.000Z');
const AHORA = new Date('2026-09-15T08:34:00.000Z');

function pedido(cambios: Fila = {}): Fila {
  return {
    id: COMANDA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    orden_id: CUENTA,
    mesa_id: null,
    estacion_preparacion_id: null,
    estacion_nombre: 'Barra',
    estado: 'nuevo',
    llamados: 0,
    cobrado_en: COBRADO,
    created_at: COBRADO,
    lista_en: null,
    entregada_en: null,
    notas: null,
    ...cambios,
  };
}

function barra(cambios: Fila = {}, orden: Fila = {}): TablasFalsas {
  return {
    comandas: [pedido(cambios)],
    ordenes: [
      {
        id: CUENTA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        nombre_pedido: 'Ana',
        canal: 'llevar',
        ...orden,
      },
    ],
    llamados_pedido: [],
  };
}

const baseDe = (cambios: Fila = {}, orden: Fila = {}) =>
  crearBaseFalsa(barra(cambios, orden), { predeterminados: PREDETERMINADOS });

const ESE = { pedidoId: COMANDA };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-329 · llamar por nombre', () => {
  it('anota el llamado con su medio y su número', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await llamarPedido.ejecutar(ctx, { pedidoId: COMANDA, medio: 'voz' });

    expect(salida.numeroLlamado).toBe(1);
    const llamado = base.filas('llamados_pedido')[0];
    expect(llamado?.['medio']).toBe('voz');
    expect(llamado?.['numero_llamado']).toBe(1);
    expect(llamado?.['ocurrido_en']).toEqual(AHORA);
  });

  it('EL PRIMER LLAMADO SELLA «listo»: si grita el nombre, la bebida está hecha', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await llamarPedido.ejecutar(ctx, { pedidoId: COMANDA, medio: 'voz' });

    // Sin este sello, el tiempo de preparación de ese pedido sería un hueco en
    // la medición: la barra grita y nadie toca «listo».
    expect(base.campo('comandas', 'lista_en')).toEqual(AHORA);
  });

  it('el segundo llamado es el segundo, y el tercero autoriza abandonarlo', async () => {
    const base = baseDe();

    for (let n = 1; n <= 3; n += 1) {
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
      const salida = await llamarPedido.ejecutar(ctx, { pedidoId: COMANDA, medio: 'pantalla' });
      expect(salida.numeroLlamado).toBe(n);
      expect(salida.puedeDarsePorNoRecogido).toBe(n >= 3);
    }

    expect(base.filas('llamados_pedido')).toHaveLength(3);
    expect(base.campo('comandas', 'llamados')).toBe(3);
  });

  it('un pedido YA ENTREGADO no se llama: no hay a quién', async () => {
    const base = baseDe({ estado: 'entregado', entregada_en: AHORA });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => llamarPedido.ejecutar(ctx, { pedidoId: COMANDA, medio: 'voz' })),
    ).toBe('TRANSICION_INVALIDA');
    expect(base.filas('llamados_pedido')).toEqual([]);
  });

  it('un pedido de otro negocio se ve como inexistente', async () => {
    const base = baseDe({ organizacion_id: '00000000-0000-4000-8000-000000000000' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => llamarPedido.ejecutar(ctx, { pedidoId: COMANDA, medio: 'voz' })),
    ).toBe('COMANDA_NO_ENCONTRADA');
  });

  it('un medio inventado no entra', () => {
    expect(llamarPedido.entrada.safeParse({ pedidoId: COMANDA, medio: 'telepatia' }).success).toBe(
      false,
    );
  });
});

describe('F-328 · entregar y abandonar', () => {
  it('entregar sella la hora y devuelve cuánto esperó', async () => {
    const base = baseDe({ estado: 'listo', lista_en: COBRADO });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await entregarPedidoDeBarra.ejecutar(ctx, ESE);

    expect(salida.estado).toBe('entregado');
    // Cobrado a las 8:30, entregado a las 8:34.
    expect(salida.segundosDeEspera).toBe(240);
    expect(base.campo('comandas', 'entregada_en')).toEqual(AHORA);
  });

  it('LA ESPERA SE MIDE DESDE EL COBRO, no desde que se encoló', async () => {
    // El cliente empieza a esperar cuando paga. Medir desde `created_at` de la
    // comanda diría que esperó menos de lo que esperó.
    const base = baseDe({
      estado: 'listo',
      cobrado_en: COBRADO,
      created_at: new Date('2026-09-15T08:33:00.000Z'),
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await entregarPedidoDeBarra.ejecutar(ctx, ESE);

    expect(salida.segundosDeEspera).toBe(240);
  });

  it('NO SE ABANDONA UNA BEBIDA PAGADA SIN TRES LLAMADOS', async () => {
    // Es la diferencia entre «el cliente se fue» y «el barista se hartó».
    const base = baseDe({ estado: 'listo', llamados: 2 });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => marcarNoRecogido.ejecutar(ctx, ESE))).toBe('TRANSICION_INVALIDA');
    expect(base.campo('comandas', 'estado')).toBe('listo');
  });

  it('con tres llamados sí se abandona', async () => {
    const base = baseDe({ estado: 'listo', llamados: 3 });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await marcarNoRecogido.ejecutar(ctx, ESE);

    expect(salida.estado).toBe('no_recogido');
    expect(base.campo('comandas', 'estado')).toBe('no_recogido');
  });

  it('un pedido ya entregado no se entrega dos veces', async () => {
    const base = baseDe({ estado: 'entregado', entregada_en: AHORA });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => entregarPedidoDeBarra.ejecutar(ctx, ESE))).toBe(
      'TRANSICION_INVALIDA',
    );
  });
});

describe('F-328 · deshacer una entrega', () => {
  it('dentro del primer minuto vuelve a la fila', async () => {
    const entregado = new Date(AHORA.getTime() - 30_000);
    const base = baseDe({ estado: 'entregado', entregada_en: entregado });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await deshacerEntrega.ejecutar(ctx, ESE);

    expect(salida.estado).toBe('listo');
    expect(base.campo('comandas', 'estado')).toBe('listo');
    expect(base.campo('comandas', 'entregada_en')).toBeNull();
  });

  it('EL LÍMITE LO PONE EL SERVIDOR, no el botón escondido', async () => {
    // La pantalla de barra vive abierta horas y su reloj se desincroniza. Un
    // «deshacer» que sólo se oculte en la interfaz es la puerta por la que un
    // pedido entregado vuelve a la fila al día siguiente.
    const entregado = new Date(AHORA.getTime() - 120_000);
    const base = baseDe({ estado: 'entregado', entregada_en: entregado });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => deshacerEntrega.ejecutar(ctx, ESE))).toBe('TRANSICION_INVALIDA');
    expect(base.campo('comandas', 'estado')).toBe('entregado');
  });

  it('un pedido que nunca se entregó no tiene nada que deshacer', async () => {
    const base = baseDe({ estado: 'listo' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => deshacerEntrega.ejecutar(ctx, ESE))).toBe('TRANSICION_INVALIDA');
  });
});

describe('F-328 · quién atiende la barra', () => {
  it('el barista NO es un rol del sistema: son cajero y cocina', () => {
    // Un barista cobra y prepara. Los dos papeles existen; «barista» no.
    for (const comando of [llamarPedido, entregarPedidoDeBarra, marcarNoRecogido]) {
      expect(comando.roles).toContain('cajero');
      expect(comando.roles).toContain('cocina');
      expect(comando.roles).not.toContain('mesero');
    }
  });

  it('los comandos de barra viven en el paquete que hoy tiene el giro', () => {
    // `cafeteria` como paquete no existe hasta la 066. Declararlo ahora dejaría
    // estos comandos apagados para el cliente que los necesita.
    expect(llamarPedido.paquetes).toContain('cafeteria');
  });
});
