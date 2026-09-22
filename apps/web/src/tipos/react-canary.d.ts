/**
 * Los tipos de React canary: `<ViewTransition>` y `addTransitionType`.
 *
 * El App Router de Next 16 trae React canary por dentro —`import { ViewTransition }
 * from 'react'` funciona sin instalar nada—, pero `@types/react` guarda esos tipos en
 * `react/canary` y Next no los referencia. Sin esta línea, la transición de la mesa que
 * se expande a la cuenta no compila aunque en el navegador funcione.
 */
/// <reference types="react/canary" />
