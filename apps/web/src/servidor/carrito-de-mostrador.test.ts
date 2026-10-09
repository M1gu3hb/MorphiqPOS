import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL CARRITO DEL MOSTRADOR, paso por paso: qué comando recibe cada renglón.
 *
 * Los comandos se sustituyen por grabadoras: lo que se prueba aquí es el ORDEN y el
 * REPARTO —crear, vaciar, y cada renglón por su comando—, no los comandos, que tienen sus
 * pruebas. El renglón con opciones tiene que ir por `cafeteria.agregar_bebida` (C.10 de la
 * 2.4): por `venta.agregar_linea` entraba sin opciones, al precio base y sin sustituir
 * la leche.
 */
const llamadas: { readonly comando: string; readonly cuerpo: Record<string, unknown> }[] = [];
let ordenDeLaBebida = 'orden-1';

function respuesta(datos: unknown): Response {
  return new Response(JSON.stringify({ ok: true, datos }), { status: 200 });
}

vi.mock('@morphiqpos/app/venta', () => ({
  crearOrden: { nombre: 'venta.crear_orden' },
  vaciarOrden: { nombre: 'venta.vaciar_orden' },
  agregarLinea: { nombre: 'venta.agregar_linea' },
}));
vi.mock('@morphiqpos/app/cafeteria', () => ({
  agregarBebida: { nombre: 'cafeteria.agregar_bebida' },
}));
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ APP_URL: 'http://localhost', APP_URL_ALTERNAS: '' }),
}));
vi.mock('./ruta.ts', () => ({
  manejadorDeComando:
    (comando: { readonly nombre: string }) =>
    async (peticion: Request): Promise<Response> => {
      const cuerpo = (await peticion.json()) as Record<string, unknown>;
      llamadas.push({ comando: comando.nombre, cuerpo });
      if (comando.nombre === 'venta.crear_orden') return respuesta({ ordenId: 'orden-1' });
      if (comando.nombre === 'cafeteria.agregar_bebida') {
        return respuesta({ ordenId: ordenDeLaBebida, lineaId: 'l' });
      }
      return respuesta({});
    },
}));

const { armarCarrito, fronteraDelMostrador, pasosDe } = await import('./carrito-de-mostrador.ts');

const peticion = new Request('http://localhost/api/venta/cobrar-mostrador', {
  method: 'POST',
  headers: { 'idempotency-key': 'venta-1' },
});

describe('armar el carrito del mostrador', () => {
  beforeEach(() => {
    llamadas.length = 0;
    ordenDeLaBebida = 'orden-1';
  });

  it('la bebida con opciones va por agregar_bebida; la sencilla, por agregar_linea', async () => {
    const armado = await armarCarrito(pasosDe(peticion), [
      { productoId: '11111111-1111-4111-8111-111111111111', cantidad: '1' },
      {
        productoId: '22222222-2222-4222-8222-222222222222',
        cantidad: '1',
        opciones: ['33333333-3333-4333-8333-333333333333'],
      },
    ]);

    expect(armado.ok).toBe(true);
    expect(llamadas.map((l) => l.comando)).toEqual([
      'venta.crear_orden',
      'venta.vaciar_orden',
      'venta.agregar_linea',
      'cafeteria.agregar_bebida',
    ]);
    expect(llamadas[3]?.cuerpo).toEqual({
      productoId: '22222222-2222-4222-8222-222222222222',
      cantidad: '1',
      opciones: ['33333333-3333-4333-8333-333333333333'],
      alergias: [],
      nota: '',
    });
  });

  it('una bebida que cae en OTRA cuenta para el cobro con 409', async () => {
    ordenDeLaBebida = 'otra-orden';
    const armado = await armarCarrito(pasosDe(peticion), [
      {
        productoId: '22222222-2222-4222-8222-222222222222',
        cantidad: '1',
        opciones: ['33333333-3333-4333-8333-333333333333'],
      },
    ]);

    expect(armado.ok).toBe(false);
    if (armado.ok) return;
    expect(armado.respuesta.status).toBe(409);
  });

  it('una nota sola también es una bebida con algo elegido', async () => {
    await armarCarrito(pasosDe(peticion), [
      { productoId: '22222222-2222-4222-8222-222222222222', cantidad: '1', nota: 'sin espuma' },
    ]);
    expect(llamadas.at(-1)?.comando).toBe('cafeteria.agregar_bebida');
  });
});

describe('la frontera del mostrador (auditoría de la 2.4)', () => {
  function peticionCon(cabeceras: Record<string, string>): Request {
    return new Request('http://localhost/api/venta/cobrar-mostrador', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-morphiqpos-request': '1',
        origin: 'http://localhost',
        'content-length': '120',
        'idempotency-key': 'venta-0001',
        ...cabeceras,
      },
    });
  }

  it('deja pasar una escritura propia, del tamaño debido y con su clave', () => {
    expect(fronteraDelMostrador(peticionCon({}))).toBeNull();
  });

  it('SIN CLAVE no se cobra: un reintento sería otra venta', () => {
    const sinClave = new Request('http://localhost/api/venta/cobrar-mostrador', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-morphiqpos-request': '1',
        'content-length': '120',
      },
    });
    expect(fronteraDelMostrador(sinClave)?.status).toBe(400);
  });

  it('otro origen, 403; sin longitud declarada o enorme, 413 — antes de leer el cuerpo', () => {
    expect(fronteraDelMostrador(peticionCon({ origin: 'https://otro.example' }))?.status).toBe(403);
    expect(fronteraDelMostrador(peticionCon({ 'content-length': '999999999' }))?.status).toBe(413);
  });
});
