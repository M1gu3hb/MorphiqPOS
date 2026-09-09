import { describe, expect, it } from 'vitest';

import {
  esperaTrasFallo,
  FORMA_PIN,
  hashearPin,
  INTENTOS_ANTES_DE_BLOQUEAR,
  verificarPin,
} from './pin.ts';

/**
 * Pruebas del PIN.
 *
 * La primera es la que faltaba y costó tres sesiones: **hashear y verificar
 * tienen que cerrar el círculo.** Había pruebas de la forma del PIN, del
 * bloqueo progresivo y de la forma del PIN, pero ninguna que hiciera
 * `hashearPin` → `verificarPin`. Y no cerraban: `hash()` acepta un Buffer y
 * `verify()` decodifica UTF-8, así que el HMAC crudo lo hacía lanzar y el
 * `catch` lo devolvía como «PIN incorrecto». Nadie podía entrar nunca.
 *
 * Una prueba que sólo comprueba que `hashearPin` devuelve una cadena que
 * empieza por `$argon2id$` habría pasado igual. Por eso la afirmación es sobre
 * el USO —verificar— y no sobre la forma del valor.
 */

const PIMIENTA = 'pimienta-de-pruebas-suficientemente-larga';

describe('hashearPin y verificarPin', () => {
  it('cierran el círculo: lo que se hashea, se verifica', async () => {
    const hash = await hashearPin('4821', PIMIENTA);
    await expect(verificarPin('4821', hash, PIMIENTA)).resolves.toBe(true);
  });

  it('rechaza un PIN distinto', async () => {
    const hash = await hashearPin('4821', PIMIENTA);
    await expect(verificarPin('4822', hash, PIMIENTA)).resolves.toBe(false);
  });

  it('rechaza el PIN correcto con otra pimienta', async () => {
    // Es lo que hace que robar la base no baste: sin la pimienta, que vive en
    // el entorno del servidor, los hashes no sirven para nada.
    const hash = await hashearPin('4821', PIMIENTA);
    await expect(verificarPin('4821', hash, 'otra-pimienta-distinta-larga')).resolves.toBe(false);
  });

  it('produce hashes distintos para el mismo PIN (sal por hash)', async () => {
    const a = await hashearPin('4821', PIMIENTA);
    const b = await hashearPin('4821', PIMIENTA);
    expect(a).not.toBe(b);
    await expect(verificarPin('4821', a, PIMIENTA)).resolves.toBe(true);
    await expect(verificarPin('4821', b, PIMIENTA)).resolves.toBe(true);
  });

  it('usa Argon2id con los parámetros declarados', async () => {
    // No es decoración: los parámetros viajan DENTRO de la cadena y son lo que
    // `verify` usa para recalcular. Si alguien los baja, el hash sigue
    // verificando y la protección se pierde en silencio.
    const hash = await hashearPin('4821', PIMIENTA);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('un hash corrupto se lee como PIN incorrecto, no como excepción', async () => {
    // Ni el que no tiene forma de hash, ni el que la tiene y está roto por
    // dentro. Un 500 aquí le confirmaría al atacante que la cuenta existe.
    await expect(verificarPin('4821', 'esto-no-es-un-hash', PIMIENTA)).resolves.toBe(false);
    await expect(verificarPin('4821', '', PIMIENTA)).resolves.toBe(false);
    await expect(
      verificarPin('4821', '$argon2id$v=19$m=19456,t=2,p=1$YWJj$cortado', PIMIENTA),
    ).resolves.toBe(false);
  });

  it('acepta un PIN de ocho dígitos', async () => {
    const hash = await hashearPin('12345678', PIMIENTA);
    await expect(verificarPin('12345678', hash, PIMIENTA)).resolves.toBe(true);
  });
});

describe('FORMA_PIN', () => {
  it('acepta de cuatro a ocho dígitos', () => {
    for (const bueno of ['1234', '12345', '12345678']) expect(FORMA_PIN.test(bueno)).toBe(true);
  });

  it('rechaza letras, longitudes fuera de rango y vacío', () => {
    for (const malo of ['123', '123456789', 'abcd', '12a4', '', ' 1234']) {
      expect(FORMA_PIN.test(malo)).toBe(false);
    }
  });
});

describe('esperaTrasFallo', () => {
  it('no bloquea antes del quinto intento', () => {
    for (let i = 1; i < INTENTOS_ANTES_DE_BLOQUEAR; i += 1) expect(esperaTrasFallo(i)).toBe(0);
  });

  it('crece al quinto y se detiene en cinco minutos', () => {
    expect(esperaTrasFallo(5)).toBe(30);
    expect(esperaTrasFallo(6)).toBe(60);
    // El tope existe para que el bloqueo no se convierta en la negación de
    // servicio: sin él, quien falla a propósito deja al cajero fuera del turno.
    expect(esperaTrasFallo(20)).toBe(300);
    expect(esperaTrasFallo(200)).toBe(300);
  });
});
