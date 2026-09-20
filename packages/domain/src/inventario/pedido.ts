import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { cantidad, ESCALA_CANTIDAD } from '../catalogo/index.ts';

/**
 * F-107 · Alerta de mínimo y sugerencia de pedido por proveedor.
 *
 * ── Por qué una alerta sola no sirve ──────────────────────────────────────
 * «Te queda poco refresco» no le dice al tendero qué pedir. Bimbo llega el
 * martes a las siete y se va en diez minutos: la decisión se toma de pie, con
 * el repartidor delante. Si el sistema no contesta «pide cuatro rejas» en ese
 * momento, el tendero pide de memoria y el dolor 3 queda entero.
 *
 * ── Por qué la lista es POR PROVEEDOR y no global ─────────────────────────
 * Porque no se compra un inventario: se compra a quien está enfrente. Una lista
 * global obliga a filtrarla mentalmente mientras el repartidor espera, que es
 * la misma fricción con más pasos.
 *
 * ── Por qué el mínimo NO es la meta ───────────────────────────────────────
 * El mínimo es un piso: dice cuándo alarmarse, no cuánto pedir. Lo que predice
 * es la VENTA: si se venden 30 refrescos al día y el proveedor vuelve en siete,
 * hay que tener 210 aunque el mínimo diga 50. Pedir hasta el mínimo es cómo se
 * agota el martes por la tarde con el pedido recién hecho.
 */

export interface DatosDeSugerencia {
  /** Existencia actual en unidad base. */
  readonly existenciaBase: string;
  /** El piso que declara el catálogo, en unidad base. */
  readonly stockMinimo: string;
  /** Lo vendido en `diasDelPeriodo`, en unidad base. */
  readonly ventaDelPeriodoBase: string;
  readonly diasDelPeriodo: number;
  /** Días que el pedido tiene que cubrir: hasta la próxima visita, más colchón. */
  readonly diasDeCobertura: number;
  /** Cuántas unidades base trae una presentación de compra. La reja, la caja. */
  readonly factorCompra: string;
}

export type MotivoSugerencia = 'bajo_minimo' | 'cobertura' | 'ninguno';

export interface Sugerencia {
  /** Cuánto falta, en unidad base, para llegar a la meta. Nunca negativo. */
  readonly faltanBase: string;
  /** Cuántas presentaciones de compra pedir. Enteras y hacia ARRIBA. */
  readonly presentacionesSugeridas: number;
  /** Lo que esas presentaciones traen, en unidad base. */
  readonly enBase: string;
  readonly motivo: MotivoSugerencia;
}

/**
 * Cuánto pedirle a este proveedor de este artículo.
 *
 * ── Por qué se redondea HACIA ARRIBA ──────────────────────────────────────
 * Porque media reja no se pide. Redondear hacia abajo garantiza quedarse corto
 * justo antes de la siguiente visita, que es el único momento en que quedarse
 * corto cuesta una semana de venta perdida en vez de un día.
 */
export function sugerirPedido(datos: DatosDeSugerencia): Sugerencia {
  const factor = cantidad(datos.factorCompra);
  if (factor <= 0n) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Una presentación de compra contiene una cantidad positiva de unidades base.',
      { factorCompra: datos.factorCompra },
    );
  }
  if (datos.diasDelPeriodo <= 0) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'La venta de un periodo de cero días no predice nada.',
      { diasDelPeriodo: datos.diasDelPeriodo },
    );
  }

  const existencia = cantidad(datos.existenciaBase);
  const minimo = cantidad(datos.stockMinimo);
  const venta = cantidad(datos.ventaDelPeriodoBase);

  // La cobertura que la VENTA pide: ritmo diario × días hasta reponer. En
  // enteros escalados, dividiendo al final para no perder el decimal del
  // granel.
  const porCobertura =
    (venta * BigInt(Math.max(datos.diasDeCobertura, 0))) / BigInt(datos.diasDelPeriodo);

  // La meta es la mayor de las dos: el mínimo es un piso, no un techo.
  const meta = porCobertura > minimo ? porCobertura : minimo;
  const faltan = meta > existencia ? meta - existencia : 0n;

  if (faltan === 0n) {
    return {
      faltanBase: enEscala(0n),
      presentacionesSugeridas: 0,
      enBase: enEscala(0n),
      motivo: 'ninguno',
    };
  }

  // Hacia arriba, en enteros: `(faltan + factor - 1) / factor`.
  const presentaciones = (faltan + factor - 1n) / factor;

  return {
    faltanBase: enEscala(faltan),
    presentacionesSugeridas: Number(presentaciones),
    enBase: enEscala(presentaciones * factor),
    // Qué disparó el pedido, para que la pantalla lo pueda decir: por debajo
    // del piso es urgente; por cobertura es previsión, y se lee distinto.
    motivo: existencia < minimo ? 'bajo_minimo' : 'cobertura',
  };
}

export type NivelDeAlerta = 'critico' | 'bajo' | 'normal';

export interface ArticuloParaAlerta {
  readonly insumoId: string;
  readonly existenciaBase: string;
  readonly stockMinimo: string;
  readonly stockCritico: string;
}

export interface Alerta {
  readonly insumoId: string;
  readonly nivel: NivelDeAlerta;
}

/**
 * Qué artículos están por debajo de su piso, y cuánto.
 *
 * ── Por qué dos niveles y no uno ──────────────────────────────────────────
 * Porque una lista donde todo es urgente no se lee. `critico` es «hoy se
 * acaba»; `bajo` es «pídelo cuando venga el de siempre». Un solo umbral obliga
 * a ponerlo alto —y entonces la lista tiene cuarenta renglones todos los días,
 * y nadie la mira— o bajo —y entonces avisa cuando ya no hay.
 */
export function alertasDeMinimo(articulos: readonly ArticuloParaAlerta[]): readonly Alerta[] {
  const alertas: Alerta[] = [];

  for (const articulo of articulos) {
    const existencia = cantidad(articulo.existenciaBase);
    const minimo = cantidad(articulo.stockMinimo);
    const critico = cantidad(articulo.stockCritico);

    // Un piso en cero es «no lo vigiles»: sin los `> 0n`, todo el catálogo que
    // nunca declaró mínimo aparecería en crítico el día que se agote algo
    // legítimo. La salida temprana que había aquí era redundante —las dos
    // guardas de abajo ya la hacían— y se quitó en vez de dejarla aparentando
    // que cerraba algo.
    if (critico > 0n && existencia <= critico) {
      alertas.push({ insumoId: articulo.insumoId, nivel: 'critico' });
      continue;
    }
    if (minimo > 0n && existencia <= minimo) {
      alertas.push({ insumoId: articulo.insumoId, nivel: 'bajo' });
    }
  }

  return alertas;
}

/**
 * Cuántos días faltan para que vuelva a pasar este proveedor.
 *
 * `diasVisita` son días de la semana con 1 = lunes … 7 = domingo, como el
 * `int[]` de la 099. Bimbo viene martes y viernes: `[2, 5]`.
 *
 * ── Por qué hoy cuenta como cero y no como siete ──────────────────────────
 * Porque si el repartidor está enfrente, el pedido que se hace es el de hoy. Un
 * cero aquí significa «ya llegó», y lo que hay que cubrir es el hueco hasta la
 * SIGUIENTE, que el llamador suma aparte. Devolver siete diría «no vuelve en
 * una semana» justo cuando está en la puerta.
 */
export function diasHastaLaVisita(diasVisita: readonly number[], hoy: Date): number | null {
  const validos = diasVisita.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (validos.length === 0) return null;

  // `getUTCDay()` da 0 = domingo y la 099 usa 1 = lunes … 7 = domingo. NO se
  // convierte: `(dia - hoy + 7) % 7` da el mismo resultado con el domingo como
  // 0 o como 7, y una conversión que no cambia ninguna respuesta es una línea
  // que hay que leer y que no protege de nada.
  const diaDeHoy = hoy.getUTCDay();

  let menor = 7;
  for (const dia of validos) {
    const faltan = (dia - diaDeHoy + 7) % 7;
    if (faltan < menor) menor = faltan;
  }
  return menor;
}

/** `40000n` → `'4.0000'`, con los cuatro decimales de `numeric(14,4)`. */
function enEscala(valor: bigint): string {
  const enteros = valor / ESCALA_CANTIDAD;
  const fraccion = (valor % ESCALA_CANTIDAD).toString().padStart(4, '0');
  return `${enteros.toString()}.${fraccion}`;
}
