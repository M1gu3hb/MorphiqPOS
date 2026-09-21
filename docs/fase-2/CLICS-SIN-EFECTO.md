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

Cada línea es un botón que el producto promete y no cumple, o una decisión que hay que poder
defender en una frase. Todas las de abajo son **la misma decisión**: un filtro que YA está puesto.

### El filtro que ya está seleccionado

Las pestañas de filtro nacen con una activa —«Todas», o la primera— y volver a tocarla no cambia
nada, porque el estado ya es ése. No es un botón muerto: es un botón en su sitio, con su
`aria-pressed` diciendo que está puesto. Cambiar eso —apagarla, o deshabilitarla— sería peor: la
pestaña activa tiene que seguir viéndose y siendo tocable para volver a ella desde otra.

El rastreador vuelve al estado inicial entre toque y toque, así que siempre encuentra la primera
seleccionada. Por eso son exactamente estas y no las demás de su fila.

CLIC-SIN-EFECTO /restaurante/mapa-de-mesas «Todas» — es la zona ya seleccionada al abrir; tocarla otra vez no cambia el filtro
CLIC-SIN-EFECTO /restaurante/productos «Todas» — es el área ya seleccionada al abrir; tocarla otra vez no cambia el filtro
CLIC-SIN-EFECTO /restaurante/caja «Pendientes 0» — es la pestaña ya seleccionada al abrir, y con cero cuentas no hay lista que cambiar

<!-- CLIC-SIN-EFECTO /ruta «Texto» — motivo -->
