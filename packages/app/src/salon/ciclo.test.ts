import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { cancelarCita, cerrarServicio, iniciarCita, marcarNoLlego } from './ciclo.ts';
import { cobrarCita } from './cobro.ts';

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
    expect(base.campo('comisiones_causadas', 'monto_centavos')).toBe(50_000n);
    expect(salida.comisiones).toHaveLength(1);
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
