import { describe, expect, it } from 'vitest';

import { ErrorApi, ErrorSinRespuesta } from '~/cliente/api';

import { mensajeDelPin } from './mensaje-del-pin';

/** DP-11.2 · Lo que se dice al teclear el PIN al despertar, según lo que contestó el servidor. */

const fallo = (estado: number, mensaje: string) =>
  new ErrorApi({ codigo: 'REGLA_DE_NEGOCIO', mensaje }, estado, null);

describe('mensajeDelPin', () => {
  it('un PIN equivocado (401) se dice como tal, no con el mensaje del servidor', () => {
    expect(mensajeDelPin(fallo(401, 'Empleado o PIN incorrectos.'))).toBe(
      'Ese no es tu PIN. Vuelve a intentarlo.',
    );
  });

  it('el bloqueo por intentos (429) lleva el mensaje del servidor, con el tiempo que falta', () => {
    expect(mensajeDelPin(fallo(429, 'Demasiados intentos: espera 60 s.'))).toBe(
      'Demasiados intentos: espera 60 s.',
    );
  });

  it('sin conexión no culpa al PIN', () => {
    expect(mensajeDelPin(new ErrorSinRespuesta())).toMatch(/No hay conexión/);
    expect(mensajeDelPin(new ErrorSinRespuesta())).not.toMatch(/no es tu PIN/);
  });

  it('cualquier otro fallo dice el suyo; lo que no es un error, uno genérico', () => {
    expect(mensajeDelPin(fallo(403, 'Tu sesión ya no vale.'))).toBe('Tu sesión ya no vale.');
    expect(mensajeDelPin('raro')).toBe('No se pudo comprobar el PIN.');
  });
});
