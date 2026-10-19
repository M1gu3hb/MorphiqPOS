import { afterEach, describe, expect, it, vi } from 'vitest';

import { cajaDeEstaTerminal } from './caja-de-la-terminal.ts';

/**
 * Con DOS cajas abiertas, cada terminal ve la suya (bloque D de la 2.4). El día completo de
 * la cafetería lo encontró: Diana abría «Cierre de turno» y le salía el turno de Fernanda,
 * porque la pantalla se quedaba con la primera caja abierta del negocio.
 */

const DE_DIANA = '11111111-1111-4111-8111-111111111111';
const DE_FERNANDA = '22222222-2222-4222-8222-222222222222';

interface Pedido {
  readonly ruta: string;
  readonly cuerpo: unknown;
}

function servidor(estado: { abierta: boolean; sesionCajaId: string | null }): Pedido[] {
  const pedidos: Pedido[] = [];
  // El puente, si no se le filtra, contesta como contestaba: la caja de Fernanda primero.
  const todas = [
    { id: DE_FERNANDA, estado: 'abierto', usuario_apertura_nombre: 'Fernanda' },
    { id: DE_DIANA, estado: 'abierto', usuario_apertura_nombre: 'Diana' },
  ];
  vi.stubGlobal('fetch', (ruta: string, init: { body: string }) => {
    const cuerpo: unknown = JSON.parse(init.body);
    pedidos.push({ ruta, cuerpo });
    if (ruta === '/api/caja/estado')
      return Promise.resolve(Response.json({ ok: true, datos: estado }));
    const filtro = (cuerpo as { filtro?: { id?: string } }).filtro;
    const filas = filtro?.id === undefined ? todas : todas.filter((c) => c.id === filtro.id);
    return Promise.resolve(Response.json({ ok: true, datos: { filas } }));
  });
  return pedidos;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la caja de esta terminal', () => {
  it('con dos cajas abiertas, la terminal de Diana lee la de Diana', async () => {
    const pedidos = servidor({ abierta: true, sesionCajaId: DE_DIANA });
    const caja = await cajaDeEstaTerminal();
    expect(caja?.usuario_apertura_nombre).toBe('Diana');
    expect(pedidos.map((p) => p.ruta)).toEqual(['/api/caja/estado', '/api/datos/consultar']);
  });

  it('sin caja abierta en esta terminal no presta la de otra', async () => {
    const pedidos = servidor({ abierta: false, sesionCajaId: null });
    expect(await cajaDeEstaTerminal()).toBeNull();
    expect(pedidos).toHaveLength(1);
  });
});
