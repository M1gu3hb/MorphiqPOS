# 02 · DINERO Y CAJA · Estética / salón de belleza

**Éste es el archivo más importante de la carpeta.** Todo lo que sigue se apoya en tres reglas de la
Fase 1 que no se negocian: **bigint de centavos** (nunca flotantes), **precios y totales siempre en
el servidor** (el endpoint no acepta importes del cliente), y **el arqueo va a ciegas** con el
esperado calculado por el servidor.

> **La frase que hay que tener en la cabeza leyendo todo esto:** en una tiendita, la mitad del dinero
> del cajón es de terceros lejanos —la compañía de luz, el que recarga su teléfono—. En un salón,
> **la mitad del dinero del cajón es de la persona que está parada al lado de la caja.**
>
> Y no es un solo tipo de dinero suyo: son **dos, con naturaleza contraria**.
> La **comisión** es dinero del salón que el salón le debe por trabajar: es un **gasto**, se causa
> sobre la venta, y el salón decide su tasa.
> La **propina** nunca fue del salón: es dinero de la clienta para la estilista que pasó por el
> cajón de rebote: es un **pasivo**, no se causa sobre nada, y el salón no tiene voz en su monto.
>
> **Los dos salen del mismo cajón la misma noche, y confundirlos es el descuadre número dos del
> giro.** Distinguirlos es el eje de este documento.

---

## 1 · QUÉ CUENTA COMO VENTA Y QUÉ NO

La venta de este negocio es **el importe de los servicios efectivamente prestados más el producto
entregado, registrados en un ticket cerrado**. Ni un peso más, sin importar cuánto entró al cajón ni
cuánto salió.

| Concepto | ¿Es venta? | Tratamiento exacto |
|---|---|---|
| **Servicio prestado y cobrado** | **Sí** | El caso del 80%. `ordenes.total_centavos`, IVA 16% extraído. **Cada línea trae su profesional**, porque de ahí sale la comisión. |
| **Producto de reventa** | **Sí** | El shampoo de $380. Es A1 puro y se comporta como una venta de abarrotes: baja stock del anaquel al cobrar. Comisiona distinto (F-424). |
| **Propina, en cualquier método** | **NO. Nunca.** Regla de Fase 1 | No entra en ventas, ni en utilidad, ni en costo, ni en margen. Si entró por terminal, es un **pasivo** del salón hacia la profesional (F-260). Si entró en efectivo a la mano, **ni siquiera pasó por el cajón**, pero **sí se registra** — ver §4. |
| **Anticipo de cita cobrado** | **NO todavía.** Es un pasivo | Entran $300 al cajón por un balayage del jueves. El servicio no se ha dado. Si se reconociera hoy como venta, el jueves la venta saldría de $1,550 cuando de verdad fueron $1,850 y el margen del mes se desordena. **Se reconoce el día del servicio**, al aplicarlo al ticket. **F-414**. |
| **Anticipo perdido por no-show** | **Sí, pero NO como venta de servicio** | La clienta no vino y se queda el anticipo. Es **ingreso por cancelación**, en su propio renglón. Meterlo en venta de servicio infla el ticket promedio y —peor— **hace creer que hubo un servicio que nunca ocurrió**, con lo que la ocupación y la comisión salen mal. Y sobre esos $300 **no se paga comisión**, salvo que la regla lo diga (F-440). |
| **Paquete de sesiones cobrado** | **NO al cobrar. Sí al consumir cada sesión** | Seis sesiones de tratamiento, $3,600 hoy, consumidas en tres meses. Al cobrar entra dinero y nace un pasivo de seis sesiones. **Cada sesión consumida reconoce $600 de venta.** Ver §6.2. |
| **Renta de estación cobrada** | **NO es venta de servicio. Es otro ingreso** | Los $1,200 de Sol. Si entran como venta, el ticket promedio y la ocupación del salón mienten, porque hay ingreso sin cita. Renglón propio. **F-441**. |
| **Lo que factura la independiente que renta** | **NO, en absoluto.** No es dinero del salón | Sol cobró $2,800 el sábado. Nada de eso es del salón. Si Sol usa el cobro del salón por comodidad, **el dinero entra al cajón y sale igual**: es tránsito puro, como una recarga en `abarrotes`. Y el salón le puede cobrar el uso de la terminal, que **sí** es ingreso. |
| **Rehacer sin cobro (garantía)** | **No es venta** | El color se corrió, se corrige gratis. **Consume producto, ocupa un hueco y por omisión no paga comisión.** Va a su propio renglón y el costo se imputa al servicio original, no al aire. **F-444**. |
| **Cortesía: servicio a la dueña, a una empleada, a una amiga** | **No es venta** | Pero consume producto y ocupa un hueco. Si no se registra, aparece como merma y acusa a alguien; si se registra como venta en $0, ensucia el ticket promedio. Renglón propio, valuado a **costo**. |
| **Descuento** | Resta de la venta | Y **le baja la comisión a quien atendió**, si la regla dice "sobre lo cobrado". Ésa es la pelea y por eso el descuento aparece con nombre, con quién lo aplicó y con su efecto en comisión. Ver §3. |
| **Producto de cabina consumido** | **No es venta.** Es costo | El tinte que se fue en la cabeza. Sale de stock cuando se **cierra el servicio**, no cuando se cobra. Ver §1.1. |
| **Merma de cabina (mezcla sobrante)** | **No es venta.** Es pérdida | 10%–20% de cada mezcla se va al bote y es estructural. Valuada a **costo**, en su propio motivo. |
| **Ticket en $0.00** | No es venta | Se depuran igual que en `restaurante`. Nunca entran al corte. |

### 1.1 · La prueba de que está bien

```
Dinero que debería haber en el cajón al cierre
  = fondo de apertura
  + servicios y productos cobrados en efectivo
  + anticipos de cita cobrados en efectivo          ← F-414 · NO es venta
  + renta de estación cobrada en efectivo           ← F-441 · NO es venta de servicio
  + propinas recibidas en efectivo QUE PASARON POR CAJA   ← F-243 · NO es venta
  − liquidaciones de comisión pagadas               ← F-259 · NO es gasto genérico
  − propina de terminal entregada en efectivo       ← F-260 · cancela un pasivo
  − devoluciones pagadas en efectivo
  − gastos y compras pagados en efectivo
  − retiros

Y NINGUNO de los seis renglones marcados toca "Total ventas".
```

**Y la segunda prueba, que es la que este giro necesita y ningún otro:**

```
Venta de servicio del día
  = Σ (líneas de servicio de tickets cerrados hoy)
  + Σ (sesiones de paquete consumidas hoy, a su valor unitario)
  − devoluciones de servicio

  ≠ lo que entró al cajón
  ≠ lo que se le paga a las profesionales
  ≠ lo que el salón se queda

Lo que el salón se queda
  = venta de servicio
  − comisión causada                    (40%–60% en el caso de comisión pura)
  − producto de cabina consumido        (8%–15% del servicio)
  + venta de producto de reventa − su costo − su comisión
  + renta de estación
  + ingreso por cancelación
```

**Si para saber cuánto le quedó al salón hay que restar la comisión a mano, el sistema está mal.** Un
margen que no reste la comisión dice que un tinte de $950 deja 88%. Deja 38%. **Es el número más
engañoso del giro y el que más daño hace**, porque sobre él se fijan los precios.

---

## 2 · IMPUESTOS

**Aquí este modelo es más simple que `abarrotes` y casi idéntico a `restaurante`.** Hay que decirlo
con claridad porque es una de las poquísimas partes donde no hay trabajo nuevo.

### 2.1 · IVA · tasa única del 16%

Los servicios de belleza causan **IVA al 16%, sin excepción**. Los cosméticos y productos de
cuidado personal también. **No hay tasa 0%, no hay exentos y no hay IEPS.** Toda la maquinaria de
IVA mixto por grupo de tasa que `abarrotes` tuvo que construir aquí **existe y se queda apagada por
plantilla**.

- **Precio al público, siempre.** El menú de servicios dice $950 y se cobran $950. Nadie en el giro
  pone "+IVA".
- **Se extrae del total, una sola vez**, exactamente como en `restaurante`:
  `impuestos = total − round(total / 1.16)`. Sin grupos, sin líneas, sin deriva de centavos.
- El producto de reventa entra en el mismo grupo. No hay que separarlo.

### 2.2 · La complicación real, que no es la tasa

**La propina no causa IVA** y no debe entrar nunca en la base gravable. Suena obvio y es el error
más común de los sistemas del segmento: cobran $1,130 de servicio + $150 de propina, extraen el IVA
de $1,280 y le regalan $20 al SAT todos los días. El desglose tiene que ser:

```
Servicios y producto     $ 1,130.00     ← base, IVA extraído: $155.86
Propina                  $   150.00     ← NO causa IVA, NO es venta
─────────────────────────────────────
Cobrado                  $ 1,280.00
```

**El anticipo sí causa IVA al cobrarse**, porque el SAT reconoce el anticipo como acto gravado. Pero
**no es venta todavía**. Ésa es la única asimetría fiscal del modelo y hay que respetarla: el
anticipo entra a la base de IVA del mes en que se cobra, y a la venta del mes en que se presta el
servicio. Si el sistema los une, uno de los dos números sale mal.

### 2.3 · Régimen del negocio

**RESICO persona física** en la mayoría de los casos. Límite de $3.5 millones anuales, ISR de 1% a
2.5% **sobre ingresos efectivamente cobrados**. Un salón de tres estaciones que factura $180,000 al
mes está en $2.16 M al año: dentro, pero cerca.

**Y hay que decir la verdad incómoda del giro: la informalidad es la norma.** Una parte grande de los
310,000 establecimientos de belleza de México no factura, no tiene a su gente en el IMSS y opera en
efectivo. Eso tiene dos consecuencias de producto, y ninguna es moral:

1. **El sistema no puede exigir RFC para operar.** Si al abrir pide régimen fiscal y datos del SAT,
   no se instala. La facturación es un módulo que se enciende cuando hace falta.
2. **El sistema no debe esconder el dato.** Registrar la venta completa, aunque no se facture, es lo
   que le permite a Paty saber cuánto gana de verdad. Que después facture lo que decida es asunto
   suyo. Un POS que ayude a llevar dos contabilidades sería una mala herramienta y un mal producto.

**Factura global mensual** cuando se emite, con el mismo mecanismo que `abarrotes` §9.5: suma de las
ventas al público en general no facturadas individualmente, plazo de emisión de **24 horas** desde
2026. Aquí sale más fácil porque es una sola tasa.

---

## 3 · DESCUENTOS

| Pregunta | Respuesta de este negocio |
|---|---|
| **Quién puede darlos** | La dueña siempre. **La profesional sí, hasta un tope**, y ésta es una diferencia fuerte contra `abarrotes`, donde el cajero no debe poder descontar nunca. Aquí la profesional está cerrando la venta con la clienta enfrente, negociando un servicio de $2,000, y no poder mover $100 le cuesta la venta. |
| **Hasta cuánto** | Tope duro por rol. Propuesta: profesional 10%, recepción 0%, dueña sin tope. El margen bruto del giro es 50%–70%, así que tolera más que el 20% de una tiendita — **pero la comisión se come la mitad de ese margen**, y ahí está el límite real. |
| **Requieren autorización** | Por encima del tope, **PIN de la dueña**, y queda en la bitácora. F-205. |
| **Cómo afectan la comisión** | **Ésta es la pregunta que define el descuento en este giro y no en ningún otro.** Si la regla dice "comisión sobre lo cobrado", el descuento del 20% le baja el 20% de su comisión a quien atendió. Si dice "sobre lista", el salón absorbe el descuento completo y la profesional no siente nada. |

**La decisión, y hay que tomarla explícitamente:** por omisión, **comisión sobre lo efectivamente
cobrado**, y **la pantalla se lo dice a la profesional antes de aplicar el descuento**:

```
Descuento 20%  ·  el ticket baja de $1,130 a $904
                  tu comisión baja de $565 a $452   (−$113)
                              [ CANCELAR ]  [ APLICAR ]
```

Con esa frase de por medio, el descuento se aplica cuando vale la pena y no se aplica por reflejo.
Sin ella, la profesional descuenta con la mano de la dueña y después reclama la comisión completa —y
ése es un pleito que ocurre en todos los salones de México todos los meses.

**Hay un tercer camino que algunos salones usan y hay que soportarlo:** el descuento se reparte
mitad y mitad. Es una configuración de F-440, no una excepción codificada.

**Descuento contra promoción.** Igual que en `abarrotes`: la promoción ("martes de corte a $199",
F-026) es una regla de precio del catálogo, planeada, con su comisión calculada de antemano. El
descuento es una decisión de mostrador. Mezclarlos hace imposible saber si la venta bajó por
estrategia o por fuga.

---

## 4 · PROPINAS · **V4 · directa al profesional**

**Sí hay, y son el segundo sueldo de la gente del salón.** Se apaga entera sólo si la dueña lo pide.

### 4.1 · Por qué V4 y no V2 ni V3

En `restaurante` la propina va **al tronco** y se reparte por puntos entre mesero, cocina, barra y
garrotero, porque la experiencia de la mesa la produjeron entre varios y nadie sabe de quién fue el
mérito. Aquí **la propina es de quien te atendió durante hora y media con las manos en tu cabeza**, y
todo el mundo lo sabe, empezando por la clienta, que muchas veces la pone en la mano y dice el
nombre.

**Un tronco en un salón sería un motín el primer día.** Karla no va a repartir su propina con Dany.

**La única excepción real: la propina de apoyo.** La clienta le da $50 a quien la lavó. **No es un
porcentaje del total ni sale de la propina principal**: es un segundo importe, chiquito, con otro
destinatario. El sistema tiene que permitir dos destinatarios en la misma propina y **no repartir
nada por algoritmo**, sólo registrar lo que la clienta dijo.

### 4.2 · Los tres caminos por los que entra una propina

| Camino | Frecuencia | Pasa por el cajón | Tratamiento |
|---|---|---|---|
| **Efectivo, a la mano** | **La mayoría.** Las estilistas la prefieren porque la reciben al momento, y el salón también porque la terminal cobra comisión sobre ella | **NO** | **Se registra igual**, con un toque, para el corte y para que la profesional lleve su cuenta. No entra al efectivo esperado porque nunca entró al cajón. Registrarla es opcional y hay que decirlo: si el sistema la exige, se va a mentir, y un dato mentido es peor que ninguno |
| **Efectivo, al cajón** | Cuando cobra recepción y la clienta deja el cambio | **SÍ** | Entra al efectivo esperado **y nace un pasivo**: el salón le debe ese dinero a la profesional. Se cancela al entregárselo |
| **Terminal** | Creciendo. Las terminales del mercado ofrecen 12%, 15%, 18% o monto libre | **No al cajón, sí a la cuenta** | **F-260.** Es el caso más delicado: el dinero llega al banco del salón y **legalmente hay que entregarlo al trabajador; no puede usarse como flujo del negocio**. Es un pasivo que vive días o semanas |

### 4.3 · La mecánica del pasivo · F-260

**Es, exactamente, el mismo objeto que F-256 (depósito de casco) de `abarrotes`.** Entra dinero que
no es del negocio y que hay que devolver. Dos giros que no se parecen en nada llegando al mismo
patrón es la señal de que el patrón está bien encontrado, y por eso se construye una vez.

```
Saldo de propina por profesional
  ├── + propina recibida en terminal
  ├── + propina recibida en efectivo al cajón
  ├── − entregas al profesional (salida de caja o incluida en su liquidación)
  └── = saldo vivo

Alerta: si el saldo de alguien lleva más de N días sin entregarse, el sistema
        lo señala. Un salón que "se queda" la propina de tarjeta dos semanas
        pierde a su gente, y muchas veces es por desorden, no por mala fe.
```

**Lo que el sistema NO debe hacer:** permitir que la propina se use como fondo de caja, como cambio,
o como parte del efectivo con el que se paga un gasto. No es dinero del salón y el corte tiene que
poder demostrarlo en cualquier momento.

### 4.4 · Propina y comisión son dos cosas distintas · **y ésta es la regla del documento**

| | **Comisión** | **Propina** |
|---|---|---|
| ¿De quién es el dinero? | Del salón, mientras no se pague | **De la profesional desde el segundo uno** |
| ¿Qué es contablemente? | **Gasto** del salón | **Pasivo** del salón (si pasó por el cajón) o nada (si fue a la mano) |
| ¿Sobre qué se calcula? | Sobre la venta, con una regla que el salón fija | **Sobre nada.** La fija la clienta |
| ¿Entra en la venta? | No, pero **sale de** la venta | **No, nunca, de ninguna forma** |
| ¿Afecta el margen? | **Sí, es el costo variable más grande** | **No. Jamás.** Regla de Fase 1 |
| ¿Cuándo se paga? | Diario, semanal o quincenal, según la persona | En cuanto se pueda |
| ¿Se puede negociar? | Sí, es un acuerdo laboral | No |
| ¿Se causa si se cancela el ticket? | **No: se escribe contrapartida** | Se devuelve, si se puede |

**En la liquidación van juntas, en el mismo sobre, pero en dos renglones con dos sumas.** Nunca un
solo total. *"Te tocan $1,840 de comisión y $420 de propina"* no es lo mismo que *"te tocan
$2,260"*, y la diferencia importa: la profesional tiene derecho a saber qué le pagó el salón por
trabajar y qué le dieron sus clientas.

---

## 5 · MÉTODOS DE PAGO

| Método | Uso real en este giro | Notas |
|---|---|---|
| **Efectivo** | **45%–65% de los tickets.** Menos que en abarrotes, más que en restaurante de plaza | El ticket es grande ($250 a $3,200), así que el cajón se mueve por montos gruesos y **el cambio pesa mucho menos** que en una tiendita: el fondo de apertura de un salón es de $500 a $1,000 y casi todo en billetes de $100 y $200 |
| **Tarjeta (terminal móvil)** | **25%–40% y subiendo fuerte** | Clip, Mercado Pago, Getnet. La comisión de 2.5%–3.6% **es un gasto**, no un descuento sobre la venta. En un ticket de $950 con 50% de comisión al salón le quedan $475 y la terminal se lleva $30 de esos: **6% de lo que gana el salón en esa transacción**. Merece su renglón en el corte |
| **Transferencia (SPEI)** | **10%–25% y creciendo** | **El agujero número uno del giro.** Ver §10, descuadre 1. La clienta transfiere a quien tenga el teléfono a la mano, y muchas veces ésa es la profesional, no el salón |
| **Anticipo aplicado** | En servicios largos y con clientas de historial | No es un método de pago: es un saldo que se aplica. Pero en la pantalla de cobro **se ve como uno**, porque baja lo que hay que cobrar |
| **Saldo de paquete** | Donde se vendan paquetes | Igual: no es dinero de hoy, es consumo de un pasivo |
| **Mixto** | Frecuente y con una forma propia | El caso típico no es dos tarjetas: es **"tenía $300 de anticipo, pago $500 en efectivo y $330 con tarjeta, y la propina aparte en efectivo"**. Cuatro conceptos en un cobro |
| **Fiado** | **No existe.** Se apaga | No se fía un corte. Lo contrario sí existe y es el anticipo |

**Lo que esto implica para la pantalla de cobro, y es distinto de `abarrotes`:** aquí sí se pregunta
cómo va a pagar, porque la respuesta está repartida de verdad entre tres métodos y porque hay tiempo
—la clienta acaba de pasar dos horas ahí y va a pasar uno o dos minutos más en la caja sin
problema—. Lo que **no** puede pasar es que capturar la propina y su destinatario tome más de dos
toques, porque eso sí se hace veinte veces al día.

---

## 6 · ANTICIPOS Y PAQUETES · el dinero que llega antes que el servicio

### 6.1 · El anticipo de cita · F-414

**Es la única defensa real contra el no-show**, porque cobrarle a quien no vino es imposible en la
práctica en México. Lo normal del giro: **20% a 30% en servicios estándar y hasta 50% en servicios
caros o de larga duración**.

| Momento | Qué pasa |
|---|---|
| **Se cobra** | Entra dinero al cajón o a la pasarela. **Nace un pasivo** a nombre de esa cita. **No es venta.** Causa IVA (§2.2) |
| **Se da el servicio** | El anticipo **se aplica al ticket**, baja lo que hay que cobrar, y **ahí** se reconoce la venta completa |
| **Se cancela con más de 24 h** | Se devuelve íntegro o se deja a cuenta de la siguiente cita. Decisión de la dueña, registrada |
| **Se cancela con menos de 24 h o no llega** | **El salón se lo queda, y se reconoce como ingreso por cancelación**, en su renglón, no como venta de servicio |
| **Se reprograma** | El anticipo **se mueve con la cita**, no se devuelve ni se vuelve a cobrar. Suena trivial y es el error que más enoja a la clienta |

**Sobre el anticipo perdido, ¿se paga comisión?** Por omisión **no**: no hubo servicio, no hubo
trabajo. Pero hay salones que sí lo reparten, porque la profesional sí perdió la hora. **Es una
configuración de F-440, no una decisión nuestra.** Lo que sí es nuestro es obligar a que esté
decidida por escrito antes del primer no-show.

**Cuándo NO pedir anticipo, y hay que escribirlo:** a la clienta de doce años. El anticipo es una
herramienta contra un comportamiento, no una política general. Un salón que empiece a pedirle
anticipo a todo el mundo pierde clientas que nunca le fallaron. Por eso la regla es **por servicio y
por historial**, no global.

### 6.2 · El paquete de sesiones · F-439

Seis sesiones de tratamiento, $3,600 pagados hoy, consumidas en tres meses.

**El reconocimiento del ingreso, y es la decisión contable del modelo:**

```
Día 1 · se vende el paquete
  + $3,600 al cajón
  + $3,600 de pasivo "6 sesiones pendientes"
  + venta reconocida: $0                     ← NO ES VENTA
  + comisión de VENTA a quien lo vendió      ← chica, 3%–5%, al cobrar

Día 8 · se consume la sesión 1
  + $0 al cajón
  − $600 del pasivo
  + venta reconocida: $600                   ← AQUÍ SÍ
  + comisión de SERVICIO a quien la dio      ← la normal, 40%–60%
  + consumo de producto de cabina
```

**Por qué no se reconoce todo al cobrar.** Porque el mes que se venden tres paquetes el salón parece
rico y los dos meses siguientes parece pobre, **y sobre ese número falso se fijan los precios y se
decide si contratar**. Es exactamente el mismo error que registrar las recargas como venta en
`abarrotes`, con el mismo efecto: un margen reportado que no significa nada.

**Por qué dos comisiones distintas, y es un pleito clásico del giro.** Si toda la comisión se la
lleva quien vendió el paquete, nadie quiere dar las sesiones —son trabajo sin paga—. Si toda se la
llevan las que dan las sesiones, nadie vende paquetes. La solución que funciona en la práctica: una
comisión chica de venta al cobrar, y la comisión normal de servicio a quien atiende cada sesión.

**La vigencia es obligatoria.** Seis sesiones en doce meses. Sin vigencia, un paquete de hace tres
años reaparece y hay que darlo. Con vigencia, **hay que avisar antes de que venza** —a los 60 y a
los 15 días— o el sistema está ayudando a estafar a la clienta, y eso no se hace.

---

## 7 · COMISIONES · la mitad del negocio

**El bloque más importante del documento y la fuente número uno de pleitos del giro.**

### 7.1 · Los cuatro esquemas, conviviendo

| Esquema | Cómo funciona | Quién lo usa | Lo que le duele al salón |
|---|---|---|---|
| **Comisión pura** | 40% a 60% del servicio, **sin sueldo base** | La estilista con cartera y experiencia | Protege el flujo en meses bajos, **pero la clientela es de ella** y el día que se va, se va con todo |
| **Sueldo base + comisión** | Base baja garantizada + 10% a 30% | Lo más común en salones sanos y en la gente nueva | Da estabilidad y control, **pero se paga aunque no haya clientes** |
| **Escalonado por meta** | 30% hasta $20,000 al mes, 40% de ahí en adelante | Salones que quieren empujar producción | Es el que más motiva y el más difícil de calcular a mano — **y por eso casi nadie lo usa hoy**, que es justamente donde el software agrega valor |
| **Renta de estación** | Paga $150–$300 al día o $1,200–$4,000 al mes y **se queda el 100%** | Independientes: manicurista, pestañas, barbero | Ingreso fijo y cero riesgo, **pero cero control**: el salón no decide precios ni horarios y la clienta es de ella |

**En el salón de Paty están los cuatro.** Un sistema que sólo entienda "porcentaje sobre la venta" no
puede describir su nómina.

### 7.2 · Las cinco preguntas donde nace el pleito · F-440

Ninguna es sobre el porcentaje. Todas son sobre **la base**.

**1 · ¿Sobre precio de lista o sobre lo cobrado?**
Lista protege a la profesional del descuento que ella no decidió; cobrado protege al salón. **Por
omisión: cobrado**, con la advertencia en pantalla del §3. Configurable, y hay una tercera opción
—repartir el descuento— que algunos salones usan y que también se soporta.

**2 · ¿Antes o después de IVA?**
Un servicio de $950 tiene $819 de base y $131 de IVA. El 50% sobre $950 son $475; sobre $819 son
$409. **Son $66 de diferencia por servicio** y nadie se acuerda de haberlo acordado. **Por omisión:
sobre el importe sin IVA**, porque el IVA no es ingreso del salón. Configurable, porque medio giro
lo hace al revés.

**3 · ¿Se descuenta el material?** · F-442
Tres modos, y los tres existen en México:
- **Lo absorbe el salón.** El más común y el más simple.
- **Se descuenta de la base antes de comisionar.** Tinte de $950 con $110 de producto: se comisiona
  sobre $840. Es el más justo y el que empuja a no desperdiciar.
- **Se le cobra a la profesional en la liquidación.** Típico de quien renta o casi renta.

Sea cual sea, **se muestra en el momento de capturar la fórmula**, no al final del mes. *"Esta mezcla
son $118 de producto; con tu esquema, tu comisión sale de $832."*

**4 · ¿Quién cobra si fueron dos?** · F-428
Brenda lava, Karla tiñe. Por omisión **todo a quien tomó la cita**, y el reparto se ajusta con un
toque. La suma tiene que dar 100% y la base lo obliga.

**5 · ¿Se paga otra vez si hay que rehacer?** · F-444
El color se corrió y hay que corregirlo gratis. **Por omisión no se paga comisión** —es el acuerdo
estándar del giro— y **el producto del rehacer se imputa al servicio original**, no al aire. El
contador de rehacer por profesional es, además, el único dato de calidad medible que existe aquí.

### 7.3 · Cuándo se causa · F-443

**Al cobrar el ticket.** No al cerrar la cita, no al liquidar.

Y **queda escrita en un ledger inmutable**, con la regla y la tasa vigentes en ese momento:

```
comisiones_causadas
  ├── orden_linea_id        de qué línea salió
  ├── profesional_id        de quién es
  ├── regla_id + version    QUÉ regla y en qué versión se aplicó   ← lo que la hace auditable
  ├── base_centavos         sobre cuánto
  ├── tasa_bp               a qué tasa, en puntos base
  ├── monto_centavos        cuánto
  ├── tipo                  servicio · producto · venta_paquete · ajuste
  └── liquidacion_id        null hasta que se paga

NUNCA se hace UPDATE. Una cancelación, una devolución o una corrección
escriben un asiento NEGATIVO con motivo y autor.
```

**Por qué inmutable, y es la razón de producto más que la técnica:** Karla ve su acumulado en su
teléfono a las 15:00 y dice $1,840. Si a las 20:00 dice $1,790 porque el sistema "recalculó", Karla
deja de creerle al sistema **para siempre**, aunque los $1,790 sean correctos. Con contrapartidas,
Karla ve $1,840 y abajo *"− $50, ticket 3471 cancelado a las 18:12 por Paty"*, y eso sí lo entiende.

**Cambiar el porcentaje no recalcula lo ya causado.** La regla lleva vigencia. Si Paty sube a Dany de
25% a 30% el día 16, los servicios del día 15 siguen al 25%.

### 7.4 · La renta de estación · F-441

Sol no es empleada. **Su facturación no es del salón.**

```
Lo que SÍ es del salón:
  + $1,200 a la semana de renta          ← ingreso, NO venta de servicio
  + lo que le venda de producto           ← venta normal
  + comisión por uso de terminal, si aplica

Lo que NO es del salón:
  − todo lo que Sol cobra por su trabajo  ← ni un peso

Lo que el salón SÍ necesita de Sol:
  · que su agenda esté en la agenda del salón, o el hueco de su mesa no se ve
  · que el dinero que pase por el cajón del salón se identifique como suyo
  · que el producto del salón que use se le cargue

Lo que el salón NO debe tener:
  · el detalle de sus precios ni de sus clientas, salvo que ella lo comparta
```

**Si se modela como empleada con comisión del 100%**, sus $2,800 del sábado entran a la venta del
salón, el ticket promedio sube falsamente, la ocupación se calcula mal y —si el salón factura— se
está declarando ingreso ajeno. **Los cuatro errores a la vez.**

---

## 8 · LA CAJA DE ESTE NEGOCIO

### 8.1 · Cuántas hay y quién la opera

**Una.** Un mostrador de recepción, un cajón. **F-235 apagada.**

Y **la diferencia más importante contra `restaurante` y contra `abarrotes`: muchas veces no hay
cajero.** En un salón de dos estaciones, la que cobra es la que acaba de atender, con las manos
recién lavadas, mientras la siguiente clienta ya está esperando. **El sistema tiene que funcionar sin
recepcionista** y eso decide el diseño de la pantalla de cobro: alcanzable desde el teléfono de la
profesional, con la propina y el método en la misma pantalla, sin pasos.

En un salón de cuatro o cinco estaciones sí hay recepción, y entonces el cobro lo hace ella y **la
comisión es de quien atendió, no de quien tecleó** (F-424, §3.20 de `01-FUNCIONES.md`). Los dos casos
tienen que funcionar con la misma plantilla.

### 8.2 · Cómo se abre

```
ABRIR CAJA
  Efectivo inicial contado *      [ $   800.00 ]
  Notas de apertura (opcional)    [ .................. ]

  Al abrir, el sistema muestra — sin pedir nada:
    · 14 citas agendadas hoy · 2 sin confirmar
    · $ 900.00 de anticipos vivos que se aplican hoy
    · $ 1,240.00 de propina de terminal pendiente de entregar
```

**Las tres líneas de contexto no son adorno: son los tres pasivos vivos del salón**, y verlos al
abrir es lo que evita que se olviden. El de propina, sobre todo: es el que se queda semanas.

**Lo que este giro NO necesita en la apertura, y `abarrotes` sí:** el desglose por denominación. El
fondo de un salón son $800 en billetes de $100 y $200 porque los tickets son de $250 a $3,200. Aquí
no hay 220 operaciones de $35 que exijan monedas de $10. Pedirlo sería pedir quince segundos diarios
por nada.

**Nada se puede cobrar sin caja abierta.** Mismo muro que en `restaurante`. Pero **sí se puede
agendar, iniciar una cita y capturar una fórmula sin caja abierta**, y eso es propio de este modelo:
la agenda no es la caja. Un salón que abre a las 10:00 puede tener a alguien agendando por WhatsApp
a las 9:00.

### 8.3 · Qué movimientos tiene

| Movimiento | Quién | Efecto en el cajón | ¿Suma a ventas? |
|---|---|---|---|
| Apertura con fondo | Dueña o recepción | **+** fondo | No |
| **Servicio/producto cobrado en efectivo** | Quien cobra | **+** monto | **Sí** |
| Servicio cobrado con tarjeta o transferencia | Quien cobra | cero | **Sí** |
| **Servicio cobrado por transferencia a cuenta de la profesional** · §10.1 | Profesional | **cero** | **Sí**, y se le descuenta de su liquidación |
| **Anticipo de cita cobrado** · F-414 | Recepción | **+** monto | **No.** Es pasivo |
| **Anticipo aplicado a un ticket** | Quien cobra | **cero** | **Sí** (se reconoce la venta) |
| **Anticipo perdido por no-show** | Dueña | cero (el dinero ya estaba) | **No es venta de servicio.** Ingreso por cancelación |
| **Paquete de sesiones vendido** | Quien cobra | **+** monto | **No.** Es pasivo |
| **Sesión de paquete consumida** | Quien atiende | **cero** | **Sí** |
| **Propina en efectivo al cajón** · F-243 | Quien cobra | **+** monto | **No.** Nace pasivo |
| **Propina en efectivo a la mano** | Profesional | **cero** | **No.** Se registra, no toca caja |
| **Propina en terminal** · F-260 | Quien cobra | cero (va al banco) | **No.** Nace pasivo |
| **Entrega de propina acumulada** · F-260 | Dueña | **−** monto | **No.** Cancela pasivo |
| **Liquidación de comisión** · F-259 | Dueña | **−** monto | **No.** Es gasto de nómina |
| **Renta de estación cobrada** · F-441 | Dueña | **+** monto | **No es venta de servicio.** Otro ingreso |
| **Devolución de producto en efectivo** | Dueña | **−** monto | Resta de ventas |
| Gasto en efectivo | Dueña | **−** monto | No |
| Compra de producto al distribuidor | Dueña | **−** monto | No |
| Retiro parcial | Dueña | **−** monto | No |
| **Rehacer sin cobro** · F-444 | Quien atiende | cero | **No.** Consume producto y hueco |
| **Cortesía** | Dueña | cero | **No.** Consume producto y hueco |
| Corte de turno | Quien entrega | Cuenta y entrega. No cierra | — |
| Cierre diario | Dueña | Cuenta, deja fondo, cierra | — |

**Veintidós movimientos, de los cuales quince no suman a ventas.** Y —la diferencia con `abarrotes`—
**cinco de ellos son repartos a personas del propio salón**: liquidación, entrega de propina, renta,
transferencia a cuenta personal, y propina a la mano. En una tiendita el dinero ajeno es de terceros
lejanos; aquí es de quien está parado al lado, y un error se descubre esa misma noche y tiene nombre.

**La liquidación es la salida de caja más grande del día.** Muchas veces mayor que cualquier gasto y
mayor que la compra semanal de producto. Si se registra como "gasto: nómina", **el corte no puede
explicar por qué el cajón bajó $3,400 un martes** ni separar comisión de propina. Por eso es F-259 y
no una categoría de F-231.

### 8.4 · El arqueo, a ciegas, siempre

```
1.  El sistema pide:   Efectivo contado físicamente *   [ $ ______ ]
2.  La persona cuenta el cajón y teclea.
3.  HASTA ENTONCES aparece el esperado, y la diferencia.
4.  Segundo arqueo, si aplica:
       Propina de terminal pendiente de entregar   [ $ 1,240.00 ]  ← informativo
       Anticipos vivos al cierre                   [ $ 1,500.00 ]  ← informativo
```

El esperado lo calcula **el servidor**, y es *fondo + entradas − salidas* tomando en cuenta los
quince movimientos que no son venta. **Nunca "ventas en efectivo"**: ése es exactamente el cálculo
que hace que el cajón de un salón nunca cuadre, porque ignora la liquidación, el anticipo y la renta.

**Los dos arqueos informativos no se cuentan: se muestran.** No son dinero del cajón —la propina de
terminal está en el banco, el anticipo ya se gastó en la operación— pero son **deudas vivas** y el
cierre es el momento en que alguien las está mirando. Esconderlas es cómo se pierden.

### 8.5 · La regla que salva el cierre

En `restaurante` la regla es "no se puede cerrar con mesas abiertas". En `abarrotes`, "no con ventas
en espera". Aquí son tres:

1. **No se puede cerrar con citas del día sin resolver.** Cada cita de hoy tiene que estar en uno de
   cinco estados: atendida y cobrada · cancelada con motivo · **no llegó** · reprogramada ·
   cortesía/rehacer. Una cita que se queda "en curso" a las 21:00 es un servicio que se dio y no se
   cobró, o una clienta que nunca vino y nadie marcó. **Las dos son dinero, y las dos son
   invisibles al arqueo.**
2. **No se puede cerrar con servicios cerrados sin fórmula capturada**, si el módulo de cabina está
   encendido — **aviso, no muro**. Si se bloquea, la estilista captura cualquier cosa para poder
   irse. Lo que sí hay que hacer es listarlas en el corte con nombre: *"3 servicios de color sin
   fórmula: Karla ×2, Dany ×1"*.
3. **No se puede cerrar con comisión causada por un ticket que después se canceló y sin su
   contrapartida.** Es una condición de integridad, no de operación: si aparece, hay un bug.

---

## 9 · EL CORTE Y SU PDF

### 9.1 · Qué contesta el corte de ESTE negocio

> **¿Cuadró la caja, y cuánto le toca a cada estilista de comisión?**

Esas dos preguntas, en ese orden. Es literalmente lo que dice `04-SISTEMA-DE-DISENO.md` §5 para
estética.

**Y hay que precisar la segunda, porque ahí está toda la dificultad:** *"cuánto le toca"* son **dos
cifras distintas que salen del mismo cajón** —comisión y propina—, y una tercera que va en sentido
contrario —la renta que Sol paga—. Un corte que las sume en un solo número está mal aunque el total
sea correcto.

**La tercera pregunta, que este corte contesta y ningún otro del proyecto:** *¿cuánto tiempo se
perdió hoy y cuánto valía?* Porque el inventario de este negocio es el tiempo, y un corte que no
reporte el inventario perdido es como un corte de abarrotes sin merma.

### 9.2 · Qué NO lleva el corte de estética

- **Mesas, meseros, tiempos de mesa, comandas.** No existen.
- **Tronco de propinas ni reparto por puntos.** La propina es directa. Una sección de reparto en un
  salón es una sección que no se va a entender.
- **Faltantes por producto de anaquel al estilo `abarrotes`.** Aquí el conteo es de tubos y frascos
  abiertos, no de piezas de anaquel, y se hace semanal, no diario. Ver `03-INVENTARIO.md` §7.
- **IEPS, IVA mixto, desglose por tasa.** Todo es 16%.
- **Fiado ni cartera.** No se fía un servicio.
- **Insumos explotados por receta teórica.** Aquí el consumo es el capturado; el teórico es sólo
  comparación.
- **Recargas ni dinero en tránsito de terceros.** Ése es el mundo de `abarrotes`.

### 9.3 · El PDF, sección por sección, en orden

Documento carta / A4 vertical. Se genera con el mismo camino que el de `restaurante`
(`heredado/lib/pdfDownload.js` → `generatePDFBlobFromNode`), sobre un nodo propio, y **se descarga y
se manda por WhatsApp al cerrar**. Perilla para apagarlo.

**Y hay un segundo documento que sale del mismo cierre: el comprobante individual de cada
profesional.** Ver §9.5. No es una copia del corte con menos secciones: es un documento distinto,
para otra persona, con otra pregunta.

---

**1 · ENCABEZADO**
Logo, nombre del salón, dirección, teléfono. A la derecha, en negritas: **CORTE DEL DÍA**, el
**folio**, la sucursal, la terminal, la fecha y el rango de horas.
*Por qué primero:* este PDF se lee en un teléfono, a las 21:00, cansada. Tiene que identificarse en
la primera línea.

**2 · DATOS DEL CORTE**
Apertura · Cierre · Quién abrió · Quién cerró · Turnos con su responsable · Tipo (turno / cierre
diario) · Notas.
*Por qué aquí:* es la cadena de responsabilidad. En un salón chico casi siempre es la misma persona
todo el día, y entonces esta sección es corta — y correcta, porque no miente con turnos que no
existieron.

**3 · ARQUEO DE EFECTIVO**
Fondo esperado · Fondo contado · **Diferencia de apertura** · Efectivo esperado al cierre ·
**Efectivo contado** · **Diferencia** (con semáforo) · Dinero dejado en caja (negritas).
*Por qué antes de todo lo demás:* la primera pregunta del documento es si cuadró.

**4 · DE DÓNDE SALIÓ EL EFECTIVO ESPERADO** — la cascada
Igual en forma que la de `abarrotes` §9.3, distinta en contenido. Una cascada, no una tabla:

```
   Fondo de apertura                              +   800.00
   Servicios y producto cobrados en efectivo      + 7,340.00
   Anticipos de cita cobrados            F-414    +   600.00
   Renta de estación cobrada             F-441    + 1,200.00
   Propina en efectivo recibida en caja  F-243    +   380.00
   ────
   Liquidación de comisiones pagada      F-259    − 3,410.00
   Propina de terminal entregada         F-260    −   890.00
   Devoluciones pagadas en efectivo               −   380.00
   Compra de producto al distribuidor             − 1,850.00
   Gastos en efectivo                             −   240.00
   Retiros                                        − 2,000.00
   ─────────────────────────────────────────────────────────
   EFECTIVO ESPERADO EN CAJÓN                       1,550.00
```

*Por qué esta sección existe:* porque **siete de esos once renglones no son ventas**, y porque los
dos más grandes son pagos a personas. Sin esta cascada, Paty ve que vendió $12,400 y que en el cajón
hay $1,550 y **no entiende nada**. Con la cascada, ve que le pagó $4,300 a su gente esa noche. Es la
sección que convierte "no cuadra" en "ya vi por qué", y en este giro es todavía más necesaria que en
una tiendita, porque los montos que salen son enormes en relación con la venta.

**5 · RESUMEN DE VENTAS**
Venta de **servicio** · Venta de **producto** · Total de ventas (negritas) · Nº de tickets · Ticket
promedio · **Ventas por método** (efectivo, tarjeta, transferencia, anticipo aplicado, saldo de
paquete) · Comisión de terminal pagada · Descuentos otorgados.
Y después, en un bloque aparte y en negritas:

```
   Venta de servicio                            10,420.00
   − Comisión de servicio causada                4,890.00   (46.9%)
   − Producto de cabina consumido                1,180.00   (11.3%)
   ──────────────────────────────────────────────────────
   MARGEN DE SERVICIO                            4,350.00   (41.8%)

   Venta de producto                             1,980.00
   − Costo del producto vendido                    990.00
   − Comisión de producto                          198.00
   ──────────────────────────────────────────────────────
   MARGEN DE PRODUCTO                              792.00   (40.0%)

   + Renta de estación                           1,200.00
   + Ingreso por cancelación                       300.00
   − Gastos del día                                240.00
   ──────────────────────────────────────────────────────
   LE QUEDÓ AL SALÓN                             6,402.00
```

*Por qué el margen con la comisión restada va en el corte y no sólo en el dashboard:* porque **es el
único momento del día en que esta dueña está leyendo números**, y porque un margen que no resta la
comisión dice 88% donde de verdad hay 42%. Sobre ese número se fijan los precios de todo el salón.
**Si el sistema sólo enseña uno de los dos, tiene que enseñar éste.**

**6 · LIQUIDACIÓN POR PROFESIONAL** — *la sección que define este documento*
Una tabla por persona, no una fila. Cada profesional ocupa un bloque:

```
   KARLA                                    esquema: comisión pura 50% · sobre cobrado, sin IVA
   ────────────────────────────────────────────────────────────────────────
   Citas atendidas                 6        (5 agendadas · 1 walk-in)
   Venta de servicio         5,220.00       base de comisión sin IVA: 4,500.00
   Comisión de servicio 50%  2,250.00
   Producto vendido            980.00       comisión 10%
   Comisión de producto         98.00
   Material cargado              0.00       (esquema: lo absorbe el salón)
   ────────────────────────────────────────────────────────────────────────
   COMISIÓN DEL DÍA          2,348.00       ← gasto del salón
   ────────────────────────────────────────────────────────────────────────
   Propina en efectivo a la mano   340.00   (registrada, no pasó por caja)
   Propina en efectivo a caja      120.00   ← pasivo
   Propina en terminal             410.00   ← pasivo
   PROPINA A ENTREGAR              530.00   ← dinero que NUNCA fue del salón
   ────────────────────────────────────────────────────────────────────────
   Cobrado por ella en transferencia a su cuenta   − 900.00   ← §10.1
   ────────────────────────────────────────────────────────────────────────
   TOTAL A PAGARLE HOY          1,978.00
   Pagado en efectivo           1,978.00   ✓  a las 20:47
```

Y después, un bloque más corto para quien renta:

```
   SOL · independiente                      renta de estación $1,200 semanal
   ────────────────────────────────────────────────────────────────────────
   Citas atendidas                 5        (su facturación NO es venta del salón)
   Renta cobrada hoy         1,200.00       ← ingreso del salón
   Producto del salón usado      0.00
   Terminal del salón usada    640.00       comisión 3% al salón: 19.20
   ────────────────────────────────────────────────────────────────────────
   ENTREGADO A SOL             620.80       (los $640 de terminal menos la comisión)
```

*Por qué es la razón de ser del documento:* porque contesta la segunda mitad de la pregunta del
corte, y porque **hoy eso se hace con calculadora el domingo y es de donde salen todos los pleitos
del giro**. Cada línea del bloque es una de las cinco preguntas del §7.2 ya contestada por escrito:
la base dice "sobre cobrado, sin IVA", el material dice "lo absorbe el salón", y quien lea puede
verificarlo servicio por servicio.

*Por qué comisión y propina en dos sumas y no una:* §4.4. Un solo total le hace creer a Karla que el
salón le pagó $2,878 por trabajar, cuando le pagó $2,348 y le entregó $530 que eran de ella desde el
principio.

**7 · LA AGENDA DEL DÍA** — *la sección que ningún otro corte del proyecto tiene*

```
   Citas agendadas                    16
   Atendidas                          13
   Walk-in atendidos                   3        (no estaban agendadas)
   Canceladas a tiempo                 1        (con más de 24 h)
   Canceladas tarde                    1        ← anticipo retenido $300
   NO LLEGARON                         1        ← Mariana Ríos · 18:00 · Karla
                                                  3ª falta en 6 meses · pedir anticipo
   ────────────────────────────────────────────────────────────────
   Horas disponibles                  27.0      (3 profesionales, menos bloqueos)
   Horas con cita activa              19.5
   OCUPACIÓN                          72.2%
   Horas en hueco                      7.5      ← valuadas a ticket promedio: $4,200
   ────────────────────────────────────────────────────────────────
   Ocupación por profesional     Karla 86%  ·  Dany 61%  ·  Paty 70%
```

*Por qué el corte trae la agenda:* porque **el inventario de este negocio es el tiempo**, y un corte
que no reporte el inventario perdido es un corte incompleto. Los $4,200 de hueco de hoy son más que
el margen de producto del día entero, y hoy no aparecen en ningún reporte de ningún sistema del
segmento. La diferencia de ocupación entre Karla al 86% y Dany al 61% es la decisión de mañana: a
quién se le pasan clientas y a quién se le recorta el horario.

**8 · MAÑANA** — *la única sección que mira hacia adelante*

```
   Citas para mañana                  14      ·  ocupación proyectada 68%
   SIN CONFIRMAR                       4      ← mandar recordatorio ahora
   Huecos                        11:00 Karla 60 min   ·   15:30 Dany 90 min
                                 17:00 Dany 45 min
   De la lista de espera, tres querían esas franjas:
                                 Lucía M. · Andrea T. · Sra. Beltrán
   Producto de cabina que no alcanza para lo agendado:
                                 Oxidante 30 vol — 2 balayages agendados, alcanza para 1
```

*Por qué el corte trae el mañana:* misma razón que en `abarrotes` §9.3 sección 12, y aquí más fuerte.
**El corte se lee a las 21:00 y es el único hueco de atención del día de esta dueña.** Los cuatro
recordatorios sin mandar y los tres huecos con nombre al lado valen, en pesos, más que todo lo demás
del documento. Es lo que convierte un documento contable en una herramienta de gestión.

**9 · PRODUCTO DE CABINA CONSUMIDO** — tabla, sólo si el módulo está encendido
Producto · Consumido según fórmulas · Merma de mezcla · Costo · **Servicios sin fórmula capturada**.
*Por qué "servicios sin fórmula" es una columna y no una nota:* porque es el único indicador de que
el inventario de cabina está siendo alimentado. Si de trece servicios de color hay nueve sin fórmula,
el consumo reportado es ficción y el documento tiene que decirlo en vez de mostrar un número bonito.

**10 · PRODUCTO DE REVENTA** — tabla, sólo si hubo
Producto · Cantidad · Venta · Costo · Margen · **Quién lo vendió**.
*Por qué con quién lo vendió:* porque el producto es el margen no-horario del salón y **la única
forma de que se venda es que quien atiende lo recomiende**. Ver quién vende y quién no es la decisión
de capacitación de la semana.

**11 · PROPINAS** — tabla, sólo si el módulo está encendido
Por profesional: efectivo a la mano · efectivo a caja · terminal · **entregado hoy** · **saldo
pendiente**. Y al pie: **saldo total de propina que el salón debe**, con los días del más viejo.
*Por qué tiene su propia sección además de aparecer en la liquidación:* porque el saldo pendiente es
un pasivo acumulado que cruza días y que en la liquidación individual no se ve completo. Un salón
que deba $3,000 de propina desde hace dos semanas tiene un problema, y casi siempre es desorden, no
mala fe.

**12 · ANTICIPOS Y PAQUETES** — tabla, sólo si hay saldo vivo
Anticipos cobrados hoy · aplicados hoy · retenidos por cancelación · **saldo vivo con sus citas**.
Paquetes vendidos hoy · sesiones consumidas hoy · **saldo de sesiones pendientes** · los que vencen
en menos de 60 días.
*Por qué en el corte:* porque es dinero que ya se gastó y trabajo que todavía se debe. Un salón con
$40,000 de paquetes pendientes tiene $40,000 de trabajo comprometido sin ingreso futuro, y eso no se
siente hasta que llega enero y no entra nada.

**13 · CORTESÍAS Y REHACER** — tabla, sólo si hubo
Cita · Profesional · Motivo · Producto consumido a costo · Hueco ocupado.
*Por qué separadas de la merma y de la venta:* porque un rehacer es un dato de **calidad** y una
cortesía es un dato de **política**. Juntarlas —o peor, esconderlas en $0 dentro de las ventas—
borra la única medida de calidad que este negocio puede tener.

**14 · GASTOS Y COMPRAS DEL DÍA** — tabla, sólo si hubo
Categoría · Descripción · Proveedor · Forma de pago · Monto.

**15 · CANCELACIONES Y DESCUENTOS** — tabla, sólo si hubo
Folio · Hora · **Usuario** · Motivo · Monto · **Efecto en comisión**.
*Por qué siempre con usuario y con el efecto en comisión:* es la sección de control. Un patrón de
descuentos concentrado en una persona es la señal más clara que existe aquí — y en este giro tiene
un motivo distinto que en una tiendita: no es robo, es alguien regalando margen del salón para
quedar bien con sus clientas. La conversación es distinta y el dato tiene que permitirla.

**16 · FIRMAS**
*Responsable de caja* con nombre impreso · *Administrador*.

**17 · PIE**
Texto configurable + *Documento interno · MorphiqPOS · Generado [fecha y hora]*.

### 9.4 · Reglas del corte que no se negocian

1. El arqueo va a ciegas. Siempre.
2. El esperado lo calcula el servidor, e incluye los quince movimientos que no son venta.
3. El PDF lleva folio, sucursal, terminal, quién cerró y a qué hora.
4. Lo que no aplica al giro no aparece, **ni siquiera en cero**. Sin mesas, sin fiado, sin IEPS, sin
   tronco de propinas. Si el módulo de renta de estación está apagado, su sección no existe. Si nadie
   vendió producto hoy, la sección 10 no aparece.
5. **Comisión y propina nunca se suman en el mismo renglón.** Es la regla propia de este modelo y la
   que evita el descuadre 2.

### 9.5 · El otro documento · el comprobante del profesional

Sale del mismo cierre y **no es una copia recortada del corte**: es un documento para otra persona,
que contesta otra pregunta.

> **¿Cuánto trabajé, cuánto generé, y cuánto me toca?**

Lleva: sus citas del día con hora, clienta y servicio · su venta de servicio y de producto · la
**regla de comisión aplicada, escrita con todas sus letras** · su comisión desglosada línea por línea
· su propina por método · lo que se le descuenta y por qué · el total · y **su acumulado del periodo
hasta hoy**.

**No lleva:** nada de las demás. Ni la venta del salón, ni la comisión de nadie más, ni el arqueo.

*Por qué existe:* porque el dolor 2 no se resuelve calculando bien. Se resuelve **calculando bien y
enseñándolo**. Una profesional que recibe cada noche un comprobante que puede verificar servicio por
servicio deja de discutir el total, y ahí es donde el sistema se gana el derecho a existir en este
negocio. Es, además, lo que hace que la gente **quiera** que las citas estén bien capturadas —porque
de ahí sale su dinero—, y eso resuelve solo el problema de alimentación de datos que hunde a la
mayoría de los sistemas de agenda.

---

## 10 · LOS CINCO DESCUADRES TÍPICOS

### Descuadre 1 · La transferencia que se fue a la cuenta personal

**Es el descuento fantasma de este giro: el robo silencioso que el arqueo no puede ver.**

**Cómo nace.** La clienta quiere pagar por transferencia. Quien tiene el teléfono a la mano es la
estilista, no la recepción. Le pasa su CLABE. El servicio se dio, el producto se consumió, el hueco
se ocupó, y **el dinero nunca entró al salón**. Puede ser robo deliberado o puede ser desorden
—"ahorita se lo paso a Paty" y se le olvida—. Los dos se ven igual en el sistema: **nada**. El cajón
cuadra perfecto porque ese dinero nunca se esperó.

**Por qué es el número uno.** Porque el ticket de un salón es grande. Tres transferencias de $950 en
una semana son $2,850 que no aparecen, más que el margen de producto de todo el mes. Y porque la
transferencia va del 10% al 25% de los tickets y subiendo.

**Cómo lo convierte el sistema en un mecanismo, y por qué no puede prevenirlo del todo.** No se puede
impedir que alguien dé su CLABE. Lo que se puede hacer es **quitarle la ambigüedad**: al elegir
transferencia, el sistema pide **a qué cuenta**, de una lista corta —cuenta del salón, o cuenta de
quien atendió—. Si es la segunda, **la venta se registra completa, la comisión se causa completa, y
esos pesos se descuentan de su liquidación esa misma noche** (ver §9.3 sección 6). Deja de ser fuga y
pasa a ser un anticipo a cuenta de su comisión.

Eso convierte el problema de "me están robando" en "cobraste $900 en tu cuenta, te los descuento de
tus $2,878". La conversación es completamente distinta, y **la profesional honesta lo prefiere**,
porque hoy tiene que acordarse de pasarle el dinero a Paty y a veces se le olvida y queda mal.
**Fingir que el sistema lo evita sería mentir; convertirlo en un flujo declarado sí se puede.**

### Descuadre 2 · La comisión y la propina sumadas en un solo número

**Cómo nace.** Paty le da a Karla $2,878 en la mano. Karla entiende que el salón le pagó $2,878 por
trabajar. De esos, $530 eran propina de sus clientas que el salón sólo estaba guardando. A fin de
mes, Karla siente que gana más de lo que gana y Paty siente que paga más de lo que paga. Cuando hay
que renegociar el porcentaje, **las dos están discutiendo sobre números distintos sin saberlo**.

Y la versión peor: la propina de terminal se paga dos veces, o no se paga nunca. Se paga dos veces
cuando se incluyó en la liquidación y después Paty le da "su propina"; nunca, cuando se quedó
mezclada en el efectivo del cajón y se usó para pagar un gasto.

**Cómo lo previene el sistema.** **F-260**: el saldo de propina es un pasivo vivo por persona, con
entradas y salidas propias. **F-259**: la liquidación es un movimiento de caja con los cinco
conceptos desglosados. Y la regla 5 del corte: **comisión y propina nunca en el mismo renglón**. En
el comprobante del profesional (§9.5) se ven como dos cifras con dos naturalezas escritas.

### Descuadre 3 · El servicio que se dio y no se capturó

**Cómo nace.** Entra una walk-in a las 19:40, es conocida, la atiende Dany rápido, paga $320 en
efectivo, se va. Nadie abrió nada en el sistema. El cajón tiene $320 de más. O —el caso peor— nadie
abrió nada y **el dinero tampoco entró**.

En un salón esto es mucho más fácil que en una tiendita, porque en una tiendita el ticket **es** la
operación: sin ticket no hay cambio que dar. Aquí el servicio ocurre durante dos horas y el sistema
es opcional durante todo ese tiempo.

**Cómo lo reduce el sistema, y hay que ser honesto sobre el límite.** No se puede impedir. Lo que se
puede hacer es **hacer que capturar convenga más que no capturar**:

1. **La comisión sale de lo capturado.** Ésta es la palanca de verdad: Dany quiere que su servicio
   esté en el sistema porque de ahí sale su dinero. Es el mismo principio que hace que un mesero
   quiera que su propina esté registrada.
2. **La regla de cierre 1** del §8.5: no se cierra con citas sin resolver. Eso atrapa a la agendada
   que se atendió y no se cobró, que es la mitad de los casos.
3. **El walk-in en dos toques.** Si meter una walk-in cuesta un formulario, no se mete nunca.
4. **El indicador de huecos con el ojo puesto:** si Dany reporta 61% de ocupación y Paty la vio
   ocupada todo el día, hay algo que revisar. No es prueba, es señal.

### Descuadre 4 · El anticipo que se cobró y se volvió a cobrar

**Cómo nace.** La clienta dejó $300 hace ocho días por su balayage. Llega el jueves, la atiende
Karla, y quien cobra no sabe del anticipo —o lo sabe y no encuentra cómo aplicarlo—. Le cobra los
$1,850 completos. La clienta reclama en el momento, si se acuerda, o **no reclama y el salón se
quedó con $300 que no le tocaban**, que es peor porque destruye la relación cuando se descubre.

La variante: la cita se reprograma y el anticipo "se pierde" en el sistema, y hay que volver a
cobrarlo.

**Cómo lo previene el sistema.** El anticipo vive **pegado a la cita, no al cliente ni al ticket**.
Cuando la cita se pone en curso, **la pantalla de cobro arranca con el anticipo ya aplicado y
visible en el total**, no como una opción que hay que buscar. Y **al reprogramar, el anticipo se
mueve con la cita** sin que nadie tenga que hacer nada. Un índice único por cita impide aplicarlo dos
veces.

### Descuadre 5 · El producto de cabina que nunca se contó

**Cómo nace.** El tinte se descuenta cuando se captura la fórmula. Si de trece servicios de color hay
nueve sin fórmula, el sistema cree que se gastaron 4 tubos y de verdad se gastaron 11. El inventario
de cabina dice que hay producto que no hay, el costo del servicio sale por los suelos, y **el margen
reportado sale 15 puntos arriba del real** — que es el peor error posible, porque lleva a bajar
precios.

Y el hermano de este descuadre: **el mismo SKU en dos destinos** (F-155). El litro de shampoo
profesional se abre para el lavabo y nadie lo registra como traspaso; el sistema sigue creyendo que
es producto vendible y el conteo del anaquel nunca cuadra. **"El shampoo desaparece"** es la frase
que dicen todos los salones y casi nunca es robo: es esto.

**Cómo lo reduce el sistema.** Tres cosas, y ninguna es un muro:

1. **La captura de fórmula es de UN TOQUE** sobre la de la vez pasada (F-154, botón REPETIR). Si
   cuesta más que eso, no se hace.
2. **El corte lo confiesa.** La sección 9 trae la columna "servicios sin fórmula" con nombre. Un
   número bonito calculado sobre datos que no están es mentira; decir "9 de 13 sin capturar" es
   información.
3. **El evento ABRIR** (F-155) está en la pantalla de producto a un toque, y la alerta de mínimo de
   cabina se calcula **contra la agenda de los próximos siete días**, no contra un número estático.
   Eso hace que el dato se use, y un dato que se usa se corrige solo.

**Y el caso que no es descuadre pero se le parece:** el comprobante de transferencia falso. Igual que
en `abarrotes` §10: no se puede prevenir desde el sistema. Lo que sí se puede es marcar la venta como
*transferencia pendiente de confirmar*, sacarla del efectivo esperado, y listarla en el corte para
que la dueña la verifique contra su banco.
