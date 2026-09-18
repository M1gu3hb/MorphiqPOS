# 03 · INVENTARIO · Ferretería y tlapalería

**Aquí está el capital entero del negocio.** Una tiendita tiene $40,000 de venta al mes y poco
inventario; una ferretería como La Broca tiene **entre tres y ocho mil claves** y una rotación de
**tres a cinco vueltas al año**, lo que significa que **su inventario a costo vale más que dos meses
de venta**. Cada decisión de este archivo mueve cientos de miles de pesos de capital de trabajo.

Todo el tronco viene de `abarrotes` y **no se vuelve a describir**: el ledger inmutable en unidad base
(F-101), el decremento atómico (F-102), el ajuste con motivo (F-104), el costo promedio ponderado
(F-108), las presentaciones con factor (F-112, F-120) y el motor de conteo con esperado sellado
(F-106, F-149). Lo que sigue es **sólo lo que una ferretería hace distinto**, y son cuatro cosas
grandes: **se corta**, **se vende en dos unidades con factor aproximado**, **hay que encontrarlo**, y
**la mitad no se mueve**.

---

## 1 · QUÉ VARIANTE, Y POR QUÉ ÉSA

**Variante V3 · Presentaciones (F-112), heredada íntegra de `abarrotes`, más F-145 corte de material,
más dos variantes opcionales por perilla: V8 obra (F-117) y V10 renta (F-119).**

`abarrotes` estableció la decisión de arquitectura que aquí se hereda sin discusión: **V2 es V3 con un
solo factor igual a 1**, y el ledger se escribe **siempre** en la unidad base. Eso no se toca. Lo que
ferretería añade encima:

```
producto: Cable THW calibre 12 negro
  └── unidad_base            "milímetro"          ← el ledger SIEMPRE se escribe aquí
       ├── presentación 1    metro    × 1,000      sin código     $14.50
       ├── presentación 2    rollo 100 m × 100,000  cód. 750…12   $1,290.00
       └── (venta por medida libre desde rollo abierto)  ← F-145

existencia real:  437,000 mm
se muestra:       "437 m · 4 rollos cerrados + 37 m del rollo R-114"


producto: Tornillo tirafondo 1/4" × 2" galvanizado
  └── unidad_base            "pieza"
       ├── presentación 1    pieza    × 1          sin código     $2.80
       ├── presentación 2    kilo     ≈ 91         sin código     $195.00   ← F-151, factor POR PESO
       └── presentación 3    caja 500 × 500         cód. 750…07  $1,180.00

existencia real:  2,340 piezas
se muestra:       "2,340 pz · 4 cajas + 340 sueltos · ≈ 25.7 kg"
```

### 1.1 · Por qué V3 + F-145 y no las otras

| Variante | Por qué NO basta / por qué sí | Salvedad |
|---|---|---|
| **V1 · Sin inventario** | Impensable. El inventario **es** el negocio: es donde está todo el capital. | Ninguna. |
| **V2 · Stock simple** | Se rompe el primer día: se compra en rollo y se vende por metro, se compra en caja y se vende por pieza y por kilo. | Se soporta como caso degenerado de V3, igual que en `abarrotes`. Sirve para las chapas, las herramientas y todo lo que va en blíster: **~45% del catálogo es V2 puro**. |
| **V3 · Presentaciones** | **Es la base.** El rollo de 100 m es estructuralmente idéntico a la caja de 24 refrescos: una presentación con factor sobre la unidad base, con su propio código y su propio precio. **No hace falta otro motor.** | **Pero V3 sola no alcanza**, y por dos razones que `abarrotes` no tiene: el material **se corta** (F-145) y el factor puede ser **aproximado** (F-151). |
| **V4 · Lote y caducidad** | No aplica. Un tornillo no se vence. | **Tres excepciones reales**: silicón, cemento de PVC y pintura base agua tienen vida útil de 12 a 24 meses. Se resuelven con la **alerta de sin movimiento**, no con captura de caducidad que nadie va a hacer en 6,000 claves. |
| **V5 · Número de serie** | No aplica a 5,800 de las 6,000 claves. | **Sí aplica a la herramienta eléctrica** —~200 claves— por la garantía del fabricante. La perilla es **por línea**, no global. Pedir serie en un taquete es lo que hace que la gente abandone el sistema. |
| **V6 · Peso, volumen y receta** | **No, y hay que decir por qué, porque es la trampa.** Cortar **parece** transformar y no lo es. Al cortar 60 m de cable no se produce un producto nuevo a partir de insumos: **sale el mismo producto, en menor cantidad, y se destruye un poco**. No hay receta, no hay escandallo, no hay explosión. | El **entonado de pintura** (F-258) sí consume dos productos —base + colorantes— para entregar uno. Es lo más cerca que está este giro de una receta, y se resuelve como **servicio con material**, no como V6. |
| **V7 · Producción por lote** | No se produce nada. | De `carpinteria-herreria`, que sí fabrica. |
| **V8 · Por proyecto u obra** | **Sí, por perilla**, pero en variante: el material es **vendido**, no propio, y la obra es **del cliente**. Ver §4.4. | En `constructora` V8 controla material propio contra presupuesto propio. Aquí controla **saldo y consumo del cliente por obra**, que es otra cosa con la misma forma. |
| **V9 · Consignación** | La mercancía es de Beto: la compró y la pagó a 30 días. | **Excepción vigilada**: algunos proveedores dejan exhibidores de herramienta "a consignación". Si aparece, se enciende V9 para esas claves; hoy no hace falta. |
| **V10 · Activos que vuelven** | **Sí, por perilla**, para las seis u ocho herramientas de renta. | El depósito reutiliza el mecanismo de F-256 (casco de `abarrotes`), no el de inventario. La herramienta rentada **sale del stock vendible** y entra a un estado propio. |

### 1.2 · Lo que este modelo le entrega a sus vecinos

```
HEREDADO DE ABARROTES · intacto, no se toca
  F-100…F-109 tronco · F-111 · F-112 · F-120 · F-106 · F-149 motor

NACE AQUÍ, y lo heredan los vecinos
  + F-145 corte de material · lineal, plano y tubular  → mercería, carpintería,
                                                          materiales, vidriería
  + F-150 retazo y sobrante                            → los mismos
  + F-151 doble unidad con factor por peso             → materiales, agroveterinaria
  + F-152 ubicación física de la pieza                 → refaccionaria, mercería,
                                                          papelería grande
  + F-153 lista de materiales por trabajo              → materiales, agroveterinaria
  + F-109 merma con MERMA DE CORTE como sexto motivo   → todos los que cortan
  + F-051 inverso: sin movimiento valuado y rotación   → todo retail de cola larga
  + F-105 dos almacenes encendidos por omisión         → materiales
```

---

## 2 · UNIDADES

### 2.1 · La regla de hierro, heredada y ampliada

> **El ledger `movimientos_stock` se escribe SIEMPRE en la unidad base del producto.** La presentación
> es una lente de captura y de lectura, nunca una unidad de almacenamiento.

Es la regla de `abarrotes` §2.1 y aquí vale igual. Lo que se añade es **cuál es la unidad base cuando
el producto es continuo**, y la decisión tiene la misma lógica que la de los centavos:

> **Nada de decimales en la unidad de almacenamiento.** El dinero se guarda en centavos; el peso, en
> gramos; **la longitud, en milímetros**; el volumen, en mililitros. Un inventario de cable guardado
> en metros con decimales produce existencias de `37.999999 m` y diferencias que nadie puede explicar.

### 2.2 · Las unidades base de este giro

| Unidad base | % del catálogo | Ejemplos reales de La Broca |
|---|---|---|
| **pieza** | ~70% | Tornillo, taquete, chapa, bisagra, contacto, apagador, broca, llave, martillo, cubeta de pintura, saco de cemento, tubo de 6 m |
| **milímetro** | ~12% | Cable, manguera, cadena, cuerda, alambre, malla, cinta métrica por metro, moldura, tubo cortado a medida |
| **gramo** | ~10% | Tornillo, clavo, pija y alambre **vendidos por kilo** — el mismo producto que ya está en pieza, con la segunda unidad (F-151) |
| **mililitro** | ~5% | Pintura a granel, thinner, solvente, aceite, pegamento líquido |
| **milímetro cuadrado** | ~3% | Lámina, vidrio, malla y madera cortados a medida | 

**Nota sobre el milímetro cuadrado, que es el caso feo.** Media hoja de lámina no es "la mitad de una
hoja": es un pedazo con forma, y lo que sobra puede ser inservible o puede ser una tira de 20 cm que sí
se vende. **Decisión: se guarda en piezas y se registra la merma de corte**, no se lleva inventario por
área. Llevar área obligaría a modelar la geometría del sobrante —dónde se cortó, qué forma quedó— y eso
es un sistema de optimización de corte, no un punto de venta. **Es la línea donde esta carpeta decide
no ir**, y se dice explícitamente para que nadie lo intente después. Lo que sí se registra es cuántas
hojas se abrieron y cuánto se cobró de cada una.

### 2.3 · Las presentaciones reales del giro

| Producto | Base | Presentaciones | Factor | Código de fábrica |
|---|---|---|---|---|
| Cable THW cal. 12 | milímetro | metro · rollo 100 m | 1,000 · 100,000 | **Sólo el rollo** |
| Manguera jardín 1/2" | milímetro | metro · rollo 50 m | 1,000 · 50,000 | Sólo el rollo |
| Cadena galvanizada 3/16" | milímetro | metro · **kilo** · rollo | 1,000 · por peso · 30,000 | **Ninguno** |
| Tornillo tirafondo 1/4"×2" | pieza | pieza · **kilo (≈91)** · caja 500 | 1 · ≈91 · 500 | Sólo la caja |
| Clavo 2 1/2" | pieza | **kilo (≈120)** · caja 1 kg · caja 25 kg | ≈120 · 120 · 3,000 | Caja sí |
| Tubo PVC sanitario 4" | pieza | tramo 6 m · **metro cortado** | 1 · 1/6 | Ninguno |
| Pintura vinílica | pieza | litro · galón (3.8 L) · cubeta (19 L) | 1 · 3.8 · 19 | **Sí, cada una** |
| Varilla corrugada 3/8" | pieza | tramo 12 m · **metro** · **tonelada** | 1 · 1/12 · por peso | Ninguno |
| Taladro Truper 1/2" | pieza | pieza | 1 | **Sí** + número de serie |
| Cemento gris | pieza | saco 50 kg · **tonelada (20 sacos)** | 1 · 20 | Sí |

**Cuatro casos que rompen el modelo de `abarrotes` y hay que resolver desde el diseño:**

1. **El rollo abierto.** Cuatro rollos de 100 m no son 400 m indistinguibles: son **tres cerrados y uno
   con 37 m**. Si el sistema sólo guarda 337,000 mm, el mostradorista no sabe si puede cortar 60 m de
   un jalón, y va a tener que ir a ver. **Ver §3.3.**
2. **El tramo de fábrica.** El tubo y la varilla vienen en tramos fijos —6 m, 12 m— y **al cortar uno
   quedan dos pedazos, no uno**. El de 2 m que se vendió y el de 4 m que sobra, que **sí es vendible**
   pero ya no es un tramo completo. Es distinto del rollo, donde el sobrante sigue siendo "el rollo".
3. **La segunda unidad con factor medido.** Un tornillo 1/4"×2" pesa ~11 g. Un kilo son **91 tornillos,
   o 88, o 94**, según el lote y el galvanizado. **No hay factor exacto y fingir que lo hay es el error
   número uno del giro.** Ver §2.4 y F-151.
4. **El producto que se compra en una unidad y jamás se vende en ella.** La tonelada de varilla, el
   millar de tabique. Presentación sólo de compra, con `es_venta_default = false`.

### 2.4 · La conversión por peso · F-151, explicada

Ésta es la diferencia más técnica entre `abarrotes` y `ferreteria` y merece precisión.

En `abarrotes`, la caja **siempre** trae 24. El factor es un hecho del empaque y nunca se desvía. En
ferretería, el kilo de tornillo trae **los que quepan**, y eso depende del lote, del galvanizado y de
la báscula.

```
producto: Tornillo tirafondo 1/4" × 2" galvanizado
  peso_por_pieza_mg        11,000 mg      ← atributo del producto
  tolerancia_pct           8%             ← declarada, no adivinada
  ultima_calibracion       14-sep-2026 · pesaron 100 pz = 1,094 g → 10,940 mg
```

**Cómo opera en la venta.** El cliente quiere "un kilo de tornillo". Se pesa la charola: 1.05 kg netos.
El sistema muestra **"≈ 95 piezas · $205.00"** y descuenta **95 piezas del ledger**. No descuenta gramos.

**Por qué el ledger va en piezas y no en gramos, que sería más exacto.** Porque la pregunta que el
mostrador se hace cincuenta veces al día es *"¿cuántos tornillos hay?"*, no *"¿cuántos gramos?"*. Un
inventario en gramos obligaría a convertir para contestar la pregunta normal, y convertiría la ficha
del producto en algo que el ferretero no reconoce. **La exactitud que se pierde se recupera con la
tolerancia y la recalibración**, que es como se hace de verdad.

**Cómo se recalibra.** Una vez al mes, o cuando la diferencia del conteo de esa gaveta pasa la
tolerancia, se pesan 100 piezas contadas a mano y el sistema actualiza el peso por pieza. **Es una
operación de dos minutos y es lo que evita que la desviación se acumule un año.**

**Cómo protege al conteo.** Si la gaveta esperaba 2,340 piezas y el conteo por peso da 2,190, la
diferencia es del 6.4% — **dentro de la tolerancia del 8%**, y el sistema **no genera ajuste**: lo
marca como "dentro de tolerancia" y sugiere recalibrar. Si hubiera generado un ajuste de 150 piezas,
el kardex se llenaría de ruido mensual y el indicador de faltantes dejaría de servir para detectar el
robo real, que es lo único para lo que existe.

### 2.5 · Cómo se muestra una existencia

Nunca en unidad base a secas, y **siempre con lo que se puede cortar de un jalón**:

```
Cable THW cal. 12 negro      437 m    ·  4 rollos + 37 m abiertos (rollo R-114)
Tornillo 1/4" × 2" galv.   2,340 pz   ·  4 cajas + 340 sueltos  ·  ≈ 25.7 kg
Tubo PVC sanitario 4"         31 pz   ·  28 tramos + 3 cortados (1.2 m, 2.4 m, 4.0 m)
Pintura vinílica blanca      144 L    ·  7 cubetas + 2 galones
```

La lente por omisión es **la presentación de venta** en el mostrador y **la de compra** en inventario y
compras — igual que en `abarrotes`. Lo que se añade es **el detalle de lo abierto**, que allá no existe
porque una caja de refrescos abierta son piezas sueltas y punto.

---

## 3 · QUÉ SE DESCUENTA, CUÁNDO Y CON QUÉ DISPARADOR

### 3.1 · El "cuándo" · aquí hay tres disparadores, no uno

`abarrotes` decidió **un solo disparador: al cobrar**, y descartó explícitamente modelar el hueco entre
cobro y entrega porque en un mostrador de tiendita no existe. **Aquí existe y es diario**, así que hay
tres:

| Disparador | Cuándo aplica | % de los movimientos |
|---|---|---|
| **Al cobrar** | Venta de contado normal. Idéntico a `abarrotes`, atómico dentro de la transacción de cobro | ~85% |
| **Al entregar con firma** | **Remisión a crédito.** El material sale y no se cobra. El movimiento se escribe al firmar, porque es cuando el material cruza la puerta | ~12% |
| **Al surtir un pedido** | Pedido especial con anticipo, surtido total o parcial. Puede ser semanas después del anticipo | ~3% |

**La regla que los une, y es la que hay que defender:** el ledger se escribe **cuando el material sale
físicamente**, no cuando entra el dinero. Es el criterio honesto y es el único que hace que el conteo
signifique algo. Un sistema que sólo descuenta al cobrar tendría el material de las remisiones "en
existencia" mientras va camino a la obra, y el conteo lo marcaría como faltante.

**Lo que NO cambia:** el stock **no baja al escanear ni al armar la nota de mostrador**. Un carrito se
abandona, una nota caduca, y el ledger es inmutable: sólo se escribe lo que de verdad pasó. Lo que sí
hace la nota de mostrador es **apartar** —una reserva blanda, con vigencia y visible— sin tocar el
ledger.

### 3.2 · La tabla completa de disparadores

| Evento | Movimiento | Signo | Unidad escrita | Atómico con |
|---|---|---|---|---|
| Cobro de venta de contado | `salida_venta` | − | base | La transacción de cobro |
| **Entrega con remisión a crédito** | `salida_venta` | − | base | La transacción de la remisión firmada |
| **Surtido de pedido** | `salida_venta` | − | base | La transacción de surtido |
| **Corte de material · la parte vendida** | `salida_venta` | − | base | La transacción de corte |
| **Corte de material · la merma** | `merma` motivo `corte` ← **NUEVO** | − | base | **La misma transacción.** Van juntas o no van |
| **Retazo dado de baja** | `merma` motivo `retazo` | − | base | El cierre del retazo |
| Cancelación de venta cobrada | `cancelacion` | + | base | La transacción de cancelación |
| Devolución vendible | `devolucion` | + | base | La transacción de devolución |
| Devolución no vendible | `devolucion` + `merma` | +/− | base | Dos movimientos, una transacción |
| **Devolución de sobrante de obra** | `devolucion` | + | base | Con la aplicación al saldo de la obra |
| Entrada de compra | `entrada_compra` | + | base | La recepción, con el costo promedio |
| **Salida a garantía del proveedor** | `garantia_proveedor` ← **NUEVO** | − | base | El envío |
| **Retorno de garantía** | `garantia_retorno` ← **NUEVO** | + | base | La recepción del repuesto |
| **Salida a renta** | `renta_salida` ← **NUEVO** | − | base | El contrato de renta |
| **Retorno de renta** | `renta_retorno` ← **NUEVO** | + | base | La devolución |
| Merma con motivo | `merma` | − | base | El comando de merma |
| Consumo de la casa | `consumo_interno` | − | base | Heredado de `abarrotes` |
| **Consumo por servicio de mostrador** | `consumo_servicio` ← **NUEVO** | − | base | La venta del servicio |
| Ajuste de conteo | `ajuste` | ± | base | El cierre del conteo |
| Traspaso mostrador ↔ bodega | `traspaso_salida` + `traspaso_entrada` | −/+ | base | Una transacción |
| Inventario inicial | `inventario_inicial` | + | base | El alta |

**Seis tipos nuevos que hay que añadir al `check` de `movimientos_stock`**, además de los dos que ya
pidió `abarrotes` (`devolucion_proveedor` y `consumo_interno`): `garantia_proveedor`,
`garantia_retorno`, `renta_salida`, `renta_retorno`, `consumo_servicio`, y el motivo `corte` dentro de
`merma`.

**Por qué la merma de corte va en la misma transacción que la venta.** Porque si se pudiera registrar
por separado, **no se registraría nunca**: son 40 cm y hay fila. Yendo juntas, el sistema propone el
valor por omisión del tipo de material y la persona lo acepta o lo corrige. Es la misma lógica con la
que `abarrotes` mete el canje de Bimbo en la nota de compra: *lo que se captura aparte, no se captura*.

### 3.3 · El rollo abierto y el tramo cortado

**El problema:** la existencia total no basta para decidir un corte. Si hay 437 m de cable pero
repartidos en cuatro rollos cerrados de 100 y uno abierto con 37, **no se pueden cortar 60 m
continuos del rollo abierto**.

**Decisión: se modela el rollo abierto, y sólo el abierto.** Los rollos cerrados son intercambiables y
no necesitan identidad; el abierto sí. Una tabla ligera `piezas_abiertas` con el producto, la medida
que le queda, un folio corto para etiquetarlo físicamente (`R-114`) y su ubicación.

**Por qué sólo el abierto y no todos.** Porque llevar identidad de las 400 piezas continuas del
catálogo sería un sistema de trazabilidad completo, y nadie va a etiquetar cada rollo que llega. **Se
etiqueta al abrirlo**, que es un acto que ya ocurre: el mostradorista ya le pone una cinta con el
sobrante escrito a mano. El sistema sólo le da folio y memoria.

**Cuántos abiertos puede haber por producto.** Uno, normalmente. Dos cuando alguien abrió otro por
prisa. **Si hay tres o más, el sistema lo señala**: son retazos acumulándose y hay que cerrarlos.

**El caso del tubo es distinto y hay que decirlo.** Al cortar un tramo de 6 m en 2 m quedan **dos
piezas**: la vendida y un pedazo de 4 m que **sí es vendible como pieza**, no como "tramo abierto". Se
modela igual, con `piezas_abiertas`, y se muestra en la existencia como *"28 tramos + 3 cortados (1.2,
2.4, 4.0)"*, porque el siguiente cliente que quiera 1 m debe salir del pedazo de 1.2, no de un tramo
nuevo. **Eso es lo que convierte un retazo en una venta.**

### 3.4 · Cuando el stock no alcanza

Se hereda de `abarrotes` §3.3: la perilla `permite_venta_sin_stock`, **encendida por omisión, con
aviso**, porque un sistema que se niega a cobrar material que el cliente tiene en la mano se apaga esa
misma tarde. El stock negativo es **una alarma visible**, no un error que se silencia.

**Con una excepción propia de este modelo:** en **venta a crédito** la perilla se invierte. Si no hay
stock y la venta es a crédito, **el sistema sí detiene y pide confirmación**, porque despachar a
crédito material que no existe es prometer algo que no se puede entregar, y en una obra eso cuesta más
que una discusión: cuesta el cliente.

---

## 4 · ENTRADAS

### 4.1 · Compra · pocos proveedores, pedidos grandes

Es el opuesto exacto de `abarrotes`, que tiene **doce proveedores con doce ritmos y varios a diario**.

| Proveedor | Ritmo | Cómo llega | Particularidad |
|---|---|---|---|
| **Distribuidor Truper** | **Quincenal o mensual** | Camión, 150 a 300 líneas | El grupo maneja **siete marcas** —Truper, Pretul, Volteck, Foset, Fiero, Hermex, Klintek— con **más de 11,000 productos** y **12 centros de distribución**. Puede ser el 40% de la compra. **Crédito 30 días**. El catálogo viene en archivo, y eso es oro para F-032 |
| **Mayorista ferretero local** | Semanal | Va Beto con la camioneta o entregan | Complementa lo que Truper no tiene. Contado o 15 días |
| **Pintura (Comex, Sherwin, Berel)** | Quincenal | Ruta de la marca | Entrega el **entonador** y la base en comodato; pide exhibición |
| **Cemento y material pesado** | Semanal o por pedido | Camión directo | Poco margen (~18%), mucho volumen, ocupa la bodega. A veces se pide **contra venta**, no a stock |
| **Cable y material eléctrico (IUSA, Condumex y similares)** | Mensual | Distribuidor | **El precio se mueve con el cobre.** Es la línea donde el costo cambia entre una compra y otra |
| **Tornillería y fijación a granel** | Mensual | Mayorista especializado | Llega en cajas y bultos. **Es donde vive el mejor margen** (35%–50%) |
| **Herramienta de marca (Urrea, Stanley y similares)** | Por pedido | Distribuidor | Ticket alto, rotación baja. **Es el principal candidato a dinero dormido** |

**Lo que esto exige del modelo de datos, y es distinto de `abarrotes`:** el proveedor no necesita
tanto "día de visita" —aquí no hay preventista diario— sino **días de crédito**, **monto mínimo de
pedido**, **tiempo de entrega** y **si acepta garantías**. La sugerencia de pedido no se dispara porque
"hoy viene Coca", sino porque **se junta el monto mínimo** o porque **se acerca la fecha del pedido**.

### 4.2 · La captura de 200 líneas, que es el cuello de botella real

`abarrotes` resolvió su problema de compras con "recepción desde el teléfono, de pie, en el momento,
con foto de la nota, cinco toques". **Aquí eso no sirve**: no son cinco productos, son doscientos, y
capturarlos a mano tarda dos horas y se hace mal.

**Tres caminos, en orden de preferencia:**

1. **Importar el archivo del proveedor.** Los distribuidores grandes mandan la nota en Excel o PDF. El
   sistema importa, empareja por código o por SKU del proveedor, y **deja para captura manual sólo lo
   que no emparejó**. De doscientas líneas quedan doce.
2. **Escanear contra el pedido.** Si hay orden de compra (F-630), se escanea lo que llega y el sistema
   va marcando; al final enseña **lo que faltó y lo que llegó de más**, que es la comparación que hoy
   nadie hace y por la que se pagan cajas que no llegaron.
3. **Captura manual asistida**, con la presentación elegida **antes** que la cantidad y la equivalencia
   en vivo — heredado de `abarrotes` §9 error 1, que aquí aplica igual.

**Y la regla que evita el error más caro de esta captura:** cuando el costo de una línea sube más de un
umbral respecto de la última compra, el sistema lo señala **en el momento** y propone el precio de venta
que mantiene el margen. En la línea de cable esto no es un lujo: **el cobre se mueve y un ferretero que
no actualiza el precio vende a pérdida sin enterarse durante semanas.**

### 4.3 · Las demás entradas

| Entrada | Frecuencia | Notas |
|---|---|---|
| **Devolución de cliente vendible** | **2 a 5 al día** | Regresa al anaquel a su costo original. **No toca el costo promedio.** Ver §5 |
| **Devolución de sobrante de obra** | Semanal | Contra la subcuenta de la obra (F-138 + F-639) |
| **Retorno de garantía** | Quincenal | El proveedor repone. Entra a costo original, **no como compra nueva** |
| **Retorno de renta** | Diario, si el módulo está encendido | Vuelve al estado rentable, no al vendible |
| **Ajuste positivo tras conteo** | Semanal | Con motivo obligatorio |
| **Traspaso bodega → mostrador** | **Pocas veces al día** | Ver §4.4 |
| **Inventario inicial** | Una vez | Ver §6.1 |

### 4.4 · Dos almacenes, y por qué aquí sí

**`abarrotes` decidió UN SOLO ALMACÉN, y lo argumentó bien:** si el anaquel y la bodeguita fueran dos
almacenes, Lupita tendría que capturar un traspaso cada vez que saca una caja de refrescos, entre diez
y treinta veces al día, y **no lo va a hacer**; en cuanto deja de hacerlo, los dos almacenes mienten.

**Aquí la decisión se invierte, y la razón es física, no de gusto.**

En La Broca hay **producto que vive en la bodega y nunca pasa por el mostrador**: cemento, varilla,
tubo, lámina, arena, tinacos. **No se repone al anaquel: se despacha desde la bodega**, el cliente da la
vuelta con la camioneta y el ayudante lo carga. No hay traspaso que capturar porque **no hay traspaso**:
hay dos lugares donde vive producto distinto.

```
ALMACÉN "Mostrador"     ~5,200 claves   producto chico, se despacha por el mostrador
ALMACÉN "Bodega"          ~800 claves   pesado y voluminoso, se despacha por atrás
```

**Lo que sí hay que resolver es el solapamiento**, que existe y es la parte incómoda: el tubo de PVC
está en la bodega **y** hay tres tramos en el mostrador; la pintura está en las dos. **Decisión: sólo
las claves marcadas como `doble_ubicacion` viven en los dos almacenes**, y para ésas —unas cincuenta—
el traspaso sí se captura, porque son pocas y el movimiento es ocasional. Para las otras 5,950, cada
clave vive en **un solo almacén** y el problema no existe.

**La perilla:** en la ferretería chica de un solo local sin bodega, se apaga y todo es un almacén, que
es el modo de `abarrotes`. La perilla existe en los dos modelos; **lo único que cambia es el valor por
omisión, y cambia porque el local es distinto.**

---

## 5 · SALIDAS

| Salida | Frecuencia | Cómo se registra | Valuación |
|---|---|---|---|
| **Venta de contado** | 25–60 veces al día | Atómica con el cobro | A costo promedio |
| **Entrega a crédito** | 8–20 veces al día | Atómica con la remisión firmada | A costo promedio |
| **Merma de corte** | **8–15 veces al día** | `merma` motivo `corte`, en la misma transacción del corte | A costo |
| **Retazo invendible** | Semanal | `merma` motivo `retazo`, al cerrar la pieza abierta | A costo |
| **Devolución no vendible** | 1–2 al día | `merma` motivo `dañado` | A costo |
| **Robo detectado** | Cuando se ve | `merma` motivo `robo_detectado` | A costo |
| **Error de captura** | Tras conteo | `merma` motivo `error_captura` | A costo |
| **Garantía al proveedor** | Quincenal | Tipo propio `garantia_proveedor` | **Sin pérdida**, pero **dinero detenido** |
| **Consumo por servicio** | Diario | `consumo_servicio` — la llave virgen, los colorantes | A costo, dentro del margen del servicio |
| **Consumo de la casa** | Semanal | `consumo_interno`, heredado de `abarrotes` | A costo |
| **Salida a renta** | Diario, si aplica | `renta_salida` | No es pérdida: cambia de estado |
| **Traspaso a otra sucursal** | Ocasional | F-972 | A costo |
| **Ajuste negativo por conteo** | Semanal | `ajuste` con motivo | A costo |

**La distinción que hay que defender con los dientes, heredada de `abarrotes` y aquí más urgente:**
`robo_detectado` (alguien vio quién se llevó las brocas) es **distinto** de la diferencia de conteo. La
diferencia de conteo es de **origen desconocido**: puede ser robo, puede ser una remisión no capturada,
puede ser merma de corte no registrada, puede ser un error de conversión pieza↔kilo. **Llamarla "robo"
es acusar sin prueba**, y aquí, con cuatro empleados que llevan años, es la forma más rápida de destruir
un equipo. El corte la llama **diferencia**; Beto la interpreta.

---

## 6 · CÓMO SE TOMA EL INVENTARIO FÍSICO EN ESTE GIRO

### 6.1 · El inventario inicial · aquí la objeción de venta es otra

En `abarrotes` la objeción es *"¿y quién va a capturar los mil productos?"* y se resuelve con un
catálogo base del giro más el alta rápida durante la operación.

**Aquí la objeción es distinta y hay que contestarla distinto:** Beto **sí** está dispuesto a capturar
—sabe que su catálogo vale dinero— pero **no acepta que su catálogo quede mal capturado**, porque un
tornillo sin medida es un tornillo que nadie va a volver a encontrar. La respuesta no es "es rápido":
es **"el catálogo no lo capturas tú"**.

```
DÍA 1  · Se importa el catálogo del distribuidor Truper — más de 11,000 claves
         con nombre, marca, código, línea y buena parte de los ATRIBUTOS ya
         cargados. Beto no captura: DESACTIVA lo que no vende y pone precio
         a lo que sí. De 11,000 se queda con ~3,000.

DÍA 2  · Se importa el archivo del mayorista local y el de tornillería.
         Otras ~1,500 claves. El resto —lo que compra en la central, lo
         raro, lo viejo— entra por alta rápida durante la operación.

DÍA 3  · Se imprimen las ETIQUETAS DE GAVETA con SKU interno y ubicación
         para todo lo que no trae código de fábrica. Es medio día de trabajo
         de una persona y es lo que hace escaneable el catálogo entero.
         SIN ESTO NO ARRANCA NADA.

SEM 1–12 · Conteo cíclico priorizado POR VALOR. Primero las ~200 claves que
         concentran el 60% del dinero, una gaveta o un rack al día. La
         primera vuelta completa tarda TRES MESES y se dice desde el
         principio, porque prometer dos semanas sería mentir.
```

**El cambio de fondo respecto de `abarrotes`:** allá el conteo se recorre **por zona física**, en orden
de pasillo. Aquí se recorre **por valor**, porque con 6,000 claves y tres meses de vuelta, contar los
taquetes de $0.40 antes que las brocas de $180 es desperdiciar el recurso escaso. Es el ABC de toda la
vida aplicado al conteo, y el motor de F-149 lo soporta sin cambios: **el alcance de un conteo ya es un
parámetro; lo único que cambia es cómo se sugiere el siguiente**.

### 6.2 · El conteo cíclico · F-149 en variante

| | En `abarrotes` | Aquí |
|---|---|---|
| **Alcance** | Una zona de anaquel | **Una gaveta, un rack o una familia** |
| **Cuándo** | Diario, 10:00–13:00, 20 minutos | **Diario, en el valle de la tarde**, 20–30 minutos |
| **Quién** | Lupita o el sobrino, con el teléfono | **Diego o el ayudante**, con el teléfono |
| **Cómo se cuenta** | Se escanea y se teclea cuántos hay | **Tres modos: por pieza, POR PESO y por medida** |
| **A ciegas** | Sí | **Sí. Idéntico.** Mismo motor, mismo sellado del esperado |
| **Qué sigue** | La zona que lleva más días sin contar | **La familia con más dinero sin contar**, ponderando valor y días |
| **Vuelta completa** | Dos semanas | **Tres meses** |

**El modo por peso es la novedad y es lo que hace posible el conteo en este giro.** Nadie cuenta 2,340
tornillos uno por uno. Se pone la gaveta en la báscula, se resta la tara de la gaveta —guardada una vez
en la ficha— y el sistema divide entre el peso por pieza:

```
┌─────────────────────────┐
│ Gaveta B-14             │
│ Tornillo 1/4" × 2" galv.│
│ ───────────────────────  │
│  ○ Por pieza             │
│  ● POR PESO              │
│  ○ Por medida            │
│                          │
│  Peso bruto  [ 26.14 ] kg│
│  Tara gaveta     1.40  kg│
│  Neto           24.74  kg│
│  ≈ 2,249 piezas          │
│                          │
│  [ SIGUIENTE   ✓ ]       │
└─────────────────────────┘
```

**Y la regla de tolerancia que lo hace utilizable:** si la diferencia cae **dentro de la tolerancia
declarada del producto** (§2.4), el sistema **no genera ajuste**: marca "dentro de tolerancia" y sugiere
recalibrar el peso por pieza. Sin esta regla, cada conteo por peso produciría un ajuste de decenas de
piezas, el kardex se llenaría de ruido y **el indicador de faltantes dejaría de servir para lo único
que existe**, que es detectar el robo real.

### 6.3 · La toma completa · F-106

Existe, se hereda tal cual de `abarrotes` §6.3, y se usa **una o dos veces al año**, con la ferretería
cerrada un domingo. Con 6,000 claves es un día completo de cuatro personas. Mismas reglas: se congelan
las ventas, se cuenta en el orden físico, y el resultado se compara contra el esperado **y contra las
diferencias acumuladas de los conteos cíclicos del semestre**. Si coinciden, el sistema es confiable.

### 6.4 · Lo que NO se hace en este giro

- **No se cuenta todo cada mes.** Con 6,000 claves es imposible y prometerlo es fantasía.
- **No se usa PEPS.** Costo promedio ponderado, heredado. PEPS es de `farmacia`.
- **No se valúa a precio de venta.** Ni el inventario, ni la merma, ni las diferencias. Siempre a costo.
- **No se lleva inventario por área de lámina o vidrio.** Ver §2.2. Es una línea que se decide no cruzar.
- **No se pide número de lote.** Un tornillo no tiene lote útil.

---

## 7 · LAS MERMAS PROPIAS DEL GIRO

Seis motivos, y **cada uno apunta a un responsable distinto**. `abarrotes` tiene cinco; aquí se añade el
que define el modelo.

| Motivo | Qué es | Quién responde | Qué decisión dispara |
|---|---|---|---|
| **MERMA DE CORTE** ← nuevo | Lo que se lleva la segueta, lo que se mide de más, el pedazo torcido | **El mostrador y la herramienta de corte** | Si pasa del umbral: o se corta mal, o alguien se lleva material. Las dos hay que verlas |
| **Retazo invendible** | El pedazo que quedó y que nadie quiere | **La compra y el mostrador** | Rematar antes de que se vuelva basura; revisar si conviene comprar rollos más chicos |
| **Dañado** | Se cayó, se mojó, el empaque se abrió | El acomodo y el local | Cambiar dónde se guarda; arreglar la gotera |
| **Roto en traslado** | Vidrio, lámina, cerámica, tubo | El manejo y la carga | Capacitación, o cobrar mejor el flete |
| **Robo detectado** | Se vio | Seguridad | Ver §7.2 |
| **Error de captura** | El sistema estaba mal, no faltó material | El sistema y quien capturó | Revisar el flujo que lo generó |

### 7.1 · Las tres mermas que de verdad duelen, por monto

1. **La merma de corte no registrada.** Es la primera porque es **la más constante y la más invisible**:
   40 cm por corte, ocho cortes al día, seis días a la semana. En cable de calibre grueso, en cadena
   galvanizada y en manguera reforzada, eso es dinero. Y es **merma prevenible**: la mitad se va en
   "para que no le falte", que es una decisión del mostradorista que se puede medir y corregir.
2. **El retazo que se volvió basura.** El pedazo de 1.8 m que se pudo haber vendido al 70% hace tres
   meses y hoy está sucio detrás del rack. **Es merma prevenible con una alerta**, y la alerta es
   trivial de construir: una lista de piezas abiertas con más de N días.
3. **La diferencia de conteo sin causa.** El robo hormiga, que aquí tiene forma propia. Ver §7.2.

### 7.2 · El robo hormiga de una ferretería · por qué es distinto

El robo hormiga es el dolor número uno de `abarrotes`. **Aquí es el cuarto**, y hay que explicar por
qué baja de rango sin minimizarlo, porque el monto absoluto es mayor.

El retail mexicano pierde **más de $13,000 millones de pesos al año** por merma y robo hormiga, con
estimaciones de hasta el 15% del valor del inventario en los casos malos. En ferretería hay testimonios
documentados de pérdidas de **$2,000 a $5,000 semanales en faltantes inexplicables** antes de tener
sistema. No es poco.

**Pero tiene otra forma, y la forma decide el remedio:**

| | En `abarrotes` | En `ferreteria` |
|---|---|---|
| **Qué se roban** | Botana, refresco, dulce. **Barato y de alta rotación** | **Brocas, puntas, candados, conectores de cobre, cinta de aislar, discos de corte.** Caro y chico |
| **Quién** | Cliente que se lo echa a la bolsa · empleado que no registra | **Sobre todo el que entra al mostrador o al pasillo**, y el que se lleva "de más" en una remisión |
| **El anaquel** | Autoservicio: todo al alcance | **Lo caro y lo chico está detrás del mostrador.** El local ya está diseñado contra esto |
| **Cómo se detecta** | Diferencia de conteo de la zona, diario | **Diferencia de conteo de la familia cara**, y por eso el conteo se prioriza por valor |
| **Qué lo contamina** | Entradas no capturadas | **Remisiones no capturadas y merma de corte no registrada.** Dos fuentes de ruido, no una |
| **Por qué baja de rango** | Es el 100% del riesgo invisible | Aquí compite con el crédito incobrable, que es **un evento único de decenas de miles de pesos**, contra una fuga continua de cientos |

**Y hay una consecuencia de diseño concreta que sale de esto:** el indicador de diferencia de conteo
**no sirve** mientras las remisiones se capturen a mano y la merma de corte no se registre, porque el
ruido tapa la señal. **Por eso el orden de construcción pone el crédito y el corte de material antes
que los reportes de faltantes**: no por importancia del dolor, sino porque **sin las dos primeras, la
tercera miente**.

---

## 8 · ALERTAS · las que importan y las que serían ruido

### 8.1 · Las que importan

| Alerta | Umbral | Dónde aparece | Decisión que dispara |
|---|---|---|---|
| **DINERO DORMIDO** · claves sin movimiento, valuadas a costo | 90 días para rotación media, 180 para baja | **Dashboard, indicador 2** · corte §16 | *¿Qué remato y qué dejo de comprar?* **Es el dolor 2 y el indicador que este giro necesita y `abarrotes` no** |
| **Dormido al comprar** · el mismo dato **al lado de la línea que se va a pedir** | — | Pantalla de pedido | *¿Voy a comprar otra vez lo que ya tengo parado?* Es el único momento en que ese dato cambia la conducta |
| **Costo que subió** | >5% contra la última compra | Al capturar la entrada · corte | *¿Subo el precio de venta antes de vender a pérdida?* Crítico en cable y cobre |
| **Pieza abierta vieja** | Rollo o tramo abierto con >45 días | Pantalla de existencias | *¿Remato este retazo antes de que se vuelva basura?* |
| **Tres o más piezas abiertas del mismo producto** | ≥3 | Pantalla de existencias | *Alguien está abriendo rollos nuevos sin terminar el anterior* |
| **Merma de corte fuera de patrón** | >umbral del tipo de material, acumulado semanal | Corte §10 | *O se corta mal, o falta material* |
| **Bajo mínimo** de las claves de alta rotación | Existencia ≤ mínimo, **sólo las ~200 marcadas** | Dashboard · corte §16 | *¿Qué pido?* Existe, pero **baja de rango** respecto de `abarrotes` |
| **Se agota antes del próximo pedido** | Existencia ÷ venta diaria < días al siguiente pedido | Dashboard | *¿Lo consigo en el mayorista mientras llega el pedido grande?* |
| **Stock negativo** | < 0 | Existencias, en rojo | *Hay una remisión o una entrada sin capturar.* La acción sugerida es ésa, **no** "cuenta esa gaveta" |
| **Garantía sin resolver** | >30 días fuera | Dashboard · corte §12 | *Reclamarle al proveedor.* Es dinero detenido |
| **Herramienta rentada vencida** | Pasó la fecha de retorno | Dashboard | *Hablarle antes de perder la herramienta y el depósito* |

### 8.2 · Las que serían ruido, y por qué

| Alerta | Por qué NO |
|---|---|
| **Bajo mínimo para las 6,000 claves** | Con una rotación de 3 a 5 vueltas al año, **la mayoría del catálogo está siempre "bajo mínimo"** según cualquier fórmula razonable. Cien avisos diarios es cero avisos. Se marcan a mano las ~200 claves de alta rotación y sólo ésas alertan. **Es la inversión exacta de la regla de `abarrotes`**, donde bajo mínimo es el indicador estrella |
| **Alerta al vender el último** | Es el estado normal de miles de claves de cola larga |
| **Caducidad** | Un tornillo no se vence. Las tres excepciones —silicón, cemento PVC, pintura base agua— se cubren con "sin movimiento" |
| **Alerta de "producto no rentable"** | El material eléctrico deja 15% **y es lo que trae al electricista a la puerta**. Un sistema que le diga a un ferretero que deje de vender cable demuestra que no entiende el negocio. El margen por línea va al corte como **información**, nunca como alerta. **Misma lección que la Coca en `abarrotes`** |
| **Alerta de robo** | El sistema **no sabe** si fue robo. Ver §5 y §7.2 |
| **Alerta por cada devolución** | Son de dos a cinco al día y son normales. Lo que sí alerta es el **patrón**: una línea o una persona concentrando devoluciones |
| **Notificación de cada venta** | Lo primero que se apaga |

---

## 9 · LOS TRES ERRORES DE INVENTARIO QUE MÁS COMETE ESTE NEGOCIO

### Error 1 · Duplicar la clave para vender el mismo producto de dos formas

**Cómo pasa.** El tornillo se vende por pieza y por kilo. El sistema viejo sólo entiende una unidad por
producto, así que el ferretero da de alta *"Tornillo 1/4×2 por pieza"* y *"Tornillo 1/4×2 por kilo"*.
A veces también *"…por caja"*. **Tres registros para una sola mercancía.** Cada uno lleva su propio
conteo, ninguno sabe del otro, y cuando llega el inventario físico **no cuadra ninguno** — porque el
material es el mismo montón.

**Por qué es el error más frecuente y el más caro.** Porque no es un descuido: es **la única salida que
deja un sistema mal diseñado**. Y porque además **fragmenta el catálogo** y confunde al mostradorista,
que no sabe cuál elegir, con lo que la mitad de las ventas de tornillo se registran en el registro
equivocado. Está documentado como el problema característico del giro.

**Cómo lo previene el sistema.** **F-112 + F-151**: un producto, una existencia, N presentaciones —una
de ellas con factor por peso—. En el mostrador se elige la presentación, no el producto. Y en el alta
rápida, cuando alguien intenta dar de alta un nombre casi idéntico a uno existente, el sistema
pregunta: *"¿Es una presentación nueva de «Tornillo 1/4" × 2" galvanizado»?"* con el botón que lleva a
agregarla. **Es el mismo patrón que `abarrotes` usa cuando un código ya existe**, aplicado al nombre.

### Error 2 · El material que salió con remisión y no se capturó

**Cómo pasa.** Descrito en `02-DINERO-Y-CAJA.md` §10, descuadre 1. A las 7:45, con cuatro albañiles
esperando, el material se anota en el talonario y "al rato lo capturo". A las once ya no se acuerda de
la mitad.

**Por qué es un error de inventario y no sólo de caja.** Porque **contamina el indicador de faltantes**.
Un faltante por remisión no capturada es indistinguible de un robo y es lo que hace que los conteos
acusen a gente inocente. Es el gemelo exacto del error 2 de `abarrotes` —la entrada de Sabritas que se
traspapela— con una diferencia de escala: allá son $2,400 de botana; aquí son $8,000 de material en una
sola mañana.

**Cómo lo previene el sistema.**
1. **La remisión se genera en el sistema y se imprime**, no se escribe en el talonario. Para que eso sea
   posible a las 7:45, **buscar tiene que ser más rápido que escribir a mano**, y por eso F-201 es
   tanda 0.
2. **La regla de cierre 3**: no se cierra el día con remisiones sin firma capturada.
3. **El stock negativo sugiere la causa correcta**: *"revisa si hay una remisión o una entrada sin
   capturar"* antes que *"cuenta esa gaveta"*.

### Error 3 · Creer que el metro vendido es el metro que salió

**Cómo pasa.** Se venden 60 m de cable y salen 61.2. Se venden 2 m de tubo de un tramo de 6 y el pedazo
de 4 m se queda recargado en la pared sin registro. Se abre un rollo nuevo teniendo 37 m del anterior, y
los 37 m acaban de retazo. **Ninguna de las tres deja rastro**, y las tres son diarias.

**Por qué los tres errores son el mismo error.** Porque los tres nacen de que **vender material continuo
no es como vender piezas**, y un sistema que trata el cable igual que un martillo obliga a la persona a
resolverlo a mano. En el momento en que se resuelve a mano, se resuelve mal, y **el inventario de todo
el material lineal —que es el 12% de las claves y una parte grande del capital— se vuelve ficción en
semanas**.

**Cómo lo previene el sistema.** **F-145 + F-150 completos**, que es por lo que están en la tanda 1 y no
en la 4:
- El corte registra **dos movimientos en una transacción**: la medida vendida y la merma, con el valor
  por omisión del tipo de material propuesto y editable.
- El sobrante del tramo **se vuelve una pieza abierta con folio**, se etiqueta físicamente y aparece en
  la existencia. El siguiente cliente que quiera 1 m sale de ahí.
- **El sistema propone cortar del abierto antes que del cerrado**, siempre, y avisa cuando alguien está
  a punto de abrir uno nuevo teniendo otro disponible.
- La lista de piezas abiertas viejas es una alerta, no un reporte enterrado.

**Y lo que el ferretero llamaría "el sistema me cuidó":** *"Hay 37 m abiertos en el rollo R-114. ¿Cortas
de ahí?"* aparece antes de abrir el rollo nuevo. Es una línea de texto, cuesta casi nada, y es
exactamente el tipo de detalle que hace que la renta mensual se sienta barata — la misma función que
cumple *"subió la Coca antes de que perdieras dinero"* en `abarrotes`.
