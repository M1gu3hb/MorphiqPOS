# F1-02 · Plan de resurrección — Fase 1

Fecha: 9 de septiembre de 2026
**Sustituye por completo a `docs/fase-1/` anterior, que está archivado en `docs/archivo/`.**

---

## 1. Qué es la Fase 1

> **Revivir el POS de restaurante de Miguel, completo y funcionando, sobre el backend nuevo, más el escáner de la tiendita.**

Al terminar, Miguel abre `pos-mh-astral-systems.com`, entra con su PIN, y ve **su sistema**: su diseño, sus pantallas, sus rutas, sus funciones. La única diferencia visible es que hay un escáner en Esencial y Operativo, y que los extras de producto ahora pueden costar dinero.

Todo lo que cambió por debajo —transacciones, PIN en servidor, ledger de stock, idempotencia— **él no lo debe notar.**

**No es Fase 1:** citas, e-commerce, multisucursal, franquicias, IA. Eso es Fase 2.

---

## 2. Las cuatro decisiones que gobiernan el plan

| # | Decisión | Consecuencia |
|---|---|---|
| **1** | **El frontend del restaurante manda visualmente al 100 %** | Sus rutas (`/pos`, `/mesero`, `/cocina`, `/caja`…), su `index.css`, su `AppLayout`, su `Sidebar`, sus componentes. **Se copian, no se reinventan** |
| **2** | **El backend nuevo manda arquitectónicamente, y es invisible** | Se adapta a lo que su frontend espera mediante una capa de traducción. Ver §3 |
| **3** | **Sus tres paquetes:** `esencial`, `operativo`, `restaurante_pro` | Se usa su `packageConfig.js` tal cual. **Se elimina el selector de cinco giros** que se había inventado |
| **4** | **De la tiendita sólo entra el escáner**, en Esencial y Operativo | Sus pantallas se descartan |

---

## 3. La pieza clave: el puente de compatibilidad

Su frontend hace 359 llamadas a `base44.entities.X.list/filter/get/create/update/delete`. Reescribir las 359 es lento y arriesgado.

**En vez de eso se construye un puente**, y esta es la decisión técnica más importante del plan:

```
Su componente                          Backend nuevo
─────────────                          ─────────────
api.entidades.Venta.filter({...})  →   POST /api/datos/consultar
                                       ↓ traduce Venta → ordenes
                                       ↓ aplica ámbito de la sesión
                                       ↓ lista blanca de campos
                                       ↓ límite de paginación
                                       ← traduce ordenes → Venta

api.comandos.cobrarVenta({...})    →   POST /api/venta/cobrar
                                       ↓ comando transaccional
```

### Lecturas — puente genérico
Un solo endpoint `POST /api/datos/consultar` que recibe `{entidad, filtro, orden, limite}` y devuelve filas **con la forma que espera su frontend**.

Obligatorio:
- **Ámbito de la sesión, siempre.** Nunca acepta `organizacion_id` del cliente.
- **Lista blanca de entidades legibles** por rol.
- **Lista blanca de campos.** Cierra la fuga D-14: `ConfiguracionNegocio` pública sólo devuelve los ~20 campos que el portal necesita, nunca `presentacion_password` ni los IDs de Google.
- **Límite máximo de filas** por consulta. Nada de `list(10000)`.

### Escrituras — comandos, no puente
Las 14 operaciones transaccionales de `F1-01` §6 **no pasan por el puente**. Cada una es un comando con su transacción, y sus llamadas en el frontend sí se reescriben. **Son ~15 sitios, no 359.**

Las escrituras simples de catálogo (crear producto, editar categoría) también son comandos, pero delgados.

### La tabla de traducción
Un solo archivo, `packages/app/src/puente/mapa.ts`, con el mapeo entidad por entidad y campo por campo:

```
Venta              → ordenes
DetalleVenta       → orden_lineas
Mesa               → mesas
PedidoPreparacion  → comandas + comanda_items
UsuarioPOS         → personas + identidades + empleos
ConfiguracionNegocio → configuracion
Ingrediente        → insumos
ProductoTerminado  → productos
CorteCaja          → sesiones_caja
…
```

**Cada entidad lleva una prueba de ida y vuelta:** se construye un objeto con la forma vieja, se traduce, se guarda, se lee, se traduce de vuelta, y debe ser idéntico. Sin esa prueba, un campo mal mapeado rompe una pantalla en silencio.

### Por qué así y no renombrando las tablas
Renombrar `ordenes` a `ventas` obligaría a reescribir el backend ya hecho y mataría el modelo genérico que la Fase 2 necesita para citas y e-commerce. El puente cuesta un archivo y sus pruebas.

---

## 4. Cómo se portan 244 archivos sin atorarse

### La carpeta `heredado/`
Su código va a `apps/web/heredado/` con **su propio `tsconfig.json` permisivo** (`allowJs: true`, `strict: false`). El núcleo (`packages/*`) sigue estricto.

**Esto resuelve una contradicción real:** la regla vigente dice cero `any` y `allowJs: false`. Tipar 244 archivos perfectamente antes de que nada funcione es lo que haría que la sesión se atore. Se portan, funcionan, y se endurecen después.

### El procedimiento por archivo
1. Copiar el `.jsx` a `heredado/`, conservando su ruta relativa.
2. Cambiar **sólo** las llamadas a datos: `base44.entities.X` → `api.entidades.X`. Mismo nombre, misma firma.
3. **No tocar** el CSS, el layout, los textos, los colores, ni el comportamiento.
4. Si el archivo escribe algo transaccional, cambiar esa llamada al comando correspondiente.
5. Abrir la pantalla y compararla contra la original. **Si no se ve igual, no está terminada.**

### El límite de 300 líneas
Aplica al **código nuevo**. Para archivos portados: se parte extrayendo componentes, **sin cambiar una clase CSS ni un texto**, y se verifica abriendo las dos versiones al lado. `Caja.jsx` (≈2000 líneas) y `Mesero.jsx` (≈1600) son las dos únicas que lo necesitan de verdad.

---

## 5. Las etapas

Once etapas. Cada una deja algo que Miguel puede abrir y ver.

---

### E0 · Preparación · 5 tareas

| # | Tarea | Aceptación |
|---|---|---|
| E0-1 | Archivar el plan viejo: mover `docs/fase-1/` a `docs/archivo/fase-1-superada/` con un `LEEME.md` que explique que está superado | La carpeta existe y `docs/fase-1/` sólo tiene los documentos nuevos |
| E0-2 | Mergear `carril-b` a `main`. **Rama completa, jamás cherry-pick** — el arnés de inventario busca una línea que sólo existe en la versión arreglada de `stock.ts` | `pnpm verify` en verde tras el merge |
| E0-3 | `.env` con `DATABASE_URL` (Session pooler de Supabase, proyecto `wyqmzhliurwyxuyxznpb`). Sacarla con Supabase CLI. **Si el CLI falla, copia el `.env` del worktree `morphiqpos-codex`: ahí funcionó y aplicó tres migraciones.** Después `pnpm db:tipos` | `esquema.ts` incluye `recetas`; `pnpm db:migrate` es no-op |
| E0-4 | Borrar **sólo las páginas** nuevas de `apps/web/app/(gestion)` y `(operacion)`, el enrolamiento de terminal y el selector de cinco giros. **Las rutas de `app/api/**` NO se borran: sirven y se reusan.** Los `packages/*` tampoco | Quedan las 33 rutas de API y cero páginas inventadas |
| E0-5 | Arreglar `pnpm db:seed`, que hoy delega en un script inexistente | El comando corre |

---

### E1 · Que se vea suyo · 5 tareas

**El objetivo de esta etapa es que Miguel abra la URL y reconozca su sistema, aunque no funcione nada todavía.**

| # | Tarea | Aceptación |
|---|---|---|
| E1-1 | Traer `historico/restaurante/src/index.css` (24 KB) como hoja principal de la aplicación. Sus variables, sus paletas, sus animaciones, sus estilos de impresión | La app cambia de aspecto por completo |
| E1-2 | Traer `AppLayout`, `Sidebar`, `MobileAdminRadialMenu`, `PageHeader`, `ThemeContext`, `BrandedBackground`, `BrandColorsApplier` | La navegación es la suya |
| E1-3 | Traer `brandColors.js`, `darkPalettes.js`, `constants.js`, `moneyColors.js`. La marca se deriva de dos colores, como él lo hizo | Cambiar el color primario repinta la aplicación |
| E1-4 | Traer las 49 primitivas de `components/ui/` del restaurante y las de `common/` (StatCard, StatusBadge, EmptyState, LoadingState, ConfirmDialog, NumericInput, ErrorBoundary, SafeBoundary) | Se ven como las suyas |
| E1-5 | Portar `Dashboard.jsx` + `PrimerosPasosCard`, `ColoredStatCard`, `FinancialChart` **con estados vacíos**. Su `PrimerosPasosCard` está diseñada justo para cuando no hay datos | Al entrar, la aplicación **no está vacía**: se ve su tablero con sus primeros pasos |

> El sistema de tokens de los días anteriores **deja de ser el aspecto principal**. Se queda sólo donde ya está y no se aplica a las pantallas portadas.

---

### E2 · Que entre como antes · 3 tareas

| # | Tarea | Aceptación |
|---|---|---|
| E2-1 | Portar `POSLogin.jsx`: tarjetas de usuario con nombre y color, teclado de PIN de 4 dígitos | Se ve idéntico al suyo |
| E2-2 | Cablearlo al backend: `GET /api/auth/usuarios` devuelve `[{id, nombre, rol, color}]` **sin PIN**; `POST /api/auth/pin` valida con Argon2id en servidor, con límite de intentos | Entra con PIN y llega a su ruta inicial por rol |
| E2-3 | Script `pnpm db:bootstrap` que crea el primer administrador con PIN. **Es un script, no un comando** — rompe el bucle de "para crear un PIN necesitas sesión" | Tras correrlo, `select count(*) from credenciales_pin` > 0 |

> **Se elimina el enrolamiento de terminal.** Miguel nunca lo pidió y es una puerta de más.

---

### E3 · El puente · 6 tareas

| # | Tarea | Aceptación |
|---|---|---|
| E3-1 | Migraciones de las tablas que faltan: `zonas`, `mesas`, `estaciones_preparacion`, `comandas`, `comanda_items`, `solicitudes_qr`, `menu_qr_secciones`, `liquidaciones_propina`, `proveedores`, `compras`, `compra_lineas`, `gastos`, `plantillas_gasto`, `plantillas_compra`, `orden_ajustes`, `orden_linea_exclusiones` | Las 25 entidades del restaurante tienen destino |
| E3-2 | Las restricciones de `F1-01` §6: únicas, únicas parciales, y únicas sin acentos ni mayúsculas | Intentar dos ventas activas en la misma mesa lo rechaza la base |
| E3-3 | `packages/app/src/puente/mapa.ts` con la traducción entidad por entidad | Existe y está documentado |
| E3-4 | `POST /api/datos/consultar` con ámbito de sesión, listas blancas de entidad y campo, y límite de filas | Un usuario de otra organización no ve nada |
| E3-5 | `api.entidades.X` en el cliente: misma firma que `base44.entities.X`, seis operaciones | Un componente portado funciona cambiando sólo el import |
| E3-6 | Prueba de ida y vuelta **por cada una de las 25 entidades** | 25 pruebas en verde |

---

### E4 · Catálogo y operación diaria · 8 tareas

Se portan las pantallas más simples primero, para validar el puente con poco riesgo.

| # | Pantalla | Comandos que necesita |
|---|---|---|
| E4-1 | `Productos.jsx` + sus 7 componentes (`TipoVentaSection`, `ModificadoresEditor`, `ProductoDesglose`, `FichaResumenVariable`…) | crear, actualizar, precio, archivar |
| E4-2 | `Inventario.jsx` + `AjustarStockDialog`, `RegistrarInventarioInicialDialog`, `StockMinCritInput`, `IngredienteContenedorDialog` | `ajustarInventario`, `inventarioInicial` — transaccionales |
| E4-3 | `Recetas.jsx` + `RecetaFormDialog`, `RecetaAccordionRow`, `IngredienteAutocomplete` | `guardarReceta` transaccional **con rollback** (corrige D-11) |
| E4-4 | **Recalcular el costo en cascada**: al cambiar el costo de un insumo, recalcular costo, utilidad y margen de todos los productos que lo usan (corrige D-09) | comando dedicado |
| E4-5 | `Compras.jsx` + `RegistrarCompraDialog`, `RepetirCompraDialog`, `PlantillasGastoSection`, `RegistrarGastoDialog`, `PlantillaGastoDialog` | `registrarCompra` transaccional con costo promedio ponderado en servidor (corrige D-12) |
| E4-6 | `ProveedoresSection`, `CategoriasProductoSection`, `UnidadesMedidaSection` | comandos simples |
| E4-7 | **Unificar el signo de los movimientos de stock**: negativo salidas, positivo entradas (corrige D-10) | migración de datos + comando |
| E4-8 | Importación y exportación CSV: `ImportarDatosDialog`, `ExportarDatos`, `PlantillasDescargables`, con `importValidators` y `csvParser` levantados tal cual. **Dry-run obligatorio** | Una importación con errores no aplica nada |

---

### E5 · Venta de mostrador · 4 tareas

| # | Tarea |
|---|---|
| E5-1 | Portar `POS.jsx` + `components/pos/` (`ProductCard`, `CartPanel`, `PaymentModal`) |
| E5-2 | Cablear el cobro al comando `cobrarVenta` **transaccional**, que ya existe. Elimina D-07 y los 7 `catch` vacíos de `POS.jsx` |
| E5-3 | Portar `Ventas.jsx` (historial) y `components/tickets/` (`TicketViewerDialog`, `PreCuentaTicket`, `CorteTicket`) |
| E5-4 | Portar el `printDocument` de `lib/print.js`. Cero `document.write` |

---

### E6 · Restaurante · 9 tareas

El corazón. Aquí vuelve lo que Miguel más quiere ver.

| # | Tarea |
|---|---|
| E6-1 | `components/mesas/` completo: `MesaMapEditor`, `MesaShape`, `MesaEditDialog`, `MesaListMobile`. Zonas, formas, posiciones, capacidad |
| E6-2 | Comando `abrirMesa` transaccional con índice único parcial (corrige D-16 y las mesas huérfanas) |
| E6-3 | Portar `Mesero.jsx` (≈1600 líneas) partido en módulos, **sin cambiar aspecto**, + sus 14 componentes |
| E6-4 | Comando `enviarPedido` transaccional e idempotente. **Elimina los detalles shadow** (corrige D-05). Si una línea falla, falla todo |
| E6-5 | Portar `Cocina.jsx` + sus 8 componentes, con sonidos y alertas de voz (`sounds.jsx`, `voiceAlert.js` — 16 KB de trabajo suyo) |
| E6-6 | Comandos `transicionarPedido` y `entregarPedidos`, con versión monotónica contra respuestas fuera de orden |
| E6-7 | Propinas: `components/propinas/` completo + comando `liquidarPropinas`. **Respeta las reglas 1 a 4 de `F1-01` §3** |
| E6-8 | Precuenta y solicitud de cuenta: comando `solicitarCuenta` + `PreCuentaInlineView` |
| E6-9 | Portar `Caja.jsx` (≈2000 líneas) partido en módulos + `components/caja/` y `components/cortes/`. Comandos `abrirCaja`, `corteTurno`, `cierreDiario` |

---

### E7 · Portal QR · 4 tareas

| # | Tarea |
|---|---|
| E7-1 | Endpoint público `GET /api/publico/qr/:token` con **payload combinado y filtrado**. Cierra la fuga D-14 |
| E7-2 | Portar `PortalCliente.jsx` + sus 13 componentes (`CarritoQR`, `ProductoQRDialog`, `PedirCuentaQR`, `ValoracionEmoji`, `AtencionFAB`…) |
| E7-3 | Comandos públicos idempotentes con límite de peticiones: solicitud, abrir mesa, pedido, cuenta, valoración. **Precio recalculado en servidor** (corrige D-17) |
| E7-4 | Portar `PortalQR.jsx` (administración) + `MesasQRTab`, `MenuQRTab`, `ConfiguracionQRTab`, `SolicitudesQRTab`, `QRMesaDialog` **sin `document.write`** (corrige D-18) |

---

### E8 · Registros, cortes y reportes · 3 tareas

| # | Tarea |
|---|---|
| E8-1 | Portar `Registros.jsx` + `MovimientosPanel`, `ResumenPeriodo`, `PeriodoPDF`, `ExportarSeccionButton`, `LimpiarSeccionButton` |
| E8-2 | Consultas agregadas en servidor: `/api/registros/resumen`, `/api/cortes/:id/reporte`, `/api/ventas/buscar`. Sustituyen las descargas de miles de filas |
| E8-3 | Portar `Dashboard.jsx` + `FinancialChart`, `PrimerosPasosCard`, `ColoredStatCard` |

---

### E9 · Lo nuevo · 4 tareas

| # | Tarea |
|---|---|
| E9-1 | **Escáner de código de barras** de la tiendita: cámara ZXing, lector físico, dedupe 1200 ms, audio, flujo "código no encontrado". **Sólo en Esencial y Operativo** |
| E9-2 | Campo `codigo_barras` **opcional** en productos, con búsqueda indexada |
| E9-3 | **Extras y aditivos con precio**: los modificadores pasan de informativos a poder costar dinero o agregar porciones. En el editor de producto, en Mesero y en el portal QR |
| E9-4 | El cálculo del extra entra en el total, el costo y el margen, en servidor |

---

### E10 · Configuración y paquetes · 4 tareas

| # | Tarea |
|---|---|
| E10-1 | Portar `Configuracion.jsx` completa con sus 11 secciones: identidad, colores, usuarios, estaciones, mesas, unidades, categorías, proveedores, paquetes, integraciones, datos |
| E10-2 | **Sus tres paquetes** con `packageConfig.js` tal cual: Esencial, Operativo, Restaurante Pro. Verificados **en el servidor**, no ocultando rutas (corrige D-02) |
| E10-3 | Portar `ModoPresentacion` con la contraseña **comparada en servidor** contra un hash (corrige D-19) |
| E10-4 | Reimplementar las 5 funciones de mantenimiento **autorizando por la sesión, nunca por el body** (corrige D-03 y D-04, los dos defectos más graves) |

---

### E11 · Endurecimiento y despliegue · 6 tareas

| # | Tarea |
|---|---|
| E11-1 | Tiempo real: los cinco canales que sustituyen los nueve intervalos de polling |
| E11-2 | Datos de demostración de **restaurante**: menú creíble con fotos, recetas con costo, mesas por zonas, estaciones, empleados de los tres roles, historial de dos semanas |
| E11-3 | Proyecto en Vercel `morphiqpos`, conectado al repositorio, con `DATABASE_URL` del Session pooler |
| E11-4 | Dominio `pos-mh-astral-systems.com`: agregarlo en Vercel. Si el último paso exige acceso al registrador de Miguel, **anota los registros DNS exactos en el reporte y CONTINÚA** — no te detengas ahí |
| E11-5 | E2E con Playwright: entrar → abrir mesa → pedir → cocina → entregar → cobrar → cerrar caja |
| E11-6 | Gate `morphiq-prs` completo y acta de sign-off honesta |

---

## 6. Resumen

| Etapa | Tareas | Qué desbloquea |
|---|---|---|
| E0 Preparación | 5 | Repositorio limpio y conectado |
| E1 Que se vea suyo | 5 | **Miguel reconoce su sistema** |
| E2 Que entre como antes | 3 | **Puede entrar** |
| E3 El puente | 6 | Sus pantallas pueden leer datos reales |
| E4 Catálogo y operación | 8 | Productos, inventario, recetas, compras |
| E5 Venta de mostrador | 4 | **Se puede vender** |
| E6 Restaurante | 9 | **Mesas, mesero, cocina, caja** |
| E7 Portal QR | 4 | El comensal pide desde su teléfono |
| E8 Registros y reportes | 3 | Cortes y análisis |
| E9 Lo nuevo | 4 | Escáner y extras con precio |
| E10 Configuración | 4 | Los tres paquetes |
| E11 Endurecimiento | 6 | **En línea en su dominio** |
| **Total** | **61** | |

---

## 7. Reglas de esta fase

**Cambian respecto a todo lo anterior:**

| Antes | Ahora |
|---|---|
| **`REGLAS.md` R30** — *"el ZIP es evidencia, no plantilla; se lee al lado, no se copian archivos"* | **DEROGADA.** `historico/restaurante/` **SE COPIA**. Es la fuente del frontend y ese era el error de fondo de los tres días anteriores |
| Cero `any`, `allowJs: false` en todo | El núcleo sigue estricto; **`heredado/` tiene su propio `tsconfig` permisivo** |
| Ningún archivo sobre 300 líneas | Aplica al código nuevo. Los portados se parten **sin cambiar aspecto** |
| Tokens y cuatro estilos como aspecto principal | **Su `index.css` manda** |
| Cinco giros de negocio | **Sus tres paquetes** |
| Enrolamiento de terminal | **Eliminado.** Su login de tarjetas + PIN |
| `TEAM.md` y zonas por carril | **Suspendido.** Un solo desarrollador, dueño de todo |

**Siguen vigentes y no se negocian:**

- Precios y totales **siempre** en el servidor. El endpoint no acepta importes del cliente.
- Cobro, caja, stock, mesa y pedido: **transaccionales e idempotentes**.
- El PIN **nunca** sale de la base.
- Autorización **en el servidor**, por sesión. Nunca por un campo del body.
- Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
- Dinero en `bigint` de centavos.
- Ningún error crítico se silencia. Los 24 `catch(() => {})` de Caja, POS y Mesero desaparecen.
- **Nada se declara terminado sin haberlo ejecutado y abierto en el navegador.**
- **No se toca `Pasteleria Confetti`** (`ivqcxdpqxwjxfohiswqb`).

---

## 8. Trampas técnicas del porteo

Estas son las siete cosas que van a frenar el porteo si nadie las resuelve por adelantado. Cada una tiene su salida.

### T1 · `verify:residuos` va a fallar en cuanto se copie el primer archivo
El escaneo de residuos busca `base44` fuera de `historico/`. Su código está **lleno** de esas referencias: 359 llamadas en 68 archivos.

**Salida:** `heredado/` **sí** entra al escaneo — es código de producto. Por eso el porteo se hace **en lotes pequeños**, y cada lote deja el escaneo en verde: se copia el archivo y se le quitan las referencias **en el mismo commit**. Nunca se copian 244 archivos y luego se arreglan.

### T2 · Su código usa React Router; la aplicación nueva es Next.js
`App.jsx` monta `<Routes>`, y sus páginas usan `useNavigate`, `useParams`, `useLocation` y `<Link>` de `react-router-dom`. Nada de eso existe en el App Router.

**Salida:** crear `heredado/enrutado.ts` que reexporta los equivalentes de Next (`useRouter`, `useParams`, `usePathname`, `Link`) **con los nombres de React Router**. Así sus componentes no cambian una línea:

```ts
// heredado/enrutado.ts
export { useParams, usePathname as useLocation } from 'next/navigation';
export function useNavigate() { const r = useRouter(); return (a) => r.push(a); }
export { default as Link } from 'next/link';
```

Su `App.jsx` **no se porta**: sus rutas se convierten en carpetas de `app/`, respetando las mismas URLs (`/pos`, `/mesero`, `/cocina`, `/caja`, `/inventario`, `/recetas`, `/compras`, `/productos`, `/ventas`, `/registros`, `/portal-qr`, `/configuracion`, `/qr/[token]`).

### T3 · El alias `@/` tiene que resolver a `heredado/`
Todos sus archivos importan `@/components/ui/button`, `@/lib/utils`, `@/api/base44Client`.

**Salida:** un alias `@/*` → `apps/web/heredado/*` en el `tsconfig` de `heredado/`. Y `@/api/base44Client` se sustituye por `heredado/api/cliente.ts`, que exporta `api.entidades` con la misma firma.

### T4 · Tres entidades suyas no tienen tabla propia
`DescuentoInventarioVenta` (lo lee `Inventario.jsx` para "consumido hoy"), `IntegrationSyncLog` (lo lee `IntegracionesRespaldos`) y `User` (de la plataforma).

**Salida:** el puente las resuelve sin tabla nueva. `DescuentoInventarioVenta` es una **vista** sobre `movimientos_stock` filtrada por `referencia_tipo = 'orden'`. `IntegrationSyncLog` es una tabla simple. `User` desaparece: su rol lo da `empleos`.

### T5 · El envoltorio `comando()` exige clave de idempotencia y su frontend no la manda
Todo comando con `escribe: true` rechaza sin una clave de al menos 8 caracteres.

**Salida:** `api.comandos.*` genera la clave en el cliente y **la conserva mientras el diálogo esté abierto**, para que un doble clic reuse la misma. Es lo que ya hace la pantalla de venta nueva; se replica en el puente.

### T6 · El resolvedor de sesión exige terminal enrolada, y el enrolamiento se elimina
Si se quita el enrolamiento sin tocar el resolvedor, **nadie puede entrar**.

**Salida:** el ámbito sale del **empleo**, no de la terminal. `terminal_id` pasa a ser opcional y se llena con un identificador de dispositivo generado en el primer acceso, sin código ni pantalla. Es un dato de auditoría, no una puerta.

### T7 · Sus dependencias no son las del proyecto nuevo
Su código importa `sonner` o `react-hot-toast`, `date-fns` o `moment`, `qrcode`, `html2canvas`, `jspdf`, `recharts`, `@zxing/*`.

**Salida:** se instala **lo que su código importa de verdad**, no lo que el proyecto nuevo eligió. Si su ticket usa `react-hot-toast`, se instala. Las dependencias muertas de su `package.json` (`three`, `react-leaflet`, `react-quill`, `@stripe/*`) **no se instalan**.

---

## 9. Cómo se sabe que una pantalla está terminada

Tres condiciones, las tres obligatorias:

1. **Se abre en el navegador** con datos reales de la base.
2. **Se ve igual que la original.** Se compara abriendo la del ZIP al lado.
3. **Sus escrituras pasan por comandos transaccionales**, no por llamadas sueltas.

Si falla cualquiera, la pantalla no está terminada, aunque compile y aunque las pruebas pasen.
