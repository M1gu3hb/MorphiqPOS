import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { altaRapida, type ResultadoAltaRapida } from '../catalogo/alta-rapida.ts';
import { definirComando } from '../definicion.ts';

/**
 * `compras.alta_material` — el renglón de la nota que no casó con nada (F-631).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `ferreteria/Entradas.tsx` pone un botón ALTA en cada renglón sin emparejar y
 * publicaba en `/api/entradas/alta-material`, **una ruta que no existía**. Sin ella,
 * un renglón sin emparejar SE QUEDA FUERA de la entrada: el material entra al
 * anaquel y el inventario no se entera, que es justo el defecto que la pantalla
 * existe para cerrar. Y el botón, además, es lo que hace que la próxima nota del
 * mismo proveedor se empareje sola.
 *
 * ── Por qué es el ALTA RÁPIDA y no el alta completa ──────────────────────
 * Porque quien está capturando tiene al repartidor esperando y doscientos renglones
 * detrás. El alta completa —categoría, línea, atributos, presentaciones— tiene su
 * pantalla, y pedirla aquí es lo mismo que no tener el botón: nadie contesta ocho
 * campos con alguien esperando. Se crea el material con su nombre y su costo, y
 * queda MARCADO como incompleto, que es la lista de pendientes del catálogo.
 *
 * ── Por qué el PRECIO nace en cero, y por qué eso está bien dicho ────────
 * Porque en una entrada no se sabe a cómo se va a vender: eso se decide con el
 * margen, y para eso está `catalogo.aplicar_precio_sugerido`, que la misma pantalla
 * ofrece en el aviso de subida de costo. Un precio inventado aquí —costo más un
 * porcentaje redondo— es el que acaba en la etiqueta del anaquel sin que nadie lo
 * revise. El cero sale en la lista de pendientes; un precio inventado, no.
 *
 * ── Y por qué la CLAVE DEL PROVEEDOR viaja aunque no se guarde aquí ──────
 * La memoria que empareja la nota siguiente es `compra_lineas.clave_proveedor`, y
 * esa fila nace cuando la entrada se guarda, no cuando se da de alta el material.
 * La clave se recibe y se devuelve para que la pantalla la ponga en el renglón que
 * acaba de resolver: sin eso, el renglón queda emparejado en la pantalla y la
 * entrada se guardaría otra vez sin clave, y la tercera nota volvería a fallar.
 */

const RECIBE = ['almacen', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAltaDeMaterial = z.object({
  /** La clave en la hoja DEL PROVEEDOR. Se devuelve para cerrar el círculo. */
  codigoProveedor: z.string().trim().min(1).max(60),
  /** Lo que dice la nota. Es el nombre con el que nace el material. */
  descripcion: z.string().trim().min(2).max(120),
  /**
   * Lo que costó, como TEXTO y en pesos. Vacío es «no sé».
   *
   * Texto porque `Math.round(x * 100)` en el navegador pierde el medio centavo
   * justo en el caso que importa, y un costo mal nacido miente en el margen todos
   * los días.
   */
  costo: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Pesos y centavos.'),
    ])
    .default(''),
});

export interface ResultadoAltaDeMaterial extends ResultadoAltaRapida {
  /** La clave del proveedor, de vuelta: la pantalla la pone en su renglón. */
  readonly codigoProveedor: string;
}

export const altaDeMaterial = definirComando<
  Transaccion,
  typeof entradaAltaDeMaterial,
  ResultadoAltaDeMaterial
>({
  nombre: 'compras.alta_material',
  entidad: 'producto',
  escribe: true,
  roles: [...RECIBE],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAltaDeMaterial,
  async ejecutar(ctx, entrada) {
    // El alta entera, tal cual: el producto, su insumo, la existencia inicial y la
    // marca de incompleto. Copiar aquí la mitad daría dos altas distintas, y la de
    // este comando sería la que nadie revisa.
    //
    // `codigo` vacío a propósito: la clave de la hoja del proveedor NO es el código
    // de barras del material —es el nombre que ESE proveedor le da— y ponerla ahí
    // haría que el escáner del mostrador no encontrara nunca la pieza. El sistema
    // genera su SKU interno.
    const creado = await altaRapida.ejecutar(ctx, {
      codigo: null,
      nombre: entrada.descripcion,
      // Cero, y sale en la lista de pendientes. Ver la cabecera.
      precio: '0',
      costo: entrada.costo,
      categoriaId: null,
      // La existencia la pone la ENTRADA, con su renglón y su movimiento: ponerla
      // aquí la contaría dos veces.
      stockInicial: '',
      stockMinimo: '',
    });

    return { ...creado, codigoProveedor: entrada.codigoProveedor };
  },
});
