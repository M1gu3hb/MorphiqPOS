# 18 — Reparto de la Fase 1 en dos carriles

Fecha: 8 de septiembre de 2026
Decisión **A-45**: dos agentes en paralelo, 50/50, carriles independientes.

---

## 1. Estado real al momento del reparto

Verificado directamente contra Supabase y el repositorio, no contra reportes.

|                                        |                                                           |
| -------------------------------------- | --------------------------------------------------------- |
| Tablas vivas en `wyqmzhliurwyxuyxznpb` | **26**, todas con RLS activo, **0 filas**                 |
| Migraciones aplicadas                  | 6, con ledger `_migraciones`                              |
| Tipos generados del esquema            | Sí, 336 columnas                                          |
| Pantallas de punto de venta            | **0**                                                     |
| Comandos                               | **0**                                                     |
| Tareas de F1.1 terminadas              | **4 de 21** (T00–T03)                                     |
| Bloqueo activo                         | **Falta `DATABASE_URL` en `.env`** — la app no se conecta |

**Fase 1 completa: ~8 %.**

Lo hecho es la cimentación de datos: esquema, restricciones, llaves foráneas compuestas y tipos. Es real y es necesario, y es invisible. Todo lo que sigue se ve.

---

## 2. Por qué dos carriles y no una tarea partida

El objetivo es **duplicar velocidad, no repartir una misma tarea**. Cada agente construye un área completa —dominio, datos, comandos y pantallas— de punta a punta. Nadie espera al otro salvo en dos puntos, y los dos están resueltos publicando el contrato temprano.

El corte se hace por **área de negocio**, no por capa. Partir por capas (uno el backend, otro el frontend) obliga a bloqueo constante.

---

## 3. Carril A — Venta, dinero y restaurante · **Claude Code**

Es la **columna transaccional**: todo lo que mueve dinero, y el restaurante completo, que comparte esa misma columna.

### Lo que construye

**Del corte F1.1**

| #    | Qué                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | **`comando()`** — validación zod, rol, paquete, transacción, idempotencia, auditoría, correlation id, errores tipados. **Primera tarea, se publica de inmediato: carril B depende de esto** |
| A-02 | Enrolamiento de terminal con código de un solo uso y expiración                                                                                                                             |
| A-03 | Autenticación por PIN con Argon2id y pimienta, límite de intentos, bloqueo progresivo, sesión `HttpOnly`                                                                                    |
| A-04 | Acceso del dueño por correo con Supabase Auth                                                                                                                                               |
| A-05 | Folios atómicos con `UPDATE … RETURNING` dentro de la transacción                                                                                                                           |
| A-06 | La orden como carrito: `crearOrden` en `borrador`, agregar, quitar, cambiar cantidad                                                                                                        |
| A-07 | `cotizarOrden` — **precio, impuesto y totales calculados en servidor**. Levanta `ventaTotales.js` y `financialUtils.js` del histórico                                                       |
| A-08 | Sesión de caja: abrir, movimientos, cerrar con arqueo y diferencia                                                                                                                          |
| A-09 | **`cobrarOrden`** — una sola transacción: orden + líneas + pagos + movimiento de caja + movimientos de stock + folio + auditoría. Pago mixto = varias filas en `pagos`                      |
| A-10 | Pantalla de venta `(operacion)/venta` — catálogo, búsqueda, carrito, cobro, cambio. **Operable sólo con teclado**                                                                           |
| A-11 | Pantalla de caja `(operacion)/caja` — apertura, movimientos, cierre, corte                                                                                                                  |
| A-12 | Ticket y corte en PDF, render seguro sin `document.write`                                                                                                                                   |
| A-13 | Escáner de código de barras: cámara ZXing + físico keyboard-wedge, dedupe 1200 ms, audio, flujo "código no encontrado"                                                                      |
| A-14 | E2E **`DIA-01`**: abrir caja → 10 ventas → cobrar en tres métodos → tickets → cerrar cuadrando                                                                                              |

**Del corte F1.2 — restaurante completo**

| #    | Qué                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| A-15 | Migraciones de `zonas`, `mesas`, `estaciones_preparacion`, `comandas`, `comanda_items`, `orden_ajustes`, `liquidaciones_propina` |
| A-16 | Mapa de mesas con zonas, formas, posiciones y capacidad                                                                          |
| A-17 | `abrirMesa` transaccional con índice parcial único: **una sola orden activa por mesa**                                           |
| A-18 | `enviarComanda` atómico e idempotente, agrupado por estación. **Sin líneas "shadow"**                                            |
| A-19 | Pantalla de mesero `(operacion)/mesero` — densidad cómoda, tablet                                                                |
| A-20 | Cocina/KDS `(operacion)/cocina` — estilo industrial, tiempo real, `version` monotónica                                           |
| A-21 | Entrega, propinas por método, liquidación, precuenta, ajuste auditable de cuenta                                                 |
| A-22 | E2E: ciclo completo en tres dispositivos                                                                                         |

**≈ 40–48 jornadas**

---

## 4. Carril B — Catálogo, inventario, gestión y público · **Codex**

Es **todo lo que se administra y todo lo que ve el público**.

### Lo que construye

**Del corte F1.1**

| #    | Qué                                                                                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | Dominio de catálogo: los cuatro tipos de venta. Levanta `tipoVentaUtils.js`, `unidadesMedida.js`, `unitConversions.js` del histórico. **Es dominio puro: no depende de `comando()`, empieza de inmediato** |
| B-02 | **`packages/domain/inventario/consumo.ts`** — cálculo de consumo por estrategia. **Carril A depende de esto: se publica pronto**                                                                           |
| B-03 | **`packages/data/repos/stock.ts`** — ledger inmutable + `existencias` con decremento atómico. Falla en vez de silenciar; nada de `Math.max(0, …)`                                                          |
| B-04 | Comandos de catálogo: crear, actualizar, precio, código de barras, archivar. Modificadores normalizados                                                                                                    |
| B-05 | Configuración por organización y **el selector de paquete**: Tienda · Ferretería · Farmacia · Cafetería · Restaurante. **Verificado en servidor** → `403 PAQUETE_NO_INCLUYE`                               |
| B-06 | Pantalla de productos `(gestion)/productos` — alta, edición, búsqueda difusa, imagen, precios, mayoreo                                                                                                     |
| B-07 | Pantalla de configuración `(gestion)/configuracion` con el selector de paquete y la identidad visual                                                                                                       |
| B-08 | Pantalla de inicio `(gestion)/inicio` — venta del día, caja abierta, últimas ventas, bajo mínimo                                                                                                           |
| B-09 | Semillas de demostración **creíbles**: abarrotes, ferretería y cafetería. Nombres, precios y categorías reales. `resetearDemo`                                                                             |
| B-10 | Despliegue en Vercel: **un solo proyecto**, variables por entorno, Deployment Protection en previews                                                                                                       |

**Del corte F1.3 — operación completa**

| #    | Qué                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B-11 | Migraciones de `recetas`, `compras`, `compra_lineas`, `proveedores`, `gastos`, `movimientos_credito`, `devoluciones`, `conteos_inventario` |
| B-12 | Recetas y escandallos con costo, utilidad y margen recalculados. Historial de precios por trigger                                          |
| B-13 | Consumo por receta y **exclusiones "SIN" que sí descuentan** — cierra el "PASO B" que quedó pendiente en el restaurante                    |
| B-14 | Compras y recepción transaccional con conversión caja→pieza                                                                                |
| B-15 | Gastos operativos y plantillas, ligados a la sesión de caja                                                                                |
| B-16 | Fiado con límite de crédito, cargos y abonos. Consumo agrupado por producto con acumulador                                                 |
| B-17 | Devoluciones transaccionales con retorno opcional a inventario                                                                             |
| B-18 | Ajustes, mermas y conteos de inventario con diferencias auditadas                                                                          |
| B-19 | Importación y exportación CSV con **dry-run obligatorio** y plantillas                                                                     |
| B-20 | Reportes por periodo y reconciliación contra el ledger                                                                                     |

**Del corte F1.4 — público**

| #    | Qué                                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| B-21 | Frontera pública separada: token con alcance y caducidad, rate limit, catálogo público mínimo, **precio recalculado en servidor** |
| B-22 | Portal QR del comensal: menú, carrito, pedido idempotente, solicitud de cuenta y ayuda, valoración                                |
| B-23 | Administración del portal QR: tokens por mesa, generar e imprimir QR, menú, solicitudes                                           |
| B-24 | Panel del dueño en el teléfono                                                                                                    |

**≈ 40–48 jornadas**

---

## 5. Lo que queda fuera de los dos carriles

**F1.5 — endurecimiento** (permisos configurables, registry completo, auditoría exhaustiva, multi-sucursal, auditoría PRS completa y Acta de Sign-Off): se reparte cuando los dos carriles terminen. ~12–16 jornadas.

---

## 6. Las dos dependencias cruzadas y su protocolo

| Dependencia               | Quién entrega        | Quién consume       | Protocolo si no está listo                                                                                                                            |
| ------------------------- | -------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comando()`               | **A**, primera tarea | B                   | B trabaja en dominio puro (B-01) mientras tanto                                                                                                       |
| `consumo.ts` + `stock.ts` | **B**, tareas 2–3    | A, en `cobrarOrden` | A escribe la firma en `contracts`, pone un doble marcado `// STUB — carril B`, sigue, y lo anota en su reporte. **No escribe la implementación real** |

---

## 7. Verificación del reparto

| Criterio              | A        | B        |
| --------------------- | -------- | -------- |
| Jornadas              | 40–48    | 40–48    |
| Tablas propias        | 20       | 23       |
| Rutas propias         | 7 grupos | 6 grupos |
| Rango de migraciones  | 010–039  | 040–069  |
| Pantallas             | 5        | 8        |
| Comandos              | ~22      | ~26      |
| Dependencias del otro | 1        | 1        |

**Reparto equilibrado.** Ninguno depende del otro más de una vez, y las dos dependencias se entregan en las primeras tareas.
