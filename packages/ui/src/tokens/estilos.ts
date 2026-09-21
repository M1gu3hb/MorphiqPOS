import type { Densidad, Elevacion, Movimiento, Redondeo } from './contrato';

/**
 * Capa 3: los estilos.
 *
 * "Un estilo es un archivo que fija tokens y perillas. Nada mas. **No hay
 * componentes alternos por estilo.**" — `05-SISTEMA-DE-DISENO §5`.
 *
 * Los colores viven en el CSS de cada estilo. Las cuatro perillas viven aqui,
 * porque se aplican como atributos `data-*` en `<html>` y el CSS de las perillas
 * (base.css) hace el resto. Asi un estilo nuevo no duplica sombras ni radios:
 * elige valores de perilla que ya existen.
 */

export interface DefinicionEstilo {
  /** Clave estable. Va en `<html data-estilo="...">`. */
  readonly clave: string;
  /** Nombre para el selector que ve Miguel delante del cliente. */
  readonly nombre: string;
  /** Referencia visual, para que la conversacion con el cliente tenga anclaje. */
  readonly referencia: string;
  /** Para que sirve. Sale de §5. */
  readonly para: string;
  readonly perillas: {
    readonly densidad: Densidad;
    readonly redondeo: Redondeo;
    readonly elevacion: Elevacion;
    readonly movimiento: Movimiento;
  };
}

export const ESTILOS: Readonly<Record<string, DefinicionEstilo>> = {
  morphiq: {
    clave: 'morphiq',
    nombre: 'Morphiq',
    referencia: 'el de Miguel',
    para:
      'EL BASE. Es el que ya vende y el que el cliente conoce: su azul, su radio de ' +
      '0.75rem, sus sombras suaves. Todo lo demas son variaciones sobre este esqueleto.',
    perillas: {
      // Su `--radius: 0.75rem` es exactamente el `--radio-lg` de la perilla `media`,
      // y su elevacion son sombras suaves: ni biseles ni lineas duras.
      densidad: 'normal',
      redondeo: 'media',
      elevacion: 'sombra',
      movimiento: 'normal',
    },
  },
  premium: {
    clave: 'premium',
    nombre: 'Premium',
    referencia: 'Apple · Linear',
    para: 'Login, panel del dueno y reportes. Es el que vende en una demostracion.',
    perillas: {
      densidad: 'normal',
      redondeo: 'amplia',
      elevacion: 'doble-bisel',
      movimiento: 'expresiva',
    },
  },
  editorial: {
    clave: 'editorial',
    nombre: 'Editorial',
    referencia: 'Notion · Craft',
    para: 'Clientes que quieren algo serio y sobrio. Es el que mejor envejece.',
    perillas: {
      densidad: 'normal',
      redondeo: 'sutil',
      elevacion: 'plana',
      movimiento: 'sutil',
    },
  },
};

/** Los estilos construidos hasta hoy. Los ocho de la etapa 2.35 entran aqui. */
export const CLAVES_ESTILO = Object.keys(ESTILOS);

/**
 * Los atributos que hay que poner en `<html>` para activar un estilo.
 *
 * El modo claro/oscuro es ortogonal (§5) y lo maneja aparte el `ThemeContext`
 * portado del restaurante, que pone `dark` y `oscuro` juntas en el <html>; con
 * la clase `oscuro`. La densidad tambien puede sobrescribirse por layout: la
 * caja en escritorio usa `compacta` aunque el estilo diga `normal` (§7).
 */
export function atributosDeEstilo(clave: string): Record<string, string> {
  const estilo = ESTILOS[clave];
  if (!estilo) {
    throw new Error(`Estilo desconocido: ${clave}. Conocidos: ${CLAVES_ESTILO.join(', ')}`);
  }

  return {
    'data-estilo': estilo.clave,
    'data-densidad': estilo.perillas.densidad,
    'data-redondeo': estilo.perillas.redondeo,
    'data-elevacion': estilo.perillas.elevacion,
    'data-movimiento': estilo.perillas.movimiento,
  };
}
