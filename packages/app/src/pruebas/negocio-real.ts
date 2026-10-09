/**
 * Un negocio DE VERDAD en la base de integración, para las pruebas que cobran, devuelven,
 * abren cajas y agendan contra Postgres (bloque D.9 de la 2.4).
 *
 * ── Ids nuevos en cada corrida, y por qué no hay limpieza ─────────────────
 * `comando.integracion.test.ts` siembra con ids fijos y por eso tiene que borrar antes y
 * después. Aquí no alcanza: un cobro deja pagos, movimientos de caja, de stock, folios,
 * devoluciones —con llaves `on delete restrict` hacia la orden y la organización— y una
 * limpieza escrita a mano tendría que conocer el orden de todas esas tablas y crecer con
 * cada migración. El día que se le olvidara una, el `afterAll` fallaría y la prueba
 * saldría roja por la limpieza y no por el dinero.
 *
 * Así que cada llamada siembra un negocio NUEVO: ids aleatorios y un slug único. Dos
 * corridas no se pisan, una corrida interrumpida no deja nada que estorbe a la siguiente,
 * y lo que queda en la base es de una organización que nadie vuelve a mirar. La base de
 * integración es desechable por contrato (`exigirBaseDesechable`): en CI es el servicio
 * del trabajo y en local la que se crea para esto.
 *
 * ── Lo que se siembra con SQL y lo que NO ─────────────────────────────────
 * Con SQL sólo el andamiaje que en producción da de alta otra herramienta —la
 * organización, su gente, sus terminales, el catálogo—. Lo que se PRUEBA —abrir caja,
 * armar el carrito, cobrar, devolver, agendar— va por `comando()`, el envoltorio de
 * producción, para que corran el rol, el paquete, la idempotencia y la transacción.
 */
import { randomUUID } from 'node:crypto';

import type { Ambito, Giro, Paquete, Resultado, Rol } from '@morphiqpos/contracts';
import { conTransaccion } from '@morphiqpos/data';

import { abrirCaja } from '../caja/sesion.ts';
import { comando } from '../produccion.ts';
import { cobrarOrden, type ResultadoCobro } from '../venta/cobrar.ts';
import { agregarLinea, crearOrden } from '../venta/carrito.ts';
import { cotizar } from '../venta/cotizar.ts';

export interface NegocioReal {
  readonly organizacionId: string;
  readonly identidadId: string;
  readonly empleoId: string;
  readonly rol: Rol;
}

export interface SucursalReal {
  readonly sucursalId: string;
  readonly almacenId: string;
  /** En el orden en que se pidieron los nombres. */
  readonly terminales: readonly string[];
}

/** Una clave de idempotencia nueva: cada acción de la prueba es una petición distinta. */
export function clave(): string {
  return randomUUID();
}

/** El sufijo que hace único el slug sin salirse de `^[a-z0-9-]{2,60}$`. */
function sufijo(): string {
  return randomUUID().slice(0, 8);
}

/** La organización, una persona con su identidad y su empleo. */
export async function sembrarNegocio(opciones: {
  readonly nombre: string;
  readonly rol: Rol;
  readonly giro?: Giro;
  readonly paquete?: Paquete;
}): Promise<NegocioReal> {
  const negocio: NegocioReal = {
    organizacionId: randomUUID(),
    identidadId: randomUUID(),
    empleoId: randomUUID(),
    rol: opciones.rol,
  };
  const personaId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('organizaciones')
      .values({
        id: negocio.organizacionId,
        nombre: opciones.nombre,
        slug: `integracion-${sufijo()}`,
        giro: opciones.giro ?? 'tienda',
        paquete: opciones.paquete ?? 'tienda',
      })
      .execute();
    await tx
      .insertInto('personas')
      .values({ id: personaId, organizacion_id: negocio.organizacionId, nombre: 'Rosa' })
      .execute();
    await tx
      .insertInto('identidades')
      .values({ id: negocio.identidadId, persona_id: personaId })
      .execute();
    await tx
      .insertInto('empleos')
      .values({
        id: negocio.empleoId,
        persona_id: personaId,
        organizacion_id: negocio.organizacionId,
        rol: opciones.rol,
      })
      .execute();
  });
  return negocio;
}

/** Otra persona del mismo negocio, con su empleo: el supervisor que autoriza, por ejemplo. */
export async function sembrarCompanero(
  negocio: NegocioReal,
  opciones: { readonly nombre: string; readonly rol: Rol },
): Promise<string> {
  const personaId = randomUUID();
  const empleoId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('personas')
      .values({ id: personaId, organizacion_id: negocio.organizacionId, nombre: opciones.nombre })
      .execute();
    await tx
      .insertInto('empleos')
      .values({
        id: empleoId,
        persona_id: personaId,
        organizacion_id: negocio.organizacionId,
        rol: opciones.rol,
      })
      .execute();
  });
  return empleoId;
}

/** Una sucursal con su almacén principal y sus terminales, con su cupo de cajas. */
export async function sembrarSucursal(
  negocio: NegocioReal,
  opciones: { readonly terminales: readonly string[]; readonly cajasSimultaneas?: number },
): Promise<SucursalReal> {
  const sucursalId = randomUUID();
  const almacenId = randomUUID();
  const terminales = opciones.terminales.map(() => randomUUID());
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('sucursales')
      .values({
        id: sucursalId,
        organizacion_id: negocio.organizacionId,
        nombre: `Sucursal ${sufijo()}`,
        cajas_simultaneas: opciones.cajasSimultaneas ?? 1,
      })
      .execute();
    await tx
      .insertInto('almacenes')
      .values({
        id: almacenId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursalId,
        nombre: 'Anaquel',
        principal: true,
      })
      .execute();
    if (terminales.length > 0) {
      await tx
        .insertInto('terminales')
        .values(
          terminales.map((id, i) => ({
            id,
            organizacion_id: negocio.organizacionId,
            sucursal_id: sucursalId,
            nombre: opciones.terminales[i] ?? `Caja ${String(i + 1)}`,
          })),
        )
        .execute();
    }
  });
  return { sucursalId, almacenId, terminales };
}

/** El ámbito que armaría la sesión del servidor para esa persona en esa terminal. */
export function ambitoDe(
  negocio: NegocioReal,
  sucursalId: string | null,
  terminalId: string | null,
): Ambito {
  return {
    organizacionId: negocio.organizacionId,
    sucursalId,
    terminalId,
    identidadId: negocio.identidadId,
    empleoId: negocio.empleoId,
    rol: negocio.rol,
  };
}

/**
 * Un producto que se vende por pieza y descuenta SU insumo del almacén, con la existencia
 * dada. `permite_venta_sin_stock` en falso por omisión: es el que tiene que impedir vender
 * lo que no hay.
 */
export async function sembrarProducto(
  negocio: NegocioReal,
  almacenId: string,
  opciones: {
    readonly nombre: string;
    readonly precioCentavos: bigint;
    readonly existencia: string;
    readonly permiteVentaSinStock?: boolean;
  },
): Promise<{ readonly productoId: string; readonly insumoId: string }> {
  const productoId = randomUUID();
  const insumoId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('productos')
      .values({
        id: productoId,
        organizacion_id: negocio.organizacionId,
        nombre: opciones.nombre,
        precio_venta_centavos: opciones.precioCentavos,
        costo_unitario_centavos: opciones.precioCentavos / 2n,
        estrategia_consumo: 'sku',
        permite_venta_sin_stock: opciones.permiteVentaSinStock ?? false,
      })
      .execute();
    await tx
      .insertInto('insumos')
      .values({
        id: insumoId,
        organizacion_id: negocio.organizacionId,
        producto_id: productoId,
        nombre: opciones.nombre,
        unidad_base: 'pieza',
      })
      .execute();
    await tx
      .insertInto('existencias')
      .values({
        organizacion_id: negocio.organizacionId,
        almacen_id: almacenId,
        insumo_id: insumoId,
        cantidad: opciones.existencia,
      })
      .execute();
  });
  return { productoId, insumoId };
}

/**
 * Algo que se cobra y NO sale del almacén: la recarga de tiempo aire de la tienda. Sin
 * insumo, el cobro no escribe ningún movimiento de stock.
 */
export async function sembrarSinInventario(
  negocio: NegocioReal,
  opciones: { readonly nombre: string; readonly precioCentavos: bigint },
): Promise<string> {
  const productoId = randomUUID();
  await conTransaccion((tx) =>
    tx
      .insertInto('productos')
      .values({
        id: productoId,
        organizacion_id: negocio.organizacionId,
        nombre: opciones.nombre,
        precio_venta_centavos: opciones.precioCentavos,
        estrategia_consumo: 'ninguno',
      })
      .execute(),
  );
  return productoId;
}

/**
 * Lo que devolvió el comando, o la prueba se cae diciendo POR QUÉ falló. Sin esto, un
 * `expect(r.ok).toBe(true)` rojo enseña `false` y nada más, y el diagnóstico empieza
 * corriendo el comando a mano.
 */
export function exigirOk<T>(resultado: Resultado<T>, que: string): T {
  if (resultado.ok) return resultado.datos;
  throw new Error(`${que} falló: ${JSON.stringify(resultado.error)}`);
}

/** Abre la caja de la terminal del ámbito, por el comando de producción. */
export async function abrirCajaReal(ambito: Ambito, fondoCentavos = 50_000): Promise<string> {
  const salida = await comando(abrirCaja, {
    entrada: { fondoInicialCentavos: fondoCentavos },
    ambito,
    idempotencyKey: clave(),
  });
  return exigirOk(salida, 'caja.abrir').sesionCajaId;
}

/**
 * El carrito de la terminal con sus líneas, armado por los comandos del mostrador, y el
 * total que el servidor le calcula —con el que la pantalla cobraría—.
 */
export async function armarVenta(
  ambito: Ambito,
  lineas: readonly { readonly productoId: string; readonly cantidad: string }[],
): Promise<{ readonly ordenId: string; readonly totalCentavos: number }> {
  const { ordenId } = exigirOk(
    await comando(crearOrden, { entrada: {}, ambito, idempotencyKey: clave() }),
    'venta.crear_orden',
  );
  for (const linea of lineas) {
    exigirOk(
      await comando(agregarLinea, {
        entrada: { ordenId, productoId: linea.productoId, cantidad: linea.cantidad },
        ambito,
        idempotencyKey: clave(),
      }),
      'venta.agregar_linea',
    );
  }
  const { totales } = await conTransaccion((tx) => cotizar(tx, ambito.organizacionId, ordenId));
  return { ordenId, totalCentavos: Number(totales.totalCentavos) };
}

/** El cobro en efectivo exacto de una orden, con la clave que se le dé. */
export function cobrarEnEfectivo(
  ambito: Ambito,
  ordenId: string,
  totalCentavos: number,
  idempotencyKey = clave(),
): Promise<Resultado<ResultadoCobro>> {
  return comando(cobrarOrden, {
    entrada: {
      ordenId,
      pagos: [{ metodo: 'efectivo', montoCentavos: totalCentavos }],
      totalEsperadoCentavos: totalCentavos,
    },
    ambito,
    idempotencyKey,
  });
}
