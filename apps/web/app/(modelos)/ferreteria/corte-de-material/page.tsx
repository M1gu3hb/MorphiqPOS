import { CorteDeMaterial } from '~/ferreteria/CorteDeMaterial';

/**
 * Cortar material continuo: de qué pieza, cuánto se desperdicia y qué se hace con lo
 * que queda.
 *
 * El material llega en la dirección (`?material=`), que es a donde el mostrador manda
 * con F6. Antes la página abría SIEMPRE el primer material continuo del catálogo
 * (C.10 de la 2.4).
 */
export const dynamic = 'force-dynamic';

/** Sólo un uuid: cualquier otra cosa sería un `where id = …` que Postgres rechaza. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { material } = await searchParams;
  return typeof material === 'string' && UUID.test(material.trim()) ? (
    <CorteDeMaterial materialId={material.trim()} />
  ) : (
    <CorteDeMaterial />
  );
}
