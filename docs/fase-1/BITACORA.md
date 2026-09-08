# Bitácora de ejecución — Fase 1

## Carril B · B-12 · 2026-09-09 · Recetas y rentabilidad

- **Qué se hizo:** comandos y pantalla de recetas; costo por insumos con merma y
  utilidad/margen derivados en PostgreSQL.
- **Pruebas:** SQL de costeo y 5 mutaciones de saldo, ledger, cantidad y merma.
- **Verificado con:** migración 041 aplicada; cuatro costos de Cafetería consultados.
- **Pendiente:** E2E Kysely y regeneración de tipos esperan `DATABASE_URL`.

## Carril B · B-11 · 2026-09-09 · Insumos, almacenes y movimientos

- **Qué se hizo:** altas, inventario inicial y ajuste con saldo atómico y ledger
  inmutable, más `/inventario` conectado a rutas reales.
- **Pruebas:** comandos, SQL compilado y mutaciones contra sobreescritura y saldo negativo.
- **Verificado con:** lint, tipos, build y suite unitaria.
- **Pendiente:** integración PostgreSQL mediante Kysely espera `DATABASE_URL`.

## Carril B · B-10 · 2026-09-09 · Demostraciones creíbles

- **Qué se hizo:** semillas de abarrotes, ferretería y cafetería, más `resetearDemo`
  transaccional, confirmado, acotado a la organización y auditable.
- **Pruebas:** migraciones 042–043 ensayadas con rollback, aplicadas y consultadas.
- **Verificado con:** productos, insumos, recetas, ventas y caja reales en MorphiqPOS.
- **Pendiente:** no se ejecutó el comando de reset por falta de `DATABASE_URL`.

## Carril B · B-09 · 2026-09-09 · Inicio desde operación real

- **Qué se hizo:** `/inicio` consulta venta del día en zona del negocio, caja abierta,
  cinco ventas recientes y existencias bajo mínimo.
- **Pruebas:** consulta tipada, build de ruta y datos operativos sembrados en 043.
- **Verificado con:** $347.00, dos operaciones, caja abierta y Martillo bajo mínimo.
- **Pendiente:** prueba en navegador espera la conexión de aplicación.

## Carril B · B-08 · 2026-09-09 · Paquete efectivo

- **Qué se hizo:** navegación derivada del paquete activo y autorización de paquete en
  comandos reales; recetas sólo aparecen en Cafetería/Restaurante.
- **Pruebas:** contrato de cinco paquetes y 403 con `crearModificadorProducto` real.
- **Verificado con:** mutación que habilita modificadores para todos los paquetes.
- **Pendiente:** sesión real desde cookie sigue en X-02/A-03.

## Carril B · B-07b · 2026-09-09 · Configuración conectada

- **Qué se hizo:** lectura/escritura HTTP real de identidad, contacto, apariencia y
  paquete; la pantalla conserva y actualiza la versión optimista.
- **Pruebas:** alta, actualización, conflicto, aislamiento y autorización.
- **Verificado con:** recarga posterior al comando implementada; lint, tipos y build.
- **Pendiente:** E2E de persistencia espera `DATABASE_URL` y el resolvedor A-03.

## Carril B · B-06b · 2026-09-09 · Productos conectados

- **Qué se hizo:** `/productos` dejó la muestra local y usa consulta, alta, edición,
  precio y código reales; recarga la base tras cada operación.
- **Pruebas:** presentación, paginación, búsqueda difusa y comandos auditados.
- **Verificado con:** dinero `bigint`, mutaciones de importes/ámbito y build de API.
- **Pendiente:** alta combinada de medida/porción, categorías y E2E con `DATABASE_URL`.

## Carril B · BUG-01 · 2026-09-09 · Existencia ausente con negativo autorizado

- **Qué se hizo:** stock crea en cero la existencia faltante antes del decremento
  cuando la política permite negativo; la venta conserva el ledger completo.
- **Pruebas:** caso rojo antes del arreglo y verde después.
- **Verificado con:** retirar el insert vuelve a romper la prueba de fila ausente.
- **Pendiente:** prueba de integración real espera `DATABASE_URL`.

## Carril B · B-07 · 2026-09-08 · Pantalla de configuración

- **Qué se hizo:** ruta `(gestion)/configuracion` con selector visual de los cinco
  paquetes, identidad, contacto, logo, colores, estilo y vista previa inmediata.
- **Archivos:** `apps/web/app/(gestion)/configuracion/`, navegación de gestión y
  colores por defecto compartidos desde `packages/contracts`.
- **Pruebas:** contrato de los cinco paquetes; revisión real en navegador del cambio
  Ferretería → Cafetería y confirmación visible del guardado.
- **Verificado con:** `verify:primitivas`, lint, typecheck y navegador a 1044 px.
- **Pendiente:** conectar el formulario al comando B-05 cuando A-03 publique el
  resolvedor de ámbito de la sesión. No se agregó un atajo que acepte organización o rol del cliente.
- **Reclasificaciones:** reimplementación visual basada en el sistema de diseño del proyecto.

## Carril B · B-06 · 2026-09-08 · Pantalla de productos

- **Qué se hizo:** ruta `(gestion)/productos` con alta, edición, imagen, precios,
  mayoreo, SKU, código de barras, filtros y estados vacíos; búsqueda tolerante a errores.
  La consulta de servidor usa `pg_trgm`, columnas explícitas y cursor `(updated_at,id)`.
- **Archivos:** `apps/web/app/(gestion)/productos/`, `packages/data/src/repos/catalogo.ts`
  y `packages/app/src/catalogo/consulta.ts`.
- **Pruebas:** 4 de consulta/paginación y 3 de presentación/filtrado; alta y búsqueda
  `tornilo` → `Tornillo` verificadas en navegador.
- **Verificado con:** UI real, datos coherentes de ferretería, cero `SELECT *`, cero
  `OFFSET`, máximo 50 filas por página.
- **Pendiente:** el enlace de la página a Postgres espera el resolvedor de ámbito A-03;
  los componentes trabajan hoy con la muestra local declarada.
- **Reclasificaciones:** reimplementación; no se copió UI del histórico.

## Carril B · B-05 · 2026-09-08 · Configuración y paquete

- **Qué se hizo:** lectura con defaults y guardado transaccional de identidad, apariencia
  y paquete por organización, con versión optimista. Los cinco paquetes se verifican por
  `comando()` en el servidor y producen `403 PAQUETE_NO_INCLUYE` antes del caso de uso.
- **Archivos:** `packages/app/src/configuracion/` y dos códigos de dominio estables.
- **Pruebas:** 6 unitarias de alta, actualización, conflicto, defaults, aislamiento y 403.
- **Verificado con:** 2 mutaciones de versión y paquete, detectadas y restauradas.
- **Pendiente:** ruta HTTP de producción, cruzada con A-03.
- **Reclasificaciones:** lógica reimplementada como comando, sin estado de sesión en navegador.

## Carril B · B-04 · 2026-09-08 · Comandos de catálogo

- **Qué se hizo:** crear, actualizar, cambiar precio, asignar código y archivar productos;
  alta del insumo espejo SKU, vínculo explícito de insumo base y modificadores normalizados.
- **Archivos:** `packages/app/src/catalogo/`; migración `040_producto_insumo_base.sql`;
  esquema y exportaciones de app/data.
- **Migración:** 040 ensayada con `ROLLBACK`, aplicada a Supabase MorphiqPOS y registrada
  en `_migraciones` con hash `02664d7e6a00e913`; FK de misma organización y check verificados.
- **Pruebas:** 12 unitarias de comandos; dinero entra como texto y se convierte a `bigint`
  en el servidor.
- **Verificado con:** 6 mutaciones de importes y aislamiento, detectadas y restauradas.
- **Pendiente:** carga real de archivos pertenece a la tarea posterior de almacenamiento.
- **Reclasificaciones:** reimplementación TypeScript de reglas observadas en el histórico.

## Carril B · B-03 · 2026-09-08 · Repositorio de stock publicado

- **Qué se hizo:** `aplicarMovimientos(movimientos, tx)` toma bloqueos en orden estable,
  decrementa `existencias` con guarda atómica por organización/almacén/insumo y escribe
  todos los renglones de `movimientos_stock` en un solo insert dentro de la transacción recibida.
- **Archivos:** `packages/data/src/repos/stock.ts`, prueba y exportaciones del paquete.
- **Pruebas:** 7 unitarias del SQL compilado; 286 unitarias globales.
- **Verificado con:** 9 mutaciones del decremento, aislamiento, guarda, signo del ledger,
  política negativa, orden de bloqueos, inserción completa y cantidad cero; todas detectadas.
- **Pendiente:** el pegamento Kysely → PostgreSQL real no se ejecutó porque falta
  `DATABASE_URL`; el gate completo, tipos, lint y build sí pasan.
- **Reclasificaciones:** reimplementación TypeScript desde el comportamiento histórico;
  se eliminan `Math.max(0, …)`, lectura previa y escrituras separadas.

## Carril B · B-02 · 2026-09-08 · Consumo de inventario publicado

- **Qué se hizo:** `calcularConsumo` puro para `sku`, `receta`, `insumo_base` y `ninguno`;
  convierte unidades con `bigint`, aplica merma exacta, usa `calcularMlPorPorcion` y agrupa
  por insumo con la política de stock más restrictiva.
- **Archivos:** `packages/domain/src/inventario/`, exportaciones raíz y subruta del paquete.
- **Pruebas:** 11 unitarias, incluidas cantidades mayores que `Number.MAX_SAFE_INTEGER`.
- **Verificado con:** 10 mutaciones de estrategia, unidad, cantidad, merma, agrupación,
  política y referencia; todas detectadas y restauradas.
- **Pendiente:** las exclusiones `SIN` pertenecen a B-13; no forman parte de este contrato.
- **Reclasificaciones:** reimplementación TypeScript desde `tipoVentaUtils.js` e
  `inventarioValidation.js`, usados sólo como especificación.

## Carril B · B-01 · 2026-09-07 · Implementación publicada, cierre pendiente

- **Qué se hizo:** worktree `morphiqpos-codex`, rama `carril-b`; dominio de catálogo con cuatro tipos, cantidades exactas, unidades, porciones y mayoreo.
- **Archivos:** `packages/domain/src/catalogo/`, exportación del paquete, tres códigos de error y verificador de mutaciones. Contrato: `B01-CATALOGO-CONTRATO.md`.
- **Pruebas:** 62 de catálogo; 220 unitarias globales; lint, tipos y build pasan.
- **Verificado con:** 18 mutaciones detectadas por aserciones fallidas, restauradas y con suite verde posterior.
- **Pendiente:** `pnpm verify` rechaza referencias históricas de la documentación; falta el estándar completo PRS. B-02/B-03 aún pendientes; `.env` sin DATABASE_URL ni credenciales de almacenamiento.
- **Reclasificaciones:** reimplementación TypeScript desde la especificación histórica, sin copiar archivos.
- **Evidencia y decisiones:** `../reports/001-codex-f1.1-catalogo.md`. Implementación en `27940c3`; no integrada a main.

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
| F1.0 Fundación | 🟨 12 de 13 · falta T05 en vivo | 12 / 13 | 2026-09-07 |
| F1.1 Núcleo | 🟨 dos carriles en paralelo (A-45) · catálogo, gestión e inventario en curso | A: 1/22 · B: 12/24 | 2026-09-09 |
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
| P0-08 | Aislamiento por organización | F1.1 | T02 | 34 llaves compuestas; 2 mutaciones contra la base real fallan como deben | 🟨 | 2026-09-08 |
| P1-01 | Configuración múltiple ambigua | F1.1 | T02 | `organizacion_id` único; el segundo registro viola unicidad | ✅ | 2026-09-08 |
| P1-03 | Stock read-then-write | F1.2 | T02 | ledger sin `stock_anterior`/`stock_nuevo`: la variante peligrosa no se puede expresar. El decremento atómico y INV-03 son T14 | 🟨 | 2026-09-08 |
| P1-04 | Relaciones duplicadas | F1.4 | — | — | ⬜ | — |
| P1-05 | Lint y tipos rojos | F1.0 | T03 · T09 | `verify:tsconfig` · `pnpm lint` · `pnpm typecheck` | ✅ | 2026-09-07 |
| P1-06 | Sin pruebas ni CI | F1.0 | T06 · T09 · T10 | 149 unitarias + 10 E2E; workflow escrito | 🟨 | 2026-09-07 |
| P1-07 | Dependencias vulnerables | F1.0 | T09 | `pnpm audit --audit-level high --prod`: ninguna | ✅ | 2026-09-07 |
| P1-08 | Polling y respuestas fuera de orden | F1.4 | — | — | ⬜ | — |
| P1-09 | Folio con colisión | F1.1 | T02 | tabla `folios` + índice único parcial; el incremento atómico llega en T13 | 🟨 | 2026-09-08 |
| P1-10 | Carrito se cierra al final | F1.1 | T02 | un solo borrador por terminal; el segundo viola unicidad | ✅ | 2026-09-08 |
| P1-11 | Sync offline mapea todo a efectivo | F1.2 | T02 | `pagos` es tabla, no columnas; falta el cobro que la use (T13) | 🟨 | 2026-09-08 |
| P1-12 | Sin alta de empleados | F1.1 | — | — | ⬜ | — |
| P1-13 | Renglones del mismo producto se pisan | F1.3 | — | — | ⬜ | — |
| P1-15 | Idempotencia del escáner en memoria | F1.2 | — | — | ⬜ | — |
| SEC-CREDS | Credencial por defecto en el bundle | F1.1 | — | — | ⬜ | — |
| SEC-XSS | `document.write` sin escape | F1.5 | — | — | ⬜ | — |
| SEC-UPLOAD | Validación de archivo por MIME declarado | F1.1 | — | — | ⬜ | — |
| SEC-HEADERS | Sin CSP ni cabeceras | F1.0 | T11 | `verify:cabeceras` en vivo + 6 unitarias de política | ✅ | 2026-09-07 |
| SEC-STORAGE | Usuario en sessionStorage | F1.1 | — | — | ⬜ | — |
| ZERO-01 | Independencia de Base44 | F1.0 | T02 · T09 | `verify:residuos`, 8 patrones. Trabajo de CI con DNS bloqueado **escrito, sin ejecutar** | 🟨 | 2026-09-07 |
| Q-10 | Exclusiones "SIN" que descuentan | F1.3 | — | — | ⬜ | — |
| B-ajustarStock | `ajustarStock` sin `organizacion_id` | F1.3 | — | — | ⬜ | — |

---

## Entradas

*(Aquí van las entradas por tarea, la más reciente arriba.)*

### F1.1-A-01 · Envoltorio `comando()` — carril A
- **Fecha:** 2026-09-08 (commit `0a5a57f`, integrado a `main`)
- **Qué se hizo:** el envoltorio que resuelve, una vez y para todos los comandos, las
  ocho responsabilidades de `04-ARQUITECTURA §3`: validación zod, rol, paquete,
  transacción, clave de idempotencia, auditoría, correlation id y errores tipados.
  Migración **010** `comandos_ejecutados`, aplicada a Supabase. Reporte completo en
  `docs/reports/002-claude-code-f1.1-envoltorio-comando.md`.
- **Archivos tocados:** `packages/app/` (nuevo, 11 archivos) ·
  `packages/contracts/src/comandos/` · `packages/data/src/repos/comandos.ts` ·
  `packages/data/src/migraciones/sql/010_comandos_ejecutados.sql` ·
  `packages/data/bin/generar-tipos.mjs` · `scripts/verificar-estructura.mjs` ·
  `scripts/verificar-residuos.mjs` · `eslint.config.mjs` · `.prettierignore`
- **Decisiones tomadas:** ver **A-49** en `/DECISIONES.md`. La que más consecuencias
  tiene: **la clave de idempotencia se reclama DENTRO de la transacción.** Si el cobro
  se revierte, la reversión libera la clave y el reintento vuelve a cobrar de verdad.
  Reclamarla fuera la quemaría, y el reintento devolvería un éxito guardado sin haber
  cobrado nada — el peor error posible en una caja.
- **Pruebas que pasan:** 48 unitarias nuevas (206 en total).
- **Verificado con — 17 mutaciones automatizadas:**
  - **Destructivas que FALLAN (14):** quitar la comprobación de rol · quitar la de
    paquete · validar la entrada antes del rol · quitar la transacción · reclamar la
    clave fuera de la transacción · no comparar la huella de la entrada · no sanear el
    payload · permitir que un comando que escribe no deje rastro · aceptar cualquier
    correlation id · filtrar el mensaje de Postgres · permitir claves de ámbito en la
    entrada · no avisar de un paso inexistente · no exigir clave de idempotencia ·
    auditar el rechazo dentro de la transacción revertida.
  - **Inocuas que PASAN (3):** renombrar una variable · agregar un comentario ·
    reordenar dos campos de la fila de auditoría.
  - **Contra la base real** (transacción revertida, 0 filas al terminar): 8 escenarios,
    incluido **«revertir LIBERA la clave»**. ✅
- **Pendiente o riesgo:** **`pnpm test:integracion` NO se ha ejecutado nunca.** El
  archivo está escrito, typecheckeado y linteado, pero falta `DATABASE_URL`. El
  pegamento `comando() → Kysely → Postgres` está tipado y no ha corrido. Es el hueco
  declarado de esta tarea.
- **Reclasificaciones:** ninguna.

### F1.1-T03 · Tipos generados desde la base
- **Fecha:** 2026-09-08
- **Qué se hizo:** `packages/data/src/esquema.ts` dejó de ser un marcador de posición y
  pasó a generarse desde la base ya migrada: 26 interfaces, 336 columnas, `Generated<T>`
  en toda columna con valor por omisión. El generador es una consulta SQL que **emite el
  TypeScript entero**, no metadatos que luego JavaScript interpreta: con dos sitios donde
  decidir el mapeo, habría dos sitios donde equivocarse.
- **Archivos tocados:** `packages/data/bin/generar-tipos.mjs` · `packages/data/src/esquema.ts`
  (generado) · `packages/data/src/cliente.ts` · `scripts/db.mjs` · `.env.example` ·
  `package.json` · `packages/data/package.json`
- **Decisiones tomadas:**
  - **El mapeo de tipos refleja los parsers de `cliente.ts`, y se dice en los dos lados.**
    `int8 → bigint` (R15), `numeric → string` (cantidades con 4 decimales), `jsonb →
    unknown` (obliga a validar con zod antes de usarlo, en vez de un `any` disfrazado).
  - **`date → string`, y para eso hizo falta un parser nuevo.** `pg` convierte `date` a
    un `Date` a medianoche **en la zona del servidor**: un empleo que empieza el 1 de marzo
    se lee como el 28 de febrero a las 18:00 en cuanto el proceso corre en UTC y el negocio
    está en Ciudad de México. `vigente_desde` es un día del calendario, no un instante.
  - **El generador falla en vez de generar a medias.** Un tipo de Postgres sin mapear
    produce `__TIPO_SIN_MAPEAR_x__`, y el script lo detecta y aborta.
- **Pruebas que pasan:** `pnpm typecheck` en los 6 paquetes con el esquema real cargado;
  `pnpm verify` completo en verde (salida 0).
- **Verificado con:** la cadena entera `pnpm db:tipos` → `scripts/db.mjs` → `packages/data`
  se ejecutó y llegó hasta el punto exacto donde falta `DATABASE_URL`. Al arreglar
  `correrShim` apareció un defecto real: ver T01.
- **Pendiente o riesgo:** el archivo se escribió con la salida verificada de la consulta,
  pero **`pnpm db:tipos` no se ha podido ejecutar de punta a punta** por falta de
  `DATABASE_URL`. Es lo primero que hay que correr cuando Miguel dé la contraseña; si el
  resultado difiere en un solo byte, el generador y el archivo no están sincronizados.
- **Reclasificaciones:** ninguna.

### F1.1-T02 · Esquema completo, con las correcciones dentro de la base
- **Fecha:** 2026-09-08
- **Qué se hizo:** 26 tablas en 6 migraciones, aplicadas al proyecto de Supabase
  `wyqmzhliurwyxuyxznpb` (PostgreSQL 17.6). Casi toda restricción existe para corregir un
  defecto concreto de las fuentes, **y lo corrige desde la base**: una regla que sólo vive
  en el código se salta la primera vez que alguien escribe por otro camino.
- **Archivos tocados:** `packages/data/src/migraciones/sql/001_plataforma.sql` ·
  `002_catalogo.sql` · `003_venta_caja_inventario.sql` ·
  `004_integridad_multi_inquilino.sql` · `005_rls.sql` · `006_endurecimiento.sql` ·
  `scripts/verificar-esquema-aplicado.mjs` · `scripts/verificar-entorno.mjs`
- **Decisiones tomadas:**
  - **Llaves foráneas COMPUESTAS contra la fuga entre organizaciones (004).** Con
    `organizacion_id` y una llave simple al padre, nada impedía insertar una línea de venta
    de la Ferretería dentro de una orden de la Cafetería: las dos llaves se cumplen y la
    fila está mal. Un `where organizacion_id = $1` no protege de eso — la fila **ya** está
    mal escrita. Ahora la hija referencia `padre(id, organizacion_id)`: 34 restricciones.
    Obligó a añadir `organizacion_id` a `producto_modificadores`, que permitía enganchar
    los modificadores —**con sus precios**— de un negocio a los productos de otro.
  - **`existencias` NO lleva `check (cantidad >= 0)`, y el comentario que decía que sí era
    falso.** `permite_venta_sin_stock` hace del negativo un estado legítimo e informativo
    (dice cuánto se debe al conteo físico). Un CHECK rígido convertiría esa venta en error y
    el cajero acabaría apagando el inventario entero. La defensa real es el decremento
    atómico con guarda en el `where`, y que **cero filas afectadas es un error**. Queda un
    hueco declarado: nada impide a nivel de tabla un `set cantidad = 5`. Se cierra en T14
    con INV-03 y un contrato estático. **Está escrito en el archivo en vez de fingir que un
    CHECK inexistente lo cubre.**
  - **RLS niega todo a `anon` y `authenticated`, sin una sola policy (005).** La aplicación
    no usa PostgREST: habla por Kysely con credenciales de servidor. Los 27 avisos
    `rls_enabled_no_policy` del linter son la postura buscada, no un descuido. El bloque
    consulta `pg_roles` antes de revocar, porque esos roles no existen en un Postgres pelón
    y la migración abortaría — rompiendo la prueba de portabilidad que es la única defensa
    de A-27.
  - **006 cierra los dos avisos reales del linter:** `search_path` fijo en
    `tocar_updated_at` y `pg_trgm` movida al esquema `extensions`. Va en migración aparte
    porque 001 y 002 ya estaban aplicadas y su hash está en el ledger: editarlas haría que
    el ejecutor avisara, con razón, de una migración modificada después de aplicarse. **El
    ledger sólo sirve si se le hace caso cuando estorba.**
  - **`verificar-entorno.mjs` pasa a exigir Postgres 17.** T00 subió el compose a 17.11 para
    igualar a Supabase y no actualizó este contrato. Importa de verdad:
    `on delete set null (columna)`, que 004 usa once veces, no existe antes de Postgres 15.
- **Pruebas que pasan:** 14 casos ejecutados contra la base real dentro de una transacción
  revertida: 13 escrituras que **deben** fallar fallan (segunda caja abierta en la misma
  terminal, segundo carrito, línea de otra organización dentro de una orden, caja abierta
  por empleado ajeno, segunda configuración, cambio devuelto con tarjeta, efectivo recibido
  menor que el cobro, servicio que descuenta inventario, producto por medida sin precio,
  orden pagada sin folio, `salida_venta` positiva, retiro positivo) y **la venta legítima
  pasa** (2 martillos, efectivo con cambio). Comprobado después: 0 filas, 0 policies,
  0 permisos a roles públicos.
- **Verificado con:** `scripts/verificar-esquema-aplicado.mjs`, escrito **porque el error
  ya había ocurrido**. Al aplicar 003 a mano transcribí mal `ordenes`: `impuesto_centavos`
  en vez de `impuestos_centavos`, dos columnas inventadas y cinco que faltaban. El ledger
  guarda el hash del ARCHIVO, así que afirmaba que la migración correcta estaba aplicada
  mientras la base tenía otra cosa — **un ledger que miente es peor que no tener ledger**.
  Se revirtió 003 entero y se rehízo. El contrato se validó mutando:
  - **Destructivas que FALLAN:** `impuestos_centavos`→`impuesto_centavos` · quitar
    `margen_bp` · inventar `propina_centavos` · borrar la tabla `pagos`.
  - **Inocuas que PASAN:** reordenar tablas y columnas · reformatear el JSON · añadir un
    `-- create table impostora (...)` comentado dentro de un `.sql` (el contrato lee sin
    comentarios, para no encontrarse a sí mismo).
- **Pendiente o riesgo:**
  - Las migraciones se aplicaron **por el MCP de Supabase, no por el ejecutor propio**,
    porque falta `DATABASE_URL`. El ledger `_migraciones` se rellenó a mano con los hashes
    reales de los archivos, así que `pnpm db:migrate` no verá nada pendiente. La primera
    corrida real con la contraseña es la confirmación que falta.
  - La prueba de portabilidad contra el compose (A-27) sigue **sin ejecutarse**: Docker no
    está instalado.
- **Reclasificaciones:** ninguna.

### F1.1-T01 · `packages/data` — Kysely, `pg` y el ejecutor de migraciones
- **Fecha:** 2026-09-08
- **Qué se hizo:** el único punto del sistema que abre una conexión a Postgres, con los
  parsers de tipo puestos antes del pool, y un ejecutor de migraciones forward-only con
  ledger, hash y detección de archivos editados después de aplicarse.
- **Archivos tocados:** `packages/data/src/cliente.ts` · `src/migraciones/ejecutor.ts` ·
  `src/migraciones/lectura.ts` · `src/migraciones/lectura.test.ts` ·
  `packages/data/bin/migrar.mjs` · `scripts/db.mjs` · `scripts/verificar-pruebas.mjs` ·
  `vitest.config.ts` · `vitest.integracion.config.ts` · `eslint.config.mjs` ·
  `.prettierignore` · `turbo.json`
- **Decisiones tomadas:**
  - **La tanda entera corre en UNA transacción.** Postgres tiene DDL transaccional, así que
    si la tercera migración falla las dos anteriores se revierten de verdad.
  - **El ejecutor usa el cliente crudo de `pg`, no Kysely**, porque Kysely envía por el
    protocolo extendido, que admite una sola sentencia por mensaje, y un archivo de
    migración tiene decenas.
  - **El hash normaliza CRLF.** Sin eso, un `checkout` en Windows con `core.autocrlf` haría
    que el ejecutor gritara que TODAS las migraciones fueron editadas.
  - **`lectura.ts` se separó de `ejecutor.ts`.** Leer archivos y ordenarlos no necesita una
    conexión, y mientras vivían juntos la prueba unitaria arrastraba `cliente.ts` —y con él
    `server-only`, que lanza fuera de un contexto de servidor— sólo para comprobar que
    "010" va después de "002".
  - **Imports relativos con extensión `.ts` explícita.** Sin ella Node ESM no resuelve, y
    `typecheck` y `vitest` sí: las dos puertas pasaban sobre un CLI que reventaba al
    importar.
- **Pruebas que pasan:** 9 unitarias de lectura de migraciones (orden por prefijo numérico,
  nombres inválidos, versiones duplicadas, y que el hash **no** cambie por CRLF).
- **Verificado con — tres defectos que ninguna puerta veía:**
  1. **`ejecutor.ts` importaba `./cliente` sin extensión.** `typecheck` y `vitest` lo
     resuelven; Node ESM no. `pnpm db:migrate` reventaba antes de leer `DATABASE_URL`.
  2. **`correrShim` lanzaba `pnpm.cmd` con `shell: false`.** Desde Node 18.20.2, lanzar un
     `.cmd` sin shell se rechaza con `EINVAL` — es la mitigación de CVE-2024-27980
     ("BatBadBut"). `pnpm db:migrate` fallaba **siempre** en Windows, que es donde se
     desarrolla hoy.
  3. **Cinco paquetes declaraban su propio `test:unit` con un `vitest run` pelado.** Vitest
     toma la configuración del directorio donde se invoca, así que esos scripts no veían la
     exclusión de la raíz: `pnpm --filter @morphiqpos/testing test:unit` arrastraba una
     prueba de integración y fallaba por falta de Postgres. La reacción natural habría sido
     saltarse la prueba. Se retiraron los cinco scripts y la raíz quedó como única entrada.

  Se escribió `scripts/verificar-pruebas.mjs`, que **no mira la configuración**: le pregunta
  a Vitest qué archivos recoge. Validado mutando:
  - **Destructivas que FALLAN:** devolver `test:unit` a un paquete · quitar la exclusión de
    `*.integracion.test.ts` de la config raíz · excluirlas también de su propia puerta (una
    prueba que no corre en ninguna parte es peor que no tenerla).
  - **Inocuas que PASAN:** añadir un script no-test a un paquete · reformatear la config raíz.
- **Pendiente o riesgo:** `migrar()` **no se ha ejecutado nunca contra una base**. Su mitad
  pura está probada; la que abre transacciones, no. Bloqueado por `DATABASE_URL`.
- **Reclasificaciones:** ninguna.

### F1.1-T00 · Correcciones de arranque de la auditoría de F1.0
- **Fecha:** 2026-09-08 (commit `93870a1`)
- **Qué se hizo:** las cinco correcciones que `15-AUDITORIA-F1.0-Y-REPLANTEAMIENTO.md`
  exige antes de tocar código nuevo.
- **Archivos tocados:** `scripts/db.mjs` · `scripts/verificar-arranque.mjs` ·
  `scripts/verificar-estructura.mjs` · `infra/docker/docker-compose.yml` ·
  `apps/web/src/consultas/claves.ts` · `docs/auditorias/F1.0-sign-off.md` · y el borrado de
  `apps/worker/`, `capabilities/`, `packages/app/`, `packages/registry/`, `infra/ci/`
- **Decisiones tomadas:**
  - **La guarda de `delegarEnData` comprobaba el archivo, no el script.** Miraba si existía
    `packages/data/package.json` — cierto desde F1.0 — así que nunca disparó. Ahora
    comprueba que la tarea **esté** en `scripts` y sale con código 3. Es el error de manual
    de `contratos-por-mutacion`: atarse al identificador en vez de al uso.
  - **Postgres 17.11 en el compose**, para igualar el 17.6 de Supabase.
  - **El acta de F1.0 lleva una corrección fechada** admitiendo que exageró sobre las
    pruebas de integración. El acta se corrige, no se reescribe.
- **Pruebas que pasan:** `scripts/verificar-arranque.mjs`, que extrae el cuerpo de
  `delegarEnData` contando llaves y lo lee **sin comentarios**, para no encontrarse a sí
  mismo.
- **Verificado con:** `pnpm db:seed` → `✗ packages/data no implementa el script "seed"`,
  salida 3. Con la guarda vieja, pasaba en silencio. ✅
- **Pendiente o riesgo:** ninguno.
- **Reclasificaciones:** ninguna.

### F1.0-T09 · Puertas de CI
- **Fecha:** 2026-09-07
- **Qué se hizo:** ESLint 10 + typescript-eslint con reglas **con información de tipos**,
  Prettier, el escáner de residuos y las 5 prohibiciones de dependencia entre capas.
  Workflow de GitHub Actions con 3 trabajos: calidad, auditoría de dependencias e
  independencia (ZERO-01, con los dominios heredados bloqueados en `/etc/hosts`).
- **Archivos tocados:** `eslint.config.mjs` · `.prettierrc.json` · `.prettierignore` ·
  `scripts/verificar-residuos.mjs` · `.github/workflows/verificar.yml` · `package.json`
- **Decisiones tomadas:**
  - **ESLint, no Biome**, aunque Biome es mucho más rápido. La regla que decide es
    `no-floating-promises`: en un sistema donde el cobro, la comanda y el stock son
    transacciones (R10), un `await` olvidado **no falla** — sigue adelante y deja la
    transacción a medias. Es el defecto P0-03 de las dos fuentes. Biome todavía no tiene
    reglas con información de tipos, así que no puede verlo.
  - `parseFloat` **prohibido** por lint: es la puerta por la que vuelve el punto flotante
    al dinero (R15).
  - **El escáner de residuos no escribe los patrones literalmente: los compone.** Si
    estuvieran escritos tal cual, se encontraría a sí mismo y habría que exceptuarlo — y
    una excepción es por donde se empieza a perder una regla. Lo mismo en el workflow y en
    `verificar-historico.mjs`.
- **Pruebas que pasan:** `pnpm lint` en cero sobre todo el monorepo; `verify:residuos` con
  8 patrones.
- **Verificado con — y aquí está lo importante:**
  - **Meta-prueba 1** (import de `packages/data` desde `apps/web`): **encontró un defecto
    real en mi propia configuración.** La quinta prohibición (`historico/`) aplicaba a
    `**/*` y, al ir después, **desactivaba en silencio las otras cuatro**: en la
    configuración plana de ESLint dos bloques que tocan el mismo archivo y la misma regla
    no se suman, gana el último. **Sin crear el fallo a propósito, la regla de dependencia
    entre capas habría estado apagada desde el primer día sin que nada lo dijera.**
    Corregido: la quinta se añade a los patrones de cada grupo.
  - Las 5 prohibiciones verificadas una por una creando el import prohibido real. ✅
  - **Meta-prueba 2**: un archivo con la cadena de la plataforma fuera de `historico/` →
    3 hallazgos, código de salida 1. ✅
- **Pendiente o riesgo:** el workflow **no se ha ejecutado nunca** (A-35, sin remoto). Cada
  paso invoca el mismo script que corre en local, y esos sí están verificados.
- **Reclasificaciones:** ninguna.

### F1.0-T10 · Andamiaje de pruebas
- **Fecha:** 2026-09-07
- **Qué se hizo:** `packages/testing` con inyección de fallos, datos sintéticos y arranque
  de Postgres; configuración separada de integración; Playwright con 5 pruebas × 2
  dispositivos.
- **Archivos tocados:** `packages/testing/src/{fallos,datos,postgres,fallos.test}.ts` ·
  `vitest.config.ts` · `vitest.integracion.config.ts` · `pruebas/postgres.setup.ts` ·
  `playwright.config.ts` · `pruebas/e2e/estilos.spec.ts`
- **Decisiones tomadas:**
  - **El punto de interrupción se elige por NOMBRE de paso, no por posición.** Un índice se
    rompe en cuanto alguien agrega un paso intermedio, y entonces la prueba sigue pasando
    interrumpiendo otra cosa. Si el nombre no existe, revienta.
  - **Si no hay base de datos, las pruebas de integración FALLAN; no se saltan.** Lo fácil
    sería saltárselas y salir en verde sin haber probado la mitad que más riesgo cubre.
  - Las suites unitaria y de integración están separadas por patrón de archivo: `test:unit`
    tiene que seguir corriendo en menos de un segundo sin base, o deja de correrse.
- **Pruebas que pasan:** 149 unitarias · 10 E2E en escritorio y tablet. La revisión de zoom
  a 100 %, 125 % y 200 % que pide `05 §8` **quedó automatizada**; era manual, o sea, de las
  que se dejan de hacer.
- **Verificado con — dos defectos reales que encontró la E2E:**
  1. **Tailwind 4 no genera `h-[var(--x)]`**: descarta el `var()` desnudo entre corchetes;
     su sintaxis es `h-(--x)`. La clase quedaba en el HTML, **no existía en el CSS**, y la
     perilla de densidad no hacía absolutamente nada — sin fallar nada.
  2. **`transition-all` de shadcn anima la altura.** Viola la regla de rendimiento del
     proyecto ("evita animar width, height, padding") y hacía que el control no respondiera
     al cambio de densidad. Sustituido por la lista explícita de propiedades.
  - **Y un fallo de la prueba misma:** comparaba órdenes ("compacta < normal") y **no
    detectaba un `h-10` fijo**, porque la escala de espaciado de Tailwind está aliada a
    nuestros tokens y también encoge. Se cambió a alturas **exactas** (48/40/32). Con la
    mutación `h-10` da 50 y falla. ✅
- **Pendiente o riesgo:** las pruebas de integración y los 4 escenarios `FAULT-*` no se han
  ejecutado nunca contra Postgres real: falta Docker. WebKit no instalado; la tablet se
  emula sobre Chromium hasta F1.4.
- **Reclasificaciones:** ninguna.

### F1.0-T12 · Variables de entorno validadas
- **Fecha:** 2026-09-07
- **Qué se hizo:** `packages/contracts/src/entorno` con esquema zod. Si falta una variable,
  el proceso **no arranca**.
- **Archivos tocados:** `packages/contracts/src/entorno/{index,entorno.test}.ts`
- **Decisiones tomadas:** además de existir, se valida que **sirvan**: `DATABASE_URL` tiene
  que ser Postgres (el modelo usa índices parciales únicos y triggers; otro motor no es una
  opción, es un fallo diferido), los secretos rechazan los valores de `.env.example`
  —copiar el archivo no es configurarlo— y se reportan **todos** los problemas de una vez.
- **Pruebas que pasan:** 16. Una por cada variable obligatoria, escritas como bucle: una
  lista a mano se olvida en la variable número doce, que es justo cuando duele.
- **Verificado con:** la prueba "rechaza una URL sin esquema" **falló antes de la
  corrección**. `z.url()` acepta `localhost:3000` porque lo lee como el protocolo
  `localhost:`, y eso produce enlaces rotos en los tickets y en el portal QR. ✅
  - Segundo hallazgo, del compilador: `new URL()` **no existe en `packages/contracts`**,
    porque el paquete no tiene los tipos de Node ni del DOM. La restricción es a propósito
    —contracts no depende de nada, y eso incluye el entorno de ejecución— así que se validó
    con expresión regular en vez de relajar su `tsconfig`.
- **Pendiente o riesgo:** los valores sintéticos de las pruebas parecen secretos ante un
  escáner automático. Son evidentes, pero conviene saberlo si se instala secret scanning.
- **Reclasificaciones:** ninguna.

### F1.0-T13 · Documentación de arranque
- **Fecha:** 2026-09-07
- **Qué se hizo:** `README.md` del repositorio de código y el acta de sign-off del corte.
- **Archivos tocados:** `README.md` · `docs/auditorias/F1.0-sign-off.md`
- **Decisiones tomadas:** el README lleva una sección de **lo que falta** —`db:migrate` sin
  migraciones, CI sin ejecutar, tablet sobre Chromium— para que nadie lo descubra a la
  mala. Y una tabla de "reglas que hace cumplir el código, no la buena voluntad": una regla
  sin puerta automática detrás es un recordatorio, y los recordatorios se olvidan al
  archivo 200.
- **Pruebas que pasan:** no aplica.
- **Verificado con:** no aplica.
- **Pendiente o riesgo:** ninguno.
- **Reclasificaciones:** ninguna.


### F1.0-T11 · `apps/web` mínima — y el cierre de T07 y T08
- **Fecha:** 2026-09-07
- **Nota de orden:** T11 se adelantó **con permiso de Miguel**. `/estilos` (T08) no puede
  existir sin app, y las primitivas de shadcn se instalan contra una app. El documento
  del corte las ordena al revés; queda anotado como defecto del plan.
- **Qué se hizo:**
  - `apps/web` con **Next 16.3.4 + React 19.2.8** (A-36) y **Tailwind 4.3.3**.
  - Los tres layouts de grupo con su densidad según `05 §7`: `(auth)` normal ·
    `(gestion)` normal · `(operacion)` compacta.
  - Proveedores con TanStack Query, `next-themes` y **`sonner` como único** sistema de
    avisos (P2-07: la tiendita llegó a tener tres conviviendo).
  - **Factory central de claves de consulta**, construida antes de que haya 200 usos.
  - `middleware.ts` con CSP de nonce por petición y el punto de enganche de la sesión
    documentado, para que no se resuelva improvisando dentro de una página.
  - **36 primitivas** adoptadas y tokenizadas, más la página `/estilos`.
- **Decisiones tomadas:**
  - **Tailwind 4, no v3** (`04-ARQUITECTURA §6`). La razón que el documento da para v3 es
    *"continuidad con ambos sistemas"*, y no aplica: repo nuevo, ninguna configuración
    reutilizada. El `@theme` de v4 mapea directo sobre las variables CSS del sistema de
    tokens. **Registrado como decisión pendiente de anotar en `/DECISIONES.md` como A-38.**
  - **Las mutaciones de TanStack Query no reintentan solas.** Los comandos son
    idempotentes, así que un reintento no duplicaría; pero reintentar un cobro en
    silencio escondería un fallo real al cajero (R12). Que lo decida la pantalla, con el
    error a la vista.
  - **El codemod de primitivas se queda en el repositorio.** Es la evidencia de que la
    adopción fue sistemática, y se vuelve a correr con cada primitiva nueva.
  - **Token `--velo` nuevo**, agregado al contrato y a las 2 paletas × 2 modos: shadcn usa
    `bg-black/50` para el velo de los diálogos, que ignora el estilo activo.
  - **Primitivas dejadas fuera a propósito** (R8): `chart` (recharts), `calendar`,
    `carousel`, `drawer`, `command`, `form`. Arrastran dependencias sin uso todavía.
    Entran con su feature.
  - **El layout raíz es dinámico.** Un nonce por petición no cabe en HTML prerenderizado.
    No se pierde nada: en un POS toda pantalla depende de la sesión, del negocio y de la
    terminal.
- **DEFECTO ENCONTRADO Y CORREGIDO — el más importante de la sesión:**
  **La CSP bloqueaba todos los scripts de Next.** La página se servía, se veía perfecta en
  una captura de pantalla, y **no hidrataba**: ni un botón funcionaba. Tres causas
  encadenadas: el middleware no ponía la CSP en las cabeceras de la **petición** (de donde
  Next lee el nonce), las páginas se prerenderizaban estáticas, y `next-themes` inyecta un
  `<script>` en línea sin nonce.
  - **Lo grave no fue el bug, fue que mi verificador dio verde con la aplicación rota.**
    Comprobaba la política, no que la aplicación funcionara bajo ella. Ahora comprueba
    además que **ningún `<script>` de Next salga sin nonce**, y esa comprobación falla
    contra el código anterior (8 de 8 scripts sin nonce). Es la lección de `13-PRUEBAS §1`
    aprendida en carne propia: *una prueba que pasa igual con y sin la corrección no
    prueba nada.*
  - La CLI de shadcn además instaló un paquete de npm llamado literalmente **`cn`** por un
    alias mal resuelto. Eliminado.
  - Cuatro primitivas no compilaban con `exactOptionalPropertyTypes`. **La bandera no se
    relajó:** se corrigió el patrón (desestructurar una prop opcional y volver a pasarla
    tal cual), y la corrección vive en el codemod.
- **Pruebas que pasan:** **124 unitarias** + `pnpm verify` completo en verde: estructura ·
  histórico · tsconfig · entorno · primitivas · typecheck · pruebas · build · cabeceras
  en vivo.
- **Verificado con:** 3 mutaciones de cabeceras (quitar `nosniff`, `unsafe-inline` en
  `script-src`, scripts sin nonce) y las 7 del sistema de diseño. Y **verificación visual
  en el navegador**: cambiar de premium a editorial cambia colores, redondeo y elevación
  en vivo, y la tabla de contraste se recalcula sola — 17.4:1 texto sobre fondo, 5.9:1 en
  el botón primario.
- **Pendiente o riesgo:** la comprobación de contraste al 100 %, 125 % y 200 % de zoom
  (`05 §8`) sigue siendo manual. Se automatiza en T10 con Playwright.
- **Reclasificaciones:** ninguna.


### F1.0-T07 · Sistema de diseño base — 🟨 motor completo, faltan las primitivas
- **Fecha:** 2026-09-07
- **Qué se hizo:** `packages/ui` con las tres capas de `05-SISTEMA-DE-DISENO`:
  - **Capa 1 · tokens:** 32 de color y 47 de forma, tipografía y movimiento.
  - **Capa 2 · las 4 perillas:** densidad (3), redondeo (5), elevación (4), movimiento (4).
  - **Capa 3 · estilos:** `premium` y `editorial`, en claro y oscuro.
- **Archivos tocados:** `packages/ui/src/estilos/{base,premium,editorial,index}.css` ·
  `packages/ui/src/tokens/{color,contrato,estilos,leerCss,index}.ts` ·
  `packages/ui/src/tokens/sistema.test.ts` · `packages/ui/{package.json,tsconfig.json}`
- **Decisiones de diseño y su consecuencia:**
  - **Las perillas se aplican como atributos `data-*` en `<html>`; el CSS de `base.css`
    hace el trabajo.** Un estilo **no duplica** sombras ni radios: elige valores de
    perilla que ya existen. Consecuencia: añadir un estilo cuesta **una paleta**, no un
    juego de componentes. Es lo que hace cierto el §5 ("no hay componentes alternos por
    estilo") en vez de dejarlo como intención.
  - **`--fuente-numeros` es tabular y obligatoria.** En un POS los importes se leen en
    columna: sin cifras de ancho fijo los totales bailan y el cajero se equivoca.
    Ninguno de los dos sistemas fuente lo tenía.
  - **`prefers-reduced-motion` anula el movimiento pase lo que pase**, sin importar la
    perilla ni lo que configure el cliente.
  - **La elevación `doble-bisel` conserva el look actual de la tiendita como perilla**,
    en vez de dejarlo en clases `skeu-*` dentro de `globals.css`. Cuando llegue el
    estilo `skeuomorfico` en F1.5, ya sólo tendrá que aportar su paleta.
  - **La accesibilidad es la restricción de entrada, no una revisión del final.** Se
    escribió el auditor de contraste **antes de elegir un solo color**, y la paleta se
    ajustó hasta pasarlo. Es la lectura literal de §9 ("se verifica en CI, no en la
    revisión final").
- **Corrección de método, mía:** primero medí la separación entre colores de gráfica con
  **razón de contraste WCAG**. Es la métrica equivocada: mide luminancia, y dos tonos
  distintos con la misma luminosidad dan 1.1:1 aunque se distingan perfectamente.
  Exigirla habría obligado a escalonar las seis series por claridad, que es justo lo que
  hace ilegible una gráfica de barras. Se cambió a **distancia perceptual en OKLab**. Con
  la métrica correcta las paletas **sí fallaban de verdad**, y se corrigieron con un
  optimizador que maximiza la separación mínima: **0.214** en premium y **0.175** en
  editorial, sobre un mínimo exigido de 0.12.
- **Pruebas que pasan:** **118 en total** (30 de dinero + 88 del sistema de diseño).
  Cubren `F1.0-P5`: **16 pares de contraste × 2 estilos × 2 modos = 64 comprobaciones**,
  más completitud de tokens, formato HSL válido, las 4 perillas produciendo valores
  distintos, y la separación de los 6 colores de gráfica.
- **Verificado con: 7 mutaciones, las 7 hacen fallar pruebas.**
  `texto-sutil` a 3.9:1 → 2 fallos · falta un token de color → 2 · dos colores de gráfica
  iguales → 1 · sin bloque de movimiento reducido → 1 · fuente de números no tabular → 1 ·
  editorial copiando las perillas de premium → 1 · anillo de foco casi invisible → 2.
  - Una **octava mutación no hizo fallar nada, y está bien**: bajar `texto-sutil` a
    4.86:1 sigue cumpliendo AA. La mutación estaba mal elegida, no la prueba. Se anota
    porque distinguir "la prueba tiene un hueco" de "mi mutación era débil" es
    justamente el trabajo.
- **Pendiente o riesgo — POR ESTO LA TAREA NO ESTÁ FIRMADA:**
  - **Faltan las 49 primitivas de shadcn.** Se instalan con la CLI de shadcn contra una
    app, y `apps/web` es **F1.0-T11**.
  - **Defecto de orden en el plan:** `F1.0-T08` (página `/estilos`) es imposible antes de
    `F1.0-T11` (`apps/web` mínima) — una página no existe sin app. El documento las
    ordena al revés. **Señalado a Miguel; pendiente de su decisión sobre reordenar.**
  - La regla de lint que prohíbe literales de color en las primitivas llega en T09; hoy
    no hay primitivas que lintear.
- **Reclasificaciones:** ninguna.


### F1.0-T06 · `contracts` y `domain` vivos, con el módulo `dinero/` completo
- **Fecha:** 2026-09-07
- **Qué se hizo:** Los dos primeros paquetes del monorepo, con `dinero/` terminado y
  probado, y el andamiaje de pruebas unitarias con Vitest 5.
- **Archivos tocados:** `packages/contracts/{package.json,tsconfig.json,src/index.ts,src/errores/index.ts}` ·
  `packages/domain/{package.json,tsconfig.json,src/index.ts,src/dinero/*}` ·
  `vitest.config.ts` · `pnpm-workspace.yaml` (catálogo de versiones) · `package.json`
- **Decisiones de diseño y su razón:**
  - **`Centavos` es un `bigint` con marca.** La aritmética de TypeScript (`a + b`)
    devuelve `bigint` **sin** marca, así que no compila donde se espera `Centavos`.
    Consecuencia buscada: **una suma de dinero escrita fuera de `dinero/` no compila.**
    Es la versión en tipos de la señal de desviación 4 de `04-ARQUITECTURA §9` ("hay
    dos lugares donde se calcula un total").
  - **`redondear` es la única definición de redondeo del sistema**: ROUND_HALF_UP
    **alejándose del cero**. Se eligió alejarse del cero, y no "siempre hacia arriba",
    para que una venta de 2.5 y su devolución de −2.5 se cancelen exactamente. Con
    "siempre arriba" quedaría un centavo colgado en los reportes de cada devolución.
  - **Los porcentajes van en puntos base enteros** (16 % es 1600, no 0.16). Así el
    impuesto tampoco pasa nunca por punto flotante. Coincide con `margen_bp` de
    `03-MODELO`.
  - **`repartir` usa residuo mayor con orden determinista.** 100 entre 3 da 34/33/33 y
    suma exactamente 100. No se sortea el centavo sobrante: un reparto que cambia entre
    ejecuciones no se puede cuadrar contra un corte de caja.
  - **Interpretación de R15 ("moneda explícita"), no decisión inventada:** el modelo de
    `03-MODELO` no tiene columna de moneda, así que la moneda no puede vivir en cada
    importe sin contradecir el esquema. Se cumple en las fronteras: `formatear` exige
    `Moneda` siempre. Mezclar monedas en una misma orden queda **fuera de Fase 1** y
    necesitaría llevar la moneda en cada importe. **Si esto no es lo que querías,
    dímelo y lo cambio antes de F1.1.**
  - **Sólo se exporta lo que tiene prueba (R17).** Se quitaron `multiplicarPorUnidades`,
    `minimo` y `maximo` por YAGNI. Multiplicar por cantidad fraccionaria (1.235 kg de
    jamón) necesita el módulo de cantidades y llega con la venta por peso en F1.2;
    resolverlo hoy con un `number` reintroduciría el punto flotante por la puerta de atrás.
  - **Catálogo de versiones en `pnpm-workspace.yaml`.** Con 15 paquetes por venir, es lo
    que impide que dos usen versiones distintas de la misma herramienta y que las
    pruebas se comporten distinto según dónde se corran.
- **Pruebas que pasan:** **30 pruebas unitarias**, escritas antes del código. Cubren los
  cuatro casos del criterio de aceptación —redondeo de `.005`, propina de 100 entre 3,
  IVA de 16 % sobre total impar, suma de 1000 líneas sin deriva— más rechazo de texto
  basura, ida y vuelta de formato, y una propiedad exhaustiva: la suma de las partes es
  el total para 201 importes × 9 divisores.
- **Verificado con: 5 mutaciones, las cinco hacen fallar pruebas.**
  1. `desdeTexto` con `Math.round(parseFloat(t) * 100)` → **2 fallos** (los casos `.005`).
  2. `redondear` trunca en vez de redondear → **6 fallos**.
  3. Redondeo bancario (half-even) en vez de half-up → **3 fallos**.
  4. `repartir` redondea cada parte por separado → **4 fallos**, incluida la propiedad.
  5. `centavos` acepta decimales → **2 fallos**.
- **Pendiente o riesgo:** la regla de lint que prohíbe `Number` con decimales para dinero
  llega en T09. Hoy la barrera es el sistema de tipos, que ya impide lo importante.
- **Reclasificaciones:** ninguna.


### F1.0-T05 · Entorno local con Docker — 🟨 parcial, falta la comprobación en vivo
- **Fecha:** 2026-09-07
- **Qué se hizo:** `infra/docker/docker-compose.yml` con **Postgres 16.15-alpine** y
  **MinIO**, más `scripts/db.mjs` con `up · down · reset · logs · estado · migrate · seed`
  y `.env.example` completo.
- **Archivos tocados:** `infra/docker/docker-compose.yml` · `scripts/db.mjs` ·
  `scripts/verificar-entorno.mjs` · `.env.example` · `package.json`
- **Decisiones tomadas:**
  - **Imágenes fijadas a versión exacta**, nunca `latest` (gate PRS §20, build
    reproducible). El contrato falla si alguien las mueve.
  - **Puerto 5433** para Postgres: 5432 se deja libre por si Miguel ya tiene otro
    Postgres instalado.
  - `POSTGRES_INITDB_ARGS` con `C.UTF-8` desde el inicio: el ordenamiento de nombres
    con acentos y ñ tiene que ser correcto en los reportes **desde el primer día**,
    no cuando ya haya datos.
  - `log_min_duration_statement=200`: registra toda sentencia de más de 200 ms. Es
    lo que permite detectar N+1 y consultas sin índice antes de que las sufra un cliente.
  - **El bucket se crea privado** (`mc anonymous set none`). Los archivos se sirven con
    URL firmada; cierra SEC-RLS de `06-DEFECTOS §4` por construcción.
  - `migrate` y `seed` **delegan en `packages/data`**, que llega en F1.1. Hoy fallan con
    código 3 y un mensaje que explica por qué. No fingen éxito (R12).
- **Corrección de calidad no planeada:** Node avisó `DEP0190` — `shell: true` con
  argumentos concatena sin escapar en Windows. Se eliminó de **toda** invocación a
  `docker` y `git`. El único uso restante es el shim `.cmd` de pnpm, con argumentos
  constantes escritos en el propio archivo y documentado en el código.
- **Pruebas que pasan:** `scripts/verificar-entorno.mjs` — servicios exigidos con su
  imagen fijada, healthcheck y volumen; ninguna imagen móvil; ningún registro que exija
  cuenta (A-27); volúmenes con nombre; `.env.example` con las 9 variables de
  `04-ARQUITECTURA §8`; los dos secretos con marcador obvio; `.env` ignorado por git.
- **Verificado con:** 5 mutaciones, las cinco hacen fallar el contrato con código 1 —
  imagen `:latest` ✅ · quitar el healthcheck de Postgres ✅ · meter un servicio
  propietario (`supabase/gotrue`) ✅ · quitar `PIN_PEPPER` de `.env.example` ✅ · poner
  un valor que parece un secreto real ✅.
- **Pendiente o riesgo — POR ESTO LA TAREA NO ESTÁ FIRMADA:**
  - **Docker no está instalado en la máquina.** La comprobación en vivo (`docker compose
    up` → conectarse → `db:migrate`) no se ha ejecutado, y es el criterio de aceptación
    literal de la tarea. El script ya la trae escrita y se activa sola en cuanto Docker
    exista.
  - MinIO lleva desde septiembre de 2025 sin publicar versión comunitaria nueva. No
    bloquea: el almacenamiento vive detrás de `ServicioArchivos` (`04-ARQUITECTURA §5`)
    y cambiarlo es un archivo. Se revisa si sigue estancado al llegar a F1.1.
  - Al instalar Docker Desktop hay que mover *Disk image location* al disco D.
- **Reclasificaciones:** ninguna.


### F1.0-T04 · ADR de acceso a Postgres
- **Fecha:** 2026-09-07
- **Qué se hizo:** Se escribió `docs/adr/0001-acceso-postgres.md` evaluando `pg` con SQL
  a mano, Drizzle y Kysely contra **10 requisitos que salen de reglas ya escritas**, no
  de preferencias. Miguel aprobó la Opción C el mismo día; el ADR pasó a **ACEPTADO** y
  quedó registrado como **A-37**.
- **Archivos tocados:** `morphiqpos/docs/adr/0001-acceso-postgres.md` ·
  `/DECISIONES.md` (A-37) · `.npmrc` · variables de entorno de usuario
- **Decisión:** **Kysely sobre `pg`**, esquema entero en `.sql`, tipos generados de la
  base con `kysely-codegen`, migraciones `NNN_snake_case.sql` con el ejecutor de Kysely.
  - **Lo que decidió no fue la comodidad sino el requisito 10.** El modelo de `03-MODELO`
    tiene triggers (`historial_precios`), `check` explícitos en vez de `enum`, y un índice
    parcial único —`unique (mesa_id) where estado not in ('pagada','cancelada')`— que **es**
    la corrección estructural de P0-05. Nada de eso cabe en un esquema declarado en TS.
    Con Drizzle la mitad viviría en TypeScript y la otra en migraciones SQL crudas: dos
    fuentes de verdad del esquema que pueden divergir sin que nada avise. Es la misma
    clase de deriva silenciosa que la Fase 1 viene a erradicar.
  - Kysely **no compite con la Opción A, la completa**: por debajo es `pg` ejecutando el
    mismo SQL. La salida de reversa está escrita en §6 del ADR.
- **Cambio operativo pedido por Miguel el mismo día — nada escribe en el disco C:**
  - `store-dir=D:/.pnpm-store` fijado en `.npmrc`. **Tiene que estar en la misma unidad
    que el monorepo**: si no, pnpm copia en vez de enlazar y el espacio se multiplica.
  - `COREPACK_HOME`, `PLAYWRIGHT_BROWSERS_PATH` y `npm_config_cache` apuntan a
    `D:\_cache-dev` (variables de **usuario**, reversibles desde Windows).
  - Los archivos de trabajo del agente pasan a `D:\MIS PROYECTOS\Master POS\_trabajo`.
- **Pruebas que pasan:** no aplica — es un documento de decisión. `pnpm install` y
  `pnpm verify` siguen en verde después de mover el almacén de paquetes a D.
- **Verificado con:** no aplica (no cierra un defecto).
- **Pendiente o riesgo:**
  - `C:\Users\mighu\AppData\Local\node\corepack` quedó copiado a D pero **no se pudo
    borrar de C** (94 MB): estaba en uso por el pnpm en ejecución. Borrarlo al cerrar.
  - Al instalar Docker Desktop hay que mover *Disk image location* a `D:\`, o Postgres
    y MinIO se comen varios GB del disco del sistema.
  - Kysely es `0.29.x`, pre-1.0. Se fija la versión exacta. Riesgo controlado en el ADR.
- **Reclasificaciones:** ninguna.


### F1.0-T03 · TypeScript estricto en todo el monorepo
- **Fecha:** 2026-09-07
- **Qué se hizo:** `tsconfig.base.json` con las 4 banderas que exige la tarea
  (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `exactOptionalPropertyTypes`), sin `allowJs`, más 8 refuerzos coherentes con
  las reglas del proyecto. `tsconfig.json` raíz en modo solución (`files: []`).
  TypeScript **6.0.3** instalado.
- **Archivos tocados:** `tsconfig.base.json` · `tsconfig.json` ·
  `scripts/verificar-tsconfig.mjs` · `package.json` (scripts `typecheck`,
  `verify:tsconfig`)
- **Decisiones tomadas:**
  - **A-36** ya registrada en `/DECISIONES.md`: TypeScript 6.0.3, no 7.
  - `useUnknownInCatchVariables` (R12), `noFallthroughCasesInSwitch` (R14) y
    `forceConsistentCasingInFileNames` — esta última no es cosmética: Windows es
    *case-insensitive* y Linux no, así que sin ella un `import` con mayúscula
    distinta pasa en la máquina de Miguel y rompe en CI. Ya ocurrió una vez en
    esta sesión con la carpeta `morphiqpos`/`MorphiqPOS`.
  - `lib: ["ES2023"]` sin `@types/node` en el base. **Efecto buscado:**
    `packages/domain` no puede ni escribir `console.log`. La prohibición "cero
    I/O en dominio" (`04-ARQUITECTURA §2`, prohibición 2) queda impuesta por el
    compilador, no sólo por lint. Los paquetes que sí necesitan Node o DOM lo
    añaden explícitamente.
- **Pruebas que pasan:** `scripts/verificar-tsconfig.mjs` — 12 banderas
  obligatorias con su valor exacto, 5 prohibidas por ausencia, exclusión de
  `historico/`, y el invariante permanente de que **todo workspace con
  `package.json` debe tener su `tsconfig.json` extendiendo el base sin relajar
  ninguna bandera** (hoy no hay workspaces; muerde solo desde T06).
- **Verificado con:**
  - **Sonda de 7 violaciones** (`.sonda/src/violaciones.ts`, temporal): parámetro
    implícito, índice sin comprobar, propiedad opcional con `undefined`, override
    sin modificador, `catch` tipado, retorno faltante y caída de `switch`. Las 7
    producen error de compilación. ✅
  - **3 mutaciones del contrato:** `strict: false`, `allowJs: true` y quitar
    `historico` del `exclude`. Las tres hacen fallar el script con código 1. ✅
  - La mutación 3 **también** hizo fallar `verificar-historico.mjs`, que activó
    su comprobación condicional al aparecer `tsconfig.base.json`. Es la prueba de
    que el andamiaje condicional de T02 funciona. ✅
  - El propio contrato encontró un error mío: tenía `checkJs: false` marcado como
    relajación cuando es el valor seguro. Corregido.
- **Pendiente o riesgo:** `pnpm typecheck` corre `turbo run typecheck` y hoy no
  hay ningún paquete en el que correr. Deja de ser un no-op en T06.
- **Reclasificaciones:** ninguna.


### F1.0-T02 · Fuentes originales en `historico/`
- **Fecha:** 2026-09-07
- **Qué se hizo:** Se poblaron las tres fuentes de evidencia y se verificó que
  están aisladas del monorepo.
  - `historico/tiendita/` — clon de `M1gu3hb/POS-MH-Tiendita` en `80c573c`.
  - `historico/restaurante/` — `pos-mh completo.zip` descomprimido.
  - `historico/auditoria-fase-0/` — paquete `POSMH_FASE_0_CLOUD_COWORK_2026-09-06`.
- **Archivos tocados:** `scripts/verificar-historico.mjs` · `package.json`
  (scripts `verify:historico` y `verify`). El contenido de `historico/` no se
  versiona.
- **Hallazgo confirmado por evidencia — cierra el pendiente #1 de `CONTEXTO_MAESTRO §9`:**
  el SHA-256 de `pos-mh completo.zip` es
  `1BF6FC7C26E460B7FE763E80074716BA7FA231B999870CB0EF6174102B72BFF3`, que
  **coincide exactamente** con el registrado en `CONTEXTO_MAESTRO §3` y en
  `01_FUENTES_ORIGINALES/INTEGRIDAD_FUENTE.md`. Verificado con `Get-FileHash`
  sobre el ZIP original. La verificación independiente ya no está pendiente.
  - Cifras cotejadas contra `01-ANALISIS`: **288 entradas** y **244 archivos en
    `src/`**. Coinciden.
  - Nota de método: `grep -rl base44 src` da 76 archivos; `01-ANALISIS` habla de
    68 archivos con acceso directo a datos. No es contradicción: son dos métricas
    distintas (mención de la cadena vs. llamada a entidad).
- **Pruebas que pasan:** `scripts/verificar-historico.mjs` — 7 comprobaciones:
  las tres fuentes existen y están completas · `historico/` ignorada por git ·
  `historico/README.md` sí versionado · no es workspace de pnpm · ningún archivo
  de código la importa · sin fuentes no declaradas · y dos comprobaciones
  condicionales que se activan solas cuando existan `tsconfig.base.json` (T03) y
  la configuración de lint (T09).
- **Verificado con:** tres mutaciones. (1) un `import` desde `historico/` en
  `packages/domain` → falla ✅ · (2) quitar `historico/*` del `.gitignore` →
  falla ✅ · (3) borrar una de las tres fuentes → falla ✅. Código de salida 1 en
  los tres casos, 0 con el repositorio sano.
- **Pendiente o riesgo:** la exclusión de `historico/` del `tsconfig` (T03), del
  lint y del escaneo de residuos (T09) queda cubierta por comprobaciones
  condicionales que hoy sólo avisan. Se convierten en fallo real al llegar esas
  tareas.
- **Reclasificaciones:** ninguna.


### F1.0-T01 · Repositorio y estructura del monorepo
- **Fecha:** 2026-09-07
- **Qué se hizo:** Se creó el monorepo `morphiqpos` con la estructura exacta de
  `04-ARQUITECTURA §1` (`apps/`, `packages/`, `capabilities/`, `infra/`, `docs/`,
  `historico/`), pnpm 12.3.4 fijado con `packageManager` y Turborepo 2.10.12.
- **Archivos tocados:** `package.json` · `pnpm-workspace.yaml` · `turbo.json` ·
  `.npmrc` · `.gitignore` · `.gitattributes` · `historico/README.md` ·
  `scripts/verificar-estructura.mjs`
- **Decisiones tomadas:**
  - **Ruta local del código:** `D:\MIS PROYECTOS\Master POS\morphiqpos`. El clon
    del repositorio de documentación se renombró a `MorphiqPOS-docs` porque
    Windows es *case-insensitive* y `morphiqpos` colisionaba con `MorphiqPOS`.
  - **Sin remoto por ahora** (decisión de Miguel, 7-sep-2026). Ver A-35 en
    `/DECISIONES.md`. Consecuencia: F1.0-T09 escribe el workflow de GitHub
    Actions pero las dos meta-pruebas se verifican con scripts locales.
  - **`historico/` fuera de git**, no sólo fuera del build. El documento sólo
    exigía excluirla del build y del escaneo, pero R34 prohíbe publicar material
    que describa vulnerabilidades de sistemas en producción. Se versiona
    únicamente `historico/README.md` con las reglas de la carpeta.
  - **`node-linker=isolated`** en `.npmrc`: un paquete sólo puede importar lo que
    declara. Hace cumplir la regla de dependencia entre capas a nivel de gestor
    de paquetes, además del lint de CI.
  - **pnpm 12.3.4** y **Turborepo 2.10.12** (últimas estables). `04-ARQUITECTURA §6`
    fija las herramientas, no sus versiones.
- **Pruebas que pasan:**
  - `scripts/verificar-estructura.mjs` — 19 carpetas y 6 manifiestos, `historico/`
    ignorada por git y fuera de los workspaces, `.gitignore` con los 5 patrones
    exigidos por la tarea.
  - Clon limpio → `pnpm install` → `pnpm verify` en verde (parte de `F1.0-P1`).
- **Verificado con:** la prueba se escribió antes que la estructura (R17) y falló
  con 25 fallos contra el repositorio vacío. ✅
- **Pendiente o riesgo:**
  - Docker no está instalado en la máquina de Miguel. Bloquea F1.0-T05, T10 y
    parte de T09. Miguel lo instala.
  - La exclusión de `historico/` del `tsconfig` se cierra en F1.0-T03.
- **Reclasificaciones:** ninguna.


---

## Preguntas abiertas para Miguel

Las que aparezcan durante la ejecución. Formato: `[FECHA] pregunta — bloquea la tarea ____`.

| Fecha | Pregunta | Bloquea | Estado |
|---|---|---|---|
| 2026-09-08 | **BLOQUEA HOY** `DATABASE_URL`. La contraseña **no es recuperable**: Supabase la guarda hasheada y el CLI sólo la acepta como entrada. Regenerarla por la API exige leer el token del Credential Manager de Windows, y esa lectura está bloqueada en el entorno del agente. **Lo tiene que hacer Miguel**: Supabase → MorphiqPOS → Database → Reset password → Session pooler → pegar en `.env`. Sin esto NINGUNA prueba de integración corre. | Todas las de integración · A-05 · A-08 · A-09 | ⬜ Abierta |
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
