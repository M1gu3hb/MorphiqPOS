# 03 — Modelo de datos unificado

Esquema Postgres final de la Fase 1. Cada tabla indica su origen en las dos fuentes.

**Convenciones fijas:**

- Nombres `snake_case` plural en español. Identificadores de dominio en español, palabras técnicas en inglés.
- `id uuid primary key default gen_random_uuid()`.
- Toda tabla operativa: `organizacion_id uuid not null` + `sucursal_id uuid` cuando aplique.
- `created_at timestamptz not null default now()`, `updated_at timestamptz` por trigger.
- **Dinero: `bigint` en centavos**, nunca `numeric` ni `float`. Nombre del campo termina en `_centavos`.
- Cantidades de inventario: `numeric(14,4)` — se necesitan fracciones de gramo.
- Todo enum es un `text` con `check` explícito, no un tipo `enum` de Postgres (más fácil de migrar).
- Índices compuestos siempre con `organizacion_id` como **primera** columna.

---

## 1. Núcleo de plataforma

### `organizaciones`

Origen: `negocios` (B). El restaurante no tenía nada equivalente.

| Campo         | Tipo                 | Nota                                             |
| ------------- | -------------------- | ------------------------------------------------ |
| `id`          | uuid pk              |                                                  |
| `nombre`      | text not null        |                                                  |
| `slug`        | text unique not null |                                                  |
| `activa`      | bool default true    |                                                  |
| `perfil_giro` | text                 | `retail` · `restaurante` · `servicios` · `mixto` |

> Se **elimina** el campo `plan` de `negocios` (B). Los entitlements viven en `capacidades_activas` (R26: comercial ≠ permisos).

### `sucursales`

Origen: `sucursales` (B), que existía sin UI. Nueva en la práctica.

`id · organizacion_id · nombre · direccion · telefono · zona_horaria · activa`

### `terminales`

**Nueva.** No existe en ninguna fuente. Necesaria para A-28.

`id · organizacion_id · sucursal_id · nombre · device_token_hash · enrolada_en · ultima_actividad · activa`

### `personas`

**Nueva.** Separa el ser humano de su rol (ver `/CONTEXTO_MAESTRO.md` §4).

`id · organizacion_id · nombre · apellidos · telefono · correo · notas`

### `identidades`

Origen: `usuarios` (B) + `auth.users` de Supabase.

`id · persona_id · auth_user_id (unique, nullable) · correo · activa`

> `auth_user_id` es nullable a propósito: un mesero que sólo entra con PIN en la terminal **no necesita cuenta de correo**.

### `credenciales_pin`

**Nueva.** Reemplaza `UsuarioPOS.pin` (A), que se comparaba en el navegador.

`id · identidad_id · pin_hash (argon2id) · intentos_fallidos · bloqueada_hasta · rotada_en`

> **El hash nunca sale del servidor.** Ninguna consulta lo devuelve. Corrige P0-01 y SEC-AUTH-001.

### `empleos`

**Nueva.** Persona × organización × sucursal × rol × vigencia.

`id · persona_id · organizacion_id · sucursal_id · rol · vigente_desde · vigente_hasta · activo`

`rol` ∈ `dueno` · `administrador` · `gerente` · `cajero` · `mesero` · `cocina` · `almacen`

### `permisos_rol`

**Nueva.** Corrige P0-02. Matriz explícita, consultable, con pruebas negativas.

`id · organizacion_id · rol · accion · permitido`

`accion` es un string estable tipo `venta.cobrar`, `caja.cerrar`, `producto.cambiar_precio`, `configuracion.editar`, `empleado.crear`.

### `capacidades_activas`

**Nueva.** El registry (A-01, R22–R26).

`id · organizacion_id · sucursal_id · clave · version · activa · configuracion jsonb · activada_en · activada_por`

### `configuracion`

Origen: `configuracion_negocio` (B) + `ConfiguracionNegocio` (A, ~100 campos).

**No se copia el monstruo de ~100 campos.** Se parte en secciones, una fila por sección y ámbito:

`id · organizacion_id · sucursal_id · seccion · valores jsonb · version`
`unique (organizacion_id, coalesce(sucursal_id,'...'), seccion)`

Secciones: `identidad` · `contacto` · `fiscal` · `operacion` · `tickets` · `impresion` · `hardware` · `portal_qr` · `notificaciones` · `apariencia`.

> Corrige P1-01 de raíz: la restricción única elimina el problema de los 7 registros y el `list()[0]`.

### `folios`

**Nueva.** Corrige P2-02 y la colisión de folios de tiendita.

`organizacion_id · sucursal_id · serie · siguiente bigint`
El consecutivo se obtiene con `UPDATE … RETURNING` dentro de la transacción del comando. Nunca timestamp + aleatorio.

### `auditoria`

Origen: `audit_log` (B). Se conserva el diseño tal cual, incluida la regla de **sin políticas de INSERT** — sólo escribible por el servidor.

`id · organizacion_id · identidad_id · accion · entidad · entidad_id · payload jsonb · ip · correlation_id · created_at`

### `eventos_outbox`

**Nueva.** Para workers, integraciones y futuro MCP.

`id · organizacion_id · tipo · payload jsonb · publicado_en · intentos`

---

## 2. Catálogo

### `categorias`

Origen: `categorias_producto` (B) + `CategoriaProducto` (A).

`id · organizacion_id · tipo · nombre · color · icono · orden · estacion_id · activa`

`tipo` ∈ `producto` · `insumo` — unifica `CategoriaProducto` y `CategoriaIngrediente` (A) en una sola tabla.

`estacion_id` viene de (A): la categoría rutea a una estación de preparación.

### `productos`

Origen: `productos` (B) + `ProductoTerminado` (A). **Es la tabla con más fusión de todo el esquema.**

| Campo                                                                              | De        | Nota                                                                  |
| ---------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| `id · organizacion_id · categoria_id · nombre · descripcion · imagen_url · activo` | ambos     |                                                                       |
| `sku · codigo_barras · marca · proveedor_id`                                       | B         | índice parcial en `(organizacion_id, codigo_barras)`                  |
| `precio_venta_centavos`                                                            | ambos     | era `precio_venta` numérico                                           |
| `costo_unitario_centavos · costo_calculado_centavos`                               | ambos     |                                                                       |
| `utilidad_centavos · margen_bp`                                                    | ambos     | margen en puntos base, entero                                         |
| `stock_minimo · stock_maximo`                                                      | B         |                                                                       |
| `precio_mayoreo_centavos · cantidad_minima_mayoreo`                                | B         |                                                                       |
| `permite_venta_sin_stock`                                                          | B         |                                                                       |
| `visible_en_pos · visible_en_menu_digital`                                         | A         |                                                                       |
| `tiempo_preparacion_estimado`                                                      | A         |                                                                       |
| `estacion_id`                                                                      | A         | era `area_preparacion` enum; ahora FK real                            |
| **`tipo_venta`**                                                                   | A         | `precio_fijo` · `variable_medida` · `porcion_contenedor` · `servicio` |
| `unidad_venta`                                                                     | B         | `pieza · caja · paquete · kg · g · l · ml · m`                        |
| `insumo_base_id · unidad_variable · precio_por_unidad_variable_centavos`           | A         | para `variable_medida`                                                |
| `cantidad_minima_variable · cantidad_maxima_variable · incremento_variable`        | A         |                                                                       |
| `capacidad_contenedor_ml · porciones_por_contenedor · ml_por_porcion`              | A         | para `porcion_contenedor`                                             |
| `nombre_porcion · precio_por_porcion_centavos`                                     | A         |                                                                       |
| `presets_variable jsonb · presets_porcion jsonb`                                   | A         | para el portal QR                                                     |
| **`estrategia_consumo`**                                                           | **nueva** | `sku` · `receta` · `insumo_base` · `ninguno`                          |

> `estrategia_consumo` es la mitad del eje de divergencia (`02-ESTRATEGIA` §4.3). Una tienda usa `sku`, un restaurante usa `receta`, un producto por peso usa `insumo_base`, un servicio usa `ninguno`.

### `modificadores` y `modificador_opciones`

Origen: `ProductoTerminado.modificadores` (A), que era un `jsonb` anidado. **Se normaliza a tablas** — permite reusar un grupo entre productos y consultarlo.

`modificadores`: `id · organizacion_id · nombre · obligatorio · tipo (unica|multiple) · activo`
`modificador_opciones`: `id · modificador_id · nombre · precio_extra_centavos · activo · orden`
`producto_modificadores`: `producto_id · modificador_id · orden`

> Mejora sobre (A): las opciones ahora pueden tener precio. En (A) eran "solo informativas".

### `combos` y `combo_productos`

Origen: `combos` (B). Sin cambios estructurales.

### `historial_precios`

Origen: `historial_precios` (B), poblada por trigger. Se conserva el trigger.

---

## 3. Venta — el corazón de la fusión

### `ordenes`

Origen: `ventas` (B) + `Venta` (A). **Aquí es donde se unifican los dos sistemas.**

| Campo                                                                          | De        | Nota                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id · organizacion_id · sucursal_id · terminal_id`                             |           |                                                                                                                                                                            |
| `folio`                                                                        | ambos     | `unique (organizacion_id, serie, folio)`                                                                                                                                   |
| `sesion_caja_id`                                                               | ambos     | era `corte_id` / `corte_caja_id`                                                                                                                                           |
| **`estrategia_captura`**                                                       | nueva     | `mostrador` · `escaner` · `mesa` · `qr` · `cita` · `tienda_en_linea`                                                                                                       |
| **`estrategia_cumplimiento`**                                                  | nueva     | `inmediato` · `preparacion` · `agendado` · `envio` · `retiro`                                                                                                              |
| `estado`                                                                       | ambos     | `borrador` · `confirmada` · `en_preparacion` · `lista` · `cuenta_solicitada` · `parcialmente_pagada` · `pagada` · `parcialmente_reembolsada` · `reembolsada` · `cancelada` |
| `mesa_id`                                                                      | A         | nullable                                                                                                                                                                   |
| `personas`                                                                     | A         |                                                                                                                                                                            |
| `cliente_id`                                                                   | ambos     |                                                                                                                                                                            |
| `empleado_atiende_id · empleado_cobra_id`                                      | ambos     |                                                                                                                                                                            |
| `subtotal_centavos · descuento_centavos · impuestos_centavos · total_centavos` | ambos     | **calculados en servidor**                                                                                                                                                 |
| `costo_total_centavos · utilidad_centavos · margen_bp`                         | ambos     | snapshots                                                                                                                                                                  |
| `notas · notas_alergias · celebracion`                                         | A         |                                                                                                                                                                            |
| `motivo_cancelacion · cancelada_por · cancelada_en`                            | ambos     |                                                                                                                                                                            |
| `idempotency_key`                                                              | **nueva** | `unique (organizacion_id, idempotency_key)`                                                                                                                                |
| `version`                                                                      | **nueva** | entero monotónico contra respuestas fuera de orden                                                                                                                         |

**Se eliminan de `Venta` (A):**

- Los 4 campos `propina_*` de método → pasan a `pagos`.
- Los 9 campos `ajuste_*` → pasan a `orden_ajustes`.
- Los 5 campos `satisfaccion_*` → pasan a `orden_valoraciones`.
- `metodo_pago` y `monto_efectivo/tarjeta/transferencia` → pasan a `pagos`.

> Motivo: `Venta` tenía ~70 columnas mezclando cinco responsabilidades. Normalizarla es lo que permite pago mixto real, múltiples ajustes auditables y reportes que cuadran.

### `orden_lineas`

Origen: `detalle_ventas` (B) + `DetalleVenta` (A).

`id · orden_id · organizacion_id · producto_id (nullable) · producto_nombre · sku · codigo_barras`
`cantidad numeric(14,4) · unidad`
`precio_unitario_centavos · costo_unitario_centavos · descuento_centavos · subtotal_centavos · total_centavos · utilidad_centavos`
`es_mayoreo` (B) · `tipo_venta` (A) · `cantidad_variable · unidad_variable · nombre_porcion · cantidad_porciones` (A)
`combo_id` (B, reemplaza el hack `sku: 'COMBO:<id>'`)
`estado` · `notas`

### `orden_linea_modificadores`

Origen: `DetalleVenta.modificadores` (A, jsonb). Normalizado.

`id · orden_linea_id · modificador_id · modificador_nombre · opcion_id · opcion_nombre · precio_extra_centavos`

### `orden_linea_exclusiones`

Origen: `DetalleVenta.ingredientes_excluidos_snapshot` (A, string JSON). Normalizado.

`id · orden_linea_id · insumo_id · insumo_nombre · unidad · cantidad_base_excluida numeric(14,4)`

> **Aquí se cierra el "PASO B" que quedó pendiente en (A):** al cobrar, el comando resta estas cantidades del consumo por receta. Decisión Q-10, resuelta.

### `orden_ajustes`

Origen: los 9 campos `ajuste_*` de `Venta` (A), donde el historial era un string JSON.

`id · orden_id · organizacion_id · empleado_id · motivo · total_antes_centavos · total_despues_centavos · diferencia_centavos · cambios jsonb · autorizado_por · created_at`

### `orden_valoraciones`

Origen: los 5 campos `satisfaccion_*` de `Venta` (A).

`id · orden_id · score (1..5) · emoji · etiqueta · comentario · origen · created_at`

### `pagos`

**Nueva como tabla.** En ambos sistemas el pago eran columnas dentro de la venta.

`id · orden_id · organizacion_id · sesion_caja_id · metodo · monto_centavos · propina_centavos · recibido_centavos · cambio_centavos · referencia · estado · idempotency_key · created_at`

`metodo` ∈ `efectivo` · `tarjeta` · `transferencia` · `fiado` · `puntos` · `monedero`

> Un pago mixto son varias filas. Corrige el bug de tiendita donde el sync offline mapeaba todo a efectivo y descuadraba el arqueo.

### `devoluciones` y `devolucion_lineas`

Origen: `devoluciones` / `detalle_devoluciones` (B). Se conserva, con `regresa_a_inventario`.

---

## 4. Caja

### `sesiones_caja`

Origen: `cortes_caja` (B) + `CorteCaja` (A).

`id · organizacion_id · sucursal_id · terminal_id · empleado_abre_id · empleado_cierra_id`
`abierta_en · cerrada_en · estado (abierta|cerrada)`
`fondo_inicial_centavos · efectivo_esperado_centavos · efectivo_contado_centavos · diferencia_centavos`
`efectivo_retirado_centavos · efectivo_dejado_centavos`

> **Los totales agregados de (B) se eliminan como columnas.** `total_ventas`, `total_efectivo`, `numero_ventas`, `ticket_promedio` se **derivan** de `pagos` y `movimientos_caja`. Guardarlos duplicados fue la causa de que en tiendita nunca se actualizaran al cobrar.

`unique (terminal_id) where estado = 'abierta'` — una sola caja abierta por terminal. Corrige CASH-02.

### `movimientos_caja`

**Nueva.** El saldo se deriva de aquí, no se edita.

`id · sesion_caja_id · organizacion_id · tipo · monto_centavos · referencia_tipo · referencia_id · empleado_id · motivo · created_at`

`tipo` ∈ `apertura` · `venta` · `devolucion` · `gasto` · `retiro` · `deposito` · `ajuste` · `propina`

### `liquidaciones_propina` y `liquidacion_detalle`

Origen: `LiquidacionPropina` (A).

`id · organizacion_id · sesion_caja_id · periodo_inicio · periodo_fin · total_centavos · liquidada_en · liquidada_por`
Detalle por empleado: `liquidacion_id · empleado_id · monto_centavos`

### `gastos` y `plantillas_gasto`

Origen: `gastos_operativos` / `PlantillaGasto` (ambos). Sin cambios de fondo.

---

## 5. Inventario

### `almacenes`

**Nueva.** Preparado para F1.3 y multi-almacén futuro. En Fase 1: uno por sucursal.

`id · organizacion_id · sucursal_id · nombre · principal · activo`

### `insumos`

Origen: `Ingrediente` (A). En retail, un producto **es** su propio insumo (relación 1:1 automática).

`id · organizacion_id · categoria_id · nombre · unidad_base · costo_unitario_centavos · stock_minimo · activo`

### `movimientos_stock`

Origen: `movimientos_inventario` (B) + `MovimientoInventario` (A). **Cambia de naturaleza: pasa a ser un ledger inmutable.**

`id · organizacion_id · almacen_id · insumo_id (o producto_id) · tipo · cantidad numeric(14,4) · unidad`
`costo_unitario_centavos · referencia_tipo · referencia_id · empleado_id · motivo · idempotency_key · created_at`

`tipo` ∈ `entrada_compra` · `salida_venta` · `ajuste` · `merma` · `devolucion` · `cancelacion` · `traspaso_entrada` · `traspaso_salida` · `inventario_inicial` · `produccion`

> **Sin `stock_anterior`/`stock_nuevo`.** Esos campos son la firma del patrón read-then-write que causa pérdida de actualizaciones (P1-03). El saldo se deriva.

### `existencias`

**Nueva.** Proyección materializada del ledger, por rendimiento.

`organizacion_id · almacen_id · insumo_id · cantidad numeric(14,4) · actualizado_en`
`primary key (almacen_id, insumo_id)`

Se actualiza dentro de la misma transacción que inserta el movimiento, con `UPDATE … SET cantidad = cantidad + $1 WHERE …` — **decremento atómico, nunca sobrescritura**. Un reconciliador nocturno compara la proyección contra la suma del ledger y alerta si difieren.

### `recetas`

Origen: `RecetaEscandallo` (A).

`id · organizacion_id · producto_id · insumo_id · cantidad numeric(14,4) · unidad · merma_porcentaje`

### `conteos_inventario` y `conteo_lineas`

Origen: `conteos_inventario` / `conteo_detalle` (B). Se conserva.

### `compras` y `compra_lineas`

Origen: `compras_mercancia` / `detalle_compras` (B) + `CompraInsumo` / `DetalleCompra` (A).

Se conserva de (B) la conversión de unidades, que es una feature real de abarrotes:
`cantidad_compra · unidad_compra · piezas_por_caja · cantidad_stock_agregada`

### `proveedores` y `plantillas_compra`

Origen: ambos. Sin cambios.

---

## 6. Restaurante

### `zonas`

Origen: campo `zona` de `Mesa` (A). Se normaliza.

`id · organizacion_id · sucursal_id · nombre · orden · activa`

### `mesas`

Origen: `Mesa` (A).

`id · organizacion_id · sucursal_id · zona_id · numero · nombre · forma · ancho · alto · pos_x · pos_y · capacidad`
`estado (libre|ocupada|cuenta_solicitada|por_limpiar|inactiva)`
`empleado_asignado_id · token_qr · qr_activo · version`

> **`venta_activa_id` se elimina.** Era una relación duplicada mantenida a mano (P1-04). La orden activa se consulta desde `ordenes` con un índice parcial:
> `unique (mesa_id) where estado not in ('pagada','cancelada')` — corrige TABLE-02 estructuralmente.

### `estaciones_preparacion`

Origen: `EstacionPreparacion` (A).

`id · organizacion_id · sucursal_id · nombre · color · orden · activa`

### `comandas`

Origen: `PedidoPreparacion` (A).

`id · organizacion_id · orden_id · estacion_id · mesa_id · folio_comanda · estado · enviada_en · idempotency_key · version`

`estado` ∈ `nueva` · `en_preparacion` · `lista` · `entregada` · `cancelada`

### `comanda_items`

Origen: `PedidoPreparacion.items` (A), que era un array jsonb con estructura anidada.

`id · comanda_id · orden_linea_id · producto_nombre · cantidad · notas · estado · listo_en · entregado_en`

> **Los `modificadores` e `ingredientes_excluidos` anidados dentro de cada item ya no se duplican aquí**: se leen de `orden_linea_modificadores` y `orden_linea_exclusiones` por el `orden_linea_id`. Una sola fuente de verdad.

---

## 7. Clientes y canales

### `clientes`

Origen: `clientes_fiado` (B) + `Cliente` (A, entidad sin pantalla).

`id · organizacion_id · persona_id (nullable) · nombre · telefono · correo · notas`
`total_visitas · total_consumido_centavos · ultima_visita`
`saldo_pendiente_centavos · limite_credito_centavos · puntos` (de B)
`activo`

### `movimientos_credito`

Origen: `movimientos_fiado` (B).

`id · organizacion_id · cliente_id · orden_id · tipo (cargo|abono) · monto_centavos · descripcion · empleado_id`

### `solicitudes_qr`

Origen: `SolicitudQR` (A).

`id · organizacion_id · mesa_id · orden_id · tipo (ordenar|cuenta|ayuda) · estado · atendida_por · created_at`

### `menu_qr_secciones`

Origen: `MenuQRSeccion` (A).

### `eventos_escaneo`

Origen: `scan_events` (B). Se conserva completo — es el escáner remoto por teléfono.

`id · organizacion_id · sesion_caja_id · device_id · origen · codigo_barras · producto_id · cantidad · estado · empleado_id · error`

> **Se corrige la idempotencia:** en tiendita vivía en un `Set` en memoria que se perdía al recargar. Pasa a ser una columna `procesado_en` con `unique` sobre `(sesion_caja_id, device_id, id)`.

---

## 8. Lo que NO entra al esquema de Fase 1

| Tabla de origen                          | Qué se hace                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `suscripciones` (B)                      | Sale del núcleo → capacidad `membresias` (A-22). Se conserva el código, no la tabla en el núcleo |
| `reportes_generados` (B)                 | Se evalúa en F1.5. Los reportes se derivan; guardarlos es caché, no fuente                       |
| `carritos_activos` / `carrito_items` (B) | Reemplazados por `ordenes` en estado `borrador`. Un carrito **es** una orden borrador            |
| `IntegrationSyncLog` (A)                 | No entra. Cola de integraciones se rediseña cuando haya integraciones reales                     |
| `DescuentoInventarioVenta` (A)           | Reemplazado por `movimientos_stock` con `referencia_tipo='orden'`                                |
| `UsuarioPOS` (A)                         | Reemplazado por `personas` + `identidades` + `credenciales_pin` + `empleos`                      |
| `usuarios` (B)                           | Igual                                                                                            |

---

## 9. Cuadro de conversión rápida

| Concepto  | Fuente A               | Fuente B                 | **Unificado**                                         |
| --------- | ---------------------- | ------------------------ | ----------------------------------------------------- |
| Negocio   | —                      | `negocios`               | `organizaciones`                                      |
| Empleado  | `UsuarioPOS`           | `usuarios`               | `personas`+`identidades`+`empleos`+`credenciales_pin` |
| Producto  | `ProductoTerminado`    | `productos`              | `productos`                                           |
| Insumo    | `Ingrediente`          | (el producto mismo)      | `insumos`                                             |
| Venta     | `Venta`                | `ventas`                 | **`ordenes`**                                         |
| Línea     | `DetalleVenta`         | `detalle_ventas`         | **`orden_lineas`**                                    |
| Carrito   | (estado en pantalla)   | `carritos_activos`       | `ordenes` estado `borrador`                           |
| Pago      | columnas en `Venta`    | columnas en `ventas`     | **`pagos`**                                           |
| Caja      | `CorteCaja`            | `cortes_caja`            | `sesiones_caja` + `movimientos_caja`                  |
| Stock     | `MovimientoInventario` | `movimientos_inventario` | `movimientos_stock` + `existencias`                   |
| Receta    | `RecetaEscandallo`     | —                        | `recetas`                                             |
| Mesa      | `Mesa`                 | —                        | `mesas` + `zonas`                                     |
| Comanda   | `PedidoPreparacion`    | —                        | `comandas` + `comanda_items`                          |
| Config    | `ConfiguracionNegocio` | `configuracion_negocio`  | `configuracion` por secciones                         |
| Auditoría | —                      | `audit_log`              | `auditoria`                                           |

**Total: ~45 tablas.** Contra 25 entidades (A) y 29 tablas (B) — el crecimiento viene de normalizar lo que estaba metido en columnas y JSON, no de agregar funciones.
