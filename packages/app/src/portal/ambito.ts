import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { obtenerDb } from '@morphiqpos/data';

/**
 * La SEGUNDA puerta de entrada al sistema (F1-02 E7, F1-04 §36.1).
 *
 * Quien escanea un código no ha iniciado sesión y nunca la iniciará. Su ámbito
 * no sale de una cookie: sale del token de la mesa, y se resuelve aquí —en un
 * solo sitio— igual que `resolverSesion` es el único sitio donde nace el ámbito
 * de un empleado.
 *
 * ── Por qué su propio tipo y no un `Ambito` con un rol inventado ───────────
 * `Ambito` lleva `identidadId`, `empleoId` y `rol`. El comensal no tiene
 * ninguno de los tres. Darle un rol de empleado —«mesero», «publico»— para
 * poder reusar el envoltorio le abriría, por construcción, todo lo que ese rol
 * puede hacer: bastaría con que alguien añadiera un comando con ese rol en la
 * lista para regalárselo a cualquiera que escanee un QR. `AmbitoPortal` no
 * tiene rol, así que no hay nada que ampliar por descuido.
 *
 * ── La respuesta es la MISMA en los cuatro casos ───────────────────────────
 * No existe · no es de esta organización · la mesa está de baja · el QR está
 * apagado. Los cuatro devuelven `QR_TOKEN_INVALIDO` con el mismo mensaje.
 * Distinguirlos permitiría enumerar mesas ajenas probando tokens y leer, en la
 * diferencia de la respuesta, cuáles existen.
 */

/** Lo que la mesa le presta al comensal. Ni un campo más. */
export interface AmbitoPortal {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly mesaId: string;
  readonly mesaNumero: number;
  readonly mesaNombre: string | null;
  /** Snapshot del token con el que entró; va a `solicitudes_qr.token_mesa`. */
  readonly tokenMesa: string;
  readonly estadoMesa: string;
  readonly ordenActivaId: string | null;
  /** Sin mesero asignado no se abre mesa desde el QR (`qrPedidoFlow.js:63`). */
  readonly empleadoAsignadoId: string | null;
}

/** La fila cruda que devuelve la búsqueda por token, antes de comprobar nada. */
export interface FilaMesaPorToken {
  readonly id: string;
  readonly organizacion_id: string;
  readonly sucursal_id: string;
  readonly numero: number;
  readonly nombre: string | null;
  readonly estado: string;
  readonly orden_activa_id: string | null;
  readonly empleado_asignado_id: string | null;
  readonly qr_activa: boolean;
  readonly activa: boolean;
}

/**
 * Cómo se buscan las mesas de un token. Se inyecta para poder probar la
 * decisión de seguridad sin base de datos.
 *
 * Devuelve una LISTA y no una fila porque `mesas.qr_token` no tiene índice
 * único: dos mesas podrían compartir token y la consulta traería dos filas.
 * Ver `buscarMesasPorToken`.
 */
export type BuscadorDeMesa = (token: string) => Promise<readonly FilaMesaPorToken[]>;

/**
 * Forma del token. `generarTokenMesa` produce texto seguro para URL.
 *
 * Se comprueba ANTES de consultar: así una ráfaga de tokens con comodines ni
 * siquiera llega a la base.
 */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{6,120}$/;

/** El único mensaje. Ver el encabezado: los cuatro casos se ven igual. */
const MENSAJE_TOKEN = 'Este código QR ya no es válido. Pide ayuda al personal.';

export function tokenConFormaValida(token: string): boolean {
  return FORMA_TOKEN.test(token);
}

function tokenInvalido(): ErrorDominio {
  return new ErrorDominio('QR_TOKEN_INVALIDO', MENSAJE_TOKEN);
}

/**
 * Resuelve el ámbito del comensal, o falla cerrado.
 *
 * `organizacionEsperada` es la del despliegue, resuelta en el servidor
 * (`negocioDelDespliegue`). Nunca llega del cliente: si llegara, el token de un
 * negocio serviría para leer el menú de otro.
 */
export async function resolverAmbitoPortal(
  buscar: BuscadorDeMesa,
  organizacionEsperada: string,
  token: string,
): Promise<AmbitoPortal> {
  if (!tokenConFormaValida(token)) throw tokenInvalido();

  const filas = await buscar(token);

  // Cero filas es «no existe». Dos o más es un token repetido, y sin índice
  // único la base no lo impide todavía: se falla cerrado en vez de servir «la
  // primera», que sería enseñarle a un comensal la cuenta de otra mesa.
  if (filas.length !== 1) throw tokenInvalido();

  const fila = filas[0];
  if (fila === undefined) throw tokenInvalido();

  // El filtro por organización se comprueba AQUÍ además de en el `where` de la
  // consulta. Es la comprobación que la prueba puede ejercitar sin base, y la
  // que sigue en pie si alguien reescribe la consulta.
  if (fila.organizacion_id !== organizacionEsperada) throw tokenInvalido();
  if (!fila.activa || !fila.qr_activa) throw tokenInvalido();

  return {
    organizacionId: fila.organizacion_id,
    sucursalId: fila.sucursal_id,
    mesaId: fila.id,
    mesaNumero: fila.numero,
    mesaNombre: fila.nombre,
    tokenMesa: token,
    estadoMesa: fila.estado,
    ordenActivaId: fila.orden_activa_id,
    empleadoAsignadoId: fila.empleado_asignado_id,
  };
}

/** Columnas que sostienen la decisión. Ninguna sale en una respuesta. */
const COLUMNAS_MESA = [
  'id',
  'organizacion_id',
  'sucursal_id',
  'numero',
  'nombre',
  'estado',
  'orden_activa_id',
  'empleado_asignado_id',
  'qr_activa',
  'activa',
] as const;

/**
 * La búsqueda de producción.
 *
 * Se acota a la organización del despliegue en el `where` **y** se vuelve a
 * comprobar en `resolverAmbitoPortal`. Defensa en profundidad barata: son dos
 * comprobaciones de la misma verdad en dos capas distintas.
 *
 * El `limit 2` no es un descuido: pide una de más justamente para poder
 * detectar el token duplicado que hoy nada impide.
 */
export function buscadorDeProduccion(organizacionId: string, db?: Transaccion): BuscadorDeMesa {
  return async (token: string) => {
    const base = db ?? obtenerDb();
    return base
      .selectFrom('mesas')
      .select(COLUMNAS_MESA)
      .where('qr_token', '=', token)
      .where('organizacion_id', '=', organizacionId)
      .limit(2)
      .execute();
  };
}
