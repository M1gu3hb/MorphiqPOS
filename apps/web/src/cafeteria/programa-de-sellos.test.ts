import { describe, expect, it } from 'vitest';

import { enlaceDeWhatsApp, mensajeDeRegreso } from './programa-de-sellos.ts';

describe('el mensaje al que no viene: lo redacta el sistema, lo manda la dueña', () => {
  const ana = {
    clienteId: 'a',
    nombre: 'Ana',
    telefono: '55 1234 5678',
    sellos: 3,
    diasSinVenir: 25,
  };

  it('dice cuántos sellos lleva y cuántos le faltan para el siguiente premio', () => {
    expect(mensajeDeRegreso(ana, 5)).toContain('Llevas 3 sellos: con 2 más');
    expect(mensajeDeRegreso({ ...ana, sellos: 7 }, 5)).toContain('con 3 más');
    expect(mensajeDeRegreso({ ...ana, sellos: 0 }, 5)).not.toContain('sellos');
  });

  it('el enlace va al número con el 52 de México y el texto codificado', () => {
    const enlace = enlaceDeWhatsApp(ana.telefono, 'Hola, Ana');
    expect(enlace).toBe('https://wa.me/525512345678?text=Hola%2C%20Ana');
    expect(enlaceDeWhatsApp('525512345678', 'x')).toBe('https://wa.me/525512345678?text=x');
  });

  it('sin un teléfono de diez dígitos no hay enlace: no se manda a un número inventado', () => {
    expect(enlaceDeWhatsApp(null, 'x')).toBeNull();
    expect(enlaceDeWhatsApp('12345', 'x')).toBeNull();
  });
});
