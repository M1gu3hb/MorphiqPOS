/**
 * LO QUE `caja.estado` CONTESTA, como lo pinta la pantalla de Caja del mostrador.
 *
 * ── El defecto que esto arregla (día completo de la tienda, 2.4) ─────────────────
 * La pantalla leía `fondoEsperadoCentavos`, `fondoMonedasCentavos` y
 * `fondoChicosCentavos`, y el comando NO devuelve ninguno de los tres: devuelve el
 * esperado (`efectivoEsperadoCentavos`, sólo si se le pregunta con lo contado) y el
 * fondo por montones (`fondoDesglosado`). Con la caja abierta, «Lo que debería haber»
 * salía «$NaN.NaN» en la tienda y en la ferretería, que comparten esta caja; las
 * pruebas de la pantalla le pasaban el estado ya armado y nunca hablaban con el
 * comando. Y la hora de apertura se leía del texto ISO, en UTC: «abierta desde las
 * 06:40» a las doce y cuarenta de la noche.
 *
 * Aquí se traduce UNA vez, y su prueba lo hace con el TIPO del comando: si el comando
 * cambia de forma, falla la compilación y no la pantalla.
 */

/** Lo que devuelve `caja.estado` (`packages/app/src/caja/consulta.ts`), lo que aquí se lee. */
export interface EstadoCajaDelServidor {
  readonly abierta: boolean;
  readonly puedeAdministrar?: boolean;
  readonly sesionCajaId: string | null;
  readonly abiertaEn: string | null;
  readonly fondoInicialCentavos: string;
  readonly efectivoEsperadoCentavos?: string;
  readonly fondoDesglosado?: {
    readonly monedasCentavos: string;
    readonly chicosCentavos: string;
    readonly grandesCentavos: string;
  } | null;
}

/** Lo que pinta la pantalla. */
export interface EstadoDeCaja {
  readonly sesionCajaId: string | null;
  /** Lo que debería haber en el cajón AHORA: el fondo más todo lo que entró y salió. */
  readonly fondoEsperadoCentavos: string;
  /** `null` cuando la caja se abrió sin desglose: decirlo es más honesto que inventarlo. */
  readonly fondoMonedasCentavos: string | null;
  readonly fondoChicosCentavos: string | null;
  readonly abiertaEn: string | null;
  /** Si se le enseñan el gasto y la devolución (el servidor lo exige igual). */
  readonly puedeAdministrar: boolean;
}

/**
 * Cómo se le pregunta: con lo contado en cero, que es lo único que hace que el comando
 * devuelva el esperado. Aquí no se arquea nada: la diferencia que sale se ignora.
 */
export const PREGUNTA_DEL_ESTADO = { efectivoContadoCentavos: 0 } as const;

export function estadoDeLaPantalla(servidor: EstadoCajaDelServidor): EstadoDeCaja {
  const desglose = servidor.fondoDesglosado ?? null;
  return {
    // Cerrada, `caja.estado` ya la manda en `null`: no se repite aquí la regla.
    sesionCajaId: servidor.sesionCajaId,
    fondoEsperadoCentavos: servidor.efectivoEsperadoCentavos ?? servidor.fondoInicialCentavos,
    fondoMonedasCentavos: desglose?.monedasCentavos ?? null,
    fondoChicosCentavos: desglose?.chicosCentavos ?? null,
    abiertaEn: servidor.abiertaEn,
    puedeAdministrar: servidor.puedeAdministrar ?? false,
  };
}

/**
 * La hora de apertura en el reloj de quien la lee, no en UTC. `zonaHoraria` sólo la pasa
 * la prueba, para no depender del reloj de la máquina que la corre.
 */
export function horaDeApertura(iso: string | null, zonaHoraria?: string): string {
  if (iso === null) return '';
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(zonaHoraria === undefined ? {} : { timeZone: zonaHoraria }),
  });
}
