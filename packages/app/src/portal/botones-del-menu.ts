import { z } from 'zod';

/**
 * LOS BOTONES SOBRE LAS PÁGINAS DEL MENÚ QR (DP-9.7).
 *
 * Cada página del menú subido es una imagen; sobre ella se colocan botones en % de la imagen
 * —se ven igual en cualquier teléfono y con zoom de dos dedos no se pierden—. Dos tipos:
 *   · `platillo`: «Agregar» de UN platillo (abre el mismo diálogo de opciones de siempre);
 *   · `grupo`: un botón («Cócteles») que despliega los platillos de una categoría, o de una
 *     lista elegida, para agregar.
 * Viven en `configuracion.valores.portal_qr_botones`, por página (`{ [seccionId]: Boton[] }`):
 * sin migración. Reemplaza la regla del título de DP-D18, que queda superada.
 */

/** Tope por página: más botones que esto en una carta ya no se pueden tocar con el dedo. */
export const MAXIMO_DE_BOTONES_POR_PAGINA = 60;
export const CLAVE_DE_BOTONES = 'portal_qr_botones';

const PORCENTAJE = z.number().min(0).max(100);

const BOTON = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    tipo: z.enum(['platillo', 'grupo']),
    x: PORCENTAJE,
    y: PORCENTAJE,
    ancho: z.number().gt(0).max(100),
    alto: z.number().gt(0).max(100),
    productoId: z.uuid().optional(),
    categoriaId: z.uuid().optional(),
    productoIds: z.array(z.uuid()).min(1).max(60).optional(),
    etiqueta: z.string().trim().min(1).max(40).optional(),
    mostrarPrecio: z.boolean(),
  })
  .strict()
  .refine((b) => b.x + b.ancho <= 100.01 && b.y + b.alto <= 100.01, {
    message: 'Un botón se sale de la página.',
  })
  .refine(
    (b) =>
      b.tipo === 'platillo'
        ? b.productoId !== undefined && b.categoriaId === undefined && b.productoIds === undefined
        : b.productoId === undefined &&
          (b.categoriaId === undefined) !== (b.productoIds === undefined),
    { message: 'Un botón de platillo lleva su platillo; uno de grupo, una categoría o una lista.' },
  )
  .refine((b) => b.tipo === 'platillo' || b.etiqueta !== undefined, {
    message: 'Un botón de grupo lleva el texto que se lee («Cócteles»).',
  });

export const BOTONES_DEL_MENU = z.record(
  z.uuid(),
  z
    .array(BOTON)
    .max(MAXIMO_DE_BOTONES_POR_PAGINA)
    .refine((lista) => new Set(lista.map((b) => b.id)).size === lista.length, {
      message: 'Dos botones de la misma página tienen el mismo id.',
    }),
);

export type BotonDelMenu = z.infer<typeof BOTON>;
export type BotonesDelMenu = z.infer<typeof BOTONES_DEL_MENU>;

/** Lo que el comensal recibe de cada botón: sólo lo que existe y se ve en el menú digital. */
export interface BotonPublico {
  readonly id: string;
  readonly tipo: 'platillo' | 'grupo';
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
  readonly etiqueta: string | null;
  /** Los platillos que agrega: uno para `platillo`; los del grupo, en el orden del menú. */
  readonly productoIds: readonly string[];
  readonly mostrarPrecio: boolean;
}

/** Los botones guardados, leídos sin confiar: lo que no tiene forma se descarta, no revienta. */
export function botonesGuardados(valor: unknown): BotonesDelMenu {
  const leido = BOTONES_DEL_MENU.safeParse(valor ?? {});
  return leido.success ? leido.data : {};
}

/**
 * Los botones de UNA página como los ve el comensal: un botón cuyo platillo ya no se ve en el
 * menú digital desaparece (el servidor no publica lo que no se vende), y un grupo se queda con
 * los platillos visibles; si no le queda ninguno, desaparece.
 */
export function botonesPublicos(
  botones: readonly BotonDelMenu[],
  productosVisibles: readonly { readonly id: string; readonly categoria_id: string | null }[],
): readonly BotonPublico[] {
  const visibles = new Set(productosVisibles.map((p) => p.id));
  return botones.flatMap((b) => {
    const ids =
      b.tipo === 'platillo'
        ? [b.productoId ?? ''].filter((id) => visibles.has(id))
        : b.categoriaId !== undefined
          ? productosVisibles.filter((p) => p.categoria_id === b.categoriaId).map((p) => p.id)
          : (b.productoIds ?? []).filter((id) => visibles.has(id));
    if (ids.length === 0) return [];
    return [
      {
        id: b.id,
        tipo: b.tipo,
        x: b.x,
        y: b.y,
        ancho: b.ancho,
        alto: b.alto,
        etiqueta: b.etiqueta ?? null,
        productoIds: ids,
        mostrarPrecio: b.mostrarPrecio,
      },
    ];
  });
}
