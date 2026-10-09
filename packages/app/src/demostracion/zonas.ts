import type { Transaccion } from '@morphiqpos/data';

/**
 * LAS ZONAS DEL ANAQUEL DE LA TIENDA DE DEMOSTRACIÓN (F-149, D-33 de la 2.4).
 *
 * Sin zonas, el conteo cíclico de la demo decía «Hoy no toca ninguna zona» y no había qué
 * enseñar: el renglón que contesta «¿quién me está robando?» se quedaba sin pantalla. La
 * tienda recién reseteada nace con el anaquel partido como se camina una tiendita —lo que
 * más se mueve, más seguido— y cada producto en la suya, por su nombre.
 */

interface ZonaDeDemo {
  readonly nombre: string;
  readonly dias: number;
  /** Las palabras del nombre del producto que lo ponen aquí. */
  readonly palabras: readonly string[];
}

/** Lo que no casa con ninguna zona: el anaquel de siempre. */
const ABARROTES: ZonaDeDemo = { nombre: 'Abarrotes', dias: 14, palabras: [] };

/** En el orden en que se recorre la tienda. Lo que no casa con ninguna va a la última. */
const ZONAS_DE_TIENDA: readonly ZonaDeDemo[] = [
  {
    nombre: 'Refrigerador',
    dias: 7,
    palabras: ['leche', 'crema', 'queso', 'yogur', 'huevo'],
  },
  {
    nombre: 'Bebidas',
    dias: 7,
    palabras: ['refresco', 'agua', 'jugo', 'cerveza'],
  },
  {
    nombre: 'Limpieza',
    dias: 30,
    palabras: ['detergente', 'papel', 'jabón', 'cloro'],
  },
  ABARROTES,
];

export interface ResumenZonas {
  readonly zonas: number;
  readonly productosEnZona: number;
}

function zonaDe(nombre: string): ZonaDeDemo {
  const minusculas = nombre.toLocaleLowerCase('es-MX');
  return ZONAS_DE_TIENDA.find((z) => z.palabras.some((p) => minusculas.includes(p))) ?? ABARROTES;
}

export async function sembrarZonasDeTienda(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<ResumenZonas> {
  const creadas = await tx
    .insertInto('zonas_anaquel')
    .values(
      ZONAS_DE_TIENDA.map((z, i) => ({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        nombre: z.nombre,
        orden: i + 1,
        dias_entre_conteos: z.dias,
      })),
    )
    .returning(['id', 'nombre'])
    .execute();
  const idDe = new Map(creadas.map((z) => [z.nombre, z.id]));

  const insumos = await tx
    .selectFrom('insumos')
    .select(['id', 'nombre'])
    .where('organizacion_id', '=', organizacionId)
    .where('activo', '=', true)
    .execute();

  let productosEnZona = 0;
  for (const zona of ZONAS_DE_TIENDA) {
    const ids = insumos.filter((i) => zonaDe(i.nombre) === zona).map((i) => i.id);
    const zonaId = idDe.get(zona.nombre);
    if (ids.length === 0 || zonaId === undefined) continue;
    await tx
      .updateTable('insumos')
      .set({ zona_id: zonaId })
      .where('organizacion_id', '=', organizacionId)
      .where('id', 'in', ids)
      .execute();
    productosEnZona += ids.length;
  }
  return { zonas: creadas.length, productosEnZona };
}
