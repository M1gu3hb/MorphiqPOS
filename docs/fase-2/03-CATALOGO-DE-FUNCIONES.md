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
| F-029 | Códigos de barras | [≠] | ◐ |
| F-030 | Paquetes y combos | [≠] | ␣ |
| F-031 | Productos compuestos (kits) | [=] | ␣ |
| F-032 | Importación masiva por Excel | [=] | ⚙ |
| F-033 | Matriz talla / color | [+] | ␣ |
| F-034 | Compatibilidad por vehículo o equipo | [≠] | ␣ |
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
| F-058 | Impresión de etiquetas de anaquel y de código de barras | [=] | ␣ |
| F-059 | Atributos técnicos de medida como eje del catálogo | [+] | ␣ |
| F-060 | Equivalencias y sustitutos entre productos | [+] | ␣ |
| F-061 | Foto de mostrador y búsqueda visual asistida | [+] | ␣ |

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
| F-110 | V1 · El tiempo es el inventario | consultorio, despacho, asesoría, clases | ␣ |
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
| F-121 | Venta en dos unidades `[≠]` · factor exacto o factor por peso | F-112 |
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
| F-146 | Caducidad sin lote · fecha por entrada de compra | F-112 |
| F-147 | Presentación con código de barras propio | F-112, F-029 |
| F-148 | Código de barras con peso o importe embebido (EAN-13 prefijo 2x) | F-144, F-983 |
| F-149 | Conteo cíclico por zona de anaquel | F-106 |
| F-150 | Retazo y sobrante de corte | F-145 |
| F-151 | Doble unidad de venta con conversión por peso | F-112, F-121, F-983 |
| F-152 | Ubicación física de la pieza | F-100 |
| F-153 | Lista de materiales por trabajo | F-020 |
| F-154 | Fórmula capturada al aplicar · consumo real del servicio | F-115, F-434 |
| F-155 | Doble destino del mismo SKU: cabina y anaquel | F-100, F-105 |
| F-156 | Merma de barra: calibración, vaporizado, rehecha, caducidad de leche | F-109, F-115 |
| F-157 | Frescura del grano por fecha de tueste | F-115 |

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
| F-247 | Propina delegada al comensal desde el portal | [=] | ◐ |
| F-248 | Bote del turno repartido por horas presentes | [≠] | ␣ |
| F-249 | Segunda pantalla al cliente | [=] | ␣ |
| F-250 | Gastos con categoría | [=] | ⚙ |
| F-251 | Plantillas de gasto fijo | [=] | ⚙ |
| F-252 | Comprobante adjunto al gasto | [=] | ␣ |
| F-253 | Gastos contra presupuesto | [=] | ␣ |
| F-254 | Cobro de crédito o fiado en caja · entrada que NO es venta | [=] | ␣ |
| F-255 | Venta por comisión · dinero ajeno en tránsito | [=] | ␣ |
| F-256 | Depósito de envase retornable en mostrador (casco) | [≠] | ␣ |
| F-257 | Redondeo de cambio y su registro | [=] | ␣ |
| F-258 | Servicio de mostrador con material y mano de obra | [+] | ␣ |
| F-259 | Liquidación al profesional como salida de caja | [+] | ␣ |
| F-260 | Propina en tarjeta como pasivo hacia el profesional | [+] | ␣ |
| F-261 | Consumo de empleados y cortesías | [=] | ␣ |
| F-262 | Bloqueo de cierre por unidades abiertas | [≠] | ◐ |

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
| F-323 | Marcha por tiempos (retener y liberar) | [+] | ␣ |
| F-324 | Anulación de línea ya comandada, con motivo y reversa de consumo | [+] | ␣ |
| F-325 | Relevo de responsable con unidades abiertas | [+] | ␣ |
| F-328 | Fila de despacho de mostrador | [+] | ␣ |
| F-329 | Llamado por nombre y pantalla pública de recogida | [+] | ␣ |
| F-330 | Pedido anticipado con hora de recogida | [+] | ␣ |
| F-331 | Consumo de empaque según canal de entrega | [+] | ␣ |

> **F-326 y F-327 están libres a propósito.** Se propusieron con número de este
> bloque (A2 · mesa y preparación) pero sus propias fichas las declaran del
> bloque F-2xx, y las dos aplican fuera de A2 — `abarrotes` ya cita el consumo
> de empleados para el autoconsumo del tendero. Se reasignaron a **F-261** y
> **F-262**. No se reutilizan estos dos números para no resucitar la confusión.

## F-4xx · AGENDA Y PROFESIONAL · arquetipo A3

| ID | Función | Marca | Estado |
|---|---|---|---|
| F-400 | Calendario día / semana / mes | [≠] | ␣ |
| F-401 | Duración por servicio | [≠] | ␣ |
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
| F-414 | Anticipo para asegurar la cita | [=] | ␣ |
| F-415 | Servicio con tiempo pasivo intercalable (procesado) | [+] | ␣ |
| F-416 | Bloqueo de agenda no productivo | [=] | ␣ |
| F-417 | Costo del hueco · venta perdida de agenda | [=] | ␣ |
| F-420 | Ficha del profesional | [+] | ␣ |
| F-421 | Servicios que puede dar y a qué precio | [+] | ␣ |
| F-422 | Horario y días libres | [+] | ␣ |
| F-423 | Comisión por servicio | [≠] | ␣ |
| F-424 | Comisión sobre producto vendido | [≠] | ␣ |
| F-425 | Cartera de clientes del profesional | [+] | ␣ |
| F-426 | Productividad y ocupación | [+] | ␣ |
| F-427 | Liquidación de comisiones | [=] | ␣ |
| F-428 | Cita atendida por más de un profesional · reparto | [+] | ␣ |
| F-429 | Origen de la clienta y su efecto en la tarifa de comisión | [+] | ␣ |
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
| F-440 | Regla de comisión: base, momento de causación y excepciones | [+] | ␣ |
| F-441 | Renta de estación (silla) | [+] | ␣ |
| F-442 | Cargo de material al servicio y su efecto en la comisión | [+] | ␣ |
| F-443 | Ledger inmutable de comisión causada | [+] | ␣ |
| F-444 | Rehacer sin cobro (servicio de garantía) | [+] | ␣ |

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
| F-638 | Autorizados a cargar en cuenta | [+] | ␣ |
| F-639 | Subcuenta por obra del cliente | [+] | ␣ |

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
| F-815 | Devolución de envase retornable | [≠] | ␣ |
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
| F-936 | Pasivo de lealtad: recompensas otorgadas y no canjeadas | [=] | ␣ |
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
| F-988 | Venta sin conexión con sincronización posterior | [=] | ␣ |

---

## Conteo

Recalculado el 14-09-2026 contando las filas, no de memoria.

```
IDs canónicos en este catálogo ........... 363
  · con marca de comportamiento .......... 300
  · variantes y subfunciones sin marca ....  63   (F-11x, F-12x…F-15x, F-24x, F-43x, F-92x)

De las 300 con marca:
  Idénticas    [=] ....................... 183   ← se construyen UNA vez
  Variantes    [≠] .......................  39   ← tronco + N variantes
  Exclusivas   [+] .......................  78   ← cuando toque su arquetipo

  Construidas  [⚙] .......................  70
  Parciales    [◐] .......................  10
  Sin construir [␣] ...................... 220
```

**La lectura que importa:** 183 de 300 funciones con marca se construyen una sola vez y sirven a
los 78 modelos. Las **39 variantes** son donde está el riesgo y donde hay que pensar despacio: cada
una es un tronco más N estrategias, y confundir una `[=]` con una `[≠]` es el error caro de esta
fase — mucho más caro que duplicar, porque no se nota hasta que un cliente ve el número mal.

> **Corrección del 14-09-2026.** El conteo anterior decía «Total de funciones catalogadas: 232» y
> era **falso antes de esta reconciliación**: 232 era el número de filas que llevan columna de
> marca en los bloques principales, y dejaba fuera las diez variantes de inventario (F-110–F-119),
> las veintiséis subfunciones de variante (F-120–F-145) y las sub-filas de variante de F-241–F-244,
> F-431–F-435 y F-921–F-926. El catálogo real ya tenía **313** IDs antes de que esta etapa añadiera
> los 50 nuevos. Se corrige y se deja dicho, porque un conteo que se cita en tres documentos y está
> mal se propaga a los 73 modelos que faltan.

---

## Reconciliación del 14-09-2026 · decisión D-11

Cinco agentes documentaron cinco modelos en paralelo, sin hablarse, y propusieron **50 IDs nuevos**.
Esto es lo que se resolvió antes de escribir una línea de código. Se deja escrito porque el criterio
vale más que el resultado: los 73 modelos que faltan van a proponer más IDs y van a necesitarlo.

### Las dos colisiones reales

| ID | Lo pidió `cafeteria` | Lo pidió `abarrotes` | Resolución |
|---|---|---|---|
| **F-146** | merma de barra | caducidad sin lote | **abarrotes conserva F-146.** `cafeteria` se mueve a **F-156** |
| **F-148** | frescura del grano | EAN-13 con peso embebido | **abarrotes conserva F-148.** `cafeteria` se mueve a **F-157** |

**Por qué gana `abarrotes` las dos.** No por antigüedad ni por importancia, sino porque su acepción
la citan **tres** modelos —`abarrotes`, `ferreteria` y `estetica-salon`— contra uno solo de
`cafeteria`, y porque `estetica-salon` **ya había deconflictado a mano** contra la numeración de
`abarrotes` y arrancó en F-154 a propósito (su §6 lo dice). Mover `abarrotes` habría roto ese
trabajo y habría obligado a tocar tres carpetas en vez de una.

**Efecto lateral que conviene saber:** `estetica-salon/FILE-MAP.md` §3 citaba F-146 con la acepción
de `abarrotes`. Al conservarla `abarrotes`, esa cita **quedó correcta sin tocarla**.

### Dos IDs en el bloque equivocado

`restaurante` propuso F-326 (consumo de empleados y cortesías) y F-327 (bloqueo de cierre por
unidades abiertas) **con número del bloque F-3xx**, que es *mesa y preparación · arquetipo A2*,
mientras sus propias fichas las declaraban del bloque **F-2xx**. Las dos aplican fuera de A2 —
`abarrotes` ya cita el consumo de empleados para el autoconsumo del tendero, y el bloqueo de cierre
aplica a A2 y a A7—.

```
F-326  →  F-261   Consumo de empleados y cortesías
F-327  →  F-262   Bloqueo de cierre por unidades abiertas
```

F-326 y F-327 quedan **libres a propósito** y no se reutilizan.

### Funciones que resultaron ser la misma

- **F-254.** `abarrotes` la llamó *cobro de fiado en caja* y `ferreteria` *cobro de crédito en caja*.
  Son la misma función con el vocabulario de cada giro: dinero que entra al cajón y **no es venta**.
  Se fusionan en **F-254 · Cobro de crédito o fiado en caja**. El diccionario de vocabulario (F-017)
  es exactamente lo que resuelve que una diga «fiado» y la otra «crédito» sin duplicar el código.

### Cuatro funciones que comparten mecánica y hay que construir con UN tronco

No se fusionan —sus operaciones y sus pantallas son distintas— pero **son el mismo objeto de datos**:
dinero que entra al cajón, no es del negocio, y hay que devolverlo o entregarlo.

| ID | Modelo | Qué entra | A quién se le debe |
|---|---|---|---|
| F-254 | abarrotes, ferreteria | abono de fiado | a nadie: baja un saldo |
| F-255 | abarrotes | recarga, recibo, paquetería | al tercero que presta el servicio |
| F-256 | abarrotes | depósito de envase (casco) | al cliente que devuelva el envase |
| F-260 | estetica-salon | propina en tarjeta | al profesional que la ganó |

`estetica-salon` ya lo había visto y lo dejó escrito: *«es, mecánicamente, el mismo objeto que
F-256»*. **Se construyen sobre un solo ledger de pasivos de terceros**, con cuatro naturalezas. Si
se escriben cuatro veces, se descuadran cuatro veces distintas.

### Las reclasificaciones aplicadas

Ocho peticiones de los modelos, sobre **siete** funciones distintas (F-029 la pidieron dos).

| Función | Antes | Ahora | Quién lo pidió y por qué |
|---|---|---|---|
| **F-029** Códigos de barras | `[=]` | `[≠]` | `abarrotes` y `ferreteria`. Tres variantes: apagada (restaurante), N códigos por producto (abarrotes, F-147), y catálogo **mixto** con SKU interno impreso para la mitad sin código de fábrica (ferretería) |
| **F-034** Compatibilidad | `[+]` | `[≠]` | `ferreteria`. Variantes: **vehicular** (refaccionaria) y **por medida y sistema** (ferretería, plomería, materiales) |
| **F-110** V1 | *Sin inventario* | **El tiempo es el inventario** | `estetica-salon`. La descripción anterior era **falsa**: estética, spa, veterinaria y tatuajes consumen producto todos los días. Los giros se corrigen a consultorio, despacho, asesoría y clases |
| **F-121** Venta en dos unidades | sin marca | `[≠]` | `ferreteria`. Variantes: **factor exacto** (abarrotes: caja = 24) y **factor por peso** (ferretería: F-151, con 3%–8% de desviación real entre lotes) |
| **F-401** Duración por servicio | `[=]` | `[≠]` | `estetica-salon`. En dental y fotografía la duración es un número; en estética, uñas, spa y fisioterapia es una **secuencia activo-pasivo-cierre** (F-415) |
| **F-424** Comisión sobre producto | `[=]` | `[≠]` | `estetica-salon`. En una boutique comisiona **quien vendió**; en un salón comisiona **quien atendió**, aunque cobre otra persona, y con otro porcentaje |
| **F-815** Envase retornable | `[+]` A9 | `[≠]` | `abarrotes`. Dos variantes: **mostrador** (F-256) y **ruta** (la original de A9) |

### Lo que NO se tocó, y por qué

- **`estetica-salon` no se renumeró en absoluto.** Leyó lo que propusieron los otros cuatro y arrancó
  en F-154, F-259 y en el bloque F-4xx, que estaba intacto. Es el único que hizo el trabajo de
  deconflictar antes, y reasignarle un ID habría roto algo que ya estaba bien.
- **No se compactaron los huecos** (F-326, F-327, F-637). Un catálogo con huecos es más barato que
  uno renumerado: el hueco no le miente a nadie.
