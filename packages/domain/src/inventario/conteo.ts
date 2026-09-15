import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import { cantidad, ESCALA_CANTIDAD } from '../catalogo/index.ts';

/**
 * F-149 · Conteo cíclico por zona. La aritmética, sin base de datos.
 *
 * ── El dolor número uno de una tiendita ───────────────────────────────────
 * «¿Quién me está robando?» hoy no tiene renglón. El sistema da el esperado y
 * nunca el real, así que la merma, el robo y el error de captura son la misma
 * cifra invisible. Contar es lo único que los separa.
 *
 * ── Por qué cíclico y no completo ─────────────────────────────────────────
 * La toma completa de 1,800 SKU tarda un domingo entero, y por eso se hace una
 * vez al año o nunca. Veinte minutos diarios sobre una zona sí se sostienen. La
 * toma completa es este mismo motor con el alcance igual a «todo».
 *
 * ── Lo que aquí NO se decide ──────────────────────────────────────────────
 * No se decide si el ajuste se aplica. Esto produce el delta y su motivo; quien
 * cierra el conteo lo ejecuta en su transacción y escribe el movimiento de stock
 * con su renglón. Si el conteo escribiera existencias, el saldo cambiaría sin
 * nada que lo justifique — que es la pregunta que el dueño hace.
 */

export interface ZonaParaRecorrido {
  readonly id: string;
  readonly nombre: string;
  readonly orden: number;
  readonly diasEntreConteos: number;
  /** `null` = nunca se ha contado. */
  readonly ultimoConteoEn: Date | null;
  readonly activa: boolean;
}

export interface ZonaPendiente {
  readonly id: string;
  readonly nombre: string;
  /**
   * Días de retraso sobre su propia frecuencia. `null` cuando nunca se contó:
   * no hay retraso que medir y no se puede fingir uno.
   */
  readonly diasDeRetraso: number | null;
  readonly nuncaContada: boolean;
}

const MS_POR_DIA = 86_400_000;

/**
 * Qué zonas toca contar hoy, la más atrasada primero.
 *
 * ── Por qué las nunca contadas van primero ────────────────────────────────
 * Una zona sin conteo no tiene una diferencia grande: tiene una diferencia
 * DESCONOCIDA, que es peor. Ordenarlas por retraso las mandaría al final para
 * siempre, porque un retraso que no existe siempre pierde contra uno que sí.
 *
 * ── Por qué las inactivas ni se miran ─────────────────────────────────────
 * Una zona que se desmontó —se quitó el congelador— seguiría acumulando retraso
 * y encabezaría la lista cada mañana hasta que alguien la borrara. Apagarla es
 * lo que el encargado hace; que deje de pedir conteo es lo que espera.
 */
export function zonasPorContar(
  zonas: readonly ZonaParaRecorrido[],
  ahora: Date,
): readonly ZonaPendiente[] {
  const pendientes: ZonaPendiente[] = [];

  for (const zona of zonas) {
    if (!zona.activa) continue;

    if (zona.ultimoConteoEn === null) {
      pendientes.push({
        id: zona.id,
        nombre: zona.nombre,
        diasDeRetraso: null,
        nuncaContada: true,
      });
      continue;
    }

    const transcurridos = Math.floor(
      (ahora.getTime() - zona.ultimoConteoEn.getTime()) / MS_POR_DIA,
    );
    const retraso = transcurridos - zona.diasEntreConteos;
    // Cero es «toca hoy» y sí entra. Redondear hacia abajo y exigir retraso
    // estricto empujaría cada zona un día más cada vuelta.
    if (retraso < 0) continue;

    pendientes.push({
      id: zona.id,
      nombre: zona.nombre,
      diasDeRetraso: retraso,
      nuncaContada: false,
    });
  }

  return pendientes.sort(compararPendientes);
}

function compararPendientes(a: ZonaPendiente, b: ZonaPendiente): number {
  if (a.nuncaContada !== b.nuncaContada) return a.nuncaContada ? -1 : 1;
  const retrasoA = a.diasDeRetraso ?? 0;
  const retrasoB = b.diasDeRetraso ?? 0;
  if (retrasoA !== retrasoB) return retrasoB - retrasoA;
  // Empate: por nombre, para que dos listas iguales salgan iguales. Sin
  // desempate estable la pantalla reordena sola entre dos cargas.
  return a.nombre.localeCompare(b.nombre);
}

export interface CapturaDeConteo {
  /** Qué presentación tecleó: `null` si contó en unidad base. */
  readonly presentacionId: string | null;
  /** Cuántas de ESA presentación. Texto, como toda cantidad. */
  readonly cantidad: string;
  /** Cuántas unidades base contiene una. `'1'` para la base. */
  readonly factor: string;
}

/**
 * «Nueve cajas y tres piezas» → `219.0000`.
 *
 * ── Por qué se suma aquí y se guarda el crudo aparte ──────────────────────
 * Porque la conversión es donde nace la discusión. Quien contó dice nueve cajas;
 * el sistema dice 216. Las dos cosas tienen que poder verse, y por eso este
 * resultado va a `contado` y las capturas van enteras a `capturas`.
 */
export function sumarCapturas(capturas: readonly CapturaDeConteo[]): string {
  if (capturas.length === 0) {
    // Contar cero es una respuesta legítima —el anaquel está vacío— pero se
    // captura como cero, no como «no capturé nada». Aceptar la lista vacía
    // dejaría que un descuido de la pantalla se leyera como un cero contado.
    throw new ErrorDominio(
      CODIGOS_ERROR.INVENTARIO_INVALIDO,
      'Una línea de conteo sin capturas no es un cero: es una línea sin contar.',
    );
  }

  let total = 0n;
  for (const captura of capturas) {
    // `cantidad()` ya rechaza el negativo y el formato: no se repite aquí.
    const unidades = cantidad(captura.cantidad);
    const factor = cantidad(captura.factor);

    if (factor === 0n) {
      throw new ErrorDominio(
        CODIGOS_ERROR.CATALOGO_INVALIDO,
        'Una presentación contiene una cantidad positiva de unidades base.',
        { factor: captura.factor },
      );
    }

    // En enteros escalados, dividiendo al final: `0.05 × 3` en coma flotante da
    // `0.15000000000000002` y el conteo de cigarros dejaría de cuadrar por
    // décimas en cada línea.
    total += (unidades * factor) / ESCALA_CANTIDAD;
  }

  // Con los cuatro decimales, no con los que sobrevivan al recorte: es lo que
  // se compara contra `esperado`, que viene de `numeric(14,4)`.
  return enEscalaCompleta(total);
}

export interface DiferenciaContada {
  readonly insumoId: string;
  readonly esperado: string;
  readonly contado: string;
  readonly unidad: string;
}

export interface AjustePlaneado {
  readonly insumoId: string;
  /** Con signo: negativo es faltante, positivo es sobrante. */
  readonly delta: string;
  readonly unidad: string;
  readonly faltante: boolean;
}

/**
 * `-40000n` → `'-4.0000'`, con los cuatro decimales siempre.
 *
 * `cantidadATexto` no sirve para esto por dos razones: recorta los ceros de la
 * derecha —y lo contado se compara contra un `numeric(14,4)`— y rechaza el
 * negativo, que es justo el caso que importa: el faltante.
 */
function enEscalaCompleta(valor: bigint): string {
  const negativo = valor < 0n;
  const magnitud = negativo ? -valor : valor;
  const enteros = magnitud / ESCALA_CANTIDAD;
  const fraccion = (magnitud % ESCALA_CANTIDAD).toString().padStart(4, '0');
  // Los cuatro decimales van siempre: es la escala de `numeric(14,4)` y lo que
  // el ajuste escribe en el ledger.
  return `${negativo ? '-' : ''}${enteros.toString()}.${fraccion}`;
}

/**
 * De lo contado a los ajustes que hay que escribir.
 *
 * ── Por qué las líneas que cuadran no producen movimiento ─────────────────
 * Un movimiento de cero es un renglón en el kardex que no dice nada, y el kardex
 * es donde se busca por qué cambió un saldo. Mil líneas de cero por conteo
 * harían que la respuesta se perdiera entre el ruido; el `check (cantidad <> 0)`
 * de la 003 además lo rechaza.
 *
 * ── Por qué el sobrante también se ajusta ─────────────────────────────────
 * Un sobrante es tan informativo como un faltante: casi siempre es una entrada
 * que no se capturó o una venta que se cobró mal. Dejarlo sin ajustar mantendría
 * el sistema mintiendo hacia abajo, y la próxima vez que se cuente volvería a
 * aparecer como si fuera nuevo.
 */
export function planearAjustesDeConteo(
  diferencias: readonly DiferenciaContada[],
): readonly AjustePlaneado[] {
  const ajustes: AjustePlaneado[] = [];

  for (const linea of diferencias) {
    const delta = cantidad(linea.contado) - cantidad(linea.esperado);
    if (delta === 0n) continue;

    ajustes.push({
      insumoId: linea.insumoId,
      delta: enEscalaCompleta(delta),
      unidad: linea.unidad,
      faltante: delta < 0n,
    });
  }

  return ajustes;
}
