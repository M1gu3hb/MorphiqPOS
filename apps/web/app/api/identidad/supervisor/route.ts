import { validarEntorno } from '@morphiqpos/contracts';
import { permitir } from '@morphiqpos/app/http';
import { autorizarConPin } from '@morphiqpos/app/identidad';
import { z } from 'zod';

import { conSesion } from '~/servidor/http';

/**
 * EL PIN DEL SUPERVISOR EN ESTA TERMINAL (F-205, D-28 de la 2.4).
 *
 * La cajera, con su sesión, manda el empleo del supervisor y el PIN que él tecleó; si es
 * bueno y su puesto autoriza, vuelve una autorización firmada de dos minutos que el
 * descuento presenta al aplicarse. La comprobación es la de `autorizarConPin`, con el
 * mismo bloqueo por intentos que la entrada.
 *
 * Y el mismo LÍMITE POR ORIGEN que la entrada (`LIMITES.entrar`, sin tocarlo): probar el
 * PIN del gerente desde la caja es un barrido igual que probarlo en la pantalla de
 * acceso, y cuenta en el mismo cubo.
 *
 * Las respuestas no distinguen «no existe» de «PIN incorrecto»: las dos son el mismo 403.
 * NUNCA un 401: para el cliente un 401 es «tu sesión venció», y un PIN mal tecleado del
 * gerente cerraría la sesión de la cajera con la venta armada. El bloqueo es un 429, como
 * en la entrada.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Entrada = z.object({
  empleoId: z.uuid(),
  pin: z.string().min(1).max(16),
});

const ESTADO_POR_MOTIVO = {
  credenciales: 403,
  bloqueada: 429,
  no_autoriza: 403,
  uno_mismo: 403,
} as const;

const MENSAJE_POR_MOTIVO = {
  credenciales: 'El PIN no es correcto.',
  bloqueada: 'Ese PIN se bloqueó por intentos. Espera un momento.',
  no_autoriza: 'Esa persona no puede autorizar descuentos.',
  uno_mismo: 'Nadie se autoriza a sí mismo un descuento.',
} as const;

export async function POST(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);
  const permiso = await permitir('entrar', peticion.headers, entorno.PIN_PEPPER);
  if (!permiso.ok) {
    return Response.json(
      {
        ok: false,
        error: {
          codigo: 'LIMITE_DE_TASA',
          mensaje: 'Demasiados intentos desde esta red. Espera unos minutos.',
        },
      },
      { status: 429, headers: { 'cache-control': 'no-store' } },
    );
  }

  return conSesion(peticion, async (sesion) => {
    const cuerpo: unknown = await peticion.json().catch(() => null);
    const validada = Entrada.safeParse(cuerpo);
    if (!validada.success) {
      return Response.json(
        { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Falta quién autoriza o su PIN.' } },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      );
    }
    const resultado = await autorizarConPin({
      organizacionId: sesion.organizacionId,
      solicitaEmpleoId: sesion.empleoId,
      empleoId: validada.data.empleoId,
      pin: validada.data.pin,
      pimienta: entorno.PIN_PEPPER,
      secreto: entorno.SESSION_SECRET,
    });
    if (!resultado.ok) {
      return Response.json(
        {
          ok: false,
          error: {
            codigo: resultado.motivo === 'bloqueada' ? 'LIMITE_DE_TASA' : 'SIN_PERMISO',
            mensaje: MENSAJE_POR_MOTIVO[resultado.motivo],
            ...(resultado.esperaSegundos === undefined
              ? {}
              : { detalles: { esperaSegundos: resultado.esperaSegundos } }),
          },
        },
        { status: ESTADO_POR_MOTIVO[resultado.motivo], headers: { 'cache-control': 'no-store' } },
      );
    }
    return { autorizacion: resultado.autorizacion, rol: resultado.rol, vence: resultado.vence };
  });
}
