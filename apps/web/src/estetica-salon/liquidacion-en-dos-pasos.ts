/**
 * LA LIQUIDACIÓN EN DOS PASOS: primero se VE, después se PAGA (F-427).
 *
 * «Una vez pagado ya no se discute: se reclama.» La pantalla decía que el comprobante se
 * veía antes de pagar, y el único botón —«Calcular la liquidación»— ya sacaba el dinero
 * del cajón. Aquí viven los dos pasos sin React, para que cada uno tenga su prueba:
 *
 *   1 · `verAntesDePagar` lee la vista previa del servidor —comisión pendiente y la propina
 *       que se le debe— y NO escribe nada;
 *   2 · `pagarLaLiquidacion` paga EXACTAMENTE la propina que se enseñó: si entre los dos
 *       pasos entró otra, se paga en la siguiente; si se entregó por otro lado, el servidor
 *       rechaza pagar de más.
 */

export const RUTA_VISTA_PREVIA = '/api/liquidaciones/vista-previa';
export const RUTA_LIQUIDAR = '/api/liquidaciones';

export type Invocar = <T>(ruta: string, cuerpo: Readonly<Record<string, unknown>>) => Promise<T>;

export interface Periodo {
  readonly desde: string;
  readonly hasta: string;
}

/** Lo que contesta `comision.vista_previa_liquidacion`, en centavos de cadena. */
export interface VistaPrevia {
  readonly profesionalId: string;
  readonly nombreCompleto: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly totalCentavos: string;
  readonly cajaAbierta: boolean;
}

/** El comprobante como lo pinta la pantalla: el de la vista previa o el ya pagado. */
export interface ComprobanteDeLaLiquidacion {
  readonly liquidacionId: string;
  readonly nombreCompleto: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly materialCargadoCentavos: string;
  readonly rentaCentavos: string;
  readonly cobradoPorEllaCentavos: string;
  readonly anticiposCentavos: string;
  readonly totalCentavos: string;
  /** `null` mientras no se paga: es lo que distingue la vista previa del recibo. */
  readonly pagadaEn: string | null;
}

export function verAntesDePagar(
  invocar: Invocar,
  profesionalId: string,
  periodo: Periodo,
): Promise<VistaPrevia> {
  return invocar<VistaPrevia>(RUTA_VISTA_PREVIA, {
    profesionalId,
    periodoDesde: periodo.desde,
    periodoHasta: periodo.hasta,
  });
}

/** La vista previa con la forma del comprobante: sin folio y sin sello de pagada. */
export function comprobanteDeLaVista(vista: VistaPrevia): ComprobanteDeLaLiquidacion {
  return {
    liquidacionId: '',
    nombreCompleto: vista.nombreCompleto,
    comisionCentavos: vista.comisionCentavos,
    propinaCentavos: vista.propinaCentavos,
    materialCargadoCentavos: '0',
    rentaCentavos: '0',
    cobradoPorEllaCentavos: '0',
    anticiposCentavos: '0',
    totalCentavos: vista.totalCentavos,
    pagadaEn: null,
  };
}

/** Paga lo que se enseñó y trae el comprobante sellado. */
export async function pagarLaLiquidacion(
  invocar: Invocar,
  vista: VistaPrevia,
  periodo: Periodo,
): Promise<ComprobanteDeLaLiquidacion> {
  const pagada = await invocar<{ readonly liquidacionId: string }>(RUTA_LIQUIDAR, {
    profesionalId: vista.profesionalId,
    periodoDesde: periodo.desde,
    periodoHasta: periodo.hasta,
    propinaCentavos: Number(vista.propinaCentavos),
  });
  return invocar<ComprobanteDeLaLiquidacion>(
    `${RUTA_LIQUIDAR}/${pagada.liquidacionId}/comprobante`,
    {},
  );
}
