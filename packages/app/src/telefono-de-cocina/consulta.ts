import 'server-only';

import { conTransaccion, type Transaccion } from '@morphiqpos/data';

import { resolverAmbitoDeEstacion, type AmbitoDeEstacion } from './ambito.ts';

/** Lo que el teléfono necesita para cocinar, y nada más (R33): ni precios, ni ids de nadie. */
export interface ComandaDelTelefono {
  readonly id: string;
  readonly estado: 'nuevo' | 'en_preparacion';
  readonly mesaNumero: number | null;
  readonly nombrePedido: string | null;
  readonly creadaEn: string;
  readonly notas: string | null;
  readonly alergias: string | null;
  readonly celebracion: boolean;
  readonly tipoCelebracion: string | null;
  readonly platillos: readonly {
    readonly nombre: string;
    readonly cantidad: string;
    readonly notas: string | null;
  }[];
}

export interface PantallaDelTelefono {
  readonly estacion: { readonly nombre: string; readonly color: string | null };
  readonly vigenteHasta: string;
  /** La pendiente MÁS RECIENTE de la estación; `null` si no hay ninguna. */
  readonly comanda: ComandaDelTelefono | null;
  /** Cuántas quedan pendientes en total, ésta incluida. */
  readonly pendientes: number;
}

const PENDIENTES = ['nuevo', 'en_preparacion'] as const;

/** La pantalla del teléfono de una estación. Sólo lee: no audita, como el portal. */
export async function pantallaDelTelefono(peticion: {
  readonly token: string;
  readonly organizacionId: string;
  readonly pimienta: string;
}): Promise<PantallaDelTelefono> {
  return conTransaccion(async (tx) => {
    const ambito = await resolverAmbitoDeEstacion(tx, { ...peticion, ahora: new Date() });
    const [comanda, pendientes] = await Promise.all([
      comandaMasReciente(tx, ambito),
      cuantasPendientes(tx, ambito),
    ]);
    return {
      estacion: { nombre: ambito.estacionNombre, color: ambito.estacionColor },
      vigenteHasta: ambito.vigenteHasta.toISOString(),
      comanda,
      pendientes,
    };
  });
}

async function cuantasPendientes(tx: Transaccion, ambito: AmbitoDeEstacion): Promise<number> {
  const fila = await tx
    .selectFrom('comandas')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('estacion_preparacion_id', '=', ambito.estacionId)
    .where('estado', 'in', PENDIENTES)
    .executeTakeFirst();
  return Number(fila?.total ?? 0);
}

async function comandaMasReciente(
  tx: Transaccion,
  ambito: AmbitoDeEstacion,
): Promise<ComandaDelTelefono | null> {
  const cabecera = await tx
    .selectFrom('comandas as c')
    .leftJoin('mesas as m', 'm.id', 'c.mesa_id')
    .leftJoin('ordenes as o', 'o.id', 'c.orden_id')
    .select([
      'c.id',
      'c.estado',
      'c.created_at',
      'c.notas',
      'c.notas_alergias',
      'c.celebracion_especial',
      'c.tipo_celebracion',
      'm.numero as mesa_numero',
      'o.nombre_pedido',
    ])
    .where('c.organizacion_id', '=', ambito.organizacionId)
    .where('c.estacion_preparacion_id', '=', ambito.estacionId)
    .where('c.estado', 'in', PENDIENTES)
    .orderBy('c.created_at', 'desc')
    .orderBy('c.id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (cabecera === undefined) return null;

  const platillos = await tx
    .selectFrom('comanda_items')
    .select(['producto_nombre', 'cantidad', 'notas'])
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('comanda_id', '=', cabecera.id)
    .where('estado', '!=', 'cancelado')
    .orderBy('orden_visual')
    .execute();

  return {
    id: cabecera.id,
    estado: cabecera.estado === 'en_preparacion' ? 'en_preparacion' : 'nuevo',
    mesaNumero: cabecera.mesa_numero ?? null,
    // Sólo la primera palabra, como el monitor de recogida: basta para «Juan» y no publica
    // el nombre completo de nadie.
    nombrePedido: primeraPalabra(cabecera.nombre_pedido),
    creadaEn: cabecera.created_at.toISOString(),
    notas: cabecera.notas,
    alergias: cabecera.notas_alergias,
    celebracion: cabecera.celebracion_especial,
    tipoCelebracion: cabecera.celebracion_especial ? cabecera.tipo_celebracion : null,
    platillos: platillos.map((p) => ({
      nombre: p.producto_nombre,
      cantidad: p.cantidad,
      notas: p.notas,
    })),
  };
}

function primeraPalabra(texto: string | null): string | null {
  const palabra = texto?.trim().split(/\s+/)[0] ?? '';
  return palabra === '' ? null : palabra.slice(0, 24);
}
