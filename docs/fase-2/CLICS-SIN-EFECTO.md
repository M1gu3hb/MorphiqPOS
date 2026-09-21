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
| La **opción que ya está puesta** —`aria-pressed`, `aria-selected`, `aria-checked`, `aria-current` o el `data-state` de una pestaña— | Volver a tocar el filtro que ya está seleccionado, o la leche que el café ya lleva, no cambia nada Y ESTÁ BIEN que no cambie: apagarla o deshabilitarla sería peor, porque hay que poder volver a ella desde otra. El rastreador las cuenta y las imprime |
| Lo que **no reaparece al recargar** | Depende de un estado que el rastreo no reproduce —una fila seleccionada, un diálogo abierto—. Se cuenta y se imprime, para que se vea cuánto queda fuera |

## La lista

Cada línea es un botón que el producto promete y no cumple, o una decisión que hay que poder
defender en una frase. Todas las de abajo son **la misma decisión**: un filtro que YA está puesto.

### La lista, vacía

Vacía, y es la respuesta correcta: las tres primeras que hubo aquí —«Todas» del mapa de mesas,
«Todas» del catálogo y «Pendientes 0» de la caja— eran **la misma cosa dicha tres veces**: el filtro
que ya está puesto. Y la pantalla de opciones de la bebida de la cafetería habría añadido
veintiséis más.

Una lista de excepciones que crece con la misma excepción repetida no es una lista de decisiones:
es una regla sin escribir. Así que se escribió —arriba, en la tabla— y las tres se fueron. El
rastreador ahora lo lee del propio elemento, y cuenta cuántas se saltó por eso.

Al escribirla saltó un defecto de acceso: los filtros de zona del mapa de mesas **no llevaban
`aria-pressed`**, así que un lector de pantalla anunciaba cuatro botones iguales y ninguno pulsado.
El catálogo del mismo modelo ya lo ponía; ese se había quedado atrás. Ahora lo llevan los dos.

Cada línea que se añada aquí es un botón que el producto promete y no cumple, o una decisión que
hay que poder defender en una frase.

<!-- CLIC-SIN-EFECTO /ruta «Texto» — motivo -->
