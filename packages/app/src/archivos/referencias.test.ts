import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { prepararReferenciasPublicas } from './referencias.ts';

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const ID = '019945e0-8200-7001-8203-040506070809';
const PRIVADA = `privado/${ORGANIZACION}/2026/09/${ID}.png`;
const URL_PRIVADA = `https://pos.ejemplo/api/archivos/${PRIVADA}`;
const URL_PUBLICA = `https://pos.ejemplo/api/publico/archivo/publico/${ORGANIZACION}/2026/09/${ID}.png`;
const FUENTE =
  process.env['MORPHIQPOS_FILE_REFERENCES_SOURCE_PATH'] ??
  resolve(process.cwd(), 'packages/app/src/archivos/referencias.ts');

describe('publicación de referencias de archivo', () => {
  it.each(['ProductoTerminado', 'MenuQRSeccion'])(
    '%s publica su imagen al persistirla',
    async (entidad) => {
      const copiar = vi.fn(async () => undefined);
      const salida = await prepararReferenciasPublicas({
        entidad,
        datos: { imagen_url: URL_PRIVADA, nombre: 'Prueba' },
        organizacionId: ORGANIZACION,
        appUrl: 'https://pos.ejemplo',
        copiar,
      });

      expect(copiar).toHaveBeenCalledWith(PRIVADA, PRIVADA.replace('privado/', 'publico/'));
      expect(salida).toEqual({ imagen_url: URL_PUBLICA, nombre: 'Prueba' });
    },
  );

  it('publica sólo los campos de configuración visibles sin sesión', async () => {
    const copiar = vi.fn(async () => undefined);
    const salida = await prepararReferenciasPublicas({
      entidad: 'ConfiguracionNegocio',
      datos: {
        logo_url: URL_PRIVADA,
        logo_ticket_url: URL_PRIVADA,
        background_image_url: URL_PRIVADA,
      },
      organizacionId: ORGANIZACION,
      appUrl: 'https://pos.ejemplo',
      copiar,
    });

    expect(copiar).toHaveBeenCalledTimes(2);
    expect(salida['logo_url']).toBe(URL_PUBLICA);
    expect(salida['background_image_url']).toBe(URL_PUBLICA);
    expect(salida['logo_ticket_url']).toBe(URL_PRIVADA);
  });

  it('rechaza publicar un archivo privado de otra organización', async () => {
    await expect(
      prepararReferenciasPublicas({
        entidad: 'ProductoTerminado',
        datos: {
          imagen_url: URL_PRIVADA.replace(ORGANIZACION, '22222222-2222-4222-8222-222222222222'),
        },
        organizacionId: ORGANIZACION,
        appUrl: 'https://pos.ejemplo',
        copiar: async () => undefined,
      }),
    ).rejects.toMatchObject({ codigo: 'PUENTE_SIN_PERMISO' });
  });

  it('no toca URLs externas ni datos sin imágenes', async () => {
    const copiar = vi.fn(async () => undefined);
    const externos = { imagen_url: 'https://cdn.ejemplo/foto.png' };
    expect(
      await prepararReferenciasPublicas({
        entidad: 'ProductoTerminado',
        datos: externos,
        organizacionId: ORGANIZACION,
        appUrl: 'https://pos.ejemplo',
        copiar,
      }),
    ).toEqual(externos);
    expect(copiar).not.toHaveBeenCalled();
  });

  it('declara en el servidor qué campos se vuelven públicos', () => {
    const fuente = readFileSync(FUENTE, 'utf8');
    expect(fuente).toContain("ProductoTerminado: ['imagen_url']");
    expect(fuente).toContain("MenuQRSeccion: ['imagen_url']");
    expect(fuente).toContain("['logo_url', 'background_image_url', 'background_logo_url']");
    expect(fuente).toContain("privada.replace(/^privado\\//, 'publico/')");
  });
});
