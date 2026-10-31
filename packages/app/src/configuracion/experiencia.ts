import 'server-only';

import { z } from 'zod';

import { obtenerDb } from '@morphiqpos/data';

/**
 * LA EXPERIENCIA DEL NEGOCIO (DP-11): lo que no es color ni perilla, pero cambia cómo se siente
 * el sistema. «Mascota Morfi» (DP-11.1): Morfi acompaña las cargas largas, la página que no existe y
 * el modo espera; apagada, cada lugar usa su versión sin mascota. «Pedir PIN al despertar»
 * (DP-11.2): al volver del modo espera, la persona de la sesión teclea su PIN.
 *
 * Vive en `configuracion.valores.experiencia` y se guarda por el camino genérico de la
 * configuración (`puente/configuracion.ts`), validada con `EXPERIENCIA`. Sin migración.
 */
export const CLAVE_DE_EXPERIENCIA = 'experiencia';

/** Lo que se acepta al guardar: sólo interruptores conocidos, sí o no. */
export const EXPERIENCIA = z
  .object({
    mascota: z.boolean(),
    pin_al_despertar: z.boolean(),
  })
  .partial()
  .strict();

export interface Experiencia {
  readonly mascota: boolean;
  readonly pin_al_despertar: boolean;
}

export const EXPERIENCIA_POR_OMISION: Experiencia = { mascota: true, pin_al_despertar: false };

function esDocumento(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** La experiencia de un documento de configuración: lo que no se entiende, como de omisión. */
export function experienciaDe(valores: unknown): Experiencia {
  const documento = esDocumento(valores) ? valores[CLAVE_DE_EXPERIENCIA] : undefined;
  const guardada = esDocumento(documento) ? documento : {};
  const sino = (clave: keyof Experiencia): boolean => {
    const valor = guardada[clave];
    return typeof valor === 'boolean' ? valor : EXPERIENCIA_POR_OMISION[clave];
  };
  return { mascota: sino('mascota'), pin_al_despertar: sino('pin_al_despertar') };
}

/**
 * La experiencia de un negocio, para pintarla desde el SERVIDOR. Nunca lanza, como la
 * apariencia (`apariencia.ts`): es un adorno, y una pantalla que no abre por un adorno sería un
 * desastre causado por un adorno.
 */
export async function experienciaDeLaOrganizacion(organizacionId: string): Promise<Experiencia> {
  try {
    const fila = await obtenerDb()
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', organizacionId)
      .executeTakeFirst();
    return experienciaDe(fila?.valores);
  } catch {
    return EXPERIENCIA_POR_OMISION;
  }
}
