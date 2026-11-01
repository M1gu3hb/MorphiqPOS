import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { mesaOperable, ordenDeMesa } from './datos.ts';
import { entradaAbrirMesa, entradaLiberarMesa } from './esquemas.ts';
import {
  atarMesaAOrden,
  cancelarOrdenVacia,
  crearOrdenDeMesa,
  limpiarMesa,
  llevarElGrupoConLaPrincipal,
  partesSinSaldar,
  tieneLineas,
  ORDEN_YA_CERRADA,
} from './mesas-escrituras.ts';
import { separarMesas, unionAbiertaDeMesa } from './sala-escrituras.ts';
import { encabezaLaUnion, exigirQueNoEsteAbsorbida } from './union-del-salon.ts';

/**
 * Abrir y liberar mesa (E6-2 y su recíproco).
 *
 * ── Lo que esto vuelve innecesario ─────────────────────────────────────────
 * `detectarHuerfano` y sus CUATRO reglas heurísticas (`F1-01` §4) existen
 * porque hoy la venta y la mesa se escriben en dos llamadas sueltas desde el
 * navegador (`Mesero.jsx:290` y `:315`), y la segunda lleva un `.catch(() => {})`
 * encima: si falla, queda una venta viva y una mesa que dice estar libre, y
 * alguien tiene que adivinar después cuál de las dos miente.
 *
 * Aquí las dos escrituras son la MISMA transacción y el estado imposible deja
 * de poder existir. Encima, el `check mesa_libre_sin_orden` y el índice
 * `ordenes_una_activa_por_mesa` lo impiden desde la base. La heurística se
 * quita cuando la prueba de concurrencia lo demuestre (F1-01 §4: «se quitan
 * cuando la causa que las originó ya no puede ocurrir, y sólo entonces»).
 */

const ROLES_DE_SALA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

export interface ResultadoAbrirMesa {
  readonly ordenId: string;
  readonly mesaId: string;
  readonly mesaNumero: number;
  readonly estadoMesa: string;
}

export const abrirMesa = definirComando<Transaccion, typeof entradaAbrirMesa, ResultadoAbrirMesa>({
  nombre: 'restaurante.abrir_mesa',
  entidad: 'mesa',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_RESTAURANTE,
  sucursal: { mesaId: 'mesas' },
  modulo: 'mesas',
  entrada: entradaAbrirMesa,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;

    const mesa = await ctx.paso('cargar_mesa', () =>
      mesaOperable(ctx.tx, organizacionId, entrada.mesaId),
    );

    await ctx.paso('mirar_si_esta_unida', () =>
      exigirQueNoEsteAbsorbida(ctx.tx, organizacionId, mesa.id),
    );

    // Tabla de transiciones (F1-04 §8.2): sólo `libre` abre. Cualquier otro
    // estado ya tiene comensales sentados.
    if (mesa.estado !== 'libre' || mesa.ordenActivaId !== null) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        `La mesa ${mesa.numero} ya está abierta. Ábrela desde su cuenta o libérala antes.`,
        { estado: mesa.estado },
      );
    }

    const ordenId = await ctx.paso('crear_orden', () =>
      crearOrdenDeMesa(ctx.tx, {
        organizacionId,
        sucursalId: mesa.sucursalId,
        // Dato de auditoría, no una puerta (F1-02 §8, trampa T6). Puede ir
        // porque `ordenes_carrito_por_terminal` sólo acota mostrador (§35.9):
        // sin ese estrechamiento la segunda mesa de la noche reventaría aquí.
        terminalId,
        empleoId,
        mesaId: mesa.id,
        entrada,
      }),
    );

    await ctx.paso('atar_mesa', () =>
      atarMesaAOrden(ctx.tx, {
        organizacionId,
        sucursalId: mesa.sucursalId,
        mesaId: mesa.id,
        ordenId,
        empleoId,
        estadoAnterior: mesa.estado,
        ahora: ctx.ahora,
        // Quien abre la mesa la atiende, salvo que ya hubiera alguien asignado.
        // El modo «con asignación» de `Mesero.jsx:311-315` no se pisa.
        tomarLaAtencion: mesa.empleadoAtiendeId === null,
        entrada,
      }),
    );

    ctx.auditar({
      entidadId: mesa.id,
      payload: { ordenId, mesaNumero: mesa.numero, personas: entrada.personas },
    });

    return {
      ordenId,
      mesaId: mesa.id,
      mesaNumero: mesa.numero,
      estadoMesa: 'esperando_orden',
    };
  },
});

export interface ResultadoLiberarMesa {
  readonly mesaId: string;
  /** La orden que se canceló por estar vacía, si la había (F1-04 §8.2). */
  readonly ordenCancelada: string | null;
}

export const liberarMesa = definirComando<
  Transaccion,
  typeof entradaLiberarMesa,
  ResultadoLiberarMesa
>({
  nombre: 'restaurante.liberar_mesa',
  entidad: 'mesa',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_RESTAURANTE,
  sucursal: { mesaId: 'mesas' },
  modulo: 'mesas',
  entrada: entradaLiberarMesa,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const mesa = await ctx.paso('cargar_mesa', () =>
      mesaOperable(ctx.tx, organizacionId, entrada.mesaId),
    );
    const ordenActivaId = mesa.ordenActivaId;

    // Ya está libre: dos toques al botón «mesa limpia» describen el mismo
    // hecho y el segundo no es un error.
    if (mesa.estado === 'libre' && ordenActivaId === null) {
      ctx.auditar({ entidadId: mesa.id, payload: { yaEstabaLibre: true } });
      return { mesaId: mesa.id, ordenCancelada: null };
    }

    // F-302 · Una mesa de un grupo VIVO no se libera sola: su consumo está en
    // la cuenta de la principal y soltarla aquí dejaría al grupo apuntando a
    // una mesa que ya volvió al servicio. Separar es una decisión consciente.
    await ctx.paso('mirar_si_esta_unida', () =>
      exigirQueNoEsteAbsorbida(ctx.tx, organizacionId, mesa.id, 'libera'),
    );
    const grupo = await ctx.paso('mirar_grupo', () =>
      unionAbiertaDeMesa(ctx.tx, organizacionId, mesa.id),
    );
    // Una miembro sin su marca (una unión de antes de la 187) tampoco decide por el grupo.
    if (grupo !== null) {
      const encabeza = await ctx.paso('mirar_si_encabeza', () =>
        encabezaLaUnion(ctx.tx, organizacionId, grupo, mesa.id),
      );
      if (!encabeza) {
        throw new ErrorDominio(
          'MESA_NO_LIBERABLE',
          `La mesa ${String(mesa.numero)} está unida a otras: se libera desde la principal.`,
          { unionId: grupo },
        );
      }
    }
    let ordenCancelada: string | null = null;

    if (ordenActivaId !== null) {
      const orden = await ctx.paso('cargar_orden', () =>
        ordenDeMesa(ctx.tx, organizacionId, ordenActivaId),
      );

      if (orden.estado === 'dividida') {
        // La cuenta se repartió en partes y las líneas viven en ellas: la madre ya no tiene
        // consumo propio, y tratarla como «apertura sin consumo» la CANCELABA —una venta de
        // la que las partes cobraron cada peso aparecía como cancelada, «mesa liberada sin
        // consumo», en el corte—. Lo que decide si la mesa se libera es si ya se cobraron
        // TODAS las partes.
        const sinCobrar = await ctx.paso('mirar_partes', () =>
          partesSinSaldar(ctx.tx, organizacionId, ordenActivaId),
        );
        if (sinCobrar > 0) {
          throw new ErrorDominio(
            'MESA_NO_LIBERABLE',
            `La mesa ${mesa.numero} tiene ${sinCobrar === 1 ? 'una cuenta' : `${String(sinCobrar)} cuentas`} ` +
              'sin cobrar. Cóbralas o cancélalas en Caja antes de liberarla.',
            { ordenId: ordenActivaId, estado: orden.estado, partesSinCobrar: sinCobrar },
          );
        }
      } else if (!(ORDEN_YA_CERRADA as readonly string[]).includes(orden.estado)) {
        // Va envuelta en `ctx.paso` porque es la LECTURA QUE DECIDE: de ella
        // sale MESA_NO_LIBERABLE o la cancelación de la orden vacía. Sin nombre
        // de paso, el arnés de inyección de fallos no la puede interrumpir, y
        // como los pasos se identifican por nombre y no por índice el hueco no
        // se nota (`definicion.ts:45-52`).
        const consumida = await ctx.paso('mirar_consumo', () =>
          tieneLineas(ctx.tx, organizacionId, ordenActivaId),
        );

        // La regla que no se negocia: liberar con la venta sin cobrar FALLA.
        // Limpiar la mesa aquí sería borrar de la vista una cuenta que el
        // negocio todavía tiene que cobrar.
        if (consumida) {
          throw new ErrorDominio(
            'MESA_NO_LIBERABLE',
            `La mesa ${mesa.numero} tiene una cuenta sin cobrar. Cóbrala o cancélala en Caja ` +
              'antes de liberarla.',
            { ordenId: ordenActivaId, estado: orden.estado },
          );
        }

        // Apertura sin consumo: es la transición «ticket en cero → libre» de
        // F1-04 §8.2 (`Caja.jsx:382`). Se cancela la orden en esta misma
        // transacción para no dejar una venta fantasma apuntando a la mesa.
        await ctx.paso('cancelar_orden_vacia', () =>
          cancelarOrdenVacia(ctx.tx, organizacionId, ordenActivaId, empleoId, ctx.ahora),
        );
        ordenCancelada = ordenActivaId;
      }
    }

    // DP-9.6 · Al limpiar la principal se decide: separar (cada mesa vuelve a donde estaba) o
    // dejarlas unidas para el siguiente cliente. Sin decidir no se libera. Va DESPUÉS de mirar la
    // cuenta: con algo sin cobrar, eso es lo que hay que decir, no preguntar por el grupo.
    if (grupo !== null && entrada.grupo === undefined) {
      throw new ErrorDominio(
        'MESA_UNIDA_SIN_DECISION',
        `La mesa ${String(mesa.numero)} está unida a otras: ¿separarlas o dejarlas unidas?`,
        { unionId: grupo },
      );
    }

    await ctx.paso('limpiar_mesa', () =>
      limpiarMesa(ctx.tx, organizacionId, mesa.id, {
        sucursalId: mesa.sucursalId,
        estadoAnterior: mesa.estado,
        empleoId,
        ahora: ctx.ahora,
      }),
    );

    if (grupo !== null && entrada.grupo === 'separar') {
      await ctx.paso('separar_el_grupo', () =>
        separarMesas(ctx.tx, {
          organizacionId,
          unionId: grupo,
          empleadoId: empleoId,
          ahora: ctx.ahora,
        }),
      );
    } else if (grupo !== null) {
      // Unidas: las demás quedan libres con la principal, y el grupo espera al siguiente cliente.
      await ctx.paso('el_grupo_queda_libre', () =>
        llevarElGrupoConLaPrincipal(ctx.tx, organizacionId, mesa.id, {
          estado: 'libre',
          ordenId: ordenActivaId,
          empleoId,
          ahora: ctx.ahora,
        }),
      );
    }

    ctx.auditar({
      entidadId: mesa.id,
      payload: {
        mesaNumero: mesa.numero,
        ordenCancelada,
        estadoPrevio: mesa.estado,
        ...(grupo === null ? {} : { unionId: grupo, grupo: entrada.grupo }),
      },
    });

    return { mesaId: mesa.id, ordenCancelada };
  },
});
