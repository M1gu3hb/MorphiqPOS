# 03 · INVENTARIO · Abarrotes / tienda de conveniencia

**Éste es el archivo que más carga lleva de toda la carpeta.** No sólo porque el inventario es el
dolor número uno de este negocio, sino porque **aquí nace el tronco de retail que heredan
dieciocho modelos**. Lo que se defina bien en este archivo se cita por ID en `ferreteria`,
`papeleria`, `farmacia`, `boutique`, `dulceria`, `vinateria`, `refaccionaria`, `agroveterinaria`,
`merceria-telas`, `vapes-tabaqueria`, `tienda-mascotas`, `joyeria`, `zapateria`, `muebleria`,
`floreria`, `optica`, `materiales-construccion` y `electronica-celulares`. Lo que quede flojo se
va a reescribir dieciocho veces.

---

## 1 · QUÉ VARIANTE, Y POR QUÉ ÉSA

**Variante V3 · Presentaciones (F-112), que contiene V2 · Stock simple (F-111).**

No son dos variantes: **V2 es V3 con un solo factor de conversión igual a 1.** Ésa es la decisión
de arquitectura más importante de este archivo, y es lo que permite que una dulcería (V2 pura) y
una ferretería (V3 con cinco presentaciones) corran el mismo motor.

```
producto
  └── unidad_base            "pieza"          ← el ledger SIEMPRE se escribe aquí
       ├── presentación 1    pieza     × 1     código 7501055300945   $18.00
       ├── presentación 2    six       × 6     código 7501055363957   $99.00
       └── presentación 3    caja      × 24    código 7501055310548  $372.00

existencia real:  238 piezas
se muestra:       "9 cajas, 1 six y 4 piezas"   ← porque así lo ve el tendero
```

### 1.1 · Por qué V3 y no las otras nueve

| Variante | Por qué NO | Salvedad |
|---|---|---|
| **V1 · Sin inventario** | Es lo que hay hoy en la plantilla `esencial`, y es exactamente lo que D-01 dice que hay que arreglar. **Una tienda sin inventario no es una tienda, es una calculadora.** | Ninguna. |
| **V2 · Stock simple** | Se queda corta el primer día. El tendero compra en caja y vende en pieza; si la existencia sólo habla de piezas, la entrada de compra se captura mal y el conteo físico es imposible —nadie cuenta 238 piezas de refresco, cuenta 9 cajas y 4 sueltas. | **V2 se soporta** como el caso degenerado de V3. Es el modo de `papeleria` y `dulceria`. |
| **V4 · Lote y caducidad** | Exige número de lote, PEPS obligatorio y trazabilidad hacia atrás. Una tiendita no tiene lotes: tiene *"la leche que llegó el jueves"*. Pedirle a Don Chuy que capture un lote por cada caja garantiza que no capture ninguna. | **Sí hay caducidad**, y se resuelve con **F-146** (fecha en la entrada, sin lote). V4 completo es de `farmacia`. |
| **V5 · Número de serie** | Ningún producto de abarrotes es único ni rastreable individualmente. | Es de `electronica-celulares` y `refaccionaria`. |
| **V6 · Peso, volumen y receta** | **Es la que existe hoy y es la trampa.** Está construida para `restaurante` y es tentador reutilizarla porque ya funciona. Pero V6 asume que el producto vendido **se fabrica** a partir de insumos, y encenderla aquí obliga a capturar 1,800 recetas de un ingrediente cada una. Es el camino más rápido a que el tendero abandone. | El **granel** (F-144) sí usa unidad de peso, y eso se resuelve con `tipo_venta='variable_medida'`, que ya existe. Pesar no es cocinar. |
| **V7 · Producción por lote** | No se produce nada. | De `panaderia` y `tortilleria`. |
| **V8 · Por proyecto** | No hay proyectos. | De `constructora`. |
| **V9 · Consignación** | La mercancía es del tendero: la compró y la pagó. | De `bazar`. **Ojo:** el exhibidor de Sabritas *parece* consignación y no lo es — la práctica dominante reportada es venta en firme con canje de caducado. |
| **V10 · Activos que vuelven** | Nada regresa. | **Salvedad real:** el **casco** sí regresa, pero no es inventario que se venda: es un **envase con depósito**, y se modela como pasivo de caja (F-256), no como activo de almacén. Si se modelara como V10, el sistema pediría "estado al salir y al volver" de una botella de cerveza, y eso es absurdo. |

### 1.2 · Lo que este modelo le entrega al resto de retail

```
TRONCO COMÚN (F-100…F-109)         ← ya existe, de restaurante. Se reutiliza intacto.
  + F-111 V2 stock simple           ← NACE AQUÍ
  + F-112 V3 presentaciones         ← NACE AQUÍ
  + F-120 factor de conversión      ← existe para compras; se extiende a VENTA y EXISTENCIA
  + F-121 venta en dos unidades     ← NACE AQUÍ
  + F-144 granel de mostrador       ← existe a medias; se completa AQUÍ
  + F-146 caducidad sin lote        ← NACE AQUÍ (NUEVA)
  + F-147 código por presentación   ← NACE AQUÍ (NUEVA)
  + F-148 peso embebido en el código← NACE AQUÍ (NUEVA)
  + F-149 conteo cíclico por zona   ← NACE AQUÍ (NUEVA)
  + F-106 toma de inventario físico ← se construye AQUÍ por primera vez
  + F-109 merma con motivos de retail← se reescribe AQUÍ
```

Lo único que le queda por añadir a un vecino es su delta propio: `ferreteria` añade F-145 (corte de
material), `farmacia` añade V4 completo, `boutique` añade F-033 (matriz talla/color),
`refaccionaria` añade V5.

---

## 2 · UNIDADES

### 2.1 · La regla de hierro

> **El ledger `movimientos_stock` se escribe SIEMPRE en la unidad base del producto. Sin excepción,
> en ningún movimiento, en ningún módulo.** La presentación es una lente de lectura y de captura,
> nunca una unidad de almacenamiento.

Si en el ledger conviven "3 cajas" y "72 piezas" del mismo producto, el kardex no se puede sumar,
el costo promedio se corrompe y la existencia deja de tener un único valor verdadero. Toda la
conversión ocurre **en el borde**: al capturar y al mostrar.

### 2.2 · Las unidades base de este giro

| Unidad base | Cuándo | Ejemplos reales de Don Chuy |
|---|---|---|
| **pieza** | El 85% del catálogo | Coca-Cola 600 ml · Sabritas 45 g · Pan Bimbo grande · Sabritas 240 g · foco LED · Maruchan · jabón Zote · cigarro suelto |
| **gramo** | Granel sólido | Frijol bayo · arroz · azúcar estándar · chile guajillo · jamón · queso panela · detergente en polvo suelto |
| **mililitro** | Granel líquido | Aceite a granel · cloro a granel · vinagre |
| **metro** | Marginal aquí, central en `ferreteria` y `merceria` | Cable, mecate, listón |

**No se usa "kilogramo" como unidad base, se usa gramo.** Por la misma razón que el dinero se
guarda en centavos: los decimales flotantes en la unidad de almacenamiento producen existencias de
`3.9999999 kg` y diferencias que nadie puede explicar. El kilo es **presentación** del gramo, con
factor 1000. Esto vale para los dieciocho modelos.

### 2.3 · Las presentaciones reales del giro

| Producto | Unidad base | Presentaciones | Factor | Código propio |
|---|---|---|---|---|
| Coca-Cola 600 ml PET | pieza | pieza · caja de 12 | 1 · 12 | Sí, distinto cada una |
| Cerveza Corona 355 ml | pieza | pieza · six · cartón de 24 | 1 · 6 · 24 | Sí |
| Sabritas 45 g | pieza | pieza · caja de 30 | 1 · 30 | Caja sí, pieza sí |
| Huevo | pieza | pieza · medio kilo (≈8) · kilo (≈16) · cartón de 30 | variable | **No.** Sólo el cartón |
| Frijol bayo | gramo | kilo · medio kilo · granel libre · bolsa de 900 g | 1000 · 500 · libre · 900 | Sólo la bolsa cerrada |
| Papel higiénico | pieza | rollo · paquete de 4 · paquete de 12 | 1 · 4 · 12 | Sí |
| Cigarros | pieza | cajetilla · cigarro suelto | 20 · 1 | Cajetilla sí, suelto **no** |
| Agua garrafón 20 L | pieza | garrafón (con casco) | 1 | Sí, y lleva depósito F-256 |

**Tres casos que rompen el modelo ingenuo y que hay que resolver desde el diseño:**

1. **El huevo por pieza vendido por kilo.** El factor no es fijo: un kilo son entre 15 y 18 huevos.
   Se resuelve declarando el huevo como base **gramo** con presentación "pieza ≈ 60 g", o como base
   **pieza** con venta variable. La decisión la toma el tendero al dar de alta el producto, y el
   sistema tiene que ofrecer las dos y explicar la diferencia en una línea.
2. **El cigarro suelto.** Ilegal de jure, universal de facto en el canal tradicional. La cajetilla
   es la presentación de compra, el cigarro suelto es una presentación de venta con factor 1/20.
   El sistema **lo modela** porque si no, el inventario de cigarros nunca cuadra y el tendero deja
   de confiar en el módulo entero. **No es el papel del punto de venta hacer cumplir eso**; su
   papel es reflejar la operación real. Lo que sí hace el sistema es el bloqueo por edad (F-980).
3. **El producto que se compra en caja y del que sólo se vende la caja.** El aceite de 20 L, la
   caja de leche. Presentación única con factor >1. Funciona solo, pero hay que soportarlo sin
   obligar a declarar la presentación "pieza".

### 2.4 · Cómo se muestra una existencia

Nunca en unidad base a secas. Siempre en la forma que el tendero ve en el anaquel:

```
Coca-Cola 600 ml           238 pz     ·  9 cajas + 1 six + 4 pz
Frijol bayo             14,300 g      ·  14.3 kg
Cigarros Marlboro          186 pz     ·  9 cajetillas + 6 sueltos
```

La lente por omisión es **la presentación de compra** para el módulo de inventario y compras, y
**la presentación de venta** para el mostrador. Son dos usuarios distintos leyendo el mismo número.

---

## 3 · QUÉ SE DESCUENTA, CUÁNDO Y CON QUÉ DISPARADOR

### 3.1 · El "cuándo" es la pregunta crítica

**Se descuenta AL COBRAR, dentro de la misma transacción del comando de cobro, de forma atómica.**
Es F-102, ya existe, y no cambia.

**Por qué al cobrar y no al escanear.** Porque un carrito se abandona. En una tiendita pasa
constantemente: el cliente escanea tres cosas, se acuerda de que no trae dinero, y se va. Si el
stock bajara al escanear, habría que reponerlo al cancelar, y cada cancelación mal manejada dejaría
un fantasma en el ledger. **El ledger es inmutable: sólo se escribe lo que de verdad pasó.**

**Por qué no al entregar.** Porque en mostrador cobrar y entregar son el mismo instante. En
`mueblería` o en `floreria` no lo son —se cobra hoy y se entrega el jueves— y ahí el disparador es
otro. Aquí no hay hueco que modelar, y **modelarlo por si acaso es exactamente el tipo de
complejidad que no se paga sola**.

### 3.2 · La tabla completa de disparadores

| Evento | Movimiento | Signo | Unidad escrita | Atómico con |
|---|---|---|---|---|
| Cobro de venta | `salida_venta` | − | base | La transacción de cobro |
| Cobro de venta a **fiado** | `salida_venta` | − | base | Igual. **El fiado sí descuenta stock**: el producto salió de la tienda |
| Cancelación de venta ya cobrada | `cancelacion` | + | base | La transacción de cancelación |
| Devolución de producto **vendible** | `devolucion` | + | base | La transacción de devolución |
| Devolución de producto **no vendible** | `devolucion` + `merma` | +/− | base | Dos movimientos, una transacción |
| Entrada de compra | `entrada_compra` | + | base | La recepción, junto con el costo promedio |
| **Canje al proveedor** (pan viejo) | `devolucion_proveedor` ← **NUEVO** | − | base | La misma nota de compra |
| Merma con motivo | `merma` | − | base | El comando de merma |
| Consumo de la casa | `consumo_interno` ← **NUEVO** | − | base | El comando de consumo |
| Ajuste de conteo cíclico | `ajuste` | ± | base | El cierre del conteo |
| Traspaso almacén → anaquel | `traspaso_salida` + `traspaso_entrada` | −/+ | base | Una transacción |
| Inventario inicial | `inventario_inicial` | + | base | El alta |

**Dos tipos nuevos que hay que añadir al `check` de `movimientos_stock`:**
`devolucion_proveedor` y `consumo_interno`. Hoy la tabla admite
`entrada_compra, salida_venta, ajuste, merma, devolucion, cancelacion, traspaso_entrada,
traspaso_salida, inventario_inicial, produccion`. Meter el canje en `devolucion` o en `merma` es lo
que hace que el costo del pan salga mal todos los días y que el indicador de merma no sirva para
detectar robo.

### 3.3 · Cuando el stock no alcanza

El comportamiento es una **perilla por producto**, `permite_venta_sin_stock`, que ya existe en la
BD. Y la decisión de cuál es el valor por omisión importa mucho:

- **Por omisión: SÍ se permite vender sin stock, con aviso.** Porque en una tiendita el stock del
  sistema está mal con frecuencia —el producto llegó y no se capturó, el conteo tiene tres días—
  y un sistema que se niega a cobrar un refresco que el cliente tiene en la mano **se apaga esa
  misma tarde**. La venta procede, el stock queda en negativo, y el producto aparece marcado en
  rojo en la pantalla de inventario para que se investigue.
- Un stock negativo **no es un error que se silencia**: es una alarma. La regla de Fase 1 —"falla
  en vez de silenciar"— se respeta señalando fuerte, no impidiendo. Impedir aquí es peor que el
  problema que resuelve.
- En `farmacia` con controlados, esta perilla se invierte y ahí sí bloquea. Es un delta de ese
  modelo, no de éste.

---

## 4 · ENTRADAS

### 4.1 · Compra · las doce puertas de entrada

La diferencia más grande con `restaurante` no es qué se compra, es **a cuántos y con qué ritmo**.
Un restaurante le compra a cuatro u ocho proveedores, semanalmente, sentado. Aquí:

| Proveedor | Ritmo | Cómo llega | Particularidad |
|---|---|---|---|
| **Bimbo** | **Diario o casi**, muy temprano | Vendedor de ruta con charola, más de 57,000 rutas en el país | **Logística inversa**: se lleva el caducado y lo repone. La nota trae entrada **y** salida |
| **Coca-Cola FEMSA / Pepsi** | Preventa con **día fijo de ruta**; el camión entrega al día siguiente | Preventista levanta el pedido | **Cooler en comodato sin costo** y se surte sólo con producto de la marca. Crédito digital a 8/15/30 días (Mi Tiendita Juntos) |
| **Sabritas / Barcel** | Semanal | Vendedor con exhibidor | Sabritas ~69.7% del mercado, Barcel ~20.3%. Venta en firme con canje de caducado. El exhibidor es en préstamo y, por resolución de COFECE, **no puede exigirse exclusividad** |
| **Cerveza (Modelo / Heineken)** | Semanal | Distribuidor directo o Modelorama | **Casco retornable**. Registrarse como distribuidor directo da mejor margen que comprar en club de precio |
| **Cigarros** | Semanal o quincenal | Distribuidor | Compra en firme, sin devolución, margen 8%–15%. Precio muy controlado |
| **Central de abasto** | **Quincenal** | Don Chuy va con la camioneta | **Pago de contado.** Abarrote seco, granel, fruta y verdura |
| **Mayorista de la avenida** | Martes intermedios | Va él | Contado o 15–30 días si es cliente frecuente |
| **Lácteos, huevo, tortilla** | Diario o cada tercer día | Ruta local | Perecedero, poco margen (6%–10%), alta rotación |

**Lo que esto exige del modelo de datos:** el proveedor necesita **día de visita**, **frecuencia**,
**forma de pago** y **días de crédito**. No como adorno, sino porque de ahí sale la sugerencia de
pedido del corte y el flujo de efectivo de la semana.

### 4.2 · La entrada de compra con devolución en la misma nota

Esto es específico del giro y hay que construirlo (F-632 en variante):

```
NOTA DE BIMBO · 14 de septiembre · 06:40
  ENTRADA
    Pan blanco grande       +18 pz    $32.10 c/u
    Bimbollos               +12 pz    $28.40 c/u
    Donas Bimbo             +24 pz    $ 9.80 c/u
  DEVOLUCIÓN / CANJE
    Pan blanco grande        −6 pz    (caducado, canje)
    Donas Bimbo              −3 pz    (dañado, canje)
  ─────────────────────────────────────────────
  A pagar                            $1,158.00
```

Un documento, seis movimientos de ledger, una transacción. Si el sistema obliga a capturar la
entrada en un lado y el canje en otro, **el canje nunca se captura**, el stock de pan queda
inflado para siempre, y el primer conteo físico produce un faltante enorme que no es robo.

### 4.3 · Las demás entradas

| Entrada | Frecuencia | Notas |
|---|---|---|
| **Devolución de cliente vendible** | Semanal | Regresa al anaquel a su costo original. No toca el costo promedio |
| **Ajuste positivo** | Tras cada conteo cíclico | Con motivo obligatorio |
| **Traspaso del almacén de atrás al anaquel** | **Diario, varias veces** | Ver §4.4 |
| **Traspaso entre sucursales** | Cuando hay dos tiendas | F-972 |
| **Inventario inicial** | Una vez, al arrancar | Ver §6.1 |

### 4.4 · El almacén de atrás · la decisión que hay que tomar explícitamente

Una tienda de abarrotes tiene **dos lugares físicos con producto**: el anaquel y la bodeguita de
atrás. ¿Son dos almacenes en el sistema o uno solo?

**Decisión: UNO SOLO, por omisión.** Y hay que explicar por qué, porque la respuesta "correcta"
parece la contraria.

- Si son dos almacenes, cada vez que Lupita saca una caja de refrescos de atrás y la acomoda en la
  reja, **tiene que capturar un traspaso**. Eso ocurre entre diez y treinta veces al día. No lo va
  a hacer. Y en cuanto deja de hacerlo, los dos almacenes mienten y el sistema entero pierde
  credibilidad.
- Con un almacén, la existencia es "lo que hay en la tienda", que es exactamente la pregunta que el
  tendero se hace y la única que sabe contestar contando.
- **El conteo cíclico (F-149) cuenta anaquel Y bodega de la misma zona**, y por eso funciona con un
  solo almacén.

**La perilla existe** (F-105 está construida y el multi-almacén también) y se enciende en la tienda
grande con bodega separada y encargado propio. Pero viene **apagada**, y esto es una decisión de
producto, no una limitación. `materiales-construccion` la enciende siempre; `dulceria` nunca.

---

## 5 · SALIDAS

| Salida | Frecuencia | Cómo se registra | Valuación |
|---|---|---|---|
| **Venta** | 50–400 veces al día | Atómica con el cobro | A costo promedio |
| **Merma por caducidad** | Semanal, concentrada en lácteos, pan, fruta y embutido | F-109, motivo `caducado`, disparada por la alerta de F-146 | A costo |
| **Merma por daño en anaquel** | Constante y de bajo monto | Motivo `dañado_anaquel` | A costo |
| **Merma por rotura** | Semanal | Motivo `roto` — la botella que se cayó | A costo |
| **Robo detectado** | Cuando se ve | Motivo `robo_detectado` — es distinto de "faltante de conteo" | A costo |
| **Error de captura** | Tras conteo | Motivo `error_captura` — reconocer que el sistema estaba mal, no que faltó producto | A costo |
| **Canje al proveedor** | Diario (pan), semanal (botana) | Tipo propio `devolucion_proveedor` | **Sin pérdida** |
| **Consumo de la casa** | Diario | Tipo propio `consumo_interno` | A costo, en su renglón |
| **Cambio en especie** (el chicle del cambio) | Varias veces al día | `consumo_interno`, subtipo `cambio_especie`, ligado a F-257 | A costo |
| **Traspaso a otra sucursal** | Ocasional | F-972 | A costo |
| **Ajuste negativo por conteo** | Tras cada conteo cíclico | `ajuste` con motivo | A costo |

**La distinción que hay que defender con los dientes:** `robo_detectado` (alguien vio al que se
llevó la botana) es **distinto** de la diferencia de conteo. La diferencia de conteo es de origen
desconocido: puede ser robo, puede ser un error de captura de hace tres semanas, puede ser un canje
que no se registró. **Llamarla "robo" es acusar sin prueba y es la forma más rápida de que el
sistema genere un conflicto laboral injusto.** El corte la llama *diferencia*, y el dueño la
interpreta.

---

## 6 · CÓMO SE TOMA EL INVENTARIO FÍSICO EN ESTE GIRO

### 6.1 · El inventario inicial · la barrera de entrada del producto

**Ésta es la objeción número uno de la venta y la razón por la que Don Chuy no compró eleventa:
"¿y quién va a capturar los mil productos?".** Cualquier plantilla de abarrotes que no conteste
esto en la primera demostración no se vende, y la respuesta no puede ser "es fácil".

La estrategia es **no capturar todo antes de empezar**:

```
DÍA 1  · Se importa un catálogo base de la plantilla del giro
         (nombre, marca, EAN, categoría, tasa de IVA, régimen IEPS)
         con los ~1,200 productos que hay en cualquier tiendita de México.
         Don Chuy no captura nada: sólo pone precio a lo que vende.

DÍA 1  · Se empieza a VENDER. El stock arranca en cero y el sistema lo permite.
         Cada escaneo confirma que ese producto existe en la tienda.
         Cada producto que no está, se da de alta en tres campos desde el cobro.

SEM. 1 · Conteo cíclico por zonas (F-149). Una zona al día, veinte minutos.
         Refrescos el lunes, botanas el martes, abarrote seco el miércoles.
         Al terminar la primera vuelta, en dos semanas, el inventario existe
         y está contado, sin haber cerrado la tienda ni un domingo.
```

**Esto convierte la barrera de entrada en una rutina.** Y es la razón por la que **F-149 se
construye antes que F-106** aunque dependa de ella.

### 6.2 · El conteo cíclico · F-149

| | |
|---|---|
| **Cuándo** | Diario, en el valle de 10:00–13:00. Veinte minutos. |
| **Quién** | Lupita o el sobrino, con el teléfono en la mano frente al anaquel. |
| **Alcance** | Una **zona de anaquel**, que es un campo nuevo del producto: `zona`. "Reja de refrescos", "anaquel 2 arriba", "congelador", "mostrador". |
| **Cómo** | Se escanea un producto de la zona, se teclea cuántos hay **en la presentación que se ve** (9 cajas, 4 piezas), Enter, siguiente. El sistema convierte. |
| **A ciegas** | **Sí.** No se muestra el esperado antes de contar. Misma regla del arqueo, misma razón: si se muestra, todo el mundo teclea ese número. |
| **Al cerrar la zona** | Aparece la comparación, producto por producto. El operador confirma o recuenta. El ajuste se escribe como un movimiento por producto, con motivo. |
| **Frecuencia por zona** | Configurable, con recomendación por rotación: refrescos y botanas cada semana; abarrote seco cada mes; productos de baja rotación cada trimestre. |
| **El sistema recuerda** | En el dashboard: *"Zona 'Reja de refrescos' — contada hace 9 días"*. |

### 6.3 · La toma completa · F-106

Existe, y se usa **dos veces al año**, típicamente en enero y en julio, un domingo con la tienda
cerrada. Sirve para el cierre contable y para recalibrar. Es F-149 con el alcance igual a "todas
las zonas", y por eso **no es una función distinta: es un alcance distinto del mismo motor**.

Reglas de la toma completa:
- **Se congelan las ventas** mientras dura. Un conteo con la caja abierta no cuadra nunca.
- Se cuenta **por zona**, en el mismo orden que el conteo cíclico, para que la gente ya sepa hacerlo.
- El resultado se compara contra el esperado y contra **las diferencias acumuladas de los conteos
  cíclicos del semestre**. Si las dos coinciden, el sistema es confiable. Si no, alguien está
  contando mal o hay un movimiento que no se registra.

### 6.4 · Lo que NO se hace en este giro

- **No se cuenta la tienda entera un domingo cada mes.** Nadie lo hace y prometerlo es fantasía.
- **No se usa PEPS.** Las salidas son a costo promedio ponderado. PEPS obligatorio es de V4 y de
  `farmacia`.
- **No se valúa a precio de venta.** Ni el inventario, ni la merma, ni las diferencias. Siempre a
  costo. Valuar la merma a precio infla la pérdida y hace que el dueño desconfíe del número.

---

## 7 · LAS MERMAS PROPIAS DEL GIRO

Cinco motivos, y **cada uno apunta a un responsable distinto**. Ésa es la única razón por la que
son cinco y no uno: si dos motivos apuntan al mismo responsable y disparan la misma acción, sobra
uno.

| Motivo | Qué es | Quién responde | Qué decisión dispara |
|---|---|---|---|
| **Caducado** | Se venció en el anaquel | **La compra**. Se pidió de más o se pidió mal | Bajar el mínimo de ese producto, o rematarlo antes |
| **Dañado en anaquel** | Bolsa reventada, lata golpeada, empaque mojado | **El acomodo** y las condiciones del local | Cambiar dónde se pone, arreglar la gotera |
| **Roto en traslado** | Se cayó al bajarlo de la camioneta o al acomodar | **El manejo** | Capacitación o mejor transporte. Suele ser bajo y estable |
| **Robo detectado** | Se vio. Cliente o empleado | **Seguridad** | Reacomodar el producto caro cerca del mostrador |
| **Error de captura** | El sistema estaba mal, no faltó producto | **El sistema y quien capturó** | Revisar el flujo que lo generó |

**Las tres mermas que de verdad duelen en una tiendita**, por orden de monto:

1. **Caducidad de perecedero.** Lácteos, pan, embutido, fruta. Son productos de margen bajo (6%–10%
   en lácteos) donde una sola caja perdida se lleva la utilidad de muchas ventas. **Es merma
   prevenible con F-146** y con la sugerencia de pedido: se compra de más porque no se sabe cuánto
   se vende.
2. **La diferencia de conteo sin causa.** Que es el robo hormiga y que el sistema **no debe llamar
   robo**. ANTAD ubica la merma del retail mexicano en **1.59% sobre ventas** y el robo hormiga
   entre **1.5% y 2.5%**, con alrededor del **42%** de las pérdidas atribuidas a robo interno. El
   sistema da el número; el dueño decide qué significa.
3. **El refresco que se toma el personal.** Que no es merma: es **consumo de la casa**, y mezclarlo
   con merma arruina el indicador que sirve para el punto 2. Es la misma lección que `restaurante`
   documentó con F-261 y aquí vale igual.

**Y la merma que NO es merma:** el canje al proveedor. Bimbo se lleva el pan viejo y lo repone. Si
eso se registra como merma, el costo del pan sale mal todos los días y el margen de la categoría
—que es el dato con el que se toman decisiones de surtido— miente.

---

## 8 · ALERTAS · las que importan y las que serían ruido

### 8.1 · Las que importan

| Alerta | Umbral | Dónde aparece | Decisión que dispara |
|---|---|---|---|
| **Bajo mínimo, agrupada por proveedor** | Existencia ≤ mínimo | Dashboard · corte §12 · pantalla del proveedor | Qué le pido al que viene mañana |
| **Se agota antes de la próxima visita** | Existencia ÷ venta diaria < días hasta la visita | Dashboard | Pedir de más hoy o conseguirlo en el mayorista |
| **Próximo a caducar** (F-146) | 7 días para perecedero, 30 para seco | Dashboard · pantalla de inventario | Rematar, mover al frente, o devolver si hay canje |
| **Stock negativo** | < 0 | Pantalla de inventario, en rojo | Hay una entrada sin capturar o un robo. Contar esa zona hoy |
| **Zona sin contar** | > N días según rotación | Dashboard | Qué zona toca hoy |
| **Diferencia de conteo alta** | Diferencia > 3% del valor de la zona | Al cerrar el conteo | Recontar antes de ajustar |
| **Sin movimiento** | 45 días sin venderse | Reporte mensual, **no en el dashboard** | Rematar o dejar de pedirlo. Es dinero dormido |
| **Saldo de recargas bajo** | < $300 | Dashboard | Depositar hoy. No es inventario, pero se comporta igual |

### 8.2 · Las que serían ruido, y por qué

| Alerta | Por qué NO |
|---|---|
| **Alerta por cada producto bajo mínimo, una por una** | Con 1,800 SKU hay entre 40 y 120 bajo mínimo **todos los días**. Cien avisos es cero avisos. Van **agrupados por proveedor**, y sólo se enseña el del proveedor que viene. |
| **Alerta al vender el último** | Es el estado normal de decenas de productos en una tiendita. |
| **Alerta de caducidad para producto seco a 30 días** | El arroz caduca en dos años. Avisar a 30 días de 730 es ruido. El umbral es **por categoría**, no global. |
| **Alerta de "producto no rentable"** | El refresco tiene 10% de margen **y es el que trae al cliente a la puerta**. Un sistema que le diga a un tendero que deje de vender Coca demuestra que no entiende el negocio. El margen por categoría va en el corte como **información**, nunca como alerta. |
| **Alerta de robo** | El sistema **no sabe** si fue robo. Ver §5. Decir "robo" sin prueba genera conflictos laborales injustos y es la forma más rápida de que el dueño apague el módulo. |
| **Notificación push de cada venta** | Existe en varios competidores y es lo primero que la gente apaga. |

---

## 9 · LOS TRES ERRORES DE INVENTARIO QUE MÁS COMETE ESTE NEGOCIO

### Error 1 · Capturar la compra en piezas cuando llegó en cajas (o al revés)

**Cómo pasa.** Llegan 5 cajas de refresco de 24. Lupita, con prisa, teclea "5" en un campo que el
sistema interpreta como piezas. Entran 5 piezas en vez de 120. Al día siguiente el sistema dice que
hay −80 refrescos y nadie entiende nada. O al revés: teclea 120 en un campo de cajas y entran 2,880.

**Por qué es el error más frecuente.** Porque la captura de compra ocurre **de pie, temprano, con
el repartidor esperando**, entre diez y treinta veces por semana. Es el momento de más prisa y
menos atención de todo el flujo.

**Cómo lo previene el sistema.**
1. **La presentación se elige antes que la cantidad**, siempre, y por omisión viene la presentación
   de compra habitual de ese producto (`unidad_compra_default`, que ya existe en `insumos`).
2. **La equivalencia se muestra mientras se teclea**, en vivo: `5 cajas = 120 piezas`. Es una línea
   de texto y elimina la mayor parte de la clase de error.
3. **Aviso de orden de magnitud**: si la entrada es más de 5× el promedio histórico de entradas de
   ese producto, el sistema pregunta una vez. No bloquea: pregunta.

### Error 2 · El producto que llegó y nunca se capturó

**Cómo pasa.** El de Sabritas llega a las 11:30, Lupita está cobrando, él acomoda su exhibidor y
deja la nota en el mostrador. La nota se moja, se pierde o se traspapela. El producto se vende
durante dos semanas contra un stock que nunca subió. Resultado: stock negativo, y cuando llega el
conteo, un "faltante" que en realidad es una entrada perdida.

**Por qué importa más de lo que parece.** Porque **contamina el dolor 1**. Un faltante por entrada
no capturada es indistinguible de un robo, y es lo que hace que los conteos acusen a gente
inocente. Si el sistema no lo resuelve, el módulo de faltantes pierde credibilidad y con él todo
el argumento de venta.

**Cómo lo previene el sistema.**
1. **Recepción desde el teléfono, de pie, en el momento**, con foto de la nota. Cinco toques. La
   captura formal se completa después; lo que importa es que el movimiento exista hoy.
2. **El proveedor tiene día de visita**, así que el sistema sabe que hoy tocaba Sabritas. Si al
   cierre no hay entrada de Sabritas, lo pone en el corte: *"Hoy tocaba Sabritas y no se registró
   entrada"*. Una línea, sin drama.
3. **El stock negativo es una alarma visible**, no un número escondido, y la acción sugerida es
   *"revisa si hay una entrada sin capturar"* antes que *"cuenta esa zona"*.

### Error 3 · Creer que el precio de venta menos el precio de compra es el margen

**Cómo pasa.** Don Chuy compró el aceite a $38 hace tres meses y lo vende a $46. Cree que gana $8.
Pero repuso a $41 y a $43, y el costo promedio ponderado real es $40.60. Gana $5.40, no $8: un 33%
menos de lo que cree. Multiplicado por todo el catálogo, es la diferencia entre creer que la tienda
deja $9,000 al mes y que deje $6,000.

**Por qué es un error de inventario y no de contabilidad.** Porque el margen correcto **sólo existe
si el costo promedio se actualiza en cada entrada**, y el costo promedio sólo es correcto si todas
las entradas se capturaron (error 2) y con la unidad correcta (error 1). Los tres errores son el
mismo error visto en tres momentos.

**Cómo lo previene el sistema.** F-633 ya existe y calcula el promedio ponderado en cada recepción.
Lo que falta es **enseñarlo**: cuando el tendero pone precio a un producto, el sistema muestra
`costo promedio actual · margen resultante · margen de la categoría`, ahí mismo, mientras teclea.
Y cuando el costo de un producto sube más de 5% en una entrada, el sistema lo señala en el corte
con el precio de venta sugerido para mantener el margen. **Eso último es lo que un tendero llamaría
"el sistema me avisó que subió la Coca antes de que perdiera dinero"**, y es lo que hace que la
renta mensual se sienta barata.
