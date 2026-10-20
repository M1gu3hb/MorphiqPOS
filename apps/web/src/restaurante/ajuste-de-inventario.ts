/**
 * LO QUE PASÓ CON LO QUE SE QUITÓ DE LA ALACENA (día completo del restaurante, 2.4).
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * La pantalla de inventario del restaurante dejaba contar con el «−» y el «+», pedía un
 * motivo… y no podía GUARDAR nada: nadie le daba el almacén (`almacenId`), así que «Guardar
 * ajuste» salía apagado y el aviso decía que la pantalla «todavía no lo resuelve sola». La
 * merma de la cocina —el jitomate que se cayó, la crema que se echó a perder— no tenía por
 * dónde entrar.
 *
 * Y aun con el almacén, TODO lo que bajaba entraba como `ajuste_conteo` («diferencia de
 * conteo físico») con el motivo escrito en una nota: la crema caducada y el faltante del
 * conteo quedaban juntos, y el reporte de merma —que es el que le dice al dueño cuánto cuesta
 * la cocina— no podía separarlos. Para eso existe `inventario.registrar_merma`, que lleva un
 * motivo de la tabla (`motivos_merma`): lo que se echó a perder se registra como MERMA, con su
 * clase, y lo que se contó de más o de menos sigue siendo un ajuste.
 *
 * ── Lo que decide este archivo ───────────────────────────────────────────────
 *   · una ALTA es siempre un ajuste de conteo: nadie «mermó» de más;
 *   · una BAJA puede ser conteo (lo que había) o merma (lo que se perdió) con su motivo;
 *   · cada una va a SU comando, con la forma que ese comando pide.
 */

/** La clave de `motivos_merma` de un ajuste por conteo físico (migración 062). */
export const MOTIVO_DEL_CONTEO = 'ajuste_conteo';

export const RUTA_DE_AJUSTE = '/api/inventario/ajustar';
export const RUTA_DE_MERMA = '/api/inventario/merma';

/** Un motivo de la tabla: la CLAVE se manda, la etiqueta se lee. */
export interface MotivoDeMerma {
  readonly clave: string;
  readonly etiqueta: string;
}

/** A dónde se manda lo que se guardó, y con qué cuerpo. */
export interface OrdenDeEscritura {
  readonly ruta: string;
  readonly cuerpo: Readonly<Record<string, string>>;
}

/** El largo de `nota` en cada comando: el ajuste admite 300, la merma 200. */
const NOTA_DEL_AJUSTE = 300;
const NOTA_DE_LA_MERMA = 200;

/**
 * Una cantidad como la quiere el servidor: texto, con hasta cuatro decimales y sin ruido de
 * coma flotante. `numeric(14,4)` no cabe en un `number` sin perder el cuarto decimal, y ese
 * decimal es la merma del mes.
 */
export function cantidadEnTexto(valor: number): string {
  return String(Number(valor.toFixed(4)));
}

/**
 * Los motivos que se pueden elegir al BAJAR algo, sin el de conteo —ése ya tiene su opción,
 * la de omisión— y sin repetidos.
 */
export function motivosDeMermaParaBajar(
  motivos: readonly MotivoDeMerma[],
): readonly MotivoDeMerma[] {
  const vistos = new Set<string>([MOTIVO_DEL_CONTEO]);
  const elegibles: MotivoDeMerma[] = [];
  for (const motivo of motivos) {
    if (vistos.has(motivo.clave)) continue;
    vistos.add(motivo.clave);
    elegibles.push(motivo);
  }
  return elegibles;
}

/**
 * El motivo que sigue valiendo para este ajuste. Una alta no puede ser merma, y un motivo que
 * ya no está en la lista (se cambió de renglón, se recargó) vuelve al conteo.
 */
export function motivoVigente(
  delta: number,
  elegido: string,
  motivos: readonly MotivoDeMerma[],
): string {
  if (delta >= 0) return MOTIVO_DEL_CONTEO;
  return motivos.some((motivo) => motivo.clave === elegido) ? elegido : MOTIVO_DEL_CONTEO;
}

export interface AjusteParaGuardar {
  readonly almacenId: string;
  readonly insumoId: string;
  /** La unidad base del insumo; la merma la pide y sin ella se usa la pieza. */
  readonly unidad: string | null;
  /** Con signo: negativo es lo que se quitó. */
  readonly delta: number;
  /** La clave elegida; `ajuste_conteo` si es un conteo. */
  readonly motivoClave: string;
  /** Lo que la persona escribió. */
  readonly nota: string;
}

/**
 * La orden que guarda un ajuste: un conteo va a `inventario.ajustar` con el delta con signo;
 * una baja con motivo de merma va a `inventario.registrar_merma` con la cantidad perdida, en
 * positivo, que es como la pide.
 */
export function ordenDelAjuste(ajuste: AjusteParaGuardar): OrdenDeEscritura {
  const nota = ajuste.nota.trim();
  const esMerma = ajuste.delta < 0 && ajuste.motivoClave !== MOTIVO_DEL_CONTEO;
  if (!esMerma) {
    return {
      ruta: RUTA_DE_AJUSTE,
      cuerpo: {
        almacenId: ajuste.almacenId,
        insumoId: ajuste.insumoId,
        cantidad: cantidadEnTexto(ajuste.delta),
        motivo: MOTIVO_DEL_CONTEO,
        ...(nota === '' ? {} : { nota: nota.slice(0, NOTA_DEL_AJUSTE) }),
      },
    };
  }
  return {
    ruta: RUTA_DE_MERMA,
    cuerpo: {
      almacenId: ajuste.almacenId,
      insumoId: ajuste.insumoId,
      estrategia: 'insumo',
      cantidad: cantidadEnTexto(-ajuste.delta),
      unidad: ajuste.unidad ?? 'pieza',
      motivoClave: ajuste.motivoClave,
      ...(nota === '' ? {} : { nota: nota.slice(0, NOTA_DE_LA_MERMA) }),
    },
  };
}
