import { slugDeLaRutaDeEntrada, slugValido } from '@morphiqpos/app/entrada';

/**
 * EL NEGOCIO QUE NOMBRA LA DIRECCIÓN de esta pantalla de acceso (bloque A de la 2.4).
 *
 * `/n/<slug>/login-pos` es la entrada de UN negocio; las pantallas de PIN de los
 * modelos aceptan además `?negocio=<slug>`. Sin ninguna de las dos no se nombra
 * negocio y decide el servidor —el único que sirve, o el que esta caja recuerda—.
 *
 * Es una PISTA, no una autorización: el servidor vuelve a comprobar que el despliegue
 * sirve ese negocio, y si no, contesta 404 igual que si no existiera.
 */
export function negocioDeLaDireccion(
  ubicacion: Pick<Location, 'pathname' | 'search'> | undefined = typeof window === 'undefined'
    ? undefined
    : window.location,
): string | null {
  if (ubicacion === undefined) return null;
  return (
    slugDeLaRutaDeEntrada(ubicacion.pathname) ??
    slugValido(new URLSearchParams(ubicacion.search).get('negocio'))
  );
}

/** `/api/auth/empleados`, con el negocio de la dirección si la dirección nombra uno. */
export function rutaDeEmpleados(negocio: string | null = negocioDeLaDireccion()): string {
  return negocio === null
    ? '/api/auth/empleados'
    : `/api/auth/empleados?negocio=${encodeURIComponent(negocio)}`;
}

/** Lo que se añade al cuerpo de `/api/auth/entrar`: el negocio, si hay uno. */
export function negocioParaEntrar(negocio: string | null = negocioDeLaDireccion()): {
  negocio?: string;
} {
  return negocio === null ? {} : { negocio };
}
