# F1.4 — Restaurante

**Objetivo:** **la fusión se consuma aquí.** Mesas, mesero, comandas, cocina y propinas operando en la misma aplicación que ya vende de mostrador. Es el corte más grande y el de mayor riesgo.

**Esfuerzo estimado:** 20–28 jornadas · **Precondición:** F1.3 firmado.

> **Por qué es el corte de mayor riesgo:** aquí se reimplementan `Caja.jsx` (81 KB) y `Mesero.jsx` (65 KB), los dos archivos donde la Fuente A concentra sus defectos P0-03, P0-04 y P0-05. Y es donde se valida que la abstracción `ordenes` con estrategias funciona de verdad — con **dos** implementaciones, no con una inventada.

---

## Fuera de alcance

Portal QR del comensal (F1.5). Dividir y unir cuenta, tiempos y cursos, reservaciones, repartidores — quedan fuera de la Fase 1 y entran al catálogo como candidatas.

---

## Tareas

### F1.4-T01 · Levantar el dominio de preparación
| Origen | Destino |
|---|---|
| `preparacionEstacionUtils.js` (6.1 KB) | `domain/preparacion/ruteo.ts` |
| `estacionUtils.js` | `domain/preparacion/estaciones.ts` |
| `mesasPendientesCierre.js` (acoplado, se reescribe) | `domain/mesa/pendientes.ts` |
| `entregaPedidos.js` (acoplado, se reescribe) | `domain/preparacion/entrega.ts` |

**Aceptación:** el ruteo a estaciones se prueba con productos de una, dos y ninguna estación.

### F1.4-T02 · Máquinas de estado de comanda y mesa
`domain/estados/maquinaComanda.ts`: `nueva → en_preparacion → lista → entregada`, con `cancelada` desde cualquiera.
`domain/estados/maquinaMesa.ts`: `libre → ocupada → cuenta_solicitada → por_limpiar → libre`.

**Aceptación:** `KDS-02` sólo transiciones válidas y **monotónicas** — un estado más viejo nunca reemplaza a uno más nuevo (`version`).

### F1.4-T03 · Migraciones de restaurante
`zonas` · `mesas` · `estaciones_preparacion` · `comandas` · `comanda_items` · `solicitudes_qr` · `liquidaciones_propina` · `liquidacion_detalle`.

**Clave:** `mesas` **no lleva `venta_activa_id`**. La orden activa se resuelve con el índice parcial:
```sql
create unique index ordenes_mesa_activa
  on ordenes (mesa_id)
  where estado not in ('pagada','cancelada') and mesa_id is not null;
```

**Aceptación:** la restricción impide a nivel de base que una mesa tenga dos órdenes activas. Corrige **P0-05** estructuralmente, no con un candado en memoria.

### F1.4-T04 · Mapa de mesas — **conservar de la Fuente A**
Zonas, formas, tamaños, posiciones, capacidad. Portados `MesaMapEditor`, `MesaShape`, `MesaEditDialog`, `MesaListMobile`.

**Aceptación:** el mapa se edita, se guarda y se ve igual en escritorio y en tablet. Densidad cómoda en tablet.

### F1.4-T05 · Abrir mesa — corrige **P0-05**
`abrirMesa` transaccional: crea la orden con `estrategia_captura='mesa'` y `estrategia_cumplimiento='preparacion'`, y actualiza la mesa. **En una sola transacción, con control de versión.**

**Aceptación:** `TABLE-01` mesa y orden se crean juntas · `TABLE-02` **concurrencia real**: dos dispositivos abren la misma mesa a la vez → una sola orden activa, la otra recibe conflicto tipado, sin estado huérfano.

### F1.4-T06 · Enviar comanda — corrige **P0-04**
`enviarComanda` atómico: agrupa las líneas por estación, crea las comandas y sus items, transiciona la orden, todo con clave de idempotencia. **Si una línea falla, la operación completa falla.**

**Se elimina el concepto de "línea shadow"** de la Fuente A. No existe forma de que un total incluya una línea no persistida.

**Aceptación:**
- `TABLE-03` doble toque al enviar → una sola comanda y un solo juego de líneas, por idempotencia.
- `TABLE-04` **inyección de fallo** en una línea → no se persisten totales ni comandas parciales.
- `KDS-01` productos de dos estaciones → dos comandas correctas, sin duplicar líneas.
- **Invariante en producción:** alerta si una orden confirmada tiene un total distinto de la suma de sus líneas.

### F1.4-T07 · Pantalla de mesero
`(operacion)/mesero`, cliente puro, **densidad cómoda** (tablet, de pie, con prisa).

**Se reimplementa desde cero.** `Mesero.jsx` (65 KB) se lee como especificación, no se copia. Componentes portados: `MesaActivaView`, `MesaGridMobile`, `MeseroCartFAB`, `CantidadVariableDialog`, `SeleccionModificadoresDialog`, `ProductoFichaExpandible`, `ListosParaRecogerCard`, `AbrirMesaDialog`, `PreCuentaInlineView`, `AlertasMeseroDialog`, `PrecioProductoMesero`.

**Aceptación:** ningún archivo supera 300 líneas. Objetivos táctiles ≥44 px. Un mesero abre mesa, agrega productos con modificadores y exclusiones, y envía a cocina en menos de 30 segundos.

### F1.4-T08 · Exclusiones "SIN" en captura — **conservar de la Fuente A**
El mesero marca ingredientes a excluir; se guardan en `orden_linea_exclusiones` (normalizadas, ya no un string JSON).

**Aceptación:** la exclusión viaja a la comanda, la cocina la ve destacada, y en F1.3 ya quedó probado que **no se descuenta** del inventario. Ciclo completo cerrado.

### F1.4-T09 · Cocina / KDS — **conservar de la Fuente A**
`(operacion)/cocina`, cliente puro, **estilo `industrial` forzado** y densidad compacta: se lee a dos metros, con las manos ocupadas.

Comandos `transicionarItem` y `entregarItem`. Portados: `CocinaPedidoCardPremium` (17 KB), `CocinaPedidoCardCompact`, `CocinaKanbanCard`, `CocinaMesaGroupCard`, `CocinaStationMiniCard`, `CocinaProductoDialog`, `CocinaVozControl`, `CocinaNuevoPedidoWatcher`.

Se conservan las alertas por voz (`voiceAlert.js`, 16 KB) y los sonidos con desbloqueo explícito de audio.

**Se corrige P1-08:** el polling de 2–30 segundos se sustituye por Realtime como notificación + revalidación por API, con `version` monotónica.

**Aceptación:**
- `KDS-03` una comanda huérfana o inválida no aparece como atendible y genera alerta de reconciliación (era el delta que distinguía borrador de En vivo en la Fuente A).
- `KDS-04` **actualizaciones fuera de orden**: un estado más viejo no reemplaza al nuevo.
- La pantalla se lee a dos metros. Se verifica en tablet real.

### F1.4-T10 · Entrega y ciclo del pedido
`entregarItem` agrupado por venta y mesa; el mesero recibe la señal de "listo para recoger".

**Aceptación:** el ciclo nuevo → preparación → listo → entregado funciona en tres dispositivos a la vez (tablet, teléfono, PC), en red local, sin internet.

### F1.4-T11 · Propinas — **conservar de la Fuente A**
Propina por método, con sus seis tipos (`sin_propina`, `porcentaje`, `monto_manual`, `pendiente`, `pendiente_cliente`, `decidir_en_caja`) y su origen. `liquidarPropinas` por periodo con detalle por empleado.
Se usa `domain/venta/propinas.ts`, levantado de `tipsUtils.js` en F1.2.

**Aceptación:** `CASH-03` extendido — pago mixto con propina repartida entre métodos cuadra exactamente. La liquidación suma lo mismo que las propinas del periodo.

### F1.4-T12 · Precuenta — **conservar de la Fuente A**
`solicitarCuenta` y la impresión de precuenta.

**Aceptación:** `PRINT-02` la precuenta refleja el consumo actual y **no marca la orden como pagada**. Es una regla de negocio importante y se prueba como conservación.

### F1.4-T13 · Ajuste de cuenta antes de cobrar — **conservar, decisión A-31/Q-09**
Ya existe la tabla `orden_ajustes` de F1.2. Aquí se construye la UI y se define el alcance: qué puede modificar un cajero y con qué autorización.

> **Bloqueado por Q-09.** Si Miguel no la ha respondido al llegar aquí, se implementa la versión conservadora: quitar línea y cambiar cantidad, con motivo obligatorio y auditoría; cambiar precio requiere permiso de gerente.

**Aceptación:** cada ajuste queda en `orden_ajustes` con quién, cuándo, motivo, antes y después. El total se recalcula en servidor.

### F1.4-T14 · Caja de restaurante — reimplementación de `Caja.jsx`
`(operacion)/caja` extendida: cuentas pendientes por mesa, cobro de cuenta de mesa, liberación de mesa, mesas pendientes de cierre.

**`Caja.jsx` (81 KB) se lee como especificación y se reconstruye.** Es la tarea más grande del corte. Componentes portados: `CierreDiarioDialog`, `MesasPendientesCierreDialog`, `ResumenDelDia`, `CorteTurnoDialog`, `CorteTicket` (23 KB), `PreCuentaTicket`.

**Aceptación:** `TABLE-06` cobrar una mesa deja consistentes en una sola transacción: orden, pago, caja, inventario, comandas y mesa. Ninguna de las seis queda a medias si falla otra.

### F1.4-T15 · Estaciones de preparación — **conservar de la Fuente A**
`(gestion)/configuracion` sección de estaciones, con asignación de categorías. Portado de `EstacionesPreparacionSection` (20 KB) y `EstacionesAyuda`.

**Aceptación:** una categoría se asigna a una estación y los productos de esa categoría rutean ahí automáticamente.

### F1.4-T16 · Perfil de giro `restaurante`
`capability.json` de la capacidad `restaurante` con sus 12 declaraciones. Perfil certificado que activa: catálogo, ventas, caja, inventario, compras y restaurante.

**Aceptación:**
- `CAP-01` con la capacidad desactivada, las rutas de mesero y cocina no cargan, los comandos devuelven 403, y el histórico sigue siendo legible según permiso.
- Un negocio configurado como `retail` **no ve nada de restaurante**, y viceversa. **Misma aplicación, mismo login.**

### F1.4-T17 · Tenant de demostración: restaurante
Semilla realista: menú con platillos, fotos, precios creíbles, recetas con costo, mesas por zonas, estaciones, empleados de los tres roles, y dos semanas de historial.

**Aceptación:** Miguel abre "Restaurante" y hace las escenas 2, 3, 4 y 6 del guion de demostración en tres dispositivos, en red local, sin internet.

---

## Pruebas obligatorias del corte

| ID | Escenario | Tipo | Cierra |
|---|---|---|---|
| `TABLE-01` | Abrir mesa libre: mesa y orden en una transacción | Integración | P0-05 |
| `TABLE-02` | Dos dispositivos abren la misma mesa | Concurrencia | P0-05 |
| `TABLE-03` | Doble toque al enviar pedido → una sola comanda | Integración + E2E | P0-04 |
| `TABLE-04` | Falla una línea → nada parcial | Inyección de fallos | P0-04 |
| `TABLE-05` | Solicitar cuenta con lectura temporal vacía → revalida, sin bloqueo falso | Integración | conservar delta |
| `TABLE-06` | Cobrar mesa: orden, pago, caja, inventario, comandas y mesa consistentes | E2E | P0-03 |
| `KDS-01` | Productos de dos estaciones → dos comandas sin duplicar | Integración | conservar |
| `KDS-02` | Transiciones válidas y monotónicas | Dominio | conservar |
| `KDS-03` | Comanda huérfana no aparece como atendible; genera alerta | Integración | conservar delta |
| `KDS-04` | Actualizaciones fuera de orden no retroceden el estado | Integración | P1-08 |
| `INV-02` | Ingrediente "SIN" no se descuenta y la cocina lo ve | Integración + E2E | Q-10 |
| `CASH-03b` | Propina mixta repartida por método cuadra exactamente | Dominio + integración | conservar |
| `PRINT-02` | Precuenta refleja consumo y no marca como pagada | E2E | conservar |
| `PRINT-03` | Corte en PDF: totales cuadran con el ledger | Reconciliación | conservar |
| `CAP-01b` | Capacidad `restaurante` desactivada: rutas, comandos y jobs bloqueados | Integración + E2E | — |
| `MULTI-01` | Ciclo completo en 3 dispositivos simultáneos, red local, sin internet | E2E | — |
| `FUSION-01` | **Un tenant retail y uno restaurante conviven; el mismo login lleva a interfaces distintas** | E2E | la fusión |

> `FUSION-01` es **la prueba que define el corte**. Si pasa, la fusión está hecha.

---

## Gate `morphiq-prs` de este corte

| Sección | Check | Severidad |
|---|---|---|
| 01 | Responsive validado en tablet y teléfono reales, sin overflow ni controles inaccesibles | BLOCKER |
| 05 | Sin polling agresivo; Realtime con revalidación | CRITICAL |
| 05 | Bundle revisado; code splitting por capacidad | CRITICAL |
| 06 | Objetivos táctiles suficientes; controles no amontonados | CRITICAL |
| 06 | El color no es el único indicador de estado en el KDS | CRITICAL |
| 06 | Texto legible a 200 % de zoom | CRITICAL |
| 11 | Idempotencia en comandos de comanda y entrega | CRITICAL |
| 11 | WebSockets/Realtime: autorización a nivel de mensaje, cierre al expirar sesión | CONDITIONAL → aplica |
| 12 | Transacciones en abrir mesa, enviar comanda y cobrar cuenta | CRITICAL |
| 17 | Estados de orden y transiciones válidas | CRITICAL |
| 19 | Alertas de invariantes: comanda huérfana, mesa con dos órdenes activas | CRITICAL |
| 22 | Elemento borrado por otro usuario, versión stale, conflicto de edición | CRITICAL |
| 22 | Sesión expirada durante una operación no pierde datos ni ejecuta con estado ambiguo | CRITICAL |
| 22 | Móvil vertical y horizontal, teclado abierto | CRITICAL |

---

## Definición de terminado

- [ ] **`FUSION-01` pasa: retail y restaurante conviven en la misma aplicación**, con el mismo login, y cada tenant ve sólo lo suyo.
- [ ] P0-04 y P0-05 cerrados **con verificación** (la prueba falla al quitar la corrección).
- [ ] P1-08 cerrado: cero polling agresivo, `version` monotónica funcionando.
- [ ] Las 17 pruebas del corte pasan, con las de concurrencia **realmente en paralelo**.
- [ ] Ciclo completo probado en tres dispositivos a la vez, en red local, **sin internet**.
- [ ] Ningún archivo supera 300 líneas — incluidas las pantallas que reemplazan a `Caja.jsx` y `Mesero.jsx`.
- [ ] El tenant de demostración de restaurante permite hacer las escenas 2, 3, 4 y 6 del guion.
- [ ] Cero BLOCKERS de `morphiq-prs`.
- [ ] **Miguel hace la demo de restaurante completa y la sostiene.**
