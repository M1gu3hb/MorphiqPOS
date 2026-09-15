# 01 · FUNCIONES · Estética / salón de belleza

IDs canónicos de `03-CATALOGO-DE-FUNCIONES.md`. **Nunca se inventa un ID aquí**: lo que falta se
declara en §6 para añadirlo al catálogo antes de construir nada.

```
[=]  idéntica al tronco     [≠]  variante      [+]  exclusiva
[⚙]  construida y operando  [◐]  parcial       [ ]  pendiente
```

**Advertencia de lectura.** Este modelo es el **origen del arquetipo A3**, igual que `restaurante`
lo es de A2 y `abarrotes` de A1. Cuando aquí una función va marcada `[=] ← reutiliza de: X`, quiere
decir que ya está construida en ese modelo y **no se toca**. Cuando va `[=]` o `[≠]` **sin origen**,
quiere decir que **nace aquí** y de aquí la heredan los once modelos de servicios con cita.

**Nota sobre el bloque F-4xx entero:** de las treinta y cinco funciones catalogadas de A3
(F-400…F-439), **cero están construidas**. Ninguna. `[⚙]` no aparece una sola vez en ese bloque, y
eso no es una omisión de la tabla: es el tamaño real del trabajo. A3 desbloquea veintidós modelos y
hoy no existe ni un calendario.

---

## 1 · ÁRBOL COMPLETO

```
ESTÉTICA / SALÓN DE BELLEZA          A3 raíz + A1 injertado · inventario mixto V1+V6+V2
│
├── NÚCLEO · identidad y acceso
│   ├── F-001 Tarjetas de empleado ............................... [=] [⚙] ← restaurante
│   ├── F-002 PIN de 4 dígitos, Argon2id en servidor ............. [=] [⚙] ← restaurante
│   ├── F-003 Roles y permisos ................................... [≠] [⚙]  ← §3.1
│   │         CUATRO roles vivos: dueña, recepción, profesional,
│   │         profesional independiente (rentero). El último NO es
│   │         empleado y eso cambia lo que puede ver.
│   ├── F-004 Sesión revocable con caducidad ..................... [=] [⚙] ← restaurante
│   ├── F-005 Bloqueo por intentos fallidos ...................... [=] [⚙] ← restaurante
│   ├── F-006 Bitácora de acceso y auditoría ..................... [=] [⚙] ← restaurante
│   └── F-007 Permisos finos por módulo .......................... [≠] [ ]  ← §3.1
│             El permiso que manda aquí: `ver_agenda_ajena` y
│             `ver_comision_ajena`. Karla NO debe ver lo de Dany.
│
├── NÚCLEO · configuración
│   ├── F-010 Identidad del negocio .............................. [=] [⚙] ← restaurante
│   ├── F-011 Impuestos: IVA 16% tasa única ...................... [=] [⚙] ← restaurante
│   │         Servicio y cosmético, los dos al 16%. Extraído del
│   │         precio de lista. Aquí somos MÁS SIMPLES que abarrotes.
│   ├── F-012 Sucursales ......................................... [=] [⚙] ← restaurante
│   ├── F-013 Terminales ......................................... [=] [⚙] ← restaurante
│   ├── F-014 Apariencia y tema .................................. [=] [⚙] ← restaurante
│   ├── F-015 Plantilla de negocio `salon` ....................... [+] [ ]
│   ├── F-016 Perillas por módulo ................................ [≠] [◐]
│   │         Las que importan: anticipo sí/no, renta de estación
│   │         sí/no, reserva en línea sí/no, comisión sobre producto
│   │         sí/no, propina en terminal sí/no.
│   └── F-017 Diccionario de vocabulario del giro ................ [+] [ ]  ← DEUDA HEREDADA
│
├── NÚCLEO · catálogo  (aquí el catálogo es de SERVICIOS, no de productos)
│   ├── F-020 Catálogo de servicios y productos .................. [≠] [◐]  ← §3.2
│   ├── F-021 Categorías ......................................... [=] [⚙] ← restaurante
│   ├── F-022 Precio único ....................................... [=] [⚙] ← restaurante
│   ├── F-023 Listas de precio (por nivel de estilista) .......... [≠] [ ]  ← §3.3
│   ├── F-026 Precio por horario o temporada ..................... [=] [ ]
│   │         El martes a las 11:00 vale menos que el sábado a las
│   │         17:00. Nadie en el giro lo cobra distinto todavía, pero
│   │         es la palanca más directa contra el hueco.
│   ├── F-027 Modificadores y extras ............................. [≠] [◐]  ← §3.4
│   ├── F-028 Imágenes ........................................... [≠] [⚙]  ← §3.5
│   ├── F-030 Paquetes y combos .................................. [≠] [ ]  ← §3.6
│   ├── F-032 Importación masiva por Excel ....................... [=] [⚙] ← restaurante
│   │         Aquí es comodidad, no vida o muerte: son 40–90
│   │         servicios, no 1,800 SKU. Se capturan a mano en una tarde.
│   └── F-401 Duración por servicio .............................. [≠] [ ]  ← §3.7 · CLAVE
│
├── AGENDA · el corazón del arquetipo   ← TODO NACE AQUÍ, NADA EXISTE
│   ├── F-400 Calendario día / semana / mes ...................... [≠] [ ]  ← §3.8
│   ├── F-402 Agenda por profesional ............................. [+] [ ]  ← §3.9
│   ├── F-403 Agenda por recurso (lavabo, secadora, cabina) ...... [+] [ ]  ← §3.10
│   ├── F-404 Disponibilidad y huecos ............................ [≠] [ ]  ← §3.11
│   ├── F-405 Reserva en línea por la clienta .................... [≠] [ ]  ← §3.12
│   ├── F-406 Confirmación y recordatorio ........................ [≠] [ ]  ← §3.13
│   ├── F-407 Reprogramar y cancelar ............................. [=] [ ]
│   ├── F-408 Política de cancelación y penalización ............. [≠] [ ]  ← §3.14
│   ├── F-409 Lista de espera de citas ........................... [≠] [ ]  ← §3.15
│   ├── F-410 Sobrecupo controlado ............................... [≠] [ ]
│   │         Aquí el sobrecupo NO es aceptar más gente: es meter una
│   │         cita dentro del tiempo pasivo de otra. Depende de F-415.
│   ├── F-411 Cita recurrente .................................... [=] [ ]
│   │         "Cada cuatro semanas, mismo día, misma hora." Es el
│   │         patrón del retoque de raíz y sostiene la facturación.
│   ├── F-412 Registro de no-show ................................ [≠] [ ]  ← §3.16 · DOLOR 1
│   ├── F-413 Walk-in sin cita ................................... [≠] [ ]  ← §3.17
│   ├── F-414 Anticipo para asegurar la cita ..................... [+] [ ]  ← NUEVA §6
│   ├── F-415 Servicio con tiempo pasivo intercalable ............ [+] [ ]  ← NUEVA §6 · CLAVE
│   ├── F-416 Bloqueo de agenda no productivo .................... [+] [ ]  ← NUEVA §6
│   └── F-417 Costo del hueco · venta perdida de agenda .......... [+] [ ]  ← NUEVA §6
│
├── PROFESIONAL Y COMISIONES   ← TODO NACE AQUÍ, NADA EXISTE
│   ├── F-420 Ficha del profesional .............................. [+] [ ]  ← §3.18
│   ├── F-421 Servicios que puede dar y a qué precio ............. [+] [ ]
│   ├── F-422 Horario y días libres .............................. [+] [ ]
│   ├── F-423 Comisión por servicio .............................. [≠] [ ]  ← §3.19 · DOLOR 2
│   ├── F-424 Comisión sobre producto vendido .................... [≠] [ ]  ← §3.20
│   ├── F-425 Cartera de clientas del profesional ................ [+] [ ]  ← §3.21
│   ├── F-426 Productividad y ocupación .......................... [+] [ ]  ← §3.22
│   ├── F-427 Liquidación de comisiones .......................... [≠] [ ]  ← §3.23
│   ├── F-428 Cita atendida por más de un profesional ............ [+] [ ]  ← NUEVA §6
│   ├── F-429 Origen de la clienta y su efecto en la tarifa ...... [+] [ ]  ← NUEVA §6
│   ├── F-440 Regla de comisión: base, causación y excepciones ... [+] [ ]  ← NUEVA §6 · CLAVE
│   ├── F-441 Renta de estación (silla) .......................... [+] [ ]  ← NUEVA §6
│   ├── F-442 Cargo de material al servicio ...................... [+] [ ]  ← NUEVA §6
│   ├── F-443 Ledger inmutable de comisión causada ............... [+] [ ]  ← NUEVA §6 · CLAVE
│   └── F-444 Rehacer sin cobro (servicio de garantía) ........... [+] [ ]  ← NUEVA §6
│
├── EXPEDIENTE · V4 de belleza   ← NACE AQUÍ
│   ├── F-430 Expediente (tronco) ................................ [≠] [ ]  ← §3.24
│   ├── F-434 V4 · De belleza .................................... [+] [ ]  ← §3.24 · DOLOR 3
│   ├── F-436 Fotos antes y después .............................. [≠] [ ]  ← §3.25
│   ├── F-437 Documentos adjuntos ................................ [=] [ ]
│   ├── F-438 Consentimiento firmado ............................. [≠] [ ]  ← §3.26
│   └── F-439 Paquete de sesiones ................................ [≠] [ ]  ← §3.27
│
├── CLIENTAS
│   ├── F-040 Clientas: ficha básica ............................. [≠] [◐]  ← §3.28
│   │         La tabla existe; NO está en el puente. Deuda heredada
│   │         de `abarrotes` y `ferreteria`. Aquí es BLOQUEANTE: sin
│   │         clienta no hay cita, no hay expediente y no hay cartera.
│   ├── F-041 Historial de compra ................................ [≠] [ ]
│   │         Aquí es historial de VISITAS, y es la mitad del expediente.
│   ├── F-042 Datos fiscales (RFC, régimen, CP) .................. [=] [ ]
│   ├── F-043 Etiquetas y segmentos .............................. [=] [ ]
│   └── F-044 Notas de la clienta ................................ [≠] [ ]
│             "No le gusta que le hablen." "Sensible en las sienes."
│             Es nota de SERVICIO, y va con marca de privada/compartida.
│
├── INVENTARIO · TRONCO   (se reutiliza entero, no se toca)
│   ├── F-100 Existencia actual por almacén ...................... [=] [⚙] ← restaurante
│   │         Aquí "almacén" son DOS: cabina y anaquel. Ver F-155.
│   ├── F-101 Ledger inmutable de movimientos .................... [=] [⚙] ← restaurante
│   ├── F-102 Decremento atómico al cobrar ....................... [≠] [⚙]  ← §3.29
│   ├── F-103 Kardex / historial por artículo .................... [=] [ ]
│   ├── F-104 Ajuste manual con motivo obligatorio ............... [=] [⚙] ← restaurante
│   ├── F-105 Traspaso entre almacenes ........................... [≠] [ ]  ← §3.30
│   ├── F-106 Toma de inventario físico .......................... [=] [ ]  ← abarrotes
│   ├── F-107 Alertas de mínimo .................................. [≠] [⚙]  ← §3.31
│   ├── F-108 Valuación (costo promedio ponderado) ............... [=] [⚙] ← restaurante
│   └── F-109 Merma con motivo ................................... [≠] [ ]  ← §3.32
│
├── INVENTARIO · VARIANTES MIXTAS
│   ├── F-110 V1 · el TIEMPO es el inventario .................... [≠] [ ]  ← §3.33 · RECLASIFICA
│   ├── F-111 V2 · Stock simple (producto de reventa) ............ [=] [ ]  ← abarrotes
│   ├── F-115 V6 · Peso y volumen (producto de cabina) ........... [≠] [⚙]  ← §3.34
│   ├── F-128 Receta / escandallo ................................ [≠] [⚙]  ← §3.35
│   ├── F-129 Explosión de receta al cobrar ...................... [≠] [⚙]  ← §3.35 · NO APLICA IGUAL
│   ├── F-130 Costeo por insumo .................................. [=] [⚙] ← restaurante
│   ├── F-146 Caducidad sin lote ................................. [=] [ ]  ← abarrotes
│   ├── F-154 Fórmula capturada al aplicar ....................... [+] [ ]  ← NUEVA §6 · CLAVE
│   └── F-155 Doble destino del mismo SKU: cabina y anaquel ...... [+] [ ]  ← NUEVA §6
│
├── VENTA Y COBRO
│   ├── F-200 Carrito ............................................ [≠] [⚙]  ← §3.36
│   ├── F-201 Búsqueda rápida .................................... [=] [⚙] ← restaurante
│   │         Cuadrícula con imagen y nombre, como el menú. 40–90
│   │         servicios caben en pantalla. Idéntica a restaurante.
│   ├── F-202 Descuento por línea ................................ [≠] [⚙]  ← §3.37
│   ├── F-203 Descuento por total ................................ [≠] [⚙]  ← §3.37
│   ├── F-205 Autorización de descuento por supervisor ........... [=] [ ]
│   ├── F-210 Cobro en efectivo con cambio ....................... [=] [⚙] ← restaurante
│   ├── F-211 Cobro con tarjeta .................................. [=] [⚙] ← restaurante
│   ├── F-212 Cobro por transferencia ............................ [≠] [⚙]  ← §3.38 · DESCUADRE 1
│   ├── F-213 Pago mixto ......................................... [=] [⚙] ← restaurante
│   ├── F-215 Cobro con pasarela en línea ........................ [=] [ ]
│   │         Sólo para el anticipo de la reserva en línea (F-405).
│   ├── F-220 Ticket ............................................. [≠] [⚙]  ← §3.39
│   ├── F-221 Cancelación con motivo ............................. [≠] [⚙]  ← §3.40
│   ├── F-222 Devolución total o parcial ......................... [≠] [⚙]  ← §3.40
│   ├── F-223 Folio consecutivo por sucursal ..................... [=] [⚙] ← restaurante
│   ├── F-225 Reimpresión de ticket .............................. [=] [⚙] ← restaurante
│   └── F-259 Liquidación al profesional como salida de caja ..... [+] [ ]  ← NUEVA §6
│
├── CAJA
│   ├── F-230 Apertura con fondo ................................. [=] [⚙] ← restaurante
│   ├── F-231 Movimientos: entrada, retiro, gasto ................ [≠] [⚙]  ← §3.41
│   ├── F-232 Arqueo a ciegas .................................... [=] [⚙] ← restaurante
│   ├── F-233 Corte de turno ..................................... [=] [⚙] ← restaurante
│   ├── F-234 Corte diario y su PDF .............................. [≠] [⚙]  ← §3.42 · EL DOCUMENTO
│   ├── F-235 Varias cajas simultáneas ........................... [=] [ ]   APAGADA
│   └── F-236 Caja por terminal .................................. [=] [⚙] ← restaurante
│
├── PROPINAS · V4 DIRECTA AL PROFESIONAL   ← NACE AQUÍ
│   ├── F-240 Propinas (tronco) .................................. [≠] [⚙]  ← §3.43
│   ├── F-243 V4 · Directa al profesional ........................ [+] [ ]  ← §3.43
│   ├── F-245 Desglose exacto por método ......................... [=] [⚙] ← restaurante
│   ├── F-246 Liquidación de propinas por periodo ................ [≠] [⚙]  ← §3.44
│   └── F-260 Propina en tarjeta como pasivo hacia el profesional  [+] [ ]  ← NUEVA §6
│
├── COMPRAS Y GASTOS
│   ├── F-250 Gastos con categoría ............................... [=] [⚙] ← restaurante
│   ├── F-251 Plantillas de gasto fijo ........................... [=] [⚙] ← restaurante
│   ├── F-252 Comprobante adjunto al gasto ....................... [=] [ ]
│   ├── F-630 Orden de compra .................................... [=] [ ]
│   ├── F-631 Proveedores ........................................ [=] [⚙] ← restaurante
│   ├── F-632 Recepción y entrada a inventario ................... [=] [⚙] ← restaurante
│   ├── F-633 Actualización de costo promedio .................... [=] [⚙] ← restaurante
│   └── F-635 Cuentas por pagar .................................. [=] [ ]  ← DEUDA HEREDADA
│
├── REGISTROS Y DASHBOARD
│   ├── F-050 Ventas por periodo ................................. [≠] [⚙]  ← §3.45
│   ├── F-051 Más vendidos (servicios) ........................... [≠] [⚙]
│   ├── F-052 Utilidad y margen .................................. [≠] [⚙]  ← §3.46
│   ├── F-053 Cortes históricos .................................. [=] [⚙] ← restaurante
│   ├── F-054 Ventas por empleado ................................ [≠] [◐]  ← §3.47
│   ├── F-055 Comparativo entre periodos ......................... [≠] [ ]
│   │         Aquí SIEMPRE contra el mismo día de la semana. Un
│   │         martes contra un sábado no dice nada.
│   ├── F-056 Dashboard .......................................... [≠] [◐]  ← §3.48
│   └── F-057 Exportación a Excel y PDF .......................... [=] [⚙] ← restaurante
│
├── PORTAL, MARKETING Y FIDELIDAD
│   ├── F-920 Portal del cliente ................................. [≠] [◐]
│   ├── F-923 V3 · Reserva en línea .............................. [+] [ ]  ← §3.12
│   ├── F-930 Puntos por compra .................................. [=] [ ]
│   ├── F-935 Cumpleaños y fechas ................................ [≠] [ ]
│   │         Aquí el "cumpleaños" que vale es el ANIVERSARIO DEL COLOR:
│   │         a las cuatro semanas del tinte, no el día del santo.
│   ├── F-950 Campañas por WhatsApp .............................. [≠] [ ]  ← §3.49
│   ├── F-951 Recuperación de inactivas .......................... [≠] [ ]  ← §3.50 · CLAVE
│   ├── F-952 Encuesta de satisfacción ........................... [=] [◐]
│   └── F-953 Reseñas de Google .................................. [=] [ ]
│
├── FACTURACIÓN
│   ├── F-940 CFDI 4.0 ........................................... [=] [ ]
│   ├── F-941 Timbrado ante PAC .................................. [=] [ ]
│   ├── F-942 Factura global mensual ............................. [=] [ ]  ← abarrotes
│   ├── F-944 Cancelación con motivo SAT ......................... [=] [ ]
│   └── F-945 Envío automático por correo ........................ [=] [ ]
│
├── NÓMINA Y ASISTENCIA
│   ├── F-960 Reloj checador ..................................... [≠] [ ]
│   │         Aquí el checador real es la primera cita iniciada.
│   ├── F-962 Turnos y horarios .................................. [≠] [ ]  ← es F-422
│   └── F-963 Cálculo de nómina .................................. [≠] [ ]  ← §3.23
│
├── MULTI-SUCURSAL
│   ├── F-970 Catálogo compartido ................................ [=] [ ]
│   ├── F-973 Reportes consolidados .............................. [≠] [ ]
│   └── F-974 Permisos por sucursal .............................. [=] [⚙] ← restaurante
│
└── HARDWARE
    ├── F-984 Cajón de dinero .................................... [=] [ ]
    ├── F-985 Impresora térmica .................................. [=] [⚙] ← restaurante
    ├── F-986 Lector de código de barras ......................... [=] [◐]  OPCIONAL
    │         Sólo para el producto de reventa. Nunca es el eje.
    └── F-987 Terminal bancaria integrada ........................ [≠] [ ]
              Aquí importa distinto: la terminal tiene que poder
              devolver CUÁNTO fue propina. Ver F-260.
```

---

## 2 · LAS `[=]` · lo que NO se vuelve a construir

Comparadas campo por campo contra su origen. Si hubiera una sola diferencia, estarían en §3.

```
F-001 · F-002 · F-004 · F-005 · F-006   Identidad y acceso
      ← reutiliza de: restaurante · `packages/app/src/identidad/`
      Idénticas. El PIN de una estilista es el mismo objeto que el de un
      mesero. Lo que cambia es QUÉ roles existen (F-003 sí cambia, ver
      §3.1) y QUÉ puede ver cada uno (F-007), y eso es dato de plantilla
      y de permiso, no comportamiento de la función de identidad.
      NO SE VUELVE A CONSTRUIR.

F-010 · F-011 · F-012 · F-013 · F-014   Configuración e impuestos
      ← reutiliza de: restaurante
      **F-011 es idéntica de verdad, y hay que subrayarlo**: aquí todo
      causa 16%, servicio y cosmético, extraído del precio de lista,
      exactamente como el menú de un restaurante. Toda la maquinaria de
      IVA mixto e IEPS que `abarrotes` tuvo que construir aquí se queda
      apagada. Es el único lugar donde este modelo es más simple que A1.
      NO SE VUELVE A CONSTRUIR.

F-021 · F-022 · F-032 · F-201   Categorías, precio único, importación, búsqueda
      ← reutiliza de: restaurante · `packages/app/src/catalogo/`
      Idénticas. Un catálogo de 40–90 servicios con nombre, precio,
      categoría e imagen se busca en una cuadrícula con el dedo, igual
      que un menú. Es literalmente el mismo componente y la misma
      cantidad de elementos.
      NO SE VUELVE A CONSTRUIR.

F-210 · F-211 · F-213 · F-223 · F-225   Cobro, folio, reimpresión
      ← reutiliza de: restaurante · `packages/app/src/venta/pagos.ts`
      Idénticas. Un cobro en efectivo con cambio, uno con tarjeta y uno
      mixto se comportan igual cobrando un tinte que cobrando una cena.
      (F-212 transferencia SÍ cambia: ver §3.38.)
      NO SE VUELVE A CONSTRUIR.

F-230 · F-232 · F-233 · F-236   Caja, arqueo y corte de turno
      ← reutiliza de: restaurante · `packages/app/src/caja/`
      Idénticas, incluida la regla que no admite variante en ningún giro:
      el arqueo va a ciegas y el esperado lo calcula el servidor como
      fondo + entradas − salidas. Ver `04-SISTEMA-DE-DISENO.md` §5.
      (F-231 SÍ cambia: hay cinco movimientos nuevos. Ver §3.41.)
      NO SE VUELVE A CONSTRUIR.

F-100 · F-101 · F-103 · F-104 · F-108   Tronco de inventario
      ← reutiliza de: restaurante · `packages/app/src/inventario/`
      Idénticas. El ledger con el signo impuesto por `check`, el ajuste
      con motivo obligatorio y el costo promedio ponderado son
      aritmética y reglas de integridad, no giro. Un gramo de tinte se
      mueve en el mismo ledger que un gramo de arrachera.
      NO SE VUELVE A CONSTRUIR. Es el 60% del módulo.

F-106   Toma de inventario físico
      ← reutiliza de: abarrotes · `packages/app/src/inventario/conteo.ts`
      El motor de esperado-contra-contado con alcance parcial que
      `abarrotes` diseñó sirve tal cual. Lo único que cambia es el
      alcance típico —aquí se cuenta el estante de color, no una zona de
      anaquel— y eso ya es un parámetro del motor.
      NO SE VUELVE A CONSTRUIR.

F-111 V2 · Stock simple · F-146 Caducidad sin lote
      ← reutiliza de: abarrotes
      El producto de reventa de un salón es stock simple de pieza, igual
      que una papelería. La caducidad del tinte se maneja con fecha en la
      entrada y sin trazabilidad de lote, exactamente como la leche de
      una tiendita. V4 completo es de farmacia y aquí sobra.
      NO SE VUELVE A CONSTRUIR.

F-130 Costeo por insumo · F-245 Desglose exacto de propina por método
      ← reutiliza de: restaurante
      Idénticas. El costo de un servicio a partir de sus insumos es la
      misma suma que el costo de un platillo. El desglose exacto de
      propina por método —jamás proporcional— es regla de Fase 1.
      NO SE VUELVE A CONSTRUIR.

F-250 · F-251 · F-631 · F-632 · F-633   Gastos y compras
      ← reutiliza de: restaurante · `packages/app/src/compras/`
      Idénticas. Un salón le compra a tres o cuatro distribuidores de
      producto profesional, una o dos veces al mes, sentada. Es el caso
      más fácil de compras que existe: sin ruta, sin canje, sin
      presentaciones. Ni siquiera hace falta la sugerencia de pedido de
      `abarrotes`; basta la alerta de mínimo.
      NO SE VUELVE A CONSTRUIR.

F-985   Impresora térmica · F-057 Exportación a PDF
      ← reutiliza de: restaurante · `heredado/lib/pdfDownload.js`
      Mismo ancho, mismo driver, mismo camino de generación.
      NO SE VUELVE A CONSTRUIR.
```

---

## 3 · LAS `[≠]` · mismo nombre, comportamiento distinto

### 3.1 · F-003 · F-007 · Roles y permisos

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Cinco roles: dueño, gerente, cajero, mesero, cocina. **Todos son empleados** | Cuatro: dueña, recepción, profesional, **profesional independiente**. El último **no es empleado del negocio**: renta una estación | Sol paga $1,200 a la semana y se queda el 100% de lo que cobra. No tiene comisión, no entra en la nómina, y **sus ingresos no son ingresos del salón**. Un sistema que la modele como empleada con comisión del 100% produce una venta inflada y un ticket promedio falso |
| El mesero ve todas las mesas | **La estilista ve SU agenda por omisión**, y las de las demás sólo si la dueña lo permite | La agenda ajena es información competitiva dentro del propio salón: cuántas clientas tiene la otra, cuánto cobra, a qué hora está libre. En un negocio donde la rotación se lleva la cartera, enseñarlo todo a todos es un error operativo |
| No existe el concepto de ver el dinero de otro | **`ver_comision_ajena` es el permiso más delicado del modelo** | Si Karla ve que Dany cobra 25% y ella 50%, no pasa nada. Si Dany ve que Karla cobra 50% y ella 25%, hay un problema el mismo día. **Por omisión: cada quien ve sólo lo suyo, y la dueña ve todo.** |

### 3.2 · F-020 · Catálogo

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| El catálogo es de **productos**: platillos con receta y precio | El catálogo es de **servicios**, y un servicio es un producto **con tiempo dentro** | Un platillo no tiene duración: se pide y sale. Un servicio ocupa 45 minutos de una persona concreta y ésa es la mitad de su definición. Ver F-401 en §3.7 |
| Un platillo lo puede hacer cualquier cocinero | **Un servicio no lo puede dar cualquiera** | El balayage lo hace Karla, no Dany. Eso es F-421 y hace que el catálogo tenga una matriz servicio × profesional, con **precio distinto por profesional** (§3.3). Ningún catálogo de A1 ni de A2 tiene eso |
| El producto consume insumos por receta fija | **El servicio consume producto por fórmula variable**, y además hay producto de reventa que no consume nada | Dos tipos de artículo bajo el mismo catálogo con comportamiento opuesto. Ver `03-INVENTARIO.md` §3 |
| Sin comisión | **Cada servicio lleva su regla de comisión** | El corte comisiona distinto que el tinte, porque el tinte lleva material. F-440 |

### 3.3 · F-023 · Listas de precio

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Lista pública y lista de mayoreo. **La lista es del cliente** | **La lista es del PROFESIONAL.** Karla cobra $450 el corte, Dany $320, Paty $550 | El precio de un servicio no depende de cuánto compras: depende de quién te atiende. Es el eje E3.2 expresado en pesos. La clienta que pide a Karla sabe que paga más y lo paga a gusto |
| El descuento por volumen es escalonado | **No hay volumen.** Lo que hay es **nivel**: junior, estilista, senior, director | Es como el giro se organiza en todo el mundo y es la ruta de carrera dentro del salón. Un sistema que no lo tenga obliga a duplicar el catálogo tres veces |

**Consecuencia de datos:** el precio no vive en el servicio; vive en el par `(servicio, profesional)`
con el precio del servicio como valor por omisión. Y **la comisión se calcula sobre el precio
efectivo de ese par**, no sobre el del catálogo.

### 3.4 · F-027 · Modificadores

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| "Sin cebolla", "término medio". **No cambian el precio ni el tiempo** | **Cambian las dos cosas, y mucho**: cabello largo +$200 y +30 min; cabello muy largo +$400 y +50 min; cabello muy oscuro que requiere doble proceso, +$600 y +90 min | Es la variable que hace que la agenda de un salón se caiga todos los días. Se agenda un tinte de 2 horas y llega una clienta con cabello a la cintura: son 3 horas y media, y **las tres citas siguientes se recorren**. Un sistema que no permita ajustar la duración al agendar, con el precio siguiéndola, está agendando mentiras |
| El modificador se elige al pedir | **El modificador se elige al AGENDAR**, porque ahí es donde afecta al tiempo | Momento distinto, pantalla distinta. Si sólo se puede poner al cobrar, ya es tarde |

### 3.5 · F-028 · Imágenes

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Foto del platillo en el catálogo, para que el mesero lo reconozca | **Dos usos, y el segundo no existe en ningún otro modelo**: (1) foto del servicio en el catálogo, (2) **foto de la clienta, antes y después, dentro de su expediente** | La segunda es F-436 y es una función de expediente, no de catálogo. La menciono aquí porque comparten el almacenamiento y porque la foto de la clienta trae consigo consentimiento, privacidad y peso: son 20 a 60 fotos al mes por salón y no se pueden meter en la misma bolsa que las 90 del catálogo |

### 3.6 · F-030 · Paquetes y combos

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Un combo se consume **de una vez**: hamburguesa + papas + refresco, en la misma comanda | **Dos clases de paquete, y la segunda es de otro planeta**: el combo del día (corte + peinado, mismo día, es igual que restaurante) y el **paquete de sesiones** (F-439): seis sesiones de tratamiento, pagadas hoy, consumidas en tres meses | El segundo **no es una venta: es un anticipo que se devenga**. Ver `02-DINERO-Y-CAJA.md` §6 y §3.27 de este archivo |

### 3.7 · F-401 · Duración por servicio · **la función que define el arquetipo**

Está catalogada `[=]` y **hay que reclasificarla a `[≠]`**. Ver §7.

| En el catálogo hoy | Aquí | Por qué la diferencia |
|---|---|---|
| Un número: "45 minutos" | **Una secuencia de tres tramos:** `activo → pasivo → activo`. El retoque de raíz es **20 min de aplicación + 35 min de procesado + 40 min de lavado, corte y secado** | Durante los 35 minutos de procesado **la clienta ocupa una estación y la estilista está libre**. Son dos recursos con disponibilidad distinta al mismo tiempo. Si la duración es un solo número, el sistema bloquea a la estilista 95 minutos y **el salón pierde entre 25% y 40% de su capacidad real** |
| La duración es del servicio | **La duración es del par `(servicio, profesional)`** y se ajusta por modificador de largo de cabello | Karla hace el mismo tinte en 80 minutos y Dany en 110. Si la agenda usa el mismo número para las dos, la de Karla se queda con huecos y la de Dany se recorre |
| Sin tiempo de limpieza | **Tiempo de cierre**: limpiar la estación, barrer el pelo, lavar el tazón del tinte. 5–10 min entre citas | Es tiempo real que hoy nadie agenda y que es la razón por la que un salón "va bien" a las 11 y va 40 minutos tarde a las 18 |

**Ésta es la función más importante de todo el arquetipo A3 y la que ningún competidor del segmento
modela.** AgendaPro, Booksy y Fresha tratan la duración como un número. **F-415** es su desarrollo.

### 3.8 · F-400 · Calendario

| En el catálogo (tronco genérico) | Aquí | Por qué la diferencia |
|---|---|---|
| Vistas día / semana / mes | **La vista por omisión es DÍA, y es una rejilla de tiempo con una columna por profesional.** La semana existe para planear; el mes casi no se usa | El día de un salón es de diez horas y tres a cinco columnas. Eso es exactamente lo que cabe en una tablet vertical y es la pantalla de inicio (eje A). La vista de mes de un salón está vacía de información: no hay "eventos", hay carga por hora |
| El bloque de cita es un rectángulo sólido | **El bloque tiene TRES zonas visuales**: activo sólido, pasivo rayado y cierre en línea delgada | Porque durante el rayado se puede meter otra cita. Si se dibuja sólido, nadie va a intentarlo. **La interfaz tiene que enseñar la oportunidad, no esconderla.** Ver `04-INTERFAZ.md` §4.3.1 |
| El calendario muestra lo agendado | **Muestra lo agendado Y LOS HUECOS, con su valor** | El hueco no es ausencia de información: es la información más accionable de la pantalla. Un hueco de 60 min en la columna de Karla un sábado a las 16:00 vale $650 y hay que verlo así |

### 3.9 · F-402 · Agenda por profesional

`[+]` exclusiva de A3 y **nace aquí**. No hay con qué comparar, así que lo que va es la definición:

Cada profesional tiene su propia línea de tiempo, su propio horario (F-422), sus propios servicios
(F-421), su propio precio (F-023) y su propia ocupación (F-426). **La agenda del salón no es una
agenda: son N agendas que comparten recursos** (lavabos, secadoras) y espacio (estaciones).

La consecuencia técnica está en `05-DATOS-Y-BACKEND.md` §4: el solapamiento se impide en la base
con una **restricción de exclusión sobre el rango activo**, no con una validación en la aplicación.
Dos recepcionistas agendando al mismo tiempo desde dos dispositivos es el caso normal, no el raro.

### 3.10 · F-403 · Agenda por recurso

`[+]` exclusiva de A3 y **nace aquí**.

Un salón tiene recursos escasos que no son personas: **dos lavabos, una secadora de casco, un
vaporizador, tres estaciones**. Un tinte necesita estación durante todo el servicio y lavabo durante
diez minutos. Si tres estilistas terminan su procesado a la misma hora, las tres quieren lavabo y
sólo hay dos.

**Aquí el recurso es secundario y el profesional manda.** En `spa-masajes` es al revés: la cabina es
el recurso escaso y el terapeuta es intercambiable. **Los dos usan el mismo motor con el eje
invertido**, y por eso se construye una vez con el eje como configuración.

### 3.11 · F-404 · Disponibilidad y huecos

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| "¿Está libre a las 3?" → sí o no | **Cuatro preguntas distintas**, y la interfaz las contesta distinto: (1) ¿cabe este servicio en algún lado hoy? (2) ¿cuál es el próximo hueco de Karla? (3) ¿qué huecos quedan mañana y cuánto valen? (4) ¿cabe algo **dentro** del procesado de las 10:35? | La cuarta no existe en ningún sistema del mercado y es la que más dinero mueve. Depende de F-415 |
| El hueco es tiempo sin cita | **El hueco es tiempo sin cita DENTRO del horario laboral Y fuera de un bloqueo declarado** | Si la comida de Karla cuenta como hueco, la ocupación del salón sale 15 puntos más baja de lo real todos los días y el indicador se vuelve inútil. Por eso existe F-416 |

### 3.12 · F-405 · F-923 · Reserva en línea

| En el catálogo (tronco) | Aquí | Por qué la diferencia |
|---|---|---|
| La clienta escoge servicio, día y hora | **Escoge servicio, día, hora Y PROFESIONAL** — y el profesional suele ser lo primero que escoge | Viene con Karla. Si el portal no deja elegir a Karla, no lo usa. Es el eje E3.2 en la parte pública |
| Confirma y ya | **Puede pedir anticipo** (F-414) si el servicio pasa de cierto monto o si la clienta tiene historial de no-show | 20–30% de anticipo en servicios estándar y hasta 50% en los caros o largos es la norma del giro. La pasarela (F-215) sólo se necesita aquí |
| El portal es un catálogo | **El portal es la agenda expuesta**, con los huecos reales y en vivo | Si enseña huecos que ya no existen, la clienta llega y no hay lugar. La disponibilidad tiene que ser la misma consulta que usa recepción, no una copia |

**Honestidad comercial:** Fresha y Booksy tienen marketplace propio, que es un canal de captación de
clientas nuevas que MorphiqPOS **no va a tener**. Es una desventaja real. Lo que sí se puede hacer
mejor es el enlace de reserva propio del salón, puesto en su Instagram y en su WhatsApp Business, sin
que una plataforma se quede con la relación.

### 3.13 · F-406 · Confirmación y recordatorio

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| Recordatorio 24 h antes | **Dos toques, y el segundo es el que sirve**: uno a las 48 h que pide **confirmar**, y uno la mañana del día | El de 24 h a secas no baja el no-show lo suficiente. El que baja el no-show es el que **pide respuesta** y libera el hueco si la respuesta es no. Con recordatorio + confirmación + anticipo el no-show reportado cae de 15–30% a menos del 8% |
| Correo o SMS | **WhatsApp o nada.** El correo no se lee y el SMS cuesta | El giro entero opera en WhatsApp. Ver §3.49 |
| Automático | **Semiautomático por omisión**: el sistema arma la lista y los mensajes, y la dueña los manda | Igual que el fiado en `abarrotes`: la relación es personal. La diferencia es que aquí, después de un mes de confianza, el envío automático sí se acepta y se enciende. Pero **no viene encendido de fábrica** |

### 3.14 · F-408 · Política de cancelación

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| Penalización por cancelar tarde | **Tres ventanas, no una**: cancela con más de 24 h → sin costo; entre 24 h y 2 h → pierde el anticipo si lo dio; menos de 2 h o no llega → pierde el anticipo y **se le pide anticipo la próxima vez** | La ventana de 24 h es la que permite recolocar. Menos de dos horas es, en la práctica, un no-show |
| La penalización es un cargo | **La penalización es quedarse con un anticipo ya cobrado**, casi nunca un cargo nuevo | Cobrarle a alguien que no vino es imposible en la práctica en México. Lo único que funciona es tener el dinero ya adentro. Por eso F-414 es la función, y F-408 es sólo la regla que la dispara |
| Aplica a todos | **Se configura por servicio y por clienta** | Nadie le pide anticipo a una clienta de doce años. Se le pide a la que ya falló dos veces y al balayage de cuatro horas |

### 3.15 · F-409 · Lista de espera

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| Cola de espera para entrar hoy | **Lista de "avísame si se desocupa"**, con servicio, profesional preferido y ventanas de tiempo que le sirven | Es una lista de deseos futuros, no una fila en la puerta. La de la puerta es el walk-in (F-413) y es otra cosa |
| Se consulta cuando alguien pregunta | **Se ofrece SOLA cuando se libera un hueco** | El momento en que un hueco se libera —una cancelación, un no-show marcado— es el momento en que hay que actuar, y dura minutos. El sistema tiene que decir *"se liberó mañana 11:00 con Karla; tres de la lista lo querían; aquí están sus WhatsApp"* con un toque. **Ésta es la función que convierte el dolor 1 en dinero** y por eso está adentro de F-409 y no en un ID aparte |

### 3.16 · F-412 · No-show

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| Se marca que no vino | **Se marca, se libera el hueco, se valúa la pérdida, y queda en el historial de la clienta** | Cuatro efectos. El tercero es F-417 y el cuarto es lo que permite pedirle anticipo la próxima vez. Marcar sin las otras tres es un checkbox inútil |
| Es un estado de la cita | **Es un evento con hora**: a los 15 minutos de retraso el sistema lo propone; la recepción confirma o pone "va en camino" | El automatismo puro es un error: la clienta que llega 20 minutos tarde es normal en México. Lo que hay que hacer es **preguntar a los 15 minutos**, no decidir |
| Sin consecuencia | **Con consecuencia graduada**: 1 falta es humano, 2 en seis meses enciende el aviso, 3 activa el anticipo obligatorio para esa clienta | La graduación es lo que lo hace aceptable para la dueña. Una regla dura la apaga el primer día, exactamente igual que el bloqueo por mora en `abarrotes` |

### 3.17 · F-413 · Walk-in

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| Atender sin cita | **Es entre el 25% y el 50% de la venta de un salón de barrio**, y en barbería es la mayoría | Un salón que sólo acepte cita pierde la mitad de su venta. Esto no es una excepción a documentar al final: es la mitad del tráfico |
| Se registra al cobrar | **Se crea una cita en el momento, en dos toques, y ocupa el hueco** | Si el walk-in no entra a la agenda, la agenda miente: dice que Karla está libre a las 16:00 cuando está atendiendo. Y la ocupación, el hueco y la comisión salen mal. **El walk-in es una cita que nació hace treinta segundos**, no un tipo de venta distinto |
| Sin clienta | **Con clienta si se puede, sin clienta si tiene prisa** | Pedir nombre, teléfono y correo a alguien que quiere un corte de $250 es perder la venta. El nombre se pide al cobrar, cuando ya está sentada y de buenas, y si no lo da, se cobra sin él |

### 3.18 · F-420 · Ficha del profesional

`[+]` exclusiva de A3, **nace aquí**. Lo que tiene que traer, y cada campo tiene una razón:

```
Identidad ......... nombre, foto, nombre corto para la agenda (cabe 8 caracteres)
Relación .......... empleada · empleada con comisión · independiente que renta
Nivel ............. junior · estilista · senior · director     → precio (F-023)
Servicios ......... cuáles puede dar, con su precio y su duración propios (F-421)
Horario ........... por día de la semana, con días libres y vacaciones (F-422)
Regla de comisión . la que aplica, con su base y sus excepciones (F-440)
Renta ............. monto y periodicidad, si es independiente (F-441)
Color ............. el color de su columna en la agenda    ← no es decoración
Color de agenda es identidad: en una rejilla de cinco columnas leída de pie a
metro y medio, el color es la primera forma de ubicarse.
```

### 3.19 · F-423 · Comisión por servicio · **el dolor 2**

| En el catálogo (tronco genérico) | Aquí | Por qué la diferencia |
|---|---|---|
| Un porcentaje sobre la venta | **Cuatro esquemas conviviendo en el mismo salón**: comisión pura 40–60% sin sueldo; sueldo base + 10–30%; escalonado por meta; y renta de estación (que no es comisión, es lo contrario) | Es como opera el giro en México y está documentado así: el esquema 40–60% sin base protege el flujo pero deja que la estilista se lleve la clientela; el mixto es lo más común en salones sanos; la renta es para independientes. **Los tres en la misma nómina y en el mismo corte** |
| La base es obvia: la venta | **La base es la pelea.** Cinco preguntas: ¿sobre lista o sobre cobrado? ¿antes o después de IVA? ¿se descuenta el material? ¿quién cobra si fueron dos? ¿se paga otra vez si hay que rehacer? | Ver F-440, F-442, F-428 y F-444. **Un sistema que no conteste las cinco no resuelve el pleito: lo traslada** |
| Se calcula al cerrar el periodo | **Se causa al cobrar el ticket y queda escrita en un ledger inmutable** | F-443. La estilista tiene que poder ver su acumulado del día en su teléfono a las 15:00. Un número que se calcula al final y que puede cambiar es un número en el que nadie confía |
| Si se cancela, se recalcula | **No se recalcula: se escribe una contrapartida** | Igual que el ledger de stock. Una comisión que baja sola después de que la estilista la vio destruye la confianza en el sistema entero, aunque el número final sea correcto |

### 3.20 · F-424 · Comisión sobre producto vendido

Está catalogada `[=]` y **hay que reclasificarla a `[≠]`**. Ver §7.

| En una boutique / mayorista | Aquí | Por qué la diferencia |
|---|---|---|
| Comisiona **quien vendió**, un vendedor con cuota | Comisiona **quien atendió**, aunque el cobro lo haga recepción | La clienta compra el shampoo porque Karla se lo recomendó con la cabeza mojada, no porque la recepcionista se lo ofreció al pagar. Si la comisión se le asigna a quien tecleó el cobro, **nadie vuelve a recomendar producto** y se pierde el 15% de la venta del salón |
| Un porcentaje único | **Porcentaje distinto y más bajo que el del servicio**: 5–15% contra 40–60% | El producto tiene costo real de compra; el servicio casi no. Igualar los dos porcentajes quiebra al salón |
| La venta y el servicio son la misma operación | **Pueden ir en el mismo ticket con dos comisiones distintas y hasta con dos profesionales distintos** | Karla dio el servicio y Paty vendió el producto mientras Karla secaba. Pasa todos los días |

### 3.21 · F-425 · Cartera de la profesional

`[+]` exclusiva de A3, **nace aquí**. Es el registro de **qué clienta es de quién**, y tiene tres
valores distintos:

1. **Operativo.** Al agendar, propone automáticamente a la profesional de siempre. Ahorra una
   pregunta cuarenta veces al día.
2. **Comercial.** Alimenta F-429: la comisión puede ser distinta si la clienta es de la casa o si la
   trajo la profesional.
3. **De riesgo.** Es lo único que tiene el salón el día que la profesional se va. Hoy esos sesenta
   teléfonos están sólo en el WhatsApp de Karla.

**El filo ético, y hay que escribirlo:** el sistema **registra el hecho, no lo usa para retener a
nadie ni para esconderle su cartera a quien la construyó.** Una profesional puede ver y exportar su
propia cartera. Si el sistema se la oculta, el sistema se vuelve un instrumento contra ella y el
salón acaba operando por fuera del sistema, que es exactamente lo que no queremos.

### 3.22 · F-426 · Productividad y ocupación

`[+]` exclusiva de A3, **nace aquí**. Los cinco números que importan **por profesional**:

```
Ocupación         horas con cita ACTIVA ÷ horas disponibles (sin bloqueos)
                  ← el denominador es el pleito; ver F-416
Venta generada    servicio + producto, del periodo
Ticket promedio   por cita atendida
% con producto    de sus citas, en cuántas vendió producto   ← el margen del salón
Retorno           de sus clientas, cuántas volvieron dentro de su frecuencia
                  ← el número que dice quién construye cartera y quién sólo corta
```

### 3.23 · F-427 · F-963 · Liquidación de comisiones y nómina

| En el catálogo | Aquí | Por qué la diferencia |
|---|---|---|
| Se liquida por periodo | **Cuatro periodicidades a la vez en el mismo salón**: Karla diario o semanal en efectivo, Dany quincenal con su sueldo, Sol paga renta los lunes, Brenda quincenal con propina de apoyo | Es la realidad del giro. El sistema tiene que poder liquidar a una sin tocar a las otras |
| Un solo concepto: comisión | **Cinco conceptos en un solo documento**: comisión de servicio + comisión de producto + propina acumulada − material cargado − renta − anticipos de sueldo | Y **dos de ellos son de naturaleza contraria**: la comisión es gasto del salón, la propina es dinero que nunca fue del salón. Pagarlas juntas está bien; confundirlas en el corte es el descuadre 2 |
| No toca caja | **Sale del cajón** y es un movimiento de caja de primera clase | F-259. Si se registra como "gasto: nómina", el corte no puede explicar por qué el cajón bajó $3,400 un martes |

### 3.24 · F-430 · F-434 · Expediente V4 de belleza · **el dolor 3**

| En el tronco genérico | Aquí (V4) | Por qué la diferencia |
|---|---|---|
| Historial de visitas y notas | **La fórmula es el contenido principal**, no una nota: `6.0 60g + 7.34 30g + ox 20vol 90ml · 35 min`, con fecha, con quién y con el resultado | Si se pierde la fórmula se pierde la clienta. Es la frase del giro y es literal: la clienta vuelve cada 4–6 semanas y lo único que la ata es que le quede igual |
| Se consulta cuando hace falta | **Se abre en CADA visita, antes de tocar a la clienta**, y se llena durante el servicio con guantes puestos | Por eso la captura tiene que ser de **un toque sobre la fórmula anterior** (REPETIR) y sólo se edita lo que cambió. Ver F-154 |
| Alergias como campo de texto | **Alergia, sensibilidad, prueba de mecha con fecha, y bandera roja visible desde la agenda** | Un tinte con PPD sobre un cuero cabelludo sensible manda a alguien al hospital. La bandera tiene que verse **en el bloque de la agenda**, antes de que empiece el servicio, no dentro de una pestaña |
| Sin fotos | **Foto de antes y de después, en cada servicio de color** | Ver §3.25 |

### 3.25 · F-436 · Fotos antes y después

| En el tronco | Aquí | Por qué la diferencia |
|---|---|---|
| Documentación del caso | **Tres usos, y los tres son de negocio**: (1) prueba de en qué estado llegó, para la queja; (2) referencia para reproducir el color; (3) **material de Instagram**, que es el canal de captación número uno del giro | El tercero requiere permiso explícito de la clienta y es una casilla distinta de la del expediente: *"puedo guardar tu foto" ≠ "puedo publicarla"*. Confundirlas es un problema legal y de confianza |
| Se sube desde la ficha | **Se toma desde el teléfono de la estilista, durante el servicio, en dos toques, y queda pegada a la cita** | Si hay que ir a la tablet de recepción, buscar a la clienta y subir un archivo, no se hace nunca |

### 3.26 · F-438 · Consentimiento firmado

| En el tronco | Aquí | Por qué la diferencia |
|---|---|---|
| Documento firmado al iniciar el tratamiento | **Se pide una vez por tipo de procedimiento y vence**: el de color puede durar un año, el de alisado químico es por servicio | Un alisado con formol o un decolorado agresivo son procedimientos con riesgo real. El consentimiento no es papeleo defensivo: es la conversación de *"esto puede quedar naranja y va a costar más arreglarlo"* puesta por escrito antes, no después |
| En papel escaneado | **Firma en la tablet, con el texto en pantalla** | Es el único momento del día en que la tablet se le pasa a la clienta, y hay que diseñarlo como tal: letra grande, texto corto, un botón |

### 3.27 · F-439 · Paquete de sesiones

| En el tronco | Aquí | Por qué la diferencia |
|---|---|---|
| Se venden N sesiones y se descuentan | **Se venden N sesiones, se cobra hoy, y se reconoce el ingreso SESIÓN POR SESIÓN** | Ver `02-DINERO-Y-CAJA.md` §6. Si se reconoce todo al cobrar, el mes que se vende el paquete el salón parece rico y los dos meses siguientes parece pobre — **y la dueña toma decisiones de precio sobre un número falso** |
| Sin comisión de por medio | **Dos comisiones distintas**: una pequeña de venta a quien vendió el paquete, al cobrarlo; y la de servicio a quien da **cada** sesión, al consumirla | Éste es un pleito clásico y hay que resolverlo por diseño: si toda la comisión se la lleva quien vendió, nadie quiere dar las sesiones; si toda se la llevan las que dan las sesiones, nadie vende paquetes |
| El saldo es un número | **El saldo es un pasivo con caducidad**: seis sesiones en doce meses | Sin vigencia, un paquete vendido hace tres años vuelve a aparecer y hay que darlo. Con vigencia, hay que avisar antes de que venza, o es una estafa a ojos de la clienta |

### 3.28 · F-040 · Clientas

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| La ficha existe para **fiar**. El 90% de las ventas son anónimas | La ficha existe para **agendar y recordar**, y **casi no hay venta anónima**: sólo el walk-in con prisa | El teléfono no es un campo opcional: es la llave de la confirmación, del recordatorio y de la recuperación. Sin teléfono, la mitad de las funciones del modelo no operan |
| El campo clave es el saldo | **Los campos clave son teléfono, profesional de siempre, frecuencia de visita y expediente** | Ninguno de los cuatro existe hoy |
| Género irrelevante | **El género importa para el vocabulario**: "clienta" es lo normal del giro pero hay clientes hombres, y el sistema tiene que decirlo bien | Ver `04-INTERFAZ.md` §4.1. "El clienta llegó" delata el sistema en el primer segundo |

### 3.29 · F-102 · Decremento al cobrar

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Al cobrar se explota la receta y bajan los insumos | **El producto de cabina baja AL CERRAR EL SERVICIO, no al cobrar. El producto de reventa sí baja al cobrar** | Dos disparadores distintos en el mismo ticket. El tinte se consumió físicamente a las 10:35; el cobro es a las 12:05. Entre uno y otro la clienta puede irse sin pagar, puede haber un rehacer, o el ticket puede cancelarse — **y el tinte ya se gastó igual** |
| Todo en la misma transacción del cobro | **Dos transacciones distintas, en dos momentos distintos** | Ver `03-INVENTARIO.md` §4. Es la decisión de inventario más importante de este modelo |

### 3.30 · F-105 · Traspaso entre almacenes

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Del almacén de atrás al anaquel. Mismo producto, misma unidad, mismo destino: se vende | **De ANAQUEL a CABINA, y ahí el producto cambia de naturaleza**: deja de ser vendible y pasa a ser insumo | El litro de shampoo profesional que se abre para el lavabo **ya no se puede vender**. Y en muchos salones es el mismo SKU que el frasco del anaquel. Ver F-155 |
| Se hace una vez al día | **Se hace cuando se abre un envase**, y ése es el evento contable | "Abrir" un producto es la operación real: pasa de una pieza cerrada vendible a X mililitros de insumo. Hasta que no se abre, es inventario de reventa |

### 3.31 · F-107 · Alertas de mínimo

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Un insumo bajo mínimo significa que un platillo puede no salir | **Dos clases de alerta con urgencia opuesta**: producto de **cabina** agotado = **cita cancelada**; producto de **anaquel** agotado = venta perdida | No pesan igual y no se deben mostrar igual. Quedarse sin oxidante de 30 volúmenes un jueves con un balayage agendado es un problema de agenda, no de inventario, y hay que avisarlo **contra las citas de los próximos siete días**, no contra un mínimo estático |
| El mínimo es un número por insumo | **El mínimo de cabina se calcula contra la agenda futura**: "tienes 3 balayages agendados esta semana y te alcanza para 2" | Es la alerta más valiosa del modelo y sólo es posible porque existe la agenda. Ningún A1 puede hacerla |

### 3.32 · F-109 · Merma

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Merma de cocina (se quemó, se cayó) y de almacén (se echó a perder) | **Cuatro motivos propios**: mezcla sobrante tirada · producto caducado · producto que se secó o se contaminó · **diferencia de conteo** | El primero es el grande y es estructural: se mezcla de más porque nadie sabe exactamente cuánto va a necesitar esa cabeza. **Entre 10% y 20% de cada mezcla se va al bote** y es normal. Si no tiene su motivo propio, aparece como faltante y acusa a alguien injustamente |
| La merma se registra cuando se detecta | **La mezcla sobrante se registra EN LA MISMA CAPTURA de la fórmula** | Un campo más en la pantalla que ya está abierta: "mezclé 90 g, usé 75". Preguntarlo después es garantizar que no se conteste |

### 3.33 · F-110 · V1 · **reclasificación obligatoria**

Está catalogada como **"V1 · Sin inventario · servicios puros → estética, consultorio, despacho,
gimnasio"**. **Eso es falso para estética y hay que corregirlo en el catálogo.** Ver §7.

| Lo que dice el catálogo hoy | Lo que es de verdad | Por qué importa |
|---|---|---|
| "El módulo entero está apagado" | **El módulo de producto está encendido en dos variantes** (V6 cabina, V2 anaquel) y además **hay un inventario que el catálogo no contempla: el tiempo** | Un salón que apague inventario no puede costear un servicio, no puede saber cuánto tinte le queda y no puede comisionar descontando material. Sería un POS ciego en el 30% de su costo |
| V1 = sin inventario | **V1 = el inventario es la agenda**, con existencia (huecos), agotamiento (el sábado se llena) y caducidad instantánea (el hueco de las 15:00 vale cero a las 15:01) | Es la tesis del arquetipo A3 entera y hay que escribirla en el catálogo, porque **los once modelos que vienen la van a heredar** |

### 3.34 · F-115 · V6 · Peso y volumen

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Gramos y mililitros de insumo de cocina, con receta fija por platillo | **Gramos de tinte y decolorante, mililitros de oxidante y tratamiento, piezas de guante y gorro, metros de papel aluminio** | Las unidades son las mismas; lo que cambia radicalmente es la receta. Ver §3.35 |
| El insumo se compra y se consume en la misma unidad | **El insumo se compra en pieza (un tubo de 60 g) y se consume en gramos**, y **el tubo abierto es el problema** | Un tubo de 60 g del que se usaron 35 no es ni un tubo ni 25 gramos: es un tubo abierto. El conteo físico real de un salón es **contar tubos cerrados y estimar los abiertos**. Ver `03-INVENTARIO.md` §7 |

### 3.35 · F-128 · F-129 · Receta y explosión

**Aquí está la diferencia técnica más profunda entre este modelo y `restaurante`, y es la que
justifica F-154.**

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| La receta es **fija por producto**: una arrachera lleva siempre 280 g de carne | **No hay receta fija.** Una misma clienta con el mismo servicio lleva 60 g o 110 g de tinte según largo, densidad y cuánta cana tenga | Si el sistema explota una receta fija, **el inventario de tinte miente desde el primer día** y el costo del servicio también. Y como el tinte es el 80% del costo variable del salón, miente el margen entero |
| La receta explota **sola, al cobrar** | **La fórmula se captura a mano, al aplicar**, y ése es el consumo | Es más trabajo para la estilista y **no hay alternativa honesta**. La contrapartida es que esa captura vale por tres: expediente, inventario y costo. Ver F-154 |
| La receta es el estándar contra el que se mide | **La fórmula base del catálogo existe, pero es SÓLO una sugerencia de arranque y un teórico contra el que comparar** | F-133 (rendimiento real contra teórico) se vuelve útil de otra forma: no para medir al cocinero, sino para **saber si el precio del servicio está bien puesto**. Si el tinte medio consume $145 de producto y se cobra $800 con 50% de comisión, al salón le quedan $255 y hay que saberlo |

### 3.36 · F-200 · Carrito

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| El carrito es la cuenta de la mesa y **crece durante 90 minutos** con rondas | El carrito **nace lleno**: los servicios ya estaban agendados. Lo que se añade después es la excepción (un tratamiento que se sugirió, un producto que se vendió) | Es la diferencia entre "abrir y ver crecer" y "confirmar y ajustar". La pantalla de cobro arranca con las líneas ya puestas y el foco en **cobrar**, no en **agregar** |
| Cada línea es un platillo | **Cada línea trae su profesional**, y pueden ser distintos en el mismo ticket | Sin eso no hay comisión. Es la columna que ningún carrito de A1 ni A2 tiene |
| El descuento es del ticket | **El descuento tiene un efecto visible sobre la comisión de quien atendió, y hay que enseñárselo antes de aplicarlo** | Ver §3.37 |

### 3.37 · F-202 · F-203 · Descuentos

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| El descuento se come la mitad de la utilidad de la línea porque el margen es 20% | El margen es 50–70%, **pero el descuento se reparte entre el salón y la profesional**, y ahí está el conflicto | Si la comisión se calcula sobre lo cobrado, un descuento del 20% le baja el 20% de su comisión a alguien que no lo autorizó. Si se calcula sobre lista, el salón absorbe el descuento completo y sale peor que antes |
| El cajero no puede descontar | **La profesional sí puede**, hasta un tope, porque está cerrando la venta con la clienta enfrente | Pero **la pantalla tiene que decirle el costo**: *"aplicar 20% baja tu comisión $64"*. Con esa frase el descuento se aplica cuando vale la pena y no cuando no |
| El descuento fantasma es el robo silencioso | Aquí el robo silencioso es otro: **la transferencia a la cuenta personal**. Ver §3.38 | El descuento fantasma requiere que la que descuenta sea la que cobra, y aquí muchas veces cobra recepción |

### 3.38 · F-212 · Transferencia · **el descuadre número uno del giro**

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| La clienta transfiere a la cuenta del negocio y enseña el comprobante | **La clienta transfiere a la cuenta de la profesional**, que es quien tiene el teléfono a la mano, y luego "ya lo pasa" | Es el equivalente exacto del descuento fantasma de `abarrotes` y es el agujero más grande del giro. El servicio se dio, el producto se consumió, la clienta pagó, y **el dinero nunca entró al salón** |
| No hay nada que hacer salvo verificar contra el banco | **Sí hay algo que hacer, y es de producto**: la transferencia se captura con el CLABE o el alias de destino, elegido de una lista corta —cuenta del salón o cuenta de quien atendió—, y si es la segunda, **el sistema la registra como cobrada por la profesional y la descuenta de su liquidación** | Eso lo convierte de fuga a mecanismo: la profesional puede cobrar en su cuenta, y esos pesos se le restan de lo que se le va a pagar. Deja de ser robo y pasa a ser un anticipo. **Es la solución que un sistema puede dar; fingir que la evita sería mentir** |
| Transferencia pendiente de confirmar | Igual: se marca pendiente y sale del efectivo esperado | Heredado de `abarrotes` §5 tal cual |

### 3.39 · F-220 · Ticket

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Lleva mesa, mesero, hora de apertura. **Dos documentos**: precuenta y ticket | **Uno solo**, y lleva **quién atendió, qué se hizo, y la fecha sugerida de la próxima visita** | La precuenta no aplica: no hay nada que revisar, la clienta sabe lo que pidió. Lo que sí importa es que se vaya con **cuándo volver**: "tu retoque toca el 12 de octubre". Es la función de retención más barata que existe y es papel impreso |
| Sin expediente | Puede llevar, si la clienta lo pide, **la fórmula de su color** | Hay salones que se niegan porque es su activo. Es una perilla, y la decisión es de la dueña, no nuestra |
| Se imprime siempre | **Casi nunca se imprime.** Se manda por WhatsApp | El ticket de $950 va al teléfono. El rollo se usa para el corte y poco más |

### 3.40 · F-221 · F-222 · Cancelación y devolución

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Se cancela el platillo y se devuelve el insumo si no salió | **Al cancelar un ticket, el producto de cabina YA SE CONSUMIÓ y no regresa** | El tinte está en la cabeza. La cancelación de un ticket **no** revierte el movimiento de cabina; **sí** revierte el de anaquel. Son dos comportamientos distintos en la misma transacción |
| Sin comisión de por medio | **La cancelación escribe una contrapartida en el ledger de comisión** | F-443. Nunca un UPDATE |
| La devolución es reposición de platillo | **La devolución de un servicio no existe: existe REHACER** | F-444. "El color se corrió" no se devuelve, se corrige. Y corregir consume producto otra vez, ocupa un hueco otra vez, y **no se paga comisión otra vez** — ése es el acuerdo estándar del giro y hay que poder configurarlo |

### 3.41 · F-231 · Movimientos de caja

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Once de quince movimientos no suman a ventas, y son de *dinero en tránsito* (recargas, fiado, casco) | **Aquí los movimientos propios son de REPARTO**, no de tránsito: liquidación a la profesional, entrega de propina acumulada, cobro de renta de estación, anticipo de cita cobrado, anticipo de cita aplicado | La naturaleza del dinero ajeno es distinta: en una tiendita es de la compañía de luz; aquí **es de la persona que está parada al lado**. Eso cambia la urgencia: un error en el reparto se descubre esa misma noche y tiene nombre |
| Sin salidas de nómina | **La liquidación es la salida de caja más grande del día**, muchas veces mayor que cualquier gasto | F-259. Si se mete en "gasto: nómina", el corte no puede explicar el cajón |

### 3.42 · F-234 · Corte diario y su PDF

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Contesta: **¿cuadró la caja y cuánto le toca a cada mesero de propina?** | Contesta: **¿cuadró la caja y cuánto le toca a cada estilista de comisión?** — y la propina va aparte, porque es otra cosa | Es literalmente la pregunta de `04-SISTEMA-DE-DISENO.md` §5 para este giro. La diferencia con restaurante no es cosmética: **allá el reparto es de propina y es dinero ajeno; aquí hay DOS repartos, uno de dinero del salón (comisión) y otro de dinero ajeno (propina), y los dos salen del mismo cajón la misma noche** |
| Lleva insumos consumidos por receta | Lleva **producto de cabina consumido según las fórmulas capturadas**, contra el teórico | Aquí el teórico es orientativo, no normativo. Ver §3.35 |
| Sin agenda | **Lleva una sección de agenda entera**: citas atendidas, walk-in, no-show con nombre, huecos y su costo, ocupación por profesional | Es la mitad del negocio y no aparece en ningún corte de ningún sistema del segmento |
| Sin renta | Lleva **renta de estación cobrada**, en su propio renglón fuera de ventas | Si entra como venta, el ticket promedio y la ocupación mienten |

Ver el documento completo, sección por sección, en `02-DINERO-Y-CAJA.md` §9.

### 3.43 · F-240 · F-243 · Propinas · V4 directa al profesional

| En restaurante (V2 sugerida + tronco) | Aquí (V4) | Por qué la diferencia |
|---|---|---|
| La propina va **al tronco** y se reparte por puntos entre mesero, cocina, barra y garrotero | **La propina es de quien te atendió. Punto.** Sin tronco, sin puntos, sin reparto | Es una relación de una persona con una persona durante hora y media. La única excepción es **la propina de apoyo a quien lava**, que es un monto chico y directo, y que **la clienta da aparte**, no un porcentaje del total |
| Se sugiere en pantalla al cobrar (10/15/20%) | **Se sugiere igual** (12/15/18% es lo que ofrecen las terminales del mercado), pero **el destinatario se elige o se deduce de quién atendió** | Si el ticket tiene dos profesionales, la propina se reparte en la proporción del servicio, **y se puede sobrescribir**. La clienta a veces dice "$200 para Karla y $50 para la que me lavó" |
| Casi toda la propina es en efectivo o en el ticket de tarjeta | **Mayormente en efectivo y directo a la mano** — las estilistas la prefieren porque la reciben al momento, y el salón también porque la tarjeta cobra comisión. Pero la que entra por terminal **crea un pasivo** | Ver F-260. Y hay un punto legal: **la propina cobrada con tarjeta tiene que entregarse al trabajador; no puede usarse como flujo del negocio** |
| Nunca entra en ventas, utilidad, costo ni margen | **Igual, y esto no se negocia**: regla de Fase 1 | La única regla del bloque que es idéntica |

### 3.44 · F-246 · Liquidación de propinas

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Se liquida por periodo, repartida por puntos entre varias personas | **Se liquida junto con la comisión, en el mismo documento, pero en renglón separado y con la suma por separado** | La profesional tiene que ver las dos cifras distintas o va a creer que su comisión es mayor de lo que es. **"Te toca $1,840 de comisión y $420 de propina" ≠ "te toca $2,260"** |

### 3.45 · F-050 · Ventas por periodo

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Se compara contra el día anterior y contra el mes | **Se compara contra el MISMO DÍA DE LA SEMANA**, siempre | La semana de un salón tiene forma fija y extrema: el lunes está cerrado, el martes y el miércoles están muertos, el viernes y el sábado valen el 45% de la semana. Comparar un martes contra un sábado no dice nada y comparar contra "ayer" dice mentiras |
| El desglose que importa es por categoría | **El desglose que importa es servicio contra producto, y por profesional** | Son las dos preguntas que dispara: ¿estoy vendiendo producto? y ¿quién está produciendo? |

### 3.46 · F-052 · Utilidad y margen

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Margen = venta − costo de la mercancía | **Margen = venta − producto consumido − COMISIÓN** | La comisión es el costo variable más grande del negocio: 40% a 60% del servicio. Un margen que no la reste dice que un tinte de $950 deja 88%, cuando deja 38%. **Es el número más engañoso del giro y el que más daño hace** |
| El costo es conocido al centavo | **El costo del producto es estimado**, porque sale de fórmulas capturadas a mano con básculas de cocina | Y hay que decirlo en la interfaz: el margen se muestra con una marca de "estimado" cuando la fórmula no se capturó. Fingir precisión aquí es peor que admitir el rango |

### 3.47 · F-054 · Ventas por empleado

| En restaurante | Aquí | Por qué la diferencia |
|---|---|---|
| Es un reporte informativo: cuánto vendió cada mesero | **Es la base del pago.** De este número sale el dinero que alguien recibe esa noche | Eso cambia todo el nivel de exigencia: tiene que cuadrar al centavo, tiene que ser auditable línea por línea, y **la profesional tiene que poder verlo en su teléfono en vivo**, no al final |
| Se mira semanalmente | **Se mira varias veces al día por la persona a la que le toca el dinero** | Ver `04-INTERFAZ.md` §4.3.6 |

### 3.48 · F-056 · Dashboard

| En abarrotes | Aquí | Por qué la diferencia |
|---|---|---|
| Siete indicadores centrados en **la compra y el faltante**. Se lee dos veces al día en el teléfono | **Ocho indicadores centrados en LA AGENDA FUTURA y en quién produce.** Y no es la pantalla de inicio: la agenda lo es | El indicador estrella es **la ocupación de mañana**, porque es el único número del que todavía se puede hacer algo. Todo lo que mira hacia atrás es secundario aquí |
| Se calcula sobre el día natural | **Sobre el día natural, pero comparando contra el mismo día de la semana** | Ver §3.45 |

### 3.49 · F-950 · Campañas por WhatsApp

| En el tronco | Aquí | Por qué la diferencia |
|---|---|---|
| Envío masivo a un segmento | **Envío individual asistido.** El sistema arma la lista y redacta; la dueña manda | La relación es personal. Una promoción masiva a las clientas de un salón de barrio se lee como spam y quema la relación que sostiene el negocio. Mismo criterio que el fiado en `abarrotes` §6.4 |
| El segmento es demográfico | **El segmento es temporal y sale de la agenda**: "las que tocaba retoque esta semana y no agendaron" | Es el único segmento que vale, y sólo existe porque hay agenda y frecuencia |

### 3.50 · F-951 · Recuperación de inactivas · **la función más rentable que nadie tiene**

| En el tronco | Aquí | Por qué la diferencia |
|---|---|---|
| "No compra hace 90 días" | **"Pasó su frecuencia."** El retoque de raíz es cada 4–6 semanas. Una clienta de color que lleva 9 semanas **ya se fue a otro lado**, y a las 12 ya no vuelve | El umbral no es un número global: es **la frecuencia propia de esa clienta con ese servicio**, calculada de su historial. Doña Lupe viene cada 8 semanas y eso es normal para ella; Karina viene cada 4 y a las 6 hay que llamarle |
| Se corre una vez al mes | **Es un indicador vivo del dashboard**, con nombres y teléfonos | Recuperar una clienta de color que gasta $950 cada cinco semanas son $9,900 al año. Es, en pesos, la función de mayor rendimiento de toda la carpeta, y sólo es posible porque hay expediente y agenda |

---

## 4 · LAS `[+]` · exclusivas del arquetipo · **nacen aquí**

```
F-402 · F-403   Agenda por profesional y por recurso
      El esqueleto de A3. La heredan los once, con el eje invertido en
      spa (la cabina manda) y en consultorio (el doctor manda y no hay
      recurso). Se construye una vez, con el eje como configuración.

F-415   Servicio con tiempo pasivo intercalable            ← LA JOYA
      Exclusiva de los giros donde el cliente espera algo que pasa solo:
      estética (procesado del color, 25–45 min), nail salon (secado y
      cabina UV), spa (mascarilla, envoltura), fisioterapia (electrodos,
      compresas), dental (anestesia haciendo efecto, fraguado).
      NO la necesitan barbería, consultorio médico ni fotografía.
      Es entre el 25% y el 40% de la capacidad real de un salón y
      NINGÚN sistema del mercado la modela. Si sólo se construye una
      cosa de esta carpeta, es ésta.

F-416   Bloqueo de agenda no productivo
      Exclusiva de A3 y A7. Sin ella, el denominador de la ocupación
      está mal en todos los modelos de agenda, todos los días.

F-417   Costo del hueco
      Exclusiva de A3 y A7. Es el único arquetipo donde el inventario
      caduca cada minuto y por lo tanto el único donde "lo que no se
      vendió" tiene un precio calculable.

F-414   Anticipo de cita
      Nace aquí y en `tatuajes` pasa de opcional a obligatorio. En
      `estudio-fotografia` y `salon-eventos` (A7) es la norma.

F-420 … F-429 · F-440 … F-444   El bloque de profesional y comisión
      Nace aquí completo. Lo heredan los once y también
      `distribuidora-mayorista` (comisión por vendedor) e
      `inmobiliaria` (comisión por agente), que son A5 y A10 pero
      pagan igual. El ledger de comisión (F-443) y la regla (F-440)
      son universales; lo que cambia es la base.

F-434   Expediente V4 de belleza
      Exclusiva de estética, barbería (ligero), nail salon y tatuajes.
      Dental, médico y fisio usan V1; veterinaria usa V2.

F-154   Fórmula capturada al aplicar
      Exclusiva de los giros donde el consumo NO es predecible desde el
      catálogo: estética, nail salon, tatuajes (tinta), veterinaria
      (dosis por peso del animal), dental (material de obturación).
      En restaurante y en panadería la receta es fija y esto no aplica.
      Es la contraparte exacta de F-129 y NO la sustituye: conviven.

F-155   Doble destino del mismo SKU
      Exclusiva de los giros que usan y venden lo mismo: estética, spa,
      veterinaria (alimento que se da al hospitalizado y se vende),
      taller (aceite que se pone y se vende), autolavado.
      Hoy no existe ningún ID para esto y es la causa número uno de
      "el shampoo desaparece" en un salón.

F-259 · F-260   Liquidación como salida de caja · propina como pasivo
      F-259 la heredan los once y todo giro que pague comisión en
      efectivo del cajón. F-260 la heredan todos los de propina V4:
      estética, barbería, nail, spa, tatuajes.
      F-260 es, mecánicamente, el mismo objeto que F-256 (casco) de
      `abarrotes`: dinero que entró al cajón y que hay que devolver.
      Dos giros lejanísimos llegando al mismo patrón es una señal de
      que el patrón está bien encontrado.
```

---

## 5 · LO QUE FALTA · pendientes de este modelo

Este modelo **no está construido en absoluto**. No hay plantilla, no hay agenda, no hay nada del
bloque F-4xx. Lo que sigue es el hueco con su costo operativo.

| ID | Función | Qué duele hoy sin ella |
|---|---|---|
| **F-400…F-404** | El motor de agenda entero | **Sin esto no hay modelo.** Es la pantalla de inicio, la unidad de trabajo y el inventario del negocio al mismo tiempo. Hoy MorphiqPOS no tiene ni un calendario |
| **F-415** | Tiempo pasivo intercalable | Sin ella la agenda bloquea al profesional durante el procesado y **el salón pierde 25–40% de capacidad**. Es la diferencia entre atender 6 y atender 9 clientas al día con la misma gente |
| **F-412 + F-406 + F-414 + F-409** | No-show, recordatorio, anticipo, lista de espera | **Es el dolor 1 completo.** 15–20% de no-show promedio, evitable hasta menos de 8%. En un salón de $180,000 al mes son ~$32,000 mensuales de capacidad perdida |
| **F-423 + F-440 + F-443 + F-427** | La comisión completa, con su regla y su ledger | **Es el dolor 2 completo.** Hoy se calcula con calculadora el domingo y es la fuente número uno de pleitos y de rotación. Es también, en pesos, el mayor costo variable del negocio y el que nadie tiene medido |
| **F-434 + F-154 + F-436** | Expediente de belleza, fórmula y fotos | **Es el dolor 3 completo.** La fórmula vive en papelitos y en el teléfono de la estilista. El día que se va, se va con el activo |
| **F-155** | Doble destino del SKU | Sin ella, cabina y anaquel se mezclan y el shampoo "desaparece". Es el error de inventario número uno del giro |
| **F-040 en el puente** | Clientas | La tabla existe desde `002_catalogo.sql` y **no está en `mapa.ts`**. `abarrotes` y `ferreteria` ya lo señalaron. **Aquí es bloqueante de verdad:** sin clienta no hay cita, no hay expediente, no hay cartera, no hay recordatorio y no hay recuperación. Es la deuda transversal más cara del proyecto |
| **F-243 + F-260** | Propina directa y su pasivo | Hoy sólo existe V2 (sugerida al cobrar, al tronco). La propina de un salón se reparte al revés y la de tarjeta es una deuda del salón que hoy no tiene dónde vivir |
| **F-259** | Liquidación como movimiento de caja | Hoy sería "gasto: nómina" y el corte no podría explicar por qué bajó el cajón. Es la salida más grande del día |
| **F-441** | Renta de estación | Sin ella, Sol se modela como empleada con 100% de comisión, y **el ticket promedio, la ocupación y el margen del salón salen todos mal** |
| **F-017** | Diccionario de vocabulario | **Tercer modelo que lo pide.** `abarrotes` avisó, `ferreteria` lo dio por hecho consumado, y aquí ya no es cosmético: "mesa" → "estación", "mesero" → "estilista", "comensal" → "clienta" con género. Y **once modelos más vienen detrás de éste** |
| **F-635** | Cuentas por pagar | Deuda heredada. Aquí pesa menos que en retail: un salón le compra a tres distribuidores. Pero sigue sin existir |

---

## 6 · FUNCIONES QUE FALTAN EN EL CATÁLOGO

**Se añaden a `03-CATALOGO-DE-FUNCIONES.md` antes de construir nada.** Sin ID canónico se van a
reinventar con otro nombre en `barberia`, en `spa-masajes` y en los otros nueve.

**IDs tomados ya por otros modelos, para no chocar:** `abarrotes` propuso F-058, F-146, F-147,
F-148, F-149, F-254, F-255, F-256, F-257, F-988. `cafeteria` propuso F-248, F-249, F-328…F-331,
F-936. `ferreteria` propuso F-059, F-060, F-150, F-151, F-152, F-153, F-258, F-638, F-639. Este
modelo arranca en **F-154**, **F-259** y en el bloque **F-4xx**, que está intacto.

| ID propuesto | Función | Bloque | Por qué hace falta |
|---|---|---|---|
| **F-154** | **Fórmula capturada al aplicar · consumo real del servicio** | F-1xx · depende de F-115, F-434 | F-128/F-129 son receta **fija** que **explota al cobrar**, y eso es correcto para un platillo y falso para una cabeza: la misma clienta lleva 60 g o 110 g según largo, densidad y cana. Si el sistema explota una receta fija, el inventario de tinte y el costo del servicio mienten desde el primer día, y como el color es el 80% del costo variable del salón, miente el margen entero. Necesita: captura en el momento de aplicar, con la fórmula anterior de esa clienta como valor inicial y un botón REPETIR, campo de sobrante desechado, y **triple efecto de una sola captura**: expediente (F-434), movimiento de stock (F-101) y costo de la línea (F-130). **No sustituye a F-129: conviven.** Un salón que también venda café en la recepción usaría las dos |
| **F-155** | **Doble destino del mismo SKU: cabina y anaquel** | F-1xx · depende de F-100, F-105 | El litro de shampoo profesional que se abre para el lavabo **deja de ser vendible** y pasa a ser insumo. En muchos salones es el mismo SKU que el frasco del anaquel. Hoy no hay forma de expresar "el mismo producto en dos almacenes con naturaleza distinta y conversión al abrirlo". Sin esto, **el shampoo desaparece**: se compra por litro, se vende por frasco, y la existencia nunca cuadra. Necesita: almacén tipo `cabina` y tipo `venta`, el evento **ABRIR** como traspaso con conversión de unidad, y que el producto de cabina no aparezca nunca en la búsqueda de venta. Lo heredan spa, veterinaria, taller y autolavado |
| **F-259** | **Liquidación al profesional como salida de caja** | F-2xx · depende de F-231, F-427 | La salida de efectivo más grande del día de un salón es pagarle a Karla su 50%. Hoy sólo existe "gasto" genérico, y metido ahí el corte no puede explicar por qué el cajón bajó $3,400 un martes ni separar comisión de propina. Necesita: categoría propia de movimiento, desglose de los cinco conceptos, y **escribir el movimiento de caja y marcar las comisiones como liquidadas en la misma transacción**. Uno no existe sin el otro, igual que F-254 en `abarrotes` |
| **F-260** | **Propina en tarjeta como pasivo hacia el profesional** | F-2xx · depende de F-243, F-245 | La propina que entra por terminal es dinero del salón en la cuenta del salón que **no es del salón**: legalmente hay que entregarla al trabajador y no puede usarse como flujo del negocio. Es, mecánicamente, el mismo objeto que **F-256 (casco)**: entra y hay que devolverlo. Necesita: saldo vivo de propina por persona, entrega registrada contra ese saldo, y **una alerta cuando el saldo lleva más de N días sin entregarse**. Sin esto la propina de tarjeta o se pierde o se paga dos veces, que es el descuadre 2 del giro |
| **F-414** | **Anticipo para asegurar la cita** | F-4xx · depende de F-408 | Es lo único que de verdad baja el no-show, porque cobrarle a quien no vino es imposible en la práctica en México. Lo normal del giro: 20–30% en servicio estándar, hasta 50% en servicio caro o largo. Necesita: cobro por adelantado (en el salón o por pasarela desde la reserva en línea), **saldo como pasivo hasta que se da el servicio**, aplicación automática al ticket, y **destino explícito si hay no-show**: se reconoce como ingreso por cancelación, que **no es venta de servicio** porque no hubo servicio. No lo cubre F-724 (anticipo de reserva de espacio), que es de A7 y con otra política |
| **F-415** | **Servicio con tiempo pasivo intercalable (procesado)** | F-4xx · depende de F-401, F-402, F-403 | **La función más importante del arquetipo.** Un retoque son 20 min de aplicación + **35 min en que la clienta ocupa la silla y la estilista está libre** + 40 min de lavado, corte y secado. Si la duración es un número, el sistema bloquea a la estilista 95 minutos y el salón pierde 25–40% de capacidad. Necesita: la duración del servicio como **secuencia de tramos con tipo** (activo / pasivo / cierre), **reserva independiente de persona y de estación**, y que el motor de disponibilidad sepa ofrecer un hueco dentro del tramo pasivo de otra cita. AgendaPro, Booksy, Fresha y Zenoti tratan la duración como un número. **Esto es la diferencia de producto** |
| **F-416** | **Bloqueo de agenda no productivo** | F-4xx · depende de F-402, F-422 | Comida, curso, junta, "voy al banco", vacaciones de tres días. Hoy se modela como cita en $0 —y entonces contamina la venta y el conteo de citas— o no se modela —y entonces cuenta como hueco y la ocupación sale 15 puntos baja todos los días—. Las dos son malas. Necesita: tipo propio con motivo, que **salga del denominador de la ocupación**, y que no genere ticket ni comisión. Es chica y sin ella **todo el indicador de ocupación de A3 miente** |
| **F-417** | **Costo del hueco · venta perdida de agenda** | F-4xx · depende de F-404, F-412, F-416 | Un producto que no se vendió sigue en el anaquel y se ve. **Una hora que no se vendió no deja rastro.** Nadie anota "hoy Dany estuvo dos horas sentada". Necesita: valuar el hueco al ticket promedio de ese profesional en esa franja, separar **hueco por no-show** de **hueco nunca agendado** —porque las decisiones que disparan son distintas: pedir anticipo contra hacer promoción—, y acumularlo por día, semana y profesional. Es el número que convierte el dolor 1 de sensación en pesos |
| **F-428** | **Cita atendida por más de un profesional · reparto** | F-4xx · depende de F-423, F-443 | Brenda lava, Karla tiñe, Dany seca porque Karla se fue. Un servicio, tres personas. Hoy la comisión es de una sola. Necesita: reparto por porcentaje o por servicio dentro de la cita, con la **suma obligada a 100%**, valor por omisión razonable (todo a quien la tomó) y ajuste de un toque. Sin esto, o se pelea a mano cada vez o alguien trabaja gratis. Lo heredan spa (masajista + recepción), dental (dentista + asistente) y veterinaria (médico + auxiliar) |
| **F-429** | **Origen de la clienta y su efecto en la tarifa de comisión** | F-4xx · depende de F-425, F-440 | Muchos salones pagan 40% sobre una clienta de la casa y 50–60% sobre una que trajo la profesional. Es el mecanismo con el que el salón reconoce quién construye cartera, y es completamente invisible hoy. Necesita: marca de origen en la relación clienta-profesional, fijada en la primera visita y **no editable sin autorización de la dueña**, y su tarifa asociada en la regla de comisión |
| **F-440** | **Regla de comisión: base, momento de causación y excepciones** | F-4xx · depende de F-423, F-424 | **Ésta es la función que resuelve el dolor 2**, y es de configuración, no de cálculo. Tiene que contestar por escrito, y una sola vez: (1) base = lista o cobrado; (2) antes o después de IVA; (3) se descuenta material sí/no y cómo (F-442); (4) cuándo se causa: al cobrar, al cerrar la cita, o al liquidar; (5) qué pasa con propina (nunca es base), descuento, cancelación, devolución, rehacer (F-444) y paquete de sesiones. Cuatro esquemas soportados: porcentaje fijo, escalonado por meta, monto fijo por servicio, y sin comisión (renta). **Toda regla lleva vigencia y queda versionada**: cambiar el porcentaje no puede recalcular lo ya causado |
| **F-441** | **Renta de estación (silla)** | F-4xx · depende de F-420 | Una parte del giro opera así: la profesional es independiente, paga $150–$300 al día o $1,200–$4,000 al mes, y se queda el 100%. Si se modela como empleada con comisión del 100%, **su facturación entra a la venta del salón y el ticket promedio, la ocupación, el margen y hasta el ISR salen mal**. Necesita: tipo de relación propio, renta con periodicidad y cobro como **ingreso que no es venta de servicio**, agenda propia dentro del salón, uso opcional de producto del salón facturado aparte, y **visibilidad limitada de sus datos para el salón**. Ningún POS del segmento lo tiene y es una parte estructural del mercado mexicano |
| **F-442** | **Cargo de material al servicio y su efecto en la comisión** | F-4xx · depende de F-154, F-440 | En muchos salones la estilista paga el material que usa, o el salón lo descuenta antes de comisionar. Es la pregunta 3 del pleito. Hoy no hay forma de expresarlo. Necesita: tres modos —lo absorbe el salón · se descuenta de la base antes de comisionar · se le cobra a la profesional en la liquidación—, configurable por servicio y por profesional, y **visible en la pantalla en el momento de capturar la fórmula**, no al final del mes |
| **F-443** | **Ledger inmutable de comisión causada** | F-4xx · depende de F-423, F-440 | Es el mismo patrón que `movimientos_stock` aplicado al dinero de las personas, y por la misma razón: **una comisión que cambia sola después de que alguien la vio destruye la confianza en el sistema entero**, aunque el número final sea correcto. Necesita: asiento por línea de ticket con la regla y la tasa **vigentes en ese momento**, sin UPDATE nunca, corrección sólo por contrapartida con motivo y autor, y saldo por profesional derivado del ledger. Es lo que permite que Karla vea su acumulado en vivo a las 15:00 y le crea |
| **F-444** | **Rehacer sin cobro (servicio de garantía)** | F-4xx · depende de F-154, F-443 | "El color se corrió" no se devuelve: se corrige. Corregir **consume producto otra vez, ocupa un hueco otra vez, y no paga comisión otra vez** —ése es el acuerdo estándar del giro—. Hoy eso o se registra como cortesía (y el producto desaparece del costo) o no se registra (y la ocupación y el margen mienten). Necesita: cita ligada a la original, sin venta, **con consumo de producto y con costo imputado al servicio original**, comisión configurable (por omisión no se paga) y **un indicador de rehacer por profesional**, que es el único dato de calidad medible que existe en este giro |

**Además, tres reclasificaciones del catálogo que este modelo obliga:**

1. **F-110 (V1 · Sin inventario)** deja de llamarse "sin inventario" y pasa a **"V1 · el tiempo es el
   inventario"**, con los giros corregidos. La descripción actual —"el módulo entero está apagado,
   servicios puros → estética, consultorio, despacho, gimnasio"— **es falsa para estética, spa,
   veterinaria y tatuajes**, que consumen producto todos los días. Ver §3.33.
2. **F-401 (duración por servicio)** deja de ser `[=]` y pasa a `[≠]`. En dental, médico y
   fotografía la duración es un número; en estética, nail salon, spa y fisioterapia es una secuencia
   activo-pasivo-cierre. Ver §3.7 y F-415.
3. **F-424 (comisión sobre producto vendido)** deja de ser `[=]` y pasa a `[≠]`. En una boutique
   comisiona quien vendió; aquí comisiona **quien atendió**, aunque cobre otra persona, y con un
   porcentaje distinto al del servicio. Ver §3.20.

---

## 7 · DEPENDENCIAS

Las flechas se leen "necesita".

```
F-400 Calendario                          ← LA RAÍZ DE TODO
  → F-040 Clientas en el puente           (HOY NO ESTÁ. Es lo primero de lo primero)
  → F-420 Ficha del profesional           (una agenda sin dueño no existe)
  → F-422 Horario y días libres           (el marco dentro del que hay huecos)
  → F-401 Duración por servicio           (el bloque necesita largo)

F-401 Duración  →  F-415 Tiempo pasivo
  F-401 nace como número y F-415 la convierte en secuencia.
  SE CONSTRUYE DIRECTAMENTE COMO SECUENCIA. Construir el número y
  después migrar a secuencia cuesta el doble y rompe todo lo agendado.

F-415 Tiempo pasivo intercalable
  → F-402 Agenda por profesional          (qué se libera)
  → F-403 Agenda por recurso              (qué NO se libera: la estación)
  → F-404 Disponibilidad                  (el motor tiene que saber ofrecerlo)
  → F-410 Sobrecupo                       (meter una cita dentro de otra ES el sobrecupo aquí)

F-404 Disponibilidad y huecos
  → F-416 Bloqueo no productivo           (sin esto el hueco está mal contado)
  → F-422 Horario                         (el denominador)

F-417 Costo del hueco
  → F-404 Disponibilidad                  (qué es un hueco)
  → F-412 No-show                         (de dónde vino el hueco)
  → F-054 Ventas por empleado             (a qué precio se valúa)

F-412 No-show
  → F-406 Confirmación y recordatorio     (sin recordatorio, el no-show no es evitable y
                                           medirlo es sólo llevar la cuenta de la desgracia)
  → F-414 Anticipo                        (la consecuencia)
  → F-409 Lista de espera                 (qué hacer con el hueco liberado)

F-414 Anticipo
  → F-408 Política de cancelación         (la regla que lo dispara)
  → F-231 Movimientos de caja             (entra dinero que no es venta)
  → F-215 Pasarela                        (SÓLO si hay reserva en línea. En el salón es efectivo)

F-423 Comisión por servicio
  → F-440 Regla de comisión               (sin la regla, la comisión es una opinión)
  → F-443 Ledger de comisión              (dónde se escribe)
  → F-054 Ventas por empleado             (sobre qué se calcula)
  → F-021 Categorías / F-020 Catálogo     (la tasa puede ser por servicio)

F-440 Regla de comisión
  → F-442 Cargo de material               (una de las cinco preguntas)
  → F-428 Reparto entre profesionales     (otra)
  → F-444 Rehacer                         (otra)
  → F-429 Origen de la clienta            (otra)
  → F-011 Impuestos                       (antes o después de IVA: la quinta)

F-443 Ledger de comisión
  → F-101 Ledger de stock                 (NO es dependencia: es el MISMO PATRÓN.
                                           Se copia la forma, no el código)
  → F-221 Cancelación / F-222 Devolución  (las contrapartidas)

F-427 Liquidación
  → F-443 Ledger                          (qué se liquida)
  → F-246 Liquidación de propinas         (el segundo renglón, separado)
  → F-259 Salida de caja                  (de dónde sale el dinero)
  → F-441 Renta de estación               (lo que se resta, si aplica)
  → F-442 Material                        (lo que se resta, si aplica)

F-154 Fórmula capturada
  → F-115 V6 peso y volumen               (unidades)
  → F-434 Expediente V4                   (dónde vive)
  → F-101 Ledger                          (el consumo es un movimiento normal)
  → F-130 Costeo por insumo               (el costo de la línea)
  → F-155 Doble destino                   (de qué almacén sale)

F-155 Doble destino
  → F-100 Existencia por almacén          (ya existe)
  → F-105 Traspaso                        (ABRIR es un traspaso con conversión)
  → F-111 V2 stock simple                 (el lado del anaquel)

F-107 Alerta de cabina contra agenda      ← la alerta que sólo A3 puede dar
  → F-100 Existencia                      (cuánto hay)
  → F-400 Calendario                      (qué viene)
  → F-154 Fórmula                         (cuánto gasta cada servicio, de verdad)

F-260 Propina como pasivo
  → F-243 V4 directa al profesional       (de quién es)
  → F-245 Desglose por método             (cuál entró por terminal)
  → F-231 Movimientos de caja             (la entrega es una salida)

F-434 Expediente V4
  → F-040 Clientas                        (de quién es el expediente)
  → F-436 Fotos / F-437 Documentos        (el contenido)
  → F-438 Consentimiento                  (lo que lo hace defendible)

F-951 Recuperación de inactivas
  → F-041 Historial de visitas            (de dónde sale la frecuencia)
  → F-425 Cartera                         (a quién le habla quién)
  → F-950 Campañas WhatsApp               (por dónde)
```

---

## 8 · ORDEN DE CONSTRUCCIÓN

No es el orden fácil. Es el orden en que A3 deja de no existir.

```
TANDA 0 · la deuda que bloquea todo
  1.  F-040  Clientas en el puente, comandos y pantalla
             ← `abarrotes` y `ferreteria` lo pidieron. Aquí NO SE PUEDE
               EMPEZAR sin esto: no hay cita sin clienta.
  2.  F-420  Ficha del profesional + F-422 horario + F-421 servicios que da
  3.  F-401 + F-415  Duración COMO SECUENCIA activo-pasivo-cierre
             ← se construye directamente como secuencia, nunca como número

TANDA 1 · la agenda, que es el producto
  4.  F-400  Calendario día, rejilla por profesional
  5.  F-402  Agenda por profesional + la restricción de exclusión en la base
  6.  F-404  Disponibilidad y huecos
  7.  F-416  Bloqueo no productivo       (NUEVA · antes que cualquier métrica)
  8.  F-413  Walk-in en dos toques
  9.  F-407  Reprogramar y cancelar (arrastrar el bloque)
  10. F-403  Agenda por recurso

  → Con estas siete, un salón ya opera la agenda y tira la libreta.
    Es el punto en que el producto se puede demostrar.

TANDA 2 · el dinero de las personas, que es el dolor 2
  11. F-440  Regla de comisión            (NUEVA · PRIMERO la regla, después el cálculo)
  12. F-443  Ledger de comisión causada   (NUEVA)
  13. F-423  Comisión por servicio
  14. F-424  Comisión sobre producto
  15. F-428  Reparto entre profesionales  (NUEVA)
  16. F-243  Propina V4 directa al profesional
  17. F-260  Propina en tarjeta como pasivo (NUEVA)
  18. F-427 + F-259  Liquidación y su salida de caja (F-259 NUEVA)
  19. F-441  Renta de estación            (NUEVA)
  20. F-234  El corte del salón, sección por sección

  → Aquí el domingo con la calculadora se acaba y el pleito se apaga.
    Es el argumento de venta número uno frente a AgendaPro.

TANDA 3 · el no-show, que es el dolor 1 en pesos
  21. F-406  Confirmación y recordatorio por WhatsApp
  22. F-412  No-show con historial        (a los 15 min, preguntando)
  23. F-409  Lista de espera CON ofrecimiento al liberarse el hueco
  24. F-408 + F-414  Política y anticipo  (F-414 NUEVA)
  25. F-417  Costo del hueco              (NUEVA)
  26. F-411  Cita recurrente

  → Aquí el 18% de no-show empieza a bajar y eso se mide en el
    indicador estrella del dashboard.

TANDA 4 · el expediente, que es el dolor 3 y la retención
  27. F-434  Expediente V4 de belleza     (con alergia como bandera en la agenda)
  28. F-154  Fórmula capturada al aplicar (NUEVA · con botón REPETIR)
  29. F-155  Doble destino del SKU        (NUEVA)
  30. F-442  Cargo de material            (NUEVA · depende de 154)
  31. F-436  Fotos antes y después
  32. F-109  Merma con los cuatro motivos del giro
  33. F-107  Alerta de cabina CONTRA LA AGENDA
  34. F-444  Rehacer sin cobro            (NUEVA)
  35. F-438  Consentimiento firmado

  → Aquí el inventario deja de ser ficción y la fórmula deja de vivir
    en el teléfono de Karla.

TANDA 5 · lo que pide la que ya está enganchada
  36. F-056  Dashboard de ocho indicadores
  37. F-426  Productividad y ocupación
  38. F-425  Cartera de la profesional
  39. F-951  Recuperación por frecuencia   ← la más rentable de todas
  40. F-439  Paquete de sesiones
  41. F-023  Precio por nivel de profesional
  42. F-027  Modificadores que cambian tiempo y precio
  43. F-405 + F-923  Reserva en línea + F-215 pasarela
  44. F-940…F-945  CFDI y factura global mensual

TANDA 6 · deuda de fondo
  45. F-017  Diccionario de vocabulario    (TERCER modelo que lo pide; once vienen detrás)
  46. F-635  Cuentas por pagar
  47. F-026  Precio por horario            (la palanca contra el hueco que nadie usa todavía)
  48. F-973  Reportes consolidados multi-sucursal
```

**Por qué F-440 (la regla) va antes que F-423 (el cálculo), aunque suene al revés.** Porque la
comisión no es un problema aritmético: es un problema de acuerdo. Si se construye primero el cálculo,
se construye con una base cableada —casi siempre "porcentaje sobre el total del ticket"— y después
hay que romperla para meter las cinco excepciones reales. Al revés sale una vez: la regla es la
entrada del cálculo desde el primer día.

**Por qué F-416 (bloqueo no productivo) va en la tanda 1, aunque sea chiquita.** Porque es el
denominador de la ocupación. Si se construye después, todos los indicadores de agenda de las tandas
siguientes nacen mal y hay que recalcular histórico. Cuesta dos días construirla ahora y dos semanas
arreglarla después.

**Por qué F-415 no se pospone.** Porque cambia el modelo de datos de la cita. Una agenda que arranca
con `duracion_min INT` y después tiene que volverse una secuencia de tramos obliga a migrar todo lo
agendado y a rehacer el motor de disponibilidad entero. **Es la decisión de arquitectura más cara de
equivocar de toda la carpeta.**
