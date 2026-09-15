import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import { dividirCuenta, type Transaccion } from '@morphiqpos/data';
import { calcularDivision, type LineaDivisible } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `restaurante.dividir_cuenta` — F-321.
 *
 * ── El hueco más caro de los ocho ──────────────────────────────────────────
 * La mesa de ocho pide cuentas separadas y hoy el cajero las calcula a mano en
 * el teléfono: de 5 a 12 minutos con gente esperando mesa detrás, y es donde
 * más descuadres nacen.
 *
 * ── Lo que el cliente manda, y lo que NO ───────────────────────────────────
 * Manda QUÉ LÍNEAS y CUÁNTAS UNIDADES van en cada parte. **No manda ni un
 * importe.** Los totales de las hijas los calcula el servidor a partir de los
 * importes que ya tenía la madre, que a su vez los calculó el servidor al
 * capturar. Un endpoint que aceptara «esta parte paga $200» dejaría que el
 * navegador decidiera cuánto se cobra.
 *
 * ── Dos cerrojos sobre el mismo número ─────────────────────────────────────
 * `calcularDivision` comprueba en el dominio que las partes sumen la madre, y
 * el trigger diferido de la 070 lo vuelve a comprobar en Postgres al cerrar la
 * transacción. Es dinero que ya está en la mesa: dividir una cuenta y perder
 * $40 en el camino no puede ser posible.
 */

const linea = z.object({
  lineaId: z.uuid(),
  /** Unidades enteras. Media hamburguesa no se cobra a medias: se comparte. */
  cantidad: z.number().int().min(1).max(999),
});

const particion = z.object({
  tomas: z.array(linea).min(1).max(60),
});

export const entradaDividirCuenta = z.object({
  ordenId: z.uuid(),
  // Dos partes como mínimo —dividir en una no es dividir— y doce como máximo,
  // que es la mesa más grande que este salón tiene.
  particiones: z.array(particion).min(2).max(12),
});

export interface ResultadoDivision {
  readonly ordenMadreId: string;
  readonly hijas: readonly {
    readonly ordenId: string;
    readonly indice: number;
    readonly folio: string;
    readonly totalCentavos: string;
  }[];
  readonly totalCentavos: string;
}

/**
 * Dividir es una decisión de CAJA.
 *
 * El mesero queda fuera por la misma razón que en la cancelación: es quien
 * tiene el incentivo más directo sobre la cuenta que atiende. Sale de
 * `ctx.ambito.rol`, de la sesión, nunca del cuerpo.
 */
const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const dividirCuentaComando = definirComando<
  Transaccion,
  typeof entradaDividirCuenta,
  ResultadoDivision
>({
  nombre: 'restaurante.dividir_cuenta',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaDividirCuenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    // El folio de cada hija se toma POR SUCURSAL, así que dividir sin sucursal
    // dejaría dos hijas con el mismo número. Se exige en vez de inventar una.
    const sucursalId = ctx.ambito.sucursalId;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Esta terminal no tiene sucursal: el folio de cada parte se toma por sucursal.',
      );
    }

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'mesa_id', 'serie', 'total_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );

    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta no existe en este negocio.');
    }

    const filas = await ctx.paso('cargar_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select(['id', 'cantidad', 'total_centavos'])
        .where('orden_id', '=', orden.id)
        // Una línea anulada no se cobra, así que tampoco se reparte. Incluirla
        // haría que las partes sumaran más que la madre.
        .where('anulada_en', 'is', null)
        .execute(),
    );

    if (filas.length === 0) {
      throw new ErrorDominio('ORDEN_VACIA', 'No se puede dividir una cuenta sin consumo.');
    }

    const lineas: LineaDivisible[] = filas.map((f) => ({
      lineaId: f.id,
      // `cantidad` viene como numeric de Postgres: llega en texto para no perder
      // precisión. Las líneas de mesa son unidades enteras.
      cantidad: Math.trunc(Number(f.cantidad)),
      importeCentavos: f.total_centavos,
    }));

    const calculo = calcularDivision(lineas, entrada.particiones);

    const porId = new Map(lineas.map((l) => [l.lineaId, l]));
    const hijas = await ctx.paso('escribir_division', () =>
      dividirCuenta(ctx.tx, {
        organizacionId,
        sucursalId,
        ordenMadreId: orden.id,
        mesaId: orden.mesa_id,
        serie: orden.serie,
        empleadoId: empleoId,
        ahora: ctx.ahora,
        particiones: calculo.particiones.map((p) => ({
          indice: p.indice,
          totalCentavos: p.totalCentavos,
          lineas: p.tomas.map((t) => ({
            lineaId: t.lineaId,
            cantidad: t.cantidad,
            importeCentavos: porId.get(t.lineaId)?.importeCentavos ?? 0n,
          })),
        })),
      }),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        partes: hijas.length,
        totalCentavos: calculo.totalCentavos.toString(),
        folios: hijas.map((h) => `${h.serie}-${h.folio}`),
      },
    });

    return {
      ordenMadreId: orden.id,
      hijas: hijas.map((h) => ({
        ordenId: h.ordenId,
        indice: h.indice,
        folio: `${h.serie}-${h.folio}`,
        totalCentavos: h.totalCentavos,
      })),
      totalCentavos: calculo.totalCentavos.toString(),
    };
  },
});
