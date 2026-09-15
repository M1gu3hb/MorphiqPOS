import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ErrorImagen, analizarYRecodificarImagen } from './archivos-imagen.ts';

const FUENTE =
  process.env['MORPHIQPOS_IMAGE_SOURCE_PATH'] ??
  resolve(process.cwd(), 'apps/web/src/servidor/archivos-imagen.ts');

describe('imágenes subUsar', () => {
  it.each([
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
    ['avif', 'image/avif', 'avif'],
  ] as const)('detecta %s por sus bytes y la recodifica', async (formato, mime, extension) => {
    const original = await sharp({
      create: { width: 12, height: 8, channels: 3, background: '#336699' },
    })
      .toFormat(formato)
      .withExif({ IFD0: { Artist: 'dato que no debe persistir' } })
      .toBuffer();

    const resultado = await analizarYRecodificarImagen(original);
    const metadatos = await sharp(resultado.bytes).metadata();

    expect(resultado).toMatchObject({ mime, extension, ancho: 12, alto: 8 });
    expect(metadatos.width).toBe(12);
    expect(metadatos.height).toBe(8);
    expect(metadatos.exif).toBeUndefined();
  });

  it('rechaza SVG aunque el cliente lo llame PNG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await expect(analizarYRecodificarImagen(svg)).rejects.toMatchObject<Partial<ErrorImagen>>({
      codigo: 'TIPO_NO_ADMITIDO',
    });
  });

  it('rechaza una cabecera JPEG falsa que no se puede decodificar', async () => {
    await expect(
      analizarYRecodificarImagen(Buffer.from([0xff, 0xd8, 0xff, 0x3c, 0x68, 0x74, 0x6d, 0x6c])),
    ).rejects.toBeInstanceOf(ErrorImagen);
  });

  it('rechaza cualquiera de las dos dimensiones por encima de 6000 px', async () => {
    const demasiadoAncha = await sharp({
      create: { width: 6001, height: 1, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();

    await expect(analizarYRecodificarImagen(demasiadoAncha)).rejects.toMatchObject<
      Partial<ErrorImagen>
    >({ codigo: 'DIMENSIONES_EXCESIVAS' });
  });

  it('mantiene el tope dimensional y la recodificación en el servidor', () => {
    const fuente = readFileSync(FUENTE, 'utf8');
    expect(fuente).toContain('const MAX_DIMENSION = 6_000');
    expect(fuente).toContain('bytes: await salida.toBuffer()');
    expect(fuente).toContain("mime: 'image/avif'");
  });
});
