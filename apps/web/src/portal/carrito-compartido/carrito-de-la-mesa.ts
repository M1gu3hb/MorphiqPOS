/**
 * EL CARRITO COMPARTIDO DE LA MESA, del lado del teléfono (DP-9.5): el id del teléfono, la
 * forma de lo que responde el servidor y lo que se le enseña al comensal. Puro salvo el id,
 * que se guarda en el navegador.
 */

import { idAlAzar } from '~/cliente/id-al-azar';

export interface LineaDelCarrito {
  readonly id: string;
  readonly productoId: string;
  readonly nombre: string;
  readonly cantidad: string;
  readonly notas: string;
  readonly precioCentavos: string;
  readonly esMia: boolean;
}

export interface EstadoDelCarrito {
  readonly lineas: readonly LineaDelCarrito[];
  readonly conectados: number;
  readonly personas: number;
  readonly esperarATodos: boolean;
  readonly ronda: number;
  readonly ultimoEnvio: { readonly en: string; readonly porEsteTelefono: boolean } | null;
}

export interface ResultadoDelEnvio {
  readonly enviado: boolean;
  readonly ronda: number;
}

/** Lo que se manda de un platillo: nunca su precio (lo pone el servidor). */
export interface ItemDelCarrito {
  readonly productoId: string;
  readonly cantidad: string;
  readonly notas: string;
}

const CLAVE = 'morphiqpos_portal_dispositivo';
const FORMA = /^[A-Za-z0-9_-]{16,64}$/;
let enLaPestana: string | null = null;

function guardado(): string | null {
  try {
    const valor = window.localStorage.getItem(CLAVE);
    return valor !== null && FORMA.test(valor) ? valor : null;
  } catch {
    // Navegación privada estricta: sin almacenamiento, el id vive sólo en esta pestaña.
    return null;
  }
}

/**
 * El id de este teléfono para el carrito de la mesa: se inventa una vez y se recuerda. No es
 * nada del comensal; en el servidor sólo se guarda su huella.
 */
export function dispositivoDelTelefono(): string {
  const conocido = enLaPestana ?? guardado();
  if (conocido !== null) {
    enLaPestana = conocido;
    return conocido;
  }
  // Por http (la red del local) no hay `randomUUID`: `idAlAzar` (DP-D37) arma el mismo UUID.
  const nuevo = idAlAzar().replaceAll('-', '');
  enLaPestana = nuevo;
  try {
    window.localStorage.setItem(CLAVE, nuevo);
  } catch {
    // Sin almacenamiento sigue sirviendo en la pestaña; al recargar será otro teléfono.
    enLaPestana = nuevo;
  }
  return nuevo;
}

/** `'0.25'` × `42000` → `10500`: el subtotal para enseñar; lo que se cobra lo decide la caja. */
export function subtotalAproximadoCentavos(lineas: readonly LineaDelCarrito[]): number {
  return lineas.reduce(
    (suma, l) => suma + Math.round(Number(l.cantidad) * Number(l.precioCentavos)),
    0,
  );
}

export function personasConectadas(n: number): string {
  return n === 1 ? '1 persona conectada' : `${String(n)} personas conectadas`;
}

/** Subió la ronda y no fue este teléfono: alguien más mandó el pedido. */
export function envioDeOtroTelefono(rondaVista: number | null, estado: EstadoDelCarrito): boolean {
  return (
    rondaVista !== null &&
    estado.ronda > rondaVista &&
    estado.ultimoEnvio !== null &&
    !estado.ultimoEnvio.porEsteTelefono
  );
}
