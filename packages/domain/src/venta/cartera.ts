import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-613, F-616 y F-617 · Lo que le faltaba a la cartera de crédito.
 *
 * ── Las tres puertas de pérdida, y cuál cierra cada función ──────────────
 * «Hoy es una libreta y un talonario de papel carbón, y las tres puertas de
 * pérdida están abiertas»:
 *
 *   1 · se fía sin límite            → F-610, que ya existe
 *   2 · se fía sin plazo             → F-611, que es una columna
 *   3 · nadie sabe cuánto lleva vencido → **esto**: F-613 la mide, F-616 avisa
 *                                         antes, F-617 corta después
 *
 * ── Lo que NO está aquí porque YA EXISTE ─────────────────────────────────
 * `repartirPago` (F-614 y F-615) y `evaluarSalidaACredito` (F-638, F-639) los
 * construyó la etapa 6 en `credito.ts`, y hacen exactamente esto. Escribir aquí
 * una segunda versión habría sido el error que el encargo nombra por su nombre:
 * *«si dos modelos hacen lo mismo, UN código con una perilla»*. Los comandos de
 * `packages/app/src/cartera/` llaman a aquéllas y a éstas.
 *
 * ── Por qué la antigüedad se calcula aquí y no en SQL ────────────────────
 * Porque los tramos son una decisión de producto —0-30, 31-60, 61-90, más de
 * 90— y meterlos en un `case` de una vista los congela en la base. El día que
 * un giro necesite otros tramos, cambiar una vista aplicada es una migración;
 * cambiar esto es una constante.
 */

export interface DocumentoDeCartera {
  readonly id: string;
  readonly folio: string;
  readonly emitidoEn: Date;
  readonly venceEn: Date;
  readonly importeCentavos: bigint;
  readonly saldoCentavos: bigint;
}

/** Los cuatro tramos del giro. Días vencidos, no días de antigüedad. */
export const TRAMOS = ['por_vencer', 'v1_30', 'v31_60', 'v61_90', 'v90_mas'] as const;

export type Tramo = (typeof TRAMOS)[number];

export interface Antiguedad {
  readonly porTramo: Readonly<Record<Tramo, bigint>>;
  readonly totalCentavos: bigint;
  readonly vencidoCentavos: bigint;
  /** Los días vencidos del documento MÁS viejo con saldo. Cero si nada venció. */
  readonly diasDelMasViejo: number;
}

const MS_POR_DIA = 86_400_000;

/**
 * F-613 · La antigüedad de saldos.
 *
 * ── Por qué «por vencer» es un tramo y no una ausencia ───────────────────
 * Porque un cliente con $80 000 por vencer la semana que viene y otro con
 * $80 000 vencidos a 90 días no son el mismo riesgo, y una tabla que sólo
 * enseñara lo vencido los pintaría a los dos con cero. El tramo por vencer es
 * lo que convierte la cartera en una previsión de flujo en vez de en una lista
 * de problemas.
 */
export function antiguedadDeSaldos(
  documentos: readonly DocumentoDeCartera[],
  ahora: Date,
): Antiguedad {
  const porTramo: Record<Tramo, bigint> = {
    por_vencer: 0n,
    v1_30: 0n,
    v31_60: 0n,
    v61_90: 0n,
    v90_mas: 0n,
  };
  let total = 0n;
  let vencido = 0n;
  let diasDelMasViejo = 0;

  for (const documento of documentos) {
    if (documento.saldoCentavos <= 0n) continue;
    const dias = Math.floor((ahora.getTime() - documento.venceEn.getTime()) / MS_POR_DIA);
    const tramo = tramoDe(dias);
    porTramo[tramo] += documento.saldoCentavos;
    total += documento.saldoCentavos;
    if (dias > 0) {
      vencido += documento.saldoCentavos;
      if (dias > diasDelMasViejo) diasDelMasViejo = dias;
    }
  }

  return { porTramo, totalCentavos: total, vencidoCentavos: vencido, diasDelMasViejo };
}

function tramoDe(diasVencidos: number): Tramo {
  if (diasVencidos <= 0) return 'por_vencer';
  if (diasVencidos <= 30) return 'v1_30';
  if (diasVencidos <= 60) return 'v31_60';
  if (diasVencidos <= 90) return 'v61_90';
  return 'v90_mas';
}

/**
 * F-617 · ¿Este cliente está en mora, según su antigüedad?
 *
 * ── Por qué esto es lo ÚNICO que se añade aquí ───────────────────────────
 * Porque `evaluarSalidaACredito` —que E6 ya construyó para F-638 y F-639— ya
 * decide si se puede seguir fiando: mira el límite del cliente, el de la obra y
 * el booleano `bloqueadoPorMora`. Lo que NO sabía es **de dónde sale ese
 * booleano**, y la respuesta es la antigüedad: un cliente está en mora cuando
 * su documento más viejo pasa los días que el negocio tolera.
 *
 * Escribir aquí una segunda función que volviera a mirar el límite habría sido
 * exactamente lo que el encargo prohíbe: dos códigos que hacen lo mismo. Ésta
 * sólo contesta la mitad que faltaba, y el comando compone las dos.
 *
 * ── Y por qué la tolerancia es un parámetro ──────────────────────────────
 * Porque en una tiendita el fiado se cobra el viernes y quince días son una
 * eternidad; en una ferretería con obras a sesenta días, quince días de retraso
 * es martes. Un número fijo aquí serviría a uno de los dos giros.
 */
export function hayMora(antiguedad: Antiguedad, diasTolerados: number): boolean {
  if (!Number.isInteger(diasTolerados) || diasTolerados < 0) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Los días de mora tolerados son un entero de cero para arriba.',
    );
  }
  return antiguedad.diasDelMasViejo > diasTolerados;
}

export interface AvisoDeVencimiento {
  readonly documentoId: string;
  readonly folio: string;
  readonly diasParaVencer: number;
  readonly saldoCentavos: bigint;
}

/**
 * F-616 · Qué avisar, y cuándo.
 *
 * ── Por qué se avisa ANTES y no sólo después ─────────────────────────────
 * Porque un recordatorio el día después del vencimiento es una reclamación, y
 * uno tres días antes es un servicio. La diferencia no es de tono: es que el
 * segundo lo cobra y el primero lo discute.
 */
export function avisosDeVencimiento(
  documentos: readonly DocumentoDeCartera[],
  ahora: Date,
  diasDeAviso = 3,
): readonly AvisoDeVencimiento[] {
  if (!Number.isInteger(diasDeAviso) || diasDeAviso < 0) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Los días de aviso son un entero de cero para arriba.',
    );
  }

  const avisos: AvisoDeVencimiento[] = [];
  for (const documento of documentos) {
    if (documento.saldoCentavos <= 0n) continue;
    const dias = Math.ceil((documento.venceEn.getTime() - ahora.getTime()) / MS_POR_DIA);
    // Lo ya vencido NO entra aquí: eso es cobranza, y tiene su propia pantalla.
    // Mezclarlos haría que el aviso amable llegara con los morosos dentro.
    if (dias < 0 || dias > diasDeAviso) continue;
    avisos.push({
      documentoId: documento.id,
      folio: documento.folio,
      diasParaVencer: dias,
      saldoCentavos: documento.saldoCentavos,
    });
  }
  return avisos.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}
