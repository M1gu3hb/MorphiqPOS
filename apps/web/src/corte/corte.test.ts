import { describe, expect, it } from 'vitest';

import { documentoDelCorte, ordenDeBarra } from './giros.ts';
import type { AlertaDeLaHoja, Celda, ExtrasDelServidor, HojaDelServidor, Seccion } from './hoja.ts';

/**
 * C.6 de la etapa 2.4 · LOS CINCO CORTES, cada uno con SU contenido y en SU orden.
 *
 * Lo que se vigila es lo que cada `02-DINERO-Y-CAJA.md` §9.3 dice que no se negocia:
 * ninguna sección en cero, los costos sólo para quien los ve, el dinero dejado en caja
 * como campo, la diferencia de apertura contra lo que se esperaba AL ABRIR, y el orden
 * de las secciones de cada giro.
 */

function hoja(extras: ExtrasDelServidor, cambios: Partial<HojaDelServidor> = {}): HojaDelServidor {
  return {
    verCostos: true,
    negocio: {
      nombre: 'Demo',
      direccion: null,
      telefono: null,
      correo: null,
      rfc: null,
      logoUrl: null,
      marca: 'MorphiqPOS',
      pie: null,
      descargarAlCerrar: true,
      comisionTerminalBp: null,
    },
    sesion: {
      id: 's-1',
      serie: 'CC',
      folio: '7',
      estado: 'cerrada',
      turno: null,
      abiertaEn: '2026-09-25T14:00:00.000Z',
      cerradaEn: '2026-09-26T03:00:00.000Z',
      notasApertura: null,
      notasCierre: null,
      fondoInicialCentavos: '95000',
      fondoEsperadoCentavos: '160000',
      fondoMonedasCentavos: '95000',
      fondoChicosCentavos: '0',
      fondoGrandesCentavos: '0',
      contadoCentavos: '480000',
      retiradoCentavos: '380000',
      esperadoCentavos: '480000',
      diferenciaCentavos: '0',
      boteContadoCentavos: null,
      saldoRecargasAperturaCentavos: '0',
      saldoRecargasCierreCentavos: null,
      terminal: 'Caja 1',
      sucursal: 'Matriz',
      abrio: 'Ana',
      cerro: 'Luis',
    },
    movimientos: [
      { tipo: 'apertura', montoCentavos: '95000', cuantos: 1 },
      { tipo: 'entrada_cambio', montoCentavos: '60000', cuantos: 1 },
      { tipo: 'venta', montoCentavos: '325000', cuantos: 4 },
    ],
    conteo: [],
    metodos: [{ metodo: 'efectivo', ventasCentavos: '325000', propinasCentavos: '0', pagos: 4 }],
    resumen: {
      tickets: 4,
      totalCentavos: '325000',
      descuentoCentavos: '0',
      impuestosCentavos: '0',
      costoCentavos: '120000',
    },
    ventas: [],
    productos: [
      {
        nombre: 'Latte',
        categoria: 'Café',
        lineas: 3,
        cantidad: '3',
        unidad: 'pieza',
        totalCentavos: '225000',
        costoCentavos: '80000',
        esServicio: false,
        familia: 'bebida',
        linea: null,
        margenObjetivoBp: null,
        vendio: null,
      },
    ],
    porPersona: [],
    gastos: [],
    cancelaciones: [],
    descuentosPorUsuario: [],
    alertas: [],
    insumos: [],
    salidasSinVenta: [],
    extras,
    ...cambios,
  };
}

const RESTAURANTE: ExtrasDelServidor = { plantilla: 'restaurante', propinasPorMesero: [] };
const TIENDA: Extract<ExtrasDelServidor, { plantilla: 'tienda' | 'ferreteria' }> = {
  plantilla: 'tienda',
  cartera: {
    otorgadoCentavos: '0',
    otorgados: 0,
    saldoCentavos: '0',
    vencidoCentavos: '0',
    clientesSobreLimite: 0,
    clientesBloqueados: 0,
  },
  saldosMasViejos: [],
  cobrosDeCartera: [],
  terceros: [],
  salioSinCobrarse: [],
  materialCortado: [],
  turnos: [],
  compras: [],
  cuentasPorPagar: [],
  deudaConProveedoresCentavos: '0',
  garantias: [],
  autorizaciones: [],
  faltantes: [],
  servicios: [],
};

/** Una alerta de inventario con lo que el servidor le calcula. */
function alerta(nombre: string, cambios: Partial<AlertaDeLaHoja> = {}): AlertaDeLaHoja {
  return {
    nombre,
    existencia: '2',
    minimo: '10',
    critico: '3',
    unidad: 'pieza',
    proveedor: 'Bimbo',
    ventaDeCatorceDias: '28',
    ventaDeNoventaDias: '180',
    costoUnitarioCentavos: '1500',
    unidadCompra: 'caja',
    diasHastaLaVisita: 2,
    presentacionesSugeridas: 3,
    diasQueAlcanza: 1,
    ...cambios,
  };
}

const titulos = (secciones: readonly Seccion[]): string[] => secciones.map((s) => s.titulo);
function celda(
  secciones: readonly Seccion[],
  seccion: string,
  etiqueta: string,
): Celda | undefined {
  const encontrada = secciones.find((s) => s.titulo === seccion);
  return encontrada?.tipo === 'celdas'
    ? encontrada.celdas.find((c) => c.etiqueta === etiqueta)
    : undefined;
}

describe('las reglas de los cinco cortes', () => {
  it('ninguna sección en cero: sin gastos, cancelaciones ni propinas, no aparecen', () => {
    const doc = documentoDelCorte(hoja(RESTAURANTE));
    expect(titulos(doc.secciones)).not.toContain('Gastos operativos');
    expect(titulos(doc.secciones)).not.toContain('Cancelaciones');
    expect(titulos(doc.secciones)).not.toContain('Propinas');
    expect(titulos(doc.secciones)).not.toContain('Métodos de pago · ventas, propinas y total');
  });

  it('el dinero dejado en caja es contado − retirado, y en negritas', () => {
    const doc = documentoDelCorte(hoja(RESTAURANTE));
    const dejado = celda(doc.secciones, 'Apertura y fondo', 'Dinero dejado en caja');
    expect(dejado?.valor).toEqual({ tipo: 'dinero', centavos: 100_000 });
    expect(dejado?.fuerte).toBe(true);
  });

  it('sin decir cuánto se dejó, el documento no inventa un cero', () => {
    const base = hoja(RESTAURANTE);
    const doc = documentoDelCorte({ ...base, sesion: { ...base.sesion, retiradoCentavos: null } });
    expect(celda(doc.secciones, 'Apertura y fondo', 'Dinero dejado en caja')?.valor).toEqual({
      tipo: 'nada',
    });
  });

  it('la diferencia de apertura se mide contra lo esperado AL ABRIR, sin las entradas de cambio', () => {
    // fondo esperado 1,600 = 1,000 que dejó anoche + 600 de cambio a media mañana.
    const doc = documentoDelCorte(hoja(RESTAURANTE));
    expect(celda(doc.secciones, 'Apertura y fondo', 'Fondo esperado')?.valor).toEqual({
      tipo: 'dinero',
      centavos: 100_000,
    });
    expect(celda(doc.secciones, 'Apertura y fondo', 'Diferencia de apertura')?.valor).toEqual({
      tipo: 'dinero',
      centavos: -5_000,
    });
  });

  it('sin permiso de costos: ni utilidad, ni insumos, ni columna de costo', () => {
    const doc = documentoDelCorte(
      hoja(RESTAURANTE, {
        verCostos: false,
        insumos: null,
        resumen: { ...hoja(RESTAURANTE).resumen, costoCentavos: null },
      }),
    );
    expect(
      celda(doc.secciones, 'Resumen financiero (sin propinas)', 'Utilidad bruta'),
    ).toBeUndefined();
    expect(titulos(doc.secciones).some((t) => t.startsWith('Ingredientes'))).toBe(false);
    const productos = doc.secciones.find((s) => s.titulo === 'Productos vendidos');
    expect(productos?.tipo === 'tabla' && productos.columnas.map((c) => c.titulo)).not.toContain(
      'Costo',
    );
  });

  it('con costos, la utilidad neta resta el costo y los gastos', () => {
    const doc = documentoDelCorte(
      hoja(RESTAURANTE, {
        gastos: [
          { categoria: 'Gas', descripcion: 'Tanque', metodo: 'efectivo', montoCentavos: '5000' },
        ],
      }),
    );
    expect(
      celda(doc.secciones, 'Resumen financiero (sin propinas)', 'Utilidad neta estimada')?.valor,
    ).toEqual({ tipo: 'dinero', centavos: 325_000 - 120_000 - 5_000 });
  });
});

describe('cada giro, su documento', () => {
  it('restaurante: la propina y su tabla por mesero aparecen cuando hubo propina', () => {
    const base = hoja({
      plantilla: 'restaurante',
      propinasPorMesero: [{ mesero: 'Beto', propinaCentavos: '4000', cuentas: 2 }],
    });
    const doc = documentoDelCorte({
      ...base,
      metodos: [
        { metodo: 'tarjeta', ventasCentavos: '325000', propinasCentavos: '4000', pagos: 2 },
      ],
    });
    expect(doc.titulo).toBe('CORTE DE CAJA');
    expect(titulos(doc.secciones)).toEqual(
      expect.arrayContaining([
        'Propinas',
        'Propinas por mesero',
        'Métodos de pago · ventas, propinas y total',
      ]),
    );
    expect(titulos(doc.secciones).indexOf('Propinas')).toBeGreaterThan(
      titulos(doc.secciones).indexOf('Resumen financiero (sin propinas)'),
    );
  });

  it('cafetería: dice «corte de turno», cuenta bebidas y pone café y leche antes que lo demás', () => {
    const doc = documentoDelCorte(
      hoja(
        {
          plantilla: 'cafeteria',
          canales: [{ canal: 'aqui', pedidos: 4, unidades: '5', importeCentavos: '325000' }],
          consumoPorCanal: [],
          modificadores: [],
          reparto: [],
          mermaDeBarra: [],
          consumoDeLaCasa: [],
          sellos: {
            otorgados: 0,
            canjes: 0,
            costoCanjesCentavos: '0',
            sellosVivos: '0',
            clientesConSaldo: 0,
            costoPremioCentavos: '0',
            sellosPorPremio: 5,
          },
          noRecogidos: [],
        },
        {
          insumos: [
            {
              nombre: 'Pan',
              cantidad: '2',
              unidad: 'pieza',
              costoUnitarioCentavos: '500',
              costoCentavos: '1000',
              tipoInsumo: 'normal',
            },
            {
              nombre: 'Vaso 12 oz',
              cantidad: '3',
              unidad: 'pieza',
              costoUnitarioCentavos: '200',
              costoCentavos: '600',
              tipoInsumo: 'normal',
            },
            {
              nombre: 'Leche entera',
              cantidad: '0.6',
              unidad: 'l',
              costoUnitarioCentavos: '2500',
              costoCentavos: '1500',
              tipoInsumo: 'normal',
            },
            {
              nombre: 'Café en grano',
              cantidad: '0.054',
              unidad: 'kg',
              costoUnitarioCentavos: '40000',
              costoCentavos: '2160',
              tipoInsumo: 'normal',
            },
          ],
        },
      ),
    );
    expect(doc.titulo).toBe('CORTE DE TURNO');
    expect(doc.firmaDeCaja).toBe('Responsable del turno');
    expect(
      celda(doc.secciones, 'Resumen financiero (sin propinas)', 'Bebidas vendidas')?.valor,
    ).toEqual({
      tipo: 'texto',
      texto: '3',
    });
    const insumos = doc.secciones.find((s) => s.titulo.startsWith('Insumos consumidos'));
    expect(insumos?.tipo === 'tabla' && insumos.filas.map((f) => f[0])).toEqual([
      { tipo: 'texto', texto: 'Café en grano' },
      { tipo: 'texto', texto: 'Leche entera' },
      { tipo: 'texto', texto: 'Pan' },
    ]);
    expect(titulos(doc.secciones)).toContain('Empaque consumido (teórico)');
    expect(titulos(doc.secciones)).toContain('Ventas por canal');
  });

  it('cafetería: la comisión de terminal se ESTIMA con la tasa declarada, sobre tarjeta + propina, y resta de la neta (C.10)', () => {
    const extras: ExtrasDelServidor = {
      plantilla: 'cafeteria',
      canales: [],
      consumoPorCanal: [],
      modificadores: [],
      reparto: [],
      mermaDeBarra: [],
      consumoDeLaCasa: [],
      sellos: {
        otorgados: 0,
        canjes: 0,
        costoCanjesCentavos: '0',
        sellosVivos: '0',
        clientesConSaldo: 0,
        costoPremioCentavos: '0',
        sellosPorPremio: 5,
      },
      noRecogidos: [],
    };
    const base = hoja(extras);
    const conTasa = hoja(extras, {
      negocio: { ...base.negocio, comisionTerminalBp: 360 },
      metodos: [
        { metodo: 'efectivo', ventasCentavos: '225000', propinasCentavos: '0', pagos: 3 },
        { metodo: 'tarjeta', ventasCentavos: '100000', propinasCentavos: '10000', pagos: 1 },
      ],
    });
    const doc = documentoDelCorte(conTasa);
    // $1,100 con tarjeta (propina incluida) × 3.6 % × 1.16 = $45.94.
    expect(
      celda(
        doc.secciones,
        'Resumen financiero (sin propinas)',
        'Comisión estimada de terminal (3.6 % + IVA)',
      )?.valor,
    ).toEqual({ tipo: 'dinero', centavos: 4594 });
    // Venta 3,250 − costo 1,200 − comisión 45.94.
    expect(
      celda(doc.secciones, 'Resumen financiero (sin propinas)', 'Utilidad neta estimada')?.valor,
    ).toEqual({ tipo: 'dinero', centavos: 325000 - 120000 - 4594 });

    // Sin tasa declarada no se inventa: ni el renglón ni la resta.
    const sinTasa = documentoDelCorte(hoja(extras));
    expect(
      celda(sinTasa.secciones, 'Resumen financiero (sin propinas)', 'Utilidad neta estimada')
        ?.valor,
    ).toEqual({ tipo: 'dinero', centavos: 325000 - 120000 });
    const resumen = sinTasa.secciones.find((s) => s.titulo === 'Resumen financiero (sin propinas)');
    expect(
      resumen?.tipo === 'celdas' &&
        resumen.celdas.some((c) => c.etiqueta.startsWith('Comisión estimada')),
    ).toBe(false);
  });

  it('tienda: la cascada va antes del resumen, y el fiado no aparece si no hay cartera', () => {
    const doc = documentoDelCorte(hoja(TIENDA));
    const t = titulos(doc.secciones);
    expect(t.indexOf('De dónde salió el efectivo esperado')).toBeLessThan(
      t.indexOf('Resumen de ventas'),
    );
    expect(t).not.toContain('Fiado del día');
    expect(t).toContain('Venta por categoría, con margen');
  });

  it('ferretería: «salió y no se cobró» va justo después de la cascada', () => {
    const doc = documentoDelCorte(
      hoja({
        ...TIENDA,
        plantilla: 'ferreteria',
        salioSinCobrarse: [
          {
            tipo: 'remision',
            folio: 'R-1',
            cliente: 'Obra Sur',
            firmo: 'Pepe',
            importeCentavos: '90000',
          },
        ],
      }),
    );
    const t = titulos(doc.secciones);
    expect(t.indexOf('Salió y no se cobró')).toBe(
      t.indexOf('De dónde salió el efectivo esperado') + 1,
    );
  });

  it('estética: «corte del día», la liquidación por profesional y la agenda de mañana', () => {
    const doc = documentoDelCorte(
      hoja({
        plantilla: 'estetica',
        profesionales: [
          {
            profesional: 'Mariana',
            servicios: 3,
            baseCentavos: '150000',
            comisionCentavos: '60000',
            propinaRecibidaCentavos: '20000',
            propinaTerminalCentavos: '0',
            propinaEntregadaCentavos: '0',
            propinaPendienteCentavos: '20000',
          },
        ],
        agenda: [{ estado: 'cobrada', citas: 3 }],
        manana: [
          {
            hora: '2026-09-26T16:00:00.000Z',
            clienta: 'Ana',
            servicios: 'Corte',
            profesional: 'Mariana',
          },
        ],
        anticipos: {
          cobradosCentavos: '0',
          aplicadosCentavos: '0',
          retenidosCentavos: '0',
          vivosCentavos: '0',
          vivos: 0,
        },
        cabina: [],
        serviciosSinFormula: 0,
        cortesias: [],
        contrapartidas: [],
        paquetes: {
          vendidos: 0,
          vendidosCentavos: '0',
          sesionesConsumidas: 0,
          sesionesPendientes: 0,
          porVencer: 0,
        },
      }),
    );
    expect(doc.titulo).toBe('CORTE DEL DÍA');
    expect(titulos(doc.secciones)).toEqual(
      expect.arrayContaining([
        'Liquidación por profesional',
        'La agenda del día',
        'Mañana (1 citas)',
      ]),
    );
    expect(titulos(doc.secciones)).not.toContain('Anticipos');
  });

  it('el nombre del archivo no lleva acentos ni espacios', () => {
    expect(documentoDelCorte(hoja(RESTAURANTE)).nombreDeArchivo).toBe(
      'Demo-CORTE-DE-CAJA-CC-7.pdf',
    );
  });
});

describe('el orden fijo de la barra', () => {
  it('café, leche, lo demás y el empaque', () => {
    expect(
      ['Vaso', 'Pan', 'Leche de avena', 'Café molido'].sort(
        (a, b) => ordenDeBarra(a) - ordenDeBarra(b),
      ),
    ).toEqual(['Café molido', 'Leche de avena', 'Pan', 'Vaso']);
  });
});

describe('lo que cada giro lee para decidir mañana', () => {
  it('tienda: «qué pedir mañana» va por visita —el que viene antes arriba— con su sugerido', () => {
    const doc = documentoDelCorte(
      hoja(TIENDA, {
        alertas: [
          alerta('Pan blanco', { diasHastaLaVisita: 4 }),
          alerta('Refresco', {
            diasHastaLaVisita: 1,
            proveedor: 'Coca',
            presentacionesSugeridas: 2,
          }),
        ],
      }),
    );
    const tabla = doc.secciones.find((s) => s.titulo === 'Qué pedir mañana');
    expect(tabla?.tipo).toBe('tabla');
    if (tabla?.tipo !== 'tabla') return;
    expect(tabla.filas.map((f) => f[0])).toEqual([
      { tipo: 'texto', texto: 'Refresco · crítico' },
      { tipo: 'texto', texto: 'Pan blanco · crítico' },
    ]);
    expect(tabla.filas[0]?.[4]).toEqual({ tipo: 'texto', texto: '2 caja' });
    expect(tabla.filas[0]?.[6]).toEqual({ tipo: 'texto', texto: 'mañana' });
  });

  it('cafetería: el inventario dice cuántos días alcanza, no el mínimo', () => {
    const base = hoja({
      plantilla: 'cafeteria',
      canales: [{ canal: 'llevar', pedidos: 2, unidades: '2', importeCentavos: '10000' }],
      consumoPorCanal: [
        { canal: 'llevar', insumo: 'Vaso 12 oz', cantidad: '2', unidad: 'pieza' },
        { canal: 'llevar', insumo: 'Leche entera', cantidad: '0.4', unidad: 'l' },
      ],
      modificadores: [
        { producto: 'Latte', opcion: 'Leche de avena', veces: 2 },
        { producto: 'Latte', opcion: 'Extra shot', veces: 1 },
      ],
      reparto: [],
      mermaDeBarra: [],
      consumoDeLaCasa: [],
      sellos: {
        otorgados: 0,
        canjes: 0,
        costoCanjesCentavos: '0',
        sellosVivos: '0',
        clientesConSaldo: 0,
        costoPremioCentavos: '0',
        sellosPorPremio: 5,
      },
      noRecogidos: [],
    });
    const doc = documentoDelCorte({
      ...base,
      alertas: [alerta('Leche entera', { diasQueAlcanza: 1 })],
    });
    const inventario = doc.secciones.find((s) => s.titulo === 'Inventario bajo o crítico');
    expect(inventario?.tipo === 'tabla' && inventario.columnas.map((c) => c.titulo)).toContain(
      'Días que alcanza',
    );
    expect(inventario?.tipo === 'tabla' && inventario.filas[0]?.[4]).toEqual({
      tipo: 'texto',
      texto: 'Comprar hoy',
    });
    const canales = doc.secciones.find((s) => s.titulo === 'Ventas por canal');
    // Sólo el VASO es empaque: la leche no se cuenta como vaso.
    expect(canales?.tipo === 'tabla' && canales.filas[0]?.[4]).toEqual({
      tipo: 'texto',
      texto: '2',
    });
    const productos = doc.secciones.find((s) => s.titulo === 'Productos vendidos');
    expect(productos?.tipo === 'tabla' && productos.filas[0]?.[1]).toEqual({
      tipo: 'texto',
      texto: '2 Leche de avena, 1 Extra shot',
    });
  });

  it('ferretería: lo que se debe lleva la deuda total al pie, y las autorizaciones dicen quién', () => {
    const doc = documentoDelCorte(
      hoja({
        ...TIENDA,
        plantilla: 'ferreteria',
        cuentasPorPagar: [
          {
            proveedor: 'Truper',
            folio: 'F-9',
            venceEn: '2026-09-28T00:00:00.000Z',
            saldoCentavos: '500000',
          },
        ],
        deudaConProveedoresCentavos: '1250000',
        autorizaciones: [
          {
            hora: '2026-09-25T18:00:00.000Z',
            solicito: 'Beto',
            autorizo: 'Ana',
            rol: 'dueno',
            descuentoCentavos: '30000',
            topeCentavos: '10000',
            motivo: 'Cliente de obra',
            esDeCredito: false,
          },
        ],
      }),
    );
    const deuda = doc.secciones.find((s) => s.titulo === 'Lo que se debe: vence esta semana');
    expect(deuda?.tipo === 'tabla' && deuda.total?.[3]).toEqual({
      tipo: 'dinero',
      centavos: 1_250_000,
    });
    const autorizaciones = doc.secciones.find((s) => s.titulo === 'Autorizaciones sobre tope');
    expect(autorizaciones?.tipo === 'tabla' && autorizaciones.filas[0]?.[3]).toEqual({
      tipo: 'texto',
      texto: 'Ana (dueno)',
    });
  });

  it('ferretería sin costos: el dinero dormido no se enseña', () => {
    const doc = documentoDelCorte(
      hoja(
        { ...TIENDA, plantilla: 'ferreteria' },
        {
          verCostos: false,
          insumos: null,
          alertas: [alerta('Broca 1/4', { costoUnitarioCentavos: null })],
        },
      ),
    );
    const pedir = doc.secciones.find((s) => s.titulo === 'Qué pedir');
    expect(pedir?.tipo === 'tabla' && pedir.filas[0]?.[6]).toEqual({ tipo: 'nada' });
  });

  it('estética: el producto de cabina avisa de los servicios cerrados sin fórmula', () => {
    const doc = documentoDelCorte(
      hoja({
        plantilla: 'estetica',
        profesionales: [],
        agenda: [],
        manana: [],
        anticipos: {
          cobradosCentavos: '0',
          aplicadosCentavos: '0',
          retenidosCentavos: '0',
          vivosCentavos: '0',
          vivos: 0,
        },
        cabina: [{ producto: 'Tinte 7.1', cantidad: '60', unidad: 'ml', costoCentavos: '4800' }],
        serviciosSinFormula: 2,
        cortesias: [],
        contrapartidas: [],
        paquetes: {
          vendidos: 1,
          vendidosCentavos: '150000',
          sesionesConsumidas: 0,
          sesionesPendientes: 5,
          porVencer: 0,
        },
      }),
    );
    const cabina = doc.secciones.find((s) => s.titulo === 'Producto de cabina consumido');
    expect(cabina?.tipo === 'tabla' && cabina.nota).toMatch(
      /2 servicio\(s\) cerrado\(s\) hoy sin fórmula/,
    );
    expect(titulos(doc.secciones)).toContain('Anticipos y paquetes');
  });
});
