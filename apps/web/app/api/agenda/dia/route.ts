import { agendaDelDia } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-400 · La rejilla del dia: una columna por profesional, con sus ventanas de
 * horario, sus citas y los bloqueos del salon.
 *
 * Lo ocupado son los tramos ACTIVOS y no la ocupacion entera: contar el
 * procesado como ocupado es lo que hace que la agenda se vea llena a las once
 * cuando hay hueco para un corte.
 */
export const POST = manejadorDeComando(agendaDelDia);

export const runtime = 'nodejs';
