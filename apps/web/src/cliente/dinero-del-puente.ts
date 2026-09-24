/**
 * LOS PESOS DEL PUENTE, DE VUELTA A CENTAVOS.
 *
 * El puente (`packages/app/src/puente/tipos.ts`, `haciaEl`) entrega en PESOS todo campo
 * con `conversion: 'dinero'`, aunque se llame `precio_centavos` o `saldo_documento_centavos`:
 * es la forma que esperaban las pantallas heredadas. Las del sistema hablan en centavos
 * —`<Dinero centavos>`, los comandos— y cada una lo resolvía a su manera; cinco no lo
 * resolvían y pintaban $180.00 donde el cliente debía $18,000.00.
 *
 * Contando dígitos y no con `Math.round(pesos * 100)`: la regla del dinero del proyecto
 * (`00-LEEME-PRIMERO` §5) no admite multiplicar coma flotante. Un valor del puente es un
 * entero de centavos dividido entre 100, y su texto más corto nunca lleva más de dos
 * decimales.
 *
 * `null` —el campo no vino, o no es un número— se devuelve como `null`: la pantalla decide
 * si eso es cero o «—». Convertirlo aquí en cero escondería una lectura rota.
 */
export function centavosDelPuente(pesos: number | string | null | undefined): number | null {
  if (pesos === null || pesos === undefined) return null;
  const numero = typeof pesos === 'string' ? Number(pesos) : pesos;
  if (!Number.isFinite(numero)) return null;
  const [entero = '0', decimal = '00'] = Math.abs(numero).toFixed(2).split('.');
  const centavos = Number(entero) * 100 + Number(decimal);
  return numero < 0 ? -centavos : centavos;
}
