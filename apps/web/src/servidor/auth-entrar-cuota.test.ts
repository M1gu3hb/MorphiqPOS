import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../../app/api/auth/entrar/route';

/**
 * La cuota de entrada de la red cuenta los PIN que FALLAN (`LIMITES.entrar`).
 *
 * El intento se cuenta antes de verificar (`permitir`) y la entrada correcta lo devuelve
 * (`devolver`). Contaba todas: con todas las cajas de un negocio detrás de la misma IP, la
 * tableta que pasa de mesero en mesero gastaba las veinte entrando bien, y la red entera
 * se quedaba sin entrar cinco minutos. Lo que falla —PIN equivocado, credencial bloqueada,
 * empleo de otro negocio, cuerpo mal formado— conserva su intento.
 */

const ORGANIZACION = '33dad5ff-ffea-44a5-abd4-cce8019098a7';
const EMPLEO = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';

const dobles = vi.hoisted(() => ({
  permitir: vi.fn(),
  devolver: vi.fn(),
  entrarConPin: vi.fn(),
  organizacionDeQuienEntra: vi.fn(),
  // La estación de la sesión (DP-10.1) se lee de la base; aquí no hay base y no es lo que se mide.
  leerEstacionDeLaSesion: vi.fn(() =>
    Promise.resolve({
      estacion_preparacion_id: null,
      estacion_preparacion_nombre: null,
      estacion_preparacion_color: null,
      puede_ver_todas_estaciones: false,
    }),
  ),
}));

vi.mock('@morphiqpos/contracts', async () => {
  const original =
    await vi.importActual<typeof import('@morphiqpos/contracts')>('@morphiqpos/contracts');
  return {
    ...original,
    validarEntorno: () => ({
      APP_URL: 'https://pos.example',
      ORGANIZACION: 'demo-acople-restaurante',
      PIN_PEPPER: 'pimienta-de-prueba',
      SESSION_SECRET: 'secreto-de-prueba',
      NODE_ENV: 'test',
    }),
  };
});

vi.mock('@morphiqpos/app/http', async () => {
  const original =
    await vi.importActual<typeof import('@morphiqpos/app/http')>('@morphiqpos/app/http');
  return { ...original, permitir: dobles.permitir, devolver: dobles.devolver };
});

vi.mock('@morphiqpos/app/identidad', async () => {
  const original = await vi.importActual<typeof import('@morphiqpos/app/identidad')>(
    '@morphiqpos/app/identidad',
  );
  return {
    ...original,
    entrarConPin: dobles.entrarConPin,
    organizacionDeQuienEntra: dobles.organizacionDeQuienEntra,
    leerEstacionDeLaSesion: dobles.leerEstacionDeLaSesion,
  };
});

vi.mock('@morphiqpos/app/negocio', async () => {
  const original =
    await vi.importActual<typeof import('@morphiqpos/app/negocio')>('@morphiqpos/app/negocio');
  return {
    ...original,
    negociosDelDespliegue: () =>
      Promise.resolve([
        {
          organizacionId: ORGANIZACION,
          nombre: 'Demo del acople · restaurante',
          slug: 'demo-acople-restaurante',
        },
      ]),
  };
});

// El restaurante no está en presentación: la entrada sigue como siempre (21-10).
vi.mock('@morphiqpos/app/presentacion', () => ({
  sesionDePresentacion: () => Promise.resolve(null),
}));
vi.mock('@morphiqpos/app/configuracion', async () => {
  const original = await vi.importActual<typeof import('@morphiqpos/app/configuracion')>(
    '@morphiqpos/app/configuracion',
  );
  return { ...original, terminosDeLaOrganizacion: () => Promise.resolve(null) };
});

function entrar(cuerpo: unknown): Request {
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  return new Request('https://pos.example/api/auth/entrar', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(texto)),
      origin: 'https://pos.example',
      'x-morphiqpos-request': '1',
      'x-vercel-forwarded-for': '203.0.113.7',
    },
    body: texto,
  });
}

describe('la cuota de entrada cuenta los PIN que fallan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dobles.permitir.mockResolvedValue({ ok: true, esperaSegundos: 0 });
    dobles.devolver.mockResolvedValue(undefined);
    dobles.organizacionDeQuienEntra.mockResolvedValue(ORGANIZACION);
  });

  it('el PIN correcto devuelve su intento, al cubo de la misma red', async () => {
    dobles.entrarConPin.mockResolvedValue({
      ok: true,
      token: 'token-de-sesion',
      maxEdadSegundos: 3600,
      organizacionId: ORGANIZACION,
      rol: 'mesero',
      nombre: 'Toño',
    });
    const peticion = entrar({ empleoId: EMPLEO, pin: '1234' });

    const respuesta = await POST(peticion);

    expect(respuesta.status).toBe(200);
    expect(dobles.permitir).toHaveBeenCalledTimes(1);
    expect(dobles.devolver).toHaveBeenCalledTimes(1);
    expect(dobles.devolver).toHaveBeenCalledWith('entrar', peticion.headers, 'pimienta-de-prueba');
    expect(dobles.permitir.mock.calls[0]?.[1]).toBe(dobles.devolver.mock.calls[0]?.[1]);
  });

  it('el PIN equivocado conserva su intento', async () => {
    dobles.entrarConPin.mockResolvedValue({ ok: false, motivo: 'credenciales' });

    const respuesta = await POST(entrar({ empleoId: EMPLEO, pin: '9999' }));

    expect(respuesta.status).toBe(401);
    expect(dobles.devolver).not.toHaveBeenCalled();
  });

  it('la credencial bloqueada conserva su intento', async () => {
    dobles.entrarConPin.mockResolvedValue({ ok: false, motivo: 'bloqueada', esperaSegundos: 60 });

    const respuesta = await POST(entrar({ empleoId: EMPLEO, pin: '9999' }));

    expect(respuesta.status).toBe(429);
    expect(dobles.devolver).not.toHaveBeenCalled();
  });

  it('el empleo de otro negocio conserva su intento y ni se verifica', async () => {
    dobles.organizacionDeQuienEntra.mockResolvedValue(null);

    const respuesta = await POST(entrar({ empleoId: EMPLEO, pin: '1234' }));

    expect(respuesta.status).toBe(401);
    expect(dobles.entrarConPin).not.toHaveBeenCalled();
    expect(dobles.devolver).not.toHaveBeenCalled();
  });

  it('el cuerpo mal formado conserva su intento', async () => {
    const malFormado = await POST(entrar('{no es json'));
    const sinPin = await POST(entrar({ empleoId: EMPLEO }));

    expect(malFormado.status).toBe(400);
    expect(sinPin.status).toBe(401);
    expect(dobles.devolver).not.toHaveBeenCalled();
  });

  it('con la red agotada no se verifica nada ni se devuelve nada', async () => {
    dobles.permitir.mockResolvedValue({ ok: false, esperaSegundos: 240 });

    const respuesta = await POST(entrar({ empleoId: EMPLEO, pin: '1234' }));

    expect(respuesta.status).toBe(429);
    expect(dobles.entrarConPin).not.toHaveBeenCalled();
    expect(dobles.devolver).not.toHaveBeenCalled();
  });
});
