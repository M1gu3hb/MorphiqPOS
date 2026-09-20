import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import type { ServicioDemo } from './datos.ts';

/**
 * EL SALÓN de la demostración de una estética (E4 del cierre de la 2.3).
 *
 * ── Por qué sin esto el modelo no se puede abrir ───────────────────────────
 * Las doce pantallas de `estetica-salon` leen tres cosas que no existían en
 * ninguna demo: `profesionales` (la agenda se pinta POR COLUMNA, una por
 * persona), `recursos` (la estación, el lavabo, la secadora) y `servicios` (los
 * cuatro tramos de duración de F-401). Sin ellas la agenda del día abre con cero
 * columnas y el catálogo de servicios abre vacío, que es lo que pasaba: el giro
 * `estetica` caía en la semilla de abarrotes y su demo tenía tortillas.
 *
 * ── El procesado, que es el negocio de este modelo ─────────────────────────
 * Un tinte ocupa a la estilista 40 min, deja a la clienta 25 min procesando y
 * necesita otros 15 de terminado. Esos 25 minutos son el 25-40 % de capacidad que
 * un salón no aprovecha, y `pasivo_intercalable` es lo que permite meter a otra
 * clienta dentro de ellos. La semilla lo declara en los servicios que lo tienen
 * —tinte, mechas, keratina, botox, semipermanente— y lo deja en falso donde no
 * existe: un corte no tiene procesado.
 */

/** Los dos horarios: quien abre y quien cierra. Martes a domingo. */
const HORARIO = { inicio: '09:00', fin: '19:00' } as const;

/**
 * Las estaciones y los muebles compartidos.
 *
 * Tres estaciones porque dos son las de las estilistas y la tercera es la que
 * queda libre cuando una está en el lavabo: sin ella el solape de F-403 no se
 * puede enseñar. Un lavabo y una secadora, que es lo que de verdad hace cuello
 * de botella en un salón de barrio.
 */
const RECURSOS = [
  { nombre: 'Estación 1', tipo: 'estacion' },
  { nombre: 'Estación 2', tipo: 'estacion' },
  { nombre: 'Estación 3', tipo: 'estacion' },
  { nombre: 'Lavabo', tipo: 'lavabo' },
  { nombre: 'Secadora', tipo: 'secadora' },
] as const;

export interface ProfesionalDemo {
  /** La clave del empleo, `«Nombre Apellidos»`, como la devuelve `sembrarEquipo`. */
  readonly empleo: string;
  readonly nombreCompleto: string;
  /** Diez caracteres como máximo: es lo que cabe en la columna de la agenda. */
  readonly nombreCorto: string;
  readonly nivel: 'junior' | 'estilista' | 'senior' | 'director';
  readonly color: string;
}

/**
 * Las dos estilistas, con nivel distinto a propósito.
 *
 * El nivel no es decorativo: `servicios_profesional` deja que la misma mecha
 * cueste distinto y dure distinto según quién la haga, y con dos personas del
 * mismo nivel eso no se puede enseñar.
 */
const PROFESIONALES: readonly ProfesionalDemo[] = [
  {
    empleo: 'Karla Domínguez',
    nombreCompleto: 'Karla Domínguez',
    nombreCorto: 'Karla',
    nivel: 'senior',
    color: '#7c3aed',
  },
  {
    empleo: 'Dany Robles',
    nombreCompleto: 'Dany Robles',
    nombreCorto: 'Dany',
    nivel: 'estilista',
    color: '#c026d3',
  },
];

export interface ResumenSalon {
  readonly profesionales: number;
  readonly recursos: number;
  readonly servicios: number;
}

export async function sembrarSalon(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  empleos: ReadonlyMap<string, string>,
  servicios: readonly ServicioDemo[],
  productosPorNombre: ReadonlyMap<string, string>,
): Promise<ResumenSalon> {
  const recursos = await sembrarRecursos(tx, organizacionId, sucursalId);
  const reglaId = await sembrarReglaDeComision(tx, organizacionId);
  const profesionales = await sembrarProfesionales(
    tx,
    organizacionId,
    sucursalId,
    empleos,
    reglaId,
  );
  const cuantos = await sembrarServicios(tx, organizacionId, servicios, productosPorNombre);
  await sembrarQuienHaceQue(tx, organizacionId, servicios, productosPorNombre);
  return { profesionales, recursos, servicios: cuantos };
}

/**
 * LA REGLA DE COMISIÓN, que es lo que distingue a un salón de una tienda.
 *
 * ── Por qué faltaba y qué rompía ──────────────────────────────────────────
 * `comisionDe` sale por `null` en cuanto el profesional no tiene
 * `regla_comision_id`, así que cobrar una cita **no causaba ninguna comisión**:
 * la demostración cobraba y nadie sabía cuánto se le debía a quién. Es la mitad
 * del negocio de un salón, y es lo que el guion enseña después de cobrar.
 *
 * El trato: 40 % de lo COBRADO en servicios, 10 % en producto, sin IVA —el IVA
 * es del SAT, no del salón— y el material a cargo del salón. Es el trato más
 * común y el que la pantalla de liquidación sabe explicar.
 */
async function sembrarReglaDeComision(tx: Transaccion, organizacionId: string): Promise<string> {
  const existente = await tx
    .selectFrom('reglas_comision')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  if (existente !== undefined) return existente.id;

  const fila = await tx
    .insertInto('reglas_comision')
    .values({
      organizacion_id: organizacionId,
      nombre: 'Estilistas · 40 % de servicio',
      esquema: 'porcentaje_fijo',
      tasa_servicio_bp: 4_000,
      tasa_producto_bp: 1_000,
      tasa_venta_paquete_bp: 0,
      base: 'cobrado',
      sobre_iva: false,
      material: 'salon',
      reparto: 'por_servicio',
      rehacer_paga: false,
      anticipo_perdido_paga: false,
      // Desde hoy: una regla con vigencia futura no comisiona nada, y una demo
      // que no comisiona es exactamente el agujero que esto tapa.
      vigente_desde: new Date().toISOString().slice(0, 10),
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return fila.id;
}

/**
 * QUIÉN HACE QUÉ. Esto faltaba, y sin esto el salón no podía agendar nada.
 *
 * `agendar_cita` busca la fila de `servicios_profesional` para el par
 * (servicio, profesional) y de ahí saca **el precio y el factor de duración**. Sin
 * fila responde «Esa persona no da ese servicio», y la tabla estaba VACÍA en la
 * demostración: dos estilistas, dieciséis servicios y ninguna combinación posible.
 * La agenda no se podía usar para nada.
 *
 * El nivel decide el factor, que es justo lo que el comentario de `PROFESIONALES`
 * decía que había que poder enseñar: la misma mecha dura menos con la senior. El
 * precio se toma del producto —el de lista— y así una demostración no empieza con
 * dos precios distintos para lo mismo sin que nadie lo haya pedido.
 */
async function sembrarQuienHaceQue(
  tx: Transaccion,
  organizacionId: string,
  servicios: readonly ServicioDemo[],
  productosPorNombre: ReadonlyMap<string, string>,
): Promise<void> {
  const gente = await tx
    .selectFrom('profesionales')
    .select(['id', 'nivel'])
    .where('organizacion_id', '=', organizacionId)
    .where('activo', '=', true)
    .execute();

  for (const persona of gente) {
    // 10 000 puntos base es «tarda lo que dice el catálogo». La senior tarda un
    // 10 % menos; la estilista, lo del catálogo. Nadie tarda MÁS: un factor por
    // encima de 10 000 en una demostración se lee como un castigo.
    const factor = persona.nivel === 'senior' || persona.nivel === 'director' ? 9_000 : 10_000;
    for (const servicio of servicios) {
      const productoId = productosPorNombre.get(servicio.nombre);
      if (productoId === undefined) continue;
      await tx
        .insertInto('servicios_profesional')
        .values({
          organizacion_id: organizacionId,
          servicio_id: productoId,
          profesional_id: persona.id,
          // Nulo es «el precio de lista del servicio», que es lo que se quiere:
          // un precio por persona se declara cuando alguien lo decide, no por
          // omisión en una siembra.
          precio_centavos: null,
          factor_duracion_bp: factor,
        })
        .onConflict((oc) => oc.columns(['servicio_id', 'profesional_id']).doNothing())
        .execute();
    }
  }
}

async function sembrarRecursos(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<number> {
  let creados = 0;
  for (const recurso of RECURSOS) {
    await tx
      .insertInto('recursos')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        nombre: recurso.nombre,
        tipo: recurso.tipo,
      })
      .execute();
    creados += 1;
  }
  return creados;
}

/**
 * Las profesionales, con su horario.
 *
 * `tipo_relacion` es `empleado_comision`, que es el trato normal de un salón: un
 * sueldo base y un porcentaje de lo que hace. `independiente_renta` —la que paga
 * por el mueble— existe en el esquema y NO se siembra: es un caso con su propia
 * pantalla (F-441) y sembrarlo sin la regla de renta dejaría a alguien cobrando
 * comisión Y pagando renta, que es justo lo que el `check` de la 130 prohíbe.
 */
async function sembrarProfesionales(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  empleos: ReadonlyMap<string, string>,
  /** La regla con la que comisionan. Sin ella, cobrar no causa comisión. */
  reglaComisionId: string,
): Promise<number> {
  let creadas = 0;
  for (const [indice, quien] of PROFESIONALES.entries()) {
    const empleoId = empleos.get(quien.empleo);
    // Sin empleo no se siembra: el `check` de la 130 exige que quien no renta
    // sea alguien de la casa, y saltárselo con `null` crearía a una persona que
    // cobra y no está en ningún lado.
    if (empleoId === undefined) continue;

    const profesional = await tx
      .insertInto('profesionales')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        empleo_id: empleoId,
        nombre_completo: quien.nombreCompleto,
        nombre_corto: quien.nombreCorto,
        tipo_relacion: 'empleado_comision',
        nivel: quien.nivel,
        color_agenda: quien.color,
        orden_agenda: indice,
        // `tipo_relacion: 'empleado_comision'` sin regla de comisión es una
        // contradicción que la base no impide y el cobro sí nota: `comisionDe`
        // sale por `null` y no se causa nada.
        regla_comision_id: reglaComisionId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Martes a domingo, que es la semana de un salón: el lunes se descansa.
    for (const dia of [2, 3, 4, 5, 6, 0]) {
      await sql`insert into horarios_profesional
          (organizacion_id, profesional_id, dia_semana, hora_inicio, hora_fin, vigente_desde)
        values (${organizacionId}, ${profesional.id}, ${dia}, ${HORARIO.inicio}::time,
          ${HORARIO.fin}::time, current_date)`.execute(tx);
    }
    creadas += 1;
  }
  return creadas;
}

/**
 * La fila de `servicios` de cada producto que es un servicio.
 *
 * El producto ya está creado por el reseteo —se vende y se cobra como todo lo
 * demás— y aquí se le añade lo que lo hace un servicio: los cuatro tramos.
 *
 * `pasivo_intercalable` se deriva y no se teclea: es verdad si y sólo si hay
 * procesado. Tecleado aparte, el día que alguien añada un servicio con procesado
 * y se olvide de la bandera, el hueco de esos minutos se perdería sin que
 * ninguna prueba lo note.
 */
async function sembrarServicios(
  tx: Transaccion,
  organizacionId: string,
  servicios: readonly ServicioDemo[],
  productosPorNombre: ReadonlyMap<string, string>,
): Promise<number> {
  let creados = 0;
  for (const servicio of servicios) {
    const productoId = productosPorNombre.get(servicio.nombre);
    if (productoId === undefined) continue;
    const pasiva = servicio.pasivaMin ?? 0;

    /**
     * Y EL PRODUCTO SE MARCA COMO SERVICIO. Esto faltaba.
     *
     * `productos.tipo_venta` admite `'servicio'` desde la migración 002, y la
     * siembra dejaba los 24 productos del salón en `'precio_fijo'` —incluidos
     * «Corte de dama» y los demás—. La pantalla de agendar lista los servicios
     * con `ProductoTerminado` filtrado por `tipo_venta: 'servicio'`, así que
     * **no encontraba ninguno**: un salón que no puede agendar nada.
     *
     * La fila de `servicios` es la que dice cuánto dura y qué mueble ocupa; el
     * `tipo_venta` es la que dice que ESO se vende como servicio. Se escriben
     * juntas porque separarlas es lo que produjo el hueco.
     */
    await tx
      .updateTable('productos')
      .set({
        tipo_venta: 'servicio',
        // Y sin consumo propio, que es lo que exige `producto_servicio_sin_stock`
        // y además es la verdad: un corte de dama no descuenta «un corte de dama»
        // del inventario. Lo que se gasta durante el servicio —tinte, agua
        // oxigenada— se registra al CERRARLO, con sus consumos.
        estrategia_consumo: 'ninguno',
      })
      .where('id', '=', productoId)
      .where('organizacion_id', '=', organizacionId)
      .execute();

    await tx
      .insertInto('servicios')
      .values({
        producto_id: productoId,
        organizacion_id: organizacionId,
        duracion_activa_1_min: servicio.activa1Min,
        duracion_pasiva_min: pasiva,
        duracion_activa_2_min: servicio.activa2Min ?? 0,
        duracion_cierre_min: servicio.cierreMin ?? 0,
        pasivo_intercalable: pasiva > 0,
        requiere_estacion: servicio.requiereEstacion ?? true,
        formula_base: null,
      })
      .execute();

    // Y qué mueble necesita. El lavabo se usa en el TERMINADO, no durante el
    // procesado: reservarlo todo el rato deja un lavabo bloqueado 45 minutos que
    // otras tres clientas podrían haber usado.
    if (servicio.requiereEstacion ?? true) {
      await sql`insert into recursos_servicio (servicio_id, tipo_recurso, tramo, minutos)
        values (${productoId}, 'estacion', 'todo', null)`.execute(tx);
    }
    if (pasiva > 0) {
      await sql`insert into recursos_servicio (servicio_id, tipo_recurso, tramo, minutos)
        values (${productoId}, 'lavabo', 'activa_2', ${servicio.activa2Min ?? 0})`.execute(tx);
    }
    creados += 1;
  }
  return creados;
}

/**
 * Borra el salón. Va con `limpiar()` del reseteo y ANTES de borrar productos:
 * `cita_servicios` y `comisiones_causadas` apuntan a `servicios` con `restrict`,
 * y `servicios` cuelga de `productos` con `cascade`. Borrar el producto primero
 * aborta la transacción entera si quedó una cita.
 */
export async function limpiarSalon(tx: Transaccion, organizacionId: string): Promise<void> {
  const org = organizacionId;
  // Lo que cuelga de una CITA, de arriba abajo.
  await sql`delete from formulas_aplicadas where organizacion_id = ${org}`.execute(tx);
  /**
   * LAS COMISIONES VAN ANTES QUE `cita_servicios`, y esto era un defecto.
   *
   * `comisiones_causadas.cita_servicio_id` apunta a `cita_servicios`, así que
   * borrar el servicio primero aborta la transacción entera con un 23503 en cuanto
   * existe UNA comisión. No se veía porque **ninguna demostración había cobrado
   * nunca una cita**: en el momento en que el salón cobró su primer servicio con
   * comisión, resetear la demo dejó de funcionar y el mensaje era «Algo falló de
   * nuestro lado». Un reseteo que sólo sirve con la demo sin usar no sirve.
   */
  await sql`delete from comisiones_causadas where organizacion_id = ${org}`.execute(tx);
  await sql`delete from cita_servicios where organizacion_id = ${org}`.execute(tx);
  await sql`delete from no_shows where organizacion_id = ${org}`.execute(tx);
  await sql`delete from lista_espera_citas where organizacion_id = ${org}`.execute(tx);
  await sql`delete from citas where organizacion_id = ${org}`.execute(tx);
  // Lo que cuelga de un PROFESIONAL.
  await sql`delete from movimientos_propina where organizacion_id = ${org}`.execute(tx);
  await sql`delete from liquidaciones where organizacion_id = ${org}`.execute(tx);
  await sql`delete from cobros_renta where organizacion_id = ${org}`.execute(tx);
  await sql`delete from rentas_estacion where organizacion_id = ${org}`.execute(tx);
  await sql`delete from bloqueos_agenda where organizacion_id = ${org}`.execute(tx);
  await sql`delete from horarios_profesional where organizacion_id = ${org}`.execute(tx);
  await sql`delete from servicios_profesional where organizacion_id = ${org}`.execute(tx);
  await sql`delete from expedientes_belleza where organizacion_id = ${org}`.execute(tx);
  await sql`delete from profesionales where organizacion_id = ${org}`.execute(tx);
  // Y los muebles. `recursos_servicio` cae con el servicio por cascada.
  await sql`delete from recursos where organizacion_id = ${org}`.execute(tx);
  await sql`delete from servicios where organizacion_id = ${org}`.execute(tx);
}
