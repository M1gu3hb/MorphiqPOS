/**
 * Las mutaciones que validan los contratos y las pruebas de la venta.
 *
 * Cada entrada reintroduce una regresión REAL en el archivo REAL. Un contrato
 * que no se ha visto fallar no se sabe si funciona.
 *
 * · `contrato`  ⇒ debe hacer fallar ese contrato por nombre.
 * · `pruebas`   ⇒ debe hacer fallar la suite de vitest.
 * · `inocuas`   ⇒ cambio sin significado; TODO debe seguir en verde.
 */

const COBRAR = 'packages/app/src/venta/cobrar.ts';
const PAGOS = 'packages/app/src/venta/pagos.ts';
const ESCALA = 'packages/app/src/venta/escala.ts';
const TOTALES = 'packages/domain/src/venta/totales.ts';
const CIERRE = 'packages/data/src/repos/ordenes/cierre.ts';
const FOLIOS = 'packages/data/src/repos/folios.ts';
const CAJA_REPO = 'packages/data/src/repos/caja.ts';
const CAJA_CMD = 'packages/app/src/caja/sesion.ts';
const RUTA = 'packages/app/src/http/ruta.ts';
const ESQUEMAS = 'packages/app/src/venta/esquemas.ts';

/** Destructivas que deben hacer FALLAR a un contrato con nombre. */
export const contraContratos = [
  {
    nombre: 'tomar el folio antes de descontar el stock',
    ruta: COBRAR,
    contrato: 'stock_antes_de_folio',
    antes: "await ctx.paso('descontar_stock', () =>",
    despues: "await ctx.paso('zzz_stock_tarde', () =>",
  },
  {
    nombre: 'cotizar fuera de la transacción del cobro',
    ruta: COBRAR,
    contrato: 'cotiza_dentro_de_la_transaccion',
    antes: 'cotizar(ctx.tx, organizacionId, entrada.ordenId)',
    despues: 'cotizar(await obtenerDb(), organizacionId, entrada.ordenId)',
  },
  {
    nombre: 'cobrar sin comprobar que el total sigue vigente',
    ruta: COBRAR,
    contrato: 'exige_total_vigente',
    antes: 'exigirTotalVigente(totales.totalCentavos, entrada.totalEsperadoCentavos);',
    despues: 'void entrada.totalEsperadoCentavos;',
  },
  {
    nombre: 'cobrar con la caja cerrada',
    ruta: COBRAR,
    contrato: 'no_cobra_sin_caja',
    antes: "throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de cobrar.');",
    despues: 'void sesion;',
  },
  {
    nombre: 'aceptar pagos que superen el total',
    ruta: PAGOS,
    contrato: 'pago_suma_exacta',
    antes: 'if (suma !== totalCentavos) {',
    despues: 'if (suma < totalCentavos) {',
  },
  {
    nombre: 'devolver cambio en tarjeta',
    ruta: PAGOS,
    contrato: 'cambio_solo_en_efectivo',
    antes: 'cambioCentavos: 0n,\n        referencia: pago.referencia ?? null,',
    despues:
      'cambioCentavos: recibido === null ? 0n : recibido - monto,\n        referencia: pago.referencia ?? null,',
  },
  {
    nombre: 'cobrar dos veces la misma orden (quitando la guarda)',
    ruta: CIERRE,
    contrato: 'marcar_pagada_guarda_estado_cobrable',
    antes: "    .where('estado', 'in', [...ESTADOS_COBRABLES])\n",
    despues: '',
  },
  {
    // La misma consecuencia por el camino silencioso: la guarda sigue escrita,
    // pero deja pasar una orden ya pagada. Un contrato que sólo mirase el
    // `.where(...)` daría verde con el cobro doble reabierto.
    nombre: 'cobrar dos veces admitiendo «pagada» como estado cobrable',
    ruta: CIERRE,
    contrato: 'marcar_pagada_guarda_estado_cobrable',
    antes: "  'cuenta_solicitada',\n] as const;",
    despues: "  'cuenta_solicitada',\n  'pagada',\n] as const;",
  },
  {
    nombre: 'tomar el folio leyendo y luego escribiendo',
    ruta: FOLIOS,
    contrato: 'folio_atomico',
    antes: 'returning siguiente - 1',
    despues: 'returning siguiente',
  },
  {
    nombre: 'esperar «fondo + ventas en efectivo» (no resta los retiros)',
    ruta: CAJA_REPO,
    contrato: 'esperado_es_la_suma_de_movimientos',
    antes: 'efectivoEsperadoCentavos: aBigint(movimientos?.suma),',
    despues: 'efectivoEsperadoCentavos: sesion.fondoInicialCentavos,',
  },
  {
    nombre: 'leer el esperado de una columna almacenada',
    ruta: CAJA_REPO,
    contrato: 'arqueo_no_lee_totales_almacenados',
    antes: "    .select(['fondo_inicial_centavos as fondoInicialCentavos'])",
    despues:
      "    .select(['fondo_inicial_centavos as fondoInicialCentavos', 'total_ventas as tv'])",
  },
  {
    nombre: 'abrir la caja sin registrar el fondo como movimiento',
    ruta: CAJA_CMD,
    contrato: 'apertura_registra_el_fondo',
    antes: "      tipo: 'apertura',",
    despues: "      tipo: 'ajuste',",
  },
  {
    nombre: 'cobrar en efectivo sin registrar el movimiento de caja',
    ruta: COBRAR,
    contrato: 'cobro_registra_el_efectivo_en_caja',
    antes: "        tipo: 'venta',",
    despues: "        tipo: 'ajuste',",
  },
  {
    nombre: 'cerrar la caja antes de derivar su arqueo',
    ruta: CAJA_CMD,
    contrato: 'arqueo_dentro_del_cierre',
    antes: "ctx.paso('derivar_arqueo'",
    despues: "ctx.paso('zzz_arqueo_tarde'",
  },
  {
    nombre: 'aceptar GET en una ruta de comando',
    ruta: RUTA,
    contrato: 'ruta_de_comando_solo_post',
    antes: "if (peticion.method !== 'POST') {",
    despues: "if (peticion.method === 'TRACE') {",
  },
  {
    nombre: 'dejar que el cliente mande el precio de la línea',
    ruta: ESQUEMAS,
    contrato: 'agregar_linea_no_acepta_importes',
    antes: '  cantidad: cantidadDecimal,\n  /** Para productos por medida',
    despues:
      '  cantidad: cantidadDecimal,\n  precioUnitarioCentavos: centavosNoNegativos.optional(),\n  /** Para productos por medida',
  },
];

/** Destructivas que deben hacer FALLAR la suite de pruebas. */
export const contraPruebas = [
  {
    nombre: 'cobrar de menos aceptando que falte dinero',
    ruta: PAGOS,
    antes: 'if (suma !== totalCentavos) {',
    despues: 'if (suma > totalCentavos) {',
  },
  {
    nombre: 'no comprobar que el efectivo recibido alcance',
    ruta: PAGOS,
    antes: 'if (recibido !== null && recibido < monto) {',
    despues: 'if (false) {',
  },
  {
    nombre: 'aceptar un renglón de pago en cero',
    ruta: PAGOS,
    antes: 'if (monto <= 0n) {',
    despues: 'if (monto < 0n) {',
  },
  {
    nombre: 'truncar la cantidad a entero (media res costaría cero)',
    ruta: ESCALA,
    antes: 'const escalada = aDiezmilesimas(cantidad);',
    despues: 'const escalada = (aDiezmilesimas(cantidad) / ESCALA_CANTIDAD) * ESCALA_CANTIDAD;',
  },
  {
    nombre: 'redondear el medio centavo hacia abajo',
    ruta: ESCALA,
    antes: '(absoluto * 2n + ESCALA_CANTIDAD) / (ESCALA_CANTIDAD * 2n)',
    despues: 'absoluto / ESCALA_CANTIDAD',
  },
  {
    nombre: 'perder el signo en una devolución',
    ruta: ESCALA,
    antes: 'return centavos(negativo ? -redondeado : redondeado);',
    despues: 'return centavos(redondeado);',
  },
  {
    nombre: 'sumar el IVA en vez de extraerlo de un precio que ya lo incluye',
    ruta: TOTALES,
    antes: 'impuesto.incluidoEnPrecio',
    despues: 'false',
  },
  {
    nombre: 'dejar que el descuento haga el total negativo',
    ruta: TOTALES,
    antes: 'mayor(descuento, subtotal) ? subtotal : descuento',
    despues: 'descuento',
  },
];

/**
 * Inocuas: reordenar, renombrar un local, añadir una línea en blanco.
 *
 * Si una de estas rompiera algo, el contrato estaría atado a la forma del
 * código y no a su propiedad, y castigaría un cambio legítimo.
 */
export const inocuas = [
  {
    nombre: 'una línea en blanco de más en el cobro',
    ruta: COBRAR,
    antes: 'export const cobrarOrden',
    despues: '\nexport const cobrarOrden',
  },
  {
    nombre: 'partir la guarda del estado cobrable en varias líneas',
    ruta: CIERRE,
    antes: "    .where('estado', 'in', [...ESTADOS_COBRABLES])",
    despues: "    .where(\n      'estado',\n      'in',\n      [...ESTADOS_COBRABLES],\n    )",
  },
  {
    nombre: 'renombrar un local del reparto de pagos',
    ruta: PAGOS,
    antes: 'const validados: PagoValidado[] = [];',
    despues: 'const acumulados: PagoValidado[] = [];',
    tambien: [
      ['validados.push(', 'acumulados.push('],
      ['return validados;', 'return acumulados;'],
    ],
  },
];
