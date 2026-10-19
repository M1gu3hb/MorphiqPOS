import type { Ambito, Modulo, Paquete, Rol } from '@morphiqpos/contracts';
import type { ZodType } from 'zod';

import { segmentosDe, type FronteraDelComando } from './sucursal/frontera.ts';

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
  /**
   * El módulo que tiene que estar ENCENDIDO para ejecutarlo (F-016).
   *
   * Es la capa de encima del paquete, no su sustituta. El paquete dice qué
   * contrató el negocio; el módulo dice qué le dejaron encendido dentro de eso.
   * Una ferretería con plantilla `tienda` tiene `recetas` en su preajuste y
   * puede apagarlo sin cambiar de plantilla.
   *
   * Omitirlo significa «este comando no pasa por ninguna perilla»: es lo
   * correcto para todo lo que ningún negocio puede apagar —entrar, cobrar,
   * abrir caja—, porque una perilla sobre eso sería una forma de dejar al
   * cliente sin poder vender.
   */
  readonly modulo?: Modulo;
  /**
   * LA FRONTERA POR SUCURSAL (D-36): qué campos de la entrada son ids de algo que es de UNA
   * sucursal —`{ ordenId: 'ordenes', 'lineas[].ordenLineaId': 'orden_lineas' }`—. El
   * envoltorio cambia los que son de otra sucursal por uno que no existe antes de llamar a
   * `ejecutar`, y el comando contesta lo que contesta a un id al azar
   * (`sucursal/frontera.ts`). `definirComando` comprueba que cada camino exista en
   * `entrada`: uno mal escrito no protegería nada y nadie se enteraría.
   */
  readonly sucursal?: FronteraDelComando;
  /**
   * Los ids que PARECEN de una sucursal y a propósito no se acotan, cada uno con su razón:
   * el almacén DESTINO de un traspaso es de otra sucursal por definición. Lo pide el
   * contrato de `verify:matriz`, que no deja un id de sucursal sin decidir.
   */
  readonly sinFrontera?: Readonly<Record<string, string>>;
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

  for (const camino of [
    ...Object.keys(definicion.sucursal ?? {}),
    ...Object.keys(definicion.sinFrontera ?? {}),
  ]) {
    if (tieneElCamino(entrada, segmentosDe(camino))) continue;
    throw new Error(
      `El comando "${nombre}" declara la frontera de "${camino}", y su entrada no tiene ese ` +
        'campo. Un camino mal escrito no acota nada y la frontera parecería puesta (D-36).',
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

/**
 * ¿Tiene `esquema` el campo de `segmentos`? Recorre objetos, arreglos (`[]`) y lo que
 * envuelve a un esquema sin cambiar su forma —opcional, nulo, por omisión, tubería, unión—.
 */
function tieneElCamino(esquema: unknown, segmentos: readonly string[]): boolean {
  const def = (esquema as { _zod?: { def?: Readonly<Record<string, unknown>> } } | null)?._zod?.def;
  if (def === undefined) return false;
  switch (def['type']) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'catch':
    case 'nonoptional':
      return tieneElCamino(def['innerType'], segmentos);
    case 'pipe':
      return tieneElCamino(def['in'], segmentos);
    case 'union':
      return (def['options'] as readonly unknown[]).some((o) => tieneElCamino(o, segmentos));
    case 'intersection':
      return tieneElCamino(def['left'], segmentos) || tieneElCamino(def['right'], segmentos);
    default:
      break;
  }
  const [primero, ...resto] = segmentos;
  if (primero === undefined) return true;
  if (primero === '[]') return def['type'] === 'array' && tieneElCamino(def['element'], resto);
  if (def['type'] !== 'object') return false;
  const forma = def['shape'] as Readonly<Record<string, unknown>>;
  return (
    Object.prototype.hasOwnProperty.call(forma, primero) && tieneElCamino(forma[primero], resto)
  );
}
