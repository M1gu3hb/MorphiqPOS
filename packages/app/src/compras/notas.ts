/**
 * Los dos datos que hoy viajan DENTRO del texto de `notas` (F1-04 §25.1).
 *
 * `RegistrarGastoDialog.jsx:51-53` no guarda un booleano: antepone
 * «[RECURRENTE/FIJO MENSUAL]» a la nota. `PlantillasGastoSection.jsx:97-106`
 * tampoco guarda `plantilla_id`: antepone «[Desde plantilla: X]», y el
 * anti-duplicado de `:81` depende de emparejar ese texto. Los dos se pierden en
 * cuanto alguien edita la nota.
 *
 * En el destino son columnas. Esta función existe por los gastos YA capturados:
 * al leerlos, y al recibirlos de una pantalla todavía sin portar, el prefijo se
 * reconoce y se convierte en las columnas que le tocan, en vez de quedar como
 * ruido delante de la nota.
 */

const PREFIJO_RECURRENTE = /^\s*\[RECURRENTE\/FIJO MENSUAL\]\s*/i;
const PREFIJO_PLANTILLA = /^\s*\[Desde plantilla:\s*([^\]]*)\]\s*/i;

export interface NotasDeGasto {
  /** La nota sin prefijos. `null` si no queda nada. */
  readonly notas: string | null;
  readonly esRecurrente: boolean;
  /** El nombre que traía «[Desde plantilla: X]». No es un id: hay que resolverlo. */
  readonly nombrePlantilla: string | null;
}

export function reconocerNotasHeredadas(texto: string | null | undefined): NotasDeGasto {
  let resto = texto ?? '';
  let esRecurrente = false;
  let nombrePlantilla: string | null = null;

  // En bucle y sin orden fijo: los dos prefijos pueden venir juntos y nada
  // garantiza cuál se antepuso primero.
  for (let vuelta = 0; vuelta < 2; vuelta += 1) {
    const recurrente = PREFIJO_RECURRENTE.exec(resto);
    if (recurrente !== null) {
      esRecurrente = true;
      resto = resto.slice(recurrente[0].length);
      continue;
    }
    const plantilla = PREFIJO_PLANTILLA.exec(resto);
    if (plantilla !== null) {
      nombrePlantilla = (plantilla[1] ?? '').trim() || null;
      resto = resto.slice(plantilla[0].length);
      continue;
    }
    break;
  }

  const limpio = resto.trim();
  return { notas: limpio === '' ? null : limpio, esRecurrente, nombrePlantilla };
}
