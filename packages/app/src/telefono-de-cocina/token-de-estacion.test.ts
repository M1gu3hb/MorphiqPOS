import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  firmarTokenDeEstacion,
  LARGO_MAXIMO_DEL_TOKEN,
  leerTokenDeEstacion,
  type ContenidoDelToken,
} from './token-de-estacion.ts';

/**
 * DP-9.4 · EL TOKEN DEL TELÉFONO DE COCINA.
 *
 * Lo firma el servidor; nadie lo inventa ni le cambia la estación, el negocio, el día o la
 * versión sin que la firma lo note. El día y la versión vigentes los compara quien lo lee.
 */
const PIMIENTA = 'pimienta-de-la-prueba-del-telefono-de-cocina-01';
const CONTENIDO: ContenidoDelToken = {
  organizacionId: '617ec3ad-cdc5-46d4-8d71-a1ed479c496b',
  estacionId: 'a3f1c0de-0000-4000-8000-000000000001',
  dia: '2026-10-26',
  version: 3,
};

describe('el token de una estación', () => {
  it('lo que se firma es lo que se lee', () => {
    expect(leerTokenDeEstacion(firmarTokenDeEstacion(CONTENIDO, PIMIENTA), PIMIENTA)).toEqual(
      CONTENIDO,
    );
  });

  it('con otra pimienta no vale: el de otro despliegue no abre éste', () => {
    const token = firmarTokenDeEstacion(CONTENIDO, PIMIENTA);
    expect(leerTokenDeEstacion(token, 'otra-pimienta-de-otro-despliegue-000000000')).toBeNull();
  });

  it('cambiarle la estación, el día o la versión rompe la firma', () => {
    const [, firma] = firmarTokenDeEstacion(CONTENIDO, PIMIENTA).split('.');
    for (const cambio of [
      { ...CONTENIDO, estacionId: 'a3f1c0de-0000-4000-8000-000000000002' },
      { ...CONTENIDO, dia: '2026-10-27' },
      { ...CONTENIDO, version: 4 },
    ]) {
      const [cuerpo] = firmarTokenDeEstacion(cambio, PIMIENTA).split('.');
      expect(leerTokenDeEstacion(`${cuerpo ?? ''}.${firma ?? ''}`, PIMIENTA)).toBeNull();
    }
  });

  it('basura, vacío, demasiado largo o con piezas de más: nada', () => {
    const token = firmarTokenDeEstacion(CONTENIDO, PIMIENTA);
    for (const malo of [
      '',
      'no-es-un-token',
      `${token}.extra`,
      'x'.repeat(LARGO_MAXIMO_DEL_TOKEN + 1),
      `${token.slice(0, -2)}AA`,
    ]) {
      expect(leerTokenDeEstacion(malo, PIMIENTA)).toBeNull();
    }
  });

  it('un cuerpo bien firmado pero que no es un token tampoco se acepta', () => {
    for (const cuerpo of [
      JSON.stringify({ o: 'no-uuid', e: 'x', d: 'hoy', v: 0 }),
      JSON.stringify({
        ...{ o: CONTENIDO.organizacionId, e: CONTENIDO.estacionId, d: CONTENIDO.dia, v: 1 },
        admin: true,
      }),
      'esto no es json',
    ]) {
      expect(leerTokenDeEstacion(firmadoAMano(cuerpo), PIMIENTA)).toBeNull();
    }
  });
});

/** Firma un cuerpo cualquiera como lo haría el servidor: para probar lo que la firma no cubre. */
function firmadoAMano(json: string): string {
  const cuerpo = Buffer.from(json, 'utf8').toString('base64url');
  const llave = createHmac('sha256', PIMIENTA).update('cocina-telefono:v1', 'utf8').digest();
  return `${cuerpo}.${createHmac('sha256', llave).update(cuerpo, 'utf8').digest('base64url')}`;
}
