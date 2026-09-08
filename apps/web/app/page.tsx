import { redirect } from 'next/navigation';

/**
 * Raíz de la aplicación.
 *
 * Lleva a la venta, que es para lo que existe un punto de venta. Si la terminal
 * no tiene sesión, la propia pantalla pide el PIN; si no está enrolada, ofrece
 * darla de alta. Ese encadenamiento vive en las pantallas y no aquí, porque
 * decidirlo en la raíz exigiría leer la sesión dos veces.
 *
 * El sistema de diseño sigue en `/estilos`, pero ya no es la puerta de entrada.
 */
export default function Raiz() {
  redirect('/venta');
}
