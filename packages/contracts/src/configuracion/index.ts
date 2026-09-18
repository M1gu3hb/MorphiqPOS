/** Valores de identidad compartidos por servidor y vista inicial. */
export const COLOR_PRIMARIO_DEFAULT = '#0f766e';
export const COLOR_ACENTO_DEFAULT = '#f59e0b';

import type { Paquete } from '../comandos/ambito.ts';
import { modulosActivos } from '../comandos/plantillas.ts';

export interface ItemNavegacionGestion {
  readonly href:
    '/inicio' | '/productos' | '/inventario' | '/recetas' | '/accesos' | '/configuracion';
  readonly etiqueta: string;
  readonly icono: 'inicio' | 'productos' | 'inventario' | 'recetas' | 'accesos' | 'configuracion';
}

const NAVEGACION_BASE = [
  { href: '/inicio', etiqueta: 'Inicio', icono: 'inicio' },
  { href: '/productos', etiqueta: 'Productos', icono: 'productos' },
] as const satisfies readonly ItemNavegacionGestion[];

const INVENTARIO = {
  href: '/inventario',
  etiqueta: 'Inventario',
  icono: 'inventario',
} as const satisfies ItemNavegacionGestion;

const RECETAS = {
  href: '/recetas',
  etiqueta: 'Recetas',
  icono: 'recetas',
} as const satisfies ItemNavegacionGestion;

const ACCESOS = {
  href: '/accesos',
  etiqueta: 'Accesos',
  icono: 'accesos',
} as const satisfies ItemNavegacionGestion;

const CONFIGURACION = {
  href: '/configuracion',
  etiqueta: 'Configuración',
  icono: 'configuracion',
} as const satisfies ItemNavegacionGestion;

/**
 * La navegación de gestión de una plantilla.
 *
 * ── Por qué sale del preajuste de módulos y no de un `if` ──────────────────
 * Estaba escrita como `paquete === 'esencial' ? sin-inventario : con-todo`, y
 * ese nivel dejó de existir con el renombre de D-01. Peor que quedar obsoleta:
 * era una SEGUNDA declaración de qué tiene cada plantilla, al lado de
 * `MODULOS_POR_PLANTILLA`, y dos declaraciones de lo mismo acaban diciendo
 * cosas distintas. El menú enseñaba «Recetas» y el comando devolvía 403, o al
 * revés, y nadie sabía cuál de las dos tenía razón.
 *
 * Ahora el menú se DERIVA del preajuste: si la plantilla trae el módulo, el
 * enlace aparece. Una sola fuente, y cambiarla llega a los dos sitios.
 */
export function navegacionParaPaquete(paquete: Paquete): readonly ItemNavegacionGestion[] {
  const modulos = modulosActivos(paquete);
  return [
    ...NAVEGACION_BASE,
    ...(modulos.has('inventario') ? [INVENTARIO] : []),
    ...(modulos.has('recetas') ? [RECETAS] : []),
    ACCESOS,
    CONFIGURACION,
  ];
}
