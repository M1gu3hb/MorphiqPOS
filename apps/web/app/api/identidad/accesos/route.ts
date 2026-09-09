import { empleadosConAcceso, terminalesDeGestion } from '@morphiqpos/app/identidad';

import { responderConsulta } from '~/servidor/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Quién puede entrar y desde qué terminales (F1.1-C-05 y C-06).
 *
 * Las dos consultas van en paralelo: son independientes y encadenarlas doblaría
 * la latencia de la pantalla sin ganar nada.
 */
export function GET(): Promise<Response> {
  return responderConsulta(async (sesion) => {
    const [empleados, terminales] = await Promise.all([
      empleadosConAcceso(sesion.organizacionId),
      terminalesDeGestion(sesion.organizacionId),
    ]);
    return { empleados, terminales, rol: sesion.rol };
  });
}
