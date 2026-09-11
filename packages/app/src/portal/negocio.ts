import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import { obtenerDb, type Transaccion } from '@morphiqpos/data';

import type { BanderasPortal } from './banderas.ts';

/**
 * Lo que el servidor necesita saber del negocio para atender un QR.
 *
 * Son dos datos y una sola consulta: qué paquete contrató —que decide si el
 * portal existe siquiera— y el documento de configuración, del que salen los
 * interruptores de `banderas.ts`.
 *
 * ── Por qué no se usa `leerConfiguracion` para esto ────────────────────────
 * `leerConfiguracion(org, {publica:true})` devuelve lo que se puede ENSEÑAR, y
 * hace falta lo que se usa para DECIDIR: `portal_qr_activo`,
 * `portal_qr_permitir_pedidos_cliente`, `estaciones_preparacion_activas`. Esos
 * no están en `PUBLICOS` —ni deben estar—, así que el documento se lee aquí,
 * se decide con él, y de él sólo salen los booleanos que `§36.3` autoriza.
 * Para la parte que SÍ se enseña, `consulta.ts` llama a `leerConfiguracion`.
 */

export interface ContextoDelNegocio {
  readonly paquete: string;
  readonly valores: unknown;
}

export async function leerContextoDelNegocio(
  db: Transaccion | undefined,
  organizacionId: string,
): Promise<ContextoDelNegocio | null> {
  const base = db ?? obtenerDb();
  const fila = await base
    .selectFrom('organizaciones as o')
    .leftJoin('configuracion as c', 'c.organizacion_id', 'o.id')
    .select(['o.paquete as paquete', 'c.valores as valores'])
    .where('o.id', '=', organizacionId)
    .where('o.activa', '=', true)
    .executeTakeFirst();

  return fila === undefined ? null : { paquete: fila.paquete, valores: fila.valores };
}

/**
 * El portal apagado es un `QR_PORTAL_CERRADO`, no un 404.
 *
 * Se distingue del token inválido a propósito, y es la única distinción que se
 * permite: «el negocio apagó el menú digital» no filtra nada —quien escanea ya
 * está sentado en el local— y sin ella la pantalla sólo podría decir «código
 * inválido» a un cliente cuyo código está perfectamente bien.
 */
export function exigirPortalAbierto(banderas: BanderasPortal): void {
  if (banderas.portalActivo) return;
  throw new ErrorDominio(
    'QR_PORTAL_CERRADO',
    'El menú digital de este negocio no está disponible ahora mismo.',
  );
}

/**
 * Si el comensal puede ORDENAR desde su teléfono.
 *
 * Las cuatro condiciones de `PortalCliente.jsx:261-266`, resueltas en el
 * servidor. La primera era `paquete_modo === 'restaurante_pro'`, que obligaba a
 * publicar el plan comercial; aquí se comprueba contra el paquete real de
 * `organizaciones`, que nunca sale en la respuesta.
 */
export function puedeOrdenarDesdeQR(paquete: string, banderas: BanderasPortal): boolean {
  const esDePreparacion = (PAQUETES_PREPARACION as readonly string[]).includes(paquete);
  return (
    esDePreparacion &&
    banderas.portalActivo &&
    banderas.permitirPedidosCliente &&
    banderas.asignacionMesasActiva
  );
}
