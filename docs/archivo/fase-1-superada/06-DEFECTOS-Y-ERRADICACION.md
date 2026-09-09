# 06 — Defectos a corregir y erradicación de Base44

Cada defecto lleva: dónde estaba, qué se hace, en qué corte, y **con qué prueba se cierra**.

> **Criterio de cierre (R17):** un defecto sólo se cierra con una prueba automatizada que **falla contra el comportamiento viejo y pasa contra el nuevo**. Ocultarlo en la interfaz, silenciar el error o cambiar el orden de los `await` no cuenta.

---

## 1. Erradicación de Base44

### Situación

El repositorio de MorphiqPOS es nuevo. **La erradicación es por construcción**: nada de Base44 entra nunca. No hay migración de código ni adaptadores temporales.

Superficies que existían en la Fuente A y que simplemente **no se portan**: `@base44/sdk` · `@base44/vite-plugin` · `src/api/base44Client.js` · `src/lib/app-params.js` · `base44/` (25 esquemas + 5 funciones) · `VITE_BASE44_*` · URLs, IDs y activos remotos en `index.html` y `ConfigContext` · el README generado.

### La puerta automática de CI

Se instala en **F1.0-T09**, aunque al principio pase trivialmente. Existe para que nadie los introduzca al portar componentes.

CI **falla** si aparece cualquiera de estos patrones fuera de `historico/`:

```
@base44/          base44Client       base44.
VITE_BASE44       base44/            media.base44.com
app.base44.com    69fbe8877069565e6f39775c
```

Alcance del escaneo: código, `package.json`, lockfiles, artefactos de build, source maps, variables de CI, `docker-compose`, y documentación operativa.

### Prueba de independencia — `ZERO-01`

Desde un clon limpio, con el DNS hacia `*.base44.com` bloqueado: `docker compose up` → migrar → sembrar → probar → construir → arrancar. **Cero llamadas de red hacia dominios heredados.** Se ejecuta en CI, no una sola vez al final.

### Sobre el ZIP histórico

Vive en `historico/`, excluido del build, del `tsconfig`, del lint y del escaneo. **No se abre como proyecto ni se copian archivos desde ahí sin pasar por el proceso de clasificación** de `02-ESTRATEGIA` §2.

---

## 2. Defectos P0 — impiden usar la base con clientes

### P0-01 · Autenticación validada en el navegador

**Fuente A.** `POSLogin.jsx` descargaba los usuarios activos con su credencial y comparaba el PIN en el cliente. `POSAuthContext.jsx` guardaba el objeto completo del usuario en `sessionStorage`.

**Corrección — F1.1.** `credenciales_pin` con Argon2id + pimienta del entorno. Endpoint `POST /api/auth/pin` con límite de intentos y bloqueo progresivo. Sesión en cookie `HttpOnly` `Secure` `SameSite=Lax`. **Ninguna consulta devuelve jamás el hash.** El frontend recibe sólo `{ empleoId, rol, nombre, sucursalId }` y no confía en eso para autorizar.

**Pruebas:** `AUTH-01` credencial válida → sesión con ámbito, sin secreto en la respuesta · `AUTH-02` credencial inválida repetida → rechazo, rate limit, auditoría, sin filtrar si el usuario existe · `AUTH-04` manipular la cookie o el storage no otorga privilegios · **prueba negativa:** ningún endpoint devuelve `pin_hash` (se verifica sobre el esquema de respuesta de todos los endpoints).

### P0-02 · No existe autorización real por rol

**Ambas fuentes.** En A, `RestrictedRoute` validaba el paquete comercial, no el rol; `permissions.js` filtraba el menú. En B había **dos** políticas por rol en toda la base y el comentario del SQL decía que el resto "vive en las API routes" — donde no estaban implementadas. Un cajero podía cerrar caja, cambiar precios y editar la configuración.

**Corrección — F1.1.** Tabla `permisos_rol` con acciones estables. El envoltorio `comando()` verifica el permiso **antes** de ejecutar. Las guardas de UI son comodidad visual y se marcan como tal en el código.

**Pruebas:** `AUTH-03` un cajero abre una URL administrativa → deniegan backend y UI · **prueba negativa generada automáticamente**: para cada comando registrado y cada rol sin permiso, la llamada devuelve 403 y no modifica nada. Se genera del registro de comandos, no se escribe a mano — una escrita a mano se olvida en el comando 40.

### P0-03 · Cobro e inventario no son una transacción

**Ambas fuentes.** En A, `Caja.jsx` marcaba la venta como pagada y **después** procesaba recetas, detalles, stock y movimientos, absorbiendo fallos con `catch(() => {})`. En B, el cobro online son 6+ llamadas sueltas desde el navegador; la RPC atómica existe pero sólo la usa el sync offline.

**Corrección — F1.2.** Comando `cobrarOrden`: **una sola transacción** que escribe orden + líneas + pagos + movimiento de caja + movimientos de stock + existencias + folio + auditoría + evento. O todo, o nada.

**Pruebas:** `SALE-01` venta válida → todo confirma junto · `SALE-02` **inyección de fallo**: se interrumpe el paso de stock a la mitad → no queda venta pagada, ni movimiento, ni folio consumido · `SALE-03` el mismo comando reintentado tres veces → un pago, una orden, un conjunto de movimientos.

### P0-04 · Totales que no corresponden a líneas persistidas

**Fuente A.** Si fallaba `DetalleVenta.create`, `Mesero.jsx` conservaba un objeto "shadow" en memoria, lo usaba para el total y seguía el flujo. La cuenta mostraba productos que no existían en la base.

**Corrección — F1.4.** Comando `enviarComanda` atómico con todas las líneas y clave de idempotencia. **Se elimina el concepto de línea shadow.** Si una línea no se persiste, la operación falla y la UI lo dice.

**Pruebas:** `TABLE-04` falla una línea del pedido → no se persisten totales ni comandas parciales · **invariante en producción:** alerta si existe una orden confirmada cuyo total no coincide con la suma de sus líneas.

### P0-05 · Mesa y venta pueden quedar huérfanas o duplicadas

**Fuente A.** `Mesero.jsx` creaba la venta y luego actualizaba la mesa, ignorando el fallo. El bloqueo vivía en memoria de una pantalla.

**Corrección — F1.4.** `mesas.venta_activa_id` se elimina del modelo. La orden activa se resuelve desde `ordenes` con índice parcial único: `unique (mesa_id) where estado not in ('pagada','cancelada')`. `abrirMesa` es transaccional con control de versión.

**Pruebas:** `TABLE-01` abrir mesa libre → mesa y orden en una transacción · `TABLE-02` **concurrencia real**: dos dispositivos abren la misma mesa a la vez → una sola orden activa, la otra recibe conflicto tipado.

### P0-06 · El flujo público QR confía en datos del cliente

**Fuente A.** `qrPedidoFlow.js` creaba una venta y después cancelaba las competidoras. Para producto variable usaba el `precio_venta` que llegaba del carrito del cliente.

**Corrección — F1.5.** API pública separada y estrecha: token con alcance y caducidad, rate limit, catálogo público mínimo, **precio recalculado en servidor** desde el catálogo vigente, comandos idempotentes, cero acceso a entidades internas.

**Pruebas:** `QR-01` token inválido, inactivo o caducado → no expone datos ni permite comando · `SALE-04` el cliente altera el precio → el servidor lo ignora y recalcula · `QR-03` doble envío → una sola orden, misma respuesta idempotente.

### P0-07 · Precios y totales calculados en el cliente

**Fuente B.** `subtotal`, `total`, `costo_total_snapshot`, `utilidad_bruta_snapshot` y `margen_snapshot` eran un `reduce` del carrito insertado verbatim. Incluso el camino "bueno" del RPC recibía `p_total` del cliente.

**Corrección — F1.2.** `cotizarOrden` calcula todo en servidor con `packages/domain`. `cobrarOrden` **recalcula y compara**: si el total que manda el cliente difiere del calculado, rechaza con `TOTAL_DESACTUALIZADO` y devuelve el correcto.

**Pruebas:** `SALE-04` (arriba) · unitarias de `calcularTotales` con IVA, descuento, mayoreo, producto variable y propina.

### P0-08 · Aislamiento por organización sin verificar

**Fuente B lo tenía por RLS; la Fuente A no lo tenía en absoluto.** Y `ajustarStock` en B actualizaba por `id` **sin filtrar por `negocio_id`**, dependiendo sólo de RLS.

**Corrección — F1.1.** `organizacion_id` en todas las tablas operativas, con índice compuesto donde es la primera columna. El ámbito viene **siempre** de la sesión del servidor. RLS se conserva como defensa en profundidad, nunca como mecanismo principal.

**Pruebas:** `TEN-01` **generada automáticamente**: para cada comando y cada consulta registrada, un usuario de la organización A intenta leer, escribir, exportar y adjuntar con IDs válidos de B → cero resultados, respuesta indistinguible de "no existe", auditoría registrada.

---

## 3. Defectos P1 — antes del primer cliente

| ID        | Defecto                                                    | Fuente | Corrección                                                                                                                                                  | Corte | Prueba                                                                                                                |
| --------- | ---------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| **P1-01** | 7 registros de configuración y `list()[0]`                 | A      | `configuracion` por secciones con `unique` por ámbito                                                                                                       | F1.1  | `CFG-01` devuelve exactamente una · `CFG-02` la segunda activa es rechazada por la restricción                        |
| **P1-03** | Stock read-then-write, `Math.max(0,…)` silencia sobreventa | ambas  | Ledger inmutable + decremento atómico `SET cantidad = cantidad - $1 WHERE … AND (cantidad >= $1 OR permite_venta_sin_stock)`. **Falla en vez de silenciar** | F1.3  | `INV-03` **concurrencia real**: dos ventas simultáneas del mismo SKU no pierden actualizaciones ni violan la política |
| **P1-04** | Relaciones duplicadas sin integridad                       | A      | FKs reales; `venta_activa_id` eliminado                                                                                                                     | F1.4  | Restricciones de esquema + reconciliador de invariantes                                                               |
| **P1-05** | Lint y tipos rojos (36 + 1,592)                            | A      | `strict: true`, cero `allowJs`, cero errores desde el primer commit (R19)                                                                                   | F1.0  | CI bloquea el merge                                                                                                   |
| **P1-06** | Sin pruebas ni CI                                          | ambas  | Pirámide mínima (A-29)                                                                                                                                      | F1.0  | El propio CI                                                                                                          |
| **P1-07** | 29 vulnerabilidades (8 altas en producción)                | A      | Dependencias nuevas, auditadas; se retiran las 7 sin uso confirmado                                                                                         | F1.0  | `npm audit` en CI bloquea altas explotables                                                                           |
| **P1-08** | Polling agresivo y respuestas fuera de orden               | ambas  | Realtime como notificación + revalidación; `version` monotónica                                                                                             | F1.2  | `KDS-04` un estado más viejo no reemplaza al nuevo                                                                    |
| **P1-09** | Folio con colisión probable                                | B      | Secuencia atómica `folios` con `UPDATE … RETURNING` en la transacción                                                                                       | F1.2  | Prueba de concurrencia: 100 ventas simultáneas, cero colisiones, cero huecos                                          |
| **P1-10** | Carrito se cierra al final → reintento duplica             | B      | El carrito **es** la orden en `borrador`; `cobrarOrden` la transiciona dentro de la transacción                                                             | F1.2  | `SALE-03`                                                                                                             |
| **P1-11** | Sync offline mapea todo pago a efectivo                    | B      | Tabla `pagos` con una fila por método                                                                                                                       | F1.2  | `CASH-03` pago mixto con propina: las sumas por método cuadran exactamente                                            |
| **P1-12** | No existe alta de empleados                                | B      | Pantalla `/empleados` + comando `crearEmpleo` con invitación                                                                                                | F1.1  | E2E: el dueño da de alta un cajero y el cajero entra con PIN                                                          |
| **P1-13** | `handleCobroFiado` pisa renglones del mismo producto       | B      | Consumo agrupado por producto con acumulador, en `domain`                                                                                                   | F1.3  | Unitaria: dos renglones del mismo producto suman, no se pisan                                                         |
| **P1-14** | Gate de suscripción desactivado y evadible                 | B      | Sale del núcleo (A-22)                                                                                                                                      | F1.0  | N/A — se elimina                                                                                                      |
| **P1-15** | Idempotencia del escáner remoto en memoria                 | B      | Columna `procesado_en` + `unique`                                                                                                                           | F1.2  | Recargar la pestaña con eventos ya aplicados no los reaplica                                                          |

---

## 4. Defectos de seguridad

| ID              | Defecto                                                                | Corrección                                                                                                        | Corte | Prueba                                                                       |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| **SEC-CREDS**   | Credencial por defecto en el bundle y auto-creación de administrador   | Enrolamiento inicial de un solo uso, con expiración. **Ninguna credencial heredada se importa como válida** (R32) | F1.1  | El bundle no contiene ninguna credencial; se verifica por escaneo en CI      |
| **SEC-XSS**     | `document.write` con HTML interpolado sin escape en la impresión de QR | Render seguro por componente; cero `document.write`. CSP sin `unsafe-inline`                                      | F1.5  | `SEC-01` un nombre de negocio o mesa con HTML se imprime como texto          |
| **SEC-UPLOAD**  | Validación de archivo sólo por MIME declarado por el navegador         | Allowlist por contenido real, re-codificación de imágenes, nombres generados, límites, origen aislado             | F1.1  | `FILE-01` archivo disfrazado o fuera de límites → rechazado                  |
| **SEC-HEADERS** | Sin CSP ni cabeceras de seguridad                                      | CSP, `nosniff`, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`                                        | F1.0  | Verificación de cabeceras en el smoke test                                   |
| **SEC-STORAGE** | Usuario completo en `sessionStorage`                                   | Cookie de sesión `HttpOnly`. `localStorage` sólo para preferencias no sensibles                                   | F1.1  | Auditoría de `localStorage`/`sessionStorage`: cero identificadores de sesión |
| **SEC-RLS**     | Buckets y políticas sin revisar con el mismo rigor que las tablas      | Buckets privados + URLs firmadas                                                                                  | F1.1  | Acceso anónimo a un archivo privado → denegado                               |

---

## 5. Deuda P2 — se corrige por construcción

| ID        | Deuda                                                           | Cómo se evita en MorphiqPOS                                |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| **P2-01** | Archivos monolíticos (`Caja.jsx` 81 KB, `venta/page.jsx` 62 KB) | Regla de 300 líneas por archivo, verificada por lint       |
| **P2-02** | Dinero con `Number` y folios con aleatorio                      | `bigint` en centavos + secuencia atómica                   |
| **P2-03** | Datos estructurados como texto JSON                             | Ajustes, exclusiones y modificadores normalizados a tablas |
| **P2-04** | 7 dependencias directas sin uso                                 | Sólo entra lo que se usa; auditoría de dependencias en CI  |
| **P2-05** | Código legado y placeholders                                    | No se portan (`01-ANALISIS` §2.4)                          |
| **P2-06** | Build permisivo con lint y tipos rojos                          | CI bloquea el merge                                        |
| **P2-07** | Tres sistemas de toast conviviendo                              | Sólo `sonner`                                              |
| **P2-08** | Query keys inline y dispersas                                   | Factory centralizada en F1.0                               |
| **P2-09** | Mezcla `.jsx`/`.tsx` deliberada                                 | Todo `.tsx` estricto                                       |
| **P2-10** | Totales agregados duplicados en `cortes_caja`                   | Se derivan de `pagos` y `movimientos_caja`                 |

---

## 6. Comportamiento que SÍ se conserva

Para que la corrección no se lleve por delante lo que costó descubrir. Esto va a la **matriz de conservación** y se prueba igual que los defectos.

**De la Fuente A:** propina separada por método y su liquidación · productos por medida variable y por porción de contenedor · estaciones de preparación y ruteo por categoría · exclusiones "SIN" capturadas en mesero y visibles en cocina · precuenta que no marca la orden como pagada · corte con diferencia auditada · modificadores con grupos obligatorios y de selección múltiple · alertas por voz en cocina · mapa de mesas con zonas, formas y posiciones · valoración del comensal · importación y exportación CSV con plantillas.

**De la Fuente B:** código de barras con las tres vías de escaneo · el flujo "código no encontrado" → crear producto o asignar código a uno existente · dedupe de 1,200 ms por código · retroalimentación de audio con desbloqueo explícito · escáner remoto por teléfono · báscula por Web Serial y venta por peso · precio de mayoreo por volumen · fiado con límite de crédito · conteo de inventario contra merma · historial de precios por trigger · devoluciones con retorno opcional a inventario · combos · compras con conversión caja→pieza · vista cliente en segundo monitor · alta de tenant atómica con rollback compensatorio.

**Prueba de conservación:** cada punto de esta lista tiene un escenario en `13-PRUEBAS-Y-DEFINICION-DE-TERMINADO.md`. Si un escenario de conservación falla, **se perdió una función** — y eso es tan grave como un defecto nuevo.

---

## 7. Cómo se reporta el avance

En `BITACORA.md`, al cerrar cada defecto:

```
## P0-03 · Cobro no transaccional
- Corte: F1.2 · Tarea: F1.2-T11 · Fecha: ____
- Corrección: comando cobrarOrden con transacción única e idempotencia
- Pruebas que lo cierran: SALE-01 ✅ · SALE-02 ✅ · SALE-03 ✅
- Verificado con: falla al quitar la transacción ✅
- Riesgo residual: ninguno / ____
```

**El campo "verificado con" no es opcional.** Una prueba que pasa igual con y sin la corrección no prueba nada. Se comprueba quitando la corrección temporalmente y confirmando que la prueba falla.
