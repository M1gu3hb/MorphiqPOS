import { describe, expect, it, vi } from 'vitest';

import { registrar } from './observabilidad.ts';

describe('registro estructurado de datos', () => {
  it('serializa sólo el contexto seguro entregado por el llamador', () => {
    const escribir = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const evento = {
      nivel: 'error' as const,
      modulo: 'postgres_pool',
      correlationId: 'sin_correlacion',
      organizacionId: null,
      mensaje: 'El pool informó un error.',
    };

    registrar(evento);

    expect(escribir).toHaveBeenCalledOnce();
    expect(escribir).toHaveBeenCalledWith(JSON.stringify(evento));
  });
});
