import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * LAS CUENTAS VIVAS QUE IMPIDEN CERRAR EL DÍA, sin pantalla (día completo del restaurante, 2.4).
 *
 * `02-DINERO-Y-CAJA` §9: cerrar con una cuenta viva deja esa venta fuera del corte, y eso no lo
 * cuadra nadie después. El muro del cierre decide con esta lista. Tenía dos fallos que sólo un
 * día entero de servicio destapa:
 *
 *  · **Contaba la mesa, no la cuenta.** Toda mesa con `venta_activa_id` bloqueaba, y una mesa
 *    cobrada NO suelta su cuenta: pasa a limpieza con `orden_activa_id` apuntando a la orden
 *    ya pagada (es lo que deja saber de qué cuenta viene mientras se recoge). Con ocho mesas
 *    cobradas el muro decía «hay ocho mesas con cuenta abierta» sobre un día sin un solo peso
 *    por cobrar, y el cierre no se podía hacer jamás. Una cuenta pagada, cancelada o dividida
 *    ya no es una cuenta viva.
 *  · **No veía lo que ya no cuelga de una mesa.** Las partes de una cuenta dividida son cuentas
 *    pedidas que la caja todavía tiene que cobrar y no son la cuenta activa de ninguna mesa:
 *    se podía cerrar con la mitad de una mesa sin pagar.
 */

/** La venta tal como la nombra el puente; los importes van en PESOS (`centavosDe`). */
export interface CuentaParaElCierre {
  readonly id: string;
  readonly estado: string | null;
  readonly total: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly fecha_apertura: string | null;
  /** Lo que nombra a una parte de una cuenta dividida: «Mesa 5 · cuenta 1 de 2». */
  readonly cliente_nombre?: string | null;
}

export interface MesaParaElCierre {
  readonly id: string;
  readonly numero: number | null;
  readonly venta_activa_id: string | null;
  readonly mesero_asignado_nombre: string | null;
}

export interface MesaQueBloquea {
  readonly id: string;
  readonly rotulo: string;
  readonly mesero: string;
  readonly total: number;
  readonly abierta: string;
}

/**
 * Los estados en los que una cuenta ya no espera nada de la caja: cobrada (aunque después se
 * devolviera), cancelada, repartida en partes o absorbida por otra mesa. Cualquier otro la
 * deja viva, y lo que no se reconoce BLOQUEA: cerrar de más cuesta un clic, cerrar con una
 * cuenta viva cuesta un descuadre.
 */
const CUENTA_SALDADA: readonly string[] = [
  'pagada',
  'parcialmente_reembolsada',
  'reembolsada',
  'cancelada',
  'dividida',
  'absorbida',
];

function estaViva(cuenta: CuentaParaElCierre | undefined): boolean {
  return cuenta === undefined || !CUENTA_SALDADA.includes(cuenta.estado ?? '');
}

/** Cuánto lleva abierta, en palabras: el dato se lee, nunca se infiere. */
export function desdeHace(iso: string | null, ahora: number): string {
  if (iso === null) return 'sin dato';
  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'recién';
  if (minutos < 60) return `${String(minutos)} min`;
  return `${String(Math.floor(minutos / 60))} h ${String(minutos % 60)} min`;
}

/** Las cuentas vivas del salón, con las cuatro columnas que pide el documento. */
export function mesasQueBloquean(
  cuentas: readonly CuentaParaElCierre[],
  mesas: readonly MesaParaElCierre[],
  ahora: number,
): readonly MesaQueBloquea[] {
  const porId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
  const deMesas = new Set<string>();

  const enMesas = mesas.flatMap((mesa): readonly MesaQueBloquea[] => {
    if (mesa.venta_activa_id === null) return [];
    const viva = porId.get(mesa.venta_activa_id);
    if (!estaViva(viva)) return [];
    deMesas.add(mesa.venta_activa_id);
    return [
      {
        id: mesa.id,
        rotulo: mesa.numero === null ? 'Sin número' : `Mesa ${String(mesa.numero)}`,
        mesero: viva?.usuario_mesero_nombre ?? mesa.mesero_asignado_nombre ?? 'sin mesero',
        total: centavosDe('Venta', 'total', viva?.total) ?? 0,
        abierta: desdeHace(viva?.fecha_apertura ?? null, ahora),
      },
    ];
  });

  // Las que no cuelgan de ninguna mesa: las partes de una cuenta dividida.
  const sueltas = cuentas
    .filter((cuenta) => !CUENTA_SALDADA.includes(cuenta.estado ?? '') && !deMesas.has(cuenta.id))
    // Se reconocen por su nombre —«Mesa 5 · cuenta 1 de 2»—: una cuenta viva sin mesa y sin
    // nombre es un carrito de otro flujo, y ése no lo cuenta el salón.
    .filter((cuenta) => (cuenta.cliente_nombre ?? '').trim() !== '')
    .map((cuenta): MesaQueBloquea => ({
      id: cuenta.id,
      rotulo: (cuenta.cliente_nombre ?? '').trim(),
      mesero: cuenta.usuario_mesero_nombre ?? 'sin mesero',
      total: centavosDe('Venta', 'total', cuenta.total) ?? 0,
      abierta: desdeHace(cuenta.fecha_apertura, ahora),
    }));

  return [...enMesas, ...sueltas];
}
