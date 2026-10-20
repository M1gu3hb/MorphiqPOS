/**
 * LA LISTA DE «COBRAR» SE MANTIENE AL DÍA SOLA (D.1 de la 2.4). Lo puro, sin React y con su
 * prueba (`lista-por-cobrar.test.ts`).
 *
 * ── El defecto que esto arregla ───────────────────────────────────────────────────
 * La pantalla leía las citas terminadas UNA vez, al abrirse. Pero quien la tiene abierta es
 * la recepción, en su tablet, todo el día, y quien termina las citas es la estilista, en su
 * teléfono: Nayeli cobra a la primera clienta, Dany cierra el servicio de la siguiente, y la
 * tablet seguía diciendo «ninguna cita está lista para cobrar» —con la clienta ya parada
 * frente al mostrador— hasta que alguien tocaba «Volver a mirar» o recargaba la página. En el
 * mostrador esa pantalla se mira de pie y nadie la va a recargar entre clienta y clienta.
 *
 * ── Qué se hace y qué no ─────────────────────────────────────────────────────────
 * Cada pocos segundos se pregunta SÓLO cuáles son las citas terminadas —una lectura de
 * cuarenta filas con su id—, y la lectura completa (servicios, equipo, catálogo, nombres) se
 * repite únicamente cuando esa lista cambió. Así un latido sin novedades cuesta una consulta
 * liviana, y una novedad cuesta lo que costaba abrir la pantalla.
 *
 * Si la pregunta falla, la pantalla NO se vacía —lo que hay en ella sigue siendo cierto— pero
 * tampoco calla: dice que la lista puede estar vieja (`FALLOS_SEGUIDOS_PARA_AVISAR`). Un fallo
 * suelto no alarma a nadie; tres seguidos son una red caída.
 */

/** Cada cuánto se pregunta. Es lo que tarda en aparecer una cita recién cerrada, como mucho. */
export const MS_ENTRE_LECTURAS = 5_000;

/** Cuántos latidos fallidos seguidos hacen falta para decir que la lista puede estar vieja. */
export const FALLOS_SEGUIDOS_PARA_AVISAR = 3;

/** Lo único que se necesita de una cita para saber si es la misma. */
export interface ConId {
  readonly id: string;
}

/**
 * ¿Cambió la lista de citas por cobrar?
 *
 * Es de CONJUNTOS: el orden en que el servidor las devuelve no es una novedad, y una cita
 * que apareció y otra que desapareció al mismo tiempo —se cobró en otra caja y se cerró otra
 * en la cabina— cuentan como cambio aunque el total sea el mismo.
 */
export function cambioLaLista(vistas: readonly ConId[], leidas: readonly ConId[]): boolean {
  if (vistas.length !== leidas.length) return true;
  const enPantalla = new Set(vistas.map((cita) => cita.id));
  return leidas.some((cita) => !enPantalla.has(cita.id));
}

/**
 * Lo que dice la franja cuando los latidos fallan, o `null` si todavía no hay por qué.
 *
 * Con una lista que se ve tan cierta como siempre, lo que importa decir es qué puede estar
 * pasando: una cita cerrada hace poco que no aparece. Y qué hacer: el botón que ya existe.
 */
export function avisoDeListaVieja(fallosSeguidos: number): string | null {
  return fallosSeguidos >= FALLOS_SEGUIDOS_PARA_AVISAR
    ? 'No se pudo actualizar la lista. Puede faltar alguna cita que se cerró hace poco: toca «Volver a mirar».'
    : null;
}
