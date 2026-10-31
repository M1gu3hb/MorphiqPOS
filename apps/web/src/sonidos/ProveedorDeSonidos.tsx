'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useTextoDelAparato } from '~/cliente/texto-del-aparato';
import { useExperiencia } from '~/proveedores/Experiencia';

import { cadenaDe, eventoDelClic } from './evento-del-clic';
import { configurarSonidos, desbloquearSonidos, sonar } from './gestor';
import { observarLoQueAparece } from './observador';
import { CLAVE_DEL_SONIDO, gananciaDe, leerPreferenciaDeSonido } from './perfil-del-aparato';
import { silencioDelPortal } from './reglas-del-gestor';

/**
 * LOS SONIDOS DE LA PESTAÑA (DP-11.3). Configura el gestor con lo del aparato (perfil y volumen)
 * y lo del negocio (el teclado, el portal), desbloquea el sonido con el primer toque, y pone el
 * oyente único: lo que se toca suena según `eventoDelClic`, y lo que aparece (un diálogo, un
 * aviso) según `observarLoQueAparece`. Las pantallas sólo llaman a `sonar` para lo que el DOM
 * no dice: un cobro hecho, un pedido que llegó a cocina.
 */
export function ProveedorDeSonidos({ children }: { readonly children: ReactNode }) {
  const texto = useTextoDelAparato(CLAVE_DEL_SONIDO);
  const { experiencia } = useExperiencia();
  const ruta = usePathname();
  const ganancia = gananciaDe(leerPreferenciaDeSonido({ getItem: () => texto }));
  const callar = silencioDelPortal(ruta, experiencia.sonidos_en_el_portal);

  useEffect(() => {
    configurarSonidos({
      ganancia,
      tecla: experiencia.tecla,
      silencioDelPortal: callar,
    });
  }, [ganancia, experiencia.tecla, callar]);

  useEffect(() => {
    const alTocar = (evento: MouseEvent): void => {
      desbloquearSonidos();
      const tocado = evento.target instanceof Element ? evento.target : null;
      const sonido = eventoDelClic(cadenaDe(tocado));
      if (sonido !== null) sonar(sonido);
    };
    const alTeclear = (): void => {
      desbloquearSonidos();
    };
    document.addEventListener('click', alTocar, { capture: true });
    document.addEventListener('keydown', alTeclear, { capture: true });
    const soltar = observarLoQueAparece(document.body, sonar);
    return () => {
      document.removeEventListener('click', alTocar, { capture: true });
      document.removeEventListener('keydown', alTeclear, { capture: true });
      soltar();
    };
  }, []);

  return children;
}
