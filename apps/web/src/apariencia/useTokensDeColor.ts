'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Lee los tokens de color que hay en pantalla AHORA MISMO.
 *
 * El DOM es un sistema externo: los valores no viven en React, los pone la
 * cascada de CSS segun el estilo y el modo activos. Por eso se suscribe con
 * `useSyncExternalStore` y un observador de mutaciones sobre `<html>`, en vez
 * de leerlos en un efecto y guardarlos en estado.
 *
 * La diferencia no es de estilo: con el observador, cambiar de estilo o de modo
 * **actualiza las cifras solo**, sin que nadie tenga que acordarse de pasar una
 * clave de invalidacion. Un valor de contraste que se queda viejo es peor que
 * no mostrarlo.
 */

/** Los atributos de `<html>` que cambian la paleta. */
const ATRIBUTOS = ['data-estilo', 'class'];

function suscribir(alCambiar: () => void): () => void {
  const observador = new MutationObserver(alCambiar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ATRIBUTOS,
  });
  return () => {
    observador.disconnect();
  };
}

/**
 * Cache de la instantanea.
 *
 * `useSyncExternalStore` exige que dos llamadas seguidas devuelvan el MISMO
 * objeto si nada cambio; si no, React entra en un bucle de renderizado. Por eso
 * se guarda la ultima lectura y solo se reemplaza cuando algun valor difiere.
 */
let ultima: Readonly<Record<string, string>> = {};
let ultimaFirma = '';

function leerDelDom(tokens: readonly string[]): Readonly<Record<string, string>> {
  const estilos = getComputedStyle(document.documentElement);
  const leidos: Record<string, string> = {};
  for (const token of tokens) {
    leidos[token] = estilos.getPropertyValue(`--${token}`).trim();
  }

  const firma = JSON.stringify(leidos);
  if (firma !== ultimaFirma) {
    ultimaFirma = firma;
    ultima = leidos;
  }
  return ultima;
}

/** En el servidor no hay DOM: se devuelve vacio y la interfaz muestra un guion. */
const VACIO: Readonly<Record<string, string>> = {};

export function useTokensDeColor(tokens: readonly string[]): Readonly<Record<string, string>> {
  const instantanea = useCallback(() => leerDelDom(tokens), [tokens]);
  return useSyncExternalStore(suscribir, instantanea, () => VACIO);
}
