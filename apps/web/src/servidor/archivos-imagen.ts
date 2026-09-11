import sharp from 'sharp';

import type { ExtensionImagen } from './archivos-claves.ts';

const MAX_DIMENSION = 6_000;
const MAX_PIXELES = MAX_DIMENSION * MAX_DIMENSION;

interface TipoImagen {
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  readonly extension: ExtensionImagen;
}

export class ErrorImagen extends Error {
  constructor(
    readonly codigo: 'TIPO_NO_ADMITIDO' | 'IMAGEN_INVALIDA' | 'DIMENSIONES_EXCESIVAS',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorImagen';
  }
}

function coincide(bytes: Uint8Array, firma: readonly number[], inicio = 0): boolean {
  return firma.every((valor, indice) => bytes[inicio + indice] === valor);
}

function detectarTipo(bytes: Uint8Array): TipoImagen | null {
  if (coincide(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (coincide(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (coincide(bytes, [0x52, 0x49, 0x46, 0x46]) && coincide(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  if (coincide(bytes, [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 4)) {
    return { mime: 'image/avif', extension: 'avif' };
  }
  return null;
}

export interface ImagenProcesada extends TipoImagen {
  readonly bytes: Uint8Array;
  readonly ancho: number;
  readonly alto: number;
}

export async function analizarYRecodificarImagen(bytes: Uint8Array): Promise<ImagenProcesada> {
  const tipo = detectarTipo(bytes);
  if (tipo === null) {
    throw new ErrorImagen('TIPO_NO_ADMITIDO', 'Sólo se admiten imágenes JPEG, PNG, WebP o AVIF.');
  }

  try {
    const entrada = sharp(bytes, { failOn: 'error', limitInputPixels: MAX_PIXELES });
    const metadatos = await entrada.metadata();
    const ancho = metadatos.width;
    const alto = metadatos.height;
    if (ancho < 1 || alto < 1 || ancho > MAX_DIMENSION || alto > MAX_DIMENSION) {
      throw new ErrorImagen(
        'DIMENSIONES_EXCESIVAS',
        `La imagen no puede superar ${MAX_DIMENSION} × ${MAX_DIMENSION} píxeles.`,
      );
    }

    const limpia = entrada.rotate();
    const salida =
      tipo.extension === 'jpg'
        ? limpia.jpeg({ quality: 90 })
        : tipo.extension === 'png'
          ? limpia.png({ compressionLevel: 9 })
          : tipo.extension === 'webp'
            ? limpia.webp({ quality: 88 })
            : limpia.avif({ quality: 60 });
    return { ...tipo, bytes: await salida.toBuffer(), ancho, alto };
  } catch (error) {
    if (error instanceof ErrorImagen) throw error;
    throw new ErrorImagen('IMAGEN_INVALIDA', 'La imagen está dañada o no se puede decodificar.');
  }
}
