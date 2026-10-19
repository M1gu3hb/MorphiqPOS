/**
 * Una tabla como CSV que Excel abre bien a la primera (C.10 de la 2.4).
 *
 * ── Tres cosas que se hacen mal casi siempre ─────────────────────────────
 * 1. El BOM de UTF-8 delante: sin él, Excel en español lee «Pequeña» como «PequeÃ±a».
 * 2. Comillas en cada campo que lleve coma, comilla o salto: «Coca, 600» sin comillas son
 *    dos columnas y la tabla se corre desde ahí.
 * 3. INYECCIÓN DE FÓRMULAS: un motivo tecleado como `=HYPERLINK(...)` se EJECUTA al abrir el
 *    archivo. Un campo que empieza por `=`, `+`, `-`, `@` o tabulador se antepone con `'`
 *    y queda como texto. Los importes no pasan por aquí: salen como número, sin signo `$`.
 */

export interface ColumnaCsv<F> {
  readonly titulo: string;
  readonly valor: (fila: F) => string | number | null;
}

const PELIGROSO = /^[=+\-@\t\r]/;

export function campoCsv(valor: string | number | null): string {
  if (valor === null) return '';
  if (typeof valor === 'number') return String(valor);
  const seguro = PELIGROSO.test(valor) ? `'${valor}` : valor;
  return /[",\n\r]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}

export function csvDe<F>(columnas: readonly ColumnaCsv<F>[], filas: readonly F[]): string {
  const cabecera = columnas.map((c) => campoCsv(c.titulo)).join(',');
  const cuerpo = filas.map((fila) => columnas.map((c) => campoCsv(c.valor(fila))).join(','));
  return `\uFEFF${[cabecera, ...cuerpo].join('\r\n')}\r\n`;
}

/** Los centavos como número de pesos con dos decimales, sin símbolo: una celda que suma. */
export function pesosParaCsv(centavos: number | null): number | null {
  return centavos === null ? null : Math.round(centavos) / 100;
}

/** Baja el texto como archivo, sin servidor de por medio. */
export function descargarTexto(
  nombre: string,
  texto: string,
  tipo = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
