import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Contrato del acceso central del Master POS y de sus enlaces acotados opcionales.
 * D-42 supera la obligación de entrar por negocio. Los contextos siguen viniendo
 * de la lista del servidor; un enlace explícito nunca amplía esa lista.
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

vi.mock('@morphiqpos/app/sesion', () => ({
  destinosDePresentacion: (dueno: { empleoId: string }) =>
    Promise.resolve(dueno.empleoId === 'e-ti-1' ? [{ empleoId: 'otro' }] : []),
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
      readonly esDuenoGeneral?: boolean;
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
  it('el acceso central ofrece los modelos servidos y reconoce al dueño general', async () => {
    const { estado, cuerpo, texto } = await pedir();
    expect(estado).toBe(200);
    expect(cuerpo.datos?.negocios?.map((n) => n.slug)).toEqual([
      MH.slug,
      TIENDA.slug,
      ESTETICA.slug,
    ]);
    expect(cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual(['Lupita', 'Demo', 'Karla']);
    const general = cuerpo.datos?.usuarios?.find((u) => u.esDuenoGeneral);
    expect(general?.nombre).toBe('Demo');
    expect(general?.etiqueta).toBe('Dueño general');
    for (const secreto of ['pin_hash', 'presentacion_destinos', 'presentacion_dueno_empleo']) {
      expect(texto).not.toContain(secreto);
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

  it('una cookie recordada no encierra el acceso central en el último modelo', async () => {
    const primera = await pedir('?negocio=demo-acople-estetica');
    expect(primera.cookies.join(';')).toContain('morphiqpos_entrada=demo-acople-estetica');
    const vuelta = await pedir('', 'morphiqpos_entrada=demo-acople-estetica');
    expect(vuelta.estado).toBe(200);
    expect(vuelta.cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual([
      'Lupita',
      'Demo',
      'Karla',
    ]);
  });

  it('la terminal anterior tampoco oculta los otros modelos en la entrada central', async () => {
    terminalDe = MH.organizacionId;
    const { estado, cuerpo } = await pedir('', 'morphiqpos_dispositivo=token-de-la-caja');
    expect(estado).toBe(200);
    expect(cuerpo.datos?.usuarios?.map((u) => u.nombre)).toEqual(['Lupita', 'Demo', 'Karla']);
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
