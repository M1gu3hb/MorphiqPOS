import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { descontarLaOrden } from '../venta/descuento-de-mostrador.ts';

/**
 * `restaurante.descontar_cuenta` — el descuento de la CUENTA DE UNA MESA, con su tope y su
 * supervisor (F-205, `restaurante/02-DINERO-Y-CAJA` §3; día completo del restaurante, 2.4).
 *
 * ── El hueco ─────────────────────────────────────────────────────────────────
 * §3 lo dice con todas sus letras: «el descuento es la puerta de robo más silenciosa del
 * giro», y por eso tope por rol, PIN de supervisor por encima del tope y la línea del
 * descuento con nombre en el corte. El mostrador lo tiene desde la D-28
 * (`venta.aplicar_descuento`), pero ese comando exige un BORRADOR —el carrito de la
 * tienda— y la cuenta de una mesa llega a caja `cuenta_solicitada`: **el restaurante no
 * tenía descuento ninguno**, ni dentro del tope ni con autorización. El cajero sólo podía
 * cobrar completo o cancelar la cuenta entera.
 *
 * ── Por qué un comando aparte y no relajar el del mostrador ─────────────────
 * Porque la guarda de borrador del mostrador es la que impide descontar una venta ya
 * cobrada, y aquí la guarda es OTRA: la cuenta tiene que ser de sala (de una mesa, o la
 * parte de una cuenta dividida) y seguir viva. El cuerpo —el tope, la autorización
 * firmada, la bitácora `autorizaciones_descuento`, el reparto exacto entre líneas y los
 * totales de `cotizar`— es UNO, `descontarLaOrden`, el mismo del mostrador: dos copias del
 * tope son cómo una se queda atrás el día que el tope cambie.
 *
 * ── Quién ────────────────────────────────────────────────────────────────────
 * La caja y quien dirige. El mesero NO (§3: «El mesero no»): es quien tiene el incentivo
 * más directo sobre la cuenta que atiende, igual que al dividir o cancelar.
 */

export const entradaDescontarCuenta = z.object({
  ordenId: z.uuid(),
  descuentoCentavos: z.number().int().min(1).max(100_000_000),
  motivo: z.string().trim().min(4).max(200),
  /** La autorización firmada del supervisor, cuando el descuento pasa del tope propio. */
  autorizacion: z.string().min(20).max(2_000).optional(),
});

export interface ResultadoDescuentoDeCuenta {
  readonly descuentoCentavos: string;
  readonly totalCentavos: string;
  /** El empleo de quien autorizó, o `null` si cupo en el tope de quien cobra. */
  readonly autorizadoPor: string | null;
}

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Las cuentas que todavía no se cobran ni se cancelan: las mismas del cambio de mesa. */
export const CUENTAS_DESCONTABLES = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

/** ¿Es una cuenta de sala —de una mesa o parte de una dividida— y sigue viva? */
export function motivoParaNoDescontar(orden: {
  readonly estado: string;
  readonly mesaId: string | null;
  readonly padreId: string | null;
}): string | null {
  if (orden.mesaId === null && orden.padreId === null) {
    return 'Esa venta no es la cuenta de una mesa: su descuento se da en el cobro donde se armó.';
  }
  if (!(CUENTAS_DESCONTABLES as readonly string[]).includes(orden.estado)) {
    return orden.estado === 'pagada'
      ? 'Esa cuenta ya se cobró: lo que se regresa ahora es una devolución, no un descuento.'
      : 'Esa cuenta ya no está viva: se canceló o se dividió en partes.';
  }
  return null;
}

export const descontarCuenta = definirComando<
  Transaccion,
  typeof entradaDescontarCuenta,
  ResultadoDescuentoDeCuenta
>({
  nombre: 'restaurante.descontar_cuenta',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaDescontarCuenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const orden = await ctx.paso('cargar_cuenta', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'mesa_id as mesaId', 'orden_padre_id as padreId'])
        // El filtro por organización SIEMPRE: conocer un id ajeno no abre su cuenta.
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta ya no existe.');
    }
    const motivo = motivoParaNoDescontar(orden);
    if (motivo !== null) {
      throw new ErrorDominio('ORDEN_NO_EDITABLE', motivo, { estado: orden.estado });
    }

    const hecho = await descontarLaOrden(ctx, orden.id, entrada);

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        descuentoCentavos: hecho.descuentoCentavos.toString(),
        baseCentavos: hecho.baseCentavos.toString(),
        motivo: entrada.motivo,
        autorizadoPor: hecho.autorizadoPor,
      },
    });
    return {
      descuentoCentavos: hecho.descuentoCentavos.toString(),
      totalCentavos: hecho.totalCentavos.toString(),
      autorizadoPor: hecho.autorizadoPor,
    };
  },
});
