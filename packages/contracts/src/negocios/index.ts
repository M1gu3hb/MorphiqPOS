/**
 * LOS NEGOCIOS QUE SE PUEDEN TOCAR, y los que no. Declarados UNA sola vez, por ID.
 *
 * ── Por qué este archivo existe ──────────────────────────────────────────────
 * Hasta la 2.4 la lista de negocios vivos estaba copiada en cuatro sitios —la
 * precondición de las pruebas, la siembra, el alta, el reinicio— y cada copia se
 * escribió cuando su autor sabía lo que sabía. Una lista copiada se queda atrás en
 * silencio: el día que se añade un cliente, tres de las cuatro guardas siguen
 * protegiendo a los de antes.
 *
 * ── Por qué por ID y no por nombre ni por prefijo ────────────────────────────
 * **Tres de los cuatro negocios reales tienen un identificador que empieza por
 * `demo-`.** Nacieron como demostraciones y se quedaron a cobrar. Cualquier regla de
 * prefijo daría por buena la caja de Don Chuy. El nombre tampoco sirve: se cambia
 * desde la configuración. El ID no lo cambia nadie.
 *
 * ── Y la regla es POSITIVA ───────────────────────────────────────────────────
 * Una operación de prueba corre SÓLO si el negocio está en `DEMOS`. No «si no está en
 * los reales»: un negocio que Miguel dé de alta mañana no está en ninguna de las dos
 * listas, y con una regla negativa sería tocable desde el primer día. Con ésta no lo
 * es hasta que alguien lo declare demo aquí, a propósito y con su ID.
 *
 * `NEGOCIOS_REALES` se conserva para los MENSAJES —decir «eso es la caja de
 * Restaurante MH» es más útil que «no es una demo»— y para las comprobaciones que
 * miran lo que un despliegue sirve. Nunca para decidir que algo se puede tocar.
 *
 * Este archivo lo importan el servidor (`resetear.ts`), los guiones (`scripts/*.mjs`,
 * por ruta), las pruebas (`pruebas/`, por ruta) y `@morphiqpos/testing`. No depende
 * de nada.
 */

export interface NegocioConocido {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
}

/** Los cuatro que cobran. Nunca se prueban, nunca se resetean, nunca se siembran. */
export const NEGOCIOS_REALES: readonly NegocioConocido[] = [
  { id: 'aefc918b-5303-4ae7-a1b1-7c8e03105852', slug: 'mh-restaurante', nombre: 'Restaurante MH' },
  {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'demo-abarrotes-don-chuy',
    nombre: 'Abarrotes Don Chuy',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    slug: 'demo-ferreteria-la-broca',
    nombre: 'Ferretería La Broca',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    slug: 'demo-cafe-jacaranda',
    nombre: 'Café Jacaranda',
  },
];

/**
 * Las cinco demostraciones del acople. Las ÚNICAS sobre las que corre una prueba.
 *
 * El nombre es el que tienen al nacer (`db:alta-negocio`), y es al que las devuelve el
 * reseteo si una prueba lo cambió desde la configuración. Comprobados contra la base el
 * 24-09-2026: ID, slug y nombre.
 */
export const DEMOS: readonly NegocioConocido[] = [
  {
    id: '1c20ddfe-535d-480c-88eb-f0d2efe3d750',
    slug: 'demo-acople-tienda',
    nombre: 'Demo del acople · tienda',
  },
  {
    id: 'c7fc2e42-c167-4180-9938-855f8c52896b',
    slug: 'demo-acople-cafeteria',
    nombre: 'Demo del acople · cafeteria',
  },
  {
    id: '33dad5ff-ffea-44a5-abd4-cce8019098a7',
    slug: 'demo-acople-restaurante',
    nombre: 'Demo del acople · restaurante',
  },
  {
    id: '61d447a6-9633-4709-b850-871c00ae162f',
    slug: 'demo-acople-ferreteria',
    nombre: 'Demo del acople · ferreteria',
  },
  {
    id: '1747ccf9-3474-4233-bd87-60e2e188fa8b',
    slug: 'demo-acople-estetica',
    nombre: 'Demo del acople · estetica',
  },
];

/**
 * El proyecto de Supabase donde viven los cuatro negocios reales, y el de otro cliente
 * que esta base de código no toca ni para leer. Una URL de base que apunte a
 * cualquiera de los dos no es una base desechable.
 */
export const PROYECTOS_INTOCABLES: readonly string[] = [
  'wyqmzhliurwyxuyxznpb',
  'ivqcxdpqxwjxfohiswqb',
];

const normalizar = (valor: string): string => valor.trim().toLocaleLowerCase('en-US');

/** La demo con ese ID, o `null`. */
export function demoPorId(id: string | null | undefined): NegocioConocido | null {
  const buscado = normalizar(id ?? '');
  return DEMOS.find((d) => d.id === buscado) ?? null;
}

/** La demo con ese slug, o `null`. Para quien sólo ve el slug —una respuesta pública—. */
export function demoPorSlug(slug: string | null | undefined): NegocioConocido | null {
  const buscado = normalizar(slug ?? '');
  return DEMOS.find((d) => d.slug === buscado) ?? null;
}

/** El negocio real con ese ID o slug, o `null`. Sólo para decirlo en un mensaje. */
export function negocioReal(idOSlug: string | null | undefined): NegocioConocido | null {
  const buscado = normalizar(idOSlug ?? '');
  return NEGOCIOS_REALES.find((n) => n.id === buscado || n.slug === buscado) ?? null;
}

/** El error de una operación de prueba sobre algo que no es una demo. */
export class NoEsUnaDemo extends Error {
  override readonly name = 'NoEsUnaDemo';
}

/**
 * LA guarda. Lanza si el negocio no es una de las cinco demos.
 *
 * Con `id` decide por ID. Sin él —quien sólo tiene el slug de una respuesta pública—
 * decide por slug contra la misma lista. Si llegan los dos, tienen que ser de la
 * MISMA demo: un slug de demo con el ID de un cliente es exactamente el error que
 * esta guarda existe para parar.
 */
export function exigirDemo(
  negocio: { readonly id?: string | null; readonly slug?: string | null },
  operacion: string,
): NegocioConocido {
  const porId = negocio.id === undefined || negocio.id === null ? null : demoPorId(negocio.id);
  const porSlug =
    negocio.slug === undefined || negocio.slug === null ? null : demoPorSlug(negocio.slug);
  const tieneId = negocio.id !== undefined && negocio.id !== null && negocio.id !== '';
  const tieneSlug = negocio.slug !== undefined && negocio.slug !== null && negocio.slug !== '';
  const demo = tieneId ? porId : porSlug;
  const coinciden = !(tieneId && tieneSlug) || (porId !== null && porId === porSlug);

  if (demo !== null && coinciden) return demo;

  const quien = negocio.id ?? negocio.slug ?? '(sin negocio)';
  const real = negocioReal(negocio.id ?? negocio.slug);
  throw new NoEsUnaDemo(
    [
      `ALTO: «${operacion}» sólo corre sobre una demostración, y «${quien}» no lo es.`,
      real === null
        ? 'No está en la lista de demos de packages/contracts/src/negocios.'
        : `Es ${real.nombre}: un negocio REAL que cobra. Nunca se prueba ni se resetea.`,
      `Las demos: ${DEMOS.map((d) => d.slug).join(', ')}.`,
    ].join('\n'),
  );
}

/** ¿Esta URL de Postgres (o de API) es de un proyecto intocable? */
export function esDeUnProyectoIntocable(url: string | null | undefined): boolean {
  const texto = normalizar(url ?? '');
  return PROYECTOS_INTOCABLES.some((ref) => texto.includes(ref));
}
