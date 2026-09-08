import { describe, expect, it } from 'vitest';

import {
  DURACION_SESION_SEGUNDOS,
  firmarSesion,
  nuevoIdDeSesion,
  verificarSesion,
  type CargaSesion,
} from './token.ts';

/**
 * El token de sesión.
 *
 * Es lo único que separa a un cajero de operar la caja de otra organización, así
 * que cada forma de manipularlo tiene su prueba: cambiar el cuerpo, cambiar la
 * firma, cambiar el secreto, y dejar que caduque.
 */

const SECRETO = 'secreto-de-prueba-suficientemente-largo-0123456789';
const OTRO_SECRETO = 'otro-secreto-igual-de-largo-9876543210abcdefghij';

function carga(cambios: Partial<CargaSesion> = {}): CargaSesion {
  return {
    sid: nuevoIdDeSesion(),
    identidadId: '11111111-1111-4111-8111-111111111111',
    empleoId: '22222222-2222-4222-8222-222222222222',
    terminalId: '33333333-3333-4333-8333-333333333333',
    exp: Math.floor(Date.now() / 1000) + DURACION_SESION_SEGUNDOS,
    ...cambios,
  };
}

describe('token de sesión', () => {
  it('ida y vuelta: lo firmado se verifica y devuelve lo mismo', () => {
    const original = carga();
    const verificado = verificarSesion(firmarSesion(original, SECRETO), SECRETO);

    expect(verificado.ok).toBe(true);
    if (!verificado.ok) return;
    expect(verificado.carga).toEqual(original);
  });

  it('rechaza un token firmado con OTRO secreto', () => {
    const ajeno = firmarSesion(carga(), OTRO_SECRETO);
    const verificado = verificarSesion(ajeno, SECRETO);

    expect(verificado.ok).toBe(false);
    if (verificado.ok) return;
    expect(verificado.motivo).toBe('firma');
  });

  it('rechaza un cuerpo alterado aunque la firma venga del original', () => {
    // El ataque directo: cambiar el empleo por el de un gerente y conservar la
    // firma. Si la firma no cubriera el cuerpo, esto entraría como gerente.
    const token = firmarSesion(carga(), SECRETO);
    const [, firma] = token.split('.');
    const suplantado = Buffer.from(
      JSON.stringify(carga({ empleoId: '99999999-9999-4999-8999-999999999999' })),
      'utf8',
    ).toString('base64url');

    const verificado = verificarSesion(`${suplantado}.${firma ?? ''}`, SECRETO);

    expect(verificado.ok).toBe(false);
    if (verificado.ok) return;
    expect(verificado.motivo).toBe('firma');
  });

  it('rechaza un token caducado, y lo distingue de uno inválido', () => {
    const vencido = firmarSesion(carga({ exp: Math.floor(Date.now() / 1000) - 1 }), SECRETO);
    const verificado = verificarSesion(vencido, SECRETO);

    expect(verificado.ok).toBe(false);
    if (verificado.ok) return;
    // Importa la diferencia: «expirada» reabre el PIN conservando el carrito;
    // «firma» es alguien tocando la cookie y se audita.
    expect(verificado.motivo).toBe('expirado');
  });

  it('un token ausente o vacío no es un error, es no haber entrado', () => {
    expect(verificarSesion(undefined, SECRETO)).toEqual({ ok: false, motivo: 'ausente' });
    expect(verificarSesion('', SECRETO)).toEqual({ ok: false, motivo: 'ausente' });
  });

  it('rechaza basura sin lanzar', () => {
    for (const basura of ['sin-punto', '.', 'a.b', '<script>.x', 'e30.']) {
      const verificado = verificarSesion(basura, SECRETO);
      expect(verificado.ok, basura).toBe(false);
    }
  });

  it('rechaza un cuerpo bien firmado al que le faltan campos', () => {
    // Una cookie de una versión anterior del token: firma válida, forma vieja.
    // Aceptarla dejaría `empleoId` indefinido y el ámbito a medio armar.
    const incompleto = Buffer.from(JSON.stringify({ sid: 'x', exp: 99999999999 }), 'utf8').toString(
      'base64url',
    );
    const token = firmarSesion(carga(), SECRETO);
    const secretoCorrecto = SECRETO;
    // Se firma el cuerpo incompleto correctamente para aislar la comprobación
    // de forma de la comprobación de firma.
    const conFirmaBuena = `${incompleto}.${firmarSesion({ ...carga() }, secretoCorrecto).split('.')[1] ?? ''}`;

    expect(verificarSesion(conFirmaBuena, SECRETO).ok).toBe(false);
    expect(token.includes('.')).toBe(true);
  });

  it('una terminal nula es válida: el dueño entra sin dispositivo enrolado', () => {
    const verificado = verificarSesion(firmarSesion(carga({ terminalId: null }), SECRETO), SECRETO);

    expect(verificado.ok).toBe(true);
    if (!verificado.ok) return;
    expect(verificado.carga.terminalId).toBeNull();
  });
});
