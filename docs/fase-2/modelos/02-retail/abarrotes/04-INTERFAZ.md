# 04 · INTERFAZ · Abarrotes / tienda de conveniencia

**Éste es el archivo más largo de la carpeta y el que más se nota.** Los átomos no cambian —botón,
campo, tabla, tarjeta, diálogo son los mismos de `packages/ui` en los 78 modelos (D-03)—. Lo que
cambia es **la estructura**: qué es lo grande, dónde está, qué dice y qué hay alrededor.

**Las tres constantes de este modelo, que mandan sobre cada decisión que sigue:**

1. **El dispositivo principal es la PC con lector**, no la tablet. Se diseña primero, con atajos de
   teclado reales, y los otros dos se derivan. El teléfono es del dueño y es de **lectura y
   decisión**, no de cobro.
2. **El ritmo es ráfaga.** Cero diálogos en el camino feliz. Cero confirmaciones por adelantado:
   **deshacer inmediato** en su lugar. Cero animaciones de entrada. Un diálogo de tres pasos aquí
   es un desastre.
3. **La densidad es alta.** Filas de 32 px, cifras tabulares, poca decoración. Son 1,800 productos
   y 220 tickets al día, no doce platillos.

---

## 4.1 · VOCABULARIO DEL GIRO · F-017

| Entidad interna | En pantalla aquí | Plural | Género | En `restaurante` |
|---|---|---|---|---|
| `orden` | **venta** | ventas | f. | cuenta |
| `orden` (impresa) | **ticket** | tickets | m. | precuenta / ticket |
| `orden_linea` | **artículo** | artículos | m. | platillo |
| `producto` | **producto** | productos | m. | platillo |
| `insumo` | — **se apaga** | — | — | ingrediente |
| `unidad_servicio` | — **se apaga** | — | — | mesa |
| `responsable` | **cajero** | cajeros | m. | mesero |
| `cliente` | **cliente** · **marchante** en tono informal | clientes | m. | comensal |
| `cliente` con saldo | **cliente de fiado** | clientes de fiado | m. | — |
| `sesion_caja` | **caja del día** | — | f. | caja |
| `corte` | **corte** | cortes | m. | corte |
| `movimiento_stock` | **movimiento** | movimientos | m. | movimiento |
| `existencia` | **existencia** · en plural **lo que hay** | existencias | f. | existencia |
| `almacen` | **tienda** (uno solo por omisión) | — | f. | almacén |
| `zona` (nueva) | **zona de anaquel** | zonas | f. | zona del salón |
| `presentacion` (nueva) | **presentación** | presentaciones | f. | — |
| `compra` | **entrada** · **nota del proveedor** | entradas | f. | compra |
| `devolucion_proveedor` | **canje** | canjes | m. | — |
| `merma` | **merma** | mermas | f. | merma |
| `saldo_pendiente` | **lo que debe** | — | m. | — |
| `abono` | **abono** | abonos | m. | — |
| `deposito_envase` | **casco** | cascos | m. | — |
| `operacion_comision` | **servicio** (recarga, luz, paquete) | servicios | m. | — |

**Reglas que se aplican y que hay que respetar en los estados vacíos y los errores** (§3 de
`04-SISTEMA-DE-DISENO.md`, donde más se nota el descuido):

- *"No hay ventas todavía"*, no *"No hay órdenes"*.
- *"Este producto no está en el catálogo"*, no *"Entidad no encontrada"*.
- *"Don Rafael debe $340 desde hace 22 días"*, no *"Saldo pendiente: 340.00"*.
- El género importa: **la** venta, **el** ticket, **el** artículo, **la** existencia, **el** casco.

---

## 4.2 · NAVEGACIÓN

El orden es el del día de trabajo, no el alfabético ni el del sistema.

```
┌──────────────────┐
│  ● COBRAR        │  ← pantalla de inicio. Siempre la primera. Siempre resaltada.
│  ─────────────── │
│    Servicios     │  ← recargas y pago de servicios. Segundo porque es lo segundo que se hace
│    Fiado         │  ← la cartera. Tercero porque se consulta a media venta
│  ─────────────── │
│    Existencias   │  ← qué hay, qué falta, qué se vence
│    Entradas      │  ← recepción de proveedor y sugerencia de pedido
│    Conteo        │  ← el conteo cíclico del día
│  ─────────────── │
│    Productos     │  ← catálogo, precios, presentaciones
│    Clientes      │
│  ─────────────── │
│    Caja          │  ← apertura, movimientos, gastos, cierre
│    Cortes        │  ← históricos
│  ─────────────── │
│    Registros     │  ← reportes, margen por categoría, comparativos
│    Configuración │
└──────────────────┘
```

**Por qué ese orden, sección por sección:**

- **Cobrar arriba y separado.** Es el 90% del tiempo de uso del sistema. No compite con nada.
- **Servicios inmediatamente después**, porque la recarga y el pago de luz ocurren **entre dos
  ventas**, con el cliente enfrente, y meterlos abajo obliga a un viaje visual que cuesta segundos
  con fila. En `restaurante` no existe nada equivalente.
- **Fiado en tercer lugar** y no escondido en Clientes, porque se consulta **a media venta**. Es
  una pregunta de mostrador, no de oficina.
- **El bloque de inventario (Existencias · Entradas · Conteo) va junto y en ese orden** porque es
  el orden del proceso: veo qué falta → lo recibo → lo cuento. En `restaurante` el inventario vive
  después de recetas y compras porque allá el proceso es otro.
- **Productos abajo**, no arriba, aunque sea el catálogo. Porque se toca una vez a la semana. En
  `restaurante` Productos está arriba porque el menú cambia y se consulta; aquí 1,800 SKU no se
  navegan, se buscan.
- **Caja y Cortes al final**, porque son de apertura y de cierre: dos momentos al día, no doscientos.

**Por rol:**

| Rol | Ve | No ve |
|---|---|---|
| **Cajero** | Cobrar · Servicios · Fiado (consulta) · Conteo | Costos, márgenes, Registros, Configuración, Productos (edición) |
| **Encargado** | Todo salvo Configuración y costos de compra | Precios de compra por proveedor, utilidad neta |
| **Dueño** | Todo | — |

El cajero **no ve el costo ni el margen de ningún producto, en ninguna pantalla**. Es la misma
regla que `VE_COSTOS_DE_INSUMO` ya impone en el puente para `restaurante`, aplicada aquí: ver el
costo de compra es información que no necesita para cobrar y que sí sirve para negociar por fuera.

---

## 4.3 · LAS PANTALLAS, UNA POR UNA

---

### PANTALLA 1 · COBRAR

```
Propósito ......... convertir productos escaneados en una venta cobrada
Frecuencia ........ 50 a 400 veces al día · cajero · es el 90% del uso del sistema
Acción principal .. ESCANEAR. No hay botón: escanear es el estado por omisión
Primero se ve ..... el TOTAL, en el tamaño más grande de toda la aplicación
Jerarquía ......... 1 total · 2 lista de artículos · 3 cobro · 4 todo lo demás
Dispositivo ....... PC con lector. Es la única pantalla que NO se diseña para teléfono
```

#### Layout en PC (≥1280 px)

```
┌───────────────────────────────────────────────┬───────────────────────────────┐
│ ⌕ [código o nombre.................] F2       │                               │
│                                               │        T O T A L              │
│ ┌───────────────────────────────────────────┐ │      $  128.50                │
│ │ 3 × Coca-Cola 600 ml        18.00   54.00 │ │                               │
│ │ 1 × Sabritas adobadas 45 g  19.50   19.50 │ │  6 artículos                  │
│ │ 1 × Pan Bimbo grande        46.00   46.00 │ │  IVA incluido       $ 10.28   │
│ │ 1 × Frijol bayo  0.560 kg   16.07    9.00 │ │                               │
│ │                                    ▲ ↕    │ │  ┌─────────────────────────┐  │
│ │                                           │ │  │  COBRAR      F12        │  │
│ │                                           │ │  └─────────────────────────┘  │
│ │                                           │ │                               │
│ │                                           │ │  [ Efectivo exacto  ]         │
│ │                                           │ │  [ $200 ] [ $500 ]            │
│ │                                           │ │  Tarjeta F9 · Transfer. F10   │
│ │                                           │ │  Fiado  F11                   │
│ └───────────────────────────────────────────┘ │                               │
│                                               │  ─────────────────────────    │
│  F1…F8  ▸ Coca600 · Sabritas · Pan · Leche    │  Cliente: —          F4       │
│          Cigarro · Huevo · Tortilla · Agua    │                               │
├───────────────────────────────────────────────┴───────────────────────────────┤
│ Caja abierta · Lupita · 14:22 · 87 tickets hoy      Últ: Coca-Cola 600 ml ✓   │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Qué se ve primero, sin scroll ni clic:** el total. Está en la tipografía más grande que existe en
toda la aplicación —más grande que en `restaurante`— porque el cliente **también lo lee, desde el
otro lado del mostrador**, y porque leerlo en voz alta mientras se escanea es lo que hace que la
fila avance.

**Jerarquía y por qué:**
- **Primario · el total.** Es lo que el cajero dice en voz alta y lo que el cliente verifica.
- **Secundario · la lista de artículos.** Se lee de reojo para confirmar que lo último entró bien.
  Por eso **la línea recién escaneada se resalta un segundo** y la lista **crece hacia abajo con la
  última visible**, nunca con scroll automático que mueva las de arriba.
- **Terciario · el bloque de cobro.** El camino por omisión es efectivo y ya está preseleccionado.
- **Cuaternario · las ocho teclas rápidas.** Están abajo, en una sola fila, pequeñas. Se usan por
  su tecla, no por su posición.

**Lo que NO está en esta pantalla y en `restaurante` sí:**
- No hay paso de propina. Ninguno. Ver `02-DINERO-Y-CAJA.md` §4.
- No hay mapa, ni mesas, ni comensales, ni "enviar a preparación".
- No hay cuadrícula grande de productos con foto. Con 1,800 SKU es inútil, y ocupa el lugar que
  necesita la lista.

#### El comportamiento del escáner · F-986

Es lo único de esta pantalla que no se puede hacer mal.

| | |
|---|---|
| **Captura** | A nivel de `document`, no de un input. El foco **no se puede perder**: si el usuario hizo clic en otro lado, el siguiente escaneo funciona igual. |
| **Distinción lector vs. humano** | Por tiempo entre teclas: ≥8 caracteres con <35 ms entre ellos y terminados en `Enter` son el lector. Cualquier otra cosa va al campo de búsqueda. |
| **Sin *cooldown*** | Seis refrescos iguales son seis beeps y `× 6` en la línea. El *cooldown* de 1500 ms del componente de cámara actual es correcto para cámara e **inaceptable aquí**. |
| **Agrupación** | El mismo SKU **incrementa la línea existente**, no apila renglones. Seis renglones de "Coca 600" hacen ilegible la lista y esconden el error. |
| **Retroalimentación** | Beep corto + la línea resaltada 1 s + el nombre del último producto en la barra de estado. **Tres canales, porque hay ruido**: se oye, se ve en la lista, y se puede confirmar de reojo abajo. El color nunca es el único portador. |
| **Código no encontrado** | Beep **distinto** (dos tonos descendentes) + se abre el **alta rápida** con el código ya puesto. No un `toast` que se va solo. |
| **Código de peso embebido (F-148)** | El prefijo 2x se interpreta: se extrae el producto y el peso o el importe, y entra como línea de granel ya resuelta. |
| **Presentación (F-147)** | El código de la caja de 24 entra como `1 × caja` y descuenta 24 de la unidad base. La línea dice **"1 caja (24 pz)"**. |

#### Atajos de teclado

Éste es el punto donde este modelo se separa más de todo lo que existe hoy: **el repositorio actual
no tiene un solo atajo de teclado.** Aquí son el modo normal de operación.

| Tecla | Acción | Por qué |
|---|---|---|
| *(cualquier ristra del lector)* | Agregar producto | La acción principal no gasta ninguna tecla |
| **F2** | Foco al campo de búsqueda por nombre | El producto sin código o el que no leyó |
| **F1–F8** | Los ocho de siempre | El 80% de las líneas son ~30 productos. Ésos merecen una tecla |
| **+ / −** | Cantidad de la última línea | Lo más frecuente después de escanear |
| **\*** | Cantidad explícita de la última línea (`*12` Enter) | "Doce chicles" sin escanear doce veces |
| **Supr** | Quitar la última línea | **Deshacer, no confirmar.** El error se corrige, no se previene |
| **↑ / ↓** | Seleccionar otra línea | Para corregir una que no es la última |
| **F4** | Cliente (fiado) | Se necesita **antes** de cobrar, no después |
| **F7** | Cobrar un abono de fiado | Movimiento propio, no una venta |
| **F9 / F10 / F11** | Tarjeta · transferencia · fiado | El desvío del camino por omisión |
| **F12** | COBRAR en efectivo | La tecla que cierra el 80% de las ventas |
| **Esc** | Limpiar la venta (con deshacer de 5 s) | La venta abandonada es diaria |
| **F6** | Suspender la venta (F-224) | "Ahorita vengo por la cartera" |

**Regla:** ningún atajo usa `Ctrl` ni combinaciones. Una sola tecla. Con la mano izquierda en el
teclado y la derecha metiendo producto a la bolsa, una combinación de dos teclas no existe.

#### El cobro, en un paso

Al presionar **F12** no se abre un diálogo modal: se **expande el bloque derecho**.

```
   T O T A L        Recibí:  [ $ 200.00 ]        ← el foco ya está aquí
  $  128.50                                         y el teclado numérico funciona
                    C A M B I O
  6 artículos        $  71.50                     ← tamaño grande, se lee a un metro

                    [ Exacto ] [ 150 ] [ 200 ] [ 500 ]
                    ┌────────────────────────────────┐
                    │   CONFIRMAR        Enter       │
                    └────────────────────────────────┘
                    Esc para regresar
```

**Por qué no es un modal:** un modal oscurece el fondo, roba el foco, se cierra con animación y
obliga a dos viajes visuales. Doscientas veces al día eso son minutos. La expansión mantiene la
lista visible —el cliente sigue verificando— y el retorno a la venta siguiente es instantáneo.

**El cambio en grande** porque es el número que el cajero dice en voz alta y el que causa
discusiones. Y los botones de denominación porque `$200` es la respuesta en más de la mitad de los
tickets.

#### Estados

| Estado | Qué se ve |
|---|---|
| **Vacío (venta nueva)** | *"Escanea el primer producto"* en gris claro, centrado en la lista, con el ícono del lector. El total en `$0.00`. **El foco ya está capturando.** No hay nada que tocar. |
| **Cargando el catálogo** | Sólo al abrir sesión. Barra fina arriba con *"Cargando 1,847 productos…"*. La pantalla es usable con búsqueda por servidor mientras tanto. |
| **Caja cerrada** | Muro ámbar sobre la pantalla entera: *"La caja está cerrada. Ábrela para empezar a vender."* + botón. Mismo muro que en `restaurante`. |
| **Sin conexión** | Franja ámbar arriba: *"Sin internet · las ventas se guardan y se suben al volver"* + contador de ventas pendientes. **Se sigue vendiendo.** Ver F-988 y la decisión pendiente. |
| **Error al cobrar** | La venta **no se pierde nunca.** Mensaje en el bloque de cobro con qué pasó y qué hacer. La lista sigue ahí. |
| **Sin permiso** | El cajero que intenta descuento ve el campo deshabilitado con *"Pide autorización"*, no un error después de teclear. |
| **Producto con stock 0** | Se agrega igual, con un punto ámbar en la línea. No bloquea. Ver `03-INVENTARIO.md` §3.3. |
| **Producto restringido (F-980)** | La línea entra en rojo con candado: *"Venta de alcohol suspendida hasta las 09:00"*. **El resto del ticket se cobra normal.** |

#### Layout en tablet (768–1279 px)

La tablet **no es el dispositivo de esta pantalla**, pero existe: la tienda que opera con una tablet
y un lector Bluetooth en un mostrador chico.

- Las dos columnas se mantienen, pero el bloque de cobro pasa a **franja inferior fija**, a la
  altura del pulgar.
- Las teclas rápidas F1–F8 se vuelven **ocho botones de 56×56 px**, porque sin teclado físico no hay
  teclas de función.
- El campo de búsqueda invoca el teclado del sistema; el lector Bluetooth sigue funcionando por el
  mismo capturado.
- La lista de artículos pierde la columna de precio unitario si no cabe. **Nunca pierde la
  cantidad**: es la que se verifica.

#### Layout en teléfono (<768 px)

**Esta pantalla existe en el teléfono, pero no es para vender: es para el dueño que quiere probar
algo, o para la tienda que empieza sin PC.** Se dice explícitamente en la documentación comercial,
porque prometer "cobra desde tu celular" en un giro de ráfaga es vender una frustración.

- El total arriba, fijo. La lista debajo. El bloque de cobro como hoja inferior.
- Se apoya en la **cámara** (`BarcodeScanner.jsx`, que ya existe) con su *cooldown*, porque en
  teléfono no hay lector.
- Las teclas rápidas se colapsan a un carrusel horizontal de seis.
- **Qué desaparece:** el desglose de IVA, el conteo de artículos, la barra de estado.

#### Qué NO va en esta pantalla

Reportes, gráficas, configuración, catálogo completo, historial de ventas, alertas de inventario,
avisos del sistema, novedades, notificaciones. **Nada que no sea cobrar.** El único elemento
informativo permitido es la barra de estado de una línea abajo, y sólo porque confirma que el
escaneo funcionó.

---

### PANTALLA 2 · ALTA RÁPIDA DE PRODUCTO (diálogo desde Cobrar)

```
Propósito ......... convertir un "no está en el catálogo" en una venta y un alta
Frecuencia ........ 5 a 30 veces al día las primeras semanas · 1 a 3 después
Acción principal .. GUARDAR Y AGREGAR (Enter)
Primero se ve ..... el código, ya puesto, y el cursor en el nombre
```

**Por qué existe y por qué es tan importante.** En hora pico, "este producto no está en el
catálogo" tiene dos salidas: perder la venta o cobrarla sin registrar. Las dos son malas y las dos
pasan. El alta rápida convierte el hueco en el mecanismo por el cual el catálogo se completa solo
**durante la operación normal**, sin que nadie se siente a capturar. Es la respuesta a la objeción
número uno de la venta.

```
┌─ Producto nuevo ─────────────────────────────┐
│  Código   7501030490005          (ya puesto) │
│  Nombre * [ Gansito Marinela.............. ] │← foco
│  Precio * [ $ 18.00 ]     Costo [ $ 14.20 ] │
│  Categoría [ Pan y galletas          ▾ ]     │← IVA e IEPS salen de aquí
│                                              │
│  ▸ Más datos (stock, mínimo, presentaciones) │← colapsado
│                                              │
│  [ Guardar y agregar        Enter ]  [ Esc ] │
└──────────────────────────────────────────────┘
```

**Tres campos obligatorios y nada más.** Nombre, precio, categoría. El costo es opcional y se
corrige solo en la primera entrada de compra (F-633). El stock arranca en 0 y se corrige en el
primer conteo. **La tasa de IVA y el régimen de IEPS salen de la categoría**, que es la única
manera realista de que 1,800 productos queden bien clasificados.

**Estados.** Si el código ya existe con otro producto: *"Este código ya es de «Coca-Cola 600 ml».
¿Es una presentación nueva de ese producto?"* con un botón que lleva a agregar presentación. Es el
error que más va a pasar y hay que convertirlo en la acción correcta.

**En teléfono** el diálogo ocupa la pantalla completa y los tres campos quedan arriba del teclado.

---

### PANTALLA 3 · SERVICIOS · recargas y pago de servicios · F-255

```
Propósito ......... cobrar dinero ajeno y ganar la comisión, sin ensuciar la venta
Frecuencia ........ 15 a 60 veces al día · cajero
Acción principal .. COBRAR SERVICIO
Primero se ve ..... las seis operaciones más frecuentes, en botones grandes
```

#### Layout en PC

```
┌─────────────────────────────────────────────────────────────────┐
│  RECARGA                          PAGO DE SERVICIO              │
│  ┌────────┬────────┬────────┐     ┌────────┬────────┬────────┐  │
│  │ Telcel │ Movi-  │  AT&T  │     │  CFE   │ Telmex │  Sky   │  │
│  │        │ star   │        │     │        │        │        │  │
│  └────────┴────────┴────────┘     └────────┴────────┴────────┘  │
│                                    [ Otro servicio…       ▾ ]   │
│  Teléfono  [ 55________ ]          Referencia (escanea el       │
│  Monto     [ 20 ][ 30 ][ 50 ]       código del recibo)          │
│            [ 100 ][ 200 ][ otro ]  [ ..................... ]    │
│                                                                  │
│  Comisión para la tienda: $3.00    Importe  [ $ 1,240.00 ]      │
│                                    Comisión para la tienda: $8  │
│  ┌──────────────────────────┐                                   │
│  │  COBRAR $50.00           │      ┌──────────────────────────┐ │
│  └──────────────────────────┘      │  COBRAR $1,240.00        │ │
│                                     └──────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Saldo de recargas: $437.00  ⚠ bajo    ·  Hoy: 23 ops · $184 com.│
└─────────────────────────────────────────────────────────────────┘
```

**Decisiones y su razón:**

- **El código de barras del recibo se escanea.** El mismo capturador de la pantalla de cobro
  funciona aquí. Teclear una referencia de 24 dígitos con fila es el peor momento del día del
  cajero, y es donde se equivoca y paga el recibo de otro.
- **La comisión se muestra ANTES de cobrar**, en cada operación. Es lo único que convierte un
  trámite en un negocio a los ojos del tendero. Un sistema que no le enseña cuánto ganó por hacer
  eso, no le está enseñando que vale la pena hacerlo.
- **El saldo de recargas está fijo abajo**, con alerta cuando baja de $300. Quedarse sin saldo a
  las ocho de la noche es perder todas las recargas de la noche.
- **El dinero recibido entra a caja y no toca ventas.** El sistema lo dice en la pantalla, con esas
  palabras, la primera vez: *"Los $1,240 entran a la caja pero no cuentan como venta. Tu ganancia
  son $8."*

**Estados.** Sin saldo: los botones de recarga se deshabilitan con *"Deposita para seguir
recargando"* y el enlace al portal del comisionista. Operación fallida: **el dinero no se cobra y
el movimiento de caja no se escribe**. Las dos cosas o ninguna.

**Tablet:** igual, en dos filas apiladas. **Teléfono:** una operación a la vez, elegida de una
lista; el dueño la usa para consultar cuánto lleva de comisión, no para operar.

**Qué NO va aquí:** productos, carrito, mezcla con la venta. Un ticket de una tiendita **nunca**
mezcla un refresco con el recibo de la luz: son dos tickets, dos documentos y dos naturalezas.

---

### PANTALLA 4 · FIADO · la cartera

```
Propósito ......... saber a quién le debo cobrar y a quién no fiarle más
Frecuencia ........ 10 a 25 veces al día en consulta rápida · 1 vez al día completa
Acción principal .. REGISTRAR ABONO
Primero se ve ..... el total de la cartera y los cinco saldos más viejos
```

#### Layout en PC

```
┌──────────────────────────────────────────────────────────────────┐
│  LO QUE ME DEBEN        $ 14,820.00        38 clientes           │
│  Más de 30 días         $  4,310.00        9 clientes   ← rojo   │
├──────────────────────────────────────────────────────────────────┤
│ ⌕ [ buscar por nombre o teléfono........................ ]        │
│                                                                   │
│ Cliente          Debe      Más viejo   Límite   Último abono     │
│ ─────────────────────────────────────────────────────────────    │
│ Rafael Gómez     1,240.00   47 días ●  1,000  ⚠  hace 2 meses    │
│ Meche Ruiz         340.00   22 días ●    500     ayer            │
│ Sra. Carmen        180.00    4 días      300     hace 8 días     │
│ …                                                                 │
│                                                                   │
│ [ Nuevo cliente ]                    [ Exportar ]  [ A quién     │
│                                                       hablarle ] │
└──────────────────────────────────────────────────────────────────┘
```

**Por qué la columna "Más viejo" y no "fecha del último cargo":** porque la pregunta del tendero es
*"¿desde cuándo me debe?"*, no *"¿cuándo compró?"*. El saldo de 47 días es el que preocupa aunque
haya comprado ayer.

**El semáforo:** verde hasta 15 días, ámbar de 16 a 30, rojo de 31 en adelante. Y el ⚠ del límite
es **independiente del color**, porque son dos problemas distintos: uno es antigüedad y otro es
monto. El color nunca es el único portador de significado.

**"A quién hablarle"** genera una lista, no un envío. El sistema **no manda mensajes automáticos de
cobranza**: un mensaje automático a la vecina rompe la relación que sostiene todo el negocio.
Genera el texto, lo deja listo, y el dueño decide y manda desde su WhatsApp.

#### La ficha de un cliente

```
┌─ Rafael Gómez ────────────── 55 1234 5678 ──┐
│  Debe $1,240.00 · más viejo 47 días         │
│  Límite $1,000  ⚠ pasado                    │
│  Nota: "Paga los viernes. Trabaja en la      │
│         refaccionaria."                      │
│  ┌──────────────────┐ ┌───────────────────┐ │
│  │ REGISTRAR ABONO  │ │ Ver movimientos   │ │
│  └──────────────────┘ └───────────────────┘ │
└──────────────────────────────────────────────┘
```

**La nota es un campo de primera clase, no un extra.** *"Paga los viernes"* es exactamente el dato
que hace útil el módulo, y es el que hoy vive en la memoria de Don Chuy.

**Estados.** Vacío: *"Todavía no le fías a nadie. Cuando cobres una venta con «Fiado» (F11), el
cliente aparece aquí."* — el estado vacío enseña el flujo, no se disculpa.

**Teléfono:** ésta es la pantalla que el dueño **sí** usa en el teléfono, y mucho. Se diseña para
390 px con la misma lista, ordenada por días, y la ficha como hoja inferior. Es la segunda pantalla
más usada del teléfono después del dashboard.

---

### PANTALLA 5 · EXISTENCIAS

```
Propósito ......... contestar "qué hay, qué falta y qué se me va a echar a perder"
Frecuencia ........ 3 a 8 veces al día · encargado y dueño
Acción principal .. ninguna única — es una pantalla de LECTURA con tres filtros grandes
Primero se ve ..... los tres números que disparan decisión, y la lista bajo mínimo
```

#### Layout en PC

```
┌──────────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │
│  │ BAJO MÍNIMO  │ │ SE VENCE     │ │ EN NEGATIVO  │                 │
│  │      63      │ │      11      │ │       4      │                 │
│  │ 7 proveedores│ │ en 7 días    │ │ revisar hoy  │                 │
│  └──────────────┘ └──────────────┘ └──────────────┘                 │
├──────────────────────────────────────────────────────────────────────┤
│ ⌕ [ buscar................ ]  Zona [ todas ▾ ] Proveedor [ todos ▾ ] │
│                                                                       │
│ Producto              Hay            Mín  Vendido 14d  Vence  Prov.  │
│ ──────────────────────────────────────────────────────────────────── │
│ Coca-Cola 600 ml    238 pz (9 cj+4)   96      412      —      Coca   │
│ Leche Lala 1 L       14 pz            24       98    22-sep ●  Lala  │
│ Aceite 1 L 123        3 pz ▼          12       31      —      CEDA   │
│ Sabritas 45 g        −7 pz ✖          30      186      —      Sabri  │
│ Frijol bayo        14.3 kg            5 kg   22 kg     —      CEDA   │
└──────────────────────────────────────────────────────────────────────┘
```

**Qué se ve primero:** los tres contadores, porque cada uno dispara una acción distinta y concreta:
63 bajo mínimo → *qué pido*; 11 por vencer → *qué remato*; 4 en negativo → *qué entrada no capturé*.

**La columna "Hay" muestra las dos lentes** —`238 pz (9 cj + 4)`— porque el tendero cuenta cajas y
el sistema cuenta piezas, y la conversión tiene que estar a la vista o no se cree el número.

**"Vendido 14d" en vez de "vendido este mes":** porque el ciclo de compra de este giro es semanal o
quincenal, y catorce días es el horizonte real de la decisión. Un mes es demasiado tarde.

**El negativo se marca con ✖ y no con rojo solo**, y su fila lleva la acción sugerida al pasar el
cursor: *"Probablemente falta capturar una entrada"*. Ver `03-INVENTARIO.md` §9 error 2.

**Atajos:** `/` busca, `n` filtra negativos, `m` filtra bajo mínimo, `v` filtra por vencer.

**Tablet:** la tabla pierde "Vendido 14d" y "Proveedor" y se navega con los filtros. Es el
dispositivo del que repone anaquel.

**Teléfono:** los tres contadores como tarjetas apiladas, y debajo **sólo la lista bajo mínimo**,
agrupada por proveedor con el de mañana arriba. El dueño lo abre antes de ir al mayorista.

**Qué NO va aquí:** costos ni márgenes para el rol cajero; el kardex completo (vive en la ficha del
producto); los movimientos del día (viven en Entradas).

---

### PANTALLA 6 · CONTEO · el conteo cíclico · F-149

```
Propósito ......... contar una zona de anaquel en veinte minutos, a ciegas
Frecuencia ........ 1 vez al día · encargado, de pie, con el teléfono
Acción principal .. ESCANEAR Y TECLEAR CUÁNTOS HAY
Primero se ve ..... qué zona toca hoy y hace cuánto no se cuenta
Dispositivo ....... TELÉFONO. Es la única pantalla del modelo diseñada primero para móvil
```

**Por qué el teléfono manda aquí.** Se cuenta **frente al anaquel**, con una mano en el producto.
Una PC en el mostrador y un anaquel a cuatro metros producen el peor flujo posible: contar, caminar,
teclear de memoria, equivocarse. Ésta es la excepción a la regla del modelo, y está justificada por
dónde ocurre el trabajo.

#### Layout en teléfono (<768 px) · el principal

```
┌─────────────────────────┐
│ Zona: Reja de refrescos │
│ Hace 9 días · 24 prod.  │
│ ───────────────────────  │
│  [ ⌕ escanea o busca  ] │
│                          │
│  Coca-Cola 600 ml        │
│  ┌──────┐  ┌──────┐     │
│  │  9   │  │  4   │     │
│  │cajas │  │piezas│     │
│  └──────┘  └──────┘     │
│       = 220 pz           │
│  ┌────────────────────┐ │
│  │  SIGUIENTE   ✓     │ │
│  └────────────────────┘ │
│                          │
│  Contados 14 de 24  ▓▓▓░ │
│  [ Terminar zona ]       │
└─────────────────────────┘
```

**A ciegas, siempre.** No se muestra el esperado antes de contar. Misma regla del arqueo (§5 de
`04-SISTEMA-DE-DISENO.md`), misma razón: si se muestra, todo el mundo teclea ese número y el
conteo deja de existir.

**Dos campos, cajas y piezas**, porque así se cuenta un anaquel. El sistema convierte y muestra la
equivalencia en vivo.

**Objetivos táctiles de 56×56 px**, no 44. Se cuenta de pie, con una mano ocupada, a veces con las
manos frías del congelador.

#### Al terminar la zona

```
┌─────────────────────────────────────────────┐
│  Reja de refrescos · 24 productos           │
│  ✓ 19 cuadraron                             │
│  ▼  4 faltaron        −$186.40              │
│  ▲  1 sobró           + $18.00              │
│  ─────────────────────────────────────      │
│  Diferencia neta      −$168.40  (1.9%)      │
│  El promedio del retail mexicano es 1.5–2.5%│
│                                             │
│  Sabritas 45 g   esperado 37  contaste 30   │
│    ▸ ¿Recontar?   ▸ Ajustar   ▸ Ver motivo  │
│                                             │
│  [ Ajustar todo y cerrar la zona ]          │
└─────────────────────────────────────────────┘
```

**El contexto de la cifra es parte del diseño.** Un `−1.9%` a secas no significa nada para Don Chuy.
`−1.9%, y el promedio del retail mexicano es 1.5–2.5%` le dice si tiene un problema o no, y ésa es
la única razón por la que se le enseña el número.

**El ajuste es un movimiento por producto, con motivo**, no un botón mágico. Y el motivo por
omisión es *"diferencia de conteo"*, **nunca "robo"**: el sistema no lo sabe y acusar sin prueba es
la forma más rápida de generar un conflicto injusto.

**Layout en PC:** dos columnas, la lista de la zona a la izquierda y el producto en curso a la
derecha, con los atajos `+`, `−`, `Enter` para avanzar. Se usa cuando el mostrador y el anaquel
están juntos.

---

### PANTALLA 7 · ENTRADAS · recepción y sugerencia de pedido

```
Propósito ......... recibir al proveedor y pedirle bien, de pie, en cinco minutos
Frecuencia ........ 8 a 14 veces por semana · encargado
Acción principal .. RECIBIR NOTA
Primero se ve ..... quién viene hoy y qué hay que pedirle
```

#### Layout en PC

```
┌───────────────────────────────┬──────────────────────────────────────┐
│  HOY TOCA                     │  PEDIDO SUGERIDO · Coca-Cola FEMSA   │
│  ● Coca-Cola  (preventa)      │  Producto        Hay  14d  Sugerido  │
│  ● Bimbo      (entrega)       │  Coca 600 ml     238  412   6 cajas  │
│                               │  Coca 2 L         41   96   4 cajas  │
│  MAÑANA                       │  Sprite 600       62   88   2 cajas  │
│  ○ Sabritas                   │  Fanta 600        18   54   3 cajas  │
│                               │  Ciel 1 L          9   71   4 cajas  │
│  ─────────────────────────    │  ──────────────────────────────────  │
│  [ + Nueva entrada ]          │  Estimado $4,860 · crédito 15 días   │
│                               │  [ Copiar lista ] [ Mandar WhatsApp ]│
├───────────────────────────────┴──────────────────────────────────────┤
│  ÚLTIMAS ENTRADAS                                                     │
│  Hoy 06:40  Bimbo      +54 pz / −9 canje    $1,158.00   contado      │
│  Ayer       Sabritas   +180 pz              $2,400.00   contado      │
└───────────────────────────────────────────────────────────────────────┘
```

**"Hoy toca" es el corazón de esta pantalla.** El sistema sabe qué proveedor viene hoy porque el
proveedor tiene día de visita, y prepara la lista **antes de que llegue**. Eso es lo que convierte
el módulo de compras de "trámite de oficina" a "herramienta de mostrador", y es la función que paga
la renta del sistema (dolor 3).

**El sugerido no se inventa:** es `venta de 14 días ÷ días hasta la próxima visita × factor de
seguridad − existencia`, redondeado **hacia arriba a la presentación de compra**. Se pide en cajas
porque el proveedor vende en cajas. Y es **editable**: el sistema sugiere, el tendero decide.

#### La recepción de una nota

```
┌─ Entrada · Bimbo · 14-sep 06:40 ────────────────────────┐
│  Proveedor [ Bimbo ▾ ]   Pago [ Contado ▾ ]  Días [ — ] │
│                                                          │
│  ENTRA                                                   │
│  ⌕ [ escanea o busca... ]                                │
│  Pan blanco gde   [ 18 ] [ pieza ▾ ]  $32.10   $577.80  │
│  Bimbollos        [ 12 ] [ pieza ▾ ]  $28.40   $340.80  │
│                                                          │
│  CANJE / DEVOLUCIÓN                            [ + ]     │
│  Pan blanco gde   [ 6 ]  caducado                        │
│                                                          │
│  ────────────────────────────────────────────────────    │
│  A pagar  $918.60        [ GUARDAR ENTRADA ]             │
│  ⚠ El pan blanco subió de $30.50 a $32.10 (+5.2%)       │
│     Precio de venta sugerido: $48.00 (hoy $46.00)        │
└──────────────────────────────────────────────────────────┘
```

**El canje en la misma nota** (`03-INVENTARIO.md` §4.2). Si se captura por separado, nunca se
captura.

**La unidad se elige ANTES que la cantidad** y la equivalencia se muestra en vivo. Es la prevención
del error de inventario número uno.

**El aviso de cambio de costo con precio sugerido** es lo que un tendero llamaría *"el sistema me
avisó antes de que perdiera dinero"*. Aparece aquí y se repite en el corte.

**Teléfono:** la recepción completa funciona en teléfono, con foto de la nota, porque ocurre de
pie a las 6:40 de la mañana. El pedido sugerido también, porque el preventista está enfrente.

---

### PANTALLA 8 · PRODUCTO · ficha y presentaciones

```
Propósito ......... poner precio bien y declarar las presentaciones
Frecuencia ........ 5 a 20 productos por semana · dueño o encargado
Acción principal .. GUARDAR
Primero se ve ..... el precio, el costo promedio y el margen que resulta
```

```
┌─ Coca-Cola 600 ml PET ────────────────────────────────────────┐
│  Categoría [ Refrescos ▾ ]   IVA 16%   IEPS $3.0818/L         │
│  Zona de anaquel [ Reja de refrescos ▾ ]                      │
│                                                                │
│  PRESENTACIONES                                     [ + ]      │
│  ┌──────────┬────────┬──────────────────┬──────────┬────────┐ │
│  │ Nombre   │ Factor │ Código           │ Precio   │ Margen │ │
│  ├──────────┼────────┼──────────────────┼──────────┼────────┤ │
│  │ pieza ★  │    1   │ 7501055300945    │  $18.00  │ 14.2%  │ │
│  │ six      │    6   │ 7501055363957    │  $99.00  │ 10.1%  │ │
│  │ caja     │   24   │ 7501055310548    │ $372.00  │  6.8%  │ │
│  └──────────┴────────┴──────────────────┴──────────┴────────┘ │
│  ★ = unidad base. Todo el inventario se guarda en piezas.     │
│                                                                │
│  Costo promedio  $15.44 / pieza    Margen categoría  12.4%    │
│  Existencia      238 pz  ·  9 cajas + 1 six + 4 pz            │
│  Mínimo [ 96 ] pz          Vendido 14 días: 412 pz            │
└────────────────────────────────────────────────────────────────┘
```

**El margen se calcula y se muestra mientras se teclea el precio**, por presentación, contra el
costo promedio real. Es la prevención del error de inventario número 3.

**La unidad base está marcada y explicada en una línea.** Es el concepto que más confunde y que más
importa, y una línea de texto ahí ahorra una llamada de soporte por cliente.

**Qué NO va aquí:** recetas, ingredientes, escandallo, tiempos de preparación, área de preparación,
alérgenos. Son campos reales de la tabla `productos` heredados de `restaurante` y en esta plantilla
**no se muestran**. Un formulario con doce campos que no aplican es exactamente lo que hace que un
sistema se sienta prestado.

---

### PANTALLA 9 · CAJA

```
Propósito ......... abrir, mover dinero y cerrar cuadrando
Frecuencia ........ 2 veces al día completas + 5 a 15 movimientos
Acción principal .. depende del momento: ABRIR · REGISTRAR · CERRAR
Primero se ve ..... el estado de la caja y cuánto lleva
```

#### Apertura

```
┌─ Abrir caja ────────────────────────────────┐
│  Efectivo inicial contado *   [ $ 800.00 ]  │
│  ▸ Desglose por denominación (recomendado)  │
│     $100 [ 4 ]  $50 [ 8 ]  $20 [ 3 ]        │
│     $10 [ 12 ]  $5 [ 8 ]  $2 [ 10 ] $1 [ 20]│
│  Saldo de recargas            [ $1,065.00 ] │
│  Notas                        [ .......... ]│
│  [ ABRIR CAJA ]                             │
└─────────────────────────────────────────────┘
```

**El desglose por denominación no existe en `restaurante` y aquí sí**, por una razón operativa:
el fondo de una tiendita existe **para dar cambio**, y $800 en dos billetes de $500 no sirven. Con
el desglose, el sistema puede avisar *"te vas a quedar sin monedas de $10"* a media tarde.

#### Movimientos del día

Lista cronológica con el tipo, quién, cuánto y el efecto en el cajón. **Los once tipos que no son
venta llevan una marca visual distinta** de los que sí lo son, porque es lo que hace legible el
corte después.

#### Cierre · el arqueo a ciegas

```
PASO 1   Efectivo contado físicamente *   [ $ ______ ]
         ▸ contar por denominación
PASO 2   Saldo de recargas al cierre      [ $ ______ ]
         ↓ (sólo después de teclear)
PASO 3   Esperado $5,444.50 · Contaste $5,398.00
         DIFERENCIA  −$46.50   ▼ falta
         ▸ ¿De dónde salió el esperado?   ← despliega la cascada de 11 renglones
```

**El desplegable "¿De dónde salió el esperado?"** es la pieza que hace que este arqueo se entienda.
Muestra la cascada completa de `02-DINERO-Y-CAJA.md` §9.3 sección 4. Sin ella, el cajero ve un
número que no puede reconstruir y concluye que el sistema está mal.

**Bloqueos antes de cerrar:** ventas en espera sin resolver, ventas sin sincronizar, saldo de
recargas sin capturar. Se verifica **dos veces** —al abrir el diálogo y justo antes de ejecutar—
igual que en `restaurante`, para cerrar la carrera de los treinta segundos que tarda el conteo.

---

### PANTALLA 10 · CORTES

Lista de cortes históricos con folio, fecha, turno, quién cerró, venta, diferencia y un semáforo.
Se abre el PDF de cualquiera. **La columna que se ordena por omisión es la diferencia**, no la
fecha: el dueño entra aquí buscando el día que no cuadró.

Se reutiliza el flujo de `restaurante` tal cual (`CorteViewerDialog.jsx`, `pdfDownload.js`), con
el documento de abarrotes en lugar del de restaurante.

---

### PANTALLA 11 · REGISTROS

```
Propósito ......... contestar preguntas de gestión que no caben en el corte
Frecuencia ........ 2 a 5 veces por semana · dueño
Acción principal .. ninguna. Es lectura y exportación
```

Cinco reportes, y **sólo cinco**, porque un menú de veinte reportes en este giro no se usa:

1. **Margen por categoría** · el más importante. Contesta *"¿estoy vendiendo lo que deja?"*.
2. **Más vendidos y menos vendidos** · el segundo lista los que no se mueven hace 45 días, que es
   dinero dormido en el anaquel.
3. **Comparativo de periodos** · esta semana contra la pasada, este mes contra el anterior.
4. **Historial de precios y costos de un producto** · para ver cuánto ha subido la Coca en el año.
5. **Cartera de fiado a una fecha** · con antigüedad.

**Qué NO va:** ventas por hora (bonito y no dispara nada en una tienda con horario fijo), mapa de
calor, ranking de cajeros (tres personas, todas conocidas), "total histórico de ventas" (es un
adorno, prohibido en `04-SISTEMA-DE-DISENO.md` §4).

---

## 4.4 · EL DASHBOARD · F-056

**El dashboard de este modelo se diseña primero para 390 px.** Lo lee el dueño en el teléfono, dos
veces al día: a las 6:50 antes de abrir y a las 22:45 después del corte. En `restaurante` lo lee el
encargado en la PC de caja, sobre la caja abierta; aquí se calcula **sobre el día natural**, porque
la tienda abre a las 7 y cierra a las 22:30 y el día es el día.

**Siete indicadores.** Ni doce ni tres. Cada uno existe porque hay **una decisión concreta** que
Don Chuy toma al verlo. Si no puedo nombrar la decisión, el indicador no va.

### Los siete, en orden

| # | Indicador | Tamaño | La decisión que dispara |
|---|---|---|---|
| **1** | **Venta de hoy** con la comparación contra el mismo día de la semana pasada | Grande | *¿Voy bien o voy mal?* Es lo primero que quiere saber y lo único que ya sabe hoy. El comparativo es lo que le agrega valor: $6,400 no significa nada; **$6,400, −18% contra el martes pasado** sí. |
| **2** | **Margen de hoy, en pesos y en %**, con el margen del mes al lado | Grande | *¿Vendí mucho o gané mucho?* Son cosas distintas y en este giro se separan todos los días. Un día de mucha venta de refresco es un día de poca utilidad. Es el indicador que más le va a enseñar del negocio. |
| **3** | **Qué pedir · agrupado por proveedor, con el de mañana arriba** | Grande, lista | *¿Qué le pido al que viene mañana?* Es el dolor 3 y el que paga la renta. No es "63 productos bajo mínimo": es *"Mañana viene Coca. Pídele 6 cajas de 600 ml, 4 de 2 L y 3 de Fanta."* |
| **4** | **Diferencia de conteo del mes**, en pesos y en % de la venta, contra el 1.5–2.5% de referencia | Mediano | *¿Me están robando?* Es el dolor 1 y la razón número uno de compra. Con el contexto de la referencia, porque el número solo no significa nada. **Si el conteo cíclico no se está haciendo, este indicador dice eso en vez de mentir con un cero.** |
| **5** | **Fiado · total, otorgado hoy, y los tres más viejos** | Mediano | *¿A quién le hablo y a quién dejo de fiarle?* Es el dolor 2. "Otorgado hoy" es el número que corrige la conducta esa misma noche. |
| **6** | **Se vence esta semana** · productos y su valor a costo | Chico | *¿Qué remato el fin de semana?* Merma prevenible en las categorías de menor margen, que es donde más duele. |
| **7** | **Caja** · si está abierta, quién, cuánto lleva, y la diferencia del último cierre | Chico | *¿Cerró bien ayer? ¿Está abierta ahora?* Dos preguntas de control con una mirada. |

### Qué NO va en el dashboard de este negocio, aunque exista el dato

| No va | Por qué |
|---|---|
| **Ticket promedio** | En un giro donde el ticket va de $20 a $80 por la naturaleza del surtido, el promedio se mueve por azar y no dispara nada. Va en el corte como referencia, no en el dashboard como indicador. |
| **Ventas por hora / gráfica del día** | La tienda tiene tres picos fijos que Don Chuy conoce desde hace diecinueve años. Es decoración. |
| **Ventas por cajero** | Son tres personas y él las conoce. Lo que sí importa —cancelaciones y descuentos por persona— está en el corte, que es donde se revisa el control. |
| **Total histórico de ventas** | Adorno. Prohibido explícitamente en `04-SISTEMA-DE-DISENO.md` §4. |
| **Número de productos en catálogo** | No dispara nada. |
| **Clientes nuevos** | En una tiendita los clientes son los vecinos. No hay adquisición que medir. |
| **Propinas** | No existen. Ver `02-DINERO-Y-CAJA.md` §4. |
| **Cualquier gráfica de pastel** | Densidad alta, decisión rápida, pantalla de 390 px. Una lista ordenada contesta mejor y ocupa menos. |

### Qué cambia a las 6:50 y a las 22:45

**Sí cambia, y es una de las pocas cosas que se mueven solas en todo el sistema.**

| A las 6:50 (antes de abrir) | A las 22:45 (después del corte) |
|---|---|
| **1.º Qué pedir hoy**, con el proveedor de hoy arriba | **1.º Venta y margen del día**, con el comparativo |
| 2.º Se vence esta semana | 2.º Diferencia de conteo |
| 3.º Caja del día anterior y su diferencia | 3.º Fiado otorgado hoy |
| La venta de hoy está en cero y **no se muestra**: un `$0.00` grande a las 7 de la mañana es ruido | Qué pedir mañana baja al tercer lugar, pero sigue visible porque es lo que va a olvidar |

El corte del punto 1 es la hora de apertura configurada del negocio, no una hora fija.

### Layout

**Teléfono (<768 px) · el principal.** Una columna. Los indicadores 1 y 2 en una tarjeta doble
arriba. El 3 como lista con acordeón por proveedor. Del 4 al 7 como tarjetas apiladas. **Todo lo
importante cabe sin scroll en un iPhone SE**, porque la lectura de las 22:45 es de treinta segundos
en la cama.

**PC (≥1280 px).** Tres columnas: izquierda con 1, 2 y 7; centro con 3, que es el más grande;
derecha con 4, 5 y 6. Se usa cuando el dueño se sienta el domingo.

**Tablet (768–1279 px).** Dos columnas, el 3 ocupando el ancho completo arriba.

---

## 4.5 · MULTI-SUCURSAL

Don Chuy tiene una tienda. Pero el tendero que funciona abre la segunda, y ese momento es la
oportunidad de venta más grande del ciclo de vida del cliente, así que hay que tenerlo pensado.

**Qué se consolida:**
- **El dashboard del dueño**, con un selector *Todas · Matriz · Sucursal 2* arriba. En "Todas", los
  indicadores 1, 2, 4 y 5 se suman, y el 3 (qué pedir) **se separa por sucursal**, porque el
  proveedor visita cada tienda por separado.
- **El catálogo y los precios**, por omisión compartidos. Con excepción por sucursal (F-024) cuando
  una está en una zona de otro poder adquisitivo, que es la razón real por la que se separan.
- **Los reportes de margen por categoría**, con comparación entre sucursales. Es el reporte que
  hace que el dueño vea cuál de sus dos tiendas opera mejor.

**Qué se separa siempre:**
- **La existencia.** Cada tienda tiene su almacén. F-971 ya existe.
- **La caja y el corte.** Un corte por sucursal, siempre. Un corte consolidado de dos cajones
  físicos no permite cuadrar ninguno de los dos.
- **El fiado.** Doña Meche compra en la de la esquina; el saldo es de esa tienda. Consolidarlo
  haría imposible que cada encargado supiera a quién fiarle.
- **Las ventas en espera y el conteo cíclico.**

**Qué se traspasa:** producto entre sucursales (F-972), que en este giro es constante —*"mándame
dos cajas de aceite que se me acabó"*—. El traspaso necesita confirmación en destino, porque
producto que sale y no llega es la forma más común de robo entre sucursales.

**Qué ve un encargado de sucursal contra el dueño:**

| | Encargado de sucursal | Dueño |
|---|---|---|
| Venta y margen | Sólo su sucursal | Todas, y comparadas |
| Existencias | Sólo su sucursal, y **puede ver** la de la otra para pedir traspaso | Todas |
| Costos de compra | No | Sí |
| Fiado | Sólo su cartera | Todas |
| Cortes | Los suyos | Todos |
| Configuración | No | Sí |

---

## 4.6 · ACCESIBILIDAD Y CONDICIONES REALES

Este giro opera con **prisa, con ruido, con fila, de pie, con una mano ocupada, con manos frías
del congelador y en un local donde entra la luz del sol directo al mostrador a las cinco de la
tarde.** Cada una tiene una consecuencia concreta.

| Condición real | Consecuencia de diseño |
|---|---|
| **Fila de tres o cuatro personas, de forma constante** | Cero diálogos modales en el camino feliz. Cero confirmaciones. **Deshacer inmediato** en vez de "¿está seguro?". La acción principal no requiere apuntar el cursor a nada. |
| **Una mano metiendo producto a la bolsa** | Todos los atajos son de **una sola tecla**. Ninguna combinación con `Ctrl`. El cobro completo —escanear, F12, teclear lo recibido, Enter— se hace con la mano izquierda. |
| **Ruido: refrigeradores, tráfico, radio, gente** | El beep del escáner **no es el único aviso**: la línea se resalta y el nombre aparece en la barra de estado. Tres canales redundantes. |
| **Sol directo en la pantalla por la tarde** | Contraste mínimo 4.5:1 en texto normal y 3:1 en grande, **como piso, no como objetivo**. El total y el cambio, los dos números que se leen a un metro, usan el contraste máximo de la paleta. Nada de gris sobre gris. |
| **Manos frías o mojadas (congelador, lluvia, hielo)** | En teléfono y tablet, objetivos táctiles de **56×56 px**, no 44. Aplica sobre todo a la pantalla de Conteo, que es la que se opera frente al congelador. |
| **El cliente lee la pantalla desde el otro lado** | El total y el cambio, en el tamaño más grande de la aplicación. Es lo que evita la discusión de "yo le di doscientos". |
| **Personal que rota y aprende en una tarde** | La prueba del recién llegado (§7 de `04-SISTEMA-DE-DISENO.md`): alguien que entró hoy tiene que poder escanear y cobrar **sin que nadie le explique**. El estado vacío de la pantalla de cobro dice literalmente qué hacer. |
| **Internet inestable** | Franja visible, venta que continúa, contador de pendientes, cierre bloqueado hasta sincronizar. Ver F-988 y su decisión pendiente. |
| **Impresora que se queda sin papel a media tarde** | El fallo de impresión **nunca** pierde la venta. Se cobra, se avisa, y el ticket queda disponible para reimprimir (F-225). |
| **Vista cansada, 54 años, sin lentes a la mano** | Tamaño base de 15 px en la pantalla de cobro —un punto por encima del resto del sistema— y cifras tabulares en toda columna de dinero. Una columna de precios que baila no se puede leer de reojo. |

**Y la condición que no es física sino de confianza:** este dueño ya fue defraudado por un sistema
antes. **Todo error dice qué pasó y qué hacer**, en español de mostrador, sin códigos. *"No se pudo
cobrar: se cayó el internet. La venta está guardada, intenta otra vez"* — nunca *"Error 500 al
procesar la transacción"*. La primera vez que el sistema le enseñe un código de error en inglés,
lo va a apagar.
