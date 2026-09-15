import { conTransaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { insertarComandas } from './comandas.ts';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('comandas contra Postgres · lotes vacíos', () => {
  it('cobrar una orden sin grupos de cocina no genera SQL inválido', async () => {
    await expect(
      conTransaccion((tx) =>
        insertarComandas(tx, {
          organizacionId: ORG,
          orden: {
            id: '22222222-2222-4222-8222-222222222222',
            estado: 'borrador',
            sucursalId: '33333333-3333-4333-8333-333333333333',
            mesaId: null,
            estrategiaCaptura: 'mostrador',
            codigoCaja: null,
            notasAlergias: null,
            celebracionEspecial: false,
            tipoCelebracion: null,
          },
          notas: null,
          comandas: [],
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
