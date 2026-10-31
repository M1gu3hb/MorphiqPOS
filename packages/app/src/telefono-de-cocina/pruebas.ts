import { obtenerDb } from '@morphiqpos/data';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { abrirMesa } from '../restaurante/mesas.ts';
import { enviarPedido } from '../restaurante/pedido.ts';

/** La pimienta de las pruebas del teléfono: el token se firma y se lee con ésta. */
export const PIMIENTA = 'pimienta-de-la-prueba-del-telefono-de-cocina-01';

export interface CocinaDePrueba {
  readonly negocio: NegocioReal;
  readonly sucursalId: string;
  /** La general: el taco va aquí. */
  readonly estacionCocina: string;
  /** La del agua, por su categoría. */
  readonly estacionBebidas: string;
  /** Abre la mesa si hace falta y manda el pedido: deja una comanda por estación. */
  readonly pedir: (
    mesa: number,
    lineas: readonly { readonly producto: 'taco' | 'agua'; readonly cantidad: string }[],
  ) => Promise<string>;
}

/**
 * Un restaurante con dos estaciones —Cocina (la general) y Bebidas—, un taco y un agua, y cuatro
 * mesas. Base desechable de pruebas: se siembra con SQL directo, como las demás integraciones.
 */
export async function cocinaDePrueba(nombre: string): Promise<CocinaDePrueba> {
  const negocio = await sembrarNegocio({
    nombre,
    rol: 'mesero',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const { sucursalId } = await sembrarSucursal(negocio, { terminales: [] });
  const db = obtenerDb();
  const organizacion_id = negocio.organizacionId;
  const estacion = async (nombreEstacion: string, esGeneral: boolean) =>
    (
      await db
        .insertInto('estaciones_preparacion')
        .values({ organizacion_id, nombre: nombreEstacion, es_general: esGeneral })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const estacionCocina = await estacion('Cocina', true);
  const estacionBebidas = await estacion('Bebidas', false);
  const { id: categoriaBebidas } = await db
    .insertInto('categorias')
    .values({ organizacion_id, nombre: 'Aguas frescas', estacion_preparacion_id: estacionBebidas })
    .returning('id')
    .executeTakeFirstOrThrow();
  const producto = async (nombreProducto: string, area: string, categoria: string | null) =>
    (
      await db
        .insertInto('productos')
        .values({
          organizacion_id,
          nombre: nombreProducto,
          precio_venta_centavos: 3_500n,
          costo_unitario_centavos: 1_200n,
          estrategia_consumo: 'ninguno',
          area_preparacion: area,
          categoria_id: categoria,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const productos = {
    taco: await producto('Taco de barbacoa', 'cocina', null),
    agua: await producto('Agua de horchata', 'barra', categoriaBebidas),
  };
  const mesas = new Map(
    (
      await db
        .insertInto('mesas')
        .values(
          [1, 2, 3, 4].map((numero) => ({ organizacion_id, sucursal_id: sucursalId, numero })),
        )
        .returning(['id', 'numero'])
        .execute()
    ).map((m) => [m.numero, m.id]),
  );
  const ambito = ambitoDe(negocio, sucursalId, null);
  const abiertas = new Map<number, string>();

  return {
    negocio,
    sucursalId,
    estacionCocina,
    estacionBebidas,
    async pedir(mesa, lineas) {
      let ordenId = abiertas.get(mesa);
      if (ordenId === undefined) {
        ordenId = exigirOk(
          await comando(abrirMesa, {
            entrada: { mesaId: mesas.get(mesa) ?? '', personas: 2 },
            ambito,
            idempotencyKey: clave(),
          }),
          'restaurante.abrir_mesa',
        ).ordenId;
        abiertas.set(mesa, ordenId);
      }
      exigirOk(
        await comando(enviarPedido, {
          entrada: {
            ordenId,
            lineas: lineas.map((l) => ({
              productoId: productos[l.producto],
              cantidad: l.cantidad,
            })),
          },
          ambito,
          idempotencyKey: clave(),
        }),
        'restaurante.enviar_pedido',
      );
      return ordenId;
    },
  };
}
