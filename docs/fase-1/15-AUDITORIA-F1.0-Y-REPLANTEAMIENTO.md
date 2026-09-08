# 15 — Auditoría de F1.0 y replanteamiento de la Fase 1

Fecha: 8 de septiembre de 2026
Estado: **corrección de rumbo aprobada por Miguel.**

---

## 1. Qué existe realmente — auditoría independiente

Auditado directamente sobre `D:\MIS PROYECTOS\Master POS\morphiqpos`, sin confiar en el reporte de la sesión.

### Lo que sí está construido

| | |
|---|---|
| Archivos de código escritos a mano | **~40** (~2,900 líneas) |
| Primitivas shadcn adoptadas y tokenizadas | 36 |
| Archivos de prueba | 7 (unitarias, integración y E2E) |
| Scripts de verificación | 9 |
| Rutas navegables en la app | **2** (`/` → redirect, `/estilos`) |

**Paquetes con contenido real:**
- `packages/domain/dinero` — `bigint` con marca, aritmética, redondeo, reparto, formato. 30 pruebas. **Es la única lógica de negocio del repo, y es aritmética de dinero, no POS.**
- `packages/ui` — el paquete más grande: tokens con contrato verificado, 4 perillas, auditor de contraste AA con distancia perceptual, estilos `premium` y `editorial` en claro y oscuro, 36 primitivas tokenizadas.
- `packages/contracts` — errores tipados y validación zod del entorno.
- `packages/testing` — inyección de fallos, fábricas de datos.
- `apps/web` — layout, middleware con CSP por nonce, y la galería `/estilos`.

**Configuración:** Next 16.3.4 · React 19.2.8 · TypeScript 6.0.3 · Tailwind 4.3.3 · Vitest 5 · Playwright 1.63. TypeScript estricto de verdad (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `allowJs: false`). Reglas de capas con ESLint tipado. Workflow de CI con acciones fijadas a SHA.

### Lo que NO existe

| Pregunta | Respuesta |
|---|---|
| ¿Funcionalidad de punto de venta? | **No.** Cero catálogo, carrito, cobro, caja, productos, inventario, mesas |
| ¿Tablas o migraciones? | **No.** Cero archivos `.sql` en todo el repositorio |
| ¿Autenticación? | **No.** El hueco de sesión está escrito como comentario |
| ¿API routes? | **No.** Ninguna |
| ¿Qué se ve al abrir la app? | `/estilos` y nada más |

**Carpetas vacías con `.gitkeep`:** `packages/app`, `packages/registry`, `capabilities/`, `apps/worker`, `infra/ci`.
**`packages/data`:** 17 líneas. Un `import 'server-only'` y una constante.

### Cinco cosas que hay que corregir al arrancar

1. **El ADR 0001 eligió Kysely y Kysely no está instalado.** Decisión sin implementar.
2. **`scripts/db.mjs:131`** — la guarda que debía abortar `db:migrate` con un mensaje claro ya no dispara, porque comprueba que exista `packages/data/package.json` y ese archivo ya existe. `pnpm db:migrate` falla con un error críptico de pnpm.
3. **El acta de sign-off exagera en un punto.** Declara pruebas de integración "contra Postgres real"; en la práctica `postgres.ts` levanta un contenedor y comprueba un puerto TCP, y la única prueba de esa suite verifica que `DATABASE_URL` empieza con `postgres://`. **No se ejecuta una sola sentencia SQL.** No es mentira deliberada —el README es honesto sobre lo que falta— pero el acta debe corregirse.
4. **Andamiaje muerto:** tres layouts de grupo de rutas sin ninguna página dentro, y `consultas/claves.ts` con 7 namespaces de query keys que nadie consume.
5. **CI nunca se ejecutó** y `docker compose up` nunca se levantó. Ambos declarados en el README.

### Veredicto

**La fundación está bien construida y bien documentada. Y no es un punto de venta.**

Las dos cosas son ciertas a la vez, y esa es exactamente la razón del replanteamiento que sigue.

---

## 2. El error fue del plan, no de la ejecución

Hay que decirlo con claridad porque afecta las decisiones que vienen.

**`07-CORTE-F1.0-FUNDACION.md` dice literalmente, en su sección de alcance: "Cero features de negocio". Y en Fuera de alcance: "Si aparece la tentación de aprovechar y agregar la tabla de productos, **no**".**

Claude Code ejecutó ese documento con precisión, encontró tres defectos reales que una inspección visual no habría visto, y entregó justo lo que se le pidió. **El problema es lo que se le pidió.**

### El error de planeación, con nombre

Secuencié la Fase 1 **por capas de arquitectura** — fundación, núcleo, catálogo, inventario, restaurante — que es el orden correcto para construir una plataforma con equipo y tiempo.

Pero el `CONTEXTO_MAESTRO.md` de este mismo proyecto dice, en su primera línea sobre qué es MorphiqPOS:

> *"Primero es la herramienta de venta que hoy falta para cerrar tratos. **El prospecto necesita ver.**"*

Y el criterio de admisión que yo mismo escribí:

> *"Cada corte debe agregar un capítulo al guion de demostración."*

**F1.0 no agrega ningún capítulo al guion.** Una galería de tokens de diseño no le demuestra nada a un dueño de restaurante. Violé mi propia regla de admisión al escribir el primer corte, y nadie lo detectó hasta que Miguel abrió la app y vio dos rutas.

Con una persona a medio tiempo, eso son ~6 jornadas invertidas en algo que no se puede enseñar ni vender. No están perdidas —la fundación se usa toda— pero el orden estaba mal.

### Lo que sí quedó demostrado

Los tres defectos que las pruebas encontraron valen su costo y confirman que la exigencia de calidad no sobra:

1. **La CSP bloqueaba todos los scripts de Next.** La página se servía, se veía perfecta en una captura, y no hidrataba: ningún botón funcionaba. El verificador daba verde porque comprobaba la política, no que la app funcionara bajo ella.
2. **Tailwind 4 no genera `h-[var(--x)]`.** La clase estaba en el HTML, no existía en el CSS, y la perilla de densidad no hacía nada — sin fallar nada.
3. **La quinta prohibición de capas desactivaba en silencio a las otras cuatro** (en configuración plana de ESLint la última regla gana). Sin la meta-prueba, la regla de dependencia habría estado apagada desde el primer día.

Los tres son el riesgo **R-09b** del registro: *cosas que demuestran bien y no sirven*. La disciplina de pruebas se queda. Lo que cambia es **qué** se construye primero.

---

## 3. Qué es MorphiqPOS, dicho como lo dijo Miguel

> *"Es un punto de venta. Básicamente es un punto de venta y tiene que funcionar como un punto de venta. Yo lo puedo operar tal y como un punto de venta."*
>
> *"Con muchísimas funciones, de todo. Que todo funcione al mismo tiempo, que yo pueda utilizar todas las funciones."*
>
> *"Como en el MH POS, que en la configuración está la opción de cambiar paquete y ahí cambiaría entre tipos de negocio. Eso es lo que yo quiero."*

Tres frases que ordenan todo lo que sigue:

1. **Es un POS.** No una plataforma modular que algún día tendrá un POS. Se abre y se vende con él.
2. **Todas las funciones presentes y activas.** No se construye "el núcleo" y luego se le agregan capacidades: se construye el POS con sus funciones.
3. **Un selector de paquete en configuración** cambia el tipo de negocio. Esa es la forma **usable** del sistema de capacidades — no un grafo de dependencias, un menú desplegable.

Esa tercera frase resuelve además la decisión pendiente **A-32**. El registro de capacidades sigue existiendo por debajo, pero lo que Miguel ve y usa es un selector: *Tienda · Restaurante · Ferretería · Farmacia · Cafetería*.

---

## 4. La corrección: correctitud no negociable, completitud diferida

El riesgo obvio de "hazlo rápido y visible" es repetir los defectos de los dos sistemas fuente. La corrección no es bajar el listón; es distinguir dos cosas que yo había mezclado.

### Lo que NO se negocia — entra desde el primer día
Es lo que hace la diferencia entre un POS y un juguete, y **no es lento de construir**:

- **Cobro transaccional e idempotente.** El envoltorio `comando()` es un día de trabajo y resuelve esto para siempre.
- **Precios y totales calculados en el servidor.** Nunca se acepta un importe del cliente.
- **Autenticación verificada en el servidor**, con hash lento. El PIN nunca sale de la base.
- **Stock como ledger inmutable con decremento atómico.** Nunca leer-calcular-escribir.
- **Dinero en `bigint` de centavos.** Ya está hecho.
- **Aislamiento por organización** en todas las consultas.
- **Prueba antes que código** en todo lo crítico, con mutación.

### Lo que SÍ se difiere — es completitud, no correctitud

| Estaba planeado | Se hace ahora | Por qué es seguro |
|---|---|---|
| Tabla `permisos_rol` con matriz configurable | **Comprobaciones de rol en el servidor, en el envoltorio de comando** | Sigue siendo autorización real en servidor. Sólo es menos flexible. El error de los sistemas fuente fue verificar en el **cliente** o no verificar |
| Registry con grafo de dependencias e incompatibilidades | **Columna `paquete` en `organizaciones`, verificada en servidor** | Es exactamente lo que Miguel pidió, y es aplicación real |
| Configuración por 10 secciones y ámbitos | **Una configuración por organización** | La restricción única que corrige P1-01 se mantiene |
| `packages/app` + `capabilities/*` como paquetes separados | **Todo dentro de `apps/web` y `packages/domain` primero** | Extraer a paquetes cuando haya un segundo consumidor, no antes |
| Worker, outbox, reconciliadores | **Después** | Nada depende de ellos para vender |
| Auditoría exhaustiva de toda acción | **Sólo acciones sensibles**: cobro, cancelación, ajuste, cambio de precio, apertura y cierre de caja | Cubre donde se pierde dinero |

**La regla que gobierna el diferimiento:** se difiere lo que se puede agregar después **sin reescribir lo anterior**. Nada de lo diferido cambia el esquema de datos ni la forma de los comandos.

---

## 5. Secuencia revisada de la Fase 1

| Corte | Qué construye | Al terminar, Miguel puede… | Jornadas |
|---|---|---|---|
| ~~F1.0~~ | ~~Fundación~~ | ✅ **Hecha** — 12 de 13 tareas | ~6 gastadas |
| **F1.1** | **POS que vende** — Supabase, esquema, login PIN, catálogo, venta, cobro atómico, caja, ticket, stock, selector de paquete, desplegado en Vercel | **Vender un día completo. Enseñarlo. Venderlo.** | 18–24 |
| **F1.2** | **Restaurante** — mesas, mesero, cocina/KDS, comandas, modificadores, exclusiones, propinas, precuenta | Demostrar restaurante en 3 dispositivos | 20–26 |
| **F1.3** | **Operación completa** — recetas, compras, proveedores, gastos, fiado, devoluciones, conteos, mermas, reportes, importación | Cubrir ferretería, farmacia y abarrotes de verdad | 14–18 |
| **F1.4** | **Portal QR y panel del dueño** — menú público, pedido, solicitud de cuenta, valoración, panel móvil | Cerrar el guion de demostración completo | 10–14 |
| **F1.5** | **Endurecimiento** — permisos configurables, registry completo, auditoría exhaustiva, multi-sucursal, sign-off PRS | Firmar producción y vender con respaldo | 12–16 |

**Total restante: 74–98 jornadas.** Prácticamente el mismo número que antes — **lo que cambia es dónde aparece el producto vendible: al final de F1.1, no al final de F1.3.**

A medio tiempo (~2.25 jornadas/semana): **F1.1 en 8–10 semanas.** Ese es el hito que importa.

### Diferencia con el plan anterior

```
ANTES:  F1.0 fundación → F1.1 núcleo invisible → F1.2 venta → F1.3 inventario
        ▲ nada vendible hasta aquí ─────────────────────────────────┘  (~35-40 j)

AHORA:  F1.0 fundación → F1.1 POS QUE VENDE → F1.2 restaurante → ...
        ▲ vendible aquí ──────────────────┘                        (~24-30 j)
```

Los documentos `08` a `12` **no se tiran**: su contenido se redistribuye. Las tareas de `08-CORTE-F1.1-NUCLEO.md` que se difieren van a F1.5; el resto se absorbe en el nuevo F1.1.

---

## 6. Infraestructura: Supabase en vez de Docker

**Decisión de Miguel, 8-sep-2026.** Ya creó el proyecto.

| | |
|---|---|
| Proyecto | **MorphiqPOS** |
| Ref | `wyqmzhliurwyxuyxznpb` |
| Región | `us-east-2` |
| Postgres | **17.6** (el compose local usaba 16 — se alinea a 17) |
| Estado | `ACTIVE_HEALTHY` |

**Qué cambia:** el entorno de desarrollo principal deja de ser Docker y pasa a ser el proyecto de Supabase. Se acabó el bloqueo de F1.0-T05.

**Qué NO cambia — y es importante:** la regla **R7** sigue viva. Cero lógica de negocio en RLS o en Edge Functions. Toda la lógica en la API TypeScript con transacciones reales, hablando a Postgres por Kysely.

**El guardián de esa promesa:** `infra/docker/docker-compose.yml` **se conserva** y se ejecuta en CI como prueba de portabilidad. Si algún día el sistema deja de arrancar contra un Postgres pelón en Docker, es que se coló una dependencia de Supabase — y eso rompe la promesa A-27 de poder instalarle su propio servidor a un cliente que no quiere internet. Es una prueba, no un entorno de trabajo.

**Vercel:** un solo proyecto, conectado al repositorio, con variables de entorno separadas por entorno. F1.1 termina desplegado.

**Aviso operativo:** el proyecto `Pasteleria Confetti` (`ivqcxdpqxwjxfohiswqb`) está en la misma cuenta de Supabase y **opera con un cliente real**. Ningún agente lo toca, ni para leer. Sólo se trabaja sobre `wyqmzhliurwyxuyxznpb`.

---

## 7. Los dos puntos que levantó Claude Code

**1. El gate de F1.0 se contradecía.** Marcaba como esperados dos checks de base de datos —migraciones versionadas y pool de conexiones— en un corte cuyo alcance decía "cero features de negocio". **Tiene razón. Ambos se mueven al gate de F1.1**, donde sí hay base de datos.

**2. R15 y la moneda.** La regla pedía "dinero con moneda explícita" y el modelo de datos no tiene columna de moneda en ninguna tabla. La resolución de Claude Code —moneda en las fronteras, `formatear(monto, 'MXN')` la exige siempre, y mezclar monedas dentro de una orden queda fuera de Fase 1— **es correcta y se confirma.** Multi-moneda entra cuando exista un cliente que la pague, y entonces será una columna en `ordenes`, no en cada importe.

---

## 8. Decisiones nuevas registradas

Ver `/DECISIONES.md` para la tabla completa. Resumen:

| ID | Decisión |
|---|---|
| **A-39** | Supabase gestionado (`wyqmzhliurwyxuyxznpb`) sustituye a Docker como entorno principal. El compose se conserva como prueba de portabilidad en CI |
| **A-40** | Un solo proyecto en Vercel, conectado al repositorio. F1.1 termina desplegado |
| **A-41** | **Replanteamiento de la Fase 1: producto vendible al final de F1.1.** Correctitud no negociable, completitud diferida |
| **A-42** | El sistema de capacidades se expone como **selector de paquete** en configuración: Tienda · Restaurante · Ferretería · Farmacia · Cafetería. Resuelve A-32 |
| **A-43** | Autonomía total del agente de desarrollo dentro de las reglas escritas. Pregunta sólo ante decisiones irreversibles o que contradigan documentación |
| **A-44** | Postgres 17 (era 16 en el compose) |
