/**
 * UN ID AL AZAR (UUID v4) QUE TAMBIÉN SIRVE POR HTTP.
 *
 * `crypto.randomUUID` sólo existe en un contexto seguro: https o `localhost`. Por la red del
 * local —la demo con los teléfonos (DP-9) y el servidor del restaurante en la Fase C— la página
 * se sirve por http y la función no está. `crypto.getRandomValues` sí está en cualquier
 * contexto y da el mismo azar criptográfico, así que con ella se arma el UUID (RFC 9562 §5.4).
 *
 * Es el único sitio del navegador que llama `randomUUID`: lo exige `id-al-azar.test.ts`.
 */
export function idAlAzar(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // versión 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
