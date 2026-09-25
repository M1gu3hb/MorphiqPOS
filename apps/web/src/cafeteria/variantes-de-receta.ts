import { cantidad, convertirUnidad } from '@morphiqpos/domain/catalogo';
import { recetaConOpciones, type EfectoDeOpcion } from '@morphiqpos/domain/inventario';

import { centavosDe } from '~/cliente/dinero-del-puente';

import {
  entraEnCanal,
  margenDe,
  mermaBpDe,
  type InsumoDisponible,
  type LineaDeReceta,
} from './receta-de-barra.ts';

/**
 * LA TABLA DE VARIANTES: cuánto cuesta y cuánto deja cada opción de la bebida
 * (`04-INTERFAZ` de cafetería · Recetas, C.10 de la 2.4).
 *
 * El latte con avena no es otro producto del catálogo, es el mismo con una opción, y
 * por eso no tiene receta propia que costear: su costo es el del latte con la leche
 * cambiada. Sin esta tabla, la dueña pone «+$10 la avena» a ojo, y la avena cuesta $9.
 *
 * ── La MISMA receta que descuenta el cobro ──────────────────────────────
 * La sustitución y el escalado salen de `recetaConOpciones`, la función del dominio
 * que el cobro usa para descontar el inventario. Si la tabla calculara por su lado,
 * podría enseñar un latte de avena que el almacén no descuenta —que es exactamente lo
 * que pasaba hasta la 2.4: la opción existía y nadie la aplicaba—.
 *
 * ── Y el mismo redondeo que el costo de la línea ────────────────────────
 * `costo × cantidad × (1 + merma)`, en enteros y redondeado una sola vez al final:
 * la fórmula de `costoDeLineaDeReceta` del puente. Así la opción «entera», que no
 * cambia nada, cuesta al centavo lo mismo que la receta base.
 */

/** Una opción de la bebida, como la sirve `Modificador`. */
export interface OpcionDeLaBebida {
  readonly id: string;
  readonly producto_id: string;
  readonly grupo: string | null;
  readonly nombre: string;
  /** Centavos (`conversion: 'entero'`). */
  readonly delta_precio_centavos: number | null;
  readonly orden?: number | null;
  /** F-027 · El grupo por id: lo que la línea de receta declara. */
  readonly grupo_id?: string | null;
  readonly insumo_sustituto_id?: string | null;
  readonly factor_cantidad?: number | null;
}

/** Un grupo de opciones de ESTA bebida, para ofrecerlo como sustituto de una línea. */
export interface GrupoDeLaBebida {
  readonly grupoId: string;
  readonly nombre: string;
}

/** Los grupos de la bebida, sin repetir, en el orden del menú. */
export function gruposDeLaBebida(opciones: readonly OpcionDeLaBebida[]): GrupoDeLaBebida[] {
  const vistos = new Map<string, string>();
  for (const opcion of opciones) {
    const id = opcion.grupo_id ?? null;
    if (id === null || vistos.has(id)) continue;
    vistos.set(id, opcion.grupo ?? 'Opciones');
  }
  return [...vistos].map(([grupoId, nombre]) => ({ grupoId, nombre }));
}

export interface CostoDeVariante {
  /** Centavos, o `null` mientras falte el costo de alguna línea. */
  readonly centavos: number | null;
  readonly margen: number | null;
}

export interface VarianteDeReceta {
  readonly opcionId: string;
  readonly grupo: string;
  readonly opcion: string;
  /** «Leche entera → Avena», «×1.44 toda la receta», o nulo si no toca la receta. */
  readonly queCambia: string | null;
  readonly precioCentavos: number | null;
  readonly aqui: CostoDeVariante;
  readonly llevar: CostoDeVariante;
}

const PUNTOS_BASE = 10_000n;
const ESCALA = 10_000n;

function efectoDe(
  opcion: OpcionDeLaBebida,
  insumos: ReadonlyMap<string, InsumoDisponible>,
): EfectoDeOpcion | null {
  const grupoId = opcion.grupo_id ?? null;
  if (grupoId === null) return null;
  const sustituto =
    opcion.insumo_sustituto_id == null ? undefined : insumos.get(opcion.insumo_sustituto_id);
  return {
    grupoId,
    insumoSustitutoId: sustituto?.id ?? null,
    unidadBaseSustituto: sustituto?.unidad_base ?? null,
    factor: String(opcion.factor_cantidad ?? 1),
  };
}

/**
 * Lo que cuesta la línea YA con la opción aplicada, en centavos; `null` si no se sabe.
 *
 * El costo unitario sale del insumo QUE QUEDÓ: el de la línea si no cambió —el mismo
 * que usa el puente para `costo_linea_calculado`— o el del sustituto si cambió.
 */
function costoDeLineaAplicada(
  original: LineaDeReceta,
  aplicada: { readonly insumoId: string; readonly cantidad: string; readonly unidadBase: string },
  insumos: ReadonlyMap<string, InsumoDisponible>,
): bigint | null {
  const unitario =
    aplicada.insumoId === original.ingrediente_id
      ? centavosDe(
          'RecetaEscandallo',
          'costo_unitario_base_snapshot',
          original.costo_unitario_base_snapshot,
        )
      : centavosDe(
          'Ingrediente',
          'costo_por_unidad_base',
          insumos.get(aplicada.insumoId)?.costo_por_unidad_base,
        );
  if (unitario === null) return null;
  let enBase: bigint;
  try {
    enBase = convertirUnidad(cantidad(aplicada.cantidad), original.unidad, aplicada.unidadBase);
  } catch {
    // Una conversión que no cabe en cuatro decimales: no se inventa un costo.
    return null;
  }
  const bruto = BigInt(unitario) * enBase * (PUNTOS_BASE + BigInt(mermaBpDe(original)));
  const divisor = ESCALA * PUNTOS_BASE;
  return (bruto + divisor / 2n) / divisor;
}

const SIN_COSTO: CostoDeVariante = { centavos: null, margen: null };

/**
 * Si la opción sustituye con un insumo que esta pantalla NO tiene —la lista de
 * ingredientes llega recortada, o quien mira no ve costos—, la variante no tiene
 * costo. Calcularla con el insumo original sería enseñar el latte de avena al precio
 * de la leche entera, que es justo el número que esta tabla existe para corregir.
 */
function sustitutoDesconocido(
  opcion: OpcionDeLaBebida,
  insumos: ReadonlyMap<string, InsumoDisponible>,
): boolean {
  const id = opcion.insumo_sustituto_id ?? null;
  return id !== null && !insumos.has(id);
}

function costoEnCanalConOpcion(
  lineas: readonly LineaDeReceta[],
  opcion: OpcionDeLaBebida,
  canal: 'aqui' | 'llevar',
  insumos: ReadonlyMap<string, InsumoDisponible>,
  precioCentavos: number | null,
): CostoDeVariante {
  const efecto = efectoDe(opcion, insumos);
  const delCanal = lineas.filter((l) => entraEnCanal(l, canal));
  const tocaUnaLinea = delCanal.some(
    (l) => (l.sustituible_por_grupo_id ?? null) === (opcion.grupo_id ?? null),
  );
  if (tocaUnaLinea && sustitutoDesconocido(opcion, insumos)) return SIN_COSTO;
  const paraElDominio = delCanal.map((l) => ({
    insumoId: l.ingrediente_id,
    cantidad: String(l.cantidad_convertida_unidad_base ?? 0),
    unidad: l.unidad,
    unidadBase: l.unidad,
    sustituiblePorGrupoId: l.sustituible_por_grupo_id ?? null,
  }));
  let aplicadas: ReturnType<typeof recetaConOpciones>;
  try {
    aplicadas = recetaConOpciones(paraElDominio, efecto === null ? [] : [efecto]);
  } catch {
    // Una cantidad o un factor que el dominio no acepta: sin costo, no un costo inventado.
    return SIN_COSTO;
  }
  let total = 0n;
  for (const [indice, original] of delCanal.entries()) {
    const aplicada = aplicadas[indice];
    if (aplicada === undefined || original.cantidad_convertida_unidad_base === null) {
      return SIN_COSTO;
    }
    const costo = costoDeLineaAplicada(original, aplicada, insumos);
    if (costo === null) return SIN_COSTO;
    total += costo;
  }
  const centavos = Number(total);
  return {
    centavos,
    margen: precioCentavos === null ? null : margenDe(precioCentavos, centavos),
  };
}

function queCambiaCon(
  opcion: OpcionDeLaBebida,
  lineas: readonly LineaDeReceta[],
  insumos: ReadonlyMap<string, InsumoDisponible>,
): string | null {
  const partes: string[] = [];
  const sustitutoId = opcion.insumo_sustituto_id ?? null;
  const grupoId = opcion.grupo_id ?? null;
  if (sustitutoId !== null && grupoId !== null) {
    const sustituida = lineas.find((l) => l.sustituible_por_grupo_id === grupoId);
    const nuevo = insumos.get(sustitutoId)?.nombre ?? 'un insumo que no está en esta lista';
    if (sustituida !== undefined && sustituida.ingrediente_id !== sustitutoId) {
      partes.push(`${sustituida.ingrediente_nombre ?? 'La línea'} → ${nuevo}`);
    }
  }
  const factor = opcion.factor_cantidad ?? 1;
  if (factor !== 1) {
    partes.push(`×${factor.toLocaleString('es-MX', { maximumFractionDigits: 4 })} toda la receta`);
  }
  return partes.length === 0 ? null : partes.join(' · ');
}

/** Si alguna opción del grupo hace algo en esta receta: sustituir una línea o escalarla. */
function grupoCambiaLaReceta(
  delGrupo: readonly OpcionDeLaBebida[],
  lineas: readonly LineaDeReceta[],
): boolean {
  const grupoId = delGrupo[0]?.grupo_id ?? null;
  const declarada = lineas.some((l) => (l.sustituible_por_grupo_id ?? null) === grupoId);
  return delGrupo.some(
    (o) =>
      (o.factor_cantidad ?? 1) !== 1 || (declarada && (o.insumo_sustituto_id ?? null) !== null),
  );
}

/**
 * Las variantes de la bebida: una fila por opción de cada grupo que CAMBIA la receta
 * —la leche, el tamaño—. Los grupos que sólo anotan (la temperatura) o sólo cobran no
 * entran: su costo es el de la receta base y ya está arriba.
 */
export function variantesDeLaReceta(
  lineas: readonly LineaDeReceta[],
  opciones: readonly OpcionDeLaBebida[],
  insumos: readonly InsumoDisponible[],
  precioCentavos: number | null,
): VarianteDeReceta[] {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const porGrupo = new Map<string, OpcionDeLaBebida[]>();
  for (const opcion of opciones) {
    const id = opcion.grupo_id ?? null;
    if (id === null) continue;
    porGrupo.set(id, [...(porGrupo.get(id) ?? []), opcion]);
  }
  const salida: VarianteDeReceta[] = [];
  for (const delGrupo of porGrupo.values()) {
    if (!grupoCambiaLaReceta(delGrupo, lineas)) continue;
    for (const opcion of delGrupo) {
      const precio =
        precioCentavos === null
          ? null
          : precioCentavos +
            (centavosDe('Modificador', 'delta_precio_centavos', opcion.delta_precio_centavos) ?? 0);
      salida.push({
        opcionId: opcion.id,
        grupo: opcion.grupo ?? 'Opciones',
        opcion: opcion.nombre,
        queCambia: queCambiaCon(opcion, lineas, porId),
        precioCentavos: precio,
        aqui: costoEnCanalConOpcion(lineas, opcion, 'aqui', porId, precio),
        llevar: costoEnCanalConOpcion(lineas, opcion, 'llevar', porId, precio),
      });
    }
  }
  return salida;
}
