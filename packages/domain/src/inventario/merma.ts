import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { deEscalaCompleta, enEscalaCompleta } from './escala.ts';

/**
 * F-109 · La merma con motivo, que va como ESTRATEGIA y no en el tronco.
 *
 * ── Por qué no es tronco, aunque F-100…F-108 sí lo sean ────────────────────
 * El catálogo la marca `[≠]` y tiene razón: **la merma de una cocina, la de un
 * lote caducado y la de un corte de cable no se registran igual.**
 *
 *   · en una cocina la merma es del INSUMO y se espera: la cebolla pierde
 *     cáscara, y eso ya está dentro de la receta;
 *   · en un abarrote la merma es del PRODUCTO y es una pérdida: caducó;
 *   · en una ferretería el retazo de un corte es merma sólo si NO sirve, y si
 *     sirve es una pieza abierta — que es inventario, no pérdida.
 *
 * Meter los tres en un solo comando obliga a un `if` por giro dentro del
 * tronco, que es exactamente lo que el encargo prohíbe: *«si el tronco tiene un
 * `if` que pregunta por el giro, está mal hecho»*.
 *
 * ── Lo que sí es común a los tres, y por eso vive aquí ─────────────────────
 * El motivo obligatorio, la firma de quién la registró, y la separación entre
 * merma IMPUTABLE y no imputable. Sin esa separación, «caducó» y «se lo
 * llevaron» acaban en el mismo número y el número deja de servir para nada.
 */

/** Un motivo de merma, tal como lo declara la tabla `motivos_merma` de la 062. */
export interface MotivoDeMerma {
  readonly clave: string;
  readonly etiqueta: string;
  /** El giro que lo usa. `null` = lo usan todos: ésos son el tronco. */
  readonly giro: string | null;
  /** Si apunta a un responsable. Separa la merma que se acepta de la que se investiga. */
  readonly imputable: boolean;
  readonly activo: boolean;
}

/**
 * Los motivos que este giro puede usar: los suyos más los del tronco.
 *
 * Se ordenan dejando los NO imputables primero porque son los frecuentes, y
 * porque una lista que empieza por «Faltante sin explicación» invita a elegirlo
 * sin pensar — y ése es el motivo que dispara una investigación.
 */
export function motivosDelGiro(
  motivos: readonly MotivoDeMerma[],
  giro: string,
): readonly MotivoDeMerma[] {
  return motivos
    .filter((m) => m.activo && (m.giro === null || m.giro === giro))
    .sort((a, b) => {
      if (a.imputable !== b.imputable) return a.imputable ? 1 : -1;
      return a.etiqueta.localeCompare(b.etiqueta, 'es-MX');
    });
}

/** Qué estrategia aplica a una merma. Es lo que el giro decide, y nada más. */
export type EstrategiaDeMerma =
  /** V6 receta y peso: la merma es del insumo y sale del almacén tal cual. */
  | 'insumo'
  /** V3 presentaciones: la merma es del producto y se convierte a su unidad base. */
  | 'presentacion'
  /** Corte de material: el sobrante es merma SÓLO si no alcanza el mínimo útil. */
  | 'retazo';

export interface SolicitudDeMerma {
  readonly estrategia: EstrategiaDeMerma;
  /** Lo que se pierde, en la unidad que tecleó la persona. Siempre positiva. */
  readonly cantidad: string;
  /** Cuántas unidades base vale una unidad de lo tecleado. `'1'` si es la base. */
  readonly factorABase: string;
  readonly motivo: MotivoDeMerma;
  /** Sólo en `retazo`: por debajo de esto el sobrante no sirve y es merma. */
  readonly minimoUtilBase?: string;
}

export interface MermaPlaneada {
  /** El movimiento de stock, SIEMPRE negativo: la merma sale. */
  readonly deltaBase: string;
  /** Lo que se recupera como pieza abierta en vez de perderse. Cero o positivo. */
  readonly recuperadoBase: string;
  readonly motivo: string;
  readonly imputable: boolean;
  /** `true` cuando el sobrante alcanzó el mínimo útil y no hubo merma. */
  readonly seRecupera: boolean;
}

/**
 * Convierte lo que se tecleó en el movimiento que hay que escribir.
 *
 * ── Por qué el retazo tiene su propia rama ─────────────────────────────────
 * Porque es la única de las tres donde **el sobrante puede no ser una pérdida**.
 * Un metro de cable que sobra de un corte se guarda y se vende; ocho centímetros
 * no. Tratar los dos igual —como merma, o como inventario— es el error que hace
 * que el inventario de una ferretería nunca cuadre: o sobra cable que no existe,
 * o falta cable que sí está en el estante.
 */
export function planearMerma(solicitud: SolicitudDeMerma): MermaPlaneada {
  const cantidad = deEscalaCompleta(solicitud.cantidad);
  if (cantidad <= 0n) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      'Una merma de cero o negativa no es una merma: es un tecleo.',
    );
  }
  if (!solicitud.motivo.activo) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      `El motivo «${solicitud.motivo.etiqueta}» ya no está activo.`,
    );
  }

  const factor = deEscalaCompleta(solicitud.factorABase);
  if (factor <= 0n) {
    throw new ErrorDominio(
      'UNIDAD_INCOMPATIBLE',
      'Sin factor de conversión no se sabe cuánto sale del almacén.',
    );
  }

  // `cantidad` y `factor` traen la escala cada uno: el producto la trae dos
  // veces y hay que desandar una. Se comprueba que sea exacta en vez de
  // redondear, porque una merma redondeada descuadra el conteo siguiente.
  const producto = cantidad * factor;
  if (producto % ESCALA !== 0n) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      'La merma convertida no cabe en cuatro decimales exactos.',
    );
  }
  const enBase = producto / ESCALA;

  if (solicitud.estrategia !== 'retazo') {
    return {
      deltaBase: enEscalaCompleta(-enBase),
      recuperadoBase: enEscalaCompleta(0n),
      motivo: solicitud.motivo.clave,
      imputable: solicitud.motivo.imputable,
      seRecupera: false,
    };
  }

  const minimo = deEscalaCompleta(solicitud.minimoUtilBase ?? '0');
  if (minimo <= 0n) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Un retazo sin mínimo útil no se puede clasificar: di a partir de cuánto sirve.',
    );
  }

  // El sobrante ALCANZA el mínimo: no es merma, es una pieza abierta que se
  // vuelve a vender. El movimiento de stock es cero y lo que se devuelve es
  // cuánto se recupera, para que el comando abra la pieza.
  if (enBase >= minimo) {
    return {
      deltaBase: enEscalaCompleta(0n),
      recuperadoBase: enEscalaCompleta(enBase),
      motivo: solicitud.motivo.clave,
      imputable: false,
      seRecupera: true,
    };
  }

  return {
    deltaBase: enEscalaCompleta(-enBase),
    recuperadoBase: enEscalaCompleta(0n),
    motivo: solicitud.motivo.clave,
    imputable: solicitud.motivo.imputable,
    seRecupera: false,
  };
}

const ESCALA = 10_000n;
