/**
 * EL CATÁLOGO DE MARCOS: 43 DISEÑOS PARA ENMARCAR EL CÓDIGO.
 *
 * Un marco rodea al QR con una etiqueta, un boleto, un sello, un globo... y le pone hasta tres
 * textos («Escanéame», «Abre tu cámara», «morphiq.com.mx»). Los ids son los del motor original y
 * son la clave estable; el nombre es sólo lo que se enseña. `textos` dice cuántos de los tres
 * usa el diseño, para que la pantalla pida sólo esos.
 */

export type GrupoDeMarco =
  | 'Etiquetas'
  | 'Esenciales'
  | 'Boletos'
  | 'Sellos'
  | 'Globos'
  | 'Círculos'
  | 'Laterales'
  | 'Tarjetas'
  | 'Flechas'
  | 'Dispositivos';

type Terna = readonly [string, string, string];

interface MarcoBase<I extends string> {
  readonly id: I;
  readonly nombre: string;
  readonly grupo: GrupoDeMarco;
  /** Cuántos de los tres textos usa el diseño: 1, 2 o 3. */
  readonly textos: 1 | 2 | 3;
  /** Lo que dice el marco mientras nadie escriba otra cosa: principal, secundario y pie. */
  readonly ejemplo: Terna;
  /** Cómo llamar a cada uno de los tres campos de texto en la pantalla. */
  readonly etiquetas: Terna;
}

const EJEMPLO_CORTO: Terna = ['ESCANEA\nAQUÍ', '', ''];
const EJEMPLO_EDITORIAL: Terna = ['Escanea para\ndescubrir más', 'MORPHIQ', 'Todo comienza aquí'];
const EJEMPLO_COMUN: Terna = ['Escanéame', 'Abre tu cámara', 'morphiq.com.mx'];
const ETIQUETAS_EDITORIALES: Terna = [
  'Llamada principal',
  'Nombre o código',
  'Descripción inferior',
];
const ETIQUETAS_COMUNES: Terna = ['Texto principal', 'Texto secundario', 'Texto inferior'];

function marco<I extends string>(
  id: I,
  nombre: string,
  grupo: GrupoDeMarco,
  textos: 1 | 2 | 3 = 1,
): MarcoBase<I> {
  const editorial = id.startsWith('discover-');
  return {
    id,
    nombre,
    grupo,
    textos,
    ejemplo: id === 'scan-bold' ? EJEMPLO_CORTO : editorial ? EJEMPLO_EDITORIAL : EJEMPLO_COMUN,
    etiquetas: editorial ? ETIQUETAS_EDITORIALES : ETIQUETAS_COMUNES,
  };
}

export const MARCOS = [
  marco('band', 'Banda inferior', 'Etiquetas'),
  marco('top', 'Cabecera', 'Etiquetas'),
  marco('outline', 'Contorno recto', 'Esenciales'),
  marco('corners', 'Visor de esquinas', 'Esenciales'),
  marco('ticket', 'Boleto vertical', 'Boletos'),
  marco('ribbon', 'Listón en punta', 'Sellos'),
  marco('speech', 'Globo sólido', 'Globos'),
  marco('circle', 'Órbita', 'Círculos'),
  marco('side', 'Texto vertical', 'Laterales'),
  marco('badge', 'Insignia', 'Sellos'),
  marco('notch', 'Etiqueta biselada', 'Etiquetas'),
  marco('minimal', 'Línea editorial', 'Esenciales'),
  marco('double', 'Doble contorno', 'Esenciales'),
  marco('rounded', 'Tarjeta redonda', 'Tarjetas'),
  marco('wave-stamp', 'Sello ondulado', 'Sellos'),
  marco('discover-portrait', 'Tarjeta editorial vertical', 'Tarjetas', 3),
  marco('scan-bold', 'Llamada en dos líneas', 'Tarjetas'),
  marco('ticket-wide', 'Boleto perforado lateral', 'Boletos'),
  marco('bookmark-circle', 'Marcador circular', 'Sellos'),
  marco('arrow-curved', 'Flecha envolvente', 'Flechas'),
  marco('discover-landscape', 'Tarjeta editorial horizontal', 'Tarjetas', 3),
  marco('bubble-top-right', 'Globo superior derecho', 'Globos'),
  marco('bubble-bottom', 'Globo inferior', 'Globos'),
  marco('bubble-top-left', 'Globo superior izquierdo', 'Globos'),
  marco('label-pointer', 'Etiqueta con flechas', 'Flechas'),
  marco('bubble-outline', 'Globo de contorno', 'Globos'),
  marco('banner-phone', 'Banner con teléfono', 'Dispositivos', 2),
  marco('phone-side', 'Teléfono con llamada lateral', 'Dispositivos', 2),
  marco('label-bottom', 'Etiqueta separada', 'Etiquetas'),
  marco('tab-top', 'Pestaña superior', 'Etiquetas'),
  marco('banner-compact', 'Banner compacto', 'Dispositivos', 2),
  marco('brackets-side', 'Visor con llamada lateral', 'Laterales', 2),
  marco('phone-outline', 'Marco de teléfono', 'Dispositivos'),
  marco('scan-label-outline', 'Tarjeta con firma inferior', 'Tarjetas'),
  marco('inverse-caption', 'Cabecera de contraste', 'Tarjetas'),
  marco('pill-side', 'Etiqueta lateral alargada', 'Laterales'),
  marco('shield-label', 'Escudo con visor', 'Sellos'),
  marco('label-pill', 'Pastilla inferior', 'Etiquetas'),
  marco('shield-outline', 'Escudo de contorno', 'Sellos'),
  marco('circle-shadow', 'Círculo con sombra larga', 'Círculos', 2),
  marco('circle-dots', 'Círculo punteado', 'Círculos'),
  marco('organic', 'Sello orgánico', 'Círculos'),
  marco('wave-gradient', 'Banda de ondas', 'Sellos'),
] as const;

export type IdMarco = (typeof MARCOS)[number]['id'];
export type Marco = MarcoBase<IdMarco>;

export const ID_MARCO_POR_OMISION: IdMarco = 'band';

export function esIdMarco(valor: string): valor is IdMarco {
  return MARCOS.some((candidato) => candidato.id === valor);
}

export function obtenerMarco(id: IdMarco): Marco {
  return MARCOS.find((candidato) => candidato.id === id) ?? MARCOS[0];
}
