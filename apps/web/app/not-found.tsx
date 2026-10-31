import { Button } from '@morphiqpos/ui/primitivas/button';
import type { Metadata } from 'next';
import Link from 'next/link';

import { MorfiNoEncontrada } from '~/morfi/MorfiNoEncontrada';

/**
 * LA PÁGINA QUE NO EXISTE.
 *
 * Hasta la 2.4 esto montaba el `PageNotFound` heredado: la plantilla de la plataforma
 * anterior, en inglés —«Page Not Found», «Go Home»— y con una «Admin Note» que le decía
 * al administrador que «la IA todavía no implementó esta página» y que se lo pidiera «en
 * el chat». En un punto de venta en español, con el 404 como única respuesta a un enlace
 * viejo o a una dirección mal tecleada, era lo primero que veía quien se equivocaba.
 *
 * Un 404 de verdad (lo pone Next al servir este archivo) y que no se indexe: un buscador
 * no tiene nada que guardar aquí.
 *
 * DP-11.1: Morfi se asoma por un hoyo de la tarjeta y señala «Ir al inicio»; con «Mascota
 * Morfi» apagada, el vacío del sistema con el mismo texto.
 */
export const metadata: Metadata = {
  title: 'Esta página no existe',
  robots: { index: false, follow: false },
};

export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-fondo p-(--espacio-4)">
      <MorfiNoEncontrada
        titulo="Esta página no existe"
        explicacion="Puede que la hayan movido o borrado."
        nivelDeTitulo={2}
        accion={
          <Button asChild>
            <Link href="/">Ir al inicio</Link>
          </Button>
        }
      />
    </main>
  );
}
