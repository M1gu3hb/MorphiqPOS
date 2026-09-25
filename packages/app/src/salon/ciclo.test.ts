import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { Rechazo } from '../fallos.ts';
import { ambitoDe, ORG, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { cancelarCita, cerrarServicio, iniciarCita, marcarNoLlego } from './ciclo.ts';
import { cobrarCita, cotizarCita } from './cobro.ts';

/**
 * F-412, F-407, F-434 y el cobro · Lo que le pasa a una cita después de
 * agendarse.
 *
 * Entre el 15 % y el 20 % de las citas no llegan: en un salón de $180,000 al
 * mes son unos $32,000 mensuales de capacidad perdida, y la capacidad de un
 * salón no se recupera — el martes a las once ya pasó.
 */

const CITA = 'a1111111-1111-4111-8111-111111111111';
const SERVICIO_CITA = 'b1111111-1111-4111-8111-111111111111';
const TINTE = 's1111111-1111-4111-8111-111111111111';
const KARLA = 'z1111111-1111-4111-8111-111111111111';
const SOL = 'z2222222-2222-4222-8222-222222222222';
const REGLA = 'g1111111-1111-4111-8111-111111111111';
const ALMACEN_CABINA = 'm1111111-1111-4111-8111-111111111111';
const PRODUCTO_TINTE = 'p1111111-1111-4111-8111-111111111111';
const INSUMO_TINTE = 'i1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T11:00:00.000Z');
const SESION_CAJA = 'c1111111-1111-4111-8111-111111111111';

function salon(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    citas: [
      {
        id: CITA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        folio: 'CITA-42',
        estado: 'agendada',
        cliente_id: null,
        es_rehacer: false,
        orden_id: null,
      },
    ],
    cita_servicios: [
      {
        id: SERVICIO_CITA,
        organizacion_id: ORG,
        cita_id: CITA,
        servicio_id: TINTE,
        profesional_id: KARLA,
        precio_centavos: 100_000n,
        estado: 'pendiente',
        cerrado_en: null,
        orden_linea_id: null,
      },
    ],
    profesionales: [
      {
        id: KARLA,
        organizacion_id: ORG,
        nombre_corto: 'Karla',
        activo: true,
        tipo_relacion: 'empleado_comision',
        regla_comision_id: REGLA,
      },
      {
        id: SOL,
        organizacion_id: ORG,
        nombre_corto: 'Sol',
        activo: true,
        tipo_relacion: 'independiente_renta',
        regla_comision_id: null,
      },
    ],
    servicios: [{ producto_id: TINTE, organizacion_id: ORG, regla_comision_id: null }],
    reglas_comision: [
      {
        id: REGLA,
        organizacion_id: ORG,
        nombre: 'Estilista 50',
        version: 3,
        esquema: 'porcentaje_fijo',
        tasa_servicio_bp: 5_000,
        tasa_producto_bp: 1_000,
        base: 'cobrado',
        sobre_iva: false,
        material: 'salon',
        reparto: 'por_servicio',
        rehacer_paga: false,
        escalones: null,
      },
    ],
    productos: [
      { id: TINTE, organizacion_id: ORG, nombre: 'Tinte completo' },
      { id: PRODUCTO_TINTE, organizacion_id: ORG, nombre: 'Tinte 7.1' },
    ],
    insumos: [
      {
        id: INSUMO_TINTE,
        organizacion_id: ORG,
        producto_id: PRODUCTO_TINTE,
        unidad_base: 'g',
        activo: true,
      },
    ],
    existencias: [
      {
        organizacion_id: ORG,
        almacen_id: ALMACEN_CABINA,
        insumo_id: INSUMO_TINTE,
        cantidad: '500',
      },
    ],
    comisiones_causadas: [],
    movimientos_stock: [],
    ordenes: [],
    orden_lineas: [],
    /**
     * LA CAJA ABIERTA DE ESTA TERMINAL.
     *
     * Cobrar una cita ya no sólo escribe la orden: registra el pago y mueve el
     * cajón, como `venta.cobrar`. Sin sesión abierta contesta «Abre la caja antes
     * de cobrar», y eso es lo correcto — el efectivo de una cita tiene que caber
     * en el arqueo del día igual que el de una venta de mostrador.
     */
    sesiones_caja: [
      {
        id: SESION_CAJA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        terminal_id: TERMINAL,
        estado: 'abierta',
        serie: 'CC',
        folio: null,
        abierta_en: AHORA,
        cerrada_en: null,
        fondo_inicial_centavos: 150_000n,
        efectivo_contado_centavos: null,
      },
    ],
    pagos: [],
    movimientos_caja: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}, crudas?: readonly Record<string, unknown>[]) =>
  crearBaseFalsa(salon(extra), {
    filasCrudas: crudas ?? [{ siguiente: 7n, cantidad: '480' }],
    predeterminados: {
      comisiones_causadas: {
        orden_linea_id: null,
        cita_servicio_id: null,
        contrapartida_de_id: null,
        motivo: null,
        liquidacion_id: null,
        material_descontado_centavos: 0n,
      },
      movimientos_stock: {
        costo_unitario_centavos: 0n,
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
        idempotency_key: null,
        sesion_caja_id: null,
      },
      ordenes: { cliente_id: null, cerrada_en: null },
      orden_lineas: { profesional_id: null, cita_servicio_id: null },
    },
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('agenda.marcar_no_llego', () => {
  it('QUEDA FIRMADO: hora y autor, en la misma escritura', async () => {
    // Un no-show sin autor es una acusación sin firma, y de eso depende si se
    // le retiene el dinero a alguien.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await marcarNoLlego.ejecutar(ctx, { citaId: CITA, retieneAnticipo: true });

    expect(base.campo('citas', 'estado')).toBe('no_llego');
    expect(base.campo('citas', 'no_llego_marcado_en')).toEqual(AHORA);
    expect(base.campo('citas', 'no_llego_marcado_por')).not.toBeNull();
  });

  it('EL HUECO SE LIBERA, que es lo que vale dinero', async () => {
    // Sin esto, la agenda sigue mostrando ocupado un hueco que se puede vender
    // ahora mismo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await marcarNoLlego.ejecutar(ctx, { citaId: CITA, retieneAnticipo: true });

    expect(base.campo('cita_servicios', 'estado')).toBe('cancelado');
  });

  it('LA QUE SÍ LLEGÓ no se marca como que no llegó', async () => {
    // Le metería un antecedente falso y, con anticipo, se lo retendría dos veces.
    const base = baseDe({
      citas: [{ id: CITA, organizacion_id: ORG, folio: 'CITA-42', estado: 'terminada' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() => marcarNoLlego.ejecutar(ctx, { citaId: CITA, retieneAnticipo: true })),
    ).toBe('CONFIGURACION_CONFLICTO');
  });
});

describe('agenda.cancelar_cita', () => {
  it('CON SU MOTIVO, en la misma escritura', async () => {
    // El motivo es lo único que distingue «la clienta se enfermó» de «no había
    // quien la atendiera».
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cancelarCita.ejecutar(ctx, { citaId: CITA, motivo: 'La clienta se enfermó' });

    expect(base.campo('citas', 'estado')).toBe('cancelada');
    expect(base.campo('citas', 'motivo_cancelacion')).toBe('La clienta se enfermó');
    expect(base.campo('cita_servicios', 'estado')).toBe('cancelado');
  });

  it('UNA CITA COBRADA no se cancela: se cancela la venta', async () => {
    const base = baseDe({
      citas: [{ id: CITA, organizacion_id: ORG, folio: 'CITA-42', estado: 'cobrada' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cancelarCita.ejecutar(ctx, { citaId: CITA, motivo: 'X' }))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
  });
});

describe('agenda.iniciar_cita', () => {
  it('sella el inicio real, que es lo que corrige las duraciones del catálogo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await iniciarCita.ejecutar(ctx, { citaId: CITA });

    expect(base.campo('citas', 'estado')).toBe('en_curso');
    expect(base.campo('citas', 'inicio_real')).toEqual(AHORA);
  });
});

describe('agenda.cerrar_servicio', () => {
  it('EL PRODUCTO SALE AL CERRAR, no al cobrar', async () => {
    // El tinte se mezcló cuando se mezcló. Descontarlo al cobrar haría que el
    // inventario de cabina fuera media hora atrás de la realidad.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await cerrarServicio.ejecutar(ctx, {
      citaServicioId: SERVICIO_CITA,
      almacenId: ALMACEN_CABINA,
      consumos: [{ productoId: PRODUCTO_TINTE, cantidadBase: '60' }],
      formula: { base: '7.1', oxidante: '20 vol' },
    });

    expect(base.campo('movimientos_stock', 'tipo')).toBe('consumo_servicio');
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-60');
    expect(base.campo('cita_servicios', 'estado')).toBe('cerrado');
    expect(base.campo('cita_servicios', 'cerrado_en')).toEqual(AHORA);
  });

  it('ES IDEMPOTENTE POR SERVICIO: el teléfono pierde red y reintenta', async () => {
    // Cerrar dos veces descontaría el tinte dos veces.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    await cerrarServicio.ejecutar(uno.ctx, {
      citaServicioId: SERVICIO_CITA,
      almacenId: ALMACEN_CABINA,
      consumos: [{ productoId: PRODUCTO_TINTE, cantidadBase: '60' }],
      formula: {},
    });

    const dos = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    const salida = await cerrarServicio.ejecutar(dos.ctx, {
      citaServicioId: SERVICIO_CITA,
      almacenId: ALMACEN_CABINA,
      consumos: [{ productoId: PRODUCTO_TINTE, cantidadBase: '60' }],
      formula: {},
    });

    expect(salida.consumos).toBe(0);
    expect(base.filas('movimientos_stock')).toHaveLength(1);
  });

  it('SIN PRODUCTO DE CABINA FALLA, en vez de dejarla en negativo', async () => {
    // Una cabina en negativo es un inventario que deja de servir para pedir, y
    // el salón se entera cuando no hay tinte.
    const base = baseDe({}, []);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() =>
        cerrarServicio.ejecutar(ctx, {
          citaServicioId: SERVICIO_CITA,
          almacenId: ALMACEN_CABINA,
          consumos: [{ productoId: PRODUCTO_TINTE, cantidadBase: '600' }],
          formula: {},
        }),
      ),
    ).toBe('STOCK_INSUFICIENTE');
    expect(base.campo('cita_servicios', 'estado')).toBe('pendiente');
  });

  it('un servicio sin consumos se cierra igual', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await cerrarServicio.ejecutar(ctx, {
      citaServicioId: SERVICIO_CITA,
      almacenId: ALMACEN_CABINA,
      consumos: [],
      formula: {},
    });

    expect(salida.consumos).toBe(0);
    expect(base.campo('cita_servicios', 'estado')).toBe('cerrado');
  });
});

describe('venta.cobrar_cita', () => {
  const pagoCompleto = {
    citaId: CITA,
    pagos: [{ metodo: 'efectivo' as const, montoCentavos: 100_000 }],
  };

  it('LA ORDEN, LA LÍNEA Y LA COMISIÓN, en la misma transacción', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(base.campo('ordenes', 'total_centavos')).toBe(100_000n);
    expect(base.campo('orden_lineas', 'profesional_id')).toBe(KARLA);
    // El 50 % de los $862.07 SIN IVA, no de los $1,000 al público: la regla dice
    // `sobre_iva = false` y el documento del giro lo pide así (§7.2, pregunta 2).
    // Aquí decía 50 000: se comisionaba el IVA, $68.97 de más por servicio.
    expect(base.campo('comisiones_causadas', 'monto_centavos')).toBe(43_103n);
    expect(salida.comisiones).toHaveLength(1);
  });

  it('LA ORDEN QUEDA EN LA CAJA QUE LA COBRÓ: sin eso el corte no la cuenta', async () => {
    // El corte lee sus ventas por `ordenes.sesion_caja_id` (tickets, por método, el
    // detalle uno por uno). La orden del salón nacía pagada SIN sesión: el pago y el
    // movimiento sí entraban al cajón, pero el corte decía «cero ventas» — lo vio el
    // e2e de C.10 al pedir los cobros del día.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(base.campo('ordenes', 'sesion_caja_id')).toBe(SESION_CAJA);
    expect(base.campo('ordenes', 'terminal_id')).toBe(TERMINAL);
  });

  it('LA COMISIÓN GUARDA CON QUÉ VERSIÓN se calculó', async () => {
    // Lo ya causado no se recalcula jamás: sin la versión, una regla que cambió
    // deja el histórico sin forma de explicarse.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(base.campo('comisiones_causadas', 'regla_version')).toBe(3);
    expect(base.campo('comisiones_causadas', 'regla_id')).toBe(REGLA);
  });

  it('EL ESTADO Y LA ORDEN van juntos en la cita', async () => {
    // Una cita cobrada sin orden es una venta sin ticket, y la 132 lo rechaza.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(base.campo('citas', 'estado')).toBe('cobrada');
    expect(base.campo('citas', 'orden_id')).toBe(salida.ordenId);
  });

  it('EL TOTAL SALE DE LOS PRECIOS CONGELADOS, no de la entrada', async () => {
    // Si el salón sube el tinte entre agendar y cobrar, la clienta paga lo que
    // se le dijo. Y el mostrador no decide el precio.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        cobrarCita.ejecutar(ctx, {
          citaId: CITA,
          pagos: [{ metodo: 'efectivo', montoCentavos: 50_000 }],
        }),
      ),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('QUIEN RENTA LA ESTACIÓN no lleva comisión', async () => {
    // El trato es el mueble, no el porcentaje. Pagarle comisión además de
    // cobrarle renta no es el trato de nadie.
    const base = baseDe({
      cita_servicios: [
        {
          id: SERVICIO_CITA,
          organizacion_id: ORG,
          cita_id: CITA,
          servicio_id: TINTE,
          profesional_id: SOL,
          precio_centavos: 100_000n,
          estado: 'pendiente',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(salida.comisiones).toEqual([]);
    expect(base.filas('comisiones_causadas')).toEqual([]);
    // Pero la venta SÍ se registra: el salón cobró el servicio.
    expect(base.filas('ordenes')).toHaveLength(1);
  });

  it('NI AUNQUE EL SERVICIO TRAIGA SU PROPIA REGLA', async () => {
    // La regla del SERVICIO manda sobre la del profesional, y un tratamiento
    // caro puede traerla. Sin la salida temprana por tipo de relación, quien
    // renta la estación cobraría comisión además de pagar el mueble.
    const base = baseDe({
      servicios: [{ producto_id: TINTE, organizacion_id: ORG, regla_comision_id: REGLA }],
      cita_servicios: [
        {
          id: SERVICIO_CITA,
          organizacion_id: ORG,
          cita_id: CITA,
          servicio_id: TINTE,
          profesional_id: SOL,
          precio_centavos: 100_000n,
          estado: 'pendiente',
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(salida.comisiones).toEqual([]);
    expect(base.filas('comisiones_causadas')).toEqual([]);
  });

  it('UN NO-SHOW NO SE COBRA', async () => {
    // Sin esta guarda, un tecleo convierte un no-show en una venta con su
    // comisión, y el reporte del día miente hacia arriba.
    const base = baseDe({
      citas: [{ id: CITA, organizacion_id: ORG, folio: 'CITA-42', estado: 'no_llego' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cobrarCita.ejecutar(ctx, pagoCompleto))).toBe('ORDEN_NO_EDITABLE');
    expect(base.filas('ordenes')).toEqual([]);
  });

  it('COBRAR DOS VECES, no', async () => {
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await cobrarCita.ejecutar(uno.ctx, pagoCompleto);

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(await codigoDe(() => cobrarCita.ejecutar(dos.ctx, pagoCompleto))).toBe(
      'ORDEN_NO_EDITABLE',
    );
    expect(base.filas('comisiones_causadas')).toHaveLength(1);
  });

  it('LA LÍNEA SE LIGA A SU SERVICIO de la cita', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, pagoCompleto);

    expect(base.campo('orden_lineas', 'cita_servicio_id')).toBe(SERVICIO_CITA);
    expect(base.campo('cita_servicios', 'orden_linea_id')).toBe(base.campo('orden_lineas', 'id'));
  });

  it('una cita sin servicios vivos no se cobra', async () => {
    const base = baseDe({ cita_servicios: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cobrarCita.ejecutar(ctx, pagoCompleto))).toBe('ORDEN_VACIA');
  });

  it('una regla que no existe no deja cobrar en silencio', async () => {
    // Nadie puede cobrar contra una regla que no está: callarlo dejaría a la
    // estilista sin comisión y sin aviso.
    const base = baseDe({ reglas_comision: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cobrarCita.ejecutar(ctx, pagoCompleto))).toBe(
      'CONFIGURACION_INVALIDA',
    );
  });
});

/**
 * C.3 de la etapa 2.4 · Lo que el cobro de la estética capturaba y NO guardaba.
 *
 * `Cobrar.tsx` pedía la propina y la tiraba, se negaba a cobrar una cita con
 * anticipo, no sabía de descuento ni de pago mixto y enseñaba el IVA con una tasa
 * fija. Cada prueba de aquí es una frase de `02-DINERO-Y-CAJA` del salón, y se vio
 * FALLAR contra el comando de antes.
 */
describe('venta.cobrar_cita · anticipo, descuento, IVA, propina y mixto', () => {
  const ANTICIPO = 'e1111111-1111-4111-8111-111111111111';
  const pagoCompleto = {
    citaId: CITA,
    pagos: [{ metodo: 'efectivo' as const, montoCentavos: 100_000 }],
  };

  const anticipoVivo = (monto: bigint) => ({
    anticipos_cita: [
      {
        id: ANTICIPO,
        organizacion_id: ORG,
        cita_id: CITA,
        monto_centavos: monto,
        metodo: 'efectivo',
        estado: 'vivo',
        orden_id: null,
        resuelto_en: null,
      },
    ],
  });

  const topes = {
    topes_descuento: [
      { organizacion_id: ORG, rol: 'cajero', tope_centavos: 20_000n, tope_bp: 1_000 },
      { organizacion_id: ORG, rol: 'dueno', tope_centavos: 100_000_000n, tope_bp: 10_000 },
    ],
  };

  async function rechazoDe(fn: () => Promise<unknown>): Promise<string> {
    try {
      await fn();
      return 'NO LANZÓ';
    } catch (error) {
      if (error instanceof Rechazo) return error.codigo;
      return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
    }
  }

  it('EL IVA DE LA ORDEN se extrae del total una vez (§2.1)', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, pagoCompleto);

    // $1,000 al público llevan $137.93 de IVA dentro. Antes la orden decía cero.
    expect(base.campo('ordenes', 'impuestos_centavos')).toBe(13_793n);
    expect(base.campo('ordenes', 'total_centavos')).toBe(100_000n);
  });

  it('EL ANTICIPO VIVO SE APLICA en el mismo cobro y baja lo que se paga hoy (§6.1)', async () => {
    const base = baseDe(anticipoVivo(30_000n));
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [{ metodo: 'efectivo', montoCentavos: 70_000 }],
    });

    // La VENTA es la cita completa; el anticipo sólo baja lo que entra hoy.
    expect(base.campo('ordenes', 'total_centavos')).toBe(100_000n);
    expect(base.campo('anticipos_cita', 'estado')).toBe('aplicado');
    expect(base.campo('anticipos_cita', 'orden_id')).toBe(salida.ordenId);
    expect(base.campo('anticipos_cita', 'resuelto_en')).toEqual(AHORA);
    // Al cajón entra lo de hoy: el anticipo entró el día que se dejó.
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(70_000n);
  });

  it('COBRAR LA CITA ENTERA teniendo anticipo es cobrarlo dos veces (descuadre 4)', async () => {
    const base = baseDe(anticipoVivo(30_000n));
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cobrarCita.ejecutar(ctx, pagoCompleto))).toBe('PAGO_NO_CUADRA');
    expect(base.campo('anticipos_cita', 'estado')).toBe('vivo');
  });

  it('EL DESCUENTO DENTRO DEL TOPE baja el ticket, el IVA y la comisión (§3)', async () => {
    const base = baseDe(topes);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      descuentoBp: 1_000,
      pagos: [{ metodo: 'efectivo', montoCentavos: 90_000 }],
    });

    expect(base.campo('ordenes', 'descuento_centavos')).toBe(10_000n);
    expect(base.campo('ordenes', 'total_centavos')).toBe(90_000n);
    expect(base.campo('ordenes', 'impuestos_centavos')).toBe(12_414n);
    expect(base.campo('orden_lineas', 'descuento_centavos')).toBe(10_000n);
    // Comisión sobre lo COBRADO sin IVA (la regla dice `cobrado`): 50 % de $775.86.
    expect(base.campo('comisiones_causadas', 'monto_centavos')).toBe(38_793n);
  });

  it('POR ENCIMA DEL TOPE lo cobra quien lo autoriza, con su propia sesión (F-205)', async () => {
    const base = baseDe(topes);
    const cajero = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    const conVeinte = {
      citaId: CITA,
      descuentoBp: 2_000,
      pagos: [{ metodo: 'efectivo' as const, montoCentavos: 80_000 }],
    };

    expect(await rechazoDe(() => cobrarCita.ejecutar(cajero.ctx, conVeinte))).toBe('SIN_PERMISO');
    expect(base.filas('ordenes')).toEqual([]);

    const duena = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);
    await cobrarCita.ejecutar(duena.ctx, conVeinte);
    expect(base.campo('ordenes', 'descuento_centavos')).toBe(20_000n);
    // Y queda en la bitácora, con el tope de quien lo aplicó.
    expect(duena.auditorias[0]?.payload).toMatchObject({ descuentoCentavos: '20000' });
  });

  it('LA PROPINA EN TERMINAL va en el cargo y queda A NOMBRE de quien atendió (§4, F-260)', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [{ metodo: 'tarjeta', montoCentavos: 100_000 }],
      propinas: [{ profesionalId: KARLA, montoCentavos: 15_000, camino: 'terminal' }],
    });

    expect(base.campo('pagos', 'propina_centavos')).toBe(15_000n);
    expect(base.campo('movimientos_propina', 'profesional_id')).toBe(KARLA);
    expect(base.campo('movimientos_propina', 'tipo')).toBe('recibida');
    expect(base.campo('movimientos_propina', 'monto_centavos')).toBe(15_000n);
    expect(base.campo('movimientos_propina', 'medio')).toBe('tarjeta');
    // Ni venta ni IVA: la propina no es del salón (§2.2).
    expect(base.campo('ordenes', 'total_centavos')).toBe(100_000n);
    expect(base.campo('ordenes', 'impuestos_centavos')).toBe(13_793n);
    // Y la tarjeta no toca el cajón.
    expect(base.filas('movimientos_caja')).toEqual([]);
  });

  it('LA PROPINA AL CAJÓN entra al arqueo y queda debida a la profesional', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [{ metodo: 'efectivo', montoCentavos: 100_000 }],
      propinas: [{ profesionalId: KARLA, montoCentavos: 5_000, camino: 'cajon' }],
    });

    const caja = base.filas('movimientos_caja');
    expect(caja.map((m) => [m['tipo'], m['monto_centavos']])).toEqual([
      ['venta', 100_000n],
      ['propina', 5_000n],
    ]);
    expect(base.campo('pagos', 'propina_centavos')).toBe(5_000n);
    expect(base.campo('pagos', 'recibido_centavos')).toBe(105_000n);
    expect(base.campo('movimientos_propina', 'medio')).toBe('efectivo');
    expect(base.campo('movimientos_propina', 'movimiento_caja_id')).toBe(caja[1]?.['id']);
  });

  it('LA PROPINA A LA MANO se registra y no mueve el cajón (§4.2)', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [{ metodo: 'efectivo', montoCentavos: 100_000 }],
      propinas: [{ profesionalId: KARLA, montoCentavos: 10_000, camino: 'mano' }],
    });

    const propinas = base.filas('movimientos_propina');
    // Recibida y entregada en el mismo acto: queda en su cuenta y no se le debe.
    expect(propinas.map((p) => [p['tipo'], p['monto_centavos']])).toEqual([
      ['recibida', 10_000n],
      ['entregada', -10_000n],
    ]);
    expect(base.filas('movimientos_caja').map((m) => m['tipo'])).toEqual(['venta']);
    expect(base.campo('pagos', 'propina_centavos')).toBe(0n);
  });

  it('LA PROPINA DE ALGUIEN QUE NO ES DEL SALÓN no se anota', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        cobrarCita.ejecutar(ctx, {
          ...pagoCompleto,
          propinas: [
            {
              profesionalId: 'z9999999-9999-4999-8999-999999999999',
              montoCentavos: 10_000,
              camino: 'mano',
            },
          ],
        }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
    expect(base.filas('ordenes')).toEqual([]);
  });

  it('EL PAGO MIXTO: una fila por método, y al cajón sólo el efectivo (§5)', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [
        { metodo: 'efectivo', montoCentavos: 50_000 },
        { metodo: 'tarjeta', montoCentavos: 50_000 },
      ],
    });

    expect(base.filas('pagos').map((p) => [p['metodo'], p['monto_centavos']])).toEqual([
      ['efectivo', 50_000n],
      ['tarjeta', 50_000n],
    ]);
    expect(base.filas('movimientos_caja').map((m) => m['monto_centavos'])).toEqual([50_000n]);
  });

  it('LA TRANSFERENCIA A LA CUENTA DE LA PROFESIONAL queda declarada (descuadre 1)', async () => {
    // «¿A qué cuenta?» se preguntaba y la respuesta se tiraba: el dinero que cae en
    // la cuenta de Karla se le descuenta de su liquidación sólo si queda escrito.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [
        { metodo: 'transferencia', montoCentavos: 100_000, aCuentaDe: KARLA, porConfirmar: true },
      ],
    });

    expect(base.campo('pagos', 'referencia')).toBe(`cuenta-profesional:${KARLA} por-confirmar`);
  });

  it('A LA CUENTA DEL SALÓN también se dice, para que el corte la distinga', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarCita.ejecutar(ctx, {
      citaId: CITA,
      pagos: [{ metodo: 'transferencia', montoCentavos: 100_000 }],
    });

    expect(base.campo('pagos', 'referencia')).toBe('cuenta-salon');
  });
});

describe('venta.cotizar_cita', () => {
  it('LA FRASE DEL §3: cuánto baja el ticket y cuánto la comisión de cada quien', async () => {
    const base = baseDe({
      topes_descuento: [
        { organizacion_id: ORG, rol: 'cajero', tope_centavos: 20_000n, tope_bp: 1_000 },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const cotizada = await cotizarCita.ejecutar(ctx, { citaId: CITA, descuentoBp: 1_000 });

    expect(cotizada.totalCentavos).toBe('90000');
    expect(cotizada.impuestosCentavos).toBe('12414');
    expect(cotizada.porCobrarCentavos).toBe('90000');
    expect(cotizada.descuentoPasaDelTope).toBeNull();
    expect(cotizada.cajaAbierta).toBe(true);
    // Los mismos números que el cobro: 43 103 sin descuento, 38 793 con él.
    expect(cotizada.comisiones).toEqual([
      { profesionalId: KARLA, sinDescuentoCentavos: '43103', conDescuentoCentavos: '38793' },
    ]);
    // Y no escribe nada.
    expect(base.filas('ordenes')).toEqual([]);
    expect(base.filas('comisiones_causadas')).toEqual([]);
  });

  it('AVISA ANTES de cobrar que el descuento pasa del tope, y de cuánto es el tope', async () => {
    const base = baseDe({
      topes_descuento: [
        { organizacion_id: ORG, rol: 'cajero', tope_centavos: 20_000n, tope_bp: 1_000 },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const cotizada = await cotizarCita.ejecutar(ctx, { citaId: CITA, descuentoBp: 2_000 });

    expect(cotizada.descuentoPasaDelTope).toEqual({ topeCentavos: '20000', topeBp: 1_000 });
  });

  it('SIN CAJA ABIERTA lo dice antes de cobrar: es el muro de la pantalla', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const cotizada = await cotizarCita.ejecutar(ctx, { citaId: CITA });

    expect(cotizada.cajaAbierta).toBe(false);
  });
});
