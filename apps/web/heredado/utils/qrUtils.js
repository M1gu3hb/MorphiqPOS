'use client';
import { api } from '@/api/cliente';

// Helpers del Portal QR — rotación de credencial y URLs públicas.
// No usa servicios externos: el QR se genera con `qrcode` (local).

/**
 * Pide al servidor una credencial nueva para la mesa.
 */
export async function generarTokenMesa(mesaId) {
  if (!mesaId) return '';
  const resultado = await api.comandos.ejecutar('/api/restaurante/rotar-qr', { mesaId });
  return resultado.qrToken;
}

/**
 * La dirección PÚBLICA del despliegue, la canónica de `APP_URL`.
 *
 * El servidor la pone en `<html data-url-publica>`. Con el origen de la pestaña, el QR que
 * se imprimía desde la URL de Vercel llevaba esa URL y no el dominio propio, y el que se
 * imprimía desde un preview quedaba muerto al borrarse el preview.
 */
export function urlPublica() {
  if (typeof window === 'undefined') return '';
  const publica = document.documentElement?.dataset?.urlPublica;
  return publica && /^https?:\/\//.test(publica) ? publica.replace(/\/+$/, '') : window.location.origin;
}

/**
 * URL pública de la mesa para escanear con QR: el dominio público + /qr/:token.
 */
export function buildPortalQRUrl(mesa) {
  if (typeof window === 'undefined' || !mesa?.qr_token) return '';
  return `${urlPublica()}/qr/${mesa.qr_token}`;
}

/**
 * Devuelve los tipos de solicitud habilitados según la config.
 */
export function getTiposSolicitudHabilitados(config) {
  const tipos = [];
  if (config?.portal_qr_permitir_ordenar !== false) tipos.push('ordenar');
  if (config?.portal_qr_permitir_cuenta !== false) tipos.push('cuenta');
  if (config?.portal_qr_permitir_ayuda !== false) tipos.push('ayuda');
  return tipos;
}

export const TIPO_SOLICITUD_LABEL = {
  ordenar: 'Quiero ordenar',
  cuenta: 'Pedir cuenta',
  ayuda: 'Necesito ayuda',
};

export const TIPO_SOLICITUD_VERBO = {
  ordenar: 'quiere ordenar',
  cuenta: 'solicita cuenta',
  ayuda: 'requiere ayuda',
};
