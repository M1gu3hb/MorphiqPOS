import { validarEntorno } from '@morphiqpos/contracts';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { MenuPublicoYPedidoAnticipado } from '~/cafeteria/MenuPublicoYPedidoAnticipado';
import { negocioDeEstaEntrada } from '~/servidor/entrada';

/**
 * El menú público visto desde dentro: el MISMO que ve la clienta en
 * `/n/<slug>/pedir`, del negocio de esta sesión. Aparta de verdad, por las mismas
 * rutas públicas (C.14 de la 2.4).
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const entorno = validarEntorno(process.env);
  const cabeceras = await headers();
  const negocio = await negocioDeEstaEntrada({
    host: cabeceras.get('host'),
    cookies: cabeceras.get('cookie'),
    pedido: null,
    organizacionConfigurada: entorno.ORGANIZACION,
    pimienta: entorno.PIN_PEPPER,
  }).catch(() => null);

  if (negocio === null) notFound();
  return <MenuPublicoYPedidoAnticipado negocio={negocio.slug} />;
}
