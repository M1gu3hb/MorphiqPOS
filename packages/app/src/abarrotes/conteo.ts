import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoTomas, type Transaccion } from '@morphiqpos/data';
import {
  planearAjustesDeConteo,
  sumarCapturas,
  zonasPorContar,
  type CapturaDeConteo,
  type ZonaPendiente,
} from '@morphiqpos/domain/inventario';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { exigirMotivoDeMerma } from '../inventario/motivos.ts';
import { almacenDeLaSesion } from './recibir-nota.ts';

/**
 * F-149 · Conteo cíclico por zona, sobre la toma física de E2 (F-106).
 *
 * ── El dolor número uno, y por qué hoy no tiene renglón ───────────────────
 * «¿Quién me está robando?» no tiene respuesta porque el sistema da el esperado
 * y nunca el real. Sin conteo físico, la merma, el robo y el error de captura
 * son la misma cifra invisible, y el argumento de venta número uno de este giro
 * es una promesa.
 *
 * ── Lo que E2 ya construyó y aquí NO se vuelve a escribir ─────────────────
 * `tomas_inventario`, `toma_conteos` con el `esperado` sellado al contar, y
 * `repoTomas`. El motor de comparar esperado contra contado existe. Lo que
 * faltaba es lo que hace que el conteo vuelva mañana.
 *
 * ── Por qué el FACTOR lo pone el servidor ─────────────────────────────────
 * El mostrador manda «nueve de esta presentación», nunca «nueve por veinticuatro».
 * Un endpoint que aceptara el factor dejaría que el navegador decidiera cuántas
 * piezas hay en una caja, y con eso se puede cuadrar un faltante tecleando. Es
 * la misma regla que el precio, y por el mismo motivo.
 *
 * ── Por qué el ajuste es un movimiento y no un `update` ───────────────────
 * Porque el kardex tiene que poder explicar por qué cambió el saldo. Si el
 * conteo escribiera existencias, el saldo cambiaría sin renglón que lo
 * justifique — que es exactamente la pregunta que el dueño hace.
 */

const ROLES = ['almacen', 'gerente', 'administrador', 'dueno'] as const;
const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaAbrirConteo = z.object({
  /**
   * Opcional: sin él, el almacén principal de la sucursal de la SESIÓN. El almacén es
   * ámbito; exigírselo a la pantalla es por lo que ninguna abría una toma (C.8).
   */
  almacenId: z.uuid().optional(),
  alcance: z.enum(['zona', 'completo']),
  zonaId: z.uuid().optional(),
});

export const entradaCapturarConteo = z.object({
  tomaId: z.uuid(),
  insumoId: z.uuid(),
  capturas: z
    .array(
      z.object({
        /** `null` = contó en unidad base. Con valor, el factor se busca. */
        presentacionId: z.uuid().nullable(),
        cantidad: z.string().regex(CANTIDAD, 'La cantidad va con hasta cuatro decimales.'),
      }),
    )
    .min(1)
    .max(40),
});

export const entradaCerrarConteo = z.object({
  tomaId: z.uuid(),
  /**
   * LA CLAVE de `motivos_merma`, no su etiqueta.
   *
   * Aquí decía `'Diferencia de conteo físico'` —que es la etiqueta de la clave
   * `ajuste_conteo`— y `movimientos_stock.motivo` apunta a esa tabla desde la 062:
   * la base rechazaba el movimiento con `23503` y **el conteo no se podía cerrar**.
   * La explicación en palabras, si la hay, va en `nota`.
   */
  motivo: z.string().trim().min(3).max(60).default('ajuste_conteo'),
  nota: z.string().trim().max(200).nullable().default(null),
});

export interface ResultadoAbrirConteo {
  readonly tomaId: string;
  readonly alcance: 'zona' | 'completo';
  readonly zonaId: string | null;
}

export interface ResultadoCapturarConteo {
  readonly insumoId: string;
  readonly contado: string;
  readonly esperado: string;
}

export interface ResultadoCerrarConteo {
  readonly tomaId: string;
  readonly ajustados: number;
  readonly faltantes: number;
  readonly sobrantes: number;
}

export const abrirConteo = definirComando<
  Transaccion,
  typeof entradaAbrirConteo,
  ResultadoAbrirConteo
>({
  nombre: 'inventario.abrir_conteo',
  entidad: 'toma_inventario',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAbrirConteo,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    // La toma completa NO lleva zona, y una zona sin id no es un alcance: son
    // los dos únicos estados válidos. Aceptar los cruces dejaría tomas que
    // dicen ser de una zona y cuentan toda la tienda.
    if (entrada.alcance === 'zona' && entrada.zonaId === undefined) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Un conteo por zona necesita saber qué zona se va a recorrer.',
      );
    }
    if (entrada.alcance === 'completo' && entrada.zonaId !== undefined) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Una toma completa cuenta toda la tienda: no lleva zona.',
      );
    }

    const zonaId = entrada.zonaId ?? null;
    if (zonaId !== null) {
      const zona = await ctx.paso('cargar_zona', () =>
        ctx.tx
          .selectFrom('zonas_anaquel')
          .select(['id', 'activa'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', zonaId)
          .executeTakeFirst(),
      );
      if (zona === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa zona no existe en este negocio.');
      }
      if (!zona.activa) {
        // Contar un anaquel que se desmontó produce un faltante entero contra
        // un esperado que ya nadie mantiene.
        throw new ErrorDominio('INVENTARIO_INVALIDO', 'Esa zona está apagada.');
      }
    }

    const almacenId = entrada.almacenId ?? (await almacenDeLaSesion(ctx));
    const tomaId = await ctx.paso('abrir_toma', () =>
      repoTomas.abrirToma(ctx.tx, {
        organizacionId,
        almacenId,
        empleadoId: empleoId,
        zonaId,
        ahora: ctx.ahora,
      }),
    );

    ctx.auditar({
      entidadId: tomaId,
      payload: { alcance: entrada.alcance, zonaId, almacenId },
    });

    return { tomaId, alcance: entrada.alcance, zonaId };
  },
});

export const capturarConteo = definirComando<
  Transaccion,
  typeof entradaCapturarConteo,
  ResultadoCapturarConteo
>({
  nombre: 'inventario.capturar_conteo',
  entidad: 'toma_conteo',
  escribe: true,
  // El cajero cuenta: en una tiendita es quien está y quien conoce el anaquel.
  // Obligar a que cuente el encargado es cómo el conteo cíclico se vuelve otra
  // vez una toma anual.
  roles: ['cajero', ...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCapturarConteo,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const toma = await ctx.paso('cargar_toma', () =>
      ctx.tx
        .selectFrom('tomas_inventario')
        .select(['id', 'almacen_id as almacenId', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.tomaId)
        .executeTakeFirst(),
    );
    if (toma === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa toma de inventario no existe.');
    }
    if (toma.estado !== 'abierta') {
      // Capturar sobre una toma cerrada metería un contado que ya no va a
      // producir ajuste: quedaría escrito y no cambiaría nada.
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Esa toma ya está cerrada: lo que se capture ahora no ajusta nada.',
      );
    }

    const insumo = await ctx.paso('cargar_insumo', () =>
      ctx.tx
        .selectFrom('insumos')
        .select(['id', 'unidad_base as unidadBase'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.insumoId)
        .executeTakeFirst(),
    );
    if (insumo === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese insumo no existe en este negocio.');
    }

    const capturas = await resolverFactores(ctx, entrada.capturas);
    const contado = sumarCapturas(capturas);

    await ctx.paso('anotar_conteo', () =>
      repoTomas.anotarConteo(
        ctx.tx,
        entrada.tomaId,
        toma.almacenId,
        { insumoId: entrada.insumoId, contado, unidad: insumo.unidadBase, capturas },
        empleoId,
        ctx.ahora,
      ),
    );

    const linea = await ctx.paso('leer_linea', () =>
      ctx.tx
        .selectFrom('toma_conteos')
        .select(['esperado'])
        .where('toma_id', '=', entrada.tomaId)
        .where('insumo_id', '=', entrada.insumoId)
        .executeTakeFirst(),
    );

    ctx.auditar({
      entidadId: entrada.insumoId,
      payload: { tomaId: entrada.tomaId, contado, capturas: capturas.length },
    });

    return { insumoId: entrada.insumoId, contado, esperado: linea?.esperado ?? '0' };
  },
});

export const cerrarConteo = definirComando<
  Transaccion,
  typeof entradaCerrarConteo,
  ResultadoCerrarConteo
>({
  nombre: 'inventario.cerrar_conteo',
  entidad: 'toma_inventario',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCerrarConteo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const toma = await ctx.paso('cargar_toma', () =>
      ctx.tx
        .selectFrom('tomas_inventario')
        .select(['id', 'almacen_id as almacenId', 'estado', 'zona_id as zonaId'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.tomaId)
        .executeTakeFirst(),
    );
    if (toma === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa toma de inventario no existe.');
    }
    if (toma.estado !== 'abierta') {
      throw new ErrorDominio('INVENTARIO_INVALIDO', 'Esa toma ya estaba cerrada.');
    }

    // El motivo, comprobado antes de escribir un solo movimiento: un conteo de
    // cuatrocientos productos que se aborta en el renglón trescientos por un
    // motivo mal escrito es una hora de trabajo perdida.
    const motivo = await exigirMotivoDeMerma(ctx, entrada.motivo);

    const cerrado = await ejecutarCierreDeConteo(ctx, toma, motivo, entrada.nota);

    ctx.auditar({
      entidadId: entrada.tomaId,
      payload: {
        ajustados: cerrado.ajustados,
        faltantes: cerrado.faltantes,
        zonaId: toma.zonaId,
      },
    });

    return cerrado;
  },
});

/**
 * El CIERRE de una toma: ajusta, cierra y sella la zona. SIN auditar.
 *
 * Compartido por `inventario.cerrar_conteo` —el cierre de la toma que se fue
 * capturando renglón a renglón— y por `inventario.ajustar_conteo`, que cuenta y
 * cierra una zona en un solo viaje porque la pantalla del teléfono se aprieta una
 * vez, al final del recorrido. Sin `ctx.auditar` a propósito: el rastro de un
 * comando guarda sólo la PRIMERA auditoría, y un cuerpo compartido que auditara le
 * robaría el renglón a quien lo llama.
 *
 * El `motivo` llega YA comprobado contra `motivos_merma`: comprobarlo aquí, con
 * los movimientos a medio escribir, es abortar la transacción en el renglón
 * trescientos de cuatrocientos.
 */
export async function ejecutarCierreDeConteo(
  ctx: ContextoComando<Transaccion>,
  toma: { readonly id: string; readonly almacenId: string; readonly zonaId: string | null },
  motivo: string | null,
  nota: string | null,
  /** El motivo de cada diferencia, si no es el de la toma (C.10 de la 2.4). */
  motivosPorInsumo: ReadonlyMap<string, string> = new Map(),
): Promise<ResultadoCerrarConteo> {
  const { organizacionId, empleoId } = ctx.ambito;

  const diferencias = await ctx.paso('leer_diferencias', () =>
    repoTomas.diferenciasDeToma(ctx.tx, toma.id),
  );
  const ajustes = planearAjustesDeConteo(diferencias);

  for (const ajuste of ajustes) {
    await aplicarAjuste(ctx, toma.almacenId, ajuste.insumoId, ajuste.delta);

    const movimiento = await ctx.paso('registrar_ajuste', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: organizacionId,
          almacen_id: toma.almacenId,
          insumo_id: ajuste.insumoId,
          tipo: 'ajuste',
          cantidad: ajuste.delta,
          unidad: ajuste.unidad,
          // `conteo` y no `manual`: es lo que separa la diferencia contada del
          // ajuste que alguien tecleó a mano, y es la única forma de que el
          // reporte de diferencias por periodo signifique algo.
          referencia_tipo: 'conteo',
          referencia_id: toma.id,
          empleado_id: empleoId,
          motivo: motivosPorInsumo.get(ajuste.insumoId) ?? motivo,
          nota: nota,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('ligar_ajuste', () =>
      ctx.tx
        .updateTable('toma_conteos')
        .set({ movimiento_ajuste_id: movimiento.id })
        .where('toma_id', '=', toma.id)
        .where('insumo_id', '=', ajuste.insumoId)
        .execute(),
    );
  }

  const cerradas = await ctx.paso('cerrar_toma', () =>
    repoTomas.cerrarToma(ctx.tx, organizacionId, toma.id, ctx.ahora),
  );
  if (cerradas !== 1) {
    // Alguien la cerró entre la lectura y el cierre. Sin esto, los ajustes de
    // arriba se habrían escrito dos veces.
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'Esa toma ya estaba cerrada.');
  }

  // ── Lo que hace que el conteo vuelva mañana ────────────────────────────
  // Sin esta línea, `zonasPorContar` seguiría pidiendo la misma zona cada día
  // y el recorrido nunca avanzaría al siguiente anaquel. Es la diferencia
  // entre una toma física y una rutina.
  //
  // La guarda `!== null` NO protege de sellar zonas de más: `where id = null`
  // no casa con ninguna fila, ni aquí ni en Postgres. Está porque `zona_id` es
  // `string | null` y porque una toma completa no tiene por qué mandar un
  // UPDATE que no va a tocar nada. Quitarla no rompe ninguna prueba, y se
  // queda dicho en vez de aparentar que cierra un hueco.
  if (toma.zonaId !== null) {
    await ctx.paso('sellar_zona', () =>
      ctx.tx
        .updateTable('zonas_anaquel')
        .set({ ultimo_conteo_en: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', toma.zonaId)
        .execute(),
    );
  }

  const faltantes = ajustes.filter((a) => a.faltante).length;

  return {
    tomaId: toma.id,
    ajustados: ajustes.length,
    faltantes,
    sobrantes: ajustes.length - faltantes,
  };
}

/**
 * Qué zonas toca contar hoy. Lectura pura: no escribe nada.
 *
 * Vive aquí y no en el puente porque la respuesta depende de la hora, y el
 * puente expone filas, no cálculos con reloj.
 */
export async function zonasPendientesDeConteo(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string | null,
  ahora: Date,
): Promise<readonly ZonaPendiente[]> {
  let consulta = tx
    .selectFrom('zonas_anaquel')
    .select([
      'id',
      'nombre',
      'orden',
      'dias_entre_conteos as diasEntreConteos',
      'ultimo_conteo_en as ultimoConteoEn',
      'activa',
    ])
    .where('organizacion_id', '=', organizacionId);

  // Una zona sin sucursal es de toda la organización —la tiendita de un solo
  // local—; con sucursal, sólo se recorre desde ahí.
  consulta =
    sucursalId === null ? consulta : consulta.where('sucursal_id', 'in', [sucursalId, null]);

  const filas = await consulta.execute();
  return zonasPorContar(filas, ahora);
}

/**
 * El factor de cada presentación, leído del catálogo.
 *
 * NUNCA del cliente: con el factor en la entrada, tecleando «nueve cajas de
 * factor 1» se cuadra cualquier faltante sin que nada falle.
 */
async function resolverFactores(
  ctx: ContextoComando<Transaccion>,
  capturas: readonly { readonly presentacionId: string | null; readonly cantidad: string }[],
): Promise<readonly CapturaDeConteo[]> {
  const resueltas: CapturaDeConteo[] = [];

  for (const captura of capturas) {
    if (captura.presentacionId === null) {
      resueltas.push({ presentacionId: null, cantidad: captura.cantidad, factor: '1' });
      continue;
    }

    const presentacionId = captura.presentacionId;
    const presentacion = await ctx.paso('cargar_presentacion', () =>
      ctx.tx
        .selectFrom('producto_presentaciones')
        .select(['id', 'factor'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', presentacionId)
        .executeTakeFirst(),
    );
    if (presentacion === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa presentación no está en este catálogo.', {
        presentacionId,
      });
    }

    resueltas.push({
      presentacionId,
      cantidad: captura.cantidad,
      factor: presentacion.factor,
    });
  }

  return resueltas;
}

/**
 * Mueve la existencia por el delta del conteo, sin dejarla negativa.
 *
 * ── Por qué el delta y no el contado ──────────────────────────────────────
 * Porque entre que se contó y que se cierra se siguió vendiendo. Escribir el
 * contado a secas devolvería al anaquel lo que salió en esas dos horas. El
 * `esperado` sellado al contar más el delta es lo único que hace que contar con
 * la tienda abierta signifique algo.
 *
 * ── Por qué se rechaza el negativo ────────────────────────────────────────
 * Un resultado negativo significa que desde que se contó salió más de lo que
 * se había contado, y eso no es una diferencia: es un renglón mal contado. Una
 * existencia negativa es una mentira distinta de la que el conteo vino a
 * corregir.
 */
async function aplicarAjuste(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  insumoId: string,
  delta: string,
): Promise<void> {
  const resultado = await ctx.paso('ajustar_existencia', () =>
    sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad + ${delta}, actualizado_en = now()
       where organizacion_id = ${ctx.ambito.organizacionId}
         and almacen_id = ${almacenId}
         and insumo_id = ${insumoId}
         and cantidad + ${delta} >= 0
      returning cantidad
    `.execute(ctx.tx),
  );

  if (resultado.rows.length !== 1) {
    throw new ErrorDominio(
      'STOCK_INSUFICIENTE',
      'Ese renglón dejaría la existencia en negativo: desde que se contó salió más de lo contado.',
      { insumoId },
    );
  }
}
