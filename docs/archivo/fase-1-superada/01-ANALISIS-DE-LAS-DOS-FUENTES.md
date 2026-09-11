# 01 — Análisis de las dos fuentes

Todo lo de este documento está **confirmado por evidencia**: inventario del ZIP con 288 entradas, esquemas recuperados por conector, inventario de acoplamiento por archivo, y exploración directa del repositorio de tiendita por la API de GitHub.

---

## 1. Resumen comparativo

|                        | **Fuente A — POS Restaurante**           | **Fuente B — POS Tiendita**                                                             |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Origen                 | ZIP histórico, 19-may-2026               | Repo `M1gu3hb/POS-MH-Tiendita`, vivo                                                    |
| Stack                  | Vite + React 18 SPA, JSX                 | Next.js 14 App Router, TS + JSX mezclado                                                |
| Backend                | **Base44 SDK**                           | **Supabase** (Postgres, Auth, Storage, Realtime)                                        |
| Datos                  | 25 entidades `.jsonc`                    | 29 tablas Postgres con migraciones                                                      |
| Multi-tenant           | **No existe**                            | Sí, `negocio_id` + RLS                                                                  |
| Archivos `src/`        | 244                                      | ~180                                                                                    |
| Acceso a datos         | **359 llamadas directas en 68 archivos** | Capa de repositorios en `src/lib/db/` (22 archivos)                                     |
| Transacciones          | Ninguna                                  | RPC correcta que el camino caliente **no usa**                                          |
| Pruebas                | Ninguna                                  | Ninguna                                                                                 |
| CI                     | Ninguna                                  | Ninguna                                                                                 |
| Tipos                  | 1,592 diagnósticos                       | `strict: true`, pero páginas y componentes en `.jsx` fuera del type-check               |
| Lint                   | 36 errores                               | Limpio                                                                                  |
| Documentación          | README generado                          | **`/docs` con ARCHITECTURE, DATABASE, DECISIONS, BUGS_PENDING, FILE_MAP + 39 reportes** |
| shadcn/ui              | 49 primitivas                            | 49 primitivas                                                                           |
| Clientes en producción | Confeti (adaptación)                     | Ferretería + una tienda                                                                 |

---

## 2. Fuente A — POS Restaurante, en detalle

### 2.1 Las páginas (17 rutas)

| Archivo                   |    Tamaño | Ruta             | Complejidad de porteo                                                     |
| ------------------------- | --------: | ---------------- | ------------------------------------------------------------------------- |
| `pages/Caja.jsx`          | **81 KB** | `/caja`          | **Extrema.** Cobro, cortes, propinas, ajustes, impresión, inventario      |
| `pages/Mesero.jsx`        | **65 KB** | `/mesero`        | **Extrema.** Mesas, carrito, envío, precuenta, modificadores, exclusiones |
| `pages/PortalCliente.jsx` |     41 KB | `/qr/:token`     | Alta. Es la frontera pública                                              |
| `pages/Configuracion.jsx` |     39 KB | `/configuracion` | Alta, pero divisible en pestañas                                          |
| `pages/POS.jsx`           |     27 KB | `/pos`           | Media. Es la venta de mostrador                                           |
| `pages/Registros.jsx`     |     23 KB | `/registros`     | Media                                                                     |
| `pages/Dashboard.jsx`     |     22 KB | `/`              | Media                                                                     |
| `pages/Cocina.jsx`        |     21 KB | `/cocina`        | Alta. KDS con estados y sonidos                                           |
| `pages/Productos.jsx`     |     17 KB | `/productos`     | Media                                                                     |
| `pages/Inventario.jsx`    |     17 KB | `/inventario`    | Media                                                                     |
| `pages/Ventas.jsx`        |     15 KB | `/ventas`        | Baja                                                                      |
| `pages/POSLogin.jsx`      |     14 KB | `/login-pos`     | **Se descarta.** Se reescribe (P0-01)                                     |
| `pages/CorteCaja.jsx`     |     11 KB | `/corte-caja`    | Legado, redirige a Caja                                                   |
| `pages/Recetas.jsx`       |     10 KB | `/recetas`       | Media                                                                     |
| `pages/Compras.jsx`       |      8 KB | `/compras`       | Baja                                                                      |
| `pages/Barra.jsx`         |      5 KB | —                | **Se descarta.** Sin ruta activa                                          |
| `pages/Mesas.jsx`         |    0.4 KB | `/mesas`         | **Se descarta.** Redirect legado                                          |

**Total de páginas a portar: 13.** Tres se descartan y una se reescribe desde cero.

### 2.2 Los componentes de dominio (~110 archivos, 15 carpetas)

```
components/
  cocina/     8 archivos   CocinaPedidoCardPremium(17K) · CocinaKanbanCard · CocinaStationMiniCard
                           CocinaMesaGroupCard · CocinaProductoDialog · CocinaVozControl
                           CocinaNuevoPedidoWatcher · CocinaPedidoCardCompact
  mesero/    14 archivos   MesaActivaView(13K) · ListosParaRecogerCard(13K) · CantidadVariableDialog
                           MeseroCartFAB · SeleccionModificadoresDialog · AlertasMeseroDialog
                           ProductoFichaExpandible · MesaGridMobile · SolicitudesQRPanel
                           SolicitudesQRCardList · AbrirMesaDialog · PreCuentaInlineView
                           MesaHuerfanaDialog · PrecioProductoMesero
  portalqr/  13 archivos   PedirCuentaQR(30K) · ProductoQRDialog(19K) · CarritoQR · MenuQRTab
                           ConfiguracionQRTab · SolicitudesQRTab · MesasQRTab · QRMesaDialog
                           AbrirMesaQRDialog · ValoracionEmoji · AtencionFAB · QRCanvas
                           ProductoPlaceholder
  configuracion/ 11        UsuarioPOSDialog(22K) · EstacionesPreparacionSection(20K)
                           CategoriasProductoSection(17K) · IdentidadNegocio(15K)
                           ModoPresentacion · ReiniciarSistemaSection · ColoresSistemaSection
                           ProveedoresSection · IntegracionesRespaldos · UnidadesMedidaSection
                           EstacionesAyuda
  common/    21 archivos   MobileAdminRadialMenu(14K) · Sidebar · AppLayout · RestrictedRoute
                           ImageUploader · ErrorBoundary · SafeBoundary · BrandedBackground
                           BrandColorsApplier · LoginBrandColors · ThemeToggle · StatusBadge
                           StatCard · PageHeader · NumericInput · ConfirmDialog · EmptyState
                           LoadingState · SoundUnlockButton · SolicitudesQRWatcher
                           PedidoListoWatcher · NotificationsWatcher
  productos/  7 archivos   TipoVentaSection(16K) · ModificadoresEditor(15K) · FichaResumenVariable
                           ProductoDesglose · ProductoSimpleDialog · ModificadoresDialog
                           CategoriaSelect
  compras/    5 archivos   RegistrarCompraDialog(31K) · RepetirCompraDialog(16K)
                           PlantillasGastoSection · PlantillaGastoDialog · RegistrarGastoDialog
  inventario/ 4 archivos   RegistrarInventarioInicialDialog(26K) · AjustarStockDialog(20K)
                           IngredienteContenedorDialog · StockMinCritInput
  datos/      5 archivos   ImportarDatosDialog(20K) · ExportarDatos · PlantillasDescargables
                           ImportarDatos · DatosSection
  propinas/   4 archivos   PropinasRegistros · LiquidarPropinasDialog · PropinaDialog
                           PropinasDashboardSection
  mesas/      4 archivos   MesaEditDialog · MesaShape · MesaMapEditor · MesaListMobile
  registros/  5 archivos   MovimientosPanel · PeriodoPDF · ResumenPeriodo
                           ExportarSeccionButton · LimpiarSeccionButton
  tickets/    3 archivos   CorteTicket(23K) · PreCuentaTicket · TicketViewerDialog
  cortes/     3 archivos   CorteViewerDialog · CorteAutoDownloader · CorteHistorialList
  recetas/    3 archivos   RecetaFormDialog(20K) · RecetaAccordionRow · IngredienteAutocomplete
  dashboard/  3 archivos   FinancialChart · PrimerosPasosCard · ColoredStatCard
  pos/        3 archivos   ProductCard · PaymentModal · CartPanel
  ui/        49 archivos   shadcn/ui — MISMO SET que tiendita
```

### 2.3 El hallazgo más importante: la lógica de negocio ya está aislada

El inventario de acoplamiento lista los archivos con referencias a Base44. **Cruzando esa lista contra `src/utils/`, resulta que 16 de 21 archivos tienen CERO referencias:**

| Archivo                       | Tamaño | Qué contiene                                             | Base44 |
| ----------------------------- | -----: | -------------------------------------------------------- | :----: |
| `tipoVentaUtils.js`           | 9.9 KB | Precio fijo, variable por medida, porción por contenedor | **0**  |
| `unidadesMedida.js`           | 6.6 KB | Catálogo y normalización de unidades                     | **0**  |
| `importValidators.js`         |  17 KB | Validación de importaciones CSV                          | **0**  |
| `preparacionEstacionUtils.js` | 6.1 KB | Ruteo de items a estaciones de cocina                    | **0**  |
| `inventarioValidation.js`     | 6.7 KB | Reglas de validación de inventario                       | **0**  |
| `tipsUtils.js`                | 6.8 KB | Cálculo y reparto de propinas                            | **0**  |
| `csvParser.js`                | 3.9 KB | Parseo de CSV                                            | **0**  |
| `ventaTotales.js`             | 2.7 KB | Cálculo de totales de venta                              | **0**  |
| `inventoryUtils.js`           | 2.6 KB | Descuento de inventario                                  | **0**  |
| `ingredienteMatcher.js`       | 2.4 KB | Emparejamiento de ingredientes                           | **0**  |
| `financialUtils.js`           | 1.9 KB | Utilidad, margen, costo                                  | **0**  |
| `unitConversions.js`          | 1.7 KB | Conversión g/kg/ml/l                                     | **0**  |
| `qrUtils.js`                  | 1.5 KB | Tokens QR                                                | **0**  |
| `estacionUtils.js`            | 1.5 KB | Utilidades de estación                                   | **0**  |
| `productoMatcher.js`          | 1.4 KB | Emparejamiento de productos                              | **0**  |
| `index.ts`                    | 0.1 KB | Barrel                                                   | **0**  |
| `importExecutors.js`          |  15 KB | Ejecución de importaciones                               |   19   |
| `qrPedidoFlow.js`             |  20 KB | Flujo de pedido QR                                       |   18   |
| `entregaPedidos.js`           | 6.8 KB | Entrega de pedidos                                       |   8    |
| `categoriaUtils.js`           | 3.8 KB | Utilidades de categoría                                  |   5    |
| `mesasPendientesCierre.js`    | 1.2 KB | Mesas pendientes                                         |   3    |

**Consecuencia práctica:** ~72 KB de reglas de negocio del restaurante —las que costaron meses de descubrimiento— se pueden **levantar casi directamente** a `packages/domain/`, tipar y probar. No hay que reinventarlas ni redescubrirlas.

Los cinco archivos acoplados se reescriben, y son precisamente los que contienen los defectos P0 (el flujo QR y la entrega).

En `src/lib/` hay más material portable: `packageConfig.js` (9.3 KB, los paquetes comerciales), `darkPalettes.js` (9.5 KB), `brandColors.js` (4.6 KB), `constants.js` (5.3 KB), `moneyColors.js`, `exportColumns.js`. Solo `AuthContext`, `ConfigContext`, `POSAuthContext`, `app-params.js`, `ensureDefaultAdmin.js` y `useCajaAbierta.js` están acoplados — y los seis se descartan por defectuosos.

### 2.4 Lo que se descarta de la Fuente A, sin discusión

| Qué                                                              | Por qué                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/api/base44Client.js`                                        | Es el SDK. Se erradica                                      |
| `src/lib/app-params.js`                                          | Parámetros de la plataforma                                 |
| `src/lib/POSAuthContext.jsx`                                     | Guarda el usuario completo en `sessionStorage` (P0-01)      |
| `src/lib/AuthContext.jsx`                                        | Auth de Base44                                              |
| `src/lib/ensureDefaultAdmin.js`                                  | Crea admin con credencial fija en el bundle (SEC-CREDS-003) |
| `src/lib/permissions.js`                                         | Filtra navegación; no autoriza (P0-02)                      |
| `src/components/common/RestrictedRoute.jsx`                      | Valida paquete comercial, no rol (P0-02)                    |
| `src/pages/POSLogin.jsx`                                         | Compara credencial en el navegador (P0-01)                  |
| `src/pages/Barra.jsx` · `Mesas.jsx` · `CorteCaja.jsx`            | Legado sin ruta o redirects                                 |
| `src/components/common/NotificationsWatcher.jsx`                 | Retorna `null`, vacío                                       |
| `base44/` completo                                               | 25 esquemas + 5 funciones. Evidencia histórica              |
| `src/components/portalqr/QRMesaDialog.jsx` (el `document.write`) | XSS confirmado (SEC-XSS-006). Se reescribe el render        |

---

## 3. Fuente B — POS Tiendita, en detalle

### 3.1 Estructura real (importante: `app/` está en la RAÍZ)

```
pos-mh-tiendita/
├── app/                          ← App Router en la raíz, NO en src/
│   ├── (auth)/login · register
│   ├── (dashboard)/  page · venta(62KB) · registros(38KB) · configuracion(18KB)
│   │                 fiado(17KB·.tsx) · inventario(17KB) · cuenta(13KB) · caja(13KB)
│   │                 escaner(12KB) · productos(9KB) · egresos(9KB) · suscripcion(4KB)
│   ├── suscripcion/  activar · success · cancel        (públicas)
│   ├── vista-cliente/                                   (pública)
│   └── api/          ventas · ventas/cancelar · devoluciones · negocio/register
│                     storage/upload · stripe/{checkout,portal,refresh,status,webhook}
├── src/                          ← solo components, hooks, lib, utils
│   ├── components/  barcode · caja · common · configuracion · cuenta · dashboard
│   │                egresos · inventario · layout · onboarding · productos
│   │                providers · registros · venta · ui(49)
│   ├── hooks/       20 archivos
│   ├── lib/         auth/ · db/(22) · hardware/ · offline/ · stripe/ · utils.js
│   └── utils/       10 archivos
├── supabase/migrations/  18 archivos (001–019, falta 012)
└── docs/            ARCHITECTURE · DATABASE · DECISIONS · BUGS_PENDING · FILE_MAP
                     CHANGELOG · DEPLOYMENT · NEXT_STEPS · reports/(39)
```

**El alias `@/*` apunta a `./src/*`.** Cualquier fusión que asuma `src/app/` rompe todos los imports.

### 3.2 Lo que se conserva de la Fuente B — es la cimentación

| Qué                                    | Por qué se conserva                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Capa de repositorios `src/lib/db/`** | 22 archivos `.ts`, patrón uniforme, ningún componente toca Supabase directo. Es exactamente la arquitectura acordada |
| **Separación de clientes Supabase**    | `supabase.ts` (navegador) vs `supabase-server.ts` (`server-only`, con `createAdminClient`)                           |
| **RLS multi-tenant**                   | `negocio_id` en las 29 tablas, `get_negocio_id()` como `SECURITY DEFINER`                                            |
| **Alta de tenant atómica**             | RPC `registrar_negocio` + rollback compensatorio del auth user. Patrón correcto ya demostrado                        |
| **`audit_log`**                        | Sin políticas de INSERT → solo escribible por servidor. Bien hecho                                                   |
| **Sesión de servidor**                 | Cookies vía `@supabase/ssr`, `middleware.ts` con `getUser()` (no `getSession()`)                                     |
| **`crear_venta_completa`**             | La RPC transaccional. Se porta la lógica a la API TypeScript (A-21), pero el diseño es correcto                      |
| **Escáner de tres vías**               | Cámara ZXing + físico keyboard-wedge + remoto por teléfono con Realtime. Difícil, resuelto, probado en la calle      |
| **Báscula Web Serial**                 | `src/lib/hardware/bascula.ts`                                                                                        |
| **Offline con IndexedDB**              | Se conserva el código aunque A-26 lo deje inactivo por ahora                                                         |
| **`/docs`**                            | Es el mejor activo documental de los dos proyectos                                                                   |
| **49 primitivas shadcn/ui**            | Mismo set que el restaurante                                                                                         |

### 3.3 Lo que se corrige de la Fuente B

Ver `06-DEFECTOS-Y-ERRADICACION.md` para el detalle y la prueba de cada uno. En resumen:

1. El cobro online no usa la RPC atómica — son 6+ llamadas sueltas desde el navegador.
2. Totales, precios y snapshots de costo se calculan en el cliente y se insertan verbatim.
3. `ajustarStock` sobrescribe el saldo (read-then-write) y **no filtra por `negocio_id`**.
4. `Math.max(0, …)` silencia la sobreventa en vez de fallar.
5. El carrito se cierra al final → un fallo intermedio hace que el cajero reintente y duplique la venta.
6. Folio con timestamp + 3 dígitos aleatorios → colisión con `unique(negocio_id, folio)`.
7. Permisos: solo dos políticas por rol en toda la base. Un cajero puede cerrar caja, cambiar precios y editar configuración.
8. **No existe alta de empleados.** Hay que crearlos a mano en Supabase.
9. El gate de suscripción está desactivado en código (`ensureAccess = () => true`).
10. El sync offline mapea todo pago como efectivo → descuadra el arqueo.
11. `handleCobroFiado` re-lee productos sin acumulador → dos renglones del mismo producto se pisan.
12. Tres sistemas de toast conviviendo (`sonner` activo, `react-hot-toast`, Radix toast).

---

## 4. El terreno común — por qué la fusión es viable

### 4.1 Coinciden en lo que importa

| Concepto                           | Fuente A                             | Fuente B                                |
| ---------------------------------- | ------------------------------------ | --------------------------------------- |
| Producto                           | `ProductoTerminado`                  | `productos`                             |
| Categoría                          | `CategoriaProducto`                  | `categorias_producto`                   |
| Venta                              | `Venta`                              | `ventas`                                |
| Línea de venta                     | `DetalleVenta`                       | `detalle_ventas`                        |
| Sesión de caja                     | `CorteCaja`                          | `cortes_caja`                           |
| Movimiento de stock                | `MovimientoInventario`               | `movimientos_inventario`                |
| Gasto                              | `GastoOperativo`                     | `gastos_operativos`                     |
| Proveedor                          | `Proveedor`                          | `proveedores`                           |
| Compra                             | `CompraInsumo` + `DetalleCompra`     | `compras_mercancia` + `detalle_compras` |
| Configuración                      | `ConfiguracionNegocio` (~100 campos) | `configuracion_negocio`                 |
| Snapshots de costo/utilidad/margen | Sí, en `Venta`                       | Sí, en `ventas`                         |

**Once conceptos idénticos.** Ambos sistemas llegaron por separado a la misma forma del negocio. Eso no es coincidencia: es la forma real de un punto de venta mexicano.

### 4.2 Divergen en exactamente dos ejes

| Eje                            | Fuente A (restaurante)               | Fuente B (tiendita)                     |
| ------------------------------ | ------------------------------------ | --------------------------------------- |
| **Cómo se llena el carrito**   | Mesa abierta → comanda → estación    | Escaneo de código de barras             |
| **Qué se descuenta al cobrar** | Ingredientes, vía `RecetaEscandallo` | El mismo SKU (`productos.stock_actual`) |

Todo lo demás —catálogo, pagos, caja, costos, clientes, reportes, auditoría— es compartido.

**Esa es la justificación empírica del modelo `ordenes` con estrategias** (decisión A-02). No es una abstracción inventada: es la descripción de la única diferencia real entre dos sistemas construidos por separado.

### 4.3 Lo que cada uno tiene y el otro no

**Solo en tiendita:** código de barras y escáner (3 vías) · stock por SKU · compras con conversión caja→pieza · mayoreo · venta por peso con báscula · fiado con límite de crédito · conteo de inventario · historial de precios por trigger · devoluciones · combos · vista cliente en segundo monitor · escáner remoto por teléfono · Stripe · offline.

**Solo en restaurante:** mesas y zonas con editor de mapa · mesero móvil · comandas y KDS · estaciones de preparación · modificadores y exclusiones "SIN" · recetas y escandallos · propinas por método con liquidación · precuenta · ajuste auditable de cuenta · portal QR del comensal con valoración · productos variables por medida y por porción · importación/exportación CSV completa · paquetes comerciales · paletas de color y temas de marca · alertas por voz.

**Ninguno de los dos tiene:** permisos reales · alta de empleados · pruebas · CI · multisucursal · variantes de producto · lotes y caducidad · citas · comisiones.
