/**
 * Dobles para probar el envoltorio `comando()` sin base de datos.
 *
 * No son mocks de Kysely. El envoltorio está parametrizado sobre el tipo de
 * transacción a propósito: lo único que hace con `tx` es pasarlo al cuerpo y al
 * repositorio, así que no necesita saber qué es. Eso permite dos cosas:
 *
 *   · en producción se enlaza a la `Transaccion` real de Kysely;
 *   · aquí se enlaza a un objeto que registra si hubo confirmación o reversión.
 *
 * La transacción FALSA registra el hecho de revertir. Eso prueba que el
 * envoltorio pide la reversión, no que Postgres la ejecute — esa mitad la
 * prueba `comando.integracion.test.ts` contra una base real, y está declarada
 * como hueco en el reporte mientras no haya `DATABASE_URL`.
 */
import { crearComando } from '../comando.ts';
import type { Transaccion } from '@morphiqpos/data';
import type { Ambito, Paquete } from '@morphiqpos/contracts';

import type { EjecucionGuardada, FilaAuditoria, RepositorioComandos } from '../repositorio.ts';

/** El "tx" de las pruebas: sólo un identificador para poder distinguirlos. */
export interface TxFalsa {
  readonly id: number;
}

export interface EscrituraRegistrada {
  readonly tabla: 'comandos_ejecutados' | 'auditoria';
  readonly datos: Readonly<Record<string, unknown>>;
}

export interface BaseFalsa {
  /** Escrituras que sobrevivieron a una confirmación. */
  readonly confirmadas: EscrituraRegistrada[];
  /** Escrituras que se descartaron al revertir. */
  readonly revertidas: EscrituraRegistrada[];
  readonly transacciones: { readonly id: number; confirmada: boolean }[];
}

export interface Fabrica {
  readonly base: BaseFalsa;
  readonly repositorio: RepositorioComandos<TxFalsa>;
  readonly conTransaccion: <T>(fn: (tx: TxFalsa) => Promise<T>) => Promise<T>;
  /** Cambia el paquete que devuelve la organización. */
  ponerPaquete(paquete: Paquete | null): void;
  /** Filas de auditoría efectivamente confirmadas. */
  auditoriaConfirmada(): readonly FilaAuditoria[];
}

export function crearFabrica(paqueteInicial: Paquete = 'tienda'): Fabrica {
  const base: BaseFalsa = { confirmadas: [], revertidas: [], transacciones: [] };
  const guardadas = new Map<string, EjecucionGuardada>();
  let paquete: Paquete | null = paqueteInicial;
  let siguienteTx = 0;

  /** Escrituras de la transacción en curso, aún sin confirmar. */
  let pendientes: EscrituraRegistrada[] = [];

  const conTransaccion = async <T>(fn: (tx: TxFalsa) => Promise<T>): Promise<T> => {
    const tx: TxFalsa = { id: (siguienteTx += 1) };
    const registro = { id: tx.id, confirmada: false };
    base.transacciones.push(registro);
    const previas = pendientes;
    pendientes = [];
    try {
      const salida = await fn(tx);
      base.confirmadas.push(...pendientes);
      // Sólo al confirmar se hace visible la fila de idempotencia, igual que en
      // Postgres: antes del COMMIT nadie más la ve.
      for (const escritura of pendientes) {
        if (escritura.tabla !== 'comandos_ejecutados') continue;
        const fila = escritura.datos as unknown as EjecucionGuardada;
        guardadas.set(llave(fila.organizacionId, fila.comando, fila.idempotencyKey), fila);
      }
      registro.confirmada = true;
      return salida;
    } catch (error) {
      base.revertidas.push(...pendientes);
      throw error;
    } finally {
      pendientes = previas;
    }
  };

  const repositorio: RepositorioComandos<TxFalsa> = {
    async leerPaquete() {
      return paquete;
    },

    async reclamarClave(_tx, datos) {
      const clave = llave(datos.organizacionId, datos.comando, datos.idempotencyKey);
      const existente = guardadas.get(clave);
      if (existente !== undefined) return 'duplicada';
      pendientes.push({
        tabla: 'comandos_ejecutados',
        datos: { ...datos, respuesta: null, completadoEn: null, reintentos: 0 },
      });
      return 'reclamada';
    },

    async leerEjecucion(_tx, organizacionId, comando, idempotencyKey) {
      return guardadas.get(llave(organizacionId, comando, idempotencyKey)) ?? null;
    },

    async completarEjecucion(_tx, datos) {
      const i = pendientes.findIndex(
        (e) =>
          e.tabla === 'comandos_ejecutados' &&
          (e.datos as { idempotencyKey?: string }).idempotencyKey === datos.idempotencyKey,
      );
      const previa = pendientes[i];
      if (previa === undefined) return;
      pendientes[i] = {
        tabla: 'comandos_ejecutados',
        datos: { ...previa.datos, respuesta: datos.respuesta, completadoEn: datos.ahora },
      };
    },

    async registrarReintento(organizacionId, comando, idempotencyKey) {
      const clave = llave(organizacionId, comando, idempotencyKey);
      const fila = guardadas.get(clave);
      if (fila === undefined) return;
      guardadas.set(clave, { ...fila, reintentos: fila.reintentos + 1 });
    },

    async escribirAuditoria(tx, fila) {
      // `tx` nulo = transacción autónoma: la fila de un rechazo, que se escribe
      // DESPUÉS de revertir. Si fuera dentro, la reversión se la llevaría.
      if (tx === null) {
        base.confirmadas.push({
          tabla: 'auditoria',
          datos: fila as unknown as Record<string, unknown>,
        });
        return;
      }
      pendientes.push({ tabla: 'auditoria', datos: fila as unknown as Record<string, unknown> });
    },
  };

  return {
    base,
    repositorio,
    conTransaccion,
    ponerPaquete(nuevo) {
      paquete = nuevo;
    },
    auditoriaConfirmada() {
      return base.confirmadas
        .filter((e) => e.tabla === 'auditoria')
        .map((e) => e.datos as unknown as FilaAuditoria);
    },
  };
}

function llave(organizacionId: string, comando: string, idempotencyKey: string): string {
  return `${organizacionId}|${comando}|${idempotencyKey}`;
}

/** Un ámbito de cajero, que es el caso normal de la pantalla de venta. */
export function ambitoDeCajero(cambios: Partial<Ambito> = {}): Ambito {
  return {
    organizacionId: '11111111-1111-4111-8111-111111111111',
    sucursalId: '22222222-2222-4222-8222-222222222222',
    terminalId: '33333333-3333-4333-8333-333333333333',
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: '55555555-5555-4555-8555-555555555555',
    rol: 'cajero',
    ...cambios,
  };
}

/**
 * Un ejecutor de comandos que acepta las definiciones REALES de producción.
 *
 * Las definiciones de producción se escriben como `DefinicionComando<Transaccion, …>`
 * y el doble trabaja con `TxFalsa`. Como `ejecutar` recibe el contexto, el tipo
 * de la transacción es contravariante y TypeScript rechaza —con razón— pasar
 * una por la otra.
 *
 * Aquí el cambio de tipo es seguro y está acotado a un solo sitio: las pruebas
 * que usan esto comprueban **rechazos que ocurren ANTES de abrir la
 * transacción** —rol, paquete, entrada inválida—, así que `ejecutar` nunca
 * llega a correr y ninguna transacción falsa toca código que espere una de
 * verdad. Una prueba que quiera ejecutar el cuerpo NO debe usar esto: debe
 * definir su propio comando sobre `TxFalsa`.
 */
export function ejecutorDeProduccion(
  paquete: Paquete,
): ReturnType<typeof crearComando<Transaccion>> {
  const fabrica = crearFabrica(paquete);
  return crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: fabrica.conTransaccion as unknown as <T>(
      fn: (tx: Transaccion) => Promise<T>,
    ) => Promise<T>,
  });
}
