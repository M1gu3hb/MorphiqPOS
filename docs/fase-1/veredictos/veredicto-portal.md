# Veredicto del verificador — Portal QR público (E7-1, E7-3) — packages/app/src/portal + apps/web/app/api/publico

VEREDICTO: NO_CUMPLE

## Puertas que ejecutó él mismo
- typecheck: VERDE — `pnpm --filter @morphiqpos/app exec tsc --noEmit` → EXIT=0, sin salida. Ejecutado por mí.
- eslint: VERDE — `pnpm exec eslint packages/app/src/portal apps/web/app/api/publico` → EXIT=0. Única línea: el aviso preexistente del plugin de Next sobre `pages/` en la raíz del repo, no del módulo. Ejecutado por mí. Añadido: `prettier --check` sobre ambos árboles → EXIT=0.
- pruebas: VERDE — `pnpm vitest run packages/app/src/portal` → 1 archivo, 28 pruebas, EXIT=0. Ejecutado por mí, dos veces (antes y después de restaurar mis mutaciones). Además: verify:estructura, verify:paquetes y verify:pruebas en verde; verify:residuos falla con 1 hallazgo que NO es de este módulo (packages/app/src/puente/cobertura.test.ts:34).

## Incumplimientos

### 1. [GRAVE] packages/app/src/portal/pedido.ts:117

**Regla:** Toda escritura sobre `ordenes` lleva guarda de estado en el `where` y comprueba filas afectadas (convención del repo: restaurante/pedido.ts:222-229, restaurante/cuenta.ts:183-190, restaurante/mesas-escrituras.ts:148-152)

**Escenario:** El `update` de `ordenes` (líneas 115-133) sólo filtra por `organizacion_id` e `id`: no lleva `where('estado', ...)` ni comprueba `numUpdatedRows`, y sube `version: orden.version + 1` sin `where('version','=',orden.version)`. La lectura previa (pedido.ts:186-199) es un `select` SIN `for update`, y `conTransaccion` es READ COMMITTED por decisión explícita (packages/data/src/cliente.ts:152-159). Qué teclea alguien: mesa 5 con orden 'confirmada'; el comensal pulsa «Enviar pedido» con dos tacos en el carrito; en el segundo que va entre el `select` y el `update`, el cajero cobra esa cuenta y su transacción confirma (estado→'pagada', `cerrada_en` puesto). Qué pasa: el `update` del portal espera el bloqueo de fila, entra después y escribe `estado='confirmada'` sobre la orden ya pagada. Qué queda mal en la base: una orden con `cerrada_en` no nulo y estado 'confirmada' —el check `orden_cerrada_con_fecha` (045_restaurante.sql:51) lo permite, porque sólo exige fecha cuando el estado ES pagada/cancelada—, es decir una cuenta cobrada y reabierta, con dos `orden_lineas` nuevas que nadie cobró y con `total_centavos` reescrito. Su hermano `restaurante/pedido.ts:222` evita exactamente esto con una línea y lanza `ORDEN_NO_EDITABLE`.

### 2. [GRAVE] packages/app/src/portal/cuenta.ts:70

**Regla:** Toda escritura sobre `ordenes` y `mesas` lleva guarda de estado y comprueba filas afectadas

**Escenario:** Mismo defecto, dos veces: el `update` de `ordenes` (68-85) y el de `mesas` (89-96) no llevan guarda de estado ni comprueban filas. `ordenParaCobrar` (126-132) lee sin `for update`. Qué teclea alguien: el mesero cobra la mesa 5 y la libera; el comensal, que tenía la pantalla del QR abierta, pulsa «Pedir la cuenta · 15 %» en la ventana entre el `select` del portal y su `update`. Qué pasa: la orden ya pagada vuelve a `estado='cuenta_solicitada'` con `propina_puntos_base=1500` y `propina_origen='portal_qr'`, y la mesa vuelve a `estado='cuenta_solicitada'`. Qué queda mal en la base: una mesa marcada como ocupada sin nadie sentado —el check `mesa_libre_sin_orden` (045_restaurante.sql:276) no lo impide, porque sólo prohíbe 'libre' CON orden— y una venta cobrada que reaparece en la pantalla de cuentas por cobrar del mesero. `restaurante/cuenta.ts:183` usa `where('estado','not in',[...ORDEN_CERRADA])` y `restaurante/mesas-escrituras.ts:99` `where('estado','=','libre')` para el mismo problema.

### 3. [GRAVE] packages/app/src/portal/cuenta.ts:66

**Regla:** Pedir la cuenta congela totales frescos calculados con `cotizar`, no reutiliza el total almacenado

**Escenario:** `calcularPropina(ctx, orden.total_centavos, entrada)` usa el `total_centavos` GUARDADO en la fila. Ese campo sólo lo refrescan restaurante/pedido.ts:118, restaurante/cuenta.ts:79 y portal/pedido.ts:112 — los tres vía `cotizar`. `venta/carrito.ts` NO escribe totales en `ordenes` (comprobado: no hay ningún `updateTable('ordenes')` en todo `venta/`). `portal/cuenta.ts` es el único «pedir la cuenta» del repo que no llama a `cotizar`. Qué teclea alguien: el comensal manda su pedido por QR (totales frescos, $430.00); el mesero añade después una botella de $600.00 desde el carrito de mostrador; el comensal pulsa «Pedir la cuenta · 15 %». Qué pasa: el servidor aplica el 15 % sobre 43000 centavos en vez de sobre 103000. Qué queda mal en la base: `ordenes.propina_puntos_base=1500` sobre un total obsoleto y, sobre todo, `solicitudes_qr.subtotal_consumo_centavos = 43000` y `propina_sugerida_centavos = 6450` (solicitudes.ts:149-151) — la instantánea que el mesero lee en su pantalla dice $430 de consumo cuando el consumo real es $1030, y la propina sugerida sale 900 centavos corta. `restaurante/cuenta.ts:79` hace justo lo contrario y documenta por qué: «para que Caja lea el mismo número que se imprimió en la precuenta».

### 4. [GRAVE] packages/app/src/portal/cuenta.ts:71

**Regla:** La orden que pasa a 'cuenta_solicitada' recibe su `codigo_caja` (restaurante/cuenta.ts:156,172)

**Escenario:** El `set` del portal escribe estado, propina, origen, versión y `updated_at`; no genera `codigo_caja`. Ninguna migración lo exige por `check` (045_restaurante.sql:30 lo declara `text` a secas), así que la escritura pasa en silencio. Qué teclea alguien: negocio con `portal_qr_cuenta_modo='cliente_solicita'` —el modo que cuenta.ts:155 habilita a propósito—; el comensal pide la cuenta desde su teléfono y se levanta a pagar. Qué pasa: la orden queda en 'cuenta_solicitada' con `codigo_caja = null`. Qué queda mal en la base: la única cuenta del sistema en ese estado sin el código M05-XXXX que `restaurante/datos.ts:88,107` lee y que el comentario de la columna describe como «Código que el comensal lleva impreso a la caja». El mismo estado alcanzado por el camino del mesero siempre lo tiene; por el camino del QR, nunca.

### 5. [MENOR] packages/app/src/portal/valoracion.ts:70

**Regla:** Toda escritura sobre `ordenes` lleva guarda de estado

**Escenario:** Tercera repetición del mismo patrón, con menos dinero en juego. La comprobación `orden.satisfaccion_score !== null` (línea 63) y el `update` (68-83) están separados por un `await` sin bloqueo de fila: dos teléfonos de la misma mesa valorando a la vez escriben los dos, y gana el último. Además el `update` no reexige `satisfaccion_score is null`, así que la ventana no se cierra en la base. Queda una valoración distinta de la que devolvió la respuesta al primer comensal.

### 6. [MENOR] packages/app/src/portal/conversion.ts:13

**Regla:** El dinero se maneja en bigint de centavos

**Escenario:** `aPesos` hace `Number(centavos) / 100` y devuelve `number`: todos los importes salen del portal en coma flotante (lista-blanca.ts:161,165,167 y cuenta-publica.ts:67-68,121-124). NO hay `Math.round(x*100)` ni `parseFloat` sobre importes en el módulo, y el cálculo interno sí es bigint íntegro (`aplicarPorcentaje` en cuenta.ts:201, `valorarLinea` en productos.ts:147), así que esto es sólo la frontera de salida y coincide con la convención ya establecida en puente/consultar.ts:304 y puente/tipos.ts:184. Lo marco igual porque esta respuesta es la única fuente de la que su frontend suma: el navegador que sume `precio_venta` de varias líneas para pintar un total arrastra el error de 0.1+0.2, y el portal ya no puede recalcularlo contra el servidor sin otra petición.

### 7. [MENOR] packages/app/src/portal/consulta.ts:99

**Regla:** Las banderas se leen para DECIDIR, no para publicar (doctrina del propio módulo, banderas.ts:4-10)

**Escenario:** `mostrarPrecios` y `mostrarPrecuenta` se emiten como booleanos (lista-blanca.ts:93,100) pero no gobiernan nada en el servidor: `productosVisibles` (152-181) manda `precio_venta`, `precio_por_unidad_variable` y `precio_por_porcion` siempre, y `cuentaDeLaMesa` (217-264) manda la precuenta entera con sus líneas y totales siempre. Qué teclea alguien: el dueño apaga «mostrar precios» y «mostrar precuenta» en su panel. Qué pasa: el `GET /api/publico/qr/:token` sigue devolviendo todos los precios y la cuenta completa; ocultarlos vuelve a ser decisión del navegador — exactamente el reparto de responsabilidades que el módulo entero viene a corregir.

### 8. [MENOR] packages/app/src/portal/errores-sql.ts:44

**Regla:** Un 23505 se traduce por CÓDIGO Y por nombre de índice (errores-sql.ts:31-38)

**Escenario:** `return restriccion === null || restriccion === indice` acepta cualquier 23505 cuyo nombre de restricción no venga informado como si fuera el índice esperado, contradiciendo el comentario que lo precede. Si un día un 23505 sin `constraint` sube desde otra sentencia del mismo comando, `solicitudes.ts:158` se lo enseña al comensal como «Ya avisamos al mesero. Llegará en un momento.» y `mesa.ts:151` como «Esta mesa acaba de abrirse»: dos mensajes falsos que ocultan un fallo real, con la transacción ya abortada.

### 9. [MENOR] packages/app/src/portal/estaciones.ts:115

**Regla:** Nada de N+1 dentro de la transacción de un comando (productos.ts:17-21 lo declara bloqueante)

**Escenario:** `comanda_items` se inserta uno por uno en un bucle dentro de la transacción del comando. Con el tope de 40 líneas de `esquemas.ts:23`, un pedido grande son 40 viajes secuenciales a la base con la transacción abierta y filas de `ordenes` y `mesas` a punto de bloquearse. Es el mismo N+1 que el módulo señala como defecto del código que sustituye, aquí en la ruta de escritura.

### 10. [MENOR] packages/app/src/portal/valoracion.ts:41

**Regla:** El portal público no deja escribir a quien no está sentado en la mesa

**Escenario:** La ventana de valoración es de 6 horas (línea 41) sobre un token permanente y no rotable —limite.ts:18-21 lo dice: `generarTokenMesa` es un hash no criptográfico y la rotación está fuera de Fase 1—. Qué teclea alguien: quien fotografíe el QR desde la acera manda `{score:1, comentario:'<500 caracteres>'}` seis veces cada cinco minutos (limite.ts:54). Qué pasa: gana quien escriba primero, porque después el comando devuelve `yaValorada:true` sin sobreescribir. Qué queda mal en la base: `ordenes.satisfaccion_score=1`, `satisfaccion_emoji='😡'` y 500 caracteres de texto libre de un desconocido en la venta de un comensal real, y ese comensal ya no puede corregirlo. El límite acota el volumen, no el primer disparo.

## Archivos fuera de sitio
- packages/app/package.json (M) — NO atribuible: el diff muestra que la entrada "./portal" ya estaba en HEAD; el cambio real añade "./puente-presentacion"
- packages/app/src/puente/configuracion.ts (M) — NO atribuible: añade SOLO_POR_COMANDO para paquete_modo/presentacion_ultimo_acceso, trabajo del módulo de configuración/presentación
- packages/app/src/venta/cobrar.ts (M) — NO atribuible: sin una sola mención de portal/qr/token_mesa en el diff; es el trabajo de propinas (E6-7), que el propio encargo declara permitido en venta/
- packages/app/src/venta/pagos.ts (M) — NO atribuible: igual que el anterior
- apps/web/app/api/compras/, apps/web/app/api/gastos/, apps/web/app/api/propinas/, apps/web/app/api/restaurante/, apps/web/app/api/configuracion/ (??) — otros módulos
- packages/app/src/compras/, packages/app/src/propinas/, packages/app/src/restaurante/, packages/app/src/puente/presentacion.ts (??) — otros módulos

## Resumen del verificador

VEREDICTO: NO_CUMPLE. Las tres puertas están en verde y las verifiqué yo mismo, y la mitad defensiva del informe es cierta; lo que falla es la mitad transaccional, en cuatro sitios con consecuencia en la base.

LO QUE SÍ ES VERDAD (comprobado leyendo, no leyendo el informe):
1. Ningún esquema acepta importe, total, precio ni rol. Los cinco z.object viven sólo en esquemas.ts:37-92 y no declaran ninguno; `validar` (packages/app/src/errores.ts:58-78) aplica `.strict()` a la raíz y `itemDelCarrito` (esquemas.ts:61-67) lo aplica al anidado, así que un `precio_venta` dentro de un item RECHAZA la petición entera en vez de descartarse en silencio.
2. La autorización no sale de ningún campo del cuerpo. `AmbitoPortal` (ambito.ts:31-43) no tiene `rol`, `identidadId` ni `empleoId`, y `grep` sobre todo el módulo no encuentra ni una lectura de rol/usuario/posRol desde la entrada. `definirComandoPublico` (definicion-publica.ts:91-98) rechaza al cargar el módulo una entrada que declare mesaId, mesa_id, token, tokenMesa, organizacionId o rol.
3. Cero catch vacíos, cero `.catch(() => {})`. Los ocho catch del módulo traducen y relanzan, o registran y devuelven. El único que falla abierto (limite.ts:88-94) es idéntico en forma y en razón al preexistente apps/web… perdón, packages/app/src/http/limite.ts:100-103.
4. Cero `any`, cero `as unknown as`, cero `@ts-ignore`, cero `eslint-disable` (grep sobre ambos árboles).
5. Ninguna consulta olvida `organizacion_id`. Audité las 17: mesas, productos (dos), categorías (dos), secciones, ordenes (cinco), orden_lineas (dos), solicitudes_qr (dos), comandas, comanda_items, estaciones_preparacion, comandos_ejecutados. Todas acotadas, y `ambito.ts:115` lo vuelve a comprobar en memoria después del `where`.
6. Las pruebas afirman de verdad. Lo comprobé MUTANDO el código y restaurándolo (md5 idéntico al terminar): al quitar `.strict()` de `itemDelCarrito`, «un pedido con un precio dentro NO se acepta» falla con «expected true to be false»; al hacer que el token de otra organización lance `QR_TOKEN_AJENO`, «los cinco casos devuelven exactamente la misma respuesta» falla con el toEqual. Ninguna de las dos es tautológica.
7. Los índices en que descansa el diseño existen de verdad: `ordenes_una_activa_por_mesa` (046:64) y `solicitudes_qr_una_pendiente` (046:141). Y la carencia que el informe confiesa es real: `mesas.qr_token` es `text` a secas (045:263), sin índice único — la mitigación `limit 2` + fallar cerrado está escrita (ambito.ts:107,163) y probada.
8. `verify:residuos` falla por packages/app/src/puente/cobertura.test.ts:34, que efectivamente no es de este módulo.

POR QUÉ NO CUMPLE: el módulo predica «impedir antes en vez de limpiar después» y luego escribe en `ordenes` tres veces (pedido.ts:117, cuenta.ts:70, valoracion.ts:70) y en `mesas` dos (pedido.ts:151, cuenta.ts:91) SIN guarda de estado y sin comprobar filas afectadas, con lecturas previas sin `for update` y en READ COMMITTED por decisión explícita del repo. Su módulo hermano —restaurante/, ya en el árbol— resuelve exactamente eso con una línea (`where('estado','in',...)` + `numUpdatedRows !== 1`) en los tres sitios equivalentes, y documenta por qué. El resultado alcanzable no es teórico: una orden pagada que vuelve a 'confirmada' con líneas sin cobrar, y una mesa marcada como ocupada sin nadie sentado. A eso se suma que `portal.pedir_cuenta` es el ÚNICO «pedir la cuenta» del repositorio que no llama a `cotizar` —calcula la propina sobre un `total_centavos` que `venta/carrito.ts` nunca refresca— y que deja la orden en 'cuenta_solicitada' sin `codigo_caja`, que su hermano genera siempre por ese mismo camino.

Nada de esto lo detecta ninguna de las 28 pruebas, porque las cuatro obligatorias miden proyección y validación —donde el trabajo es sólido— y ninguna toca la concurrencia. El informe lo reconoce a medias («lo que necesita Postgres vive en las pruebas de integración»), pero lo declara hueco de infraestructura cuando en cuatro de los cinco casos el arreglo es una cláusula `where` que el repo ya usa a quince metros de distancia.

NOTA SOBRE EL ÁRBOL: no toqué nada salvo las dos mutaciones que restauré. Advierto que el worktree se está modificando en paralelo por otros agentes mientras revisaba: entre dos `git status` consecutivos aparecieron apps/web/app/api/configuracion/ y packages/app/src/puente/presentacion.ts, y desaparecieron las modificaciones de demostracion/. Por eso `git status` NO permite atribuir a este módulo lo que hay fuera de sus dos carpetas; revisé los diffs y ninguno menciona portal, qr ni token_mesa. La huella propia del portal —packages/app/src/portal/ y apps/web/app/api/publico/— está íntegramente dentro del alcance declarado.
