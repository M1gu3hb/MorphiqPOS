import { ErrorDominio } from '@morphiqpos/contracts';
import { cantidadATexto } from '@morphiqpos/domain/catalogo';
import { z } from 'zod';

import { equivalenciaCanonica } from './costeo.ts';
import { MAXIMO_LINEAS_DE_COMPRA } from './esquemas.ts';

/**
 * Lo que dice una plantilla guardada, leído SIN base de datos.
 *
 * Vive aparte de `plantillas.ts` por la misma razón que `costeo.ts` vive aparte
 * del comando: las dos decisiones que aquí se toman —cuántas líneas se admiten
 * y de dónde sale la equivalencia— son las que el verificador encontró rotas, y
 * una regla que sólo se puede probar con Postgres delante es una regla sin
 * prueba. Aquí son funciones puras y tienen la suya.
 */

const decimal = /^\d{1,10}(?:\.\d{1,4})?$/;

/** Un número guardado en el `jsonb`. Se acepta `number` por las plantillas viejas. */
const numeroGuardado = z
  .union([z.string(), z.number()])
  .transform((valor) => (typeof valor === 'number' ? String(valor) : valor.trim()))
  .refine((texto) => decimal.test(texto), 'La plantilla guarda un número que no se puede leer.');

export const lineaGuardada = z.object({
  ingrediente_id: z.uuid(),
  ingrediente_nombre: z.string().optional(),
  cantidad: numeroGuardado,
  unidad_compra: z.string().trim().min(1).max(30),
  costo_total: numeroGuardado,
  equivalencia: numeroGuardado.optional(),
});

export type LineaGuardada = z.infer<typeof lineaGuardada>;

/** Lo que hace falta saber del insumo para leer su línea. */
export interface InsumoDePlantilla {
  readonly id: string;
  readonly nombre: string;
  readonly unidadBase: string;
}

/**
 * Las líneas de una plantilla, validadas y ACOTADAS.
 *
 * El tope es el mismo que declara `entradaRegistrarCompra.lineas`, y esto es lo
 * que lo hace valer: `plantillas_compra.lineas` es un `jsonb` escribible directo
 * por el puente, así que sin este límite bastaba guardar una plantilla de 50 000
 * líneas y «usarla» para que UNA petición abriera una transacción con 50 000
 * `select … for update` sobre `insumos`. Cada venta que descontara uno de esos
 * insumos se quedaría esperando: la caja congelada por el camino gemelo del que
 * sí estaba protegido.
 */
export function leerLineasGuardadas(
  lineas: unknown,
  nombrePlantilla: string,
): readonly LineaGuardada[] {
  // El conteo se mira ANTES de validar línea por línea: con 50 000 líneas el
  // usuario tiene que leer que sobran, no que «no se pueden leer», y la
  // validación completa de 50 000 objetos ya sería trabajo regalado.
  const arreglo = z.array(z.unknown()).safeParse(lineas);
  if (arreglo.success && arreglo.data.length > MAXIMO_LINEAS_DE_COMPRA) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      `La plantilla «${nombrePlantilla}» tiene ${arreglo.data.length} líneas y una compra ` +
        `admite ${MAXIMO_LINEAS_DE_COMPRA}. Divídela en varias plantillas.`,
    );
  }

  const guardadas = z.array(lineaGuardada).min(1).max(MAXIMO_LINEAS_DE_COMPRA).safeParse(lineas);
  if (!guardadas.success) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      `La plantilla «${nombrePlantilla}» no tiene líneas que se puedan leer. Vuelve a guardarla.`,
    );
  }
  return guardadas.data;
}

/**
 * De dónde sale la equivalencia de una línea guardada. **Nunca se inventa.**
 *
 * Sólo hay dos orígenes legítimos (F1-04 §23.1):
 *
 *   1. la que la plantilla guardó, que la escribió este módulo tras comprobarla;
 *   2. la que fija el catálogo —3 kg de un insumo en gramos son 3000 g—, que no
 *      es una suposición sino una definición.
 *
 * No hay un tercero. La versión anterior caía en `insumos.cantidad_por_compra_default`
 * cuando la unidad era de empaque, y esa columna es justo la que el módulo
 * documenta como corrompida (`linea.ts`: la pantalla vieja le escribe la
 * CANTIDAD comprada, no la equivalencia). Con «Jitomate» en gramos y un
 * `cantidad_por_compra_default = 3` heredado de una compra de 3 cajas, repetir
 * la plantilla guardaba 9 g donde iban 36 000: el costo del insumo quedaba a
 * ~13 333 centavos por gramo, y `recalcularCostosRecetas` propagaba ese número
 * al margen de la carta entera, en la misma transacción y sin un solo error.
 * Un dato inventado que parece cierto es peor que no tener el dato: se para.
 */
export function equivalenciaDeLineaGuardada(
  linea: LineaGuardada,
  insumo: InsumoDePlantilla | undefined,
  nombrePlantilla: string,
): string {
  if (insumo === undefined) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      `La plantilla «${nombrePlantilla}» apunta a un insumo que ya no existe.`,
    );
  }

  if (linea.equivalencia !== undefined) return linea.equivalencia;

  const canonica = equivalenciaCanonica(linea.unidad_compra, insumo.unidadBase);
  if (canonica !== null) return cantidadATexto(canonica);

  throw new ErrorDominio(
    'COMPRA_INVALIDA',
    `La plantilla «${nombrePlantilla}» no dice cuántas ${insumo.unidadBase} trae una ` +
      `${linea.unidad_compra} de «${insumo.nombre}». Registra la compra capturando la ` +
      'equivalencia y vuelve a guardar la plantilla: a partir de ahí ya la lleva.',
  );
}
