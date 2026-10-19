import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LA ENTRADA ES DE UN NEGOCIO (bloque A de la 2.4), probada sobre la RUTA de verdad.
 *
 * Producción servía a Restaurante MH y a las cinco demos en el mismo despliegue, y
 * `/api/auth/empleados` —sin sesión— devolvía a la gente de los seis mezclada. Esto
 * llama al `GET` de la ruta con la base sustituida y afirma lo que ve quien abre la
 * dirección: sin negocio, nadie; con uno, sólo su gente; con uno que no se sirve, la
 * misma 404 que con uno que no existe.
 *
 * Se vio en ROJO contra la ruta de `main` (la que mezclaba): el primer caso recibe 200
 * con las personas de los dos negocios.
 */

const MH = {
  organizacionId: 'aefc918b-5303-4ae7-a1b1-7c8e03105852',
  nombre: 'Restaurante MH',
  slug: 'mh-restaurante',
};
const TIENDA = {
  organizacionId: '1c20ddfe-535d-480c-88eb-f0d2efe3d750',
  nombre: 'Tienda demo',
  slug: 'demo-acople-tienda',
};
const ESTETICA = {
  organizacionId: '1747ccf9-3474-4233-bd87-60e2e188fa8b',
  nombre: 'Estética demo',
  slug: 'demo-acople-estetica',
};

const GENTE: Record<string, { empleoId: string; nombre: string; rol: string }[]> = {
  [MH.organizacionId]: [{ empleoId: 'e-mh-1', nombre: 'Lupita', rol: 'mesero' }],
  [TIENDA.organizacionId]: [{ empleoId: 'e-ti-1', nombre: 'Demo', rol: 'dueno' }],
  [ESTETICA.organizacionId]: [{ empleoId: 'e-es-1', nombre: 'Karla', rol: 'mesero' }],
};
const GIROS: Record<string, string> = {
  [MH.organizacionId]: 'restaurante',
  [TIENDA.organizacionId]: 'tienda',
  [ESTETICA.organizacionId]: 'estetica',
};

let servidos: (typeof MH)[] = [];
let terminalDe: string | null = null;

vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({
    ORGANIZACION: undefined,
    PIN_PEPPER: 'pimienta-de-prueba',
    NODE_ENV: 'production',
  }),
}));

vi.mock('@morphiqpos/app/http', async (original) => ({
  ...(await original<typeof import('@morphiqpos/app/http')>()),
  permitir: () => Promise.resolve({ ok: true }),
}));

vi.mock('@morphiqpos/app/negocio', async (original) => ({
  ...(await original<typeof import('@morphiqpos/app/negocio')>()),
  negociosDelDespliegue: () => Promise.resolve(servidos),
  negocioDelDespliegue: () => Promise.resolve(servidos[0]),
}));

vi.mock('@morphiqpos/app/identidad', async (original) => ({
  ...(await original<typeof import('@morphiqpos/app/identidad')>()),
  empleadosParaEntrar: (organizacionId: string) => Promise.resolve(GENTE[organizacionId] ?? []),
  organizacionDelDispositivo: () => Promise.resolve(terminalDe),
}));

vi.mock('@morphiqpos/app/configuracion', async (original) => ({
  ...(await original<typeof import('@morphiqpos/app/configuracion')>()),
  terminosDeLaOrganizacion: (organizacionId: string) =>
    Promise.resolve({ giro: GIROS[organizacionId] ?? 'restaurante', personalizado: {} }),
}));

const RUTA = process.env['MORPHIQPOS_RUTA_EMPLEADOS'] ?? '../../app/api/auth/empleados/route.ts';

interface Cuerpo {
  readonly ok: boolean;
  readonly datos?: {
    readonly slug?: string;
    readonly negocios?: readonly { readonly slug: string }[];
    readonly usuarios?: readonly {
      readonly nombre: string;
      readonly etiqueta: string;
      readonly negocioSlug?: string;
    }[];
  };
  readonly error?: { readonly codigo: string; readonly mensaje: string };
}

let GET: (peticion: Request) => Promise<Response>;

// La ruta arrastra media aplicación al importarse; con la caché fría eso pasa de los 5 s
// de una prueba unitaria. Se importa una vez, fuera de las pruebas y con su propio techo.
beforeAll(async () => {
  ({ GET } = (await import(/* @vite-ignore */ RUTA)) as {
    GET: (peticion: Request) => Promise<Response>;
  });
}, 120_000);

async function pedir(
  consulta = '',
  cookie?: string,
): Promise<{ estado: number; cuerpo: Cuerpo; texto: string; cookies: string[] }> {
  const cabeceras = new Headers({ host: 'morphiqpos-kappa.vercel.app' });
  if (cookie !== undefined) cabeceras.set('cookie', cookie);
  const respuesta = await GET(
    new Request(`https://morphiqpos-kappa.vercel.app/api/auth/empleados${consulta}`, {
      headers: cabeceras,
    }),
  );
  const texto = await respuesta.text();
  return {
    estado: respuesta.status,
    cuerpo: JSON.parse(texto) as Cuerpo,
    texto,
    cookies: respuesta.headers.getSetCookie(),
  };
}

beforeEach(() => {
  servidos = [MH, TIENDA, ESTETICA];
  terminalDe = null;
});

describe('/api/auth/empleados en un despliegue de varios negocios', () => {
  it('sin negocio no enseña a NADIE: 404 y ni un nombre en la respuesta', async () => {
    const { estado, texto } = await pedir();
    expect(estado).toBe(404);
    for (const nombre of ['Lupita', 'Demo', 'Karla', 'Restaurante MH', 'mh-restaurante']) {
      expect(texto).not.toContain(nombre);
    }
  });

  it('con la dirección de un negocio, sólo su gente, y cada persona marcada con él', async () => {
    const { estado, cuerpo } = await pedir('?negocio=demo-acople-tienda');
    expect(estado).toBe(200);
    expect(cuerpo.datos?.slug).toBe('demo-acople-tienda');
    expect(cuerpo.datos?.negocios?.map((n) => n.slug)).toEqual(['demo-acople-tienda']);
    expect(cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual(['Demo']);
    expect(cuerpo.datos?.usuarios?.every((u) => u.negocioSlug === 'demo-acople-tienda')).toBe(true);
  });

  it('un negocio que no se sirve contesta EXACTAMENTE lo mismo que uno que no existe', async () => {
    servidos = [TIENDA, ESTETICA];
    const noServido = await pedir('?negocio=mh-restaurante');
    const inexistente = await pedir('?negocio=no-existe-este-negocio');
    expect(noServido.estado).toBe(404);
    expect(inexistente.estado).toBe(404);
    expect(noServido.texto).toBe(inexistente.texto);
    expect(noServido.texto).not.toContain('Lupita');
  });

  it('cuando el host ya nombra un negocio, otro slug en la dirección es un 404', async () => {
    servidos = [TIENDA];
    expect((await pedir('?negocio=demo-acople-tienda')).estado).toBe(200);
    expect((await pedir('?negocio=demo-acople-estetica')).estado).toBe(404);
  });

  it('recuerda la entrada con una cookie, y la cookie sola vuelve a abrir SÓLO esa', async () => {
    const primera = await pedir('?negocio=demo-acople-estetica');
    expect(primera.cookies.join(';')).toContain('morphiqpos_entrada=demo-acople-estetica');
    const vuelta = await pedir('', 'morphiqpos_entrada=demo-acople-estetica');
    expect(vuelta.estado).toBe(200);
    expect(vuelta.cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual(['Karla']);
  });

  it('la caja de un negocio (su terminal) abre la entrada de ese negocio y de ninguno más', async () => {
    terminalDe = MH.organizacionId;
    const { estado, cuerpo } = await pedir('', 'morphiqpos_dispositivo=token-de-la-caja');
    expect(estado).toBe(200);
    expect(cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual(['Lupita']);
  });

  it('rotula el rol con el vocabulario del giro: la estilista no es «Mesero» (A.8)', async () => {
    const estetica = await pedir('?negocio=demo-acople-estetica');
    expect(estetica.cuerpo.datos?.usuarios?.[0]?.etiqueta).toBe('Estilista');
    const restaurante = await pedir('?negocio=mh-restaurante');
    expect(restaurante.cuerpo.datos?.usuarios?.[0]?.etiqueta).toBe('Mesero');
  });
});

describe('/api/auth/empleados en un despliegue de UN negocio', () => {
  it('sin dirección entra como siempre: la gente de ese negocio', async () => {
    servidos = [MH];
    const { estado, cuerpo } = await pedir();
    expect(estado).toBe(200);
    expect(cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual(['Lupita']);
  });
});
