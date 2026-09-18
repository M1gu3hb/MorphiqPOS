import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-610, F-638 y F-639 · Las tres puertas por las que se pierde el dinero.
 *
 * Es el dolor 1 de una ferretería y es la parte que ningún punto de venta del
 * segmento modela.
 *
 * ── Puerta 1 · Se lo llevó alguien que no estaba autorizado ──────────────
 * El contratista tiene tres albañiles con permiso. El cuarto llega, dice
 * «vengo de parte del inge», se lleva $6,000 y firma con un garabato. Cuando
 * llega la cuenta, el ingeniero la desconoce **y tiene razón**.
 *
 * ── Puerta 2 · No se sabe de qué obra fue ────────────────────────────────
 * Loera lleva tres obras. Le pagaron la de Las Torres y no la de la colonia.
 * Sin separación por obra, el estado de cuenta es un número grande y la
 * conversación de cobro es imposible.
 *
 * ── Puerta 3 · Nadie miró el saldo antes de despachar ────────────────────
 * El material sale a las 7:40 con prisa y el saldo está en una libreta bajo el
 * mostrador. Cuando el dueño lo revisa a las once, ya salió. Por eso esto se
 * evalúa **al elegir al cliente**, no al cobrar: en una venta a crédito NO HAY
 * COBRO, y una comprobación en el cobro es una comprobación que nunca corre.
 *
 * ── Y la regla que gobierna las tres ─────────────────────────────────────
 * **Aviso, no muro.** A veces el nuevo sí viene de parte del inge, y lo que
 * hace falta es una llamada de treinta segundos ANTES de despachar, no un
 * sistema que diga que no. El muro por mora existe, pero siempre hay una llave
 * y siempre es del dueño: un sistema que le impida a Beto surtirle a su mejor
 * cliente en una emergencia es un sistema que se apaga esa misma tarde.
 */

export type Veredicto = 'libre' | 'aviso' | 'requiere_llave';

export type MotivoDeAviso =
  | 'no_autorizado'
  | 'excede_tope_del_autorizado'
  | 'excede_limite_del_cliente'
  | 'excede_limite_de_la_obra'
  | 'cliente_bloqueado_por_mora'
  | 'obra_cerrada';

export interface SalidaACredito {
  readonly importeCentavos: bigint;
  readonly saldoClienteCentavos: bigint;
  /** Cero o menos = sin límite declarado, que es «el dueño lo decide cada vez». */
  readonly limiteClienteCentavos: bigint;
  readonly bloqueadoPorMora: boolean;
  /** `null` cuando la salida no se asignó a ninguna obra. */
  readonly obra: {
    readonly saldoCentavos: bigint;
    readonly limiteCentavos: bigint | null;
    readonly cerrada: boolean;
  } | null;
  /** `null` cuando quien pide NO está en la lista de autorizados. */
  readonly autorizado: {
    readonly activo: boolean;
    readonly topePorSalidaCentavos: bigint | null;
  } | null;
}

export interface Evaluacion {
  readonly veredicto: Veredicto;
  readonly motivos: readonly MotivoDeAviso[];
  /** Lo que quedaría del límite del cliente después de esta salida. */
  readonly disponibleDespuesCentavos: bigint;
}

/**
 * ¿Sale el material, y con qué aviso?
 *
 * ── Por qué la mora es lo único que exige llave ──────────────────────────
 * Porque es la única condición que el dueño YA decidió antes, en frío, sobre un
 * cliente que ya no paga. Lo demás —un autorizado nuevo, un límite rebasado por
 * $300 en una compra de $6,000— son juicios de mostrador que el mostradorista
 * puede tomar con una llamada, y convertirlos en muro haría que el sistema se
 * apagara la primera semana.
 *
 * ── Por qué los motivos se devuelven TODOS ───────────────────────────────
 * Porque «no está en la lista» y «además se pasa del límite» son dos llamadas
 * distintas. Quedarse con el primero obligaría a despachar, chocar con el
 * segundo, y volver a llamar.
 */
export function evaluarSalidaACredito(salida: SalidaACredito): Evaluacion {
  if (salida.importeCentavos <= 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Una salida a crédito de cero no es una salida.',
      { importe: salida.importeCentavos.toString() },
    );
  }

  const motivos: MotivoDeAviso[] = [];

  if (salida.autorizado?.activo !== true) {
    // La puerta 1. NO se bloquea: a veces el nuevo sí viene de parte del inge.
    // Lo que hace falta es que quede escrito quién firmó y que el sistema lo
    // haya dicho antes, no después.
    motivos.push('no_autorizado');
  } else if (
    salida.autorizado.topePorSalidaCentavos !== null &&
    salida.importeCentavos > salida.autorizado.topePorSalidaCentavos
  ) {
    motivos.push('excede_tope_del_autorizado');
  }

  const despues = salida.saldoClienteCentavos + salida.importeCentavos;
  // Un límite en cero es «no declarado», no «no puede llevarse nada». Tratarlo
  // como cero pesos de crédito pondría en aviso a todo cliente nuevo.
  if (salida.limiteClienteCentavos > 0n && despues > salida.limiteClienteCentavos) {
    motivos.push('excede_limite_del_cliente');
  }

  if (salida.obra !== null) {
    if (salida.obra.cerrada) {
      // Cargar a una obra cerrada es cómo el saldo que ya se conversó y se
      // cobró vuelve a moverse meses después.
      motivos.push('obra_cerrada');
    }
    const limiteObra = salida.obra.limiteCentavos;
    if (
      limiteObra !== null &&
      limiteObra > 0n &&
      salida.obra.saldoCentavos + salida.importeCentavos > limiteObra
    ) {
      motivos.push('excede_limite_de_la_obra');
    }
  }

  if (salida.bloqueadoPorMora) motivos.push('cliente_bloqueado_por_mora');

  return {
    veredicto: veredictoDe(motivos),
    motivos,
    disponibleDespuesCentavos:
      salida.limiteClienteCentavos > 0n ? salida.limiteClienteCentavos - despues : 0n,
  };
}

function veredictoDe(motivos: readonly MotivoDeAviso[]): Veredicto {
  if (motivos.includes('cliente_bloqueado_por_mora')) return 'requiere_llave';
  return motivos.length === 0 ? 'libre' : 'aviso';
}

export interface DocumentoPorCobrar {
  readonly id: string;
  /** Lo que queda por pagar de este documento. */
  readonly saldoCentavos: bigint;
  readonly fecha: Date;
}

export interface AplicacionDePago {
  readonly documentoId: string;
  readonly montoCentavos: bigint;
}

export interface RepartoDePago {
  readonly aplicaciones: readonly AplicacionDePago[];
  /** Lo que sobra cuando el pago excede lo que se debe. Queda a favor. */
  readonly sobranteCentavos: bigint;
}

/**
 * F-614 · A qué documentos se aplica un pago.
 *
 * ── Por qué el más viejo primero ─────────────────────────────────────────
 * Porque es lo que hace que la antigüedad de la cartera signifique algo: si el
 * pago se aplicara al más nuevo, el documento de hace noventa días seguiría ahí
 * para siempre y el reporte de antigüedad diría que el cliente está peor de lo
 * que está.
 *
 * ── Por qué el cliente puede indicar documentos ──────────────────────────
 * Porque a veces le pagaron UNA obra y quiere que se aplique a ésa, y ésa es
 * justo la conversación que F-639 vino a hacer posible. Cuando indica, manda su
 * lista; cuando no, manda la antigüedad.
 */
export function repartirPago(
  montoCentavos: bigint,
  documentos: readonly DocumentoPorCobrar[],
): RepartoDePago {
  if (montoCentavos <= 0n) {
    throw new ErrorDominio(CODIGOS_ERROR.CONFIGURACION_INVALIDA, 'Un pago de cero no abona nada.', {
      monto: montoCentavos.toString(),
    });
  }

  const vivos = [...documentos].filter((d) => d.saldoCentavos > 0n).sort(compararPorAntiguedad);

  const aplicaciones: AplicacionDePago[] = [];
  let restante = montoCentavos;

  for (const documento of vivos) {
    if (restante === 0n) break;
    const aplicado = restante < documento.saldoCentavos ? restante : documento.saldoCentavos;
    aplicaciones.push({ documentoId: documento.id, montoCentavos: aplicado });
    restante -= aplicado;
  }

  // El sobrante NO se reparte entre los documentos ya saldados ni se pierde:
  // queda a favor del cliente. Repartirlo produciría documentos con saldo
  // negativo, y el estado de cuenta dejaría de sumarse.
  return { aplicaciones, sobranteCentavos: restante };
}

function compararPorAntiguedad(a: DocumentoPorCobrar, b: DocumentoPorCobrar): number {
  const diferencia = a.fecha.getTime() - b.fecha.getTime();
  if (diferencia !== 0) return diferencia;
  // Empate de fecha: por id, para que dos repartos del mismo pago salgan
  // iguales. Sin desempate estable, aplicar dos veces daría dos resultados.
  return a.id.localeCompare(b.id);
}
