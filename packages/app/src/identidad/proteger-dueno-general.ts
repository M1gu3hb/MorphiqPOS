import 'server-only';

import { ErrorDominio, type Ambito } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

/** El dueño de una demo no puede apropiarse de la cuenta que abre los demás negocios. */
export async function protegerDuenoGeneral(tx: Transaccion, ambito: Ambito, empleado: string) {
  if (ambito.empleoId === empleado || ambito.presentador?.empleoId === empleado) return;
  const fila = await tx
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', ambito.organizacionId)
    .executeTakeFirst();
  const valores = fila?.valores;
  if (
    typeof valores === 'object' &&
    valores !== null &&
    'presentacion_dueno_empleo' in valores &&
    valores.presentacion_dueno_empleo === empleado
  ) {
    throw new ErrorDominio(
      'PUESTO_NO_OTORGABLE',
      'La cuenta del dueño general sólo puede modificarla su titular.',
    );
  }
}
