import { FichaDePieza } from '~/ferreteria/FichaDePieza';

/**
 * La ficha ampliada de una pieza, para el mostradorista que ya no resuelve con
 * la tabla: foto con escala, medida en pulgada y milímetro, y AGREGAR A LA NOTA.
 *
 * La pieza llega en la dirección (`?pieza=`), que es a donde el mostrador manda con
 * F5. Antes la página montaba SIEMPRE sin pieza y abría la primera del catálogo, así
 * que la ficha de la pieza que se estaba viendo no se podía abrir (C.10 de la 2.4).
 *
 * La página es corta a propósito — el componente vive en `apps/web/src/`, donde el
 * verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

/** Sólo un uuid: cualquier otra cosa sería un `where id = …` que Postgres rechaza. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { pieza } = await searchParams;
  return typeof pieza === 'string' && UUID.test(pieza.trim()) ? (
    <FichaDePieza piezaId={pieza.trim()} />
  ) : (
    <FichaDePieza />
  );
}
