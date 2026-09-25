import { describe, expect, it } from 'vitest';

import { transaccionGrabadora } from '../pruebas/grabadora.ts';
import { contextoFalso } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { cancelarEspera, listaDeEspera } from './espera-viva.ts';

/**
 * C.10 de la 2.4 · La lista de espera del salón se LEE y se CANCELA.
 */
const AHORA = new Date('2026-09-25T15:00:00.000Z');
const ANA = 'cc000000-0000-4000-8000-000000000001';
const LUPE = 'cc000000-0000-4000-8000-000000000002';
const ROCIO = 'cc000000-0000-4000-8000-000000000003';
const TINTE = 'bb000000-0000-4000-8000-000000000001';

const espera = (id: string, cliente: string, cambios: Record<string, unknown> = {}) => ({
  id,
  cliente_id: cliente,
  servicio_id: null,
  profesional_id: null,
  ventana: '["2026-09-26 09:00:00+00","2026-09-27 21:00:00+00")',
  flexible_de_dia: true,
  prioridad: 0,
  estado: 'esperando',
  avisada_en: null,
  nota: null,
  created_at: new Date('2026-09-20T10:00:00.000Z'),
  ...cambios,
});

describe('lista_espera_citas.lista', () => {
  it('primero la prioridad, luego la más antigua; la ventana vencida no entra', async () => {
    const { tx, conexion } = transaccionGrabadora([
      [
        espera('e-ana', ANA, { created_at: new Date('2026-09-21T10:00:00.000Z') }),
        espera('e-lupe', LUPE, { prioridad: 50, servicio_id: TINTE }),
        espera('e-rocio', ROCIO, {
          ventana: '["2026-09-20 09:00:00+00","2026-09-24 21:00:00+00")',
        }),
        espera('e-vieja', ROCIO, { created_at: new Date('2026-09-19T10:00:00.000Z') }),
      ],
      [
        { id: ANA, nombre: 'Ana', telefono: '2281112233' },
        { id: LUPE, nombre: 'Lupe', telefono: null },
        { id: ROCIO, nombre: 'Rocío', telefono: null },
      ],
      [{ id: TINTE, nombre: 'Tinte completo' }],
    ]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'), AHORA);

    const { esperas } = await listaDeEspera.ejecutar(ctx, {});

    expect(esperas.map((e) => e.esperaId)).toEqual(['e-lupe', 'e-vieja', 'e-ana']);
    expect(esperas[0]).toMatchObject({
      clienteNombre: 'Lupe',
      servicioNombre: 'Tinte completo',
      desde: '2026-09-26T09:00:00.000Z',
      hasta: '2026-09-27T21:00:00.000Z',
    });
    const [lectura] = conexion.consultas;
    expect(lectura?.sql).toMatch(/ventana::text/);
    expect(lectura?.sql).toMatch(/"organizacion_id" = \$1/);
    expect(lectura?.parameters).toEqual([ORG, 'esperando', 'avisada']);
  });

  it('sin nadie esperando no pregunta nombres', async () => {
    const { tx, conexion } = transaccionGrabadora([[]]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'), AHORA);
    expect((await listaDeEspera.ejecutar(ctx, {})).esperas).toEqual([]);
    expect(conexion.consultas).toHaveLength(1);
  });
});

describe('lista_espera_citas.cancelar', () => {
  it('cancela sólo una VIVA de este negocio', async () => {
    const { tx, conexion } = transaccionGrabadora([[{ id: 'e-ana' }], [{ numUpdatedRows: 1n }]]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'), AHORA);
    // La grabadora no cuenta filas tocadas: se confía en el `where` compilado.
    await cancelarEspera.ejecutar(ctx, { esperaId: 'e-ana' }).catch(() => undefined);
    const actualiza = conexion.consultas[1];
    expect(actualiza?.sql).toMatch(/update "lista_espera_citas" set "estado" = \$1/);
    expect(actualiza?.parameters[0]).toBe('cancelada');
    expect(actualiza?.sql).toMatch(/"organizacion_id" = \$\d+/);
    expect(actualiza?.sql).toMatch(/"estado" in \(\$\d+, \$\d+\)/);
  });

  it('una espera de otro negocio no existe', async () => {
    const { tx } = transaccionGrabadora([[]]);
    const { ctx } = contextoFalso(tx, ambitoDe('cajero'), AHORA);
    await expect(cancelarEspera.ejecutar(ctx, { esperaId: 'ajena' })).rejects.toMatchObject({
      codigo: 'PUENTE_NO_ENCONTRADO',
    });
  });
});
