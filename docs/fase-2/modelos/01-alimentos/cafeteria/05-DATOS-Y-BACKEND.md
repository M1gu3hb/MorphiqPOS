# 05 · DATOS Y BACKEND · Cafetería de mostrador

Todo lo que sigue se escribe **como si ya estuviera dentro del monorepo** (D-05): mismos contratos,
mismos nombres, misma estructura. Las migraciones se escriben numeradas y listas y **no se
aplican**.

Reglas heredadas que condicionan cada línea:

- Dinero en **bigint de centavos**. Nunca flotantes.
- Precios y totales **siempre** en el servidor. El endpoint no acepta importes del cliente.
- Autorización **por sesión**. Un comando que declare `rol`, `organizacion_id`, `sucursal_id`,
  `empleo_id`, `identidad_id` o `terminal_id` en su entrada **no compila**.
- Cobro, caja, stock y pedido: **transaccionales e idempotentes**.
- Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
- Migraciones nuevas y numeradas. Nunca editar una aplicada: el ejecutor valida por hash.
- Cero SQL concatenado. Cero `any`, cero `@ts-ignore`, cero `catch` vacío.

La última migración aplicada es **`057_resumen_pagos_por_orden.sql`**. `restaurante` reservó de la
**060 a la 069**. Esta carpeta arranca en la **070**.

---

## 0 · DOS HALLAZGOS DEL CÓDIGO QUE CONDICIONAN TODO

Antes de las entidades, dos cosas que aparecieron al leer el repositorio y que hay que resolver
primero porque afectan a un cliente que está operando hoy.

### 0.1 · El trigger de unidad base no protege a `cafeteria`

`054_separar_giro_paquete.sql` define `insumo_unidad_base_valida()`, que obliga a que un insumo sólo
se mida en `g`, `ml` o `pieza`:

```sql
if giro = 'restaurante' and new.unidad_base not in ('g', 'ml', 'pieza') then
  raise exception ...
```

**La condición es `giro = 'restaurante'` y nada más.** Para `giro = 'cafeteria'` no valida nada: hoy
se puede dar de alta la leche con `unidad_base = 'litro'` y el consumo se dividiría entre mil sin
que falle nada, en ningún lado. Es el error de 1000× con la puerta abierta en el insumo más caro
del giro. **Se corrige en la migración 070** ampliando la condición a los giros con inventario V6.

### 0.2 · Café Jacaranda está hoy en la plantilla equivocada

Según `00-LEEME-PRIMERO.md`, Café Jacaranda tiene `giro = 'cafeteria'` y `paquete =
'restaurante_pro'`. Y la 054 tiene este `check`:

```sql
add constraint organizaciones_paquete_compatible_con_giro
  check (paquete <> 'restaurante_pro' or giro in ('cafeteria', 'restaurante'));
```

O sea: el esquema **permite a propósito** que una cafetería esté en `restaurante_pro`, y así está
hoy. Consecuencia real: Café Jacaranda tiene encendidos **Mesas, Mesero y Cocina**, tres módulos que
no usa, en la pantalla donde más prisa tiene.

La decisión **D-01** renombra `operativo` → `cafeteria`, y lo natural sería mover a Café Jacaranda
de `restaurante_pro` a `cafeteria`. **Eso es una baja de paquete sobre un cliente vivo**, y hay que
decirlo con esas palabras:

- Si el negocio tiene mesas dadas de alta (aunque no las use) y comandas históricas, quitarle el
  módulo deja datos sin pantalla que los lea.
- La ruta `/mesero` deja de estar permitida y cualquier sesión abierta ahí se rompe.
- El corte histórico tiene secciones que la plantilla nueva no pinta.

**Por eso la migración 066 (`066_plantillas_semilla.sql`) no se aplica sin la respuesta a la
decisión pendiente P-04.** Esa migración es ahora una sola para los cinco modelos —antes eran cinco
`*_plantilla_*.sql`, una por carpeta— y por tanto la condición de P-04 las cubre a todas de golpe.
Y la recomendación que esta carpeta deja escrita es: **primero construir
la tanda 1 (F-328, F-329, F-331), después migrar el paquete**. Mover a Café Jacaranda a `cafeteria`
antes de que exista la fila de barra sería quitarle Cocina sin darle nada a cambio.

---

## 1 · ENTIDADES NUEVAS

Cinco tablas y dos vistas. Todas llevan `organizacion_id` y `sucursal_id` con RLS, como el resto
del esquema.

**Lo que NO se crea, a propósito:** no hay tabla nueva para la fila de barra. F-328 se construye
**extendiendo `pedidos_preparacion`**, que ya existe y ya está en el puente como
`PedidoPreparacion`. Crear una tabla paralela duplicaría el ruteo a estación, los estados y el
refresco, y el día que se corrigiera un error en uno de los dos, el otro se quedaría con él.

### 1.1 · `llamados_pedido` — F-329

Ledger inmutable de llamados. Es lo que convierte "le grité" en un dato.

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `organizacion_id`, `sucursal_id` | uuid | not null, fk |
| `pedido_preparacion_id` | uuid | not null, fk `pedidos_preparacion` |
| `medio` | text | not null, `check in ('pantalla','voz','whatsapp')` |
| `numero_llamado` | int | not null, `check > 0` |
| `empleado_id` | uuid | not null, fk |
| `ocurrido_en` | timestamptz | not null, default now() |

**Inmutable**: sin `updated_at`, sin `update`, sin `delete`. Índice `(pedido_preparacion_id,
numero_llamado)` único: el segundo llamado es el segundo, no hay dos segundos.

**Por qué una tabla y no un contador en el pedido.** Porque un contador contesta *"¿cuántas veces?"*
y lo que hace falta contestar es *"¿cuántas veces, por qué medio y con cuánto tiempo entre una y
otra?"*. Tres llamados en veinte segundos son un barista nervioso; tres llamados en cuatro minutos
son un cliente que se fue. Son dos problemas distintos y un contador los confunde.

### 1.2 · `presencias_turno` — F-248

La base del reparto del bote por horas. Es también **la semilla de F-960/F-961** (reloj checador y
horas trabajadas), y se declara así para que nadie construya dos cosas.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `sesion_caja_id` | uuid not null fk | El turno |
| `empleado_id` | uuid not null fk | |
| `entro_en` | timestamptz not null | Se escribe al acceder con PIN |
| `salio_en` | timestamptz null | Se escribe al cerrar sesión o al cerrar el turno |
| `minutos` | int generated always as | Columna generada; null mientras `salio_en` sea null |
| `origen` | text not null | `pin` · `manual` — un ajuste a mano queda marcado |
| `ajustada_por` | uuid null fk | Quién corrigió, si se corrigió |

**Restricción:** no puede haber dos presencias abiertas del mismo empleado en la misma sesión de
caja. Índice único parcial `(sesion_caja_id, empleado_id) where salio_en is null`.

**Por qué el origen se guarda.** Porque la corrección a mano existe —alguien se olvidó de cerrar
sesión— y porque un reparto de propina calculado sobre horas que alguien tecleó no es lo mismo que
uno calculado sobre horas que registró el sistema. El documento de reparto lo dice.

### 1.3 · `lealtad_saldos` y `lealtad_movimientos` — F-930, F-934, F-936

```
lealtad_saldos
  cliente_id     uuid not null fk clientes   ← pk junto con organizacion_id
  organizacion_id uuid not null fk
  sellos         int not null default 0 check (sellos >= 0)
  canjes_totales int not null default 0
  actualizado_en timestamptz not null
  pk (organizacion_id, cliente_id)

lealtad_movimientos                          ← ledger inmutable
  id              uuid pk
  organizacion_id · sucursal_id  uuid not null fk
  cliente_id      uuid not null fk clientes
  tipo            text not null check in ('otorga','canje','ajuste','caduca')
  sellos          int  not null check (sellos <> 0)   ← +1 otorga, −5 canje
  orden_id        uuid null fk ordenes
  producto_id     uuid null fk productos   ← qué se canjeó
  costo_centavos  bigint null              ← costo del canje, congelado
  motivo          text null                ← obligatorio en 'ajuste', por check
  empleado_id     uuid not null fk
  created_at      timestamptz not null default now()
```

**El saldo es una proyección del ledger, igual que el stock.** `lealtad_saldos` es caché con
índice, no la verdad; la verdad está en `lealtad_movimientos` y se puede reconstruir. Es la misma
decisión que se tomó con `movimientos_stock` y por la misma razón: un saldo escribible es un saldo
que alguien va a "arreglar".

**El pasivo (F-936) es una consulta, no una columna:** `sum(sellos) / sellos_por_premio ×
costo_promedio_del_premio` sobre los saldos vivos. No se materializa porque cambia con cada venta y
porque un pasivo guardado se desincroniza.

**La sucursal está en el movimiento y no en el saldo**, a propósito: el sello se gana en un local y
se canjea en cualquiera (ver `04-INTERFAZ.md` §4.5). El saldo es del negocio.

### 1.4 · `lotes_grano` — F-157

Mínimo viable, y se dice qué no hace.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `insumo_id` | uuid not null fk `insumos` | |
| `fecha_tueste` | date not null | Se captura en la recepción de compra |
| `compra_linea_id` | uuid null fk | De dónde vino |
| `abierto_en` | timestamptz null | Se llena al abrir la bolsa |
| `agotado_en` | timestamptz null | Se llena al abrir la siguiente |
| `gramos_recibidos` | numeric(14,4) not null | |
| `empleado_id` | uuid not null fk | |

**Índice único parcial** `(insumo_id) where abierto_en is not null and agotado_en is null` — hay un
solo lote abierto por insumo a la vez.

**Lo que esta tabla NO hace, dicho sin adornos:** no traza. No sabe qué lote se usó en el latte del
martes. Sabe **qué lote está en la tolva hoy y cuántos días lleva del tueste**, que es lo único que
dispara una decisión. Trazabilidad completa sería V4 (F-124) y nadie en este giro la pediría jamás.
Es el 90% del beneficio por el 10% del trabajo, y está escrito aquí para que nadie lo "mejore"
después.

### 1.5 · `pedidos_anticipados` — F-330

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `orden_id` | uuid not null fk `ordenes` | Ya cobrada |
| `nombre` | text not null | |
| `telefono` | text null | Para avisar si se atrasa |
| `hora_prometida` | timestamptz not null | |
| `estado` | text not null | `programado` · `en_fila` · `entregado` · `no_recogido` |
| `encolado_en` | timestamptz null | Cuándo entró de verdad a la fila |
| `created_at` | timestamptz not null | |

**Índice** `(sucursal_id, hora_prometida) where estado = 'programado'`, que es lo que el
planificador lee cada minuto.

**La capacidad por hueco no vive aquí:** es una consulta de conteo sobre `hora_prometida` truncada a
cinco minutos, contra un límite configurable. Materializarla crearía un segundo sitio donde la
verdad puede divergir.

### 1.6 · Vistas

```
fila_barra                                       ← F-328
  Sobre `pedidos_preparacion` + `ordenes` + `orden_lineas`.
  Por cada pedido vivo o entregado en las últimas 2 h:
    nombre_pedido, canal, estado, cobrado_en, listo_en, entregado_en,
    segundos_espera, llamados, alergias, lineas (jsonb con opciones).
  Es lo que lee la pantalla de barra y la de recogida.
  NO expone costo, margen ni gramaje: se filtra por campo en el puente.

merma_barra_turno                                ← F-156
  Sobre `movimientos_stock` where referencia_tipo = 'merma_barra'.
  Por sesión de caja y motivo: cantidad, unidad, costo_centavos, n eventos.
  Es la sección 11 del corte y el bloque del dashboard.
```

**Por qué `merma_barra_turno` es una vista y no una tabla.** Porque la merma de barra **ya se
escribe en el ledger** con su motivo tipado. Crear una tabla paralela sería tener el mismo hecho en
dos sitios, y el día que uno se escriba y el otro no, el inventario y el reporte dirían cosas
distintas. F-156 **no crea tabla**: crea un comando, cuatro valores de `check` y esta vista.

---

## 2 · ENTIDADES EXISTENTES QUE HAY QUE EXTENDER

| Tabla | Campo nuevo | Tipo | Para qué |
|---|---|---|---|
| `ordenes` | `canal` | text not null default `'aqui'`, `check in ('aqui','llevar','plataforma','anticipado')` | **F-331.** Decide el empaque. Es el campo más barato y más rentable de toda esta carpeta |
| `ordenes` | `nombre_pedido` | text null | F-328/F-329. El nombre del vaso. **No es `cliente_nombre`**: ese campo existe y es del cliente identificado; éste es una etiqueta efímera. Confundirlos metería nombres de pila sueltos en la ficha de clientes |
| `ordenes` | `cliente_id` | uuid null fk `clientes` | F-930. Sólo cuando se identifica por teléfono |
| `orden_lineas` | `opciones` | jsonb null | F-027. Instantánea de las opciones elegidas y su efecto en precio. Congelada: si mañana cambia el precio de la avena, el ticket de hoy no cambia |
| `orden_lineas` | `combo_id` | uuid null fk `productos` | F-030. Qué combo agrupó esta línea |
| `orden_lineas` | `tipo_linea` | text not null default `'venta'`, `check in ('venta','canje_lealtad')` | El canje del sexto café. Sale del stock, **no cuenta como ticket ni entra al ticket promedio** |
| `pedidos_preparacion` | `estado` | se amplía el `check` con `'entregado'` y `'no_recogido'` | F-328 |
| `pedidos_preparacion` | `cobrado_en` | timestamptz not null | F-328. **El reloj arranca aquí**, no al crear |
| `pedidos_preparacion` | `listo_en` | timestamptz null | |
| `pedidos_preparacion` | `entregado_en` | timestamptz null | |
| `pedidos_preparacion` | `llamados` | int not null default 0 | Desnormalización de conveniencia para la fila; la verdad está en `llamados_pedido` |
| `recetas` | `aplica_canal` | text null, `check in ('aqui','llevar')` | **F-331.** Null = siempre. La línea de vaso lleva `'llevar'` |
| `recetas` | `sustituible_por_grupo_id` | uuid null fk `modificadores` | F-027. Declara que esta línea la puede sustituir un grupo de opciones |
| `modificadores` | `insumo_sustituto_id` | uuid null fk `insumos` | F-027. Con qué insumo sustituye |
| `modificadores` | `factor_cantidad` | numeric(6,4) not null default 1 | F-027. El 16 oz escala la receta ×1.44 |
| `modificadores` | `delta_precio_centavos` | bigint not null default 0 | F-027 |
| `insumos` | `unidad_captura_preferida` | text null | La onza, propia de este giro |
| `insumos` | `dias_frescura_optima` | int null | F-157. 30 para el café, null para todo lo demás |
| `insumos` | `lote_abierto_id` | uuid null fk `lotes_grano` | F-157, desnormalización para la alerta |
| `sesiones_caja` | `fondo_monedas_centavos` | bigint not null default 0 | El desglose por denominación |
| `sesiones_caja` | `fondo_chicos_centavos` | bigint not null default 0 | Billetes de $20 y $50 |
| `sesiones_caja` | `fondo_grandes_centavos` | bigint not null default 0 | |
| `sesiones_caja` | `bote_contado_centavos` | bigint null | **El segundo arqueo.** Null hasta que se cuenta |
| `sesiones_caja` | `turno` | text null, `check in ('matutino','vespertino')` | Para el título del corte |
| `movimientos_caja` | `tipo` | se amplía el `check` con `'entrada_cambio'` | El movimiento más frecuente de la mañana |
| `movimientos_stock` | `referencia_tipo` | se amplía con `'merma_barra'`, `'consumo_interno'`, `'canje_lealtad'` | F-156, F-261, F-934 |
| `movimientos_stock` | `motivo` | se amplía con `'calibracion'`, `'vaporizado'`, `'bebida_rehecha'`, `'caducidad_leche'` | F-156 |
| `productos` | `familia` | text not null default `'otro'`, `check in ('bebida','alimento','grano','otro')` | Ordena el catálogo y decide la tasa por omisión |
| `productos` | `gramaje_shot` | numeric(6,2) null | F-156. Cuántos gramos tira una calibración |
| `productos` | `sellos_otorga` | int not null default 0 | F-930. Un latte da 1, una bolsa de grano da 0 |
| `liquidaciones_propina` | `reparto_base` | text not null default `'mesero'`, `check in ('mesero','horas','partes_iguales')` | **F-248.** Es el único campo que hace falta añadir a lo que `restaurante` ya propuso |
| `configuracion` (documento) | `propina_montos_sugeridos` | arreglo de centavos | Pesos, no porcentajes |
| `configuracion` (documento) | `sellos_por_premio` | int | 5 o 9 |
| `configuracion` (documento) | `comision_terminal_bp` | int | 360 = 3.6% |
| `configuracion` (documento) | `cambio_minimo_centavos` | int | El umbral del aviso |
| `configuracion` (documento) | `descuento_maximo_centavos` | objeto por rol | **F-205, en pesos y no en puntos base.** Ver `02-DINERO-Y-CAJA.md` §3 |

**La entidad `liquidacion_propina_beneficiarios`, que `restaurante` propuso en su migración 066, se
reutiliza tal cual.** Aquí el campo `puesto` guarda `'barista'` y el campo `puntos` guarda **las
horas**. No hace falta una tabla nueva y crearla sería duplicar el mismo hecho con otro nombre.

---

## 3 · REGLAS DE INTEGRIDAD QUE GARANTIZA LA BASE

No la aplicación. La base.

1. **Un insumo de cafetería sólo se mide en g, ml o pieza.** Se amplía
   `insumo_unidad_base_valida()` para incluir `giro = 'cafeteria'`. **Corrige el hueco de §0.1.**
2. **No se cobra sin canal.** `ordenes.canal` es `not null` con `check`. Una venta sin canal no
   sabría qué empaque descontar, así que no puede existir.
3. **Una línea de canje no tiene importe.** `check`: si `tipo_linea = 'canje_lealtad'` entonces
   `importe_centavos = 0` y `precio_unitario_centavos = 0`.
4. **Un canje exige saldo.** Trigger: no se puede escribir un `lealtad_movimientos` de tipo
   `canje` que deje `sellos` en negativo. El `check (sellos >= 0)` de `lealtad_saldos` lo cierra por
   el otro lado.
5. **El saldo de lealtad iguala la suma de su ledger.** Trigger de constraint diferido. Es la misma
   regla que hace que el stock no se pueda "arreglar".
6. **Una línea de receta con `aplica_canal` sólo se consume en ese canal.** No es un `check`: es la
   explosión de receta filtrando. Se declara aquí porque es una regla de modelo y tiene que estar
   escrita en un sitio, aunque viva en el comando.
7. **Un pedido no puede estar `entregado` sin `listo_en`.** `check` cruzado.
8. **Un pedido `no_recogido` exige al menos tres llamados.** `check` contra `llamados >= 3`.
   Sin esto, *nadie vino* se convierte en el botón para vaciar la fila cuando hay prisa.
9. **Los llamados de un pedido son consecutivos y únicos.** Índice único
   `(pedido_preparacion_id, numero_llamado)`.
10. **Una presencia abierta por empleado y turno.** Índice único parcial ya descrito.
11. **El reparto del bote suma su total.** Trigger de constraint diferido sobre
    `liquidacion_propina_beneficiarios`, heredado de `restaurante`. El redondeo va a quien más
    horas tuvo y queda escrito en `formula_snapshot`.
12. **Un solo lote de grano abierto por insumo.** Índice único parcial.
13. **No se cierra el turno con pedidos en la fila.** Se valida en el comando **y** con un `check`
    sobre el cierre: la sesión no pasa a `cerrada` si existe un `pedidos_preparacion` en estado
    `en_fila`, `preparando` o `listo` apuntando a ella. **F-262**, aplicada a esta unidad.
14. **No se cierra el turno sin contar el bote.** `check`: `bote_contado_centavos is not null`
    cuando la sesión pasa a `cerrada` y el turno tuvo propina en efectivo. Un turno cerrado sin
    arqueo de bote es un arqueo que no existió.
15. **El signo del ledger lo impone el tipo.** Ya existe y se extiende a los tipos nuevos.
16. **`lealtad_movimientos` nunca toca `ordenes.total_centavos`.** No hay ruta por la que un canje
    se convierta en venta. Restricción de modelo, escrita aquí para que nadie la "mejore" después.

---

## 4 · COMANDOS

Todos pasan por `comando()`: rol → paquete → validación → idempotencia → transacción → auditoría.
Ninguno acepta ámbito en su entrada.

| Comando | Entrada | Roles | Paquete | Qué escribe | Idem. |
|---|---|---|---|---|---|
| `cobrarVenta` *(se extiende)* | `{..., canal, nombrePedido?, clienteId?, clave}` | barista, administrador | cafeteria | Lo de siempre **más**: encola en `pedidos_preparacion` con `cobrado_en`, explota receta **filtrando por canal y resolviendo opciones**, otorga sellos. **Todo en la misma transacción** | **Sí** (ya lo es) |
| `llamarPedido` | `{pedidoId, medio}` | barista, administrador | cafeteria | `llamados_pedido` + incrementa `pedidos_preparacion.llamados`. Si es el primero, sella `listo_en` | **Sí** |
| `entregarPedido` | `{pedidoId, clave}` | barista, administrador | cafeteria | Sella `entregado_en`, pasa a `entregado` | **Sí** |
| `marcarNoRecogido` | `{pedidoId, clave}` | barista, administrador | cafeteria | Pasa a `no_recogido`. **Falla si `llamados < 3`** | **Sí** |
| `deshacerEntrega` | `{pedidoId}` | barista, administrador | cafeteria | Vuelve a `listo`. **Sólo dentro de 60 s** desde `entregado_en`, validado en el servidor y no en la pantalla | **Sí** |
| `registrarMermaBarra` | `{motivo, insumoId?, productoId?, cantidad?, pedidoId?, clave}` | barista, administrador | cafeteria | Movimientos en `movimientos_stock` con `referencia_tipo = 'merma_barra'`. Si el motivo es `calibracion` y viene `productoId`, calcula la cantidad desde `gramaje_shot` × n shots | **Sí** |
| `registrarCalibracion` | `{shots, clave}` | barista, administrador | cafeteria | Atajo del anterior para la apertura: un toque, sin elegir insumo. Usa el lote de grano abierto | **Sí** |
| `abrirLoteGrano` | `{insumoId, loteId?, fechaTueste?}` | barista, almacén, administrador | cafeteria | Cierra el lote anterior (`agotado_en`), abre el nuevo, actualiza `insumos.lote_abierto_id` | **Sí** |
| `contarLeche` | `{conteos:[{insumoId, cantidad}], clave}` | barista, administrador | cafeteria | Un ajuste por insumo con motivo `conteo_diario`, y devuelve teórico, contado y % de merma. **No escribe el % : lo calcula** | **Sí** |
| `entradaCambio` | `{monedas, chicos, grandes, origen, clave}` | barista, administrador | cafeteria | `movimientos_caja` tipo `entrada_cambio`, desglosado | **Sí** |
| `abrirTurno` *(se extiende)* | `{monedas, chicos, grandes, turno, notas?}` | barista, administrador | cafeteria | Lo de siempre más el desglose y el turno. Abre la presencia de quien abre | **Sí** |
| `cerrarTurno` *(se extiende)* | `{efectivoContado, boteContado, dejaEnCaja, dejaEnCambio, clave}` | barista, administrador | cafeteria | Lo de siempre más el arqueo del bote. **Falla si hay pedidos en la fila** (F-262). Cierra las presencias abiertas | **Sí** |
| `repartirBote` | `{sesionCajaId, clave}` | administrador, dueña | cafeteria | `liquidaciones_propina` con `reparto_base = 'horas'` + beneficiarios calculados desde `presencias_turno` + movimiento de salida de caja por la parte en efectivo | **Sí** |
| `ajustarPresencia` | `{presenciaId, entroEn?, salioEn?, motivo}` | administrador, dueña | cafeteria | Corrige una presencia y marca `origen = 'manual'`. **Falla si el bote ya se repartió**: un reparto firmado no se recalcula | **Sí** |
| `identificarCliente` | `{telefono, nombre?}` | barista, administrador | cafeteria | Busca o da de alta en `clientes`. Devuelve saldo de sellos | **Sí** |
| `canjearSello` | `{ordenId, clienteId, productoId, clave}` | barista, administrador | cafeteria | `lealtad_movimientos` tipo `canje`, línea `tipo_linea = 'canje_lealtad'` en la orden, y salida de stock. **Falla si no hay saldo** | **Sí** |
| `ajustarSellos` | `{clienteId, sellos, motivo}` | administrador, dueña | cafeteria | `lealtad_movimientos` tipo `ajuste`, motivo obligatorio | **Sí** |
| `programarPedidoAnticipado` | `{lineas, nombre, telefono?, horaPrometida, clave}` | portal (sin sesión, con token) | cafeteria | Orden cobrada + `pedidos_anticipados` en `programado`. **Falla si el hueco de cinco minutos está lleno** | **Sí** |
| `encolarAnticipado` | `{anticipadoId}` | sistema (tarea programada) | cafeteria | Mueve el pedido a la fila **tres minutos antes** de la hora prometida | **Sí** |
| `registrarConsumoInterno` | heredado de `restaurante` (F-261) | administrador, barista | cafeteria | Sin cambios respecto a lo que propuso `restaurante` | **Sí** |

**Nota sobre `cobrarVenta`.** Es el comando que más se toca de esta carpeta y el que menos se puede
romper: lo ejecuta 180 veces al día un cliente vivo. Lo que se le añade —canal, nombre, encolado,
sellos— **no cambia ninguna de sus escrituras actuales**, sólo añade escrituras dentro de la misma
transacción. La prueba de mutación correspondiente es: quitar el encolado y confirmar que la prueba
de *"cobrar deja el pedido en la fila"* falla; restaurar.

---

## 5 · ENTRADAS DEL PUENTE

Se declaran en `packages/app/src/puente/mapa.ts`, con `rolesLectura` **obligatorio** a nivel de
tipo. Lo que no se declara no se lee.

**Primero, un hueco que hay que cerrar:** la tabla `clientes` existe desde la migración 002 y
**no está declarada en el puente**. `Venta` expone `cliente_nombre` como texto y nada más. Sin
declarar `Cliente`, todo el módulo de sellos no tiene de dónde leer.

| Entidad expuesta | Tabla | `rolesLectura` | Escritura | Campos que se descartan |
|---|---|---|---|---|
| `Cliente` | `clientes` | dueño, administrador, gerente, cajero | `comando` | `saldo_pendiente_centavos` y `limite_credito_centavos` **no se exponen**: no hay crédito en esta plantilla y una columna visible invita a usarla |
| `SaldoLealtad` | `lealtad_saldos` | dueño, administrador, gerente, cajero | `lectura` | Ninguno |
| `MovimientoLealtad` | `lealtad_movimientos` | dueño, administrador, gerente | `comando` | `costo_centavos` sólo quienes ven márgenes |
| `LlamadoPedido` | `llamados_pedido` | dueño, administrador, gerente, cajero | `comando` | Ninguno |
| `PresenciaTurno` | `presencias_turno` | dueño, administrador, gerente | `comando` | Un barista **no ve las horas de otro**. El propio, sí |
| `LoteGrano` | `lotes_grano` | dueño, administrador, gerente, almacén, cajero | `comando` | Ninguno. El barista necesita ver la fecha de tueste |
| `PedidoAnticipado` | `pedidos_anticipados` | dueño, administrador, gerente, cajero | `comando` | `telefono` sólo dirección y caja |
| `FilaBarra` | vista `fila_barra` | dueño, administrador, gerente, cajero | `lectura` | **Ningún costo, margen ni gramaje.** Y el nombre se expone recortado al primer nombre |
| `MermaBarraTurno` | vista `merma_barra_turno` | dueño, administrador, gerente | `lectura` | Ninguno |

**Ampliaciones a entidades existentes del puente:** `Venta` gana `canal`, `nombre_pedido`,
`cliente_id`; `DetalleVenta` gana `opciones`, `combo_id`, `tipo_linea`; `PedidoPreparacion` gana
`cobrado_en`, `listo_en`, `entregado_en`, `llamados`; `RecetaEscandallo` gana `aplica_canal` y
`sustituible_por_grupo_id`; `Ingrediente` gana `dias_frescura_optima` y `lote_abierto_id`;
`ProductoTerminado` gana `familia`, `gramaje_shot` y `sellos_otorga`; `CorteCaja` gana los tres
campos de fondo desglosado, `bote_contado_centavos` y `turno`.

**La regla que se mantiene y la que cambia.** Se mantiene: cocina —aquí, la **barra**— nunca lee
costos, márgenes ni gramajes, declarado por campo. **Cambia una cosa y hay que decirla:** la barra
**sí** lee el total del pedido, porque el rol `barista` incluye `cajero`. En `restaurante` la
cocina no ve un peso; aquí la barra ve el total y sólo el total. No es una relajación del control:
es que las dos funciones las hace la misma persona, y negarle un dato a alguien que lo acaba de
teclear es teatro.

---

## 6 · RUTAS DE API NUEVAS

Mismo patrón que las existentes: una ruta por comando, `POST`, cuerpo validado por esquema, ámbito
desde la sesión.

```
apps/web/app/api/cafeteria/llamar-pedido/route.ts
apps/web/app/api/cafeteria/entregar-pedido/route.ts
apps/web/app/api/cafeteria/no-recogido/route.ts
apps/web/app/api/cafeteria/deshacer-entrega/route.ts
apps/web/app/api/cafeteria/merma-barra/route.ts
apps/web/app/api/cafeteria/calibracion/route.ts
apps/web/app/api/cafeteria/lote-grano/abrir/route.ts
apps/web/app/api/cafeteria/contar-leche/route.ts
apps/web/app/api/caja/entrada-cambio/route.ts
apps/web/app/api/propinas/repartir-bote/route.ts
apps/web/app/api/turno/presencia/ajustar/route.ts
apps/web/app/api/lealtad/identificar/route.ts
apps/web/app/api/lealtad/canjear/route.ts
apps/web/app/api/lealtad/ajustar/route.ts
apps/web/app/api/portal/pedido-anticipado/route.ts
```

**Una ruta de lectura sin sesión**, y es la única de todo el sistema:

```
apps/web/app/api/publico/recogida/[token]/route.ts
```

Sirve la pantalla de recogida (F-329). **No lleva sesión de empleado** porque el monitor del salón
no tiene quién inicie sesión, y se protege con un token de terminal de sólo lectura, con TTL,
emitido desde Configuración. Devuelve **exclusivamente** nombres de pila y el estado `listo`.
Nada más: ni importes, ni productos, ni teléfonos. Es la superficie más expuesta de todo el sistema
—cualquiera que vea el monitor ve la respuesta— y por eso su contrato es la lista más corta
posible.

Las demás lecturas van por el puente ya existente (`/api/datos/consultar`), sin rutas nuevas.

---

## 7 · MIGRACIONES

Numeradas, en orden, **escritas y no aplicadas**. Cada una es independiente y reversible por
compensación, nunca editando la anterior. `restaurante` ocupa de la 060 a la 069.

| Nº | Archivo | Qué crea |
|---|---|---|
| **080** | `080_unidad_base_cafeteria.sql` | Amplía `insumo_unidad_base_valida()` a `giro = 'cafeteria'`. **Corrige el hueco de §0.1.** Va primera porque es un error de datos activo, no una función nueva. Incluye la verificación de que ningún insumo existente viola ya la regla y, si lo hace, **falla la migración en vez de convertir a ciegas** |
| **081** | `081_canal_y_nombre_pedido.sql` | `ordenes.canal` (not null, default `'aqui'`, con `check`), `ordenes.nombre_pedido`, `ordenes.cliente_id`, y el backfill de `canal` a `'aqui'` para lo histórico. Desbloquea F-328 y F-331 |
| **082** | `082_fila_barra.sql` | Amplía el `check` de estados de `pedidos_preparacion` con `entregado` y `no_recogido`; columnas `cobrado_en`, `listo_en`, `entregado_en`, `llamados`; tabla `llamados_pedido` con su índice único y su RLS; vista `fila_barra`; `check` de no-recogido con tres llamados |
| **083** | `083_empaque_por_canal.sql` | `recetas.aplica_canal` con su `check`. Es una columna y es la que arregla el margen de todas las bebidas |
| **084** | `084_opciones_con_receta.sql` | `recetas.sustituible_por_grupo_id`, `modificadores.insumo_sustituto_id`, `modificadores.factor_cantidad`, `modificadores.delta_precio_centavos`, `orden_lineas.opciones`, `productos.familia`, `productos.gramaje_shot` |
| **085** | `085_merma_barra_y_lote.sql` | Amplía los `check` de `movimientos_stock.referencia_tipo` y `motivo`; tabla `lotes_grano` con su índice único parcial; `insumos.dias_frescura_optima`, `insumos.lote_abierto_id`, `insumos.unidad_captura_preferida`; vista `merma_barra_turno` |
| **086** | `086_turno_bote_y_cambio.sql` | `sesiones_caja`: fondo desglosado en tres columnas, `bote_contado_centavos`, `turno`; amplía `movimientos_caja.tipo` con `entrada_cambio`; `check` de cierre sin bote contado; `check` de cierre con pedidos en la fila (F-262) |
| **087** | `087_presencias_y_reparto.sql` | Tabla `presencias_turno` con su índice único parcial; `liquidaciones_propina.reparto_base`. **Depende de la 076 de `restaurante`** (`liquidacion_propina_beneficiarios` y `formula_snapshot`), y eso se declara en la cabecera del archivo |
| **088** | `088_lealtad_sellos.sql` | `lealtad_saldos`, `lealtad_movimientos`, `productos.sellos_otorga`, `orden_lineas.tipo_linea` y `combo_id`, triggers de saldo y de canje sin saldo, RLS de las dos tablas |
| **089** | `089_pedido_anticipado.sql` | Tabla `pedidos_anticipados` con su índice por hora prometida y su RLS |
| **066** | `066_plantillas_semilla.sql` | **D-01**: renombra el valor `operativo` a `cafeteria` en `paquete`, ajusta `organizaciones_paquete_compatible_con_giro`, y **mueve a Café Jacaranda de `restaurante_pro` a `cafeteria`**. Va al final a propósito: es la única que toca datos de producción |

**Sobre la 080, y hay que leerlo dos veces.** Hace tres cosas de naturaleza distinta y conviene
separarlas mentalmente:

1. **Renombrar `operativo` → `cafeteria`** afecta a Abarrotes Don Chuy y a Ferretería La Broca, que
   hoy están en `operativo`. Según D-01 esos dos deben ir a `tienda`, que es otra plantilla y otra
   carpeta. **Esta migración no los mueve**: los deja donde están y el renombre los arrastraría a
   una plantilla que no es la suya. Se coordina con la carpeta `tienda` o se parte en dos
   migraciones. **Queda anotado como pendiente abierto y no se resuelve aquí.**
2. **Ajustar el `check` de compatibilidad** para que `paquete = 'cafeteria'` exija
   `giro = 'cafeteria'`.
3. **Bajar a Café Jacaranda de `restaurante_pro` a `cafeteria`**, que es quitarle tres módulos a un
   cliente que está operando. **Aplicada en la Fase 2.3 (P-04 resuelta) contestada y sin respaldo probado**, y no se
   aplica antes de que exista la tanda 1, por lo dicho en §0.2.

---

## 8 · DEPENDENCIAS EXTERNAS

| Dependencia | Versión | Para qué | Por qué ésa |
|---|---|---|---|
| `jspdf` | ya en uso | PDF del corte | Ya integrada, funciona sin conexión. Se reutiliza sin tocar |
| `html2canvas` | ya en uso | Rasteriza el nodo del corte | Hace que el PDF se vea idéntico a la pantalla |
| `date-fns` + locale `es` | ya en uso | Tiempos relativos de la fila y de los llamados | Ligera, tree-shakeable, locale correcto |
| `recharts` | ya en uso | Las barras de mezcla por canal | Una gráfica más, y de barras, no de dona. Ver abajo |
| **`SpeechSynthesis` del navegador** | nativa | El llamado por voz (F-329) | Ya se usa en `heredado/lib/voiceAlert.js` para el aviso de cocina. **Se reutiliza tal cual**, cambiando sólo el texto: en vez de "nuevo pedido" dice el nombre. Es la dependencia que menos cuesta y más se nota |
| **Segunda pantalla (F-249)** | — | El total y la propina que ve el cliente | Ver abajo |

**Sobre la gráfica.** `restaurante` declaró "una sola gráfica en todo el sistema, y de proporción —
la dona de métodos de pago". Aquí la dona **no va**, y va una de **barras horizontales** para la
mezcla por canal. La razón no es estética: una dona compara partes de un todo y no deja leer
magnitudes; la pregunta de aquí es *"¿cuántos vasos necesito?"*, que es una magnitud. Sigue siendo
**una sola gráfica**.

**La decisión de F-249, que hay que tomar antes de construir.** Tres caminos para la segunda
pantalla:

1. **Monitor secundario de la misma terminal**, con una ruta propia (`/cliente`) abierta en la
   segunda salida de video. Es lo más barato: un monitor de 10" cuesta menos que dos meses de
   software, no requiere instalar nada, y la sincronía es local vía `BroadcastChannel`. **Pero
   exige que la terminal sea una PC con dos salidas**, lo que descarta las tablets.
2. **Tablet o teléfono independiente** apuntando a `/cliente` con un token de terminal, sincronizado
   por el mismo canal de tiempo real que ya usa la pantalla de cocina. Funciona con cualquier
   hardware y depende de la red del local, que en una cafetería mexicana sí es un detalle menor —
   es una red de una sola planta con tres dispositivos.
3. **Girar la tablet hacia el cliente**, que es lo que hacen hoy Square y Clip. Cero costo, cero
   configuración, y el barista tiene que soltar y girar 180 veces al día.

**Recomendación: (2), con (3) como respaldo y (1) como opción cuando el negocio ya tiene PC.** La
tablet independiente es la que funciona con el hardware que la mayoría ya tiene, y la que permite
que la pantalla del cliente y la de recogida sean el mismo dispositivo en negocios chicos.

**Integraciones con terceros que NO entran en este modelo:** PAC de facturación (llega con CFDI,
transversal a los 78), pasarela de pago (sólo cuando entre F-330 con pago anticipado), mapas (no
aplica), Rappi/DiDi/Uber Eats (apagada a propósito: 6.22% de las órdenes). WhatsApp entra sólo
como tercer medio de llamado (`llamados_pedido.medio = 'whatsapp'`) para el pedido anticipado que
se atrasó, y no antes.

---

## 9 · QUÉ SE REUTILIZA TAL CUAL

Lo que **no se toca** porque ya funciona. Rutas reales del monorepo.

| Pieza | Ruta | Se reutiliza para |
|---|---|---|
| Envoltorio de comandos | `packages/app/src/definicion.ts` | Los diecinueve comandos nuevos |
| Mapa del puente | `packages/app/src/puente/mapa.ts` | Las nueve entidades nuevas se declaran aquí |
| Roles del puente | `packages/app/src/puente/roles.ts` | `rolesLectura` de lo nuevo |
| **Desglose exacto de propina** | `apps/web/heredado/utils/tipsUtils.js` | **INTACTO.** Es la pieza mejor resuelta del sistema y aquí se usa sin una sola línea de cambio |
| Propinas: folio, rango, liquidadas | `packages/app/src/propinas/folio.ts`, `rango.ts`, `liquidadas.ts` | F-248 se apoya en las tres. `liquidadas.ts` se extiende con `reparto_base`, no se reescribe |
| Comandas y preparación | `packages/app/src/restaurante/comandas.ts`, `preparacion-escrituras.ts` | **F-328 extiende estos módulos.** No se crea un módulo paralelo de "barra" |
| Ruteo a estación | `apps/web/heredado/utils/preparacionEstacionUtils.js` | La barra es una estación; el ruteo es el mismo |
| Propagación de alergias | `packages/app/src/restaurante/propagacion.ts` | Íntegra. La alergia viaja del pedido a la tarjeta de barra igual que viajaba de la mesa a la comanda |
| Aviso por voz | `apps/web/heredado/lib/voiceAlert.js` | F-329 cambia el texto y nada más |
| Cobro y pagos | `packages/app/src/venta/pagos.ts`, `escala.ts` | `cobrarVenta` se extiende; el cálculo de pagos no se toca |
| Caja y turno | `packages/app/src/caja/turno.ts` | Se extiende con el bote y el fondo desglosado |
| Inventario | `packages/app/src/inventario/index.ts` | F-156, F-261 y el canje escriben por aquí |
| Conversión de unidades | `apps/web/heredado/utils/unitConversions.js` | Se le añade la onza fluida. Una línea |
| Centavos | `packages/domain/src/dinero/centavos.ts` | Todo el dinero nuevo |
| Primitivas de interfaz | `packages/ui/src/primitivas/` | Las pantallas nuevas no traen componentes propios |
| Tokens de diseño | `packages/ui/src/tokens/` | Colores de estado, espaciado, radios |
| Documento del corte | `apps/web/heredado/components/tickets/CorteTicket.jsx` | **Gana siete secciones y pierde una.** Ver abajo |
| Tarjeta de pedido de cocina | `apps/web/heredado/components/cocina/CocinaPedidoCardPremium.jsx` | La tarjeta de la fila de barra parte de ésta: cambia la jerarquía —el nombre por encima de todo— y los botones |
| Descarga de PDF | `apps/web/heredado/lib/pdfDownload.js` | Sin cambios |
| Escáner de código de barras | `apps/web/heredado/components/barcode/` | **Se conserva encendido**, al revés que en `restaurante`, que lo excluye a propósito. El grano en bolsa y la botella de agua sí traen código |

**Lo que hay que tocar del heredado, y no es poco:**

| Archivo | Qué cambia |
|---|---|
| `apps/web/heredado/pages/POS.jsx` | Nombre y canal antes del carrito, el total dentro del botón, el diálogo de opciones, el aviso de cambio bajo |
| `apps/web/heredado/components/pos/PaymentModal.jsx` | El bloque de propina **sale** de aquí y se va a la segunda pantalla |
| `apps/web/heredado/pages/Cocina.jsx` | Se deriva en la pantalla de barra: dos columnas, nombre grande, botón de dos verbos, zona de deshacer |
| `apps/web/heredado/components/tickets/CorteTicket.jsx` | Siete secciones nuevas (canal, bote y reparto, merma de barra, consumo interno, sellos, comisión, no recogidos) y **una que se apaga**: la tabla de propinas por mesero |
| `apps/web/heredado/pages/Inventario.jsx` | Familias, días que alcanza, conteo de leche, lote de grano |
| `apps/web/heredado/pages/Recetas.jsx` | Tabla de variantes, líneas por canal, `merma_bp` oculto, umbrales de semáforo 65/50 |
| `apps/web/heredado/components/common/Sidebar.jsx` | `ORDER_CAFETERIA` nuevo, con `/barra` y `/clientes` |
| `apps/web/heredado/lib/packageConfig.js` | El renombre de D-01 y los módulos nuevos (`fila_barra`, `lealtad`, `opciones_bebida`) |

**Componentes nuevos**, en `packages/ui` o en la carpeta heredada según dónde acabe la migración de
pantallas:

```
OpcionesBebidaDialog · FilaBarraTablero · TarjetaPedidoBarra ·
PantallaRecogida · PantallaCliente · ConteoLecheDialog ·
CalibracionButton · MermaBarraDialog · RepartoBotePanel ·
SellosBadge · IdentificarClienteDialog · EntradaCambioDialog
```

**Nada de esto se toca mientras Codex siga en la Fase 1.**
