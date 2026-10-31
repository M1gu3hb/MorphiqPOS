import 'server-only';

import { PAQUETES_PORTAL, plantillaDeOrganizacion } from '@morphiqpos/contracts';
import { conTransaccion } from '@morphiqpos/data';

import { cuerpoDentroDelLimite } from '../http/limite-cuerpo.ts';
import { correlationIdDe } from '../observabilidad.ts';
import { buscadorDeProduccion, resolverAmbitoPortal } from './ambito.ts';
import { banderasDe } from './banderas.ts';
import {
  aperturaDeLaCuenta,
  entradaDelTelefono,
  estadoDelCarrito,
  huellaDelDispositivo,
  latir,
  type EstadoDelCarrito,
} from './carrito.ts';
import {
  errorHttp,
  peticionPropia,
  resolverDespliegue,
  respuesta,
  respuestaDeError,
  type PeticionDelPortal,
  type RespuestaDelPortal,
} from './http.ts';
import { permitirPortal } from './limite.ts';
import { exigirPortalAbierto, leerContextoDelNegocio, puedeOrdenarDesdeQR } from './negocio.ts';

/**
 * El latido del teléfono y el carrito de su mesa, en una transacción. `null`: este negocio no
 * acepta pedidos desde el teléfono, y entonces no hay carrito ni latido.
 */
export async function leerElCarrito(peticion: {
  readonly token: string;
  readonly organizacionId: string;
  readonly pimienta: string;
  readonly dispositivo: string;
  readonly ahora: Date;
}): Promise<EstadoDelCarrito | null> {
  const { token, organizacionId, pimienta, dispositivo, ahora } = peticion;
  return conTransaccion(async (tx) => {
    const ambito = await resolverAmbitoPortal(
      buscadorDeProduccion(organizacionId, tx),
      organizacionId,
      token,
    );
    const negocio = await leerContextoDelNegocio(tx, organizacionId);
    if (negocio === null) return null;
    const banderas = banderasDe(negocio.valores);
    exigirPortalAbierto(banderas);
    const paquete = plantillaDeOrganizacion(negocio.giro, negocio.paquete);
    const delPortal: readonly string[] = PAQUETES_PORTAL;
    if (!delPortal.includes(paquete) || !puedeOrdenarDesdeQR(paquete, banderas)) return null;
    const huella = huellaDelDispositivo(pimienta, dispositivo);
    await latir(tx, ambito, huella, ahora);
    const desde = await aperturaDeLaCuenta(tx, ambito);
    return estadoDelCarrito(tx, ambito, huella, { desde, ahora });
  });
}

/**
 * `POST /api/publico/qr/:token/carrito` — EL SONDEO DEL CARRITO COMPARTIDO (DP-9.5).
 *
 * Cada teléfono de la mesa lo llama cada 2-3 s con su id: deja su latido (así se cuentan las
 * «personas conectadas») y recibe el carrito de la mesa. NO es un comando: el latido es
 * presencia, no un hecho del negocio, y auditar cada sondeo escribiría una fila por teléfono
 * cada tres segundos. Lo que cambia el carrito —agregar, quitar, enviar— sí son comandos, con su
 * auditoría y su idempotencia. Mismo límite por token, misma frontera de origen que el resto.
 */
export async function servirElCarrito(
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
  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    return errorHttp(400, 'ENTRADA_INVALIDA', 'El cuerpo de la petición no es JSON.');
  }
  const entrada = entradaDelTelefono.safeParse(cuerpo);
  if (!entrada.success) {
    return errorHttp(400, 'ENTRADA_INVALIDA', 'No se pudo reconocer este teléfono.');
  }
  const correlationId = correlationIdDe(peticion.headers.get('x-correlation-id'));
  try {
    const { organizacionId, pimienta } = await resolverDespliegue(
      token,
      peticion.headers.get('host'),
    );
    const permiso = await permitirPortal('carrito_estado', token, pimienta, {
      correlationId,
      organizacionId,
    });
    if (!permiso.ok) {
      return respuesta(429, {
        ok: false,
        error: {
          codigo: 'REGLA_DE_NEGOCIO',
          mensaje: 'Demasiadas peticiones desde este código. Espera un momento.',
          datos: { regla: 'QR_DEMASIADAS_PETICIONES', esperaSegundos: permiso.esperaSegundos },
        },
      });
    }
    const datos = await leerElCarrito({
      token,
      organizacionId,
      pimienta,
      dispositivo: entrada.data.dispositivo,
      ahora: new Date(),
    });
    return respuesta(200, { ok: true, datos }, correlationId);
  } catch (error) {
    return respuestaDeError(error, 'publico.qr.carrito', { correlationId });
  }
}
