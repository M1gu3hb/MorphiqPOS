import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoFolios, type Transaccion } from '@morphiqpos/data';
import {
  antiguedadDeSaldos,
  evaluarSalidaACredito,
  hayMora,
  type DocumentoDeCartera,
} from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-611 y F-612 · Emitir lo que se fía, y el estado de cuenta.
 *
 * ── Un documento, no tres ─────────────────────────────────────────────────
 * Un fiado de tiendita, una remisión de obra y una nota de mostrador son el
 * mismo hecho contable —«este cliente me debe esto desde esta fecha»— con tres
 * papeles distintos encima. Modelarlos por separado obligaría a escribir tres
 * veces la antigüedad, tres veces la aplicación de pagos y tres veces el
 * bloqueo, y a que las tres dieran el mismo número. Nunca lo dan.
 *
 * ── F-611 · El vencimiento se CONGELA al emitir ──────────────────────────
 * `emitido_en + dias_plazo`, guardado. Si mañana se le cambia el plazo al
 * cliente —porque pagó bien y se le amplía, o porque pagó mal y se le recorta—
 * lo que ya se fió vence cuando se dijo que vencía. Recalcularlo desde el plazo
 * actual movería hacia atrás y hacia delante la antigüedad de toda la cartera
 * con cada ajuste, y el reporte del lunes no se parecería al del viernes.
 *
 * ── Y por qué emitir COMPRUEBA el crédito ────────────────────────────────
 * Porque es el único momento en que se puede decir que no. Después ya salió la
 * mercancía.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Cuántos días de retraso se toleran antes de cortar. Quince es el del giro. */
const MORA_TOLERADA_DIAS = 15;
const MS_POR_DIA = 86_400_000;
/** El consecutivo de lo que se fía: `CR-12`. */
const SERIE_DEL_FIADO = 'CR';

export const entradaEmitirDocumento = z.object({
  clienteId: z.uuid(),
  origenTipo: z.enum(['venta', 'remision', 'nota_mostrador', 'ajuste']),
  origenId: z.uuid().optional(),
  importeCentavos: z.number().int().min(1).max(1_000_000_000),
});

export interface ResultadoDocumento {
  readonly documentoId: string;
  readonly folio: string;
  readonly venceEn: string;
  readonly saldoDelClienteCentavos: string;
  readonly disponibleCentavos: string;
}

export const emitirDocumentoCredito = definirComando<
  Transaccion,
  typeof entradaEmitirDocumento,
  ResultadoDocumento
>({
  nombre: 'credito.emitir_documento',
  entidad: 'documento_credito',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEmitirDocumento,
  async ejecutar(ctx, entrada) {
    const emitido = await emitirDocumento(ctx, entrada);
    // La auditoría es de QUIEN LLAMA: el ejecutor guarda sólo el primer rastro de cada
    // comando, y dentro de un cobro el rastro que manda es el del cobro.
    ctx.auditar({
      entidadId: emitido.documentoId,
      payload: {
        clienteId: entrada.clienteId,
        importeCentavos: entrada.importeCentavos,
        venceEn: emitido.venceEn,
      },
    });
    return emitido;
  },
});

/**
 * Emitir lo que se fía: la comprobación de crédito y el documento, en la transacción de quien
 * llama. La usan el comando `credito.emitir_documento` y el COBRO a fiado (`venta.cobrar` con
 * un pago `fiado`, C.10 de la 2.4): una sola aritmética del crédito, no dos que se separan.
 * No audita: la auditoría la escribe quien llama, con su propio rastro.
 */
export async function emitirDocumento(
  ctx: ContextoComando<Transaccion>,
  entrada: z.infer<typeof entradaEmitirDocumento>,
): Promise<ResultadoDocumento> {
  const { organizacionId, sucursalId, empleoId } = ctx.ambito;
  if (sucursalId === null) {
    throw new ErrorDominio(
      'VENTA_SIN_TERMINAL',
      'El documento lleva folio por sucursal: hace falta saber en cuál se emite.',
    );
  }

  const cliente = await cargarCliente(ctx, entrada.clienteId);

  // ── La comprobación de crédito, en el único momento en que se puede decir
  // que no. Después ya salió la mercancía.
  //
  // Se COMPONEN las dos mitades en vez de escribir una función nueva:
  // `evaluarSalidaACredito` —de E6, F-638 y F-639— ya sabe mirar el límite y
  // el bloqueo; `hayMora` contesta de dónde sale ese bloqueo cuando nadie lo
  // puso a mano. Una tercera función que volviera a mirar el límite sería el
  // error que el encargo nombra por su nombre.
  const vivos = await documentosVivos(ctx, entrada.clienteId);
  const antiguedad = antiguedadDeSaldos(vivos, ctx.ahora);
  const saldo = vivos.reduce((a, d) => a + d.saldoCentavos, 0n);

  const evaluacion = evaluarSalidaACredito({
    importeCentavos: BigInt(entrada.importeCentavos),
    saldoClienteCentavos: saldo,
    limiteClienteCentavos: cliente.limite_credito_centavos,
    // `null` en los dos: un fiado de tiendita no cuelga de una obra ni pasa
    // por la lista de autorizados. Ésas son las dos perillas que E6 añadió
    // para ferretería, y aquí se dejan apagadas — que es exactamente lo que
    // significa reutilizar con una perilla en vez de escribir otro código.
    obra: null,
    autorizado: null,
    bloqueadoPorMora: cliente.bloqueado_por_mora || hayMora(antiguedad, MORA_TOLERADA_DIAS),
  });
  if (evaluacion.veredicto === 'requiere_llave') {
    throw new ErrorDominio(
      'CONFIGURACION_CONFLICTO',
      cliente.bloqueado_por_mora
        ? 'Ese cliente está bloqueado a mano. Lo levanta quien lo puso.'
        : 'Ese cliente tiene saldo vencido: se cobra antes de volver a fiarle.',
      { motivos: evaluacion.motivos.join(', ') },
    );
  }
  if (evaluacion.motivos.includes('excede_limite_del_cliente')) {
    throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Eso pasa de su límite de crédito.', {
      disponibleCentavos: evaluacion.disponibleDespuesCentavos.toString(),
    });
  }

  // Serie PROPIA, como la remisión (`REM`): en la serie del ticket cada fiado se comía un
  // folio de venta y la numeración de las ventas salía con huecos que nadie sabe explicar.
  const tomado = await ctx.paso('tomar_folio', () =>
    repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId, SERIE_DEL_FIADO),
  );

  const vence = new Date(ctx.ahora.getTime() + cliente.dias_plazo * MS_POR_DIA);

  const documento = await ctx.paso('emitir', () =>
    ctx.tx
      .insertInto('documentos_credito')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        cliente_id: entrada.clienteId,
        origen_tipo: entrada.origenTipo,
        origen_id: entrada.origenId ?? null,
        folio: `${tomado.serie}-${tomado.folio.toString()}`,
        emitido_en: ctx.ahora,
        vence_en: vence,
        importe_centavos: BigInt(entrada.importeCentavos),
        // Nace debiendo todo: el saldo se decrementa al aplicar pagos.
        saldo_centavos: BigInt(entrada.importeCentavos),
        empleado_id: empleoId,
        created_at: ctx.ahora,
      })
      .returning(['id', 'folio'])
      .executeTakeFirstOrThrow(),
  );

  const saldoDespues = saldo + BigInt(entrada.importeCentavos);

  return {
    documentoId: documento.id,
    folio: documento.folio,
    venceEn: vence.toISOString(),
    saldoDelClienteCentavos: saldoDespues.toString(),
    disponibleCentavos: evaluacion.disponibleDespuesCentavos.toString(),
  };
}

export const entradaEstadoDeCuenta = z.object({ clienteId: z.uuid() });

export interface RenglonDeEstado {
  readonly documentoId: string;
  readonly folio: string;
  readonly origenTipo: string;
  readonly emitidoEn: string;
  readonly venceEn: string;
  readonly importeCentavos: string;
  readonly saldoCentavos: string;
  /** Negativo mientras no venza; positivo son días de retraso. */
  readonly diasVencidos: number;
}

export interface ResultadoEstadoDeCuenta {
  readonly clienteId: string;
  readonly renglones: readonly RenglonDeEstado[];
  readonly totalCentavos: string;
  readonly vencidoCentavos: string;
  readonly limiteCentavos: string;
  readonly disponibleCentavos: string;
  readonly bloqueado: boolean;
}

/**
 * F-612 · El estado de cuenta, que es el documento que se manda.
 *
 * ── Por qué trae los DOS números y no sólo el total ──────────────────────
 * Porque «me debe $80 000» y «me debe $80 000, de los cuales $62 000 llevan más
 * de sesenta días» son dos conversaciones distintas, y sólo la segunda se puede
 * tener con el cliente delante.
 */
export const estadoDeCuenta = definirComando<
  Transaccion,
  typeof entradaEstadoDeCuenta,
  ResultadoEstadoDeCuenta
>({
  nombre: 'credito.estado_de_cuenta',
  entidad: 'documento_credito',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEstadoDeCuenta,
  async ejecutar(ctx, entrada) {
    const cliente = await cargarCliente(ctx, entrada.clienteId);
    const filas = await ctx.paso('leer_documentos', () =>
      ctx.tx
        .selectFrom('documentos_credito')
        .select([
          'id',
          'folio',
          'origen_tipo',
          'emitido_en',
          'vence_en',
          'importe_centavos',
          'saldo_centavos',
        ])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('cliente_id', '=', entrada.clienteId)
        .where('saldo_centavos', '>', 0n)
        .orderBy('vence_en', 'asc')
        .execute(),
    );

    const paraDominio: DocumentoDeCartera[] = filas.map((f) => ({
      id: f.id,
      folio: f.folio,
      emitidoEn: f.emitido_en,
      venceEn: f.vence_en,
      importeCentavos: f.importe_centavos,
      saldoCentavos: f.saldo_centavos,
    }));
    const antiguedad = antiguedadDeSaldos(paraDominio, ctx.ahora);

    return {
      clienteId: entrada.clienteId,
      renglones: filas.map((f) => ({
        documentoId: f.id,
        folio: f.folio,
        origenTipo: f.origen_tipo,
        emitidoEn: f.emitido_en.toISOString(),
        venceEn: f.vence_en.toISOString(),
        importeCentavos: f.importe_centavos.toString(),
        saldoCentavos: f.saldo_centavos.toString(),
        diasVencidos: Math.floor((ctx.ahora.getTime() - f.vence_en.getTime()) / MS_POR_DIA),
      })),
      totalCentavos: antiguedad.totalCentavos.toString(),
      vencidoCentavos: antiguedad.vencidoCentavos.toString(),
      limiteCentavos: cliente.limite_credito_centavos.toString(),
      disponibleCentavos: (cliente.limite_credito_centavos - antiguedad.totalCentavos).toString(),
      bloqueado: cliente.bloqueado_por_mora,
    };
  },
});

export interface ClienteDeCredito {
  readonly limite_credito_centavos: bigint;
  readonly dias_plazo: number;
  readonly bloqueado_por_mora: boolean;
}

export async function cargarCliente(
  ctx: ContextoComando<Transaccion>,
  clienteId: string,
): Promise<ClienteDeCredito> {
  const fila = await ctx.paso('cargar_cliente', () =>
    ctx.tx
      .selectFrom('clientes')
      .select(['limite_credito_centavos', 'dias_plazo', 'bloqueado_por_mora'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', clienteId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
  }
  return fila;
}

/** Los documentos con saldo, que son los únicos que importan para decidir. */
export async function documentosVivos(
  ctx: ContextoComando<Transaccion>,
  clienteId: string,
): Promise<readonly DocumentoDeCartera[]> {
  const filas = await ctx.paso('leer_vivos', () =>
    ctx.tx
      .selectFrom('documentos_credito')
      .select(['id', 'folio', 'emitido_en', 'vence_en', 'importe_centavos', 'saldo_centavos'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('cliente_id', '=', clienteId)
      .where('saldo_centavos', '>', 0n)
      .execute(),
  );
  return filas.map((f) => ({
    id: f.id,
    folio: f.folio,
    emitidoEn: f.emitido_en,
    venceEn: f.vence_en,
    importeCentavos: f.importe_centavos,
    saldoCentavos: f.saldo_centavos,
  }));
}
