# 02 · DINERO Y CAJA · Restaurante de mesa

**Éste es el archivo más importante de la carpeta.** Si el dinero no cuadra, nada de lo demás
importa. Todo lo que sigue se apoya en tres reglas de la Fase 1 que no se negocian en ningún
modelo: **bigint de centavos** (nunca flotantes), **precios y totales siempre en el servidor**
(el endpoint no acepta importes del cliente), y **las propinas nunca entran en ventas, utilidad,
costo ni margen**.

---

## 1 · QUÉ CUENTA COMO VENTA Y QUÉ NO

La venta de este negocio es **el consumo cobrado de una cuenta cerrada**. Ni un peso más.

| Concepto | ¿Es venta? | Tratamiento exacto |
|---|---|---|
| **Consumo de alimentos y bebidas** | **Sí** | Es la única fuente de ingreso del modelo. Se registra en `ordenes.total_centavos`, que es el total **real, sin propina**, y jamás se infla. |
| **Propina** | **No** | Vive en `pagos`, separada de la venta, y se proyecta en la vista `ordenes_pagos_resumen`. No toca ventas, utilidad, costo, inventario, receta ni margen. Ver §4. |
| **Descuento aplicado** | Resta | `ordenes.descuento_centavos`. Baja la venta y baja el margen. **No baja el costo**: el insumo ya se consumió igual. |
| **Cortesía / platillo regalado** | **No es venta** | Hoy se resuelve mal: o se cancela la cuenta o se descuenta al 100%. Ninguna de las dos registra que el insumo salió. Se resuelve con **F-326** (pendiente): sale del stock, no entra a ventas, y aparece en su propia línea del corte. |
| **Comida del personal** | **No es venta** | Mismo caso. Hoy se registra como merma y ensucia el indicador de merma, que es el que sirve para detectar robo. F-326 lo separa. |
| **Anticipo o depósito por reservación** | **No aplica** | Este modelo no cobra por adelantado. El que cobra anticipo es `catering-banquetes` y `salon-eventos`, que son A5+A7. Si aquí apareciera un anticipo, sería una reserva de grupo grande y entra por otro modelo. |
| **Envío / domicilio** | **No aplica** | El restaurante de mesa no reparte. Si empieza a repartir, es `pizzeria` (A2 + Delivery) y el envío entra como concepto propio, no como platillo. |
| **Comisión de app de terceros (Rappi, DiDi)** | **No aplica** | Fuera del modelo base, por la misma razón. Cuando entre (F-826), la comisión es **gasto**, nunca un descuento sobre la venta: si se resta de la venta, el food cost se ve artificialmente peor. |
| **Vales, monederos, cupones** | **No aplica hoy** | F-214 y F-204 no existen en esta plantilla. Cuando existan, un vale es **un método de pago**, no un descuento. |
| **Cancelación con motivo** | Sale de la venta | La cuenta cancelada no suma a ventas y aparece con su motivo y su monto en la sección de Cancelaciones del corte. |
| **Ticket en $0.00** | No es venta | Cuentas que se abrieron y se cerraron sin consumo. Se depuran con `handleEliminarTicketCero`. Nunca entran al corte como venta. |

**La prueba de que está bien:** el "Total ventas" del corte tiene que poder pegarse en la
declaración del mes sin restarle ni sumarle nada. Si para llegar al número real hay que restarle
propinas, el sistema está mal.

---

## 2 · IMPUESTOS

- **IVA extraído**, tasa **16%**. El precio del menú **ya incluye** el impuesto. El menú dice
  $189 y el comensal paga $189.
- **Por qué extraído y no sumado.** En México no existe un restaurante que ponga "+IVA" en la
  carta: sería ilegible para el comensal y llevaría a discutir en la mesa. El precio al público
  es el precio al público. Esto no es una preferencia: es lo que hace el giro.
- **Cómo se calcula.** Desde el total con impuesto incluido, hacia atrás:
  `impuestos = total − round(total / 1.16)`. El redondeo se hace **una sola vez, en centavos, en
  el servidor**. Nunca por línea y después sumando, porque eso mete diferencias de centavos que
  hacen que el corte no cuadre por $0.03 y el dueño pierda la confianza en todo lo demás.
- **Dónde vive.** `ordenes.impuestos_centavos`, escrito por el comando de cobro. La tasa es un
  campo de configuración (`IVA / Impuesto (%)`), porque un restaurante en frontera puede traer
  tasa distinta.
- **Exentos.** Los alimentos preparados para consumo en el lugar **causan IVA**; el alimento no
  preparado (una botella de agua cerrada para llevar, por ejemplo) puede ser tasa 0%. El modelo
  soporta tasa por producto, pero la plantilla arranca con todo al 16% porque es el caso real del
  restaurante de mesa. Marcar cada producto es trabajo que el dueño no hará.
- **Cómo se muestra.** En la precuenta y el ticket: subtotal, IVA desglosado, total. **Nunca** se
  muestra IVA en la comanda de cocina: a la cocina no le importa el dinero y ver precios ahí es
  una fuga de información hacia el personal.

---

## 3 · DESCUENTOS

| Pregunta | Respuesta de este negocio |
|---|---|
| **Quién puede darlos** | Hoy, cualquiera con el permiso `hacer_descuentos`: administrador y caja. El mesero **no**. |
| **Hasta cuánto** | Sin tope duro hoy. **Esto es un hueco.** Debe existir tope por rol: mesero 0%, caja hasta 10%, administrador sin tope. |
| **Requieren autorización** | F-205 (autorización por supervisor) no existe todavía. Debe entrar junto con el tope: por encima del tope del rol, PIN de un supervisor, y el PIN queda en la bitácora. |
| **Cómo afectan el margen** | El descuento baja la venta y **no baja el costo**. Un 20% de descuento sobre un platillo con 35% de food cost lo deja en 44% de food cost. Por eso el descuento tiene que aparecer en el corte con nombre y apellido, no escondido dentro del total. |
| **Por línea o por total** | Ambos (F-202, F-203). Por línea para la cortesía de un postre; por total para el descuento de convenio. |

**El descuento es la puerta de robo más silenciosa del giro.** Un cajero con descuento libre
cobra completo al comensal, registra 30% de descuento y se queda la diferencia. Por eso: tope por
rol, autorización con PIN por encima del tope, y la línea "descuentos" visible en el corte y
agrupada por quién los aplicó. Sin las tres, el descuento no debería estar encendido.

---

## 4 · PROPINAS

**Variante F-241 · V2 sugerida al cobrar**, con delegación (F-247, pendiente de ID).
Es lo que más se usa de este sistema y lo que mejor está construido.

### 4.1 · La regla de fondo

> La propina **no es ingreso del restaurante**. Nunca afecta ventas, utilidad, costos, inventario,
> recetas ni margen. Pasa por la caja porque el comensal la paga con la tarjeta, no porque sea del
> negocio.

Esto no es una postura contable: es la ley. **Artículo 346 de la Ley Federal del Trabajo** — las
propinas son parte del salario del trabajador y el patrón no puede retenerlas. El restaurante no
puede quedarse un porcentaje "por administración de tarjeta". Y desde 2026 Profeco reitera que la
propina es **voluntaria** y no puede cobrarse de forma automática, lo que tiene una consecuencia
directa en la pantalla: **el botón "Sin propina" existe, es visible, y está al mismo nivel que los
porcentajes sugeridos**. No es un enlace pequeño abajo.

### 4.2 · Quién la recibe

Se atribuye al **mesero que atendió la mesa** (`ordenes.empleado_atiende_id`). Las ventas directas
de mostrador, sin mesero, se agrupan bajo *"Sin mesero / venta directa"* y su propina se queda en
el bote común del turno.

### 4.3 · Cómo se decide · los tres momentos

Éste es el punto que separa a este modelo de cualquier mostrador: hay **tres personas** que pueden
fijar la propina y **tres momentos** distintos.

| Momento | Quién | `propina_tipo` | `propina_origen` |
|---|---|---|---|
| Al pedir la cuenta, en la mesa | Mesero, preguntando al comensal | `porcentaje` \| `monto_manual` \| `sin_propina` | `mesero` |
| Al pedir la cuenta, diferida | Mesero, sin preguntar | `decidir_en_caja` | `mesero` |
| Desde el portal QR | El comensal, en su teléfono | `pendiente_cliente` | `pendiente_portal_qr` |
| Al cobrar | Cajero | `porcentaje` \| `monto_manual` \| `sin_propina` | `caja` |

**La regla que cierra el círculo:** una venta con `propina_tipo` en
`['pendiente', 'pendiente_cliente', 'decidir_en_caja']` **no se puede cobrar** sin que el cajero
abra el diálogo y confirme. Un `monto_manual` que llegó del QR también exige confirmación, y al
confirmar la caja marca `propina_origen: 'caja'`, que es la marca explícita que permite cobrar en
el siguiente intento sin volver a preguntar. Esto evita los dos errores opuestos: cobrar sin
propina una cuenta donde el comensal sí la dejó, y volver a preguntar tres veces.

**Porcentajes sugeridos:** configurables, por omisión `5, 10, 15, 20`, máximo seis valores, cada
uno con su importe en pesos debajo para que nadie tenga que calcular. En México lo normal es 10%
y lo generoso 15%; arrancar la sugerencia en 5% es deliberado, porque una sugerencia que empieza
en 18% se lee como presión y Profeco tiene razón en que eso no procede.

### 4.4 · El desglose exacto · la parte que ningún competidor hace bien

**Nunca se reparte proporcionalmente.** Si la cuenta se pagó $400 en efectivo y $300 con tarjeta,
y la propina fue $70, el sistema **no** asume $40/$30. Pregunta.

```
Cobro mixto con propina > 0
  ┌──────────────────────────────────────────────┐
  │  ¿Cómo se pagó la propina?                   │
  │    Efectivo       [  $ 0.00 ]                │
  │    Tarjeta        [  $70.00 ]                │
  │    Transferencia  [  $ 0.00 ]                │
  │                                              │
  │  La suma debe dar $70.00           ✓ cuadra  │
  └──────────────────────────────────────────────┘
```

La suma se valida contra el total de propina con tolerancia de ±$0.01 y **no deja cobrar si no
cuadra**. Con eso, `propina_efectivo_centavos`, `propina_tarjeta_centavos` y
`propina_transferencia_centavos` quedan exactos en la base, y el reparto del turno también.

**Por qué importa tanto.** El mesero que atendió mesas que pagaron con tarjeta y el que atendió
mesas de efectivo tienen situaciones distintas: la propina de tarjeta no está físicamente en el
restaurante esa noche. Un reparto proporcional le paga al de efectivo con dinero que no le toca y
deja al de tarjeta esperando. Es, textualmente, el dolor 2 de este negocio.

**Compatibilidad con ventas viejas** (antes del desglose exacto): si la venta tuvo **un solo
método**, toda la propina se atribuye a ese método — no hay ambigüedad. Si fue mixta antigua, se
atribuye al método declarado y **se marca como `propinas_sin_metodo`** para que se pueda señalar.
No se reparte proporcional ni siquiera en el caso viejo.

### 4.5 · Cómo se liquida

- Agrupación por mesero sobre las ventas con propina del periodo.
- **Liquidación con serie, folio, rango y quién liquidó** (`liquidaciones_propina`). Una sola
  transacción, con clave de idempotencia: liquidar dos veces el mismo periodo no duplica el pago.
- **"Liquidada" se deriva**, no se guarda: una venta está liquidada si tiene
  `propina_liquidacion_id`. Un booleano paralelo se desincroniza y ya lo hizo una vez.
- Momento real: al **corte de turno** (17:00) para el turno de mediodía, y al **cierre** para el
  de la noche. Por eso el corte de turno existe y no cierra la caja.

### 4.6 · Lo que falta · F-242 reparto por puntos

En cuanto el restaurante pasa de quince empleados, el reparto sólo a meseros genera rotación en
cocina. La práctica mexicana —y la que la reforma laboral empuja— es un **pool** repartido por
puntos entre mesero, garrotero, barra, cocina y lavaloza, con porcentajes acordados **por escrito**.
Requisitos cuando se construya:

1. Tabla de puntos por puesto, versionada con fecha de vigencia: cambiar el reparto no reescribe
   liquidaciones pasadas.
2. El reparto se calcula sobre el **pool del turno**, no sobre cada cuenta.
3. El documento de liquidación enseña la fórmula usada. Sin eso, el pleito sigue, sólo que ahora
   contra el sistema.
4. Depende de **F-325** (relevo de responsable): sin partir la atribución en el tiempo, el turno
   partido reparte mal.

---

## 5 · MÉTODOS DE PAGO

| Método | Uso real en este giro | Notas |
|---|---|---|
| **Efectivo** | ~45–55% de las cuentas, sobre todo en comida corrida y mediodía | Es el método que obliga a que exista arqueo. Cambio calculado por el sistema. |
| **Tarjeta** | ~35–45%, y sube en la cena y en fin de semana | Aquí llega la mayor parte de la propina. La terminal bancaria **no está integrada** (F-987 pendiente): el cajero teclea el monto. |
| **Transferencia** | ~5–10% y creciendo rápido | SPEI desde el teléfono, sobre todo en cuentas grandes y en grupos. Se registra como método propio, no como "otro". |
| **Mixto** | ~5%, pero concentrado en las cuentas grandes de la cena | Es el caso que más descuadra y por eso es el único que abre el bloque de desglose exacto de propina. |

**El más común es el efectivo por número de cuentas; la tarjeta por monto.** Eso importa: el
cajón puede cuadrar perfecto y el día haber sido malo, porque la mitad del dinero nunca pasó por
ahí. Por eso el corte separa *"efectivo esperado en cajón"* de *"total ventas"*, y nunca los mezcla.

**Gastos**, en cambio, se pagan en efectivo, tarjeta o transferencia. Un gasto en efectivo
**sale del cajón** y por eso el comando escribe el gasto **y** el movimiento de caja en la misma
transacción. Si se escribieran por separado, el arqueo dejaría de cuadrar en cuanto una de las dos
escrituras fallara.

---

## 6 · ANTICIPOS Y CRÉDITO

**No aplican, y decirlo es parte de la definición del modelo.**

- **Anticipos:** el comensal no paga antes de consumir. El anticipo pertenece a `catering-banquetes`
  y `salon-eventos`. Encender anticipos aquí metería un flujo de dos pasos en la pantalla de cobro,
  que es la pantalla que menos puede permitirse un paso de más.
- **Crédito:** nadie se lleva la comida fiada. El "fiado del cliente frecuente" existe en la
  **fonda** y en la **cocina económica**, y es un delta de ese modelo (F-610…F-618), no de éste.
- **Consecuencia de pantalla:** en la caja de esta plantilla **no hay** botón de "a crédito", ni
  columna de saldo, ni sección de cuentas por cobrar. Una sección vacía llamada "Crédito" haría
  dudar del resto del sistema, que es exactamente la regla 4 del corte en
  `04-SISTEMA-DE-DISENO.md` §5, aplicada a la interfaz.

---

## 7 · COMISIONES

**No hay comisiones en este modelo.** Al mesero no se le comisiona: se le da propina, y son cosas
distintas.

| | Propina | Comisión |
|---|---|---|
| De quién es el dinero | Del comensal, para el trabajador | Del negocio, para el trabajador |
| ¿Es gasto del negocio? | **No.** Nunca toca el estado de resultados | **Sí.** Es costo de venta |
| ¿Afecta el margen? | No | Sí |
| Base de cálculo | Lo que el comensal decida | Un porcentaje de la venta |

Mezclarlas es un error contable con consecuencias reales: si la propina se tratara como comisión,
aparecería como gasto, bajaría la utilidad reportada y el dueño pagaría impuestos sobre un número
equivocado. Por eso la comisión por profesional (F-423, F-424) está explícitamente **apagada** en
esta plantilla, y aparece en `estetica-salon`, donde sí es la forma normal de pagar.

---

## 8 · LA CAJA DE ESTE NEGOCIO

### 8.1 · Cuántas hay

**Una sola caja física, una sola sesión de caja abierta a la vez.** No es una limitación: es cómo
opera un restaurante de mesa de este tamaño. Hay un cajón, en un mostrador, junto a la salida, y
una persona responsable de él por turno. Varias cajas simultáneas (F-235) es un caso de
supermercado o de cafetería de alto volumen, no de aquí.

### 8.2 · Cómo se abre

```
ABRIR CAJA
  Efectivo inicial contado *      [ $ 1,500.00 ]   ← se cuenta a mano, primero
  Notas de apertura (opcional)    [ ................ ]
```

El fondo lo cuenta la persona **antes** de que la pantalla le diga nada. El sistema guarda el
**fondo esperado** (lo que se dejó el día anterior) y el **fondo contado**, y la diferencia queda
registrada desde el minuto uno. Esa diferencia de apertura, que casi todos los sistemas ignoran,
es la que detecta el faltante que nació de madrugada y no en el turno de hoy.

**Nada se puede cobrar sin caja abierta.** La pantalla de cobro se bloquea entera con una tarjeta
ámbar que dice *"Caja cerrada"* y un botón que lleva a abrirla. No es un aviso: es un muro. Un
cobro sin sesión de caja es un peso que no pertenece a ningún corte.

### 8.3 · Qué movimientos tiene

| Movimiento | Quién | Efecto en el cajón |
|---|---|---|
| **Apertura con fondo** | Cajero o encargado | + fondo |
| **Cobro en efectivo** | Cajero | + venta + propina en efectivo |
| **Cobro con tarjeta / transferencia** | Cajero | **cero**. El dinero no pasa por el cajón |
| **Gasto en efectivo** | Encargado | − monto. Escribe gasto y movimiento en la misma transacción |
| **Retiro parcial** | Encargado | − monto. El dinero que se saca a media noche por seguridad |
| **Entrada** | Encargado | + monto. Cambio que se mete, préstamo entre turnos |
| **Liquidación de propina en efectivo** | Encargado | − monto. Sale del cajón hacia el mesero |
| **Corte de turno** | Cajero saliente | Cuenta y entrega. **No cierra la sesión** |
| **Cierre diario** | Encargado | Cuenta, deja fondo de mañana, cierra la sesión |

**Los gastos del día en un restaurante son reales y constantes:** el gas, el hielo, la fruta que
faltó, la propina del que trae el pedido. Categorías vivas: servicios (luz, agua, gas, internet),
limpieza, transporte, reparación y mantenimiento, pago extraordinario, marketing, otro.

### 8.4 · Por qué el corte de turno no cierra la caja

Porque hay dos turnos de mesero y **un solo cajón**. A las 17:00 el mesero de mediodía se va y
necesita su propina; el cajero de mediodía entrega su efectivo. Pero la caja sigue operando: a las
18:30 entra la primera mesa de la cena. Cerrar la caja al corte de turno obligaría a abrir otra
sesión con otro fondo, partiría el día en dos cortes y haría imposible contestar "¿cuánto se vendió
hoy?" con un solo documento. Por eso `cortes_turno` y `sesiones_caja` son dos cosas distintas.

### 8.5 · El arqueo, a ciegas, siempre

```
1.  El sistema pide:  Efectivo contado físicamente *   [  $ ____  ]
2.  La persona cuenta el cajón y teclea.
3.  HASTA ENTONCES aparece el esperado, y la diferencia.
```

**El esperado lo calcula el servidor**, y es *fondo + entradas − salidas*, **no** "ventas en
efectivo". La diferencia es la que importa: sobra, falta o cuadra, con semáforo. Si se enseñara el
esperado antes, todo el mundo teclearía ese número y el arqueo dejaría de existir.

### 8.6 · La regla que salva el cierre

**No se puede cerrar la caja con mesas abiertas.** Antes del cierre, el sistema busca mesas con
cuenta viva y, si hay, abre un diálogo con la lista y no deja continuar. La verificación se hace
**dos veces** —antes de abrir el diálogo de cierre y otra vez justo antes de ejecutar— para cerrar
la carrera de la mesa que se abrió en los treinta segundos que el encargado tardó en contar el
cajón. Es la función **F-327** que hay que dar de alta en el catálogo.

---

## 9 · EL CORTE Y SU PDF

### 9.1 · Qué contesta el corte de ESTE negocio

> **¿Cuadró la caja, y cuánto le toca a cada mesero de propina?**

Esas dos preguntas, en ese orden. Todo lo que no ayude a contestarlas es relleno.

### 9.2 · Qué NO lleva el corte de un restaurante

- **Nada de crédito, cartera ni saldos.** No existen en el modelo.
- **Nada de comisiones.** No existen.
- **Nada de faltantes por producto terminado.** Eso es de abarrotes: aquí el producto se fabrica,
  así que el faltante se mide en **insumo**, no en platillo.
- **Ninguna sección en cero.** Si no hubo cancelaciones, la sección de Cancelaciones no aparece.
  Si no hubo propinas, la tabla de métodos con propinas no aparece. Una sección "Propinas: $0.00"
  hace dudar de todo el documento.

### 9.3 · El PDF, sección por sección, en orden

Documento tamaño carta / A4 vertical, 210 mm, margen de 14 mm. Se genera del lado del cliente
sobre el nodo `#cash-cut-pdf-document` y **se descarga solo** al cerrar la caja, salvo que el
dueño apague esa perilla.

---

**1 · ENCABEZADO**
Logo del negocio (80×80), nombre, dirección, teléfono, correo a la izquierda. A la derecha, en
negritas: **CORTE DE CAJA**, el **folio**, y la marca de la plataforma.
*Por qué primero:* el dueño manda este PDF por WhatsApp a su contador. Tiene que saberse de quién
es y de cuándo en la primera línea, sin abrirlo entero.

**2 · DATOS DEL CORTE**
Rejilla de dos columnas: Apertura · Cierre · Cajero de apertura · Cajero de cierre · Estado ·
Tipo (corte de turno o cierre diario) · Notas de apertura · Notas de cierre.
*Por qué aquí:* es la cadena de responsabilidad. Cuando falta dinero, la primera pregunta es
quién abrió y quién cerró.

**3 · APERTURA Y FONDO** — seis celdas
Fondo esperado de apertura · Efectivo inicial contado · **Diferencia de apertura** · Efectivo
contado al cierre · **Diferencia de efectivo** · **Dinero dejado en caja** (en negritas).
*Por qué antes de las ventas:* separa el faltante que ya venía del faltante de hoy. Y "dinero
dejado en caja" va en negritas porque es el fondo de mañana: si ese número no coincide con lo que
haya en el cajón al abrir, el problema pasó de noche.

**4 · RESUMEN FINANCIERO** — rejilla de tres columnas
Total ventas (negritas) · Nº de tickets · Ticket promedio · Efectivo · Tarjeta · Transferencia ·
Costo de ventas · Utilidad bruta · Margen promedio · Gastos operativos · Utilidad neta estimada
(negritas) · Total general.
*Por qué en este orden:* de arriba a abajo se lee la historia del día — cuánto entró, en cuántas
cuentas, de qué tamaño, por qué medio, cuánto costó, cuánto quedó. **Y todo esto es sin propina**,
por eso el título del bloque en pantalla lo dice con todas sus letras: *Resumen financiero (sin
propinas)*.

**5 · MÉTODOS DE PAGO — VENTAS, PROPINAS Y TOTAL** — tabla, sólo si hubo propinas
Cuatro columnas: Método · Ventas · **Propinas** (en rojo) · Total. Filas de efectivo, tarjeta y
transferencia, más una fila TOTAL.
*Por qué existe y por qué separada de la anterior:* es la tabla que concilia el mundo real con el
contable. La columna "Ventas" es lo que se declara; la columna "Total" es lo que físicamente
entró por cada medio. Cuando el cajero cuadra el voucher de la terminal, usa la columna "Total",
no la de ventas. Sin esta tabla, el cuadre de terminal es imposible y el cajero termina culpando
al sistema.

**6 · PROPINAS** — tres celdas + tabla por mesero
Total propinas (negritas) · Ventas reales sin propina · Total cobrado con propina (negritas).
Debajo, **sólo en la plantilla `restaurante`**, la tabla de **Mesero → Propinas**.
*Por qué es su propia sección y no una línea del resumen:* porque es la mitad de la razón por la
que este documento existe. Y las tres celdas de arriba están ahí para contestar de golpe la
pregunta que todo el mundo se hace: "entonces, ¿de los $38,400 que conté, cuánto es mío?".

**7 · DETALLE DE VENTAS (n)** — tabla
Folio · Hora · **Mesa** (y nombre del cliente si se capturó) · Productos · Total · Pago.
*Por qué lleva mesa y no sólo folio:* porque el dueño revisa este listado buscando la cuenta que
recuerda. No recuerda folios; recuerda "la mesa 12 de las diez de la noche". Y el listado de
productos dentro de cada fila muestra `500 g × Arrachera` cuando la venta fue por peso, no
`Arrachera ×1`, porque la cantidad real es lo que permite auditar contra la cocina.

**8 · PRODUCTOS VENDIDOS** — tabla agregada
Producto · Líneas · **Cantidad real** · Total · Costo · Utilidad.
*Por qué "líneas" y "cantidad real" son dos columnas:* 40 líneas de arrachera pueden ser 12 kg o
9 kg según lo que pidió cada quien. La columna de cantidad real es la única que sirve para
comparar contra lo que salió del almacén.

**9 · INGREDIENTES / INSUMOS CONSUMIDOS** — tabla
Ingrediente · Cantidad · Unidad · Costo unitario · Costo total.
*Por qué es la sección más importante del documento para el dolor 1:* dice cuánto **debió** salir
del almacén según las recetas de lo que se cobró. Contra el conteo físico, la diferencia es el
nombre exacto del robo hormiga, de la porción descontrolada y de la merma no registrada. Es lo
que ningún corte de caja tradicional trae y lo que hace que valga la pena capturar recetas.

**10 · GASTOS OPERATIVOS** — tabla, sólo si hubo
Categoría · Descripción · Pago · Monto.
*Por qué después del consumo:* el gasto es dinero que salió del cajón y ya está restado en el
esperado. Enseñarlo aquí, con descripción, es lo que evita el "¿y estos $800?" de la medianoche.

**11 · INVENTARIO BAJO / CRÍTICO** — tabla, sólo si hay alertas
Ingrediente · Stock actual · Stock mínimo · Estado · **Recomendación** (comprar urgente / comprar
pronto / reabastecer).
*Por qué el corte trae inventario:* porque el corte se lee a medianoche y la compra se hace a las
nueve de la mañana. Es el único momento del día en que el dueño está sentado leyendo. Poner aquí
lo que hay que comprar mañana es aprovechar el único hueco de atención que existe.

**12 · CANCELACIONES** — tabla, sólo si hubo
Folio · Motivo · Usuario · Monto.
*Por qué al final y por qué siempre con usuario:* porque es la sección de control, no de
operación. Un patrón de cancelaciones del mismo cajero a la misma hora es la señal más clara de
robo en caja que existe en este giro.

**13 · FIRMAS**
Dos líneas: *Responsable de caja* (con el nombre impreso debajo) y *Administrador*.
*Por qué firmas en un PDF:* porque se imprime y se archiva. Es el documento que se saca cuando
hay un faltante grande, y en México una entrega de efectivo sin firma no es una entrega.

**14 · PIE**
Texto libre configurable + *Documento interno · [sistema] · Generado [fecha y hora]*.

### 9.4 · Reglas del corte que no se negocian

1. El arqueo va a ciegas. Siempre.
2. El esperado lo calcula el servidor, nunca la pantalla.
3. El PDF lleva folio, sucursal, terminal, quién cerró y a qué hora.
4. Lo que no aplica al giro no aparece, ni siquiera en cero.

---

## 10 · LOS CINCO DESCUADRES TÍPICOS

Los cinco de este giro, cómo nacen, y qué hace el sistema.

### Descuadre 1 · La mesa que se fue sin pagar

**Cómo nace.** Hora pico, el mesero pierde de vista la mesa 9, los comensales salen. El consumo
existió, el inventario bajó, la cuenta quedó abierta.
**Cómo lo previene el sistema.** La mesa abierta **bloquea el cierre de caja**. A las 23:30 el
encargado no puede cerrar sin resolverla: o la cobra, o la cancela con motivo. Lo que no puede es
ignorarla, que es lo que pasa cuando el sistema deja cerrar. El cargo de la pérdida queda con
nombre —cancelación, motivo, usuario— y aparece en el corte.
**Lo que falta.** F-305 (tiempo de ocupación) alertaría a los 120 minutos, antes de que se vayan.

### Descuadre 2 · La propina de tarjeta repartida como si fuera efectivo

**Cómo nace.** Cuenta mixta de $2,300 con $300 de propina. El sistema reparte proporcional, el
cajón queda esperando efectivo que nunca llegó, y el mesero recibe de más o de menos.
**Cómo lo previene el sistema.** El desglose exacto es obligatorio: si el cobro es mixto y hay
propina, se piden los tres importes y **no deja cobrar hasta que sumen**. Esto elimina la clase
entera de descuadre, no un caso.

### Descuadre 3 · El gasto que salió del cajón y no se registró

**Cómo nace.** Llega el del gas a las 15:40, el encargado saca $1,200 del cajón y dice "al rato lo
capturo". A medianoche faltan $1,200 y nadie se acuerda.
**Cómo lo previene el sistema.** El gasto en efectivo escribe **el gasto y el movimiento de caja
en la misma transacción**: no existe uno sin el otro. Y las plantillas de gasto fijo hacen que
registrar el gas sea dos toques, no un formulario. La prevención real no es el control: es que
registrarlo cueste menos que no registrarlo.
**Dónde se ve.** Sección 10 del corte, con categoría y descripción.

### Descuadre 4 · El descuento fantasma

**Cómo nace.** El cajero cobra $850 completos al comensal, registra un 20% de descuento y se
queda $170. La caja **cuadra perfectamente**: sobra cero. El robo es invisible al arqueo.
**Cómo lo detecta el sistema.** El arqueo no lo va a ver nunca, y ése es el punto: se detecta por
patrón, no por conteo. Los descuentos aparecen en el resumen financiero como línea propia, y el
cruce descuento × usuario × hora es lo que lo delata.
**Lo que falta.** Tope de descuento por rol y autorización por PIN (F-205). **Es el hueco de
control más serio que tiene hoy este modelo**, y hay que decirlo con esas palabras.

### Descuadre 5 · El consumo teórico que no cuadra con el almacén

**Cómo nace.** El corte dice que se consumieron 9.4 kg de arrachera. El conteo físico del lunes
dice que faltan 12.1 kg. Los 2.7 kg de diferencia son robo hormiga, porción descontrolada, merma
no registrada o comida del personal — y hoy el sistema **no puede distinguir cuál**.
**Cómo lo detecta el sistema.** La sección 9 del corte da el número teórico. El ledger inmutable
da el histórico y el signo lo impone la base, así que nadie puede maquillarlo escribiendo un
movimiento al revés.
**Lo que falta, y es mucho.** **F-106** (toma de inventario físico) para tener el número real,
**F-133** (rendimiento real contra teórico) para calcular la diferencia automáticamente, y
**F-326** (consumo de empleados y cortesías) para sacar de la ecuación lo que sí tiene explicación.
Con esas tres, la pregunta "¿quién me está robando?" pasa de ser una sospecha a ser un renglón.
Sin ellas, el sistema enseña el síntoma y no el diagnóstico.
