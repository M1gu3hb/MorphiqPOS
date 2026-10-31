import { TelefonoDeCocina } from '~/telefono-de-cocina/TelefonoDeCocina';

/**
 * El teléfono de una estación de cocina (DP-9.4). Público: sin barra lateral y sin sesión; el
 * token del QR que enseña «Conectar teléfono» en la pantalla de Cocina es todo.
 */
export const dynamic = 'force-dynamic';

interface Props {
  readonly params: Promise<{ readonly token: string }>;
}

export default async function Pagina({ params }: Props) {
  const { token } = await params;
  return <TelefonoDeCocina token={token} />;
}
