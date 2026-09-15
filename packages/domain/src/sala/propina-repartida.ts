import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import { repartirPorPesos, type Centavos } from '../dinero/index.ts';

/**
 * F-242 y F-325 · A quién le toca esta propina.
 *
 * ── Dos repartos distintos, la misma exigencia ─────────────────────────────
 * F-325 parte la propina de UNA cuenta entre los meseros que la atendieron;
 * F-242 parte el POOL del turno entre los puestos del acuerdo. Los dos tienen
 * que sumar exactamente lo que había: repartir $5,000 y que sumen $4,999 no es
 * un error de redondeo, es un pleito.
 */

/** Un tramo de atención: quién tuvo la cuenta y cuánto consumo levantó. */
export interface TramoDeAtencion {
  readonly empleadoId: string;
  readonly consumoInicioCentavos: bigint;
  /** Nulo mientras el tramo sigue abierto: se cierra con el consumo del final. */
  readonly consumoFinCentavos: bigint | null;
}

export interface ParteDeTramo {
  readonly empleadoId: string;
  readonly propinaCentavos: bigint;
}

/**
 * F-325 · Reparte la propina de una cuenta entre quienes la atendieron.
 *
 * ── Por consumo levantado, no por minutos ──────────────────────────────────
 * Es la decisión que importa. Una mesa que estuvo dos horas con el café después
 * del relevo no le debe propina a quien la relevó: el trabajo que generó ese
 * importe ya estaba hecho. Repartir por tiempo le pagaría al segundo mesero por
 * esperar, y al primero le quitaría lo que sí levantó.
 *
 * Cuando ningún tramo levantó nada —la cuenta se cerró tal como estaba— se
 * reparte por partes iguales entre los tramos: los dos estuvieron, ninguno
 * vendió, y dejarle todo al primero sería tan arbitrario como dárselo al
 * último.
 *
 * `consumoFinCentavos` nulo es el tramo vigente: se cierra contra el consumo
 * final que se le pase, que es el de la cuenta al cobrarla.
 */
export function repartirPropinaPorTramos(
  propinaCentavos: bigint,
  tramos: readonly TramoDeAtencion[],
  consumoFinalCentavos: bigint,
): readonly ParteDeTramo[] {
  if (tramos.length === 0) return [];
  if (tramos.length === 1) {
    const unico = tramos[0];
    return unico === undefined ? [] : [{ empleadoId: unico.empleadoId, propinaCentavos }];
  }

  const levantado = tramos.map((tramo) => {
    const fin = tramo.consumoFinCentavos ?? consumoFinalCentavos;
    const delta = fin - tramo.consumoInicioCentavos;
    // Un delta negativo sólo puede venir de una anulación posterior al tramo.
    // Cuenta como cero: quien anuló no «desvendió», simplemente no levantó nada.
    return delta > 0n ? delta : 0n;
  });

  const total = levantado.reduce((a, b) => a + b, 0n);
  const pesos =
    total === 0n ? tramos.map(() => 1) : levantado.map((v) => Number((v * 1000n) / total));

  const trozos = repartirPorPesos(propinaCentavos as Centavos, pesos);
  return tramos.map((tramo, i) => ({
    empleadoId: tramo.empleadoId,
    propinaCentavos: trozos[i] ?? 0n,
  }));
}

/** Un beneficiario del pool, con el puesto y los puntos del acuerdo. */
export interface BeneficiarioDePool {
  readonly empleadoId: string;
  readonly puesto: string;
  /** Puntos del puesto, en centésimas: `numeric(6,2)` sin coma flotante. */
  readonly puntosCentesimas: number;
}

export interface ParteDelPool {
  readonly empleadoId: string;
  readonly puesto: string;
  readonly puntosCentesimas: number;
  readonly montoCentavos: bigint;
}

/**
 * F-242 · Reparte el pool del turno por puntos.
 *
 * ── El pool, no cada cuenta ────────────────────────────────────────────────
 * El acuerdo es «de lo que entre esta noche, tantos puntos a cocina». Repartir
 * cuenta por cuenta daría un número distinto por redondeo en cada una y la suma
 * no cuadraría contra el total liquidado, que es el número que el mesero mira.
 *
 * ── Los puntos son del PUESTO ──────────────────────────────────────────────
 * No de la persona. El acuerdo se firma con el puesto y sobrevive a que alguien
 * se vaya; quien entra a lavaloza entra con los puntos de lavaloza.
 *
 * ── El centavo que sobra ───────────────────────────────────────────────────
 * Lo decide `repartirPorPesos` por residuo mayor, que con pesos proporcionales
 * lo lleva casi siempre al de más puntos. Lo que este orden aporta no es eso
 * —lo comprobé mutándolo y ninguna prueba se puso roja— sino **el desempate
 * cuando dos puestos tienen los mismos puntos**: sin él lo decidiría el orden
 * en que llegó la lista, y dos noches con la misma plantilla repartirían
 * distinto. Un reparto que cambia entre ejecuciones no se puede defender.
 */
export function repartirPoolPorPuntos(
  totalCentavos: bigint,
  beneficiarios: readonly BeneficiarioDePool[],
): readonly ParteDelPool[] {
  if (beneficiarios.length === 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.LIQUIDACION_INVALIDA,
      'Un reparto por puntos necesita al menos un beneficiario.',
    );
  }

  const totalPuntos = beneficiarios.reduce((a, b) => a + b.puntosCentesimas, 0);
  if (totalPuntos <= 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.LIQUIDACION_INVALIDA,
      'Ese esquema reparte cero puntos: nadie recibiría nada y el total quedaría sin repartir.',
    );
  }

  // Orden estable: más puntos primero y, a igualdad, el id. Ver el docblock.
  const orden = beneficiarios
    .map((b, i) => ({ b, i }))
    .sort((x, y) =>
      x.b.puntosCentesimas === y.b.puntosCentesimas
        ? x.b.empleadoId.localeCompare(y.b.empleadoId)
        : y.b.puntosCentesimas - x.b.puntosCentesimas,
    );

  const trozos = repartirPorPesos(
    totalCentavos as Centavos,
    orden.map(({ b }) => b.puntosCentesimas),
  );

  const partes: ParteDelPool[] = [];
  for (const [posicion, { b }] of orden.entries()) {
    partes.push({
      empleadoId: b.empleadoId,
      puesto: b.puesto,
      puntosCentesimas: b.puntosCentesimas,
      montoCentavos: trozos[posicion] ?? 0n,
    });
  }
  return partes;
}
