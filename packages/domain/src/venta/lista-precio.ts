import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-023 · Listas de precio, y por qué una cafetería las necesita.
 *
 * ── El número que las justifica ──────────────────────────────────────────
 * El precio de plataforma es hoy el mismo que el de barra, así que cada pedido
 * de reparto se vende con cerca de un 29 % de pérdida de margen que nadie ve: la
 * comisión de la plataforma sale entera del margen del negocio. No es un
 * descuento mal puesto, es un precio que nunca se subió.
 *
 * ── Por qué la lista es del CANAL y no del cliente ───────────────────────
 * En una tiendita la lista es de quien compra —mayoreo, menudeo—. Aquí es de
 * POR DÓNDE entra el pedido: barra, para llevar, plataforma. El mismo cliente
 * paga distinto según cómo pida, y eso es correcto: lo que cambia es el costo
 * de servirlo.
 *
 * ── Y por qué el precio se RESUELVE, nunca se elige ──────────────────────
 * La entrada dice el canal; el precio lo pone el servidor. Aceptar un precio de
 * la pantalla es aceptar el precio del cliente, y por esa puerta entra el
 * pedido de plataforma cobrado a precio de barra que este bloque viene a
 * cerrar.
 */

/** Los tres canales de este giro. Lista cerrada: uno libre es un precio libre. */
export type Canal = 'barra' | 'para_llevar' | 'plataforma';

export interface PrecioDeLista {
  readonly canal: Canal;
  /**
   * `null` = hereda el de barra. Es lo normal: sólo se captura lo que difiere,
   * y así un cambio de precio base no deja las listas desincronizadas.
   */
  readonly precioCentavos: bigint | null;
}

export interface ProductoConListas {
  readonly id: string;
  /** El precio de barra. Es el ancla, y siempre existe. */
  readonly precioBaseCentavos: bigint;
  readonly listas: readonly PrecioDeLista[];
}

export interface PrecioResuelto {
  readonly precioCentavos: bigint;
  /** `true` cuando el canal traía precio propio; `false` cuando heredó. */
  readonly propio: boolean;
  readonly canal: Canal;
}

/**
 * F-023 · El precio de este producto por este canal.
 *
 * Hereda del de barra cuando el canal no tiene precio propio, y lo dice en la
 * respuesta. Que lo diga importa: una pantalla que no distingue «$58 porque
 * alguien lo decidió» de «$58 porque nadie lo ha tocado» no puede enseñar la
 * lista de lo que falta por ajustar, y esa lista es todo el valor de F-023.
 */
export function precioPorCanal(producto: ProductoConListas, canal: Canal): PrecioResuelto {
  if (producto.precioBaseCentavos < 0n) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Un precio base negativo no es un precio.');
  }
  const propio = producto.listas.find((l) => l.canal === canal)?.precioCentavos ?? null;
  if (propio !== null && propio < 0n) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `La lista «${canal}» tiene un precio negativo.`,
    );
  }
  return {
    precioCentavos: propio ?? producto.precioBaseCentavos,
    propio: propio !== null,
    canal,
  };
}

/**
 * F-023 · Qué margen deja este precio DESPUÉS de la comisión del canal.
 *
 * Es la cuenta que hoy no se hace, y la que convierte «vendimos 40 cafés por
 * plataforma» en «perdimos $480 vendiendo 40 cafés». La comisión se aplica al
 * precio de venta —así la cobran las plataformas— y no al margen: aplicarla al
 * margen da un número más bonito y equivocado.
 */
export function margenDelCanal(
  precioCentavos: bigint,
  costoCentavos: bigint,
  comisionBp: number,
): bigint {
  if (!Number.isInteger(comisionBp) || comisionBp < 0 || comisionBp > 10_000) {
    throw new ErrorDominio(
      'DINERO_PORCENTAJE_INVALIDO',
      'La comisión del canal va en puntos base, de 0 a 10 000.',
    );
  }
  const comision = (precioCentavos * BigInt(comisionBp)) / 10_000n;
  return precioCentavos - comision - costoCentavos;
}

/**
 * F-023 · El precio que hay que poner para conservar el margen de barra.
 *
 * Se redondea HACIA ARRIBA: quedarse un centavo corto reproduce el problema que
 * este cálculo viene a resolver, y un peso de más en un café de plataforma no
 * lo nota nadie.
 */
export function precioParaIgualarMargen(
  precioBarraCentavos: bigint,
  costoCentavos: bigint,
  comisionBp: number,
): bigint {
  if (!Number.isInteger(comisionBp) || comisionBp < 0 || comisionBp >= 10_000) {
    throw new ErrorDominio(
      'DINERO_PORCENTAJE_INVALIDO',
      'Una comisión del 100 % no tiene precio que la compense.',
    );
  }
  const margenObjetivo = precioBarraCentavos - costoCentavos;
  const numerador = (margenObjetivo + costoCentavos) * 10_000n;
  const denominador = BigInt(10_000 - comisionBp);
  // Techo con enteros: `(a + b − 1) / b`.
  return (numerador + denominador - 1n) / denominador;
}
