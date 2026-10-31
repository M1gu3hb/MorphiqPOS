/**
 * LAS OPCIONES DE UN QR Y SU VALIDACIÓN.
 *
 * Todo lo que el diseño acepta entra por aquí: se valida una vez, en la frontera, y de aquí sale
 * con los valores por omisión puestos. Después de `resolverOpciones` nadie vuelve a comprobar un
 * color ni un id: o son del catálogo o esto lanzó un error con un mensaje que dice cuál estaba
 * mal.
 */

import {
  esIdEstiloCentro,
  esIdEstiloModulo,
  esIdEstiloOjo,
  type IdEstiloCentro,
  type IdEstiloModulo,
  type IdEstiloOjo,
} from './catalogo.ts';
import { exigirColor } from './contraste.ts';
import { MODOS_DE_DEGRADADO, type Degradado } from './degradados.ts';
import type { FusionDeLogo, ImagenLogo, OpcionesDeLogo } from './logo.ts';
import type { OpcionesDeMarco } from './marcos/lienzo.ts';

/** El logo del centro: la imagen y cómo se acomoda en la ventana. */
export interface LogoDelQr extends OpcionesDeLogo {
  readonly imagen: ImagenLogo;
  /** `integrated`: la imagen tapa la ventana. `weave`: los módulos se tejen por encima. */
  readonly fusion?: FusionDeLogo;
  /** Color detrás de la imagen; por omisión, el fondo del QR. */
  readonly fondo?: string;
}

export interface OpcionesQr {
  /** Módulos de margen alrededor del código. Por omisión 1; el estándar recomienda 4. */
  readonly margen?: number;
  readonly primerPlano?: string;
  readonly fondo?: string;
  /** Color de los ojos; por omisión, el de los módulos. */
  readonly ojos?: string;
  /** Lado del SVG en píxeles. Por omisión 1024. */
  readonly tamano?: number;
  readonly modulo?: IdEstiloModulo;
  readonly ojo?: IdEstiloOjo;
  readonly centro?: IdEstiloCentro;
  readonly degradado?: Degradado;
  /** Con logo, la matriz debe venir con corrección de errores alta (nivel H). */
  readonly logo?: LogoDelQr;
  readonly marco?: OpcionesDeMarco;
}

export interface OpcionesResueltas {
  readonly margen: number;
  readonly tamano: number;
  readonly primerPlano: string;
  readonly fondo: string;
  readonly ojos: string;
  readonly modulo: IdEstiloModulo;
  readonly ojo: IdEstiloOjo;
  readonly centro: IdEstiloCentro;
  readonly degradado: Degradado | undefined;
  readonly logo: LogoDelQr | undefined;
  readonly marco: OpcionesDeMarco | undefined;
}

export const MARGEN_POR_OMISION = 1;
export const MARGEN_MAXIMO = 32;
export const TAMANO_POR_OMISION = 1024;
export const TAMANO_MINIMO = 16;
export const TAMANO_MAXIMO = 16384;

function exigirEnteroEnRango(
  valor: number,
  nombre: string,
  minimo: number,
  maximo: number,
): number {
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new RangeError(`${nombre} debe ser un entero de ${minimo} a ${maximo}; llegó ${valor}.`);
  }
  return valor;
}

function validarDegradado(degradado: Degradado | undefined): Degradado | undefined {
  if (degradado === undefined) return undefined;
  if (!MODOS_DE_DEGRADADO.includes(degradado.modo)) {
    throw new RangeError(`«${degradado.modo}» no es un modo de degradado.`);
  }
  if (!Number.isFinite(degradado.angulo)) {
    throw new RangeError('El ángulo del degradado debe ser un número.');
  }
  exigirColor(degradado.color, 'El segundo color del degradado');
  return degradado;
}

function validarLogo(logo: LogoDelQr | undefined): LogoDelQr | undefined {
  if (logo?.fondo !== undefined) exigirColor(logo.fondo, 'El fondo del logo');
  return logo;
}

function elegirId<T extends string>(
  valor: T | undefined,
  porOmision: T,
  esId: (candidato: string) => candidato is T,
  nombre: string,
): T {
  // Declarado como `string` a propósito: en la rama de error el compilador ya lo da por `never`.
  const elegido: string = valor ?? porOmision;
  if (!esId(elegido)) throw new RangeError(`«${elegido}» no es un ${nombre} del catálogo.`);
  return elegido;
}

/** Valida las opciones y pone los valores por omisión. Lanza `RangeError` con la primera que no sirva. */
export function resolverOpciones(opciones: OpcionesQr): OpcionesResueltas {
  const primerPlano = exigirColor(opciones.primerPlano ?? '#000000', 'El color del QR');
  return {
    margen: exigirEnteroEnRango(
      opciones.margen ?? MARGEN_POR_OMISION,
      'El margen',
      0,
      MARGEN_MAXIMO,
    ),
    tamano: exigirEnteroEnRango(
      opciones.tamano ?? TAMANO_POR_OMISION,
      'El tamaño',
      TAMANO_MINIMO,
      TAMANO_MAXIMO,
    ),
    primerPlano,
    fondo: exigirColor(opciones.fondo ?? '#ffffff', 'El fondo'),
    ojos: exigirColor(opciones.ojos ?? primerPlano, 'El color de los ojos'),
    modulo: elegirId(opciones.modulo, 'square', esIdEstiloModulo, 'estilo de módulo'),
    ojo: elegirId(opciones.ojo, 'square', esIdEstiloOjo, 'estilo de ojo'),
    centro: elegirId(opciones.centro, 'square', esIdEstiloCentro, 'estilo de centro'),
    degradado: validarDegradado(opciones.degradado),
    logo: validarLogo(opciones.logo),
    marco: opciones.marco,
  };
}
