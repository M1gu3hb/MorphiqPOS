import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-153, F-154 y F-436 · El expediente de belleza.
 *
 * ── Por qué esto NO es «notas del cliente» ───────────────────────────────
 * En los otros cuatro modelos la ficha se consulta cuando hace falta. Aquí se
 * ABRE EN CADA VISITA, antes de tocar a la clienta, y se llena durante el
 * servicio con guantes puestos. Eso cambia la forma entera: no hay un «editar
 * ficha» al que alguien entra, hay un expediente que aparece solo y que se
 * guarda por trozos.
 *
 * ── Por eso hay UN comando y no dos ──────────────────────────────────────
 * `abrirExpediente` lee y escribe a la vez: crea el expediente si es la primera
 * visita, aplica lo que venga y devuelve la ficha entera. Separarlo en «ver» y
 * «guardar» obligaría a la pantalla a encadenar dos peticiones con la clienta
 * sentada delante, y a decidir qué hacer si la segunda falla.
 *
 * ── Y sólo se toca LO QUE VIENE ──────────────────────────────────────────
 * Mandar el formulario entero desde una pantalla que sólo quería corregir el
 * porcentaje de canas borraría las alergias. Es el mismo criterio que la ficha
 * de cliente (F-040), y por la misma razón: el campo caro casi nunca es el que
 * se está editando.
 *
 * ── Las alergias son columna, y son obligatorias ─────────────────────────
 * Una alergia dentro de un jsonb de notas es una alergia que nadie consulta. Y
 * el hueco en blanco no dice si se preguntó y no había, o si nadie preguntó:
 * sólo una de las dos es una decisión de alguien. Por eso «ninguna conocida»
 * es una respuesta válida y el vacío no.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
/** El profesional entra al expediente: es quien lo llena con guantes puestos. */
const CABINA = ['mesero', ...RECEPCION] as const;

export const entradaAbrirExpediente = z.object({
  clienteId: z.uuid(),
  alergias: z.string().trim().max(500).optional(),
  antecedentes: z.string().trim().max(1000).optional(),
  comoLlego: z.string().trim().max(200).optional(),
  queBusca: z.string().trim().max(500).optional(),
  tipoCabello: z.string().trim().max(60).nullable().optional(),
  porcentajeCanas: z.number().int().min(0).max(100).nullable().optional(),
  ultimoAlisadoEn: z.iso.date().nullable().optional(),
  /** Cada cuánto vuelve. De aquí sale «le toca volver» (F-951). */
  frecuenciaDias: z.number().int().min(1).max(730).nullable().optional(),
});

export const entradaUltimaFormula = z.object({
  clienteId: z.uuid(),
  /** Sin servicio devuelve la última de cualquiera: la clienta que sólo viene a un corte. */
  servicioId: z.uuid().nullable().default(null),
});

export const entradaFotoDeServicio = z.object({
  citaServicioId: z.uuid(),
  momento: z.enum(['antes', 'despues']),
  /** La URL que devolvió `archivos/subir`. Este comando no toca bytes. */
  url: z.url().max(500),
});

export interface Expediente {
  readonly clienteId: string;
  readonly alergias: string;
  readonly antecedentes: string;
  readonly comoLlego: string;
  readonly queBusca: string;
  readonly tipoCabello: string | null;
  readonly porcentajeCanas: number | null;
  readonly ultimoAlisadoEn: string | null;
  readonly frecuenciaDias: number | null;
  /** `true` la primera vez: la pantalla sabe que tiene que preguntarlo todo. */
  readonly esPrimeraVisita: boolean;
  /** Lo que falta por contestar. La pantalla lo enseña arriba de todo. */
  readonly sinContestar: readonly string[];
}

export interface FormulaAnterior {
  readonly formulaId: string;
  readonly servicioId: string | null;
  readonly profesionalId: string | null;
  readonly formula: unknown;
  readonly minutosProcesado: number | null;
  readonly resultado: string | null;
  readonly aplicadaEn: string;
  readonly diasDesde: number;
}

export interface ResultadoUltimaFormula {
  /** `null` cuando no hay ninguna: la pantalla enseña captura en blanco, no un error. */
  readonly ultima: FormulaAnterior | null;
}

export interface ResultadoFoto {
  readonly fotoId: string;
  readonly momento: string;
  /** `true` si ya había una de ese momento y se reemplazó. Lo dice, no lo esconde. */
  readonly reemplazo: boolean;
  readonly conConsentimiento: boolean;
}

const MS_POR_DIA = 86_400_000;

export const abrirExpediente = definirComando<
  Transaccion,
  typeof entradaAbrirExpediente,
  Expediente
>({
  nombre: 'expediente.abrir',
  entidad: 'cliente',
  escribe: true,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAbrirExpediente,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const cliente = await ctx.paso('leer_cliente', () =>
      ctx.tx
        .selectFrom('clientes')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        .executeTakeFirst(),
    );
    if (cliente === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa clienta no existe en este negocio.');
    }

    const existente = await ctx.paso('leer_expediente', () =>
      ctx.tx
        .selectFrom('expedientes_belleza')
        .selectAll()
        .where('organizacion_id', '=', organizacionId)
        .where('cliente_id', '=', entrada.clienteId)
        .executeTakeFirst(),
    );

    const esPrimeraVisita = existente === undefined;
    if (esPrimeraVisita) {
      // Nace con lo que venga y con lo demás en blanco. Abrirlo vacío es lo
      // correcto: el expediente existe desde que alguien lo mira, y `abierto_en`
      // es el dato que después explica desde cuándo se le da seguimiento.
      await ctx.paso('abrir_expediente', () =>
        ctx.tx
          .insertInto('expedientes_belleza')
          .values({
            cliente_id: entrada.clienteId,
            organizacion_id: organizacionId,
            alergias: entrada.alergias ?? '',
            antecedentes: entrada.antecedentes ?? '',
            como_llego: entrada.comoLlego ?? '',
            que_busca: entrada.queBusca ?? '',
            tipo_cabello: entrada.tipoCabello ?? null,
            porcentaje_canas: entrada.porcentajeCanas ?? null,
            ultimo_alisado_en: entrada.ultimoAlisadoEn ?? null,
            frecuencia_dias: entrada.frecuenciaDias ?? null,
            abierto_en: ctx.ahora,
            abierto_por: empleoId,
            updated_at: ctx.ahora,
          })
          .execute(),
      );
    } else {
      // Sólo lo que VIENE. Mandar el formulario entero desde la pantalla que
      // sólo quería corregir las canas borraría las alergias, que es el campo
      // por el que existe todo esto.
      const cambios: Record<string, unknown> = { updated_at: ctx.ahora };
      if (entrada.alergias !== undefined) cambios['alergias'] = entrada.alergias;
      if (entrada.antecedentes !== undefined) cambios['antecedentes'] = entrada.antecedentes;
      if (entrada.comoLlego !== undefined) cambios['como_llego'] = entrada.comoLlego;
      if (entrada.queBusca !== undefined) cambios['que_busca'] = entrada.queBusca;
      if (entrada.tipoCabello !== undefined) cambios['tipo_cabello'] = entrada.tipoCabello;
      if (entrada.porcentajeCanas !== undefined) {
        cambios['porcentaje_canas'] = entrada.porcentajeCanas;
      }
      if (entrada.ultimoAlisadoEn !== undefined) {
        cambios['ultimo_alisado_en'] = entrada.ultimoAlisadoEn;
      }
      if (entrada.frecuenciaDias !== undefined) cambios['frecuencia_dias'] = entrada.frecuenciaDias;

      await ctx.paso('guardar_expediente', () =>
        ctx.tx
          .updateTable('expedientes_belleza')
          .set(cambios)
          .where('organizacion_id', '=', organizacionId)
          .where('cliente_id', '=', entrada.clienteId)
          .execute(),
      );
    }

    const alergias = entrada.alergias ?? existente?.alergias ?? '';
    const antecedentes = entrada.antecedentes ?? existente?.antecedentes ?? '';
    const comoLlego = entrada.comoLlego ?? existente?.como_llego ?? '';
    const queBusca = entrada.queBusca ?? existente?.que_busca ?? '';

    // Lo que falta por contestar se devuelve como lista y no como un booleano:
    // «falta algo» manda a la recepcionista a buscar qué, y la clienta espera.
    const sinContestar: string[] = [];
    if (alergias.trim() === '') sinContestar.push('alergias');
    if (antecedentes.trim() === '') sinContestar.push('antecedentes');
    if (comoLlego.trim() === '') sinContestar.push('como_llego');
    if (queBusca.trim() === '') sinContestar.push('que_busca');

    ctx.auditar({ entidadId: entrada.clienteId, payload: { esPrimeraVisita } });
    return {
      clienteId: entrada.clienteId,
      alergias,
      antecedentes,
      comoLlego,
      queBusca,
      tipoCabello: entrada.tipoCabello ?? existente?.tipo_cabello ?? null,
      porcentajeCanas: entrada.porcentajeCanas ?? existente?.porcentaje_canas ?? null,
      ultimoAlisadoEn: entrada.ultimoAlisadoEn ?? existente?.ultimo_alisado_en ?? null,
      frecuenciaDias: entrada.frecuenciaDias ?? existente?.frecuencia_dias ?? null,
      esPrimeraVisita,
      sinContestar,
    };
  },
});

export const ultimaFormula = definirComando<
  Transaccion,
  typeof entradaUltimaFormula,
  ResultadoUltimaFormula
>({
  nombre: 'expediente.ultima_formula',
  entidad: 'cliente',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaUltimaFormula,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    let consulta = ctx.tx
      .selectFrom('formulas_aplicadas')
      .select([
        'id',
        'servicio_id',
        'profesional_id',
        'formula',
        'minutos_procesado',
        'resultado',
        'aplicada_en',
      ])
      .where('organizacion_id', '=', organizacionId)
      .where('cliente_id', '=', entrada.clienteId)
      .orderBy('aplicada_en', 'desc')
      .limit(1);
    if (entrada.servicioId !== null) {
      consulta = consulta.where('servicio_id', '=', entrada.servicioId);
    }

    const fila = await ctx.paso('leer_formula', () => consulta.executeTakeFirst());
    if (fila === undefined) return { ultima: null };

    // Los días desde la última van CON la fórmula: «este tono hace cinco
    // semanas» y «este tono hace ocho meses» no se repiten igual, y quien está
    // mezclando no tiene tiempo de restar fechas.
    const diasDesde = Math.floor((ctx.ahora.getTime() - fila.aplicada_en.getTime()) / MS_POR_DIA);

    return {
      ultima: {
        formulaId: fila.id,
        servicioId: fila.servicio_id,
        profesionalId: fila.profesional_id,
        formula: fila.formula,
        minutosProcesado: fila.minutos_procesado,
        resultado: fila.resultado,
        aplicadaEn: fila.aplicada_en.toISOString(),
        diasDesde,
      },
    };
  },
});

export const guardarFotoDeServicio = definirComando<
  Transaccion,
  typeof entradaFotoDeServicio,
  ResultadoFoto
>({
  nombre: 'expediente.foto',
  entidad: 'cita_servicio',
  escribe: true,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaFotoDeServicio,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const servicio = await ctx.paso('leer_servicio', () =>
      ctx.tx
        .selectFrom('cita_servicios')
        .innerJoin('citas', 'citas.id', 'cita_servicios.cita_id')
        .select(['cita_servicios.id as id', 'citas.cliente_id as cliente_id'])
        .where('cita_servicios.organizacion_id', '=', organizacionId)
        .where('cita_servicios.id', '=', entrada.citaServicioId)
        .executeTakeFirst(),
    );
    if (servicio === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese servicio no existe en este negocio.');
    }
    if (servicio.cliente_id === null) {
      // La foto vive en el expediente de alguien. Sin clienta no hay expediente
      // donde ponerla, y guardarla suelta la dejaría fuera de cualquier
      // consentimiento: son 20 a 60 fotos al mes de la cara de una persona.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cita no tiene clienta: la foto no tiene expediente donde vivir.',
      );
    }
    const clienteId = servicio.cliente_id;

    // El consentimiento VIGENTE, y se busca de verdad: una foto sin él se
    // guarda igual —negarla haría que el salón dejara de documentar— pero
    // queda marcada como lo que es, y el reporte de fotos publicables la
    // excluye sola.
    const consentimiento = await ctx.paso('leer_consentimiento', () =>
      ctx.tx
        .selectFrom('consentimientos')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('cliente_id', '=', clienteId)
        .where('alcance', 'in', ['foto_interna', 'foto_publicable'])
        .where('revocado_en', 'is', null)
        .orderBy('otorgado_en', 'desc')
        .executeTakeFirst(),
    );

    const previa = await ctx.paso('leer_previa', () =>
      ctx.tx
        .selectFrom('fotos_expediente')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('cita_servicio_id', '=', entrada.citaServicioId)
        .where('momento', '=', entrada.momento)
        .executeTakeFirst(),
    );

    // Una foto por momento y por servicio: el `unique` de la 137 lo impone. Si
    // ya hay una se BORRA antes, y el resultado lo dice — la segunda «antes»
    // tapando a la primera en silencio deja a nadie sabiendo cuál era la buena.
    if (previa !== undefined) {
      await ctx.paso('borrar_previa', () =>
        ctx.tx
          .deleteFrom('fotos_expediente')
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', previa.id)
          .execute(),
      );
    }

    const foto = await ctx.paso('guardar_foto', () =>
      ctx.tx
        .insertInto('fotos_expediente')
        .values({
          organizacion_id: organizacionId,
          cliente_id: clienteId,
          cita_servicio_id: entrada.citaServicioId,
          momento: entrada.momento,
          archivo_url: entrada.url,
          consentimiento_id: consentimiento?.id ?? null,
          tomada_en: ctx.ahora,
          tomada_por: empleoId,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: entrada.citaServicioId,
      payload: { momento: entrada.momento, reemplazo: previa !== undefined },
    });
    return {
      fotoId: foto.id,
      momento: entrada.momento,
      reemplazo: previa !== undefined,
      conConsentimiento: consentimiento !== undefined,
    };
  },
});
