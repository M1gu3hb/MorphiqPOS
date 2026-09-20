import { capturarFormula } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-154 · La fórmula que de verdad se mezcló.
 *
 * La pantalla de la cita en curso publicaba aquí y **esto no existía**. Es la
 * escritura que esa pantalla trata como la más grave de todas —«una fórmula
 * perdida en silencio no se recupera jamás»— y tenía razón: la clienta vuelve en
 * seis semanas pidiendo «lo mismo», y sin este registro «lo mismo» es una
 * suposición de la estilista que ese día quizá no está.
 */
export const POST = manejadorDeComando(capturarFormula);

export const runtime = 'nodejs';
