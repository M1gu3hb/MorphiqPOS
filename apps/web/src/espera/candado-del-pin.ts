/**
 * EL CANDADO DEL PIN (DP-11.2): con «Pedir PIN al despertar», la pantalla que se durmió queda
 * cerrada con el PIN de quien tiene la sesión hasta que lo teclee. El candado vive en el aparato
 * (`localStorage`), no en la pantalla: una recarga, otra pestaña o cambiar de ruta no lo quitan.
 *
 * Es un candado de pantalla, no del servidor: la sesión sigue viva y quien abra las herramientas
 * del navegador lo salta. Para eso está «Cambiar de persona», que sí cierra la sesión.
 */
export const CLAVE_DEL_CANDADO = 'morphiqpos.candado-del-pin';

interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** ¿Está cerrada para este empleo? Uno de otra persona no cuenta (y se va al abrir la suya). */
export function estaCerrado(almacen: Almacen | null, empleoId: string): boolean {
  try {
    return almacen?.getItem(CLAVE_DEL_CANDADO) === empleoId;
  } catch {
    // Datos del sitio bloqueados: no hay candado que leer; la pantalla vale por sí sola.
    return false;
  }
}

export function cerrar(almacen: Almacen | null, empleoId: string): void {
  try {
    almacen?.setItem(CLAVE_DEL_CANDADO, empleoId);
  } catch {
    // Sin almacén, el candado dura lo que dure la pantalla (el estado de React).
  }
}

export function abrir(almacen: Almacen | null): void {
  try {
    almacen?.removeItem(CLAVE_DEL_CANDADO);
  } catch {
    // Sin almacén no había candado guardado.
  }
}
