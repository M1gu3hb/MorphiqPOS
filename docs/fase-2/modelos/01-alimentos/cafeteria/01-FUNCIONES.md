# 01 · FUNCIONES · Cafetería de mostrador

IDs canónicos de `03-CATALOGO-DE-FUNCIONES.md`. **Nunca se inventa un ID aquí**: lo que falta se
declara al final, en §6, para añadirlo al catálogo antes de construir nada.

```
[=]  idéntica al tronco     [≠]  variante      [+]  exclusiva
[⚙]  construida y operando  [◐]  parcial       [ ]  pendiente
```

**Advertencia de lectura.** El vecino inmediato de este modelo es **`restaurante`**, que está
terminado y es el origen del arquetipo A2. Toda comparación de este archivo es contra él. Cuando
una función va marcada `[=]`, quiere decir *ya existe en `restaurante`, se reutiliza tal cual, y
esta carpeta no vuelve a describirla*. Cuando va marcada `[≠]`, la tabla de tres columnas dice
exactamente qué cambia y por qué — y "por qué" siempre es una razón de cómo trabaja una cafetería,
nunca una preferencia de pantalla.

---

## 1 · ÁRBOL COMPLETO

```
CAFETERÍA DE MOSTRADOR
│
├── NÚCLEO · identidad y acceso
│   ├── F-001 Tarjetas de empleado ............................... [=] [⚙]
│   ├── F-002 PIN de 4 dígitos, Argon2id en servidor ............. [=] [⚙]
│   ├── F-003 Roles y permisos ................................... [≠] [⚙]
│   │         Tres roles vivos: administrador, barista (= cajero +
│   │         cocina fusionados), almacén. NO hay mesero.
│   ├── F-004 Sesión revocable con caducidad ..................... [=] [⚙]
│   ├── F-005 Bloqueo por intentos fallidos ...................... [=] [⚙]
│   ├── F-006 Bitácora de acceso y auditoría ..................... [=] [⚙]
│   └── F-007 Permisos finos por módulo .......................... [=] [ ]
│
├── NÚCLEO · configuración
│   ├── F-010 Identidad del negocio .............................. [=] [⚙]
│   ├── F-011 Impuestos: IVA extraído ............................ [=] [⚙]
│   ├── F-012 Sucursales ......................................... [=] [⚙]
│   ├── F-013 Terminales ......................................... [≠] [⚙]
│   │         Dos terminales en el mismo mostrador el fin de semana
│   ├── F-014 Apariencia y tema .................................. [=] [⚙]
│   ├── F-015 Plantilla de negocio ............................... [+] [ ]
│   │         Renombre `operativo` → `cafeteria` (D-01)
│   ├── F-016 Perillas por módulo ................................ [≠] [◐]
│   └── F-017 Diccionario de vocabulario del giro ................ [+] [ ]
│
├── NÚCLEO · catálogo
│   ├── F-020 Catálogo de productos y servicios .................. [≠] [⚙]
│   │         Tres familias: bebida, alimento, grano en bolsa
│   ├── F-021 Categorías ......................................... [=] [⚙]
│   ├── F-022 Precio único ....................................... [=] [⚙]
│   ├── F-023 Listas de precio ................................... [≠] [ ]  ← FALTA
│   │         barra · plataforma · mayoreo de grano
│   ├── F-026 Precio por horario o temporada ..................... [=] [ ]
│   │         Café de temporada (pan de muerto, especias). Bajo.
│   ├── F-027 Modificadores y extras ............................. [≠] [◐]  ← FALTA
│   │         CENTRAL en este modelo: cambian precio Y receta
│   ├── F-028 Imágenes de producto ............................... [=] [⚙]
│   ├── F-029 Códigos de barras .................................. [=] [◐]
│   │         El grano en bolsa, la botella de agua y el snack sí
│   │         traen código. Operativo NO lo excluye; se conserva
│   ├── F-030 Paquetes y combos .................................. [≠] [ ]  ← FALTA
│   ├── F-032 Importación masiva por Excel ....................... [=] [⚙]
│   └── F-131 Producto por peso variable ......................... [+] [⚙]
│             El grano molido a granel, por gramo
│
├── FILA DE BARRA · el corazón del modelo
│   ├── F-310 Enviar a preparación ............................... [≠] [⚙]
│   │         Se envía AL COBRAR, no al comandar
│   ├── F-311 Estaciones de preparación .......................... [≠] [⚙]
│   │         Una sola (barra) o dos (barra + horno)
│   ├── F-312 Ruteo de producto a estación ....................... [=] [⚙]
│   ├── F-313 Pantalla de preparación ............................ [≠] [⚙]
│   ├── F-314 Estados: pendiente, preparando, listo .............. [≠] [⚙]
│   │         Cuatro estados, no tres: se añade `entregado`
│   ├── F-316 Alertas de alergia ................................. [=] [⚙]
│   ├── F-317 Notas al preparador ................................ [=] [⚙]
│   ├── F-319 Llamado de "listo" ................................. [≠] [◐]
│   ├── F-328 Fila de despacho de mostrador ...................... [+] [ ]  ← NUEVA
│   ├── F-329 Llamado por nombre y pantalla de recogida .......... [+] [ ]  ← NUEVA
│   ├── F-330 Pedido anticipado con hora de recogida ............. [+] [ ]  ← NUEVA
│   └── F-331 Consumo de empaque según canal ..................... [+] [ ]  ← NUEVA
│
├── VENTA Y COBRO
│   ├── F-200 Carrito ............................................ [≠] [⚙]
│   ├── F-201 Búsqueda rápida .................................... [=] [⚙]
│   ├── F-202 Descuento por línea ................................ [=] [⚙]
│   ├── F-203 Descuento por total ................................ [=] [⚙]
│   ├── F-205 Autorización de descuento por supervisor ........... [=] [ ]
│   ├── F-210 Cobro en efectivo con cambio ....................... [=] [⚙]
│   ├── F-211 Cobro con tarjeta .................................. [=] [⚙]
│   ├── F-212 Cobro por transferencia ............................ [=] [⚙]
│   ├── F-213 Pago mixto ......................................... [=] [⚙]
│   ├── F-220 Ticket ............................................. [≠] [⚙]
│   ├── F-221 Cancelación con motivo ............................. [=] [⚙]
│   ├── F-222 Devolución total o parcial ......................... [≠] [◐]
│   ├── F-223 Folio consecutivo por sucursal ..................... [=] [⚙]
│   ├── F-224 Venta en espera / suspendida ....................... [=] [ ]
│   │         El pedido de oficina que se levanta y se cobra junto
│   ├── F-225 Reimpresión de ticket .............................. [=] [⚙]
│   ├── F-249 Segunda pantalla al cliente ........................ [+] [ ]  ← NUEVA
│   └── F-261 Consumo de empleados y cortesías ................... [+] [ ]
│             Propuesta por `restaurante`. Aquí es MÁS grave: tres
│             personas × 3–4 bebidas de turno = ~$5,700 al mes
│
├── CAJA
│   ├── F-230 Apertura con fondo ................................. [≠] [⚙]
│   ├── F-231 Movimientos: entrada, retiro, gasto ................ [≠] [⚙]
│   ├── F-232 Arqueo a ciegas .................................... [=] [⚙]
│   ├── F-233 Corte de turno ..................................... [≠] [⚙]
│   ├── F-234 Corte diario y su PDF .............................. [≠] [⚙]
│   ├── F-235 Varias cajas simultáneas ........................... [=] [ ]  ← FALTA
│   └── F-236 Caja por terminal .................................. [=] [⚙]
│
├── PROPINAS
│   ├── F-240 Propinas (tronco) .................................. [≠] [⚙]
│   ├── F-241 V2 · Sugerida al cobrar ............................ [≠] [⚙]
│   ├── F-245 Desglose exacto por método ......................... [=] [⚙]
│   ├── F-246 Liquidación de propinas por periodo ................ [≠] [⚙]
│   └── F-248 Bote del turno repartido por horas ................. [+] [ ]  ← NUEVA
│
├── INVENTARIO · variante V6
│   ├── F-100 Existencia actual por almacén ...................... [=] [⚙]
│   ├── F-101 Ledger inmutable de movimientos .................... [=] [⚙]
│   ├── F-102 Decremento atómico al cobrar ....................... [=] [⚙]
│   ├── F-103 Kardex por artículo ................................ [=] [ ]
│   ├── F-104 Ajuste manual con motivo obligatorio ............... [=] [⚙]
│   ├── F-106 Toma de inventario físico y diferencias ............ [≠] [ ]  ← FALTA
│   ├── F-107 Alertas de mínimo .................................. [≠] [⚙]
│   ├── F-108 Valuación (costo promedio) ......................... [=] [⚙]
│   ├── F-109 Merma con motivo ................................... [≠] [◐]
│   ├── F-115 V6 · Peso, volumen y receta ........................ [≠] [⚙]
│   ├── F-128 Receta / escandallo ................................ [≠] [⚙]
│   ├── F-129 Explosión de receta al cobrar ...................... [=] [⚙]
│   ├── F-130 Costeo por insumo .................................. [=] [⚙]
│   ├── F-132 Insumo base (el producto ES el insumo) ............. [=] [⚙]
│   ├── F-133 Rendimiento real contra teórico .................... [=] [ ]
│   ├── F-156 Merma de barra: calibración y vaporizado ........... [+] [ ]  ← NUEVA
│   └── F-157 Frescura del grano por fecha de tueste ............. [+] [ ]  ← NUEVA
│
├── COMPRAS Y GASTOS
│   ├── F-250 Gastos con categoría ............................... [≠] [⚙]
│   │         Categoría propia: comisión de terminal y plataforma
│   ├── F-251 Plantillas de gasto fijo ........................... [=] [⚙]
│   ├── F-252 Comprobante adjunto al gasto ....................... [=] [ ]
│   ├── F-631 Proveedores ........................................ [=] [⚙]
│   ├── F-632 Recepción y entrada a inventario ................... [=] [⚙]
│   ├── F-633 Actualización de costo promedio .................... [=] [⚙]
│   └── F-634 Plantillas de compra recurrente .................... [=] [⚙]
│
├── CLIENTES Y LEALTAD
│   ├── F-040 Clientes: ficha básica ............................. [≠] [⚙]
│   ├── F-041 Historial de compra del cliente .................... [=] [ ]
│   ├── F-930 Puntos por compra .................................. [≠] [ ]  ← FALTA
│   │         Variante SELLOS: 1 sello por bebida, no puntos por peso
│   ├── F-934 Recompensas y canje ................................ [≠] [ ]  ← FALTA
│   └── F-936 Pasivo de lealtad: sellos sin canjear .............. [+] [ ]  ← NUEVA
│
├── REGISTROS Y DASHBOARD
│   ├── F-050 Ventas por periodo ................................. [≠] [⚙]
│   ├── F-051 Más vendidos ....................................... [≠] [⚙]
│   ├── F-052 Utilidad y margen .................................. [≠] [⚙]
│   ├── F-053 Cortes históricos .................................. [=] [⚙]
│   ├── F-054 Ventas por empleado ................................ [≠] [◐]
│   ├── F-055 Comparativo entre periodos ......................... [≠] [ ]  ← FALTA
│   │         Comparativo de RÁFAGA, no de día
│   ├── F-056 Dashboard .......................................... [≠] [⚙]
│   └── F-057 Exportación a Excel y PDF .......................... [=] [⚙]
│
├── PORTAL DEL CLIENTE
│   ├── F-920 Portal del cliente (tronco) ........................ [≠] [⚙]
│   ├── F-922 V2 · Catálogo público y pedido ..................... [≠] [ ]  ← FALTA
│   │         Aquí se DEFINE la variante: menú público + pedido
│   │         anticipado para recoger en barra
│   └── F-952 Encuesta de satisfacción ........................... [=] [⚙]
│
├── DOMICILIO · acotado a propósito
│   ├── F-820 Pedido a domicilio ................................. [≠] [ ]
│   │         Sólo como CANAL de venta con su lista de precio.
│   │         Sin reparto propio, sin repartidor, sin mapa
│   └── F-826 Integración Rappi / DiDi / Uber Eats ............... [ ]  APAGADA
│             6.22% de las órdenes. Ver §5
│
├── MULTI-SUCURSAL
│   ├── F-970 Catálogo compartido ................................ [=] [ ]
│   ├── F-971 Inventario por sucursal ............................ [=] [⚙]
│   ├── F-973 Reportes consolidados .............................. [≠] [ ]
│   └── F-974 Permisos por sucursal .............................. [=] [⚙]
│
└── HARDWARE
    ├── F-983 Báscula conectada .................................. [=] [ ]
    │         Para el grano a granel y para pesar la dosis
    ├── F-984 Cajón de dinero .................................... [=] [ ]  ← FALTA
    ├── F-985 Impresora térmica .................................. [=] [⚙]
    ├── F-986 Lector de código de barras ......................... [=] [◐]
    │         SE QUEDA ENCENDIDO. Es lo contrario que en
    │         `restaurante`, donde está apagado a propósito
    └── F-987 Terminal bancaria integrada ........................ [=] [ ]
```

---

## 2 · LAS `[=]` · idénticas, no se vuelven a construir

Verificadas campo por campo y regla por regla contra `restaurante`. Si hubiera **una sola**
diferencia, estarían abajo, en §3.

```
F-002 PIN de 4 dígitos, Argon2id en servidor [=] ← reutiliza de: restaurante
      Idéntica. Mismo hash, misma verificación, mismo bloqueo por
      intentos. Ningún giro cambia qué es un PIN de cuatro dígitos.
      NO SE VUELVE A CONSTRUIR.

F-232 Arqueo a ciegas [=] ← reutiliza de: restaurante
      Idéntica. Se cuenta primero, el esperado lo calcula el servidor
      y aparece después, la diferencia lleva semáforo. Es la regla 1
      de `04-SISTEMA-DE-DISENO.md` §5 y no admite variante en los 78.
      Lo que cambia aquí es CUÁNTAS VECES se hace (dos, una por turno),
      no CÓMO se hace. Eso vive en F-233, no aquí.
      NO SE VUELVE A CONSTRUIR.

F-245 Desglose exacto por método [=] ← reutiliza de: restaurante
      Idéntica. `desgloseMetodosPagoExacto()` nunca reparte
      proporcionalmente, ni aquí ni en ningún giro. Lo que cambia entre
      giros es QUIÉN recibe la propina —y eso es F-240 y F-248—, no
      cómo se atribuye al método. El código de
      `heredado/utils/tipsUtils.js` se usa intacto.
      NO SE VUELVE A CONSTRUIR.

F-101 · F-102 Ledger inmutable y decremento atómico [=] ← restaurante
      Idénticas. Misma tabla `movimientos_stock`, mismo `check` de
      signo impuesto por la base, mismo decremento que falla en vez de
      silenciar. Las diez variantes de inventario escriben aquí.
      Lo único que esta carpeta añade son TIPOS de referencia nuevos
      (`merma_barra`, `consumo_interno`), y añadir un valor a un `check`
      no es reconstruir el ledger.
      NO SE VUELVE A CONSTRUIR.

F-129 · F-130 · F-132 Explosión, costeo e insumo base [=] ← restaurante
      Idénticas. La explosión recorre las líneas de receta y descuenta;
      el costeo suma costo unitario por cantidad; el insumo base
      descuenta una pieza cuando el producto ES el insumo. Una botella
      de agua en una cafetería y una cerveza en un restaurante son el
      mismo caso exacto.
      NO SE VUELVE A CONSTRUIR.

F-210 · F-211 · F-212 · F-213 Cobro y métodos de pago [=] ← restaurante
      Idénticas. Un solo comando `/api/venta/cobrar` con un arreglo de
      pagos. Efectivo con cambio, tarjeta, transferencia y mixto se
      comportan igual. Lo que cambia es la PROPORCIÓN de cada método
      —y eso es un dato del negocio, no una diferencia de función.
      NO SE VUELVE A CONSTRUIR.

F-631 … F-634 Compras, proveedores y costo promedio [=] ← restaurante
      Idénticas. El promedio ponderado sobre stock anterior más
      entrante es aritmética, no giro. Las plantillas de compra
      recurrente son literalmente la misma pantalla: el pedido de leche
      del martes es tan repetitivo como el de verdura.
      NO SE VUELVE A CONSTRUIR.

F-316 · F-317 Alergias y notas al preparador [=] ← restaurante
      Idénticas, y esto sorprende: aunque aquí el que cobra y el que
      prepara son la misma persona, la alerta de alergia se conserva
      entera, con su esquina propia y sin poder colapsarse. La razón es
      que la leche y el fruto seco son los dos alérgenos más comunes
      del giro y el barista rota. Una alergia mal atendida no es un
      descuadre, es una urgencia médica, y eso no cambia por el tamaño
      del local.
      NO SE VUELVE A CONSTRUIR.

F-057 Exportación a Excel y PDF [=] ← restaurante
      Idéntica. Mismo `jspdf` + `html2canvas`, mismas columnas
      declaradas en `heredado/lib/exportColumns.js`. Lo que cambia es
      QUÉ tabla se exporta, no cómo.
      NO SE VUELVE A CONSTRUIR.
```

---

## 3 · LAS `[≠]` · mismo nombre, comportamiento distinto

Comparación contra **`restaurante`**, que es el vecino inmediato y está terminado.

### F-310 · Enviar a preparación

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| El mesero envía la comanda **antes de cobrar**, desde la mesa, y puede enviar tres veces en la misma cuenta | Se envía **en el mismo acto del cobro**, una sola vez, automáticamente. No existe un botón "enviar a barra" | Aquí se cobra antes de que el producto exista. No hay un momento intermedio en el que alguien decida enviar: cobrar **es** enviar. Un botón de más entre cobrar y preparar, repetido 180 veces en la ráfaga, son cinco minutos de fila |
| La comanda puede cancelarse porque todavía no se cobró | La comanda **ya está pagada**. Cancelarla es una devolución, no una cancelación | Cambia la clase entera de operación: lo que en restaurante es corregir, aquí es devolver dinero |
| El envío tiene clave de idempotencia propia | El envío **comparte la clave de idempotencia del cobro** | Si se separaran, un reintento de red podría cobrar una vez y encolar dos bebidas |

**Se construye el tronco una vez (`pedidos_preparacion`) y esta variante.**

### F-313 · Pantalla de preparación · F-314 · Estados

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| **Tres columnas**: nuevos, en preparación, listos. Se mira a dos metros con las manos ocupadas | **Dos columnas**: en la fila / listos para entregar. Y una tercera zona pequeña abajo: entregados del último minuto, para deshacer | Con dos personas y noventa segundos por bebida, la columna "en preparación" dura lo que tarda en cruzarse la vista: el barista pasa de tomar la tarjeta a terminarla sin soltar. Tres columnas obligan a dos toques donde hace falta uno |
| La tarjeta se identifica por **número de mesa**, el texto más grande | La tarjeta se identifica por **el nombre del cliente**, el texto más grande. El folio va chiquito | Porque el nombre es lo que se grita y es lo que el cliente está esperando oír. Un número de folio no se grita: "¡folio cuatro mil ochocientos veintiuno!" |
| **Tres estados**: pendiente, preparando, listo | **Cuatro**: en fila, preparando, listo, **entregado** | En restaurante el plato lo recoge un empleado y el ciclo se cierra solo. Aquí lo recoge el cliente, y el pedido que **nadie recogió** es un caso real que hay que poder ver, contar y costear. Sin el cuarto estado, el vaso frío de las nueve de la mañana no existe en ningún reporte |
| El reloj mide desde que se comandó | El reloj mide **desde que se cobró** hasta que se entregó | Es el único indicador operativo del giro, porque es literalmente lo que el cliente está viviendo de pie. Y tiene consecuencia económica: bajar de tres a dos minutos permite atender 50% más gente en la misma hora |
| La cocina **nunca ve dinero**: el servidor no manda precios, campo por campo | La barra **sí ve el total del pedido**, porque la barra es la caja | No es una relajación del control: es que el rol `barista` incluye `cajero`. La regla "cocina no ve costos ni márgenes" se conserva igual: ve el total del ticket, nunca el costo ni el margen |

**Se construye el tronco una vez y esta variante.**

### F-319 · Llamado de "listo"

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| Aviso en pantalla y por voz **dirigido al mesero**, dentro de la aplicación | Llamado **dirigido al cliente**, fuera de la aplicación: el nombre se enciende en una pantalla que mira al salón y se dice por voz | El destinatario es distinto y no tiene sesión, ni dispositivo, ni idea de que existe un sistema. Un aviso dentro de la app no le llega a alguien que está parado con el teléfono en la mano |
| Se avisa una vez; el mesero lo recoge | Se puede llamar **varias veces**, y cada llamado se registra | Porque la gente se distrae, sale a contestar una llamada, está en el baño. El número de llamados por pedido es el indicador que dice si la pantalla de recogida está mal puesta o si el volumen está bajo |
| No hay a quién perder | Existe el pedido **no recogido**: se llamó tres veces y nadie vino | Es una pérdida real —el insumo salió, la bebida se tiró— y hoy no la ve nadie |

**Esta variante se construye junto con F-329 y comparten la misma tabla de llamados.**

### F-240 · F-241 · Propinas

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| **Tres momentos y tres personas** posibles: el mesero en la mesa, el comensal desde el QR, el cajero al cobrar. Con estados `decidir_en_caja` y `pendiente_cliente` | **Un momento y una persona**: el cliente, en la segunda pantalla del mostrador, en los cuatro segundos entre que ve el total y mete la tarjeta | No hay delegación posible porque no hay nadie a quien delegar: quien atiende, quien cobra y quien prepara son la misma persona, y el cliente está enfrente. Los estados `decidir_en_caja` y `pendiente_cliente` **no existen** en esta plantilla |
| La propina se atribuye **al mesero que atendió la mesa** (`empleado_atiende_id`) | La propina **no se atribuye a nadie**: entra al **bote del turno** | Porque no hay un "el que atendió". En un mostrador de dos personas, uno cobra y el otro vaporiza, y en la siguiente bebida al revés. Atribuir sería inventar un dato |
| Se liquida **por mesero**, con folio, serie y rango | Se liquida **por turno**, repartida **por horas presentes** (F-248) | Es la práctica real del giro y la que la ley permite: la propina es del personal (LFT 346) y el reparto entre el propio equipo tiene que ser acordado y transparente. Por horas es el único reparto que nadie discute en un equipo de dos o tres |
| El diálogo lo ve **el cajero**, de espaldas al comensal | El diálogo lo ve **el cliente**, en una segunda pantalla (F-249), y el barista **no toca nada** | Es la diferencia entre sugerir y presionar. Profeco insiste en que la propina es voluntaria; que la elija el cliente, en su pantalla, sin que nadie le vea la mano, es lo que hace que eso sea cierto en la práctica y no sólo en el reglamento |
| Porcentajes sugeridos por omisión `5, 10, 15, 20` | Por omisión **`$5, $10, $15` en pesos**, no en porcentaje, más "Otro" y "Sin propina" | Sobre un ticket de $118, un 15% son $17.70 y nadie deja $17.70 en un mostrador. El estándar mexicano en barra es **monto redondo**, no porcentaje. Sugerir porcentajes sobre un ticket bajo se lee como presión y baja la propina en vez de subirla |

**Se construye el tronco una vez (F-240 + F-245) y esta variante + F-248 + F-249.**

### F-234 · Corte diario y su PDF · F-233 · Corte de turno

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| Contesta: **¿cuadró la caja y cuánto le toca a cada mesero de propina?** | Contesta: **¿cuadró la caja, cuánto se fue en leche, café y vaso, y cuánto hay en el bote del turno?** | Son dos preguntas distintas porque son dos negocios distintos. El restaurante cierra un pleito de reparto; la cafetería cierra una fuga de insumo. La sección de propinas de aquí ocupa cinco renglones; la de insumos, media hoja |
| Tabla de **propinas por mesero** | Tabla de **bote del turno y su reparto por horas** | No hay a quién atribuir. Lo que hay es cuántas horas estuvo cada quien |
| Sin sección de canal | **Bebidas por canal: en taza / para llevar / plataforma** | Decide cuántos vasos pedir y si la plataforma vale la pena. Es la sección que ningún corte del mercado trae |
| Sin comisión de terminal | **Comisión estimada de terminal** como línea del resumen | Con 3.6% + IVA sobre el 55% de las ventas, es más dinero que el software. No verlo es no ver el segundo gasto variable del negocio |
| Sin merma de barra | **Merma de barra del turno**: calibración, vaporizado, rehechas | Es el dolor 1. Un corte de cafetería sin esto está incompleto |
| Sin sellos | **Sellos otorgados y canjes del turno** | Los sellos otorgados son un pasivo. Un corte que no lo dice deja crecer una deuda invisible |
| Un corte de turno (17:00) + un cierre diario (23:30) | **Dos cortes de turno completos** (14:30 y 20:30), y el de la tarde es el cierre | En restaurante el corte de turno existe para que el mesero se lleve su propina. Aquí existe para lo mismo, pero **el bote se reparte físicamente esa tarde**, con dinero contado, delante de los dos. No es un reporte: es una entrega |
| Sección de insumos ordenada por costo total | Sección de insumos **encabezada siempre por café y leche**, en ese orden, aunque no sean las líneas más caras | Porque son las dos que se cuentan a diario y las dos que se fugan. El orden del documento es el orden en que se lee, y lo que se lee primero es lo que se revisa |

**El tronco del corte es común; el documento se arma por giro. Ver `02-DINERO-Y-CAJA.md` §9.**

### F-115 · F-128 · Inventario V6 y receta

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| Receta **larga**: un platillo puede tener doce insumos, cada uno con su porcentaje de merma de limpieza. Una pieza de res rinde 72% | Receta **corta y con variantes**: café, leche, jarabe, vaso. Tres a seis líneas. **Sin merma de limpieza**, porque nada se limpia | El restaurante transforma materia prima cruda; la cafetería **mezcla producto ya listo**. El campo `merma_bp` existe en la receta y en esta plantilla vale cero en el 95% de los casos. Dejarlo visible sería enseñar un campo que nadie usa |
| Una receta por producto | **Una receta por producto × tamaño × tipo de leche**, resuelta con modificadores que alteran líneas de receta | Un latte de 12 oz con leche entera y uno de 16 oz con avena son dos costos distintos que se venden como el mismo producto. Sin esto el costo de la mitad del menú está mal, y la mitad cara |
| El empaque no existe como insumo | **El vaso, la tapa y la manga son líneas de receta con canal** (F-331) | De $2.50 a $3.50 por bebida. Es el tercer costo del producto |
| La merma se registra desde Inventario, con motivo | La merma se registra **desde la propia pantalla de barra**, con cuatro motivos tipados (F-156), en un toque | Porque pasa mientras se trabaja, no al final del día. Una merma que hay que ir a capturar a otra pantalla es una merma que no se captura |
| Descuento al cobrar, con la línea **ya consumida** hace una hora | Descuento al cobrar, con la línea **todavía sin preparar** | Se invierte el riesgo, y para bien: en restaurante el inventario está **sobrevaluado** 90 minutos; aquí está **infravalorado** tres minutos. Ver `03-INVENTARIO.md` §3 |

**Tronco V6 común; esta variante añade receta por modificador, empaque por canal y merma de barra.**

### F-027 · Modificadores y extras

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| El modificador es una **instrucción a una persona**: "sin cebolla", "término medio". Puede o no cambiar el precio | El modificador es **parte del producto**: cambia el precio, cambia la receta y cambia lo que sale del refrigerador | "Leche de avena" no es una instrucción, es otro insumo con otro costo. Si el sistema lo trata como una nota, el consumo de leche de avena nunca baja y el de entera baja de más |
| Se usa en tal vez el 15% de las líneas | Se usa en **más del 60% de las líneas del pico de las 10:00**, que es cuando más crece el ticket | Los datos agregados del giro lo dicen: el crecimiento del ticket promedio viene de dejar que el cliente construya su bebida —saborizante, tipo de leche, temperatura— no de vender más cafés. El modificador **es** la palanca de ingreso de este negocio |
| Vive en un diálogo secundario | Vive en **la pantalla principal de cobro**, como una rejilla de un solo toque por grupo | Si escoger "avena, 16 oz, sin azúcar" cuesta cinco toques, el barista lo escribe en el vaso y el dato se pierde. Ver `04-INTERFAZ.md` |

**Se construye el tronco (grupos de modificadores, ya existe como `modificadores` y
`producto_modificadores`) y esta variante, que le añade impacto en receta.**

### F-030 · Paquetes y combos

| En `restaurante` | Aquí | Por qué la diferencia |
|---|---|---|
| El combo es la **comida corrida**: sopa + guisado + agua a precio fijo, donde el comensal **elige dentro de cada tiempo** | El combo es un **par fijo**: bebida + pan, a precio de paquete. Sin elección dentro de tiempos | Porque el combo de cafetería existe para subir el ticket **sin sumar tiempo de barra**: el pan no se vaporiza ni ocupa el grupo de la espresso. Un combo con elección obliga a una pantalla de tres pasos en plena ráfaga |
| El precio del combo sustituye a los precios individuales | El precio del combo es **el precio individual menos un descuento declarado**, y cada mitad **explota su propia receta** | Es la única forma de que el margen del combo sea verdad. Si el combo fuera un producto con receta propia, habría que mantener dos recetas de lo mismo y el día que cambie el precio de la leche una de las dos se queda vieja |

**Se construye el tronco y esta variante.**

### F-200 · Carrito · F-220 · Ticket · F-011 · IVA

- **F-200** — el carrito vive **cuarenta segundos** y se cobra. No sobrevive a que se cierre la
  pantalla, no tiene estado propio, no es un objeto de negocio. Lo que sí necesita y `restaurante`
  no: **el nombre del pedido y el canal** (aquí / para llevar), capturados **antes** de cobrar
  porque los dos afectan lo que va a pasar después — el nombre al llamado, el canal al empaque.
- **F-220** — **un solo documento**. No hay precuenta y no puede haberla: no existe el momento en
  que alguien revise antes de pagar. El ticket lleva, y `restaurante` no: **el nombre del pedido**
  y **los sellos acumulados** al pie.
- **F-011** — IVA **extraído al 16%**, igual que en `restaurante`, y por la misma razón: el menú
  de pizarrón dice $45 y se cobran $45. Va marcada `[=]` arriba y se nombra aquí sólo para que
  nadie la busque.

### F-230 · F-231 · F-235 · La caja

- **F-230** — el fondo de apertura es de **$800 a $1,200**, no de $1,500, y está compuesto casi
  todo de monedas y billetes de $20 y $50. La pantalla de apertura de esta plantilla pide el
  desglose por denominación, no un importe global, **porque lo que se acaba en la ráfaga no es el
  dinero: es el cambio**.
- **F-231** — se añade un movimiento que `restaurante` no tiene: **entrada de cambio**, con su
  propio motivo. Es el movimiento más frecuente de la mañana y hoy se registra como "entrada"
  genérica, que lo confunde con un préstamo entre turnos.
- **F-235 · Varias cajas simultáneas** — **aquí sí hace falta, y en `restaurante` no.** El propio
  `02-DINERO-Y-CAJA.md` de restaurante lo dice con esas palabras: *"varias cajas simultáneas es un
  caso de supermercado o de cafetería de alto volumen, no de aquí"*. El sábado a las 11:00 se abre
  una segunda terminal en el otro extremo de la barra, con su propio fondo y su propio arqueo.

---

## 4 · LAS `[+]` · exclusivas de este modelo

```
F-328 Fila de despacho de mostrador [+] exclusiva de: cafeteria
      (y de comida-rapida, taqueria, jugueria cuando se documenten)
      Ningún otro modelo tiene un objeto que sea A LA VEZ una venta
      cobrada y una preparación pendiente. En A2 con mesa, el pedido
      pendiente es la mesa. En A1 puro, no hay pendiente: se entrega
      en el acto. Este objeto vive exactamente en el hueco entre los
      dos arquetipos, y es lo que hace que la cafetería sea un modelo
      propio y no "restaurante sin mesas".

F-329 Llamado por nombre y pantalla de recogida [+] exclusiva
      Es el único caso del sistema donde una pantalla se dirige a
      alguien que NO tiene sesión, NO tiene dispositivo y NO sabe que
      existe un punto de venta. Eso cambia todo: el tamaño de la
      tipografía, el contraste, el idioma y el hecho de que no se
      pueda interactuar con ella.

F-330 Pedido anticipado con hora de recogida [+] exclusiva
      Distinta de la reserva de A7 (se reserva un espacio por un
      periodo) y del pedido a domicilio de A9 (el negocio va al
      cliente). Aquí el cliente pide a las 07:40 desde el camión y
      recoge a las 08:05 caminando. La bebida no puede prepararse
      antes: un latte a los diez minutos ya no es un latte.

F-331 Consumo de empaque según canal [+] exclusiva
      Ningún otro giro tiene un insumo que se consuma o no según una
      decisión que el cliente toma en el mostrador. En retail el
      empaque es fijo; en restaurante no existe. Aquí decide entre el
      5.5% y el 7.8% del precio de la bebida.

F-248 Bote del turno repartido por horas presentes [+] exclusiva
      Distinta de F-242 (reparto por puntos de puesto): aquí no hay
      puestos distintos que ponderar, hay dos personas que hacen lo
      mismo durante horas distintas. El reparto por puntos en un
      equipo de dos es una fórmula para un problema que no existe.

F-249 Segunda pantalla al cliente [+] exclusiva
      (y de cualquier mostrador de alto volumen que se documente)
      Es la única pantalla del sistema que el cliente OPERA. No la
      mira: la toca. Eso la pone en una categoría aparte de
      accesibilidad, de seguridad y de contenido.

F-156 Merma de barra: calibración, vaporizado y rehechas [+] exclusiva
      El dial-in de la mañana —tres a cinco shots a la basura, todos
      los días, $700 al mes— no existe en ningún otro giro. Ninguna
      otra operación tira producto a propósito para poder empezar.

F-157 Frescura del grano por fecha de tueste [+] exclusiva
      El café no caduca: pierde. Se bebe bien entre los 3 y los 30
      días del tueste. Eso no es caducidad (V4) ni es merma: es una
      ventana de calidad que dispara una decisión de uso, no de tirar.

F-936 Pasivo de lealtad: sellos otorgados sin canjear [+] exclusiva
      (por ahora; lo heredará cualquier giro con tarjeta de sellos)
      Los puntos de F-930 son un descuento futuro difuso. Un sello es
      una obligación concreta de entregar un producto físico con un
      costo conocido. Es deuda, y como toda deuda hay que poder verla.
```

---

## 5 · LO QUE FALTA · pendientes de este modelo

Lo que hoy tiene `operativo` y lo que le falta para que el nombre `cafeteria` sea honesto,
ordenado por lo que cuesta operar sin ello.

| ID | Función | Qué duele hoy sin ella |
|---|---|---|
| **F-328** | Fila de despacho de mostrador | Se cobra y el vaso desaparece del sistema. Quince personas esperando algo que el punto de venta no sabe que existe. Es el hueco **más grande** y el que convierte a `operativo` en "un POS de tienda vendiendo café". |
| **F-329** | Llamado por nombre y pantalla de recogida | El nombre vive escrito con plumón y en la memoria de alguien con las dos manos ocupadas. Se entregan bebidas a quien no era, se quedan vasos fríos, y nadie puede decir cuánto tardó de verdad un pedido. |
| **F-027** | Modificadores en mostrador con impacto en receta | El 60% de las líneas del pico se captura mal o no se captura. La leche de avena nunca baja del inventario. El ticket promedio no crece porque ofrecer opciones cuesta cinco toques. |
| **F-331** | Empaque por canal | Todos los márgenes de la plantilla están inflados entre 5 y 8 puntos. Y no se puede saber cuántos vasos pedir. |
| **F-156** | Merma de barra | $700 al mes de calibración más el 5–15% de la leche, invisibles. El inventario de café nunca cuadra y la dueña concluye que "las recetas no sirven". |
| **F-248** | Bote del turno por horas | El reparto se hace a ojo, en efectivo, y en cuanto entra un tercero los fines de semana empieza el resentimiento. Es el equivalente exacto del dolor 2 de `restaurante`, en su versión de mostrador. |
| **F-249** | Segunda pantalla al cliente | Hoy la propina la teclea el barista mirando al cliente a los ojos. Eso no es sugerir, es pedir, y además regala segundos en la ráfaga. |
| **F-030** | Combos café + pan | El combo se captura como dos líneas y un descuento manual, así que ni el margen del combo ni cuántos se vendieron existen. |
| **F-930/F-934/F-936** | Sellos, canje y su pasivo | La tarjeta de cartón se pierde, se falsifica y no se mide. En una cafetería de barrio la recurrencia **es** el negocio, y hoy no hay un solo dato sobre ella. |
| **F-023** | Listas de precio | El precio de plataforma es el mismo que el de barra, así que cada pedido de Uber Eats se vende con un 29% de pérdida de margen que nadie ve. |
| **F-106** | Toma de inventario físico | La leche se cuenta todos los días en una libreta y no se compara con nada. Sin esto, la sección de insumos consumidos del corte no tiene contra qué medirse. |
| **F-984** | Cajón de dinero | Se abre a mano. En 180 cobros al día son 180 movimientos de más y una fuente constante de "se quedó abierto". |
| **F-157** | Frescura del grano | Se usa grano de cinco semanas para espresso y el cliente lo nota antes que la dueña. |
| **F-235** | Varias cajas simultáneas | El sábado se cobra todo desde una terminal y la fila llega a la calle. |
| **F-330** | Pedido anticipado | Se pierde el cliente de oficina que quiere seis cafés a las 8:15 y no tiene forma de pedirlos antes. |

---

## 6 · FUNCIONES QUE FALTAN EN EL CATÁLOGO

**Ya están en `03-CATALOGO-DE-FUNCIONES.md`.** Los IDs se toman del siguiente libre de cada bloque,
respetando los que `restaurante` ya propuso (F-247, F-261, F-262, F-323, F-324, F-325).

> **Reconciliado el 14-09-2026 (D-11).** Este modelo cedió los **dos únicos IDs en colisión** de
> toda la Fase 2, los dos contra `abarrotes`:
>
> ```
> F-146  merma de barra          →  F-156     (abarrotes conserva F-146, caducidad sin lote)
> F-148  frescura del grano      →  F-157     (abarrotes conserva F-148, peso embebido en EAN-13)
> ```
>
> Cedió `cafeteria` y no `abarrotes` porque la acepción de `abarrotes` la citan **tres** modelos
> —`abarrotes`, `ferreteria` y `estetica-salon`— contra uno solo de éste, y porque
> `estetica-salon` ya había deconflictado a mano contra la numeración de `abarrotes`. Mover
> `abarrotes` habría roto tres carpetas en vez de una.

| ID propuesto | Función | Bloque | Por qué hace falta |
|---|---|---|---|
| **F-328** | **Fila de despacho de mostrador** — el pedido pagado que espera de pie | F-3xx | Es el objeto central del modelo y no lo cubre nada: F-310 es el envío, F-314 son los estados de una comanda que aún no se cobra, y F-301 es una mesa. Ninguno describe *una venta cerrada que todavía no se entregó*. Sin ID, `comida-rapida`, `taqueria` y `jugueria` lo van a reinventar con tres nombres distintos. |
| **F-329** | **Llamado por nombre y pantalla de recogida**, con bitácora de llamados | F-3xx | F-319 es el aviso interno al mesero. Esto es un aviso **al cliente**, en una pantalla pública, repetible y medible. Son dos cosas distintas y la segunda no existe. |
| **F-330** | **Pedido anticipado con hora de recogida** | F-3xx | No es reserva (A7), no es domicilio (F-820), no es venta en espera (F-224, que es del lado del cajero). Es un pedido pagado con una hora prometida que entra solo a la fila en el minuto correcto. |
| **F-331** | **Consumo de empaque según canal de entrega** | F-3xx | F-128 tiene receta y F-129 la explota, pero ninguna de las dos sabe que una línea de receta puede depender de una decisión tomada en el mostrador. Es una línea de receta condicionada, y hace falta declararlo como función para que exista el campo `aplica_canal`. |
| **F-248** | **Bote de propina del turno repartido por horas presentes** | F-2xx | F-242 reparte por puntos de puesto y F-243 va directa al profesional. Ninguna resuelve "dos personas que hacen lo mismo durante horas distintas". Necesita además el registro de presencias del turno, que es la semilla de F-960/F-961. |
| **F-249** | **Segunda pantalla al cliente**: total, desglose y elección de propina | F-2xx | Ninguna función del catálogo describe una pantalla que el cliente opera dentro del local. F-920 es el portal en el teléfono del cliente; esto es hardware del mostrador. |
| **F-156** | **Merma de barra**: calibración, vaporizado sobrante, bebida rehecha, caducidad de leche | F-1xx | F-109 es "merma con motivo" genérica. Lo que falta no es el motivo: es que la calibración es un **evento diario de apertura**, con gramaje conocido, que se captura en un toque y antes de que abra la caja. Y que la bebida rehecha consume el insumo **dos veces después de cobrada**, que F-324 (anulación de línea) no cubre porque no se anula nada. |
| **F-157** | **Frescura del grano por fecha de tueste** | F-1xx | No es caducidad (F-113/F-123): el café no se echa a perder, se vuelve plano. La decisión que dispara no es "tirar", es "cambiar de uso o rematar". Es una función chica y sin ella la cafetería de especialidad no se siente comprendida. |
| **F-936** | **Pasivo de lealtad**: recompensas otorgadas y no canjeadas, valuadas al costo | F-9xx | F-930 acumula y F-934 canjea. Ninguna dice cuánto debes. Es un pasivo real, crece solo, y decide si la promoción se sostiene. |

**Además, esta carpeta adopta dos funciones que `restaurante` propuso y no construyó:**

- **F-261 · Consumo de empleados y cortesías.** Aquí es más urgente que allá: tres personas por
  tres o cuatro bebidas de turno son diez a doce bebidas diarias, ~$190 de insumo al día,
  **~$5,700 al mes** que hoy se registran como merma y ensucian el único indicador que sirve para
  detectar robo.
- **F-262 · Bloqueo de cierre por unidades abiertas.** Aquí la unidad abierta no es una mesa: es
  un **pedido en la fila sin entregar**. No se puede cerrar el turno con bebidas sin entregar, por
  la misma razón exacta.

---

## 7 · DEPENDENCIAS

Las flechas se leen "necesita".

```
F-328 Fila de despacho de mostrador
  → F-310 Enviar a preparación       (ya existe: se reutiliza el envío)
  → F-311 Estaciones                 (ya existe: la barra es una estación)
  → F-314 Estados                    (ya existe: se le añade `entregado`)
  → F-200 Carrito                    (NUEVO campo: nombre y canal antes de cobrar)
  → F-102 Decremento atómico         (ya existe: el cobro y el encolado son
                                      la misma transacción o no son)

F-329 Llamado por nombre y pantalla de recogida
  → F-328 Fila de despacho           (no se llama lo que no está en la fila)
  → F-013 Terminales                 (la pantalla de recogida es una terminal
                                      con su propio tipo y sin sesión de usuario)

F-330 Pedido anticipado con hora de recogida
  → F-328 Fila de despacho           (entra a la misma fila, con hora)
  → F-922 Portal V2                  (es donde se levanta)
  → F-215 Cobro con pasarela         (se paga al pedir, no al recoger)  ← APAGADO HOY
       · Sin pasarela, F-330 arranca en modo «pedir y pagar al recoger»,
         que es peor pero funciona. Se dice y no se esconde.

F-331 Consumo de empaque según canal
  → F-128 Receta                     (ya existe: se le añade `aplica_canal`)
  → F-129 Explosión al cobrar        (ya existe: filtra por canal del pedido)
  → F-200 Carrito                    (el canal se decide aquí)

F-248 Bote del turno repartido por horas
  → F-240 Propinas                   (ya existe)
  → F-245 Desglose exacto            (ya existe: el bote es efectivo + tarjeta)
  → F-233 Corte de turno             (ya existe: es su momento)
  → F-961 Horas trabajadas           (NO EXISTE. Se resuelve con una tabla de
                                      presencias del turno, que es la semilla)

F-249 Segunda pantalla al cliente
  → F-013 Terminales                 (es una segunda pantalla de la misma terminal)
  → F-241 Propina sugerida           (ya existe: cambia dónde se muestra)

F-156 Merma de barra
  → F-101 Ledger inmutable           (ya existe: escribe ahí)
  → F-109 Merma con motivo           (ya existe: se le tipan cuatro motivos)
  → F-132 Insumo base                (el shot de calibración es café, sin receta)
  → F-328 Fila de despacho           (la bebida rehecha nace de un pedido)

F-157 Frescura del grano
  → F-632 Recepción de compra        (ya existe: la fecha de tueste se captura ahí)
  → F-107 Alertas de mínimo          (ya existe: mismo mecanismo, otro umbral)

F-930/F-934/F-936 Sellos, canje y pasivo
  → F-040 Clientes                   (ya existe la tabla `clientes`; NO está
                                      declarada en el puente. Hay que declararla)
  → F-041 Historial de compra        (el sello nace de una venta)
  → F-220 Ticket                     (los sellos se imprimen al pie)

F-030 Combos
  → F-020 Catálogo                   (ya existe)
  → F-128 Receta                     (cada mitad explota la suya)
  → F-202 Descuento por línea        (ya existe: el ahorro del combo es
                                      un descuento declarado, no un precio nuevo)

F-023 Listas de precio
  → F-022 Precio único               (ya existe: la lista es una excepción)
  → F-820 Pedido a domicilio         (es quien la usa: canal plataforma)
```

---

## 8 · ORDEN DE CONSTRUCCIÓN

Derivado de las dependencias de §7 y del costo operativo de §5. No es el orden fácil: es el orden
que devuelve dinero antes.

```
TANDA 1 · lo que convierte `operativo` en `cafeteria`
  1.  F-200  Carrito con nombre y canal        (campo previo, desbloquea 328 y 331)
  2.  F-328  Fila de despacho de mostrador     (el hueco más grande)
  3.  F-329  Llamado por nombre y recogida     (necesita 328; sin esto, 328
                                                es media función)
  4.  F-331  Empaque por canal                 (cae casi gratis después de 1)

TANDA 2 · lo que arregla los números
  5.  F-027  Modificadores con impacto en receta
  6.  F-156  Merma de barra                    (cierra el dolor 1 junto con 5)
  7.  F-249  Segunda pantalla al cliente       (necesita 241, que ya existe)
  8.  F-248  Bote del turno por horas          (necesita 249 para cobrar bien
                                                y presencias para repartir bien)

TANDA 3 · lo que hace que vuelvan
  9.  F-040  Clientes declarados en el puente  (la tabla existe y no se lee)
  10. F-930  Sellos por bebida
  11. F-934  Canje de recompensa
  12. F-936  Pasivo de sellos                  (necesita 930 y 934)
  13. F-030  Combos café + pan

TANDA 4 · deuda de fondo y crecimiento
  14. F-106  Toma de inventario físico         (alimenta a 133)
  15. F-133  Rendimiento real contra teórico   (cierra el dolor 1 del todo)
  16. F-157  Frescura del grano
  17. F-023  Listas de precio                  (desbloquea 820 acotado)
  18. F-922  Portal V2 + F-330 pedido anticipado
  19. F-235  Varias cajas simultáneas
  20. F-017  Diccionario de vocabulario        (transversal a los 78)
```

**Por qué F-200 va primera aunque suene a nada.** El nombre del pedido y el canal de entrega son
dos campos que hay que capturar **antes del cobro**, y de ellos dependen tres funciones: la fila
(F-328) necesita el nombre, el llamado (F-329) necesita el nombre, y el empaque (F-331) necesita
el canal. Construir cualquiera de las tres sin esos dos campos obliga a escribirla dos veces —
exactamente el mismo argumento por el que `restaurante` puso F-324 en primer lugar.

**Por qué F-329 no se puede aplazar detrás de F-328.** Una fila de despacho que nadie ve desde el
salón resuelve la mitad del problema: el barista sabe qué falta, pero el cliente sigue sin saber
que lo suyo está listo. Construir 328 y dejar 329 para después es tener el dato y no usarlo, que
es peor que no tenerlo, porque cuesta lo mismo y no se nota.
