/**
 * CÓMO SE LLAMA UNA CUENTA EN LA LISTA DE LA CAJA (día completo del restaurante, 2.4).
 *
 * La lista se armaba con las mesas que pidieron la cuenta, y de cada una salía su nombre: «Mesa
 * 5». Una cuenta DIVIDIDA no cabe en eso: cada parte es una cuenta que se cobra por separado y
 * ninguna tiene mesa —la conserva la madre—, así que la lista ni siquiera las traía y quien
 * dividió no tenía cómo cobrar lo que acababa de partir.
 *
 * Ahora la lista son las cuentas PEDIDAS, tengan mesa o no, y la parte de una división lleva su
 * nombre en `cliente_nombre`: «Mesa 5 · cuenta 1 de 2». Sin mesa y sin nombre, la cuenta dice
 * de dónde NO viene: «Sin mesa».
 */

export interface CuentaParaRotular {
  readonly mesa_numero: number | null;
  readonly cliente_nombre: string | null;
}

/** Las palabras del giro con las que se nombra la mesa: «Mesa» / «Sin mesa». */
export interface PalabrasDeLaMesa {
  readonly mesa: string;
  readonly sinMesa: string;
}

export function rotuloDeLaCuenta(cuenta: CuentaParaRotular, palabras: PalabrasDeLaMesa): string {
  if (cuenta.mesa_numero !== null) return `${palabras.mesa} ${String(cuenta.mesa_numero)}`;
  const nombre = cuenta.cliente_nombre?.trim() ?? '';
  return nombre === '' ? palabras.sinMesa : nombre;
}
