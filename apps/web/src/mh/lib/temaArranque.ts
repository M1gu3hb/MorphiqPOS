/**
 * Lo que hay que saber del tema ANTES de que exista React.
 *
 * Vive aparte de `ThemeContext.tsx` por una razón mecánica: aquel es un módulo
 * `'use client'`, y un componente de servidor no puede importar de él una
 * constante suelta — se la daría como referencia de cliente, no como texto. El
 * `layout.tsx` necesita el guion como texto para inyectarlo en el HTML.
 *
 * La clave y las clases viven aquí una sola vez, así que cambiar una sin la
 * otra no es posible.
 */

/** Dónde guarda el navegador la preferencia. Es la clave que él usaba. */
export const CLAVE_TEMA = 'mh_theme';

/**
 * El guion que corre antes del primer pintado.
 *
 * Sin esto la página se pinta clara y salta a oscura en cada carga, porque el
 * servidor no puede saber qué eligió este dispositivo. Va con el nonce de la
 * CSP o el navegador lo bloquea y vuelve el parpadeo.
 *
 * Pone las DOS clases: `dark` —la suya— y `oscuro`, que es como la llaman las
 * primitivas de `@morphiqpos/ui`. Las dos variantes de Tailwind apuntan a la
 * misma clase, así que no hay dos modos oscuros: hay uno con dos nombres.
 */
export const GUION_SIN_PARPADEO =
  `try{` +
  `var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});` +
  `var d=t==='dark';` +
  `var r=document.documentElement;` +
  `r.classList.toggle('dark',d);` +
  `r.classList.toggle('oscuro',d);` +
  `r.style.colorScheme=d?'dark':'light';` +
  `}catch(e){}`;
