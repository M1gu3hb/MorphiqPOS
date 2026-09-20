import { Cobrar } from '~/cafeteria/Cobrar';

/** La pantalla de inicio del barista: se cobra primero y se prepara después. */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cobrar />;
}
