'use client';

import { useCallback, useEffect, useState } from 'react';

import { ESTILOS, atributosDeEstilo } from '../tokens/estilos';
import type { Densidad, Elevacion, Movimiento, Redondeo } from '../tokens/contrato';

/**
 * Gobierna la apariencia activa: el estilo y las cuatro perillas.
 *
 * Escribe atributos `data-*` en `<html>`, que es donde el CSS del sistema los
 * espera. No toca el modo claro/oscuro: eso es ortogonal al estilo (§5) y lo
 * lo lleva el `ThemeContext` portado del restaurante, que pone las clases
 * `dark` y `oscuro` juntas en el <html>.
 *
 * En F1.1 el valor inicial saldra de `configuracion.apariencia` de la
 * organizacion. Hoy arranca con lo que declara el estilo.
 */

export interface Apariencia {
  readonly estilo: string;
  readonly densidad: Densidad;
  readonly redondeo: Redondeo;
  readonly elevacion: Elevacion;
  readonly movimiento: Movimiento;
}

function aparienciaDe(estilo: string): Apariencia {
  const definicion = ESTILOS[estilo];
  if (!definicion) {
    throw new Error(`Estilo desconocido: ${estilo}`);
  }
  return { estilo, ...definicion.perillas };
}

export function useApariencia(estiloInicial: string) {
  const [apariencia, setApariencia] = useState<Apariencia>(() => aparienciaDe(estiloInicial));

  // Se aplica sobre <html> porque los tokens se resuelven en cascada desde la
  // raiz: ponerlos mas abajo dejaria fuera a los dialogos y menus, que Radix
  // monta en un portal al final del body.
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-estilo', apariencia.estilo);
    raiz.setAttribute('data-densidad', apariencia.densidad);
    raiz.setAttribute('data-redondeo', apariencia.redondeo);
    raiz.setAttribute('data-elevacion', apariencia.elevacion);
    raiz.setAttribute('data-movimiento', apariencia.movimiento);
  }, [apariencia]);

  /** Cambiar de estilo restablece las 4 perillas a las que ese estilo declara. */
  const cambiarEstilo = useCallback((estilo: string) => {
    setApariencia(aparienciaDe(estilo));
  }, []);

  /** Ajustar una perilla suelta, sin tocar las demas. */
  const ajustar = useCallback(
    <C extends keyof Omit<Apariencia, 'estilo'>>(perilla: C, valor: Apariencia[C]) => {
      setApariencia((previa) => ({ ...previa, [perilla]: valor }));
    },
    [],
  );

  return { apariencia, cambiarEstilo, ajustar };
}

/** Los atributos de un estilo, para renderizar una vista previa aislada. */
export function atributosPrevisualizacion(estilo: string, modoOscuro: boolean) {
  return {
    ...atributosDeEstilo(estilo),
    className: modoOscuro ? 'oscuro' : undefined,
  };
}
