# 04 · INTERFAZ · Cafetería de mostrador

Los átomos —tipografía, color, espaciado, botón, campo, tabla, diálogo— son idénticos a los de los
otros 77 modelos y se construyen una sola vez en `packages/ui`. **Lo que cambia es la estructura de
cada pantalla**, y aquí se documenta cuál es y de dónde sale.

Dispositivo principal: **terminal de mostrador** (PC o all-in-one con teclado, cajón y **segunda
pantalla al cliente**). Secundarios: **tablet montada** como pantalla de barra y como pantalla de
recogida, y **teléfono** de la dueña. El layout de la terminal se diseña primero; los otros se
derivan — y una pantalla, la de recogida, **no se deriva de nada**, porque la opera alguien que no
sabe que existe un punto de venta.

---

## 4.1 · VOCABULARIO DEL GIRO

Diccionario de la plantilla `cafeteria` (**F-017**). Lleva género y plural porque el español lo
exige.

| Entidad interna | En pantalla (singular) | Plural | Género | Nota |
|---|---|---|---|---|
| `orden` | **pedido** | pedidos | m | Nunca "cuenta": una cuenta crece, un pedido nace cerrado. Nunca "venta" fuera de Registros |
| `orden_linea` | **bebida** o **producto** | bebidas / productos | f / m | Según su familia. "Bebida" en barra, "producto" en Catálogo |
| `orden.cliente_nombre` | **nombre del pedido** | — | m | En barra se dice *"el vaso"*. En pantalla siempre "nombre" |
| `orden.canal` | **aquí** / **para llevar** | — | — | Dos palabras que el cliente dice literalmente. Nunca "consumo en sitio" |
| `pedido_preparacion` | **pedido en barra** | — | m | La colección es **la fila** |
| `estacion_preparacion` | **barra** | barras | f | Una sola en Café Jacaranda. Dos si hay horno |
| `empleado_atiende` / `empleado_cobra` | **barista** | baristas | m/f | **La misma persona y el mismo nombre para los dos campos.** Ésa es la diferencia con `restaurante`, donde son "mesero" y "cajero" |
| `cliente` | **cliente** | clientes | m | Nunca "comensal". Un comensal come sentado; aquí la mitad ni se sienta |
| `producto` | **bebida** · **alimento** · **grano** | — | — | Tres familias con nombre propio en Catálogo |
| `insumo` | **ingrediente** | ingredientes | m | Salvo el empaque, que se llama **empaque** y vive en su propia sección |
| `receta` | **receta** | recetas | f | |
| `modificador` | **opción** | opciones | f | "Modificador" no lo dice nadie en una barra. Los grupos se llaman por su nombre: Leche · Tamaño · Temperatura · Extras |
| `sesion_caja` | **turno** | turnos | m | ← distinto de `restaurante`, que le dice "caja del día". Aquí el corte es del turno y el turno es la unidad |
| `corte_turno` | **corte** | cortes | m | No hace falta el apellido "de turno": todos lo son |
| `liquidacion_propina` | **reparto del bote** | repartos | m | "Liquidación" suena a nómina y esto se hace con billetes sobre la barra |
| `movimiento merma_barra` | **merma de barra** | — | f | Y sus cuatro motivos con su nombre: **calibración · leche tirada · bebida rehecha · leche pasada** |
| `lote grano` | **bolsa abierta** | — | f | La fecha se llama **tueste**, no "fecha de producción" |
| `recompensa_lealtad` | **sello** | sellos | m | Nunca "punto". Un punto es un número; un sello es un dibujo en una tarjeta y todo el mundo sabe lo que es |

**Traducciones de estado, que es donde más se nota el descuido:**

| Estado interno | En pantalla |
|---|---|
| `en_fila` | En la fila |
| `preparando` | Preparando |
| `listo` | **LISTO** — en versalitas, es el único estado que se grita |
| `entregado` | Entregado |
| `no_recogido` | Nadie lo recogió |
| `canal: aqui` | Aquí |
| `canal: llevar` | Para llevar |
| `canal: plataforma` | Plataforma |
| `canal: anticipado` | Recoge a las 8:15 |

**Estados vacíos, también traducidos.** No "No hay registros": *"La fila está vacía. Buen momento
para reponer leche."* — y en la pantalla de recogida, que la lee un cliente: *"Todavía no hay
pedidos listos."*

**Una regla de vocabulario propia de este modelo:** la palabra **"mesa" no aparece en ninguna
pantalla, en ningún mensaje de error, en ningún estado vacío y en ningún PDF.** No se traduce: se
apaga. Es la comprobación más rápida de que la plantilla está bien hecha, y es la que va a fallar
primero si alguien reutiliza un componente de `restaurante` sin revisarlo.

---

## 4.2 · NAVEGACIÓN

El orden de la barra lateral es **el orden del día de trabajo**. Y cada rol ve una barra distinta
porque cada rol vive un día distinto — sólo que aquí hay dos roles, no cuatro.

```
ADMINISTRADOR / DUEÑA              BARISTA            PANTALLA DE BARRA    PANTALLA DE RECOGIDA
─────────────────────              ───────            ─────────────────    ────────────────────
1  Inicio (dashboard)              1  Cobrar          (sin barra lateral,  (sin nada: no tiene
2  Cobrar                          2  Barra            a pantalla completa) interfaz, sólo salida)
3  Barra                           3  Turno
4  Turno (caja)
5  Ventas
6  Inventario
7  Recetas
8  Productos
9  Compras
10 Clientes
11 Menú público
12 Registros
13 Configuración
```

**Cómo cambia respecto de lo que `operativo` tiene hoy.** El orden actual de `ORDER_OPERATIVO` en
`heredado/components/common/Sidebar.jsx` es:
`/ · /caja · /ventas · /productos · /inventario · /compras · /recetas · /registros · /portal-qr ·
/configuracion`. Los cambios, uno por uno y con su razón:

1. **Entra `/barra` en tercer lugar.** Es la segunda pantalla más usada del negocio y hoy no
   existe.
2. **`/caja` se parte en dos entradas: "Cobrar" y "Turno".** Hoy las dos viven detrás del mismo
   módulo `caja_directa` y la misma palabra. Son dos cosas distintas que se hacen 180 y 2 veces al
   día respectivamente, y meterlas en la misma entrada obliga al barista a atravesar la pantalla de
   apertura de caja cada vez que quiere cobrar.
3. **"Cobrar" sube al segundo lugar**, arriba de todo lo demás, porque es la única entrada que se
   toca en la ráfaga.
4. **Entra "Clientes"**, que hoy no existe en ninguna plantilla, porque los sellos viven ahí.
5. **"Portal QR" se llama "Menú público"** y baja, porque en una cafetería el QR no es un pedido en
   mesa: es un menú que la gente mira en la fila y, más adelante, un pedido anticipado.
6. **No entra Recetas arriba de Inventario**, a diferencia de `restaurante`: aquí Inventario se
   abre todos los días —la leche— y Recetas dos veces al mes.

**Por qué el barista tiene tres entradas y no trece.** Porque opera de pie, con prisa, con las
manos mojadas y con gente mirando. Cada entrada de más es un toque equivocado en la ráfaga. En la
terminal la barra lateral está **colapsada a iconos por omisión** y no se expande sola.

**Por qué la pantalla de barra no tiene barra lateral.** Porque ocupa el monitor entero, se mira a
dos metros entre vapor, y nadie navega desde ahí. Igual que la cocina de `restaurante`, y por la
misma razón, que se cita y no se repite.

**Por qué la pantalla de recogida no tiene navegación ni sesión.** Porque la mira un cliente. No
tiene usuario, no tiene PIN, no tiene menú y no se puede tocar. Es una salida, no una interfaz.

---

## 4.3 · CADA PANTALLA, UNA POR UNA

---

### PANTALLA · Acceso por PIN

```
Propósito ......... identificar quién está operando y arrancar su presencia
                    en el turno
Frecuencia ........ 6–12 veces al día · dos o tres personas
Acción principal .. TECLEAR 4 DÍGITOS
Primero se ve ..... dos o tres tarjetas de empleado, muy grandes
Jerarquía ......... 1 tarjetas · 2 teclado · 3 nada más
```

**Idéntica en comportamiento a la de `restaurante`** (F-001, F-002: mismo hash, mismo bloqueo,
mismas tarjetas con foto y color). Se cita y **no se vuelve a describir**. Dos deltas de
estructura, los dos derivados del tamaño del negocio:

- **Las tarjetas son el doble de grandes**, porque son dos o tres, no doce. Una rejilla de doce
  tarjetitas para tres personas es una pantalla diseñada para otro negocio.
- **Al entrar se abre la presencia del turno** (F-248): el sistema registra la hora de entrada del
  barista en la sesión de caja abierta, y la de salida al cerrar sesión. Es lo que permite repartir
  el bote por horas y es invisible: nadie checa, nadie ve un reloj. Se dice en una línea al entrar
  —*"Turno iniciado, 7:28"*— y desaparece.

```
Estado vacío ...... no existe: siempre hay al menos un empleado
Estado de error ... "PIN incorrecto. Te quedan 3 intentos."
Sin conexión ...... no se puede entrar. Se dice así, sin rodeos
Atajos ............ los dígitos del teclado físico funcionan
NO va aquí ........ registro, recuperación, "recordarme"
```

---

### PANTALLA · Cobrar *(`/pos` — la pantalla insignia del modelo)*

```
Propósito ......... convertir lo que el cliente acaba de decir en un pedido
                    cobrado y encolado en la barra
Frecuencia ........ 150–220 veces al día · barista · es SU pantalla de inicio
Acción principal .. COBRAR
Primero se ve ..... la rejilla de bebidas, completa, sin buscar
Jerarquía ......... 1 el botón COBRAR · 2 el carrito con nombre y canal ·
                    3 la rejilla de productos · 4 las categorías
```

**Por qué una rejilla completa y no un buscador, que es lo que hace un abarrotes.** Porque el menú
de una cafetería son 35 a 55 productos, no tres mil. Caben todos en dos pantallas sin scroll, con
tarjetas grandes, y **reconocer es más rápido que teclear**: el barista escucha "un latte grande
con avena" y toca, no escribe. El buscador existe —`F2`— y es para el producto raro, no para el
flujo normal.

**Layout en terminal / PC (≥1280) — es el layout principal**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Cobrar          ▸ Turno abierto · Ana · 07:28      Cambio: $ 420 ⚠         │
├──────────────────────────────────────────────┬─────────────────────────────┤
│ (Café)(Fríos)(Matcha y té)(Pan)(Grano)(Otros)│  PEDIDO                     │
│                                              │  ┌─────────────────────────┐│
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │  │ Nombre                  ││
│ │Espresso│ │Americ. │ │ LATTE  │ │Capuch. │  │  │ [ Mariana          ]    ││
│ │  38.00 │ │  45.00 │ │  58.00 │ │  56.00 │  │  │                         ││
│ └────────┘ └────────┘ └────────┘ └────────┘  │  │  ( AQUÍ ) (PARA LLEVAR) ││
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │  └─────────────────────────┘│
│ │ Mocha  │ │Cold brew│ │Matcha  │ │Chai    │  │                             │
│ │  68.00 │ │  62.00 │ │  70.00 │ │  62.00 │  │  1 × Latte          58.00   │
│ └────────┘ └────────┘ └────────┘ └────────┘  │      16 oz · avena  +22.00  │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │  1 × Croissant      48.00   │
│ │Croissant│ │Conchas │ │Banana  │ │Agua    │  │                             │
│ │  48.00 │ │  32.00 │ │  55.00 │ │  25.00 │  │  ── COMBO Café + pan −10.00 │
│ └────────┘ └────────┘ └────────┘ └────────┘  │                             │
│                                              │  🏷 Mariana · 4 sellos      │
│ [ Buscar  F2 ]     [ Escanear  F3 ]          │                             │
│                                              │  ┏━━━━━━━━━━━━━━━━━━━━━━━┓  │
│                                              │  ┃  COBRAR   $ 118.00 F12┃  │
│                                              │  ┗━━━━━━━━━━━━━━━━━━━━━━━┛  │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

**Las tres decisiones de estructura que mandan en esta pantalla:**

**1 · El nombre y el canal van ARRIBA del carrito, no abajo, y no en el cobro.** Son los dos
primeros campos, en una caja propia con su borde. La razón es operativa y es de secuencia: el
barista los pregunta **al inicio** de la conversación —"¿a nombre de quién?" "¿aquí o para
llevar?"— porque es lo primero que se dice en un mostrador mexicano, antes incluso de la bebida.
Ponerlos al final obliga a preguntar dos veces o a recordar. Y no son cosméticos: **el nombre
decide cómo se va a llamar el pedido (F-329) y el canal decide si se consume el vaso (F-331)**.
Un pedido sin nombre entra a la fila como *"Sin nombre · #47"* y el barista tiene que gritar un
número, que es peor pero funciona; un pedido sin canal **no se puede cobrar**, porque no se sabría
qué descontar.

**2 · El total vive DENTRO del botón de cobrar.** No arriba en grande, como en `restaurante`. Es
la diferencia más visible entre las dos pantallas de cobro y sale de que aquí el que cobra es el
que va a preparar: no lee el total en voz alta desde una pantalla de reportes, lo dice mientras
mira al cliente y con la mano ya sobre el botón. Un total separado del botón obliga a un
movimiento de ojos que se repite 180 veces al día. **El cliente ve el total en su propia pantalla
(F-249), grande, que es donde debe verlo.**

**3 · Las opciones se eligen sobre la tarjeta, no en un diálogo aparte.** Ver la pantalla
siguiente. Es la decisión que decide si el modificador se captura o se escribe con plumón.

**El aviso de cambio en el encabezado.** `Cambio: $420 ⚠` en ámbar cuando baja de $500, en rojo
bajo $250. Es el único dato del encabezado y no es decorativo: es el aviso que evita perder media
ráfaga. Ninguna otra plantilla de las 78 lo lleva.

**Layout en tablet (768–1279)** — la rejilla ocupa toda la pantalla con tarjetas de 96×96 px
mínimo. El pedido se colapsa a una **barra fija inferior** con el nombre, el contador y el total:
`Mariana · 2 · $118.00 ▸`. Al tocarla sube una hoja con el pedido completo y el botón de cobrar.
**Por qué una barra inferior y no un botón flotante como en el mesero de `restaurante`:** porque
la tablet aquí está **montada en un soporte sobre la barra**, no en la mano. Nadie la sostiene, así
que no hay "camino del pulgar" que respetar; lo que hay es una mano mojada acercándose desde
abajo, y el borde inferior completo es el objetivo más grande posible.

**Layout en teléfono (<768)** — **sobrevive entera, y esto sí importa aquí.** Es el modo de
emergencia real: se cayó la terminal, hay fila, y la dueña cobra desde su teléfono con la Clip en la
otra mano. Rejilla de dos columnas, nombre y canal arriba fijos, botón de cobrar fijo abajo. Se
esconden: el escáner, el buscador avanzado y la insignia de sellos.

**Estados**

```
Sin turno abierto . la pantalla se BLOQUEA entera. Tarjeta ámbar:
                    "Turno cerrado" + [ Abrir turno ]. Es un muro, no un
                    aviso. Un cobro sin sesión no pertenece a ningún corte
Vacío ............. "Toca una bebida para empezar." Y el foco ya puesto en
                    el campo de nombre, porque es lo primero que se pregunta
Producto agotado .. la tarjeta se ve en gris con "Agotado" y no se puede
                    tocar. Y lo mismo la OPCIÓN agotada: si se acabó la
                    leche de avena, el botón "Avena" se apaga solo dentro
                    del diálogo de opciones
Cobrando .......... el botón dice "Cobrando…" y se deshabilita. Clave de
                    idempotencia generada al abrir el cobro: dos toques, un
                    doble Enter o un reintento de red no cobran dos veces
Éxito ............. la pantalla se limpia sola en 800 ms y vuelve al estado
                    vacío con el foco en el nombre. NO se abre un diálogo de
                    ticket: eso son dos toques por venta, 360 al día. El
                    ticket se imprime si la perilla lo dice, y si no, hay un
                    botón [ Ticket ] en la fila del pedido en barra
Error ............. rojo, explícito, y el pedido NO se marca cobrado ni
                    entra a la fila
Sin conexión ...... banda ámbar y las escrituras se deshabilitan. Aquí no
                    hay modo sin conexión y se dice: "Sin internet. No se
                    puede cobrar." Es brutal y es honesto
```

**Atajos** (la terminal tiene teclado y esta pantalla es de teclado) — `F12` cobrar · `F2` buscar ·
`F3` escanear · `F4` para llevar / aquí · `Esc` limpiar · `+` y `−` cantidad · `Tab` saltar al
nombre.

**Qué NO va aquí, aunque el sistema lo tenga** — reportes, dashboard, inventario en números,
configuración, historial. Y **no va el corte**: cerrar el turno es otra pantalla y otro momento.

---

### PANTALLA · Opciones de la bebida *(el diálogo que decide si el dato existe)*

```
Propósito ......... capturar leche, tamaño, temperatura y extras en el mismo
                    tiempo que tarda el cliente en decirlos
Frecuencia ........ 90–160 veces al día · barista
Acción principal .. AGREGAR
Primero se ve ..... los cuatro grupos, completos, sin scroll
Jerarquía ......... 1 Leche · 2 Tamaño · 3 Temperatura · 4 Extras
```

Se abre al tocar una bebida que declara grupos de opciones. **Ocupa el centro de la pantalla y se
cierra en un toque por grupo más el de agregar: cinco toques máximo, tres típicos.**

```
┌──────────────────────────────────────────────────────────┐
│  LATTE                                       $ 58.00     │
├──────────────────────────────────────────────────────────┤
│  LECHE                                                   │
│  ( Entera )  ( Deslact. )  [ Avena +22 ]  ( Almendra +22)│
│                                                          │
│  TAMAÑO                                                  │
│  ( 8 oz −8 )  [ 12 oz ]  ( 16 oz +14 )                  │
│                                                          │
│  TEMPERATURA                                             │
│  [ Caliente ]  ( Frío +6 )                              │
│                                                          │
│  EXTRAS                                                  │
│  ( Extra shot +18 )  ( Vainilla +8 )  ( Sin azúcar )    │
│  ( Descafeinado )                                        │
│                                                          │
│  ⚠ Alergia: [ frutos secos ]  [ lácteos ]  [ otra… ]    │
│                                                          │
│  Nota para la barra [ ............................... ]  │
│                                                          │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│  ┃           AGREGAR          $ 72.00                ┃   │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
└──────────────────────────────────────────────────────────┘
```

**Por qué esta pantalla existe y merece este tamaño.** Porque más del 60% de las líneas del pico de
las 10:00 llevan al menos una opción, y porque **el crecimiento del ticket de una cafetería viene
de dejar que el cliente construya su bebida**, no de vender más cafés. El modificador no es un
detalle: es la palanca de ingreso del negocio. Y porque cada opción cambia la receta: "avena" no es
una nota, es otro insumo con otro costo.

**Las cuatro reglas de estructura:**

1. **Todos los grupos visibles a la vez, sin scroll, sin pasos.** Un diálogo de cuatro pasos en la
   ráfaga es un diálogo que el barista cierra y sustituye por un plumón sobre el vaso.
2. **Cada grupo tiene una opción preseleccionada** —la más vendida— marcada con corchetes. Si el
   cliente no dice nada, se toca AGREGAR y ya. Tres de cada cuatro pedidos salen así.
3. **La diferencia de precio va en el propio botón de la opción**, en pequeño. `Avena +22`. El
   barista tiene que poder decir el precio sin calcular, y el cliente tiene derecho a saber que la
   avena cuesta antes de que se lo cobren.
4. **La opción cuyo insumo se agotó se apaga sola**, en gris, con la palabra "Agotado" debajo. Es
   el equivalente exacto del producto agotado del mesero en `restaurante` y evita la misma escena:
   prometer algo que no hay.

**La alergia está aquí y no en otro lado** porque es donde se pregunta, y porque en este giro los
dos alérgenos más comunes son la leche y el fruto seco, que son precisamente los dos grupos de
arriba. La marca viaja a la tarjeta de barra en rojo y no se puede colapsar (F-316, idéntica a
`restaurante`).

**Tablet** — idéntico, botones de 56×56 px mínimo. **Teléfono** — los grupos se apilan y
Extras se colapsa tras `+ Extras (4)`, porque es el único grupo que se usa en menos del 20% de los
pedidos.

**Qué NO va aquí** — el costo del insumo, el margen, el gramaje. El barista no los ve nunca, y no
porque la pantalla no los pinte: el servidor no los manda, campo por campo (regla de
`packages/app/src/puente/mapa.ts`).

---

### PANTALLA · Cobro y propina *(dos pantallas a la vez)*

```
Propósito ......... convertir el pedido en dinero contado y dejar que el
                    cliente decida la propina sin que nadie lo mire
Frecuencia ........ 150–220 veces al día · barista + cliente
Acción principal .. COBRAR
Primero se ve ..... (barista) los cuatro métodos · (cliente) el TOTAL
Jerarquía ......... 1 método · 2 recibido y cambio · 3 el desglose
```

**Ésta es la única pantalla del sistema que se diseña dos veces**, porque se ve desde dos lados a
la vez y las dos vistas tienen destinatarios distintos.

```
TERMINAL — lo que ve el barista            SEGUNDA PANTALLA — lo que ve el cliente
┌──────────────────────────────┐           ┌──────────────────────────────────────┐
│ Mariana · para llevar        │           │                                      │
│ 1 × Latte 16 oz avena  80.00 │           │              TOTAL                   │
│ 1 × Croissant          48.00 │           │           $ 118.00                   │
│ Combo café + pan      −10.00 │           │                                      │
│                              │           │       ¿Quieres dejar propina?        │
│  [ EFECTIVO ]  [ TARJETA ]   │           │                                      │
│  [ TRANSFER ]  [ MIXTO   ]   │           │   ┌────┐  ┌────┐  ┌────┐  ┌──────┐  │
│                              │           │   │ $5 │  │$10 │  │$15 │  │ Otro │  │
│  Recibido  [ $ 200.00 ]      │           │   └────┘  └────┘  └────┘  └──────┘  │
│  Cambio         $ 82.00      │           │                                      │
│                              │           │        ┌──────────────────┐          │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━┓  │           │        │   Sin propina    │          │
│  ┃   COBRAR    F12        ┃  │           │        └──────────────────┘          │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━┛  │           │                                      │
└──────────────────────────────┘           └──────────────────────────────────────┘
```

**Las cinco reglas de la segunda pantalla (F-249), y ninguna es de estética:**

1. **El barista nunca toca la propina.** No hay control de propina en la terminal. Si la segunda
   pantalla no está conectada, aparece un respaldo en la terminal y **se marca
   `propina_origen: 'barista'`**, para que en los reportes se pueda distinguir lo que eligió el
   cliente de lo que tecleó el empleado.
2. **"Sin propina" está en la misma fila y del mismo tamaño** que las demás opciones. No es un
   enlace abajo a la izquierda. La propina es voluntaria por ley, y una pantalla que esconde la
   salida no es voluntaria en la práctica.
3. **Importes en pesos, no en porcentajes.** $5, $10, $15. Sobre un ticket de $118 un 15% son
   $17.70, y nadie deja $17.70 en un mostrador. Un botón que dice "18%" hace que el cliente busque
   la salida sin leer lo demás. Uno que dice "$10" se toca.
4. **La pantalla no enseña el desglose fiscal.** Sólo el total. Un cliente parado con fila detrás no
   quiere ver subtotal e IVA; quiere ver cuánto es.
5. **Tiene un tiempo de espera de 8 segundos.** Si el cliente no toca nada, se resuelve como *sin
   propina* y el barista puede cobrar. Nadie se queda esperando a que alguien decida, y sobre todo:
   **nadie tiene que preguntarle en voz alta "¿me dejas propina?"**, que es exactamente lo que esta
   pantalla viene a evitar.

**El desglose exacto de propina por método** (F-245) sólo aparece en pago mixto con propina, con
validación de ±$0.01 y el botón deshabilitado hasta que sume. **Idéntico a `restaurante`**, y aquí
casi nunca se ve — el mixto es menos del 2% de los cobros. Se conserva porque cuando aparece es el
pedido de oficina de $780 y es cuando más duele equivocarse.

**Al cobrar pasan cuatro cosas en la misma transacción**, y o pasan todas o no pasa ninguna: se
registra el pago, se descuenta el inventario con sus modificadores y su canal, **se encola el
pedido en la barra**, y se otorgan los sellos si el cliente está identificado. Un cobro sin pedido
encolado es un cliente que pagó y no existe.

**Tablet** — la segunda pantalla se sustituye por **girar la tablet hacia el cliente**, que es lo
que hace hoy todo el mundo con Square y con Clip. Funciona y es peor: el barista tiene que soltar
y girar. Se soporta y se recomienda la terminal de dos pantallas en la configuración inicial.
**Teléfono** — no hay segunda pantalla. Respaldo en la misma pantalla, marcado como tal.

---

### PANTALLA · Barra *(la fila de despacho — F-328)*

```
Propósito ......... saber qué hay que preparar, en qué orden, y avisarle al
                    cliente que ya está
Frecuencia ........ permanente. Es un tablero, no una pantalla que se abre
Acción principal .. MARCAR LISTO Y LLAMAR  (un solo botón, dos verbos)
Primero se ve ..... los nombres, enormes
Jerarquía ......... 1 el nombre · 2 la bebida y sus opciones · 3 el tiempo
                    esperando · 4 el canal
```

**Layout en monitor de barra (≥1280) — es el layout principal**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ BARRA                                     ⏱ prom. 2:10      🔊   10:14  │
├───────────────────────────────────────┬─────────────────────────────────┤
│ EN LA FILA                        (3) │ LISTOS                      (2) │
├───────────────────────────────────────┼─────────────────────────────────┤
│ ┌───────────────────────────────────┐ │ ┌─────────────────────────────┐ │
│ │ MARIANA              🥤 para llev.│ │ │ DIEGO           ☕ aquí      │ │
│ │ 1:42                              │ │ │ listo hace 0:35             │ │
│ │                                   │ │ │                             │ │
│ │ Latte 16 oz · AVENA               │ │ │ Americano 12 oz             │ │
│ │ Croissant                         │ │ │                             │ │
│ │                                   │ │ │  [ 🔔 LLAMAR OTRA VEZ ]     │ │
│ │ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │ │ │  [ ENTREGADO ]              │ │
│ │ ┃    LISTO Y LLAMAR            ┃  │ │ └─────────────────────────────┘ │
│ │ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │ │ ┌─────────────────────────────┐ │
│ │ ⋯ merma · rehacer · ticket        │ │ │ SOFÍA           🥤 para llev.│ │
│ └───────────────────────────────────┘ │ │ listo hace 4:10  🔔🔔 (2)   │ │
│ ┌───────────────────────────────────┐ │ │ Cold brew 16 oz             │ │
│ │ ⚠ JUAN PABLO         ☕ aquí      │ │ │  [ 🔔 LLAMAR OTRA VEZ ]     │ │
│ │ 0:48    ⚠ ALERGIA: frutos secos   │ │ │  [ ENTREGADO ] [ nadie vino ]│ │
│ │ Matcha latte · deslactosada       │ │ └─────────────────────────────┘ │
│ └───────────────────────────────────┘ │                                 │
├───────────────────────────────────────┴─────────────────────────────────┤
│ Entregados hace un momento:  Regina ↩   ·   Luis ↩                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Por qué dos columnas y no tres, como la cocina de `restaurante`.** Porque el estado "preparando"
dura lo que tarda en cruzarse la vista. Con dos personas y noventa segundos por bebida, el barista
toma la tarjeta y la termina sin soltar: obligarlo a marcar "inicié" y luego "terminé" son dos
toques donde hace falta uno, ciento sesenta veces al día. La transición a *preparando* ocurre
igual, sola, cuando la tarjeta llega al primer lugar de la fila, y sirve para el reloj — pero no
cuesta un toque.

**Por qué el nombre es lo más grande de la pantalla, por encima de la bebida.** Porque el nombre es
lo que se grita. La bebida ya la sabe quien la está haciendo: la tiene en la mano. Lo que hay que
poder leer de reojo, desde el otro lado de la barra, entre vapor y con lentes empañados, es a quién
se le grita. Es exactamente el mismo razonamiento por el que en `restaurante` el número de mesa es
lo más grande — aplicado a una operación donde el destinatario tiene nombre en vez de número.

**Por qué el botón dice dos verbos.** *LISTO Y LLAMAR*. Marcar listo sin llamar deja al cliente
parado mirando su propio vaso en la ventana, que es la peor escena posible del giro y pasa todos
los días. Separarlos en dos botones garantiza que alguien haga sólo el primero. Llamar sin marcar
listo no tiene sentido. Un botón, dos efectos, y el efecto visible para el cliente es inmediato:
su nombre se enciende en la pantalla de recogida y una voz lo dice.

**La tercera zona, abajo, de una línea.** *Entregados hace un momento*, con una flecha de deshacer.
Dura sesenta segundos por pedido. Existe porque el error más frecuente de esta pantalla es marcar
entregado el de arriba en vez del de abajo, y porque deshacer tiene que costar menos que corregir.

**El reloj de cada tarjeta mide desde el COBRO, no desde el inicio de la preparación.** Es lo que
está viviendo el cliente. Ámbar a los 4 minutos, rojo a los 6. Y el promedio del turno vive en el
encabezado, porque bajar el tiempo de servicio de tres a dos minutos permite atender **50% más
gente en la misma hora** — que en una ráfaga de cuatro horas y media es medio negocio.

**Los dos contadores de llamado.** `🔔🔔 (2)` junto al tiempo. Al tercer llamado aparece el botón
**[ nadie vino ]**, que marca el pedido `no_recogido` y lo manda al corte con su costo. Antes del
tercero, ese botón no existe: ofrecer "nadie vino" al primer llamado invita a usarlo.

**Layout en tablet (768–1279)** — las dos columnas siguen cabiendo, tarjetas compactas. Es el caso
real de Café Jacaranda: una tablet montada en un brazo sobre la barra.
**Layout en teléfono (<768)** — una sola columna con dos pestañas `En la fila (3) · Listos (2)`.
**Sobrevive entera**, porque cuando hay una sola persona en el turno vespertino, la barra vive en
el teléfono del bolsillo del mandil.

**Estados**

```
Vacío ............. "La fila está vacía." con el tipo más grande de la
                    pantalla, y debajo, chiquito: "Buen momento para
                    reponer leche." Es la única pantalla donde el vacío es
                    una buena noticia y una oportunidad, y debe verse así
Cargando .......... esqueletos con la forma de las tarjetas
Refresco .......... cada 2 segundos, sin parpadeo. Una tarjeta nueva entra
                    por abajo y NUNCA reordena lo que hay arriba: el
                    barista está a punto de tocar el botón de la primera
Aviso sonoro ...... al llegar un pedido nuevo. Suena en la barra aunque la
                    caja esté al lado, porque en la ráfaga el barista está
                    de espaldas
Alergia ........... rojo, con icono, dentro de la tarjeta, imposible de
                    colapsar. Idéntico a `restaurante` (F-316)
Sin permiso ....... la barra ve el total del pedido —es la caja— pero NUNCA
                    costo, margen ni gramaje. Se declara por campo en el
                    puente, no por pantalla
```

**Qué NO va aquí** — el catálogo, el cobro, los reportes, el inventario en números. Y **no va el
nombre completo del cliente aunque esté identificado**: se enseña el nombre de pila y nada más.
Una pantalla de barra visible desde el salón que muestre "Mariana Gutiérrez · 55 1234 5678" es una
fuga de datos personales delante de quince desconocidos.

---

### PANTALLA · Recogida *(la que mira el cliente — F-329)*

```
Propósito ......... que la persona que está parada sepa que lo suyo ya está
Frecuencia ........ permanente · la mira todo el mundo, no la opera nadie
Acción principal .. ninguna. Es una salida, no una interfaz
Primero se ve ..... los nombres listos, enormes
Jerarquía ......... 1 el nombre que acaba de salir · 2 los otros listos
```

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│                     LISTO                             │
│                                                       │
│                   D I E G O                           │
│                                                       │
│                                                       │
│           También listos:   SOFÍA    ·   REGINA       │
│                                                       │
│                                                       │
│                              Café Jacaranda           │
└───────────────────────────────────────────────────────┘
```

**Es la única pantalla del sistema dirigida a alguien sin sesión, sin dispositivo y sin idea de que
existe un punto de venta.** Eso la saca de todas las reglas normales:

- **Tipografía enorme**, mínimo 96 px para el nombre destacado, legible a cinco metros y de reojo.
- **Sin navegación, sin menú, sin barra lateral, sin logo grande, sin promociones.** Una pantalla
  de recogida con publicidad es una pantalla que la gente deja de mirar.
- **No es táctil.** Si el monitor es táctil, se desactiva la entrada. Nadie debe poder cambiar
  nada desde el salón.
- **El nombre que acaba de salir se queda destacado 20 segundos** y luego baja a la fila de "también
  listos". Veinte segundos es lo que tarda alguien en levantar la vista del teléfono, oír su nombre
  por segunda vez y caminar.
- **Se acompaña siempre de voz**, porque medio salón está mirando el teléfono. El texto y el sonido
  van juntos: nada depende sólo de uno de los dos.
- **Contraste altísimo** y tema claro fijo, aunque el resto del sistema esté en oscuro: esta
  pantalla se ve contra una ventana con sol a las ocho de la mañana.

**Layout único.** No tiene versión de tablet ni de teléfono porque no tiene sentido: es un monitor
colgado o parado sobre la barra. **Si el negocio no tiene monitor**, la función degrada a voz más
el llamado del barista, y se dice en la configuración con esas palabras: *"Sin pantalla de
recogida, se llama por voz. El sistema sigue midiendo los llamados."*

**Estado sin conexión** — la pantalla mantiene los últimos nombres y muestra un punto gris
discreto en la esquina. Nunca se pone en blanco ni enseña un error técnico: quien la lee es un
cliente, no un operador.

---

### PANTALLA · Turno *(caja)*

```
Propósito ......... abrir el turno, mover dinero y cerrarlo
Frecuencia ........ 4–8 veces al día · barista y dueña
Acción principal .. depende del estado: ABRIR TURNO o CERRAR TURNO
Primero se ve ..... el estado del turno y los tres botones
Jerarquía ......... 1 estado · 2 acciones de caja · 3 resumen · 4 historial
```

Cuatro pestañas: **Resumen · Movimientos · Gastos · Historial**. El corte de turno **cierra la
sesión**, a diferencia de `restaurante` — la razón está en `02-DINERO-Y-CAJA.md` §8.4 y no se
repite.

**La apertura pide el fondo desglosado por denominación** (monedas / billetes de $20 y $50 /
billetes de $100 y más), no un importe global. Es lo que permite el aviso de cambio bajo, que es el
indicador exclusivo de este giro. En tablet y teléfono los tres campos se apilan y cada uno tiene
su teclado numérico grande.

**El movimiento más frecuente tiene su propio botón grande**: `+ Entrada de cambio`, arriba, al
lado de la apertura. Los demás —retiro, gasto, entrada general— viven detrás de `Movimientos`.
Ponerlos todos al mismo nivel haría que el que se usa ocho veces al día costara lo mismo que el que
se usa una vez por semana.

**Qué NO va aquí** — el catálogo, la barra, el inventario. Y no va la propina como cifra suelta: el
bote se cuenta en el cierre, no se mira durante el turno. Un bote visible todo el día es un bote que
se mira todo el día.

---

### PANTALLA · Cierre de turno y arqueo

```
Propósito ......... cerrar el turno, saber si cuadró, y repartir el bote
Frecuencia ........ 2 veces al día · barista saliente y dueña
Acción principal .. CERRAR TURNO
Primero se ve ..... los dos campos de conteo, vacíos
Jerarquía ......... 1 conteo de efectivo · 2 conteo del bote · 3 resumen ·
                    4 reparto
```

El orden de las secciones en pantalla es el mismo del PDF, deliberadamente: quien cierra ya sabe
cómo se lee el documento antes de generarlo.

```
1  CONTEO — los dos, primero, vacíos y con el foco puesto
     ┌──────────────────────────────────────────────────┐
     │  Efectivo contado en el cajón *   [ $ ______ ]   │
     │  Bote de propina contado *        [ $ ______ ]   │  ← DOS
     │  Dinero que dejas en caja         [ $ ______ ]   │
     │    · de eso, en cambio            [ $ ______ ]   │
     └──────────────────────────────────────────────────┘
     ... y HASTA ENTONCES aparecen los dos esperados y los dos semáforos

2  RESUMEN DEL TURNO (SIN PROPINAS)
     Ventas · Tickets · Ticket promedio · Bebidas · Comisión estimada ·
     Costo · Utilidad bruta · Margen · Gastos · Utilidad neta estimada

3  BEBIDAS POR CANAL
     Aquí / Para llevar / Plataforma, con su empaque consumido

4  BOTE Y REPARTO
     Total a repartir, y debajo cada persona con sus horas y su importe.
     Con un botón [ Confirmar reparto ] que escribe la liquidación y
     genera el movimiento de salida de caja

5  MERMA DE BARRA DEL TURNO
     Sus cuatro motivos, con su costo
```

**Los dos arqueos a ciegas son la regla que define esta pantalla.** Los campos van primero, vacíos,
con el foco en el primero. Los esperados no se enseñan antes. Si se enseñaran, se teclearía ese
número y el arqueo dejaría de existir como control. Regla 1 de `04-SISTEMA-DE-DISENO.md` §5,
idéntica en los 78 — con la diferencia de que aquí se aplica **dos veces**, a dos recipientes
físicos distintos.

**El bloqueo por pedidos sin entregar.** Antes de dejar cerrar, el sistema busca pedidos en la fila
y, si hay, abre un diálogo con la lista: nombre, bebida, hora de cobro, minutos esperando. Tres
salidas y sólo tres: entregarlo, marcarlo *nadie vino*, o devolverlo. Se verifica dos veces, al
abrir el diálogo y justo antes de ejecutar, porque en los dos minutos del conteo alguien puede
cobrar un café. **F-262.**

**El reparto del bote se confirma delante de las personas del turno.** El botón dice *Confirmar
reparto* y no *Guardar*, porque lo que pasa después es que se cuentan billetes sobre la barra. Al
confirmarlo se imprime o se enseña la tabla con las horas de cada quien, que es el argumento
completo y no necesita que nadie lo explique.

**Al terminar, el PDF se descarga solo.** La dueña lo lee en el teléfono camino a casa.

**Tablet y teléfono** — una sola columna, secciones colapsables, los dos campos de conteo fijos
arriba. **El teléfono importa aquí**: hay dueñas que cierran desde el teléfono mientras el barista
cuenta.

---

### PANTALLA · Inventario

```
Propósito ......... saber qué hay, cuántos días alcanza y qué se fue
Frecuencia ........ 2–4 veces al día · barista y dueña
Acción principal .. CONTAR LECHE (al cierre) · AJUSTAR (el resto del día)
Primero se ve ..... lo que no llega a la próxima entrega, arriba de todo
Jerarquía ......... 1 alertas por días · 2 la lista por familia · 3 buscador
```

**Ordenada por urgencia y agrupada por familia**, no alfabéticamente: **Leche · Café · Empaque ·
Ingredientes · Alimentos**. Las familias son las mismas por las que se cuenta (`03-INVENTARIO.md`
§6), y por la misma razón: nadie recorre un inventario en orden alfabético, lo recorre caminando.

**La columna que no tiene `restaurante`: "días que alcanza".** Es el primer número después del
nombre, antes de la existencia. `Leche entera · 1.5 días · 14 L` se lee de un golpe; `Leche entera
· 14 L · mínimo 20 L` obliga a restar. El cálculo usa el consumo teórico del mismo día de la semana
de las últimas cuatro semanas, porque un martes no consume como un sábado.

**El conteo de leche tiene su propio botón grande y su propia pantalla de noventa segundos**,
separada del inventario físico completo. Al terminar enseña las tres cosas juntas —contado,
teórico y **porcentaje de merma con semáforo**, verde bajo 8%, ámbar de 8 a 12%, rojo arriba de
12%— sin ir a ningún otro lado. Si el porcentaje de merma viviera en un reporte, nadie lo vería
nunca.

**La tarjeta del grano abierto** (F-157) va arriba, con la fecha de tueste y los días
transcurridos, en ámbar a los 25 días y en rojo a los 30. La recomendación es de uso, no de
tirar: *"27 días. Sirve para filtrado; para espresso ya cayó."*

**PC**: tabla densa por familia. **Tablet**: tarjetas de dos columnas, para leerse caminando con
una mano. **Teléfono**: una columna, y el ajuste con `+` y `−` grandes.

**Qué NO va aquí** — el costo del insumo si el rol es barista sin permiso de costos. Lo decide el
servidor, campo por campo.

---

### PANTALLA · Recetas

```
Propósito ......... decir de qué está hecha cada bebida, con sus variantes,
                    y cuánto deja
Frecuencia ........ ráfagas: 40 veces en dos días al configurar, 2 al mes
                    después · dueña
Acción principal .. AGREGAR INGREDIENTE
Primero se ve ..... la lista de productos con su margen y si tiene receta
Jerarquía ......... 1 el margen · 2 si tiene receta y variantes · 3 el precio
```

Filas expandibles. Al abrir una bebida aparecen sus ingredientes y, debajo, **la tabla de
variantes**, que es lo que ninguna otra plantilla necesita:

```
LATTE                                      $58.00   costo $17.20   margen 70%
  ├ Café en grano ......... 18 g ......... $ 7.20
  ├ Leche [sustituible] ... 180 ml ....... $ 5.40    ← línea sustituible
  ├ Vaso 12 oz [llevar] ... 1 pieza ...... $ 1.53    ← línea por canal
  ├ Tapa 12 oz [llevar] ... 1 pieza ...... $ 0.90
  └ Manga [llevar] ........ 1 pieza ...... $ 1.10

  VARIANTES
  ┌───────────┬────────────┬──────────┬─────────┬────────┬────────┐
  │ Opción    │ Sustituye  │ Factor   │ Precio  │ Costo  │ Margen │
  ├───────────┼────────────┼──────────┼─────────┼────────┼────────┤
  │ Entera    │ —          │ ×1       │ $58.00  │ $17.20 │  70%   │
  │ Avena     │ Leche avena│ ×1       │ $80.00  │ $26.10 │  67%   │
  │ 16 oz     │ —          │ ×1.44    │ $72.00  │ $21.80 │  70%   │
  │ 16 oz avena│Leche avena│ ×1.44    │ $94.00  │ $34.60 │  63%   │
  └───────────┴────────────┴──────────┴─────────┴────────┴────────┘
```

**Por qué la tabla de variantes es el corazón de esta pantalla.** Porque contesta la única pregunta
que la dueña no puede contestar hoy en ningún sistema: *"¿el sobreprecio de la avena cubre lo que
me cuesta la avena?"*. En el ejemplo, no del todo: el margen cae de 70% a 67% y en el 16 oz a 63%.
Verlo aquí es lo que hace que suba el precio de la avena $4 pesos, que sobre 31 lattes de avena al
día son $3,700 al mes en un negocio que gana $20,000.

**El margen se pinta con semáforo**: verde arriba de 65%, ámbar de 50 a 65%, rojo debajo de 50%.
Los umbrales son distintos a los de `restaurante` (60/40) porque el giro es distinto: una bebida
de café con food cost de 30–35% debería dar 65–70% de margen bruto, y una que dé 55% tiene un
problema. Usar los umbrales del restaurante aquí pintaría de verde bebidas que están mal.

**Las líneas de empaque se ven distintas**, con la etiqueta `[llevar]`, y su costo se suma aparte
al pie: *"costo en taza $14.77 · costo para llevar $17.20"*. Es la pantalla donde la dueña descubre
que el vaso le cuesta más que la leche.

**El campo `merma_bp` está oculto** en esta plantilla. Vale cero en el 95% de las líneas porque
aquí nada se limpia. Enseñar un campo que siempre vale cero enseña a ignorar los campos.

**Estado vacío** — *"Esta bebida no tiene receta. Sin receta no sabemos cuánto cuesta ni cuánto
ganas con ella."* + botón. El vacío explica la consecuencia.

---

### PANTALLA · Clientes y sellos

```
Propósito ......... saber quién vuelve y cuánto debe el programa de sellos
Frecuencia ........ 3–10 veces al día · barista al cobrar, dueña al revisar
Acción principal .. BUSCAR POR TELÉFONO
Primero se ve ..... el pasivo del programa, arriba, en una sola cifra
Jerarquía ......... 1 el pasivo · 2 los que están por canjear ·
                    3 los inactivos · 4 la lista completa
```

**Por qué el pasivo va arriba y no la lista de clientes.** Porque es la única cifra del módulo que
dispara una decisión de la dueña: *"1,840 sellos pendientes · $4,100 si se canjean todos"* decide
si la promoción se sostiene o se cambia a nueve sellos en vez de cinco. La lista de clientes, en
cambio, no dispara nada: nadie va a llamar a 600 personas.

**Los tres bloques que sí disparan algo:**

| Bloque | Decisión |
|---|---|
| **Pasivo de sellos** | Si la promoción es sostenible o hay que estirarla |
| **A un sello del premio (n)** | A quién vale la pena decirle *"te falta uno"* cuando pase |
| **Clientes que no vienen hace 21 días** | A quién mandarle un mensaje. En una cafetería de barrio 21 días es mucho: el cliente de café viene dos o tres veces por semana o no viene |

**En el cobro, el cliente se identifica con el teléfono y nada más.** Diez dígitos, sin nombre, sin
correo, sin fecha de nacimiento. Cualquier campo de más en la ráfaga es un campo que no se llena.
El nombre se captura solo la primera vez, porque ya se tecleó arriba para el vaso.

**PC**: tabla densa. **Tablet y teléfono**: sólo los tres bloques y el buscador; la lista completa
se esconde, porque nadie audita 600 clientes en 375 px.

**Qué NO va aquí** — campañas, segmentos, cumpleaños, correo. Todo eso es F-950 y siguientes, es
transversal a los 78, y meterlo aquí convertiría un módulo de tres cifras útiles en un CRM que
nadie va a mantener.

---

### PANTALLA · Productos · Compras · Menú público · Configuración

Pantallas de fondo: se usan en el valle de la tarde, se tocan con calma, y pueden permitirse
formularios.

- **Productos** — rejilla de tarjetas con imagen, precio, costo, margen y **familia** (bebida /
  alimento / grano). Dos campos que `restaurante` no tiene y aquí son centrales: **grupos de
  opciones asignados** —es lo que decide si al tocar la bebida se abre el diálogo de opciones— y
  **tasa de impuesto**, porque el grano en bolsa va al 0% y la bebida al 16%.
- **Compras** — cabecera + líneas, con las **plantillas de compra recurrente arriba de todo**,
  porque el pedido de leche del martes es siempre el mismo. Se usa **en tablet, de pie, en la
  puerta, a las 6:45 con el repartidor esperando**: campos grandes, orden proveedor → líneas →
  total → pago. Un campo propio: **fecha de tueste** en las líneas de café (F-157), que es el
  único dato extra de esta plantilla en toda la recepción.
- **Menú público (QR)** — tres pestañas: Menú, Pedido anticipado, Configuración. **No hay pestaña
  de mesas**, que es la primera de `restaurante`: el QR aquí se pega en la barra, en la puerta y en
  el vaso, no en una mesa. La impresión del código es tamaño media carta, porque se lee a medio
  metro en la fila, no a un metro desde una silla.
- **Configuración** — siete pestañas: Identidad, Operación, Usuarios, **Opciones de bebida** (el
  editor de grupos de modificadores, que en esta plantilla es una pestaña propia y en `restaurante`
  vive dentro de Productos), Datos, Integraciones, Mantenimiento. **No hay pestaña de Mesas.**

---

### PANTALLA · Menú público y pedido anticipado *(F-922 + F-330)*

```
Propósito ......... que el cliente vea el menú en la fila, y que el de
                    oficina pida antes de llegar
Frecuencia ........ 20–60 veces al día el menú · 0–10 el pedido anticipado
Acción principal .. VER EL MENÚ · (si está activo) PEDIR PARA RECOGER
Primero se ve ..... las bebidas con foto y precio
Jerarquía ......... 1 el menú · 2 la hora de recogida · 3 el carrito
```

**Es una pantalla de teléfono y sólo de teléfono.** Se diseña a 375 px y no se deriva a nada:
nadie escanea un QR desde una PC.

**En qué se distingue del portal de `restaurante` (F-921), que ya existe:**

| En `restaurante` (F-921) | Aquí (F-922) | Por qué |
|---|---|---|
| El QR está pegado **en una mesa** y el token identifica esa mesa | El QR está en la barra, la puerta y el vaso, y **no identifica nada**: es el mismo para todos | No hay mesa que identificar. El token es del negocio, no de un lugar |
| Tres solicitudes: ordenar, pedir la cuenta, pedir ayuda | **Ninguna solicitud.** No hay a quién llamar: el barista está a dos metros | Un botón "necesito ayuda" en un local de 45 m² es absurdo y se nota |
| El pedido se suma a una cuenta abierta y se paga al final | El pedido **se paga al hacerlo** y lleva **hora de recogida** | E1.1 contra E1.2. Y sin pago por adelantado, el pedido anticipado se convierte en una lista de gente que no vino |
| Se prepara cuando llega la comanda | Se prepara **calculando hacia atrás desde la hora prometida** | Un latte hecho a las 7:55 para las 8:15 ya no es un latte. La bebida entra a la fila de barra tres minutos antes de la hora, no antes |
| Valoración con cinco emojis al final | La misma (F-952, `[=]`) | Se cita y no se rehace |

**La hora de recogida es el único control de la pantalla**, y se ofrecen huecos de cinco minutos
con capacidad limitada: si a las 8:15 ya hay seis bebidas anticipadas, el hueco se cierra y se
ofrece 8:20. Sin ese límite, el pedido anticipado destruye la ráfaga en vez de aliviarla — le
mete a la barra ocho bebidas a la vez en el minuto de más trabajo del día.

**Si no hay pasarela de pago (F-215 está apagada)**, F-330 arranca en modo *"pide y paga al
recoger"*, que es peor —hay gente que no llega— y funciona. Se dice y no se esconde.

**Estados** — sin conexión: *"Sin internet. Pide en la barra."* Fuera de horario: *"Abrimos a las
7:00. Puedes ver el menú."* Nunca un error técnico: quien lo lee es un cliente.

---

## 4.4 · EL DASHBOARD

**La regla que lo gobierna:** cada indicador existe porque **hay una decisión que la dueña toma al
verlo**. Si no se puede nombrar la decisión, el indicador no va.

Se calcula **sobre el turno abierto**, no sobre el día natural. Sin turno abierto, todo está en
cero a propósito y un banner lo explica. Y hay un dato de honestidad que cambia el diseño entero:

> **A las ocho de la mañana nadie mira el dashboard.** Es la hora de más trabajo del día. Las
> pantallas que existen a esa hora son `/pos` y la barra. El dashboard se mira **a las 10:30,
> cuando baja la ráfaga, y a las 20:40, al cerrar.** Diseñarlo para esos dos momentos es
> diseñarlo bien; diseñarlo "para todo el día" es diseñarlo para nadie.

### Fila 1 · los cuatro de las 10:30

| Indicador | Decisión que dispara |
|---|---|
| **Venta de la ráfaga (07:00–10:30) contra el mismo día de la semana pasada** | Si cayó, algo pasó: abrimos tarde, hay obra en la calle, llovió, abrió algo enfrente. Es la **única franja del día que se puede comparar con sentido**, porque es la única con volumen suficiente para que la diferencia signifique algo. Compararla contra "ayer" no sirve: un martes no es un lunes |
| **Bebidas por hora en el pico** | Decide si el turno necesita un tercero mañana. Arriba de 45 bebidas por hora con dos personas, la fila se sale a la calle y se pierde gente que ni entra |
| **Tiempo promedio del cobro a la entrega** | Decide si hay que cambiar algo de la barra: el orden de las jarras, quién hace qué, si el segundo molino está mal puesto. Bajar de 3:00 a 2:00 permite atender 50% más gente |
| **Leche: días que alcanza** | Decide si hay que salir corriendo al súper hoy. **No son litros: son días**, contra la próxima entrega del proveedor |

### Fila 2 · los cinco del dinero

| Indicador | Decisión que dispara |
|---|---|
| **Efectivo en el cajón ahora** | Si a las 9:00 hay más de $6,000, se retira. El cajón está en la barra, a la vista de la calle |
| **Cambio disponible** ← exclusivo de este modelo | Decide si hay que ir al banco **hoy**. Quedarse sin monedas a las 8:00 con quince personas en fila es perder la ráfaga entera, y le pasa a todas las cafeterías de México todas las semanas. Ningún otro giro de la familia lo necesita porque ninguno cobra 160 tickets de $118 en tres horas |
| **Costo por bebida promedio** (café + leche + empaque) | Si sube de $17, o el molino está mal calibrado, o alguien sirve de más, o subió la avena y no se subió el precio. Es el número que `restaurante` no puede tener porque no vende una sola cosa doscientas veces |
| **Tarjeta del turno + comisión estimada** | Decide si vale la pena empujar la transferencia. $4,200 al mes de comisión es más que el software y casi nadie lo sabe |
| **Utilidad neta estimada del turno** | ¿Ganamos esta mañana? Verde o roja, sin medias tintas |

### Bloques de abajo

| Bloque | Decisión que dispara |
|---|---|
| **Mezcla del día: aquí / para llevar / plataforma** — barras horizontales | Decide cuántos vasos pedir, y si la plataforma vale la pena al ver su comisión al lado. Si el 70% es para llevar, el empaque es el tercer costo del negocio y no un consumible que se compra "cuando se acaba" |
| **Las diez bebidas del día ordenadas por UTILIDAD, no por unidades** | Decide qué se empuja mañana. El latte vende más; el americano deja más. Un ranking por unidades hace empujar exactamente lo que menos deja |
| **Frescura del grano abierto** | Decide si el lote de la tolva sigue sirviendo para espresso o pasa a filtrado. Arriba de 30 días el cliente lo nota antes que la dueña |
| **Merma de barra del turno** — cuatro motivos | Decide si hay que recalibrar el molino, si hay que hablar con alguien de la técnica de vaporizado, o si el número de bebidas rehechas está diciendo que la pantalla de opciones está mal |
| **Sellos: otorgados hoy · pendientes · costo si se canjean** | Decide si la promoción se sostiene |

### Qué cambia entre las 10:30 y las 20:40

| | 10:30 | 20:40 |
|---|---|---|
| **Lo que domina** | **Ráfaga contra la semana pasada**, bebidas por hora, leche en días, cambio disponible. Es hora de reaccionar: se puede comprar leche, se puede ir al banco, se puede llamar a alguien | **Utilidad, bote, merma, costo por bebida.** Es hora de cerrar y de entender el día |
| **Lo que sobra** | Utilidad neta (falta medio día), merma (apenas empieza) | Cambio disponible (ya no importa), leche en días (ya se pidió o ya no se puede) |
| **Estado** | Turno abierto, todo vivo | Turno por cerrar |

El dashboard **no reordena sus tarjetas solo**. Una pantalla que se recompone según la hora
destruye la memoria muscular, y la memoria muscular es lo que hace que la dueña lea sus números en
cuatro segundos. Lo que sí cambia es el banner de estado del turno. Esta regla se hereda de
`restaurante` y aquí aplica igual.

### Qué NO va en el dashboard de este negocio, aunque exista el dato

- **Mapa de mesas u ocupación.** No hay mesas que administrar. Si alguien reutiliza el widget de
  `restaurante`, se nota en dos segundos.
- **Propina por persona.** El bote es del turno. Un ranking de propina entre dos personas que
  hacen lo mismo es una forma barata de romper un equipo.
- **Gráfica de ventas por hora.** La dueña estuvo ahí. **Pero sí va la comparación de la ráfaga
  contra la semana pasada**, que es otra cosa: no es "a qué hora vendo" —eso lo sabe— sino "¿fue
  peor que un martes normal?", que es lo único que no puede saber estando dentro.
- **Margen global del negocio.** En una cafetería el margen que decide es el **por bebida**, no el
  del negocio. El global se mueve por la mezcla y no por nada que se pueda arreglar hoy.
- **Ticket promedio a secas.** Sube por **más bebidas por ticket**, no por bebidas más caras. Si va
  a ir, va acompañado de "bebidas por ticket", o no va. Y hoy va dentro del corte, no del tablero.
- **Ventas acumuladas históricas.** No es un indicador, es un adorno.
- **Nada de doce indicadores.** Nueve, más cinco bloques.

---

## 4.5 · MULTI-SUCURSAL

Una cafetería con dos sucursales es una dueña con dos barras y un encargado en cada una. No es un
corporativo, y a diferencia de un restaurante, **las dos suelen ser casi idénticas**: misma carta,
mismo tostador, mismo proveedor de leche.

**Qué se separa, siempre**

| Cosa | Por qué separada |
|---|---|
| **Turnos, cajas y cortes** | Un cajón por local. Un corte consolidado no cuadra contra ningún cajón físico |
| **Fila de barra y pantalla de recogida** | Obvio: son personas paradas en un lugar concreto |
| **Inventario y conteo de leche** | La leche está en un refrigerador, no en los dos |
| **Bote de propina y su reparto** | Se gana y se reparte donde se trabajó |
| **Nombre del pedido** | Nunca cruza: "Mariana" de la sucursal Roma no tiene nada que ver con "Mariana" de la Condesa |

**Qué se comparte**

| Cosa | Por qué compartida |
|---|---|
| **Catálogo, categorías y grupos de opciones** | Es la misma carta. Dos cartas separadas terminan con precios distintos por error |
| **Recetas y sus variantes** | El latte se hace igual en las dos |
| **Proveedores y el tostador** | Son los mismos, y el precio del grano se negocia por volumen conjunto |
| **Empleados y roles** | Un barista cubre en la otra sucursal, y sus horas del turno tienen que seguirlo para el reparto del bote |
| **El programa de sellos** ← **y esto es distinto de todo lo demás** | Los sellos se acumulan y se canjean **en cualquiera de las dos**. Es la razón por la que un cliente escoge una cadena chica sobre la de enfrente, y partirlo por sucursal mataría el programa |

**El pasivo de sellos es consolidado y las ventas no.** Es la única cifra del sistema que se
comporta así, y hay que decirlo porque es contraintuitivo: la venta pertenece al local que la hizo,
pero **la deuda del sello pertenece al negocio**, porque se puede cobrar en cualquiera de los dos.
Si el corte de una sucursal enseñara sólo "sus" sellos, la suma de los dos no sería el pasivo real.

**Precio por sucursal** (F-024): sí hace falta, y menos que en restaurante. Una sucursal en zona de
oficinas y otra de barrio no cobran igual el latte, pero la diferencia es de cinco pesos, no de
cuarenta. Se resuelve como excepción sobre el precio base.

**Qué ve un encargado contra la dueña**

```
ENCARGADO DE SUCURSAL                    DUEÑA
─────────────────────                    ─────
Su sucursal, completa                    Selector de sucursal + "Todas"
Su turno, su corte, su inventario        Todos los turnos y todos los cortes
Su bote y su reparto                     Comparativo de RÁFAGA entre sucursales
Su fila y su barra                       Comparativo de costo por bebida
Sus sellos otorgados                     El pasivo de sellos CONSOLIDADO
                                         Qué local tiene más merma de leche
NO ve: la otra sucursal
NO ve: el pasivo consolidado
```

**El consolidado que sí sirve:** venta de la ráfaga, bebidas por hora, costo por bebida, merma de
leche y tiempo de entrega, lado a lado. Contestan *"¿cuál de mis dos barras está funcionando mejor
y por qué?"*. **El que no sirve:** un corte de turno consolidado, por la misma razón que en
`restaurante` — el corte existe para cuadrar un cajón físico y no hay un cajón que junte los dos.

---

## 4.6 · ACCESIBILIDAD Y CONDICIONES REALES

Este giro se opera **de pie, con prisa, con las manos mojadas, con vapor, con ruido de molino y de
extracción, con el cliente mirando a cuarenta centímetros y con sol directo a las ocho de la
mañana**. Cada condición tiene una consecuencia medible.

| Condición real | Dónde | Qué implica |
|---|---|---|
| **Manos mojadas y con leche, todo el turno** | Barista, siempre | Objetivo táctil mínimo **56×56 px** en cobro y barra, por encima del mínimo general de 44. Y **los botones destructivos nunca pegados a los frecuentes**: *nadie vino* aparece sólo al tercer llamado, y *entregado* y *rehacer* están separados por el ancho de una tarjeta |
| **Vapor sobre la pantalla de barra** | Barra | Contraste alto obligatorio y **nada informativo por debajo de 18 px** en esa pantalla. El nombre del cliente a 48 px mínimo, y a 96 px en la de recogida |
| **Sol directo en la pantalla de recogida** | Salón, 7:00–10:00 | Tema **claro fijo** en esa pantalla, aunque el resto del sistema esté en oscuro. Contraste mínimo 7:1, no 4.5:1. Es la única excepción de tema de todo el sistema y tiene su razón: da a la calle |
| **Ruido de molino y de vaporizado** | Todo el local | El aviso sonoro de pedido nuevo **no basta**: va acompañado de cambio visual y de voz. Y el llamado al cliente va por pantalla **y** por voz, nunca sólo por uno |
| **El cliente ve la pantalla** | Terminal, siempre | Ningún costo, ningún margen y **ningún nombre completo de otro cliente** visible desde el mostrador. La segunda pantalla enseña total y propina, nada más |
| **Prisa en ráfaga, 07:00–11:30** | Cobro y barra | **Cero confirmaciones en el camino feliz.** Sólo confirma lo destructivo: cancelar, devolver, marcar *nadie vino*. Cobrar no confirma. Marcar listo no confirma. Y todo lo frecuente se puede deshacer 60 segundos |
| **Ciento ochenta cobros al día** | Cobro | Cada toque de más son 180 toques al día. Por eso el ticket no se abre en diálogo, el total vive dentro del botón, y las opciones traen preselección |
| **Dos personas, rotación alta** | Todas | Prueba del recién llegado: alguien que entró hoy y conoce el giro tiene que poder cobrar un latte con avena y marcarlo listo **sin que nadie le explique**. Si no, la pantalla está mal |
| **Daltonismo** | Todas | El color nunca es el único portador. Cada estado de la fila lleva su palabra; cada nivel de stock lleva su texto; el canal lleva icono **y** palabra |
| **Teclado en la terminal** | Cobro | Todo operable con teclado, foco visible siempre, `F12` cobrar. El barista no debería tener que soltar el teclado en la ráfaga |
| **Cifras que bailan** | Todas | Todo número de dinero en **cifras tabulares** y alineado a la derecha |
| **Nada se mueve solo debajo del dedo** | Barra, sobre todo | La fila se refresca cada 2 segundos y **una tarjeta nueva entra por abajo**: nunca reordena lo que está arriba, porque el barista tiene el dedo a punto de tocar el primer botón |
| **La pantalla de recogida no se toca** | Salón | Entrada táctil desactivada por configuración. Nadie del salón debe poder cambiar nada |
