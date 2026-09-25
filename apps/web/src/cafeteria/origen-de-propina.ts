/**
 * El origen de la propina, en la lista CERRADA del servidor (`ORIGENES_DE_PROPINA`, el
 * `check propina_origen` de la 045). La elegida por el cliente en su pantalla cuenta
 * como la del portal —la eligió él, en una pantalla suya—; la tecleada en el
 * mostrador, como la del POS de mostrador. D-18.
 */
export function origenDeLaPropina(segundaPantallaConectada: boolean): 'portal_qr' | 'tradicional' {
  return segundaPantallaConectada ? 'portal_qr' : 'tradicional';
}
