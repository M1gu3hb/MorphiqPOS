import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Une clases resolviendo conflictos de Tailwind.
 *
 * Sin `twMerge`, `cn('p-2', 'p-4')` deja las dos y gana la que este antes en la
 * hoja, no la que el autor quiso. Con `twMerge` gana la ultima, que es lo que
 * espera cualquiera que pase una clase por props.
 */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
