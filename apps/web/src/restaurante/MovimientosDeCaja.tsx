'use client';

import { CorteDeTurno } from '~/venta/CorteDeTurno';
import { DevolucionDeVenta } from '~/venta/DevolucionDeVenta';
import { GastoDeCaja } from '~/venta/GastoDeCaja';
import { RetiroDeCaja } from '~/venta/RetiroDeCaja';

/**
 * LO QUE ENTRA Y SALE DEL CAJÓN DEL RESTAURANTE QUE NO ES UN COBRO (día completo del
 * restaurante, 2.4).
 *
 * `02-DINERO-Y-CAJA` §8.3 enumera los movimientos de ESTE cajón —gasto en efectivo,
 * retiro parcial, corte de turno— y §8.4 explica por qué el corte de turno no cierra la
 * caja: dos turnos de mesero y un solo cajón; a las 17:00 la cajera de mediodía entrega su
 * efectivo y a las 18:30 entra la primera mesa de la cena. La caja del modelo no tenía
 * NINGUNO: abría y listaba cuentas. El gas de las 15:40 salía del cajón sin registro
 * —el descuadre 3 del §10—, el retiro de media noche igual, y el turno de mediodía no
 * tenía cómo entregarse sin cerrar el día.
 *
 * Son los MISMOS formularios que la tienda y el salón (`apps/web/src/venta`), con los
 * mismos `id`: una sola versión del retiro, del gasto, de la devolución y del corte de
 * turno. Lo de quien administra —el gasto y la devolución— sólo se enseña si `caja.estado`
 * dice que esta sesión puede; el servidor lo exige igual.
 */
export function MovimientosDeCaja({
  puedeAdministrar,
  alMover,
}: {
  readonly puedeAdministrar: boolean;
  /** Algo entró o salió del cajón: la pantalla relee su turno. */
  readonly alMover: () => void;
}) {
  return (
    <div className="grid items-start gap-(--espacio-4) lg:grid-cols-2">
      {/* El corte de turno es de quien tiene la caja: entrega lo suyo y no cierra. */}
      <CorteDeTurno />
      <RetiroDeCaja alRetirar={alMover} />
      {puedeAdministrar ? (
        <>
          <GastoDeCaja alRegistrar={alMover} />
          <DevolucionDeVenta alDevolver={alMover} />
        </>
      ) : null}
    </div>
  );
}
