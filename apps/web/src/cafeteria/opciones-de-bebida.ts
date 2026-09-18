import { ErrorApi } from '~/cliente/api';

/**
 * F-027 · Los modificadores de la bebida: lo que decide QUÉ SE COBRA.
 *
 * ── Por qué esto vive aparte de la pantalla ──────────────────────────────
 * Porque el resto de `OpcionesDeLaBebida.tsx` pinta y esto suma. Un delta que
 * no entra al total es una leche de avena que se regala cuarenta veces al día,
 * y no falla: sale el ticket, el cliente paga, y el margen se va sin que nadie
 * vea un error. Separarlo es lo que permite probarlo con números concretos.
 *
 * ── Y por qué el agrupado también ────────────────────────────────────────
 * Porque la opción por omisión de un grupo AGOTADO tiene que dejar de estar
 * marcada. Si sigue marcada, el barista prepara con leche entera la bebida de
 * quien pidió deslactosada — que en este giro no es un descuadre: es un cliente
 * que no vuelve.
 */

/** La jerarquía la fija el documento: 1 Leche · 2 Tamaño · 3 Temperatura · 4 Extras. */
const ORDEN_GRUPOS = ['Leche', 'Tamaño', 'Temperatura', 'Extras'] as const;

export interface OpcionDeBebida {
  readonly id: string;
  readonly grupo: string;
  readonly nombre: string;
  readonly delta_precio_centavos: number | null;
  readonly por_omision: boolean;
  readonly agotado: boolean;
  /** El grupo admite varias a la vez. Viaja por fila: el puente devuelve filas planas. */
  readonly varias: boolean;
}

export interface GrupoDeOpciones {
  readonly nombre: string;
  readonly varias: boolean;
  readonly opciones: readonly OpcionDeBebida[];
}

/** Agrupa las filas planas del puente y las ordena por la jerarquía del documento. */
export function agrupar(filas: readonly OpcionDeBebida[]): readonly GrupoDeOpciones[] {
  const porNombre = new Map<string, OpcionDeBebida[]>();
  for (const fila of filas) {
    const lista = porNombre.get(fila.grupo);
    if (lista === undefined) porNombre.set(fila.grupo, [fila]);
    else lista.push(fila);
  }
  const posicion = (nombre: string): number => {
    const indice = ORDEN_GRUPOS.findIndex((g) => g === nombre);
    return indice === -1 ? ORDEN_GRUPOS.length : indice;
  };
  return [...porNombre.entries()]
    .map(([nombre, opciones]) => ({ nombre, varias: opciones.some((o) => o.varias), opciones }))
    .sort((a, b) => posicion(a.nombre) - posicion(b.nombre));
}

/** La marcada, salvo que se haya agotado; si nadie marcó, la primera que haya. */
export function porOmisionDe(grupo: GrupoDeOpciones): string | null {
  const disponibles = grupo.opciones.filter((o) => !o.agotado);
  const marcada = disponibles.find((o) => o.por_omision);
  if (marcada !== undefined) return marcada.id;
  return grupo.varias ? null : (disponibles[0]?.id ?? null);
}

/** El total que va dentro del botón: la base más cada delta activo. */
export function totalCentavos(base: number, activas: readonly OpcionDeBebida[]): number {
  return activas.reduce((suma, opcion) => suma + (opcion.delta_precio_centavos ?? 0), base);
}

export function pesos(centavos: number): string {
  return `$ ${(centavos / 100).toFixed(2)}`;
}

/** `+22` se dice en voz alta; `+22.00` se lee. Los centavos sólo salen si los hay. */
export function etiquetaDelta(centavos: number): string | null {
  if (centavos === 0) return null;
  const absoluto = Math.abs(centavos);
  const cuerpo = absoluto % 100 === 0 ? absoluto / 100 : (absoluto / 100).toFixed(2);
  return `${centavos > 0 ? '+' : '−'}$${cuerpo}`;
}

/** El límite de intentos no es un código de la API: es el 429 del estado. */
export function mensajeDeFallo(fallo: unknown): string {
  if (!(fallo instanceof ErrorApi)) return 'No se pudo hablar con el servidor.';
  if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
  switch (fallo.error.codigo) {
    case 'SIN_PERMISO':
    case 'PAQUETE_NO_INCLUYE':
      return 'Tu usuario no puede agregar bebidas con opciones.';
    case 'NO_ENCONTRADO':
      return 'Esta bebida ya no está en el catálogo.';
    case 'CONFLICTO_ESTADO':
      return 'El pedido ya se cobró: abre uno nuevo.';
    default:
      return fallo.error.mensaje;
  }
}
