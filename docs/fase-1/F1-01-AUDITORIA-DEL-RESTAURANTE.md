# F1-01 · Auditoría del POS de restaurante

Fecha: 9 de septiembre de 2026
Fuente auditada: `historico/restaurante/` — 244 archivos en `src/`, 25 entidades, 5 funciones backend.

> **Este documento y `F1-02` sustituyen TODO el plan anterior.** Lo viejo está archivado en `docs/archivo/`. No se consulta salvo para historia.

---

## 1. Qué es este sistema, en una frase

Un punto de venta de restaurante que Miguel construyó en cuatro meses, **operable de muchísimas maneras**: con mesero o sin él, con mesas o de mostrador, con propina o sin ella, con pedido desde el teléfono del comensal o sólo desde caja, con productos de precio fijo, por peso o por porción de contenedor.

Su valor no es el código: es que **todas esas variantes están resueltas y probadas en la calle**. Eso es lo que se rescata.

---

## 2. La decisión que ordena todo el plan

| | Manda | Por qué |
|---|---|---|
| **Visualmente** | **El restaurante, 100 %** | Su CSS, su layout, sus rutas, sus componentes. Miguel debe reconocer su sistema al abrirlo |
| **Arquitectónicamente** | **El backend nuevo** | Transacciones reales, PIN en servidor, ledger de stock. Miguel **no debe notarlo** |
| **Funciones** | **Todas las del restaurante** + el escáner de la tiendita | El escáner sólo en paquetes Esencial y Operativo |

**De la tiendita se conserva únicamente el escáner de código de barras.** Todo lo demás que tiene ya lo tiene el restaurante, y mejor.

---

## 3. Lo que NO se puede romper

Doce reglas de negocio verificadas en el código. Romper cualquiera es romper el sistema, aunque compile.

1. **`Venta.total` es la venta real SIN propina.** Nunca inflarlo. `total_cobrado_con_propina` es campo aparte. Toda la contabilidad, cortes y reportes dependen de esa separación.
2. **Las propinas no entran en ventas, utilidad, costos, inventario, recetas ni margen.** Declarado en cuatro archivos distintos.
3. **El desglose de propinas por método es EXACTO, nunca proporcional.** Hay una función dedicada (`desgloseMetodosPagoExacto`) con fallback documentado para ventas antiguas.
4. **`efectivo_esperado` del cierre = ventas en efectivo + propinas en efectivo.** No sólo ventas.
5. **El inventario se descuenta SÓLO al cobrar.** Nunca al enviar a cocina ni al pedir desde el QR. Declarado explícitamente en `qrPedidoFlow.js` y `entregaPedidos.js`.
6. **Un producto de precio fijo sin receta NO bloquea el cobro.** Comportamiento histórico deliberado.
7. **Las unidades base son sólo `g`, `ml` y `pieza`.** No se amplían. Los nueve valores de `DEFAULT_UNIDADES_COMPRA` se re-fusionan aunque el admin los borre.
8. **Todo catálogo usa borrado suave**, porque los registros históricos guardan snapshots del nombre.
9. **Cocina nunca ve costos, márgenes ni gramajes.** Sólo nombres de ingredientes. Está impuesto en `CocinaProductoDialog` y `ProductoFichaExpandible`.
10. **La estación "Cocina general" (`es_general: true`) es el fallback obligatorio** y no se puede desactivar.
11. **Los 26 campos de snapshot en `DetalleVenta` son el contrato de trazabilidad.** Un ticket de hace seis meses debe seguir imprimiéndose aunque el producto haya cambiado de precio o desaparecido.
12. **Los modificadores son informativos en la versión del ZIP** — no afectan precio ni inventario. **Esto cambia a propósito**: ver §7.

---

## 4. Las cicatrices que hay que respetar

El frontend está lleno de defensas que parecen paranoia y son memoria de bugs reales de producción:

- `ventaTotales.js` rescata totales en cero antes de la precuenta.
- `ListosParaRecogerCard` tiene un latch anti-parpadeo.
- `detectarHuerfano` usa **cuatro reglas** para evitar falsos positivos.
- La validación de inventario en Caja reintenta y cae a caché.
- La bandera `ventaQuedoPagada` evita cobros dobles visuales.
- Los guardas `if (!cfg?.id) return` protegen las hidrataciones.
- Listas blancas de campos por pestaña en Configuración.
- `SafeBoundary` alrededor del ticket.

**El backend nuevo debe hacer estas defensas innecesarias, no borrarlas a ciegas.** Se quitan cuando la causa que las originó ya no puede ocurrir, y sólo entonces.

---

## 5. Los defectos, verificados uno por uno

La auditoría anterior listaba defectos. Los revisé leyendo el código. **Confirmados todos, y encontré cinco más que no estaban.**

### Rompen el negocio — se corrigen sin discusión

| # | Defecto | Dónde | Nota |
|---|---|---|---|
| **D-01** | El PIN se descarga al navegador y se compara ahí | `POSLogin.jsx` | Ya resuelto en el backend nuevo: `credenciales_pin` con Argon2id |
| **D-02** | No hay autorización por rol; `RestrictedRoute` valida paquete comercial, no permisos | `RestrictedRoute.jsx`, `permissions.js` | El backend nuevo verifica rol en cada comando |
| **D-03** | **Las 5 funciones backend autorizan con un string del body del cliente.** Cualquier usuario autenticado puede mandar `{"rol":"administrador"}` y **borrar el tenant completo** | `base44/functions/*/entry.ts` | **El más grave de todos.** No estaba en la auditoría anterior |
| **D-04** | `limpiarHistorialSeccion` comprueba *"¿existe algún administrador?"* en vez de *"¿es admin el que llama?"* — siempre da `true` | idem | Tampoco estaba reportado |
| **D-05** | Detalles "shadow": si falla `DetalleVenta.create`, Mesero conserva el objeto en memoria y lo usa para el total | `Mesero.jsx:495-562` | La cuenta muestra productos que no existen en la base |
| **D-06** | Stock leer-calcular-escribir; dos cajas concurrentes se pisan | transversal | Ya resuelto: ledger con decremento atómico |

### Corrompen datos en silencio

| # | Defecto | Dónde |
|---|---|---|
| **D-07** | Cobro no transaccional: la venta se marca pagada y **después** se procesan recetas, stock y movimientos | `Caja.jsx:398-884` |
| **D-08** | **24 `catch(() => {})` en Caja, POS y Mesero** que se tragan fallos financieros y de inventario. (Hay 116 en total; los otros 92 son degradación legítima de sonido, voz y localStorage) | `Caja.jsx` 11 · `POS.jsx` 7 · `Mesero.jsx` 6 |
| **D-09** | **`costo_calculado_actual` no se recalcula al cambiar el costo de un ingrediente.** Una compra que sube el precio del café **no** actualiza el costo del capuchino → márgenes obsoletos en toda la app | transversal |
| **D-10** | **Signo inconsistente en `MovimientoInventario.cantidad`:** POS precio fijo guarda positivo, POS variable y Caja guardan negativo. Cualquier reporte que sume da un resultado sin sentido | `POS.jsx` vs `Caja.jsx:749` |
| **D-11** | `RecetaFormDialog` borra las líneas anteriores antes de crear las nuevas, **sin rollback** | `RecetaFormDialog.jsx` |
| **D-12** | `RegistrarCompraDialog` sin rollback: si falla una línea, quedan la cabecera y las anteriores | `RegistrarCompraDialog.jsx` |
| **D-13** | `ejecutarImportInventario` sobrescribe `costo_por_unidad_base` sin ponderar, a diferencia de compras | `importExecutors.js` |

### Fuga de datos

| # | Defecto | Dónde |
|---|---|---|
| **D-14** | **`PortalCliente` hace `ConfiguracionNegocio.list()` completa** y expone a cualquiera que escanee un QR: `presentacion_password`, todos los IDs de Google, `paquete_modo` y `mostrar_costos_a_caja` | `PortalCliente.jsx` |

### Feo pero funciona — se corrige si sale barato

| # | Defecto | Decisión |
|---|---|---|
| **D-15** | Config múltiple con `list()[0]` | **Corregir.** Restricción única por organización, ya existe en el backend nuevo |
| **D-16** | Mesas huérfanas | **Corregir por construcción.** Índice único parcial de orden activa por mesa |
| **D-17** | Carreras en el flujo QR | **Corregir.** Comando idempotente |
| **D-18** | `document.write` en `QRMesaDialog` + interpolación de HTML sin escapar | **Corregir.** Usar el mismo `printDocument` del resto del sistema |
| **D-19** | `presentacion_password` en texto plano, comparada en el cliente, sin bloqueo | **Corregir.** Endpoint que compare hash |
| **D-20** | `generateFolio` sin unicidad garantizada (4 caracteres aleatorios) | **Corregir.** Secuencia atómica, ya existe |
| **D-21** | `access_token` en `localStorage` | Desaparece con Base44 |

### Cosméticos — **NO se corrigen ahora**

`MesaStatusBadge` lee una propiedad que no existe · el menú radial móvil omite `/portal-qr` · faltan títulos en dos rutas · `SucursalContext` es un stub muerto · dos query keys distintas para estaciones · `CorteAutoDownloader` no pasa el flag de paquete · dependencias muertas (`three`, `react-leaflet`, `react-quill`, `@stripe/*`, `moment` junto a `date-fns`, tres sistemas de toast).

**Se anotan y se dejan.** Arreglarlos ahora consume sesión y no cambia nada que Miguel vea. Excepción: las dependencias muertas no se portan, simplemente no se instalan.

---

## 6. Qué necesita el frontend del backend

Su frontend habla con `base44.entities.<Entidad>.<op>`. Seis operaciones, 25 entidades:

| Operación | Uso real | Semántica |
|---|---|---|
| `list(sort?, limit?)` | `list('-created_date', 500)` | Prefijo `-` = descendente |
| `filter(where, sort?, limit?)` | `filter({activo: true})` | Igualdad exacta, AND entre claves |
| `get(id)` | `get(ventaId)` | Objeto o lanza |
| `create(data)` | — | **Debe devolver el registro con `id`** |
| `update(id, patch)` | — | Merge parcial. **Debe devolver el actualizado** |
| `delete(id)` | — | Borrado físico |

Campos automáticos que el frontend lee: `id`, `created_date`, `updated_date`. `Configuracion.jsx` depende de `updated_date` para re-hidratar formularios.

### Las 14 operaciones que DEBEN ser transaccionales

Estas reemplazan los flujos que hoy son múltiples llamadas desde el navegador:

`cobrarVenta` · `enviarPedido` · `abrirMesa` · `solicitarCuenta` · `entregarPedidos` · `abrirCaja` · `cierreDiario` · `corteTurno` · `registrarCompra` · `ajustarInventario` · `inventarioInicial` · `liquidarPropinas` · `guardarReceta` · `resetearSistema`

### Las consultas agregadas que hoy descargan miles de filas al navegador

| Hoy | Debe ser |
|---|---|
| `Venta.list('-created_date', 5000)` para buscar un folio | `GET /ventas/buscar?q=` |
| `Venta.list(2000)` + `DetalleVenta.filter` por venta para armar un corte | `GET /cortes/:id/reporte` |
| `RecetaEscandallo.list(2000)` + `Ingrediente.list(1000)` **dos veces por cobro** | Resuelto dentro de `cobrarVenta` |
| `Venta.list(1000)` + 5 listas más en Registros | `GET /registros/resumen?desde&hasta` |

### El polling: nueve intervalos simultáneos

De 1.5 s a 30 s, castigando al backend: `ListosParaRecogerCard` 1.5 s · Cocina 2 s · Caja 2 s · PortalCliente 2.5/3/4 s · Mesero 5/6 s · watchers 6/8 s · Cocina lento 10-30 s.

**Se sustituyen por cinco canales de tiempo real**: `pedidos:estacion:<id>` · `mesas` · `ventas:pendientes-caja` · `solicitudes-qr` · `mesa:<token>` (público).

### Restricciones que la base debe imponer

**Únicas:** `Venta.folio` · `CorteCaja.folio` · `Mesa.numero` · `Mesa.qr_token`
**Únicas parciales:** una sola venta activa por mesa · una sola caja abierta · **una sola configuración por organización** · una sola estación general
**Únicas sin acentos ni mayúsculas:** `Ingrediente.nombre` · `CategoriaProducto.nombre` · `EstacionPreparacion.nombre` — para que el anti-duplicado deje de vivir en el cliente

---

## 7. Lo que se AGREGA — no estaba en el ZIP

### 7.1 Extras y aditivos con precio
Miguel terminó esto en Base44 después del ZIP. Cada producto puede tener **extras que cuestan más o que agregan porciones**, elegibles por el mesero al tomar la orden **y** por el comensal desde el menú QR.

Es un cambio deliberado a la regla 12 del §3: **los modificadores dejan de ser sólo informativos.** El backend nuevo ya tiene `modificador_opciones.precio_extra_centavos`, así que la base lo soporta. Falta la interfaz y el cálculo.

### 7.2 Escáner de código de barras
De la tiendita. **Sólo en paquetes Esencial y Operativo** — en Restaurante Pro no hace falta.
Incluye: cámara (ZXing), lector físico por teclado, dedupe de 1200 ms, retroalimentación de audio, y el flujo "código no encontrado" → crear producto o asignar código a uno existente.
En productos, el código de barras es **opcional**.

---

## 8. Lo que ya está construido y sirve

Del backend de los días anteriores, esto se conserva y es exactamente la mitad que Base44 se llevó:

- Esquema con 28 tablas, restricciones reales y llaves foráneas compuestas por organización
- `comando()`: transacción, idempotencia, rol, auditoría, errores tipados
- `cobrarOrden`: ocho efectos en una transacción, precio recalculado en servidor
- Ledger de stock con decremento atómico que falla en vez de silenciar
- Dominio de dinero en `bigint` de centavos, con reparto y redondeo probados
- Dominio de catálogo con los cuatro tipos de venta
- El resolvedor de sesión y el puente HTTP
- ~78 mutaciones enganchadas a `pnpm verify`

**Lo que se tira:** las pantallas nuevas, el enrolamiento de terminal, el sistema de tokens como aspecto principal, las pantallas de la tiendita, y el selector de cinco giros.

---

## 9. Riesgos del porteo

| Riesgo | Mitigación |
|---|---|
| **Los 26 campos de snapshot de `DetalleVenta`** no cuadran con `orden_lineas` | La capa de traducción (`F1-02` §3) mapea campo por campo, con prueba de ida y vuelta por entidad |
| **El cliente calcula totales hoy**; el servidor los recalcula mañana | Si difieren, el servidor gana y devuelve el correcto con un código de error claro, nunca cobra en silencio |
| **`Caja.jsx` son ~2000 líneas** | Se parte extrayendo, **sin cambiar una sola clase CSS ni un texto**. Se compara abierto al lado del original |
| **244 archivos `.jsx` sin tipos** contra un `tsconfig` estricto | Carpeta `heredado/` con su propio `tsconfig` permisivo. El núcleo sigue estricto. Ver `F1-02` §4 |
| **El signo de los movimientos de stock** está inconsistente | Se unifica: negativo salidas, positivo entradas. Se documenta en la migración |
| **Los datos de demostración actuales son de retail** (abarrotes, ferretería, cafetería) | Se agrega un tenant de restaurante creíble con menú, recetas, mesas y estaciones |
