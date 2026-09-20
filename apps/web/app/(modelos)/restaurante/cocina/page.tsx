import { Cocina } from '~/restaurante/Cocina';

/**
 * El tablero de la cocina: lo que hay que preparar, en qué orden, y el toque
 * que avisa que ya está. Es la pantalla del cocinero y vive encendida todo el
 * turno, así que la página sólo dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cocina />;
}
