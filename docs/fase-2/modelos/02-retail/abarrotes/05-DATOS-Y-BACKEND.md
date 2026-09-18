# 05 · DATOS Y BACKEND · Abarrotes / tienda de conveniencia

Todo lo que sigue se escribe **como si ya estuviera dentro del monorepo** (D-05): mismos contratos
—`comando()`, `definirComando`, el puente con `rolesLectura` obligatorio, el ámbito de sesión,
bigint de centavos—, misma estructura de carpetas. **Las migraciones se escriben numeradas y listas,
y no se aplican.**

Las migraciones de `restaurante` ocupan el rango **060–069**. Éste toma **070–082**.

**Regla que atraviesa todo este archivo:** ningún comando declara `rol`, `organizacion_id`,
`sucursal_id`, `empleo_id`, `identidad_id` ni `terminal_id` en su entrada. Un comando que lo haga
no compila, y es a propósito.

---

## 1 · ENTIDADES NUEVAS

### 1.1 · `producto_presentaciones` — F-112, F-147

El corazón del modelo. Una fila por forma de comprar o vender un producto.

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk → `productos`, **on delete cascade** |
| `nombre` | text | not null. `'pieza'`, `'six'`, `'caja'`, `'kilo'`, `'cartón'` |
| `factor` | numeric(14,4) | not null, **> 0**. Cuántas unidades base contiene |
| `codigo_barras` | text | **unique** por organización, nullable |
| `sku` | text | nullable |
| `precio_venta_centavos` | bigint | nullable. Si es null, se deriva: `factor × precio base` |
| `es_base` | boolean | not null. **Exactamente una por producto, y su factor = 1** |
| `es_compra_default` | boolean | La que se preselecciona al recibir |
| `es_venta_default` | boolean | La que se preselecciona al vender |
| `activa` | boolean | default true |

**Restricciones que la base garantiza, no la aplicación:**
- `unique (producto_id) where es_base` — una sola base.
- `check (not es_base or factor = 1)` — la base siempre vale 1.
- `unique (organizacion_id, codigo_barras) where codigo_barras is not null` — un código no puede
  apuntar a dos presentaciones. Es el error que más va a intentarse.
- `check (factor > 0)`.

**Por qué `numeric(14,4)` y no entero.** Porque el cigarro suelto tiene factor 1/20 = 0.05, y el
huevo por kilo tiene factor ≈16.6. Un entero obligaría a invertir la unidad base y a que el
inventario de cigarros se lleve en cigarros, que es contra-intuitivo para el tendero. **La
existencia sigue siendo entera en unidad base**; el factor es el que puede ser fraccionario.

### 1.2 · `zonas_anaquel` — F-149

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `nombre` | text | not null. `'Reja de refrescos'`, `'Anaquel 2 arriba'`, `'Congelador'` |
| `orden` | int | Para recorrer la tienda en el orden físico |
| `dias_entre_conteos` | int | default 30. 7 en refrescos, 90 en abarrote seco |
| `ultimo_conteo_en` | timestamptz | nullable |
| `activa` | boolean | default true |

### 1.3 · `conteos` y `conteo_lineas` — F-106, F-149

`conteos`

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `alcance` | text | `check in ('zona','completo')` |
| `zona_id` | uuid | fk → `zonas_anaquel`, null si `alcance='completo'` |
| `almacen_id` | uuid | fk → `almacenes` |
| `estado` | text | `check in ('abierto','cerrado','cancelado')` |
| `abierto_por` / `cerrado_por` | uuid | fk → empleos |
| `abierto_en` / `cerrado_en` | timestamptz | |
| `diferencia_centavos` | bigint | Valuada a costo promedio, escrita al cerrar |

`conteo_lineas`

| Campo | Tipo | Restricción |
|---|---|---|
| `conteo_id` | uuid | fk, on delete cascade |
| `producto_id` | uuid | fk |
| `esperado_base` | numeric(16,4) | **Se sella al abrir la línea, no al cerrar el conteo** |
| `contado_base` | numeric(16,4) | Suma de las presentaciones capturadas |
| `capturas` | jsonb | `[{presentacion_id, cantidad}]` — lo que tecleó la persona, tal cual |
| `motivo_ajuste` | text | nullable |
| `movimiento_stock_id` | uuid | fk, null hasta que se ajusta |

**Por qué se sella el esperado al abrir la línea.** Porque el conteo tarda veinte minutos y en ese
rato se sigue vendiendo. Si el esperado se calculara al cerrar, todas las ventas de esos veinte
minutos aparecerían como faltante. Sellarlo al abrir y sumarle los movimientos posteriores es la
única forma de que el conteo con la tienda abierta signifique algo.

**Por qué se guarda `capturas` en crudo.** Porque cuando alguien reclama *"yo conté nueve cajas"*,
tiene que poder verse que capturó nueve cajas y que el sistema convirtió a 216. Sin eso, toda
discusión de conteo acaba en la palabra de uno contra la del sistema.

### 1.4 · `caducidades` — F-146

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk |
| `almacen_id` | uuid | fk |
| `caduca_el` | date | not null |
| `cantidad_base` | numeric(16,4) | not null, **≥ 0** |
| `compra_id` | uuid | fk → `compras`, nullable |
| `movimiento_origen_id` | uuid | fk → `movimientos_stock` |

**Deliberadamente NO lleva número de lote.** Es la diferencia entre F-146 y V4 (F-113), y es la
razón por la que este modelo es operable y `farmacia` necesita otra cosa. La suma de
`cantidad_base` por producto **no está obligada a cuadrar** contra la existencia: es informativa,
para la alerta de vencimiento y para valuar la merma por caducidad. Obligarla a cuadrar convertiría
cada venta en una asignación de lote, y eso es V4.

### 1.5 · `operaciones_comision` — F-255

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `tipo` | text | `check in ('recarga','pago_servicio','paqueteria','retiro_efectivo')` |
| `proveedor_servicio` | text | `'Telcel'`, `'CFE'`, `'Mercado Libre'` |
| `referencia` | text | Teléfono, número de recibo, guía |
| `monto_recibido_centavos` | bigint | **≥ 0**. Entra al cajón y NO es venta |
| `comision_negocio_centavos` | bigint | **≥ 0**. ES ingreso |
| `comision_al_cliente_centavos` | bigint | default 0. También es ingreso |
| `estado` | text | `check in ('pendiente','exitosa','fallida','reversada')` |
| `folio_externo` | text | El que devuelve el agregador |
| `sesion_caja_id` | uuid | fk, not null |
| `movimiento_caja_id` | uuid | fk, nullable hasta confirmarse |

### 1.6 · `saldos_comisionista` — F-255

| Campo | Tipo | Restricción |
|---|---|---|
| `proveedor_servicio` | text | pk compuesta con organización |
| `saldo_centavos` | bigint | **≥ 0** |
| `minimo_alerta_centavos` | bigint | default 30000 ($300) |
| `actualizado_en` | timestamptz | |

Se comporta exactamente como un almacén de un producto: baja al vender, sube al depositar, y tiene
alerta de mínimo. **Reutiliza el motor de F-107 sin tocarlo.**

### 1.7 · `depositos_envase` — F-256

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk. El envase, que es un producto |
| `tipo` | text | `check in ('cobrado','devuelto')` |
| `cantidad` | int | **> 0** |
| `importe_unitario_centavos` | bigint | Lo fija el tendero: de $700 a $2500 |
| `orden_id` | uuid | nullable — hay devoluciones sin venta de por medio |
| `sesion_caja_id` | uuid | fk, not null |
| `movimiento_caja_id` | uuid | fk, not null |

**Es un pasivo, no una venta.** El saldo vivo se obtiene de la vista `saldo_envases` (§2).

### 1.8 · `abonos_fiado` — F-254

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `cliente_id` | uuid | fk → `clientes`, not null |
| `monto_centavos` | bigint | **> 0** |
| `metodo` | text | `check in ('efectivo','tarjeta','transferencia')` |
| `sesion_caja_id` | uuid | fk, not null |
| `movimiento_caja_id` | uuid | fk, **not null** |
| `aplicaciones` | jsonb | `[{orden_id, monto_centavos}]` — a qué ventas se aplicó, más viejo primero |

**`movimiento_caja_id` es `not null` a propósito.** Un abono sin movimiento de caja es dinero que
entró y no está en ningún corte. La base lo impide; no se deja a la aplicación.

### 1.9 · `redondeos` — F-257

| Campo | Tipo | Restricción |
|---|---|---|
| `orden_id` | uuid | fk |
| `tipo` | text | `check in ('a_favor','en_contra','especie')` |
| `importe_centavos` | bigint | Puede ser negativo |
| `producto_especie_id` | uuid | nullable — el chicle que se dio de cambio |
| `movimiento_stock_id` | uuid | nullable — si fue en especie, salió del stock |

### 1.10 · `impuestos_producto` — F-011

No es tabla nueva sino extensión (§3), pero el **régimen de IEPS** sí necesita catálogo propio:

`regimenes_ieps`

| Campo | Tipo |
|---|---|
| `clave` | text pk. `'bebida_azucar'`, `'bebida_edulcorante'`, `'botana_8'`, `'energizante_25'`, `'cigarro'`, `'ninguno'` |
| `forma` | text `check in ('cuota_litro','ad_valorem','cuota_pieza','mixto')` |
| `parametro` | numeric(12,6) | $3.0818 por litro, 0.08, 0.8516 por pieza |
| `vigente_desde` | date | **Versionado.** Cambiar la cuota no reescribe el histórico |

---

## 2 · ENTIDADES EXISTENTES QUE HAY QUE EXTENDER

| Tabla | Campo nuevo | Tipo | Por qué |
|---|---|---|---|
| `productos` | `unidad_base` | text | Hoy hay `unidad_venta`; la base es otra cosa y hay que separarlas |
| `productos` | `zona_id` | uuid fk | Para el conteo cíclico |
| `productos` | `tasa_iva` | numeric(5,4) | **0.0000 o 0.1600.** Hoy la tasa es global del negocio |
| `productos` | `regimen_ieps` | text fk | §1.10 |
| `productos` | `litros_por_unidad` | numeric(10,4) | Sólo si el régimen es cuota por litro |
| `productos` | `controla_caducidad` | boolean | Enciende F-146 por producto |
| `productos` | `dias_alerta_caducidad` | int | 7 en perecedero, 30 en seco |
| `productos` | `envase_producto_id` | uuid fk | El casco que lleva asociado |
| `productos` | `restriccion_legal` | text | `'alcohol'`, `'tabaco'`, null. Para F-980 |
| `proveedores` | `dia_visita` | int[] | 1=lunes… Un proveedor puede venir martes y viernes |
| `proveedores` | `frecuencia` | text | `'diaria'`,`'semanal'`,`'quincenal'`,`'preventa'` |
| `proveedores` | `dias_credito` | int | 0, 8, 15, 30 |
| `proveedores` | `acepta_canje` | boolean | Bimbo sí, cigarros no |
| `clientes` | — | — | **Ya tiene `saldo_pendiente_centavos` y `limite_credito_centavos`.** Falta exponerla |
| `clientes` | `dia_pago` | text | *"paga los viernes"*. Es el dato que hace útil el módulo |
| `ordenes` | `metodo_credito` | bool o valor en el enum de pago | El fiado es método de pago |
| `ordenes` | `cobrada_en` | timestamptz | RESICO grava lo **cobrado**. Separar devengado de cobrado |
| `orden_lineas` | `presentacion_id` | uuid fk | Qué presentación se vendió |
| `orden_lineas` | `cantidad_base` | numeric(16,4) | Ya convertida. **Es lo que descuenta el stock** |
| `orden_lineas` | `tasa_iva` · `ieps_centavos` | | Sellados al vender, no recalculados después |
| `compras` / `compra_lineas` | `presentacion_id`, `es_canje` | | La entrada con canje en la misma nota |
| `movimientos_caja` | `categoria` | text | Los once tipos que no son venta necesitan nombre propio |
| `movimientos_stock` | `tipo` | enum | **Añadir** `devolucion_proveedor` y `consumo_interno` |
| `sesiones_caja` | `denominaciones_apertura` · `denominaciones_cierre` | jsonb | El desglose por billete y moneda |
| `sesiones_caja` | `saldo_recargas_apertura` · `_cierre` | bigint | El segundo arqueo |

**Vistas nuevas:**

```
existencia_presentada       existencia en base + su expresión en presentaciones
saldo_envases               depósitos cobrados − devueltos, por producto de envase
cartera_fiado               saldo, días del más viejo, último abono, por cliente
sugerencia_pedido           existencia, venta 14d, días a la próxima visita, sugerido
                            en presentación de compra, agrupado por proveedor
diferencia_conteo_periodo   suma de diferencias de conteo valuadas a costo, por periodo
margen_por_categoria        venta, costo, margen % y participación, por categoría
```

---

## 3 · REGLAS DE INTEGRIDAD QUE GARANTIZA LA BASE

No la aplicación. Doce, y cada una existe porque su violación produce un descuadre real
documentado en `02-DINERO-Y-CAJA.md` §10.

1. **Exactamente una presentación base por producto, con factor 1.**
   `unique (producto_id) where es_base` + `check (not es_base or factor = 1)`.
2. **Un código de barras apunta a una sola presentación por organización.**
   `unique (organizacion_id, codigo_barras) where codigo_barras is not null`.
3. **El ledger sólo acepta unidad base.** `movimientos_stock` **no tiene** columna de presentación.
   Si no existe el campo, no se puede escribir mal.
4. **El signo del movimiento es coherente con su tipo.** El `check` ya existe
   (`movimiento_stock_signo_coherente`); se extiende a los dos tipos nuevos: `devolucion_proveedor`
   y `consumo_interno` son siempre negativos.
5. **Un abono no existe sin movimiento de caja.** `abonos_fiado.movimiento_caja_id not null`.
6. **Una operación de comisión exitosa no existe sin movimiento de caja.**
   `check (estado <> 'exitosa' or movimiento_caja_id is not null)`.
7. **El saldo del comisionista nunca es negativo.** `check (saldo_centavos >= 0)`.
8. **El depósito de envase no existe sin movimiento de caja.** `not null`.
9. **`clientes.saldo_pendiente_centavos` sólo lo mueven dos caminos**: la venta a crédito y el
   abono. Se garantiza con `trigger` sobre las dos tablas, no con `update` desde la aplicación.
   Un saldo que se puede escribir a mano es un saldo que se va a desincronizar.
10. **Una línea de venta con presentación tiene `cantidad_base` consistente.**
    `check (cantidad_base = cantidad × factor)`, validado por trigger contra la presentación.
11. **Un conteo cerrado no admite líneas nuevas.** `check` por estado + trigger.
12. **Las cuotas de IEPS son versionadas por fecha.** `vigente_desde`. Recalcular un ticket de enero
    con la cuota de julio cambiaría el histórico, y el histórico no se toca.

---

## 4 · COMANDOS

Todos pasan por `comando()`: rol → paquete → validación → idempotencia → transacción → auditoría.
`paquetes: ['tienda', 'ferreteria', ...]` según corresponda tras D-01.

| Comando | Entrada | Roles | Escribe | Idem. |
|---|---|---|---|---|
| `catalogo.crear_presentacion` | producto_id, nombre, factor, codigo, precio, banderas | dueño, encargado | `producto_presentaciones` | Sí |
| `catalogo.actualizar_presentacion` | presentacion_id, campos | dueño, encargado | idem | Sí |
| `catalogo.alta_rapida` | codigo, nombre, precio, categoria_id | **cajero**, encargado, dueño | `productos` + presentación base | **Sí, por código** |
| `catalogo.asignar_codigo` | — | — | **YA EXISTE**, se extiende a presentaciones | Sí |
| `catalogo.actualizar_fiscal` | producto_id, tasa_iva, regimen_ieps, litros | dueño | `productos` | Sí |
| `catalogo.aplicar_fiscal_masivo` | categoria_id, tasa, regimen | dueño | `productos` en lote | Sí |
| `inventario.merma` | producto_id, cantidad, presentacion_id, **motivo** | encargado, dueño | `movimientos_stock` | Sí |
| `inventario.consumo_interno` | producto_id, cantidad, subtipo | encargado, dueño | `movimientos_stock` | Sí |
| `inventario.abrir_conteo` | alcance, zona_id | encargado, dueño | `conteos` + líneas con esperado sellado | Sí |
| `inventario.capturar_conteo` | conteo_id, producto_id, capturas[] | encargado, cajero | `conteo_lineas` | Sí, por línea |
| `inventario.cerrar_conteo` | conteo_id, motivo_global | encargado, dueño | ajustes en `movimientos_stock` + cierre | **Sí** |
| `inventario.registrar_caducidad` | producto_id, caduca_el, cantidad, compra_id | encargado | `caducidades` | Sí |
| `compras.recibir_nota` | proveedor, líneas[], canjes[], pago, dias_credito | encargado, dueño | `compras` + N `movimientos_stock` + costo + caja si contado | **Sí** |
| `compras.sugerir_pedido` | proveedor_id | encargado, dueño | **lectura** | — |
| `venta.cobrar` | — | — | **YA EXISTE**, se extiende: presentación, tasa por línea, crédito, casco, redondeo | Sí |
| `venta.suspender` / `venta.retomar` | orden_id | cajero | `ordenes.estado` | Sí |
| `fiado.registrar_abono` | cliente_id, monto, metodo | cajero, encargado | `abonos_fiado` + `movimientos_caja` + saldo | **Sí** |
| `fiado.ajustar_limite` | cliente_id, limite | dueño | `clientes` | Sí |
| `fiado.declarar_incobrable` | cliente_id, monto, motivo | **dueño** | ajuste + bitácora | Sí |
| `comision.registrar` | tipo, proveedor, referencia, monto, comision | cajero | `operaciones_comision` + `movimientos_caja` | **Sí, por referencia** |
| `comision.depositar_saldo` | proveedor, monto | dueño, encargado | `saldos_comisionista` + caja | Sí |
| `envase.cobrar_deposito` | producto, cantidad, importe | cajero | `depositos_envase` + caja | Sí |
| `envase.devolver_deposito` | producto, cantidad | cajero | idem, negativo | Sí |
| `venta.registrar_redondeo` | orden_id, tipo, importe, producto_especie | cajero | `redondeos` (+ stock si especie) | Sí |
| `caja.abrir` | — | — | **YA EXISTE**, se extiende con denominaciones y saldo de recargas | Sí |
| `caja.cerrar` | — | — | **YA EXISTE**, se extiende con los tres bloqueos de `02` §8.5 | Sí |
| `venta.autorizar_descuento` | orden_id, pct, pin_supervisor | encargado, dueño | bitácora + orden | Sí |

**La `alta_rapida` la puede ejecutar el cajero, y es la única escritura de catálogo que puede.**
Es una decisión consciente: la alternativa —que tenga que llamar al dueño— significa que en hora
pico la venta se cobra sin registrar. Queda en la bitácora y aparece en el corte como *"productos
dados de alta hoy"* para que el dueño los revise.

---

## 5 · ENTRADAS DEL PUENTE

En `packages/app/src/puente/mapa.ts`, con la forma existente. Grupos de roles nuevos:

```ts
const VE_FIADO      = ['dueno','administrador','gerente','cajero'] as const
const VE_COMISIONES = ['dueno','administrador','gerente','cajero'] as const
const RETAIL        = ['dueno','administrador','gerente','cajero','almacen'] as const
```

| Entidad expuesta | Tabla | `rolesLectura` | Campos descartados |
|---|---|---|---|
| `Presentacion` | `producto_presentaciones` | `TODOS_LOS_ROLES` | ninguno. El precio es público en mostrador |
| `ZonaAnaquel` | `zonas_anaquel` | `RETAIL` | — |
| `Conteo` | `conteos` | `INVENTARIO` | `diferencia_centavos` sólo `VE_COSTOS_DE_INSUMO` |
| `ConteoLinea` | `conteo_lineas` | `INVENTARIO` | — |
| `Caducidad` | `caducidades` | `RETAIL` | — |
| **`Cliente`** | `clientes` | `VE_FIADO` | `notas` sólo `DIRECCION`. **Hoy NO está en el mapa** |
| `AbonoFiado` | `abonos_fiado` | `VE_FIADO` | — |
| `OperacionComision` | `operaciones_comision` | `VE_COMISIONES` | — |
| `SaldoComisionista` | `saldos_comisionista` | `VE_COMISIONES` | — |
| `DepositoEnvase` | `depositos_envase` | `CAJA` | — |
| `Redondeo` | `redondeos` | `CAJA` | — |
| `RegimenIeps` | `regimenes_ieps` | `TODOS_LOS_ROLES` | — |
| `ExistenciaPresentada` | vista | `RETAIL` | `costo_promedio` sólo `VE_COSTOS_DE_INSUMO` |
| `SugerenciaPedido` | vista | `COMPRAS` | — |
| `CarteraFiado` | vista | `VE_FIADO` | — |
| `MargenPorCategoria` | vista | `VE_MARGENES` | — |
| `SaldoEnvases` | vista | `CAJA` | — |

**Campos nuevos en entidades ya mapeadas:** `ProductoTerminado` (línea 91) suma `unidad_base`,
`zona_id`, `tasa_iva`, `regimen_ieps`, `controla_caducidad`, `restriccion_legal` y el derivado
`presentaciones`; `Venta` (415) suma `metodo_credito` y `cobrada_en`; `DetalleVenta` (689) suma
`presentacion_id`, `cantidad_base`, `tasa_iva`, `ieps_centavos`; `Proveedor` (1340) suma
`dia_visita`, `frecuencia`, `dias_credito`, `acepta_canje`; `CorteCaja` (842) suma las
denominaciones y los saldos de recargas.

**El costo nunca se expone al rol cajero, en ninguna entidad.** Es la misma regla que
`VE_COSTOS_DE_INSUMO` ya aplica en `restaurante`, extendida a las vistas nuevas.

---

## 6 · RUTAS DE API

```
apps/web/app/api/catalogo/presentacion/route.ts
apps/web/app/api/catalogo/alta-rapida/route.ts
apps/web/app/api/catalogo/fiscal-masivo/route.ts
apps/web/app/api/inventario/merma/route.ts
apps/web/app/api/inventario/consumo-interno/route.ts
apps/web/app/api/inventario/conteo/abrir/route.ts
apps/web/app/api/inventario/conteo/capturar/route.ts
apps/web/app/api/inventario/conteo/cerrar/route.ts
apps/web/app/api/inventario/caducidad/route.ts
apps/web/app/api/compras/recibir-nota/route.ts
apps/web/app/api/compras/sugerencia/[proveedorId]/route.ts
apps/web/app/api/fiado/abono/route.ts
apps/web/app/api/fiado/limite/route.ts
apps/web/app/api/fiado/incobrable/route.ts
apps/web/app/api/comision/registrar/route.ts
apps/web/app/api/comision/depositar/route.ts
apps/web/app/api/envase/deposito/route.ts
apps/web/app/api/venta/redondeo/route.ts
apps/web/app/api/venta/suspender/route.ts
apps/web/app/api/venta/autorizar-descuento/route.ts
```

---

## 7 · MIGRACIONES · escritas, no aplicadas

```
packages/data/src/migraciones/sql/
├── 090_presentaciones.sql
│     producto_presentaciones + índices + los tres check + backfill:
│     cada producto existente recibe una presentación base con factor 1
│     tomando su codigo_barras y precio actuales. NADIE se queda sin base.
├── 091_zonas_y_conteo.sql
│     zonas_anaquel, conteos, conteo_lineas, productos.zona_id
├── 092_caducidad_sin_lote.sql
│     caducidades, productos.controla_caducidad, dias_alerta_caducidad
├── 093_movimientos_stock_tipos_retail.sql
│     ALTER del check: + devolucion_proveedor, + consumo_interno
│     y la extensión del check de signo coherente
├── 094_clientes_fiado.sql
│     clientes.dia_pago, abonos_fiado, trigger de saldo,
│     ordenes.metodo_credito, ordenes.cobrada_en
├── 095_comisiones.sql
│     operaciones_comision, saldos_comisionista
├── 096_envases.sql
│     depositos_envase, productos.envase_producto_id, vista saldo_envases
├── 097_redondeos.sql
├── 098_fiscal_producto.sql
│     regimenes_ieps (con las cuotas 2026), productos.tasa_iva,
│     regimen_ieps, litros_por_unidad + backfill por categoría
├── 099_proveedores_ruta.sql
│     dia_visita, frecuencia, dias_credito, acepta_canje
├── 100_caja_denominaciones.sql
│     sesiones_caja.denominaciones_*, saldo_recargas_*,
│     movimientos_caja.categoria
├── 101_vistas_retail.sql
│     existencia_presentada, cartera_fiado, sugerencia_pedido,
│     diferencia_conteo_periodo, margen_por_categoria
├── 102_venta_en_espera.sql
│     ordenes.estado + 'suspendida', ordenes.codigo_espera,
│     sus dos check y el unico parcial por terminal.
│     ⚠ Faltaba: §5 declara `venta.suspender` escribiendo `ordenes.estado`
│     y el check de la 003 no admitia ningun estado que lo significara.
└── 066_plantillas_semilla.sql
      D-01: esencial → tienda, + los módulos de inventario, escáner,
      alertas y presentaciones. Y el movimiento de Ferretería La Broca.
      TOCA DATOS VIVOS · No se aplica sin que P-04 esté contestada.
```

**Sobre `070` y el backfill.** Es la migración más delicada de las trece: crea la presentación base
de cada producto existente a partir de `codigo_barras` y `precio_venta_centavos`. Si falla a medias,
hay productos sin base y el sistema no puede vender. Va con `begin`/`commit` explícito y con una
verificación al final que aborta si `count(productos) <> count(presentaciones where es_base)`.

**Sobre `078` y el backfill fiscal.** La tasa se asigna **por categoría**, con una tabla de mapeo
escrita a mano contra la LIVA art. 2-A y revisada por un contador antes de aplicar. Un backfill que
ponga todo al 16% es peor que no hacerlo, porque queda invisible.

---

## 8 · DEPENDENCIAS EXTERNAS

| Dependencia | Versión | Por qué ésa |
|---|---|---|
| `@zxing/browser` | la que ya está | **Ya está** y se usa en `BarcodeScanner.jsx`. Se conserva para el camino de cámara en teléfono. No se añade nada nuevo para el lector USB: **el capturador de teclado no necesita librería.** |
| `jspdf` + `html2canvas` | las que ya están | El corte se genera con `generatePDFBlobFromNode`. Se reutiliza intacto. |
| **Ninguna librería de escáner USB** | — | Se escribe a mano: ~80 líneas de `keydown` con medición de tiempo entre teclas. Las librerías del ecosistema añaden peso y una capa de indirección sobre algo que es un `addEventListener`. |
| **Ninguna librería de impresión de etiquetas** | — | F-058 genera un PDF de hojas de etiquetas con el mismo `jspdf`, con plantillas de tamaño estándar. Las impresoras de etiqueta dedicadas (Zebra, Godex) usan ZPL/EPL y **eso es una decisión aparte**, ver abajo. |

### Integraciones con terceros · tres decisiones que no toma esta carpeta

**1 · El agregador de recargas y servicios (F-255).** No hay uno "correcto": TAECEL, Yastás,
PagoTodo, Clip y varios más ofrecen API. Las comisiones varían (6% en recarga; $3 a $22 por
servicio) y las condiciones comerciales pesan más que las técnicas.
*Recomendación:* modelar `operaciones_comision` **con o sin integración**. El flujo manual —el
tendero opera en el portal del agregador y captura el resultado en MorphiqPOS— es el 100% del valor
del modelo de datos y el 0% del riesgo. La integración se añade después sin cambiar una tabla.
**Arrancar con integración es apostar el modelo a un contrato comercial que no está firmado.**

**2 · La báscula (F-983).** Las básculas con salida a POS ($460 a $1,100) hablan RS232 o USB-HID en
protocolos que varían por marca. Un navegador no puede leer un puerto serie sin permiso explícito.
*Tres caminos:* Web Serial API (sólo Chromium, requiere permiso del usuario una vez, es el más
limpio); agente local (funciona con todo, exige instalar algo, es lo que hace la competencia);
o **ninguno** — que la báscula imprima etiqueta con código de peso embebido y se escanee (F-148).
*Recomendación:* **empezar por F-148**, que no requiere integración ninguna y cubre el granel
empaquetado, que es la mayoría. Web Serial después, para el pesaje en vivo.

**3 · La terminal bancaria (F-987).** Hoy el cajero teclea el monto en la terminal aparte. La
integración elimina un error real —teclear $180 en vez de $810— pero ata el sistema a un
adquirente. *Recomendación:* dejarlo fuera de este modelo y resolverlo transversalmente.

**4 · La impresora de etiquetas (F-058).** PDF de hojas Avery contra impresora térmica dedicada con
ZPL. La primera funciona con la impresora que ya tiene; la segunda es lo que usan las tiendas
serias. *Recomendación:* PDF primero, ZPL como venta adicional.

---

## 9 · QUÉ SE REUTILIZA TAL CUAL

Con su ruta. **Nada de esto se toca.**

| Bloque | Ruta | Nota |
|---|---|---|
| Identidad, PIN, sesión, bitácora | `packages/app/src/identidad/` · `heredado/pages/POSLogin.jsx` | Intacto |
| El envoltorio de comandos | `packages/app/src/definicion.ts` | Todos los comandos nuevos lo usan |
| Ámbito y paquetes | `packages/contracts/src/comandos/ambito.ts` | `GIROS` ya trae `'tienda'` y `'ferreteria'`. `PAQUETES` cambia en D-01 |
| Cobro y métodos de pago | `packages/app/src/venta/pagos.ts` · `heredado/components/pos/PaymentModal.jsx` | Se extiende, no se reescribe |
| Cotización y valoración de línea | `packages/app/src/venta/cotizar.ts` · `valorar.ts` · `escala.ts` | La escala de venta variable ya resuelve el granel |
| Caja, movimientos, arqueo, corte de turno | `packages/app/src/caja/sesion.ts` · `turno.ts` · `consulta.ts` | Se extiende con denominaciones |
| Ledger e inventario | `packages/app/src/inventario/inventario.ts` · `consultas.ts` | `inventario.ajustar` e `inventarioInicial` intactos |
| Compras y costo promedio | `packages/app/src/compras/compras.ts` · `costeo.ts` | El promedio ponderado no se toca |
| Catálogo | `packages/app/src/catalogo/productos.ts` · `esquemas.ts` · `consulta.ts` | `catalogo.asignar_codigo` ya existe |
| **Utilidades de código de barras** | `heredado/utils/barcodeUtils.js` | `normalizeBarcode`, `isLikelyValidBarcode`, `isSuspiciousBarcode`, `compareBarcodes`. **Escritas y probadas. Se usan tal cual.** |
| Escáner de cámara | `heredado/components/barcode/BarcodeScanner.jsx` · `ScanFeedbackOverlay.jsx` | Camino de respaldo en teléfono. **Su *cooldown* de 1500 ms no se cambia**: ahí es correcto |
| Conversión de unidades de compra | `heredado/utils/unitConversions.js` · `unidadesMedida.js` | `convertToBaseUnits`, `calculateCostPerBaseUnit`. Base de F-120 |
| Diálogo de cantidad variable | `heredado/components/mesero/CantidadVariableDialog.jsx` | Ya se usa desde `POS.jsx`. Base de F-144 |
| Generación de PDF | `heredado/lib/pdfDownload.js` | `generatePDFBlobFromNode`, `downloadNodeAsPDF`. Intacto |
| Importación masiva | `heredado/components/datos/` | La plantilla de Excel cambia; el motor no |
| Pantalla de mostrador | `heredado/pages/POS.jsx` | **La base de la pantalla de Cobrar.** Se reestructura, no se reescribe |
| Tabla `clientes` | `packages/data/src/migraciones/sql/002_catalogo.sql:188` | Ya trae `saldo_pendiente_centavos` y `limite_credito_centavos`. Falta puente, comandos y UI |
| Perillas de paquete | `heredado/lib/packageConfig.js` | `escaner_codigo_barras` ya está en `MODULOS_ESENCIAL` |

---

## 10 · LO QUE HAY QUE DECIDIR ANTES DE ESCRIBIR CÓDIGO

1. **Los diez IDs nuevos y las dos reclasificaciones** de `01-FUNCIONES.md` §6 se añaden a
   `03-CATALOGO-DE-FUNCIONES.md` **primero**. Sin ID canónico se reinventan en `ferreteria`.
2. **F-988 (venta sin conexión)** entra en tensión directa con la regla de Fase 1 de que los
   totales se calculan siempre en el servidor. **La decide Miguel**, y de la respuesta depende la
   arquitectura de la pantalla de cobro entera. Hasta que se decida, la pantalla se construye
   asumiendo servidor, con la franja de "sin conexión" como estado de error visible.
3. **La migración `082` se aplicó en la Fase 2.3, con P-04 resuelta.** Toca a los cuatro negocios vivos: Don Chuy pasa de
   paquete `operativo` a plantilla `tienda`, y La Broca pasa a `tienda` provisional.
4. **El agregador de recargas es una decisión comercial, no técnica.** Ver §8.
5. **La tabla de mapeo categoría → tasa de IVA la revisa un contador** antes de aplicar `078`. Es
   la única parte de esta carpeta con consecuencia fiscal directa sobre un cliente vivo.
