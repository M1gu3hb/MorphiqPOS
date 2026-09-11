# F1-06 · Catches y errores: inventario del silencio

Fecha: 9 de septiembre de 2026
Árbol auditado: `apps/web/heredado/` — 237 archivos `.js/.jsx/.ts/.tsx`.
Contraste: `historico/restaurante/src/` (el original de Miguel), para verificar que el porteo no cambió ningún `catch`.

> Este documento cuenta y clasifica **todos** los `catch` vacíos o degradantes del código heredado. No es un muestreo. Cada fila se leyó en su contexto.

---

## 1. El resumen, en números

| | Cuántos |
|---|---|
| Catches vacíos o con valor de relleno, en total | **188** |
| Se tragan una **escritura** | **44** |
| Se tragan una **lectura que decide** algo | **59** |
| Lectura de adorno | **5** |
| Degradación legítima (sonido, voz, `localStorage`, DOM…) | **80** |
| **Se quitan** | **108** |
| **Se quedan** | **80** |

El plan (`F1-02` §7) dice: *«Los 24 `catch(() => {})` de Caja, POS y Mesero desaparecen. Los otros 92 (sonido, voz, localStorage) se quedan.»*

Los 24 son correctos. Los 92 no. **Y faltan 60 que el plan no contó en absoluto**: los `.catch(() => [])` y `.catch(() => null)`, que son peores que los vacíos porque no dejan un hueco: **inventan un dato falso y el programa sigue creyéndoselo.** El detalle está en §3.

---

## 2. Cómo se contó (reproducible)

Un escáner línea por línea sobre `apps/web/heredado/`, que reconoce las tres formas y sus variantes con espacios, con `_`, con parámetro nombrado, con cuerpo de comentario y **partidas en dos o tres líneas por el formateador**:

```
.catch(() => {})   .catch(()=>{})   .catch((e) => {})   .catch(_ => {})
.catch(() => [])   .catch(() => null)   .catch(() => false)
catch {}           catch (e) {}     catch (_) { /* ignore */ }   catch { /* no-op */ }
```

Se buscó también con ripgrep en modo multilínea (`rg -U`) como control cruzado. **Aviso para quien repita esto:** `rg -U -o` reporta números de línea desviados en archivos con varias coincidencias multilínea — en `api/cliente.ts` dijo `219` donde el `catch` está en `226`. Los números de este documento son los del escáner, verificados uno por uno con `grep -n`.

Cuatro `catch` quedan partidos por el formateador y se citan por la línea donde empieza el `.catch(`: `pages/POS.jsx:354`, `pages/POS.jsx:405`, `pages/Cocina.jsx:232`, `pages/Cocina.jsx:273`.

### El árbol heredado es idéntico al original

| | `historico/restaurante/src/` | `apps/web/heredado/` |
|---|---|---|
| Total | 186 | 188 |
| Relleno `{}` | 128 | 128 |
| Relleno `[]` | 50 | 50 |
| Relleno `null` | 8 | 10 |

Las dos diferencias son código nuevo, no heredado: `api/cliente.ts:95` y `api/cliente.ts:226` (el puente). **El porteo no introdujo ni quitó un solo `catch`.** Eso es bueno: lo que se arregle aquí se arregla contra el original.

---

## 3. Los conteos reales contra los del plan

### 3.1 Los 24 de Caja, POS y Mesero: correctos

| Archivo | Total de catches degradantes | De ellos, relleno `{}` |
|---|---|---|
| `pages/Caja.jsx` | 15 | **11** |
| `pages/POS.jsx` | 7 | **7** |
| `pages/Mesero.jsx` | 11 | **6** |
| | **33** | **24** |

Los 24 del plan son exactamente los de relleno `{}`. `F1-01` D-08 (11 · 7 · 6) cuadra al archivo.

**De esos 24:**
- **18 se tragan una escritura.** Caja 8, POS 7, Mesero 3.
- **5 son `refetchQueries` de react-query.** `Caja.jsx:953`, `Caja.jsx:1025`, `Caja.jsx:1026`, `Mesero.jsx:772`, `Mesero.jsx:983`. Degradación legítima: refrescar una caché no puede corromper nada.
- **1 es un bloque `catch {}` sobre una lectura que decide:** `Mesero.jsx:851`.

### 3.2 La auditoría previa dijo 23. Le faltó una

La auditoría previa contó **23** (18 escrituras + 5 `refetchQueries`). Le faltó `pages/Mesero.jsx:851`, que es `} catch {}` en bloque y no `.catch(() => {})` en flecha. Es el `catch` que envuelve la relectura de la venta fresca en `pedirCuenta` (`Mesero.jsx:843-851`) — el guardia anti-doble-solicitud. No es una escritura: es una lectura que decide. Por eso 24, no 23.

### 3.3 Los 92 del plan: son 104

| | Real |
|---|---|
| Relleno `{}` fuera de Caja/POS/Mesero | **104** |
| El plan dijo | 92 |
| Diferencia | **12** |

De dónde salen los 12: el conteo del plan sólo reconoció la forma estricta `catch {}` y `.catch(() => {})` en una línea. Dejó fuera doce `catch` igual de vacíos que usan un parámetro o un cuerpo de comentario. Verificado contra `historico/restaurante/src/`, donde la reconstrucción es exacta: 24 + 92 = 116 con la forma estricta, y estos doce son el resto:

| # | Dónde (en `heredado/`) | Forma |
|---|---|---|
| 1 | `components/caja/AbrirCajaDialog.jsx:48` | `catch (_) {}` |
| 2 | `components/common/MobileAdminRadialMenu.jsx:207` | `catch (_) { /* ignore */ }` |
| 3 | `components/common/MobileAdminRadialMenu.jsx:235` | `catch (_) { /* ignore */ }` |
| 4 | `components/common/SafeBoundary.jsx:25` | `catch (_) {}` |
| 5 | `components/common/SafeBoundary.jsx:33` | `catch (_) {}` |
| 6 | `components/pos/PaymentModal.jsx:44` | `catch (_) {}` |
| 7 | `lib/brandColors.js:147` | `catch { /* no-op */ }` |
| 8 | `lib/sounds.jsx:76` | `catch { /* no-op */ }` |
| 9 | `lib/useRouteCleanup.js:30` | `catch { // Silencioso }` |
| 10 | `pages/Registros.jsx:70` | `catch (_) { /* noop */ }` |
| 11 | `pages/Registros.jsx:84` | `catch (_) { /* noop */ }` |
| 12 | `pages/POSLogin.jsx:39` (sólo en el ZIP; en `heredado/` la pantalla se reescribió) | `catch {}` |

Los doce son degradación legítima. **El conteo estaba mal; la conclusión no.** Se quedan.

### 3.4 Los 60 que el plan no contó

| Relleno | Cuántos | Qué son |
|---|---|---|
| `.catch(() => [])` | **50** | Lecturas que devuelven "lista vacía" cuando no se pudo leer |
| `.catch(() => null)` | **10** | Lecturas que devuelven "no existe" cuando no se pudo leer |

Ninguno aparece en `F1-02` §7. Y son la parte peligrosa: un `catch(() => {})` sobre una escritura pierde un dato; un `.catch(() => [])` sobre una lectura **fabrica una respuesta falsa que el código de al lado usa para decidir**. Cierra el día. Borra el ingrediente. Crea el duplicado. Pone la cuenta en cero.

La auditoría previa halló **4** de estos sobre lecturas en Caja/POS/Mesero. Son 4 en `Caja.jsx` (`281`, `288`, `317`, `1160`) — pero en `Mesero.jsx` hay **3 más** con `[]` (`300`, `859`, `860`) y **2** con `null` (`298`, `844`), más el bloque `851`. **En las tres pantallas son 10, no 4.**

### 3.5 Corrección propuesta a la regla del plan

> Se sustituye: *«Los 24 `catch(() => {})` de Caja, POS y Mesero desaparecen. Los otros 92 (sonido, voz, localStorage) se quedan.»*
>
> Por: **«De los 188 catch degradantes de `heredado/`, desaparecen 108: las 44 escrituras, las 59 lecturas que deciden y las 5 de adorno. Se quedan 80: sonido, voz, `localStorage`/`sessionStorage`, DOM, foco, límites de error y refrescos de caché.»**

---

## 4. Tabla completa · los 188

Categorías:
- **escritura** — el `catch` envuelve un `create` / `update` / `delete`.
- **lectura que decide** — el `catch` envuelve una lectura cuyo resultado gobierna una decisión: bloquear o dejar pasar, duplicar o no, cuánto cobrar, qué imprimir, qué borrar.
- **lectura de adorno** — el `catch` envuelve una lectura que sólo pinta.
- **degradación legítima** — no puede corromper nada: audio, voz, almacenamiento local, DOM, foco, caché de react-query.

---

### 4.1 `pages/Caja.jsx` — 15

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `pages/Caja.jsx:281` | `Venta.filter({estado:'cuenta_solicitada'})` | lectura que decide | La lista de candidatas queda coja. El cajero teclea el folio y lee «No se encontró una venta con ese folio» (`:312`) | **SE QUITA** |
| `pages/Caja.jsx:288` | `Venta.list('-created_date', 5000)` | lectura que decide | Igual: la venta existe, la búsqueda dice que no | **SE QUITA** |
| `pages/Caja.jsx:317` | `DetalleVenta.filter({venta_id})` | lectura que decide | La cuenta se abre en Caja **sin líneas**. `sumarSubtotalDetalles` da 0 y el cajero ve una cuenta en $0.00 | **SE QUITA** |
| `pages/Caja.jsx:462` | `Mesa.update({estado:'libre', venta_activa_id:null, …})` | escritura | El ticket en cero se cancela, la mesa se queda ocupada con un `venta_activa_id` que apunta a una venta cancelada. Mesa huérfana | **SE QUITA** |
| `pages/Caja.jsx:782` | `DetalleVenta.update({costo_total_linea_snapshot, …})` | escritura | El costo recalculado de la línea variable no se persiste. El snapshot de trazabilidad queda con el costo viejo | **SE QUITA** |
| `pages/Caja.jsx:846` | `Venta.update({costo_total_snapshot, utilidad_bruta_snapshot, margen_snapshot})` | escritura | La venta queda con costo y margen desactualizados. El corte los suma mal | **SE QUITA** |
| `pages/Caja.jsx:861` | `Ingrediente.update({stock_actual})` | escritura | **El stock no baja.** La venta ya está `pagada` (`:672`) | **SE QUITA** |
| `pages/Caja.jsx:880` | `MovimientoInventario.create(salida_venta)` | escritura | No queda rastro del consumo. El ledger tiene un hueco | **SE QUITA** |
| `pages/Caja.jsx:897` | `DescuentoInventarioVenta.create(...)` | escritura | «Consumido hoy» en Inventario y el desglose del corte pierden esa línea | **SE QUITA** |
| `pages/Caja.jsx:923` | `Mesa.update({estado:'limpieza', venta_activa_id:null, …})` | escritura | Se cobró la mesa y sigue marcada como ocupada. Ese es el bloqueo del cierre del día | **SE QUITA** |
| `pages/Caja.jsx:953` | `queryClient.refetchQueries(['ventas_pendientes_caja'])` | degradación legítima | El badge tarda un ciclo de polling en bajar | SE QUEDA |
| `pages/Caja.jsx:1025` | `queryClient.refetchQueries(['cortes'])` | degradación legítima | Ídem | SE QUEDA |
| `pages/Caja.jsx:1026` | `queryClient.refetchQueries(['ventas_hoy'])` | degradación legítima | Ídem | SE QUEDA |
| `pages/Caja.jsx:1160` | `obtenerMesasPendientesCierre()` | lectura que decide | **El guardia anti-carrera del cierre del día.** Si la lectura falla devuelve `[]`, `pendientesFinales.length` es 0, y la caja se cierra con mesas abiertas | **SE QUITA** |
| `pages/Caja.jsx:1211` | `Venta.update({corte_caja_id})` | escritura | Ventas pagadas que se quedan sin corte. No salen en el PDF ni cuadran con el efectivo | **SE QUITA** |

Subtotal: 8 escrituras · 4 lecturas que deciden · 3 legítimas.

---

### 4.2 `pages/POS.jsx` — 7

Las siete están dentro de `handlePayment`, **después** de que la venta ya se creó y se marcó cobrada.

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `pages/POS.jsx:354` | `Ingrediente.update({stock_actual})` — línea variable | escritura | El ingrediente base no se descuenta. Se cobró el producto por peso y el stock sigue igual | **SE QUITA** |
| `pages/POS.jsx:373` | `MovimientoInventario.create(salida_venta)` — variable | escritura | Sin rastro en el ledger | **SE QUITA** |
| `pages/POS.jsx:387` | `DescuentoInventarioVenta.create(...)` — variable | escritura | Sin desglose de consumo | **SE QUITA** |
| `pages/POS.jsx:405` | `Ingrediente.update({stock_actual})` — precio fijo | escritura | El stock de receta no baja | **SE QUITA** |
| `pages/POS.jsx:424` | `MovimientoInventario.create(salida_venta)` — precio fijo | escritura | Sin rastro. Además guarda `cantidad` **positiva** aquí y negativa en Caja (D-10) | **SE QUITA** |
| `pages/POS.jsx:438` | `DescuentoInventarioVenta.create(...)` — precio fijo | escritura | Sin desglose | **SE QUITA** |
| `pages/POS.jsx:462-469` | **`PedidoPreparacion.create({venta_id, area, items})`** | escritura | **El pedido nunca llega a cocina.** El cajero cobró, el ticket salió, el toast dice «Venta cobrada» (`:498`). En la pantalla de cocina no hay nada | **SE QUITA** |

Subtotal: 7 escrituras.

---

### 4.3 `pages/Mesero.jsx` — 11

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `pages/Mesero.jsx:298` | `Venta.get(mesa.venta_activa_id)` | lectura que decide | `venta` = `null` → `setVentaActiva(null)`. La mesa ocupada se abre como si no tuviera cuenta | **SE QUITA** |
| `pages/Mesero.jsx:300` | `DetalleVenta.filter({venta_id})` | lectura que decide | La cuenta de la mesa aparece vacía. El mesero cree que no se ha pedido nada | **SE QUITA** |
| `pages/Mesero.jsx:368` | `Mesa.update({estado, venta_activa_id, personas_actuales, …})` | escritura | **La venta se creó y la mesa no quedó ligada.** Mesa huérfana: `estado != libre` y sin `venta_activa_id` (D-16). El toast dice «Mesa N abierta» (`:377`) | **SE QUITA** |
| `pages/Mesero.jsx:766` | `Mesa.update({estado:'pedido_enviado', venta_activa_id})` | escritura | El pedido salió a cocina y la mesa no cambia de estado. El mapa de mesas miente | **SE QUITA** |
| `pages/Mesero.jsx:772` | `queryClient.refetchQueries(['pedidos_cocina'])` | degradación legítima | Cocina tarda un ciclo en verlo | SE QUEDA |
| `pages/Mesero.jsx:844` | `Venta.get(ventaRef.id)` | lectura que decide | Guardia anti-doble-solicitud de cuenta. Si falla, `ventaFresca` = `null` y se genera una segunda solicitud con otro código de caja | **SE QUITA** |
| `pages/Mesero.jsx:851` | bloque `catch {}` sobre esa misma relectura | lectura que decide | Cierra el mismo agujero por arriba, con la misma consecuencia | **SE QUITA** |
| `pages/Mesero.jsx:859` | `DetalleVenta.filter({venta_id})` | lectura que decide | Decide si hay consumo antes de pedir la cuenta. `[]` → «Esta mesa aún no tiene productos enviados a cocina» (`:872`) con la mesa llena | **SE QUITA** |
| `pages/Mesero.jsx:860` | `PedidoPreparacion.filter({venta_id})` | lectura que decide | Ídem | **SE QUITA** |
| `pages/Mesero.jsx:977` | `Mesa.update({estado:'cuenta_solicitada'})` | escritura | La venta pasa a `cuenta_solicitada` y la mesa no. Caja y el mapa de mesas discrepan | **SE QUITA** |
| `pages/Mesero.jsx:983` | `queryClient.refetchQueries(['ventas_pendientes_caja'])` | degradación legítima | Caja tarda un ciclo en verlo | SE QUEDA |

Subtotal: 3 escrituras · 6 lecturas que deciden · 2 legítimas.

---

### 4.4 `pages/Cocina.jsx` — 6

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `pages/Cocina.jsx:232` | `Mesa.update({estado:'en_preparacion'})` | escritura | Cocina empezó y la mesa no lo refleja. El mesero no lo ve | **SE QUITA** |
| `pages/Cocina.jsx:238` | `queryClient.refetchQueries(['pedidos_cocina'])` | degradación legítima | Un ciclo de retraso | SE QUEDA |
| `pages/Cocina.jsx:265` | `PedidoPreparacion.filter({venta_id})` | lectura que decide | Decide si **todas** las estaciones terminaron. `[]` → `otrosActivos.length === 0` → la mesa se marca lista con la otra estación todavía cocinando | **SE QUITA** |
| `pages/Cocina.jsx:273` | `Mesa.update({estado:'en_espera_entrega'})` | escritura | El pedido está listo y la mesa no avisa. Se enfría en el pase | **SE QUITA** |
| `pages/Cocina.jsx:283` | `queryClient.refetchQueries(['pedidos_cocina'])` | degradación legítima | Un ciclo de retraso | SE QUEDA |
| `pages/Cocina.jsx:315` | `queryClient.refetchQueries(['pedidos_cocina'])` | degradación legítima | Un ciclo de retraso | SE QUEDA |

---

### 4.5 `pages/PortalCliente.jsx` — 7

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `pages/PortalCliente.jsx:178` | `SolicitudQR.get(solicitudActivaId)` | lectura de adorno | El aviso «un mesero viene en camino» nunca cambia a atendida | **SE QUITA** |
| `pages/PortalCliente.jsx:183` | bloque `catch {}` sobre ese sondeo | lectura de adorno | Ídem | **SE QUITA** |
| `pages/PortalCliente.jsx:215` | `Venta.filter({mesa_id})` | lectura que decide | `[]` → `ventaActivaMesa = null`. El comensal cree que la mesa está libre y abre una segunda cuenta | **SE QUITA** |
| `pages/PortalCliente.jsx:238` | bloque `catch {}` sobre ese `checkVenta` | lectura que decide | Además se pierde el disparo automático de la pantalla de propina | **SE QUITA** |
| `pages/PortalCliente.jsx:262` | `DetalleVenta.filter({venta_id})` | lectura que decide | El comensal ve su cuenta en $0.00 desde el teléfono | **SE QUITA** |
| `pages/PortalCliente.jsx:566` | `SolicitudQR.filter({mesa_id, tipo, estado:'pendiente'})` | lectura que decide | Anti-duplicado. `[]` → se crea otra solicitud. El mesero recibe la misma llamada dos veces | **SE QUITA** |
| `pages/PortalCliente.jsx:629` | `e.currentTarget.style.display = 'none'` (logo roto) | degradación legítima | Se ve una imagen rota | SE QUEDA |

---

### 4.6 `utils/qrPedidoFlow.js` — 9

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `utils/qrPedidoFlow.js:32` | `Venta.filter({mesa_id})` en `findVentaActivaMesa` | lectura que decide | La función que existe para ser «fuente de verdad» (comentario en `:27`) devuelve `null`. Se abre una segunda venta en una mesa que ya tenía una | **SE QUITA** |
| `utils/qrPedidoFlow.js:111` | `Venta.filter({mesa_id})` — anti-carrera 2 | lectura que decide | El detector de duplicados no ve nada. Quedan dos ventas activas en la misma mesa | **SE QUITA** |
| `utils/qrPedidoFlow.js:128` | `Venta.update({estado:'cancelada', motivo:'duplicado_apertura_qr'})` | escritura | La venta perdedora no se cancela. Dos cuentas vivas en una mesa | **SE QUITA** |
| `utils/qrPedidoFlow.js:137` | `Venta.update({estado:'cancelada', …})` (las tardías) | escritura | Ídem | **SE QUITA** |
| `utils/qrPedidoFlow.js:171` | `ProductoTerminado.get(productoId)` | lectura que decide | `null` → `{ok:false, motivo:'no_existe'}`. Al comensal se le dice «Estos productos ya no están disponibles» (`:302`) por un fallo de red | **SE QUITA** |
| `utils/qrPedidoFlow.js:269` | `ConfiguracionNegocio.list()` | lectura que decide | `config = null` → estaciones apagadas → el pedido entero va a la cocina genérica en vez de a la barra | **SE QUITA** |
| `utils/qrPedidoFlow.js:281` | `CategoriaProducto.filter({activo:true})` | lectura que decide | Ruteo por estación sin categorías: todo cae al fallback | **SE QUITA** |
| `utils/qrPedidoFlow.js:288` | `EstacionPreparacion.filter({activo:true})` | lectura que decide | Ídem. El `try/catch` de `:291` es código muerto: el `.catch` interno ya se comió el rechazo | **SE QUITA** |
| `utils/qrPedidoFlow.js:370` | `DetalleVenta.filter({venta_id})` para re-totalizar | lectura que decide | **`subtotal` = 0 y `Venta.update({total: 0})` en `:380-387`.** El pedido del QR queda cobrable en $0.00. El `catch` de `:372` que restauraba `nuevosDetalles` nunca se ejecuta | **SE QUITA** |

---

### 4.7 `components/portalqr/` — 12

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/portalqr/MenuQRTab.jsx:97` | `e.target.value = ''` tras subir imagen | degradación legítima | No se puede resubir el mismo archivo sin recargar | SE QUEDA |
| `components/portalqr/MesasQRTab.jsx:49` | `Mesa.update({qr_token})` | escritura | Toast «Tokens generados (N)» (`:53`) aunque no se generara ninguno. Esas mesas se quedan sin QR | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:88` | `DetalleVenta.filter({venta_id})` (sondeo) | degradación legítima | El guardia `if (arr.length > 0)` de `:93` conserva lo anterior. Desaparece con el canal en vivo | SE QUEDA |
| `components/portalqr/PedirCuentaQR.jsx:124` | `Venta.filter({mesa_id})` | lectura que decide | `[]` → sin venta activa. Cae al `ventaHint` del padre o deja al comensal sin cuenta | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:149` | `DetalleVenta.filter({venta_id})` | lectura que decide | La cuenta que el comensal ve antes de elegir propina sale incompleta | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:276` | `SolicitudQR.filter({estado:'pendiente'})` | lectura que decide | Anti-duplicado. `[]` → segunda solicitud de cuenta para la misma mesa | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:341` | `Venta.update({estado:'cuenta_solicitada'})` | escritura | **El comensal ve «cuenta solicitada» y Caja nunca la recibe.** `setEnviado(true)` en `:362` pasa igual | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:348` | `Mesa.update({estado:'cuenta_solicitada'})` | escritura | El mapa de mesas no marca la mesa | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:357` | `queryClient.refetchQueries(['ventas_pendientes_caja'])` | degradación legítima | Un ciclo de retraso | SE QUEDA |
| `components/portalqr/SolicitudesQRTab.jsx:73` | `SolicitudQR.list('-created_date', 500)` | lectura que decide | «Vaciar el día» sobre `[]`: dice «Solicitudes borradas: 0» y no borró nada | **SE QUITA** |
| `components/portalqr/SolicitudesQRTab.jsx:79` | `SolicitudQR.delete(s.id)` | escritura | Las que fallan no se cuentan como fallidas. El total sale bajo sin explicación | **SE QUITA** |
| `components/portalqr/ValoracionEmoji.jsx:41` | `Venta.get(ventaId)` | lectura que decide | `null` → `yaValorada` queda en falso. El comensal valora dos veces la misma venta | **SE QUITA** |

---

### 4.8 `components/cortes/` — 12

Las doce alimentan el mismo cálculo: el reporte de corte que se imprime y se manda a contabilidad.

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/cortes/CorteAutoDownloader.jsx:36` | `Venta.list('-fecha_cierre', 2000)` | lectura que decide | El PDF del corte se genera **sin ventas**. Totales en cero, y se descarga solo | **SE QUITA** |
| `components/cortes/CorteAutoDownloader.jsx:37` | `GastoOperativo.list(500)` | lectura que decide | Gastos en cero → utilidad neta inflada | **SE QUITA** |
| `components/cortes/CorteAutoDownloader.jsx:38` | `DescuentoInventarioVenta.list(3000)` | lectura que decide | Consumo de inventario en cero → costo en cero → margen del 100 % | **SE QUITA** |
| `components/cortes/CorteAutoDownloader.jsx:39` | `Ingrediente.list()` | lectura que decide | Sin catálogo, el desglose por insumo desaparece | **SE QUITA** |
| `components/cortes/CorteAutoDownloader.jsx:40` | `RecetaEscandallo.list(2000)` | lectura que decide | Sin recetas, el costeo de precio fijo se pierde | **SE QUITA** |
| `components/cortes/CorteAutoDownloader.jsx:69` | `DetalleVenta.filter({venta_id})` por venta | lectura que decide | El desglose por producto sale incompleto, venta a venta y en silencio | **SE QUITA** |
| `components/cortes/CorteViewerDialog.jsx:41` | `Venta.list('-fecha_cierre', 2000)` | lectura que decide | El corte en pantalla muestra ceros | **SE QUITA** |
| `components/cortes/CorteViewerDialog.jsx:42` | `GastoOperativo.list(500)` | lectura que decide | Ídem | **SE QUITA** |
| `components/cortes/CorteViewerDialog.jsx:43` | `DescuentoInventarioVenta.list(3000)` | lectura que decide | Ídem | **SE QUITA** |
| `components/cortes/CorteViewerDialog.jsx:44` | `Ingrediente.list()` | lectura que decide | Ídem | **SE QUITA** |
| `components/cortes/CorteViewerDialog.jsx:45` | `RecetaEscandallo.list(2000)` | lectura que decide | Ídem | **SE QUITA** |
| `components/cortes/CorteViewerDialog.jsx:76` | `DetalleVenta.filter({venta_id})` por venta | lectura que decide | Ídem | **SE QUITA** |

---

### 4.9 `components/datos/` y `utils/importExecutors.js` — 8

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/datos/ImportarDatosDialog.jsx:109` | `Ingrediente.list(5000)` (snapshot para validar) | lectura que decide | El validador del dry-run compara contra un catálogo vacío: **todas las filas parecen nuevas** y la importación crea duplicados | **SE QUITA** |
| `components/datos/ImportarDatosDialog.jsx:114` | `ProductoTerminado.list(5000)` | lectura que decide | Ídem, para productos | **SE QUITA** |
| `components/datos/ImportarDatosDialog.jsx:115` | `CategoriaProducto.filter({activo:true})` | lectura que decide | Todas las categorías parecen faltantes; se crean de nuevo | **SE QUITA** |
| `components/datos/ImportarDatosDialog.jsx:121` | `Ingrediente.list(5000)` (recetas) | lectura que decide | Toda línea de receta se marca «ingrediente inexistente» | **SE QUITA** |
| `components/datos/ImportarDatosDialog.jsx:122` | `ProductoTerminado.list(5000)` (recetas) | lectura que decide | Ídem con el producto | **SE QUITA** |
| `components/datos/ImportarDatosDialog.jsx:127` | `Proveedor.list(5000)` | lectura que decide | Proveedores duplicados | **SE QUITA** |
| `utils/importExecutors.js:319` | `ProductoTerminado.get` + `update({costo_calculado_actual, utilidad_bruta_actual, margen_bruto_actual})` | escritura | El producto queda con el costo viejo tras importar su receta. Es D-09 escrito a mano | **SE QUITA** |
| `utils/importExecutors.js:328` | `RecetaEscandallo.delete(idCreado)` (rollback) | escritura | El rollback falla y nadie se entera. Quedan líneas de receta a medias | **SE QUITA** |

---

### 4.10 `components/inventario/` y `pages/Inventario.jsx` — 11

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `pages/Inventario.jsx:179` | `MovimientoInventario.filter({ingrediente_id})` | lectura que decide | `[]` → `movs.length > 0` es falso → **`Ingrediente.delete(ing.id)` en `:188`.** Borrado físico de un insumo con historial. Rompe la regla 8 de `F1-01` §3 | **SE QUITA** |
| `components/inventario/AjustarStockDialog.jsx:159` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/inventario/AjustarStockDialog.jsx:277` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/inventario/AjustarStockDialog.jsx:286` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/inventario/AjustarStockDialog.jsx:302` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/inventario/AjustarStockDialog.jsx:319` | `Ingrediente.update({stock_actual: stockAnteriorRef})` — **rollback** | escritura | El rollback falla y el toast sólo dice «Error al ajustar stock» (`:321`). El stock queda con el ajuste aplicado y sin movimiento que lo respalde | **SE QUITA** |
| `components/inventario/AjustarStockDialog.jsx:324` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/inventario/IngredienteContenedorDialog.jsx:152` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/inventario/RegistrarInventarioInicialDialog.jsx:172` | `Ingrediente.list(5000)` (base antiduplicado) | lectura que decide | Cae a la lista de sólo activos. El inventario inicial crea un insumo duplicado del que estaba inactivo | **SE QUITA** |
| `components/inventario/RegistrarInventarioInicialDialog.jsx:321` | `Ingrediente.update({activo:false})` — 2º intento de limpieza | escritura | Queda un ingrediente huérfano activo, con stock, sin movimiento. Sólo se reporta a la consola (`:324`) | **SE QUITA** |
| `components/inventario/RegistrarInventarioInicialDialog.jsx:366` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |

---

### 4.11 `components/compras/` — 5

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/compras/PlantillasGastoSection.jsx:128` | `PlantillaGasto.update({ultima_fecha_uso, veces_usada})` | escritura | El gasto se registra y la plantilla no cuenta el uso. Las más usadas dejan de subir en la lista | **SE QUITA** |
| `components/compras/RegistrarCompraDialog.jsx:206` | `Ingrediente.list(5000)` (base antiduplicado) | lectura que decide | Se crea un insumo nuevo que duplica uno inactivo. La compra carga el costo en el sitio equivocado | **SE QUITA** |
| `components/compras/RegistrarCompraDialog.jsx:407` | `PlantillaCompra.create(...)` | escritura | El usuario marcó «guardar como plantilla», la compra se guarda, la plantilla no. Sin aviso | **SE QUITA** |
| `components/compras/RepetirCompraDialog.jsx:61` | `CompraInsumo.list(60)` | lectura de adorno | El diálogo aparece vacío: «no hay compras previas» cuando sí las hay | **SE QUITA** |
| `components/compras/RepetirCompraDialog.jsx:62` | `PlantillaCompra.filter({activa:true})` | lectura de adorno | Ídem con las plantillas | **SE QUITA** |

---

### 4.12 `components/mesero/` — 13

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/mesero/AlertasMeseroDialog.jsx:56` | `getCurrentVoiceInfo(...)` | degradación legítima | No se muestra qué voz está activa | SE QUEDA |
| `components/mesero/AlertasMeseroDialog.jsx:65` | `getCurrentVoiceInfo(...)` al cambiar idioma | degradación legítima | Ídem | SE QUEDA |
| `components/mesero/AlertasMeseroDialog.jsx:91` | `speechSynthesis.speak(utterance vacía)` | degradación legítima | El audio no se desbloquea en ese dispositivo | SE QUEDA |
| `components/mesero/AlertasMeseroDialog.jsx:99` | `playNewOrder()` | degradación legítima | El botón «probar» no suena | SE QUEDA |
| `components/mesero/ListosParaRecogerCard.jsx:163` | `queryClient.refetchQueries(['pedidos_cocina'])` | degradación legítima | Un ciclo de retraso | SE QUEDA |
| `components/mesero/ListosParaRecogerCard.jsx:166` | `queryClient.refetchQueries(['pedidos_listos_mesero'])` | degradación legítima | Ídem | SE QUEDA |
| `components/mesero/ListosParaRecogerCard.jsx:167` | `queryClient.refetchQueries(['mesas'])` | degradación legítima | Ídem | SE QUEDA |
| `components/mesero/SolicitudesQRCardList.jsx:74` | `Mesa.get(s.mesa_id)` | lectura que decide | `null` → no se auto-asigna el mesero que atendió. La mesa queda sin dueño | **SE QUITA** |
| `components/mesero/SolicitudesQRCardList.jsx:80` | `Mesa.update({atendido_por_id, atendido_por_nombre, atendido_por_color})` | escritura | Ídem, y la propina de esa mesa no se le atribuye a nadie | **SE QUITA** |
| `components/mesero/SolicitudesQRCardList.jsx:83` | bloque `catch {}` sobre el `get` + `update` | escritura | Cierra el mismo agujero por arriba | **SE QUITA** |

`components/mesero/SolicitudesQRPanel.jsx` es el mismo componente en versión panel; sus tres `catch` son idénticos:

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/mesero/SolicitudesQRPanel.jsx:75` | `Mesa.get(s.mesa_id)` | lectura que decide | Igual que `SolicitudesQRCardList.jsx:74` | **SE QUITA** |
| `components/mesero/SolicitudesQRPanel.jsx:81` | `Mesa.update({atendido_por_*})` | escritura | Igual que `:80` | **SE QUITA** |
| `components/mesero/SolicitudesQRPanel.jsx:84` | bloque `catch {}` | escritura | Igual que `:83` | **SE QUITA** |

---

### 4.13 `components/configuracion/` y `pages/Configuracion.jsx` — 10

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/configuracion/EstacionesPreparacionSection.jsx:145` | `EstacionPreparacion.list()` (antiduplicado) | lectura que decide | Se crea una segunda estación con el mismo nombre. Los pedidos se parten entre las dos | **SE QUITA** |
| `components/configuracion/EstacionesPreparacionSection.jsx:179` | `CategoriaProducto.update({estacion_preparacion_nombre, _color})` | escritura | Las categorías conservan el nombre y el color viejos de la estación. Los badges de cocina mienten | **SE QUITA** |
| `components/configuracion/EstacionesPreparacionSection.jsx:213` | `EstacionPreparacion.list()` (¿existe la general?) | lectura que decide | Se crea una **segunda** «Cocina general». Rompe la regla 10 de `F1-01` §3 | **SE QUITA** |
| `components/configuracion/EstacionesPreparacionSection.jsx:273` | `CategoriaProducto.update(reasigna)` antes de desactivar | escritura | La estación se desactiva igual (`:276`) y las categorías quedan apuntando a una estación muerta. Sus pedidos no aparecen en ninguna pantalla | **SE QUITA** |
| `components/configuracion/ModoPresentacion.jsx:71` | `ConfiguracionNegocio.update({presentacion_ultimo_acceso})` | escritura | No queda registro de quién entró al modo presentación. Es la traza de auditoría de una puerta con contraseña | **SE QUITA** |
| `components/configuracion/ReiniciarSistemaSection.jsx:90` | `queryClient.invalidateQueries` | degradación legítima | Nada | SE QUEDA |
| `components/configuracion/ReiniciarSistemaSection.jsx:95` | `queryClient.invalidateQueries()` global | degradación legítima | Nada | SE QUEDA |
| `components/configuracion/ReiniciarSistemaSection.jsx:132` | `localStorage.removeItem(...)` | degradación legítima | Un filtro guardado sobrevive al reinicio | SE QUEDA |
| `components/configuracion/ReiniciarSistemaSection.jsx:134` | bloque sobre ese barrido de `localStorage` | degradación legítima | Ídem | SE QUEDA |
| `pages/Configuracion.jsx:241` | `Mesa.update({mesero_asignado_color, atendido_por_color})` | escritura | El mesero cambia de color y sus mesas conservan el viejo | **SE QUITA** |

---

### 4.14 Resto de `components/` — 27

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/caja/AbrirCajaDialog.jsx:48` | `inputRef.current?.focus()` | degradación legítima | Hay que tocar el campo | SE QUEDA |
| `components/cocina/CocinaNuevoPedidoWatcher.jsx:22` | `sessionStorage.setItem(notificados)` | degradación legítima | Un pedido se anuncia dos veces | SE QUEDA |
| `components/cocina/CocinaNuevoPedidoWatcher.jsx:97` | `fraseNuevoPedidoCocina(...)` | degradación legítima | Ese pedido no se lee en voz alta | SE QUEDA |
| `components/cocina/CocinaNuevoPedidoWatcher.jsx:108` | `playNewOrder()` | degradación legítima | No suena | SE QUEDA |
| `components/cocina/CocinaNuevoPedidoWatcher.jsx:112` | `speak(frase, {cocina:true})` | degradación legítima | No se lee | SE QUEDA |
| `components/cocina/CocinaVozControl.jsx:36` | `getCurrentVoiceInfo(...)` | degradación legítima | No se muestra la voz activa | SE QUEDA |
| `components/common/ErrorBoundary.jsx:35` | `props.onReset()` | degradación legítima | El botón «reintentar» no limpia el estado del padre | SE QUEDA |
| `components/common/ErrorBoundary.jsx:42` | `window.location.reload()` | degradación legítima | No recarga | SE QUEDA |
| `components/common/ImageUploader.jsx:65` | `e.target.value = ''` | degradación legítima | No se puede resubir el mismo archivo | SE QUEDA |
| `components/common/MobileAdminRadialMenu.jsx:207` | `setPointerCapture(e.pointerId)` | degradación legítima | El gesto radial se pierde si el dedo sale del botón | SE QUEDA |
| `components/common/MobileAdminRadialMenu.jsx:235` | `releasePointerCapture(e.pointerId)` | degradación legítima | Ídem | SE QUEDA |
| `components/common/PedidoListoWatcher.jsx:49` | `sessionStorage.setItem(notificados)` | degradación legítima | Un aviso repetido | SE QUEDA |
| `components/common/PedidoListoWatcher.jsx:161` | `playReady()` | degradación legítima | No suena | SE QUEDA |
| `components/common/PedidoListoWatcher.jsx:168` | `speak(frase)` | degradación legítima | No se lee | SE QUEDA |
| `components/common/SafeBoundary.jsx:25` | `console.error(...)` | degradación legítima | Nada | SE QUEDA |
| `components/common/SafeBoundary.jsx:33` | `props.onReset()` | degradación legítima | El reset no propaga | SE QUEDA |
| `components/common/SolicitudesQRWatcher.jsx:48` | `sessionStorage.setItem(notificados)` | degradación legítima | Un aviso repetido | SE QUEDA |
| `components/common/SolicitudesQRWatcher.jsx:69` | `cleanupOldSolicitudes(api, config)` → borra `SolicitudQR` viejas | escritura | Las solicitudes de ayer se acumulan en el panel del mesero. Nadie lo sabe | **SE QUITA** |
| `components/common/SolicitudesQRWatcher.jsx:126` | `playNewOrder()` | degradación legítima | No suena | SE QUEDA |
| `components/common/SolicitudesQRWatcher.jsx:132` | `speak(frase)` | degradación legítima | No se lee | SE QUEDA |
| `components/dashboard/PrimerosPasosCard.jsx:78` | `localStorage.setItem(COMPLETED_KEY)` | degradación legítima | La guía reaparece | SE QUEDA |
| `components/dashboard/PrimerosPasosCard.jsx:96` | `localStorage.setItem(DISMISSED_KEY)` | degradación legítima | Ídem | SE QUEDA |

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `components/pos/PaymentModal.jsx:44` | `efectivoRef.current?.focus()` | degradación legítima | Hay que tocar el campo | SE QUEDA |
| `components/propinas/PropinasRegistros.jsx:70` | `LiquidacionPropina.list('-fecha_liquidacion', 200)` dentro del `queryFn` | lectura que decide | Anula el estado de error de react-query. La pantalla de propinas dice «no hay liquidaciones» y el mesero cree que no le han pagado | **SE QUITA** |
| `components/recetas/RecetaFormDialog.jsx:200` | `CategoriaProducto.get(producto.categoria_id)` | lectura que decide | El producto se guarda con `categoria_nombre` vacío. El snapshot queda mal para siempre | **SE QUITA** |
| `components/tickets/TicketViewerDialog.jsx:26` | `DetalleVenta.filter({venta_id})` | lectura que decide | **El ticket histórico se imprime sin líneas.** Rompe la regla 11 de `F1-01` §3 | **SE QUITA** |
| `components/tickets/TicketViewerDialog.jsx:31` | `Mesa.list().then(find)` | lectura de adorno | El ticket sale sin número de mesa | **SE QUITA** |

---

### 4.15 `lib/` — 24 (todas legítimas menos dos)

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `lib/POSAuthContext.jsx:15` | `JSON.parse(sessionStorage.getItem('posUser'))` | degradación legítima | Hay que volver a meter el PIN | SE QUEDA |
| `lib/ThemeContext.jsx:26` | `localStorage.getItem('mh_theme')` | degradación legítima | Arranca en claro | SE QUEDA |
| `lib/ThemeContext.jsx:37` | `root.classList` + `colorScheme` | degradación legítima | No aplica el tema | SE QUEDA |
| `lib/ThemeContext.jsx:47` | `root.classList.remove(ANIM_CLASS)` | degradación legítima | La clase de animación se queda pegada | SE QUEDA |
| `lib/ThemeContext.jsx:49` | bloque de `pulseAnimClass` | degradación legítima | Sin transición al cambiar tema | SE QUEDA |
| `lib/ThemeContext.jsx:79` | `localStorage.setItem('mh_theme')` | degradación legítima | El tema no se recuerda | SE QUEDA |
| `lib/asignacionMesas.js:190` | `SolicitudQR.list('-created_date', 500)` | lectura que decide | `cleanupOldSolicitudes` no ve nada que borrar y devuelve `{borradas: 0}` como si el día estuviera limpio | **SE QUITA** |
| `lib/asignacionMesas.js:200` | `SolicitudQR.delete(s.id)` | escritura | La solicitud vieja sobrevive y no se cuenta como fallida | **SE QUITA** |
| `lib/brandColors.js:147` | `target.style.setProperty(k, v)` | degradación legítima | La paleta de marca no se aplica | SE QUEDA |
| `lib/sounds.jsx:17` | `AudioContext.resume()` | degradación legítima | Sin audio | SE QUEDA |
| `lib/sounds.jsx:27` | `AudioContext.resume()` en `unlockAudio` | degradación legítima | Sin audio | SE QUEDA |
| `lib/sounds.jsx:76` | `playTone(...)` | degradación legítima | Sin tono | SE QUEDA |
| `lib/sounds.jsx:106` | `localStorage.setItem('mh_sounds_enabled')` | degradación legítima | No recuerda la preferencia | SE QUEDA |
| `lib/sounds.jsx:111` | `localStorage.setItem('mh_sounds_volume')` | degradación legítima | Ídem | SE QUEDA |
| `lib/sounds.jsx:123` | `playTone(...)` — nuevo pedido | degradación legítima | Sin sonido | SE QUEDA |
| `lib/sounds.jsx:134` | `playTone(...)` — pedido listo | degradación legítima | Sin sonido | SE QUEDA |
| `lib/sounds.jsx:143` | `playTone(...)` — prueba | degradación legítima | Sin sonido | SE QUEDA |
| `lib/useRouteCleanup.js:30` | limpieza de `body.style` al navegar | degradación legítima | Un lock de scroll de un portal huérfano | SE QUEDA |
| `lib/voiceAlert.js:118` | `localStorage.setItem(KEY_VOICE_CACHE)` | degradación legítima | Recalcula la voz cada vez | SE QUEDA |
| `lib/voiceAlert.js:134` | `localStorage` de la voz preferida | degradación legítima | No recuerda la voz | SE QUEDA |
| `lib/voiceAlert.js:164` | `speechSynthesis.onvoiceschanged` | degradación legítima | Cae al `setTimeout` de `:165` | SE QUEDA |
| `lib/voiceAlert.js:304` | `ensureVoicesLoaded()` al cargar el módulo | degradación legítima | Las voces se cargan al primer uso | SE QUEDA |
| `lib/voiceAlert.js:340` | `utter.voice = next.voice` | degradación legítima | Habla con la voz por defecto | SE QUEDA |
| `lib/voiceAlert.js:363` | `speechSynthesis.cancel()` | degradación legítima | La cola tarda en callarse | SE QUEDA |

---

### 4.16 `utils/`, `pages/` sueltas, `api/` y `tema-arranque.ts` — 11

| archivo:línea | qué envuelve | categoría | qué pasa hoy cuando falla | veredicto |
|---|---|---|---|---|
| `utils/categoriaUtils.js:98` | `CategoriaProducto.list()` en `ensureCategoriaExists` | lectura que decide | La función que existe para evitar duplicados crea uno. Rompe la unicidad sin acentos de `F1-01` §6 | **SE QUITA** |
| `utils/categoriaUtils.js:105` | `CategoriaProducto.update({activo:true})` (reactivar) | escritura | Devuelve `{...existente, activo:true}` en `:106` **mintiendo**: en la base sigue inactiva | **SE QUITA** |
| `utils/entregaPedidos.js:58` | `Venta.filter({mesa_id})` para resolver `ventaId` | lectura que decide | Se entrega el pedido sin ligarlo a la venta. El cierre de la mesa no se dispara | **SE QUITA** |
| `pages/Recetas.jsx:142` | `RecetaEscandallo.delete(l.id)` | escritura | El producto se archiva (`:145`) y sus líneas de receta sobreviven. Siguen contando en el costeo | **SE QUITA** |
| `pages/Recetas.jsx:242` | `el.scrollIntoView(...)` | degradación legítima | No hace scroll al producto | SE QUEDA |
| `pages/Registros.jsx:70` | `new URLSearchParams(location.search)` | degradación legítima | Abre en la pestaña «cortes» | SE QUEDA |
| `pages/Registros.jsx:84` | `new URLSearchParams(location.search)` | degradación legítima | No cambia de pestaña por enlace profundo | SE QUEDA |
| `pages/Registros.jsx:573` | `DetalleVenta.filter({venta_id})` por lote | lectura que decide | **El CSV exportado sale con ventas sin sus productos**, y el archivo se descarga como si estuviera completo | **SE QUITA** |
| `api/cliente.ts:95` | `respuesta.json()` | degradación legítima | El `null` cae directo en el `throw new ErrorPuente` de `:98`. El fallo sí se propaga | SE QUEDA |
| `api/cliente.ts:226` | `r.json()` al subir archivo | degradación legítima | Igual: `throw new ErrorPuente` en `:228` | SE QUEDA |
| `tema-arranque.ts:24` | `}catch(e){}` dentro del guion inline anti-parpadeo | degradación legítima | La página pinta clara y salta a oscura | SE QUEDA |

---

## 5. Las que hacen daño de verdad

Ocho. Con el escenario concreto: qué hace el usuario, qué falla, qué ve, qué queda mal en la base.

### 5.1 `pages/Caja.jsx:1160` — el día se cierra con mesas abiertas

Son las 23:40. El cajero pulsa **Cerrar caja**. La mesa 7 lleva media hora con una cuenta de $840 sin cobrar.

`intentarAbrirCierreDiario` (`:1124`) llama a `obtenerMesasPendientesCierre()`. El pooler de Supabase devuelve un 429. La lectura falla. El `.catch(() => [])` de `:1160` la convierte en lista vacía. `pendientesFinales.length` es 0. El código sigue de largo.

Y hay una segunda capa: `utils/mesasPendientesCierre.js:19-22` **también** devuelve `[]` cuando falla, con un `console.warn`. Dos redes de seguridad que devuelven lo mismo: «no hay mesas pendientes».

Peor: `pages/Caja.jsx:1139-1143` es explícito al respecto — *«En caso de error de red, no bloqueamos: dejamos abrir el dialog»*.

El cajero ve: **«¡Caja cerrada correctamente!»** (`:1257`).
En la base queda: `CorteCaja` cerrado, `efectivo_esperado` sin los $840, la mesa 7 en `ocupada` con `venta_activa_id` apuntando a una venta `cuenta_solicitada` que ya no cabe en ningún corte. Al día siguiente el arqueo no cuadra y nadie sabe por qué.

### 5.2 `utils/qrPedidoFlow.js:370` — el pedido del QR vale $0.00

Una mesa de cuatro pide desde el teléfono: $1 240. Pulsan **Enviar pedido**.

`enviarPedidoQR` crea los `DetalleVenta` uno a uno (`:347-363`) y todos entran bien. Luego re-totaliza leyendo de vuelta (`:370`). Esa lectura falla. El `.catch(() => [])` devuelve lista vacía. `subtotal` sale 0 y **`Venta.update({subtotal: 0, total: 0})` en `:380-387` lo escribe en la base.**

El `catch` de `:372`, que restauraría `nuevosDetalles`, **nunca se ejecuta**: el `.catch` interno ya se comió el rechazo. Es código muerto que aparenta ser una red de seguridad.

El comensal ve: pedido enviado, todo bien. La comida llega.
En Caja aparece: cuenta de la mesa con **total $0.00** y cuatro `DetalleVenta` que sí suman $1 240. Es el mismo síntoma que Miguel ya parcheó a mano en `Mesero.jsx:882-914` («HOTFIX 6A — Rescate de totales en CERO»), pero en el camino del QR nadie lo rescata.

### 5.3 `pages/POS.jsx:462-469` — el pedido nunca llega a cocina

Venta de mostrador. Dos hamburguesas y una limonada. El cajero cobra en efectivo.

`Venta` creada, `DetalleVenta` creados, stock descontado. Al final, un `PedidoPreparacion.create` por área (`:462`). Falla. El `.catch(() => {})` de `:469` no dice nada. El bucle continúa. Se pinta el ticket. `toast.success(`Venta ${folio} cobrada`)` en `:500`.

El cajero ve: cobro correcto, ticket impreso.
En cocina: nada. Ni pedido, ni sonido, ni voz — porque `CocinaNuevoPedidoWatcher` sólo reacciona a `PedidoPreparacion` que existan.
En la base queda: venta `pagada`, inventario descontado, **cero comandas**. El cliente espera de pie hasta que pregunta.

### 5.4 `pages/Inventario.jsx:179` — se borra un insumo con historial

El administrador quiere limpiar el catálogo y pulsa borrar sobre «Café en grano».

`eliminarIngrediente` lee sus movimientos para bloquearse si tiene historial (`:179`). La lectura falla. `.catch(() => [])` → `movs` es `[]` → `movs.length > 0` es falso → el guardia no salta → **`api.entidades.Ingrediente.delete(ing.id)` en `:188`. Borrado físico.**

El administrador ve: **«Café en grano eliminado»** (`:190`).
En la base queda: cientos de `MovimientoInventario`, `RecetaEscandallo` y `DescuentoInventarioVenta` apuntando a un `ingrediente_id` que ya no existe. Rompe la regla 8 de `F1-01` §3 (borrado suave en todo catálogo) por accidente, no por diseño.

### 5.5 `pages/Caja.jsx:861` + `:880` + `:897` — se cobra y el stock no baja

Cobro de una mesa de $1 180. El cajero pulsa **Cobrar**.

En `:672` la venta ya pasa a `pagada`. Después empieza el descuento de inventario. Se lanzan en paralelo (`:854-901`) el `Ingrediente.update` del stock (`:861`), el `MovimientoInventario.create` (`:880`) y los `DescuentoInventarioVenta.create` (`:897`). Los tres con `.catch(() => {})`.

Si el lote falla, no falla nada visible. Y el `catch` exterior de `:906` sólo hace `console.warn('Error descontando inventario:')` — **ni un toast.**

El cajero ve: ticket, «Venta cobrada», mesa liberada.
En la base queda: venta pagada por $1 180, stock intacto, ledger sin una sola fila. El inventario dice que hay carne para 40 hamburguesas cuando quedan 12. La rotura se descubre a media noche del viernes.

### 5.6 `pages/Mesero.jsx:368` — la mesa huérfana

El mesero abre la mesa 12, mete 4 personas y confirma.

`Venta.create` funciona (`:329-350`). Después, `Mesa.update({estado:'esperando_orden', venta_activa_id: venta.id, …})` en `:368` falla. `.catch(() => {})`. El código sigue: `setMesaActiva({...mesaParaAbrir, ...updateMesa})` en `:372` pinta el estado nuevo **en memoria**, y el toast dice **«Mesa 12 abierta»** (`:377`).

El mesero ve: la mesa abierta, con sus 4 personas.
En la base queda: una `Venta` abierta que ninguna mesa referencia, y la mesa 12 en `libre`. En cuanto refresque la pantalla, la mesa vuelve a estar vacía y la cuenta desaparece. Es exactamente el defecto D-16, y el que la lógica de `detectarHuerfano` intenta remendar después.

### 5.7 `components/portalqr/PedirCuentaQR.jsx:341` — la cuenta que nunca llegó a Caja

El comensal elige propina del 10 % y pulsa **Pedir la cuenta**.

Con propinas desactivadas o en el camino simple, se ejecuta `Venta.update({estado:'cuenta_solicitada'})` en `:340`, envuelto en un `try { … } catch {}` de `:341`. Falla. No pasa nada. Lo mismo con `Mesa.update` en `:347-348`. Después `setEnviado(true)` en `:362` y el `onConfirmed()`.

El comensal ve: «Listo, un mesero viene con tu cuenta».
En Caja: la venta sigue en `enviada`, sin `codigo_caja`. No aparece en pendientes. El comensal espera. El mesero no sabe. La mesa se queda ocupada hasta que alguien pregunta.

### 5.8 `components/datos/ImportarDatosDialog.jsx:109-127` — el dry-run valida contra la nada

El administrador importa un CSV de 300 ingredientes para actualizar costos.

Antes de validar, el diálogo carga el catálogo actual como *snapshot* (`:107-130`). Las seis lecturas llevan `.catch(() => [])`. Si una falla, `snapshot.ingredientes` es `[]`.

`validarInventario(rows, snapshot)` en `:133` compara contra un catálogo vacío: **las 300 filas se marcan como nuevas.** La vista previa del paso 2 dice «300 ingredientes nuevos, 0 actualizaciones» y ningún error.

El administrador ve: una vista previa limpia. Pulsa **Ejecutar**.
En la base queda: 300 ingredientes duplicados, cada uno con su stock y su costo, conviviendo con los 300 originales. Recetas rotas, costos partidos, inventario inservible. Y esto ocurre en la pantalla cuyo criterio de aceptación en `F1-02` E4-8 es literalmente **«Una importación con errores no aplica nada»**.

---

## 6. Las que se quedan, y por qué — 80

Todas comparten una propiedad: **el fallo no puede corromper un dato ni torcer una decisión.** Como mucho se pierde una comodidad.

| Grupo | Cuántas | Por qué se queda | Ejemplo |
|---|---|---|---|
| **Audio** — `AudioContext`, osciladores, volumen | 10 | Los navegadores bloquean el audio hasta el primer gesto. Fallar es lo normal, no la excepción | `lib/sounds.jsx:17` |
| **Voz** — `speechSynthesis`, carga de voces, frases | 12 | La síntesis de voz no existe en todos los navegadores ni en todos los idiomas. La alerta visual siempre acompaña | `lib/voiceAlert.js:164` · `components/cocina/CocinaNuevoPedidoWatcher.jsx:112` |
| **`localStorage` / `sessionStorage`** — tema, volumen, voz preferida, guía de primeros pasos, IDs ya notificados, sesión POS | 15 | En modo privado y con cookies bloqueadas, escribir lanza. Perder una preferencia no es perder un dato | `lib/ThemeContext.jsx:79` · `components/common/PedidoListoWatcher.jsx:49` |
| **DOM y foco** — `focus()`, `scrollIntoView`, `setPointerCapture`, `classList`, `style.setProperty`, limpieza de `body` | 13 | Son efectos de presentación. Ninguno toca la base | `components/pos/PaymentModal.jsx:44` · `lib/useRouteCleanup.js:30` |
| **Caché de react-query** — `invalidateQueries` y `refetchQueries` | 21 | Refrescar una caché es idempotente y siempre hay un polling detrás. **Aquí están los 5 `refetchQueries` de Caja y Mesero que la auditoría previa ya separó bien** | `pages/Caja.jsx:1025` · `pages/Mesero.jsx:772` |
| **Límites de error** — `ErrorBoundary` y `SafeBoundary` | 4 | Un `catch` dentro del manejador de errores tiene que ser mudo, o el fallback también revienta | `components/common/SafeBoundary.jsx:25` |
| **Enlaces profundos** — `URLSearchParams` | 2 | Un `?tab=` corrupto cae a la pestaña por defecto | `pages/Registros.jsx:70` |
| **Parseo de respuesta ya fallida** — `response.json()` | 2 | El `null` alimenta un `throw` explícito dos líneas más abajo. El error sí sale | `api/cliente.ts:95` |
| **Sondeo que conserva el valor anterior** | 1 | El guardia `if (arr.length > 0)` impide que un fallo borre la cuenta ya pintada | `components/portalqr/PedirCuentaQR.jsx:88` |
| | **80** | | |

Estos 80 se copian tal cual a la versión nueva. **No se «endurecen».** `F1-01` §4 es claro: las cicatrices se quitan cuando la causa que las originó ya no puede ocurrir, y la causa aquí es el navegador, no el backend.

---

## 7. Qué pone cada una en su lugar

Tres reglas y una distinción. La distinción es la que hoy no existe.

### Regla A · Escrituras: propagar, avisar y revertir — 44 casos

Ningún `create`, `update` o `delete` se traga su error. Tres obligaciones, las tres:

1. **Se propaga.** El `await` deja de llevar `.catch`. Si falla, la función falla.
2. **Se avisa con `toast.error` visible**, con texto que diga qué no se guardó, no «hubo un error».
3. **Se revierte el estado optimista** si lo hubo.

Ejemplos concretos:

| Hoy | Mañana |
|---|---|
| `pages/POS.jsx:462-469` — `PedidoPreparacion.create(...).catch(() => {})` | La comanda es un efecto **dentro** de `cobrarVenta`. Si no se puede crear, **la transacción no confirma y la venta no se cobra**. El cajero ve por qué |
| `pages/Caja.jsx:861/880/897` — stock, movimiento y descuento sueltos | Los tres son efectos de `cobrarVenta`. El ledger falla en vez de silenciar (`F1-01` §8). Si el stock no baja, la venta no se marca pagada |
| `pages/Mesero.jsx:368` — `Mesa.update(...).catch(() => {})` tras crear la venta | Comando `abrirMesa`: venta y mesa en una transacción, con el índice único parcial de `F1-02` E6-2. O las dos, o ninguna. Y se quita el `setMesaActiva` optimista de `:372` si el comando no responde OK |
| `pages/Cocina.jsx:232` y `:273` — `Mesa.update(...).catch(() => {})` | Comando `transicionarPedido` (E6-6). El parche optimista de `optimisticPatchPedido` **se revierte** si el comando falla, igual que ya hace el `catch` de `:241-244` |
| `components/portalqr/PedirCuentaQR.jsx:341` / `:348` | Comando público `solicitarCuenta`. `setEnviado(true)` sólo tras respuesta OK del servidor |
| `components/inventario/AjustarStockDialog.jsx:319` — rollback mudo | Con `ajustarInventario` transaccional no hay rollback manual que hacer. Mientras exista, un fallo de rollback es `toast.error` con el ID del ingrediente y el stock esperado |
| `utils/importExecutors.js:328` — rollback mudo | `guardarReceta` con rollback real (E4-3 corrige D-11). El rollback deja de ser cosa del navegador |
| `pages/Recetas.jsx:142` — `RecetaEscandallo.delete(...).catch(() => {})` | Comando `archivarProducto`: borra las líneas y archiva el producto en la misma transacción |
| `utils/categoriaUtils.js:105` — devuelve `activo: true` sin haberlo escrito | El comando devuelve la categoría **tal como quedó en la base**, no como se esperaba que quedara |

### Regla B · Lecturas que deciden: el fallo impide la decisión — 59 casos

Nunca se deja pasar. Si el dato que gobierna una decisión no se pudo leer, **la decisión no se toma**.

| Hoy | Mañana |
|---|---|
| `pages/Caja.jsx:1160` + `utils/mesasPendientesCierre.js:19-22` | El chequeo se va al servidor: `cierreDiario` verifica dentro de la transacción que no haya mesas abiertas. El cliente ya no puede saltárselo. Si la verificación no se puede hacer, el comando devuelve error tipado y el cierre **no ocurre**. También desaparece el «dejamos abrir el dialog» de `Caja.jsx:1141-1143` |
| `pages/Inventario.jsx:179` | La comprobación de historial vive en el comando de borrado. Y la base la respalda: llave foránea. Si no se puede comprobar, no se borra |
| `utils/qrPedidoFlow.js:370` | El total lo calcula el servidor dentro de `enviarPedido`, en la misma transacción que crea las líneas. No hay relectura que pueda fallar |
| `utils/qrPedidoFlow.js:32` y `:111` | El índice único parcial de venta activa por mesa (`F1-02` E3-2) hace innecesaria la carrera. La base rechaza la segunda |
| `components/datos/ImportarDatosDialog.jsx:109-127` | El dry-run se valida **en el servidor**, contra el catálogo real. Si el catálogo no se puede leer, el dry-run devuelve error y el botón «Ejecutar» no se habilita |
| `components/cortes/*` (12) | `GET /api/cortes/:id/reporte` (E8-2). Un reporte parcial no existe: o el servidor devuelve el corte completo, o devuelve error y el PDF no se genera |
| `components/tickets/TicketViewerDialog.jsx:26` | `GET /api/ventas/:id/ticket` con líneas incluidas. Si falla, el diálogo muestra «No se pudo cargar el ticket» y **no ofrece imprimir** |
| `pages/Mesero.jsx:844/851/859/860` | El anti-doble-solicitud y la validación de consumo son parte del comando `solicitarCuenta`, idempotente por clave |
| `components/propinas/PropinasRegistros.jsx:70` | Se quita el `.catch` del `queryFn` y la pantalla usa el `isError` de react-query: «No se pudieron cargar las liquidaciones» con botón de reintento |
| Los antiduplicado (`utils/categoriaUtils.js:98`, `components/configuracion/EstacionesPreparacionSection.jsx:145` y `:213`, `components/compras/RegistrarCompraDialog.jsx:206`, `components/inventario/RegistrarInventarioInicialDialog.jsx:172`, `pages/PortalCliente.jsx:566`, `components/portalqr/PedirCuentaQR.jsx:276`) | Dejan de vivir en el cliente. Las únicas sin acentos ni mayúsculas de `F1-01` §6 los imponen en la base. El cliente sólo traduce el error de unicidad a un mensaje |

### Regla C · Lecturas de adorno: se distingue el vacío del fallo — 5 casos

`components/compras/RepetirCompraDialog.jsx:61` y `:62`, `components/tickets/TicketViewerDialog.jsx:31`, `pages/PortalCliente.jsx:178` y `:183`. Aquí un fallback sí es aceptable, pero **no puede llamarse igual que «no hay datos»**.

### La distinción que hoy no existe

Este es el problema de fondo, y no se arregla `catch` por `catch`: se arregla en el puente.

Hoy `[]` significa dos cosas a la vez y el código no puede separarlas:

| El código ve | Puede significar | Lo que hace hoy |
|---|---|---|
| `[]` de `Mesa.filter({activo:true})` | «No hay mesas ocupadas» **o** «no pude leer las mesas» | Cierra el día |
| `[]` de `MovimientoInventario.filter({ingrediente_id})` | «Este insumo nunca se movió» **o** «no pude leer» | Borra el insumo |
| `[]` de `DetalleVenta.filter({venta_id})` | «La venta no tiene líneas» **o** «no pude leer» | Cobra $0.00 |
| `[]` de `SolicitudQR.filter({estado:'pendiente'})` | «No hay solicitud pendiente» **o** «no pude leer» | Crea una duplicada |
| `null` de `Venta.get(id)` | «Esa venta no existe» **o** «no pude leer» | Abre la mesa vacía |

**La forma de arreglarlo:** `api.entidades.X.filter/list/get` **lanza** cuando no puede leer, y devuelve `[]` o `null` **sólo** cuando el servidor respondió correctamente y no había nada. Ya es así en `api/cliente.ts`: `:96-103` lanza `ErrorPuente` con código y mensaje ante cualquier respuesta que no sea `ok: true`.

Es decir: **el puente ya distingue bien. Los 59 `.catch(() => [])` heredados vuelven a confundirlo.** Cada uno de ellos anula la propiedad que el puente acaba de garantizar. Por eso se quitan, uno por uno, en el mismo commit en que se porta la pantalla.

Para lecturas de adorno donde sí conviene seguir pintando algo, el patrón es explícito, no un `catch` mudo:

```
const { data = [], isError } = useQuery(...);   // sin .catch en el queryFn
// isError → "No se pudo cargar" + reintentar
// !isError && data.length === 0 → "No hay compras previas"
```

---

## 8. Orden de ejecución

Cada arreglo cae en la etapa en la que se porta su pantalla. Nada se arregla antes de portarse, y nada se porta sin arreglarse: **la regla T1 de `F1-02` §8 obliga a dejar el escaneo en verde en el mismo commit.**

| Etapa | Qué se porta | Catches que se quitan | Escrituras | Deciden | Adorno |
|---|---|---|---|---|---|
| **E4-2** Inventario | `pages/Inventario.jsx`, `components/inventario/` | **4** | 2 | 2 | — |
| **E4-3** Recetas | `pages/Recetas.jsx`, `components/recetas/` | **2** | 1 | 1 | — |
| **E4-5** Compras | `components/compras/` | **5** | 2 | 1 | 2 |
| **E4-6** Catálogos | `utils/categoriaUtils.js` | **2** | 1 | 1 | — |
| **E4-8** Importación CSV | `components/datos/`, `utils/importExecutors.js` | **8** | 2 | 6 | — |
| **E5-2** Cobro de mostrador | `pages/POS.jsx` | **7** | 7 | — | — |
| **E5-3** Tickets | `components/tickets/` | **2** | — | 1 | 1 |
| **E6-3 / E6-4** Mesero y `enviarPedido` | `pages/Mesero.jsx`, `components/mesero/` | **15** | 7 | 8 | — |
| **E6-5 / E6-6** Cocina y transiciones | `pages/Cocina.jsx`, `utils/entregaPedidos.js` | **4** | 2 | 2 | — |
| **E6-7** Propinas | `components/propinas/` | **1** | — | 1 | — |
| **E6-9** Caja y cortes | `pages/Caja.jsx`, `components/caja/`, `components/cortes/` | **24** | 8 | 16 | — |
| **E7** Portal QR | `pages/PortalCliente.jsx`, `components/portalqr/`, `utils/qrPedidoFlow.js`, `lib/asignacionMesas.js`, `components/common/SolicitudesQRWatcher.jsx` | **27** | 8 | 17 | 2 |
| **E8-1** Registros | `pages/Registros.jsx` | **1** | — | 1 | — |
| **E10-1** Configuración | `pages/Configuracion.jsx`, `components/configuracion/` | **6** | 4 | 2 | — |
| | | **108** | **44** | **59** | **5** |

**E9 no aparece.** El escáner y los extras con precio son código nuevo: nacen sin `catch` vacíos.

### Notas de orden

- **E6-9 y E7 concentran 51 de los 108.** Son las dos etapas donde el riesgo de tragarse un error es máximo: dinero (Caja, cortes) y usuarios sin sesión (el portal del comensal).
- **`pages/Caja.jsx:1160` depende de E6-9 y de E3-2.** El guardia sólo desaparece de verdad cuando el índice único parcial y el comando `cierreDiario` están puestos. Hasta entonces, la corrección mínima es: si la lectura falla, **bloquear** el cierre y mostrar el error. Nunca dejar pasar.
- **`utils/mesasPendientesCierre.js:19-22` y `pages/Caja.jsx:1139-1143` van en el mismo commit que `pages/Caja.jsx:1160`.** Los tres son el mismo agujero en tres capas. Arreglar uno solo no cambia nada.
- **Los 12 `.catch(() => [])` de `components/cortes/` se quitan en bloque** cuando entre `GET /api/cortes/:id/reporte` (E8-2). Si E8-2 se retrasa, se quitan igual en E6-9 y el diálogo muestra error en vez de ceros.
- **Los 3 de `components/mesero/SolicitudesQRCardList.jsx` y los 3 de `SolicitudesQRPanel.jsx` son el mismo código duplicado.** Se arreglan a la vez o se unifican en E6-3.

---

## 9. Anexo · Los que no están vacíos y degradan igual

No entran en los 188 porque tienen cuerpo. Degradan lo mismo, y dos de ellos son el escenario 5.1.

| archivo:línea | qué hace | por qué importa | veredicto |
|---|---|---|---|
| `utils/mesasPendientesCierre.js:19-22` | `console.warn` + `return []` cuando falla `Mesa.filter({activo:true})` | Es la capa de abajo del guardia del cierre. Devuelve «no hay mesas pendientes» cuando quiere decir «no pude preguntar» | **SE QUITA** |
| `pages/Caja.jsx:1139-1143` | `console.error` + `setShowCierreDiario(true)` | La capa de arriba. El comentario lo admite: *«no bloqueamos… mejor permitir que el cajero cierre»* | **SE QUITA** |
| `pages/Caja.jsx:906-908` | `console.warn('Error descontando inventario:')` | Es el `catch` exterior de todo el bloque de inventario del cobro. **Ni un toast.** Aunque se quiten los 6 `.catch` internos, sin tocar este el cajero sigue sin enterarse | **SE QUITA** |
| `pages/Cocina.jsx:277-279` | `console.warn('[Cocina] revisar pedidos mesa:')` | Envuelve la decisión de marcar la mesa lista. Mismo agujero que `Cocina.jsx:265` | **SE QUITA** |
| `pages/Mesero.jsx:635-638` | `console.error` + `return null` por cada `DetalleVenta.create` que falla | Es el origen de los **detalles shadow** (D-05): el `null` se sustituye por el objeto en memoria en `:651-653` y la cuenta muestra productos que no existen en la base. Sólo avisa con un `toast.warning` que dice *«tardaron en guardarse»* (`:647`) — pero no tardaron: fallaron | **SE QUITA** (E6-4) |
| `pages/Mesero.jsx:911-914` | `console.error` + comentario *«No bloqueamos — seguimos con el flujo»* | El rescate de totales en cero antes de la precuenta. Si falla, la precuenta sale mal y se sigue igual | **SE QUITA** |
| `utils/qrPedidoFlow.js:141` | `catch (err)` del anti-carrera 2, sólo registra | Con los `.catch` internos de `:111`, `:128` y `:137`, este bloque no puede llegar a ejecutarse por esas causas. Código muerto | **SE QUITA** |
| `components/portalqr/MesasQRTab.jsx:37-40` | `console.warn` + `return mesa` sin token | El QR de esa mesa no se genera y la interfaz sigue como si nada | **SE QUITA** |
| `components/portalqr/PedirCuentaQR.jsx:334-336` | `console.warn('no se pudo actualizar venta')` | Camino con propinas del mismo agujero que `:341` | **SE QUITA** |

**Cuatro de estos nueve son código muerto**: un `.catch` interno se come el rechazo antes de que el `catch` exterior pueda verlo (`utils/qrPedidoFlow.js:372`, `utils/qrPedidoFlow.js:141`, `utils/qrPedidoFlow.js:291`, `pages/PortalCliente.jsx:267`). Parecen redes de seguridad y no lo son. Al portar, se borran: dejarlos es peor que no tener nada, porque el que lee el código cree que hay un manejo de error donde no lo hay.

---

## 10. Lo que este documento cambia en el plan

1. **`F1-02` §7** — la regla de los 24/92 se sustituye por la de §3.5 de este documento: **108 se quitan, 80 se quedan.**
2. **`F1-01` D-08** — el defecto pasa de *«24 `catch(() => {})` en Caja, POS y Mesero»* a *«188 catch degradantes en todo el árbol; 108 se tragan escrituras o decisiones»*. Los números por archivo de D-08 (11 · 7 · 6) son correctos y no cambian.
3. **Un defecto nuevo, no listado:** `pages/Inventario.jsx:179` permite el borrado físico de un insumo con historial cuando falla una lectura. Rompe la regla 8 de `F1-01` §3. Se corrige en E4-2.
4. **`F1-02` E4-8** — el criterio *«Una importación con errores no aplica nada»* no se cumple hoy ni con el dry-run puesto, porque el snapshot que lo valida se degrada a `[]` (§5.8). La validación tiene que ejecutarse en el servidor.
