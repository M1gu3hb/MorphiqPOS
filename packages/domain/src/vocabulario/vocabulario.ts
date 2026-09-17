import { DICCIONARIO_BASE, DICCIONARIOS } from './diccionarios.ts';
import { FORMAS_DETERMINANTE } from './tipos.ts';
import type { Determinante, Diccionario, Entidad, Termino } from './tipos.ts';

/**
 * F-017 · El resolutor de vocabulario.
 *
 * Es deliberadamente pequeño y sin dependencias: lo consumen pantallas,
 * mensajes de error y estados vacíos, y cualquiera de los tres puede correr en
 * el navegador.
 *
 * ── Los errores y los vacíos también se traducen ───────────────────────────
 * Regla 4 del sistema de diseño, y la que más se descuida: *«los mensajes de
 * error y los estados vacíos también se traducen. Es donde más se nota»*. Un
 * sistema que dice «Mesa abierta» en la cabecera y «No se pudo abrir la mesa»
 * en el error de una estética delata que la traducción es una capa de pintura.
 * Por eso `articulo()` y `conNumero()` existen aquí y no en cada pantalla.
 */

/** Un término apagado: el giro no usa esa entidad. */
export type TerminoODesactivado = Termino | null;

export interface Vocabulario {
  /** El término completo, o `null` si el giro no usa esa entidad. */
  readonly termino: (entidad: Entidad) => TerminoODesactivado;
  /** `mesa` · `cabina` · `bahía`. Cadena vacía si está apagada. */
  readonly singular: (entidad: Entidad) => string;
  /** `mesas` · `cabinas` · `bahías`. */
  readonly plural: (entidad: Entidad) => string;
  /** `la` / `el`, o `las` / `los` en plural. Vacío si está apagada. */
  readonly articulo: (entidad: Entidad, plural?: boolean) => string;
  /** `La mesa` · `El comensal`, con la inicial en mayúscula. */
  readonly conArticulo: (entidad: Entidad, plural?: boolean) => string;
  /**
   * `la mesa` · `los comensales`, en MINÚSCULA, para meterlo en una frase.
   *
   * Existe porque `conArticulo` capitaliza y eso deja «No se pudo abrir La
   * mesa» en cada mensaje de error. Es el mismo texto con otra caja, y sin esto
   * cada pantalla se inventaba su propio `.toLowerCase()`.
   */
  readonly enFrase: (entidad: Entidad, plural?: boolean) => string;
  /**
   * `Mesa` · `Mesas` · `Estaciones`: el sustantivo solo, con la inicial en
   * mayúscula y SIN artículo.
   *
   * Es la forma de un encabezado y de una pestaña —«Mesas», «Materiales»,
   * «Clientas»— y es el 60 % de lo que se ve en las 61 pantallas. Sin esto cada
   * una escribía su propia mayúscula a mano.
   */
  readonly titulo: (entidad: Entidad, plural?: boolean) => string;
  /** `1 mesa` · `3 mesas`. Elige singular o plural por el número. */
  readonly conNumero: (entidad: Entidad, cuantos: number) => string;
  /**
   * `Ninguna mesa` · `Ningún pedido` · `Otra cuenta`, con la inicial en
   * mayúscula: el determinante CONCUERDA con el género del sustantivo.
   *
   * Es lo que hace falta para un estado vacío —«Ninguna mesa está esperando
   * pagar»— sin que la pantalla tenga que saber de qué género es la palabra que
   * la dueña eligió.
   */
  readonly conDeterminante: (
    determinante: Determinante,
    entidad: Entidad,
    plural?: boolean,
  ) => string;
  /** El mismo, en MINÚSCULA, para meterlo en una frase: `otra cuenta`. */
  readonly enFraseCon: (determinante: Determinante, entidad: Entidad, plural?: boolean) => string;
  /**
   * La terminación de un adjetivo que acompaña al sustantivo: `o` · `a` · `os`
   * · `as`.
   *
   *   `${voc.titulo('orden', true)} cobrad${voc.terminacion('orden', true)}`
   *   → «Cuentas cobradas» · «Ventas cobradas» · «Pedidos cobrados»
   *
   * Es fea de leer en el código y es la única forma honesta de escribirlo: el
   * adjetivo concuerda con el sustantivo, y el sustantivo lo elige la dueña del
   * negocio. Sin esto, la cafetería que llama «pedido» a su unidad de servicio
   * lee «Pedidos cobradas», que es el defecto que la cabecera de `tipos.ts`
   * describe palabra por palabra.
   *
   * Sólo sirve para adjetivos REGULARES de dos terminaciones —cobrado,
   * abierto, listo, dormido—. Los invariables (*pendiente*, *urgente*) no la
   * necesitan, y los irregulares no se resuelven así: se busca otra palabra.
   */
  readonly terminacion: (entidad: Entidad, plural?: boolean) => string;
  /** `true` si el giro usa esa entidad. */
  readonly usa: (entidad: Entidad) => boolean;
}

function mayuscula(texto: string): string {
  const primera = texto.charAt(0);
  return primera === '' ? texto : primera.toLocaleUpperCase('es-MX') + texto.slice(1);
}

/**
 * Arma el vocabulario de un giro.
 *
 * `personalizado` son los cambios que el negocio hizo a mano —la tabla
 * `vocabulario_negocio` de la migración 059— y pisan al diccionario del giro.
 * Se pasan como parámetro en vez de leerse aquí porque este módulo es dominio
 * puro: no sabe que existe una base de datos, y por eso se puede probar sin
 * levantar nada.
 */
export function crearVocabulario(giro: string, personalizado: Diccionario = {}): Vocabulario {
  const delGiro = DICCIONARIOS[giro] ?? {};

  function termino(entidad: Entidad): TerminoODesactivado {
    const propio = personalizado[entidad];
    if (propio !== undefined) return propio;

    const deSuGiro = delGiro[entidad];
    if (deSuGiro !== undefined) return deSuGiro;

    // Si el giro EXISTE y no declara la entidad, está apagada a propósito
    // (regla 3). Sólo un giro desconocido cae al diccionario base: ahí no
    // apagar es lo correcto, porque no sabemos qué usa y esconder una entidad
    // rompe la pantalla más que llamarla por su nombre neutro.
    if (DICCIONARIOS[giro] !== undefined) return null;
    return DICCIONARIO_BASE[entidad] ?? null;
  }

  function singular(entidad: Entidad): string {
    return termino(entidad)?.singular ?? '';
  }

  function plural(entidad: Entidad): string {
    return termino(entidad)?.plural ?? '';
  }

  function articulo(entidad: Entidad, enPlural = false): string {
    const t = termino(entidad);
    if (t === null) return '';
    if (t.genero === 'femenino') return enPlural ? 'las' : 'la';
    return enPlural ? 'los' : 'el';
  }

  function conDeterminante(det: Determinante, entidad: Entidad, enPlural: boolean): string {
    const t = termino(entidad);
    if (t === null) return '';
    const [masculino, femenino, masculinos, femeninas] = FORMAS_DETERMINANTE[det];
    const forma =
      t.genero === 'femenino'
        ? enPlural
          ? femeninas
          : femenino
        : enPlural
          ? masculinos
          : masculino;
    return `${forma} ${enPlural ? t.plural : t.singular}`;
  }

  return {
    termino,
    singular,
    plural,
    articulo,
    conArticulo(entidad: Entidad, enPlural = false): string {
      const t = termino(entidad);
      if (t === null) return '';
      const palabra = enPlural ? t.plural : t.singular;
      return mayuscula(`${articulo(entidad, enPlural)} ${palabra}`);
    },
    enFrase(entidad: Entidad, enPlural = false): string {
      const t = termino(entidad);
      if (t === null) return '';
      return `${articulo(entidad, enPlural)} ${enPlural ? t.plural : t.singular}`;
    },
    titulo(entidad: Entidad, enPlural = false): string {
      const t = termino(entidad);
      if (t === null) return '';
      return mayuscula(enPlural ? t.plural : t.singular);
    },
    conNumero(entidad: Entidad, cuantos: number): string {
      const t = termino(entidad);
      if (t === null) return String(cuantos);
      // El uno es el único singular en español. `0 mesas` y `2 mesas` van en
      // plural, y `-1` no existe pero si llegara se lee mejor en plural.
      return `${cuantos} ${cuantos === 1 ? t.singular : t.plural}`;
    },
    conDeterminante(det: Determinante, entidad: Entidad, enPlural = false): string {
      return mayuscula(conDeterminante(det, entidad, enPlural));
    },
    enFraseCon(det: Determinante, entidad: Entidad, enPlural = false): string {
      return conDeterminante(det, entidad, enPlural);
    },
    terminacion(entidad: Entidad, enPlural = false): string {
      const t = termino(entidad);
      // Una entidad apagada no tiene adjetivo que concordar, y la cadena vacía
      // deja «cobrad» a medias. El masculino singular es el menos malo: la
      // frase que la usa no debería estar en pantalla si la entidad no existe.
      const genero = t?.genero ?? 'masculino';
      return (genero === 'femenino' ? 'a' : 'o') + (enPlural ? 's' : '');
    },
    usa(entidad: Entidad): boolean {
      return termino(entidad) !== null;
    },
  };
}
