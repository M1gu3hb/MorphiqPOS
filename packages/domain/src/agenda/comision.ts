import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-440 y F-423 · La comisión, con su regla explícita.
 *
 * ── El dolor 2, y por qué la regla va ANTES que el cálculo ───────────────
 * Hoy la comisión se saca con calculadora el domingo, y es la fuente número uno
 * de pleitos y de rotación en un salón. En pesos es el mayor costo variable del
 * negocio y el que nadie tiene medido.
 *
 * Lo que hace que un cálculo de comisión sea confiable no es la aritmética: es
 * que las CINCO PREGUNTAS estén contestadas por escrito antes de calcular nada.
 * Cuando no lo están, cada quien contesta la suya y el pleito del domingo es
 * inevitable porque los dos tienen razón con su propia respuesta.
 *
 *   1 · ¿Sobre lo COBRADO o sobre el precio de LISTA? Un descuento del 20 %,
 *       ¿lo pone el salón o lo paga también la estilista?
 *   2 · ¿Sobre el IVA o sobre el subtotal?
 *   3 · ¿El material lo pone el salón, se descuenta de la base, o lo paga ella?
 *   4 · Con dos personas en un servicio, ¿se reparte o se lo lleva quien lo tomó?
 *   5 · Un servicio que hay que REHACER, ¿se paga dos veces?
 *
 * ── Por qué la regla se VERSIONA y nunca se edita en sitio ───────────────
 * Cambiar el porcentaje de Dany crea una fila nueva; la anterior se cierra con
 * su vigencia. **Lo ya causado no se recalcula jamás.** Si se editara en sitio,
 * subirle el porcentaje a alguien en marzo le cambiaría lo que ya cobró en
 * enero, y eso convierte una liquidación firmada en una cifra que se mueve.
 */

export type EsquemaComision =
  'porcentaje_fijo' | 'sueldo_mas_comision' | 'escalonado' | 'sin_comision';

/** Pregunta 1 · `mitad` es el reparto salomónico del descuento. */
export type BaseComision = 'cobrado' | 'lista' | 'mitad';
/** Pregunta 3 · F-442. */
export type TratoDelMaterial = 'salon' | 'descuenta_base' | 'cobra_profesional';
/** Pregunta 4 · F-428. */
export type RepartoComision = 'por_servicio' | 'todo_a_quien_tomo';

export interface Escalon {
  /** Hasta cuánto acumulado aplica esta tasa. El último puede ir muy alto. */
  readonly hastaCentavos: bigint;
  readonly tasaBp: number;
}

export interface ReglaComision {
  readonly esquema: EsquemaComision;
  readonly tasaServicioBp: number;
  readonly tasaProductoBp: number;
  readonly base: BaseComision;
  readonly sobreIva: boolean;
  readonly material: TratoDelMaterial;
  readonly reparto: RepartoComision;
  /** Pregunta 5 · F-444. */
  readonly rehacerPaga: boolean;
  /** Sólo en `escalonado`, ordenados de menor a mayor. */
  readonly escalones: readonly Escalon[] | null;
}

export interface LineaComisionable {
  readonly tipo: 'servicio' | 'producto' | 'venta_paquete';
  /** Lo que se cobró de verdad, sin IVA. */
  readonly cobradoSinIvaCentavos: bigint;
  /** El precio de lista, sin IVA. Igual al cobrado cuando no hubo descuento. */
  readonly listaSinIvaCentavos: bigint;
  readonly ivaCentavos: bigint;
  /** Lo que costó el material de cabina que se fue en este servicio. */
  readonly materialCentavos: bigint;
  readonly esRehacer: boolean;
  /** Acumulado del periodo ANTES de esta línea. Sólo lo usa `escalonado`. */
  readonly acumuladoPrevioCentavos: bigint;
}

export interface ComisionCausada {
  readonly baseCentavos: bigint;
  readonly tasaBp: number;
  readonly montoCentavos: bigint;
  readonly materialDescontadoCentavos: bigint;
  /** Cuando el material lo paga ella, esto es lo que se le carga aparte. */
  readonly materialACargoCentavos: bigint;
}

const PUNTOS_BASE = 10_000n;

/**
 * Lo que se le debe a un profesional por UNA línea.
 *
 * ── Por qué nunca sale negativa ──────────────────────────────────────────
 * Un material más caro que la comisión no convierte el servicio en una deuda de
 * la estilista: la comisión llega a cero y el resto del material, si el trato es
 * que ella lo paga, se le carga APARTE y con su nombre. Mezclarlos daría una
 * comisión negativa que en la liquidación se lee como un castigo, y nadie
 * entiende de dónde salió.
 */
export function calcularComision(regla: ReglaComision, linea: LineaComisionable): ComisionCausada {
  if (regla.esquema === 'sin_comision') {
    // Sueldo fijo. No es un caso raro: la recepcionista y la asistente cobran
    // así, y sin este esquema habría que inventarles una tasa de cero que se
    // lee como un error de captura.
    return vacia(linea, regla);
  }

  if (linea.esRehacer && !regla.rehacerPaga) {
    // Pregunta 5. Un servicio que hay que rehacer por mala aplicación no se
    // paga dos veces, y eso tiene que estar escrito ANTES, no discutirse el
    // día que pasa.
    return vacia(linea, regla);
  }

  const base = baseDeCalculo(regla, linea);
  const tasaBp = tasaDe(regla, linea);

  const bruta = (base * BigInt(tasaBp)) / PUNTOS_BASE;
  // El material sólo se descuenta de la comisión cuando el trato es ése. Con
  // `salon` no toca nada, y con `cobra_profesional` sale por su lado.
  const descontado = regla.material === 'descuenta_base' ? linea.materialCentavos : 0n;
  const monto = bruta > descontado ? bruta - descontado : 0n;

  return {
    baseCentavos: base,
    tasaBp,
    montoCentavos: monto,
    materialDescontadoCentavos: regla.material === 'descuenta_base' ? descontado : 0n,
    materialACargoCentavos: regla.material === 'cobra_profesional' ? linea.materialCentavos : 0n,
  };
}

function vacia(linea: LineaComisionable, regla: ReglaComision): ComisionCausada {
  return {
    baseCentavos: 0n,
    tasaBp: 0,
    montoCentavos: 0n,
    materialDescontadoCentavos: 0n,
    // El material a cargo se cobra IGUAL aunque no haya comisión: el producto
    // se fue del almacén. Perdonarlo aquí haría que rehacer saliera gratis para
    // quien lo rehace y caro para el salón, que es el incentivo al revés.
    materialACargoCentavos: regla.material === 'cobra_profesional' ? linea.materialCentavos : 0n,
  };
}

/**
 * Pregunta 1 · ¿Sobre lo cobrado o sobre la lista?
 *
 * ── Por qué `mitad` existe ───────────────────────────────────────────────
 * Es el trato más común y el que nadie modela: el salón da un 20 % de descuento
 * de campaña, y ni lo absorbe entero él ni lo paga entero ella. Sin esta opción,
 * el salón elige una de las dos y la estilista descubre el trato el domingo.
 */
function baseDeCalculo(regla: ReglaComision, linea: LineaComisionable): bigint {
  const conIva = regla.sobreIva ? linea.ivaCentavos : 0n;

  switch (regla.base) {
    case 'cobrado':
      return linea.cobradoSinIvaCentavos + conIva;
    case 'lista':
      return linea.listaSinIvaCentavos + conIva;
    default: {
      // El descuento se parte en dos. División entera hacia abajo: el centavo
      // impar se queda en el salón, y eso se declara en vez de repartirlo al
      // azar según de qué lado caiga el redondeo.
      const media = (linea.cobradoSinIvaCentavos + linea.listaSinIvaCentavos) / 2n;
      return media + conIva;
    }
  }
}

function tasaDe(regla: ReglaComision, linea: LineaComisionable): number {
  if (linea.tipo === 'producto') return regla.tasaProductoBp;
  if (regla.esquema !== 'escalonado') return regla.tasaServicioBp;

  const escalones = regla.escalones;
  if (escalones === null || escalones.length === 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Un esquema escalonado sin escalones no puede calcular nada.',
    );
  }

  // El escalón se decide por lo ACUMULADO ANTES de esta línea, no por la línea.
  // Decidirlo por la línea haría que un servicio de $2,000 pagara al 50 % y uno
  // de $200 al 40 % el mismo día, que no es lo que nadie acordó: el escalón
  // premia el mes, no el ticket.
  for (const escalon of escalones) {
    if (linea.acumuladoPrevioCentavos < escalon.hastaCentavos) return escalon.tasaBp;
  }
  // Por encima del último escalón manda el último: dejarlo en cero castigaría
  // justo al que más vendió.
  return escalones[escalones.length - 1]?.tasaBp ?? regla.tasaServicioBp;
}

export interface ParteDelServicio {
  readonly profesionalId: string;
  /** Qué parte del trabajo hizo, en puntos base. Las partes suman 10000. */
  readonly participacionBp: number;
}

export interface RepartoDeComision {
  readonly profesionalId: string;
  readonly montoCentavos: bigint;
}

/**
 * F-428 · Cuando dos personas tocan el mismo servicio.
 *
 * ── Por qué el reparto se declara y no se supone ─────────────────────────
 * Karla aplica el tinte y Dany lo termina porque Karla salió a comer. Con
 * `todo_a_quien_tomo`, la comisión entera es de quien abrió el servicio; con
 * `por_servicio`, se parte por participación. Las dos son tratos reales y
 * ninguna es «la obvia»: suponer una es tomar partido en el pleito del domingo.
 *
 * ── Por qué el centavo sobrante va a quien más participó ─────────────────
 * Porque tiene que ir a algún lado y repartirlo por orden de lista lo haría
 * caer siempre en la misma persona. Al de mayor participación es la regla que
 * se puede explicar en voz alta sin que nadie la sienta arbitraria.
 */
export function repartirComision(
  montoCentavos: bigint,
  partes: readonly ParteDelServicio[],
  reparto: RepartoComision,
): readonly RepartoDeComision[] {
  if (partes.length === 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Un servicio sin nadie que lo haya hecho no reparte comisión.',
    );
  }

  const primera = partes[0];
  if (primera === undefined) {
    throw new ErrorDominio(CODIGOS_ERROR.CONFIGURACION_INVALIDA, 'Faltan las partes del servicio.');
  }

  if (reparto === 'todo_a_quien_tomo') {
    return [{ profesionalId: primera.profesionalId, montoCentavos }];
  }

  const suma = partes.reduce((a, p) => a + p.participacionBp, 0);
  if (suma !== Number(PUNTOS_BASE)) {
    // Partes que no suman el total repartirían de más o de menos, y la
    // diferencia aparecería en la liquidación sin renglón que la explique.
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Las participaciones de un servicio tienen que sumar exactamente el total.',
      { suma },
    );
  }

  const repartido: RepartoDeComision[] = partes.map((p) => ({
    profesionalId: p.profesionalId,
    montoCentavos: (montoCentavos * BigInt(p.participacionBp)) / PUNTOS_BASE,
  }));

  const sobra = montoCentavos - repartido.reduce((a, r) => a + r.montoCentavos, 0n);
  if (sobra === 0n) return repartido;

  // A quien más participó. Empate: el primero de la lista, que ya es quien tomó
  // el servicio.
  let mayor = 0;
  for (let i = 1; i < partes.length; i += 1) {
    if ((partes[i]?.participacionBp ?? 0) > (partes[mayor]?.participacionBp ?? 0)) mayor = i;
  }
  const ganador = repartido[mayor];
  if (ganador !== undefined) {
    repartido[mayor] = {
      profesionalId: ganador.profesionalId,
      montoCentavos: ganador.montoCentavos + sobra,
    };
  }
  return repartido;
}
