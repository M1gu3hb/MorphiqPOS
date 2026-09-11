import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

/**
 * `caja.corte_turno` — el arqueo de MEDIA jornada (E8-3).
 *
 * ── El hueco que cierra ────────────────────────────────────────────────────
 * `Caja.jsx:907` tiene un botón «Corte de turno» que hace esto:
 *
 *     await api.entidades.CorteCaja.create({
 *       folio: generateFolio('CT'),          // el folio, del navegador
 *       usuario_cajero_id: posUser?.id,      // y a quién se acredita, también
 *       total_efectivo: resumen.totalEfectivo,
 *       total_general: resumen.totalGeneral, // y los cuatro importes
 *       …
 *
 * Tres defectos en una llamada: el folio lo inventa el cliente —dos cajas a la
 * vez producen el mismo—, la atribución viaja en el cuerpo, y los totales del
 * turno los suma el navegador sobre lo que tenga cargado en pantalla. Y encima
 * `CorteCaja` mapea `sesiones_caja`, no `cortes_turno`, así que el puente la
 * rechaza y el botón falla SIEMPRE.
 *
 * ── Qué es un corte de turno, y qué NO ─────────────────────────────────────
 * Es una foto firmada: cuánto había en el cajón cuando el cajero entregó el
 * turno. **NO cierra la caja** —la sesión sigue abierta, con su fondo y su
 * folio— y por eso no toca `sesiones_caja` ni consume su serie. El retiro, si
 * lo hay, es un `caja.movimiento` aparte: mezclarlo aquí haría que el arqueo
 * del día no cuadrara.
 *
 * Lo único que el cajero aporta es lo que CONTÓ. Todo lo demás —el rango, el
 * esperado, quién firma— sale del servidor.
 */

const ROLES_DE_CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaCorteTurno = z.object({
  /** Lo que el cajero contó en el cajón. Es el único dato que él aporta. */
  efectivoContadoCentavos: z.number().int().min(0).max(1_000_000_000),
  notas: z.string().trim().max(500).nullable().default(null),
});

export interface ResultadoCorteTurno {
  readonly corteTurnoId: string;
  readonly serie: string;
  /** `bigint` de la base como texto: un folio no pasa por `number`. */
  readonly folio: string;
  readonly rangoInicio: Date;
  readonly efectivoContadoCentavos: string;
  readonly efectivoEsperadoCentavos: string;
  /** Contado menos esperado. Negativo es faltante. */
  readonly diferenciaCentavos: string;
  readonly ventasCentavos: string;
  readonly numeroVentas: number;
}

export const corteDeTurno = definirComando<
  Transaccion,
  typeof entradaCorteTurno,
  ResultadoCorteTurno
>({
  nombre: 'caja.corte_turno',
  entidad: 'corte_turno',
  escribe: true,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCorteTurno,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (terminalId === null || sucursalId === null) {
      throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Haz el corte de turno desde la terminal.');
    }

    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) {
      throw new ErrorDominio(
        'CAJA_CERRADA',
        'No hay una caja abierta en esta terminal. El corte de turno se hace con la caja abierta.',
      );
    }

    // El arqueo se deriva DENTRO de la transacción, igual que en el cierre: si
    // se leyera antes, una venta cobrada en ese hueco quedaría fuera del corte.
    const arqueo = await ctx.paso('derivar_arqueo', () =>
      repoCaja.arqueoDeSesion(ctx.tx, organizacionId, sesion.id),
    );

    // El rango arranca donde terminó el corte de turno anterior, y sólo si no
    // hay ninguno, en la apertura de la caja. Sin esto, dos cortes seguidos
    // contarían las mismas ventas dos veces.
    const rangoInicio = await ctx.paso('rango_del_turno', () =>
      repoCaja.inicioDelTurno(ctx.tx, organizacionId, sesion.id, sesion.abiertaEn),
    );

    const contado = BigInt(entrada.efectivoContadoCentavos);
    const registrado = await ctx.paso('registrar_corte', () =>
      repoCaja.registrarCorteDeTurno(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        sucursalId,
        // De la SESIÓN. El `usuario_cajero_id` que mandaba `Caja.jsx:923` dejaba
        // que cualquiera firmara el turno de otro desde la consola.
        empleadoId: empleoId,
        rangoInicio,
        efectivoContadoCentavos: contado,
        notas: entrada.notas,
        ahora: ctx.ahora,
      }),
    );

    const diferencia = contado - arqueo.efectivoEsperadoCentavos;

    ctx.auditar({
      entidadId: registrado.id,
      payload: {
        serie: registrado.serie,
        folio: registrado.folio.toString(),
        contadoCentavos: contado.toString(),
        esperadoCentavos: arqueo.efectivoEsperadoCentavos.toString(),
        diferenciaCentavos: diferencia.toString(),
        numeroVentas: arqueo.numeroVentas,
      },
    });

    return {
      corteTurnoId: registrado.id,
      serie: registrado.serie,
      folio: registrado.folio.toString(),
      rangoInicio,
      efectivoContadoCentavos: contado.toString(),
      efectivoEsperadoCentavos: arqueo.efectivoEsperadoCentavos.toString(),
      diferenciaCentavos: diferencia.toString(),
      ventasCentavos: arqueo.ventasCentavos.toString(),
      numeroVentas: arqueo.numeroVentas,
    };
  },
});
