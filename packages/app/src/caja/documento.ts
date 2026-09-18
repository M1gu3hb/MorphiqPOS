import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-259 · El corte, en la forma en que se entrega y se archiva.
 *
 * ── Por qué esto NO devuelve un PDF ──────────────────────────────────────
 * Porque un PDF armado en el servidor es un binario que nadie puede auditar y
 * que hay que volver a generar cada vez que cambia el logo, el domicilio fiscal
 * o una etiqueta. Lo que se devuelve son los RENGLONES del corte, y el PDF lo
 * imprime el navegador con la hoja de estilos de impresión que ya existe: el
 * mismo documento se ve en pantalla, se imprime y se guarda, y cuando alguien
 * lo discute se puede señalar la fila.
 *
 * ── Y por qué se reconstruye en vez de guardarse ─────────────────────────
 * Guardar el documento congelado dejaría dos versiones de la misma verdad: la
 * archivada y la que sale de los movimientos. En el minuto en que discrepen
 * —una anulación tardía, un movimiento capturado después— la que se imprime es
 * justo la que nadie puede rastrear.
 *
 * ── El desglose por tipo es el documento, no un adorno ───────────────────
 * «Faltan $340» no le sirve a nadie. «Faltan $340 y hubo tres retiros sin
 * motivo» es una conversación que se puede tener. Por eso los movimientos van
 * enteros y agrupados, y los que no traen motivo se cuentan aparte.
 */

const DIRECCION = ['gerente', 'administrador', 'dueno'] as const;

export const entradaDocumentoDeCorte = z.object({ corteId: z.uuid() });

export interface RenglonDeCorte {
  readonly tipo: string;
  readonly movimientos: number;
  readonly montoCentavos: string;
  /** Cuántos de esos movimientos entraron sin explicación. */
  readonly sinMotivo: number;
}

export interface MovimientoDelCorte {
  readonly movimientoId: string;
  readonly tipo: string;
  readonly montoCentavos: string;
  readonly motivo: string | null;
  readonly empleadoId: string | null;
  readonly registradoEn: string;
}

export interface DocumentoDeCorte {
  readonly corteId: string;
  readonly folio: string;
  readonly sesionCajaId: string;
  readonly terminalId: string;
  readonly empleadoId: string;
  readonly rangoInicio: string;
  readonly cortadoEn: string;
  readonly fondoInicialCentavos: string;
  readonly efectivoContadoCentavos: string;
  readonly efectivoRetiradoCentavos: string;
  /** Lo que la caja DEBERÍA tener: fondo más lo que entró menos lo que salió. */
  readonly efectivoEsperadoCentavos: string;
  /** Contado menos esperado. Negativo es faltante, y se dice con esa palabra. */
  readonly diferenciaCentavos: string;
  readonly renglones: readonly RenglonDeCorte[];
  readonly movimientos: readonly MovimientoDelCorte[];
  readonly notas: string | null;
}

export const documentoDeCorte = definirComando<
  Transaccion,
  typeof entradaDocumentoDeCorte,
  DocumentoDeCorte
>({
  nombre: 'caja.documento_corte',
  entidad: 'corte_turno',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaDocumentoDeCorte,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const corte = await ctx.paso('leer_corte', () =>
      ctx.tx
        .selectFrom('cortes_turno as ct')
        .innerJoin('sesiones_caja as s', 's.id', 'ct.sesion_caja_id')
        .select([
          'ct.id as id',
          'ct.serie as serie',
          'ct.folio as folio',
          'ct.sesion_caja_id as sesion_caja_id',
          'ct.rango_inicio as rango_inicio',
          'ct.cortado_en as cortado_en',
          'ct.empleado_id as empleado_id',
          'ct.efectivo_contado_centavos as contado',
          'ct.efectivo_retirado_centavos as retirado',
          'ct.notas as notas',
          's.terminal_id as terminal_id',
          's.fondo_inicial_centavos as fondo',
        ])
        .where('ct.organizacion_id', '=', organizacionId)
        .where('ct.id', '=', entrada.corteId)
        .executeTakeFirst(),
    );
    if (corte === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese corte no existe en este negocio.');
    }

    // Los movimientos del TRAMO del corte, no de la sesión entera: una sesión
    // con tres cortes de turno tiene tres documentos, y sumarle a cada uno todo
    // lo del día haría que los tres dijeran el mismo total y ninguno cuadrara.
    const movimientos = await ctx.paso('leer_movimientos', () =>
      ctx.tx
        .selectFrom('movimientos_caja')
        .select(['id', 'tipo', 'monto_centavos', 'motivo', 'empleado_id', 'created_at'])
        .where('organizacion_id', '=', organizacionId)
        .where('sesion_caja_id', '=', corte.sesion_caja_id)
        .where('created_at', '>=', corte.rango_inicio)
        .where('created_at', '<=', corte.cortado_en)
        .orderBy('created_at', 'asc')
        .execute(),
    );

    const porTipo = new Map<string, { monto: bigint; cuantos: number; sinMotivo: number }>();
    let neto = 0n;
    for (const movimiento of movimientos) {
      const acumulado = porTipo.get(movimiento.tipo) ?? { monto: 0n, cuantos: 0, sinMotivo: 0 };
      acumulado.monto += movimiento.monto_centavos;
      acumulado.cuantos += 1;
      // El movimiento sin motivo se CUENTA. «Faltan $340» no le sirve a nadie;
      // «faltan $340 y hubo tres retiros sin explicación» sí.
      if (movimiento.motivo === null || movimiento.motivo.trim() === '') {
        acumulado.sinMotivo += 1;
      }
      porTipo.set(movimiento.tipo, acumulado);
      neto += movimiento.monto_centavos;
    }

    const esperado = corte.fondo + neto - corte.retirado;

    return {
      corteId: corte.id,
      folio: `${corte.serie}-${corte.folio.toString()}`,
      sesionCajaId: corte.sesion_caja_id,
      terminalId: corte.terminal_id,
      empleadoId: corte.empleado_id,
      rangoInicio: corte.rango_inicio.toISOString(),
      cortadoEn: corte.cortado_en.toISOString(),
      fondoInicialCentavos: corte.fondo.toString(),
      efectivoContadoCentavos: corte.contado.toString(),
      efectivoRetiradoCentavos: corte.retirado.toString(),
      efectivoEsperadoCentavos: esperado.toString(),
      diferenciaCentavos: (corte.contado - esperado).toString(),
      renglones: [...porTipo.entries()].map(([tipo, datos]) => ({
        tipo,
        movimientos: datos.cuantos,
        montoCentavos: datos.monto.toString(),
        sinMotivo: datos.sinMotivo,
      })),
      movimientos: movimientos.map((m) => ({
        movimientoId: m.id,
        tipo: m.tipo,
        montoCentavos: m.monto_centavos.toString(),
        motivo: m.motivo,
        empleadoId: m.empleado_id,
        registradoEn: m.created_at.toISOString(),
      })),
      notas: corte.notas,
    };
  },
});
