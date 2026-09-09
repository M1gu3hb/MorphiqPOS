/** Valores de identidad compartidos por servidor y vista inicial. */
export const COLOR_PRIMARIO_DEFAULT = '#0f766e';
export const COLOR_ACENTO_DEFAULT = '#f59e0b';

import type { Paquete } from '../comandos/ambito.ts';

export interface ItemNavegacionGestion {
  readonly href: '/inicio' | '/productos' | '/inventario' | '/recetas' | '/configuracion';
  readonly etiqueta: string;
  readonly icono: 'inicio' | 'productos' | 'inventario' | 'recetas' | 'configuracion';
}

const NAVEGACION_BASE = [
  { href: '/inicio', etiqueta: 'Inicio', icono: 'inicio' },
  { href: '/productos', etiqueta: 'Productos', icono: 'productos' },
  { href: '/inventario', etiqueta: 'Inventario', icono: 'inventario' },
] as const satisfies readonly ItemNavegacionGestion[];

const RECETAS = {
  href: '/recetas',
  etiqueta: 'Recetas',
  icono: 'recetas',
} as const satisfies ItemNavegacionGestion;

const CONFIGURACION = {
  href: '/configuracion',
  etiqueta: 'Configuración',
  icono: 'configuracion',
} as const satisfies ItemNavegacionGestion;

export function navegacionParaPaquete(paquete: Paquete): readonly ItemNavegacionGestion[] {
  return paquete === 'cafeteria' || paquete === 'restaurante'
    ? [...NAVEGACION_BASE, RECETAS, CONFIGURACION]
    : [...NAVEGACION_BASE, CONFIGURACION];
}
