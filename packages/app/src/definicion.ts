import type { Ambito, Paquete, Rol } from '@morphiqpos/contracts';
import type { ZodType } from 'zod';

/**
 * La forma de un comando y las comprobaciones que se hacen al DEFINIRLO.
 *
 * Todo lo que se puede comprobar al cargar el módulo se comprueba al cargar el
 * módulo. Un comando mal declarado no llega a producción para fallar en la
 * primera venta: no arranca.
 */

/** `dominio.verbo`. El mismo `check` que exige la migración 010. */
const FORMA_DEL_NOMBRE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

/**
 * Claves que jamás puede declarar la entrada de un comando (R16).
 *
 * Se listan en las dos convenciones —`snake_case` porque es como se llaman las
 * columnas, `camelCase` porque es como se escriben en TypeScript— porque un
 * comando podría usar cualquiera de las dos y la regla es sobre el significado,
 * no sobre la ortografía.
 */
const CLAVES_DE_AMBITO = new Set([
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
]);

/** Lo que el cuerpo de un comando recibe. Su única vía de datos es `tx`. */
export interface ContextoComando<TX> {
  readonly ambito: Ambito;
  readonly correlationId: string;
  readonly ahora: Date;
  readonly tx: TX;

  /**
   * Marca un paso con nombre, para poder interrumpirlo desde una prueba.
   *
   * Por NOMBRE y no por índice: renumerar los pasos al agregar uno en medio
   * haría que la prueba de inyección interrumpiera otro paso sin que nadie se
   * entere, y seguiría pasando.
   */
  paso<T>(nombre: string, fn: () => Promise<T>): Promise<T>;

  /** Acumula el rastro. El envoltorio escribe la fila antes de confirmar. */
  auditar(datos: { entidadId: string | null; payload: Record<string, unknown> }): void;
}

export interface DefinicionComando<TX, E extends ZodType, S> {
  /** `venta.cobrar`. Viaja al permiso, a la auditoría y a la idempotencia. */
  readonly nombre: string;
  /** Entidad raíz que toca: `orden`, `sesion_caja`, `mesa`… Va a `auditoria.entidad`. */
  readonly entidad: string;
  /** `true` ⇒ transacción, clave de idempotencia obligatoria y auditoría. */
  readonly escribe: boolean;
  /** Roles que pueden ejecutarlo. En F1.5 esto sale de `permisos_rol`. */
  readonly roles: readonly Rol[];
  /** Paquetes que lo incluyen (A-42). */
  readonly paquetes: readonly Paquete[];
  readonly entrada: E;
  readonly ejecutar: (ctx: ContextoComando<TX>, entrada: E['_output']) => Promise<S>;
}

/**
 * Declara un comando, comprobando lo comprobable de inmediato.
 *
 * La comprobación de R16 vive aquí y no en una prueba que recorra un registro.
 * Un registro sólo contiene lo que alguien se acordó de registrar: si un comando
 * nuevo se olvidara, la prueba pasaría y la regla no se cumpliría. Fallar al
 * definir no se puede olvidar, porque el módulo no carga.
 */
export function definirComando<TX, E extends ZodType, S>(
  definicion: DefinicionComando<TX, E, S>,
): DefinicionComando<TX, E, S> {
  const { nombre, roles, paquetes, entrada } = definicion;

  if (!FORMA_DEL_NOMBRE.test(nombre)) {
    throw new Error(
      `El comando "${nombre}" no tiene la forma dominio.verbo (por ejemplo "venta.cobrar"). ` +
        'Ese nombre viaja al permiso, a la auditoría y a la clave de idempotencia; ' +
        'la migración 010 lo exige con un check.',
    );
  }

  if (roles.length === 0) {
    throw new Error(
      `El comando "${nombre}" no declara ningún rol. Una lista vacía niega a todo el mundo ` +
        'en silencio, que es indistinguible de haberlo olvidado.',
    );
  }

  if (paquetes.length === 0) {
    throw new Error(
      `El comando "${nombre}" no declara ningún paquete. Sin paquete no lo incluye ningún ` +
        'giro y nadie puede ejecutarlo (A-42).',
    );
  }

  for (const clave of clavesDeclaradas(entrada)) {
    if (!CLAVES_DE_AMBITO.has(clave)) continue;
    throw new Error(
      `El comando "${nombre}" declara "${clave}" en su entrada. El ámbito viene de la ` +
        'sesión del servidor, jamás de un parámetro del cliente (R16): aceptarlo dejaría ' +
        'que quien llama eligiera en qué organización escribe.',
    );
  }

  return definicion;
}

/** Nombres de propiedad de un objeto zod. Vacío si el esquema no es un objeto. */
function clavesDeclaradas(esquema: ZodType): readonly string[] {
  const forma = (esquema as { shape?: Readonly<Record<string, unknown>> }).shape;
  return forma === undefined ? [] : Object.keys(forma);
}
