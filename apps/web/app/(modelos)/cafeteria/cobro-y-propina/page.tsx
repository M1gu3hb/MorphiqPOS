import { CobroYPropina } from '~/cafeteria/CobroYPropina';

/**
 * El cobro de la barra. Con `?pedido=<orden>` cobra ESA orden —un apartado se cobra
 * al recogerlo (C.14 de la 2.4)—; sin él, la venta por cobrar más antigua.
 */
export const dynamic = 'force-dynamic';

/** Sólo un uuid: cualquier otra cosa sería un filtro que Postgres rechaza. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const { pedido } = await searchParams;
  const pedidoId = typeof pedido === 'string' && UUID.test(pedido.trim()) ? pedido.trim() : null;
  return pedidoId === null ? <CobroYPropina /> : <CobroYPropina pedidoId={pedidoId} />;
}
