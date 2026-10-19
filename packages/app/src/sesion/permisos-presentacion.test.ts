import { beforeEach, describe, expect, it, vi } from 'vitest';
const doble = vi.hoisted(() => ({ leer: vi.fn(), iniciar: vi.fn() }));
vi.mock('@morphiqpos/data', () => ({ obtenerDb: () => ({ selectFrom: doble.iniciar }) }));
import { autorizaPresentacion, destinosDePresentacion } from './permisos-presentacion.ts';
const DUENO = {
  empleoId: '11111111-1111-4111-8111-111111111111',
  organizacionId: '22222222-2222-4222-8222-222222222222',
  rol: 'dueno',
};
const DESTINO = {
  empleoId: '33333333-3333-4333-8333-333333333333',
  organizacionId: '44444444-4444-4444-8444-444444444444',
  rol: 'dueno',
};
beforeEach(() => {
  vi.clearAllMocks();
  const consulta = { select: () => consulta, where: () => consulta, executeTakeFirst: doble.leer };
  doble.iniciar.mockReturnValue(consulta);
  doble.leer.mockResolvedValue({
    valores: { presentacion_dueno_empleo: DUENO.empleoId, presentacion_destinos: [DESTINO] },
  });
});
describe('acceso general: permiso explícito del servidor', () => {
  it('autoriza sólo la pareja de empleo y organización concedida', async () => {
    expect(await autorizaPresentacion(DUENO, DESTINO)).toBe(true);
    expect(
      await autorizaPresentacion(DUENO, { ...DESTINO, organizacionId: DUENO.organizacionId }),
    ).toBe(false);
  });
  it('un administrador o mesero nunca obtiene el acceso general', async () => {
    for (const rol of ['administrador', 'mesero', 'cajero'])
      expect(await destinosDePresentacion({ ...DUENO, rol })).toEqual([]);
    expect(doble.iniciar).not.toHaveBeenCalled();
  });
  it('ser otro dueño del mismo restaurante no hereda el permiso', async () => {
    expect(await destinosDePresentacion({ ...DUENO, empleoId: DESTINO.empleoId })).toEqual([]);
  });
  it('rechaza configuraciones incompletas y destinos que dejaron de ser dueños', async () => {
    expect(await autorizaPresentacion(DUENO, { ...DESTINO, rol: 'mesero' })).toBe(false);
    doble.leer.mockResolvedValue({ valores: { presentacion_destinos: [DESTINO] } });
    expect(await destinosDePresentacion(DUENO)).toEqual([]);
  });
});
