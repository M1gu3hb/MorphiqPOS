import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-235 · Varias cajas a la vez · F-984 · El cajón de dinero.
 *
 * ── F-235 · Por qué una cafetería necesita dos cajas abiertas ────────────
 * En la hora pico hay dos terminales cobrando y una tercera en la barra de
 * afuera. No es una sucursal por caja: es el mismo negocio, el mismo turno y el
 * mismo inventario, con tres cajones que se arquean por separado. Sin esto, o
 * se cierra una para abrir la otra —y la fila se detiene— o las tres escriben
 * en la misma sesión y ningún arqueo cuadra.
 *
 * La base ya impide dos sesiones abiertas EN LA MISMA TERMINAL
 * (`sesiones_caja_una_abierta_por_terminal`, migración 003). Lo que falta es
 * poder VER las que están abiertas y saber cuál es la mía, que es la pregunta
 * de las diez de la noche: «¿quién no ha cerrado?».
 *
 * ── Y por qué el cajero sólo puede operar la SUYA ────────────────────────
 * Porque un movimiento de caja registrado en el cajón de otro es un descuadre
 * doble: sobra en uno y falta en el otro, y los dos son reales. La regla no es
 * de permisos —el cajero sí puede hacer movimientos— es de ámbito, y por eso
 * vive aquí y no en un rol.
 *
 * ── F-984 · El cajón se abre solo, y eso se REGISTRA ─────────────────────
 * En 180 cobros al día, abrir el cajón a mano son 180 movimientos de más y una
 * fuente constante de «se quedó abierto». La apertura automática la dispara el
 * cobro; lo que este comando cubre es la otra: la apertura SIN venta —para dar
 * cambio, para guardar un billete grande, para contar—.
 *
 * Ésa es la que hay que registrar con motivo y autor, porque es la única que
 * puede esconder un faltante. Un cajón que se abre sin venta y sin apunte es
 * exactamente el hueco por el que se va el dinero que después nadie explica.
 */

const CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const SUPERVISA = ['gerente', 'administrador', 'dueno'] as const;

export const entradaCajasAbiertas = z.object({
  /** `true` para ver TODAS las del negocio; `false`, sólo la de esta terminal. */
  todas: z.boolean().default(false),
});

export const entradaAbrirCajon = z.object({
  sesionCajaId: z.uuid(),
  motivo: z.enum(['dar_cambio', 'guardar_billete', 'conteo', 'otro']),
  nota: z.string().trim().max(200).optional(),
});

export interface CajaAbierta {
  readonly sesionId: string;
  readonly terminalId: string;
  readonly empleadoAbreId: string;
  readonly abiertaEn: string;
  readonly fondoInicialCentavos: string;
  /** `true` cuando es la de la terminal desde la que se pregunta. */
  readonly esLaMia: boolean;
}

export interface ResultadoCajas {
  readonly abiertas: readonly CajaAbierta[];
  /** Cuántas llevan abiertas más de lo que dura un turno. */
  readonly sinCerrarDesdeAyer: number;
}

export interface ResultadoCajon {
  readonly sesionCajaId: string;
  readonly motivo: string;
  /**
   * El pulso ESC/POS que abre el cajón, en bytes.
   *
   * Va en la respuesta y no lo manda el servidor porque el cajón está enchufado
   * a la impresora de la terminal, no a la nube. El servidor decide SI se abre
   * y lo registra; el pulso lo emite quien tiene el cable.
   */
  readonly pulso: readonly number[];
}

/**
 * El pulso estándar de apertura de cajón: `ESC p m t1 t2`.
 *
 * `m=0` es el conector 2, que es el que usa el 95 % de los cajones; los tiempos
 * son 25 ms de subida y 250 de bajada, que es lo que recomienda Epson y lo que
 * evita que un cajón duro no alcance a saltar.
 */
export const PULSO_CAJON: readonly number[] = [27, 112, 0, 25, 250];

/** Un turno largo son doce horas. Más que eso es una caja que nadie cerró. */
const HORAS_DE_UN_TURNO = 12;

export const cajasAbiertas = definirComando<
  Transaccion,
  typeof entradaCajasAbiertas,
  ResultadoCajas
>({
  nombre: 'caja.abiertas',
  entidad: 'sesion_caja',
  escribe: false,
  roles: [...CAJA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCajasAbiertas,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, rol } = ctx.ambito;

    // Ver TODAS las cajas del negocio es supervisar, y eso no es de cajero: su
    // corte enseña lo suyo, y lo de los demás no es asunto de la barra.
    const puedeVerTodas = (SUPERVISA as readonly string[]).includes(rol);
    if (entrada.todas && !puedeVerTodas) {
      throw new ErrorDominio(
        'PUENTE_SIN_PERMISO',
        'Ver las cajas de los demás es de la gerencia. Tú ves la tuya.',
      );
    }

    let consulta = ctx.tx
      .selectFrom('sesiones_caja')
      .select(['id', 'terminal_id', 'empleado_abre_id', 'abierta_en', 'fondo_inicial_centavos'])
      .where('organizacion_id', '=', organizacionId)
      .where('estado', '=', 'abierta');

    if (sucursalId !== null) consulta = consulta.where('sucursal_id', '=', sucursalId);
    if (!entrada.todas) consulta = consulta.where('terminal_id', '=', terminalId);

    const filas = await ctx.paso('leer_cajas', () => consulta.execute());

    const limite = ctx.ahora.getTime() - HORAS_DE_UN_TURNO * 3_600_000;
    const abiertas = filas.map((f) => ({
      sesionId: f.id,
      terminalId: f.terminal_id,
      empleadoAbreId: f.empleado_abre_id,
      abiertaEn: f.abierta_en.toISOString(),
      fondoInicialCentavos: f.fondo_inicial_centavos.toString(),
      esLaMia: f.terminal_id === terminalId,
    }));

    return {
      abiertas,
      // La cifra de las diez de la noche: «¿quién no ha cerrado?».
      sinCerrarDesdeAyer: filas.filter((f) => f.abierta_en.getTime() < limite).length,
    };
  },
});

export const abrirCajon = definirComando<Transaccion, typeof entradaAbrirCajon, ResultadoCajon>({
  nombre: 'caja.abrir_cajon',
  entidad: 'sesion_caja',
  escribe: true,
  roles: [...CAJA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAbrirCajon,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;

    const sesion = await ctx.paso('leer_sesion', () =>
      ctx.tx
        .selectFrom('sesiones_caja')
        .select(['id', 'estado', 'terminal_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.sesionCajaId)
        .executeTakeFirst(),
    );
    if (sesion === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa caja no existe en este negocio.');
    }
    if (sesion.estado !== 'abierta') {
      // Abrir el cajón de una caja cerrada es sacar dinero de un arqueo que ya
      // se firmó. Si hace falta, se reabre la caja y eso deja rastro.
      throw new ErrorDominio(
        'CAJA_CERRADA',
        'Esa caja ya está cerrada: su cajón no se abre desde el sistema.',
      );
    }
    // F-235 · El ámbito, no el permiso: un movimiento en el cajón de otro sobra
    // en uno y falta en el otro, y los dos descuadres son reales.
    if (sesion.terminal_id !== terminalId) {
      throw new ErrorDominio(
        'PUENTE_SIN_PERMISO',
        'Ése es el cajón de otra terminal. Cada quien abre el suyo.',
      );
    }

    // Se registra como movimiento de CERO: no mueve dinero, y aun así tiene que
    // quedar en el mismo sitio donde se lee todo lo demás del turno. Un registro
    // aparte sería un segundo lugar donde mirar cuando el arqueo no cuadra.
    await ctx.paso('anotar_apertura', () =>
      ctx.tx
        .insertInto('movimientos_caja')
        .values({
          organizacion_id: organizacionId,
          sesion_caja_id: entrada.sesionCajaId,
          tipo: 'ajuste',
          monto_centavos: 0n,
          motivo: `cajón abierto sin venta: ${entrada.motivo}${
            entrada.nota === undefined ? '' : ` · ${entrada.nota}`
          }`,
          referencia_tipo: 'manual',
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .execute(),
    );

    ctx.auditar({ entidadId: entrada.sesionCajaId, payload: { motivo: entrada.motivo } });
    return { sesionCajaId: entrada.sesionCajaId, motivo: entrada.motivo, pulso: PULSO_CAJON };
  },
});
