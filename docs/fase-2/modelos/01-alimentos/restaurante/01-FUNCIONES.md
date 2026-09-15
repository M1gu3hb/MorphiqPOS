# 01 · FUNCIONES · Restaurante de mesa

IDs canónicos de `03-CATALOGO-DE-FUNCIONES.md`. **Nunca se inventa un ID aquí**: lo que falta se
declara al final, en §6, para añadirlo al catálogo.

```
[=]  idéntica al tronco     [≠]  variante      [+]  exclusiva
[⚙]  construida y operando  [◐]  parcial       [ ]  pendiente
```

**Advertencia de lectura que aplica sólo a este modelo.** Restaurante es el **origen** del
arquetipo A2: no reutiliza de ningún vecino porque es el primero. Cuando una función va marcada
`[=]`, quiere decir *se construye aquí una sola vez y de aquí la heredan cafetería, bar, taquería,
pizzería y cervecería*. Las tablas de tres columnas de las `[≠]` comparan contra **`cafeteria`**,
que es el vecino más cercano (A2 de mostrador, sin mesas ni cocina), porque comparar contra un
modelo inexistente no serviría de nada.

---

## 1 · ÁRBOL COMPLETO

```
RESTAURANTE DE MESA
│
├── NÚCLEO · identidad y acceso
│   ├── F-001 Tarjetas de empleado ............................... [=] [⚙]
│   ├── F-002 PIN de 4 dígitos, Argon2id en servidor ............. [=] [⚙]
│   ├── F-003 Roles y permisos ................................... [=] [⚙]
│   │         Cinco roles vivos: administrador, caja, mesero, cocina
│   │         (+ barra, heredado de sólo lectura)
│   ├── F-004 Sesión revocable con caducidad ..................... [=] [⚙]
│   ├── F-005 Bloqueo por intentos fallidos ...................... [=] [⚙]
│   ├── F-006 Bitácora de acceso y auditoría ..................... [=] [⚙]
│   └── F-007 Permisos finos por módulo .......................... [=] [ ]
│             Hoy hay 22 claves en `lib/permissions.js` pero se
│             asignan por rol, no una por una.
│
├── NÚCLEO · configuración
│   ├── F-010 Identidad del negocio .............................. [=] [⚙]
│   ├── F-011 Impuestos: IVA extraído ............................ [≠] [⚙]
│   ├── F-012 Sucursales ......................................... [=] [⚙]
│   ├── F-013 Terminales ......................................... [=] [⚙]
│   ├── F-014 Apariencia y tema .................................. [=] [⚙]
│   ├── F-015 Plantilla de negocio ............................... [+] [ ]
│   │         Renombre `restaurante_pro` → `restaurante` (D-01)
│   ├── F-016 Perillas por módulo ................................ [≠] [◐]
│   │         Existen 9 switches reales en Configuración
│   └── F-017 Diccionario de vocabulario del giro ................ [+] [ ]
│             El vocabulario está hoy escrito a mano en los .jsx
│
├── NÚCLEO · catálogo
│   ├── F-020 Catálogo de productos y servicios .................. [≠] [⚙]
│   ├── F-021 Categorías ......................................... [=] [⚙]
│   ├── F-022 Precio único ....................................... [=] [⚙]
│   ├── F-026 Precio por horario o temporada ..................... [=] [ ]
│   │         No es del restaurante de mesa. Es del bar (happy hour).
│   ├── F-027 Modificadores y extras ............................. [≠] [⚙]
│   ├── F-028 Imágenes de producto ............................... [=] [⚙]
│   ├── F-030 Paquetes y combos .................................. [≠] [ ]
│   │         Sí aplica: la "comida corrida" es un combo de tres tiempos
│   ├── F-032 Importación masiva por Excel ....................... [=] [⚙]
│   └── F-131 Producto por peso variable ......................... [+] [⚙]
│
├── SALÓN · exclusivo A2
│   ├── F-300 Zonas y distribución ............................... [+] [⚙]
│   ├── F-301 Unidades de servicio con estado y capacidad ........ [≠] [⚙]
│   ├── F-302 Unir y separar unidades ............................ [+] [ ]  ← FALTA
│   ├── F-303 Cambiar de unidad .................................. [+] [ ]  ← FALTA
│   ├── F-304 Asignación de responsable .......................... [=] [⚙]
│   ├── F-305 Tiempo de ocupación ................................ [=] [ ]  ← FALTA
│   └── F-306 Lista de espera .................................... [=] [ ]  ← FALTA
│
├── PREPARACIÓN · exclusivo A2
│   ├── F-310 Enviar a preparación ............................... [+] [⚙]
│   ├── F-311 Estaciones de preparación .......................... [+] [⚙]
│   ├── F-312 Ruteo de producto a estación ....................... [+] [⚙]
│   ├── F-313 Pantalla de preparación ............................ [+] [⚙]
│   ├── F-314 Estados: pendiente, preparando, listo .............. [+] [⚙]
│   ├── F-315 Tiempos por platillo ............................... [+] [◐]  ← FALTA
│   ├── F-316 Alertas de alergia ................................. [+] [⚙]
│   ├── F-317 Notas al preparador ................................ [+] [⚙]
│   ├── F-318 Impresión de comanda ............................... [+] [ ]  ← FALTA
│   └── F-319 Llamado de "listo" ................................. [+] [◐]
│             Existe aviso en pantalla y por voz; no existe llamador físico
│
├── CUENTA
│   ├── F-320 Cuenta abierta que crece ........................... [+] [⚙]
│   ├── F-321 Dividir cuenta ..................................... [+] [ ]  ← FALTA
│   └── F-322 Precuenta .......................................... [+] [⚙]
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
│   └── F-225 Reimpresión de ticket .............................. [=] [⚙]
│
├── CAJA
│   ├── F-230 Apertura con fondo ................................. [=] [⚙]
│   ├── F-231 Movimientos: entrada, retiro, gasto ................ [=] [⚙]
│   ├── F-232 Arqueo a ciegas .................................... [=] [⚙]
│   ├── F-233 Corte de turno ..................................... [=] [⚙]
│   ├── F-234 Corte diario y su PDF .............................. [≠] [⚙]
│   ├── F-235 Varias cajas simultáneas ........................... [=] [ ]
│   └── F-236 Caja por terminal .................................. [=] [⚙]
│
├── PROPINAS
│   ├── F-240 Propinas (tronco) .................................. [≠] [⚙]
│   ├── F-241 V2 · Sugerida al cobrar ............................ [—] [⚙]
│   ├── F-242 V3 · Repartida por puntos .......................... [—] [ ]  ← FALTA
│   ├── F-245 Desglose exacto por método ......................... [=] [⚙]
│   └── F-246 Liquidación de propinas por periodo ................ [=] [⚙]
│
├── INVENTARIO · variante V6
│   ├── F-100 Existencia actual por almacén ...................... [=] [⚙]
│   ├── F-101 Ledger inmutable de movimientos .................... [=] [⚙]
│   ├── F-102 Decremento atómico al cobrar ....................... [=] [⚙]
│   ├── F-103 Kardex por artículo ................................ [=] [ ]
│   ├── F-104 Ajuste manual con motivo obligatorio ............... [=] [⚙]
│   ├── F-105 Traspaso entre almacenes ........................... [=] [ ]
│   ├── F-106 Toma de inventario físico y diferencias ............ [=] [ ]
│   ├── F-107 Alertas de mínimo .................................. [=] [⚙]
│   ├── F-108 Valuación (costo promedio) ......................... [=] [⚙]
│   ├── F-109 Merma con motivo ................................... [≠] [◐]
│   ├── F-115 V6 · Peso, volumen y receta ........................ [≠] [⚙]
│   ├── F-128 Receta / escandallo ................................ [+] [⚙]
│   ├── F-129 Explosión de receta al cobrar ...................... [+] [⚙]
│   ├── F-130 Costeo por insumo .................................. [+] [⚙]
│   ├── F-132 Insumo base (el producto ES el insumo) ............. [+] [⚙]
│   └── F-133 Rendimiento real contra teórico .................... [+] [ ]
│
├── COMPRAS Y GASTOS
│   ├── F-250 Gastos con categoría ............................... [=] [⚙]
│   ├── F-251 Plantillas de gasto fijo ........................... [=] [⚙]
│   ├── F-252 Comprobante adjunto al gasto ....................... [=] [ ]
│   ├── F-631 Proveedores ........................................ [=] [⚙]
│   ├── F-632 Recepción y entrada a inventario ................... [=] [⚙]
│   ├── F-633 Actualización de costo promedio .................... [=] [⚙]
│   └── F-634 Plantillas de compra recurrente .................... [=] [⚙]
│
├── REGISTROS Y DASHBOARD
│   ├── F-050 Ventas por periodo ................................. [≠] [⚙]
│   ├── F-051 Más vendidos ....................................... [≠] [⚙]
│   ├── F-052 Utilidad y margen .................................. [≠] [⚙]
│   ├── F-053 Cortes históricos .................................. [=] [⚙]
│   ├── F-054 Ventas por empleado ................................ [≠] [◐]
│   ├── F-055 Comparativo entre periodos ......................... [=] [ ]
│   ├── F-056 Dashboard .......................................... [≠] [⚙]
│   └── F-057 Exportación a Excel y PDF .......................... [=] [⚙]
│
├── PORTAL DEL COMENSAL
│   ├── F-920 Portal del cliente (tronco) ........................ [≠] [⚙]
│   ├── F-921 V1 · Menú QR y pedido en mesa ...................... [—] [⚙]
│   └── F-952 Encuesta de satisfacción ........................... [=] [⚙]
│
├── MULTI-SUCURSAL
│   ├── F-971 Inventario por sucursal ............................ [=] [⚙]
│   ├── F-973 Reportes consolidados .............................. [=] [ ]
│   └── F-974 Permisos por sucursal .............................. [=] [⚙]
│
└── HARDWARE
    ├── F-984 Cajón de dinero .................................... [=] [ ]
    ├── F-985 Impresora térmica .................................. [=] [⚙]
    └── F-986 Lector de código de barras ......................... [=] [◐]
              Existe y está apagado a propósito en esta plantilla:
              `MODULOS_EXCLUIDOS_DE_PRO = ['escaner_codigo_barras']`
```

---

## 2 · LAS `[=]` · idénticas, se construyen una sola vez

Marcadas `[=]` porque su comportamiento no cambia entre modelos. **Aquí es donde nacen**, y los
demás A2 las reutilizan sin tocarlas.

```
F-002 PIN de 4 dígitos, Argon2id en servidor [=]
      Origen: restaurante. El hash y la verificación viven en
      `packages/app/src/identidad/`. Ningún giro cambia qué es un PIN.
      NO SE VUELVE A CONSTRUIR.

F-232 Arqueo a ciegas [=]
      Origen: restaurante. Misma regla en los 78: se cuenta primero,
      el esperado lo calcula el servidor y aparece después. Está en
      `04-SISTEMA-DE-DISENO.md` §5 regla 1, y no admite variante.
      NO SE VUELVE A CONSTRUIR.

F-245 Desglose exacto por método [=]
      Origen: restaurante. `desgloseMetodosPagoExacto()` no reparte
      proporcionalmente nunca, en ningún giro. Lo que cambia entre giros
      es QUIÉN recibe la propina (F-240), no cómo se desglosa.
      NO SE VUELVE A CONSTRUIR.

F-101 Ledger inmutable de movimientos [=]
      Origen: restaurante. Tabla `movimientos_stock`, signo impuesto por
      `check` en la base. Las diez variantes de inventario escriben en
      este mismo ledger. Es el tronco del 60% del módulo.
      NO SE VUELVE A CONSTRUIR.

F-210 · F-211 · F-212 · F-213 Cobro y métodos de pago [=]
      Origen: restaurante. Un solo comando `/api/venta/cobrar` con un
      arreglo de pagos. Efectivo, tarjeta, transferencia y mixto se
      comportan igual en una taquería y en una ferretería.
      NO SE VUELVE A CONSTRUIR.

F-631 · F-632 · F-633 · F-634 Compras y costo promedio [=]
      Origen: restaurante. El promedio ponderado sobre stock anterior +
      entrante es aritmética, no giro.
      NO SE VUELVE A CONSTRUIR.
```

---

## 3 · LAS `[≠]` · mismo nombre, comportamiento distinto

Comparación contra **`cafeteria`** (A2 de mostrador), que es el vecino inmediato.

### F-301 · Unidades de servicio con estado y capacidad

| En cafeteria | Aquí | Por qué la diferencia |
|---|---|---|
| Hay mesas, pero son una etiqueta: "para llevar" o "mesa 3" | La mesa es un **objeto con estado, posición en un plano, forma, tamaño, capacidad, zona y responsable asignado** | En cafetería el cliente pide en barra y se sienta donde quiere; la mesa no es un recurso que se administre. Aquí la mesa **es** el recurso escaso del negocio y su estado decide la operación de todo el salón. |
| Dos estados bastarían: ocupada / libre | **Diez estados**: `libre`, `esperando_orden`, `pedido_enviado`, `en_preparacion`, `en_espera_entrega`, `ocupada`, `cuenta_solicitada`, `limpieza`, `pagada`, `cancelada` | Cada estado corresponde a una acción distinta de una persona distinta. `en_espera_entrega` le grita al mesero; `cuenta_solicitada` le grita al cajero; `limpieza` le grita al garrotero. Colapsarlos a dos deja mudas a tres personas. |
| Sin mapa | **Mapa con posición X/Y**, arrastrable, editable desde Configuración | El mesero no busca "mesa 14" en una lista: la busca donde está. El mapa es la memoria espacial del salón hecha pantalla. |

**Se construye el tronco una vez (entidad `mesas` + transiciones) y esta variante.**

### F-240 · Propinas

| En cafeteria | Aquí | Por qué la diferencia |
|---|---|---|
| V2 sugerida al cobrar, en el mostrador, decidida por el cliente frente al cajero | **V2 sugerida al cobrar + delegación**: el mesero puede diferirla (`decidir_en_caja`), el comensal puede fijarla desde el portal QR (`pendiente_cliente`), y la caja la confirma antes de cobrar | En mostrador el que cobra y el que atiende son la misma persona y el momento es uno solo. Aquí hay tres momentos posibles y tres personas, y el sistema tiene que saber **quién la decidió** para no volver a preguntar ni cobrar sin preguntar. |
| Se atribuye al turno | Se atribuye **al mesero que atendió la mesa** (`usuario_mesero_id`) | Es la base del reparto. Sin atribución por mesero no hay liquidación posible, y la liquidación es el dolor 2 de este negocio. |
| Sin liquidación | **Liquidación por periodo con folio, serie y rango** (F-246) | En cafetería la propina se saca del bote al cerrar. Aquí hay tarjeta de por medio, así que el dinero no está físicamente y hay que documentar cuándo se pagó y a quién. |

**Se construye el tronco una vez (F-240 + F-245 + F-246) y esta variante.**

### F-234 · Corte diario y su PDF

| En cafeteria | Aquí | Por qué la diferencia |
|---|---|---|
| Contesta: ¿cuadró la caja y qué se vendió? | Contesta: **¿cuadró la caja y cuánto le toca a cada mesero de propina?** | Es literalmente la pregunta de `04-SISTEMA-DE-DISENO.md` §5 para este giro. El corte existe para cerrar dos cosas: el cajón y el pleito. |
| Sin sección de meseros | Lleva **tabla de propinas por mesero** (sólo en esta plantilla) | En mostrador no hay a quién repartir. |
| Sin insumos consumidos | Lleva **ingredientes / insumos consumidos** con costo unitario y total | Es lo que le pone nombre al robo hormiga: lo que el sistema dice que debió salir contra lo que hay. |
| Un solo corte al día | **Corte de turno** (no cierra caja) + **cierre diario** (cierra) | Hay dos turnos de mesero con dos cajas de propina distintas. Sin corte de turno, el mesero de mediodía se va sin su dinero. |

**El tronco del corte es común; el documento se arma por giro.**

### F-115 · Inventario variante V6

| En cafeteria | Aquí | Por qué la diferencia |
|---|---|---|
| Receta corta y estable: café + leche + jarabe. Casi todo es insumo base | **Receta larga y con merma declarada**: un platillo puede tener doce insumos, cada uno con su porcentaje de merma de limpieza | La cafetería mezcla; el restaurante **transforma**. Una pieza de res rinde 72% después de limpiarla, y si eso no está en la receta el costo está mal desde el primer día. |
| Descuento al cobrar | Descuento **al cobrar**, igual — pero con la línea ya comandada y consumida hace una hora | El hueco temporal es real y es la razón de que se descuente al cobrar y no al comandar: una comanda se cancela, un cobro no. |
| Consumo estimado bajo | Consumo alto y con dos unidades base simultáneas (g y ml) en la misma cuenta | Un plato de arrachera consume gramos de carne y mililitros de aceite en la misma línea. |

**Tronco V6 común; esta variante añade merma de receta y costeo en cascada.**

### F-200 · Carrito · F-220 · Ticket

| En cafeteria | Aquí | Por qué la diferencia |
|---|---|---|
| **F-200** — el carrito vive segundos y se cobra | El carrito es una **cuenta abierta** que vive 90 minutos, crece en tandas y se comanda por partes | El carrito de mostrador es un buffer. Aquí es un objeto de negocio con estado propio, que sobrevive a que el mesero cierre la tablet. |
| **F-220** — un documento: el ticket | **Dos documentos**: la **precuenta** (propuesta, con código para caja, sin valor fiscal) y el **ticket** (comprobante de pago) | El comensal revisa antes de pagar. Confundirlos hace que el mesero entregue un "ticket" de algo que no se ha cobrado, y eso es exactamente por donde se escapa una cuenta. |

### F-011 · IVA · F-056 · Dashboard · F-050/051/052/054 · Registros

- **F-011** — IVA **extraído** (precio al público ya incluye impuesto), tasa 16%. En una
  ferretería el precio se muestra más IVA. Aquí no: el menú dice $189 y se cobran $189. Un menú
  con "+IVA" no existe en México en este giro.
- **F-056** — el dashboard se calcula **sobre la caja abierta**, no sobre el día natural. Si no
  hay caja abierta, todos los indicadores están en cero **a propósito**: el turno no ha empezado.
  En un retail el día natural es el corte lógico; aquí el turno lo es, porque la cena del viernes
  termina a la 1:20 del sábado.
- **F-050/051/052/054** — "más vendidos" cuenta líneas **y** cantidad real en g/ml/porciones,
  porque 40 platos de arrachera y 40 copas de vino no son comparables en piezas. "Ventas por
  empleado" se agrupa por **mesero**, no por cajero: el cajero cobra todas las cuentas.

### F-027 · Modificadores · F-030 · Combos · F-109 · Merma · F-222 · Devolución · F-920 · Portal

- **F-027** — el modificador aquí **viaja a la comanda** ("sin cebolla", "término medio") y puede
  o no cambiar el precio. En retail el modificador es una variante de SKU. Aquí es una
  instrucción a una persona.
- **F-030** — el combo del restaurante es la **comida corrida**: sopa + guisado + agua a precio
  fijo, donde el comensal elige dentro de cada tiempo. No es un paquete cerrado.
- **F-109** — merma de **cocina** (se quemó, se cayó, se cortó mal) frente a merma de **almacén**
  (se echó a perder). Dos motivos distintos porque señalan a dos responsables distintos.
- **F-222** — devolución aquí es casi siempre **reposición de platillo**, no dinero de vuelta:
  sale otro plato y el consumo se duplica. Es un caso de inventario, no de caja.
- **F-920/F-921** — portal V1: menú, pedido en mesa, pedir cuenta, pedir atención, valorar. Tres
  tipos de solicitud literales: `ordenar`, `cuenta`, `ayuda`.

---

## 4 · LAS `[+]` · exclusivas de este arquetipo

```
F-300 · F-301 · F-302 · F-303   Salón y mesas
      Ningún modelo fuera de A2 y A7 tiene un recurso físico con estado
      que se ocupa y se libera varias veces al día. En A7 (hotel, cancha)
      el recurso se RESERVA por adelantado; aquí se toma en el momento.
      Son dos módulos distintos y no se comparten.

F-310 … F-319   Preparación y comandas
      Exclusiva de A2 y de los A1 que compraron preparación (comida
      rápida, taquería, juguería). La razón es una sola: aquí hay un
      hueco de 8 a 20 minutos entre que se pide y que existe el producto,
      y ese hueco necesita una pantalla propia y una persona distinta.

F-320 · F-321 · F-322   Cuenta abierta, dividir cuenta, precuenta
      Nacen de E1.2. Un mostrador no tiene nada que dividir porque nunca
      hubo una cuenta que creciera.

F-128 · F-129 · F-130 · F-132   Receta, explosión, costeo, insumo base
      Exclusivas de los giros que transforman: restaurante, cafetería,
      bar, panadería, juguería. Una ferretería jamás consume doce
      insumos para producir una unidad vendible.

F-131   Producto por peso variable
      El corte de 380 g que se pesa frente al comensal. También lo usan
      bufet por peso y tortillería, pero por E2.5, no por A2.
```

---

## 5 · LO QUE FALTA · pendientes de este modelo

El modelo está construido y operando. **No está completo.** Esto es lo que le falta, con lo que
cuesta cada hueco medido en operación real, no en código.

| ID | Función | Qué duele hoy sin ella |
|---|---|---|
| **F-321** | Dividir cuenta | La mesa de 8 personas pide cuentas separadas y el cajero las calcula a mano en el teléfono. Tarda de 5 a 12 minutos, con gente esperando mesa detrás, y es donde más descuadres nacen. Es el hueco **más caro** de los ocho. |
| **F-302** | Unir y separar mesas | Llegan 10 personas, se juntan las mesas 4 y 5 físicamente y el sistema sigue viendo dos cuentas. El mesero comanda partido y la cuenta sale partida. Hoy se resuelve pasando todo a una mesa a mano. |
| **F-303** | Cambiar de mesa | "Nos pasamos a la terraza" es una frase de todos los días. Hoy implica cerrar y reabrir, y la comanda ya enviada apunta a la mesa vieja: cocina saca el plato a un lugar vacío. |
| **F-315** | Tiempos por platillo | Cocina ve *hace 12 minutos* en texto relativo, sin umbral ni color. No hay forma de saber si 12 minutos es normal para ese platillo o es un desastre. Sin esto no se puede prometer un tiempo al comensal. |
| **F-318** | Impresión de comanda | Cocinas con vapor, grasa y calor donde una pantalla no sobrevive, o donde la parrilla está a cuatro metros del monitor. Hoy la única salida es pantalla. Es la objeción número uno en la demostración a cocinas tradicionales. |
| **F-306** | Lista de espera | El viernes a las 21:00 hay doce personas esperando y el control es un papelito. Nadie sabe a quién le toca y el sistema no puede decir cuánto falta. |
| **F-305** | Tiempo de ocupación | El dueño no puede contestar "¿cuánto tarda una mesa en mi restaurante?", que es el número del que depende su rotación, que es de lo que depende su negocio. |
| **F-242** | Propina repartida por puntos | Cocina y lavaloza no reciben nada del reparto actual. En cuanto el restaurante pasa de quince empleados, la propina sólo para meseros genera rotación de personal en cocina. |

---

## 6 · FUNCIONES QUE FALTAN EN EL CATÁLOGO

**Esto se añade a `03-CATALOGO-DE-FUNCIONES.md` antes de construir nada.** Son funciones reales
de este giro que hoy no tienen ID canónico, y sin ID se van a reinventar con otro nombre en
`bar-cantina` y en `pizzeria`.

| ID propuesto | Función | Bloque | Por qué hace falta |
|---|---|---|---|
| **F-323** | **Marcha por tiempos** (primer tiempo, segundo tiempo, postre) | F-3xx | Es la operación normal del servicio de mesa en México: se comandan las entradas, se retienen los fuertes y se "marchan" cuando el mesero ve que la mesa va terminando. Hoy el sistema envía todo de golpe y el fuerte se enfría en la barra. No lo cubre F-310 (enviar) ni F-314 (estados): es **retener y liberar**, que es otra cosa. |
| **F-324** | **Anulación de línea ya comandada, con motivo y reversa de consumo** | F-3xx | F-221 cancela la venta entera y F-202 descuenta la línea, pero ninguna resuelve "el plato salió mal, se repone, y el insumo se consumió dos veces". Necesita motivo obligatorio (error de cocina / error de mesero / cortesía) porque cada motivo apunta a un responsable y a una cuenta distinta. |
| **F-325** | **Relevo de responsable con unidades abiertas** | F-3xx | A las 17:00 el mesero de mediodía se va con mesas vivas. Hoy o se cierra la mesa antes de tiempo o la propina de la noche se le acredita a quien ya se fue. Es distinto de F-304 (asignar) porque implica **partir la atribución de propina en el tiempo**. |
| **F-326** | **Consumo de empleados y cortesías** | F-2xx | La comida del personal y las cortesías al cliente frecuente salen del inventario todos los días y hoy o se registran como merma (y ensucian la merma) o no se registran (y aparecen como faltante). Necesita salir del stock sin entrar a ventas. |
| **F-247** | **Propina delegada al comensal (portal)** | F-2xx | Ya está construida —`propina_tipo: 'pendiente_cliente'`, `propina_origen: 'pendiente_portal_qr'`— y no tiene ID. Sin ID, el día que `bar-cantina` la necesite se va a construir otra vez. |
| **F-327** | **Bloqueo de cierre por unidades abiertas** | F-2xx | Ya está construida (`obtenerMesasPendientesCierre` + diálogo) y no tiene ID. Es una regla de integridad de negocio, no un detalle de pantalla, y aplica a todo A2 y A7. |

---

## 7 · DEPENDENCIAS

Qué no se puede construir sin qué. Las flechas se leen "necesita".

```
F-321 Dividir cuenta
  → F-320 Cuenta abierta            (ya existe)
  → F-322 Precuenta                 (ya existe: hay que emitir N precuentas)
  → F-245 Desglose exacto           (ya existe: cada parte lleva su propina)
  → F-324 Anulación de línea        (NUEVA: mover una línea es quitarla de un lado)
  → F-223 Folio consecutivo         (ya existe: N folios de una misma mesa)

F-302 Unir y separar mesas
  → F-301 Unidades con estado       (ya existe)
  → F-320 Cuenta abierta            (ya existe)
  → F-303 Cambiar de mesa           (comparten el mismo movimiento de líneas)
  → F-321 Dividir cuenta            (separar ES dividir con destino mesa)

F-303 Cambiar de mesa
  → F-301 Unidades con estado
  → F-310 Enviar a preparación      (la comanda viva tiene que reapuntar)

F-315 Tiempos por platillo
  → F-314 Estados de comanda        (ya existe: hay que sellar cada transición)
  → F-020 Catálogo                  (ya existe: `minutos_preparacion` ya es campo)
  → F-323 Marcha por tiempos        (NUEVA: el reloj arranca al marchar, no al comandar)

F-318 Impresión de comanda
  → F-312 Ruteo a estación          (ya existe: cada impresora es una estación)
  → F-985 Impresora térmica         (ya existe)
  → F-314 Estados                   (la impresión no sustituye el estado, lo acompaña)

F-306 Lista de espera
  → F-301 Unidades con estado       (para saber qué se va a liberar)
  → F-305 Tiempo de ocupación       (sin esto no se puede estimar la espera)

F-305 Tiempo de ocupación
  → F-301 Unidades con estado       (sellos de tiempo en cada transición)

F-242 Propina por puntos
  → F-240 Propinas                  (ya existe)
  → F-246 Liquidación por periodo   (ya existe)
  → F-003 Roles                     (el puntaje se asigna por puesto)
  → F-325 Relevo de responsable     (NUEVA: si no, el turno partido reparte mal)
```

---

## 8 · ORDEN DE CONSTRUCCIÓN

Derivado de las dependencias de §7 y del costo operativo de §5. No es el orden fácil: es el orden
que devuelve dinero antes.

```
TANDA 1 · lo que se paga solo
  1.  F-324  Anulación de línea comandada con motivo     (NUEVA · desbloquea 321)
  2.  F-321  Dividir cuenta                              (el hueco más caro)
  3.  F-303  Cambiar de mesa                             (comparte movimiento de líneas con 321)
  4.  F-302  Unir y separar mesas                        (cae casi gratis después de 321+303)

TANDA 2 · lo que se ve en la demostración
  5.  F-318  Impresión de comanda                        (objeción nº 1 de cocinas tradicionales)
  6.  F-305  Tiempo de ocupación                         (sellos de tiempo; base de 306 y 315)
  7.  F-315  Tiempos por platillo                        (necesita 305 y 323)
  8.  F-323  Marcha por tiempos                          (NUEVA · se construye junto con 315)

TANDA 3 · lo que pide el restaurante grande
  9.  F-306  Lista de espera                             (necesita 305)
  10. F-325  Relevo de responsable                       (NUEVA · desbloquea 242)
  11. F-242  Propina repartida por puntos                (necesita 325)
  12. F-326  Consumo de empleados y cortesías            (NUEVA · limpia la merma)

TANDA 4 · deuda de fondo
  13. F-133  Rendimiento real contra teórico             (cierra el dolor 1)
  14. F-106  Toma de inventario físico                   (alimenta a 133)
  15. F-103  Kardex por artículo                         (auditoría del ledger)
  16. F-017  Diccionario de vocabulario                  (habilita los otros 77 modelos)
```

**Por qué F-324 va primera aunque nadie la pidió:** dividir cuenta, cambiar de mesa y unir mesas
son la misma operación —mover una línea de una cuenta a otra— y las tres necesitan poder quitar
una línea que **ya se comandó** sin romper el consumo ni la comanda de cocina. Construir F-321
sin F-324 obliga a escribirla dos veces.
