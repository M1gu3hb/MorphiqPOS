# 01 · FUNCIONES · Ferretería y tlapalería

IDs canónicos de `03-CATALOGO-DE-FUNCIONES.md`. **Nunca se inventa un ID aquí**: lo que falta se
declara en §6 para añadirlo al catálogo antes de construir nada.

```
[=]  idéntica al tronco     [≠]  variante      [+]  exclusiva
[⚙]  construida y operando  [◐]  parcial       [ ]  pendiente
```

**Advertencia de lectura, y es la más importante de esta carpeta.** Este modelo **no es raíz de
arquetipo**: hereda de `abarrotes`, que sí lo es. Por eso las tablas de tres columnas de las `[≠]`
comparan contra **`abarrotes`**, no contra `restaurante`. Cuando una función va marcada
`[=] ← reutiliza de: abarrotes`, quiere decir que ya quedó documentada allá, con su razón, y **no se
vuelve a describir ni a construir**. Si el lector quiere saber cómo funciona, la lee allá.

La cuenta que importa: de las **112 funciones** de este árbol, **74 van `[=]`**, **26 van `[≠]`** y
**12 son `[+]` que nacen aquí**. Dos tercios heredados y un tercio propio: eso es lo que hace que
`ferreteria` sea un modelo aparte y no una copia — y también lo que hace que construirlo sea barato.

---

## 1 · ÁRBOL COMPLETO

```
FERRETERÍA Y TLAPALERÍA        A1 + deltas A5 · inventario V3 + corte de material
│
├── NÚCLEO · identidad y acceso
│   ├── F-001 Tarjetas de empleado ............................... [=] [⚙] ← abarrotes
│   ├── F-002 PIN de 4 dígitos, Argon2id en servidor ............. [=] [⚙] ← abarrotes
│   ├── F-003 Roles y permisos ................................... [≠] [⚙]  ← §3.1
│   │         CUATRO roles vivos, no tres: dueño, cajero,
│   │         MOSTRADORISTA y almacén. El mostradorista es un rol
│   │         que no existe en abarrotes: despacha y no cobra.
│   ├── F-004 Sesión revocable con caducidad ..................... [=] [⚙] ← abarrotes
│   ├── F-005 Bloqueo por intentos fallidos ...................... [=] [⚙] ← abarrotes
│   ├── F-006 Bitácora de acceso y auditoría ..................... [=] [⚙] ← abarrotes
│   └── F-007 Permisos finos por módulo .......................... [≠] [ ]  ← §3.1
│             Los permisos que mandan aquí son `dar_credito`,
│             `autorizar_sobre_limite` y `precio_especial`.
│
├── NÚCLEO · configuración
│   ├── F-010 Identidad del negocio .............................. [=] [⚙] ← abarrotes
│   ├── F-011 Impuestos · IVA 16% único, SIN IEPS ................ [≠] [⚙]  ← §3.2
│   ├── F-012 Sucursales ......................................... [=] [⚙] ← abarrotes
│   ├── F-013 Terminales ......................................... [=] [⚙] ← abarrotes
│   ├── F-014 Apariencia y tema .................................. [=] [⚙] ← abarrotes
│   ├── F-015 Plantilla de negocio `ferreteria` .................. [+] [ ]  ← §5
│   ├── F-016 Perillas por módulo ................................ [≠] [◐]
│   │         Las que importan aquí: crédito sí/no, corte de
│   │         material sí/no, obra sí/no, renta sí/no, despacho
│   │         separado de caja sí/no.
│   └── F-017 Diccionario de vocabulario del giro ................ [+] [ ]
│             `abarrotes` lo dejó pendiente y advirtió que este
│             modelo lo iba a romper. Lo rompe. Ver `04` §4.1.
│
├── NÚCLEO · catálogo  ← EL BLOQUE QUE MÁS SE SEPARA DE ABARROTES
│   ├── F-020 Catálogo de productos y servicios .................. [≠] [⚙]  ← §3.3
│   ├── F-021 Categorías ......................................... [≠] [⚙]  ← §3.4
│   │         Aquí la categoría es "línea" y es jerárquica de tres
│   │         niveles: línea › familia › medida.
│   ├── F-022 Precio único ....................................... [=] [⚙] ← abarrotes
│   ├── F-023 Listas de precio (público, contratista, obra) ...... [≠] [◐]  ← §3.5
│   ├── F-025 Precio por volumen escalonado ...................... [≠] [ ]  ← §3.5
│   ├── F-028 Imágenes de producto ............................... [≠] [⚙]  ← §3.6
│   │         En abarrotes casi no se usan. Aquí la foto ES el
│   │         camino de búsqueda. Se invierte el peso de la función.
│   ├── F-029 Códigos de barras · CATÁLOGO MIXTO ................. [≠] [◐]  ← §3.7
│   ├── F-030 Paquetes y combos .................................. [≠] [ ]
│   ├── F-031 Productos compuestos (kits) ........................ [=] [ ] ← abarrotes
│   │         El kit que SÍ se arma y se vende como uno: juego de
│   │         brocas reempacado. Poco frecuente. Distinto de F-153.
│   ├── F-032 Importación masiva por Excel ....................... [≠] [⚙]  ← §3.8
│   ├── F-034 Compatibilidad por medida y sistema ................ [≠] [ ]  ← §3.9
│   ├── F-058 Impresión de etiquetas de anaquel y código ......... [≠] [ ]  ← §3.10
│   │         En abarrotes es comodidad. Aquí es REQUISITO: la
│   │         mitad del catálogo no tiene código de fábrica.
│   ├── F-059 Atributos técnicos de medida ....................... [+] [ ]  ← NUEVA §6
│   ├── F-060 Equivalencias y sustitutos ......................... [+] [ ]  ← NUEVA §6
│   └── F-061 Foto de mostrador y búsqueda visual asistida ....... [+] [ ]  ← NUEVA §6
│
├── CLIENTES
│   ├── F-040 Clientes: ficha básica ............................. [≠] [◐]  ← §3.11
│   ├── F-041 Historial de compra del cliente .................... [≠] [ ]  ← §3.11
│   │         "¿Qué cable me llevé la vez pasada?" es la pregunta
│   │         diaria del contratista. En abarrotes nadie la hace.
│   ├── F-042 Datos fiscales (RFC, régimen, CP) .................. [=] [ ] ← abarrotes
│   ├── F-043 Etiquetas y segmentos .............................. [=] [ ]
│   │         Contratista · plomero · electricista · particular.
│   │         Es lo que decide la lista de precio.
│   └── F-044 Notas del cliente .................................. [=] [ ] ← abarrotes
│
├── INVENTARIO · TRONCO Y V3  ← casi todo heredado
│   ├── F-100 Existencia actual por almacén ...................... [=] [⚙] ← abarrotes
│   ├── F-101 Ledger inmutable de movimientos .................... [=] [⚙] ← abarrotes
│   ├── F-102 Decremento atómico al cobrar ....................... [≠] [⚙]  ← §3.12
│   │         El disparador cambia: no siempre es al cobrar.
│   ├── F-103 Kardex / historial por artículo .................... [=] [ ] ← abarrotes
│   ├── F-104 Ajuste manual con motivo obligatorio ............... [=] [⚙] ← abarrotes
│   ├── F-105 Traspaso entre almacenes ........................... [≠] [ ]  ← §3.13
│   │         Aquí SÍ hay dos almacenes de verdad: mostrador y
│   │         bodega de pesado. Abarrotes decidió uno solo.
│   ├── F-106 Toma de inventario físico .......................... [=] [ ] ← abarrotes
│   ├── F-107 Alertas de mínimo .................................. [≠] [⚙]  ← §3.14
│   ├── F-108 Valuación (costo promedio ponderado) ............... [=] [⚙] ← abarrotes
│   ├── F-109 Merma con motivo ................................... [≠] [ ]  ← §3.15
│   ├── F-111 V2 · Stock simple (pieza) .......................... [=] [ ] ← abarrotes
│   ├── F-112 V3 · Presentaciones ................................ [=] [ ] ← abarrotes
│   ├── F-120 Factor de conversión ............................... [=] [ ] ← abarrotes
│   ├── F-121 Venta en dos unidades .............................. [≠] [ ]  ← §3.16
│   ├── F-144 Venta a granel / por peso .......................... [≠] [◐]  ← §3.17
│   ├── F-145 CORTE DE MATERIAL .................................. [≠] [ ]  ← §3.18 ★
│   ├── F-149 Conteo cíclico por zona ............................ [≠] [ ]  ← §3.19
│   ├── F-150 Retazo y sobrante de corte ......................... [+] [ ]  ← NUEVA §6
│   ├── F-151 Doble unidad con conversión por peso ............... [+] [ ]  ← NUEVA §6
│   ├── F-152 Ubicación física de la pieza ....................... [+] [ ]  ← NUEVA §6
│   └── F-153 Lista de materiales por trabajo .................... [+] [ ]  ← NUEVA §6
│
├── INVENTARIO · VARIANTES OPCIONALES POR PERILLA
│   ├── F-117 V8 · Material por obra del cliente ................. [≠] [ ]  ← §3.20
│   ├── F-137 Requisición de obra ................................ [≠] [ ]
│   ├── F-138 Devolución de sobrante de obra ..................... [≠] [ ]
│   ├── F-119 V10 · Renta de herramienta ......................... [≠] [ ]  ← §3.21
│   ├── F-141 Estado de salida y retorno ......................... [=] [ ]
│   ├── F-142 Mantenimiento entre rentas ......................... [=] [ ]
│   ├── F-143 Daño y reposición .................................. [=] [ ]
│   ├── F-114 V5 · Número de serie (sólo línea eléctrica) ........ [=] [ ]
│   └── F-127 Garantía ligada a la serie ......................... [≠] [ ]  ← §3.22
│
├── VENTA Y COBRO
│   ├── F-200 Carrito ............................................ [≠] [⚙]  ← §3.23
│   ├── F-201 Búsqueda rápida .................................... [≠] [◐]  ← §3.24 ★
│   ├── F-202 Descuento por línea ................................ [≠] [⚙]  ← §3.25
│   ├── F-203 Descuento por total ................................ [≠] [⚙]  ← §3.25
│   ├── F-205 Autorización de descuento por supervisor ........... [=] [ ] ← abarrotes
│   ├── F-210 Cobro en efectivo con cambio ....................... [=] [⚙] ← abarrotes
│   ├── F-211 Cobro con tarjeta .................................. [=] [⚙] ← abarrotes
│   ├── F-212 Cobro por transferencia ............................ [≠] [⚙]  ← §3.26
│   ├── F-213 Pago mixto ......................................... [=] [⚙] ← abarrotes
│   ├── F-220 Ticket ............................................. [≠] [⚙]  ← §3.27
│   ├── F-221 Cancelación con motivo ............................. [=] [⚙] ← abarrotes
│   ├── F-222 Devolución total o parcial ......................... [≠] [◐]  ← §3.28 ★
│   ├── F-223 Folio consecutivo por sucursal ..................... [=] [⚙] ← abarrotes
│   ├── F-224 Venta en espera / suspendida ....................... [≠] [ ]  ← §3.29
│   ├── F-225 Reimpresión de ticket .............................. [=] [⚙] ← abarrotes
│   ├── F-257 Redondeo de cambio ................................. [=] [ ] ← abarrotes
│   └── F-258 Servicio de mostrador .............................. [+] [ ]  ← NUEVA §6
│
├── CAJA
│   ├── F-230 Apertura con fondo ................................. [=] [⚙] ← abarrotes
│   ├── F-231 Movimientos: entrada, retiro, gasto ................ [=] [⚙] ← abarrotes
│   ├── F-232 Arqueo a ciegas .................................... [=] [⚙] ← abarrotes
│   ├── F-233 Corte de turno ..................................... [=] [⚙] ← abarrotes
│   ├── F-234 Corte diario y su PDF .............................. [≠] [⚙]  ← §3.30 ★
│   ├── F-235 Varias cajas simultáneas ........................... [≠] [ ]  ← §3.31
│   │         ENCENDIDA por omisión en el modo despacho+caja.
│   │         En abarrotes viene apagada. Es lo contrario.
│   ├── F-236 Caja por terminal .................................. [=] [⚙] ← abarrotes
│   └── F-254 Cobro de crédito en caja ........................... [≠] [ ]  ← §3.32
│
├── PROPINAS
│   └── V1 · SIN PROPINAS ........................................ [—] [—]
│             Se apaga entera, por una razón DISTINTA a la de
│             abarrotes. Ver `02-DINERO-Y-CAJA.md` §4.
│
├── COTIZACIÓN Y PEDIDO · A5
│   ├── F-600 Cotización con vigencia ............................ [+] [ ]
│   ├── F-601 Versiones de cotización ............................ [+] [ ]
│   ├── F-602 Envío por correo o WhatsApp ........................ [+] [ ]
│   ├── F-603 Aprobación del cliente ............................. [+] [ ]
│   ├── F-604 Conversión a pedido ................................ [+] [ ]
│   ├── F-605 Surtido parcial .................................... [+] [ ]
│   ├── F-606 Remisión de entrega ................................ [≠] [ ]  ← §3.33 ★
│   └── F-607 Seguimiento: ganada, perdida, motivo ............... [+] [ ]
│
├── CRÉDITO Y COBRANZA · A5  ← el bloque que sostiene el dolor 1
│   ├── F-610 Límite de crédito por cliente ...................... [≠] [ ]  ← §3.34
│   ├── F-611 Días de plazo ...................................... [≠] [ ]
│   ├── F-612 Estado de cuenta ................................... [≠] [ ]
│   ├── F-613 Antigüedad de saldos ............................... [=] [ ] ← abarrotes
│   ├── F-614 Aplicación de pagos a documentos ................... [≠] [ ]  ← §3.34
│   ├── F-615 Pago parcial ....................................... [=] [ ] ← abarrotes
│   ├── F-616 Recordatorio de vencimiento ........................ [=] [ ] ← abarrotes
│   ├── F-617 Bloqueo por mora ................................... [≠] [ ]  ← §3.34
│   ├── F-618 Nota de crédito .................................... [=] [ ]
│   ├── F-638 Autorizados a cargar en cuenta ..................... [+] [ ]  ← NUEVA §6 ★
│   └── F-639 Subcuenta por obra del cliente ..................... [+] [ ]  ← NUEVA §6
│
├── COMPRAS Y GASTOS
│   ├── F-250 Gastos con categoría ............................... [=] [⚙] ← abarrotes
│   ├── F-251 Plantillas de gasto fijo ........................... [=] [⚙] ← abarrotes
│   ├── F-252 Comprobante adjunto al gasto ....................... [=] [ ] ← abarrotes
│   ├── F-630 Orden de compra .................................... [≠] [ ]  ← §3.35
│   ├── F-631 Proveedores ........................................ [≠] [⚙]  ← §3.35
│   ├── F-632 Recepción y entrada a inventario ................... [≠] [⚙]  ← §3.35
│   ├── F-633 Actualización de costo promedio .................... [=] [⚙] ← abarrotes
│   ├── F-634 Plantillas de compra recurrente .................... [=] [⚙] ← abarrotes
│   ├── F-635 Cuentas por pagar .................................. [≠] [ ]  ← §3.36
│   └── F-636 Comparativo de precios entre proveedores ........... [≠] [ ]  ← §3.36
│
├── REGISTROS Y DASHBOARD
│   ├── F-050 Ventas por periodo ................................. [=] [⚙] ← abarrotes
│   ├── F-051 Más vendidos ....................................... [≠] [⚙]  ← §3.37
│   │         Aquí el reporte que importa es el INVERSO.
│   ├── F-052 Utilidad y margen .................................. [≠] [⚙]  ← §3.37
│   ├── F-053 Cortes históricos .................................. [=] [⚙] ← abarrotes
│   ├── F-054 Ventas por empleado ................................ [≠] [◐]  ← §3.38
│   │         PROHIBIDA en el dashboard de abarrotes.
│   │         OBLIGATORIA aquí. Ver §3.38.
│   ├── F-055 Comparativo entre periodos ......................... [=] [ ] ← abarrotes
│   ├── F-056 Dashboard .......................................... [≠] [◐]  ← §3.39 ★
│   └── F-057 Exportación a Excel y PDF .......................... [=] [⚙] ← abarrotes
│
├── FACTURACIÓN  ← mucho más pesada que en abarrotes
│   ├── F-940 CFDI 4.0 ........................................... [≠] [ ]  ← §3.40
│   ├── F-941 Timbrado ante PAC .................................. [=] [ ]
│   ├── F-942 Factura global del día ............................. [≠] [ ]  ← §3.40
│   ├── F-943 Complemento de pago ................................ [+] [ ]  ← §3.40
│   ├── F-944 Cancelación con motivo SAT ......................... [=] [ ]
│   └── F-945 Envío automático por correo ........................ [=] [ ]
│
├── ENTREGA  ← por perilla
│   ├── F-813 Entrega con firma o foto ........................... [=] [ ]
│   ├── F-821 Domicilio del cliente y mapa ....................... [=] [ ]
│   └── F-822 Costo de envío por zona ............................ [≠] [ ]  ← §3.41
│
├── PORTAL
│   └── F-925 V5 · Estado de cuenta .............................. [=] [ ]
│
├── TRANSVERSALES
│   ├── F-970…F-974 Multi-sucursal ............................... [=] [◐] ← abarrotes
│   └── F-988 Venta sin conexión ................................. [≠] [ ]  ← §3.42
│
└── HARDWARE
    ├── F-983 Báscula conectada .................................. [≠] [ ]  ← §3.43
    ├── F-984 Cajón de dinero .................................... [=] [ ] ← abarrotes
    ├── F-985 Impresora térmica .................................. [=] [⚙] ← abarrotes
    ├── F-986 Lector de código de barras ......................... [≠] [◐]  ← §3.7
    └── F-987 Terminal bancaria integrada ........................ [=] [ ] ← abarrotes
```

---

## 2 · LAS `[=]` · lo que NO se vuelve a construir

Comparadas campo por campo contra `abarrotes`. Si hubiera una sola diferencia, estarían en §3.

```
F-001 · F-002 · F-004 · F-005 · F-006          Identidad y acceso
      ← reutiliza de: abarrotes (que lo hereda de restaurante)
      Idénticas. Qué roles existen cambia (F-003 sí es [≠]), pero el
      mecanismo de autenticación no. NO SE VUELVE A CONSTRUIR.

F-100 · F-101 · F-103 · F-104 · F-106 · F-108   Tronco de inventario
      ← reutiliza de: abarrotes · `packages/app/src/inventario/`
      Idénticas, incluida la regla de hierro: el ledger se escribe
      SIEMPRE en unidad base. Lo que ferretería añade es qué es la
      unidad base de un cable (milímetro, ver `03` §2) y qué tipos de
      movimiento existen — no cómo funciona el ledger.
      NO SE VUELVE A CONSTRUIR.

F-111 · F-112 · F-120                           Presentaciones y factor
      ← reutiliza de: abarrotes · `packages/app/src/retail/`
      Idénticas. El rollo de 100 m es exactamente la misma estructura
      que la caja de 24 refrescos: una presentación con factor sobre
      la unidad base, con su propio código y su propio precio.
      Ferretería NO necesita otro motor de presentaciones: necesita
      DOS cosas encima, y por eso F-121 y F-151 sí son propias.
      NO SE VUELVE A CONSTRUIR. Es el ahorro más grande de la carpeta.

F-210 · F-211 · F-213 · F-221 · F-223 · F-225   Cobro y documentos
      ← reutiliza de: abarrotes · `packages/app/src/venta/pagos.ts`
      Idénticas. Un pago mixto es un pago mixto. Lo que cambia es la
      proporción de cada método (ver `02` §5) y eso es dato, no
      comportamiento. NO SE VUELVE A CONSTRUIR.

F-230 · F-231 · F-232 · F-233 · F-236           Caja y arqueo
      ← reutiliza de: abarrotes · `packages/app/src/caja/`
      Idénticas, incluido el desglose por denominación al abrir y
      cerrar, que abarrotes añadió y aquí sirve igual: el fondo de una
      ferretería también existe para dar cambio, y los albañiles pagan
      con billetes de $500.
      NO SE VUELVE A CONSTRUIR. (F-234, el corte, SÍ cambia: §3.30.)

F-257   Redondeo de cambio
      ← reutiliza de: abarrotes
      Idéntica. "Déjelo así" existe igual en los dos mostradores, y
      el modo "en especie" también: aquí el chicle es un taquete.
      NO SE VUELVE A CONSTRUIR.

F-205   Autorización de descuento por supervisor
      ← reutiliza de: abarrotes
      Idéntica en mecánica. Lo que cambia son los topes por rol, que
      son configuración. NO SE VUELVE A CONSTRUIR.

F-613 · F-615 · F-616 · F-618                   Antigüedad, abono, aviso
      ← reutiliza de: abarrotes · `packages/app/src/fiado/`
      Idénticas. Un abono parcial es un abono parcial y la antigüedad
      de saldos se calcula igual con $340 que con $46,000. Lo que
      cambia es F-610, F-611, F-614 y F-617, que sí son [≠].
      NO SE VUELVE A CONSTRUIR.

F-633 · F-634   Costo promedio ponderado y compra recurrente
      ← reutiliza de: abarrotes · `packages/app/src/compras/costeo.ts`
      Idénticas. NO SE VUELVE A CONSTRUIR.

F-106 · F-149(motor)   Esperado contra contado con alcance parcial
      ← reutiliza de: abarrotes · `packages/app/src/inventario/conteo.ts`
      El MOTOR es idéntico, incluido el sellado del esperado al abrir
      la línea. Lo que cambia es CÓMO se cuenta una gaveta de tornillos
      (por peso, no por pieza), y eso es F-151 + una captura distinta,
      no otro motor. Ver §3.19.

F-250 · F-251 · F-252 · F-984 · F-985 · F-987   Gastos y hardware
      ← reutiliza de: abarrotes. NO SE VUELVE A CONSTRUIR.
```

---

## 3 · LAS `[≠]` · mismo nombre, comportamiento distinto

### 3.1 · F-003 · F-007 · Roles y permisos

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Tres roles: dueño, encargado, cajero. El cajero **cobra y despacha a la vez**, porque es la misma persona en el mismo instante | **Cuatro roles: dueño, cajero, MOSTRADORISTA y almacén.** El mostradorista arma la venta y **no puede cobrar**; el cajero cobra y **no puede modificar líneas** | Es un control anti-robo estructural del giro, no una preferencia. Cuando quien elige el producto y quien recibe el dinero son la misma persona, el descuento fantasma y la venta no registrada son triviales. En una ferretería con ticket de $500 y margen del 28%, una venta no registrada al día son miles de pesos al mes. **Separar despacho de cobro es la práctica de la mitad de las ferreterías del país, y el sistema tiene que soportarla, no imponerla** |
| Permiso crítico: `hacer_descuentos` | Permisos críticos: **`dar_credito`**, **`autorizar_sobre_limite`**, **`precio_especial`** | En abarrotes el agujero es el descuento. Aquí el agujero es el crédito: un mostradorista que despacha a cuenta de un contratista sin revisar el saldo cuesta más en una mañana que un año de descuentos fantasma |

**Se construye el tronco de permisos finos (F-007, pendiente en abarrotes) + estos cuatro permisos.**

### 3.2 · F-011 · Impuestos

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Tasa por producto: 0%, 16% y exento**, mezcladas en el mismo ticket, con el algoritmo de extracción por grupo de tasa | **Una sola tasa: 16%.** Todo el catálogo | La LIVA art. 2-A grava a tasa cero alimentos y medicinas. **Nada de lo que vende una ferretería entra ahí.** No es una simplificación de producto: es la ley |
| **IEPS con tres mecánicas** —cuota por litro, ad valorem, cuota por pieza— versionadas por fecha | **Sin IEPS.** Ni una sola clave | Ningún producto ferretero está en el objeto del IEPS |
| IVA **extraído** del precio de anaquel | IVA **extraído** también, **pero con un caso que abarrotes no tiene**: el contratista pide precio "más IVA" | Es la única complicación fiscal propia del giro y es de presentación, no de cálculo. Ver `02-DINERO-Y-CAJA.md` §2.2 |

**Hay que decirlo con todas sus letras:** este modelo **usa menos** del tronco fiscal que su padre. La
tabla `regimenes_ieps` y el algoritmo por grupo de tasa **existen y no se encienden**. Se construyen
en `abarrotes` y aquí se dejan apagados por plantilla, sin borrar nada. Es el ejemplo más limpio de la
regla de D-03: un modelo no se diferencia añadiendo siempre, también se diferencia apagando.

### 3.3 · F-020 · Catálogo de productos

**Ésta es la función que define el modelo, igual que el lector define `abarrotes`.**

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| 800 a 2,500 SKU, que llegan de un archivo con **nombre, marca y EAN** | **3,000 a 8,000 SKU** (Pulpos), y una ferretería mediana llega a 50,000. El nombre **no identifica**: "Tornillo" son 340 claves | Un producto de abarrotes se identifica con su EAN. Un producto de ferretería se identifica con **la combinación de sus atributos**: tipo + medida + material + acabado + marca |
| El producto se encuentra por **código escaneado**; el nombre es el camino de excepción | **Se encuentra por atributos.** El código es uno de cuatro caminos y sirve para **menos de la mitad** del catálogo | Cerca de la mitad de las claves de una ferretería no traen código impreso de fábrica: tornillería a granel, coples, codos, cable, tubo, bisagras, taquetes |
| Un producto, N presentaciones con factor **exacto** | Un producto, N presentaciones, **más una segunda unidad de venta con factor aproximado** (pieza ↔ kilo) | Ver F-151 en §6 |
| El catálogo se completa solo con el **alta rápida desde el código no encontrado** | El alta rápida **existe y no alcanza**: un producto nuevo necesita sus atributos o se pierde en el catálogo para siempre | El alta rápida de abarrotes pide nombre, precio y categoría. Aquí pide además **medida y ubicación**, o el producto queda inencontrable — que es peor que no tenerlo |
| Sin equivalencias | **Con equivalencias y sustitutos** declarados | F-060. *"No tengo la de 1/2, pero la de 13 mm le queda."* Es la venta que se salva |

**Se construye sobre el catálogo de `abarrotes` + atributos (F-059) + equivalencias (F-060) + foto de
mostrador (F-061) + ubicación (F-152).**

### 3.4 · F-021 · Categorías

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Categoría **plana**: refrescos, botanas, abarrote seco. ~25 categorías | **Jerarquía de tres niveles: línea › familia › medida.** Ejemplo: `Fijación › Tornillo tirafondo › 1/4" × 2"` | Con 25 categorías planas y 1,800 productos, cada categoría tiene 70 productos y se navega. Con 25 categorías planas y 6,000 productos, cada una tiene 240 y **no se navega**. La jerarquía no es lujo: es la única manera de que un filtro de dos clics deje 8 resultados en pantalla |
| La categoría carga la **tasa de IVA** y el régimen IEPS | La categoría carga **los atributos que ese tipo de producto tiene** | Un tornillo tiene diámetro, largo, rosca, cabeza, material y acabado. Un cable tiene calibre, número de hilos, forro y color. **La línea define qué campos aparecen**, y sin eso el alta de producto sería un formulario de 40 campos vacíos |
| El margen por categoría es el reporte clave del corte | El margen por **línea** es el reporte clave, **y además la rotación por línea** | Ver §3.37 |

### 3.5 · F-023 · F-025 · Listas de precio y volumen

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Dos listas: público y mayoreo. El mayoreo casi no se usa: nadie compra 24 refrescos | **Cuatro listas vivas: público, contratista, obra y empleado**, y la del contratista se usa **todos los días** | El precio de contratista no es un descuento por volumen: es **un precio distinto para un cliente clasificado**, y el mostradorista no lo decide, lo aplica el sistema al elegir al cliente. Es lo que evita la negociación de mostrador, que es donde se fuga el margen |
| "3 x $25" es la promoción del giro: precio por **cantidad de piezas** | El escalón es **por monto de la venta o por cantidad de la medida**: "de 50 m en adelante, el metro baja" | Se compra por metro y por bulto, no por pieza. Un escalón por piezas no describe la venta |
| El descuento de mostrador está **prohibido al cajero** | El descuento existe, tiene tope por rol, y **el "¿cuánto es lo menos?" es parte del giro** | Ver `02-DINERO-Y-CAJA.md` §3. Aquí no se puede prohibir: se acota y se mide |

### 3.6 · F-028 · Imágenes de producto

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Existe y **se usa poco**: el tendero no sube fotos de 1,800 productos y la búsqueda es por código | **Es un camino de búsqueda de primera clase.** La foto se toma **en el mostrador, con el teléfono, en el momento de dar de alta o de vender** | El cliente no sabe el nombre. Ve la foto y dice "ése". Ocho fotos filtradas por dos atributos resuelven la conversación en cinco segundos, y ninguna descripción de texto lo logra |
| La foto es decorativa | La foto **tiene escala**: se toma con una moneda o una cinta al lado | Para que sirva hay que poder juzgar el tamaño. Es el detalle que separa una galería inútil de una herramienta |

### 3.7 · F-029 · F-986 · Códigos de barras y lector

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Encendida y es la acción principal.** 60%–90% de las líneas entran por el lector | **Encendida y es UNO de cuatro caminos.** Cubre la mitad del catálogo: herramienta empacada, pintura, chapas, material eléctrico de marca | El fabricante codifica lo que va en blíster. Nadie codifica un tornillo suelto ni un metro de cable |
| Un producto, N códigos (pieza, six, caja) — F-147 | **Un producto, N códigos, más un SKU interno impreso por el negocio** para todo lo que no trae código | Y ahí F-058 deja de ser comodidad y pasa a ser requisito de operación: sin etiqueta impresa, la mitad del catálogo **jamás** se puede escanear, ni en la venta ni en el conteo |
| Producto no encontrado → alta rápida con tres campos | Producto no encontrado → alta rápida **con medida y ubicación obligatorias** | Un producto sin medida en una ferretería es un producto que nadie va a volver a encontrar |
| El capturador de teclado, el foco imperdible y la ausencia de *cooldown* | **Idénticos. Se reutilizan tal cual.** | El mecanismo no cambia; cambia cuánto se usa |

**Esto obliga a la reclasificación que `abarrotes` ya había propuesto** (F-029 de `[=]` a `[≠]`) **y le
añade una tercera variante**: apagada (restaurante), completa (abarrotes), **mixta (ferretería)**.

### 3.8 · F-032 · Importación masiva

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Función de vida o muerte: sin ella no hay alta. La plantilla trae **nombre, marca, EAN, categoría, tasa** | Igual de crítica, **y la plantilla es otra**: trae línea, familia, **atributos por línea**, medida, unidad base, presentaciones, ubicación y lista de precios | El catálogo no se captura: **se importa del proveedor**. Truper publica su catálogo con más de 11,000 productos en siete marcas (Truper, Pretul, Volteck, Foset, Fiero, Hermex, Klintek) con 12 centros de distribución, y el ferretero ya lo tiene en PDF o en Excel |
| El origen del archivo es un catálogo genérico de tiendita | **El origen es el catálogo del distribuidor**, y ahí está la oportunidad comercial: importar el catálogo Truper con atributos ya cargados resuelve el 60% del alta en una tarde | Es a este giro lo que el catálogo base de 1,200 productos es a la tiendita: la respuesta a "¿y quién captura?" |

### 3.9 · F-034 · Compatibilidad

| En refaccionaria (el vecino que la tiene) | Aquí | Por qué la diferencia |
|---|---|---|
| Compatibilidad **por vehículo**: año, marca, modelo, motor. Es un árbol cerrado y conocido | Compatibilidad **por medida y por sistema**: qué rosca entra en qué, qué cédula va con qué, qué calibre aguanta cuántos amperes | No hay un árbol cerrado de "equipos". Hay **normas de medida** —NPT, BSP, métrica, AWG, cédula 40— y lo que el sistema declara es la relación entre ellas |
| Es un dato del fabricante | Es un dato que **declara el mostradorista** mientras opera | Nadie publica una tabla de "qué le entra a qué" para una ferretería mexicana. La construye Chava, una línea a la vez, y por eso F-060 tiene que ser de un solo clic o no se va a alimentar nunca |

**Esto obliga a reclasificar F-034** de `[+]` exclusiva a `[≠]` con dos variantes: vehicular y por medida.

### 3.10 · F-058 · Etiquetas

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Sirve para **re-etiquetar precios** que cambiaron y para el granel empaquetado | Sirve para eso **y para existir**: la etiqueta con SKU interno es la única forma de escanear medio catálogo | Es la diferencia entre "útil" y "sin esto no opera" |
| Hoja de etiquetas en PDF es suficiente | **Etiqueta de gaveta**, con SKU, medida, ubicación y precio, más grande que la de anaquel | La etiqueta de una ferretería la lee el empleado desde un metro de distancia buscando en un rack de 60 gavetas. La de abarrotes la lee el cliente a 30 cm |

### 3.11 · F-040 · F-041 · Clientes

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| 95% anónimo. Los 30–40 de la libreta tienen nombre y teléfono | **La mitad del valor pasa por clientes identificados**, con RFC, lista de precio, límite, plazo, obras y **gente autorizada** | El contratista es un cliente en el sentido comercial pleno: negocia precio, pide factura, debe dinero y manda a otros a recoger |
| Historial de compra: casi no se consulta | **Historial de compra: se consulta a diario.** *"¿Qué cable me llevé la otra vez?"* | Es la pregunta que el sistema contesta mejor que la memoria, y la que más rápido convence al contratista de que le den de alta |

### 3.12 · F-102 · Cuándo se descuenta el stock

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Siempre al cobrar**, atómico, dentro de la transacción de cobro. Modelar otro disparador se declaró complejidad innecesaria | **Al cobrar en el 85%, y al ENTREGAR en el resto** | Aquí sí hay hueco entre las dos cosas: la remisión firmada entrega material **sin cobrarlo**, y el pedido especial se cobra con anticipo **y se entrega dos semanas después**. Si el stock sólo bajara al cobrar, el material de las remisiones seguiría "en existencia" mientras va camino a la obra |
| Un disparador | **Tres: cobro, entrega firmada y surtido de pedido** | Y el ledger sigue siendo uno solo. El movimiento se escribe cuando el material **sale físicamente**, que es el criterio honesto |

### 3.13 · F-105 · Almacenes

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Un solo almacén, por decisión explícita.** Dos almacenes obligarían a capturar 10–30 traspasos al día y nadie lo haría | **Dos almacenes, encendidos por omisión: mostrador y bodega de pesado** | Porque aquí el traspaso **no es diario**: el cemento, la varilla, el tubo y la lámina viven en la bodega y **no se mueven al mostrador nunca** — se despachan desde ahí. No hay reposición de anaquel que capturar, hay dos lugares donde vive producto distinto |
| La perilla existe y viene apagada | La perilla existe y viene **encendida**, y se puede apagar en la ferretería chica de un solo local | Es la misma función con el valor por omisión invertido, y la razón es física |

### 3.14 · F-107 · Alertas de mínimo

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| El indicador estrella: 63 productos bajo mínimo, agrupados por proveedor, con el de mañana arriba | **Existe y baja de rango.** El mínimo sirve para las 200 claves de alta rotación; para las otras 5,000 **es ruido** | Un producto que se vende dos veces al año no tiene "mínimo": tiene "uno". Poner alerta de mínimo a 5,000 claves de cola larga produce cien avisos diarios que nadie lee |
| No existe alerta inversa | **La alerta que manda aquí es la inversa: sin movimiento, valuada a costo** | Es el dolor 2. Ver `03-INVENTARIO.md` §8 |
| La sugerencia de pedido se calcula sobre **venta de 14 días** | Sobre **venta de 90 días**, y para la cola larga sobre **12 meses** | El ciclo de compra es quincenal o mensual y la rotación es de 3 a 5 vueltas al año. Catorce días de historia en un producto que se vende cada dos meses no dice nada |

### 3.15 · F-109 · Merma

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Cinco motivos: caducado, dañado en anaquel, roto en traslado, robo detectado, error de captura | **Seis, y uno es nuevo y grande: MERMA DE CORTE** | Cortar cable, lámina, madera o tubo **destruye material**: la sierra se come milímetros, y el pedazo final del rollo no le sirve a nadie. En una tiendita nada se destruye al vender |
| El canje al proveedor es salida sin pérdida (Bimbo se lleva el pan) | **La garantía al proveedor** es la salida sin pérdida (Truper repone la herramienta que falló) | Misma mecánica, distinto disparador y distinto plazo: el pan se canjea mañana, la garantía tarda semanas y hay que poder consultar en qué va |
| "Caducado" es el motivo de mayor monto | **"Merma de corte" y "robo de pieza chica" son los de mayor monto** | Ver `03-INVENTARIO.md` §7 |

### 3.16 · F-121 · Venta en dos unidades

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Se vende **la pieza o la caja**, y el factor es exacto: la caja siempre trae 24 | Se vende **la pieza o el kilo**, y el factor es **aproximado y se deriva del peso** | Un tornillo 1/4" × 2" pesa ~11 g. Un kilo son ~90 tornillos, o 88, o 93. **No hay un factor exacto**, y fingir que lo hay produce un inventario que se desvía sin explicación |
| El ledger se escribe en piezas | El ledger se escribe en **piezas**, y el kilo se convierte al entrar | La decisión importa: si el ledger fuera en gramos, no se podría contestar "cuántos tornillos hay", que es la pregunta del mostrador |
| Una presentación, un precio | La pieza y el kilo tienen precios que **no son proporcionales**: el kilo sale más barato por pieza | Es una decisión comercial consciente y hay que poder expresarla |

**Esto es F-151**, que se declara en §6 porque F-121 tal como está en el catálogo **asume factor exacto**.

### 3.17 · F-144 · Venta a granel

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Granel de comida: frijol, arroz, jamón. Con **tara obligatoria**, porque el cliente trae recipiente | Granel de ferretería: tornillo, clavo, pija, taquete, cadena. **Sin tara** —se pesa en una charola cuya tara es fija— pero **con conversión a piezas a la vista** | El cliente de frijol quiere 800 g. El cliente de tornillos quiere **50 tornillos** y le da igual el peso. La báscula es un instrumento de conteo, no de venta |
| El código de peso embebido (F-148) resuelve el granel empaquetado | **F-148 no aplica.** Nadie empaqueta y etiqueta tornillo en una ferretería de barrio | Se pesa en el momento, frente al cliente |

### 3.18 · F-145 · CORTE DE MATERIAL ★

**No existe en `abarrotes`. Es el delta más visible de este modelo y se construye aquí.**

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **No existe.** Lo más parecido es el granel, donde se toma una porción de un montón | **Se toma una porción de una PIEZA CONTINUA, y el acto de tomarla destruye material y deja un resto** | Pesar 800 g de frijol de un costal de 50 kg no cambia el costal. Cortar 60 m de un rollo de 100 deja un rollo de 40 **y una merma de sierra** — y si el siguiente corte es de 38, deja 2 m que nadie va a comprar |
| — | **Tres variantes físicas distintas**: lineal (cable, manguera, cadena, cuerda), plana (lámina, vidrio, madera, malla) y tubular (tubo, varilla, perfil) | La lineal corta en una dimensión; la plana en dos y el sobrante es un pedazo con forma; la tubular tiene tramo fijo de fábrica —6 m— y el corte deja un tramo corto que sí se vende |
| — | **El rollo abierto es una entidad**, no un número | Diez rollos de 100 m no son 1,000 m indistinguibles: son nueve cerrados y uno abierto con 37 m. Si el sistema sólo guarda 937, el mostradorista no sabe si puede cortar 60 m de un jalón |

**Consecuencia de producto:** la venta de material cortado necesita **una pantalla propia** (ver
`04-INTERFAZ.md` §4.3, pantalla 4), no un campo de cantidad. Y necesita **F-150**, el retazo.

### 3.19 · F-149 · Conteo cíclico

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Una **zona de anaquel** al día, 20 minutos, escanear y teclear cuántos hay | **Una gaveta o un rack al día**, y la captura tiene tres modos: por pieza, **por peso** y por medida | Nadie cuenta 400 tornillos. Se pesa la gaveta y se divide entre el peso por pieza. Es la técnica real del giro y el sistema tiene que soportarla o el conteo no se hace |
| El esperado se sella al abrir la línea | **Idéntico.** Mismo motor, mismo sellado | Se reutiliza tal cual |
| Se cuenta la tienda entera en dos vueltas de dos semanas | Con 6,000 claves, una vuelta completa tarda **tres a cuatro meses** | Y por eso el conteo tiene que priorizarse por **valor**, no por zona: primero las 200 claves que concentran el 60% del dinero. Es el ABC de toda la vida, aplicado al conteo |

### 3.20 · F-117 · F-137 · F-138 · Material por obra

| En constructora (dueña de V8) | Aquí | Por qué la diferencia |
|---|---|---|
| El material es **propio** y se asigna a un proyecto propio. La requisición es interna | El material es **vendido** y se asigna a la obra **del cliente**, para poder cobrarle y para poder recibirle el sobrante | La ferretería no ejecuta la obra: la surte. Lo que necesita es separar el saldo y el consumo por obra, no controlar avance |
| La devolución de sobrante regresa al almacén propio | **La devolución de sobrante es una devolución de venta** que además baja el saldo de crédito de esa obra | *"Me sobraron 8 sacos de cemento, te los regreso"* es semanal y hoy se resuelve tachando la libreta |

### 3.21 · F-119 · Renta de herramienta

| En renta-equipo (dueña de V10) | Aquí | Por qué la diferencia |
|---|---|---|
| Es el negocio entero: catálogo de activos, disponibilidad por fecha, contrato, mantenimiento | **Son seis u ocho herramientas** —rotomartillo, pulidora, cortadora, andamio— rentadas por día, **sin reserva anticipada** | Nadie reserva un rotomartillo con tres días de anticipación. Llega, está o no está, se lleva |
| El depósito es parte del contrato formal | **El depósito es efectivo en el cajón** y se comporta exactamente como el casco de `abarrotes` (F-256): entra dinero que no es venta y hay que devolverlo | Se reutiliza el mecanismo de F-256 con otro nombre en pantalla. **Es el único lugar donde F-256 se enciende en este modelo** |
| Estado de salida y retorno con fotos | Igual, y **es lo que evita el pleito**: la pulidora se fue con disco y regresó sin él | F-141 se reutiliza tal cual |

### 3.22 · F-127 · Garantía

| En electrónica-celulares | Aquí | Por qué la diferencia |
|---|---|---|
| Garantía ligada al IMEI, con expediente y reparación propia | Garantía ligada a la **factura o al ticket**, y el que repone es **el proveedor**, no la ferretería | Beto no repara un taladro: lo manda a Truper y le dan otro. Lo que necesita es **saber en qué va cada garantía abierta y cuánto dinero tiene detenido ahí** |
| La serie se captura siempre | La serie se captura **sólo en herramienta eléctrica**, que son ~200 claves de 6,000 | Pedir serie en un tornillo es absurdo. La perilla es **por línea**, no global |

### 3.23 · F-200 · Carrito

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Vive 10 a 40 segundos, se arma **sólo con el lector**, 1 a 25 líneas, la línea repetida se agrupa | Vive **3 a 8 minutos**, se arma **buscando**, 1 a 40 líneas, y **las líneas se editan, se quitan y se cambian** mientras el cliente decide | El cliente cambia de opinión: *"mejor el de 3/8"*. En abarrotes eso no pasa: nadie cambia una Coca por otra |
| Sin bloqueo salvo restricción legal | **Con avisos por línea**: sin existencia, corte de rollo abierto, precio por debajo del costo, cliente sobre su límite | Cuatro avisos distintos, ninguno de ellos bloqueante salvo el último con permiso |
| Una línea cabe en 32 px | **Una línea necesita dos renglones**: descripción con medida arriba, cantidad · unidad · origen del corte abajo | *"Cable THW cal. 12 negro · 60.00 m · rollo R-114"* no cabe en un renglón y perder ese dato hace incobrable la diferencia del conteo |

### 3.24 · F-201 · Búsqueda rápida ★

**Ésta y F-145 son las dos funciones por las que este modelo existe.**

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Cuatro caminos en este orden:** código escaneado, código tecleado, nombre o marca, teclas F1–F8 | **Cuatro caminos en OTRO orden:** (1) **atributos de medida**, (2) nombre o marca, (3) código escaneado, (4) **foto** | El orden es la diferencia. Allá el código va primero porque existe; aquí va tercero porque cubre medio catálogo |
| El 80% de las líneas son **30 productos**, y ésos merecen una tecla | **No hay 30 productos que sean el 80%.** La venta está repartida entre cientos de claves | Por eso las teclas rápidas F1–F8 **se sustituyen por los ocho grupos de línea**: Fijación, Eléctrico, Plomería, Pintura, Herramienta, Cerrajería, Construcción, Jardín. No son productos: son puntos de partida del filtrado |
| Índice en memoria con **código exacto en O(1)** | Índice en memoria con **búsqueda por atributos y tolerancia a la escritura**: `1/4 x 2`, `1/4x2`, `.25x2`, `6.35 x 50mm` son lo mismo | Es el trabajo técnico más fino de la carpeta. Un buscador que no normaliza fracciones y milímetros no sirve en este giro |
| Producto no encontrado → alta rápida | Producto no encontrado → **primero equivalentes**, después alta rápida | Si no tengo el de 1/2 pero sí el de 13 mm, enseñar el alta rápida en vez del equivalente **pierde la venta** |
| La búsqueda devuelve un producto | La búsqueda devuelve **una tabla comparable**: medida, marca, precio, existencia y **ubicación** | Porque la conversación es de comparación, no de identificación |

### 3.25 · F-202 · F-203 · Descuentos

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **El cajero no debe tener descuento, punto.** Margen del 20%, 220 tickets, $3 por ticket son $660 al día invisibles | **El mostradorista sí tiene descuento, con tope** | Porque el *"¿cuánto es lo menos?"* es parte de la venta de mostrador de este giro y prohibirlo manda al cliente a la ferretería de enfrente. Lo que se hace es **acotarlo por rol y por línea** y medirlo por persona |
| Tope propuesto: cajero 0%, encargado 5%, dueño sin tope | Tope propuesto **por línea, no global**: 3% en eléctrico y plomería (margen 14–15%), 8% en pintura y tornillería (26–50%), 5% en herramienta | Un tope único del 5% regala la mitad de la utilidad en plomería y no alcanza para cerrar una venta de pintura. **El tope sale del margen de la línea, que es un dato que el sistema ya tiene** |

### 3.26 · F-212 · Transferencia

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| 3%–10% de los tickets. Riesgo: el comprobante falso. Se marca como pendiente de confirmar | **20%–35% del valor**, y es el método normal del contratista | El monto cambia el riesgo: un comprobante falso de $80 es una molestia; uno de $12,000 es un problema. **La venta con transferencia pendiente de confirmar queda listada en el corte y bloquea la aplicación al saldo del cliente hasta que alguien la confirme** |

### 3.27 · F-220 · Ticket

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Un solo documento.** No siempre se imprime: en tickets de $20 el cliente no lo quiere | **Tres documentos** y se imprime **siempre**: ticket, **remisión firmada** y factura | Con ticket promedio de ~$500 y devoluciones diarias, el comprobante es la condición para devolver. Y la remisión es el único papel que demuestra quién se llevó qué |
| Lleva ahorro del día, saldo de fiado y casco | Lleva **la medida exacta de cada línea**, el saldo de la cuenta, **la obra** si aplica, y la leyenda de política de devolución | *"60.00 m"* tiene que estar impreso o la devolución es una discusión |

### 3.28 · F-222 · Devolución ★

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Frecuencia: una o dos por semana. Casi siempre **cambio de producto** por defecto | **Frecuencia: dos a cinco al día**, y el motivo dominante es **"no era la medida"** | Es la consecuencia directa de que el cliente no supiera qué necesitaba. **Una devolución aquí no es una falla: es parte del ciclo normal de la asesoría** |
| El producto vuelve al anaquel o se va a merma, y hay que decidirlo | **Tres destinos, no dos:** vuelve vendible, vuelve **dañado y con descuento**, o no vuelve | El taquete que ya se metió a la pared regresa raspado. El tubo que ya se cortó **no regresa nunca**, y eso hay que decirlo en la política, no descubrirlo en el mostrador |
| La devolución de casco sin venta de por medio | La **devolución de sobrante de obra** sin ticket individual: *"de todo lo que me llevé la semana pasada, me sobraron 8 sacos"* | Se aplica contra el saldo de esa obra, no contra un folio. F-138 + F-639 |
| No hay política escrita | **Hay política y se imprime.** En México no existe obligación general de aceptar devoluciones por arrepentimiento salvo que el comercio la ofrezca o el producto esté defectuoso; las ferreterías publican plazos de 24 horas a 15 días | El sistema **configura el plazo** y avisa cuando un ticket ya está fuera. No decide: informa |

### 3.29 · F-224 · Venta suspendida

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| *"Ahorita vengo, se me olvidó la cartera."* Se suspende y se retoma en minutos | *"Voy a medir y vuelvo."* Se suspende y se retoma **al día siguiente** | Cambia la vigencia y cambia si el material se aparta o no. Una venta suspendida que aparta stock por 24 horas es un problema si son los últimos 3 m de cable |
| La regla de cierre: no se puede cerrar con ventas en espera | **Misma regla**, más un aviso: las suspendidas de más de N horas se liberan solas y avisan | Sin caducidad automática, a los tres meses hay 40 ventas suspendidas apartando material que sí está en el anaquel |

### 3.30 · F-234 · Corte diario y su PDF ★

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Contesta: **¿cuadró la caja y qué producto falta?** | Contesta: **¿cuadró la caja, cuánto material salió sin cobrarse hoy, y a quién?** | Porque el riesgo económico dominante cambió de lugar. En una tiendita el dinero se va en pieza chica; aquí se va **en crédito que no vuelve** |
| Sección estrella: **movimiento de existencia y faltantes** | Sección estrella: **salió y no se cobró** — remisiones, crédito otorgado, apartados, garantías detenidas | Y el faltante por producto **sigue estando**, en segundo lugar, porque el robo hormiga existe aquí también |
| Lleva **dinero en tránsito** (recargas, servicios) | **No lleva.** F-255 apagada | Regla 4 del corte: lo que no aplica no aparece ni en cero |
| Sin corte de material | Lleva **material cortado hoy y su merma de corte** | Es donde se detecta si alguien está cortando de más y llevándose el resto |
| Sin venta por persona | Lleva **venta y margen por mostradorista** | Ver §3.38 |

**Documento completo, sección por sección, en `02-DINERO-Y-CAJA.md` §9.**

### 3.31 · F-235 · Varias cajas

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Apagada por omisión.** Un mostrador, un cajón, una persona | **Encendida por omisión en el modo despacho+caja**, que es el modo recomendado | Porque no son dos cajas: es **una caja y N mostradores que generan notas**. La nota de mostrador no toca dinero; la caja cobra la nota. Es un flujo distinto y es el control anti-robo del giro |

### 3.32 · F-254 · Cobro de crédito en caja

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| El abono se aplica **al saldo, más viejo primero**, sin documento de por medio | El pago se aplica **a documentos concretos**: remisiones y facturas, elegidas por el cliente | El contratista dice *"te pago la remisión 4412 y la 4418, las otras cuando me paguen la obra"*. Aplicarlo al saldo más viejo **le rompe la conciliación** con su propio cliente |
| El abono siempre es efectivo o tarjeta | **La mayoría son transferencias**, y llegan **sin que nadie esté en el mostrador** | Un pago que entra al banco y no al cajón no es un movimiento de caja. Hay que poder registrarlo **fuera de la sesión de caja** sin romper el arqueo |

### 3.33 · F-606 · Remisión de entrega ★

| En el tronco A5 | Aquí | Por qué la diferencia |
|---|---|---|
| La remisión documenta la entrega de un **pedido** previamente cotizado y aprobado | Aquí la remisión es **el documento de mostrador más importante del día**, y casi nunca viene de un pedido: nace de una venta normal que se va a crédito | Es *"llévatelo, firma aquí"*. Sale material, no entra dinero, y el que firma **puede no ser el deudor** |
| Se firma al recibir | Se firma **en el mostrador, en papel o en pantalla**, y se guarda el nombre de **quién** firmó de entre los autorizados | Es la prueba del dolor 1. Sin el nombre del que firmó, la cuenta es impugnable |

### 3.34 · F-610 · F-611 · F-614 · F-617 · Crédito

| En abarrotes (fiado de libreta) | Aquí (crédito de contratista) | Por qué la diferencia |
|---|---|---|
| **Límite en la cabeza del dueño**, sin plazo escrito, sin documento, abonos de $50 | **Límite asignado, plazo real de 15 a 30 días, documentos** (remisiones y facturas) y pagos de miles | El sector construcción cobra a 60–120 días y el ferretero financia esa brecha. No es un favor al vecino: es una condición comercial |
| El bloqueo por mora es **un aviso, no un muro** | El bloqueo por mora es **un muro con llave**: se detiene el despacho y sólo el dueño lo levanta, con su PIN y con el motivo en la bitácora | Aquí sí hay que poder frenar, porque el monto de un solo despacho puede ser de $15,000. Pero **la llave existe siempre**: la decisión de seguir surtiendo es de Beto, no del software |
| Los abonos se aplican al saldo, más viejo primero | Los pagos se aplican **a documentos elegidos** | §3.32 |
| Sin terceros | **Con autorizados** (F-638) y **con obras** (F-639) | Son las dos puertas por las que se pierde el dinero |

### 3.35 · F-630 · F-631 · F-632 · Compras

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Doce proveedores con doce ritmos**, de los cuales varios llegan a diario. La compra ocurre de pie, 12 veces por semana | **Seis a diez proveedores**, y uno solo —el distribuidor Truper— puede ser el 40% de la compra. Ritmo **quincenal o mensual**, con pedidos de 150 a 300 líneas | Cambia el problema por completo: allá es capturar rápido mil veces; aquí es **capturar bien una vez cada quince días, 200 líneas**. La importación de la nota del proveedor en archivo deja de ser lujo |
| La entrada trae **canje** en la misma nota (Bimbo se lleva el pan) | La entrada **no trae canje**, pero el ciclo de **garantía** sí necesita su propio seguimiento | Truper no recoge producto caducado; repone producto fallado, y eso tarda |
| Sugerencia de pedido sobre **14 días** de venta | Sugerencia sobre **90 días**, y **con el dinero dormido al lado de cada línea** | Es lo que evita volver a comprar lo que ya está parado, que es el dolor 2 |
| Crédito de proveedor de 8 a 30 días | Crédito de proveedor de **30 a 60 días** en el distribuidor grande, contado en el local | Y por eso F-635 aquí **no es opcional**: ver §3.36 |

### 3.36 · F-635 · F-636 · Cuentas por pagar y comparativo

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| F-635 quedó en la **tanda 5** y su propio `FILE-MAP` reconoce que debería estar antes | Aquí está en la **tanda 2** y es obligatoria | Porque el ferretero vive con el crédito de sus proveedores y el de sus clientes al mismo tiempo, y las dos brechas se cruzan: le pagan a 60 días y tiene que pagar a 30. **Sin cuentas por pagar el sistema no puede contestar la pregunta que le quita el sueño**, que es si va a tener con qué pagar el día 30 |
| Comparativo de precios entre proveedores: útil | **Crítico.** El mismo tornillo lo tiene el distribuidor Truper, el mayorista local y el de la central | Con márgenes de 14% en plomería, dos puntos de diferencia en el costo son el 15% de la utilidad de la línea |

### 3.37 · F-051 · F-052 · Reportes de venta y margen

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Más vendidos** es el reporte natural, y el de menos vendidos se menciona de paso | **El reporte que importa es el de MENOS vendidos**, valuado a costo y ordenado por dinero | Con 1,800 SKU de alta rotación, lo que sobra es poco. Con 6,000 y tres vueltas al año, **lo que sobra es la mitad del capital**. Es el dolor 2 |
| Margen **por categoría**, para decidir surtido | Margen **por línea y por familia**, y **margen por venta** | Porque aquí el mostradorista negocia precio y hay que poder ver el margen de la venta, no sólo el del producto |
| Sin rotación | **Rotación y días de inventario por línea** | Es el número que traduce "tengo mucho" en "tengo dinero parado seis meses" |

### 3.38 · F-054 · Ventas por empleado

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Prohibida en el dashboard, con nombre y apellido:** *"son tres personas y él las conoce"*. Lo que sí importa —cancelaciones y descuentos por persona— va al corte como control | **Obligatoria en el dashboard**, y no como control sino como **medida de capacidad de venta** | Porque aquí el empleado **no es intercambiable**. Chava y Diego venden lo mismo con resultados distintos, y la diferencia se llama asesoría. El número que importa no es cuánto cobró cada uno: es **ticket promedio, líneas por venta y margen por mostradorista** |
| El cajero es un operador | El mostradorista es **el producto** | Y si el sistema no lo mide, no se puede saber si las listas de materiales y las equivalencias (F-153, F-060) están funcionando, que es toda la apuesta del dolor 3 |

**La trampa que hay que evitar, y hay que escribirla:** medir a las personas invita a comisionarlas.
`02-DINERO-Y-CAJA.md` §7 explica por qué eso sería un error en este giro concreto.

### 3.39 · F-056 · Dashboard

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| **Siete indicadores**, diseñados primero para 390 px, leídos dos veces al día por el dueño en el teléfono | **Ocho indicadores**, diseñados primero para **PC**, leídos por el dueño que **está en el negocio todo el día** | Beto no está arriba viendo el celular: está en el mostrador. El dashboard es de escritorio y la versión de teléfono se deriva |
| Indicador 3, el más grande: **qué pedir** | Indicador 1: **lo que me deben y lo que vence**. Indicador 2: **dinero dormido** | El orden de los indicadores **es** el orden de los dolores, y los dolores cambiaron |
| Cambia entre las 6:50 y las 22:45 | **Cambia entre el lunes y el sábado**, no entre la mañana y la noche | Ver `04-INTERFAZ.md` §4.4 |

### 3.40 · F-940 · F-942 · F-943 · Facturación

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| La factura es **excepcional**; lo obligatorio es la **global mensual** de RESICO | La factura es **normal**: el contratista deduce, y una parte importante del valor se factura nominativamente | Cambia la carga operativa: allá se timbra una vez al mes, aquí decenas de veces a la semana, y **hay que hacerlo desde el mostrador sin detener la venta** |
| El desglose fiscal difícil es **por tasa** (0% y 16%) | El desglose difícil es **por `ClaveUnidad`**: H87 pieza, MTR metro, KGM kilogramo, LTR litro, KT kit, de un catálogo SAT de más de 2,400 claves | Facturar por pieza lo que se vendió por metro genera un CFDI que el cliente no puede deducir bien. **La clave tiene que salir del producto automáticamente**, sin que el cajero sepa de esto |
| Complemento de pago: no aplica, se cobra de contado | **Complemento de pago obligatorio**: se factura a crédito y se paga después, en parcialidades | Es una función que en `abarrotes` está en el catálogo y no se usa; aquí es parte del día |
| Global **mensual** | Global **diaria o semanal** del público en general, más las nominativas | El régimen del negocio es distinto: una ferretería de este tamaño rara vez cabe en RESICO |

### 3.41 · F-822 · Costo de envío

| En el tronco (delivery de comida) | Aquí | Por qué la diferencia |
|---|---|---|
| Costo por zona, sobre un pedido chico y ligero | **Costo por zona y por peso/volumen**, y muchas veces **gratis arriba de $N** | Entregar 30 bultos de cemento a ocho cuadras no cuesta lo mismo que entregar dos cubetas de pintura. Y el flete gratis es la herramienta comercial del giro contra las cadenas |

### 3.42 · F-988 · Venta sin conexión

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Crítica y urgente: sin internet la tiendita **no puede dejar de vender** y son 220 tickets | **Importante y menos urgente**: con 40 ventas al día y ritmo sostenido, media hora sin sistema se sobrelleva con el talonario | Y hay una razón más de fondo: aquí **no se puede vender a crédito sin conexión** — sin saldo actualizado, despachar a cuenta es exactamente el error que el sistema viene a evitar. La propuesta es: **sin conexión se vende de contado y se bloquea el crédito** |

### 3.43 · F-983 · Báscula

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| La báscula **determina el precio**: 0.847 kg de frijol × $32/kg | La báscula **determina la cantidad de piezas**: 1.05 kg ÷ 11 g = 95 tornillos, y el precio puede ser por pieza o por kilo | Es un instrumento de conteo, no de cobro. Y sirve además para el **conteo cíclico**: pesar la gaveta es cómo se cuenta |
| Con tara del recipiente del cliente | Con **tara fija de la charola del mostrador**, configurada una vez | El cliente no trae recipiente |

---

## 4 · LAS `[+]` · exclusivas o que nacen aquí

```
F-145   Corte de material  (el ID existe en el catálogo; el comportamiento nace AQUÍ)
      Lo heredan merceria-telas (corte lineal), carpinteria-herreria y
      fabrica-muebles (corte plano), materiales-construccion (tubular)
      y vidrieria si algún día existe. Ningún modelo de alimentos ni de
      servicios lo necesita: nadie corta un platillo de un rollo.

F-150   Retazo y sobrante de corte
      Exclusiva de los giros que cortan. Es la mitad invisible de F-145:
      sin ella, el inventario de material lineal se desvía desde la
      primera semana y nadie sabe por qué.

F-151   Doble unidad con conversión por peso
      Exclusiva de tornillería, clavo, cadena y alambre. F-121 del
      catálogo asume factor exacto y aquí el factor es una medición.
      La heredan materiales-construccion y agroveterinaria (semilla).

F-059   Atributos técnicos de medida
      Exclusiva de los giros donde el producto se identifica por su
      medida y no por su nombre: ferretería, refaccionaria, materiales,
      mercería, óptica (graduación) y electrónica (valores de componente).
      Es el modelo de catálogo que `abarrotes` NO necesita.

F-060   Equivalencias y sustitutos
      Misma familia que F-059. Nace aquí porque aquí el sustituto SALVA
      la venta; en abarrotes, si no hay Coca, hay Pepsi y no hace falta
      que el sistema lo diga.

F-061   Foto de mostrador y búsqueda visual asistida
      Exclusiva de los giros donde el cliente trae la pieza en la mano.

F-152   Ubicación física de la pieza
      Exclusiva de los catálogos grandes con producto chico: ferretería,
      refaccionaria, mercería, papelería grande. Con 1,800 SKU en tres
      pasillos no hace falta; con 6,000 en 60 gavetas, sin esto el
      empleado nuevo no sirve.

F-153   Lista de materiales por trabajo
      Exclusiva de los giros que venden soluciones armadas por el
      mostrador: ferretería, materiales, agroveterinaria (tratamientos).
      Es donde se guarda lo que sabe Chava.

F-258   Servicio de mostrador
      Exclusiva del mostrador que trabaja: ferretería, papelería (copias
      e impresión), mercería (corte y ojales), vidriería. Comparte la
      idea de "ingreso que no es venta de producto" con F-255, pero al
      revés: allá la tienda no hace nada y sólo cobra comisión; aquí la
      tienda hace algo y consume material propio.

F-638   Autorizados a cargar en cuenta
      Exclusiva del crédito B2B con terceros que recogen: ferretería,
      materiales, distribuidora, refaccionaria (el que manda al chalán).
      Es la puerta de pérdida número uno del giro y no existe ningún ID.

F-639   Subcuenta por obra del cliente
      Exclusiva de los giros que surten proyectos ajenos: ferretería,
      materiales, carpintería, imprenta (por campaña).
```

---

## 5 · LO QUE FALTA · pendientes de este modelo

La Broca opera hoy en `operativo` —la plantilla que por D-01 se renombra `cafeteria`—, es decir, en un
paquete **hecho para un negocio de alimentos de mostrador**, con recetas, portal QR y sin nada de lo
que necesita. D-01 la manda a `tienda` provisional. Esto es lo que falta para que exista `ferreteria`.

| ID | Función | Qué duele hoy sin ella |
|---|---|---|
| **F-059 · F-201** | Atributos y búsqueda por medida | **Sin esto no hay modelo.** Hoy la búsqueda es por nombre, y "tornillo" devuelve 340 resultados sin orden. El mostradorista no va a usar el sistema, va a usar su memoria, y en ese momento todo lo demás —inventario, margen, faltantes— se vuelve ficción |
| **F-145 · F-150** | Corte de material y retazo | El cable, la manguera, la cadena y la lámina **no se pueden vender** hoy sin inventar un producto por cada medida. Es lo que hace que un ferretero pruebe un sistema dos meses y lo deje |
| **F-151** | Pieza ↔ kilo | El tornillo se vende de las dos formas el mismo día. Hoy hay que duplicar la clave, y con la clave duplicada **el conteo nunca cuadra** — es el error documentado del giro |
| **F-152** | Ubicación | Con 6,000 claves, el empleado nuevo tarda seis meses en ser útil y mientras tanto dice "no hay" a producto que sí hay |
| **F-610…F-617 · F-638 · F-639** | Crédito con autorizados y obra | **Es el dolor 1 completo.** Hoy es una libreta y un talonario de papel carbón, y las tres puertas de pérdida están abiertas |
| **F-606** | Remisión firmada | El documento más importante del día no existe en el sistema |
| **F-600…F-607** | Cotización | La venta grande se cotiza en una hoja de Excel de Norma y se pierde el seguimiento. No se sabe cuántas se ganan ni cuántas se pierden ni por qué |
| **F-103 · F-051 inverso** | Kardex y sin movimiento valuado | **Es el dolor 2 completo.** Hoy Beto no puede saber cuánto dinero tiene dormido ni en qué |
| **F-635** | Cuentas por pagar | No sabe cuánto debe. Con crédito de 30 a 60 días del distribuidor, es la mitad de su flujo |
| **F-940…F-945** | CFDI con `ClaveUnidad` y complemento de pago | Norma factura a mano en el portal del SAT. Es horas a la semana y es donde se equivoca la clave de unidad |
| **F-060 · F-061 · F-153** | Equivalencias, foto y listas de trabajo | El dolor 3, y el riesgo de que el conocimiento se vaya con Chava |
| **F-258** | Servicio de mostrador | Las copias de llave y el entonado hoy se cobran "aparte" y no están en ninguna venta ni en ningún margen |
| **F-017** | Diccionario de vocabulario | `abarrotes` advirtió que este modelo lo iba a romper. Lo rompe: "artículo" donde debe decir "material", "producto" donde debe decir "pieza" |

---

## 6 · FUNCIONES QUE FALTAN EN EL CATÁLOGO

**Ya están en `03-CATALOGO-DE-FUNCIONES.md`**, junto con las diez de `abarrotes`. Sin ID canónico se
iban a reinventar con otro nombre en `materiales-construccion`, en `refaccionaria` y en
`merceria-telas`.

> **Reconciliado el 14-09-2026 (D-11).** Este modelo **conservó sus diez IDs** (F-059, F-060,
> F-061, F-150, F-151, F-152, F-153, F-258, F-638, F-639) y sus tres reclasificaciones se aplicaron
> tal cual: **F-034** pasa a `[≠]`, **F-121** pasa a `[≠]`, y **F-029** suma su tercera variante
> (catálogo mixto con SKU interno impreso).
>
> Un cambio: lo que este modelo llamaba **«F-254 · cobro de crédito en caja»** y `abarrotes` llamaba
> **«cobro de fiado en caja»** resultaron ser **la misma función**, y se fusionaron en un solo
> F-254. Es trabajo ahorrado: una tabla, un comando y una pantalla en vez de dos. Que una carpeta
> diga «crédito» y la otra «fiado» lo resuelve el diccionario de vocabulario (F-017), no un ID
> nuevo.

| ID propuesto | Función | Bloque | Por qué hace falta |
|---|---|---|---|
| **F-059** | **Atributos técnicos de medida como eje del catálogo** | F-0xx · depende de F-021 | Un producto de ferretería **no tiene nombre útil**: tiene una combinación de atributos. `Tornillo · tirafondo · 1/4" · 2" · galvanizado · cabeza hexagonal`. F-020 modela nombre, código y precio; no modela atributos tipados por línea, ni la normalización entre fracción de pulgada, decimal y milímetro —`1/4"`, `.25`, `6.35 mm` son el mismo dato y tres escrituras—. Sin esto la búsqueda no funciona, y sin búsqueda no hay modelo |
| **F-060** | **Equivalencias y sustitutos entre productos** | F-0xx · depende de F-059 | *"No tengo la de 1/2 pero la de 13 mm le sirve."* Es una venta salvada varias veces al día y es conocimiento que hoy vive en una sola cabeza. No lo cubre F-034 (compatibilidad), que dice **con qué es compatible**; esto dice **qué puede reemplazarlo**. Tiene que capturarse **en un clic desde el resultado de búsqueda**, mientras se opera, o nunca se va a alimentar |
| **F-061** | **Foto de mostrador y búsqueda visual asistida** | F-0xx · depende de F-028, F-059 | El cliente trae la pieza en la mano. La foto se toma en el mostrador con el teléfono, **con referencia de escala**, y la búsqueda visual consiste en **filtrar por dos atributos y mostrar ocho fotos grandes** para que el cliente señale. **Deliberadamente NO es reconocimiento de imagen por aprendizaje automático**: una ferretería no puede etiquetar un conjunto de entrenamiento y un modelo que falla en el mostrador destruye la confianza más rápido de lo que la construye. Se declara así para que nadie lo "mejore" después |
| **F-150** | **Retazo y sobrante de corte** | F-1xx · depende de F-145 | El rollo de 100 m del que se cortaron 60 y luego 38 deja **2 m que no le sirven a nadie**. Físicamente existen, valen dinero a costo, y no son vendibles a precio de lista. Necesita: marcar el sobrante, ponerle precio de remate, y **dar de baja el retazo invendible como merma de corte**. Sin este ID, el sobrante o infla la existencia (y produce un faltante fantasma en el conteo) o se borra a mano (y descuadra el costo) |
| **F-151** | **Doble unidad de venta con conversión por peso** | F-1xx · depende de F-112, F-983 | El tornillo se vende **por pieza y por kilo el mismo día**. F-121 (venta en dos unidades) asume el factor exacto de la caja de 24. Aquí el factor es **el peso por pieza**, medido, con desviación real de 3%–8% entre lotes. Necesita: peso por pieza como atributo, recalibración desde una pesada de referencia, y **tolerancia declarada** para que el conteo no marque faltante por redondeo. Sin esto, el ferretero duplica la clave —"tornillo por pieza" y "tornillo por kilo"— y ése es **el error de inventario número uno documentado del giro** |
| **F-152** | **Ubicación física de la pieza** | F-1xx | *"¿Dónde está el tornillo 1/4 × 2?"* Con 3,000 a 8,000 claves en gavetas, racks y pasillos, **encontrar es la mitad del trabajo**. `abarrotes` tiene `zona` (F-149) y no sirve para esto: la zona existe **para contar**, una vez al día, por el encargado; la ubicación existe **para vender**, sesenta veces al día, por el mostradorista, y se imprime en la etiqueta, aparece en el resultado de búsqueda y va en la orden de surtido. Distinto propósito, distinto usuario, distinta frecuencia: función distinta |
| **F-153** | **Lista de materiales por trabajo** | F-1xx · depende de F-020 | *"Para instalar un tinaco te llevas: flotador, conector, teflón, 2 m de manguera, abrazaderas, llave de paso…"* Es una **lista sugerida y editable** que se vuelca al carrito como líneas independientes, no un kit que se vende como una pieza (eso es F-031). Sirve para tres cosas: vender completo, evitar que el cliente regrese enojado porque le faltó una pieza, y —lo más importante— **guardar el conocimiento del mostradorista experto en un lugar que no sea su cabeza**. Es la respuesta al riesgo de que Chava se jubile |
| **F-258** | **Servicio de mostrador con material y mano de obra** | F-2xx | Copia de llave, entonado de pintura, corte de vidrio y madera a medida, cuerda a tubo. **Consume material propio del inventario y cobra mano de obra**, todo en la misma línea de venta, sin orden de trabajo de por medio (eso es F-507, de A4). No lo cubre F-255, que es dinero ajeno en tránsito donde el negocio no hace nada; aquí el negocio trabaja. Puede ser 4%–8% de la venta con margen de 60%–80%, y hoy no está en ningún reporte de ningún sistema del segmento |
| **F-638** | **Autorizados a cargar en cuenta** | F-6xx · depende de F-610 | El contratista autoriza a tres albañiles a llevarse material a su nombre. El cuarto no está autorizado y se lleva $6,000. Cuando llega la cuenta, el contratista la desconoce **y tiene razón**. Necesita: lista de autorizados por cliente y por obra, tope por autorizado, captura de quién firmó la remisión, y **aviso en el mostrador cuando quien pide no está en la lista**. Es la puerta de pérdida número uno del giro y **no existe ningún ID en el catálogo para terceros que retiran a cuenta de otro** |
| **F-639** | **Subcuenta por obra del cliente** | F-6xx · depende de F-610, F-612 | El ingeniero Loera lleva tres obras y le pagaron una. Sin separación por obra, el estado de cuenta es un número grande y la conversación de cobro es imposible; con separación, es *"de la obra de Las Torres me debes $18,400 y ésa ya te la pagaron"*. Además la necesita el cliente para su propia contabilidad de obra. No lo cubre F-117/F-137, que es material **propio** asignado a proyecto **propio** |

**Y tres reclasificaciones del catálogo que este modelo obliga, además de las dos que ya pidió `abarrotes`:**

1. **F-034** (compatibilidad) deja de ser `[+]` exclusiva y pasa a `[≠]` con dos variantes: **vehicular**
   (refaccionaria) y **por medida y sistema** (ferretería, plomería, materiales).
2. **F-029** (códigos de barras): `abarrotes` ya pidió pasarla de `[=]` a `[≠]`. Este modelo **añade la
   tercera variante**: catálogo **mixto**, con SKU interno impreso por el negocio para la mitad que no
   trae código de fábrica.
3. **F-121** (venta en dos unidades) deja de ser `[+]` con factor exacto y pasa a `[≠]` con dos
   variantes: **factor exacto** (abarrotes: caja = 24) y **factor por peso** (ferretería: F-151).

---

## 7 · DEPENDENCIAS

Las flechas se leen "necesita". Sólo se listan las propias; las heredadas están en `abarrotes` §7.

```
F-059 Atributos técnicos
  → F-021 Categorías jerárquicas   (la línea define qué atributos existen)
  → F-032 Importación masiva       (los atributos llegan del catálogo del proveedor)

F-201 Búsqueda por medida
  → F-059 Atributos                (no hay nada que filtrar sin ellos)
  → F-060 Equivalencias            (el "no tengo, pero" es parte del resultado)
  → F-152 Ubicación                (el resultado sin ubicación no termina la venta)

F-060 Equivalencias
  → F-059 Atributos                (la equivalencia se declara entre medidas)
  → F-201 Búsqueda                 (se captura DESDE el resultado, con un clic)

F-061 Foto de mostrador
  → F-028 Imágenes                 (ya existe el almacenamiento)
  → F-059 Atributos                (la foto sin filtro previo es una galería inútil)

F-145 Corte de material
  → F-112 Presentaciones           (el rollo es una presentación con factor)
  → F-101 Ledger                   (el corte escribe DOS movimientos: venta y merma)
  → F-150 Retazo                   (sin esto el inventario de material se desvía)

F-150 Retazo
  → F-145 Corte
  → F-109 Merma                    (el retazo invendible sale por merma de corte)
  → F-023 Listas de precio         (el sobrante vendible lleva precio de remate)

F-151 Pieza ↔ kilo
  → F-112 Presentaciones
  → F-983 Báscula                  (el peso por pieza se calibra pesando)
  → F-149 Conteo                   (contar por peso ES este mecanismo)

F-152 Ubicación
  → F-020 Catálogo                 (columna nueva)
  → F-058 Etiquetas                (la ubicación se imprime en la etiqueta de gaveta)

F-153 Listas de materiales
  → F-020 Catálogo
  → F-200 Carrito                  (se vuelca como líneas editables, no como un kit)

F-258 Servicio de mostrador
  → F-020 Catálogo                 (el servicio es un producto de tipo distinto)
  → F-101 Ledger                   (consume material propio: escribe salida)
  → F-052 Margen                   (su margen es otro y hay que separarlo)

F-606 Remisión firmada
  → F-610 Crédito                  (tiene que existir la cuenta)
  → F-638 Autorizados              (hay que saber quién puede firmar)
  → F-102 Descuento de stock       (la entrega descuenta, aunque no se cobre)

F-638 Autorizados
  → F-610 Límite de crédito
  → F-040 Clientes en el puente    (hoy NO está declarada, igual que en abarrotes)

F-639 Subcuenta por obra
  → F-610 Crédito
  → F-612 Estado de cuenta
  → F-614 Aplicación de pagos      (el pago se aplica a documentos DE UNA OBRA)

F-234 El corte de ferretería
  → F-606 Remisiones               (la sección estrella es "salió y no se cobró")
  → F-145 Corte de material        (material cortado y su merma)
  → F-054 Venta por mostradorista

F-940 CFDI
  → F-059 Atributos                (de la unidad sale la ClaveUnidad SAT)
  → F-042 Datos fiscales del cliente
  → F-943 Complemento de pago      (se factura a crédito: el pago va después)
```

---

## 8 · ORDEN DE CONSTRUCCIÓN

Derivado de §7 y del costo de §5. No es el orden fácil: es el orden en que el sistema **deja de ser
inútil para un ferretero** lo antes posible. Se asume que las tandas 0 y 1 de `abarrotes` ya están
construidas, porque este modelo se apoya en ellas.

```
TANDA 0 · sin esto no se puede ni demostrar
  1.  F-059  Atributos técnicos por línea + normalización de medidas
  2.  F-201  Búsqueda por atributo, con índice en memoria y tolerancia de escritura
  3.  F-152  Ubicación física, en el resultado de búsqueda y en la etiqueta
  4.  F-021  Categorías jerárquicas de tres niveles

  → Con estas cuatro, Chava puede buscar más rápido de lo que recuerda,
    y a partir de ahí el sistema empieza a ser verdad.

TANDA 1 · lo que hace vendible el catálogo real
  5.  F-145  Corte de material, variante lineal
  6.  F-150  Retazo y sobrante                            (NUEVA · sin esto, 145 miente)
  7.  F-151  Pieza ↔ kilo con peso por pieza              (NUEVA)
  8.  F-058  Etiqueta de gaveta con SKU interno           (aquí es requisito, no lujo)
  9.  F-032  Importación del catálogo del distribuidor con atributos

  → Aquí el catálogo entero se puede vender como se vende de verdad,
    y la objeción de "me hacía capturar el tornillo como un refresco"
    queda contestada.

TANDA 2 · el dolor 1, que es por lo que compran
  10. F-040  Clientes en el puente + ficha de contratista  (pendiente desde abarrotes)
  11. F-610…F-613  Límite, plazo, estado de cuenta, antigüedad
  12. F-638  Autorizados a cargar en cuenta               (NUEVA)
  13. F-606  Remisión firmada de mostrador
  14. F-639  Subcuenta por obra                           (NUEVA)
  15. F-614 · F-254  Aplicación de pagos a documentos
  16. F-617  Bloqueo por mora con llave del dueño
  17. F-635  Cuentas por pagar                            (sube de la tanda 5 de abarrotes)

  → Aquí deja de perderse dinero por las tres puertas del crédito,
    y el corte puede contestar "cuánto salió sin cobrarse".

TANDA 3 · el dolor 2 y el corte propio
  18. F-103  Kardex por artículo
  19. F-051  Sin movimiento valuado a costo + rotación por línea
  20. F-107  Sugerencia sobre 90 días, con el dormido al lado
  21. F-636  Comparativo de precios entre proveedores
  22. F-234  El corte de ferretería, rearmado sección por sección
  23. F-054  Venta, ticket y margen por mostradorista

  → Aquí Beto sabe cuánto tiene parado y deja de recomprarlo.

TANDA 4 · el dolor 3 y lo que retiene al cliente
  24. F-060  Equivalencias, capturadas desde el resultado  (NUEVA)
  25. F-061  Foto de mostrador y rejilla visual            (NUEVA)
  26. F-153  Listas de materiales por trabajo              (NUEVA)
  27. F-222  Devolución con tres destinos y política con plazo
  28. F-258  Servicio de mostrador                         (NUEVA)
  29. F-983  Báscula, para pieza↔kilo y para el conteo por peso

TANDA 5 · lo que pide el que ya está enganchado
  30. F-600…F-607  Cotización y su seguimiento
  31. F-940…F-945  CFDI con ClaveUnidad + complemento de pago
  32. F-003 · F-007  Rol mostradorista y despacho separado de caja
  33. F-149  Conteo cíclico priorizado por valor, con captura por peso
  34. F-117 · F-137 · F-138  Material por obra y devolución de sobrante
  35. F-119 · F-141  Renta de herramienta con depósito
  36. F-017  Diccionario de vocabulario
  37. F-988  Venta sin conexión, de contado y con crédito bloqueado
```

**Por qué F-152 (ubicación) está en la tanda 0 y suena a detalle.** Porque es la única función de esta
carpeta que hace que **el empleado nuevo sirva desde el primer día**, y porque sin ella la búsqueda
entrega un resultado que no termina la venta: saber que hay 40 piezas no sirve si nadie sabe dónde
están. Es barata —una columna, un campo en el resultado, una línea en la etiqueta— y es lo primero que
un ferretero nota.

**Por qué el crédito (tanda 2) va antes que el dinero dormido (tanda 3), si el dormido es más dinero.**
Porque el capital dormido es una pérdida **lenta y recuperable**: el producto sigue ahí y se puede
rematar. El crédito mal otorgado es una pérdida **instantánea e irrecuperable**: el material ya salió y
el que firmó no aparece. Ante dos dolores del mismo tamaño, primero el que no admite vuelta atrás.

**Por qué F-258 (servicio de mostrador) está tan abajo, siendo margen del 60%.** Porque son pocos pesos
en total y porque su ausencia no rompe nada: hoy se cobra aparte y el mundo sigue girando. Es una
función que **mejora** el sistema, no una que lo hace posible. Ordenar por margen en lugar de por
consecuencia es el error clásico de priorización y aquí se evita a propósito.
