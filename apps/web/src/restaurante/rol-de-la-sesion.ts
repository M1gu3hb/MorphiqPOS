'use client';

import { usePOSAuth } from '@/lib/POSAuthContext';

/** Lo que se lee del contexto heredado, que es JavaScript y el compilador no lo tipa. */
interface QuienEntro {
  readonly posUser: { readonly rol?: string } | null;
}

/**
 * El rol de quien está operando esta pantalla, tal como lo sirve la sesión —`administrador`,
 * `caja`, `mesero`, `cocina` o `almacen`—, o `null` mientras no se sabe. Es el mismo
 * contexto del que cuelga la barra lateral (`IrAlInicioDelRol`): una sola fuente de «quién
 * está dentro». Sólo decide qué se ENSEÑA; el servidor decide qué se permite.
 */
export function useRolDeLaSesion(): string | null {
  const { posUser } = usePOSAuth() as unknown as QuienEntro;
  return posUser?.rol ?? null;
}
