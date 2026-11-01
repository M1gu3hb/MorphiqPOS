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
  /** `false`: el negocio ya no lo ofrece; al enviar se quita. Sin el campo, cuenta como sí. */
  readonly disponible?: boolean;
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
  /**
   * Lo que el servidor quitó del carrito porque ya no se podía pedir. Falta en la respuesta de un
   * servidor anterior, o en la de un reintento que se guardó antes de desplegar.
   */
  readonly noDisponibles?: readonly string[];
}

export interface AvisoDelEnvio {
  readonly tono: 'exito' | 'aviso';
  readonly texto: string;
}

/** «Taco», «Taco y Flan», «Taco, Flan y Café». */
function enLista(nombres: readonly string[]): string {
  return nombres.length <= 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1] ?? ''}`;
}

/**
 * Lo que se le dice al comensal después de «Enviar». Si el negocio ocultó algo que ya estaba en
 * el carrito, el servidor lo quita y manda lo demás: aquí se nombra lo que no se envió.
 */
export function avisoDelEnvio(resultado: ResultadoDelEnvio): AvisoDelEnvio {
  const fuera = resultado.noDisponibles ?? [];
  if (fuera.length === 0) {
    // Vacío al llegar: otro teléfono lo mandó, o el envío de otro quitó lo que ya no había.
    return {
      tono: 'exito',
      texto: resultado.enviado
        ? '¡Pedido enviado a cocina!'
        : 'Ya no había nada que enviar: lo mandó otro teléfono o se quitó del pedido.',
    };
  }
  const motivo =
    fuera.length === 1
      ? 'ya no está disponible y se quitó del pedido.'
      : 'ya no están disponibles y se quitaron del pedido.';
  return {
    tono: 'aviso',
    texto: resultado.enviado
      ? `Pedido enviado sin ${enLista(fuera)}: ${motivo}`
      : `No se envió nada: ${enLista(fuera)} ${motivo}`,
  };
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

/**
 * `'0.25'` × `42000` → `10500`: el subtotal para enseñar; lo que se cobra lo decide la caja. Lo
 * que ya no está disponible no cuenta: no se va a enviar.
 */
export function subtotalAproximadoCentavos(lineas: readonly LineaDelCarrito[]): number {
  return lineas
    .filter((l) => l.disponible !== false)
    .reduce((suma, l) => suma + Math.round(Number(l.cantidad) * Number(l.precioCentavos)), 0);
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
