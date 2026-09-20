import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';

import { consultar, entidadMapeada, type Ambito } from '../puente/index.ts';

/**
 * F-322 · Sacar los registros a un archivo (`/api/reportes/exportar`).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `restaurante/Registros.tsx` es la pantalla de los seis registros del negocio
 * —cortes, ventas, propinas, compras, movimientos de cuenta y gastos— y su única
 * acción propia es EXPORTAR. Publicaba en `/api/reportes/exportar`, **una ruta que
 * no existía**, así que el botón daba el error genérico: el contador pedía «mándame
 * el mes» y la respuesta era una captura de pantalla.
 *
 * ── Por qué NO es un comando ─────────────────────────────────────────────
 * Porque no escribe nada del negocio: lee y arma un archivo. Un comando corre
 * dentro de una transacción y escribe su renglón en el rastro; un exporte que
 * dejara rastro de escritura mentiría sobre lo que hizo. La ruta resuelve la
 * sesión, esta función lee POR EL PUENTE —con los mismos permisos por campo que la
 * pantalla— y la ruta guarda el archivo.
 *
 * ── Por qué por el PUENTE y no con una consulta propia ───────────────────
 * Porque el puente ya recorta por rol campo por campo: el costo de un insumo no
 * lo ve el cajero, y un exporte con su propia consulta sería la puerta por la que
 * ese costo sale en un CSV. Lo que se exporta es EXACTAMENTE lo que esa persona ve
 * en la pantalla, ni una columna más.
 *
 * ── El rango va sobre el campo por el que la entidad se ordena ────────────
 * Las seis entidades de esa pantalla se ordenan por su fecha —`-fecha`,
 * `-created_date`, `-fecha_liquidacion`— y ése es el campo del rango. Si alguna se
 * ordenara por algo que no es una fecha, se exporta sin rango y se DICE en la
 * respuesta, en vez de filtrar por una columna que no es del tiempo.
 */

/** Tope de filas por exporte. Más que esto no es un reporte: es una copia. */
export const MAXIMO_FILAS_EXPORTE = 5_000;

export const FORMATOS = ['csv'] as const;
export type FormatoDeExporte = (typeof FORMATOS)[number];

export interface PeticionDeExporte {
  readonly entidad: string;
  readonly formato: FormatoDeExporte;
  /** ISO. Ambos opcionales: sin ellos se exporta lo más reciente. */
  readonly desde?: string;
  readonly hasta?: string;
}

export interface ExporteArmado {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  /** Cómo se llama el archivo cuando se descarga. */
  readonly nombre: string;
  readonly filas: number;
  /** El campo por el que se acotó el tiempo. `null` si no se pudo acotar. */
  readonly campoDelRango: string | null;
  /** `true` cuando se llegó al tope: el reporte está cortado y hay que decirlo. */
  readonly cortado: boolean;
}

/**
 * El campo de fecha por el que se acota, leído del mapa del puente.
 *
 * Del `ordenPorOmision` y no de una lista tecleada aquí: una lista propia diría
 * «fecha» el día que la entidad cambie de columna, y el rango se aplicaría sobre
 * algo que ya no existe.
 */
export function campoDelRango(entidad: string): string | null {
  const mapa = entidadMapeada(entidad);
  if (mapa === null) return null;
  // Sin orden por omisión no hay campo del tiempo que deducir, y eso NO es un
  // error: se exporta sin rango y quien llama lo dice.
  const orden = mapa.ordenPorOmision ?? '';
  const nombre = orden.startsWith('-') ? orden.slice(1) : orden;
  if (nombre === '') return null;
  // `fecha` es un instante y `dia` una fecha sin hora —`compras.fecha` es `date`—:
  // las dos acotan un periodo. Aceptar sólo `fecha` dejaba el exporte de compras
  // con TODO el histórico en vez del mes pedido, y sin que nada fallara.
  const conversion = mapa.campos[nombre]?.conversion;
  return conversion === 'fecha' || conversion === 'dia' ? nombre : null;
}

/**
 * Una celda de CSV, escapada como manda el RFC 4180.
 *
 * Con comillas cuando lleva coma, comilla o salto de línea, y las comillas de
 * dentro dobladas. Sin esto, el nombre de un producto con una coma —«Refresco
 * 600 ml, lata»— parte la fila en dos y el contador recibe un archivo que Excel
 * abre torcido sin avisar.
 *
 * Y el `=`, `+`, `-`, `@` al inicio van con un apóstrofo delante: Excel los
 * interpreta como FÓRMULA, y una celda que empieza con `=` es cómo un CSV
 * descargado ejecuta algo en la máquina del contador.
 */
export function celdaCsv(valor: unknown): string {
  return escapar(comoTexto(valor));
}

/**
 * El valor del puente como texto, POR TIPO y sin `String(unknown)`.
 *
 * Por tipo porque `String()` sobre algo que no se previó escribe `[object Object]`
 * en la celda, y una celda con esa frase es un dato perdido que nadie nota hasta
 * que el contador pregunta. Un `json` del puente —las opciones de una línea, las
 * capturas de un conteo— se serializa; una función o un símbolo no son un dato del
 * negocio y salen vacíos en vez de inventados.
 */
function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint' || typeof valor === 'boolean') {
    return valor.toString();
  }
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') return JSON.stringify(valor);
  return '';
}

/** Las comillas y las fórmulas. Ver la cabecera de `celdaCsv`. */
function escapar(texto: string): string {
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return /[",\n\r]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}

/** Las filas del puente como CSV, con la cabecera de sus columnas. */
export function aCsv(filas: readonly Record<string, unknown>[]): string {
  const columnas = [...new Set(filas.flatMap((fila) => Object.keys(fila)))];
  const cabecera = columnas.map(celdaCsv).join(',');
  const cuerpo = filas.map((fila) => columnas.map((c) => celdaCsv(fila[c])).join(','));
  // `\r\n` y BOM los pone quien escribe el archivo: aquí se arma el contenido.
  return [cabecera, ...cuerpo].join('\n');
}

/** Arma el exporte. NO guarda nada: eso es de quien tiene el almacén. */
export async function armarExporte(
  ambito: Ambito,
  peticion: PeticionDeExporte,
): Promise<ExporteArmado> {
  if (entidadMapeada(peticion.entidad) === null) {
    throw new ErrorDominio(
      'PUENTE_ENTIDAD_DESCONOCIDA',
      `La entidad «${peticion.entidad}» no existe en el puente.`,
    );
  }

  const campo = campoDelRango(peticion.entidad);
  const rango =
    campo === null
      ? {}
      : {
          rango: {
            campo,
            ...(peticion.desde === undefined ? {} : { desde: peticion.desde }),
            ...(peticion.hasta === undefined ? {} : { hasta: peticion.hasta }),
          },
        };

  const filas = await consultar(ambito, {
    entidad: peticion.entidad,
    operacion: 'list',
    limite: MAXIMO_FILAS_EXPORTE,
    ...rango,
  });

  const texto = aCsv(filas);
  // Con BOM: sin él, Excel en Windows abre los acentos como «Ã±» y el contador
  // devuelve el archivo diciendo que está roto.
  // El BOM por su código y no como carácter invisible en el fuente: un byte que
  // no se ve es un byte que alguien borra sin saber qué borró.
  const BOM = String.fromCharCode(0xfeff);
  // Y el archivo termina en CRLF, que es lo que pide el RFC 4180 y lo que Excel
  // espera: con un salto solo, la última fila puede llegar pegada a la nada.
  const bytes = new TextEncoder().encode(`${BOM}${texto}\r\n`);

  return {
    bytes,
    contentType: 'text/csv; charset=utf-8',
    nombre: nombreDelArchivo(peticion),
    filas: filas.length,
    campoDelRango: campo,
    cortado: filas.length >= MAXIMO_FILAS_EXPORTE,
  };
}

/** `ventas-2026-09-01-a-2026-09-30.csv`: se reconoce en la carpeta de descargas. */
function nombreDelArchivo(peticion: PeticionDeExporte): string {
  const dia = (iso: string | undefined): string | null =>
    iso === undefined ? null : (/^\d{4}-\d{2}-\d{2}$/.exec(iso.slice(0, 10))?.[0] ?? null);
  const desde = dia(peticion.desde);
  const hasta = dia(peticion.hasta);
  const periodo =
    desde === null && hasta === null ? 'todo' : `${desde ?? 'inicio'}-a-${hasta ?? 'hoy'}`;
  return `${peticion.entidad.toLowerCase()}-${periodo}.${peticion.formato}`;
}
