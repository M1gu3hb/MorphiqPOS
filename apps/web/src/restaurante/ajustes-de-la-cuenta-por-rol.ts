/**
 * QUIÉN VE LOS BOTONES QUE HACEN DESAPARECER UN IMPORTE, sin pantalla (día completo del
 * restaurante, 2.4).
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * La mesa activa es la pantalla del MESERO, y le ofrecía «Anular» en cada línea y «Dividir
 * cuenta», dos acciones que el servidor le niega: `restaurante.anular_linea` y
 * `restaurante.dividir_cuenta` son de caja y de dirección, porque quitar un platillo o repartir
 * una cuenta hace desaparecer dinero y «esa separación es control interno, no capricho de
 * interfaz» (`04-INTERFAZ`). Cada toque terminaba en «Tu rol no puede hacer eso»: un botón
 * que se ofrece para fallar es peor que uno que no está, y en hora pico es un toque perdido.
 *
 * Esto es lo que se ENSEÑA, no lo que se permite: la autorización vive en el servidor
 * (`comando()` revisa el rol en cada escritura) y sigue siendo la única que cuenta (R11).
 *
 * Los roles son los de la barra lateral del cliente (`heredado/lib/constants.js`): `caja` es la
 * cajera, y `administrador` es dueño, administrador y gerente (`puente/roles.ts`). Falla
 * CERRADO: mientras no se sabe quién es, no se ofrece lo que quita dinero.
 */
export function puedeAjustarLaCuenta(rol: string | null): boolean {
  return rol === 'administrador' || rol === 'caja';
}
