'use client';

import { Aviso } from '@morphiqpos/ui/sistema';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { usePOSAuth } from '@/lib/POSAuthContext';
import { consultarPuente } from '~/cliente/api';

import {
  avisoDeRecetasPendientes,
  recetasPendientes,
  type LineaQuizaActiva,
  type ProductoQuizaConReceta,
} from './receta-pendiente';

/** Quién ve el contador: quien ve el tablero y puede capturar recetas. */
const LO_VEN: ReadonlySet<string> = new Set(['dueno', 'administrador', 'gerente']);

/**
 * EL CONTADOR DEL TABLERO: «N platillos sin receta» (DP-5).
 *
 * Su costo es desconocido, así que la utilidad del día no lo descuenta: el aviso lo dice para
 * que el dueño no lea la utilidad como si fuera completa, y lleva a Recetas con el filtro de
 * pendientes puesto. Con cero no se pinta nada. Si la lectura falla, tampoco: es un aviso, no
 * la pantalla, y el tablero sigue.
 */
export function RecetasPendientes() {
  const { posUser } = usePOSAuth();
  const ve = posUser !== null && LO_VEN.has(posUser.rol);
  const [cuantos, setCuantos] = useState(0);

  useEffect(() => {
    if (!ve) return undefined;
    const control = new AbortController();
    Promise.all([
      consultarPuente<ProductoQuizaConReceta>('ProductoTerminado', {
        filtro: { activo: true },
        limite: 500,
        signal: control.signal,
      }),
      consultarPuente<LineaQuizaActiva>('RecetaEscandallo', {
        limite: 2000,
        signal: control.signal,
      }),
    ])
      .then(([productos, lineas]) => {
        if (!control.signal.aborted) setCuantos(recetasPendientes(productos, lineas).size);
      })
      .catch(() => {
        // Un aviso que no se pudo calcular no se enseña: el tablero no depende de él.
        if (!control.signal.aborted) setCuantos(0);
      });
    return () => {
      control.abort();
    };
  }, [ve]);

  const aviso = avisoDeRecetasPendientes(cuantos);
  if (!ve || aviso === null) return null;
  return (
    <Aviso
      tono="atencion"
      icono={<BookOpen className="size-4" aria-hidden="true" />}
      titulo={aviso}
      accion={
        <Link href="/restaurante/recetas?pendientes=1" className="font-medium underline">
          Capturar recetas
        </Link>
      }
    >
      Se venden, pero su costo es desconocido: la utilidad del tablero todavía no lo descuenta.
    </Aviso>
  );
}
