'use client';

import { useCallback, useEffect, useState } from 'react';

import { ESTILOS, atributosDeEstilo } from '../tokens/estilos';
import {
  PERILLAS,
  type Densidad,
  type Elevacion,
  type Movimiento,
  type Redondeo,
} from '../tokens/contrato';

/**
 * Gobierna la apariencia activa: el estilo y las cuatro perillas.
 *
 * Escribe atributos `data-*` en `<html>`, que es donde el CSS del sistema los
 * espera. No toca el modo claro/oscuro: eso es ortogonal al estilo (§5) y lo
 * lo lleva el `ThemeContext` portado del restaurante, que pone las clases
 * `dark` y `oscuro` juntas en el <html>.
 *
 * El valor inicial es el que el servidor ya pinto en el `<html>`: el estilo que
 * el negocio guardo y, si las guardo, sus cuatro perillas.
 */

export interface Apariencia {
  readonly estilo: string;
  readonly densidad: Densidad;
  readonly redondeo: Redondeo;
  readonly elevacion: Elevacion;
  readonly movimiento: Movimiento;
}

/** Lo que el servidor pinto en el `<html>`: el estilo y, si el negocio las guardo, sus perillas. */
export interface AparienciaInicial {
  readonly estilo: string;
  readonly densidad?: string;
  readonly redondeo?: string;
  readonly elevacion?: string;
  readonly movimiento?: string;
}

/** El valor guardado si es uno de la lista; si no, el que declara el estilo. */
function deLaLista<T extends string>(
  lista: readonly T[],
  guardado: string | undefined,
  porOmision: T,
): T {
  return lista.find((valor) => valor === guardado) ?? porOmision;
}

function aparienciaDe(estilo: string, guardada?: AparienciaInicial): Apariencia {
  const definicion = ESTILOS[estilo];
  if (!definicion) {
    throw new Error(`Estilo desconocido: ${estilo}`);
  }
  const deFabrica = definicion.perillas;
  return {
    estilo,
    densidad: deLaLista(PERILLAS.densidad, guardada?.densidad, deFabrica.densidad),
    redondeo: deLaLista(PERILLAS.redondeo, guardada?.redondeo, deFabrica.redondeo),
    elevacion: deLaLista(PERILLAS.elevacion, guardada?.elevacion, deFabrica.elevacion),
    movimiento: deLaLista(PERILLAS.movimiento, guardada?.movimiento, deFabrica.movimiento),
  };
}

/**
 * Con el nombre de un estilo arranca con sus perillas de fabrica; con la apariencia que
 * el servidor pinto, con las perillas que el negocio guardo. Antes recibia SOLO el
 * nombre, y su efecto pisaba al hidratar las perillas guardadas: «Guardar para el
 * negocio» contestaba bien y al recargar volvian las de fabrica (cierre del 21-10).
 */
export function useApariencia(inicial: string | AparienciaInicial) {
  const [apariencia, setApariencia] = useState<Apariencia>(() =>
    typeof inicial === 'string' ? aparienciaDe(inicial) : aparienciaDe(inicial.estilo, inicial),
  );

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
