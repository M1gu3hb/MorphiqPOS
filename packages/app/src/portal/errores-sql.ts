/**
 * Traducción de los errores de Postgres que este módulo espera.
 *
 * ── La regla que hay que respetar al usarlos ──────────────────────────────
 * Una sentencia que falla deja la transacción ABORTADA: cualquier sentencia
 * posterior sobre la misma `tx` fallaría con `25P02` sin haber hecho nada. Por
 * eso, aquí un `catch` de SQLSTATE traduce y **relanza de inmediato**. Nunca se
 * sigue trabajando «después de recuperarse» de un 23505: no hay recuperación
 * sin un `savepoint`, y si hiciera falta uno sería mejor no haber chocado.
 *
 * Se compara por CÓDIGO y por nombre de índice, jamás por el texto del error:
 * el texto cambia con la versión y con el idioma del servidor.
 */

/** El SQLSTATE de un error de `pg`, sin suponer su forma. */
export function sqlstate(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}

/** El índice o restricción que se violó, cuando `pg` lo informa. */
export function restriccionDe(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const nombre = (error as { constraint?: unknown }).constraint;
  return typeof nombre === 'string' ? nombre : null;
}

const VIOLACION_DE_UNICIDAD = '23505';

/**
 * `true` si el error es la violación de ESE índice único.
 *
 * Se exige el nombre porque «hubo un duplicado» no es un mensaje: un 23505 de
 * `solicitudes_qr_una_pendiente` significa «ya avisaste», y uno de
 * `ordenes_una_activa_por_mesa` significa «esa mesa ya está abierta». Decirle
 * lo segundo a quien hizo lo primero es peor que no decir nada.
 */
export function violaIndice(error: unknown, indice: string): boolean {
  if (sqlstate(error) !== VIOLACION_DE_UNICIDAD) return false;
  // El nombre se EXIGE. Aceptar un 23505 sin `constraint` como si fuera éste
  // convertía cualquier duplicado desconocido —el de otra sentencia del mismo
  // comando, con la transacción ya abortada— en «Ya avisamos al mesero»
  // (`solicitudes.ts:158`) o «Esta mesa acaba de abrirse» (`mesa.ts:151`): dos
  // mensajes falsos que tapan un fallo real. Sin nombre no se sabe qué pasó, y
  // decirlo es un 500 con su correlation id en el registro, no una mentira
  // tranquilizadora.
  return restriccionDe(error) === indice;
}
