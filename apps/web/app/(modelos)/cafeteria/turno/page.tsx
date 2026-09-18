import { Turno } from '~/cafeteria/Turno';

/** La caja del mostrador: el barista abre el turno, mueve dinero y lo cierra. */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Turno />;
}
