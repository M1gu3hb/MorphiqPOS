# 04 · INTERFAZ · Ferretería y tlapalería

**Éste es el archivo más largo de la carpeta y el que más se nota.** Los átomos no cambian —botón,
campo, tabla, tarjeta, diálogo son los mismos de `packages/ui` en los 78 modelos (D-03)—. Lo que
cambia es **la estructura**: qué es lo grande, dónde está, qué dice y qué hay alrededor.

**Las cuatro constantes de este modelo, que mandan sobre cada decisión que sigue:**

1. **La acción principal es BUSCAR, no cobrar.** El 70% del tiempo de mostrador se va en encontrar la
   pieza. La pantalla de inicio es el buscador con la venta armándose al lado, no el total con el
   cursor esperando al lector.
2. **El ritmo es sostenido, no ráfaga.** Aquí **sí caben** un diálogo de dos pasos, una confirmación
   antes de abrir un rollo y un formulario de cotización. Lo que no cabe es que buscar tarde más de
   dos segundos. **La fricción aceptable se movió de sitio.**
3. **Hay dos dispositivos principales, no uno.** La PC del mostrador **y el teléfono o la tablet en el
   pasillo**, porque el mostradorista camina con el cliente hasta el rack. `abarrotes` no tiene eso.
4. **Hay dos personas en la venta.** El que despacha y el que cobra pueden ser distintos (modo B,
   `02-DINERO-Y-CAJA.md` §8.1), y eso parte el flujo en dos pantallas que se hablan.

Todo lo que `abarrotes` ya resolvió —el capturador de teclado, el foco imperdible, el arqueo a ciegas,
el desglose por denominación, la cascada del esperado, el conteo a ciegas, el alta rápida— **se
reutiliza tal cual y no se vuelve a dibujar aquí**. Lo que sigue es lo que cambia.

---

## 4.1 · VOCABULARIO DEL GIRO · F-017

| Entidad interna | En pantalla aquí | Plural | Género | En `abarrotes` |
|---|---|---|---|---|
| `producto` | **material** · **pieza** cuando es unitario | materiales / piezas | m. / f. | producto |
| `orden` | **venta** | ventas | f. | venta |
| `orden` (impresa, contado) | **ticket** | tickets | m. | ticket |
| `orden` (impresa, crédito) | **remisión** | remisiones | f. | — |
| `orden` (borrador en mostrador) | **nota** | notas | f. | — |
| `orden_linea` | **partida** | partidas | f. | artículo |
| `cotizacion` | **cotización** · **presupuesto** en tono de obra | cotizaciones | f. | — |
| `responsable` (despacha) | **mostrador** · la persona, **mostradorista** | mostradoristas | m. | cajero |
| `responsable` (cobra) | **caja** | — | f. | cajero |
| `cliente` | **cliente** · **marchante** en tono informal | clientes | m. | cliente / marchante |
| `cliente` con crédito | **cliente de cuenta** | clientes de cuenta | m. | cliente de fiado |
| `autorizado` (nuevo) | **quién puede recoger** | autorizados | m. | — |
| `proyecto_cliente` (nuevo) | **obra** | obras | f. | — |
| `saldo_pendiente` | **lo que debe** | — | m. | lo que debe |
| `abono` | **pago** | pagos | m. | abono |
| `presentacion` | **presentación** · **medida** cuando es continua | presentaciones / medidas | f. | presentación |
| `pieza_abierta` (nueva) | **rollo abierto** · **tramo cortado** | rollos abiertos | m. | — |
| `sobrante` (nuevo) | **retazo** | retazos | m. | — |
| `atributo` (nuevo) | **medida** | medidas | f. | — |
| `ubicacion` (nueva) | **gaveta** · **rack** · **pasillo** | gavetas | f. | zona de anaquel |
| `zona` | **zona de conteo** | zonas | f. | zona de anaquel |
| `almacen` | **mostrador** y **bodega** | — | m. / f. | tienda |
| `compra` | **entrada** · **nota del proveedor** | entradas | f. | entrada |
| `merma` motivo `corte` | **desperdicio de corte** | — | m. | — |
| `garantia_proveedor` | **garantía** | garantías | f. | canje |
| `servicio` (F-258) | **trabajo de mostrador** | trabajos | m. | servicio (recarga) |
| `renta` | **renta** | rentas | f. | — |
| `sesion_caja` | **caja del día** | — | f. | caja del día |

**Reglas que se aplican y donde más se nota el descuido** (§3 de `04-SISTEMA-DE-DISENO.md`):

- *"No encontramos ese material"*, no *"Producto no encontrado"* ni *"Entidad no encontrada"*.
- *"No hay de esa medida, pero éstas le sirven"*, en el estado de cero resultados. **El estado vacío de
  la búsqueda es la pantalla más importante de este modelo después del mostrador**, porque es donde se
  pierde o se salva la venta.
- *"El ingeniero Loera debe $18,400 de la obra Las Torres, 47 días"*, no *"Saldo: 18400.00"*.
- *"Quedan 37 m del rollo R-114"*, no *"Existencia parcial: 37000"*.
- El género importa: **la** partida, **el** material, **la** remisión, **el** retazo, **la** gaveta,
  **la** obra.
- **"Partida" y no "artículo"**, porque es la palabra que el contratista usa cuando pide una cotización
  y la que aparece en su propia contabilidad de obra. Es el tipo de detalle por el que un cliente
  siente que el sistema es de su giro.

---

## 4.2 · NAVEGACIÓN

El orden es el del día de trabajo, no el alfabético ni el del sistema.

```
┌──────────────────┐
│  ● MOSTRADOR     │  ← pantalla de inicio. Buscar y armar la venta
│  ─────────────── │
│    Caja          │  ← cobrar las notas. SEGUNDO, porque es la otra mitad
│    Cuentas       │  ← crédito, saldos, obras, autorizados
│    Cotizaciones  │
│  ─────────────── │
│    Existencias   │  ← qué hay, qué está dormido, qué está abierto
│    Entradas      │  ← recepción y pedido al proveedor
│    Conteo        │
│  ─────────────── │
│    Materiales    │  ← catálogo, medidas, precios, equivalencias
│    Clientes      │
│    Trabajos      │  ← servicios de mostrador y rentas (si están encendidos)
│  ─────────────── │
│    Facturación   │  ← CFDI. Aquí SÍ tiene sección propia
│    Cortes        │
│    Registros     │
│    Configuración │
└──────────────────┘
```

**Por qué ese orden, sección por sección, y en qué se separa de `abarrotes`:**

- **Mostrador arriba y separado.** Es el 70% del tiempo de uso. No compite con nada. Igual que
  "Cobrar" en `abarrotes`, pero **es otra pantalla**: allá es un total con un lector; aquí es un
  buscador con una venta.
- **Caja en segundo lugar**, no al final. En `abarrotes` la caja va abajo porque son dos momentos al
  día: abrir y cerrar. **Aquí la caja es una estación de trabajo permanente** que cobra notas todo el
  día, y el cajero vive en ella.
- **Cuentas en tercer lugar**, no escondido en Clientes, y con más peso que el "Fiado" de `abarrotes`.
  Se consulta **antes de despachar**, que es el momento más importante del día para el dinero.
- **Cotizaciones existe como sección propia**, y en `abarrotes` no existe nada equivalente. Es A5
  asomándose: la venta grande de este giro pasa por ahí.
- **El bloque de inventario en el mismo orden que `abarrotes`** —veo qué falta → lo recibo → lo
  cuento—, porque el proceso es el mismo aunque el ritmo sea otro.
- **"Materiales" y no "Productos"**, y en el mismo lugar bajo que allá: se toca una vez a la semana.
  Pero con una diferencia de fondo — aquí **sí se navega el catálogo** de vez en cuando, por línea y
  familia, cosa que con 1,800 SKU planos no tenía sentido.
- **Trabajos** (servicios y rentas) sólo aparece si su perilla está encendida. En una ferretería que no
  hace copias de llave ni renta nada, **la sección no existe**, no está en gris.
- **Facturación con sección propia**, que en `abarrotes` es un rincón de Registros. Aquí Norma entra
  varias veces al día.
- **Cortes y Registros al final**, igual que allá.

**Por rol:**

| Rol | Ve | No ve |
|---|---|---|
| **Mostradorista** | Mostrador · Existencias · Cuentas (consulta) · Conteo · Materiales (lectura + equivalencias + foto) | **Costos, márgenes**, Caja, Registros, Configuración, precios de compra |
| **Cajero** | Caja · Cuentas (cobro) · Facturación · Mostrador (lectura) | Costos, márgenes, edición de materiales, Configuración |
| **Almacén** | Existencias · Entradas · Conteo | Caja, Cuentas, Registros, costos de compra |
| **Encargado** | Todo salvo Configuración y utilidad neta | Precios de compra por proveedor |
| **Dueño** | Todo | — |

**El mostradorista no ve el costo ni el margen de ningún material, en ninguna pantalla.** Es la misma
regla que `VE_COSTOS_DE_INSUMO` impone en `restaurante` y que `abarrotes` extendió al cajero. Aquí pesa
más: un mostradorista que conoce el costo puede negociar por fuera con el contratista, y en un giro
donde el descuento de mostrador está permitido, esa información es una llave.

**Lo que sí ve el mostradorista y `abarrotes` no da a nadie de ese nivel:** el **tope de descuento de la
línea** y si la venta lo respeta. No el margen, sólo el tope. Porque necesita negociar y necesita saber
hasta dónde puede, sin saber cuánto se gana.

---

## 4.3 · LAS PANTALLAS, UNA POR UNA

---

### PANTALLA 1 · MOSTRADOR ★

```
Propósito ......... encontrar lo que el cliente necesita y armar la venta
Frecuencia ........ 25 a 60 ventas al día · mostradorista · es el 70% del uso
Acción principal .. BUSCAR. El foco arranca en el campo de búsqueda
Primero se ve ..... el campo de búsqueda y los ocho grupos de línea
Jerarquía ......... 1 búsqueda · 2 resultados · 3 la venta · 4 el cliente
Dispositivo ....... PC del mostrador. Tiene gemela en teléfono, ver más abajo
```

#### Layout en PC (≥1280 px)

```
┌───────────────────────────────────────────────────┬──────────────────────────┐
│ ⌕ [ tornillo 1/4 x 2 ..........................]  │  Cliente  [ Ing. Loera ▾]│
│   Fijación › Tornillo › tirafondo      [ limpiar ]│  Obra     [ Las Torres ▾]│
│ ┌───────────────────────────────────────────────┐ │  Debe $18,400 · 47 d ●   │
│ │ Medida  Acabado   Marca   Precio  Hay   Dónde │ │  Límite $25,000          │
│ ├───────────────────────────────────────────────┤ │  Recoge [ Martín P.  ▾]✓ │
│ │ 1/4×2   galvan.   Fiero   $2.80  2,340  B-14  │ │ ─────────────────────────│
│ │ 1/4×2   negro     Fiero   $2.40  1,180  B-15  │ │  LA VENTA                │
│ │ 1/4×2½  galvan.   Fiero   $3.10    640  B-14  │ │                          │
│ │ 1/4×3   galvan.   Fiero   $3.80    210  B-16  │ │  Tornillo 1/4×2 galv.    │
│ │ 5/16×2  galvan.   Fiero   $4.20     90  B-17  │ │    120 pz × $2.80  336.00│
│ │                                               │ │                          │
│ │ ▸ Equivalentes    ▸ Ver foto   ▸ Ficha        │ │  Cable THW cal.12 negro  │
│ └───────────────────────────────────────────────┘ │    60.00 m × $14.50      │
│                                                   │    ✂ del rollo R-114     │
│  [Fijación][Eléctrico][Plomería][Pintura]         │                   870.00 │
│  [Herram.][Cerrajería][Construc.][Jardín]         │                          │
│                                                   │  Cemento gris 50 kg      │
│  ▸ Listas de trabajo: tinaco · contacto · llave   │    2 sacos × $205  410.00 │
│                                                   │ ─────────────────────────│
│                                                   │  3 partidas              │
│                                                   │  TOTAL      $ 1,616.00   │
│                                                   │  ┌─────────────────────┐ │
│                                                   │  │ MANDAR A CAJA   F12 │ │
│                                                   │  └─────────────────────┘ │
│                                                   │  [ Remisión a cuenta F11]│
│                                                   │  [ Cotizar F8 ] [Esperar]│
├───────────────────────────────────────────────────┴──────────────────────────┤
│ Mostrador · Chava · 08:14 · 6 ventas hoy       Últ: Cable THW cal.12 · 60 m  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Qué se ve primero, sin scroll ni clic:** el campo de búsqueda con el foco puesto, y debajo **los ocho
grupos de línea**. `abarrotes` arranca con la lista vacía y el mensaje *"Escanea el primer producto"*;
aquí arrancar vacío sería un error, porque **la primera pregunta del mostradorista al cliente es "¿de
qué es?"** y los ocho grupos son literalmente esa pregunta convertida en botones.

**Jerarquía y por qué:**

- **Primario · la búsqueda y sus resultados.** Ocupan dos tercios del ancho. Es donde se resuelve la
  venta.
- **Secundario · la venta que se arma.** A la derecha, visible siempre, **pero no es lo grande**. En
  `abarrotes` el total es lo más grande de la aplicación porque el cliente lo lee desde el otro lado;
  aquí el cliente **no está mirando la pantalla**: está mirando la pieza que el mostradorista le puso
  en el mostrador. **El total importa al final, no durante.**
- **Terciario · el cliente y su cuenta.** Arriba a la derecha, con el saldo y el semáforo. **Está ahí
  arriba a propósito**: es la información que tiene que verse **antes de despachar**, no en el cobro,
  porque en una remisión a crédito **no hay cobro**.
- **Cuaternario · los ocho grupos y las listas de trabajo.** Puntos de partida, no productos.

**La tabla de resultados es la pieza central y cada columna se gana su lugar:**

| Columna | Por qué está |
|---|---|
| **Medida** | Es lo que identifica el material. Va primero, antes que el nombre, porque el nombre es el mismo en las cinco filas |
| **Acabado / material** | Es la segunda pregunta ("¿galvanizado o negro?") y la diferencia de precio |
| **Marca** | Tercera pregunta, y a veces la que decide: Truper contra Pretul es calidad contra precio |
| **Precio** | Con la lista del cliente ya aplicada, **con o sin IVA según su lista** (`02` §2.2) |
| **Hay** | Existencia. Con el detalle de abierto si es material continuo |
| **Dónde** | **F-152.** Es la columna que `abarrotes` no tiene y la que hace útil al empleado nuevo. Sin ella el resultado no termina la venta |

**Lo que NO está en esta pantalla y en `abarrotes` sí:**
- El total no es lo más grande de la aplicación. Ver arriba.
- No hay teclas rápidas de producto (F1–F8 con los ocho de siempre). **No existen 30 productos que sean
  el 80% de la venta**; las ocho teclas son los ocho **grupos de línea**, que son otra cosa.
- No hay escáner como estado por omisión. El lector funciona —el capturador de `abarrotes` se reutiliza
  intacto— pero **no es el protagonista**.

#### Atajos de teclado

Ritmo sostenido, no ráfaga: hay menos atajos y **sí caben combinaciones**, porque las dos manos están
en el teclado mientras se busca y no hay una bolsa que llenar.

| Tecla | Acción | Por qué |
|---|---|---|
| *(escribir)* | Va directo al buscador desde cualquier parte | La acción principal no gasta ninguna tecla |
| *(ristra del lector)* | Agrega el material | Para la mitad del catálogo que sí tiene código |
| **Enter** en un resultado | Agrega a la venta con cantidad 1 | |
| **Tab** / **↑↓** | Mover entre resultados | Se compara, no se identifica |
| **F2** | Filtros de medida avanzados | Cuando dos atributos no bastan |
| **F3** | **Equivalentes del resultado seleccionado** | El "no tengo, pero" |
| **F4** | Cliente y obra | **Antes** de despachar |
| **F5** | Foto del resultado | Para señalar |
| **F6** | **Cortar material** | Abre la pantalla 3 |
| **F7** | Listas de trabajo | Volcar "para un tinaco…" |
| **F8** | Convertir la venta en cotización | |
| **F9** | Suspender ("voy a medir y vuelvo") | |
| **F11** | **Remisión a cuenta** | La salida a crédito |
| **F12** | Mandar a caja / cobrar | Según el modo |
| **Supr** | Quitar la partida seleccionada | Deshacer, no confirmar |
| **+ / − / \*** | Cantidad de la partida seleccionada | Heredado de `abarrotes` |
| **Esc** | Limpiar búsqueda; dos veces, limpiar la venta | |

#### El comportamiento de la búsqueda · F-201 + F-059

Es lo único de esta pantalla que no se puede hacer mal, igual que el escáner en `abarrotes`.

| | |
|---|---|
| **Índice** | En memoria del cliente, cargado al abrir sesión. 6,000 claves con sus atributos caben de sobra. El servidor sigue siendo el que cotiza y cobra (regla de Fase 1); el índice sólo **encuentra** |
| **Normalización de medida** | `1/4 x 2`, `1/4x2`, `.25 x 2`, `6.35 x 50`, `6.35mm x 50mm` son **el mismo dato**. La fracción de pulgada, el decimal y el milímetro se normalizan a una clave interna. **Sin esto no funciona nada** |
| **Tolerancia de escritura** | `tornillo`, `tornillos`, `torniyo`, `tornilo` encuentran lo mismo. Distancia de edición corta sobre el nombre, exacta sobre la medida |
| **Orden de los resultados** | Por **coincidencia de medida** primero, después por existencia, después por rotación. Nunca alfabético: el que tiene 2,340 en existencia va arriba del que tiene 3 |
| **Filtro progresivo** | Cada palabra tecleada estrecha. La miga de pan arriba (`Fijación › Tornillo › tirafondo`) enseña dónde estás y se puede quitar por partes |
| **Cero resultados** | **Nunca se dice "no hay" y ya.** Se muestran: (1) equivalentes de la medida más cercana, (2) la medida inmediata superior e inferior, (3) el botón de alta rápida. Ver estados |
| **Velocidad** | Por debajo de 100 ms desde la tecla hasta el resultado repintado. Si tarda, el mostradorista vuelve a su memoria y ahí se acabó el sistema |

#### Estados

| Estado | Qué se ve |
|---|---|
| **Inicial** | Los ocho grupos de línea, grandes, y las listas de trabajo más usadas. **No es un estado vacío: es un punto de partida.** El foco está en el buscador |
| **Buscando** | Los resultados se repintan mientras se teclea, sin esqueleto ni spinner: el índice es local |
| **Cero resultados** | *"No tenemos de esa medida."* Y debajo, en este orden: **"Pero éstas le pueden servir"** con los equivalentes · **"Medidas cercanas"** con la inmediata mayor y menor · **"Dar de alta este material"**. **Es la pantalla que salva o pierde la venta** y por eso es la más trabajada del modelo |
| **Existencia en cero** | El resultado aparece igual, con la fila atenuada y la marca `0`. No se esconde: saber que **existe el material aunque no haya** permite decir "te lo pido para el jueves" — que es una venta, no un fracaso |
| **Stock negativo** | Marca ✖ y la acción sugerida al pasar el cursor: *"Probablemente falta capturar una remisión o una entrada"* |
| **Cliente sobre su límite** | La franja del cliente se pone roja y el botón **Remisión a cuenta** pide PIN de autorización. **No desaparece.** La decisión es de Beto |
| **Quien recoge no está autorizado** | Franja ámbar con el nombre en blanco: *"Esta persona no está en la lista de Ing. Loera. ¿Le hablas antes de despachar?"* con el teléfono a un toque. **Aviso, no muro** |
| **Caja cerrada** | El mostrador **sigue funcionando**: se arman notas y cotizaciones, no se cobra. Franja ámbar arriba. Es distinto de `abarrotes`, donde la caja cerrada bloquea la pantalla entera, y la razón es que aquí armar no es cobrar |
| **Sin conexión** | Franja ámbar. Se vende **de contado**; **el crédito se bloquea** con el motivo escrito: *"Sin internet no podemos ver los saldos. Sólo contado."* Ver `01-FUNCIONES.md` §3.42 |
| **Sin permiso de descuento** | El campo de descuento muestra el tope de la línea y se detiene ahí, con *"Pide autorización"*. Nunca un error después de teclear |

#### Layout en tablet (768–1279 px) · el pasillo

**Éste es el dispositivo que `abarrotes` no tiene y aquí es de verdad.** El mostradorista camina con el
cliente hasta el rack y necesita el catálogo en la mano.

- **Una sola columna: la búsqueda y los resultados.** La venta se colapsa a una barra inferior:
  *"3 partidas · $1,616.00 ▴"*, que se despliega con un toque.
- Los resultados se vuelven **tarjetas de dos renglones** con la medida grande, la existencia, **la
  ubicación en negritas** y la foto en miniatura. La ubicación sube de rango porque es lo que se está
  usando en ese momento: se está caminando hacia ella.
- Los ocho grupos se vuelven **botones de 56×56 px**.
- **La foto (F-061) pasa a primer plano**: en el pasillo, con el cliente al lado, enseñar la foto es más
  rápido que explicar.

#### Layout en teléfono (<768 px)

Mismo caso que la tablet, con dos diferencias: la búsqueda por foto se apoya en la **cámara** —se toma
la foto de la pieza que trae el cliente ahí mismo— y la venta se edita poco: se arma y se manda a caja.
**Se dice explícitamente en la documentación comercial que el teléfono es para buscar y consultar, no
para cobrar**, igual que `abarrotes` advierte de su pantalla de cobro.

#### Qué NO va en esta pantalla

Reportes, gráficas, configuración, márgenes, costos, alertas de inventario, avisos del sistema. **Sólo
una excepción respecto de `abarrotes`, y está justificada:** la franja del cliente con su saldo. Allá
eso sería una distracción en la pantalla de ráfaga; aquí **es información operativa de la venta en
curso** y su ausencia es el dolor 1.

---

### PANTALLA 2 · FICHA DE PIEZA · el resultado ampliado

```
Propósito ......... resolver la duda cuando la tabla no basta
Frecuencia ........ 10 a 25 veces al día · mostradorista
Acción principal .. AGREGAR A LA VENTA
Primero se ve ..... la foto con escala y la medida en grande
```

```
┌─ Tornillo tirafondo 1/4" × 2" galvanizado ──────────────────────┐
│  ┌──────────┐   Fijación › Tornillo › Tirafondo                 │
│  │  [foto]  │   Medida    1/4" × 2"   ·   6.35 × 50.8 mm        │
│  │  con la  │   Rosca     tirafondo    Cabeza  hexagonal        │
│  │  moneda  │   Material  acero        Acabado galvanizado      │
│  └──────────┘   Marca     Fiero        SKU     FIJ-TT-0425      │
│                                                                  │
│  HAY   2,340 pz   ·  4 cajas + 340 sueltos  ·  ≈ 25.7 kg        │
│  DÓNDE Gaveta B-14, rack 2                                      │
│                                                                  │
│  PRECIO   pieza  $2.80      kilo (≈91 pz)  $195.00              │
│           caja 500          $1,180.00                            │
│                                                                  │
│  ▸ EQUIVALENTES                                        [ + ]     │
│    · Tornillo 6 mm × 50 mm galvanizado  (métrico)   $2.90       │
│    · Tirafondo 1/4×2 negro (si no importa el acabado) $2.40     │
│                                                                  │
│  ▸ VA CON        taquete 1/4 · rondana plana 1/4                │
│  ▸ SE USA EN     Lista "Colgar repisa"  ·  Lista "Fijar marco"  │
│  ▸ HISTORIAL     este cliente llevó 200 pz el 22-ago            │
│                                                                  │
│  Cantidad [ 120 ] [ pieza ▾ ]        [ AGREGAR A LA VENTA ]     │
└──────────────────────────────────────────────────────────────────┘
```

**Decisiones y su razón:**

- **La foto lleva referencia de escala** —una moneda, una cinta— porque sin escala una foto de tornillo
  no dice nada. Es el detalle que separa una galería inútil de una herramienta de venta.
- **La medida aparece en las dos notaciones**, pulgada y milímetro, siempre. Es la conversión que el
  mostradorista hace de cabeza cincuenta veces al día y que el electricista joven ya no sabe hacer.
- **El `[+]` de equivalentes es el botón más importante de la pantalla** y por eso está a la vista.
  F-060 sólo funciona si se alimenta **mientras se opera**: Chava acaba de descubrir que el métrico de
  6 mm sirve, lo declara en un clic, y a partir de ahí lo sabe el sistema y lo sabe Diego. **Si hubiera
  que ir a una pantalla de administración a capturarlo, no se capturaría nunca.**
- **"Va con"** es distinto de "equivalente": no lo reemplaza, lo acompaña. Es la venta complementaria y
  es media línea más por venta, que es el indicador del mostradorista (§4.4).
- **"Historial de este cliente"** contesta la pregunta diaria del contratista, *"¿qué cable me llevé la
  otra vez?"*, sin salir de la pantalla.

**Estados.** Sin foto: un botón grande **"Tomar foto"** que abre la cámara del teléfono. Sin
equivalentes: *"Nadie ha dicho todavía qué le puede sustituir. Si sabes, dilo aquí."* — el estado vacío
**pide la información**, porque ése es el mecanismo por el que la base se llena.

**En teléfono** la ficha ocupa la pantalla completa y la foto es lo primero, a ancho completo.

---

### PANTALLA 3 · CORTE DE MATERIAL ★ · F-145 + F-150

```
Propósito ......... vender una medida de una pieza continua, sin perder el resto
Frecuencia ........ 8 a 15 veces al día · mostradorista
Acción principal .. CORTAR Y AGREGAR
Primero se ve ..... de dónde se va a cortar y cuánto queda
Dispositivo ....... PC, y gemela en teléfono porque el corte se hace en el pasillo
```

**Por qué es una pantalla y no un campo de cantidad.** Porque cortar no es teclear un número: es
**elegir de qué pieza**, **decidir cuánto se desperdicia** y **decidir qué se hace con lo que queda**.
Tres decisiones, y si el sistema no las pide, se toman igual pero fuera del sistema, y el inventario de
material continuo se vuelve ficción en semanas (`03-INVENTARIO.md` §9 error 3).

```
┌─ Cortar · Cable THW calibre 12 negro ───────────────────────────┐
│                                                                  │
│  DE DÓNDE                                                        │
│  ● Rollo abierto R-114        quedan  37.00 m     ← sugerido    │
│  ○ Rollo cerrado (abrir uno)  quedan 100.00 m · hay 4            │
│                                                                  │
│  ⚠ Hay 37 m abiertos. Si abres uno nuevo, esos 37 se quedan.    │
│                                                                  │
│  CUÁNTO                                                          │
│  Medida entregada   [  30.00 ] m         $ 14.50 / m            │
│  Desperdicio        [   0.20 ] m         ← propuesto por el      │
│                                             tipo de material      │
│  ─────────────────────────────────────────────────────────────  │
│  Se descuenta del rollo   30.20 m                                │
│  Queda en R-114            6.80 m   ⚠ retazo chico              │
│                                                                  │
│  QUÉ HACER CON LO QUE QUEDA                                      │
│  ● Dejarlo como rollo abierto                                    │
│  ○ Marcarlo como retazo de remate    precio sugerido $10.15/m   │
│  ○ Darlo de baja (desperdicio)              costo  $ 61.20      │
│                                                                  │
│  Importe de la partida                          $ 435.00        │
│                     [ CORTAR Y AGREGAR ]  [ Cancelar ]          │
└──────────────────────────────────────────────────────────────────┘
```

**Decisiones y su razón:**

- **"De dónde" va primero y el abierto viene preseleccionado.** Es la prevención del error 3 completo.
  El aviso de *"si abres uno nuevo, esos 37 se quedan"* es una línea de texto y evita el retazo antes
  de crearlo, que es infinitamente más barato que rematarlo después.
- **El desperdicio se propone, no se pregunta en blanco.** Un campo vacío se deja en cero; un campo con
  el valor típico del material se corrige cuando toca. **Es la diferencia entre que se registre y que
  no se registre.**
- **La tercera decisión sólo aparece cuando el sobrante es chico.** Si quedaran 40 m, el bloque "qué
  hacer con lo que queda" no se muestra: es obvio que sigue siendo un rollo. Aparece cuando el sistema
  detecta que el resto cae bajo el umbral de retazo de ese material. **Preguntar siempre sería fricción;
  preguntar cuando importa es cuidado.**
- **El costo del desperdicio se muestra en pesos**, no en metros, cuando se da de baja. 6.80 m suenan a
  nada; $61.20 suenan a algo, y es lo que hace que el mostradorista se lo piense.

**Layout en teléfono.** Idéntico en contenido, en una columna, con los campos numéricos grandes. **Se
usa en el pasillo, junto al rack de rollos**, que es donde se corta de verdad.

**Variante para tramo (tubo, varilla).** El bloque "de dónde" lista **los pedazos cortados** primero,
con su medida: *"1.2 m · 2.4 m · 4.0 m · o abrir tramo nuevo (6 m)"*, y el sistema sugiere **el pedazo
más chico donde quepa**, que es cómo se aprovecha el material. El sobrante siempre se queda como pieza,
nunca se da de baja salvo que sea menor al umbral.

**Variante para lámina y vidrio.** El sistema **no lleva geometría** (`03-INVENTARIO.md` §2.2). Pide
cuántas hojas se abrieron y cuánto se cobró, y registra la merma en piezas fraccionarias. Se dice en la
pantalla con una línea: *"Se descuenta media hoja. El pedazo que sobra no se lleva en el sistema."* —
**Es honesto y es mejor que fingir precisión.**

---

### PANTALLA 4 · CAJA · cobrar la nota

```
Propósito ......... cobrar lo que el mostrador armó, o cobrar directo en modo A
Frecuencia ........ 25 a 60 veces al día · cajero
Acción principal .. COBRAR
Primero se ve ..... las notas pendientes y el total de la que se seleccionó
```

**Por qué existe como pantalla separada.** Por el modo B (`02-DINERO-Y-CAJA.md` §8.1): el que despacha
no cobra. En modo A esta pantalla y la 1 son la misma y el bloque de cobro se expande a la derecha,
exactamente como en `abarrotes`.

```
┌──────────────────────────────┬───────────────────────────────────────┐
│ NOTAS PENDIENTES        (4)  │  NOTA 1187 · Chava · 08:14            │
│ ─────────────────────────    │  Ing. Loera · obra Las Torres         │
│ ● 1187  Loera      1,616.00  │  Recoge: Martín Pérez ✓ autorizado    │
│   1188  mostrador    284.00  │ ─────────────────────────────────────  │
│   1189  Plomería V.  940.00  │  Tornillo 1/4×2 galv.  120 pz  336.00 │
│   1190  mostrador  3,210.00  │  Cable THW cal.12       60 m   870.00 │
│                              │  Cemento gris 50 kg      2 sc  410.00 │
│   ⏱ 1188 vence en 4 min      │ ─────────────────────────────────────  │
│                              │        TOTAL        $ 1,616.00        │
│ PAGADAS, SIN ENTREGAR   (1)  │                                       │
│   1184  Rodríguez    620.00  │  [ EFECTIVO ] [ TARJETA ]             │
│                              │  [ TRANSFER. ] [ A CUENTA ]           │
│ ─────────────────────────    │                                       │
│ Caja · Norma · $ 14,280.00   │  ⓘ A cuenta: debe $18,400 de $25,000  │
└──────────────────────────────┴───────────────────────────────────────┘
```

**Decisiones y su razón:**

- **Los cuatro métodos tienen el mismo tamaño.** En `abarrotes` el efectivo es el camino por omisión y
  los demás son desvíos, porque la respuesta es efectivo 200 de 220 veces. **Aquí cuatro métodos
  compiten de verdad** (`02` §5) y presuponer uno produce errores caros: una venta de $6,000 marcada
  como efectivo cuando fue transferencia descuadra el arqueo de forma escandalosa.
- **"A cuenta" se ve tan disponible como "Efectivo"**, porque es un tercio del valor. Esconderlo en un
  menú sería negar la forma del negocio.
- **La lista de "pagadas, sin entregar"** está siempre visible. Es el descuadre 5 y el bloqueo de
  cierre 1. Verla todo el día es lo que evita que alguien venda dos veces el mismo material.
- **El contador de vigencia de las notas** avisa antes de liberar, no después.
- **El saldo del cliente aparece también aquí**, aunque ya se vio en el mostrador, porque quien cobra es
  otra persona y **la decisión de cobrar a cuenta es suya**.

**Todo lo demás —apertura con fondo y denominaciones, movimientos, arqueo a ciegas, la cascada de "¿de
dónde salió el esperado?", los bloqueos antes de cerrar— se hereda de `abarrotes` §PANTALLA 9 sin
cambios de estructura**, con los renglones de este giro (`02-DINERO-Y-CAJA.md` §8.3) y **cuatro
bloqueos de cierre** en lugar de tres.

**Teléfono:** la caja no se opera desde el teléfono. Lo único que existe ahí es **confirmar una
transferencia** contra el banco, que es una acción que Norma hace desde donde esté.

---

### PANTALLA 5 · CUENTAS · la cartera de crédito ★

```
Propósito ......... saber quién debe, desde cuándo, de qué obra y a quién cobrarle
Frecuencia ........ 10 a 20 consultas rápidas al día · 1 revisión completa
Acción principal .. REGISTRAR PAGO
Primero se ve ..... el total, lo vencido, y los cinco más viejos
```

```
┌──────────────────────────────────────────────────────────────────────┐
│  LO QUE ME DEBEN     $ 186,400.00      34 clientes                   │
│  Vencido             $  41,200.00      9 clientes    ← rojo          │
│  Cobrado hoy         $   8,300.00      efectivo 4,300 · transf 4,000 │
├──────────────────────────────────────────────────────────────────────┤
│ ⌕ [ buscar cliente u obra........ ]   [ Todos ▾ ][ Vencidos ][ Hoy ] │
│                                                                       │
│ Cliente / obra           Debe      Más viejo  Límite  Últ. pago      │
│ ───────────────────────────────────────────────────────────────────  │
│ ▾ Ing. Loera          18,400.00     47 d ●   25,000   hace 22 d      │
│     · Las Torres      12,100.00     47 d ●                            │
│     · Col. Juárez      6,300.00     11 d                              │
│ ▸ Plomería del Valle  32,800.00     63 d ●   30,000 ⚠ hace 2 meses   │
│ ▸ Electricidad RM      9,240.00     18 d     15,000   ayer            │
│ …                                                                     │
│                                                                       │
│ [ Nuevo cliente ]  [ Estado de cuenta ]  [ A quién hablarle ]         │
└──────────────────────────────────────────────────────────────────────┘
```

**Decisiones y su razón, y dónde se separa del "Fiado" de `abarrotes`:**

- **La fila se abre por obra.** Es F-639 hecho visible. El saldo de un contratista sin desglose por obra
  es un número con el que no se puede tener una conversación de cobro. Con desglose, la llamada es
  *"de Las Torres me debes $12,100 y ésa ya te la pagaron"*.
- **"Más viejo" y no "fecha del último cargo"**, igual que en `abarrotes` y por la misma razón: la
  pregunta es *"¿desde cuándo me debe?"*.
- **El semáforo es por días** —verde hasta 15, ámbar 16–30, rojo 31+— y **el ⚠ del límite es
  independiente del color**, porque son dos problemas distintos: antigüedad y monto. El color nunca es
  el único portador de significado.
- **"Cobrado hoy" arriba, con el desglose por método.** Porque las transferencias entran fuera de la
  sesión de caja (`02` §8.3) y si no se ven aquí, no se ven en ninguna parte hasta el corte.
- **"A quién hablarle" genera una lista, no un envío.** Idéntico a `abarrotes`: **el sistema no manda
  cobranza automática**. Genera el texto, lo deja listo, y Beto decide.

#### La ficha del cliente de cuenta

```
┌─ Ing. Rodrigo Loera ───────── 55 2233 4455 ── RFC LORR8203… ─┐
│  Debe $18,400 · más viejo 47 días · límite $25,000           │
│  Lista de precio: CONTRATISTA (sin IVA)   Plazo: 30 días     │
│  Nota: "Paga cuando le depositan de la obra. Avisar antes     │
│         de cortarle el crédito."                              │
│                                                               │
│  OBRAS                                     [ + nueva obra ]   │
│   · Las Torres      $12,100   47 d ●   activa                │
│   · Col. Juárez      $6,300   11 d      activa                │
│   · Av. Reforma           $0           cerrada 12-jul         │
│                                                               │
│  QUIÉN PUEDE RECOGER                       [ + autorizado ]   │
│   · Martín Pérez      todas las obras     sin tope            │
│   · J. Ramírez        sólo Las Torres     hasta $3,000        │
│   · El "Güero"        ✖ dado de baja 02-sep                  │
│                                                               │
│  [ REGISTRAR PAGO ]  [ Estado de cuenta ]  [ Ver movimientos ]│
└───────────────────────────────────────────────────────────────┘
```

**El bloque de autorizados es F-638 y es el corazón del dolor 1.** Tres decisiones dentro:

- **El tope por autorizado** existe porque un albañil puede llevarse clavos y no puede llevarse un
  tinaco. Es el control que hoy no existe en ningún sistema del segmento.
- **El autorizado se da de baja, no se borra.** Las remisiones que firmó siguen siendo válidas y tienen
  que poder consultarse. Borrarlo rompería la trazabilidad justo del caso que importa.
- **La obra se cierra, no se borra**, por lo mismo.

**El pago se aplica a documentos, no al saldo** (F-614 en variante): al registrar, aparece la lista de
remisiones y facturas con casillas, el cliente elige, y el sistema sugiere el orden más viejo sin
imponerlo. **Aplicar al saldo automáticamente le rompe la conciliación al contratista con su propio
cliente**, y ése es el motivo por el que cambia de proveedor.

**Estados.** Vacío: *"Todavía no le das crédito a nadie. Cuando despaches con «Remisión a cuenta»
(F11), el cliente aparece aquí."* — el estado vacío enseña el flujo.

**Teléfono:** ésta es **la pantalla que Beto usa más en el teléfono**, junto con el dashboard. Se diseña
para 390 px con la misma lista ordenada por vencido, la ficha como hoja inferior, y el botón de llamar
a un toque desde cada fila.

---

### PANTALLA 6 · COTIZACIÓN

```
Propósito ......... armar 40 partidas para una obra, mandarla y darle seguimiento
Frecuencia ........ 2 a 6 por semana · encargado o dueño · 10 a 30 minutos cada una
Acción principal .. MANDAR
Primero se ve ..... el cliente, la vigencia y el total
Ritmo ............. EPISÓDICO. Es la única pantalla del modelo donde cabe un
                    formulario largo y con calma
```

- **Se arma con el mismo buscador** de la pantalla 1, en una columna, y las partidas se editan en tabla
  con cantidad, precio, descuento y **margen visible para el dueño**.
- **Vigencia obligatoria** —7, 15 o 30 días— porque el precio del cable y del acero se mueve, y una
  cotización sin fecha es una promesa abierta que se cobra cara.
- **Se manda por WhatsApp como PDF** y se copia como texto. El contratista la reenvía a su cliente.
- **Al volver, se convierte en venta o en pedido** con un botón, y se puede **surtir parcial**: lo que
  hay se entrega hoy, lo que no se pide. Cada surtido genera su remisión.
- **El seguimiento es de tres estados: pendiente, ganada, perdida — y "perdida" pide motivo** de una
  lista corta: precio, tiempo de entrega, no había, se fue con otro, la obra no salió. **Ese campo es
  el único dato de mercado que este negocio puede recolectar sin esfuerzo**, y a los seis meses dice si
  se está perdiendo por precio o por surtido, que son dos remedios opuestos.

**Qué NO va aquí:** cobro, inventario, márgenes para el encargado. Una cotización no mueve stock ni
dinero hasta que se convierte.

**Teléfono:** se consulta y se reenvía. No se arma. Cuarenta partidas en 390 px es una mala idea y
ofrecerlo sería vender una frustración.

---

### PANTALLA 7 · EXISTENCIAS

```
Propósito ......... contestar "qué hay, qué está dormido y qué está abierto"
Frecuencia ........ 4 a 10 veces al día · encargado, dueño, almacén
Acción principal .. ninguna única — lectura con cuatro filtros grandes
Primero se ve ..... los cuatro números que disparan decisión
```

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│ │ DORMIDO    │ │ BAJO MÍN.  │ │ ABIERTOS   │ │ NEGATIVO   │         │
│ │ $ 214,800  │ │     38     │ │     23     │ │      6     │         │
│ │ 1,840 claves│ │ de las 200 │ │ 7 con +45d │ │ revisar hoy│         │
│ │ 31% del inv│ │ que rotan  │ │            │ │            │         │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘         │
├──────────────────────────────────────────────────────────────────────┤
│ ⌕ [ buscar ]  Línea [ todas ▾ ] Gaveta [ todas ▾ ] Prov. [ todos ▾ ] │
│                                                                       │
│ Material                  Hay          Vendido 90d  Días inv.  Dónde │
│ ───────────────────────────────────────────────────────────────────  │
│ Tornillo 1/4×2 galv.    2,340 pz         1,180        178      B-14  │
│ Cable THW cal.12          437 m  (+ab)     820         48      R-02  │
│ Broca cobalto 3/8          14 pz              3      ▲420      B-31  │
│ Cemento gris 50 kg         62 sc            940          6      BOD  │
│ Tubo PVC 4"                31 pz  (+3ct)      44        63      BOD  │
│ Pulidora Truper 7"           4 pz             0       ▲sin      V-04 │
└──────────────────────────────────────────────────────────────────────┘
```

**Qué se ve primero y qué decisión dispara cada número:**

- **$214,800 dormido, 31% del inventario** → *¿qué remato y qué dejo de comprar?* **Es el indicador
  que este modelo tiene y `abarrotes` no**, y está en primer lugar porque es el dolor 2.
- **38 bajo mínimo, de las 200 que rotan** → *¿qué pido?* La segunda parte de la etiqueta es
  deliberada: deja claro que el mínimo **sólo aplica a las claves marcadas**, y evita que alguien
  pregunte por qué no salen las 6,000.
- **23 abiertos, 7 con más de 45 días** → *¿qué retazo remato antes de que se vuelva basura?*
- **6 en negativo** → *¿qué remisión o entrada no capturé?*

**Las columnas que `abarrotes` no tiene:**

- **"Vendido 90d" y no "14d"**, porque el ciclo de compra es quincenal o mensual y la rotación es de
  tres a cinco vueltas al año. Catorce días de historia en un material que se vende cada dos meses no
  dice nada.
- **"Días de inventario"**, que es la traducción de "tengo mucho" a "tengo dinero parado seis meses". Es
  **el número que hace entender el dolor 2**, y por eso está en la tabla y no escondido en un reporte.
  El `▲` marca lo que pasa del umbral de la línea; `▲sin` es lo que no se ha vendido nunca.
- **"(+ab)" y "(+3ct)"** indican material continuo con piezas abiertas o cortadas. Un clic despliega el
  detalle.

**Atajos:** `/` busca · `d` filtra dormido · `m` bajo mínimo · `a` abiertos · `n` negativos.

**Tablet:** la tabla pierde "Vendido 90d" y "Proveedor". Es el dispositivo del que surte en bodega.
**Teléfono:** los cuatro contadores apilados y debajo **sólo el dormido**, ordenado por dinero. Es lo
que Beto abre antes de ir al mayorista, exactamente como Don Chuy abre su lista de bajo mínimo.

**Qué NO va aquí:** costos ni márgenes para mostradorista y almacén; el kardex (vive en la ficha); los
movimientos del día (viven en Entradas).

---

### PANTALLA 8 · ENTRADAS · recepción y pedido

```
Propósito ......... recibir 200 líneas sin morir, y pedir sin recomprar lo dormido
Frecuencia ........ 2 a 5 veces por semana · encargado o almacén
Acción principal .. RECIBIR NOTA
Primero se ve ..... los pedidos en camino y lo que hay que pedir
Ritmo ............. EPISÓDICO. Cabe calma y cabe un archivo
```

**El bloque de recepción**, que es donde está el cuello de botella real del giro:

```
┌─ Entrada · Distribuidor Truper · 14-sep ────────────────────────┐
│  Proveedor [ Dist. Truper ▾ ]  Pago [ Crédito ▾ ]  Días [ 30 ]  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ① IMPORTAR ARCHIVO   ② ESCANEAR CONTRA PEDIDO   ③ MANUAL │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Archivo cargado: nota_truper_44821.xlsx                        │
│  198 líneas · 186 emparejadas ✓ · 12 sin emparejar ⚠            │
│                                                                  │
│  SIN EMPAREJAR — resuélvelas o quedan fuera                     │
│   TRU-14092  "Pinza pela cable 8\""      [ buscar… ] [ alta ]   │
│   TRU-14831  "Broca SDS 5/8 x 8"         [ buscar… ] [ alta ]   │
│   …                                                              │
│                                                                  │
│  ⚠ 7 materiales subieron de costo                               │
│   Cable THW cal.12   $9.80 → $10.60  (+8.2%)                    │
│     precio de venta sugerido $15.70 (hoy $14.50)   [ aplicar ]  │
│                                                                  │
│  A pagar $42,318.00 · vence 14-oct       [ GUARDAR ENTRADA ]    │
└──────────────────────────────────────────────────────────────────┘
```

**Decisiones y su razón:**

- **Tres caminos y el archivo primero**, porque doscientas líneas a mano son dos horas mal invertidas y
  mal capturadas. **De 198 líneas quedan 12 por resolver.** Es la diferencia entre que la entrada se
  capture el mismo día o "el fin de semana" — y las entradas que se capturan el fin de semana producen
  stock negativo toda la semana (`03-INVENTARIO.md` §9 error 2).
- **"Escanear contra pedido"** compara lo que llegó con lo que se pidió y **enseña lo que faltó**. Es la
  comparación que hoy nadie hace y por la que se pagan cajas que no llegaron.
- **El aviso de costo con precio sugerido** es lo que un ferretero llamaría *"el sistema me avisó antes
  de que vendiera a pérdida"*. En cable y cobre esto no es un lujo. Es el mismo mecanismo que
  `abarrotes` usa con la Coca, aquí con montos mayores y con más frecuencia.
- **La unidad se elige antes que la cantidad** y la equivalencia se muestra en vivo. Heredado de
  `abarrotes` §9 error 1, sin cambios.

**El bloque de pedido sugerido** lleva **una columna que `abarrotes` no tiene y que es la clave del
dolor 2**:

```
 PEDIDO SUGERIDO · Distribuidor Truper        mínimo $25,000
 Material              Hay  Vend.90d  Sugerido   DORMIDO en la línea
 Broca cobalto 3/8      14        3    ▸ 0 ◂     $18,400 en brocas ⚠
 Tornillo 1/4×2      2,340    1,180     1 caja   $1,200
 Cable THW cal.12      437      820     4 rollos $0
 ─────────────────────────────────────────────────────────────────
 Estimado $31,240 · crédito 30 días   [ Copiar ] [ Mandar WhatsApp ]
```

*Por qué la última columna, que es rara:* porque **es el único momento en que el dato del dinero
dormido puede cambiar la decisión**. Beto está a punto de pedir brocas porque el vendedor le trae
promoción; ver *"$18,400 en brocas ya paradas"* justo ahí es lo que detiene la compra. En un reporte de
fin de mes, ese mismo dato no cambia nada.

**Teléfono:** la recepción rápida con foto de la nota existe, para el caso del proveedor chico que llega
con diez líneas. **Las doscientas líneas no se capturan en teléfono** y no se ofrece.

---

### PANTALLA 9 · CONTEO · F-149 en variante

```
Propósito ......... contar una gaveta o un rack, a ciegas, en 20 minutos
Frecuencia ........ 1 vez al día · encargado o almacén
Acción principal .. CONTAR Y SIGUIENTE
Primero se ve ..... qué toca hoy y por qué toca eso
Dispositivo ....... TELÉFONO, igual que en `abarrotes`
```

**Todo el flujo se hereda de `abarrotes` PANTALLA 6 sin cambios de estructura**: a ciegas, captura
por presentación, conversión en vivo, resumen al cerrar con el contexto del porcentaje de referencia,
ajuste por producto con motivo, y el motivo por omisión **"diferencia de conteo"**, nunca "robo".

**Lo que cambia, y son tres cosas:**

1. **Qué toca hoy se elige por VALOR, no por días.** El encabezado lo dice: *"Gaveta B-14 · tornillería
   · $46,200 sin contar desde hace 71 días"*. Con 6,000 claves y tres meses de vuelta, contar taquetes
   de $0.40 antes que brocas de $180 desperdicia el recurso escaso.
2. **Tres modos de captura: por pieza, POR PESO y por medida.** El de peso es el que hace posible el
   conteo en este giro (`03-INVENTARIO.md` §6.2) y tiene su propia tarjeta con tara de la gaveta y
   conversión en vivo.
3. **La regla de tolerancia.** Si la diferencia cae dentro de la tolerancia declarada del producto, el
   sistema **no genera ajuste**: marca "dentro de tolerancia" y ofrece **recalibrar el peso por pieza**
   ahí mismo, con un botón que pide pesar 100 piezas contadas. Sin esta regla, el kardex se llenaría de
   ruido y el indicador de faltantes dejaría de servir.

```
┌─────────────────────────┐
│ Gaveta B-14 · $46,200   │
│ Sin contar hace 71 días │
│ ───────────────────────  │
│ Tornillo 1/4×2 galv.    │
│                          │
│  ○ Pieza  ● PESO  ○ Med.│
│                          │
│  Bruto   [ 26.14 ] kg   │
│  Tara gaveta   1.40 kg  │
│  Neto         24.74 kg  │
│  ≈ 2,249 piezas          │
│                          │
│ ┌────────────────────┐  │
│ │   SIGUIENTE   ✓    │  │
│ └────────────────────┘  │
│  14 de 31  ▓▓▓▓░░░░     │
└─────────────────────────┘
```

**Objetivos táctiles de 56×56 px**, no 44 — se cuenta de pie, con las manos sucias de grasa y polvo de
cemento. Es la misma regla que `abarrotes` aplica por el congelador, aquí por otra razón física.

---

### PANTALLA 10 · MATERIAL · ficha, medidas y presentaciones

```
Propósito ......... dar de alta bien y poner precio bien
Frecuencia ........ 10 a 40 materiales por semana · dueño o encargado
Acción principal .. GUARDAR
Primero se ve ..... la línea, los atributos y el margen que resulta
```

```
┌─ Tornillo tirafondo 1/4" × 2" galvanizado ─────────────────────┐
│  Línea [ Fijación ▾ ] › [ Tornillo ▾ ] › [ Tirafondo ▾ ]      │
│  IVA 16%        Gaveta [ B-14 ▾ ]    Almacén [ Mostrador ▾ ]  │
│                                                                 │
│  MEDIDAS  ← los campos salen de la línea, no son fijos         │
│  Diámetro [ 1/4" ] = 6.35 mm    Largo [ 2" ] = 50.8 mm        │
│  Rosca [ tirafondo ▾ ]  Cabeza [ hexagonal ▾ ]                 │
│  Material [ acero ▾ ]   Acabado [ galvanizado ▾ ]              │
│                                                                 │
│  PRESENTACIONES                                     [ + ]       │
│  ┌──────────┬─────────┬──────────┬──────────┬────────┐        │
│  │ Nombre   │ Factor  │ Código   │ Precio   │ Margen │        │
│  ├──────────┼─────────┼──────────┼──────────┼────────┤        │
│  │ pieza ★  │    1    │ (interno)│   $2.80  │ 38.2%  │        │
│  │ kilo     │ ≈ 91 ⚖  │ (interno)│ $195.00  │ 31.4%  │        │
│  │ caja 500 │   500   │ 750…07   │$1,180.00 │ 26.1%  │        │
│  └──────────┴─────────┴──────────┴──────────┴────────┘        │
│  ★ base · ⚖ factor por peso: 11.0 g/pz ± 8%  [ recalibrar ]   │
│                                                                 │
│  Costo promedio $1.73/pz   ·   Margen de la línea 41.0%        │
│  Existencia 2,340 pz · 4 cajas + 340 · ≈25.7 kg                │
│  Alta rotación [✓] → alerta de mínimo [ 800 ] pz               │
│                                                                 │
│  ▸ Equivalentes (2)   ▸ Va con (2)   ▸ Foto   ▸ Kardex         │
└─────────────────────────────────────────────────────────────────┘
```

**Decisiones y su razón:**

- **Los campos de medida salen de la línea**, no son una lista fija de cuarenta campos. Un tornillo
  tiene diámetro, largo, rosca, cabeza, material y acabado; un cable tiene calibre, hilos, forro y
  color. **Un formulario con los campos de todas las líneas sería inusable**, y es exactamente lo que
  hace que un sistema se sienta prestado.
- **La conversión pulgada ↔ milímetro se muestra en vivo mientras se teclea.** Es la normalización de
  F-059 hecha visible, y también es cómo se verifica que quedó bien capturada.
- **El margen se calcula por presentación contra el costo promedio real, mientras se teclea el
  precio**, y al lado va **el margen de la línea** como referencia. Heredado de `abarrotes` §PANTALLA 8,
  con la referencia de línea añadida porque aquí los márgenes normales van de 14% a 50% según la línea
  y un número suelto no dice nada.
- **La casilla "alta rotación" es la que enciende la alerta de mínimo.** Es explícita y es del dueño:
  marcar 200 de 6,000 claves es una decisión de negocio, no un cálculo.
- **"Recalibrar" está a la vista** junto al factor por peso, porque es la operación de dos minutos que
  evita que la desviación se acumule un año (`03-INVENTARIO.md` §2.4).

**Qué NO va aquí:** recetas, ingredientes, escandallo, área de preparación, alérgenos, caducidad,
régimen de IEPS, tasa distinta de 16%. **Son campos reales de la tabla `productos`** heredados de
`restaurante` y de `abarrotes`, y en esta plantilla **no se muestran**. Un formulario con doce campos
que no aplican es lo que hace que un sistema se sienta genérico — y aquí hay que ocultar **más** campos
que en `abarrotes`, porque este modelo apaga cosas que aquél enciende.

---

### PANTALLA 11 · TRABAJOS DE MOSTRADOR · F-258

```
Propósito ......... cobrar un trabajo que consume material propio
Frecuencia ........ 5 a 20 veces al día · mostradorista
Acción principal .. COBRAR TRABAJO
Primero se ve ..... los cuatro trabajos que se hacen todos los días
```

```
┌──────────────────────────────────────────────────────────┐
│  COPIA DE LLAVE        ENTONADO DE PINTURA               │
│  ┌──────┬──────┐       Base   [ Vinílica blanca 4L ▾ ]   │
│  │ común│ auto │       Color  [ Terracota 8-24     ▾ ]   │
│  └──────┴──────┘       Consume: base 1 pz + 3 colorantes │
│  Cantidad [ 2 ]        Precio base $420 + entonado $60   │
│  Consume: 2 llaves                                        │
│  $ 35.00 c/u           TOTAL $ 480.00                    │
│  ─────────────         ─────────────────                 │
│  CORTE DE VIDRIO       CUERDA A TUBO                     │
│  Medidas [ 60 ]×[ 40 ] Medida [ 1/2" ▾ ] Cant [ 4 ]      │
│  cm · $ 180.00         $ 15.00 c/u                        │
│                                                           │
│  [ AGREGAR A LA VENTA ]                                  │
├──────────────────────────────────────────────────────────┤
│  Hoy: 14 trabajos · $1,840 · margen 71%                  │
└──────────────────────────────────────────────────────────┘
```

**Decisiones y su razón:**

- **El material consumido se declara y se descuenta solo.** La llave virgen sale del inventario; la
  base y los colorantes también. Si no se descontara, el inventario de llaves vírgenes y de colorantes
  sería ficción y el margen del trabajo sería mentira.
- **El margen se muestra abajo, acumulado del día.** Con 60%–80% de margen, ver el número tres noches
  seguidas es lo que hace que Beto le dedique un pedazo de mostrador y le ponga precio bien. **Hoy eso
  no está en ningún reporte de ningún sistema del segmento.**
- **El trabajo entra como partida de la venta**, no como un ticket aparte, porque el cliente que manda
  hacer copias también lleva un candado.

**Estados.** Sin material para el trabajo (no hay llaves vírgenes): el botón se deshabilita con
*"No hay llaves comunes. Pídelas."*, no con un error genérico.

**La sección sólo existe si la perilla está encendida.** En una ferretería que no hace nada de esto,
**no aparece en la navegación**, no está en gris.

---

### PANTALLA 12 · FACTURACIÓN

```
Propósito ......... timbrar sin detener el mostrador
Frecuencia ........ 10 a 30 veces por semana · cajero o dueño
Acción principal .. TIMBRAR
Primero se ve ..... lo que está pendiente de facturar
```

- **Tres orígenes en la misma lista:** tickets del día que el cliente pidió facturar, **remisiones a
  crédito agrupadas por cliente y por mes**, y la **global del público en general**.
- **Agrupar remisiones es la operación principal**, no facturar un ticket. El contratista pide *"factúrame
  todo lo de septiembre de la obra Las Torres"*: se seleccionan las remisiones de esa obra, se timbra
  una factura. **F-639 hace esto posible y sin él sería imposible.**
- **La `ClaveUnidad` sale de la presentación** con la que se vendió y **no se muestra ni se pregunta**
  (`02-DINERO-Y-CAJA.md` §2.4). Nadie en el mostrador sabe que esto existe.
- **El complemento de pago (F-943)** se genera desde la pantalla de Cuentas al registrar el pago, no
  aquí. Es donde ocurre la acción.
- **Facturar no vuelve a ser venta.** La pantalla lo dice en una línea al pie la primera vez: *"Esto
  emite el comprobante. La venta ya se registró cuando entregaste el material."* Es el error contable
  más común del giro.

---

### PANTALLAS QUE SE HEREDAN SIN CAMBIOS

**Cortes** (`abarrotes` PANTALLA 10): lista de cortes históricos con folio, fecha, turno, quién cerró,
venta, diferencia y semáforo, ordenada por omisión por **diferencia**, no por fecha. Se reutiliza el
flujo completo, con el documento de ferretería en lugar del de abarrotes.

**Registros** (`abarrotes` PANTALLA 11): misma estructura, **seis reportes en lugar de cinco**, y la
lista es otra porque las preguntas son otras:

1. **Dinero dormido por línea y por proveedor** · el más importante. *¿Qué remato y qué dejo de comprar?*
2. **Rotación y días de inventario por línea** · la traducción del anterior a decisión de compra.
3. **Margen por línea contra su objetivo** · *¿estoy vendiendo lo que deja?*
4. **Cartera por antigüedad y por obra** · con el histórico de recuperación.
5. **Cotizaciones ganadas y perdidas, con motivo** · el único dato de mercado que este negocio junta.
6. **Ventas y margen por mostradorista, con líneas por venta** · §4.4, indicador 6.

**Qué NO va:** ventas por hora (la ferretería tiene dos picos fijos que Beto conoce), mapa de calor,
"total histórico de ventas" (adorno, prohibido en `04-SISTEMA-DE-DISENO.md` §4), clientes nuevos.

---

## 4.4 · EL DASHBOARD · F-056

**El dashboard de este modelo se diseña primero para PC**, y ésa es la primera diferencia con
`abarrotes`, que se diseña para 390 px. La razón es simple y es de negocio: **Don Chuy lee su corte en
la cama a las 22:45; Beto está en su ferretería todo el día**. Tiene una pantalla en la oficinita de
atrás y la mira entre cliente y cliente. La versión de teléfono existe y es para el domingo y para
cuando sale al mayorista.

Se calcula **sobre el día natural**, igual que en `abarrotes`, porque el negocio abre y cierra el mismo
día.

**Ocho indicadores.** Cada uno existe porque hay **una decisión concreta** que Beto toma al verlo. Si no
puedo nombrar la decisión, el indicador no va.

### Los ocho, en orden

| # | Indicador | Tamaño | La decisión que dispara |
|---|---|---|---|
| **1** | **Lo que me deben** · total, **vencido**, y **los tres más viejos con su obra** | Grande | *¿A quién le hablo hoy, y a quién le dejo de surtir?* Es el dolor 1 y es lo primero porque **es la pérdida que no admite vuelta atrás**. El desglose por obra es lo que hace posible la llamada: "de Las Torres me debes $12,100". |
| **2** | **Dinero dormido** · pesos a costo, % del inventario, y **las tres líneas peores** | Grande | *¿Qué remato y qué dejo de comprar?* Es el dolor 2. Va en pesos y no en número de claves, porque 1,840 claves no significa nada y $214,800 sí. |
| **3** | **Salió hoy y no se cobró** · importe, % de la venta, **y cuántas remisiones sin firma capturada** | Grande | *¿Cuánto de lo que vendí hoy todavía no es dinero?* Y el contador de remisiones sin firma es una **acción de hoy**: hay que capturarlas antes de cerrar. Es el único indicador del tablero que exige hacer algo en las próximas horas. |
| **4** | **Venta y margen de hoy**, con el comparativo contra **el mismo día de la semana pasada** | Mediano | *¿Voy bien o voy mal, y vendí o gané?* $14,600 no significa nada; **$14,600, −12% contra el martes pasado, margen 26% contra 29%** sí. El margen al lado de la venta separa "vendí mucho" de "gané mucho", que en un giro con líneas de 14% y de 50% se separan todos los días. |
| **5** | **Qué pedir** · sólo las claves de alta rotación, agrupadas por proveedor, **con el mínimo de pedido** | Mediano | *¿Ya junté el mínimo para pedirle a Truper?* Baja de rango respecto de `abarrotes`, donde es el indicador estrella, porque aquí el ciclo es quincenal y no diario. El mínimo de pedido es el dato que decide **cuándo**, no **qué**. |
| **6** | **Mostrador** · venta, ticket promedio y **líneas por venta** por persona, hoy y en el mes | Mediano | *¿Quién está vendiendo la solución completa y quién sólo despacha lo que le piden?* Es el indicador **prohibido en `abarrotes` y obligatorio aquí** (`01-FUNCIONES.md` §3.38). "Líneas por venta" es el que mide la asesoría, y es el que dice si las listas de trabajo y las equivalencias están funcionando. |
| **7** | **Lo que debo esta semana** · cuentas por pagar que vencen, con el día | Chico | *¿Voy a tener con qué el jueves?* Es la pregunta que quita el sueño y `abarrotes` reconoció en su P2 que le faltaba. Aquí está. |
| **8** | **Pendientes que se enfrían** · garantías sin resolver, rentas vencidas, rollos abiertos viejos, cotizaciones por vencer | Chico | *¿Qué se me está quedando olvidado?* Cuatro cosas chicas que individualmente no merecen tarjeta y que juntas son dinero detenido. Es un cajón, y está declarado como cajón a propósito en vez de fingir que son cuatro indicadores. |

### Qué NO va en el dashboard de este negocio, aunque exista el dato

| No va | Por qué |
|---|---|
| **Diferencia de conteo del mes** | **Y es la decisión más incómoda de esta carpeta.** En `abarrotes` es el indicador 4 y es el dolor 1. Aquí **no va al dashboard mientras las remisiones se capturen tarde y la merma de corte no se registre**, porque el ruido tapa la señal y un indicador que miente es peor que ninguno (`03-INVENTARIO.md` §7.2). Vive en el corte §11 y **sube al dashboard cuando el sistema pueda sostenerlo**. |
| **Ticket promedio como indicador suelto** | Va dentro del indicador 6, por persona, que es donde dispara una decisión. Solo, con tickets de $60 a $15,000, se mueve por azar. |
| **Ventas por hora / gráfica del día** | Dos picos fijos que Beto conoce desde hace catorce años. Decoración. |
| **Bajo mínimo de las 6,000 claves** | Cien avisos diarios es cero avisos. Ver `03-INVENTARIO.md` §8.2. |
| **Caducidad / próximos a vencer** | Un tornillo no se vence. La tarjeta de `abarrotes` aquí no existe. |
| **Recargas, servicios, saldo de comisionista** | F-255 apagada. |
| **Propinas** | No existen. Ver `02-DINERO-Y-CAJA.md` §4. |
| **Total histórico de ventas** | Adorno. Prohibido explícitamente. |
| **Cualquier gráfica de pastel** | Una lista ordenada contesta mejor y ocupa menos. |

### Qué cambia entre momentos

**En `abarrotes` el dashboard cambia entre las 6:50 y las 22:45.** Aquí no cambia por hora —Beto lo mira
todo el día— **pero sí cambia por día de la semana**, y es la única cosa que se mueve sola en todo el
sistema:

| Lunes a viernes | **Sábado** | **El día del pedido** |
|---|---|---|
| 1.º Lo que me deben | **1.º Venta y margen de hoy** | **1.º Qué pedir**, con el mínimo |
| 2.º Dinero dormido | 2.º Mostrador (venta por persona) | 2.º Dinero dormido, **al lado** |
| 3.º Salió y no se cobró | 3.º Salió y no se cobró | 3.º Lo que debo esta semana |
| — | El crédito baja: **el sábado casi no hay contratistas**, hay particulares que pagan | El resto baja |

El sábado es el día de mayor venta y de mayor asesoría por ticket, y es el único día en que la pregunta
"¿cómo vamos?" manda sobre "¿quién me debe?". El día del pedido lo marca el calendario del proveedor.

### Layout

**PC (≥1280 px) · el principal.** Tres columnas: izquierda con 1 y 2, que son los dos dolores y ocupan
más alto; centro con 3 y 4; derecha con 5, 6, 7 y 8 apilados. **Todo cabe sin scroll en 1366×768**, que
es la pantalla real de la oficinita de atrás.

**Tablet (768–1279 px).** Dos columnas; 1 y 2 al ancho completo arriba.

**Teléfono (<768 px).** Una columna: 1, 3, 2, 4 y el resto plegado en un acordeón. **El indicador 1
—lo que me deben— cabe entero sin scroll en un iPhone SE**, porque es lo que Beto abre cuando está
fuera y va a hablarle a alguien: necesita el nombre, el monto, la obra y el teléfono a un toque.

---

## 4.5 · MULTI-SUCURSAL

La ferretería que funciona abre la segunda, casi siempre **en la zona donde hay obra**, y ese momento
es la mayor oportunidad de venta del ciclo de vida del cliente.

**Qué se consolida:**

- **El dashboard del dueño**, con selector *Todas · Matriz · Sucursal 2*. En "Todas", los indicadores
  1, 2, 3, 4 y 7 se suman; el 5 (qué pedir) **se separa por sucursal**, porque el mínimo de pedido es
  por sucursal; el 6 (mostrador) se lista completo, porque comparar mostradoristas entre sucursales es
  útil.
- **El catálogo, las medidas, las equivalencias y las listas de trabajo.** **Compartidos siempre, sin
  excepción.** Es lo contrario de la existencia: el conocimiento se comparte, el material no. Una
  equivalencia que descubre Chava en la matriz sirve en la sucursal el mismo día, y **ése es el mayor
  beneficio de tener dos tiendas con este sistema**.
- **Los precios**, por omisión compartidos, con excepción por sucursal (F-024) cuando una está en zona
  de otro poder adquisitivo o con otra competencia enfrente.
- **La cartera de crédito. Consolidada, y aquí se separa de `abarrotes`.** Allá el fiado se separa
  porque doña Meche compra en la de la esquina. **Aquí el contratista compra en las dos**, según de qué
  obra venga, y un límite por sucursal sería un límite falso: con $25,000 en cada una, el crédito real
  es $50,000 y nadie lo decidió. **El límite es del cliente, no de la tienda**, y las dos sucursales
  ven el mismo saldo.

**Qué se separa siempre:**

- **La existencia.** Cada sucursal su almacén, y en este giro cada una con su mostrador y su bodega.
- **La caja y el corte.** Un corte por sucursal, siempre.
- **Las notas de mostrador, las ventas suspendidas y el conteo.**
- **Las piezas abiertas.** Un rollo abierto está físicamente en un lugar.

**Qué se traspasa:** material entre sucursales, constante en este giro —*"mándame dos rollos de cable
que se me acabaron"*—. **El traspaso necesita confirmación en destino**, igual que en `abarrotes`,
porque material que sale y no llega es la forma más común de robo entre sucursales. Y necesita algo que
allá no: **poder ver la existencia de la otra sucursal desde el mostrador**, porque la respuesta al
cliente *"no hay"* puede convertirse en *"lo tengo en la otra, te lo traigo mañana"*, que es una venta.

**Qué ve un encargado de sucursal contra el dueño:**

| | Encargado de sucursal | Dueño |
|---|---|---|
| Venta y margen | Sólo la suya | Todas, comparadas |
| Existencias | La suya, **y puede ver la de la otra** para pedir traspaso | Todas |
| Costos de compra | No | Sí |
| **Cartera** | **Completa, del cliente** — no sólo la suya | Completa |
| **Autorizar sobre el límite** | **No** | Sí |
| Cortes | Los suyos | Todos |
| Configuración | No | Sí |

**Autorizar sobre el límite es la única decisión que no se delega a la sucursal**, y es deliberado: es
la puerta por la que se pierde el dinero grande, y quien la abre tiene que ser quien lo pone.

---

## 4.6 · ACCESIBILIDAD Y CONDICIONES REALES

Este giro opera **de pie, con las manos sucias de grasa, cemento y polvo de fierro, con el mostrador a
la altura del pecho, con ruido de la calle y del compresor, con la cortina abierta y el sol
entrando**, y con gente que **no sabe cómo se llama lo que necesita**. Cada condición tiene una
consecuencia concreta.

| Condición real | Consecuencia de diseño |
|---|---|
| **Manos sucias de grasa, cemento y polvo** | **Objetivos táctiles de 56×56 px** en teléfono y tablet, no 44. Y una consecuencia que `abarrotes` no tiene: **el teclado de la PC del mostrador se ensucia y las teclas se traban**, así que **ningún atajo es indispensable** — todo lo que se hace con tecla se puede hacer con clic, sin excepción. |
| **Ruido: la calle, el compresor, la cortadora** | El beep del lector **no es el único aviso**. La partida agregada se resalta y aparece en la barra de estado. Tres canales redundantes, heredado de `abarrotes`. |
| **Sol directo con la cortina abierta** | Contraste 4.5:1 en texto normal y 3:1 en grande **como piso, no como objetivo**. La columna de existencia y la de ubicación —las dos que se leen de reojo desde un metro— usan el contraste máximo. |
| **El mostrador es alto y la pantalla se ve de pie, desde arriba** | Tamaño base de **15 px** en la pantalla de mostrador, un punto por encima del resto del sistema, igual que `abarrotes` hace en su cobro. Y **la tabla de resultados con filas de 32 px pero separación clara**, porque leer una tabla densa desde arriba y en ángulo es donde se salta el renglón. |
| **Cifras tabulares obligatorias** | En precio, existencia y **medida**. Una columna de medidas que baila —`1/4"`, `5/16"`, `1/2"`— es ilegible, y aquí es la columna que más se compara. |
| **El cliente no mira la pantalla** | Al revés que en `abarrotes`, donde el total es lo más grande porque el cliente lo lee desde el otro lado. **Aquí el cliente mira la pieza física**, y lo que hay que enseñarle es **la foto**, no el número. Por eso F-061 tiene un botón grande y el total no es lo más grande de la aplicación. |
| **Dos personas atendidas a la vez** | En el pico de la mañana, el mostradorista atiende a uno mientras otro espera. **La venta suspendida (F9) tiene que ser instantánea y visible**, con las suspendidas listadas al lado, o se pierde el hilo de una de las dos. |
| **Personal que rota, y uno que sabe todo** | **La prueba del recién llegado** (§7 de `04-SISTEMA-DE-DISENO.md`) aquí es más exigente que en ningún otro modelo: alguien que entró hoy tiene que poder **encontrar** una pieza sin que nadie le explique. La columna "Dónde", la foto y los equivalentes son exactamente eso. Y es medible: el indicador 6 del dashboard enseña si el nuevo está subiendo. |
| **Internet inestable** | Franja visible, venta de contado que continúa, **crédito bloqueado con el motivo escrito**. Ver `01-FUNCIONES.md` §3.42. |
| **Impresora sin papel** | El fallo de impresión **nunca** pierde la venta. Y aquí hay un caso propio: **si falla la impresión de una remisión, la venta no se puede cerrar como entregada**, porque no hay papel que firmar. Se guarda como pendiente de firma y aparece en el bloqueo de cierre 3. |
| **Vista cansada, 58 años** | Chava lleva treinta años en el giro y no trae los lentes. Cifras tabulares, 15 px de base, y **la medida en la columna más ancha y más contrastada de la tabla**, porque es el dato que él verifica de un vistazo. |

**Y la condición que no es física sino de confianza, y que aquí tiene una forma propia.** Este dueño no
fue defraudado por un sistema: fue **defraudado por sistemas hechos para otro negocio**. Su frase es
*"me hacía capturar el tornillo como si fuera un refresco"*. Eso significa que **cada pantalla tiene que
demostrar en los primeros diez segundos que entiende su catálogo**: la medida antes que el nombre, las
dos unidades del tornillo, el rollo abierto con sus 37 m, la gaveta B-14. Un solo formulario que le pida
una fecha de caducidad o una receta, y vuelve al talonario.

**Todo error dice qué pasó y qué hacer, en español de mostrador, sin códigos.** *"No se pudo guardar la
remisión: se cayó el internet. El material no salió del inventario. Intenta otra vez"* — nunca
*"Error 500"*. Y con una precisión que este giro exige: **el mensaje dice qué pasó con el material**,
no sólo qué pasó con la pantalla.
