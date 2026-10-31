/**
 * EL EDITOR DE BOTONES DEL MENÚ QR, sin pantalla (DP-9.7).
 *
 * Los botones viven en % de la imagen. Moverlos y estirarlos nunca los saca de la página ni los
 * deja más chicos de lo que un dedo puede tocar; y lo que se guarda tiene la misma forma que el
 * servidor valida (`packages/app/src/portal/botones-del-menu.ts`).
 */

export type TipoDeBoton = 'platillo' | 'grupo';

export interface BotonEditable {
  readonly id: string;
  readonly tipo: TipoDeBoton;
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
  readonly productoId?: string;
  readonly categoriaId?: string;
  readonly productoIds?: readonly string[];
  readonly etiqueta?: string;
  readonly mostrarPrecio: boolean;
}

export type BotonesPorPagina = Readonly<Record<string, readonly BotonEditable[]>>;

/** Lo más chico que se deja: un renglón de carta en un teléfono (en % de la imagen). */
export const ANCHO_MINIMO = 6;
export const ALTO_MINIMO = 1.5;

const redondo = (v: number): number => Math.round(v * 100) / 100;
const entre = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/** Un botón nuevo en el centro de la página, del tipo pedido. */
export function nuevoBoton(tipo: TipoDeBoton, id: string): BotonEditable {
  return { id, tipo, x: 10, y: 45, ancho: 80, alto: 4, mostrarPrecio: tipo === 'platillo' };
}

/** Mueve el botón (en %) sin sacarlo de la página. */
export function moverBoton(boton: BotonEditable, dx: number, dy: number): BotonEditable {
  return {
    ...boton,
    x: redondo(entre(boton.x + dx, 0, 100 - boton.ancho)),
    y: redondo(entre(boton.y + dy, 0, 100 - boton.alto)),
  };
}

/** Lo estira o lo encoge desde su esquina de abajo a la derecha, sin salirse ni achicarse de más. */
export function estirarBoton(boton: BotonEditable, dAncho: number, dAlto: number): BotonEditable {
  return {
    ...boton,
    ancho: redondo(entre(boton.ancho + dAncho, ANCHO_MINIMO, 100 - boton.x)),
    alto: redondo(entre(boton.alto + dAlto, ALTO_MINIMO, 100 - boton.y)),
  };
}

/** Cambia el tipo dejando sólo lo que ese tipo lleva (el servidor rechaza lo que sobra). */
export function cambiarTipo(boton: BotonEditable, tipo: TipoDeBoton): BotonEditable {
  const { id, x, y, ancho, alto, mostrarPrecio } = boton;
  return { id, tipo, x, y, ancho, alto, mostrarPrecio };
}

/** Un grupo que despliega una CATEGORÍA: sin lista. */
export function grupoPorCategoria(boton: BotonEditable): BotonEditable {
  const { id, tipo, x, y, ancho, alto, mostrarPrecio, etiqueta, categoriaId } = boton;
  return {
    id,
    tipo,
    x,
    y,
    ancho,
    alto,
    mostrarPrecio,
    ...(etiqueta === undefined ? {} : { etiqueta }),
    ...(categoriaId === undefined ? {} : { categoriaId }),
  };
}

/** Un grupo que despliega una LISTA elegida: sin categoría. */
export function grupoPorLista(boton: BotonEditable): BotonEditable {
  const { id, tipo, x, y, ancho, alto, mostrarPrecio, etiqueta } = boton;
  return {
    id,
    tipo,
    x,
    y,
    ancho,
    alto,
    mostrarPrecio,
    ...(etiqueta === undefined ? {} : { etiqueta }),
    productoIds: boton.productoIds ?? [],
  };
}

/** Qué le falta al botón para poder guardarse; `null` si está completo. */
export function faltaDelBoton(boton: BotonEditable): string | null {
  if (boton.tipo === 'platillo')
    return boton.productoId === undefined ? 'Elige el platillo.' : null;
  if (boton.etiqueta === undefined || boton.etiqueta.trim() === '') {
    return 'Escribe el texto del grupo («Cócteles»).';
  }
  const conCategoria = boton.categoriaId !== undefined;
  const conLista = (boton.productoIds?.length ?? 0) > 0;
  return conCategoria === conLista ? 'Elige una categoría o una lista de platillos.' : null;
}

/** Los botones de todas las páginas con los de ESTA reemplazados; una página vacía se quita. */
export function conLosDeLaPagina(
  todos: BotonesPorPagina,
  paginaId: string,
  botones: readonly BotonEditable[],
): BotonesPorPagina {
  const demas = Object.fromEntries(Object.entries(todos).filter(([id]) => id !== paginaId));
  return botones.length === 0 ? demas : { ...demas, [paginaId]: botones };
}
