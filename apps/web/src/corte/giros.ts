import {
  CANAL,
  arqueo,
  cancelaciones,
  centavos,
  datosDelCorte,
  detalleDeVentas,
  dinero,
  folioDe,
  gastos,
  hora,
  insumosConsumidos,
  esCritica,
  inventarioBajo,
  metodosConPropina,
  nombreDeArchivo,
  porcentaje,
  productosVendidos,
  resumenFinanciero,
  tablaSiHay,
  texto,
  totalDePropinas,
  type Columna,
  type DocumentoDelCorte,
  type ExtrasDelServidor,
  type HojaDelServidor,
  type Seccion,
  type Valor,
} from './hoja.ts';
import { corteDeFerreteria, corteDeTienda } from './giros-mostrador.ts';
import { corteDeEstetica } from './giros-salon.ts';

/**
 * LOS CINCO CORTES, cada uno con SU contenido (C.6 de la 2.4).
 *
 * Cada función sigue, en orden, el §9.3 de su `02-DINERO-Y-CAJA.md`. Lo que se repite vive
 * en `hoja.ts`; aquí está lo que cada giro pregunta y en qué orden lo lee quien cierra:
 *   · restaurante — ¿cuadró la caja, y cuánto le toca a cada mesero?
 *   · cafetería   — ¿cuadró, cuánto se fue en leche, café y vaso, y cuánto hay en el bote?
 *   · tienda      — ¿cuadró, de dónde salió el esperado y cómo va el fiado?
 *   · ferretería  — ¿cuadró, y cuánto salió hoy sin cobrarse?
 *   · estética    — ¿cuadró, cuánto le toca a cada profesional y cómo viene mañana?
 */

type Extras<P extends ExtrasDelServidor['plantilla']> = Extract<
  ExtrasDelServidor,
  { plantilla: P }
>;

function documento(
  hoja: HojaDelServidor,
  titulo: string,
  secciones: readonly Seccion[],
  firmaDeCaja = 'Responsable de caja',
): DocumentoDelCorte {
  const folio = folioDe(hoja.sesion);
  return {
    titulo,
    negocio: hoja.negocio,
    folio,
    secciones,
    firmaDeCaja,
    responsable: hoja.sesion.cerro,
    nombreDeArchivo: nombreDeArchivo(hoja.negocio.nombre, titulo, folio),
  };
}

// ── Restaurante ─────────────────────────────────────────────────────────────

export function corteDeRestaurante(
  hoja: HojaDelServidor,
  extras: Extras<'restaurante'>,
): DocumentoDelCorte {
  const propinas = totalDePropinas(hoja);
  const ventas = centavos(hoja.resumen.totalCentavos);
  const seccionesDePropina: Seccion[] =
    propinas === 0
      ? []
      : [
          {
            tipo: 'celdas',
            titulo: 'Propinas',
            celdas: [
              { etiqueta: 'Total propinas', valor: dinero(propinas), fuerte: true },
              { etiqueta: 'Ventas reales sin propina', valor: dinero(ventas) },
              {
                etiqueta: 'Total cobrado con propina',
                valor: dinero(ventas + propinas),
                fuerte: true,
              },
            ],
          },
          ...tablaSiHay({
            tipo: 'tabla',
            titulo: 'Propinas por mesero',
            columnas: [
              { titulo: 'Mesero' },
              { titulo: 'Cuentas', numerica: true },
              { titulo: 'Propinas', numerica: true },
            ],
            filas: extras.propinasPorMesero.map((m) => [
              texto(m.mesero ?? 'Sin mesero'),
              texto(m.cuentas),
              dinero(m.propinaCentavos),
            ]),
          }),
        ];
  return documento(hoja, 'CORTE DE CAJA', [
    datosDelCorte(hoja, 'Cierre diario'),
    ...arqueo(hoja, 'Apertura y fondo'),
    resumenFinanciero(hoja, 'Resumen financiero (sin propinas)'),
    ...metodosConPropina(hoja),
    ...seccionesDePropina,
    ...detalleDeVentas(hoja, {
      titulo: 'Mesa',
      de: (v) => [v.mesa, v.cliente].filter((x) => x !== null).join(' · ') || null,
    }),
    ...productosVendidos(hoja),
    ...insumosConsumidos(hoja),
    ...gastos(hoja),
    ...inventarioBajo(hoja),
    ...cancelaciones(hoja),
  ]);
}

// ── Cafetería ───────────────────────────────────────────────────────────────

/** El orden fijo del consumo de una cafetería: café, leche, lo demás, y el empaque aparte. */
export function ordenDeBarra(nombre: string): number {
  const n = nombre.toLowerCase();
  if (/caf[eé]|grano|espresso/.test(n)) return 0;
  if (/leche|avena|almendra|deslactosada/.test(n)) return 1;
  if (/vaso|tapa|popote|manga|bolsa|empaque|charola/.test(n)) return 3;
  return 2;
}

export function corteDeCafeteria(
  hoja: HojaDelServidor,
  extras: Extras<'cafeteria'>,
): DocumentoDelCorte {
  const bebidas = hoja.productos
    .filter((p) => p.familia === 'bebida')
    .reduce((suma, p) => suma + Number(p.cantidad), 0);
  const total = centavos(hoja.resumen.totalCentavos);

  const propinaEfectivo = centavos(
    hoja.metodos.find((m) => m.metodo === 'efectivo')?.propinasCentavos,
  );
  const propinaOtra = totalDePropinas(hoja) - propinaEfectivo;
  const bote = hoja.sesion.boteContadoCentavos;
  const seccionesDelBote: Seccion[] =
    bote === null && totalDePropinas(hoja) === 0
      ? []
      : [
          {
            tipo: 'celdas',
            titulo: 'Bote del turno y su reparto',
            celdas: [
              { etiqueta: 'Bote contado (efectivo)', valor: dinero(bote) },
              { etiqueta: 'Esperado en el bote', valor: dinero(propinaEfectivo) },
              {
                etiqueta: 'Diferencia del bote',
                valor: dinero(bote === null ? null : centavos(bote) - propinaEfectivo),
                fuerte: true,
              },
              { etiqueta: 'Propina de tarjeta y transferencia', valor: dinero(propinaOtra) },
              {
                etiqueta: 'Total a repartir',
                valor: dinero((bote === null ? propinaEfectivo : centavos(bote)) + propinaOtra),
                fuerte: true,
              },
            ],
          },
          ...tablaSiHay({
            tipo: 'tabla',
            titulo: 'Reparto por horas presentes',
            columnas: [
              { titulo: 'Persona' },
              { titulo: 'Horas', numerica: true },
              { titulo: 'Importe', numerica: true },
            ],
            filas: extras.reparto.map((r) => [
              texto(r.persona),
              texto(r.minutos === null ? null : (r.minutos / 60).toFixed(1)),
              dinero(r.montoCentavos),
            ]),
          }),
        ];

  const insumos = [...(hoja.insumos ?? [])].sort(
    (a, b) => ordenDeBarra(a.nombre) - ordenDeBarra(b.nombre),
  );
  const empaque = insumos.filter((i) => ordenDeBarra(i.nombre) === 3);
  const ingredientes = insumos.filter((i) => ordenDeBarra(i.nombre) !== 3);

  const sellos = extras.sellos;
  const seccionesDeSellos: Seccion[] =
    sellos.otorgados === 0 && sellos.canjes === 0 && Number(sellos.sellosVivos) === 0
      ? []
      : [
          {
            tipo: 'celdas',
            titulo: 'Sellos y canjes',
            celdas: [
              { etiqueta: 'Sellos otorgados en el turno', valor: texto(sellos.otorgados) },
              {
                etiqueta: 'Canjes del turno',
                valor: texto(
                  `${String(sellos.canjes)} · costo ${pesos(sellos.costoCanjesCentavos)}`,
                ),
              },
              {
                etiqueta: 'Sellos pendientes de canje (todo el programa)',
                valor: texto(sellos.sellosVivos),
                fuerte: true,
              },
              {
                etiqueta: 'Costo si se canjearan todos',
                valor: dinero(
                  Math.floor(Number(sellos.sellosVivos) / sellos.sellosPorPremio) *
                    centavos(sellos.costoPremioCentavos),
                ),
                fuerte: true,
              },
            ],
          },
        ];

  const noRecogidos: (readonly Valor[])[] = extras.noRecogidos.map((n) => [
    texto('—'),
    hora(n.horaPrometida),
    texto(`No recogido · ${n.nombre}`),
    texto(null),
    texto(
      n.costoCentavos === null
        ? 'No se recogió'
        : `No se recogió · insumo perdido ${pesos(n.costoCentavos)}`,
    ),
    dinero(n.totalCentavos),
  ]);

  return documento(
    hoja,
    'CORTE DE TURNO',
    [
      datosDelCorte(hoja, 'Corte de turno'),
      ...arqueo(hoja, 'Apertura, fondo y cambio', { desglose: true }),
      resumenFinanciero(hoja, 'Resumen financiero (sin propinas)', [
        { etiqueta: 'Bebidas vendidas', valor: texto(bebidas) },
        {
          etiqueta: 'Bebidas por ticket',
          valor: texto(
            hoja.resumen.tickets === 0 ? null : (bebidas / hoja.resumen.tickets).toFixed(2),
          ),
        },
      ]),
      ...tablaSiHay({
        tipo: 'tabla',
        titulo: 'Ventas por canal',
        columnas: [
          { titulo: 'Canal' },
          { titulo: 'Pedidos', numerica: true },
          { titulo: 'Unidades', numerica: true },
          { titulo: 'Importe', numerica: true },
          { titulo: 'Empaque consumido', numerica: true },
          { titulo: '% del total', numerica: true },
        ],
        filas: extras.canales.map((c) => [
          texto(CANAL[c.canal] ?? c.canal),
          texto(c.pedidos),
          texto(c.unidades),
          dinero(c.importeCentavos),
          texto(empaqueDelCanal(extras, c.canal)),
          porcentaje(centavos(c.importeCentavos), total),
        ]),
      }),
      ...metodosConPropina(hoja),
      ...seccionesDelBote,
      ...detalleDeVentas(
        hoja,
        { titulo: 'Nombre del pedido', de: (v) => v.nombrePedido ?? v.cliente },
        true,
      ),
      ...productosConModificadores(hoja, extras),
      ...insumosConsumidos(
        hoja,
        'Insumos consumidos (teórico): café, leche y lo demás',
        ingredientes,
      ),
      ...insumosConsumidos(hoja, 'Empaque consumido (teórico)', empaque),
      ...tablaSiHay({
        tipo: 'tabla',
        titulo: 'Merma de barra del turno',
        columnas: [
          { titulo: 'Motivo' },
          { titulo: 'Insumo' },
          { titulo: 'Cantidad', numerica: true },
          { titulo: 'Costo', numerica: true },
        ],
        filas: extras.mermaDeBarra.map((m) => [
          texto(m.motivo),
          texto(m.insumo),
          texto(`${m.cantidad} ${m.unidad}`),
          dinero(hoja.verCostos ? m.costoCentavos : null),
        ]),
      }),
      ...tablaSiHay({
        tipo: 'tabla',
        titulo: 'Consumo del personal y cortesías',
        columnas: [
          { titulo: 'Tipo' },
          { titulo: 'Producto' },
          { titulo: 'Cantidad', numerica: true },
          { titulo: 'Costo', numerica: true },
          { titulo: 'Quién lo autorizó' },
        ],
        filas: extras.consumoDeLaCasa.map((c) => [
          texto(c.tipo),
          texto(c.producto),
          texto(`${c.cantidad} ${c.unidad}`),
          dinero(hoja.verCostos ? c.costoCentavos : null),
          texto(c.autorizo),
        ]),
      }),
      ...seccionesDeSellos,
      ...gastos(hoja),
      ...inventarioBajo(
        hoja,
        'Inventario bajo o crítico',
        [
          { titulo: 'Insumo' },
          { titulo: 'Existencia', numerica: true },
          { titulo: 'Días que alcanza', numerica: true },
          { titulo: 'Estado' },
          { titulo: 'Recomendación' },
        ],
        (a) => [
          texto(a.nombre),
          texto(`${a.existencia} ${a.unidad}`),
          texto(a.diasQueAlcanza === null ? 'sin consumo' : String(a.diasQueAlcanza)),
          texto(esCritica(a) ? 'Crítico' : 'Bajo'),
          texto(
            a.diasQueAlcanza !== null && a.diasQueAlcanza <= 1 ? 'Comprar hoy' : 'Comprar pronto',
          ),
        ],
      ),
      ...cancelaciones(hoja, 'Cancelaciones y no recogidos', noRecogidos),
    ],
    'Responsable del turno',
  );
}

/** Las unidades de empaque que salieron por un canal: los vasos de «para llevar». */
export function empaqueDelCanal(extras: Extras<'cafeteria'>, canal: string): string | null {
  const piezas = extras.consumoPorCanal
    .filter((c) => c.canal === canal && ordenDeBarra(c.insumo) === 3)
    .reduce((suma, c) => suma + Number(c.cantidad), 0);
  return piezas === 0 ? null : String(Math.round(piezas * 1000) / 1000);
}

/** Productos por utilidad, con los dos modificadores más usados de cada uno. */
function productosConModificadores(
  hoja: HojaDelServidor,
  extras: Extras<'cafeteria'>,
): readonly Seccion[] {
  const conCostos = hoja.verCostos;
  const columnas: Columna[] = [
    { titulo: 'Producto' },
    { titulo: 'Modificadores más usados' },
    { titulo: 'Unidades', numerica: true },
    { titulo: 'Total', numerica: true },
  ];
  if (conCostos) {
    columnas.push({ titulo: 'Costo', numerica: true }, { titulo: 'Utilidad', numerica: true });
  }
  return tablaSiHay({
    tipo: 'tabla',
    titulo: 'Productos vendidos',
    columnas,
    filas: hoja.productos.map((p) => [
      texto(p.nombre),
      texto(
        extras.modificadores
          .filter((m) => m.producto === p.nombre)
          .slice(0, 2)
          .map((m) => `${String(m.veces)} ${m.opcion}`)
          .join(', ') || null,
      ),
      texto(p.cantidad),
      dinero(p.totalCentavos),
      ...(conCostos
        ? [dinero(p.costoCentavos), dinero(centavos(p.totalCentavos) - centavos(p.costoCentavos))]
        : []),
    ]),
  });
}

// ── Cuál ────────────────────────────────────────────────────────────────────

export function documentoDelCorte(hoja: HojaDelServidor): DocumentoDelCorte {
  const extras = hoja.extras;
  switch (extras.plantilla) {
    case 'restaurante':
      return corteDeRestaurante(hoja, extras);
    case 'cafeteria':
      return corteDeCafeteria(hoja, extras);
    case 'estetica':
      return documento(hoja, 'CORTE DEL DÍA', corteDeEstetica(hoja, extras));
    case 'ferreteria':
      return documento(hoja, 'CORTE DE CAJA', corteDeFerreteria(hoja, extras));
    case 'tienda':
      return documento(hoja, 'CORTE DE CAJA', corteDeTienda(hoja, extras));
  }
}

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
function pesos(centavosEnTexto: string): string {
  return PESOS.format(centavos(centavosEnTexto) / 100);
}
