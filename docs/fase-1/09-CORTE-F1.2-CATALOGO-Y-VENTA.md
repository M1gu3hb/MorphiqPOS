# F1.2 — Catálogo y venta

**Objetivo:** el corte donde **una tienda opera un día completo**. Catálogo unificado con los cuatro tipos de venta, orden genérica, cobro atómico, caja, ticket y escáner.

**Esfuerzo estimado:** 15–20 jornadas · **Precondición:** F1.1 firmado.

> Es el corte más importante de la Fase 1: aquí se cierra el defecto que **ambos** sistemas comparten (cobro sin transacción, precios del cliente) y se estrena el modelo `ordenes` que hace posible todo lo demás.

---

## Fuera de alcance

Recetas, compras, proveedores, conteos, mesas, comandas, cocina, portal QR, fiado, devoluciones. El descuento de stock existe, pero sólo por SKU (`estrategia_consumo = 'sku'`); el consumo por receta llega en F1.3.

---

## Tareas

### F1.2-T01 · Levantar el dominio de catálogo y venta
Los archivos sin acoplamiento de la Fuente A → `packages/domain`, con pruebas escritas **antes** de tocar la lógica (`02-ESTRATEGIA` §4, operación 3):

| Origen | Destino |
|---|---|
| `tipoVentaUtils.js` (9.9 KB) | `domain/catalogo/tipoVenta.ts` |
| `unidadesMedida.js` + `unitConversions.js` | `domain/catalogo/unidades.ts` |
| `ventaTotales.js` | `domain/venta/totales.ts` |
| `tipsUtils.js` | `domain/venta/propinas.ts` |
| `financialUtils.js` | `domain/finanzas/margenes.ts` |
| `productoMatcher.js` | `domain/catalogo/matchers.ts` |

**Aceptación:** cada módulo en `.ts` sin `any`, con pruebas que capturan el comportamiento original. Lo que se corrigió respecto al original queda anotado en `BITACORA.md`.

### F1.2-T02 · Máquinas de estado
`domain/estados/`: orden, pago, sesión de caja. Transiciones explícitas con permiso y evento. **No existe el update libre de `estado`** (R14).

**Aceptación:** una transición no declarada lanza `TRANSICION_INVALIDA`. Se prueba cada arista válida y una muestra de las inválidas.

### F1.2-T03 · Migraciones de catálogo y venta
`categorias` · `productos` · `modificadores` · `modificador_opciones` · `producto_modificadores` · `combos` · `combo_productos` · `historial_precios` · `ordenes` · `orden_lineas` · `orden_linea_modificadores` · `orden_linea_exclusiones` · `orden_ajustes` · `pagos` · `sesiones_caja` · `movimientos_caja` · `almacenes` · `movimientos_stock` · `existencias` · `clientes`.

Según `03-MODELO-DE-DATOS-UNIFICADO`. Incluye el trigger de `historial_precios` (portado de tiendita) y el índice parcial de `codigo_barras`.

**Aceptación:** `unique (organizacion_id, idempotency_key)` en `ordenes` y `pagos`. `unique (terminal_id) where estado='abierta'` en `sesiones_caja`.

### F1.2-T04 · Catálogo: los cuatro tipos de venta
Comandos `crearProducto`, `actualizarProducto`, `actualizarPrecio`, `asignarCodigoBarras`, `archivarProducto`.
Soporta `precio_fijo` (B), `variable_medida` (A), `porcion_contenedor` (A) y `servicio` (nuevo, sin stock).

**Aceptación:** `CAT-01` producto fijo → precio e impuesto calculados por el servidor · `CAT-02` producto por medida y por porción → conversión y precio exactos con el redondeo definido. **Es comportamiento a conservar de la Fuente A** y se prueba como tal.

### F1.2-T05 · Modificadores normalizados
Grupos reutilizables entre productos, con opciones que pueden tener precio extra (mejora sobre la Fuente A, donde eran sólo informativos).

**Aceptación:** `CAT-03` el snapshot de la línea preserva la selección y su versión. Un grupo obligatorio sin selección bloquea la confirmación.

### F1.2-T06 · La orden como carrito — corrige **P1-10**
`crearOrden` (estado `borrador`), `agregarLinea`, `quitarLinea`, `cambiarCantidad`. **El carrito es la orden en borrador**, no una tabla aparte. Elimina la clase de defecto donde el carrito se cierra al final y un fallo intermedio hace que el cajero reintente y duplique.

**Aceptación:** cerrar la pestaña y volver a abrir recupera la orden en borrador. Dos terminales no pueden operar la misma orden borrador simultáneamente (control de versión).

### F1.2-T07 · Cotización en servidor — corrige **P0-07**
`cotizarOrden` recalcula todo con `packages/domain`: precio vigente del catálogo, mayoreo por volumen, modificadores con precio, descuentos autorizados, impuestos, totales, costo y margen.

**Aceptación:** `SALE-04` el cliente manda un precio alterado → el servidor lo ignora y devuelve el correcto. **El endpoint no acepta ningún importe del cliente**; sólo producto, cantidad y unidad.

### F1.2-T08 · Sesión de caja
`abrirSesionCaja`, `registrarMovimientoCaja`, `cerrarSesionCaja` con arqueo y diferencia auditada.
Los totales **se derivan** de `pagos` y `movimientos_caja` (no se guardan duplicados, corrigiendo P2-10 de tiendita).

**Aceptación:** `CASH-01` una sesión abierta por terminal · `CASH-02` **concurrencia real**: dos aperturas simultáneas → una gana, la otra recibe conflicto · `CASH-04` saldo esperado = apertura + entradas − salidas, con diferencia auditada.

### F1.2-T09 · Cobro atómico — corrige **P0-03**
`cobrarOrden`: **una sola transacción** que escribe orden + líneas + pagos + movimiento de caja + movimientos de stock + existencias + folio + auditoría + evento a outbox.
Pago mixto = varias filas en `pagos` (corrige P1-11).

**Aceptación:**
- `SALE-01` venta válida → todo confirma junto.
- `SALE-02` **inyección de fallo** en el paso de stock → no queda orden pagada, ni movimiento, ni folio consumido.
- `SALE-03` el mismo comando reintentado tres veces → un pago, una orden, un conjunto de movimientos.
- `CASH-03` pago mixto con propina: sumas por método, cambio y propina cuadran exactamente.
- **Verificación obligatoria:** quitar la transacción hace fallar `SALE-02`. Si no falla, la prueba no prueba nada.

### F1.2-T10 · Ledger de stock por SKU — corrige **P1-03**
`movimientos_stock` inmutable + proyección `existencias` con **decremento atómico**:
```sql
UPDATE existencias SET cantidad = cantidad - $1
WHERE almacen_id = $2 AND insumo_id = $3
  AND (cantidad >= $1 OR $4 /* permite_venta_sin_stock */)
```
**Falla en vez de silenciar.** Se elimina el `Math.max(0, …)` de tiendita.

**Aceptación:** `INV-03` **concurrencia real**: dos ventas simultáneas del mismo SKU → sin pérdida de actualizaciones, sin violar la política de stock negativo · `SALE-05` venta sin stock con política que lo prohíbe → rechazo **antes** de confirmar.

### F1.2-T11 · Cancelación y ajuste de cuenta
`cancelarOrden` con motivo, permiso y reversión de movimientos. `ajustarOrden` → `orden_ajustes` normalizada (deja de ser el string JSON de la Fuente A).

**Aceptación:** cancelar revierte stock y caja en una transacción. Cada ajuste queda auditado con quién, cuándo, motivo y el antes/después.

### F1.2-T12 · Escáner de código de barras — **conservar de la Fuente B**
Las tres vías portadas: cámara (ZXing), físico keyboard-wedge, y remoto por teléfono con Realtime.
Se conserva el dedupe de 1,200 ms, la retroalimentación de audio con desbloqueo explícito, y el flujo "código no encontrado" → crear producto o asignar código a uno existente.
**Se corrige P1-15:** la idempotencia del escáner remoto pasa de un `Set` en memoria a la columna `procesado_en` con `unique`.

**Aceptación:** el escáner remoto agrega al carrito **pasando por la validación de stock** (en tiendita se la saltaba). Recargar la pestaña con eventos ya aplicados no los reaplica.

### F1.2-T13 · Báscula y venta por peso — **conservar de la Fuente B**
`src/lib/hardware/bascula.ts` portado, con captura manual de respaldo.

**Aceptación:** un producto por peso se cobra con la cantidad de la báscula y el precio por kg vigente del servidor.

### F1.2-T14 · Pantalla de venta
Ruta `(operacion)/venta`, cliente puro, densidad compacta en escritorio y cómoda en tablet.
**Se reimplementa**, no se porta: ni `venta/page.jsx` (62 KB) ni `POS.jsx` (27 KB) entran como archivo. Se leen como especificación. La página orquesta componentes y comandos; **ningún archivo supera 300 líneas**.

Componentes portados de ambas fuentes: buscador, tabs de categoría, carrito, diálogo de cobro, mini-carrito del escáner, barra móvil, ticket.

**Aceptación:** un cajero completa una venta con teclado, sin tocar el ratón. Foco visible, objetivos táctiles ≥44 px efectivos.

### F1.2-T15 · Ticket e impresión
Ticket de venta y corte en PDF. **Sin `document.write`** (SEC-XSS): render por componente seguro.
Formato según decisión pendiente **A-31** — hasta que Miguel la resuelva, se implementa carta con `@media print` y se deja la ruta abierta a 80 mm.

**Aceptación:** `PRINT-01` identidad, líneas, totales, métodos y propina correctos · `SEC-01` un nombre de negocio o producto con HTML se imprime como texto, no ejecuta script.

### F1.2-T16 · Vista cliente — **conservar de la Fuente B**
Segundo monitor con el carrito espejeado. Se conserva la función, pero **se corrige el mecanismo**: en tiendita era `localStorage` + `BroadcastChannel` con polling de 300 ms. Pasa a Realtime sobre la orden, con revalidación por API.

**Aceptación:** la vista cliente refleja el carrito en menos de un segundo y no expone datos de otras órdenes.

### F1.2-T17 · Registros de venta
`(gestion)/registros` con historial, filtros por periodo, exportación CSV y PDF. Reimplementado desde `Registros.jsx` (A, 23 KB) y `registros/page.jsx` (B, 38 KB).

**Aceptación:** los totales del periodo **cuadran con el ledger**, verificado con una prueba de reconciliación sobre 200 ventas sintéticas.

---

## Pruebas obligatorias del corte

| ID | Escenario | Tipo | Cierra |
|---|---|---|---|
| `SALE-01` | Venta de mostrador válida | Integración DB | P0-03 |
| `SALE-02` | Falla el stock a media transacción → nada parcial | Inyección de fallos | P0-03 |
| `SALE-03` | Cobro reintentado 3 veces → un solo resultado | Integración | P0-03 |
| `SALE-04` | Cliente altera el precio → servidor recalcula | Seguridad | P0-07 |
| `SALE-05` | Venta sin stock con política que lo prohíbe → rechazo | Dominio | conservar |
| `CASH-01` | Una sesión de caja abierta por terminal | Integración | — |
| `CASH-02` | Dos aperturas concurrentes → una gana | Concurrencia | — |
| `CASH-03` | Pago mixto con propina cuadra exactamente | Dominio + integración | P1-11 |
| `CASH-04` | Cierre: esperado = apertura + entradas − salidas | Integración | — |
| `INV-03` | Dos ventas concurrentes del mismo SKU | Concurrencia | P1-03 |
| `CAT-01` | Producto fijo: precio e impuesto del servidor | Dominio | conservar |
| `CAT-02` | Producto por medida y por porción: conversión exacta | Dominio | conservar |
| `CAT-03` | Modificadores: snapshot con versión | Dominio + integración | conservar |
| `FOLIO-02` | 100 cobros concurrentes → folios sin colisión | Concurrencia | P1-09 |
| `SCAN-01` | Escáner remoto valida stock y no duplica al recargar | Integración | P1-15 |
| `PRINT-01` | Ticket correcto | Snapshot visual | conservar |
| `SEC-01` | HTML en nombre de negocio se imprime como texto | Seguridad | SEC-XSS |
| `REC-01` | Totales del periodo cuadran con el ledger, 200 ventas | Reconciliación | — |
| `OFF-01` | Pérdida de red durante el cobro → reintento no duplica | E2E + fallo | — |

---

## Gate `morphiq-prs` de este corte

Superficies nuevas: **S10** (maneja dinero) y **S15** (sistema del que el cliente depende a diario) — ambas elevan el rigor.

| Sección | Check | Severidad |
|---|---|---|
| 17 | **Monto, moneda, descuentos, impuestos y productos recalculados en servidor** | BLOCKER |
| 17 | Creación y cobro con idempotencia o deduplicación | CRITICAL |
| 17 | Stock y reservas con concurrencia y transacciones; doble clic no duplica | CRITICAL |
| 17 | Estados de orden definidos con transiciones válidas | CRITICAL |
| 17 | Cancelaciones requieren permiso y audit log | CRITICAL |
| 12 | Transacciones para operaciones multi-tabla atómicas | CRITICAL |
| 12 | Constraints reales: NOT NULL, UNIQUE, FK, CHECK | BLOCKER |
| 12A | Cero consultas N+1 en listados con relaciones | BLOCKER |
| 12A | Paginación real en toda colección grande | BLOCKER |
| 12A | Índices verificados con EXPLAIN en las queries de más tráfico | CRITICAL |
| 12A | Cero `SELECT *` en producción | CRITICAL |
| 19 | Errores en transacciones críticas hacen rollback | CRITICAL |
| 19 | Alertas de invariantes: orden pagada sin líneas, saldo de caja distinto de sus movimientos | CRITICAL |
| 22 | Doble clic, refresh, back/forward, reintento, sesión expirada | BLOCKER |
| 22 | Timeout, offline y red inestable probados | CRITICAL |
| 05 | Sin polling agresivo ni requests duplicados por render | CRITICAL |
| 06 | Navegación completa por teclado en venta y cobro | BLOCKER |

---

## Definición de terminado

- [ ] **Una tienda opera un día completo**: abrir caja → vender con escáner y sin él → cobrar en efectivo, tarjeta y mixto → imprimir ticket → cerrar caja con arqueo.
- [ ] P0-03, P0-07, P1-03, P1-09, P1-10, P1-11 y P1-15 cerrados **con verificación** (la prueba falla al quitar la corrección).
- [ ] Las 19 pruebas del corte pasan, incluidas las de concurrencia **ejecutadas realmente en paralelo** y las de fallo **interrumpiendo pasos internos**.
- [ ] Reconciliación de 200 ventas sintéticas: los reportes cuadran con el ledger, al centavo.
- [ ] Ningún archivo supera 300 líneas.
- [ ] Cero BLOCKERS de `morphiq-prs`.
- [ ] Miguel vende en su máquina y cierra caja sin ayuda.
