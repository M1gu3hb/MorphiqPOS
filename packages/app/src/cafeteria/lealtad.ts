import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { evaluarCanje, pasivoDeLealtad, sellosDeLaVenta } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-930, F-934 y F-936 · Sellos, canje y pasivo.
 *
 * ── Los tres son el mismo ledger ──────────────────────────────────────────
 * Otorgar, canjear y ajustar son tres movimientos de `lealtad_movimientos` con
 * distinto signo y distinto tipo. El saldo es la SUMA, y `lealtad_saldos` es
 * caché con índice — la misma decisión que se tomó con `movimientos_stock`, y
 * por la misma razón: un saldo escribible es un saldo que alguien va a
 * «arreglar», y el día que lo arregle nadie va a poder decir por qué la clienta
 * tenía cinco sellos y ahora tiene nueve.
 *
 * ── Y el pasivo (F-936) no es una columna ─────────────────────────────────
 * Es una consulta. Cambia con cada venta, y un pasivo guardado se desincroniza
 * el primer día.
 */

const ROLES = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;
const ROLES_DE_AJUSTE = ['gerente', 'administrador', 'dueno'] as const;

export const entradaOtorgarSellos = z.object({
  clienteId: z.uuid(),
  ordenId: z.uuid(),
});

export interface ResultadoSellos {
  readonly clienteId: string;
  readonly sellosOtorgados: number;
  readonly saldo: number;
  /** `true` si con esto ya alcanza para un premio. Es lo que la pantalla grita. */
  readonly yaAlcanza: boolean;
}

export const otorgarSellos = definirComando<
  Transaccion,
  typeof entradaOtorgarSellos,
  ResultadoSellos
>({
  nombre: 'lealtad.otorgar',
  entidad: 'lealtad_movimiento',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaOtorgarSellos,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    await comprobarCliente(ctx, entrada.clienteId);

    // El catálogo decide cuántos sellos da cada producto, y el SERVIDOR lo lee.
    // Si viniera del cliente, el programa de lealtad se podría regalar entero
    // desde la consola del navegador.
    const lineas = await ctx.paso('cargar_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .innerJoin('productos', 'productos.id', 'orden_lineas.producto_id')
        .select([
          'orden_lineas.producto_id as producto_id',
          'orden_lineas.cantidad as cantidad',
          'orden_lineas.tipo_linea as tipo',
          'productos.sellos_otorga as otorga',
        ])
        .where('orden_lineas.organizacion_id', '=', organizacionId)
        .where('orden_lineas.orden_id', '=', entrada.ordenId)
        .where('orden_lineas.anulada_en', 'is', null)
        .execute(),
    );
    if (lineas.length === 0) {
      throw new ErrorDominio('ORDEN_VACIA', 'Esa venta no tiene líneas que den sellos.');
    }

    const sellos = sellosDeLaVenta(
      lineas.map((l) => ({
        productoId: l.producto_id ?? '',
        cantidad: Math.trunc(Number(l.cantidad)),
        sellosOtorga: l.otorga,
        esCanje: l.tipo === 'canje_lealtad',
      })),
    );

    if (sellos === 0) {
      // No es un error: una venta de pura bolsa de grano no da sellos, y eso es
      // una decisión de margen, no un fallo. Se devuelve el saldo sin escribir.
      const saldo = await saldoDe(ctx, entrada.clienteId);
      return {
        clienteId: entrada.clienteId,
        sellosOtorgados: 0,
        saldo,
        yaAlcanza: false,
      };
    }

    await ctx.paso('anotar_sellos', () =>
      ctx.tx
        .insertInto('lealtad_movimientos')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          cliente_id: entrada.clienteId,
          tipo: 'otorga',
          sellos,
          orden_id: entrada.ordenId,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    // DESPUÉS de insertar y sin sumar aparte: la fila recién escrita ya es
    // visible dentro de la misma transacción, tanto en Postgres como en la base
    // falsa. Sumarla otra vez daba el doble, y el aviso de «ya alcanza» se
    // habría disparado un café antes de tiempo.
    const saldo = await saldoDe(ctx, entrada.clienteId);
    const porPremio = await sellosPorPremio(ctx);

    ctx.auditar({
      entidadId: entrada.clienteId,
      payload: { ordenId: entrada.ordenId, sellos, saldo },
    });

    return {
      clienteId: entrada.clienteId,
      sellosOtorgados: sellos,
      saldo,
      yaAlcanza: saldo >= porPremio,
    };
  },
});

export const entradaCanjear = z.object({
  clienteId: z.uuid(),
  productoId: z.uuid(),
  ordenId: z.uuid().optional(),
});

export interface ResultadoCanje {
  readonly clienteId: string;
  readonly sellosGastados: number;
  readonly saldo: number;
  readonly costoCentavos: string;
}

export const canjearPremio = definirComando<Transaccion, typeof entradaCanjear, ResultadoCanje>({
  nombre: 'lealtad.canjear',
  entidad: 'lealtad_movimiento',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCanjear,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    await comprobarCliente(ctx, entrada.clienteId);

    const saldo = await saldoDe(ctx, entrada.clienteId);
    const porPremio = await sellosPorPremio(ctx);
    const veredicto = evaluarCanje({ saldo, sellosPorPremio: porPremio });
    if (!veredicto.puede) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Le faltan ${String(veredicto.faltan)} sellos para el premio.`,
        { saldo, faltan: veredicto.faltan },
      );
    }

    // El COSTO se congela en el movimiento: el premio de hace un año se valuó
    // con el costo de hace un año, y el pasivo histórico no puede cambiar
    // porque hoy suba la leche.
    const producto = await ctx.paso('cargar_premio', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'costo_unitario_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese premio no existe en este negocio.');
    }

    await ctx.paso('anotar_canje', () =>
      ctx.tx
        .insertInto('lealtad_movimientos')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          cliente_id: entrada.clienteId,
          tipo: 'canje',
          // NEGATIVO: el saldo es la suma del ledger y un canje resta.
          sellos: -veredicto.sellosQueCuesta,
          orden_id: entrada.ordenId ?? null,
          producto_id: entrada.productoId,
          costo_centavos: producto.costo_unitario_centavos,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    ctx.auditar({
      entidadId: entrada.clienteId,
      payload: {
        productoId: entrada.productoId,
        sellos: veredicto.sellosQueCuesta,
        costoCentavos: producto.costo_unitario_centavos.toString(),
      },
    });

    return {
      clienteId: entrada.clienteId,
      sellosGastados: veredicto.sellosQueCuesta,
      saldo: veredicto.saldoDespues,
      costoCentavos: producto.costo_unitario_centavos.toString(),
    };
  },
});

export const entradaAjustarSellos = z.object({
  clienteId: z.uuid(),
  sellos: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((n) => n !== 0, 'Un ajuste de cero no ajusta.'),
  motivo: z.string().trim().min(4).max(200),
});

export const ajustarSellos = definirComando<
  Transaccion,
  typeof entradaAjustarSellos,
  ResultadoSellos
>({
  nombre: 'lealtad.ajustar',
  entidad: 'lealtad_movimiento',
  escribe: true,
  // Sólo mandos: un ajuste de sellos es dinero regalado, y el cajero ya tiene
  // el comando de otorgar para lo que sí es una venta.
  roles: [...ROLES_DE_AJUSTE],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAjustarSellos,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    await comprobarCliente(ctx, entrada.clienteId);
    const saldo = await saldoDe(ctx, entrada.clienteId);

    if (saldo + entrada.sellos < 0) {
      // El saldo nunca queda negativo: es lo único que el cliente lleva contado
      // en la cabeza, y un −2 se descubre cuando dice «pero si yo tenía cuatro».
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Ese ajuste dejaría el saldo en negativo.',
        { saldo, ajuste: entrada.sellos },
      );
    }

    await ctx.paso('anotar_ajuste', () =>
      ctx.tx
        .insertInto('lealtad_movimientos')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          cliente_id: entrada.clienteId,
          tipo: 'ajuste',
          sellos: entrada.sellos,
          // Obligatorio por `check`: un ajuste sin motivo es un sello regalado
          // que nadie va a poder explicar.
          motivo: entrada.motivo,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    const porPremio = await sellosPorPremio(ctx);

    ctx.auditar({
      entidadId: entrada.clienteId,
      payload: { sellos: entrada.sellos, motivo: entrada.motivo },
    });

    return {
      clienteId: entrada.clienteId,
      sellosOtorgados: entrada.sellos,
      saldo: saldo + entrada.sellos,
      yaAlcanza: saldo + entrada.sellos >= porPremio,
    };
  },
});

export interface ResultadoPasivo {
  readonly sellosVivos: number;
  readonly clientesConSaldo: number;
  readonly pasivoCentavos: string;
}

/**
 * El pasivo no lleva filtros: es el de esta organización y punto.
 *
 * Un objeto vacío y no `z.void()` porque el envoltorio valida el cuerpo del
 * `POST`, y un cuerpo `{}` es lo que manda la pantalla.
 */
export const entradaPasivo = z.object({});

/** F-936 · Lo que el negocio debe en premios. Lectura pura. */
export const pasivoDeSellos = definirComando<Transaccion, typeof entradaPasivo, ResultadoPasivo>({
  nombre: 'lealtad.pasivo',
  entidad: 'lealtad_saldo',
  escribe: false,
  roles: [...ROLES_DE_AJUSTE],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaPasivo,
  async ejecutar(ctx) {
    const fila = await ctx.paso('leer_pasivo', () =>
      ctx.tx
        .selectFrom('lealtad_pasivo')
        .select(['sellos_vivos', 'clientes_con_saldo', 'costo_premio_centavos'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .executeTakeFirst(),
    );

    if (fila === undefined) {
      return { sellosVivos: 0, clientesConSaldo: 0, pasivoCentavos: '0' };
    }

    const porPremio = await sellosPorPremio(ctx);
    const pasivo = pasivoDeLealtad({
      sellosVivos: Number(fila.sellos_vivos),
      sellosPorPremio: porPremio,
      costoPremioCentavos: fila.costo_premio_centavos,
    });

    return {
      sellosVivos: Number(fila.sellos_vivos),
      clientesConSaldo: fila.clientes_con_saldo,
      pasivoCentavos: pasivo.toString(),
    };
  },
});

async function comprobarCliente(
  ctx: ContextoComando<Transaccion>,
  clienteId: string,
): Promise<void> {
  const fila = await ctx.paso('cargar_cliente', () =>
    ctx.tx
      .selectFrom('clientes')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', clienteId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
  }
}

/** El saldo, DERIVADO del ledger. Nunca de la columna de caché. */
async function saldoDe(ctx: ContextoComando<Transaccion>, clienteId: string): Promise<number> {
  const filas = await ctx.paso('sumar_sellos', () =>
    ctx.tx
      .selectFrom('lealtad_movimientos')
      .select(['sellos'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('cliente_id', '=', clienteId)
      .execute(),
  );
  return filas.reduce((a, f) => a + f.sellos, 0);
}

/**
 * Cuántos sellos cuesta un premio. Del documento de configuración.
 *
 * Cinco por omisión, que es lo que usa la tarjeta de cartón de este giro. Sin
 * valor configurado NO se falla: fallar dejaría al negocio sin poder otorgar
 * sellos el día que alguien borre la clave, y otorgar no cuesta nada.
 */
const SELLOS_POR_PREMIO_POR_OMISION = 5;

async function sellosPorPremio(ctx: ContextoComando<Transaccion>): Promise<number> {
  const fila = await ctx.paso('leer_configuracion', () =>
    ctx.tx
      .selectFrom('configuracion')
      .select(['valores'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .executeTakeFirst(),
  );
  const documento = fila?.valores;
  if (documento === null || documento === undefined || typeof documento !== 'object') {
    return SELLOS_POR_PREMIO_POR_OMISION;
  }
  const valor = (documento as Record<string, unknown>)['sellos_por_premio'];
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0
    ? valor
    : SELLOS_POR_PREMIO_POR_OMISION;
}
