import {
  esErrorDominio,
  type Ambito,
  type CodigoComando,
  type ErrorComando,
  type Resultado,
} from '@morphiqpos/contracts';
import type { ZodType } from 'zod';

import { auditar } from './auditoria.ts';
import { type ContextoComando, type DefinicionComando } from './definicion.ts';
import { fallo, mensajeDe, validar } from './errores.ts';
import type { EjecucionGuardada, RepositorioComandos } from './repositorio.ts';
import { huella } from './saneado.ts';

export { definirComando } from './definicion.ts';
export type { ContextoComando, DefinicionComando } from './definicion.ts';
export type { RepositorioComandos } from './repositorio.ts';
export { mensajeDe };

/**
 * El envoltorio `comando()` — `04-ARQUITECTURA §3`.
 *
 * Resuelve, una sola vez y para todos: validación de la entrada, comprobación
 * de rol, comprobación de paquete, apertura de transacción, clave de
 * idempotencia, auditoría, correlation id y traducción de errores.
 * **Ningún comando reimplementa nada de eso.**
 *
 * ── Una sola transacción ───────────────────────────────────────────────────
 * Todo lo que toca la base ocurre dentro de la MISMA transacción: leer el
 * paquete, reclamar la clave, ejecutar el cuerpo, auditar y guardar la
 * respuesta. R10 dice «o confirma todo, o no persiste nada», y eso incluye al
 * propio envoltorio: si la auditoría fallara después de confirmar el cobro,
 * habría un cobro sin rastro.
 *
 * ── Por qué devuelve una unión y no lanza ──────────────────────────────────
 * Un `throw` obliga a cada ruta a un `try/catch`, y un `catch` es exactamente
 * donde se silencian los errores que R12 prohíbe silenciar. Con
 * `{ ok: false, error }`, ignorar el fallo es un error de tipos.
 */

export interface Dependencias<TX> {
  readonly repositorio: RepositorioComandos<TX>;
  readonly conTransaccion: <T>(fn: (tx: TX) => Promise<T>) => Promise<T>;
  readonly ahora?: () => Date;
  readonly nuevoId?: () => string;
}

export interface PeticionComando {
  readonly entrada: unknown;
  /** Del servidor, nunca del cuerpo de la petición (R16). */
  readonly ambito: Ambito;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  /** Sólo para pruebas: interrumpe el paso con ese nombre. */
  readonly interrumpirEn?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAVE_MINIMA = 8;

/** Rechazo decidido dentro de la transacción: aborta y viaja con su código. */
class Rechazo extends Error {
  constructor(
    readonly codigo: CodigoComando,
    readonly auditable: 'denegado' | 'conflicto' | 'error' | null,
    readonly error?: ErrorComando,
  ) {
    super(codigo);
    this.name = 'Rechazo';
  }
}

/** La clave ya tenía una ejecución confirmada: se devuelve aquélla. */
class Reintento extends Error {
  constructor(readonly previa: EjecucionGuardada) {
    super('reintento');
    this.name = 'Reintento';
  }
}

export function crearComando<TX>(deps: Dependencias<TX>) {
  const ahora = deps.ahora ?? (() => new Date());
  const nuevoId = deps.nuevoId ?? (() => crypto.randomUUID());
  const { repositorio, conTransaccion } = deps;

  return async function ejecutarComando<E extends ZodType, S>(
    definicion: DefinicionComando<TX, E, S>,
    peticion: PeticionComando,
  ): Promise<Resultado<S>> {
    const correlationId =
      peticion.correlationId !== undefined && UUID.test(peticion.correlationId)
        ? peticion.correlationId
        : nuevoId();

    const { ambito } = peticion;
    const instante = ahora();

    const registrarRechazo = async (
      codigo: CodigoComando,
      resultado: 'denegado' | 'conflicto' | 'error',
      entrada?: unknown,
    ): Promise<void> => {
      await auditar(repositorio, null, {
        definicion,
        ambito,
        correlationId,
        entidadId: null,
        payload: { resultado, codigo, ...(entrada === undefined ? {} : { entrada }) },
      });
    };

    // ── Rol ─────────────────────────────────────────────────────────────────
    // Antes de tocar la base y antes de mirar la entrada. Si el 400 llegara
    // primero, un rol sin permiso podría sondear el esquema de un comando
    // administrativo campo por campo, a base de entradas inválidas.
    if (!definicion.roles.includes(ambito.rol)) {
      await registrarRechazo('SIN_PERMISO', 'denegado');
      return { ok: false, error: fallo('SIN_PERMISO'), correlationId };
    }

    let entradaValidada: unknown;

    try {
      const datos = await conTransaccion(async (tx) => {
        // ── Paquete de la organización (A-42) ───────────────────────────────
        const paquete = await repositorio.leerPaquete(tx, ambito.organizacionId);
        // Fallar cerrado: si no se sabe qué contrató la organización, no se
        // ejecuta. Un paquete ilegible no es un permiso.
        if (paquete === null || !definicion.paquetes.includes(paquete)) {
          throw new Rechazo('PAQUETE_NO_INCLUYE', 'denegado');
        }

        // ── Forma de la entrada ─────────────────────────────────────────────
        const validada = validar(definicion.entrada, peticion.entrada);
        if (!validada.ok) {
          // No se audita: es ruido de teclado y de clientes viejos.
          throw new Rechazo('ENTRADA_INVALIDA', null, validada.error);
        }
        entradaValidada = validada.datos;

        // ── Clave de idempotencia (R10) ─────────────────────────────────────
        const clave = peticion.idempotencyKey;
        if (definicion.escribe && (clave === undefined || clave.length < CLAVE_MINIMA)) {
          throw new Rechazo('IDEMPOTENCIA_REQUERIDA', null);
        }

        if (clave !== undefined) {
          const previa = await repositorio.leerEjecucion(
            tx,
            ambito.organizacionId,
            definicion.nombre,
            clave,
          );
          if (previa !== null) throw new Reintento(previa);

          const reclamacion = await repositorio.reclamarClave(tx, {
            organizacionId: ambito.organizacionId,
            comando: definicion.nombre,
            idempotencyKey: clave,
            huellaEntrada: huella(validada.datos),
            identidadId: ambito.identidadId,
            correlationId,
          });
          // `duplicada` aquí significa que otra ejecución confirmó mientras
          // ésta esperaba en el índice único. Se resuelve como reintento.
          if (reclamacion === 'duplicada') {
            const confirmada = await repositorio.leerEjecucion(
              tx,
              ambito.organizacionId,
              definicion.nombre,
              clave,
            );
            if (confirmada !== null) throw new Reintento(confirmada);
            throw new Rechazo('COMANDO_EN_CURSO', 'conflicto');
          }
          if (reclamacion === 'ocupada') throw new Rechazo('COMANDO_EN_CURSO', 'conflicto');
        }

        // ── Cuerpo ──────────────────────────────────────────────────────────
        const rastro: { entidadId: string | null; payload: Record<string, unknown> }[] = [];
        const pasosVistos = new Set<string>();

        const ctx: ContextoComando<TX> = {
          ambito,
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

        // Si se pidió interrumpir un paso y el comando terminó sin ejecutarlo,
        // el nombre está mal escrito. Dejarlo pasar haría que la prueba de
        // inyección afirmara una atomicidad que nadie probó.
        if (peticion.interrumpirEn !== undefined && !pasosVistos.has(peticion.interrumpirEn)) {
          throw new PasoInexistente(peticion.interrumpirEn);
        }

        // ── Auditoría del éxito, DENTRO de la transacción ───────────────────
        if (definicion.escribe) {
          const primero = rastro[0];
          if (primero === undefined) throw new SinRastro(definicion.nombre);
          await auditar(repositorio, tx, {
            definicion,
            ambito,
            correlationId,
            entidadId: primero.entidadId,
            payload: { resultado: 'ok', entrada: validada.datos, ...primero.payload },
          });
        }

        if (clave !== undefined) {
          await repositorio.completarEjecucion(tx, {
            organizacionId: ambito.organizacionId,
            comando: definicion.nombre,
            idempotencyKey: clave,
            respuesta: salida,
            ahora: instante,
          });
        }

        return salida;
      });

      return { ok: true, datos, correlationId, reintento: false };
    } catch (error) {
      if (error instanceof Reintento) {
        return atenderReintento<S>(error.previa, {
          huellaEntrada: huella(entradaValidada),
          correlationId,
          contar: () =>
            repositorio.registrarReintento(
              ambito.organizacionId,
              definicion.nombre,
              peticion.idempotencyKey ?? '',
            ),
        });
      }

      if (error instanceof Rechazo) {
        if (error.auditable !== null) {
          await registrarRechazo(error.codigo, error.auditable);
        }
        return { ok: false, error: error.error ?? fallo(error.codigo), correlationId };
      }

      if (esErrorDominio(error)) {
        return {
          ok: false,
          error: {
            codigo: 'REGLA_DE_NEGOCIO',
            mensaje: error.message,
            datos: { regla: error.codigo },
          },
          correlationId,
        };
      }

      await registrarRechazo('ERROR_INTERNO', 'error');
      // El mensaje original se queda en el servidor: filtrarlo revela nombres
      // de tablas e índices. El correlation id es lo que une esto con la
      // auditoría y con el registro del servidor.
      console.error(
        `[comando] ${definicion.nombre} falló (correlationId ${correlationId}):`,
        error,
      );
      return { ok: false, error: fallo('ERROR_INTERNO'), correlationId };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────

class SinRastro extends Error {
  constructor(nombre: string) {
    super(
      `El comando "${nombre}" declara escribir y no llamó a ctx.auditar(). ` +
        'Declarar sensible algo que no deja rastro convierte la auditoría en un adorno.',
    );
    this.name = 'SinRastro';
  }
}

class PasoInexistente extends Error {
  constructor(nombre: string) {
    super(
      `Se pidió interrumpir el paso "${nombre}" y el comando nunca lo ejecutó. ` +
        'Una inyección de fallo que no interrumpe nada afirma una atomicidad que nadie probó.',
    );
    this.name = 'PasoInexistente';
  }
}

async function atenderReintento<S>(
  previa: EjecucionGuardada,
  contexto: { huellaEntrada: string; correlationId: string; contar: () => Promise<void> },
): Promise<Resultado<S>> {
  const { huellaEntrada, correlationId } = contexto;

  // Misma clave con otra entrada es un error del cliente, no un reintento.
  // Devolver la respuesta guardada escondería que pidió una cosa distinta.
  if (previa.huellaEntrada !== huellaEntrada) {
    return { ok: false, error: fallo('IDEMPOTENCIA_CONFLICTO'), correlationId };
  }

  await contexto.contar();
  return { ok: true, datos: previa.respuesta as S, correlationId, reintento: true };
}
