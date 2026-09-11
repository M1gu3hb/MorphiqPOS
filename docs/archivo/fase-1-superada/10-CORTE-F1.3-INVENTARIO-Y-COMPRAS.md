# F1.3 — Inventario y compras

**Objetivo:** cerrar el ciclo del dinero y de la mercancía. Al terminar este corte **el retail es vendible**: quedan demostrables tienda, ferretería y farmacia con el mismo sistema, sólo cambiando datos.

**Esfuerzo estimado:** 12–16 jornadas · **Precondición:** F1.2 firmado.

---

## Fuera de alcance

Mesas, comandas, cocina, portal QR. Múltiples almacenes con transferencias (se deja la tabla `almacenes` lista con uno por sucursal, pero sin transferencias). Lotes, caducidad y números de serie — llegan después de la Fase 1.

---

## Tareas

### F1.3-T01 · Levantar el dominio de inventario

De la Fuente A, sin acoplamiento:

| Origen                             | Destino                             |
| ---------------------------------- | ----------------------------------- |
| `inventoryUtils.js`                | `domain/inventario/consumo.ts`      |
| `inventarioValidation.js` (6.7 KB) | `domain/inventario/validacion.ts`   |
| `ingredienteMatcher.js`            | `domain/inventario/matchers.ts`     |
| `importValidators.js` (17 KB)      | `domain/importacion/validadores.ts` |
| `csvParser.js`                     | `domain/importacion/csv.ts`         |

**Aceptación:** pruebas escritas antes de tocar la lógica; lo corregido queda anotado.

### F1.3-T02 · Migraciones de inventario y compras

`insumos` · `recetas` · `compras` · `compra_lineas` · `proveedores` · `plantillas_compra` · `gastos` · `plantillas_gasto` · `conteos_inventario` · `conteo_lineas` · `movimientos_credito`.

**Aceptación:** en retail, cada producto con `estrategia_consumo='sku'` tiene su insumo espejo creado automáticamente por trigger o por el comando de alta. El cajero nunca ve el concepto "insumo" en una tienda.

### F1.3-T03 · Consumo por receta — completa el eje de divergencia

`domain/inventario/consumo.ts` resuelve las cuatro estrategias:

| `estrategia_consumo` | Qué descuenta                                           |
| -------------------- | ------------------------------------------------------- |
| `sku`                | El producto mismo (retail)                              |
| `receta`             | Los insumos de `recetas` (restaurante)                  |
| `insumo_base`        | El insumo base por la cantidad variable (peso, porción) |
| `ninguno`            | Nada (servicios)                                        |

**Aceptación:** `INV-01` una venta con receta genera movimientos exactos por insumo, con `referencia_tipo='orden'` y su origen.

### F1.3-T04 · Exclusiones "SIN" que sí descuentan — cierra **Q-10**

El "PASO B" que quedó pendiente en la Fuente A. `cobrarOrden` resta de la receta las cantidades de `orden_linea_exclusiones` antes de generar el movimiento.

**Aceptación:** `INV-02` un ingrediente marcado "SIN" **no se descuenta** del inventario, y la cocina lo ve en la comanda. Con la exclusión, el movimiento generado es menor en exactamente la cantidad base excluida × cantidad de línea.

### F1.3-T05 · Recetas y escandallos — **conservar de la Fuente A**

Comandos `crearReceta`, `actualizarReceta`, `recalcularCosto`. Pantalla `(gestion)/recetas` reimplementada desde `Recetas.jsx` (10 KB) con los componentes `RecetaFormDialog` (20 KB), `RecetaAccordionRow` e `IngredienteAutocomplete` portados.

**Aceptación:** cambiar el costo de un insumo recalcula el costo, la utilidad y el margen de todos los productos que lo usan, y queda registrado en `historial_precios`.

### F1.3-T06 · Compras y recepción — **conservar de ambas fuentes**

`recibirCompra` transaccional: compra + líneas + entrada de stock + costo unitario, todo junto.
Se conserva de la Fuente B la **conversión de unidades** (`piezas_por_caja`, `cantidad_stock_agregada`): comprar por caja, vender por pieza. Es una feature real de abarrotes.
Plantillas de compra y "repetir compra" portadas de la Fuente A.

**Aceptación:** `INV-04` compra, detalle, costo y entrada de stock confirman juntos. Si falla un paso, no queda compra registrada ni stock agregado.

### F1.3-T07 · Costeo

Costo promedio ponderado al recibir compras. El costo unitario de una línea de venta es un **snapshot** al momento del cobro.

**Aceptación:** unitarias de costo ponderado con entradas a distintos precios. La utilidad de una orden vieja no cambia si después sube el costo del insumo.

### F1.3-T08 · Ajustes, mermas y conteos — **conservar de ambas**

`ajustarStock`, `registrarMerma`, `registrarConteo` con su detalle de diferencias. Todos generan movimientos, ninguno sobrescribe saldos.
Portado de la Fuente A: `AjustarStockDialog` (20 KB), `RegistrarInventarioInicialDialog` (26 KB). De la Fuente B: `ConteoInventario`, `MermaDialog`.

**Aceptación:** un conteo con diferencia genera el movimiento de ajuste y deja el valor de la diferencia auditado. **`ajustarStock` filtra por `organizacion_id`** — corrige el defecto de tiendita donde actualizaba sólo por `id` confiando en RLS.

### F1.3-T09 · Gastos operativos — **conservar de ambas**

`registrarGasto` ligado a la sesión de caja, con categorías y plantillas recurrentes.

**Aceptación:** los gastos aparecen en el corte y afectan la utilidad neta del periodo.

### F1.3-T10 · Fiado y crédito — **conservar de la Fuente B**

`clientes` con saldo y límite, `movimientos_credito` con cargo y abono. Pago con método `fiado` que carga al cliente.
**Se corrige P1-13:** el consumo se agrupa por producto con acumulador en `domain`; dos renglones del mismo producto suman en vez de pisarse.

**Aceptación:** un cliente con límite alcanzado no puede fiar más. Dos renglones del mismo producto en una venta a crédito descuentan la suma correcta.

### F1.3-T11 · Devoluciones — **conservar de la Fuente B**

`devolverOrden` transaccional con `regresa_a_inventario` por línea, tipo de devolución (dinero o crédito) y auditoría.

**Aceptación:** una devolución revierte pago, caja y stock en una sola transacción. Devolver dos veces la misma línea es rechazado.

### F1.3-T12 · Importación y exportación — **conservar de la Fuente A**

Importación CSV de productos, insumos, categorías, recetas y clientes, con **dry-run obligatorio** y reporte de validación antes de aplicar. Plantillas descargables.
Portado de `ImportarDatosDialog` (20 KB), `ExportarDatos`, `PlantillasDescargables`, y los validadores ya levantados en T01.

**Aceptación:** una importación con errores muestra el reporte y **no aplica nada**. Una importación válida es idempotente: correrla dos veces no duplica.

### F1.3-T13 · Alertas de stock y reposición

Stock mínimo y máximo, alertas de quiebre, sugerencia de reposición. Portado de `StockMinCritInput` (A) y `getProductosStockBajo` (B).

**Aceptación:** el dashboard muestra los productos bajo mínimo, ordenados por urgencia.

### F1.3-T14 · Pantallas de inventario y compras

`(gestion)/inventario`, `(gestion)/compras`, `(gestion)/proveedores`, `(gestion)/clientes`, `(gestion)/fiado`.
Reimplementadas desde `Inventario.jsx` (A, 17 KB), `inventario/page.jsx` (B, 17 KB), `Compras.jsx` (A), `egresos/page.jsx` (B) y `fiado/page.tsx` (B).

**Aceptación:** ningún archivo supera 300 líneas. Kardex con paginación real y sin consultas N+1.

### F1.3-T15 · Reconciliador de invariantes

Job en `apps/worker` que corre y alerta si:

- la proyección `existencias` difiere de la suma del ledger,
- existe una orden pagada sin líneas,
- el saldo de una sesión de caja no coincide con sus movimientos,
- hay stock negativo donde la política lo prohíbe.

**Aceptación:** se introduce cada inconsistencia a propósito en una base de prueba y el reconciliador la detecta.

### F1.3-T16 · Tenants de demostración: retail

Semillas realistas para **tienda de abarrotes, ferretería y farmacia**: productos con nombre y precio creíbles, categorías, códigos de barras, stock, proveedores, historial de ventas de dos semanas.
Comando `resetearDemo` que devuelve el tenant a su estado inicial.

**Aceptación:** Miguel abre el sistema, elige "Ferretería La Central" y ve un negocio que parece real. Cero "Producto 1, $100". Es requisito del guion de demostración.

---

## Pruebas obligatorias del corte

| ID         | Escenario                                                 | Tipo                  | Cierra    |
| ---------- | --------------------------------------------------------- | --------------------- | --------- |
| `INV-01`   | Venta con receta → movimientos exactos por insumo         | Dominio + integración | conservar |
| `INV-02`   | Ingrediente "SIN" no se descuenta y la cocina lo ve       | Integración + E2E     | Q-10      |
| `INV-03`   | Dos ventas concurrentes del mismo insumo                  | Concurrencia          | P1-03     |
| `INV-04`   | Recepción de compra: todo confirma junto                  | Integración           | —         |
| `INV-05`   | Conteo con diferencia → ajuste auditado                   | Integración           | —         |
| `INV-06`   | `ajustarStock` con ID de otra organización → rechazado    | Seguridad             | defecto B |
| `INV-07`   | Costo promedio ponderado con entradas a distinto precio   | Unitaria              | —         |
| `INV-08`   | El costo snapshot de una orden vieja no cambia            | Integración           | —         |
| `CRED-01`  | Cliente con límite alcanzado no puede fiar                | Dominio               | —         |
| `CRED-02`  | Dos renglones del mismo producto suman, no se pisan       | Unitaria              | P1-13     |
| `DEV-01`   | Devolución revierte pago, caja y stock en una transacción | Integración           | —         |
| `DEV-02`   | Devolver dos veces la misma línea → rechazado             | Integración           | —         |
| `IMP-01`   | Importación con errores → reporte y cero cambios          | Integración           | —         |
| `IMP-02`   | Importación válida es idempotente                         | Integración           | —         |
| `RECON-01` | El reconciliador detecta cada inconsistencia introducida  | Operación             | —         |
| `DEMO-01`  | Los tres tenants de retail se siembran y resetean         | E2E                   | —         |

---

## Gate `morphiq-prs` de este corte

| Sección | Check                                                                                | Severidad   |
| ------- | ------------------------------------------------------------------------------------ | ----------- |
| 12      | Transacciones en compra, devolución, ajuste y conteo                                 | CRITICAL    |
| 12      | Soft delete o versionado donde el negocio necesita reversibilidad                    | RECOMMENDED |
| 12      | Operaciones concurrentes consideradas: dos admins editando, stock simultáneo         | RECOMMENDED |
| 12A     | Kardex con paginación; cero N+1 en listados de inventario y compras                  | BLOCKER     |
| 12A     | Queries lentas identificadas con EXPLAIN **antes** del lanzamiento                   | RECOMMENDED |
| 17      | Stock con concurrencia y transacciones                                               | CRITICAL    |
| 19      | Alertas de invariantes activas                                                       | CRITICAL    |
| 19      | Runbook: qué revisar, cómo hacer rollback, cómo restaurar                            | RECOMMENDED |
| 22      | Inputs extremos: cantidades en cero, negativas, decimales largos, unicode en nombres | CRITICAL    |
| 03      | **Datos de demostración creíbles.** Cero placeholders, cero "Producto 1"             | BLOCKER     |

---

## Definición de terminado

- [ ] **El retail es vendible.** Ciclo completo: comprar a proveedor → recibir → vender → cobrar → devolver → contar → cerrar caja → ver utilidad real del periodo.
- [ ] Los tres tenants de demostración (tienda, ferretería, farmacia) se ven creíbles y se resetean en un clic.
- [ ] Q-10 (exclusiones que descuentan) cerrado.
- [ ] P1-13 y el defecto de `ajustarStock` sin `organizacion_id` cerrados.
- [ ] Las 16 pruebas del corte pasan.
- [ ] El reconciliador corre y detecta las cuatro inconsistencias sembradas.
- [ ] La utilidad del periodo cuadra con: ventas − costo de venta − gastos, al centavo, sobre 200 ventas sintéticas.
- [ ] Cero BLOCKERS de `morphiq-prs`.
- [ ] **Miguel puede hacer una demo de ferretería completa** y sostenerla frente a un prospecto.
