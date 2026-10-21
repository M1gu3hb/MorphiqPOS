/**
 * EL DUEÑO GENERAL SOBREVIVE AL RESETEO DE SU DEMO (D-42, 20-10-2026).
 *
 * La cuenta con la que Miguel recorre los modelos vive en `demo-acople-restaurante`, y su
 * concesión —qué negocios abre— en dos llaves de la configuración de ese negocio:
 * `presentacion_dueno_empleo` y `presentacion_destinos`, que sólo se aprovisionan en el
 * servidor. El reseteo de la demo REESCRIBÍA la configuración entera y reponía el PIN
 * publicado de la demo a TODOS los dueños: después de un reseteo la cuenta general dejaba
 * de abrir los demás modelos y entraba con el PIN que cualquiera conoce. Se vio en la base
 * desechable: la cuenta de prueba dejó de entrar con su PIN después de resembrar.
 *
 * Aquí, sin base: qué llaves se conservan y quién es el dueño general. El comando las usa.
 */

/** Las llaves de la concesión: el reseteo las deja como estaban. */
export const CONCESION_DEL_DUENO_GENERAL = [
  'presentacion_dueno_empleo',
  'presentacion_destinos',
  // Las llaves del modo presentación (21-10): el real recuerda a su espejo, y el espejo de
  // quién es y quién es quién. Reponer la demo o resembrar el espejo no las puede perder.
  'presentacion_modo',
  'presentacion_espejo_de',
  'presentacion_activa',
  'presentacion_gemelos',
] as const;

function esRegistro(valor: unknown): valor is Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** El empleo del dueño general concedido en esta configuración, o `null` si no hay. */
export function duenoGeneralDe(valores: unknown): string | null {
  if (!esRegistro(valores)) return null;
  const empleo = valores['presentacion_dueno_empleo'];
  return typeof empleo === 'string' && empleo !== '' ? empleo : null;
}

/**
 * La configuración que deja el reseteo: la de la demo, entera, más la concesión que ya
 * estaba. Lo demás de antes —un estilo probado, un IVA movido— se va, como siempre.
 */
export function configuracionRepuesta(
  anteriores: unknown,
  deLaDemo: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const conservada: Record<string, unknown> = {};
  if (esRegistro(anteriores)) {
    for (const llave of CONCESION_DEL_DUENO_GENERAL) {
      if (Object.prototype.hasOwnProperty.call(anteriores, llave))
        conservada[llave] = anteriores[llave];
    }
  }
  return { ...deLaDemo, ...conservada };
}
