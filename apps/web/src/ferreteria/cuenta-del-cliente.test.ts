import { describe, expect, it } from 'vitest';

import { estadoEnTexto, vencimiento, whatsappDe } from './cuenta-del-cliente.ts';

describe('el estado de cuenta que se manda', () => {
  it('el vencimiento en palabras, con su signo', () => {
    expect(vencimiento(-3)).toBe('vence en 3 d');
    expect(vencimiento(0)).toBe('vence hoy');
    expect(vencimiento(12)).toBe('vencido hace 12 d');
  });

  it('cada documento con su saldo, el total y lo vencido', () => {
    const texto = estadoEnTexto(
      'Construcciones del Valle',
      {
        renglones: [
          { folio: 'R-12', saldoCentavos: '1210000', diasVencidos: 41 },
          { folio: 'R-19', saldoCentavos: '30050', diasVencidos: -5 },
        ],
        totalCentavos: '1240050',
        vencidoCentavos: '1210000',
      },
      (c) => `${String(c)}¢`,
    );
    expect(texto.split('\n')).toEqual([
      'Estado de cuenta de Construcciones del Valle',
      'R-12 · 1210000¢ · vencido hace 41 d',
      'R-19 · 30050¢ · vence en 5 d',
      'Total: 1240050¢',
      'Vencido: 1210000¢',
    ]);
  });

  it('el número para WhatsApp: diez dígitos con lada, o nada', () => {
    expect(whatsappDe('55 1234 5678')).toBe('525512345678');
    expect(whatsappDe('+52 55 1234 5678')).toBe('525512345678');
    expect(whatsappDe('1234')).toBe('');
    expect(whatsappDe(null)).toBe('');
  });
});
