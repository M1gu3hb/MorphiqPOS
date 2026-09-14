import { describe, expect, it } from 'vitest';

import { soloCamposEditablesMesa } from '../../heredado/utils/mesaConfigUtils.js';

describe('mesa guardada desde Configuración', () => {
  it('descarta el token leído y conserva qr_activo, que sí es escribible', () => {
    expect(
      soloCamposEditablesMesa({
        numero: 7,
        nombre: 'Terraza',
        qr_token: 'token-que-rota-el-servidor',
        qr_activo: false,
        estado: 'libre',
        zona: 'Exterior',
      }),
    ).toEqual({ numero: 7, nombre: 'Terraza', qr_activo: false });
  });
});
