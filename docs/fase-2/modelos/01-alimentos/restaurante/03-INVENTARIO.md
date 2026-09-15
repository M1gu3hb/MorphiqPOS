# 03 · INVENTARIO · Restaurante de mesa

**Variante F-115 · V6 — Peso, volumen y receta.** Es la única variante construida hoy en
MorphiqPOS y la que este modelo definió.

---

## 1 · POR QUÉ V6 Y NO OTRA

Un restaurante de mesa **no revende: transforma**. Lo que compra y lo que vende no son la misma
cosa, ni en nombre, ni en unidad, ni en cantidad. Compra una pieza de arrachera de 4.2 kg y vende
cuarenta platos de 280 g de arrachera limpia con salsa, guacamole y tortillas. Entre una cosa y la
otra hay una receta y hay una merma de limpieza.

Eso descarta, una por una, las otras nueve variantes:

| Variante | Por qué no |
|---|---|
| **V1 sin inventario** | Sí hay inventario y es la mitad del costo del negocio. |
| **V2 stock simple (pieza)** | Nada se vende en la unidad en que se compró. Una pieza de res no es una unidad vendible. |
| **V3 presentaciones (caja ↔ pieza)** | El factor de conversión sirve para revender empaquetado. Aquí no hay caja que se abra en piezas: hay carne que se corta. |
| **V4 lote y caducidad** | El insumo dura de dos a cinco días y se rota físicamente por primeras entradas. Capturar lote por caja de jitomate es trabajo diario sin beneficio: nadie va a rastrear un lote de cilantro. |
| **V5 número de serie** | Ningún insumo es único ni rastreable individualmente. |
| **V7 producción por lote** | Es de la panadería: se produce un lote de 200 piezas y se almacena. Aquí se produce **al momento y por unidad**, contra una comanda que ya existe. Nunca hay producto terminado guardado. |
| **V8 por proyecto** | No hay obra a la que asignar material. |
| **V9 consignación** | La mercancía es propia. |
| **V10 activos que vuelven** | Nada sale y regresa. |

**Lo que V6 añade sobre el tronco común:** receta con merma declarada por insumo, explosión de esa
receta al cobrar, costeo en cascada, producto por peso variable y el caso especial del **insumo
base** — el producto que *es* su propio insumo (una cerveza, un refresco, un vino por copa).

---

## 2 · UNIDADES

**Sólo tres unidades base, y no se amplían.** La regla la impone la base de datos, no la pantalla.

```
g       gramos          todo lo sólido
ml      mililitros      todo lo líquido
pieza   piezas          lo que se cuenta y no se pesa
```

**Por qué sólo tres.** Porque la conversión tiene que ser exacta y sin ambigüedad. Un insumo
medido en "kg" y otro en "g" es la puerta del error de 1000×: alguien escribe `kg` en una receta
de un insumo medido en gramos y el consumo se multiplica por mil, el costo también, y el margen
se va a negativo sin que nadie entienda por qué. Guardando siempre en unidad base, ese error deja
de poder existir.

**Unidades de captura** (lo que el usuario teclea) y su conversión:

| Se teclea | Se guarda | Factor |
|---|---|---|
| kg | g | × 1000 |
| g | g | × 1 |
| litro | ml | × 1000 |
| ml | ml | × 1 |
| pieza, paquete, caja, bolsa, unidad | pieza | × 1 |

La receta guarda **las dos cosas**: `cantidad_capturada` + `unidad_capturada` (lo que el usuario
tecleó, para poder reeditarlo tal cual) y `cantidad` + `unidad` (lo convertido, que es lo que
consume el inventario). La conversión la hace el servidor y **lanza error si las dimensiones no
coinciden** — escribir `ml` en un insumo medido en gramos no se corrige por lo bajo: falla.

### Ejemplos reales de este giro

| Insumo | Unidad base | Se compra en | Ejemplo de receta |
|---|---|---|---|
| Arrachera | g | kg | 280 g por orden, merma de limpieza 28% |
| Aceite de oliva | ml | litro | 15 ml por salteado |
| Jitomate saladet | g | kg (caja de 12 kg) | 90 g en salsa martajada |
| Tortilla de maíz | pieza | kg (≈ 33 piezas/kg) | 3 piezas por orden |
| Queso Oaxaca | g | kg | 60 g por quesadilla |
| Cerveza clara 355 ml | pieza | caja de 24 | **insumo base**: el producto ES el insumo |
| Tequila blanco | ml | botella de 750 ml | 45 ml por caballito, 60 ml en coctel |
| Limón | pieza | kg (≈ 12 piezas/kg) | 1 pieza por orden |
| Consomé de pollo | ml | preparación propia | 350 ml por plato |

**El caso del insumo base es el que más se usa y el que más se olvida.** Una cerveza no tiene
receta: el producto de venta *es* el insumo de almacén. Se declara con `insumo_base_id` en el
producto, se descuenta 1 pieza por unidad vendida, y evita tener que capturar una receta de un
solo renglón para las cuarenta bebidas de la carta.

---

## 3 · QUÉ SE DESCUENTA, CUÁNDO Y CON QUÉ DISPARADOR

**El disparador es el COBRO. No la comanda, no la entrega.** Y el "cuándo" es la decisión de
diseño más importante del módulo.

```
  Mesero comanda           Cocina prepara         Mesero entrega        Caja cobra
  ────────────────         ──────────────         ─────────────        ──────────
  Se crea la línea         El insumo YA           El comensal ya        ◄── AQUÍ SE
  Se envía la comanda      salió físicamente      está comiendo            DESCUENTA
  Stock: sin cambio        Stock: sin cambio      Stock: sin cambio     Stock: −
```

**Por qué al cobrar y no al comandar.** Porque una comanda se cancela y un cobro no. En hora pico
se comanda de más, se corrige, se cambia de platillo, se anula. Si el stock bajara al comandar,
cada corrección exigiría una reversa, y una reversa fallida deja el inventario mal para siempre.
El cobro, en cambio, es un evento **transaccional e idempotente**: ocurre una vez, no se deshace
(se devuelve, que es otro movimiento con su propia huella) y es el único momento en que el sistema
tiene la certeza de que el consumo fue real.

**El precio de esa decisión, dicho sin adornos:** durante la hora y media que dura la cuenta, el
inventario en pantalla está **sobrevaluado**. Si a las 21:00 quedan 2 kg de arrachera en pantalla
pero hay tres mesas con arrachera sin cobrar, la arrachera ya se acabó. Ese hueco es aceptable
porque el intervalo es de minutos y porque la alternativa —reversas en cascada— es peor. Se
compensa con dos cosas: el aviso de agotado en la pantalla del mesero y la junta de las 11:30,
donde el encargado dice qué no hay.

**Cómo se descuenta, técnicamente:**

1. El cobro abre una transacción.
2. Por cada línea de la cuenta, se explota la receta del producto (F-129).
3. Si el producto tiene `insumo_base_id` y no tiene receta, se descuenta directo del insumo base.
4. Si el producto es de **peso variable** o de **porción**, se usa `cantidad_base_consumo`, que
   **no coincide** con la cantidad vendida. Confundirlas es, otra vez, el error de 1000×.
5. Cada consumo escribe una fila en el ledger `movimientos_stock`, con signo negativo impuesto por
   la base, referencia `orden` y el id de la venta.
6. El decremento es **atómico**: falla en vez de silenciar. Una cuenta que no puede descontar no
   se cobra a medias.

---

## 4 · ENTRADAS

| Entrada | Cuándo pasa | Qué escribe |
|---|---|---|
| **Compra** | 09:00, con el proveedor enfrente | Compra (cabecera + líneas) en una sola transacción, movimientos de entrada en el ledger, y **recálculo del costo promedio ponderado** sobre el stock anterior más el que entra. Nunca se pisa el costo histórico con el último precio pagado. |
| **Inventario inicial** | Una vez, al arrancar el sistema | Movimiento de entrada con referencia propia. Es distinto de un ajuste: marca el punto cero. |
| **Ajuste positivo** | Apareció algo que no estaba contado | Movimiento con **motivo obligatorio**. Sin motivo no se escribe. |
| **Devolución a proveedor** | Se regresa mercancía en mal estado | Movimiento negativo con referencia a la compra. **Pendiente**: hoy se resuelve con ajuste, y eso lo mezcla con las diferencias de conteo. |
| **Traspaso entre almacenes** | Dos sucursales, cocina y bodega | **Pendiente** (F-105). |
| **Producción interna** | Se produjo consomé, salsa madre, caldo | **Hueco real del modelo.** La preparación intermedia —el consomé que rinde 8 litros y se usa en cuatro platillos— hoy se captura como insumo suelto y su costo se teclea a mano. La forma correcta es receta de preparación (F-134 de V7 aplicada parcialmente). Está anotado y no está resuelto. |

**Cómo se registra una compra en la realidad:** de pie, en la puerta de servicio, con la tablet,
mientras el proveedor espera. Por eso existen las **plantillas de compra recurrente**: el pedido
de verdura del martes es casi siempre el mismo, y se repite con dos toques cambiando cantidades y
precios. Sin plantillas, el dueño captura las compras "al rato" y "al rato" es nunca.

---

## 5 · SALIDAS

| Salida | Disparador | Motivo obligatorio |
|---|---|---|
| **Venta** | Cobro de la cuenta, vía explosión de receta | No (lo da la referencia) |
| **Merma de cocina** | Se quemó, se cayó, salió mal, se cortó mal | **Sí** |
| **Merma de almacén** | Se echó a perder, se pasó, llegó mal | **Sí** |
| **Consumo interno / comida del personal** | El turno come | **Sí** — hoy entra como merma y ensucia el dato. F-326 pendiente |
| **Cortesía al comensal** | Postre de cumpleaños, plato de disculpa | **Sí** — mismo problema. F-326 pendiente |
| **Reposición de platillo** | El plato salió mal y se vuelve a hacer | El insumo se consume **dos veces** y sólo se cobra una. Hoy no queda registrado como tal |
| **Robo detectado** | Conteo físico contra teórico | **Sí**, y debería tener su propio motivo, no "ajuste" |
| **Ajuste negativo** | Diferencia de conteo | **Sí** |
| **Traspaso** | A otra sucursal | Pendiente (F-105) |

**Por qué el motivo es obligatorio y no un campo bonito.** Porque el motivo es el nombre del
responsable. "Se quemó" apunta a cocina; "se echó a perder" apunta a compras o a almacén; "se
cayó" apunta al mesero. Un ajuste sin motivo es un agujero por el que cabe cualquier cosa, y eso
es exactamente lo que se quiere cerrar.

**El ledger es inmutable.** Una fila escrita no se toca nunca. El signo lo impone un `check` de
la base atado al tipo de movimiento: entradas positivas, salidas negativas. Esto cierra de raíz el
defecto clásico de "el POS guardaba positivo y la caja negativo, y cualquier reporte que sumara
daba un número sin sentido". El stock actual **no es una columna**: es la proyección del ledger.
No se puede escribir. Ésa es la diferencia entre un inventario que cuadra y uno que se corrompe
cuando dos cajas cobran a la vez.

---

## 6 · CÓMO SE TOMA EL INVENTARIO FÍSICO

**En este giro se toma los lunes por la mañana, antes de abrir, y a veces sólo del ABC.** No se
toma el domingo por la noche porque nadie cuenta bien a la una de la mañana.

Práctica real y la que el sistema debe soportar:

```
SEMANAL · lunes 08:30, antes de recibir proveedor
  Se cuenta lo caro y lo que se roba: carnes, mariscos, quesos,
  destilados, cerveza. 20 a 30 insumos. Media hora entre dos personas.

MENSUAL · primer lunes del mes
  Se cuenta todo, incluidos secos, abarrote y desechables.
  Dos a tres horas.

DIARIO · sólo barra, al cierre
  Botellas abiertas y cerveza. Se cuenta porque es lo que más se va
  y porque es lo único que se puede contar rápido.
```

**Lo que el sistema tiene que hacer y hoy no hace (F-106):**

1. Generar una **hoja de conteo** ordenada por ubicación física, no alfabética. Nadie cuenta en
   orden alfabético: cuenta caminando por la bodega, estante por estante.
2. Capturar **a ciegas**: la misma regla del arqueo de caja. Si la hoja trae el teórico impreso,
   todo el mundo escribe el teórico y el conteo no sirve para nada.
3. Enseñar la diferencia **después**, en unidad y en dinero, ordenada por pesos de diferencia —
   no por cantidad. Faltan 300 g de azafrán importa más que faltan 4 kg de cebolla.
4. Cerrar el conteo con **un solo ajuste por insumo**, con motivo, que deje el ledger cuadrado
   contra el conteo.

Sin F-106 el dueño tiene el consumo teórico (que sí existe, en el corte) y no tiene contra qué
compararlo. Es media herramienta.

---

## 7 · LAS MERMAS PROPIAS DEL GIRO

Cuatro tipos, y son distintos porque apuntan a personas distintas.

| Tipo | Qué es | Dónde se registra | Cuánto es normal |
|---|---|---|---|
| **Merma de limpieza** | La parte del insumo que se tira al prepararlo: grasa de la carne, cáscara, tallo, hueso | **En la receta**, como porcentaje por insumo. **No es una salida**: ya está dentro del costo del platillo | Res 25–30%, pollo 30–35%, verdura 10–20%, pescado 40–50% |
| **Merma de cocina** | Se quemó, se cayó, salió mal el punto, se devolvió | Movimiento de salida con motivo | 1–3% del costo de alimentos |
| **Merma de almacén** | Se echó a perder, llegó golpeado, se pasó | Movimiento de salida con motivo | 1–2% |
| **Merma de barra** | El derrame, la copa mal servida, la botella que se rompió | Movimiento de salida con motivo | 2–4% del costo de bebidas |

**La merma de limpieza es la que más se documenta mal en todo el giro**, y es la que más dinero
mueve. Si la receta dice "280 g de arrachera" sin declarar que la pieza rinde 72% después de
limpiarla, el costo del platillo está subestimado un 28% desde el primer día. El margen se ve
precioso en pantalla y el dinero no aparece en el banco. Por eso `merma_bp` (en puntos base) vive
**dentro de la línea de receta**, por insumo, y no como un porcentaje global del platillo:
distintos insumos del mismo plato mermam distinto.

**Las tres mermas de salida comparten un problema hoy:** el consumo del personal y las cortesías
se registran como merma porque no hay otro lugar. Eso hace que el indicador de merma —que debería
ser la alarma de robo y de descuido— traiga dentro comida que sí tiene explicación. **F-326** lo
separa, y hasta que exista, el número de merma hay que leerlo con esa advertencia.

---

## 8 · ALERTAS QUE IMPORTAN Y ALERTAS QUE SON RUIDO

**Cinco niveles de existencia**, no dos, porque en cocina "bajo" y "crítico" disparan acciones
distintas:

```
suficiente   verde     no hay nada que hacer
medio        amarillo  entra al pedido de la semana
bajo         naranja   entra al pedido de mañana
crítico      rojo      se compra hoy, aunque sea en el súper de la esquina
agotado      rojo      YA NO SE PUEDE VENDER el platillo que lo usa
```

Dos umbrales por insumo, `stock_minimo` y `stock_critico`, porque un solo umbral obliga a elegir
entre avisar tarde o avisar todo el tiempo.

### Alertas que sí importan aquí

| Alerta | Cuándo | A quién |
|---|---|---|
| **Insumo agotado que tiene productos activos** | En cuanto llega a cero | **Al mesero, en su pantalla, antes de que lo venda.** Ésta es la alerta más valiosa del módulo y la que evita la escena de cancelar un platillo en la mesa |
| **Crítico** | Al cruzar el umbral | Al encargado de compras, y en el corte de la noche |
| **Bajo** | Al cruzar el umbral | Sólo en la lista de compras. **Nunca** como notificación |
| **Consumo teórico muy por encima del promedio** | Al cierre | Al dueño. Es la señal temprana de fuga |

### Alertas que serían ruido y no van

- **Notificación por cada insumo que baja de mínimo.** Un restaurante tiene 150 insumos; veinte
  estarían bajos cualquier día. Veinte notificaciones diarias son cero notificaciones.
- **Alerta de caducidad.** No aplica: la rotación es de días y se controla físicamente. Poner
  alertas de caducidad aquí llenaría la pantalla de avisos que nadie atiende, y entrenaría al
  personal a ignorar los avisos que sí importan.
- **Alerta de sobrestock.** Un restaurante no tiene sobrestock: tiene despensa.
- **Alerta de "precio del proveedor subió".** Suena útil y no lo es: los precios de verdura suben
  y bajan cada semana. Lo que sirve es el comparativo mensual (F-636), no el aviso diario.

---

## 9 · LOS TRES ERRORES DE INVENTARIO QUE MÁS COMETE ESTE NEGOCIO

### Error 1 · Capturar las recetas "más o menos"

**Qué pasa.** El dueño captura las quince recetas principales y deja las cuarenta bebidas, las
guarniciones y las salsas sin receta. El consumo teórico sale incompleto, la diferencia contra
físico es enorme, y concluye que "el sistema de recetas no sirve".
**Por qué pasa.** Porque capturar recetas es aburrido y no da resultado el primer día.
**Qué hace el sistema.** El **insumo base** elimina de un golpe la captura de las bebidas: se
declara el insumo y ya. La **importación por Excel** permite capturar recetas sentado en casa un
domingo, en vez de a mano una por una. Y el desglose de costo por producto enseña el costo y el
margen en cuanto la receta existe, que es el único incentivo que funciona.
**Lo que falta.** Un indicador de **cobertura de recetas** —"38 de 96 productos tienen receta; el
consumo teórico cubre el 61% de tus ventas"— para que el dueño sepa cuánto puede confiar en el
número. Hoy no existe y debería.

### Error 2 · Confundir la unidad al capturar

**Qué pasa.** Se teclea `1` y `kg` en un insumo cuya unidad base es gramo, esperando que sean mil
gramos, o al revés. El consumo se multiplica o se divide por mil. El margen se va a −400% o a 99%.
**Por qué pasa.** Porque en cocina se habla en kilos, en litros y en "un chorrito", no en gramos.
**Qué hace el sistema.** Guarda lo tecleado y lo convertido por separado, convierte en el servidor
y **lanza error si las dimensiones no coinciden**. Las unidades base están restringidas a tres y
lo impone la base de datos.
**Lo que falta.** Un aviso de cordura al guardar: *"esta receta cuesta $412 y el producto se vende
en $95. ¿Seguro?"*. Es barato y evita el 90% de los casos que quedan.

### Error 3 · Ajustar el stock a mano en vez de buscar la causa

**Qué pasa.** El conteo no cuadra, y en lugar de investigar, alguien "arregla" el número para que
coincida. Al mes siguiente vuelve a no cuadrar, se vuelve a ajustar, y el inventario deja de
significar nada. La fuga —que puede llegar al 20% del inventario en un año— nunca se encuentra.
**Por qué pasa.** Porque es lo más rápido y porque nadie mide las diferencias históricas.
**Qué hace el sistema.** El ajuste **exige motivo** y queda en el ledger inmutable, con usuario y
fecha. El stock actual no se puede escribir directamente: el camino corto está cerrado a propósito.
**Lo que falta.** El reporte que hace que ajustar duela: **diferencias acumuladas por insumo en
los últimos tres meses, valuadas en pesos** (parte de F-133). Cuando el dueño ve "arrachera:
$18,400 en ajustes negativos este trimestre", deja de ajustar y empieza a preguntar. Ése es el
objetivo real del módulo, y hoy está a tres funciones de distancia.
