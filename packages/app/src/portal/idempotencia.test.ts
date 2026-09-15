import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { alcanceIdempotenciaPortal } from './idempotencia.ts';

const FUENTE_COMANDO =
  process.env['MORPHIQPOS_PUBLIC_COMMAND_SOURCE_PATH'] ??
  fileURLToPath(new URL('./comando-publico.ts', import.meta.url));
const FUENTE_IDEMPOTENCIA =
  process.env['MORPHIQPOS_PORTAL_IDEMPOTENCY_SOURCE_PATH'] ??
  fileURLToPath(new URL('./idempotencia.ts', import.meta.url));

describe('R-18 · idempotencia del portal aislada por mesa', () => {
  it('la misma clave e input producen alcances distintos en mesas distintas', () => {
    const primera = alcanceIdempotenciaPortal('mesa-1', 'cliente-clave-123', {
      tipo: 'ayuda',
    });
    const segunda = alcanceIdempotenciaPortal('mesa-2', 'cliente-clave-123', {
      tipo: 'ayuda',
    });

    expect(primera.clave).not.toBe(segunda.clave);
    expect(primera.huellaEntrada).not.toBe(segunda.huellaEntrada);
    expect(primera.clave).toHaveLength(64);
    expect(primera.huellaEntrada).toHaveLength(64);
  });

  it('el envoltorio usa el alcance de mesa en lectura, reclamo, cierre y reintento', () => {
    const fuente = readFileSync(FUENTE_COMANDO, 'utf8');
    expect(fuente).toContain('alcanceIdempotenciaPortal(ambito.mesaId, clave, validada.datos)');
    expect(fuente.match(/idempotencyKey: idempotencia\.clave/g)).toHaveLength(3);
    expect(fuente).toContain('huellaEntrada: idempotencia.huellaEntrada');

    const alcance = readFileSync(FUENTE_IDEMPOTENCIA, 'utf8');
    expect(alcance).toContain('clave: huella({ mesaId, claveCliente })');
    expect(alcance).toContain('huellaEntrada: huella({ mesaId, entrada })');
  });
});
