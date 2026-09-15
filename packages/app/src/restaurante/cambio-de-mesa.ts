import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cambiarDeMesa, mesaEnSala } from './sala-escrituras.ts';

/**
 * `restaurante.cambiar_mesa` — F-303.
 *
 * ── Una frase de todos los días ────────────────────────────────────────────
 * «Nos pasamos a la terraza.» Hoy implica cerrar la cuenta y reabrirla en la
 * otra mesa, y la comanda ya enviada sigue apuntando a la mesa vieja: cocina
 * saca el plato a un lugar vacío mientras la gente espera a cuatro metros.
 *
 * ── Lo que se mueve, que es más que `mesa_id` ──────────────────────────────
 * La cuenta, las comandas vivas, las personas, las alergias, la celebración, el
 * mesero que atiende y —lo que más importa para F-305— el reloj de ocupación.
 * Si el destino arrancara su reloj de cero, la rotación media del negocio
 * saldría el doble de buena de lo que es.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No cobra, no toca inventario y no cambia el estado de la cuenta. Mover una
 * mesa no es un hecho económico: es el mismo consumo en otro sitio.
 */

export const entradaCambiarMesa = z.object({
  ordenId: z.uuid(),
  mesaDestinoId: z.uuid(),
});

export interface ResultadoCambioDeMesa {
  readonly ordenId: string;
  readonly mesaOrigenId: string;
  readonly mesaDestinoId: string;
  readonly comandasReapuntadas: number;
}

/**
 * Cambiar de mesa SÍ lo hace el mesero.
 *
 * A diferencia de dividir o anular, mover una cuenta no hace desaparecer
 * dinero: el consumo es el mismo y sigue vivo. Es una decisión de sala, y
 * obligar a que baje el cajero cada vez que una pareja se cambia a la terraza
 * garantizaría que nadie lo registre y que la cuenta acabe otra vez donde no es.
 */
const ROLES = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Estados de cuenta que todavía están sobre una mesa. */
const CUENTAS_VIVAS = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

export const cambiarMesaComando = definirComando<
  Transaccion,
  typeof entradaCambiarMesa,
  ResultadoCambioDeMesa
>({
  nombre: 'restaurante.cambiar_mesa',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  modulo: 'mesas',
  entrada: entradaCambiarMesa,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'mesa_id', 'union_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );

    const mesaOrigenId = orden?.mesa_id ?? null;
    if (orden === undefined || mesaOrigenId === null) {
      throw new ErrorDominio(
        'ORDEN_NO_ENCONTRADA',
        'Esa cuenta no existe, o no es una cuenta de mesa.',
      );
    }
    if (!(CUENTAS_VIVAS as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya no está sobre la mesa: se cobró, se canceló o se dividió.',
        { estado: orden.estado },
      );
    }
    if (orden.union_id !== null) {
      // Mover una mesa de un grupo unido dejaría al grupo apuntando a una mesa
      // que ya no está ahí. Primero se separa, que es una decisión consciente.
      throw new ErrorDominio(
        'MESA_NO_LIBERABLE',
        'Esa cuenta es de un grupo de mesas unidas. Sepáralas antes de moverla.',
      );
    }
    if (mesaOrigenId === entrada.mesaDestinoId) {
      throw new ErrorDominio('MESA_YA_ABIERTA', 'La cuenta ya está en esa mesa.');
    }

    const [origen, destino] = await ctx.paso('cargar_mesas', () =>
      Promise.all([
        mesaEnSala(ctx.tx, organizacionId, mesaOrigenId),
        mesaEnSala(ctx.tx, organizacionId, entrada.mesaDestinoId),
      ]),
    );

    // Dos sucursales distintas son dos salones distintos. Mover una cuenta
    // entre ellos rompería el folio, el corte y la caja de las dos.
    if (origen.sucursalId !== destino.sucursalId) {
      throw new ErrorDominio(
        'MESA_NO_ENCONTRADA',
        'Esa mesa es de otra sucursal: una cuenta no se muda de local.',
      );
    }

    const escrito = await ctx.paso('mover_cuenta', () =>
      cambiarDeMesa(ctx.tx, {
        organizacionId,
        ordenId: orden.id,
        origen,
        destino,
        empleadoId: empleoId,
        ahora: ctx.ahora,
      }),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        mesaOrigen: origen.numero,
        mesaDestino: destino.numero,
        comandasReapuntadas: escrito.comandasReapuntadas,
        personas: origen.personas,
      },
    });

    return {
      ordenId: orden.id,
      mesaOrigenId: origen.id,
      mesaDestinoId: destino.id,
      comandasReapuntadas: escrito.comandasReapuntadas,
    };
  },
});
