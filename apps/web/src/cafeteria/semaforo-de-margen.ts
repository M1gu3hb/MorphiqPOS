import { Check, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';

/**
 * EL SEMÁFORO DEL MARGEN de una bebida, en puntos porcentuales.
 *
 * Verde arriba de 65 %, ámbar de 50 a 65 %, rojo debajo de 50 %. No son los umbrales de
 * `restaurante` (60/40): una bebida de café con food cost de 30–35 % debería dejar
 * 65–70 %, y con los del restaurante saldrían en verde bebidas que están mal. El color
 * no va solo: cada tramo lleva su icono y su palabra.
 *
 * Lo usan la receta y su tabla de variantes: si cada una tuviera sus umbrales, el latte
 * de avena podría salir en verde en una y en ámbar en la otra.
 */
export const MARGEN_SANO = 65;
export const MARGEN_JUSTO = 50;

export interface Semaforo {
  readonly palabra: string;
  readonly clase: string;
  readonly Icono: LucideIcon;
}

export function semaforoDe(margen: number): Semaforo {
  if (margen > MARGEN_SANO) return { palabra: 'margen sano', clase: 'bg-exito/20', Icono: Check };
  if (margen >= MARGEN_JUSTO)
    return { palabra: 'margen justo', clase: 'bg-advertencia/30', Icono: TriangleAlert };
  return { palabra: 'margen bajo', clase: 'bg-peligro/15 text-peligro', Icono: OctagonAlert };
}
