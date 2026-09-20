import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

/**
 * LAS OPCIONES DE LA BEBIDA de la demostración de cafetería (F-027).
 *
 * ── Por qué esto tenía que existir ─────────────────────────────────────────
 * Porque una cafetería es el tamaño, la leche y la temperatura. Sin eso es una
 * tienda que vende vasos: el latte de 16 oz con avena no es otro producto del
 * catálogo —es el mismo con dos opciones— y ésa es justamente la diferencia
 * entre un POS de cafetería y un POS genérico.
 *
 * La demostración no tenía ninguna. `resetearDemo` BORRABA los tres niveles
 * —grupos, opciones y el enlace con el producto— y no sembraba ninguno, así que
 * `cafeteria/opciones-de-la-bebida` abría con su estado vacío: «esta bebida se
 * agrega tal cual · todavía no declara grupos de opciones». Ese vacío está bien
 * escrito y es honesto, y precisamente por eso escondía que el camino completo
 * —la vista `opciones_de_bebida` de la 175, la entidad `Modificador` del puente y
 * la pantalla— no se había visto funcionar nunca con datos.
 *
 * ── Qué se siembra, y por qué estos cuatro grupos ──────────────────────────
 * Los cuatro que la propia pantalla nombra en su estado vacío: «la leche, el
 * tamaño, la temperatura y los extras». Ni uno más: la demostración enseña la
 * mecánica, no el menú entero de una cadena.
 *
 * ── Lo que NO se siembra, dicho aquí ───────────────────────────────────────
 * `recetas.sustituible_por_grupo_id` se queda en nulo. La columna existe desde la
 * 084 y hoy NADIE la lee —ni el consumo al cobrar, ni ninguna pantalla—, así que
 * escribirla sería dar por conectado un camino que no está: la sustitución de la
 * línea de receta por la leche elegida no ocurre todavía. Lo que sí se escribe es
 * `insumo_sustituto_id` en cada opción de leche, porque de ahí sale el `agotado`
 * de la vista: «sin leche de avena» es un dato del almacén y no una marca que
 * alguien tenga que acordarse de poner.
 */

export interface ResumenBebidas {
  readonly gruposDeOpciones: number;
  readonly opcionesDeBebida: number;
  /** Cuántas bebidas quedaron con al menos un grupo colgado. */
  readonly bebidasConOpciones: number;
}

interface OpcionDemo {
  readonly nombre: string;
  /**
   * Lo que SUMA o RESTA al precio, firmado.
   *
   * Va en `delta_precio_centavos` y no en `precio_extra_centavos`, que la base
   * obliga a ser `>= 0`: «vaso propio» abarata, y con la columna vieja eso no se
   * puede expresar. La vista prefiere el delta cuando no es cero.
   */
  readonly deltaCentavos: bigint;
  /** Cuánto escala la receta entera. El 16 oz es 1.44. */
  readonly factor?: string;
  /** La clave del insumo con el que sustituye, para el `agotado` de la vista. */
  readonly sustituto?: string;
}

interface GrupoDemo {
  readonly nombre: string;
  readonly tipo: 'unica' | 'multiple';
  readonly obligatorio: boolean;
  /** Las bebidas a las que se cuelga, por su nombre EXACTO en la semilla. */
  readonly aplicaA: readonly string[];
  readonly opciones: readonly OpcionDemo[];
}

/**
 * Las bebidas que se piden por tamaño: las que la semilla llama «12 oz».
 *
 * Un frappé de 16 oz no lleva el grupo, y no es un olvido: ofrecer «12 oz» sobre
 * algo que se llama «16 oz» es la clase de contradicción que hace que nadie se
 * crea la pantalla.
 */
const DE_DOCE_ONZAS = [
  'Café americano 12 oz',
  'Latte 12 oz',
  'Capuchino 12 oz',
  'Mocha 12 oz',
  'Americano descafeinado 12 oz',
  'Latte de avena 12 oz',
  'Matcha latte 12 oz',
  'Chocolate caliente 12 oz',
] as const;

/**
 * Las que llevan LECHE ENTERA, que son las que se pueden cambiar de leche.
 *
 * El latte de avena y el matcha no: su leche viene elegida en la receta, y un
 * grupo «tipo de leche» encima de una bebida que ya declara la suya cobraría dos
 * veces la misma decisión.
 */
const CON_LECHE_ENTERA = [
  'Latte 12 oz',
  'Cortado 8 oz',
  'Capuchino 12 oz',
  'Mocha 12 oz',
  'Latte vainilla 16 oz',
  'Café helado 16 oz',
  'Frappé de caramelo 16 oz',
  'Chocolate caliente 12 oz',
] as const;

/** Las que se sirven calientes: la temperatura sólo significa algo ahí. */
const CALIENTES = [
  'Café americano 12 oz',
  'Latte 12 oz',
  'Espresso doble',
  'Cortado 8 oz',
  'Capuchino 12 oz',
  'Mocha 12 oz',
  'Latte vainilla 16 oz',
  'Americano descafeinado 12 oz',
  'Latte de avena 12 oz',
  'Chocolate caliente 12 oz',
] as const;

/** Todas las bebidas: a un café se le puede añadir algo siempre. */
const TODAS_LAS_BEBIDAS = [
  ...new Set([...DE_DOCE_ONZAS, ...CON_LECHE_ENTERA, ...CALIENTES]),
] as readonly string[];

const GRUPOS: readonly GrupoDemo[] = [
  {
    nombre: 'Tamaño',
    tipo: 'unica',
    // Obligatorio: un vaso sin tamaño no se puede servir.
    obligatorio: true,
    aplicaA: DE_DOCE_ONZAS,
    opciones: [
      { nombre: '12 oz', deltaCentavos: 0n },
      // El 16 oz escala la receta entera ×1.44, que es la razón de los dos
      // volúmenes y no un número redondo inventado.
      { nombre: '16 oz', deltaCentavos: 800n, factor: '1.44' },
    ],
  },
  {
    nombre: 'Leche',
    tipo: 'unica',
    obligatorio: false,
    aplicaA: CON_LECHE_ENTERA,
    opciones: [
      { nombre: 'Entera', deltaCentavos: 0n },
      { nombre: 'Deslactosada', deltaCentavos: 0n, sustituto: 'leche_deslactosada' },
      { nombre: 'Avena', deltaCentavos: 1200n, sustituto: 'leche_avena' },
    ],
  },
  {
    nombre: 'Temperatura',
    tipo: 'unica',
    obligatorio: false,
    aplicaA: CALIENTES,
    opciones: [
      { nombre: 'Normal', deltaCentavos: 0n },
      { nombre: 'Extra caliente', deltaCentavos: 0n },
      { nombre: 'Tibia', deltaCentavos: 0n },
    ],
  },
  {
    nombre: 'Extras',
    // El único de varios: se puede pedir shot extra Y crema.
    tipo: 'multiple',
    obligatorio: false,
    aplicaA: TODAS_LAS_BEBIDAS,
    opciones: [
      { nombre: 'Shot extra', deltaCentavos: 1500n },
      { nombre: 'Crema batida', deltaCentavos: 1000n },
      { nombre: 'Jarabe de vainilla', deltaCentavos: 800n },
      // NEGATIVO: el descuento por traer su vaso. Es el caso que obligó a que la
      // 084 añadiera una columna firmada.
      { nombre: 'Vaso propio', deltaCentavos: -300n },
    ],
  },
];

/**
 * Siembra los cuatro grupos y los cuelga de las bebidas que les toca.
 *
 * `productoPorNombre` viene de quien sembró el catálogo: el nombre es la única
 * llave que la semilla tiene, igual que en `sembrarSalon`. Un nombre que no
 * exista aborta en vez de sembrar a medias — un grupo colgado de nada es un grupo
 * que la pantalla enseña y que no cambia el precio de ninguna bebida.
 */
export async function sembrarOpcionesDeBebida(
  tx: Transaccion,
  organizacionId: string,
  productoPorNombre: ReadonlyMap<string, string>,
  insumoPorClave: ReadonlyMap<string, { readonly id: string; readonly unidad: string }>,
): Promise<ResumenBebidas> {
  let opcionesDeBebida = 0;
  const conOpciones = new Set<string>();

  for (const [ordenDelGrupo, grupo] of GRUPOS.entries()) {
    const fila = await tx
      .insertInto('modificadores')
      .values({
        organizacion_id: organizacionId,
        nombre: grupo.nombre,
        obligatorio: grupo.obligatorio,
        tipo: grupo.tipo,
        activo: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    for (const [orden, opcion] of grupo.opciones.entries()) {
      const sustituto =
        opcion.sustituto === undefined ? null : (insumoPorClave.get(opcion.sustituto)?.id ?? null);
      if (opcion.sustituto !== undefined && sustituto === null) {
        throw new ErrorDominio(
          'INVENTARIO_INVALIDO',
          `La opción «${opcion.nombre}» sustituye con el insumo «${opcion.sustituto}», que la ` +
            'semilla de esta demostración no tiene.',
        );
      }
      await tx
        .insertInto('modificador_opciones')
        .values({
          modificador_id: fila.id,
          nombre: opcion.nombre,
          // Cero: el precio va por el delta firmado. Ver `OpcionDemo`.
          precio_extra_centavos: 0n,
          delta_precio_centavos: opcion.deltaCentavos,
          factor_cantidad: opcion.factor ?? '1',
          insumo_sustituto_id: sustituto,
          orden,
          activa: true,
        })
        .execute();
      opcionesDeBebida += 1;
    }

    for (const nombre of grupo.aplicaA) {
      const productoId = productoPorNombre.get(nombre);
      if (productoId === undefined) {
        throw new ErrorDominio(
          'CONFIGURACION_INVALIDA',
          `El grupo «${grupo.nombre}» se cuelga de «${nombre}», que no está en la semilla de ` +
            'esta demostración. Si la bebida se renombró, renómbrala también aquí.',
        );
      }
      await tx
        .insertInto('producto_modificadores')
        .values({
          organizacion_id: organizacionId,
          producto_id: productoId,
          modificador_id: fila.id,
          orden: ordenDelGrupo,
        })
        .execute();
      conOpciones.add(nombre);
    }
  }

  return {
    gruposDeOpciones: GRUPOS.length,
    opcionesDeBebida,
    bebidasConOpciones: conOpciones.size,
  };
}
