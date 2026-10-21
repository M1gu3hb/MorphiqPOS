import { ErrorDominio } from '@morphiqpos/contracts';

/**
 * Los días y las horas del historial, en la hora de Ciudad de México.
 *
 * ── Por qué un módulo para esto ─────────────────────────────────────────────
 * Un servidor de Vercel corre en UTC. Una venta de las 22:30 en México es de las 04:30 del
 * DÍA SIGUIENTE en UTC: sembrar el historial con `toISOString().slice(0, 10)` pondría las
 * ventas de la noche en el día equivocado, y el corte del lunes "tendría" ventas del martes.
 * Aquí todo se arma a partir del día local y se convierte al instante UTC al final, con el
 * desfase que `Intl` conoce para ESE instante —así no se supone que México no cambia de hora—.
 */

export const ZONA_DEL_HISTORIAL = 'America/Mexico_City';

const FORMA_DE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILISEGUNDOS_POR_MINUTO = 60_000;
const MILISEGUNDOS_POR_DIA = 86_400_000;

/** Un día de calendario `YYYY-MM-DD` que de verdad existe. */
export function esDiaValido(dia: string): boolean {
  const partes = FORMA_DE_DIA.exec(dia);
  if (partes === null) return false;
  const [, anio, mes, diaDelMes] = partes;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(diaDelMes), 12));
  return fecha.toISOString().slice(0, 10) === dia;
}

export function exigirDia(dia: string, nombre: string): void {
  if (!esDiaValido(dia)) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', `«${nombre}» debe ser un día YYYY-MM-DD.`, {
      motivo: 'dia_invalido',
      recibido: dia,
    });
  }
}

/** Mediodía UTC de un día: lejos de cualquier cambio de día al sumar o restar horas. */
function mediodiaUtc(dia: string): number {
  const partes = FORMA_DE_DIA.exec(dia);
  if (partes === null) throw new RangeError(`Día inválido: ${dia}`);
  const [, anio, mes, diaDelMes] = partes;
  return Date.UTC(Number(anio), Number(mes) - 1, Number(diaDelMes), 12);
}

/** El día que está `n` días después (o antes, si `n` es negativo). */
export function sumarDias(dia: string, n: number): string {
  return new Date(mediodiaUtc(dia) + n * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado, del DÍA de calendario (no depende de ninguna zona). */
export function diaDeLaSemana(dia: string): number {
  return new Date(mediodiaUtc(dia)).getUTCDay();
}

/** Los `cantidad` días que terminan en `hasta`, del más viejo al más reciente. */
export function ventanaDeDias(hasta: string, cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, i) => sumarDias(hasta, i - (cantidad - 1)));
}

/** El día de calendario que es `instante` en la zona dada. */
export function diaDeInstante(instante: Date, zona: string = ZONA_DEL_HISTORIAL): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Cuántos minutos va la hora de pared de la zona por delante de UTC en ese instante. */
function desfaseEnMinutos(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const numero = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(
    numero('year'),
    numero('month') - 1,
    numero('day'),
    numero('hour'),
    numero('minute'),
    numero('second'),
  );
  const segundosExactos = Math.floor(instante.getTime() / 1000) * 1000;
  return Math.round((comoUtc - segundosExactos) / MILISEGUNDOS_POR_MINUTO);
}

/**
 * El instante UTC en que el reloj de la zona marca `minutos` después de la medianoche de `dia`.
 * Se aplica el desfase dos veces: la primera con el del instante "ingenuo", la segunda con el
 * del resultado, que es el que de verdad rige a esa hora.
 */
export function instanteLocal(
  dia: string,
  minutos: number,
  zona: string = ZONA_DEL_HISTORIAL,
): Date {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number);
  const ingenuo =
    Date.UTC(anio ?? 0, (mes ?? 1) - 1, diaDelMes ?? 1) + minutos * MILISEGUNDOS_POR_MINUTO;
  const primero = ingenuo - desfaseEnMinutos(new Date(ingenuo), zona) * MILISEGUNDOS_POR_MINUTO;
  return new Date(ingenuo - desfaseEnMinutos(new Date(primero), zona) * MILISEGUNDOS_POR_MINUTO);
}

/** Los minutos desde la medianoche local para una hora `HH:MM`. */
export function minutosDe(hora: number, minuto = 0): number {
  return hora * 60 + minuto;
}
