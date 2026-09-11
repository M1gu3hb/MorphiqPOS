import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { correlationIdDe, registrar } from './observabilidad.ts';

describe('registro estructurado del backend', () => {
  it('mantiene una linea JSON en lugar de volver al texto libre', () => {
    const ruta =
      process.env['MORPHIQPOS_LOGGER_SOURCE_PATH'] ??
      resolve(process.cwd(), 'packages/app/src/observabilidad.ts');
    expect(readFileSync(ruta, 'utf8')).toContain('console.error(JSON.stringify(evento))');
  });

  it('emite una sola linea JSON con el contexto operativo completo', () => {
    const escribir = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    registrar({
      nivel: 'error',
      modulo: 'comando',
      correlationId: '11111111-1111-4111-8111-111111111111',
      organizacionId: '22222222-2222-4222-8222-222222222222',
      mensaje: 'venta.crear fallo',
    });

    expect(escribir).toHaveBeenCalledTimes(1);
    expect(escribir).toHaveBeenCalledWith(
      JSON.stringify({
        nivel: 'error',
        modulo: 'comando',
        correlationId: '11111111-1111-4111-8111-111111111111',
        organizacionId: '22222222-2222-4222-8222-222222222222',
        mensaje: 'venta.crear fallo',
      }),
    );
  });

  it('produce un UUID cuando la cabecera no contiene uno valido', () => {
    expect(correlationIdDe('<script>alert(1)</script>')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('conserva un UUID valido para unir respuesta, auditoria y registro', () => {
    const correlationId = '33333333-3333-4333-8333-333333333333';
    expect(correlationIdDe(correlationId)).toBe(correlationId);
  });
});
