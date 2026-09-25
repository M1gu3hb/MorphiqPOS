/**
 * LA NOTA DEL PROVEEDOR, leída de su ARCHIVO (F-631; C.10 de la 2.4).
 *
 * «La subida del archivo necesita multipart», decía la cabecera de Entradas, y no: el
 * comando que empareja (`compras.importar_nota`) recibe RENGLONES en JSON. Lo que faltaba
 * era leer el archivo en el navegador —el CSV que exporta el sistema del proveedor o que
 * se guarda desde su hoja de cálculo— y convertirlo en esos renglones. Nada viaja como
 * archivo: viajan los datos, validados aquí y otra vez en el servidor.
 *
 * ── Lo que acepta ─────────────────────────────────────────────────────────
 * Separado por coma, punto y coma o tabulador (el Excel en español guarda con punto y
 * coma), con o sin comillas, con BOM o sin él. La primera fila dice qué es cada columna;
 * se reconocen por su nombre, en el orden que vengan: clave, código de barras, descripción,
 * cantidad y costo unitario. Un renglón que no se entiende NO se inventa: se cuenta y se
 * dice cuál fue.
 */

export interface RenglonDeLaNota {
  readonly claveProveedor: string | null;
  readonly codigoBarras: string | null;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly costoUnitarioCentavos: number;
}

export interface NotaLeida {
  readonly renglones: readonly RenglonDeLaNota[];
  /** Los números de fila (contando la del encabezado como 1) que no se pudieron leer. */
  readonly filasConProblema: readonly number[];
  /** Qué columna falta para poder leer nada, o nulo si están las necesarias. */
  readonly faltaColumna: string | null;
}

type Columna = 'clave' | 'codigo' | 'descripcion' | 'cantidad' | 'costo';

const NOMBRES: readonly (readonly [Columna, RegExp])[] = [
  ['codigo', /^(codigo( de)? barras?|ean|upc|cb)$/],
  ['clave', /^(clave|clave proveedor|sku|codigo|codigo proveedor|articulo|no\.? ?parte)$/],
  ['descripcion', /^(descripcion|producto|concepto|nombre|articulo descripcion)$/],
  ['cantidad', /^(cantidad|cant\.?|unidades|piezas)$/],
  ['costo', /^(costo|costo unitario|precio|precio unitario|p\.? ?unitario|importe unitario)$/],
];

function normal(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');
}

/** El separador de la primera línea: el que más aparece fuera de comillas. */
function separadorDe(linea: string): string {
  const cuenta = (s: string) => linea.split(s).length - 1;
  return [';', '\t', ','].reduce((mejor, s) => (cuenta(s) > cuenta(mejor) ? s : mejor), ',');
}

/** Una línea de CSV en sus celdas, con comillas dobles y comillas escapadas. */
export function celdasDe(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea.charAt(i);
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else if (c === '"') entreComillas = false;
      else actual += c;
    } else if (c === '"') entreComillas = true;
    else if (c === separador) {
      celdas.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

/**
 * «1,234.50» o «$ 1 234,50»: a centavos, o nulo si no es un importe.
 *
 * Con TEXTO y enteros, no multiplicando por cien: `1234.995 * 100` da
 * `123499.4999…`. Más de dos decimales se redondean al centavo, medio hacia arriba.
 */
export function centavosDeTexto(texto: string): number | null {
  let limpio = texto.replace(/[$\s]/g, '');
  if (limpio === '') return null;
  // Coma decimal (sin punto después de ella): 1234,50 → 1234.50; 1.234,50 → 1234.50.
  if (/,\d{1,2}$/.test(limpio)) limpio = limpio.replace(/\./g, '').replace(',', '.');
  else limpio = limpio.replace(/,/g, '');
  const partes = /^(\d{1,9})(?:\.(\d{1,4}))?$/.exec(limpio);
  if (partes === null) return null;
  const decimales = (partes[2] ?? '').padEnd(4, '0');
  const diezmilesimas = Number(partes[1]) * 10_000 + Number(decimales);
  return Math.floor((diezmilesimas + 50) / 100);
}

/** La cantidad como la pide el comando: hasta cuatro decimales, punto decimal. */
function cantidadDeTexto(texto: string): string | null {
  const limpio = texto.replace(/\s/g, '').replace(',', '.');
  return /^\d{1,10}(\.\d{1,4})?$/.test(limpio) && Number(limpio) > 0 ? limpio : null;
}

export function leerNotaDelProveedor(texto: string): NotaLeida {
  const lineas = texto
    .trimStart()
    .split(/\r?\n/)
    .map((l, i) => ({ l, fila: i + 1 }))
    .filter(({ l }) => l.trim() !== '');
  const encabezado = lineas[0];
  if (encabezado === undefined) {
    return { renglones: [], filasConProblema: [], faltaColumna: 'descripción' };
  }
  const separador = separadorDe(encabezado.l);
  const indice = new Map<Columna, number>();
  celdasDe(encabezado.l, separador).forEach((nombre, i) => {
    const cual = NOMBRES.find(([, patron]) => patron.test(normal(nombre)))?.[0];
    if (cual !== undefined && !indice.has(cual)) indice.set(cual, i);
  });
  for (const [necesaria, dicha] of [
    ['descripcion', 'descripción'],
    ['cantidad', 'cantidad'],
    ['costo', 'costo unitario'],
  ] as const) {
    if (!indice.has(necesaria)) return { renglones: [], filasConProblema: [], faltaColumna: dicha };
  }

  const renglones: RenglonDeLaNota[] = [];
  const filasConProblema: number[] = [];
  for (const { l, fila } of lineas.slice(1)) {
    const celdas = celdasDe(l, separador);
    const de = (c: Columna): string => {
      const i = indice.get(c);
      return i === undefined ? '' : (celdas[i] ?? '');
    };
    const descripcion = de('descripcion').slice(0, 200);
    const cantidad = cantidadDeTexto(de('cantidad'));
    const costo = centavosDeTexto(de('costo'));
    if (descripcion === '' || cantidad === null || costo === null) {
      filasConProblema.push(fila);
      continue;
    }
    renglones.push({
      claveProveedor: de('clave') === '' ? null : de('clave').slice(0, 60),
      codigoBarras: de('codigo') === '' ? null : de('codigo').slice(0, 40),
      descripcion,
      cantidad,
      costoUnitarioCentavos: costo,
    });
  }
  return { renglones, filasConProblema, faltaColumna: null };
}
