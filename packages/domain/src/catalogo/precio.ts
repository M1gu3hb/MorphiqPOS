import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { redondear, type Centavos } from '../dinero';
import { cantidad, ESCALA_CANTIDAD, type Cantidad } from './cantidades';
import {
  resolverTipoVenta,
  type CapturaCantidad,
  type PrecioLinea,
  type ProductoParaPrecio,
} from './tipos';
import { convertirUnidad } from './unidades';
import { calcularMlPorPorcion } from './porciones';

function invalido(mensaje: string): never {
  throw new ErrorDominio('CATALOGO_INVALIDO', mensaje);
}

function positiva(texto: string): Cantidad {
  const valor = cantidad(texto);
  if (valor === 0n) invalido('La cantidad debe ser mayor que cero.');
  return valor;
}

function validarPrecio(precio: Centavos): void {
  if (precio < 0n) invalido('El precio no puede ser negativo.');
}

function cantidadDeVenta(producto: ProductoParaPrecio, captura: CapturaCantidad): Cantidad {
  const capturada = positiva(captura.cantidad);
  if (producto.tipoVenta === 'porcion_contenedor') {
    calcularMlPorPorcion(producto);
    if (captura.unidad !== 'porcion' || capturada % ESCALA_CANTIDAD !== 0n) {
      invalido('Captura un número entero de porciones.');
    }
    return capturada;
  }
  const unidad =
    producto.tipoVenta === 'variable_medida' ? producto.unidadVariable : producto.unidadVenta;
  const valor = convertirUnidad(capturada, captura.unidad, unidad);
  if (['pieza', 'caja', 'paquete'].includes(unidad) && valor % ESCALA_CANTIDAD !== 0n) {
    invalido('Las piezas y empaques se venden completos.');
  }
  if (producto.tipoVenta === 'variable_medida') {
    const minimo = producto.minimo === undefined ? undefined : positiva(producto.minimo);
    const maximo = producto.maximo === undefined ? undefined : positiva(producto.maximo);
    if (minimo !== undefined && maximo !== undefined && minimo > maximo) {
      invalido('El mínimo no puede superar el máximo.');
    }
    if ((minimo !== undefined && valor < minimo) || (maximo !== undefined && valor > maximo)) {
      invalido('La cantidad queda fuera del rango de venta.');
    }
    // Incrementos múltiplos desde cero, expresados en la unidad de precio.
    if (producto.incremento !== undefined && valor % positiva(producto.incremento) !== 0n) {
      invalido('La cantidad no respeta el incremento de venta.');
    }
  }
  return valor;
}

/** Subtotal de mercancía, sin impuestos ni descuentos de orden (carril A).
 * Redondea una sola vez con dinero/redondear, al cerrar la línea. */
export function precioDeLinea(
  producto: ProductoParaPrecio,
  captura: CapturaCantidad,
  mayoreoActivo = false,
): PrecioLinea {
  resolverTipoVenta(producto.tipoVenta);
  validarPrecio(producto.precioCentavos);
  const valor = cantidadDeVenta(producto, captura);
  let precio = producto.precioCentavos;
  let esMayoreo = false;
  if (producto.mayoreo !== undefined) {
    const minimo = positiva(producto.mayoreo.minimo);
    validarPrecio(producto.mayoreo.precioCentavos);
    if (mayoreoActivo && valor >= minimo) {
      precio = producto.mayoreo.precioCentavos;
      esMayoreo = true;
    }
  }
  return {
    subtotalCentavos: redondear(precio * valor, ESCALA_CANTIDAD),
    precioUnitarioCentavos: precio,
    esMayoreo,
  };
}
