/**
 * EL SURTIDO DE UNA LISTA, sin pantalla (F-153, C.10 de la 2.4).
 *
 * Lo que el mostradorista teclea por renglón —a qué producto se traduce, cuánto
 * pidió y cuánto se entrega ahora— se vuelve el cuerpo de `lista_trabajo.surtir`.
 * Vive aparte de la pantalla para probarse sin navegador: aquí se decide qué viaja,
 * y el servidor vuelve a comprobarlo todo.
 */

/** Lo que `lista_trabajo.renglones` sirve de cada renglón. */
export interface RenglonDeLista {
  readonly renglonId: string;
  readonly textoPedido: string;
  readonly productoId: string | null;
  readonly productoNombre: string | null;
  readonly unidad: string | null;
  readonly cantidad: string | null;
  readonly surtida: string;
  readonly sinExistencia: boolean;
}

/** Lo que el mostradorista lleva escrito de un renglón. */
export interface CapturaDeRenglon {
  readonly productoId: string | null;
  readonly productoNombre: string | null;
  /** Lo que pidió. Sólo se teclea al traducir un renglón que era texto. */
  readonly pedida: string;
  /** Lo que se entrega en esta nota. */
  readonly ahora: string;
  readonly noHay: boolean;
}

export interface RenglonParaSurtir {
  readonly renglonId: string;
  readonly productoId: string | null;
  readonly cantidad: string | null;
  readonly cantidadPedida: string | null;
  readonly sinExistencia: boolean;
}

export interface PedidoDeSurtido {
  readonly cuerpo: { readonly listaId: string; readonly renglones: readonly RenglonParaSurtir[] };
  /** Lo que impide mandarlo, en palabras del mostrador. Vacío: se puede mandar. */
  readonly problemas: readonly string[];
}

const ESCALA = 10_000n;

/** «1,5», «1.5» o «2»: a diezmilésimas. Nulo si no es una cantidad. */
export function aDiezmilesimas(texto: string): bigint | null {
  const limpio = texto.trim().replace(',', '.');
  const partes = /^(\d{1,10})(?:\.(\d{1,4}))?$/.exec(limpio);
  if (partes === null) return null;
  return BigInt(partes[1] ?? '0') * ESCALA + BigInt((partes[2] ?? '').padEnd(4, '0'));
}

/** De diezmilésimas a texto, sin ceros de sobra: 15 000 → «1.5». */
export function deDiezmilesimas(valor: bigint): string {
  const enteros = (valor / ESCALA).toString();
  const fraccion = (valor % ESCALA).toString().padStart(4, '0').replace(/0+$/, '');
  return fraccion === '' ? enteros : `${enteros}.${fraccion}`;
}

/** Lo que falta de un renglón traducido; nulo si todavía es sólo texto. */
export function faltante(renglon: RenglonDeLista): string | null {
  if (renglon.cantidad === null) return null;
  const pedida = aDiezmilesimas(renglon.cantidad) ?? 0n;
  const surtida = aDiezmilesimas(renglon.surtida) ?? 0n;
  return deDiezmilesimas(pedida > surtida ? pedida - surtida : 0n);
}

/**
 * Con qué empieza cada renglón: lo traducido propone entregar lo que falta —es el
 * caso de siempre, «surte la lista»—; lo que sigue siendo texto empieza vacío.
 */
export function capturaInicial(renglon: RenglonDeLista): CapturaDeRenglon {
  const falta = faltante(renglon);
  return {
    productoId: renglon.productoId,
    productoNombre: renglon.productoNombre,
    pedida:
      renglon.cantidad === null ? '' : deDiezmilesimas(aDiezmilesimas(renglon.cantidad) ?? 0n),
    ahora: falta === null || falta === '0' ? '' : falta,
    noHay: renglon.sinExistencia,
  };
}

function problemaDe(renglon: RenglonDeLista, captura: CapturaDeRenglon): string | null {
  const ahora = captura.ahora.trim() === '' ? 0n : aDiezmilesimas(captura.ahora);
  if (ahora === null) return `«${renglon.textoPedido}»: lo que se entrega no es una cantidad.`;
  if (ahora === 0n) return null;
  if (captura.productoId === null) {
    return `«${renglon.textoPedido}»: elige qué producto es antes de entregarlo.`;
  }
  const traducido = renglon.cantidad !== null && renglon.productoId === captura.productoId;
  const pedida = traducido
    ? aDiezmilesimas(renglon.cantidad)
    : captura.pedida.trim() === ''
      ? null
      : aDiezmilesimas(captura.pedida);
  if (!traducido && captura.pedida.trim() !== '' && pedida === null) {
    return `«${renglon.textoPedido}»: lo que pidió no es una cantidad.`;
  }
  const yaSurtida = aDiezmilesimas(renglon.surtida) ?? 0n;
  if (pedida !== null && yaSurtida + ahora > pedida) {
    return `«${renglon.textoPedido}»: pidió ${deDiezmilesimas(pedida)}; no se le entrega más.`;
  }
  return null;
}

/** El cuerpo de `lista_trabajo.surtir` y lo que impide mandarlo. */
export function pedidoDeSurtido(
  listaId: string,
  renglones: readonly RenglonDeLista[],
  capturas: Readonly<Record<string, CapturaDeRenglon>>,
): PedidoDeSurtido {
  const problemas: string[] = [];
  const cuerpo: RenglonParaSurtir[] = [];
  for (const renglon of renglones) {
    const captura = capturas[renglon.renglonId] ?? capturaInicial(renglon);
    const problema = problemaDe(renglon, captura);
    if (problema !== null) {
      problemas.push(problema);
      continue;
    }
    const ahora = captura.ahora.trim() === '' ? 0n : (aDiezmilesimas(captura.ahora) ?? 0n);
    if (ahora === 0n && !captura.noHay) continue;
    const traducido = renglon.cantidad !== null && renglon.productoId === captura.productoId;
    cuerpo.push({
      renglonId: renglon.renglonId,
      productoId: captura.productoId,
      cantidad: ahora === 0n ? null : deDiezmilesimas(ahora),
      cantidadPedida:
        traducido || captura.pedida.trim() === ''
          ? null
          : deDiezmilesimas(aDiezmilesimas(captura.pedida) ?? 0n),
      sinExistencia: ahora === 0n && captura.noHay,
    });
  }
  if (problemas.length === 0 && cuerpo.length === 0) {
    problemas.push('No hay nada que entregar ni que marcar como faltante.');
  }
  return { cuerpo: { listaId, renglones: cuerpo }, problemas };
}
