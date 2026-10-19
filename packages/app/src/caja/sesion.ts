import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja, repoOrdenes } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { violaIndice } from '../portal/errores-sql.ts';
import { entradaAbrirCaja, entradaCerrarCaja, entradaMovimientoCaja } from '../venta/esquemas.ts';

/**
 * Sesión de caja (F1.1-A-08).
 *
 * Corrige P2-10 por construcción: **no se guarda ningún total**. El esperado se
 * deriva de `movimientos_caja` y `pagos` en el momento del corte. En la fuente
 * había columnas `total_ventas` y `total_efectivo` que nadie actualizaba al
 * cobrar, y el corte mostraba ceros con la caja llena.
 *
 * CASH-01/CASH-02 no las resuelve este código sino la base —el índice
 * `sesiones_caja_una_abierta_por_terminal` y el disparador del cupo de la 179—: la
 * segunda apertura concurrente choca contra la base, no contra un `if`. Aquí sólo se
 * traduce esa violación a un mensaje legible (`traducirAperturaQuePerdio`).
 */

const ROLES_DE_CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/**
 * LA APERTURA QUE PERDIÓ LA CARRERA, con palabras (D.9 de la 2.4).
 *
 * Las comprobaciones de arriba leen sin bloquear: dos terminales que abren en el mismo
 * segundo las pasan las dos, y quien separa a la segunda es la base —el índice
 * `sesiones_caja_una_abierta_por_terminal` o el disparador del cupo de la 179, que rechaza
 * con el nombre de `sesiones_caja_una_abierta_por_sucursal`—. Ese 23505 llegaba a la cajera
 * como «Algo falló de nuestro lado», que invita a reintentar a ciegas; la prueba de
 * integración de la carrera lo enseñó. Aquí se dice lo que pasó.
 *
 * Sólo esos dos nombres: cualquier otro fallo de la base sube tal cual, y la transacción ya
 * está abortada, así que se relanza sin tocar nada más (`portal/errores-sql.ts`).
 */
function traducirAperturaQuePerdio(error: unknown, cupo: number): never {
  if (violaIndice(error, 'sesiones_caja_una_abierta_por_sucursal')) {
    throw new ErrorDominio(
      'CAJA_YA_ABIERTA',
      cupo === 1
        ? 'Otra terminal de esta sucursal acaba de abrir su caja, y sólo puede haber una a la vez: haz el corte desde ESA terminal antes de abrir aquí.'
        : `Otra terminal acaba de abrir la última de las ${String(cupo)} cajas de esta sucursal. Cierra una antes de abrir otra.`,
      { cupo },
    );
  }
  if (violaIndice(error, 'sesiones_caja_una_abierta_por_terminal')) {
    throw new ErrorDominio(
      'CAJA_YA_ABIERTA',
      'Esta terminal acaba de abrir su caja desde otra pestaña: usa esa.',
    );
  }
  throw error;
}

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

    /**
     * Y el CUPO de la sucursal, que la base también hace cumplir (F-235, 179).
     *
     * Hasta la 179 era un índice único: una caja abierta por sucursal, siempre, y sin
     * esta comprobación su violación salía como «Algo falló de nuestro lado» en vez de
     * «hay una abierta en la terminal de al lado». Ahora el cupo es de la sucursal —uno
     * por omisión, dos en la cafetería de fin de semana— y el mensaje nombra la terminal
     * que la tiene, porque el camino de salida NO es obvio: cerrar la ajena exige ser su
     * terminal.
     */
    const { cupo, abiertas } = await ctx.paso('leer_cupo_de_cajas', () =>
      repoCaja.cupoDeCajas(ctx.tx, organizacionId, sucursalId),
    );
    if (abiertas.length >= cupo) {
      const ajena = abiertas[0];
      throw new ErrorDominio(
        'CAJA_YA_ABIERTA',
        cupo === 1
          ? `Esta sucursal ya tiene una caja abierta, en la terminal «${ajena?.terminalNombre ?? 'sin nombre'}». ` +
              'Sólo puede haber una a la vez: haz el corte desde ESA terminal antes de abrir aquí.'
          : `Esta sucursal ya tiene sus ${String(cupo)} cajas abiertas. Cierra una antes de abrir otra.`,
        { sesionCajaId: ajena?.id ?? null, terminalId: ajena?.terminalId ?? null, cupo },
      );
    }

    const fondo = BigInt(entrada.fondoInicialCentavos);
    // Lo que el cierre anterior de ESTA terminal dijo que dejaba (C.6 de la 2.4). Contra
    // eso se mide la diferencia de apertura: el faltante que ya venía de anoche no es el
    // de hoy. Sin cierre anterior, o sin que dijera cuánto dejaba, no hay con qué
    // compararlo y se espera lo que se contó.
    const dejadoAnoche = await ctx.paso('leer_lo_que_se_dejo', () =>
      repoCaja.fondoDejadoPorElUltimoCierre(ctx.tx, organizacionId, terminalId),
    );
    const sesionCajaId = await ctx.paso('abrir_sesion', async () => {
      try {
        return await repoCaja.abrirSesion(ctx.tx, {
          organizacionId,
          sucursalId,
          terminalId,
          empleadoAbreId: empleoId,
          fondoInicialCentavos: fondo,
          fondoEsperadoCentavos: dejadoAnoche ?? fondo,
          // El desglose por montones, que es lo que dice si se puede dar cambio.
          // El esquema ya garantizó que la suma es el total.
          fondoMonedasCentavos: BigInt(entrada.fondoMonedasCentavos),
          fondoChicosCentavos: BigInt(entrada.fondoChicosCentavos),
          fondoGrandesCentavos: BigInt(entrada.fondoGrandesCentavos),
        });
      } catch (error) {
        return traducirAperturaQuePerdio(error, cupo);
      }
    });

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
    //
    // Y el AJUSTE conserva su signo: el esquema lo acepta negativo («un ajuste a la baja lo
    // es») y aquí se le quitaba con `Math.abs`, así que todo ajuste sumaba al cajón
    // (auditoría de la 2.4). Los demás tipos los normaliza el repositorio.
    const magnitud = BigInt(Math.abs(entrada.montoCentavos));
    const salida = entrada.tipo === 'gasto' || entrada.tipo === 'retiro';
    const monto =
      entrada.tipo === 'ajuste' ? BigInt(entrada.montoCentavos) : salida ? -magnitud : magnitud;

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
  /** Lo que se quedó en el cajón, si se dijo. Es el fondo esperado de la próxima apertura. */
  readonly fondoDejadoCentavos?: string;
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
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId, true),
    );
    if (sesion === null) throw new ErrorDominio('CAJA_CERRADA', 'No hay una caja abierta.');

    // F-224 · «No se puede cerrar con ventas en espera» (`abarrotes/02-DINERO-Y-CAJA §8.5`):
    // el ticket apartado del cliente que no volvió se cobra o se cancela con motivo. Cerrar
    // con él dentro dejaba una venta viva colgada de una caja que ya no existe.
    const apartadas = await ctx.paso('contar_apartadas', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('terminal_id', '=', terminalId)
        .where('estado', '=', 'suspendida')
        .execute(),
    );
    if (apartadas.length > 0) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Hay ${String(apartadas.length)} venta(s) apartada(s) en esta caja: cóbralas o cancélalas con su motivo antes de cerrar.`,
        { apartadas: apartadas.length },
      );
    }

    // F-262 · «No se cierra el turno con pedidos en la fila» lo guarda un disparador
    // (`086_turno_bote_y_cambio.sql`), y su `check_violation` llegaba a la cajera como
    // «Error interno»: la regla se cumplía y nadie sabía qué hacer. Se cuenta igual que el
    // disparador —la sucursal entera, porque la barra es una— para decirlo con palabras; el
    // disparador se queda como segundo cerrojo.
    const enLaFila = await ctx.paso('contar_pedidos_sin_entregar', () =>
      ctx.tx
        .selectFrom('comandas')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('sucursal_id', '=', sesion.sucursalId)
        .where('cobrado_en', 'is not', null)
        .where('estado', 'in', ['nuevo', 'en_preparacion', 'listo'])
        .execute(),
    );
    if (enLaFila.length > 0) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Hay ${String(enLaFila.length)} pedido(s) cobrado(s) sin entregar: entrégalos, márcalos como no recogidos o devuélvelos antes de cerrar.`,
        { pedidosSinEntregar: enLaFila.length },
      );
    }

    // `ferreteria/02-DINERO-Y-CAJA §8.5.1` · «No se puede cerrar con notas de mostrador
    // sin resolver»: una nota mandada a caja es material comprometido que nadie cobró, y
    // cerrar con ella dejaba al patio esperando a un cliente sin que el corte lo dijera.
    // O se cobra, o se cancela con su motivo (`nota_mostrador.cancelar`). Se cuentan las
    // de la SUCURSAL: la nota no tiene caja hasta que se cobra, y la caja que cierra es la
    // que la cobraría. Dos lecturas y no un `join`: la nota dice si se mandó a caja; su
    // orden, si sigue sin cobrarse —una firmada a crédito ya es venta (181)—.
    const mandadas = await ctx.paso('contar_notas_por_cobrar', () =>
      ctx.tx
        .selectFrom('notas_mostrador')
        .select(['orden_id', 'folio'])
        .where('organizacion_id', '=', organizacionId)
        .where('sucursal_id', '=', sesion.sucursalId)
        .where('estado', '=', 'por_cobrar')
        .execute(),
    );
    const sinCobrar =
      mandadas.length === 0
        ? []
        : await ctx.paso('notas_sin_cobrar', () =>
            ctx.tx
              .selectFrom('ordenes')
              .select('id')
              .where('organizacion_id', '=', organizacionId)
              .where(
                'id',
                'in',
                mandadas.map((n) => n.orden_id),
              )
              .where('estado', 'in', [...repoOrdenes.ESTADOS_COBRABLES])
              .execute(),
          );
    if (sinCobrar.length > 0) {
      const pendientes = new Set(sinCobrar.map((o) => o.id));
      const folios = mandadas.filter((n) => pendientes.has(n.orden_id)).map((n) => n.folio);
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Hay ${String(folios.length)} nota(s) mandada(s) a caja sin cobrar (${folios.join(', ')}): cóbralas o cancélalas con su motivo antes de cerrar.`,
        { notasPorCobrar: folios.length },
      );
    }

    // El arqueo se deriva DENTRO de la transacción del cierre: si se leyera
    // antes, una venta cobrada en ese hueco quedaría fuera del corte.
    const arqueo = await ctx.paso('derivar_arqueo', () =>
      repoCaja.arqueoDeSesion(ctx.tx, organizacionId, sesion.id),
    );

    const contado = BigInt(entrada.efectivoContadoCentavos);
    const diferencia = contado - arqueo.efectivoEsperadoCentavos;
    const retirado = retiradoDelCierre(contado, entrada.fondoDejadoCentavos);
    exigirQueElConteoSume(contado, entrada.denominaciones, entrada.sueltosCentavos ?? 0);

    const cierre = await ctx.paso('cerrar_sesion', () =>
      repoCaja.cerrarSesion(ctx.tx, {
        organizacionId,
        sucursalId: sesion.sucursalId,
        sesionCajaId: sesion.id,
        serie: sesion.serie,
        empleadoCierraId: empleoId,
        efectivoContadoCentavos: contado,
        // Lo que se comparó, guardado con su diferencia en las columnas que la migración
        // 100 creó para eso y nadie escribía: el historial enseña la diferencia de cada
        // corte sin re-derivarla (C.4 de la 2.4).
        efectivoEsperadoCentavos: arqueo.efectivoEsperadoCentavos,
        // El bote sólo viaja cuando la pantalla lo contó. Sin él la columna se
        // queda en NULL, que es «no se contó», y `repartir_bote` lo distingue de
        // un cero: repartir cero cuando nadie contó sería firmar que esa noche
        // no hubo propina.
        ...(entrada.boteContadoCentavos === undefined
          ? {}
          : { boteContadoCentavos: BigInt(entrada.boteContadoCentavos) }),
        ...(retirado === null ? {} : { efectivoRetiradoCentavos: retirado }),
        notasCierre: entrada.notas ?? null,
        ahora: ctx.ahora,
      }),
    );
    // Cero filas: alguien la cerró entre la lectura y el update. No se
    // sobrescribe el arqueo original.
    if (cierre.filas !== 1) {
      throw new ErrorDominio('CAJA_CERRADA', 'Esa caja ya se había cerrado.');
    }

    if (entrada.denominaciones !== undefined && entrada.denominaciones.length > 0) {
      const conteo = entrada.denominaciones;
      await ctx.paso('anotar_conteo', () =>
        repoCaja.anotarConteoDeCierre(ctx.tx, {
          organizacionId,
          sesionCajaId: sesion.id,
          empleadoId: empleoId,
          conteo: conteo.map((d) => ({
            denominacionCentavos: BigInt(d.denominacionCentavos),
            piezas: d.piezas,
          })),
          ahora: ctx.ahora,
        }),
      );
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
      ...(retirado === null ? {} : { fondoDejadoCentavos: (contado - retirado).toString() }),
    };
  },
});

/**
 * Lo que se RETIRA del cajón al cerrar: todo lo contado menos lo que se queda de fondo.
 * `null` si no se dijo cuánto se deja —la columna queda en NULL, «no se dijo»—.
 */
export function retiradoDelCierre(contado: bigint, fondoDejado: number | undefined): bigint | null {
  if (fondoDejado === undefined) return null;
  const dejado = BigInt(fondoDejado);
  if (dejado > contado) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      'No puedes dejar en el cajón más de lo que contaste.',
      { contadoCentavos: contado.toString(), dejadoCentavos: dejado.toString() },
    );
  }
  return contado - dejado;
}

/**
 * El conteo por denominación, si viaja, más lo suelto tiene que sumar lo contado (F-231).
 */
export function exigirQueElConteoSume(
  contado: bigint,
  conteo: readonly { readonly denominacionCentavos: number; readonly piezas: number }[] | undefined,
  sueltosCentavos = 0,
): void {
  if (conteo === undefined || conteo.length === 0) return;
  const vistas = new Set<number>();
  let suma = BigInt(sueltosCentavos);
  for (const { denominacionCentavos, piezas } of conteo) {
    if (vistas.has(denominacionCentavos)) {
      throw new ErrorDominio(
        'CANTIDAD_INVALIDA',
        'Cada denominación va una sola vez en el conteo.',
        { denominacionCentavos },
      );
    }
    vistas.add(denominacionCentavos);
    suma += BigInt(denominacionCentavos) * BigInt(piezas);
  }
  if (suma !== contado) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      'El conteo por billetes y monedas no suma el efectivo contado.',
      { contadoCentavos: contado.toString(), sumaDelConteoCentavos: suma.toString() },
    );
  }
}
