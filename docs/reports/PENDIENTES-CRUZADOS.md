# Pendientes cruzados — CERRADO

Este documento coordinaba dos carriles. **Ya no hay dos carriles**: `carril-b`
se integró en `main` el 2026-09-08 (C-01) y `TEAM.md` quedó suspendido. Un solo
desarrollador, dueño de todo el repositorio.

Los dos pendientes que vivían aquí están cerrados:

| # | Qué | Estado |
|---|---|---|
| X-01 | `calcularConsumo` y `aplicarMovimientos` con decremento atómico | ✅ En `main`, y usado por `cobrarOrden` en ventas reales |
| X-02 | Resolvedor de `Ambito` desde la cookie | ✅ En `main`, y ahora TAMBIÉN lo usan las rutas de gestión — colgaban de un puente de desarrollo que lanzaba en producción (C-05) |

Lo que este archivo explicaba sobre cómo cablear una pantalla al backend vive
ahora donde se usa:

- **Exponer un comando por HTTP:** `apps/web/src/servidor/ruta.ts`, y el ejemplo
  en `apps/web/app/api/catalogo/crear-producto/route.ts`.
- **Llamarlo desde React:** `apps/web/src/cliente/api.ts`.
- **Rutas de gestión con validación de origen:** `apps/web/src/servidor/http.ts`.
- **Operar el sistema:** `docs/RUNBOOK.md`.
- **Qué se ejecutó y qué no:** `docs/reports/006-cierre-f1.1.md`.
