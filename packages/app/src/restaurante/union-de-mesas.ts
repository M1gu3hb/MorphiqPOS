import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import {
  mesaEnSala,
  separarMesas,
  unionAbiertaDeMesa,
  unirMesas,
  type MesaEnSala,
} from './sala-escrituras.ts';

/**
 * `restaurante.unir_mesas` y `restaurante.separar_mesas` — F-302.
 *
 * ── El dolor ───────────────────────────────────────────────────────────────
 * Llegan diez personas, se juntan físicamente las mesas 4 y 5, y el sistema
 * sigue viendo dos cuentas: el mesero comanda partido y la cuenta sale partida.
 * Hoy se resuelve pasando todo a una mesa a mano, que es teclear el pedido dos
 * veces con la gente esperando.
 *
 * ── Unir es una operación de SALA, separar también ─────────────────────────
 * Ninguna de las dos mueve dinero fuera del negocio: el consumo es el mismo,
 * cambia de cuenta. Por eso el mesero puede, a diferencia de dividir (F-321) y
 * de anular (F-324), que sí hacen desaparecer importes de un ticket.
 *
 * ── Lo que separar NO hace ─────────────────────────────────────────────────
 * No vuelve a repartir el consumo. Separar cierra el grupo y devuelve las mesas
 * al servicio; repartir por consumo es F-321 y es una decisión de caja.
 */

export const entradaUnirMesas = z.object({
  mesaPrincipalId: z.uuid(),
  // Hasta cinco acompañantes: una mesa de seis unidas es ya un salón privado y
  // ahí el negocio abre una cuenta de evento, no un grupo de mesas.
  mesaIds: z.array(z.uuid()).min(1).max(5),
});

export const entradaSepararMesas = z.object({
  unionId: z.uuid(),
});

export interface ResultadoUnion {
  readonly unionId: string;
  readonly ordenPrincipalId: string;
  readonly mesasUnidas: number;
  readonly cuentasAbsorbidas: number;
  readonly lineasMovidas: number;
  readonly totalCentavos: string;
}

export interface ResultadoSeparacion {
  readonly unionId: string;
  readonly ordenPrincipalId: string;
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

    const principal = await ctx.paso('cargar_principal', () =>
      mesaEnSala(ctx.tx, organizacionId, entrada.mesaPrincipalId),
    );

    if (principal.ordenActivaId === null) {
      // Unir mesas es juntar CUENTAS. Sin cuenta abierta en la principal no hay
      // dónde absorber, y abrirla aquí escondería una apertura dentro de una
      // operación que el mesero cree que sólo mueve mesas.
      throw new ErrorDominio(
        'MESA_NO_ENCONTRADA',
        `La mesa ${principal.numero} no tiene una cuenta abierta. Ábrela antes de unir.`,
      );
    }

    const yaUnida = await ctx.paso('mirar_grupo', () =>
      unionAbiertaDeMesa(ctx.tx, organizacionId, principal.id),
    );
    if (yaUnida !== null) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        `La mesa ${principal.numero} ya pertenece a un grupo. Sepáralo antes de unir otro.`,
      );
    }

    const ordenPrincipalId = principal.ordenActivaId;

    const miembros = await ctx.paso('cargar_miembros', () =>
      cargarMiembros(ctx.tx, organizacionId, principal, entrada.mesaIds),
    );

    const escrito = await ctx.paso('unir', () =>
      unirMesas(ctx.tx, {
        organizacionId,
        principal,
        ordenPrincipalId,
        miembros,
        empleadoId: empleoId,
        ahora: ctx.ahora,
      }),
    );

    // La cuenta principal se recotiza CON las líneas que acaban de llegar. Es
    // la misma `cotizar` del cobro: restarle el total de cada absorbida sería
    // un segundo sitio donde se calcula un total.
    const { totales } = await ctx.paso('recalcular_totales', () =>
      cotizar(ctx.tx, organizacionId, ordenPrincipalId),
    );

    await ctx.paso('guardar_totales', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          subtotal_centavos: totales.subtotalCentavos,
          descuento_centavos: totales.descuentoCentavos,
          impuestos_centavos: totales.impuestosCentavos,
          total_centavos: totales.totalCentavos,
          costo_total_centavos: totales.costoTotalCentavos,
          utilidad_centavos: totales.utilidadCentavos,
          margen_bp: totales.margenBp,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', ordenPrincipalId)
        .execute(),
    );

    ctx.auditar({
      entidadId: principal.id,
      payload: {
        unionId: escrito.unionId,
        mesaPrincipal: principal.numero,
        mesas: miembros.map((m) => m.mesa.numero),
        cuentasAbsorbidas: escrito.cuentasAbsorbidas,
        lineasMovidas: escrito.lineasMovidas,
        totalCentavos: totales.totalCentavos.toString(),
      },
    });

    return {
      unionId: escrito.unionId,
      ordenPrincipalId,
      mesasUnidas: miembros.length,
      cuentasAbsorbidas: escrito.cuentasAbsorbidas,
      lineasMovidas: escrito.lineasMovidas,
      totalCentavos: totales.totalCentavos.toString(),
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

    // La cuenta del grupo se queda en la principal y NO se toca: separar no
    // reparte el consumo. Lo único que se suelta es `union_id`, para que la
    // cuenta vuelva a poder moverse de mesa.
    await ctx.paso('soltar_cuenta', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({ union_id: null, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', escrito.ordenPrincipalId)
        .execute(),
    );

    ctx.auditar({
      entidadId: escrito.ordenPrincipalId,
      payload: { unionId: entrada.unionId, mesasLiberadas: escrito.mesasLiberadas },
    });

    return {
      unionId: entrada.unionId,
      ordenPrincipalId: escrito.ordenPrincipalId,
      mesasLiberadas: escrito.mesasLiberadas,
    };
  },
});

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
): Promise<readonly { readonly mesa: MesaEnSala; readonly ordenId: string | null }[]> {
  const salida: { mesa: MesaEnSala; ordenId: string | null }[] = [];

  for (const mesaId of mesaIds) {
    const mesa = await mesaEnSala(tx, organizacionId, mesaId);

    if (mesa.sucursalId !== principal.sucursalId) {
      throw new ErrorDominio(
        'MESA_NO_ENCONTRADA',
        `La mesa ${mesa.numero} es de otra sucursal: no se puede juntar con ésta.`,
      );
    }

    const grupo = await unionAbiertaDeMesa(tx, organizacionId, mesaId);
    if (grupo !== null) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        `La mesa ${mesa.numero} ya pertenece a otro grupo.`,
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
        `La cuenta de la mesa ${mesa.numero} ya se cobró o se cerró: no se puede absorber.`,
        { estado: orden?.estado ?? 'inexistente' },
      );
    }

    salida.push({ mesa, ordenId: orden.id });
  }

  return salida;
}
