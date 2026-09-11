import 'server-only';

import { obtenerDb } from '../cliente.ts';

function contieneUrl(valor: unknown, url: string): boolean {
  if (typeof valor === 'string') return valor === url;
  if (Array.isArray(valor)) return valor.some((elemento) => contieneUrl(elemento, url));
  if (typeof valor !== 'object' || valor === null) return false;
  return Object.values(valor).some((elemento) => contieneUrl(elemento, url));
}

export async function referenciaPublicaExiste(
  organizacionId: string,
  url: string,
): Promise<boolean> {
  const db = obtenerDb();
  const [producto, seccion, configuracion] = await Promise.all([
    db
      .selectFrom('productos')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('imagen_url', '=', url)
      .executeTakeFirst(),
    db
      .selectFrom('menu_qr_secciones')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('imagen_url', '=', url)
      .executeTakeFirst(),
    db
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', organizacionId)
      .executeTakeFirst(),
  ]);
  return (
    producto !== undefined || seccion !== undefined || contieneUrl(configuracion?.valores, url)
  );
}
