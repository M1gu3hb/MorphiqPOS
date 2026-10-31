import 'server-only';

import { obtenerDb } from '@morphiqpos/data';

/**
 * LA ZONA HORARIA DEL NEGOCIO (PAR-1, del modo espera de DP-11.2): la hora que enseña la pantalla
 * de espera es la del negocio, no la del aparato ni una fija. Sale de `organizaciones.zona_horaria`.
 *
 * Es un adorno de la pantalla, como la apariencia: si no se puede leer, o la base trae algo que el
 * navegador no sabría usar, la de omisión. NUNCA lanza.
 */
export const ZONA_HORARIA_POR_OMISION = 'America/Mexico_City';

/** La zona si es una que `Intl` conoce; si no, la de omisión. Pura. */
export function zonaValida(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim() === '') return ZONA_HORARIA_POR_OMISION;
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: valor });
    return valor;
  } catch {
    return ZONA_HORARIA_POR_OMISION;
  }
}

export async function zonaHorariaDeLaOrganizacion(organizacionId: string): Promise<string> {
  try {
    const fila = await obtenerDb()
      .selectFrom('organizaciones')
      .select('zona_horaria')
      .where('id', '=', organizacionId)
      .executeTakeFirst();
    return zonaValida(fila?.zona_horaria);
  } catch {
    return ZONA_HORARIA_POR_OMISION;
  }
}
