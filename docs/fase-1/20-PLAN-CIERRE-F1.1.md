# 20 — Plan de cierre de F1.1

Fecha: 8 de septiembre de 2026
**Este documento sustituye la lista de tareas de `16-CORTE-F1.1`, `18-REPARTO-DOS-CARRILES` y `19-PROMPTS-SESION-3`.**

---

## 1. El hallazgo que manda sobre todo

> **El motor de venta es excelente. Y nadie puede iniciar sesión.**

`cobrarOrden` es el mejor código del proyecto: ocho efectos en una sola transacción, precio recalculado en servidor, idempotencia obligatoria, stock antes del folio para que una reversión no deje hueco en la numeración. Ese razonamiento está escrito en el código y protegido por mutación.

Y no sirve de nada todavía, porque **la aplicación es inaccesible**. Esta es la cadena, verificada archivo por archivo:

1. `credenciales_pin` tiene 0 filas y **ningún archivo del repositorio inserta en esa tabla.** `hashearPin()` existe, está exportada, y nadie la llama.
2. No hay comando, ruta ni pantalla para establecer un PIN.
3. `generarCodigoDeEnrolamiento()` existe, está exportada, y **ningún callsite la invoca.** No hay forma de enrolar una terminal.
4. Sin cookie de dispositivo, `GET /api/auth/empleados` devuelve `[]`. La pantalla de entrar muestra una lista vacía.

**Es un bucle cerrado sin puerta.** No es un bug: es una tarea que nadie escribió, y ni Claude Code ni Codex la detectaron porque cada uno construyó su mitad y ninguno intentó entrar.

### Y hay un segundo hallazgo igual de importante

> **El flujo de venta NUNCA se ha ejecutado contra la base real. Ni una vez.**

Los datos que hay en Supabase —3 organizaciones, 14 productos, 2 órdenes pagadas, 16 movimientos de stock— **son atrezzo insertado por SQL directo** en las migraciones `042` y `043`. Ni una fila pasó por un comando.

**La prueba está en que `auditoria` tiene 0 filas.** El envoltorio audita obligatoriamente toda escritura: si hubiera pasado una venta real, habría rastro. No lo hay.

Eso significa que la capa Kysely completa —repositorios, tipos, SQL— **nunca ha ejecutado una consulta.** El reporte 004 lo dice con todas sus letras y advierte lo más probable: *"la primera venta real puede fallar por algo que ninguna puerta ve, y el candidato más probable es un nombre de columna que no coincida."*

### Y un tercero, estructural

**`carril-b` no está mergeado.** `main` = `carril-a` = `51aa0fd`; `carril-b` = `6036ba5`, aparte.

Todo el trabajo de la sesión 3 de Codex vive sólo en su worktree: las pantallas de gestión cableadas, el arreglo del bug de stock, las migraciones 041/042/043, recetas y costeo. **Y la base de Supabase se migró desde ahí**, así que `main` tiene 8 migraciones y la base real tiene 11. **El código y el esquema ya divergieron.**

---

## 2. Estado verificado

| | Carril A (en `main`) | Carril B (sin mergear) |
|---|---|---|
| Tareas entregadas | 10 (≈9 reales) | 8 |
| Tareas **integradas** | 10 | **0** |
| Rutas de API | 16 | 33 |
| Pantallas cableadas | `/enrolar`, `/entrar`, `/venta` | + `/configuracion`, `/productos`, `/inicio`, `/inventario`, `/recetas` |
| Migraciones | 8 | 11 |
| Pruebas | 30 archivos | 34 archivos |
| Mutaciones | ≈60 | ≈78 |

**Lo que está bien de verdad:** el puente HTTP y el resolvedor de sesión (relee el empleo en la base, una baja revoca la cookie, una terminal desenrolada invalida en vez de degradar) · `cobrarOrden` · el decremento atómico de stock · el arnés `verificar-venta.mjs` con sus cuatro fases incluidas las mutaciones inocuas · la validación de `Origin` de Codex en las rutas de gestión.

**Lo que es teatro:**
- **`/configuracion` en `main`** muestra "Ferretería La Broca" y una dirección inventada, y al guardar **incrementa un contador local y dice "Configuración guardada" sin tocar el servidor.** Es la peor pieza del repositorio. (Codex ya la cableó, pero está sin mergear.)
- **`/productos` en `main`** es una maqueta con array local.
- **El selector de paquete:** 22 de 24 comandos declaran los cinco paquetes. El mecanismo funciona; no hay nada que comprobar.
- **`resetearDemo`** es un comando impecable y auditable que **jamás se ha ejecutado.**

---

## 3. Auditoría de mi propia planeación

Miguel pidió que revisara el plan buscando mis errores, porque cuando un agente se detiene suele ser culpa de la instrucción. Encontré **cinco contradicciones** y las resuelvo aquí antes de escribir una sola tarea.

### Error 1 — Las zonas de propiedad ya no aplican y nadie lo dijo

`TEAM.md` §3 prohíbe tocar la zona del otro carril. **Codex se quedó sin uso: ya no hay dos agentes.** Si Claude Code lee `TEAM.md` tal cual, va a negarse a arreglar `/configuracion` porque "es zona del carril B" — y esa pantalla es de lo más urgente.

**Resolución:** `TEAM.md` queda **suspendido**. A partir de ahora hay un solo desarrollador y es dueño de todo el repositorio. Se elimina la restricción de rangos de migraciones.

### Error 2 — Bucle imposible en la creación del primer PIN

Para crear un PIN hace falta un comando. Para ejecutar un comando hace falta sesión. Para tener sesión hace falta un PIN. **Circular.**

Si no rompo el bucle explícitamente, el agente llega ahí, lo detecta, no sabe qué hacer y se detiene. Es exactamente el modo de falla de la sesión 2.

**Resolución:** se rompe con un **script de arranque** (`pnpm db:bootstrap`), no con un comando. Corre en el servidor con acceso directo a la base, crea el primer dueño con PIN y deja la terminal enrolable. No pasa por `comando()` porque no tiene ámbito del cual colgarse — y eso está bien: es la única excepción legítima, se ejecuta una vez y queda registrada.

### Error 3 — Riesgo al mergear si se hace por partes

El arnés `verificar-inventario.mjs` de `carril-b` busca literalmente la línea `if (movimiento.permiteNegativo) {`, que **sólo existe en la versión arreglada de `stock.ts`**. Si alguien mergea el script sin el arreglo, `pnpm verify` revienta con "No se encontró la protección" y el agente se atora en un fallo que parece grave y no lo es.

**Resolución:** se mergea la **rama completa**, nunca por cherry-pick. Y se corre `pnpm verify` inmediatamente después, antes de tocar nada.

Además: el worktree de Codex contiene archivos del carril A **sin ningún merge registrado en su reflog** — o se copiaron a mano, o se usó `git checkout main -- <rutas>`. Hay que revisar el diff antes de integrar.

### Error 4 — Mi propio tamaño de tarea es inconsistente

En la sesión 2 llamé "A-01" a un subsistema completo (puerto de repositorio, saneador, errores tipados, señales de fallo, dobles, seis archivos de prueba, una migración) y el resultado fue **una tarea en toda la sesión**. En la sesión 3 las tareas fueron concretas y salieron **diez**.

**Resolución:** cada tarea de este plan cabe en 100–250 líneas y tiene un criterio de aceptación que se comprueba ejecutando algo, no leyendo código.

### Error 5 — "Terminar la Fase 1 hoy" no es alcanzable, y decirlo tarde sería peor

**F1.2 (restaurante) no existe: cero líneas.** No hay tablas de `mesas`, `zonas`, `comandas` ni `estaciones` en ninguna migración; cero comandos de mesa, mesero o KDS; cero pantallas. Son ~20 tareas.

Además `planearConsumo` **descarta explícitamente** los productos con estrategia `receta` (`if (producto.estrategiaConsumo !== 'sku') continue`). Las recetas se costean y se muestran, **pero no descuentan inventario al vender**. Un restaurante lo necesita.

**Resolución:** hoy se cierra **F1.1**: un POS que funciona de verdad y está en línea en `pos-mh-astral-systems.com`. Eso es lo que Miguel necesita para enseñárselo a un cliente. El restaurante es el siguiente bloque y va con su propio plan.

---

## 4. El plan: 20 tareas en tres hitos

Cada hito deja el sistema en un estado con valor. Si la sesión se acaba, se acaba en un punto conocido.

### HITO 1 — Que se pueda vender de verdad · C-01 a C-09

**Criterio del hito: `auditoria` deja de tener 0 filas.**
Esa sola fila prueba que la cadena completa —sesión, comando, transacción, Kysely, Postgres— funcionó de punta a punta.

---

**C-01 · Integrar `carril-b` en `main`**
`git switch main` → revisar `git log --oneline main..carril-b` y el diff → `git merge carril-b` (**rama completa, jamás cherry-pick**) → resolver conflictos → `pnpm install` → `pnpm verify`.
*Aceptación:* `pnpm verify` en verde y `main` con 11 migraciones. Si `verify:inventario` falla buscando `if (movimiento.permiteNegativo) {`, es que el merge se hizo mal: la versión de `stock.ts` que queda debe ser la de `carril-b`.

**C-02 · Credenciales y tipos**
Verificar `.env` en `morphiqpos`. Si le falta `DATABASE_URL`, copiarla del `.env` del worktree de Codex (ahí sí funcionó: aplicó tres migraciones) o sacarla con Supabase CLI del proyecto `wyqmzhliurwyxuyxznpb`. Después `pnpm db:tipos`.
*Aceptación:* `packages/data/src/esquema.ts` contiene `recetas`, y `recetas.ts` y `resetear.ts` dejan de acceder por SQL crudo.

**C-03 · Verificar el esquema contra la base**
`pnpm db:migrate` — debe ser no-op si los hashes cuadran. Correr el verificador de esquema aplicado.
*Aceptación:* las 11 migraciones registradas, hashes idénticos, cero drift entre archivos y base.

**C-04 · Script de arranque `pnpm db:bootstrap`** ← rompe el bucle
Script en `packages/data/scripts/` con acceso directo a la base (**no un comando**). Recibe organización, nombre, PIN y nombre de terminal. Crea o reusa persona, identidad y empleo `dueno`; **inserta en `credenciales_pin` con `hashearPin()`**; genera y muestra en consola el código de enrolamiento de 6 dígitos.
*Aceptación:* tras correrlo, `select count(*) from credenciales_pin` devuelve ≥1 y la consola muestra un código de 6 dígitos.

**C-05 · Comando `identidad.establecer_pin` + ruta + pantalla**
Para que un dueño le ponga o cambie el PIN a un empleado desde la aplicación. Verificado en servidor: sólo `dueno` y `administrador`. El PIN nunca vuelve en la respuesta.
*Aceptación:* el dueño cambia el PIN de un cajero desde la UI y el cajero entra con el nuevo.

**C-06 · Exponer el enrolamiento de terminal**
Comando `identidad.generar_codigo_enrolamiento` + ruta + pantalla en gestión que muestre el código.
*Aceptación:* el dueño genera un código desde la UI, lo escribe en `/enrolar` de otra pestaña y esa terminal queda enrolada.

**C-07 · ★ Entrar de verdad ★**
Ejecutar: bootstrap → `/enrolar` con el código → `/entrar` con el PIN → llegar a `/venta` con sesión.
*Aceptación:* la sesión existe, `/api/venta/estado` devuelve 200 y no 401.
**Si algo falla aquí, se arregla aquí.** Es la primera vez que la cadena corre completa.

**C-08 · ★ La primera venta real ★**
Abrir caja → buscar producto → agregar → cobrar en efectivo → ver ticket.
*Aceptación, y es la que cierra el hito:*
```sql
select count(*) from auditoria;   -- > 0
select count(*) from ordenes where folio > 2;  -- la venta nueva, no el atrezzo
```
Más: el movimiento de stock existe, el de caja existe, el folio avanzó, y repetir el cobro con la misma clave de idempotencia **no** crea una segunda orden.

**C-09 · Arreglar lo que rompió C-08**
El reporte 004 predice un desajuste de nombre de columna. Sea lo que sea: se corrige, se escribe la prueba que lo habría detectado, y se anota en la bitácora.
*Aceptación:* C-08 pasa dos veces seguidas, con datos distintos.

---

### HITO 2 — El día completo del cajero · C-10 a C-15

**C-10 · Pantalla de corte de caja**
`cerrarCaja` sólo se invoca por API. Falta la pantalla: arqueo, conteo, diferencia, resumen del turno.
*Aceptación:* se cierra una caja desde la UI y el saldo esperado cuadra con `apertura + entradas − salidas`.

**C-11 · Pago mixto en la interfaz**
`repartirPagos` acepta cinco renglones; el diálogo manda uno.
*Aceptación:* un cobro con efectivo + tarjeta genera **dos filas** en `pagos` y las sumas cuadran al centavo.

**C-12 · El impuesto sale de la configuración**
Hoy está fijo en 1600 puntos base.
*Aceptación:* cambiar el IVA en `/configuracion` cambia el total de la siguiente cotización.

**C-13 · Endurecer autenticación y comandos**
Rate limit por IP en `/api/auth/entrar` (gate PRS §09) y extender la validación de `Origin` de Codex —hoy sólo en rutas de gestión— a **todas** las rutas de comando.
*Aceptación:* 20 intentos seguidos de PIN desde la misma IP quedan bloqueados; una petición sin `Origin` propio se rechaza.

**C-14 · Ejecutar `resetearDemo` de verdad**
Sustituir el atrezzo SQL por datos sembrados con el comando real, en las tres organizaciones.
*Aceptación:* después de correrlo, `auditoria` tiene la fila del reseteo, y las órdenes de atrezzo con folio 1 y 2 ya no están.

**C-15 · El selector de paquete deja de ser humo**
Cada comando declara los paquetes que **realmente** le tocan (recetas y modificadores: cafetería y restaurante; mesas: restaurante; mayoreo: ferretería y tienda…). La navegación se arma desde el paquete activo.
*Aceptación:* con paquete `tienda`, un comando de recetas devuelve **403 PAQUETE_NO_INCLUYE**, y la prueba lo verifica con un comando **real**, no con uno de juguete definido dentro del test.

---

### HITO 3 — En línea, en el dominio de Miguel · C-16 a C-20

**C-16 · Proyecto en Vercel**
**Uno solo**, llamado `morphiqpos`, conectado a `M1gu3hb/MorphiqPOS`, rama `main`. Variables de entorno de producción: `DATABASE_URL` con el **Session pooler** de Supabase (obligatorio en serverless), `SESSION_SECRET`, `PIN_PEPPER`, `APP_URL`, `STORAGE_*`. Deployment Protection en previews.
*Aceptación:* el build pasa en Vercel y la URL de `.vercel.app` abre `/entrar`.

**C-17 · Dominio `pos-mh-astral-systems.com`**
Agregarlo en Vercel y **anotar en el reporte los registros DNS exactos** que Vercel pide.
> ⚠️ **Este paso lo termina Miguel:** los registros hay que ponerlos en el registrador donde compró el dominio. El agente no tiene acceso ahí. Deja las instrucciones escritas y sigue.
*Aceptación:* el dominio aparece en Vercel esperando DNS, y el reporte trae los registros copiables.

**C-18 · Migraciones y humo en producción**
Documentar cómo se aplican migraciones al desplegar (por ahora: manual antes del deploy, escrito en un runbook). Correr el smoke test contra la URL de producción: entrar, vender, cerrar caja.
*Aceptación:* una venta hecha **desde la URL pública** aparece en `auditoria`.

**C-19 · E2E de la venta con Playwright**
Playwright está instalado y no hay una sola spec de negocio. Escribir `DIA-01`: enrolar → entrar → abrir caja → tres ventas con métodos distintos → cerrar caja cuadrando.
*Aceptación:* `pnpm test:e2e` en verde contra un entorno con base real.

**C-20 · Cierre de F1.1**
Gate `morphiq-prs` completo. Acta de sign-off honesta —sin declarar nada que no se haya ejecutado. Bitácora, `DECISIONES.md`, cuadro de estado. Reporte 006 de una página.
*Aceptación:* cero BLOCKERS, y el acta dice qué se ejecutó de verdad y qué no.

---

## 5. Lo que NO entra hoy, y hay que decirlo

- **Todo F1.2 (restaurante):** mesas, zonas, mesero, comandas, cocina/KDS, estaciones, propinas, precuenta, división de cuenta. Cero líneas hoy. ~20 tareas.
- **Consumo por receta al vender.** `planearConsumo` sólo procesa `sku`. Las recetas se costean pero no descuentan. Imprescindible para restaurante, va con F1.2.
- **Devoluciones y reimpresión** (A-11, A-13).
- **Escáner de código de barras** (A-13).
- **F1.3 completo:** compras, proveedores, gastos, fiado, conteos, mermas, importación CSV.
- **Portal QR y panel del dueño** (F1.4).

---

## 6. Reglas para esta sesión

**Suspendido:** `TEAM.md` completo, y los rangos de migraciones por carril. Un solo desarrollador, dueño de todo.

**Sigue vigente y no se negocia:**
- Precios y totales siempre en el servidor. El endpoint no acepta importes del cliente.
- Cobro, caja y stock transaccionales e idempotentes.
- El PIN nunca sale de la base. Ninguna respuesta lo contiene.
- Autorización en el servidor. Ocultar un botón no es autorización.
- Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
- Dinero en `bigint` de centavos. Cero `any`, cero `@ts-ignore`, cero `catch` vacío.
- Ningún archivo sobre 300 líneas.
- `historico/` se lee como especificación. No se copia un archivo.
- Si dices que corriste mutaciones, **el arnés se commitea y se engancha a `verify`.**
- **No se toca `Pasteleria Confetti`** (`ivqcxdpqxwjxfohiswqb`).

**Nuevo, y nace de esta auditoría:**
> **Nada se declara terminado sin haberlo ejecutado.** Ni una pantalla "cableada" que no se abrió, ni una consulta que nunca corrió, ni un comando que nunca se invocó. Si no se ejecutó, va en "Lo que NO hice".

Tres sesiones se declararon terminadas sin que una sola consulta tocara Postgres. Eso se acaba hoy.
