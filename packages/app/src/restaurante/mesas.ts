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
  tieneLineas,
  ORDEN_YA_CERRADA,
} from './mesas-escrituras.ts';

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
  entrada: entradaAbrirMesa,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;

    const mesa = await ctx.paso('cargar_mesa', () =>
      mesaOperable(ctx.tx, organizacionId, entrada.mesaId),
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
        mesaId: mesa.id,
        ordenId,
        empleoId,
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

    let ordenCancelada: string | null = null;

    if (ordenActivaId !== null) {
      const orden = await ctx.paso('cargar_orden', () =>
        ordenDeMesa(ctx.tx, organizacionId, ordenActivaId),
      );

      if (!(ORDEN_YA_CERRADA as readonly string[]).includes(orden.estado)) {
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

    await ctx.paso('limpiar_mesa', () => limpiarMesa(ctx.tx, organizacionId, mesa.id));

    ctx.auditar({
      entidadId: mesa.id,
      payload: { mesaNumero: mesa.numero, ordenCancelada, estadoPrevio: mesa.estado },
    });

    return { mesaId: mesa.id, ordenCancelada };
  },
});
