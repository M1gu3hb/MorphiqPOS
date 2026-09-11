'use client';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// `typeof window` de guarda: en su Vite siempre había ventana, aquí el
// servidor renderiza primero y sin esto revienta el módulo entero —y con él
// `toast.jsx`, `toaster.jsx`, los proveedores y las catorce pantallas—.
// En el navegador el valor es exactamente el mismo.
export const isIframe = typeof window !== 'undefined' && window.self !== window.top;
