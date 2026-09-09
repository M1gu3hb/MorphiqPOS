'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../../lib/ThemeContext.tsx';

/**
 * Botón compacto para alternar modo claro / oscuro.
 *
 * Props:
 *  - variant: 'icon' | 'sidebar' | 'compact'
 *      icon    → solo ícono (44px, ideal headers densos)
 *      sidebar → barra ancha con texto (sidebar)
 *      compact → píldora con icono y texto corto (Portal QR)
 *  - className: clases extra (override)
 *
 * No usa lógica de negocio. Solo cambia la clase `.dark` global.
 *
 * Portado de `historico/restaurante/src/components/common/ThemeToggle.jsx`
 * sin cambios: mismas clases, mismos textos, mismas tres variantes.
 */

export type VarianteTema = 'icon' | 'sidebar' | 'compact';

interface Props {
  readonly variant?: VarianteTema;
  readonly className?: string;
  readonly label?: string;
}

export default function ThemeToggle({ variant = 'icon', className = '', label }: Props) {
  const { isDark, toggle } = useTheme();
  const Icon = isDark ? Sun : Moon;
  const aria = isDark ? 'Activar modo claro' : 'Activar modo oscuro';
  const text = label ?? (isDark ? 'Modo claro' : 'Modo oscuro');

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={aria}
        title={aria}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground ${className}`}
      >
        <Icon
          className="w-5 h-5 shrink-0 transition-transform duration-300"
          style={{ transform: isDark ? 'rotate(0deg)' : 'rotate(-15deg)' }}
        />
        <span className="truncate">{text}</span>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={aria}
        title={aria}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium border bg-card text-foreground hover:bg-accent transition-colors active:scale-95 ${className}`}
      >
        <Icon className="w-4 h-4" />
        <span>{text}</span>
      </button>
    );
  }

  // variant === 'icon'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={aria}
      title={aria}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full border bg-card text-foreground hover:bg-accent transition-colors active:scale-95 ${className}`}
    >
      <Icon
        className="w-4 h-4 transition-transform duration-300"
        style={{ transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(-30deg) scale(1)' }}
      />
    </button>
  );
}
