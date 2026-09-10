import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { entradaAbrirCaja, entradaCerrarCaja, entradaMovimientoCaja } from '../venta/esquemas.ts';

/**
 * Sesión de caja (F1.1-A-08).
 *
 * Corrige P2-10 por construcción: **no se guarda ningún total**. El esperado se
 * deriva de `movimientos_caja` y `pagos` en el momento del corte. En la fuente
 * había columnas `total_ventas` y `total_efectivo` que nadie actualizaba al
 * cobrar, y el corte mostraba ceros con la caja llena.
 *
 * CASH-01/CASH-02 no las resuelve este código sino el índice
 * `sesiones_caja_una_abierta_por_terminal`: la segunda apertura concurrente
 * choca contra la base, no contra un `if`. Aquí sólo se traduce esa violación a
 * un mensaje legible.
 */

const ROLES_DE_CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
export const abrirCaja = definirComando<
  Transaccion,
  typeof entradaAbrirCaja,
  { sesionCajaId: string }
>({
  nombre: 'caja.abrir',
  entidad: 'sesion_caja',
  escribe: true,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAbrirCaja,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Abre la caja desde una terminal dada de alta.');
    }

    const abierta = await ctx.paso('buscar_sesion', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (abierta !== null) {
      throw new ErrorDominio('CAJA_YA_ABIERTA', 'Esta terminal ya tiene una caja abierta.', {
        sesionCajaId: abierta.id,
      });
    }

    const fondo = BigInt(entrada.fondoInicialCentavos);
    const sesionCajaId = await ctx.paso('abrir_sesion', () =>
      repoCaja.abrirSesion(ctx.tx, {
        organizacionId,
        sucursalId,
        terminalId,
        empleadoAbreId: empleoId,
        fondoInicialCentavos: fondo,
      }),
    );

    // El fondo entra como movimiento de apertura: así el saldo esperado es una
    // SUMA de movimientos y no «fondo más la suma», que es la clase de fórmula
    // con ramas que alguien escribe mal en un reporte.
    await repoCaja.registrarMovimiento(ctx.tx, {
      organizacionId,
      sesionCajaId,
      tipo: 'apertura',
      montoCentavos: fondo,
      referenciaTipo: 'manual',
      referenciaId: null,
      empleadoId: empleoId,
      motivo: 'Fondo inicial',
    });

    ctx.auditar({ entidadId: sesionCajaId, payload: { fondoCentavos: fondo.toString() } });
    return { sesionCajaId };
  },
});

export const registrarMovimientoCaja = definirComando<
  Transaccion,
  typeof entradaMovimientoCaja,
  { registrado: true }
>({
  nombre: 'caja.movimiento',
  entidad: 'sesion_caja',
  escribe: true,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaMovimientoCaja,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;
    if (terminalId === null) {
      throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Registra el movimiento desde la terminal.');
    }

    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) throw new ErrorDominio('CAJA_CERRADA', 'No hay una caja abierta.');

    // El signo lo pone el servidor a partir del tipo, no el cliente. Un gasto
    // con monto positivo sumaría al arqueo en vez de restar, y el `check`
    // movimiento_signo_coherente lo rechazaría con un error ilegible.
    const magnitud = BigInt(Math.abs(entrada.montoCentavos));
    const salida = entrada.tipo === 'gasto' || entrada.tipo === 'retiro';
    const monto = salida ? -magnitud : magnitud;

    await ctx.paso('registrar_movimiento', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        tipo: entrada.tipo,
        montoCentavos: monto,
        referenciaTipo: 'manual',
        referenciaId: null,
        empleadoId: empleoId,
        motivo: entrada.motivo,
      }),
    );

    ctx.auditar({
      entidadId: sesion.id,
      payload: { tipo: entrada.tipo, montoCentavos: monto.toString(), motivo: entrada.motivo },
    });
    return { registrado: true as const };
  },
});

export interface ResultadoCorte {
  readonly sesionCajaId: string;
  /** Serie y folio del corte. Su pantalla los enseña en «Folio del corte». */
  readonly serie: string;
  readonly folio: string;
  readonly fondoInicialCentavos: string;
  readonly efectivoEsperadoCentavos: string;
  readonly efectivoContadoCentavos: string;
  /** Positiva = sobra dinero; negativa = falta. */
  readonly diferenciaCentavos: string;
  readonly ventasCentavos: string;
  readonly numeroVentas: number;
}

export const cerrarCaja = definirComando<Transaccion, typeof entradaCerrarCaja, ResultadoCorte>({
  nombre: 'caja.cerrar',
  entidad: 'sesion_caja',
  escribe: true,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCerrarCaja,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;
    if (terminalId === null) {
      throw new ErrorDominio('VENTA_SIN_TERMINAL', 'Cierra la caja desde la terminal.');
    }

    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) throw new ErrorDominio('CAJA_CERRADA', 'No hay una caja abierta.');

    // El arqueo se deriva DENTRO de la transacción del cierre: si se leyera
    // antes, una venta cobrada en ese hueco quedaría fuera del corte.
    const arqueo = await ctx.paso('derivar_arqueo', () =>
      repoCaja.arqueoDeSesion(ctx.tx, organizacionId, sesion.id),
    );

    const contado = BigInt(entrada.efectivoContadoCentavos);
    const diferencia = contado - arqueo.efectivoEsperadoCentavos;

    const cierre = await ctx.paso('cerrar_sesion', () =>
      repoCaja.cerrarSesion(ctx.tx, {
        organizacionId,
        sucursalId: sesion.sucursalId,
        sesionCajaId: sesion.id,
        serie: sesion.serie,
        empleadoCierraId: empleoId,
        efectivoContadoCentavos: contado,
        notasCierre: entrada.notas ?? null,
        ahora: ctx.ahora,
      }),
    );
    // Cero filas: alguien la cerró entre la lectura y el update. No se
    // sobrescribe el arqueo original.
    if (cierre.filas !== 1) {
      throw new ErrorDominio('CAJA_CERRADA', 'Esa caja ya se había cerrado.');
    }

    ctx.auditar({
      entidadId: sesion.id,
      payload: {
        esperadoCentavos: arqueo.efectivoEsperadoCentavos.toString(),
        contadoCentavos: contado.toString(),
        diferenciaCentavos: diferencia.toString(),
        numeroVentas: arqueo.numeroVentas,
      },
    });

    return {
      sesionCajaId: sesion.id,
      // El folio del corte, que es lo que su pantalla enseña al cerrar.
      serie: cierre.serie,
      folio: cierre.folio.toString(),
      fondoInicialCentavos: arqueo.fondoInicialCentavos.toString(),
      efectivoEsperadoCentavos: arqueo.efectivoEsperadoCentavos.toString(),
      efectivoContadoCentavos: contado.toString(),
      diferenciaCentavos: diferencia.toString(),
      ventasCentavos: arqueo.ventasCentavos.toString(),
      numeroVentas: arqueo.numeroVentas,
    };
  },
});
