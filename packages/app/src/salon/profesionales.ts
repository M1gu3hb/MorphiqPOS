import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { desdeMultirango, desdeRango } from './agenda.ts';
import { profesionalExigida } from './recorte.ts';

/**
 * F-420, F-426 y F-427 · Quién atiende, qué hizo y qué se le debe.
 *
 * ── «Mi día» no es la agenda filtrada ────────────────────────────────────
 * Lo parece, y por eso casi siempre se implementa así. Pero la agenda del
 * salón la lee la recepción para COLOCAR gente, y ésta la lee la estilista
 * entre clienta y clienta, de pie, con el teléfono en una mano. Lleva lo que
 * ella necesita —quién sigue, a qué hora, qué le toca hacer y cuánto lleva
 * ganado— y NO lleva lo que no le toca ver: el margen del servicio ni el costo
 * del material que absorbe el salón.
 *
 * ── Y la comisión se lee ANTES de la liquidación, no después ─────────────
 * La discusión de fin de quincena —«a mí me salían otros números»— se evita
 * dejándola mirar el acumulado todos los días. Un salón que sólo enseña la
 * comisión el día del pago tiene esa discusión cada quince días, y la tiene con
 * la persona que le está atendiendo a las clientas.
 *
 * ── El comprobante de liquidación se RECONSTRUYE, no se guarda ───────────
 * Se arma con las mismas filas de `comisiones_causadas` que la liquidación
 * sumó. Guardar un PDF congelado dejaría dos versiones de la misma verdad, y la
 * que se imprime volvería a ser la que nadie puede auditar.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const CABINA = ['mesero', ...RECEPCION] as const;
const DIRECCION = ['gerente', 'administrador', 'dueno'] as const;

const MS_POR_DIA = 86_400_000;

function esTexto(valor: string | null): valor is string {
  return valor !== null;
}

export const entradaListaProfesionales = z.object({
  /** Los de baja siguen en el histórico: se piden aparte, no se esconden. */
  incluirInactivos: z.boolean().default(false),
});

export const entradaMiDia = z.object({
  profesionalId: z.uuid(),
  fecha: z.iso.date().nullable().default(null),
});

export const entradaComisionesDe = z.object({
  profesionalId: z.uuid(),
  desde: z.iso.date(),
  hasta: z.iso.date(),
});

export const entradaComprobante = z.object({ liquidacionId: z.uuid() });

export interface FichaDeProfesional {
  readonly profesionalId: string;
  readonly nombreCompleto: string;
  readonly nombreCorto: string;
  readonly fotoUrl: string | null;
  readonly tipoRelacion: string;
  readonly nivel: string;
  readonly colorAgenda: string;
  readonly activo: boolean;
  /** `true` cuando renta la estación: no tiene empleo y no entra a nómina. */
  readonly rentaEstacion: boolean;
}

export interface ResultadoProfesionales {
  readonly profesionales: readonly FichaDeProfesional[];
}

export interface CitaDeMiDia {
  readonly citaServicioId: string;
  readonly folio: string;
  readonly clienteId: string | null;
  readonly clienta: string | null;
  readonly servicioId: string;
  readonly servicio: string;
  readonly estado: string;
  readonly inicio: string;
  readonly fin: string;
  /** Cuándo vuelve a necesitarla: el final del primer tramo activo. */
  readonly libreDesde: string | null;
  /** Lo que la clienta paga. NO el margen: ése no le toca verlo. */
  readonly precioCentavos: string;
  /**
   * SU comisión por este servicio, cuando ya se causó (C.9 de la 2.4): el detalle que el
   * documento pone al lado de cada cita. `null` mientras el servicio no se cobra.
   */
  readonly comisionCentavos: string | null;
  /** Los minutos de procesado del servicio: el hueco en que ella queda libre. */
  readonly minutosProcesado: number | null;
  /** La clienta tiene alergias declaradas en su expediente. Un error aquí es una quemadura. */
  readonly alergias: boolean;
}

export interface ResultadoMiDia {
  readonly profesionalId: string;
  readonly fecha: string;
  readonly citas: readonly CitaDeMiDia[];
  readonly comisionDelDiaCentavos: string;
  readonly propinaDelDiaCentavos: string;
  /** Lo siguiente que le toca. `null` cuando ya terminó el día. */
  readonly siguiente: CitaDeMiDia | null;
}

export interface ComisionDeLinea {
  readonly comisionId: string;
  readonly citaServicioId: string | null;
  readonly tipo: string;
  readonly baseCentavos: string;
  readonly tasaBp: number;
  readonly montoCentavos: string;
  readonly materialDescontadoCentavos: string;
  readonly liquidada: boolean;
  readonly causadaEn: string;
}

export interface ResultadoComisiones {
  readonly profesionalId: string;
  readonly desde: string;
  readonly hasta: string;
  readonly causadoCentavos: string;
  readonly liquidadoCentavos: string;
  /** Lo que todavía se le debe. Es el único número que importa el día 15. */
  readonly pendienteCentavos: string;
  readonly lineas: readonly ComisionDeLinea[];
}

export interface ResultadoComprobante {
  readonly liquidacionId: string;
  readonly profesionalId: string;
  readonly nombreCompleto: string;
  readonly periodoDesde: string;
  readonly periodoHasta: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly materialCargadoCentavos: string;
  readonly rentaCentavos: string;
  readonly cobradoPorEllaCentavos: string;
  readonly anticiposCentavos: string;
  readonly totalCentavos: string;
  readonly pagadaEn: string | null;
  /** Los renglones que sumaron ese total. Un comprobante sin detalle no se audita. */
  readonly lineas: readonly ComisionDeLinea[];
}

export const listaDeProfesionales = definirComando<
  Transaccion,
  typeof entradaListaProfesionales,
  ResultadoProfesionales
>({
  nombre: 'profesionales.lista',
  entidad: 'profesional',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaListaProfesionales,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    let consulta = ctx.tx
      .selectFrom('profesionales')
      .select([
        'id',
        'nombre_completo',
        'nombre_corto',
        'foto_url',
        'tipo_relacion',
        'nivel',
        'color_agenda',
        'activo',
        'empleo_id',
      ])
      .where('organizacion_id', '=', organizacionId)
      .orderBy('orden_agenda', 'asc');
    if (!entrada.incluirInactivos) consulta = consulta.where('activo', '=', true);

    const filas = await ctx.paso('leer_profesionales', () => consulta.execute());

    return {
      profesionales: filas.map((f) => ({
        profesionalId: f.id,
        nombreCompleto: f.nombre_completo,
        nombreCorto: f.nombre_corto,
        fotoUrl: f.foto_url,
        tipoRelacion: f.tipo_relacion,
        nivel: f.nivel,
        colorAgenda: f.color_agenda,
        activo: f.activo,
        // Sin empleo es quien RENTA la estación (F-441): no cobra comisión,
        // paga renta. Presentarla igual que a una empleada haría que el salón
        // le calculara una nómina que no existe.
        rentaEstacion: f.empleo_id === null,
      })),
    };
  },
});

export const miDia = definirComando<Transaccion, typeof entradaMiDia, ResultadoMiDia>({
  nombre: 'profesionales.mi_dia',
  entidad: 'profesional',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaMiDia,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // «Mi día» es el de quien entra: la estilista no abre el de otra (C.10).
    const profesionalId = await profesionalExigida(ctx, entrada.profesionalId);
    const fecha = entrada.fecha ?? ctx.ahora.toISOString().slice(0, 10);
    const dia = new Date(`${fecha}T00:00:00.000Z`);
    const finDelDia = new Date(dia.getTime() + MS_POR_DIA);

    // Dos consultas y no un `join`: `citas` y `cita_servicios` tienen las dos
    // una columna `estado` y significan cosas distintas —una cita «cobrada»
    // tiene servicios «cerrados»—. Mezclarlas con alias es la consulta en la
    // que un `cs.estado` escrito donde iba `c.estado` no falla: devuelve otra
    // cosa, en silencio.
    const citasDelDia = await ctx.paso('leer_citas', () =>
      ctx.tx
        .selectFrom('citas')
        .select(['id', 'folio', 'cliente_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('agendada_para', '>=', dia)
        .where('agendada_para', '<', finDelDia)
        .where('estado', 'in', ['agendada', 'confirmada', 'en_curso', 'terminada', 'cobrada'])
        .execute(),
    );

    const filas =
      citasDelDia.length === 0
        ? []
        : await ctx.paso('leer_servicios', () =>
            ctx.tx
              .selectFrom('cita_servicios')
              .select([
                'id',
                'cita_id',
                'servicio_id',
                'estado',
                'precio_centavos',
                'rango_activo',
                'rango_ocupacion',
              ])
              .where('organizacion_id', '=', organizacionId)
              .where('profesional_id', '=', profesionalId)
              .where(
                'cita_id',
                'in',
                citasDelDia.map((c) => c.id),
              )
              .execute(),
          );

    const porCita = new Map(citasDelDia.map((c) => [c.id, c]));
    const clienteIds = [...new Set(citasDelDia.map((c) => c.cliente_id).filter(esTexto))];
    const fichas =
      clienteIds.length === 0
        ? []
        : await ctx.paso('leer_clientas', () =>
            ctx.tx
              .selectFrom('clientes')
              .select(['id', 'nombre'])
              .where('organizacion_id', '=', organizacionId)
              .where('id', 'in', clienteIds)
              .execute(),
          );
    const nombrePorCliente = new Map(fichas.map((f) => [f.id, f.nombre]));

    const servicioIds = [...new Set(filas.map((f) => f.servicio_id))];
    const productos =
      servicioIds.length === 0
        ? []
        : await ctx.paso('leer_servicios_catalogo', () =>
            ctx.tx
              .selectFrom('productos')
              .select(['id', 'nombre'])
              .where('organizacion_id', '=', organizacionId)
              .where('id', 'in', servicioIds)
              .execute(),
          );
    const nombrePorServicio = new Map(productos.map((p) => [p.id, p.nombre]));

    const duraciones =
      servicioIds.length === 0
        ? []
        : await ctx.paso('leer_procesado', () =>
            ctx.tx
              .selectFrom('servicios')
              .select(['producto_id', 'duracion_pasiva_min'])
              .where('organizacion_id', '=', organizacionId)
              .where('producto_id', 'in', servicioIds)
              .execute(),
          );
    const procesadoPorServicio = new Map(
      duraciones.map((d) => [d.producto_id, d.duracion_pasiva_min]),
    );

    const expedientes =
      clienteIds.length === 0
        ? []
        : await ctx.paso('leer_alergias', () =>
            ctx.tx
              .selectFrom('expedientes_belleza')
              .select(['cliente_id', 'alergias'])
              .where('organizacion_id', '=', organizacionId)
              .where('cliente_id', 'in', clienteIds)
              .execute(),
          );
    const conAlergias = new Set(
      expedientes.filter((e) => e.alergias.trim() !== '').map((e) => e.cliente_id),
    );

    const comision = await ctx.paso('leer_comision_del_dia', () =>
      ctx.tx
        .selectFrom('comisiones_causadas')
        .select(['monto_centavos', 'cita_servicio_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('profesional_id', '=', profesionalId)
        .where('causada_en', '>=', dia)
        .where('causada_en', '<', finDelDia)
        .execute(),
    );
    const comisionPorServicio = new Map<string, bigint>();
    for (const c of comision) {
      if (c.cita_servicio_id === null) continue;
      comisionPorServicio.set(
        c.cita_servicio_id,
        (comisionPorServicio.get(c.cita_servicio_id) ?? 0n) + c.monto_centavos,
      );
    }

    const citas: CitaDeMiDia[] = filas
      .map((f) => {
        const ocupacion = desdeRango(f.rango_ocupacion);
        const activos = desdeMultirango(f.rango_activo);
        const cita = porCita.get(f.cita_id);
        const clienteId = cita?.cliente_id ?? null;
        return {
          citaServicioId: f.id,
          folio: cita?.folio ?? '',
          clienteId,
          clienta: clienteId === null ? null : (nombrePorCliente.get(clienteId) ?? null),
          servicioId: f.servicio_id,
          servicio: nombrePorServicio.get(f.servicio_id) ?? 'Servicio',
          estado: f.estado,
          inicio: (ocupacion?.inicio ?? dia).toISOString(),
          fin: (ocupacion?.fin ?? dia).toISOString(),
          // El primer tramo activo termina cuando empieza el procesado: ése es
          // el minuto en que ella queda libre aunque la clienta siga sentada,
          // y es toda la razón por la que existe esta pantalla.
          libreDesde: activos[0]?.fin.toISOString() ?? null,
          precioCentavos: f.precio_centavos.toString(),
          comisionCentavos: comisionPorServicio.get(f.id)?.toString() ?? null,
          minutosProcesado: procesadoPorServicio.get(f.servicio_id) ?? null,
          alergias: clienteId !== null && conAlergias.has(clienteId),
        };
      })
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

    const propina = await ctx.paso('leer_propina_del_dia', () =>
      ctx.tx
        .selectFrom('movimientos_propina')
        .select(['monto_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('profesional_id', '=', profesionalId)
        .where('created_at', '>=', dia)
        .where('created_at', '<', finDelDia)
        .execute(),
    );

    // Lo siguiente es lo primero que todavía no cerró. «Ya terminaste» y «se
    // te acabó la lista» son la misma pantalla, y la segunda es la que sirve.
    const siguiente =
      citas.find((c) => c.estado === 'pendiente' || c.estado === 'en_curso') ?? null;

    return {
      profesionalId: profesionalId,
      fecha,
      citas,
      comisionDelDiaCentavos: comision.reduce((s, c) => s + c.monto_centavos, 0n).toString(),
      propinaDelDiaCentavos: propina.reduce((s, p) => s + p.monto_centavos, 0n).toString(),
      siguiente,
    };
  },
});

export const comisionesDelProfesional = definirComando<
  Transaccion,
  typeof entradaComisionesDe,
  ResultadoComisiones
>({
  nombre: 'profesionales.comisiones',
  entidad: 'profesional',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaComisionesDe,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const desde = new Date(`${entrada.desde}T00:00:00.000Z`);
    const hasta = new Date(`${entrada.hasta}T00:00:00.000Z`);

    // Las comisiones de OTRA no se leen pasando su id (C.10).
    const profesionalId = await profesionalExigida(ctx, entrada.profesionalId);
    const filas = await leerComisiones(ctx, organizacionId, {
      profesionalId,
      desde,
      hasta,
    });

    let causado = 0n;
    let liquidado = 0n;
    for (const linea of filas) {
      causado += BigInt(linea.montoCentavos);
      if (linea.liquidada) liquidado += BigInt(linea.montoCentavos);
    }

    return {
      profesionalId,
      desde: entrada.desde,
      hasta: entrada.hasta,
      causadoCentavos: causado.toString(),
      liquidadoCentavos: liquidado.toString(),
      // El pendiente se RESTA y no se vuelve a consultar: dos consultas para
      // el mismo número acaban discrepando justo el día del pago.
      pendienteCentavos: (causado - liquidado).toString(),
      lineas: filas,
    };
  },
});

export const comprobanteDeLiquidacion = definirComando<
  Transaccion,
  typeof entradaComprobante,
  ResultadoComprobante
>({
  nombre: 'liquidaciones.comprobante',
  entidad: 'liquidacion',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaComprobante,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const liquidacion = await ctx.paso('leer_liquidacion', () =>
      ctx.tx
        .selectFrom('liquidaciones as l')
        .innerJoin('profesionales as p', 'p.id', 'l.profesional_id')
        .select([
          'l.id as id',
          'l.profesional_id as profesional_id',
          'p.nombre_completo as nombre_completo',
          'l.periodo_desde as periodo_desde',
          'l.periodo_hasta as periodo_hasta',
          'l.comision_centavos as comision_centavos',
          'l.propina_centavos as propina_centavos',
          'l.material_cargado_centavos as material_cargado_centavos',
          'l.renta_centavos as renta_centavos',
          'l.cobrado_por_ella_centavos as cobrado_por_ella_centavos',
          'l.anticipos_centavos as anticipos_centavos',
          'l.total_centavos as total_centavos',
          'l.pagada_en as pagada_en',
        ])
        .where('l.organizacion_id', '=', organizacionId)
        .where('l.id', '=', entrada.liquidacionId)
        .executeTakeFirst(),
    );
    if (liquidacion === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa liquidación no existe en este negocio.');
    }

    // El detalle sale de las MISMAS filas que la liquidación marcó. Volver a
    // calcularlo por fechas daría un comprobante que no suma su propio total
    // en cuanto una comisión se causara fuera del periodo y se liquidara
    // dentro, que es precisamente lo que pasa con el servicio del día 15.
    const lineas = await leerComisiones(ctx, organizacionId, {
      liquidacionId: entrada.liquidacionId,
    });

    return {
      liquidacionId: liquidacion.id,
      profesionalId: liquidacion.profesional_id,
      nombreCompleto: liquidacion.nombre_completo,
      periodoDesde: liquidacion.periodo_desde,
      periodoHasta: liquidacion.periodo_hasta,
      comisionCentavos: liquidacion.comision_centavos.toString(),
      propinaCentavos: liquidacion.propina_centavos.toString(),
      materialCargadoCentavos: liquidacion.material_cargado_centavos.toString(),
      rentaCentavos: liquidacion.renta_centavos.toString(),
      cobradoPorEllaCentavos: liquidacion.cobrado_por_ella_centavos.toString(),
      anticiposCentavos: liquidacion.anticipos_centavos.toString(),
      totalCentavos: liquidacion.total_centavos.toString(),
      pagadaEn: liquidacion.pagada_en?.toISOString() ?? null,
      lineas,
    };
  },
});

interface FiltroDeComisiones {
  readonly profesionalId?: string;
  readonly desde?: Date;
  readonly hasta?: Date;
  readonly liquidacionId?: string;
}

/**
 * Las comisiones, leídas SIEMPRE con la misma forma.
 *
 * Lo usan la consulta diaria de la estilista y el comprobante del día de pago.
 * Que los dos lean igual es lo que hace que el número que ella vio el martes
 * sea el número que aparece en su comprobante del quince.
 */
async function leerComisiones(
  ctx: { tx: Transaccion; paso: <T>(n: string, f: () => Promise<T>) => Promise<T> },
  organizacionId: string,
  filtro: FiltroDeComisiones,
): Promise<readonly ComisionDeLinea[]> {
  let consulta = ctx.tx
    .selectFrom('comisiones_causadas')
    .select([
      'id',
      'cita_servicio_id',
      'tipo',
      'base_centavos',
      'tasa_bp',
      'monto_centavos',
      'material_descontado_centavos',
      'liquidacion_id',
      'causada_en',
    ])
    .where('organizacion_id', '=', organizacionId)
    .orderBy('causada_en', 'asc');

  if (filtro.profesionalId !== undefined) {
    consulta = consulta.where('profesional_id', '=', filtro.profesionalId);
  }
  if (filtro.desde !== undefined) consulta = consulta.where('causada_en', '>=', filtro.desde);
  if (filtro.hasta !== undefined) consulta = consulta.where('causada_en', '<', filtro.hasta);
  if (filtro.liquidacionId !== undefined) {
    consulta = consulta.where('liquidacion_id', '=', filtro.liquidacionId);
  }

  const filas = await ctx.paso('leer_comisiones', () => consulta.execute());
  return filas.map((f) => ({
    comisionId: f.id,
    citaServicioId: f.cita_servicio_id,
    tipo: f.tipo,
    baseCentavos: f.base_centavos.toString(),
    tasaBp: f.tasa_bp,
    montoCentavos: f.monto_centavos.toString(),
    materialDescontadoCentavos: f.material_descontado_centavos.toString(),
    liquidada: f.liquidacion_id !== null,
    causadaEn: f.causada_en.toISOString(),
  }));
}
