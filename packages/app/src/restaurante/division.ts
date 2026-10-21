import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { calcularDivision, type LineaDivisible } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { generarCodigoCaja, origenDePropina, pedirCuentaEnMesa } from './cuenta.ts';
import { mesaOperable } from './datos.ts';
import { DIVISIBLES, escribirDivision, type PropinaDeLasPartes } from './division-escrituras.ts';

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
 *
 * ── Dividir se hace CON la cuenta pedida (día completo del restaurante, 2.4) ──
 * La mesa pide «cuentas separadas» al final, con la cuenta ya sobre la mesa: es el
 * momento en que la caja divide. El comando sólo aceptaba una cuenta sin pedir —y
 * contestaba «una cobrada se devuelve, una dividida ya lo está» a la que sí estaba pedida,
 * que no es ni una cosa ni la otra—. Ahora acepta las dos, y cada parte NACE pedida,
 * con la propina que la mesa acordó y con la mesa en «cuenta solicitada»: las partes son
 * lo que la caja tiene que cobrar. El SQL vive en `division-escrituras.ts`.
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
    /** El código con que la caja la encuentra: el de la mesa y el número de la parte. */
    readonly codigoCaja: string;
    /** «Mesa 3 · cuenta 1 de 2». */
    readonly etiqueta: string;
    readonly totalCentavos: string;
  }[];
  readonly totalCentavos: string;
  /** Cómo quedó la mesa: con las cuentas pedidas, para que la caja las cobre. */
  readonly estadoMesa: string | null;
}

/**
 * Dividir es una decisión de CAJA.
 *
 * El mesero queda fuera por la misma razón que en la cancelación: es quien
 * tiene el incentivo más directo sobre la cuenta que atiende. Sale de
 * `ctx.ambito.rol`, de la sesión, nunca del cuerpo.
 */
const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/**
 * La propina de cada parte: la que la mesa acordó con el mesero, o la que decide la caja.
 *
 * Un porcentaje o un «sin propina» se heredan tal cual —cada parte lo aplica sobre SU
 * consumo—. Cualquier otra cosa (nada acordado, un monto a mano que no viaja, la que
 * espera al comensal) no se puede repartir sin inventar un importe, y entonces cada parte
 * llega a la caja con la propina SIN decidir, que es el muro de la caja.
 */
function propinaDeLasPartes(madre: {
  readonly propina_tipo: string | null;
  readonly propina_puntos_base: number;
  readonly propina_origen: string | null;
  readonly estrategia_captura: string;
}): PropinaDeLasPartes {
  if (madre.propina_tipo === 'porcentaje' || madre.propina_tipo === 'sin_propina') {
    return {
      tipo: madre.propina_tipo,
      puntosBase: madre.propina_puntos_base,
      origen: madre.propina_origen ?? origenDePropina(madre.estrategia_captura),
    };
  }
  return { tipo: 'decidir_en_caja', puntosBase: 0, origen: 'caja' };
}

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
  sucursal: { ordenId: 'ordenes', 'particiones[].tomas[].lineaId': 'orden_lineas' },
  entrada: entradaDividirCuenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    // Las hijas cuelgan de una sucursal, así que dividir sin sucursal las dejaría huérfanas.
    // Se exige en vez de inventar una.
    const sucursalId = ctx.ambito.sucursalId;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Esta terminal no tiene sucursal: cada parte de la cuenta cuelga de una sucursal.',
      );
    }

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select([
          'id',
          'estado',
          'mesa_id',
          'serie',
          'total_centavos',
          'codigo_caja',
          'sesion_caja_id',
          'empleado_atiende_id',
          'terminal_id',
          'estrategia_captura',
          'estrategia_cumplimiento',
          'propina_tipo',
          'propina_puntos_base',
          'propina_origen',
          'orden_padre_id',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        // El candado de la cuenta: dividir reparte las líneas que hay AHORA, y un pedido que
        // entra a la vez se quedaría fuera de las partes (`datos.ts`, `ordenDeMesa`).
        .forUpdate()
        .executeTakeFirst(),
    );

    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta no existe en este negocio.');
    }
    // Una parte no se vuelve a dividir: la mesa se recoge cuando se cobran las partes de
    // la madre, y una parte «dividida» nunca llegaría a estar cobrada.
    if (orden.orden_padre_id !== null) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya es una parte de otra dividida: se cobra tal cual, no se vuelve a dividir.',
        { estado: orden.estado },
      );
    }
    if (!(DIVISIBLES as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Sólo se divide una cuenta abierta: una cobrada se devuelve, una dividida ya lo está.',
        { estado: orden.estado },
      );
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

    // La mesa: de ella salen su número —para nombrar cada parte— y el estado al que
    // pasa. Una cuenta de mostrador no tiene mesa y se divide igual.
    const mesaId = orden.mesa_id;
    const mesa =
      mesaId === null
        ? null
        : await ctx.paso('cargar_mesa', () => mesaOperable(ctx.tx, organizacionId, mesaId));

    const hijas = await ctx.paso('escribir_division', () =>
      escribirDivision(ctx.tx, {
        organizacionId,
        sucursalId,
        madre: {
          id: orden.id,
          serie: orden.serie,
          sesionCajaId: orden.sesion_caja_id,
          empleadoAtiendeId: orden.empleado_atiende_id,
          terminalId: orden.terminal_id,
          estrategiaCaptura: orden.estrategia_captura,
          estrategiaCumplimiento: orden.estrategia_cumplimiento,
        },
        codigoBase: orden.codigo_caja ?? generarCodigoCaja(mesa?.numero ?? 0),
        rotuloDeLaMesa: mesa === null ? 'Cuenta' : `Mesa ${String(mesa.numero)}`,
        propina: propinaDeLasPartes(orden),
        lineas,
        particiones: calculo.particiones,
        empleoId,
        mesaId,
        ahora: ctx.ahora,
      }),
    );

    // Las partes son cuentas PEDIDAS: la mesa pasa a «cuenta solicitada», que es lo que
    // dice el mapa mientras la caja las cobra. Si ya lo estaba, no hay transición que sellar.
    const estadoMesa =
      mesa === null
        ? null
        : mesa.estado === 'cuenta_solicitada'
          ? mesa.estado
          : await ctx.paso('pedir_cuenta_en_mesa', () =>
              pedirCuentaEnMesa(ctx.tx, organizacionId, mesa.id, mesa.estado, {
                sucursalId: mesa.sucursalId,
                ordenId: orden.id,
                empleoId,
                ahora: ctx.ahora,
              }),
            );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        partes: hijas.length,
        totalCentavos: calculo.totalCentavos.toString(),
        codigos: hijas.map((h) => h.codigoCaja),
        estabaPedida: orden.estado === 'cuenta_solicitada',
      },
    });

    return {
      ordenMadreId: orden.id,
      hijas: hijas.map((h) => ({
        ordenId: h.ordenId,
        indice: h.indice,
        codigoCaja: h.codigoCaja,
        etiqueta: h.etiqueta,
        totalCentavos: h.totalCentavos.toString(),
      })),
      totalCentavos: calculo.totalCentavos.toString(),
      estadoMesa,
    };
  },
});
