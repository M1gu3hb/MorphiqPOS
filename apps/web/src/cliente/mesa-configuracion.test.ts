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

  const ZONAS = [
    { id: 'zona-interior', nombre: 'Interior' },
    { id: 'zona-terraza', nombre: 'Terraza' },
  ];

  it('la zona elegida por nombre viaja como su zona_id', () => {
    expect(soloCamposEditablesMesa({ numero: 13, zona: 'Terraza' }, ZONAS)).toEqual({
      numero: 13,
      zona_id: 'zona-terraza',
    });
  });

  it('al editar, la zona nueva manda sobre el zona_id que trajo la lectura', () => {
    expect(
      soloCamposEditablesMesa({ numero: 4, zona: ' terraza ', zona_id: 'zona-interior' }, ZONAS),
    ).toEqual({ numero: 4, zona_id: 'zona-terraza' });
  });

  it('una zona que no existe no deja el zona_id viejo: sale sin él, para que quien llama avise', () => {
    expect(
      soloCamposEditablesMesa({ numero: 4, zona: 'Azotea', zona_id: 'zona-interior' }, ZONAS),
    ).toEqual({ numero: 4 });
  });

  it('convierte la asignación vacía en null para que PostgreSQL acepte el UUID opcional', () => {
    expect(
      soloCamposEditablesMesa({
        numero: 1,
        nombre: 'Ventana',
        mesero_asignado_id: '',
      }),
    ).toEqual({ numero: 1, nombre: 'Ventana', mesero_asignado_id: null });
  });
});
