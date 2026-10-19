import { Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { Store } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * LA ENTRADA DE UN DESPLIEGUE QUE SIRVE A VARIOS NEGOCIOS, sin decir cuál.
 *
 * Antes era la pantalla de acceso con las tarjetas de TODOS: el personal de un cliente
 * a la vista de cualquiera que abriera la dirección. Aquí no hay un solo nombre —ni de
 * negocio ni de persona—, porque decir «estos son los negocios de este despliegue»
 * también es una fuga. Lo único que se dice es cómo se entra: por la dirección del
 * negocio, que es la que el negocio guarda.
 *
 * Es un VACÍO, y se pinta como el del sistema: no hay a quién enseñar. Una caja que ya
 * entró antes no llega aquí: `/login-pos` la manda a su entrada (la recuerda una
 * cookie, o su terminal).
 */
export function EntradaSinNegocio(): ReactElement {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-fondo px-(--espacio-4) py-(--espacio-12) text-texto">
      <h1 className="sr-only">Pantalla de acceso</h1>
      <Superficie nivel={2} radio="lg" relleno={6} className="w-full max-w-md">
        <Vacio
          icono={<Store />}
          titulo="Entra por la dirección de tu negocio"
          explicacion="Esta caja atiende a varios negocios, así que la pantalla de acceso de cada uno tiene su propia dirección, que termina en /login-pos. Pídesela a quien administra tu negocio: después de entrar una vez, esta caja la recuerda y vuelve sola."
          tamano="compacto"
          nivelDeTitulo={2}
        />
      </Superficie>
    </main>
  );
}
