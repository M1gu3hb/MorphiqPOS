import { invocarComando } from '~/cliente/api';

/**
 * Atiende una solicitud del comensal (`restaurante.atender_solicitud`). Lo usan el globo de la
 * mesa (DP-9.2) y la vista «Solicitudes» (DP-9.3): el servidor decide quién la atendió y si el
 * mesero se queda con la mesa.
 */
export async function atenderLaSolicitud(solicitudId: string): Promise<void> {
  await invocarComando('/api/restaurante/atender-solicitud', { solicitudId, estado: 'atendida' });
}

/** El mensaje para la pantalla cuando el servidor no la atendió. */
export function motivoDelFallo(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo atender.';
}
