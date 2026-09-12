/** Valores de identidad compartidos por servidor y vista inicial. */
export const COLOR_PRIMARIO_DEFAULT = '#0f766e';
export const COLOR_ACENTO_DEFAULT = '#f59e0b';

import type { Paquete } from '../comandos/ambito.ts';

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

export function navegacionParaPaquete(paquete: Paquete): readonly ItemNavegacionGestion[] {
  return paquete === 'esencial'
    ? [...NAVEGACION_BASE, ACCESOS, CONFIGURACION]
    : [...NAVEGACION_BASE, INVENTARIO, RECETAS, ACCESOS, CONFIGURACION];
}
