import { afterEach, describe, expect, it, vi } from 'vitest';

import { crearAlmacenArchivos } from './archivos.ts';

/**
 * DP-10.5 · LISTAR EL ALMACÉN entero, para copiar el bucket en la mudanza (Fase B).
 *
 * La API de Supabase lista UN nivel por llamada (las carpetas llegan con `id: null`) y pagina
 * de cien en cien: hay que bajar por las carpetas y pedir la página siguiente, o la copia sale
 * incompleta sin decir nada. Y el tamaño que ya contaba `bytesBajo` es la suma de lo listado.
 */

const SUPABASE = {
  endpoint: 'https://abcdefghijklmnopqrst.supabase.co/storage/v1',
  bucket: 'pos-don-poncho',
  accessKey: 'abcdefghijklmnopqrst',
  secretKey: 'llave-de-prueba',
};

interface Entrada {
  readonly name: string;
  readonly id: string | null;
  readonly metadata: { readonly size: number } | null;
}

const archivo = (name: string, size: number): Entrada => ({
  name,
  id: `id-${name}`,
  metadata: { size },
});
const carpeta = (name: string): Entrada => ({ name, id: null, metadata: null });

/** Un árbol: la raíz con una carpeta `privado/org/` y una página de 100 + 1 en `menu/`. */
const ARBOL: Readonly<Record<string, readonly Entrada[]>> = {
  '': [carpeta('privado'), carpeta('menu'), archivo('logo.png', 10)],
  privado: [carpeta('org')],
  'privado/org': [archivo('ticket.pdf', 7), archivo('foto.webp', 5)],
  menu: [
    ...Array.from({ length: 100 }, (_, i) => archivo(`p${String(i).padStart(3, '0')}.webp`, 1)),
    archivo('ultima.webp', 2),
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(): string[] {
  const pedidos: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: { readonly body: string }) => {
      const { prefix, limit, offset } = JSON.parse(init.body) as {
        prefix: string;
        limit: number;
        offset: number;
      };
      pedidos.push(`${prefix}@${String(offset)}`);
      const pagina = (ARBOL[prefix] ?? []).slice(offset, offset + limit);
      return Promise.resolve(new Response(JSON.stringify(pagina), { status: 200 }));
    }),
  );
  return pedidos;
}

describe('listar el almacén de Supabase', () => {
  it('baja por las carpetas y pide la página siguiente', async () => {
    const pedidos = stubFetch();
    const lista = await crearAlmacenArchivos(SUPABASE).listar('');
    const claves = lista.map((a) => a.clave);
    expect(claves).toHaveLength(104);
    expect(claves).toContain('logo.png');
    expect(claves).toContain('privado/org/ticket.pdf');
    expect(claves).toContain('menu/ultima.webp');
    expect(lista.find((a) => a.clave === 'privado/org/ticket.pdf')?.bytes).toBe(7);
    expect(pedidos).toContain('menu@100');
  });

  it('bytesBajo es la suma de lo que lista', async () => {
    stubFetch();
    expect(await crearAlmacenArchivos(SUPABASE).bytesBajo('privado/')).toBe(12);
  });
});
