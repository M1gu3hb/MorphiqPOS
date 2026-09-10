import type { Ambito, Rol } from '@morphiqpos/contracts';

import type { Fila } from './base-falsa.ts';

/**
 * Un salón sembrado: la mesa 5, su cuenta y lo que hace falta para cobrarla.
 *
 * Las filas llevan los NOMBRES DE COLUMNA reales, no los del objeto de dominio.
 * Es a propósito: si alguien renombra `estrategia_captura` en el esquema o
 * cambia el `select`, estas pruebas fallan igual que fallaría producción, que
 * es exactamente lo que no hacía la suite anterior.
 */

export const ORG = '11111111-1111-4111-8111-111111111111';
export const SUCURSAL = '22222222-2222-4222-8222-222222222222';
export const TERMINAL = '33333333-3333-4333-8333-333333333333';
export const EMPLEO = '55555555-5555-4555-8555-555555555555';
export const MESA_5 = '66666666-6666-4666-8666-666666666666';
export const CUENTA = '77777777-7777-4777-8777-777777777777';
export const CARRITO_MOSTRADOR = '88888888-8888-4888-8888-888888888888';
export const PRODUCTO = '99999999-9999-4999-8999-999999999999';
export const ESTACION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SESION_CAJA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const COMANDA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const LINEA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * Las cláusulas `default` que las migraciones 003 y 045 declaran.
 *
 * Los comandos omiten estas columnas a propósito —es la base la que las
 * rellena—, así que sin declararlas aquí la fila insertada saldría incompleta y
 * la aritmética de `cotizar` fallaría por un hueco de la base falsa. Copiarlas
 * del DDL es lo que mantiene honesta a la prueba.
 */
export const PREDETERMINADOS = {
  ordenes: {
    estado: 'borrador',
    subtotal_centavos: 0n,
    descuento_centavos: 0n,
    impuestos_centavos: 0n,
    total_centavos: 0n,
    costo_total_centavos: 0n,
    utilidad_centavos: 0n,
    margen_bp: 0,
    version: 1,
    propina_puntos_base: 0,
    codigo_caja: null,
    folio: null,
  },
  orden_lineas: {
    descuento_centavos: 0n,
    es_mayoreo: false,
    estado_preparacion: 'pendiente',
  },
  comandas: { estado: 'nuevo', celebracion_especial: false, origen: 'mesero' },
  comanda_items: { estado: 'pendiente' },
  pagos: { estado: 'confirmado', propina_centavos: 0n, cambio_centavos: 0n },
} as const;

export function ambitoDe(rol: Rol): Ambito {
  return {
    organizacionId: ORG,
    sucursalId: SUCURSAL,
    terminalId: TERMINAL,
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: EMPLEO,
    rol,
  };
}

/** La cuenta de una mesa, en el estado que pida la prueba. */
export function ordenDeMesa(estado: string, cambios: Fila = {}): Fila {
  return {
    id: CUENTA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    sesion_caja_id: null,
    mesa_id: MESA_5,
    estrategia_captura: 'mesa',
    estrategia_cumplimiento: 'preparacion',
    estado,
    codigo_caja: null,
    notas_alergias: null,
    celebracion_especial: false,
    tipo_celebracion: null,
    version: 1,
    ...cambios,
  };
}

/**
 * El carrito de MOSTRADOR: sin mesa y con captura `mostrador`.
 *
 * Es la fila con la que se envenenaba el flujo de restaurante: mismo `ordenes`,
 * misma organización, y `ordenDeMesa` la devolvía como si fuera una cuenta.
 */
export function ordenDeMostrador(estado = 'borrador'): Fila {
  return ordenDeMesa(estado, {
    id: CARRITO_MOSTRADOR,
    mesa_id: null,
    estrategia_captura: 'mostrador',
    estrategia_cumplimiento: 'inmediato',
  });
}

export function mesa(estado: string, cambios: Fila = {}): Fila {
  return {
    id: MESA_5,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    numero: 5,
    estado,
    activa: true,
    orden_activa_id: CUENTA,
    empleado_atiende_id: EMPLEO,
    personas_actuales: 2,
    ...cambios,
  };
}

/** Una línea de $100.00 con costo de $40.00. */
export function linea(cambios: Fila = {}): Fila {
  return {
    id: LINEA,
    organizacion_id: ORG,
    orden_id: CUENTA,
    producto_id: PRODUCTO,
    producto_nombre: 'Enchiladas',
    sku: 'ENCH',
    cantidad: '1.0000',
    unidad: 'pieza',
    precio_unitario_centavos: 10_000n,
    costo_unitario_centavos: 4_000n,
    descuento_centavos: 0n,
    subtotal_centavos: 10_000n,
    total_centavos: 10_000n,
    es_mayoreo: false,
    tipo_venta: 'precio_fijo',
    orden_visual: 1,
    estado_preparacion: 'pendiente',
    ...cambios,
  };
}

/** El producto tal como lo devuelve la consulta con sus `leftJoin`. */
export function producto(cambios: Fila = {}): Fila {
  return {
    id: PRODUCTO,
    organizacion_id: ORG,
    nombre: 'Enchiladas',
    sku: 'ENCH',
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: 'pieza',
    precio_venta_centavos: 10_000n,
    costo_unitario_centavos: 4_000n,
    precio_mayoreo_centavos: null,
    cantidad_minima_mayoreo: null,
    unidad_variable: null,
    precio_por_unidad_variable_centavos: null,
    cantidad_minima_variable: null,
    cantidad_maxima_variable: null,
    incremento_variable: null,
    capacidad_contenedor_ml: null,
    ml_por_porcion: null,
    porciones_por_contenedor: null,
    precio_por_porcion_centavos: null,
    nombre_porcion: null,
    // `sku` descuenta inventario al cobrar; `ninguno` no. Aquí no se cobra.
    estrategia_consumo: 'directo',
    permite_venta_sin_stock: true,
    area_preparacion: 'cocina',
    activo: true,
    insumo_base_id: null,
    'ib.nombre': null,
    'i.id': null,
    'i.unidad_base': null,
    // Viene del `leftJoin` con `categorias`.
    estacion_preparacion_id: null,
    ...cambios,
  };
}

export function estacionGeneral(cambios: Fila = {}): Fila {
  return {
    id: ESTACION,
    organizacion_id: ORG,
    nombre: 'Cocina general',
    color: '#4A5568',
    es_general: true,
    activa: true,
    orden: 0,
    ...cambios,
  };
}

export function comanda(estado: string, cambios: Fila = {}): Fila {
  return {
    id: COMANDA,
    organizacion_id: ORG,
    orden_id: CUENTA,
    mesa_id: MESA_5,
    estacion_preparacion_id: ESTACION,
    estacion_nombre: 'Cocina general',
    estado,
    ...cambios,
  };
}

export function comandaItem(estado: string, cambios: Fila = {}): Fila {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    organizacion_id: ORG,
    comanda_id: COMANDA,
    orden_linea_id: LINEA,
    estado,
    ...cambios,
  };
}

export function sesionCajaAbierta(): Fila {
  return {
    id: SESION_CAJA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    estado: 'abierta',
    fondo_inicial_centavos: 0n,
    abierta_en: new Date('2026-09-09T12:00:00.000Z'),
  };
}
