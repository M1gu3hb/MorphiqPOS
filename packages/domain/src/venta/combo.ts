import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-030 · Paquetes y combos.
 *
 * ── Por qué un combo NO es un producto con precio bajo ───────────────────
 * Porque lo que sale del inventario son sus COMPONENTES, no el combo. Si se
 * modela como un producto suelto, el café y la concha del «desayuno completo»
 * nunca se descuentan: la existencia de los dos miente hacia arriba toda la
 * semana, el conteo del sábado no cuadra, y nadie sabe qué se vendió de verdad.
 *
 * ── Y por qué el descuento se REPARTE entre los componentes ──────────────
 * El combo de $65 vale $78 sumando sus partes: hay $13 de descuento. Dejarlo
 * como un renglón de descuento suelto haría que el margen del café pareciera el
 * de siempre y el del combo, imposible de leer. Repartido a prorrata, cada
 * componente carga la parte del descuento que le toca, y el reporte por
 * categoría vuelve a decir la verdad.
 *
 * ── El reparto cierra EXACTO, y ése es el detalle caro ───────────────────
 * Repartir 13 entre tres partes deja centavos sueltos. Se reparte a prorrata,
 * se trunca, y lo que sobra se le carga al componente MÁS CARO — no al primero,
 * que dependería del orden de captura, ni al último, que es lo mismo. Así la
 * suma de las partes es siempre el precio del combo, al centavo.
 */

export interface ComponenteDeCombo {
  readonly productoId: string;
  readonly cantidad: number;
  /** Lo que valdría suelto, por la cantidad. Congelado al vender. */
  readonly precioSueltoCentavos: bigint;
}

export interface LineaDeCombo {
  readonly productoId: string;
  readonly cantidad: number;
  readonly precioSueltoCentavos: bigint;
  /** Lo que de verdad se cobra por esta parte, ya repartido el descuento. */
  readonly precioCentavos: bigint;
  readonly descuentoCentavos: bigint;
}

export interface ComboResuelto {
  readonly precioCombo: bigint;
  readonly valorSuelto: bigint;
  readonly descuentoTotal: bigint;
  readonly lineas: readonly LineaDeCombo[];
}

/**
 * F-030 · Resuelve un combo en las líneas que de verdad se venden.
 *
 * Devuelve UNA línea por componente, cada una con su parte del descuento. El
 * combo no aparece como línea: aparece como el `combo_id` que las agrupa, y
 * ésa es la diferencia entre poder descontar inventario y no poder.
 */
export function resolverCombo(
  precioCombo: bigint,
  componentes: readonly ComponenteDeCombo[],
): ComboResuelto {
  if (componentes.length === 0) {
    throw new ErrorDominio('CATALOGO_INVALIDO', 'Un combo sin componentes no vende nada.');
  }
  if (precioCombo < 0n) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Un combo no puede costar menos que nada.');
  }

  const valorSuelto = componentes.reduce((suma, c) => {
    if (c.precioSueltoCentavos < 0n) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `El componente ${c.productoId} tiene precio negativo.`,
      );
    }
    return suma + c.precioSueltoCentavos;
  }, 0n);

  if (valorSuelto === 0n) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Los componentes del combo suman cero: no hay sobre qué repartir.',
    );
  }
  if (precioCombo > valorSuelto) {
    // Un combo más caro que sus partes no es un combo: es un error de captura
    // que el cliente descubre sumando, y con razón.
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'El combo cuesta más que sus componentes sueltos.',
    );
  }

  const descuentoTotal = valorSuelto - precioCombo;

  // A prorrata y truncando. Lo que sobre se carga al componente más caro.
  const parciales = componentes.map((c) => ({
    componente: c,
    descuento: (descuentoTotal * c.precioSueltoCentavos) / valorSuelto,
  }));
  const repartido = parciales.reduce((suma, p) => suma + p.descuento, 0n);
  const sobrante = descuentoTotal - repartido;

  // El más caro, y ante el empate el de `productoId` menor: así el resultado no
  // depende del orden en que la pantalla mandó los componentes.
  let indiceDelMasCaro = 0;
  let mejor = componentes[0];
  for (const [i, actual] of componentes.entries()) {
    if (mejor === undefined) {
      mejor = actual;
      indiceDelMasCaro = i;
      continue;
    }
    const masCaro = actual.precioSueltoCentavos > mejor.precioSueltoCentavos;
    const empateYMenorId =
      actual.precioSueltoCentavos === mejor.precioSueltoCentavos &&
      actual.productoId < mejor.productoId;
    if (masCaro || empateYMenorId) {
      mejor = actual;
      indiceDelMasCaro = i;
    }
  }

  const lineas = parciales.map((p, i) => {
    const descuento = p.descuento + (i === indiceDelMasCaro ? sobrante : 0n);
    return {
      productoId: p.componente.productoId,
      cantidad: p.componente.cantidad,
      precioSueltoCentavos: p.componente.precioSueltoCentavos,
      precioCentavos: p.componente.precioSueltoCentavos - descuento,
      descuentoCentavos: descuento,
    };
  });

  return { precioCombo, valorSuelto, descuentoTotal, lineas };
}
