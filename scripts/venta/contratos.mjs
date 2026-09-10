/**
 * Contratos de la venta: propiedades que se afirman sobre el USO, no sobre un
 * identificador suelto.
 *
 * Cada contrato recorta primero el trozo que importa —el cuerpo de la función,
 * no el archivo entero— y afirma sobre él sin comentarios. Un identificador que
 * aparece también en una firma, un `import` o un comentario haría que borrar el
 * que importa dejara vivos los demás, y el contrato pasaría mintiendo.
 *
 * Los que hablan de ORDEN comparan índices, nunca distancia en caracteres.
 */
import { readFileSync } from 'node:fs';

const COBRAR = 'packages/app/src/venta/cobrar.ts';
const PAGOS = 'packages/app/src/venta/pagos.ts';
const CIERRE = 'packages/data/src/repos/ordenes/cierre.ts';
const FOLIOS = 'packages/data/src/repos/folios.ts';
const CAJA_REPO = 'packages/data/src/repos/caja.ts';
const CAJA_CMD = 'packages/app/src/caja/sesion.ts';
const RUTA = 'packages/app/src/http/ruta.ts';
const ESQUEMAS = 'packages/app/src/venta/esquemas.ts';

/** Quita comentarios y cadenas de plantilla vacías, conservando el código. */
export function sinComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Recorta el cuerpo de un bloque emparejando llaves desde `marca`.
 *
 * No corta en el primer `}` ni cuenta caracteres: cuenta llaves. Es la
 * diferencia entre recortar la función y recortar hasta el `};` de una
 * plantilla que va dentro.
 */
export function cuerpo(codigo, marca, submarca) {
  const inicio = codigo.indexOf(marca);
  if (inicio === -1) return null;
  // `submarca` existe porque una firma puede traer su propio `{`: el tipo de
  // objeto de un parámetro. Sin ella, `marcarPagada` recortaba la lista de
  // parámetros y el contrato fallaba señalando algo que sí estaba.
  const desde = submarca === undefined ? inicio : codigo.indexOf(submarca, inicio);
  if (desde === -1) return null;
  const abre = codigo.indexOf('{', desde);
  if (abre === -1) return null;
  let nivel = 0;
  for (let i = abre; i < codigo.length; i += 1) {
    if (codigo[i] === '{') nivel += 1;
    else if (codigo[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return codigo.slice(abre, i + 1);
    }
  }
  return null;
}

function leer(ruta) {
  return sinComentarios(readFileSync(ruta, 'utf8'));
}

/**
 * El valor asignado a `campo:` dentro de un objeto literal, hasta su coma.
 *
 * Recortar el campo y no el archivo es lo que hace que este contrato distinga
 * «el esperado se calcula así» de «esa palabra aparece por ahí».
 */
export function valorDeCampo(codigo, campo) {
  const inicio = codigo.indexOf(`${campo}:`);
  if (inicio === -1) return null;
  const desde = inicio + campo.length + 1;
  let nivel = 0;
  for (let i = desde; i < codigo.length; i += 1) {
    const ch = codigo[i];
    if (ch === '(' || ch === '[' || ch === '{') nivel += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (nivel === 0) return codigo.slice(desde, i);
      nivel -= 1;
    } else if (ch === ',' && nivel === 0) return codigo.slice(desde, i);
  }
  return null;
}

/** `antes` ocurre antes que `despues` dentro del mismo recorte. */
function ordena(texto, antes, despues) {
  const a = texto.indexOf(antes);
  const b = texto.indexOf(despues);
  return a !== -1 && b !== -1 && a < b;
}

export const contratos = [
  {
    nombre: 'stock_antes_de_folio',
    ruta: COBRAR,
    porque:
      'Si el folio se tomara primero, cada venta sin inventario se comería un consecutivo y dejaría un hueco que nadie sabe explicar.',
    comprobar() {
      const c = cuerpo(leer(COBRAR), 'async ejecutar(ctx, entrada)');
      return c !== null && ordena(c, "'descontar_stock'", "'tomar_folio'");
    },
  },
  {
    nombre: 'cotiza_dentro_de_la_transaccion',
    ruta: COBRAR,
    porque:
      'Cotizar fuera de la transacción cobra el total de una lectura anterior, no el de las líneas que congela.',
    comprobar() {
      const c = cuerpo(leer(COBRAR), 'async ejecutar(ctx, entrada)');
      return c !== null && c.includes('cotizar(ctx.tx,');
    },
  },
  {
    nombre: 'exige_total_vigente',
    ruta: COBRAR,
    porque:
      'Sin esta comprobación se le cobra al cliente un número distinto del que el cajero le dijo, en silencio.',
    comprobar() {
      const c = cuerpo(leer(COBRAR), 'async ejecutar(ctx, entrada)');
      return c !== null && /exigirTotalVigente\(\s*totales\.totalCentavos,\s*entrada\./.test(c);
    },
  },
  {
    nombre: 'no_cobra_sin_caja',
    ruta: COBRAR,
    porque:
      'El efectivo de una venta sin sesión de caja no tiene dónde registrarse y el arqueo nace incompleto.',
    comprobar() {
      const c = cuerpo(leer(COBRAR), 'async ejecutar(ctx, entrada)');
      return c !== null && ordena(c, "'CAJA_CERRADA'", "'tomar_folio'");
    },
  },
  {
    nombre: 'pago_suma_exacta',
    ruta: PAGOS,
    porque:
      'Con «al menos el total», el sobrante se queda en la caja sin registrar y el arqueo sale sobrado sin origen.',
    comprobar() {
      const c = cuerpo(leer(PAGOS), 'export function repartirPagos');
      return c !== null && c.includes('suma !== totalCentavos');
    },
  },
  {
    nombre: 'cambio_solo_en_efectivo',
    ruta: PAGOS,
    porque: 'Devolver cambio de una tarjeta es regalar dinero: el banco cobró el importe completo.',
    comprobar() {
      const c = cuerpo(leer(PAGOS), 'export function repartirPagos');
      if (c === null) return false;
      const rama = cuerpo(c, "if (pago.metodo !== 'efectivo')");
      return (
        rama !== null &&
        rama.includes('cambioCentavos: 0n') &&
        rama.includes('recibidoCentavos: null')
      );
    },
  },
  {
    nombre: 'marcar_pagada_guarda_estado_cobrable',
    ruta: CIERRE,
    porque:
      'Sin la guarda en el WHERE, dos cobros concurrentes de la misma orden se pisan y el segundo cobra otra vez.',
    /**
     * Este contrato se llamaba `marcar_pagada_guarda_borrador` y comprobaba
     * `.where('estado', '=', 'borrador')`. En 922cc23 la guarda se amplió a
     * `in ESTADOS_COBRABLES` para admitir el cobro parcial, y el contrato se
     * quedó mirando una forma que ya no existía: `verify:venta` llevaba desde
     * entonces cayéndose con «contratos rotos antes de mutar», así que las
     * NUEVE mutaciones de venta no se ejercitaban.
     *
     * Ahora afirma sobre el invariante, no sobre la sintaxis: hay guarda, se
     * comprueba el resultado, y el conjunto de estados cobrables no admite uno
     * ya cerrado —que es la forma silenciosa de reabrir el cobro doble, porque
     * la guarda seguiría estando ahí, de adorno—.
     */
    comprobar() {
      const fuente = leer(CIERRE);
      const c = cuerpo(fuente, 'export async function marcarPagada', '): Promise<void>');
      if (c === null) return false;

      // La coma final opcional no es un capricho: partir la llamada en varias
      // líneas es un cambio legítimo, y un contrato que lo castiga acaba
      // desactivado por quien formatea el archivo.
      const hayGuarda = /\.where\(\s*'estado'\s*,\s*'in'\s*,\s*\[[^\]]*\]\s*,?\s*\)/.test(c);
      // Filtrar sin mirar cuántas filas cambiaron es no filtrar: el segundo
      // cobro no actualizaría nada y seguiría adelante como si hubiera cobrado.
      const seComprueba = /numUpdatedRows\)\s*!==\s*1/.test(c);

      const lista = /export const ESTADOS_COBRABLES\s*=\s*\[([\s\S]*?)\]\s*as const;/.exec(
        fuente,
      )?.[1];
      const YA_CERRADOS = ['pagada', 'parcialmente_pagada', 'cancelada'];
      const conjuntoLimpio =
        lista !== undefined && !YA_CERRADOS.some((estado) => lista.includes(`'${estado}'`));

      return hayGuarda && seComprueba && conjuntoLimpio;
    },
  },
  {
    nombre: 'folio_atomico',
    ruta: FOLIOS,
    porque:
      'Leer el folio y luego escribirlo en dos sentencias deja que dos cajas tomen el mismo número.',
    comprobar() {
      const c = cuerpo(leer(FOLIOS), 'export async function tomarFolio');
      if (c === null) return false;
      return (
        /siguiente\s*=\s*siguiente\s*\+\s*1/.test(c) && /returning\s+siguiente\s*-\s*1/.test(c)
      );
    },
  },
  {
    nombre: 'esperado_es_la_suma_de_movimientos',
    ruta: CAJA_REPO,
    porque:
      'La fórmula «fondo + ventas en efectivo» cuenta el fondo dos veces y NO resta los retiros: el cajero que sacó dinero con permiso aparece con un faltante.',
    comprobar() {
      const c = cuerpo(
        leer(CAJA_REPO),
        'export async function arqueoDeSesion',
        '): Promise<ArqueoDerivado>',
      );
      if (c === null) return false;
      const expresion = valorDeCampo(c, 'efectivoEsperadoCentavos');
      // Se afirma sobre el VALOR del campo, no sobre el archivo: `movimientos`
      // y `fondoInicialCentavos` aparecen los dos varias veces en la función.
      return (
        expresion !== null &&
        expresion.includes('movimientos') &&
        !expresion.includes('fondoInicial')
      );
    },
  },
  {
    nombre: 'arqueo_no_lee_totales_almacenados',
    ruta: CAJA_REPO,
    porque:
      'P2-10: en la fuente había columnas de total que nadie actualizaba al cobrar, y el corte mostraba ceros con la caja llena.',
    comprobar() {
      const c = cuerpo(
        leer(CAJA_REPO),
        'export async function arqueoDeSesion',
        '): Promise<ArqueoDerivado>',
      );
      return c !== null && !/total_ventas|total_efectivo|efectivo_esperado/.test(c);
    },
  },
  {
    nombre: 'apertura_registra_el_fondo',
    ruta: CAJA_CMD,
    porque:
      'El esperado es la suma de movimientos. Si el fondo no entra como movimiento de apertura, el corte pide de menos por esa cantidad.',
    comprobar() {
      const c = cuerpo(leer(CAJA_CMD), 'entrada: entradaAbrirCaja');
      return c !== null && /registrarMovimiento\([\s\S]*?tipo: 'apertura'/.test(c);
    },
  },
  {
    nombre: 'cobro_registra_el_efectivo_en_caja',
    ruta: COBRAR,
    porque:
      'Sin el movimiento de venta, el efectivo cobrado no llega al arqueo y el corte marca un sobrante que nadie sabe de dónde salió.',
    comprobar() {
      const c = cuerpo(leer(COBRAR), 'async ejecutar(ctx, entrada)');
      return c !== null && /registrarMovimiento\([\s\S]*?tipo: 'venta'/.test(c);
    },
  },
  {
    nombre: 'arqueo_dentro_del_cierre',
    ruta: CAJA_CMD,
    porque:
      'Derivar el arqueo antes de cerrar deja fuera del corte cualquier venta cobrada en ese hueco.',
    comprobar() {
      const c = cuerpo(leer(CAJA_CMD), 'entrada: entradaCerrarCaja');
      return c !== null && ordena(c, "'derivar_arqueo'", "'cerrar_sesion'");
    },
  },
  {
    nombre: 'ruta_de_comando_solo_post',
    ruta: RUTA,
    porque:
      'Un GET que cambia estado es lo que hace posible un CSRF por <img src> (morphiq-prs §10A).',
    comprobar() {
      const c = cuerpo(leer(RUTA), 'async function manejar(peticion');
      return (
        c !== null && /peticion\.method !== 'POST'/.test(c) && ordena(c, '405', 'resolverSesion')
      );
    },
  },
  {
    nombre: 'agregar_linea_no_acepta_importes',
    ruta: ESQUEMAS,
    porque:
      'P0-07: si la entrada aceptara un precio, el cliente elegiría cuánto paga. El precio lo pone el catálogo.',
    comprobar() {
      const c = cuerpo(leer(ESQUEMAS), 'export const entradaAgregarLinea');
      return c !== null && !/entavos|precio|importe|total|descuento/i.test(c);
    },
  },
];

export const rutasVigiladas = [...new Set(contratos.map((c) => c.ruta))];
