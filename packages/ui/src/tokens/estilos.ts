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
      densidad: 'normal',
      redondeo: 'media',
      elevacion: 'sombra',
      movimiento: 'normal',
    },
  },
  cristal: {
    clave: 'cristal',
    nombre: 'Cristal',
    referencia: 'glassmorphism · liquid glass',
    para:
      'Estetica, spa, cafeteria de especialidad, joyeria. Para quien vende una ' +
      'experiencia y quiere que el sistema se vea caro delante de su clienta.',
    perillas: {
      densidad: 'normal',
      redondeo: 'amplia',
      elevacion: 'sombra',
      movimiento: 'expresiva',
    },
  },
  relieve: {
    clave: 'relieve',
    nombre: 'Relieve',
    referencia: 'neumorphism',
    para:
      'Recepcion y panel quieto, en pantalla grande. El mas bonito y el mas ' +
      'peligroso: por naturaleza tiene poco contraste, asi que aqui se fuerza a AA.',
    perillas: {
      densidad: 'normal',
      redondeo: 'amplia',
      elevacion: 'doble-bisel',
      movimiento: 'sutil',
    },
  },
  taller: {
    clave: 'taller',
    nombre: 'Taller',
    referencia: 'skeuomorfismo',
    para:
      'Ferreteria, taller mecanico, refaccionaria, materiales. Gente que trabaja con ' +
      'las manos y a la que un boton que parece boton le dice mas que uno plano.',
    perillas: {
      // 56 px de control: en un taller en enero se cobra con guante puesto.
      densidad: 'guantes',
      redondeo: 'media',
      elevacion: 'doble-bisel',
      movimiento: 'normal',
    },
  },
  bloque: {
    clave: 'bloque',
    nombre: 'Bloque',
    referencia: 'brutalismo',
    para:
      'Mostrador rapido, taqueria en hora pico, food truck. Maxima legibilidad a ' +
      'distancia y con prisa: feo a proposito y funcional a proposito.',
    perillas: {
      densidad: 'guantes',
      redondeo: 'nula',
      elevacion: 'linea-dura',
      movimiento: 'sutil',
    },
  },
  terminal: {
    clave: 'terminal',
    nombre: 'Terminal',
    referencia: 'fosforo ambar · POS de los ochenta',
    para:
      'Quien viene de un POS viejo y teclea mas rapido de lo que mira. Cero ' +
      'movimiento: una animacion entre dos teclas es una animacion que estorba.',
    perillas: {
      densidad: 'compacta',
      redondeo: 'nula',
      elevacion: 'plana',
      movimiento: 'nula',
    },
  },
  papel: {
    clave: 'papel',
    nombre: 'Papel',
    referencia: 'Notion · Linear · Craft',
    para:
      'Despachos, consultorios, agencias, inmobiliarias. Donde el sistema tiene que ' +
      'DESAPARECER: la jerarquia la hacen el espacio y la escala, no la sombra.',
    perillas: {
      densidad: 'normal',
      redondeo: 'sutil',
      elevacion: 'plana',
      movimiento: 'sutil',
    },
  },
  noche: {
    clave: 'noche',
    nombre: 'Noche',
    referencia: 'alto contraste para poca luz',
    para:
      'Barra, cocina, taquilla de cine. NO es «modo oscuro» —eso lo tienen los ocho—: ' +
      'es un estilo para operar a oscuras, sin blanco puro que deslumbre.',
    perillas: {
      densidad: 'comoda',
      redondeo: 'media',
      elevacion: 'sombra',
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
