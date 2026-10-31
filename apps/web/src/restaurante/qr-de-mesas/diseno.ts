import {
  centrosCompatibles,
  disenoLegible,
  esIdEstiloCentro,
  esIdEstiloModulo,
  esIdEstiloOjo,
  esIdMarco,
  type IdEstiloCentro,
  type IdEstiloModulo,
  type IdEstiloOjo,
  type IdMarco,
} from '@morphiqpos/domain/qr';

import { PAPEL_BLANCO, TINTA_NEGRA } from './colores-del-qr';

/**
 * EL DISEÑO DE LOS QR DE LAS MESAS, del lado de la pantalla (DP-9.8).
 *
 * La misma forma que valida el servidor (`packages/app/src/portal/qr-de-mesas.ts`), que es quien
 * manda: aquí se lee lo guardado sin confiar y se avisa ANTES de guardar lo que el servidor
 * rechazaría. El contenido del QR no es parte del diseño: es siempre la dirección de la mesa.
 */

export const CLAVE_DE_QR_DE_MESAS = 'qr_de_mesas';

export interface DegradadoDelQr {
  readonly modo: 'linear' | 'radial' | 'duo';
  readonly color: string;
  readonly angulo: number;
}

export interface MarcoDelQr {
  readonly tipo: IdMarco;
  /** `{mesa}` se cambia por el número de la mesa. */
  readonly texto: string;
  readonly textoSecundario: string;
  readonly color: string;
  readonly colorTexto: string;
}

export interface DisenoDeQr {
  readonly modulo: IdEstiloModulo;
  readonly ojo: IdEstiloOjo;
  readonly centro: IdEstiloCentro;
  readonly primerPlano: string;
  readonly ojos: string;
  readonly fondo: string;
  readonly degradado: DegradadoDelQr | null;
  readonly conLogo: boolean;
  readonly marco: MarcoDelQr | null;
  /** Ancho impreso de la pieza (el QR con su marco), en milímetros. */
  readonly tamanoMm: number;
}

export interface QrDeMesas {
  readonly general: DisenoDeQr;
  readonly porMesa: Readonly<Record<string, DisenoDeQr>>;
}

/** El QR de siempre: negro sobre blanco, recto, sin logo ni marco, de 6 cm. */
export const DISENO_POR_OMISION: DisenoDeQr = {
  modulo: 'square',
  ojo: 'square',
  centro: 'square',
  primerPlano: TINTA_NEGRA,
  ojos: TINTA_NEGRA,
  fondo: PAPEL_BLANCO,
  degradado: null,
  conLogo: false,
  marco: null,
  tamanoMm: 60,
};

export const TAMANO_MINIMO_MM = 30;
export const TAMANO_MAXIMO_MM = 150;
export const LARGO_DEL_TEXTO_DEL_MARCO = 40;
const HEX = /^#[0-9a-fA-F]{6}$/;

type Leido = Record<string, unknown>;
const esObjeto = (v: unknown): v is Leido => typeof v === 'object' && v !== null;
const esColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
const esTexto = (v: unknown): v is string => typeof v === 'string';

function degradadoLeido(v: unknown): DegradadoDelQr | null | undefined {
  if (v === null) return null;
  if (!esObjeto(v) || !esColor(v['color']) || typeof v['angulo'] !== 'number') return undefined;
  const modo = v['modo'];
  return modo === 'linear' || modo === 'radial' || modo === 'duo'
    ? { modo, color: v['color'], angulo: v['angulo'] }
    : undefined;
}

function marcoLeido(v: unknown): MarcoDelQr | null | undefined {
  if (v === null) return null;
  if (!esObjeto(v) || typeof v['tipo'] !== 'string' || !esIdMarco(v['tipo'])) return undefined;
  const { texto, textoSecundario, color, colorTexto } = v;
  if (!esTexto(texto) || !esTexto(textoSecundario) || !esColor(color) || !esColor(colorTexto))
    return undefined;
  return { tipo: v['tipo'], texto, textoSecundario, color, colorTexto };
}

/** Un diseño leído de lo guardado, o `null` si no tiene la forma. */
function disenoLeido(v: unknown): DisenoDeQr | null {
  if (!esObjeto(v)) return null;
  const { modulo, ojo, centro, primerPlano, ojos, fondo, conLogo, tamanoMm } = v;
  const degradado = degradadoLeido(v['degradado']);
  const marco = marcoLeido(v['marco']);
  const valido =
    typeof modulo === 'string' &&
    esIdEstiloModulo(modulo) &&
    typeof ojo === 'string' &&
    esIdEstiloOjo(ojo) &&
    typeof centro === 'string' &&
    esIdEstiloCentro(centro) &&
    esColor(primerPlano) &&
    esColor(ojos) &&
    esColor(fondo) &&
    typeof conLogo === 'boolean' &&
    typeof tamanoMm === 'number' &&
    degradado !== undefined &&
    marco !== undefined;
  if (!valido) return null;
  const diseno = {
    modulo,
    ojo,
    centro,
    primerPlano,
    ojos,
    fondo,
    degradado,
    conLogo,
    marco,
    tamanoMm,
  };
  return faltaDelDiseno(diseno) === null ? diseno : null;
}

/** Lo guardado, leído sin confiar: lo que no tiene forma es el QR de siempre (o se descarta). */
export function qrDeMesasLeido(valor: unknown): QrDeMesas {
  const leido = esObjeto(valor) ? valor : {};
  const general = disenoLeido(leido['general']) ?? DISENO_POR_OMISION;
  const crudos = esObjeto(leido['porMesa']) ? leido['porMesa'] : {};
  const porMesa: Record<string, DisenoDeQr> = {};
  for (const [mesaId, crudo] of Object.entries(crudos)) {
    const diseno = disenoLeido(crudo);
    if (diseno !== null) porMesa[mesaId] = diseno;
  }
  return { general, porMesa };
}

export function disenoDeLaMesa(qr: QrDeMesas, mesaId: string): DisenoDeQr {
  return qr.porMesa[mesaId] ?? qr.general;
}

export function tieneDisenoPropio(qr: QrDeMesas, mesaId: string): boolean {
  return mesaId in qr.porMesa;
}

export function conDisenoPropio(qr: QrDeMesas, mesaId: string, diseno: DisenoDeQr): QrDeMesas {
  return { general: qr.general, porMesa: { ...qr.porMesa, [mesaId]: diseno } };
}

/** «Restablecer al diseño general»: la mesa sale de las que tienen el suyo. */
export function sinDisenoPropio(qr: QrDeMesas, mesaId: string): QrDeMesas {
  const porMesa = Object.fromEntries(Object.entries(qr.porMesa).filter(([id]) => id !== mesaId));
  return { general: qr.general, porMesa };
}

/** Lo que el servidor rechazaría, dicho antes de guardar; `null` si está bien. */
export function faltaDelDiseno(d: DisenoDeQr): string | null {
  if (!centrosCompatibles(d.ojo).includes(d.centro)) {
    return 'Ese centro no va con ese ojo: elige uno de los que le quedan.';
  }
  const colores = [d.primerPlano, d.ojos, d.fondo, d.degradado?.color ?? TINTA_NEGRA];
  const legible =
    colores.every(esColor) && disenoLegible({ ...d, degradado: d.degradado ?? undefined });
  if (!legible) {
    return 'Con esos colores el QR no se leería: tinta oscura sobre fondo claro, con más contraste.';
  }
  if (
    !Number.isInteger(d.tamanoMm) ||
    d.tamanoMm < TAMANO_MINIMO_MM ||
    d.tamanoMm > TAMANO_MAXIMO_MM
  ) {
    return `El tamaño impreso va de ${String(TAMANO_MINIMO_MM)} a ${String(TAMANO_MAXIMO_MM)} mm.`;
  }
  const textos = d.marco === null ? [] : [d.marco.texto, d.marco.textoSecundario];
  if (textos.some((t) => t.trim().length > LARGO_DEL_TEXTO_DEL_MARCO)) {
    return `Un texto del marco va de hasta ${String(LARGO_DEL_TEXTO_DEL_MARCO)} letras.`;
  }
  return null;
}
