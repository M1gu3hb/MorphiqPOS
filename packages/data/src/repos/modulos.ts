import 'server-only';

import type { Transaccion } from '../cliente.ts';

/**
 * F-015 y F-016 · La plantilla del negocio y sus perillas, leídas de Postgres.
 *
 * ── Por qué esto existe, si `plantillas.ts` ya estaba escrito ──────────────
 * Porque estaba escrito y **no lo consumía nadie**. `plantillaDe`,
 * `MODULOS_POR_PLANTILLA` y `modulosActivos` vivían en `packages/contracts` con
 * cero importadores fuera de su propia prueba: código que compila, que tipa,
 * que pasa su prueba unitaria y que no gobierna absolutamente nada. Una función
 * así se lee como construida en cualquier inventario y no lo está.
 *
 * Este archivo es la mitad que faltaba: leer de la base el giro, el valor de la
 * columna y las perillas que el negocio tocó, para que el envoltorio de comando
 * pueda decidir con ellos.
 *
 * ── Las perillas guardan EXCEPCIONES, no el estado completo ────────────────
 * Un negocio sin filas usa el preajuste de su plantilla tal cual. Así, cambiar
 * el preajuste llega a todos los que no lo hayan personalizado — que es lo que
 * se espera de un preajuste. Guardar el estado completo congelaría a cada
 * negocio en el día que se dio de alta, y una mejora de producto no llegaría
 * nunca a los clientes viejos.
 */

/** Lo que hace falta para resolver los módulos efectivos de una organización. */
export interface PerfilDeModulos {
  /** `tienda` · `ferreteria` · `cafeteria`… Dice qué NEGOCIO es. */
  readonly giro: string;
  /**
   * El valor crudo de `organizaciones.paquete`.
   *
   * Puede ser uno de los tres nombres viejos o uno de los tres nuevos: la
   * migración 058 no se aplica en esta fase, así que el código tiene que
   * entender los seis. Quien decide es `plantillaDe()`, en el dominio.
   */
  readonly valorGuardado: string;
  readonly perillas: readonly PerillaGuardada[];
}

export interface PerillaGuardada {
  readonly modulo: string;
  readonly activo: boolean;
}

/**
 * El perfil de una organización, o `null` si no existe o está inactiva.
 *
 * `null` es una respuesta y no un error a propósito: quien llama tiene que
 * FALLAR CERRADO. Una organización que no se puede leer no es una organización
 * con todos los módulos; es una de la que no sabemos nada.
 */
export async function leerPerfil(
  tx: Transaccion,
  organizacionId: string,
): Promise<PerfilDeModulos | null> {
  const organizacion = await tx
    .selectFrom('organizaciones')
    .select(['giro', 'paquete'])
    .where('id', '=', organizacionId)
    .where('activa', '=', true)
    .executeTakeFirst();

  if (organizacion === undefined) return null;

  const perillas = await tx
    .selectFrom('organizacion_modulos')
    .select(['modulo', 'activo'])
    .where('organizacion_id', '=', organizacionId)
    .execute();

  return {
    giro: organizacion.giro,
    valorGuardado: organizacion.paquete,
    perillas: perillas.map((p) => ({ modulo: p.modulo, activo: p.activo })),
  };
}

export interface DatosDePerilla {
  readonly organizacionId: string;
  readonly modulo: string;
  readonly activo: boolean;
  readonly motivo: string;
  readonly empleadoId: string;
  readonly ahora: Date;
}

/**
 * Enciende o apaga un módulo para una organización.
 *
 * Es un `upsert` y no un `insert`: tocar dos veces la misma perilla es lo normal
 * —se apaga para probar, se vuelve a encender— y hacerlo fallar la segunda vez
 * obligaría a la pantalla a saber si la fila ya existía, que es un dato que no
 * le sirve para nada.
 *
 * El motivo NO es opcional. Una perilla sin motivo es una decisión que nadie va
 * a poder explicar en seis meses, y el comentario de la columna en la 058 lo
 * dice con esas mismas palabras.
 */
export async function fijarPerilla(tx: Transaccion, datos: DatosDePerilla): Promise<void> {
  await tx
    .insertInto('organizacion_modulos')
    .values({
      organizacion_id: datos.organizacionId,
      modulo: datos.modulo,
      activo: datos.activo,
      motivo: datos.motivo,
      empleado_id: datos.empleadoId,
      updated_at: datos.ahora,
    })
    .onConflict((oc) =>
      oc.columns(['organizacion_id', 'modulo']).doUpdateSet({
        activo: datos.activo,
        motivo: datos.motivo,
        empleado_id: datos.empleadoId,
        updated_at: datos.ahora,
      }),
    )
    .execute();
}

/**
 * Borra la perilla y devuelve el módulo al preajuste de su plantilla.
 *
 * Es distinto de apagarla: apagar escribe `activo = false` y ahí se queda aunque
 * la plantilla cambie; quitar la perilla vuelve a seguir al preajuste. Sin las
 * dos operaciones no hay forma de deshacer una personalización, sólo de
 * invertirla — y una perilla que no se puede deshacer es una decisión
 * permanente disfrazada de interruptor.
 */
export async function quitarPerilla(
  tx: Transaccion,
  organizacionId: string,
  modulo: string,
): Promise<number> {
  const resultado = await tx
    .deleteFrom('organizacion_modulos')
    .where('organizacion_id', '=', organizacionId)
    .where('modulo', '=', modulo)
    .executeTakeFirst();

  return Number(resultado.numDeletedRows);
}
