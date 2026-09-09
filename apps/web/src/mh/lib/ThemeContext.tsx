'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { CLAVE_TEMA } from './temaArranque.ts';

/**
 * ThemeContext — modo claro / oscuro global.
 *
 * - 100% estético: solo toggle de la clase `.dark` en <html>.
 * - Persistencia por dispositivo en localStorage (key: `mh_theme`).
 * - Funciona con shadcn/Tailwind: `dark:` está declarada sobre `.dark` en
 *   `globals.css` y `mh-tokens.css` ya define todas las variables HSL para
 *   `.dark`.
 * - Animación: una clase temporal `.theme-anim` se aplica al <html> para que
 *   transiciones CSS de fondo/borde/color tomen efecto solo durante el cambio
 *   y no permanentemente (evita reflows costosos en móvil).
 *
 * NO toca lógica de negocio, datos, entidades ni queries.
 *
 * ── Portado de `historico/restaurante/src/lib/ThemeContext.jsx` ────────────
 * Dos adaptaciones, las dos forzadas por el cambio de Vite (SPA) a Next (SSR):
 *
 * 1 · Se pone TAMBIÉN la clase `oscuro`. Las 36 primitivas de `@morphiqpos/ui`
 *     escriben `oscuro:` y no `dark:`; las dos variantes apuntan a la misma
 *     clase, así que llevar las dos deja los dos vocabularios vivos sin que
 *     existan dos modos oscuros distintos.
 *
 * 2 · El estado ya NO se inicializa leyendo `localStorage` dentro del
 *     `useState`. En una SPA eso corría antes del primer pintado y estaba bien;
 *     bajo SSR el servidor no tiene `localStorage`, devolvería `light` siempre
 *     y el icono del interruptor no coincidiría con el HTML hidratado. Quien
 *     evita el parpadeo ahora es el guion en línea de `layout.tsx`, que pone la
 *     clase ANTES de pintar; este efecto sólo alinea el estado de React con lo
 *     que ya se ve. El resultado en pantalla es el mismo que tenía.
 */

const STORAGE_KEY = CLAVE_TEMA;
const ANIM_CLASS = 'theme-anim';
const ANIM_MS = 500;

export type Tema = 'light' | 'dark';

function readStored(): Tema {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* no-op */
  }
  return 'light';
}

function applyThemeToRoot(theme: Tema): void {
  try {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark', 'oscuro');
    else root.classList.remove('dark', 'oscuro');
    // Marca el color-scheme nativo para inputs/scrollbars.
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  } catch {
    /* no-op */
  }
}

function pulseAnimClass(): void {
  try {
    const root = document.documentElement;
    root.classList.add(ANIM_CLASS);
    window.setTimeout(() => {
      try {
        root.classList.remove(ANIM_CLASS);
      } catch {
        /* no-op */
      }
    }, ANIM_MS + 50);
  } catch {
    /* no-op */
  }
}

export interface ValorTema {
  readonly theme: Tema;
  readonly isDark: boolean;
  readonly toggle: () => void;
  readonly setTheme: (next: Tema) => void;
}

const ThemeContext = createContext<ValorTema>({
  theme: 'light',
  isDark: false,
  toggle: () => {
    /* no-op fuera del provider */
  },
  setTheme: () => {
    /* no-op fuera del provider */
  },
});

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setThemeState] = useState<Tema>('light');

  // Alinea el estado con lo que el guion en línea ya pintó en el <html>.
  // No vuelve a tocar la clase: hacerlo aquí la quitaría durante un instante.
  // El `setState` en el efecto es deliberado: `localStorage` es un sistema
  // externo que el servidor no puede leer, y hacerlo durante el render daría
  // un HTML distinto del que se hidrata.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(readStored());
  }, []);

  const setTheme = useCallback((next: Tema) => {
    const value: Tema = next === 'dark' ? 'dark' : 'light';
    pulseAnimClass();
    applyThemeToRoot(value);
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* no-op */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ValorTema {
  return useContext(ThemeContext);
}

/**
 * Hook ligero para componentes que sólo quieren saber si está oscuro.
 * Evita re-render innecesario fuera del provider.
 */
export function useIsDark(): boolean {
  return useContext(ThemeContext).isDark;
}
