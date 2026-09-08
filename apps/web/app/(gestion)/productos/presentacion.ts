export type TipoVentaVista = 'precio_fijo' | 'variable_medida' | 'porcion_contenedor' | 'servicio';

export interface ProductoVista {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly imagenUrl: string;
  readonly categoria: string;
  readonly marca: string;
  readonly sku: string;
  readonly codigoBarras: string;
  readonly precioVentaCentavos: string;
  readonly costoUnitarioCentavos: string;
  readonly precioMayoreoCentavos: string;
  readonly cantidadMinimaMayoreo: string;
  readonly tipoVenta: TipoVentaVista;
  readonly visibleEnPos: boolean;
}

const TIPOS: Readonly<Record<TipoVentaVista, string>> = {
  precio_fijo: 'Precio fijo',
  variable_medida: 'Peso o medida',
  porcion_contenedor: 'Porción',
  servicio: 'Servicio',
};

export function etiquetaTipoVenta(tipo: string): string {
  if (
    tipo === 'precio_fijo' ||
    tipo === 'variable_medida' ||
    tipo === 'porcion_contenedor' ||
    tipo === 'servicio'
  ) {
    return TIPOS[tipo];
  }
  return 'Especial';
}

export function pesosDesdeCentavos(valor: string): string {
  const centavos = BigInt(valor);
  const negativo = centavos < 0n;
  const magnitud = negativo ? -centavos : centavos;
  const enteros = (magnitud / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimales = (magnitud % 100n).toString().padStart(2, '0');
  return `${negativo ? '-' : ''}$${enteros}.${decimales}`;
}

export function centavosDesdePesos(valor: string): string {
  const limpio = valor.trim().replaceAll(',', '');
  const coincidencia = /^(\d+)(?:\.(\d{0,2}))?$/.exec(limpio);
  if (coincidencia === null) return '0';
  const enteros = coincidencia[1] ?? '0';
  const decimales = (coincidencia[2] ?? '').padEnd(2, '0');
  return (BigInt(enteros) * 100n + BigInt(decimales === '' ? '0' : decimales)).toString();
}

function normalizarBusqueda(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}

function trigramas(valor: string): Set<string> {
  const conjunto = new Set<string>();
  const relleno = `  ${valor} `;
  for (let indice = 0; indice <= relleno.length - 3; indice += 1) {
    conjunto.add(relleno.slice(indice, indice + 3));
  }
  return conjunto;
}

function similitud(izquierda: string, derecha: string): number {
  const a = trigramas(izquierda);
  const b = trigramas(derecha);
  let interseccion = 0;
  for (const elemento of a) {
    if (b.has(elemento)) interseccion += 1;
  }
  return interseccion / (a.size + b.size - interseccion);
}

/** Vista inmediata; la consulta remota usa el equivalente pg_trgm. */
export function coincideBusqueda(texto: string, termino: string): boolean {
  const objetivo = normalizarBusqueda(termino);
  if (objetivo === '') return true;
  const contenido = normalizarBusqueda(texto);
  if (contenido.includes(objetivo)) return true;
  return contenido.split(/\s+/).some((palabra) => similitud(palabra, objetivo) >= 0.45);
}
