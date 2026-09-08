import type { CodigoComando, ErrorComando, ProblemaDeCampo } from '@morphiqpos/contracts';
import type { ZodType } from 'zod';

/**
 * Traducción de fallos a errores tipados, y validación de la entrada.
 *
 * Dos reglas gobiernan este archivo:
 *
 *   · El mensaje que ve el cliente lo escribimos nosotros, en español y para la
 *     persona que está en la caja. Nunca es el mensaje de Postgres ni el de zod:
 *     el de Postgres revela nombres de tablas e índices, y el de zod está en
 *     inglés y habla de tipos.
 *
 *   · El detalle de una entrada inválida dice QUÉ campo y POR QUÉ, nunca el
 *     valor recibido. Ese valor puede ser un teléfono, un correo o un PIN mal
 *     tecleado en el campo equivocado (R31).
 */

const MENSAJES: Readonly<Record<CodigoComando, string>> = {
  ENTRADA_INVALIDA: 'Hay datos incompletos o mal escritos.',
  NO_AUTENTICADO: 'La sesión terminó. Vuelve a entrar.',
  SIN_PERMISO: 'Tu puesto no tiene permiso para hacer esto.',
  PAQUETE_NO_INCLUYE: 'Esta función no está incluida en el tipo de negocio configurado.',
  IDEMPOTENCIA_REQUERIDA: 'Falta la clave que evita cobrar dos veces. Recarga e intenta de nuevo.',
  IDEMPOTENCIA_CONFLICTO:
    'Se reusó una clave con datos distintos. Recarga la pantalla antes de reintentar.',
  COMANDO_EN_CURSO: 'La operación anterior sigue en curso. Espera un momento y reintenta.',
  NO_ENCONTRADO: 'No se encontró lo que buscabas.',
  CONFLICTO_ESTADO: 'Alguien más cambió esto mientras trabajabas. Recarga y revisa.',
  REGLA_DE_NEGOCIO: 'La operación no cumple una regla del negocio.',
  ERROR_INTERNO: 'Algo falló de nuestro lado. Nada se guardó a medias.',
};

export function mensajeDe(codigo: CodigoComando): string {
  return MENSAJES[codigo];
}

export function fallo(
  codigo: CodigoComando,
  datos?: Readonly<Record<string, string | number | boolean | null>>,
): ErrorComando {
  return datos === undefined
    ? { codigo, mensaje: MENSAJES[codigo] }
    : { codigo, mensaje: MENSAJES[codigo], datos };
}

export type Validacion<T> =
  { readonly ok: true; readonly datos: T } | { readonly ok: false; readonly error: ErrorComando };

/**
 * Valida con zod y traduce el fallo, sin dejar salir el valor recibido.
 *
 * `strict()` cuando el esquema es un objeto: una propiedad que el esquema no
 * declara se rechaza en vez de ignorarse. Es lo que impide que el cliente
 * mande `totalCentavos` y que alguien, más adelante, lo lea «porque ya venía en
 * el objeto» — que es exactamente el defecto P0-07.
 */
export function validar<T>(esquema: ZodType<T>, valor: unknown): Validacion<T> {
  const estricto = estrictoSiEsObjeto(esquema);
  const resultado = estricto.safeParse(valor);

  if (resultado.success) return { ok: true, datos: resultado.data };

  const problemas: ProblemaDeCampo[] = resultado.error.issues.map((issue) => ({
    ruta: issue.path.map(String).join('.') || '(raíz)',
    problema: issue.code,
  }));

  return {
    ok: false,
    error: { codigo: 'ENTRADA_INVALIDA', mensaje: MENSAJES.ENTRADA_INVALIDA, problemas },
  };
}

function estrictoSiEsObjeto<T>(esquema: ZodType<T>): ZodType<T> {
  const posible = esquema as { strict?: () => ZodType<T> };
  return typeof posible.strict === 'function' ? posible.strict() : esquema;
}
