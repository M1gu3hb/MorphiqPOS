'use client';

import { useEffect } from 'react';

import { useConfig } from '@/lib/ConfigContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { inicioDeLaSesion } from '@/lib/packageConfig';
import { hasPermission } from '@/lib/permissions';
import { useRouter } from 'next/navigation';

/** Lo que se lee de los contextos heredados, que son JavaScript y el compilador no los tipa. */
interface QuienEntro {
  readonly posUser: { readonly rol: string } | null;
}
interface ConfiguracionDelNegocio {
  readonly config: { readonly paquete_modo?: string } | null;
}

/**
 * LA CASA DE QUIEN NO VE EL TABLERO (bloque D de la 2.4).
 *
 * `/` servía el tablero del dueño a todo el negocio: a la cajera y al almacén, cuyo puesto no
 * lo puede leer, les pintaba su estado de error («403» del tablero) en lugar de su inicio. La
 * ficha de la tienda lo dice con todas sus letras —«la pantalla de inicio no es un
 * dashboard, es la de cobro»—, así que aquí se va a la misma casa a la que manda el PIN al
 * entrar (`inicioDeLaSesion`): la primera entrada de SU menú.
 */
export function IrAlInicioDelRol() {
  const { posUser } = usePOSAuth() as unknown as QuienEntro;
  const { config } = useConfig() as unknown as ConfiguracionDelNegocio;
  const router = useRouter();
  const rol = posUser?.rol ?? null;
  const plantilla = config?.paquete_modo;

  useEffect(() => {
    if (rol === null) return;
    const casa = inicioDeLaSesion(rol, plantilla, hasPermission);
    if (casa !== '/') router.replace(casa);
  }, [rol, plantilla, router]);

  return null;
}
