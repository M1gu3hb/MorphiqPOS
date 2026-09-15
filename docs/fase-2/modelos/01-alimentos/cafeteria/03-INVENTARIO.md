# 03 · INVENTARIO · Cafetería de mostrador

**Variante F-115 · V6 — Peso, volumen y receta**, la misma variante de catálogo que `restaurante`,
con tres deltas que no son cosméticos: **receta por modificador**, **empaque por canal** y **merma
de barra**.

---

## 1 · POR QUÉ V6 Y POR QUÉ NO OTRA

Una cafetería **mezcla producto ya terminado**. Compra café tostado y lo muele; compra leche y la
vaporiza; compra jarabe y lo dosifica. No transforma materia prima cruda como un restaurante —
nada se limpia, nada se deshuesa, nada se porciona a partir de una pieza grande— pero tampoco
revende como una tienda: entre la bolsa de un kilo y la taza hay una receta, y en esa receta está
el negocio.

V6 es la variante correcta y las otras nueve se descartan una por una:

| Variante | Por qué no |
|---|---|
| **V1 sin inventario** | El insumo es el 32% de la venta. Apagarlo sería apagar el negocio. |
| **V2 stock simple (pieza)** | Serviría para el pan y para el grano en bolsa, y no sirve para nada más. El café se mide en gramos y la leche en mililitros: contar "latte" en piezas no dice cuánta leche queda. |
| **V3 presentaciones (caja ↔ pieza)** | El factor de conversión sirve para revender empaquetado. Aquí el kilo de café no se abre en piezas: se muele en dosis de 18 a 20 gramos. |
| **V4 lote y caducidad** | Con un matiz que hay que decir con cuidado, porque es la variante que más tienta. La leche **sí** caduca, en cinco a siete días. Pero el volumen es tan chico —dos o tres cartones abiertos a la vez— que la rotación física resuelve el 100% de los casos, y capturar lote por cartón de leche es trabajo diario sin beneficio. Y el **café no caduca: pierde**. Eso no es V4, es F-157. Ver §7.3. |
| **V5 número de serie** | Ningún insumo es único ni rastreable individualmente. |
| **V7 producción por lote** | Es de la panadería. Aquí no se produce contra inventario: se produce contra un pedido que **ya se cobró**. Nunca hay producto terminado guardado, salvo el pan — que se compra, no se produce. Si Café Jacaranda empezara a hornear su propio pan, ese módulo entra por `panaderia-pasteleria`, no por aquí. |
| **V8 por proyecto** | No hay obra. |
| **V9 consignación** | La mercancía es propia. El único caso cercano es el grano de un tostador amigo a comisión, y eso hoy no ocurre. |
| **V10 activos que vuelven** | Con una excepción que vale la pena nombrar y descartar: **la taza de la casa**. Sale y vuelve, y a veces no vuelve. No es inventario: es mobiliario que se rompe, y se resuelve con un ajuste al mes, no con un módulo. |

**Lo que V6 aporta aquí y no aportaría ninguna otra:** que la misma bebida tenga costos distintos
según cómo se pidió, y que la diferencia se calcule sola.

---

## 2 · UNIDADES

**Las mismas tres unidades base que `restaurante`, y por la misma razón.** La regla la impone la
base de datos, no la pantalla.

```
g       gramos          café, chocolate, matcha, hielo, azúcar, pan por peso
ml      mililitros      leche de todos los tipos, jarabes, agua, jugo, extractos
pieza   piezas          vaso, tapa, manga, servilleta, pan, botella, bolsa de grano
```

**Un hallazgo del código que hay que corregir y que nadie ha visto.** El trigger
`insumo_unidad_base_valida()` de la migración `054_separar_giro_paquete.sql` obliga a que un insumo
sólo se mida en g, ml o pieza **cuando `giro = 'restaurante'`**. Para `giro = 'cafeteria'` no valida
nada: hoy alguien puede dar de alta la leche en "litros" y el consumo se dividiría entre mil sin que
nada falle. Es el error de 1000× con la puerta abierta. **Se corrige en la migración 070.**

**Unidades de captura** (lo que el usuario teclea) y su conversión:

| Se teclea | Se guarda | Factor |
|---|---|---|
| kg | g | × 1000 |
| g | g | × 1 |
| litro | ml | × 1000 |
| ml | ml | × 1 |
| onza fluida (oz) | ml | × 29.5735 |
| pieza, bolsa, caja, millar | pieza | × 1 |

**La onza es propia de este giro y no la tiene `restaurante`.** El menú se escribe en onzas —12 oz,
16 oz— porque así viene el vaso y así lo pide el cliente. Obligar a la dueña a convertir 16 oz a
473 ml para capturar una receta garantiza que la capture mal. Se teclea en onzas, se guarda en
mililitros, y la receta conserva las dos cosas: `cantidad_capturada` + `unidad_capturada` para
poder reeditarla tal cual, y `cantidad` + `unidad` convertidas, que es lo que consume el inventario.

### Ejemplos reales de este giro

| Insumo | Unidad base | Se compra en | Ejemplo de receta |
|---|---|---|---|
| Café de especialidad, grano | g | kg (mínimo 6 kg al tostador) | 18 g por shot doble · 36 g en el doble shot del 16 oz |
| Leche entera | ml | litro (cartón de 1 L) | 180 ml en latte 12 oz · 260 ml en 16 oz |
| Leche deslactosada | ml | litro | mismas cantidades, **otro insumo, otro costo** |
| Leche de avena | ml | litro (≈ 2.5× el precio de la entera) | mismas cantidades, **otro insumo, otro costo** |
| Jarabe de vainilla | ml | botella de 750 ml | 15 ml por bomba, 1 a 3 bombas |
| Chocolate en polvo | g | bolsa de 1 kg | 25 g por mocha |
| Matcha ceremonial | g | lata de 100 g | 3 g por matcha latte |
| Hielo | g | producción propia (máquina) | 140 g en bebida fría 16 oz |
| Vaso caliente 12 oz | pieza | millar (≈ $1.53/pieza) | **1 pieza, sólo si el canal es "para llevar"** |
| Tapa 12 oz | pieza | millar | **1 pieza, sólo si el canal es "para llevar"** |
| Manga de cartón | pieza | millar | **1 pieza, sólo bebida caliente para llevar** |
| Vaso frío 16 oz + popote | pieza | millar | 1 + 1, sólo frío para llevar |
| Croissant | pieza | pieza, al proveedor | **insumo base**: el producto ES el insumo |
| Bolsa de grano 250 g | pieza | se arma de la misma bolsa de kilo | 250 g de café + 1 bolsa con válvula |

**Dos casos que definen este inventario y que `restaurante` no tiene:**

**El insumo base es todavía más frecuente aquí.** El croissant, la botella de agua, el jugo
embotellado, el snack: el producto de venta *es* el insumo de almacén. Se declara con
`insumo_base_id` y se descuenta una pieza. En una carta de 50 productos, unos 20 son insumo base.
Eso elimina de un golpe veinte recetas que nadie iba a capturar.

**El mismo producto con tres insumos distintos.** "Latte" no tiene una receta: tiene una receta con
una línea condicionada al modificador de leche. Entera, deslactosada y avena son tres insumos
distintos con tres costos distintos —la avena cuesta cerca de dos veces y media— y el cliente elige
en el mostrador. Si el sistema no lo modela, el inventario de leche de avena nunca baja, el de
entera baja de más, y el margen del 30% de las bebidas del pico está mal. **Es la razón por la que
F-027 está en la tanda 2 del orden de construcción y no en la cuatro.**

---

## 3 · QUÉ SE DESCUENTA, CUÁNDO Y CON QUÉ DISPARADOR

**El disparador es el COBRO**, igual que en `restaurante`. Pero aquí el cobro ocurre **antes** de
que exista el producto, y eso cambia el significado de la decisión.

```
  Cliente pide      Caja cobra          Barra prepara       Barra entrega
  ────────────      ──────────          ─────────────       ─────────────
  Se arma el        ◄── AQUÍ SE         El insumo sale      El cliente se
  carrito con           DESCUENTA       físicamente         lleva el vaso
  nombre y canal    Stock: −            Stock: sin cambio   Stock: sin cambio
  Stock: sin cambio
```

**El mismo disparador, el riesgo invertido, y para bien.**

En `restaurante`, entre la comanda y el cobro pasan noventa minutos y el inventario está
**sobrevaluado** todo ese rato: si quedan 2 kg de arrachera en pantalla y hay tres mesas con
arrachera sin cobrar, la arrachera ya se acabó.

Aquí es al revés y dura tres minutos: el inventario está **infravalorado** entre el cobro y la
preparación. El sistema dice que ya se fueron 180 ml de leche que todavía están en el cartón. Eso
no causa ningún problema operativo —nadie decide nada con una diferencia de tres minutos— y en
cambio regala la propiedad que el restaurante no puede tener: **el stock en pantalla nunca
promete algo que ya está comprometido.** Si el sistema dice que quedan seis litros de avena, quedan
seis litros de avena, porque todo lo vendido ya se descontó.

**La consecuencia que sí hay que resolver, y es la única.** Cobrar antes significa que **no hay
"deshacer" barato**. En restaurante, una comanda equivocada se cancela y no pasó nada porque el
stock no se había movido. Aquí, si la bebida se pidió mal, el stock ya bajó y el dinero ya entró:
corregir es una devolución más un consumo extra. Por eso **F-156 (merma de barra) no es un lujo, es
el complemento obligatorio de haber descontado al cobrar**. Sin ella, cada bebida rehecha deja el
ledger un poco más torcido, todos los días.

**Cómo se descuenta, técnicamente:**

1. El cobro abre una transacción. En esa misma transacción se encola el pedido en la fila de barra.
   **O las dos cosas ocurren, o ninguna:** un cobro sin pedido encolado es un cliente que pagó y no
   existe; un pedido encolado sin cobro es una bebida regalada.
2. Por cada línea, se explota la receta del producto (F-129) **resolviendo primero sus
   modificadores**: el tipo de leche y el tamaño sustituyen o escalan líneas de receta antes de
   descontar.
3. Se filtran las líneas de receta por **canal** (F-331): las de empaque sólo se consumen si el
   pedido es *para llevar* o *plataforma*.
4. Si el producto tiene `insumo_base_id` y no tiene receta, se descuenta directo del insumo base.
5. Si es de peso variable —el grano molido a granel— se usa `cantidad_base_consumo`, que no
   coincide con la cantidad vendida.
6. Cada consumo escribe una fila en el ledger `movimientos_stock`, con signo negativo impuesto por
   la base, referencia `orden` y el id de la venta.
7. El decremento es **atómico**: falla en vez de silenciar.

---

## 4 · ENTRADAS

| Entrada | Cuándo pasa | Qué escribe |
|---|---|---|
| **Compra de leche y pan** | Martes y viernes la leche, diario el pan, entre 06:45 y 07:00 | Compra en una transacción, movimientos de entrada, recálculo del costo promedio ponderado. Se captura **de pie, con la puerta abierta y el repartidor esperando**: por eso la plantilla de compra recurrente es obligatoria aquí, no opcional. El pedido de leche es literalmente el mismo todas las semanas. |
| **Compra de café al tostador** | Cada 10 a 15 días, 6 a 12 kg, mínimo de pedido | Igual, **más la captura de la fecha de tueste** (F-157). Es el único campo extra de esta plantilla en la recepción de compra, y es el que permite saber si el grano de la tolva sigue sirviendo. |
| **Compra de empaque** | Cada 3 a 6 semanas, por millar | Igual. Es la compra que siempre se hace tarde porque nadie sabe cuántos vasos quedan — y es exactamente lo que resuelve la sección de canal del corte. |
| **Producción de hielo** | Continua, la máquina trabaja sola | **Hueco real y se declara.** El hielo se consume por receta y no tiene entrada: la máquina produce de agua y electricidad. Hoy se resuelve declarándolo insumo con costo cero y ajustando el gasto de agua y luz por aparte, que es tosco y honesto. La forma correcta sería una receta de producción (F-134 de V7), y no vale la pena construir V7 entero por el hielo. Queda anotado. |
| **Armado de bolsa de grano 250 g** | Cuando bajan las bolsas del anaquel | **Segundo hueco.** Se toma café del almacén, se envasa, y nace un producto vendible. Es producción por lote en miniatura. Hoy se resuelve con un ajuste doble —salida de 250 g de café, entrada de 1 bolsa— capturado a mano. También es V7 en chiquito y también se difiere, **pero se difiere sabiendo que el día que el grano en bolsa pase del 10% de la venta, hay que construirlo.** |
| **Inventario inicial** | Una vez | Movimiento de entrada con referencia propia. Marca el punto cero. |
| **Ajuste positivo** | Apareció algo que no estaba contado | Motivo obligatorio. |
| **Devolución a proveedor** | Leche que llegó cortada | Movimiento negativo con referencia a la compra. **Pendiente**: hoy se resuelve con ajuste, lo que lo mezcla con las diferencias de conteo. |

---

## 5 · SALIDAS

| Salida | Disparador | Motivo obligatorio |
|---|---|---|
| **Venta** | Cobro, vía explosión de receta con modificadores y canal | No (lo da la referencia) |
| **Calibración del molino** | Apertura, todos los días | **Sí** — `calibracion`. F-156 |
| **Vaporizado sobrante** | Al terminar una tanda de bebidas | **Sí** — `vaporizado`. F-156 |
| **Bebida rehecha** | El cliente reclama o el barista no queda conforme | **Sí** — `bebida_rehecha`. F-156. **El insumo se consume por segunda vez después de cobrado** |
| **Caducidad de leche** | Cartón que se pasó | **Sí** — `caducidad_leche`. F-156 |
| **Derrame / vaso tirado** | Se cayó | **Sí** — merma general, F-109 |
| **Consumo del personal** | Tres personas, tres o cuatro bebidas de turno | **Sí** — F-261, `tipo: 'personal'`. NO es merma |
| **Cortesía al cliente** | "Se te cayó, te hago otro" | **Sí** — F-261, `tipo: 'cortesia'` |
| **Canje de sello** | El sexto café | No: lo da la referencia `canje_lealtad`. Sale del stock, **no entra a ventas** |
| **Pedido no recogido** | Se llamó tres veces y nadie vino | La bebida se hizo: el insumo ya salió por la venta. Lo que se registra es el **estado del pedido**, no un movimiento nuevo |
| **Ajuste negativo** | Diferencia de conteo | **Sí** |

**Por qué los motivos están tipados y no son texto libre.** Porque el motivo es el nombre del
responsable y del arreglo. `calibracion` apunta al molino y se arregla con mantenimiento;
`vaporizado` apunta a la técnica y se arregla con capacitación; `bebida_rehecha` apunta casi
siempre a la **captura del modificador** y se arregla con la pantalla; `caducidad_leche` apunta a
la compra y se arregla pidiendo menos. Un campo de texto donde alguien escribe "se tiró" no apunta
a nada y no arregla nada.

**El ledger es inmutable**, idéntico a `restaurante`: una fila escrita no se toca, el signo lo
impone un `check` atado al tipo, y el stock actual **no es una columna, es la proyección del
ledger**. Se cita y no se repite.

---

## 6 · CÓMO SE TOMA EL INVENTARIO FÍSICO

**Tres cadencias distintas, y es lo más diferente de este archivo respecto a `restaurante`.** Allá
se cuenta los lunes por la mañana, todo junto. Aquí cada familia de insumo tiene su propio ritmo,
y el ritmo lo decide cuánto se fuga y cuánto tarda en contarse.

```
DIARIO · al cierre del turno vespertino, 20:30
  LA LECHE. Cartones cerrados + el abierto medido a ojo en cuartos.
  Noventa segundos. Se cuenta TODOS los días sin excepción porque es
  el insumo que más se fuga, el que caduca, el segundo por costo, y
  el único que se puede contar de verdad rápido.

DOS VECES POR SEMANA · lunes y viernes, antes de abrir
  EL CAFÉ. Se pesa lo que hay: bolsas cerradas + el bote de la tolva.
  Diez minutos con una báscula. Lunes porque el fin de semana es
  cuando más se descuadra; viernes porque es cuando se pide al
  tostador, que entrega en 48 horas.

SEMANAL · lunes
  JARABES, CHOCOLATE, MATCHA. Se cuentan botellas y se miden a ojo
  las abiertas. Quince minutos.

QUINCENAL · con la compra de empaque
  VASOS, TAPAS, MANGAS. Se cuentan paquetes cerrados, no piezas.
  Un vaso suelto no vale la pena; un paquete de 50, sí.

MENSUAL · primer lunes
  TODO, incluido el pan, el azúcar, las servilletas y el desechable
  suelto. Una hora.
```

**Lo que el sistema tiene que hacer y hoy no hace (F-106), con dos deltas propios de este giro:**

1. **Hoja de conteo por familia y por ubicación**, no una sola lista. Contar leche es abrir un
   refrigerador; contar café es ir al anaquel con una báscula; contar vasos es mirar debajo de la
   barra. Una hoja única obliga a caminar tres veces.
2. **Captura a ciegas.** Misma regla del arqueo de caja. Si la hoja trae el teórico impreso, se
   escribe el teórico.
3. **La diferencia se enseña después, en unidad, en dinero y en días de consumo.** Ese tercer
   número es propio de aquí: "faltan 4.2 litros de leche entera" dice poco; "faltan 4.2 litros, que
   son 23 lattes, que son $1,334" se entiende de inmediato.
4. **El conteo de leche tiene su propia pantalla de noventa segundos**, separada del conteo
   general, porque es diario y porque es la única forma de que llegue a hacerse. Si el conteo de
   leche vive dentro del módulo de inventario físico completo, se hace dos veces y se abandona.
5. Cerrar el conteo con **un solo ajuste por insumo**, con motivo, que deje el ledger cuadrado.

---

## 7 · LAS MERMAS PROPIAS DEL GIRO

Cinco tipos, y son distintos porque apuntan a cinco arreglos distintos.

| Tipo | Qué es | Dónde se registra | Cuánto es normal |
|---|---|---|---|
| **Calibración (dial-in)** | Los 3 a 5 shots que se tiran cada mañana hasta que el tiempo de extracción cuadra, más las purgas de 2–3 g al cambiar molienda | F-156, motivo `calibracion`, **un toque en la apertura** | 54 a 90 g de café al día. **$22 a $36 diarios, ~$700 al mes** |
| **Vaporizado sobrante** | El fondo de la jarra que se tira porque quedó "húmeda" o porque se calentó de más | F-156, motivo `vaporizado` | Parte del 5–15% de merma de leche. Objetivo: por debajo del 10% total |
| **Bebida rehecha** | Salió con la leche equivocada, salió fría, el cliente cambió de opinión | F-156, motivo `bebida_rehecha` | 1–2% de las bebidas. Arriba de 3% es problema de captura, no de barra |
| **Caducidad de leche** | El cartón que se pasó | F-156, motivo `caducidad_leche` | Debería ser cero con rotación. Arriba de dos cartones al mes es sobrecompra |
| **Derrame y rotura** | Se cayó el vaso, se rompió la taza | F-109, merma general | 0.5–1% |

**La merma que define a este giro es la de leche, y el dato de la industria es que va del 5% al
15%.** Una cafetería de especialidad bien llevada debería estar por debajo del 10%; los sistemas
automáticos de espumado de alta gama desperdician menos del 1%, lo que marca el techo de lo que se
puede mejorar con técnica. Entre el 1% y el 15% hay un rango enorme de dinero que hoy nadie mide,
y medirlo es todo lo que hace falta para empezar a bajarlo.

**Y la merma que nadie registra en ningún sistema del mercado es la de calibración.** No es un
descuido: es que ningún punto de venta tiene el concepto de "tirar producto a propósito para poder
empezar a trabajar". Se puede consultar cualquier POS mexicano y no existe. Por eso el inventario
de café de todas las cafeterías de México tiene una diferencia sistemática de entre 1.5 y 2.7 kg
al mes, y por eso todo el mundo concluye que "las recetas no sirven".

**Lo que `restaurante` tiene y aquí no existe: la merma de limpieza.** Allá la pieza de res rinde
72% y ese 28% vive dentro de la receta como `merma_bp`. Aquí nada se limpia: el campo existe en la
tabla, vale cero en el 95% de las líneas, y **en esta plantilla está oculto en la pantalla de
recetas**. Enseñar un campo que siempre vale cero enseña a ignorar los campos.

### 7.3 · La frescura del grano, que no es merma ni caducidad

**F-157.** El café no se echa a perder: se vuelve plano. Se bebe bien entre los **3 y los 30 días
después del tueste** — antes de tres días desgasifica y la extracción es inestable; después de
treinta pierde aromáticos y el espresso pierde crema. Un cliente de especialidad lo nota antes que
la dueña.

Eso **no es caducidad** y por eso no es V4. La decisión que dispara no es "tirar", es **cambiar de
uso**: el lote de cinco semanas deja de usarse para espresso y pasa a filtrado o a la promoción de
grano en bolsa con descuento. Es una decisión de venta, no de merma.

**Lo mínimo que hay que construir para que exista:** `fecha_tueste` en la recepción de compra y en
el insumo, la fecha del lote que está abierto ahora, y un comando de un toque —`abrirLoteGrano`—
que se ejecuta cuando se abre una bolsa nueva. **Sin trazabilidad de lote completa**, y eso se dice
sin adornos: el sistema sabe la frescura de lo que está en la tolva hoy, no la de lo que se sirvió
el martes pasado. Es el 90% del beneficio por el 10% del trabajo, y para trazar un lote de café
nadie lo pediría nunca.

---

## 8 · ALERTAS QUE IMPORTAN Y ALERTAS QUE SON RUIDO

**Cinco niveles de existencia**, idénticos a `restaurante` (suficiente, medio, bajo, crítico,
agotado), con una diferencia de fondo en **cómo se calcula el umbral**.

> En `restaurante` el umbral es una **cantidad**: `stock_minimo` y `stock_critico` en unidad base.
> Aquí el umbral es **tiempo**: días que alcanza, contra la próxima entrega del proveedor.

La razón es que una cafetería compra en ventanas fijas y estrechas. La leche llega martes y
viernes. "Quedan 12 litros" no dispara nada; "quedan 12 litros, alcanzan hasta mañana y el
proveedor viene el viernes" manda a alguien al súper. El cálculo usa el consumo teórico promedio
del **mismo día de la semana** en las últimas cuatro semanas, porque un martes no consume como un
sábado y promediar los siete días miente en los dos extremos.

### Alertas que sí importan aquí

| Alerta | Cuándo | A quién |
|---|---|---|
| **Leche que no llega a la próxima entrega** | Al cierre y al abrir | A la dueña, en el dashboard y en el corte. Es la alerta más valiosa del módulo: evita cerrar la barra a las 11 de la mañana |
| **Un tipo de leche agotado con bebidas activas** | En cuanto llega a cero | **Al barista, en la pantalla de cobro, antes de venderla.** El modificador "leche de avena" se apaga solo. Es el equivalente exacto del producto agotado del mesero en `restaurante` |
| **Vasos o tapas de una medida por debajo de 200 piezas** | Al cruzar el umbral | A la dueña. Doscientas piezas es un día y medio y el proveedor de empaque tarda tres |
| **Café por debajo de 3 días** | Al cruzar | A la dueña. Tres días porque el tostador entrega en 48 horas **y el grano necesita reposar** |
| **Grano abierto con más de 30 días de tueste** | Diario, a la apertura | Al barista y a la dueña. F-157 |
| **Cambio bajo en el cajón** | Durante el turno | Al barista. No es inventario de insumo, pero es el mismo mecanismo y el mismo tipo de urgencia. Ver `02-DINERO-Y-CAJA.md` §8.2 |
| **Merma de leche del turno por encima del 12%** | Al corte | A la dueña. Es la señal temprana de fuga |

### Alertas que serían ruido y no van

- **Notificación por cada insumo bajo mínimo.** Una cafetería tiene 40 a 60 insumos y siempre hay
  seis bajos. Seis notificaciones diarias son cero notificaciones.
- **Alerta de mínimo de servilletas, azúcar, agitadores y popotes.** Cuestan centavos, se compran en
  cualquier lado y nunca detienen una venta. Van a la lista de compras y a ningún otro sitio.
- **Alerta de caducidad genérica.** Salvo la leche, nada aquí caduca en una ventana que importe.
  Encenderla llenaría la pantalla de avisos que nadie atiende y entrenaría al personal a ignorar los
  que sí importan.
- **Alerta de sobrestock.** Una cafetería no tiene sobrestock: tiene un anaquel y un refrigerador.
- **Alerta de "el tostador subió el precio".** El precio del grano de especialidad se mueve por
  cosecha, una o dos veces al año. Lo que sirve es el comparativo semestral (F-636), no un aviso.

---

## 9 · LOS TRES ERRORES DE INVENTARIO QUE MÁS COMETE ESTE NEGOCIO

### Error 1 · Capturar una sola receta por bebida, sin variantes

**Qué pasa.** Se captura "Latte: 18 g de café + 180 ml de leche entera" y se da por hecho. Pero el
40% de los lattes del día son de 16 oz y el 30% llevan avena o deslactosada. El consumo teórico de
leche entera sale un 35% por encima del real, el de avena sale en cero, y la diferencia contra el
conteo es enorme en las dos direcciones a la vez.

**Por qué pasa.** Porque capturar la receta por variante parece el triple de trabajo, y porque
ningún sistema del mercado deja hacerlo de otra forma que duplicando el producto — "Latte", "Latte
grande", "Latte avena", "Latte grande avena" — que es cuatro productos en la pantalla de cobro y
un menú imposible en la ráfaga.

**Qué hace el sistema.** El modificador **altera la línea de receta**, no crea un producto: la
receta base declara `leche` como línea sustituible, y el grupo de modificadores "tipo de leche"
declara con qué insumo se sustituye y qué diferencia de precio implica. El tamaño escala las
cantidades por un factor declarado en el propio modificador. Se capturan **una receta y dos grupos
de modificadores**, y cubren doce combinaciones.

**Lo que falta.** Un indicador de **cobertura de recetas con variantes**: *"tienes receta para 34
de 51 productos, y de los 34, 12 declaran variantes. Tu consumo teórico cubre el 71% de tus
ventas."* Sin ese número la dueña no sabe cuánto puede confiar en la sección de insumos del corte.
Hoy no existe y debería — y es el mismo hueco que `restaurante` señaló, agravado por las variantes.

### Error 2 · No registrar la calibración y culpar a las recetas

**Qué pasa.** Se captura todo bien, se cuenta el café el lunes, y faltan 1.8 kg contra lo teórico.
Nadie encuentra la explicación, así que se ajusta. Al siguiente mes vuelve a faltar 1.9 kg. A los
tres meses la dueña concluye que el módulo de recetas no sirve y deja de usarlo — y con él pierde
también el costeo, el margen por producto y toda la sección de insumos del corte.

**Por qué pasa.** Porque los 54 a 90 gramos diarios de calibración son invisibles: se tiran a
primera hora, antes de abrir la caja, y no hay ningún sistema en el mercado donde se puedan
registrar. Son 1.6 a 2.7 kg al mes, que es **exactamente** la diferencia que aparece.

**Qué hace el sistema.** **F-156** con motivo `calibracion`, capturable en un toque desde la
apertura: un botón que dice *"Calibración: 3 shots"* con `+` y `−`, que multiplica por el gramaje
declarado del shot y escribe el movimiento. Cuatro segundos al día. Y aparece en su propia sección
del corte, todos los días, para que se vea.

**Por qué el diseño de esa pantalla decide si la función existe.** Si registrar la calibración
costara abrir Inventario, buscar el insumo, elegir "ajuste", escribir el motivo y teclear los
gramos, nadie lo haría ni una vez. La función no es el registro: es que el registro quepa en el
gesto de encender la máquina.

### Error 3 · Contar la leche "a ojo" y no compararla con nada

**Qué pasa.** Se cuenta la leche todas las noches —eso sí se hace, todo el mundo lo hace— y el
número se apunta en una libreta o en las notas del teléfono. Nunca se compara con el consumo
teórico, porque el consumo teórico no existe en la libreta. La merma de leche puede estar en 6% o
en 18% y nadie lo sabría.

**Por qué pasa.** Porque el conteo y el teórico viven en dos mundos distintos, y unirlos a mano
cada noche es trabajo que nadie va a hacer a las nueve de la noche.

**Qué hace el sistema.** La pantalla de conteo de leche de noventa segundos (§6), que al terminar
enseña **las tres cosas juntas**: lo contado, lo teórico, y el porcentaje de merma con semáforo
—verde bajo 8%, ámbar de 8 a 12%, rojo arriba de 12%—. No hay que ir a ningún lado ni cruzar nada:
el número aparece en la misma pantalla donde se acaba de teclear el conteo.

**Lo que falta, y es mucho.** **F-106** para que el conteo sea un objeto del sistema y no un campo
suelto, **F-133** para tener la serie histórica —"tu merma de leche fue 14%, 11%, 9%, 12% las
últimas cuatro semanas"— y **F-261** para sacar de la ecuación el café del personal, que sí tiene
explicación. Con esas tres, la pregunta "¿a dónde se me va la leche?" pasa de ser una sospecha a
ser un renglón con nombre. Sin ellas, el sistema enseña el síntoma y no el diagnóstico — que es
exactamente lo mismo que le pasa hoy a `restaurante`, y por la misma razón: **las tres funciones
son del tronco común y sirven a los dos modelos**, así que construirlas una vez las cierra en los
dos giros el mismo día.
