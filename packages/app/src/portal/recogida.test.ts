import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { hashearDispositivo } from '../identidad/dispositivo.ts';
import { crearBaseFalsa, type TablasFalsas } from '../restaurante/pruebas/base-falsa.ts';
import { ORG, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { tableroDeRecogida } from './recogida.ts';

/**
 * F-329 · El monitor de recogida.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el APELLIDO NO SALGA de la base. Se captura «Ana Sofía Bermúdez» porque la
 * cajera escribe lo que le dicen, y en un monitor del salón eso es un apellido
 * publicado. Se recorta en el servidor: lo que no viaja no se puede filtrar, ni
 * por un error de la vista ni por alguien mirando la respuesta.
 *
 * Que el contrato sea la lista más corta posible: nombre y estado. Es la
 * superficie más expuesta del sistema —cualquiera que pase por el salón la ve— y
 * cada campo de más es un dato que el negocio publicó sin saberlo.
 *
 * Y que un token caducado no sirva. Un monitor que alguien se lleva seguiría
 * sirviendo nombres para siempre.
 */

const PIMIENTA = 'pimienta-de-prueba';
const TOKEN = 'tok_monitor_salon';
const OTRA_SUCURSAL = 'd1000000-0000-4000-8000-000000000001';

function terminal(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TERMINAL,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    device_token_hash: hashearDispositivo(TOKEN, PIMIENTA),
    activa: true,
    codigo_expira_en: null,
    ...cambios,
  };
}

function comanda(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cm1',
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    orden_id: 'o1',
    estado: 'listo',
    nombre_pedido: 'Ana Sofía Bermúdez',
    created_at: new Date('2026-09-16T09:00:00.000Z'),
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    terminales: [terminal()],
    comandas: [comanda()],
    ordenes: [],
    ...extra,
  });
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-329 · el monitor de recogida', () => {
  it('EL APELLIDO NO SALE DE LA BASE', async () => {
    // Recortarlo en el servidor es lo que garantiza que no viaje.
    const base = baseDe();

    const tablero = await tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA);

    expect(tablero.listos).toEqual([{ nombre: 'Ana', estado: 'listo' }]);
  });

  it('el contrato es NOMBRE Y ESTADO, nada más', async () => {
    // Cualquiera que pase por el salón ve esta respuesta.
    const base = baseDe();

    const tablero = await tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA);

    expect(Object.keys(tablero.listos[0] ?? {}).sort()).toEqual(['estado', 'nombre']);
  });

  it('separa lo LISTO de lo que se está preparando', async () => {
    const base = baseDe({
      comandas: [
        comanda({ id: 'cm1', estado: 'listo', nombre_pedido: 'Ana' }),
        comanda({ id: 'cm2', estado: 'en_preparacion', nombre_pedido: 'Beto' }),
      ],
    });

    const tablero = await tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA);

    expect(tablero.listos.map((p) => p.nombre)).toEqual(['Ana']);
    expect(tablero.preparando.map((p) => p.nombre)).toEqual(['Beto']);
  });

  it('lo YA ENTREGADO no sigue en la pantalla', async () => {
    const base = baseDe({
      comandas: [comanda({ estado: 'entregado', nombre_pedido: 'Ana' })],
    });

    const tablero = await tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA);

    expect(tablero.listos).toEqual([]);
    expect(tablero.preparando).toEqual([]);
  });

  it('SIN NOMBRE no hay nada que enseñar', async () => {
    // «Pedido 4821» no le dice nada a nadie: el cliente se acuerda de su nombre.
    const base = baseDe({ comandas: [comanda({ nombre_pedido: null })] });

    const tablero = await tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA);

    expect(tablero.listos).toEqual([]);
  });

  it('sólo los de SU sucursal', async () => {
    const base = baseDe({
      comandas: [
        comanda({ id: 'cm1', nombre_pedido: 'Ana' }),
        comanda({ id: 'cm2', sucursal_id: OTRA_SUCURSAL, nombre_pedido: 'Beto' }),
      ],
    });

    const tablero = await tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA);

    expect(tablero.listos.map((p) => p.nombre)).toEqual(['Ana']);
  });

  it('UN TOKEN CADUCADO no sirve', async () => {
    // Un monitor que alguien se lleva seguiría sirviendo nombres para siempre.
    const base = baseDe({
      terminales: [terminal({ codigo_expira_en: new Date('2020-01-01T00:00:00.000Z') })],
    });

    expect(await codigoDe(() => tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA))).toBe(
      'PUENTE_SIN_PERMISO',
    );
  });

  it('una terminal DE BAJA no sirve', async () => {
    const base = baseDe({ terminales: [terminal({ activa: false })] });

    expect(await codigoDe(() => tableroDeRecogida(base.tx, ORG, TOKEN, PIMIENTA))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });

  it('un token que no existe no dice por qué', async () => {
    const base = baseDe();

    expect(await codigoDe(() => tableroDeRecogida(base.tx, ORG, 'otro_token', PIMIENTA))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});
