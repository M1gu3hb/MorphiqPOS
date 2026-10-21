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
 *
 * Y el ESTILO: el servidor ya escribe `data-estilo` en el `<html>` (app/layout.tsx), pero si
 * el atributo faltara —una pagina que no pasa por ese layout, un cache viejo— la primera
 * pintura saldria sin un solo token de color. El guion lo pone, ANTES del primer pintado, con
 * el estilo predeterminado (`morphiq`) y sin tocar uno que ya venga: la preferencia del
 * negocio manda siempre.
 */
import { ESTILO_PREDETERMINADO } from '@morphiqpos/ui/tokens';

export const CLAVE_TEMA = 'mh_theme';

export const GUION_SIN_PARPADEO =
  // Primero y en su propio bloque: si `localStorage` lanza (ventana privada), el estilo
  // igual tiene que quedar puesto.
  `try{` +
  `var r=document.documentElement;` +
  `if(!r.getAttribute('data-estilo'))r.setAttribute('data-estilo',${JSON.stringify(ESTILO_PREDETERMINADO)});` +
  `}catch(e){}` +
  `try{` +
  `var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});` +
  `var d=t==='dark';` +
  `var r=document.documentElement;` +
  `r.classList.toggle('dark',d);` +
  `r.style.colorScheme=d?'dark':'light';` +
  `}catch(e){}`;
