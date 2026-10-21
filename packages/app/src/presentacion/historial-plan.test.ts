import { aDiezmilesimas } from '@morphiqpos/domain/dinero';
import { describe, expect, it } from 'vitest';

import { idDeterminista } from './historial-azar.ts';
import { diaDeInstante, sumarDias, ventanaDeDias } from './historial-fechas.ts';
import { planearDia } from './historial-plan.ts';
import type {
  ContextoDeHistorial,
  EmpleadoRef,
  EstadoDelDia,
  InsumoRef,
  PlanDelDia,
  ProductoVendible,
} from './historial-tipos.ts';

/**
 * El plan de un día, sin base de datos: las cuentas del historial CUADRAN por construcción.
 *
 * Aquí se comprueba contra un catálogo que se parece al del restaurante de demostración —platillos
 * de receta, bebidas de SKU, mesas de distintos tamaños, dos cajeros y dos meseros— que lo
 * vendido, cobrado, repartido en propinas, descontado del inventario y contado en el cajón sea
 * UN solo número visto desde cada lado. Si el generador cambiara una cifra en un sitio y no en
 * otro, una de estas pruebas se pone en rojo.
 */

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUCURSAL = 'aaaaaaaa-0000-4000-8000-000000000002';
const ALMACEN = 'aaaaaaaa-0000-4000-8000-000000000003';
const TERMINAL = 'aaaaaaaa-0000-4000-8000-000000000004';
const COCINA = 'aaaaaaaa-0000-4000-8000-0000000000e1';
const BARRA = 'aaaaaaaa-0000-4000-8000-0000000000e2';

const id = (...partes: (string | number)[]): string => idDeterminista('prueba', ...partes);

function empleado(nombre: string, rol: string): EmpleadoRef {
  return { id: id('empleado', nombre), nombre, rol };
}

const CAJEROS = [empleado('Rosa', 'cajero'), empleado('Diana', 'cajero')];
const MESEROS = [empleado('Lupita', 'mesero'), empleado('Mateo', 'mesero')];
const GERENTES = [empleado('Beatriz', 'gerente'), empleado('Demo', 'dueno')];

const INSUMOS_DE_RECETA: readonly (readonly [string, string, bigint, string])[] = [
  ['arrachera', 'g', 32n, '500'],
  ['pollo', 'g', 14n, '500'],
  ['tortilla', 'pieza', 70n, '5'],
  ['queso', 'g', 22n, '5'],
  ['aguacate', 'g', 12n, '5'],
  ['arroz', 'g', 3n, '5'],
  ['crema', 'ml', 6n, '5'],
  ['huevo', 'pieza', 380n, '5'],
];

function insumosDePrueba(): Map<string, InsumoRef> {
  const insumos = new Map<string, InsumoRef>();
  for (const [clave, unidad, costo, minimo] of INSUMOS_DE_RECETA) {
    const ref: InsumoRef = {
      id: id('insumo', clave),
      nombre: clave,
      unidadBase: unidad,
      costoCentavos: costo,
      stockMinimo: aDiezmilesimas(minimo),
      proveedorId: null,
    };
    insumos.set(ref.id, ref);
  }
  for (const clave of ['agua', 'cerveza', 'refresco']) {
    const ref: InsumoRef = {
      id: id('insumo', clave),
      nombre: clave,
      unidadBase: 'pieza',
      costoCentavos: 1_400n,
      stockMinimo: aDiezmilesimas('2'),
      proveedorId: null,
    };
    insumos.set(ref.id, ref);
  }
  return insumos;
}

function plato(
  clave: string,
  clase: ProductoVendible['clase'],
  precio: bigint,
  ingredientes: readonly (readonly [string, string])[],
): ProductoVendible {
  return {
    id: id('producto', clave),
    nombre: clave,
    sku: null,
    codigoBarras: null,
    clase,
    precioCentavos: precio,
    costoCentavos: precio / 3n,
    unidadVenta: 'pieza',
    areaPreparacion: 'cocina',
    estacionDeCategoriaId: null,
    minutosPreparacion: 14,
    tiempoServicio: null,
    estrategiaConsumo: 'receta',
    permiteVentaSinStock: false,
    insumoId: null,
    unidadBaseInsumo: null,
    receta: ingredientes.map(([insumo, cantidad]) => ({
      insumoId: id('insumo', insumo),
      cantidad,
      unidad: INSUMOS_DE_RECETA.find((i) => i[0] === insumo)?.[1] ?? 'g',
      unidadBase: INSUMOS_DE_RECETA.find((i) => i[0] === insumo)?.[1] ?? 'g',
      mermaBp: 0,
      aplicaCanal: null,
      sustituiblePorGrupoId: null,
    })),
    popularidad: 1,
  };
}

function bebida(clave: string, precio: bigint): ProductoVendible {
  return {
    ...plato(clave, 'bebida', precio, []),
    areaPreparacion: 'barra',
    minutosPreparacion: null,
    estrategiaConsumo: 'sku',
    insumoId: id('insumo', clave),
    unidadBaseInsumo: 'pieza',
    receta: [],
  };
}

function contextoDePrueba(semilla = 7): ContextoDeHistorial {
  return {
    organizacionId: ORG,
    sucursalId: SUCURSAL,
    terminalId: TERMINAL,
    almacenId: ALMACEN,
    zona: 'America/Mexico_City',
    semilla,
    cajeros: CAJEROS,
    meseros: MESEROS,
    gerentes: GERENTES,
    productos: [
      plato('arrachera', 'principal', 32_900n, [
        ['arrachera', '280'],
        ['arroz', '150'],
        ['tortilla', '4'],
      ]),
      plato('pollo', 'principal', 21_500n, [
        ['pollo', '260'],
        ['arroz', '150'],
      ]),
      plato('enchiladas', 'principal', 18_900n, [
        ['pollo', '150'],
        ['tortilla', '4'],
        ['queso', '60'],
        ['crema', '60'],
      ]),
      plato('guacamole', 'entrada', 12_500n, [['aguacate', '180']]),
      plato('flan', 'postre', 8_500n, [
        ['huevo', '2'],
        ['crema', '80'],
      ]),
      bebida('agua', 2_500n),
      bebida('cerveza', 5_500n),
      bebida('refresco', 3_500n),
    ],
    mesas: [2, 2, 4, 4, 4, 4, 6, 6].map((capacidad, i) => ({
      id: id('mesa', i),
      numero: i + 1,
      capacidad,
    })),
    estaciones: [
      { id: COCINA, nombre: 'Cocina general', color: '#4A5568', esGeneral: true },
      { id: BARRA, nombre: 'Barra', color: '#2B6CB0', esGeneral: false },
    ],
    insumos: insumosDePrueba(),
    proveedores: [{ id: id('proveedor'), nombre: 'Central de Abasto' }],
    impuesto: { tasaPuntosBase: 1600, incluidoEnPrecio: true },
    topeDelCajero: { topeCentavos: 3_000n, topeBp: 1_000 },
  };
}

function estadoInicial(sobre: Partial<EstadoDelDia> = {}): EstadoDelDia {
  return {
    folioOrden: 1n,
    folioCaja: 1n,
    folioTurno: 1n,
    existencias: new Map(),
    fondoDejadoCentavos: null,
    ...sobre,
  };
}

const DIAS = ventanaDeDias('2026-09-30', 14);

const suma = (valores: readonly bigint[]): bigint => valores.reduce((a, b) => a + b, 0n);
const instante = (valor: Date | undefined): Date => {
  if (valor === undefined) throw new Error('Falta una hora en el plan.');
  return valor;
};

function efectivoEntradoAlCajon(plan: PlanDelDia): bigint {
  return suma(
    plan.pagos
      .filter((p) => p.metodo === 'efectivo')
      .map((p) => p.monto_centavos + (p.propina_centavos ?? 0n)),
  );
}

describe('planearDia · lo vendido cuadra consigo mismo', () => {
  const ctx = contextoDePrueba();
  const planes = DIAS.map((dia) => planearDia(ctx, estadoInicial(), dia));

  it('es determinista: la misma semilla y el mismo día dan el mismo plan', () => {
    const otra = planearDia(contextoDePrueba(), estadoInicial(), DIAS[3] ?? '');
    expect(otra).toEqual(planes[3]);
  });

  it('otra semilla da otros tickets', () => {
    const otra = planearDia(contextoDePrueba(99), estadoInicial(), DIAS[3] ?? '');
    expect(otra.resumen.ventasCentavos).not.toBe(planes[3]?.resumen.ventasCentavos);
  });

  it('cada orden vale lo que suman sus pagos (sin propina) y lo que suman sus líneas', () => {
    for (const plan of planes) {
      for (const orden of plan.ordenes) {
        const pagos = plan.pagos.filter((p) => p.orden_id === orden.id);
        expect(suma(pagos.map((p) => p.monto_centavos))).toBe(orden.total_centavos);
        const lineas = plan.lineas.filter((l) => l.orden_id === orden.id);
        expect(suma(lineas.map((l) => l.total_centavos))).toBe(orden.total_centavos);
        expect(suma(lineas.map((l) => l.descuento_centavos ?? 0n))).toBe(
          orden.descuento_centavos ?? 0n,
        );
        expect(orden.estado).toBe('pagada');
      }
    }
  });

  it('el costo y la utilidad de la orden son los de sus líneas', () => {
    for (const plan of planes) {
      for (const orden of plan.ordenes) {
        const lineas = plan.lineas.filter((l) => l.orden_id === orden.id);
        const costo = suma(lineas.map((l) => l.total_centavos - (l.utilidad_centavos ?? 0n)));
        expect(orden.costo_total_centavos).toBe(costo);
        expect(orden.utilidad_centavos).toBe((orden.total_centavos ?? 0n) - costo);
      }
    }
  });

  it('el efectivo que entra al cajón son los pagos en efectivo con su propina, sin el cambio', () => {
    for (const plan of planes) {
      const ventasEnEfectivo = suma(
        plan.movimientosCaja.filter((m) => m.tipo === 'venta').map((m) => m.monto_centavos),
      );
      const propinasEnEfectivo = suma(
        plan.movimientosCaja.filter((m) => m.tipo === 'propina').map((m) => m.monto_centavos),
      );
      expect(ventasEnEfectivo + propinasEnEfectivo).toBe(efectivoEntradoAlCajon(plan));
      for (const pago of plan.pagos.filter((p) => p.metodo === 'efectivo')) {
        expect(pago.recibido_centavos ?? 0n).toBe(
          pago.monto_centavos + (pago.propina_centavos ?? 0n) + (pago.cambio_centavos ?? 0n),
        );
      }
    }
  });

  it('la tarjeta y la transferencia no dan cambio y la propina de cada método es la que fue', () => {
    for (const plan of planes) {
      for (const pago of plan.pagos.filter((p) => p.metodo !== 'efectivo')) {
        expect(pago.cambio_centavos ?? 0n).toBe(0n);
        expect(pago.recibido_centavos ?? null).toBeNull();
      }
      const porOrden = new Map<string, bigint>();
      for (const pago of plan.pagos) {
        porOrden.set(
          pago.orden_id,
          (porOrden.get(pago.orden_id) ?? 0n) + (pago.propina_centavos ?? 0n),
        );
      }
      expect(suma([...porOrden.values()])).toBe(plan.resumen.propinasCentavos);
    }
  });

  it('se ve la cuenta con tarjeta y la propina en billete (renglón de efectivo sin venta)', () => {
    const soloPropina = planes
      .flatMap((p) => p.pagos)
      .filter((p) => p.metodo === 'efectivo' && p.monto_centavos === 0n);
    expect(soloPropina.length).toBeGreaterThan(0);
    for (const pago of soloPropina) expect(pago.propina_centavos ?? 0n).toBeGreaterThan(0n);
  });
});

describe('planearDia · la caja cuadra', () => {
  const ctx = contextoDePrueba();
  const planes = DIAS.map((dia) => planearDia(ctx, estadoInicial(), dia));

  it('el esperado es la suma de los movimientos y el cajón contado lo iguala', () => {
    for (const plan of planes) {
      const esperado = suma(plan.movimientosCaja.map((m) => m.monto_centavos));
      expect(plan.sesion.efectivo_esperado_centavos).toBe(esperado);
      expect(plan.sesion.efectivo_contado_centavos).toBe(esperado);
      expect(plan.sesion.diferencia_centavos).toBe(0n);
      expect(plan.resumen.efectivoEsperadoCentavos).toBe(esperado);
      const fondo = plan.sesion.fondo_inicial_centavos ?? 0n;
      const gastosEnEfectivo = suma(
        plan.gastos.filter((g) => g.metodo_pago === 'efectivo').map((g) => g.monto_centavos),
      );
      expect(esperado).toBe(fondo + efectivoEntradoAlCajon(plan) - gastosEnEfectivo);
    }
  });

  it('un gasto en efectivo sale del cajón con su movimiento negativo; los demás no', () => {
    const todos = planes.flatMap((p) => p.gastos);
    expect(todos.some((g) => g.metodo_pago === 'efectivo')).toBe(true);
    expect(todos.some((g) => g.metodo_pago !== 'efectivo')).toBe(true);
    for (const plan of planes) {
      for (const gasto of plan.gastos) {
        const salida = plan.movimientosCaja.filter((m) => m.referencia_id === gasto.id);
        if (gasto.metodo_pago === 'efectivo') {
          expect(salida).toHaveLength(1);
          expect(salida[0]?.monto_centavos).toBe(-gasto.monto_centavos);
          expect(gasto.sesion_caja_id).toBe(plan.sesion.id);
        } else {
          expect(salida).toHaveLength(0);
          expect(gasto.sesion_caja_id ?? null).toBeNull();
        }
      }
    }
  });

  it('el corte de turno cuenta lo que había en el cajón a esa hora', () => {
    for (const plan of planes) {
      const [corte] = plan.cortesTurno;
      expect(corte).toBeDefined();
      const hasta = instante(corte?.cortado_en).getTime();
      const habia = suma(
        plan.movimientosCaja
          .filter((m) => instante(m.created_at).getTime() <= hasta)
          .map((m) => m.monto_centavos),
      );
      expect(corte?.efectivo_contado_centavos).toBe(habia);
      expect(instante(corte?.rango_inicio).getTime()).toBe(
        instante(plan.sesion.abierta_en).getTime(),
      );
    }
  });

  it('se retira todo menos el fondo, y el conteo por denominación suma lo contado', () => {
    for (const plan of planes) {
      const contado = plan.sesion.efectivo_contado_centavos ?? 0n;
      const retirado = plan.sesion.efectivo_retirado_centavos ?? 0n;
      expect(contado - retirado).toBe(plan.sesion.fondo_inicial_centavos);
      expect(suma(plan.conteos.map((c) => c.denominacion_centavos * BigInt(c.piezas)))).toBe(
        contado,
      );
      const desglose =
        (plan.sesion.fondo_monedas_centavos ?? 0n) +
        (plan.sesion.fondo_chicos_centavos ?? 0n) +
        (plan.sesion.fondo_grandes_centavos ?? 0n);
      expect(desglose).toBe(plan.sesion.fondo_inicial_centavos);
    }
  });

  it('el fondo de cada día es lo que dejó el cierre anterior', () => {
    const dejado = 120_000n;
    const plan = planearDia(ctx, estadoInicial({ fondoDejadoCentavos: dejado }), DIAS[0] ?? '');
    expect(plan.sesion.fondo_inicial_centavos).toBe(dejado);
    expect(plan.sesion.fondo_esperado_centavos).toBe(dejado);
  });

  it('los folios son consecutivos desde el siguiente de cada serie, en el orden en que se cobró', () => {
    const plan = planearDia(
      ctx,
      estadoInicial({ folioOrden: 41n, folioCaja: 9n, folioTurno: 17n }),
      DIAS[4] ?? '',
    );
    const folios = plan.ordenes.map((o) => o.folio);
    expect(folios).toEqual(plan.ordenes.map((_, i) => 41n + BigInt(i)));
    const cobros = plan.ordenes.map((o) => instante(o.cerrada_en ?? undefined).getTime());
    expect([...cobros].sort((a, b) => a - b)).toEqual(cobros);
    expect(plan.sesion.folio).toBe(9n);
    expect(plan.cortesTurno[0]?.folio).toBe(17n);
    expect(plan.foliosConsumidos).toEqual({
      orden: BigInt(plan.ordenes.length),
      caja: 1n,
      turno: 1n,
    });
  });
});

describe('planearDia · el inventario cuadra', () => {
  const ctx = contextoDePrueba();

  it('nunca baja de cero, hora por hora, ni siquiera partiendo de un almacén vacío', () => {
    for (const dia of DIAS) {
      const plan = planearDia(ctx, estadoInicial(), dia);
      const saldo = new Map<string, bigint>();
      const ordenados = [...plan.movimientosStock].sort(
        (a, b) => instante(a.created_at).getTime() - instante(b.created_at).getTime(),
      );
      for (const m of ordenados) {
        const nuevo = (saldo.get(m.insumo_id) ?? 0n) + aDiezmilesimas(m.cantidad);
        expect(nuevo).toBeGreaterThanOrEqual(0n);
        saldo.set(m.insumo_id, nuevo);
      }
    }
  });

  it('lo descontado es lo que piden las recetas por las cantidades vendidas', () => {
    const plan = planearDia(ctx, estadoInicial(), DIAS[5] ?? '');
    const esperado = new Map<string, bigint>();
    for (const linea of plan.lineas) {
      const producto = ctx.productos.find((p) => p.id === linea.producto_id);
      const vendidas = aDiezmilesimas(linea.cantidad);
      const consumos =
        producto?.estrategiaConsumo === 'sku'
          ? [{ insumoId: producto.insumoId ?? '', cantidad: '1' }]
          : (producto?.receta ?? []).map((r) => ({ insumoId: r.insumoId, cantidad: r.cantidad }));
      for (const c of consumos) {
        const total = (aDiezmilesimas(c.cantidad) * vendidas) / 10_000n;
        esperado.set(c.insumoId, (esperado.get(c.insumoId) ?? 0n) + total);
      }
    }
    const salidas = new Map<string, bigint>();
    for (const m of plan.movimientosStock.filter((x) => x.tipo === 'salida_venta')) {
      salidas.set(m.insumo_id, (salidas.get(m.insumo_id) ?? 0n) - aDiezmilesimas(m.cantidad));
    }
    expect(salidas).toEqual(esperado);
  });

  it('el cambio de existencia de cada insumo es compras menos ventas, y las compras tienen proveedor', () => {
    const plan = planearDia(ctx, estadoInicial(), DIAS[2] ?? '');
    const porInsumo = new Map<string, bigint>();
    for (const m of plan.movimientosStock) {
      porInsumo.set(m.insumo_id, (porInsumo.get(m.insumo_id) ?? 0n) + aDiezmilesimas(m.cantidad));
    }
    for (const d of plan.deltasDeExistencia) expect(d.cantidad).toBe(porInsumo.get(d.insumoId));
    expect(plan.compras.length).toBeGreaterThan(0);
    for (const compra of plan.compras) {
      expect(compra.proveedor_id).toBe(id('proveedor'));
      const lineas = plan.compraLineas.filter((l) => l.compra_id === compra.id);
      expect(suma(lineas.map((l) => l.costo_total_centavos))).toBe(compra.total_centavos);
      expect(compra.fecha).toBe(DIAS[2]);
    }
  });

  it('con existencias de sobra no se compra; con poca, sí', () => {
    const holgado = new Map([...ctx.insumos.keys()].map((k) => [k, 1_000_000_000_000n] as const));
    expect(
      planearDia(ctx, estadoInicial({ existencias: holgado }), DIAS[2] ?? '').compras,
    ).toHaveLength(0);
    expect(planearDia(ctx, estadoInicial(), DIAS[2] ?? '').compras.length).toBeGreaterThan(0);
  });
});

describe('planearDia · el día, la hora y el servicio', () => {
  const ctx = contextoDePrueba();
  const planes = DIAS.map((dia) => planearDia(ctx, estadoInicial(), dia));

  it('todo cae dentro del día de México, aunque su fecha en UTC sea la siguiente', () => {
    let cenaEnOtroDiaUtc = 0;
    for (const plan of planes) {
      const fechas = [
        ...plan.ordenes.map((o) => o.created_at),
        ...plan.ordenes.map((o) => o.cerrada_en),
        ...plan.pagos.map((p) => p.created_at),
        ...plan.movimientosCaja.map((m) => m.created_at),
        ...plan.movimientosStock.map((m) => m.created_at),
        ...plan.comandas.map((c) => c.entregada_en),
        plan.sesion.abierta_en,
        plan.sesion.cerrada_en,
        ...plan.cortesTurno.map((c) => c.cortado_en),
      ];
      for (const fecha of fechas) {
        expect(diaDeInstante(instante(fecha ?? undefined))).toBe(plan.dia);
        if (
          instante(fecha ?? undefined)
            .toISOString()
            .slice(0, 10) !== plan.dia
        ) {
          cenaEnOtroDiaUtc += 1;
        }
      }
      for (const compra of plan.compras) expect(compra.fecha).toBe(plan.dia);
      for (const gasto of plan.gastos) expect(gasto.fecha).toBe(plan.dia);
    }
    // La prueba no es vacía: la cena de México cae en el día siguiente en UTC.
    expect(cenaEnOtroDiaUtc).toBeGreaterThan(0);
  });

  it('se abre la caja antes de la primera cuenta y se cierra después de la última', () => {
    for (const plan of planes) {
      const abierta = instante(plan.sesion.abierta_en).getTime();
      const cerrada = instante(plan.sesion.cerrada_en ?? undefined).getTime();
      for (const orden of plan.ordenes) {
        expect(instante(orden.created_at).getTime()).toBeGreaterThan(abierta);
        expect(instante(orden.cerrada_en ?? undefined).getTime()).toBeLessThanOrEqual(cerrada);
      }
    }
  });

  it('la cocina entrega antes de cobrar una mesa y no queda ninguna comanda viva', () => {
    for (const plan of planes) {
      for (const comanda of plan.comandas) {
        expect(comanda.estado).toBe('entregado');
        const orden = plan.ordenes.find((o) => o.id === comanda.orden_id);
        expect(orden).toBeDefined();
        expect(instante(comanda.marchada_en ?? undefined).getTime()).toBeLessThanOrEqual(
          instante(comanda.iniciada_en ?? undefined).getTime(),
        );
        expect(instante(comanda.iniciada_en ?? undefined).getTime()).toBeLessThanOrEqual(
          instante(comanda.lista_en ?? undefined).getTime(),
        );
        expect(instante(comanda.lista_en ?? undefined).getTime()).toBeLessThanOrEqual(
          instante(comanda.entregada_en ?? undefined).getTime(),
        );
        if (orden?.canal === 'aqui') {
          expect(instante(comanda.entregada_en ?? undefined).getTime()).toBeLessThan(
            instante(orden.cerrada_en ?? undefined).getTime(),
          );
        }
      }
      for (const item of plan.comandaItems) expect(item.estado).toBe('entregado');
      for (const linea of plan.lineas) expect(linea.estado_preparacion).toBe('entregado');
    }
  });

  it('dos cuentas nunca ocupan la misma mesa a la vez', () => {
    for (const plan of planes) {
      const deMesa = plan.ordenes.filter((o) => o.mesa_id !== null && o.mesa_id !== undefined);
      for (const [i, a] of deMesa.entries()) {
        for (const b of deMesa.slice(i + 1)) {
          if (a.mesa_id !== b.mesa_id) continue;
          const [primera, segunda] =
            instante(a.created_at).getTime() <= instante(b.created_at).getTime() ? [a, b] : [b, a];
          expect(instante(primera.cerrada_en ?? undefined).getTime()).toBeLessThanOrEqual(
            instante(segunda.created_at).getTime(),
          );
        }
      }
    }
  });

  it('el viernes y el sábado venden más tickets que el lunes y el martes', () => {
    const tickets = (dia: string): number => planearDia(ctx, estadoInicial(), dia).resumen.tickets;
    const semana = ventanaDeDias('2026-09-27', 7);
    const [dom, lun, mar, , , vie, sab] = semana.map(tickets);
    expect(Math.min(vie ?? 0, sab ?? 0)).toBeGreaterThan(Math.max(lun ?? 0, mar ?? 0));
    for (const total of [dom, lun, mar, vie, sab]) {
      expect(total).toBeGreaterThanOrEqual(12);
      expect(total).toBeLessThanOrEqual(35);
    }
  });

  it('sólo se usa un día de la ventana por plan: el día siguiente no se toca', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(planes.every((p, i) => p.dia === DIAS[i])).toBe(true);
  });
});

describe('planearDia · los descuentos y las valoraciones', () => {
  const ctx = contextoDePrueba();
  const planes = DIAS.flatMap((dia, i) =>
    [3, 11].map((semilla) => ({
      semilla,
      plan: planearDia(contextoDePrueba(semilla * 31 + i), estadoInicial(), dia),
    })),
  );

  it('un descuento que pasa del tope del cajero lo firma otra persona, con su bitácora', () => {
    const todas = planes.flatMap(({ plan }) => plan.autorizaciones);
    const descontadas = planes.flatMap(({ plan }) =>
      plan.ordenes.filter((o) => (o.descuento_centavos ?? 0n) > 0n),
    );
    expect(descontadas.length).toBeGreaterThan(0);
    for (const auth of todas) {
      expect(auth.solicita_empleo_id).not.toBe(auth.autoriza_empleo_id);
      expect(
        auth.descuento_centavos > auth.tope_centavos ||
          auth.descuento_centavos * 10_000n >
            (auth.base_centavos ?? 0n) * BigInt(auth.tope_bp ?? 0),
      ).toBe(true);
    }
    expect(ctx.topeDelCajero.topeCentavos).toBe(3_000n);
  });

  it('la valoración del comensal se completa o no existe, y llega después del cobro', () => {
    const valoradas = planes
      .flatMap(({ plan }) => plan.ordenes)
      .filter((o) => o.satisfaccion_score != null);
    expect(valoradas.length).toBeGreaterThan(0);
    for (const orden of valoradas) {
      expect(orden.satisfaccion_emoji).toBeTruthy();
      expect(instante(orden.satisfaccion_en ?? undefined).getTime()).toBeGreaterThanOrEqual(
        instante(orden.cerrada_en ?? undefined).getTime(),
      );
    }
  });
});
