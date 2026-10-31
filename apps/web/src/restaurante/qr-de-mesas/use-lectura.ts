'use client';

import { useEffect, useState } from 'react';

import { comprobarLectura, type ResultadoDeLectura } from './comprobar-lectura';
import { svgDeLaPieza, type PiezaDeMesa } from './pieza';

/** Lo que dice la revisión de lectura de una pieza mientras se diseña. */
export type EstadoDeLectura =
  | { readonly fase: 'revisando' }
  | { readonly fase: 'lista'; readonly resultado: ResultadoDeLectura }
  | { readonly fase: 'fallo'; readonly mensaje: string };

const ESPERA_MS = 350;
const REVISANDO: EstadoDeLectura = { fase: 'revisando' };

/**
 * Revisa si la pieza se lee cada vez que cambia el diseño, con una pausa corta para no revisar
 * a cada tecla. Cada resultado se guarda con la pieza que revisó: mientras no haya uno de la
 * pieza de AHORA, se está revisando (una revisión vieja que termina tarde no cuenta).
 */
export function useLectura(pieza: PiezaDeMesa | null): EstadoDeLectura {
  const [ultimo, setUltimo] = useState<{
    readonly de: PiezaDeMesa;
    readonly estado: EstadoDeLectura;
  } | null>(null);
  const contenido = pieza?.contenido;
  const numero = pieza?.numero;
  const diseno = pieza?.diseno;
  const logo = pieza?.logo;

  useEffect(() => {
    if (
      contenido === undefined ||
      numero === undefined ||
      diseno === undefined ||
      logo === undefined
    ) {
      return undefined;
    }
    const de = { contenido, numero, diseno, logo };
    let vigente = true;
    const espera = setTimeout(() => {
      comprobarLectura(svgDeLaPieza(de), contenido).then(
        (resultado) => {
          if (vigente) setUltimo({ de, estado: { fase: 'lista', resultado } });
        },
        (error: unknown) => {
          const mensaje = error instanceof Error ? error.message : 'No se pudo revisar el QR.';
          if (vigente) setUltimo({ de, estado: { fase: 'fallo', mensaje } });
        },
      );
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [contenido, numero, diseno, logo]);

  const esDeAhora =
    ultimo !== null &&
    ultimo.de.contenido === contenido &&
    ultimo.de.numero === numero &&
    ultimo.de.diseno === diseno &&
    ultimo.de.logo === logo;
  return esDeAhora ? ultimo.estado : REVISANDO;
}
