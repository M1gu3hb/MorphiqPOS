# F1-07 — Funciones y autorización

Fecha: 9 de septiembre de 2026
Alcance: los **237 archivos** de `apps/web/heredado/`, las **5 funciones backend** de
`historico/restaurante/base44/functions/`, y las **38 rutas** que hoy existen en
`apps/web/app/api/`.

**Método.** `grep` exhaustivo de `api.funciones.invocar`, `api.archivos.subir` y de todo
resto del SDK viejo (`base44.functions.*`, `InvokeLLM`, `UploadFile`, `SendEmail`,
`GenerateImage`, `ExtractDataFromUploadedFile`) sobre `apps/web/heredado/` y sobre
`historico/restaurante/src/`; lectura completa de los cinco `entry.ts`; y comprobación en
disco de qué rutas existen y cuáles no.

**Veredicto en tres frases.** Hay **7 sitios de invocación** y ninguna de las dos rutas que
llaman existe todavía. Las funciones de mantenimiento son **exactamente 5**, y las cinco
autorizan leyendo un `string` que manda el propio cliente — una de ellas ni siquiera eso.
Confirmado leyendo el código: **una línea desde la consola de cualquier tablet de mesero
borra el negocio entero**, y otra distinta lo consigue **sin falsificar nada**.

---

## Índice

1. [Inventario completo de invocaciones](#1-inventario-completo-de-invocaciones)
2. [Las cinco funciones de mantenimiento, una por una](#2-las-cinco-funciones-de-mantenimiento-una-por-una)
3. [Inventario de subidas de archivo](#3-inventario-de-subidas-de-archivo)
4. [Diseño propuesto de `/api/mantenimiento/*`](#4-diseño-propuesto-de-apimantenimiento)
5. [Diseño propuesto de `/api/archivos/subir`](#5-diseño-propuesto-de-apiarchivossubir)
6. [Lo que se pierde](#6-lo-que-se-pierde)

---

## 1. Inventario completo de invocaciones

### 1.1 Lo que NO existe: el resto del SDK

Antes del inventario, la buena noticia. Búsqueda de `InvokeLLM`, `SendEmail`,
`GenerateImage`, `ExtractDataFromUploadedFile` y `base44.functions.*`:

| Ámbito | Resultado |
|---|---|
| `apps/web/heredado/` (237 archivos) | **0 coincidencias** |
| `historico/restaurante/src/` (243 archivos) | **0 coincidencias** |

En el original sólo aparecían dos superficies del SDK aparte de las entidades:
`base44.functions.invoke` (4 sitios) y `base44.integrations.Core.UploadFile` (3 sitios).
**Este sistema no usa IA, ni correo, ni generación de imágenes, ni OCR.** Todo el
acoplamiento a la plataforma vieja cabe en siete líneas.

El porteo mecánico las tradujo una a una:

| Original | Heredado |
|---|---|
| `base44.functions.invoke('X', body)` | `api.funciones.invocar('X', body)` |
| `base44.integrations.Core.UploadFile({file})` | `api.archivos.subir({file})` |

Las dos superficies nuevas están definidas en un solo archivo:

- `apps/web/heredado/api/cliente.ts:211-214` — `funciones.invocar` → `POST /api/mantenimiento/${nombre}`, con clave de idempotencia.
- `apps/web/heredado/api/cliente.ts:216-233` — `archivos.subir` → `POST /api/archivos/subir`, `multipart/form-data`, campo `archivo`.

**Ninguna de las dos rutas existe.** `apps/web/app/api/` tiene 38 rutas repartidas en
`auth/`, `caja/`, `catalogo/`, `datos/`, `identidad/`, `inventario/` y `venta/`. No hay
carpeta `mantenimiento/` ni `archivos/`. Coincide con `F1-05` §B-4.

### 1.2 Los 7 sitios de invocación

Hay **una octava coincidencia** de `grep` en
`apps/web/heredado/components/common/ImageUploader.jsx:11`, pero es una línea de comentario
(`* Internamente sube via api.archivos.subir y devuelve un`), no una llamada. Los sitios
reales son siete.

#### A · `api.funciones.invocar` — 4 sitios

---

**A-1 · `apps/web/heredado/components/configuracion/ReiniciarSistemaSection.jsx:109`**

| | |
|---|---|
| **Función** | `reiniciarSistema` |
| **Cuerpo** | `{ mode, confirm: confirmText.trim(), posRol: posUser?.rol, posUserId: posUser?.id }` (líneas 110-113) |
| **Espera** | `res.data.ok` → éxito; `res.data.error` → mensaje (líneas 115-116, 145) |
| **Pantalla** | **Configuración → pestaña «Datos»**. Montado en `pages/Configuracion.jsx:839`, dentro del `TabsContent` que sólo se dibuja si `posUser?.rol === 'administrador'` (`pages/Configuracion.jsx:406-411`) |
| **Gesto** | Dos botones destructivos: «Borrar todos los datos del sistema» (líneas 201-210, `mode='all'`) y «Borrar solo ventas y pruebas» (líneas 224-233, `mode='tests'`) → abre diálogo → el usuario escribe `BORRAR TODO` o `BORRAR PRUEBAS` en un `Input` (líneas 285-291) → clic en el botón rojo de confirmación (líneas 304-314) |
| **Guardas del cliente** | `esAdmin = posUser?.rol === 'administrador'` (línea 36). Si no es admin, el componente devuelve una tarjeta vacía (líneas 154-170) y `handleConfirm` corta en la línea 99. `isConfirmValid` compara contra la constante `expectedText` (líneas 43-44) |

> **Defecto de contrato.** La línea 115 hace `const data = res?.data || {}`. Pero
> `pedir()` en `api/cliente.ts:104` **ya desenvuelve** el sobre y devuelve `datos`
> directamente. `res.data` será `undefined`, `data` será `{}`, `data.ok` será falso y la
> pantalla mostrará «No se pudo reiniciar el sistema» **aunque el borrado haya ocurrido**.
> Hay que corregir el sitio de llamada, no inventar un `data` falso en el servidor.

---

**A-2 · `apps/web/heredado/components/registros/LimpiarSeccionButton.jsx:58`**

| | |
|---|---|
| **Función** | `limpiarHistorialSeccion` |
| **Cuerpo** | `{ seccion }` — uno de `'cortes' \| 'ventas' \| 'compras' \| 'gastos' \| 'movimientos'` (líneas 22-28) |
| **Espera** | `data.deleted` — un contador que se enseña en el toast (línea 60) |
| **Pantalla** | **Registros**. El botón se instancia **cinco veces**, una por pestaña: `pages/Registros.jsx:297` (cortes), `:341` (ventas), `:407` (compras), `:449` (movimientos), `:466` (gastos) |
| **Gesto** | Botón rojo «Limpiar {sección}» (líneas 88-90) → `AlertDialog` → escribir `ELIMINAR` (líneas 109-114) → «Eliminar historial» (líneas 117-126) |
| **Guardas del cliente** | `if (posUser?.rol !== 'administrador') return null` (línea 49) — el botón no se dibuja. `confirmText.trim().toUpperCase() !== 'ELIMINAR'` (línea 52) |

> Único de los cuatro que sí sobrevive al cambio de sobre: la línea 59 hace
> `const data = res?.data || res`, así que cae de pie.
>
> Un solo sitio de código, **cinco puntos de entrada distintos en la interfaz**.

---

**A-3 · `apps/web/heredado/pages/Configuracion.jsx:350`**

| | |
|---|---|
| **Función** | `eliminarMesasDemo` |
| **Cuerpo** | `{ rol: posUser?.rol }` — **el rol, literalmente, desde el cliente** |
| **Espera** | `res.data.ok` / `res.data.error` (líneas 351, 356) |
| **Pantalla** | **Configuración → pestaña «Mesas» → tarjeta «Mapa de mesas»** (líneas 845-853) |
| **Gesto** | Botón rojo «Eliminar todas» (líneas 856-863), visible sólo si `puedeEliminarMesas && mesas.length > 0` (línea 855) → diálogo «Eliminar mesas demo» (línea 938) → botón «Sí, eliminar todas» (línea 959). **Sin confirmación escrita** |
| **Guardas del cliente** | `puedeEliminarMesas = hasPermission(posUser?.rol, 'eliminar_mesas')` (línea 76), y en `lib/permissions.js:26` eso es `[ROLES.ADMIN]` |

> Mismo defecto de sobre que A-1: `res?.data?.ok` será siempre `undefined`.

---

**A-4 · `apps/web/heredado/pages/Ventas.jsx:93`**

| | |
|---|---|
| **Función** | `limpiarVentas` |
| **Cuerpo** | `{ rol: posUser?.rol, revertirInventario }` (líneas 94-95) |
| **Espera** | `res.data.ok` / `res.data.error` (líneas 97, 117) |
| **Pantalla** | **Ventas (historial)** — cabecera de la página |
| **Gesto** | Botón «Limpiar ventas de prueba» en `PageHeader.actions` (líneas 134-137) → diálogo (línea 250) → casilla «También revertir consumo de inventario», marcada por defecto (líneas 55, 271-276) → escribir `LIMPIAR` (líneas 288-293) → confirmar (líneas 306-310) |
| **Guardas del cliente** | `puedeLimpiar = hasPermission(posUser?.rol, 'limpiar_ventas')` (línea 48) → `[ROLES.ADMIN]` en `lib/permissions.js:25`. `disabled={confirmText !== 'LIMPIAR' \|\| limpiando}` (línea 308) |

> Mismo defecto de sobre que A-1 y A-3.

---

#### B · `api.archivos.subir` — 3 sitios

**B-1 · `apps/web/heredado/components/common/ImageUploader.jsx:47`** · **B-2 ·
`apps/web/heredado/components/configuracion/IdentidadNegocio.jsx:94`** · **B-3 ·
`apps/web/heredado/components/portalqr/MenuQRTab.jsx:87`**

Los tres se detallan campo por campo en la §3.

---

### 1.3 Dónde vive de verdad el rol del cliente

Los cuatro sitios A mandan o comprueban `posUser?.rol`. Vale la pena decir de dónde sale
ese objeto:

```
apps/web/heredado/lib/POSAuthContext.jsx:11    sessionStorage.getItem('posUser')
apps/web/heredado/lib/POSAuthContext.jsx:22    sessionStorage.setItem('posUser', JSON.stringify(user))
```

**El rol del POS vive en `sessionStorage`.** Es un objeto JSON que el navegador guarda y
que cualquiera edita desde las herramientas de desarrollo en cinco segundos. Todo
`hasPermission()` de `lib/permissions.js:29-32` —los 22 permisos, la barra lateral entera,
los botones rojos— cuelga de ese objeto.

Eso, por sí solo, sería tolerable: ocultar un botón nunca fue autorización. El problema es
que **en el sistema viejo era también la única autorización que había**, porque el servidor
se limitaba a leer el mismo dato reenviado en el cuerpo.

---

## 2. Las cinco funciones de mantenimiento, una por una

**Son exactamente cinco**, en `historico/restaurante/base44/functions/`:
`eliminarMesasDemo`, `limpiarHistorialSeccion`, `limpiarVentas`, `reiniciarSistema` y
`seedRecetasDemo`.

**Pero sólo cuatro se invocan desde la interfaz.** `seedRecetasDemo` no tiene un solo sitio
de llamada — ni en `historico/restaurante/src/` ni en `apps/web/heredado/`. Es un endpoint
público, escribible, sin botón. Eso no lo hace menos peligroso: lo hace **invisible**.

Lo que las cinco comparten:

1. Todas son `Deno.serve(async (req) => …)` — **endpoints HTTP públicos**, no funciones internas.
2. Todas escriben con `base44.asServiceRole.entities.*` — **saltándose cualquier seguridad por fila**.
3. La única barrera real es `await base44.auth.me()` devolviendo algo. Y el cliente de la aplicación se construye con `requiresAuth: false` (`historico/restaurante/src/api/base44Client.js:12`) y un `token` que sale de un parámetro de URL o de `localStorage` (`historico/restaurante/src/lib/app-params.js:44`). «Autenticado» aquí significa *cualquier dispositivo que haya abierto alguna vez la aplicación*, no *un empleado con un rol*.
4. **Ninguna es transaccional.** Todas borran registro por registro, y varias se tragan cada fallo individual.

---

### 2.1 `eliminarMesasDemo` — 25 líneas

**Archivo:** `historico/restaurante/base44/functions/eliminarMesasDemo/entry.ts`

**Qué borra exactamente.** Líneas 15-19:

```ts
const mesas = await base44.asServiceRole.entities.Mesa.list('-created_date', 500);
for (const m of mesas) {
  await base44.asServiceRole.entities.Mesa.delete(m.id);
  deleted++;
}
```

**Todas las mesas. Sin filtro.** El nombre dice «demo» y el diálogo de la interfaz dice
«mesas demo» (`apps/web/heredado/pages/Configuracion.jsx:943`), pero el código no distingue
demo de producción: lista hasta 500 y las borra una por una, **físicamente** — no hay
borrado suave, contra la regla 8 de `F1-01` §3.

Tampoco mira `estado` ni `venta_activa_id`. Una mesa ocupada con una venta abierta se borra
igual, y la venta queda huérfana para siempre (es D-16 por otra puerta).

**Cómo decide hoy si tiene permiso.** Líneas 9-12:

```ts
const body = await req.json().catch(() => ({}));
if (body?.rol !== 'administrador') {
  return Response.json({ error: 'Forbidden: solo administrador' }, { status: 403 });
}
```

Compara un `string` del cuerpo contra un literal. Eso es todo.

**El ataque, una línea:**

```js
fetch('/functions/eliminarMesasDemo',{method:'POST',headers:{'content-type':'application/json'},body:'{"rol":"administrador"}'})
```

Desde la consola de la tablet de un mesero. Desaparece el mapa de mesas del restaurante.

---

### 2.2 `limpiarHistorialSeccion` — 74 líneas

**Archivo:** `historico/restaurante/base44/functions/limpiarHistorialSeccion/entry.ts`

**Qué borra exactamente**, según `seccion` (líneas 40-68):

| `seccion` | Qué elimina | Líneas |
|---|---|---|
| `cortes` | Todos los `CorteCaja` | 41 |
| `ventas` | Hasta **5 000** `Venta`, y por cada una: sus `DetalleVenta`, sus `DescuentoInventarioVenta` y sus `PedidoPreparacion` | 44-54 |
| `compras` | Hasta **5 000** `CompraInsumo` y sus `DetalleCompra` | 57-63 |
| `gastos` | Todos los `GastoOperativo` | 65 |
| `movimientos` | Todo el `MovimientoInventario` | 67 |

Su propio comentario avisa (líneas 5-6) que no toca datos maestros y que **no revierte
stock**: borrar los movimientos deja el `stock_actual` donde estaba, sin rastro de cómo
llegó ahí. La trazabilidad de inventario se evapora y los saldos se quedan.

Cada `delete` lleva `.catch(() => {})` (línea 35) y el contador `deleted++` se incrementa
**incluso cuando el borrado falló**. El número que la interfaz enseña en
`LimpiarSeccionButton.jsx:60` es, literalmente, cuántas veces se intentó.

**Cómo decide hoy si tiene permiso.** Líneas 16-21 — **este es D-04**:

```ts
const isAdminApp = user.role === 'admin';
const posUser = await base44.entities.UsuarioPOS.list().catch(() => []);
const isAdminPos = posUser.some(u => u.rol === 'administrador');
if (!isAdminApp && !isAdminPos) {
  return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
}
```

Lee `.some(...)` sobre **la lista completa de usuarios del negocio**. La pregunta que
responde no es *«¿es administrador quien llama?»* sino ***«¿existe algún administrador en
este negocio?»***. Todo negocio tiene al menos uno — `reiniciarSistema` incluso se encarga
de garantizarlo (líneas 216-223). Así que `isAdminPos` es **siempre `true`** y la
comprobación **nunca rechaza a nadie**.

**El ataque, una línea:**

```js
fetch('/functions/limpiarHistorialSeccion',{method:'POST',headers:{'content-type':'application/json'},body:'{"seccion":"ventas"}'})
```

**No hay que falsificar nada.** Ni un rol, ni una palabra de confirmación, ni un
identificador. Se manda el nombre de la sección y se van cinco mil ventas con todos sus
detalles. Es el ataque más barato de los cinco.

---

### 2.3 `limpiarVentas` — 136 líneas

**Archivo:** `historico/restaurante/base44/functions/limpiarVentas/entry.ts`

**Qué borra exactamente.** Líneas 102-106, en cascada hijos→padres:

| Entidad | Tope |
|---|---|
| `DetalleVenta` | 2 000 |
| `PedidoPreparacion` | 2 000 |
| `DescuentoInventarioVenta` | 2 000 |
| `Venta` | 2 000 |
| `CorteCaja` | 500 |

**Qué modifica además.** Líneas 110-126: recorre hasta 500 `Mesa` y a toda la que no esté
`libre` o tenga `venta_activa_id` le escribe
`{ estado: 'libre', venta_activa_id: null, personas_actuales: 0, cliente_temporal: '' }`.
**Incluidas las mesas con comensales sentados en ese momento.**

**Y el camino opcional, que es peor.** Si `body.revertirInventario === true` (línea 23,
y la interfaz lo manda **marcado por defecto** — `pages/Ventas.jsx:55`), las líneas 55-82
suman a `Ingrediente.stock_actual` todo lo que aparezca en hasta 2 000
`DescuentoInventarioVenta`, y luego borra los `MovimientoInventario` de tipo
`salida_venta` (84-95).

No hay marca de «ya revertido» en ninguna parte. **Ejecutarlo dos veces duplica el stock de
cada ingrediente.** Y como el bloque entero vive dentro de un `try { … } catch (e) {
console.error(...) }` (56, 96-98), si revienta a mitad se queda el inventario a medio
revertir y la función sigue adelante borrando las ventas — que es justo la evidencia que
haría falta para reconstruirlo.

**Cómo decide hoy si tiene permiso.** Líneas 18-21:

```ts
const body = await req.json().catch(() => ({}));
if (body?.rol !== 'administrador') {
  return Response.json({ ok: false, error: 'Forbidden: solo administrador' }, { status: 200 });
}
```

Un `string` del cuerpo. Y fíjate en el `status: 200` de la línea 20: **un rechazo de
autorización se devuelve como éxito HTTP**. Ningún proxy, ningún registro de acceso, ningún
panel de métricas puede distinguir un intento denegado de un borrado consumado.

**El ataque, una línea:**

```js
fetch('/functions/limpiarVentas',{method:'POST',headers:{'content-type':'application/json'},body:'{"rol":"administrador","revertirInventario":true}'})
```

Se lleva toda la contabilidad —ventas, detalles, cortes—, libera las mesas ocupadas y de
paso infla el inventario con las devoluciones de ventas que ya no existen.

---

### 2.4 `reiniciarSistema` — 251 líneas

**Archivo:** `historico/restaurante/base44/functions/reiniciarSistema/entry.ts`

Es la más grande y la más destructiva. Tiene dos modos.

**`mode: 'tests'`** — borra las 12 entidades de `ENTITIES_TESTS` (líneas 30-47):
`DetalleVenta`, `DescuentoInventarioVenta`, `MovimientoInventario`, `DetalleCompra`,
`PedidoPreparacion`, `SolicitudQR`, `LiquidacionPropina`, `Venta`, `CompraInsumo`,
`GastoOperativo`, `CorteCaja`, `IntegrationSyncLog`. Pagina de 500 en 500 con un tope de
seguridad de 50 vueltas, es decir **25 000 registros por entidad** (líneas 119-133).

**`mode: 'all'`** — todo lo anterior **más**:

1. Las 10 entidades de `ENTITIES_MASTER_DATA` (líneas 49-62): `RecetaEscandallo`,
   `ProductoTerminado`, `CategoriaProducto`, `Ingrediente`, `CategoriaIngrediente`,
   `PlantillaCompra`, `Proveedor`, `Cliente`, `Mesa`, `MenuQRSeccion`.
2. **Sobrescribe `ConfiguracionNegocio`** con `RESET_CFG` (líneas 64-113, aplicado en
   178-195): 50 campos, entre ellos `nombre_negocio: 'Mi negocio'`, los cuatro colores de
   marca, `paquete_modo: 'restaurante_pro'` y la lista de unidades. Si hay duplicados, los
   borra (188-190).
3. **Borra el padrón de empleados** (líneas 199-235): elimina todos los `UsuarioPOS` salvo
   **uno** — el `posUserId` que llegó en el cuerpo si resulta ser administrador, o el
   primer admin activo, o el primer admin (206-207).
4. Y si no quedó ninguno, **crea uno con PIN en claro `'1234'`** (líneas 218-223):

   ```ts
   await base44.asServiceRole.entities.UsuarioPOS.create({
     nombre: 'Administrador', rol: 'administrador', pin: '1234', activo: true,
   });
   ```

   Combinado con D-01 —el PIN se descarga al navegador y se compara ahí— eso es una puerta
   trasera con nombre y apellido.

Dos huecos que hay que decidir, no copiar, al reimplementarlo: **`PlantillaGasto` y
`EstacionPreparacion` no están en ninguna de las dos listas** —sobreviven a un «borrar
todo»—, y `Cliente` (línea 58) **no existe** entre las 27 entidades del puente
(`apps/web/heredado/api/cliente.ts:161-194`): es una entidad fantasma.

**Cómo decide hoy si tiene permiso.** Líneas 148-159:

```ts
const { mode, confirm, posRol, posUserId } = body || {};
if (posRol !== 'administrador') {
  return Response.json({ ok: false, error: 'Solo el administrador puede reiniciar el sistema.' }, { status: 403 });
}
const expectedConfirm = mode === 'all' ? 'BORRAR TODO' : 'BORRAR PRUEBAS';
if (confirm !== expectedConfirm) { … }
```

Dos comprobaciones, y **las dos leen el mismo cuerpo que manda el atacante**. La palabra de
confirmación es además una **constante conocida**: está impresa en pantalla, en
`ReiniciarSistemaSection.jsx:43` y en el propio `entry.ts:156`. Es un badén para el
administrador distraído, no un control de seguridad.

**El ataque, una línea — y es el peor del sistema:**

```js
fetch('/functions/reiniciarSistema',{method:'POST',headers:{'content-type':'application/json'},body:'{"mode":"all","confirm":"BORRAR TODO","posRol":"administrador"}'})
```

Ventas, detalles, cortes, compras, gastos, propinas, movimientos de inventario, pedidos de
cocina, solicitudes QR, productos, recetas, ingredientes, categorías, proveedores,
plantillas de compra, mesas, secciones del menú QR. Más el nombre del negocio, sus colores
y su paquete, reseteados. Más el padrón de empleados, reducido a uno.

**El negocio entero, desde la consola de cualquier pantalla abierta, sin ser administrador,
sin dejar una traza que diga quién fue.**

---

### 2.5 `seedRecetasDemo` — 167 líneas

**Archivo:** `historico/restaurante/base44/functions/seedRecetasDemo/entry.ts`

**Qué modifica exactamente.** Es la única que crea en vez de borrar, y aun así destruye:

1. Crea los `SEED_INGREDIENTES` que no existan por nombre (líneas 97-108): café molido,
   agua, leche entera, azúcar, jarabes, chocolate, hielo, tortilla de maíz, pollo cocido,
   aguacate… **el inventario de una cafetería**, inyectado en el negocio que sea.
2. Para cada uno de los 10 productos del mapa `RECETAS` (líneas 5-71) que exista por
   nombre: **borra primero todas sus líneas de receta anteriores** (líneas 121-125) y
   después crea las nuevas (133-144). Sin rollback — es exactamente el patrón de D-11.
3. Recalcula y **sobrescribe** `costo_calculado_actual`, `utilidad_bruta_actual` y
   `margen_bruto_actual` del producto (líneas 148-154).

Un producto llamado «Cappuccino» en cualquier negocio del sistema pierde su escandallo real
y se queda con el de la demo, con su margen recalculado sobre costos inventados.

**Cómo decide hoy si tiene permiso.** Líneas 92-95: idéntico a `eliminarMesasDemo` —
`if (body?.rol !== 'administrador')`.

**El ataque, una línea:**

```js
fetch('/functions/seedRecetasDemo',{method:'POST',headers:{'content-type':'application/json'},body:'{"rol":"administrador"}'})
```

**Y este es el que nadie vería.** No hay botón que lo dispare, así que no hay pantalla que
avise, no hay toast, no hay confirmación. Los márgenes de los productos simplemente
cambian, y el dueño se entera cuando cuadre el mes.

---

### 2.6 Resumen de las cinco

| Función | Líneas | Qué destruye | Cómo autoriza | Se invoca desde la UI |
|---|---|---|---|---|
| `eliminarMesasDemo` | 25 | Todas las mesas (500), borrado físico | `body.rol === 'administrador'` (L10) | Sí — Configuración › Mesas |
| `limpiarHistorialSeccion` | 74 | 5 secciones de historial, hasta 5 000 filas cada una | **Nada.** `.some()` sobre todo el padrón (L18) | Sí — Registros, 5 pestañas |
| `limpiarVentas` | 136 | Ventas + cortes + reset de mesas + reversión de stock | `body.rol === 'administrador'` (L19), **rechaza con HTTP 200** | Sí — Ventas |
| `reiniciarSistema` | 251 | **Todo el negocio** + config + padrón de empleados | `body.posRol` + `body.confirm`, ambos del cuerpo (L152, L157) | Sí — Configuración › Datos |
| `seedRecetasDemo` | 167 | Recetas y márgenes de 10 productos; inyecta 20+ ingredientes | `body.rol === 'administrador'` (L93) | **No. Ningún sitio de llamada** |

---

## 3. Inventario de subidas de archivo

Tres sitios. Los tres mandan el mismo `FormData` con el campo `archivo`
(`apps/web/heredado/api/cliente.ts:218-219`) y esperan `{ file_url: string }` de vuelta
(`:230`).

---

### 3.1 `components/common/ImageUploader.jsx:47`

| | |
|---|---|
| **Validación de tipo** | `file.type?.startsWith('image/')` (línea 36) — **es el `File.type` del navegador**, que en Windows y macOS se deriva de la extensión |
| **Límite de tamaño** | Prop `maxMB`, **por defecto 8** (línea 27); comprobado en 40-44 |
| **`accept`** | `image/*` (líneas 134 y 174) — filtro del selector, nada más |
| **También acepta** | Arrastrar y soltar (`onDrop`, líneas 68-75), por el mismo camino de validación |
| **A dónde va la URL** | `onChange?.(url)` (línea 50) → el padre la guarda |

**Quién lo usa y dónde acaba la URL:**

| Consumidor | Campo destino |
|---|---|
| `components/productos/ProductoSimpleDialog.jsx:220` | `ProductoTerminado.imagen_url` |
| `components/recetas/RecetaFormDialog.jsx:348` | `ProductoTerminado.imagen_url` |

**Qué pantallas la muestran:** `pages/Productos.jsx`, `components/pos/ProductCard.jsx`,
`components/portalqr/ProductoQRDialog.jsx`, `pages/PortalCliente.jsx`,
`components/mesero/SeleccionModificadoresDialog.jsx`, `components/portalqr/MenuQRTab.jsx`.

> **`PortalCliente.jsx` y `ProductoQRDialog.jsx` son públicos**: los ve cualquiera que
> escanee un QR, sin sesión.

---

### 3.2 `components/configuracion/IdentidadNegocio.jsx:94`

| | |
|---|---|
| **Validación de tipo** | **NINGUNA.** `handleUpload` (líneas 85-107) sólo mira `file.size`. El `accept="image/*"` de la línea 174 es un filtro de selector |
| **Límite de tamaño** | **5 MB**, fijo en el código: `if (file.size > 5 * 1024 * 1024)` (línea 88) |
| **A dónde va la URL** | `setForm((f) => ({ ...f, [field]: url }))` (línea 97), y se persiste en `ConfiguracionNegocio` al guardar (líneas 122-126, 135) |

**Los cinco campos** (líneas 255, 261, 267, 285, 292) y **qué pantalla muestra cada uno**:

| Campo | Se muestra en |
|---|---|
| `logo_url` | `pages/POSLogin.jsx`, `components/common/Sidebar.jsx`, `components/common/BrandedBackground.jsx`, `pages/PortalCliente.jsx`, `components/tickets/CorteTicket.jsx`, `components/tickets/PreCuentaTicket.jsx`, `components/registros/PeriodoPDF.jsx` |
| `logo_ticket_url` | `components/tickets/CorteTicket.jsx`, `components/tickets/PreCuentaTicket.jsx`, `pages/PortalCliente.jsx` |
| `logo_pdf_url` | idem |
| `background_image_url` | `components/common/BrandedBackground.jsx`, `pages/POSLogin.jsx`, `pages/PortalCliente.jsx` |
| `background_logo_url` | idem |

> **Éste es el que más duele.** Un archivo subido aquí aparece en la **pantalla de acceso**
> —que se dibuja **antes** de que exista sesión— y en el **portal QR público**. Es el único
> sitio de subida sin ninguna comprobación de tipo, y el que llega a más ojos anónimos.

---

### 3.3 `components/portalqr/MenuQRTab.jsx:87`

| | |
|---|---|
| **Validación de tipo** | **NINGUNA.** `subir` (líneas 78-99) sólo mira `file.size`. `accept="image/*"` en la línea 211 |
| **Límite de tamaño** | **8 MB**, fijo: `if (file.size > 8 * 1024 * 1024)` (línea 81) |
| **A dónde va la URL** | `setEditForm((prev) => ({ ...prev, imagen_url: file_url }))` (línea 88) → `MenuQRSeccion.imagen_url` (líneas 53, 55) |
| **Se muestra en** | `components/portalqr/MenuQRTab.jsx:125` (rejilla de administración) y `pages/PortalCliente.jsx` (**portal público**) |

---

### 3.4 Lo que parece una subida y no lo es

`components/datos/ImportarDatosDialog.jsx:225` tiene un `<input type="file"
accept=".csv,text/csv">`, pero `handleFile` (línea 92) **lee el texto en el navegador** y lo
parsea con `parseCSV` (línea 99). **Nunca sube nada.** No cuenta como cuarto sitio, y el
endpoint de subida no tiene que aceptar CSV por su culpa.

---

### 3.5 Resumen

| Sitio | Tipo validado | Límite cliente | Campo destino | ¿Llega a ojos anónimos? |
|---|---|---|---|---|
| `ImageUploader.jsx:47` | `File.type` (= extensión) | 8 MB (prop) | `ProductoTerminado.imagen_url` | **Sí** (portal QR) |
| `IdentidadNegocio.jsx:94` | **ninguno** | 5 MB | 5 campos de `ConfiguracionNegocio` | **Sí** (login + portal QR) |
| `MenuQRTab.jsx:87` | **ninguno** | 8 MB | `MenuQRSeccion.imagen_url` | **Sí** (portal QR) |

**Dos de tres sitios no comprueban el tipo, y el tercero comprueba la extensión creyendo
que comprueba el contenido. Los tres desembocan en superficie pública.**

---

## 4. Diseño propuesto de `/api/mantenimiento/*`

### 4.1 La regla que gobierna todo el capítulo

> «Autorización en el servidor, por sesión. Nunca por un campo del body.» — `F1-02` §7

En este backend eso no es una aspiración: **ya está construido y es estructural.**

- El ámbito lo arma `resolverSesion` a partir de una cookie **firmada y `HttpOnly`**, releída de la base **en cada petición** (`apps/web/src/servidor/http.ts:34-60`). Una baja revoca el acceso en la siguiente llamada.
- `comando()` comprueba el rol **antes de tocar la base y antes de mirar la entrada** (`packages/app/src/comando.ts:98-101`), a propósito: si el 400 llegara primero, un rol sin permiso podría sondear el esquema de un comando administrativo a base de entradas inválidas.
- Y lo definitivo: **hay un contrato que recorre todos los comandos registrados y rechaza que su esquema de entrada declare `organizacion_id`, `sucursal_id`, `identidad_id`, `empleo_id`, `rol` o `terminal_id`** (`packages/contracts/src/comandos/ambito.ts:9-13`).

Es decir: **`{"rol":"administrador"}` en el cuerpo no es que se ignore — es que un comando
que lo aceptara no compila.** El defecto D-03 no se corrige con disciplina; se corrige
porque el tipo no deja escribirlo.

### 4.2 Una ruta por operación

Las cuatro rutas heredadas (`reiniciarSistema`, `limpiarHistorialSeccion`,
`eliminarMesasDemo`, `limpiarVentas`) mezclan operaciones con riesgos muy distintos detrás
de un mismo nombre: `reiniciarSistema` con `mode:'tests'` borra historial, y con
`mode:'all'` borra el negocio. **Un solo rol y una sola confirmación para las dos es un
error de diseño heredado.**

Se propone **seis rutas**, una por operación real, y **reescribir los 4 sitios de llamada**.
Son cuatro ediciones —hay que tocarlos igual por el defecto del sobre (§1.2)—, así que no
sale más caro que fingir un despachador genérico.

| Ruta | Comando | **Rol exigido POR SESIÓN** | Confirmación | Reversible | Idempotencia |
|---|---|---|---|---|---|
| `POST /api/mantenimiento/vaciar-mesas` | `mantenimiento.vaciar_mesas` | `dueno`, `administrador` | **doble confirmación** | **Sí** — borrado suave | Obligatoria |
| `POST /api/mantenimiento/purgar-seccion` | `mantenimiento.purgar_seccion` | **`dueno`** | **nombre del negocio** | No | Obligatoria |
| `POST /api/mantenimiento/purgar-ventas` | `mantenimiento.purgar_ventas` | **`dueno`** | **nombre del negocio** | No | **Obligatoria y crítica** |
| `POST /api/mantenimiento/reiniciar-pruebas` | `mantenimiento.reiniciar_pruebas` | **`dueno`** | **nombre del negocio** | No | Obligatoria |
| `POST /api/mantenimiento/reiniciar-todo` | `mantenimiento.reiniciar_todo` | **`dueno`** | **nombre del negocio + doble** | No | Obligatoria |
| `POST /api/mantenimiento/sembrar-recetas` | `mantenimiento.sembrar_recetas` | `dueno`, `administrador` | **doble confirmación** | Sí (repetible) | Obligatoria |

`paquetes: PAQUETES_TODOS` en las seis (`packages/contracts/src/comandos/ambito.ts:49`):
mantenimiento aplica a todos los giros.

### 4.3 Por qué `dueno` y no `administrador` en las cinco destructivas

`packages/app/src/puente/roles.ts:35-42` traduce **tres** roles de la base al
`administrador` de su interfaz: `dueno`, `administrador` y `gerente`. Si las rutas
destructivas aceptaran `administrador`, **un gerente podría borrar el negocio** — y su
pantalla le enseñaría el botón, porque `hasPermission` sólo ve el rol traducido.

Por eso el servidor es **más estricto que la interfaz**: las cinco irreversibles son
`roles: ['dueno']`. Un gerente verá el botón y recibirá `SIN_PERMISO`, que es correcto
—«ocultar un botón no es autorización»— pero es mala experiencia.

> **Tarea derivada:** `api.auth.me()` (`apps/web/heredado/api/cliente.ts:260`) debe devolver
> también una lista de capacidades, no sólo el rol traducido, para que
> `ReiniciarSistemaSection.jsx:36` y `Configuracion.jsx:76` oculten lo que el servidor
> va a rechazar de todos modos.

### 4.4 Los tres niveles de confirmación, y por qué el actual no cuenta

| Nivel | Qué es | Dónde se verifica |
|---|---|---|
| **Nada** | Un clic | — |
| **Doble confirmación** | Diálogo + segundo botón explícito | Cliente. Es ergonomía, no seguridad |
| **Nombre del negocio** | El usuario escribe el `nombre_negocio` real de su organización | **Servidor**, dentro de la misma transacción, leído de `configuracion` |

Hoy las palabras son `BORRAR TODO`, `BORRAR PRUEBAS`, `ELIMINAR` y `LIMPIAR`
(`reiniciarSistema/entry.ts:156`, `LimpiarSeccionButton.jsx:52`, `Ventas.jsx:308`).
**Son constantes públicas impresas en la propia pantalla.** Un atacante las lee del HTML.

El nombre del negocio no. Es un valor por inquilino, sólo lo sabe quien tiene acceso
legítimo, y —esto es lo importante— **el servidor lo lee de la base en la misma
transacción**, nunca lo compara contra algo que el cliente le mandó. Es el mismo patrón que
usa GitHub para borrar un repositorio, y por la misma razón.

### 4.5 Reversibilidad: la respuesta honesta

**Sólo `vaciar_mesas` y `sembrar_recetas` son reversibles de verdad.**

`vaciar_mesas` lo es porque pasa a **borrado suave** —regla 8 de `F1-01` §3— y porque el
comando **se niega a ejecutarse si alguna mesa tiene una orden activa**. Eso arregla de
paso el bug de las mesas huérfanas que hoy provoca `eliminarMesasDemo` al borrar sin mirar
`venta_activa_id`.

Las otras cuatro **no son reversibles y no hay que fingir que lo son**. El único rescate
real es un punto de restauración de la base (PITR de Supabase). En consecuencia:

1. El diálogo debe decirlo con esas palabras, no con «No se puede deshacer» a secas.
2. El comando escribe en `auditoria` los **conteos por entidad antes de borrar** — no reconstruye los datos, pero deja constancia de qué había.
3. Se documenta en el manual de operación que antes de un reinicio se toma un punto de restauración.

### 4.6 Idempotencia: obligatoria en las seis, crítica en una

`comando()` rechaza toda escritura sin clave de **8 caracteres o más**
(`packages/app/src/comando.ts:125-127`), y `api.funciones.invocar` ya genera una
(`apps/web/heredado/api/cliente.ts:213`). Así que la respuesta formal es: **sí, las seis, y
ya viene puesta.**

Pero hay una donde la clave no es burocracia, es la corrección: **`purgar_ventas` con
reversión de inventario**. Hoy `limpiarVentas` suma stock sin marca de idempotencia
(`limpiarVentas/entry.ts:74-75`), así que un doble clic o un reintento de red **duplica el
inventario del negocio**. Con `comando()`, el segundo intento con la misma clave devuelve el
resultado del primero (`packages/app/src/comando.ts:129-136`) y no vuelve a sumar.

**Regla para el diálogo:** la clave se genera **al abrir** el diálogo y se reusa mientras
esté abierto —lo que `F1-02` §8 T5 llama `conClave()`—, no una nueva por clic.

### 4.7 Lo demás que estas rutas deben traer

- **Transacción única.** `comando()` abre una y sólo una (`comando.ts:106`). Nada de borrar 5 000 filas con 5 000 `.catch(() => {})`. Si falla la fila 4 000, no persiste ninguna.
- **Cero `catch` vacíos.** `limpiarHistorialSeccion/entry.ts:35` y `reiniciarSistema/entry.ts:128-130,189,230` los tienen. Desaparecen: `comando()` devuelve `{ ok: false, error }` y **ignorarlo es un error de tipos** (`comando.ts:36-39`).
- **Nada de `asServiceRole`.** El ámbito de la sesión decide qué filas se ven. Un mantenimiento no puede tocar otra organización porque no tiene forma de nombrarla.
- **Auditoría automática con conteos.** `comando()` audita incluso los rechazos (`comando.ts:80-92`). Por primera vez habrá una fila que diga **quién** intentó borrar el negocio.
- **Límite de tasa.** Añadir `mantenimiento: { intentos: 3, ventanaSegundos: 3600 }` a `LIMITES` (`packages/app/src/http/limite.ts:92-95`). Son los endpoints a los que iría una sesión robada.
- **Decidir los huecos heredados**, no copiarlos: `PlantillaGasto` y `EstacionPreparacion` no están en las listas de `reiniciarSistema`, y `Cliente` (línea 58) no existe. Propuesta: `EstacionPreparacion` **se conserva** —la estación general `es_general: true` es fallback obligatorio, regla 10 de `F1-01` §3— y `PlantillaGasto` **se borra** en `reiniciar_todo`, por simetría con `PlantillaCompra`.
- **Prohibido el PIN por defecto.** `reiniciar_todo` **nunca** crea un usuario con `1234` (`reiniciarSistema/entry.ts:218-223`). Conserva al `dueno` que ejecuta —que por definición existe, porque tiene sesión— y ya. Si hiciera falta un administrador nuevo, es `pnpm db:bootstrap` (`F1-02` E2-3).

---

## 5. Diseño propuesto de `/api/archivos/subir`

### 5.1 Tipos MIME admitidos

| Admitido | Motivo |
|---|---|
| `image/jpeg` | Fotos de producto y logos |
| `image/png` | Logos con transparencia |
| `image/webp` | Lo que produce cualquier móvil moderno |
| `image/avif` | Idem, y pesa menos |

**Rechazado, y por qué:**

- **`image/svg+xml` — rechazado sin excepción.** Un SVG es un documento XML que ejecuta `<script>` y admite `<foreignObject>`. Servido desde el mismo origen que la aplicación, un SVG subido es **XSS almacenado** con acceso a la cookie de sesión. Y las tres pantallas que muestran estas imágenes incluyen el **login** y el **portal QR público**.
- **`image/gif` — rechazado.** No aporta nada a un logo ni a una foto de plato, y añade una superficie de decodificación más.
- **Todo lo demás** — PDF, CSV, ZIP, HEIC. Si mañana hace falta un PDF de menú, es **otro endpoint con otras reglas**, no una excepción en éste.

### 5.2 Tamaño máximo: **5 MB**

Es el más estricto de los tres límites del cliente (`IdentidadNegocio.jsx:88`), y el
servidor manda. Además:

- **El servidor rechaza antes de bufferizar.** Se comprueba `Content-Length` y se corta la lectura del cuerpo al superar el tope; no se cargan 5 MB en memoria para luego decir que no.
- **Tope de dimensiones: 6 000 × 6 000 px.** Un PNG de 4 KB puede descomprimirse a gigabytes. El límite de bytes no protege de una bomba de descompresión; el de píxeles sí.
- **Cuota por organización**, para que la subida no sea disco gratis.

> **Tarea de coordinación:** `ImageUploader.jsx:27` (8 MB por defecto) y `MenuQRTab.jsx:81`
> (8 MB) tienen que **bajar a 5**. Si no, el usuario elige una foto de 7 MB, espera la
> subida y recibe un rechazo del servidor. El límite del cliente es cortesía; el del
> servidor es la norma; **tienen que coincidir**.

### 5.3 Dónde se guarda

**Ya está en el contrato de entorno** — no hay que inventar nada
(`packages/contracts/src/entorno/index.ts:67-71`):

```
STORAGE_ENDPOINT    // S3-compatible; MinIO en local
STORAGE_BUCKET
STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY
```

**Bucket privado, nunca de lectura pública.** Dos prefijos:

| Prefijo | Para qué | Cómo se sirve |
|---|---|---|
| `privado/` | Logos de ticket y PDF, y todo lo que sólo ve personal con sesión | `GET /api/archivos/:id`, que resuelve la organización **de la sesión** |
| `publico/` | Imágenes de producto, secciones del menú QR, logo y fondo de la pantalla de acceso | URL firmada de larga duración, o `GET /api/publico/archivo/:id` que comprueba que el objeto está **referenciado** por una fila de la organización dueña del token QR |

Lo público se marca **en el momento de subir**, por el comando que persiste la referencia —
nunca por un parámetro que mande el navegador.

### 5.4 Cómo se nombra

```
<prefijo>/<organizacion_id>/<aaaa>/<mm>/<uuidv7>.<ext-que-decidió-el-servidor>
```

**El nombre del usuario no aparece en la ruta.** Se guarda como metadato, sólo para
mostrarlo. Tres razones:

1. **El nombre es una cadena que elige el cliente.** Puede llevar `../`, un byte NUL, una marca RTL de Unicode que invierta lo que se lee, o un nombre reservado de Windows (`CON`, `NUL`, `PRN`). Nada de eso debe llegar nunca a una ruta de almacenamiento.
2. **Dos negocios que suben `logo.png` no pueden colisionar.** El `organizacion_id` en la ruta lo hace imposible por construcción.
3. **UUIDv7 ordena por tiempo**, así que listar el prefijo de un mes sale barato, y no es adivinable como lo sería un contador.

La extensión la pone el **servidor**, derivada de lo que encontró en los bytes — no de lo
que traía el archivo.

### 5.5 Por qué la validación de tipo NO puede basarse en la extensión ni en el `Content-Type`

Es el punto central de esta sección, así que va despacio.

**La extensión es texto que elige el atacante.** `factura.png` puede ser un HTML, un SVG con
script o un ejecutable. La extensión no es una propiedad del archivo: es una parte del
nombre, y el nombre lo escribe quien sube.

**El `Content-Type` del multipart también lo escribe el cliente.** Es un campo de cabecera
dentro del cuerpo de la petición, y se pone a mano:

```bash
curl -F 'archivo=@payload.svg;type=image/png' https://…/api/archivos/subir
```

Ahí `Content-Type: image/png` y el contenido es SVG. Cualquier comprobación de esa cabecera
da luz verde.

**Y el `accept="image/*"` del HTML no valida nada.** Es un filtro del selector de archivos
del sistema operativo. Se salta cambiando el desplegable a «Todos los archivos», arrastrando
y soltando, o —evidentemente— no usando un navegador.

**El `File.type` del navegador es la extensión con pasos extra.** Aquí está la trampa fina,
porque es exactamente lo que hace hoy el único sitio que sí valida:

```js
// apps/web/heredado/components/common/ImageUploader.jsx:36
if (!file.type?.startsWith('image/')) { … }
```

En Windows y macOS el navegador rellena `File.type` consultando el registro del sistema **por
la extensión**. Renombrar `payload.html` a `payload.png` hace que el navegador reporte
`image/png` con total sinceridad. Esa comprobación **cree que mira el contenido y mira el
nombre**.

**Lo único que el cliente no controla son los bytes.** De ahí el diseño:

1. **Número mágico.** Leer los primeros bytes y exigir una firma conocida:

   | Formato | Firma |
   |---|---|
   | JPEG | `FF D8 FF` |
   | PNG | `89 50 4E 47 0D 0A 1A 0A` |
   | WebP | `RIFF` … `WEBP` (bytes 0-3 y 8-11) |
   | AVIF | `ftypavif` (bytes 4-11) |

2. **Decodificar y re-codificar** con una librería de imagen en el servidor. Esto es lo que
   mata los **poliglotas**: un archivo que es JPEG válido en la cabecera y HTML en la cola
   pasa el número mágico, pero **no sobrevive a una re-codificación**. De paso se aplica el
   tope de píxeles y se limpian los metadatos EXIF — que llevan la geolocalización del
   móvil del dueño.

3. **Persistir el tipo que decidió el servidor**, no el que llegó, y servirlo con:
   - el `Content-Type` que el servidor determinó,
   - `X-Content-Type-Options: nosniff` — para que el navegador no reinterprete,
   - `Content-Disposition: inline; filename="<saneado>"`,
   - e idealmente **desde un origen distinto** al de la aplicación, para que un archivo malicioso que se colara no comparta origen con la cookie de sesión.

### 5.6 Dos obstáculos concretos que hay que resolver antes de escribir la ruta

**Obstáculo 1 — el guardián de escritura rechaza `multipart`.**

```ts
// apps/web/src/servidor/seguridad-http.ts:1-8
export function peticionDeEscrituraValida(peticion: Request): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('application/json')) return false;
  …
}
```

Exige `application/json`. Pero `api.archivos.subir` manda un `FormData`
(`apps/web/heredado/api/cliente.ts:218-224`), y el navegador pone
`multipart/form-data; boundary=…`. **Si se escribe la ruta con
`ejecutarComandoHttp`, devolverá 403 para siempre** y va a parecer un problema de sesión.

*Salida:* una variante del guardián que acepte `multipart/form-data` conservando las otras
dos comprobaciones —`x-morphiqpos-request: 1` (que el cliente ya manda,
`api/cliente.ts:222`) y el mismo origen—. No relajar el guardián existente: **añadir uno
específico** para este endpoint.

**Obstáculo 2 — la subida no encaja en `ejecutarComandoHttp`.**

Ese ayudante hace `await peticion.json()` (`apps/web/src/servidor/http.ts:76`). Aquí no hay
JSON.

*Salida:* resolver la sesión con `conSesion(peticion, …)`
(`apps/web/src/servidor/http.ts:105`), que ya devuelve `{ok:true, datos}` con
`cache-control: no-store`, hacer ahí la validación y el guardado, y **persistir la
referencia con un comando delgado** para que la fila quede auditada y con clave de
idempotencia.

### 5.7 Rol exigido

`roles: ['dueno', 'administrador', 'gerente']`. Las subidas alimentan el catálogo, la
identidad del negocio y el portal público. **Un mesero o una pantalla de cocina no suben
archivos nunca**, y darles el permiso sería regalar un canal de escritura a los dos roles
que operan en los dispositivos más expuestos del local.

---

## 6. Lo que se pierde

Sección honesta: qué de Base44 no tiene equivalente, y qué pantalla se queda coja.

### 6.1 Lo que NO se pierde, porque nunca existió

**No hay `InvokeLLM`, `SendEmail`, `GenerateImage` ni `ExtractDataFromUploadedFile` en
ninguno de los 243 archivos originales.** La categoría entera del encierro de plataforma
—IA, correo transaccional, generación de imágenes, extracción de datos— **no aplica a este
sistema**. Es la mejor noticia del documento y conviene decirla antes que nada.

### 6.2 Lo que se pierde de verdad, y no lo arregla ningún código

> ### Las imágenes que ya están subidas
>
> `UploadFile` no era sólo una función: era **almacenamiento y CDN**. Las URLs que
> devolvió están **guardadas en la base de datos de producción** de Miguel, apuntando al
> dominio de Base44.
>
> El día que Base44 deje de responder, **todos estos campos apuntan a nada**:
> `ProductoTerminado.imagen_url`, `MenuQRSeccion.imagen_url`, `ConfiguracionNegocio.logo_url`,
> `.logo_ticket_url`, `.logo_pdf_url`, `.background_image_url`, `.background_logo_url`.
>
> **Pantallas que se quedan cojas:** Productos (rejilla sin fotos), POS
> (`components/pos/ProductCard.jsx`), Portal del cliente y `ProductoQRDialog` —**la carta
> que ve el comensal, sin imágenes**—, `MenuQRTab`, `SeleccionModificadoresDialog`, la
> barra lateral, **la pantalla de acceso** (sin logo ni fondo), los tickets de corte y
> precuenta, y el PDF de periodo.
>
> **Esto no se porta: se migra o se pierde.** Hay que **descargar los archivos mientras
> Base44 todavía responda** y volver a subirlos al bucket nuevo, reescribiendo las URLs de
> la base. Es una tarea con fecha de caducidad y no está en las 61 tareas de `F1-02` §6.
> **Debe entrar en E11 antes del despliegue, o se pierde el material gráfico del negocio.**

### 6.3 Lo que desaparece a propósito

| Pieza de Base44 | Qué era | Qué pasa |
|---|---|---|
| `base44.asServiceRole` | Salida de emergencia que salta la seguridad por fila. Las 5 funciones la usan en **todas** sus escrituras | **No se porta, y ese es el objetivo.** En el backend nuevo el ámbito sale de la sesión y una operación que necesite tocar otra organización sencillamente no puede existir |
| `base44.auth.me()` + entidad `User` | Identidad de plataforma. Nunca llevó el rol del POS | Sustituida por la cookie firmada + `empleos`. `F1-02` §8 T4 ya lo daba por muerto. **No se pierde nada**: el rol nunca estuvo ahí |
| `access_token`, `app_id`, `functions_version` en parámetros de URL (`historico/restaurante/src/lib/app-params.js:43-47`) | Fontanería de despliegue de Base44 | Desaparece con ella. **D-21 se cierra por construcción**: no hay token que guardar en `localStorage` |
| `seedRecetasDemo` | Sembrador de recetas de demo, **sin ningún sitio de llamada** | **No se porta.** Ya existe el comando `configuracion.resetear_demo` (`packages/app/src/demostracion/resetear.ts:17-21`, roles `['dueno','administrador']`), correctamente autorizado. Sus datos son de tienda y cafetería (`packages/app/src/demostracion/datos.ts`); los de restaurante son **E11-2**, no E10-4 |

### 6.4 La integración que parece perderse y nunca existió

**Google Sheets y Google Drive.** `ConfiguracionNegocio` tiene ocho campos que los
prometen (`google_sheets_enabled`, `google_drive_status`, `auto_sync_on_cash_cut`,
`auto_save_pdf_to_drive`… — `reiniciarSistema/entry.ts:89-95`), y `Configuración →
Integraciones` tiene una pantalla entera dedicada a ellos.

No hay nada detrás. `components/configuracion/IntegracionesRespaldos.jsx:67` y `:71`:

```js
toast.info('La conexión real con Google Sheets se configurará después mediante OAuth.');
toast.info('La conexión real con Google Drive se configurará después mediante OAuth.');
```

Mientras tanto se acumulan filas de `IntegrationSyncLog` con
`status: 'pending_external_sync'` (líneas 54, 192-193) que **nadie procesa jamás**.

**Nada que perder: no se puede portar lo que no existe.** La pantalla se porta tal cual
—son dos listas y un botón de reintento— pero debe dejar de insinuar que hay una conexión.
Y `IntegrationSyncLog` sigue siendo una tabla simple, como ya dice `F1-02` §8 T4.

### 6.5 Lo que hay que arreglar al portar, y no es una pérdida sino una deuda

1. **Tres sitios de llamada leen un sobre que ya no existe.** `ReiniciarSistemaSection.jsx:115`, `Configuracion.jsx:351` y `Ventas.jsx:97` esperan `res.data.ok`, pero `pedir()` devuelve `datos` desenvuelto (`api/cliente.ts:104`). Sin corregirlos, **las tres pantallas dirán «error» después de un borrado exitoso** — y alguien lo intentará dos veces. `LimpiarSeccionButton.jsx:59` es el único que sobrevive.
2. **Los límites del cliente y del servidor tienen que coincidir** (§5.2): 8 MB en `ImageUploader.jsx:27` y `MenuQRTab.jsx:81` contra los 5 MB del servidor.
3. **`api.auth.me()` debe devolver capacidades, no sólo el rol traducido** (§4.3), para que un gerente no vea botones que el servidor le va a negar.
4. **`ImageUploader.jsx:36` hay que dejar de llamarlo validación.** Es una cortesía para el usuario, y está bien que se quede — pero la validación real vive en el servidor y en los bytes.

---

## Cierre

| | |
|---|---|
| **Sitios de invocación** | **7** — 4 de `api.funciones.invocar`, 3 de `api.archivos.subir` (+1 comentario, +2 definiciones en `api/cliente.ts`). **11 puntos de entrada distintos en la interfaz**, porque `LimpiarSeccionButton` se instancia 5 veces |
| **Funciones de mantenimiento** | **5**, y sólo **4** tienen botón. `seedRecetasDemo` es un endpoint público sin interfaz |
| **Rutas que faltan** | `/api/mantenimiento/*` y `/api/archivos/subir`. **Ninguna existe** entre las 38 de `apps/web/app/api/` |
| **Sitios de subida sin validar tipo** | **2 de 3**, y el tercero valida la extensión creyendo validar el contenido |
| **Se corrige en** | **E10-4** (mantenimiento) y una tarea nueva para la subida de archivos |

### El ataque de una línea más grave que confirmé leyendo el código

```js
fetch('/functions/reiniciarSistema',{method:'POST',headers:{'content-type':'application/json'},body:'{"mode":"all","confirm":"BORRAR TODO","posRol":"administrador"}'})
```

`historico/restaurante/base44/functions/reiniciarSistema/entry.ts:152` compara
`posRol !== 'administrador'` contra un campo del cuerpo, y la línea 157 compara `confirm`
contra una constante que está impresa en la pantalla. Las dos comprobaciones las escribe el
atacante. Detrás, las líneas 164-235 borran 22 entidades, resetean los 50 campos de
`ConfiguracionNegocio` y reducen el padrón de empleados a uno — dejando, si no quedó
ninguno, **un administrador con PIN `1234`** (líneas 218-223).

Se ejecuta desde la consola de cualquier pantalla abierta del local. Sin ser administrador.
Sin dejar una fila que diga quién fue.

### Y la mención de honor, porque no requiere falsificar nada

```js
fetch('/functions/limpiarHistorialSeccion',{method:'POST',headers:{'content-type':'application/json'},body:'{"seccion":"ventas"}'})
```

`limpiarHistorialSeccion/entry.ts:18` pregunta `posUser.some(u => u.rol === 'administrador')`
— es decir, *«¿existe algún administrador en este negocio?»* — y la respuesta es siempre
`true`. **Ese endpoint nunca ha rechazado a nadie.** Es D-04, y hasta hoy no estaba
reportado en ninguna auditoría anterior a `F1-01`.
