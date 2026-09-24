import { validarEntorno } from '@morphiqpos/contracts';
import { rutaDeEntrada } from '@morphiqpos/app/negocio';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import POSLogin from '@/pages/POSLogin';

import { EntradaSinNegocio } from '~/entrada/EntradaSinNegocio';
import { entradaDeEstaPeticion } from '~/servidor/entrada';

/**
 * `/login-pos` sin negocio en la dirección (bloque A de la 2.4).
 *
 * Un despliegue de UN negocio —o un host con el slug— enseña su pantalla de acceso
 * aquí, como siempre. Uno de VARIOS no tiene a quién enseñar: manda a la entrada del
 * negocio que esta caja recuerda o de la que es terminal, y si no es la caja de nadie,
 * pinta la entrada neutra, sin un solo nombre.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const entorno = validarEntorno(process.env);
  const cabeceras = await headers();
  const entrada = await entradaDeEstaPeticion({
    host: cabeceras.get('host'),
    cookies: cabeceras.get('cookie'),
    pedido: null,
    organizacionConfigurada: entorno.ORGANIZACION,
    pimienta: entorno.PIN_PEPPER,
  }).catch(() => null);

  if (entrada === null) return <EntradaSinNegocio />;
  // Lo decidió el despliegue solo (uno, o el host): ésta ES su entrada.
  if (entrada.origen === 'despliegue') return <POSLogin />;
  redirect(rutaDeEntrada(entrada.negocio.slug));
}
