import { registrarPorPagar } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-635 · Registrar lo que el negocio DEBE. «No sabe cuanto debe, y con
 * credito de 30 a 60 dias del distribuidor es la mitad de su flujo.»
 */
export const POST = manejadorDeComando(registrarPorPagar);

export const runtime = 'nodejs';
