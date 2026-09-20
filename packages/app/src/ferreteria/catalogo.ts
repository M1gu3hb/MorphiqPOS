import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { mismaMedida, normalizarMedida } from '@morphiqpos/domain/catalogo';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-059, F-060 y F-201 · El catálogo que sí se puede buscar.
 *
 * ── El problema que esto resuelve, dicho sin adornos ─────────────────────
 * «Tornillo» devuelve 340 resultados sin orden. El mostradorista no va a usar
 * el sistema: va a usar su memoria. Y en ese momento el inventario, el margen y
 * los faltantes se vuelven ficción, porque lo que salió del anaquel no es lo
 * que se tecleó. La búsqueda por atributo no es una comodidad: es la condición
 * para que todo lo demás signifique algo.
 *
 * ── Por qué el servidor normaliza, y no la pantalla ──────────────────────
 * Porque `1/4"`, `.25` y `6.35 mm` tienen que caer en el mismo número, y si la
 * conversión vive en el navegador hay tantas conversiones como versiones del
 * navegador haya instaladas. Un catálogo con dos normalizaciones distintas es
 * un catálogo con el mismo tornillo dos veces.
 *
 * ── Por qué la búsqueda tolera y el alta no ──────────────────────────────
 * Buscar `1/2` y encontrar la llave de 13 mm es lo que el mostradorista hace
 * todos los días. Dar de alta `1/2` como si fuera 13 mm sería fundir dos claves
 * distintas del fabricante. La tolerancia pertenece a quien busca, no a quien
 * captura.
 */

const ROLES_CATALOGO = ['gerente', 'administrador', 'dueno', 'almacen'] as const;
/** Buscar lo hace quien vende, que es el punto entero de la función. */
const ROLES_BUSQUEDA = ['cajero', 'mesero', ...ROLES_CATALOGO] as const;

export const entradaDeclararAtributo = z.object({
  productoId: z.uuid(),
  clave: z.string().trim().min(1).max(40),
  /** Lo que se teclea: `'1/4"'`, `'galvanizado'`, `'13 mm'`. */
  valor: z.string().trim().min(1).max(60),
  /** `medida` normaliza a micrómetros; `lista` guarda el texto. */
  tipo: z.enum(['medida', 'lista']),
});

export const entradaBuscarMaterial = z.object({
  /** Los filtros que el mostradorista fue apretando. */
  atributos: z
    .array(
      z.object({
        clave: z.string().trim().min(1).max(40),
        valor: z.string().trim().min(1).max(60),
        tipo: z.enum(['medida', 'lista']),
      }),
    )
    .min(1)
    .max(6),
  /**
   * Cuántas micras de diferencia siguen siendo la misma pieza. `1/2"` son
   * 12,700 y la llave de 13 mm son 13,000: sin tolerancia no se encuentran.
   */
  toleranciaMicras: z.number().int().min(0).max(5_000).default(300),
  limite: z.number().int().min(1).max(50).default(20),
});

export interface ResultadoAtributo {
  readonly atributoId: string;
  readonly clave: string;
  readonly valorOriginal: string;
  readonly valorNormalizado: string | null;
}

export interface MaterialEncontrado {
  readonly productoId: string;
  readonly nombre: string;
  readonly ubicacion: string | null;
  readonly precioVentaCentavos: string;
  /** Cuántos de los filtros pedidos casaron. Ordena el resultado. */
  readonly atributosQueCasan: number;
}

export interface ResultadoBusqueda {
  readonly encontrados: readonly MaterialEncontrado[];
  readonly filtros: number;
}

export const declararAtributo = definirComando<
  Transaccion,
  typeof entradaDeclararAtributo,
  ResultadoAtributo
>({
  nombre: 'catalogo.declarar_atributo',
  entidad: 'producto_atributo',
  escribe: true,
  roles: [...ROLES_CATALOGO],
  // Los atributos son de catálogo: existen en los cinco paquetes aunque sólo
  // ferretería, refaccionaria y materiales los usen a diario.
  paquetes: PAQUETES_TODOS,
  entrada: entradaDeclararAtributo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('cargar_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no está en este catálogo.');
    }

    // El original va tal cual; el normalizado sólo si es medida. Un atributo de
    // lista con valor normalizado haría que «galvanizado» tuviera un diámetro.
    const medida = entrada.tipo === 'medida' ? normalizarMedida(entrada.valor) : null;

    const fila = await ctx.paso('declarar', () =>
      ctx.tx
        .insertInto('producto_atributos')
        .values({
          organizacion_id: organizacionId,
          producto_id: entrada.productoId,
          clave: entrada.clave,
          valor_texto: medida === null ? entrada.valor : null,
          valor_normalizado: medida === null ? null : medida.micras,
          valor_original: entrada.valor,
          created_at: ctx.ahora,
        })
        .onConflict((oc) =>
          oc.columns(['producto_id', 'clave']).doUpdateSet({
            valor_texto: medida === null ? entrada.valor : null,
            valor_normalizado: medida === null ? null : medida.micras,
            valor_original: entrada.valor,
          }),
        )
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: entrada.productoId,
      payload: {
        clave: entrada.clave,
        valorOriginal: entrada.valor,
        valorNormalizado: medida === null ? null : medida.micras.toString(),
        sistema: medida?.sistema ?? null,
      },
    });

    return {
      atributoId: fila.id,
      clave: entrada.clave,
      valorOriginal: entrada.valor,
      valorNormalizado: medida === null ? null : medida.micras.toString(),
    };
  },
});

export const buscarMaterial = definirComando<
  Transaccion,
  typeof entradaBuscarMaterial,
  ResultadoBusqueda
>({
  nombre: 'catalogo.buscar_material',
  entidad: 'producto',
  escribe: false,
  roles: [...ROLES_BUSQUEDA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaBuscarMaterial,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const tolerancia = BigInt(entrada.toleranciaMicras);

    // Un mapa producto → cuántos filtros casaron. Se cuenta en memoria y no en
    // SQL porque la tolerancia de medida no es una igualdad: `1/2"` casa con
    // 13 mm y un `where =` no lo encuentra nunca.
    const casan = new Map<string, number>();

    for (const filtro of entrada.atributos) {
      const filas = await ctx.paso('leer_atributo', () =>
        ctx.tx
          .selectFrom('producto_atributos')
          .select([
            'producto_id as productoId',
            'valor_texto as texto',
            'valor_normalizado as micras',
          ])
          .where('organizacion_id', '=', organizacionId)
          .where('clave', '=', filtro.clave)
          .execute(),
      );

      const buscado = filtro.tipo === 'medida' ? normalizarMedida(filtro.valor).micras : null;

      for (const fila of filas) {
        const casa =
          buscado === null
            ? // El texto se compara sin importar mayúsculas: nadie teclea
              // «Galvanizado» dos veces igual.
              (fila.texto ?? '').toLowerCase() === filtro.valor.toLowerCase()
            : fila.micras !== null && mismaMedida(fila.micras, buscado, tolerancia);

        if (casa) casan.set(fila.productoId, (casan.get(fila.productoId) ?? 0) + 1);
      }
    }

    if (casan.size === 0) return { encontrados: [], filtros: entrada.atributos.length };

    const productos = await ctx.paso('cargar_productos', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'precio_venta_centavos as precio', 'ubicacion_id as ubicacionId'])
        .where('organizacion_id', '=', organizacionId)
        .where('activo', '=', true)
        .where('id', 'in', [...casan.keys()])
        .execute(),
    );

    const ubicaciones = await ctx.paso('cargar_ubicaciones', () =>
      ctx.tx
        .selectFrom('ubicaciones')
        .select(['id', 'codigo'])
        .where('organizacion_id', '=', organizacionId)
        .execute(),
    );
    const codigoDe = new Map(ubicaciones.map((u) => [u.id, u.codigo]));

    const encontrados = productos
      .map((p) => ({
        productoId: p.id,
        nombre: p.nombre,
        // La ubicación viaja CON el resultado. Encontrar la clave y después
        // tener que preguntar dónde está es la mitad del trabajo sin hacer.
        ubicacion: p.ubicacionId === null ? null : (codigoDe.get(p.ubicacionId) ?? null),
        precioVentaCentavos: p.precio.toString(),
        atributosQueCasan: casan.get(p.id) ?? 0,
      }))
      // Lo que casa con MÁS filtros va arriba: el que cumple los cuatro que
      // tecleó el mostradorista es el que está buscando, y el que cumple uno
      // es ruido que sólo sirve si no hay nada mejor.
      .sort(compararEncontrados)
      .slice(0, entrada.limite);

    return { encontrados, filtros: entrada.atributos.length };
  },
});

function compararEncontrados(a: MaterialEncontrado, b: MaterialEncontrado): number {
  if (a.atributosQueCasan !== b.atributosQueCasan) return b.atributosQueCasan - a.atributosQueCasan;
  // Empate: por nombre, para que dos búsquedas iguales salgan iguales.
  return a.nombre.localeCompare(b.nombre);
}
