import { Producto } from '~/abarrotes/Producto';

/**
 * La ficha de un producto de la tienda, con `?producto=<id>`; sin él, el catálogo del que se
 * elige (C.10 de la 2.4). Antes la página montaba la ficha SIEMPRE con el id vacío y nada
 * enlazaba a una ficha concreta: «Productos» no abría ninguna, y el precio, el costo y las
 * presentaciones de la tienda no se podían tocar desde ningún sitio.
 */
export const dynamic = 'force-dynamic';

/** Sólo un uuid: cualquier otra cosa sería un filtro que Postgres rechaza. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { producto } = await searchParams;
  const productoId =
    typeof producto === 'string' && UUID.test(producto.trim()) ? producto.trim() : '';
  return <Producto productoId={productoId} />;
}
