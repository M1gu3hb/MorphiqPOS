# F1.1 — POS que vende

**Objetivo:** al terminar este corte, MorphiqPOS **es un punto de venta**. Se abre, se opera, se cobra, se cierra caja y se enseña a un cliente. Desplegado en Vercel, sobre Supabase.

**Esfuerzo estimado:** 18–24 jornadas · **Precondición:** F1.0 (hecha).

> **La prueba que define el corte:** Miguel abre el sistema en su laptop, vende diez cosas distintas, cobra en efectivo, tarjeta y mixto, imprime tickets, cierra caja con arqueo, y los números cuadran. Si eso no pasa, el corte no terminó.

---

## Fuera de alcance

Mesas, mesero, cocina, comandas, propinas → **F1.2**.
Recetas, compras, proveedores, gastos, fiado, devoluciones, conteos, mermas → **F1.3**.
Portal QR, panel móvil del dueño → **F1.4**.
Permisos configurables, registry con grafo, auditoría exhaustiva, multi-sucursal → **F1.5**.

**El descuento de inventario existe, pero sólo por SKU.** Recetas llegan en F1.3.

---

## Tareas

### F1.1-T00 · Correcciones de arranque

Antes de agregar nada:

- Instalar **Kysely** (el ADR 0001 lo eligió y nunca se instaló) + `pg`.
- Arreglar la guarda de `scripts/db.mjs:131`, que ya no dispara.
- Corregir el acta `docs/auditorias/F1.0-sign-off.md`: declara pruebas "contra Postgres real" que no ejecutan SQL.
- Borrar `apps/web/src/consultas/claves.ts` si no se va a usar en este corte, o darle consumidores reales.
- Alinear el compose a **Postgres 17** (Supabase corre 17.6).
- Eliminar los `.gitkeep` de `packages/registry`, `capabilities/`, `apps/worker`, `infra/ci` — o darles contenido. Carpetas vacías versionadas son ruido.

**Aceptación:** `pnpm verify` verde y cero andamiaje muerto.

### F1.1-T01 · Conectar Supabase y montar `packages/data`

Proyecto `wyqmzhliurwyxuyxznpb`. Pool de conexiones con `pg`, envoltorio Kysely tipado, helper `conTransaccion(fn)`. Todo el paquete con `import 'server-only'`.
Runner de migraciones propio en `packages/data/migraciones/` con numeración `NNN_snake_case.sql`.

**Aceptación:** `pnpm db:migrate` aplica migraciones contra Supabase y contra el Postgres del compose, sin cambiar código. Sólo cambia `DATABASE_URL`.

### F1.1-T02 · Esquema mínimo

Migraciones según `03-MODELO-DE-DATOS-UNIFICADO`, **sólo estas tablas**:

`organizaciones` (con columna `paquete`) · `sucursales` · `terminales` · `personas` · `identidades` · `credenciales_pin` · `empleos` · `configuracion` · `folios` · `auditoria` · `categorias` · `productos` · `modificadores` · `modificador_opciones` · `producto_modificadores` · `ordenes` · `orden_lineas` · `orden_linea_modificadores` · `pagos` · `sesiones_caja` · `movimientos_caja` · `almacenes` · `insumos` · `movimientos_stock` · `existencias` · `clientes`

Con: `organizacion_id` en toda tabla operativa e índices compuestos con esa columna primero · dinero en `bigint` de centavos · `unique (organizacion_id, idempotency_key)` en `ordenes` y `pagos` · `unique (terminal_id) where estado='abierta'` en `sesiones_caja` · `check` en vez de tipos `enum`.

**Aceptación:** la restricción de caja abierta rechaza la segunda apertura desde la base, no desde el código.

### F1.1-T03 · Tipos generados del esquema

Generar los tipos de `packages/contracts` desde la base ya migrada. **No escritos a mano.**

**Aceptación:** si una migración no se aplicó, el tipo no existe y el build falla.

### F1.1-T04 · Envoltorio `comando()`

El molde de `04-ARQUITECTURA §3`. Resuelve una vez: validación zod, comprobación de rol, comprobación de paquete, transacción, clave de idempotencia, auditoría de acciones sensibles, correlation id, errores tipados.

**Aceptación:** un comando de juguete trae las siete cosas sin escribir línea extra. **Mutación:** si el cuerpo lanza a mitad, no queda nada persistido — se verifica con inyección de fallos.

### F1.1-T05 · Identidad: terminal + PIN

Enrolamiento de terminal con código de un solo uso y expiración. PIN con **Argon2id + pimienta**, verificado en servidor, con límite de intentos y bloqueo progresivo. Sesión en cookie `HttpOnly` `Secure` `SameSite=Lax`.

**Aceptación:** ninguna respuesta de ningún endpoint contiene el hash ni el PIN — verificado con una prueba que recorre todos los endpoints. Manipular la cookie no otorga privilegios.

### F1.1-T06 · Acceso del dueño por correo

Supabase Auth para el correo del dueño. Sesión distinta de la de terminal.

**Aceptación:** el dueño entra desde un dispositivo no enrolado y ve gestión, pero no puede operar caja sin terminal enrolada.

### F1.1-T07 · Configuración y **selector de paquete**

Configuración por organización: identidad, contacto, moneda, impuestos, mensaje de ticket, apariencia.

**Y el selector de paquete** — lo que Miguel pidió explícitamente:

```
Configuración → Tipo de negocio
   ○ Tienda        catálogo · venta · caja · inventario
   ○ Ferretería    + unidades de medida · mayoreo
   ○ Farmacia      + lotes y caducidad        (F1.3)
   ○ Cafetería     + modificadores
   ○ Restaurante   + mesas · mesero · cocina  (F1.2)
```

Cambiar el paquete cambia navegación, pantallas disponibles y comandos permitidos. **Verificado en el servidor**, no ocultando botones.

**Aceptación:** con paquete `tienda`, los comandos de restaurante devuelven `403 PAQUETE_NO_INCLUYE`. Con `restaurante`, aparecen las rutas correspondientes. El histórico sigue siendo legible al cambiar de paquete.

### F1.1-T08 · Catálogo

`categorias` y `productos` con los cuatro tipos de venta: `precio_fijo`, `variable_medida`, `porcion_contenedor`, `servicio`. Código de barras con índice parcial. Mayoreo por volumen. Modificadores normalizados con precio extra opcional.
**Levantar de `historico/restaurante/src/utils/`:** `tipoVentaUtils.js`, `unidadesMedida.js`, `unitConversions.js` → `packages/domain/catalogo/`.

**Aceptación:** un producto por peso y uno por porción calculan precio exacto con el redondeo definido. Pruebas escritas antes de tocar la lógica levantada.

### F1.1-T09 · Pantalla de productos

`(gestion)/productos` — alta, edición, búsqueda difusa, categorías, imagen, código de barras, precios.

**Aceptación:** se da de alta un catálogo de 50 productos desde la UI, sin tocar la base.

### F1.1-T10 · La orden como carrito

`crearOrden` en estado `borrador`, `agregarLinea`, `quitarLinea`, `cambiarCantidad`. **El carrito es la orden en borrador**, no una tabla aparte.

**Aceptación:** cerrar la pestaña y volver recupera el carrito. Dos terminales no operan la misma orden borrador (control de versión).

### F1.1-T11 · Cotización en el servidor

`cotizarOrden` recalcula todo con `packages/domain`: precio vigente, mayoreo, modificadores, descuentos, impuestos, totales, costo, margen.
**Levantar:** `ventaTotales.js` y `financialUtils.js`.

**Aceptación:** el endpoint **no acepta ningún importe del cliente**, sólo producto, cantidad y unidad. Si el cliente manda un total, se ignora.

### F1.1-T12 · Sesión de caja

`abrirSesionCaja`, `registrarMovimientoCaja`, `cerrarSesionCaja` con arqueo y diferencia. Los totales **se derivan** de `pagos` y `movimientos_caja`, no se guardan duplicados.

**Aceptación:** dos aperturas concurrentes → una gana, la otra recibe conflicto. Saldo esperado = apertura + entradas − salidas.

### F1.1-T13 · Cobro atómico — **la tarea más importante del corte**

`cobrarOrden`: **una sola transacción** que escribe orden + líneas + pagos + movimiento de caja + movimientos de stock + existencias + folio + auditoría. Pago mixto = varias filas en `pagos`. Clave de idempotencia obligatoria.

**Aceptación:**

- Venta válida → todo confirma junto.
- **Inyección de fallo** en el paso de stock → no queda orden pagada, ni movimiento, ni folio consumido.
- El mismo comando reintentado tres veces → un solo resultado.
- **Verificación por mutación:** quitar la transacción hace fallar la prueba de fallo. Si no falla, la prueba no vale.

### F1.1-T14 · Ledger de stock

`movimientos_stock` inmutable + proyección `existencias` con decremento atómico:

```sql
UPDATE existencias SET cantidad = cantidad - $1
WHERE almacen_id = $2 AND insumo_id = $3
  AND (cantidad >= $1 OR $4)
```

**Falla en vez de silenciar.** Nada de `Math.max(0, …)`.

**Aceptación:** dos ventas concurrentes del mismo SKU con stock justo → una vende, la otra recibe stock insuficiente. **Nunca stock negativo** donde la política lo prohíbe.

### F1.1-T15 · La pantalla de venta

`(operacion)/venta`, cliente puro, densidad compacta en escritorio y cómoda en tablet.
Catálogo con categorías, búsqueda, carrito, cantidades, diálogo de cobro con efectivo/tarjeta/transferencia/mixto, cambio, ticket.

**Se reimplementa.** `historico/restaurante/src/pages/POS.jsx` y `historico/tiendita/app/(dashboard)/venta/page.jsx` se leen como especificación; **no se copia ningún archivo**. Ninguno supera 300 líneas.

**Aceptación:** un cajero completa una venta **con teclado, sin tocar el ratón**. Foco visible. Objetivos táctiles ≥44 px efectivos.

### F1.1-T16 · Ticket

Ticket de venta y corte, en carta con `@media print`. **Sin `document.write`** — render por componente seguro.

**Aceptación:** un nombre de negocio o producto con HTML se imprime como texto, no ejecuta script.

### F1.1-T17 · Escáner de código de barras

Cámara con ZXing y escáner físico keyboard-wedge. Dedupe de 1,200 ms, retroalimentación de audio con desbloqueo explícito, flujo "código no encontrado" → crear producto o asignar código.
**Referencia:** `historico/tiendita/src/components/barcode/` y `src/lib/productLookup.ts`.

> El escáner remoto por teléfono (Realtime) se difiere a F1.3: requiere el canal de tiempo real y no bloquea vender.

**Aceptación:** escanear agrega al carrito **pasando por la validación de stock**.

### F1.1-T18 · Inicio

`(gestion)/inicio` — venta del día, caja abierta, últimas ventas, productos bajo mínimo. Con las gráficas tokenizadas.

**Aceptación:** los números cuadran con el ledger.

### F1.1-T19 · Despliegue en Vercel

**Un solo proyecto**, conectado al repositorio. Variables separadas por entorno. Dominio de Vercel por ahora. Deployment Protection en previews.

**Aceptación:** Miguel abre la URL desde su teléfono y ve el sistema. CI verde antes del despliegue.

### F1.1-T20 · Semillas de demostración

Tres tenants con datos **creíbles**: abarrotes, ferretería y cafetería. Nombres, precios y categorías reales. Historial de dos semanas. Comando `resetearDemo`.

**Aceptación:** cero "Producto 1, $100". Miguel abre "Ferretería La Central" y ve un negocio que parece real. Es requisito del guion de demostración y del gate PRS §03.

---

## Pruebas obligatorias del corte

| ID         | Escenario                                                       | Tipo                  |
| ---------- | --------------------------------------------------------------- | --------------------- |
| `AUTH-01`  | Credencial válida → sesión sin secretos                         | Integración + E2E     |
| `AUTH-02`  | Credencial inválida repetida → rechazo, rate limit, auditoría   | Integración           |
| `AUTH-05`  | Ningún endpoint devuelve el hash del PIN                        | Seguridad, generada   |
| `TEN-01`   | Organización A no ve nada de B, en todo comando y consulta      | Integración, generada |
| `PAQ-01`   | Comando fuera del paquete → 403 antes del caso de uso           | Integración           |
| `CAT-01`   | Producto fijo: precio e impuesto del servidor                   | Dominio               |
| `CAT-02`   | Producto por medida y por porción: conversión exacta            | Dominio               |
| `SALE-01`  | Venta válida → todo confirma junto                              | Integración DB        |
| `SALE-02`  | Falla el stock a media transacción → nada parcial               | Inyección de fallos   |
| `SALE-03`  | Cobro reintentado 3 veces → un solo resultado                   | Integración           |
| `SALE-04`  | Cliente altera el precio → servidor recalcula                   | Seguridad             |
| `SALE-05`  | Venta sin stock con política que lo prohíbe → rechazo           | Dominio               |
| `CASH-01`  | Una sesión de caja abierta por terminal                         | Integración           |
| `CASH-02`  | Dos aperturas concurrentes → una gana                           | Concurrencia          |
| `CASH-03`  | Pago mixto cuadra exactamente                                   | Dominio + integración |
| `CASH-04`  | Cierre: esperado = apertura + entradas − salidas                | Integración           |
| `INV-03`   | Dos ventas concurrentes del mismo SKU                           | Concurrencia          |
| `FOLIO-01` | 100 cobros concurrentes → folios sin colisión                   | Concurrencia          |
| `SEC-01`   | HTML en nombre de producto se imprime como texto                | Seguridad             |
| `REC-01`   | Totales del periodo cuadran con el ledger, 200 ventas           | Reconciliación        |
| `POS-01`   | **Venta completa sólo con teclado**                             | E2E                   |
| `DIA-01`   | **Un día completo: abrir caja → 10 ventas → cerrar con arqueo** | E2E                   |

`DIA-01` es la prueba que cierra el corte.

---

## Gate `morphiq-prs`

Superficies: **S2** login · **S3** panel · **S4** formularios · **S5** backend · **S7** Supabase · **S8** Vercel · **S10** dinero · **S11** datos personales · **S14** DB · **S15** sistema crítico diario.

| Sección | Check                                                                       | Sev.     |
| ------- | --------------------------------------------------------------------------- | -------- |
| 01      | Autorización server-side en todo dato sensible                              | BLOCKER  |
| 01      | Cero secretos en frontend, repo o logs                                      | BLOCKER  |
| 03      | **Cero placeholders ni datos inventados en las semillas**                   | BLOCKER  |
| 09      | Validación server-side de todo input; rate limits en login                  | BLOCKER  |
| 10      | Autorización por recurso; cero credenciales en storage del navegador        | BLOCKER  |
| 10      | Argon2id con salt y parámetros actuales                                     | CRITICAL |
| 11      | BOLA/IDOR probado: A no accede a objetos de B                               | BLOCKER  |
| 12      | Constraints reales; transacciones en operaciones multi-tabla                | BLOCKER  |
| 12A     | Cero N+1; paginación real; índices verificados con EXPLAIN; cero `SELECT *` | BLOCKER  |
| 13      | **RLS habilitado en toda tabla; prueba cruzada anon/A/B/admin**             | BLOCKER  |
| 13      | `service_role` jamás en el navegador ni en el bundle                        | BLOCKER  |
| 13      | Security Advisor sin findings críticos                                      | CRITICAL |
| 14      | Deployment Protection en previews; variables por entorno                    | CRITICAL |
| 17      | **Montos recalculados en servidor; idempotencia; stock con transacciones**  | BLOCKER  |
| 19      | Errores en transacciones críticas hacen rollback                            | CRITICAL |
| 22      | Doble clic, refresh, back/forward, sesión expirada, offline                 | BLOCKER  |
| 06      | Navegación completa por teclado en venta y cobro                            | BLOCKER  |

---

## Definición de terminado

- [ ] **`DIA-01` pasa: un día completo de operación.**
- [ ] Miguel abre el sistema, vende, cobra y cierra caja **sin ayuda**.
- [ ] El selector de paquete cambia el tipo de negocio y **se aplica en el servidor**.
- [ ] Las 22 pruebas del corte pasan, con concurrencia **realmente en paralelo** y fallos **interrumpiendo pasos internos**.
- [ ] Cada corrección crítica tiene su **"verificado con"**: se quita, la prueba falla.
- [ ] Reconciliación de 200 ventas: los reportes cuadran con el ledger, al centavo.
- [ ] `pnpm verify` verde desde clon limpio. Lint y tipos en cero.
- [ ] Ningún archivo supera 300 líneas.
- [ ] CI verde. Desplegado en Vercel y abierto desde el teléfono.
- [ ] El compose local sigue arrancando el sistema — la promesa A-27 sigue viva.
- [ ] Cero BLOCKERS de `morphiq-prs`.
- [ ] `BITACORA.md`, `DECISIONES.md` y el cuadro de estado actualizados.
