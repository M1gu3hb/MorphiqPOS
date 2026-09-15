import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-401 y F-415 · La duración de un servicio es una SECUENCIA, nunca un número.
 *
 * ── El 25 %–40 % de capacidad que nadie aprovecha ────────────────────────
 * Un tinte son 120 minutos, pero no son 120 minutos de estilista: son 40 de
 * aplicación, 45 de **procesado** en los que la clienta está sentada sola con
 * el tinte puesto, 25 de terminado y 10 de limpieza. Si la agenda bloquea al
 * profesional durante el procesado, el salón atiende 6 clientas al día. Si lo
 * libera, atiende 9 **con la misma gente y el mismo local**.
 *
 * Es la diferencia entre un salón que vive y uno que no, y es la razón por la
 * que este modelo separa DOS rangos:
 *
 *   - `rangoActivo`     — cuándo está ocupado el PROFESIONAL.
 *   - `rangoOcupacion`  — cuándo está ocupada la ESTACIÓN (o el lavabo).
 *
 * Son dos recursos con disponibilidad distinta al mismo tiempo. Un modelo con
 * un solo número no puede expresarlo, y por eso ningún competidor lo aprovecha.
 *
 * ── Por qué se construye como secuencia desde el principio ───────────────
 * Porque «duración total» es un dato que después no se puede partir: si la
 * agenda nace con un entero, meter el tiempo pasivo más tarde obliga a
 * reescribir la agenda entera. Se construye como secuencia aunque la barbería
 * —donde el pasivo es cero— no lo necesite: el mismo modelo sirve para los once
 * vecinos sin una sola rama.
 *
 * ── `factorDuracion` en puntos base ──────────────────────────────────────
 * Karla hace el mismo tinte en 80 minutos y Dany en 110. Con el mismo número la
 * agenda de Karla queda con huecos y la de Dany se recorre todos los días. El
 * factor va en puntos base porque 10000 es «igual que el catálogo» y no hay
 * decimales que redondear a mano.
 */

export interface DuracionDeServicio {
  /** La aplicación. Siempre mayor que cero: un servicio de cero no se agenda. */
  readonly activa1Min: number;
  /** El PROCESADO. Cero en barbería y en consultorio, y el modelo sigue sirviendo. */
  readonly pasivaMin: number;
  /** El terminado, después del procesado. */
  readonly activa2Min: number;
  /** La limpieza de la estación. Ocupa el mueble, no a la persona. */
  readonly cierreMin: number;
}

export interface Tramo {
  readonly tipo: 'activa_1' | 'pasiva' | 'activa_2' | 'cierre';
  readonly inicio: Date;
  readonly fin: Date;
}

export interface Rango {
  readonly inicio: Date;
  readonly fin: Date;
}

export interface CitaPlaneada {
  readonly tramos: readonly Tramo[];
  /** Los minutos en que el PROFESIONAL está ocupado. Puede ser más de un rango. */
  readonly rangosActivos: readonly Rango[];
  /** Desde que empieza hasta que la estación queda limpia. Siempre uno solo. */
  readonly rangoOcupacion: Rango;
  /** Minutos de profesional. Es lo que cuesta de verdad el servicio. */
  readonly minutosActivos: number;
  /** Minutos que el hueco pasivo deja libres para intercalar otra clienta. */
  readonly minutosIntercalables: number;
}

const MS_POR_MINUTO = 60_000;
const PUNTOS_BASE = 10_000;

/**
 * De «un tinte a las 10:00 con Karla» a los cuatro tramos con hora.
 *
 * ── Por qué el CIERRE ocupa la estación y no al profesional ──────────────
 * Porque limpiar el lavabo lo hace quien esté libre, y lo que no se puede es
 * sentar a la siguiente clienta en un lavabo sucio. Contarlo como tiempo del
 * profesional le quitaría diez minutos de agenda por servicio que sí puede
 * trabajar: seis servicios al día son una hora perdida por persona.
 */
export function planearCita(
  duracion: DuracionDeServicio,
  inicio: Date,
  factorDuracionBp = PUNTOS_BASE,
): CitaPlaneada {
  if (duracion.activa1Min <= 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Un servicio sin aplicación no se agenda: la primera parte activa dura algo.',
      { activa1Min: duracion.activa1Min },
    );
  }
  if (duracion.pasivaMin < 0 || duracion.activa2Min < 0 || duracion.cierreMin < 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Ningún tramo de un servicio dura menos que cero.',
    );
  }
  if (duracion.pasivaMin > 0 && duracion.activa2Min <= 0) {
    // Un procesado sin terminado no existe: el tinte se enjuaga y se seca. Una
    // duración así dejaría a la clienta sentada y a nadie esperándola, y el
    // hueco intercalable se calcularía sobre un tramo que nunca termina.
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Un servicio con procesado tiene que tener terminado: alguien enjuaga.',
      { pasivaMin: duracion.pasivaMin, activa2Min: duracion.activa2Min },
    );
  }
  if (!Number.isInteger(factorDuracionBp) || factorDuracionBp <= 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'El factor de duración va en puntos base enteros: 10000 es «igual que el catálogo».',
      { factorDuracionBp },
    );
  }

  // El factor aplica a lo ACTIVO y no al procesado ni a la limpieza: el tinte
  // tarda lo que tarda la química, y Karla no puede acelerarla. Aplicárselo
  // sería prometer que la más rápida procesa más rápido, y a la clienta le
  // quedaría el tono a medias.
  const activa1 = escalar(duracion.activa1Min, factorDuracionBp);
  const activa2 = escalar(duracion.activa2Min, factorDuracionBp);

  const tramos: Tramo[] = [];
  let reloj = inicio;

  reloj = empujar(tramos, 'activa_1', reloj, activa1);
  reloj = empujar(tramos, 'pasiva', reloj, duracion.pasivaMin);
  reloj = empujar(tramos, 'activa_2', reloj, activa2);
  reloj = empujar(tramos, 'cierre', reloj, duracion.cierreMin);

  const rangosActivos = tramos
    .filter((t) => t.tipo === 'activa_1' || t.tipo === 'activa_2')
    .map((t) => ({ inicio: t.inicio, fin: t.fin }));

  return {
    tramos,
    rangosActivos,
    rangoOcupacion: { inicio, fin: reloj },
    minutosActivos: activa1 + activa2,
    // Sólo el procesado es intercalable. La limpieza no: el mueble está ocupado
    // y la siguiente clienta no se puede sentar ahí.
    minutosIntercalables: duracion.pasivaMin,
  };
}

function escalar(minutos: number, factorBp: number): number {
  // Redondeo al minuto más cercano, en enteros. La agenda se pinta en minutos;
  // medio minuto no existe en una rejilla.
  return Math.round((minutos * factorBp) / PUNTOS_BASE);
}

function empujar(tramos: Tramo[], tipo: Tramo['tipo'], desde: Date, minutos: number): Date {
  if (minutos <= 0) return desde;
  const hasta = new Date(desde.getTime() + minutos * MS_POR_MINUTO);
  tramos.push({ tipo, inicio: desde, fin: hasta });
  return hasta;
}

/** `true` si los dos rangos comparten aunque sea un instante. */
export function seEnciman(a: Rango, b: Rango): boolean {
  // Medio abierto por la derecha: una cita que termina a las 11:00 y otra que
  // empieza a las 11:00 NO chocan. Con el cierre incluido, la agenda perdería
  // un hueco de cada dos por un minuto que nadie usa.
  return a.inicio.getTime() < b.fin.getTime() && b.inicio.getTime() < a.fin.getTime();
}

/**
 * ¿Cabe esta cita en la agenda del profesional?
 *
 * ── Por qué se comprueba contra los rangos ACTIVOS ───────────────────────
 * Porque el procesado de la clienta anterior NO ocupa al profesional: ése es el
 * hueco que hace que el salón atienda nueve en vez de seis. Comprobar contra la
 * ocupación completa devolvería la agenda al modelo de un solo número y tiraría
 * la función entera.
 */
export function elProfesionalPuede(nuevos: readonly Rango[], ocupados: readonly Rango[]): boolean {
  return !nuevos.some((nuevo) => ocupados.some((ocupado) => seEnciman(nuevo, ocupado)));
}
