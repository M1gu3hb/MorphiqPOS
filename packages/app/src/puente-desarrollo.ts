import 'server-only';

import { esPaquete, esRol, type Ambito, type Paquete } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';

import { listarProductos, type PaginaProductos } from './catalogo/consulta';
import { leerConfiguracion, type ConfiguracionOrganizacion } from './configuracion/configuracion';

export interface SesionServidor extends Ambito {
  readonly paquete: Paquete;
  readonly nombreNegocio: string;
  readonly nombreSucursal: string | null;
}

export class ErrorNoAutenticado extends Error {
  constructor() {
    super('No hay una sesión de MorphiqPOS válida.');
    this.name = 'ErrorNoAutenticado';
  }
}

/** Adaptador temporal de desarrollo hasta que A-03 publique X-02. */
export async function resolverAmbitoDesarrollo(): Promise<SesionServidor> {
  const { NODE_ENV: entornoNode } = process.env;
  if (entornoNode === 'production') throw new ErrorNoAutenticado();

  const slug = process.env['MORPHIQPOS_DEMO_SLUG'] ?? 'demo-ferreteria-la-broca';
  const fila = await obtenerDb()
    .selectFrom('organizaciones as o')
    .innerJoin('empleos as e', 'e.organizacion_id', 'o.id')
    .innerJoin('identidades as i', 'i.persona_id', 'e.persona_id')
    .leftJoin('sucursales as s', (union) =>
      union.onRef('s.organizacion_id', '=', 'o.id').on('s.activa', '=', true),
    )
    .leftJoin('terminales as t', (union) =>
      union.onRef('t.sucursal_id', '=', 's.id').on('t.activa', '=', true),
    )
    .select([
      'o.id as organizacionId',
      'o.nombre as nombreNegocio',
      'o.paquete',
      'e.id as empleoId',
      'e.rol',
      'i.id as identidadId',
      's.id as sucursalId',
      's.nombre as nombreSucursal',
      't.id as terminalId',
    ])
    .where('o.slug', '=', slug)
    .where('o.activa', '=', true)
    .where('e.activo', '=', true)
    .where('i.activa', '=', true)
    .orderBy('e.created_at', 'asc')
    .orderBy('s.created_at', 'asc')
    .orderBy('t.created_at', 'asc')
    .executeTakeFirst();

  if (fila === undefined || !esRol(fila.rol) || !esPaquete(fila.paquete)) {
    throw new ErrorNoAutenticado();
  }
  return {
    organizacionId: fila.organizacionId,
    sucursalId: fila.sucursalId,
    terminalId: fila.terminalId,
    identidadId: fila.identidadId,
    empleoId: fila.empleoId,
    rol: fila.rol,
    paquete: fila.paquete,
    nombreNegocio: fila.nombreNegocio,
    nombreSucursal: fila.nombreSucursal,
  };
}

export function consultarProductosProduccion(
  organizacionId: string,
  entrada: Parameters<typeof listarProductos>[2],
): Promise<PaginaProductos> {
  return conTransaccion((tx) => listarProductos(tx, organizacionId, entrada));
}

export function consultarConfiguracionProduccion(
  organizacionId: string,
): Promise<ConfiguracionOrganizacion> {
  return conTransaccion((tx) => leerConfiguracion(tx, organizacionId));
}

export async function consultarCategoriasProduccion(
  organizacionId: string,
): Promise<readonly { readonly id: string; readonly nombre: string }[]> {
  return obtenerDb()
    .selectFrom('categorias')
    .select(['id', 'nombre'])
    .where('organizacion_id', '=', organizacionId)
    .where('tipo', '=', 'producto')
    .where('activa', '=', true)
    .orderBy('orden')
    .orderBy('nombre')
    .execute();
}
