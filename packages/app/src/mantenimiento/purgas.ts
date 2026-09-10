import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

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

async function borrar(tx: Transaccion, tabla: string, organizacionId: string): Promise<number> {
  const resultado = await sql<{ id: string }>`
    delete from ${sql.table(tabla)} where organizacion_id = ${organizacionId} returning id
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
      select count(*)::text as n from ${sql.table(tabla)} where organizacion_id = ${organizacionId}
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
