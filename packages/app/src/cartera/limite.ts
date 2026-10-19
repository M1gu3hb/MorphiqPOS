import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `credito.fijar_limite` — cuánto crédito se le da a un cliente (C.10 de la 2.4).
 *
 * ── El hueco ─────────────────────────────────────────────────────────────
 * `clientes.limite_credito_centavos` existe desde la 003, la cartera lo enseña, el
 * mostrador compara contra él y el muro lo evalúa en cada remisión… y NINGÚN comando
 * lo escribía. Todo cliente nacía con límite cero, «sin definir», y cada remisión
 * salía como «pasa del límite»: un aviso que siempre dice lo mismo deja de leerse, y
 * el día que de verdad importa ya nadie lo mira.
 *
 * ── Lo fija quien responde por el dinero, con motivo ─────────────────────
 * Como la llave (`credito.autorizar`) y el muro (`credito.fijar_muro`): dueño o
 * administrador, y con un motivo escrito que queda en la bitácora junto con el
 * límite anterior. «Le subí a $80,000 porque paga cada quincena» es lo que explica
 * dentro de seis meses por qué ese cliente debe lo que debe.
 */

const QUIEN_FIJA = ['administrador', 'dueno'] as const;

export const entradaFijarLimite = z.object({
  clienteId: z.uuid(),
  /** Cero es «sin crédito»: se vale, y es distinto de no haberlo decidido. */
  limiteCentavos: z.number().int().min(0).max(1_000_000_000),
  motivo: z.string().trim().min(4).max(200),
});

export interface ResultadoLimite {
  readonly clienteId: string;
  readonly anteriorCentavos: string;
  readonly limiteCentavos: string;
}

export const fijarLimiteDeCredito = definirComando<
  Transaccion,
  typeof entradaFijarLimite,
  ResultadoLimite
>({
  nombre: 'credito.fijar_limite',
  entidad: 'cliente',
  escribe: true,
  roles: [...QUIEN_FIJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaFijarLimite,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const cliente = await ctx.paso('leer_cliente', () =>
      ctx.tx
        .selectFrom('clientes')
        .select(['id', 'nombre', 'limite_credito_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        // Bloqueado: dos cambios a la vez dejaban en la bitácora un «antes» que ya no era
        // el de antes (auditoría de la 2.4). Y se forma en fila con los fiados del cliente.
        .forUpdate()
        .executeTakeFirst(),
    );
    // Un cliente de otro negocio responde igual que uno que no existe.
    if (cliente === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
    }

    await ctx.paso('fijar_limite', () =>
      ctx.tx
        .updateTable('clientes')
        .set({ limite_credito_centavos: BigInt(entrada.limiteCentavos), updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        .execute(),
    );

    const anterior = cliente.limite_credito_centavos.toString();
    ctx.auditar({
      entidadId: cliente.id,
      payload: {
        nombre: cliente.nombre,
        // Los dos, porque «le subí el límite» sin el de antes no se puede revisar.
        anteriorCentavos: anterior,
        limiteCentavos: String(entrada.limiteCentavos),
        motivo: entrada.motivo,
      },
    });

    return {
      clienteId: cliente.id,
      anteriorCentavos: anterior,
      limiteCentavos: String(entrada.limiteCentavos),
    };
  },
});
