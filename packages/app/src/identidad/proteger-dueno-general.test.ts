import { describe, expect, it } from 'vitest';
import type { Ambito } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { protegerDuenoGeneral } from './proteger-dueno-general.ts';
const AMBITO: Ambito = {
  organizacionId: 'org-demo',
  sucursalId: null,
  terminalId: null,
  identidadId: 'identidad',
  empleoId: 'dueno-demo',
  rol: 'dueno',
};
function base() {
  const consulta = {
    select: () => consulta,
    where: () => consulta,
    executeTakeFirst: async () => ({ valores: { presentacion_dueno_empleo: 'dueno-general' } }),
  };
  return { selectFrom: () => consulta } as unknown as Transaccion;
}
describe('protección del dueño general ante los otros dueños de demostración', () => {
  it('otro dueño no puede cambiarle el PIN ni editar su empleo', async () => {
    await expect(protegerDuenoGeneral(base(), AMBITO, 'dueno-general')).rejects.toMatchObject({
      codigo: 'PUESTO_NO_OTORGABLE',
    });
  });
  it('el titular puede administrar su cuenta desde su contexto original o una demo', async () => {
    await expect(
      protegerDuenoGeneral(base(), { ...AMBITO, empleoId: 'dueno-general' }, 'dueno-general'),
    ).resolves.toBeUndefined();
    await expect(
      protegerDuenoGeneral(
        base(),
        { ...AMBITO, presentador: { empleoId: 'dueno-general', identidadId: 'identidad-general' } },
        'dueno-general',
      ),
    ).resolves.toBeUndefined();
  });
  it('los empleados corrientes siguen bajo la administración normal', async () => {
    await expect(protegerDuenoGeneral(base(), AMBITO, 'mesero')).resolves.toBeUndefined();
  });
});
