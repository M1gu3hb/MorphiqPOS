import { validarEntorno } from '@morphiqpos/contracts';
import { enrolarTerminal, VIGENCIA_DISPOSITIVO_SEGUNDOS } from '@morphiqpos/app/identidad';
import { z } from 'zod';

import { cookieDeDispositivo } from '@/servidor/dispositivo';

/**
 * Enrolamiento de terminal (F1.1-A-02).
 *
 * Sin ambito previo: la terminal se identifica con el codigo de un solo uso que
 * el encargado genero en gestion. Al canjearlo, el codigo se quema.
 */

export const runtime = 'nodejs';

const Entrada = z.object({ codigo: z.string().regex(/^\d{6}$/) });

const MENSAJES = {
  codigo_invalido: 'El codigo no es valido. Pide uno nuevo en Configuracion.',
  codigo_expirado: 'El codigo ya caduco. Pide uno nuevo en Configuracion.',
  ya_enrolada: 'Esa terminal ya esta dada de alta en otro dispositivo.',
} as const;

export async function POST(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);

  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    cuerpo = null;
  }

  const validada = Entrada.safeParse(cuerpo);
  if (!validada.success) {
    return json(400, {
      ok: false,
      error: { codigo: 'ENTRADA_INVALIDA', mensaje: MENSAJES.codigo_invalido },
    });
  }

  const resultado = await enrolarTerminal(validada.data.codigo, entorno.PIN_PEPPER);

  if (!resultado.ok) {
    return json(400, {
      ok: false,
      error: { codigo: 'REGLA_DE_NEGOCIO', mensaje: MENSAJES[resultado.motivo] },
    });
  }

  return json(
    200,
    { ok: true, datos: { terminalId: resultado.terminalId } },
    cookieDeDispositivo({
      token: resultado.deviceToken,
      maxEdadSegundos: VIGENCIA_DISPOSITIVO_SEGUNDOS,
      seguro: entorno.NODE_ENV === 'production',
    }),
  );
}

function json(estado: number, cuerpo: unknown, cookie?: string): Response {
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (cookie !== undefined) cabeceras['set-cookie'] = cookie;
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}
