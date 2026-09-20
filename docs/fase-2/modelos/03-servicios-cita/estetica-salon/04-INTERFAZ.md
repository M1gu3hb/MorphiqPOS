# 04 · INTERFAZ · Estética / salón de belleza

**El archivo más largo de la carpeta y el que más se nota.** Reglas de
`04-SISTEMA-DE-DISENO.md`: los átomos no cambian nunca —botón, campo, tabla, color semántico,
tipografía, espaciado—; lo que cambia es **la estructura de la pantalla, qué es lo grande, dónde
está y qué hay alrededor.**

**El orden de diseño de este modelo, y sale del eje E:**

```
1º  TABLET  768–1279   recepción, parada en el mostrador, encendida todo el día
2º  TELÉFONO  <768     la estilista, en la bolsa del mandil · y la dueña en su casa
3º  PC  ≥1280          la dueña de noche: corte, liquidaciones, catálogo
```

**No es "escritorio primero".** Ninguna de las pantallas de operación de este modelo se diseña
pensando en un monitor. La PC aparece cuando hay columnas de números que leer, y ese momento es uno
al día.

---

## 4.1 · VOCABULARIO DEL GIRO · F-017

| Entidad interna | En pantalla | Plural | Género | Nota |
|---|---|---|---|---|
| `unidad_servicio` | **estación** | estaciones | f · *la* | Nunca "mesa". En barbería es **silla**; en spa es **cabina** |
| `orden` | **cita** | citas | f · *la* | El walk-in también es una cita. Nunca "cuenta" ni "ticket" en la agenda |
| `orden_linea` | **servicio** | servicios | m · *el* | Nunca "producto" ni "platillo" |
| `responsable` | **estilista** | estilistas | m/f · *el/la* | Del catálogo del negocio: en barbería **barbero**, en uñas **manicurista**, en spa **terapeuta**. **La palabra la elige la dueña al configurar** |
| `cliente` | **clienta** | clientas | f por omisión, **m si la ficha dice hombre** | Ver §4.1.1 |
| `empleado` (con agenda) | **profesional** | profesionales | m/f | Palabra del sistema, no del mostrador. Aparece en configuración y en reportes, no en la agenda |
| `almacen` tipo consumo | **cabina** | — | f · *la* | El producto de atrás del lavabo |
| `almacen` tipo venta | **anaquel** | — | m · *el* | El mueble de venta |
| `producto` (reventa) | **producto** | productos | m · *el* | |
| `insumo` (cabina) | **material** | materiales | m · *el* | "El material del tinte", que es como se dice |
| `receta` | **fórmula** | fórmulas | f · *la* | **Nunca "receta".** En un salón, receta es lo del médico |
| `expediente` | **historial** | historiales | m · *el* | "Ver el historial de Ana" |
| `comision` | **comisión** | comisiones | f · *la* | |
| `corte_caja` | **corte del día** | cortes | m · *el* | |
| `liquidacion` | **liquidación** | liquidaciones | f · *la* | Nunca "nómina" en pantalla: en este giro suena a empresa grande |
| `no_show` | **no llegó** | — | — | **Nunca "no-show"** en la interfaz. Es jerga de software |
| `bloqueo` | **tiempo apartado** | — | m · *el* | Nunca "bloqueo", que suena a castigo |
| `hueco` | **hueco** | huecos | m · *el* | La palabra que usan y la que hay que usar |
| `preparacion` | — | — | — | **Apagada.** No se traduce: se apaga (regla 3 del diccionario) |

### 4.1.1 · El problema del género, que este modelo pone sobre la mesa

**"El clienta llegó" delata el sistema en el primer segundo.** Y en este giro el 90% son mujeres, así
que el valor por omisión tiene que ser femenino y la excepción tiene que funcionar.

**Regla:** la ficha lleva género y el diccionario lleva las dos formas. Donde no hay ficha —el
walk-in sin datos— se usa una forma neutra que no suene a esquive: *"siguiente"*, *"sin registrar"*,
no *"el/la cliente"*.

Y **los mensajes de error y los estados vacíos también se traducen.** Es donde más se nota el
descuido:

```
MAL   "No hay órdenes abiertas"
BIEN  "No hay citas en curso"

MAL   "Seleccione un producto para agregar al carrito"
BIEN  "Elige un servicio"

MAL   "El cliente no tiene historial"
BIEN  "Ana viene por primera vez"        ← y con el botón de crear su historial al lado
```

---

## 4.2 · NAVEGACIÓN

El orden es el del día de trabajo, no el alfabético ni el del sistema.

```
TABLET Y PC · barra lateral        TELÉFONO · barra inferior, 5 destinos
┌──────────────────┐              ┌─────────────────────────────────┐
│ ▸ AGENDA      ●  │ ← inicio     │  Mi día   Agenda   +   Clientas │
│ ▸ Cobrar         │              │                         Mi corte│
│ ▸ Clientas       │              └─────────────────────────────────┘
│ ▸ Profesionales  │
│ ▸ Productos      │              El "+" central es AGENDAR.
│ ▸ Caja           │              Está al alcance del pulgar porque
│ ▸ Reportes       │              las citas se piden en cualquier
│ ▸ Configuración  │              momento y desde cualquier pantalla.
└──────────────────┘
```

**Por qué ese orden, sección por sección:**

1. **Agenda** primero porque es la pantalla de inicio y se abre cuarenta a ochenta veces al día. Si
   estuviera en tercer lugar, la gente aprendería a ignorar las dos de arriba.
2. **Cobrar** segundo porque es lo que sigue a la cita en el tiempo. Y porque la mitad de las veces
   se llega a cobrar **desde** la agenda, no desde aquí: este acceso es el camino de excepción.
3. **Clientas** tercero: es donde vive el historial, y se consulta antes de tocar a alguien.
4. **Profesionales** cuarto. Aquí viven comisión, horario y productividad. Lo abre la dueña, y su
   gente entra sólo a lo suyo.
5. **Productos** quinto. Inventario, cabina, anaquel, compras. Se abre una vez al día o menos.
6. **Caja** sexto. Apertura en la mañana, corte en la noche. Dos veces.
7. **Reportes** séptimo, con el **dashboard adentro**. Ver §4.4 y §4.4.1 para la defensa de que el
   dashboard no es la pantalla de inicio.
8. **Configuración** al final, como en todos.

**Lo que NO está en la barra y en otros modelos sí:** mesas, cocina, preparación, proveedores como
sección propia (van dentro de Productos), fiado, facturación como sección (va dentro de cada ticket).

---

## 4.3 · LAS PANTALLAS, UNA POR UNA

### 4.3.1 · AGENDA DEL DÍA · **la pantalla de inicio**

```
Propósito ......... saber qué va a pasar hoy, quién sigue, y dónde están los
                    huecos que todavía se pueden llenar
Frecuencia ........ 40–80 veces al día · TODO el mundo
Acción principal .. INICIAR LA CITA QUE SIGUE (un toque sobre el bloque)
Segunda acción .... AGENDAR (control fijo, siempre visible)
Primero se ve ..... la rejilla del día con una columna por profesional, la hora
                    actual marcada con una línea, y los huecos en un color
                    distinto al vacío
Jerarquía ......... 1 los bloques de cita · 2 la línea del ahora · 3 los huecos
                    con su valor · 4 el encabezado del día
```

**El bloque de cita tiene tres zonas visuales, y ésta es la decisión de diseño más importante del
modelo entero:**

```
   ┌──────────────────────┐  10:15  ← ACTIVO · sólido
   │ Ana Lucía M.         │         la estilista está ocupada
   │ Retoque de raíz      │
   ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  10:35  ← PASIVO · rayado diagonal, más claro
   │ ░░ procesado 35 min ░│         la estación sigue ocupada,
   │ ░░ CABE UNA CITA ░░░░│         LA ESTILISTA ESTÁ LIBRE
   ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  11:10  ← ACTIVO otra vez
   │ lavado, corte, secado│
   ├──────────────────────┤  11:50
   │▒ limpiar 10 min ▒▒▒▒▒│         ← CIERRE · línea delgada
   └──────────────────────┘  12:00
```

**Por qué el rayado y no un bloque sólido:** porque **la interfaz tiene que enseñar la oportunidad,
no esconderla**. Si el procesado se dibuja igual que el resto, nadie va a intentar meter una walk-in
ahí, y ahí está entre el 25% y el 40% de la capacidad real del salón. El rayado con la leyenda *"cabe
una cita"* convierte un dato de sistema en una decisión comercial.

**Estado del bloque, por color semántico —los mismos significados de siempre, aplicados a otra cosa:**

| Color | Estado | Qué significa aquí |
|---|---|---|
| gris claro, contorno | **agendada** | todavía no llega |
| **ámbar** | **sin confirmar** | se le mandó recordatorio y no contestó |
| **azul** | **en curso** | está sentada, el cronómetro corre |
| rayado azul claro | **en procesado** | cabe otra cita |
| **verde** | **terminada, cobrada** | listo |
| verde con borde | **terminada, sin cobrar** | ← **el que hay que ver**: el servicio se dio y el dinero no entró |
| **rojo** | **no llegó** | con su hora de marcado |
| gris rayado | **tiempo apartado** | comida, curso. No cuenta como hueco |
| **hueco** | fondo punteado, con el valor en chiquito | *"60 min · ~$650"* |

**Y una marca que va por encima de todo lo demás:** el **triángulo rojo de alergia** en la esquina
del bloque, si la clienta tiene bandera en su historial. Tiene que verse **antes** de que empiece el
servicio, desde la agenda, sin abrir nada.

**TABLET (768–1279) · el layout principal**

```
┌───────────────────────────────────────────────────────────────┐
│  MAR 14 MAR   ‹ ›   [HOY]        14 citas · 72% · 3 huecos    │  ← 64 px
├──────────┬──────────┬──────────┬──────────┬───────────────────┤
│  KARLA   │   DANY   │   PATY   │   SOL    │                   │
│          │          │          │ (renta)  │                   │
├──────────┼──────────┼──────────┼──────────┤                   │
│10 ███████│10 ███████│10        │10 ██████ │                   │
│   Ana L. │   Corte  │  ·hueco· │  Uñas    │                   │
│   Tinte  │   Mariel │  60 min  │  Rocío   │                   │
│11 ░░░░░░░│11        │  ~$450   │11        │                   │
│   proceso│  ·hueco· │          │  ·hueco· │                   │
│   CABE ▸ │  45 min  │11 ███████│          │                   │
│12 ███████│  ~$320   │   Sra. B.│12 ██████ │                   │
│   corte  │12 ███████│   Peinado│   Gel    │                   │
│   secado │   Tinte  │          │   Lupe   │                   │
├──────────┴──────────┴──────────┴──────────┤                   │
│  ─────────── 12:40 ───────────────────────│  ← línea del ahora│
│13 ...                                      │                   │
└───────────────────────────────────────────────────────────────┘
│              [  +  AGENDAR  ]                                 │  ← fijo, abajo
└───────────────────────────────────────────────────────────────┘
```

- **Scroll vertical de horas, columnas fijas.** El encabezado con los nombres no se va nunca.
- **La línea del ahora** se dibuja sobre todo y la vista arranca centrada en ella.
- **Cuatro columnas es el máximo cómodo en tablet vertical.** Con cinco o más, las columnas se
  deslizan en horizontal y **la del ahora se mantiene visible**.
- **Sol aparece marcada como (renta)** y su columna tiene un tono distinto: su venta no es del salón.
- El botón de agendar es fijo abajo, a la altura del pulgar de quien sostiene la tablet.

**TELÉFONO (<768) · lista, no rejilla**

La rejilla de cuatro columnas en 390 px es ilegible y **no se intenta**. Se convierte en una lista
cronológica del salón completo, con el profesional como etiqueta de color:

```
┌──────────────────────────┐
│ MAR 14   14 citas · 72%  │
│ ──────────────────────── │
│ 10:00  ● Karla           │
│   Ana Lucía M.           │
│   Retoque de raíz    ⚠   │  ← alergia
│ ──────────────────────── │
│ 10:35  ░ procesado       │
│   ▸ CABE UNA CITA        │  ← tocable
│ ──────────────────────── │
│ 11:00  ○ HUECO  60 min   │
│   Paty  ·  ~$450         │
│   [ llenar ]             │
│ ──────────────────────── │
│ 11:00  ● Paty            │
│   Sra. Beltrán · Peinado │
│ ══════ 12:40 ═══════════ │
│ 13:00  ● Dany  ⏱ AMBAR   │
│   sin confirmar          │
└──────────────────────────┘
│  Mi día  Agenda  +  ...  │
```

- **Los huecos se ven igual de fuerte que las citas**, con su botón de llenar.
- Filtro rápido arriba: *Todo · Karla · Dany · Paty*.
- Es la vista que usa Paty en su casa a las 21:10 y a las 9:45 antes de llegar.

**PC (≥1280)**

La misma rejilla de la tablet, más ancha, con **un panel derecho de 320 px** que la tablet no tiene:

```
│  rejilla del día (6 columnas)     │  HOY                     │
│                                   │  ─────────────────────── │
│                                   │  Sin confirmar (2)       │
│                                   │   13:00 Dany · Mariel    │
│                                   │   17:30 Karla · Ale      │
│                                   │  Huecos (3) · ~$1,420    │
│                                   │   11:00 Paty 60'         │
│                                   │  Lista de espera (4)     │
│                                   │   Lucía M. quiere jue/vie│
```

El panel existe porque en PC sobra ancho y porque **quien está en PC es quien puede actuar sobre esa
lista**. En tablet ese panel sería un cajón que se abre desde el encabezado.

```
Estado vacío ...... "Hoy no hay citas todavía." + [AGENDAR] grande
                    + "Puedes abrir la agenda de mañana ›"
                    Y si es un salón nuevo, sin profesionales dados de alta:
                    "Primero da de alta a tu equipo" + el botón que lleva ahí
Cargando .......... esqueleto de la rejilla con las columnas y las horas ya
                    dibujadas. NUNCA un spinner en el centro: la estructura
                    del día no cambia y dibujarla de inmediato es correcto
Error ............. la rejilla en gris con "No se pudo cargar la agenda.
                    Reintentar". Y si hay caché del día, se muestra con una
                    franja: "Mostrando la última versión de las 12:30"
Sin permiso ....... una estilista sin `ver_agenda_ajena` ve SU columna sola,
                    a ancho completo. No un error: su agenda
Sin conexión ...... franja ámbar fija. Se puede LEER, marcar "llegó" y "no
                    llegó", y esas dos acciones se encolan. NO se puede
                    agendar ni cobrar sin conexión (regla de Fase 1)
Atajos (PC) ....... ← → día anterior/siguiente · H hoy · N nueva cita ·
                    W walk-in · / buscar clienta · ESC cerrar panel
NO va aquí ........ totales de venta, márgenes, gráficas, nada de dinero
                    acumulado. Esta pantalla es del tiempo, no del dinero.
                    Lo único monetario permitido es el VALOR DEL HUECO,
                    porque es lo que dispara la acción de llenarlo
```

---

### 4.3.2 · AGENDAR

```
Propósito ......... convertir un mensaje de WhatsApp en un bloque de tiempo
Frecuencia ........ 15–40 veces al día · recepción y dueña
Acción principal .. CONFIRMAR LA CITA
Primero se ve ..... el buscador de clienta, con el foco puesto
Jerarquía ......... 1 clienta · 2 servicio · 3 profesional · 4 día y hora
```

**El orden de los campos es el orden de la conversación real por WhatsApp**, y por eso no es el
orden de la base de datos:

```
1. ¿Quién?      → buscar por nombre o teléfono. Si no está, alta en línea
                  con DOS campos: nombre y teléfono. Nada más
2. ¿Qué?        → cuadrícula de servicios. Al elegir, el sistema ya sabe
                  la duración con sus tres tramos
3. ¿Con quién?  → propone a la profesional de siempre de esa clienta (F-425)
                  ya seleccionada. Cambiarla es un toque
4. ¿Cuándo?     → y AQUÍ está la diferencia con cualquier otro sistema:
                  no se muestra un calendario vacío. Se muestran
                  LOS PRÓXIMOS SEIS HUECOS QUE CABEN, ya calculados
```

```
   ¿Cuándo?
   ┌────────────────────────────────────────────┐
   │  HOY      15:30  Karla     (dentro de un   │
   │                             procesado)     │
   │  MAÑANA   11:00  Karla                     │
   │           16:15  Karla                     │
   │  JUE 16   10:00  Karla                     │
   │           12:30  Karla                     │
   │  ─────────────────────────────────────     │
   │  ¿Otra fecha?  [ ver calendario ]          │
   │  ¿Le sirve con otra persona?               │
   │       HOY 11:00 con Dany  ·  hoy 14:00 Paty│
   └────────────────────────────────────────────┘
```

**Por qué así y no con un calendario.** Porque la pregunta de la clienta es *"¿cuándo me puedes
dar?"*, no *"¿está libre el jueves a las 4?"*. Un calendario obliga a adivinar y a reintentar.
**Seis opciones ya filtradas resuelven la conversación en un mensaje de WhatsApp.**

Y **la línea de "¿le sirve con otra persona?"** es la que recupera la cita que se iba a perder: si
Karla está llena hasta el viernes, ofrecer a Dany hoy salva la venta. Va abajo y en secundario,
porque **no se empuja**: si la clienta viene con Karla, viene con Karla.

**Lo que aparece al confirmar, y no antes:**

- **Bandera de alergia** si la clienta la tiene.
- **"Ha faltado 2 veces en 6 meses. ¿Pedir anticipo?"** con el monto sugerido, si aplica (F-414).
- **"Para este servicio te faltará oxidante 30 vol"** si el material de cabina no alcanza (F-107).

```
Tablet ............ diálogo a pantalla completa, los cuatro pasos en scroll
                    vertical, el botón de confirmar fijo abajo
Teléfono .......... igual, un paso por pantalla, con migas arriba. Es la
                    pantalla que Paty usa en su casa a las 21:10
PC ................ panel lateral de 420 px SOBRE la agenda, para poder ver
                    el día mientras se agenda. Es la única pantalla del
                    modelo donde PC gana de verdad
Estado vacío ...... no aplica: siempre hay algo que elegir
Sin huecos ........ "No hay lugar esta semana con Karla." + los de la
                    siguiente + [apuntar en lista de espera] (F-409).
                    NUNCA un "sin resultados" a secas: eso es una venta perdida
Atajos (PC) ....... Enter avanza · ESC cancela · ↑↓ mueven en las listas
NO va aquí ........ precio como campo editable (se ajusta al cobrar), notas
                    largas, datos fiscales, nada del expediente
```

---

### 4.3.3 · CITA EN CURSO

```
Propósito ......... acompañar el servicio: ver el historial, capturar la
                    fórmula, añadir lo que se sugirió, cerrar
Frecuencia ........ 15–30 veces al día · la profesional, en su teléfono
Acción principal .. CERRAR EL SERVICIO (que dispara el consumo de cabina)
Primero se ve ..... la fórmula de la vez pasada, con el botón REPETIR
Jerarquía ......... 1 fórmula anterior · 2 servicios de la cita ·
                    3 historial · 4 notas
```

**Ésta es la pantalla que se toca con guantes, y todo su diseño sale de ahí.**

**TELÉFONO · el layout principal de esta pantalla**

```
┌──────────────────────────┐
│ ‹  Ana Lucía M.      ⚠   │  ← la alergia, siempre visible
│    Retoque · 10:00       │
│    ⏱ en curso 00:23      │
├──────────────────────────┤
│ LA VEZ PASADA · 7 feb    │
│ 6.0 ········ 60 g        │
│ 7.34 ······· 30 g        │
│ ox 20 vol ·· 90 ml       │
│ 35 min                   │
│                          │
│  ┌────────────────────┐  │
│  │  ✓ REPETIR IGUAL   │  │  ← 64 px de alto
│  └────────────────────┘  │
│  [      AJUSTAR      ]   │
├──────────────────────────┤
│ SERVICIOS                │
│ · Retoque de raíz  $950  │
│ [ + añadir servicio ]    │
│ [ + vender producto ]    │
├──────────────────────────┤
│ 📷 antes    📷 después    │
├──────────────────────────┤
│  [ CERRAR SERVICIO ]     │
└──────────────────────────┘
```

**Las cinco decisiones de esta pantalla y su razón:**

1. **La fórmula anterior está arriba de todo**, antes que los servicios y antes que el precio. Es lo
   que se necesita en el minuto 10, con la clienta ya sentada.
2. **REPETIR es un botón de 64 px.** Se toca con el nudillo, con el dorso del dedo o con el meñique
   limpio. **Se puede tocar con guantes de tinte sin ensuciar la pantalla** — y si se ensucia, se
   limpia, pero el punto es que sea grande y esté solo.
3. **"Añadir servicio" y "vender producto" están aquí y no en la caja.** Porque el momento en que se
   sugiere el tratamiento o el shampoo es con la cabeza mojada, no en la salida. Si hay que
   acordarse en la caja, no se vende. **Es el 15% de la venta del salón y depende de este botón.**
4. **Las dos fotos están a un toque**, abren la cámara directo, y quedan pegadas a la cita.
5. **CERRAR SERVICIO no cobra.** Es un acto distinto: cierra el servicio, consume el material, y deja
   la cita lista para cobrar. La clienta puede tardar veinte minutos más en la caja.

**Al tocar AJUSTAR, la captura de fórmula (F-154):**

```
   Mezclé  [ 90 ] g          ← teclado numérico grande
   Usé     [ 75 ] g          ← el sobrante se calcula solo: 15 g al bote
   ┌───────────────────────────────────────────┐
   │ 6.0       [ 60 ] g     [ − ] [ + ]        │
   │ 7.34      [ 30 ] g     [ − ] [ + ]        │
   │ ox 20 vol [ 90 ] ml    [ − ] [ + ]        │
   │ [ + otro producto ]                       │
   │ Procesado [ 35 ] min                      │
   └───────────────────────────────────────────┘
   Material: $118.40 · tu comisión sale de $832.00
```

Los `+` y `−` mueven de 10 en 10 gramos porque **nadie pesa de a un gramo** y porque los botones se
tocan mejor que un teclado con las manos ocupadas.

**TABLET · para cuando lo hace recepción**

Dos columnas: izquierda el historial completo de la clienta con las últimas seis visitas y sus
fórmulas; derecha la cita en curso. Es la vista de la que se acuerda de todo cuando la estilista
pregunta *"¿qué le pusimos la vez pasada?"* a gritos desde el lavabo.

**PC** — la misma de tablet con el historial completo y las fotos en galería. Se usa poco.

```
Estado vacío ...... clienta nueva: "Ana viene por primera vez" + la fórmula
                    base del servicio ya precargada como punto de partida
                    + el botón de crear su historial. NUNCA un formulario
                    en blanco
Cargando .......... esqueleto con la estructura. El bloque de "la vez pasada"
                    es lo primero que aparece
Error ............. si no carga el historial, se permite capturar igual y se
                    sincroniza. Perder la captura por un error de red es
                    perder el dato para siempre
Sin permiso ....... una estilista sólo ve las citas que atiende ella
Sin conexión ...... la captura de fórmula y las fotos se encolan en local y
                    se suben al volver. ES LA ÚNICA EXCEPCIÓN OFFLINE del
                    modelo, y es legítima porque no toca dinero ni precios:
                    es un apunte y una imagen. Cobrar sigue exigiendo servidor
NO va aquí ........ el total, el cobro, la propina, el descuento. Todo eso es
                    de la pantalla de cobro. Esta pantalla es del trabajo
```

---

### 4.3.4 · COBRAR

```
Propósito ......... convertir una cita terminada en dinero, con su comisión
                    y su propina bien puestas
Frecuencia ........ 15–30 veces al día · recepción, o la profesional misma
Acción principal .. COBRAR
Primero se ve ..... el TOTAL, en el tamaño más grande de la aplicación
Jerarquía ......... 1 total · 2 método · 3 PROPINA Y A QUIÉN · 4 líneas
```

**Lo que este cobro tiene y ningún otro del proyecto: cada línea trae su profesional, y la propina
tiene destinatario.**

**TABLET · principal**

```
┌──────────────────────────────┬─────────────────────────┐
│ Ana Lucía M. · 10:00–12:00   │                         │
│                              │   TOTAL                 │
│ Retoque de raíz      950.00  │   $ 1,130.00            │  ← 48 px
│   ▸ Karla                    │                         │
│ Tratamiento          180.00  │   − anticipo    300.00  │  ← si hay
│   ▸ Karla                    │   ───────────────────── │
│ Shampoo Rep. 300ml   380.00  │   A COBRAR    $ 830.00  │
│   ▸ Karla  (producto)        │                         │
│                              │   [ EFECTIVO ]          │
│ [+ servicio] [+ producto]    │   [ TARJETA  ]          │
│                              │   [ TRANSFER.]          │
│ Subtotal          1,510.00   │   [ MIXTO    ]          │
│ IVA incluido        208.28   │                         │
│ Descuento             0.00   │   PROPINA               │
│                              │   [12%][15%][18%][otro] │
│                              │   ▸ para: Karla     ▾   │
│                              │                         │
│                              │   [    COBRAR    ]      │
└──────────────────────────────┴─────────────────────────┘
```

**Las cuatro decisiones y su razón:**

1. **El anticipo aparece ya aplicado, no como opción.** Es el descuadre 4 de
   `02-DINERO-Y-CAJA.md` §10: si hay que buscarlo, se cobra dos veces. Aparece restado y en su
   renglón.
2. **La propina está en la pantalla principal, no en un paso posterior.** En `restaurante` la propina
   es un paso porque hay que preguntar y desglosar; aquí es un toque con destinatario.
3. **El destinatario se deduce de quién atendió y se puede cambiar.** Si el ticket tiene dos
   profesionales, se reparte en la proporción del servicio y se muestra. Y hay una opción
   **"dividir"** para el caso real de *"$200 para Karla y $50 para la que me lavó"*.
4. **El profesional está en cada línea y es editable hasta cobrar.** Después del cobro ya no: la
   comisión se causó (F-443) y corregirla es una contrapartida con motivo.

**Al elegir TRANSFERENCIA, el paso que evita el descuadre 1:**

```
   ¿A qué cuenta?
   ┌─────────────────────────────────────┐
   │  ● Cuenta del salón                 │
   │  ○ Cuenta de Karla                  │
   │     (se le descuenta hoy de su       │
   │      liquidación)                    │
   └─────────────────────────────────────┘
   [ ] pendiente de confirmar en el banco
```

Dos opciones, sin juicio, sin fricción. **Convierte una fuga en un flujo declarado.**

**Al aplicar un DESCUENTO:**

```
   Descuento 20%  ·  el ticket baja de $1,130 a $904
                     tu comisión baja de $565 a $452   (−$113)
                        [ CANCELAR ]   [ APLICAR ]
```

**TELÉFONO · para cuando cobra la misma profesional**

```
┌──────────────────────────┐
│ Ana Lucía M.             │
│                          │
│   $ 830.00               │  ← 40 px
│   (3 conceptos ▾)        │  ← colapsado
│   anticipo −300          │
│                          │
│ [ EFECTIVO ] [ TARJETA ] │
│ [ TRANSFER ] [ MIXTO   ] │
│                          │
│ Propina                  │
│ [12%][15%][18%][ otro ]  │
│ para: Karla          ▾   │
│                          │
│ ┌──────────────────────┐ │
│ │      COBRAR          │ │  ← pulgar
│ └──────────────────────┘ │
└──────────────────────────┘
```

Las líneas se colapsan a *"3 conceptos ▾"*. El total y los métodos sobreviven; el desglose se pide.

**PC** — la de tablet con más ancho y el historial de pagos de la clienta a la derecha.

```
Estado vacío ...... "Elige una cita terminada para cobrar" + la lista de las
                    que están terminadas sin cobrar. NO se puede cobrar una
                    cita que no se ha cerrado: eso obliga a cerrar el
                    servicio y es donde se captura la fórmula
Cargando .......... el total con esqueleto. Los botones deshabilitados
Error de cobro .... el diálogo NO se cierra, el carrito NO se pierde, y el
                    mensaje dice qué pasó y qué hacer. Perder un cobro de
                    $1,130 con la clienta enfrente es inaceptable
Sin caja abierta .. muro: "Abre la caja para poder cobrar" + el botón
Sin conexión ...... NO se puede cobrar. Regla de Fase 1: los totales los
                    calcula el servidor. Se dice claro y se ofrece reintentar
Atajos (PC) ....... F12 cobrar · F2 efectivo · F3 tarjeta · F4 transferencia ·
                    F7 propina · ESC cancelar
NO va aquí ........ la fórmula, las fotos, el historial clínico, la agenda.
                    Aquí se cobra
```

---

### 4.3.5 · HISTORIAL DE LA CLIENTA · F-434

```
Propósito ......... saber qué se le hizo, qué le quedó bien, qué no puede
                    usar, y cuándo toca volver
Frecuencia ........ 15–30 veces al día · la profesional antes de tocarla
Acción principal .. VER LA ÚLTIMA FÓRMULA
Primero se ve ..... alergias (si hay), última visita con su fórmula, y
                    "toca volver el ___"
Jerarquía ......... 1 alergias · 2 última fórmula · 3 visitas anteriores ·
                    4 fotos · 5 datos
```

```
┌──────────────────────────────────────────────────┐
│  ANA LUCÍA MÁRQUEZ          55 4XXX XXXX         │
│  Viene con Karla · cada 5 semanas · desde 2021    │
│                                                  │
│  ⚠  ALERGIA · PPD. Prueba de mecha 12 ene 2026   │  ← rojo, arriba
│     "Le arde en las sienes. Aplicar sin tocar    │
│      raíz en sienes."                            │
│                                                  │
│  TOCA VOLVER: 18 abr    [ agendar ]              │  ← acción
│                                                  │
│  ÚLTIMA VISITA · 7 mar · Karla · $1,130          │
│    Retoque de raíz + tratamiento                 │
│    6.0 60g · 7.34 30g · ox 20vol 90ml · 35 min   │
│    [ 📷 antes ] [ 📷 después ]                    │
│    "Quedó muy contenta. Quiere probar más claro" │
│                                                  │
│  ANTES                                           │
│    31 ene · Karla · $950  · misma fórmula        │
│    20 dic · Karla · $1,480 · + corte             │
│    ...                                           │
│                                                  │
│  Total gastado en 12 meses:  $ 11,240            │
│  Faltó 1 vez (18 nov)                            │
└──────────────────────────────────────────────────┘
```

**La alergia va arriba, en rojo, antes que nada, incluso antes del nombre del servicio.** Si hay que
hacer scroll para verla, el diseño está mal y alguien va a acabar en urgencias.

**"Toca volver el 18 de abril" es un dato calculado**, no capturado: sale de la frecuencia propia de
esa clienta con ese servicio (F-951). Y trae el botón de agendar al lado, porque **el momento de
agendar la siguiente es mientras todavía está en la silla** — que es el consejo comercial número uno
del giro y el que ningún sistema ayuda a ejecutar.

```
Tablet ............ una columna, scroll. Las fotos en tiras horizontales
Teléfono .......... igual, la más usada. Las secciones anteriores colapsadas
PC ................ dos columnas: izquierda el historial, derecha la galería
                    completa de fotos en rejilla
Estado vacío ...... "Ana viene por primera vez." + [empezar su historial]
                    con tres campos: cómo llegó, qué busca, alergias conocidas
Sin permiso ....... las notas marcadas PRIVADAS sólo las ve quien las escribió
                    y la dueña. Es necesario: hay notas que no son para
                    compartir
PRIVACIDAD ........ esta pantalla se abre con la clienta al lado y la tablet
                    a la vista. NUNCA muestra datos de otras clientas, ni
                    listas, ni búsquedas recientes. Al salir, se limpia
NO va aquí ........ comisiones, márgenes, lo que el salón gana con ella.
                    La clienta puede estar viendo la pantalla
```

---

### 4.3.6 · MI DÍA · **la pantalla de la profesional**

```
Propósito ......... que la estilista sepa qué sigue y cuánto lleva ganado
Frecuencia ........ 20–40 veces al día · cada profesional, en su teléfono
Acción principal .. ABRIR LA SIGUIENTE CITA
Primero se ve ..... la cita que sigue, grande, y el acumulado del día
Jerarquía ......... 1 la que sigue · 2 lo ganado hoy · 3 el resto del día
```

**No es la agenda filtrada. Es una pantalla distinta**, y existe por dos razones: Karla no camina al
mostrador entre clienta y clienta, y **de este número sale su dinero esta noche**.

```
┌──────────────────────────┐
│  KARLA · martes 14       │
│                          │
│  AHORA                   │
│  ┌────────────────────┐  │
│  │ Ana Lucía M.       │  │
│  │ Retoque · 10:00 ⚠  │  │
│  │ ░ procesado 12 min │  │
│  │ [ ver fórmula ]    │  │
│  └────────────────────┘  │
│                          │
│  HOY LLEVAS              │
│  Comisión     $ 1,240    │  ← en vivo
│  Propina      $   340    │  ← SEPARADA. Siempre
│  6 citas · 2 por atender │
│                          │
│  SIGUE                   │
│  11:00 Corte · Mariel    │
│  13:30 Tinte · Sra. B.   │
│  ─────────────────────   │
│  ░ 10:35–11:10 LIBRE     │
│    cabe un corte         │
│                          │
│  [ tomar una walk-in ]   │
└──────────────────────────┘
```

**Comisión y propina en dos renglones, siempre.** Es la regla del §4.4 de `02-DINERO-Y-CAJA.md`
llevada a la pantalla: si se suman, Karla cree que el salón le pagó $1,580 por trabajar.

**"Cabe un corte" en su propio hueco de procesado** es la pantalla vendiendo por sí sola: le dice a
Karla que tiene 35 minutos y le ofrece tomar a alguien.

```
Tablet/PC ......... misma pantalla, más ancha, con el detalle de la comisión
                    servicio por servicio al lado. Es lo que abre cuando
                    quiere verificar un número antes de que le paguen
Estado vacío ...... "Hoy no tienes citas." + sus huecos + [tomar walk-in]
Sin permiso ....... NUNCA muestra nada de otra persona. Ni un total del salón
Sin conexión ...... se muestra la última versión con su franja y su hora
NO va aquí ........ la venta del salón, la comisión de nadie más, el corte,
                    los gastos. Esta pantalla es de una persona
```

---

### 4.3.7 · LIQUIDACIÓN

```
Propósito ......... pagarle a cada quien lo que le toca, y que quede claro
Frecuencia ........ 1 vez al día a 1 vez a la quincena, según la persona ·
                    la dueña
Acción principal .. PAGAR Y REGISTRAR
Primero se ve ..... la lista de personas con su total a pagar hoy
Jerarquía ......... 1 el total por persona · 2 el desglose · 3 la regla
```

```
PC (≥1280) · es donde se hace
┌────────────────────┬──────────────────────────────────────────┐
│ KARLA     $1,978 ▸ │  KARLA · 14 mar                          │
│ DANY        $612   │  Regla: comisión pura 50% · sobre cobrado │
│ BRENDA      $180   │         sin IVA · material lo absorbe el  │
│ SOL      −$1,200   │         salón                            │
│  (cobra renta)     │  ─────────────────────────────────────── │
│                    │  6 citas                                 │
│ Total a pagar      │  Venta de servicio         5,220.00      │
│      $ 2,770       │  Base (sin IVA)            4,500.00      │
│ Total a cobrar     │  Comisión 50%              2,250.00      │
│      $ 1,200       │  Producto vendido            980.00      │
│                    │  Comisión producto 10%        98.00      │
│                    │  ─────────────────────────────────────── │
│                    │  COMISIÓN                  2,348.00      │
│                    │  ─────────────────────────────────────── │
│                    │  Propina a entregar          530.00      │
│                    │  ─────────────────────────────────────── │
│                    │  Cobró en su cuenta         −900.00      │
│                    │  ═══════════════════════════════════════ │
│                    │  A PAGARLE                 1,978.00      │
│                    │                                          │
│                    │  [ ver los 6 servicios ▾ ]               │
│                    │  [ PAGAR EN EFECTIVO ] [ TRANSFERIR ]    │
└────────────────────┴──────────────────────────────────────────┘
```

**La regla aplicada se escribe con todas sus letras en el encabezado.** No es decoración: es el
mecanismo que apaga el pleito. Quien lee ve "sobre cobrado, sin IVA, el material lo absorbe el
salón" y puede verificar cada número.

**"Ver los 6 servicios" abre el detalle línea por línea**, con base, tasa y monto de cada uno. Es lo
que convierte una cifra en un documento auditable.

**Al pagar, se genera el comprobante individual** (`02-DINERO-Y-CAJA.md` §9.5) y **se manda por
WhatsApp**. Ésa es la parte que hace que la gente confíe.

```
Tablet ............ la lista arriba, el detalle abajo, en scroll
Teléfono .......... lista de personas con su total; el detalle en pantalla
                    completa al tocar. Sirve para pagar rápido a fin del día
Estado vacío ...... "No hay comisiones pendientes de liquidar"
Confirmación ...... PAGAR es una acción irreversible sobre el ledger: pide
                    confirmación con el monto escrito, y escribe el
                    movimiento de caja (F-259) en la misma transacción
Sin permiso ....... sólo la dueña. Una profesional que entre aquí ve
                    únicamente su propio bloque, sin la lista
NO va aquí ........ la venta del salón, el margen, el arqueo. Esto es el
                    reparto, no el resultado
```

---

### 4.3.8 · CAJA Y CORTE

```
Propósito ......... abrir en la mañana, cerrar en la noche, saber si cuadró
Frecuencia ........ 2 veces al día · la dueña
Acción principal .. CERRAR EL DÍA
Primero se ve ..... si la caja está abierta y desde cuándo
Jerarquía ......... 1 el estado · 2 el movimiento del día · 3 el arqueo
```

**Al abrir**, además del fondo, las tres líneas de pasivos vivos de `02-DINERO-Y-CAJA.md` §8.2 — no
se piden, se muestran.

**Al cerrar**, en este orden y ni uno antes:

```
1.  "Quedan 2 citas sin resolver"        ← MURO (regla 1 del §8.5)
        13:00 Dany · Mariel  →  [terminada] [no llegó] [cancelar]
        19:00 Karla · Ale    →  ...

2.  "3 servicios de color sin fórmula"   ← AVISO, no muro
        Karla ×2 · Dany ×1        [capturar ahora] [cerrar así]

3.  Efectivo contado físicamente *  [ $ ______ ]     ← A CIEGAS

4.  ──── hasta aquí no se ve nada ────
    Esperado  $1,550.00  ·  Contado  $1,512.00  ·  Diferencia −$38.00  ▲

5.  [ ¿de dónde salió el esperado? ▾ ]   ← la cascada de §9.3 sección 4

6.  Informativo, no se cuenta:
        Propina de terminal pendiente de entregar   $1,240.00
        Anticipos vivos                             $1,500.00
```

**El paso 5 es plegable y cerrado por omisión, pero existe siempre.** Es la sección que convierte "no
cuadra" en "ya vi por qué", y en este giro es más necesaria que en una tiendita porque **los dos
renglones más grandes de salida son pagos a personas**: Paty vendió $12,400 y en el cajón hay $1,550
porque esa noche pagó $4,300 de comisión y propina.

```
Tablet ............ un paso por pantalla, botón grande abajo
Teléfono .......... igual. Paty cierra desde el teléfono más de lo que
                    cierra desde la PC
PC ................ todo en una pantalla con la cascada abierta. Es donde
                    revisa cuando algo no cuadró
Estado vacío ...... "La caja está cerrada" + [ABRIR CAJA] grande
Sin permiso ....... una profesional no puede cerrar. Sí puede hacer corte
                    de turno si entrega el cajón (F-233)
NO va aquí ........ la agenda, el catálogo, nada que distraiga a las 21:00
```

---

### 4.3.9 · PRODUCTOS · cabina y anaquel

```
Propósito ......... saber qué hay, qué falta, y abrir producto
Frecuencia ........ 1–3 veces al día · la dueña
Acción principal .. ABRIR PRODUCTO (el evento de F-155)
Primero se ve ..... las dos pestañas —CABINA y ANAQUEL— y lo que falta
Jerarquía ......... 1 alertas contra la agenda · 2 cabina · 3 anaquel
```

**La pantalla arranca con la alerta que sólo A3 puede dar**, arriba de las listas:

```
  ⚠  NO ALCANZA PARA LO AGENDADO
     Oxidante 30 vol · 2 balayages esta semana · alcanza para 1
     Tinte 7.34 · 4 servicios · alcanza para 3
                                              [ armar pedido ]
```

Después, dos pestañas con dos comportamientos distintos:

```
CABINA                              ANAQUEL
Producto   cerrados  abiertos       Producto        existencia   precio
6.0           4        2 (≈50%)     Shampoo Rep.        6         $380
7.34          1        1 (≈20%)  ⚠  Mascarilla          2         $650  ⚠
ox 20 vol     3        1            Cera                9         $180
[ ABRIR ▸ ]                         [ vender ] [ + entrada ]
```

**El botón ABRIR es lo que hace que F-155 se use.** También está en la pantalla de captura de
fórmula, para cuando el bote se acaba a media aplicación.

```
Tablet ............ pestañas arriba, lista en una columna, filas de 56 px
Teléfono .......... igual. La alerta de arriba ocupa la primera pantalla
                    completa si hay algo que no alcanza
PC ................ dos columnas lado a lado, cabina y anaquel a la vez,
                    con el kardex a la derecha al seleccionar
Estado vacío ...... "Todavía no tienes productos" + [importar] [agregar]
NO va aquí ........ presentaciones caja↔pieza, lotes, códigos de barras
                    como eje, conteo cíclico por zona. Nada de eso aplica
```

---

### 4.3.10 · CATÁLOGO DE SERVICIOS

```
Propósito ......... definir qué se vende, cuánto dura, cuánto cuesta y
                    cuánto comisiona
Frecuencia ........ una vez al mes · la dueña, en PC
Acción principal .. GUARDAR
```

**Los campos que este catálogo tiene y ningún otro del proyecto:**

```
  Nombre           Retoque de raíz
  Categoría        Color
  Precio           $ 950.00           ← base; el precio real es por profesional
  ─────────────────────────────────────────────────────────────
  DURACIÓN                            ← la parte que define A3
     Aplicación (activo)    [ 20 ] min
     Procesado  (pasivo)    [ 35 ] min   ← ◉ CABE OTRA CITA AQUÍ
     Terminado  (activo)    [ 40 ] min
     Limpieza   (cierre)    [ 10 ] min
     ──────────────────────────────────
     Total en la silla: 105 min · Tiempo de la estilista: 70 min
  ─────────────────────────────────────────────────────────────
  RECURSOS         ☑ estación (todo el servicio)
                   ☑ lavabo (10 min, en el tramo de terminado)
  ─────────────────────────────────────────────────────────────
  QUIÉN LO DA      ☑ Karla  $1,050 · 95 min
                   ☑ Paty   $  950 · 105 min
                   ☐ Dany   (no capacitada)
  ─────────────────────────────────────────────────────────────
  FÓRMULA BASE     tinte 80 g · oxidante 100 ml · guantes 1 par
                   Costo estimado: $132 · Margen bruto: 86%
                   Con comisión 50%:  LE QUEDA AL SALÓN  $ 343  (36%)
  ─────────────────────────────────────────────────────────────
  COMISIÓN         regla: por omisión del profesional  ▾
```

**El bloque de "le queda al salón" está aquí, junto al precio, y no en un reporte.** Es el momento
exacto en que se toma la decisión de precio, y es donde el número engañoso —86% de margen bruto—
tiene que aparecer al lado del real —36%—. Ver `02-DINERO-Y-CAJA.md` §1.1.

```
PC ................ formulario en dos columnas. Es la pantalla más de PC
                    de todo el modelo y está bien que lo sea
Tablet ............ una columna, secciones colapsables
Teléfono .......... sólo lectura y edición de precio. El resto no cabe y
                    no hace falta que quepa
NO va aquí ........ inventario, código de barras, receta que explota sola
```

---

### 4.3.11 · FICHA DEL PROFESIONAL

```
Propósito ......... definir horario, servicios, precio y —sobre todo— la
                    regla de comisión
Frecuencia ........ una vez al contratar, y cuando se renegocia · la dueña
Acción principal .. GUARDAR
```

**La sección que importa, y que es F-440 hecha pantalla:**

```
  REGLA DE COMISIÓN                                 vigente desde 01 mar
  ────────────────────────────────────────────────────────────────────
  Esquema        ◉ comisión pura   ○ sueldo + comisión
                 ○ escalonado      ○ renta de estación
  Servicio       [ 50 ] %
  Producto       [ 10 ] %
  ────────────────────────────────────────────────────────────────────
  La base se calcula                    ← LAS CINCO PREGUNTAS
   1  ◉ sobre lo cobrado   ○ sobre lista   ○ mitad y mitad
   2  ◉ sin IVA            ○ con IVA
   3  Material  ◉ lo absorbe el salón
                ○ se descuenta de la base   ○ se le cobra a ella
   4  Si atienden dos      ◉ reparto por servicio   ○ todo a quien la tomó
   5  Rehacer sin cobro    ◉ no paga comisión       ○ sí paga
  ────────────────────────────────────────────────────────────────────
  Al cambiar esta regla, lo ya causado NO se recalcula.
  La nueva regla aplica a partir de hoy.               [ GUARDAR ]
```

**Las cinco preguntas están numeradas y en la misma pantalla, a propósito.** Son exactamente las
cinco del §7.2 de `02-DINERO-Y-CAJA.md`, que son las que se pelean en todos los salones de México.
Ponerlas juntas, con valor por omisión y una sola vez, es la forma de producto de resolver el dolor 2:
**no se calcula mejor, se acuerda antes.**

**La frase del pie no es legal: es de confianza.** Nadie firma una regla que puede cambiar hacia
atrás.

```
PC ................ dos columnas. Es pantalla de PC
Tablet ............ una columna, secciones colapsables
Teléfono .......... la profesional ve su ficha en sólo lectura, con su regla
                    escrita. Es importante que la pueda leer cuando quiera
NO va aquí ........ su venta, su productividad, sus clientas. Eso es
                    Reportes
```

---

### 4.3.12 · CLIENTAS

```
Propósito ......... encontrar a alguien para agendar, y ver quién se está
                    yendo
Frecuencia ........ 10–20 veces al día · recepción
Acción principal .. BUSCAR
Primero se ve ..... el campo de búsqueda con el foco, y debajo
                    "NO HAN VUELTO"
```

**La lista por omisión no es "todas las clientas" ordenadas por nombre —eso no dispara nada—: es
quién se está yendo** (F-951):

```
  [ buscar por nombre o teléfono ............................ ]

  NO HAN VUELTO · pasaron su frecuencia
  ────────────────────────────────────────────────────────────
  Karina Solís      viene cada 4 sem · van 7    Karla   $950
  Sra. Beltrán      viene cada 6 sem · van 9    Paty  $1,480
  Ale Ramírez       viene cada 5 sem · van 8    Karla   $820
                                          [ hablarles por WhatsApp ]

  CUMPLEN SU CICLO ESTA SEMANA
  ────────────────────────────────────────────────────────────
  Ana Lucía M.      le toca el 18        [ agendar ]
  Mariel Cortés     le toca el 19        [ agendar ]
```

**Es, en pesos, la pantalla más rentable de la carpeta.** Recuperar a Karina —$950 cada cinco
semanas— son $9,900 al año. Y sólo es posible porque hay agenda y frecuencia.

**El botón dice "hablarles por WhatsApp" y abre los mensajes uno por uno, redactados**, no manda
nada solo. Mismo criterio que el fiado en `abarrotes` §6.4: la relación es personal y un envío
masivo la quema.

```
Tablet ............ búsqueda arriba, las dos listas en scroll
Teléfono .......... igual. Es lo que Paty revisa el lunes, que está cerrado
PC ................ tres columnas: búsqueda, las dos listas, y la ficha de
                    la seleccionada
Estado vacío ...... "Todavía no tienes clientas registradas" + el consejo:
                    "cada vez que atiendas a alguien, pídele su teléfono"
NO va aquí ........ facturación, saldos, fiado. No existe aquí
```

### 4.3.13 · REPORTES · donde vive el dashboard

```
Propósito ......... las dos veces al día en que se mira el negocio entero:
                    a las 9:45, después de leer la agenda, y a las 21:00
                    con el corte
Frecuencia ........ 2 veces al día · sólo dirección
Acción principal .. ninguna: se mira y se decide. Las dos que lleva son
                    ENLACES —a la agenda y a la liquidación— porque toda
                    acción de este modelo se ejecuta en otra pantalla
Primero se ve ..... la OCUPACIÓN DE MAÑANA, a todo lo ancho y con el número
                    más grande de la pantalla
Jerarquía ......... 1 mañana, con sus huecos y su lista de espera ·
                    2 quién se está yendo · 3 el no-show con su referencia ·
                    4 la ocupación de la semana · 5 lo cobrado hoy ·
                    6 producto por profesional · 7 lo que le quedó al salón ·
                    8 la propina que se debe
```

**Es la pantalla que esta carpeta decidió NO poner en el inicio**, y §4.4.1 da las tres razones. El
contenido —los ocho indicadores, en ese orden, con la decisión que dispara cada uno y las seis cosas
que están prohibidas en él— es todo el §4.4 y no se repite aquí.

Lo que sí es de esta ficha, porque es de la PANTALLA y no de los indicadores:

```
Tablet ............ una columna. El indicador de mañana ocupa el primer
                    pantallazo completo, que es lo que se mira a las 9:45
Teléfono .......... igual, y es el caso real: la dueña lo abre el lunes,
                    que está cerrado
PC ................ dos columnas de tarjetas debajo del de mañana, que
                    siempre va a todo lo ancho
Estado vacío ...... un salón recién dado de alta no tiene con qué comparar:
                    cada tarjeta dice por qué está en cero —"el mismo día de
                    la semana pasada no hubo con qué comparar", "mañana no
                    hay nadie con horario"— en vez de pintar un 0 %
NO va aquí ........ el ranking del equipo por lo que vende cada quien, el
                    ticket promedio del salón y el total histórico. Están
                    prohibidos en §4.4.3, con su razón
```

**Cero entre cero no es cero por ciento.** El día que el salón cierra —el lunes— nadie tiene horario,
y la ocupación de mañana no es 0 %: es una pregunta sin denominador. La pantalla enseña un guión y
dice "el salón cierra", porque un 0 % ahí manda a llenar una agenda que no existe.

---

---

## 4.4 · EL DASHBOARD

**Vive dentro de Reportes, no es la pantalla de inicio.**

### 4.4.1 · Por qué la agenda es el inicio y el dashboard no

La regla de `04-SISTEMA-DE-DISENO.md` §4 es que **cada indicador existe porque hay una decisión que
se toma al verlo**. Aplicada al momento del día, la regla se vuelve más dura:

**A las 9:45 de la mañana, casi todos los indicadores de un dashboard son adornos.** "Vendiste
$12,400 ayer" es información sobre un día que ya no se puede cambiar. Lo único que a esa hora
todavía cambia el resultado de hoy es **a quién llamo para llenar el hueco de las 11:00**, y eso
está en la agenda, no en un dashboard.

Hay una segunda razón, de frecuencia: la pantalla de inicio se abre **cuarenta a ochenta veces al
día**, por todo el mundo, para la misma pregunta —"¿quién sigue?"—. La pantalla que se abre ochenta
veces al día es la que merece la inversión. El dashboard se abre **dos veces**: a las 9:45 después
de leer la agenda, y a las 21:00 con el corte.

**Y una tercera, que es la que decide:** el dashboard de este modelo **mira hacia adelante**, no
hacia atrás. Su indicador estrella es la ocupación de mañana. Un dashboard que mira hacia adelante
es, en el fondo, una lectura de la agenda — así que ponerlo antes que la agenda sería poner el
resumen antes que el documento.

### 4.4.2 · Los ocho indicadores, en orden, con su decisión

**1 · OCUPACIÓN DE MAÑANA** — *el indicador estrella. Ocupa el ancho completo y es el más grande*

```
┌──────────────────────────────────────────────────────────────┐
│  MAÑANA · miércoles 15                                       │
│                                                              │
│         68%              Karla ████████░░ 86%                │
│      ocupación           Dany  █████░░░░░ 52%                │
│                          Paty  ███████░░░ 71%                │
│                                                              │
│  HUECOS         11:00 Karla 60'    15:30 Dany 90'            │
│                 17:00 Dany 45'                               │
│                 valor del tiempo libre:  ~$2,180             │
│                                                              │
│  De la lista de espera, tres querían esas franjas:           │
│    Lucía M. · Andrea T. · Sra. Beltrán    [ hablarles ]      │
│                                                              │
│  SIN CONFIRMAR (4)                        [ recordar ahora ] │
└──────────────────────────────────────────────────────────────┘
```

**Decisión que dispara:** *a quién llamo hoy para llenar los huecos de mañana, y a quién le mando el
recordatorio ahora.*

**Por qué es el estrella, y por qué ocupa tanto:** porque es el único número del dashboard **sobre el
que todavía se puede actuar**. Todos los demás informan; éste se opera. Y por eso no es un número
solo: trae los huecos con hora, los nombres de quién los quería y los dos botones. **Un indicador que
sólo dijera "68%" sería un adorno; lo que lo hace indicador es lo que tiene debajo.**

**2 · SE ESTÁN YENDO** — tarjeta grande

```
   6 clientas pasaron su ciclo
   Karina S. (7 sem, viene cada 4) · Sra. Beltrán (9 de 6) · …
   Valor de la cartera en riesgo:  ~$4,900 al mes
                                          [ ver las 6 ]
```

**Decisión:** *a quién le hablo esta semana.* Recuperar una clienta de color de $950 cada cinco
semanas son $9,900 al año. Es el indicador con mejor rendimiento por segundo de atención de todo el
tablero.

**3 · NO LLEGARON, ÚLTIMOS 30 DÍAS** — tarjeta mediana

```
   14 de 312 citas · 4.5%     ↓ desde 11% en enero
   Cuesta:  ~$9,800 en el mes
   Reinciden:  Mariana R. (3)  ·  Clau P. (2)
                                     [ pedirles anticipo ]
```

**Decisión:** *a quién le pido anticipo la próxima vez.* La referencia del giro es 15%–20% de
promedio, menos de 8% con recordatorio, confirmación y anticipo puestos. **El número se muestra con
su referencia**, porque un 4.5% solo no le dice nada a nadie —igual que la diferencia de conteo de
`abarrotes` se muestra contra el 1.5%–2.5% de ANTAD.

**4 · OCUPACIÓN POR PROFESIONAL, ÚLTIMOS 7 DÍAS** — barras

```
   Karla  ████████░░  84%      Dany  █████░░░░░  49%      Paty ███████░░ 72%
```

**Decisión:** *a quién le paso clientas, a quién capacito, a quién le ajusto el horario.* Dany al
49% no es un problema de Dany: es un problema de asignación o de formación, y el número es el que
abre la conversación.

**5 · VENTA CONTRA EL MISMO DÍA DE LA SEMANA PASADA** — línea corta

```
   Hoy martes      $ 12,400     ↑ 8% vs. martes pasado
   Servicio 84%  ·  Producto 16%
```

**Decisión:** *voy bien o voy mal, de verdad.* **Siempre contra el mismo día de la semana**, nunca
contra ayer: la semana de un salón tiene forma fija y extrema —lunes cerrado, martes muerto, sábado
que vale por dos—, y comparar contra ayer dice mentiras todos los días.

**6 · PRODUCTO POR PROFESIONAL** — tabla chica

```
   Karla   32% de sus citas llevaron producto     $980 hoy
   Paty    28%                                    $620
   Dany     6%                                    $ 80     ⚠
```

**Decisión:** *a quién capacito en recomendar producto.* El producto es el margen no-horario del
salón y **la única forma de que se venda es que quien atiende lo recomiende** con la cabeza mojada.
Dany al 6% no está vendiendo: está cobrando. Es capacitación de una tarde y se paga sola.

**7 · LO QUE LE QUEDÓ AL SALÓN, MES CORRIDO** — número con desglose

```
   Venta            $ 214,800
   − Comisión       $  94,100    (43.8%)
   − Material       $  21,400
   − Gastos         $  38,200
   ─────────────────────────────
   LE QUEDÓ         $  61,100    (28.4%)
```

**Decisión:** *puedo contratar, puedo subir precios, puedo aguantar el mes.* Es el único indicador
que mira hacia atrás y está en séptimo lugar a propósito. **Va con la comisión restada, siempre.** Un
margen bruto sin comisión diría 78% donde hay 28%.

**8 · PROPINA PENDIENTE DE ENTREGAR** — línea al pie

```
   $ 2,140 de propina que el salón debe    ·    la más vieja: 9 días   ⚠
```

**Decisión:** *cuánto tengo que sacar del cajón esta semana.* Es dinero que no es del salón y que
está en su cuenta. Casi siempre es desorden, no mala fe, y un renglón visible lo arregla.

### 4.4.3 · Qué NO va en el dashboard de este negocio

- **"Total histórico de ventas."** No dispara nada. Prohibido en los 78.
- **Ranking de las profesionales por venta.** Suena útil y es tóxico: con carteras y esquemas
  distintos, el ranking compara peras con manzanas y produce resentimiento. **Lo que sí va es la
  ocupación**, que mide el uso del recurso, no a la persona.
- **Ticket promedio del salón, solo.** Mezcla un corte de $250 con un balayage de $3,200 y no
  significa nada. Si se muestra, es **por servicio o por profesional**.
- **Número de clientas nuevas.** Se ve bonito y la decisión que dispara es de marketing, no de
  operación diaria. Va en Reportes, mensual.
- **Gráfica de venta por hora del día.** Un salón ya sabe que el pico es de 16:00 a 20:00.
- **Cualquier cosa de faltantes por producto al estilo `abarrotes`.** Aquí el inventario de anaquel
  son 120 piezas que se cuentan en quince minutos al mes.
- **Indicadores de la que renta la estación.** Su facturación no es del salón. Sólo se muestra su
  renta cobrada y si está al corriente.

### 4.4.4 · Qué cambia entre las 9:45 y las 21:00

**Sí cambia, y el dashboard lo sabe:**

| 9:45 · antes de abrir | 21:00 · con el corte |
|---|---|
| **1 · Ocupación de MAÑANA** arriba | **1 · Ocupación de MAÑANA** arriba, igual |
| 2 · Sin confirmar de **hoy**, con el botón | 2 · Sin confirmar de **mañana** |
| 3 · Huecos de **hoy**, todavía llenables | 3 · **No llegaron hoy**, con nombre |
| 4 · Se están yendo | 4 · Lo que le quedó al salón hoy |
| El dinero de ayer no se muestra | El dinero de hoy sí |

**La constante es la ocupación de mañana.** A las 9:45 mañana es el día siguiente; a las 21:00
también. **Es el único indicador que está en el primer lugar las dos veces**, y eso es lo que lo
hace el estrella.

---

## 4.5 · MULTI-SUCURSAL

Un salón con dos o tres sucursales es común en ciudad media. Lo que cambia:

**Lo que se consolida:**
- Venta, margen y lo que le quedó al salón, sumados y **también separados**.
- Catálogo de servicios y de productos (F-970), con **precio por sucursal** porque una colonia
  aguanta más que otra.
- La ficha de la clienta y **su expediente**. Es lo que permite que Ana se atienda en la sucursal
  del norte un sábado y su fórmula esté ahí. **Es el argumento de venta de multi-sucursal en este
  giro** y no lo tiene nadie.

**Lo que se separa y no se toca:**
- **La agenda.** Nunca se mezclan dos sucursales en una rejilla. Un profesional pertenece a una
  sucursal por día; si trabaja en dos, son dos bloques de horario, no dos agendas.
- **La caja y el corte.** Uno por sucursal, siempre.
- **La liquidación.** La comisión se causa en la sucursal donde se dio el servicio.
- **El inventario de cabina.** El tinte de una sucursal no le sirve a la otra, y el traspaso es un
  viaje en coche. Se traspasa explícitamente (F-105).

**Qué ve cada quien:**

| | Dueña | Gerente de sucursal | Profesional |
|---|---|---|---|
| Agenda | todas, con selector | la suya | su columna |
| Venta y margen | consolidado y por sucursal | la suya | nada |
| Liquidaciones | todas | la suya | la suya |
| Clientas y expedientes | todas | **todas** | las que atiende |
| Catálogo y precios | edita | lee | lee |
| Reglas de comisión | edita | **lee** | lee la suya |
| Corte | todos | el suyo | corte de turno |

**Que el gerente de sucursal pueda leer la regla de comisión pero no editarla** es deliberado:
necesita poder explicar un número, y no debe poder cambiarlo.

---

## 4.6 · ACCESIBILIDAD Y CONDICIONES REALES

Los mínimos de `04-SISTEMA-DE-DISENO.md` §1 aplican íntegros. Lo que este giro añade:

**1 · Se opera con las manos manchadas de tinte.** Ésta es la condición que manda sobre todas.
El tinte mancha la pantalla y no sale. **Consecuencia:** la pantalla de cita en curso se toca con el
nudillo o con el dorso del dedo, así que sus controles son de **64 px, no de 44**, están separados, y
**REPETIR está solo en su zona** — sin nada peligroso alrededor que se toque por error. Y no hay
ninguna acción destructiva a menos de 80 px de un control de uso frecuente.

**2 · Se opera con las manos mojadas.** Junto al lavabo. Consecuencia: **nada de gestos de arrastre
en teléfono ni de deslizar para borrar.** El dedo mojado resbala y arrastra sin querer. En tablet, el
único arrastre que existe —mover una cita en la rejilla— **tiene siempre su alternativa por menú**.

**3 · Hay una secadora encendida a metro y medio.** Una secadora profesional anda en 80–90 dB.
**Consecuencia: el sonido no es nunca el único portador de confirmación.** El beep de un cobro no se
oye. Toda confirmación es visual y, donde importa, háptica.

**4 · La luz es muy blanca y muy fuerte, a propósito.** Un salón se ilumina para ver el color real
del cabello: 5000–6500 K, alta intensidad, y muchas veces con espejos que la rebotan. **Consecuencia:
el contraste 4.5:1 es un piso, no un objetivo.** Los grises medios desaparecen bajo esa luz. Y **el
tema claro tiene que ser el de fábrica**: el oscuro con ese reflejo es ilegible.

**5 · La clienta está viendo la pantalla.** La tablet de recepción está a la altura de los ojos de
quien paga, y el espejo de la estación refleja el teléfono de la estilista. **Consecuencia:** el
historial nunca muestra datos de otra clienta; la búsqueda no deja rastro de búsquedas recientes; y
**la comisión no aparece en ninguna pantalla que la clienta pueda ver**. Que una clienta lea "de tus
$950, Karla se lleva $475" es una conversación que nadie quiere tener.

**6 · Se opera de pie, casi todo el día.** Los 439,000 trabajadores del sector están de pie ocho a
diez horas. **Consecuencia:** nada de la operación diaria requiere sentarse. Todo lo que exige
sentarse —catálogo, reglas de comisión, reportes— está agrupado y es de PC, una vez al mes.

**7 · Hay prisa a partir de las 16:00 y no antes.** El giro es de ritmo sostenido, pero el pico de
cuatro horas es real. **Consecuencia:** las acciones del pico —iniciar cita, marcar no llegó, cobrar,
meter walk-in— son de **uno o dos toques**. Las que no son del pico pueden pedir más.

**8 · El teléfono de la estilista está en la bolsa del mandil y tiene la pantalla rota.** Es literal
y es común. **Consecuencia:** nada crítico en las esquinas superiores ni en los bordes, donde más se
rompe. La zona de acción es el tercio inferior central.

**9 · La gente del salón rota.** La profesional nueva aprende el sistema en un turno, entre clienta
y clienta, sin capacitación. **Consecuencia:** "Mi día" tiene que entenderse sin que nadie la
explique, y los estados vacíos tienen que enseñar en vez de disculparse. **La prueba del recién
llegado** de `04-SISTEMA-DE-DISENO.md` §7 es la más exigente de este modelo.

**10 · Hay clientas mayores y el celular es el de ellas.** El recordatorio por WhatsApp y el enlace
de reserva los abre alguien de 62 años con la letra del teléfono en grande. **Consecuencia:** el
portal de reserva (F-923) se diseña a 16 px mínimo, con botones de 56 px, sin pasos opcionales y sin
registro obligatorio. Pedir crear una cuenta para agendar un corte es perder la cita.
