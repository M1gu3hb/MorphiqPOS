# 00 · FICHA Y EJES · Ferretería y tlapalería

**Modelo:** `ferreteria` · **Familia:** 02 Retail y mostrador · **Arquetipo:** A1 + deltas de A5
**Cliente vivo:** Ferretería La Broca · giro `ferreteria` · paquete `operativo`
**Plantilla destino:** `tienda` **provisional** por D-01, hasta que exista `ferreteria` propia
**Hereda de:** `modelos/02-retail/abarrotes/` — la raíz del arquetipo A1

> **Lee `abarrotes` antes que esto.** Todo lo que ahí está resuelto se cita por ID y **no se vuelve a
> describir**: el tronco de inventario, el ledger en unidad base, las presentaciones (F-112), la caja,
> el arqueo a ciegas, el conteo cíclico (F-149), el alta rápida, el redondeo (F-257) y la regla de que
> el dinero en tránsito no es venta. Este archivo documenta **únicamente lo que una ferretería hace
> distinto**, y lo documenta hasta el fondo, porque `abarrotes` dejó escrito —en su P4— que
> `ferreteria` es su riesgo de fusión más probable. Esta carpeta contesta ese señalamiento.

---

## 0 · LA PREGUNTA QUE ESTA CARPETA TIENE QUE CONTESTAR PRIMERO

`abarrotes` cerró su P4 diciendo, textualmente, que si `ferreteria` se escribe sin cinco deltas
concretos, **o se fusiona o los dos están mal documentados**. La respuesta corta va aquí arriba y se
demuestra en los seis archivos:

| | `abarrotes` | `ferreteria` | ¿Es diferencia de clase o de grado? |
|---|---|---|---|
| **Acción principal** | ESCANEAR. El código ya existe impreso | **BUSCAR POR MEDIDA.** Cerca de la mitad del catálogo **no trae código de fábrica** | **De clase.** Cambia la pantalla de inicio entera |
| **Ritmo** | Ráfaga · 220 tickets de $50 · 30 segundos cada uno | **Sostenido** · 25 a 60 ventas de $150 a $1,500 · **3 a 8 minutos** cada una | **De clase.** Cambia densidad, cobro y dashboard |
| **Quién decide qué se lleva** | El cliente. Ya sabe que quiere una Coca | **El mostrador.** El cliente trae un tornillo en la mano y dice "uno como éste" | **De clase.** Obliga a un catálogo por atributos, no por nombre |
| **Unidad de venta** | Pieza y presentación con factor exacto (caja = 24) | **Pieza, metro, kilo y pieza-por-kilo**, con **corte físico del material** y factor aproximado | **De clase.** F-145 no existe en abarrotes |
| **Crédito** | Fiado de libreta · 5% de los tickets · $340 promedio | **Crédito formal a contratista** · 25–35% del valor vendido · $8,000 a $60,000 de saldo, con autorizados y obra | **De clase.** Es otro producto financiero |
| **Devolución** | Rara. Producto defectuoso | **Diaria y esperada.** *"No era la medida"* | De grado, pero el grado cambia el flujo |
| **Factura** | Excepcional + global mensual de RESICO | **Normal.** El contratista deduce. `ClaveUnidad` por línea | De grado alto |
| **IVA** | **Mixto 0% / 16% + tres mecánicas de IEPS** | **16% en todo. Sin IEPS.** | De clase, y **a favor de abarrotes** |
| **El corte contesta** | ¿Qué producto falta? | **¿Cuánto salió sin cobrarse hoy?** | **De clase** |

**Cuatro de los seis ejes de diseño (`04-SISTEMA-DE-DISENO.md` §2) toman valor distinto.** Ése es el
criterio, y por eso son dos modelos. Lo que comparten —y es mucho— se cita por ID y no se reconstruye:
alrededor de **siete de cada diez funciones de esta carpeta van marcadas `[=]` contra `abarrotes`.**
La respuesta larga, con lo que quedó incómodo, está en la P4 de `FILE-MAP.md`.

---

## 1 · QUÉ ES ESTE NEGOCIO

Una ferretería de barrio vende **la pieza que resuelve un problema que ya empezó**. Nadie entra a una
ferretería a pasear: entra porque se le rompió la llave del lavabo, porque el maestro le pidió cemento,
porque le falta un metro de cable para terminar la instalación. El cliente **casi nunca sabe cómo se
llama lo que necesita**. Trae la pieza rota en la mano, o una foto en el teléfono, o una descripción
("el que va aquí, el chiquito"). Lo que se vende, antes que el producto, es **el diagnóstico de
mostrador**. Por eso una ferretería con un buen mostradorista vende el doble que la de enfrente con el
mismo surtido y los mismos precios, y por eso el activo más valioso del negocio no está en el anaquel.

En México hay **más de 138 mil establecimientos** entre ferreterías y tlapalerías (Data México / Mundo
Ferretero). Las dos palabras no son sinónimas: *tlapalería* viene del náhuatl **tlapalli**, color o
pintura, y *ferretería* viene del hierro. En la calle se mezclan, y el negocio real de barrio es
tlapalería + ferretería + un poco de material de construcción. Las líneas que más venden son
**herramienta manual (89%), material eléctrico (78%) y cerrajería —llaves, candados, chapas— (55%)**.

El margen bruto del sector se ubica entre **25% y 35%** según la mezcla, con costo de mercancía del
60–75% y gasto operativo del 20–28%, y deja un **neto del 8% al 12%**. Pero el promedio miente, porque
**cada línea deja algo distinto y el dueño casi nunca lo tiene medido**:

| Línea | Margen típico | Qué es en el negocio |
|---|---|---|
| Tornillería, clavo, pija, taquete a granel | **35%–50%** | Poco dinero por venta, mucho margen, y es el ancla del mostrador |
| Pintura y complementos | **~26%** | Margen bueno, venta grande, y con el entonado es casi un servicio |
| Herramienta eléctrica | **~20%** | Ticket alto, margen medio, compite con Amazon y con el tianguis |
| Cemento, mortero, yeso | **~18%** | Volumen puro, pesa, ocupa lugar, casi no deja |
| Material eléctrico (cable, conduit, apagadores) | **~15%** | Lo pide el contratista, se vende por metro, el cobre sube y baja |
| Plomería y herramienta de plomero | **~14%** | Margen bajo, rotación alta, indispensable para no perder al cliente |

**La forma del dinero es la inversa de una tiendita.** Don Chuy tiene $40,000 de venta al mes y muy
poco inventario. Una ferretería como La Broca vende **cuatro a diez veces más** y tiene **todo su
capital enterrado en el anaquel**: de tres a ocho mil claves distintas, con una rotación de tres a
cinco vueltas al año. Una ferretería de barrio maneja **entre 3,000 y 8,000 SKU**, y vende **50 a 200
unidades al día** (Pulpos). Eso significa que **la mayor parte del catálogo no se vende ni una vez al
mes**, y que la pregunta central del negocio no es "qué me falta" —que es la de abarrotes— sino
**"cuánto dinero tengo parado y en qué"**.

Y encima hay un segundo negocio, que no es de comisión sino de trabajo: **copia de llaves, entonado de
pintura, corte de vidrio y de madera, cuerda a tubo, y renta de herramienta**. Consume material propio
y cobra mano de obra. No es una venta de producto y tampoco es una comisión por dinero ajeno (F-255):
es una tercera naturaleza que ningún punto de venta del segmento modela, y en un mostrador de barrio
puede ser el 4% al 8% de la venta con márgenes del 60% al 80%.

---

## 2 · QUIÉN LO COMPRA

**Alberto "Beto" Nava, 47 años.** Abrió La Broca hace catorce años con la liquidación de una fábrica.
Empezó en un local de 30 m² vendiendo Truper y pintura; hoy tiene 90 m², mostrador corrido al frente,
tres pasillos de autoservicio para lo que se puede tocar (cinta, focos, pilas, silicón) y **todo lo
caro y lo chico detrás del mostrador**. Atrás hay una bodega con varilla, cemento y tubo. Una camioneta
Estaquitas para las entregas.

| | |
|---|---|
| **Empleados** | Cinco. Beto; su esposa **Norma**, que cobra y factura; **Chava**, mostradorista de 58 años con 30 en el giro —el que sabe—; **Diego**, el hijo de Beto, 24 años, que entró hace dos y sí sabe de computadoras; y un ayudante que carga y entrega. |
| **Computación** | Beto usa WhatsApp, banca y el catálogo PDF de Truper. **Norma sí sabe**: lleva las facturas en el portal del SAT y un Excel de "lo que me deben". Diego es quien va a operar el sistema y quien lo va a defender adentro. **Chava no va a teclear nada que le quite tiempo con el cliente**, y ése es el requisito de diseño más duro de esta carpeta. |
| **Qué usa hoy** | Una **libreta de cuentas** por contratista, un **talonario de notas de remisión** de papel carbón, el Excel de Norma, y **los precios en etiquetas escritas a mano** que llevan dos aumentos de retraso. El inventario no existe en ningún lado. |
| **Qué le han vendido** | Le cotizaron **SICAR** (licencia de servidor **$4,940** pago único, terminal adicional **$1,320**, lector desde **$1,200**, impresora térmica desde **$2,497**), **Aspel SAE** en suscripción o licencia única, y probó un sistema en la nube dos meses. Lo dejó por una razón que hay que escuchar entera: **"me hacía capturar el tornillo como si fuera un refresco"** — un producto, un código, una unidad. |
| **Qué puede pagar** | **$900 a $1,600 al mes.** Es un negocio cuatro a diez veces más grande que una tiendita y con un problema de crédito que le cuesta decenas de miles al año. La renta mensual de Morphiq le encaja holgado **si el sistema le contesta quién le debe y cuánto tiene dormido**. |
| **Hardware que ya tiene** | Una PC de escritorio en el área de Norma, impresora de hojas para las facturas, y una báscula colgante de 20 kg que no habla con nada. |
| **Hardware que hay que venderle** | Una PC más en el mostrador, impresora térmica, cajón, lector USB (**sí, aunque medio catálogo no tenga código**: la otra mitad sí lo tiene), **báscula de mostrador con salida** y **impresora de etiquetas** — que aquí no es accesorio, es requisito, porque el SKU interno de los productos sin código hay que imprimirlo. |

**El contexto que explica la venta, y es distinto del de abarrotes.** El tendero desconfía de los
sistemas porque le prometieron y le fallaron. **Beto desconfía porque los sistemas que probó estaban
hechos para otro negocio**: para uno donde cada cosa tiene un código, una unidad y un precio. Su
objeción número uno no es "¿quién captura los mil productos?" —está dispuesto, sabe que son cinco
mil—; su objeción es **"¿le vas a poder decir a Chava en qué gaveta está el tornillo 1/4 × 2
galvanizado, y le vas a dejar venderlo por pieza y por kilo el mismo día?"**. Si la demostración no
contesta eso en los primeros cinco minutos, no hay segunda cita.

---

## 3 · EL DÍA COMPLETO

**Martes normal.** Abre 7:30, cierra 20:00, con comida escalonada. El sábado es otro día y va aparte.

| Hora | Qué pasa | Dónde toca el sistema |
|---|---|---|
| **07:30** | Abre Chava. Norma cuenta el fondo: $2,500, con billetes chicos porque el albañil paga con $500. | **F-230 apertura con fondo** + desglose por denominación, heredado de `abarrotes` §8.2. Mismo flujo, monto mayor. |
| **07:30–09:30** | **Pico 1 · los que van a la obra.** Albañiles y plomeros antes de subir al camión. 20 a 30 ventas de $150 a $1,500: bulto de cemento, 20 m de cable, coples, un cincel, brocas. **Buena parte se va "a la cuenta del inge"**, y quien se lleva el material no es quien debe. | **F-638 autorizados a cargar en cuenta** (NUEVA). **F-612 saldo del cliente en el mostrador, antes de despachar.** La **remisión firmada** en vez de ticket. Es el momento de mayor riesgo económico del día y hoy se resuelve con una libreta. |
| **09:30** | Llega el camión del distribuidor **Truper** con el pedido quincenal: 8 cajas, ~180 claves distintas. Diego captura de pie, con la lista en la mano. | **F-632 entrada de compra**, heredada de `abarrotes` §4.2 **sin canje** —Truper no recoge caducados— pero **con garantía a proveedor** como salida propia. La captura de 180 líneas es el cuello de botella real. |
| **10:00–13:30** | **Valle de asesoría.** Doña Rosa con la llave que gotea, el señor con un pedazo de manguera cortado, la muchacha que quiere pintar su cuarto. Tickets de $60 a $300 y **de tres a ocho minutos cada uno**. Chava pregunta, busca, sale al pasillo, regresa con dos opciones. | **Ésta es la pantalla del modelo.** Búsqueda por medida y por atributo (F-059), equivalencias (F-060), foto de la pieza (F-061), **ubicación en la gaveta** (F-152) para que Diego encuentre lo que Chava sí sabe dónde está. |
| **11:00** | Entonado de pintura: base blanca de 4 L + colorantes, se agita y se cobra. Y dos copias de llave. | **F-258 servicio de mostrador** (NUEVA): consume material propio y cobra mano de obra. No es venta de producto y no es comisión. |
| **12:00** | Pasa el **ingeniero Loera**: quiere cotización de 40 partidas para una casa. Se la manda por WhatsApp. Dos días después vuelve, pide 28 de las 40 y a crédito. | **F-600 cotización con vigencia** · **F-604 conversión a pedido** · **F-605 surtido parcial** · **F-639 subcuenta por obra** (NUEVA). Aquí el modelo toca A5 de verdad. |
| **13:30** | Corte de material: **60 m de cable THW cal. 12** de un rollo de 100. Quedan 40 m, pero el retazo de 1.8 m del rollo anterior sigue arrumbado y nadie sabe si está o no. | **F-145 corte de material** y **F-150 retazo y sobrante** (NUEVA). Sin las dos, el inventario de cable es ficción desde la primera venta. |
| **14:00–16:00** | Comida escalonada. Se queda Norma sola. **La venta baja y el ticket baja más**, porque Norma cobra bien y asesora poco. | Es el dato que justifica **venta por mostradorista en el dashboard** — cosa que `abarrotes` prohíbe expresamente en el suyo. Ver §5, eje E3. |
| **16:00–19:00** | **Pico 2 · el que sale del trabajo** a arreglar su casa. Tickets medianos, mucha pregunta, mucho "¿y esto para qué sirve?". | Igual que el valle, pero con más gente esperando. Aquí se mide si la búsqueda es lo bastante rápida para atender a dos personas a la vez. |
| **18:00** | **Devoluciones.** Tres del día: el codo que no era, la broca equivocada, medio saco que sobró. Dos vuelven al anaquel, uno no. | **F-222 devolución** en variante: la mayoría del producto **es revendible** y hay que decidirlo pieza por pieza. En una tiendita esto pasa una vez por semana; aquí, tres veces al día. |
| **19:00** | Beto abre la libreta y le habla a los tres que más deben. Uno ya no contesta. | **F-613 antigüedad** · **F-616 recordatorio**. La cartera de una ferretería no se cobra sola y no se cobra con mensajes automáticos. |
| **20:00** | Cierre. Norma cuenta, saca el corte, lo imprime y le manda el PDF a Beto. | **F-232 arqueo a ciegas** + **F-234 el corte de ferretería**, que contesta una pregunta distinta a la de abarrotes. Ver `02-DINERO-Y-CAJA.md` §9. |

**El sábado, que es otro negocio.** De 8:00 a 17:00, sin contratistas y con el doble de particulares.
Es **el día de mayor venta de la semana** y el de mayor asesoría por ticket: el que trabaja de lunes a
viernes arregla su casa el sábado. Beto está en el mostrador todo el día. El domingo abre medio día
sólo si hay obra cerca.

**Lo que este día desbloquea, y es lo que separa a esta carpeta de `abarrotes`:**

1. La pantalla de inicio **no es el total de una venta**: es **el buscador**, con la venta armándose al
   lado. El 70% del tiempo de mostrador se va en encontrar, no en cobrar.
2. El dispositivo principal sigue siendo la PC del mostrador, pero **aparece un segundo dispositivo
   real que abarrotes no tiene**: el teléfono o la tablet **en el pasillo**, porque el mostradorista
   camina con el cliente y necesita existencia, ubicación y precio en la mano.
3. **El momento de mayor riesgo del día son las 8 de la mañana**, no las 10 de la noche: es cuando sale
   material a crédito con la firma de alguien que no es el deudor.
4. El corte se lee **para saber cuánto salió sin cobrarse**, no sólo para ver si cuadró el cajón.
5. **Hay dos personas distintas en la venta** —el que despacha y el que cobra— y en muchas ferreterías
   son personas diferentes por diseño, como control anti-robo. Eso no existe en una tiendita.

---

## 4 · LOS SEIS EJES DEL MAPA GENERAL

| Eje | Valor | Por qué |
|---|---|---|
| **E1 · Cómo entra el ingreso** | **E1.1 Mostrador**, con delta fuerte de **E1.5 Cotización→pedido** | El 85% de las ventas se entregan en el acto. Pero la venta grande —la obra, el contratista, el pedido especial que se le pide a Truper— pasa por cotización, aprobación y surtido, a veces parcial. `abarrotes` no tiene nada de esto: nadie cotiza una bolsa de Sabritas. |
| **E2 · Qué se descuenta al cobrar** | **E2.2 Presentaciones** + **medida con corte físico** | Se hereda F-112 completo de `abarrotes` y se le añade lo que ahí no existe: el material **se corta**, y cortar genera merma y retazo. Un rollo de 100 m que se vende en cuatro pedazos no deja 100 m vendidos: deja 96 vendidos, 2 de corte y 2 de retazo que nadie quiere. |
| **E3 · Quién atiende** | **E3.1 Empleado genérico, con un matiz que importa** | No hay agenda, ni cartera propia, ni comisión: no es E3.2. Pero **el empleado no es intercambiable en capacidad**. Chava vende más y vende mejor que Diego con el mismo catálogo. El sistema no le paga comisión, pero **sí mide su venta y sí tiene que transferir lo que él sabe** (F-060, F-153). Es la única función del dashboard que `abarrotes` prohíbe y aquí es obligatoria. |
| **E4 · Cuándo se paga** | **E4.1 Contado** ~65% de los tickets, **E4.4 Crédito** 25–35% del **valor**, **E4.3 Anticipo** en pedido especial | El crédito aquí no es un favor al vecino: es una condición para competir por la obra. Y el anticipo aparece cuando hay que pedirle algo a Truper que no se tiene y que nadie más va a querer. |
| **E5 · Qué se le entrega** | **E5.1 Ticket**, **E5.2 Factura CFDI** y **E5.3 Nota de remisión** | Las tres conviven en el mismo día, y la remisión —material que sale firmado y sin cobrar— es **el documento propio de este giro**. Ninguna existe en `abarrotes` con este peso: allá la factura es excepcional y la remisión no existe. |
| **E6 · Relación con el cliente** | **E6.1 Identificada** en la mitad, **E6.3 Cuenta con saldo** en los contratistas | El particular es anónimo. Pero el 40% del valor vendido se concentra en 30 o 40 contratistas y plomeros conocidos por nombre, con precio propio, con crédito y con gente autorizada a cargarles. Eso es **una cartera**, no una libreta. |

---

## 5 · LOS SEIS EJES DE DISEÑO

| Eje | Valor | Consecuencia concreta en la pantalla |
|---|---|---|
| **A · Pantalla de inicio** | **MOSTRADOR** — el buscador con la venta al lado | Al entrar, el cursor está en el campo de búsqueda **y debajo ya hay una cuadrícula con las líneas del giro**. No arranca vacío como abarrotes: arranca con los ocho grupos de producto, porque la primera pregunta del mostradorista es *"¿de qué es?"*. |
| **B · Acción principal** | **BUSCAR** | Y buscar aquí significa cuatro cosas a la vez: por código (la mitad que sí lo trae), por nombre y marca, **por medida y atributo**, y **por foto**. El escáner deja de ser el contrato y pasa a ser uno de cuatro caminos. |
| **C · Unidad de trabajo** | **La venta de mostrador** | Nace vacía, **vive de tres a ocho minutos**, se le agregan y se le quitan líneas mientras el cliente decide, y puede terminar en ticket, en remisión firmada, en cotización o suspendida. Un ticket de abarrotes vive treinta segundos y sólo termina en una cosa. |
| **D · Densidad** | **Alta en la búsqueda, media en la venta** | Los resultados de búsqueda son de densidad máxima —medida, marca, existencia, **ubicación**, precio, todo en una fila de 32 px— porque se compara entre ocho opciones. Las líneas de la venta son más altas: una línea dice *"Cable THW cal. 12 negro · 60.00 m · corte del rollo R-114"* y eso no cabe en 32 px. |
| **E · Dispositivo principal** | **PC del mostrador** · secundario **tablet/teléfono en el pasillo** · terciario teléfono del dueño | El secundario es el que `abarrotes` no tiene, y no es un capricho: el mostradorista **camina con el cliente hasta el rack**. El tercero lee dashboard y cartera, igual que Don Chuy. |
| **F · Ritmo** | **SOSTENIDO**, con dos picos episódicos | Y esto lo cambia todo respecto de `abarrotes`. Aquí **sí caben** un diálogo de dos pasos, una confirmación antes de descontar de un rollo, y un formulario de cotización. Lo que no cabe es que buscar tarde más de dos segundos. **La fricción aceptable se movió de sitio: de la velocidad de captura a la velocidad de encontrar.** |

**La regla de oro de este modelo, y es distinta de la de abarrotes:**

> En una tiendita, si escanear no es instantáneo el sistema no sirve. **En una ferretería, si buscar
> por medida no encuentra la pieza a la primera, el sistema no sirve** — porque el mostradorista
> vuelve a su memoria y a su gaveta, y en el momento en que deja de consultar el catálogo, el
> inventario se vuelve ficción exactamente igual que allá. **El buscador no es una funcionalidad: es
> el contrato.**

---

## 6 · ARQUETIPO BASE Y DELTAS

```
A1 MOSTRADOR  (heredado íntegro de `abarrotes`)
  = Tronco de inventario                                F-100…F-108
  = Presentaciones caja ↔ pieza y factor                F-112 · F-120 · F-121
  = Conteo cíclico por zona y toma física               F-106 · F-149
  = Caja, arqueo a ciegas, corte de turno               F-230…F-233 · F-236
  = Cobro, métodos, ticket, cancelación, folio          F-210…F-225
  = Redondeo de cambio                                  F-257
  = Alta rápida desde el código no encontrado           F-020 en variante
  = Lector como teclado, sin cooldown                   F-986

+ DELTAS PROPIOS DE FERRETERÍA
  + Corte de material · lineal, plano y tubular         F-145 [≠]  ← se construye AQUÍ
  + Retazo y sobrante de corte                          F-150  ← NUEVA
  + Doble unidad con conversión por peso (pieza ↔ kilo) F-151  ← NUEVA
  + Atributos técnicos como eje del catálogo            F-059  ← NUEVA
  + Equivalencias y sustitutos                          F-060  ← NUEVA
  + Foto de mostrador y búsqueda visual asistida        F-061  ← NUEVA
  + Ubicación física de la pieza                        F-152  ← NUEVA
  + Lista de materiales por trabajo                     F-153  ← NUEVA
  + Servicio de mostrador con material y mano de obra   F-258  ← NUEVA
  + Autorizados a cargar en cuenta                      F-638  ← NUEVA
  + Subcuenta por obra del cliente                      F-639  ← NUEVA

+ DELTAS DE A5 COTIZACIÓN Y CRÉDITO
  + Cotización, versiones, envío, aprobación            F-600…F-607
  + Crédito formal: límite, plazo, estado de cuenta     F-610…F-618
  + Listas de precio por tipo de cliente                F-023 · F-025
  + Nota de remisión de entrega                         F-606 [≠]

+ DELTAS OPCIONALES, POR PERILLA
  + Material asignado a obra y devolución de sobrante   F-117 · F-137 · F-138 [≠]
  + Renta de herramienta con depósito                   F-119 · F-141 · F-142 · F-143
  + Garantía de herramienta ligada a serie              F-114 · F-125 · F-127 (sólo línea eléctrica)
  + Entrega a domicilio con la camioneta                F-813 · F-821 · F-822

= LO QUE SE APAGA RESPECTO DE `abarrotes`
  − IVA mixto e IEPS: aquí todo es 16% y no hay IEPS    F-011 simplificada
  − Venta por comisión (recargas, servicios)            F-255 apagada
  − Depósito de envase / casco                          F-256 apagada
  − Caducidad                                           F-146 apagada
  − Restricción legal por horario o edad                F-980 apagada
```

**Lo que este modelo le entrega a sus vecinos.** `ferreteria` no es hoja: de aquí heredan
`materiales-construccion` (que añade flete, granel pesado y báscula de camión), `merceria-telas` (que
se lleva el corte lineal completo), `refaccionaria` (que se lleva los atributos y las equivalencias y
cambia la compatibilidad por vehículo) y `carpinteria-herreria` (que se lleva el corte plano y el
material por obra).

---

## 7 · LO QUE ESTE NEGOCIO **NO** NECESITA

| Función | Por qué NO va, **aquí en concreto** |
|---|---|
| **IEPS y tasa 0%** (F-011 variante de abarrotes) | Todo lo que vende una ferretería causa **16%**. Ni un producto de tasa cero, ni una cuota por litro, ni un régimen ad valorem. La sección más complicada de `02-DINERO-Y-CAJA.md` de `abarrotes` **aquí desaparece entera**, y hay que decirlo porque es una simplificación real, no un olvido. |
| **Venta por comisión** (F-255) | Beto no vende recargas ni cobra la luz. El mostrador está ocupado asesorando y no le sobra la atención. Se apaga con perilla; si algún día pone el servicio, el módulo existe y se enciende. |
| **Casco y envase retornable** (F-256) | El bote de pintura no se devuelve. El único envase que regresa es el **tanque de gas de soldar**, y eso se modela como **renta con depósito** (F-119), no como casco. |
| **Caducidad** (F-146) | Un tornillo no se vence. Hay tres excepciones reales —silicón, pegamento de PVC y pintura en base agua— y se resuelven con la alerta de **sin movimiento**, no con una fecha de caducidad que nadie va a capturar. |
| **Restricción legal por horario y edad** (F-980) | No se vende alcohol ni tabaco. |
| **Propinas** (F-240…F-246) | Ver `02-DINERO-Y-CAJA.md` §4. Aquí **sí hay servicio personal** —una asesoría de ocho minutos— y aun así no hay propina, y eso merece explicarse en vez de copiarse. |
| **Mesas, comandas, cocina, recetas** (F-300…F-322, F-128…F-133) | Igual que en `abarrotes`. No se transforma nada: el material se corta, que no es lo mismo que cocinar. El corte **no consume insumos**: consume el mismo producto. |
| **Agenda y citas** (F-400…F-413) | Nadie agenda comprar un cople. La entrega a domicilio sí tiene fecha, pero eso es F-813, no una agenda. |
| **Fidelidad con puntos y niveles** (F-930, F-931) | El programa de lealtad de una ferretería **es el precio de contratista y el crédito**. Meter puntos encima duplica el mecanismo con peor ergonomía y le enseña al cliente a pedir descuento por dos vías. |
| **Portal QR de pedido** (F-921) | No hay mesa. El portal que sí tiene sentido es **V5, estado de cuenta** (F-925), para que el contratista vea lo que debe sin llamar. |
| **Comisión por profesional** (F-423, F-424) | Deliberado y explicado en `02-DINERO-Y-CAJA.md` §7: comisionar al mostradorista lo empujaría a vender la marca cara en lugar de la que resuelve, y lo que sostiene a una ferretería de barrio es que el consejo sea honesto. |
| **Nómina completa** (F-963, F-964) | Cinco personas. Lo que sirve es saber quién abrió, quién cobró y **quién despachó**, y eso está en F-006 y en F-054. |

---

## 8 · LOS TRES DOLORES

En orden de cuánto le cuestan a Beto **al año**. El sistema los resuelve o no se vende.

### Dolor 1 · El crédito que se fue con la obra

**Es la razón número uno por la que un ferretero compra un sistema, y no es la misma que la del
tendero.** Entre el 25% y el 35% del valor que sale de La Broca sale **sin cobrarse**: material que se
lleva un albañil, firmado en un talonario de papel carbón, a cuenta de un contratista que va a pagar
"cuando le paguen de la obra" — y el sector de construcción trabaja con ciclos de cobro de **60 a 120
días** (ANCapital). Beto no cobra intereses, no tiene contrato y **muchas veces no tiene ni el apellido
completo del que firmó**.

El mecanismo de la pérdida tiene tres puertas, y el sistema tiene que cerrar las tres:

1. **Alguien no autorizado cargó a la cuenta.** El contratista tenía tres albañiles y el cuarto se
   llevó material a su nombre. Cuando llega la cuenta, la desconoce. **F-638.**
2. **No se sabe de qué obra fue.** El contratista lleva tres obras y sólo le pagaron una. Sin
   separación por obra no hay conversación de cobro posible, sólo un número grande. **F-639.**
3. **Nadie miró el saldo antes de despachar.** El material sale a las 7:40, con prisa, y el saldo está
   en una libreta bajo el mostrador. Cuando Beto lo revisa, ya salió. **F-612 en el mostrador, antes
   de despachar, no después de cobrar.**

**Lo que el sistema tiene que dar:** el saldo, la antigüedad y **quién está autorizado**, en la misma
pantalla del mostrador, **antes** de que el material cruce la puerta. Y la remisión firmada como
documento de primera clase, no como un ticket con una nota.

### Dolor 2 · El dinero dormido · cinco mil claves y la mitad no se mueve

Éste es **el inverso exacto del dolor 3 de `abarrotes`**, y por eso importa que quede escrito. Don
Chuy sufre por lo que se le acaba: pierde la venta de una Coca. **Beto sufre por lo que le sobra.** Con
3,000 a 8,000 SKU y una rotación de tres a cinco vueltas al año, buena parte del catálogo lleva meses
sin venderse — y cada clave parada es capital que no está para pagarle a Truper el día 30.

Lo perverso es que **es imposible decidirlo de memoria**. Beto sabe que el cemento se mueve y que la
herramienta eléctrica no, pero no sabe cuál de los 340 tipos de tornillo que tiene no se ha vendido en
seis meses ni cuánto dinero suman. Y cuando llega el vendedor de Truper con la promoción de volumen,
compra **otra vez lo mismo que ya tiene parado**, porque el descuento se ve y el capital dormido no.

**Lo que el sistema tiene que dar:** la lista de claves sin movimiento **valuada a costo y ordenada
por dinero, no por cantidad**, y —lo que de verdad cambia la conducta— la misma información **en el
momento de armar el pedido al proveedor**, junto a cada línea que se va a comprar.

### Dolor 3 · La venta que se pierde en el mostrador

Tres formas, todas diarias, todas invisibles porque **una venta perdida no deja registro**:

- **"No hay"** cuando sí hay, pero está en la gaveta equivocada o nadie se acuerda. Con cinco mil
  claves y un empleado nuevo, esto pasa varias veces al día.
- **"No sé qué necesita"**, porque Chava está ocupado con otro cliente y Diego no sabe qué va con qué.
  El cliente se va a la ferretería de la esquina y a veces ya no vuelve.
- **"No era la medida"**, que es la misma venta hecha dos veces: se despachó, se cobró, regresó, se
  devolvió y se volvió a despachar. Cuesta tiempo de mostrador, que es el recurso escaso del giro.

Y detrás de las tres hay un riesgo mayor: **todo ese conocimiento está en la cabeza de Chava**, que
tiene 58 años. El día que Chava no venga, La Broca pierde la mitad de su capacidad de vender y
**ningún respaldo de base de datos la recupera**.

**Lo que el sistema tiene que dar:** búsqueda por medida y atributo (F-059), equivalencias declaradas
por el propio Chava mientras opera (F-060), foto tomada en el mostrador (F-061), **la ubicación
exacta** (F-152), y las listas de materiales por trabajo (F-153) que convierten *"para un tinaco te
llevas…"* en un dato del sistema. **No es una funcionalidad de comodidad: es la única forma de que lo
que sabe Chava siga en la ferretería cuando Chava ya no esté.**
