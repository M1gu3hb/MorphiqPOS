/**
 * LA NOTA DEL MOSTRADOR, que sobrevive a ir y volver (C.10 de la 2.4).
 *
 * El mostrador arma la nota en memoria de la pestaña. Abrir la ficha de una pieza (F5),
 * cortar material (F6) o dar de alta lo que no hay la desmontaba: al volver, la nota
 * estaba vacía —el comentario del alta decía lo contrario—. Y la ficha tenía su propio
 * AGREGAR A LA VENTA que escribía una venta del servidor que ninguna pantalla enseñaba.
 *
 * Ahora la nota vive en `sessionStorage` —de ESTA pestaña, se borra al cerrarla— y la
 * ficha le deja al mostrador lo que hay que agregar. Es comodidad del mostradorista, no
 * un registro: lo que se cobra lo valora el servidor al mandar la nota a caja.
 */

export interface PresentacionElegida {
  readonly id: string;
  /** «Caja (100)»: como la dice la ficha. */
  readonly etiqueta: string;
  /** Su precio, o nulo: entonces el que ponga el servidor con el factor. */
  readonly precioCentavos: number | null;
}

export interface PartidaGuardada {
  readonly productoId: string;
  readonly cantidad: number;
  readonly presentacion: PresentacionElegida | null;
}

const CLAVE_NOTA = 'morphiqpos.ferreteria.nota-del-mostrador';
const CLAVE_POR_AGREGAR = 'morphiqpos.ferreteria.por-agregar';

function esPresentacion(valor: unknown): valor is PresentacionElegida {
  if (typeof valor !== 'object' || valor === null) return false;
  const p = valor as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' &&
    typeof p['etiqueta'] === 'string' &&
    (p['precioCentavos'] === null || Number.isSafeInteger(p['precioCentavos']))
  );
}

/** Lo guardado, validado: lo que no tiene forma de partida se descarta, no revienta. */
export function partidasGuardadas(texto: string | null): PartidaGuardada[] {
  if (texto === null) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((item: unknown): PartidaGuardada[] => {
    if (typeof item !== 'object' || item === null) return [];
    const p = item as Record<string, unknown>;
    const cantidad = p['cantidad'];
    if (typeof p['productoId'] !== 'string' || typeof cantidad !== 'number') return [];
    if (!Number.isFinite(cantidad) || cantidad <= 0) return [];
    const presentacion = p['presentacion'] ?? null;
    if (presentacion !== null && !esPresentacion(presentacion)) return [];
    return [{ productoId: p['productoId'], cantidad, presentacion }];
  });
}

/** La clave de una partida: la misma pieza en caja y suelta son dos renglones. */
export function claveDePartida(productoId: string, presentacion: PresentacionElegida | null) {
  return `${productoId}:${presentacion?.id ?? 'base'}`;
}

/** Suma lo que llega a lo que ya hay: la misma pieza en la misma forma se junta. */
export function sumarPartida(
  partidas: readonly PartidaGuardada[],
  nueva: PartidaGuardada,
): PartidaGuardada[] {
  const clave = claveDePartida(nueva.productoId, nueva.presentacion);
  const ya = partidas.find((p) => claveDePartida(p.productoId, p.presentacion) === clave);
  if (ya === undefined) return [...partidas, nueva];
  return partidas.map((p) => (p === ya ? { ...p, cantidad: p.cantidad + nueva.cantidad } : p));
}

/** `sessionStorage` puede no estar —vista previa, modo privado—: se vive sin él. */
function almacen(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function leerLaNota(): PartidaGuardada[] {
  try {
    return partidasGuardadas(almacen()?.getItem(CLAVE_NOTA) ?? null);
  } catch {
    return [];
  }
}

export function guardarLaNota(partidas: readonly PartidaGuardada[]): void {
  try {
    const lugar = almacen();
    if (lugar === null) return;
    if (partidas.length === 0) lugar.removeItem(CLAVE_NOTA);
    else lugar.setItem(CLAVE_NOTA, JSON.stringify(partidas));
  } catch {
    // Sin almacén la nota vive mientras la pantalla esté abierta, como antes.
  }
}

/** La ficha le deja al mostrador lo que hay que agregar. */
export function dejarParaElMostrador(partida: PartidaGuardada): void {
  try {
    almacen()?.setItem(CLAVE_POR_AGREGAR, JSON.stringify([partida]));
  } catch {
    // Sin almacén no se puede llevar: la ficha lo dice.
  }
}

/** El mostrador lo toma UNA vez: leerlo lo borra. */
export function tomarLoDeLaFicha(): PartidaGuardada | null {
  try {
    const lugar = almacen();
    if (lugar === null) return null;
    const [partida] = partidasGuardadas(lugar.getItem(CLAVE_POR_AGREGAR));
    lugar.removeItem(CLAVE_POR_AGREGAR);
    return partida ?? null;
  } catch {
    return null;
  }
}

/**
 * El precio de una presentación sin precio propio: factor × el de la pieza, al centavo
 * y medio hacia arriba, con enteros. Para ENSEÑAR el total mientras se arma; el que se
 * cobra lo pone el servidor.
 */
export function precioPorFactor(precioBaseCentavos: number, factor: number): number {
  const factorEnDiezmilesimas = BigInt(Math.round(factor * 10_000));
  return Number((BigInt(precioBaseCentavos) * factorEnDiezmilesimas + 5_000n) / 10_000n);
}
