import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-145 y F-150 · El corte de material y lo que queda.
 *
 * ── El descuadre 3 del giro, y por qué es propio de aquí ─────────────────
 * Se cortan 60 m de un rollo de 100. Entre lo que se lleva la segueta, lo que
 * se mide de más «para que no le falte» y el pedazo que queda torcido, salen
 * 61.2 m y se cobran 60. Nadie lo nota: son 1.2 m. Pero pasa ocho veces al día
 * en cable, manguera, cadena y alambre, y a fin de mes son decenas de metros
 * que el sistema cree que están y no están. `abarrotes` no corta nada —pesar
 * 800 g de frijol no destruye frijol—; **aquí el acto de vender consume
 * material adicional al vendido**, y si eso no se modela, el inventario de todo
 * el material lineal es ficción desde el primer mes.
 *
 * ── Por qué la merma va junta con la venta, siempre ──────────────────────
 * Porque si se pudiera registrar por separado, no se registraría nunca: son 40
 * cm y hay fila. Yendo juntas, el sistema propone el valor por omisión del tipo
 * de material y la persona lo acepta o lo corrige. Es lo mismo que hace
 * `abarrotes` metiendo el canje de Bimbo en la nota de compra: *lo que se
 * captura aparte, no se captura*.
 *
 * ── Por qué el retazo tiene que existir como concepto ────────────────────
 * El rollo de 100 del que se cortaron 60 y luego 38 deja **2 m que no le sirven
 * a nadie**. Existen físicamente, valen dinero a costo, y no son vendibles a
 * precio de lista. Sin el concepto, el sobrante o infla la existencia —y
 * produce un faltante fantasma en el conteo— o se borra a mano, y descuadra el
 * costo.
 */

export interface PiezaParaCortar {
  /** Lo que le queda a la pieza abierta, en unidad base (milímetros). */
  readonly restanteBase: bigint;
  /** Debajo de esto, el sobrante ya no es vendible a precio de lista. */
  readonly umbralRetazoBase: bigint;
}

export interface SolicitudDeCorte {
  /** Lo que el cliente se lleva. */
  readonly medidaSolicitadaBase: bigint;
  /** Lo que se destruye al cortar. La pantalla lo propone; la persona lo ajusta. */
  readonly mermaBase: bigint;
}

export type DestinoDelSobrante = 'sigue_abierta' | 'retazo' | 'agotada';

export interface CortePlaneado {
  readonly entregadoBase: bigint;
  readonly mermaBase: bigint;
  /** Lo que sale del almacén: lo entregado MÁS la merma. */
  readonly consumidoBase: bigint;
  readonly sobranteBase: bigint;
  readonly destino: DestinoDelSobrante;
}

/**
 * Qué sale del almacén y qué queda en la pieza.
 *
 * ── Por qué el consumo es entregado + merma ──────────────────────────────
 * Porque del rollo salieron los dos. Descontar sólo lo vendido deja la merma
 * dentro del inventario para siempre, y la diferencia aparece completa y de
 * golpe el día del conteo, sin forma de explicarla.
 */
export function planearCorte(pieza: PiezaParaCortar, solicitud: SolicitudDeCorte): CortePlaneado {
  if (solicitud.medidaSolicitadaBase <= 0n) {
    throw new ErrorDominio(CODIGOS_ERROR.CANTIDAD_INVALIDA, 'Un corte de cero no es un corte.', {
      medida: solicitud.medidaSolicitadaBase.toString(),
    });
  }
  if (solicitud.mermaBase < 0n) {
    // Una merma negativa sería material que APARECE al cortar. Es la forma
    // corta de tapar un faltante desde el mostrador.
    throw new ErrorDominio(
      CODIGOS_ERROR.INVENTARIO_INVALIDO,
      'Cortar no produce material: la merma no puede ser negativa.',
      { merma: solicitud.mermaBase.toString() },
    );
  }
  if (pieza.umbralRetazoBase < 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'El umbral de retazo no puede ser negativo.',
      { umbral: pieza.umbralRetazoBase.toString() },
    );
  }

  const consumido = solicitud.medidaSolicitadaBase + solicitud.mermaBase;
  if (consumido > pieza.restanteBase) {
    // No alcanza. Decirlo ANTES de cortar es la diferencia entre una venta que
    // no se hace y un rollo arruinado: el material cortado de menos ya no se
    // vuelve a pegar.
    throw new ErrorDominio(
      CODIGOS_ERROR.STOCK_INSUFICIENTE,
      'A esa pieza no le alcanza para el corte y su merma.',
      {
        restante: pieza.restanteBase.toString(),
        necesario: consumido.toString(),
      },
    );
  }

  const sobrante = pieza.restanteBase - consumido;

  return {
    entregadoBase: solicitud.medidaSolicitadaBase,
    mermaBase: solicitud.mermaBase,
    consumidoBase: consumido,
    sobranteBase: sobrante,
    destino: destinoDe(sobrante, pieza.umbralRetazoBase),
  };
}

/**
 * ── Por qué el cero es `agotada` y no `retazo` ───────────────────────────
 * Porque un retazo de cero metros es una etiqueta pegada a nada. La pieza se
 * cierra, y cerrarla es lo que evita que el mostrador siga viendo un rollo que
 * ya no existe.
 *
 * ── Por qué el umbral se compara con `<=` y no con `<` ───────────────────
 * Porque el umbral es «debajo de esto ya no se vende a precio de lista», y
 * exactamente el umbral es el primer caso que no se vende. Con `<`, el metro
 * justo del umbral se ofrecería a precio de lista y se quedaría en el anaquel
 * para siempre.
 */
function destinoDe(sobrante: bigint, umbral: bigint): DestinoDelSobrante {
  if (sobrante === 0n) return 'agotada';
  if (sobrante <= umbral) return 'retazo';
  return 'sigue_abierta';
}

export interface PiezaAbierta {
  readonly id: string;
  readonly restanteBase: bigint;
  readonly estado: 'abierta' | 'retazo' | 'cerrada';
}

/**
 * De qué pieza se corta, cuando hay varias abiertas.
 *
 * ── Por qué la MÁS CHICA que alcance, y no la más grande ─────────────────
 * Porque el objetivo es cerrar piezas, no abrirlas. Cortando siempre de la más
 * grande, los retazos se acumulan y el rollo entero se convierte en cuatro
 * pedazos invendibles; cortando de la más chica que alcance, cada corte acerca
 * una pieza a agotarse. Es lo que convierte un retazo en una venta.
 *
 * ── Por qué el retazo se ofrece ANTES que la abierta ─────────────────────
 * El retazo ya está marcado como invendible a precio de lista: si alcanza para
 * lo que el cliente pide, sacarlo de ahí recupera dinero que ya estaba dado por
 * perdido. Dejarlo para el final garantiza que nunca salga.
 */
export function piezaParaElCorte(
  piezas: readonly PiezaAbierta[],
  necesarioBase: bigint,
): PiezaAbierta | null {
  const sirven = piezas.filter((p) => p.estado !== 'cerrada' && p.restanteBase >= necesarioBase);
  if (sirven.length === 0) return null;

  const retazos = sirven.filter((p) => p.estado === 'retazo');
  const candidatas = retazos.length > 0 ? retazos : sirven;

  return [...candidatas].sort(compararPiezas)[0] ?? null;
}

function compararPiezas(a: PiezaAbierta, b: PiezaAbierta): number {
  if (a.restanteBase !== b.restanteBase) return a.restanteBase < b.restanteBase ? -1 : 1;
  // Empate: por folio, para que dos llamadas iguales elijan la misma pieza. Sin
  // desempate estable, dos cortes simultáneos podrían elegir cada uno la suya.
  return a.id.localeCompare(b.id);
}
