/**
 * LOS HUECOS QUE SE OFRECEN AL AGENDAR, del SERVIDOR (F-404, F-415; C.10 de la 2.4).
 *
 * ── Por qué dejaron de calcularse aquí ───────────────────────────────────
 * La pantalla restaba las citas a una rejilla de 9 a 19, cada cita ocupando un bloque de
 * 60 minutos «por omisión» porque el puente no sabe leer los rangos de la 132. El servidor
 * sí: `agenda.huecos` recorta las ventanas del horario de cada persona con sus tramos
 * activos reales, los bloqueos y el procesado que libera a la estilista. Ofrecer aquí un
 * hueco que el servidor no ve es ofrecer una hora que `agenda.agendar_cita` rechaza.
 *
 * ── Y cuánto dura el servicio, de sus tramos ──────────────────────────────
 * Aplicación, procesado y terminado —la secuencia de `servicios` (F-415)—, al ritmo de
 * QUIEN lo da: Karla hace el tinte en el 80 % y Dany en el 110 % (`servicios_profesional`).
 * Antes salía de `tiempo_preparacion_estimado`, un número que el catálogo del salón no
 * escribe.
 */

export const DURACION_POR_OMISION_MIN = 60;
/** Los que caben en una pantalla sin desplazar. */
export const HUECOS_QUE_CABEN = 6;
/** Más de dos por día y la clienta ya no elige: se abruma. */
export const MAX_POR_DIA = 2;

export interface ServicioConTiempos {
  readonly tiempo_preparacion_estimado?: number | null;
  readonly duracion_activa_1_min?: number | null;
  readonly duracion_pasiva_min?: number | null;
  readonly duracion_activa_2_min?: number | null;
}

/**
 * Los minutos que el hueco tiene que tener para este servicio con esta persona: los tres
 * tramos, al factor de quien lo da. Sin tramos, lo estimado; sin nada, una hora. Entre 5 y
 * 600, lo que `agenda.huecos` acepta.
 */
export function minutosDelServicio(servicio: ServicioConTiempos, factorBp = 10_000): number {
  const tramos =
    (servicio.duracion_activa_1_min ?? 0) +
    (servicio.duracion_pasiva_min ?? 0) +
    (servicio.duracion_activa_2_min ?? 0);
  const base =
    tramos > 0 ? tramos : (servicio.tiempo_preparacion_estimado ?? DURACION_POR_OMISION_MIN);
  const escalados = Math.round((base * factorBp) / 10_000);
  return Math.min(600, Math.max(5, escalados));
}

export interface HuecoDelServidor {
  readonly profesionalId: string;
  readonly inicio: string;
}

export interface Hueco {
  readonly profesionalId: string;
  readonly inicio: Date;
}

function diaDe(fecha: Date): string {
  return `${String(fecha.getFullYear())}-${String(fecha.getMonth())}-${String(fecha.getDate())}`;
}

/**
 * Los primeros que se ofrecen: en orden, a lo más dos por día y `cuantos` en total. El
 * servidor devuelve la VENTANA libre; se ofrece su inicio, que es la hora que se le dice a
 * la clienta.
 */
export function huecosParaOfrecer(
  huecos: readonly HuecoDelServidor[],
  cuantos = HUECOS_QUE_CABEN,
): Hueco[] {
  const porDia = new Map<string, number>();
  const salida: Hueco[] = [];
  const ordenados = [...huecos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (const hueco of ordenados) {
    if (salida.length >= cuantos) break;
    const inicio = new Date(hueco.inicio);
    const dia = diaDe(inicio);
    const yaEnElDia = porDia.get(dia) ?? 0;
    if (yaEnElDia >= MAX_POR_DIA) continue;
    porDia.set(dia, yaEnElDia + 1);
    salida.push({ profesionalId: hueco.profesionalId, inicio });
  }
  return salida;
}

/**
 * Lo que salva la venta cuando la de siempre está llena: el primer hueco de cada OTRA
 * persona que da el servicio, dos a lo más. No se empuja: se ofrece.
 */
export function conOtraPersona(
  huecos: readonly HuecoDelServidor[],
  excepto: string | null,
  quienesLoDan: ReadonlySet<string> | null,
  cuantos = 2,
): Hueco[] {
  const vistos = new Set<string>();
  const salida: Hueco[] = [];
  for (const hueco of [...huecos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    if (salida.length >= cuantos) break;
    if (hueco.profesionalId === excepto || vistos.has(hueco.profesionalId)) continue;
    if (quienesLoDan !== null && !quienesLoDan.has(hueco.profesionalId)) continue;
    vistos.add(hueco.profesionalId);
    salida.push({ profesionalId: hueco.profesionalId, inicio: new Date(hueco.inicio) });
  }
  return salida;
}

export interface LineaDeReceta {
  readonly ingrediente_id: string;
  readonly cantidad_convertida_unidad_base: number | null;
}

/**
 * Lo que el servicio gasta de la cabina, en la forma de `cabina.alcanza`: para avisar al
 * agendar si el material no alcanza (F-107). Sumado por insumo, con cuatro decimales.
 */
export function consumoDeLaReceta(
  lineas: readonly LineaDeReceta[],
): { readonly insumoId: string; readonly cantidadBase: string }[] {
  const porInsumo = new Map<string, number>();
  for (const linea of lineas) {
    if (linea.cantidad_convertida_unidad_base === null) continue;
    porInsumo.set(
      linea.ingrediente_id,
      (porInsumo.get(linea.ingrediente_id) ?? 0) + linea.cantidad_convertida_unidad_base,
    );
  }
  return [...porInsumo].map(([insumoId, cantidad]) => ({
    insumoId,
    cantidadBase: cantidad.toFixed(4),
  }));
}

/** `AAAA-MM-DD` en la hora local: lo que `agenda.huecos` pide como día. */
export function diaIso(fecha: Date): string {
  return `${String(fecha.getFullYear())}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
