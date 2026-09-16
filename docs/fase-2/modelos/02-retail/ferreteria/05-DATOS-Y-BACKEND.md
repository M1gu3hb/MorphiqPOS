# 05 · DATOS Y BACKEND · Ferretería y tlapalería

Todo lo que sigue se escribe **como si ya estuviera dentro del monorepo** (D-05): mismos contratos
—`comando()`, `definirComando`, el puente con `rolesLectura` obligatorio, el ámbito de sesión, bigint
de centavos—, misma estructura de carpetas. **Las migraciones se escriben numeradas y listas, y no se
aplican.**

Rangos de migración: `restaurante` **060–069**, `abarrotes` **070–082**. Éste toma **083–095**.

**Dos reglas que atraviesan este archivo.**

1. Ningún comando declara `rol`, `organizacion_id`, `sucursal_id`, `empleo_id`, `identidad_id` ni
   `terminal_id` en su entrada. Un comando que lo haga **no compila**, y es a propósito.
2. **Este modelo se construye ENCIMA de `abarrotes`, no al lado.** `producto_presentaciones`,
   `zonas_anaquel`, `conteos`, `conteo_lineas`, `abonos_fiado`, `redondeos`, las vistas de existencia y
   cartera, y los doce `check` de integridad **ya están definidos allá y aquí no se redefinen**. Lo que
   sigue son **las tablas nuevas y las extensiones**. Si algo de aquí contradice a `abarrotes`, es un
   error de esta carpeta.

---

## 1 · ENTIDADES NUEVAS

### 1.1 · `lineas` — F-021 jerárquica

La categoría plana de `abarrotes` no alcanza con 6,000 claves. Tres niveles, y el nivel define **qué
atributos existen**.

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `padre_id` | uuid | fk → `lineas`, nullable. **Máximo tres niveles** |
| `nivel` | smallint | `check in (1,2,3)` |
| `nombre` | text | not null |
| `orden` | int | Para presentar en el orden del mostrador, no alfabético |
| `esquema_atributos` | jsonb | **La definición de qué campos tiene este tipo de material** |
| `margen_objetivo_pct` | numeric(5,2) | 15 en eléctrico, 41 en fijación. Alimenta el corte §8 |
| `tope_descuento_pct` | numeric(5,2) | El tope por línea de `02-DINERO-Y-CAJA.md` §3 |
| `umbral_dias_dormido` | int | 90 en rotación media, 180 en baja |

**`esquema_atributos` es el corazón de F-059** y se declara así:

```json
[
  {"clave":"diametro","etiqueta":"Diámetro","tipo":"medida","unidad":"longitud","requerido":true},
  {"clave":"largo","etiqueta":"Largo","tipo":"medida","unidad":"longitud","requerido":true},
  {"clave":"rosca","etiqueta":"Rosca","tipo":"lista","opciones":["tirafondo","milimetrica","NPT"]},
  {"clave":"acabado","etiqueta":"Acabado","tipo":"lista","opciones":["galvanizado","negro","inox"]}
]
```

**Por qué `jsonb` y no una tabla de definiciones.** Porque el esquema se lee entero cada vez que se abre
la ficha de un material y nunca se consulta por partes. Una tabla normalizada obligaría a un `join` por
cada campo y no compraría nada: **no hay ninguna consulta que pregunte "qué líneas tienen el atributo
rosca"**. La búsqueda no va contra el esquema, va contra los valores (§1.2).

### 1.2 · `producto_atributos` — F-059

Una fila por atributo con valor. **Aquí sí normalizado**, porque es lo que se indexa y se filtra.

| Campo | Tipo | Restricción |
|---|---|---|
| `producto_id` | uuid | fk, on delete cascade |
| `clave` | text | not null. Debe existir en el `esquema_atributos` de su línea |
| `valor_texto` | text | Para atributos de lista: `'galvanizado'` |
| `valor_normalizado` | bigint | **Para atributos de medida: en MICRÓMETROS** |
| `valor_original` | text | Lo que tecleó la persona: `'1/4"'`. **Se conserva tal cual** |

**Por qué micrómetros y no milímetros.** Porque `1/4"` son 6.35 mm exactos y `1/8"` son 3.175 mm: con
milímetros enteros se pierde, y con decimales vuelven los flotantes que esta fase prohíbe. En
micrómetros, `1/4"` = **6,350** y `1/8"` = **3,175**, ambos enteros. Es la misma decisión que los
centavos y los gramos, llevada a la longitud de precisión.

**Por qué se conserva `valor_original`.** Porque el mostradorista busca `1/4` y espera ver `1/4"`, no
`6.35 mm`. Guardar sólo el normalizado obligaría a reconstruir la fracción para presentarla, y la
reconstrucción de fracciones desde decimales es ambigua: 6.35 mm podría presentarse como `1/4"` o como
`6.35 mm` y **la correcta es la que se capturó**.

**Índices:** `(organizacion_id, clave, valor_normalizado)` y `(organizacion_id, clave, valor_texto)`.
Son los dos que sostienen la búsqueda por medida.

### 1.3 · `equivalencias` — F-060

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk |
| `equivalente_id` | uuid | fk. **`check (producto_id <> equivalente_id)`** |
| `tipo` | text | `check in ('sustituto','complemento')` — "le sirve" contra "va con" |
| `nota` | text | *"si no importa el acabado"* |
| `bidireccional` | boolean | default true. Un sustituto casi siempre lo es en los dos sentidos |
| `declarado_por` | uuid | fk → empleos. **Quién lo supo** |
| `declarado_en` | timestamptz | |

**`declarado_por` no es auditoría: es producto.** Cuando Chava se jubile, Beto va a poder ver que 340
equivalencias las declaró él, y eso es exactamente el conocimiento que se quería retener. También
sirve para lo incómodo: si alguien está declarando equivalencias malas, se sabe quién.

**Restricción:** `unique (producto_id, equivalente_id, tipo)`.

### 1.4 · `ubicaciones` — F-152

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `almacen_id` | uuid | fk → `almacenes` |
| `codigo` | text | not null. `'B-14'`, `'R-02'`, `'BOD-3'`, `'V-04'` |
| `descripcion` | text | *"Gaveta B-14, rack 2, pasillo de tornillería"* |
| `zona_id` | uuid | fk → `zonas_anaquel`, nullable. **Para el conteo** |
| `orden_recorrido` | int | Para surtir y para contar en el orden físico |

**Por qué `ubicaciones` y `zonas_anaquel` son dos tablas y no una.** Porque tienen distinto propósito,
distinto usuario y distinta granularidad, exactamente como se argumentó en `01-FUNCIONES.md` §6. La
ubicación es **dónde está esta pieza** y se usa sesenta veces al día en la venta; la zona es **qué se
cuenta junto** y se usa una vez al día. Una zona agrupa varias ubicaciones. Fusionarlas obligaría a que
la unidad de conteo fuera la gaveta, y contar gaveta por gaveta con 400 gavetas es una vuelta de dos
años.

`productos` gana `ubicacion_id`; una clave está en **una** ubicación por almacén.

### 1.5 · `piezas_abiertas` — F-145, F-150

El rollo abierto y el tramo cortado. **Sólo lo abierto tiene identidad** (`03-INVENTARIO.md` §3.3).

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk |
| `almacen_id` | uuid | fk |
| `folio` | text | Corto y legible: `'R-114'`. **Se escribe en la etiqueta física** |
| `medida_restante_base` | bigint | **> 0**, en unidad base (micrómetros o milímetros) |
| `estado` | text | `check in ('abierta','retazo','cerrada')` |
| `precio_remate_centavos` | bigint | nullable. Sólo cuando `estado='retazo'` |
| `abierta_en` | timestamptz | Para la alerta de pieza vieja |
| `cerrada_en` | timestamptz | nullable |
| `movimiento_cierre_id` | uuid | fk → `movimientos_stock`, nullable |

**La regla que hay que entender bien:** `piezas_abiertas` **no es el inventario**. El inventario sigue
siendo `movimientos_stock` en unidad base, sin excepción (regla de hierro heredada). La pieza abierta es
**una descomposición informativa** de una parte de esa existencia: dice *cómo está repartido* lo que ya
está contado. La suma de `medida_restante_base` de las piezas abiertas **debe ser menor o igual** a la
existencia total, y no está obligada a ser igual —los rollos cerrados son el resto.

**Por qué no se obliga a cuadrar exactamente.** Por la misma razón por la que `caducidades` en
`abarrotes` no cuadra contra la existencia: obligarlo convertiría cada venta en una asignación de
pieza, y eso es trazabilidad completa. Aquí se usa un `check` suave —una vista que señala cuando la
suma de abiertos **supera** la existencia, que sí es un error real— y se deja el resto informativo.

### 1.6 · `cortes_material` — F-145

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `orden_linea_id` | uuid | fk, not null. **Un corte pertenece a una partida** |
| `producto_id` | uuid | fk |
| `pieza_abierta_id` | uuid | fk, nullable — null si se abrió una cerrada |
| `medida_entregada_base` | bigint | **> 0** |
| `merma_base` | bigint | **≥ 0** |
| `movimiento_venta_id` | uuid | fk, **not null** |
| `movimiento_merma_id` | uuid | fk, nullable — null sólo si `merma_base = 0` |
| `pieza_resultante_id` | uuid | fk → `piezas_abiertas`, nullable |

**`check (merma_base = 0 or movimiento_merma_id is not null)`** — si se declaró merma, tiene que existir
su movimiento. Van juntas o no van (`03-INVENTARIO.md` §3.2).

### 1.7 · `obras` — F-639

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `cliente_id` | uuid | fk → `clientes`, not null |
| `nombre` | text | not null. `'Las Torres'` |
| `direccion` | text | nullable |
| `estado` | text | `check in ('activa','cerrada')` |
| `limite_centavos` | bigint | nullable. **Sub-límite dentro del límite del cliente** |
| `abierta_en` / `cerrada_en` | timestamptz | |

**La obra se cierra, nunca se borra.** Las remisiones que cuelgan de ella tienen que poder consultarse
años después. `on delete restrict` sobre `cliente_id`.

### 1.8 · `autorizados_cuenta` — F-638 ★

**La tabla que sostiene el dolor 1.**

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `cliente_id` | uuid | fk, not null |
| `obra_id` | uuid | fk, nullable — **null significa "todas las obras"** |
| `nombre` | text | not null |
| `telefono` | text | nullable |
| `identificacion` | text | nullable. Lo que enseñó al darse de alta |
| `foto_url` | text | nullable |
| `tope_por_salida_centavos` | bigint | nullable — null es sin tope |
| `activo` | boolean | default true |
| `dado_de_baja_en` | timestamptz | nullable |
| `alta_por` | uuid | fk → empleos. **Quién lo autorizó, y con qué respaldo** |

**Se da de baja, nunca se borra.** Las remisiones que firmó siguen siendo válidas y auditables; borrarlo
rompería la trazabilidad justo del caso que importa, que es la cuenta impugnada.

### 1.9 · `remisiones` — F-606 ★

El documento más importante del día. **No es una tabla de ventas paralela**: es el documento de entrega
que cuelga de una orden.

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `orden_id` | uuid | fk, not null, **unique** — una orden, una remisión |
| `folio` | text | Consecutivo propio por sucursal |
| `cliente_id` | uuid | fk, not null |
| `obra_id` | uuid | fk, nullable |
| `autorizado_id` | uuid | fk → `autorizados_cuenta`, nullable |
| `nombre_firmante` | text | **not null.** Si no estaba autorizado, se escribe a mano |
| `autorizado_estaba_en_lista` | boolean | not null. **El dato que importa cuando se impugna** |
| `firma_url` | text | nullable — firma en pantalla o foto del papel |
| `saldo_documento_centavos` | bigint | Lo que queda por pagar de esta remisión |
| `entregada_en` | timestamptz | not null |
| `entregada_por` | uuid | fk → empleos |

### 1.10 · `pagos_credito` y `aplicaciones_pago` — F-614 en variante

`abarrotes` tiene `abonos_fiado` con `aplicaciones` en `jsonb`, porque allá se aplica al saldo más viejo
y nadie consulta el detalle. **Aquí el detalle se consulta y se discute**, así que la aplicación es una
tabla.

`pagos_credito`

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `cliente_id` | uuid | fk, not null |
| `monto_centavos` | bigint | **> 0** |
| `metodo` | text | `check in ('efectivo','tarjeta','transferencia','cheque')` |
| `sesion_caja_id` | uuid | fk, **nullable** |
| `movimiento_caja_id` | uuid | fk, **nullable** |
| `referencia_bancaria` | text | nullable |
| `confirmado` | boolean | default false para transferencia |
| `recibido_en` | timestamptz | **La fecha real, que puede no ser la de captura** |

**`sesion_caja_id` es nullable aquí y en `abarrotes` es `not null`. Es la diferencia más delicada de
este archivo y hay que justificarla.** Allá la regla existe porque un abono sin movimiento de caja es
dinero que entró y no está en ningún corte. Aquí **el pago por transferencia entra al banco un domingo
a las nueve de la noche**, sin caja abierta y sin nadie en el mostrador
(`02-DINERO-Y-CAJA.md` §8.3). Obligarlo a una sesión produciría una de dos cosas malas: se registra
tarde —y el saldo está mal el lunes por la mañana, cuando el cliente llega por más material— o se
registra en la caja equivocada y el arqueo dice que sobran $14,000.

**La regla se reemplaza por otra igual de dura, no se debilita:**

```
check ( (metodo = 'efectivo' and movimiento_caja_id is not null)
     or (metodo <> 'efectivo') )
```

**Todo pago en efectivo sigue exigiendo su movimiento de caja.** Lo que se permite es que el dinero que
nunca tocó el cajón no finja haberlo tocado.

`aplicaciones_pago`

| Campo | Tipo | Restricción |
|---|---|---|
| `pago_id` | uuid | fk, on delete cascade |
| `remision_id` | uuid | fk, nullable |
| `factura_id` | uuid | fk, nullable |
| `monto_centavos` | bigint | **> 0** |

`check (remision_id is not null or factura_id is not null)` — una aplicación apunta a algo.
Y un trigger: **la suma de las aplicaciones de un pago no puede exceder su monto.**

### 1.11 · `servicios_mostrador` — F-258

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `orden_linea_id` | uuid | fk, not null |
| `tipo` | text | `check in ('copia_llave','entonado','corte_vidrio','corte_madera','cuerda_tubo','otro')` |
| `mano_obra_centavos` | bigint | **≥ 0** |
| `parametros` | jsonb | Medidas del corte, fórmula del color, tipo de llave |
| `consumos` | jsonb | `[{producto_id, cantidad_base, movimiento_stock_id}]` |

**`consumos` lleva el `movimiento_stock_id` dentro** porque cada consumo escribió su propio movimiento
en el ledger. El `jsonb` es el índice, no la fuente: **la fuente sigue siendo el ledger**, como siempre.

### 1.12 · `garantias_proveedor` — F-127 en variante

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk |
| `proveedor_id` | uuid | fk |
| `cantidad` | int | **> 0** |
| `serie` | text | nullable. Sólo herramienta eléctrica |
| `orden_origen_id` | uuid | fk, nullable. La venta al cliente que falló |
| `estado` | text | `check in ('enviada','repuesta','rechazada','perdida')` |
| `enviada_en` / `resuelta_en` | timestamptz | |
| `movimiento_salida_id` / `movimiento_retorno_id` | uuid | fk |
| `costo_detenido_centavos` | bigint | A costo promedio al momento del envío |

### 1.13 · `rentas` — F-119 en variante, por perilla

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `producto_id` | uuid | fk |
| `cliente_id` | uuid | fk, nullable |
| `nombre_quien_lleva` | text | not null |
| `identificacion_retenida` | text | nullable |
| `deposito_centavos` | bigint | **≥ 0**. Entra al cajón, **no es venta** |
| `tarifa_dia_centavos` | bigint | **> 0** |
| `salida_en` / `retorno_esperado_en` / `retorno_real_en` | timestamptz | |
| `estado_salida` / `estado_retorno` | jsonb | Fotos y notas. F-141 |
| `estado` | text | `check in ('fuera','devuelta','danada','perdida')` |
| `movimiento_deposito_id` | uuid | fk, **not null** |

**El depósito reutiliza el mecanismo de `depositos_envase` de `abarrotes` (F-256)** en comportamiento
de caja: entra dinero que no es venta y hay que devolverlo. **Se declara tabla propia** porque los
campos de estado, fotos y fechas no tienen nada que ver con un casco de cerveza, y meterlos en
`depositos_envase` lo convertiría en una tabla de dos cosas distintas.

### 1.14 · `notas_mostrador` — el documento intermedio del modo B

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `orden_id` | uuid | fk, unique |
| `folio_corto` | int | El número que se grita: `1187` |
| `mostradorista_id` | uuid | fk → empleos, not null |
| `vence_en` | timestamptz | not null. Por omisión +30 min |
| `estado` | text | `check in ('abierta','cobrada','entregada','vencida','cancelada')` |

**Una nota de mostrador no toca stock ni caja.** Aparta de forma blanda y visible, y **se libera sola**.
Es la prevención del descuadre 5 (`02-DINERO-Y-CAJA.md` §10).

### 1.15 · `listas_trabajo` y `listas_trabajo_lineas` — F-153

| Campo | Tipo | Restricción |
|---|---|---|
| `id` / `nombre` | uuid / text | `'Instalar tinaco'`, `'Cambiar contacto'` |
| `linea_id` | uuid | fk → `lineas`, nullable. Para agruparlas |
| `veces_usada` | int | Para ordenar por uso real, no alfabético |
| `creada_por` | uuid | fk → empleos |

`listas_trabajo_lineas`: `lista_id`, `producto_id`, `cantidad_sugerida`, `opcional boolean`, `orden`.

**`opcional` importa:** el teflón va siempre, la llave de paso sólo a veces. Al volcar, lo opcional entra
desmarcado.

---

## 2 · ENTIDADES EXISTENTES QUE HAY QUE EXTENDER

| Tabla | Campo nuevo | Tipo | Por qué |
|---|---|---|---|
| `productos` | `linea_id` | uuid fk | §1.1. Sustituye a `categoria_id` en esta plantilla |
| `productos` | `ubicacion_id` | uuid fk | F-152 |
| `productos` | `es_alta_rotacion` | boolean | Sólo estas ~200 disparan alerta de mínimo |
| `productos` | `peso_por_pieza_mg` | bigint | **F-151.** En miligramos, enteros |
| `productos` | `tolerancia_peso_pct` | numeric(5,2) | default 8.0 |
| `productos` | `peso_calibrado_en` | timestamptz | Última recalibración |
| `productos` | `merma_corte_default_base` | bigint | Lo que se propone al cortar |
| `productos` | `umbral_retazo_base` | bigint | Debajo de esto, el sobrante es retazo |
| `productos` | `es_continuo` | boolean | Enciende F-145 para esta clave |
| `productos` | `tipo_corte` | text | `check in ('lineal','plano','tubular',null)` |
| `productos` | `clave_unidad_sat` | text | H87, MTR, KGM, LTR, KT. **Por presentación, ver abajo** |
| `productos` | `requiere_serie` | boolean | Sólo herramienta eléctrica |
| `producto_presentaciones` | `factor_por_peso` | boolean | **F-151.** El factor se deriva del peso |
| `producto_presentaciones` | `clave_unidad_sat` | text | **La clave sale de aquí, no del producto** (`02` §2.4) |
| `clientes` | `lista_precio_id` | uuid fk | público · contratista · obra · empleado |
| `clientes` | `dias_plazo` | int | 15, 30 |
| `clientes` | `bloqueado_por_mora` | boolean | Y quién lo levantó, en bitácora |
| `clientes` | `tipo` | text | `'particular','contratista','plomero','electricista'` |
| `proveedores` | `dias_credito` | int | 30, 60 |
| `proveedores` | `monto_minimo_pedido_centavos` | bigint | Dispara "ya juntaste el mínimo" |
| `proveedores` | `dias_entrega` | int | |
| `proveedores` | `acepta_garantias` | boolean | |
| `ordenes` | `obra_id` | uuid fk | nullable |
| `ordenes` | `autorizado_id` | uuid fk | nullable |
| `ordenes` | `mostradorista_id` | uuid fk | **Quién despachó, distinto de quién cobró** |
| `ordenes` | `lista_precio_id` | uuid fk | Sellada al vender, no recalculada |
| `orden_lineas` | `corte_material_id` | uuid fk | nullable |
| `orden_lineas` | `servicio_id` | uuid fk | nullable |
| `orden_lineas` | `tope_descuento_aplicado_pct` | numeric | Sellado, para auditar |
| `movimientos_stock` | `tipo` | enum | **Añadir** `garantia_proveedor`, `garantia_retorno`, `renta_salida`, `renta_retorno`, `consumo_servicio` |
| `movimientos_stock` | `motivo` | text | **Añadir** `corte` y `retazo` a los motivos de merma |
| `almacenes` | `tipo` | text | `'mostrador'`, `'bodega'` |
| `cotizaciones` (de A5) | `motivo_perdida` | text | El único dato de mercado del negocio |

**Vistas nuevas:**

```
busqueda_material          producto + atributos + existencia + ubicación + precio de lista,
                           materializada y refrescada al cambiar catálogo o existencia.
                           ES LA VISTA QUE SOSTIENE LA PANTALLA 1.
existencia_continua        existencia total + desglose de piezas abiertas por producto
dinero_dormido             producto, costo, días sin venta, valor a costo, por línea y proveedor
rotacion_por_linea         venta 90d, inventario promedio, vueltas al año, días de inventario
cartera_por_obra           saldo, antigüedad, último pago, por cliente Y por obra
salio_sin_cobrar           remisiones del día, importe, cliente, obra, firmante, si estaba autorizado
merma_corte_periodo        merma de corte por producto y por periodo, contra su umbral
venta_por_mostradorista    venta, ticket promedio, líneas por venta, margen, por persona
garantias_abiertas         lo que está fuera, desde cuándo, cuánto costo detenido
piezas_abiertas_viejas     rollos y tramos abiertos con más de N días
```

**`busqueda_material` merece una nota.** Es materializada porque se consulta en cada tecleo y se
refresca en dos casos: al cambiar el catálogo (poco frecuente) y al cambiar la existencia (constante).
**Refrescarla entera en cada venta sería inaceptable**, así que se refresca **por fila** con trigger
sobre `movimientos_stock`, no con `refresh materialized view`. Es la única vista del sistema con ese
tratamiento y está justificada por la frecuencia de lectura.

---

## 3 · REGLAS DE INTEGRIDAD QUE GARANTIZA LA BASE

**Los doce `check` de `abarrotes` §3 siguen vigentes y no se repiten.** Éstos son los diez propios, y
cada uno existe porque su violación produce un descuadre documentado en `02-DINERO-Y-CAJA.md` §10 o un
error de `03-INVENTARIO.md` §9.

1. **Un corte con merma declarada tiene su movimiento de merma.**
   `check (merma_base = 0 or movimiento_merma_id is not null)`. Es lo que impide que la merma de corte
   se "declare" sin salir del inventario.
2. **La medida restante de una pieza abierta es positiva.**
   `check (medida_restante_base > 0)`. Una pieza con cero se cierra, no se queda en cero.
3. **La suma de piezas abiertas de un producto no excede su existencia.**
   Trigger sobre `piezas_abiertas` contra la vista de existencia. **Menor o igual, nunca mayor.**
4. **Una remisión siempre tiene nombre de firmante.**
   `nombre_firmante not null`. Aunque no estuviera autorizado, aunque sea un garabato: **una remisión
   sin nombre es una cuenta impugnable**, y la base no la deja existir.
5. **`autorizado_estaba_en_lista` se calcula en el servidor, no se recibe.**
   Se sella en la transacción comparando contra `autorizados_cuenta` activos en ese momento. Si se
   recibiera del cliente, el dato que importa cuando hay pleito sería el que alguien quiso poner.
6. **Un pago en efectivo exige su movimiento de caja.**
   `check ((metodo='efectivo' and movimiento_caja_id is not null) or metodo<>'efectivo')`. Ver §1.10.
7. **La suma de aplicaciones de un pago no excede su monto.** Trigger sobre `aplicaciones_pago`.
8. **`clientes.saldo_pendiente_centavos` sólo lo mueven tres caminos**: la venta a crédito, el pago y la
   nota de crédito. Trigger sobre las tres tablas, **nunca `update` desde la aplicación**. Es la regla 9
   de `abarrotes` extendida con el tercer camino.
9. **El saldo de una obra no puede ser negativo.** `check` sobre la vista de cartera por obra. Un
   sobrante devuelto por más de lo que se llevó es un error de captura, no un crédito a favor.
10. **Una obra cerrada no admite remisiones nuevas.** `check` por estado + trigger. Cerrar una obra es
    un acto contable y tiene que significar algo.

**Y la regla que NO se pone y hay que decir por qué.** No se obliga a que la suma de
`piezas_abiertas.medida_restante_base` **sea igual** a la existencia. Sería tentador y sería un error:
obligaría a que cada venta asignara una pieza concreta, lo que convierte el inventario de material
continuo en trazabilidad por lote — y eso es V4, que este modelo descartó explícitamente. Se vigila el
exceso (regla 3), que sí es un error, y se deja informativo el resto.

---

## 4 · COMANDOS

Todos pasan por `comando()`: rol → paquete → validación → idempotencia → transacción → auditoría.
`paquetes: ['ferreteria', 'materiales', ...]` según corresponda tras D-01.

| Comando | Entrada | Roles | Escribe | Idem. |
|---|---|---|---|---|
| `catalogo.crear_linea` | padre_id, nombre, esquema_atributos, margen, topes | dueño | `lineas` | Sí |
| `catalogo.definir_atributos` | producto_id, atributos[] | dueño, encargado | `producto_atributos` | Sí |
| `catalogo.declarar_equivalencia` | producto_id, equivalente_id, tipo, nota | **mostradorista**, encargado, dueño | `equivalencias` | Sí |
| `catalogo.subir_foto_mostrador` | producto_id, archivo | **mostradorista**, encargado | `productos.imagen` | Sí |
| `catalogo.asignar_ubicacion` | producto_id, ubicacion_id | encargado, almacén | `productos` | Sí |
| `catalogo.calibrar_peso` | producto_id, piezas_contadas, peso_mg | encargado, dueño | `productos.peso_por_pieza_mg` | Sí |
| `catalogo.alta_rapida_ferreteria` | nombre, linea_id, **medida**, **ubicacion**, precio | mostradorista, encargado, dueño | `productos` + presentación base + atributos | **Sí, por nombre+medida** |
| `catalogo.imprimir_etiquetas` | filtro | encargado, dueño | **lectura** → PDF | — |
| `inventario.cortar_material` | producto_id, pieza_abierta_id, medida, merma, destino_sobrante | mostradorista | `cortes_material` + **2 movimientos** + `piezas_abiertas` | **Sí** |
| `inventario.cerrar_pieza_abierta` | pieza_id, motivo | encargado, dueño | movimiento de merma + cierre | Sí |
| `inventario.marcar_retazo` | pieza_id, precio_remate | encargado, dueño | `piezas_abiertas` | Sí |
| `inventario.enviar_garantia` | producto_id, cantidad, proveedor, serie, orden_origen | encargado, dueño | `garantias_proveedor` + movimiento | Sí |
| `inventario.resolver_garantia` | garantia_id, resultado | encargado, dueño | idem + movimiento de retorno | Sí |
| `inventario.capturar_conteo_peso` | conteo_id, producto_id, peso_bruto, tara | encargado, almacén | `conteo_lineas` | Sí, por línea |
| `venta.abrir_nota_mostrador` | — | mostradorista | `notas_mostrador` + orden en borrador | Sí |
| `venta.mandar_a_caja` | orden_id | mostradorista | `notas_mostrador.estado` | Sí |
| `venta.entregar_con_remision` | orden_id, cliente_id, obra_id, autorizado_id, nombre_firmante, firma | mostradorista, encargado | `remisiones` + N movimientos + saldo | **Sí** |
| `venta.volcar_lista_trabajo` | lista_id, orden_id | mostradorista | `orden_lineas` | Sí |
| `venta.cobrar` | — | — | **YA EXISTE**, se extiende: lista de precio, obra, corte, servicio | Sí |
| `venta.devolver` | — | — | **YA EXISTE**, se extiende con **tres destinos** y motivo | Sí |
| `servicio.cobrar_trabajo` | tipo, parámetros, consumos, mano_obra | mostradorista | `servicios_mostrador` + N movimientos | Sí |
| `credito.definir_limite` | cliente_id, limite, dias_plazo | **dueño** | `clientes` | Sí |
| `credito.alta_autorizado` | cliente_id, obra_id, nombre, tope, identificación | **dueño, encargado** | `autorizados_cuenta` | Sí |
| `credito.baja_autorizado` | autorizado_id, motivo | dueño, encargado | idem | Sí |
| `credito.abrir_obra` / `cerrar_obra` | cliente_id, nombre | dueño, encargado | `obras` | Sí |
| `credito.registrar_pago` | cliente_id, monto, metodo, referencia, aplicaciones[] | cajero, encargado, **dueño** | `pagos_credito` + `aplicaciones_pago` + caja si efectivo + saldo | **Sí, por referencia** |
| `credito.confirmar_transferencia` | pago_id | cajero, dueño | `pagos_credito.confirmado` | Sí |
| `credito.autorizar_sobre_limite` | orden_id, pin | **dueño** | bitácora + orden | Sí |
| `credito.levantar_bloqueo` | cliente_id, motivo, pin | **dueño** | `clientes` + bitácora | Sí |
| `credito.declarar_incobrable` | cliente_id, obra_id, monto, motivo | **dueño** | ajuste + bitácora | Sí |
| `cotizacion.crear` / `versionar` / `enviar` | — | encargado, dueño | `cotizaciones` | Sí |
| `cotizacion.convertir` | cotizacion_id, partidas_surtidas[] | encargado, dueño | orden + remisión si aplica | **Sí** |
| `cotizacion.cerrar` | cotizacion_id, resultado, motivo | encargado, dueño | `cotizaciones` | Sí |
| `compras.importar_nota` | proveedor_id, archivo | encargado, dueño | `compras` + líneas + **pendientes de emparejar** | **Sí, por folio** |
| `compras.recibir_nota` | — | — | **YA EXISTE** (de `abarrotes`), se extiende sin canje y con garantías | Sí |
| `renta.entregar` / `recibir` | producto_id, quien_lleva, deposito, tarifa | cajero, encargado | `rentas` + caja + movimiento | Sí |
| `factura.timbrar_agrupado` | cliente_id, obra_id, remisiones[] | cajero, dueño | CFDI + enlace a remisiones | **Sí** |

**Tres comandos que puede ejecutar el mostradorista y merecen justificación**, porque son escrituras que
normalmente se reservan:

- **`catalogo.declarar_equivalencia`** y **`catalogo.subir_foto_mostrador`**. Es una decisión consciente:
  **si hay que pedirle permiso al dueño, no se va a capturar nunca**, y sin capturarse, F-060 y F-061 son
  tablas vacías. Queda en la bitácora con `declarado_por`, y aparecen en el corte como *"equivalencias
  declaradas hoy"* para que Beto las revise. Es exactamente el mismo razonamiento con el que `abarrotes`
  le da el alta rápida al cajero.
- **`inventario.cortar_material`**. Porque cortar **es** vender en este giro. Reservarlo al encargado
  detendría ocho ventas al día.

---

## 5 · ENTRADAS DEL PUENTE

En `packages/app/src/puente/mapa.ts`, con la forma existente. Grupos de roles nuevos:

```ts
const MOSTRADOR   = ['dueno','administrador','gerente','mostradorista','cajero'] as const
const VE_CREDITO  = ['dueno','administrador','gerente','cajero'] as const
const OTORGA_CREDITO = ['dueno','administrador','gerente'] as const
```

| Entidad expuesta | Tabla | `rolesLectura` | Campos descartados |
|---|---|---|---|
| `Linea` | `lineas` | `TODOS_LOS_ROLES` | `margen_objetivo_pct` sólo `VE_MARGENES` |
| `AtributoProducto` | `producto_atributos` | `TODOS_LOS_ROLES` | ninguno |
| `Equivalencia` | `equivalencias` | `TODOS_LOS_ROLES` | ninguno |
| `Ubicacion` | `ubicaciones` | `MOSTRADOR` + almacén | ninguno |
| `PiezaAbierta` | `piezas_abiertas` | `MOSTRADOR` + almacén | `precio_remate` sólo `VE_MARGENES` |
| `CorteMaterial` | `cortes_material` | `INVENTARIO` | ninguno |
| `Obra` | `obras` | `VE_CREDITO` | `limite_centavos` sólo `OTORGA_CREDITO` |
| **`AutorizadoCuenta`** | `autorizados_cuenta` | `MOSTRADOR` | `identificacion` sólo `OTORGA_CREDITO` |
| `Remision` | `remisiones` | `VE_CREDITO` + mostradorista | `firma_url` sólo `OTORGA_CREDITO` |
| `PagoCredito` | `pagos_credito` | `VE_CREDITO` | `referencia_bancaria` sólo `OTORGA_CREDITO` |
| `AplicacionPago` | `aplicaciones_pago` | `VE_CREDITO` | ninguno |
| `ServicioMostrador` | `servicios_mostrador` | `MOSTRADOR` | `consumos` sólo `VE_COSTOS_DE_INSUMO` |
| `GarantiaProveedor` | `garantias_proveedor` | `INVENTARIO` | `costo_detenido` sólo `VE_COSTOS_DE_INSUMO` |
| `Renta` | `rentas` | `MOSTRADOR` | `identificacion_retenida` sólo `OTORGA_CREDITO` |
| `NotaMostrador` | `notas_mostrador` | `MOSTRADOR` | ninguno |
| `ListaTrabajo` | `listas_trabajo` | `TODOS_LOS_ROLES` | ninguno |
| `BusquedaMaterial` | vista | `MOSTRADOR` | **`costo_promedio` NUNCA al mostradorista** |
| `DineroDormido` | vista | `VE_MARGENES` | — |
| `RotacionPorLinea` | vista | `VE_MARGENES` | — |
| `CarteraPorObra` | vista | `VE_CREDITO` | — |
| `SalioSinCobrar` | vista | `VE_CREDITO` | — |
| `MermaCortePeriodo` | vista | `INVENTARIO` | `costo` sólo `VE_COSTOS_DE_INSUMO` |
| `VentaPorMostradorista` | vista | `VE_MARGENES` | — |

**El costo y el margen nunca se exponen al rol mostradorista, en ninguna entidad ni en ninguna vista.**
Es la regla de `VE_COSTOS_DE_INSUMO` de `restaurante`, extendida por `abarrotes` al cajero y aquí al
mostradorista — y aquí importa más, porque el mostradorista **sí puede dar descuento** y conocer el
costo le daría una llave que no necesita. Lo que sí ve es `tope_descuento_pct` de su línea, que es un
límite, no un margen.

**Campos nuevos en entidades ya mapeadas:** `ProductoTerminado` suma `linea_id`, `ubicacion_id`,
`peso_por_pieza_mg`, `es_continuo`, `tipo_corte`, `es_alta_rotacion` y los derivados `atributos`,
`equivalencias` y `piezas_abiertas`; `Venta` suma `obra_id`, `autorizado_id`, `mostradorista_id`,
`lista_precio_id`; `DetalleVenta` suma `corte_material_id` y `servicio_id`; `Cliente` —que **sigue sin
estar en el mapa hoy**, igual que señaló `abarrotes`— suma `lista_precio_id`, `dias_plazo`, `tipo` y los
derivados `obras` y `autorizados`; `Proveedor` suma `dias_credito`, `monto_minimo_pedido_centavos`,
`dias_entrega`, `acepta_garantias`.

---

## 6 · RUTAS DE API

```
apps/web/app/api/catalogo/linea/route.ts
apps/web/app/api/catalogo/atributos/route.ts
apps/web/app/api/catalogo/equivalencia/route.ts
apps/web/app/api/catalogo/foto-mostrador/route.ts
apps/web/app/api/catalogo/ubicacion/route.ts
apps/web/app/api/catalogo/calibrar-peso/route.ts
apps/web/app/api/catalogo/etiquetas/route.ts
apps/web/app/api/buscar/material/route.ts              ← la ruta más caliente del sistema
apps/web/app/api/inventario/cortar/route.ts
apps/web/app/api/inventario/pieza-abierta/route.ts
apps/web/app/api/inventario/garantia/route.ts
apps/web/app/api/inventario/conteo/peso/route.ts
apps/web/app/api/venta/nota-mostrador/route.ts
apps/web/app/api/venta/remision/route.ts
apps/web/app/api/venta/lista-trabajo/route.ts
apps/web/app/api/servicio/trabajo/route.ts
apps/web/app/api/credito/limite/route.ts
apps/web/app/api/credito/autorizado/route.ts
apps/web/app/api/credito/obra/route.ts
apps/web/app/api/credito/pago/route.ts
apps/web/app/api/credito/confirmar-transferencia/route.ts
apps/web/app/api/credito/autorizar/route.ts
apps/web/app/api/cotizacion/route.ts
apps/web/app/api/cotizacion/[id]/convertir/route.ts
apps/web/app/api/compras/importar-nota/route.ts
apps/web/app/api/renta/route.ts
apps/web/app/api/factura/agrupado/route.ts
```

**`/api/buscar/material` no es una ruta de lectura normal.** Se llama en cada tecleo. El índice vive en
memoria del cliente (`04-INTERFAZ.md` §4.3) y esta ruta sirve para **hidratarlo al abrir sesión** y para
los casos que el índice no cubre —un catálogo de 50,000 claves en una ferretería grande—. Se cachea con
`ETag` sobre la versión del catálogo, y se pagina. **Nunca es el camino del tecleo normal**, o el
buscador no baja de 100 ms.

---

## 7 · MIGRACIONES · escritas, no aplicadas

```
packages/data/src/migraciones/sql/
├── 110_lineas_y_atributos.sql
│     lineas (con esquema_atributos jsonb), producto_atributos
│     con sus dos índices, productos.linea_id
│     + backfill: cada categoría existente se vuelve una línea de nivel 1
├── 111_ubicaciones.sql
│     ubicaciones, productos.ubicacion_id, enlace opcional a zonas_anaquel
├── 112_equivalencias.sql
├── 113_material_continuo.sql
│     productos.es_continuo, tipo_corte, merma_corte_default_base,
│     umbral_retazo_base
│     piezas_abiertas, cortes_material, sus tres check
│     + ALTER del check de movimientos_stock: motivos `corte` y `retazo`
├── 114_doble_unidad_peso.sql
│     productos.peso_por_pieza_mg, tolerancia_peso_pct, peso_calibrado_en
│     producto_presentaciones.factor_por_peso
├── 115_credito_ferreteria.sql
│     obras, autorizados_cuenta, remisiones, pagos_credito,
│     aplicaciones_pago, clientes.lista_precio_id / dias_plazo /
│     bloqueado_por_mora / tipo, triggers de saldo con el TERCER camino
│     ⚠ La más delicada después de la 070 de abarrotes: convive con
│       abonos_fiado, que NO se borra — `abarrotes` la sigue usando.
├── 116_notas_mostrador.sql
│     notas_mostrador, ordenes.mostradorista_id, almacenes.tipo
├── 117_servicios_mostrador.sql
│     servicios_mostrador, orden_lineas.servicio_id
│     + ALTER del check de movimientos_stock: consumo_servicio
├── 118_garantias_y_rentas.sql
│     garantias_proveedor, rentas
│     + ALTER del check: garantia_proveedor, garantia_retorno,
│       renta_salida, renta_retorno
├── 119_listas_trabajo.sql
├── 120_proveedores_ferreteria.sql
│     dias_credito, monto_minimo_pedido_centavos, dias_entrega,
│     acepta_garantias
├── 121_vistas_ferreteria.sql
│     busqueda_material (materializada, con trigger de refresco por fila),
│     existencia_continua, dinero_dormido, rotacion_por_linea,
│     cartera_por_obra, salio_sin_cobrar, merma_corte_periodo,
│     venta_por_mostradorista, garantias_abiertas, piezas_abiertas_viejas
└── 066_plantillas_semilla.sql
      La plantilla `ferreteria` = `tienda` + los módulos de este modelo
      − IEPS − comisiones − casco − caducidad − restricción legal.
      Y el movimiento de Ferretería La Broca de `tienda` provisional a
      `ferreteria`.
      TOCA DATOS VIVOS · No se aplica sin que P-04 esté contestada.
```

**Sobre la `086` y el backfill de material continuo.** Ninguna clave existente está marcada como
continua, así que la migración **no marca nada**: deja `es_continuo = false` en todo y el ferretero
marca sus ~700 claves de material continuo desde la pantalla de materiales, con una acción masiva por
línea. **Marcar automáticamente por nombre —"todo lo que diga cable"— sería adivinar**, y una clave mal
marcada como continua rompe su inventario.

**Sobre la `088` y la convivencia con `abarrotes`.** `abonos_fiado` (de `abarrotes`) y `pagos_credito`
(de aquí) **coexisten**: son dos productos financieros distintos, con reglas distintas de aplicación y
de movimiento de caja, documentados en `02-DINERO-Y-CAJA.md` §6.1. **Intentar unificarlas en una sola
tabla obligaría a relajar el `not null` de `movimiento_caja_id` que protege a `abarrotes`**, y eso sería
regalar la garantía del modelo padre para ahorrar una tabla. El trigger de saldo de `clientes` sí es
uno solo y suma los dos caminos.

**Sobre la `095` y P-04.** Toca a un negocio vivo: La Broca opera hoy en `operativo`. D-01 la manda a
`tienda` provisional en la `082` de `abarrotes`, y esta migración la mueve a su plantilla propia. **Son
dos movimientos de plantilla sobre el mismo cliente vivo**, y eso hay que decirlo: si P-04 se resuelve
con una sola ventana de migración, conviene **saltarse el paso intermedio** y llevarla directo de
`operativo` a `ferreteria` cuando las dos existan. La decisión es de Miguel; las dos migraciones están
escritas para funcionar en cualquiera de los dos órdenes.

---

## 8 · DEPENDENCIAS EXTERNAS

| Dependencia | Versión | Por qué ésa |
|---|---|---|
| **Ninguna librería de búsqueda** | — | El índice de 6,000 claves con atributos se resuelve con `Map` y arreglos en memoria. **Nada de motores de búsqueda de texto completo**: el problema no es el texto, es la **normalización de medidas**, y eso son ~150 líneas propias de conversión fracción↔decimal↔micrómetro. Una librería de búsqueda difusa resolvería la parte fácil y no la difícil |
| `@zxing/browser` | la que ya está | Heredada. Camino de cámara en teléfono. Se conserva |
| `jspdf` + `html2canvas` | las que ya están | Corte, cotización, remisión y etiquetas. **Se reutiliza intacto** |
| **Ninguna librería de firma** | — | La firma en pantalla es un `canvas` con `pointerdown/move/up` y `toDataURL`. ~60 líneas. Las librerías del ecosistema añaden peso para lo mismo |
| `xlsx` (o el motor que ya usa la importación) | la que ya está | **La importación de la nota del proveedor es la función más rentable de la carpeta** y usa el mismo motor que F-032. La plantilla cambia, el motor no |

### Integraciones con terceros · cuatro decisiones que no toma esta carpeta

**1 · La báscula (F-983).** Mismo análisis que en `abarrotes` §8.2, con una diferencia de uso: aquí la
báscula sirve para **contar**, no para cobrar. *Recomendación:* **empezar sin integración**. Se pesa, se
teclea el peso, el sistema convierte. El valor del 90% de F-151 está en la conversión, no en leer el
puerto. Web Serial API después, para el conteo por peso, que es donde el tecleo sí cansa.

**2 · El PAC de facturación (F-941).** Aquí **no es opcional como en `abarrotes`**: se timbra decenas de
veces por semana y con complemento de pago. *Recomendación:* es la decisión P-02 de
`05-DECISIONES.md` y **este modelo la vuelve urgente**. Un ferretero sin CFDI en el punto de venta no
compra el sistema: factura a mano en el portal del SAT y eso es horas a la semana de Norma.

**3 · La impresora de etiquetas (F-058).** En `abarrotes` la recomendación es PDF primero, ZPL después.
**Aquí la etiqueta de gaveta es requisito de arranque** (`03-INVENTARIO.md` §6.1, día 3): sin ella medio
catálogo no se puede escanear nunca. *Recomendación:* **PDF de hojas de etiqueta desde el día uno** —con
la impresora de hojas que Norma ya tiene— y ZPL como venta adicional para el que quiere reimprimir de a
una.

**4 · El catálogo del distribuidor.** No es una integración técnica, es **una conversación comercial**.
Truper publica su catálogo —más de 11,000 productos en siete marcas— y los distribuidores lo comparten
con sus clientes. *Recomendación:* construir el importador contra el formato de archivo, **no contra una
API que no existe**, y tratar el catálogo con atributos precargados como lo que es: **el activo que
contesta la objeción de venta número uno** de este giro, igual que el catálogo base de 1,200 productos
lo es en `abarrotes`.

---

## 9 · QUÉ SE REUTILIZA TAL CUAL

Con su ruta. **Nada de esto se toca.** Todo lo de `abarrotes` §9 sigue vigente; aquí van los añadidos y
las precisiones.

| Bloque | Ruta | Nota |
|---|---|---|
| Identidad, PIN, sesión, bitácora | `packages/app/src/identidad/` | Intacto |
| El envoltorio de comandos | `packages/app/src/definicion.ts` | Todos los comandos nuevos lo usan |
| Ámbito y paquetes | `packages/contracts/src/comandos/ambito.ts` | **`GIROS` ya trae `'ferreteria'`.** `PAQUETES` cambia en D-01 |
| **Presentaciones y conversión** | `packages/app/src/retail/presentaciones.ts` · `conversion.ts` | **De `abarrotes`. Es el ahorro más grande de esta carpeta.** El rollo es una presentación |
| **Capturador de código** | `packages/app/src/retail/` · `CapturadorCodigo` | De `abarrotes`. Sin *cooldown*, foco imperdible. Intacto |
| **Alta rápida** | `packages/app/src/retail/alta-rapida.ts` | Se **extiende** con medida y ubicación obligatorias |
| **Conteo** | `packages/app/src/inventario/conteo.ts` | De `abarrotes`. **El motor con esperado sellado no se toca**; se añade el modo por peso |
| **Merma** | `packages/app/src/inventario/merma.ts` | Se extiende con dos motivos |
| **Cartera y antigüedad** | `packages/app/src/fiado/cartera.ts` · `limite.ts` | De `abarrotes`. El cálculo de antigüedad es el mismo con $340 y con $46,000 |
| Cobro y métodos de pago | `packages/app/src/venta/pagos.ts` | Se extiende con `credito` como método y anticipo aplicado |
| Cotización y valoración de línea | `packages/app/src/venta/cotizar.ts` · `valorar.ts` · `escala.ts` | **`escala.ts` ya resuelve la venta por medida variable**: es la base de F-145 |
| Caja, arqueo, corte de turno | `packages/app/src/caja/` | Intacto, con los renglones de este giro |
| Ledger e inventario | `packages/app/src/inventario/inventario.ts` | Intacto |
| Compras y costo promedio | `packages/app/src/compras/costeo.ts` | El promedio ponderado no se toca |
| Generación de PDF | `heredado/lib/pdfDownload.js` | Intacto. Corte, cotización, remisión, etiquetas |
| Importación masiva | `heredado/components/datos/` | **La plantilla cambia mucho** (atributos, medidas, ubicación); el motor no |
| Diálogo de cantidad variable | `heredado/components/mesero/CantidadVariableDialog.jsx` | Base del corte de material. **Se reestructura en la pantalla 3, no se reescribe** |
| Utilidades de código de barras | `heredado/utils/barcodeUtils.js` | Intacto |
| Pantalla de mostrador | `heredado/pages/POS.jsx` | **Aquí sí se reestructura fuerte**: el buscador pasa al centro y el total deja de ser lo grande. Ver `FILE-MAP.md` §2.5 |

---

## 10 · LO QUE HAY QUE DECIDIR ANTES DE ESCRIBIR CÓDIGO

1. **Los diez IDs nuevos y las tres reclasificaciones** de `01-FUNCIONES.md` §6 se añaden a
   `03-CATALOGO-DE-FUNCIONES.md` **primero**, junto con los diez de `abarrotes`. Sin ID canónico se
   reinventan en `materiales-construccion` y en `refaccionaria`.
2. **P-02 (CFDI) deja de ser una decisión abierta para este modelo.** Un ferretero sin facturación en el
   punto de venta no compra. Si CFDI no entra en la Fase 2, `ferreteria` se puede documentar pero **no
   se puede vender completo**, y eso hay que decirlo antes de prometerlo.
3. **La migración `095` se aplicó en la Fase 3, con P-04 resuelta**, y además plantea la pregunta del doble movimiento de
   plantilla de La Broca. Ver §7.
4. **F-988 (venta sin conexión) tiene aquí una respuesta más fácil que en `abarrotes`** y conviene
   decirla: **sin conexión se vende de contado y el crédito se bloquea**. Eso reduce el problema a un
   subconjunto manejable y no entra en tensión con la regla de Fase 1 para la parte que importa. **La
   decisión sigue siendo de Miguel**, pero este modelo no la necesita para arrancar.
5. **El modo despacho+caja (F-235 en variante) hay que decidir si es perilla o si es la forma por
   omisión.** Esta carpeta recomienda **perilla, encendida por omisión en `ferreteria`**, porque es el
   control anti-robo del giro; pero obliga a construir `notas_mostrador` y sus estados, que es trabajo
   real. Si se decidiera modo A únicamente, **la carpeta sigue siendo válida y se ahorra la tabla
   1.14** — es la única pieza de este modelo que se puede posponer sin romper nada.
