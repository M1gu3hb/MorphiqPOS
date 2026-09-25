import {
  arqueo,
  cancelaciones,
  cascada,
  centavos,
  datosDelCorte,
  descuentosPorUsuario,
  dinero,
  esCritica,
  fechaYHora,
  gastos,
  hora,
  inventarioBajo,
  nombreDelMetodo,
  porcentaje,
  productosVendidos,
  resumenFinanciero,
  salidasSinVenta,
  tablaSiHay,
  texto,
  ventaPorCategoria,
  type AlertaDeLaHoja,
  type Celda,
  type Columna,
  type ExtrasDelServidor,
  type HojaDelServidor,
  type Seccion,
  type Valor,
} from './hoja.ts';

/**
 * LOS CORTES DE MOSTRADOR: la tienda y la ferretería (C.6 de la 2.4).
 *
 * Comparten tronco —la cascada del esperado, la cartera, el dinero en tránsito, qué
 * pedir— y cada uno lo lee en su orden: la tienda pregunta cómo va el fiado; la
 * ferretería, cuánto salió sin cobrarse, y lo pone justo después de la cascada.
 */

export type ExtrasDeMostrador = Extract<ExtrasDelServidor, { plantilla: 'tienda' | 'ferreteria' }>;

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const pesos = (enTexto: string): string => PESOS.format(centavos(enTexto) / 100);

export function turnosDelDia(extras: ExtrasDeMostrador): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Turnos del día',
    columnas: [
      { titulo: 'Folio' },
      { titulo: 'Hora' },
      { titulo: 'Responsable' },
      { titulo: 'Contado', numerica: true },
    ],
    filas: extras.turnos.map((t) => [
      texto(t.folio),
      hora(t.cortadoEn),
      texto(t.responsable),
      dinero(t.contadoCentavos),
    ]),
  });
}

export function cartera(
  extras: ExtrasDeMostrador,
  titulo: string,
  vencido: boolean,
): readonly Seccion[] {
  const c = extras.cartera;
  if (centavos(c.saldoCentavos) === 0 && c.otorgados === 0 && extras.cobrosDeCartera.length === 0) {
    return [];
  }
  const cobrado = extras.cobrosDeCartera.reduce((suma, p) => suma + centavos(p.montoCentavos), 0);
  const celdas: Celda[] = [
    {
      etiqueta: 'Otorgado hoy',
      valor: texto(`${pesos(c.otorgadoCentavos)} en ${String(c.otorgados)}`),
    },
    { etiqueta: 'Cobrado hoy', valor: dinero(cobrado) },
    { etiqueta: 'Saldo total de la cartera', valor: dinero(c.saldoCentavos), fuerte: true },
  ];
  if (vencido) {
    celdas.push(
      { etiqueta: 'Vencido', valor: dinero(c.vencidoCentavos), fuerte: true },
      { etiqueta: 'Clientes sobre su límite', valor: texto(c.clientesSobreLimite) },
      { etiqueta: 'Clientes bloqueados por mora', valor: texto(c.clientesBloqueados) },
    );
  }
  return [
    { tipo: 'celdas', titulo, celdas },
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Cobrado hoy, por método',
      columnas: [
        { titulo: 'Método' },
        { titulo: 'Abonos', numerica: true },
        { titulo: 'Monto', numerica: true },
      ],
      filas: extras.cobrosDeCartera.map((p) => [
        texto(nombreDelMetodo(p.metodo)),
        texto(p.abonos),
        dinero(p.montoCentavos),
      ]),
    }),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Los cinco saldos más viejos',
      columnas: [
        { titulo: 'Cliente' },
        { titulo: 'Saldo', numerica: true },
        { titulo: 'Días', numerica: true },
      ],
      filas: extras.saldosMasViejos.map((s) => [
        texto(s.cliente),
        dinero(s.saldoCentavos),
        texto(s.dias),
      ]),
    }),
  ];
}

const TERCERO: Readonly<Record<string, string>> = {
  recarga: 'Recargas',
  servicio: 'Pago de servicios',
  paqueteria: 'Paquetería',
};

export function terceros(hoja: HojaDelServidor, extras: ExtrasDeMostrador): readonly Seccion[] {
  const s = hoja.sesion;
  const vendidas = extras.terceros
    .filter((t) => t.tipo === 'recarga')
    .reduce((suma, t) => suma + centavos(t.montoCentavos), 0);
  const secciones: Seccion[] = [
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Comisiones y dinero en tránsito',
      columnas: [
        { titulo: 'Operación' },
        { titulo: 'Nº', numerica: true },
        { titulo: 'Monto', numerica: true },
        { titulo: 'Comisión', numerica: true },
      ],
      filas: extras.terceros.map((t) => [
        texto(TERCERO[t.tipo] ?? t.tipo),
        texto(t.operaciones),
        dinero(t.montoCentavos),
        dinero(t.comisionCentavos),
      ]),
    }),
  ];
  if (vendidas > 0 || centavos(s.saldoRecargasAperturaCentavos) > 0) {
    const esperado = centavos(s.saldoRecargasAperturaCentavos) - vendidas;
    secciones.push({
      tipo: 'celdas',
      titulo: 'Saldo de recargas',
      celdas: [
        { etiqueta: 'Inicial', valor: dinero(s.saldoRecargasAperturaCentavos) },
        { etiqueta: 'Vendido', valor: dinero(vendidas) },
        { etiqueta: 'Esperado', valor: dinero(esperado) },
        { etiqueta: 'Capturado', valor: dinero(s.saldoRecargasCierreCentavos) },
        {
          etiqueta: 'Diferencia',
          valor: dinero(
            s.saldoRecargasCierreCentavos === null
              ? null
              : centavos(s.saldoRecargasCierreCentavos) - esperado,
          ),
          fuerte: true,
        },
      ],
    });
  }
  return secciones;
}

/** Los faltantes y sobrantes de los conteos cerrados hoy, al costo. */
export function faltantes(hoja: HojaDelServidor, extras: ExtrasDeMostrador): readonly Seccion[] {
  const columnas: Columna[] = [
    { titulo: 'Producto' },
    { titulo: 'Esperado', numerica: true },
    { titulo: 'Contado', numerica: true },
    { titulo: 'Diferencia', numerica: true },
  ];
  if (hoja.verCostos) columnas.push({ titulo: '$ al costo', numerica: true });
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Faltantes y sobrantes del conteo',
    columnas,
    filas: extras.faltantes.map((f) => {
      const diferencia = Number(f.contado) - Number(f.esperado);
      return [
        texto(f.producto),
        texto(`${f.esperado} ${f.unidad}`),
        texto(`${f.contado} ${f.unidad}`),
        texto(
          `${diferencia > 0 ? '+' : ''}${String(Math.round(diferencia * 1000) / 1000)} ${f.unidad}`,
        ),
        ...(hoja.verCostos ? [dinero(f.costoCentavos)] : []),
      ];
    }),
  });
}

export function comprasDelDia(extras: ExtrasDeMostrador): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Compras recibidas hoy',
    columnas: [
      { titulo: 'Proveedor' },
      { titulo: 'Factura' },
      { titulo: 'Forma de pago' },
      { titulo: 'Monto', numerica: true },
    ],
    filas: extras.compras.map((c) => [
      texto(c.proveedor),
      texto(c.factura),
      texto(
        c.metodo === null
          ? `A crédito${c.diasDeCredito === null ? '' : `, ${String(c.diasDeCredito)} días`}`
          : nombreDelMetodo(c.metodo),
      ),
      dinero(c.totalCentavos),
    ]),
  });
}

/** Qué pedir: por proveedor, con el que viene antes arriba, y con el sugerido de «Entradas». */
function quePedir(
  hoja: HojaDelServidor,
  titulo: string,
  ritmo: { readonly titulo: string; readonly de: (a: AlertaDeLaHoja) => string },
  ultima: { readonly columna: Columna; readonly de: (a: AlertaDeLaHoja) => Valor },
): readonly Seccion[] {
  const ordenadas = [...hoja.alertas].sort(
    (a, b) => (a.diasHastaLaVisita ?? 99) - (b.diasHastaLaVisita ?? 99),
  );
  return inventarioBajo(
    hoja,
    titulo,
    [
      { titulo: 'Producto' },
      { titulo: 'Existencia', numerica: true },
      { titulo: 'Mínimo', numerica: true },
      { titulo: ritmo.titulo, numerica: true },
      { titulo: 'Sugerido', numerica: true },
      { titulo: 'Proveedor' },
      ultima.columna,
    ],
    (a) => [
      texto(`${a.nombre}${esCritica(a) ? ' · crítico' : ''}`),
      texto(`${a.existencia} ${a.unidad}`),
      texto(`${a.minimo} ${a.unidad}`),
      texto(`${ritmo.de(a)} ${a.unidad}`),
      texto(
        a.presentacionesSugeridas === 0
          ? null
          : `${String(a.presentacionesSugeridas)} ${a.unidadCompra ?? a.unidad}`,
      ),
      texto(a.proveedor),
      ultima.de(a),
    ],
    ordenadas,
  );
}

/** Cuándo viene: «mañana», «en 3 días», o que se le llama porque no tiene ruta. */
function diaDeVisita(a: AlertaDeLaHoja): Valor {
  if (a.diasHastaLaVisita === null) return texto('Se le llama');
  if (a.diasHastaLaVisita === 0) return texto('hoy');
  if (a.diasHastaLaVisita === 1) return texto('mañana');
  return texto(`en ${String(a.diasHastaLaVisita)} días`);
}

export function corteDeTienda(
  hoja: HojaDelServidor,
  extras: ExtrasDeMostrador,
): readonly Seccion[] {
  return [
    datosDelCorte(hoja, 'Corte de turno'),
    ...turnosDelDia(extras),
    ...arqueo(hoja, 'Arqueo de efectivo'),
    ...cascada(hoja),
    resumenFinanciero(hoja, 'Resumen de ventas'),
    ...ventaPorCategoria(hoja, 'Venta por categoría, con margen', 'Categoría'),
    ...productosVendidos(hoja, 'Movimiento de existencia: lo que salió vendido'),
    ...faltantes(hoja, extras),
    ...salidasSinVenta(hoja, 'Merma, canje y consumo de la casa'),
    ...cartera(extras, 'Fiado del día', false),
    ...terceros(hoja, extras),
    ...gastos(hoja, 'Gastos del día'),
    ...comprasDelDia(extras),
    ...quePedir(
      hoja,
      'Qué pedir mañana',
      { titulo: 'Venta de 14 días', de: (a) => a.ventaDeCatorceDias },
      { columna: { titulo: 'Visita' }, de: diaDeVisita },
    ),
    ...cancelaciones(hoja, 'Cancelaciones'),
    ...descuentosPorUsuario(hoja),
  ];
}

/** Venta y margen por LÍNEA, con el margen objetivo de sus productos. */
function ventaPorLinea(hoja: HojaDelServidor): readonly Seccion[] {
  const porLinea = new Map<string, { venta: number; costo: number; objetivo: number[] }>();
  for (const p of hoja.productos) {
    const clave = p.linea ?? p.categoria ?? 'Sin línea';
    const actual = porLinea.get(clave) ?? { venta: 0, costo: 0, objetivo: [] };
    porLinea.set(clave, {
      venta: actual.venta + centavos(p.totalCentavos),
      costo: actual.costo + centavos(p.costoCentavos),
      objetivo:
        p.margenObjetivoBp === null ? actual.objetivo : [...actual.objetivo, p.margenObjetivoBp],
    });
  }
  if (!hoja.verCostos) return ventaPorCategoria(hoja, 'Venta por línea', 'Línea');
  const total = centavos(hoja.resumen.totalCentavos);
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Venta y margen por línea',
    columnas: [
      { titulo: 'Línea' },
      { titulo: 'Venta', numerica: true },
      { titulo: 'Costo', numerica: true },
      { titulo: 'Margen', numerica: true },
      { titulo: '% del día', numerica: true },
      { titulo: 'Margen objetivo', numerica: true },
    ],
    filas: [...porLinea.entries()]
      .sort((a, b) => b[1].venta - a[1].venta)
      .map(([nombre, { venta, costo, objetivo }]) => [
        texto(nombre),
        dinero(venta),
        dinero(costo),
        porcentaje(venta - costo, venta),
        porcentaje(venta, total),
        objetivo.length === 0
          ? texto(null)
          : {
              tipo: 'porcentaje',
              puntosBase: Math.round(objetivo.reduce((a, b) => a + b, 0) / objetivo.length),
            },
      ]),
  });
}

export function corteDeFerreteria(
  hoja: HojaDelServidor,
  extras: ExtrasDeMostrador,
): readonly Seccion[] {
  const salio = extras.salioSinCobrarse;
  const totalSalio = salio.reduce((suma, s) => suma + centavos(s.importeCentavos), 0);
  const deuda = centavos(extras.deudaConProveedoresCentavos);
  return [
    datosDelCorte(hoja, 'Corte de turno'),
    ...turnosDelDia(extras),
    ...arqueo(hoja, 'Arqueo de efectivo'),
    ...cascada(hoja),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Salió y no se cobró',
      columnas: [
        { titulo: 'Qué' },
        { titulo: 'Folio' },
        { titulo: 'Cliente' },
        { titulo: 'Firmó' },
        { titulo: 'Importe', numerica: true },
      ],
      filas: salio.map((s) => [
        texto(s.tipo === 'remision' ? 'Remisión a cuenta' : 'Nota sin cobrar'),
        texto(s.folio),
        texto(s.cliente),
        texto(s.firmo),
        dinero(s.importeCentavos),
      ]),
      total: [texto('TOTAL'), texto(''), texto(''), texto(''), dinero(totalSalio)],
    }),
    ...cartera(extras, 'Cartera', true),
    resumenFinanciero(hoja, 'Resumen de ventas'),
    ...ventaPorLinea(hoja),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Venta por mostradorista',
      columnas: [
        { titulo: 'Persona' },
        { titulo: 'Ventas', numerica: true },
        { titulo: 'Importe', numerica: true },
        { titulo: 'Ticket promedio', numerica: true },
        { titulo: 'Líneas por venta', numerica: true },
        { titulo: 'Descuentos', numerica: true },
      ],
      filas: hoja.porPersona.map((p) => [
        texto(p.nombre),
        texto(p.ventas),
        dinero(p.importeCentavos),
        dinero(p.ventas === 0 ? 0 : Math.round(centavos(p.importeCentavos) / p.ventas)),
        texto(p.ventas === 0 ? null : (p.lineas / p.ventas).toFixed(1)),
        dinero(p.descuentoCentavos),
      ]),
    }),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Material cortado hoy',
      columnas: [
        { titulo: 'Producto' },
        { titulo: 'Cortes', numerica: true },
        { titulo: 'Medida vendida', numerica: true },
        { titulo: 'Merma de corte', numerica: true },
      ],
      filas: extras.materialCortado.map((m) => [
        texto(m.producto),
        texto(m.cortes),
        texto(m.medidaBase),
        texto(m.mermaBase),
      ]),
    }),
    ...productosVendidos(hoja, 'Movimiento de existencia: lo que salió vendido'),
    ...faltantes(hoja, extras),
    ...salidasSinVenta(hoja, 'Merma y consumo'),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Enviado a garantía al proveedor',
      columnas: [
        { titulo: 'Producto' },
        { titulo: 'Proveedor' },
        { titulo: 'Piezas', numerica: true },
        { titulo: 'Estado' },
        { titulo: 'Días', numerica: true },
        ...(hoja.verCostos ? [{ titulo: 'Costo', numerica: true }] : []),
      ],
      filas: extras.garantias.map((g) => [
        texto(g.producto),
        texto(g.proveedor),
        texto(g.piezas),
        texto(g.estado === 'enviada' ? 'Enviada' : 'Por enviar'),
        texto(g.dias),
        ...(hoja.verCostos ? [dinero(g.costoCentavos)] : []),
      ]),
    }),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Servicios de mostrador',
      columnas: [
        { titulo: 'Servicio' },
        { titulo: 'Nº', numerica: true },
        { titulo: 'Importe', numerica: true },
        ...(hoja.verCostos
          ? [
              { titulo: 'Material a costo', numerica: true },
              { titulo: 'Margen', numerica: true },
            ]
          : []),
      ],
      filas: extras.servicios.map((s) => [
        texto(s.tipo),
        texto(s.servicios),
        dinero(s.importeCentavos),
        ...(hoja.verCostos
          ? [
              dinero(s.materialCentavos),
              porcentaje(
                centavos(s.importeCentavos) - centavos(s.materialCentavos),
                centavos(s.importeCentavos),
              ),
            ]
          : []),
      ]),
    }),
    ...terceros(hoja, extras),
    ...gastos(hoja, 'Gastos del día'),
    ...comprasDelDia(extras),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Lo que se debe: vence esta semana',
      columnas: [
        { titulo: 'Proveedor' },
        { titulo: 'Folio' },
        { titulo: 'Vence' },
        { titulo: 'Saldo', numerica: true },
      ],
      filas: extras.cuentasPorPagar.map((c) => [
        texto(c.proveedor),
        texto(c.folio),
        fechaYHora(c.venceEn),
        dinero(c.saldoCentavos),
      ]),
      total: [texto('Deuda total con proveedores'), texto(''), texto(''), dinero(deuda)],
    }),
    ...quePedir(
      hoja,
      'Qué pedir',
      { titulo: 'Venta de 90 días', de: (a) => a.ventaDeNoventaDias },
      {
        columna: { titulo: 'Dinero ya dormido', numerica: true },
        de: (a) =>
          a.costoUnitarioCentavos === null
            ? texto(null)
            : dinero(
                Math.round(Math.max(0, Number(a.existencia)) * centavos(a.costoUnitarioCentavos)),
              ),
      },
    ),
    ...cancelaciones(hoja, 'Cancelaciones y autorizaciones'),
    ...descuentosPorUsuario(hoja),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Autorizaciones sobre tope',
      columnas: [
        { titulo: 'Hora' },
        { titulo: 'Qué' },
        { titulo: 'Pidió' },
        { titulo: 'Autorizó' },
        { titulo: 'Monto', numerica: true },
        { titulo: 'Motivo' },
      ],
      filas: extras.autorizaciones.map((a) => [
        hora(a.hora),
        texto(a.esDeCredito ? 'Despacho a crédito' : 'Descuento sobre tope'),
        texto(a.solicito),
        texto(`${a.autorizo ?? '—'} (${a.rol})`),
        dinero(a.descuentoCentavos),
        texto(a.motivo),
      ]),
    }),
  ];
}
