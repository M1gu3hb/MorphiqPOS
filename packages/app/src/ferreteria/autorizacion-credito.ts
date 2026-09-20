import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-617-bis · La llave del dueño, y por qué SIEMPRE tiene que existir.
 *
 * ── El muro sin llave se apaga ───────────────────────────────────────────
 * Un sistema que bloquea la salida a crédito de un cliente en mora y no deja
 * excepción se desactiva el primer viernes en que el contratista de siempre
 * llega por $40,000 de varilla con tres días de retraso. No se discute el muro:
 * se apaga el módulo entero, y a partir de ahí el negocio vuelve a la libreta.
 *
 * ── Por eso la llave se REGISTRA, no se esconde ──────────────────────────
 * La autorización deja fila con quién la dio, para qué cliente, por cuánto y
 * con qué motivo escrito. Eso convierte «el dueño dijo que sí» —que nadie puede
 * verificar tres meses después— en un renglón que se puede contar: si el mismo
 * cliente lleva nueve autorizaciones en dos meses, el muro no está fallando,
 * está diciendo algo que nadie quiere oír.
 *
 * ── Y la autorización es DE UN IMPORTE, no un permiso abierto ────────────
 * Vale para esta salida y por este monto. Una llave que deja al cliente
 * desbloqueado «hasta nuevo aviso» es una llave que nadie vuelve a girar en la
 * otra dirección: el bloqueo nunca regresa y el muro deja de existir sin que
 * nadie haya decidido quitarlo.
 *
 * ── El motivo es obligatorio y se comprueba que diga algo ────────────────
 * «ok» no es un motivo. Lo que hace útil este registro es poder leer seis meses
 * después por qué se dejó salir el material, y un campo que admite dos letras
 * se llena con dos letras.
 */

/** Sólo quien responde por el dinero. El cajero no se autoriza a sí mismo. */
const LLAVE = ['administrador', 'dueno'] as const;
const CONSULTA = ['gerente', ...LLAVE] as const;

/** Menos que esto no es una razón: es un trámite rellenado. */
const MINIMO_DE_MOTIVO = 10;

export const entradaAutorizarCredito = z.object({
  clienteId: z.uuid(),
  /** Por cuánto vale. La autorización es de ESTA salida, no un permiso abierto. */
  importeCentavos: z.number().int().min(1).max(100_000_000),
  ordenId: z.uuid().nullable().default(null),
  motivo: z.string().trim().min(MINIMO_DE_MOTIVO).max(300),
  /** Cuántas horas vale. Una autorización sin caducidad es un muro quitado. */
  vigenciaHoras: z.number().int().min(1).max(72).default(8),
});

export const entradaAutorizacionesDe = z.object({
  clienteId: z.uuid().nullable().default(null),
  dias: z.number().int().min(1).max(365).default(60),
});

export interface ResultadoAutorizacion {
  readonly autorizacionId: string;
  readonly clienteId: string;
  readonly importeCentavos: string;
  readonly venceEn: string;
  /** Cuántas van con este cliente en el periodo. Nueve en dos meses es un dato. */
  readonly autorizacionesRecientes: number;
  /** `true` cuando el cliente estaba bloqueado por mora, no sólo sobre el límite. */
  readonly estabaBloqueado: boolean;
}

export interface AutorizacionRegistrada {
  readonly autorizacionId: string;
  readonly clienteId: string | null;
  readonly importeCentavos: string;
  readonly motivo: string;
  readonly autorizaEmpleoId: string;
  readonly otorgadaEn: string;
}

export interface ResultadoAutorizaciones {
  readonly autorizaciones: readonly AutorizacionRegistrada[];
  readonly totalCentavos: string;
  /** Los clientes con más de una. Es la lista que hay que mirar. */
  readonly reincidentes: number;
}

const MS_POR_HORA = 3_600_000;
const MS_POR_DIA = 86_400_000;

/** Dos meses. Es el plazo en que una excepción repetida deja de ser excepción. */
const VENTANA_DE_REINCIDENCIA_DIAS = 60;

export const autorizarVentaACredito = definirComando<
  Transaccion,
  typeof entradaAutorizarCredito,
  ResultadoAutorizacion
>({
  nombre: 'credito.autorizar',
  entidad: 'autorizacion_credito',
  escribe: true,
  roles: [...LLAVE],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAutorizarCredito,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    const cliente = await ctx.paso('leer_cliente', () =>
      ctx.tx
        .selectFrom('clientes')
        .select(['id', 'nombre', 'bloqueado_por_mora'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        .executeTakeFirst(),
    );
    if (cliente === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
    }

    // Un motivo que es una sola palabra repetida —«ok ok ok»— pasa el mínimo de
    // longitud y no dice nada. Se exige que tenga al menos dos palabras
    // distintas: es barato de comprobar y es la diferencia entre un registro que
    // se lee en seis meses y uno que no.
    const palabras = new Set(
      entrada.motivo
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length > 1),
    );
    if (palabras.size < 2) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Ese motivo no explica nada: escribe por qué se deja salir el material.',
      );
    }

    const desde = new Date(ctx.ahora.getTime() - VENTANA_DE_REINCIDENCIA_DIAS * MS_POR_DIA);
    const recientes = await ctx.paso('leer_recientes', () =>
      ctx.tx
        .selectFrom('autorizaciones_descuento')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('cliente_id', '=', entrada.clienteId)
        .where('created_at', '>=', desde)
        .execute(),
    );

    const vence = new Date(ctx.ahora.getTime() + entrada.vigenciaHoras * MS_POR_HORA);

    // Se guarda en `autorizaciones_descuento` y NO en una tabla nueva. Es la
    // misma pregunta —«quién pasó por encima de un tope, por cuánto y por qué»—
    // y el reporte de excepciones tiene que poder leer las dos juntas: con dos
    // tablas, la mitad de las excepciones no sale en el reporte de excepciones.
    const autorizacion = await ctx.paso('autorizar', () =>
      ctx.tx
        .insertInto('autorizaciones_descuento')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          orden_id: entrada.ordenId,
          solicita_empleo_id: empleoId,
          autoriza_empleo_id: empleoId,
          autoriza_rol: ctx.ambito.rol,
          // No es un descuento: es material que sale sobre el límite. Se guarda
          // en la misma columna porque la pregunta del reporte es «cuánto se
          // dejó pasar», y separarlo en dos daría dos respuestas parciales.
          descuento_centavos: BigInt(entrada.importeCentavos),
          tope_centavos: 0n,
          motivo: entrada.motivo,
          cliente_id: entrada.clienteId,
          vence_en: vence,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: autorizacion.id,
      payload: {
        clienteId: entrada.clienteId,
        importeCentavos: entrada.importeCentavos,
        recientes: recientes.length + 1,
      },
    });
    return {
      autorizacionId: autorizacion.id,
      clienteId: entrada.clienteId,
      importeCentavos: entrada.importeCentavos.toString(),
      venceEn: vence.toISOString(),
      // Se cuenta ESTA incluida: «van nueve» se entiende y «van ocho más ésta»
      // no se entiende leído de prisa.
      autorizacionesRecientes: recientes.length + 1,
      estabaBloqueado: cliente.bloqueado_por_mora,
    };
  },
});

export const autorizacionesDeCredito = definirComando<
  Transaccion,
  typeof entradaAutorizacionesDe,
  ResultadoAutorizaciones
>({
  nombre: 'credito.autorizaciones',
  entidad: 'autorizacion_credito',
  escribe: false,
  roles: [...CONSULTA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAutorizacionesDe,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const desde = new Date(ctx.ahora.getTime() - entrada.dias * MS_POR_DIA);

    let consulta = ctx.tx
      .selectFrom('autorizaciones_descuento')
      .select([
        'id',
        'cliente_id',
        'descuento_centavos',
        'motivo',
        'autoriza_empleo_id',
        'created_at',
      ])
      .where('organizacion_id', '=', organizacionId)
      // Sólo las de crédito. Las de descuento viven en la misma tabla y son
      // otra pregunta: mezclarlas daría un «lleva nueve excepciones» que suma
      // nueve descuentos autorizados en caja.
      .where('cliente_id', 'is not', null)
      .where('created_at', '>=', desde)
      .orderBy('created_at', 'desc');
    if (entrada.clienteId !== null) {
      consulta = consulta.where('cliente_id', '=', entrada.clienteId);
    }

    const filas = await ctx.paso('leer_autorizaciones', () => consulta.execute());

    let total = 0n;
    const porCliente = new Map<string, number>();
    const autorizaciones = filas.map((f) => {
      total += f.descuento_centavos;
      const clienteId = f.cliente_id ?? null;
      if (clienteId !== null) porCliente.set(clienteId, (porCliente.get(clienteId) ?? 0) + 1);
      return {
        autorizacionId: f.id,
        clienteId,
        importeCentavos: f.descuento_centavos.toString(),
        motivo: f.motivo,
        autorizaEmpleoId: f.autoriza_empleo_id,
        otorgadaEn: f.created_at.toISOString(),
      };
    });

    return {
      autorizaciones,
      totalCentavos: total.toString(),
      // Uno que pide excepción todos los meses no es una excepción: es el
      // límite mal puesto, y eso se arregla subiendo el límite o cortando.
      reincidentes: [...porCliente.values()].filter((n) => n > 1).length,
    };
  },
});
