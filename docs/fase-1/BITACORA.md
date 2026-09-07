# Bitácora de ejecución — Fase 1

> **Este archivo es lo que permite que otra sesión retome el trabajo sin preguntar.**
> Se escribe una entrada **por cada tarea terminada**, antes de empezar la siguiente.
> Si una tarea queda a medias, también se anota — con qué falta.

---

## Cómo se escribe una entrada

```markdown
## F1.0-T07 · Sistema de diseño base
- **Fecha:** 2026-__-__
- **Qué se hizo:** ____
- **Archivos tocados:** ____
- **Decisiones tomadas:** ____ (si hubo alguna, también va a /DECISIONES.md)
- **Pruebas que pasan:** ____
- **Verificado con:** ____   ← obligatorio si la tarea corrige un defecto.
                                Se quita la corrección, la prueba debe fallar.
- **Pendiente o riesgo:** ____
- **Reclasificaciones:** ____ (si un archivo pasó de PORTAR a REIMPLEMENTAR, etc.)
```

**Campos que no se pueden dejar vacíos:**
- `Verificado con` en cualquier tarea que cierre un defecto de `06-DEFECTOS-Y-ERRADICACION.md`.
- `Reclasificaciones` cuando un archivo cambie de cubo respecto a `02-ESTRATEGIA-DE-FUSION.md` §2.

---

## Estado general

| Corte | Estado | Tareas | Última actualización |
|---|---|---|---|
| F1.0 Fundación | ⬜ No iniciado | 0 / 13 | — |
| F1.1 Núcleo | ⬜ No iniciado | 0 / 16 | — |
| F1.2 Catálogo y venta | ⬜ No iniciado | 0 / 17 | — |
| F1.3 Inventario y compras | ⬜ No iniciado | 0 / 16 | — |
| F1.4 Restaurante | ⬜ No iniciado | 0 / 17 | — |
| F1.5 QR y cierre | ⬜ No iniciado | 0 / 13 | — |

Leyenda: ⬜ no iniciado · 🟨 en curso · ✅ terminado y firmado

---

## Defectos cerrados

Se llena conforme avanza. Formato de `06-DEFECTOS-Y-ERRADICACION.md` §7.

| ID | Defecto | Corte | Tarea | Pruebas | Verificado | Fecha |
|---|---|---|---|---|:---:|---|
| P0-01 | Autenticación en el navegador | F1.1 | — | — | ⬜ | — |
| P0-02 | Sin autorización por rol | F1.1 | — | — | ⬜ | — |
| P0-03 | Cobro no transaccional | F1.2 | — | — | ⬜ | — |
| P0-04 | Totales sin líneas persistidas | F1.4 | — | — | ⬜ | — |
| P0-05 | Mesa y venta huérfanas o duplicadas | F1.4 | — | — | ⬜ | — |
| P0-06 | QR confía en datos del cliente | F1.5 | — | — | ⬜ | — |
| P0-07 | Precios calculados en el cliente | F1.2 | — | — | ⬜ | — |
| P0-08 | Aislamiento por organización | F1.1 | — | — | ⬜ | — |
| P1-01 | Configuración múltiple ambigua | F1.1 | — | — | ⬜ | — |
| P1-03 | Stock read-then-write | F1.2 | — | — | ⬜ | — |
| P1-04 | Relaciones duplicadas | F1.4 | — | — | ⬜ | — |
| P1-05 | Lint y tipos rojos | F1.0 | — | — | ⬜ | — |
| P1-06 | Sin pruebas ni CI | F1.0 | — | — | ⬜ | — |
| P1-07 | Dependencias vulnerables | F1.0 | — | — | ⬜ | — |
| P1-08 | Polling y respuestas fuera de orden | F1.4 | — | — | ⬜ | — |
| P1-09 | Folio con colisión | F1.1 | — | — | ⬜ | — |
| P1-10 | Carrito se cierra al final | F1.2 | — | — | ⬜ | — |
| P1-11 | Sync offline mapea todo a efectivo | F1.2 | — | — | ⬜ | — |
| P1-12 | Sin alta de empleados | F1.1 | — | — | ⬜ | — |
| P1-13 | Renglones del mismo producto se pisan | F1.3 | — | — | ⬜ | — |
| P1-15 | Idempotencia del escáner en memoria | F1.2 | — | — | ⬜ | — |
| SEC-CREDS | Credencial por defecto en el bundle | F1.1 | — | — | ⬜ | — |
| SEC-XSS | `document.write` sin escape | F1.5 | — | — | ⬜ | — |
| SEC-UPLOAD | Validación de archivo por MIME declarado | F1.1 | — | — | ⬜ | — |
| SEC-HEADERS | Sin CSP ni cabeceras | F1.0 | — | — | ⬜ | — |
| SEC-STORAGE | Usuario en sessionStorage | F1.1 | — | — | ⬜ | — |
| ZERO-01 | Independencia de Base44 | F1.0 | — | — | ⬜ | — |
| Q-10 | Exclusiones "SIN" que descuentan | F1.3 | — | — | ⬜ | — |
| B-ajustarStock | `ajustarStock` sin `organizacion_id` | F1.3 | — | — | ⬜ | — |

---

## Entradas

*(Aquí van las entradas por tarea, la más reciente arriba.)*

---

## Preguntas abiertas para Miguel

Las que aparezcan durante la ejecución. Formato: `[FECHA] pregunta — bloquea la tarea ____`.

| Fecha | Pregunta | Bloquea | Estado |
|---|---|---|---|
| 2026-09-07 | **A-31** ¿Formato de ticket en v1: carta, 80 mm, 58 mm o combinación? | F1.2-T15 | ⬜ Abierta |
| 2026-09-07 | **A-32** ¿Los perfiles se llaman Esencial/Operativo/Restaurante Pro o `retail`/`restaurante`/`servicios`? | F1.4-T16 | ⬜ Abierta |
| 2026-09-07 | **A-33** ¿El repositorio MorphiqPOS se vuelve privado? | Publicar la auditoría completa | ⬜ Abierta |
| 2026-09-07 | **A-34** ¿Qué hardware debe funcionar en el primer corte? | F1.2-T13 | ⬜ Abierta |
| 2026-09-07 | **Q-09** ¿Qué puede modificar un cajero al ajustar una cuenta, y con qué autorización? | F1.4-T13 | ⬜ Abierta |

---

## Reclasificaciones de archivos

Cuando un archivo cambie de cubo respecto a `02-ESTRATEGIA-DE-FUSION.md` §2.

| Archivo | Cubo original | Cubo real | Por qué | Fecha |
|---|---|---|---|---|
| — | — | — | — | — |
