/**
 * LA REGLA DE COMISIÓN, leída en palabras y cambiada por versión (F-440; C.10 de la 2.4).
 *
 * La liquidación decía «la edición de la regla es del catálogo» y ningún lado la tenía:
 * la 133 guarda «las cinco preguntas contestadas por escrito ANTES de calcular» y sólo la
 * semilla las escribía. Aquí se leen como se dicen —«45 % de lo cobrado, el material lo
 * pone el salón»— y se cambian como la 133 manda: una versión nueva desde una fecha, sin
 * tocar lo ya causado (`comision.guardar_regla`).
 */

export interface ReglaDelPuente {
  readonly id: string;
  readonly nombre: string;
  readonly version: number;
  readonly esquema: string;
  /** En por ciento: el puente convierte los puntos base. */
  readonly tasa_servicio_bp: number | null;
  readonly tasa_producto_bp: number | null;
  readonly base: string;
  readonly sobre_iva: boolean;
  readonly material: string;
  readonly vigente_desde: string | null;
  readonly vigente_hasta: string | null;
  /** `[{ hastaCentavos, tasaBp }]` en el escalonado (el JSON que lee el cálculo). */
  readonly escalones?: unknown;
}

/** Un escalón como se edita: hasta cuánto acumulado (centavos) y su tasa en por ciento. */
export interface EscalonEditable {
  readonly hastaCentavos: number | null;
  readonly tasa: string;
}

/** Los escalones guardados, o ninguno si la regla no es escalonada o no se entienden. */
export function escalonesDe(regla: ReglaDelPuente): EscalonEditable[] {
  const crudo: unknown =
    typeof regla.escalones === 'string' ? JSON.parse(regla.escalones) : regla.escalones;
  if (!Array.isArray(crudo)) return [];
  return crudo.map((item) => {
    const escalon = item as { hastaCentavos?: number | string; tasaBp?: number };
    return {
      hastaCentavos: escalon.hastaCentavos === undefined ? null : Number(escalon.hastaCentavos),
      tasa: String((escalon.tasaBp ?? 0) / 100),
    };
  });
}

export const BASES = [
  { clave: 'cobrado', etiqueta: 'de lo cobrado' },
  { clave: 'lista', etiqueta: 'del precio de lista' },
  { clave: 'mitad', etiqueta: 'de la mitad de lo cobrado' },
] as const;

export const MATERIALES = [
  { clave: 'salon', etiqueta: 'El material lo pone el salón' },
  { clave: 'descuenta_base', etiqueta: 'El material se descuenta de la base' },
  { clave: 'cobra_profesional', etiqueta: 'El material lo paga la profesional' },
] as const;

export type Base = (typeof BASES)[number]['clave'];
export type Material = (typeof MATERIALES)[number]['clave'];

/** «45 % de lo cobrado · 10 % de producto · el material lo pone el salón». */
export function reglaEnPalabras(regla: ReglaDelPuente): string {
  if (regla.esquema === 'sin_comision') return 'Sin comisión';
  const base = BASES.find((b) => b.clave === regla.base)?.etiqueta ?? regla.base;
  const material =
    MATERIALES.find((m) => m.clave === regla.material)?.etiqueta.toLowerCase() ?? regla.material;
  const partes = [
    `${porciento(regla.tasa_servicio_bp)} ${base}`,
    ...(regla.tasa_producto_bp !== null && regla.tasa_producto_bp > 0
      ? [`${porciento(regla.tasa_producto_bp)} de producto`]
      : []),
    ...(regla.sobre_iva ? ['con IVA'] : []),
    material,
  ];
  return partes.join(' · ');
}

function porciento(valor: number | null): string {
  return `${(valor ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`;
}

/** Las reglas VIGENTES hoy: las que se pueden asignar. */
export function reglasVigentes(reglas: readonly ReglaDelPuente[], hoy: string): ReglaDelPuente[] {
  return reglas.filter(
    (r) =>
      (r.vigente_desde === null || r.vigente_desde <= hoy) &&
      (r.vigente_hasta === null || r.vigente_hasta >= hoy),
  );
}

export interface FormularioDeRegla {
  readonly tasaServicio: string;
  readonly tasaProducto: string;
  readonly base: Base;
  readonly material: Material;
  readonly sobreIva: boolean;
  readonly vigenteDesde: string;
  /** Sólo en el escalonado. */
  readonly escalones: readonly EscalonEditable[];
}

export function formularioDe(regla: ReglaDelPuente, manana: string): FormularioDeRegla {
  return {
    tasaServicio: String(regla.tasa_servicio_bp ?? 0),
    tasaProducto: String(regla.tasa_producto_bp ?? 0),
    base: BASES.some((b) => b.clave === regla.base) ? (regla.base as Base) : 'cobrado',
    material: MATERIALES.some((m) => m.clave === regla.material)
      ? (regla.material as Material)
      : 'salon',
    sobreIva: regla.sobre_iva,
    // La versión nueva empieza MAÑANA: lo de hoy ya se causó con la de hoy.
    vigenteDesde: manana,
    escalones: escalonesDe(regla),
  };
}

function puntosBase(texto: string): number | null {
  const valor = Number(texto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return null;
  return Math.round(valor * 100);
}

/** El cuerpo de `comision.guardar_regla` para versionar ESA regla, o el problema. */
export function cuerpoDeLaVersion(
  regla: ReglaDelPuente,
  formulario: FormularioDeRegla,
):
  | { readonly ok: true; readonly cuerpo: Record<string, unknown> }
  | { readonly ok: false; readonly problema: string } {
  const tasaServicioBp = puntosBase(formulario.tasaServicio);
  const tasaProductoBp = puntosBase(formulario.tasaProducto);
  if (tasaServicioBp === null || tasaProductoBp === null) {
    return { ok: false, problema: 'Las tasas van del 0 al 100 %.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formulario.vigenteDesde)) {
    return { ok: false, problema: 'Di desde qué día cuenta la regla nueva.' };
  }
  if (regla.vigente_desde !== null && formulario.vigenteDesde <= regla.vigente_desde) {
    return {
      ok: false,
      problema: 'La regla nueva empieza después de la de ahora: lo causado no se recalcula.',
    };
  }
  let escalones: { hastaCentavos: number; tasaBp: number }[] | null = null;
  if (regla.esquema === 'escalonado') {
    escalones = [];
    for (const escalon of formulario.escalones) {
      const tasaBp = puntosBase(escalon.tasa);
      if (escalon.hastaCentavos === null || tasaBp === null) {
        return { ok: false, problema: 'Cada escalón necesita hasta cuánto y su tasa.' };
      }
      escalones.push({ hastaCentavos: escalon.hastaCentavos, tasaBp });
    }
    if (escalones.length === 0) {
      return { ok: false, problema: 'Una regla escalonada necesita al menos un escalón.' };
    }
    // En orden de «hasta»: el cálculo los recorre de menor a mayor.
    escalones.sort((a, b) => a.hastaCentavos - b.hastaCentavos);
  }
  return {
    ok: true,
    cuerpo: {
      reglaId: regla.id,
      nombre: regla.nombre,
      esquema: regla.esquema,
      escalones,
      tasaServicioBp,
      tasaProductoBp,
      base: formulario.base,
      sobreIva: formulario.sobreIva,
      material: formulario.material,
      vigenteDesde: formulario.vigenteDesde,
    },
  };
}
