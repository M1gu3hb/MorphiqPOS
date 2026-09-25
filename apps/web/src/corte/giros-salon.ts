import {
  arqueo,
  cancelaciones,
  cascada,
  centavos,
  datosDelCorte,
  descuentosPorUsuario,
  dinero,
  gastos,
  hora,
  resumenFinanciero,
  tablaSiHay,
  texto,
  type Celda,
  type Columna,
  type ExtrasDelServidor,
  type HojaDelServidor,
  type Seccion,
} from './hoja.ts';

/**
 * EL CORTE DEL DÍA DEL SALÓN (C.6 de la 2.4), en el orden de su §9.3.
 *
 * Lo que lo define es la liquidación POR PROFESIONAL —comisión y propina, que son dos
 * números y no se suman (D-17)—, la agenda del día y la de mañana: es el único corte del
 * proyecto que mira hacia adelante.
 */

export type ExtrasDelSalon = Extract<ExtrasDelServidor, { plantilla: 'estetica' }>;

const ESTADO_DE_CITA: Readonly<Record<string, string>> = {
  agendada: 'Agendadas',
  confirmada: 'Confirmadas',
  en_curso: 'En curso',
  terminada: 'Terminadas',
  cobrada: 'Cobradas',
  no_llego: 'No llegaron',
  cancelada: 'Canceladas',
  reprogramada: 'Reprogramadas',
};

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const pesos = (enTexto: string): string => PESOS.format(centavos(enTexto) / 100);

function liquidacion(extras: ExtrasDelSalon): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Liquidación por profesional',
    columnas: [
      { titulo: 'Profesional' },
      { titulo: 'Servicios', numerica: true },
      { titulo: 'Base sin IVA', numerica: true },
      { titulo: 'Comisión', numerica: true },
      { titulo: 'Propina recibida', numerica: true },
      { titulo: 'De ella, por terminal', numerica: true },
      { titulo: 'Propina entregada', numerica: true },
      { titulo: 'Propina que se le debe', numerica: true },
    ],
    filas: extras.profesionales.map((p) => [
      texto(p.profesional),
      texto(p.servicios),
      dinero(p.baseCentavos),
      dinero(p.comisionCentavos),
      dinero(p.propinaRecibidaCentavos),
      dinero(p.propinaTerminalCentavos),
      dinero(p.propinaEntregadaCentavos),
      dinero(p.propinaPendienteCentavos),
    ]),
    nota: 'La comisión y la propina son dos números distintos y no se suman.',
  });
}

function agenda(extras: ExtrasDelSalon): readonly Seccion[] {
  return [
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'La agenda del día',
      columnas: [{ titulo: 'Estado' }, { titulo: 'Citas', numerica: true }],
      filas: extras.agenda.map((c) => [
        texto(ESTADO_DE_CITA[c.estado] ?? c.estado),
        texto(c.citas),
      ]),
    }),
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: `Mañana (${String(extras.manana.length)} citas)`,
      columnas: [
        { titulo: 'Hora' },
        { titulo: 'Clienta' },
        { titulo: 'Servicios' },
        { titulo: 'Con' },
      ],
      filas: extras.manana.map((c) => [
        hora(c.hora),
        texto(c.clienta),
        texto(c.servicios),
        texto(c.profesional),
      ]),
    }),
  ];
}

function cabina(hoja: HojaDelServidor, extras: ExtrasDelSalon): readonly Seccion[] {
  const columnas: Columna[] = [
    { titulo: 'Producto' },
    { titulo: 'Consumido según fórmulas', numerica: true },
  ];
  if (hoja.verCostos) columnas.push({ titulo: 'Costo', numerica: true });
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Producto de cabina consumido',
    columnas,
    filas: extras.cabina.map((c) => [
      texto(c.producto),
      texto(`${c.cantidad} ${c.unidad}`),
      ...(hoja.verCostos ? [dinero(c.costoCentavos)] : []),
    ]),
    ...(extras.serviciosSinFormula > 0
      ? {
          nota: `${String(extras.serviciosSinFormula)} servicio(s) cerrado(s) hoy sin fórmula capturada: la próxima vez nadie sabrá qué se usó.`,
        }
      : {}),
  });
}

function reventa(hoja: HojaDelServidor): readonly Seccion[] {
  const columnas: Columna[] = [
    { titulo: 'Producto' },
    { titulo: 'Cantidad', numerica: true },
    { titulo: 'Venta', numerica: true },
  ];
  if (hoja.verCostos)
    columnas.push({ titulo: 'Costo', numerica: true }, { titulo: 'Margen', numerica: true });
  columnas.push({ titulo: 'Quién lo vendió' });
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Producto de reventa',
    columnas,
    filas: hoja.productos
      .filter((p) => !p.esServicio)
      .map((p) => [
        texto(p.nombre),
        texto(`${p.cantidad} ${p.unidad}`),
        dinero(p.totalCentavos),
        ...(hoja.verCostos
          ? [dinero(p.costoCentavos), dinero(centavos(p.totalCentavos) - centavos(p.costoCentavos))]
          : []),
        texto(p.vendio),
      ]),
  });
}

function anticiposYPaquetes(extras: ExtrasDelSalon): readonly Seccion[] {
  const a = extras.anticipos;
  const p = extras.paquetes;
  const celdas: Celda[] = [];
  if (
    centavos(a.cobradosCentavos) + centavos(a.aplicadosCentavos) + centavos(a.retenidosCentavos) >
      0 ||
    a.vivos > 0
  ) {
    celdas.push(
      { etiqueta: 'Anticipos cobrados hoy', valor: dinero(a.cobradosCentavos) },
      { etiqueta: 'Anticipos aplicados hoy', valor: dinero(a.aplicadosCentavos) },
      { etiqueta: 'Retenidos por no llegar', valor: dinero(a.retenidosCentavos) },
      {
        etiqueta: 'Saldo vivo de anticipos',
        valor: texto(`${pesos(a.vivosCentavos)} en ${String(a.vivos)} citas`),
        fuerte: true,
      },
    );
  }
  if (p.vendidos > 0 || p.sesionesConsumidas > 0 || p.sesionesPendientes > 0) {
    celdas.push(
      {
        etiqueta: 'Paquetes vendidos hoy',
        valor: texto(`${String(p.vendidos)} · ${pesos(p.vendidosCentavos)}`),
      },
      { etiqueta: 'Sesiones consumidas hoy', valor: texto(p.sesionesConsumidas) },
      { etiqueta: 'Sesiones pendientes', valor: texto(p.sesionesPendientes), fuerte: true },
      { etiqueta: 'Paquetes que vencen en 30 días', valor: texto(p.porVencer) },
    );
  }
  return celdas.length === 0 ? [] : [{ tipo: 'celdas', titulo: 'Anticipos y paquetes', celdas }];
}

function cortesias(extras: ExtrasDelSalon): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Cortesías y rehacer',
    columnas: [
      { titulo: 'Cita' },
      { titulo: 'Qué' },
      { titulo: 'Clienta' },
      { titulo: 'Profesional' },
      { titulo: 'Motivo' },
      { titulo: 'Hueco ocupado', numerica: true },
    ],
    filas: extras.cortesias.map((c) => [
      texto(c.folio),
      texto(c.tipo === 'rehacer' ? 'Rehacer' : 'Cortesía'),
      texto(c.clienta),
      texto(c.profesional),
      texto(c.motivo),
      texto(c.minutos === null ? null : `${String(c.minutos)} min`),
    ]),
  });
}

function efectoEnComision(extras: ExtrasDelSalon): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Efecto en comisión',
    columnas: [
      { titulo: 'Profesional' },
      { titulo: 'Motivo' },
      { titulo: 'Monto', numerica: true },
    ],
    filas: extras.contrapartidas.map((c) => [
      texto(c.profesional),
      texto(c.motivo),
      dinero(c.montoCentavos),
    ]),
  });
}

export function corteDeEstetica(hoja: HojaDelServidor, extras: ExtrasDelSalon): readonly Seccion[] {
  const suma = (servicio: boolean): number =>
    hoja.productos
      .filter((p) => p.esServicio === servicio)
      .reduce((total, p) => total + centavos(p.totalCentavos), 0);
  return [
    datosDelCorte(hoja, 'Cierre diario'),
    ...arqueo(hoja, 'Arqueo de efectivo'),
    ...cascada(hoja),
    resumenFinanciero(hoja, 'Resumen de ventas', [
      { etiqueta: 'Venta de servicio', valor: dinero(suma(true)) },
      { etiqueta: 'Venta de producto', valor: dinero(suma(false)) },
    ]),
    ...liquidacion(extras),
    ...agenda(extras),
    ...cabina(hoja, extras),
    ...reventa(hoja),
    ...anticiposYPaquetes(extras),
    ...cortesias(extras),
    ...gastos(hoja, 'Gastos y compras del día'),
    ...cancelaciones(hoja, 'Cancelaciones y descuentos'),
    ...efectoEnComision(extras),
    ...descuentosPorUsuario(hoja),
  ];
}
