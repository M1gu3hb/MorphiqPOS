# F1-04 · Mapa de entidades — traducción campo por campo

Fecha: 9 de septiembre de 2026
Entrega de la tarea **E3-3** de `F1-02` §5. Es la fuente de verdad de `packages/app/src/puente/mapa.ts`.

**Fuentes leídas para escribir esto:**

| Fuente | Qué aportó |
|---|---|
| `packages/data/src/esquema.ts` (456 líneas, 28 tablas) | Los tipos reales del backend |
| `packages/data/src/migraciones/sql/*.sql` (12 archivos, 1877 líneas) | Convenciones de DDL, restricciones e índices existentes |
| `historico/restaurante/base44/entities/*.jsonc` (25 archivos) | **El esquema declarado de las entidades de Miguel.** No estaba citado en `F1-01` |
| `historico/restaurante/src/` (244 archivos) | Qué campos se escriben y se leen **de verdad**, con `archivo:línea` |
| `docs/fase-1/F1-01-AUDITORIA-DEL-RESTAURANTE.md` §3, §6, §9 | Reglas de negocio y restricciones exigidas |

> **Hallazgo previo que cambia una premisa de `F1-01`.** La auditoría dice «los **26** campos de snapshot de `DetalleVenta`». El esquema declara **24** propiedades (`DetalleVenta.jsonc:5-101`), ningún `create` escribe más de 23, y la unión de los tres `create` más el `update` da exactamente **24**. Cero campos fuera de esquema. La cifra correcta es **24**, y los 24 están enumerados en §7. La hipótesis de dónde salió el 26 es 24 + `id` + `created_date`.

---

## 0 · Cómo se lee este mapa

### 0.1 Las tres columnas que importan

Cada entidad lleva una tabla con esta forma:

`campo de Miguel | tipo que usa él | columna destino | tipo destino | transformación`

- **tipo que usa él** es el tipo **de JavaScript en tiempo de ejecución**, no el declarado en el `.jsonc`. Donde el código hace `Number(x) || 0` el tipo real es `number` y nunca `null`; donde hace `x || ''` es `string` y nunca `null`. Está anotado cuando difiere del declarado.
- **columna destino** puede ser: una columna real, `DERIVADO` (se calcula al leer), `NUEVA` (hay que crear la columna — el DDL está en §34), o `SE DESCARTA`.
- **transformación** es la operación exacta en las dos direcciones. `→` es escritura (Miguel al backend), `←` es lectura (backend a Miguel).

### 0.2 Las seis transformaciones estándar

Se nombran una vez aquí y se citan por su clave en las tablas.

| Clave | Escritura `→` | Lectura `←` | Por qué |
|---|---|---|---|
| **T-DINERO** | `desdeTexto(String(pesos))` → `bigint` de centavos | `Number(centavos) / 100` → `number` de pesos | R15. `packages/domain/src/dinero/formato.ts:41`. `Math.round(1.005*100)` da 100 y no 101; `desdeTexto` cuenta dígitos con `bigint` y ese error no existe |
| **T-FECHA** | `new Date(iso)` → `timestamptz` | `fecha.toISOString()` → `string` | Su código trata la fecha **como cadena**: `v.created_date?.startsWith(today)` (`CorteCaja.jsx:51`) y `(d.fecha \|\| d.created_date).slice(0,10)` (`Inventario.jsx:108`). Devolver un `Date` rompe las dos |
| **T-PORCENTAJE** | `Math.round(pct * 100)` → puntos base `integer` | `bp / 100` → `number` | `62.5 %` → `6250`. `0.16` no existe exacto en punto flotante; los puntos base sí |
| **T-CANTIDAD** | `String(number)` → `numeric(14,4)` | `Number(texto)` → `number` | Kysely devuelve `numeric` como cadena. Hacen falta fracciones de gramo |
| **T-ACTIVO** | `activo` (booleano de Miguel) → `activo` **o** `activa` según el género del sustantivo | idem a la inversa | El esquema nuevo concuerda en género: `activo` en `productos`/`insumos`/`clientes`, `activa` en `categorias`/`sucursales`/`terminales`. **`CategoriaProducto.activo` → `categorias.activa` es un cambio de nombre real**, no un descuido |
| **T-ENUM** | tabla de equivalencias explícita por campo | idem | Nunca por coincidencia de cadena |

### 0.3 Borrado suave — la regla y su única excepción

`F1-01` §3.8: *«Todo catálogo usa borrado suave, porque los registros históricos guardan snapshots del nombre.»*

El código legado hace **borrado físico en 10 sitios** (`Ingrediente`, `Mesa`, `MenuQRSeccion`, `SolicitudQR`, `RecetaEscandallo`, `CorteCaja`), pero dos de ellos están **guardados por una comprobación previa de historial**:

- `Inventario.jsx:147-153` — `eliminarIngrediente` consulta `MovimientoInventario.filter({ingrediente_id})` y **aborta si hay movimientos**. El botón vecino (`:140-145`) es el soft delete.
- `Configuracion.jsx:256-268` — `handleDeleteMesa` aborta si la mesa tiene `venta_activa_id` o un estado ocupado.

**Decisión del puente:** `delete(id)` sobre cualquier entidad de catálogo se traduce a `update set activo = false`. El borrado físico se intenta **sólo** cuando no hay filas que dependan, y en ese caso lo permite o lo rechaza la propia base: las llaves foráneas del esquema nuevo son `on delete restrict` hacia `insumos`, `productos` y `empleos`. La comprobación deja de vivir en el navegador.

**Excepción:** `SolicitudQR` y `MenuQRSeccion` sí se borran de verdad — no son catálogo, ningún registro histórico guarda un snapshot suyo, y `asignacionMesas.js:191-201` depende de poder purgarlas por día operativo.

> **No se usa `archivado_en`.** El enunciado de la tarea lo menciona como alternativa; el esquema existente **no tiene ninguna columna de ese nombre** (verificado: cero coincidencias en las 12 migraciones y en `esquema.ts`). Las 28 tablas usan booleano `activo`/`activa`. Introducir un `timestamptz` sólo para las 16 tablas nuevas partiría la convención en dos. **Se usa `activo`/`activa` en todas.**

### 0.4 Unidades base — sólo `g`, `ml`, `pieza`

`F1-01` §3.7. Verificado en `utils/unidadesMedida.js:15-19`:

```js
export const UNIDADES_BASE = [
  { value: 'g',  label: 'gramos (g)' },
  { value: 'ml', label: 'mililitros (ml)' },
  { value: 'pieza', label: 'pieza' },
];
```

Y duplicado como validación en `utils/importValidators.js:20`.

**Problema con el destino.** `insumos.unidad_base` acepta seis valores (`002_catalogo.sql` → `003:47`): `'pieza','kg','g','l','ml','m'`. Es más permisivo que la regla. Un insumo con `unidad_base = 'kg'` rompe todo el consumo del restaurante, que asume gramos.

**Decisión:** la restricción se estrecha en la base, no en el puente — §35.12. `insumos` de una organización con `paquete = 'restaurante'` sólo admite `g`, `ml`, `pieza`.

**Las 9 unidades de COMPRA** (`DEFAULT_UNIDADES_COMPRA`, `unidadesMedida.js:10-12`) son otra cosa y no se tocan: `kg, g, litro, ml, pieza, caja, paquete, bolsa, unidad`. `getUnidadesCompra()` (`:169-181`) **las re-fusiona siempre**, aunque el admin las borre — regla §3.7, respetada en §31.

Factores de conversión vivos (`unidadesMedida.js:133-144`): `kg`→`g` ×1000 · `litro`→`ml` ×1000 · `g`,`ml`,`pieza` ×1 · cualquier otra (`caja`, `paquete`, `bolsa`) × equivalencia capturada por el usuario. Coinciden con `packages/domain/src/catalogo/unidades.ts:6-13`, salvo que el dominio nuevo llama `l` a lo que él llama `litro` — lo resuelve `normalizarUnidad` (`:53`), que ya acepta `litro` como alias.

### 0.5 Los tres campos automáticos que su frontend lee SIEMPRE

`F1-01` §6 los declara. Este es su origen exacto.

| Campo | Tipo que él espera | De dónde sale | Comprobado en |
|---|---|---|---|
| `id` | `string` | La columna `id uuid` de la tabla destino, serializada como texto. Para entidades que son **vista o composición** (`UsuarioPOS`, `SesionCaja`, `DescuentoInventarioVenta`) es el `id` de la fila **ancla** que se declara en cada §. Nunca se sintetiza un id compuesto: su código lo usa como clave de React y como valor de llave foránea (`Caja.jsx:474`, `LiquidarPropinasDialog.jsx:120`, `UsuarioPOSDialog.jsx:194`) | 359 usos |
| `created_date` | **`string` ISO 8601** | `created_at.toISOString()` de la tabla ancla | Es el orden por omisión en **57 llamadas** `list('-created_date', N)`. Además es load-bearing como **valor**, no sólo como orden: `CorteCaja.jsx:51` hace `v.created_date?.startsWith(today)`, `Inventario.jsx:108` hace `.slice(0,10)`, y `Caja.jsx:140` lo usa como tercer respaldo del inicio de jornada (`fecha_apertura \|\| fecha_inicio \|\| created_date`). **Si el puente devuelve un objeto `Date`, esas tres se rompen en silencio** |
| `updated_date` | **`string` ISO 8601** | `updated_at.toISOString()`, que mantiene el trigger `tocar_updated_at()` (`001_plataforma.sql:246`) | Sólo **3 usos**, los tres sobre `ConfiguracionNegocio` y los tres como dependencia de `useEffect` para rehidratar formularios: `Configuracion.jsx:133`, `IdentidadNegocio.jsx:75`, `ColoresSistemaSection.jsx:35`. Si deja de cambiar, los formularios dejan de re-sincronizarse **sin error visible** |

**Consecuencia para las tablas sin `updated_at`.** `pagos`, `movimientos_caja`, `movimientos_stock`, `auditoria` y `orden_linea_modificadores` son **ledgers inmutables** y no tienen `updated_at` a propósito. Para las entidades que se apoyan en ellas, el puente devuelve `updated_date = created_date`. Ninguna de esas entidades está entre las tres que leen `updated_date`, así que no se pierde nada.

**Claves de ordenamiento que el puente debe soportar.** Extraídas de todas las llamadas reales: `-created_date` (57), `orden` (4), `-fecha_cierre` (4), `-fecha` (2), `-fecha_liquidacion` (1). Nada más.

---

## 1 · Las 27 entidades y su destino, de un vistazo

| # | Entidad de Miguel | Destino en el esquema nuevo | Estado |
|---|---|---|---|
| 1 | `Venta` | `ordenes` (+ `pagos` para dinero y propina) | Existe, **faltan 17 columnas** |
| 2 | `DetalleVenta` | `orden_lineas` (+ `orden_linea_modificadores`) | Existe, **faltan 7 columnas** |
| 3 | `Mesa` | `mesas` | **NO EXISTE — E3-1** |
| 4 | `Zona` | `zonas` | **NO EXISTE — E3-1.** Hoy es una constante, no una entidad |
| 5 | `PedidoPreparacion` | `comandas` + `comanda_items` | **NO EXISTEN — E3-1** |
| 6 | `EstacionPreparacion` | `estaciones_preparacion` | **NO EXISTE — E3-1** |
| 7 | `UsuarioPOS` | `personas` + `identidades` + `empleos` + `credenciales_pin` | Existen, **faltan 3 columnas** |
| 8 | `ConfiguracionNegocio` | `configuracion.valores` (jsonb) + `organizaciones` | Existe |
| 9 | `Ingrediente` | `insumos` + `existencias` | Existen, **faltan 11 columnas** |
| 10 | `ProductoTerminado` | `productos` | Existe, **faltan 6 columnas** |
| 11 | `CategoriaProducto` | `categorias` con `tipo='producto'` | Existe, **faltan 4 columnas** |
| 12 | `RecetaEscandallo` | `recetas` | Existe, **faltan 4 columnas** |
| 13 | `MovimientoInventario` | `movimientos_stock` | Existe. **`stock_anterior`/`stock_nuevo` se descartan a propósito** |
| 14 | `DescuentoInventarioVenta` | **VISTA** sobre `movimientos_stock` | **NO EXISTE la vista — E3-1** |
| 15 | `CorteCaja` | `sesiones_caja` (`cierre_diario`) **+** `cortes_turno` (`turno`) | Una existe, **la otra no — E3-1** |
| 16 | `SesionCaja` | `sesiones_caja` | Existe. **No es entidad suya**: es un `CorteCaja` con `estado='abierto'` |
| 17 | `Compra` (`CompraInsumo`) | `compras` | **NO EXISTE — E3-1** |
| 18 | `CompraLinea` (`DetalleCompra`) | `compra_lineas` | **NO EXISTE — E3-1** |
| 19 | `Proveedor` | `proveedores` | **NO EXISTE — E3-1** |
| 20 | `GastoOperativo` | `gastos` (+ `movimientos_caja` si es en efectivo) | **NO EXISTE — E3-1** |
| 21 | `PlantillaGasto` | `plantillas_gasto` | **NO EXISTE — E3-1** |
| 22 | `PlantillaCompra` | `plantillas_compra` | **NO EXISTE — E3-1** |
| 23 | `SolicitudQR` | `solicitudes_qr` | **NO EXISTE — E3-1** |
| 24 | `MenuQRSeccion` | `menu_qr_secciones` | **NO EXISTE — E3-1** |
| 25 | `LiquidacionPropina` | `liquidaciones_propina` | **NO EXISTE — E3-1** |
| 26 | `UnidadMedida` | `configuracion.valores.unidades.compra` (arreglo jsonb) | Existe. **No es entidad suya**: es un campo de texto separado por comas |
| 27 | `IntegrationSyncLog` | `bitacora_sincronizacion` | **NO EXISTE — E3-1** |
| — | `CategoriaIngrediente` | `categorias` con `tipo='insumo'` | Existe. **Entidad zombi** — ver §33 |

**16 tablas nuevas · 1 vista nueva · 8 tablas existentes con columnas nuevas.**

Tres nombres de la lista de 27 **no son entidades de Base44**: `Zona`, `SesionCaja` y `UnidadMedida`. No hay `Zona.jsonc`, ni `SesionCaja.jsonc`, ni `UnidadMedida.jsonc`, y `grep "entities.Zona\|entities.SesionCaja\|entities.UnidadMedida"` sobre los 244 archivos devuelve cero. Están en la lista porque son **conceptos** que el sistema maneja, y el mapa tiene que decir dónde viven. Se documentan igual, en §9, §21 y §31.

Las entidades reales de Base44 son **25**, no 27: las 24 de la lista que sí existen, más `CategoriaIngrediente`, que la lista de 27 no menciona.

---

## 2 · Reglas de negocio que este mapa no puede romper

Se anotan aquí y se repiten **en el sitio donde aplican**, para que nadie las lea sólo una vez.

| Regla (`F1-01` §3) | Dónde se hace cumplir en este mapa |
|---|---|
| **1. `Venta.total` es la venta SIN propina** | §6. `ordenes.total_centavos` **nunca** incluye propina. La propina vive en `pagos.propina_centavos`, en otra tabla. La regla deja de depender de que nadie sume mal: es **estructuralmente imposible** inflar el total con una propina |
| **2. Las propinas no entran en ventas, utilidad, costos, inventario, recetas ni margen** | §6 y §20. `calcularTotales` (`packages/domain/src/venta/totales.ts:59`) no recibe propinas. `movimientos_stock` no las conoce |
| **3. El desglose de propinas por método es EXACTO, nunca proporcional** | §6.1. Cada fila de `pagos` lleva `metodo` **y** `propina_centavos`. El desglose es un `group by metodo`. **El fallback de `desgloseMetodosPagoExacto` deja de existir**, porque deja de existir la venta sin desglose |
| **4. `efectivo_esperado` = ventas en efectivo + propinas en efectivo** | §20.4. Se deriva de `movimientos_caja`. **Exige que `cobrarOrden` registre un movimiento `tipo='propina'`, que hoy no registra** — ver §38.2 |
| **5. El inventario se descuenta SÓLO al cobrar** | §18 y §19. `movimientos_stock` con `referencia_tipo='orden'` los escribe únicamente `cobrarOrden`. `comandas` no toca stock |
| **6. Un producto de precio fijo sin receta NO bloquea el cobro** | §15. `productos.estrategia_consumo='ninguno'` es un valor legítimo, no un error |
| **7. Las unidades base son sólo `g`, `ml`, `pieza`** | §0.4 y §35.12 |
| **8. Borrado suave en todo catálogo** | §0.3 |
| **9. Cocina nunca ve costos, márgenes ni gramajes** | §36. La lista blanca del rol `cocina` excluye toda columna terminada en `_centavos`, `_bp` y la cantidad de receta |
| **10. La estación «Cocina general» (`es_general`) es el fallback obligatorio y no se puede desactivar** | §11 y §35.8 |
| **11. Los campos de snapshot de `DetalleVenta` son el contrato de trazabilidad** | §7. Los **24**, uno por uno, con su destino |
| **12. Los modificadores son informativos** | §7.4 y §15. **Cambia a propósito** (`F1-01` §7.1): `orden_linea_modificadores.precio_extra_centavos` ya existe y sí entra al total |

---

## 3 · Convenciones del DDL que sigue §34

Extraídas de `001_plataforma.sql:12-19` y verificadas contra las 12 migraciones aplicadas. Toda tabla nueva las cumple.

1. `snake_case` plural en español.
2. `id uuid primary key default gen_random_uuid()`.
3. Toda tabla operativa lleva `organizacion_id uuid not null`, y **todo índice compuesto la pone primero**.
4. Dinero en `bigint`, nombre terminado en `_centavos`.
5. Cantidades de inventario en `numeric(14,4)`.
6. Enumerados como `text` con `check`, **nunca** tipos `enum` de Postgres — agregar un valor a un `enum` en producción bloquea la tabla.
7. `created_at` y `updated_at timestamptz not null default now()`, con trigger `tocar_updated_at`.
8. **Llave foránea compuesta `(id, organizacion_id)`** hacia todo padre que tenga organización (`004_integridad_multi_inquilino.sql`). La llave simple **no se retira**.
9. `on delete set null (columna)` — sintaxis de Postgres 15+ — donde el padre se pueda borrar. El `set null` clásico anularía también `organizacion_id`, que es `not null`, y el borrado fallaría.
10. Cada padre nuevo publica `unique (id, organizacion_id)` para poder ser destino de una llave compuesta.

---

## 4 · Lo que el puente devuelve y lo que no acepta

Tres invariantes que afectan a todas las entidades.

- **`organizacion_id` nunca viaja del cliente al servidor.** Sale del ámbito de la sesión. Si el cliente lo manda, se ignora. Ninguna tabla de este mapa lo expone como campo de Miguel.
- **Ningún importe que venga del cliente decide un precio.** `ordenes` y `orden_lineas` reciben producto, cantidad y unidad; el servidor recalcula (`packages/app/src/venta/cotizar.ts`). Los campos de dinero de `Venta` y `DetalleVenta` son de **lectura** para el frontend; en escritura se ignoran. Esto atiende el riesgo de `F1-01` §9: si difieren, el servidor gana y devuelve el correcto con un código de error, **nunca cobra en silencio**.
- **Límite máximo de filas por consulta.** `Caja.jsx:229` pide `Venta.list('-created_date', 5000)` sólo para buscar un folio. El puente lo topa y `F1-01` §6 ya define el reemplazo: `GET /ventas/buscar?q=`.

---

## 5 · Campos del backend que Miguel no conoce

Se rellenan solos y **no se exponen** en la forma de ninguna entidad suya. Se listan una vez aquí en vez de repetirlos en 27 tablas.

| Columna | Quién la rellena | Por qué él no la ve |
|---|---|---|
| `organizacion_id` | El ámbito de la sesión | Su sistema es mono-negocio. Ver una organización sería enseñarle una palanca que no debe tocar |
| `sucursal_id` | El ámbito de la sesión | Mono-sucursal en Fase 1 (A-25). `Venta.jsonc` no declara ningún campo de sucursal — verificado |
| `terminal_id` | El dispositivo, generado al primer acceso (`F1-02` §8, trampa T6) | Es dato de auditoría, no una puerta |
| `created_at` / `updated_at` | `default now()` y el trigger `tocar_updated_at` | Se exponen renombrados como `created_date` / `updated_date` (§0.5) |
| `idempotency_key` | `api.comandos.*` la genera y la conserva mientras el diálogo esté abierto (trampa T5) | Corrige el doble cobro por doble clic. Invisible por diseño |
| `version` (en `ordenes` y `configuracion`) | Concurrencia optimista | Su código no tiene el concepto |
| `correlation_id` | El envoltorio `comando()` | Trazabilidad |
| `serie` | La estrategia de captura (§6.2) | Él ve el folio ya compuesto |
| `margen_bp`, `utilidad_unitaria_centavos` en `productos` | **Columnas generadas** (`041_recetas_y_costeo.sql:2-12`) | Se leen traducidas a porcentaje y a pesos |
| `estrategia_captura`, `estrategia_cumplimiento` | El puente, según el canal (§6.5) | Es el eje del modelo genérico que la Fase 2 necesita. Él sólo ve `tipo_venta` |
| `auditoria.*` | El envoltorio `comando()` | Su sistema no tiene auditoría |

---

## 6 · `Venta` → `ordenes` (+ `pagos`)

**Tabla ancla:** `ordenes`. `Venta.id` = `ordenes.id`.
**Tabla satélite:** `pagos` — una fila por método de pago. Un pago mixto son varias filas.

`Venta.jsonc` declara **50 propiedades**. Ninguna se escribe fuera de esquema.

### 6.1 El corazón: por qué `total` y la propina viven en tablas distintas

Es la traducción más delicada del documento, y la que hace cumplir las reglas 1, 2 y 3 de `F1-01` §3 **por construcción**.

En el sistema de Miguel el dinero de una venta son **once columnas de la misma fila**: `total`, `propina_monto`, `propina_efectivo`, `propina_tarjeta`, `propina_transferencia`, `total_cobrado_con_propina`, `metodo_pago`, `monto_efectivo`, `monto_tarjeta`, `monto_transferencia`, `cambio`. Que `total` no se infle con la propina depende de que **nadie escriba mal ninguna de las once**, en los cuatro archivos que las tocan.

En el esquema nuevo `ordenes` **no tiene ninguna columna de propina ni de método de pago**. Todo eso es `pagos`:

```
pagos(orden_id, metodo, monto_centavos, propina_centavos, recibido_centavos, cambio_centavos)
```

`ordenes.total_centavos` es la venta y nada más. **No hay forma de inflarlo con una propina**, porque la propina no cabe en esa tabla.

**El detalle que hay que acertar, y es fácil de fallar:** `monto_efectivo` de Miguel **YA INCLUYE la propina cobrada en efectivo**. Está dicho literalmente en `tipsUtils.js:139-140` y se comprueba en `Caja.jsx:435-437` y `PaymentModal.jsx:46-48`. En cambio `pagos.monto_centavos` **excluye** la propina, porque `repartirPagos` (`packages/app/src/venta/pagos.ts:88`) exige que los pagos sumen **exactamente** `total_centavos`. Traducirlo de más o de menos descuadra el arqueo por el importe de las propinas.

```
Venta.monto_efectivo            <-  suma(pagos.monto_centavos + pagos.propina_centavos) donde metodo='efectivo'
Venta.propina_efectivo          <-  suma(pagos.propina_centavos)                        donde metodo='efectivo'
Venta.total                     <-  ordenes.total_centavos            (jamás una suma de pagos)
Venta.total_cobrado_con_propina <-  ordenes.total_centavos + suma(pagos.propina_centavos)
```

Y el desglose exacto que pide `F1-01` §3.3 se vuelve un `group by`:

```sql
select metodo,
       sum(monto_centavos)   as ventas_centavos,
       sum(propina_centavos) as propinas_centavos
  from pagos
 where orden_id = $1 and estado = 'confirmado'
 group by metodo;
```

**Consecuencia buscada:** `desgloseMetodosPagoExacto` (`tipsUtils.js:92-155`) y sus 45 líneas de respaldo para ventas antiguas **dejan de tener causa**. `F1-01` §4 dice que las cicatrices se quitan «cuando la causa que las originó ya no puede ocurrir, y sólo entonces». Ésta ya no puede ocurrir: no existe una fila de `pagos` sin `metodo`.

### 6.2 `folio` — el cambio visible, y por qué

`Venta.folio` es `string` con formato `PREFIJO-AAAAMMDD-XXXX` (`financialUtils.js:59-65`), donde `XXXX` son cuatro caracteres base36 aleatorios. Prefijos reales: `V` para mostrador (`POS.jsx:220`), `M` más el número de mesa (`Mesero.jsx:290`), y un formato distinto generado aparte para el QR (`qrPedidoFlow.js:82`).

Es el defecto **D-20**, y es peor de lo reportado: `generateFolio` calcula `timeStr` en la línea 62 **y no lo usa**. La unicidad depende sólo de 36⁴ ≈ 1.68 M combinaciones por día, generadas en el navegador y sin comprobación contra la base.

El destino son **dos columnas**: `ordenes.serie text check (serie ~ '^[A-Z]{1,6}$')` y `ordenes.folio bigint`, con el consecutivo tomado por `tomarFolio` (`packages/data/src/repos/folios.ts:38`) mediante `update ... returning` **dentro** de la transacción del cobro.

| Canal | `estrategia_captura` | `serie` | Folio que él ve |
|---|---|---|---|
| POS mostrador | `mostrador` | `V` | `V-000042` |
| Mesero / mesa | `mesa` | `M` | `M-000042` |
| Portal QR | `qr` | `Q` | `Q-000042` |

```
Venta.folio  <-  serie || '-' || lpad(folio::text, 6, '0')
```

**Esto es un cambio que Miguel ve.** El folio pasa de `M5-20260909-K3F2` a `M-000042`.
Se gana: unicidad real, consecutivo sin huecos, y un número que se puede dictar por teléfono.
Se pierde: el número de mesa dentro del folio. **No se pierde el dato** — sigue en `Venta.mesa_numero`, que es lo que la interfaz enseña de todas formas (`Caja.jsx:1312`).

La serie por mesa **no es posible**: `folios.serie` exige `^[A-Z]{1,6}$` y `M5` lleva un dígito. Se documenta como decisión, no como omisión.

### 6.3 `codigo_caja` no es un identificador de terminal

El nombre engaña. `codigo_caja` es **el código que el comensal lleva a la caja** para que el cajero encuentre su cuenta: `M05-4821`, generado en `Mesero.jsx:59-60` y escrito **sólo** en `Mesero.jsx:858`. Las ventas de mostrador y de QR lo tienen siempre vacío. Se busca por él en `Caja.jsx:245` y se imprime en `PreCuentaTicket.jsx:132-141`. Necesita columna propia y no tiene nada que ver con `terminales`.

### 6.4 Tabla de campos — `Venta`, 50 campos

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `ordenes.id` | `uuid` | directo |
| `created_date` | `string` ISO | `ordenes.created_at` | `timestamptz` | **T-FECHA** |
| `updated_date` | `string` ISO | `ordenes.updated_at` | `timestamptz` | **T-FECHA** |
| `folio` | `string` | `ordenes.serie` + `ordenes.folio` | `text` + `bigint` | §6.2. Al leer compone; al escribir **se ignora**, lo asigna `tomarFolio` |
| `fecha_apertura` | `string` ISO | `ordenes.created_at` | `timestamptz` | **T-FECHA**. Es el mismo instante: `Mesero.jsx:301` lo escribe junto con el `create` |
| `fecha_cierre` | `string` ISO | **NUEVA** `ordenes.cerrada_en` | `timestamptz` | **T-FECHA**. No hay columna equivalente; `cancelada_en` existe pero es sólo de cancelación |
| `tipo_venta` | `mesa`\|`mostrador`\|`para_llevar`\|`delivery` | `estrategia_captura` + `estrategia_cumplimiento` | `text` + `text` | **T-ENUM**, §6.5 |
| `mesa_id` | `string` | **NUEVA** `ordenes.mesa_id` | `uuid` | FK a `mesas`, `on delete set null (mesa_id)` |
| `mesa_numero` | `number` | `DERIVADO` | — | por `join` con `mesas.numero`. Ver la nota al pie |
| `personas` | `number` | **NUEVA** `ordenes.personas` | `integer` | `default 0` |
| `cliente_nombre` | `string` | **NUEVA** `ordenes.cliente_nombre` | `text` | Texto libre del mesero, **no** un cliente del catálogo |
| `cliente_id` | `string` | `ordenes.cliente_id` | `uuid` | **CAMPO MUERTO.** Cero referencias en los 244 archivos. La columna ya existe; el puente lo expone siempre `null` |
| `notas_alergias` | `string` | **NUEVA** `ordenes.notas_alergias` | `text` | Snapshot tomado al abrir la mesa |
| `celebracion_especial` | `boolean` | **NUEVA** `ordenes.celebracion_especial` | `boolean` | `default false` |
| `tipo_celebracion` | `string` | **NUEVA** `ordenes.tipo_celebracion` | `text` | |
| `codigo_caja` | `string` | **NUEVA** `ordenes.codigo_caja` | `text` | §6.3 |
| `usuario_mesero_id` | `string` | `ordenes.empleado_atiende_id` | `uuid` | FK a `empleos` |
| `usuario_mesero_nombre` | `string` | `DERIVADO` | — | `join` a `personas.nombre` vía `empleos`. **No se guarda snapshot**: `empleos` es `on delete restrict`, la persona no desaparece |
| `usuario_cajero_id` | `string` | `ordenes.empleado_cobra_id` | `uuid` | FK a `empleos` |
| `usuario_cajero_nombre` | `string` | `DERIVADO` | — | igual que el anterior |
| `estado` | 7 valores | `ordenes.estado` | `text` | **T-ENUM**, §6.6 |
| `subtotal` | `number` pesos | `ordenes.subtotal_centavos` | `bigint` | **T-DINERO** |
| `descuentos` | `number` pesos | `ordenes.descuento_centavos` | `bigint` | **T-DINERO**. **Nunca se escribe** en su código; sólo se lee en `PreCuentaTicket.jsx:99` |
| `impuestos` | `number` pesos | `ordenes.impuestos_centavos` | `bigint` | **T-DINERO**. **Nunca se escribe**; sólo se lee en `PreCuentaTicket.jsx:100` |
| **`total`** | `number` pesos | **`ordenes.total_centavos`** | `bigint` | **T-DINERO**. **REGLA 1: la venta SIN propina.** Nunca sumar `pagos.propina_centavos` aquí |
| `propina_monto` | `number` pesos | `DERIVADO` | — | suma de `pagos.propina_centavos` entre 100 |
| `propina_efectivo` | `number` pesos | `DERIVADO` | — | suma de `propina_centavos` donde `metodo='efectivo'`. **REGLA 3: exacto, nunca proporcional** |
| `propina_tarjeta` | `number` pesos | `DERIVADO` | — | igual con `metodo='tarjeta'` |
| `propina_transferencia` | `number` pesos | `DERIVADO` | — | igual con `metodo='transferencia'` |
| `total_cobrado_con_propina` | `number` pesos | `DERIVADO` | — | `total_centavos` más la suma de propinas. **Campo aparte de `total`, jamás su sustituto.** Hoy sólo lo escribe Caja (`Caja.jsx:581`) y nunca POS; al derivarlo, las ventas de mostrador dejan de tenerlo vacío |
| `propina_porcentaje` | `number` | **NUEVA** `ordenes.propina_puntos_base` | `integer` | **T-PORCENTAJE** |
| `propina_tipo` | 6 valores | **NUEVA** `ordenes.propina_tipo` | `text` | mismos valores, `check` explícito |
| `propina_origen` | 5 valores | **NUEVA** `ordenes.propina_origen` | `text` | mismos valores, `check` explícito |
| `propina_liquidada` | `boolean` | `DERIVADO` | — | `propina_liquidacion_id is not null`. No se guarda un booleano que puede desincronizarse del puntero, y hoy **se desincroniza de verdad**: `LiquidarPropinasDialog.jsx:122` se traga los errores del `update` |
| `propina_liquidacion_id` | `string` | **NUEVA** `ordenes.propina_liquidacion_id` | `uuid` | FK a `liquidaciones_propina` |
| `propina_liquidada_fecha` | `string` ISO | **NUEVA** `ordenes.propina_liquidada_en` | `timestamptz` | **T-FECHA** |
| `costo_total_snapshot` | `number` pesos | `ordenes.costo_total_centavos` | `bigint` | **T-DINERO** |
| `utilidad_bruta_snapshot` | `number` pesos | `ordenes.utilidad_centavos` | `bigint` | **T-DINERO** |
| `margen_snapshot` | `number` % | `ordenes.margen_bp` | `integer` | **T-PORCENTAJE** |
| `metodo_pago` | `efectivo`\|`tarjeta`\|`transferencia`\|`mixto` | `DERIVADO` | — | un solo `metodo` distinto en `pagos` da ese; dos o más dan `mixto`; sin pagos da `null` |
| `monto_efectivo` | `number` pesos | `DERIVADO` | — | suma de `monto_centavos + propina_centavos` donde `metodo='efectivo'`. **Incluye la propina** (§6.1) |
| `monto_tarjeta` | `number` pesos | `DERIVADO` | — | igual con `tarjeta` |
| `monto_transferencia` | `number` pesos | `DERIVADO` | — | igual con `transferencia` |
| `cambio` | `number` pesos | `DERIVADO` | — | suma de `pagos.cambio_centavos`. La base ya impide cambio fuera de efectivo (`check pago_cambio_solo_en_efectivo`) |
| `notas` | `string` | `ordenes.notas` | `text` | directo |
| `motivo_cancelacion` | `string` | `ordenes.motivo_cancelacion` | `text` | directo. `check orden_cancelada_con_motivo` exige que **también** se escriban `cancelada_en` y `cancelada_por`; el puente los rellena desde `fecha_cierre` y la sesión |
| `corte_caja_id` | `string` \| `null` | `ordenes.sesion_caja_id` | `uuid` | FK a `sesiones_caja`. Su código escribe `null` en un campo declarado `string` (`POS.jsx:247`); el puente devuelve `null`, no cadena vacía |
| `satisfaccion_score` | `number` 1-5 | **NUEVA** `ordenes.satisfaccion_score` | `smallint` | `check between 1 and 5` |
| `satisfaccion_emoji` | `string` | **NUEVA** `ordenes.satisfaccion_emoji` | `text` | |
| `satisfaccion_label` | `string` | `DERIVADO` | — | Tabla fija de cinco etiquetas por `score`. Guardar la etiqueta y el número es guardar el mismo dato dos veces |
| `satisfaccion_comentario` | `string` | **NUEVA** `ordenes.satisfaccion_comentario` | `text` | **No se imprime en ticket ni PDF** (`Venta.jsonc:191`). La lista blanca del §36 lo reserva al administrador |
| `satisfaccion_fecha` | `string` ISO | **NUEVA** `ordenes.satisfaccion_en` | `timestamptz` | **T-FECHA** |
| `satisfaccion_origen` | `string` | `DERIVADO` | — | Siempre `portal_qr` en v1 (`Venta.jsonc:196`). Constante, no columna |

**Nota sobre `mesa_numero`.** Se deriva por `join`, no se copia. Riesgo asumido: si alguien renumera la mesa 5 como 7, un ticket viejo pasará a decir 7. Se acepta porque el número de mesa **no es dinero ni identidad de producto**, y porque `mesas` usa borrado suave: la mesa no desaparece. Si se decide que debe ser snapshot, la columna es `ordenes.mesa_numero smallint` y el coste es una columna. **Queda como decisión abierta en §38.1.**

### 6.5 `tipo_venta` se abre en dos ejes

Su `tipo_venta` mezcla **por dónde entró** la venta con **cómo se entrega**. El esquema nuevo los separa a propósito: es lo que permite que la Fase 2 tenga citas y comercio en línea sin reescribir el núcleo.

| `Venta.tipo_venta` | `estrategia_captura` | `estrategia_cumplimiento` | Verificado en |
|---|---|---|---|
| `mostrador` | `mostrador` | `inmediato` | `POS.jsx:233` |
| `mesa` | `mesa` | `preparacion` | `Mesero.jsx:292` |
| `para_llevar` | `mostrador` | `retiro` | Declarado; **ningún `create` lo escribe** |
| `delivery` | `mostrador` | `envio` | Declarado; **ningún `create` lo escribe** |
| apertura desde QR | `qr` | `preparacion` | `qrPedidoFlow.js:94` escribe `tipo_venta:'mesa'`; el puente los distingue por `estrategia_captura` |

Lectura inversa: `captura in ('mesa','qr')` da `mesa`; `cumplimiento='retiro'` da `para_llevar`; `envio` da `delivery`; cualquier otro caso da `mostrador`.

### 6.6 `estado`, y una colisión de índice que hay que resolver

| `Venta.estado` | `ordenes.estado` | ¿Se escribe en su código? |
|---|---|---|
| `abierta` | `borrador` | Sí — `Mesero.jsx:292`, `qrPedidoFlow.js:94` |
| `enviada` | `confirmada` | Sí — `Mesero.jsx:573`, `qrPedidoFlow.js:353` |
| `en_preparacion` | `en_preparacion` | **NO.** Declarado en el enum, jamás asignado a una `Venta` |
| `lista` | `lista` | **NO.** Igual |
| `cuenta_solicitada` | `cuenta_solicitada` | Sí — `Mesero.jsx:857`, `PedirCuentaQR.jsx:286` |
| `pagada` | `pagada` | Sí — `POS.jsx:235`, `Caja.jsx:571` |
| `cancelada` | `cancelada` | Sí — `Caja.jsx:374`, `qrPedidoFlow.js:123` |

`en_preparacion` y `lista` existen sólo como código defensivo: los arrays `ESTADOS_VENTA_ACTIVA` de `qrPedidoFlow.js:20-25` y `entregaPedidos.js:46` los incluyen. **Se conservan en el `check`** — el ciclo de preparación real vive en `comandas.estado`, y quitarlos rompería esos dos arrays sin ganar nada.

#### Colisión real: `ordenes_borrador_por_terminal`

`003_venta_caja_inventario.sql:183-185` declara:

```sql
create unique index ordenes_borrador_por_terminal
  on ordenes (terminal_id)
  where estado = 'borrador' and terminal_id is not null;
```

Su razón es correcta para mostrador: el borrador **es** el carrito, y dos carritos en una terminal significan que el cajero ve uno y cobra el otro.

**Pero un restaurante tiene ocho mesas abiertas a la vez, y cada mesa abierta es una `Venta` en estado `abierta`, o sea `borrador`.** Con `terminal_id` puesto, la segunda mesa que se abra revienta con violación de unicidad. **Es un bloqueo total del flujo de mesero, y no está reportado en `F1-01`.**

**Corrección (§35.9):** estrechar el índice con `and estrategia_captura = 'mostrador'`. El carrito de mostrador sigue siendo único por terminal; las mesas y el QR quedan libres. La alternativa —dejar `terminal_id` nulo en las mesas— se descarta: perdería la trazabilidad de qué dispositivo abrió la mesa, que es justo para lo que sirve `terminal_id` según la trampa T6.

### 6.7 Campos de `Venta` sin destino propio

| Campo | Qué se hace | Por qué |
|---|---|---|
| `cliente_id` | Se conserva la columna, siempre `null` | `ordenes.cliente_id` ya existe y la Fase 2 la usará. Pero tiene **cero referencias** en los 244 archivos |
| `satisfaccion_label` | Se deriva | Es `satisfaccion_score` escrito con letra |
| `satisfaccion_origen` | Se descarta como columna | Constante `portal_qr` en v1, declarado así en su propio esquema |
| `propina_liquidada` | Se deriva | Duplica «el puntero no es nulo» y hoy se desincroniza |
| `descuentos`, `impuestos` | Se conservan las columnas | Nunca escritos hoy, pero `PreCuentaTicket.jsx:99-100` los renderiza y la Fase 1 sí calcula IVA en `calcularTotales` |

---

## 7 · `DetalleVenta` → `orden_lineas` (+ `orden_linea_modificadores`)

**Tabla ancla:** `orden_lineas`. `DetalleVenta.id` = `orden_lineas.id`.

Esta es la regla 11 de `F1-01` §3, y la que exige más cuidado: *«un ticket de hace seis meses debe seguir imprimiéndose aunque el producto haya cambiado de precio o desaparecido»*.

### 7.1 Cuántos campos son de verdad

`F1-01` §3.11 y §9 dicen **26**. La cifra no sale del código. Lo verificado, con línea:

| Métrica | Valor |
|---|---|
| Propiedades declaradas en `DetalleVenta.jsonc:5-101` | **24** |
| Campos escritos por `Mesero.jsx:523-539` (14 base + 9 variables) | 23 |
| Campos escritos por `POS.jsx:271-298` (13 base + 10 variables) | 23 |
| Campos escritos por `qrPedidoFlow.js:318-335` | 23 |
| Campos escritos por `Caja.jsx:675-681` (`update` al cobrar) | 5 |
| **Unión de los cuatro** | **24 — idéntica al esquema** |
| Campos escritos fuera del esquema | **0** |

Hay **tres** puntos de `create` en todo el sistema, no uno. Y difieren:

- **`POS.jsx:271-285` no escribe `modificadores_snapshot`**, que sí escriben Mesero (`:535`) y QR (`:330`). Es una asimetría real entre canales de venta, no un descuido de lectura.
- **`POS.jsx:297` es el único `create` que escribe `cantidad_base_consumo`.** Mesero y QR lo dejan para el cobro — comentario explícito en `Mesero.jsx:514`: *«se llena en el cobro»*. Lo persiste `Caja.jsx:675-681`.

**El mapa usa 24.** Si aparece un vigésimo quinto campo, es que el `.jsonc` cambió después del ZIP y hay que releerlo.

### 7.2 Los 24 campos, uno por uno, y dónde va cada uno

| # | campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|---|
| 1 | `venta_id` | `string` | `orden_lineas.orden_id` | `uuid` | directo. FK compuesta a `ordenes(id, organizacion_id)` |
| 2 | `producto_id` | `string` | `orden_lineas.producto_id` | `uuid` | `on delete set null (producto_id)`. **El producto puede desaparecer y la línea sobrevive** — eso es el contrato |
| 3 | `producto_nombre` | `string` | `orden_lineas.producto_nombre` | `text` | **SNAPSHOT.** `not null`. Es lo que se imprime, no el nombre actual del producto |
| 4 | `cantidad` | `number` | `orden_lineas.cantidad` | `numeric(14,4)` | **T-CANTIDAD**. `check (cantidad > 0)` |
| 5 | `precio_unitario_snapshot` | `number` pesos | `orden_lineas.precio_unitario_centavos` | `bigint` | **T-DINERO**. SNAPSHOT |
| 6 | `costo_unitario_snapshot` | `number` pesos | `orden_lineas.costo_unitario_centavos` | `bigint` | **T-DINERO**. SNAPSHOT |
| 7 | `subtotal` | `number` pesos | `orden_lineas.subtotal_centavos` | `bigint` | **T-DINERO** |
| 8 | `costo_total_linea_snapshot` | `number` pesos | `DERIVADO` | — | `(total_centavos − utilidad_centavos) / 100`. Ver la nota de §7.3 |
| 9 | `utilidad_linea_snapshot` | `number` pesos | `orden_lineas.utilidad_centavos` | `bigint` | **T-DINERO** |
| 10 | `margen_linea_snapshot` | `number` % | `DERIVADO` | — | `utilidad_centavos * 10000 / total_centavos`, luego **T-PORCENTAJE**. Cero si `total_centavos = 0` |
| 11 | `notas_producto` | `string` | `orden_lineas.notas` | `text` | directo |
| 12 | `modificadores_snapshot` | **`string` con JSON** | `orden_linea_modificadores` (**filas**) | tabla | §7.4 |
| 13 | `estado_preparacion` | 5 valores | **NUEVA** `orden_lineas.estado_preparacion` | `text` | **T-ENUM** directo. §7.5 |
| 14 | `area_preparacion_snapshot` | `string` | **NUEVA** `orden_lineas.area_preparacion_snapshot` | `text` | SNAPSHOT. Valores observados: `cocina`, `barra`, `ambos`, `ninguno` |
| 15 | `tipo_venta_snapshot` | `precio_fijo`\|`variable_medida`\|`porcion_contenedor` | `orden_lineas.tipo_venta` | `text` | **T-ENUM** directo. El destino admite además `servicio`, que él no usa |
| 16 | `unidad_variable_snapshot` | `g`\|`kg`\|`ml`\|`l` | `orden_lineas.unidad_variable` | `text` | directo |
| 17 | `cantidad_variable_snapshot` | `number` | `orden_lineas.cantidad_variable` | `numeric(14,4)` | **T-CANTIDAD** |
| 18 | `cantidad_base_consumo` | `number` | **NUEVA** `orden_lineas.cantidad_base_consumo` | `numeric(14,4)` | **T-CANTIDAD**. §7.6 |
| 19 | `ingrediente_base_id_snapshot` | `string` | **NUEVA** `orden_lineas.insumo_base_id` | `uuid` | `on delete set null (insumo_base_id)` |
| 20 | `ingrediente_base_nombre_snapshot` | `string` | **NUEVA** `orden_lineas.insumo_base_nombre` | `text` | **SNAPSHOT.** Es lo que hace que el ticket siga diciendo «Barbacoa» si el insumo se renombra |
| 21 | `precio_por_unidad_snapshot` | `number` pesos | **NUEVA** `orden_lineas.precio_por_unidad_centavos` | `bigint` | **T-DINERO**. Precio por unidad variable **o** por porción, según `tipo_venta` |
| 22 | `nombre_porcion_snapshot` | `string` | `orden_lineas.nombre_porcion` | `text` | SNAPSHOT |
| 23 | `ml_por_porcion_snapshot` | `number` | **NUEVA** `orden_lineas.ml_por_porcion` | `numeric(14,4)` | **T-CANTIDAD** |
| 24 | `cantidad_porciones_snapshot` | `number` | `orden_lineas.cantidad_porciones` | `numeric(14,4)` | **T-CANTIDAD** |

**Recuento del destino:** 14 caen en columnas que ya existen · 3 se derivan · **7 columnas nuevas**. El DDL está en §34.2.

Además, tres campos automáticos: `id` = `orden_lineas.id`, `created_date` = `created_at`, `updated_date` = `updated_at`.

Y dos columnas del destino que él no conoce y que se rellenan solas: `sku` y `codigo_barras` (snapshots que sirven al escáner de la tiendita, `F1-01` §7.2), `es_mayoreo`, `descuento_centavos` y `orden_visual`.

### 7.3 Por qué `costo_total_linea_snapshot` se deriva y no se guarda

`orden_lineas` guarda `total_centavos` y `utilidad_centavos`. Por definición `utilidad = total − costo`, así que `costo = total − utilidad` es **exacto**, sin redondeo intermedio.

La alternativa es una columna `costo_total_centavos`. Se descarta por el mismo motivo por el que `movimientos_stock` no tiene `stock_anterior`: **guardar un dato derivable es crear la posibilidad de que discrepe.**

**El invariante que la escritura debe mantener** es explícito: quien escribe `orden_lineas` calcula `utilidad_centavos = total_centavos − costo_total`. Si alguien lo cambia, esta derivación miente. Se cierra con un contrato estático (`contratos-por-mutacion`), no con un comentario.

### 7.4 `modificadores_snapshot` — de cadena JSON a filas, y de vuelta

Hoy es un `string` que contiene el JSON de `[{grupo_nombre, opciones:[...]}]` (`Mesero.jsx:535`), o cadena vacía. `DetalleVenta.jsonc:60` lo declara *«Solo informativo, no afecta precio/costo/inventario en v1»* — la regla 12 de `F1-01` §3.

**El destino existe y es mejor:** `orden_linea_modificadores` (`003_venta_caja_inventario.sql:230-241`), una fila por opción elegida, con `modificador_nombre`, `opcion_nombre` y **`precio_extra_centavos`**.

```
DetalleVenta.modificadores_snapshot
  <-  JSON.stringify( agrupar por modificador_nombre las filas de
                      orden_linea_modificadores where orden_linea_id = $1 )
  ->  una fila por opción; el precio lo pone el CATÁLOGO, nunca el cliente
```

Esto es el cambio deliberado de `F1-01` §7.1: **los modificadores dejan de ser sólo informativos.** La tabla ya guarda el nombre y el precio **copiados en la propia fila**, así que un extra de queso sigue diciendo «queso · $12» en un ticket de hace seis meses aunque el modificador se haya borrado del catálogo. Los punteros `modificador_id` y `opcion_id` son `on delete set null`: sirven para rastrear procedencia, no para cobrar.

**Consecuencia sobre el total:** al entrar `precio_extra_centavos` al cálculo, `subtotal_centavos` de la línea deja de coincidir con `precio_unitario × cantidad`. Es lo esperado y lo pide `F1-01` §7.1. Quien porte `PreCuentaTicket` debe leer el subtotal, no recalcularlo.

### 7.5 `estado_preparacion` — por qué va en la línea y no en la comanda

`DetalleVenta.estado_preparacion` y `comanda_items.estado` parecen el mismo dato. No lo son:

- La **línea de venta** es lo que se cobra y lo que se imprime en el ticket. Su estado sobrevive al cierre del pedido.
- El **item de comanda** es lo que la cocina ve; una línea puede generar dos items si el producto tiene `area_preparacion = 'ambos'` (`POS.jsx:396` duplica el pedido en cocina y barra).

Por eso `estado_preparacion` va en `orden_lineas` y `comanda_items.estado` lo refleja. Si sólo viviera en la comanda, una línea con dos items tendría dos estados y ninguno sería «el» estado de la línea.

> **Incoherencia heredada que el mapa normaliza.** `items[].estado` vale `'pendiente'` desde Mesero (`Mesero.jsx:595`) y QR, pero `'nuevo'` desde POS (`POS.jsx:403`). El `.jsonc` no fija enum para `items[].estado`, así que ninguno falla y no son comparables. **El destino impone `check` con los cinco valores de `DetalleVenta.estado_preparacion`** (`pendiente`, `en_preparacion`, `listo`, `entregado`, `cancelado`) y el puente traduce `'nuevo'` a `'pendiente'` al leer datos viejos.

### 7.6 `cantidad_base_consumo` — necesita columna propia

Es la cantidad ya convertida a la unidad base del insumo, y **es lo que descuenta inventario** (`DetalleVenta.jsonc:79`).

Tentador derivarla de `movimientos_stock`. **No se puede:** `movimientos_stock.referencia_id` apunta a la **orden**, no a la línea (`packages/data/src/repos/stock.ts:54-64`). Una orden con tres líneas del mismo insumo produce un solo movimiento agregado, así que el reparto por línea no es reconstruible.

Va a columna nueva. La alternativa —añadir `orden_linea_id` a `movimientos_stock`— rompería la agregación por insumo que hace `Caja.jsx:652-663` y multiplicaría las filas del ledger.

### 7.7 Campos de `DetalleVenta` sin destino

Ninguno. Los 24 tienen destino: 14 directos, 3 derivados, 7 columnas nuevas. **Es la única entidad del mapa con cobertura total.**

---

## 8 · `Mesa` → `mesas` (tabla nueva)

`Mesa.jsonc` declara **25 propiedades**. La tabla no existe.

### 8.1 Tabla de campos

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `mesas.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `numero` | `number` | `mesas.numero` | `smallint` | `not null`. **Único por organización** — §35.3 |
| `nombre` | `string` | `mesas.nombre` | `text` | |
| `zona` | `string` (default `'Interior'`) | `mesas.zona_id` | `uuid` | **§9.** Al leer resuelve a `zonas.nombre`; al escribir busca o crea la zona por nombre normalizado |
| `capacidad` | `number` (default 4) | `mesas.capacidad` | `smallint` | `check (capacidad > 0)` |
| `forma` | `redonda`\|`cuadrada`\|`rectangular` | `mesas.forma` | `text` | **T-ENUM** directo |
| `tamano` | `chica`\|`mediana`\|`grande` | `mesas.tamano` | `text` | **T-ENUM** directo |
| `posicion_x` | `number` (default 100) | `mesas.posicion_x` | `integer` | directo |
| `posicion_y` | `number` (default 100) | `mesas.posicion_y` | `integer` | directo |
| `estado` | 10 valores | `mesas.estado` | `text` | **T-ENUM**, §8.2 |
| `venta_activa_id` | `string` \| `null` | `mesas.orden_activa_id` | `uuid` | FK a `ordenes`, `on delete set null (orden_activa_id)`. **Índice único parcial** — §35.5 |
| `personas_actuales` | `number` | `mesas.personas_actuales` | `smallint` | `default 0` |
| `cliente_temporal` | `string` | `mesas.cliente_temporal` | `text` | |
| `notas_alergias` | `string` | `mesas.notas_alergias` | `text` | Se limpia al liberar la mesa (`Mesero.jsx:239`) |
| `celebracion_especial` | `boolean` | `mesas.celebracion_especial` | `boolean` | `default false` |
| `tipo_celebracion` | `string` | `mesas.tipo_celebracion` | `text` | |
| `activo` | `boolean` | `mesas.activa` | `boolean` | **T-ACTIVO — cambia de género.** «Mesa» es femenino |
| `orden` | `number` | `mesas.orden` | `integer` | `default 0`. Clave de ordenamiento válida del puente |
| `qr_token` | `string` | `mesas.qr_token` | `text` | **Único por organización** — §35.4. §8.3 |
| `qr_activo` | `boolean` | `mesas.qr_activa` | `boolean` | **T-ACTIVO — cambia de género** |
| `mesero_asignado_id` | `string` | `mesas.empleado_asignado_id` | `uuid` | FK a `empleos`, `on delete set null` |
| `mesero_asignado_nombre` | `string` | `DERIVADO` | — | `join` a `personas.nombre` |
| `mesero_asignado_color` | `string` HEX | `DERIVADO` | — | `empleos.color`, con respaldo `colorDePersona(id)` (`packages/app/src/puente/roles.ts:88`) |
| `atendido_por_id` | `string` | `mesas.empleado_atiende_id` | `uuid` | FK a `empleos`, `on delete set null` |
| `atendido_por_nombre` | `string` | `DERIVADO` | — | `join` |
| `atendido_por_color` | `string` HEX | `DERIVADO` | — | `join` |

### 8.2 Transiciones de `estado` — verificadas una por una

```
libre              --abrir (Mesero.jsx:321 / qrPedidoFlow.js:144)--> esperando_orden
esperando_orden    --enviar pedido (Mesero.jsx:666 / qrPedidoFlow.js:470)--> pedido_enviado
pedido_enviado     --cocina toma (Cocina.jsx:221)--> en_preparacion
en_preparacion     --cocina marca listo (Cocina.jsx:258)--> en_espera_entrega
en_espera_entrega  --entrega sin pedidos activos (entregaPedidos.js:183)--> ocupada
cualquiera         --pedir cuenta (Mesero.jsx:867 / PedirCuentaQR.jsx:311)--> cuenta_solicitada
cuenta_solicitada  --cobro (Caja.jsx:794)--> limpieza
limpieza           --marcar limpia (Mesero.jsx:234)--> libre
no-libre sin orden --liberar huérfana (Mesero.jsx:905)--> libre
ticket en cero     --(Caja.jsx:382)--> libre
```

**`pagada` y `cancelada` están en el enum (`Mesa.jsonc:56-57`) y tienen estilo en `constants.js:52-53`, pero ningún `Mesa.update` los escribe jamás.** Son valores muertos. **Se conservan en el `check`**: `MesaStatusBadge` los pinta y quitarlos rompería la interfaz sin ganar nada.

### 8.3 `qr_token` — se conserva el formato, se refuerza la unicidad

`qrUtils.js:8-16`:

```js
export function generarTokenMesa(mesaId) {
  let h = 0;
  for (let i = 0; i < mesaId.length; i++) h = (h * 31 + mesaId.charCodeAt(i)) >>> 0;
  return 'm' + h.toString(36) + mesaId.slice(-4);
}
```

Formato: `m` + hash uint32 en base36 + los últimos 4 caracteres del `id`. **Determinístico y derivable del `id`**, y el propio comentario lo admite. Como el `id` pasa de ser un identificador de Base44 a un `uuid`, el token cambia de valor pero **no de forma**, así que la ruta `/qr/:token` y `PortalCliente.jsx:75` (`Mesa.filter({qr_token})`) siguen funcionando sin tocar una línea.

**Lo que sí cambia:** hoy no hay rotación (`MesasQRTab.jsx:45` sólo genera donde falta) y como es función pura del `id`, regenerar da el mismo valor. El índice único de §35.4 hace imposible el token repetido; la rotación queda fuera de alcance de Fase 1 y se anota en §38.

---

## 9 · `Zona` → `zonas` (tabla nueva)

**No es una entidad.** No existe `Zona.jsonc`, y `grep "entities.Zona"` sobre los 244 archivos da cero.

Hoy `Mesa.zona` es un `string` con `default "Interior"` (`Mesa.jsonc:11-14`), **sin `enum` y sin llave foránea**, y la lista de zonas es una constante del frontend:

```js
// historico/restaurante/src/lib/constants.js:118
export const ZONAS_MESA = ['Interior', 'Exterior', 'Terraza', 'Barra', 'Otro'];
```

Consumida en `MesaEditDialog.jsx:143`, `Configuracion.jsx:720-725` y `Mesero.jsx:209-210`.

**Defecto que esto causa, y que la tabla corrige:** el filtrado siempre hace `(m.zona || 'Interior') === zonaFiltro` (`Configuracion.jsx:291`, `:301`, `:723`; `Mesero.jsx:208`). Si una mesa tiene una zona fuera de los cinco valores —una importación, un dato viejo— **esa mesa desaparece de la interfaz**: no hay pestaña que la muestre. Con una tabla y una llave foránea, una zona inexistente deja de poder escribirse.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `Mesa.zona` | `string` | `zonas.nombre` vía `mesas.zona_id` | `text` / `uuid` | Al leer, `join`. Al escribir, busca por nombre normalizado sin acentos ni mayúsculas; si no existe **la crea** — así una zona nueva escrita a mano no se pierde |
| — | — | `zonas.orden` | `integer` | **NUEVO.** Hoy el orden de las pestañas es el del array literal |
| — | — | `zonas.activa` | `boolean` | **NUEVO.** Borrado suave |

**Semilla obligatoria** al crear una organización de restaurante: las cinco de `ZONAS_MESA`, en ese orden. Sin la semilla, la primera mesa no tiene zona a la que apuntar.

---

## 10 · `PedidoPreparacion` → `comandas` + `comanda_items` (tablas nuevas)

`PedidoPreparacion.jsonc` declara **20 propiedades**, una de ellas (`items`) es un arreglo de objetos con 10 propiedades declaradas.

### 10.1 Por qué se parte en dos tablas

`items` es un arreglo `jsonb` anidado. Se normaliza por la misma razón que los modificadores: **la cocina consulta y actualiza items uno por uno** (`Cocina.jsx:216-295`, `Barra.jsx:33-37`), y hacerlo dentro de un `jsonb` obliga a leer-modificar-escribir el arreglo entero, que es el patrón que pierde actualizaciones con dos pantallas de cocina abiertas.

### 10.2 Tabla de campos — `comandas`

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `comandas.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `venta_id` | `string` | `comandas.orden_id` | `uuid` | `not null`, FK compuesta a `ordenes` |
| `venta_folio` | `string` | `DERIVADO` | — | Se compone del `serie`+`folio` de la orden (§6.2) |
| `mesa_id` | `string` | `comandas.mesa_id` | `uuid` | FK a `mesas`, `on delete set null (mesa_id)` |
| `mesa_numero` | `number` | `DERIVADO` | — | `join` a `mesas.numero` |
| `area` | `cocina`\|`barra` | `comandas.area` | `text` | **LEGACY declarado.** `PedidoPreparacion.jsonc:24` dice que se mantiene por compatibilidad con `Cocina.filter({area:'cocina'})`. **Se conserva la columna** |
| `estado` | `nuevo`\|`en_preparacion`\|`listo`\|`entregado`\|`cancelado` | `comandas.estado` | `text` | **T-ENUM** directo |
| `fecha_creacion` | `string` ISO | `comandas.created_at` | `timestamptz` | **T-FECHA**. Es el mismo instante |
| `fecha_inicio` | `string` ISO | `comandas.iniciada_en` | `timestamptz` | **T-FECHA** |
| `fecha_listo` | `string` ISO | `comandas.lista_en` | `timestamptz` | **T-FECHA** |
| `fecha_entregado` | `string` ISO | `comandas.entregada_en` | `timestamptz` | **T-FECHA** |
| `usuario_responsable_id` | `string` | `comandas.empleado_responsable_id` | `uuid` | **NUNCA SE ESCRIBE** en los 244 archivos, pese a estar declarado (`:52`). La columna entra porque la cocina con estaciones la necesitará; hoy queda `null` |
| `notas` | `string` | `comandas.notas` | `text` | |
| `items` | `Array` | **`comanda_items`** (filas) | tabla | §10.3 |
| `estacion_preparacion_id` | `string` | `comandas.estacion_preparacion_id` | `uuid` | FK a `estaciones_preparacion`, `on delete set null` |
| `estacion_preparacion_nombre` | `string` | `comandas.estacion_nombre` | `text` | **SNAPSHOT.** Se conserva: la cocina lo pinta y la estación puede desactivarse |
| `estacion_preparacion_color` | `string` HEX | `comandas.estacion_color` | `text` | **SNAPSHOT** |
| `origen_pedido` | `mesero`\|`portal_qr`\|`pos` | `comandas.origen` | `text` | **T-ENUM** directo |
| `notas_alergias` | `string` | `comandas.notas_alergias` | `text` | **SNAPSHOT** tomado al crear el pedido. Visible en cocina |
| `celebracion_especial` | `boolean` | `comandas.celebracion_especial` | `boolean` | **SNAPSHOT** |
| `tipo_celebracion` | `string` | `comandas.tipo_celebracion` | `text` | **SNAPSHOT** |

### 10.3 Tabla de campos — `comanda_items`

El esquema declara 10 propiedades por item (`PedidoPreparacion.jsonc:61-100`). **El código escribe tres que no están declaradas.**

| clave del item | tipo real | columna destino | escrito en | ¿declarada? |
|---|---|---|---|---|
| `producto_id` | `string` | `comanda_items.producto_id` | `Mesero.jsx:588` | Sí |
| `producto_nombre` | `string` | `comanda_items.producto_nombre` | `Mesero.jsx:589` | Sí. **SNAPSHOT `not null`** |
| `cantidad` | `number` | `comanda_items.cantidad` | `Mesero.jsx:590` | Sí |
| `notas` | `string` | `comanda_items.notas` | `Mesero.jsx:591` | Sí |
| `estado` | `string` | `comanda_items.estado` | `Mesero.jsx:594` (`pendiente`) vs `POS.jsx:403` (`nuevo`) | Sí, **sin enum** → §7.5 |
| `tipo_venta` | `string` | `comanda_items.tipo_venta` | `Mesero.jsx:600` | Sí |
| `unidad_variable` | `string` | `comanda_items.unidad_variable` | `Mesero.jsx:602` | Sí |
| `cantidad_variable` | `number` | `comanda_items.cantidad_variable` | `Mesero.jsx:603` | Sí |
| `nombre_porcion` | `string` | `comanda_items.nombre_porcion` | `Mesero.jsx:606` | Sí |
| `cantidad_porciones` | `number` | `comanda_items.cantidad_porciones` | `Mesero.jsx:607` | Sí |
| **`modificadores`** | `Array` | **`DERIVADO`** de `orden_linea_modificadores` | `Mesero.jsx:595`, `qrPedidoFlow.js:385` | **NO.** Y **sí se lee**: `CocinaPedidoCardPremium.jsx:296` y `CocinaStationMiniCard.jsx:141`. Funciona por permisividad de Base44 |
| **`origen`** | `string` | **SE DESCARTA** | `qrPedidoFlow.js:387` | **NO.** No se lee en ningún sitio. Redundante con `comandas.origen` |
| **`area_preparacion_snapshot`** | `string` | **SE DESCARTA** dentro del item | `qrPedidoFlow.js:388` | **NO.** No se lee dentro de `items`. El dato ya está en `orden_lineas.area_preparacion_snapshot` (§7.2 #14) |

**Columna nueva imprescindible:** `comanda_items.orden_linea_id uuid` — hoy no existe ningún vínculo entre el item de cocina y la línea de venta, y por eso el estado de preparación tiene que duplicarse (§7.5). Con el vínculo, `comanda_items.estado` y `orden_lineas.estado_preparacion` se mantienen coherentes en la misma transacción.

### 10.4 La asimetría de POS

`POS.jsx:413-420` escribe **6 campos** de los 22 de `comandas`: `venta_id`, `venta_folio`, `area`, `estado`, `fecha_creacion`, `items`. **No escribe** `mesa_id`, `mesa_numero`, `notas`, `origen_pedido`, ni ningún campo de estación o alergias.

Además crea **un pedido por item y por área** (bucle en `:412`), y si `area_preparacion === 'ambos'` **duplica** el pedido en cocina y barra (`:396`). El destino lo soporta sin cambios: son dos filas de `comandas` apuntando a la misma `orden_id`.

---

## 11 · `EstacionPreparacion` → `estaciones_preparacion` (tabla nueva)

`EstacionPreparacion.jsonc` declara **7 propiedades**. Todas se escriben.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `estaciones_preparacion.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `nombre` | `text` | `not null`. **Único sin acentos ni mayúsculas** — §35.10 |
| `descripcion` | `string` | `descripcion` | `text` | |
| `color` | `string` HEX (default `#4A5568`) | `color` | `text` | `check (color ~ '^#[0-9a-fA-F]{6}$')`, igual que `categorias.color` |
| `icono` | `string` | `icono` | `text` | Declarado «para futuras vistas»; **nunca se escribe** |
| `orden` | `number` | `orden` | `integer` | `default 0` |
| `activo` | `boolean` | `activa` | `boolean` | **T-ACTIVO — cambia de género.** «Estación» es femenino |
| `es_general` | `boolean` | `es_general` | `boolean` | §11.1 |

### 11.1 `es_general` — la regla 10, y por qué hoy no se cumple de verdad

`F1-01` §3.10: *«La estación "Cocina general" (`es_general: true`) es el fallback obligatorio y no se puede desactivar.»*

Hoy eso lo sostienen **tres comprobaciones, todas en el navegador**:

1. `EstacionesPreparacionSection.jsx:190-199` — `crearCocinaGeneral` lee la lista completa y aborta si ya hay una con `es_general`. **Es el único punto que escribe `es_general: true`**, y es TOCTOU: entre la lectura y la escritura cabe otra pestaña haciendo lo mismo.
2. `:172` — el formulario normal fuerza `es_general: false`.
3. `:141-145` — la edición jamás toca el flag, comentado explícitamente en `:139-140`.

Si hubiera dos, los cuatro consumidores toman **silenciosamente la primera**: `EstacionesPreparacionSection.jsx:78`, `CategoriasProductoSection.jsx:98`, `preparacionEstacionUtils.js:49`, `Cocina.jsx:160`.

**Lo cierra la base** con un índice único parcial (§35.8) y un `check` que impide `activa = false` cuando `es_general` — así «no se puede desactivar» deja de ser un `if` en `:218-221` y pasa a ser una restricción.

### 11.2 La cadena de resolución que el mapa debe preservar

`preparacionEstacionUtils.js` resuelve **Producto → Categoría → Estación**, no Producto → Estación. Las reglas, del encabezado del archivo:

- Si `estaciones_preparacion_activas !== true`, devuelve `null` (modo legacy por `area`).
- **Nunca lanza**: si no hay categoría, o no hay estación, o no hay Cocina general, cae a un objeto sintético con `id` vacío.
- Sólo lee **snapshots ya guardados** en `CategoriaProducto` (§16), nunca consulta la estación en vivo.

El destino conserva las tres: `productos.categoria_id` → `categorias.estacion_preparacion_id` → `estaciones_preparacion`, con los snapshots de nombre y color copiados en `categorias`.

---

## 12 · `UsuarioPOS` → `personas` + `identidades` + `empleos` + `credenciales_pin`

**Tabla ancla: `empleos`.** `UsuarioPOS.id` = `empleos.id`.

Es la entidad que más se abre, y por la mejor razón: contiene el defecto **D-01**, el más citado de la auditoría.

### 12.1 Por qué cuatro tablas y cuál es el ancla

El esquema nuevo separa **el ser humano** (`personas`) de **su forma de entrar** (`identidades`, `credenciales_pin`) y de **su puesto** (`empleos`). El comentario de `001_plataforma.sql:92-94` lo justifica: una persona puede ser cajera en una sucursal y gerente en otra, y su historial de cobros no se parte al cambiar de puesto.

El ancla es `empleos` y no `personas` porque **el `id` de `UsuarioPOS` se usa como llave foránea de un rol**: `usuario_mesero_id`, `usuario_cajero_id`, `atendido_por_id`, `usuario_liquido_id`. Todos apuntan a «quien hizo esto **con este puesto**». `ordenes.empleado_atiende_id` referencia `empleos`, así que anclar en `personas` obligaría a un `join` extra en cada escritura y rompería las llaves compuestas de `004`.

### 12.2 Tabla de campos

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `empleos.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `empleos.created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `personas.nombre` | `text` | `not null`. Al escribir crea o actualiza la persona |
| `rol` | `administrador`\|`caja`\|`mesero`\|`cocina`\|`barra` | `empleos.rol` | `text` | **T-ENUM**, §12.3 |
| **`pin`** | `string` de 4 dígitos | **`credenciales_pin.pin_hash`** | `text` | **NUNCA VIAJA.** §12.4 |
| `activo` | `boolean` | `empleos.activo` | `boolean` | **T-ACTIVO**, mismo género |
| `color` | `string` HEX | **NUEVA** `empleos.color` | `text` | Respaldo: `colorDePersona(id)` (`packages/app/src/puente/roles.ts:88`), que ya existe y deriva un color estable del identificador |
| `telefono` | `string` | `personas.telefono` | `text` | directo |
| `correo` | `string` | `personas.correo` | `text` | directo. **Declarado «no se usa para login»** (`UsuarioPOS.jsonc:31`). `identidades.correo` es otra cosa y es la del dueño |
| `permisos_extra` | `string` con JSON | **SE DESCARTA** | — | §12.5 |
| `estacion_preparacion_id` | `string` | **NUEVA** `empleos.estacion_preparacion_id` | `uuid` | FK a `estaciones_preparacion`, `on delete set null` |
| `estacion_preparacion_nombre` | `string` | `DERIVADO` | — | `join`. Declarado «solo visual» (`:44`). No hace falta snapshot: si la estación se desactiva, el usuario debe dejar de verla |
| `estacion_preparacion_color` | `string` HEX | `DERIVADO` | — | `join` |
| `puede_ver_todas_estaciones` | `boolean` | **NUEVA** `empleos.ve_todas_las_estaciones` | `boolean` | `default false` |
| `notas` | `string` | `personas.notas` | `text` | Sólo lo escribe `ensureDefaultAdmin.js:22` |

Además, dos columnas del destino que él no conoce: `empleos.persona_id`, `empleos.sucursal_id`, `vigente_desde`, `vigente_hasta`, e `identidades.auth_user_id` (nulo para quien sólo entra con PIN — `001_plataforma.sql:113`).

### 12.3 `rol` — la traducción ya existe y está probada

`packages/app/src/puente/roles.ts:34-41` ya la tiene escrita:

| `empleos.rol` (base) | `UsuarioPOS.rol` (él) |
|---|---|
| `dueno` | `administrador` |
| `administrador` | `administrador` |
| `gerente` | `administrador` |
| `cajero` | `caja` |
| `mesero` | `mesero` |
| `cocina` | `cocina` |
| `almacen` | **`null` a propósito** |

`almacen` devuelve `null` porque su sistema no tiene ese rol, y darle el de administrador «para que no se quede sin menú» sería regalarle configuración, costos y accesos.

**El rol legacy `barra`.** `constants.js:85-91` lo conserva en `ROLE_LABELS` para que un usuario viejo se siga viendo bien, pero lo excluye del selector (`ROLE_LABELS_SELECTABLE`, `:97-102`) porque *«Barra deja de ser rol principal — ahora es una estación de la cocina»*. Al escribir, `barra` se traduce a `cocina` + `estacion_preparacion_id` = la estación «Barra». Al leer, un `empleos.rol='cocina'` con estación «Barra» **se sigue devolviendo como `cocina`**, no como `barra`: `UsuarioPOSDialog.jsx:106` ya avisa del rol legacy y `ROLE_LABELS` lo cubre.

### 12.4 `pin` — el defecto D-01, y qué hace exactamente el mapa

Hoy, con línea:

- `POSLogin.jsx:43` descarga **todos los usuarios activos con su PIN** al navegador: `UsuarioPOS.filter({ activo: true })`.
- `POSLogin.jsx:72-75` compara con `u.pin === pinToUse`. Igualdad literal de cadenas: sin hash, sin sal, sin servidor, sin límite de intentos.
- `POSLogin.jsx:87-90` dispara el intento **automáticamente al llegar a 4 dígitos**, así que el espacio de 10 000 PIN es enumerable sin red, contra la respuesta ya cargada.
- El PIN se puede revelar en pantalla: `UsuarioPOSDialog.jsx:414-416`.
- La sesión completa —**incluido el PIN**— se guarda en `sessionStorage`: `POSAuthContext.jsx:19`.
- Admin por omisión con PIN `1234`: `ensureDefaultAdmin.js:17-23`.

El destino ya está construido: `credenciales_pin` con Argon2id y pimienta del entorno (`001_plataforma.sql:120-146`), más `intentos_fallidos` y `bloqueada_hasta`, más el límite por origen de `044_limite_de_tasa.sql`.

**Reglas del mapa, sin excepción:**

1. `UsuarioPOS.pin` **nunca aparece en una respuesta de lectura.** Ni vacío, ni enmascarado, ni como `'****'`. El campo simplemente no está en el objeto. La lista blanca del §36 lo excluye para **todos** los roles, incluido `administrador`.
2. En escritura, `pin` va a un comando dedicado que hashea en servidor. No pasa por `/api/datos/escribir`.
3. La comprobación es un comando que devuelve **un booleano y el ámbito de sesión**, nunca la fila.
4. `POSLogin.jsx` deja de listar usuarios con PIN. Sigue pudiendo listar **nombre, rol y color** para pintar las tarjetas — eso es §36.

`isUsingDefaultAdminPin` (`ensureDefaultAdmin.js:63-70`) detecta `pin === '1234'` en el cliente para el aviso de `POSLogin.jsx:242-247`. Como el PIN ya no viaja, se sustituye por un booleano que devuelve el servidor. **La cicatriz se conserva, la fuga no.**

### 12.5 `permisos_extra` — se descarta, y por qué no es una pérdida

`permisos_extra` es un `string` con JSON de permisos adicionales. **Se descarta.**

`permissions.js` (49 líneas) es **gating visual** y nada más: `PERMISSIONS` mapea 21 funciones a roles, y `getNavForRole` filtra el menú. El rol sale de `sessionStorage`. Es el defecto **D-02**, y `DECISIONES.md` regla 5 lo zanja: *«Los permisos se aplican en servidor. Ocultar un botón no es autorización.»*

El envoltorio `comando()` ya verifica `roles: [...]` en cada escritura (`packages/app/src/venta/cobrar.ts:40`). Un permiso extra guardado como texto libre en el cliente no puede añadir autorización que el servidor no conceda; conservarlo sería conservar la ilusión de que sí.

`permissions.js` **se porta tal cual** para que el menú se vea igual. Deja de ser la autorización y pasa a ser lo que ya era.

---

## 13 · `ConfiguracionNegocio` → `configuracion.valores` + `organizaciones`

**Tabla ancla:** `configuracion`. `ConfiguracionNegocio.id` = `configuracion.id`.

`ConfiguracionNegocio.jsonc` declara **76 propiedades**. Es la entidad más grande y la que contiene la fuga **D-14**.

### 13.1 Forma del destino

`configuracion` es `(id, organizacion_id unique, valores jsonb, version, created_at, updated_at)`. Los valores van agrupados, como ya hace `packages/app/src/configuracion/configuracion.ts:39-60`: `contacto`, `apariencia`, `impuesto`, y se agregan `operacion`, `tickets`, `propinas`, `portal_qr`, `integraciones`, `presentacion`, `unidades`.

Cuatro campos **no** van al `jsonb` porque ya tienen columna propia en `organizaciones`, y tenerlos dos veces es tenerlos mal:

| campo de Miguel | destino real |
|---|---|
| `nombre_negocio` | `organizaciones.nombre` |
| `paquete_modo` | `organizaciones.paquete` |
| `moneda` | `organizaciones.moneda` (`check (moneda in ('MXN'))`) |
| — | `organizaciones.zona_horaria`, que él no tiene y hace falta para `hora_inicio_dia_operativo` |

### 13.2 `list()[0]` — el defecto D-15, corregido por la base

Su código lee la configuración con `list()` y toma `[0]` en **seis sitios independientes**: `ConfigContext.jsx:59-65`, `Configuracion.jsx:63-85`, `PortalCliente.jsx:63-68`, `CategoriasProductoSection.jsx:50-53`, `UnidadesMedidaSection.jsx:29-32`, `qrPedidoFlow.js:255-256`. Y **cinco sitios pueden crear filas adicionales** cuando `!cfg?.id`.

`001_plataforma.sql:195` ya lo cierra: `organizacion_id uuid not null unique`. **Una configuración por organización, impuesta por la base** (§35.7). El puente devuelve siempre un arreglo de un elemento, así que `list()[0]` sigue funcionando sin tocar los seis sitios.

### 13.3 Tabla de campos — los 76, agrupados

**Identidad y marca (14) — `apariencia` + `organizaciones`**

| campo | tipo | destino | transformación |
|---|---|---|---|
| `nombre_negocio` | `string` | `organizaciones.nombre` | `not null` |
| `nombre_sistema` | `string` | `valores.apariencia.nombreSistema` | directo |
| `platform_brand` | `string` | `valores.apariencia.marcaPlataforma` | default `MH Astral Systems` |
| `logo_url` | `string` | `valores.apariencia.logoUrl` | directo |
| `logo_ticket_url` | `string` | `valores.apariencia.logoTicketUrl` | directo |
| `logo_pdf_url` | `string` | `valores.apariencia.logoPdfUrl` | directo |
| `background_logo_url` | `string` | `valores.apariencia.fondoLogoUrl` | directo |
| `background_image_url` | `string` | `valores.apariencia.fondoImagenUrl` | directo |
| `background_fit` | `cover`\|`contain` | `valores.apariencia.fondoAjuste` | **T-ENUM** |
| `background_opacity` | `number` 0-1 | `valores.apariencia.fondoOpacidadBp` | **T-PORCENTAJE**: `0.12` → `1200` |
| `color_primario` | `string` HEX | `valores.apariencia.colorPrimario` | `regex ^#[0-9a-fA-F]{6}$` |
| `color_secundario` | `string` HEX | `valores.apariencia.colorSecundario` | **LEGACY declarado** (`:44`): «No se expone en UI nueva». Se conserva |
| `color_acento` | `string` HEX | `valores.apariencia.colorAcento` | idem |
| `color_exito`, `color_alerta` | `string` HEX | `valores.apariencia.colorExito` / `colorAlerta` | idem |
| `colorear_importes_monetarios` | `boolean` | `valores.apariencia.colorearImportes` | directo |

**Contacto (6) — `contacto`**

`direccion` → `valores.contacto.direccion` · `telefono` → `.telefono` · `whatsapp` → `.whatsapp` · `correo` → `.correo` · `horario` → `.horario` · `redes_sociales` → `.redesSociales` (string libre).

**Dinero e impuesto (3)**

| campo | tipo | destino | transformación |
|---|---|---|---|
| `moneda` | `string` | `organizaciones.moneda` | `check in ('MXN')` |
| `simbolo_moneda` | `string` | `DERIVADO` | `MONEDAS.MXN.simbolo` (`packages/domain/src/dinero/formato.ts:20`). **Y ni siquiera se usa**: `formatCurrency` tiene `symbol = '$'` por omisión (`financialUtils.js:30`) y el portal lo llama sin argumento |
| `iva_porcentaje` | `number` | `valores.impuesto.puntosBase` | **T-PORCENTAJE**: `16` → `1600`. `check between 0 and 3500` |
| — | — | `valores.impuesto.incluidoEnPrecio` | **NUEVO.** En México el precio de mostrador ya lleva IVA: se extrae, no se suma. Él no tiene el concepto y el default `true` es el correcto |

**Operación (8) — `operacion`**

`usa_mesas`, `usa_cocina`, `usa_barra`, `permitir_venta_sin_stock`, `mostrar_costos_a_caja`, `asignacion_mesas_activa`, `silenciar_notificaciones_admin`, `estaciones_preparacion_activas` → `valores.operacion.*`, todos booleanos directos.
`hora_inicio_dia_operativo` (`string` `"06:00"`) → `valores.operacion.horaInicioDiaOperativo`, `check` de formato `HH:MM`. Se interpreta en `organizaciones.zona_horaria`.

**Tickets y exportación (8) — `tickets`**

`mensaje_ticket`, `ticket_footer`, `pdf_footer`, `footer_text`, `mostrar_logo_ticket`, `descargar_pdf_corte_auto` → `valores.tickets.*`.
`formato_export_default` (`csv`\|`xlsx`\|`pdf`) → `valores.tickets.formatoExportacion`, **T-ENUM**.
`sonidos_activos`, `volumen_sonido` → `valores.operacion.sonidos.*`.

**Propinas (2) — `propinas`**

`propinas_activas` (`boolean`) → `valores.propinas.activas`.
`propina_porcentajes_sugeridos` (`string` `"5,10,15,20"`) → `valores.propinas.porcentajesSugeridos` como **arreglo de enteros de puntos base** `[500,1000,1500,2000]`. Se parte por coma, se valida cada número y se rechaza la lista con basura. Hoy `getPorcentajesSugeridos` (`tipsUtils.js:18`) parsea texto en el cliente en cada render.

**Portal QR (12) — `portal_qr`**

`portal_qr_activo`, `portal_qr_mostrar_precios`, `portal_qr_mostrar_sin_imagen`, `portal_qr_permitir_ordenar`, `portal_qr_permitir_cuenta`, `portal_qr_permitir_ayuda`, `portal_qr_mostrar_precuenta`, `portal_qr_permitir_propina_cliente`, `portal_qr_permitir_pedidos_cliente` → booleanos en `valores.portal_qr.*`.
`portal_qr_modo_menu` (`productos_pos`\|`menu_subido`\|`mixto`) y `portal_qr_cuenta_modo` (`mesero_dispara`\|`cliente_solicita`\|`ambos`) → **T-ENUM**.
`portal_qr_mensaje_bienvenida` → texto.

**Integraciones Google (11) — `integraciones`**

`google_sheets_enabled`, `google_drive_enabled`, `google_sheets_status`, `google_drive_status`, `google_sheets_spreadsheet_id`, `google_drive_folder_id`, `auto_sync_on_cash_cut`, `auto_save_pdf_to_drive`, `auto_update_daily_summary`, `last_sync_at` (**T-FECHA**), `last_sync_status`, `last_sync_error` → `valores.integraciones.*`.

**Todos son SECRETOS a efectos del portal público.** Ver §13.4 y §36.3.

**Modo presentación (4) — `presentacion`**

| campo | tipo | destino | transformación |
|---|---|---|---|
| `modo_presentacion_activo` | `boolean` | `valores.presentacion.activo` | directo |
| **`presentacion_password`** | `string` (default `"2797"`) | **`valores.presentacion.passwordHash`** | **NUNCA en claro, NUNCA sale.** §13.5 |
| `presentacion_ultimo_acceso` | `string` ISO | `valores.presentacion.ultimoAcceso` | **T-FECHA** |
| `presentacion_notas` | `string` | `valores.presentacion.notas` | directo |

**Unidades (1)**

`unidades_medida_lista` (`string` separado por comas) → `valores.unidades.compra` como **arreglo de cadenas**. §31.

### 13.4 D-14 — la fuga, medida

`PortalCliente.jsx:63-68`:

```js
const { data: configs = [] } = useQuery({
  queryKey: ['config_publica_qr'],
  queryFn: () => base44.entities.ConfiguracionNegocio.list(),   // línea 65
  initialData: [],
});
const config = configs?.[0] || null;                            // línea 68
```

Sin `select`, sin proyección: **descarga el registro entero**. Y el cliente es `requiresAuth: false` (`api/base44Client.js:9`), así que `/qr/:token` es anónimo. Hay una **segunda** descarga completa desde el mismo portal en `qrPedidoFlow.js:255`, que sólo necesita `estaciones_preparacion_activas`.

**El portal público usa 22 campos de 76. Los otros 54 llegan al navegador de cualquiera que escanee un QR.** Entre ellos:

- **`presentacion_password` en claro** (default `"2797"`), comparada literalmente en `ModoPresentacion.jsx:48`.
- `google_sheets_spreadsheet_id`, `google_drive_folder_id` y los cuatro campos de estado y habilitación de Google.
- `last_sync_error`, que puede llevar trazas.
- PII del negocio: `direccion`, `telefono`, `whatsapp`, `correo`, `horario`, `redes_sociales`.
- Operación interna: `mostrar_costos_a_caja`, `permitir_venta_sin_stock`, `iva_porcentaje`, `modo_presentacion_activo`, `hora_inicio_dia_operativo`.

`F1-01` §5 lista cuatro (`presentacion_password`, los IDs de Google, `paquete_modo`, `mostrar_costos_a_caja`). **Son 54.** La lista completa de permitidos está en §36.3 y es lo que cierra la fuga.

### 13.5 `presentacion_password` — D-19

Hoy: texto plano en la entidad, comparada en el cliente (`ModoPresentacion.jsx:48` contra `ConfigContext.jsx:90`), sin bloqueo por intentos.

**Destino:** `valores.presentacion.passwordHash`, con el mismo Argon2id de `credenciales_pin`. La comparación es un comando que devuelve un booleano y consume el límite de tasa de `044_limite_de_tasa.sql`. **El campo no existe en ninguna respuesta de lectura, para ningún rol.**

Al migrar, el `2797` por omisión **no se copia**: se genera una contraseña nueva y se le pide a Miguel que la fije. Copiar un secreto conocido a un hash sigue siendo un secreto conocido.

---

## 14 · `Ingrediente` → `insumos` + `existencias`

**Tabla ancla:** `insumos`. `Ingrediente.id` = `insumos.id`.

`Ingrediente.jsonc` declara **18 propiedades**.

### 14.1 Tabla de campos

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `insumos.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `insumos.nombre` | `text` | `not null`. **Único sin acentos ni mayúsculas** — §35.10 |
| `categoria_id` | `string` | `insumos.categoria_id` | `uuid` | FK a `categorias` con `tipo='insumo'`. **NUNCA SE ESCRIBE** — §33 |
| `unidad_base` | `g`\|`ml`\|`pieza` | `insumos.unidad_base` | `text` | **T-ENUM**. `check` estrechado — §35.12 |
| `unidad_compra_default` | 7 valores | **NUEVA** `insumos.unidad_compra_default` | `text` | directo |
| `cantidad_por_compra_default` | `number` | **NUEVA** `insumos.cantidad_por_compra_default` | `numeric(14,4)` | **T-CANTIDAD**. Es la **equivalencia** de un empaque: cuántas unidades base trae una caja |
| `costo_compra_default` | `number` pesos | **NUEVA** `insumos.costo_compra_default_centavos` | `bigint` | **T-DINERO** |
| `costo_por_unidad_base` | `number` pesos | `insumos.costo_unitario_centavos` | `bigint` | **T-DINERO**. §14.2 |
| **`stock_actual`** | `number` | **`existencias.cantidad`** | `numeric(14,4)` | **T-CANTIDAD**. §14.3 |
| `stock_minimo` | `number` | `insumos.stock_minimo` | `numeric(14,4)` | **T-CANTIDAD** |
| `stock_critico` | `number` | **NUEVA** `insumos.stock_critico` | `numeric(14,4)` | **T-CANTIDAD**. `STOCK_STATUS` (`constants.js:26`) tiene cinco niveles y necesita los dos umbrales |
| `proveedor_default_id` | `string` | **NUEVA** `insumos.proveedor_id` | `uuid` | FK a `proveedores`, `on delete set null`. Declarado pero **nunca escrito** por ningún diálogo |
| `activo` | `boolean` | `insumos.activo` | `boolean` | **T-ACTIVO**, mismo género |
| `notas` | `string` | **NUEVA** `insumos.notas` | `text` | Sólo lo escribe el importador (`importExecutors.js:91`) |
| `tipo_ingrediente` | `normal`\|`contenedor` | **NUEVA** `insumos.tipo_insumo` | `text` | **T-ENUM** |
| `capacidad_contenedor_ml` | `number` | **NUEVA** `insumos.capacidad_contenedor_ml` | `numeric(14,4)` | **T-CANTIDAD** |
| `porciones_por_contenedor_default` | `number` | **NUEVA** `insumos.porciones_por_contenedor` | `numeric(14,4)` | **T-CANTIDAD** |
| `ml_por_porcion_default` | `number` | **NUEVA** `insumos.ml_por_porcion` | `numeric(14,4)` | **T-CANTIDAD** |
| `nombre_porcion_default` | `string` | **NUEVA** `insumos.nombre_porcion` | `text` | Texto visual: shot, copa, vaso |

**Once columnas nuevas.** El DDL está en §34.3.

### 14.2 `costo_por_unidad_base` — el promedio ponderado, y D-13

La fórmula real de una compra, `RegistrarCompraDialog.jsx:305-313`:

```js
const qtyBase     = convertirAUnidadBase(qty, line.unidad_compra, equivalencia);
const costPerBase = calculateCostPerBaseUnit(cost, qtyBase);   // = cost / qtyBase
const oldStock    = ing.stock_actual || 0;
const oldCost     = ing.costo_por_unidad_base || 0;
const newStock    = oldStock + qtyBase;
const newAvgCost  = newStock > 0
  ? ((oldStock * oldCost) + (qtyBase * costPerBase)) / newStock
  : costPerBase;
// persistido redondeado a 4 decimales, línea 329
```

Idéntica, verbatim, en `RegistrarInventarioInicialDialog.jsx:230-244`. Es correcta.

**D-13 confirmado.** `importExecutors.js:41-50` **no la aplica**:

```js
await base44.entities.Ingrediente.update(p._existingId, {
  ...
  costo_por_unidad_base: p.costo_por_unidad_base,   // línea 44 — SOBRESCRITURA DIRECTA
  ...
});
```

Cero ponderación: no lee `oldStock` ni `oldCost`. El valor del CSV pisa el costo histórico. Peor: el ajuste de stock va en un `update` **separado** (`:59`), así que el costo se pisa **antes** de conocer el delta.

**Corrección del mapa:** el promedio ponderado se calcula **en el comando `registrarCompra`, en servidor, en la misma transacción**, con `bigint` de centavos y sin el redondeo a 4 decimales del cliente. Las tres rutas —compra, inventario inicial e importación— llaman al mismo comando. La fórmula deja de estar en tres sitios.

### 14.3 `stock_actual` — el cambio conceptual más grande de esta entidad

`Ingrediente.stock_actual` es una columna que se **lee, se calcula y se escribe** (`POS.jsx:314`, `POS.jsx:359`, `Caja.jsx:745`). Es el defecto **D-06**: dos cajas concurrentes se pisan.

El destino **no es una columna de `insumos`**. Es `existencias.cantidad`, la proyección del ledger, actualizada **dentro de la misma transacción** con `set cantidad = cantidad + $delta` — decremento atómico, nunca sobrescritura (`003_venta_caja_inventario.sql:401-406`).

```
Ingrediente.stock_actual  <-  existencias.cantidad  where almacen_id = <principal> and insumo_id = id
Ingrediente.stock_actual  ->  SE IGNORA. Sólo lo mueve un movimiento de stock.
```

**Esto significa que `Ingrediente.update(id, {stock_actual})` deja de funcionar como escritura**, y es intencionado: es exactamente la operación que corrompe el inventario. Los tres sitios que la hacen se reescriben a los comandos `ajustarInventario` e `inventarioInicial` (tareas E4-2 de `F1-02`).

`almacen_id` sale del almacén `principal` de la sucursal, que la base ya garantiza único (`almacenes_principal_unico`).

### 14.4 Campos sin destino

Ninguno se descarta. Pero **`categoria_id` es un campo huérfano**: se lee en `Inventario.jsx:122` para resolver el nombre contra `CategoriaIngrediente`, y **ningún `create` ni `update` lo escribe** (verificado sobre los tres puntos de alta). La columna existe en el destino; hoy siempre resuelve a cadena vacía. Ver §33.1.

---

## 15 · `ProductoTerminado` → `productos`

**Tabla ancla:** `productos`. `ProductoTerminado.id` = `productos.id`.

`ProductoTerminado.jsonc` declara **31 propiedades**. `productos` es, según el encabezado de `002_catalogo.sql:5`, «la tabla con más fusión de todo el esquema».

### 15.1 Tabla de campos

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `productos.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `productos.nombre` | `text` | `not null` |
| `categoria_id` | `string` | `productos.categoria_id` | `uuid` | FK compuesta a `categorias(id, organizacion_id)` |
| `categoria_nombre` | `string` | `DERIVADO` | — | `join`. **Hay que conservarlo en la lectura**: `preparacionEstacionUtils.js:33-38` lo usa para emparejar productos legacy sin `categoria_id` |
| `descripcion` | `string` | `productos.descripcion` | `text` | directo |
| `precio_venta` | `number` pesos | `productos.precio_venta_centavos` | `bigint` | **T-DINERO** |
| `costo_calculado_actual` | `number` pesos | `productos.costo_unitario_centavos` | `bigint` | **T-DINERO**. §15.2 |
| `utilidad_bruta_actual` | `number` pesos | `productos.utilidad_unitaria_centavos` | `bigint` | **COLUMNA GENERADA** (`041:2-4`): `precio_venta_centavos − costo_unitario_centavos`. No se puede escribir, y ése es el punto |
| `margen_bruto_actual` | `number` % | `productos.margen_bp` | `bigint` | **COLUMNA GENERADA** (`041:5-12`). **T-PORCENTAJE** al leer |
| `imagen_url` | `string` | `productos.imagen_url` | `text` | directo |
| `area_preparacion` | `cocina`\|`barra`\|`ambos`\|`ninguno` | **NUEVA** `productos.area_preparacion` | `text` | **T-ENUM**. §15.3 |
| `activo` | `boolean` | `productos.activo` | `boolean` | **T-ACTIVO**, mismo género |
| `visible_en_pos` | `boolean` | `productos.visible_en_pos` | `boolean` | directo |
| `visible_en_menu_digital` | `boolean` | **NUEVA** `productos.visible_en_menu_digital` | `boolean` | `default true` |
| `tiempo_preparacion_estimado` | `number` min | **NUEVA** `productos.minutos_preparacion` | `smallint` | directo |
| `notas` | `string` | **NUEVA** `productos.notas` | `text` | directo |
| `modificadores` | `Array` anidado | `modificadores` + `modificador_opciones` + `producto_modificadores` | tablas | §15.4 |
| `tipo_venta` | 3 valores | `productos.tipo_venta` | `text` | **T-ENUM**. El destino admite además `servicio` |
| `ingrediente_base_id` | `string` | `productos.insumo_base_id` | `uuid` | Ya existe (`040_producto_insumo_base.sql:7`) |
| `ingrediente_base_nombre` | `string` | `DERIVADO` | — | `join` a `insumos.nombre` |
| `unidad_variable` | `g`\|`kg`\|`ml`\|`l` | `productos.unidad_variable` | `text` | directo |
| `precio_por_unidad_variable` | `number` pesos | `productos.precio_por_unidad_variable_centavos` | `bigint` | **T-DINERO** |
| `cantidad_minima_variable` | `number` | `productos.cantidad_minima_variable` | `numeric(14,4)` | **T-CANTIDAD** |
| `cantidad_maxima_variable` | `number` | `productos.cantidad_maxima_variable` | `numeric(14,4)` | **T-CANTIDAD** |
| `incremento_variable` | `number` | `productos.incremento_variable` | `numeric(14,4)` | **T-CANTIDAD** |
| `presets_variable_qr` | `number[]` | **NUEVA** `productos.presets_variable` | `jsonb` | Arreglo de números. Sólo lo lee el portal QR |
| `unidad_contenedor_base` | `'ml'` fijo | **SE DESCARTA** | — | Declarado «siempre ml en v1» (`:222`). Constante, no columna |
| `capacidad_contenedor_ml` | `number` | `productos.capacidad_contenedor_ml` | `numeric(14,4)` | **T-CANTIDAD** |
| `porciones_por_contenedor` | `number` | `productos.porciones_por_contenedor` | `numeric(14,4)` | **T-CANTIDAD** |
| `ml_por_porcion` | `number` | `productos.ml_por_porcion` | `numeric(14,4)` | **T-CANTIDAD** |
| `nombre_porcion` | `string` | `productos.nombre_porcion` | `text` | directo |
| `precio_por_porcion` | `number` pesos | `productos.precio_por_porcion_centavos` | `bigint` | **T-DINERO** |
| `presets_porcion_qr` | `number[]` | **NUEVA** `productos.presets_porcion` | `jsonb` | idem |

Columnas del destino que él no conoce: `sku`, `codigo_barras`, `marca`, `precio_mayoreo_centavos`, `cantidad_minima_mayoreo`, `unidad_venta`, `estrategia_consumo`, `permite_venta_sin_stock`, `stock_minimo`.

`estrategia_consumo` la deriva el puente al escribir: `tipo_venta='precio_fijo'` con receta da `receta`; `precio_fijo` sin receta da `ninguno` (**regla 6**); `variable_medida` y `porcion_contenedor` dan `insumo_base`, que además obliga a `insumo_base_id` por `check` (`040:15-18`).

### 15.2 D-09 — el costo que no se recalcula

`costo_calculado_actual` sólo se escribe en **dos** sitios: `RecetaFormDialog.jsx:194` e `importExecutors.js:290`.

Cuando una compra cambia `Ingrediente.costo_por_unidad_base` (`RegistrarCompraDialog.jsx:337`):

- **no se toca** ningún `RecetaEscandallo.costo_unitario_base_snapshot` ni `costo_linea_calculado`,
- **no se toca** ningún `ProductoTerminado.costo_calculado_actual`,
- y las invalidaciones de `RegistrarCompraDialog.jsx:386` cubren `ingredientes_all`, `compras_all`, `movimientos_inv`, `registros_compras` y `registros_movimientos` — **ni `productos_all` ni `recetas_all`**.

El costo del capuchino se queda congelado en el día en que se grabó la receta. Todos los márgenes del tablero, POS (`ProductCard.jsx:61`), Mesero (`Mesero.jsx:505`) y menú QR heredan el valor obsoleto.

**Agravante no reportado:** `ProductoSimpleDialog.jsx:125-136` **no escribe ninguno de los tres campos financieros**. Un producto creado por esa vía queda con costo `undefined` para siempre, y `POS.jsx:112` lo lee como `product.costo_calculado_actual || 0` → **costo 0, margen 100 %**.

**Cómo lo cierra el destino.** `utilidad_unitaria_centavos` y `margen_bp` son **columnas generadas**: se recalculan solas en cada `update` de precio o costo, y **no se pueden escribir mal**. Sólo queda propagar el costo, y la consulta ya existe: `packages/app/src/inventario/recetas.ts:131`

```sql
select r.producto_id,
       coalesce(sum(round(i.costo_unitario_centavos::numeric * r.cantidad
                          * (10000 + r.merma_bp) / 10000)), 0)::bigint as costo
  from recetas r join insumos i on ...
```

La tarea E4-4 la engancha a todo cambio de costo de insumo. **Los tres campos dejan de ser snapshots que alguien tiene que acordarse de refrescar.**

### 15.3 `area_preparacion` — un campo con dos dueños

`ProductoSimpleDialog.jsx:132` lo fuerza a `'ninguno'`. `RecetaFormDialog.jsx:190` lo fuerza a `'cocina'`. **Editar el mismo producto con el diálogo «equivocado» le reescribe el área en silencio**, y el área decide a qué comanda va.

El mapa no lo arregla —es comportamiento de interfaz, no de datos— pero lo anota: la columna es una sola y el `check` la restringe a los cuatro valores. Queda en §38 como defecto detectado.

### 15.4 `modificadores` — de `jsonb` anidado a tres tablas

Hoy es un arreglo anidado dentro del producto: grupos con opciones, cada uno con `id`, `nombre`, `obligatorio`, `tipo`, `activo`. Lo escribe `ModificadoresDialog.jsx:50-52`.

El destino ya está normalizado (`002_catalogo.sql:158-206`): `modificadores` (el grupo), `modificador_opciones` (con **`precio_extra_centavos`**), y `producto_modificadores` (la unión, con `organizacion_id` añadido por `004` para que no se puedan enganchar los extras de un negocio a los productos de otro).

| clave anidada | destino |
|---|---|
| `modificadores[].id` | `modificadores.id` |
| `modificadores[].nombre` | `modificadores.nombre` |
| `modificadores[].obligatorio` | `modificadores.obligatorio` |
| `modificadores[].tipo` (`unica`\|`multiple`) | `modificadores.tipo` |
| `modificadores[].activo` | `modificadores.activo` |
| `modificadores[].opciones[].id` | `modificador_opciones.id` |
| `modificadores[].opciones[].nombre` | `modificador_opciones.nombre` |
| `modificadores[].opciones[].activo` | `modificador_opciones.activa` (**T-ACTIVO**, cambia de género) |
| — | `modificador_opciones.precio_extra_centavos` — **NUEVO para él**, ya existe en la base. Es `F1-01` §7.1 |
| — | `modificador_opciones.orden` |

Normalizar tiene un efecto que él no espera y que conviene: **un grupo de modificadores se puede reusar entre productos**. Hoy cada producto lleva su copia.

---

## 16 · `CategoriaProducto` → `categorias` con `tipo='producto'`

`CategoriaProducto.jsonc` declara **9 propiedades**.

`categorias` unifica `CategoriaProducto` y `CategoriaIngrediente` con un discriminador (`002_catalogo.sql:11-13`). **El puente filtra siempre por `tipo`**; sin ese filtro, las categorías de insumos aparecerían en el selector de productos.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `categorias.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `categorias.nombre` | `text` | `not null`. **Único sin acentos ni mayúsculas** — §35.10 |
| `descripcion` | `string` | **NUEVA** `categorias.descripcion` | `text` | Aparece en el export (`ExportarDatos.jsx:157`) pero **ningún sitio la escribe** |
| `color` | `string` HEX (default `#4A5568`) | `categorias.color` | `text` | `check ~ '^#[0-9a-fA-F]{6}$'` |
| `icono` | `string` | `categorias.icono` | `text` | directo |
| `orden` | `number` | `categorias.orden` | `integer` | `default 0`. Clave de ordenamiento válida |
| `activo` | `boolean` | **`categorias.activa`** | `boolean` | **T-ACTIVO — CAMBIA DE NOMBRE.** Es el caso que más fácil se pasa por alto |
| `estacion_preparacion_id` | `string` | **NUEVA** `categorias.estacion_preparacion_id` | `uuid` | FK a `estaciones_preparacion`, `on delete set null (estacion_preparacion_id)` |
| `estacion_preparacion_nombre` | `string` | **NUEVA** `categorias.estacion_nombre` | `text` | **SNAPSHOT.** Declarado «solo visual» (`:31`), pero `preparacionEstacionUtils.js` lo lee **sin consultar la estación** — si se deriva, la resolución cambia de comportamiento |
| `estacion_preparacion_color` | `string` HEX | **NUEVA** `categorias.estacion_color` | `text` | **SNAPSHOT**, mismo motivo |
| — | — | `categorias.tipo` | `text` | **Siempre `'producto'`.** Lo pone el puente, no el cliente |

Al desactivar una estación, `EstacionesPreparacionSection.jsx:233-251` reasigna sus categorías a la general o limpia los snapshots. Ese comportamiento pasa al comando y **la base lo respalda** con `on delete set null` sobre el puntero.

---

## 17 · `RecetaEscandallo` → `recetas`

**Tabla ancla:** `recetas` (`041_recetas_y_costeo.sql:15-31`). `RecetaEscandallo.id` = `recetas.id`.

`RecetaEscandallo.jsonc` declara **11 propiedades**.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `recetas.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `producto_id` | `string` | `recetas.producto_id` | `uuid` | `not null`, FK compuesta. `on delete cascade` |
| `ingrediente_id` | `string` | `recetas.insumo_id` | `uuid` | `not null`, FK compuesta. `on delete restrict` |
| `ingrediente_nombre` | `string` | `DERIVADO` | — | `join` a `insumos.nombre`. **No hace falta snapshot**: `on delete restrict` impide que el insumo desaparezca mientras una receta lo use |
| `cantidad_usada` | `number` | **NUEVA** `recetas.cantidad_capturada` | `numeric(14,4)` | **T-CANTIDAD**. §17.1 |
| `unidad_usada` | `string` **libre** | **NUEVA** `recetas.unidad_capturada` | `text` | §17.1 |
| `cantidad_convertida_unidad_base` | `number` | `recetas.cantidad` | `numeric(14,4)` | **T-CANTIDAD**. Es la que consume el inventario |
| `merma_porcentaje` | `number` % | `recetas.merma_bp` | `integer` | **T-PORCENTAJE**: `5` → `500`. `check between 0 and 10000` |
| `costo_unitario_base_snapshot` | `number` pesos | `DERIVADO` | — | `insumos.costo_unitario_centavos` **en vivo**. §17.2 |
| `costo_linea_calculado` | `number` pesos | `DERIVADO` | — | `costo_unitario × cantidad × (10000 + merma_bp)/10000`. §17.2 |
| `activo` | `boolean` | **NUEVA** `recetas.activa` | `boolean` | **T-ACTIVO — cambia de género.** §17.3 |
| `notas` | `string` | **NUEVA** `recetas.notas` | `text` | Sólo lo escribe el importador (`importExecutors.js:262`) |

`recetas.unidad` ya existe con `check (unidad in ('pieza','kg','g','l','ml','m'))`: es la unidad **de la cantidad convertida**, no la capturada.

### 17.1 Un defecto de 1000× que no está en la lista de `F1-01`

`RecetaFormDialog.jsx:225` escribe:

```js
cantidad_convertida_unidad_base: cant,   // ← es `cant`, sin convertir nada
```

Y `unidad_usada` viene de un `<Input>` de **texto libre editable** (`:365-366`), no de un selector.

Si el usuario escribe «kg» en un ingrediente cuya unidad base es `g`, se persiste la cantidad **en kilos** en el campo que el descuento de inventario consume **como gramos** (`POS.jsx:355`, `Caja.jsx:696`, `inventarioValidation.js:128`). **Error de 1000× en el consumo y en el costo.**

La ruta del CSV **sí convierte** (`importValidators.js:275`) y bloquea unidades incompatibles (`:247`) o personalizadas (`:258-268`). Las dos rutas al mismo campo no hacen lo mismo.

**Corrección del mapa:** se separan los dos conceptos en dos columnas. `cantidad_capturada` + `unidad_capturada` guardan lo que el usuario tecleó —para poder reeditarlo tal como lo escribió— y `recetas.cantidad` + `recetas.unidad` guardan **lo convertido**, con `check` sobre la unidad. La conversión la hace el comando `guardarReceta` en servidor con `convertirUnidad` (`packages/domain/src/catalogo/unidades.ts:70`), que **lanza** si las dimensiones no coinciden en vez de dejar pasar el valor.

### 17.2 `costo_unitario_base_snapshot` — deja de ser snapshot, a propósito

Es la mitad de **D-09**. Hoy es una copia del costo del ingrediente en el momento de guardar la receta, y nada la refresca.

**Se deriva en vivo** de `insumos.costo_unitario_centavos`. Consecuencia buscada: al subir el precio del café, el costo del capuchino cambia **en la siguiente lectura**, sin que nadie tenga que reabrir un formulario.

Se pierde la trazabilidad histórica del costo de una receta. **No importa**: la trazabilidad histórica de lo que se cobró vive en `orden_lineas` (§7), que sí es snapshot. La receta es catálogo vivo, no historia.

La fórmula de `costo_linea_calculado` está verificada contra las dos implementaciones y coinciden:

```
él:   cantidad_convertida * (1 + merma_porcentaje/100) * costo_unitario_base_snapshot
                                                      -- financialUtils.js:47-51
base: round(costo_unitario_centavos * cantidad * (10000 + merma_bp) / 10000)
                                                      -- inventario/recetas.ts:131
```

### 17.3 D-11 — borrado físico sin rollback, y peor de lo reportado

`RecetaFormDialog.jsx:201-231`:

```js
if (productoToEdit) {
  await ProductoTerminado.update(productoToEdit.id, productoData);   // :202 — ya escribió el costo
  for (const old of (recetaLinesToEdit || [])) {
    await RecetaEscandallo.delete(old.id);                            // :206 — DELETE FÍSICO
  }
}
for (const l of lineas) { ... RecetaEscandallo.create({...}) }         // :219 — DESPUÉS
```

Tres problemas encadenados:

1. **Borrado físico**, no suave — a diferencia del importador, que usa `activo:false` (`importExecutors.js:274`).
2. **Borra antes de crear**, sin transacción ni rollback. Si el `create` falla, el producto queda **sin receta** de forma irrecuperable, pero con el costo ya actualizado en `:202`.
3. Y el fallo es **silencioso**: un producto sin receta **no bloquea el cobro** (regla 6, `inventarioValidation.js:120-121`) y **no descuenta inventario** (`POS.jsx:349`, `Caja.jsx:693`). Nadie se entera hasta el conteo físico.

El importador hace justo lo contrario y lo documenta: crear primero, desactivar después, deshacer lo creado si falla (`importExecutors.js:190-200`, `:301-303`).

**Corrección del mapa:** `guardarReceta` es transaccional (tarea E4-3) y el borrado es suave vía `recetas.activa`. La restricción `unique (organizacion_id, producto_id, insumo_id)` de `041:28` obliga a que el borrado suave **reactive la fila existente** en vez de insertar una segunda; el comando hace `insert ... on conflict do update`.

---

## 18 · `MovimientoInventario` → `movimientos_stock`

**Tabla ancla:** `movimientos_stock`. `MovimientoInventario.id` = `movimientos_stock.id`.

`MovimientoInventario.jsonc` declara **15 propiedades**.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `movimientos_stock.id` | `uuid` | directo |
| `created_date` | `string` ISO | `created_at` | `timestamptz` | **T-FECHA** |
| `updated_date` | `string` ISO | `DERIVADO` | — | **= `created_date`.** Ledger inmutable: no hay `updated_at` y no debe haberlo |
| `ingrediente_id` | `string` | `insumo_id` | `uuid` | `not null`, `on delete restrict` |
| `ingrediente_nombre` | `string` | `DERIVADO` | — | `join`. `on delete restrict` garantiza que exista |
| `tipo_movimiento` | 6 valores | `tipo` | `text` | **T-ENUM**, §18.2 |
| **`cantidad`** | `number` **con signo incoherente** | `cantidad` | `numeric(14,4)` | **T-CANTIDAD**. §18.1 |
| `unidad_base` | `string` | `unidad` | `text` | directo |
| **`stock_anterior`** | `number` | **SE DESCARTA** | — | §18.3 |
| **`stock_nuevo`** | `number` | **SE DESCARTA** | — | §18.3 |
| `costo_unitario_en_momento` | `number` pesos | `costo_unitario_centavos` | `bigint` | **T-DINERO** |
| `costo_total_movimiento` | `number` pesos | `DERIVADO` | — | `abs(cantidad) × costo_unitario_centavos` |
| `referencia_tipo` | 5 valores | `referencia_tipo` | `text` | **T-ENUM**, §18.2 |
| `referencia_id` | `string` | `referencia_id` | `uuid` | Su código escribe `''` para ajustes (`AjustarStockDialog.jsx:234`); el destino usa `null` |
| `motivo` | `string` | `motivo` | `text` | directo. **`POS.jsx:361-376` no lo escribe** en el camino de precio fijo |
| `usuario_id` | `string` | `empleado_id` | `uuid` | FK a `empleos`, `on delete set null` |
| `usuario_nombre` | `string` | `DERIVADO` | — | `join` |
| `fecha` | `string` ISO | `created_at` | `timestamptz` | **T-FECHA**. Es el mismo instante; `MovimientosPanel.jsx:64` ya usa `m.fecha \|\| m.created_date` |

### 18.1 D-10 — el signo, confirmado con tres líneas

| Sitio | Valor escrito | Signo |
|---|---|---|
| `POS.jsx:319` (camino variable) | `-cantBase` | **negativo** |
| `POS.jsx:365` (camino precio fijo) | `totalDiscount` | **positivo** |
| `Caja.jsx:750` (los dos caminos) | `-cantidadTotal` | **negativo** |

La **misma operación semántica** —`tipo_movimiento: 'salida_venta'`— se guarda con signo opuesto según por dónde entre la venta. Un producto de precio fijo cobrado en POS queda con salida positiva; el mismo producto cobrado desde Caja queda negativo. Cualquier suma de `cantidad` en un reporte (`exportColumns.js:130`, `Registros.jsx:103`) es aritméticamente incoherente.

**Agravante no reportado:** `importExecutors.js:65` escribe `Math.abs(delta)` — **pierde el signo del ajuste**, y el delta real sólo queda en el texto de `motivo` (`:73`). Un ajuste que baja el stock se registra como si lo subiera.

**Cómo lo cierra el destino, y no con una convención.** `003_venta_caja_inventario.sql:369-378`:

```sql
constraint movimiento_stock_signo_coherente check (
  case
    when tipo in ('entrada_compra','devolucion','cancelacion',
                  'traspaso_entrada','inventario_inicial','produccion') then cantidad > 0
    when tipo in ('salida_venta','merma','traspaso_salida') then cantidad < 0
    else true
  end
)
```

Un `salida_venta` positivo **no se puede insertar**. La regla deja de vivir en la cabeza de quien escribe el `create`.

La migración de datos (tarea E4-7) normaliza el histórico: negativo para salidas, positivo para entradas.

### 18.2 Los dos enumerados

| `tipo_movimiento` (él) | `movimientos_stock.tipo` | Signo forzado |
|---|---|---|
| `entrada_compra` | `entrada_compra` | positivo |
| `salida_venta` | `salida_venta` | **negativo** |
| `ajuste_manual` | `ajuste` | libre |
| `merma` | `merma` | negativo |
| `devolucion` | `devolucion` | positivo |
| `correccion` | `ajuste` | libre |

`correccion` y `ajuste_manual` colapsan en `ajuste`: son el mismo hecho contable y su código sólo escribe `ajuste_manual` (verificado sobre los cinco sitios). Al leer, `ajuste` devuelve siempre `ajuste_manual`.

Valores que su código escribe y el destino gana: `cancelacion`, `traspaso_entrada`, `traspaso_salida`, `inventario_inicial`, `produccion`. `inventario_inicial` **sustituye** al `ajuste_manual` que hoy escribe `RegistrarInventarioInicialDialog.jsx:270`, y así el conteo inicial deja de confundirse con una corrección.

| `referencia_tipo` (él) | destino |
|---|---|
| `venta` | `orden` |
| `compra` | `compra` |
| `ajuste_inventario` | `manual` |
| `inventario_inicial` | `conteo` |
| `importacion` | `manual` |

### 18.3 `stock_anterior` y `stock_nuevo` se descartan a propósito

No es una omisión. `003_venta_caja_inventario.sql:337-340` lo dice:

> *Deliberadamente NO existen `stock_anterior` ni `stock_nuevo`: esos campos son la firma del patrón leer-calcular-escribir, que es lo que hacía perder actualizaciones con dos ventas simultáneas.*

Conservarlos sería conservar el defecto **D-06** con otro nombre: para escribir `stock_anterior` hay que **leer** el stock antes, y entre esa lectura y la escritura cabe otra caja.

**Qué se pierde y qué se hace en su lugar.** `exportColumns.js:126-138` los exporta. El puente los deriva con una suma acumulada:

```sql
sum(cantidad) over (partition by insumo_id, almacen_id order by created_at
                    rows between unbounded preceding and current row)
```

Es exacto —el ledger es inmutable— y **no se puede desincronizar del saldo**, que es justo lo que sí pasa hoy.

---

## 19 · `DescuentoInventarioVenta` → **VISTA** sobre `movimientos_stock`

`F1-02` §8, trampa T4, ya lo decidió: *«`DescuentoInventarioVenta` es una vista sobre `movimientos_stock` filtrada por `referencia_tipo = 'orden'`.»* Este mapa lo confirma y añade el detalle que faltaba.

`DescuentoInventarioVenta.jsonc` declara **12 propiedades**. Se escribe en tres sitios y **sólo se lee en cuatro**: `Inventario.jsx:99` («consumido hoy»), `CorteViewerDialog.jsx:35` y `CorteAutoDownloader.jsx:37` (resumen de ingredientes del corte).

| campo de Miguel | tipo real | origen en la vista | transformación |
|---|---|---|---|
| `id` | `string` | `movimientos_stock.id` | directo |
| `created_date` | `string` ISO | `created_at` | **T-FECHA** |
| `updated_date` | `string` ISO | `created_at` | igual que `created_date` |
| `venta_id` | `string` | `referencia_id` | Sólo filas con `referencia_tipo='orden'` |
| `detalle_venta_id` | `string` | **`null`** | ⚠ §19.1 |
| `producto_id` | `string` | **`null`** | ⚠ §19.1 |
| `ingrediente_id` | `string` | `insumo_id` | directo |
| `ingrediente_nombre` | `string` | `join` a `insumos.nombre` | directo |
| `cantidad_producto` | `number` | **`null`** | ⚠ §19.1 |
| `cantidad_ingrediente_por_producto` | `number` | **`null`** | ⚠ §19.1 |
| `cantidad_total_descontada` | `number` | `abs(cantidad)` | **T-CANTIDAD**. El movimiento es negativo; el descuento se lee positivo |
| `unidad_base` | `string` | `unidad` | directo |
| `costo_unitario_snapshot` | `number` pesos | `costo_unitario_centavos` | **T-DINERO** |
| `costo_total_descontado` | `number` pesos | `abs(cantidad) × costo_unitario_centavos` | **T-DINERO** |
| `fecha` | `string` ISO | `created_at` | **T-FECHA** |

### 19.1 Cuatro campos que la vista no puede reconstruir, y por qué se acepta

`movimientos_stock` agrega por insumo: `Caja.jsx:652-663` fusiona todas las líneas que usan el mismo ingrediente en **un solo movimiento**. Una orden con tres tacos y una quesadilla que comparten tortilla produce **un** movimiento de tortilla, no cuatro.

Por eso la vista no puede devolver `detalle_venta_id`, `producto_id`, `cantidad_producto` ni `cantidad_ingrediente_por_producto`: **el dato no existe en el destino**, no es que se pierda al traducir.

**Se acepta, y esto es lo que lo justifica:** ninguno de los cuatro se lee. Los tres consumidores usan sólo `ingrediente_id`, `cantidad_total_descontada`, `costo_total_descontado`, `unidad_base` y `fecha`.

Y ya hoy uno de los cuatro es poco fiable: **`POS.jsx:378-390` omite `detalle_venta_id`** en el camino de precio fijo, mientras que `POS.jsx:334` y `Caja.jsx:766` sí lo escriben. Los descuentos de productos de precio fijo cobrados en POS **ya son intrazables a la línea**.

**Si más adelante hiciera falta el desglose por línea**, la alternativa es añadir `orden_linea_id` a `movimientos_stock` y dejar de agregar. Cuesta multiplicar las filas del ledger. Se anota en §38 y no se hace ahora.

---

## 20 · `CorteCaja` → `sesiones_caja` + `cortes_turno`

**Una entidad, dos destinos, discriminados por `tipo_corte`.** Es la segunda traducción más delicada del documento.

`CorteCaja.jsonc` declara **38 propiedades**.

### 20.1 Por qué se parte en dos

`CorteCaja` es dos cosas distintas con el mismo nombre:

| `tipo_corte` | Qué es en realidad | Destino |
|---|---|---|
| `cierre_diario` | **La jornada de caja entera.** Se crea al abrir con `estado='abierto'` y se actualiza al cerrar. Mientras está abierto, **es la caja abierta** (§21) | `sesiones_caja` |
| `turno` | Un **corte parcial** dentro de esa jornada, con `corte_padre_id` apuntando a la abierta. No abre ni cierra nada; es un arqueo intermedio que el cajero firma | `cortes_turno` (nueva) |

Meter los dos en una tabla obligaría a que «la caja está abierta» dependiera de filtrar por `tipo_corte`, que es exactamente lo que hoy hace `useCajaAbierta.js:34-37` en el cliente sobre las últimas 50 filas.

### 20.2 Los totales **no se guardan**: se derivan

Es el cambio conceptual de esta entidad, y corrige **P2-10**, citado en `003_venta_caja_inventario.sql:288-291`:

> *En la fuente, `cortes_caja` guardaba `total_ventas`, `total_efectivo` y `numero_ventas` como columnas, y nunca se actualizaban al cobrar. El corte mostraba ceros con la caja llena.*

`sesiones_caja` **no tiene ninguna columna de totales**. `arqueoDeSesion` (`packages/data/src/repos/caja.ts:134`) los deriva de `movimientos_caja` y `pagos`. Lo que sí se guarda es lo que **sólo existe si alguien lo cuenta o lo teclea**: el efectivo contado, el retirado, las notas.

### 20.3 Tabla de campos

| campo de Miguel | tipo real | destino | tipo | transformación |
|---|---|---|---|---|
| `id` | `string` | `sesiones_caja.id` / `cortes_turno.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `folio` | `string` | `serie` + `folio` | `text` + `bigint` | Igual que §6.2, con serie `CC` para el cierre y `CT` para el turno. **Único** — §35.2 |
| `tipo_corte` | `cierre_diario`\|`turno` | `DERIVADO` | — | Lo dice la tabla de la que salió la fila |
| `corte_padre_id` | `string` | `cortes_turno.sesion_caja_id` | `uuid` | `not null` en `cortes_turno`; siempre `null` para un cierre diario |
| `fecha_inicio` | `string` ISO | `sesiones_caja.abierta_en` | `timestamptz` | **T-FECHA**. En el turno, el inicio del periodo cortado |
| `fecha_apertura` | `string` ISO | `sesiones_caja.abierta_en` | `timestamptz` | **T-FECHA**. §20.6 |
| `fecha_cierre` | `string` ISO | `sesiones_caja.cerrada_en` / `cortes_turno.cortado_en` | `timestamptz` | **T-FECHA** |
| `usuario_cajero_id` | `string` | `empleado_cierra_id` | `uuid` | FK a `empleos` |
| `usuario_cajero_nombre` | `string` | `DERIVADO` | — | `join` |
| `usuario_apertura_id` | `string` | `empleado_abre_id` | `uuid` | FK a `empleos`, `not null` |
| `usuario_apertura_nombre` | `string` | `DERIVADO` | — | `join` |
| `efectivo_inicial_contado` | `number` pesos | `fondo_inicial_centavos` | `bigint` | **T-DINERO** |
| `fondo_esperado_apertura` | `number` pesos | **NUEVA** `fondo_esperado_centavos` | `bigint` | **T-DINERO**. Viene del `dinero_dejado_en_caja` del cierre anterior (`useCajaAbierta.js:40-46`) |
| `diferencia_apertura` | `number` pesos | `DERIVADO` | — | `fondo_inicial_centavos − fondo_esperado_centavos` |
| `notas_apertura` | `string` | **NUEVA** `notas_apertura` | `text` | directo |
| `total_efectivo` | `number` pesos | `DERIVADO` | — | `sum(pagos.monto_centavos) where metodo='efectivo'` en el periodo |
| `total_tarjeta` | `number` pesos | `DERIVADO` | — | igual con `tarjeta` |
| `total_transferencia` | `number` pesos | `DERIVADO` | — | igual con `transferencia` |
| `total_general` | `number` pesos | `DERIVADO` | — | `sum(ordenes.total_centavos)` de las órdenes pagadas del periodo. ⚠ **REGLA 1: ventas SIN propina.** Declarado así en `CorteCaja.jsonc:97` |
| `total_propinas` | `number` pesos | `DERIVADO` | — | `sum(pagos.propina_centavos)`. ⚠ **REGLA 2: separada de ventas y utilidad** |
| `total_descuentos` | `number` pesos | `DERIVADO` | — | `sum(ordenes.descuento_centavos)` |
| `total_cancelaciones` | `number` pesos | `DERIVADO` | — | `sum(total_centavos) where estado='cancelada'` |
| `numero_ventas` | `number` | `DERIVADO` | — | `count(distinct orden_id)` — **no `count(pagos.id)`**: un pago mixto son varias filas y contarlas convertiría una venta en tres (`repos/caja.ts:158-160`) |
| `ticket_promedio` | `number` pesos | `DERIVADO` | — | `total_general / numero_ventas`, cero si no hay ventas |
| `costo_total_estimado` | `number` pesos | `DERIVADO` | — | `sum(ordenes.costo_total_centavos)` |
| `utilidad_bruta_total` | `number` pesos | `DERIVADO` | — | `sum(ordenes.utilidad_centavos)` |
| `margen_promedio` | `number` % | `DERIVADO` | — | **T-PORCENTAJE** sobre utilidad y total |
| `utilidad_neta_estimada` | `number` pesos | `DERIVADO` | — | `utilidad_bruta_total − total_gastos` (`CierreDiarioDialog.jsx:51`) |
| **`efectivo_esperado`** | `number` pesos | `DERIVADO` | — | §20.4 |
| `efectivo_contado` | `number` pesos | `efectivo_contado_centavos` | `bigint` | **T-DINERO**. **Se guarda**: sólo existe si alguien contó |
| `diferencia_efectivo` | `number` pesos | `DERIVADO` | — | `efectivo_contado − efectivo_esperado` |
| `dinero_dejado_en_caja` | `number` pesos | `DERIVADO` | — | `efectivo_contado_centavos − efectivo_retirado_centavos` |
| `total_gastos` | `number` pesos | `DERIVADO` | — | `abs(sum(movimientos_caja.monto_centavos)) where tipo='gasto'` |
| `estado` | `abierto`\|`cerrado`\|`registrado` | `sesiones_caja.estado` | `text` | §20.5 |
| `notas` | `string` | `notas_cierre` | `text` | directo |
| `resumen_ingredientes` | `string` | **NO EXISTE** | — | §20.7 |
| `propinas_por_mesero` | `string` con JSON | `DERIVADO` | — | §20.8 |

### 20.4 `efectivo_esperado` — hay tres fórmulas y no coinciden

Regla 4 de `F1-01` §3: *«`efectivo_esperado` del cierre = ventas en efectivo + propinas en efectivo. No sólo ventas.»*

Lo que el código hace de verdad, con línea:

| Dónde | Fórmula | ¿Propinas? |
|---|---|---|
| **Lo que se PERSISTE** — `Caja.jsx:974` (turno) y `Caja.jsx:1053` (cierre) | `resumen.totalEfectivo` = `metodosPagoExacto.efectivo.ventas` = `Σ max(0, monto_efectivo − propina_efectivo)` | **NO** |
| **Lo que se MUESTRA y con lo que se calcula la diferencia** — `CierreDiarioDialog.jsx:61,67,74` | `totalEfectivo + efPropinas` | **SÍ** |
| **Página legacy** — `CorteCaja.jsx:60,75` | `Σ monto_efectivo`, sin restar la propina | Sí, por accidente |

**Consecuencia auditable:** en un cierre diario con propinas en efectivo, `diferencia_efectivo ≠ efectivo_contado − efectivo_esperado` en el propio registro guardado. El delta es exactamente `propinas_efectivo`, y **ese valor no se persiste en el corte** —sólo `total_propinas` agregado (`Caja.jsx:1045`)— así que la diferencia **no es reconstruible desde la fila**.

**Decisión del mapa: manda la fórmula que el cajero usa para cuadrar**, o sea la que se muestra, que es también la de la regla 4. Y se deriva de una sola fuente:

```
efectivo_esperado  =  sum(movimientos_caja.monto_centavos)  de la sesión
```

Porque ahí entran, con su signo: el fondo de apertura (`tipo='apertura'`), cada venta cobrada en efectivo (`venta`), **cada propina cobrada en efectivo (`propina`)**, y los gastos y retiros en negativo. La tentación de escribir `fondo + ventas en efectivo` está mal dos veces —cuenta el fondo dos veces y no resta los retiros— y el comentario de `repos/caja.ts:120-133` ya lo advierte.

> ⚠ **Esto exige un cambio en el backend que hoy no está hecho.** `movimientos_caja.tipo` ya admite `'propina'` (`003:306`), pero **nada en `packages/app/src` escribe una propina**: `grep propina` sobre `packages/app`, `packages/contracts` y `packages/data` devuelve **una sola línea**, y es la declaración de la columna en `esquema.ts:304`. `cobrarOrden` no registra el movimiento y `repartirPagos` exige que los pagos sumen exactamente el total, sin margen para propina. Ver §38.2.
>
> **Diferencia de alcance que hay que anotar:** el `efectivo_esperado` derivado **incluye el fondo de apertura**; el de Miguel **no**. Al leer, el puente resta `fondo_inicial_centavos` para devolver el número que su interfaz espera. La base guarda el arqueo completo; él sigue viendo lo suyo.

### 20.5 `estado`

| `CorteCaja.estado` | Destino |
|---|---|
| `abierto` | `sesiones_caja.estado = 'abierta'` |
| `cerrado` | `sesiones_caja.estado = 'cerrada'` |
| `registrado` | **Constante para toda fila de `cortes_turno`.** Un corte de turno nace registrado y no cambia |

`sesiones_caja` sólo admite `'abierta'` y `'cerrada'` (`003:73`), y está bien: `registrado` nunca describió una sesión.

### 20.6 Dos flujos de corte que escriben esquemas distintos

Hallazgo que el mapa tiene que absorber: **hay dos páginas que crean cortes y no escriben lo mismo.**

- `pages/Caja.jsx` escribe `tipo_corte`, `fecha_apertura`, propinas y fondo.
- `pages/CorteCaja.jsx:85-88` escribe **sin `tipo_corte` y sin `fecha_apertura`**, y sin propinas ni `dinero_dejado_en_caja`.

Y como `useCajaAbierta.js:36` trata `!c?.tipo_corte` como `cierre_diario`, **un corte creado por la segunda página es reconocido como caja abierta por la primera.**

En el destino la ambigüedad desaparece: o la fila está en `sesiones_caja` o está en `cortes_turno`. El respaldo `fecha_apertura || fecha_inicio || created_date` de `Caja.jsx:140` sigue funcionando porque los tres se resuelven a `abierta_en`.

### 20.7 `resumen_ingredientes` — no existe

`CorteCaja.jsonc:172` lo declara. **`grep resumen_ingredientes` sobre todo el repositorio da cero coincidencias.** Nunca se escribe.

El consumo de ingredientes de un corte **se recalcula al vuelo** cada vez que se abre o se descarga el PDF: `CorteViewerDialog.jsx:72-101` y `CorteAutoDownloader.jsx:36-64` descargan `DescuentoInventarioVenta.list('-created_date', 3000)`, `Ingrediente.list()` y `RecetaEscandallo.list('-created_date', 2000)`, y si no hay descuentos **reconstruyen desde las recetas con merma**.

**Implicación:** el PDF de un corte antiguo puede dar cifras distintas hoy si las recetas o los costos cambiaron. Es un defecto real que no está en `F1-01`.

**Decisión:** el campo se expone siempre `null`. La consulta agregada `GET /cortes/:id/reporte` que `F1-01` §6 ya pide lo sustituye, calculado sobre `movimientos_stock` del periodo — que **sí** es inmutable, y por tanto reproducible.

### 20.8 `propinas_por_mesero` — dos formas distintas del mismo dato

Es un `string` con JSON. Se genera en `Caja.jsx:160-173` y se serializa en `:970` y `:1046`:

```json
[{"mesero_id":"abc|null","mesero_nombre":"Juan|Caja / venta directa","total":123.45}]
```

**Tres claves.** Pero `agruparPropinasPorMesero` (`tipsUtils.js:57-63`), que alimenta `desglose_meseros` de `LiquidacionPropina`, produce **cinco** (`total`, `num_ventas`, `venta_ids`) y usa otra etiqueta: `'Sin mesero / venta directa'`.

**Se deriva**, con la forma de tres claves, para no romper `CorteTicket.jsx:13-23`, que ya parsea tolerando cadena, arreglo o JSON inválido, y sólo consume `mesero_nombre` y `total` (`:211-212`), y sólo en el paquete `restaurante_pro` (`:200`).

```sql
select o.empleado_atiende_id as mesero_id,
       coalesce(p.nombre, 'Caja / venta directa') as mesero_nombre,
       sum(pg.propina_centavos) as total
  from pagos pg join ordenes o on o.id = pg.orden_id
  left join empleos e on e.id = o.empleado_atiende_id
  left join personas p on p.id = e.persona_id
 where pg.sesion_caja_id = $1 and pg.propina_centavos > 0
 group by 1, 2;
```

Se omiten las propinas en cero, igual que `Caja.jsx:163`.

---

## 21 · `SesionCaja` → `sesiones_caja`

**No es una entidad de Miguel.** `grep "SesionCaja"` sobre `historico/` da **cero**. El único sitio del repositorio donde aparece el nombre es la lista blanca del puente nuevo (`apps/web/heredado/api/cliente.ts:170`).

Una caja abierta es un `CorteCaja` con `estado='abierto'`. La definición canónica es `useCajaAbierta.js:34-37`:

```js
const cajaAbierta = safeCortes.find(c =>
  c?.estado === 'abierto' &&
  (c?.tipo_corte === 'cierre_diario' || !c?.tipo_corte)
) || null;
```

Sobre `CorteCaja.list('-created_date', 50)` (`:25`) — **sin filtro en el servidor**: filtra en el cliente sobre las últimas 50 filas. Si hubiera 51 cortes desde la última apertura, la caja abierta se vuelve invisible.

**La unicidad de «una sola caja abierta» hoy es sólo cliente.** `Caja.jsx:913-922` relee la lista justo antes de crear y aborta si encuentra otra abierta. Es TOCTOU: entre la lectura y la escritura cabe otra apertura.

**El destino ya lo cierra** (`003_venta_caja_inventario.sql:96-98`, §35.6), y el propio comentario del archivo lo explica: *«La comprobación equivalente en código es "busca si hay una abierta, y si no, inserta" — y entre el SELECT y el INSERT cabe otra transacción haciendo lo mismo.»*

El puente expone `SesionCaja` como alias de lectura de `sesiones_caja` con `estado='abierta'`, con los mismos campos de §20. Su código no la usa; existe para que la lista blanca del puente sea explícita.

---

## 22 · `Compra` (`CompraInsumo`) → `compras` (tabla nueva)

`CompraInsumo.jsonc` declara **9 propiedades**. Objeto literal en `RegistrarCompraDialog.jsx:229-238`.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `compras.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `proveedor_id` | `string` (puede ser `''`) | `compras.proveedor_id` | `uuid` | `on delete set null`. `''` se traduce a `null` |
| `proveedor_nombre` | `string` (default `'Compra directa'`) | `compras.proveedor_nombre` | `text` | **SNAPSHOT `not null`.** Es lo que justifica el borrado suave del proveedor (§24) |
| `fecha` | `string` `YYYY-MM-DD` | `compras.fecha` | `date` | **`date`, no `timestamptz`**: el `.jsonc` la declara `format: date` y `ResumenPeriodo.jsx:46` la compara por día |
| `total_compra` | `number` pesos | `compras.total_centavos` | `bigint` | **T-DINERO**. Es `Σ costo_total` de las líneas (`:121`) |
| `metodo_pago` | `efectivo`\|`tarjeta`\|`transferencia` | `compras.metodo_pago` | `text` | **T-ENUM** |
| `factura_folio` | `string` | `compras.factura_folio` | `text` | **NUNCA SE ESCRIBE.** Aparece en `exportColumns.js:57` y la columna sale siempre vacía |
| `notas` | `string` | `compras.notas` | `text` | directo |
| `usuario_id` | `string` | `compras.empleado_id` | `uuid` | FK a `empleos` |
| `usuario_nombre` | `string` | `DERIVADO` | — | `join` |

**D-12, confirmado.** `RegistrarCompraDialog.jsx:229` crea la cabecera; el bucle de líneas va después (`:240-366`) y el `catch` de `:391` sólo hace `toast.error`. Si falla la línea 3 de 5, quedan la cabecera con `total_compra` correcto y tres líneas. Sin rollback.

**Corrección:** `registrarCompra` es un comando transaccional (tarea E4-5) que escribe cabecera, líneas, movimientos de stock, existencias y el costo promedio ponderado (§14.2) en **una** transacción.

---

## 23 · `CompraLinea` (`DetalleCompra`) → `compra_lineas` (tabla nueva)

`DetalleCompra.jsonc` declara **10 propiedades**. Objeto literal en `RegistrarCompraDialog.jsx:315-324`.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `compra_lineas.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `compra_id` | `string` | `compra_lineas.compra_id` | `uuid` | `not null`, FK compuesta, `on delete cascade` |
| `ingrediente_id` | `string` | `compra_lineas.insumo_id` | `uuid` | `not null`, `on delete restrict` |
| `ingrediente_nombre` | `string` | `compra_lineas.insumo_nombre` | `text` | **SNAPSHOT `not null`** |
| `cantidad_comprada` | `number` | `compra_lineas.cantidad_capturada` | `numeric(14,4)` | **T-CANTIDAD**. Está **en unidad de compra**, no en base |
| `unidad_compra` | `string` | `compra_lineas.unidad_capturada` | `text` | directo |
| `cantidad_convertida_unidad_base` | `number` | `compra_lineas.cantidad` | `numeric(14,4)` | **T-CANTIDAD**. Ya convertida |
| — | — | **NUEVA** `compra_lineas.equivalencia` | `numeric(14,4)` | §23.1 |
| `costo_total` | `number` pesos | `compra_lineas.costo_total_centavos` | `bigint` | **T-DINERO** |
| `costo_unitario_base_calculado` | `number` pesos | `DERIVADO` | — | `costo_total_centavos / cantidad`. Guardar los dos es guardar el mismo dato dos veces |
| `fecha_caducidad` | `string` `YYYY-MM-DD` | `compra_lineas.caduca_el` | `date` | Declarado y **nunca escrito** por el diálogo |
| `notas` | `string` | `compra_lineas.notas` | `text` | directo |

### 23.1 El campo que falta y hace la compra inauditable

`piezas_por_paquete` se usa para calcular la conversión (`RegistrarCompraDialog.jsx:301`) y **no se persiste**. Una compra de «3 cajas» queda guardada como `cantidad_comprada: 3, unidad_compra: 'caja', cantidad_convertida: 36000`, **sin decir en ningún lado que una caja traía 12 kg**.

Seis meses después no hay forma de saber si la conversión fue correcta ni de reproducir el costo unitario. Es un hueco de trazabilidad en una tabla contable.

**Se añade la columna `equivalencia`.** Es una columna, y sin ella la compra no se puede auditar.

---

## 24 · `Proveedor` → `proveedores` (tabla nueva)

`Proveedor.jsonc` declara **8 propiedades**. Escrito en `ProveedoresSection.jsx:61-68` y `importExecutors.js:320-327`.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `proveedores.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `proveedores.nombre` | `text` | `not null` |
| `contacto` | `string` | `proveedores.contacto` | `text` | directo |
| `telefono` | `string` | `proveedores.telefono` | `text` | directo |
| `whatsapp` | `string` | `proveedores.whatsapp` | `text` | Declarado; el diálogo **no lo escribe** (`:61-68` no lo incluye) |
| `correo` | `string` | `proveedores.correo` | `text` | directo |
| `direccion` | `string` | `proveedores.direccion` | `text` | Declarado; el diálogo **no lo escribe** |
| `notas` | `string` | `proveedores.notas` | `text` | directo |
| `activo` | `boolean` | `proveedores.activo` | `boolean` | **T-ACTIVO**, mismo género |

El borrado suave está bien justificado en el propio código (`ProveedoresSection.jsx:88-89`): las compras conservan `proveedor_nombre` como snapshot.

**Defecto detectado:** `handleSave` escribe `activo: true` **incondicionalmente** (`:67`), así que editar un proveedor desactivado lo reactiva sin avisar. El comando de escritura no incluye `activo` en el parche de edición; la reactivación es una acción propia.

---

## 25 · `GastoOperativo` → `gastos` (+ `movimientos_caja`)

`GastoOperativo.jsonc` declara **8 propiedades**. Tres sitios lo escriben, los tres con los mismos campos.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `gastos.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `fecha` | `string` `YYYY-MM-DD` | `gastos.fecha` | `date` | `format: date` en el `.jsonc` |
| `categoria` | 7 valores | `gastos.categoria` | `text` | **T-ENUM** directo |
| `descripcion` | `string` | `gastos.descripcion` | `text` | `not null` |
| `monto` | `number` pesos | `gastos.monto_centavos` | `bigint` | **T-DINERO**, `check > 0` |
| `metodo_pago` | `efectivo`\|`tarjeta`\|`transferencia` | `gastos.metodo_pago` | `text` | **T-ENUM** |
| `usuario_id` | `string` | `gastos.empleado_id` | `uuid` | FK a `empleos` |
| `usuario_nombre` | `string` | `DERIVADO` | — | `join` |
| `notas` | `string` | `gastos.notas` | `text` | §25.1 |
| — | — | **NUEVA** `gastos.sesion_caja_id` | `uuid` | §25.2 |
| — | — | **NUEVA** `gastos.plantilla_gasto_id` | `uuid` | §25.1 |

### 25.1 Dos datos que hoy viajan dentro de `notas`

- **`recurrente`.** `RegistrarGastoDialog.jsx:51-53` no guarda un booleano: **antepone el texto `[RECURRENTE/FIJO MENSUAL]` a `notas`**. Se pierde en cuanto alguien edita la nota.
- **El vínculo con la plantilla.** `PlantillasGastoSection.jsx:97-106` escribe `notas: '[Desde plantilla: X] ...'` y **no guarda `plantilla_id`**. El anti-duplicado de `:81` depende de emparejar ese texto.

Las dos van a columnas: `gastos.es_recurrente boolean` y `gastos.plantilla_gasto_id uuid`. El puente compone el prefijo al leer, para que la interfaz siga viéndose igual, y lo reconoce al escribir para no perder los gastos ya capturados.

### 25.2 Un gasto en efectivo mueve la caja

Hoy `Caja.jsx:189` suma los gastos del turno leyendo `GastoOperativo` y filtrando por fecha. En el destino, un gasto pagado **en efectivo** inserta además una fila en `movimientos_caja` con `tipo='gasto'` y **monto negativo** (`check movimiento_signo_coherente`), en la misma transacción.

Así `total_gastos` y `efectivo_esperado` (§20.4) salen de la **misma** fuente y no pueden discrepar. Un gasto con tarjeta no genera movimiento: no salieron billetes del cajón.

---

## 26 · `PlantillaGasto` → `plantillas_gasto` (tabla nueva)

`PlantillaGasto.jsonc` declara **10 propiedades**. Payload en `PlantillaGastoDialog.jsx:86-95`.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `plantillas_gasto.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `nombre` | `text` | `not null` |
| `categoria` | 7 valores | `categoria` | `text` | **T-ENUM**, mismos que `gastos` |
| `monto_sugerido` | `number` pesos | `monto_sugerido_centavos` | `bigint` | **T-DINERO** |
| `metodo_pago` | 3 valores | `metodo_pago` | `text` | **T-ENUM** |
| `periodicidad` | `mensual`\|`semanal`\|`quincenal`\|`anual`\|`unico` | `periodicidad` | `text` | **T-ENUM** |
| `dia_pago_sugerido` | `number` 1-31 | `dia_pago_sugerido` | `smallint` | `check between 1 and 31`. Declarado «solo informativo» |
| `notas` | `string` | `notas` | `text` | directo |
| `activa` | `boolean` | `activa` | `boolean` | **T-ACTIVO**. Ya es femenino en los dos lados |
| `ultima_fecha_uso` | `string` ISO | `ultimo_uso_en` | `timestamptz` | **T-FECHA** |
| `veces_usada` | `number` | `veces_usada` | `integer` | `default 0`, `check >= 0` |

`veces_usada` y `ultima_fecha_uso` sí se incrementan al usar la plantilla (`PlantillasGastoSection.jsx:110-113`). El comando lo hace en la misma transacción que crea el gasto.

---

## 27 · `PlantillaCompra` → `plantillas_compra` (tabla nueva)

`PlantillaCompra.jsonc` declara **7 propiedades**, una de ellas un arreglo embebido.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `plantillas_compra.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `nombre` | `text` | `not null` |
| `proveedor_nombre` | `string` | `proveedor_nombre` | `text` | Snapshot de texto; la plantilla no apunta a un proveedor |
| `lineas` | `Array` de 5 claves | `lineas` | `jsonb` | §27.1 |
| `activa` | `boolean` | `activa` | `boolean` | **T-ACTIVO** |
| `notas` | `string` | `notas` | `text` | directo |
| `ultima_fecha_uso` | `string` ISO | `ultimo_uso_en` | `timestamptz` | **T-FECHA** |
| `veces_usada` | `number` | `veces_usada` | `integer` | §27.2 |

### 27.1 Por qué `lineas` se queda como `jsonb` y `PedidoPreparacion.items` no

Es la excepción a la normalización de §10.1, y la diferencia es real:

- `comanda_items` **se consulta y se actualiza fila por fila** desde cocina, en vivo, con dos pantallas abiertas.
- `plantillas_compra.lineas` se lee **entera de una vez** para precargar un formulario (`RepetirCompraDialog.jsx:113-130`) y **nunca se actualiza parcialmente**. No hay consulta que la filtre ni concurrencia que la pise.

Normalizarla costaría una tabla y no compraría nada. Cada línea tiene cinco claves: `ingrediente_id`, `ingrediente_nombre`, `cantidad`, `unidad_compra`, `costo_total`. El `jsonb` lleva `check (jsonb_typeof(lineas) = 'array')`.

### 27.2 Los contadores congelados

`veces_usada` se escribe **una sola vez, en 1**, al crear la plantilla (`RegistrarCompraDialog.jsx:374`). `RepetirCompraDialog.jsx:113-130` sólo carga las líneas en memoria y **nunca incrementa** — al contrario que `PlantillaGasto`, que sí lo hace. Los contadores se quedan en 1 para siempre.

Se corrige en el comando: reutilizar una plantilla incrementa `veces_usada` y actualiza `ultimo_uso_en`, igual que su gemela de gastos.

---

## 28 · `SolicitudQR` → `solicitudes_qr` (tabla nueva)

`SolicitudQR.jsonc` declara **21 propiedades**.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `solicitudes_qr.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `mesa_id` | `string` | `mesa_id` | `uuid` | `not null`, FK compuesta a `mesas` |
| `mesa_nombre` | `string` | `DERIVADO` | — | `join` |
| `mesa_numero` | `number` | `DERIVADO` | — | `join` |
| `tipo` | `ordenar`\|`cuenta`\|`ayuda` | `tipo` | `text` | `not null`, **T-ENUM** |
| `estado` | `pendiente`\|`atendida`\|`resuelta`\|`cancelada` | `estado` | `text` | **T-ENUM**, §28.1 |
| `fecha_creacion` | `string` ISO | `created_at` | `timestamptz` | **T-FECHA**. Mismo instante |
| `fecha_atendida` | `string` ISO | `atendida_en` | `timestamptz` | **T-FECHA** |
| `fecha_resuelta` | `string` ISO | `resuelta_en` | `timestamptz` | **T-FECHA** |
| `atendido_por_id` | `string` | `empleado_atiende_id` | `uuid` | FK a `empleos`, `on delete set null` |
| `atendido_por_nombre` | `string` | `DERIVADO` | — | `join` |
| `mesero_destino_id` | `string` | `empleado_destino_id` | `uuid` | FK a `empleos`, `on delete set null` |
| `mesero_destino_nombre` | `string` | `DERIVADO` | — | `join` |
| `ruteo_modo` | `asignado`\|`general` | `ruteo_modo` | `text` | **T-ENUM** |
| `origen` | `string` (default `portal_qr`) | `origen` | `text` | directo |
| `token_mesa` | `string` | `token_mesa` | `text` | **SNAPSHOT** del token con el que entró el comensal |
| `notas` | `string` | `notas` | `text` | **NUNCA SE ESCRIBE** (`:74`) |
| `venta_id` | `string` | `orden_id` | `uuid` | FK a `ordenes`. Declarado «solo informativo, no se usa para cobrar» |
| `subtotal_consumo` | `number` pesos | `subtotal_consumo_centavos` | `bigint` | **T-DINERO**. Snapshot informativo |
| `propina_monto_sugerida` | `number` pesos | `propina_sugerida_centavos` | `bigint` | **T-DINERO** |
| `propina_porcentaje_sugerido` | `number` % | `propina_sugerida_bp` | `integer` | **T-PORCENTAJE** |
| `propina_tipo` | 5 valores | `propina_tipo` | `text` | **T-ENUM** |
| `total_estimado` | `number` pesos | `DERIVADO` | — | `subtotal_consumo + propina_sugerida`. Declarado así en `:113` |

### 28.1 Transiciones y un hueco de interfaz

```
(nueva)              --> pendiente     PortalCliente.jsx:545 · PedirCuentaQR.jsx:249
pendiente            --> atendida      + atendida_en, empleado_atiende_id
                                       SolicitudesQRPanel.jsx:60-65 · SolicitudesQRCardList.jsx:60-65 · SolicitudesQRTab.jsx:96-101
pendiente|atendida   --> resuelta      + resuelta_en
                                       SolicitudesQRPanel.jsx:81-86 · SolicitudesQRTab.jsx:103-108
pendiente|atendida   --> cancelada     sólo admin, SolicitudesQRTab.jsx:111 — NO escribe fecha ni quién
```

**Hueco:** `PortalCliente.jsx:165` consulta cada 4 s y considera cerrada la solicitud si `estado === 'atendida' || 'resuelta'`. **`cancelada` no se detecta**, así que si el administrador cancela, el comensal se queda esperando para siempre. Se anota en §38; el mapa no lo arregla porque es comportamiento de interfaz.

**Es una de las dos entidades con borrado físico legítimo** (§0.3): `SolicitudesQRTab.jsx:62-66` vacía la lista y `asignacionMesas.js:191-201` purga las anteriores al inicio del día operativo.

**Anti-duplicado.** `PortalCliente.jsx:524-532` consulta `filter({mesa_id, tipo, estado:'pendiente'})` antes de crear. Es TOCTOU y es el defecto **D-17**. Lo cierra el índice único parcial de §35.11: **una sola solicitud pendiente por mesa y tipo**.

---

## 29 · `MenuQRSeccion` → `menu_qr_secciones` (tabla nueva)

`MenuQRSeccion.jsonc` declara **6 propiedades**. La tocan sólo dos archivos.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `menu_qr_secciones.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `nombre` | `string` | `nombre` | `text` | `not null` |
| `descripcion` | `string` | `descripcion` | `text` | directo |
| `imagen_url` | `string` | `imagen_url` | `text` | directo |
| `archivo_url` | `string` | **SE DESCARTA** | — | **Ni se escribe ni se lee en ningún archivo.** Declarado como «URL alternativa PDF/imagen» (`:16-19`) y muerto por completo |
| `orden` | `number` | `orden` | `integer` | `default 0`. Clave de ordenamiento válida: `MenuQRTab.jsx:25` hace `list('orden', 100)` |
| `activo` | `boolean` | `activa` | `boolean` | **T-ACTIVO — cambia de género.** «Sección» es femenino |

Lectura pública: `PortalCliente.jsx:131-136` filtra `{activo: true}` y sólo si `portal_qr_activo` y el modo de menú es `menu_subido` o `mixto`. **Es una de las tres entidades legibles sin sesión** (§36.2).

---

## 30 · `LiquidacionPropina` → `liquidaciones_propina` (tabla nueva)

`LiquidacionPropina.jsonc` declara **13 propiedades**. Un solo punto de escritura: `LiquidarPropinasDialog.jsx:93-110`.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `liquidaciones_propina.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `folio` | `string` `LIQ-AAAAMMDD-HHMMSS` | `serie` + `folio` | `text` + `bigint` | **Formato distinto al de `generateFolio`** (`:92`). Va a la misma secuencia atómica con serie `LIQ` |
| `fecha_liquidacion` | `string` ISO | `liquidada_en` | `timestamptz` | **T-FECHA**. Clave de ordenamiento válida |
| `rango_inicio` | `string` ISO | `rango_inicio` | `timestamptz` | **T-FECHA** |
| `rango_fin` | `string` ISO | `rango_fin` | `timestamptz` | **T-FECHA**, `check (rango_fin >= rango_inicio)` |
| `rango_tipo` | 6 valores | `rango_tipo` | `text` | **T-ENUM** |
| `mesero_id` | `string` \| `null` | `empleado_id` | `uuid` | `null` = liquidación global |
| `mesero_nombre` | `string` | `DERIVADO` | — | `join`, o `'Todos los meseros'` si `empleado_id` es nulo |
| `total_liquidado` | `number` pesos | `total_centavos` | `bigint` | **T-DINERO** |
| `numero_ventas` | `number` | `DERIVADO` | — | `count(*)` de `ordenes` con este `propina_liquidacion_id` |
| `venta_ids` | `string` con JSON | `DERIVADO` | — | §30.1 |
| `desglose_meseros` | `string` con JSON | `DERIVADO` | — | §30.1 |
| `usuario_liquido_id` | `string` | `empleado_liquida_id` | `uuid` | FK a `empleos` |
| `usuario_liquido_nombre` | `string` | `DERIVADO` | — | `join` |
| `notas` | `string` | `notas` | `text` | directo |

### 30.1 Los dos JSON que nadie lee, y la relación que sí hace falta

- **`venta_ids`** es `JSON.stringify(ventasFiltradas.map(v => v.id))` (`:105`). **Nadie lo parsea** en todo el sistema.
- **`desglose_meseros`** es el JSON de `agruparPropinasPorMesero` (`tipsUtils.js:57-63`), cinco claves por mesero. **Tampoco tiene lector.**

Los dos **se derivan** de la relación inversa: `ordenes.propina_liquidacion_id` (§6.4) ya dice qué ventas entraron en qué liquidación. Guardar además la lista serializada es guardar el mismo dato dos veces, en un formato que no se puede consultar.

Al derivarlos, aparece algo que hoy no existe: **se puede saber qué ventas entraron en una liquidación con una consulta**, que es lo que hace falta para revertirla.

### 30.2 La liquidación no es atómica

`LiquidarPropinasDialog.jsx:113-126` marca las ventas en lotes de 5 con `Promise.all`, y `:122` **se traga los errores** con `console.error`. Si un `update` falla, la `LiquidacionPropina` ya está creada y esa venta sigue pendiente — se volverá a liquidar la próxima vez.

`liquidarPropinas` es una de las 14 operaciones transaccionales de `F1-01` §6. En una transacción: crear la liquidación y marcar las órdenes. **O las dos cosas, o ninguna.**

También desaparece el respaldo de `:120` (`liquidacion?.id || folio`, que mete un folio donde debería ir un identificador): dentro de la transacción el `id` siempre existe.

---

## 31 · `UnidadMedida` → `configuracion.valores.unidades.compra`

**No es una entidad.** `grep "UnidadMedida"` sobre `src/` da **cero**.

Las unidades viven en **un campo de texto separado por comas**: `ConfiguracionNegocio.unidades_medida_lista`.

| Qué | Dónde |
|---|---|
| Definición | `utils/unidadesMedida.js:4` |
| Lectura | `unidadesMedida.js:170` — `parseUnidadesList(config?.unidades_medida_lista || '')` |
| Escritura | `UnidadesMedidaSection.jsx:50` — `update(cfg.id, { unidades_medida_lista: limpio })` |
| Serialización | `UnidadesMedidaSection.jsx:48` — `parsed.join(', ')` |

| campo de Miguel | tipo real | destino | transformación |
|---|---|---|---|
| `ConfiguracionNegocio.unidades_medida_lista` | `string` con comas | `configuracion.valores.unidades.compra` | `jsonb` **arreglo de cadenas**. Al leer, `join(', ')`; al escribir, `parseUnidadesList` en servidor |

**La regla 7 de `F1-01` §3 se conserva textualmente:** las nueve de `DEFAULT_UNIDADES_COMPRA` **se re-fusionan siempre**, aunque el admin las borre, porque la conversión depende de ellas. Eso lo hace hoy `getUnidadesCompra()` (`unidadesMedida.js:169-181`) y pasa al servidor sin cambiar la semántica: se deduplica con `normalizeUnidad` —minúsculas, sin acentos, espacios colapsados— conservando la forma visible que escribió el usuario.

Las **unidades base** (`g`, `ml`, `pieza`) son otra cosa y **no son configurables**: van al `check` de `insumos.unidad_base` (§35.12).

> **Tres funciones distintas se llaman `convertirAUnidadBase`**, con firmas y dominios incompatibles: `unidadesMedida.js:133` (3 argumentos, con equivalencia), `tipoVentaUtils.js:52` (2 argumentos, conjunto cerrado `g/kg/ml/l`), y la muerta de `unitConversions.js:10`. Además `unitConversions.js` y `UNIT_CONVERSIONS` de `constants.js:2-12` son **código muerto verificado**: `convertToBaseUnits`, `calculateWeightedAvgCost`, `formatUnit` y `UNIT_LABELS` no tienen ningún consumidor. Al portar, sólo sobrevive `convertirUnidad` del dominio (`packages/domain/src/catalogo/unidades.ts:70`).

---

## 32 · `IntegrationSyncLog` → `bitacora_sincronizacion` (tabla nueva)

`F1-02` §8, trampa T4, dice: *«`IntegrationSyncLog` es una tabla simple.»* Confirmado.

`IntegrationSyncLog.jsonc` declara **10 propiedades**. Único punto de creación: `Caja.jsx:1080-1095`, dos filas por cierre diario, en `Promise.all` y con `try/catch` no bloqueante.

| campo de Miguel | tipo real | columna destino | tipo destino | transformación |
|---|---|---|---|---|
| `id` | `string` | `bitacora_sincronizacion.id` | `uuid` | directo |
| `created_date` / `updated_date` | `string` ISO | `created_at` / `updated_at` | `timestamptz` | **T-FECHA** |
| `record_type` | `string` | `tipo_registro` | `text` | `not null`. Valores observados: `cash_cut`, `cash_cut_pdf` |
| `record_id` | `string` | `registro_id` | `uuid` | `not null`. Es `sesiones_caja.id` |
| `destination` | `google_sheets`\|`google_drive`\|`local_export` | `destino` | `text` | `not null`, **T-ENUM** |
| `status` | `pending`\|`pending_external_sync`\|`synced`\|`failed` | `estado` | `text` | **T-ENUM**. **Sólo se escribe `pending_external_sync`**; `synced` y `failed` no los escribe nadie, aunque `StatusBadge` los contempla |
| `attempts` | `number` | `intentos` | `integer` | `default 0`. §32.1 |
| `last_attempt_at` | `string` ISO | `ultimo_intento_en` | `timestamptz` | **T-FECHA** |
| `error_message` | `string` | `mensaje_error` | `text` | Nunca escrito |
| `file_url` | `string` | `archivo_url` | `text` | Nunca escrito |
| `sheet_tab` | `string` | `pestana_hoja` | `text` | Nunca escrito |
| `payload_snapshot` | `string` con JSON | `payload` | `jsonb` | Nunca escrito. Va a `jsonb`, no a `text`: si algún día se escribe, será consultable |

### 32.1 Los campos que se escriben y nadie mira

`intentos` y `ultimo_intento_en` se escriben en `0` y `now()` y **jamás se actualizan**. El botón «Reintentar» de `IntegracionesRespaldos.jsx:68-73` es `await new Promise(r => setTimeout(r, 800))` más un aviso: no reintenta nada.

**Las columnas entran igual**, porque la tabla es una bitácora y su forma es correcta; lo que falta es el trabajador que la consuma. Se anota en §38 y no se construye en Fase 1.

---

## 33 · `CategoriaIngrediente` → `categorias` con `tipo='insumo'`

No está en la lista de 27 del encargo, pero **es una de las 25 entidades reales** y `Inventario.jsx` la consulta. Se documenta para que el puente no la olvide.

| campo de Miguel | tipo real | columna destino | transformación |
|---|---|---|---|
| `id` | `string` | `categorias.id` | directo |
| `nombre` | `string` | `categorias.nombre` | `not null` |
| `descripcion` | `string` | `categorias.descripcion` | **NUEVA** (§16) |
| `color` | `string` HEX (default `#718096`) | `categorias.color` | directo |
| `activo` | `boolean` | `categorias.activa` | **T-ACTIVO — cambia de nombre** |
| — | — | `categorias.tipo` | **Siempre `'insumo'`** |

### 33.1 Es una entidad zombi, y conviene decirlo

**Un solo uso en los 244 archivos:** `Inventario.jsx:92`, `filter({ activo: true })`, consumido en `:122` para resolver el nombre de la categoría de un ingrediente.

Pero:

- **No hay ninguna interfaz para crear, editar o desactivar una `CategoriaIngrediente`.** Cero `create`, cero `update`, cero `delete`. No hay sección en Configuración, al contrario que `CategoriasProductoSection` o `ProveedoresSection`.
- **Ningún sitio escribe `Ingrediente.categoria_id`** (verificado sobre los tres puntos de alta de §14).
- Por tanto `categorias.find(c => c.id === i.categoria_id)` **siempre resuelve a cadena vacía**, y el comentario de `Inventario.jsx:120-121` describe el síntoma sin nombrar la causa.
- No aparece en `ExportarDatos.jsx`, ni en `importValidators.js`, ni en `importExecutors.js`.

**Veredicto: se lee pero no se usa.** Es una consulta muerta que cuesta una llamada de red en cada montaje de Inventario. Las categorías de ingredientes **no existen** en el producto.

**Decisión:** el puente la expone (devuelve las `categorias` con `tipo='insumo'`, que serán cero) para que `Inventario.jsx` se porte sin cambios. **No se construye interfaz para ella en Fase 1.** Si Miguel la quiere, es una sección nueva, no un arreglo.

---

# 34 · Tablas que faltan crear

DDL propuesto para la tarea **E3-1**. Sigue las diez convenciones de §3.

Se propone repartirlo en tres migraciones, por el mismo motivo por el que existe `006_endurecimiento.sql`: las migraciones ya aplicadas **no se editan**, porque su huella está en el registro y el ejecutor avisa —con razón— de una migración modificada después de aplicarse.

| Migración | Contenido |
|---|---|
| `050_restaurante_columnas.sql` | Los `alter table` sobre las 8 tablas existentes (§34.1 a §34.8) |
| `051_restaurante_tablas.sql` | Las 16 tablas nuevas y la vista (§34.9 a §34.25) |
| `052_restaurante_restricciones.sql` | Las restricciones de `F1-01` §6 (§35) |

## 34.0 · Prerrequisito: `unaccent` inmutable

`F1-01` §6 pide índices únicos «sin acentos ni mayúsculas». Hay una trampa de Postgres que hay que resolver antes de escribir el primer índice.

**`unaccent()` es `STABLE`, no `IMMUTABLE`**, porque depende de un diccionario que se puede recargar. Postgres **rechaza** una función no inmutable en la expresión de un índice. Usarla directamente da `functions in index expression must be marked IMMUTABLE` y la migración aborta.

La solución estándar es un envoltorio inmutable, con `search_path` fijo por la misma razón que `006_endurecimiento.sql:29` se lo puso a `tocar_updated_at`.

```sql
create extension if not exists unaccent with schema extensions;

-- Envoltorio INMUTABLE. `unaccent()` es STABLE y Postgres no la admite en un
-- índice. Se marca inmutable a sabiendas: el diccionario `unaccent` es estático
-- en esta instalación y nadie lo recarga. Si algún día se recargara, habría que
-- reindexar — que es exactamente el trato que hace todo el mundo, y se escribe
-- aquí en vez de descubrirlo cuando falle.
create or replace function clave_texto(t text) returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, extensions, public
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(regexp_replace(t, '\s+', ' ', 'g'))));
$$;

comment on function clave_texto is
  'Clave de comparación de nombres: sin acentos, sin mayúsculas, sin espacios repetidos. '
  'Equivale a estacionKey() de utils/estacionUtils.js:22 y a '
  'normalizarNombreIngrediente() de utils/ingredienteMatcher.js:20, que hoy viven en el navegador.';
```

Reproduce exactamente lo que hoy hace el cliente en dos sitios:

```js
// utils/estacionUtils.js:22 y utils/ingredienteMatcher.js:20
nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
```

## 34.1 · `alter table ordenes` — 17 columnas

```sql
alter table ordenes
  add column cerrada_en              timestamptz,
  add column mesa_id                 uuid,
  add column personas                integer     not null default 0 check (personas >= 0),
  add column cliente_nombre          text,
  add column notas_alergias          text,
  add column celebracion_especial    boolean     not null default false,
  add column tipo_celebracion        text,
  add column codigo_caja             text,
  add column propina_puntos_base     integer     not null default 0
                                     check (propina_puntos_base between 0 and 10000),
  add column propina_tipo            text        check (propina_tipo in (
                                       'sin_propina','porcentaje','monto_manual',
                                       'pendiente','pendiente_cliente','decidir_en_caja')),
  add column propina_origen          text        check (propina_origen in (
                                       'mesero','caja','tradicional','portal_qr','pendiente_portal_qr')),
  add column propina_liquidacion_id  uuid,
  add column propina_liquidada_en    timestamptz,
  add column satisfaccion_score      smallint    check (satisfaccion_score between 1 and 5),
  add column satisfaccion_emoji      text,
  add column satisfaccion_comentario text,
  add column satisfaccion_en         timestamptz;

-- Una orden cerrada tiene fecha de cierre; una abierta no la tiene.
alter table ordenes add constraint orden_cerrada_con_fecha check (
  estado not in ('pagada','cancelada') or cerrada_en is not null
);
alter table ordenes add constraint orden_cierra_despues_de_abrir check (
  cerrada_en is null or cerrada_en >= created_at
);
-- La valoración es del comensal: o está entera o no está.
alter table ordenes add constraint orden_satisfaccion_completa check (
  (satisfaccion_score is null) = (satisfaccion_en is null)
);

create index ordenes_por_mesa on ordenes (organizacion_id, mesa_id)
  where mesa_id is not null;
create index ordenes_propina_pendiente
  on ordenes (organizacion_id, empleado_atiende_id, cerrada_en)
  where propina_liquidacion_id is null;

comment on column ordenes.codigo_caja is
  'Código que el comensal lleva impreso a la caja (M05-4821). NO es una terminal. Ver F1-04 §6.3.';
```

`mesa_id` y `propina_liquidacion_id` se quedan sin llave foránea aquí: sus tablas destino todavía no existen. Se enganchan en §34.24.

## 34.2 · `alter table orden_lineas` — las 7 del contrato de trazabilidad

```sql
-- Los 7 campos de snapshot de DetalleVenta que no tenían destino (F1-04 §7.2).
-- Cada uno existe para que un ticket de hace seis meses siga imprimiéndose
-- igual aunque el producto o el insumo hayan cambiado o desaparecido.
alter table orden_lineas
  add column estado_preparacion        text not null default 'pendiente'
                                       check (estado_preparacion in (
                                         'pendiente','en_preparacion','listo','entregado','cancelado')),
  add column area_preparacion_snapshot text check (area_preparacion_snapshot in (
                                         'cocina','barra','ambos','ninguno')),
  add column cantidad_base_consumo     numeric(14,4) check (cantidad_base_consumo > 0),
  add column insumo_base_id            uuid,
  add column insumo_base_nombre        text,
  add column precio_por_unidad_centavos bigint check (precio_por_unidad_centavos >= 0),
  add column ml_por_porcion            numeric(14,4) check (ml_por_porcion > 0);

alter table orden_lineas add constraint orden_lineas_insumo_base_misma_org
  foreign key (insumo_base_id, organizacion_id)
  references insumos (id, organizacion_id) on delete set null (insumo_base_id);

-- El nombre del insumo es SNAPSHOT: si hay puntero, tiene que haber nombre,
-- porque el puntero se puede anular y el ticket no.
alter table orden_lineas add constraint orden_linea_insumo_base_con_nombre check (
  insumo_base_id is null or insumo_base_nombre is not null
);

create index orden_lineas_por_estado
  on orden_lineas (organizacion_id, estado_preparacion)
  where estado_preparacion in ('pendiente','en_preparacion');

comment on column orden_lineas.insumo_base_nombre is
  'SNAPSHOT. Es lo que hace que el ticket siga diciendo "Barbacoa" si el insumo se renombra.';
comment on column orden_lineas.cantidad_base_consumo is
  'Cantidad ya convertida a la unidad base del insumo. No es derivable de movimientos_stock: '
  'ese ledger agrega por insumo y su referencia apunta a la orden, no a la línea. Ver F1-04 §7.6.';
```

## 34.3 · `alter table insumos` — 11 columnas

```sql
alter table insumos
  add column unidad_compra_default      text,
  add column cantidad_por_compra_default numeric(14,4) check (cantidad_por_compra_default > 0),
  add column costo_compra_default_centavos bigint not null default 0
                                        check (costo_compra_default_centavos >= 0),
  add column stock_critico              numeric(14,4) not null default 0 check (stock_critico >= 0),
  add column proveedor_id               uuid,
  add column notas                      text,
  add column tipo_insumo                text not null default 'normal'
                                        check (tipo_insumo in ('normal','contenedor')),
  add column capacidad_contenedor_ml    numeric(14,4) check (capacidad_contenedor_ml > 0),
  add column porciones_por_contenedor   numeric(14,4) check (porciones_por_contenedor > 0),
  add column ml_por_porcion             numeric(14,4) check (ml_por_porcion > 0),
  add column nombre_porcion             text;

-- Un contenedor sin capacidad no se puede servir por copas.
alter table insumos add constraint insumo_contenedor_completo check (
  tipo_insumo <> 'contenedor' or (capacidad_contenedor_ml is not null and ml_por_porcion is not null)
);
-- El crítico está por debajo del mínimo: si no, las cinco bandas de
-- STOCK_STATUS (constants.js:26) se solapan y el semáforo miente.
alter table insumos add constraint insumo_umbrales_coherentes check (
  stock_critico <= stock_minimo
);
```

## 34.4 · `alter table productos` — 6 columnas

```sql
alter table productos
  add column area_preparacion        text not null default 'ninguno'
                                     check (area_preparacion in ('cocina','barra','ambos','ninguno')),
  add column visible_en_menu_digital boolean not null default true,
  add column minutos_preparacion     smallint check (minutos_preparacion >= 0),
  add column notas                   text,
  add column presets_variable        jsonb check (jsonb_typeof(presets_variable) = 'array'),
  add column presets_porcion         jsonb check (jsonb_typeof(presets_porcion) = 'array');

create index productos_menu_digital on productos (organizacion_id, categoria_id)
  where activo and visible_en_menu_digital;
```

## 34.5 · `alter table categorias` — 4 columnas

```sql
alter table categorias
  add column descripcion            text,
  add column estacion_preparacion_id uuid,
  add column estacion_nombre        text,
  add column estacion_color         text check (estacion_color ~ '^#[0-9a-fA-F]{6}$');

comment on column categorias.estacion_nombre is
  'SNAPSHOT deliberado. preparacionEstacionUtils.js resuelve la estación SIN consultar '
  'estaciones_preparacion: si esto se derivara, la resolución cambiaría de comportamiento.';
```

## 34.6 · `alter table empleos` — 3 columnas

```sql
alter table empleos
  add column color                    text check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column estacion_preparacion_id  uuid,
  add column ve_todas_las_estaciones  boolean not null default false;

-- Mutuamente excluyentes en la práctica (UsuarioPOS.jsonc:56).
alter table empleos add constraint empleo_estacion_o_todas check (
  not (ve_todas_las_estaciones and estacion_preparacion_id is not null)
);
```

## 34.7 · `alter table recetas` — 4 columnas

```sql
-- Se separan la cantidad CAPTURADA de la CONVERTIDA. Hoy son la misma
-- (RecetaFormDialog.jsx:225 no convierte) y la unidad es texto libre
-- (:365-366): escribir "kg" en un insumo que se mide en gramos produce un
-- error de 1000x en el consumo y en el costo. Ver F1-04 §17.1.
alter table recetas
  add column cantidad_capturada numeric(14,4) check (cantidad_capturada > 0),
  add column unidad_capturada   text,
  add column activa             boolean not null default true,
  add column notas              text;

create index recetas_activas on recetas (organizacion_id, producto_id) where activa;
```

## 34.8 · `alter table sesiones_caja` — 4 columnas

```sql
alter table sesiones_caja
  add column serie                   text   not null default 'CC' check (serie ~ '^[A-Z]{1,6}$'),
  add column folio                   bigint check (folio > 0),
  add column fondo_esperado_centavos bigint not null default 0 check (fondo_esperado_centavos >= 0),
  add column notas_apertura          text;

-- Una caja cerrada sin folio no se puede reclamar ni auditar. Misma regla que
-- `orden_pagada_con_folio`.
alter table sesiones_caja add constraint caja_cerrada_con_folio check (
  estado <> 'cerrada' or folio is not null
);
-- No se puede retirar más de lo que se contó.
alter table sesiones_caja add constraint caja_retiro_no_excede_contado check (
  efectivo_retirado_centavos is null
  or efectivo_contado_centavos is null
  or efectivo_retirado_centavos <= efectivo_contado_centavos
);
```

## 34.9 · `zonas`

```sql
-- Hoy es una constante del navegador (lib/constants.js:118). Como tabla, una
-- zona que no está en la lista deja de poder escribirse — y con ella deja de
-- existir el caso en que una mesa desaparece de la interfaz por tener una zona
-- que ninguna pestaña muestra (Configuracion.jsx:291).
create table zonas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  orden           integer     not null default 0,
  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zonas_id_org_unica unique (id, organizacion_id)
);

create index zonas_por_organizacion on zonas (organizacion_id, orden) where activa;
```

## 34.10 · `estaciones_preparacion`

```sql
create table estaciones_preparacion (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  descripcion     text,
  color           text        not null default '#4A5568' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icono           text,
  orden           integer     not null default 0,
  activa          boolean     not null default true,
  es_general      boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- REGLA 10 de F1-01 §3: la estación general NO se puede desactivar.
  -- Hoy eso es un `if` en EstacionesPreparacionSection.jsx:218-221.
  constraint estacion_general_siempre_activa check (not es_general or activa),
  constraint estaciones_id_org_unica unique (id, organizacion_id)
);

create index estaciones_por_organizacion on estaciones_preparacion (organizacion_id, orden)
  where activa;
```

## 34.11 · `mesas`

```sql
create table mesas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,
  zona_id         uuid        references zonas(id) on delete set null,

  numero          smallint    not null check (numero > 0),
  nombre          text,
  capacidad       smallint    not null default 4 check (capacidad > 0),
  forma           text        not null default 'redonda'
                              check (forma in ('redonda','cuadrada','rectangular')),
  tamano          text        not null default 'mediana'
                              check (tamano in ('chica','mediana','grande')),
  posicion_x      integer     not null default 100,
  posicion_y      integer     not null default 100,
  orden           integer     not null default 0,

  estado          text        not null default 'libre'
                              check (estado in ('libre','esperando_orden','pedido_enviado',
                                                'en_preparacion','en_espera_entrega','ocupada',
                                                'cuenta_solicitada','limpieza','pagada','cancelada')),

  -- Puntero a la venta viva. Es lo que hace posible el índice único parcial de
  -- "una sola venta activa por mesa" (F1-04 §35.5) y lo que corrige D-16.
  orden_activa_id uuid,

  personas_actuales smallint  not null default 0 check (personas_actuales >= 0),
  cliente_temporal  text,
  notas_alergias    text,
  celebracion_especial boolean not null default false,
  tipo_celebracion  text,

  qr_token        text,
  qr_activa       boolean     not null default true,

  empleado_asignado_id uuid   references empleos(id) on delete set null,
  empleado_atiende_id  uuid   references empleos(id) on delete set null,

  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Una mesa libre no tiene venta viva, y una ocupada sí. Sin esto vuelven las
  -- "mesas huérfanas" que detectarHuerfano busca con cuatro reglas heurísticas
  -- (F1-01 §4).
  constraint mesa_libre_sin_orden check (
    estado <> 'libre' or orden_activa_id is null
  ),
  constraint mesas_id_org_unica unique (id, organizacion_id)
);

alter table mesas add constraint mesas_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table mesas add constraint mesas_zona_misma_org
  foreign key (zona_id, organizacion_id)
  references zonas (id, organizacion_id) on delete set null (zona_id);
alter table mesas add constraint mesas_asignado_misma_org
  foreign key (empleado_asignado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_asignado_id);
alter table mesas add constraint mesas_atiende_misma_org
  foreign key (empleado_atiende_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_atiende_id);

create index mesas_por_organizacion on mesas (organizacion_id, zona_id, orden) where activa;
create index mesas_por_estado on mesas (organizacion_id, estado) where activa;
```

> **Referencia circular, resuelta a propósito.** `mesas.orden_activa_id` apunta a `ordenes` y `ordenes.mesa_id` apunta a `mesas`. No se pueden declarar las dos llaves en el `create table`. Las dos se añaden con `alter table` en §34.25, cuando ambas tablas existen.

## 34.12 · `comandas`

```sql
create table comandas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  orden_id        uuid        not null references ordenes(id) on delete cascade,
  mesa_id         uuid        references mesas(id) on delete set null,
  estacion_preparacion_id uuid references estaciones_preparacion(id) on delete set null,

  -- LEGACY declarado en PedidoPreparacion.jsonc:24. Cocina.jsx filtra por él
  -- cuando las estaciones están apagadas. Se conserva a propósito.
  area            text        check (area in ('cocina','barra')),

  estado          text        not null default 'nuevo'
                              check (estado in ('nuevo','en_preparacion','listo','entregado','cancelado')),

  iniciada_en     timestamptz,
  lista_en        timestamptz,
  entregada_en    timestamptz,

  empleado_responsable_id uuid references empleos(id) on delete set null,
  notas           text,

  -- Snapshots: la cocina los pinta y la estación se puede desactivar.
  estacion_nombre text,
  estacion_color  text        check (estacion_color ~ '^#[0-9a-fA-F]{6}$'),

  origen          text        not null default 'mesero'
                              check (origen in ('mesero','portal_qr','pos')),

  notas_alergias  text,
  celebracion_especial boolean not null default false,
  tipo_celebracion text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint comanda_tiempos_ordenados check (
    (lista_en is null or iniciada_en is null or lista_en >= iniciada_en)
    and (entregada_en is null or lista_en is null or entregada_en >= lista_en)
  ),
  constraint comandas_id_org_unica unique (id, organizacion_id)
);

alter table comandas add constraint comandas_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete cascade;
alter table comandas add constraint comandas_mesa_misma_org
  foreign key (mesa_id, organizacion_id)
  references mesas (id, organizacion_id) on delete set null (mesa_id);
alter table comandas add constraint comandas_estacion_misma_org
  foreign key (estacion_preparacion_id, organizacion_id)
  references estaciones_preparacion (id, organizacion_id)
  on delete set null (estacion_preparacion_id);

-- El canal de tiempo real `pedidos:estacion:<id>` (F1-01 §6) se apoya aquí.
create index comandas_por_estacion
  on comandas (organizacion_id, estacion_preparacion_id, estado, created_at);
create index comandas_por_orden on comandas (orden_id);
create index comandas_activas on comandas (organizacion_id, created_at)
  where estado in ('nuevo','en_preparacion','listo');
```

## 34.13 · `comanda_items`

```sql
create table comanda_items (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  comanda_id      uuid        not null references comandas(id) on delete cascade,

  -- El vínculo que HOY NO EXISTE, y por el que el estado de preparación tiene
  -- que vivir duplicado. Ver F1-04 §10.3.
  orden_linea_id  uuid        references orden_lineas(id) on delete set null,

  producto_id     uuid        references productos(id) on delete set null,
  producto_nombre text        not null check (length(trim(producto_nombre)) > 0),
  cantidad        numeric(14,4) not null check (cantidad > 0),
  notas           text,

  -- Mismo conjunto que orden_lineas.estado_preparacion. Hoy Mesero escribe
  -- 'pendiente' y POS escribe 'nuevo' para el mismo hecho (F1-04 §7.5).
  estado          text        not null default 'pendiente'
                              check (estado in ('pendiente','en_preparacion','listo',
                                                'entregado','cancelado')),

  tipo_venta         text     check (tipo_venta in ('precio_fijo','variable_medida',
                                                    'porcion_contenedor','servicio')),
  unidad_variable    text,
  cantidad_variable  numeric(14,4) check (cantidad_variable > 0),
  nombre_porcion     text,
  cantidad_porciones numeric(14,4) check (cantidad_porciones > 0),

  orden_visual    integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table comanda_items add constraint comanda_items_comanda_misma_org
  foreign key (comanda_id, organizacion_id)
  references comandas (id, organizacion_id) on delete cascade;
alter table comanda_items add constraint comanda_items_producto_misma_org
  foreign key (producto_id, organizacion_id)
  references productos (id, organizacion_id) on delete set null (producto_id);

create index comanda_items_por_comanda on comanda_items (comanda_id, orden_visual);
create index comanda_items_por_linea on comanda_items (orden_linea_id)
  where orden_linea_id is not null;
```

## 34.14 · `solicitudes_qr`

```sql
create table solicitudes_qr (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  mesa_id         uuid        not null references mesas(id) on delete cascade,
  orden_id        uuid        references ordenes(id) on delete set null,

  tipo            text        not null check (tipo in ('ordenar','cuenta','ayuda')),
  estado          text        not null default 'pendiente'
                              check (estado in ('pendiente','atendida','resuelta','cancelada')),

  atendida_en     timestamptz,
  resuelta_en     timestamptz,

  empleado_atiende_id uuid    references empleos(id) on delete set null,
  empleado_destino_id uuid    references empleos(id) on delete set null,
  ruteo_modo      text        not null default 'general' check (ruteo_modo in ('asignado','general')),
  origen          text        not null default 'portal_qr',

  -- Snapshot del token con el que entró el comensal.
  token_mesa      text,
  notas           text,

  subtotal_consumo_centavos  bigint check (subtotal_consumo_centavos >= 0),
  propina_sugerida_centavos  bigint check (propina_sugerida_centavos >= 0),
  propina_sugerida_bp        integer check (propina_sugerida_bp between 0 and 10000),
  propina_tipo    text        check (propina_tipo in ('sin_propina','porcentaje','monto_manual',
                                                      'decidir_en_caja','pendiente_cliente')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table solicitudes_qr add constraint solicitudes_qr_mesa_misma_org
  foreign key (mesa_id, organizacion_id)
  references mesas (id, organizacion_id) on delete cascade;
alter table solicitudes_qr add constraint solicitudes_qr_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete set null (orden_id);

create index solicitudes_qr_pendientes
  on solicitudes_qr (organizacion_id, estado, created_at)
  where estado = 'pendiente';
create index solicitudes_qr_por_mesa on solicitudes_qr (organizacion_id, mesa_id, created_at desc);
```

## 34.15 · `menu_qr_secciones`

```sql
create table menu_qr_secciones (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  descripcion     text,
  imagen_url      text,
  orden           integer     not null default 0,
  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index menu_qr_secciones_publicas on menu_qr_secciones (organizacion_id, orden)
  where activa;
```

`archivo_url` **no se crea**: ni se escribe ni se lee en ningún archivo (§29).

## 34.16 · `proveedores`

```sql
create table proveedores (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  contacto        text,
  telefono        text,
  whatsapp        text,
  correo          text,
  direccion       text,
  notas           text,
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint proveedores_id_org_unica unique (id, organizacion_id)
);

create index proveedores_por_organizacion on proveedores (organizacion_id) where activo;

comment on table proveedores is
  'Borrado suave obligatorio: las compras guardan proveedor_nombre como snapshot '
  '(ProveedoresSection.jsx:88-89).';
```

## 34.17 · `compras`

```sql
create table compras (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,
  proveedor_id    uuid        references proveedores(id) on delete set null,

  -- SNAPSHOT not null: es lo que permite el borrado suave del proveedor.
  proveedor_nombre text       not null default 'Compra directa',

  fecha           date        not null default current_date,
  total_centavos  bigint      not null default 0 check (total_centavos >= 0),
  metodo_pago     text        check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  factura_folio   text,
  notas           text,
  empleado_id     uuid        references empleos(id) on delete set null,

  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint compras_id_org_unica unique (id, organizacion_id)
);

alter table compras add constraint compras_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table compras add constraint compras_proveedor_misma_org
  foreign key (proveedor_id, organizacion_id)
  references proveedores (id, organizacion_id) on delete set null (proveedor_id);
alter table compras add constraint compras_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_id);

create unique index compras_idempotencia on compras (organizacion_id, idempotency_key)
  where idempotency_key is not null;
create index compras_por_organizacion on compras (organizacion_id, fecha desc);
```

## 34.18 · `compra_lineas`

```sql
create table compra_lineas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  compra_id       uuid        not null references compras(id) on delete cascade,
  insumo_id       uuid        not null references insumos(id) on delete restrict,

  insumo_nombre   text        not null check (length(trim(insumo_nombre)) > 0),

  -- Lo que el usuario tecleó, en su unidad.
  cantidad_capturada numeric(14,4) not null check (cantidad_capturada > 0),
  unidad_capturada   text        not null,

  -- Cuántas unidades base trae UNA unidad capturada. Sin esto, una compra en
  -- cajas o bolsas no se puede auditar: hoy se usa para calcular
  -- (RegistrarCompraDialog.jsx:301) y NO se guarda. Ver F1-04 §23.1.
  equivalencia    numeric(14,4) not null default 1 check (equivalencia > 0),

  -- Ya convertida a la unidad base del insumo.
  cantidad        numeric(14,4) not null check (cantidad > 0),

  costo_total_centavos bigint  not null check (costo_total_centavos >= 0),
  caduca_el       date,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table compra_lineas add constraint compra_lineas_compra_misma_org
  foreign key (compra_id, organizacion_id)
  references compras (id, organizacion_id) on delete cascade;
alter table compra_lineas add constraint compra_lineas_insumo_misma_org
  foreign key (insumo_id, organizacion_id)
  references insumos (id, organizacion_id) on delete restrict;

create index compra_lineas_por_compra on compra_lineas (compra_id);
create index compra_lineas_por_insumo on compra_lineas (organizacion_id, insumo_id, created_at desc);
```

`costo_unitario_base_calculado` **no se crea**: es `costo_total_centavos / cantidad` y guardar los dos es guardar el mismo dato dos veces.

## 34.19 · `gastos`

```sql
create table gastos (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,

  -- Un gasto en efectivo sale del cajón: por eso se ata a la sesión y además
  -- genera un movimiento_caja de tipo 'gasto'. Ver F1-04 §25.2.
  sesion_caja_id  uuid        references sesiones_caja(id) on delete restrict,
  plantilla_gasto_id uuid,

  fecha           date        not null default current_date,
  categoria       text        not null check (categoria in ('limpieza','transporte','reparacion',
                                                            'servicios','pago_extraordinario',
                                                            'marketing','otro')),
  descripcion     text        not null check (length(trim(descripcion)) > 0),
  monto_centavos  bigint      not null check (monto_centavos > 0),
  metodo_pago     text        not null check (metodo_pago in ('efectivo','tarjeta','transferencia')),

  -- Hoy viaja como el prefijo de texto "[RECURRENTE/FIJO MENSUAL]" dentro de
  -- notas (RegistrarGastoDialog.jsx:51-53) y se pierde al editar la nota.
  es_recurrente   boolean     not null default false,

  empleado_id     uuid        references empleos(id) on delete set null,
  notas           text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table gastos add constraint gastos_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table gastos add constraint gastos_sesion_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;
alter table gastos add constraint gastos_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_id);

create unique index gastos_idempotencia on gastos (organizacion_id, idempotency_key)
  where idempotency_key is not null;
create index gastos_por_organizacion on gastos (organizacion_id, fecha desc);
create index gastos_por_sesion on gastos (sesion_caja_id) where sesion_caja_id is not null;
```

## 34.20 · `plantillas_gasto`

```sql
create table plantillas_gasto (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  categoria       text        not null default 'servicios'
                              check (categoria in ('limpieza','transporte','reparacion','servicios',
                                                   'pago_extraordinario','marketing','otro')),
  monto_sugerido_centavos bigint not null default 0 check (monto_sugerido_centavos >= 0),
  metodo_pago     text        not null default 'efectivo'
                              check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  periodicidad    text        not null default 'mensual'
                              check (periodicidad in ('mensual','semanal','quincenal','anual','unico')),
  dia_pago_sugerido smallint  check (dia_pago_sugerido between 1 and 31),
  notas           text,
  activa          boolean     not null default true,
  ultimo_uso_en   timestamptz,
  veces_usada     integer     not null default 0 check (veces_usada >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint plantillas_gasto_id_org_unica unique (id, organizacion_id)
);

create index plantillas_gasto_activas on plantillas_gasto (organizacion_id, nombre) where activa;

alter table gastos add constraint gastos_plantilla_misma_org
  foreign key (plantilla_gasto_id, organizacion_id)
  references plantillas_gasto (id, organizacion_id) on delete set null (plantilla_gasto_id);
```

## 34.21 · `plantillas_compra`

```sql
create table plantillas_compra (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  proveedor_nombre text,

  -- Se queda como jsonb, al contrario que comanda_items: se lee entera para
  -- precargar un formulario y nunca se actualiza parcialmente. Ver F1-04 §27.1.
  lineas          jsonb       not null default '[]'::jsonb
                              check (jsonb_typeof(lineas) = 'array'),

  activa          boolean     not null default true,
  notas           text,
  ultimo_uso_en   timestamptz,
  veces_usada     integer     not null default 0 check (veces_usada >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index plantillas_compra_activas on plantillas_compra (organizacion_id, nombre) where activa;
```

## 34.22 · `liquidaciones_propina`

```sql
create table liquidaciones_propina (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,

  serie           text        not null default 'LIQ' check (serie ~ '^[A-Z]{1,6}$'),
  folio           bigint      not null check (folio > 0),

  liquidada_en    timestamptz not null default now(),
  rango_inicio    timestamptz not null,
  rango_fin       timestamptz not null,
  rango_tipo      text        not null default 'personalizado'
                              check (rango_tipo in ('dia','semana','quincena','mes',
                                                    'personalizado','mesero')),

  -- Nulo = liquidación global de varios meseros.
  empleado_id     uuid        references empleos(id) on delete restrict,
  total_centavos  bigint      not null default 0 check (total_centavos >= 0),

  empleado_liquida_id uuid    not null references empleos(id) on delete restrict,
  notas           text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint liquidacion_rango_ordenado check (rango_fin >= rango_inicio),
  constraint liquidaciones_id_org_unica unique (id, organizacion_id)
);

alter table liquidaciones_propina add constraint liquidaciones_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table liquidaciones_propina add constraint liquidaciones_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;
alter table liquidaciones_propina add constraint liquidaciones_liquida_misma_org
  foreign key (empleado_liquida_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

create unique index liquidaciones_idempotencia
  on liquidaciones_propina (organizacion_id, idempotency_key)
  where idempotency_key is not null;
create index liquidaciones_por_organizacion
  on liquidaciones_propina (organizacion_id, liquidada_en desc);

comment on table liquidaciones_propina is
  'venta_ids y desglose_meseros NO se guardan: se derivan de ordenes.propina_liquidacion_id, '
  'que además hace consultable qué ventas entraron. Ver F1-04 §30.1.';
```

## 34.23 · `cortes_turno`

```sql
-- El corte de turno es un arqueo INTERMEDIO que el cajero firma sin cerrar la
-- caja. No es una sesión, así que no va en sesiones_caja.
--
-- Sólo se guarda lo que no se puede derivar: lo que alguien contó y lo que
-- alguien escribió. Los totales salen de movimientos_caja y pagos acotados al
-- rango, igual que en el cierre diario (F1-04 §20.2).
create table cortes_turno (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sesion_caja_id  uuid        not null references sesiones_caja(id) on delete restrict,

  serie           text        not null default 'CT' check (serie ~ '^[A-Z]{1,6}$'),
  folio           bigint      not null check (folio > 0),

  rango_inicio    timestamptz not null,
  cortado_en      timestamptz not null default now(),

  empleado_id     uuid        not null references empleos(id) on delete restrict,

  efectivo_contado_centavos  bigint not null check (efectivo_contado_centavos >= 0),
  efectivo_retirado_centavos bigint not null default 0 check (efectivo_retirado_centavos >= 0),
  notas           text,

  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint corte_turno_rango_ordenado check (cortado_en >= rango_inicio),
  constraint corte_turno_retiro_no_excede check (
    efectivo_retirado_centavos <= efectivo_contado_centavos
  )
);

alter table cortes_turno add constraint cortes_turno_sesion_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;
alter table cortes_turno add constraint cortes_turno_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

create unique index cortes_turno_idempotencia
  on cortes_turno (organizacion_id, idempotency_key) where idempotency_key is not null;
create index cortes_turno_por_sesion on cortes_turno (sesion_caja_id, cortado_en);
```

## 34.24 · `bitacora_sincronizacion`

```sql
create table bitacora_sincronizacion (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  tipo_registro   text        not null check (length(trim(tipo_registro)) > 0),
  registro_id     uuid        not null,
  destino         text        not null check (destino in ('google_sheets','google_drive','local_export')),
  estado          text        not null default 'pending_external_sync'
                              check (estado in ('pending','pending_external_sync','synced','failed')),
  intentos        integer     not null default 0 check (intentos >= 0),
  ultimo_intento_en timestamptz,
  mensaje_error   text,
  archivo_url     text,
  pestana_hoja    text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index bitacora_pendientes on bitacora_sincronizacion (organizacion_id, estado, created_at)
  where estado in ('pending','pending_external_sync');

comment on table bitacora_sincronizacion is
  'La forma es correcta; el trabajador que la consuma no existe. Hoy intentos y '
  'ultimo_intento_en se escriben una vez y nunca se actualizan, y el botón Reintentar '
  'es un setTimeout (IntegracionesRespaldos.jsx:68-73). Ver F1-04 §32.1.';
```

## 34.25 · Cerrar la referencia circular

```sql
-- Ahora que existen las dos tablas.
alter table ordenes add constraint ordenes_mesa_misma_org
  foreign key (mesa_id, organizacion_id)
  references mesas (id, organizacion_id) on delete set null (mesa_id);

alter table ordenes add constraint ordenes_liquidacion_misma_org
  foreign key (propina_liquidacion_id, organizacion_id)
  references liquidaciones_propina (id, organizacion_id)
  on delete set null (propina_liquidacion_id);

alter table mesas add constraint mesas_orden_activa_misma_org
  foreign key (orden_activa_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete set null (orden_activa_id);

alter table insumos add constraint insumos_proveedor_misma_org
  foreign key (proveedor_id, organizacion_id)
  references proveedores (id, organizacion_id) on delete set null (proveedor_id);

alter table categorias add constraint categorias_estacion_misma_org
  foreign key (estacion_preparacion_id, organizacion_id)
  references estaciones_preparacion (id, organizacion_id)
  on delete set null (estacion_preparacion_id);

alter table empleos add constraint empleos_estacion_misma_org
  foreign key (estacion_preparacion_id, organizacion_id)
  references estaciones_preparacion (id, organizacion_id)
  on delete set null (estacion_preparacion_id);
```

## 34.26 · La vista `descuentos_inventario_venta`

```sql
-- DescuentoInventarioVenta no es una tabla: es una lectura de movimientos_stock
-- (F1-02 §8, trampa T4). Cuatro de sus campos salen null porque el ledger
-- agrega por insumo y su referencia apunta a la orden, no a la línea — y
-- ninguno de los cuatro se lee en el frontend. Ver F1-04 §19.1.
create view descuentos_inventario_venta as
select
  m.id,
  m.organizacion_id,
  m.referencia_id                         as venta_id,
  null::uuid                              as detalle_venta_id,
  null::uuid                              as producto_id,
  m.insumo_id                             as ingrediente_id,
  i.nombre                                as ingrediente_nombre,
  null::numeric                           as cantidad_producto,
  null::numeric                           as cantidad_ingrediente_por_producto,
  abs(m.cantidad)                         as cantidad_total_descontada,
  m.unidad                                as unidad_base,
  m.costo_unitario_centavos               as costo_unitario_snapshot,
  (abs(m.cantidad) * m.costo_unitario_centavos)::bigint as costo_total_descontado,
  m.created_at                            as fecha
from movimientos_stock m
join insumos i on i.id = m.insumo_id and i.organizacion_id = m.organizacion_id
where m.referencia_tipo = 'orden'
  and m.tipo = 'salida_venta';
```

## 34.27 · Triggers de `updated_at` y RLS

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'zonas','mesas','estaciones_preparacion','comandas','comanda_items',
    'solicitudes_qr','menu_qr_secciones','proveedores','compras','compra_lineas',
    'gastos','plantillas_gasto','plantillas_compra','liquidaciones_propina',
    'cortes_turno','bitacora_sincronizacion'
  ]
  loop
    execute format(
      'create trigger %I_tocar_updated_at before update on %I
         for each row execute function tocar_updated_at()', t, t);

    -- Misma postura que 005_rls.sql: anon y authenticated no pueden hacer NADA.
    -- La aplicación habla por Kysely con credenciales de servidor.
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- Portabilidad: los roles de Supabase no existen en un Postgres pelón, y un
-- `revoke ... from anon` incondicional aborta la migración entera en el compose
-- de CI, que es la única prueba de la promesa A-27.
do $$
declare roles text; t text;
begin
  select string_agg(quote_ident(rolname), ', ') into roles
    from pg_roles where rolname in ('anon','authenticated');
  if roles is null then return; end if;
  foreach t in array array[
    'zonas','mesas','estaciones_preparacion','comandas','comanda_items',
    'solicitudes_qr','menu_qr_secciones','proveedores','compras','compra_lineas',
    'gastos','plantillas_gasto','plantillas_compra','liquidaciones_propina',
    'cortes_turno','bitacora_sincronizacion'
  ]
  loop
    execute format('revoke all on public.%I from %s', t, roles);
  end loop;
end;
$$;
```

## 34.28 · Semilla obligatoria por organización de restaurante

Sin esto, la primera mesa no tiene zona a la que apuntar y la primera comanda no tiene estación general.

```sql
insert into zonas (organizacion_id, nombre, orden) values
  ($1, 'Interior', 0), ($1, 'Exterior', 1), ($1, 'Terraza', 2),
  ($1, 'Barra', 3),    ($1, 'Otro', 4);

insert into estaciones_preparacion (organizacion_id, nombre, descripcion, color, orden, es_general)
values ($1, 'Cocina general', 'Estación por defecto', '#4A5568', 0, true);
```

Los cinco nombres son los de `lib/constants.js:118`; el nombre y el color de la estación, los de `utils/estacionUtils.js:49-50`.

---

# 35 · Restricciones que la base debe imponer

Es la tarea **E3-2**. Cada una corresponde a una línea de `F1-01` §6, y cada una sustituye una comprobación que hoy vive en el navegador y es TOCTOU.

Criterio de aceptación de `F1-02`: *«Intentar dos ventas activas en la misma mesa lo rechaza la base.»*

## 35.1 · Folio de venta único

```sql
-- Ya existe (003_venta_caja_inventario.sql:178-180). Se documenta por completitud:
-- es lo que corrige D-20, y no hace falta añadir nada.
--
--   create unique index ordenes_folio_unico
--     on ordenes (organizacion_id, sucursal_id, serie, folio)
--     where folio is not null;
```

Con `tomarFolio` (`repos/folios.ts:38`) tomando el consecutivo por `update ... returning` **dentro** de la transacción del cobro, cien cobros simultáneos salen con folios distintos y sin huecos: si la transacción se revierte, el consecutivo vuelve atrás con ella.

## 35.2 · Folio de corte único

```sql
create unique index cortes_folio_unico
  on sesiones_caja (organizacion_id, sucursal_id, serie, folio)
  where folio is not null;

create unique index cortes_turno_folio_unico
  on cortes_turno (organizacion_id, serie, folio);

create unique index liquidaciones_folio_unico
  on liquidaciones_propina (organizacion_id, serie, folio);
```

Los tres usan la misma tabla `folios` con series `CC`, `CT` y `LIQ`. Hoy los tres son `Math.random()` de cuatro caracteres (`financialUtils.js:64`) salvo el de liquidación, que es un sello de tiempo (`LiquidarPropinasDialog.jsx:92`).

## 35.3 · Número de mesa único

```sql
create unique index mesas_numero_unico
  on mesas (organizacion_id, numero);
```

**No parcial.** Una mesa desactivada conserva su número: reutilizarlo mientras existe un ticket viejo que dice «Mesa 5» haría que dos mesas distintas compartieran identidad en el histórico.

## 35.4 · Token QR único

```sql
create unique index mesas_qr_token_unico
  on mesas (organizacion_id, qr_token)
  where qr_token is not null;
```

Parcial: una mesa sin token es normal (el token se genera al abrir «Ver QR», `MesasQRTab.jsx:32-33`) y no debe chocar con las otras que tampoco lo tienen. Mismo patrón que `productos_codigo_barras_unico`.

## 35.5 · Una sola venta activa por mesa — corrige D-16

```sql
create unique index mesas_una_orden_activa
  on mesas (id)
  where orden_activa_id is not null;
```

Y el lado recíproco, que es el que de verdad impide la doble apertura concurrente:

```sql
-- Dos meseros abriendo la misma mesa a la vez: el segundo INSERT choca aquí.
-- Hoy eso se "resuelve" cancelando la venta duplicada a posteriori
-- (qrPedidoFlow.js:122-134, motivo 'duplicado_apertura_qr'), que es limpiar
-- después en vez de impedir antes.
create unique index ordenes_una_activa_por_mesa
  on ordenes (organizacion_id, mesa_id)
  where mesa_id is not null
    and estado in ('borrador','confirmada','en_preparacion','lista','cuenta_solicitada');
```

Los cinco estados son exactamente los de `ESTADOS_VENTA_ACTIVA` (`qrPedidoFlow.js:20-25`, duplicado en `entregaPedidos.js:46`), traducidos con la tabla de §6.6.

**Esto convierte `detectarHuerfano` y sus cuatro reglas heurísticas (`F1-01` §4) en código sin causa.** Se quita cuando la prueba de concurrencia lo demuestre, no antes.

## 35.6 · Una sola caja abierta

```sql
-- Ya existe (003_venta_caja_inventario.sql:96-98):
--
--   create unique index sesiones_caja_una_abierta_por_terminal
--     on sesiones_caja (terminal_id) where estado = 'abierta';
```

**Pero no basta para el restaurante.** Su sistema no tiene terminales: `useCajaAbierta.js` busca **una caja abierta en todo el negocio**, y `Caja.jsx:913-922` aborta si encuentra cualquier otra. Con el índice por terminal, dos dispositivos podrían abrir dos cajas y su interfaz tomaría una al azar.

```sql
-- Una sola caja abierta por SUCURSAL, que es lo que su sistema asume.
-- Convive con el índice por terminal: el más estrecho gana.
create unique index sesiones_caja_una_abierta_por_sucursal
  on sesiones_caja (organizacion_id, sucursal_id)
  where estado = 'abierta';
```

## 35.7 · Una sola configuración por organización — corrige D-15

```sql
-- Ya existe (001_plataforma.sql:195): `organizacion_id uuid not null unique`.
```

Es lo que hace imposible el segundo registro, y por tanto lo que hace que los seis `list()[0]` del cliente dejen de depender del orden que devuelva la base. **No hay que añadir nada**, sólo dejar de crear filas: los cinco sitios que hacen `create` cuando `!cfg?.id` pasan por un comando que hace `insert ... on conflict (organizacion_id) do update`.

## 35.8 · Una sola estación general, y no se puede desactivar

```sql
create unique index estaciones_una_general
  on estaciones_preparacion (organizacion_id)
  where es_general;
```

Más el `check estacion_general_siempre_activa` de §34.10, que impone la segunda mitad de la regla 10.

Las dos juntas sustituyen `crearCocinaGeneral` (`EstacionesPreparacionSection.jsx:190-199`), que lee la lista y luego escribe —TOCTOU—, y el `if` de `:218-221`.

## 35.9 · Estrechar `ordenes_borrador_por_terminal`

**Sin esto, el flujo de mesero no arranca.** Ver §6.6.

```sql
drop index ordenes_borrador_por_terminal;

-- El borrador ES el carrito de mostrador, y ahí la unicidad por terminal es
-- correcta: si hubiera dos, el cajero vería uno y cobraría el otro.
--
-- Pero un restaurante tiene ocho mesas abiertas a la vez, y cada mesa abierta
-- es una orden en 'borrador'. Sin acotar a mostrador, la segunda mesa que se
-- abra en la misma terminal choca con violación de unicidad.
create unique index ordenes_carrito_por_terminal
  on ordenes (terminal_id)
  where estado = 'borrador'
    and terminal_id is not null
    and estrategia_captura = 'mostrador';
```

## 35.10 · Únicos sin acentos ni mayúsculas

`F1-01` §6: *«para que el anti-duplicado deje de vivir en el cliente»*.

Usan `clave_texto()` de §34.0.

```sql
-- Ingrediente.nombre. Sustituye normalizarNombreIngrediente()
-- (utils/ingredienteMatcher.js:20), que hoy compara contra la lista completa
-- descargada al navegador.
create unique index insumos_nombre_unico
  on insumos (organizacion_id, clave_texto(nombre));

-- CategoriaProducto.nombre y CategoriaIngrediente.nombre.
-- Reemplaza `categorias_nombre_unico`, que sólo aplicaba lower() y por tanto
-- dejaba pasar "Café" junto a "Cafe".
drop index categorias_nombre_unico;
create unique index categorias_nombre_unico
  on categorias (organizacion_id, tipo, clave_texto(nombre));

-- EstacionPreparacion.nombre. Sustituye findExistingEstacion()
-- (utils/estacionUtils.js:37-43).
create unique index estaciones_nombre_unico
  on estaciones_preparacion (organizacion_id, clave_texto(nombre));
```

> **Los tres son índices totales, no parciales.** Un insumo desactivado sigue ocupando su nombre: reactivarlo es la operación correcta, y `Inventario.jsx:141` ya tiene el botón. Crear un segundo «Jitomate» porque el primero está desactivado es exactamente el duplicado que estos índices existen para impedir. `EstacionesPreparacionSection.jsx:127-131` ya hace lo correcto —reactiva la duplicada inactiva— y con el índice deja de ser opcional.

## 35.11 · Una sola solicitud QR pendiente por mesa y tipo — corrige D-17

No está en la lista de `F1-01` §6, pero cierra un TOCTOU real: `PortalCliente.jsx:524-532` consulta antes de crear.

```sql
create unique index solicitudes_qr_una_pendiente
  on solicitudes_qr (organizacion_id, mesa_id, tipo)
  where estado = 'pendiente';
```

## 35.12 · Unidades base: sólo `g`, `ml`, `pieza` — regla 7

`insumos.unidad_base` admite seis valores (`003_venta_caja_inventario.sql:47`): `pieza`, `kg`, `g`, `l`, `ml`, `m`. Es correcto para la tiendita, y **más permisivo que la regla 7 del restaurante**.

Un insumo con `unidad_base = 'kg'` rompe todo el consumo: `convertirAUnidadBase` produce gramos (`unidadesMedida.js:136`), `UNIDADES_BASE` sólo ofrece tres opciones (`:15-19`), y `validarCompatibilidad` (`:98-121`) compara contra la base esperando una de las tres. El error no aparece al capturar; aparece al cobrar, multiplicado por mil.

No se puede estrechar el `check` de la columna sin romper a la tiendita, que sí vende por kilos. Se acota **por giro**:

```sql
-- Las unidades base del restaurante son tres y no se amplían (F1-01 §3.7).
-- La comprobación no puede ser un `check` de columna porque la tiendita usa
-- las seis legítimamente: se acota a las organizaciones de giro restaurante.
create or replace function insumo_unidad_base_valida() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  giro text;
begin
  select paquete into giro from organizaciones where id = new.organizacion_id;
  if giro = 'restaurante' and new.unidad_base not in ('g', 'ml', 'pieza') then
    raise exception
      'Un insumo de restaurante sólo se mide en g, ml o pieza (recibido: %)', new.unidad_base
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger insumos_unidad_base_por_giro
  before insert or update of unidad_base, organizacion_id on insumos
  for each row execute function insumo_unidad_base_valida();
```

> **Es la única excepción a la regla «cero lógica de negocio en la base» (R7, A-27).** Y se declara como tal. La alternativa —dejarlo sólo en el comando— fallaría en cuanto alguien escriba por otro camino: una importación CSV, una semilla, un `psql`. Es exactamente el tipo de regla que `002_catalogo.sql:105-124` ya defiende con `check` de coherencia del tipo de venta, y aquí no cabe en un `check` porque depende de otra tabla.
>
> Si esa excepción no se acepta, la alternativa sin trigger es una **columna redundante** `insumos.giro text` mantenida por la aplicación, con `check (giro <> 'restaurante' or unidad_base in ('g','ml','pieza'))`. Cuesta una columna y una escritura, y no depende de otra tabla. **Queda a decisión de quien implemente E3-2**; las dos cumplen la regla y ninguna la deja en el navegador.

## 35.13 · Prueba de aceptación por restricción

Cada índice necesita una prueba de concurrencia, no sólo una de camino feliz. `F1-01` §8 dice que hay ~78 mutaciones enganchadas a `pnpm verify`; estas son las que faltan.

| Restricción | Prueba |
|---|---|
| §35.1, §35.2 | 100 cobros y 100 cortes concurrentes, cero colisiones, cero huecos |
| §35.3, §35.4 | Insertar mesa duplicada por número y por token, rechazada |
| §35.5 | **Dos meseros abren la misma mesa a la vez: uno gana, el otro recibe conflicto tipado** |
| §35.6 | Dos aperturas de caja simultáneas en la misma sucursal: una falla |
| §35.7 | Segundo `insert` en `configuracion` para la misma organización: falla |
| §35.8 | Segunda estación con `es_general`: falla. `update ... set activa=false` sobre la general: falla |
| §35.9 | **Ocho mesas abiertas a la vez desde la misma terminal: las ocho se abren.** Dos carritos de mostrador en la misma terminal: el segundo falla |
| §35.10 | Insertar «Café» y «cafe» y «CAFÉ »: sólo el primero entra |
| §35.11 | Dos toques al botón de «pedir cuenta»: una sola solicitud |

---

# 36 · Lista blanca de campos por entidad y por rol

Es lo que implementa la tarea **E3-4**: *«`POST /api/datos/consultar` con ámbito de sesión, listas blancas de entidad y campo, y límite de filas.»*

## 36.1 · Los cinco ámbitos

Cuatro roles de su sistema (`constants.js:75-80`) más uno que su sistema no nombra pero que existe desde que hay portal QR.

| Ámbito | Quién es | Cómo se autentica |
|---|---|---|
| `administrador` | Dueño, administrador, gerente | PIN, rol de `empleos` |
| `caja` | Cajero | PIN |
| `mesero` | Mesero | PIN |
| `cocina` | Cocina y barra | PIN |
| **`publico_qr`** | **El comensal que escanea un código** | **Ninguna.** Sólo el token de mesa |

`publico_qr` es el que importa, porque es donde está D-14.

## 36.2 · Entidades legibles por ámbito

`L` = lectura · `E` = escritura por comando · `—` = no aparece

| Entidad | admin | caja | mesero | cocina | publico_qr |
|---|:---:|:---:|:---:|:---:|:---:|
| `Venta` | L E | L E | L E | L¹ | L² |
| `DetalleVenta` | L E | L E | L E | L¹ | L² |
| `Mesa` | L E | L | L E | L¹ | L³ |
| `Zona` | L E | L | L | — | — |
| `PedidoPreparacion` | L | L | L E | **L E** | — |
| `EstacionPreparacion` | L E | L | L | L | — |
| `UsuarioPOS` | L E | L⁴ | L⁴ | L⁴ | — |
| `ConfiguracionNegocio` | L E | L | L | L | **L⁵** |
| `Ingrediente` | L E | L⁶ | — | L⁷ | — |
| `ProductoTerminado` | L E | L | L | L⁷ | **L⁸** |
| `CategoriaProducto` | L E | L | L | L | **L⁸** |
| `RecetaEscandallo` | L E | L⁶ | — | L⁷ | — |
| `MovimientoInventario` | L E | L | — | — | — |
| `DescuentoInventarioVenta` | L | L | — | — | — |
| `CorteCaja` | L E | L E | — | — | — |
| `SesionCaja` | L | L | — | — | — |
| `Compra` / `CompraLinea` | L E | — | — | — | — |
| `Proveedor` | L E | — | — | — | — |
| `GastoOperativo` | L E | L E | — | — | — |
| `PlantillaGasto` / `PlantillaCompra` | L E | — | — | — | — |
| `SolicitudQR` | L E | L | L E | — | **L E³** |
| `MenuQRSeccion` | L E | — | — | — | **L** |
| `LiquidacionPropina` | L E | L | — | — | — |
| `UnidadMedida` | L E | L | — | — | — |
| `IntegrationSyncLog` | L | — | — | — | — |
| `CategoriaIngrediente` | L | L | — | — | — |

1. Cocina lee la venta y sus líneas **sólo por los campos de §36.4**: nombre, cantidad, notas, alergias. Nunca dinero.
2. `publico_qr` lee **únicamente la venta activa de su propia mesa**, resuelta por `token_mesa`, y sólo para la precuenta. Nunca `list()`.
3. Acotado al `qr_token` de la petición. El comensal **no puede enumerar mesas**: `Mesa.filter({qr_token})` devuelve como mucho una fila y sólo si `qr_activa`.
4. Sólo `id`, `nombre`, `rol`, `color`, `activo` — lo que `POSLogin.jsx` necesita para pintar las tarjetas. **Nunca `pin`.**
5. §36.3. Es la fuga.
6. Sólo si `configuracion.valores.operacion.mostrarCostosACaja` es verdadero. Es la regla que hoy vive en `mostrar_costos_a_caja`.
7. Sólo nombres de ingredientes, **sin costos, sin márgenes y sin gramajes** — regla 9. §36.4.
8. Sólo si `portal_qr_activo` y el producto tiene `visible_en_menu_digital`. **Sin `costo_calculado_actual`, sin `utilidad_bruta_actual`, sin `margen_bruto_actual`.**

## 36.3 · `ConfiguracionNegocio` en el portal QR público — cierre de D-14

Ésta es la sección que la tarea pide marcar explícitamente.

### PUEDEN salir — los 22 que el portal usa de verdad

Cada uno con el archivo y la línea donde se lee. Si un campo no está en esta lista y alguien lo necesita, **se añade a la lista, no se quita la lista**.

| # | Campo | Se lee en |
|---|---|---|
| 1 | `portal_qr_activo` | `PortalCliente.jsx:88`, `:492` |
| 2 | `portal_qr_modo_menu` | `PortalCliente.jsx:87` |
| 3 | `portal_qr_mostrar_precios` | `PortalCliente.jsx:570` |
| 4 | `portal_qr_mostrar_sin_imagen` | `PortalCliente.jsx:571` |
| 5 | `portal_qr_permitir_ordenar` | `qrUtils.js:32` vía `getTiposSolicitudHabilitados` |
| 6 | `portal_qr_permitir_cuenta` | `qrUtils.js:33` |
| 7 | `portal_qr_permitir_ayuda` | `qrUtils.js:34` |
| 8 | `portal_qr_mensaje_bienvenida` | `PortalCliente.jsx:642`, `:647` |
| 9 | `portal_qr_cuenta_modo` | `PortalCliente.jsx:93` |
| 10 | `portal_qr_permitir_pedidos_cliente` | `PortalCliente.jsx:265` |
| 11 | `portal_qr_mostrar_precuenta` | `PedirCuentaQR.jsx:39` |
| 12 | `portal_qr_permitir_propina_cliente` | `PedirCuentaQR.jsx:41` |
| 13 | `propinas_activas` | `tipsUtils.js:11` vía `tipsEnabled` |
| 14 | `propina_porcentajes_sugeridos` | `tipsUtils.js:18` vía `getPorcentajesSugeridos` |
| 15 | `asignacion_mesas_activa` | `PortalCliente.jsx:263`, `:536`, `:722`; `PedirCuentaQR.jsx:219` |
| 16 | `nombre_negocio` | `PortalCliente.jsx:622`, `:630` |
| 17 | `logo_url` | `PortalCliente.jsx:584` |
| 18 | `logo_ticket_url` | `PortalCliente.jsx:585`, respaldo del logo |
| 19 | `logo_pdf_url` | `PortalCliente.jsx:586`, respaldo |
| 20 | `background_logo_url` | `PortalCliente.jsx:587`, respaldo |
| 21 | `paquete_modo` | `PortalCliente.jsx:262` |
| 22 | `estaciones_preparacion_activas` | `qrPedidoFlow.js:259` |

> **Dos que conviene mirar de nuevo aunque hoy se usen.**
> - **`paquete_modo`** revela qué plan comercial tiene contratado el negocio. `PortalCliente.jsx:262` lo usa sólo para decidir si se permiten pedidos del cliente. **Mejor sustituirlo por un booleano derivado** —`puedeOrdenarDesdeQR`— calculado en servidor. Así el plan comercial deja de ser público sin perder la función.
> - **`estaciones_preparacion_activas`** es un detalle de operación interna, y `qrPedidoFlow.js:255` **descarga la configuración entera una segunda vez** sólo para leerlo. Debe resolverse **dentro del comando `enviarPedidoQR`**, en servidor, y desaparecer de la respuesta pública. Ninguna de las dos es una fuga grave; las dos son innecesarias.

### NO PUEDEN salir — nunca, para ningún ámbito

| Campo | Qué expone |
|---|---|
| **`presentacion_password`** | **La contraseña del modo presentación, hoy en claro con `2797` por omisión** (`ConfiguracionNegocio.jsonc:219-222`), comparada en el cliente (`ModoPresentacion.jsx:48`). **Ni siquiera al administrador**: pasa a `passwordHash` (§13.5) y el hash tampoco se lee |

### NO PUEDEN salir al portal público — los 53 restantes

**Integraciones Google (11) — secretos operativos**
`google_sheets_enabled` · `google_drive_enabled` · `google_sheets_status` · `google_drive_status` · **`google_sheets_spreadsheet_id`** · **`google_drive_folder_id`** · `auto_sync_on_cash_cut` · `auto_save_pdf_to_drive` · `auto_update_daily_summary` · `last_sync_at` · `last_sync_status` · **`last_sync_error`** (puede llevar trazas y rutas)

**Modo presentación (3)**
`modo_presentacion_activo` · `presentacion_ultimo_acceso` · `presentacion_notas`

**Datos personales y de contacto (6)**
`direccion` · `telefono` · `whatsapp` · `correo` · `horario` · `redes_sociales`
*Anotación:* algunos podrían tener sentido en un pie de página del menú. **Hoy no se leen**, así que no salen. Si Miguel los quiere en el portal, se añaden uno a uno y con motivo.

**Operación interna (10)**
**`mostrar_costos_a_caja`** · **`permitir_venta_sin_stock`** · `usa_mesas` · `usa_cocina` · `usa_barra` · `hora_inicio_dia_operativo` · `iva_porcentaje` · `silenciar_notificaciones_admin` · `descargar_pdf_corte_auto` · `formato_export_default` · `unidades_medida_lista`

**Apariencia no usada por el portal (20)**
`nombre_sistema` · `platform_brand` · `background_image_url` · `background_fit` · `background_opacity` · `color_primario` · `color_secundario` · `color_acento` · `color_exito` · `color_alerta` · `colorear_importes_monetarios` · `moneda` · `simbolo_moneda` · `mensaje_ticket` · `ticket_footer` · `pdf_footer` · `footer_text` · `mostrar_logo_ticket` · `sonidos_activos` · `volumen_sonido`

*No son secretos, pero tampoco se leen.* `PortalCliente.jsx` no aplica los colores de marca; y `simbolo_moneda` no se usa **ni siquiera donde parecería**: `formatCurrency` tiene `symbol = '$'` por omisión (`financialUtils.js:30`) y el portal lo llama sin argumento (`PortalCliente.jsx:934`, `PedirCuentaQR.jsx:480`).

**La regla, escrita para que no haya que decidir cada vez:** la respuesta pública se construye **eligiendo** los 22, no **quitando** los 54. Una lista de exclusión se queda obsoleta en cuanto alguien añade un campo al esquema; una de inclusión, no.

## 36.4 · Cocina nunca ve dinero — regla 9

`F1-01` §3.9: *«Cocina nunca ve costos, márgenes ni gramajes. Sólo nombres de ingredientes.»* Hoy lo imponen `CocinaProductoDialog` y `ProductoFichaExpandible`, es decir **el componente que dibuja**.

En la lista blanca deja de ser una cuestión de qué se dibuja y pasa a ser qué se envía.

**El ámbito `cocina` NO recibe ninguna columna que:**

- termine en `_centavos` — ningún precio, ningún costo, ningún total;
- termine en `_bp` o se llame `margen_*` — ningún margen;
- sea `cantidad` de `recetas` — ningún gramaje.

**Sí recibe** de `Ingrediente`: `id`, `nombre`, `unidad_base`. Nada más.
**Sí recibe** de `RecetaEscandallo`: `producto_id`, `ingrediente_id`, `ingrediente_nombre`. **Sin `cantidad`, sin `merma`, sin `costo_*`.**
**Sí recibe** de `Venta` y `DetalleVenta`: `producto_nombre`, `cantidad`, `notas_producto`, `estado_preparacion`, `notas_alergias`, `celebracion_especial`, `tipo_celebracion`, `mesa_numero`, `folio`.

La alergia sí se envía, y en primer lugar: es información de seguridad y por eso `PedidoPreparacion` la lleva como snapshot.

## 36.5 · Campos que no salen para NINGÚN ámbito

| Campo | Entidad | Motivo |
|---|---|---|
| `pin` | `UsuarioPOS` | D-01. Sólo existe como `credenciales_pin.pin_hash`, y el hash no sale de la base (`001_plataforma.sql:145-146`) |
| `presentacion_password` | `ConfiguracionNegocio` | D-19. Sólo como hash |
| `organizacion_id` | todas | El ámbito lo pone el servidor; devolverlo invita a mandarlo |
| `idempotency_key` | `ordenes`, `pagos`, `compras`, `gastos` | Detalle del protocolo |
| `device_token_hash`, `codigo_enrolamiento_hash` | `terminales` | Ni siquiera son entidades suyas |

## 36.6 · Límite de filas

`F1-01` §6 lista las consultas que hoy descargan miles de filas al navegador. El puente las topa:

| Entidad | Tope | Qué sustituye |
|---|---|---|
| `Venta` | 200 | `Caja.jsx:229` pide **5000** para buscar un folio → `GET /ventas/buscar?q=` |
| `DetalleVenta` | 500 | Se pide por venta, nunca en bloque |
| `RecetaEscandallo` | 500 | `Caja.jsx` pide **2000 dos veces por cobro** → resuelto dentro de `cobrarVenta` |
| `DescuentoInventarioVenta` | 500 | `CorteViewerDialog.jsx:35` pide **3000** → `GET /cortes/:id/reporte` |
| `MovimientoInventario` | 500 | |
| Catálogo (`ProductoTerminado`, `Ingrediente`, `CategoriaProducto`) | 1000 | |
| Resto | 200 | |

---

# 37 · Contradicciones detectadas contra `F1-01`

Cinco afirmaciones de la auditoría que este mapa **no pudo confirmar leyendo el código**. Se anotan porque `F1-01` es la fuente que gobierna la fase y conviene que quede corregida.

| # | `F1-01` dice | El código dice | Evidencia |
|---|---|---|---|
| **C-1** | «los **26** campos de snapshot de `DetalleVenta`» (§3.11 y §9) | Son **24** | `DetalleVenta.jsonc:5-101` declara 24; el máximo por un `create` es 23; la unión de los cuatro puntos de escritura es 24; cero campos fuera de esquema |
| **C-2** | «`efectivo_esperado` del cierre = ventas en efectivo + propinas en efectivo» (§3.4) | **Hay tres fórmulas y no coinciden.** La que se **persiste** no incluye propinas | Persiste: `Caja.jsx:974`, `:1053` → `metodosPagoExacto.efectivo.ventas`. Muestra: `CierreDiarioDialog.jsx:61,67` → `totalEfectivo + efPropinas`. Legacy: `CorteCaja.jsx:60,75` |
| **C-3** | «Listas blancas de campos por pestaña en Configuración» (§4) | **No existe ninguna constante ni objeto de lista blanca.** Son objetos de estado de formulario, uno por sección, que se envían tal cual | `Configuracion.jsx:92-107` (14 campos), `IdentidadNegocio.jsx:110-125` (14), `ColoresSistemaSection.jsx:44` (2), `ConfiguracionQRTab.jsx:18-30` (11). El único comentario que declara la intención es `IdentidadNegocio.jsx:104-109` |
| **C-4** | D-14 expone «`presentacion_password`, todos los IDs de Google, `paquete_modo` y `mostrar_costos_a_caja`» (§5) | Expone **54 campos** de 76 | `PortalCliente.jsx:63-68` sin proyección, más una **segunda** descarga completa en `qrPedidoFlow.js:255` |
| **C-5** | «25 entidades» (§1, §6, y E3-6 «prueba de ida y vuelta por cada una de las 25») | **Hay 25 archivos de entidad**, pero el encargo enumera 27 nombres, de los cuales **3 no son entidades** (`Zona`, `SesionCaja`, `UnidadMedida`) y **1 entidad real falta de la lista** (`CategoriaIngrediente`) | `historico/restaurante/base44/entities/` tiene 25 `.jsonc`. Las pruebas de ida y vuelta de E3-6 deben ser **25**, sobre las entidades reales |

**Defectos nuevos encontrados al escribir el mapa**, que no están en la lista D-01 a D-21 de `F1-01` §5:

| # | Defecto | Dónde | Gravedad |
|---|---|---|---|
| **N-1** | `RecetaFormDialog.jsx:225` guarda `cantidad_convertida_unidad_base: cant` **sin convertir**, y la unidad es un `<Input>` de texto libre (`:365-366`). Escribir «kg» en un insumo medido en gramos produce un **error de 1000×** en consumo y costo | `RecetaFormDialog.jsx` | **Alta.** Corrompe inventario y márgenes |
| **N-2** | `ordenes_borrador_por_terminal` (`003:183-185`) permite **un solo borrador por terminal**. Cada mesa abierta es un borrador → la segunda mesa no se puede abrir | Esquema nuevo | **Bloqueante.** Impide el flujo de mesero |
| **N-3** | `resumen_ingredientes` está declarado en `CorteCaja.jsonc:172` y **nunca se escribe**. El PDF de un corte antiguo se recalcula al vuelo y puede dar cifras distintas hoy | `CorteViewerDialog.jsx:72-101` | Media. Un reporte histórico no es reproducible |
| **N-4** | `compra_lineas` no persiste la equivalencia del empaque (`piezas_por_paquete`, usada en `RegistrarCompraDialog.jsx:301`). Una compra en cajas **no es auditable** | `RegistrarCompraDialog.jsx` | Media |
| **N-5** | `PortalCliente.jsx:165` no detecta `estado === 'cancelada'`: si el administrador cancela una solicitud, el comensal espera para siempre | `PortalCliente.jsx` | Baja |
| **N-6** | `importExecutors.js:65` escribe `Math.abs(delta)` — **pierde el signo del ajuste**. Un ajuste a la baja se registra como si subiera | `importExecutors.js` | Media. Agrava D-10 |
| **N-7** | `ProveedoresSection.jsx:67` escribe `activo: true` incondicionalmente al editar: **reactiva proveedores desactivados sin avisar** | `ProveedoresSection.jsx` | Baja |
| **N-8** | `ProductoSimpleDialog` fuerza `area_preparacion: 'ninguno'` (`:132`) y `RecetaFormDialog` fuerza `'cocina'` (`:190`). Editar con el diálogo «equivocado» **reescribe el área en silencio**, y el área decide a qué comanda va | dos diálogos | Media |
| **N-9** | `ProductoSimpleDialog.jsx:125-136` **no escribe ninguno de los tres campos financieros**. Un producto creado por esa vía queda con costo `undefined`, que `POS.jsx:112` lee como 0 → **margen 100 %** | `ProductoSimpleDialog.jsx` | Media. Agrava D-09 |
| **N-10** | `ConfiguracionQRTab.jsx:58` invalida la clave `['config_remote']`, **que no existe en ningún otro archivo**. Guardar la configuración del QR no refresca el `ConfigProvider` | `ConfiguracionQRTab.jsx` | Baja |
| **N-11** | `POS.jsx:378-390` omite `detalle_venta_id` en el `DescuentoInventarioVenta` del camino de precio fijo, que sí escriben `POS.jsx:334` y `Caja.jsx:766` | `POS.jsx` | Baja |
| **N-12** | `POS.jsx:271-285` **no escribe `modificadores_snapshot`**, que sí escriben Mesero y QR. Los modificadores de una venta de mostrador no quedan en el ticket | `POS.jsx` | Media, y crece con `F1-01` §7.1 |

---

# 38 · SIN DETERMINAR y decisiones abiertas

Lo que este mapa **no** pudo resolver leyendo el código, y qué haría falta para cerrarlo.

## 38.1 · `mesa_numero`: ¿derivado o snapshot?

**SIN DETERMINAR.** El mapa lo deriva por `join` (§6.4). No encontré ningún sitio del código que exija que sea snapshot, pero tampoco encontré una decisión escrita.

**Qué haría falta:** preguntarle a Miguel si renumera mesas alguna vez. Si la respuesta es sí, la columna `ordenes.mesa_numero smallint` entra y cuesta una columna. Si es no, se queda derivado.

## 38.2 · La propina no existe en el backend nuevo — hueco confirmado

**No es «sin determinar»: está verificado y falta.**

`pagos.propina_centavos` existe en el esquema (`003:262`, `esquema.ts:304`). Y `grep -rn "propina" packages/app/src packages/contracts/src packages/data/src` devuelve **una sola línea**, que es la declaración de la columna en `esquema.ts`.

Es decir:

- **`cobrarOrden` no escribe propinas.** `packages/app/src/venta/cobrar.ts` no las menciona.
- **`repartirPagos` no las admite.** `packages/app/src/venta/pagos.ts:88` exige `suma !== totalCentavos → error`, sin margen para propina.
- **`arqueoDeSesion` no las cuenta**, porque nadie inserta el `movimientos_caja` de `tipo='propina'` que sí está previsto en el `check` (`003:306`).

**Sin esto, las reglas 1 a 4 de `F1-01` §3 no se pueden cumplir en el backend nuevo, por bien que esté el mapa.** Es trabajo de la etapa E6, no de E3, pero el mapa depende de ello y hay que decirlo.

Lo que hace falta, en concreto:

1. `PagoEntrante` gana `propinaCentavos`.
2. `repartirPagos` valida `Σ monto === total` **y** acumula las propinas aparte, sin mezclarlas.
3. `cobrarOrden` inserta un `movimientos_caja` con `tipo='propina'` y monto positivo por cada propina **en efectivo**. Las de tarjeta y transferencia no mueven el cajón y no generan movimiento.
4. `arqueoDeSesion` las incluye porque suma `movimientos_caja`; no hay que tocarla.

## 38.3 · `DescuentoInventarioVenta` por línea

**Decidido, con reserva.** La vista devuelve `null` en `detalle_venta_id`, `producto_id`, `cantidad_producto` y `cantidad_ingrediente_por_producto` porque el ledger agrega por insumo (§19.1). Ninguno se lee hoy.

Si más adelante se quiere el desglose por línea, la vía es `movimientos_stock.orden_linea_id` y dejar de agregar. **Cuesta multiplicar las filas del ledger** y no se hace ahora.

## 38.4 · Rotación del token QR

**Fuera de alcance de Fase 1.** `generarTokenMesa` es una función pura del `id` (`qrUtils.js:8-16`), así que «regenerar» da el mismo valor y `MesasQRTab.jsx:45` sólo genera donde falta. Un token filtrado no se puede invalidar sin cambiar el `id` de la mesa.

El índice único de §35.4 impide el duplicado, que es lo que pedía `F1-01` §6. La rotación necesita un token aleatorio y una pantalla, y eso es Fase 2.

## 38.5 · Formato del folio visible

**Decidido en §6.2, y es un cambio que Miguel ve.** `M5-20260909-K3F2` pasa a `M-000042`.

**Qué haría falta para cerrarlo del todo:** que Miguel lo vea en un ticket impreso. Es la clase de decisión que se confirma enseñando, no preguntando. Si prefiere conservar el número de mesa dentro del folio, la alternativa es una columna `sufijo_folio text` que el puente concatene — **no** una serie por mesa, que `folios.serie ~ '^[A-Z]{1,6}$'` no admite.

## 38.6 · Qué pasa con las tablas `orden_ajustes` y `orden_linea_exclusiones`

`F1-02` §5, tarea E3-1, las lista entre las tablas a crear. **Ninguna de las 27 entidades de este mapa las necesita.**

Corresponden a `F1-01` §7.1 —extras y aditivos con precio— y el mapa muestra que **ese caso ya lo cubre `orden_linea_modificadores`**, que existe y tiene `precio_extra_centavos` (§7.4). Una «exclusión» (*sin cebolla*) es una opción de modificador con precio cero.

**Recomendación: no se crean.** Si al implementar E9 aparece un caso que `orden_linea_modificadores` no cubra, se crean entonces y con el caso delante. Crearlas ahora sería generalidad especulativa.

## 38.7 · Migración de datos históricos

**No aplica, y conviene decirlo en voz alta.** `DECISIONES.md` A-04: *«Sistema Base44: erradicación total. No hay nada que congelar ni migrar.»*

Este mapa es una **capa de traducción para código vivo**, no un plan de migración de datos. Los datos históricos del restaurante no se importan. Si en algún momento se decidiera importarlos, este documento serviría de base pero haría falta además: resolver los folios duplicados que D-20 pudo generar, unificar el signo de `MovimientoInventario` (D-10), y decidir qué se hace con las ventas de mostrador sin `total_cobrado_con_propina`.

## 38.8 · Lo que el mapa NO cubre

Para que no se lea como más completo de lo que es:

- **No define los comandos.** Las 14 operaciones transaccionales de `F1-01` §6 son las tareas E4 a E8 de `F1-02`. Aquí sólo se dice dónde acaban sus escrituras.
- **No define los cinco canales de tiempo real.** Los índices de §34.12 los soportan; el transporte es otra tarea.
- **No traduce `User` de la plataforma.** `F1-02` §8, trampa T4, ya lo zanjó: desaparece, su rol lo da `empleos`.
- **No cubre el escáner de código de barras** (`F1-01` §7.2). `productos.codigo_barras` y su índice único parcial ya existen (`002_catalogo.sql:148-150`); no hace falta traducir nada porque no hay entidad de Miguel que lo use.
- **No decide el formato del ticket.** Es A-31, pendiente.

---

## Cierre

**27 nombres mapeados** — 24 entidades reales de Base44, más `CategoriaIngrediente` que faltaba en la lista, más 3 conceptos (`Zona`, `SesionCaja`, `UnidadMedida`) que no son entidades y ahora tienen destino escrito.

**16 tablas nuevas · 1 vista · 8 tablas existentes con 56 columnas nuevas · 12 restricciones.**

Cada afirmación sobre un campo de este documento sale de haber leído el archivo y la línea que se cita. Donde no pude determinar algo, dice **SIN DETERMINAR** y dice qué haría falta leer o preguntar.
