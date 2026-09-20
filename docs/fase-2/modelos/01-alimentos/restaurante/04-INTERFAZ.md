# 04 · INTERFAZ · Restaurante de mesa

Los átomos —tipografía, color, espaciado, botón, campo, tabla, diálogo— son idénticos a los de los
otros 77 modelos y se construyen una sola vez en `packages/ui`. **Lo que cambia es la estructura
de cada pantalla**, y aquí se documenta cuál es y de dónde sale.

Dispositivo principal: **tablet** (el mesero). Secundarios: **PC** (caja y cocina) y **teléfono**
(el dueño, de noche). El layout de tablet se diseña primero; los otros dos se derivan.

---

## 4.1 · VOCABULARIO DEL GIRO

Diccionario de la plantilla `restaurante` (**F-017**). Una entidad interna, un nombre visible.
Lleva género y plural porque el español lo exige: "la mesa" y "el bahía" mal conjugado delata el
sistema en la primera pantalla.

| Entidad interna | En pantalla (singular) | Plural | Género | Nota |
|---|---|---|---|---|
| `unidad_servicio` / `mesas` | **mesa** | mesas | f | Nunca "unidad de servicio". Nadie dice eso |
| `zona` | **zona** | zonas | f | Valores vivos: Interior, Exterior, Terraza, Barra, Otro |
| `orden` | **cuenta** | cuentas | f | En la mesa se dice "cuenta". En Registros, "venta" |
| `orden_linea` | **platillo** | platillos | m | "producto" sólo en Catálogo y Registros |
| `comanda` | **comanda** | comandas | f | Palabra del giro. No "pedido de preparación" |
| `comanda_item` | **platillo de la comanda** | — | m | En la pantalla de cocina, sólo el nombre |
| `empleado_atiende` | **mesero** | meseros | m | "mesera" cuando el empleado es mujer: el género sale del registro |
| `empleado_cobra` | **cajero** | cajeros | m | |
| `estacion_preparacion` | **estación** | estaciones | f | Cocina caliente, cocina fría, barra, postres, parrilla |
| `preparacion` | **cocina** | — | f | Nombre de la pantalla y del rol |
| `cliente` | **comensal** | comensales | m | En la cuenta se captura como "cliente" sólo si se pide nombre |
| `personas` | **personas** | — | f | "¿Cuántas personas?" al abrir la mesa. Nunca "comensales" ahí: en la mesa se cuentan personas |
| `producto` | **platillo** o **bebida** | platillos / bebidas | m/f | Según su categoría. En Catálogo, "producto" |
| `insumo` | **ingrediente** | ingredientes | m | Nunca "insumo" en pantalla: en cocina se dice ingrediente |
| `receta` | **receta** | recetas | f | |
| `sesion_caja` | **caja del día** | — | f | El documento que sale es el "corte" |
| `corte_turno` | **corte de turno** | — | m | |
| `solicitud_qr` | **solicitud** | solicitudes | f | Tres tipos con nombre propio, ver abajo |

**Traducciones de estado que también cuentan** — se traducen porque es donde más se nota el
descuido:

| Estado interno | En pantalla |
|---|---|
| `libre` | Libre |
| `esperando_orden` | Esperando orden |
| `pedido_enviado` | Pedido enviado |
| `en_preparacion` | En preparación |
| `en_espera_entrega` | Esperando entrega |
| `ocupada` | Ocupada |
| `cuenta_solicitada` | Cuenta solicitada |
| `limpieza` | Limpieza |
| `ordenar` (solicitud) | Quiere ordenar |
| `cuenta` (solicitud) | Pide la cuenta |
| `ayuda` (solicitud) | Necesita ayuda |

**Estados vacíos y errores, también traducidos.** No "No hay registros": *"Todavía no hay mesas
abiertas. Toca una mesa libre para empezar."*

---

## 4.2 · NAVEGACIÓN

El orden de la barra lateral es **el orden del día de trabajo**, no el alfabético ni el del
sistema. Y cada rol ve una barra distinta porque cada rol vive un día distinto.

```
ADMINISTRADOR / DUEÑO            MESERO           CAJERO          COCINA
─────────────────────            ──────           ──────          ──────
1  Inicio (dashboard)            1  Mesas         1  Caja         1  Cocina
2  Mesas                         2  Cocina*       2  Ventas          (una sola
3  Cocina                                                            pantalla,
4  Caja                          * sólo lectura,                     a pantalla
5  Ventas                          para ver si                       completa)
6  Portal QR                       su plato ya
7  Inventario                      salió
8  Recetas
9  Productos
10 Compras
11 Registros
12 Configuración
```

**Por qué ese orden para el administrador.** Se lee de arriba a abajo como se vive el día:
primero cómo va (Inicio), luego el salón (Mesas), luego la cocina, luego el dinero (Caja, Ventas),
luego lo que entra por el QR, luego el fondo del negocio (Inventario, Recetas, Productos, Compras)
y al final lo que se consulta después de cerrar (Registros) y lo que se toca una vez al mes
(Configuración). Ordenarlo por importancia contable —Caja primero— tendría sentido en una
ferretería; aquí no, porque a las 14:00 lo que importa es el salón.

**Por qué el mesero tiene dos entradas y no doce.** Porque el mesero opera con una mano, de pie,
con prisa. Cada entrada de más en la barra es un toque equivocado en hora pico. En su tablet la
barra ni siquiera es barra: es un encabezado con dos pestañas.

**Por qué cocina no tiene barra.** Porque la pantalla de cocina ocupa el monitor entero, se mira a
dos metros de distancia y nadie navega desde ahí. Una barra lateral en cocina es espacio robado a
lo único que importa.

---

## 4.3 · CADA PANTALLA, UNA POR UNA

---

### PANTALLA · Acceso por PIN

```
Propósito ......... identificar quién está operando, en dos segundos
Frecuencia ........ 30–80 veces al día · todos los roles, todo el día
Acción principal .. TECLEAR 4 DÍGITOS
Primero se ve ..... las tarjetas de empleado, con foto y color
Jerarquía ......... 1 tarjetas · 2 teclado numérico · 3 nada más
```

**PC (≥1280)** — tarjetas de empleado en rejilla centrada, foto redonda, nombre y rol debajo. Al
tocar una, el teclado numérico aparece en su lugar, grande.
**Tablet (768–1279)** — idéntico, tarjetas más grandes. Es el caso principal.
**Teléfono (<768)** — tarjetas en dos columnas, teclado numérico a pantalla completa.

**Por qué tarjetas con foto y no un campo de usuario.** Porque el mesero no va a teclear su
nombre ocho veces al día, y porque la foto elimina el error de entrar con la sesión de otro — que
es lo que rompe la atribución de propinas. El color asignado a cada persona es el mismo que
después pinta el punto en la mesa que atiende.

```
Estado vacío ...... no existe: siempre hay al menos un empleado
Estado de error ... "PIN incorrecto. Te quedan 3 intentos."
                    Al agotarse: bloqueo temporal con el tiempo restante visible
Sin conexión ...... no se puede entrar. Se dice así, sin rodeos
Atajos ............ los dígitos del teclado físico funcionan en PC
NO va aquí ........ recuperación de contraseña, registro, "recordarme"
```

---

### PANTALLA · Mapa de mesas *(la pantalla insignia del modelo)*

```
Propósito ......... saber de un vistazo qué está pasando en todo el salón
                    y abrir o atender una mesa
Frecuencia ........ 200–400 veces al día · mesero · es SU pantalla de inicio
Acción principal .. ABRIR MESA (tocar una mesa libre)
Primero se ve ..... el plano del salón con todas las mesas y su color
Jerarquía ......... 1 el mapa · 2 las pestañas de zona · 3 las solicitudes
                    del QR · 4 la leyenda de estados
```

**Por qué un mapa y no una lista.** Porque el mesero no busca "mesa 14": busca la mesa **donde
está la gente**. Su memoria del salón es espacial, no alfabética. Un plano con las mesas en su
posición real convierte una búsqueda en un reconocimiento, y eso son dos segundos por vez, cuatro
veces por mesa, treinta mesas por turno.

**Layout en PC (≥1280)**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Mesas          [Interior] [Terraza] [Barra]        🔔 3 solicitudes │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    ┌────┐          ⬤ 4          ┌──────────┐        ⬤ 7            │
│    │ 1  │        Ocupada        │    5     │      Libre             │
│    │Libr│        Luis · 4 p.    │ En prep. │                        │
│    └────┘                       │ Ana · 6p │                        │
│                                 └──────────┘                        │
│         ⬤ 2            ┌────┐              ⬤ 8      ┌────┐         │
│      Cuenta solicit.   │ 3  │            Limpieza   │ 9  │          │
│      Ana · 2 p.   🎉   │Libr│  ⚠                    │Libr│          │
│                        └────┘                                       │
│                                                                      │
│  ● Libre  ● Esperando orden  ● Pedido enviado  ● En preparación      │
│  ● Esperando entrega  ● Ocupada  ● Cuenta solicitada  ● Limpieza     │
└──────────────────────────────────────────────────────────────────────┘
```

Alto fijo de 600 px para el plano, fondo de madera que se oscurece en tema oscuro. Cada mesa lleva
su **forma** (redonda, cuadrada, rectangular) y su **tamaño** (chica, mediana, grande) reales:
una mesa de dos no se dibuja igual que una de ocho, porque el mesero reconoce el salón por la
forma antes que por el número.

**Qué muestra cada mesa, y por qué cada cosa está donde está**

| Elemento | Posición | Por qué |
|---|---|---|
| **Número** | Centro, el texto más grande | Es lo que se grita en el salón: "la cuatro pidió cuenta" |
| **Color de fondo** | Toda la figura | El estado se lee a tres metros, sin leer texto |
| **Etiqueta del estado** | Debajo del número | El color nunca es el único portador de significado. Regla de accesibilidad, no adorno |
| **Punto de color del mesero** | Esquina superior derecha | El mesero identifica sus mesas de un barrido, sin leer nombres |
| **🎉 celebración** | Esquina superior izquierda | Para que cualquiera que pase sepa que ahí va el postre con vela |
| **⚠️ alergias** | Esquina inferior izquierda | **Es la marca más importante del mapa.** Va en esquina propia, separada de todo, porque un error aquí no es un descuadre: es una urgencia médica |
| **Nombre · N personas** | Insignia inferior | "Luis · 4 p." Sirve para el relevo de turno y para saber si cabe alguien más |

**Layout en tablet (768–1279)** — **es el layout principal.** El mismo mapa, escalado, con las
mesas al menos de 64×64 px. Las pestañas de zona pasan a ocupar el ancho completo en una fila
deslizable. El panel de solicitudes del QR se convierte en un botón flotante con contador. El
mapa se desplaza con el dedo si la zona es más grande que la pantalla.

**Layout en teléfono (<768)** — el mapa **desaparece** y se sustituye por una rejilla de tarjetas,
dos por fila, ordenadas por estado: primero las que necesitan algo (cuenta solicitada, esperando
entrega), después las ocupadas, al final las libres. **Por qué se abandona el mapa en teléfono:**
porque un plano de treinta mesas en 375 px de ancho no es un plano, es un mosaico ilegible, y
porque quien usa el teléfono es el dueño mirando desde afuera, no el mesero caminando el salón.
El orden por urgencia le da en la primera pantalla lo único que quería saber.

**Estados**

```
Vacío ............. "Todavía no hay mesas configuradas."
                    + botón [ Crear mi primer mapa de mesas ] que lleva
                      directo al editor. El vacío enseña, no se disculpa
Cargando .......... esqueletos con la forma y posición reales de las mesas,
                    no un spinner. La pantalla no salta al cargar
Error ............. banda roja arriba, el mapa se queda con el último dato
                    conocido y en gris. Nunca se vacía la pantalla por un
                    error de red: el mesero prefiere un dato de hace 10
                    segundos que una pantalla en blanco
Sin permiso ....... el rol cocina no llega aquí; su ruta de inicio es /cocina
Sin conexión ...... banda ámbar "Sin conexión. Reintentando…" y las acciones
                    de escritura se deshabilitan. Leer sigue funcionando
```

**Atajos** — ninguno. Esta pantalla es de dedo, no de teclado, y meter atajos aquí sería
diseñarla para un dispositivo que no es el suyo.

**Qué NO va aquí, aunque el sistema lo tenga** — totales del día, ventas, márgenes, costos,
reportes, configuración. El mesero no debe ver dinero del negocio. Lo único monetario que aparece
es el total de la cuenta que está atendiendo, y sólo dentro de la mesa.

---

### PANTALLA · Mesa activa *(la comanda)*

```
Propósito ......... levantar el pedido de una mesa y mandarlo a cocina
Frecuencia ........ 80–200 veces al día · mesero
Acción principal .. ENVIAR A COCINA
Primero se ve ..... el catálogo de platillos y, a la derecha, lo que ya
                    lleva la mesa
Jerarquía ......... 1 botón Enviar a Cocina · 2 el pedido actual ·
                    3 la búsqueda y las categorías · 4 el total
```

Se abre desde el mapa y ocupa toda la pantalla. No es una pantalla nueva: es la mesa, abierta.

**Layout en PC (≥1280)**

```
┌───────────────────────────────────────────────────────────────────────┐
│ ← MESA 5    En preparación   6 personas   Familia López   🎉  ⚠       │
├─────────────────────────────────────┬─────────────────────────────────┤
│ [ Buscar platillo...          🔍 ]  │  ► LISTOS PARA RECOGER (2)      │
│ (Todos)(Entradas)(Fuertes)(Bebidas) │    Sopa azteca · Ensalada       │
│                                     ├─────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐    │  PEDIDO ACTUAL                  │
│ │Arrach. │ │Tacos   │ │Sopa    │    │  2 × Arrachera        560.00    │
│ │ 289.00 │ │ 165.00 │ │  95.00 │    │  1 × Sopa azteca       95.00    │
│ └────────┘ └────────┘ └────────┘    │  ─────────────────────────      │
│ ┌────────┐ ┌────────┐ ┌────────┐    │  AGREGAR AL PEDIDO              │
│ │Cerveza │ │Agua    │ │Flan    │    │  1 × Cerveza clara     65.00    │
│ │  65.00 │ │  45.00 │ │  85.00 │    │                                 │
│ └────────┘ └────────┘ └────────┘    │  [ Nota para cocina...      ]   │
│                                     │                                 │
│                                     │  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│                                     │  ┃    ENVIAR A COCINA       ┃   │
│                                     │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│                                     │  TOTAL              $ 720.00    │
│                                     │  [    Solicitar cuenta     ]    │
└─────────────────────────────────────┴─────────────────────────────────┘
```

**La decisión de diseño que manda en esta pantalla: "Pedido actual" y "Agregar al pedido" son dos
bloques separados.** Lo que ya se mandó a cocina no se puede confundir con lo que se está por
mandar. Si fueran una sola lista, el mesero volvería a enviar platillos ya enviados —el error más
caro del turno, porque sale comida que nadie pidió y nadie va a pagar.

**"Listos para recoger" va arriba de todo, antes que el catálogo.** Porque cuando el mesero abre
la mesa 5 para agregar un postre, lo primero que tiene que saber es que hay dos platos esperando
en la ventana desde hace tres minutos. Es información que caduca.

**Los precios se ven, pero en segundo plano.** El mesero necesita saber cuánto cuesta para poder
sugerir, pero el precio no puede competir visualmente con el nombre del platillo: lo que se busca
es el platillo.

**Layout en tablet (768–1279)** — **el layout principal.** Catálogo a pantalla completa con las
tarjetas más grandes (mínimo 88×88 px de zona de toque). El pedido actual se colapsa a un **botón
flotante** abajo a la derecha, en el camino del pulgar, con el contador y el total: `3 · $720.00`.
Al tocarlo sube una hoja desde abajo con el pedido, la nota y el botón de enviar, ocupando el 70%
de la pantalla. **Por qué una hoja desde abajo y no un panel lateral:** porque el mesero sostiene
la tablet con la izquierda y opera con el pulgar derecho, y el borde inferior derecho es lo único
que alcanza sin recolocar la mano.

**Layout en teléfono (<768)** — igual que la tablet, con las tarjetas del catálogo en dos
columnas. Sobrevive todo; se esconde sólo el bloque de "Listos para recoger", que pasa a una
insignia en el encabezado.

**Estados**

```
Vacío (mesa recién abierta)
    "Mesa 5 abierta para 6 personas. Toca un platillo para empezar."
    + el foco ya puesto en la búsqueda si hay teclado físico
Vacío (categoría sin productos)
    "No hay platillos en esta categoría." + enlace a Productos si el rol
    tiene permiso
Producto agotado
    La tarjeta se ve en gris con la etiqueta "Agotado" y NO se puede tocar.
    Esto evita la escena de cancelar el platillo en la mesa
Enviando ......... el botón pasa a "Enviando…" y se deshabilita. Clave de
                   idempotencia por envío: dos toques no mandan dos comandas
Error al enviar .. diálogo rojo, explícito: "La comanda NO llegó a cocina.
                   Vuelve a intentar." Nunca se traga el error: una comanda
                   perdida en silencio es un plato que nunca sale
Mesa huérfana .... mesa ocupada sin cuenta viva → diálogo de reparación con
                   dos salidas: recuperar la cuenta o liberar la mesa
```

**Qué NO va aquí** — costos, márgenes, inventario en números, descuentos (el mesero no descuenta),
reportes. Y **no va el cobro**: el mesero no cobra. Esa separación es control interno, no
capricho de interfaz.

---

### PANTALLA · Precuenta

```
Propósito ......... entregarle al comensal lo que va a pagar, para que lo
                    revise antes de pagarlo
Frecuencia ........ 40–100 veces al día · mesero
Acción principal .. IMPRIMIR
Primero se ve ..... el ticket completo, tal como va a salir
Jerarquía ......... 1 el total · 2 el código para caja · 3 las líneas
```

Formato térmico de 58 u 80 mm. Encabezado: **PRE-CUENTA** (nunca "ticket"). Folio, mesa, líneas
con cantidad y precio, subtotal, IVA, propina si ya se decidió —o *"Propina: a definir en caja"*
si se difirió—, **TOTAL**, y abajo un bloque con el **CÓDIGO PARA CAJA** en tipografía grande y
monoespaciada: `M05-4821`.

**Por qué el código y no el número de mesa.** Porque el comensal camina a la caja con el papel en
la mano y el cajero necesita encontrar esa cuenta entre veinte pendientes, sin ambigüedad. El
número de mesa se reutiliza cinco veces por noche; el código es de esa cuenta.

**Por qué la precuenta no es el ticket.** Porque no se ha cobrado nada. Un documento que dice
"TICKET" sobre algo no pagado es la puerta exacta por la que se escapa una cuenta: el comensal
cree que ya pagó, el mesero cree que la caja cobró, y nadie cobró.

En pantalla se ve exactamente como se va a imprimir, a tamaño real, con un solo botón
**Imprimir**. Sin conexión con la impresora: *"No se pudo imprimir. Puedes enseñar esta pantalla
al comensal y llevarlo a caja con el código M05-4821."* La salida alterna existe porque el
servicio no se detiene porque falle una impresora.

---

### PANTALLA · Cocina

```
Propósito ......... saber qué hay que preparar, en qué orden, y avisar que
                    ya está
Frecuencia ........ permanente. Es un tablero, no una pantalla que se abre
Acción principal .. MARCAR LISTO
Primero se ve ..... las tres columnas, llenas
Jerarquía ......... 1 las comandas nuevas · 2 las que están en preparación ·
                    3 las listas esperando a que las recojan
```

**Layout en PC (≥1280) — es el layout principal de esta pantalla**

```
┌─────────────────────────────────────────────────────────────────────┐
│ COCINA — Parrilla                                      🔊  22:14    │
├──────────────────┬──────────────────────┬───────────────────────────┤
│ 🕐 NUEVOS   (3)  │ 🔥 EN PREPARACIÓN(4) │ ✅ LISTOS            (2)  │
├──────────────────┼──────────────────────┼───────────────────────────┤
│ ┌──────────────┐ │ ┌──────────────────┐ │ ┌───────────────────────┐ │
│ │ MESA 5       │ │ │ MESA 12          │ │ │ MESA 3                │ │
│ │ hace 1 min   │ │ │ hace 9 minutos   │ │ │ hace 1 minuto         │ │
│ │              │ │ │                  │ │ │                       │ │
│ │ 2 Arrachera  │ │ │ 1 Pescado zaran. │ │ │ 1 Sopa azteca         │ │
│ │   término ½  │ │ │ 2 Tacos de rib   │ │ │ 1 Ensalada            │ │
│ │ 1 Sopa       │ │ │                  │ │ │                       │ │
│ │              │ │ │ ⚠ ALERGIA: nuez  │ │ │ [ Quitar de la lista ]│ │
│ │ [ INICIAR  ] │ │ │ [ MARCAR LISTO ] │ │ └───────────────────────┘ │
│ └──────────────┘ │ └──────────────────┘ │                           │
└──────────────────┴──────────────────────┴───────────────────────────┘
```

Tres columnas de ancho igual. Los colores de columna son los semánticos del sistema aplicados a
este giro: **azul** para nuevo (informativo, en espera), **ámbar** para en preparación (atención,
en curso), **verde** para listo (confirmado). El rojo se reserva para lo que está mal, no para lo
urgente.

**Por qué tres columnas y no una lista con estados.** Porque en cocina la pantalla se mira de
reojo, a dos metros, con las manos ocupadas. La posición física de una comanda en la pantalla
comunica su estado más rápido que cualquier etiqueta. Mover una tarjeta de columna es una acción
de un toque que además cambia lo que ve todo el mundo.

**El reloj de cada comanda es texto relativo** —"hace 9 minutos"— y hoy **no tiene umbral ni
color**. Es el hueco de **F-315**: sin saber que la arrachera tarda 14 minutos y el pescado 22, el
número no significa nada. Cuando F-315 entre, la tarjeta se pone ámbar al 100% del tiempo estimado
y roja al 150%, y ése es el momento en que esta pantalla pasa de mostrar a avisar.

**La alerta de alergia** se pinta en rojo, con icono, dentro de la tarjeta y **no se puede
colapsar**. Es la única cosa de toda la aplicación que se muestra aunque nadie la haya pedido.

**Estaciones.** Si el restaurante las usa, cada pantalla de cocina ve **sólo su estación** y las
comandas sin estación asignada caen en la estación marcada como general. Un usuario de cocina sin
estación asignada ve una pantalla de bloqueo que lo dice con esas palabras, no un tablero vacío:
un tablero vacío se interpreta como "no hay trabajo" y eso para la cocina entera.

**Vista agrupada por mesa** (sólo con estaciones activas): en vez de una tarjeta por comanda, una
tarjeta por mesa con las comandas de sus distintas estaciones dentro, ordenadas por la más
antigua. **Por qué:** porque un plato de parrilla y uno de cocina fría de la misma mesa tienen que
salir juntos, y verlos separados hace que uno espere diez minutos en la ventana.

**Layout en tablet (768–1279)** — tres columnas siguen cabiendo, con tarjetas compactas. Es el
caso de la cocina pequeña con una tablet montada en la pared.
**Layout en teléfono (<768)** — una sola columna con pestañas `Nuevos (3) · En prep. (4) · Listos
(2)`. **Sobrevive por completo**, porque el cocinero de una cocina chica trae el teléfono en el
bolsillo del mandil. Lo que se esconde: el reloj absoluto del encabezado y el control de voz.

**Estados**

```
Vacío ............. "Sin comandas pendientes." con el tipo más grande de la
                    pantalla. Es la única pantalla donde el estado vacío es
                    una buena noticia y debe verse como tal
Cargando .......... esqueletos con la forma de las tarjetas
Refresco .......... cada 2 segundos, sin parpadeo y sin mover lo que el
                    cocinero está mirando. "Nada se mueve solo debajo del
                    dedo" es literal aquí
Aviso sonoro ...... al llegar una comanda nueva. Voz y sonido, porque en
                    cocina no se está mirando la pantalla
Comanda huérfana .. comanda sin cuenta viva → se detecta y se señala
Sin permiso ....... cocina no ve costos, márgenes ni gramajes. NUNCA.
                    No es que la pantalla no los pinte: el servidor no los
                    manda, campo por campo
```

**Qué NO va aquí** — precios, totales, nombres de comensales, propinas, ningún dato de dinero.
Una cocina que ve precios es una cocina que sabe cuánto vale lo que se lleva.

---

### PANTALLA · Caja *(cobros pendientes)*

```
Propósito ......... cobrar las cuentas que ya pidieron la cuenta
Frecuencia ........ 40–120 veces al día · cajero · es SU pantalla de inicio
Acción principal .. COBRAR
Primero se ve ..... la lista de mesas que están esperando pagar
Jerarquía ......... 1 pendientes · 2 los tres botones de caja · 3 el resto
```

**Layout en PC (≥1280) — es el layout principal**

```
┌───────────────────────────────────────────────────────────────────────┐
│ Caja       [Abrir caja] [Corte de turno] [Cierre diario]              │
├───────────────────────────────────────────────────────────────────────┤
│ ( Pendientes 4 ) ( Buscar ) ( Resumen ) ( Historial )                 │
├───────────────────────────────────────────────────────────────────────┤
│  M05-4821   Mesa 5    Luis    6 p.    hace 3 min      $ 1,240.00  ▸   │
│  M12-4822   Mesa 12   Ana     2 p.    hace 1 min      $   485.00  ▸   │
│  M03-4823   Mesa 3    Luis    4 p.    ahora           $   890.00  ▸   │
│  M08-4824   Mesa 8    Ana     8 p.    hace 6 min      $ 3,150.00  ▸   │
└───────────────────────────────────────────────────────────────────────┘
```

Densidad **alta**: filas compactas, cifras tabulares alineadas a la derecha. Es la única pantalla
del modelo donde se busca un dato entre muchos y la decoración estorba.

**Por qué "Pendientes" es la pestaña que abre y no "Buscar".** Porque el 90% del trabajo del
cajero es cobrar lo que ya está esperando. Abrir en un buscador vacío le costaría un clic cada
vez, cien veces al día.

**Por qué el tiempo de espera es una columna.** Porque una mesa que lleva seis minutos esperando
para pagar es una mesa que no se libera y una persona que se está enojando. Es la señal que
ordena la fila.

**Los tres botones de caja arriba y siempre visibles.** Abrir caja, corte de turno, cierre diario.
No están en un menú porque son los tres momentos en que la caja **cambia de estado**, y esconderlos
provoca que alguien cobre sin caja abierta o que el turno se vaya sin cortar.

**Layout en tablet (768–1279)** — las filas se vuelven tarjetas de dos líneas: mesa y total
grandes arriba, mesero y espera abajo. Los tres botones pasan a una fila de ancho completo.
**Layout en teléfono (<768)** — sólo pendientes, en tarjetas de una columna, con el total en el
tamaño más grande. Las pestañas Resumen e Historial se esconden tras un menú. **Por qué sobrevive
Pendientes y no lo demás:** porque el único caso real de cobrar desde el teléfono es el dueño
cobrando una mesa cuando el cajero fue al baño.

**Estados**

```
Sin caja abierta .. la pantalla se BLOQUEA entera. Tarjeta ámbar:
                    "Caja cerrada" + [ Abrir caja ]. No es un aviso, es un
                    muro. Un cobro sin sesión de caja no pertenece a ningún
                    corte
Vacío ............. "Ninguna mesa está esperando pagar." Y debajo, el
                    resumen del turno hasta ahora — porque es lo que el
                    cajero haría con ese hueco de tiempo
Ticket en $0.00 ... se señala y se ofrece eliminarlo. Son cuentas que se
                    abrieron y cerraron sin consumo
Error ............. banda roja, la lista se congela con el último dato
```

**Atajos** (PC, esta pantalla sí es de teclado) — `F2` buscar · `Enter` cobrar la fila
seleccionada · `↑ ↓` moverse · `Esc` cerrar el diálogo.

**Qué NO va aquí** — el catálogo de productos, el mapa de mesas, configuración. El cajero no
levanta pedidos.

---

### PANTALLA · Cobro *(diálogo)*

```
Propósito ......... convertir una cuenta cerrada en dinero contado
Frecuencia ........ 40–120 veces al día · cajero
Acción principal .. COBRAR
Primero se ve ..... el TOTAL, en el tamaño más grande de toda la aplicación
Jerarquía ......... 1 total · 2 método de pago · 3 propina · 4 el desglose
```

```
PC (≥1280)
  ┌─────────────────────────────┬──────────────────────────┐
  │ MESA 5 · M05-4821 · Luis    │      TOTAL               │
  │ 2 × Arrachera      560.00   │    $ 1,240.00            │
  │ 1 × Sopa azteca     95.00   │                          │
  │ 3 × Cerveza        195.00   │  [ EFECTIVO  ]           │
  │ 1 × Postre         120.00   │  [ TARJETA   ]           │
  │ …                           │  [ TRANSFER. ]           │
  │                             │  [ MIXTO     ]           │
  │ Subtotal        1,068.97    │                          │
  │ IVA (16%)         171.03    │  Recibido [ $ 1,500.00 ] │
  │ Propina (10%)     124.00    │  Cambio        $ 136.00  │
  │                             │                          │
  │                             │  ┏━━━━━━━━━━━━━━━━━━━━┓  │
  │                             │  ┃   COBRAR  (F12)    ┃  │
  │                             │  ┗━━━━━━━━━━━━━━━━━━━━┛  │
  └─────────────────────────────┴──────────────────────────┘
```

**El total es lo más grande de la pantalla, y lo es por una razón operativa:** el cajero lo lee en
voz alta al comensal. Si tiene que buscarlo, lo lee mal.

**El bloque de propina, cuando hace falta.** Si la cuenta viene con propina pendiente —el mesero
la difirió o el comensal no la fijó en el QR— el diálogo de propina se abre **antes** de poder
cobrar, con los porcentajes sugeridos, su importe en pesos debajo de cada uno, un campo de monto
manual, y el botón **Sin propina** con el mismo peso visual que los porcentajes. No es un enlace
chiquito: la propina es voluntaria y la pantalla tiene que dejarlo obvio.

**El bloque de desglose exacto, sólo en pago mixto con propina.** Tres campos —efectivo, tarjeta,
transferencia— que tienen que sumar exactamente la propina, con validación de ±$0.01 y el botón de
cobrar deshabilitado hasta que cuadre. Es fricción **a propósito**, y es la única fricción
deliberada de toda la pantalla de cobro, porque elimina una clase entera de descuadre.

**Tablet** — el desglose de la cuenta se colapsa a `12 platillos ▾` y el bloque de cobro ocupa la
pantalla. **Teléfono** — sólo el total, los cuatro métodos y el botón. La cuenta se despliega bajo
demanda.

```
Cobrando .......... el botón se deshabilita y dice "Cobrando…". Clave de
                    idempotencia generada al ABRIR el diálogo: dos clics,
                    doble Enter o un reintento por red no cobran dos veces
Éxito ............. diálogo con el ticket completo y un botón [ Imprimir ].
                    La mesa pasa sola a "limpieza"
Error ............. rojo, con lo que pasó y qué hacer. La cuenta NO se marca
                    como pagada
Propina pendiente . no deja cobrar. "Confirma la propina antes de cobrar."
```

**Qué NO va aquí** — inventario, reportes, historial, edición de la cuenta. Si hay que corregir un
platillo, se corrige en la mesa, no en el cobro.

---

### PANTALLA · Cierre diario y arqueo

```
Propósito ......... cerrar el día y saber si cuadró
Frecuencia ........ 1 vez al día · encargado o dueño · a las 23:30
Acción principal .. CERRAR CAJA
Primero se ve ..... el resumen financiero del día, SIN propinas
Jerarquía ......... 1 el campo de efectivo contado · 2 el resumen ·
                    3 propinas · 4 métodos de pago
```

El orden de las secciones en pantalla es el mismo del PDF, y eso es deliberado: quien cierra ya
sabe cómo se lee el documento antes de generarlo.

```
1  RESUMEN FINANCIERO (SIN PROPINAS)
     Ventas reales · Tickets · Ticket promedio · Costo de ventas ·
     Utilidad bruta · Margen promedio · Gastos operativos · Utilidad neta est.

2  PROPINAS DEL DÍA (PENDIENTES DE LIQUIDAR)
     Total · Efectivo · Tarjeta · Transferencia

3  MÉTODOS DE PAGO (VENTAS + PROPINAS)
     Tabla: método / ventas / propinas / total

4  CONTEO DE EFECTIVO Y FONDO
     ┌───────────────────────────────────────────────┐
     │  Efectivo contado físicamente *  [ $ ______ ] │  ← PRIMERO
     │  Dinero dejado en caja (fondo)   [ $ ______ ] │
     └───────────────────────────────────────────────┘
     ... y HASTA ENTONCES aparece el esperado y el semáforo
```

**El arqueo a ciegas es la regla que define esta pantalla.** El campo de conteo va primero, vacío
y con el foco puesto. El esperado no se enseña antes. Si se enseñara, todo el mundo teclearía ese
número y el arqueo dejaría de existir como control.

**El bloqueo por mesas abiertas.** Antes de dejar cerrar, el sistema busca mesas con cuenta viva
y, si hay, abre un diálogo con la lista: mesa, mesero, total, tiempo abierta. No hay forma de
continuar. Se verifica **dos veces** —al abrir el diálogo y justo antes de ejecutar— porque entre
una cosa y la otra pasan los tres minutos que el encargado tarda en contar el cajón, y en esos
tres minutos alguien puede sentar una mesa.

**Al terminar, el PDF se descarga solo.** Sin pedirlo, salvo que la perilla esté apagada. Porque
el dueño se va y lo lee en el coche, y un documento que hay que ir a buscar es un documento que no
se lee.

**Tablet y teléfono** — una sola columna, secciones colapsables, el campo de conteo siempre
visible y fijo arriba. **El teléfono importa aquí**: hay dueños que cierran desde el teléfono
mientras el encargado cuenta.

---

### PANTALLA · Registros

```
Propósito ......... contestar una pregunta concreta sobre algo que ya pasó
Frecuencia ........ 3–10 veces al día · dueño y administrador
Acción principal .. ELEGIR PERIODO
Primero se ve ..... el resumen del periodo y el buscador universal
Jerarquía ......... 1 selector de periodo · 2 resumen · 3 las pestañas
```

Seis pestañas, en este orden: **Cortes · Ventas · Propinas · Compras · Movimientos · Gastos**.
Periodos: Hoy · 7 días · 30 días · Este mes · Este año · Personalizado.

**Por qué Cortes va primero y no Ventas.** Porque la pregunta más frecuente del dueño no es
"¿cuánto vendí?" —eso lo ve en el dashboard— sino "a ver el corte del sábado pasado". El corte es
la unidad de consulta de este negocio.

**Por qué Propinas es una pestaña propia y no una columna de Ventas.** Porque es una pregunta
distinta, la hace otra persona (el encargado, no el dueño) y en otro momento (la quincena). Trae
filtro pendientes/liquidadas, el total por mesero y el historial de liquidaciones con folio.

Cada pestaña puede exportarse a Excel o PDF. **PC**: tablas densas con cabecera fija. **Tablet**:
menos columnas, las secundarias se ven al expandir la fila. **Teléfono**: sólo Cortes y Ventas, en
tarjetas; el resto se esconde, porque nadie audita compras en 375 px.

---

### PANTALLA · Inventario

```
Propósito ......... saber qué hay, qué falta y qué se consumió
Frecuencia ........ 2–5 veces al día · encargado, almacén, dueño
Acción principal .. AJUSTAR STOCK
Primero se ve ..... los ingredientes en crítico y agotado, arriba de todo
Jerarquía ......... 1 alertas · 2 la lista con su semáforo · 3 el buscador
```

Lista de ingredientes con nombre, existencia en unidad base, mínimo, crítico, insignia de estado
de cinco niveles y valor en pesos. **Ordenada por urgencia, no alfabéticamente**: agotado,
crítico, bajo, medio, suficiente. Un inventario ordenado por nombre obliga a leer 150 renglones
para encontrar los seis que importan.

**PC**: tabla densa. **Tablet**: tarjetas de dos columnas, pensadas para leerse caminando por la
bodega. **Teléfono**: una columna, y el ajuste se hace con `+` y `−` grandes, porque quien ajusta
lo hace de pie con una mano.

**Qué NO va aquí** — el costo del insumo si el rol es cocina. Cocina nunca ve costos, márgenes ni
gramajes, y eso no lo decide la pantalla: lo decide el servidor, campo por campo.

---

### PANTALLA · Recetas

```
Propósito ......... decir de qué está hecho cada platillo y cuánto cuesta
Frecuencia ........ ráfagas: 30 veces en dos días al configurar, 2 por
                    semana después · dueño
Acción principal .. AGREGAR INGREDIENTE
Primero se ve ..... la lista de productos con su costo, margen y si ya tiene
                    receta
Jerarquía ......... 1 el margen de cada producto · 2 si tiene receta ·
                    3 el precio
```

Filas expandibles: al abrir un producto aparecen sus ingredientes con cantidad capturada, unidad,
merma y costo de línea. **El margen se pinta con semáforo**: verde arriba de 60%, ámbar de 40 a
60%, rojo debajo de 40%. Es el único número que hace que alguien capture recetas, así que es el
que manda en la jerarquía.

**Por qué la cantidad se captura en la unidad que el usuario quiera.** Porque en cocina se dice
"250 gramos" y "medio litro", no "250" y "500". El sistema convierte y guarda las dos cosas.
Obligarlo a teclear en unidad base garantiza errores de mil.

**Estado vacío** — *"Este platillo no tiene receta. Sin receta no sabemos cuánto cuesta ni cuánto
ganas con él."* + botón. El vacío explica la consecuencia, no se disculpa.

---

### PANTALLA · Productos · Compras y gastos · Portal QR · Configuración

Pantallas de fondo: se usan poco, se tocan con calma, y pueden permitirse formularios.

- **Productos** — rejilla de tarjetas con imagen, precio, costo, margen y estación de preparación.
  El campo que casi nadie tiene y que aquí es central: **área de preparación**, porque decide a
  qué pantalla de cocina llega el platillo. En teléfono, lista de una columna.
- **Compras** — el registro de compra es un formulario de cabecera + líneas, con **plantillas de
  compra recurrente** arriba de todo, porque el pedido del martes es casi siempre el mismo. Se usa
  **en tablet, de pie, en la puerta de servicio**, con el proveedor esperando: los campos son
  grandes y el orden es proveedor → líneas → total → método de pago.
- **Gastos** — siete categorías fijas del giro (servicios, limpieza, transporte, reparación, pago
  extraordinario, marketing, otro) y plantillas de gasto fijo. El gasto en efectivo avisa que
  **sale del cajón**.
- **Portal QR (admin)** — cuatro pestañas: Mesas QR (genera e imprime el código de cada mesa),
  Menú QR, Solicitudes, Configuración. La impresión del QR es carta con la mesa en grande, porque
  se pega en la mesa y se lee a un metro.
- **Configuración** — ocho pestañas: Identidad, Operación, Usuarios POS, **Mesas** (el editor del
  mapa, con arrastrar y soltar), Datos, Integraciones, Presentación, Mantenimiento. El editor de
  mesas es de PC: arrastrar treinta mesas en un teléfono no es una tarea razonable, y en teléfono
  se sustituye por una lista editable.

---

### PANTALLA · Portal del comensal *(QR, sin sesión)*

```
Propósito ......... que el comensal vea el menú, pida, llame al mesero y
                    pida la cuenta sin esperar a que alguien pase
Frecuencia ........ 10–60 veces al día · el comensal
Acción principal .. VER EL MENÚ (y, si está activo, AGREGAR AL PEDIDO)
Primero se ve ..... el nombre del restaurante, la mesa y las secciones
Jerarquía ......... 1 el menú · 2 el botón de atención · 3 el carrito
```

**Es una pantalla de teléfono y sólo de teléfono.** Se diseña a 375 px y no se deriva a nada más:
nadie escanea un QR desde una PC. Una sola columna, fotos grandes, precios opcionales.

Tres solicitudes, con su nombre en lenguaje de comensal: **Quiero ordenar · Pido la cuenta ·
Necesito ayuda**. Botón flotante de atención, siempre alcanzable con el pulgar.

Al final del consumo, **valoración con cinco emojis** (😡 😕 😐 🙂 🤩) y comentario opcional. Una
valoración por cuenta: si otro teléfono de la misma mesa ya valoró, se dice y no se insiste.

**Estados** — sin conexión: *"Sin internet. Llama a tu mesero."* Token inválido o mesa cerrada:
*"Este código ya no está activo."* Nunca una pantalla en blanco ni un error técnico: quien lo lee
es un cliente, no un operador.

---

## 4.4 · EL DASHBOARD

**La regla que lo gobierna:** cada indicador existe porque **hay una decisión que el dueño toma al
verlo**. Si no se puede nombrar la decisión, el indicador no va.

Se calcula **sobre la caja abierta**, no sobre el día natural. Sin caja abierta, todo está en cero
a propósito y un banner lo explica. Es el corte lógico correcto para este giro: la cena del
viernes termina a la 1:20 del sábado y pertenece al viernes.

### Fila 1 · Los cuatro de arriba, grandes

| Indicador | Decisión que dispara |
|---|---|
| **Ventas hoy** (+ nº de tickets) | Voy adelante o atrás contra un viernes normal. Si a las 21:00 llevo la mitad, mando a alguien a la puerta a levantar gente |
| **Costo de ventas** | Si el costo va corriendo por encima de lo normal para estas ventas, hoy alguien está sirviendo de más o se está yendo algo |
| **Utilidad bruta** (+ % de margen) | Si el margen cae y las ventas no, el problema es la mezcla: se está vendiendo lo barato. Hay que empujar los platillos de margen alto |
| **Ticket promedio** | Si baja, el equipo no está sugiriendo. Es la conversación de mañana en la junta de las 11:30 |

### Fila 2 · Los cinco de dinero y operación

| Indicador | Decisión que dispara |
|---|---|
| **Efectivo** | Cuánto debería haber en el cajón ahora. Decide si toca hacer un retiro por seguridad antes de la cena |
| **Tarjeta** | Contra qué va a cuadrar el voucher de la terminal esta noche |
| **Transferencia** | Qué hay que verificar en el banco antes de cerrar. Es el método donde más "se cobró y no llegó" pasa |
| **Gastos operativos** | Cuánto salió del cajón hoy. Si son $4,000 un martes, hay que preguntar hoy, no a fin de mes |
| **Utilidad neta estimada** | La única cifra que contesta "¿ganamos hoy?". Verde o roja, sin medias tintas |

### Bloques de abajo

| Bloque | Decisión que dispara |
|---|---|
| **Inventario crítico** (nº + lista) | Qué se compra mañana a las nueve. Es el único indicador que produce una acción concreta al día siguiente |
| **Propinas del día** | Cuánto hay que repartir esta noche y a quién. Evita la sorpresa del cierre |
| **Métodos de pago — dona** | Contesta "¿de qué medio vino el dinero?" de un vistazo. Una gráfica, sólo una, y de proporción — que es lo único que una dona hace bien |
| **Cortes de caja recientes** (7) | Permite abrir el corte de anteayer sin ir a Registros. Siete porque una semana es el ciclo natural de comparación de un restaurante: el viernes se compara con el viernes |
| **Primeros pasos** (sólo al arrancar) | Ocho pasos de configuración que desaparecen al completarse. Es el único contenido del dashboard que se autodestruye, y debe hacerlo |

### Qué cambia entre las 8 de la mañana y las 10 de la noche

| | 08:00 | 22:00 |
|---|---|---|
| **Estado** | Sin caja abierta. Todo en cero con banner explicativo | Caja abierta, todo vivo |
| **Lo que domina** | **Inventario crítico** y **Cortes recientes**: es hora de comprar y de leer cómo fue ayer | **Ventas, efectivo y propinas**: es hora de cerrar |
| **Lo que sobra** | Ticket promedio del día (no hay día todavía) | Inventario crítico (ya no se puede comprar nada) |

El dashboard **no reordena sus tarjetas solo**. Una pantalla que se recompone según la hora
destruye la memoria muscular, y la memoria muscular es lo que hace que el dueño lea sus números
en cuatro segundos. Lo que sí cambia es el banner de estado de caja.

### Qué NO va en el dashboard de este negocio, aunque exista el dato

- **Ventas acumuladas históricas.** No es un indicador, es un adorno. No dispara nada.
- **Comparativo del mismo día del año pasado.** Interesante, no accionable a las diez de la noche.
- **Gráfica de ventas por hora.** Suena útil y no lo es: el dueño **ya sabe** a qué hora vende,
  estuvo ahí. Sirve para decidir horarios de personal, y eso es una decisión mensual — va en
  Registros, no en el tablero diario.
- **Ranking de meseros por ventas.** Peligroso como indicador diario: empuja a vender caro a la
  mesa equivocada. El ticket promedio por mesero sí sirve, pero como conversación semanal.
- **Rotación de mesas.** Es el número más importante del negocio y **todavía no se puede calcular**
  (F-305 pendiente). Cuando exista, entra al dashboard y desplaza a "ticket promedio" del cuarto
  lugar. Decirlo aquí es más honesto que inventarlo.
- **Nada de doce indicadores.** Ocho, más tres bloques. Un restaurante de treinta mesas no
  necesita un tablero de aeropuerto.

---

## 4.5 · MULTI-SUCURSAL

Un restaurante con dos o tres sucursales no es un corporativo: es un dueño con dos locales y un
gerente en cada uno. Eso define todo lo que sigue.

**Qué se separa, siempre**

| Cosa | Por qué separada |
|---|---|
| **Mesas y zonas** | El plano es del local. No tiene ninguna lectura consolidada posible |
| **Caja y cortes** | Un cajón por local. Un corte consolidado no cuadra contra ningún cajón físico y por lo tanto no sirve para nada |
| **Inventario y almacenes** | El jitomate está en un local, no en los dos |
| **Estaciones de preparación** | La cocina de cada local |
| **Comandas** | Obvio |
| **Propinas y su liquidación** | Se pagan en el local donde se ganaron |

**Qué se comparte**

| Cosa | Por qué compartida |
|---|---|
| **Catálogo de productos y categorías** | Es la misma carta. Mantener dos cartas es el camino a que tengan precios distintos por error |
| **Recetas** | El platillo se hace igual en los dos |
| **Proveedores** | Casi siempre los mismos |
| **Empleados y roles** | Un mesero puede cubrir en la otra sucursal, y su propina tiene que seguirlo |
| **Identidad y tema** | Es la misma marca |

**Precio por sucursal** (F-024): sí hace falta. Una sucursal en zona turística y otra de barrio no
cobran lo mismo por la misma arrachera. Se resuelve como excepción sobre el precio base, no como
catálogo duplicado.

**Qué ve un gerente de sucursal contra el dueño**

```
GERENTE DE SUCURSAL                      DUEÑO
───────────────────                      ─────
Su sucursal, completa                    Selector de sucursal + "Todas"
Su caja, su corte, su inventario         Todas las cajas y todos los cortes
Sus propinas y su liquidación            Consolidado de ventas, costo y margen
Sus empleados                            Comparativo entre sucursales
                                         Cuál vende más por mesa, cuál tiene
NO ve: la otra sucursal                  peor margen, cuál tiene más merma
NO ve: el consolidado
```

**El consolidado que sí sirve, y el que no.** Sirve: ventas, costo, margen, ticket promedio y
merma, comparados lado a lado, porque contestan "¿cuál de mis dos locales está funcionando mejor y
por qué?". No sirve: un corte de caja consolidado. El corte existe para cuadrar un cajón físico, y
no hay un cajón que junte los dos.

---

## 4.6 · ACCESIBILIDAD Y CONDICIONES REALES

Este giro se opera **de pie, con prisa, con ruido, con las manos mojadas o grasosas, con calor, con
poca luz en el salón y con demasiada en la cocina**. Eso no es una lista de excusas: cada condición
tiene una consecuencia medible en la interfaz.

| Condición real | Dónde | Qué implica |
|---|---|---|
| **De pie, una sola mano, tablet sostenida con la otra** | Mesero, todo el turno | La acción principal vive en el **tercio inferior derecho**, en el camino del pulgar. Nada crítico arriba a la izquierda |
| **Manos mojadas o grasosas** | Mesero, cocina | Objetivo táctil mínimo **56×56 px** en las pantallas de mesero y cocina (por encima del mínimo general de 44). El toque resbala: los botones destructivos nunca van pegados a los frecuentes |
| **Ruido de salón y extracción** | Todo el local | El aviso sonoro de comanda nueva no basta: va acompañado de **voz** y de cambio visual. Nada depende sólo del sonido |
| **Poca luz en el salón, mucha en cocina** | Mesero / cocina | Tema oscuro real para el salón —no un gris— y contraste alto para cocina. Contraste mínimo **4.5:1** en texto normal, **3:1** en texto grande, en los dos temas |
| **Pantalla de cocina a 2 metros** | Cocina | El número de mesa y el nombre del platillo son los dos tamaños más grandes de esa pantalla. Nada informativo por debajo de 16 px |
| **Prisa en hora pico** | 14:00–16:00 y 20:00–22:00 | **Cero confirmaciones en el camino feliz.** Sólo confirma lo destructivo: cancelar una cuenta, liberar una mesa ocupada, eliminar. Enviar a cocina no confirma: se puede corregir |
| **Errores de toque** | Todas | Toda acción destructiva confirma, y toda acción frecuente se puede deshacer. Un envío doble no duplica: la clave de idempotencia lo impide |
| **Rotación de personal** | Todas | Prueba del recién llegado: alguien que entró hoy y conoce el giro tiene que poder abrir una mesa, comandar y enviar **sin que nadie le explique**. Si no, la pantalla está mal |
| **Daltonismo** | Todas | El color **nunca** es el único portador de significado. Cada estado de mesa lleva su etiqueta de texto; cada estado de stock lleva su palabra; cada columna de cocina lleva su icono |
| **Teclado en caja** | Caja, PC | Todo operable con teclado, foco visible siempre, `F12` para cobrar. El cajero no debería tener que soltar el teclado |
| **Cifras que bailan** | Todas | Todo número de dinero en **cifras tabulares** y alineado a la derecha. Una columna de precios que se mueve es una columna que no se puede leer de un vistazo |
| **Tablas largas** | Registros, Inventario | Cabecera fija siempre |
| **Nada se mueve solo** | Cocina sobre todo | La pantalla de cocina se refresca cada 2 segundos y **no puede** reordenar lo que el cocinero está a punto de tocar |
