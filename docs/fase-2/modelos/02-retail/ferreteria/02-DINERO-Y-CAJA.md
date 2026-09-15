# 02 · DINERO Y CAJA · Ferretería y tlapalería

**Éste es el archivo más importante de la carpeta.** Se apoya en las tres reglas de la Fase 1 que no
se negocian —**bigint de centavos**, **precios y totales siempre en el servidor**, **arqueo a ciegas
con el esperado calculado por el servidor**— y en todo lo que `abarrotes` ya dejó resuelto: los
movimientos de caja, el desglose por denominación, el redondeo (F-257) y la regla de que el dinero en
tránsito no es venta.

> **La frase que hay que tener en la cabeza leyendo todo esto.** En una tiendita, el problema del
> dinero es que **buena parte de lo que entra al cajón no es del negocio**. En una ferretería el
> problema es el opuesto y es peor: **buena parte de lo que sale del negocio no entra al cajón nunca**.
> Todos los días sale material por la puerta firmado en un papel, a cuenta de alguien que va a pagar
> en 30 días o en 90 o nunca. El cajón puede cuadrar perfecto y el negocio estar perdiendo dinero a
> chorros. **Un punto de venta que sólo sabe cuadrar el cajón no sirve aquí**, y ésa es la diferencia
> de fondo con `abarrotes`. Este documento gira alrededor de esa frase.

---

## 1 · QUÉ CUENTA COMO VENTA Y QUÉ NO

La venta de este negocio es **el importe del material entregado y registrado en un documento cerrado**
—ticket, remisión o factura—, **se haya cobrado o no**. El "se haya cobrado o no" es lo que cambia
respecto de una tiendita, donde el 95% se cobra en el acto.

| Concepto | ¿Es venta? | Tratamiento exacto |
|---|---|---|
| **Material cobrado de contado** | **Sí** | El caso del 65% de los tickets. `ordenes.total_centavos`, IVA extraído al 16%, todo en la misma tasa. |
| **Material entregado con remisión firmada (crédito)** | **Sí, en el momento de la entrega** | El material salió. La venta se reconoce hoy, el stock baja hoy, **no entra dinero al cajón** y el saldo del cliente sube. Método de pago `credito`. Si se reconociera al cobrar, el inventario bajaría hoy y la venta aparecería en 45 días: el margen del mes saldría absurdo y el corte no podría explicar el faltante. |
| **Pago de una remisión vieja** | **No. Es cobranza** | Entra dinero, baja el saldo, **la venta del día no cambia**. F-254 en variante: se aplica a **documentos elegidos**, no al saldo más viejo. |
| **Anticipo sobre pedido especial** | **No todavía. Es un pasivo** | Beto cobra $3,000 para pedirle a Truper una herramienta que nadie más va a querer. Ese dinero **no es suyo hasta que entrega**. Entra al cajón, va a una cuenta de anticipos, y se reconoce como venta el día del surtido. Si el cliente se arrepiente, se devuelve —menos la penalización, si la hay y está escrita. |
| **Cotización aprobada y no surtida** | **No.** No hay venta hasta que hay entrega | Es lo que separa A5 de A1. Una cotización de $80,000 aprobada no es un peso de venta; es un **compromiso de surtido** y un dato del embudo (F-607). Meterla en ventas es la forma más rápida de que el margen del mes sea ficción. |
| **Servicio de mostrador** (copia de llave, entonado, corte de vidrio) | **Sí, y va separado** | F-258. El ingreso es venta, **pero consume material propio** (la llave virgen, la base y los colorantes) y **tiene mano de obra dentro**. Margen del 60%–80%. Si se mezcla con la venta de producto, el margen por línea miente en las dos direcciones. |
| **Renta de herramienta** | **Sí, el importe de la renta** | El activo no se vende: se ocupa. La renta es ingreso; **el depósito no**. |
| **Depósito de renta** | **No. Es un pasivo** | Entra dinero que hay que devolver. Mismo mecanismo que el casco de `abarrotes` (F-256), con otro nombre en pantalla. |
| **Flete o entrega a domicilio** | **Sí, es ingreso** | Y tiene su propio costo —gasolina, el ayudante, la camioneta— que casi nunca se mide. Va en su propia línea del corte para que Beto sepa si el flete gratis arriba de $2,000 le está costando o le está vendiendo. |
| **Material cortado** | **Sí, por la medida entregada** | 60.00 m de cable son 60.00 m de venta. **La merma de corte no es venta y no es descuento: es costo.** Sale de stock a costo y aparece en su propia sección. |
| **Retazo vendido con descuento de remate** | **Sí, al precio de remate** | F-150. Y su margen se calcula contra el costo real, que es el mismo por metro. Un retazo vendido al 50% deja margen negativo y hay que poder verlo. |
| **Devolución de material vendible** | **Resta de la venta** del día en que se devuelve | Y regresa al stock a su costo original. **No se reabre el ticket original** ni se corrige la venta del día pasado: el histórico no se toca. |
| **Devolución de sobrante de obra** | **Resta**, contra el saldo de esa obra | F-138 + F-639. *"De todo lo que me llevé, me sobraron 8 sacos."* No hay folio individual: se aplica a la subcuenta. |
| **Garantía enviada al proveedor** | **No es venta ni es merma** | Sale de stock **sin pérdida económica** mientras Truper la repone. Es un activo en tránsito, y hay que poder ver cuánto dinero hay detenido ahí — en una ferretería son miles de pesos al mes. |
| **Merma de corte, robo detectado, daño** | **No es venta. Es pérdida** | Sale de stock, no toca caja, se valúa **a costo** y aparece separada por motivo. |
| **Descuento de mostrador** | Resta | Baja la venta y **no baja el costo**. En plomería y eléctrico, con 14%–15% de margen, un descuento del 8% se lleva **más de la mitad** de la utilidad de la línea. Por eso el tope es por línea y no global (§3). |
| **Ticket en $0.00** | No es venta | Se depuran igual que en `restaurante` y `abarrotes`. |

**La prueba de que está bien, y aquí son DOS pruebas, no una.** Ésta es la diferencia estructural con
`abarrotes`, que sólo necesita la primera.

```
PRUEBA 1 · el cajón           (la que también hace abarrotes)

Dinero que debería haber en el cajón al cierre
  = fondo de apertura
  + ventas cobradas en efectivo
  + pagos de crédito recibidos en efectivo          ← F-254
  + anticipos de pedido recibidos en efectivo
  + depósitos de renta cobrados                     ← F-256 en variante
  − devoluciones de depósito de renta pagadas
  − devoluciones de venta pagadas en efectivo
  − gastos y compras de contado
  − retiros
  ± redondeos                                       ← F-257


PRUEBA 2 · el material        (la que abarrotes NO necesita)

Valor de lo que salió hoy por la puerta, a precio de venta
  = ventas cobradas
  + ventas entregadas con remisión a crédito        ← NO están en el cajón
  + material surtido contra pedido ya anticipado
  − devoluciones recibidas
  ─────────────────────────────────────────────────
  Y de ese total:   ¿cuánto se cobró hoy?   ¿cuánto quedó a deber?
                    ¿a quién?   ¿quién firmó?
```

**Si el sistema sólo hace la prueba 1, el ferretero puede cerrar treinta días seguidos con el cajón
cuadrado mientras se descapitaliza.** Ésa es la razón de ser de este archivo y de la sección 4 del
corte.

---

## 2 · IMPUESTOS

### 2.1 · IVA · una sola tasa, y hay que decir por qué eso es una noticia

**Todo el catálogo de una ferretería causa 16%.** Ni un producto a tasa 0%, ni un exento, **ni un solo
régimen de IEPS**. La LIVA art. 2-A grava a tasa cero alimentos y medicinas, y nada de lo que vende
una ferretería entra ahí.

Esto merece escribirse con todas sus letras porque **es la sección más complicada de
`02-DINERO-Y-CAJA.md` de `abarrotes` y aquí desaparece entera**. El algoritmo de extracción por grupo
de tasa, las tres mecánicas de IEPS —cuota por litro, ad valorem, cuota por pieza—, el versionado de
cuotas por fecha, el backfill fiscal por categoría que tenía que revisar un contador: **nada de eso se
enciende en `ferreteria`**. La tabla `regimenes_ieps` existe, se construye allá, y aquí se queda
apagada por plantilla. No se borra: `abarrotes` la necesita y `vinateria` también.

El cálculo, entonces, es el simple: `iva = total − round(total / 1.16)`, **una sola vez sobre el total
del documento**, exactamente como en `restaurante`.

### 2.2 · La única complicación fiscal propia del giro: "más IVA"

En una tiendita el precio de anaquel es el precio final y nadie dice "más IVA". En una ferretería
**sí**, y es cotidiano:

- **El particular** ve el precio con IVA incluido, paga eso, y se lleva un ticket.
- **El contratista** pide el precio "más IVA" porque él lo acredita, y **compara precios sin IVA**
  entre proveedores. Si Beto le dice $348 y el de enfrente $300 + IVA, el contratista cree que el de
  enfrente es más barato aunque salga igual.
- **En la cotización** se piden las dos formas, y a veces en el mismo documento.

**Decisión:** el precio se guarda **una sola vez, con IVA incluido**, y la presentación es una perilla
de tres valores —*con IVA* / *sin IVA* / *ambos*— que se fija **por lista de precio** (F-023), no por
documento suelto. La lista `contratista` y la lista `obra` muestran sin IVA; `público` muestra con IVA.
Así nadie teclea dos precios para el mismo producto, que es de donde salen las diferencias.

**Lo que no se negocia:** el importe cobrado y el importe timbrado son el mismo número, siempre. La
presentación cambia; el dinero no.

### 2.3 · El régimen del negocio y la carga de facturación

Una ferretería de este tamaño —$300,000 a $600,000 de venta mensual— **rara vez cabe en RESICO**, cuyo
tope es de $3.5 millones anuales. La Broca está cerca del límite y probablemente ya fuera. Eso cambia
tres cosas respecto de `abarrotes`:

1. **No hay factura global mensual como documento central.** Hay global del público en general —diaria
   o semanal, según se configure— **más decenas de facturas nominativas a la semana**.
2. **La factura se emite desde el mostrador**, con el cliente enfrente, sin detener la venta. Es una
   operación de mostrador, no de oficina.
3. **Hay complemento de pago (F-943)**, porque se factura a crédito y se paga después, a veces en
   parcialidades. En `abarrotes` esa función está en el catálogo y no se usa nunca.

### 2.4 · La `ClaveUnidad` · el detalle fiscal que sí es de este giro

El CFDI 4.0 exige una **ClaveUnidad** del catálogo del SAT en cada concepto, de un catálogo de más de
2,400 claves. Para una ferretería las que importan son cinco:

| Clave | Unidad | Qué se factura con ella |
|---|---|---|
| **H87** | Pieza | Tornillo suelto, chapa, llave, contacto, herramienta, bisagra |
| **MTR** | Metro | Cable, manguera, tubo, varilla, cadena, cuerda, malla |
| **KGM** | Kilogramo | Tornillo y clavo a granel pesados, cemento por kilo, alambre |
| **LTR** | Litro | Pintura, thinner, solvente, pegamento líquido |
| **KT** | Kit | Juegos y paquetes vendidos como conjunto |

**La confusión que produce llamadas de clientes enojados** es H87 contra KGM en tornillería: **el mismo
producto lleva clave distinta según cómo se vendió**. Si se factura con H87 lo que se vendió por kilo,
el cliente de obra no lo puede deducir bien y regresa a que se lo corrijan.

**Decisión de producto:** la `ClaveUnidad` **sale de la presentación con la que se vendió** (F-112 +
F-151), no del producto ni de una captura del cajero. El cajero nunca ve esta pantalla y nunca sabe que
esto existe. Es el único camino que no se equivoca.

---

## 3 · DESCUENTOS

**Aquí `ferreteria` y `abarrotes` toman decisiones opuestas, y las dos son correctas para su negocio.**

`abarrotes` concluyó, con razón, que **el cajero no debe tener descuento, punto**: con 220 tickets y
20% de margen, $3 de descuento fantasma por ticket son $660 diarios invisibles. Aquí eso no se puede
sostener, porque **el "¿cuánto es lo menos?" es parte de la venta de mostrador de este giro** y
prohibirlo manda al cliente a la ferretería de enfrente.

| Pregunta | Respuesta de este negocio |
|---|---|
| **Quién puede darlos** | El dueño sin tope. El cajero **no** —igual que en abarrotes, porque el cajero no negocia, sólo cobra—. **El mostradorista sí**, con tope, porque es quien está en la conversación. |
| **Hasta cuánto** | **Tope por línea, no global.** Es la decisión más específica de esta sección y sale directo del margen de cada línea: |
| | · Material eléctrico y plomería (margen 14%–15%) → **tope 3%** |
| | · Cemento y construcción (margen ~18%) → **tope 4%** |
| | · Herramienta eléctrica (margen ~20%) → **tope 5%** |
| | · Pintura (margen ~26%) → **tope 8%** |
| | · Tornillería y fijación a granel (margen 35%–50%) → **tope 10%** |
| **Por qué por línea y no un tope único** | Un tope único del 5% **regala la mitad de la utilidad** en plomería y **no alcanza** para cerrar una venta de pintura. El sistema ya conoce el margen de la línea; usarlo para poner el tope es gratis y es lo correcto. |
| **Requieren autorización** | Por encima del tope, **PIN del dueño o del encargado**, con el motivo, y queda en la bitácora. F-205, heredada de `abarrotes` sin cambios. |
| **El descuento que nunca se autoriza** | **Por debajo del costo promedio.** El sistema lo impide siempre, para todos los roles, incluido el dueño desde el mostrador —él lo puede hacer desde la ficha del producto, que es un acto deliberado y no un resbalón con fila. |
| **Descuento contra lista de precio** | Son cosas distintas y confundirlas arruina el análisis. La **lista** (contratista, obra) es una decisión comercial planeada con margen calculado. El **descuento** es una decisión de mostrador. Si se mezclan, no se puede saber si el margen bajó por estrategia o por fuga. |

**El descuento fantasma existe aquí también, y tiene otra forma.** En una tiendita el cajero registra
20% de descuento y se queda $20 en efectivo. Aquí el riesgo mayor es **el mostradorista que le aplica
precio de contratista al particular a cambio de algo**, y eso no deja rastro de descuento: deja una
lista de precio mal elegida. Por eso el corte agrupa **ventas con lista distinta a público, por
mostradorista**, y no sólo los descuentos. Es el tipo de fuga que sólo se ve en el patrón, nunca en la
operación suelta.

---

## 4 · PROPINAS

**No hay. Variante V1 · sin propinas. Se apaga el módulo completo.**

Hay que escribirlo **con una razón distinta a la de `abarrotes`**, porque copiar la razón de allá sería
falso y se notaría.

`abarrotes` lo justifica diciendo que la propina existe donde hay servicio personal sostenido y que ahí
el contacto dura veinte segundos. **Aquí el contacto dura ocho minutos y sí hay servicio personal
sostenido:** el mostradorista escucha el problema, propone, sale al pasillo, regresa con dos opciones y
explica cómo se instala. Por esa lógica debería haber propina, y no la hay. ¿Por qué?

- **Porque lo que se cobra es la pieza, y la asesoría se entiende incluida.** El cliente ya pagó el
  margen del producto; el consejo es lo que justifica ese margen frente a comprar en línea. Dar propina
  encima sería pagar dos veces por lo mismo, y nadie lo hace.
- **Porque el que asesora no es el que cobra.** En el modo despacho+caja, la propina no tendría a quién
  dársele en el momento del pago.
- **La única excepción real es la maniobra de carga:** el ayudante que sube veinte bultos de cemento a
  la camioneta del cliente a veces recibe algo. **Eso no pasa por la caja, no se registra y no debe
  registrarse.** Es dinero entre dos personas y meterlo al sistema sería convertir una cortesía en una
  obligación contable.

**Consecuencias, idénticas en forma a las de `abarrotes`:**

- **En la pantalla de cobro:** no hay paso de propina, ni porcentajes sugeridos, ni desglose por método.
- **En el corte: no aparece ninguna sección de propinas, ni en cero.** Regla 4 de
  `04-SISTEMA-DE-DISENO.md` §5.
- **En el código:** F-240…F-246 existen, funcionan y **no se tocan**. Se apagan por plantilla.

**La confusión que hay que evitar:** el redondeo hacia arriba (*"déjelo así"*) **no es propina**: es
F-257, heredado de `abarrotes`, y su efecto es sobre el cajón, no sobre el salario de nadie.

---

## 5 · MÉTODOS DE PAGO

La mezcla es **radicalmente distinta** de la de una tiendita, y eso manda sobre el diseño del cobro.

| Método | Uso real en este giro | Notas |
|---|---|---|
| **Efectivo** | **50%–60% de los tickets, pero sólo 30%–40% del valor** | Es la primera divergencia importante: en `abarrotes` el efectivo es el 75%–90% de todo. Aquí los tickets chicos son en efectivo y los grandes no. **El cajón de una ferretería tiene menos dinero del que su venta sugiere**, y eso hay que saberlo antes de interpretar un arqueo. |
| **Transferencia (SPEI)** | **20%–35% del valor**, y subiendo | Es el método del contratista y del pago de crédito. Riesgo del giro: el **comprobante falso**, que aquí es por miles y no por decenas de pesos. La venta se marca **pendiente de confirmar**, se excluye del efectivo esperado y **se lista en el corte** para que alguien la verifique contra el banco. |
| **Crédito** | **25%–35% del valor**, concentrado en 30–40 clientes | Método de pago propio. Suma a ventas, **no suma al cajón**, sube el saldo. Ver §6. |
| **Tarjeta** | 10%–20% | Con ticket promedio de ~$500 y márgenes de 14% en algunas líneas, **la comisión de terminal se come una parte visible de la utilidad**. Es un **gasto**, no un descuento sobre la venta, y debe registrarse así o el margen sale mal. |
| **Mixto** | Frecuente y con una forma propia | El caso típico **no** es dos tarjetas: es *"te doy $2,000 y el resto a la cuenta"*. Es venta con dos métodos, uno de ellos crédito, y el sistema tiene que resolverlo en una sola operación. |
| **Anticipo aplicado** | En pedido especial | El anticipo ya cobrado se aplica al surtir. El saldo se cobra al entregar. |

**Lo que esto implica para la interfaz de cobro, y es lo contrario de `abarrotes`.** Allá el cobro se
resuelve en una tecla porque la respuesta es efectivo 200 de 220 veces, y preguntar es fricción pura.
**Aquí sí hay que preguntar**, porque cuatro métodos compiten de verdad, y **preguntar cuesta menos que
equivocarse**: una venta de $6,000 registrada como efectivo cuando fue transferencia descuadra el
arqueo de forma escandalosa. El cobro es un paso consciente con cuatro botones del mismo tamaño y
**crédito tiene que verse tan disponible como efectivo**, porque es un tercio del valor.

---

## 6 · CRÉDITO · el corazón del modelo

Entre el **25% y el 35% del valor** que sale de La Broca sale sin cobrarse. El sector construcción
trabaja con ciclos de cobro de **60 a 120 días** y el ferretero financia esa brecha con su propio
capital. Esto no es el fiado de `abarrotes`: es otro producto financiero y hay que modelarlo como tal.

### 6.1 · En qué se parece y en qué no al fiado de la tiendita

| | Fiado de libreta (`abarrotes`) | Crédito de contratista (aquí) |
|---|---|---|
| Quién debe | Doña Meche, la vecina | El ingeniero Loera, con RFC y tres obras |
| Cuánto | $340 promedio | $8,000 a $60,000 de saldo vivo |
| Documento | Ninguno | **Remisión firmada** y/o factura |
| Plazo | Ninguno escrito. "Cuando pueda" | **15 a 30 días**, escrito y acordado |
| Quién recoge | Ella misma | **Sus albañiles**, que no deben nada |
| Cómo se aplica el pago | Al saldo, más viejo primero | **A documentos que el cliente elige** |
| Bloqueo por mora | Un aviso, nunca un muro | **Un muro con llave**, y la llave la tiene el dueño |
| Si no paga | Se pierde una relación de vecindad | **Se pierde el equivalente a un mes de utilidad** |

### 6.2 · Las tres puertas por las que se pierde el dinero

Ésta es la parte que ningún punto de venta del segmento modela, y es el dolor 1.

**Puerta 1 · Se lo llevó alguien que no estaba autorizado.**
El contratista tiene tres albañiles con permiso. El cuarto llega, dice *"vengo de parte del inge"*, se
lleva $6,000 y firma con un garabato. Cuando llega la cuenta, el ingeniero la desconoce, **y tiene
razón**. Se resuelve con **F-638**: lista de autorizados por cliente y por obra, con foto si se quiere,
tope por autorizado, y **un aviso en el mostrador cuando quien pide no está en la lista** — un aviso,
no un muro, porque a veces el nuevo sí viene de parte del inge y lo que hace falta es una llamada de
treinta segundos antes de despachar, no después.

**Puerta 2 · No se sabe de qué obra fue.**
Loera lleva tres obras. Le pagaron la de Las Torres y no la de la colonia. Sin separación por obra, el
estado de cuenta es **un número grande** y la conversación de cobro es imposible. Con separación, es
*"de Las Torres me debes $18,400, y ésa ya te la pagaron"*. Se resuelve con **F-639**, y hay un
beneficio extra que cierra ventas: **el contratista necesita esa separación para su propia
contabilidad de obra**, así que la ferretería que se la da se vuelve difícil de cambiar.

**Puerta 3 · Nadie miró el saldo antes de despachar.**
El material sale a las 7:40 con prisa y el saldo está en una libreta bajo el mostrador. Cuando Beto lo
revisa a las once, ya salió. Se resuelve poniendo **el saldo, la antigüedad y el estado del límite en
la pantalla del mostrador, en el momento de elegir al cliente y antes de despachar** — no en el cobro,
porque en una venta a crédito **no hay cobro**.

### 6.3 · Cómo se reconoce cada momento

| Momento | Qué pasa |
|---|---|
| **Se entrega con remisión** | **Es venta**, método `credito`. Sube el saldo del cliente y de la obra, baja el stock, **no entra dinero**. Se guarda **quién firmó** de entre los autorizados. |
| **Se factura** | Puede ser el mismo día o al cierre de mes, agrupando remisiones. **Facturar no vuelve a ser venta**: la venta ya se reconoció en la entrega. Es un cambio de documento, no un ingreso nuevo. Es el error contable más común del giro y el sistema no lo puede cometer. |
| **Se recibe el pago** | **No es venta.** Entra dinero, baja el saldo, y se aplica **a los documentos que el cliente indica**. F-254 en variante. Si es transferencia, puede entrar **fuera de la sesión de caja**. |
| **Se devuelve sobrante** | Baja el saldo de esa obra y el material regresa a stock. F-138. |
| **Se declara incobrable** | Sólo el dueño, con motivo y bitácora. Sale del saldo y aparece como **pérdida del día en que se declara**, nunca como merma de inventario: el material sí salió y sí se vendió. |

### 6.4 · Lo que el sistema NO debe hacer

- **No cobrar intereses moratorios automáticamente.** Ninguna ferretería de barrio los cobra y
  proponerlos rompe la relación comercial que sostiene la cartera.
- **No mandar cobranza automática por WhatsApp.** Igual que en `abarrotes`: **F-616 se construye como
  lista de a quién hablarle**, con el texto listo, y el dueño decide y manda desde su teléfono.
- **No bloquear sin llave.** El muro por mora existe, pero **siempre hay una llave y siempre es del
  dueño**. Un sistema que le impida a Beto surtirle a su mejor cliente en una emergencia es un sistema
  que se apaga esa misma tarde.

---

## 7 · COMISIONES

**No hay comisión a empleados, y es una decisión deliberada que hay que dejar escrita porque es
tentadora y sería un error.**

El argumento a favor es obvio: el mostradorista **es** el producto, su venta se mide (F-054), y
comisionarlo parece lo natural. El argumento en contra es más fuerte y sale del negocio:

1. **Comisionar sobre venta empuja a vender la marca cara**, no la que resuelve. El mostradorista
   ofrecería Truper donde bastaba Pretul, y **lo único que sostiene a una ferretería de barrio frente a
   una cadena y frente a internet es que el consejo sea honesto**. El día que el cliente sospeche que
   le están vendiendo de más, se acabó la ventaja competitiva del negocio.
2. **Comisionar sobre margen empuja a no dar descuento**, y a perder ventas que sí convenía cerrar.
3. En un mostrador de cuatro personas donde uno atiende y otro cobra, **atribuir la venta es discutible
   y la discusión envenena el equipo**.

**Lo que sí hace el sistema:** medir venta, ticket promedio, líneas por venta y margen por
mostradorista (F-054), **y enseñárselo al dueño, no convertirlo en dinero automáticamente**. Si Beto
quiere dar un bono, lo da con el número en la mano y con su criterio. La perilla de comisión
(F-423/F-424) **existe apagada** y el día que un cliente la pida se enciende — con esta sección
impresa al lado.

**Y no hay comisión a favor del negocio** tampoco: F-255 (recargas, pago de servicios) se apaga entera.
Beto no cobra la luz. El "segundo negocio" de una ferretería no es dinero ajeno en tránsito: **es
trabajo propio**, y eso es F-258, que sí es venta.

---

## 8 · LA CAJA DE ESTE NEGOCIO

### 8.1 · Cuántas hay, y el modo que `abarrotes` no tiene

**Dos configuraciones, y la elección es del negocio:**

**Modo A · Mostrador único** (ferretería chica, dos o tres personas). El que atiende cobra. Es
exactamente el modelo de `abarrotes` y se hereda sin cambios. F-235 apagada.

**Modo B · Despacho y caja separados** (La Broca, y la mitad de las ferreterías del país). El
mostradorista arma la venta y **genera una nota**; el cliente pasa a caja, paga, y regresa —o el
material se le entrega ya pagado. **F-235 encendida por omisión**, y no porque haya dos cajas: porque
hay **una caja y N mostradores que generan notas**.

**Por qué el modo B existe y no es burocracia.** Es **el control anti-robo estructural del giro**.
Cuando la misma persona elige el producto, decide el precio y recibe el dinero, la venta no registrada
es trivial y el arqueo nunca la va a ver. Separarlas obliga a que dos personas se pongan de acuerdo
para robar, que es un salto de riesgo enorme. Con ticket promedio de ~$500, una venta no registrada al
día son más de $150,000 al año.

**Consecuencia para el sistema, y es grande:** la **nota de mostrador** es un documento intermedio real
—no es un ticket, no es una venta cerrada, no toca stock ni caja— que vive minutos y puede caducar. Hay
que modelarla (ver `05-DATOS-Y-BACKEND.md`) y hay que enseñarla en las dos pantallas.

**Lo que sí se hereda tal cual de `abarrotes`:** el relevo de persona sin cierre. En La Broca hay
comida escalonada y tres personas tocan la caja en un día, con **una sola sesión** y varios cortes de
turno. F-233 existe y no cierra la sesión.

### 8.2 · Cómo se abre

Idéntica a `abarrotes` §8.2 en mecánica —**se cuenta primero, con desglose por denominación
opcional**— con dos diferencias de contenido:

```
ABRIR CAJA
  Efectivo inicial contado *      [ $ 2,500.00 ]   ← se cuenta a mano, primero
     · desglose por denominación (recomendado)
  Notas de apertura (opcional)    [ .................. ]

  NO se pide saldo de recargas: F-255 está apagada.
  SÍ se muestra, como aviso y no como captura:
     · 3 ventas suspendidas de ayer sin resolver
     · 2 transferencias pendientes de confirmar
```

**El fondo es más grande que el de una tiendita y por una razón concreta:** el albañil de las 7:40 paga
un ticket de $180 con un billete de $500. El desglose por denominación —que `abarrotes` introdujo— aquí
sirve para lo mismo y con más urgencia, porque el primer pico del día es el de menos cambio disponible.

**Nada se puede cobrar sin caja abierta.** Mismo muro. Lo que **sí** se puede hacer sin caja abierta es
**armar notas de mostrador y cotizaciones**: no tocan dinero.

### 8.3 · Qué movimientos tiene

| Movimiento | Quién | Efecto en el cajón | ¿Suma a ventas? |
|---|---|---|---|
| Apertura con fondo | Encargado | **+** fondo | No |
| **Venta cobrada en efectivo** | Cajero | **+** monto | **Sí** |
| Venta cobrada con tarjeta o transferencia | Cajero | cero | **Sí** |
| **Venta entregada a crédito (remisión)** | Mostradorista + cajero | **cero** | **Sí** |
| **Pago de crédito en efectivo** · F-254 | Cajero | **+** monto | **No** |
| **Pago de crédito por transferencia** | Cajero o **dueño, fuera de caja** | **cero** | **No** |
| **Anticipo de pedido recibido** | Cajero | **+** monto | **No todavía** |
| **Surtido de pedido con anticipo aplicado** | Cajero | **+** sólo el saldo | **Sí, el total** |
| **Depósito de renta cobrado** | Cajero | **+** depósito | **No** |
| **Devolución de depósito de renta** | Cajero | **−** depósito | **No** |
| **Devolución de venta en efectivo** | Encargado | **−** monto | Resta de ventas |
| **Devolución de venta a crédito** | Encargado | cero | Resta de ventas y del saldo |
| Gasto en efectivo | Encargado | **−** monto | No |
| **Compra de contado al proveedor** | Encargado | **−** monto | No |
| **Pago a proveedor de una factura a crédito** | Dueño | **−** monto | No |
| Retiro parcial | Dueño | **−** monto | No |
| **Redondeo de cambio** · F-257 | Cajero | **±** | No |
| Corte de turno | Cajero saliente | Cuenta y entrega. **No cierra** | — |
| Cierre diario | Encargado | Cuenta, deja fondo, cierra | — |

**Diez de los diecinueve movimientos no suman a ventas, y cuatro suman a ventas sin tocar el cajón.**
Esa segunda categoría —**venta sin dinero**— es la que `abarrotes` casi no tiene y la que define la
caja de una ferretería.

**El pago por transferencia que llega fuera de la sesión de caja es un caso que hay que resolver bien.**
El contratista paga el domingo a las 9 de la noche. No hay caja abierta, no hay nadie en el mostrador,
y el dinero está en el banco. **Decisión: el pago de crédito por transferencia se registra sin sesión
de caja**, contra una cuenta de banco, y **no participa del arqueo de efectivo**. Si se obligara a
registrarlo dentro de una sesión, o se registraría tarde —y el saldo del cliente estaría mal el lunes
por la mañana, justo cuando llega por más material— o se registraría en la caja equivocada y el arqueo
diría que sobran $12,000.

### 8.4 · El arqueo, a ciegas, siempre

Heredado de `abarrotes` §8.4 **sin cambios en la mecánica**: se cuenta primero, se teclea, y **hasta
entonces** aparece el esperado y la diferencia. Con desglose por denominación. El esperado lo calcula
**el servidor** como fondo + entradas − salidas, **nunca** "ventas en efectivo" — y aquí esa distinción
es todavía más crítica que allá, porque **un tercio de las ventas no entra al cajón**. Un sistema que
calculara el esperado a partir de la venta diría que faltan $40,000 todas las noches.

**Segundo arqueo, propio de este modelo:** no es de saldo de recargas —eso es de la tiendita— sino de
**depósitos de renta vivos**. Si el módulo de renta está encendido, al cerrar se confirma cuántas
herramientas están afuera y cuánto depósito hay retenido. Es dinero del cajón que no es del negocio y
que no se puede repartir.

### 8.5 · La regla que salva el cierre

En `restaurante` es "no se puede cerrar con mesas abiertas"; en `abarrotes`, con ventas en espera. Aquí
son **cuatro**:

1. **No se puede cerrar con notas de mostrador sin resolver.** En modo B, una nota abierta es material
   comprometido que nadie cobró. O se cobra, o se cancela y el material vuelve a estar disponible.
2. **No se puede cerrar con ventas en espera vencidas** (F-224). Igual que en `abarrotes`, con una
   vigencia más larga porque aquí el cliente *"va a medir y vuelve"* mañana.
3. **No se puede cerrar con remisiones sin firma capturada.** Si salió material a crédito y no se
   registró quién firmó, esa cuenta es impugnable. Es la regla propia de este giro y es la que protege
   el dolor 1.
4. **No se puede cerrar con transferencias pendientes de confirmar de más de N horas.** O se verifican
   contra el banco o se marcan como no recibidas y la venta se reclasifica.

---

## 9 · EL CORTE Y SU PDF

### 9.1 · Qué contesta el corte de ESTE negocio

> **¿Cuadró la caja, cuánto material salió hoy sin cobrarse, y a quién?**

Las tres preguntas, en ese orden. `04-SISTEMA-DE-DISENO.md` §5 dice que el corte de abarrotes contesta
*"¿cuadró la caja y qué producto falta?"*. **Aquí la segunda pregunta cambia**, y cambia porque el
riesgo económico dominante cambió de lugar: en una tiendita el dinero se va en pieza chica; en una
ferretería se va en **crédito que no vuelve**. El faltante de producto sigue existiendo y sigue
importando —está en la sección 8— pero **no es la razón por la que este dueño lee el corte**.

### 9.2 · Qué NO lleva el corte de ferretería

- **Propinas. Ninguna sección, ni en cero.** Ver §4.
- **Dinero en tránsito, recargas, servicios, saldo de comisionista.** F-255 apagada. La sección 10 del
  corte de `abarrotes` **aquí no existe**.
- **Casco ni envase retornable.** Salvo depósitos de renta, si el módulo está encendido.
- **Nada de caducidad ni de próximos a vencer.** Un tornillo no se vence.
- **Meseros, mesas, recetas, insumos consumidos.** Igual que en `abarrotes`.
- **Desglose por tasa de IVA.** Todo es 16%: un desglose de una sola línea es ruido.

### 9.3 · El PDF, sección por sección, en orden

Documento carta / A4 vertical. Se genera con el mismo camino que `abarrotes` y `restaurante`
(`heredado/lib/pdfDownload.js` → `generatePDFBlobFromNode`), sobre un nodo propio. Se descarga y se
manda por WhatsApp al cerrar.

---

**1 · ENCABEZADO**
Logo, nombre, dirección, teléfono, **RFC**. A la derecha, en negritas: **CORTE DE CAJA**, folio,
sucursal, terminal, fecha y rango de horas.
*Por qué el RFC aquí y no en abarrotes:* porque este documento se cruza con facturación mucho más
seguido y a veces se le manda al contador tal cual.

**2 · DATOS DEL CORTE**
Apertura · Cierre · Quién abrió · Quién cerró · **Mostradores que operaron y sus horas** · Turnos con
su responsable · Tipo (turno / cierre diario) · Notas.
*Por qué:* es la cadena de responsabilidad, y aquí hay **dos cadenas distintas** —quién despachó y
quién cobró— porque son roles separados. Cuando falta dinero la pregunta es de qué turno; cuando falta
material, la pregunta es **quién despachó**.

**3 · ARQUEO DE EFECTIVO** — con desglose por denominación
Fondo esperado · Fondo contado · **Diferencia de apertura** · Efectivo esperado · **Efectivo contado**
· **Diferencia** con semáforo · Dinero dejado en caja · Tabla de denominaciones.
*Por qué antes que todo lo demás:* misma razón que en `abarrotes`. La primera pregunta del documento es
si cuadró.

**4 · DE DÓNDE SALIÓ EL EFECTIVO ESPERADO** — la cascada
Heredada de `abarrotes` §9.3 sección 4, con los renglones de este giro:

```
   Fondo de apertura                           +  2,500.00
   Ventas cobradas en efectivo                 + 11,840.00
   Pagos de crédito recibidos en efectivo      +  4,300.00
   Anticipos de pedido recibidos               +  3,000.00
   Depósitos de renta cobrados                 +    800.00
   Devoluciones de depósito de renta           −    500.00
   Devoluciones de venta en efectivo           −    386.00
   Compras pagadas de contado                  −  1,250.00
   Gastos en efectivo                          −    640.00
   Retiros                                     − 12,000.00
   Redondeos                                   −      7.50
   ──────────────────────────────────────────────────────
   EFECTIVO ESPERADO EN CAJÓN                     7,656.50
```

*Por qué existe:* porque **cinco de esos renglones no son ventas y tres ventas grandes no están ahí**.
Sin la cascada, quien cuenta el cajón ve un número que no puede reconstruir y concluye que el sistema
está mal. Es la sección que convierte "no cuadra" en "ya vi por qué".

**5 · SALIÓ Y NO SE COBRÓ** — ★ la razón de ser de este documento
La sección que `abarrotes` no tiene y que contesta la segunda pregunta del corte:

```
   VENTAS ENTREGADAS A CRÉDITO HOY
   Folio   Cliente                Obra            Quién firmó        Importe
   R-4418  Ing. Loera             Las Torres      Martín Pérez ✓   4,860.00
   R-4419  Plomería del Valle     —               J. Valdez ✓      1,240.00
   R-4420  Ing. Loera             Col. Juárez     ⚠ NO AUTORIZADO  2,310.00
   ────────────────────────────────────────────────────────────────────────
   TOTAL ENTREGADO A CRÉDITO HOY                                   8,410.00
   · % de la venta del día                                            34.1%
   · Anticipos pendientes de surtir                                 3,000.00
   · Material apartado en notas y ventas suspendidas                1,180.00
```

*Por qué es la sección más importante:* porque es **la única forma de que Beto vea, la misma noche, que
un tercio de lo que vendió hoy todavía no es dinero** — y de que vea el renglón con el ⚠, que es
$2,310 que alguien no autorizado se llevó esta mañana y que mañana va a ser una discusión. **Esa línea
sola paga la renta del sistema.** Sin ella, ese dato aparece en 45 días, cuando ya no se puede hacer
nada.

**6 · CARTERA** — el estado del dolor 1
Saldo total de la cartera · **Vencido** (con semáforo) · Cobrado hoy y por qué método · **Los cinco
saldos más viejos** con sus días · **Clientes que hoy quedaron sobre su límite** · Clientes bloqueados
por mora y quién levantó el bloqueo.
*Por qué en el corte y no sólo en su pantalla:* porque es el único momento del día en que este dueño se
sienta a leer, exactamente como Don Chuy. Si sólo está en el módulo de clientes, no se ve nunca.

**7 · RESUMEN DE VENTAS**
Total ventas · Nº de documentos · Ticket promedio · **Ventas por método** (efectivo, tarjeta,
transferencia, **crédito**) · Costo de lo vendido · **Utilidad bruta** · **Margen %** · Descuentos ·
**Ventas con lista distinta a público** · Gastos · **Utilidad neta estimada**.
*Por qué el renglón de "lista distinta a público":* es la fuga silenciosa del giro (§3) y no se ve en
la línea de descuentos.

**8 · VENTA Y MARGEN POR LÍNEA** — tabla
Línea · Venta · Costo · **Margen %** · % de la venta del día · **Margen objetivo de la línea**.
*Por qué la columna de objetivo:* porque el margen del eléctrico es 15% **por naturaleza** y el de
tornillería es 40% **por naturaleza**. Un 15% en eléctrico está bien; un 15% en tornillería es una
fuga. Sin la referencia, el número no dispara ninguna decisión — es la misma lógica con la que
`abarrotes` enseña el 1.5%–2.5% de robo hormiga al lado de su diferencia de conteo.

**9 · VENTA POR MOSTRADORISTA** — tabla
Persona · Nº de ventas · **Importe** · **Ticket promedio** · **Líneas por venta** · Margen % ·
Descuentos otorgados · Ventas con lista especial.
*Por qué esta sección, que en `abarrotes` está prohibida:* porque allá son tres personas conocidas
cobrando lo mismo, y aquí **la capacidad de asesorar es el producto**. "Líneas por venta" es el
indicador que mide si el mostradorista vendió la solución completa o sólo la pieza que le pidieron —
que es la diferencia entre la venta tradicional y la consultiva, y es lo que se puede enseñar.

**10 · MATERIAL CORTADO HOY** — tabla, sólo si hubo
Producto · Cortes · **Medida vendida** · **Merma de corte** · **Retazo generado** · Rollos abiertos que
quedaron · Costo de la merma.
*Por qué tiene su propia sección:* porque el corte es **el punto donde el material puede desaparecer
sin que nadie lo note**. Cinco cortes de cable con 30 cm "de merma" cada uno son 1.5 m que salieron y
no se cobraron. Si el sistema no acumula y no enseña el patrón, es la fuga perfecta. Al pie, la merma
de corte del mes contra el porcentaje esperado por tipo de material.

**11 · MOVIMIENTO DE EXISTENCIA Y FALTANTES** — tabla, sólo productos con movimiento o diferencia
Producto · Inicial · Entradas · Vendido · **Cortado** · Merma · **Esperado** · **Contado** ·
**Diferencia** · **$ al costo**.
*Por qué en el lugar 11 y no en el 7 como en `abarrotes`:* porque aquí el faltante de producto **no es
el dolor principal** y ordenar el documento por importancia real es parte del diseño. La columna
"Contado" sólo trae dato en lo que se contó hoy (F-149). **La diferencia se ordena por dinero, no por
cantidad**: faltan 3 brocas de $180 y sobran 200 taquetes de $0.40, y lo que importa son las brocas.

**12 · MERMA, GARANTÍAS Y CONSUMO** — tabla, sólo si hubo
Producto · Cantidad · **Motivo** (corte · dañado · roto · robo detectado · error de captura) ·
**Enviado a garantía al proveedor** con su antigüedad · Consumo de la casa · Costo.
*Por qué la garantía va aquí y separada:* porque **no es pérdida** —Truper repone— pero **sí es dinero
detenido**, y una garantía de hace cuatro meses que nadie reclamó sí acabó siendo pérdida. El renglón
dice cuánto hay afuera y desde cuándo.

**13 · DEVOLUCIONES DEL DÍA** — tabla, sólo si hubo
Folio original · Cliente · Producto · **Motivo** (no era la medida · no sirvió · sobrante de obra ·
defectuoso) · Destino (vendible · remate · merma) · Importe · Quién autorizó.
*Por qué tiene sección propia y en `abarrotes` va como un renglón:* porque aquí son **dos a cinco al
día** y porque el motivo es información comercial de primer orden. Un patrón de *"no era la medida"*
concentrado en un mostradorista es una necesidad de capacitación; concentrado en una línea, es una
señal de que falta una equivalencia (F-060) o una lista de materiales (F-153).

**14 · SERVICIOS DE MOSTRADOR** — tabla, sólo si el módulo está encendido
Servicio · Nº · Importe · **Material consumido a costo** · **Margen**.
*Por qué:* con 60%–80% de margen, es la línea más rentable del negocio y hoy no está en ningún reporte
de ningún sistema del segmento. Verla tres noches seguidas es lo que hace que Beto le ponga precio bien
y le dedique un pedazo de mostrador.

**15 · GASTOS, COMPRAS Y LO QUE SE DEBE** — tabla
Gastos del día por categoría · Compras recibidas hoy y su forma de pago · **Cuentas por pagar que
vencen esta semana, con su día** · Total de deuda a proveedores.
*Por qué juntas y por qué lo que vence:* porque el ferretero vive entre dos plazos —le pagan a 60 días
y paga a 30— y **la pregunta que le quita el sueño es si va a tener con qué el día 30**. `abarrotes`
dejó escrito en su P2 que ésta era una debilidad consciente de su orden de construcción. Aquí se
corrige.

**16 · QUÉ PEDIR** — lista, sólo si hay alertas
Producto · Existencia · Mínimo · **Venta de 90 días** · Sugerido · Proveedor · **Dinero ya dormido en
esa línea**.
*Por qué la última columna, que es rara:* porque es el momento exacto en que Beto está decidiendo
comprar, y es **el único momento en que el dato del dinero dormido puede cambiar la decisión**. Verlo
en un reporte al final de mes no cambia nada; verlo al lado de la línea que está a punto de pedir, sí.

**17 · CANCELACIONES Y AUTORIZACIONES** — tabla, sólo si hubo
Folio · Hora · **Usuario** · Motivo · Monto. Y aparte: descuentos sobre tope autorizados **por quién**,
despachos sobre el límite de crédito autorizados **por quién**, y bloqueos por mora levantados.
*Por qué al final y siempre con nombre:* es la sección de control. En `abarrotes` lo que se vigila son
las cancelaciones y los descuentos. Aquí, además, **las autorizaciones de crédito**, que es donde se
pierde de verdad el dinero.

**18 · FIRMAS**
*Responsable de caja* con nombre impreso · *Administrador*.

**19 · PIE**
Texto configurable + *Documento interno · MorphiqPOS · Generado [fecha y hora]*.

### 9.4 · Reglas del corte que no se negocian

1. El arqueo va a ciegas. Siempre.
2. El esperado lo calcula el servidor, y **nunca** se deriva de la venta: aquí un tercio de la venta no
   pasa por el cajón.
3. El PDF lleva folio, sucursal, terminal, quién cerró y a qué hora.
4. Lo que no aplica al giro **no aparece, ni en cero**: sin propinas, sin recargas, sin caducidad, sin
   desglose por tasa. Si el módulo de renta o el de servicios está apagado, sus secciones no existen.
5. **Regla propia de este modelo:** la sección 5 —*Salió y no se cobró*— aparece **siempre**, aunque el
   día no haya tenido crédito, con el total en cero y el saldo de cartera al pie. Es la única excepción
   a la regla 4 y está justificada: un día sin crédito en una ferretería es información, no ausencia de
   información.

---

## 10 · LOS CINCO DESCUADRES TÍPICOS

### Descuadre 1 · El material que salió firmado y no se registró

**Cómo nace.** Son las 7:45, hay cuatro albañiles esperando, y el de la obra de Loera se lleva dos
bultos de cemento, medio rollo de alambre recocido y una cubeta de impermeabilizante. Chava lo apunta
en el talonario y dice "al rato lo capturo". A las once ya no se acuerda de la cubeta. **El cajón
cuadra perfecto** —no entró ni salió dinero— y el inventario tiene un faltante que dentro de seis
semanas alguien va a llamar robo.

**Por qué es el número uno.** Porque ocurre **en el momento de mayor prisa del día**, porque no deja
rastro en la caja, y porque **contamina el indicador de faltantes**, que es el que sirve para detectar
el robo real. Un faltante por remisión no capturada es indistinguible de un robo, y es lo que hace que
los conteos acusen a gente inocente — es exactamente el error 2 de `03-INVENTARIO.md` de `abarrotes`,
aquí con montos diez veces mayores.

**Cómo lo previene el sistema.** La remisión **se genera en el sistema, no en el talonario**: se arma
la venta, se elige al cliente, se elige quién firma, se imprime y se firma. Cinco toques. Y para que
eso sea posible a las 7:45, la búsqueda tiene que ser más rápida que el talonario — que es, otra vez,
por qué F-201 está en la tanda 0. **La regla de cierre 3** cierra el hueco: no se puede cerrar el día
con remisiones sin firma capturada.

### Descuadre 2 · El pago que entró al banco y no a ninguna parte

**Cómo nace.** El contratista transfiere $14,000 el domingo. El lunes llega por más material y su saldo
sigue mostrando la deuda completa, porque nadie ha visto el banco. Se le niega el crédito o se le
despacha "sobre el límite", y en los dos casos el cliente se molesta con razón. O al revés: Norma
registra el pago el lunes dentro de la sesión de caja, **y el arqueo de la noche dice que sobran
$14,000**.

**Por qué importa tanto.** Porque las transferencias son el 20%–35% del valor y casi ninguna coincide
con una sesión de caja abierta. **Es el descuadre que más rápido destruye la confianza en el arqueo**,
porque las cantidades son grandes.

**Cómo lo previene el sistema.** El pago de crédito por transferencia se registra **contra banco, con
su fecha real, fuera de la sesión de caja**, y no participa del efectivo esperado. El saldo del cliente
se actualiza al instante. En el corte aparece en la sección 6 (cartera, cobrado hoy por método) y **no**
en la cascada del efectivo.

### Descuadre 3 · La merma de corte que nadie registra

**Cómo nace.** Se cortan 60 m de un rollo de 100. Entre lo que se lleva la segueta, lo que se mide de
más "para que no le falte" y el pedazo que queda torcido, salen 61.2 m y se cobran 60. Nadie lo nota:
son 1.2 m. Pero pasa ocho veces al día en cable, manguera, cadena y alambre, y a fin de mes son
**decenas de metros** que el sistema cree que están y no están. Cuando llega el conteo, la diferencia
aparece completa y de golpe, y no hay forma de explicarla.

**Por qué es específico de este giro.** Porque `abarrotes` no corta nada: pesar 800 g de frijol no
destruye frijol. **Aquí el acto de vender consume material adicional al vendido**, y si eso no se
modela, el inventario de todo el material lineal es ficción desde el primer mes.

**Cómo lo previene el sistema.** **F-145 + F-150**: el corte se registra como **dos movimientos** —la
venta de 60 m y la merma de 0.4 m— y el retazo invendible se da de baja con su motivo. La pantalla de
corte pide la medida entregada **y** ofrece la merma con un valor por omisión configurable por tipo de
material. En el corte diario, la sección 10 acumula el patrón: si la merma de corte de cable pasa del
umbral, hay una de dos cosas —alguien corta mal o alguien se está llevando material— y las dos hay que
verlas.

### Descuadre 4 · El anticipo que se contó como venta

**Cómo nace.** Entran $3,000 de anticipo por una herramienta que hay que pedir. El cajero, sin
categoría donde ponerlo, lo cobra como una venta de $3,000 sin producto o lo mete como "entrada de
caja". Resultado: la venta del día sube $3,000 **sin costo asociado** —margen del 100%—, el inventario
no se mueve, y cuando dos semanas después llega la herramienta y se entrega, **se vuelve a cobrar la
venta completa**. La misma operación contada dos veces, con un margen absurdo en medio.

**Cómo lo previene el sistema.** El anticipo es **un pasivo con su propio movimiento de caja**: entra
al cajón, **no toca ventas**, y queda amarrado al pedido. Al surtir, se reconoce la venta completa y el
anticipo se aplica como método de pago, cobrándose sólo el saldo. En el corte va en la cascada
(sección 4) y en el renglón de *anticipos pendientes de surtir* de la sección 5, que además le dice a
Beto cuánto material debe.

### Descuadre 5 · La nota de mostrador que se quedó a medias

**Cómo nace.** Sólo existe en el modo B. El mostradorista arma una nota de $2,400, el cliente dice "voy
por el dinero al cajero automático" y no vuelve. La nota queda abierta, el material apartado, y al día
siguiente alguien lo vende otra vez. O peor: la nota se cobra en caja, el cliente se va **sin recoger
el material**, y el material sigue en el mostrador hasta que se traspapela.

**Por qué es propio de este modelo.** Porque en `abarrotes` el que cobra es el que entrega, y no hay
hueco entre una cosa y la otra. **Separar despacho de cobro —que es el control anti-robo del giro—
abre este hueco**, y hay que cerrarlo o el remedio sale peor que la enfermedad.

**Cómo lo previene el sistema.** La nota de mostrador tiene **vigencia** —configurable, por omisión 30
minutos— y **se libera sola** avisando en la pantalla del mostrador. La venta cobrada y no entregada
queda en estado **"pagada, pendiente de entrega"**, aparece en una lista visible en las dos pantallas, y
**bloquea el cierre** (regla 1 de §8.5). Ninguna de las dos es una confirmación por adelantado: son
estados visibles y un cierre que no deja pasar.

**Y el caso que no es descuadre pero se le parece:** el comprobante de transferencia falso. No se puede
prevenir desde el sistema, igual que en `abarrotes`. Lo que sí se puede es marcar la venta como
*pendiente de confirmar*, excluirla del efectivo esperado, **no aplicarla al saldo del cliente** hasta
que alguien la verifique, y bloquear el cierre si lleva más de N horas sin verificar. Fingir que el
sistema lo resuelve sería mentir; aquí, con montos de miles de pesos, sería una mentira cara.
