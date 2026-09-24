import 'server-only';

import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * LAS COLUMNAS QUE GUARDAN LA URL DE UN ARCHIVO, del esquema (`*_url` de texto).
 *
 * Borrar un archivo que una fila todavía nombra deja una imagen rota —la foto de un
 * producto, la firma de una remisión, el comprobante de una liquidación—. Antes de
 * borrar se pregunta a todas; la prueba de este módulo compara la lista con
 * `scripts/esquema-esperado.json` para que una columna nueva no se quede fuera.
 */
export const COLUMNAS_CON_ARCHIVO: readonly { readonly tabla: string; readonly columna: string }[] =
  [
    { tabla: 'autorizados_cuenta', columna: 'foto_url' },
    { tabla: 'bitacora_sincronizacion', columna: 'archivo_url' },
    { tabla: 'fotos_expediente', columna: 'archivo_url' },
    { tabla: 'liquidaciones', columna: 'comprobante_url' },
    { tabla: 'menu_qr_secciones', columna: 'imagen_url' },
    { tabla: 'productos', columna: 'foto_mostrador_url' },
    { tabla: 'productos', columna: 'imagen_url' },
    { tabla: 'profesionales', columna: 'foto_url' },
    { tabla: 'remisiones', columna: 'firma_url' },
  ];

/**
 * ¿Alguna fila de ESTA organización nombra la clave? Incluida su configuración (logo y
 * fondos viven dentro del documento `configuracion.valores`).
 */
export async function archivoEnUso(organizacionId: string, clave: string): Promise<boolean> {
  // Una clave de archivo sólo lleva letras, dígitos, guiones, puntos y barras: sin `%`
  // ni `_` no hay comodín de LIKE que escapar. Cualquier otra cosa se trata como «en
  // uso», que es lo seguro: no se borra.
  if (!/^[a-z0-9./-]+$/i.test(clave)) return true;
  const patron = `%/api/archivos/${clave}%`;
  const db = obtenerDb();
  for (const { tabla, columna } of COLUMNAS_CON_ARCHIVO) {
    const fila = await sql<{ uno: number }>`select 1 as uno from ${sql.table(tabla)}
      where organizacion_id = ${organizacionId} and ${sql.ref(columna)} like ${patron}
      limit 1`.execute(db);
    if (fila.rows.length > 0) return true;
  }
  const configuracion = await sql<{ uno: number }>`select 1 as uno from configuracion
    where organizacion_id = ${organizacionId} and valores::text like ${patron} limit 1`.execute(db);
  return configuracion.rows.length > 0;
}
