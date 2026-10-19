import { Material } from '~/ferreteria/Material';

/**
 * El material continuo: los rollos abiertos, lo que queda y el corte.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 *
 * El material llega en la dirección, `?producto=<id>`: es el enlace que pinta el
 * vacío de la propia pantalla por cada material que se vende por medida. Montada
 * siempre con la cadena vacía, todo lo que no era el vacío —la lista de rollos, el
 * corte, abrir uno— no se alcanzaba nunca. El id no se valida aquí: el servidor
 * comprueba que sea un uuid de este negocio, y si no lo es la pantalla lo dice.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { producto } = await searchParams;
  return <Material productoId={typeof producto === 'string' ? producto.trim() : ''} />;
}
