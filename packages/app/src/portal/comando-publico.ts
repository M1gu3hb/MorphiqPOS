import 'server-only';

import { esErrorDominio, esPaquete, type Resultado } from '@morphiqpos/contracts';
import { conTransaccion, repoComandos } from '@morphiqpos/data';
import type { ZodType } from 'zod';

import { fallo, validar } from '../errores.ts';
import { atenderReintento, PasoInexistente, Rechazo, Reintento, SinRastro } from '../fallos.ts';
import { huella, payloadDeAuditoria } from '../saneado.ts';
import { buscadorDeProduccion, resolverAmbitoPortal } from './ambito.ts';
import { banderasDe } from './banderas.ts';
import type { ComandoPublico, ContextoPortal } from './definicion-publica.ts';
import { CLAVE_MINIMA, reclamarClaveAnonima } from './idempotencia.ts';
import { permitirPortal } from './limite.ts';
import { exigirPortalAbierto, leerContextoDelNegocio } from './negocio.ts';

/**
 * El envoltorio de un comando PÚBLICO (E7-3).
 *
 * Da lo mismo que `comando()`: una transacción, comprobación de paquete, clave
 * de idempotencia obligatoria, auditoría y traducción de errores. **Lo que
 * cambia es de dónde sale el ámbito, y por eso no puede ser el mismo.**
 *
 * `comando()` exige un `Ambito` con identidad, empleo y rol. El comensal no
 * tiene ninguno de los tres: su única credencial es el token de la mesa. Es la
 * misma razón por la que `entrarConPin` tampoco pasa por `comando()` —«aquí es
 * donde el ámbito nace»—, sólo que aquí nace de un código impreso.
 *
 * Lo que NO se reimplementa: la reclamación de la clave, la lectura de una
 * ejecución previa, el cierre y la auditoría son las MISMAS funciones de
 * `repoComandos` que usa el envoltorio de empleado, y el reintento lo resuelve
 * el mismo `atenderReintento`. La única pieza propia es el `insert` de la
 * reclamación, y sólo porque `repoComandos.reclamarClave` declara
 * `identidadId: string` y aquí no hay identidad. Ver `reclamarClaveAnonima`.
 *
 * ── Todo comando público ESCRIBE ──────────────────────────────────────────
 * Los cinco cambian estado. No hay bandera `escribe`: la clave de idempotencia
 * y el rastro son obligatorios siempre, porque un comensal con mala cobertura
 * va a tocar el botón dos veces y eso no puede ser dos pedidos.
 */

export interface PeticionPublica {
  readonly token: string;
  /** La organización del despliegue. Del servidor, nunca del cliente (R16). */
  readonly organizacionId: string;
  readonly entrada: unknown;
  readonly idempotencyKey?: string | undefined;
  readonly correlationId?: string | undefined;
  /** Pimienta del servidor, para la clave del límite de tasa. */
  readonly pimienta: string;
  /**
   * Sólo para pruebas: interrumpe el paso con ese nombre.
   *
   * Existe por lo mismo que en `comando()`: sin poder romper el comando a la
   * mitad, «la transacción revierte» es una afirmación que nadie ha comprobado.
   * Por NOMBRE y no por índice, para que agregar un paso en medio no cambie en
   * silencio cuál se interrumpe.
   */
  readonly interrumpirEn?: string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ejecuta un comando público de principio a fin. Nunca lanza: devuelve unión. */
export async function ejecutarComandoPublico<E extends ZodType, S>(
  definicion: ComandoPublico<E, S>,
  peticion: PeticionPublica,
): Promise<Resultado<S>> {
  const correlationId =
    peticion.correlationId !== undefined && UUID.test(peticion.correlationId)
      ? peticion.correlationId
      : crypto.randomUUID();
  const instante = new Date();

  // El límite se cuenta ANTES de tocar nada y FUERA de la transacción: un
  // intento fallido gasta cuota igual, o barrer el endpoint con entradas
  // inválidas saldría gratis.
  const permiso = await permitirPortal(definicion.accion, peticion.token, peticion.pimienta);
  if (!permiso.ok) {
    return {
      ok: false,
      error: {
        codigo: 'REGLA_DE_NEGOCIO',
        mensaje: 'Demasiadas peticiones desde este código. Espera un momento.',
        datos: { regla: 'QR_DEMASIADAS_PETICIONES', esperaSegundos: permiso.esperaSegundos },
      },
      correlationId,
    };
  }

  const clave = peticion.idempotencyKey;
  if (clave === undefined || clave.length < CLAVE_MINIMA) {
    return { ok: false, error: fallo('IDEMPOTENCIA_REQUERIDA'), correlationId };
  }

  let entradaValidada: unknown;

  try {
    const datos = await conTransaccion(async (tx) => {
      // 1 · El ámbito. Del token, resuelto contra la organización del
      //     despliegue. Es lo primero: sin mesa válida no hay nada más.
      const ambito = await resolverAmbitoPortal(
        buscadorDeProduccion(peticion.organizacionId, tx),
        peticion.organizacionId,
        peticion.token,
      );

      // 2 · Paquete y portal. Fallar cerrado: si no se sabe qué contrató la
      //     organización, no se ejecuta.
      const negocio = await leerContextoDelNegocio(tx, ambito.organizacionId);
      if (negocio === null || !esPaquete(negocio.paquete)) {
        throw new Rechazo('PAQUETE_NO_INCLUYE', null);
      }
      const paquete = negocio.paquete;
      if (!definicion.paquetes.includes(paquete)) throw new Rechazo('PAQUETE_NO_INCLUYE', null);

      const banderas = banderasDe(negocio.valores);
      exigirPortalAbierto(banderas);

      // 3 · Forma de la entrada. `strict()`: una propiedad que el esquema no
      //     declara se rechaza en vez de ignorarse, y por ahí es por donde
      //     entraría un `precio` del cliente.
      const validada = validar(definicion.entrada, peticion.entrada);
      if (!validada.ok) throw new Rechazo('ENTRADA_INVALIDA', null, validada.error);
      entradaValidada = validada.datos;

      // 4 · Idempotencia (R10), reclamada DENTRO de la transacción para que un
      //     fallo la libere y un reintento legítimo vuelva a ejecutar.
      const previa = await repoComandos.leerEjecucion(
        tx,
        ambito.organizacionId,
        definicion.nombre,
        clave,
      );
      if (previa !== null) throw new Reintento(previa);

      const reclamacion = await reclamarClaveAnonima(tx, {
        organizacionId: ambito.organizacionId,
        comando: definicion.nombre,
        idempotencyKey: clave,
        huellaEntrada: huella(validada.datos),
        correlationId,
      });
      if (reclamacion === 'duplicada') {
        const confirmada = await repoComandos.leerEjecucion(
          tx,
          ambito.organizacionId,
          definicion.nombre,
          clave,
        );
        if (confirmada !== null) throw new Reintento(confirmada);
        throw new Rechazo('COMANDO_EN_CURSO', null);
      }
      if (reclamacion === 'ocupada') throw new Rechazo('COMANDO_EN_CURSO', null);

      // 5 · El cuerpo.
      const rastro: { entidadId: string | null; payload: Record<string, unknown> }[] = [];
      const pasosVistos = new Set<string>();
      const ctx: ContextoPortal = {
        ambito,
        banderas,
        paquete,
        correlationId,
        ahora: instante,
        tx,
        async paso(nombre, fn) {
          pasosVistos.add(nombre);
          if (peticion.interrumpirEn === nombre) {
            throw new Error(`paso interrumpido a propósito: ${nombre}`);
          }
          return fn();
        },
        auditar(entrada) {
          rastro.push(entrada);
        },
      };

      const salida = await definicion.ejecutar(ctx, validada.datos);

      // Un nombre mal escrito haría que la prueba de inyección afirmara una
      // atomicidad que nadie probó, así que se rechaza en vez de pasar.
      if (peticion.interrumpirEn !== undefined && !pasosVistos.has(peticion.interrumpirEn)) {
        throw new PasoInexistente(peticion.interrumpirEn);
      }

      // 6 · Auditoría del éxito, DENTRO de la transacción. `identidad_id` va
      //     nulo —no hay persona— y la mesa es lo que identifica al actor.
      const primero = rastro[0];
      if (primero === undefined) throw new SinRastro(definicion.nombre);
      await repoComandos.escribirAuditoria(tx, {
        organizacionId: ambito.organizacionId,
        identidadId: null,
        terminalId: null,
        accion: definicion.nombre,
        entidad: definicion.entidad,
        entidadId: primero.entidadId,
        correlationId,
        payload: payloadDeAuditoria({
          v: 1,
          comando: definicion.nombre,
          origen: 'portal_qr',
          mesaId: ambito.mesaId,
          mesaNumero: ambito.mesaNumero,
          entrada: validada.datos,
          ...primero.payload,
        }),
      });

      await repoComandos.completarEjecucion(tx, {
        organizacionId: ambito.organizacionId,
        comando: definicion.nombre,
        idempotencyKey: clave,
        respuesta: salida,
        ahora: instante,
      });

      return salida;
    });

    return { ok: true, datos, correlationId, reintento: false };
  } catch (error) {
    return traducirFallo<S>(error, {
      comando: definicion.nombre,
      correlationId,
      huellaEntrada: huella(entradaValidada),
      organizacionId: peticion.organizacionId,
      idempotencyKey: clave,
    });
  }
}

interface ContextoFallo {
  readonly comando: string;
  readonly correlationId: string;
  readonly huellaEntrada: string;
  readonly organizacionId: string;
  readonly idempotencyKey: string;
}

/**
 * Traduce lo que sale de la transacción a la unión de respuesta.
 *
 * Ningún rechazo de aquí escribe en `auditoria`. Es una decisión, no un olvido:
 * este endpoint es anónimo, así que una fila por intento fallido convierte la
 * tabla de auditoría en un amplificador de escritura que cualquiera dispara
 * desde la calle. Lo que cuenta los intentos es `limite_tasa`, que para eso
 * está, y lo que no cuadre queda en el registro del servidor con su
 * correlation id.
 */
async function traducirFallo<S>(error: unknown, ctx: ContextoFallo): Promise<Resultado<S>> {
  const { correlationId } = ctx;

  if (error instanceof Reintento) {
    return atenderReintento<S>(error.previa, {
      huellaEntrada: ctx.huellaEntrada,
      correlationId,
      contar: () =>
        conTransaccion((tx) =>
          repoComandos.registrarReintento(tx, ctx.organizacionId, ctx.comando, ctx.idempotencyKey),
        ),
    });
  }

  if (error instanceof Rechazo) {
    return { ok: false, error: error.error ?? fallo(error.codigo), correlationId };
  }

  if (esErrorDominio(error)) {
    return {
      ok: false,
      error: {
        codigo: 'REGLA_DE_NEGOCIO',
        mensaje: error.message,
        datos: { ...error.detalles, regla: error.codigo },
      },
      correlationId,
    };
  }

  // El mensaje original se queda en el servidor: filtrarlo revela nombres de
  // tablas y de índices a un desconocido, que es peor aquí que en gestión.
  console.error(`[portal] ${ctx.comando} falló (correlationId ${correlationId}):`, error);
  return { ok: false, error: fallo('ERROR_INTERNO'), correlationId };
}
