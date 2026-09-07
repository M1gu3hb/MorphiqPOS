# Catálogo de giros de negocio y sus ramas de features

Fecha: 6 de septiembre de 2026
Estado: **mapa de descubrimiento y herramienta de venta. No es backlog aprobado.**

---

## Cómo leer este documento

Una capacidad no pertenece a un giro. Un giro **consume** capacidades. Por eso el documento tiene tres partes:

1. **El tronco común** — lo que necesita absolutamente todo negocio. Es el núcleo.
2. **Las ramas por familia de negocio** — lo que distingue a cada tipo.
3. **La matriz de giros** — qué ramas necesita cada giro concreto.

**Marcas de estado**, basadas en la auditoría de tus dos sistemas reales:

| Marca | Significa |
|---|---|
| 🟢 | Ya existe y funciona en **POS-MH-Tiendita** |
| 🔵 | Ya existe y funciona en **POS MH Restaurante** |
| 🟡 | Existe a medias en alguno de los dos |
| ⚪ | No existe todavía |

---

## PARTE 1 — El tronco común

Esto lo necesita **todo** negocio, sin excepción. Es el núcleo de MorphiqPOS y no se activa ni se desactiva.

### 1.1 Plataforma

| Capacidad | Estado |
|---|---|
| Organizaciones / negocios (tenant) | 🟢 |
| Sucursales | 🟡 (existe la tabla en tiendita, sin UI) |
| Terminales / dispositivos | ⚪ |
| Usuarios, identidad y sesión de servidor | 🟢 |
| Empleados, roles y **permisos reales por acción** | ⚪ *(ambos sistemas lo tienen roto)* |
| Alta e invitación de empleados | ⚪ *(hueco grande en tiendita)* |
| Configuración por ámbito, única y versionada | 🟡 |
| Identidad visual: logo, colores, temas | 🟢🔵 |
| Moneda, impuestos, zona horaria, día operativo | 🟢🔵 |
| Folios y numeración atómica | 🟡 *(hoy con colisión probable)* |
| Auditoría inmutable | 🟢 |
| Archivos e imágenes | 🟢🔵 |
| Registry de capacidades y perfiles de giro | ⚪ |
| Importación / exportación | 🟢🔵 |
| Respaldos y restauración | ⚪ |
| Observabilidad y alertas de invariantes | ⚪ |

### 1.2 Venta — el corazón

| Capacidad | Estado |
|---|---|
| Catálogo, categorías, precios | 🟢🔵 |
| Carrito y líneas con snapshot de precio y costo | 🟢🔵 |
| **Cotización en servidor** (precio, impuesto, descuento) | ⚪ |
| **Cobro atómico e idempotente** | 🟡 *(la RPC existe en tiendita; el cobro normal no la usa)* |
| Pagos: efectivo, tarjeta, transferencia, mixto | 🟢🔵 |
| Cambio y redondeo | 🟢🔵 |
| Ticket y recibo | 🟢🔵 |
| Cancelación de venta con auditoría | 🟢 |
| Devoluciones y reembolsos | 🟢 |
| Descuentos con autorización | 🟡 |

### 1.3 Dinero y control

| Capacidad | Estado |
|---|---|
| Sesión de caja: apertura, cierre, arqueo, diferencia | 🟢🔵 |
| Movimientos de caja: retiros, depósitos | 🟢 |
| Corte con PDF | 🟢🔵 |
| Gastos operativos y plantillas | 🟢🔵 |
| Costo, utilidad y margen por venta | 🟢🔵 |
| Reportes por periodo y exportación | 🟢🔵 |
| Panel del dueño en el teléfono | 🟡 |

### 1.4 Cliente

| Capacidad | Estado |
|---|---|
| Perfil básico de cliente | 🟢🟡 |
| Historial de compras | 🟡 |
| Consentimiento y privacidad | ⚪ |

---

## PARTE 2 — Las ramas por familia de negocio

Aquí está lo que realmente distingue a un giro de otro. Nueve familias.

---

### RAMA A — Retail de mostrador
*Abarrotes · ferretería · farmacia · papelería · vinatería · refaccionaria · boutique · celulares · mascotas · juguetía · materiales*

**Lo que define esta rama:** el catálogo es grande, se identifica por código, y **lo que se descuenta del inventario es el mismo producto que se vende**.

| Feature | Estado | Notas |
|---|---|---|
| Código de barras y SKU | 🟢 | índice dedicado, búsqueda difusa |
| Escáner por cámara | 🟢 | ZXing |
| Escáner físico USB/Bluetooth | 🟢 | keyboard wedge |
| **Escáner remoto por teléfono** | 🟢 | el teléfono empuja al POS por Realtime. Muy vendedor |
| Flujo "código no encontrado" → crear o asignar | 🟢 | excelente UX |
| Stock por SKU con mínimo y máximo | 🟢 | |
| Kardex de movimientos | 🟢🔵 | |
| Compras a proveedor con conversión de unidades | 🟢 | comprar por caja, vender por pieza |
| Proveedores | 🟢🔵 | |
| Conteo físico / arqueo de inventario | 🟢 | contra robo hormiga |
| Historial de precios | 🟢 | por trigger. Clave con inflación |
| Precio de mayoreo por volumen | 🟢 | |
| Venta por peso + báscula | 🟢 | Web Serial |
| Combos y paquetes | 🟢 | |
| Fiado / crédito de barrio | 🟢 | saldo y límite por cliente |
| Vista cliente en segundo monitor | 🟢 | |
| Variantes: talla, color, modelo | ⚪ | **crítico para boutique y calzado** |
| Lotes y caducidad | ⚪ | **obligatorio en farmacia** |
| Números de serie / IMEI | ⚪ | celulares, electrónica |
| Garantías y RMA | ⚪ | electrónica, refacciones |
| Etiquetas y códigos impresos | ⚪ | |
| Catálogo por equivalencias y compatibilidad | ⚪ | refaccionaria: "esta pieza sirve para estos modelos" |
| Apartados y anticipos | ⚪ | boutique, muebles |
| Corte por metro / a granel | 🟡 | |

**Ya tienes ~80 % de esta rama.** Ferretería, papelería y vinatería funcionan hoy. Farmacia necesita lotes y caducidad. Boutique necesita variantes.

---

### RAMA B — Alimentos y bebidas con servicio
*Restaurante · fonda · cafetería · bar · taquería · pizzería · antro · buffet*

**Lo que define esta rama:** la cuenta se abre y permanece abierta; el pedido se manda a producir; **lo que se descuenta del inventario son ingredientes, vía receta**.

| Feature | Estado | Notas |
|---|---|---|
| Mapa de mesas y zonas | 🔵 | |
| Cuenta abierta por mesa | 🔵 | |
| Mesero móvil | 🔵 | |
| Comanda a cocina / barra (KDS) | 🔵 | **la escena que más impresiona en demo** |
| Estaciones de preparación | 🔵 | |
| Estados de preparación y entrega | 🔵 | |
| Modificadores y grupos de opciones | 🔵 | |
| Exclusiones "SIN ingrediente" | 🟡 | captura sí; descuento de inventario pendiente |
| Recetas / escandallos | 🔵 | |
| Costo y margen por platillo | 🔵 | |
| Propinas por método y liquidación | 🔵 | |
| Precuenta | 🔵 | |
| Ajuste auditable de cuenta antes de cobrar | 🟡 | |
| Portal QR del comensal | 🔵 | menú, pedido, cuenta, ayuda, valoración |
| Productos por medida y por porción | 🔵 | barbacoa por gramo, shot por botella |
| Dividir y unir cuenta | ⚪ | **muy pedido** |
| Tiempos y cursos (entradas, fuertes, postres) | ⚪ | |
| Reservaciones y lista de espera | ⚪ | |
| Para llevar y a domicilio | 🟡 | |
| Repartidores y zonas de entrega | ⚪ | |
| Comisión por mesero | ⚪ | |
| Impresoras por estación | ⚪ | |
| Happy hour / precios por horario | ⚪ | bares |
| Consumo mínimo y cover | ⚪ | antros |
| Comanda de barra separada | 🟡 | |

**Ya tienes ~70 % de esta rama.** Es tu sistema más completo.

---

### RAMA C — Servicios con cita
*Estética · barbería · spa · uñas · dental · consultorio · veterinaria · fisioterapia · tatuajes · fotografía*

**Lo que define esta rama:** se vende **tiempo de una persona o de un recurso**. No hay stock que descontar del producto vendido, pero sí insumos consumidos.

| Feature | Estado | Notas |
|---|---|---|
| Catálogo de servicios con duración | ⚪ | un servicio es un producto sin stock |
| Agenda y calendario | ⚪ | |
| Disponibilidad por empleado | ⚪ | |
| Recursos: sillas, cabinas, equipos, salas | ⚪ | |
| Reserva en línea por el cliente | ⚪ | |
| Recordatorios por WhatsApp / SMS | ⚪ | **el que más reduce ausencias** |
| Confirmación y reprogramación | ⚪ | |
| Anticipo y política de no-show | ⚪ | |
| Paquetes y sesiones prepagadas | ⚪ | "10 sesiones" |
| Membresías con vigencia | ⚪ | |
| Comisión por servicio y por empleado | ⚪ | **el corazón de una estética** |
| Consumo de insumos por servicio | ⚪ | tinte, material dental |
| Expediente e historial del cliente | ⚪ | |
| Fotos de antes y después | ⚪ | estética, tatuajes |
| Consentimiento informado y firma | ⚪ | dental, tatuajes |
| Receta o indicaciones | ⚪ | consultorio, veterinaria |
| Venta de producto junto al servicio | 🟢 | retail ya lo cubre |
| Lista de espera | ⚪ | |
| Propina al prestador | 🔵 | reutilizable |

**Rama nueva casi completa.** Es la más grande por construir, y la que más abre mercado nuevo.

---

### RAMA D — Espacios y tiempo rentado
*Salón de eventos · gimnasio · cancha · coworking · hotel · estacionamiento · renta de equipo · billar · karaoke*

**Lo que define esta rama:** se vende **un espacio o un objeto durante un periodo**, con calendario de ocupación y disponibilidad.

| Feature | Estado | Notas |
|---|---|---|
| Calendario de ocupación por espacio | ⚪ | |
| Cotización por bloque, hora, día o evento | ⚪ | |
| Anticipos y pagos parciales | ⚪ | **así se cobra un salón** |
| Contrato y firma | ⚪ | |
| Paquetes con servicios incluidos | ⚪ | |
| Proveedores externos del evento | ⚪ | DJ, banquete, mobiliario |
| Checklist de montaje | ⚪ | |
| Renta de inventario retornable | ⚪ | sillas, mesas, equipo |
| Depósito en garantía | ⚪ | |
| Control de entrada y salida | ⚪ | |
| Membresías y acceso | ⚪ | gimnasio |
| Cobro por tiempo transcurrido | ⚪ | estacionamiento, billar |
| Sobrecupo y traslapes | ⚪ | |

**Nota personal:** tú operas **Jardines Club Hípico**, un salón de eventos, y ya tienes `JCH-CRM` y `JCH-portal-cliente`. Eres tu propio cliente perfecto para esta rama, con conocimiento de primera mano y riesgo cero. Vale la pena tenerlo presente al priorizar.

---

### RAMA E — Producción y transformación
*Pastelería · panadería · cocina central · cervecería · imprenta · costura · dark kitchen*

**Lo que define esta rama:** se **fabrica** antes de vender. Hay órdenes de producción, insumos que se transforman y producto terminado que entra al inventario.

| Feature | Estado | Notas |
|---|---|---|
| Recetas y escandallos | 🔵 | reutilizable |
| Órdenes de producción | ⚪ | |
| Producto terminado como entrada de inventario | ⚪ | |
| Merma de producción | 🟡 | |
| Rendimiento real vs teórico | ⚪ | |
| Pedidos sobre pedido con anticipo | ⚪ | **así vende Confeti** |
| Fecha de entrega y calendario de producción | ⚪ | |
| Personalización del producto | ⚪ | "pastel con este texto" |
| Costeo por lote | ⚪ | |
| Caducidad de producto terminado | ⚪ | |
| Etiquetado e información nutrimental | ⚪ | |

---

### RAMA F — Comercio digital y omnicanal
*Tienda en línea · click & collect · delivery propio · marketplaces · venta por WhatsApp e Instagram*

**Lo que define esta rama:** la venta entra **sin que nadie la capture**, y el mismo inventario sirve a varios canales.

| Feature | Estado | Notas |
|---|---|---|
| Catálogo público / menú digital | 🔵 | portal QR |
| Tienda en línea con carrito | 🟡 | Confeti tiene e-commerce |
| Pedido en línea | 🔵 | vía QR |
| Recoger en tienda | ⚪ | |
| Envío a domicilio y direcciones | ⚪ | |
| Zonas y costos de envío | ⚪ | |
| Seguimiento del pedido | 🟡 | |
| Pago en línea | ⚪ | Stripe ya está integrado para suscripción |
| Stock compartido entre canales | ⚪ | **el problema técnico difícil de esta rama** |
| Precios por canal | ⚪ | |
| Carrito abandonado | ⚪ | |
| Catálogo a WhatsApp / Instagram | ⚪ | **el canal real en México** |
| Integración con marketplaces | ⚪ | |
| Integración con repartidores | ⚪ | |

**Observación relevante:** lo que más vendes hoy son **sitios web**. Esta rama es el puente natural entre lo que ya vendes y el POS: sitio → menú digital → pedidos → punto de venta.

---

### RAMA G — Suscripción y membresía
*Gimnasio · academia · club · suscripción de comida · software · servicios recurrentes*

| Feature | Estado | Notas |
|---|---|---|
| Planes y precios recurrentes | 🟡 | Stripe conectado, un solo precio |
| Cobro recurrente y reintentos | 🟢 | webhooks completos |
| Estados de suscripción y periodo de gracia | 🟢 | |
| Control de acceso por membresía vigente | ⚪ | |
| Congelar o pausar membresía | ⚪ | |
| Asistencia y check-in | ⚪ | |
| Clases y cupos | ⚪ | |
| Renovación y cobranza | ⚪ | |
| Beneficios por nivel | ⚪ | |

**Nota:** esta rama la usas dos veces — para los clientes de tus clientes, y **para cobrarles a tus propios clientes** la renta mensual del sistema. Los tres que tienes hoy ya te pagan renta.

---

### RAMA H — Mayoreo y distribución
*Distribuidoras · rutas de reparto · B2B con crédito*

| Feature | Estado | Notas |
|---|---|---|
| Listas de precios por cliente | ⚪ | |
| Crédito, límite y cuentas por cobrar | 🟡 | fiado es la versión simple |
| Cotizaciones y pedidos previos | ⚪ | |
| Rutas y preventa | ⚪ | |
| Facturación por lote | ⚪ | |
| Múltiples almacenes y transferencias | ⚪ | |
| Comisión por vendedor | ⚪ | |
| Devoluciones de ruta | ⚪ | |

---

### RAMA I — Transversales avanzadas
*Aplican a varios giros a la vez*

| Feature | Estado | Notas |
|---|---|---|
| Multisucursal con consolidación | ⚪ | **requisito para franquicias** |
| Administración centralizada | ⚪ | |
| Lealtad: puntos, niveles, recompensas | 🟡 | tiendita tiene puntos |
| Cupones y promociones | ⚪ | |
| Tarjetas de regalo y monedero | ⚪ | |
| Empleados: turnos, asistencia, nómina | ⚪ | |
| Comisiones (motor genérico) | ⚪ | |
| Facturación fiscal CFDI | ⚪ | |
| Contabilidad y exportación | 🟡 | |
| Modo offline con cola y conflictos | 🟡 | tiendita tiene IndexedDB + sync |
| Impresoras térmicas y cajón de dinero | ⚪ | |
| App de escritorio | ⚪ | |
| API pública y webhooks | ⚪ | |
| IA: análisis, alertas, sugerencias | ⚪ | |
| Asistente por MCP | ⚪ | |

---

## PARTE 3 — Matriz de giros

Qué ramas necesita cada giro. **T** = tronco común (siempre).

| Giro | Ramas | Esfuerzo desde lo que ya tienes |
|---|---|---|
| Abarrotes / minisúper | T + A | **Casi listo** 🟢 |
| Ferretería | T + A | **Casi listo** 🟢 |
| Papelería | T + A | **Casi listo** 🟢 |
| Vinatería | T + A | **Casi listo** 🟢 |
| Farmacia | T + A + lotes/caducidad | Bajo |
| Boutique / calzado | T + A + variantes | Bajo |
| Celulares / electrónica | T + A + series + garantías | Medio |
| Refaccionaria | T + A + equivalencias | Medio |
| Restaurante | T + B | **Casi listo** 🔵 |
| Fonda / taquería | T + B ligero | **Casi listo** 🔵 |
| Cafetería | T + B ligero + A | **Casi listo** |
| Bar / cantina | T + B + happy hour | Bajo |
| Antro | T + B + cover/consumo mínimo | Medio |
| Pizzería con reparto | T + B + F | Medio |
| Dark kitchen | T + B + F | Medio |
| Pastelería | T + A + E + F | Medio *(es Confeti)* |
| Panadería | T + A + E | Medio |
| Estética / barbería | T + C | **Alto — rama nueva** |
| Spa / uñas | T + C | Alto |
| Dental / consultorio | T + C + expediente | Alto |
| Veterinaria | T + A + C | Alto |
| Taller mecánico | T + A + C + órdenes de servicio | Alto |
| Lavandería | T + C simple | Medio |
| Salón de eventos | T + D | Alto *(eres tu propio cliente)* |
| Gimnasio | T + D + G | Alto |
| Hotel | T + D | Muy alto |
| Estacionamiento | T + D simple | Medio |
| Tienda en línea | T + A + F | Medio |
| Distribuidora | T + A + H | Alto |
| Franquicia (cualquier giro) | T + su rama + I multisucursal | Alto |

---

## Lectura estratégica

**Tres conclusiones que salen de la matriz:**

1. **Con lo que ya tienes cubres 8–10 giros.** Todo el retail de mostrador y toda la comida con servicio. No están terminados a nivel producción, pero las reglas de negocio están descubiertas y probadas en la calle.

2. **La rama C (servicios con cita) es la que más mercado nuevo abre y la que más falta.** Estéticas, barberías, spas, dentistas y veterinarias son un universo enorme en México, casi siempre mal atendido, y ninguno de tus dos sistemas los toca. Es la inversión más grande y la de mayor retorno.

3. **La rama I multisucursal es el boleto de entrada a franquicias**, que es a donde dijiste que quieres llegar. Sin consolidación y administración centralizada, una franquicia no te compra.

**Lo que este catálogo NO es:** un compromiso. Son ~180 capacidades. A medio tiempo, construirlas todas son años. Sirve para tres cosas: saber qué preguntar en una junta de ventas, saber qué ya puedes prometer sin mentir, y decidir con evidencia qué rama abrir cada vez que alguien pague.
