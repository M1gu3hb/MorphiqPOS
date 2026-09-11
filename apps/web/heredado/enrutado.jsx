'use client';

/**
 * El puente del enrutador (F1-02 §8, trampa T2).
 *
 * Su código usa React Router: `useNavigate`, `useLocation`, `useParams`,
 * `<Link to>`, `<Navigate to>`, `<Outlet>`. La aplicación es Next con App
 * Router y nada de eso existe.
 *
 * Este archivo exporta los equivalentes de Next **con los nombres de React
 * Router**, así que sus 22 archivos no cambian una sola línea: siguen
 * escribiendo `import { useNavigate } from '@/enrutado'` y todo se comporta
 * igual.
 *
 * Lo que NO se emula, y es deliberado:
 *   · `location.state` — React Router lo usa para pasar datos entre rutas sin
 *     que aparezcan en la URL. Su código no lo usa (se comprobó buscándolo).
 *     Si algún día hiciera falta, va en la URL o en un contexto, no aquí.
 *   · El `<Router>` — lo pone Next.
 */

import NextLink from 'next/link';
import {
  useParams as useParamsNext,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { useEffect, useMemo } from 'react';

export { useParamsNext as useParams };

/**
 * `useLocation()` de React Router devuelve `{pathname, search, hash}`.
 *
 * Se compone de `usePathname()` y `useSearchParams()`. `search` lleva su `?`
 * delante, como en React Router: `PropinasDashboardSection` construye enlaces
 * con `?tab=propinas` y espera esa forma.
 */
export function useLocation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const cadena = params.toString();
  return useMemo(
    () => ({
      pathname,
      search: cadena === '' ? '' : `?${cadena}`,
      hash: '',
    }),
    [pathname, cadena],
  );
}

/**
 * `useNavigate()` devuelve una función.
 *
 * Acepta las dos formas que usa su código: `navigate('/ruta')` y
 * `navigate('/ruta', { replace: true })`. También acepta `navigate(-1)`, que
 * en React Router es «atrás».
 */
export function useNavigate() {
  const router = useRouter();
  return (destino, opciones) => {
    if (typeof destino === 'number') {
      if (destino < 0) router.back();
      else router.forward();
      return;
    }
    if (opciones && opciones.replace) router.replace(destino);
    else router.push(destino);
  };
}

/**
 * `<Link to="...">` de React Router → `<Link href="...">` de Next.
 *
 * Se acepta también `href` por si algún archivo ya lo trae, y se descartan las
 * props que sólo existen en React Router (`replace`, `state`, `reloadDocument`)
 * para que no acaben como atributos sueltos en el `<a>` del DOM.
 */
export function Link({ to, href, replace, state, reloadDocument, children, ...resto }) {
  void replace;
  void state;
  void reloadDocument;
  return (
    <NextLink href={to ?? href ?? '#'} {...resto}>
      {children}
    </NextLink>
  );
}

/**
 * `<Navigate to="..." replace />` — redirige al montar.
 *
 * En React Router es un componente que redirige como efecto de renderizarse.
 * Aquí hace lo mismo desde un efecto, que es donde Next permite navegar.
 */
export function Navigate({ to, replace = false }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [router, to, replace]);
  return null;
}

/**
 * `<Outlet />` — el hueco donde React Router pinta la ruta hija.
 *
 * En Next ese hueco es el `children` del layout, así que el `AppLayout`
 * portado recibe `children` y este `Outlet` lo lee de un contexto que pone el
 * propio layout. Ver `heredado/components/common/AppLayout.jsx`.
 */
import { createContext, useContext } from 'react';

const ContenidoRuta = createContext(null);

export function ProveedorDeContenido({ children, contenido }) {
  return <ContenidoRuta.Provider value={contenido}>{children}</ContenidoRuta.Provider>;
}

export function Outlet() {
  return useContext(ContenidoRuta);
}
