'use client';
/**
 * Utilidades centralizadas para códigos de barras.
 * Reglas:
 *  - SIEMPRE string. Nunca parseInt / Number (perderías ceros iniciales).
 *  - Trim + quitar espacios internos + quitar caracteres invisibles.
 *  - Conservar ceros iniciales.
 */

const INVISIBLE_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g;

/** Normaliza un código a string limpio. */
export function normalizeBarcode(code) {
  if (code === null || code === undefined) return '';
  let s = String(code);
  // quitar todo whitespace (espacios, tabs, saltos de línea)
  s = s.replace(/\s+/g, '');
  // quitar caracteres invisibles / de control
  s = s.replace(INVISIBLE_RE, '');
  return s.trim();
}

/** ¿Parece un código razonablemente válido? */
export function isLikelyValidBarcode(code) {
  const c = normalizeBarcode(code);
  if (!c) return false;
  // Numérico puro: aceptar EAN-8, UPC-A (12), EAN-13, ITF-14
  if (/^\d+$/.test(c)) {
    return c.length === 8 || c.length === 12 || c.length === 13 || c.length === 14;
  }
  // Alfanumérico (códigos internos / Code 128 / Code 39): mínimo 6 caracteres
  return c.length >= 6;
}

/** ¿Parece sospechoso/incompleto? */
export function isSuspiciousBarcode(code) {
  const c = normalizeBarcode(code);
  if (!c) return true;
  if (/^\d+$/.test(c) && c.length < 8) return true;
  if (c.length < 4) return true;
  return false;
}

/** Comparación exacta normalizada. */
export function compareBarcodes(a, b) {
  const na = normalizeBarcode(a);
  const nb = normalizeBarcode(b);
  if (!na || !nb) return false;
  return na === nb;
}