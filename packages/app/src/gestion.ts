import 'server-only';

import { esPaquete, type Ambito, type Paquete } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';

import { listarProductos, type PaginaProductos } from './catalogo/consulta';
import { leerConfiguracion, type ConfiguracionOrganizacion } from './configuracion/configuracion';

export interface SesionGestion extends Ambito {
  readonly paquete: Paquete;
  readonly nombreNegocio: string;
  readonly nombreSucursal: string | null;
}

/** Completa el ámbito autenticado con los datos visibles de la navegación. */
export async function consultarSesionGestion(ambito: Ambito): Promise<SesionGestion> {
  const resultado = await sql<{
    nombre_negocio: string;
    nombre_sucursal: string | null;
    paquete: string;
  }>`
    select o.nombre nombre_negocio, o.paquete,
      (select s.nombre from sucursales s
       where s.id = ${ambito.sucursalId} and s.organizacion_id = o.id and s.activa) nombre_sucursal
    from organizaciones o where o.id = ${ambito.organizacionId} and o.activa
  `.execute(obtenerDb());
  const fila = resultado.rows[0];
  if (fila === undefined || !esPaquete(fila.paquete)) {
    throw new Error('La sesión apunta a una organización sin paquete válido.');
  }
  return {
    ...ambito,
    paquete: fila.paquete,
    nombreNegocio: fila.nombre_negocio,
    nombreSucursal: fila.nombre_sucursal,
  };
}

export function consultarProductosProduccion(
  organizacionId: string,
  entrada: Parameters<typeof listarProductos>[2],
  rol: Ambito['rol'],
): Promise<PaginaProductos> {
  return conTransaccion((tx) => listarProductos(tx, organizacionId, entrada, rol));
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
