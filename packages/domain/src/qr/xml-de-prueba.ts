/**
 * COMPROBACIONES DE XML PARA LAS PRUEBAS. No se usa fuera de ellas.
 *
 * El dominio no tiene DOM ni analizador de XML, y «el texto parece un SVG» no basta: un `&` sin
 * escapar o una etiqueta sin cerrar hace que el navegador deje el dibujo en blanco. Esto es un
 * comprobador mínimo de buena formación —etiquetas balanceadas, atributos entrecomillados y no
 * repetidos, entidades válidas— suficiente para el SVG que produce el motor.
 */

const CIERRE = /<\/([A-Za-z][\w:-]*)\s*>/y;
const APERTURA = /<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/y;
const ATRIBUTO = /([\w:-]+)="([^"]*)"/g;
const ENTIDAD_SUELTA = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i;

function problemaDeAtributos(nombre: string, atributos: string): string | null {
  const vistos = new Set<string>();
  for (const [, clave, valor] of atributos.matchAll(ATRIBUTO)) {
    if (clave === undefined || valor === undefined) continue;
    if (vistos.has(clave)) return `<${nombre}> repite el atributo ${clave}.`;
    vistos.add(clave);
    if (ENTIDAD_SUELTA.test(valor)) return `<${nombre}> trae un & sin escapar en ${clave}.`;
  }
  return null;
}

/** `null` si el marcado está bien formado; si no, una descripción del primer problema. */
export function problemaDeXml(marcado: string): string | null {
  const abiertas: string[] = [];
  let posicion = 0;
  while (posicion < marcado.length) {
    const siguiente = marcado.indexOf('<', posicion);
    const texto = marcado.slice(posicion, siguiente === -1 ? marcado.length : siguiente);
    if (ENTIDAD_SUELTA.test(texto)) return 'Hay un & sin escapar en el texto.';
    if (siguiente === -1) break;
    CIERRE.lastIndex = siguiente;
    const cierre = CIERRE.exec(marcado);
    if (cierre !== null) {
      const esperada = abiertas.pop();
      if (esperada !== cierre[1])
        return `Se cerró </${cierre[1] ?? '?'}> y se esperaba </${esperada ?? 'nada'}>.`;
      posicion = CIERRE.lastIndex;
      continue;
    }
    APERTURA.lastIndex = siguiente;
    const apertura = APERTURA.exec(marcado);
    if (apertura === null)
      return `Etiqueta mal formada en ${siguiente}: ${marcado.slice(siguiente, siguiente + 40)}`;
    const nombre = apertura[1] ?? '?';
    const problema = problemaDeAtributos(nombre, apertura[2] ?? '');
    if (problema !== null) return problema;
    if (apertura[3] !== '/') abiertas.push(nombre);
    posicion = APERTURA.lastIndex;
  }
  return abiertas.length === 0 ? null : `Quedaron sin cerrar: ${abiertas.join(', ')}.`;
}

/** Los ids definidos en un marcado (`id="..."`, no `data-id="..."`), en orden de aparición. */
export function idsDe(marcado: string): readonly string[] {
  return Array.from(
    marcado.matchAll(/(?<![\w-])id="([^"]+)"/g),
    (coincidencia) => coincidencia[1] ?? '',
  );
}
