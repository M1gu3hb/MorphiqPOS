/**
 * DÓNDE QUEDÓ CADA PIEZA DE UNA CAPA después de que un toque le cambió el contenido
 * (20-10-2026).
 *
 * El rastreo enumera las piezas de un diálogo una vez y las toca en orden, cada una por
 * su posición. Si un toque AGREGA piezas —«Agregar grupo» mete el nombre del grupo, su
 * primera opción y su botón—, todas las que venían después se corren de lugar y el
 * rastreo las daba por perdidas («en su sitio hay otra pieza»). En el restaurante eran
 * «Guardar», «Cancelar» y la X de cada diálogo de opciones, de contenedor y de compra:
 * 198 de las 1029 piezas, justo las que cierran el diálogo.
 *
 * Se alinean las dos listas de firmas —la de cuando se enumeró y la de ahora— por su
 * subsecuencia común más larga: lo que se conserva, en el mismo orden, es lo que había;
 * lo que sobra en la de ahora es lo que el toque agregó. Devuelve, por cada posición vieja
 * que sigue existiendo, su posición nueva. La que no aparece ya no está, y así se cuenta.
 *
 * Con dos piezas gemelas (la misma firma) la alineación puede escoger la gemela: es la
 * misma clase de pieza, y tocarla prueba lo mismo.
 */
export function reubicar(
  antes: readonly string[],
  ahora: readonly string[],
): ReadonlyMap<number, number> {
  const columnas = ahora.length + 1;
  // largo[i·columnas + j]: la subsecuencia común más larga de antes[i..] y ahora[j..].
  const largo = new Int32Array((antes.length + 1) * columnas);
  const en = (i: number, j: number): number => largo[i * columnas + j] ?? 0;
  for (let i = antes.length - 1; i >= 0; i -= 1) {
    for (let j = ahora.length - 1; j >= 0; j -= 1) {
      largo[i * columnas + j] =
        antes[i] === ahora[j] ? en(i + 1, j + 1) + 1 : Math.max(en(i + 1, j), en(i, j + 1));
    }
  }

  const posiciones = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < antes.length && j < ahora.length) {
    if (antes[i] === ahora[j] && en(i, j) === en(i + 1, j + 1) + 1) {
      posiciones.set(i, j);
      i += 1;
      j += 1;
    } else if (en(i + 1, j) >= en(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return posiciones;
}
