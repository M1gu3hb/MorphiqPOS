import 'server-only';

import type { Paquete } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { ZodType } from 'zod';

import type { AmbitoPortal } from './ambito.ts';
import type { BanderasPortal } from './banderas.ts';
import type { AccionPortal } from './limite.ts';

/**
 * La forma de un comando público y lo que se comprueba al DECLARARLO.
 *
 * Vive aparte del ejecutor por lo mismo que `definicion.ts` vive aparte de
 * `comando.ts`: todo lo que se puede comprobar al cargar el módulo se comprueba
 * al cargar el módulo. Un comando público mal declarado no llega a producción
 * para fallar delante de un comensal — no arranca.
 */

/** Lo que recibe el cuerpo de un comando público. Su única vía de datos es `tx`. */
export interface ContextoPortal {
  readonly ambito: AmbitoPortal;
  readonly banderas: BanderasPortal;
  readonly paquete: Paquete;
  readonly correlationId: string;
  readonly ahora: Date;
  readonly tx: Transaccion;
  paso<T>(nombre: string, fn: () => Promise<T>): Promise<T>;
  auditar(datos: { entidadId: string | null; payload: Record<string, unknown> }): void;
}

export interface ComandoPublico<E extends ZodType, S> {
  /** `portal.abrir_mesa`. Mismo vocabulario `dominio.verbo` que el resto. */
  readonly nombre: string;
  readonly entidad: string;
  readonly accion: AccionPortal;
  readonly paquetes: readonly Paquete[];
  readonly entrada: E;
  readonly ejecutar: (ctx: ContextoPortal, entrada: E['_output']) => Promise<S>;
}

const FORMA_DEL_NOMBRE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

/**
 * Claves que la entrada de un comando público jamás puede declarar.
 *
 * Las de `definirComando` más las del portal: si el cuerpo pudiera traer
 * `mesaId` o `token`, el comensal elegiría de qué mesa habla y el token de la
 * URL dejaría de ser lo que decide. Es R16 aplicada a la segunda puerta.
 */
const CLAVES_PROHIBIDAS = new Set([
  'organizacion_id',
  'organizacionId',
  'sucursal_id',
  'sucursalId',
  'identidad_id',
  'identidadId',
  'empleo_id',
  'empleoId',
  'terminal_id',
  'terminalId',
  'rol',
  'ambito',
  'mesa_id',
  'mesaId',
  'token',
  'token_mesa',
  'tokenMesa',
]);

/** Declara un comando público, comprobando lo comprobable al cargar el módulo. */
export function definirComandoPublico<E extends ZodType, S>(
  definicion: ComandoPublico<E, S>,
): ComandoPublico<E, S> {
  const { nombre, paquetes, entrada } = definicion;

  if (!FORMA_DEL_NOMBRE.test(nombre)) {
    throw new Error(
      `El comando público "${nombre}" no tiene la forma dominio.verbo. Ese nombre viaja a ` +
        'la auditoría y a la clave de idempotencia; la migración 010 lo exige con un check.',
    );
  }

  if (paquetes.length === 0) {
    throw new Error(
      `El comando público "${nombre}" no declara ningún paquete: no lo incluiría ningún ` +
        'giro y nadie podría ejecutarlo (A-42).',
    );
  }

  const forma = (entrada as { shape?: Readonly<Record<string, unknown>> }).shape;
  for (const clave of forma === undefined ? [] : Object.keys(forma)) {
    if (!CLAVES_PROHIBIDAS.has(clave)) continue;
    throw new Error(
      `El comando público "${nombre}" declara "${clave}" en su entrada. El ámbito del portal ` +
        'sale del token de la mesa, resuelto en el servidor, jamás del cuerpo de la petición.',
    );
  }

  return definicion;
}
