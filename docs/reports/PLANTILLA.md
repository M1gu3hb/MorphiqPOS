# Plantilla de reporte

Copia este archivo a `docs/reports/NNN-<agente>-<tema>.md` al **terminar** una sesión, antes de avisarle a Miguel.

`NNN` es el folio correlativo **compartido entre los dos agentes**. Mira el número más alto que exista y toma el siguiente.

**Todo campo marcado obligatorio se llena. "N/A" es una respuesta válida; dejarlo vacío no lo es.**

---

```markdown
# Reporte NNN — <Agente> — <Tema>

- **Agente:** Claude Code | Codex
- **Carril:** A (venta, dinero, restaurante) | B (catálogo, inventario, gestión, público)
- **Rama:** carril-a | carril-b
- **Fecha inicio / fin:**
- **Commits:** <sha corto> … <sha corto> (N commits)
- **Tareas cubiertas:** A-07 … A-09

## 1. El prompt que recibí
> Pega aquí el prompt COMPLETO, textual, sin resumir.

## 2. Qué se me pidió
En mis palabras, en 5 líneas o menos. Si entendí algo distinto de lo escrito, dilo aquí.

## 3. Qué hice — tarea por tarea
Para CADA tarea:

### A-07 · <nombre>
- **Qué construí:**
- **Cómo lo resolví:** el enfoque, y por qué ese y no otro
- **Archivos creados:**
- **Archivos modificados:**
- **Migraciones aplicadas:** número, tablas, y si se aplicaron a Supabase
- **Pruebas escritas:** nombre y qué verifica cada una
- **Mutaciones ejecutadas:** qué corrección quité, qué prueba falló, y que la restauré
- **Criterio de aceptación:** ✅ cumplido / ⬜ pendiente, con evidencia

## 4. Errores que encontré
Uno por uno. Los míos también, sobre todo los míos.

### Error 1 — <título>
- **Qué pasaba:**
- **Cómo lo detecté:** ¿lo vio una prueba, o lo vi yo? Si lo vi yo, ¿por qué no lo vio ninguna prueba?
- **Causa raíz:** la de verdad, no el síntoma
- **Cómo lo resolví:**
- **Prueba que impide que vuelva:**
- **¿Estaba en verde para todas las puertas antes?** Sí/No. Si sí, qué puerta faltaba

## 5. Decisiones que tomé sin preguntar
| Decisión | Alternativas | Por qué esta | ¿Va a DECISIONES.md? |
|---|---|---|---|

## 6. Verificación ejecutada — evidencia, no promesas
| Comando | Resultado | Salida relevante |
|---|---|---|
| `pnpm verify` | ✅ salida 0 | |
| `pnpm test:unit` | ✅ N pruebas | |
| `pnpm test:integracion` | | |
| `pnpm test:e2e` | | |
| `pnpm lint` | | |
| `pnpm typecheck` | | |
| `pnpm build` | | |

**Contra la base real:** qué escenarios probé contra Postgres de verdad, y cuáles no.

## 7. Gate `morphiq-prs`
- **Superficies activadas:** S2, S5, S7, S10, S14, S15…
- **BLOCKERS abiertos:** ninguno / lista
- **CRITICAL abiertos y aceptados:** con su razón
- **Checks que NO pude verificar:** y por qué

## 8. Lo que NO hice
**Campo obligatorio y el más importante del reporte.**
- Qué quedó fuera del alcance y por qué
- Qué declaré terminado pero tiene un hueco conocido
- Qué prueba escribí que **no** verifiqué por mutación
- Qué afirmación de este reporte no puedo respaldar ejecutando algo

## 9. Bugs ajenos detectados
Bugs en la zona del **otro carril**. No los tocaste. Aquí van para que su dueño los vea.
| Archivo | Qué vi | Gravedad |
|---|---|---|

## 10. Pendientes cruzados
Lo que necesitas del otro carril. También va a `docs/reports/PENDIENTES-CRUZADOS.md`.
| Necesito | De quién | Para qué tarea | ¿Puse un STUB? |
|---|---|---|---|

## 11. Estado al cerrar
- **Tareas de mi carril terminadas:** N de M
- **Rama integrada a `main`:** sí / no, y por qué
- **Bloqueos activos:** qué necesito de Miguel, exactamente
- **Siguiente tarea:** cuál toca y qué necesita

## 12. Para el que retome esto
Tres a cinco líneas de lo que no es obvio leyendo el código: dónde está la trampa, qué decisión parece rara y no lo es, qué no repetir.
```
