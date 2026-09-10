import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { TotalesOrden } from '@morphiqpos/domain/venta';

import { MESA_SIN_COMENSALES, ORDEN_ADMITE_PEDIDO, ORDEN_CERRADA } from './estados.ts';

/**
 * LAS ESCRITURAS DEL PORTAL, CON GUARDA DE ESTADO Y CON CUENTA DE FILAS.
 *
 * ── Por qué existe este archivo ───────────────────────────────────────────
 * Quien escribe por aquí es un desconocido con el token de una mesa: sin
 * sesión, desde un teléfono con mala cobertura y con el botón a un toque de
 * distancia. `conTransaccion` es READ COMMITTED por decisión explícita
 * (`packages/data/src/cliente.ts:152-159`) y las lecturas previas NO toman
 * `for update`: entre el `select` y el `update` cabe entero el cobro del
 * cajero.
 *
 * Un `update` sin guarda de estado que entra después de ese cobro reabre una
 * cuenta pagada —`estado='confirmada'` con `cerrada_en` puesto, que el `check
 * orden_cerrada_con_fecha` (045_restaurante.sql:51) permite— y deja líneas que
 * nadie cobró. Y esto es lo que lo vuelve invisible: un `update` que no
 * encuentra su fila **no da error**, devuelve cero filas y el código sigue como
 * si hubiera funcionado. Es la trampa de la §7 de `supabase-vercel-produccion`.
 *
 * Por eso todas las escrituras del portal viven aquí, y todas hacen lo mismo:
 *
 *   1. el estado esperado va EN EL `where`, no en un `if` que envejece entre la
 *      lectura y la escritura;
 *   2. la versión leída va EN EL `where`, así que dos escrituras nacidas de la
 *      misma lectura no se pisan: la segunda no encuentra fila;
 *   3. cero filas es un FALLO con `ErrorDominio` —nunca un `return` callado—,
 *      con un mensaje que la pantalla del comensal puede enseñar.
 *
 * Es la misma línea con la que su módulo hermano resuelve los tres sitios
 * equivalentes: `restaurante/pedido.ts:222`, `restaurante/cuenta.ts:183` y
 * `restaurante/mesas-escrituras.ts:99`.
 */

/** Lo que identifica la fila que se va a escribir, y con qué lectura se decidió. */
interface OrdenDestino {
  readonly organizacionId: string;
  readonly ordenId: string;
  /** La versión que devolvió el `select`. Va al `where`, no sólo al `set`. */
  readonly version: number;
  readonly ahora: Date;
}

export interface DatosConfirmarOrden extends OrdenDestino {
  readonly totales: TotalesOrden;
}

/**
 * Congela los totales del pedido y pasa la orden a `confirmada`.
 *
 * REGLA 1 de `F1-01` §3: `total_centavos` es la venta **sin propina**. Aquí
 * entran los totales que devolvió `cotizar` sobre las líneas persistidas y
 * nada más; la propina vive en `pagos` y se suma al cobrar.
 */
export async function confirmarOrdenDelPortal(
  tx: Transaccion,
  datos: DatosConfirmarOrden,
): Promise<void> {
  const { totales } = datos;

  const resultado = await tx
    .updateTable('ordenes')
    .set({
      estado: 'confirmada',
      subtotal_centavos: totales.subtotalCentavos,
      descuento_centavos: totales.descuentoCentavos,
      impuestos_centavos: totales.impuestosCentavos,
      total_centavos: totales.totalCentavos,
      costo_total_centavos: totales.costoTotalCentavos,
      utilidad_centavos: totales.utilidadCentavos,
      margen_bp: totales.margenBp,
      version: datos.version + 1,
      updated_at: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    // Las dos guardas del hallazgo 1: el estado impide escribir sobre una
    // cuenta que el cajero acaba de cobrar; la versión impide que dos envíos
    // nacidos de la misma lectura se pisen los totales.
    .where('estado', 'in', [...ORDEN_ADMITE_PEDIDO])
    .where('version', '=', datos.version)
    .executeTakeFirst();

  exigirUnaFila(
    resultado,
    new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Esa cuenta cambió mientras se enviaba el pedido. Actualiza la pantalla antes de reintentar.',
    ),
  );
}

export interface DatosCuentaSolicitada extends OrdenDestino {
  readonly mesaNumero: number;
  /** El código que ya se imprimió, si la cuenta se pidió antes. */
  readonly codigoPrevio: string | null;
  readonly totales: TotalesOrden;
  readonly propinaPuntosBase: number;
  readonly propinaTipo: string;
}

/**
 * Pasa la orden a `cuenta_solicitada` y devuelve el código para la caja.
 *
 * ── Los totales se congelan aquí, con lo que acaba de calcular `cotizar` ───
 * Es lo mismo que hace `restaurante/cuenta.ts:172` y por la misma razón: «para
 * que Caja lea el mismo número que se imprimió en la precuenta». La propina se
 * guarda como puntos base y NO toca `total_centavos` (regla 1).
 */
export async function marcarCuentaSolicitadaDesdeQR(
  tx: Transaccion,
  datos: DatosCuentaSolicitada,
): Promise<string> {
  const { totales } = datos;
  // Si la cuenta ya se pidió una vez, el comensal tiene ese código en la mano.
  // Regenerarlo dejaría al cajero buscando un número que ya no está.
  const codigo = datos.codigoPrevio ?? generarCodigoCaja(datos.mesaNumero);

  const resultado = await tx
    .updateTable('ordenes')
    .set({
      estado: 'cuenta_solicitada',
      subtotal_centavos: totales.subtotalCentavos,
      descuento_centavos: totales.descuentoCentavos,
      impuestos_centavos: totales.impuestosCentavos,
      total_centavos: totales.totalCentavos,
      costo_total_centavos: totales.costoTotalCentavos,
      utilidad_centavos: totales.utilidadCentavos,
      margen_bp: totales.margenBp,
      // Hallazgo 4: por el camino del mesero la orden SIEMPRE sale de aquí con
      // su código; por el camino del QR salía con `null`, y era la única cuenta
      // del sistema en ese estado sin el número que el cajero teclea.
      codigo_caja: codigo,
      propina_puntos_base: datos.propinaPuntosBase,
      propina_tipo: datos.propinaTipo,
      // Una vez que el comensal eligió algo, el origen es el portal — incluso
      // si eligió «sin propina» o «decidir en caja». Sobrescribe el
      // `pendiente_portal_qr` que dejó el mesero al disparar la cuenta.
      propina_origen: 'portal_qr',
      version: datos.version + 1,
      updated_at: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    // Hallazgo 2: sin esta línea, el comensal que pulsa «Pedir la cuenta»
    // mientras el mesero cobra devuelve a `cuenta_solicitada` una venta ya
    // pagada, y la cuenta reaparece en la pantalla de cobros.
    .where('estado', 'not in', [...ORDEN_CERRADA])
    .where('version', '=', datos.version)
    .executeTakeFirst();

  exigirUnaFila(
    resultado,
    new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Esa cuenta cambió mientras la pedías. Pregúntale al mesero antes de reintentar.',
    ),
  );

  return codigo;
}

export interface DatosMesa {
  readonly organizacionId: string;
  readonly mesaId: string;
  readonly estado: string;
  readonly ahora: Date;
}

/**
 * Mueve la mesa, sólo si sigue habiendo alguien sentado en ella.
 *
 * La guarda es `MESA_SIN_COMENSALES` en el `where`: si el mesero liberó la mesa
 * entre la lectura y esta escritura, aquí no hay fila que actualizar y la
 * transacción entera revierte. Sin ella quedaba una mesa marcada como ocupada
 * sin nadie sentado —el segundo daño del hallazgo 2—.
 */
export async function moverMesaDelPortal(tx: Transaccion, datos: DatosMesa): Promise<void> {
  const resultado = await tx
    .updateTable('mesas')
    .set({ estado: datos.estado, updated_at: datos.ahora })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.mesaId)
    .where('estado', 'not in', [...MESA_SIN_COMENSALES])
    .executeTakeFirst();

  exigirUnaFila(
    resultado,
    new ErrorDominio(
      'TRANSICION_INVALIDA',
      'Esta mesa se cerró mientras enviabas. Pide ayuda al personal antes de reintentar.',
      { estado: datos.estado },
    ),
  );
}

export interface DatosValoracion {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly score: number;
  readonly emoji: string | null;
  readonly comentario: string | null;
  readonly ahora: Date;
}

/**
 * Guarda la valoración, y sólo si nadie la había dejado ya.
 *
 * Devuelve `false` cuando no hubo fila que escribir. Aquí cero filas NO es un
 * error —insistir en valorar no puede serlo, y dos teléfonos de la misma mesa
 * valorando a la vez es normal—, pero sí tiene que ser un hecho que el comando
 * conozca: hasta el hallazgo 5, el segundo teléfono sobrescribía al primero y
 * la respuesta que el primero ya había visto dejaba de ser cierta.
 *
 * La condición `satisfaccion_score is null` vive en el `where` y no en un `if`
 * anterior porque entre el `if` y el `update` hay un `await` sin bloqueo.
 */
export async function guardarValoracionDelPortal(
  tx: Transaccion,
  datos: DatosValoracion,
): Promise<boolean> {
  const resultado = await tx
    .updateTable('ordenes')
    .set({
      satisfaccion_score: datos.score,
      satisfaccion_emoji: datos.emoji,
      satisfaccion_comentario: datos.comentario,
      // El `check orden_satisfaccion_completa` exige que la fecha y la
      // calificación existan o falten a la vez.
      satisfaccion_en: datos.ahora,
      updated_at: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .where('satisfaccion_score', 'is', null)
    .executeTakeFirst();

  return filasDe(resultado) === 1;
}

/** Lo que Kysely devuelve de un `update` sin `returning`. */
interface ResultadoEscritura {
  readonly numUpdatedRows: bigint;
}

function filasDe(resultado: ResultadoEscritura): number {
  return Number(resultado.numUpdatedRows);
}

/**
 * Cero filas es un fallo, y hay que decirlo.
 *
 * Postgres no lanza cuando un `update` no encuentra su fila: devuelve cero y la
 * transacción sigue viva. Sin esta comprobación, la guarda del `where` no
 * serviría de nada —el comando seguiría adelante y respondería «listo».
 */
function exigirUnaFila(resultado: ResultadoEscritura, error: ErrorDominio): void {
  if (filasDe(resultado) === 1) return;
  throw error;
}

/**
 * `M05-4821`: el formato de `Mesero.jsx:59-60`, generado en el SERVIDOR.
 *
 * Los cuatro dígitos salen de `crypto.getRandomValues` y no de `Math.random`.
 * No es un identificador —lo es `ordenes.id`— sino el código corto que el
 * cajero teclea para encontrar la cuenta, y por eso conserva exactamente la
 * forma que Miguel ya imprime en la precuenta.
 *
 * Está duplicado de `restaurante/cuenta.ts:224` a propósito y con constancia:
 * allí la función es privada y ese archivo es de otro módulo en esta fase. Lo
 * correcto es exportarla una vez desde `restaurante`; va en el informe.
 */
function generarCodigoCaja(mesaNumero: number): string {
  const azar = crypto.getRandomValues(new Uint16Array(1))[0] ?? 0;
  const sufijo = 1000 + (azar % 9000);
  return `M${String(mesaNumero).padStart(2, '0')}-${sufijo}`;
}
