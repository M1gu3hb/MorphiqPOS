import { randomBytes } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONES = ['jpg', 'png', 'webp', 'avif'] as const;

/**
 * Las de DATOS, aparte de las de imagen.
 *
 * Aparte y no en la misma lista porque `crearClavePrivada` es de imágenes —la
 * subida recodifica y comprueba que lo sean— y un `csv` ahí dentro dejaría que una
 * imagen naciera con extensión de datos. Lo que comparten es la FORMA de la clave,
 * que es lo que `esClaveArchivo` comprueba.
 */
const EXTENSIONES_DE_DATOS = ['csv'] as const;

export type ExtensionImagen = (typeof EXTENSIONES)[number];
export type ExtensionDeDatos = (typeof EXTENSIONES_DE_DATOS)[number];

export function generarUuidV7(
  ahora: Date = new Date(),
  aleatorio: (bytes: number) => Uint8Array = randomBytes,
): string {
  const bytes = aleatorio(10);
  if (bytes.byteLength !== 10) throw new Error('La fuente aleatoria no entregó 10 bytes.');
  const byte0 = bytes[0] ?? 0;
  const byte1 = bytes[1] ?? 0;
  const byte2 = bytes[2] ?? 0;
  const marca = BigInt(ahora.getTime());
  const salida = new Uint8Array(16);
  for (let indice = 5; indice >= 0; indice -= 1) {
    salida[indice] = Number((marca >> BigInt((5 - indice) * 8)) & 0xffn);
  }
  salida[6] = 0x70 | (byte0 & 0x0f);
  salida[7] = byte1;
  salida[8] = 0x80 | (byte2 & 0x3f);
  salida.set(bytes.subarray(3), 9);
  const hexadecimal = Buffer.from(salida).toString('hex');
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}

export function crearClavePrivada(
  organizacionId: string,
  extension: ExtensionImagen,
  ahora: Date = new Date(),
  id: string = generarUuidV7(ahora),
): string {
  if (!UUID.test(organizacionId) || !UUID.test(id) || !EXTENSIONES.includes(extension)) {
    throw new Error('No se puede construir una clave de archivo válida.');
  }
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
  return `privado/${organizacionId}/${ahora.getUTCFullYear()}/${mes}/${id}.${extension}`;
}

/**
 * La clave de un EXPORTE: misma forma que la de una imagen, otra extensión.
 *
 * Bajo el mismo prefijo privado de la organización a propósito: así el lector de
 * `/api/archivos/...` le aplica la misma comprobación de sesión —el archivo sólo
 * lo baja quien está dentro de ESE negocio— y la cuota de archivos lo cuenta
 * igual. Un exporte con su propio camino sería un camino más que proteger.
 */
export function crearClaveDeExporte(
  organizacionId: string,
  extension: ExtensionDeDatos,
  ahora: Date = new Date(),
  id: string = generarUuidV7(ahora),
): string {
  if (!UUID.test(organizacionId) || !UUID.test(id) || !EXTENSIONES_DE_DATOS.includes(extension)) {
    throw new Error('No se puede construir una clave de archivo válida.');
  }
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
  return `privado/${organizacionId}/${ahora.getUTCFullYear()}/${mes}/${id}.${extension}`;
}

export function esClaveArchivo(clave: string, prefijo: 'privado' | 'publico'): boolean {
  const partes = clave.split('/');
  if (partes.length !== 5 || partes[0] !== prefijo || !UUID.test(partes[1] ?? '')) return false;
  if (!/^\d{4}$/.test(partes[2] ?? '') || !/^(0[1-9]|1[0-2])$/.test(partes[3] ?? '')) {
    return false;
  }
  const archivo = partes[4] ?? '';
  const punto = archivo.lastIndexOf('.');
  const extension = archivo.slice(punto + 1);
  return (
    UUID.test(archivo.slice(0, punto)) &&
    (EXTENSIONES.includes(extension as ExtensionImagen) ||
      EXTENSIONES_DE_DATOS.includes(extension as ExtensionDeDatos))
  );
}
