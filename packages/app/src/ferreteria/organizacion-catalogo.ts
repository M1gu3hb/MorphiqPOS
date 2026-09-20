import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-021, F-152 y F-060 · Cómo se ORDENA un catálogo de 6,000 claves.
 *
 * ── La línea lleva el esquema, y no el producto ──────────────────────────
 * Si cada alta inventa sus claves —«diámetro», «diametro», «Ø»— la búsqueda por
 * medida deja de existir al tercer mes. El esquema vive en la línea: quien da
 * de alta un tornillo contesta las preguntas que la línea «tornillería» ya hizo,
 * y por eso los seis mil tornillos se pueden filtrar juntos.
 *
 * ── La ubicación NO es la zona de anaquel, y por eso es otra función ─────
 * La zona existe PARA CONTAR: una vez al día, por el encargado. La ubicación
 * existe PARA VENDER: sesenta veces al día, por el mostradorista, y se imprime
 * en la etiqueta. Distinto propósito, distinto usuario, distinta frecuencia.
 * Con 3,000 a 8,000 claves en gavetas, encontrar es la mitad del trabajo, y un
 * mostradorista nuevo tarda seis meses en aprenderse la bodega.
 *
 * ── Y la equivalencia es producto, no auditoría ──────────────────────────
 * «No tengo la de 1/2 pero la de 13 mm le sirve» vive hoy en la cabeza de una
 * persona. Cuando esa persona se va, la venta se cae sin quedar registrada en
 * ningún sitio: no hay forma de saber cuánto se perdió. Por eso se declara
 * quién lo dijo — cuando se vaya, lo que declaró se queda.
 */

const CATALOGO = ['gerente', 'administrador', 'dueno'] as const;
/** El mostradorista declara equivalencias: es quien las sabe. */
const MOSTRADOR = ['cajero', ...CATALOGO] as const;

export const entradaDeclararLinea = z.object({
  nombre: z.string().trim().min(1).max(80),
  padreId: z.uuid().nullable().default(null),
  /** `[{clave, etiqueta, tipo: 'medida'|'lista'|'texto', opciones?}]`. */
  esquemaAtributos: z
    .array(
      z.object({
        clave: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]{0,30}$/, 'La clave va en minúsculas, sin espacios ni acentos.'),
        etiqueta: z.string().trim().min(1).max(40),
        tipo: z.enum(['medida', 'lista', 'texto']),
        opciones: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
      }),
    )
    .max(12)
    .default([]),
  orden: z.number().int().min(0).max(9_999).default(0),
});

export const entradaAsignarUbicacion = z.object({
  productoId: z.uuid(),
  almacenId: z.uuid(),
  codigo: z.string().trim().min(1).max(30),
  descripcion: z.string().trim().max(120).nullable().default(null),
  zonaId: z.uuid().nullable().default(null),
  /** El camino que se hace a pie. Surtir por nombre hace caminar el pasillo cuatro veces. */
  ordenRecorrido: z.number().int().min(0).max(99_999).default(0),
});

export const entradaDeclararEquivalencia = z.object({
  productoId: z.uuid(),
  equivalenteId: z.uuid(),
  /** `sustituto` es «le sirve»; `complemento` es «va con». No son lo mismo. */
  tipo: z.enum(['sustituto', 'complemento']),
  nota: z.string().trim().max(200).nullable().default(null),
  bidireccional: z.boolean().nullable().default(null),
});

export interface ResultadoLinea {
  readonly lineaId: string;
  readonly nombre: string;
  readonly claves: readonly string[];
  /** Cuántas claves hereda del padre. La línea hija no las repite. */
  readonly clavesHeredadas: number;
}

export interface ResultadoUbicacion {
  readonly ubicacionId: string;
  readonly productoId: string;
  readonly codigo: string;
  /** `true` si la gaveta ya existía: no se duplica, se reutiliza. */
  readonly yaExistia: boolean;
}

export interface ResultadoEquivalencia {
  readonly equivalenciaId: string;
  readonly tipo: string;
  readonly bidireccional: boolean;
}

export const declararLinea = definirComando<
  Transaccion,
  typeof entradaDeclararLinea,
  ResultadoLinea
>({
  nombre: 'catalogo.declarar_linea',
  entidad: 'linea',
  escribe: true,
  roles: [...CATALOGO],
  paquetes: PAQUETES_TODOS,
  entrada: entradaDeclararLinea,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    let clavesHeredadas = 0;
    if (entrada.padreId !== null) {
      const padre = await ctx.paso('leer_padre', () =>
        ctx.tx
          .selectFrom('lineas')
          .select(['id', 'esquema_atributos'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.padreId)
          .executeTakeFirst(),
      );
      if (padre === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa línea padre no existe aquí.');
      }
      clavesHeredadas = Array.isArray(padre.esquema_atributos) ? padre.esquema_atributos.length : 0;
    }

    // Dos claves iguales en el mismo esquema harían que la pantalla de alta
    // preguntara lo mismo dos veces y que el segundo valor tapara al primero.
    const claves = entrada.esquemaAtributos.map((a) => a.clave);
    if (new Set(claves).size !== claves.length) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esa línea repite una clave de atributo.');
    }
    // Un atributo de lista sin opciones es un campo de texto con otro nombre:
    // quien da de alta teclea lo que quiera y la búsqueda por acabado muere.
    for (const atributo of entrada.esquemaAtributos) {
      if (atributo.tipo === 'lista' && (atributo.opciones ?? []).length === 0) {
        throw new ErrorDominio(
          'CONFIGURACION_INVALIDA',
          `«${atributo.etiqueta}» es de lista y no trae opciones: sería un campo libre.`,
        );
      }
    }

    const repetida = await ctx.paso('buscar_repetida', () =>
      ctx.tx
        .selectFrom('lineas')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('padre_id', entrada.padreId === null ? 'is' : '=', entrada.padreId)
        .where('nombre', '=', entrada.nombre)
        .executeTakeFirst(),
    );
    if (repetida !== undefined) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Ya hay una línea «${entrada.nombre}» colgando de ahí.`,
      );
    }

    const linea = await ctx.paso('crear_linea', () =>
      ctx.tx
        .insertInto('lineas')
        .values({
          organizacion_id: organizacionId,
          padre_id: entrada.padreId,
          nombre: entrada.nombre,
          esquema_atributos: entrada.esquemaAtributos,
          orden: entrada.orden,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({ entidadId: linea.id, payload: { nombre: entrada.nombre, claves } });
    return { lineaId: linea.id, nombre: entrada.nombre, claves, clavesHeredadas };
  },
});

export const asignarUbicacion = definirComando<
  Transaccion,
  typeof entradaAsignarUbicacion,
  ResultadoUbicacion
>({
  nombre: 'catalogo.asignar_ubicacion',
  entidad: 'producto',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAsignarUbicacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }

    // La gaveta se REUTILIZA. Crear una fila por producto llenaría la tabla de
    // «pasillo 3 gaveta 12» repetido cuarenta veces, y cambiar el orden de
    // recorrido habría que hacerlo cuarenta veces también.
    const existente = await ctx.paso('buscar_ubicacion', () =>
      ctx.tx
        .selectFrom('ubicaciones')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', '=', entrada.almacenId)
        .where('codigo', '=', entrada.codigo)
        .executeTakeFirst(),
    );

    const ubicacionId =
      existente?.id ??
      (
        await ctx.paso('crear_ubicacion', () =>
          ctx.tx
            .insertInto('ubicaciones')
            .values({
              organizacion_id: organizacionId,
              almacen_id: entrada.almacenId,
              codigo: entrada.codigo,
              descripcion: entrada.descripcion,
              zona_id: entrada.zonaId,
              orden_recorrido: entrada.ordenRecorrido,
              created_at: ctx.ahora,
            })
            .returning('id')
            .executeTakeFirstOrThrow(),
        )
      ).id;

    await ctx.paso('atar_producto', () =>
      ctx.tx
        .updateTable('productos')
        .set({ ubicacion_id: ubicacionId, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .execute(),
    );

    ctx.auditar({ entidadId: entrada.productoId, payload: { codigo: entrada.codigo } });
    return {
      ubicacionId,
      productoId: entrada.productoId,
      codigo: entrada.codigo,
      yaExistia: existente !== undefined,
    };
  },
});

/**
 * El cuerpo que declara la equivalencia: comprueba y escribe, SIN auditar.
 *
 * Compartido por los dos comandos que declaran una —`catalogo.declarar_equivalencia`,
 * que recibe los dos identificadores, y `catalogo.declarar_equivalencia_dicha`,
 * que recibe lo que el mostradorista tecleó con el cliente enfrente— y sin
 * `ctx.auditar` a propósito: el rastro de un comando guarda sólo la PRIMERA
 * auditoría, así que un cuerpo compartido que auditara le robaría el rastro a
 * quien lo llama y el registro contaría el acto de dentro en vez del de fuera.
 */
export async function ejecutarDeclararEquivalencia(
  ctx: ContextoComando<Transaccion>,
  entrada: z.infer<typeof entradaDeclararEquivalencia>,
): Promise<ResultadoEquivalencia> {
  const { organizacionId, empleoId } = ctx.ambito;

  if (entrada.productoId === entrada.equivalenteId) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Una pieza no es equivalente de sí misma.');
  }

  const productos = await ctx.paso('leer_productos', () =>
    ctx.tx
      .selectFrom('productos')
      .select(['id'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', 'in', [entrada.productoId, entrada.equivalenteId])
      .execute(),
  );
  if (productos.length !== 2) {
    throw new ErrorDominio(
      'PRODUCTO_NO_ENCONTRADO',
      'Una de las dos piezas no existe en este negocio.',
    );
  }

  // El valor por omisión NO es el mismo para los dos tipos. Si la de 13 mm
  // sirve por la de 1/2, la de 1/2 sirve por la de 13: el sustituto va y
  // viene. El teflón va con la llave, pero la llave no va con el teflón:
  // ofrecer una llave a quien pide teflón es ruido en el mostrador.
  const bidireccional = entrada.bidireccional ?? entrada.tipo === 'sustituto';

  const repetida = await ctx.paso('buscar_repetida', () =>
    ctx.tx
      .selectFrom('equivalencias')
      .select(['id'])
      .where('organizacion_id', '=', organizacionId)
      .where('producto_id', '=', entrada.productoId)
      .where('equivalente_id', '=', entrada.equivalenteId)
      .where('tipo', '=', entrada.tipo)
      .executeTakeFirst(),
  );
  if (repetida !== undefined) {
    throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa equivalencia ya estaba declarada.');
  }

  const equivalencia = await ctx.paso('declarar', () =>
    ctx.tx
      .insertInto('equivalencias')
      .values({
        organizacion_id: organizacionId,
        producto_id: entrada.productoId,
        equivalente_id: entrada.equivalenteId,
        tipo: entrada.tipo,
        nota: entrada.nota,
        bidireccional,
        // No es auditoría: es PRODUCTO. Cuando el mostradorista experto se
        // vaya, lo que declaró se queda, y se sabe que fue él.
        declarado_por: empleoId,
        declarado_en: ctx.ahora,
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  return { equivalenciaId: equivalencia.id, tipo: entrada.tipo, bidireccional };
}

export const declararEquivalencia = definirComando<
  Transaccion,
  typeof entradaDeclararEquivalencia,
  ResultadoEquivalencia
>({
  nombre: 'catalogo.declarar_equivalencia',
  entidad: 'equivalencia',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaDeclararEquivalencia,
  async ejecutar(ctx, entrada) {
    const hecha = await ejecutarDeclararEquivalencia(ctx, entrada);
    ctx.auditar({
      entidadId: hecha.equivalenciaId,
      payload: { tipo: hecha.tipo, bidireccional: hecha.bidireccional },
    });
    return hecha;
  },
});
