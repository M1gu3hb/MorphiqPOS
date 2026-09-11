import 'server-only';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';

import { listarProductos, type PaginaProductos } from './catalogo/consulta.ts';
import {
  leerConfiguracion,
  type ConfiguracionOrganizacion,
} from './configuracion/configuracion.ts';

/**
 * Consultas de gestión que no pasan por `comando()`.
 *
 * Son LECTURAS: no cambian estado, no llevan idempotencia y no se auditan. Lo
 * que sí llevan —y no es negociable— es el `organizacionId` que les pasa
 * `responderConsulta` desde la sesión resuelta en el servidor. Ninguna lo
 * recibe del cliente.
 *
 * Aquí vivía `resolverAmbitoDesarrollo`, que buscaba «el primer dueño de la
 * organización demo» y lanzaba en producción. Se borró: el ámbito sale de la
 * cookie firmada, y hay un solo sitio donde nace.
 */

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
