import { describe, expect, it } from 'vitest';

import { sembrarNegocio, sembrarSucursal } from '../pruebas/negocio-real.ts';
import { resolverTerminal } from './entrar.ts';

/**
 * EL MISMO NAVEGADOR ES LA MISMA TERMINAL, aunque entre en otro negocio (21-10-2026).
 *
 * El dueño general pasa de un negocio a otro desde el mismo navegador. Cada negocio nuevo
 * acuñaba su propio token y pisaba la cookie: al volver al restaurante, el navegador ya era
 * una terminal desconocida («Caja 20», «Caja 21»…) y la caja que había abierto se quedaba
 * en la terminal vieja, sin poder cobrar ni abrir otra. El token se conserva.
 */

const PIMIENTA = 'pimienta-de-prueba-terminal-estable';

function entrarCon(organizacionId: string, empleoId: string, deviceToken: string) {
  return {
    empleoId,
    organizacionId,
    pin: '',
    deviceToken,
    pimienta: PIMIENTA,
    secretoSesion: 'secreto-de-prueba-terminal-estable',
  };
}

describe('la terminal de un navegador entre negocios', () => {
  it('conserva el token al entrar en otro negocio y vuelve a su terminal', async () => {
    const restaurante = await sembrarNegocio({ nombre: 'Restaurante Estable', rol: 'dueno' });
    const cafeteria = await sembrarNegocio({ nombre: 'Cafetería Estable', rol: 'dueno' });
    const enRestaurante = await sembrarSucursal(restaurante, { terminales: [] });
    const enCafeteria = await sembrarSucursal(cafeteria, { terminales: [] });
    const ahora = new Date();

    const primera = await resolverTerminal(
      entrarCon(restaurante.organizacionId, restaurante.empleoId, ''),
      enRestaurante.sucursalId,
      ahora,
    );
    expect(primera.terminalId).not.toBeNull();
    expect(primera.deviceToken).not.toBeNull();
    const token = primera.deviceToken ?? '';

    const enOtroNegocio = await resolverTerminal(
      entrarCon(cafeteria.organizacionId, cafeteria.empleoId, token),
      enCafeteria.sucursalId,
      ahora,
    );
    expect(enOtroNegocio.terminalId).not.toBe(primera.terminalId);
    // El mismo token: la cookie no cambia y el restaurante lo sigue reconociendo.
    expect(enOtroNegocio.deviceToken).toBe(token);

    const deVuelta = await resolverTerminal(
      entrarCon(restaurante.organizacionId, restaurante.empleoId, token),
      enRestaurante.sucursalId,
      ahora,
    );
    expect(deVuelta).toEqual({ terminalId: primera.terminalId, deviceToken: null });
  });

  it('no adopta un token con otra forma: acuña uno nuevo', async () => {
    const negocio = await sembrarNegocio({ nombre: 'Tienda Estable', rol: 'dueno' });
    const { sucursalId } = await sembrarSucursal(negocio, { terminales: [] });

    const resultado = await resolverTerminal(
      entrarCon(negocio.organizacionId, negocio.empleoId, 'inventado'),
      sucursalId,
      new Date(),
    );
    expect(resultado.deviceToken).not.toBe('inventado');
    expect(resultado.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
