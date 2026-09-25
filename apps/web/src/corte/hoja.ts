/**
 * LA HOJA DEL CORTE, como la lee el navegador (C.6 de la 2.4, F-234).
 *
 * `caja.hoja_del_corte` devuelve el dato; aquí se arma el DOCUMENTO: una lista de
 * secciones en el orden que pide el `02-DINERO-Y-CAJA.md` §9.3 de cada giro. Es puro —ni
 * React ni red— para que el orden, lo que se omite y cada cuenta se prueben sin navegador.
 *
 * Tres reglas de los cinco documentos, que se cumplen aquí y no en cada giro:
 *   1 · «Ninguna sección en cero»: una tabla sin filas no aparece.
 *   2 · «Lo que es estimación se rotula como estimación»: el consumo teórico de insumo.
 *   3 · Los costos sólo si el servidor los mandó (`verCostos`): sin ellos, ni utilidad ni
 *       margen, y no se inventa un cero.
 */

// ── Lo que llega del servidor (importes en centavos, como texto de bigint) ──────────

export interface SesionDeLaHoja {
  readonly id: string;
  readonly serie: string;
  readonly folio: string | null;
  readonly estado: string;
  readonly turno: string | null;
  readonly abiertaEn: string;
  readonly cerradaEn: string | null;
  readonly notasApertura: string | null;
  readonly notasCierre: string | null;
  readonly fondoInicialCentavos: string;
  readonly fondoEsperadoCentavos: string;
  readonly fondoMonedasCentavos: string;
  readonly fondoChicosCentavos: string;
  readonly fondoGrandesCentavos: string;
  readonly contadoCentavos: string | null;
  readonly retiradoCentavos: string | null;
  readonly esperadoCentavos: string | null;
  readonly diferenciaCentavos: string | null;
  readonly boteContadoCentavos: string | null;
  readonly saldoRecargasAperturaCentavos: string;
  readonly saldoRecargasCierreCentavos: string | null;
  readonly terminal: string | null;
  readonly sucursal: string;
  readonly abrio: string | null;
  readonly cerro: string | null;
}

export interface NegocioDeLaHoja {
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly rfc: string | null;
  readonly logoUrl: string | null;
  readonly marca: string;
  readonly pie: string | null;
  readonly descargarAlCerrar: boolean;
}

export interface HojaDelServidor {
  readonly verCostos: boolean;
  readonly negocio: NegocioDeLaHoja;
  readonly sesion: SesionDeLaHoja;
  readonly movimientos: readonly { tipo: string; montoCentavos: string; cuantos: number }[];
  readonly conteo: readonly { denominacionCentavos: string; piezas: number }[];
  readonly metodos: readonly {
    metodo: string;
    ventasCentavos: string;
    propinasCentavos: string;
    pagos: number;
  }[];
  readonly resumen: {
    readonly tickets: number;
    readonly totalCentavos: string;
    readonly descuentoCentavos: string;
    readonly impuestosCentavos: string;
    readonly costoCentavos: string | null;
  };
  readonly ventas: readonly {
    folio: string | null;
    cobradaEn: string | null;
    mesa: string | null;
    nombrePedido: string | null;
    cliente: string | null;
    canal: string;
    productos: string | null;
    totalCentavos: string;
    pago: string | null;
    atendio: string | null;
  }[];
  readonly productos: readonly ProductoDeLaHoja[];
  readonly porPersona: readonly {
    nombre: string | null;
    ventas: number;
    importeCentavos: string;
    lineas: number;
    descuentoCentavos: string;
  }[];
  readonly gastos: readonly {
    categoria: string;
    descripcion: string;
    metodo: string;
    montoCentavos: string;
  }[];
  readonly cancelaciones: readonly {
    tipo: 'orden' | 'linea';
    folio: string | null;
    hora: string | null;
    usuario: string | null;
    motivo: string | null;
    producto: string | null;
    montoCentavos: string;
  }[];
  readonly descuentosPorUsuario: readonly {
    usuario: string | null;
    ventas: number;
    montoCentavos: string;
  }[];
  readonly alertas: readonly AlertaDeLaHoja[];
  readonly insumos:
    | readonly {
        nombre: string;
        cantidad: string;
        unidad: string;
        costoUnitarioCentavos: string;
        costoCentavos: string;
        tipoInsumo: string;
      }[]
    | null;
  readonly salidasSinVenta: readonly {
    tipo: string;
    motivo: string | null;
    nombre: string;
    cantidad: string;
    unidad: string;
    costoCentavos: string | null;
    quien: string | null;
  }[];
  readonly extras: ExtrasDelServidor;
}

export interface AlertaDeLaHoja {
  readonly nombre: string;
  readonly existencia: string;
  readonly minimo: string;
  readonly critico: string;
  readonly unidad: string;
  readonly proveedor: string | null;
  readonly ventaDeCatorceDias: string;
  readonly ventaDeNoventaDias: string;
  readonly costoUnitarioCentavos: string | null;
  readonly unidadCompra: string | null;
  readonly diasHastaLaVisita: number | null;
  readonly presentacionesSugeridas: number;
  readonly diasQueAlcanza: number | null;
}

export interface ProductoDeLaHoja {
  readonly nombre: string;
  readonly categoria: string | null;
  readonly lineas: number;
  readonly cantidad: string;
  readonly unidad: string;
  readonly totalCentavos: string;
  readonly costoCentavos: string | null;
  readonly esServicio: boolean;
  readonly familia: string | null;
  readonly linea: string | null;
  readonly margenObjetivoBp: number | null;
  readonly vendio: string | null;
}

export type ExtrasDelServidor =
  | {
      readonly plantilla: 'restaurante';
      readonly propinasPorMesero: readonly {
        mesero: string | null;
        propinaCentavos: string;
        cuentas: number;
      }[];
    }
  | {
      readonly plantilla: 'cafeteria';
      readonly canales: readonly {
        canal: string;
        pedidos: number;
        unidades: string;
        importeCentavos: string;
      }[];
      readonly consumoPorCanal: readonly {
        canal: string;
        insumo: string;
        cantidad: string;
        unidad: string;
      }[];
      readonly modificadores: readonly { producto: string; opcion: string; veces: number }[];
      readonly reparto: readonly {
        persona: string | null;
        minutos: number | null;
        montoCentavos: string;
      }[];
      readonly mermaDeBarra: readonly {
        motivo: string | null;
        insumo: string;
        cantidad: string;
        unidad: string;
        costoCentavos: string;
      }[];
      readonly consumoDeLaCasa: readonly {
        tipo: string;
        producto: string;
        cantidad: string;
        unidad: string;
        costoCentavos: string;
        autorizo: string | null;
        motivo: string;
      }[];
      readonly sellos: {
        readonly otorgados: number;
        readonly canjes: number;
        readonly costoCanjesCentavos: string;
        readonly sellosVivos: string;
        readonly clientesConSaldo: number;
        readonly costoPremioCentavos: string;
        readonly sellosPorPremio: number;
      };
      readonly noRecogidos: readonly {
        nombre: string;
        horaPrometida: string;
        totalCentavos: string;
        costoCentavos: string | null;
      }[];
    }
  | {
      readonly plantilla: 'tienda' | 'ferreteria';
      readonly cartera: {
        readonly otorgadoCentavos: string;
        readonly otorgados: number;
        readonly saldoCentavos: string;
        readonly vencidoCentavos: string;
        readonly clientesSobreLimite: number;
        readonly clientesBloqueados: number;
      };
      readonly saldosMasViejos: readonly { cliente: string; saldoCentavos: string; dias: number }[];
      readonly cobrosDeCartera: readonly {
        metodo: string;
        montoCentavos: string;
        abonos: number;
      }[];
      readonly terceros: readonly {
        tipo: string;
        operaciones: number;
        montoCentavos: string;
        comisionCentavos: string;
      }[];
      readonly salioSinCobrarse: readonly {
        tipo: 'remision' | 'nota_abierta';
        folio: string | null;
        cliente: string | null;
        firmo: string | null;
        importeCentavos: string;
      }[];
      readonly materialCortado: readonly {
        producto: string;
        cortes: number;
        medidaBase: string;
        mermaBase: string;
      }[];
      readonly turnos: readonly {
        folio: string;
        cortadoEn: string;
        responsable: string | null;
        contadoCentavos: string;
      }[];
      readonly compras: readonly {
        proveedor: string;
        totalCentavos: string;
        metodo: string | null;
        diasDeCredito: number | null;
        factura: string | null;
      }[];
      readonly cuentasPorPagar: readonly {
        proveedor: string;
        folio: string;
        venceEn: string;
        saldoCentavos: string;
      }[];
      readonly deudaConProveedoresCentavos: string;
      readonly garantias: readonly {
        producto: string;
        proveedor: string;
        piezas: number;
        estado: string;
        dias: number;
        costoCentavos: string;
      }[];
      readonly autorizaciones: readonly {
        hora: string;
        solicito: string | null;
        autorizo: string | null;
        rol: string;
        descuentoCentavos: string;
        topeCentavos: string;
        motivo: string;
        esDeCredito: boolean;
      }[];
      readonly faltantes: readonly {
        producto: string;
        esperado: string;
        contado: string;
        unidad: string;
        costoCentavos: string | null;
      }[];
      readonly servicios: readonly {
        tipo: string;
        servicios: number;
        importeCentavos: string;
        materialCentavos: string;
      }[];
    }
  | {
      readonly plantilla: 'estetica';
      readonly profesionales: readonly {
        profesional: string;
        servicios: number;
        baseCentavos: string;
        comisionCentavos: string;
        propinaRecibidaCentavos: string;
        propinaTerminalCentavos: string;
        propinaEntregadaCentavos: string;
        propinaPendienteCentavos: string;
      }[];
      readonly agenda: readonly { estado: string; citas: number }[];
      readonly manana: readonly {
        hora: string;
        clienta: string | null;
        servicios: string | null;
        profesional: string | null;
      }[];
      readonly anticipos: {
        readonly cobradosCentavos: string;
        readonly aplicadosCentavos: string;
        readonly retenidosCentavos: string;
        readonly vivosCentavos: string;
        readonly vivos: number;
      };
      readonly cabina: readonly {
        producto: string;
        cantidad: string;
        unidad: string;
        costoCentavos: string | null;
      }[];
      readonly serviciosSinFormula: number;
      readonly cortesias: readonly {
        folio: string;
        tipo: 'cortesia' | 'rehacer';
        clienta: string | null;
        profesional: string | null;
        motivo: string | null;
        minutos: number | null;
      }[];
      readonly contrapartidas: readonly {
        profesional: string;
        montoCentavos: string;
        motivo: string | null;
      }[];
      readonly paquetes: {
        readonly vendidos: number;
        readonly vendidosCentavos: string;
        readonly sesionesConsumidas: number;
        readonly sesionesPendientes: number;
        readonly porVencer: number;
      };
    };

// ── El documento: secciones ─────────────────────────────────────────────────

export type Valor =
  | { readonly tipo: 'dinero'; readonly centavos: number }
  | { readonly tipo: 'texto'; readonly texto: string }
  | { readonly tipo: 'porcentaje'; readonly puntosBase: number }
  | { readonly tipo: 'nada' };

export interface Celda {
  readonly etiqueta: string;
  readonly valor: Valor;
  readonly fuerte?: boolean;
}

export interface Columna {
  readonly titulo: string;
  readonly numerica?: boolean;
}

export type Seccion =
  | {
      readonly tipo: 'celdas';
      readonly titulo: string;
      readonly celdas: readonly Celda[];
      readonly nota?: string;
    }
  | {
      readonly tipo: 'tabla';
      readonly titulo: string;
      readonly columnas: readonly Columna[];
      readonly filas: readonly (readonly Valor[])[];
      readonly total?: readonly Valor[];
      readonly nota?: string;
    }
  | {
      readonly tipo: 'cascada';
      readonly titulo: string;
      readonly pasos: readonly { readonly etiqueta: string; readonly centavos: number }[];
      readonly resultado: { readonly etiqueta: string; readonly centavos: number | null };
    };

export interface DocumentoDelCorte {
  /** «CORTE DE CAJA», «CORTE DE TURNO», «CORTE DEL DÍA»: lo que dice arriba a la derecha. */
  readonly titulo: string;
  readonly negocio: NegocioDeLaHoja;
  readonly folio: string;
  readonly secciones: readonly Seccion[];
  readonly firmaDeCaja: string;
  readonly responsable: string | null;
  readonly nombreDeArchivo: string;
}

// ── Piezas ──────────────────────────────────────────────────────────────────

export const dinero = (centavos: number | string | null): Valor =>
  centavos === null ? { tipo: 'nada' } : { tipo: 'dinero', centavos: Number(centavos) };
export const texto = (valor: string | number | null | undefined): Valor =>
  valor === null || valor === undefined || valor === ''
    ? { tipo: 'nada' }
    : { tipo: 'texto', texto: String(valor) };
export const porcentaje = (parte: number, todo: number): Valor =>
  todo === 0
    ? { tipo: 'nada' }
    : { tipo: 'porcentaje', puntosBase: Math.round((parte * 10_000) / todo) };

export const centavos = (valor: string | null | undefined): number =>
  valor === null || valor === undefined ? 0 : Number(valor);

/** Regla 1: una tabla sin filas no aparece. */
export function tablaSiHay(seccion: Extract<Seccion, { tipo: 'tabla' }>): readonly Seccion[] {
  return seccion.filas.length === 0 ? [] : [seccion];
}

const HORA = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
const FECHA_Y_HORA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const hora = (iso: string | null): Valor =>
  iso === null ? { tipo: 'nada' } : texto(HORA.format(new Date(iso)));
export const fechaYHora = (iso: string | null): Valor =>
  iso === null ? { tipo: 'nada' } : texto(FECHA_Y_HORA.format(new Date(iso)));

/** Cómo se dice cada método de pago en el documento. */
export const METODO: Readonly<Record<string, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  fiado: 'Fiado',
  puntos: 'Puntos',
  monedero: 'Monedero',
  cheque: 'Cheque',
};
export const nombreDelMetodo = (clave: string): string => METODO[clave] ?? clave;

/** Cómo se dice cada movimiento del cajón en la cascada del efectivo esperado. */
const MOVIMIENTO: Readonly<Record<string, string>> = {
  apertura: 'Fondo de apertura',
  venta: 'Ventas en efectivo',
  propina: 'Propina en efectivo',
  deposito: 'Depósitos',
  entrada_cambio: 'Entradas de cambio',
  abono: 'Abonos de cuenta',
  anticipo_cita: 'Anticipos de cita',
  retiro: 'Retiros',
  gasto: 'Gastos pagados del cajón',
  devolucion: 'Devoluciones',
  ajuste: 'Ajustes',
};

// ── Las secciones comunes ───────────────────────────────────────────────────

export function folioDe(sesion: SesionDeLaHoja): string {
  return sesion.folio === null ? 'sin folio' : `${sesion.serie}-${sesion.folio}`;
}

export function datosDelCorte(hoja: HojaDelServidor, tipo: string): Seccion {
  const s = hoja.sesion;
  const celdas: Celda[] = [
    { etiqueta: 'Apertura', valor: fechaYHora(s.abiertaEn) },
    { etiqueta: 'Cierre', valor: fechaYHora(s.cerradaEn) },
    { etiqueta: 'Abrió', valor: texto(s.abrio) },
    { etiqueta: 'Cerró', valor: texto(s.cerro) },
    { etiqueta: 'Sucursal', valor: texto(s.sucursal) },
    { etiqueta: 'Terminal', valor: texto(s.terminal) },
    { etiqueta: 'Estado', valor: texto(s.estado === 'cerrada' ? 'Cerrado' : 'Abierto') },
    { etiqueta: 'Tipo', valor: texto(tipo) },
  ];
  if (s.turno !== null) celdas.push({ etiqueta: 'Turno', valor: texto(s.turno) });
  if (s.notasApertura !== null) {
    celdas.push({ etiqueta: 'Notas de apertura', valor: texto(s.notasApertura) });
  }
  if (s.notasCierre !== null) {
    celdas.push({ etiqueta: 'Notas de cierre', valor: texto(s.notasCierre) });
  }
  return { tipo: 'celdas', titulo: 'Datos del corte', celdas };
}

/** Lo que se dejó en el cajón: contado − retirado. `null` si el cierre no lo dijo. */
export function dejadoDe(sesion: SesionDeLaHoja): number | null {
  if (sesion.contadoCentavos === null || sesion.retiradoCentavos === null) return null;
  return centavos(sesion.contadoCentavos) - centavos(sesion.retiradoCentavos);
}

export function entradasDeCambio(hoja: HojaDelServidor): number {
  return hoja.movimientos
    .filter((m) => m.tipo === 'entrada_cambio')
    .reduce((suma, m) => suma + centavos(m.montoCentavos), 0);
}

/**
 * El arqueo: primero el fondo —el faltante que ya venía de anoche no es el de hoy—, luego
 * el efectivo, y en negritas lo que se deja, que es el fondo de mañana.
 */
export function arqueo(
  hoja: HojaDelServidor,
  titulo: string,
  opciones: { readonly desglose?: boolean } = {},
): readonly Seccion[] {
  const s = hoja.sesion;
  const cambio = entradasDeCambio(hoja);
  // El fondo esperado SUBE con cada entrada de cambio; la diferencia de apertura se mide
  // contra lo que se esperaba AL ABRIR.
  const esperadoAlAbrir = centavos(s.fondoEsperadoCentavos) - cambio;
  const celdas: Celda[] = [
    { etiqueta: 'Fondo esperado', valor: dinero(esperadoAlAbrir) },
    { etiqueta: 'Fondo contado', valor: dinero(s.fondoInicialCentavos) },
    {
      etiqueta: 'Diferencia de apertura',
      valor: dinero(centavos(s.fondoInicialCentavos) - esperadoAlAbrir),
      fuerte: true,
    },
  ];
  const desglosado = centavos(s.fondoChicosCentavos) > 0 || centavos(s.fondoGrandesCentavos) > 0;
  if (opciones.desglose === true && desglosado) {
    celdas.push(
      { etiqueta: 'Fondo en monedas', valor: dinero(s.fondoMonedasCentavos) },
      { etiqueta: 'Fondo en billetes chicos', valor: dinero(s.fondoChicosCentavos) },
      { etiqueta: 'Fondo en billetes grandes', valor: dinero(s.fondoGrandesCentavos) },
    );
  }
  if (cambio > 0) celdas.push({ etiqueta: 'Entradas de cambio', valor: dinero(cambio) });
  celdas.push(
    { etiqueta: 'Efectivo esperado', valor: dinero(s.esperadoCentavos) },
    { etiqueta: 'Efectivo contado', valor: dinero(s.contadoCentavos) },
    { etiqueta: 'Diferencia de efectivo', valor: dinero(s.diferenciaCentavos), fuerte: true },
    { etiqueta: 'Dinero dejado en caja', valor: dinero(dejadoDe(s)), fuerte: true },
  );
  const secciones: Seccion[] = [{ tipo: 'celdas', titulo, celdas }];
  const conteo = hoja.conteo.map((d) => [
    dinero(d.denominacionCentavos),
    texto(d.piezas),
    dinero(centavos(d.denominacionCentavos) * d.piezas),
  ]);
  secciones.push(
    ...tablaSiHay({
      tipo: 'tabla',
      titulo: 'Conteo por denominación',
      columnas: [
        { titulo: 'Denominación', numerica: true },
        { titulo: 'Piezas', numerica: true },
        { titulo: 'Importe', numerica: true },
      ],
      filas: conteo,
    }),
  );
  return secciones;
}

/** «De dónde salió el efectivo esperado»: una cascada, no una tabla. */
export function cascada(hoja: HojaDelServidor): readonly Seccion[] {
  if (hoja.movimientos.length === 0) return [];
  return [
    {
      tipo: 'cascada',
      titulo: 'De dónde salió el efectivo esperado',
      pasos: hoja.movimientos.map((m) => ({
        etiqueta: `${MOVIMIENTO[m.tipo] ?? m.tipo}${m.cuantos > 1 ? ` (${String(m.cuantos)})` : ''}`,
        centavos: centavos(m.montoCentavos),
      })),
      resultado: {
        etiqueta: 'Efectivo esperado',
        centavos:
          hoja.sesion.esperadoCentavos === null ? null : centavos(hoja.sesion.esperadoCentavos),
      },
    },
  ];
}

export const totalDeGastos = (hoja: HojaDelServidor): number =>
  hoja.gastos.reduce((suma, g) => suma + centavos(g.montoCentavos), 0);

/** El resumen financiero, sin propina. Con costos sólo si el servidor los mandó. */
export function resumenFinanciero(
  hoja: HojaDelServidor,
  titulo: string,
  antesDeLosMetodos: readonly Celda[] = [],
): Seccion {
  const r = hoja.resumen;
  const total = centavos(r.totalCentavos);
  const celdas: Celda[] = [
    { etiqueta: 'Total ventas', valor: dinero(total), fuerte: true },
    { etiqueta: 'Nº de tickets', valor: texto(r.tickets) },
    {
      etiqueta: 'Ticket promedio',
      valor: dinero(r.tickets === 0 ? 0 : Math.round(total / r.tickets)),
    },
    ...antesDeLosMetodos,
    ...hoja.metodos.map((m) => ({
      etiqueta: nombreDelMetodo(m.metodo),
      valor: dinero(m.ventasCentavos),
    })),
  ];
  if (centavos(r.descuentoCentavos) > 0) {
    celdas.push({ etiqueta: 'Descuentos', valor: dinero(r.descuentoCentavos) });
  }
  if (r.costoCentavos !== null) {
    const costo = centavos(r.costoCentavos);
    const gastos = totalDeGastos(hoja);
    celdas.push(
      { etiqueta: 'Costo de ventas', valor: dinero(costo) },
      { etiqueta: 'Utilidad bruta', valor: dinero(total - costo) },
      { etiqueta: 'Margen', valor: porcentaje(total - costo, total) },
      { etiqueta: 'Gastos operativos', valor: dinero(gastos) },
      { etiqueta: 'Utilidad neta estimada', valor: dinero(total - costo - gastos), fuerte: true },
    );
  }
  return { tipo: 'celdas', titulo, celdas };
}

export const totalDePropinas = (hoja: HojaDelServidor): number =>
  hoja.metodos.reduce((suma, m) => suma + centavos(m.propinasCentavos), 0);

/** Ventas, propinas y total por método: sólo si hubo propinas. */
export function metodosConPropina(hoja: HojaDelServidor): readonly Seccion[] {
  if (totalDePropinas(hoja) === 0) return [];
  const filas = hoja.metodos.map((m) => [
    texto(nombreDelMetodo(m.metodo)),
    dinero(m.ventasCentavos),
    dinero(m.propinasCentavos),
    dinero(centavos(m.ventasCentavos) + centavos(m.propinasCentavos)),
  ]);
  const ventas = hoja.metodos.reduce((suma, m) => suma + centavos(m.ventasCentavos), 0);
  const propinas = totalDePropinas(hoja);
  return [
    {
      tipo: 'tabla',
      titulo: 'Métodos de pago · ventas, propinas y total',
      columnas: [
        { titulo: 'Método' },
        { titulo: 'Ventas', numerica: true },
        { titulo: 'Propinas', numerica: true },
        { titulo: 'Total', numerica: true },
      ],
      filas,
      total: [texto('TOTAL'), dinero(ventas), dinero(propinas), dinero(ventas + propinas)],
    },
  ];
}

/** Detalle de ventas: con la referencia que se recuerda y la cantidad real de cada producto. */
export function detalleDeVentas(
  hoja: HojaDelServidor,
  referencia: {
    readonly titulo: string;
    readonly de: (v: HojaDelServidor['ventas'][number]) => string | null;
  },
  conCanal = false,
): readonly Seccion[] {
  const columnas: Columna[] = [
    { titulo: 'Folio' },
    { titulo: 'Hora' },
    { titulo: referencia.titulo },
  ];
  if (conCanal) columnas.push({ titulo: 'Canal' });
  columnas.push({ titulo: 'Productos' }, { titulo: 'Total', numerica: true }, { titulo: 'Pago' });
  return tablaSiHay({
    tipo: 'tabla',
    titulo: `Detalle de ventas (${String(hoja.ventas.length)})`,
    columnas,
    filas: hoja.ventas.map((v) => [
      texto(v.folio),
      hora(v.cobradaEn),
      texto(referencia.de(v)),
      ...(conCanal ? [texto(CANAL[v.canal] ?? v.canal)] : []),
      texto(v.productos),
      dinero(v.totalCentavos),
      texto(v.pago === null ? null : v.pago.split(' + ').map(nombreDelMetodo).join(' + ')),
    ]),
  });
}

export const CANAL: Readonly<Record<string, string>> = {
  aqui: 'En taza',
  llevar: 'Para llevar',
  plataforma: 'Plataforma',
  anticipado: 'Anticipado',
};

/** Productos vendidos: líneas y cantidad real, y costo y utilidad si se ven costos. */
export function productosVendidos(
  hoja: HojaDelServidor,
  titulo = 'Productos vendidos',
  cuales: readonly ProductoDeLaHoja[] = hoja.productos,
): readonly Seccion[] {
  const conCostos = hoja.verCostos;
  const columnas: Columna[] = [
    { titulo: 'Producto' },
    { titulo: 'Líneas', numerica: true },
    { titulo: 'Cantidad real', numerica: true },
    { titulo: 'Total', numerica: true },
  ];
  if (conCostos)
    columnas.push({ titulo: 'Costo', numerica: true }, { titulo: 'Utilidad', numerica: true });
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas,
    filas: cuales.map((p) => [
      texto(p.nombre),
      texto(p.lineas),
      texto(`${p.cantidad} ${p.unidad}`),
      dinero(p.totalCentavos),
      ...(conCostos
        ? [dinero(p.costoCentavos), dinero(centavos(p.totalCentavos) - centavos(p.costoCentavos))]
        : []),
    ]),
  });
}

/** Regla 2: el consumo de insumo es TEÓRICO, y el título lo dice. */
export function insumosConsumidos(
  hoja: HojaDelServidor,
  titulo = 'Ingredientes e insumos consumidos (teórico, según recetas)',
  cuales = hoja.insumos ?? [],
): readonly Seccion[] {
  if (hoja.insumos === null) return [];
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas: [
      { titulo: 'Insumo' },
      { titulo: 'Cantidad', numerica: true },
      { titulo: 'Unidad' },
      { titulo: 'Costo unitario', numerica: true },
      { titulo: 'Costo total', numerica: true },
    ],
    filas: cuales.map((i) => [
      texto(i.nombre),
      texto(i.cantidad),
      texto(i.unidad),
      dinero(i.costoUnitarioCentavos),
      dinero(i.costoCentavos),
    ]),
  });
}

export function gastos(hoja: HojaDelServidor, titulo = 'Gastos operativos'): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas: [
      { titulo: 'Categoría' },
      { titulo: 'Descripción' },
      { titulo: 'Pago' },
      { titulo: 'Monto', numerica: true },
    ],
    filas: hoja.gastos.map((g) => [
      texto(g.categoria),
      texto(g.descripcion),
      texto(nombreDelMetodo(g.metodo)),
      dinero(g.montoCentavos),
    ]),
    total: [texto('TOTAL'), texto(''), texto(''), dinero(totalDeGastos(hoja))],
  });
}

export const esCritica = (a: AlertaDeLaHoja): boolean => Number(a.existencia) <= Number(a.critico);

/** Inventario bajo: crítico o bajo, con la recomendación para mañana. */
export function inventarioBajo(
  hoja: HojaDelServidor,
  titulo = 'Inventario bajo o crítico',
  columnas: readonly Columna[] = [
    { titulo: 'Insumo' },
    { titulo: 'Existencia', numerica: true },
    { titulo: 'Mínimo', numerica: true },
    { titulo: 'Estado' },
    { titulo: 'Recomendación' },
  ],
  fila: (a: AlertaDeLaHoja) => readonly Valor[] = (a) => [
    texto(a.nombre),
    texto(`${a.existencia} ${a.unidad}`),
    texto(`${a.minimo} ${a.unidad}`),
    texto(esCritica(a) ? 'Crítico' : 'Bajo'),
    texto(esCritica(a) ? 'Comprar urgente' : 'Comprar pronto'),
  ],
  alertas: readonly AlertaDeLaHoja[] = hoja.alertas,
): readonly Seccion[] {
  return tablaSiHay({ tipo: 'tabla', titulo, columnas, filas: alertas.map(fila) });
}

/** Cancelaciones, siempre con usuario: la señal más clara de un problema de caja. */
export function cancelaciones(
  hoja: HojaDelServidor,
  titulo = 'Cancelaciones',
  extra: readonly (readonly Valor[])[] = [],
): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas: [
      { titulo: 'Folio' },
      { titulo: 'Hora' },
      { titulo: 'Qué' },
      { titulo: 'Usuario' },
      { titulo: 'Motivo' },
      { titulo: 'Monto', numerica: true },
    ],
    filas: [
      ...hoja.cancelaciones.map((c) => [
        texto(c.folio),
        hora(c.hora),
        texto(c.tipo === 'orden' ? 'Cuenta completa' : (c.producto ?? 'Producto')),
        texto(c.usuario),
        texto(c.motivo),
        dinero(c.montoCentavos),
      ]),
      ...extra,
    ],
  });
}

export function descuentosPorUsuario(hoja: HojaDelServidor): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Descuentos otorgados, por usuario',
    columnas: [
      { titulo: 'Usuario' },
      { titulo: 'Ventas', numerica: true },
      { titulo: 'Monto', numerica: true },
    ],
    filas: hoja.descuentosPorUsuario.map((d) => [
      texto(d.usuario),
      texto(d.ventas),
      dinero(d.montoCentavos),
    ]),
  });
}

/** Merma y consumo de la casa: el dinero que salió sin venta. */
export function salidasSinVenta(hoja: HojaDelServidor, titulo: string): readonly Seccion[] {
  const conCostos = hoja.verCostos;
  const columnas: Columna[] = [
    { titulo: 'Producto' },
    { titulo: 'Cantidad', numerica: true },
    { titulo: 'Motivo' },
    { titulo: 'Quién' },
  ];
  if (conCostos) columnas.push({ titulo: 'Costo', numerica: true });
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas,
    filas: hoja.salidasSinVenta.map((s) => [
      texto(s.nombre),
      texto(`${s.cantidad} ${s.unidad}`),
      texto(
        s.tipo === 'merma'
          ? (s.motivo ?? 'Merma')
          : `Consumo de la casa${s.motivo === null ? '' : ` · ${s.motivo}`}`,
      ),
      texto(s.quien),
      ...(conCostos ? [dinero(s.costoCentavos)] : []),
    ]),
  });
}

/** Venta y margen por categoría (o por línea, en la ferretería). */
export function ventaPorCategoria(
  hoja: HojaDelServidor,
  titulo: string,
  rotulo: string,
): readonly Seccion[] {
  const porCategoria = new Map<string, { venta: number; costo: number }>();
  for (const p of hoja.productos) {
    const clave = p.categoria ?? 'Sin categoría';
    const actual = porCategoria.get(clave) ?? { venta: 0, costo: 0 };
    porCategoria.set(clave, {
      venta: actual.venta + centavos(p.totalCentavos),
      costo: actual.costo + centavos(p.costoCentavos),
    });
  }
  const total = centavos(hoja.resumen.totalCentavos);
  const conCostos = hoja.verCostos;
  const columnas: Columna[] = [{ titulo: rotulo }, { titulo: 'Venta', numerica: true }];
  if (conCostos)
    columnas.push({ titulo: 'Costo', numerica: true }, { titulo: 'Margen', numerica: true });
  columnas.push({ titulo: '% del día', numerica: true });
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas,
    filas: [...porCategoria.entries()]
      .sort((a, b) => b[1].venta - a[1].venta)
      .map(([nombre, { venta, costo }]) => [
        texto(nombre),
        dinero(venta),
        ...(conCostos ? [dinero(costo), porcentaje(venta - costo, venta)] : []),
        porcentaje(venta, total),
      ]),
  });
}

/** El nombre del archivo: negocio, tipo y folio, sin acentos ni espacios. */
export function nombreDeArchivo(negocio: string, tipo: string, folio: string): string {
  const limpio = `${negocio}-${tipo}-${folio}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${limpio}.pdf`;
}
