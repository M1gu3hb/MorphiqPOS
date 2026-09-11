import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql, type RawBuilder } from 'kysely';

/**
 * Lo que borra cada sección, y en qué orden (F1-07 §2.2).
 *
 * ── Tres cosas que cambian respecto a sus funciones ────────────────────────
 * 1. **Una sola transacción.** Sus funciones borran fila por fila con un
 *    `.catch(() => {})` por borrado, y el contador se incrementa AUNQUE el
 *    borrado falle: el número que enseña la pantalla es cuántas veces se
 *    intentó, no cuántas se logró. Aquí, si falla la fila 4 000, no persiste
 *    ninguna.
 * 2. **Hijos antes que padres.** Las llaves foráneas del esquema nuevo son
 *    `restrict` donde importa, así que un orden mal puesto ya no borra a medias:
 *    aborta la transacción entera.
 * 3. **Siempre acotado por organización.** El ámbito sale de la sesión y no hay
 *    forma de nombrar otra: un mantenimiento no puede tocar otro negocio porque
 *    no tiene cómo escribirlo.
 */

export const SECCIONES = ['cortes', 'ventas', 'compras', 'gastos', 'movimientos'] as const;
export type Seccion = (typeof SECCIONES)[number];

/** Cuántas filas se borraron, por tabla. Va a la auditoría y a la respuesta. */
export type Conteos = Readonly<Record<string, number>>;

/**
 * Cómo se acota cada tabla a UNA organización.
 *
 * Casi todas llevan `organizacion_id` y se acotan solas. Las que no, cuelgan de
 * un padre que sí la lleva, y hay que llegar por ahí.
 *
 * ── El defecto que esto cierra ─────────────────────────────────────────────
 * `orden_linea_modificadores` NO tiene `organizacion_id` —cuelga de
 * `orden_lineas`— y estaba en la lista de la sección `ventas` como una más. La
 * consulta salía con «column "organizacion_id" does not exist» y tumbaba la
 * transacción entera, así que las CINCO purgas fallaban: `purgar_ventas`,
 * `reiniciar_pruebas` y `reiniciar_todo` incluidas.
 *
 * No lo vio nadie porque las pruebas usan una base falsa que no valida columnas
 * y porque la verificación en vivo sólo había ejercitado los RECHAZOS —falta de
 * confirmación, rol equivocado, límite de peticiones—, nunca una purga que
 * llegara a ejecutarse.
 */
const SIN_ORGANIZACION_PROPIA: Readonly<Record<string, (org: string) => RawBuilder<unknown>>> = {
  orden_linea_modificadores: (org) =>
    sql`orden_linea_id in (select id from orden_lineas where organizacion_id = ${org})`,
  // `modificador_opciones` cuelga de su modificador, igual. Estaba en
  // `TABLAS_DEL_CATALOGO` y no en `TABLAS_POR_SECCION`, así que el contrato
  // —que sólo miraba las secciones— la dejaba pasar y `reiniciar_todo` seguía
  // muriendo con «column "organizacion_id" does not exist».
  modificador_opciones: (org) =>
    sql`modificador_id in (select id from modificadores where organizacion_id = ${org})`,
};

/** El `where` que acota esta tabla a esta organización, venga de donde venga. */
function condicion(tabla: string, organizacionId: string): RawBuilder<unknown> {
  const porPadre = SIN_ORGANIZACION_PROPIA[tabla];
  return porPadre === undefined
    ? sql`organizacion_id = ${organizacionId}`
    : porPadre(organizacionId);
}

async function borrar(tx: Transaccion, tabla: string, organizacionId: string): Promise<number> {
  const resultado = await sql<{ id: string }>`
    delete from ${sql.table(tabla)} where ${condicion(tabla, organizacionId)} returning id
  `.execute(tx);
  return resultado.rows.length;
}

/**
 * Cuenta lo que HAY antes de borrarlo.
 *
 * No reconstruye nada, y no hay que fingir que sí. Pero deja en la auditoría
 * constancia de qué había, que es la diferencia entre «se borró algo» y «no
 * sabemos qué se borró». Es lo único honesto que se puede ofrecer cuando la
 * operación no es reversible.
 */
export async function contar(
  tx: Transaccion,
  tablas: readonly string[],
  organizacionId: string,
): Promise<Conteos> {
  const conteos: Record<string, number> = {};
  for (const tabla of tablas) {
    const fila = await sql<{ n: string }>`
      select count(*)::text as n from ${sql.table(tabla)} where ${condicion(tabla, organizacionId)}
    `.execute(tx);
    conteos[tabla] = Number(fila.rows[0]?.n ?? '0');
  }
  return conteos;
}

/** Las tablas de cada sección, HIJOS PRIMERO. El orden es el contrato. */
export const TABLAS_POR_SECCION: Readonly<Record<Seccion, readonly string[]>> = {
  cortes: ['cortes_turno', 'sesiones_caja'],
  ventas: [
    'comanda_items',
    'comandas',
    'orden_linea_modificadores',
    'orden_lineas',
    'pagos',
    'movimientos_caja',
    'ordenes',
  ],
  compras: ['compra_lineas', 'compras'],
  gastos: ['gastos'],
  movimientos: ['movimientos_stock'],
};

export async function purgarSeccion(
  tx: Transaccion,
  organizacionId: string,
  seccion: Seccion,
): Promise<Conteos> {
  const tablas = TABLAS_POR_SECCION[seccion];
  const antes = await contar(tx, tablas, organizacionId);

  // Las órdenes apuntan a la mesa y la mesa a la orden. Se suelta el lado de la
  // mesa antes de borrar, o la llave foránea aborta la transacción entera.
  if (seccion === 'ventas') {
    await sql`
      update mesas set orden_activa_id = null, estado = 'libre', personas_actuales = 0,
                       cliente_temporal = null, notas_alergias = null,
                       celebracion_especial = false, tipo_celebracion = null, updated_at = now()
       where organizacion_id = ${organizacionId} and orden_activa_id is not null
    `.execute(tx);
    // Y las liquidaciones apuntan a órdenes que van a desaparecer.
    await borrar(tx, 'liquidaciones_propina', organizacionId);
  }

  // Las sesiones de caja las referencian gastos y órdenes.
  if (seccion === 'cortes') {
    await sql`
      update gastos set sesion_caja_id = null, updated_at = now()
       where organizacion_id = ${organizacionId} and sesion_caja_id is not null
    `.execute(tx);
    await sql`
      update ordenes set sesion_caja_id = null, updated_at = now()
       where organizacion_id = ${organizacionId} and sesion_caja_id is not null
    `.execute(tx);
  }

  for (const tabla of tablas) await borrar(tx, tabla, organizacionId);
  return antes;
}

/**
 * El histórico entero: todo lo transaccional, nada del catálogo.
 *
 * Es lo que su `reiniciarSistema` llama `mode: 'tests'`, y la diferencia con
 * `mode: 'all'` es tan grande que compartir ruta, rol y palabra de confirmación
 * era un error de diseño: una deja el negocio listo para operar y la otra lo
 * vacía.
 */
export const SECCIONES_DEL_HISTORICO: readonly Seccion[] = [
  'ventas',
  'compras',
  'gastos',
  'movimientos',
  'cortes',
];

/**
 * El catálogo. Sólo lo toca `reiniciar_todo`.
 *
 * `estaciones_preparacion` NO está: la estación general (`es_general`) es el
 * respaldo obligatorio de la regla 10 y la base impide desactivarla. Borrarla
 * dejaría al restaurante sin sitio al que mandar la primera comanda.
 *
 * `plantillas_gasto` SÍ está, por simetría con `plantillas_compra`: su
 * `reiniciarSistema` se olvidaba de la primera y borraba la segunda, y esa
 * asimetría no responde a ninguna razón, sólo a un olvido.
 */
export const TABLAS_DEL_CATALOGO: readonly string[] = [
  'recetas',
  'orden_linea_modificadores',
  'producto_modificadores',
  'modificador_opciones',
  'modificadores',
  'existencias',
  'productos',
  'insumos',
  'categorias',
  'proveedores',
  'plantillas_gasto',
  'plantillas_compra',
  'menu_qr_secciones',
  'solicitudes_qr',
  'mesas',
  'zonas',
  'bitacora_sincronizacion',
];
