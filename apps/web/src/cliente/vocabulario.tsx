'use client';

import {
  crearVocabulario,
  type Diccionario,
  type Entidad,
  type Vocabulario,
} from '@morphiqpos/domain/vocabulario';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * F-017 · El vocabulario del negocio, disponible en toda pantalla.
 *
 * ── Por qué un contexto y no un `fetch` por pantalla ───────────────────────
 * Son 61 pantallas. Con un `fetch` cada una, abrir el mapa de mesas y volver
 * costaría dos peticiones para leer el mismo objeto de dos campos, y la primera
 * pintada de cada pantalla diría «mesa» hasta que la respuesta llegara — que es
 * exactamente el parpadeo que delata una traducción pegada encima.
 *
 * El envoltorio lo resuelve UNA vez en el servidor, donde ya hay transacción y
 * sesión, y lo baja con el HTML. Cuando la pantalla se monta, los sustantivos
 * ya están.
 *
 * ── Por qué se rearma aquí en vez de mandar los términos resueltos ─────────
 * Porque el diccionario del giro es la misma decisión de producto para los 78
 * modelos y tiene que poder corregirse con un despliegue. `crearVocabulario` es
 * dominio puro, sin dependencias y sin servidor: corre igual en el navegador.
 *
 * ── Qué pasa si no hay proveedor ───────────────────────────────────────────
 * Se devuelve el vocabulario del giro vacío, que nombra todo con el sustantivo
 * neutro. NO se lanza: una pantalla sin sustantivos es peor que una que dice
 * «unidad» donde debería decir «mesa», y el vocabulario no autoriza nada.
 */

export interface TerminosSerializados {
  readonly giro: string;
  readonly personalizado: Diccionario;
}

const Contexto = createContext<Vocabulario | null>(null);

export function ProveedorDeVocabulario({
  terminos,
  children,
}: {
  readonly terminos: TerminosSerializados | null;
  readonly children: ReactNode;
}) {
  const vocabulario = useMemo(
    () => crearVocabulario(terminos?.giro ?? '', terminos?.personalizado ?? {}),
    [terminos],
  );
  return <Contexto.Provider value={vocabulario}>{children}</Contexto.Provider>;
}

/** El vocabulario de este negocio. Nunca es `null`: si falta, es el neutro. */
export function useVocabulario(): Vocabulario {
  const delContexto = useContext(Contexto);
  // `useMemo` con dependencia constante: sin él, una pantalla montada fuera del
  // proveedor rearmaría el vocabulario en cada render.
  const neutro = useMemo(() => crearVocabulario(''), []);
  return delContexto ?? neutro;
}

/**
 * Un sustantivo suelto, que es el 90 % de los usos.
 *
 *   const mesa = useTermino('unidad_servicio');   // «mesa» · «estación» · «bahía»
 */
export function useTermino(entidad: Entidad): string {
  return useVocabulario().singular(entidad);
}
