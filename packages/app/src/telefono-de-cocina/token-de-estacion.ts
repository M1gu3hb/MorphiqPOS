import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

/**
 * EL TOKEN DEL TELÉFONO DE UNA ESTACIÓN DE COCINA (DP-9.4).
 *
 * El teléfono del cocinero entra sin PIN con lo único que trae el QR: este token. Dice de qué
 * negocio y de qué estación es, para qué día de operación y qué versión: una FIRMA con la
 * pimienta del servidor, no un dato guardado. Así no hace falta tabla (nada de migración) y no
 * se puede inventar uno.
 *
 * Lo que el token NO decide solo, y lo comprueba quien lo lee contra la base:
 *   · el día: vale sólo el día de operación en que se emitió (zona del negocio);
 *   · la versión: emitir uno nuevo para la estación sube la versión y el anterior deja de valer
 *     (revocación). La versión vive en `configuracion.valores.telefonos_de_cocina`.
 */

export interface ContenidoDelToken {
  readonly organizacionId: string;
  readonly estacionId: string;
  /** El día de operación, `AAAA-MM-DD`, en la zona del negocio. */
  readonly dia: string;
  readonly version: number;
}

/** Más largo que esto no lo emite nadie: se descarta sin calcular nada. */
export const LARGO_MAXIMO_DEL_TOKEN = 400;

const CONTENIDO = z
  .object({
    o: z.uuid(),
    e: z.uuid(),
    d: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    v: z.number().int().min(1).max(1_000_000),
  })
  .strict();

/** La llave de ESTE uso, derivada de la pimienta: un token de cocina no sirve en otro lado. */
function llave(pimienta: string): Buffer {
  return createHmac('sha256', pimienta).update('cocina-telefono:v1', 'utf8').digest();
}

function sello(pimienta: string, cuerpo: string): string {
  return createHmac('sha256', llave(pimienta)).update(cuerpo, 'utf8').digest('base64url');
}

export function firmarTokenDeEstacion(contenido: ContenidoDelToken, pimienta: string): string {
  const cuerpo = Buffer.from(
    JSON.stringify({
      o: contenido.organizacionId,
      e: contenido.estacionId,
      d: contenido.dia,
      v: contenido.version,
    }),
    'utf8',
  ).toString('base64url');
  return `${cuerpo}.${sello(pimienta, cuerpo)}`;
}

/** El contenido si la firma es buena; `null` si no (sin decir por qué: no se da pista). */
export function leerTokenDeEstacion(token: string, pimienta: string): ContenidoDelToken | null {
  if (token.length === 0 || token.length > LARGO_MAXIMO_DEL_TOKEN) return null;
  const partes = token.split('.');
  const [cuerpo, firma] = partes;
  if (partes.length !== 2 || cuerpo === undefined || firma === undefined) return null;

  const esperada = Buffer.from(sello(pimienta, cuerpo), 'utf8');
  const dada = Buffer.from(firma, 'utf8');
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;

  const leido = CONTENIDO.safeParse(jsonDe(Buffer.from(cuerpo, 'base64url').toString('utf8')));
  if (!leido.success) return null;
  return {
    organizacionId: leido.data.o,
    estacionId: leido.data.e,
    dia: leido.data.d,
    version: leido.data.v,
  };
}

/** JSON o nada: un cuerpo firmado que no es JSON no debería existir, pero no se confía. */
function jsonDe(texto: string): unknown {
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
}
