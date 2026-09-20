import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { conTransaccion, repoModulos, repoVocabulario, type Transaccion } from '@morphiqpos/data';
import {
  crearVocabulario,
  ENTIDADES,
  esEntidad,
  type Entidad,
  type Genero,
  type Termino,
  type Vocabulario,
} from '@morphiqpos/domain/vocabulario';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-017 · El diccionario de vocabulario, enganchado de verdad.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 * `crearVocabulario()` existía, estaba exportado, tenía prueba… y **cero
 * archivos lo importaban**. Tres modelos lo pidieron por su nombre —`abarrotes`
 * avisó, `ferreteria` lo dio por hecho consumado, `estetica-salon` lo exige— y
 * ninguno lo tenía, porque nadie había escrito la mitad que lee el giro de la
 * organización y las excepciones del negocio.
 *
 * ── Los dos ejes, que no son el mismo ──────────────────────────────────────
 * D-04 decía «un diccionario declarado en la plantilla». Es falso y ya se
 * corrigió en el dominio: **Don Chuy y La Broca comparten la plantilla `tienda`
 * y no comparten vocabulario.** Don Chuy vende «productos»; La Broca vende
 * «material» y «piezas». La plantilla dice qué MÓDULOS tiene el negocio; el
 * giro dice CÓMO HABLA. Por eso el vocabulario se resuelve con el GIRO, y las
 * excepciones cuelgan de la organización.
 *
 * ── Dónde se nota si esto falta ────────────────────────────────────────────
 * En los errores y en los estados vacíos, que es donde nadie mira. «No se pudo
 * abrir la mesa» en una estética delata en tres segundos que la traducción es
 * una capa de pintura.
 */

const ROLES_DE_ADMINISTRACION = ['administrador', 'dueno'] as const;

const GENEROS = ['femenino', 'masculino'] as const;

/**
 * El vocabulario efectivo de una organización: su giro más lo que cambió a mano.
 *
 * Devuelve el vocabulario del giro base cuando no se puede leer el perfil. Aquí
 * fallar cerrado sería DEJAR LA PANTALLA SIN SUSTANTIVOS, que es peor que
 * enseñar el nombre neutro: el vocabulario no autoriza nada, sólo nombra.
 */
export async function vocabularioDelNegocio(
  tx: Transaccion,
  organizacionId: string,
): Promise<Vocabulario> {
  const perfil = await repoModulos.leerPerfil(tx, organizacionId);
  const guardados = await repoVocabulario.leerVocabulario(tx, organizacionId);

  const personalizado: Record<string, Termino> = {};
  for (const fila of guardados) {
    if (!esEntidad(fila.entidad)) continue;
    if (fila.genero !== 'femenino' && fila.genero !== 'masculino') continue;
    personalizado[fila.entidad] = {
      singular: fila.singular,
      plural: fila.plural,
      genero: fila.genero,
    };
  }

  return crearVocabulario(perfil?.giro ?? '', personalizado);
}

export const entradaFijarTermino = z.object({
  entidad: z.enum(ENTIDADES),
  singular: z.string().trim().min(1).max(40),
  plural: z.string().trim().min(1).max(40),
  /**
   * El género se declara; NO se deduce.
   *
   * «mesa» y «cabina» acaban en -a y son femeninos; «día» y «sofá» también y son
   * masculinos. Cualquier heurística escribe «la día» tarde o temprano, y ése es
   * justo el error que F-017 existe para impedir.
   */
  genero: z.enum(GENEROS),
});

export interface ResultadoDeTermino {
  readonly entidad: Entidad;
  readonly singular: string;
  readonly plural: string;
  readonly genero: Genero;
  /** Cómo queda una frase de ejemplo. Es lo que la pantalla enseña al guardar. */
  readonly ejemplo: string;
}

export const fijarTermino = definirComando<
  Transaccion,
  typeof entradaFijarTermino,
  ResultadoDeTermino
>({
  nombre: 'configuracion.fijar_termino',
  entidad: 'vocabulario_negocio',
  escribe: true,
  roles: [...ROLES_DE_ADMINISTRACION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaFijarTermino,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    if (entrada.singular === entrada.plural) {
      // No es un capricho: un plural igual al singular hace que «3 mesa» y
      // «1 mesa» se lean igual, y quien lo teclea casi siempre olvidó el campo.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'El plural no puede ser igual al singular: «3 mesa» se lee mal en cada pantalla.',
      );
    }

    await ctx.paso('fijar término', () =>
      repoVocabulario.fijarTermino(ctx.tx, {
        organizacionId,
        entidad: entrada.entidad,
        singular: entrada.singular,
        plural: entrada.plural,
        genero: entrada.genero,
        empleadoId: ctx.ambito.empleoId,
        ahora: ctx.ahora,
      }),
    );

    const vocabulario = crearVocabulario('', {
      [entrada.entidad]: {
        singular: entrada.singular,
        plural: entrada.plural,
        genero: entrada.genero,
      },
    });

    ctx.auditar({
      entidadId: null,
      payload: {
        entidad: entrada.entidad,
        singular: entrada.singular,
        plural: entrada.plural,
        genero: entrada.genero,
      },
    });

    return {
      entidad: entrada.entidad,
      singular: entrada.singular,
      plural: entrada.plural,
      genero: entrada.genero,
      // `La mesa 5 está libre` · `El tablón 5 está libre`. El artículo sale del
      // género declarado, que es justo lo que hace falta comprobar de un vistazo.
      ejemplo: `${vocabulario.conArticulo(entrada.entidad)} está libre`,
    };
  },
});

export const entradaRestablecerTermino = z.object({ entidad: z.enum(ENTIDADES) });

export interface ResultadoDeRestablecerTermino {
  readonly entidad: Entidad;
  readonly habiaTermino: boolean;
  /** Cómo se llama ahora, con el diccionario de su giro. Vacío si el giro la apaga. */
  readonly singular: string;
}

export const restablecerTermino = definirComando<
  Transaccion,
  typeof entradaRestablecerTermino,
  ResultadoDeRestablecerTermino
>({
  nombre: 'configuracion.restablecer_termino',
  entidad: 'vocabulario_negocio',
  escribe: true,
  roles: [...ROLES_DE_ADMINISTRACION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRestablecerTermino,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const quitadas = await ctx.paso('quitar término', () =>
      repoVocabulario.quitarTermino(ctx.tx, organizacionId, entrada.entidad),
    );

    const perfil = await ctx.paso('leer giro', () =>
      repoModulos.leerPerfil(ctx.tx, organizacionId),
    );
    const vocabulario = crearVocabulario(perfil?.giro ?? '');

    ctx.auditar({ entidadId: null, payload: { entidad: entrada.entidad, quitadas } });

    return {
      entidad: entrada.entidad,
      habiaTermino: quitadas > 0,
      singular: vocabulario.singular(entrada.entidad),
    };
  },
});

/**
 * Lo que una PANTALLA necesita para hablar como el negocio.
 *
 * ── Por qué esto, y no el `Vocabulario` entero ─────────────────────────────
 * `vocabularioDelNegocio()` devuelve un objeto con funciones. Las funciones no
 * cruzan la frontera servidor→cliente de React: hay que mandar DATOS y volver a
 * armar el vocabulario del otro lado. Son dos campos, y el módulo de dominio es
 * puro y corre igual en el navegador, así que rearmarlo cuesta nada.
 *
 * ── Por qué viaja el giro y no los términos resueltos ──────────────────────
 * Porque el diccionario del giro es la misma decisión de producto para los 78
 * modelos y tiene que poder corregirse con un despliegue. Si se serializaran
 * los términos ya resueltos, cambiar «mesero» por «mesera» en el diccionario
 * no llegaría a ningún negocio hasta que alguien tocara su fila.
 *
 * Lo que sí viaja resuelto son las EXCEPCIONES: eso es dato del negocio.
 */
export interface TerminosDelNegocio {
  readonly giro: string;
  readonly personalizado: Readonly<Record<string, Termino>>;
}

export async function terminosDelNegocio(
  tx: Transaccion,
  organizacionId: string,
): Promise<TerminosDelNegocio> {
  const perfil = await repoModulos.leerPerfil(tx, organizacionId);
  const guardados = await repoVocabulario.leerVocabulario(tx, organizacionId);

  const personalizado: Record<string, Termino> = {};
  for (const fila of guardados) {
    if (!esEntidad(fila.entidad)) continue;
    if (fila.genero !== 'femenino' && fila.genero !== 'masculino') continue;
    personalizado[fila.entidad] = {
      singular: fila.singular,
      plural: fila.plural,
      genero: fila.genero,
    };
  }

  // El giro vacío es una respuesta válida y no un error: `crearVocabulario`
  // cae al diccionario base, que nombra todo con el sustantivo neutro. Dejar la
  // pantalla SIN sustantivos sería peor — el vocabulario no autoriza nada,
  // sólo nombra.
  return { giro: perfil?.giro ?? '', personalizado };
}

/**
 * Los términos de una organización, abriendo su propia transacción.
 *
 * `apps/web` no depende de `@morphiqpos/data` —y no debe: la regla de
 * dependencia va de la aplicación hacia el dominio, no hacia el motor—, así que
 * la transacción la abre esta capa, igual que hacen todas las demás consultas
 * que una ruta invoca.
 */
export async function terminosDeLaOrganizacion(
  organizacionId: string,
): Promise<TerminosDelNegocio> {
  return conTransaccion((tx) => terminosDelNegocio(tx, organizacionId));
}
