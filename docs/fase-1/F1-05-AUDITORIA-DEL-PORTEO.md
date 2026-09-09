# F1-05 — Auditoría del porteo

Revisión de los 237 archivos de código de `apps/web/heredado/` tras la
transformación mecánica (SDK viejo → `@/api/cliente`, `react-router-dom` →
`@/enrutado`).

**Método.** Resolución de los imports de cada archivo contra el disco y contra
`apps/web/package.json`; recorrido del AST con el parser de TypeScript para
clasificar globales de navegador, hooks, directivas y `catch` vacíos; grafo de
importación transitivo desde cada entrada de `apps/web/app/`; y verificación de
que las rutas HTTP que el puente invoca existen como *route handlers*.

**Veredicto.** El porteo mecánico está limpio: **0 imports rotos, 0 paquetes sin
declarar, 0 restos del SDK viejo, 0 archivos excluidos que alguien siga
importando**. Lo que no está es *cableado*: hay dos defectos que dejan la
aplicación entera en cero — un `window` en el cuerpo de un módulo que alcanza el
layout raíz, y el hecho de que las dos rutas HTTP contra las que habla el puente
de datos no existen. Ninguno de los dos lo puede ver `next build`.

---

## Resumen por gravedad

| # | Hallazgo | Alcance | Gravedad |
|---|---|---|---|
| B-1 | `window` en cuerpo de módulo en `lib/utils.js` | **Las 17 rutas** (vía layout raíz) | **BLOQUEANTE** |
| B-2 | `/api/datos/consultar` y `/api/datos/escribir` no existen | **358 llamadas** (todas las pantallas) | **BLOQUEANTE** |
| B-3 | `api.auth.usuarios()` y `api.auth.entrar()` no existen en el puente | Login → toda la app | **BLOQUEANTE** |
| B-4 | `/api/archivos/subir` y `/api/mantenimiento/*` no existen | 8 llamadas | **BLOQUEANTE (parcial)** |
| A-1 | 3 nombres de entidad que el puente no conoce | Compras, Inventario, Registros, Exportar | **ALTA** |
| A-2 | 18 escrituras financieras/inventario con `.catch(() => {})` | Caja, POS, Mesero | **ALTA** |
| A-3 | Lecturas críticas con `.catch(() => [])` | Caja | **ALTA** |
| A-4 | `api.comandos` declarado y jamás usado | 14 operaciones transaccionales | **ALTA** |
| M-1 | Desajuste de hidratación en 4 `useIsMobile` locales | 4 pantallas | MEDIA |
| M-2 | `components/ui/toast.jsx` reescrito sin Radix | Toasts de shadcn | MEDIA |
| M-3 | `document.body` en render de `CorteAutoDownloader` | Corte de caja | MEDIA |
| B-5 | `pages/Barra.jsx` huérfano | — | BAJA |
| B-6 | `lib/ensureDefaultAdmin.js` muerto y peligroso | — | BAJA |
| B-7 | `PageNotFound.jsx` con texto de la plataforma vieja | 404 | BAJA |
| B-8 | 3 entidades declaradas sin usar + `isIframe`/`createPageUrl` muertos | — | BAJA |

---

## 1. Imports que no resuelven

**Ninguno.** Se resolvieron todos los especificadores de los 237 archivos:

| Tipo | Cantidad | Sin resolver |
|---|---|---|
| Alias `@/…` → `apps/web/heredado/…` | — | **0** |
| Relativos `./` `../` | — | **0** |
| Paquetes externos | 49 distintos | **0** |

Los 49 paquetes externos están todos declarados en `apps/web/package.json` y
presentes en `node_modules`. No hay ningún `react-router-dom` residual en
`apps/web/`.

> El alias funciona porque `apps/web/tsconfig.json` mapea `"@/*": ["./heredado/*"]`.
> Ojo: `apps/web/heredado/tsconfig.json` declara `"@/*": ["./*"]` relativo a sí
> mismo — resuelve al mismo sitio, pero son dos definiciones que hay que mantener
> sincronizadas.

---

## 2. Referencias al SDK viejo

**Ninguna.** Búsqueda de `entities.`, `functions.invoke`, `integrations.Core`,
`auth.me` suelto, `.appId`, `appParams`, `import.meta`:

| Patrón | Ocurrencias en `heredado/` |
|---|---|
| `entities.` | 1 — sólo en el comentario de `api/cliente.ts:7` |
| `functions.invoke` | 0 |
| `integrations.Core` / `InvokeLLM` / `UploadFile` | 0 |
| `.appId` / `appParams` | 0 |
| `import.meta` | 0 |
| `base44` | 0 |

**Qué hacer:** nada. La transformación mecánica hizo su trabajo.

---

## 3. Archivos excluidos del porteo

Ninguno de los ocho es importado por ningún archivo portado. Se confirma por dos
vías: la resolución de imports no dejó ningún destino sin encontrar, y la
búsqueda por nombre no arroja ninguna sentencia `import`.

| Archivo excluido | ¿Lo importa alguien? | Sustituto en el porteo |
|---|---|---|
| `App.jsx` | No | `app/layout.tsx` + `src/proveedores/Proveedores.tsx` |
| `main.jsx` | No | `app/layout.tsx` |
| `api/base44Client.js` | No | `heredado/api/cliente.ts` |
| `lib/app-params.js` | No | — (no se usaba) |
| `lib/AuthContext.jsx` | No | ninguno necesario (ver §4) |
| `components/ProtectedRoute.jsx` | No | `middleware.ts` + cookie de sesión |
| `components/UserNotRegisteredError.jsx` | No | — |
| `lib/SucursalContext.jsx` | No | — |

**Qué hacer:** nada.

---

## 4. `useAuth` / AuthContext

**`useAuth()` tiene cero usos reales en `apps/web/heredado/`.** No hay ninguna
propiedad de contexto que reclamar.

En `historico/restaurante/src/` sólo lo usaban tres archivos, y los tres son
justamente los que se excluyeron a propósito:

| Archivo de origen | Propiedades que consumía | Estado |
|---|---|---|
| `App.jsx:35` | `isLoadingAuth`, `isLoadingPublicSettings`, `authError`, `navigateToLogin` | no portado |
| `components/ProtectedRoute.jsx:13` | `isAuthenticated`, `isLoadingAuth`, `authChecked`, `authError`, `checkUserAuth` | no portado |
| `lib/AuthContext.jsx:154` | (definición) | no portado |

Lo que sí se usa —y sí se portó— es `usePOSAuth` de `@/lib/POSAuthContext`, en
**33 archivos**. Consume siempre el mismo subconjunto:

| Propiedad | Consumidores |
|---|---|
| `posUser` | 32 archivos |
| `isLoading` | 1 (`components/common/AppLayout.jsx:16`) |
| `logout` | 1 (`components/common/Sidebar.jsx:100`) |
| `login` | 1 (`pages/POSLogin.jsx`) |

El proveedor está montado correctamente en
`apps/web/src/proveedores/Proveedores.tsx:28`, dentro de `QueryClientProvider` y
envolviendo a `ConfigProvider`. `usePOSAuth()` lanza si falta el proveedor, así
que si el montaje se rompiera se notaría de inmediato.

**Qué hacer:** nada. `lib/AuthContext.jsx` puede quedarse fuera definitivamente.

---

## 5. Lo que Next romperá en tiempo de ejecución

### 5.1 — B-1: `window` en el cuerpo de un módulo

| Archivo:línea | Código | Guardado |
|---|---|---|
| **`lib/utils.js:9`** | `export const isIframe = window.self !== window.top;` | **NO** |
| `lib/sounds.jsx:47-57` | listeners globales de audio | Sí (`typeof window !== 'undefined'`) |
| `lib/voiceAlert.js:303` | precarga de voces | Sí (`typeof window !== 'undefined'`) |

`lib/utils.js` es el módulo de `cn()`. Lo importan **44 archivos**, entre ellos
**las 48 primitivas de `components/ui/`**. Verificado empíricamente importándolo
en Node sin `window`:

```
ReferenceError: window is not defined
```

Grafo de importación transitivo desde cada entrada de `apps/web/app/`:

| Entrada | ¿Alcanza `lib/utils.js`? | Cadena |
|---|---|---|
| **`app/layout.tsx`** | **SÍ** | `layout.tsx → src/proveedores/Proveedores.tsx → components/ui/toaster.jsx → components/ui/toast.jsx → lib/utils.js` |
| `app/(interno)/*/page.tsx` (13 rutas) | SÍ | vía `pages/*.jsx → components/ui/*` |
| `app/login-pos`, `app/qr/[token]`, `app/not-found` | (no directamente) | pero **cuelgan del layout raíz** |

Como lo alcanza el **layout raíz**, no se salva ninguna ruta: las 17 devuelven
500 en la primera petición. `next build` no lo detecta porque el layout raíz hace
`await headers()` y las páginas declaran `export const dynamic = 'force-dynamic'`,
así que nunca se prerenderiza nada en build; el módulo sólo se evalúa cuando
llega una petición real.

**Qué hacer:** `isIframe` no lo consume nadie (0 referencias fuera de su propia
declaración). Borrar la línea `lib/utils.js:9`. Si algún día hiciera falta,
convertirla en función perezosa con guarda.

### 5.2 — `export default` faltante

**Ninguno.** Se cruzaron todos los `import X from '…'` locales contra los
`export default` de su destino: cero desajustes.

### 5.3 — `'use client'` faltante en archivos con hooks

**Ninguno.** Los 129 archivos que usan hooks (`useState`, `useEffect`, `useMemo`,
`useQuery`, `usePOSAuth`, …) llevan todos la directiva.

> Al revés sí hay ruido: 108 archivos llevan `'use client'` sin usar ningún hook.
> No es un error —muchos son componentes con handlers o re-exportan cliente— pero
> encarece el bundle. Limpieza opcional, no urgente.

### 5.4 — M-1: globales en cuerpo de render (desajuste de hidratación)

Cuatro copias del mismo `useIsMobile` local, todas **guardadas** (no crashean),
pero todas devuelven `false`/escritorio en el servidor y el valor real en el
cliente:

| Archivo:línea | Hook | Umbral |
|---|---|---|
| `pages/Mesero.jsx:68` | `useIsMobile` | `window.innerWidth < 768` |
| `pages/Configuracion.jsx:62` | `useIsMobile` | `window.innerWidth < 768` |
| `components/cocina/CocinaPedidoCardPremium.jsx:48` | `useIsMdUp` | `window.innerWidth >= 768` |
| `components/common/MobileAdminRadialMenu.jsx:104` | (inline) | `window.innerWidth < 1024` |

**Qué hacer:** sustituir los cuatro por el `useIsMobile` de
`hooks/use-mobile.jsx`, que ya inicializa en `undefined` y sólo mide dentro de
`useEffect` — sin desajuste. (`lib/ThemeContext.jsx:62` hace lo mismo pero está
bien resuelto: devuelve `'light'` en servidor y el guion sin parpadeo de
`tema-arranque.ts` corrige antes del primer pintado.)

### 5.5 — M-3: `document.body` en render

`components/cortes/CorteAutoDownloader.jsx:221` — `createPortal(…, document.body)`
en el cuerpo del componente. Sólo lo protege el corto-circuito `data &&`
(línea 196), y `data` viene de una query que en servidor está `undefined`. Hoy no
revienta, pero depende de que nadie hidrate esa query.

**Qué hacer:** envolver en `useEffect` con estado `montado`, o hacer el
componente `dynamic(() => …, { ssr: false })`.

---

## 6. Las 48 primitivas de `components/ui/`

**Todas las dependencias están declaradas e instaladas. No falta ninguna.**

| Primitiva | Dependencia externa | Declarada |
|---|---|---|
| accordion | `@radix-ui/react-accordion` | Sí |
| alert-dialog | `@radix-ui/react-alert-dialog` | Sí |
| aspect-ratio | `@radix-ui/react-aspect-ratio` | Sí |
| avatar | `@radix-ui/react-avatar` | Sí |
| breadcrumb, button, sidebar | `@radix-ui/react-slot` | Sí |
| checkbox | `@radix-ui/react-checkbox` | Sí |
| collapsible | `@radix-ui/react-collapsible` | Sí |
| context-menu | `@radix-ui/react-context-menu` | Sí |
| dialog, sheet | `@radix-ui/react-dialog` | Sí |
| dropdown-menu | `@radix-ui/react-dropdown-menu` | Sí |
| form | `@radix-ui/react-slot` + `react-hook-form` | Sí |
| hover-card | `@radix-ui/react-hover-card` | Sí |
| label | `@radix-ui/react-label` | Sí |
| menubar | `@radix-ui/react-menubar` | Sí |
| navigation-menu | `@radix-ui/react-navigation-menu` | Sí |
| popover | `@radix-ui/react-popover` | Sí |
| progress | `@radix-ui/react-progress` | Sí |
| radio-group | `@radix-ui/react-radio-group` | Sí |
| scroll-area | `@radix-ui/react-scroll-area` | Sí |
| select | `@radix-ui/react-select` | Sí |
| separator | `@radix-ui/react-separator` | Sí |
| slider | `@radix-ui/react-slider` | Sí |
| switch | `@radix-ui/react-switch` | Sí |
| tabs | `@radix-ui/react-tabs` | Sí |
| toggle / toggle-group | `@radix-ui/react-toggle` / `-toggle-group` | Sí |
| tooltip | `@radix-ui/react-tooltip` | Sí |
| calendar | `react-day-picker` | Sí |
| carousel | `embla-carousel-react` | Sí |
| chart | `recharts` | Sí |
| command | `cmdk` | Sí |
| drawer | `vaul` | Sí |
| input-otp | `input-otp` | Sí |
| resizable | `react-resizable-panels` | Sí |
| alert, badge, card, input, pagination, skeleton, table, textarea | — | — |
| **toast, toaster, use-toast** | **ninguna** (ver abajo) | — |

### M-2 — `toast.jsx` perdió Radix

`components/ui/toast.jsx` está reescrito con `<div>` planos: no importa
`@radix-ui/react-toast` (que además **no** está en `package.json`). Consecuencias
reales:

- `toastVariants` (`toast.jsx:25`) conserva las clases `data-[state=open]`,
  `data-[state=closed]`, `data-[swipe=…]`. Sin la máquina de estados de Radix
  esos atributos nunca se ponen: **no hay animación de entrada/salida ni
  deslizar-para-cerrar**.
- `ToastProvider` (`toast.jsx:7`) y `ToastViewport` (`toast.jsx:16`) renderizan
  el **mismo** contenedor `fixed`, y `toaster.jsx` anida uno dentro del otro: dos
  capas superpuestas.

Atenuante: **`useToast` no lo usa ningún archivo fuera de `components/ui/`.**
Toda la aplicación notifica con `sonner` (59 imports), que sí está bien montado
en `Proveedores.tsx:29`.

**Qué hacer:** borrar `toast.jsx`, `toaster.jsx` y `use-toast.jsx`, y quitar
`<Toaster />` de `Proveedores.tsx`. Es código muerto que sólo aporta una capa
`fixed` invisible sobre toda la app.

---

## 7. `catch` vacíos

Total en `heredado/`: **187** en 56 archivos, en tres formas distintas.

| Forma | Total | En Caja/POS/Mesero | Resto |
|---|---|---|---|
| `.catch(() => {})` | 46 | **23** | 23 |
| `catch { }` (bloque vacío) | 81 | 1 | 80 |
| `.catch(() => [] / null / …)` | 60 | 13 | 47 |

> Nota sobre las cifras del encargo: los «24» de Caja/POS/Mesero son en realidad
> **23** `.catch(() => {})` (5 de ellos son `refetchQueries`, no escrituras), y
> los «~92 restantes» corresponden a los 23 `.catch(() => {})` + 80 `catch {}`
> fuera de esas tres pantallas = **103**.

### A-2 — Los 23 de `pages/Caja.jsx`, `pages/POS.jsx`, `pages/Mesero.jsx`

**18 se tragan una escritura real. 5 son `refetchQueries` y se quedan.**

| Archivo:línea | Qué se traga | Consecuencia si falla | Acción |
|---|---|---|---|
| `pages/Caja.jsx:861` | `Ingrediente.update` (stock) | Stock no baja tras cobrar | **Eliminar** |
| `pages/Caja.jsx:864` | `MovimientoInventario.create` | Movimiento sin registrar | **Eliminar** |
| `pages/Caja.jsx:884` | `DescuentoInventarioVenta.create` | Descuento sin trazabilidad | **Eliminar** |
| `pages/Caja.jsx:776` | `DetalleVenta.update` (costo snapshot) | Margen de la línea falso | **Eliminar** |
| `pages/Caja.jsx:842` | `Venta.update` (costo/utilidad) | Utilidad bruta falsa | **Eliminar** |
| `pages/Caja.jsx:1211` | `Venta.update` (`corte_caja_id`) | **La venta queda fuera del corte** | **Eliminar** |
| `pages/Caja.jsx:454` | `Mesa.update` (estado `libre`) | Mesa cobrada sigue ocupada | **Eliminar** |
| `pages/Caja.jsx:915` | `Mesa.update` (estado `limpieza`) | Mesa cobrada sigue ocupada | **Eliminar** |
| `pages/POS.jsx:354` | `Ingrediente.update` (stock) | Stock no baja | **Eliminar** |
| `pages/POS.jsx:357` | `MovimientoInventario.create` | Movimiento sin registrar | **Eliminar** |
| `pages/POS.jsx:374` | `DescuentoInventarioVenta.create` | Sin trazabilidad | **Eliminar** |
| `pages/POS.jsx:405` | `Ingrediente.update` (stock, 2ª vía) | Stock no baja | **Eliminar** |
| `pages/POS.jsx:409` | `MovimientoInventario.create` (2ª vía) | Movimiento sin registrar | **Eliminar** |
| `pages/POS.jsx:426` | `DescuentoInventarioVenta.create` (2ª vía) | Sin trazabilidad | **Eliminar** |
| `pages/POS.jsx:462` | **`PedidoPreparacion.create`** | **El pedido nunca llega a cocina y nadie se entera** | **Eliminar** |
| `pages/Mesero.jsx:368` | `Mesa.update` (abrir mesa) | Mesa abierta sin dueño | **Eliminar** |
| `pages/Mesero.jsx:763` | `Mesa.update` (`pedido_enviado`) | Mesa no refleja el envío | **Eliminar** |
| `pages/Mesero.jsx:977` | `Mesa.update` (`cuenta_solicitada`) | Caja no ve la cuenta pedida | **Eliminar** |
| `pages/Caja.jsx:951` | `queryClient.refetchQueries` | Badge tarda en bajar | *Se queda* |
| `pages/Caja.jsx:1025` | `queryClient.refetchQueries` | idem | *Se queda* |
| `pages/Caja.jsx:1026` | `queryClient.refetchQueries` | idem | *Se queda* |
| `pages/Mesero.jsx:772` | `queryClient.refetchQueries` | idem | *Se queda* |
| `pages/Mesero.jsx:981` | `queryClient.refetchQueries` | idem | *Se queda* |

### A-3 — Lecturas con valor por defecto (no estaban en el encargo, pero son peores)

`.catch(() => [])` sobre una **lectura** es más traicionero que sobre una
escritura: no falla, devuelve «no hay nada» y el cálculo sigue con datos vacíos.

| Archivo:línea | Qué se traga | Consecuencia | Acción |
|---|---|---|---|
| **`pages/Caja.jsx:1160`** | `obtenerMesasPendientesCierre()` | Es la **segunda verificación anti-carrera** antes de cerrar el día. Si la lectura falla → `[]` → «no hay mesas pendientes» → **se cierra el día con mesas abiertas** | **Eliminar** |
| `pages/Caja.jsx:317` | `DetalleVenta.filter` | Ticket sin líneas → se cobra un total equivocado | **Eliminar** |
| `pages/Caja.jsx:281` | `Venta.filter` (`cuenta_solicitada`) | El cajero no encuentra la cuenta | **Eliminar** |
| `pages/Caja.jsx:286` | `Venta.list` (histórico) | Búsqueda de venta vieja vacía sin avisar | **Eliminar** |

### Los ~103 restantes: se quedan

Concentrados donde la degradación silenciosa es la conducta correcta —audio, voz,
`localStorage`, tema—:

| Archivo | `catch` vacíos | Naturaleza |
|---|---|---|
| `lib/sounds.jsx` | 8 | WebAudio bloqueado por el navegador |
| `lib/voiceAlert.js` | 6 | `speechSynthesis` no disponible |
| `lib/ThemeContext.jsx` | 5 | `localStorage` inaccesible |
| `components/common/ErrorBoundary.jsx`, `SafeBoundary.jsx` | 4 | por definición |
| `components/cocina/CocinaNuevoPedidoWatcher.jsx` | 4 | sonido/voz de aviso |
| `components/common/*Watcher.jsx` | 6 | sonido/voz de aviso |
| resto | ~70 | mezcla de sonido, `localStorage`, impresión y PDF |

**Qué hacer:** dejarlos. Merecen un comentario de una línea diciendo por qué,
pero no tocar la lógica.

---

## 8. Hallazgos que no estaban en el encargo

Aparecieron al verificar el cableado y son más graves que casi todo lo anterior.

### B-2 — El puente de datos apunta a rutas que no existen

`api/cliente.ts:110-111` define:

```ts
const RUTA_LECTURA  = '/api/datos/consultar';
const RUTA_ESCRITURA = '/api/datos/escribir';
```

Ninguna de las dos existe en `apps/web/app/api/`. Las 34 rutas reales son
específicas (`/api/venta/cobrar`, `/api/inventario/ajustar`, …); no hay ningún
`rewrite` en `next.config.mjs` ni nada en `middleware.ts` que las mapee.

**Efecto:** las **358 llamadas** `api.entidades.*` reciben el 404 HTML de Next,
`respuesta.json()` falla, y `pedir()` lanza `ErrorPuente('ERROR_INTERNO')`. No
hay una sola pantalla que cargue datos.

El comentario de `cliente.ts:150` promete que la traducción vive en
`packages/app/src/puente/mapa.ts` — ese archivo **no existe**. `packages/app/src/puente/`
sólo contiene `roles.ts` (helpers de rol) e `index.ts`.

**Qué hacer:** es el trabajo de la siguiente etapa, no un defecto del porteo.
Hay que escribir `app/api/datos/consultar/route.ts` y `app/api/datos/escribir/route.ts`
con el mapa de las 27 entidades, la lista blanca de campos por rol y el tope de
filas que `cliente.ts` documenta.

### B-3 — `api.auth` no expone lo que el login pide

| Llamada | Archivo:línea | ¿Existe en `cliente.ts`? | Ruta que ya existe |
|---|---|---|---|
| `api.auth.usuarios()` | `pages/POSLogin.jsx:41` | **NO** | `/api/auth/empleados` |
| `api.auth.entrar({id, pin})` | `pages/POSLogin.jsx:95` | **NO** | `/api/auth/entrar` |
| `api.auth.me()` | `lib/PageNotFound.jsx:14` | Sí | `/api/catalogo/sesion` |

`api/cliente.ts:225` sólo define `auth = { me }`. `api.auth.usuarios` es
`undefined` → `TypeError: api.auth.usuarios is not a function` en el primer
`useEffect` de la pantalla de login. Sin login no hay sesión, y sin sesión no
funciona nada.

Lo bueno: **las dos rutas del servidor ya están escritas**. Sólo falta el par de
métodos en el puente.

**Qué hacer:** añadir a `auth` en `api/cliente.ts`:
`usuarios()` → `GET /api/auth/empleados`, `entrar({id, pin})` → `POST /api/auth/entrar`
(y de paso `salir()` → `/api/auth/salir`, que existe y nadie llama).

### B-4 — Archivos y mantenimiento sin ruta

| Llamada | Ruta que invoca | ¿Existe? | Sitios |
|---|---|---|---|
| `api.archivos.subir` | `/api/archivos/subir` | **NO** | 4 (`ImageUploader.jsx` y compañía) |
| `api.funciones.invocar(n)` | `/api/mantenimiento/${n}` | **NO** | 4 |

Los cuatro `invocar`: `ReiniciarSistemaSection.jsx:109` (`reiniciarSistema`),
`LimpiarSeccionButton.jsx:58` (`limpiarHistorialSeccion`),
`pages/Configuracion.jsx:350` (`eliminarMesasDemo`), `pages/Ventas.jsx:93`
(`limpiarVentas`). Existe `/api/catalogo/demostracion/resetear`, que cubre
parcialmente el tercero.

*Detalle menor:* `pages/Configuracion.jsx:350` manda `{ rol: posUser?.rol }` en
el cuerpo. `cliente.ts:175` dice explícitamente que el `rol` del cuerpo se
ignora (defecto D-03). Quitarlo para que no parezca que hace algo.

### A-1 — Tres nombres de entidad que el puente no conoce

`NOMBRES` en `api/cliente.ts:130` lista 27 entidades. El código llama a tres que
no están, así que `api.entidades.X` es `undefined` → `TypeError` al tocar
`.list`/`.filter`/`.create`.

| Nombre usado | Archivo:línea | Nombre correcto en `NOMBRES` |
|---|---|---|
| `CompraInsumo` | `components/compras/RegistrarCompraDialog.jsx:253`<br>`components/compras/RepetirCompraDialog.jsx:61`<br>`components/datos/ExportarDatos.jsx:111`<br>`pages/Compras.jsx:32`<br>`pages/Registros.jsx:117` | `Compra` |
| `DetalleCompra` | `components/compras/RegistrarCompraDialog.jsx:339`<br>`components/compras/RepetirCompraDialog.jsx:86`<br>`components/compras/RepetirCompraDialog.jsx:108` | `CompraLinea` |
| `CategoriaIngrediente` | `pages/Inventario.jsx:119` | **no existe equivalente** |

**Qué hacer:** renombrar las 8 primeras a `Compra`/`CompraLinea`. Para
`CategoriaIngrediente` hay que decidir: o se añade a `NOMBRES` con su tabla, o se
borra la query de `Inventario.jsx:119` (hoy revienta la pantalla de Inventario al
montar).

### A-4 — `api.comandos` está declarado y no lo usa nadie

`api/cliente.ts:240` expone `comandos.ejecutar`. **Cero llamadas** en todo
`heredado/`. Las catorce operaciones transaccionales que `F1-01 §6` manda pasar
por comando —cobrar, enviar pedido, abrir mesa, corte— siguen haciéndose como
secuencias de `api.entidades.*.create/update` sueltas, sin transacción, y con los
`.catch(() => {})` de §7 encima.

`pages/POS.jsx:354-462` es el ejemplo canónico: seis escrituras encadenadas
(stock, movimiento, descuento ×2 vías, pedido a cocina) que pueden fallar a
medias y dejar el inventario descuadrado. La ruta `/api/venta/cobrar` **ya
existe** y no la llama nadie.

**Qué hacer:** etapa siguiente. Migrar esas secuencias a `api.comandos.ejecutar`
contra las rutas de `/api/venta/*`, `/api/caja/*` e `/api/inventario/*` que ya
están escritas.

---

## 9. Cosmético

| Hallazgo | Archivo:línea | Acción |
|---|---|---|
| **B-5** `pages/Barra.jsx` no lo importa ninguna ruta ni lo enlaza nada | `pages/Barra.jsx` | Borrar, o darle ruta si se quiere la pantalla de barra |
| **B-6** `ensureDefaultAdmin()` crea un admin con PIN `1234` desde el navegador | `lib/ensureDefaultAdmin.js` | **Borrar.** Ya no lo llama nadie (`POSLogin.jsx:33` explica por qué se quitó), pero mientras el archivo exista alguien puede volver a importarlo |
| **B-7** 404 en inglés y con texto de la plataforma vieja («the AI hasn't implemented this page yet») | `lib/PageNotFound.jsx:47` | Reescribir en español y sin mencionar la plataforma |
| **B-7b** La nota de admin compara `user?.role === 'admin'` | `lib/PageNotFound.jsx:42` | La sesión devuelve `rol` en español: la rama está muerta |
| **B-8** `isIframe` exportado y nunca consumido | `lib/utils.js:9` | Borrar (es además B-1) |
| **B-8b** `createPageUrl()` exportado y nunca consumido | `utils/index.ts:2` | Borrar |
| **B-8c** `Zona`, `SesionCaja`, `UnidadMedida` declaradas en `NOMBRES` y sin usar | `api/cliente.ts:130` | Confirmar si las necesita el backend; si no, quitarlas |
| **B-8d** 108 archivos con `'use client'` sin hooks | varios | Limpieza opcional de bundle |

---

## 10. Orden sugerido

1. **`lib/utils.js:9`** — una línea. Sin esto no abre ninguna pantalla.
2. **`api.auth.usuarios` / `api.auth.entrar`** en `api/cliente.ts` — las rutas ya existen. Sin esto no hay login.
3. **`/api/datos/consultar` y `/api/datos/escribir`** — sin esto no hay datos.
4. **A-1** los tres nombres de entidad — 9 líneas.
5. **A-2 y A-3** los 22 `catch` que se tragan dinero e inventario.
6. **B-4** archivos y mantenimiento.
7. **A-4** migrar las secuencias a `api.comandos`.
8. Lo demás.

Los pasos 1, 2 y 4 son ediciones puntuales que caben en una sesión. El 3 y el 7
son la etapa siguiente del plan, no defectos del porteo.
