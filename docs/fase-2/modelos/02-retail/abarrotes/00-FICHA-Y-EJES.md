# 00 · FICHA Y EJES · Abarrotes / tienda de conveniencia

**Modelo:** `abarrotes` · **Familia:** 02 Retail y mostrador · **Arquetipo:** A1 puro
**Cliente vivo:** Abarrotes Don Chuy · giro `tienda` · paquete `operativo`
**Plantilla destino:** `tienda` (D-01)

> **Lee esto antes que nada.** Ésta es la carpeta raíz del arquetipo Mostrador. Diecinueve modelos
> de retail heredan de aquí: ferretería, papelería, farmacia, boutique, dulcería, vinatería,
> refaccionaria, agroveterinaria, mercería, vapes, tienda de mascotas, joyería, zapatería,
> mueblería, florería, óptica, materiales, electrónica y ecommerce. Lo que quede bien definido aquí
> se cita por ID y no se vuelve a construir. Lo que quede flojo se va a reescribir diecinueve veces.

---

## 1 · QUÉ ES ESTE NEGOCIO

Una tienda de abarrotes vende **producto que otro fabricó, empaquetado, a la gente que vive a
menos de tres cuadras**. No transforma nada: compra a $8.50 y vende a $11. Todo su negocio cabe en
esa diferencia, y esa diferencia es chica. El margen bruto de una tiendita mexicana ronda el **20%**
(15–30% según surtido, tiendaya/Compartamos), y la utilidad neta acaba entre **8% y 15%** de la
venta (El Financiero). Con una venta mensual promedio de **$40,000** —el rango real va de $30,000 a
$120,000— la utilidad del mes de una tienda normal son unos **$8,000 a $9,000**. Eso es lo que hay
que defender, y se defiende peso a peso.

El dinero entra en **ráfagas de monedas**. Entre 50 y 400 tickets al día, de **$20 a $80** cada
uno, con el cliente parado enfrente esperando. ANPEC reporta que en 2026 el ticket subió a
$100–$200 por la inflación, pero la forma de la venta no cambió: sigue siendo un refresco, una
bolsa de Sabritas y un pan, cobrados en menos de treinta segundos. Cuando hay tres personas
formadas y el de atrás nada más quiere una Coca, el sistema tiene exactamente una función:
no estorbar.

La composición del surtido decide el margen y casi nadie la tiene medida. Refresco, cerveza y
cigarro son **volumen sin margen** (8%–15%): traen al cliente a la puerta y no dejan casi nada.
Botana, dulce, granel e higiene son los que **sostienen la utilidad** (25%–45%). Una tienda puede
vender muchísimo y ganar poco si su mezcla se corrió hacia el refresco. Ésa es la primera pregunta
que el sistema tiene que poder contestar y que hoy el tendero contesta con el estómago.

Y encima del producto hay un segundo negocio que casi ningún punto de venta modela: **la comisión**.
Recargas telefónicas al **6%** (TAECEL), pago de servicios de **$3** (Clip) a **$22** por operación
(Yastás), paquetería de Mercado Libre a **$6 por paquete** (Expansión, 2026). En estos servicios el
dinero que entra al cajón **no es venta**: es dinero ajeno en tránsito. Sólo la comisión es ingreso.
Un sistema que registra los $500 de una recarga como venta destruye el margen reportado y hace que
el corte no cuadre nunca. Esto no es un detalle: es la diferencia entre un POS que sirve en una
tiendita y uno que no.

---

## 2 · QUIÉN LO COMPRA

**Don Chuy, 54 años.** Abrió hace diecinueve años en la cochera de su casa y fue tirando la pared.
La tienda mide 40 m², tiene tres pasillos, dos refrigeradores en comodato de Coca-Cola, un congelador
propio y el mostrador a la entrada con el cajón de madera. Vive arriba.

| | |
|---|---|
| **Empleados** | Él, su esposa Lupita y un sobrino que entra de 16:00 a 21:00. Tres personas, ninguna con contrato escrito. |
| **Computación** | WhatsApp, Facebook y banca por celular. No usa Excel. Escribe con dos dedos. **Lupita sí sabe**: ella es la que va a operar el sistema los primeros meses. |
| **Qué usa hoy** | Una **libreta profesional** para el fiado, con una hoja por cliente. Una calculadora Casio en el mostrador. Los precios, en la cabeza. El inventario, en el ojo: "ya se está acabando el aceite". |
| **Qué le han vendido** | Le ofrecieron eleventa (MonoCaja **$1,499**, licencia de por vida) y no la compró porque "hay que capturar todo". Probó Tiendatek (gratis) dos semanas y lo dejó porque el celular se calentaba. Le cotizaron MyBusiness POS en **$3,790** y Aspel CAJA en **$5,237 + IVA**. |
| **Qué puede pagar** | **$450 a $700 al mes**, si el sistema le demuestra que le ahorra más que eso. Un solo pago de $5,000 no lo va a hacer. La renta mensual de Morphiq le encaja; el equipo no. |
| **Hardware que ya tiene** | Una laptop de 2019 que usa Lupita. Nada más. |
| **Hardware que hay que venderle** | Lector USB ($350–$1,800), impresora térmica 80 mm ($850–$2,200), cajón de dinero ($322–$1,500). Un kit armado se consigue en **$2,999** (Coppel). La báscula con salida a POS ($460–$1,100) es fase dos. |

**El contexto que explica la venta.** El 90% de los pequeños comerciantes no ha recibido ninguna
capacitación digital y el 78% opera sin relación bancaria (ANPEC). El tendero no es un usuario que
"aún no se digitaliza": es un usuario al que **todos los sistemas anteriores le fallaron**. La
objeción número uno no es el precio, es **"¿y quién va a capturar los mil productos?"**. Cualquier
plantilla de abarrotes que no conteste esa pregunta en la primera demostración no se vende.

---

## 3 · EL DÍA COMPLETO

Martes normal. Los picos son a las 8:00, a las 14:00 y a las 19:00, y el fuerte es el de la tarde.

| Hora | Qué pasa | Dónde toca el sistema |
|---|---|---|
| **06:40** | Llega el de **Bimbo**. Entra con su charola, retira el pan de ayer y acomoda el fresco. Deja nota. Bimbo maneja más de 57,000 rutas y visita casi a diario; el caducado se lo lleva él. | **Entrada de compra** (F-632) con **canje/devolución** en la misma nota. Si el sistema no sabe restar lo devuelto, el stock de pan siempre está inflado. |
| **07:00** | Abre. Lupita cuenta el fondo del cajón: $800 en monedas y billetes chicos. | **F-230 apertura con fondo**. Se cuenta antes de que la pantalla diga nada, y queda la diferencia contra lo que se dejó ayer. |
| **07:10–09:30** | **Primer pico.** Niños de la primaria, gente rumbo al trabajo. Tickets de $12 a $35: pan, leche, refresco, cigarro suelto, una recarga de $50. Entre 60 y 90 tickets en dos horas. | **Escanear y cobrar.** Nada más. Es la ráfaga más cerrada del día. |
| **09:30** | Pasa el **preventista de Coca-Cola FEMSA**, día fijo de ruta. Levanta pedido; el camión entrega mañana. El cooler es comodato sin costo y se surte sólo con producto de la marca. | **Sugerencia de pedido** desde el stock y la venta de los últimos 14 días. Es el momento en que el sistema paga la renta del mes. |
| **10:00–13:00** | Valle. Doña Meche paga la luz ($1,240 de recibo, comisión $8 al cliente). Lupita repone anaquel del almacén de atrás y marca precios a mano. Pasa el de Sabritas y acomoda su exhibidor. | **F-255 venta por comisión** (el recibo NO es venta). **Reposición de anaquel** — movimiento entre almacén y piso. Etiquetas de precio. |
| **13:00–15:30** | **Segundo pico.** Comida: tortillas no, pero sí refresco de 2 L, aceite, jitomate, huevo por pieza, frijol a granel. Ticket más alto, $60–$140. | **Venta a granel** (F-144): se pesa el frijol, se teclea el peso. **Presentaciones**: refresco suelto contra la caja de 12. |
| **15:30** | Don Chuy va a la **central de abasto** cada quince días; los martes intermedios va al mayorista de la avenida. Paga de contado. Trae abarrote seco y granel. | **Compra con varios productos, costo actualizado** (F-633). El costo promedio ponderado es lo que hace que el margen del dashboard sea verdad. |
| **16:00–18:00** | Entra el sobrino. Valle. Llegan las señoras del fiado a abonar; es martes, día de pago de la maquila de la esquina. | **F-254 cobro de fiado**: entra efectivo al cajón y **no es venta**. Éste es el movimiento que más descuadra las cajas del giro. |
| **18:00–21:00** | **Pico grande.** Regreso a casa. Cerveza (con casco), botana, refresco, pan, cigarros, garrafón. Hasta 140 tickets. Fila de tres o cuatro personas de forma constante. | **Ráfaga máxima.** Atajos de teclado, foco que no se pierde, cero diálogos modales. El escáner es lo único que importa. |
| **21:00** | Corte de turno del sobrino: entrega el efectivo que le tocó y se va. La tienda sigue abierta. | **F-233 corte de turno**, que **no cierra** la caja. |
| **21:00–22:30** | Cola larga: refresco de última hora, cerveza. En muchos municipios la venta de alcohol se corta a las 22:00 o 23:00 entre semana. | **F-980 restricción legal por horario**: el sistema bloquea la línea, no el ticket. |
| **22:30** | Cierre. Lupita cuenta el cajón a ciegas, aparece la diferencia, se imprime y se manda el PDF por WhatsApp a Don Chuy que ya está arriba. | **F-232 arqueo a ciegas** + **F-234 corte diario y su PDF**. |
| **22:45** | Don Chuy lee el corte en la cama. Lo que ve ahí decide qué pide mañana y a quién le va a dejar de fiar. | El corte es el **único** momento del día en que este dueño se sienta a leer. Todo lo que quieras que decida, va ahí. |

**Lo que este día desbloquea:** la pantalla de inicio no es un dashboard, es la de cobro; el
dispositivo principal es la PC con lector del mostrador; el teléfono es del dueño y sólo sirve para
leer; el corte no es un trámite contable, es el informe de gestión del negocio; y la compra a
proveedor no es un módulo de oficina, ocurre **doce veces a la semana, de pie, con el preventista
esperando**.

---

## 4 · LOS SEIS EJES DEL MAPA GENERAL

| Eje | Valor | Por qué |
|---|---|---|
| **E1 · Cómo entra el ingreso** | **E1.1 Mostrador**, con un delta de **E1.4 crédito** | El cliente está enfrente y se va con el producto en la mano. El fiado no cambia eso: cambia cuándo se paga, no cuándo se entrega. |
| **E2 · Qué se descuenta al cobrar** | **E2.2 Presentaciones** (contiene E2.1 pieza) | Se compra la caja de 24 refrescos y se venden 24 piezas sueltas, o la caja entera. La existencia tiene que poder expresarse en las dos unidades o el tendero no la va a creer. |
| **E3 · Quién atiende** | **E3.1 Empleado genérico** | Da igual si cobra Lupita o el sobrino. No hay agenda, no hay cartera, no hay comisión. Lo que sí importa es **quién abrió y cerró la caja**, que es otra cosa. |
| **E4 · Cuándo se paga** | **E4.1 Contado**, con delta **E4.4 crédito** | El 95% es contado. El **78% de los tenderos fía** (ANPEC) y ese 5% restante es el que se vuelve incobrable. |
| **E5 · Qué se le entrega** | **E5.1 Ticket**, con delta **E5.2 factura** | El ticket de 58/80 mm es lo normal. La factura aparece cuando llega el del taller mecánico a comprar café y refrescos para su oficina. Y existe la **factura global mensual** obligatoria en RESICO. |
| **E6 · Relación con el cliente** | **E6.0 Anónima** en el 95%, **E6.3 cuenta con saldo** en los fiados | No se le pide el nombre a nadie. Los treinta o cuarenta clientes de la libreta sí son personas con nombre, teléfono y saldo. |

---

## 5 · LOS SEIS EJES DE DISEÑO

| Eje | Valor | Consecuencia concreta en la pantalla |
|---|---|---|
| **A · Pantalla de inicio** | **Cobro** | Al entrar con PIN, el cursor ya está parpadeando en el campo del código. Cero clics para empezar a vender. El dashboard vive detrás de un botón. |
| **B · Acción principal** | **ESCANEAR** | No hay botón de "escanear". El escaneo **es** el estado por omisión de la pantalla. La única tecla que se presiona en la venta normal es Enter, y ni siquiera: el lector la manda. |
| **C · Unidad de trabajo** | **El ticket** | La navegación, el vocabulario y el dashboard giran alrededor del ticket. No hay mesa, ni cuenta abierta, ni orden. Un ticket nace, crece diez segundos y se cierra. |
| **D · Densidad** | **Alta** | Mucha fila, poca decoración, cifras tabulares, filas de 32 px. Nada de tarjetas grandes con imagen: son 1,800 productos, no doce platillos. |
| **E · Dispositivo principal** | **PC con lector** · secundario teléfono (dueño) · terciario tablet | El layout de PC se diseña primero y con atajos de teclado reales. El teléfono es **de sólo lectura y decisión**: el dueño no cobra desde el teléfono. |
| **F · Ritmo** | **RÁFAGA pura** | Cero modales en el camino feliz. Cero confirmaciones. Cero animaciones de entrada. Deshacer inmediato en vez de confirmar por adelantado. Un diálogo de tres pasos aquí es un desastre. |

**La regla de oro de este modelo, que los otros 18 heredan:**

> Si escanear no es instantáneo, el sistema no sirve. Todo lo demás —inventario, márgenes,
> reportes, fiado— es verdad únicamente si la gente escanea. Y la gente escanea sólo si escanear
> es más rápido que teclear el precio. **El escáner no es una funcionalidad: es el contrato.**

---

## 6 · ARQUETIPO BASE Y DELTAS

```
A1 MOSTRADOR  (puro — este modelo ES el arquetipo)
  + Inventario V2 · stock simple por pieza              F-111
  + Inventario V3 · presentaciones caja ↔ pieza         F-112 · F-120 · F-121
  + Código de barras como eje de toda la operación      F-029 · F-986 · F-147
  + Venta a granel con báscula                          F-144 · F-983 · F-148
  + Alertas de mínimo y sugerencia de pedido            F-107
  + Fiado de libreta (crédito informal)                 F-610…F-618 en variante
  + Venta por comisión (recarga, servicios, paquetería) F-255  ← NUEVA
  + Envase retornable con depósito de casco             F-256  ← NUEVA
  + Caducidad sin lote                                  F-146  ← NUEVA
  + Restricción legal de venta por horario y edad       F-980
  + IVA mixto 0% / 16% + IEPS por producto              F-011 en variante
  + Factura global mensual (RESICO)                     F-940 · F-942
```

**Lo que hereda cada vecino de esta carpeta:**

| Modelo | Qué se lleva tal cual | Qué añade |
|---|---|---|
| `ferreteria` | Todo A1 + V3 + código de barras + granel | Corte de material (F-145), venta por metro, mucho producto sin código |
| `papeleria` | Todo A1 + V2 | Servicios de copia e impresión (productos sin stock) |
| `farmacia` | Todo A1 + V3 | V4 lote y caducidad completo, receta, controlados |
| `dulceria` | Todo A1 + V2 + granel | Nada más. Es este modelo con menos SKU |
| `vinateria` | Todo A1 + V3 + F-980 + F-256 casco | Horario legal más estricto |
| `vapes-tabaqueria` | Todo A1 + V3 + F-980 | Restricción de edad dura |
| `boutique` · `zapateria` | Todo A1 + V2 | Matriz talla/color (F-033), apartado |
| `agroveterinaria` · `tienda-mascotas` | Todo A1 + V3 + granel | Dosis por peso, V4 |
| `merceria-telas` | Todo A1 + granel | Venta por metro |
| `refaccionaria` · `electronica` | Todo A1 | V5 número de serie, compatibilidad |

---

## 7 · LO QUE ESTE NEGOCIO **NO** NECESITA

Tan importante como lo que sí. Un sistema que enseña lo que no usas es un sistema difícil, y en
este giro "difícil" significa "no se usa".

| Función | Por qué NO va |
|---|---|
| **Propinas** (F-240…F-246) | **No existen en una tiendita.** Nadie deja propina por venderle una Coca. Encender la pantalla de propina en el cobro metería un paso en la única pantalla que no puede permitirse ninguno. Se apaga completa, y **no aparece en cero en el corte**. |
| **Mesas, zonas, comandas, cocina** (F-300…F-322) | No hay salón, no hay preparación, no hay hueco entre pedir y recibir. El producto ya existe en el anaquel. |
| **Agenda y citas** (F-400…F-413) | Nadie agenda comprar leche. |
| **Recetas y escandallo** (F-128…F-133) | No se transforma nada. La galleta llega galleta y se vende galleta. Encender recetas aquí obliga a capturar una receta por SKU para 1,800 SKU: es el camino más rápido a que el tendero abandone el sistema. |
| **Comisión por profesional** (F-423, F-424) | Al que cobra no se le comisiona: se le paga sueldo. |
| **Cuenta abierta / precuenta** (F-320, F-322) | El ticket vive diez segundos. No hay nada que dejar abierto ni que revisar antes de pagar. |
| **Órdenes de trabajo** (F-500…F-515) | No entra nada a reparar. |
| **Portal QR de pedido en mesa** (F-921) | No hay mesa. Si algún día hay pedido en línea, es el portal V2 (F-922), que es otro producto. |
| **Fidelidad con puntos y niveles** (F-930, F-931) | El programa de lealtad de una tiendita **es el fiado**. Meter puntos encima es duplicar el mismo mecanismo con peor ergonomía. |
| **Varias cajas simultáneas** (F-235) | Un mostrador, un cajón, una persona. Se deja apagado y se enciende sólo en la tienda de dos cajas. |
| **Nómina completa** (F-963, F-964) | Tres personas sin contrato escrito. Lo que sí sirve es saber quién abrió y cerró caja, y eso ya está en F-006. |

---

## 8 · LOS TRES DOLORES

Los tres que este dueño tiene hoy, en orden de cuánto le cuestan. El sistema los resuelve o no se
vende: no hay un cuarto argumento de venta.

### Dolor 1 · El robo hormiga · *"me falta producto y no sé quién"*

**Es la razón número uno por la que un tendero compra un sistema.** La merma del retail mexicano
está en **1.59% sobre ventas** (ANTAD) y el robo hormiga se mide entre **1.5% y 2.5%** de las
ventas. Y el dato que duele: **alrededor del 42% de las pérdidas son robo interno**, del propio
personal. Sobre $40,000 de venta mensual, eso son **$600 a $1,000 al mes** que se van — más que la
renta del sistema.

En una tiendita el robo tiene tres caras y hay que distinguirlas porque se combaten distinto:
el cliente que se echa la botana en la bolsa, el empleado que cobra y no registra, y el empleado
que registra de menos. El arqueo no ve ninguna de las tres: el cajón **cuadra perfecto** porque
el dinero que no entró tampoco se esperaba.

**Lo que el sistema tiene que dar:** un número, por producto, que diga *debería haber 14 y hay 9*.
Eso exige que el ledger sea confiable (F-101), que el conteo físico exista (F-106, F-149) y que la
diferencia se calcule sola. Sin conteo físico el sistema enseña el síntoma y no el diagnóstico —el
mismo hueco que tiene hoy `restaurante`, y aquí es el argumento de venta entero.

### Dolor 2 · El fiado que no vuelve

El **78% de los tenderos fía** (ANPEC) y el **79.83%** reporta que cada vez se lo piden más, con un
alza del 30% en solicitantes. El **63.37%** reportó pérdidas de al menos 20%. La libreta tiene tres
problemas que no son de escritura: no suma sola, no dice hace cuánto, y **no se puede consultar
mientras hay fila**. Cuando llega el que debe $840 a pedir un kilo de tortillas fiado, Don Chuy no
va a detener la fila para hojear la libreta. Le fía. Otra vez.

**Lo que el sistema tiene que dar:** el saldo y la antigüedad **en la misma pantalla de cobro, sin
salir de ella**, y un aviso que aparezca **antes** de que se meta el producto a la bolsa. Después
ya no sirve.

### Dolor 3 · No saber qué pedir · el dinero dormido en el anaquel

El tendero tiene su capital de trabajo entero convertido en producto. Si se le acaba el aceite,
pierde la venta y al cliente; si se le cargan doce cajas de un refresco que no rota, ese dinero no
está para pagarle al de Bimbo. Y encima le compra a **doce proveedores distintos con doce ritmos
distintos**: Bimbo a diario, Coca con día fijo de preventa, Sabritas semanal, central de abasto cada
quince días, mayorista los martes intermedios. Nadie puede llevar eso en la cabeza, y todos lo
intentan.

**Lo que el sistema tiene que dar:** cuando llega el preventista de Coca a las 9:30, una lista —de
sus productos, no de todos— con lo que hay, lo que se vendió en 14 días y cuánto sugiere pedir. En
treinta segundos, en la pantalla, de pie. Es la función que convierte el sistema de "gasto" en
"herramienta", y es la que ningún competidor de este segmento hace bien.
