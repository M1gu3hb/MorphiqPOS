/**
 * EL PEDIDO DEL MOSTRADOR DE LA CAFETERÍA, antes de cobrarse: sus líneas, su total y la
 * forma en que viajan al cobro (C.10 de la 2.4).
 *
 * ── Por qué una línea tiene CLAVE y no se identifica por su producto ─────
 * Hasta la 2.4 la línea era «el producto»: tocar dos veces el latte sumaba dos. Con las
 * opciones eso ya no alcanza —un latte de avena y uno con entera son dos líneas, con dos
 * precios y dos recetas— así que la línea se reconoce por el producto Y lo que se eligió.
 * Dos lattes de avena sí se suman: son la misma bebida dos veces.
 *
 * ── Por qué las opciones no se cobraban desde aquí ───────────────────────
 * La tarjeta agregaba el producto base y las opciones eran «otra pantalla» que metía la
 * bebida en el borrador de la terminal —uno que este cobro nunca leía—: la leche de avena
 * y el vaso grande no se podían cobrar desde el mostrador. Ahora la pantalla de opciones
 * DEVUELVE lo elegido, la línea lo lleva, y el cobro lo manda con `opciones`.
 */

export interface OpcionDeLaLinea {
  readonly id: string;
  readonly nombre: string;
  /** Con signo: «vaso propio» abarata. */
  readonly deltaCentavos: number;
}

export interface LineaDelPedido {
  /** Producto + opciones + alergias + nota: lo que hace que dos bebidas sean la misma. */
  readonly clave: string;
  readonly productoId: string;
  readonly nombre: string;
  /** El precio UNITARIO ya con sus opciones. */
  readonly precioCentavos: number;
  readonly cantidad: number;
  readonly opciones: readonly OpcionDeLaLinea[];
  readonly alergias: readonly string[];
  readonly nota: string;
}

/** Lo que se agrega: el producto base y, si pasó por la pantalla de opciones, lo elegido. */
export interface BebidaParaElPedido {
  readonly productoId: string;
  readonly nombre: string;
  readonly precioBaseCentavos: number;
  readonly opciones?: readonly OpcionDeLaLinea[];
  readonly alergias?: readonly string[];
  readonly nota?: string;
}

export function claveDeLinea(bebida: BebidaParaElPedido): string {
  const opciones = [...(bebida.opciones ?? [])].map((o) => o.id).sort();
  const alergias = [...(bebida.alergias ?? [])].sort();
  return JSON.stringify([bebida.productoId, opciones, alergias, (bebida.nota ?? '').trim()]);
}

/**
 * El precio unitario con opciones, como lo calcula `cafeteria.agregar_bebida`: la base
 * más los deltas, y nunca bajo cero —un «sin crema» no vuelve la bebida negativa—. Si
 * esta cuenta y la del servidor se separan, el cobro se RECHAZA por total, que es lo que
 * tiene que pasar.
 */
export function precioConOpciones(base: number, opciones: readonly OpcionDeLaLinea[]): number {
  const total = opciones.reduce((suma, o) => suma + o.deltaCentavos, base);
  return total > 0 ? total : 0;
}

/** «Latte 12 oz · Avena · 16 oz»: lo que el barista lee en la línea. */
function nombreDeLinea(bebida: BebidaParaElPedido): string {
  const partes = [bebida.nombre, ...(bebida.opciones ?? []).map((o) => o.nombre)];
  return partes.join(' · ');
}

/** Suma o resta uno a la línea de esa clave. Al llegar a cero desaparece. */
export function conCantidad(
  lineas: readonly LineaDelPedido[],
  clave: string,
  paso: number,
): readonly LineaDelPedido[] {
  return lineas
    .map((linea) => (linea.clave === clave ? { ...linea, cantidad: linea.cantidad + paso } : linea))
    .filter((linea) => linea.cantidad > 0);
}

/** Agrega una bebida: si ya hay una IGUAL —mismas opciones— suma uno; si no, línea nueva. */
export function conBebida(
  lineas: readonly LineaDelPedido[],
  bebida: BebidaParaElPedido,
): readonly LineaDelPedido[] {
  const clave = claveDeLinea(bebida);
  if (lineas.some((linea) => linea.clave === clave)) return conCantidad(lineas, clave, 1);
  const opciones = bebida.opciones ?? [];
  return [
    ...lineas,
    {
      clave,
      productoId: bebida.productoId,
      nombre: nombreDeLinea(bebida),
      precioCentavos: precioConOpciones(bebida.precioBaseCentavos, opciones),
      cantidad: 1,
      opciones,
      alergias: bebida.alergias ?? [],
      nota: (bebida.nota ?? '').trim(),
    },
  ];
}

export function totalDe(lineas: readonly LineaDelPedido[]): number {
  return lineas.reduce((suma, linea) => suma + linea.precioCentavos * linea.cantidad, 0);
}

/** Una línea en la forma de `/api/venta/cobrar-mostrador`. */
export interface LineaParaCobrar {
  readonly productoId: string;
  readonly cantidad: string;
  readonly opciones?: readonly string[];
  readonly alergias?: readonly string[];
  readonly nota?: string;
}

/**
 * Las líneas como viajan al cobro. La que no lleva opciones va como siempre —el renglón
 * del catálogo—; la que lleva, con sus ids, para que el servidor ponga el precio y selle
 * lo elegido (y el consumo sustituya la leche).
 */
export function lineasParaCobrar(lineas: readonly LineaDelPedido[]): LineaParaCobrar[] {
  return lineas.map((linea) => {
    const conAlgo = linea.opciones.length > 0 || linea.alergias.length > 0 || linea.nota !== '';
    return {
      productoId: linea.productoId,
      cantidad: String(linea.cantidad),
      ...(conAlgo
        ? {
            opciones: linea.opciones.map((o) => o.id),
            alergias: [...linea.alergias],
            nota: linea.nota,
          }
        : {}),
    };
  });
}
