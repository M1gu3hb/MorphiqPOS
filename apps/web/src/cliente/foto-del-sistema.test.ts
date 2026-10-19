import { describe, expect, it } from 'vitest';

import { esFotoDelSistema } from './foto-del-sistema.ts';

const BASE = 'https://pos.example.mx';

describe('la foto del sistema', () => {
  it('pinta la que devolvió la subida', () => {
    expect(esFotoDelSistema(`${BASE}/api/archivos/privado/o/2026/09/a.jpg`, BASE)).toBe(true);
  });

  it('no pinta ni enlaza javascript:, data: ni páginas ajenas', () => {
    expect(esFotoDelSistema('javascript:alert(1)', BASE)).toBe(false);
    expect(esFotoDelSistema('data:image/png;base64,AAAA', BASE)).toBe(false);
    expect(esFotoDelSistema('https://otro.example/phish', BASE)).toBe(false);
  });
});
