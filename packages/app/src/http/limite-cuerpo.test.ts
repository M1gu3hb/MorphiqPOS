import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { crearSolicitudQR } from '../portal/solicitudes.ts';
import { manejadorPublico } from '../portal/http.ts';
import { rotarQr } from '../restaurante/qr.ts';
import { cuerpoDentroDelLimite } from './limite-cuerpo.ts';
import { rutaDeComando } from './ruta.ts';

const FUENTE_LIMITE =
  process.env['MORPHIQPOS_BODY_LIMIT_SOURCE_PATH'] ??
  fileURLToPath(new URL('./limite-cuerpo.ts', import.meta.url));
const FUENTE_RUTA =
  process.env['MORPHIQPOS_COMMAND_ROUTE_SOURCE_PATH'] ??
  fileURLToPath(new URL('./ruta.ts', import.meta.url));
const FUENTE_PORTAL =
  process.env['MORPHIQPOS_PORTAL_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('../portal/http.ts', import.meta.url));
const FUENTE_WEB =
  process.env['MORPHIQPOS_WEB_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('../../../../apps/web/src/servidor/http.ts', import.meta.url));

describe('C-10 · límite compartido del cuerpo HTTP', () => {
  it('acepta hasta 256 KiB y rechaza 50 MiB o una longitud inválida', () => {
    expect(cuerpoDentroDelLimite(new Headers())).toBe(true);
    expect(cuerpoDentroDelLimite(new Headers({ 'content-length': String(256 * 1024) }))).toBe(true);
    expect(cuerpoDentroDelLimite(new Headers({ 'content-length': String(50 * 1024 * 1024) }))).toBe(
      false,
    );
    expect(cuerpoDentroDelLimite(new Headers({ 'content-length': 'mucho' }))).toBe(false);
    expect(readFileSync(FUENTE_LIMITE, 'utf8')).toContain('256 * 1024');
  });

  it('se ejecuta antes de json() en las cuatro vías auditadas', () => {
    const web = readFileSync(FUENTE_WEB, 'utf8');
    const ruta = readFileSync(FUENTE_RUTA, 'utf8');
    const portal = readFileSync(FUENTE_PORTAL, 'utf8');
    const guardaRuta = ruta.indexOf('cuerpoDentroDelLimite(peticion.headers)');
    const guardaPortal = portal.indexOf('cuerpoDentroDelLimite(peticion.headers)');

    expect(web.match(/cuerpoDentroDelLimite\(peticion\.headers\)/g)).toHaveLength(2);
    expect(guardaRuta).toBeGreaterThanOrEqual(0);
    expect(guardaRuta).toBeLessThan(ruta.indexOf('peticion.json()'));
    expect(guardaPortal).toBeGreaterThanOrEqual(0);
    expect(guardaPortal).toBeLessThan(portal.indexOf('peticion.json()'));
  });

  it('un cuerpo declarado de 50 MiB recibe 413 sin invocar el parser', async () => {
    let parseos = 0;
    const cabeceras = new Headers({
      'content-length': String(50 * 1024 * 1024),
      'content-type': 'application/json',
      origin: 'https://pos.example',
      'x-morphiqpos-request': '1',
    });
    const json = async (): Promise<unknown> => {
      parseos += 1;
      return {};
    };

    const privada = await rutaDeComando(rotarQr, { secreto: 's'.repeat(32) })({
      method: 'POST',
      headers: cabeceras,
      json,
    });
    const publica = await manejadorPublico(crearSolicitudQR)('token', {
      method: 'POST',
      url: 'https://pos.example/api/publico/qr/token/solicitud',
      headers: cabeceras,
      json,
    });

    expect(privada.estado).toBe(413);
    expect(publica.estado).toBe(413);
    expect(parseos).toBe(0);
  });
});
