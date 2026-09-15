# 03 · CATÁLOGO DE FUNCIONES · IDs canónicos

**Toda función del sistema tiene un ID y sólo uno. Se usa SIEMPRE ese ID, en toda carpeta de modelo.**
Si dos carpetas llaman distinto a la misma función, el mapa se rompe y el trabajo se pierde.

Si necesitas una función que no está aquí, **añádela a este archivo primero** con el siguiente ID libre de su bloque. Nunca la inventes sólo dentro de una carpeta de modelo.

---

## Leyenda

```
[=]  idéntica en todos los modelos que la usan
[≠]  mismo nombre, comportamiento distinto — lleva variantes
[+]  exclusiva de un arquetipo
[⚙]  construida hoy en MorphiqPOS y funcionando
[◐]  construida sólo en su variante de restaurante
[ ]  no existe
```

---

## F-0xx · NÚCLEO — los diez arquetipos

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-001 | Tarjetas de empleado | [=] | ⚙ |
| F-002 | PIN de 4 dígitos, Argon2id en servidor | [=] | ⚙ |
| F-003 | Roles y permisos | [=] | ⚙ |
| F-004 | Sesión revocable con caducidad | [=] | ⚙ |
| F-005 | Bloqueo por intentos fallidos | [=] | ⚙ |
| F-006 | Bitácora de acceso y auditoría | [=] | ⚙ |
| F-007 | Permisos finos por módulo | [=] | ␣ |
| F-010 | Identidad del negocio (nombre, logo, contacto) | [=] | ⚙ |
| F-011 | Impuestos: IVA extraído o sumado | [≠] | ⚙ |
| F-012 | Sucursales | [=] | ⚙ |
| F-013 | Terminales | [=] | ⚙ |
| F-014 | Apariencia y tema | [=] | ⚙ |
| F-015 | **Plantilla de negocio** | [+] | ␣ |
| F-016 | Perillas por módulo | [≠] | ␣ |
| F-017 | Diccionario de vocabulario del giro | [+] | ␣ |
| F-018 | Migración entre plantillas sin perder datos | [+] | ␣ |
| F-020 | Catálogo de productos y servicios | [≠] | ⚙ |
| F-021 | Categorías | [=] | ⚙ |
| F-022 | Precio único | [=] | ⚙ |
| F-023 | Listas de precio (público, mayoreo, convenio) | [=] | ␣ |
| F-024 | Precio por sucursal | [=] | ␣ |
| F-025 | Precio por volumen escalonado | [=] | ␣ |
| F-026 | Precio por horario o temporada | [=] | ␣ |
| F-027 | Modificadores y extras | [≠] | ◐ |
| F-028 | Imágenes de producto | [=] | ⚙ |
| F-029 | Códigos de barras | [=] | ◐ |
| F-030 | Paquetes y combos | [≠] | ␣ |
| F-031 | Productos compuestos (kits) | [=] | ␣ |
| F-032 | Importación masiva por Excel | [=] | ⚙ |
| F-033 | Matriz talla / color | [+] | ␣ |
| F-034 | Compatibilidad por vehículo o equipo | [+] | ␣ |
| F-040 | Clientes: ficha básica | [=] | ⚙ |
| F-041 | Historial de compra del cliente | [=] | ␣ |
| F-042 | Datos fiscales (RFC, régimen, CP) | [=] | ␣ |
| F-043 | Etiquetas y segmentos | [=] | ␣ |
| F-044 | Notas del cliente | [=] | ␣ |
| F-050 | Registros: ventas por periodo | [≠] | ⚙ |
| F-051 | Más vendidos | [≠] | ⚙ |
| F-052 | Utilidad y margen | [≠] | ⚙ |
| F-053 | Cortes históricos | [=] | ⚙ |
| F-054 | Ventas por empleado | [≠] | ⚙ |
| F-055 | Comparativo entre periodos | [=] | ␣ |
| F-056 | **Dashboard** | [≠] | ◐ |
| F-057 | Exportación a Excel y PDF | [=] | ◐ |

## F-1xx · INVENTARIO

**Tronco común — se construye una vez, sirve a las diez variantes**

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-100 | Existencia actual por almacén | [=] | ⚙ |
| F-101 | Ledger inmutable de movimientos | [=] | ⚙ |
| F-102 | Decremento atómico al cobrar | [=] | ⚙ |
| F-103 | Kardex / historial por artículo | [=] | ␣ |
| F-104 | Ajuste manual con motivo obligatorio | [=] | ⚙ |
| F-105 | Traspaso entre almacenes o sucursales | [=] | ␣ |
| F-106 | Toma de inventario físico y diferencias | [=] | ␣ |
| F-107 | Alertas de mínimo | [=] | ⚙ |
| F-108 | Valuación (costo promedio, PEPS) | [=] | ◐ |
| F-109 | Merma con motivo | [≠] | ␣ |

**Las diez variantes** — `F-11x` es el eje de variante del inventario

| ID | Variante | Giros | Estado |
|---|---|---|---|
| F-110 | V1 · Sin inventario | servicios puros | ␣ |
| F-111 | V2 · Stock simple (pieza) | papelería, boutique, dulcería | ␣ |
| F-112 | V3 · Presentaciones (caja ↔ pieza) | abarrotes, ferretería, farmacia | ␣ |
| F-113 | V4 · Lote y caducidad | farmacia, perecederos, agroveterinaria | ␣ |
| F-114 | V5 · Número de serie / IMEI | celulares, electrónica, refaccionaria | ␣ |
| F-115 | V6 · Peso, volumen y receta | restaurante, cafetería, bar | ⚙ |
| F-116 | V7 · Producción por lote | panadería, tortillería, cervecería | ␣ |
| F-117 | V8 · Por proyecto u obra | constructora, carpintería | ␣ |
| F-118 | V9 · Consignación | bazar, galería, boutique multimarca | ␣ |
| F-119 | V10 · Activos que vuelven | renta de equipo y mobiliario | ␣ |

**Subfunciones de variante**

| ID | Función | Depende de |
|---|---|---|
| F-120 | Factor de conversión entre presentaciones | F-112 |
| F-121 | Venta en dos unidades | F-112 |
| F-122 | Salida PEPS obligatoria | F-113 |
| F-123 | Alerta de próximo a caducar | F-113 |
| F-124 | Trazabilidad de lote | F-113, F-116 |
| F-125 | Captura de serie en compra y venta | F-114 |
| F-126 | Búsqueda por número de serie | F-114 |
| F-127 | Garantía ligada a la serie | F-114 |
| F-128 | Receta / escandallo | F-115 |
| F-129 | Explosión de receta al cobrar | F-115 |
| F-130 | Costeo por insumo | F-115 |
| F-131 | Producto por peso variable | F-115 |
| F-132 | Insumo base (el producto ES el insumo) | F-115 |
| F-133 | Rendimiento real contra teórico | F-115, F-116 |
| F-134 | Orden de producción | F-116 |
| F-135 | Producto en proceso | F-116 |
| F-136 | Costo del lote producido | F-116 |
| F-137 | Requisición de obra | F-117 |
| F-138 | Devolución de sobrante de obra | F-117 |
| F-139 | Liquidación al consignante | F-118 |
| F-140 | Disponibilidad por fecha | F-119 |
| F-141 | Estado de salida y retorno | F-119 |
| F-142 | Mantenimiento entre rentas | F-119 |
| F-143 | Daño y reposición | F-119 |
| F-144 | Venta a granel / por peso en mostrador | F-111, F-112 |
| F-145 | Corte de material (metro, lámina) | F-112 |

## F-2xx · VENTA, COBRO Y CAJA

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-200 | Carrito | [≠] | ⚙ |
| F-201 | Búsqueda rápida (código, nombre, tecla) | [=] | ⚙ |
| F-202 | Descuento por línea | [=] | ⚙ |
| F-203 | Descuento por total | [=] | ⚙ |
| F-204 | Cupón | [=] | ␣ |
| F-205 | Autorización de descuento por supervisor | [=] | ␣ |
| F-210 | Cobro en efectivo con cambio | [=] | ⚙ |
| F-211 | Cobro con tarjeta | [=] | ⚙ |
| F-212 | Cobro por transferencia | [=] | ⚙ |
| F-213 | Pago mixto | [=] | ⚙ |
| F-214 | Vales y monedero | [=] | ␣ |
| F-215 | Cobro con pasarela en línea | [=] | ␣ |
| F-220 | Ticket | [≠] | ⚙ |
| F-221 | Cancelación con motivo | [=] | ⚙ |
| F-222 | Devolución total o parcial | [≠] | ⚙ |
| F-223 | Folio consecutivo por sucursal | [=] | ⚙ |
| F-224 | Venta en espera / suspendida | [=] | ␣ |
| F-225 | Reimpresión de ticket | [=] | ⚙ |
| F-230 | Caja: apertura con fondo | [=] | ⚙ |
| F-231 | Movimientos: entrada, retiro, gasto | [=] | ⚙ |
| F-232 | Arqueo a ciegas | [=] | ⚙ |
| F-233 | Corte de turno | [=] | ⚙ |
| F-234 | **Corte diario y su PDF** | [≠] | ⚙ |
| F-235 | Varias cajas simultáneas | [=] | ␣ |
| F-236 | Caja por terminal | [=] | ⚙ |
| F-240 | Propinas | [≠] | ⚙ |
| F-241 | V2 · Sugerida al cobrar | — | ⚙ |
| F-242 | V3 · Repartida por puntos (tronco) | — | ␣ |
| F-243 | V4 · Directa al profesional | — | ␣ |
| F-244 | V5 · Al repartidor | — | ␣ |
| F-245 | Desglose exacto por método | [=] | ⚙ |
| F-246 | Liquidación de propinas por periodo | [=] | ⚙ |
| F-250 | Gastos con categoría | [=] | ⚙ |
| F-251 | Plantillas de gasto fijo | [=] | ⚙ |
| F-252 | Comprobante adjunto al gasto | [=] | ␣ |
| F-253 | Gastos contra presupuesto | [=] | ␣ |

## F-3xx · MESA Y PREPARACIÓN · arquetipo A2

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-300 | Zonas y distribución | [+] | ⚙ |
| F-301 | Unidades de servicio con estado y capacidad | [≠] | ⚙ |
| F-302 | Unir y separar unidades | [+] | ␣ |
| F-303 | Cambiar de unidad | [+] | ␣ |
| F-304 | Asignación de responsable | [=] | ⚙ |
| F-305 | Tiempo de ocupación | [=] | ␣ |
| F-306 | Lista de espera | [=] | ␣ |
| F-310 | Enviar a preparación | [+] | ⚙ |
| F-311 | Estaciones de preparación | [+] | ⚙ |
| F-312 | Ruteo de producto a estación | [+] | ⚙ |
| F-313 | Pantalla de preparación | [+] | ⚙ |
| F-314 | Estados: pendiente, preparando, listo | [+] | ⚙ |
| F-315 | Tiempos por platillo | [+] | ␣ |
| F-316 | Alertas de alergia | [+] | ⚙ |
| F-317 | Notas al preparador | [+] | ⚙ |
| F-318 | Impresión de comanda | [+] | ␣ |
| F-319 | Llamado de "listo" | [+] | ␣ |
| F-320 | Cuenta abierta que crece | [+] | ⚙ |
| F-321 | Dividir cuenta | [+] | ␣ |
| F-322 | Precuenta | [+] | ⚙ |

## F-4xx · AGENDA Y PROFESIONAL · arquetipo A3

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-400 | Calendario día / semana / mes | [≠] | ␣ |
| F-401 | Duración por servicio | [=] | ␣ |
| F-402 | Agenda por profesional | [+] | ␣ |
| F-403 | Agenda por recurso | [+] | ␣ |
| F-404 | Disponibilidad y huecos | [=] | ␣ |
| F-405 | Reserva en línea por el cliente | [≠] | ␣ |
| F-406 | Confirmación y recordatorio | [=] | ␣ |
| F-407 | Reprogramar y cancelar | [=] | ␣ |
| F-408 | Política de cancelación y penalización | [=] | ␣ |
| F-409 | Lista de espera de citas | [=] | ␣ |
| F-410 | Sobrecupo controlado | [=] | ␣ |
| F-411 | Cita recurrente | [=] | ␣ |
| F-412 | Registro de no-show | [=] | ␣ |
| F-413 | Walk-in sin cita | [=] | ␣ |
| F-420 | Ficha del profesional | [+] | ␣ |
| F-421 | Servicios que puede dar y a qué precio | [+] | ␣ |
| F-422 | Horario y días libres | [+] | ␣ |
| F-423 | Comisión por servicio | [≠] | ␣ |
| F-424 | Comisión sobre producto vendido | [=] | ␣ |
| F-425 | Cartera de clientes del profesional | [+] | ␣ |
| F-426 | Productividad y ocupación | [+] | ␣ |
| F-427 | Liquidación de comisiones | [=] | ␣ |
| F-430 | **Expediente** | [≠] | ␣ |
| F-431 | V1 · Clínico | — | ␣ |
| F-432 | V2 · Veterinario | — | ␣ |
| F-433 | V3 · Vehicular | — | ␣ |
| F-434 | V4 · De belleza | — | ␣ |
| F-435 | V5 · Académico | — | ␣ |
| F-436 | Fotos antes y después | [=] | ␣ |
| F-437 | Documentos adjuntos | [=] | ␣ |
| F-438 | Consentimiento firmado | [=] | ␣ |
| F-439 | Paquete de sesiones | [=] | ␣ |

## F-5xx · ORDEN DE TRABAJO · arquetipo A4

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-500 | Recepción del bien | [≠] | ␣ |
| F-501 | Ficha del objeto recibido | [≠] | ␣ |
| F-502 | Estado de entrada con fotos | [=] | ␣ |
| F-503 | Inventario de lo que trae | [=] | ␣ |
| F-504 | Firma de recepción | [=] | ␣ |
| F-505 | Diagnóstico | [≠] | ␣ |
| F-506 | Presupuesto y autorización del cliente | [=] | ␣ |
| F-507 | Refacciones y mano de obra | [=] | ␣ |
| F-508 | Asignación a técnico | [=] | ␣ |
| F-509 | Estados de la orden | [≠] | ␣ |
| F-510 | Aviso al cliente por WhatsApp | [=] | ␣ |
| F-511 | Entrega con firma | [=] | ␣ |
| F-512 | Garantía del trabajo | [=] | ␣ |
| F-513 | Historial del objeto | [=] | ␣ |
| F-514 | Ticket de reclamo | [=] | ␣ |
| F-515 | Multipunto de revisión | [+] | ␣ |

## F-6xx · COTIZACIÓN, PEDIDO Y CRÉDITO · arquetipo A5

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-600 | Cotización con vigencia | [=] | ␣ |
| F-601 | Versiones de cotización | [=] | ␣ |
| F-602 | Envío por correo o WhatsApp | [=] | ␣ |
| F-603 | Aprobación del cliente | [=] | ␣ |
| F-604 | Conversión a pedido | [=] | ␣ |
| F-605 | Surtido parcial | [=] | ␣ |
| F-606 | Remisión de entrega | [=] | ␣ |
| F-607 | Seguimiento: ganada, perdida, motivo | [=] | ␣ |
| F-610 | Límite de crédito por cliente | [=] | ␣ |
| F-611 | Días de plazo | [=] | ␣ |
| F-612 | Estado de cuenta | [=] | ␣ |
| F-613 | Antigüedad de saldos | [=] | ␣ |
| F-614 | Aplicación de pagos a facturas | [=] | ␣ |
| F-615 | Pago parcial | [=] | ␣ |
| F-616 | Recordatorio de vencimiento | [=] | ␣ |
| F-617 | Bloqueo por mora | [=] | ␣ |
| F-618 | Nota de crédito | [=] | ␣ |
| F-620 | Apartado con abonos | [=] | ␣ |
| F-621 | Vigencia del apartado | [=] | ␣ |
| F-622 | Reserva de mercancía apartada | [=] | ␣ |
| F-623 | Cancelación y penalización de apartado | [=] | ␣ |
| F-630 | Compras: orden de compra | [=] | ␣ |
| F-631 | Proveedores | [=] | ⚙ |
| F-632 | Recepción y entrada a inventario | [=] | ⚙ |
| F-633 | Actualización de costo promedio | [=] | ⚙ |
| F-634 | Plantillas de compra recurrente | [=] | ⚙ |
| F-635 | Cuentas por pagar | [=] | ␣ |
| F-636 | Comparativo de precios entre proveedores | [=] | ␣ |

## F-7xx · SUSCRIPCIÓN Y ESPACIO · arquetipos A6 y A7

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-700 | Planes y periodicidad | [=] | ␣ |
| F-701 | Alta y baja de suscripción | [=] | ␣ |
| F-702 | Cobro recurrente | [=] | ␣ |
| F-703 | Reintento de cobro fallido | [=] | ␣ |
| F-704 | Pausa y reanudación | [=] | ␣ |
| F-705 | Control de acceso físico | [≠] | ␣ |
| F-706 | Visitas incluidas y consumidas | [=] | ␣ |
| F-707 | Congelamiento de membresía | [=] | ␣ |
| F-708 | Renovación y vencimiento | [=] | ␣ |
| F-709 | Retención: aviso y oferta | [=] | ␣ |
| F-720 | Unidades reservables | [≠] | ␣ |
| F-721 | Tipos y tarifas | [≠] | ␣ |
| F-722 | Calendario de ocupación | [≠] | ␣ |
| F-723 | Tarifa por temporada / día / hora | [=] | ␣ |
| F-724 | Anticipo y política de reserva | [=] | ␣ |
| F-725 | Check-in y check-out | [+] | ␣ |
| F-726 | Consumos cargados a la unidad | [+] | ␣ |
| F-727 | Sobreventa controlada | [+] | ␣ |
| F-728 | Limpieza y estado de la unidad | [+] | ␣ |
| F-729 | Canales externos (Booking, Airbnb) | [+] | ␣ |
| F-730 | Tarifa por fracción de tiempo | [+] | ␣ |
| F-731 | Pensión / abono mensual de espacio | [+] | ␣ |

## F-8xx · PRODUCCIÓN Y RUTA · arquetipos A8 y A9

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-800 | Programa de producción del día | [+] | ␣ |
| F-801 | Producción contra demanda histórica | [+] | ␣ |
| F-802 | Mermas de producción | [+] | ␣ |
| F-810 | Clientes por ruta | [+] | ␣ |
| F-811 | Preventa | [+] | ␣ |
| F-812 | Carga del vehículo | [+] | ␣ |
| F-813 | Entrega con firma o foto | [=] | ␣ |
| F-814 | Cobro en ruta | [+] | ␣ |
| F-815 | Devolución de envase retornable | [+] | ␣ |
| F-816 | Liquidación del repartidor | [+] | ␣ |
| F-817 | Geolocalización de la entrega | [=] | ␣ |
| F-818 | Rendimiento por ruta | [+] | ␣ |
| F-820 | Pedido a domicilio | [=] | ␣ |
| F-821 | Domicilio del cliente y mapa | [=] | ␣ |
| F-822 | Costo de envío por zona | [=] | ␣ |
| F-823 | Repartidor asignado | [=] | ␣ |
| F-824 | Estados del pedido a domicilio | [=] | ␣ |
| F-825 | Seguimiento para el cliente | [=] | ␣ |
| F-826 | Integración Rappi / DiDi / Uber Eats | [=] | ␣ |

## F-9xx · CRM, PROYECTO Y TRANSVERSALES

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-900 | Prospecto y su origen | [+] | ␣ |
| F-901 | Etapas del embudo | [+] | ␣ |
| F-902 | Actividades y seguimientos | [+] | ␣ |
| F-903 | Propuesta comercial | [+] | ␣ |
| F-904 | Proyecto con fases y entregables | [+] | ␣ |
| F-905 | Horas trabajadas por persona | [+] | ␣ |
| F-906 | Costo del proyecto contra cobrado | [+] | ␣ |
| F-907 | Facturación por avance o hito | [+] | ␣ |
| F-908 | Rentabilidad del proyecto | [+] | ␣ |
| F-920 | **Portal del cliente** | [≠] | ◐ |
| F-921 | V1 · Menú QR y pedido en mesa | — | ⚙ |
| F-922 | V2 · Catálogo público y pedido | — | ␣ |
| F-923 | V3 · Reserva en línea | — | ␣ |
| F-924 | V4 · Consulta de orden de trabajo | — | ␣ |
| F-925 | V5 · Estado de cuenta | — | ␣ |
| F-926 | V6 · Tienda en línea completa | — | ␣ |
| F-930 | Puntos por compra | [=] | ␣ |
| F-931 | Niveles de cliente | [=] | ␣ |
| F-932 | Monedero electrónico | [=] | ␣ |
| F-933 | Cupones y promociones | [=] | ␣ |
| F-934 | Recompensas y canje | [=] | ␣ |
| F-935 | Cumpleaños y fechas | [=] | ␣ |
| F-940 | **Facturación CFDI 4.0** | [=] | ␣ |
| F-941 | Timbrado ante PAC | [=] | ␣ |
| F-942 | Factura global del día | [=] | ␣ |
| F-943 | Complemento de pago | [=] | ␣ |
| F-944 | Cancelación con motivo SAT | [=] | ␣ |
| F-945 | Envío automático por correo | [=] | ␣ |
| F-950 | Campañas por WhatsApp | [=] | ␣ |
| F-951 | Recuperación de inactivos | [=] | ␣ |
| F-952 | Encuesta de satisfacción | [=] | ◐ |
| F-953 | Reseñas de Google | [=] | ␣ |
| F-960 | Reloj checador | [=] | ␣ |
| F-961 | Horas trabajadas | [=] | ␣ |
| F-962 | Turnos y horarios | [=] | ␣ |
| F-963 | Cálculo de nómina | [=] | ␣ |
| F-964 | Vacaciones y permisos | [=] | ␣ |
| F-970 | Multi-sucursal: catálogo compartido | [=] | ␣ |
| F-971 | Inventario por sucursal | [=] | ⚙ |
| F-972 | Traspasos entre sucursales | [=] | ␣ |
| F-973 | Reportes consolidados | [=] | ␣ |
| F-974 | Permisos por sucursal | [=] | ⚙ |
| F-980 | Restricción legal de venta (edad, horario) | [≠] | ␣ |
| F-981 | Control volumétrico | [+] | ␣ |
| F-982 | Avalúo y contrato de empeño | [+] | ␣ |
| F-983 | Báscula conectada | [=] | ␣ |
| F-984 | Cajón de dinero | [=] | ␣ |
| F-985 | Impresora térmica | [=] | ⚙ |
| F-986 | Lector de código de barras | [=] | ◐ |
| F-987 | Terminal bancaria integrada | [=] | ␣ |

---

## Conteo

```
Total de funciones catalogadas ....... 232
Construidas hoy [⚙] .................. 54
Parciales [◐] ........................ 9
Sin construir ........................ 169

Idénticas [=] ........................ 148  ← se construyen UNA vez
Variantes [≠] ........................ 26   ← tronco + N variantes
Exclusivas [+] ....................... 58
```

**La lectura que importa:** 148 de 232 funciones se construyen una sola vez y sirven a todos los modelos. Las 26 variantes son donde está el riesgo y donde hay que pensar despacio. Las 58 exclusivas se construyen cuando toque su arquetipo.
