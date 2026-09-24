/**
 * La entrada de un negocio, sin base de datos: la usa el servidor para elegir y el
 * navegador para saber por qué dirección entró. Por eso NO importa `server-only` ni la
 * base — nada de aquí sabe qué negocios existen; eso lo resuelve `despliegue.ts`.
 */

/** La ruta de la entrada de un negocio. */
export function rutaDeEntrada(slug: string): string {
  return `/n/${slug}/login-pos`;
}

/**
 * La cookie que recuerda por qué entrada llegó este navegador. Sólo es una PISTA para
 * volver a ella —al cerrar sesión, o desde `/login-pos`—: no autoriza nada, y el
 * servidor vuelve a comprobar que el despliegue sirve ese negocio cada vez.
 */
export const COOKIE_ENTRADA = 'morphiqpos_entrada';

/** Un slug con la forma de los de `organizaciones.slug`; cualquier otra cosa, `null`. */
export function slugValido(valor: string | null | undefined): string | null {
  const slug = (valor ?? '').trim().toLocaleLowerCase('en-US');
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ? slug : null;
}

/**
 * EL NEGOCIO DE UNA ENTRADA · la pantalla de acceso enseña a la gente de UNO.
 *
 * ── Por qué ──────────────────────────────────────────────────────────────
 * Producción sirve a varios negocios en el mismo despliegue, y `/api/auth/empleados`
 * devolvía a la gente de TODOS mezclada, sin sesión: nombre, rol, color y el `empleoId`
 * —el primer factor del acceso—. El cajero de un negocio veía al personal de otro. La
 * entrada tiene que ser de UN negocio, y el negocio lo dice la DIRECCIÓN por la que se
 * entra, no una lista pública:
 *
 *   · el host, cuando lleva el slug (`mh-restaurante.<dominio>`), y
 *   · la ruta `/n/<slug>/login-pos`, que el negocio guarda como favorito y no depende
 *     del DNS.
 *
 * ── La regla ─────────────────────────────────────────────────────────────
 * `pedido` es el slug de la ruta (o `null`). `servidos` son los negocios de este
 * despliegue, ya resueltos del host o de `ORGANIZACION`.
 *
 *   · con `pedido`: ése, SÓLO si el despliegue lo sirve. Si no —porque no existe o
 *     porque es de otro despliegue— `null`, y quien llama contesta 404: las dos cosas
 *     tienen que ser indistinguibles, o la entrada serviría para averiguar qué negocios
 *     existen;
 *   · sin `pedido`: el único que sirve, si sirve a uno. Si sirve a varios, `null`:
 *     elegir «el primero» es enseñar la gente de un negocio en la entrada de otro.
 *
 * Es pura para poder probarla sin base: qué negocios sirve el despliegue se resuelve
 * antes, en `negociosDelDespliegue`.
 */
export function elegirNegocioDeLaEntrada<T extends { readonly slug: string }>(
  servidos: readonly T[],
  pedido: string | null | undefined,
): T | null {
  const slug = (pedido ?? '').trim().toLocaleLowerCase('en-US');
  if (slug !== '') return servidos.find((n) => n.slug === slug) ?? null;
  return servidos.length === 1 ? (servidos[0] ?? null) : null;
}

/** El slug de una ruta de entrada: `/n/<slug>/…` → `<slug>`; cualquier otra, `null`. */
export function slugDeLaRutaDeEntrada(ruta: string | null | undefined): string | null {
  const coincidencia = /^\/n\/([a-z0-9][a-z0-9-]{1,62})(?:\/|$)/.exec(ruta ?? '');
  return coincidencia?.[1] ?? null;
}
