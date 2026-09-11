/**
 * Lo que hay que saber del tema ANTES de que exista React.
 *
 * Vive fuera de `lib/ThemeContext.jsx` por una razón mecánica: aquél es un
 * módulo `'use client'`, y un componente de servidor no puede importar de él
 * una constante suelta. `app/layout.tsx` necesita el guion como TEXTO para
 * inyectarlo en el HTML.
 *
 * Su `ThemeContext` inicializaba el tema leyendo `localStorage` dentro del
 * `useState`, que en una SPA de Vite corre antes del primer pintado. Bajo SSR
 * el servidor no tiene `localStorage`, así que sin este guion la página se
 * pinta clara y salta a oscura en cada carga. La clave y la clase son las
 * suyas: `mh_theme` y `dark`.
 */
export const CLAVE_TEMA = 'mh_theme';

export const GUION_SIN_PARPADEO =
  `try{` +
  `var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});` +
  `var d=t==='dark';` +
  `var r=document.documentElement;` +
  `r.classList.toggle('dark',d);` +
  `r.style.colorScheme=d?'dark':'light';` +
  `}catch(e){}`;
