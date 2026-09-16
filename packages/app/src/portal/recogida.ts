import 'server-only';

import { ErrorDominio, validarEntorno } from '@morphiqpos/contracts';
import { conTransaccion, type Transaccion } from '@morphiqpos/data';

// El MISMO hash que usa el enrolamiento de terminales. Calcularlo aquí de otra
// manera haría que el token emitido desde Configuración no encontrara nunca su
// fila, y el monitor se quedaría en negro sin decir por qué.
import { hashearDispositivo } from '../identidad/dispositivo.ts';
import { negocioDelDespliegue } from '../negocio/despliegue.ts';
import type { RespuestaDelPortal } from './http.ts';

/**
 * F-329 · El monitor de recogida, y la superficie más expuesta del sistema.
 *
 * ── Por qué esta ruta no lleva sesión ────────────────────────────────────
 * El monitor colgado del salón no tiene quién inicie sesión. Nadie va a teclear
 * un PIN en una pantalla que sólo enseña nombres, y si hubiera que hacerlo, la
 * pantalla se quedaría apagada. Se protege con un token de terminal de SÓLO
 * LECTURA, emitido desde Configuración y con caducidad.
 *
 * ── Y por eso su contrato es la lista más corta posible ──────────────────
 * Devuelve nombres de pila y el estado. NADA más: ni importes, ni productos, ni
 * teléfonos, ni el número de la orden. Cualquiera que pase por el salón ve esta
 * respuesta; cualquier campo de más es un dato que el negocio publicó sin
 * saberlo. «Ana — listo» no le sirve a nadie que quiera hacer daño; «Ana, latte
 * de avena, $87, 55-1234-5678» sí.
 *
 * ── El nombre se recorta a la primera palabra ────────────────────────────
 * Se captura «Ana Sofía Bermúdez» porque la cajera escribe lo que le dicen, y
 * en el monitor eso es un apellido publicado. Se enseña «Ana». Recortarlo aquí
 * y no en la pantalla es lo que garantiza que el apellido no salga ni siquiera
 * en la respuesta: lo que no viaja no se puede filtrar.
 *
 * ── Y no hay caché ───────────────────────────────────────────────────────
 * Un intermediario que guarde esta respuesta le enseña al salón los nombres de
 * hace diez minutos, y la persona que ya se fue sigue en la pantalla mientras la
 * que espera no aparece.
 */

/** Cuántos caben en un monitor sin que haya que entrecerrar los ojos. */
const CABEN_EN_PANTALLA = 12;

/** Los dos estados que el salón necesita distinguir: lo demás no se publica. */
const EN_LA_PANTALLA = ['listo', 'en_preparacion'] as const;

export interface PedidoEnPantalla {
  /** La primera palabra del nombre. El apellido no sale de la base. */
  readonly nombre: string;
  /** `listo` o `preparando`. Dos estados: más es ruido a tres metros. */
  readonly estado: string;
}

export interface TableroDeRecogida {
  readonly listos: readonly PedidoEnPantalla[];
  readonly preparando: readonly PedidoEnPantalla[];
}

/** `GET /api/publico/recogida/:token`. */
export async function servirRecogida(token: string): Promise<RespuestaDelPortal> {
  try {
    const entorno = validarEntorno(process.env);
    const negocio = await negocioDelDespliegue(entorno.ORGANIZACION);
    const tablero = await conTransaccion(async (tx) =>
      tableroDeRecogida(tx, negocio.organizacionId, token, entorno.PIN_PEPPER),
    );
    return respuesta(200, { ok: true, datos: tablero });
  } catch (error) {
    // El token inválido es 404 y no 403: decir «existe pero no vale» le confirma
    // a quien prueba tokens que acertó con uno. Y el mensaje no cambia según la
    // causa, por lo mismo.
    const codigo = error instanceof ErrorDominio ? error.codigo : 'ERROR_INTERNO';
    const estado = codigo === 'PUENTE_NO_ENCONTRADO' || codigo === 'PUENTE_SIN_PERMISO' ? 404 : 500;
    return respuesta(estado, {
      ok: false,
      error: { codigo: 'QR_TOKEN_INVALIDO', mensaje: 'Ese monitor no está dado de alta.' },
    });
  }
}

export async function tableroDeRecogida(
  tx: Transaccion,
  organizacionId: string,
  token: string,
  pimienta: string,
): Promise<TableroDeRecogida> {
  const hash = hashearDispositivo(token, pimienta);

  const terminal = await tx
    .selectFrom('terminales')
    .select(['id', 'sucursal_id', 'activa', 'codigo_expira_en'])
    .where('organizacion_id', '=', organizacionId)
    .where('device_token_hash', '=', hash)
    .executeTakeFirst();

  if (terminal?.activa !== true) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese monitor no está dado de alta.');
  }
  // El token CADUCA. Un monitor que se descuelga y se lleva alguien seguiría
  // sirviendo nombres para siempre si el token no venciera.
  if (terminal.codigo_expira_en !== null && terminal.codigo_expira_en.getTime() < Date.now()) {
    throw new ErrorDominio('PUENTE_SIN_PERMISO', 'Ese monitor está caducado.');
  }

  const comandas = await tx
    .selectFrom('comandas as c')
    .leftJoin('ordenes as o', 'o.id', 'c.orden_id')
    .select(['c.estado as estado', 'o.nombre_pedido as nombrePedido'])
    .where('c.organizacion_id', '=', organizacionId)
    .where('c.sucursal_id', '=', terminal.sucursal_id)
    .where('c.estado', 'in', [...EN_LA_PANTALLA])
    .orderBy('c.created_at', 'asc')
    .execute();

  const listos: PedidoEnPantalla[] = [];
  const preparando: PedidoEnPantalla[] = [];

  for (const comanda of comandas) {
    // Sin nombre no hay nada que enseñar. Un «pedido 4821» en el monitor no le
    // dice nada a nadie: el cliente no se acuerda del número, se acuerda de que
    // dio su nombre.
    const nombre = primeraPalabra(comanda.nombrePedido);
    if (nombre === null) continue;

    const destino = comanda.estado === 'listo' ? listos : preparando;
    if (destino.length >= CABEN_EN_PANTALLA) continue;
    destino.push({ nombre, estado: comanda.estado === 'listo' ? 'listo' : 'preparando' });
  }

  return { listos, preparando };
}

/**
 * «Ana Sofía Bermúdez» → «Ana».
 *
 * El apellido no sale de aquí. Recortarlo en el servidor y no en la pantalla es
 * lo que garantiza que no viaje: lo que no viaja no se puede filtrar, ni por un
 * error de la vista ni por alguien mirando la respuesta en el navegador.
 */
function primeraPalabra(nombre: string | null): string | null {
  if (nombre === null) return null;
  const primera = nombre.trim().split(/\s+/)[0] ?? '';
  return primera === '' ? null : primera.slice(0, 20);
}

function respuesta(estado: number, cuerpo: unknown): RespuestaDelPortal {
  return {
    estado,
    cuerpo,
    cabeceras: {
      // Sin caché: un intermediario que la guarde deja en la pantalla a quien ya
      // se fue y esconde a quien está esperando.
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  };
}
