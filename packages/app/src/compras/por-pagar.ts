import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { antiguedadDeSaldos, type DocumentoDeCartera } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-635 · Cuentas por pagar: lo que el negocio DEBE.
 *
 * ── Lo señalaron tres modelos con las mismas palabras ────────────────────
 * «No sabe cuánto debe. Con crédito de 30 a 60 días del distribuidor, es la
 * mitad de su flujo.» En una ferretería y en un salón es igual: se compra a
 * crédito, se paga cuando pasa el repartidor, y el total de lo que se debe vive
 * en la cabeza de una persona.
 *
 * ── Por qué es el REFLEJO de la cartera y no otra cosa ───────────────────
 * Allí el negocio cobra y aquí paga, pero la aritmética es idéntica: documentos
 * con vencimiento y saldo, pagos que se aplican al más viejo primero, y una
 * antigüedad por tramos. Por eso esto NO reimplementa nada: usa
 * `antiguedadDeSaldos` de la cartera. Dos aritméticas para el mismo concepto es
 * exactamente cómo acaban dando números distintos, y entonces ninguno se cree.
 *
 * ── Lo más viejo primero, y no es una preferencia ────────────────────────
 * Aplicar el pago a la factura más nueva deja para siempre una de hace dos años
 * en el tramo de 90 días: el proveedor ve mora crónica donde sólo hay una
 * aplicación mal hecha, y el crédito se corta por un error de captura.
 */

const COMPRAS = ['gerente', 'administrador', 'dueno'] as const;

export const entradaRegistrarPorPagar = z.object({
  proveedorId: z.uuid(),
  folioProveedor: z.string().trim().min(1).max(40),
  compraId: z.uuid().nullable().default(null),
  importeCentavos: z.number().int().min(1).max(1_000_000_000),
  venceEn: z.iso.datetime(),
});

export const entradaPagarAProveedor = z.object({
  proveedorId: z.uuid(),
  montoCentavos: z.number().int().min(1).max(1_000_000_000),
  metodo: z.enum(['efectivo', 'transferencia', 'cheque', 'tarjeta']),
  referencia: z.string().trim().max(60).nullable().default(null),
  sesionCajaId: z.uuid().nullable().default(null),
});

export const entradaLoQueDebo = z.object({
  proveedorId: z.uuid().nullable().default(null),
});

export interface ResultadoPorPagar {
  readonly documentoId: string;
  readonly saldoCentavos: string;
}

export interface AplicacionAProveedor {
  readonly documentoId: string;
  readonly montoCentavos: string;
}

export interface ResultadoPago {
  readonly pagoId: string;
  readonly aplicaciones: readonly AplicacionAProveedor[];
  readonly sobranteCentavos: string;
}

export interface ResultadoDeuda {
  readonly totalCentavos: string;
  readonly vencidoCentavos: string;
  readonly diasDelMasViejo: number;
  readonly porTramo: Readonly<Record<string, string>>;
}

export const registrarPorPagar = definirComando<
  Transaccion,
  typeof entradaRegistrarPorPagar,
  ResultadoPorPagar
>({
  nombre: 'por_pagar.registrar',
  entidad: 'documento_por_pagar',
  escribe: true,
  roles: [...COMPRAS],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRegistrarPorPagar,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const vence = new Date(entrada.venceEn);
    if (vence.getTime() < ctx.ahora.getTime()) {
      // Una factura que nace vencida casi siempre es una fecha mal tecleada, y
      // entra directa al tramo de mora: el reporte del lunes dice que el
      // negocio está atrasado cuando no lo está.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esa factura nace vencida: revisa la fecha de vencimiento.',
      );
    }

    // El duplicado se busca ANTES: el mismo folio del mismo proveedor capturado
    // dos veces es la factura que se paga dos veces. La base también lo impide
    // con un `unique`, pero un 23505 no dice cuál folio chocó.
    const yaEsta = await ctx.paso('buscar_folio', () =>
      ctx.tx
        .selectFrom('documentos_por_pagar')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('proveedor_id', '=', entrada.proveedorId)
        .where('folio_proveedor', '=', entrada.folioProveedor)
        .executeTakeFirst(),
    );
    if (yaEsta !== undefined) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `El folio «${entrada.folioProveedor}» de ese proveedor ya está capturado.`,
      );
    }

    const importe = BigInt(entrada.importeCentavos);
    const documento = await ctx.paso('registrar', () =>
      ctx.tx
        .insertInto('documentos_por_pagar')
        .values({
          organizacion_id: organizacionId,
          proveedor_id: entrada.proveedorId,
          folio_proveedor: entrada.folioProveedor,
          compra_id: entrada.compraId,
          emitido_en: ctx.ahora,
          vence_en: vence,
          importe_centavos: importe,
          // Nace con el saldo completo: una factura registrada como pagada es
          // una que nadie va a volver a mirar.
          saldo_centavos: importe,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: documento.id,
      payload: { folio: entrada.folioProveedor, importeCentavos: entrada.importeCentavos },
    });
    return { documentoId: documento.id, saldoCentavos: importe.toString() };
  },
});

export const pagarAProveedor = definirComando<
  Transaccion,
  typeof entradaPagarAProveedor,
  ResultadoPago
>({
  nombre: 'por_pagar.pagar',
  entidad: 'pago_a_proveedor',
  escribe: true,
  roles: [...COMPRAS],
  paquetes: PAQUETES_TODOS,
  entrada: entradaPagarAProveedor,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const vivos = await ctx.paso('leer_documentos', () =>
      ctx.tx
        .selectFrom('documentos_por_pagar')
        .select(['id', 'vence_en', 'saldo_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('proveedor_id', '=', entrada.proveedorId)
        .where('saldo_centavos', '>', 0n)
        .execute(),
    );

    // Lo MÁS VIEJO primero. Aplicarlo al más nuevo deja para siempre una
    // factura de hace dos años en el tramo de 90 días.
    const enOrden = [...vivos].sort((a, b) => a.vence_en.getTime() - b.vence_en.getTime());

    let restante = BigInt(entrada.montoCentavos);
    const aplicaciones: AplicacionAProveedor[] = [];
    for (const documento of enOrden) {
      if (restante === 0n) break;
      const aplica = documento.saldo_centavos < restante ? documento.saldo_centavos : restante;
      aplicaciones.push({ documentoId: documento.id, montoCentavos: aplica.toString() });
      restante -= aplica;

      await ctx.paso('abonar_documento', () =>
        ctx.tx
          .updateTable('documentos_por_pagar')
          .set({ saldo_centavos: documento.saldo_centavos - aplica })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', documento.id)
          .execute(),
      );
    }

    const pago = await ctx.paso('registrar_pago', () =>
      ctx.tx
        .insertInto('pagos_a_proveedor')
        .values({
          organizacion_id: organizacionId,
          proveedor_id: entrada.proveedorId,
          // Cuando el pago cubre varios documentos NO se ata a ninguno: atarlo
          // al primero haría que el histórico del segundo no lo encontrara.
          documento_id: aplicaciones.length === 1 ? (aplicaciones[0]?.documentoId ?? null) : null,
          monto_centavos: BigInt(entrada.montoCentavos),
          metodo: entrada.metodo,
          referencia: entrada.referencia,
          sesion_caja_id: entrada.sesionCajaId,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: pago.id,
      payload: { aplicados: aplicaciones.length, sobrante: restante.toString() },
    });
    // Lo que sobra NO se reparte contra lo que no ha vencido: quedaría pagado
    // por adelantado algo que todavía se puede devolver.
    return { pagoId: pago.id, aplicaciones, sobranteCentavos: restante.toString() };
  },
});

export const loQueDebo = definirComando<Transaccion, typeof entradaLoQueDebo, ResultadoDeuda>({
  nombre: 'por_pagar.resumen',
  entidad: 'documento_por_pagar',
  escribe: false,
  roles: [...COMPRAS],
  paquetes: PAQUETES_TODOS,
  entrada: entradaLoQueDebo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    let consulta = ctx.tx
      .selectFrom('documentos_por_pagar')
      .select([
        'id',
        'folio_proveedor',
        'emitido_en',
        'vence_en',
        'importe_centavos',
        'saldo_centavos',
      ])
      .where('organizacion_id', '=', organizacionId)
      .where('saldo_centavos', '>', 0n);
    if (entrada.proveedorId !== null) {
      consulta = consulta.where('proveedor_id', '=', entrada.proveedorId);
    }
    const filas = await ctx.paso('leer_deuda', () => consulta.execute());

    // La MISMA función que la cartera de cobros. Dos aritméticas para el mismo
    // concepto acaban dando números distintos, y entonces ninguno se cree.
    const documentos: DocumentoDeCartera[] = filas.map((f) => ({
      id: f.id,
      folio: f.folio_proveedor,
      emitidoEn: f.emitido_en,
      venceEn: f.vence_en,
      importeCentavos: f.importe_centavos,
      saldoCentavos: f.saldo_centavos,
    }));
    const antiguedad = antiguedadDeSaldos(documentos, ctx.ahora);

    return {
      totalCentavos: antiguedad.totalCentavos.toString(),
      vencidoCentavos: antiguedad.vencidoCentavos.toString(),
      diasDelMasViejo: antiguedad.diasDelMasViejo,
      porTramo: Object.fromEntries(
        Object.entries(antiguedad.porTramo).map(([tramo, monto]) => [tramo, monto.toString()]),
      ),
    };
  },
});
