import { ErrorDominio } from '@morphiqpos/contracts';
import {
  conTransaccion,
  repoVentaCatalogo,
  type Esquema,
  type Transaccion,
} from '@morphiqpos/data';
import { aDiezmilesimas } from '@morphiqpos/domain/dinero';
import { sql, type Kysely } from 'kysely';

import { impuestoDe } from '../venta/cotizar.ts';
import { valorEstable } from './historial-azar.ts';
import { claseDePlatillo } from './historial-clases.ts';
import { ZONA_DEL_HISTORIAL } from './historial-fechas.ts';
import type {
  ContextoDeHistorial,
  EmpleadoRef,
  EstacionRef,
  InsumoRef,
  MesaRef,
  ProductoVendible,
  ProveedorRef,
} from './historial-tipos.ts';

/**
 * Lo que el historial necesita saber del negocio ESPEJO antes de inventar un solo ticket.
 *
 * El historial no trae catálogo propio: vende lo que ese espejo vende, con sus precios, sus
 * recetas, sus mesas y su gente. Por eso esto lee —una sola vez por llamada— el catálogo y el
 * equipo, y por eso el catálogo del espejo tiene que existir ya (lo clona quien lo crea). Lo que
 * cambia de un día a otro (folios, existencias, fondo) NO se lee aquí: se lee dentro de la
 * transacción de cada día, con el candado tomado.
 */

type Lector = Kysely<Esquema> | Transaccion;

const NOMBRE_DE_LA_TERMINAL = 'Caja 1';
const NOMBRE_DEL_PROVEEDOR = 'Central de Abasto';
/** Los días de la semana que visita el proveedor sembrado: lunes y jueves. */
const DIAS_DE_VISITA = [1, 4];
const DIAS_DE_CREDITO = 8;
const POPULARIDAD_MINIMA = 0.35;
const POPULARIDAD_EXTRA = 1.65;

/**
 * Deja la terminal y el proveedor del historial, si el espejo todavía no tiene.
 *
 * Una caja histórica necesita una terminal donde haber estado, y una compra de reabasto, un
 * proveedor. Si el espejo ya las tiene —las clonó, o un dispositivo ya entró—, se usan las
 * suyas. Va bajo el mismo candado que los días, para que dos llamadas simultáneas no creen dos.
 */
async function prepararBaseDelHistorial(
  organizacionId: string,
  sucursalId: string,
): Promise<{ readonly terminalId: string }> {
  return conTransaccion(async (tx) => {
    await candadoDelHistorial(tx, organizacionId);

    const terminal =
      (await tx
        .selectFrom('terminales')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('sucursal_id', '=', sucursalId)
        .orderBy('activa', 'desc')
        .orderBy('created_at', 'asc')
        .executeTakeFirst()) ??
      (await tx
        .insertInto('terminales')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          nombre: NOMBRE_DE_LA_TERMINAL,
        })
        .returning('id')
        .executeTakeFirstOrThrow());

    const proveedor = await tx
      .selectFrom('proveedores')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('activo', '=', true)
      .executeTakeFirst();
    if (proveedor === undefined) {
      await tx
        .insertInto('proveedores')
        .values({
          organizacion_id: organizacionId,
          nombre: NOMBRE_DEL_PROVEEDOR,
          dia_visita: [...DIAS_DE_VISITA],
          dias_credito: DIAS_DE_CREDITO,
          frecuencia: 'semanal',
        })
        .execute();
    }
    return { terminalId: terminal.id };
  });
}

export async function cargarContexto(
  db: Lector,
  organizacionId: string,
  semilla: number,
): Promise<ContextoDeHistorial> {
  const sucursal = await db
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (sucursal === undefined) throw sinDatos('sin_sucursal', 'El espejo no tiene sucursal.');
  const { terminalId } = await prepararBaseDelHistorial(organizacionId, sucursal.id);

  const almacenId = await repoVentaCatalogo.almacenPrincipal(db, organizacionId, sucursal.id);
  if (almacenId === null) throw sinDatos('sin_almacen', 'El espejo no tiene almacén principal.');

  const [empleados, productos, insumos, estaciones, mesas, proveedores, impuesto, tope] =
    await Promise.all([
      leerEmpleados(db, organizacionId, sucursal.id),
      leerProductos(db, organizacionId),
      leerInsumos(db, organizacionId),
      leerEstaciones(db, organizacionId),
      leerMesas(db, organizacionId, sucursal.id),
      leerProveedores(db, organizacionId),
      impuestoDe(db, organizacionId),
      leerTopeDelCajero(db, organizacionId),
    ]);

  const gerentes = empleados.filter((e) => ['gerente', 'administrador', 'dueno'].includes(e.rol));
  const cajeros = empleados.filter((e) => e.rol === 'cajero');
  const meseros = empleados.filter((e) => e.rol === 'mesero');
  if (gerentes.length + cajeros.length === 0) {
    throw sinDatos('sin_personal', 'El espejo no tiene a nadie que cobre ni que dirija.');
  }
  if (productos.length === 0) {
    throw sinDatos('sin_catalogo', 'El espejo no tiene productos vendibles que sembrar.');
  }
  if (estaciones.length === 0) {
    throw sinDatos('sin_estaciones', 'El espejo no tiene estaciones de preparación.');
  }

  const quienCobra = cajeros.length > 0 ? cajeros : gerentes;
  return {
    organizacionId,
    sucursalId: sucursal.id,
    terminalId,
    almacenId,
    zona: ZONA_DEL_HISTORIAL,
    semilla,
    cajeros: quienCobra,
    meseros: meseros.length > 0 ? meseros : quienCobra,
    gerentes: gerentes.length > 0 ? gerentes : quienCobra,
    productos,
    mesas,
    estaciones,
    insumos,
    proveedores,
    impuesto,
    topeDelCajero: tope,
  };
}

function sinDatos(motivo: string, mensaje: string): ErrorDominio {
  return new ErrorDominio('CONFIGURACION_INVALIDA', mensaje, { motivo });
}

async function leerEmpleados(
  db: Lector,
  organizacionId: string,
  sucursalId: string,
): Promise<EmpleadoRef[]> {
  const filas = await db
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .select(['empleos.id as id', 'empleos.rol as rol', 'personas.nombre as nombre'])
    .where('empleos.organizacion_id', '=', organizacionId)
    .where('empleos.activo', '=', true)
    .where((eb) =>
      eb.or([eb('empleos.sucursal_id', 'is', null), eb('empleos.sucursal_id', '=', sucursalId)]),
    )
    // Un orden estable: la misma base da siempre el mismo equipo, y con ella la misma semilla.
    .orderBy('empleos.created_at', 'asc')
    .orderBy('empleos.id', 'asc')
    .execute();
  return filas;
}

async function leerProductos(db: Lector, organizacionId: string): Promise<ProductoVendible[]> {
  const filas = await db
    .selectFrom('productos')
    .leftJoin('categorias', 'categorias.id', 'productos.categoria_id')
    .leftJoin('insumos', 'insumos.producto_id', 'productos.id')
    .select([
      'productos.id as id',
      'productos.nombre as nombre',
      'productos.sku as sku',
      'productos.codigo_barras as codigoBarras',
      'productos.precio_venta_centavos as precioCentavos',
      'productos.costo_unitario_centavos as costoCentavos',
      'productos.unidad_venta as unidadVenta',
      'productos.area_preparacion as areaPreparacion',
      'productos.minutos_preparacion as minutosPreparacion',
      'productos.tiempo_servicio_default as tiempoServicio',
      'productos.estrategia_consumo as estrategiaConsumo',
      'productos.permite_venta_sin_stock as permiteVentaSinStock',
      'categorias.nombre as categoriaNombre',
      'categorias.estacion_preparacion_id as estacionDeCategoriaId',
      'insumos.id as insumoId',
      'insumos.unidad_base as unidadBaseInsumo',
    ])
    .where('productos.organizacion_id', '=', organizacionId)
    .where('productos.activo', '=', true)
    .where('productos.visible_en_pos', '=', true)
    .where('productos.tipo_venta', '=', 'precio_fijo')
    .where('productos.precio_venta_centavos', '>', 0n)
    .where('productos.es_continuo', '=', false)
    .orderBy('productos.created_at', 'asc')
    .orderBy('productos.id', 'asc')
    .execute();

  const conReceta = filas.filter((f) => f.estrategiaConsumo === 'receta').map((f) => f.id);
  const recetas = await repoVentaCatalogo.recetasDeProductos(db, organizacionId, conReceta);

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    sku: f.sku,
    codigoBarras: f.codigoBarras,
    clase: claseDePlatillo(f.categoriaNombre, f.areaPreparacion),
    precioCentavos: f.precioCentavos,
    costoCentavos: f.costoCentavos,
    unidadVenta: f.unidadVenta,
    areaPreparacion: f.areaPreparacion,
    estacionDeCategoriaId: f.estacionDeCategoriaId,
    minutosPreparacion: f.minutosPreparacion,
    tiempoServicio: f.tiempoServicio,
    estrategiaConsumo: f.estrategiaConsumo,
    permiteVentaSinStock: f.permiteVentaSinStock,
    insumoId: f.insumoId,
    unidadBaseInsumo: f.unidadBaseInsumo,
    receta: recetas.get(f.id) ?? [],
    popularidad:
      POPULARIDAD_MINIMA +
      POPULARIDAD_EXTRA * Math.pow(valorEstable('popularidad', organizacionId, f.id), 2),
  }));
}

async function leerInsumos(db: Lector, organizacionId: string): Promise<Map<string, InsumoRef>> {
  const filas = await db
    .selectFrom('insumos')
    .select([
      'id',
      'nombre',
      'unidad_base as unidadBase',
      'costo_unitario_centavos as costoCentavos',
      'stock_minimo as stockMinimo',
      'proveedor_id as proveedorId',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('activo', '=', true)
    .execute();
  return new Map(
    filas.map((f) => [
      f.id,
      { ...f, stockMinimo: aDiezmilesimas(f.stockMinimo) } satisfies InsumoRef,
    ]),
  );
}

async function leerEstaciones(db: Lector, organizacionId: string): Promise<EstacionRef[]> {
  const filas = await db
    .selectFrom('estaciones_preparacion')
    .select(['id', 'nombre', 'color', 'es_general as esGeneral'])
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .orderBy('orden', 'asc')
    .execute();
  return filas;
}

async function leerMesas(
  db: Lector,
  organizacionId: string,
  sucursalId: string,
): Promise<MesaRef[]> {
  const filas = await db
    .selectFrom('mesas')
    .select(['id', 'numero', 'capacidad'])
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('activa', '=', true)
    .orderBy('numero', 'asc')
    .execute();
  return filas;
}

async function leerProveedores(db: Lector, organizacionId: string): Promise<ProveedorRef[]> {
  const filas = await db
    .selectFrom('proveedores')
    .select(['id', 'nombre'])
    .where('organizacion_id', '=', organizacionId)
    .where('activo', '=', true)
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return filas;
}

async function leerTopeDelCajero(
  db: Lector,
  organizacionId: string,
): Promise<{ readonly topeCentavos: bigint; readonly topeBp: number }> {
  const fila = await db
    .selectFrom('topes_descuento')
    .select(['tope_centavos', 'tope_bp'])
    .where('organizacion_id', '=', organizacionId)
    .where('rol', '=', 'cajero')
    .executeTakeFirst();
  return { topeCentavos: fila?.tope_centavos ?? 0n, topeBp: fila?.tope_bp ?? 0 };
}

/**
 * El candado de la organización: un historial a la vez por espejo.
 *
 * `pg_advisory_xact_lock` se suelta solo al confirmar o revertir, así que no puede quedar
 * colgado si el proceso muere a media transacción. La clave de 64 bits sale de un hash del
 * texto: dos espejos distintos no se esperan entre sí.
 */
export async function candadoDelHistorial(tx: Transaccion, organizacionId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`presentacion_historial:${organizacionId}`}, 0))`.execute(
    tx,
  );
}
