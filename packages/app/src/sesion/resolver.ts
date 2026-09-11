import 'server-only';

import { esRol, type Ambito } from '@morphiqpos/contracts';
import { obtenerDb, repoSesion } from '@morphiqpos/data';

import { verificarSesion, type Verificacion } from './token.ts';

/**
 * De una cookie a un `Ambito` — el puente que faltaba (F1.1-X-01).
 *
 * Es el único lugar del sistema donde nace un ámbito. R16: «El ámbito viene de
 * la sesión del servidor, jamás de un parámetro del cliente.» Si mañana hay otra
 * forma de entrar —un token de portal QR, por ejemplo— se agrega aquí y todos
 * los comandos la heredan sin tocarse.
 */

export type ResultadoSesion =
  | { readonly ok: true; readonly ambito: Ambito }
  | {
      readonly ok: false;
      /**
       * `expirada` la UI la trata distinto: reabre el diálogo de PIN conservando
       * el carrito, en vez de mandar al login y perder la venta a medias.
       */
      readonly motivo: 'ausente' | 'invalida' | 'expirada' | 'revocada';
    };

export interface OpcionesResolver {
  readonly secreto: string;
  /** Token de la cookie de sesión. */
  readonly token: string | undefined;
  /** Token de dispositivo de la terminal, si la petición viene de una. */
  readonly terminalId?: string | undefined;
}

export async function resolverSesion(opciones: OpcionesResolver): Promise<ResultadoSesion> {
  const verificado = verificarSesion(opciones.token, opciones.secreto);
  if (!verificado.ok) return { ok: false, motivo: traducir(verificado) };

  const db = obtenerDb();
  const fila = await repoSesion.resolverAmbito(
    db,
    verificado.carga.identidadId,
    verificado.carga.empleoId,
  );

  // La sesión estaba bien firmada pero el empleo ya no vale: baja, cambio de
  // sucursal, organización desactivada. La firma no puede saberlo; la base sí.
  if (fila === null) return { ok: false, motivo: 'revocada' };

  // El rol es `text` con `check` en la base, así que el tipo generado dice
  // `string`. Se estrecha en vez de aseverar: un rol desconocido no autoriza.
  if (!esRol(fila.rol)) return { ok: false, motivo: 'revocada' };

  const terminalId = verificado.carga.terminalId;
  let sucursalId = fila.sucursalId;

  if (terminalId !== null) {
    const terminal = await repoSesion.terminalActiva(db, terminalId, fila.organizacionId);
    // Una terminal desenrolada o de otra organización no degrada a «sin
    // terminal»: invalida la sesión. Degradar dejaría operar con una cookie
    // vieja después de dar de baja el dispositivo.
    if (terminal === null) return { ok: false, motivo: 'revocada' };
    sucursalId = terminal.sucursalId;
  }

  return {
    ok: true,
    ambito: {
      organizacionId: fila.organizacionId,
      sucursalId,
      terminalId,
      identidadId: fila.identidadId,
      empleoId: fila.empleoId,
      rol: fila.rol,
    },
  };
}

function traducir(
  fallo: Extract<Verificacion, { ok: false }>,
): 'ausente' | 'invalida' | 'expirada' {
  if (fallo.motivo === 'ausente') return 'ausente';
  if (fallo.motivo === 'expirado') return 'expirada';
  return 'invalida';
}
