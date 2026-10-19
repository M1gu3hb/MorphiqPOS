import { validarEntorno } from '@morphiqpos/contracts';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import POSLogin from '@/pages/POSLogin';

import { negocioDeEstaEntrada } from '~/servidor/entrada';

/**
 * LA ENTRADA DE UN NEGOCIO: `/n/<slug>/login-pos` (bloque A de la 2.4).
 *
 * La dirección que el negocio guarda como favorito y que no depende del DNS. Enseña a
 * la gente de ESE negocio y de ningún otro —la lista la pide `POSLogin` a
 * `/api/auth/empleados?negocio=<slug>`, que devuelve sólo la suya—.
 *
 * Un slug que este despliegue no sirve es un 404, exista el negocio o no: las dos
 * respuestas tienen que ser iguales, o esta ruta serviría para averiguar qué negocios
 * hay. Y cuando el host ya nombra un negocio, manda el host: otro slug en la ruta es
 * un 404, no un cambio de negocio.
 *
 * Ningún paso antes del PIN: ni enrolar el equipo ni elegir sucursal.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina({ params }: { params: Promise<{ negocio: string }> }) {
  const { negocio: slug } = await params;
  const entorno = validarEntorno(process.env);
  const cabeceras = await headers();
  const negocio = await negocioDeEstaEntrada({
    host: cabeceras.get('host'),
    cookies: null,
    pedido: slug,
    organizacionConfigurada: entorno.ORGANIZACION,
    pimienta: entorno.PIN_PEPPER,
  }).catch(() => null);

  if (negocio === null) notFound();
  return <POSLogin />;
}
