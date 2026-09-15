# 00 · FICHA Y EJES · Cafetería de mostrador

**Modelo:** `cafeteria` · **Familia:** 01 Alimentos y bebidas · **Arquetipo:** A2 de mostrador
**Prioridad:** P0 — cliente vivo: **Café Jacaranda**
**Plantilla:** `cafeteria` (antes `operativo`; renombre por decisión **D-01**)

---

## 1 · QUÉ ES ESTE NEGOCIO

Una cafetería de especialidad de mostrador vende **una sola cosa, doscientas veces al día, en tres
horas**. No vende tiempo de mesa: las mesas existen, pero son un servicio gratuito que el cliente
usa o no usa, y nadie las administra. Lo que vende es una bebida que se fabrica en noventa segundos
frente a quien la pidió, y lo que gana depende de tres números que casi ningún dueño tiene: cuántas
bebidas salen por hora en el pico, cuánto cuesta de verdad cada una con su leche y su vaso, y
cuántas de esas personas vuelven mañana.

El ingreso entra por **mostrador y de contado**: el cliente pide en la barra, paga en la barra, y
entonces —y sólo entonces— el barista empieza a prepararla. Eso invierte por completo la mecánica
del restaurante y hay que decirlo con esas palabras: **aquí se cobra antes de que el producto
exista**. La cuenta no crece; nace y muere en cuarenta segundos. No hay comanda que viaje a otra
habitación, porque la cocina está a un metro y es la misma persona. No hay mesero, porque quien
cobra es quien prepara y quien entrega.

Lo que sí hay, y es la tensión que define este modelo, es **espera de pie**. El cliente ya pagó,
está parado a dos metros de la barra, mira cómo se hace su bebida y espera a que le digan su
nombre. Ese intervalo dura de noventa segundos a seis minutos en hora pico, y durante ese rato
existe un objeto que el sistema tiene que conocer: un pedido pagado, sin mesa, con nombre de pila,
esperando. En `restaurante` ese objeto es la mesa. Aquí no tiene equivalente y por eso hay que
construirlo. Si el sistema no lo modela, el pedido vive en un vaso rayado con plumón y en la
memoria de alguien que está vaporizando leche con las dos manos ocupadas.

El segundo rasgo económico que separa a este negocio de todos sus vecinos: **el empaque es el
tercer costo del producto**. Un americano de $45 lleva $7.20 de café, unos $5 de leche si es
latte, y **de $2.50 a $3.50 de vaso, tapa y manga** cuando es para llevar. Eso es del 5.5% al 7.8%
del precio, casi lo mismo que el café. Un restaurante puede ignorar el desechable; una cafetería
que lo ignora está costeando mal todas sus bebidas.

---

## 2 · QUIÉN LO COMPRA

El perfil real de quien firma en México, no el del folleto.

| | Cómo es |
|---|---|
| **Quién es** | Dueña-operadora, 28 a 40 años, muchas veces con una carrera previa fuera del giro. Está en la barra en la ráfaga de la mañana. Sabe de café —fue a un curso, conoce a su tostador por nombre— y sabe poco de números. |
| **Tamaño** | 35 a 70 m². 12 a 24 lugares sentados que **no se administran**. Dos o tres empleados: un barista por turno más ella, un tercero los fines de semana. |
| **Nivel de computación** | Medio. Usa Instagram para el negocio, cobra con Clip o Mercado Pago, lleva el inventario de leche en una libreta o en las notas del teléfono. **Sí lee, pero no tiene tiempo:** todo lo que se capture tiene que caber entre dos clientes. |
| **Qué usa hoy** | Tres escenarios reales: (a) Loyverse gratis en una tablet, sin inventario ni recetas; (b) Parrot o PoloTab, contratado porque se lo recomendaron, con la mitad de los módulos apagados; (c) la terminal de Clip sola, sin punto de venta, y una libreta para los sellos. |
| **Qué paga hoy** | Loyverse: $0, con extras desde ~$90 MXN. PoloTab Esencial: **$990 + IVA**. Parrot Starter: **$1,800 + IVA**. Soft Restaurant Lite: **$799 + IVA**. Y encima, lo que casi nadie presupuesta: **$4,200 MXN al mes de comisión de terminal** en un negocio que vende $200,000 con 70% de tarjeta — más que el software. |
| **Qué puede pagar** | **$600 a $1,200 MXN al mes.** Por debajo de un restaurante, porque vende menos y tiene menos gente. Arriba de $1,500 lo compara con Parrot y decide que su libreta está bien. |
| **Qué la hace firmar** | Que el sistema le diga **cuánto le cuesta de verdad un latte** y **a dónde se le va la leche**. No la hace firmar "la nube", ni el menú digital, ni la integración con Rappi. |

**El contexto económico que la tiene nerviosa.** Su P&L real sobre $250,000 de venta mensual:
insumos $80,000 (32%), nómina $75,000, renta $30,000, servicios $12,000, comisiones + software +
marketing + mermas $33,000, **utilidad neta ~$20,000, o sea 8%**. El margen neto del giro va de
**5% a 15%**, y la regla dura es que si renta más nómina pasan del 50% de las ventas, el neto se
muere. Con $90,000 de costo fijo y ticket de $140, su punto de equilibrio son **919 tickets al
mes**. Es un negocio de centavos repetidos, y por eso el costo por bebida no es un dato bonito:
es el negocio.

---

## 3 · EL DÍA COMPLETO

Café Jacaranda. Barra de cuatro metros, una espresso de dos grupos, un molino de espresso y uno de
filtrado, 18 lugares, 150 a 190 tickets entre semana, 220 el sábado. Dos turnos de barista.

```
05:50  Llega el barista de apertura. Abre con su PIN.
       ── SISTEMA: acceso por PIN. Nada más. Y está bien.

06:00  Enciende la espresso. Tarda de 25 a 30 minutos en estabilizar presión y
       temperatura. Prende el horno para el pan del día. Saca la leche.
       ── SISTEMA: nada. Este hueco es real y no se llena con software.

06:25  ── CALIBRACIÓN DEL MOLINO (dial-in). Saca de 3 a 5 shots y los tira
       hasta que el tiempo de extracción cuadra. Son 54 a 90 gramos de café
       a la basura, todos los días, ~$22 a $36 pesos. Al mes: $700.
       ── SISTEMA: registrar la calibración en UN toque. F-146. Hoy nadie lo
          registra en ningún sistema del mercado y por eso el inventario de
          café nunca cuadra.

06:45  Llega la leche (martes y viernes) y el pan (diario).
       ── SISTEMA: registrar compra, de pie, con la puerta abierta y el
          repartidor esperando. Plantilla de compra recurrente: el pedido de
          leche es SIEMPRE el mismo. Dos toques.

07:00  ── ABRE. RÁFAGA 1 · GRAB-AND-GO (07:00 – 09:00)
       Los de paso: van a la oficina, al camión, a dejar al niño. Piden de
       memoria, pagan con billete de $200 o con tarjeta, se van con el vaso.
       Casi todo PARA LLEVAR. Ticket bajo: una bebida, a veces un pan.
       Diez a veinticinco tickets por hora con dos personas en barra.
       ── SISTEMA: /pos y la pantalla de barra. NADA MÁS. El dashboard no se
          mira, los registros no se abren, el inventario no existe. Aquí el
          sistema tiene que desaparecer: cobrar en cuatro toques y mandar el
          nombre a la barra.
       ── AQUÍ SE PIERDE EL DINERO: el pedido que se entregó a quien no era,
          el que nadie recogió, el cambio que se acabó, la bebida rehecha.

09:00  Baja un poco. Se repone leche en el refrigerador de barra, se limpian
       los grupos, se hornea la segunda tanda.
       ── SISTEMA: merma de barra del arranque. Revisar leche restante.

10:00  ── EL PICO REAL (10:00 – 11:30)
       Contra lo que todo el mundo asume, **la hora de más órdenes en las
       cafeterías mexicanas es las diez de la mañana**, no las siete: los
       datos agregados de Parrot sobre más de 200 cafeterías lo miden así.
       Y es otro cliente: éste ya llegó a donde iba, se queda, pide con
       personalización —leche de avena, medio dulce, extra shot, matcha— y
       gasta más. Sube el ticket, sube el tiempo por bebida, aparece la mesa.
       ── SISTEMA: modificadores. Es LA pantalla del pico: si escoger "leche
          de avena, 16 oz, sin azúcar" cuesta cinco toques, la fila se
          desborda y el barista lo anota en el vaso, que es como decir que
          no se registró.

12:00  Comida ligera. Sándwich, ensalada, segundo café. Ticket más alto.
       ── SISTEMA: igual. El menú de alimentos convive con el de bebidas.

14:30  ── CAMBIO DE TURNO. El barista de la mañana entrega.
       ── SISTEMA: corte de turno. Se cuenta el cajón, se cuenta EL BOTE, y
          se reparte el bote del turno entre quienes estuvieron, por horas.
          El de la mañana se va con su dinero ese día, no a la quincena.

16:00  Valle. Dos o tres clientes. Se hornea, se repone, se pide a proveedor,
       se muele café para la venta de grano en bolsa.
       ── SISTEMA: inventario, compras, recetas. Este es el ÚNICO hueco del
          día donde caben formularios. Todo lo demás es ráfaga o cierre.

18:00  Segundo repunte chico: los que salen de trabajar, los que estudian.

19:30  Última orden. Se apaga la espresso, se purga.

20:30  ── CIERRE. Se cuenta el cajón. Se cuenta el bote. Se cuenta la leche
       que queda, en litros, todos los días sin falta. Se saca el corte.
       ── SISTEMA: cierre diario, arqueo a ciegas, PDF del corte y conteo de
          leche del día. Es el momento en que la dueña decide si el sistema
          le sirve.

21:00  La dueña se va y lee el corte en el teléfono, en el camino.
       ── SISTEMA: el corte se lee en un teléfono, de noche, cansada. Si hay
          que hacer zoom para encontrar el consumo de leche, está mal hecho.
```

**Lo que este recorrido decide y no se decide de otra forma:** la pantalla de inicio es la de
cobrar; la segunda pantalla del sistema es la fila de barra; el modificador de bebida es una
pantalla de primera clase y no un diálogo escondido; el corte es por turno y no por día; y el
dashboard **no se mira en la ráfaga**, se mira a las 10:30 y a las 20:40.

---

## 4 · LOS SEIS EJES

### Ejes del mapa general (`01-MAPA-GENERAL.md` §1)

| Eje | Valor | Por qué |
|---|---|---|
| **E1 · Cómo entra el ingreso** | **E1.1 Mostrador** | Se pide y se paga en el mismo acto, antes de que el producto exista. No hay cuenta que crezca ni que se cierre después. Ésta es la diferencia raíz con `restaurante` (E1.2) y de ella salen casi todas las demás. |
| **E2 · Qué se descuenta** | **E2.5 + E2.6 Peso/volumen + receta**, con **E2.1 pieza** encima | El café se mide en gramos y la leche en mililitros, con receta. Pero el pan, el vaso, la tapa y la bolsa de grano de 250 g son **piezas**, y son entre el 30% y el 45% del ticket. Una cafetería consume las dos cosas en la misma línea de venta. |
| **E3 · Quién atiende** | **E3.1 Empleado genérico, sin matices** | El barista cobra, prepara y entrega. No tiene agenda, no tiene cartera, y **no tiene propina propia**: la propina es del turno. Es E3.1 puro, más puro que en restaurante, donde el mesero sí tiene identidad económica. |
| **E4 · Cuándo se paga** | **E4.1 Contado** | Al momento, antes del producto. Sin anticipos, sin crédito, sin cuenta abierta. La única excepción es el pedido anticipado del portal (F-330), que también se paga al pedir. |
| **E5 · Qué se entrega** | **E5.1 Ticket**, uno solo | **No hay precuenta.** No existe el documento intermedio porque no existe el momento intermedio. El ticket es el único papel del modelo, y muchas veces ni se imprime: el cliente dice "no, gracias". |
| **E6 · Relación con el cliente** | **E6.0 anónima para el 85%, E6.1 identificada para el cliente de sellos** | Se captura el nombre de pila para gritarlo, y ese nombre **no es un cliente**: es una etiqueta que muere en diez minutos. El único cliente de verdad es el que está en el programa de sellos, y ése sí tiene ficha, historial y un pasivo asociado. Es el único giro de la familia donde conviven los dos. |

### Ejes de diseño (`04-SISTEMA-DE-DISENO.md` §2)

| Eje | Valor | Por qué |
|---|---|---|
| **A · Pantalla de inicio** | **Cobrar (`/pos`)** para el barista y la dueña; **Barra** en el monitor fijo | Cobra decenas de veces por hora: el barista no quiere ver gráficas, quiere cobrar. No hay mapa de salón que mirar, porque no hay salón que administrar. La dueña entra también a `/pos` durante el turno y al dashboard sólo cuando se sienta. |
| **B · Acción principal** | **COBRAR** (`/pos`) · **MARCAR LISTO Y LLAMAR** (barra) · **CERRAR TURNO** (caja) | Dos palabras cada una. La de barra lleva dos verbos a propósito: marcar listo sin llamar deja al cliente parado mirando su vaso en la ventana. |
| **C · Unidad de trabajo** | **El pedido con nombre** — en la barra se le dice *"el vaso"* | Todo cuelga de ahí: la fila se ordena por pedido, el llamado es por pedido, el canal (aquí / para llevar) es del pedido y decide el empaque, y el tiempo de espera se mide del cobro a la entrega. No es el ticket —el ticket es el papel— ni la mesa, que no existe. |
| **D · Densidad** | **Baja en operación, alta en el fondo** | El menú de una cafetería son 35 a 55 productos, no 3,000: caben en tarjetas grandes sin buscador. La barra es densidad mínima: dos o tres tarjetas enormes leíbles a dos metros entre vapor. Inventario y registros sí son densidad alta. |
| **E · Dispositivo principal** | **Terminal de mostrador (PC o all-in-one) con segunda pantalla al cliente** → **tablet montada** como pantalla de barra y de recogida → **teléfono** de la dueña | Aquí el dispositivo principal **no es la tablet en la mano**, como en restaurante: es una terminal fija en la barra, con teclado, cajón y una segunda pantalla que mira al cliente. Esa segunda pantalla es la que pide la propina, y que sea del cliente y no del cajero es una decisión de fondo, no de estética. |
| **F · Ritmo de uso** | **Ráfaga de 07:00 a 11:30, episódico el resto** | Cuatro horas y media de ráfaga pura —cero fricción, cero confirmaciones, foco que no se pierde, atajos de teclado— y luego un día casi vacío donde sí caben formularios largos. Restaurante es *sostenido con dos ráfagas*; esto es al revés: **ráfaga con un día sostenido detrás**. |

---

## 5 · ARQUETIPO BASE Y DELTAS

**Arquetipo A2, restado.** La cafetería no es A1 con preparación pegada: es **A2 al que se le
quitó la mesa y se le adelantó el cobro**. Hereda de `restaurante` el catálogo, la receta, el
costeo, la caja, el corte, las compras y los métodos de pago, y **no hereda** el salón, la cuenta
abierta ni la comanda de mesero.

```
A2 MESA Y COMANDA — lo que SÍ se hereda de `restaurante`
  + Núcleo: identidad por PIN, roles, sesiones, auditoría              [⚙]
  + Catálogo, categorías, precios, imágenes, importación por Excel     [⚙]
  + Inventario V6: gramos, mililitros, receta, explosión al cobrar     [⚙]
  + Caja: apertura con fondo, arqueo a ciegas, corte, cierre diario    [⚙]
  + Cobro: efectivo, tarjeta, transferencia, mixto, cambio             [⚙]
  + Compras, proveedores, costo promedio, gastos con categoría         [⚙]
  + Propinas: tronco, desglose exacto por método, liquidación          [⚙]

A2 MESA Y COMANDA — lo que NO se hereda, y es la mitad del arquetipo
  − Zonas, mesas, mapa, estados de mesa       F-300 · F-301 · F-302 · F-303
  − Asignación de mesero, tiempo de ocupación F-304 · F-305
  − Cuenta abierta, dividir cuenta, precuenta F-320 · F-321 · F-322
  − Marcha por tiempos                        F-323
  − Comanda que viaja a otra habitación       F-310 se queda; F-318 no aplica

DELTAS PROPIOS DE LA CAFETERÍA — lo que hay que construir
  + Fila de despacho de mostrador                     F-328  ← el corazón
  + Llamado por nombre y pantalla de recogida         F-329
  + Pedido anticipado con hora de recogida            F-330
  + Consumo de empaque según canal                    F-331  ← el 3er costo
  + Bote de propina del turno repartido por horas     F-248
  + Segunda pantalla al cliente (total y propina)     F-249
  + Merma de barra: calibración, vaporizado, rehechas F-146
  + Frescura del grano por fecha de tueste            F-148
  + Pasivo de lealtad: sellos otorgados sin canjear   F-936
  + Modificadores que cambian precio Y receta         F-027 [≠]
  + Combos café + pan                                 F-030 [≠]
  + Listas de precio: barra / plataforma / mayoreo    F-023
  + Varias cajas simultáneas en fin de semana         F-235
  + Consumo de empleados y cortesías                  F-326 (de `restaurante`)
```

**La respuesta a la pregunta que abre este modelo — ¿qué le falta a `operativo` para ser
honestamente una `cafeteria`?** El mapa apuntaba a F-030 (combos) y F-820 (domicilio). Después de
leer el código de `packageConfig.js` y de investigar el negocio, **el mapa se quedó corto en un
lado y se pasó en el otro**:

1. **Lo que falta de verdad es la fila de barra (F-328 y F-329).** `operativo` cobra y el vaso
   deja de existir. El cliente está parado esperando algo que el sistema no sabe que existe. Es
   el hueco más grande, y ninguno de los tres paquetes actuales lo tiene: `restaurante_pro` tiene
   cocina, que es otra cosa —una habitación aparte, una persona distinta, una comanda que viaja—.
2. **Faltan los modificadores encendidos en mostrador (F-027).** Hoy son parciales y viven en el
   flujo de mesero. En una cafetería el modificador **es** el producto: el tipo de leche cambia el
   precio, cambia el costo y cambia lo que sale del refrigerador. Sin esto la receta miente en el
   60% de las bebidas del pico de las 10:00.
3. **Falta el empaque como insumo por canal (F-331).** Entre $2.50 y $3.50 por bebida para llevar.
   Sin esto, todos los márgenes de la plantilla están inflados entre 5 y 8 puntos.
4. **Sí faltan los combos (F-030)**, pero no como el mapa los imaginaba: no es la comida corrida
   del restaurante, es el par fijo café + pan con precio de paquete, y cada mitad sigue explotando
   su propia receta.
5. **El domicilio (F-820) NO es prioritario, y el mapa se equivocó ahí.** Sólo el **6.22%** de las
   órdenes de cafetería en México son a domicilio, y las plataformas se quedan entre el 29% y el
   35% efectivo del ticket una vez sumado el IVA sobre la comisión. Lo que la cafetería necesita
   no es un módulo de reparto: es **poder cobrar distinto en plataforma (F-023) y registrar la
   comisión como gasto (F-250)**. Eso se resuelve con dos funciones que ya existen en el catálogo
   y cuesta una décima parte. Construir F-820…F-826 para el 6% de las órdenes sería regalarle al
   dueño un módulo que le estorba en la ráfaga.

---

## 6 · LO QUE ESTE NEGOCIO NO NECESITA

Tan importante como lo anterior. En una barra con quince personas en fila, un menú con módulos
muertos cuesta segundos que no hay.

| No necesita | Por qué |
|---|---|
| **Mesas, zonas y mapa (F-300 … F-303)** | El cliente se sienta donde quiere y se levanta cuando quiere. La mesa no es un recurso escaso que alguien asigne: es mobiliario. Encender el mapa de mesas aquí obligaría a alguien a mantener un plano que nadie consulta, y el primer día que no lo mantengan el plano empieza a mentir. |
| **Cuenta abierta, dividir cuenta y precuenta (F-320, F-321, F-322)** | No hay nada que dividir porque nunca hubo una cuenta que creciera. El grupo de cuatro que pide junto son cuatro pedidos con cuatro nombres, y así es como lo quieren ellos. |
| **Mesero y su atribución de propina (F-304, F-246 por persona)** | Quien cobra es quien prepara. Atribuir la propina a "el que atendió" sería atribuírsela al único que hay. |
| **Marcha por tiempos (F-323)** | No hay tiempos. Todo sale cuando está. |
| **Impresión de comanda (F-318)** | La barra está a un metro de la caja y el barista escucha el pedido mientras lo teclea. Imprimir un papel para pasárselo a sí mismo es una función que existe para cocinas con vapor a cuatro metros del monitor, no para esto. |
| **Lote y caducidad completos (F-113, F-122, F-124)** | Con una excepción que sí importa y se resuelve más barato: la leche caduca en cinco a siete días y el café **no caduca, pierde frescura**. Se resuelve con rotación física, un conteo diario de leche y F-148 (fecha de tueste), no con trazabilidad de lote. |
| **Número de serie, matriz talla/color, presentaciones caja↔pieza** | No se revende empaquetado, salvo la bolsa de grano, que es una pieza y ya. |
| **Crédito, cotización, orden de trabajo, agenda, proyecto** | Nadie se lleva un café fiado, nadie cotiza un capuchino, nadie reserva la barra. |
| **Comisión por profesional (F-423, F-424)** | Al barista no se le comisiona. Se le paga sueldo y le toca su parte del bote. |
| **Integración con Rappi / DiDi / Uber Eats (F-826)** | 6.22% de las órdenes. Ver §5, punto 5. |
| **Dashboard de doce indicadores** | Nueve, más cuatro bloques. Ver `04-INTERFAZ.md` §4.4. |

---

## 7 · LOS TRES DOLORES

Lo que de verdad le duele hoy a la dueña de Café Jacaranda. Si el sistema no resuelve estos tres,
no se vende — y ninguno de los tres es el que resuelve un POS de restaurante.

### Dolor 1 · "La leche se me va y no sé en qué"

Compra 40 litros el martes y el jueves ya no hay. La merma de leche en hostelería va del **5% al
15%**, y una cafetería bien llevada debería estar por debajo del 10% — pero nadie la mide, porque
la leche se pierde en cuatro sitios distintos y ninguno deja rastro: el fondo de la jarra que se
tira porque quedó "húmeda", la bebida que se rehace porque el cliente pidió deslactosada, el
derrame, y el cartón que se pasó de fecha. Encima está el café: **el 10% del café de una cafetería
se desperdicia**, entre los tres a cinco shots de calibración de cada mañana y las purgas de dos o
tres gramos cada vez que se cambia la molienda.

*Cómo lo resuelve el sistema:* receta con mililitros reales por bebida y por tamaño (F-128),
explosión al cobrar (F-129), **F-146 — merma de barra con sus cuatro motivos tipados**
(calibración, vaporizado sobrante, bebida rehecha, caducidad de leche) capturable en un toque
desde la propia pantalla de barra, y la sección de **insumos consumidos** del corte, que dice
cuántos litros **debieron** salir contra los que quedan en el refrigerador. La diferencia entre
teórico y contado es el nombre exacto del dinero que se va. Y el conteo de leche es diario, no
semanal, porque es el único insumo del giro que se puede contar en noventa segundos.

### Dolor 2 · "En la ráfaga se me pierden pedidos y le doy el café equivocado a alguien"

Siete y cuarto de la mañana, nueve personas en fila, cuatro vasos en la ventana y tres nombres
escritos con plumón. Alguien se lleva el que no era. Alguien se fue sin su bebida y aparece un vaso
frío a las nueve. Alguien reclama que lleva diez minutos y nadie sabe si es cierto. El control es
la memoria de dos personas que tienen las manos ocupadas.

Y es un dolor con consecuencia económica medible: bajar el tiempo de servicio de tres minutos a dos
permite atender **50% más clientes en la misma hora**. En una ráfaga de cuatro horas y media eso no
es comodidad, es la mitad del día.

*Cómo lo resuelve el sistema:* **F-328 — la fila de despacho**, que es un objeto real con nombre,
canal, hora de cobro y estado; **F-329 — el llamado**, que enciende el nombre en la pantalla de
recogida que mira el cliente, lo dice por voz, y deja registro de cuántas veces se llamó; y el
**tiempo de espera medido del cobro a la entrega**, que es el único indicador operativo de este
giro y hoy no existe en ningún sistema del mercado mexicano. El pedido que nadie recogió deja de
ser un vaso frío y pasa a ser una línea del corte.

### Dolor 3 · "Cada bebida me deja menos de lo que creo"

Vende un latte de $58 y cree que le cuesta $12. Le cuesta $7.20 de café, $5.50 de leche, $3.00 de
vaso, tapa y manga si es para llevar, y encima **3.6% + IVA de comisión de terminal** sobre el 55%
de sus ventas que son con tarjeta. El margen real está entre seis y ocho puntos por debajo del que
le enseña cualquier sistema, porque ningún sistema costea el desechable y ninguno resta la
comisión.

*Cómo lo resuelve el sistema:* **F-331 — el empaque es un insumo de la receta con canal**: la línea
de vaso, tapa y manga sólo se consume cuando el pedido es *para llevar*, y no se consume cuando es
*en taza*. Eso hace dos cosas a la vez: costea bien y, de paso, permite pedir vasos con el número
correcto. Más el **costo por bebida promedio** en el dashboard, más la **comisión estimada de
terminal** como línea propia del corte. Cuando ve que el mismo latte le deja $41 en taza y $38 para
llevar, deja de discutir el precio del café y empieza a discutir el precio del vaso.

---

## 8 · FUENTES DE LA INVESTIGACIÓN

- Hora pico real, ticket promedio, mezcla de bebidas y peso del delivery, sobre datos agregados de
  más de 200 cafeterías mexicanas: [Parrot · Tendencias en cafeterías en México 2026](https://parrotsoftware.com.mx/blog/tendencias-en-cafeterias-en-mexico-2026)
- Tickets por día, márgenes reales, P&L y punto de equilibrio: [PoloTab · ¿Cuánto vende y gana una cafetería en México?](https://www.polotab.com/blog/cuanto-vende-y-gana-una-cafeteria-en-mexico-margenes-reales)
- Costo de apertura y estructura de gasto: [PoloTab · ¿Cuánto cuesta abrir una cafetería en México? 2026](https://www.polotab.com/blog/cuanto-cuesta-abrir-una-cafeteria-en-mexico-desglose-2026)
- Precios de software y comisiones de terminal: [PoloTab · ¿Cuánto cuesta un POS en México?](https://www.polotab.com/blog/cuanto-cuesta-un-sistema-de-punto-de-venta-en-mexico), [Soft Restaurant · Precios](https://softrestaurant.com/soft-restaurant-precio)
- Precio del grano de especialidad al mayoreo: [Kraken Café](https://krakencafe.mx/cafe-de-especialidad-al-mayoreo/), [Almanegra](https://almanegra.cafe/collections/cafe-en-grano-y-molido)
- Merma de leche, cálculo y rangos normales: [Coffee Sapiens · Mermas de leche en cafeterías](https://www.coffeesapiens.org/mermas-de-leche-en-cafeterias-como-calcular-y-reducir-el-desperdicio-diario-de-forma-eficaz/)
- Desperdicio de café por calibración y purga del molino: [Bridge Coffee Roasters](https://bridgecoffeeroasters.co.uk/blog/coffee/grinderwastage)
- Costo del empaque: [PackGreen · Vaso para bebida caliente 12 oz](https://packgreen.com.mx/products/vaso-cafe-m)
- Comisiones de delivery y el IVA sobre la comisión: [PoloTab · Delivery, comisiones y rentabilidad 2026](https://www.polotab.com/blog/delivery-para-restaurantes-comisiones-y-rentabilidad-mexico-2026)
- Propinas, LFT art. 346 y postura de Profeco: [PoloTab · Propinas en restaurantes](https://www.polotab.com/blog/propinas-en-restaurantes-en-mexico-legal-y-fiscal)
- Pago con efectivo y tarjeta por rango de monto: [INEGI/CNBV · ENIF 2024](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/enif/ENIF2024_CP.pdf)
- El nombre en el vaso, retiro y regreso: [Milenio](https://www.milenio.com/negocios/starbucks-dejo-de-escribir-nombres-en-vasos-por-esta-razon), [Entrepreneur](https://spanish.entrepreneur.com/noticias/brian-niccol-busca-revitalizar-starbucks-y-adquiere-200000/482222)
- Tarjetas de sellos digitales en México: [Loyabit](https://loyabit.com/para/cafeterias), [Spoonity](https://www.spoonity.com/es/programa-de-lealtad-mexico/)
