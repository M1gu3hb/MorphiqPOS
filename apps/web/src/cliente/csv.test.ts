import { describe, expect, it } from 'vitest';

import { campoCsv, csvDe, pesosParaCsv } from './csv';

describe('el CSV que Excel abre bien', () => {
  it('lleva el BOM y separa renglones como Windows', () => {
    const texto = csvDe([{ titulo: 'Hora', valor: (f: { h: string }) => f.h }], [{ h: '09:15' }]);
    expect(texto.startsWith('﻿Hora\r\n09:15\r\n')).toBe(true);
  });

  it('entrecomilla lo que lleva coma, comilla o salto', () => {
    expect(campoCsv('Coca, 600')).toBe('"Coca, 600"');
    expect(campoCsv('dijo "ya"')).toBe('"dijo ""ya"""');
    expect(campoCsv('dos\nrenglones')).toBe('"dos\nrenglones"');
    expect(campoCsv('sin nada')).toBe('sin nada');
  });

  it('una fórmula tecleada queda como TEXTO: no se ejecuta al abrir', () => {
    expect(campoCsv('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(campoCsv('+1')).toBe("'+1");
    expect(campoCsv('@suma')).toBe("'@suma");
    expect(campoCsv('-5')).toBe("'-5");
  });

  it('los importes salen como número de pesos, que suma', () => {
    expect(pesosParaCsv(123_456)).toBe(1234.56);
    expect(pesosParaCsv(-500)).toBe(-5);
    expect(campoCsv(pesosParaCsv(-500))).toBe('-5');
    expect(pesosParaCsv(null)).toBeNull();
  });
});
