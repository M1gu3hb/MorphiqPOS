import { depositarComision } from '@morphiqpos/app/abarrotes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-255 · Entregar el dinero ajeno, que es la otra mitad de cobrarlo.
 *
 * Sin esto el pasivo crece para siempre y a los tres meses dice que la tienda le
 * debe $180,000 a Telcel. Un numero que todo el mundo sabe que esta mal es un
 * numero que nadie mira, y con el se apaga la funcion entera.
 *
 * Va al MISMO ledger con signo contrario: dos tablas que se restan para sacar un
 * saldo es exactamente como se le paga dos veces a alguien.
 */
export const POST = manejadorDeComando(depositarComision);

export const runtime = 'nodejs';
