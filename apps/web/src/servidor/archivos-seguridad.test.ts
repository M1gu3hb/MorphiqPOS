import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { crearClavePrivada, esClaveArchivo, generarUuidV7 } from './archivos-claves.ts';
import { archivoDeMultipart, leerCuerpoAcotado } from './archivos-multipart.ts';
import { peticionMultipartValida } from './seguridad-http.ts';

const RUTA =
  process.env['MORPHIQPOS_UPLOAD_ROUTE_PATH'] ??
  resolve(process.cwd(), 'apps/web/app/api/archivos/subir/route.ts');
const CLIENTE_REAL =
  process.env['MORPHIQPOS_IMAGE_UPLOADER_SOURCE_PATH'] ??
  resolve(process.cwd(), 'apps/web/heredado/components/common/ImageUploader.jsx');
const MENU =
  process.env['MORPHIQPOS_MENU_QR_SOURCE_PATH'] ??
  resolve(process.cwd(), 'apps/web/heredado/components/portalqr/MenuQRTab.jsx');
const CLAVES =
  process.env['MORPHIQPOS_FILE_KEYS_SOURCE_PATH'] ??
  resolve(process.cwd(), 'apps/web/src/servidor/archivos-claves.ts');
const SEGURIDAD_HTTP =
  process.env['MORPHIQPOS_UPLOAD_SECURITY_SOURCE_PATH'] ??
  resolve(process.cwd(), 'apps/web/src/servidor/seguridad-http.ts');

describe('frontera HTTP de archivos', () => {
  it('acepta sólo multipart propio y del origen configurado', () => {
    const valida = new Request('https://pos.ejemplo/api/archivos/subir', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=abc',
        'x-morphiqpos-request': '1',
        origin: 'https://pos.ejemplo',
      },
    });
    expect(peticionMultipartValida(valida, 'https://pos.ejemplo')).toBe(true);

    for (const headers of [
      { 'content-type': 'application/json', 'x-morphiqpos-request': '1' },
      { 'content-type': 'multipart/form-data; boundary=abc' },
      {
        'content-type': 'multipart/form-data; boundary=abc',
        'x-morphiqpos-request': '1',
        origin: 'https://atacante.ejemplo',
      },
    ]) {
      const peticion = new Request('https://pos.ejemplo/api/archivos/subir', {
        method: 'POST',
        headers,
      });
      expect(peticionMultipartValida(peticion, 'https://pos.ejemplo')).toBe(false);
    }
  });

  it('rechaza por Content-Length antes de leer y corta un cuerpo mentiroso', async () => {
    const enorme = new Request('https://pos.ejemplo/api/archivos/subir', {
      method: 'POST',
      headers: { 'content-length': '101' },
      body: new ReadableStream({
        pull(control) {
          control.enqueue(new Uint8Array([1]));
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(leerCuerpoAcotado(enorme, 100)).rejects.toMatchObject({
      codigo: 'CUERPO_DEMASIADO_GRANDE',
    });
    expect(enorme.bodyUsed).toBe(false);

    const mentiroso = new Request('https://pos.ejemplo/api/archivos/subir', {
      method: 'POST',
      headers: { 'content-length': '2' },
      body: new Uint8Array([1, 2, 3]),
    });
    await expect(leerCuerpoAcotado(mentiroso, 2)).rejects.toMatchObject({
      codigo: 'CUERPO_DEMASIADO_GRANDE',
    });
  });

  it('extrae únicamente el campo archivo de un multipart acotado', async () => {
    const formulario = new FormData();
    formulario.set('archivo', new File([Uint8Array.from([1, 2, 3])], '../ataque.svg'));
    const codificada = new Request('http://multipart.local', { method: 'POST', body: formulario });
    const tipo = codificada.headers.get('content-type');
    const cuerpo = await codificada.arrayBuffer();
    const peticion = new Request('http://multipart.local', {
      method: 'POST',
      headers: { 'content-type': tipo ?? '', 'content-length': String(cuerpo.byteLength) },
      body: cuerpo,
    });

    const archivo = await archivoDeMultipart(peticion, cuerpo.byteLength);
    expect(new Uint8Array(await archivo.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('genera la ruta con organización, fecha, UUIDv7 y extensión del servidor', () => {
    const uuid = generarUuidV7(new Date('2026-09-11T12:00:00Z'), () =>
      Uint8Array.from({ length: 10 }, (_, indice) => indice + 1),
    );
    expect(uuid[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
    expect(
      crearClavePrivada(
        '11111111-1111-4111-8111-111111111111',
        'png',
        new Date('2026-09-11'),
        uuid,
      ),
    ).toBe(`privado/11111111-1111-4111-8111-111111111111/2026/09/${uuid}.png`);
    expect(
      esClaveArchivo(`privado/11111111-1111-4111-8111-111111111111/2026/09/${uuid}.png`, 'privado'),
    ).toBe(true);
    expect(esClaveArchivo(`privado/../2026/09/${uuid}.png`, 'privado')).toBe(false);
  });

  it('cablea sesión, rol, tasa, cuota y 5 MB en la ruta y en ambos clientes', () => {
    const ruta = readFileSync(RUTA, 'utf8');
    expect(ruta).toContain('conSesionMultipart');
    expect(ruta).toContain("['dueno', 'administrador', 'gerente']");
    expect(ruta).toMatch(/permitirOrganizacion\(\s*'archivos'/);
    expect(ruta).toContain('CUOTA_ORGANIZACION_BYTES');
    expect(ruta).toContain('const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024');
    expect(ruta).toContain('bytesBajo(`privado/${sesion.organizacionId}/`)');
    expect(ruta).toContain('if (usados + imagen.bytes.byteLength > CUOTA_ORGANIZACION_BYTES)');
    expect(ruta).not.toContain('archivo.name');
    expect(ruta).not.toContain('archivo.type');

    expect(readFileSync(CLIENTE_REAL, 'utf8')).toContain('maxMB = 5');
    const menu = readFileSync(MENU, 'utf8');
    expect(menu).toContain('5 * 1024 * 1024');
    expect(menu).toContain('Máximo 5 MB');
    expect(readFileSync(CLAVES, 'utf8')).toContain('`privado/${organizacionId}/');
    expect(readFileSync(SEGURIDAD_HTTP, 'utf8')).toContain("startsWith('multipart/form-data;')");
  });
});
