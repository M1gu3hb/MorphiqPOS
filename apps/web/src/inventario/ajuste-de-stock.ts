/**
 * EL AJUSTE DE STOCK que manda el diálogo heredado «Ajustar stock» (D.1 de la 2.4).
 *
 * ── Los dos defectos que esto arregla ─────────────────────────────────────────────
 * 1. El diálogo mandaba en `motivo` una FRASE —«Corrección de conteo: falta uno»— y desde
 *    la 062 `motivo` es la CLAVE de `motivos_merma` (`inventario.ajustar` la exige con
 *    `exigirMotivoDeMerma`): todo ajuste por la pantalla volvía rechazado. La clave es
 *    `ajuste_conteo` —«Diferencia de conteo físico», del tronco, la usan todos los giros—
 *    y lo que la persona escribe va en `nota`, con el tipo de ajuste delante.
 * 2. El botón «Ajustar» sólo salía para `administrador`, y el servidor también deja
 *    ajustar al ALMACÉN (`inventario.ts`): quien cuenta el anaquel no podía corregirlo.
 *
 * Vive aquí, en `src/`, porque `heredado/` no tiene pruebas: el diálogo lo importa.
 */

/** La clave de `motivos_merma` de un ajuste por conteo (062). */
export const MOTIVO_DEL_AJUSTE = 'ajuste_conteo';

/** El largo de `nota` en `inventario.ajustar`. */
const MAXIMO_DE_LA_NOTA = 300;

export interface AjusteAEnviar {
  readonly almacenId: string;
  readonly insumoId: string;
  readonly cantidad: string;
  readonly motivo: string;
  readonly nota: string;
}

export function cuerpoDelAjuste(ajuste: {
  readonly almacenId: string;
  readonly insumoId: string;
  /** El DELTA con signo, en decimal: sumar es lo que dos ajustes a la vez no se pisan. */
  readonly cantidad: string;
  /** «Corrección de conteo», «Merma»…: el tipo que eligió, que no es una clave. */
  readonly tipoLegible: string;
  readonly texto: string;
}): AjusteAEnviar {
  return {
    almacenId: ajuste.almacenId,
    insumoId: ajuste.insumoId,
    cantidad: ajuste.cantidad,
    motivo: MOTIVO_DEL_AJUSTE,
    nota: `${ajuste.tipoLegible}: ${ajuste.texto.trim()}`.slice(0, MAXIMO_DE_LA_NOTA),
  };
}

/** Quién ve «Ajustar» en el inventario: los mismos que el servidor deja ajustar. */
const AJUSTAN: readonly string[] = ['administrador', 'almacen'];

export function puedeAjustarStock(rol: string | null | undefined): boolean {
  return rol !== null && rol !== undefined && AJUSTAN.includes(rol);
}
