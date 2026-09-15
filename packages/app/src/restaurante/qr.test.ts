import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { entidadMapeada } from '../puente/mapa.ts';
import { contextoFalso, crearBaseFalsa } from './pruebas/base-falsa.ts';
import { ambitoDe, mesa, MESA_5, ORG } from './pruebas/sala.ts';
import { entradaRotarQr, rotarQr } from './qr.ts';

const UTILIDAD =
  process.env['MORPHIQPOS_QR_UTIL_SOURCE_PATH'] ??
  fileURLToPath(new URL('../../../../apps/web/heredado/utils/qrUtils.js', import.meta.url));
const COMANDO =
  process.env['MORPHIQPOS_QR_COMMAND_SOURCE_PATH'] ??
  fileURLToPath(new URL('./qr.ts', import.meta.url));
const MAPA =
  process.env['MORPHIQPOS_MAPA_SOURCE_PATH'] ??
  fileURLToPath(new URL('../puente/mapa.ts', import.meta.url));
const PESTANA_MESAS =
  process.env['MORPHIQPOS_QR_TABLES_SOURCE_PATH'] ??
  fileURLToPath(
    new URL('../../../../apps/web/heredado/components/portalqr/MesasQRTab.jsx', import.meta.url),
  );

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'NO_LANZO';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`;
  }
}

describe('restaurante.rotar_qr', () => {
  it('genera en servidor 24 bytes aleatorios en base64url', async () => {
    const base = crearBaseFalsa({ mesas: [mesa('libre', { qr_token: null })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'));

    const primera = await rotarQr.ejecutar(ctx, { mesaId: MESA_5 });
    const segunda = await rotarQr.ejecutar(ctx, { mesaId: MESA_5 });

    expect(primera.qrToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(segunda.qrToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(segunda.qrToken).not.toBe(primera.qrToken);
    expect(base.campo('mesas', 'qr_token')).toBe(segunda.qrToken);

    const codigo = readFileSync(COMANDO, 'utf8');
    expect(codigo).toContain("randomBytes(24).toString('base64url')");
  });

  it('una mesa de otra organización no existe para el comando', async () => {
    const base = crearBaseFalsa({
      mesas: [mesa('libre', { organizacion_id: '99999999-9999-4999-8999-999999999999' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    expect(await codigoDe(rotarQr.ejecutar(ctx, { mesaId: MESA_5 }))).toBe('MESA_NO_ENCONTRADA');
  });

  it('sólo admite dirección y la entrada no puede elegir ámbito ni token', () => {
    expect(rotarQr.nombre).toBe('restaurante.rotar_qr');
    expect(rotarQr.roles).toEqual(['dueno', 'administrador', 'gerente']);
    expect(Object.keys(entradaRotarQr.shape)).toEqual(['mesaId']);
    expect(entradaRotarQr.safeParse({ mesaId: ORG, qrToken: 'elegido' }).success).toBe(true);
  });

  it('el puente no acepta escribir qr_token directamente', () => {
    expect(entidadMapeada('Mesa')?.campos['qr_token']?.escribible).toBe(false);

    const codigo = readFileSync(MAPA, 'utf8');
    expect(codigo).toMatch(/qr_token:\s*\{[\s\S]{0,220}?escribible:\s*false/);
  });

  it('el legado pide la rotación al comando y ya no deriva el token', () => {
    const codigo = readFileSync(UTILIDAD, 'utf8');
    expect(codigo).toContain('/api/restaurante/rotar-qr');
    expect(codigo).not.toContain('charCodeAt');
    expect(codigo).not.toContain('toString(36)');
  });

  it('las dos acciones de Mesas QR esperan el token emitido por el servidor', () => {
    const codigo = readFileSync(PESTANA_MESAS, 'utf8');

    expect(codigo).not.toContain('api.entidades.Mesa.update(mesa.id, { qr_token:');
    expect(codigo).not.toContain('api.entidades.Mesa.update(m.id, { qr_token:');
    expect(codigo.match(/generarTokenMesa\(/g)).toHaveLength(2);
    expect(codigo).toMatch(/const token = await generarTokenMesa\(mesa\.id\)/);
    expect(codigo).toMatch(/pendientes\.map\(\(m\) => generarTokenMesa\(m\.id\)\)/);
  });
});
