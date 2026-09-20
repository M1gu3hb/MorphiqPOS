import { CobroYPropina } from '~/cafeteria/CobroYPropina';

/**
 * El cobro de la cafetería: la terminal del barista y la segunda pantalla del
 * cliente, que es quien decide la propina sin que nadie se lo pregunte.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CobroYPropina />;
}
