import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import {
  huecosDeAgenda,
  seEnciman,
  type Rango,
  type VentanaDeTrabajo,
} from '@morphiqpos/domain/agenda';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { desdeMultirango, desdeRango } from './agenda.ts';

/**
 * F-404, F-415, F-417 y F-951 · Lo que la agenda CONTESTA.
 *
 * ── El endpoint más difícil del modelo, y por qué ────────────────────────
 * «¿A qué hora le puedo dar un tinte?» parece una consulta y son cinco: el
 * horario vigente del profesional, sus citas activas, los bloqueos del salón,
 * el factor de duración de esa persona para ese servicio, y —la que nadie
 * hace— los tramos PASIVOS de otras citas, que están libres porque el
 * procesado no ocupa a nadie. Ese último renglón es el 25 %–40 % de capacidad
 * que F-415 vino a recuperar; sin él esto es una resta y sobra.
 *
 * ── Por qué la ocupación se mide contra el HORARIO y no contra el día ────
 * Un profesional que trabaja de dos a ocho no tiene 40 % de ocupación porque
 * llenó seis horas de quince: tiene el 100 %. Medir contra el día natural hace
 * que el reporte diga que sobra gente cuando falta.
 *
 * ── Y los huecos que NO se vendieron son un reporte, no una anécdota ─────
 * F-417: cuánta capacidad se quedó sin vender, en pesos, por día y por
 * persona. Un salón que no lo mide contrata por la sensación de estar lleno.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const CABINA = ['mesero', ...RECEPCION] as const;
const DIRECCION = ['gerente', 'administrador', 'dueno'] as const;

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 86_400_000;
/** Los estados en que una cita de verdad ocupa a alguien. */
const ESTADOS_VIVOS = ['agendada', 'confirmada', 'en_curso', 'terminada'] as const;

export const entradaAgendaDelDia = z.object({
  fecha: z.iso.date(),
  profesionalId: z.uuid().nullable().default(null),
});

export const entradaHuecos = z.object({
  desde: z.iso.date(),
  hasta: z.iso.date(),
  /** Para cuánto tiene que dar el hueco. Un hueco de doce minutos no es un hueco. */
  minutos: z.number().int().min(5).max(600),
  profesionalId: z.uuid().nullable().default(null),
});

export const entradaProximosHuecos = z.object({
  minutos: z.number().int().min(5).max(600),
  profesionalId: z.uuid().nullable().default(null),
  /** Cuántos ofrecer. Seis: los que caben en una pantalla sin desplazar. */
  cuantos: z.number().int().min(1).max(20).default(6),
  /** Hasta cuántos días adelante mirar. */
  dias: z.number().int().min(1).max(60).default(14),
});

export const entradaPorVolver = z.object({
  /** Cuánto se tolera de retraso antes de que cuente como «no ha vuelto». */
  holguraDias: z.number().int().min(0).max(120).default(7),
  limite: z.number().int().min(1).max(500).default(100),
});

export const entradaReporteAgenda = z.object({
  desde: z.iso.date(),
  hasta: z.iso.date(),
});

export interface CitaDelDia {
  readonly citaServicioId: string;
  readonly citaId: string;
  readonly folio: string;
  readonly clienteId: string | null;
  readonly profesionalId: string;
  readonly servicioId: string;
  readonly estado: string;
  readonly precioCentavos: string;
  readonly inicio: string;
  readonly fin: string;
  /** Los tramos ACTIVOS. Lo de en medio es procesado y no ocupa a nadie. */
  readonly activos: readonly { readonly inicio: string; readonly fin: string }[];
}

export interface ColumnaDeAgenda {
  readonly profesionalId: string;
  readonly nombreCorto: string;
  readonly colorAgenda: string;
  readonly ventanas: readonly { readonly inicio: string; readonly fin: string }[];
  readonly citas: readonly CitaDelDia[];
  /** Junta, comida, festivo. El tiempo que la rejilla pinta y nadie puede vender. */
  readonly bloqueos: readonly { readonly inicio: string; readonly fin: string }[];
  readonly minutosOcupados: number;
  readonly minutosDisponibles: number;
}

export interface ResultadoAgendaDelDia {
  readonly fecha: string;
  readonly columnas: readonly ColumnaDeAgenda[];
}

export interface HuecoOfrecido {
  readonly profesionalId: string;
  readonly nombreCorto: string;
  readonly inicio: string;
  readonly fin: string;
  readonly minutos: number;
  /** `true` cuando el hueco sale del procesado de otra cita: es capacidad que nadie más ve. */
  readonly esIntercalado: boolean;
}

export interface ResultadoHuecos {
  readonly huecos: readonly HuecoOfrecido[];
}

export interface ClientaPorVolver {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly ultimaVisita: string;
  readonly diasDesde: number;
  readonly frecuenciaDias: number;
  /** Cuántos días lleva de retraso sobre SU ritmo, no sobre un promedio. */
  readonly diasDeRetraso: number;
}

export interface ResultadoPorVolver {
  readonly clientas: readonly ClientaPorVolver[];
}

export interface OcupacionDeProfesional {
  readonly profesionalId: string;
  readonly nombreCorto: string;
  readonly minutosDisponibles: number;
  readonly minutosOcupados: number;
  /** En puntos base, para no arrastrar flotantes a un reporte. */
  readonly ocupacionBp: number;
  readonly citas: number;
  readonly vendidoCentavos: string;
}

export interface ResultadoOcupacion {
  readonly desde: string;
  readonly hasta: string;
  readonly profesionales: readonly OcupacionDeProfesional[];
}

export interface HuecoNoVendido {
  readonly profesionalId: string;
  readonly nombreCorto: string;
  readonly dia: string;
  readonly minutos: number;
}

export interface ResultadoReporteHuecos {
  readonly desde: string;
  readonly hasta: string;
  readonly minutosPerdidos: number;
  /** Lo que valían esos minutos al ticket medio de la persona. Estimado, y lo dice. */
  readonly valorEstimadoCentavos: string;
  readonly porDia: readonly HuecoNoVendido[];
}

export const agendaDelDia = definirComando<
  Transaccion,
  typeof entradaAgendaDelDia,
  ResultadoAgendaDelDia
>({
  nombre: 'agenda.dia',
  entidad: 'cita',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAgendaDelDia,
  async ejecutar(ctx, entrada) {
    const dia = new Date(`${entrada.fecha}T00:00:00.000Z`);
    const finDelDia = new Date(dia.getTime() + MS_POR_DIA);

    const profesionales = await leerProfesionales(ctx, entrada.profesionalId);
    const servicios = await leerServiciosEntre(ctx, dia, finDelDia, entrada.profesionalId);
    const bloqueos = await leerBloqueos(ctx, dia, finDelDia);
    const horarios = await leerHorarios(ctx, entrada.profesionalId);

    const columnas: ColumnaDeAgenda[] = profesionales.map((profesional) => {
      const ventanas = ventanasDelDia(horarios, profesional.id, dia);
      const suyas = servicios.filter((s) => s.profesional_id === profesional.id);

      const citas: CitaDelDia[] = suyas.map((s) => {
        const ocupacion = desdeRango(s.rango_ocupacion);
        const activos = desdeMultirango(s.rango_activo);
        return {
          citaServicioId: s.id,
          citaId: s.cita_id,
          folio: s.folio,
          clienteId: s.cliente_id,
          profesionalId: s.profesional_id,
          servicioId: s.servicio_id,
          estado: s.estado,
          precioCentavos: s.precio_centavos.toString(),
          inicio: (ocupacion?.inicio ?? dia).toISOString(),
          fin: (ocupacion?.fin ?? dia).toISOString(),
          activos: activos.map((a) => ({
            inicio: a.inicio.toISOString(),
            fin: a.fin.toISOString(),
          })),
        };
      });

      // Lo ocupado son los tramos ACTIVOS, no la ocupación entera: contar el
      // procesado como ocupado es exactamente el error que hace que la agenda
      // se vea llena a las once cuando hay hueco para un corte.
      const activos = suyas.flatMap((s) => desdeMultirango(s.rango_activo));

      // Los bloqueos del salón entero —`profesional_id` nulo— le tocan a todas
      // las columnas: pintarlos sólo en la de quien los creó haría que la
      // rejilla ofreciera la hora de la junta en las demás.
      const suyosBloqueados: Rango[] = [];
      for (const bloqueo of bloqueos) {
        if (bloqueo.profesional_id !== null && bloqueo.profesional_id !== profesional.id) continue;
        const rango = desdeRango(bloqueo.rango);
        if (rango !== null) suyosBloqueados.push(rango);
      }

      return {
        profesionalId: profesional.id,
        nombreCorto: profesional.nombre_corto,
        colorAgenda: profesional.color_agenda,
        ventanas: ventanas.map((v) => ({
          inicio: v.inicio.toISOString(),
          fin: v.fin.toISOString(),
        })),
        citas,
        bloqueos: suyosBloqueados.map((b) => ({
          inicio: b.inicio.toISOString(),
          fin: b.fin.toISOString(),
        })),
        minutosOcupados: minutosDe(activos),
        minutosDisponibles: minutosDe(ventanas.map((v) => ({ inicio: v.inicio, fin: v.fin }))),
      };
    });

    return { fecha: entrada.fecha, columnas };
  },
});

export const huecosDisponibles = definirComando<Transaccion, typeof entradaHuecos, ResultadoHuecos>(
  {
    nombre: 'agenda.huecos',
    entidad: 'cita',
    escribe: false,
    roles: [...CABINA],
    paquetes: PAQUETES_TODOS,
    entrada: entradaHuecos,
    async ejecutar(ctx, entrada) {
      const huecos = await calcularHuecos(ctx, {
        desde: new Date(`${entrada.desde}T00:00:00.000Z`),
        hasta: new Date(`${entrada.hasta}T00:00:00.000Z`),
        minutos: entrada.minutos,
        profesionalId: entrada.profesionalId,
      });
      return { huecos };
    },
  },
);

export const proximosHuecos = definirComando<
  Transaccion,
  typeof entradaProximosHuecos,
  ResultadoHuecos
>({
  nombre: 'agenda.proximos_huecos',
  entidad: 'cita',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaProximosHuecos,
  async ejecutar(ctx, entrada) {
    // Desde AHORA y no desde hoy a las cero: ofrecer las nueve de la mañana a
    // las once es cómo se agenda una cita que ya pasó.
    const desde = ctx.ahora;
    const hasta = new Date(desde.getTime() + entrada.dias * MS_POR_DIA);

    const todos = await calcularHuecos(ctx, {
      desde,
      hasta,
      minutos: entrada.minutos,
      profesionalId: entrada.profesionalId,
    });

    const ordenados = [...todos].sort(
      (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
    );
    return { huecos: ordenados.slice(0, entrada.cuantos) };
  },
});

export const clientesPorVolver = definirComando<
  Transaccion,
  typeof entradaPorVolver,
  ResultadoPorVolver
>({
  nombre: 'agenda.por_volver',
  entidad: 'cliente',
  escribe: false,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaPorVolver,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // Sólo las que DECLARARON cada cuánto vuelven. Sin `frecuencia_dias` no hay
    // a qué comparar: una clienta de tinte cada cinco semanas y una de corte
    // cada cuatro meses no «se atrasan» igual, y un umbral único las mete a las
    // dos en la misma lista equivocada.
    const expedientes = await ctx.paso('leer_expedientes', () =>
      ctx.tx
        .selectFrom('expedientes_belleza')
        .select(['cliente_id', 'frecuencia_dias'])
        .where('organizacion_id', '=', organizacionId)
        .where('frecuencia_dias', 'is not', null)
        .execute(),
    );
    if (expedientes.length === 0) return { clientas: [] };

    // La ventana acota la consulta Y dice algo: quien lleva dos años sin venir
    // no está «por volver», se fue. Meterla en la lista de llamadas del martes
    // la vuelve una lista que nadie termina, y entonces nadie la usa.
    const ventana = new Date(ctx.ahora.getTime() - VENTANA_POR_VOLVER_DIAS * MS_POR_DIA);
    const visitas = await ctx.paso('leer_visitas', () =>
      ctx.tx
        .selectFrom('citas')
        .select(['cliente_id', 'agendada_para'])
        .where('organizacion_id', '=', organizacionId)
        .where('estado', '=', 'cobrada')
        .where('agendada_para', '>=', ventana)
        .execute(),
    );

    // El máximo por clienta se hace aquí y no con un `group by`: un salón tiene
    // cientos de clientas con expediente, no cientos de miles, y tener la
    // aritmética de «cuánto lleva sin venir» en un solo sitio es lo que hace
    // que la lista y la ficha de la clienta no digan cosas distintas.
    const ultimaPorClienta = new Map<string, Date>();
    for (const visita of visitas) {
      if (visita.cliente_id === null) continue;
      const previa = ultimaPorClienta.get(visita.cliente_id);
      if (previa === undefined || visita.agendada_para.getTime() > previa.getTime()) {
        ultimaPorClienta.set(visita.cliente_id, visita.agendada_para);
      }
    }

    const fichas = await ctx.paso('leer_fichas', () =>
      ctx.tx
        .selectFrom('clientes')
        .select(['id', 'nombre', 'telefono'])
        .where('organizacion_id', '=', organizacionId)
        .execute(),
    );
    const nombrePorId = new Map(fichas.map((f) => [f.id, f]));

    const clientas: ClientaPorVolver[] = [];
    for (const expediente of expedientes) {
      const frecuencia = expediente.frecuencia_dias;
      if (frecuencia === null) continue;
      const ultima = ultimaPorClienta.get(expediente.cliente_id);
      // Sin visita cobrada dentro de la ventana no se llama: puede no haber
      // venido nunca, y «vuelve, que te toca» a quien no ha venido jamás es la
      // llamada que hace que el salón apague la función.
      if (ultima === undefined) continue;

      const diasDesde = Math.floor((ctx.ahora.getTime() - ultima.getTime()) / MS_POR_DIA);
      const diasDeRetraso = diasDesde - frecuencia;
      // La holgura evita llamar a quien lleva un día de retraso: una lista que
      // incluye a media cartera no se usa, y entonces no sirve de nada.
      if (diasDeRetraso < entrada.holguraDias) continue;

      const ficha = nombrePorId.get(expediente.cliente_id);
      clientas.push({
        clienteId: expediente.cliente_id,
        nombre: ficha?.nombre ?? 'Sin nombre',
        telefono: ficha?.telefono ?? null,
        ultimaVisita: ultima.toISOString(),
        diasDesde,
        frecuenciaDias: frecuencia,
        diasDeRetraso,
      });
    }

    // Por retraso descendente: a quien lleva más tiempo sin volver es a quien
    // se está a punto de perder, y la llamada del martes son diez, no cien.
    clientas.sort((a, b) => b.diasDeRetraso - a.diasDeRetraso);
    return { clientas: clientas.slice(0, entrada.limite) };
  },
});

export const reporteDeOcupacion = definirComando<
  Transaccion,
  typeof entradaReporteAgenda,
  ResultadoOcupacion
>({
  nombre: 'agenda.ocupacion',
  entidad: 'cita',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaReporteAgenda,
  async ejecutar(ctx, entrada) {
    const desde = new Date(`${entrada.desde}T00:00:00.000Z`);
    const hasta = new Date(`${entrada.hasta}T00:00:00.000Z`);

    const profesionales = await leerProfesionales(ctx, null);
    const servicios = await leerServiciosEntre(ctx, desde, hasta, null);
    const horarios = await leerHorarios(ctx, null);

    const resumen = profesionales.map((profesional) => {
      const suyas = servicios.filter((s) => s.profesional_id === profesional.id);
      const activos = suyas.flatMap((s) => desdeMultirango(s.rango_activo));
      const minutosOcupados = minutosDe(activos);

      // El denominador es SU horario, no el día natural. Quien trabaja de dos a
      // ocho y llena seis horas está al 100 %, no al 25 %: el reporte que lo
      // mide contra las veinticuatro dice que sobra gente cuando falta.
      let minutosDisponibles = 0;
      for (let d = new Date(desde); d < hasta; d = new Date(d.getTime() + MS_POR_DIA)) {
        minutosDisponibles += minutosDe(
          ventanasDelDia(horarios, profesional.id, d).map((v) => ({
            inicio: v.inicio,
            fin: v.fin,
          })),
        );
      }

      const vendido = suyas.reduce((suma, s) => suma + s.precio_centavos, 0n);
      return {
        profesionalId: profesional.id,
        nombreCorto: profesional.nombre_corto,
        minutosDisponibles,
        minutosOcupados,
        ocupacionBp:
          minutosDisponibles === 0
            ? 0
            : Math.round((minutosOcupados * 10_000) / minutosDisponibles),
        citas: suyas.length,
        vendidoCentavos: vendido.toString(),
      };
    });

    return { desde: entrada.desde, hasta: entrada.hasta, profesionales: resumen };
  },
});

export const reporteDeHuecos = definirComando<
  Transaccion,
  typeof entradaReporteAgenda,
  ResultadoReporteHuecos
>({
  nombre: 'agenda.reporte_huecos',
  entidad: 'cita',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaReporteAgenda,
  async ejecutar(ctx, entrada) {
    const desde = new Date(`${entrada.desde}T00:00:00.000Z`);
    const hasta = new Date(`${entrada.hasta}T00:00:00.000Z`);

    const profesionales = await leerProfesionales(ctx, null);
    const servicios = await leerServiciosEntre(ctx, desde, hasta, null);
    const horarios = await leerHorarios(ctx, null);
    const bloqueos = await leerBloqueos(ctx, desde, hasta);

    const porDia: HuecoNoVendido[] = [];
    let minutosPerdidos = 0;
    let valorEstimado = 0n;

    for (const profesional of profesionales) {
      const suyas = servicios.filter((s) => s.profesional_id === profesional.id);
      // El ticket medio de ESA persona, no el del salón: el hueco de quien
      // hace tintes vale el triple que el de quien hace cortes, y promediarlos
      // esconde justo dónde duele.
      const vendido = suyas.reduce((suma, s) => suma + s.precio_centavos, 0n);
      const minutosVendidos = minutosDe(suyas.flatMap((s) => desdeMultirango(s.rango_activo)));
      const centavosPorMinuto = minutosVendidos === 0 ? 0n : vendido / BigInt(minutosVendidos);

      const ocupados = ocupadosDe(suyas, bloqueos, profesional.id);

      for (let d = new Date(desde); d < hasta; d = new Date(d.getTime() + MS_POR_DIA)) {
        const ventanas = ventanasDelDia(horarios, profesional.id, d);
        if (ventanas.length === 0) continue;
        // El mínimo es el hueco más corto que de verdad se puede vender. Con
        // uno menor el reporte cuenta como pérdida los cinco minutos entre dos
        // citas, que nunca fueron vendibles.
        const libres = huecosDeAgenda(ventanas, ocupados, MINIMO_VENDIBLE_MIN);
        const minutos = libres.reduce((suma, h) => suma + h.minutos, 0);
        if (minutos === 0) continue;

        minutosPerdidos += minutos;
        valorEstimado += BigInt(minutos) * centavosPorMinuto;
        porDia.push({
          profesionalId: profesional.id,
          nombreCorto: profesional.nombre_corto,
          dia: d.toISOString().slice(0, 10),
          minutos,
        });
      }
    }

    return {
      desde: entrada.desde,
      hasta: entrada.hasta,
      minutosPerdidos,
      valorEstimadoCentavos: valorEstimado.toString(),
      porDia,
    };
  },
});

/** Media hora: por debajo de eso no cabe ningún servicio del catálogo típico. */
const MINIMO_VENDIBLE_MIN = 30;

/** Dos años. Más allá la clienta no está «por volver»: se fue. */
const VENTANA_POR_VOLVER_DIAS = 730;

interface FilaProfesional {
  readonly id: string;
  readonly nombre_corto: string;
  readonly color_agenda: string;
}

interface FilaServicio {
  readonly id: string;
  readonly cita_id: string;
  readonly folio: string;
  readonly cliente_id: string | null;
  readonly profesional_id: string;
  readonly servicio_id: string;
  readonly estado: string;
  readonly precio_centavos: bigint;
  readonly rango_activo: string;
  readonly rango_ocupacion: string;
}

interface FilaHorario {
  readonly profesional_id: string;
  readonly dia_semana: number;
  readonly hora_inicio: string;
  readonly hora_fin: string;
  readonly vigente_desde: string;
  readonly vigente_hasta: string | null;
}

async function leerProfesionales(
  ctx: ContextoComando<Transaccion>,
  profesionalId: string | null,
): Promise<readonly FilaProfesional[]> {
  const { organizacionId } = ctx.ambito;
  let consulta = ctx.tx
    .selectFrom('profesionales')
    .select(['id', 'nombre_corto', 'color_agenda'])
    .where('organizacion_id', '=', organizacionId)
    .where('activo', '=', true)
    .orderBy('orden_agenda', 'asc');
  if (profesionalId !== null) consulta = consulta.where('id', '=', profesionalId);
  return ctx.paso('leer_profesionales', () => consulta.execute());
}

/**
 * Los servicios del periodo, en DOS consultas y no en un `join`.
 *
 * `citas` y `cita_servicios` tienen las dos una columna `estado` y significan
 * cosas distintas —una cita «cobrada» tiene servicios «cerrados»—. Filtrar por
 * las dos en el mismo `select` con alias es la clase de consulta que se lee mal
 * el día que alguien la toca, y en la que un `cs.estado` escrito donde iba
 * `c.estado` no falla: devuelve otra cosa, en silencio.
 */
async function leerServiciosEntre(
  ctx: ContextoComando<Transaccion>,
  desde: Date,
  hasta: Date,
  profesionalId: string | null,
): Promise<readonly FilaServicio[]> {
  const { organizacionId } = ctx.ambito;

  const citas = await ctx.paso('leer_citas', () =>
    ctx.tx
      .selectFrom('citas')
      .select(['id', 'folio', 'cliente_id'])
      .where('organizacion_id', '=', organizacionId)
      .where('agendada_para', '>=', desde)
      .where('agendada_para', '<', hasta)
      .where('estado', 'in', [...ESTADOS_VIVOS, 'cobrada'])
      .execute(),
  );
  if (citas.length === 0) return [];

  let consulta = ctx.tx
    .selectFrom('cita_servicios')
    .select([
      'id',
      'cita_id',
      'profesional_id',
      'servicio_id',
      'estado',
      'precio_centavos',
      'rango_activo',
      'rango_ocupacion',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where(
      'cita_id',
      'in',
      citas.map((c) => c.id),
    );
  if (profesionalId !== null) consulta = consulta.where('profesional_id', '=', profesionalId);

  const servicios = await ctx.paso('leer_servicios', () => consulta.execute());
  const porCita = new Map(citas.map((c) => [c.id, c]));

  return servicios.map((s) => {
    const cita = porCita.get(s.cita_id);
    return {
      id: s.id,
      cita_id: s.cita_id,
      folio: cita?.folio ?? '',
      cliente_id: cita?.cliente_id ?? null,
      profesional_id: s.profesional_id,
      servicio_id: s.servicio_id,
      estado: s.estado,
      precio_centavos: s.precio_centavos,
      rango_activo: s.rango_activo,
      rango_ocupacion: s.rango_ocupacion,
    };
  });
}

/**
 * Los bloqueos del negocio, y el solape se decide DESPUÉS, en TypeScript.
 *
 * El filtro `rango && tstzrange(...)` habría sido más corto, pero dejaría la
 * decisión de «este bloqueo cuenta» repartida entre Postgres y el código: la
 * rejilla del día y el reporte de huecos acabarían aplicando dos criterios que
 * sólo discrepan en el borde, que es exactamente donde duele. Un salón tiene
 * decenas de bloqueos al año, no decenas de miles.
 */
async function leerBloqueos(
  ctx: ContextoComando<Transaccion>,
  desde: Date,
  hasta: Date,
): Promise<readonly { profesional_id: string | null; rango: string }[]> {
  const { organizacionId } = ctx.ambito;
  const todos = await ctx.paso('leer_bloqueos', () =>
    ctx.tx
      .selectFrom('bloqueos_agenda')
      .select(['profesional_id', 'rango'])
      .where('organizacion_id', '=', organizacionId)
      .execute(),
  );

  const ventana: Rango = { inicio: desde, fin: hasta };
  return todos.filter((bloqueo) => {
    const rango = desdeRango(bloqueo.rango);
    return rango !== null && seEnciman(rango, ventana);
  });
}

async function leerHorarios(
  ctx: ContextoComando<Transaccion>,
  profesionalId: string | null,
): Promise<readonly FilaHorario[]> {
  const { organizacionId } = ctx.ambito;
  let consulta = ctx.tx
    .selectFrom('horarios_profesional')
    .select([
      'profesional_id',
      'dia_semana',
      'hora_inicio',
      'hora_fin',
      'vigente_desde',
      'vigente_hasta',
    ])
    .where('organizacion_id', '=', organizacionId);
  if (profesionalId !== null) consulta = consulta.where('profesional_id', '=', profesionalId);
  return ctx.paso('leer_horarios', () => consulta.execute());
}

/**
 * Las ventanas de trabajo de un profesional para UN día concreto.
 *
 * Se filtra por vigencia y no sólo por día de la semana: el horario tiene
 * `vigente_desde` porque la agenda de marzo se explica con el horario de marzo,
 * y aplicarle el de hoy inventa huecos que en marzo no existían.
 */
function ventanasDelDia(
  horarios: readonly FilaHorario[],
  profesionalId: string,
  dia: Date,
): readonly VentanaDeTrabajo[] {
  const fecha = dia.toISOString().slice(0, 10);
  const diaSemana = dia.getUTCDay();

  return horarios
    .filter(
      (h) =>
        h.profesional_id === profesionalId &&
        h.dia_semana === diaSemana &&
        h.vigente_desde <= fecha &&
        (h.vigente_hasta === null || h.vigente_hasta >= fecha),
    )
    .map((h) => ({
      inicio: new Date(`${fecha}T${normalizarHora(h.hora_inicio)}Z`),
      fin: new Date(`${fecha}T${normalizarHora(h.hora_fin)}Z`),
    }));
}

/** `09:00` y `09:00:00` son la misma hora; Postgres devuelve la segunda forma. */
function normalizarHora(hora: string): string {
  const partes = hora.split(':');
  const [hh = '00', mm = '00', ss = '00'] = partes;
  return `${hh.padStart(2, '0')}:${mm}:${ss}`;
}

function minutosDe(rangos: readonly Rango[]): number {
  return rangos.reduce(
    (suma, r) =>
      suma + Math.max(0, Math.floor((r.fin.getTime() - r.inicio.getTime()) / MS_POR_MINUTO)),
    0,
  );
}

/**
 * Lo que de verdad tiene ocupado a alguien: sus tramos ACTIVOS más los
 * bloqueos que le tocan.
 *
 * El procesado NO entra, y ésa es la línea entera de F-415: el tinte que está
 * asentando no ocupa a la estilista, y ese tramo es donde cabe el corte que
 * hoy se rechaza por teléfono.
 */
function ocupadosDe(
  servicios: readonly FilaServicio[],
  bloqueos: readonly { profesional_id: string | null; rango: string }[],
  profesionalId: string,
): readonly Rango[] {
  const activos = servicios.flatMap((s) => desdeMultirango(s.rango_activo));
  const suyos: Rango[] = [];
  for (const bloqueo of bloqueos) {
    // `null` es un bloqueo de TODO el salón —la junta del lunes, el festivo— y
    // le toca a todos: saltárselo ofrecería citas el día que está cerrado.
    if (bloqueo.profesional_id !== null && bloqueo.profesional_id !== profesionalId) continue;
    const rango = desdeRango(bloqueo.rango);
    if (rango !== null) suyos.push(rango);
  }
  return [...activos, ...suyos];
}

interface PeticionDeHuecos {
  readonly desde: Date;
  readonly hasta: Date;
  readonly minutos: number;
  readonly profesionalId: string | null;
}

async function calcularHuecos(
  ctx: ContextoComando<Transaccion>,
  peticion: PeticionDeHuecos,
): Promise<readonly HuecoOfrecido[]> {
  const profesionales = await leerProfesionales(ctx, peticion.profesionalId);
  const servicios = await leerServiciosEntre(
    ctx,
    peticion.desde,
    peticion.hasta,
    peticion.profesionalId,
  );
  const horarios = await leerHorarios(ctx, peticion.profesionalId);
  const bloqueos = await leerBloqueos(ctx, peticion.desde, peticion.hasta);

  const huecos: HuecoOfrecido[] = [];
  const primerDia = new Date(peticion.desde);
  primerDia.setUTCHours(0, 0, 0, 0);

  for (const profesional of profesionales) {
    const suyas = servicios.filter((s) => s.profesional_id === profesional.id);
    const ocupados = ocupadosDe(suyas, bloqueos, profesional.id);
    // Las ocupaciones COMPLETAS —procesado incluido— sólo se usan para marcar
    // qué huecos son intercalados. No se restan: restarlas devolvería la
    // agenda al modelo de un solo número.
    const ocupacionesEnteras = suyas
      .map((s) => desdeRango(s.rango_ocupacion))
      .filter((r): r is Rango => r !== null);

    for (let d = new Date(primerDia); d < peticion.hasta; d = new Date(d.getTime() + MS_POR_DIA)) {
      const ventanas = ventanasDelDia(horarios, profesional.id, d);
      if (ventanas.length === 0) continue;

      for (const hueco of huecosDeAgenda(ventanas, ocupados, peticion.minutos)) {
        // Un hueco que ya pasó no se ofrece: es cómo se agenda a las once una
        // cita de las nueve.
        if (hueco.fin.getTime() <= peticion.desde.getTime()) continue;
        const inicio =
          hueco.inicio.getTime() < peticion.desde.getTime() ? peticion.desde : hueco.inicio;
        const minutos = Math.floor((hueco.fin.getTime() - inicio.getTime()) / MS_POR_MINUTO);
        if (minutos < peticion.minutos) continue;

        huecos.push({
          profesionalId: profesional.id,
          nombreCorto: profesional.nombre_corto,
          inicio: inicio.toISOString(),
          fin: hueco.fin.toISOString(),
          minutos,
          esIntercalado: ocupacionesEnteras.some(
            (o) => o.inicio.getTime() < hueco.fin.getTime() && inicio.getTime() < o.fin.getTime(),
          ),
        });
      }
    }
  }

  return huecos;
}
