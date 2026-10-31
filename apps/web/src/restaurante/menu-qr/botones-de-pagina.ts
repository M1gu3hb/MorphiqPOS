/**
 * LOS BOTONES SOBRE UNA PÁGINA DEL MENÚ QR, del lado de la pantalla (DP-9.7).
 *
 * El servidor ya mandó sólo lo que se vende (`botonesPublicos`): aquí se coloca cada botón en %
 * de la imagen y se resuelven sus platillos contra el catálogo del portal.
 */

export interface BotonDePagina {
  readonly id: string;
  readonly tipo: 'platillo' | 'grupo';
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
  readonly etiqueta: string | null;
  readonly productoIds: readonly string[];
  readonly mostrarPrecio: boolean;
}

/** Dónde va el botón: en % de la imagen, así que crece y se encoge con ella (y con el zoom). */
export function cajaDelBoton(boton: Pick<BotonDePagina, 'x' | 'y' | 'ancho' | 'alto'>): {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
} {
  return {
    left: `${String(boton.x)}%`,
    top: `${String(boton.y)}%`,
    width: `${String(boton.ancho)}%`,
    height: `${String(boton.alto)}%`,
  };
}

/** Los platillos del botón, en su orden, de los que el portal tiene: nunca uno inventado. */
export function platillosDelBoton<P extends { readonly id: string }>(
  boton: Pick<BotonDePagina, 'productoIds'>,
  productos: readonly P[],
): readonly P[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  return boton.productoIds.flatMap((id) => {
    const producto = porId.get(id);
    return producto === undefined ? [] : [producto];
  });
}

/** El precio vigente que enseña el botón, en centavos; nulo si no se muestran precios. */
export function precioDelBoton(
  boton: Pick<BotonDePagina, 'mostrarPrecio'>,
  platillo: { readonly precio_venta_centavos?: string | null } | undefined,
  mostrarPrecios: boolean,
): number | null {
  if (!boton.mostrarPrecio || !mostrarPrecios || platillo === undefined) return null;
  const centavos = Number(platillo.precio_venta_centavos ?? 'x');
  return Number.isFinite(centavos) && centavos > 0 ? centavos : null;
}
