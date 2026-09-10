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
  const restriccion = restriccionDe(error);
  // Si `pg` no informó el nombre, se acepta el código: es preferible el mensaje
  // correcto en el 99 % de los casos a un 500 sin explicación.
  return restriccion === null || restriccion === indice;
}
