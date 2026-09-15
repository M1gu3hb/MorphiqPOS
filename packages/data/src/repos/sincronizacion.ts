import 'server-only';

import type { Transaccion } from '../cliente.ts';

/**
 * Encola los dos destinos que la pantalla de cierre siempre solicitó.
 *
 * Los valores son constantes del servidor: el navegador sólo identifica el
 * corte. Así no puede fabricar destinos, estados, intentos ni payloads libres.
 */
export async function encolarCorte(
  tx: Transaccion,
  organizacionId: string,
  corteId: string,
): Promise<void> {
  await tx
    .insertInto('bitacora_sincronizacion')
    .values([
      {
        organizacion_id: organizacionId,
        tipo_registro: 'cash_cut',
        registro_id: corteId,
        destino: 'google_sheets',
        ultimo_intento_en: null,
        mensaje_error: null,
        archivo_url: null,
        pestana_hoja: null,
        payload: null,
      },
      {
        organizacion_id: organizacionId,
        tipo_registro: 'cash_cut_pdf',
        registro_id: corteId,
        destino: 'google_drive',
        ultimo_intento_en: null,
        mensaje_error: null,
        archivo_url: null,
        pestana_hoja: null,
        payload: null,
      },
    ])
    .execute();
}
