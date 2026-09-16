import { CorteDeMaterial } from '~/ferreteria/CorteDeMaterial';

/**
 * Cortar una medida de una pieza continua, para el mostradorista — en PC y,
 * gemela, en el teléfono, porque el corte se hace junto al rack de rollos.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CorteDeMaterial />;
}
