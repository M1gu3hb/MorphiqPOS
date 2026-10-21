'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { EVENTO_CAMBIO_DE_PRESENTACION } from '~/cliente/presentacion';

/**
 * Lleva la pantalla al acceso cuando su sesión quedó del otro lado de la presentación.
 *
 * Una sola vez por carga: diez consultas que contestan lo mismo no navegan diez veces. Antes
 * de salir se cancelan las consultas en vuelo y se vacía el caché, para que nada del contexto
 * anterior se pinte en el siguiente.
 */
export function VigiaDePresentacion() {
  const cliente = useQueryClient();
  useEffect(() => {
    let avisado = false;
    function alCambiar() {
      if (avisado) return;
      avisado = true;
      void cliente.cancelQueries();
      cliente.clear();
      try {
        sessionStorage.removeItem('posUser');
      } catch {
        /* La cookie sigue siendo la fuente de verdad. */
      }
      window.location.replace('/login-pos?aviso=presentacion');
    }
    window.addEventListener(EVENTO_CAMBIO_DE_PRESENTACION, alCambiar);
    return () => {
      window.removeEventListener(EVENTO_CAMBIO_DE_PRESENTACION, alCambiar);
    };
  }, [cliente]);
  return null;
}
