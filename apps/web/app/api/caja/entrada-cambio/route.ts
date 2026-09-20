import { registrarEntradaDeCambio } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Meter cambio a la caja a media manana. NO es deposito ni venta: es FONDO.
 *
 * Registrarlo como venta infla el dia; no registrarlo hace que el arqueo de la
 * noche encuentre $600 de mas y que el cajero pase veinte minutos buscando una
 * venta que no existe.
 *
 * Con desglose, porque «entraron $600» no dice si se puede dar cambio y
 * «entraron $600 en monedas de diez» si. Y el fondo esperado SUBE: si no
 * subiera, el corte sobraria por diseno y dejaria de detectar el faltante.
 */
export const POST = manejadorDeComando(registrarEntradaDeCambio);

export const runtime = 'nodejs';
