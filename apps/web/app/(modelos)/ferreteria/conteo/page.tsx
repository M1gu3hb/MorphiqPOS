import { Conteo } from '~/ferreteria/Conteo';

/**
 * Contar por peso, con su rango de confianza.
 *
 * La toma llega en la dirección (`?toma=`), que es a donde Existencias manda al abrirla.
 * Antes la página montaba SIEMPRE la cadena vacía, así que una toma abierta no se podía
 * contar desde ninguna parte (C.8 de la 2.4).
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
  const { toma } = await searchParams;
  const tomaId = typeof toma === 'string' && UUID.test(toma.trim()) ? toma.trim() : '';
  return <Conteo tomaId={tomaId} />;
}
