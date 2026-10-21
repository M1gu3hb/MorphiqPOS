import { entidadMapeada } from '@morphiqpos/app/puente';
import { cotizarCita } from '@morphiqpos/app/salon';

import type { QuienVeElCosto } from '../estetica-salon/costo-del-servicio.ts';

/** La entidad y el campo del puente de los que sale el costo del material. */
const RECETA = 'RecetaEscandallo';
const COSTO_DE_LINEA = 'costo_linea_calculado';

/**
 * QUÉ PARTE DE «LO QUE LE CUESTA AL SALÓN» PUEDE LEER QUIEN ENTRA (D.1 de la 2.4).
 *
 * ── El defecto que esto arregla ───────────────────────────────────────────────────
 * La cita en curso pide, para pintar su bloque de costo, la receta del servicio por el puente
 * (`RecetaEscandallo`) y la cotización de la cita (`venta.cotizar_cita`). Ninguna de las dos
 * la lee la estilista —que abre esa pantalla veinte veces al día— y la pantalla lo resolvía
 * pidiéndolas igual, recibiendo un 403 en cada apertura y tragándoselo para pintar «—».
 * Un 403 que se sabe de antemano no es una decisión del servidor: es una pregunta que no
 * debió hacerse, y llena el registro de accesos de negativas que no avisan de nada.
 *
 * ── De dónde sale la respuesta ───────────────────────────────────────────────────
 * De los permisos de lo que se va a pedir, no de una lista tecleada aquí: los roles que leen
 * la receta y su costo por línea son los del MAPA del puente, y los que cotizan una cita son
 * los del comando. Si mañana se abre uno de los dos a otro puesto, este puesto empieza a ver
 * su parte sin tocar esta función —el mismo criterio de `abreEnLaAgenda`—. Se calcula en el
 * SERVIDOR (la página) y viaja como dato: el navegador no decide qué puede pedir.
 */
export function quienVeElCosto(rol: string): QuienVeElCosto {
  const receta = entidadMapeada(RECETA);
  const costo = receta?.calculados?.[COSTO_DE_LINEA];
  const leeLaReceta = receta?.rolesLectura.includes(rol) ?? false;
  // Sin `rolesLectura` el campo lo lee quien lea la entidad; sin el campo, nadie.
  const leeElCosto = costo !== undefined && (costo.rolesLectura?.includes(rol) ?? true);
  return {
    material: leeLaReceta && leeElCosto,
    comision: (cotizarCita.roles as readonly string[]).includes(rol),
  };
}
