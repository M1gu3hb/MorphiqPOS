/**
 * QUIÉN DA CADA SERVICIO, con su factor y su precio propio (F-423; C.10 de la 2.4).
 *
 * `servicios_profesional` decide si la agenda deja agendar un servicio con alguien
 * —sin la fila, «esa persona no da ese servicio»— y nadie la escribía: sólo la semilla.
 * El catálogo lo edita aquí, una fila por profesional: si lo da, en cuánto tiempo
 * respecto al del catálogo (Karla hace el tinte en el 80 %, Dany en el 110 %) y si lo
 * cobra distinto.
 */

export interface ProfesionalDelSalon {
  readonly id: string;
  readonly nombre_corto: string | null;
  readonly activo: boolean | null;
}

export interface AsignacionGuardada {
  readonly servicioId: string;
  readonly profesionalId: string;
  readonly precioCentavos: string | null;
  readonly factorDuracionBp: number;
}

export interface AsignacionEditable {
  readonly profesionalId: string;
  readonly nombre: string;
  readonly da: boolean;
  /** En por ciento, como se teclea: «80». */
  readonly factorPorciento: string;
  /** Centavos; nulo = el precio del catálogo. */
  readonly precioCentavos: number | null;
}

/** El límite del `check` de la 131: del 25 % al 400 % del tiempo del catálogo. */
export const FACTOR_MINIMO = 25;
export const FACTOR_MAXIMO = 400;

/**
 * Las activas del salón, cada una con lo que ya tiene guardado para este servicio. Un
 * servicio nuevo no lo da nadie todavía: se marca a mano.
 */
export function asignacionesParaEditar(
  profesionales: readonly ProfesionalDelSalon[],
  guardadas: readonly AsignacionGuardada[],
): AsignacionEditable[] {
  const porPersona = new Map(guardadas.map((a) => [a.profesionalId, a]));
  return profesionales
    .filter((p) => p.activo !== false)
    .map((p) => {
      const guardada = porPersona.get(p.id);
      return {
        profesionalId: p.id,
        nombre: p.nombre_corto ?? 'Sin nombre',
        da: guardada !== undefined,
        factorPorciento: String((guardada?.factorDuracionBp ?? 10_000) / 100),
        precioCentavos:
          guardada?.precioCentavos === undefined || guardada.precioCentavos === null
            ? null
            : Number(guardada.precioCentavos),
      };
    });
}

export interface AsignacionParaGuardar {
  readonly profesionalId: string;
  readonly precioCentavos: number | null;
  readonly factorDuracionBp: number;
}

/**
 * Las que lo dan, como las pide `servicios.guardar`; o el problema con palabras. El factor
 * se teclea en por ciento y viaja en puntos base: «80» son 8000.
 */
export function asignacionesParaGuardar(
  editables: readonly AsignacionEditable[],
):
  | { readonly ok: true; readonly asignaciones: AsignacionParaGuardar[] }
  | { readonly ok: false; readonly problema: string } {
  const asignaciones: AsignacionParaGuardar[] = [];
  for (const a of editables) {
    if (!a.da) continue;
    const porciento = Number(a.factorPorciento.replace(',', '.'));
    if (!Number.isFinite(porciento) || porciento < FACTOR_MINIMO || porciento > FACTOR_MAXIMO) {
      return {
        ok: false,
        problema: `El tiempo de ${a.nombre} va del ${String(FACTOR_MINIMO)} al ${String(FACTOR_MAXIMO)} % del catálogo.`,
      };
    }
    asignaciones.push({
      profesionalId: a.profesionalId,
      precioCentavos: a.precioCentavos,
      factorDuracionBp: Math.round(porciento * 100),
    });
  }
  return { ok: true, asignaciones };
}

/** Los minutos que le toma a ESA persona lo que la ocupa: el factor sobre lo activo. */
export function minutosConFactor(minutosActivos: number, factorPorciento: string): number | null {
  const porciento = Number(factorPorciento.replace(',', '.'));
  if (!Number.isFinite(porciento) || porciento <= 0) return null;
  return Math.round((minutosActivos * porciento) / 100);
}
