# 01 · MAPA GENERAL · modelos de negocio y funciones

**Ésta es la guía principal de la Fase 2.** Todo lo demás se deriva de aquí.
Antes de trabajar cualquier modelo, localízalo en este mapa: su arquetipo y sus deltas.

Ver también: `03-CATALOGO-DE-FUNCIONES.md` para los IDs canónicos de cada función.

---

## 0 · CÓMO LEER ESTE MAPA

```
[=]   IDÉNTICA    misma función, mismo comportamiento en todos los modelos
                  que la tienen. Se construye UNA vez y ya.

[≠]   VARIANTE    mismo nombre, comportamiento DISTINTO según el modelo.
                  Se construye un tronco común + N variantes.
                  Es la categoría peligrosa: la que parece reutilizable y no lo es.

[+]   EXCLUSIVA   sólo la usa un modelo o una familia.

[⚙]   YA EXISTE   construida hoy en MorphiqPOS y funcionando.

[◐]   PARCIAL     existe, pero sólo la variante de restaurante.

→     depende de  no se puede construir sin lo que apunta.
```

La pregunta que este mapa contesta no es "cuántas funciones hay". Es **"qué se construye una sola vez y qué hay que construir N veces"**. De eso depende si la Fase 2 dura tres semanas o seis meses.

---

## 1 · LOS SEIS EJES

Antes que los modelos, los ejes. Un modelo de negocio **es una combinación de estos seis valores**, y todo lo demás se deduce. Esto es lo que de verdad hay que modelar; el resto es catálogo.

### EJE 1 · Cómo entra el ingreso
```
E1.1  Mostrador          venta inmediata, el cliente está enfrente
E1.2  Cuenta abierta     la cuenta crece durante un rato y se cierra al final
E1.3  Cita agendada      alguien reserva un hueco en el tiempo de un profesional
E1.4  Orden de trabajo   entra algo, se diagnostica, se autoriza, se entrega
E1.5  Cotización→pedido  se cotiza, se aprueba, se surte, se factura
E1.6  Suscripción        cobro recurrente sin venta puntual
E1.7  Renta por periodo  se ocupa un espacio o un activo durante un tiempo
E1.8  Ruta / preventa    el negocio va al cliente, no al revés
```

### EJE 2 · Qué se descuenta al cobrar
```
E2.0  Nada               servicio puro
E2.1  Pieza              stock simple, unidad entera
E2.2  Presentaciones     se compra en caja, se vende en pieza
E2.3  Lote y caducidad   el mismo producto con fechas distintas
E2.4  Número de serie    cada unidad es única y rastreable (IMEI, VIN)
E2.5  Peso y volumen     gramos, mililitros ← lo que hay hoy
E2.6  Receta             un producto consume varios insumos ← lo que hay hoy
E2.7  Producción         materia prima → lote producido → se vende
E2.8  Tiempo             la agenda del profesional ES el inventario
E2.9  Espacio-noche      habitación, cancha, mesa de coworking
E2.10 Activo que vuelve  se renta, se devuelve, se vuelve a rentar
```

### EJE 3 · Quién atiende
```
E3.0  Nadie              autoservicio
E3.1  Empleado genérico  el cajero, da igual cuál
E3.2  Profesional        importa QUIÉN: tiene agenda, cartera y comisión
```

### EJE 4 · Cuándo se paga
```
E4.1  Contado            al momento
E4.2  Al cerrar          cuenta abierta
E4.3  Anticipo           parte ahora, resto al entregar
E4.4  Crédito            cuenta por cobrar con vencimiento
E4.5  Recurrente         cargo automático cada periodo
```

### EJE 5 · Qué se le entrega al cliente
```
E5.1  Ticket             ← lo que hay hoy
E5.2  Factura CFDI       timbrada ante el SAT
E5.3  Nota de remisión   entrega sin cobro
E5.4  Orden / contrato   firmada, con condiciones
E5.5  Comprobante de anticipo
```

### EJE 6 · Qué relación hay con el cliente
```
E6.0  Anónima            no se registra a nadie
E6.1  Identificada       nombre y teléfono
E6.2  Expediente         historial que se consulta cada visita (clínico, vehículo, mascota)
E6.3  Cuenta con saldo   debe dinero o tiene crédito
E6.4  Pipeline (CRM)     todavía no es cliente, es un prospecto en una etapa
```

**Restaurante MH, hoy:** E1.2 + E2.5/E2.6 + E3.1 + E4.2 + E5.1 + E6.0.
Un solo punto de los cuarenta y tantos posibles. Ahí está el tamaño de lo que falta.

---

## 2 · LOS DIEZ ARQUETIPOS

No son 70 plantillas. Son **diez esqueletos**, y cada negocio real es un esqueleto más un puñado de deltas. Esto es lo más importante del documento.

```
A1  MOSTRADOR            E1.1 · cobra y entrega en el acto
A2  MESA Y COMANDA       E1.2 · cuenta abierta + preparación        ⚙ ES LO QUE HAY
A3  CITA Y PROFESIONAL   E1.3 · agenda + quién atiende importa
A4  ORDEN DE TRABAJO     E1.4 · recibe, diagnostica, autoriza, entrega
A5  COTIZACIÓN Y PEDIDO  E1.5 · B2B, crédito, surtido
A6  SUSCRIPCIÓN          E1.6 · membresía, acceso, cobro recurrente
A7  ESPACIO Y TIEMPO     E1.7 · reserva de un recurso por periodo
A8  PRODUCCIÓN Y VENTA   E2.7 · se fabrica y se vende
A9  RUTA Y REPARTO       E1.8 · preventa, carga, liquidación
A10 PROYECTO Y CRM       E6.4 · pipeline, propuesta, horas, entregables
```

Casi ningún negocio real es un arquetipo puro. Una **panadería** es A8 + A1. Un **hotel** es A7 + A1 (el restaurante) + A6 (membresías). Un **taller mecánico** es A4 + A1 (refacciones de mostrador). Eso es bueno: significa que los arquetipos se componen, y que construir A1 bien sirve para veinte negocios.

---

## 3 · EL CATÁLOGO DE FUNCIONES

El árbol maestro. Todo lo que puede existir. Después, por arquetipo, cuáles se encienden.

### 3.1 · NÚCLEO — en los diez arquetipos, sin excepción

```
NÚCLEO
├── Identidad y acceso [=][⚙]
│   ├── Tarjetas de empleado con foto [⚙]
│   ├── PIN de 4 dígitos, Argon2id en servidor [⚙]
│   ├── Roles y permisos [⚙]
│   ├── Sesión revocable con caducidad [⚙]
│   ├── Bloqueo por intentos fallidos [⚙]
│   └── Bitácora de acceso [⚙]
│
├── Configuración del negocio [≠][⚙]
│   ├── Identidad: nombre, logo, contacto, domicilio [⚙]
│   ├── Impuestos: IVA extraído o sumado, tasa, exentos [⚙]
│   ├── Sucursales [⚙]
│   ├── Terminales [⚙]
│   ├── Apariencia y tema [⚙]
│   ├── PLANTILLA DE NEGOCIO [+] ← LA PIEZA NUEVA DE LA FASE 2
│   │   ├── Elegir arquetipo
│   │   ├── Elegir paquete dentro del arquetipo
│   │   ├── Encender y apagar módulos sueltos
│   │   ├── Vocabulario del giro (mesa/cabina/bahía/habitación)
│   │   └── Migrar de una plantilla a otra sin perder datos
│   └── Perillas por módulo [≠]
│
├── Catálogo [≠][◐]
│   ├── Productos y servicios [⚙]
│   ├── Categorías [⚙]
│   ├── Precios [≠]
│   │   ├── Precio único [⚙]
│   │   ├── Listas de precio (público, mayoreo, convenio)
│   │   ├── Precio por sucursal
│   │   ├── Precio por volumen (escalonado)
│   │   └── Precio por temporada / horario (happy hour)
│   ├── Modificadores y extras [◐]
│   ├── Imágenes [⚙]
│   ├── Códigos de barras [◐]
│   ├── Paquetes y combos
│   ├── Productos compuestos (kits)
│   └── Importación masiva por Excel [⚙]
│
├── Venta [≠][⚙]
│   ├── Carrito [≠]
│   ├── Búsqueda rápida (código, nombre, tecla) [⚙]
│   ├── Descuentos: por línea, por total, por cupón [⚙]
│   ├── Cobro [=][⚙]
│   │   ├── Efectivo con cálculo de cambio [⚙]
│   │   ├── Tarjeta [⚙]
│   │   ├── Transferencia [⚙]
│   │   ├── Pago mixto [⚙]
│   │   └── Vales y monedero
│   ├── Ticket [≠][⚙]
│   ├── Cancelación con motivo [⚙]
│   ├── Devolución total o parcial [⚙]
│   ├── Folio consecutivo por sucursal [⚙]
│   └── Venta en espera / suspendida
│
├── Caja [=][⚙]
│   ├── Apertura con fondo [⚙]
│   ├── Movimientos: entrada, retiro, gasto [⚙]
│   ├── Arqueo a ciegas [⚙]
│   ├── Corte de turno [⚙]
│   └── Corte diario con PDF [⚙]
│
├── Clientes [≠]
│   ├── Ficha básica: nombre, teléfono [⚙]
│   ├── Historial de compra
│   ├── Datos fiscales (RFC, régimen, CP)
│   ├── Etiquetas y segmentos
│   └── Notas
│
├── Registros y reportes [≠][⚙]
│   ├── Ventas por periodo [⚙]
│   ├── Más vendidos [⚙]
│   ├── Utilidad y margen [⚙]
│   ├── Cortes históricos [⚙]
│   ├── Ventas por empleado [⚙]
│   ├── Comparativo entre periodos
│   ├── Tablero de indicadores
│   └── Exportación a Excel y PDF [◐]
│
└── Usuarios y permisos [=][⚙]
    ├── Alta y baja de empleados [⚙]
    ├── Asignación de rol [⚙]
    └── Permisos finos por módulo
```

### 3.2 · INVENTARIO — la función que más engaña

Esta es la que Miguel señaló, y tiene razón: **aparece en 60 de 70 negocios y no funciona igual en ninguno**. Es el ejemplo perfecto de `[≠]`.

```
Inventario [≠][◐]
├── TRONCO COMÚN — se construye una vez, sirve a todas las variantes
│   ├── Existencia actual por almacén
│   ├── Movimiento inmutable (ledger): entrada, salida, ajuste, traspaso
│   ├── Decremento atómico al cobrar [⚙]
│   ├── Kardex / historial por artículo
│   ├── Ajuste manual con motivo obligatorio
│   ├── Traspaso entre almacenes o sucursales
│   ├── Toma de inventario físico y diferencias
│   ├── Alertas de mínimo
│   └── Valuación (costo promedio, PEPS)
│
├── V1 · SIN INVENTARIO [E2.0]
│   └── El módulo entero está apagado. Servicios puros.
│       → estética, consultorio, despacho, gimnasio
│
├── V2 · STOCK SIMPLE [E2.1]
│   ├── Unidad: pieza
│   ├── Cuántas hay, cuántas se vendieron hoy
│   ├── Agregar stock, quitar stock
│   ├── Stock mínimo y alerta
│   └── Nada más. Esta es la variante que Miguel describió.
│       → papelería, boutique, dulcería, librería
│
├── V3 · PRESENTACIONES [E2.2]
│   ├── Se compra en caja, se vende en pieza
│   ├── Factor de conversión por producto
│   ├── Venta en ambas unidades
│   └── Existencia expresada en las dos
│       → abarrotes, ferretería, farmacia, vinatería
│
├── V4 · LOTE Y CADUCIDAD [E2.3]
│   ├── El mismo producto con fechas distintas
│   ├── Salida por PEPS obligatoria
│   ├── Alerta de próximo a caducar
│   ├── Merma por caducidad
│   └── Trazabilidad del lote
│       → farmacia, abarrotes perecederos, agroveterinaria
│
├── V5 · NÚMERO DE SERIE [E2.4]
│   ├── Cada unidad es única (IMEI, serie, VIN)
│   ├── Se captura al comprar y al vender
│   ├── Búsqueda por serie
│   ├── Garantía ligada a la serie
│   └── Historial de esa unidad
│       → celulares, electrónica, refaccionaria, joyería
│
├── V6 · PESO, VOLUMEN Y RECETA [E2.5 + E2.6] ⚙ ES LA QUE HAY HOY
│   ├── Insumos en gramos, mililitros, piezas [⚙]
│   ├── Receta / escandallo por producto [⚙]
│   ├── Explosión de receta al cobrar [⚙]
│   ├── Costeo por insumo [⚙]
│   ├── Producto por peso variable [⚙]
│   ├── Insumo base (el producto ES el insumo) [⚙]
│   ├── Merma de cocina
│   └── Rendimiento real contra teórico
│       → restaurante, cafetería, bar, juguería
│
├── V7 · PRODUCCIÓN POR LOTE [E2.7]
│   ├── Orden de producción
│   ├── Materia prima → producto terminado
│   ├── Rendimiento del lote y merma
│   ├── Costo del lote producido
│   ├── Producto en proceso
│   └── Caducidad del lote producido → V4
│       → panadería, pastelería, tortillería, cervecería
│
├── V8 · POR PROYECTO U OBRA [E2.1 + destino]
│   ├── Material asignado a un proyecto, no a una venta
│   ├── Requisición de obra
│   ├── Devolución de sobrante
│   └── Costo real del proyecto contra presupuestado
│       → constructora, carpintería, herrería, instalaciones
│
├── V9 · CONSIGNACIÓN
│   ├── Mercancía que no es del negocio
│   ├── Dueño de la pieza y su comisión
│   ├── Liquidación al consignante
│   └── Devolución de lo no vendido
│       → bazar, boutique multimarca, galería
│
└── V10 · ACTIVOS QUE VUELVEN [E2.10]
    ├── La unidad sale y regresa
    ├── Estado al salir y al volver
    ├── Disponibilidad por fecha
    ├── Mantenimiento entre rentas
    └── Daño y reposición
        → renta de mobiliario, herramienta, equipo médico
```

**Lectura de esto:** el tronco común es el 60% del trabajo y sirve para las diez. Las variantes son el 40% restante y se construyen una por una, cuando un cliente las pague.

### 3.3 · MÓDULOS POR ARQUETIPO

```
MESA Y SALÓN [+A2][⚙]
├── Zonas y distribución [⚙]
├── Mesas con estado y capacidad [⚙]
├── Unir y separar mesas
├── Cambiar de mesa
├── Asignación de mesero [⚙]
├── Tiempo de ocupación
├── Lista de espera
└── Reserva de mesa → A7

PREPARACIÓN Y COMANDAS [+A2][⚙]
├── Enviar a preparación [⚙]
├── Estaciones (cocina, barra, postres) [⚙]
├── Ruteo de producto a estación [⚙]
├── Pantalla de preparación [⚙]
├── Estados: pendiente, preparando, listo [⚙]
├── Tiempos por platillo
├── Alertas de alergia [⚙]
├── Notas al cocinero [⚙]
├── Impresión de comanda
└── Llamado de "listo para servir"

AGENDA Y CITAS [+A3][+A7]
├── Calendario día / semana / mes
├── Duración por servicio
├── Agenda por profesional [→E3.2]
├── Agenda por recurso (sillón, cabina, cancha)
├── Disponibilidad y huecos
├── Reserva en línea por el cliente → Portal
├── Confirmación y recordatorio (WhatsApp, SMS)
├── Reprogramar y cancelar
├── Política de cancelación y penalización
├── Lista de espera
├── Sobrecupo controlado
├── Cita recurrente (cada 15 días)
└── No-show y su registro

PROFESIONAL Y COMISIONES [+A3]
├── Ficha del profesional
├── Servicios que puede dar y a qué precio
├── Horario y días libres
├── Comisión por servicio [≠]
│   ├── Porcentaje fijo
│   ├── Porcentaje escalonado por meta
│   ├── Monto fijo por servicio
│   └── Comisión sobre producto vendido
├── Cartera de clientes propia
├── Productividad y ocupación
└── Liquidación de comisiones → Propinas

ORDEN DE TRABAJO [+A4]
├── Recepción del bien
│   ├── Ficha del objeto (vehículo, equipo, prenda)
│   ├── Estado de entrada con fotos
│   ├── Inventario de lo que trae
│   └── Firma de recepción
├── Diagnóstico
├── Presupuesto y autorización del cliente
├── Refacciones y mano de obra
├── Asignación a un técnico
├── Estados: recibido, diagnosticando, autorizado, en proceso, listo, entregado
├── Aviso al cliente por WhatsApp
├── Entrega con firma
├── Garantía del trabajo
└── Historial del objeto → E6.2

COTIZACIÓN Y PEDIDO [+A5]
├── Cotización con vigencia
├── Versiones de la cotización
├── Envío por correo o WhatsApp
├── Aprobación del cliente
├── Conversión a pedido
├── Surtido parcial
├── Remisión de entrega
├── Facturación del pedido
└── Seguimiento de la cotización (ganada, perdida, motivo)

CRÉDITO Y COBRANZA [+A5][+A4]
├── Límite de crédito por cliente
├── Días de plazo
├── Estado de cuenta
├── Antigüedad de saldos
├── Aplicación de pagos a facturas
├── Pago parcial
├── Recordatorio de vencimiento
├── Bloqueo por mora
└── Nota de crédito

SUSCRIPCIONES Y MEMBRESÍAS [+A6]
├── Planes y periodicidad
├── Alta y baja
├── Cobro recurrente
├── Reintento de cobro fallido
├── Pausa y reanudación
├── Control de acceso (huella, QR, torniquete)
├── Visitas incluidas y consumidas
├── Congelamiento de membresía
├── Renovación y vencimiento
└── Retención: aviso previo, oferta de permanencia

RESERVA DE ESPACIO [+A7]
├── Unidades reservables (habitación, cancha, sala)
├── Tipos y tarifas
├── Calendario de ocupación
├── Tarifa por temporada, día de semana, hora
├── Anticipo y política
├── Check-in y check-out
├── Consumos cargados a la habitación → A1
├── Sobreventa controlada
├── Limpieza y estado de la unidad
└── Canales externos (Booking, Airbnb)

PRODUCCIÓN [+A8]
├── Orden de producción
├── Receta de producción → Inventario V6
├── Lote y rendimiento
├── Costo del lote
├── Producto en proceso
├── Mermas de producción
├── Programa de producción del día
└── Producción contra demanda histórica

RUTA Y REPARTO [+A9]
├── Clientes por ruta
├── Preventa (se levanta hoy, se entrega mañana)
├── Carga del vehículo
├── Entrega con firma o foto
├── Cobro en ruta
├── Devolución de envase (garrafón, casco)
├── Liquidación del repartidor
├── Geolocalización de la entrega
└── Rendimiento por ruta

PROYECTO Y CRM [+A10]
├── Prospecto y su origen
├── Etapas del embudo
├── Actividades y seguimientos
├── Propuesta comercial
├── Proyecto con fases y entregables
├── Horas trabajadas por persona
├── Costo del proyecto contra cobrado
├── Facturación por avance o hito
└── Rentabilidad del proyecto
```

### 3.4 · MÓDULOS TRANSVERSALES

Aplican a muchos arquetipos. Los `[=]` son los que más valen: se construyen una vez y se venden muchas.

```
COMPRAS Y PROVEEDORES [=][⚙]
├── Proveedores [⚙]
├── Orden de compra
├── Recepción y entrada a inventario [⚙]
├── Costos y actualización del costo promedio [⚙]
├── Plantillas de compra recurrente [⚙]
├── Cuentas por pagar
└── Comparativo de precios entre proveedores

GASTOS [=][⚙]
├── Registro con categoría [⚙]
├── Plantillas de gasto fijo [⚙]
├── Gasto desde caja [⚙]
├── Comprobantes adjuntos
└── Gastos contra presupuesto

PROPINAS [≠][⚙]
├── V1 Sin propinas                     → mostrador, retail
├── V2 Sugerida al cobrar [⚙]           → restaurante, cafetería
├── V3 Repartida por puntos (tronco)    → restaurante grande
├── V4 Directa al profesional           → estética, barbería, spa
└── V5 Al repartidor                    → delivery, ruta
    ├── Desglose exacto por método [⚙]
    ├── Nunca en ventas ni en margen [⚙]
    └── Liquidación por periodo [⚙]

DELIVERY Y DOMICILIO [+]
├── Pedido a domicilio
├── Domicilio del cliente y mapa
├── Costo de envío por zona
├── Repartidor asignado
├── Estados del pedido
├── Seguimiento para el cliente
└── Integración con Rappi / DiDi / Uber Eats

PORTAL DEL CLIENTE [≠][◐]
├── V1 Menú QR y pedido en mesa [⚙]     → restaurante
├── V2 Catálogo público y pedido         → retail
├── V3 Reserva en línea                  → cita, espacio
├── V4 Consulta de orden de trabajo      → taller
├── V5 Estado de cuenta                  → crédito
└── V6 Tienda en línea completa          → ecommerce

FIDELIDAD [=]
├── Puntos por compra
├── Niveles de cliente
├── Monedero electrónico
├── Cupones y promociones
├── Recompensas y canje
└── Cumpleaños y fechas

FACTURACIÓN CFDI 4.0 [=]
├── Datos fiscales del cliente
├── Timbrado ante PAC
├── Factura global del día
├── Complemento de pago
├── Cancelación con motivo
├── Nota de crédito
└── Envío automático por correo

EXPEDIENTE [≠]
├── V1 Clínico (paciente)                → dental, médico, fisio
├── V2 Veterinario (mascota + dueño)     → veterinaria
├── V3 Vehicular (auto + dueño)          → taller, refaccionaria
├── V4 De belleza (fórmulas, alergias)   → estética, tatuajes
└── V5 Académico (alumno)                → escuela
    ├── Historial de visitas
    ├── Notas y documentos
    ├── Fotos antes y después
    ├── Archivos adjuntos
    └── Consentimientos firmados

APARTADOS Y ANTICIPOS [=]
├── Apartado con abonos
├── Vigencia del apartado
├── Reserva de la mercancía
├── Cancelación y penalización
└── Liquidación y entrega

MULTI-SUCURSAL [=][◐]
├── Catálogo compartido o independiente
├── Inventario por sucursal [⚙]
├── Traspasos entre sucursales
├── Precios por sucursal
├── Reportes consolidados
└── Permisos por sucursal [⚙]

MARKETING [=]
├── Campañas por WhatsApp
├── Segmentos de cliente
├── Recuperación de inactivos
├── Encuesta de satisfacción [◐]
└── Reseñas de Google

NÓMINA Y ASISTENCIA [=]
├── Reloj checador
├── Horas trabajadas
├── Turnos y horarios
├── Cálculo de nómina
└── Vacaciones y permisos
```

---

## 4 · LOS MODELOS DE NEGOCIO

Cada uno es **un arquetipo más deltas**. Los deltas son lo que hay que construir de más.

### FAMILIA 1 · ALIMENTOS Y BEBIDAS

```
Restaurante de mesa ............ A2  ⚙ ES LO QUE HAY HOY
Cafetería ...................... A2  − mesas simplificadas  + barra rápida
Bar / cantina .................. A2  + cuenta por consumo  + inventario de botella abierta
                                     + happy hour (precio por horario)
Comida rápida / fast food ...... A1 + A2(preparación)  − mesas
                                     + número de orden en pantalla
Taquería ....................... A1 + A2(preparación)  + venta por pieza y por kilo
Food truck ..................... A1  + una sola terminal  + sin internet estable
Fonda / cocina económica ....... A1  + menú del día  + comida corrida (paquete fijo)
                                     + fiado del cliente frecuente → Crédito
Pizzería ....................... A2 + Delivery  + mitad y mitad (receta partida)
Dark kitchen ................... Delivery puro  − mesas − mostrador
                                     + varias marcas en una cocina
Bufet / por peso ............... A1  + venta por peso  + báscula
Panadería / pastelería ......... A8 + A1        ← CONFETI
                                     + producción por lote  + pedido por encargo
                                     + anticipo  + fecha de entrega
Heladería / paletería .......... A1  + inventario V6  + temporada
Juguería ....................... A1 + A2(preparación)  + receta
Catering / banquetes ........... A5 + A7  + cotización por evento  + anticipo
                                     + menú por evento  + personal asignado
```

### FAMILIA 2 · RETAIL Y MOSTRADOR

```
Abarrotes / conveniencia ....... A1  + inventario V3  + código de barras   ← TIENDITA
Ferretería ..................... A1  + inventario V3  + venta por metro/kilo ← CLIENTE
                                     + corte de material
Papelería ...................... A1  + inventario V2  + servicios (copias, impresión)
Farmacia ....................... A1  + inventario V4  + receta médica  + controlados
Boutique / ropa ................ A1  + inventario V2  + tallas y colores (matriz)
                                     + apartado  + temporada
Zapatería ...................... A1  + matriz talla/color
Mueblería ...................... A1 + A5  + crédito propio  + entrega programada
Electrónica / celulares ........ A1  + inventario V5  + garantía  + A4(reparaciones)
Refaccionaria .................. A1  + inventario V5  + catálogo por vehículo
                                     + compatibilidad (año/marca/modelo)
Agroveterinaria ................ A1  + inventario V4  + dosis por peso animal
Vinatería ...................... A1  + inventario V3  + horario de venta legal
Florería ....................... A1 + A5  + pedido con fecha/hora de entrega
                                     + arreglo armado (receta)  + Delivery
Tienda de mascotas ............. A1 + A3(estética)  + inventario V3
Joyería ........................ A1  + inventario V5  + apartado  + empeño
Óptica ......................... A1 + A3 + A4  + graduación (expediente)
Materiales de construcción ..... A1 + A5 + A9  + venta a granel  + flete
Mercería / telas ............... A1  + venta por metro
Dulcería ....................... A1  + inventario V2  + venta a granel
Vapes / tabaquería ............. A1  + inventario V3  + restricción de edad
```

### FAMILIA 3 · SERVICIOS CON CITA

```
Estética / salón ............... A3  + comisión por estilista  + propina directa
                                     + venta de producto → A1  + expediente V4
Barbería ....................... A3  + cita rápida  + walk-in (sin cita)
Uñas / nail salon .............. A3  + diseños con foto  + expediente V4
Spa / masajes .................. A3  + cabina como recurso  + paquetes de sesiones
Clínica dental ................. A3  + expediente V1  + odontograma  + plan de tratamiento
                                     + presupuesto por fases  + crédito
Consultorio médico ............. A3  + expediente V1  + receta  + historia clínica
Veterinaria .................... A3 + A1  + expediente V2  + vacunas y desparasitación
                                     + peso e historial  + hospitalización
Fisioterapia ................... A3  + paquete de sesiones  + evolución
Tatuajes ....................... A3  + anticipo  + diseño  + sesiones  + consentimiento
Gimnasio ....................... A6 + A3  + control de acceso  + clases con cupo
Escuela / academia ............. A6 + A3  + grupos  + colegiatura  + calificaciones
Estudio de fotografía .......... A3 + A5  + paquete  + entrega digital
```

### FAMILIA 4 · TALLER Y REPARACIÓN

```
Taller mecánico ................ A4 + A1  + expediente V3  + refacciones
                                     + mano de obra por hora  + multipunto de revisión
Taller de celulares ............ A4 + A1  + inventario V5  + garantía  + patrón de bloqueo
Lavandería / tintorería ........ A4  + ticket de reclamo  + prenda por pieza/kilo
                                     + fecha de entrega
Autolavado ..................... A1 + A3  + paquetes  + membresía → A6
Reparación de electrodomésticos  A4  + servicio a domicilio  + diagnóstico
Carpintería / herrería ......... A4 + A5  + inventario V8  + por proyecto
```

### FAMILIA 5 · ESPACIO Y TIEMPO

```
Hotel / motel .................. A7 + A1  + check-in/out  + consumo a la habitación
                                     + ama de llaves  + canales externos
Rentas cortas (Airbnb) ......... A7  + calendario multi-canal  + limpieza
Salón de eventos ............... A7 + A5  + anticipo  + paquete  + montaje
Coworking ...................... A7 + A6  + escritorio/sala por hora  + membresía
Estacionamiento ................ A7  + entrada/salida  + tarifa por fracción  + pensión
Canchas deportivas ............. A7  + bloques por hora  + torneo  + reserva en línea
Self-storage ................... A7 + A6  + bodega por m³  + contrato  + acceso
```

### FAMILIA 6 · DISTRIBUCIÓN Y MAYOREO

```
Distribuidora / mayorista ...... A5 + A9  + lista de precios por cliente
                                     + preventa  + crédito  + comisión por vendedor
Purificadora de agua ........... A9  + garrafón como envase retornable
                                     + ruta fija  + cobro en ruta
Gas LP ......................... A9  + cilindro retornable  + ruta  + tarifa regulada
Panadería industrial B2B ....... A8 + A9  + producción  + ruta  + devolución de pan
```

### FAMILIA 7 · PRODUCCIÓN

```
Tortillería .................... A8 + A1  + producción por kilo  + venta por kilo
Cervecería artesanal ........... A8 + A2  + lote  + fermentación  + barril
Imprenta / serigrafía .......... A8 + A4 + A5  + por proyecto  + diseño  + tiraje
Fábrica de muebles ............. A8 + A5  + por proyecto  + inventario V8
```

### FAMILIA 8 · PROFESIONAL Y CRM

```
Agencia de marketing ........... A10  + horas  + retainer → A6  + entregables  ← MORPHIQ
Despacho contable .............. A10 + A6  + clientes con iguala mensual  + obligaciones
Despacho legal ................. A10  + expedientes  + horas  + audiencias
Inmobiliaria ................... A10  + propiedades  + comisión  + visitas
Constructora ................... A10 + A5  + inventario V8  + avance de obra  + estimaciones
Consultoría .................... A10  + horas  + proyecto  + hitos
```

### FAMILIA 9 · CASOS ESPECIALES

```
Ecommerce ...................... A1 + Portal V6  + envíos  + pasarela de pago
Casa de empeño ................. A5  + avalúo  + contrato  + interés  + almacén de prenda
Gasolinera ..................... A1  + islas  + turnos  + litros  + control volumétrico
Funeraria ...................... A5 + A7  + paquetes  + servicios  + a crédito
Agencia de viajes .............. A5 + A10  + reservas  + comisión  + anticipos
Renta de equipo ................ A7  + inventario V10  + contrato  + depósito  + daños
```

**Total: 78 modelos sobre 10 arquetipos.** Ése es el argumento: no se construyen 78 cosas.

---

## 5 · MATRIZ DE REUTILIZACIÓN

Lo que de verdad decide el plan.

### Se construye UNA vez y sirve a casi todos `[=]`

| Función | Modelos que la usan | ¿Existe hoy? |
|---|---|---|
| Identidad, PIN, roles, sesión | 78 de 78 | ⚙ sí |
| Caja, arqueo, corte | 70 | ⚙ sí |
| Cobro y métodos de pago | 78 | ⚙ sí |
| Compras y proveedores | 60 | ⚙ sí |
| Gastos | 78 | ⚙ sí |
| Inventario — TRONCO común | 62 | ⚙ parcial |
| Clientes — ficha básica | 78 | ⚙ básico |
| Multi-sucursal | 78 | ⚙ parcial |
| Facturación CFDI | 78 | ✗ **no existe** |
| Fidelidad y puntos | 45 | ✗ no existe |
| Apartados y anticipos | 30 | ✗ no existe |
| Nómina y asistencia | 60 | ✗ no existe |

### Mismo nombre, comportamiento distinto `[≠]` — cuidado aquí

| Función | Variantes | Construidas hoy |
|---|---|---|
| **Inventario** | 10 | 1 (V6 restaurante) |
| **Catálogo / precios** | 5 | 1 |
| **Propinas** | 5 | 1 |
| **Portal del cliente** | 6 | 1 |
| **Expediente** | 5 | 0 |
| **Comisión** | 4 | 0 |
| **Ticket** | 5 | 1 |
| **Carrito** | 4 | 2 |

### Exclusivas de un arquetipo `[+]`

| Módulo | Arquetipo | Modelos | Existe |
|---|---|---|---|
| Mesa y salón | A2 | 12 | ⚙ sí |
| Preparación y comandas | A2 | 14 | ⚙ sí |
| Agenda y citas | A3 | 22 | ✗ |
| Orden de trabajo | A4 | 9 | ✗ |
| Cotización y pedido | A5 | 18 | ✗ |
| Crédito y cobranza | A5 | 15 | ✗ |
| Suscripciones | A6 | 8 | ✗ |
| Reserva de espacio | A7 | 8 | ✗ |
| Producción | A8 | 8 | ✗ |
| Ruta y reparto | A9 | 5 | ✗ |
| Proyecto y CRM | A10 | 6 | ✗ |

### Dónde está MorphiqPOS hoy

```
Cobertura real:  A2 completo · A1 parcial · núcleo sólido
Modelos que ya podrías vender sin construir nada nuevo:
    restaurante de mesa, cafetería, bar, taquería, fonda, food truck
    (6 de 78)

Con A1 completo + inventario V2 y V3:
    + abarrotes, papelería, dulcería, boutique, vinatería, mercería,
      tienda de mascotas, vapes, ferretería
    (15 de 78)

Con A3 (agenda) encima:
    + estética, barbería, uñas, spa, veterinaria, tatuajes, fotografía
    (22 de 78)
```

**A3 (agenda y citas) es el módulo de mayor rendimiento que no existe:** desbloquea 22 modelos y es el giro más numeroso en cualquier calle de México.

---

## 6 · LO QUE HAY QUE DECIDIR

Esto no lo decido yo. Son las preguntas que este mapa deja sobre la mesa:

1. **¿Cuántos arquetipos entran en la Fase 2?** Mi lectura: A1 completo + A3. Con eso pasas de 6 modelos vendibles a 22.

2. **¿Plantilla fija o módulos sueltos?** Hoy hay tres paquetes cerrados. La alternativa es plantilla como punto de partida + perillas por módulo. La segunda vende mejor y complica más.

3. **¿El vocabulario cambia con la plantilla?** "Mesa" en restaurante, "cabina" en spa, "bahía" en taller, "habitación" en hotel. Es la misma entidad. Si se resuelve con un diccionario por plantilla, sale casi gratis; si se resuelve duplicando pantallas, sale carísimo.

4. **¿Qué se hace con los tres paquetes actuales?** Esencial / Operativo / Restaurante Pro son paquetes DENTRO de un arquetipo. Al meter arquetipos, o cada uno tiene sus tres niveles, o el paquete pasa a ser una lista de módulos encendidos.

5. **¿CFDI entra ya?** No lo pide ningún arquetipo en particular: lo piden **todos**, y en México es lo que separa "sistema de cobro" de "sistema del negocio". Es el módulo que más te van a pedir y el único que ningún competidor puede no tener.

---

## 7 · CÓMO SE CONSTRUYE APARTE

Lo que Miguel pidió: que Claude Code construya las piezas **fuera** del punto de venta, pero **como si ya estuvieran dentro**, para acoplarlas cuando Codex termine el backend.

Eso significa, en concreto:

- Cada función nueva vive en su propia carpeta, con la misma estructura que tendría dentro del monorepo.
- Usa los mismos contratos que ya existen: `comando()`, el puente, `definirComando`, el ámbito de sesión, bigint de centavos.
- Sus escrituras se declaran como comandos, aunque el comando todavía no esté enganchado a una ruta.
- Sus lecturas se declaran en el mapa del puente con `rolesLectura`, aunque la entidad todavía no exista en la base.
- Su migración se escribe numerada y lista para aplicar, pero **no se aplica**.
- Nada toca `apps/web/heredado/` mientras Codex siga trabajando ahí.

Así, acoplar es mover carpetas y aplicar migraciones — no reescribir.
