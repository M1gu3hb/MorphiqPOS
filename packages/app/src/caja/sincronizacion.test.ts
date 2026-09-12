import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { encolarSincronizacionCorte } from './sincronizacion.ts';

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const OTRA_ORGANIZACION = '99999999-9999-4999-8999-999999999999';
const CORTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AHORA = new Date('2026-09-11T18:00:00.000Z');
const CAJA =
  process.env['MORPHIQPOS_CAJA_LEGACY_SOURCE_PATH'] ??
  fileURLToPath(new URL('../../../../apps/web/heredado/pages/Caja.jsx', import.meta.url));

function corte(organizacionId = ORGANIZACION, estado = 'cerrada'): Fila {
  return {
    id: CORTE,
    organizacion_id: organizacionId,
    sucursal_id: '22222222-2222-4222-8222-222222222222',
    terminal_id: '33333333-3333-4333-8333-333333333333',
    estado,
    serie: 'CC',
    folio: 7n,
    abierta_en: new Date('2026-09-11T10:00:00.000Z'),
    cerrada_en: AHORA,
    fondo_inicial_centavos: 100_000n,
    efectivo_contado_centavos: 120_000n,
    efectivo_retirado_centavos: null,
  };
}

function ambito() {
  return {
    organizacionId: ORGANIZACION,
    sucursalId: '22222222-2222-4222-8222-222222222222',
    terminalId: '33333333-3333-4333-8333-333333333333',
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: '55555555-5555-4555-8555-555555555555',
    rol: 'cajero' as const,
  };
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'NO_LANZO';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`;
  }
}

describe('caja.encolar_sincronizacion_corte', () => {
  it('crea exactamente los dos trabajos fijos para un corte cerrado propio', async () => {
    const base = crearBaseFalsa({ sesiones_caja: [corte()], bitacora_sincronizacion: [] });
    const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

    const salida = await encolarSincronizacionCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida).toEqual({ encolados: 2 });
    expect(base.filas('bitacora_sincronizacion')).toMatchObject([
      {
        organizacion_id: ORGANIZACION,
        tipo_registro: 'cash_cut',
        registro_id: CORTE,
        destino: 'google_sheets',
      },
      {
        organizacion_id: ORGANIZACION,
        tipo_registro: 'cash_cut_pdf',
        registro_id: CORTE,
        destino: 'google_drive',
      },
    ]);
  });

  it('un corte ajeno o todavía abierto no encola nada', async () => {
    for (const fila of [corte(OTRA_ORGANIZACION), corte(ORGANIZACION, 'abierta')]) {
      const base = crearBaseFalsa({ sesiones_caja: [fila], bitacora_sincronizacion: [] });
      const { ctx } = contextoFalso(base.tx, ambito(), AHORA);

      expect(await codigoDe(encolarSincronizacionCorte.ejecutar(ctx, { corteId: CORTE }))).toBe(
        'CORTE_NO_ENCONTRADO',
      );
      expect(base.filas('bitacora_sincronizacion')).toHaveLength(0);
    }
  });

  it('Caja usa el comando y ya no escribe directamente la bitácora', () => {
    const codigo = readFileSync(CAJA, 'utf8');

    expect(codigo).toContain("api.comandos.ejecutar('/api/caja/encolar-sincronizacion'");
    expect(codigo).not.toContain('api.entidades.IntegrationSyncLog.create');
  });
});
