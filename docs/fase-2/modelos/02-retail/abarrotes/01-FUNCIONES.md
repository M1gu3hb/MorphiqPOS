# 01 · FUNCIONES · Abarrotes / tienda de conveniencia

IDs canónicos de `03-CATALOGO-DE-FUNCIONES.md`. **Nunca se inventa un ID aquí**: lo que falta se
declara en §6 para añadirlo al catálogo antes de construir nada.

```
[=]  idéntica al tronco     [≠]  variante      [+]  exclusiva
[⚙]  construida y operando  [◐]  parcial       [ ]  pendiente
```

**Advertencia de lectura.** Este modelo es el **origen del arquetipo A1**, igual que `restaurante`
lo es de A2. Cuando aquí una función va marcada `[=] ← reutiliza de: restaurante`, quiere decir que
ya está construida y **no se toca**. Cuando va marcada `[=]` sin origen, quiere decir que **nace
aquí** y de aquí la heredan los otros dieciocho modelos de retail. Las tablas de tres columnas de
las `[≠]` comparan contra **`restaurante`**, que es el único modelo terminado con el que existe
comparación real, y contra `cafeteria` cuando el contraste está en el mostrador y no en la mesa.

---

## 1 · ÁRBOL COMPLETO

```
ABARROTES / TIENDA DE CONVENIENCIA        A1 puro · inventario V2+V3
│
├── NÚCLEO · identidad y acceso
│   ├── F-001 Tarjetas de empleado ............................... [=] [⚙] ← restaurante
│   ├── F-002 PIN de 4 dígitos, Argon2id en servidor ............. [=] [⚙] ← restaurante
│   ├── F-003 Roles y permisos ................................... [=] [⚙] ← restaurante
│   │         Tres roles vivos aquí: dueño, encargado, cajero.
│   │         Mesero, cocina y barra se apagan en esta plantilla.
│   ├── F-004 Sesión revocable con caducidad ..................... [=] [⚙] ← restaurante
│   ├── F-005 Bloqueo por intentos fallidos ...................... [=] [⚙] ← restaurante
│   ├── F-006 Bitácora de acceso y auditoría ..................... [=] [⚙] ← restaurante
│   └── F-007 Permisos finos por módulo .......................... [=] [ ]
│             Aquí pesa más que en restaurante: el permiso que de
│             verdad importa es `hacer_descuentos` y `fiar`.
│
├── NÚCLEO · configuración
│   ├── F-010 Identidad del negocio .............................. [=] [⚙] ← restaurante
│   ├── F-011 Impuestos: IVA MIXTO 0%/16% + IEPS ................. [≠] [◐]  ← §3.1
│   ├── F-012 Sucursales ......................................... [=] [⚙] ← restaurante
│   ├── F-013 Terminales ......................................... [=] [⚙] ← restaurante
│   ├── F-014 Apariencia y tema .................................. [=] [⚙] ← restaurante
│   ├── F-015 Plantilla de negocio ............................... [+] [ ]
│   │         Renombre `esencial` → `tienda` + las cinco funciones
│   │         que D-01 exige para que el nombre sea honesto.
│   ├── F-016 Perillas por módulo ................................ [≠] [◐]
│   │         Aquí las perillas que importan: fiado sí/no, granel
│   │         sí/no, comisiones sí/no, casco sí/no.
│   └── F-017 Diccionario de vocabulario del giro ................ [+] [ ]
│
├── NÚCLEO · catálogo
│   ├── F-020 Catálogo de productos y servicios .................. [≠] [⚙]  ← §3.2
│   ├── F-021 Categorías ......................................... [=] [⚙] ← restaurante
│   ├── F-022 Precio único ....................................... [=] [⚙] ← restaurante
│   ├── F-023 Listas de precio (público, mayoreo) ................ [=] [◐]
│   │         La BD ya trae `precio_mayoreo_centavos` y
│   │         `cantidad_minima_mayoreo`; no está en el puente.
│   ├── F-025 Precio por volumen escalonado ...................... [=] [ ]
│   │         "3 x $25" es la promoción normal del giro.
│   ├── F-028 Imágenes de producto ............................... [=] [⚙] ← restaurante
│   │         Existe y se usa poco: el tendero no sube fotos de
│   │         1,800 productos. No es la vía de búsqueda aquí.
│   ├── F-029 Códigos de barras .................................. [≠] [◐]  ← §3.3
│   ├── F-030 Paquetes y combos .................................. [≠] [ ]
│   ├── F-031 Productos compuestos (kits) ........................ [=] [ ]
│   │         La "despensa" armada de fin de mes. Poco frecuente.
│   ├── F-032 Importación masiva por Excel ....................... [=] [⚙] ← restaurante
│   │         Aquí es función de VIDA O MUERTE: sin ella no hay alta.
│   └── F-058 Impresión de etiquetas de anaquel y código ......... [+] [ ]  ← NUEVA §6
│
├── CLIENTES
│   ├── F-040 Clientes: ficha básica ............................. [=] [◐]
│   │         Tabla `clientes` existe; NO está en el puente.
│   ├── F-041 Historial de compra del cliente .................... [=] [ ]
│   ├── F-042 Datos fiscales (RFC, régimen, CP) .................. [=] [ ]
│   └── F-044 Notas del cliente .................................. [=] [ ]
│             "Le fío hasta $500. Paga los martes."
│
├── INVENTARIO · TRONCO COMÚN  (nace aquí para los 18 de retail)
│   ├── F-100 Existencia actual por almacén ...................... [=] [⚙] ← restaurante
│   ├── F-101 Ledger inmutable de movimientos .................... [=] [⚙] ← restaurante
│   ├── F-102 Decremento atómico al cobrar ....................... [=] [⚙] ← restaurante
│   ├── F-103 Kardex / historial por artículo .................... [=] [ ]
│   ├── F-104 Ajuste manual con motivo obligatorio ............... [=] [⚙] ← restaurante
│   ├── F-105 Traspaso entre almacenes o sucursales .............. [=] [ ]
│   │         Aquí es "del almacén de atrás al anaquel". Diario.
│   ├── F-106 Toma de inventario físico y diferencias ............ [=] [ ]  ← DOLOR 1
│   ├── F-107 Alertas de mínimo .................................. [=] [⚙] ← restaurante
│   ├── F-108 Valuación (costo promedio ponderado) ............... [=] [⚙] ← restaurante
│   └── F-109 Merma con motivo ................................... [≠] [ ]  ← §3.6
│
├── INVENTARIO · VARIANTES V2 + V3
│   ├── F-111 V2 · Stock simple (pieza) .......................... [≠] [ ]  ← NACE AQUÍ
│   ├── F-112 V3 · Presentaciones (caja ↔ pieza) ................. [≠] [ ]  ← NACE AQUÍ §3.4
│   ├── F-120 Factor de conversión entre presentaciones .......... [+] [◐]
│   │         Existe sólo para COMPRAS (`unitConversions.js`),
│   │         no para venta ni para existencia.
│   ├── F-121 Venta en dos unidades .............................. [+] [ ]
│   ├── F-144 Venta a granel / por peso en mostrador ............. [≠] [◐]  ← §3.5
│   ├── F-146 Caducidad sin lote (fecha por entrada) ............. [+] [ ]  ← NUEVA §6
│   ├── F-147 Presentación con código de barras propio ........... [+] [ ]  ← NUEVA §6
│   ├── F-148 Código de barras con peso embebido (EAN-13 pref. 2) . [+] [ ]  ← NUEVA §6
│   └── F-149 Conteo cíclico por zona de anaquel ................. [+] [ ]  ← NUEVA §6
│
├── VENTA Y COBRO
│   ├── F-200 Carrito ............................................ [≠] [⚙]  ← §3.7
│   ├── F-201 Búsqueda rápida (código, nombre, tecla) ............ [≠] [◐]  ← §3.8
│   ├── F-202 Descuento por línea ................................ [=] [⚙] ← restaurante
│   ├── F-203 Descuento por total ................................ [=] [⚙] ← restaurante
│   ├── F-205 Autorización de descuento por supervisor ........... [=] [ ]
│   ├── F-210 Cobro en efectivo con cambio ....................... [=] [⚙] ← restaurante
│   ├── F-211 Cobro con tarjeta .................................. [=] [⚙] ← restaurante
│   ├── F-212 Cobro por transferencia ............................ [=] [⚙] ← restaurante
│   ├── F-213 Pago mixto ......................................... [=] [⚙] ← restaurante
│   ├── F-214 Vales y monedero ................................... [=] [ ]
│   │         Vales de despensa (Sí Vale, Edenred). Es MÉTODO DE
│   │         PAGO, no descuento. Frecuente a fin de quincena.
│   ├── F-220 Ticket ............................................. [≠] [⚙]  ← §3.9
│   ├── F-221 Cancelación con motivo ............................. [=] [⚙] ← restaurante
│   ├── F-222 Devolución total o parcial ......................... [≠] [◐]  ← §3.10
│   ├── F-223 Folio consecutivo por sucursal ..................... [=] [⚙] ← restaurante
│   ├── F-224 Venta en espera / suspendida ....................... [=] [ ]
│   │         "Ahorita vengo, se me olvidó la cartera." Real y diario.
│   ├── F-225 Reimpresión de ticket .............................. [=] [⚙] ← restaurante
│   ├── F-255 Venta por comisión (recargas, servicios) ........... [+] [ ]  ← NUEVA §6
│   ├── F-256 Depósito de envase retornable (casco) .............. [+] [ ]  ← NUEVA §6
│   └── F-257 Redondeo de cambio y su registro ................... [+] [ ]  ← NUEVA §6
│
├── CAJA
│   ├── F-230 Apertura con fondo ................................. [=] [⚙] ← restaurante
│   ├── F-231 Movimientos: entrada, retiro, gasto ................ [=] [⚙] ← restaurante
│   ├── F-232 Arqueo a ciegas .................................... [=] [⚙] ← restaurante
│   ├── F-233 Corte de turno ..................................... [=] [⚙] ← restaurante
│   ├── F-234 Corte diario y su PDF .............................. [≠] [⚙]  ← §3.11
│   ├── F-235 Varias cajas simultáneas ........................... [=] [ ]
│   │         APAGADA por omisión. Un mostrador, un cajón.
│   ├── F-236 Caja por terminal .................................. [=] [⚙] ← restaurante
│   └── F-254 Cobro de fiado en caja (entrada que NO es venta) ... [+] [ ]  ← NUEVA §6
│
├── PROPINAS
│   └── V1 · SIN PROPINAS ........................................ [—] [—]
│             Se apaga entera. Ni pantalla, ni campo, ni sección
│             del corte. Ver `02-DINERO-Y-CAJA.md` §4.
│
├── FIADO · crédito informal  (variante del bloque A5)
│   ├── F-610 Límite de crédito por cliente ...................... [≠] [ ]  ← §3.12
│   ├── F-611 Días de plazo ...................................... [≠] [ ]
│   ├── F-612 Estado de cuenta ................................... [≠] [ ]
│   ├── F-613 Antigüedad de saldos ............................... [=] [ ]
│   ├── F-614 Aplicación de pagos a facturas ..................... [≠] [ ]
│   ├── F-615 Pago parcial (abono) ............................... [=] [ ]
│   ├── F-616 Recordatorio de vencimiento ........................ [=] [ ]
│   └── F-617 Bloqueo por mora ................................... [≠] [ ]
│
├── COMPRAS Y GASTOS
│   ├── F-250 Gastos con categoría ............................... [=] [⚙] ← restaurante
│   ├── F-251 Plantillas de gasto fijo ........................... [=] [⚙] ← restaurante
│   ├── F-252 Comprobante adjunto al gasto ....................... [=] [ ]
│   ├── F-630 Orden de compra .................................... [≠] [ ]  ← §3.13
│   ├── F-631 Proveedores ........................................ [≠] [⚙]
│   ├── F-632 Recepción y entrada a inventario ................... [≠] [⚙]  ← §3.13
│   ├── F-633 Actualización de costo promedio .................... [=] [⚙] ← restaurante
│   ├── F-634 Plantillas de compra recurrente .................... [=] [⚙] ← restaurante
│   ├── F-635 Cuentas por pagar .................................. [=] [ ]
│   └── F-636 Comparativo de precios entre proveedores ........... [=] [ ]
│
├── REGISTROS Y DASHBOARD
│   ├── F-050 Ventas por periodo ................................. [≠] [⚙]
│   ├── F-051 Más vendidos ....................................... [≠] [⚙]
│   ├── F-052 Utilidad y margen .................................. [≠] [⚙]
│   ├── F-053 Cortes históricos .................................. [=] [⚙] ← restaurante
│   ├── F-054 Ventas por empleado ................................ [≠] [◐]
│   ├── F-055 Comparativo entre periodos ......................... [=] [ ]
│   ├── F-056 Dashboard .......................................... [≠] [◐]  ← §3.14
│   └── F-057 Exportación a Excel y PDF .......................... [=] [⚙] ← restaurante
│
├── FACTURACIÓN
│   ├── F-940 CFDI 4.0 ........................................... [=] [ ]
│   ├── F-941 Timbrado ante PAC .................................. [=] [ ]
│   ├── F-942 Factura global del día / del mes ................... [≠] [ ]  ← §3.15
│   ├── F-944 Cancelación con motivo SAT ......................... [=] [ ]
│   └── F-945 Envío automático por correo ........................ [=] [ ]
│
├── LEGAL Y TRANSVERSALES
│   ├── F-980 Restricción legal de venta (edad, horario) ......... [≠] [ ]  ← §3.16
│   ├── F-970 Multi-sucursal: catálogo compartido ................ [=] [ ]
│   ├── F-971 Inventario por sucursal ............................ [=] [⚙] ← restaurante
│   ├── F-972 Traspasos entre sucursales ......................... [=] [ ]
│   ├── F-973 Reportes consolidados .............................. [=] [ ]
│   └── F-974 Permisos por sucursal .............................. [=] [⚙] ← restaurante
│
└── HARDWARE
    ├── F-983 Báscula conectada .................................. [=] [ ]
    ├── F-984 Cajón de dinero .................................... [=] [ ]
    ├── F-985 Impresora térmica .................................. [=] [⚙] ← restaurante
    ├── F-986 Lector de código de barras ......................... [≠] [◐]  ← §3.3 EL PROTAGONISTA
    ├── F-987 Terminal bancaria integrada ........................ [=] [ ]
    └── F-988 Venta sin conexión con sincronización ............... [+] [ ]  ← NUEVA §6
```

---

## 2 · LAS `[=]` · lo que NO se vuelve a construir

Comparadas campo por campo contra su origen. Si hubiera una sola diferencia, estarían en §3.

```
F-001 · F-002 · F-003 · F-004 · F-005 · F-006   Identidad y acceso
      ← reutiliza de: restaurante · `packages/app/src/identidad/`
      Idénticas. Un PIN de cajero de abarrotes es el mismo objeto que
      un PIN de mesero: cuatro dígitos, Argon2id en servidor, bloqueo
      por intentos, sesión revocable, bitácora. Lo único que cambia es
      QUÉ roles existen, y eso es dato de la plantilla (F-015), no
      comportamiento de la función.
      NO SE VUELVE A CONSTRUIR.

F-210 · F-211 · F-212 · F-213   Cobro y métodos de pago
      ← reutiliza de: restaurante · `packages/app/src/venta/pagos.ts`
      Idénticas. Un solo comando con un arreglo de pagos. El cálculo
      del cambio, el bigint de centavos y el total en servidor se
      comportan igual en una tiendita que en un restaurante. Lo que
      cambia es CUÁNTAS veces al día se ejecuta, y eso es interfaz.
      NO SE VUELVE A CONSTRUIR.

F-230 · F-231 · F-232 · F-233 · F-236   Caja, movimientos y arqueo
      ← reutiliza de: restaurante · `packages/app/src/caja/`
      Idénticas, incluida la regla que no admite variante en ningún
      giro: el arqueo va a ciegas y el esperado lo calcula el servidor
      como fondo + entradas − salidas. Ver `04-SISTEMA-DE-DISENO.md` §5.
      NO SE VUELVE A CONSTRUIR.
      (Lo que sí cambia es QUÉ movimientos existen — aquí hay cobro de
       fiado y devolución de casco, que son F-254 y F-256, funciones
       nuevas, no variantes de F-231.)

F-100 · F-101 · F-102 · F-104 · F-107 · F-108   Tronco de inventario
      ← reutiliza de: restaurante · `packages/app/src/inventario/`
      Idénticas. El ledger `movimientos_stock` con el signo impuesto
      por `check` en la base, el decremento atómico dentro de la
      transacción de cobro, el ajuste con motivo obligatorio, la alerta
      de mínimo y el costo promedio ponderado son aritmética y reglas
      de integridad, no giro. Las diez variantes escriben en este mismo
      ledger.
      NO SE VUELVE A CONSTRUIR. Es el 60% del módulo.

F-631 · F-633 · F-634   Proveedores, costo promedio, plantillas de compra
      ← reutiliza de: restaurante · `packages/app/src/compras/costeo.ts`
      El promedio ponderado sobre stock anterior más entrante es la
      misma fórmula. (F-630 y F-632 SÍ cambian: ver §3.13.)
      NO SE VUELVE A CONSTRUIR.

F-202 · F-203 · F-221 · F-223 · F-225   Descuentos, cancelación, folio, reimpresión
      ← reutiliza de: restaurante
      Idénticas. Un descuento por línea es un descuento por línea.
      NO SE VUELVE A CONSTRUIR.

F-985   Impresora térmica
      ← reutiliza de: restaurante · `heredado/lib/pdfDownload.js` y el
      flujo de ticket. Misma impresora, mismo ancho, mismo driver.
      NO SE VUELVE A CONSTRUIR.
```

---

## 3 · LAS `[≠]` · mismo nombre, comportamiento distinto

### 3.1 · F-011 · Impuestos

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| **Una sola tasa, 16%, para todo el menú.** La plantilla arranca con todo al 16% porque marcar producto por producto es trabajo que el dueño no hará | **Tasa por producto, obligatoria, con tres valores reales: 0%, 16% y exento** | No es una preferencia: es la ley. El frijol, la leche, el pan, el huevo, la fruta, los dulces, las botanas y el alimento para mascotas de hogar son **tasa 0%** (LIVA art. 2-A). El refresco, el agua en envase menor a 10 L, la cerveza, los cigarros, el jabón, el papel higiénico y el cloro son **16%**. En la misma tienda, en el mismo ticket, en la misma bolsa. |
| Sin IEPS | **IEPS por producto, con tres formas de cálculo distintas** | Bebidas saborizadas con azúcar: **cuota de $3.0818 por litro** en 2026. Con edulcorantes: **$1.50 por litro**. Botanas y alimentos no básicos de ≥275 kcal/100 g: **8% ad valorem**. Energizantes: **25%**. Cigarros: ad valorem **200%** más cuota por pieza. Son tres mecánicas distintas —cuota por litro, porcentaje, cuota por pieza— y el precio de anaquel ya las trae dentro. |
| IVA **extraído**: el menú dice $189 y se cobran $189 | IVA **extraído también**, pero extraído **por línea con la tasa de esa línea**, y sumado al final | Aquí no se puede hacer `total − round(total/1.16)` porque el total mezcla tasas. Se calcula por línea, se redondea **una sola vez al final del bloque de cada tasa**, y se suma. Si se redondea por línea, un ticket de 14 artículos descuadra por centavos y el tendero pierde la confianza en todo. |

**Consecuencia de producto, y es la más importante de esta sección:** el catálogo tiene que traer
la tasa **precargada por categoría** en la importación masiva. Pedirle a Don Chuy que marque 1,800
productos uno por uno es garantizar que todo quede al 16% y que la declaración salga mal.

**Se construye el tronco de impuestos de nuevo (hoy es tasa única) + esta variante.**

### 3.2 · F-020 · Catálogo de productos

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| 60 a 150 productos, capturados una vez a mano, con foto, descripción y receta | **800 a 2,500 SKU**, que llegan de un archivo, sin foto, sin descripción, y que crecen cada semana con lo que trae el preventista | El alta manual es viable con 120 platillos y es imposible con 1,800 abarrotes. **La importación masiva (F-032) deja de ser una comodidad y pasa a ser el requisito de entrada.** |
| El producto se busca por **nombre** en una cuadrícula con imagen | El producto se encuentra por **código de barras**, y el nombre es el camino de excepción | Un platillo se llama "Arrachera". Un producto de abarrotes se llama "Coca-Cola Sin Azúcar 600 ml PET retornable". Nadie teclea eso con fila. |
| Un producto, un precio, una unidad | Un producto, **N presentaciones**, cada una con su código, su precio y su factor | Ver §3.4. |
| Sin campo de caducidad | Fecha de caducidad en la **entrada**, no en el producto | Ver F-146 en §6. |

**Se construye sobre el catálogo existente** (`packages/app/src/catalogo/`, que ya trae
`codigo_barras`, `costo_unitario_centavos`, `stock_minimo`, `unidad_venta` y `tipo_venta`)
**+ presentaciones + tasa por producto + carga masiva con plantilla del giro.**

### 3.3 · F-029 · Códigos de barras · F-986 · Lector

**Ésta es la función que define el modelo. Si sale mal, no hay producto.**

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| **Apagada a propósito**: `MODULOS_EXCLUIDOS_DE_PRO = ['escaner_codigo_barras']`. Un platillo no tiene código de barras | **Encendida y es la acción principal de la pantalla de inicio.** Entre 60% y 90% de las líneas de venta entran por aquí | El restaurante fabrica lo que vende; la tienda revende lo que otro empaquetó y codificó. El código ya existe impreso en el producto: no usarlo es teclear a mano un dato que está ahí. |
| Escáner de **cámara**: `BarcodeScanner.jsx` con `BarcodeDetector` nativo, fallback a ZXing, 3 lecturas estables y *cooldown* de 1500 ms | **Lector USB tipo teclado (keyboard wedge)** como camino principal. La cámara es el camino de respaldo, no el principal | Un lector USB de $350 a $1,800 lee en 80 ms y no falla con el reflejo del plástico ni con la luz del foco. La cámara de una laptop de 2019 apuntando a una bolsa arrugada de Sabritas tarda segundos. **El *cooldown* de 1500 ms del componente actual es correcto para cámara y es inaceptable aquí:** hace imposible pasar seis refrescos iguales seguidos. |
| Un producto, un código | **Un producto, N códigos**: la pieza, el six, la caja. Cada empaque trae su propio EAN impreso de fábrica | Ver F-147 en §6. Si el sistema sólo admite un código, el tendero escanea la caja y el sistema no la reconoce, y ahí se acaba la confianza. |
| Sin peso embebido | **Códigos EAN-13 con prefijo 2x** que traen peso o importe dentro, generados por la báscula de mostrador | Ver F-148 en §6. |
| Producto no encontrado → `toast.error` y ya | Producto no encontrado → **diálogo de alta rápida en el acto**, con el código ya puesto, tres campos y Enter | En hora pico, "no está en el catálogo" es una venta perdida o una venta sin registrar. El alta rápida convierte el hueco en alta de catálogo. Es cómo se completa el catálogo sin sentarse a capturar. |

**Lo que hay que construir sobre lo que existe:**

1. **Un capturador de teclado a nivel de pantalla, no un input.** El lector USB teclea la ristra a
   una velocidad que ningún humano alcanza. La distinción es por **tiempo entre teclas**: si llegan
   ≥8 caracteres con menos de ~35 ms entre ellos y terminan en `Enter`, es el lector. Si no, es una
   persona. Esto **NO EXISTE hoy** — hoy sólo funciona porque el lector escribe dentro del input
   manual del componente de cámara y manda `Enter`.
2. **Foco imperdible.** El capturador escucha en `document`, no en un campo, y funciona aunque el
   usuario haya hecho clic en otro lado. Perder el foco en hora pico es perder la venta.
3. **Sin *cooldown* entre códigos distintos, y sin *cooldown* entre repeticiones del mismo.** Seis
   refrescos iguales son seis beeps seguidos y `×6` en la línea, no un producto ignorado cinco veces.
4. **Reutilizar `normalizeBarcode`, `isLikelyValidBarcode` y `compareBarcodes`** de
   `heredado/utils/barcodeUtils.js`, que ya están escritos y probados.

**Se construye el tronco del lector-teclado UNA VEZ aquí, y lo heredan los 18.**

### 3.4 · F-112 · Inventario V3 · presentaciones

Ésta es la variante que da nombre al bloque y la que hereda `ferreteria`, `farmacia`, `vinateria`,
`agroveterinaria` y `tienda-mascotas`.

| En restaurante (V6) | Aquí (V3) | Por qué la diferencia |
|---|---|---|
| Insumos en **gramos y mililitros**; la receta explota al cobrar y consume doce insumos | **Piezas y empaques**; al cobrar se descuenta el producto mismo, convertido a la **unidad base** | La cafetería mezcla y el restaurante transforma. **La tienda no transforma nada.** Una ferretería jamás consume doce insumos para producir una unidad vendible, y una tiendita tampoco. Encender recetas aquí es obligar a capturar 1,800 recetas de un ingrediente cada una. |
| Una sola unidad por insumo | **Unidad base + N presentaciones con factor** | Se compra la caja de 24 y se vende de a una. La existencia tiene que poder decir *"58 piezas = 2 cajas y 10 piezas"* o el tendero no la va a creer, porque así es como él la ve en el anaquel. |
| El costo se calcula por gramo | El costo se calcula **por unidad base** y el precio se fija **por presentación** | El precio de la caja no es 24 veces el de la pieza: es menos. Eso es F-023/F-025, y se apoya en el factor. |
| Sin caducidad | **Caducidad en la entrada, sin trazabilidad de lote** | F-146. La tiendita no tiene lote: tiene "ese que llegó el jueves y se vence en marzo". V4 completo es de farmacia. |

**Se construye el tronco de presentaciones una vez + esta variante.**
`ferreteria` hereda esto tal cual y le añade sólo F-145 (corte de material).

### 3.5 · F-144 · Venta a granel

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| **F-131 producto por peso variable**: el corte de 380 g se pesa en cocina y se teclea en la comanda. Ocurre una decena de veces al día | **Granel de mostrador**: frijol, arroz, azúcar, chiles secos, detergente en polvo, jamón. La báscula está **en el mostrador**, frente al cliente, y ocurre 20 a 50 veces al día | En el restaurante el peso es un atributo de un platillo. Aquí el peso **es** el producto: no existe "una unidad de frijol". |
| El precio por unidad variable ya existe en la BD (`precio_por_unidad_variable_centavos`) | Lo mismo, **más** la lectura directa de la báscula (F-983) y el código de peso embebido (F-148) | Teclear 0.847 kg con fila es lento y es donde se cometen los errores de dedo que descuadran el inventario. |
| Sin tara | **Con tara**: el recipiente del cliente se descuenta | Profeco lo exige y el cliente lo pide. Un sistema que no resta la tara le está cobrando de más al vecino, y el vecino se va. |

**Existe parcialmente:** `tipo_venta='variable_medida'`, `unidad_variable`,
`cantidad_minima/maxima/incremento_variable` y el diálogo `CantidadVariableDialog.jsx`, ya usado
desde `POS.jsx`. **Falta la báscula y el código de peso.**

### 3.6 · F-109 · Merma

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Dos motivos: merma de **cocina** (se quemó, se cayó) y merma de **almacén** (se echó a perder) | **Cinco motivos**, y cada uno apunta a un responsable distinto: caducado · dañado en anaquel · roto en traslado · robo detectado · error de captura | En cocina la merma es de proceso. Aquí es de custodia, y por eso la etiqueta importa: agrupar "caducado" con "robo detectado" hace inútil el indicador que sirve para el dolor 1. |
| No hay devolución al proveedor | **Canje al proveedor** como salida propia | El pan viejo se lo lleva Bimbo. Si eso se registra como merma, el indicador de merma miente y el costo del pan sale mal. Es salida de stock **sin pérdida económica**. |

### 3.7 · F-200 · Carrito

| En cafeteria | Aquí | Por qué la diferencia |
|---|---|---|
| El carrito vive segundos, se arma con la cuadrícula de productos y se cobra | El carrito vive **diez a cuarenta segundos** y se arma **sólo con el lector**. La cuadrícula existe pero es el camino de excepción (granel, producto sin código, cigarro suelto) | Una cafetería tiene 40 productos y caben en pantalla. Una tienda tiene 1,800 y no caben. |
| 3 a 6 líneas | **1 a 25 líneas**, con repeticiones frecuentes del mismo SKU | Por eso la línea repetida **se agrupa y se incrementa** en vez de apilarse. Seis renglones de "Coca 600" hacen ilegible el ticket y esconden el error. |
| Sin bloqueo | **Puede traer líneas bloqueadas**: cerveza fuera de horario, cigarro a menor de edad | F-980. El bloqueo es por línea, no por ticket: el resto de la compra sí se cobra. |

### 3.8 · F-201 · Búsqueda rápida

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Se busca por nombre en una cuadrícula con imágenes, con el dedo, en tablet | **Cuatro caminos, en este orden**: (1) código escaneado, (2) código tecleado, (3) nombre o marca en el mismo campo, (4) teclas rápidas F1–F8 para los ocho de siempre | El 80% de las líneas de una tiendita son **treinta productos**. Refresco, cigarro suelto, pan, leche. Ésos merecen una tecla, no una búsqueda. |
| Sin atajos de teclado | **Atajos reales**, ver `04-INTERFAZ.md` §4.3 | En `restaurante` NO EXISTE un solo atajo: el repositorio no tiene ningún `F1/F2/F12`. Aquí es el modo normal de operación. |
| Búsqueda contra el servidor | **Índice en memoria del cliente**, cargado al abrir sesión, con código exacto en O(1) | 1,800 productos caben en memoria de sobra. Un viaje al servidor por cada escaneo es lo que hace lentos a los competidores. El servidor sigue siendo el que cotiza y cobra (regla de Fase 1); el índice es sólo para **encontrar**. |

### 3.9 · F-220 · Ticket

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| **Dos documentos**: precuenta (propuesta) y ticket (comprobante) | **Uno solo**: el ticket. No hay nada que revisar antes de pagar | La cuenta nunca creció: el cliente vio el total en la pantalla mientras se escaneaba. |
| Lleva mesa, mesero y hora de apertura | Lleva **ahorro del día** si hubo promoción, **saldo de fiado** si el cliente tiene cuenta, y **depósito de casco** desglosado si hubo | Cada una de las tres contesta una pregunta que el cliente de tiendita hace en voz alta en el mostrador. |
| Se imprime siempre | **No siempre se imprime.** En tickets de $20 el cliente no lo quiere y el rollo cuesta | Perilla: imprimir siempre / preguntar / sólo arriba de $N. El rollo térmico es un costo real y visible para este dueño. |

### 3.10 · F-222 · Devolución

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Casi siempre es **reposición de platillo**: sale otro plato y el consumo se duplica. Es un caso de inventario, no de caja | Casi siempre es **cambio de producto** (el refresco venía caliente, la leche estaba cortada) y a veces es **dinero de vuelta** | El producto devuelto **vuelve al anaquel vendible** o se va a merma, y hay que decidir cuál. En restaurante el platillo devuelto nunca vuelve al inventario. |
| Sin envase | Puede ser **sólo la devolución del casco**, sin producto de por medio | F-256. Alguien llega con seis cascos vacíos y quiere sus $42. No es una devolución de venta: es una salida de caja contra un pasivo. |

### 3.11 · F-234 · Corte diario y su PDF

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Contesta: **¿cuadró la caja y cuánto le toca a cada mesero de propina?** | Contesta: **¿cuadró la caja y qué producto falta contra lo que debería haber?** | Es literalmente la pregunta de `04-SISTEMA-DE-DISENO.md` §5 para este giro. |
| Lleva tabla de **propinas por mesero** | **No lleva propinas. Ni en cero.** Lleva **faltantes por producto** | Una sección "Propinas: $0.00" en una tiendita hace dudar de todo el documento. Regla 4 del corte. |
| Lleva **insumos consumidos** según receta | Lleva **movimiento de existencia por producto**: inicial, vendido, entradas, merma, esperado, contado, diferencia | Aquí no hay receta que explotar: el producto vendido **es** el producto que salió. Eso hace el cálculo más simple y el faltante más acusador. |
| Sin cartera | Lleva **fiado otorgado hoy, cobrado hoy y saldo total** | El fiado es dinero que salió de la tienda en forma de producto. Si no está en el corte, el dueño no lo ve hasta que es tarde. |
| Sin comisiones de terceros | Lleva **dinero en tránsito**: recargas y servicios cobrados, y la comisión ganada, en su propio bloque | Es la sección que evita que el cajón parezca que sobra $4,800 cuando ese dinero es del que paga la luz. |

Ver el documento completo, sección por sección, en `02-DINERO-Y-CAJA.md` §9.

### 3.12 · F-610…F-617 · Fiado

| En el bloque A5 (mayorista) | Aquí | Por qué la diferencia |
|---|---|---|
| Crédito formal: límite aprobado, días de plazo, factura, estado de cuenta, antigüedad de saldos | **Fiado de libreta**: un límite en la cabeza del dueño, sin plazo escrito, sin factura, con abonos de $50 | No es lo mismo un cliente con línea de crédito de $80,000 a 30 días que doña Meche debiendo $340 desde hace tres semanas. Modelarlos igual produce un formulario que Don Chuy no va a llenar nunca. |
| El bloqueo por mora es automático y duro | El bloqueo es **un aviso, no un muro** | Don Chuy decide fiar o no fiar. Si el sistema le prohíbe fiarle a su comadre, apaga el módulo. La decisión es suya; lo que el sistema aporta es **el dato en el momento correcto**. |
| Se aplican pagos a facturas | Los abonos se aplican **al saldo, más viejo primero**, sin documento de por medio | No hay facturas que aplicar. |

**Se construye el tronco de cuenta por cobrar una vez + esta variante ligera.**
`fonda-cocina-economica` hereda exactamente esta variante, no la de mayorista.

### 3.13 · F-630 · F-632 · Compras

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Se compra a 4–8 proveedores, semanalmente, y la recepción se captura sentado | **Doce proveedores con doce ritmos**: Bimbo a diario, Coca con día fijo de preventa, Sabritas semanal, central de abasto quincenal, mayorista los martes | El proveedor necesita **día de visita** y **frecuencia** como campos, porque el sistema tiene que saber que hoy toca Coca y prepararle la lista antes de que llegue. |
| Entrada por compra | Entrada por compra **con devolución en la misma nota** | La nota de Bimbo es `+18 piezas frescas, −6 piezas de canje`. Dos movimientos, un documento. Si se capturan por separado, uno de los dos se olvida. |
| Sin crédito de proveedor | **Crédito de proveedor**: marcas de ruta a 8–15 días, mayoristas a 15–30, Coca-Cola FEMSA digital a 8/15/30 | Es la otra mitad del flujo de efectivo del negocio y hoy no existe (F-635). Don Chuy paga de contado en central de abasto y a crédito en ruta, y no sabe cuánto debe en total. |
| Sin sugerencia | **Sugerencia de pedido por proveedor**, calculada sobre venta de 14 días y existencia | Es el dolor 3 completo y la función que paga la renta del sistema. |

### 3.14 · F-056 · Dashboard

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Se calcula **sobre la caja abierta**, porque la cena del viernes termina a la 1:20 del sábado | Se calcula **sobre el día natural**, y el corte lógico coincide | La tienda abre a las 7 y cierra a las 22:30. El día es el día. |
| Lo lee el encargado en la PC de caja | Lo lee **el dueño en el teléfono**, dos veces al día: antes de abrir y después de cerrar | Eso cambia todo el layout: el dashboard de este modelo se diseña primero para 390 px. |
| Ocho indicadores centrados en el turno | **Siete indicadores centrados en la compra y en el faltante** | Ver `04-INTERFAZ.md` §4.4. |

### 3.15 · F-942 · Factura global

| En el tronco | Aquí | Por qué la diferencia |
|---|---|---|
| Factura global **del día** | Factura global **del mes**, que es lo que exige RESICO | RESICO persona física, límite de $3.5 M anuales, ISR de 1% a 2.5% sobre ingresos cobrados. La global es mensual. Y desde 2026 el plazo de emisión bajó de 72 a **24 horas**. |
| Todo al mismo régimen | Con **desglose por tasa**: 0%, 16% y los IEPS | Una global de tiendita que mete todo al 16% está mal timbrada desde el primer mes. |

### 3.16 · F-980 · Restricción legal de venta

| En vinateria (vecino) | Aquí | Por qué la diferencia |
|---|---|---|
| Todo el catálogo está restringido por horario | **Sólo dos categorías** de ~1,800 SKU: alcohol (horario municipal) y tabaco (edad) | Bloquear el ticket entero sería absurdo: el 97% de lo que se vende no está restringido. **El bloqueo es por línea y el resto se cobra normal.** |
| El horario es el eje del negocio | El horario es una perilla de configuración por día de la semana, porque **cada municipio es distinto** | No hay una regla nacional. La configura el dueño, y el sistema le recuerda que él es el responsable. |

---

## 4 · LAS `[+]` · exclusivas o que nacen aquí

```
F-112 · F-120 · F-121   Presentaciones, factor y venta en dos unidades
      Nacen aquí y las heredan ferretería, farmacia, vinatería,
      agroveterinaria, tienda de mascotas y materiales. Ningún modelo
      de servicio ni de A2 las necesita: un platillo no viene en caja
      de 24.

F-147   Presentación con código de barras propio
      Exclusiva de los giros donde el fabricante imprime un EAN distinto
      en cada empaque. Es retail de producto de marca: abarrotes,
      farmacia, vinatería, vapes. En ferretería la mitad de los
      productos no trae código, así que ahí convive con el SKU interno.

F-148   Código de barras con peso embebido
      Exclusiva de los giros con báscula en mostrador: abarrotes,
      dulcería, tienda de mascotas, agroveterinaria, bufet por peso,
      tortillería. El prefijo 2x es un estándar de facto de las básculas
      de etiqueta y sin él el granel empaquetado no se puede escanear.

F-255   Venta por comisión
      Exclusiva del mostrador de barrio: abarrotes, papelería,
      misceláneas. El dinero que entra NO es venta y sólo la comisión
      es ingreso. Ningún otro arquetipo cobra dinero ajeno.

F-256   Depósito de envase retornable en mostrador
      Exclusiva de abarrotes y vinatería en el mostrador. Existe
      F-815 (devolución de envase) pero está clasificada como
      exclusiva de A9 RUTA, y no lo es: el casco de la cerveza y el
      garrafón se manejan en el mostrador todos los días.
      ESTO OBLIGA A RECLASIFICAR F-815. Ver §6.

F-254   Cobro de fiado en caja
      Nace aquí y la heredan fonda, mayorista, mueblería y todo el que
      cobre a crédito. Es un movimiento de caja que SUMA al cajón y NO
      suma a ventas, y hoy no existe ninguna categoría así.

F-988   Venta sin conexión
      No es exclusiva de este modelo: es del ARQUETIPO A1 completo y de
      food truck. Se declara aquí porque aquí se detectó y porque el
      contrato de Fase 1 —precios y totales siempre en el servidor—
      entra en tensión directa con ella. Ver §6.
```

---

## 5 · LO QUE FALTA · pendientes de este modelo

Este modelo **no está construido**: hoy es la plantilla `esencial`, que vende sin controlar stock.
D-01 dice que el renombre a `tienda` no es sólo de nombre. Esto es lo que hay que añadir para que
el nombre sea honesto, con el costo operativo de cada hueco.

| ID | Función | Qué duele hoy sin ella |
|---|---|---|
| **F-986** | Lector de código de barras como teclado | Hoy está en `MODULOS_ESENCIAL` pero apunta a un escáner de **cámara**, con *cooldown* de 1500 ms y búsqueda exacta en memoria. Pasar seis refrescos iguales es imposible. **Sin esto no hay modelo**, porque sin escaneo fluido nadie escanea, y sin escaneo el inventario es ficción. |
| **F-111 · F-112** | Stock simple y presentaciones | La plantilla `esencial` **no tiene inventario**. Se vende y el stock no baja. El dueño no puede saber qué le falta ni qué le robaron: los dos dolores más caros quedan sin respuesta. Es el hueco que D-01 señala por su nombre. |
| **F-107** | Alertas de mínimo | Existe en el código pero está fuera de `esencial`. Sin ella no hay sugerencia de pedido y el dolor 3 queda entero. |
| **F-106 · F-149** | Toma de inventario físico y conteo cíclico | **Es el dolor 1 completo.** Sin conteo físico el sistema da el esperado y nunca el real, y la pregunta "¿quién me está robando?" no tiene renglón. Mismo hueco que hoy tiene `restaurante`, y aquí es el argumento de venta entero. |
| **F-610…F-617** | Fiado | La libreta sigue en el mostrador. El sistema no puede avisar antes de que el producto se vaya. |
| **F-255** | Venta por comisión | Hoy las recargas o se registran como venta —y destruyen el margen reportado— o no se registran —y el cajón sobra cada noche. Las dos opciones son malas y hoy sólo existen esas dos. |
| **F-011** variante | IVA mixto e IEPS | Hoy hay una sola tasa. Una tiendita con todo al 16% declara mal desde el primer mes. |
| **F-201** atajos | Atajos de teclado | **No existe un solo atajo en todo el repositorio.** En un giro de ráfaga eso es fricción constante multiplicada por 220 tickets al día. |
| **F-983** | Báscula conectada | El granel se teclea. Es donde nacen los errores de dedo que descuadran el inventario y donde Profeco encuentra faltas de tara. |
| **F-040** en el puente | Clientes | La tabla `clientes` existe con `saldo_pendiente_centavos` y `limite_credito_centavos` y **no está declarada en `mapa.ts`**. No hay pantalla, no hay comandos, no hay nada. |
| **F-940…F-945** | CFDI y factura global | Sin factura global mensual el tendero en RESICO está en falta. Es decisión pendiente P-02. |

---

## 6 · FUNCIONES QUE FALTAN EN EL CATÁLOGO

**Ya están en `03-CATALOGO-DE-FUNCIONES.md`.** Sin ID canónico se iban a reinventar con otro nombre
en `ferreteria`, en `farmacia` y en los otros dieciséis.

> **Reconciliado el 14-09-2026 (D-11).** Este modelo **conservó los diez IDs que propuso**,
> incluidos los dos que estaban en colisión con `cafeteria` —**F-146** (caducidad sin lote) y
> **F-148** (peso embebido en EAN-13)—. Ganó porque su acepción la citan tres modelos —éste,
> `ferreteria` y `estetica-salon`— contra uno solo de `cafeteria`, que se movió a F-156 y F-157.
>
> Dos matices que sí cambiaron:
> - **F-254** se fusionó con la que `ferreteria` llamaba *cobro de crédito en caja*: es la misma
>   función con el vocabulario de cada giro, y el diccionario (F-017) es lo que resuelve que una
>   diga «fiado» y la otra «crédito» sin duplicar código.
> - **F-326** (consumo de empleados), que este modelo citaba para el autoconsumo del tendero, pasó
>   a **F-261**: su ID estaba en el bloque de mesa y preparación y la función es universal.

| ID propuesto | Función | Bloque | Por qué hace falta |
|---|---|---|---|
| **F-058** | **Impresión de etiquetas de anaquel y de código de barras** | F-0xx | El precio del anaquel se marca a mano con plumón. Cuando sube el refresco, hay que re-etiquetar 40 caras de anaquel y **nadie sabe cuáles**. El sistema sí: sabe qué precios cambiaron desde la última impresión. Además, los productos sin código de fábrica (granel empaquetado, producto importado) necesitan una etiqueta impresa o no se pueden escanear nunca. No lo cubre F-029, que es *tener* el código, no *imprimirlo*. |
| **F-146** | **Caducidad sin lote · fecha por entrada de compra** | F-1xx · depende de F-112 | V4 (F-113) es lote completo con trazabilidad y PEPS obligatorio, y es de farmacia. Una tiendita no maneja lote: maneja *"la leche que llegó el jueves"*. Necesita fecha de caducidad en la **entrada**, alerta de próximo a vencer y merma por caducidad, **sin** número de lote ni trazabilidad hacia atrás. Forzar V4 aquí es pedirle a Don Chuy que capture un lote por cada caja de leche, y no lo va a hacer. |
| **F-147** | **Presentación con código de barras propio** | F-1xx · depende de F-112 | El fabricante imprime un EAN distinto en la pieza, en el six y en la caja. Hoy `productos.codigo_barras` es **una sola columna**. Si el tendero escanea la caja de 24 y el sistema no la reconoce, se acabó la confianza en el primer día. Es la mitad de F-112 que no se ve hasta que se opera. |
| **F-148** | **Código de barras con peso o importe embebido (EAN-13 prefijo 2x)** | F-1xx · depende de F-144, F-983 | Las básculas de etiqueta generan un EAN-13 que empieza en 2 y lleva dentro el código del producto y el peso o el importe. Es el estándar de facto del granel empaquetado en México. `barcodeUtils.js` hoy **sólo valida longitud** y no interpreta nada. Sin esto, el jamón empaquetado se teclea. |
| **F-149** | **Conteo cíclico por zona de anaquel** | F-1xx · depende de F-106 | F-106 es la toma de inventario completa, que en una tienda de 1,800 SKU tarda un domingo entero y por eso **se hace una vez al año o nunca**. El conteo cíclico cuenta una zona por día (hoy la reja de refrescos, mañana el anaquel de aceites): 20 minutos diarios en el valle de las 11:00. Es lo único que convierte el dolor 1 en una rutina sostenible. Sin F-149, F-106 existe y no se usa. |
| **F-254** | **Cobro de fiado en caja · entrada que NO es venta** | F-2xx · depende de F-615 | Doña Meche abona $200. Entran $200 al cajón, el saldo baja $200, y **la venta del día no cambia**. Hoy no existe ninguna categoría de movimiento así: F-231 tiene "entrada" genérica y meterlo ahí hace que el corte no pueda explicar de dónde salió el dinero. Es, junto con las recargas, **el descuadre número uno del giro**. |
| **F-255** | **Venta por comisión · recargas, pago de servicios, paquetería** | F-2xx | Una recarga de $200 mete $200 al cajón y genera **$12 de ingreso** (6%, TAECEL). Un recibo de luz de $1,240 mete $1,240 y genera $3 a $22. Un paquete de Mercado Libre, $6. Si se registra como venta, la venta del día se infla y el margen reportado se destruye. Si no se registra, el cajón sobra cada noche. **No existe ningún ID para "dinero ajeno en tránsito"** y hace falta en los 78, no sólo aquí. |
| **F-256** | **Depósito de envase retornable en mostrador (casco)** | F-2xx | La botella de cerveza y el garrafón llevan depósito. El valor lo fija el tendero, entre $7 y $25, y el art. 11 de la LFPC obliga a devolverlo íntegro. Es un **pasivo**, no una venta: entra dinero que no es del negocio y que hay que devolver. F-815 existe pero está clasificada `[+]` exclusiva de A9 ruta, y eso está mal: **al añadir F-256 hay que reclasificar F-815 a `[≠]` con dos variantes, mostrador y ruta.** |
| **F-257** | **Redondeo de cambio y su registro** | F-2xx | "No tengo cambio, ¿le doy un chicle?" es una operación real, diaria, y hoy sale del stock sin registro y descuadra el cajón por pesos sueltos que a fin de mes son cientos. Necesita: registrar el redondeo a favor o en contra, o registrar la salida en especie. Es chico y es exactamente el tipo de cosa que hace que el arqueo no cuadre nunca por poquito, que es peor que no cuadrar por mucho. |
| **F-988** | **Venta sin conexión con sincronización posterior** | F-9xx | El internet de una tiendita se cae. Cuando se cae, o se sigue vendiendo en papel —y ese día no existe en el sistema— o se cierra la tienda, que no va a pasar. **Entra en tensión directa con la regla de Fase 1** de que precios y totales se calculan siempre en el servidor, y por eso hay que decidirlo, no improvisarlo: la propuesta es cola local firmada con el catálogo cacheado, folio provisional, y **reconciliación obligatoria** al volver la conexión, con el corte bloqueado mientras haya ventas sin sincronizar. **La decisión la toma Miguel.** |

**Además, dos reclasificaciones del catálogo que este modelo obliga:**

1. **F-815** (devolución de envase retornable) deja de ser `[+]` exclusiva de A9 y pasa a `[≠]` con
   variante de mostrador (F-256) y variante de ruta.
2. **F-029** (códigos de barras) deja de ser `[=]` y pasa a `[≠]`: en restaurante está apagada, en
   abarrotes hay N códigos por producto, y en ferretería la mitad del catálogo no tiene código.

---

## 7 · DEPENDENCIAS

Las flechas se leen "necesita".

```
F-986 Lector como teclado
  → F-029 Códigos de barras          (hay que tener el dato antes de leerlo)
  → F-147 Código por presentación    (NUEVA: si no, la caja no se reconoce)
  → F-201 Búsqueda rápida            (el índice en memoria es lo que lo hace instantáneo)

F-112 V3 Presentaciones
  → F-111 V2 Stock simple            (la presentación es un factor sobre la unidad base)
  → F-100 Existencia por almacén     (ya existe)
  → F-101 Ledger inmutable           (ya existe: el ledger se escribe SIEMPRE en unidad base)
  → F-120 Factor de conversión       (existe sólo para compras; hay que llevarlo a venta)

F-121 Venta en dos unidades
  → F-112 Presentaciones
  → F-022 Precio único               (cada presentación lleva su propio precio)

F-148 Código con peso embebido
  → F-144 Venta a granel             (hay que saber qué es un producto pesable)
  → F-986 Lector                     (es un caso especial del capturador)
  → F-983 Báscula                    (NO: son caminos alternativos, no dependencia.
                                      F-148 es para producto YA pesado y etiquetado;
                                      F-983 es para pesar en el momento)

F-106 Toma de inventario físico
  → F-100 Existencia                 (contra qué se compara)
  → F-101 Ledger                     (el ajuste resultante es un movimiento más)
  → F-112 Presentaciones             (se cuenta en cajas Y piezas, y hay que convertir)

F-149 Conteo cíclico
  → F-106 Toma de inventario         (es F-106 acotada a una zona)
  → F-020 Catálogo                   (NUEVA columna: zona de anaquel)

F-254 Cobro de fiado en caja
  → F-610 Límite de crédito          (tiene que existir la cuenta)
  → F-615 Pago parcial               (el abono es el movimiento)
  → F-231 Movimientos de caja        (ya existe: es una categoría nueva, no un tipo nuevo)
  → F-040 Clientes en el puente      (hoy NO está declarado en mapa.ts)

F-610…F-617 Fiado
  → F-040 Clientes                   (la tabla existe con saldo y límite; falta puente y UI)
  → F-254 Cobro de fiado             (sin el abono, la cuenta sólo crece)

F-255 Venta por comisión
  → F-231 Movimientos de caja        (el dinero ajeno entra al cajón)
  → F-050 Ventas por periodo         (hay que EXCLUIRLO de ventas, y eso se decide aquí)
  → F-234 Corte                      (bloque propio de dinero en tránsito)

F-256 Casco
  → F-255                            (comparten la idea de "dinero que no es venta")
  → F-222 Devolución                 (la devolución de casco reusa el flujo de salida de caja)

F-011 IVA mixto e IEPS
  → F-020 Catálogo                   (tasa y régimen IEPS por producto)
  → F-032 Importación masiva         (la tasa tiene que venir precargada por categoría)
  → F-942 Factura global             (la global desglosa por tasa)

F-107 Alertas + sugerencia de pedido
  → F-100 Existencia                 (ya existe)
  → F-050 Ventas por periodo         (ya existe: la sugerencia sale de la venta de 14 días)
  → F-631 Proveedores                (la lista es POR proveedor, no global)
  → F-112 Presentaciones             (se pide en cajas, no en piezas)

F-983 Báscula
  → F-144 Venta a granel             (ya existe parcialmente)

F-980 Restricción legal
  → F-021 Categorías                 (la restricción se declara por categoría, no por SKU)
  → F-200 Carrito                    (el bloqueo es por línea)
```

---

## 8 · ORDEN DE CONSTRUCCIÓN

Derivado de §7 y del costo operativo de §5. No es el orden fácil: es el orden en que el sistema
deja de ser inútil lo antes posible.

```
TANDA 0 · sin esto no hay nada que demostrar
  1.  F-986  Lector como teclado, sin cooldown, foco imperdible
  2.  F-201  Índice en memoria + atajos F1–F8 + alta rápida desde el código
  3.  F-111  V2 stock simple                              (el mínimo honesto de `tienda`)

  → Con estas tres, la plantilla `tienda` ya merece su nombre y se puede
    demostrar en un mostrador real sin pasar vergüenza.

TANDA 1 · lo que hace verdadero el inventario
  4.  F-112  V3 presentaciones + F-120 factor en venta
  5.  F-147  Código de barras por presentación            (NUEVA · sin esto, 112 no se opera)
  6.  F-121  Venta en dos unidades
  7.  F-107  Alertas de mínimo + sugerencia de pedido por proveedor
  8.  F-632  Entrada de compra con devolución en la misma nota

  → Aquí se resuelve el DOLOR 3 y el sistema pasa de "gasto" a "herramienta".

TANDA 2 · lo que resuelve el dolor 1, que es por lo que compran
  9.  F-149  Conteo cíclico por zona                      (NUEVA · se construye ANTES que 106)
  10. F-106  Toma de inventario físico y diferencias
  11. F-109  Merma con los cinco motivos del giro + canje al proveedor
  12. F-146  Caducidad sin lote                           (NUEVA)
  13. F-205  Tope de descuento por rol y autorización con PIN

  → Aquí el corte contesta "qué producto falta" y el argumento de venta
    número uno deja de ser una promesa.

TANDA 3 · el dinero que hoy no cuadra
  14. F-255  Venta por comisión                           (NUEVA · descuadre nº 1)
  15. F-040  Clientes en el puente + pantalla
  16. F-610…F-617  Fiado, en variante ligera
  17. F-254  Cobro de fiado en caja                       (NUEVA)
  18. F-256  Depósito de casco                            (NUEVA)
  19. F-257  Redondeo de cambio                           (NUEVA)
  20. F-234  El corte de abarrotes, rearmado sección por sección

  → Aquí el arqueo deja de descuadrar por razones estructurales.

TANDA 4 · lo que pide el que ya está enganchado
  21. F-011  IVA mixto e IEPS por producto
  22. F-058  Etiquetas de anaquel                         (NUEVA)
  23. F-144 + F-983 + F-148  Granel con báscula y peso embebido  (NUEVA F-148)
  24. F-980  Restricción legal por horario y edad
  25. F-214  Vales de despensa como método de pago
  26. F-940…F-945  CFDI y factura global mensual          (sujeto a P-02)

TANDA 5 · deuda de fondo y decisión pendiente
  27. F-103  Kardex por artículo
  28. F-635  Cuentas por pagar (crédito de proveedor)
  29. F-017  Diccionario de vocabulario                   (habilita los otros 18)
  30. F-988  Venta sin conexión                           (NUEVA · requiere decisión de Miguel)
```

**Por qué F-149 va antes que F-106, aunque F-149 dependa de F-106.** Porque lo que hay que
construir primero es el **motor de comparación esperado-contra-contado acotado a un subconjunto**,
y la toma completa es ese mismo motor con el subconjunto igual a "todo". Si se construye primero la
toma completa, se construye un flujo de un domingo entero que nadie va a ejecutar, y después hay que
volver a escribirlo para que acepte un alcance parcial. Al revés sale una vez.

**Por qué F-147 está en tanda 1 y no en la 4, aunque suene a detalle.** Porque F-112 sin F-147 es
una función que en la demostración falla en el primer intento: el tendero agarra una caja de
refrescos, la escanea, y el sistema dice "no está en el catálogo". No hay segunda oportunidad para
eso.
