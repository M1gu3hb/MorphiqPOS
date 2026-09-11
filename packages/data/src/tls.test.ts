import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RAIZ_SUPABASE } from './certificados/supabase-root-2021.ts';
import { tlsPara } from './tls.ts';

const FUENTE =
  process.env['MORPHIQPOS_TLS_SOURCE_PATH'] ?? fileURLToPath(new URL('./tls.ts', import.meta.url));

describe('TLS de Postgres', () => {
  it.each([
    'postgresql://usuario:clave@localhost:5432/base',
    'postgresql://usuario:clave@127.0.0.1:5432/base',
    'postgresql://usuario:clave@[::1]:5432/base',
  ])('sólo omite TLS para el host local exacto: %s', (cadena) => {
    expect(tlsPara(cadena)).toBe(false);
  });

  it.each([
    'postgresql://usuario:clave@localhost.ejemplo.com:5432/base',
    'postgresql://localhost@db.ejemplo.com:5432/base',
    'postgresql://usuario:clave@db.ejemplo.com:5432/localhost',
  ])('mantiene TLS para una coincidencia parcial: %s', (cadena) => {
    expect(tlsPara(cadena)).not.toBe(false);
  });

  it('amplía las raíces del sistema con la raíz de Supabase', () => {
    const tls = tlsPara('postgresql://usuario:clave@db.ejemplo.com:5432/base');
    expect(tls).not.toBe(false);
    if (tls === false) return;
    expect(tls.rejectUnauthorized).toBe(true);
    expect(tls.ca).toEqual([...rootCertificates, RAIZ_SUPABASE]);

    const fuente = readFileSync(FUENTE, 'utf8');
    expect(fuente).toContain('new URL(cadena).hostname');
    expect(fuente).toContain('[...rootCertificates, RAIZ_SUPABASE]');
  });
});
