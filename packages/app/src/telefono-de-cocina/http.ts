import 'server-only';

import { ErrorDominio, validarEntorno } from '@morphiqpos/contracts';

import { cuerpoDentroDelLimite } from '../http/limite-cuerpo.ts';
import { negociosDelPortal } from '../negocio/despliegue.ts';
import { correlationIdDe } from '../observabilidad.ts';
import {
  errorHttp,
  estadoDe,
  peticionPropia,
  respuesta,
  respuestaDeError,
  type PeticionDelPortal,
  type RespuestaDelPortal,
} from '../portal/http.ts';
import { permitirPortal } from '../portal/limite.ts';
import { pantallaDelTelefono } from './consulta.ts';
import { leerTokenDeEstacion } from './token-de-estacion.ts';
import { transicionarDesdeElTelefono } from './transicion.ts';

/**
 * La API pública del teléfono de una estación de cocina (DP-9.4), estrecha a propósito (R33):
 * `GET` lee la comanda vigente de SU estación y `POST …/transicion` la prepara o la deja lista.
 * Nada más. El negocio sale del token y se comprueba contra los que sirve el despliegue: un
 * token firmado para otro negocio no abre éste.
 */

interface Despliegue {
  readonly organizacionId: string;
  readonly pimienta: string;
}

function invalido(): ErrorDominio {
  return new ErrorDominio(
    'TELEFONO_DE_COCINA_INVALIDO',
    'Este código ya no sirve. Pide uno nuevo en la pantalla de Cocina.',
  );
}

async function resolverDespliegue(token: string, host: string | null): Promise<Despliegue> {
  const entorno = validarEntorno(process.env);
  const contenido = leerTokenDeEstacion(token, entorno.PIN_PEPPER);
  if (contenido === null) throw invalido();
  const candidatos = await negociosDelPortal(entorno.ORGANIZACION, host);
  if (!candidatos.some((n) => n.organizacionId === contenido.organizacionId)) throw invalido();
  return { organizacionId: contenido.organizacionId, pimienta: entorno.PIN_PEPPER };
}

/** `GET /api/publico/cocina/:token`. */
export async function servirTelefonoDeCocina(
  token: string,
  host: string | null,
): Promise<RespuestaDelPortal> {
  try {
    const despliegue = await resolverDespliegue(token, host);
    const permiso = await permitirPortal('cocina_consulta', token, despliegue.pimienta, {
      organizacionId: despliegue.organizacionId,
    });
    if (!permiso.ok) {
      return errorHttp(429, 'REGLA_DE_NEGOCIO', 'Demasiadas consultas. Espera un momento.');
    }
    const datos = await pantallaDelTelefono({ token, ...despliegue });
    return respuesta(200, { ok: true, datos });
  } catch (error) {
    return respuestaDeError(error, 'publico.cocina', {});
  }
}

/** `POST /api/publico/cocina/:token/transicion`. */
export async function transicionDelTelefono(
  token: string,
  peticion: PeticionDelPortal,
): Promise<RespuestaDelPortal> {
  if (peticion.method !== 'POST') return errorHttp(405, 'METODO', 'Usa POST.');
  if (!peticionPropia(peticion)) {
    return errorHttp(403, 'SIN_PERMISO', 'Petición de escritura rechazada.');
  }
  if (!cuerpoDentroDelLimite(peticion.headers)) {
    return errorHttp(413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo supera 256 KiB.');
  }
  let entrada: unknown;
  try {
    entrada = await peticion.json();
  } catch {
    return errorHttp(400, 'ENTRADA_INVALIDA', 'El cuerpo de la petición no es JSON.');
  }
  const correlationId = correlationIdDe(
    peticion.headers.get('x-correlation-id') ?? peticion.headers.get('x-morphiqpos-correlacion'),
  );
  let despliegue: Despliegue;
  try {
    despliegue = await resolverDespliegue(token, peticion.headers.get('host'));
  } catch (error) {
    return respuestaDeError(error, 'publico.cocina.transicion', { correlationId });
  }
  const clave = peticion.headers.get('idempotency-key');
  const salida = await transicionarDesdeElTelefono({
    token,
    ...despliegue,
    entrada,
    ...(clave === null ? {} : { idempotencyKey: clave }),
    correlationId,
  });
  return respuesta(estadoDe(salida), salida, salida.correlationId);
}
