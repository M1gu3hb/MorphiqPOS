import 'server-only';

import { createHmac } from 'node:crypto';

import { repoLimite } from '@morphiqpos/data';

/**
 * Límite de peticiones por TOKEN DE MESA (E7-3).
 *
 * Reusa la infraestructura que ya existe —la tabla `limite_tasa` de la
 * migración 044 y `repoLimite.contarIntento`, con su `insert … on conflict`
 * atómico— y no inventa otra. Lo único propio es por qué se agrupa:
 * `http/limite.ts` cuenta por IP porque protege el acceso con PIN; aquí se
 * cuenta por token porque el atacante interesante no es una IP, es un código
 * pegado en una mesa que cualquiera puede fotografiar desde la acera.
 *
 * ── Por qué importa más de lo que parece ──────────────────────────────────
 * `generarTokenMesa` (qrUtils.js:8-16) es un hash NO criptográfico del id de la
 * mesa, y `F1-04` §38.4 deja la rotación fuera de la Fase 1: el token no se
 * puede invalidar. Un código filtrado —una foto en una reseña— es permanente.
 * El límite es lo que impide que ese código sirva para llenar la cocina de
 * pedidos falsos a las tres de la mañana.
 *
 * ── La clave es un HMAC, no el token ──────────────────────────────────────
 * Misma postura que la migración 044: quien lea `limite_tasa` no obtiene los
 * códigos de las mesas de nadie. Sirve para agrupar, no para identificar.
 */

export interface Limite {
  readonly intentos: number;
  readonly ventanaSegundos: number;
}

const MINUTO = 60;
const CINCO_MINUTOS = 300;

/**
 * Las ventanas, una por acción.
 *
 * La consulta es generosa a propósito: hasta E11-1 el portal sigue preguntando
 * cada dos segundos y medio, y en una mesa de cuatro hay cuatro teléfonos
 * haciéndolo a la vez. Un límite que corta ahí no protege de nada, sólo rompe
 * la comida de un cliente real.
 *
 * Las escrituras son estrechas por lo contrario: nadie abre su mesa seis veces
 * en cinco minutos, y quien lo intenta no está comiendo.
 */
export const LIMITES_PORTAL = {
  consulta: { intentos: 300, ventanaSegundos: MINUTO },
  abrir_mesa: { intentos: 6, ventanaSegundos: CINCO_MINUTOS },
  enviar_pedido: { intentos: 20, ventanaSegundos: CINCO_MINUTOS },
  crear_solicitud: { intentos: 10, ventanaSegundos: CINCO_MINUTOS },
  pedir_cuenta: { intentos: 10, ventanaSegundos: CINCO_MINUTOS },
  valorar: { intentos: 6, ventanaSegundos: CINCO_MINUTOS },
} as const satisfies Readonly<Record<string, Limite>>;

export type AccionPortal = keyof typeof LIMITES_PORTAL;

export interface Permiso {
  readonly ok: boolean;
  readonly esperaSegundos: number;
}

/**
 * Cuenta el intento y dice si se permite.
 *
 * Se cuenta ANTES de ejecutar y FUERA de la transacción del comando: un intento
 * que termina en error tiene que gastar cuota igual, o probar mil veces con
 * datos inválidos saldría gratis y el límite no existiría para el único caso
 * en el que hace falta.
 *
 * Si la tabla del límite no responde se deja pasar, igual que `permitir` de
 * `http/limite.ts` y por la misma razón escrita allí: un límite que tumba el
 * servicio cuando su propia tabla falla es la negación de servicio que venía a
 * evitar. Lo que protege el dinero —la transacción, la idempotencia y las
 * restricciones de la base— sigue en pie.
 */
export async function permitirPortal(
  accion: AccionPortal,
  token: string,
  pimienta: string,
): Promise<Permiso> {
  const { intentos: maximo, ventanaSegundos } = LIMITES_PORTAL[accion];
  const clave = createHmac('sha256', pimienta)
    .update(`portal:${accion}:${token}`, 'utf8')
    .digest('hex');

  try {
    const { intentos, esperaSegundos } = await repoLimite.contarIntento(clave, ventanaSegundos);
    return { ok: intentos <= maximo, esperaSegundos };
  } catch (error) {
    console.error('[portal/limite] no se pudo contar el intento', error);
    return { ok: true, esperaSegundos: 0 };
  }
}
