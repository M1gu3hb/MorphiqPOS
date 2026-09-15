# 02 · DINERO Y CAJA · Cafetería de mostrador

**Éste es el archivo más importante de la carpeta.** Si el dinero no cuadra, nada de lo demás
importa. Todo lo que sigue se apoya en tres reglas de la Fase 1 que no se negocian en ningún
modelo: **bigint de centavos** (nunca flotantes), **precios y totales siempre en el servidor** (el
endpoint no acepta importes del cliente), y **las propinas nunca entran en ventas, utilidad, costo
ni margen**.

Y sobre esas tres, una regla que sólo aplica a este giro y que manda en todo el archivo:

> **Aquí se cobra antes de que el producto exista.** El dinero entra primero y la obligación de
> entregar nace después. Eso hace que, entre el cobro y la entrega, el negocio tenga un pasivo
> vivo: bebidas pagadas y no servidas. Un corte que cierra con pedidos sin entregar está cerrando
> sobre una deuda.

---

## 1 · QUÉ CUENTA COMO VENTA Y QUÉ NO

La venta de este negocio es **el pedido cobrado en el mostrador**. Ni un peso más.

| Concepto | ¿Es venta? | Tratamiento exacto |
|---|---|---|
| **Bebida, alimento y grano en bolsa** | **Sí** | Las tres familias del catálogo. Se registran en `ordenes.total_centavos`, que es el total real, sin propina. El grano en bolsa es venta igual que un latte, pero **no es la misma línea de negocio** y por eso el corte las separa: margen bruto del 45–65% contra 65–70%, sin merma, sin leche y sin ocupar barra. |
| **Propina** | **No** | Vive en `pagos`, separada de la venta. No toca ventas, utilidad, costo, inventario, receta ni margen. Ver §4. |
| **Descuento aplicado** | Resta | `ordenes.descuento_centavos`. Baja la venta y baja el margen. **No baja el costo**: el vaso y la leche se gastaron igual. |
| **Ahorro del combo** | Resta, y con nombre | El combo café + pan es la suma de sus partes **menos un descuento declarado** con su propia etiqueta (`descuento_combo`). No es un producto nuevo con precio propio. Así el corte puede contestar "¿cuánto regalé en combos este mes?", que es la pregunta real: en un negocio de 8% de utilidad neta, $10 de ahorro en 40 combos diarios son $12,000 al mes. |
| **Canje de sello (el 6º café gratis)** | **No es venta, y no es descuento** | Es **la cancelación de un pasivo**. Se registra como línea a precio cero con `motivo: 'canje_lealtad'`, sale del inventario, y **no entra al conteo de tickets ni al ticket promedio**. Si se registrara como venta $0, el ticket promedio caería solo y nadie entendería por qué; si se registrara como descuento del 100%, inflaría el renglón de descuentos y taparía los descuentos de verdad. Ver §10, descuadre 5. |
| **Consumo del personal** | **No es venta** | Diez a doce bebidas al día. Sale del stock con `tipo: 'personal'`, no entra a ventas, y aparece en su propia línea del corte. **F-261.** Hoy se registra como merma y arruina el único indicador que sirve para detectar robo. |
| **Cortesía al cliente** | **No es venta** | "Se te cayó, te hago otro". Mismo mecanismo, `tipo: 'cortesia'`. |
| **Bebida rehecha** | **No es venta** | El insumo se consume dos veces y se cobra una. Se registra con `tipo: 'reposicion'` en F-261 y su costo entra a la merma de barra (F-156), no al costo de ventas. Si entrara al costo de ventas, el margen del producto se vería mal cuando el problema es la operación. |
| **Pedido pagado y no recogido** | **Sí es venta** | El dinero entró y no se devuelve. Pero el pedido se marca `no_recogido` y **su costo de insumo es una pérdida operativa**, no un costo de venta cumplida. Aparece contado en el corte, con su importe, porque es el único sitio donde alguien lo va a ver. |
| **Venta por plataforma (Uber Eats, Rappi, DiDi)** | **Sí, por el importe bruto** | Y la comisión es **gasto**, nunca un descuento sobre la venta. Es la trampa más cara del giro: si se resta de la venta, el food cost se ve artificialmente peor y el dueño baja porciones para arreglar un problema que no existe. La comisión se calcula sobre el importe de plataforma, con IVA **sobre la comisión** (25% nominal = 29% efectivo), y se registra en la categoría de gasto `comision_plataforma`. |
| **Comisión de terminal bancaria** | **No resta de la venta. Es gasto** | 3.6% + IVA con Clip, 3.5% + IVA con Mercado Pago Point. Se estima al corte sobre el total cobrado con tarjeta y se concilia contra el estado de cuenta al mes. **Se estima y se dice que es estimación**, porque el cargo real llega días después. |
| **Anticipo por pedido anticipado (F-330)** | **Sí, al cobrar** | No es un anticipo contable: el pedido se paga completo al levantarlo y se entrega doce minutos después. Es venta del momento del cobro, aunque se entregue en el siguiente turno. |
| **Envío a domicilio propio** | **No aplica** | Café Jacaranda no reparte. Si repartiera, el envío entra como concepto propio, no como producto. |
| **Vales, monederos, cupones** | **No aplican hoy** | F-214 y F-204 no existen en esta plantilla. Cuando existan, un vale es **un método de pago**, no un descuento. |
| **Cancelación con motivo** | Sale de la venta | La venta cancelada no suma y aparece con su motivo, su usuario y su monto en la sección de Cancelaciones. |
| **Ticket en $0.00** | No es venta | Salvo el canje de sello, que sí es un $0.00 legítimo y lleva su marca. Los demás se depuran. |

**La prueba de que está bien:** el "Total ventas" del corte tiene que poder pegarse en la
declaración del mes sin restarle ni sumarle nada. Si para llegar al número real hay que restar
propinas, canjes de sello o comisiones, el sistema está mal.

---

## 2 · IMPUESTOS

- **IVA extraído**, tasa **16%**. El precio del pizarrón ya incluye el impuesto. Dice $45 y se
  cobran $45.
- **Por qué extraído.** Igual que en `restaurante`, y por la misma razón exacta: en México ningún
  menú de cafetería pone "+IVA". Se cita y no se vuelve a explicar (`restaurante/02-DINERO-Y-CAJA.md`
  §2). **F-011 va marcada `[=]`.**
- **Cómo se calcula.** Desde el total con impuesto incluido, hacia atrás:
  `impuestos = total − round(total / 1.16)`. Una sola vez, en centavos, en el servidor. Nunca por
  línea y después sumando: con tickets de $118 y cuarenta líneas por hora, las diferencias de
  centavos se acumulan rápido y un corte que no cuadra por $0.07 vale lo mismo que uno que no
  cuadra por $700.
- **El exento que aquí SÍ importa, y en restaurante no.** Los alimentos preparados para consumo en
  el lugar causan IVA al 16%. **El grano en bolsa sellada y la botella de agua cerrada son alimento
  no preparado y van a tasa 0%.** En un restaurante esto es un caso de borde que no vale la pena
  configurar; aquí es una línea de negocio entera con su propio margen. Por eso la plantilla
  `cafeteria` arranca con **tasa por producto habilitada** y con la familia "grano" preconfigurada
  al 0%, mientras que la plantilla `restaurante` arranca con todo al 16%.
- **Cómo se muestra.** En el ticket: subtotal, IVA desglosado, total. En la segunda pantalla al
  cliente: **sólo el total**. Un cliente en un mostrador con fila detrás no necesita ver el
  desglose fiscal; necesita ver cuánto es y decidir si deja propina.

---

## 3 · DESCUENTOS

| Pregunta | Respuesta de este negocio |
|---|---|
| **Quién puede darlos** | Administrador siempre. El **barista** tiene tope, y esto es distinto de `restaurante`, donde el mesero no descuenta nada: aquí el barista **es** el cajero y tiene que poder resolver un "se me cayó" sin llamar a nadie. |
| **Hasta cuánto** | Barista: hasta **$25 por línea** o el 20% del ticket, lo que sea menor. Administrador: sin tope. **El tope es en pesos, no en porcentaje**, porque sobre un ticket de $118 un porcentaje no significa nada y en cambio "$25" es exactamente el precio de una bebida — que es la unidad real en la que se piensa el perdón en un mostrador. |
| **Requieren autorización** | Por encima del tope, PIN de administrador (F-205), y el PIN queda en la bitácora. |
| **Cómo afectan el margen** | El descuento baja la venta y no baja el costo. Con food cost de 32%, un 20% de descuento lo deja en 40%. En un negocio de 8% de utilidad neta eso se come el día. |
| **Por línea o por total** | Ambos (F-202, F-203). Por línea para la bebida de disculpa; por total para el descuento de estudiante o de vecino. |
| **El descuento recurrente del giro** | El "descuento de la casa" al cliente frecuente, que en una cafetería de barrio se da diez veces al día. **Debe convertirse en sellos (F-930), no en descuentos.** Es la conversión más rentable que este sistema le puede proponer a la dueña: lo que hoy regala sin registro se vuelve un programa que mide, retiene y se puede apagar. |

**El descuento es la puerta de robo más silenciosa del giro, y aquí más que en restaurante**,
porque el volumen es alto y el importe bajo: nadie audita un descuento de $18. Por eso: tope en
pesos por rol, autorización con PIN por encima del tope, y la línea de descuentos **agrupada por
quién los aplicó y por hora** en el corte. Sin las tres, el descuento no debería estar encendido.

---

## 4 · PROPINAS

**Variante F-241 · V2 sugerida al cobrar**, con dos deltas propios: **F-249** (la elige el cliente
en su propia pantalla) y **F-248** (va al bote del turno y se reparte por horas).

### 4.1 · La regla de fondo

> La propina **no es ingreso de la cafetería**. Nunca afecta ventas, utilidad, costos, inventario,
> recetas ni margen. Pasa por la caja porque el cliente la paga con la tarjeta, no porque sea del
> negocio.

Es la ley: **artículo 346 de la Ley Federal del Trabajo** — las propinas son parte del salario del
trabajador y el patrón no puede retenerlas ni quedarse un porcentaje "por administración". Y
Profeco ha sido explícita en que la propina es **voluntaria** y no puede cobrarse de forma
automática; en 2026 emitió alerta nacional porque algunos negocios agregaban un 15% de "servicio".

**Consecuencia directa en la pantalla, y es más fuerte aquí que en restaurante:** en un mostrador,
quien pide la propina está a cuarenta centímetros del cliente y lo está mirando. Por eso:

1. **La propina la elige el cliente en la segunda pantalla (F-249), no el barista.** El barista no
   toca el importe de propina nunca. No es cortesía: es que la propina la pide una pantalla, no una
   persona, y eso es lo que la mantiene voluntaria de verdad.
2. **"Sin propina" tiene el mismo peso visual que las demás opciones.** No es un enlace chiquito
   abajo a la izquierda. Está en la fila, del mismo tamaño.
3. **Se sugiere en pesos, no en porcentaje.** Ver 4.3.

### 4.2 · Quién la recibe · el bote del turno

**Nadie en particular. Es del turno.**

En `restaurante` la propina se atribuye al mesero que atendió la mesa, y sin eso no hay
liquidación posible. Aquí no hay "el que atendió": hay dos personas que se turnan la caja y la
máquina cada tres bebidas. Atribuirle la propina a quien tecleó el cobro sería premiar a quien
estuvo en la caja en la ráfaga y castigar a quien estuvo vaporizando, que es el trabajo duro.

**El bote tiene dos mitades físicas y hay que decirlo porque cambia cómo se cuenta:**

| Mitad | Dónde está | Cómo se cuenta |
|---|---|---|
| **Propina en efectivo** | En un bote de vidrio sobre la barra, o en el cajón | Se cuenta a mano al corte. **Se compara contra `propina_efectivo_centavos` del sistema.** Si no coincide, alguien sacó o metió, y eso es el descuadre 1 de este giro |
| **Propina de tarjeta y transferencia** | En el banco. No está en el local | Sale del sistema, exacto, por método. Se paga **de la caja** ese mismo turno, y por eso genera un movimiento de salida del cajón |

**La consecuencia de esas dos mitades:** al repartir el bote, el dinero de tarjeta sale del efectivo
del negocio. Si el cajón no tiene suficiente, la liquidación se difiere y **eso queda registrado**,
porque una propina de tarjeta que se debe es exactamente el tipo de cosa por la que se va un
barista.

### 4.3 · Cómo se decide · un momento, una persona

| Momento | Quién | `propina_tipo` | `propina_origen` |
|---|---|---|---|
| Al cobrar, en la segunda pantalla | **El cliente**, con su dedo | `monto_sugerido` \| `monto_manual` \| `sin_propina` | `cliente_pantalla` |
| Al cobrar, sin segunda pantalla (respaldo) | El barista, preguntando en voz alta | mismos valores | `barista` |

**Los estados `decidir_en_caja` y `pendiente_cliente` de `restaurante` no existen en esta
plantilla.** No hay a quién delegar ni momento posterior al que diferir. El servidor los rechaza
para `giro = 'cafeteria'`, y eso no es una restricción de pantalla: es una regla de modelo, porque
una venta de mostrador con propina pendiente sería una venta que no se puede cerrar y no hay
ninguna pantalla donde cerrarla después.

**Los importes sugeridos, y por qué en pesos.** Por omisión **$5, $10 y $15**, más "Otro" y "Sin
propina". Configurable, máximo cinco valores.

El estándar mexicano de restaurante es 10–15%. **En mostrador no aplica y sugerirlo hace daño.**
Sobre un ticket de $118, un 15% son $17.70: nadie deja $17.70 en una barra, y una pantalla que lo
propone se lee como una máquina pidiendo. La práctica real del giro es el monto redondo —$5, $10,
$20— y ofrecerlo así sube la propina total porque la gente sí toca un botón que dice $10. Un
botón que dice "18%" es el que hace que el cliente busque "Sin propina" sin leer las demás
opciones, y a partir de ahí no vuelve a mirar la pantalla nunca.

**Sobre el ticket de plataforma no se pide propina.** La plataforma ya la pidió.

### 4.4 · El desglose exacto por método

**Idéntico a `restaurante` (F-245). No se vuelve a construir.** `desgloseMetodosPagoExacto()` de
`heredado/utils/tipsUtils.js` se reutiliza intacto: la propina nunca se reparte proporcionalmente,
ni aquí ni en ningún giro.

Lo que cambia es **cuándo se abre el diálogo de desglose**: en `restaurante` es el caso raro del
pago mixto de la cena. Aquí el pago mixto es aún más raro —un ticket de $118 no se paga entre
tarjeta y efectivo— así que el diálogo prácticamente nunca aparece, y cuando aparece es en el
pedido de oficina de $780. **La regla es la misma; la frecuencia es otra.**

Y es exacto por una razón operativa muy concreta de este giro: al corte hay que comparar el bote
físico de vidrio contra `propina_efectivo_centavos`. Si la propina de una venta mixta se repartiera
proporcionalmente, el bote nunca cuadraría y el descuadre 1 dejaría de ser detectable.

### 4.5 · Cómo se liquida · F-248, reparto por horas presentes

Al **corte de turno**, en efectivo, delante de quienes estuvieron. No a la quincena.

```
BOTE DEL TURNO MATUTINO · 06:00 – 14:30
  Efectivo contado en el bote .................... $  412.00
  Propina de tarjeta del turno ................... $  688.00
  Propina de transferencia del turno ............. $   35.00
  ────────────────────────────────────────────────────────────
  TOTAL A REPARTIR ............................... $ 1,135.00

  Presencias del turno
    Ana ...... 06:00 → 14:30 ....  8.5 h ....  58.6% .... $  665.11
    Beto ..... 07:30 → 14:30 ....  7.0 h ....  41.4% .... $  469.89
  ────────────────────────────────────────────────────────────
                                  15.5 h .... 100.0% .... $ 1,135.00
                                          el redondeo va a Ana
```

**Reglas del reparto:**

1. **La base es la hora presente, no el turno completo.** Quien entró a las 7:30 no cobra como
   quien abrió a las 6:00. Es el único reparto que en un equipo de dos o tres nadie discute.
2. **Las presencias se registran al entrar y al salir con el PIN**, en la misma sesión de caja.
   No es un reloj checador (F-960): es la semilla de uno, y se declara así.
3. **La fracción de redondeo va a quien más horas tuvo**, y queda escrito en el documento de
   liquidación. Un centavo sin dueño es una discusión.
4. **La liquidación se congela**: se guarda la fórmula usada, las horas de cada quien y el importe.
   Cambiar la regla el mes que viene no puede reescribir el reparto de hoy.
5. **Si el cajón no alcanza para pagar la propina de tarjeta**, la liquidación se marca
   `parcial` con el saldo pendiente por persona, y ese saldo aparece en el corte del turno
   siguiente hasta que se paga. No se esconde.
6. **La propina del dueño.** Si la dueña estuvo en barra, entra al reparto como una persona más.
   Si no estuvo, no entra. Esto es LFT 346 aplicada: la propina es de quien atiende.

### 4.6 · Por qué no F-242 (reparto por puntos)

F-242 pondera por puesto: mesero 3 puntos, garrotero 2, cocina 1.5, lavaloza 1. Tiene sentido en un
restaurante de quince empleados con funciones separadas. **En una barra de dos personas que hacen
exactamente lo mismo, ponderar por puesto es inventar una jerarquía que no existe** y crear el
pleito que se quería evitar. Por eso esta plantilla usa F-248 y deja F-242 apagada, aunque la tabla
`liquidacion_propina_beneficiarios` que `restaurante` propuso se reutiliza tal cual.

---

## 5 · MÉTODOS DE PAGO

| Método | Uso real en este giro | Notas |
|---|---|---|
| **Efectivo** | **~45–55% de los tickets**, concentrado en la ráfaga de la mañana | El dato nacional lo respalda: cerca del **85% de las transacciones menores a $500** siguen siendo en efectivo, y el ticket de cafetería ($80–$212) cae de lleno ahí. Es también el método que obliga al arqueo y el que crea el problema del cambio (§8.3). |
| **Tarjeta** | **~40–50%**, y sube después de las 10:00 y en fin de semana | Aquí llega la mayor parte de la propina. **Y aquí se va la comisión: 3.6% + IVA.** La terminal no está integrada (F-987 pendiente): el barista teclea el monto en la Clip y el total en el POS, dos veces. Es la fuente de error más frecuente del cobro. |
| **Transferencia** | **~3–7%** y creciendo | SPEI desde el teléfono, sobre todo en el pedido de oficina. Se registra como método propio. Tiene una trampa del giro: el cliente enseña la pantalla del "enviado" y se va, y el dinero llega —o no— diez minutos después. Por eso el dashboard tiene la línea de transferencia y por eso hay que verificar antes de cerrar. |
| **Mixto** | **<2%** | Casi no existe con tickets de $118. Cuando aparece es el pedido de oficina. |
| **Plataforma** | **~6% de las órdenes**, cuando la hay | No es un método de pago: es un **canal**. El dinero llega por depósito semanal de la plataforma, no por el cajón. Por eso no entra al arqueo y por eso tiene su propia conciliación. |

**El más común es el efectivo por número de tickets; la tarjeta por monto**, igual que en
restaurante — pero con una consecuencia distinta: aquí el cajón se llena de billetes chicos y se
vacía de monedas. Lo que descuadra una cafetería no es la falta de dinero: es la falta de cambio.

**Gastos**: se pagan en efectivo, tarjeta o transferencia. Un gasto en efectivo **sale del cajón**
y por eso el comando escribe el gasto **y** el movimiento de caja en la misma transacción.
Idéntico a `restaurante`.

---

## 6 · ANTICIPOS Y CRÉDITO

**No aplican, y decirlo es parte de la definición del modelo.**

- **Anticipos:** no existen. El pedido anticipado (F-330) se cobra completo al levantarlo; no es un
  anticipo, es una venta con entrega diferida doce minutos. Si algún día se vendieran cafeterías
  para eventos, eso es `catering-banquetes` (A5+A7), no esto.
- **Crédito:** nadie se lleva un café fiado. Y hay una tentación real que hay que nombrar para
  cerrarla: **la cuenta mensual de la oficina de al lado** —"nos mandas ocho cafés diarios y te
  pagamos a fin de mes"—. Existe, y es crédito (F-610…F-618). **No entra en esta plantilla.** Un
  negocio con 8% de utilidad neta y $90,000 de costo fijo mensual no puede financiar a nadie, y
  darle la herramienta es facilitarle una mala decisión. Cuando se documente `fonda-cocina-economica`
  —que sí vive de fiar al cliente frecuente— ahí se construye, y si alguna cafetería lo pide, se
  enciende con la perilla y se cobra aparte.
- **Consecuencia de pantalla:** en la caja de esta plantilla **no hay** botón de "a crédito", ni
  columna de saldo, ni sección de cuentas por cobrar. La tabla `clientes` tiene las columnas
  `saldo_pendiente_centavos` y `limite_credito_centavos` desde la migración 002, y en esta
  plantilla **no se exponen en el puente**. Una columna que existe en la base y no en la pantalla
  no hace daño; una sección vacía llamada "Crédito" sí.

---

## 7 · COMISIONES

**No hay comisiones al personal en este modelo.** Al barista no se le comisiona: se le paga sueldo
—$6,000 a $10,000 al mes según plaza— y le toca su parte del bote. La distinción propina/comisión
de `restaurante/02-DINERO-Y-CAJA.md` §7 aplica íntegra y no se repite.

**Pero sí hay dos comisiones que el negocio PAGA, y son el segundo gasto variable después del
insumo.** Ninguna aparece en ningún punto de venta del mercado mexicano y las dos van al corte:

| Comisión | Base | Cuándo se causa | Cuánto |
|---|---|---|---|
| **Terminal bancaria** | Total cobrado con tarjeta, propina incluida | En cada cobro; el cargo real llega al corte bancario | **3.6% + IVA** (Clip) o **3.5% + IVA** (Mercado Pago Point). Rango de mercado 2–4% |
| **Plataforma de reparto** | Importe bruto del pedido de plataforma | Al liquidar la plataforma, semanal | **18% a 30% nominal**, y el **IVA va sobre la comisión**: 25% nominal es **29% efectivo**. Con promociones subsidiadas y empaque, el costo real supera el 40% del ticket |

**La regla que evita el error de lectura más caro del giro:** la comisión **es gasto, no descuento
sobre la venta**. Un pedido de plataforma de $300 con 25% de comisión se registra como venta de
$300 y gasto de $87 ($75 + $12 de IVA). Si se registrara como venta de $213, el food cost del
pedido se vería en 45% en vez de 32%, y la dueña bajaría gramaje de café para arreglar algo que no
está roto.

**En el corte, la comisión de terminal es una estimación y se rotula como tal.** Se calcula sobre
el total de tarjeta del turno con la tasa configurada, y en Registros hay una conciliación mensual
contra el depósito real. Presentarla como un dato exacto sería mentir; no presentarla es esconder
$4,200 al mes.

---

## 8 · LA CAJA DE ESTE NEGOCIO

### 8.1 · Cuántas hay

**Una entre semana. Dos el fin de semana y en temporada** (diciembre, mayo). La segunda terminal
se abre en el otro extremo de la barra, con **su propio fondo, su propio arqueo y su propio corte**,
y las dos pertenecen al mismo turno.

Esto es lo contrario de `restaurante`, que declara una sola caja física por diseño. La razón es
puramente de volumen y de forma de la fila: 220 tickets el sábado concentrados en cinco horas, con
una fila lineal contra un mostrador de cuatro metros, se atienden partiendo la fila en dos. No hay
otra forma: una segunda persona cobrando en la misma terminal no acelera nada, porque el cuello de
botella es la terminal, no las manos.

**Regla que lo hace cuadrar:** cada sesión de caja tiene su propio arqueo y su propio esperado. El
**bote de propina, en cambio, es uno solo del turno** y se reparte junto. Mezclar las dos cosas
—dos cajones, un bote— es correcto y hay que decirlo explícitamente, porque el impulso natural es
partir también el bote y eso sería injusto: quien estuvo en la caja 2, en el rincón, recibe menos
propina por estar más lejos de la puerta.

### 8.2 · Cómo se abre

```
ABRIR TURNO
  ┌──────────────────────────────────────────────────────┐
  │  Fondo contado *                                     │
  │    Monedas ($1, $2, $5, $10) ......  [ $   380.00 ]  │
  │    Billetes de $20 y $50 ..........  [ $   420.00 ]  │
  │    Billetes de $100 y más .........  [ $   200.00 ]  │
  │    ───────────────────────────────────────────────   │
  │    TOTAL ..........................    $ 1,000.00    │
  │                                                      │
  │  Notas de apertura (opcional)       [ .............. ]│
  └──────────────────────────────────────────────────────┘
```

**Por qué el desglose por denominación y no un importe global, que es lo que hace `restaurante`.**
Porque en esta operación **el problema no es cuánto dinero hay: es de qué tipo**. Ciento sesenta
tickets de $118 pagados con billetes de $200 y $500 entre las siete y las once agotan las monedas
antes de las nueve. Un fondo de $1,000 todo en billetes de $100 es un fondo inútil. Al capturarlo
desglosado, el sistema puede avisar a las 8:40 *"te quedan $180 en cambio"* — que es el indicador
exclusivo de este giro y el que evita perder media ráfaga.

El fondo típico es de **$800 a $1,200**, no de $1,500. Ticket bajo, mucho cambio.

**Nada se puede cobrar sin turno abierto.** La pantalla de cobro se bloquea entera. Idéntico a
`restaurante` y por la misma razón: un cobro sin sesión de caja es un peso que no pertenece a
ningún corte.

### 8.3 · Qué movimientos tiene

| Movimiento | Quién | Efecto en el cajón |
|---|---|---|
| **Apertura con fondo** | Barista de apertura | + fondo, desglosado |
| **Cobro en efectivo** | Barista | + venta + propina en efectivo |
| **Cobro con tarjeta / transferencia** | Barista | **cero**. El dinero no pasa por el cajón |
| **Entrada de cambio** ← **propio de este giro** | Barista o dueña | + monto, **con desglose por denominación**. Es el movimiento más frecuente de la mañana: se trae cambio del banco, de la tienda de al lado o de la bolsa de alguien |
| **Retiro por seguridad** | Dueña | − monto. La caja está en la barra, a la vista de la calle. Se retira arriba de $6,000 |
| **Gasto en efectivo** | Dueña o barista | − monto. Gasto y movimiento en la misma transacción |
| **Liquidación del bote en efectivo** | Al corte de turno | − monto. Sale del cajón hacia las personas del turno |
| **Corte de turno** | Barista saliente | Cuenta, entrega, reparte el bote. **Cierra su sesión** |
| **Cierre del día** | Dueña o barista de cierre | Es el corte del turno vespertino. Deja el fondo de mañana |

**Los gastos del día en una cafetería son chicos y constantes:** la leche que faltó, el hielo, la
bolsa de azúcar, el plomero, el garrafón. Categorías vivas: insumo de emergencia, servicios,
limpieza, mantenimiento de equipo (la espresso necesita servicio cada 3–6 meses y es caro),
**comisión de terminal**, **comisión de plataforma**, marketing, otro.

### 8.4 · Por qué aquí el corte de turno SÍ cierra la caja

Ésta es una diferencia de fondo con `restaurante` y conviene mirarla de frente, porque la
estructura de datos es la misma y la regla operativa es la contraria.

En `restaurante` el corte de turno **no cierra** la sesión, porque hay dos turnos de mesero y **un
solo cajón**: cerrar partiría el día en dos cortes y haría imposible contestar "¿cuánto se vendió
hoy?" con un documento.

En una cafetería **los dos turnos son dos operaciones distintas**: el matutino vende 130 tickets de
ráfaga con casi todo para llevar, y el vespertino vende 50 tickets de permanencia. Cada uno tiene
su propio bote, su propio barista responsable y su propio arqueo. Por eso aquí el turno **sí**
cierra su sesión, se cuenta el cajón dos veces al día, y **hay dos cortes con folio propio**.

"¿Cuánto se vendió hoy?" se contesta en Registros, sumando los dos cortes del día — y eso no es una
concesión: **es que la pregunta de verdad de una cafetería es "¿cómo fue la mañana?", no "¿cómo fue
el día?"**. La mañana es el 60–70% de la venta y es la única franja que se puede comparar con
sentido contra la semana pasada.

### 8.5 · El arqueo, a ciegas, siempre

```
1.  El sistema pide:  Efectivo contado físicamente *   [  $ ____  ]
                      Bote de propina contado *        [  $ ____  ]   ← DOS conteos
2.  La persona cuenta el cajón y el bote, y teclea.
3.  HASTA ENTONCES aparecen los dos esperados y las dos diferencias.
```

**Dos conteos, no uno.** Es la única diferencia con el arqueo de `restaurante`, y no es cosmética:
el bote de propina es un recipiente físico separado del cajón, con su propio esperado
(`propina_efectivo_centavos` del turno) y su propia diferencia. Contarlos juntos hace imposible
saber si el faltante salió del negocio o del personal — y son dos problemas completamente
distintos, con dos conversaciones completamente distintas.

**El esperado lo calcula el servidor**, y es *fondo + entradas − salidas*, no "ventas en efectivo".
Regla 2 de `04-SISTEMA-DE-DISENO.md` §5, idéntica en los 78.

### 8.6 · La regla que salva el cierre

**No se puede cerrar el turno con pedidos sin entregar.** Es **F-262** aplicada a este giro: donde
`restaurante` busca mesas con cuenta viva, aquí se buscan pedidos en la fila de barra en estado
`en_fila`, `preparando` o `listo`. Si los hay, se abre un diálogo con la lista —nombre, hora de
cobro, minutos esperando— y no deja continuar. Hay tres salidas y sólo tres: entregarlo, marcarlo
**no recogido** con su pérdida, o devolverlo.

Se verifica **dos veces**, antes de abrir el diálogo y justo antes de ejecutar, por la misma
carrera que en `restaurante`: en los dos minutos que tarda el conteo alguien puede cobrar un café.

---

## 9 · EL CORTE Y SU PDF

### 9.1 · Qué contesta el corte de ESTE negocio

> **¿Cuadró la caja, cuánto se fue en leche, café y vaso, y cuánto hay en el bote del turno?**

Esas tres preguntas, en ese orden. Todo lo que no ayude a contestarlas es relleno.

Es un documento distinto al de `restaurante`, que contesta *"¿cuadró la caja y cuánto le toca a
cada mesero?"*. Aquí el reparto ocupa cinco renglones —son dos personas— y el consumo de insumo
ocupa media hoja, porque el negocio se gana o se pierde en la leche.

### 9.2 · Qué NO lleva el corte de una cafetería

- **Nada de mesas, meseros ni ocupación.** No existen.
- **Nada de crédito, cartera ni saldos.**
- **Nada de comisiones al personal.** No existen.
- **Ninguna tabla de propinas por persona con nombre y apellido.** El bote es del turno y su
  reparto es una tabla de dos filas, no una sección.
- **Ninguna sección en cero.** Si no hubo plataforma, la sección de canal enseña dos filas en vez
  de tres. Si no hubo cancelaciones, la sección no aparece. Una sección "Plataforma: $0.00" en una
  cafetería que nunca ha entrado a Rappi hace dudar de todo el documento.

### 9.3 · El PDF, sección por sección, en orden

Documento tamaño carta / A4 vertical, 210 mm, margen de 14 mm. Se genera del lado del cliente
sobre el nodo `#cash-cut-pdf-document` y **se descarga solo** al cerrar el turno, salvo que la
perilla esté apagada. Se emite **dos veces al día**, uno por turno, cada uno con su folio.

---

**1 · ENCABEZADO**
Logo (80×80), nombre, dirección, teléfono, correo a la izquierda. A la derecha, en negritas:
**CORTE DE TURNO**, el turno (*Matutino 06:00–14:30* o *Vespertino 13:30–20:30*), el **folio**, y
la marca de la plataforma.
*Por qué dice el turno y no la fecha en el título:* porque hay dos por día y el primer error de
archivo es confundirlos. La fecha va debajo.

**2 · DATOS DEL CORTE**
Rejilla de dos columnas: Apertura · Cierre · Quién abrió · Quién cerró · Terminal (caja 1 o 2) ·
Estado · Notas de apertura · Notas de cierre.
*Por qué lleva terminal aquí y `restaurante` no:* porque el sábado hay dos cortes del mismo turno y
sin la terminal no se sabe cuál es cuál.

**3 · APERTURA, FONDO Y CAMBIO** — ocho celdas
Fondo esperado · Fondo contado, **desglosado en monedas / chicos / grandes** · **Diferencia de
apertura** · Entradas de cambio del turno · Efectivo contado al cierre · **Diferencia de efectivo**
· **Dinero dejado en caja** (negritas) · **Cambio dejado** (negritas, desglosado).
*Por qué el cambio va en negritas y aparte del dinero:* porque el turno de la mañana abre a las
seis y si no le dejaron monedas, la ráfaga se pierde. "Dejé $1,000" y "dejé $1,000 todo en billetes
de $200" son dos mensajes distintos y el segundo es el que importa. Ninguna otra plantilla de las
78 necesita esta celda.

**4 · RESUMEN FINANCIERO (SIN PROPINAS)** — rejilla de tres columnas
Total ventas (negritas) · Nº de tickets · Ticket promedio · **Bebidas vendidas** · Efectivo ·
Tarjeta · Transferencia · **Comisión estimada de terminal** · Costo de ventas · Utilidad bruta ·
Margen promedio · Gastos operativos · Utilidad neta estimada (negritas).
*Por qué "bebidas vendidas" además de "tickets":* porque el ticket promedio de una cafetería sube
por **más bebidas por ticket**, no por bebidas más caras. Reformanda, una de las cafeterías más
conocidas de Xalapa, hace 100–120 tickets con 3–4 bebidas cada uno; una cafetería de barrio hace 80
tickets con 1.4. Ese cociente es el que dice si el equipo está ofreciendo.
*Por qué la comisión de terminal está aquí y no en gastos:* porque es proporcional a la venta, no
un gasto del día. Va rotulada **(estimada)** y se concilia al mes.

**5 · BEBIDAS POR CANAL** — tabla de tres o cuatro filas
Canal · Pedidos · Importe · **Empaque consumido** · % del total.
Filas: **En taza** · **Para llevar** · **Plataforma** (sólo si hubo) · **Anticipado** (sólo si hubo).
*Por qué existe y por qué tan arriba:* dispara dos decisiones de golpe. La primera, cuántos vasos
pedir esta semana — y es la única forma de saberlo, porque hoy se pide "a ojo" y se acaban el
viernes. La segunda, si la plataforma vale la pena: al lado de su importe está su comisión, y la
resta se hace sola. **Es la sección que ningún corte del mercado mexicano trae.**

**6 · MÉTODOS DE PAGO — VENTAS, PROPINAS Y TOTAL** — tabla, sólo si hubo propinas
Cuatro columnas: Método · Ventas · **Propinas** · Total. Filas de efectivo, tarjeta y
transferencia, más TOTAL.
*Por qué existe:* es la tabla que concilia el mundo real con el contable. "Ventas" es lo que se
declara; "Total" es lo que físicamente entró por cada medio. Cuando se cuadra el voucher de la
Clip, se usa la columna "Total". Idéntica a `restaurante` en estructura y se cita como tal.

**7 · BOTE DEL TURNO Y SU REPARTO** — tres celdas + tabla de dos a cuatro filas
Bote contado (efectivo) · **Diferencia del bote** · Propina de tarjeta y transferencia · **Total a
repartir** (negritas). Debajo: Persona · Horas presentes · % · Importe.
*Por qué la diferencia del bote es su propia celda:* porque es el descuadre 1 de este giro y
esconderlo dentro del arqueo general lo haría invisible. Un bote que falta $60 no es un problema de
caja: es un problema entre personas, y tiene que verse aparte.
*Por qué lleva las horas:* porque el reparto tiene que poder defenderse solo, sin que nadie
explique la fórmula. El documento es el argumento.

**8 · DETALLE DE VENTAS (n)** — tabla
Folio · Hora · **Nombre del pedido** · **Canal** · Productos · Total · Pago.
*Por qué "nombre del pedido" y no "mesa":* porque es lo único que se recuerda. La dueña revisa este
listado buscando "el de Mariana de las nueve y media", no el folio 4821. Es el equivalente exacto
de la columna "mesa" de `restaurante`, y viene del mismo razonamiento aplicado a otra operación.

**9 · PRODUCTOS VENDIDOS** — tabla agregada
Producto · **Modificadores más usados** · Unidades · Total · Costo · Utilidad.
*Por qué la columna de modificadores:* porque "Latte · 84 unidades" no dice nada, y "Latte · 84
unidades, de las cuales 31 con leche de avena" dice cuánta leche de avena pedir y por qué el costo
de esa línea subió. Es la columna que convierte el modificador en información.
**Ordenada por utilidad, no por unidades.** El latte vende más; el americano deja más.

**10 · INSUMOS CONSUMIDOS** — tabla, encabezada siempre por café y leche
Insumo · Cantidad teórica · Unidad · Costo unitario · Costo total.
El orden es fijo y no se ordena por importe: **1) café en grano, 2) leche por tipo, 3) el resto de
ingredientes, 4) empaque en su propia sub-tabla.**
*Por qué el orden es fijo:* porque el orden del documento es el orden en que se lee, y lo que se
lee primero es lo que se revisa. Café y leche son los dos insumos que se cuentan a diario y los dos
que se fugan. Si el documento los ordenara por costo, algún día el pan quedaría arriba y la leche
dejaría de mirarse.
*Por qué el empaque va en su propia sub-tabla:* porque no es un ingrediente, es un consumible con
otra lógica de compra (se pide por millar, cada dos o tres semanas) y otra pregunta: no "¿cuánto
costó?" sino "¿cuántos me quedan?".

**11 · MERMA DE BARRA DEL TURNO** — tabla, sólo si hubo
Motivo · Insumo · Cantidad · Costo. Con las cuatro filas tipadas: **calibración · vaporizado
sobrante · bebida rehecha · caducidad de leche**, y un total.
*Por qué es su propia sección y no una línea del consumo:* porque es la única parte del documento
donde el número **no debería crecer**. Todo lo demás del corte sube cuando el negocio va bien;
esto no. Ponerlo mezclado con el consumo haría que un mal día pareciera un buen día.
*Y por qué la calibración aparece aunque sea normal:* porque $22 a $36 diarios son $700 al mes, y
verlo todos los días es lo que hace que alguien pregunte si cinco shots son necesarios o si el
molino está mal.

**12 · CONSUMO DEL PERSONAL Y CORTESÍAS** — tabla, sólo si hubo
Tipo · Producto · Cantidad · Costo · Quién lo autorizó.
*Por qué separado de la merma:* porque tiene explicación. Diez bebidas de personal al día son
$5,700 al mes y **está bien** que existan: es parte de trabajar ahí. Lo que no está bien es que se
confundan con merma, porque entonces el indicador de merma —que es la alarma de robo— deja de
servir. Separarlas es lo que hace que las dos signifiquen algo.

**13 · SELLOS Y CANJES** — tres celdas, sólo si el programa está activo
Sellos otorgados en el turno · Canjes del turno (unidades y costo) · **Sellos pendientes de canje
en todo el programa** (negritas) y su **costo si se canjearan todos**.
*Por qué en el corte y no sólo en Clientes:* porque es un pasivo que crece solo y nadie va a
abrir una pantalla a buscarlo. Si un día dice "1,840 sellos pendientes · $4,100 si se canjean
todos", la dueña sabe exactamente qué tan cara le está saliendo la promoción, que es una pregunta
que hoy no puede ni formular.

**14 · GASTOS OPERATIVOS** — tabla, sólo si hubo
Categoría · Descripción · Pago · Monto.

**15 · INVENTARIO BAJO / CRÍTICO** — tabla, sólo si hay alertas
Insumo · Existencia · **Días que alcanza** · Estado · Recomendación.
*Por qué "días que alcanza" y no "stock mínimo", que es lo que enseña `restaurante`:* porque la
leche no se mide contra un mínimo, se mide contra la siguiente entrega. "Quedan 12 litros" no
dispara nada; "quedan 12 litros, alcanzan para mañana y el proveedor viene el viernes" dispara una
ida al súper. El cálculo usa el consumo teórico promedio de los últimos siete días del mismo día de
la semana, porque un martes no consume como un sábado.

**16 · CANCELACIONES Y NO RECOGIDOS** — tabla, sólo si hubo
Folio · Tipo (cancelación / devolución / **no recogido**) · Motivo · Usuario · Monto · Costo del
insumo perdido.
*Por qué los no recogidos van aquí y no en ventas:* porque son la única categoría del sistema donde
la venta fue buena y el negocio perdió. La columna de costo del insumo es la que le pone precio a
tres llamados sin respuesta.

**17 · FIRMAS**
Dos líneas: *Responsable del turno* (con el nombre impreso debajo) y *Administrador*.
*Por qué firmas:* porque aquí se entrega efectivo **y** se reparte un bote delante de testigos. En
México una entrega de efectivo sin firma no es una entrega, y un reparto de propina sin firma es
un pleito aplazado.

**18 · PIE**
Texto libre configurable + *Documento interno · [sistema] · Generado [fecha y hora]*.

### 9.4 · Reglas del corte que no se negocian

1. El arqueo va a ciegas. Siempre. **Los dos arqueos**: el del cajón y el del bote.
2. El esperado lo calcula el servidor, nunca la pantalla.
3. El PDF lleva folio, sucursal, **turno**, terminal, quién cerró y a qué hora.
4. Lo que no aplica al giro no aparece, ni siquiera en cero.
5. **Lo que es estimación se rotula como estimación.** Aplica a la comisión de terminal y al
   consumo teórico de insumo. Un número calculado presentado como un número contado destruye la
   confianza en todo el documento el día que no coincida.

---

## 10 · LOS CINCO DESCUADRES TÍPICOS

Los cinco de este giro, cómo nacen, y qué hace el sistema.

### Descuadre 1 · El bote de propina que se usó de cambio

**Cómo nace.** Ocho y media de la mañana, se acabaron las monedas, hay fila. El barista toma $100
del bote de propina para dar cambio, con toda la intención de reponerlos. A las 14:30 el bote
tiene $312 y el sistema dice $412. Nadie robó nada y hay cien pesos menos.

**Cómo lo previene el sistema.** El bote **se arquea aparte**, con su propio esperado y su propia
diferencia (§8.5). Y el movimiento **entrada de cambio** existe precisamente para que tomar dinero
del bote sea un movimiento registrado de dos toques en vez de un préstamo mental. La prevención
real no es el control: es que registrarlo cueste menos que no registrarlo.

**Lo que falta.** El aviso de cambio bajo a las 8:40 (dashboard), que evita que el momento llegue.

### Descuadre 2 · El café del personal que se comió el inventario

**Cómo nace.** Tres personas, tres o cuatro bebidas de turno cada una. Diez a doce bebidas diarias
que nunca se registran: ~$190 de insumo al día, **~$5,700 al mes**. Al hacer el conteo de leche del
lunes faltan doce litros y nadie sabe por qué.

**Cómo lo previene el sistema.** **F-261** con `tipo: 'personal'`: sale del stock, no entra a
ventas, y aparece en su propia sección del corte (§9.3, sección 12). Un toque desde la pantalla de
barra, sin pasar por el cobro.

**Por qué importa que sea fácil.** Si registrar el café del personal cuesta más de dos toques,
nadie lo registra, y entonces vuelve a ser merma. Y si es merma, el indicador de merma deja de
poder usarse para detectar robo, que es para lo único que sirve.

### Descuadre 3 · La bebida rehecha que se consumió dos veces

**Cómo nace.** "Te pedí deslactosada". El barista hace otra. Salieron dos bebidas y se cobró una.
La leche entera de la primera se fue a la coladera y el sistema descontó exactamente una bebida —
porque el descuento pasó **al cobrar**, y el cobro ya ocurrió.

**Por qué aquí es peor que en restaurante.** En `restaurante` la reposición ocurre antes del cobro
y se resuelve con F-324 (anulación de línea, que revierte el consumo). Aquí el cobro **ya pasó**:
no hay nada que anular, hay un consumo extra que registrar. Son dos operaciones distintas y
resolver la segunda con la primera deja el ledger al revés.

**Cómo lo previene el sistema.** **F-156** con motivo `bebida_rehecha`, desde la tarjeta del
pedido en la pantalla de barra, en un toque: consume el insumo otra vez, lo carga a merma de barra
—no a costo de ventas— y deja registro de qué bebida, a qué hora y por qué. Al mes se puede
contestar "¿cuántas bebidas rehacemos y por qué?", que casi siempre resulta ser un problema de
captura del modificador, no de la barra.

### Descuadre 4 · El descuento fantasma de $18

**Cómo nace.** El barista cobra $118 completos, registra "descuento de la casa $18" y se queda con
la diferencia. **El cajón cuadra perfecto.** El robo es invisible al arqueo, igual que en
`restaurante` — pero aquí es más difícil de ver por el volumen: dieciocho pesos, diez veces al día,
son $5,400 al mes, y ninguna de las diez líneas llama la atención por separado.

**Cómo lo detecta el sistema.** No por conteo: por patrón. Los descuentos aparecen en el resumen
financiero como línea propia y el cruce **descuento × usuario × hora** es lo que lo delata. Un solo
barista con cuarenta descuentos al mes y los demás con tres es una respuesta, no una sospecha.

**Lo que falta, y hay que decirlo así.** **F-205 — tope en pesos por rol y autorización con PIN.
Es el hueco de control más serio de este modelo, exactamente igual que en `restaurante`.** La
diferencia es que aquí el tope tiene que ser en pesos, no en porcentaje, por lo dicho en §3.

### Descuadre 5 · El canje de sello contado como venta

**Cómo nace.** El sexto café es gratis. Se registra como venta de $0.00, o como descuento del 100%.
En el primer caso el ticket promedio del día baja sin explicación y la dueña cree que el equipo
dejó de ofrecer; en el segundo, el renglón de descuentos se llena de canjes y los descuentos de
verdad —los del descuadre 4— dejan de verse.

**Cómo lo previene el sistema.** El canje es **su propio tipo de línea** (`canje_lealtad`): sale
del inventario, no cuenta como ticket, no entra al ticket promedio, no entra a descuentos, y
**cancela un pasivo** en el registro de sellos. Aparece en la sección 13 del corte con su costo
real.

**Por qué esto es más que una decisión de reporte.** Porque si el canje se contara como venta, el
programa de lealtad se autoevaluaría bien siempre: cada canje sumaría un ticket. Modelado como
pasivo, el programa se evalúa por lo que de verdad importa —si esa persona volvió y cuánto gastó
en las cinco compras anteriores— que es la única pregunta que decide si la promoción se sostiene o
se apaga.
