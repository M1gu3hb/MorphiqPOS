# 02 · DINERO Y CAJA · Abarrotes / tienda de conveniencia

**Éste es el archivo más importante de la carpeta.** En un negocio que vive de un margen del 20%,
un descuadre de $300 al día se come la utilidad de la semana. Todo lo que sigue se apoya en tres
reglas de la Fase 1 que no se negocian: **bigint de centavos** (nunca flotantes), **precios y
totales siempre en el servidor** (el endpoint no acepta importes del cliente), y **el arqueo va a
ciegas** con el esperado calculado por el servidor.

> **La frase que hay que tener en la cabeza leyendo todo esto:** en una tiendita, **buena parte del
> dinero que pasa por el cajón no es del negocio**. Es de la compañía de luz, es del que va a
> recargar su teléfono, es el depósito del casco, es el abono de un fiado que se vendió la semana
> pasada. Un punto de venta que no sabe distinguir *dinero propio* de *dinero en tránsito* hace que
> el cajón nunca cuadre, y el tendero acaba culpando al sistema y volviendo a la libreta.
> Esa distinción es el eje de este documento.

---

## 1 · QUÉ CUENTA COMO VENTA Y QUÉ NO

La venta de este negocio es **el importe de los productos entregados y registrados en un ticket
cerrado**. Ni un peso más, sin importar cuánto entró al cajón.

| Concepto | ¿Es venta? | Tratamiento exacto |
|---|---|---|
| **Producto cobrado de contado** | **Sí** | El caso del 95%. `ordenes.total_centavos`, IVA extraído por línea con la tasa de esa línea. |
| **Producto entregado a fiado** | **Sí, en el momento de la entrega** | Aquí está la trampa más común del giro. La venta ocurre cuando el producto sale de la tienda, no cuando doña Meche paga. Si se reconociera al cobrar, el inventario bajaría hoy y la venta aparecería en tres semanas, y el margen del mes saldría absurdo. **Se registra como venta con método de pago `credito`**, que suma a ventas y **no suma al cajón**. |
| **Abono de un fiado viejo** | **No.** Es cobranza | Entra dinero al cajón, baja el saldo del cliente, **la venta del día no cambia**. Función **F-254**. Si se registrara como venta, la venta del día se contaría dos veces: una al entregar y otra al cobrar. |
| **Recarga telefónica** | **No.** Sólo la comisión | El cliente paga $200, entran $200 al cajón, el saldo del comisionista baja $200. **El ingreso son $12** (6%, TAECEL). Función **F-255**. |
| **Pago de servicio (CFE, Telmex, Sky, Izzi)** | **No.** Sólo la comisión | Entran $1,240 al cajón que no son de la tienda. El ingreso son los $3 a $22 de la operación (Clip / Yastás). |
| **Paquetería (recibir o entregar un paquete)** | **No.** Sólo la comisión | Mercado Libre paga hasta $6 por paquete (Expansión, 2026). No entra dinero del cliente; la comisión se liquida después, así que es **una cuenta por cobrar**, no una entrada de caja. |
| **Depósito de envase (casco)** | **No. Es un pasivo** | El cliente paga $10 de casco por la caguama. Ese dinero **hay que devolverlo** cuando traiga la botella. El art. 11 de la LFPC obliga a devolverlo íntegro. Va a una cuenta de depósitos, no a ventas. Función **F-256**. |
| **Devolución de casco** | **No. Cancela el pasivo** | Salen $10 del cajón contra la cuenta de depósitos. No es una devolución de venta ni un gasto. |
| **Vale de despensa (Sí Vale, Edenred)** | **Sí, es venta** | El vale es **método de pago**, no descuento. El producto se vendió al precio de lista. Lo que sí cambia es que ese dinero no está en el cajón: llega por depósito del emisor días después, con su comisión descontada. **La comisión del emisor es un gasto, no un descuento sobre la venta.** |
| **Descuento y "3 x $25"** | Resta | Baja la venta y **no baja el costo**: el producto se compró igual. En un giro de 20% de margen, un 10% de descuento se lleva la mitad de la utilidad de esa línea. Por eso el descuento aparece con nombre en el corte. |
| **Merma, caducado, roto** | **No es venta.** Es pérdida | Sale de stock, no toca caja, aparece en su propia sección del corte valuada a **costo**, no a precio de venta. Valuarla a precio infla artificialmente la pérdida y hace que el dueño desconfíe del número. |
| **Canje al proveedor (pan de Bimbo)** | **No es venta ni es merma** | Sale de stock **sin pérdida económica**: el proveedor lo repone o lo abona. Motivo de salida propio. Meterlo en merma hace inútil el indicador que sirve para el dolor 1. |
| **Consumo de la casa** | **No es venta** | El refresco que se toma el sobrino. Sale de stock, no entra a ventas, y va a su propia línea. Si se registra como merma, el indicador de robo miente; si no se registra, aparece como faltante y acusa a alguien injustamente. |
| **Ticket en $0.00** | No es venta | Se depuran igual que en `restaurante`. Nunca entran al corte. |

**La prueba de que está bien, y es la prueba del giro entero:**

```
Dinero que debería haber en el cajón al cierre
  = fondo de apertura
  + ventas cobradas en efectivo
  + abonos de fiado cobrados en efectivo          ← F-254
  + dinero de recargas y servicios recibido       ← F-255
  + depósitos de casco cobrados                   ← F-256
  − devoluciones de casco pagadas                 ← F-256
  − devoluciones de venta pagadas en efectivo
  − gastos pagados en efectivo
  − retiros

Y NINGUNO de los cuatro renglones marcados toca "Total ventas".
```

Si para llegar a la venta real del mes hay que restarle las recargas a mano, el sistema está mal.
Si para cuadrar el cajón hay que ignorar los abonos, también.

---

## 2 · IMPUESTOS

**Aquí este modelo se separa de `restaurante` por completo, y es la sección con más superficie
regulatoria de toda la carpeta.**

### 2.1 · IVA · tres tasas en la misma bolsa

En un restaurante todo el menú causa 16% y la plantilla puede arrancar con tasa única. Aquí no:
**el mismo ticket mezcla 0% y 16%**, y no es una excepción, es el caso normal.

| Tasa 0% (LIVA art. 2-A) | Tasa 16% |
|---|---|
| Abarrote seco: arroz, frijol, azúcar, harina, aceite, pasta, sal | **Refrescos, jugos, néctares, bebidas saborizadas y concentrados** |
| Leche entera, semi, descremada y en polvo | **Agua embotellada en envase menor a 10 litros** (el garrafón de 20 L es 0%) |
| Pan, tortilla, galleta | Cerveza, vinos y licores |
| Carne, pollo, huevo, embutido | **Cigarros y tabaco** |
| Fruta y verdura, hielo | Jabón, detergente, cloro, suavizante |
| Dulces y chocolate (son alimento) | Papel higiénico, servilletas, pañuelos |
| **Botanas** (son alimento: 0% de IVA, pero pagan IEPS) | Pilas, focos, desechables, cerillos |
| **Alimento procesado para perros, gatos y mascotas de hogar** | Accesorios y artículos de higiene para mascotas |

**Cómo se calcula, y por qué no se puede copiar la fórmula del restaurante.** En `restaurante` el
IVA se extrae del total con `impuestos = total − round(total / 1.16)`, una sola vez. Aquí eso es
imposible porque el total mezcla tasas. El algoritmo es:

```
1. Se agrupa el ticket por tasa.
2. Por cada grupo se suma el importe bruto de sus líneas, en centavos.
3. Se extrae el impuesto UNA VEZ por grupo:  iva_grupo = bruto − round(bruto / (1 + tasa))
4. Los grupos se suman.
```

**Nunca por línea.** Un ticket de 14 artículos redondeado línea por línea se desvía entre uno y
siete centavos del mismo ticket redondeado por grupo, y un corte que no cuadra por tres centavos
hace que el dueño deje de confiar en el resto del documento. Esto no es purismo: es la razón número
uno por la que los tenderos dicen "el sistema no cuadra".

**Precio al público, siempre.** El anaquel dice $18.00 y se cobran $18.00. Nadie pone "+IVA" en una
tiendita. El IVA se extrae, nunca se suma.

**Cómo se precarga.** La tasa viene **por categoría** en la plantilla de importación masiva
(F-032). Si el sistema espera que Don Chuy marque 1,800 productos uno por uno, todo va a quedar al
16% y la declaración va a salir mal desde el primer mes. La categoría trae la tasa por omisión y
el producto puede sobrescribirla.

### 2.2 · IEPS · tres mecánicas distintas, todas dentro del precio de anaquel

| Concepto | Mecánica | Cuota / tasa 2026 |
|---|---|---|
| Bebida saborizada **con azúcares añadidos** | **Cuota por litro** | **$3.0818 / litro** (subió desde ~$1.64 en 2025) |
| Bebida **con edulcorantes** (light, zero) | **Cuota por litro** | **$1.50 / litro** — nueva en 2026 |
| Suero oral con fórmula específica | Exento | — |
| Botanas y alimentos no básicos **≥275 kcal/100 g** | **Porcentaje ad valorem** | **8%** |
| Bebidas energizantes y concentrados | Ad valorem | **25%** |
| Cigarros | Ad valorem **+ cuota por pieza** | **200%** ad valorem (era 160% en 2025) + **$0.8516** por cigarro, con ruta gradual a $1.1584 en 2030 |

Tres formas distintas de calcular —por litro, por porcentaje y por pieza— conviviendo en el mismo
ticket. El producto necesita, además de la tasa de IVA, un **régimen de IEPS** con su parámetro, y
el litraje cuando la cuota es por litro.

**La decisión de alcance, y hay que tomarla explícitamente.** El IEPS de una tiendita **lo paga el
fabricante**, no el detallista: Don Chuy compra la Coca con el IEPS ya dentro y la vende con el
IEPS ya dentro. Él no lo declara. Entonces, ¿para qué modelarlo?

Por dos razones concretas, y ninguna es fiscal:

1. **Porque explica el margen.** Un refresco tiene 10%–15% de margen y una botana 30%–45%, y buena
   parte de esa diferencia es impuesto. Un dashboard que no lo sabe le dice al tendero que el
   refresco "no deja", sin decirle por qué ni qué puede hacer.
2. **Porque los aumentos de impuesto son el evento comercial más violento del giro.** En enero de
   2026 los cigarros subieron hasta $17 por cajetilla y ANPEC reportó caídas de venta de 20%–30%.
   Cuando eso pasa, el tendero necesita saber en una tarde qué productos suben, cuánto, y qué
   precio nuevo poner. Un sistema que conoce el régimen IEPS de cada producto contesta eso con un
   botón.

**Por lo tanto:** el IEPS se modela como **dato informativo del producto**, participa en el cálculo
del margen y en la actualización masiva de precios, y **no se desglosa en el ticket al cliente**,
porque el detallista no lo traslada por separado. Sí se desglosa en la factura cuando el cliente la
pide con RFC y el producto lo requiere.

### 2.3 · Régimen del negocio

**RESICO persona física.** Límite de $3.5 millones anuales, ISR de **1% a 2.5% sobre ingresos
efectivamente cobrados**. Si rebasa el límite, sale a Actividad Empresarial al mes siguiente.
Consecuencia de producto: **la base de ISR es lo COBRADO, no lo facturado**, así que el fiado no
entregado en efectivo **todavía no causa ISR**. El sistema tiene que poder separar venta devengada
de venta cobrada, y hoy no lo hace.

**Factura global mensual**, obligatoria en RESICO. Desde 2026 el plazo de emisión bajó de 72 a
**24 horas**. Ver §9.5.

---

## 3 · DESCUENTOS

| Pregunta | Respuesta de este negocio |
|---|---|
| **Quién puede darlos** | El dueño, siempre. El encargado, hasta un tope. **El cajero, no.** Hoy el permiso `hacer_descuentos` es binario y eso, aquí, es un agujero. |
| **Hasta cuánto** | **Tope duro por rol, y en este giro el tope tiene que ser chico**: el margen bruto promedio es del 20%. Un descuento del 10% se lleva la mitad de la utilidad de esa línea; uno del 25% vende a pérdida. Propuesta: cajero 0%, encargado 5%, dueño sin tope. |
| **Requieren autorización** | Por encima del tope del rol, **PIN de un supervisor**, y el PIN queda en la bitácora. Es F-205, y en este giro es más urgente que en restaurante porque el margen tolera menos. |
| **Cómo afectan el margen** | Bajan la venta y **no bajan el costo**. El corte tiene que enseñar el descuento como línea propia y agrupado por quién lo aplicó. |
| **Descuento contra promoción** | Son cosas distintas y no se deben confundir. La **promoción** ("3 x $25", F-025) es una regla de precio del catálogo, planeada, con margen calculado de antemano. El **descuento** es una decisión de mostrador. Mezclarlos hace imposible saber si el margen bajó por estrategia o por fuga. |

**El descuento fantasma es la puerta de robo más silenciosa, y aquí es peor que en restaurante.**
El cajero cobra $100 completos, registra 20% de descuento y se queda $20. **La caja cuadra
perfecto.** En un restaurante eso pasa una o dos veces por turno y el monto es grande, así que se
nota. En una tiendita con 220 tickets al día, $3 de descuento fantasma por ticket son $660 diarios
y ninguno llama la atención. **Por eso el cajero no debe tener descuento encendido, punto**, y la
perilla debe venir apagada de fábrica en la plantilla `tienda`.

---

## 4 · PROPINAS

**No hay. Variante V1 · sin propinas. Se apaga el módulo completo.**

No es una omisión: es una definición del modelo, y hay que escribirla para que nadie la "arregle"
después.

- **Nadie deja propina por venderle una Coca.** La propina existe donde hay servicio personal
  sostenido: una mesa atendida durante noventa minutos, un corte de cabello, una entrega a
  domicilio. Aquí el contacto dura veinte segundos y consiste en pasar un producto por el lector.
- **Consecuencia en la pantalla de cobro:** no hay paso de propina, no hay porcentajes sugeridos,
  no hay diálogo de desglose por método. La pantalla de cobro de este modelo es **más corta** que
  la de restaurante en un paso entero, y ése es exactamente el punto: es la pantalla que menos
  puede permitirse un paso de más.
- **Consecuencia en el corte:** **no aparece ninguna sección de propinas, ni en cero**. Regla 4 de
  `04-SISTEMA-DE-DISENO.md` §5. Un renglón "Propinas: $0.00" en el corte de una tiendita hace
  dudar del resto del documento.
- **Consecuencia en el código:** `F-240` a `F-246` existen y funcionan (`packages/app/src/propinas/`).
  **No se borran ni se modifican.** Se apagan por plantilla. El día que este mismo esqueleto A1 se
  use para `comida-rapida` —donde sí hay bote de propinas— se encienden sin tocar una línea.

**La confusión que hay que evitar:** el "vueltito" o el redondeo hacia arriba ("quédese con el
cambio") **no es una propina**: es un redondeo de cambio, y se registra como tal en **F-257**,
porque su efecto es sobre el cajón y no sobre el salario de nadie.

---

## 5 · MÉTODOS DE PAGO

| Método | Uso real en este giro | Notas |
|---|---|---|
| **Efectivo** | **75%–90% de los tickets.** Es, con enorme diferencia, el método del giro | El efectivo sigue siendo el 40% del valor de las transacciones presenciales en México (Worldpay 2026), y en el canal tradicional la proporción es mucho mayor. El 78% de los tenderos no tiene relación bancaria (ANPEC). **Todo el diseño de la caja gira alrededor del efectivo y del cambio.** |
| **Tarjeta / terminal** | 5%–20%, y subiendo | Tener terminal sube las ventas hasta 60% y el ticket 22% (Marketing4eCommerce). Pero cada transacción tiene comisión, y en tickets de $35 con 20% de margen esa comisión se come una parte visible de la utilidad. **La comisión de terminal es un gasto**, no un descuento sobre la venta, y debe registrarse como tal o el margen sale mal. |
| **Transferencia (SPEI / CoDi)** | 3%–10% y creciendo rápido | El cliente manda el dinero desde su teléfono y enseña el comprobante. **Riesgo real del giro:** el comprobante falso. El sistema no puede verificarlo; lo que sí puede es marcar la venta como *transferencia pendiente de confirmar* y sacarla del efectivo esperado. |
| **Fiado (crédito)** | **~5% de los tickets, concentrado en 30–40 personas** | Método de pago propio. Suma a ventas, **no suma al cajón**. Ver §6. |
| **Vale de despensa** | Picos a fin de quincena, 0%–8% | Método de pago. El dinero llega por depósito del emisor días después, con comisión. |
| **Mixto** | Poco frecuente, casi siempre "efectivo + lo que debía" | El caso típico no es pagar con dos tarjetas: es *"le abono $100 de lo que debo y llevo estas cosas"*. Es venta + abono en un solo movimiento, y el sistema tiene que saberlo distinguir. |

**Lo que esto implica para la interfaz de cobro, y es distinto de restaurante:** el cobro de un
abarrote se resuelve en **una tecla**. El camino por omisión es efectivo, el cambio se calcula
solo, y las denominaciones frecuentes ($50, $100, $200, $500, "exacto") están como botones. El
método no-efectivo es un desvío, no una pregunta. Preguntar "¿cómo va a pagar?" 220 veces al día
cuando la respuesta es efectivo 200 de esas veces es fricción pura.

---

## 6 · FIADO · el crédito de este negocio

El **78% de los tenderos fía** (ANPEC). El **79.83%** reporta que cada vez se lo piden más, con un
alza del 30% en solicitantes, y el **63.37%** ha tenido pérdidas de al menos 20%. No es un caso
raro: es una parte estructural del modelo de negocio, y es el segundo dolor más caro.

### 6.1 · Cómo funciona de verdad

No es una línea de crédito. Es una relación: doña Meche vive a dos casas, lleva doce años comprando
ahí, y paga los martes cuando le pagan en la maquila. No hay contrato, no hay plazo escrito, no hay
interés. Hay una hoja en la libreta con su nombre y una columna de números.

**El límite existe y está en la cabeza de Don Chuy**, no en un papel: *"a ésta le fío hasta $500,
al otro ya no le fío nada"*. El sistema no debe inventar un límite: debe **capturar el que el dueño
ya tiene** y recordárselo en el momento correcto.

### 6.2 · Cómo se reconoce

| Momento | Qué pasa |
|---|---|
| **Se entrega el producto** | **Es venta**, con método `credito`. Sube `clientes.saldo_pendiente_centavos`, baja el stock, **no entra dinero al cajón**. |
| **Se abona** | **No es venta.** Entra efectivo al cajón, baja el saldo. **F-254**. |
| **Se aplica el abono** | Al saldo, **más viejo primero**. No hay facturas que aplicar. |
| **Se cancela una venta fiada** | Baja el saldo, regresa el stock, y queda el motivo. |
| **Se declara incobrable** | Ajuste con motivo y autorización del dueño. Sale del saldo y aparece como **pérdida** en el corte del día en que se declara, nunca como merma de inventario: el producto sí salió y sí se vendió. |

### 6.3 · Qué tiene que hacer el sistema, y dónde

**El aviso tiene que aparecer ANTES de que el producto se meta en la bolsa.** Después no sirve de
nada. En concreto:

1. En la pantalla de cobro hay una tecla (**F4**) que abre el buscador de cliente. Al elegirlo,
   aparece en el encabezado del ticket: **nombre · saldo · días del más viejo**, en una franja que
   cambia de color. Ámbar si debe más de 15 días; rojo si pasó su límite.
2. Si el cliente está por encima de su límite, cobrar a crédito **pide confirmación del dueño o
   encargado**. No lo impide: lo hace consciente. Si el sistema le prohibiera fiarle a su comadre,
   Don Chuy apaga el módulo y volvemos a la libreta.
3. El ticket impreso de una venta fiada lleva **el saldo total después de esta compra**. Es lo que
   la libreta hacía bien y es lo que hace que el cliente sepa dónde está parado.

### 6.4 · Lo que el sistema NO debe hacer

- **No cobrar intereses.** No existen en este giro y ofrecerlos convierte al tendero en algo que no
  quiere ser frente a sus vecinos.
- **No mandar recordatorios automáticos por WhatsApp sin que el dueño los apruebe uno por uno.** Un
  mensaje automático de cobranza a la vecina rompe la relación que sostiene todo el negocio.
  F-616 existe, y aquí se construye como **lista de a quién hablarle**, no como envío automático.
- **No bloquear la venta.** Ver arriba.

---

## 7 · COMISIONES · el segundo negocio de la tienda

**No hay comisiones a empleados.** Al que cobra se le paga sueldo. Pero sí hay comisiones **a
favor** de la tienda, y son un negocio entero que ningún POS de este segmento modela bien.

| Servicio | Lo que entra al cajón | Lo que es ingreso | Cuándo se causa |
|---|---|---|---|
| **Recarga telefónica** | El monto completo ($20 a $500) | **6%** del monto (TAECEL; 5% en esquema de afiliado) | En el acto. Se descuenta del saldo prepagado del comisionista |
| **Pago de servicio** (CFE, Telmex, Sky, Izzi, Totalplay, Infonavit) | El importe del recibo | **$3** (Clip) a **$22** (Yastás) por operación | En el acto. A veces el tendero además le cobra $8–$10 al cliente |
| **Paquetería** (Mercado Libre) | **Nada** | **Hasta $6 por paquete** (Expansión, 2026) | Se acumula y se liquida después: es **cuenta por cobrar** |
| **Corresponsalía / retiro de efectivo** | Sale dinero del cajón | Comisión por operación | En el acto, y **descapitaliza el cajón**, que es su riesgo real |

### 7.1 · Por qué esto no puede registrarse como venta

Con $10,000 de recargas al mes al 6%, el ingreso son **$600 limpios** — comparable a vender $6,000
de refresco al 10% de margen, pero **sin inventario, sin merma, sin caducidad y sin capital
invertido en el anaquel**. Si esos $10,000 entran como venta:

- La venta del mes se infla de $40,000 a $50,000.
- El margen reportado se desploma, porque esos $10,000 entran con costo $9,400.
- El "ticket promedio" deja de significar nada.
- Y el dueño, viendo un margen del 12%, toma decisiones de precio equivocadas sobre todo lo demás.

### 7.2 · Cómo se modela · F-255

```
Operación de comisión
  ├── monto_recibido        $200.00   → entra al cajón, NO es venta
  ├── monto_entregado       $200.00   → baja el saldo del comisionista
  ├── comision_centavos      $12.00   → ES ingreso, va a "otros ingresos"
  ├── comision_al_cliente     $0.00   → si el tendero cobra extra, también es ingreso
  └── referencia            (folio de la recarga o del recibo)
```

**El saldo del comisionista es un almacén de dinero.** Don Chuy deposita $1,000 y recibe $1,065 de
saldo para vender (TAECEL). Ese saldo se agota igual que se agota el aceite, y necesita **su propia
alerta de mínimo**: quedarse sin saldo de recargas a las ocho de la noche es perder todas las
recargas de la noche. Es la misma mecánica de F-107 aplicada a otra cosa, y sale casi gratis.

---

## 8 · LA CAJA DE ESTE NEGOCIO

### 8.1 · Cuántas hay

**Una.** Un mostrador, un cajón de madera o de metal, una persona a la vez. F-235 (varias cajas
simultáneas) viene **apagada** en la plantilla `tienda` y se enciende sólo en la tienda grande de
dos mostradores, que ya es otro animal.

Lo que sí hay, y `restaurante` no tiene, es **relevo de persona sin cierre**: Lupita en la mañana,
el sobrino de 16:00 a 21:00, Lupita otra vez al final. Tres personas, **una sesión de caja**, tres
cortes de turno. Por eso F-233 existe y no cierra la sesión.

### 8.2 · Cómo se abre

```
ABRIR CAJA
  Efectivo inicial contado *      [ $   800.00 ]   ← se cuenta a mano, primero
     · desglose por denominación (opcional)         ← ver abajo
  Saldo de recargas disponible    [ $ 1,065.00 ]   ← se lee del portal del comisionista
  Notas de apertura (opcional)    [ .................. ]
```

**Dos cosas propias de este giro que no están en `restaurante`:**

1. **El desglose por denominación al abrir.** El fondo de una tiendita no son $800: son "cuatro de
   $100, ocho de $50 y el resto en monedas". El fondo existe **para dar cambio**, no como capital,
   y un fondo de $800 en dos billetes de $500 es inútil a las 7 de la mañana. Capturar el
   desglose es opcional, toma quince segundos y es lo que permite que el sistema avise *"te vas a
   quedar sin monedas de $10"*.
2. **El saldo de recargas.** Se captura al abrir y al cerrar, y su diferencia tiene que cuadrar
   contra las recargas vendidas. Es un segundo arqueo, de un segundo tipo de dinero.

**Nada se puede cobrar sin caja abierta.** Mismo muro que en `restaurante`: tarjeta ámbar, pantalla
bloqueada, botón que lleva a abrir.

### 8.3 · Qué movimientos tiene

| Movimiento | Quién | Efecto en el cajón | ¿Suma a ventas? |
|---|---|---|---|
| Apertura con fondo | Encargado | **+** fondo | No |
| **Venta cobrada en efectivo** | Cajero | **+** monto | **Sí** |
| Venta cobrada con tarjeta / transferencia | Cajero | cero | **Sí** |
| **Venta a fiado** | Cajero | **cero** | **Sí** |
| **Abono de fiado en efectivo** · F-254 | Cajero | **+** monto | **No** |
| **Recarga / pago de servicio cobrado** · F-255 | Cajero | **+** monto recibido | **No** (sólo la comisión, y va a otros ingresos) |
| **Depósito de casco cobrado** · F-256 | Cajero | **+** depósito | **No** |
| **Devolución de casco pagada** · F-256 | Cajero | **−** depósito | **No** |
| **Devolución de venta en efectivo** | Encargado | **−** monto | Resta de ventas |
| Gasto en efectivo | Encargado | **−** monto | No |
| **Compra pagada de contado al proveedor** | Encargado | **−** monto | No |
| Retiro parcial | Encargado o dueño | **−** monto | No |
| Entrada de cambio | Encargado | **+** monto | No |
| **Redondeo de cambio** · F-257 | Cajero | **±** centavos/pesos | No |
| Corte de turno | Cajero saliente | Cuenta y entrega. **No cierra** | — |
| Cierre diario | Encargado | Cuenta, deja fondo, cierra | — |

**Once de los quince movimientos no suman a ventas.** Ésa es la forma real de la caja de una
tiendita, y es la razón por la que un POS diseñado para restaurante no cuadra aquí.

**La compra de contado al proveedor es un movimiento de caja de primera clase**, no un gasto
genérico. Cuando llega el de Sabritas y cobra $2,400 en efectivo, eso sale del cajón **y** es una
entrada de inventario **y** actualiza el costo promedio. Tres efectos, una transacción. Si el
sistema obliga a capturar la compra en otro módulo y el gasto en otro, uno de los dos se va a
olvidar, y el que se olvida siempre es el del cajón.

### 8.4 · El arqueo, a ciegas, siempre · y con denominaciones

```
1.  El sistema pide:   Efectivo contado físicamente *   [ $ ______ ]
    (opcional, recomendado)  desglose por denominación
       $1000 [ 0 ]  $500 [ 2 ]  $200 [ 4 ]  $100 [ 11 ]  $50 [ 9 ]
       $20 [ 14 ]  $10 [ 23 ]  $5 [ 18 ]  $2 [ 11 ]  $1 [ 34 ]  $0.50 [ 6 ]
2.  La persona cuenta el cajón y teclea.
3.  HASTA ENTONCES aparece el esperado, y la diferencia.
4.  Segundo arqueo:    Saldo de recargas al cierre      [ $ ______ ]
```

**El desglose por denominación no es adorno.** En un negocio de 220 tickets diarios de $20 a $80,
el cajón es mayoritariamente monedas y billetes chicos, y contar $4,382.50 en monedas es lento y
propenso al error. Capturar por denominación hace que el sistema sume por ti, que el conteo sea
auditable, y —lo que más vale— que el sistema pueda decir mañana *"abres con $340 en monedas de
$10, ayer se te acabaron a las siete"*.

El esperado lo calcula **el servidor**, y es *fondo + entradas − salidas* tomando en cuenta los
once movimientos que no son venta. **Nunca** "ventas en efectivo": ése es precisamente el cálculo
que hace que el cajón de una tiendita nunca cuadre.

### 8.5 · La regla que salva el cierre

En `restaurante` la regla es "no se puede cerrar con mesas abiertas". Aquí no hay mesas, y las tres
reglas equivalentes son:

1. **No se puede cerrar con ventas en espera** (F-224). El cliente que dijo "ahorita vengo" y no
   volvió deja un ticket suspendido con producto apartado. O se cobra, o se cancela con motivo y el
   producto regresa al anaquel.
2. **No se puede cerrar con ventas sin sincronizar** (F-988), si se construye el modo sin conexión.
   Un ticket que existe sólo en el navegador no está en ningún corte.
3. **No se puede cerrar sin capturar el saldo de recargas**, si el módulo de comisiones está
   encendido. Es el segundo tipo de dinero y si no se arquea, se pierde sin que nadie lo note.

---

## 9 · EL CORTE Y SU PDF

### 9.1 · Qué contesta el corte de ESTE negocio

> **¿Cuadró la caja, y qué producto falta contra lo que debería haber?**

Esas dos preguntas, en ese orden. Es literalmente lo que dice `04-SISTEMA-DE-DISENO.md` §5 para
abarrotes. Todo lo que no ayude a contestarlas es relleno.

**La segunda pregunta es la que vende el sistema.** El arqueo lo hace cualquiera con una
calculadora. El faltante por producto es lo que ningún corte tradicional trae y es la razón número
uno por la que un tendero compra un punto de venta.

### 9.2 · Qué NO lleva el corte de abarrotes

- **Propinas. Ninguna sección, ni en cero.** Ver §4.
- **Meseros, mesas, tiempos de mesa.** No existen.
- **Insumos consumidos por receta.** Aquí no se transforma nada: el producto vendido **es** el
  producto que salió del anaquel. Esa sección, que en `restaurante` es la más importante del
  documento, aquí se sustituye por el **movimiento de existencia por producto**, que es más directo
  y más acusador.
- **Comisiones a empleados.** No existen.
- **Ocupación, rotación, ticket por atendedor.** No hay atendedor que evaluar: hay cajón que cuadrar.

### 9.3 · El PDF, sección por sección, en orden

Documento carta / A4 vertical. Se genera con el mismo camino que el de `restaurante`
(`heredado/lib/pdfDownload.js` → `generatePDFBlobFromNode`), sobre un nodo propio, y **se descarga
y se manda por WhatsApp al cerrar**. Perilla para apagarlo.

---

**1 · ENCABEZADO**
Logo, nombre de la tienda, dirección, teléfono. A la derecha, en negritas: **CORTE DE CAJA**, el
**folio**, la sucursal, la terminal, la fecha y el rango de horas.
*Por qué primero:* este PDF se lee en un teléfono, en la cama, a las 22:45. Tiene que identificarse
en la primera línea sin abrirlo entero.

**2 · DATOS DEL CORTE**
Apertura · Cierre · Quién abrió · Quién cerró · Turnos del día con su responsable y su hora · Tipo
(turno / cierre diario) · Notas.
*Por qué aquí:* es la cadena de responsabilidad, y en este giro hay **tres personas en un día sobre
una sola caja**. Cuando falta dinero, la primera pregunta es en qué turno faltó.

**3 · ARQUEO DE EFECTIVO** — con desglose por denominación
Fondo esperado · Fondo contado · **Diferencia de apertura** · Efectivo esperado al cierre ·
**Efectivo contado** · **Diferencia** (con semáforo) · Dinero dejado en caja (negritas) · Tabla de
denominaciones contadas.
*Por qué antes de las ventas:* la primera pregunta del documento es si cuadró. Todo lo demás
explica por qué. Y la diferencia de apertura separa el faltante que ya venía del faltante de hoy,
que es lo que evita acusar al turno equivocado.

**4 · DE DÓNDE SALIÓ EL EFECTIVO ESPERADO** — la sección que este giro necesita y ningún otro
Una cascada, no una tabla:

```
   Fondo de apertura                          +   800.00
   Ventas cobradas en efectivo                + 6,412.00
   Abonos de fiado cobrados            F-254  +   740.00
   Recargas y servicios recibidos      F-255  + 3,180.00
   Depósitos de casco cobrados         F-256  +   210.00
   Devoluciones de casco pagadas       F-256  −   140.00
   Devoluciones de venta en efectivo          −    38.00
   Compras pagadas de contado                 − 2,400.00
   Gastos en efectivo                         −   315.00
   Retiros                                    − 3,000.00
   Redondeos                           F-257  −     4.50
   ─────────────────────────────────────────────────────
   EFECTIVO ESPERADO EN CAJÓN                   5,444.50
```

*Por qué esta sección existe:* porque **la mitad de esos renglones no son ventas**, y sin verlos
el tendero cree que el sistema se equivocó. Es la sección que convierte "no cuadra" en "ya vi por
qué". Sin ella, el corte de una tiendita es incomprensible, y así es como se ven todos los cortes
de todos los sistemas del segmento.

**5 · RESUMEN DE VENTAS**
Total ventas (negritas) · Nº de tickets · Ticket promedio · Ventas por método (efectivo, tarjeta,
transferencia, **fiado**, vale) · Costo de lo vendido · **Utilidad bruta** · **Margen %** ·
Descuentos otorgados · Otros ingresos (comisiones) · Gastos · **Utilidad neta estimada** (negritas).
*Por qué el margen va en el corte y no sólo en el dashboard:* porque es el único momento en que
este dueño está leyendo. Un margen que baja tres puntos en una semana es una señal de robo, de
merma o de mezcla de producto corrida hacia el refresco, y tiene que verse aquí.

**6 · VENTA POR CATEGORÍA, CON MARGEN** — tabla
Categoría · Venta · Costo · **Margen %** · % de la venta del día.
*Por qué esta sección y no "más vendidos":* porque la decisión que dispara es de surtido. El
refresco deja 10%–15% y la botana 30%–45%. Si el refresco se comió el 45% de la venta del día, el
tendero vendió mucho y ganó poco, y **necesita verlo con esas palabras**. Ésta es la sección que
contesta la pregunta que hoy contesta con el estómago.

**7 · MOVIMIENTO DE EXISTENCIA Y FALTANTES** — la razón de ser del documento
Sólo los productos con movimiento o con diferencia:

| Producto | Inicial | Entradas | Vendido | Merma | Canje | **Esperado** | **Contado** | **Dif.** | **$ al costo** |
|---|---|---|---|---|---|---|---|---|---|

*Por qué es la sección más importante:* porque contesta la segunda mitad de la pregunta del corte.
La columna "Contado" sólo trae dato en los productos **contados hoy** por el conteo cíclico (F-149)
—una zona por día, veinte minutos en el valle de las once—, y ahí está la gracia: **no hace falta
contar la tienda entera para tener faltantes todos los días**. Al pie, el total de diferencia
valuado a costo, que es el número que se compara contra el 1.5%–2.5% de robo hormiga que reporta
ANTAD. Si la tienda está en 4%, hay un problema con nombre.

**8 · MERMA, CANJE Y CONSUMO DE LA CASA** — tabla, sólo si hubo
Producto · Cantidad · **Motivo** (caducado / dañado / roto / robo detectado / error de captura) ·
Canje al proveedor · Consumo de la casa · Costo.
*Por qué separadas y no en un solo renglón "merma":* porque cada motivo apunta a un responsable
distinto. Agrupar "caducado" con "robo detectado" hace inútil el indicador. Y el canje **no es
pérdida**: si se mezcla, el costo del pan sale mal todos los días.

**9 · FIADO DEL DÍA** — tabla, sólo si el módulo está encendido
Fiado otorgado hoy (monto y a quién) · Abonos cobrados hoy · **Saldo total de la cartera** ·
**Los cinco saldos más viejos** con sus días.
*Por qué en el corte y no sólo en su pantalla:* porque el fiado es producto que salió de la tienda
y todavía no es dinero. Un tendero que ve "fiado otorgado hoy: $890" tres días seguidos toma una
decisión esa misma noche. Si sólo lo ve cuando entra al módulo de clientes, no lo ve nunca.

**10 · COMISIONES Y DINERO EN TRÁNSITO** — tabla, sólo si el módulo está encendido
Recargas: nº de operaciones, monto, comisión · Servicios: nº, monto, comisión · Paquetería: nº,
comisión por cobrar · **Saldo de recargas: inicial, vendido, esperado, capturado, diferencia**.
*Por qué tiene su propio arqueo:* porque es un segundo tipo de dinero con su propio almacén. Si no
se arquea, se pierde sin que nadie lo note, y es dinero contado: $600 al mes de comisión con
$10,000 de recargas.

**11 · GASTOS Y COMPRAS DEL DÍA** — tabla, sólo si hubo
Categoría · Descripción · Proveedor · Forma de pago · Monto · Si fue a crédito, a cuántos días.
*Por qué juntas:* porque en una tiendita la compra **es** el gasto grande del día, y el crédito del
proveedor (8–15 días en marcas de ruta, 15–30 en mayoristas) es la otra mitad del flujo de efectivo.
El tendero necesita ver en un renglón cuánto le va a tocar pagar esta semana.

**12 · QUÉ PEDIR MAÑANA** — lista, sólo si hay alertas
Producto · Existencia · Mínimo · Venta de 14 días · **Sugerido** · **Proveedor** · **Día de visita**.
Ordenada por proveedor, con el de mañana arriba.
*Por qué el corte trae la compra:* misma razón que en `restaurante`, y aquí más fuerte. El corte se
lee a las 22:45 y el preventista de Coca llega a las 9:30. **Es el único hueco de atención que
existe en el día de este dueño.** Poner aquí lo que hay que pedir mañana, agrupado por quién viene
mañana, es lo que convierte un documento contable en una herramienta de gestión.

**13 · CANCELACIONES Y DESCUENTOS** — tabla, sólo si hubo
Folio · Hora · **Usuario** · Motivo · Monto. Y aparte: descuentos otorgados agrupados **por
usuario**.
*Por qué al final y siempre con usuario:* es la sección de control. Un patrón de cancelaciones del
mismo cajero a la misma hora, o descuentos concentrados en una persona, es la señal más clara de
robo en caja que existe — y es invisible al arqueo, porque **el cajón cuadra**.

**14 · FIRMAS**
*Responsable de caja* con nombre impreso · *Administrador*.

**15 · PIE**
Texto configurable + *Documento interno · MorphiqPOS · Generado [fecha y hora]*.

### 9.4 · Reglas del corte que no se negocian

1. El arqueo va a ciegas. Siempre.
2. El esperado lo calcula el servidor, y aquí incluye los once movimientos que no son venta.
3. El PDF lleva folio, sucursal, terminal, quién cerró y a qué hora.
4. Lo que no aplica al giro no aparece, **ni siquiera en cero**. Sin propinas, sin meseros, sin
   recetas. Si el módulo de fiado o el de comisiones está apagado, sus secciones no existen.

### 9.5 · El otro documento · la factura global mensual

No es parte del corte, pero nace de él. RESICO obliga a factura global **mensual** de las ventas al
público en general, con desglose por tasa (0%, 16%) y plazo de emisión de **24 horas** desde 2026.
Se arma sumando los cortes del mes menos las ventas ya facturadas individualmente. **Si el corte no
separa bien las tasas y el dinero en tránsito, la global sale mal**, y ése es el costo real de
haberlo modelado flojo.

---

## 10 · LOS CINCO DESCUADRES TÍPICOS

### Descuadre 1 · El dinero de las recargas y los servicios

**Cómo nace.** A las siete de la noche el cajón tiene $3,180 que no son de la tienda: $1,240 del
recibo de luz de doña Meche, $200 de una recarga, $1,740 de otros servicios. El sistema los
registró como venta o no los registró. En el primer caso la venta del día sale inflada y el margen
destruido; en el segundo el cajón "sobra" $3,180 y nadie sabe por qué.

**Por qué es el número uno.** Porque pasa **todos los días** y por montos grandes en relación con
la venta. Un cajón que sobra tres mil pesos cada noche destruye la credibilidad del arqueo por
completo, y a partir de ahí nadie vuelve a mirar la diferencia.

**Cómo lo previene el sistema.** **F-255**: el dinero recibido entra a caja en su propia categoría
y **no toca ventas**; sólo la comisión se reconoce como ingreso. La sección 4 del corte lo muestra
en su renglón de la cascada, y la sección 10 lo arquea contra el saldo del comisionista.

### Descuadre 2 · El abono de fiado que se contó como venta

**Cómo nace.** Doña Meche abona $200 de lo que debía. El cajero, sin categoría donde ponerlo, lo
cobra como una venta genérica de $200. Resultado: la venta del día sube $200 sin costo asociado
—el margen de ese ticket es 100%—, el saldo de doña Meche no baja, y la semana que viene se le
vuelve a cobrar.

**Cómo lo previene el sistema.** **F-254**, una tecla propia en la pantalla de cobro (**F7**), que
escribe el movimiento de caja **y** el abono al saldo **en la misma transacción**. Uno no existe sin
el otro. En el corte aparece en la cascada de la sección 4 y en la sección 9, nunca en ventas.

### Descuadre 3 · El faltante de producto que el arqueo no ve

**Cómo nace.** Durante la semana desaparecen once bolsas de botana y catorce refrescos. El robo
puede ser del cliente que se lo echa en la mochila, del empleado que cobra y no registra, o del
empleado que registra de menos. **El cajón cuadra perfecto en los tres casos**: el dinero que no
entró tampoco se esperaba. Sobre $40,000 de venta mensual, un robo hormiga del 2% son $800 al mes,
más que la renta del sistema.

**Cómo lo detecta el sistema.** No por conteo de dinero, sino por comparación de existencia. La
sección 7 del corte trae esperado contra contado por producto, alimentada por el **conteo cíclico
(F-149)**: una zona de anaquel al día, veinte minutos. El total de diferencia valuado a costo se
compara contra el 1.5%–2.5% que ANTAD reporta como normal. Si la tienda está en 4%, hay algo.

**Lo que falta, y hay que decirlo.** Sin F-106 y F-149, el sistema da el esperado y nunca el real:
enseña el síntoma y no el diagnóstico. **Es exactamente el mismo hueco que hoy tiene `restaurante`
y aquí es el argumento de venta entero.** Mientras esas dos no existan, el dolor 1 no está resuelto
y no se debe decir que lo está.

### Descuadre 4 · El casco que se paga dos veces

**Cómo nace.** Llega alguien con seis botellas vacías y pide sus $60. El cajero se los da del
cajón. No hay registro de si esas seis botellas salieron alguna vez de esta tienda con depósito
cobrado. A fin de mes, el cajón ha pagado más depósitos de los que cobró, y el tendero cree que
alguien le está robando. El valor del casco va de $7 a $25 por envase y lo fija el propio tendero,
así que el error se acumula rápido.

**Cómo lo previene el sistema.** **F-256** lleva el depósito como **saldo de una cuenta de
pasivo**, no como venta: cobrado hoy, devuelto hoy, y saldo acumulado vivo. El corte muestra los
tres números. Cuando las devoluciones acumuladas superan de forma sostenida a los depósitos
cobrados, el sistema lo señala. **Lo que el sistema NO debe hacer es negarse a pagar el casco**: el
art. 11 de la LFPC obliga a devolver el depósito íntegro, y negarlo es denunciable ante Profeco.

### Descuadre 5 · Los pesos sueltos del cambio

**Cómo nace.** "No tengo cambio, ¿le doy un chicle?". "Déjelo así, son dos pesos". "Ahorita le doy
el peso que falta". Cada operación descuadra entre $0.50 y $3, ninguna llama la atención, y son
decenas al día. A fin de mes son entre $300 y $900 que el arqueo reporta como faltante sin causa —y
un faltante crónico sin causa es peor que uno grande con explicación, porque **enseña a la gente a
ignorar la diferencia**.

**Cómo lo previene el sistema.** **F-257**: el redondeo se registra con un toque en la pantalla de
cobro. Tres casos: redondeo a favor de la tienda, redondeo a favor del cliente, y salida en especie
(el chicle sale de stock como "cambio en especie", no como merma). En el corte va en su renglón de
la cascada. No es para controlar al cajero: **es para que la diferencia del arqueo signifique algo
otra vez**.

**Y el caso que no es descuadre pero se le parece:** el comprobante de transferencia falso. No se
puede prevenir desde el sistema. Lo que sí se puede es marcar la venta como *transferencia
pendiente de confirmar*, excluirla del efectivo esperado, y listarla en el corte para que el dueño
la verifique contra su banco. Fingir que el sistema lo resuelve sería mentir.
