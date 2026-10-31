/**
 * EL DISEÑO DE CÓDIGOS QR EN SVG.
 *
 * Entra una matriz (la codificación la hace quien llama) y un diseño; sale el texto de un SVG:
 * módulos con 18 formas, ojos y centros, degradado, logo en el centro y 43 marcos. Puro: sin
 * DOM, sin canvas, sin archivos.
 *
 * Geometría portada de `M1gu3hb/Morphiq-QRs` (el repositorio del propio autor, implementación
 * original). No se copió código de terceros.
 */

export {
  ESTILOS_DE_CENTRO,
  ESTILOS_DE_MODULO,
  ESTILOS_DE_OJO,
  PRESETS,
  centrosCompatibles,
  esIdEstiloCentro,
  esIdEstiloModulo,
  esIdEstiloOjo,
  type EstiloDeCentro,
  type EstiloDeModulo,
  type EstiloDeOjo,
  type FamiliaDeModulo,
  type IdEstiloCentro,
  type IdEstiloModulo,
  type IdEstiloOjo,
  type Preset,
} from './catalogo.ts';
export { CONTRASTE_MINIMO, esColorHex, luminancia, tieneColoresLegibles } from './contraste.ts';
export {
  MODOS_DE_DEGRADADO,
  disenoLegible,
  type ColoresDelDiseno,
  type Degradado,
  type ModoDeDegradado,
} from './degradados.ts';
export { prefijarIds } from './ids-unicos.ts';
export {
  fragmentoDeLogo,
  geometriaDeLogo,
  type AjusteDeLogo,
  type FormaDeVentana,
  type FusionDeLogo,
  type GeometriaDeLogo,
  type ImagenLogo,
  type ModoDeDesplazamiento,
  type OpcionesDeLogo,
} from './logo.ts';
export * from './marcos/index.ts';
export {
  VERSION_MAXIMA,
  VERSION_MINIMA,
  matrizDesdeFilas,
  posicionesDeAlineacion,
  tamanoDeVersion,
  type MatrizQr,
} from './matriz.ts';
export type { LogoDelQr, OpcionesQr } from './opciones.ts';
export { esModuloProtegido } from './protegidos.ts';
export { renderizarQrSvg } from './renderizar.ts';
export { escaparXml } from './xml.ts';
