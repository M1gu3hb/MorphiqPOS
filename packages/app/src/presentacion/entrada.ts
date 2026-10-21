import 'server-only';

import { conTransaccion, obtenerDb, repoSesion } from '@morphiqpos/data';

import { verificarSesion } from '../sesion/token.ts';
import { abrirSesionEnElEspejo, gemeloEnPresentacion, type SesionEnElEspejo } from './espejo.ts';

/**
 * ENTRAR CON EL PIN DE SIEMPRE MIENTRAS EL RESTAURANTE ESTÁ EN PRESENTACIÓN (21-10).
 *
 * El PIN ya se comprobó contra el empleo del restaurante real y su sesión ya existe. Si el
 * restaurante está en presentación, esa sesión no se entrega: se abre la del gemelo en el
 * espejo, y cada mesero, cocina o caja opera desde su teléfono sobre la presentación.
 *
 * El dueño general es la excepción a medias: su sesión real se queda viva porque es la RAÍZ
 * de la delegada —la que le deja apagar el modo y cambiar de modelo— igual que en «Modelos de
 * negocio». A los demás se les cierra la real: al apagar la presentación no queda una sesión
 * suya vigente en el restaurante que nadie tiene en su navegador.
 *
 * `null`: el restaurante no está en presentación y la entrada sigue como siempre.
 */
export async function sesionDePresentacion(peticion: {
  readonly organizacionId: string;
  readonly empleoId: string;
  readonly tokenReal: string;
  readonly deviceToken: string;
  readonly pimienta: string;
  readonly secreto: string;
}): Promise<SesionEnElEspejo | null> {
  const gemelo = await gemeloEnPresentacion(peticion.organizacionId, peticion.empleoId);
  if (gemelo === null) return null;
  const raiz = verificarSesion(peticion.tokenReal, peticion.secreto);
  if (!raiz.ok) return null;

  const fila = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', peticion.organizacionId)
    .executeTakeFirst();
  const valores = fila?.valores as Readonly<Record<string, unknown>> | undefined;
  const esElGeneral = valores?.['presentacion_dueno_empleo'] === peticion.empleoId;

  if (!esElGeneral) {
    await conTransaccion((tx) => repoSesion.revocarSesion(tx, raiz.carga.sid));
  }
  return abrirSesionEnElEspejo({
    origenId: peticion.organizacionId,
    gemelo,
    deviceToken: peticion.deviceToken,
    pimienta: peticion.pimienta,
    secreto: peticion.secreto,
    ...(esElGeneral ? { presentador: raiz.carga } : {}),
  });
}
