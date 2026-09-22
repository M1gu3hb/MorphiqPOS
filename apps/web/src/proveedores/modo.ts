/**
 * EL MODO DEL SISTEMA, derivado del de Miguel · `data-modo` a partir de `.dark`.
 *
 * Hay UN modo oscuro y dos códigos que lo leen, cada uno en su idioma:
 *
 *   · el heredado —los 244 archivos de Miguel— escribe `dark:` y su `ThemeContext`
 *     pone la clase `.dark` en el `<html>`. Eso no se toca;
 *   · el sistema —`packages/ui`, las pantallas de los modelos— escribe `oscuro:`, y
 *     sus ocho estilos cambian la paleta bajo `[data-modo='oscuro']`.
 *
 * Este guion es el único puente: lee la clase y escribe el atributo, ANTES del
 * primer pintado —va inline en el `<head>`, detrás del que pone la clase— y después
 * en cada cambio, con un `MutationObserver` que mira sólo el atributo `class` del
 * `<html>`. Sin él, el sistema pintaría en claro con el heredado en oscuro.
 *
 * Es texto y no una función importada por la misma razón que `GUION_SIN_PARPADEO`:
 * corre antes de que exista React, así que tiene que viajar dentro del HTML.
 */
export const GUION_DEL_MODO =
  `try{` +
  `var r=document.documentElement;` +
  `var p=function(){r.setAttribute('data-modo',r.classList.contains('dark')?'oscuro':'claro')};` +
  `p();` +
  `new MutationObserver(p).observe(r,{attributes:true,attributeFilter:['class']});` +
  `}catch(e){}`;
