# 03 · INVENTARIO · Estética / salón de belleza

**Variante mixta: V1 + V6 + V2.** Y la parte más importante de este archivo es que **V1 no significa
lo que el catálogo dice que significa**, y hay que corregirlo antes de que once modelos lo hereden
mal.

---

## 1 · QUÉ VARIANTE, Y POR QUÉ TRES

`01-MAPA-GENERAL.md` §3.2 clasifica a estética como **V1 · SIN INVENTARIO**, con la descripción *"el
módulo entero está apagado. Servicios puros."*

**Eso es falso**, y si se construye así, el sistema queda ciego en el 30% del costo del negocio.

| Capa | Variante | Qué es | Cuánto pesa |
|---|---|---|---|
| **El tiempo** | **V1 redefinida** | La agenda **es** el inventario. Tiene existencia (huecos), se agota (el sábado se llena a las diez) y **caduca cada minuto** | **El 80% del ingreso** |
| **El producto de cabina** | **V6 · peso y volumen, con fórmula capturada** | Tinte en gramos, oxidante en mililitros, tratamiento, decolorante. Se consume dentro del servicio y no se vende | **8% a 15% de la venta de servicio**, y el 80% del costo variable |
| **El producto de reventa** | **V2 · stock simple, pieza** | Shampoo, mascarilla, cera, plancha. Se vende tal cual | **10% a 20% del ingreso**, con el margen no-horario del salón |

### 1.1 · Por qué V1 hay que reescribirla en el catálogo

**El inventario de un negocio de citas es el tiempo, y se comporta como un inventario de verdad:**

| Propiedad de un inventario | Cómo se cumple en la agenda |
|---|---|
| **Existencia** | Horas disponibles = horario del profesional − bloqueos no productivos (F-416) |
| **Unidad** | El minuto. La unidad de venta es el bloque de servicio |
| **Almacenes** | Uno por profesional, y aparte los recursos compartidos (lavabo, secadora) |
| **Entradas** | Contratar a alguien, ampliar horario, abrir el lunes, meter una estación más |
| **Salidas** | Una cita atendida (venta), un bloqueo (consumo interno), **un hueco (merma)** |
| **Merma** | **El hueco.** Y es la merma más brutal que existe en los 78 modelos |
| **Caducidad** | **Instantánea y total.** El hueco de las 15:00 vale su precio completo a las 14:59 y vale cero a las 15:01. No hay remate, no hay canje, no hay "mañana lo vendo" |
| **Valuación** | Al ticket promedio del profesional en esa franja (F-417) |
| **Alerta de mínimo** | Al revés: la alerta es de **exceso** de existencia. "Mañana te sobran 7.5 horas" |

**Un abarrote que no se vendió sigue en el anaquel. Una hora que no se vendió no deja rastro.** Ésa
es la frase que justifica todo el arquetipo A3, y por eso F-417 (costo del hueco) existe: es el
único modo de que la merma de este negocio se vea.

**La reclasificación que hay que hacer en `03-CATALOGO-DE-FUNCIONES.md`:**

```
ANTES
F-110  V1 · Sin inventario · servicios puros
       → estética, consultorio, despacho, gimnasio

DESPUÉS
F-110  V1 · El tiempo es el inventario · el módulo de PRODUCTO puede estar
       apagado, pero la agenda es un inventario con existencia, merma y
       caducidad instantánea
       → despacho legal, despacho contable, consultoría   (V1 pura)
       → estética, spa, veterinaria, tatuajes, dental     (V1 + V6 + V2)
       → consultorio médico, fisioterapia, gimnasio       (V1 + V2 ligero)
```

### 1.2 · Por qué V6 y no V2 para la cabina

Porque **el tinte no se consume en piezas**. Se compra un tubo de 60 gramos y se usan 35 en una
cabeza y 52 en otra. Si el sistema lo maneja por pieza, sólo puede decir "tengo 14 tubos" y jamás
puede costear un servicio.

Pero **es V6 con una diferencia capital respecto a `restaurante`, y es la razón de existir de
F-154**: en un restaurante la receta es fija —una arrachera lleva siempre 280 g de carne— y explota
sola al cobrar. **Aquí no hay receta fija.** La misma clienta, con el mismo servicio, lleva 60 g o
110 g según largo, densidad y cuánta cana tenga. Ver §5.

### 1.3 · Por qué V2 y no V3 para la reventa

Porque **no hay conversión caja↔pieza**. El shampoo se compra por caja de 12 frascos y se vende por
frasco, pero eso es una compra de 12 unidades, no una presentación con factor. La ferretería y la
tiendita necesitan V3 porque venden la caja **y** la pieza al mismo tiempo, con precios distintos.
Aquí nadie vende la caja de shampoo.

**Ojo: esto separa a estética de veterinaria.** Una veterinaria sí necesita V3 para el alimento
—costal de 20 kg y venta a granel por kilo— y por eso, cuando se escriba `veterinaria`, tiene que
encender V3 además de lo de aquí. Está anotado en `FILE-MAP.md` §4.

---

## 2 · UNIDADES Y PRODUCTOS REALES

### 2.1 · Producto de cabina · V6

| Unidad | Productos reales | Cómo llega | Cómo se consume |
|---|---|---|---|
| **gramo** | Tinte en tubo (60 g), decolorante en polvo (bote de 500 g), pasta de mechas | Tubo o bote cerrado | 25–120 g por servicio, según cabeza |
| **mililitro** | Oxidante 10/20/30/40 vol (litro), tratamiento, keratina, tónico, alisado | Botella de 900 ml o 1 L | 60–200 ml por servicio |
| **mililitro (cabina)** | Shampoo y acondicionador profesional de lavabo | **Galón de 3.8 L o litro** | 10–25 ml por lavado |
| **pieza** | Guantes (par), gorro, capa desechable, toalla desechable, cepillo de aplicación | Caja de 100 | 1–2 por servicio |
| **metro / hoja** | Papel aluminio, papel de mechas | Rollo de 100 m o caja de hojas | 15–40 hojas en un balayage |
| **pieza** | Esmalte, gel, acetona, lima (en salón con uñas) | Frasco | Se cuenta por frasco, **no se pesa** |

### 2.2 · Producto de reventa · V2

| Producto | Presentación | Precio típico | Margen |
|---|---|---|---|
| Shampoo profesional | 300 ml | $280–$480 | 45%–55% |
| Mascarilla / tratamiento | 250 g | $320–$650 | 45%–55% |
| Aceite / sérum | 100 ml | $250–$420 | 50% |
| Cera, gel, espuma | pieza | $120–$280 | 50% |
| Plancha, secadora | pieza | $900–$3,500 | 25%–35% |
| Accesorio (cepillo, liga, clip) | pieza | $40–$250 | 55%–65% |

### 2.3 · Los tres casos que rompen el modelo ingenuo

**Caso 1 · El tubo abierto.** Un tubo de 60 g del que se usaron 35 **no es ni un tubo ni 25 gramos**:
es un tubo abierto. El conteo físico real de un salón es **contar tubos cerrados y estimar los
abiertos**, porque nadie va a pesar 40 tubos con una báscula. Ver §7.

**Caso 2 · El mismo SKU en dos destinos.** El litro de shampoo profesional se abre para el lavabo y
**deja de ser vendible**. En muchos salones es literalmente el mismo producto que el frasco del
anaquel. Es F-155 y es la causa número uno de "el shampoo desaparece". Ver §3.

**Caso 3 · El producto que se vende y también se usa.** La mascarilla de $650 que la clienta compra es
la misma que se le aplica en el tratamiento de $400. Uno sale del anaquel y baja al cobrar; el otro
sale de cabina y baja al cerrar el servicio. **Dos disparadores distintos para el mismo artículo en
el mismo ticket.**

---

## 3 · LOS DOS ALMACENES · F-155

**La decisión estructural de este archivo.** El tronco F-100 ya permite existencia por almacén; lo
que hay que declarar es qué almacenes y qué significan.

```
ALMACÉN "ANAQUEL"  (tipo: venta)          ALMACÉN "CABINA"  (tipo: consumo)
  · producto cerrado, vendible              · producto abierto, insumo
  · unidad: pieza                           · unidad: gramo, ml, pieza, metro
  · aparece en la búsqueda de venta         · NO aparece en la búsqueda de venta
  · baja AL COBRAR                          · baja AL CERRAR EL SERVICIO
  · V2 stock simple                         · V6 peso y volumen
  · conteo: mensual, rápido                 · conteo: semanal, por estimación
```

### 3.1 · El evento ABRIR · el que hoy no existe

```
ABRIR  ·  litro de shampoo profesional

  ANAQUEL   − 1 pieza        (valuada a costo promedio: $310)
  CABINA    + 1,000 ml       (a $0.31 / ml)

  Es un TRASPASO CON CONVERSIÓN DE UNIDAD, en una sola transacción.
  El factor vive en el producto: 1 pieza = 1,000 ml.
```

**Por qué ABRIR es el evento contable y no la compra.** Porque hasta que no se abre, el litro es
inventario vendible con valor de venta. En el momento en que se abre, **deja de poder venderse** y
su valor pasa a ser costo de servicio. Un salón que compra 6 litros y abre 2 tiene 4 de inventario y
2 de insumo, y eso tiene que poder decirse.

**Dónde vive en la interfaz.** Un botón en la ficha del producto y —esto importa— **un botón en la
pantalla de captura de fórmula**, para cuando la estilista se da cuenta a media aplicación de que el
bote se acabó. Si hay que ir a inventario a registrar la apertura, no se registra nunca.

### 3.2 · Lo que esto evita

Sin F-155, un salón que compra 12 litros de shampoo al mes ve que "vendió 3 frascos" y que faltan 9
litros, y concluye que le están robando. **Casi nunca es robo: es el lavabo.** Ésa es la conversación
que se repite en todos los salones de México y es evitable con una tabla y un evento.

---

## 4 · QUÉ SE DESCUENTA, CUÁNDO Y CON QUÉ DISPARADOR

**Aquí está la decisión de inventario más importante del modelo, y separa a A3 de A1 y A2.**

| Qué | Cuándo baja | Disparador | Por qué ese momento |
|---|---|---|---|
| **Producto de reventa** | **Al cobrar** | Cierre del ticket, dentro de la transacción de cobro (F-102 tal cual) | Igual que en `abarrotes`. El frasco sale de la tienda cuando se paga. Sin cambios |
| **Producto de cabina** | **Al CERRAR EL SERVICIO** | Captura de la fórmula (F-154), en su propia transacción | **El tinte se consumió a las 10:35 y el cobro es a las 12:05.** Entre uno y otro la clienta puede irse sin pagar, puede haber un rehacer, o el ticket puede cancelarse — **y el tinte se gastó igual** |
| **Insumo fijo** (guantes, gorro, capa) | **Al cerrar el servicio** | Junto con la fórmula, por consumo estándar del servicio | Esto **sí** es receta fija y se puede explotar sola: un tinte lleva siempre un par de guantes. Es el único lugar donde F-129 aplica tal cual |
| **Merma de mezcla** | **Al cerrar el servicio** | Mismo formulario: "mezclé 90 g, usé 75" | Ver §6.1 |
| **Producto de rehacer** (F-444) | **Al cerrar el rehacer** | Igual, pero **el costo se imputa al servicio original** | Si se imputa al rehacer, el margen del servicio original sale falsamente bien y nadie detecta que ese servicio se rehace mucho |
| **Producto de cortesía** | **Al cerrar el servicio** | Igual, con el ticket en $0 | Consume producto de verdad. Si no baja, aparece como faltante y acusa a alguien |

### 4.1 · Por qué NO se descuenta al cobrar, y hay que defenderlo

Es la tentación obvia —una sola transacción, todo junto, como en restaurante— y es un error por
cuatro razones concretas:

1. **El momento físico es otro.** Dos horas de diferencia en el caso normal, y hasta cinco en un
   balayage.
2. **Un ticket cancelado no devuelve el tinte.** Si el consumo cuelga del cobro, cancelar el ticket
   revierte el movimiento y el tinte reaparece en el inventario. **Está en la cabeza de la clienta.**
3. **El rehacer y la cortesía no tienen cobro**, y consumen igual. Colgar el consumo del cobro los
   deja fuera del inventario por completo.
4. **La captura ocurre con guantes, junto al lavabo.** Es el único momento en que la estilista tiene
   el dato fresco. Pedirlo en la caja, dos horas después, es pedirle que se acuerde.

**La consecuencia técnica:** el consumo de cabina es una transacción propia con su propio comando
(`cerrarServicio`), idempotente por `cita_servicio_id`. Y el cobro **no** lo toca. Está en
`05-DATOS-Y-BACKEND.md` §4.

### 4.2 · Lo que cuesta esta decisión, y hay que decirlo

Cuesta que **si nadie cierra el servicio, el producto no baja nunca.** Ése es el descuadre 5 de
`02-DINERO-Y-CAJA.md` §10 y no tiene solución técnica: tiene solución de diseño (un toque) y de
transparencia (el corte confiesa cuántos servicios se cerraron sin fórmula). Fingir que el sistema lo
garantiza sería mentir.

---

## 5 · LA FÓRMULA CAPTURADA · F-154

**La función que define el inventario de este arquetipo.**

### 5.1 · Contra qué se compara

| `restaurante` (F-128/F-129) | Aquí (F-154) |
|---|---|
| La receta es **fija por producto** | **No hay receta fija.** Hay una **fórmula base** que es sugerencia |
| **Explota sola al cobrar** | **Se captura a mano al aplicar** |
| El consumo es **teórico** y el real se deduce por diferencia de conteo | El consumo es **real** y el teórico sirve para comparar |
| Si el cocinero se pasa, se ve en el conteo semanal | Si la estilista usa más, **se ve en el mismo servicio** |
| Una arrachera lleva 280 g. Siempre | Un retoque lleva 60 g o 110 g. **Nunca lo mismo** |

**Por qué no se puede fingir una receta fija.** Porque el color es el 80% del costo variable del
salón. Si el sistema asume 80 g siempre, en las cabezas largas falta producto que nadie explica y en
las cortas sobra, y **el margen del servicio —el número sobre el que se fijan los precios— queda
inservible**. Más vale un dato capturado a mano que un teórico preciso y falso.

### 5.2 · Cómo se captura, y por qué así

**La regla de diseño:** se captura **con guantes puestos, junto al lavabo, en menos de quince
segundos**, o no se captura. Todo lo demás se subordina a eso.

```
FÓRMULA · Ana Lucía Márquez · retoque de raíz · 14 mar

  ┌──────────────────────────────────────────────────────┐
  │  LA VEZ PASADA · 7 feb · Karla                       │
  │  6.0 ······ 60 g                                     │
  │  7.34 ····· 30 g                                     │
  │  ox 20 vol · 90 ml                                   │
  │  35 min de procesado                                 │
  │                                                      │
  │            [ ✓ REPETIR IGUAL ]                       │
  │            [   AJUSTAR       ]                       │
  └──────────────────────────────────────────────────────┘

  Mezclé  [ 90 ] g         Sobró y tiré  [ 15 ] g
  Costo estimado del material:  $ 118.40
     (con tu esquema, tu comisión sale de $832.00)      ← F-442
```

**Un toque en el 70% de los casos.** La clienta de color repite su fórmula durante años. El botón
REPETIR es lo que hace que esta función se use; sin él, es un formulario de seis campos que nadie
llena.

**El campo "sobró y tiré" no es opcional y no es un detalle.** Entre 10% y 20% de cada mezcla se va
al bote porque nadie sabe exactamente cuánto va a necesitar esa cabeza. Si no se registra ahí mismo,
aparece después como faltante de inventario y acusa a alguien injustamente. Preguntarlo en otro
momento es garantizar que no se conteste.

**El costo y el efecto en la comisión se muestran en el momento.** No al final del mes. Es lo que
hace que la estilista mezcle con cuidado, y funciona mucho mejor que cualquier regla.

### 5.3 · El triple efecto de una sola captura

```
                          ┌──→  EXPEDIENTE (F-434)   la fórmula queda en el historial
   una captura   ─────────┼──→  INVENTARIO (F-101)   tres movimientos de salida de cabina
   de 15 segundos         │                          + uno de merma
                          └──→  COSTO (F-130)        el costo de esa línea del ticket
```

**Si el sistema pide la fórmula para el expediente y aparte pide el consumo para el inventario, no va
a tener ninguno de los dos.** Ésta es la regla que hace realizable el módulo entero.

### 5.4 · La fórmula base del catálogo

Cada servicio de color puede llevar una **fórmula base** con cantidades típicas. **No explota sola.**
Sirve para tres cosas:

1. **Arrancar la captura** de una clienta nueva, que no tiene fórmula anterior.
2. **Costear el servicio al ponerle precio.** Si el tinte medio consume $145 y se cobra $800 con 50%
   de comisión, al salón le quedan $255 — y hay que saberlo antes de fijar el precio, no después.
3. **Comparar real contra teórico** (F-133 en otra clave): no para vigilar a la estilista, sino para
   saber si el precio está bien puesto. Si el consumo real promedio es 40% mayor que el teórico, el
   precio está mal, no la estilista.

---

## 6 · ENTRADAS Y SALIDAS

### 6.1 · Entradas

| Entrada | Frecuencia | Notas |
|---|---|---|
| **Compra al distribuidor** | 1–2 veces al mes | Tres o cuatro proveedores de producto profesional. Es el caso más fácil de compras del proyecto: sin ruta, sin canje, sin presentaciones. F-632 tal cual |
| **Compra de mostrador** | Cuando se acaba algo | Se va a la tienda de belleza de la esquina. Importa que la entrada sea de **dos campos y treinta segundos**, o se compra y no se captura |
| **Devolución de reventa** | Rara | La clienta devuelve el shampoo cerrado. Vuelve al anaquel |
| **Ajuste positivo** | Rara, con motivo | F-104 tal cual |
| **Traspaso entre sucursales** | Sólo en cadena | F-105 |
| **ABRIR** (anaquel → cabina) | **Diaria** | F-155 §3.1. Es la entrada más frecuente al almacén de cabina |

**Lo que NO hay y sí hay en otros modelos:** no hay recepción con canje (eso es `abarrotes` con
Bimbo), no hay orden de compra formal, no hay crédito de proveedor complicado, no hay doce
proveedores con doce ritmos. **El módulo de compras de este modelo se reutiliza tal cual y no lleva
una sola línea nueva.**

### 6.2 · Salidas

| Salida | De qué almacén | Disparador |
|---|---|---|
| **Venta de producto** | Anaquel | Cobro del ticket |
| **Consumo en servicio** | Cabina | **Cierre del servicio** con fórmula (F-154) |
| **Consumo de insumo fijo** (guantes, gorro) | Cabina | Cierre del servicio, por receta fija |
| **Merma de mezcla** | Cabina | Mismo formulario de la fórmula |
| **Merma por caducidad** | Cualquiera | Revisión o conteo. F-146 |
| **Merma por contaminación o secado** | Cabina | Detección |
| **Consumo en rehacer** (F-444) | Cabina | Cierre del rehacer, **costo al servicio original** |
| **Consumo en cortesía** | Cabina | Cierre del servicio, ticket en $0 |
| **Producto cargado a la profesional** (F-442) | Cabina | Cierre del servicio, si el esquema lo dice |
| **Producto usado por quien renta** (F-441) | Cabina | Se le factura aparte |
| **ABRIR** (salida de anaquel) | Anaquel | F-155 |
| **Diferencia de conteo** | Cualquiera | Conteo físico. **Motivo "diferencia de conteo", nunca "robo"** |

---

## 7 · CÓMO SE TOMA EL INVENTARIO FÍSICO

**Se reutiliza el motor de `abarrotes` (F-106/F-149) tal cual.** Lo que cambia es la cadencia, el
alcance y el método de conteo, y eso es configuración del motor, no código nuevo.

### 7.1 · Anaquel · mensual, quince minutos

Son 30 a 120 piezas en un mueble. Se cuentan piezas enteras, se compara contra esperado, se ajusta
con motivo. Idéntico a una papelería. **No hace falta conteo cíclico aquí**: la tienda entera cabe en
quince minutos.

### 7.2 · Cabina · semanal, y con un método propio

Aquí está la particularidad del giro y **es donde `abarrotes` no sirve de guía**.

Nadie va a pesar cuarenta tubos con una báscula. El conteo real de un salón es:

```
CONTEO DE CABINA · estante de color · lunes (cerrado)

  Tinte 6.0     cerrados [ 4 ]   abiertos [ 2 ]  ·  ¿cuánto queda en los abiertos?
                                                     ○ casi lleno   ● a la mitad   ○ poquito
  Tinte 7.34    cerrados [ 1 ]   abiertos [ 1 ]  ·  ● poquito
  Oxidante 20   cerrados [ 3 ]   abiertos [ 1 ]  ·  ○ a la mitad
  ...

  El sistema convierte:  cerrado = capacidad completa
                         casi lleno = 75%   ·   a la mitad = 50%   ·   poquito = 20%
```

**Por qué tres opciones y no un campo numérico.** Porque un campo numérico produce números
inventados con precisión falsa. Tres opciones producen un rango honesto y se contestan de un vistazo.
**El sistema tiene que tratar el resultado como estimación, no como conteo**, y por lo tanto:

- **La tolerancia es alta.** Una diferencia del 15% en cabina no genera alerta ni ajuste automático.
  En anaquel, una diferencia de 2 piezas sí.
- **El ajuste requiere confirmación explícita**, con el motivo "diferencia de conteo estimado".
- **La tendencia vale más que el número.** Si el estante de color lleva tres semanas con 20% de
  diferencia en la misma dirección, hay algo. Una semana no dice nada.

### 7.3 · Cuándo

**El lunes**, que es el día cerrado del giro. O el martes temprano, que es el día muerto. **Nunca el
sábado.** Un sistema que proponga contar en el pico está diseñado por alguien que nunca estuvo en un
salón.

---

## 8 · LAS MERMAS PROPIAS DEL GIRO

Cuatro motivos, y cada uno apunta a algo distinto. **Agruparlos en "merma" hace inútil el
indicador**, igual que en `abarrotes` §3.6.

| Motivo | Qué es | Cuánto pesa | Qué decisión dispara |
|---|---|---|---|
| **Mezcla sobrante** | Se mezclaron 90 g y se usaron 75 | **10%–20% de todo el consumo de color.** Es el grande y es estructural | Si una persona tira sistemáticamente el 30%, es capacitación, no robo. Si todas tiran 12%, es normal y hay que meterlo en el costeo del servicio |
| **Caducado** | El tinte tiene caducidad; el decolorante activado caduca en minutos | Bajo si se rota bien | Comprar menos de ese tono. Es el indicador de qué colores no se usan |
| **Secado o contaminado** | El bote que se quedó destapado, el oxidante que se contaminó | Bajo | Orden de trabajo. Es lo que se arregla con un frasco de bomba en vez de uno de tapa |
| **Diferencia de conteo** | Lo que no cuadró y no se explica | Debería ser bajo | **Nunca se llama "robo".** El motivo es neutro por diseño: acusar en un motivo de inventario es cómo se rompe un equipo de cinco personas |

**Y lo que NO es merma y hay que separarlo, porque si se mezcla el indicador miente:**

- **El producto del rehacer** (F-444). Es un costo de calidad imputado al servicio original.
- **El producto de la cortesía.** Es una decisión comercial de la dueña.
- **El producto que usa quien renta la estación** (F-441). Se le factura.
- **El shampoo del lavabo.** Es consumo normal de servicio, no merma. Si se registra como merma, el
  costo del lavado desaparece del servicio y el margen sale falsamente alto.

---

## 9 · ALERTAS

### 9.1 · Las que importan

| Alerta | Por qué | Urgencia |
|---|---|---|
| **Producto de cabina que no alcanza para lo agendado** | **La alerta estrella de A3, y sólo es posible porque hay agenda.** "Tienes 2 balayages agendados esta semana y oxidante 30 vol para 1" | **Alta. Es una cita en riesgo, no una venta perdida** |
| **Tono de color bajo mínimo** | El 6.0 y el 7.34 se acaban primero porque son los que todo el mundo usa | Media |
| **Producto de anaquel agotado** | Venta perdida, no cita cancelada | Baja |
| **Producto por caducar en 60 días** | F-146 | Media |
| **Servicios cerrados sin fórmula** | El inventario de cabina se está volviendo ficción | **Alta, y va en el corte con nombre** |
| **Diferencia de conteo sostenida tres semanas en la misma dirección** | La tendencia, no el dato suelto | Media |

### 9.2 · Las que serían ruido

- **Alerta de mínimo por cada uno de los 40 tonos de tinte.** Un salón tiene tonos que usa dos veces
  al año. Alertar de todos es enseñar a ignorar las alertas. **El mínimo sólo se pone en los tonos
  con rotación**, y el sistema los propone del historial.
- **Alerta de merma por servicio.** Que alguien haya tirado 18 g en un tinte no es un evento. Es la
  suma del mes la que dice algo.
- **Alerta de caducidad del producto de anaquel.** Un shampoo cerrado dura tres años.
- **Alerta de sobrestock.** No existe el problema en este giro: el producto no ocupa espacio caro y
  no caduca rápido.
- **Alerta de precio del proveedor.** Se compra a tres y se negocia una vez al año.

---

## 10 · LOS TRES ERRORES DE INVENTARIO QUE MÁS COMETE ESTE NEGOCIO

### Error 1 · No separar cabina de anaquel

**"El shampoo desaparece."** Es la frase, se dice en todos los salones, y casi nunca es robo. Se
compran 12 litros de shampoo profesional al mes, se venden 3 frascos, y faltan 9 litros. La dueña
concluye que le están robando y empieza a desconfiar de su gente, que es el daño de verdad.

**Lo que pasa es el lavabo.** Nueve litros en 400 lavados son 22 ml por lavado, que es exactamente lo
normal.

**Cómo lo resuelve el sistema:** F-155, dos almacenes, el evento ABRIR, y el consumo del lavado
imputado al servicio. En cuanto el shampoo de cabina baja por servicios cerrados, el número cuadra y
la conversación desaparece.

### Error 2 · Creer que el consumo de color se puede predecir

Es el error que cometen los sistemas, no los salones. Un salón sabe perfectamente que cada cabeza es
distinta; el software es el que asume una receta fija porque es más fácil de programar.

**El costo:** el inventario de cabina deja de cuadrar desde el primer mes, el margen del servicio sale
inventado, y **la dueña deja de mirar el módulo de inventario para siempre**. Un módulo que se deja
de mirar es un módulo que no existe.

**Cómo lo resuelve el sistema:** F-154, con el botón REPETIR que hace que capturar cueste un toque.
Es más trabajo para la estilista que una receta automática y **no hay alternativa honesta**. La
contrapartida es que esa captura vale por tres.

### Error 3 · Contar el tubo abierto como si fuera cero o como si fuera uno

El tercer error es de conteo y produce los dos extremos: quien cuenta sólo cerrados subvalúa el
inventario un 25% y compra de más; quien cuenta todo como entero lo sobrevalúa y se queda sin tinte a
media aplicación un sábado.

**Cómo lo resuelve el sistema:** el conteo de tres niveles del §7.2, con tolerancia alta y sin ajuste
automático. **La precisión falsa es peor que el rango honesto**, y en cabina la honestidad es
aceptar que se está estimando.

---

## 11 · LO QUE ESTE MODELO NO NECESITA DEL MÓDULO DE INVENTARIO

Se apaga en la plantilla, no se esconde.

1. **V3 presentaciones (F-112, F-120, F-121).** No hay venta en dos unidades. **Ojo: `veterinaria` sí
   la necesita.**
2. **V4 lote y trazabilidad (F-113, F-122, F-124).** El tinte tiene caducidad, no lote. F-146 basta.
3. **V5 número de serie.** Sólo si el salón vende planchas caras con garantía, y ahí es marginal.
4. **V7 producción por lote, V8 por proyecto, V9 consignación, V10 activos que vuelven.**
5. **Código de barras como vía de captura.** El catálogo son 120 artículos. Opcional para reventa.
6. **Báscula conectada (F-983).** Se usa una báscula de cocina de $300 para pesar el tinte y **el
   número se teclea**. Conectarla no vale la inversión a este tamaño. Si algún día se conecta, se
   hereda F-983 de `abarrotes` sin cambios.
7. **Conteo cíclico por zona (F-149).** El anaquel cabe en quince minutos. Se usa F-106 con alcance
   acotado, que es el mismo motor.
8. **Sugerencia de pedido con venta de 14 días.** Se compra una o dos veces al mes a tres
   proveedores. Basta la alerta de mínimo más la proyección contra agenda.
9. **Etiquetas de anaquel (F-058).** Son 120 artículos con precio estable.
10. **Merma por robo como motivo explícito.** Existe "diferencia de conteo" y es deliberado. Ver §8.
