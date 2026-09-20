import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-639 y F-638 · La obra y quién puede retirar a su nombre.
 *
 * ── Ninguna de las dos se borra ──────────────────────────────────────────
 * La obra se CIERRA: las remisiones que cuelgan de ella tienen que poder
 * consultarse años después, y el contratista las va a pedir para su propia
 * contabilidad. El autorizado se DA DE BAJA: las remisiones que firmó siguen
 * siendo válidas y auditables, y borrarlo rompería la trazabilidad justo del
 * caso que importa — la cuenta impugnada.
 *
 * ── Quién puede autorizar a quién ────────────────────────────────────────
 * El alta de un autorizado no la hace el cajero. Es la lista que decide de quién
 * es la deuda cuando el material ya salió, y una lista que cualquiera puede
 * ampliar es la misma lista que no tener ninguna.
 */

const ROLES_OBRA = ['gerente', 'administrador', 'dueno'] as const;

export const entradaCrearObra = z.object({
  clienteId: z.uuid(),
  nombre: z.string().trim().min(2).max(80),
  direccion: z.string().trim().max(200).optional(),
  /** Sub-límite DENTRO del límite del cliente. Nulo = sólo aplica el del cliente. */
  limiteCentavos: z.number().int().min(0).max(100_000_000).optional(),
});

export const entradaCerrarObra = z.object({
  obraId: z.uuid(),
});

export const entradaAltaAutorizado = z.object({
  clienteId: z.uuid(),
  /** Sin obra = puede retirar para todas las del cliente. */
  obraId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().trim().max(30).optional(),
  /** Lo que enseñó al darse de alta. Es lo que se mira cuando se impugna. */
  identificacion: z.string().trim().max(120).optional(),
  topePorSalidaCentavos: z.number().int().min(1).max(100_000_000).optional(),
});

export const entradaBajaAutorizado = z.object({
  autorizadoId: z.uuid(),
});

export interface ResultadoObra {
  readonly obraId: string;
  readonly nombre: string;
  readonly estado: 'activa' | 'cerrada';
}

export interface ResultadoAutorizado {
  readonly autorizadoId: string;
  readonly nombre: string;
  readonly activo: boolean;
}

export const crearObra = definirComando<Transaccion, typeof entradaCrearObra, ResultadoObra>({
  nombre: 'credito.crear_obra',
  entidad: 'obra',
  escribe: true,
  roles: ['cajero', ...ROLES_OBRA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCrearObra,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const cliente = await ctx.paso('cargar_cliente', () =>
      ctx.tx
        .selectFrom('clientes')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        .executeTakeFirst(),
    );
    if (cliente === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
    }

    const fila = await ctx.paso('crear_obra', () =>
      ctx.tx
        .insertInto('obras')
        .values({
          organizacion_id: organizacionId,
          cliente_id: entrada.clienteId,
          nombre: entrada.nombre,
          direccion: entrada.direccion ?? null,
          estado: 'activa',
          limite_centavos:
            entrada.limiteCentavos === undefined ? null : BigInt(entrada.limiteCentavos),
          abierta_en: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: { clienteId: entrada.clienteId, nombre: entrada.nombre },
    });

    return { obraId: fila.id, nombre: entrada.nombre, estado: 'activa' };
  },
});

export const cerrarObra = definirComando<Transaccion, typeof entradaCerrarObra, ResultadoObra>({
  nombre: 'credito.cerrar_obra',
  entidad: 'obra',
  escribe: true,
  // Cerrar una obra apaga una cuenta: no lo hace quien despacha.
  roles: [...ROLES_OBRA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCerrarObra,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const obra = await ctx.paso('cargar_obra', () =>
      ctx.tx
        .selectFrom('obras')
        .select(['id', 'nombre', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.obraId)
        .executeTakeFirst(),
    );
    if (obra === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa obra no existe en este negocio.');
    }

    const debe = await ctx.paso('sumar_saldo', () =>
      ctx.tx
        .selectFrom('remisiones')
        .select((eb) => eb.fn.sum('saldo_documento_centavos').as('saldo'))
        .where('organizacion_id', '=', organizacionId)
        .where('obra_id', '=', entrada.obraId)
        .executeTakeFirst(),
    );
    const saldo = BigInt(String(debe?.saldo ?? '0').split('.')[0] ?? '0');
    if (saldo > 0n) {
      // Cerrar una obra con saldo la sacaría de la lista de cobranza con dinero
      // dentro, que es la forma más limpia de perder $18,400 sin que nadie lo
      // note hasta el cierre del año.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa obra todavía debe: se cierra cuando queda en ceros.',
        { saldoCentavos: saldo.toString() },
      );
    }

    // `estado` y `cerrada_en` en el MISMO objeto: la 112 exige que vayan juntas
    // (`obra_cerrada_con_fecha`) y separarlas dejaría una obra cerrada sin fecha
    // que ninguna consulta de histórico podría situar.
    const tocadas = await ctx.paso('cerrar', () =>
      ctx.tx
        .updateTable('obras')
        .set({ estado: 'cerrada', cerrada_en: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.obraId)
        .where('estado', '=', 'activa')
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      // Éste es el ÚNICO cerrojo contra cerrar dos veces. Había arriba una
      // comprobación temprana sobre `obra.estado` y se quitó: no ponía roja
      // ninguna prueba porque este `where estado = 'activa'` ya la hacía, y un
      // segundo cerrojo que nadie puede ver fallar es código que hay que leer
      // y que no protege de nada nuevo.
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Esa obra ya estaba cerrada.');
    }

    ctx.auditar({ entidadId: entrada.obraId, payload: { nombre: obra.nombre } });

    return { obraId: entrada.obraId, nombre: obra.nombre, estado: 'cerrada' };
  },
});

export const altaAutorizado = definirComando<
  Transaccion,
  typeof entradaAltaAutorizado,
  ResultadoAutorizado
>({
  nombre: 'credito.alta_autorizado',
  entidad: 'autorizado_cuenta',
  escribe: true,
  // NO el cajero: es la lista que decide de quién es la deuda cuando el
  // material ya salió, y una lista que cualquiera amplía es no tener lista.
  roles: [...ROLES_OBRA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAltaAutorizado,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const cliente = await ctx.paso('cargar_cliente', () =>
      ctx.tx
        .selectFrom('clientes')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        .executeTakeFirst(),
    );
    if (cliente === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
    }

    const obraId = entrada.obraId;
    if (obraId !== undefined) {
      const obra = await ctx.paso('cargar_obra', () =>
        ctx.tx
          .selectFrom('obras')
          .select(['id'])
          .where('organizacion_id', '=', organizacionId)
          .where('cliente_id', '=', entrada.clienteId)
          .where('id', '=', obraId)
          .executeTakeFirst(),
      );
      if (obra === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa obra no es de ese cliente.', {
          obraId,
        });
      }
    }

    const fila = await ctx.paso('alta', () =>
      ctx.tx
        .insertInto('autorizados_cuenta')
        .values({
          organizacion_id: organizacionId,
          cliente_id: entrada.clienteId,
          obra_id: entrada.obraId ?? null,
          nombre: entrada.nombre,
          telefono: entrada.telefono ?? null,
          identificacion: entrada.identificacion ?? null,
          tope_por_salida_centavos:
            entrada.topePorSalidaCentavos === undefined
              ? null
              : BigInt(entrada.topePorSalidaCentavos),
          activo: true,
          // Quién lo autorizó. Sin esto, la lista es una lista sin responsable
          // y la impugnación se gana sola.
          alta_por: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: {
        clienteId: entrada.clienteId,
        obraId: entrada.obraId ?? null,
        nombre: entrada.nombre,
        identificacion: entrada.identificacion ?? null,
      },
    });

    return { autorizadoId: fila.id, nombre: entrada.nombre, activo: true };
  },
});

export const bajaAutorizado = definirComando<
  Transaccion,
  typeof entradaBajaAutorizado,
  ResultadoAutorizado
>({
  nombre: 'credito.baja_autorizado',
  entidad: 'autorizado_cuenta',
  escribe: true,
  roles: [...ROLES_OBRA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaBajaAutorizado,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const autorizado = await ctx.paso('cargar_autorizado', () =>
      ctx.tx
        .selectFrom('autorizados_cuenta')
        .select(['id', 'nombre', 'activo'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.autorizadoId)
        .executeTakeFirst(),
    );
    if (autorizado === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese autorizado no existe en este negocio.');
    }
    if (!autorizado.activo) {
      throw new ErrorDominio('CONFIGURACION_CONFLICTO', 'Ese autorizado ya estaba dado de baja.');
    }

    // Se da de baja, NUNCA se borra: las remisiones que firmó siguen siendo
    // válidas y auditables. `activo` y `dado_de_baja_en` van en el mismo objeto
    // porque la 112 lo exige (`autorizado_baja_coherente`).
    await ctx.paso('baja', () =>
      ctx.tx
        .updateTable('autorizados_cuenta')
        .set({ activo: false, dado_de_baja_en: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.autorizadoId)
        .execute(),
    );

    ctx.auditar({ entidadId: entrada.autorizadoId, payload: { nombre: autorizado.nombre } });

    return { autorizadoId: entrada.autorizadoId, nombre: autorizado.nombre, activo: false };
  },
});
