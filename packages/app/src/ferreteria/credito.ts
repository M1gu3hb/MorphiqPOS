import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoFolios, type Transaccion } from '@morphiqpos/data';
import {
  evaluarSalidaACredito,
  type Evaluacion,
  type MotivoDeAviso,
  type Veredicto,
} from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-638, F-639 y F-606 · El material que sale firmado.
 *
 * ── Por qué la evaluación va ANTES de despachar y no en el cobro ─────────
 * Porque **en una venta a crédito no hay cobro**. Una comprobación colgada del
 * cobro es una comprobación que en este giro no corre nunca, y el material sale
 * a las 7:40 con prisa mientras el saldo está en una libreta bajo el mostrador.
 *
 * ── Por qué la remisión sella si estaba en la lista ──────────────────────
 * Es el dato que importa cuando la cuenta se impugna, y **no se puede derivar
 * después**: el autorizado pudo darse de baja entre la entrega y el pleito, y
 * entonces la derivación diría que no estaba cuando sí estaba. Se sella en el
 * momento, como el precio en la línea de venta y por el mismo motivo.
 *
 * ── Por qué el nombre del firmante es obligatorio aunque no esté en la lista ──
 * Porque un documento de entrega sin nombre de quien recibió no sirve para
 * nada, que es exactamente el estado de hoy con el talonario de papel carbón.
 * Si no estaba autorizado, se escribe a mano; lo que no se permite es que no
 * haya nadie.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaEvaluarSalida = z.object({
  clienteId: z.uuid(),
  importeCentavos: z.number().int().min(1).max(100_000_000),
  obraId: z.uuid().optional(),
  autorizadoId: z.uuid().optional(),
});

export const entradaRegistrarRemision = z.object({
  ordenId: z.uuid(),
  clienteId: z.uuid(),
  importeCentavos: z.number().int().min(1).max(100_000_000),
  obraId: z.uuid().optional(),
  autorizadoId: z.uuid().optional(),
  /** Quien firmó. Si no estaba en la lista, se escribe a mano. */
  nombreFirmante: z.string().trim().min(2).max(120),
  firmaUrl: z.string().trim().max(500).optional(),
  /** La llave del dueño, para un cliente bloqueado por mora. */
  autorizacionDelDueno: z.boolean().default(false),
});

export interface ResultadoEvaluacion {
  readonly veredicto: Veredicto;
  readonly motivos: readonly MotivoDeAviso[];
  readonly disponibleDespuesCentavos: string;
  readonly saldoClienteCentavos: string;
}

export interface ResultadoRemision {
  readonly remisionId: string;
  readonly folio: string;
  readonly veredicto: Veredicto;
  readonly motivos: readonly MotivoDeAviso[];
  readonly autorizadoEstabaEnLista: boolean;
  readonly saldoClienteCentavos: string;
}

export const evaluarSalida = definirComando<
  Transaccion,
  typeof entradaEvaluarSalida,
  ResultadoEvaluacion
>({
  nombre: 'credito.evaluar_salida',
  entidad: 'cliente',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEvaluarSalida,
  async ejecutar(ctx, entrada) {
    const { evaluacion, cliente } = await evaluar(ctx, entrada);

    return {
      veredicto: evaluacion.veredicto,
      motivos: evaluacion.motivos,
      disponibleDespuesCentavos: evaluacion.disponibleDespuesCentavos.toString(),
      saldoClienteCentavos: cliente.saldo.toString(),
    };
  },
});

export const registrarRemision = definirComando<
  Transaccion,
  typeof entradaRegistrarRemision,
  ResultadoRemision
>({
  nombre: 'credito.registrar_remision',
  entidad: 'remision',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaRegistrarRemision,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'La remisión lleva folio por sucursal: hace falta saber desde cuál se entrega.',
      );
    }

    const { evaluacion, cliente, autorizado } = await evaluar(ctx, entrada);

    // La mora es lo ÚNICO que bloquea, y siempre con llave del dueño. Todo lo
    // demás avisa y deja pasar: convertirlo en muro apagaría el sistema la
    // primera vez que el mejor cliente venga con una urgencia.
    if (evaluacion.veredicto === 'requiere_llave' && !entrada.autorizacionDelDueno) {
      throw new ErrorDominio(
        'PUENTE_SIN_PERMISO',
        'Ese cliente está bloqueado por mora: hace falta la autorización del dueño.',
        { motivos: evaluacion.motivos.join(', ') },
      );
    }

    const yaHay = await ctx.paso('mirar_remision', () =>
      ctx.tx
        .selectFrom('remisiones')
        .select(['id'])
        .where('orden_id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (yaHay !== undefined) {
      // Dos remisiones de la misma entrega suman dos veces al saldo del cliente,
      // y ése es el descuadre que se descubre cuando el contratista reclama.
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa entrega ya tiene su remisión.', {
        remisionId: yaHay.id,
      });
    }

    // Serie propia: la remisión NO comparte consecutivo con el ticket. Dos
    // documentos distintos en la misma serie hacen que el folio 480 sea a veces
    // una venta y a veces una entrega, y la cobranza deja de poder citarlo.
    const tomado = await ctx.paso('tomar_folio', () =>
      repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId, 'REM'),
    );
    // El folio lleva su serie delante: `REM-114`. No es decoración — es lo que
    // deja ver, desde el documento, de qué consecutivo salió.
    const folio = `${tomado.serie}-${tomado.folio.toString()}`;

    const importe = BigInt(entrada.importeCentavos);
    const remision = await ctx.paso('anotar_remision', () =>
      ctx.tx
        .insertInto('remisiones')
        .values({
          organizacion_id: organizacionId,
          orden_id: entrada.ordenId,
          folio,
          cliente_id: entrada.clienteId,
          obra_id: entrada.obraId ?? null,
          autorizado_id: autorizado === null ? null : (entrada.autorizadoId ?? null),
          nombre_firmante: entrada.nombreFirmante,
          // Se SELLA, no se deriva: el autorizado puede darse de baja entre la
          // entrega y el pleito.
          autorizado_estaba_en_lista: autorizado?.activo === true,
          firma_url: entrada.firmaUrl ?? null,
          importe_centavos: importe,
          // Nace debiendo todo: el pago se aplica después, contra ESTE documento.
          saldo_documento_centavos: importe,
          entregada_en: ctx.ahora,
          entregada_por: empleoId,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // El saldo del cliente sube con la ENTREGA, no con la factura. Facturar no
    // vuelve a ser venta: la venta ya se reconoció aquí, y es el error contable
    // más común del giro.
    const nuevoSaldo = cliente.saldo + importe;
    const actualizadas = await ctx.paso('subir_saldo', () =>
      ctx.tx
        .updateTable('clientes')
        .set({ saldo_pendiente_centavos: nuevoSaldo })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        // Compare-and-set sobre el saldo leído: dos remisiones simultáneas del
        // mismo contratista sumarían una sola si la segunda pisara a la primera.
        //
        // ESTO NO SE PUEDE PONER ROJO con la base falsa: no hay forma de meter
        // una escritura ajena entre la lectura y este `update` sin montar un
        // estado que Postgres no permite —dos filas con el mismo id—, y una
        // prueba sobre un estado imposible no prueba nada. Se declara como
        // segundo cerrojo de carrera, y el conteo de filas de abajo es lo que
        // convierte una actualización perdida en un error en vez de en silencio.
        .where('saldo_pendiente_centavos', '=', cliente.saldo)
        .executeTakeFirst(),
    );
    if (Number(actualizadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'El saldo de ese cliente cambió mientras se registraba la entrega.',
        { clienteId: entrada.clienteId },
      );
    }

    await ctx.paso('marcar_orden', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          obra_id: entrada.obraId ?? null,
          autorizado_id: entrada.autorizadoId ?? null,
          mostradorista_id: empleoId,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .execute(),
    );

    ctx.auditar({
      entidadId: remision.id,
      payload: {
        ordenId: entrada.ordenId,
        clienteId: entrada.clienteId,
        obraId: entrada.obraId ?? null,
        importeCentavos: entrada.importeCentavos,
        nombreFirmante: entrada.nombreFirmante,
        autorizadoEstabaEnLista: autorizado?.activo === true,
        motivos: evaluacion.motivos.join(', '),
      },
    });

    return {
      remisionId: remision.id,
      folio,
      veredicto: evaluacion.veredicto,
      motivos: evaluacion.motivos,
      autorizadoEstabaEnLista: autorizado?.activo === true,
      saldoClienteCentavos: nuevoSaldo.toString(),
    };
  },
});

interface ClienteDeCredito {
  readonly saldo: bigint;
  readonly limite: bigint;
  readonly bloqueado: boolean;
}

interface AutorizadoCargado {
  readonly activo: boolean;
  readonly tope: bigint | null;
}

/** Carga lo que hace falta y deja que el dominio decida. */
async function evaluar(
  ctx: ContextoComando<Transaccion>,
  entrada: {
    readonly clienteId: string;
    readonly importeCentavos: number;
    readonly obraId?: string | undefined;
    readonly autorizadoId?: string | undefined;
  },
): Promise<{
  readonly evaluacion: Evaluacion;
  readonly cliente: ClienteDeCredito;
  readonly autorizado: AutorizadoCargado | null;
}> {
  const { organizacionId } = ctx.ambito;

  const fila = await ctx.paso('cargar_cliente', () =>
    ctx.tx
      .selectFrom('clientes')
      .select([
        'id',
        'saldo_pendiente_centavos as saldo',
        'limite_credito_centavos as limite',
        'bloqueado_por_mora as bloqueado',
      ])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', entrada.clienteId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
  }
  const cliente: ClienteDeCredito = {
    saldo: fila.saldo,
    limite: fila.limite,
    bloqueado: fila.bloqueado,
  };

  const obraId = entrada.obraId;
  const obra =
    obraId === undefined
      ? null
      : await ctx.paso('cargar_obra', () =>
          ctx.tx
            .selectFrom('obras')
            .select(['id', 'estado', 'limite_centavos as limite'])
            .where('organizacion_id', '=', organizacionId)
            .where('cliente_id', '=', entrada.clienteId)
            .where('id', '=', obraId)
            .executeTakeFirst(),
        );
  if (obraId !== undefined && (obra === undefined || obra === null)) {
    // Una obra de OTRO cliente no es un aviso: es un tecleo, y cargarla ahí
    // metería el material en la cuenta equivocada.
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa obra no es de ese cliente.', { obraId });
  }

  const saldoObra =
    obra == null
      ? 0n
      : await ctx.paso('sumar_obra', () =>
          ctx.tx
            .selectFrom('remisiones')
            .select((eb) => eb.fn.sum('saldo_documento_centavos').as('saldo'))
            .where('organizacion_id', '=', organizacionId)
            .where('obra_id', '=', obra.id)
            .executeTakeFirst()
            .then((r) => BigInt(String(r?.saldo ?? '0').split('.')[0] ?? '0')),
        );

  const autorizadoId = entrada.autorizadoId;
  const autorizadoFila =
    autorizadoId === undefined
      ? null
      : await ctx.paso('cargar_autorizado', () =>
          ctx.tx
            .selectFrom('autorizados_cuenta')
            .select(['id', 'activo', 'tope_por_salida_centavos as tope', 'obra_id as obraId'])
            .where('organizacion_id', '=', organizacionId)
            .where('cliente_id', '=', entrada.clienteId)
            .where('id', '=', autorizadoId)
            .executeTakeFirst(),
        );

  // Un autorizado de OTRA obra no vale para ésta. Aceptarlo sería la lista de
  // autorizados sin la parte que la hace útil: el albañil de Las Torres no
  // puede retirar para la casa del centro.
  const autorizado: AutorizadoCargado | null =
    autorizadoFila == null ||
    (autorizadoFila.obraId !== null && autorizadoFila.obraId !== (entrada.obraId ?? null))
      ? null
      : { activo: autorizadoFila.activo, tope: autorizadoFila.tope };

  const evaluacion = evaluarSalidaACredito({
    importeCentavos: BigInt(entrada.importeCentavos),
    saldoClienteCentavos: cliente.saldo,
    limiteClienteCentavos: cliente.limite,
    bloqueadoPorMora: cliente.bloqueado,
    obra:
      obra == null
        ? null
        : {
            saldoCentavos: saldoObra,
            limiteCentavos: obra.limite,
            cerrada: obra.estado === 'cerrada',
          },
    autorizado:
      autorizado === null
        ? null
        : { activo: autorizado.activo, topePorSalidaCentavos: autorizado.tope },
  });

  return { evaluacion, cliente, autorizado };
}
