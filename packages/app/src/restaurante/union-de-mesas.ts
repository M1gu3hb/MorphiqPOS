import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { medidasDeMesa, revisarUnion, type MesaEnPlano } from '@morphiqpos/domain/sala';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import {
  cambiarDeMesa,
  mesaEnSala,
  separarMesas,
  unionAbiertaDeMesa,
  unirMesas,
  type MesaEnSala,
} from './sala-escrituras.ts';
import { bloquearElGrupo } from './union-del-salon.ts';

/**
 * `restaurante.unir_mesas` y `restaurante.separar_mesas` — F-302, y DP-9.6 (fase B).
 *
 * ── El dolor ───────────────────────────────────────────────────────────────
 * Llegan diez personas, se juntan físicamente las mesas 4 y 5, y el sistema
 * sigue viendo dos cuentas: el mesero comanda partido y la cuenta sale partida.
 *
 * ── DP-9.6: la unión es del SALÓN ──────────────────────────────────────────
 * Las mesas se juntan en el mapa —se arrastran, se atraen, se funden— y se elige
 * qué número queda (la principal). Sólo se unen mesas que quedaron pegadas y
 * dentro de un perímetro razonable (`revisarUnion`, la misma regla que usa la
 * pantalla): sin el tope de seis de antes, pero medio salón no. La unión puede
 * nacer sin cuenta y sobrevive al cobro; separar devuelve cada mesa a donde
 * estaba. Si la principal elegida no tiene cuenta y otra del grupo sí, esa
 * cuenta se muda primero a la principal.
 *
 * ── Unir es una operación de SALA, separar también ─────────────────────────
 * Ninguna de las dos mueve dinero fuera del negocio: el consumo es el mismo,
 * cambia de cuenta. Por eso el mesero puede.
 *
 * ── Lo que separar NO hace ─────────────────────────────────────────────────
 * No vuelve a repartir el consumo. Repartir por consumo es F-321 y es caja.
 */

/** Un tope técnico, no de negocio: el de negocio es el perímetro del grupo. */
const MAXIMO_TECNICO = 40;
const COORDENADA = z.number().int().min(0).max(10_000);

export const entradaUnirMesas = z.object({
  mesaPrincipalId: z.uuid(),
  mesaIds: z.array(z.uuid()).min(1).max(MAXIMO_TECNICO),
  /**
   * DP-9.6 · Dónde quedó cada mesa del grupo en el plano al juntarlas (la principal incluida).
   * Sin esto, cuentan donde ya están.
   */
  posiciones: z
    .array(z.object({ mesaId: z.uuid(), x: COORDENADA, y: COORDENADA }).strict())
    .max(MAXIMO_TECNICO + 1)
    .optional(),
});

export const entradaSepararMesas = z.object({
  unionId: z.uuid(),
});

export interface ResultadoUnion {
  readonly unionId: string;
  /** `null`: la unión nació sin cuenta; la toma la primera que se abra en la principal. */
  readonly ordenPrincipalId: string | null;
  readonly mesasUnidas: number;
  readonly cuentasAbsorbidas: number;
  readonly lineasMovidas: number;
  readonly totalCentavos: string;
}

export interface ResultadoSeparacion {
  readonly unionId: string;
  readonly ordenPrincipalId: string | null;
  readonly mesasLiberadas: number;
}

const ROLES = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

const CUENTAS_VIVAS = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

interface Miembro {
  readonly mesa: MesaEnSala;
  readonly ordenId: string | null;
}

export const unirMesasComando = definirComando<
  Transaccion,
  typeof entradaUnirMesas,
  ResultadoUnion
>({
  nombre: 'restaurante.unir_mesas',
  entidad: 'mesa',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  sucursal: {
    mesaPrincipalId: 'mesas',
    'mesaIds[]': 'mesas',
    'posiciones[].mesaId': 'mesas',
  },
  modulo: 'mesas',
  entrada: entradaUnirMesas,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    if (entrada.mesaIds.includes(entrada.mesaPrincipalId)) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        'La mesa principal no se une a sí misma: es la que conserva la cuenta.',
      );
    }
    if (new Set(entrada.mesaIds).size !== entrada.mesaIds.length) {
      throw new ErrorDominio('MESA_YA_ABIERTA', 'Esa mesa viene repetida en el grupo.');
    }
    // Sólo se acomodan las mesas que se están uniendo: una posición ajena movería otra mesa
    // —de otra zona, o de otra sucursal— sin guardar dónde estaba.
    const delGrupo = new Set([entrada.mesaPrincipalId, ...entrada.mesaIds]);
    if (entrada.posiciones?.some((p) => !delGrupo.has(p.mesaId)) === true) {
      throw new ErrorDominio(
        'UNION_DE_MESAS_INVALIDA',
        'Sólo se acomodan las mesas que se están uniendo.',
      );
    }

    await ctx.paso('bloquear_el_grupo', () =>
      bloquearElGrupo(ctx.tx, organizacionId, entrada.mesaPrincipalId, entrada.mesaIds),
    );

    let principal = await ctx.paso('cargar_principal', () =>
      mesaEnSala(ctx.tx, organizacionId, entrada.mesaPrincipalId),
    );
    const yaUnida = await ctx.paso('mirar_grupo', () =>
      unionAbiertaDeMesa(ctx.tx, organizacionId, principal.id),
    );
    if (yaUnida !== null) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        `La mesa ${String(principal.numero)} ya pertenece a un grupo. Sepáralo antes de unir otro.`,
      );
    }
    // Una principal ya cobrada (en limpieza conserva su cuenta pagada) no absorbe cuentas vivas:
    // lo de las demás caería en una cuenta que ya nadie va a cobrar.
    const cuentaDeLaPrincipal = principal.ordenActivaId;
    if (cuentaDeLaPrincipal !== null) {
      await ctx.paso('mirar_cuenta_de_la_principal', () =>
        exigirCuentaViva(ctx.tx, organizacionId, cuentaDeLaPrincipal, principal.numero),
      );
    }

    let miembros = await ctx.paso('cargar_miembros', () =>
      cargarMiembros(ctx.tx, organizacionId, principal, entrada.mesaIds),
    );

    const originales = await ctx.paso('revisar_el_grupo', () =>
      revisarElGrupo(
        ctx.tx,
        organizacionId,
        [principal.id, ...entrada.mesaIds],
        entrada.posiciones,
      ),
    );

    // La principal elegida no tiene cuenta y otra del grupo sí: esa cuenta se muda a ella.
    const conCuenta = miembros.find((m) => m.ordenId !== null);
    if (principal.ordenActivaId === null && conCuenta?.ordenId != null) {
      const ordenMudada = conCuenta.ordenId;
      await ctx.paso('mudar_cuenta_a_la_principal', () =>
        cambiarDeMesa(ctx.tx, {
          organizacionId,
          ordenId: ordenMudada,
          origen: conCuenta.mesa,
          destino: principal,
          empleadoId: empleoId,
          ahora: ctx.ahora,
        }),
      );
      principal = await mesaEnSala(ctx.tx, organizacionId, principal.id);
      const vacia = await mesaEnSala(ctx.tx, organizacionId, conCuenta.mesa.id);
      miembros = miembros.map((m) => (m.mesa.id === vacia.id ? { mesa: vacia, ordenId: null } : m));
    }
    const ordenPrincipalId = principal.ordenActivaId;

    const escrito = await ctx.paso('unir', () =>
      unirMesas(ctx.tx, {
        organizacionId,
        principal,
        ordenPrincipalId,
        miembros,
        empleadoId: empleoId,
        ahora: ctx.ahora,
        originales,
      }),
    );

    if (entrada.posiciones !== undefined) {
      for (const { mesaId, x, y } of entrada.posiciones) {
        await ctx.paso(`acomodar_${mesaId}`, () =>
          ctx.tx
            .updateTable('mesas')
            .set({ posicion_x: x, posicion_y: y })
            .where('organizacion_id', '=', organizacionId)
            .where('id', '=', mesaId)
            .execute(),
        );
      }
    }

    const totalCentavos =
      ordenPrincipalId === null
        ? 0n
        : await ctx.paso('recalcular_totales', () =>
            guardarTotales(ctx.tx, organizacionId, ordenPrincipalId, ctx.ahora),
          );

    ctx.auditar({
      entidadId: principal.id,
      payload: {
        unionId: escrito.unionId,
        mesaPrincipal: principal.numero,
        mesas: miembros.map((m) => m.mesa.numero),
        cuentasAbsorbidas: escrito.cuentasAbsorbidas,
        lineasMovidas: escrito.lineasMovidas,
        totalCentavos: totalCentavos.toString(),
      },
    });

    return {
      unionId: escrito.unionId,
      ordenPrincipalId,
      mesasUnidas: miembros.length,
      cuentasAbsorbidas: escrito.cuentasAbsorbidas,
      lineasMovidas: escrito.lineasMovidas,
      totalCentavos: totalCentavos.toString(),
    };
  },
});

export const separarMesasComando = definirComando<
  Transaccion,
  typeof entradaSepararMesas,
  ResultadoSeparacion
>({
  nombre: 'restaurante.separar_mesas',
  entidad: 'mesa',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  sucursal: { unionId: 'uniones_mesa' },
  modulo: 'mesas',
  entrada: entradaSepararMesas,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const escrito = await ctx.paso('separar', () =>
      separarMesas(ctx.tx, {
        organizacionId,
        unionId: entrada.unionId,
        empleadoId: empleoId,
        ahora: ctx.ahora,
      }),
    );

    // La cuenta se queda en la principal, ya sin grupo. Sin cuenta, nada que soltar.
    const ordenPrincipalId = escrito.ordenPrincipalId;
    if (ordenPrincipalId !== null) {
      await ctx.paso('soltar_cuenta', () =>
        ctx.tx
          .updateTable('ordenes')
          .set({ union_id: null, updated_at: ctx.ahora })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', ordenPrincipalId)
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: ordenPrincipalId,
      payload: { unionId: entrada.unionId, mesasLiberadas: escrito.mesasLiberadas },
    });

    return {
      unionId: entrada.unionId,
      ordenPrincipalId,
      mesasLiberadas: escrito.mesasLiberadas,
    };
  },
});

async function exigirCuentaViva(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  numero: number,
): Promise<void> {
  const orden = await tx
    .selectFrom('ordenes')
    .select('estado')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .executeTakeFirst();
  if (orden === undefined || !(CUENTAS_VIVAS as readonly string[]).includes(orden.estado)) {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      `La mesa ${String(numero)} ya cobró su cuenta: márcala limpia antes de unirla.`,
      { estado: orden?.estado ?? 'inexistente' },
    );
  }
}

async function guardarTotales(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  ahora: Date,
): Promise<bigint> {
  const { totales } = await cotizar(tx, organizacionId, ordenId);
  await tx
    .updateTable('ordenes')
    .set({
      subtotal_centavos: totales.subtotalCentavos,
      descuento_centavos: totales.descuentoCentavos,
      impuestos_centavos: totales.impuestosCentavos,
      total_centavos: totales.totalCentavos,
      costo_total_centavos: totales.costoTotalCentavos,
      utilidad_centavos: totales.utilidadCentavos,
      margen_bp: totales.margenBp,
      updated_at: ahora,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    .execute();
  return totales.totalCentavos;
}

/**
 * DP-9.6 · Las mesas del grupo en el plano: misma zona, pegadas y dentro del perímetro, con las
 * posiciones en que quedaron (o donde ya están). Devuelve dónde estaba cada una ANTES, para que
 * separar las regrese.
 */
async function revisarElGrupo(
  tx: Transaccion,
  organizacionId: string,
  ids: readonly string[],
  posiciones:
    readonly { readonly mesaId: string; readonly x: number; readonly y: number }[] | undefined,
): Promise<ReadonlyMap<string, { readonly x: number; readonly y: number }>> {
  const filas = await tx
    .selectFrom('mesas')
    .select(['id', 'posicion_x', 'posicion_y', 'forma', 'tamano', 'zona_id'])
    .where('organizacion_id', '=', organizacionId)
    .where('id', 'in', [...ids])
    .execute();
  if (new Set(filas.map((f) => f.zona_id)).size > 1) {
    throw new ErrorDominio('UNION_DE_MESAS_INVALIDA', 'Sólo se unen mesas de la misma zona.');
  }
  const nuevas = new Map((posiciones ?? []).map((p) => [p.mesaId, p]));
  const enPlano: MesaEnPlano[] = filas.map((f) => ({
    id: f.id,
    x: nuevas.get(f.id)?.x ?? f.posicion_x,
    y: nuevas.get(f.id)?.y ?? f.posicion_y,
    ...medidasDeMesa(f.forma, f.tamano),
  }));
  const problema = revisarUnion(enPlano);
  if (problema !== null) throw new ErrorDominio('UNION_DE_MESAS_INVALIDA', problema);
  return new Map(filas.map((f) => [f.id, { x: f.posicion_x, y: f.posicion_y }]));
}

/**
 * Carga cada mesa que se va a unir y comprueba lo que la base no puede.
 *
 * Una mesa de otra sucursal, una que ya está en otro grupo o una cuyo consumo
 * ya se cobró son tres formas distintas de acabar con un grupo imposible; las
 * tres se cierran aquí, antes de escribir nada.
 */
async function cargarMiembros(
  tx: Transaccion,
  organizacionId: string,
  principal: MesaEnSala,
  mesaIds: readonly string[],
): Promise<readonly Miembro[]> {
  const salida: Miembro[] = [];

  for (const mesaId of mesaIds) {
    const mesa = await mesaEnSala(tx, organizacionId, mesaId);

    if (mesa.sucursalId !== principal.sucursalId) {
      throw new ErrorDominio(
        'MESA_NO_ENCONTRADA',
        `La mesa ${String(mesa.numero)} es de otra sucursal: no se puede juntar con ésta.`,
      );
    }

    const grupo = await unionAbiertaDeMesa(tx, organizacionId, mesaId);
    if (grupo !== null) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        `La mesa ${String(mesa.numero)} ya pertenece a otro grupo.`,
      );
    }

    if (mesa.ordenActivaId === null) {
      // Una mesa libre se une sin traer consumo: es el caso de «pásate a esta
      // otra que está vacía», y es legítimo.
      salida.push({ mesa, ordenId: null });
      continue;
    }

    const orden = await tx
      .selectFrom('ordenes')
      .select(['id', 'estado'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', mesa.ordenActivaId)
      .executeTakeFirst();

    if (orden === undefined || !(CUENTAS_VIVAS as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        `La cuenta de la mesa ${String(mesa.numero)} ya se cobró o se cerró: no se puede absorber.`,
        { estado: orden?.estado ?? 'inexistente' },
      );
    }

    salida.push({ mesa, ordenId: orden.id });
  }

  return salida;
}
