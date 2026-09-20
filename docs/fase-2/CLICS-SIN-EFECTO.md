# CLICS SIN EFECTO · lo que se toca y no pasa nada, a propósito

`pruebas/e2e/rastreo.spec.ts` toca **todo** lo interactivo de cada pantalla y exige que cada toque
haga al menos una de tres cosas: que salga una petición, que cambie la URL o que cambie el DOM. Si no
hace ninguna, es un botón muerto y la prueba falla nombrándolo.

Algunos botones no deben hacer nada, y eso es una decisión. Esos se declaran **aquí**, uno por línea,
**con su motivo**. La prueba lee este archivo; lo que no esté aquí y no haga nada, la rompe.

## El formato, que la prueba entiende literalmente

```
CLIC-SIN-EFECTO /ruta «Texto del botón» — el motivo, en una frase
```

- **`/ruta`** es la de la pantalla, tal como la sirve el menú.
- **`«Texto»`** es lo que el rastreador leyó del botón: su `aria-label` si lo tiene, y si no su texto
  visible, normalizado a un espacio y recortado a 80 caracteres.
- **El motivo** no es decoración: es lo que hace que esta lista no crezca sola. «Es así» no es un
  motivo.

## Lo que NO hace falta declarar, porque la prueba ya lo sabe

| Qué | Por qué |
|---|---|
| Lo **deshabilitado** | No se puede tocar, y lo que se mide es el efecto de un toque. Un `disabled` que además no tiene `onClick` se caza leyendo el código |
| Lo que **sale de la aplicación** —`wa.me`, `mailto:`, `tel:`, otro origen— | Su efecto es irse, y eso no se mide desde dentro. El rastreador los cuenta y los imprime |
| **Salir** | Cerraría la sesión y con ella el rastreo |
| Lo que **no reaparece al recargar** | Depende de un estado que el rastreo no reproduce —una fila seleccionada, un diálogo abierto—. Se cuenta y se imprime, para que se vea cuánto queda fuera |

## La lista

Vacía. Cada línea que se añada aquí es un botón que el producto promete y no cumple, o una decisión
que hay que poder defender en una frase.

<!-- CLIC-SIN-EFECTO /ruta «Texto» — motivo -->
