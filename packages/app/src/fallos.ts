import type { CodigoComando, ErrorComando, Resultado } from '@morphiqpos/contracts';

import { fallo } from './errores.ts';
import type { EjecucionGuardada } from './repositorio.ts';

/**
 * Las señales internas del envoltorio y el atendedor de reintentos.
 *
 * Son excepciones que NO salen de `comando()`: viajan desde dentro de la
 * transacción hasta el `catch` que la envuelve, y su único trabajo es abortarla
 * llevándose consigo el motivo. Se usa `throw` y no un valor de retorno porque
 * es lo que hace que Postgres revierta; devolver un objeto de error dejaría la
 * transacción confirmándose con el efecto a medias.
 */

/**
 * Rechazo decidido dentro de la transacción: aborta y viaja con su código.
 *
 * ── Por qué los campos se declaran y se asignan a mano ─────────────────────
 * Un `constructor(readonly codigo: …)` —una «parameter property»— dice lo mismo
 * en menos líneas, y hace que este archivo, y con él el paquete `app` entero, no
 * se pueda importar desde un `node --experimental-strip-types`: es sintaxis que
 * hay que TRANSFORMAR, no sólo borrar, y Node sólo borra. Next lo compila sin
 * problema, pero los scripts de este repositorio —`verificar-acople`,
 * `sembrar-demos`— corren con Node pelado y necesitan importar los comandos de
 * verdad para no acabar con una segunda copia de la lógica.
 */
export class Rechazo extends Error {
  readonly codigo: CodigoComando;
  readonly auditable: 'denegado' | 'conflicto' | 'error' | null;
  readonly error?: ErrorComando;

  constructor(
    codigo: CodigoComando,
    auditable: 'denegado' | 'conflicto' | 'error' | null,
    error?: ErrorComando,
  ) {
    super(codigo);
    this.codigo = codigo;
    this.auditable = auditable;
    if (error !== undefined) this.error = error;
    this.name = 'Rechazo';
  }
}

/** La clave ya tenía una ejecución confirmada: se devuelve aquélla. */
export class Reintento extends Error {
  readonly previa: EjecucionGuardada;

  constructor(previa: EjecucionGuardada) {
    super('reintento');
    this.previa = previa;
    this.name = 'Reintento';
  }
}

export class SinRastro extends Error {
  constructor(nombre: string) {
    super(
      `El comando "${nombre}" declara escribir y no llamó a ctx.auditar(). ` +
        'Declarar sensible algo que no deja rastro convierte la auditoría en un adorno.',
    );
    this.name = 'SinRastro';
  }
}

export class PasoInexistente extends Error {
  constructor(nombre: string) {
    super(
      `Se pidió interrumpir el paso "${nombre}" y el comando nunca lo ejecutó. ` +
        'Una inyección de fallo que no interrumpe nada afirma una atomicidad que nadie probó.',
    );
    this.name = 'PasoInexistente';
  }
}

/**
 * Sirve una ejecución ya confirmada, o rechaza si la entrada no es la misma.
 *
 * Misma clave con otra entrada es un error del cliente, no un reintento:
 * devolverle la respuesta guardada escondería que pidió una cosa distinta.
 */
export async function atenderReintento<S>(
  previa: EjecucionGuardada,
  contexto: { huellaEntrada: string; correlationId: string; contar: () => Promise<void> },
): Promise<Resultado<S>> {
  const { huellaEntrada, correlationId } = contexto;

  if (previa.huellaEntrada !== huellaEntrada) {
    return { ok: false, error: fallo('IDEMPOTENCIA_CONFLICTO'), correlationId };
  }

  await contexto.contar();
  return { ok: true, datos: previa.respuesta as S, correlationId, reintento: true };
}
