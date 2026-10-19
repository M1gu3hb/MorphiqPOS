import {
  UNIDADES_DEL_PUENTE,
  type CampoDeDinero,
  type EntidadConDinero,
} from './unidades-del-puente';

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

/**
 * EL ÚNICO CAMINO de un importe del puente a centavos (bloque C.2 de la 2.4).
 *
 * La unidad la decide la `conversion` del campo en el mapa —`'dinero'` llega en pesos,
 * los `'entero'` de centavos llegan en centavos—, NUNCA el nombre: 22 campos se llaman
 * `_centavos` y llegan en pesos. `CitaEnCurso` pintaba una cita de $350.00 como $3.50 por
 * fiarse del nombre (C.1).
 *
 * La entidad y el campo van escritos a propósito: TypeScript sólo acepta un campo de
 * dinero de ESA entidad (`unidades-del-puente.ts`, generado del mapa), y
 * `pnpm verify:unidades` exige que toda lectura de un campo de dinero de una fila del
 * puente pase por aquí.
 */
export function centavosDe<E extends EntidadConDinero>(
  entidad: E,
  campo: CampoDeDinero<E>,
  valor: unknown,
): number | null {
  const unidades: Readonly<Record<string, 'pesos' | 'centavos'>> = UNIDADES_DEL_PUENTE[entidad];
  const unidad = unidades[campo];
  if (valor === null || valor === undefined) return null;
  if (unidad === 'pesos') {
    return typeof valor === 'number' || typeof valor === 'string' ? centavosDelPuente(valor) : null;
  }
  const numero = typeof valor === 'bigint' ? Number(valor) : Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : null;
}

/**
 * Y de vuelta, para ESCRIBIR un importe en un campo del puente: pesos si el campo es
 * `'dinero'`, centavos si no. Contando dígitos, sin multiplicar coma flotante.
 */
export function valorDelPuente<E extends EntidadConDinero>(
  entidad: E,
  campo: CampoDeDinero<E>,
  centavos: number,
): number {
  const unidades: Readonly<Record<string, 'pesos' | 'centavos'>> = UNIDADES_DEL_PUENTE[entidad];
  if (unidades[campo] !== 'pesos') return Math.trunc(centavos);
  const signo = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(Math.trunc(centavos));
  return Number(
    `${signo}${String(Math.floor(absoluto / 100))}.${String(absoluto % 100).padStart(2, '0')}`,
  );
}
