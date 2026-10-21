'use client';
import { QueryClient } from '@tanstack/react-query';

/**
 * Un `QueryClient` NUEVO, con las opciones de siempre.
 *
 * Antes esto exportaba UNA instancia (`queryClientInstance`) que vivía lo que viviera la
 * pestaña, con quien fuera dentro. Ahora cada CONTEXTO —negocio, empleo y plantilla— tiene
 * el suyo (`proveedores/ProveedorDeConsultas.tsx`): al cambiar de contexto se descarta el
 * cliente entero con sus consultas en vuelo, y una respuesta que llega tarde cae en un
 * caché que ya nadie mira.
 */
export function crearQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
