# FASE 1 — Índice y cómo usar estos documentos

> ## ⚠️ ACTUALIZADO EL 8-SEP-2026 — LA SECUENCIA CAMBIÓ
>
> F1.0 se ejecutó y entregó una fundación excelente **y cero producto**: 2 rutas navegables, sin base de datos, sin autenticación, sin ninguna pantalla de negocio. Fue culpa de este plan, no de la ejecución.
>
> **Lee primero [`15-AUDITORIA-F1.0-Y-REPLANTEAMIENTO.md`](15-AUDITORIA-F1.0-Y-REPLANTEAMIENTO.md)** — explica qué pasó y qué cambió.
> **El corte activo es [`16-CORTE-F1.1-POS-QUE-VENDE.md`](16-CORTE-F1.1-POS-QUE-VENDE.md)**, no el `08`.
> **El prompt para arrancar es [`17-PROMPT-F1.1-AUTONOMO.md`](17-PROMPT-F1.1-AUTONOMO.md)**, no el `14`.
>
> Los documentos `08` a `12` conservan su contenido técnico y siguen siendo válidos como especificación, pero **su orden de ejecución quedó superado** por la decisión A-41. Los documentos `01` a `06` y `13` siguen vigentes tal cual.

> **Objetivo de la Fase 1:** fusionar el POS de restaurante y el POS de tiendita en **una sola aplicación** llamada MorphiqPOS, erradicando Base44, corrigiendo los defectos confirmados en auditoría, y dejando una cimentación sobre la que se puedan agregar todos los giros del catálogo.
>
> **Fase 1 termina cuando** un mismo sistema, en un mismo despliegue, opera una tienda de mostrador **y** un restaurante completo, sin cambiar de aplicación, y pasa el estándar `morphiq-prs` sin BLOCKERS.

Última actualización: 7 de septiembre de 2026
Estado: **plan aprobado para ejecución por Claude Code. Fase 0 cerrada.**

---

## Regla de oro para cualquier agente que lea esto

> **Nunca confíes en tu memoria ni en tu ventana de contexto. Confía en estos documentos.**

Si algo no está escrito aquí, no está decidido. Si algo se decide en una conversación, **se escribe aquí antes de programarlo**. Un agente que empieza una sesión nueva debe poder retomar el trabajo leyendo únicamente este repositorio.

---

## Orden de lectura

### Para entender (obligatorio antes de tocar código)

| #   | Documento                                                                | Qué contiene                                                                                | Cuándo leerlo                 |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------- |
| —   | [`/CONTEXTO_MAESTRO.md`](../../CONTEXTO_MAESTRO.md)                      | Quién es Miguel, qué es MorphiqPOS, arquitectura acordada, secuencia general                | **Siempre, primero**          |
| —   | [`/DECISIONES.md`](../../DECISIONES.md)                                  | Las 30 decisiones vigentes con su razón                                                     | **Siempre, segundo**          |
| —   | [`/REGLAS.md`](../../REGLAS.md)                                          | 34 reglas no negociables                                                                    | **Siempre, tercero**          |
| 01  | [`01-ANALISIS-DE-LAS-DOS-FUENTES.md`](01-ANALISIS-DE-LAS-DOS-FUENTES.md) | Qué hay exactamente en cada sistema: archivos, tamaños, acoplamiento, qué se salva y qué no | Antes de fusionar nada        |
| 02  | [`02-ESTRATEGIA-DE-FUSION.md`](02-ESTRATEGIA-DE-FUSION.md)               | **El documento central.** Cómo se fusionan, en qué orden, y por qué así                     | Antes de fusionar nada        |
| 03  | [`03-MODELO-DE-DATOS-UNIFICADO.md`](03-MODELO-DE-DATOS-UNIFICADO.md)     | Las tablas finales, tabla por tabla, con su origen en cada sistema                          | Antes de escribir migraciones |
| 04  | [`04-ARQUITECTURA-Y-MONOREPO.md`](04-ARQUITECTURA-Y-MONOREPO.md)         | Estructura de carpetas, capas, contratos, reglas de dependencia                             | Antes del primer commit       |
| 05  | [`05-SISTEMA-DE-DISENO-Y-ESTILOS.md`](05-SISTEMA-DE-DISENO-Y-ESTILOS.md) | Tokens, las 4 perillas, los estilos intercambiables, densidades                             | Antes de escribir UI          |
| 06  | [`06-DEFECTOS-Y-ERRADICACION.md`](06-DEFECTOS-Y-ERRADICACION.md)         | Los defectos de ambos sistemas, con su corrección y su prueba                               | Continuamente                 |

### Para ejecutar (uno por corte, en orden estricto)

| #   | Corte                                                                                | Qué construye                                                                           | Termina cuando                                                      |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 07  | [`07-CORTE-F1.0-FUNDACION.md`](07-CORTE-F1.0-FUNDACION.md)                           | Monorepo, tooling, CI, Docker local, tokens base, cero features                         | `npm run verify` verde en un clon limpio                            |
| 08  | [`08-CORTE-F1.1-NUCLEO.md`](08-CORTE-F1.1-NUCLEO.md)                                 | Tenant, identidad terminal+PIN, permisos en servidor, config, dinero, folios, auditoría | Un empleado entra con PIN y un cajero no puede abrir administración |
| 09  | [`09-CORTE-F1.2-CATALOGO-Y-VENTA.md`](09-CORTE-F1.2-CATALOGO-Y-VENTA.md)             | Catálogo unificado, `ordenes`, cobro atómico, caja, ticket, escáner                     | **Una tienda opera un día completo**                                |
| 10  | [`10-CORTE-F1.3-INVENTARIO-Y-COMPRAS.md`](10-CORTE-F1.3-INVENTARIO-Y-COMPRAS.md)     | Ledger de stock, recetas, compras, proveedores, gastos, conteos                         | **Retail vendible.** Demos de tienda, ferretería y farmacia         |
| 11  | [`11-CORTE-F1.4-RESTAURANTE.md`](11-CORTE-F1.4-RESTAURANTE.md)                       | Mesas, mesero, comandas, cocina/KDS, propinas, precuenta                                | **Restaurante opera en la misma app**                               |
| 12  | [`12-CORTE-F1.5-QR-Y-CIERRE.md`](12-CORTE-F1.5-QR-Y-CIERRE.md)                       | Portal QR, panel del dueño, tenants de demo, endurecimiento PRS                         | **Guion de demostración completo**                                  |
| 13  | [`13-PRUEBAS-Y-DEFINICION-DE-TERMINADO.md`](13-PRUEBAS-Y-DEFINICION-DE-TERMINADO.md) | Qué se prueba, cómo, y qué significa "terminado" en cada corte                          | Continuamente                                                       |
| 14  | [`14-PROMPT-CLAUDE-CODE.md`](14-PROMPT-CLAUDE-CODE.md)                               | El prompt para arrancar la sesión de desarrollo                                         | Al iniciar cada sesión                                              |

---

## Cómo se ejecuta un corte

Cada documento de corte tiene la misma estructura, y **se sigue en orden**:

```
1. Precondiciones      → qué debe estar verde antes de empezar
2. Alcance             → qué SÍ entra
3. Fuera de alcance    → qué NO entra (leerlo evita el 80% de la desviación)
4. Tareas              → numeradas, con criterio de aceptación por tarea
5. Pruebas obligatorias→ los escenarios que deben pasar
6. Gate PRS            → los checks de morphiq-prs que aplican a este corte
7. Definición de terminado → la lista que se firma antes de abrir el siguiente corte
```

**No se abre un corte sin cerrar el anterior.** Regla R21. Con una persona a medio tiempo, dos frentes en paralelo son cero frentes terminados.

---

## Convenciones de las tareas

Cada tarea lleva un identificador estable, por ejemplo `F1.1-T07`. Ese identificador se usa en:

- el mensaje de commit: `F1.1-T07: hash de PIN con Argon2id en servidor`
- el nombre de rama: `f1.1-t07-pin-argon2`
- la bitácora de avance: `docs/fase-1/BITACORA.md`

**Después de terminar cada tarea, el agente escribe una línea en `BITACORA.md`** con: identificador, fecha, qué se hizo, qué pruebas pasaron, qué quedó pendiente. Ese archivo es lo que permite que otra sesión retome sin preguntar.

---

## Estado de la ejecución

| Corte                     | Estado         | Notas              |
| ------------------------- | -------------- | ------------------ |
| F1.0 Fundación            | ⬜ No iniciado |                    |
| F1.1 Núcleo               | ⬜ No iniciado | Bloqueado por F1.0 |
| F1.2 Catálogo y venta     | ⬜ No iniciado | Bloqueado por F1.1 |
| F1.3 Inventario y compras | ⬜ No iniciado | Bloqueado por F1.2 |
| F1.4 Restaurante          | ⬜ No iniciado | Bloqueado por F1.3 |
| F1.5 QR y cierre          | ⬜ No iniciado | Bloqueado por F1.4 |

Leyenda: ⬜ no iniciado · 🟨 en curso · ✅ terminado y firmado

**Este cuadro lo actualiza el agente al terminar cada corte.** Es el primer lugar donde mira una sesión nueva.

---

## Estimación honesta

A ~2.25 jornadas efectivas por semana (medio tiempo, una persona con asistencia de agentes):

| Corte                     |   Jornadas |   Semanas |
| ------------------------- | ---------: | --------: |
| F1.0 Fundación            |        5–7 |       2–3 |
| F1.1 Núcleo               |      12–16 |       5–7 |
| F1.2 Catálogo y venta     |      15–20 |       7–9 |
| F1.3 Inventario y compras |      12–16 |       5–7 |
| F1.4 Restaurante          |      20–28 |      9–12 |
| F1.5 QR y cierre          |      10–14 |       4–6 |
| **Total Fase 1**          | **74–101** | **32–44** |

**Entre 8 y 11 meses a medio tiempo.** Es un número grande y es el número real; no sirve de nada uno bonito.

Dos cosas lo bajan de verdad:

1. **Los cortes F1.0 a F1.3 ya te dan retail vendible** — alrededor del mes 5–6, no al final. No hay que esperar los 11 meses para poder demostrar y vender.
2. Los agentes de código aceleran la parte mecánica (portar componentes, escribir migraciones, generar pruebas). No aceleran las decisiones ni la verificación.

Lo que **no** debe hacerse para bajar el número: quitar pruebas, saltarse el gate PRS o meter features de otros giros antes de cerrar la fusión. Eso no ahorra tiempo, lo mueve al futuro con intereses.

---

## Qué hacer si algo no está en estos documentos

1. **No lo inventes.**
2. Busca si está en `/DECISIONES.md` como pendiente.
3. Si es una decisión de producto o de negocio → **pregúntale a Miguel** y regístrala.
4. Si es un detalle de implementación cubierto por `/REGLAS.md` → resuélvelo respetando la regla y anótalo en `BITACORA.md`.
5. Si contradice algo escrito aquí → **para y pregunta.** No lo resuelvas por tu cuenta.
