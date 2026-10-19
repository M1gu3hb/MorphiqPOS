/**
 * Las líneas del cobro de la tienda, y su aritmética.
 *
 * La venta vive en la pantalla hasta que se cobra o se aparta, así que el total que se dice
 * en voz alta lo calcula el navegador. Y el servidor RECHAZA si el suyo es distinto
 * (`TOTAL_DESACTUALIZADO`): por eso cada subtotal se calcula EXACTAMENTE como el dominio
 * —precio por cantidad en diezmilésimas, redondeado al centavo con la mitad hacia arriba,
 * línea por línea— y nunca con punto flotante sobre pesos.
 */

/** La escala de las cantidades: `numeric(14,4)`, diezmilésimas. */
const ESCALA = 10_000n;
const CANTIDAD = /^\d{1,10}(?:\.\d{1,4})?$/;

/** Lo que el catálogo trae de un producto, ya en centavos. */
export interface ProductoDeCobro {
  readonly id: string;
  readonly nombre: string;
  readonly codigoBarras: string | null;
  /** El precio de UNA unidad de venta: la pieza, o el kilo de lo que se vende a granel. */
  readonly precioCentavos: number;
  /** `kg` o `g` cuando se vende por medida (F-148); nulo si es por pieza. */
  readonly unidadDeMedida: string | null;
  readonly existencia: number | null;
}

/** Una presentación del catálogo: la caja de 24, el six, el cigarro suelto (F-147). */
export interface PresentacionDeCobro {
  readonly id: string;
  readonly productoId: string;
  readonly nombre: string;
  /** Unidades base que trae, como texto: `'24'`, `'0.05'`. */
  readonly factor: string;
  readonly codigoBarras: string | null;
  /** Su precio propio, o nulo: entonces se deriva del factor, como en el servidor. */
  readonly precioCentavos: number | null;
}

export interface LineaDeVenta {
  /** Única en la lista: el producto, la presentación, o cada pesada de granel. */
  readonly clave: string;
  readonly productoId: string;
  readonly presentacionId: string | null;
  readonly nombre: string;
  readonly precioCentavos: number;
  /** Texto decimal: `'3'`, `'0.5600'`. */
  readonly cantidad: string;
  /** Cómo se dice la cantidad: `kg`, `caja (24 pz)`, o nulo para piezas. */
  readonly unidad: string | null;
  readonly granel: boolean;
  readonly sinExistencia: boolean;
}

export function diezmilesimas(cantidad: string): bigint {
  if (!CANTIDAD.test(cantidad)) throw new Error(`Cantidad mal escrita: ${cantidad}`);
  const [entera = '0', decimal = ''] = cantidad.split('.');
  return BigInt(entera) * ESCALA + BigInt(decimal.padEnd(4, '0'));
}

export function textoDeDiezmilesimas(valor: bigint): string {
  const entera = valor / ESCALA;
  const decimal = (valor % ESCALA).toString().padStart(4, '0').replace(/0+$/, '');
  return decimal === '' ? entera.toString() : `${entera.toString()}.${decimal}`;
}

/** `precio × cantidad`, redondeado al centavo como `porCantidad` del dominio. */
export function porCantidad(precioCentavos: number, cantidad: string): number {
  const producto = BigInt(precioCentavos) * diezmilesimas(cantidad);
  return Number((producto * 2n + ESCALA) / (ESCALA * 2n));
}

export function subtotalDe(linea: LineaDeVenta): number {
  return porCantidad(linea.precioCentavos, linea.cantidad);
}

export function totalDe(lineas: readonly LineaDeVenta[]): number {
  return lineas.reduce((suma, linea) => suma + subtotalDe(linea), 0);
}

/** Cuántos artículos van: las piezas y las cajas cuentan por unidad; cada pesada, una. */
export function articulosDe(lineas: readonly LineaDeVenta[]): number {
  return lineas.reduce(
    (suma, l) => suma + (l.granel ? 1 : Number(diezmilesimas(l.cantidad) / ESCALA)),
    0,
  );
}

/** El IVA ya venía DENTRO del precio: 16 de cada 116 pesos cobrados. Se desglosa, no se suma. */
export function ivaIncluido(total: number): number {
  return Math.round((total * 16) / 116);
}

function sinExistencia(producto: ProductoDeCobro): boolean {
  // Existencia 0 NO bloquea: se agrega y se marca. Bloquear aquí es perder una venta real
  // por un dato de inventario que casi nunca está al día.
  return typeof producto.existencia === 'number' && producto.existencia <= 0;
}

/** Suma o resta piezas. Al llegar a cero la línea desaparece: un «0 ×» no es nada. */
export function conCantidad(
  lineas: readonly LineaDeVenta[],
  clave: string,
  paso: number,
): readonly LineaDeVenta[] {
  return lineas
    .map((l) => {
      if (l.clave !== clave || l.granel) return l;
      const nueva = diezmilesimas(l.cantidad) + BigInt(paso) * ESCALA;
      return { ...l, cantidad: textoDeDiezmilesimas(nueva < 0n ? 0n : nueva) };
    })
    .filter((l) => diezmilesimas(l.cantidad) > 0n);
}

/** El mismo código INCREMENTA su línea; nunca apila un renglón nuevo. */
export function conProducto(
  lineas: readonly LineaDeVenta[],
  producto: ProductoDeCobro,
): readonly LineaDeVenta[] {
  if (lineas.some((l) => l.clave === producto.id)) return conCantidad(lineas, producto.id, 1);
  return [
    ...lineas,
    {
      clave: producto.id,
      productoId: producto.id,
      presentacionId: null,
      nombre: producto.nombre,
      precioCentavos: producto.precioCentavos,
      cantidad: '1',
      unidad: null,
      granel: false,
      sinExistencia: sinExistencia(producto),
    },
  ];
}

/** El precio de una presentación: el suyo, o el factor por el de la pieza (como el servidor). */
export function precioDePresentacion(
  producto: ProductoDeCobro,
  presentacion: PresentacionDeCobro,
): number {
  return presentacion.precioCentavos ?? porCantidad(producto.precioCentavos, presentacion.factor);
}

/** F-147 · La caja entra como `1 × caja (24 pz)` y el servidor descuenta 24. */
export function conPresentacion(
  lineas: readonly LineaDeVenta[],
  producto: ProductoDeCobro,
  presentacion: PresentacionDeCobro,
): readonly LineaDeVenta[] {
  const clave = `${producto.id}:${presentacion.id}`;
  if (lineas.some((l) => l.clave === clave)) return conCantidad(lineas, clave, 1);
  return [
    ...lineas,
    {
      clave,
      productoId: producto.id,
      presentacionId: presentacion.id,
      nombre: producto.nombre,
      precioCentavos: precioDePresentacion(producto, presentacion),
      cantidad: '1',
      unidad: `${presentacion.nombre.toLocaleLowerCase('es-MX')} (${presentacion.factor} pz)`,
      granel: false,
      sinExistencia: sinExistencia(producto),
    },
  ];
}

/** F-148 · Cada pesada es su propia línea: dos bolsas de jamón no son «× 2». */
export function conGranel(
  lineas: readonly LineaDeVenta[],
  producto: ProductoDeCobro,
  cantidad: string,
  unidad: string,
): readonly LineaDeVenta[] {
  const pesadas = lineas.filter((l) => l.productoId === producto.id && l.granel).length;
  return [
    ...lineas,
    {
      clave: `${producto.id}:pesada:${String(pesadas + 1)}`,
      productoId: producto.id,
      presentacionId: null,
      nombre: producto.nombre,
      precioCentavos: producto.precioCentavos,
      cantidad,
      unidad,
      granel: true,
      sinExistencia: sinExistencia(producto),
    },
  ];
}

/** Lo que viaja al servidor: qué y cuánto. El precio lo pone él. */
export function paraElServidor(lineas: readonly LineaDeVenta[]) {
  return lineas.map((l) => ({
    productoId: l.productoId,
    cantidad: l.cantidad,
    ...(l.presentacionId === null ? {} : { presentacionId: l.presentacionId }),
  }));
}
