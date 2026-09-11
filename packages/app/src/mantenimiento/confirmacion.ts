import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

/**
 * La confirmación de una operación destructiva (F1-02 E10-4, F1-07 §4.4).
 *
 * ── Por qué no vale la palabra de hoy ──────────────────────────────────────
 * Sus cinco funciones piden escribir `BORRAR TODO`, `BORRAR PRUEBAS`,
 * `ELIMINAR` o `LIMPIAR`. Son CONSTANTES PÚBLICAS impresas en la propia
 * pantalla: quien quiera atacar las lee del HTML, y `reiniciarSistema` las
 * compara contra otra constante del propio servidor. Las dos mitades de la
 * comprobación las escribe el atacante.
 *
 * ── Qué se compara ahora ───────────────────────────────────────────────────
 * El NOMBRE DEL NEGOCIO, leído de la base DENTRO DE LA MISMA TRANSACCIÓN que
 * va a borrar. Es un valor por inquilino: sólo lo sabe quien tiene acceso
 * legítimo, y el servidor nunca lo compara contra algo que le mandó el cliente.
 * Es el mismo patrón con el que GitHub borra un repositorio, y por lo mismo.
 *
 * Se compara normalizado —sin acentos, sin mayúsculas, sin espacios repetidos—
 * porque exigir que alguien teclee «Café Jacarandá» con el acento en la a
 * correcta convierte una medida de seguridad en una trampa de ortografía, y la
 * gente termina copiando y pegando, que es justo lo que la anula.
 */

/** La misma normalización que `clave_texto()` en la base (migración 046). */
export function claveDeTexto(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Exige que la confirmación coincida con el nombre real del negocio.
 *
 * Lee el nombre EN LA TRANSACCIÓN. Si alguien renombra el negocio a mitad de la
 * operación, esta lectura ve el mismo nombre que verá el borrado.
 */
export async function exigirNombreDelNegocio(
  tx: Transaccion,
  organizacionId: string,
  confirmacion: string,
): Promise<string> {
  const fila = await tx
    .selectFrom('organizaciones')
    .select('nombre')
    .where('id', '=', organizacionId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('MANTENIMIENTO_NO_CONFIRMADO', 'La organización no existe.');
  }

  if (claveDeTexto(confirmacion) !== claveDeTexto(fila.nombre)) {
    // El mensaje NO revela el nombre esperado. Quien tiene acceso legítimo lo
    // ve en su propia pantalla; quien no lo tiene no debería aprenderlo aquí.
    throw new ErrorDominio(
      'MANTENIMIENTO_NO_CONFIRMADO',
      'Para continuar hay que escribir el nombre exacto del negocio.',
    );
  }

  return fila.nombre;
}
