import { validarEntorno } from '@morphiqpos/contracts';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { MenuPublicoYPedidoAnticipado } from '~/cafeteria/MenuPublicoYPedidoAnticipado';
import { ProveedorDeVocabulario } from '~/cliente/vocabulario';
import { negocioDeEstaEntrada } from '~/servidor/entrada';

/**
 * C.14 · EL MENÚ PÚBLICO DE UNA CAFETERÍA, para pedir antes de llegar. Sin sesión.
 *
 * `/n/<slug>/pedir`: el negocio es el de la dirección, dentro de los de este
 * despliegue —igual que su entrada de personal—. Un slug que no sirve este
 * despliegue es 404; uno que no es cafetería lo contesta la ruta del menú, también
 * con 404, y la pantalla dice que el menú no abrió.
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
  // El vocabulario de la CAFETERÍA: sin sesión no hay proveedor, y el neutro decía
  // «se paga al recogerlo en .» —la barra, sin nombre— y «Unidad de Ana».
  return (
    <ProveedorDeVocabulario terminos={{ giro: 'cafeteria', personalizado: {} }}>
      <MenuPublicoYPedidoAnticipado negocio={negocio.slug} />
    </ProveedorDeVocabulario>
  );
}
