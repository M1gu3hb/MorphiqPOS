/**
 * LAS PÁGINAS DEL MENÚ PERSONALIZADO, LIGADAS A SUS PLATILLOS (DP-5, portal QR).
 *
 * Una página del menú subido (`MenuQRSeccion`) es una imagen con su título: el menú que diseñó el
 * negocio. Para que también se pida desde ahí sin una columna nueva —la base compartida no admite
 * DDL en la Fase A—, la página se liga a las categorías que NOMBRA su título, separadas por «·»:
 * «Pa’ empezar · Las sopas» lleva debajo los platillos de esas dos, con el mismo botón de pedir
 * que el menú de siempre. Un título que no nombra ninguna sigue siendo sólo imagen.
 *
 * Sin JSX, para probarse: lo usan el portal del comensal y la pestaña «Menú QR» del dueño.
 */

/** Lo que separa dos categorías en el título de una página. «y» no separa: hay «Anís y licores». */
export const SEPARADOR_DE_CATEGORIAS = '·';

export interface PaginaDelMenu {
  readonly nombre?: string | null | undefined;
}

export interface CategoriaDelMenu {
  readonly id: string;
  readonly nombre?: string | null | undefined;
}

export interface PlatilloDelMenu {
  readonly id: string;
  readonly nombre?: string | null | undefined;
  readonly categoria_id?: string | null | undefined;
}

/** Un nombre para comparar: sin acentos, en minúsculas, con el apóstrofo recto y un solo espacio. */
function comparable(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-MX');
}

/** Las categorías que nombra el título de la página, en el orden en que las nombra. */
export function categoriasDeLaPagina<C extends CategoriaDelMenu>(
  titulo: string | null | undefined,
  categorias: readonly C[],
): readonly C[] {
  if (typeof titulo !== 'string' || titulo.trim() === '') return [];
  const porNombre = new Map(
    categorias
      .filter((c) => typeof c.nombre === 'string' && c.nombre.trim() !== '')
      .map((c) => [comparable(c.nombre ?? ''), c] as const),
  );
  const ligadas: C[] = [];
  for (const parte of titulo.split(SEPARADOR_DE_CATEGORIAS)) {
    const categoria = porNombre.get(comparable(parte));
    if (categoria !== undefined && !ligadas.includes(categoria)) ligadas.push(categoria);
  }
  return ligadas;
}

/** Los platillos que se piden desde la página: los de sus categorías, en ese orden. */
export function platillosDeLaPagina<P extends PlatilloDelMenu>(
  pagina: PaginaDelMenu,
  categorias: readonly CategoriaDelMenu[],
  platillos: readonly P[],
): readonly P[] {
  return categoriasDeLaPagina(pagina.nombre, categorias).flatMap((categoria) =>
    platillos.filter((p) => p.categoria_id === categoria.id),
  );
}

/** Lo que la pestaña «Menú QR» le dice al dueño de cada página. */
export function resumenDeLaPagina(
  pagina: PaginaDelMenu,
  categorias: readonly CategoriaDelMenu[],
  platillos: readonly PlatilloDelMenu[],
): string {
  const ligadas = categoriasDeLaPagina(pagina.nombre, categorias);
  if (ligadas.length === 0) {
    return `Sólo imagen: para pedir desde esta página, ponle de título el nombre de una categoría (varias, separadas por «${SEPARADOR_DE_CATEGORIAS}»).`;
  }
  const cuantos = platillosDeLaPagina(pagina, categorias, platillos).length;
  const nombres = ligadas.map((c) => c.nombre ?? '').join(', ');
  return `Se pide: ${nombres} · ${String(cuantos)} ${cuantos === 1 ? 'platillo' : 'platillos'}`;
}
