import type { ClaseDePlatillo } from './historial-tipos.ts';

/**
 * La clase de platillo que arma una cuenta: entrada, principal, bebida o postre.
 *
 * El catálogo no dice qué se pide primero ni qué se bebe; lo dice el NOMBRE de su categoría, que
 * es lo que el dueño de cada restaurante escribió («Entradas», «Platos fuertes», «Cervezas»…).
 * Se reconoce sin acentos ni mayúsculas, y lo que no se reconoce cae en el área de preparación:
 * lo que sale de la barra se bebe y lo demás es un plato.
 */

/** Sin acentos y en minúsculas, para reconocer una categoría por su nombre. */
function plano(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function claseDePlatillo(
  categoria: string | null,
  areaPreparacion: string,
): ClaseDePlatillo {
  const nombre = plano(categoria ?? '');
  if (/postre|helado|pastel|dulce/.test(nombre)) return 'postre';
  if (/bebida|cerveza|agua|refresco|jugo|cafe|licor|vino|coctel|michelada|limonada/.test(nombre)) {
    return 'bebida';
  }
  if (/entrada|botana|antojito|sopa|ensalada|aperitivo/.test(nombre)) return 'entrada';
  return areaPreparacion === 'barra' ? 'bebida' : 'principal';
}
