import { beforeEach, describe, expect, it, vi } from 'vitest';

const dobles = vi.hoisted(() => ({
  permitir: vi.fn(),
}));

vi.mock('@morphiqpos/contracts', async () => {
  const original =
    await vi.importActual<typeof import('@morphiqpos/contracts')>('@morphiqpos/contracts');
  return {
    ...original,
    validarEntorno: () => ({
      APP_URL: 'https://pos.example',
      ORGANIZACION: 'morphiqpos',
      PIN_PEPPER: 'pimienta-de-prueba',
      SESSION_SECRET: 'secreto-de-prueba',
      NODE_ENV: 'test',
    }),
  };
});

vi.mock('@morphiqpos/app/http', async () => {
  const original =
    await vi.importActual<typeof import('@morphiqpos/app/http')>('@morphiqpos/app/http');
  return { ...original, permitir: dobles.permitir };
});

import { POST } from '../../app/api/auth/entrar/route.ts';

describe('E · límite del cuerpo de entrada con PIN', () => {
  beforeEach(() => {
    dobles.permitir.mockReset();
    dobles.permitir.mockResolvedValue({ ok: true });
  });

  it('rechaza 256 KiB + 1 antes de intentar decodificar JSON', async () => {
    const peticion = new Request('https://pos.example/api/auth/entrar', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(256 * 1024 + 1),
        origin: 'https://pos.example',
        'x-morphiqpos-request': '1',
      },
      body: '{}',
    });
    const json = vi.spyOn(peticion, 'json');

    const respuesta = await POST(peticion);

    expect(respuesta.status).toBe(413);
    await expect(respuesta.json()).resolves.toMatchObject({
      ok: false,
      error: { codigo: 'CUERPO_DEMASIADO_GRANDE' },
    });
    expect(json).not.toHaveBeenCalled();
  });
});
