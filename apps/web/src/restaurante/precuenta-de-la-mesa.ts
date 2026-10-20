/**
 * LA PRECUENTA QUE EL SERVIDOR CALCULÓ AL PEDIR LA CUENTA (día completo del restaurante, 2.4).
 * La hoja que se arma con ella vive en `hoja-de-la-precuenta.ts`.
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * La hoja que el mesero entrega al comensal salía SIN total: «Subtotal —, IVA —, TOTAL —»,
 * sin folio y con «Imprimir» apagado, porque el total de una `Venta` es de rol caja
 * (`rolesLectura: CAJA`) y la hoja lo leía de ahí. El mesero es quien pide la cuenta, quien
 * la imprime y quien la lleva a la mesa: la pantalla de su propio oficio no le servía. El
 * servidor SÍ se lo había dicho —`solicitar_cuenta` devuelve la precuenta completa, calculada
 * con el mismo código del cobro— y la pantalla lo tiraba al navegar.
 *
 * Lo que se guarda aquí es lo que el SERVIDOR contestó, no una suma del navegador: la hoja
 * enseña los números del cobro. Y lo que la hoja imprime al final lo vuelve a decir el
 * servidor (`imprimir_precuenta`), que manda sobre lo guardado.
 *
 * ── Dónde se guarda ──────────────────────────────────────────────────────────
 * En `sessionStorage` de la pestaña: dura lo que dura la mesa en la tableta y se va con ella,
 * no cruza a otro dispositivo ni a otra persona. Si no hay almacén (modo privado, cuota), la
 * hoja sigue funcionando: el total llega al imprimir.
 */

import type { OpcionDePropina } from './propina-de-la-mesa.ts';

/** Qué se dice de la propina en la hoja. */
export type PropinaDeLaHoja =
  | { readonly tipo: 'porcentaje'; readonly puntosBase: number; readonly importeCentavos: number }
  | { readonly tipo: 'sin_propina' }
  | { readonly tipo: 'a_definir' };

/** Lo que el servidor calculó al pedir la cuenta, en centavos enteros. */
export interface PrecuentaDeLaMesa {
  readonly ordenId: string;
  readonly codigoCaja: string;
  readonly mesaNumero: number | null;
  readonly subtotalCentavos: number;
  readonly descuentoCentavos: number;
  readonly impuestosCentavos: number;
  readonly totalCentavos: number;
  readonly propina: PropinaDeLaHoja;
}

/** Lo mínimo de un `Storage`: así se prueba sin navegador. */
export interface AlmacenMinimo {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

const CLAVE = 'morphiqpos:precuenta:';

/** Un importe que el servidor sirve como texto de BigInt: `'88300'` → `88300`. */
export function centavosDelTexto(valor: unknown): number | null {
  if (typeof valor !== 'string' || !/^\d{1,15}$/.test(valor)) return null;
  return Number(valor);
}

export function esRegistro(valor: unknown): valor is Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null;
}

function propinaDe(opcion: OpcionDePropina, sugeridaCentavos: number): PropinaDeLaHoja {
  if (opcion.tipo === 'sin_propina') return { tipo: 'sin_propina' };
  if (opcion.tipo === 'porcentaje' && opcion.puntosBase !== undefined) {
    return {
      tipo: 'porcentaje',
      puntosBase: opcion.puntosBase,
      importeCentavos: sugeridaCentavos,
    };
  }
  return { tipo: 'a_definir' };
}

/**
 * La respuesta de `restaurante.solicitar_cuenta`, validada. Si le falta algo que la hoja
 * necesita, devuelve `null` y la hoja espera al servidor al imprimir: nunca se inventa un
 * total para que la pantalla se vea completa.
 */
export function precuentaDeLaRespuesta(
  respuesta: unknown,
  opcion: OpcionDePropina,
): PrecuentaDeLaMesa | null {
  if (!esRegistro(respuesta)) return null;
  const { ordenId, codigoCaja, mesaNumero } = respuesta;
  const subtotal = centavosDelTexto(respuesta['subtotalCentavos']);
  const descuento = centavosDelTexto(respuesta['descuentoCentavos']);
  const impuestos = centavosDelTexto(respuesta['impuestosCentavos']);
  const total = centavosDelTexto(respuesta['totalCentavos']);
  const sugerida = centavosDelTexto(respuesta['propinaSugeridaCentavos']) ?? 0;
  if (typeof ordenId !== 'string' || ordenId === '') return null;
  if (typeof codigoCaja !== 'string' || codigoCaja === '') return null;
  if (subtotal === null || descuento === null || impuestos === null || total === null) return null;
  return {
    ordenId,
    codigoCaja,
    mesaNumero: typeof mesaNumero === 'number' ? mesaNumero : null,
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    impuestosCentavos: impuestos,
    totalCentavos: total,
    propina: propinaDe(opcion, sugerida),
  };
}

export function guardarPrecuenta(
  precuenta: PrecuentaDeLaMesa,
  almacen: AlmacenMinimo | null,
): boolean {
  if (almacen === null) return false;
  try {
    almacen.setItem(`${CLAVE}${precuenta.ordenId}`, JSON.stringify(precuenta));
    return true;
  } catch {
    // Cuota llena o almacén bloqueado: la hoja no depende de esto, el total llega al imprimir.
    return false;
  }
}

function propinaGuardada(valor: unknown): PropinaDeLaHoja | null {
  if (!esRegistro(valor)) return null;
  if (valor['tipo'] === 'sin_propina') return { tipo: 'sin_propina' };
  if (valor['tipo'] === 'a_definir') return { tipo: 'a_definir' };
  const { puntosBase, importeCentavos } = valor;
  if (
    valor['tipo'] === 'porcentaje' &&
    typeof puntosBase === 'number' &&
    typeof importeCentavos === 'number' &&
    Number.isSafeInteger(puntosBase) &&
    Number.isSafeInteger(importeCentavos)
  ) {
    return { tipo: 'porcentaje', puntosBase, importeCentavos };
  }
  return null;
}

/** Lo guardado de ESA cuenta, o `null`. Lo que no tiene la forma esperada no se usa. */
export function leerPrecuentaGuardada(
  ordenId: string,
  almacen: AlmacenMinimo | null,
): PrecuentaDeLaMesa | null {
  if (almacen === null) return null;
  let texto: string | null;
  try {
    texto = almacen.getItem(`${CLAVE}${ordenId}`);
  } catch {
    // Almacén bloqueado: se trata como «no hay nada guardado», y la hoja espera al servidor.
    return null;
  }
  if (texto === null) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    // Un valor que no es JSON no es nuestro: se ignora y el servidor vuelve a decir los totales.
    return null;
  }
  if (!esRegistro(crudo) || crudo['ordenId'] !== ordenId) return null;
  const propina = propinaGuardada(crudo['propina']);
  const { codigoCaja, mesaNumero } = crudo;
  const cifras = [
    crudo['subtotalCentavos'],
    crudo['descuentoCentavos'],
    crudo['impuestosCentavos'],
    crudo['totalCentavos'],
  ];
  if (propina === null || typeof codigoCaja !== 'string') return null;
  if (!cifras.every((c): c is number => typeof c === 'number' && Number.isSafeInteger(c))) {
    return null;
  }
  const [subtotal, descuento, impuestos, total] = cifras;
  if (
    subtotal === undefined ||
    descuento === undefined ||
    impuestos === undefined ||
    total === undefined
  ) {
    return null;
  }
  return {
    ordenId,
    codigoCaja,
    mesaNumero: typeof mesaNumero === 'number' ? mesaNumero : null,
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    impuestosCentavos: impuestos,
    totalCentavos: total,
    propina,
  };
}

/** El almacén de la pestaña, o `null` si el navegador no deja tocarlo. */
export function almacenDeLaPestana(): AlmacenMinimo | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Acceder a `sessionStorage` lanza en algunos modos de privacidad: sin almacén.
    return null;
  }
}
