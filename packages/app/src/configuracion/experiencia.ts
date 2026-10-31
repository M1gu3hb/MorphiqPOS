import 'server-only';

import { z } from 'zod';

import { obtenerDb } from '@morphiqpos/data';

/**
 * LA EXPERIENCIA DEL NEGOCIO (DP-11): lo que no es color ni perilla, pero cambia cómo se siente
 * el sistema. «Mascota Morfi» (DP-11.1): Morfi acompaña las cargas largas, la página que no existe y
 * el modo espera; apagada, cada lugar usa su versión sin mascota. «Pedir PIN al despertar»
 * (DP-11.2): al volver del modo espera, la persona de la sesión teclea su PIN. Y los sonidos
 * (DP-11.3): con qué suena el teclado de PIN y de números (`tecla`) y si el portal del comensal
 * suena (`sonidos_en_el_portal`, apagado). Cuánto suena cada aparato es del aparato, no de aquí.
 *
 * Vive en `configuracion.valores.experiencia` y se guarda por el camino genérico de la
 * configuración (`puente/configuracion.ts`), validada con `EXPERIENCIA`. Sin migración.
 */
export const CLAVE_DE_EXPERIENCIA = 'experiencia';

/** Los sonidos que se pueden elegir para el teclado (React Bits · Sound Lab). */
export const TECLAS_DE_SONIDO = ['nib', 'keycap', 'thock', 'clasp'] as const;
export type TeclaDeSonido = (typeof TECLAS_DE_SONIDO)[number];

/** Lo que se acepta al guardar: sólo llaves conocidas, cada una con su forma. */
export const EXPERIENCIA = z
  .object({
    mascota: z.boolean(),
    pin_al_despertar: z.boolean(),
    sonidos_en_el_portal: z.boolean(),
    tecla: z.enum(TECLAS_DE_SONIDO),
  })
  .partial()
  .strict();

export interface Experiencia {
  readonly mascota: boolean;
  readonly pin_al_despertar: boolean;
  readonly sonidos_en_el_portal: boolean;
  readonly tecla: TeclaDeSonido;
}

export const EXPERIENCIA_POR_OMISION: Experiencia = {
  mascota: true,
  pin_al_despertar: false,
  sonidos_en_el_portal: false,
  tecla: 'nib',
};

type Interruptor = 'mascota' | 'pin_al_despertar' | 'sonidos_en_el_portal';

function esDocumento(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** La experiencia de un documento de configuración: lo que no se entiende, como de omisión. */
export function experienciaDe(valores: unknown): Experiencia {
  const documento = esDocumento(valores) ? valores[CLAVE_DE_EXPERIENCIA] : undefined;
  const guardada = esDocumento(documento) ? documento : {};
  const sino = (clave: Interruptor): boolean => {
    const valor = guardada[clave];
    return typeof valor === 'boolean' ? valor : EXPERIENCIA_POR_OMISION[clave];
  };
  const tecla = guardada['tecla'];
  return {
    mascota: sino('mascota'),
    pin_al_despertar: sino('pin_al_despertar'),
    sonidos_en_el_portal: sino('sonidos_en_el_portal'),
    tecla: TECLAS_DE_SONIDO.find((t) => t === tecla) ?? EXPERIENCIA_POR_OMISION.tecla,
  };
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
