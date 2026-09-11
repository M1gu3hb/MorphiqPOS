# Veredicto del verificador — E6-7 · Propinas y liquidación (packages/app/src/propinas + apps/web/app/api/propinas)

VEREDICTO: NO_CUMPLE

## Puertas que ejecutó él mismo
- typecheck: VERDE — `pnpm --filter @morphiqpos/app exec tsc --noEmit` → exit 0, sin salida.
- eslint: VERDE — `pnpm exec eslint packages/app/src/propinas apps/web/app/api/propinas` → exit 0. Única línea impresa: aviso global del plugin de Next («Pages directory cannot be found…»), ajeno al módulo.
- pruebas: VERDE PERO VACÍA — `pnpm vitest run packages/app/src/propinas` → exit 0, «Test Files 1 passed (1) · Tests 34 passed (34)». Suite completa `pnpm vitest run packages/app` → 25 archivos, 357 pruebas, todas en verde. PERO: saboteé liquidar.ts (total_centavos fijo en 1n, `if (problema !== null) throw problema` sustituido por `void problema`, y `ordenIds: filtroIds` → `ordenIds: null`) y las 34 pruebas SIGUIERON PASANDO. El cuerpo del comando no lo ejecuta ninguna prueba.

## Incumplimientos

### 1. [BLOQUEANTE] packages/app/src/propinas/liquidar.ts:95

**Regla:** El comando tiene que poder ejecutarse. El folio se toma por sucursal y se inserta contra un índice único por organización: la segunda sucursal jamás puede liquidar.

**Escenario:** Comprobado CONTRA LA BASE REAL de DATABASE_URL, dentro de una transacción abortada: `liquidaciones_folio_unico` es `UNIQUE (organizacion_id, serie, folio)` — sin sucursal_id — mientras que `folios_pkey` es `UNIQUE (organizacion_id, sucursal_id, serie)`. liquidar.ts:95-97 llama `repoFolios.tomarFolio(ctx.tx, organizacionId, sucursalId, 'LIQ')`, o sea un contador POR SUCURSAL, y liquidar.ts:113 lo inserta en una columna con unicidad POR ORGANIZACIÓN. Escenario: el negocio tiene Centro y Norte. La administradora de Centro pulsa «Liquidar» → folios(org,Centro,LIQ)=1 → fila LIQ-000001 confirmada. Al día siguiente el gerente de Norte teclea las mismas fechas y pulsa «Liquidar» → folios(org,Norte,LIQ)=1 → INSERT choca: reproduje el error exacto, `23505 · liquidaciones_folio_unico · duplicate key value violates unique constraint`. El envoltorio lo convierte en ERROR_INTERNO (500, «Ocurrió un error») y revierte TODO, incluido el incremento del folio (repos/folios.ts:20-23 lo dice explícito). Como el contador de Norte vuelve a 1 en cada reversión, Norte NUNCA podrá liquidar: no es un fallo intermitente, es una puerta cerrada permanente. En la base queda: cero filas nuevas, y las propinas de los meseros de Norte pendientes para siempre sin que la pantalla explique por qué.

### 2. [BLOQUEANTE] packages/app/src/propinas/propinas.test.ts:354

**Regla:** Las pruebas tienen que afirmar algo. Ninguna de las 34 ejecuta el cuerpo de `propinas.liquidar`: la protección contra la doble liquidación, el total del servidor y el reclamo por lista están sin cubrir.

**Escenario:** Las cuatro pruebas de «las puertas del servidor» (:357-390) invocan `liquidarPropinas` con la `TxFalsa` de pruebas/dobles.ts, pero las cuatro fallan ANTES del cuerpo: PAQUETE_NO_INCLUYE (comando.ts:111), SIN_PERMISO (comando.ts:98), SIN_PERMISO e IDEMPOTENCIA_REQUERIDA (comando.ts:125). `ejecutar` no corre nunca. Lo comprobé por mutación: dejé `total_centavos: 1n` en el paso `fijar_total`, sustituí `if (problema !== null) throw problema;` (liquidar.ts:144) por `void problema;` y cambié `ordenIds: filtroIds` (liquidar.ts:132) por `ordenIds: null` — tres sabotajes que reintroducen exactamente el defecto que el módulo dice cerrar — y la suite dio «34 passed». Es decir: si mañana alguien borra la guarda de PROPINA_YA_LIQUIDADA, la liquidación pagará dos veces la misma propina y las tres puertas seguirán en verde. Las pruebas de aritmética SÍ afirman (lo verifiqué mutando `suma += monto` para que la propina cubriera la venta: 3 rojas; y sustituyendo el desglose exacto por uno proporcional: 4 rojas), pero la ruta caliente —la que toca dinero en la base— tiene cobertura CERO. El archivo de humo que el informe cita como validación fue borrado, así que no es una puerta repetible.

### 3. [GRAVE] packages/app/src/propinas/liquidar.ts:87

**Regla:** El servidor sólo debe liquidar lo que el administrador aprobó en pantalla. Una lista vacía explícita liquida TODO el periodo.

**Escenario:** `entradaLiquidarPropinas.ordenIds` es `z.array(identificador).max(500).optional()` (esquemas.ts:90) — sin `.min(1)`, así que `[]` valida. En liquidar.ts:87-90: `const solicitadas = entrada.ordenIds ?? []` y luego `filtroIds = solicitadas.length === 0 ? null : [...]`. El comentario de :88-89 dice literalmente que «una lista vacía… no debería reclamar nada», y el código hace lo contrario: colapsa `[]` en `null`, que es «sin filtro de ids». Escenario: la administradora abre el diálogo del mes, desmarca todas las casillas para revisar antes de liquidar y pulsa «Liquidar» (o un cliente viejo manda `{"rangoTipo":"mes","desde":"…","hasta":"…","ordenIds":[]}`). En la base queda: `reclamarOrdenes` marca las 3 000 órdenes del mes entero con `propina_liquidacion_id` y `propina_liquidada_en`, `explicarReclamo` devuelve null (solicitadas.length es 0 y reclamadas>0, reclamo.ts:56 no entra), se crea la fila LIQ con el total del mes y se confirma. Nadie aprobó ese importe y no hay comando para revertirlo.

### 4. [GRAVE] packages/app/src/propinas/repositorio.ts:48

**Regla:** El ámbito manda. La liquidación se sella con la sucursal de la sesión pero reclama órdenes de toda la organización.

**Escenario:** `condicionPendiente` (repositorio.ts:49-56) filtra `o.organizacion_id`, estado, puntero, fechas y mesero — NO filtra `o.sucursal_id`, que es `not null` en `ordenes` (003_venta_caja_inventario.sql:109). El mismo predicado lo usa el UPDATE de liquidadas.ts:60 y las tres lecturas de consultas.ts:78-84. Mientras tanto liquidar.ts:78-83 EXIGE `ctx.ambito.sucursalId` y liquidar.ts:106 lo graba en la fila. Escenario A (escritura): la administradora, con sesión en Centro, teclea 01/09–30/09 y pulsa «Liquidar». En la base queda: las órdenes de Norte con `propina_liquidacion_id` apuntando a una liquidación cuya `sucursal_id` es Centro; el diálogo de Norte pasa a enseñar «$0.00 pendiente» y sus meseros no cobran, mientras el total de esa propina figura en la caja de Centro. Escenario B (lectura): un CAJERO de Norte hace POST /api/propinas/pendientes con cualquier rango y recibe `meseros[]` con el nombre y el importe de propina de cada mesero de Centro (consultas.ts:99) — datos de otra sucursal en su corte.

### 5. [GRAVE] packages/app/src/propinas/cobro.ts:87

**Regla:** Inmutabilidad / no destruir datos ajenos. `marcarPropinaDeOrden` sobrescribe las tres columnas de propina de la orden aunque el cobro sólo mande una.

**Escenario:** cobro.ts:83-85 sólo se salta la escritura si los TRES campos vienen `undefined`; si viene uno cualquiera, :90-92 escribe los tres: `propina_puntos_base: datos.puntosBase ?? 0`, `propina_tipo: datos.tipo ?? null`, `propina_origen: datos.origen ?? null`. Y hay otro escritor de esas columnas: `portal.pedir_cuenta` (packages/app/src/portal/cuenta.ts:71-78) las pone cuando el comensal elige la propina en el QR. Escenario: el comensal escanea el QR, toca «15 %» → la orden queda con `propina_puntos_base=1500, propina_tipo='porcentaje', propina_origen='portal_qr'`. Luego el cajero cobra desde el POS y su pantalla manda sólo `propinaOrigen: 'caja'` (porque la propina se dejó en efectivo en el mostrador), sin `propinaPuntosBase` ni `propinaTipo`. En la base queda: `propina_puntos_base=0`, `propina_tipo=NULL`, `propina_origen='caja'` — se destruye el registro de que el comensal eligió 15 % desde el portal, que es justo el «cómo se decidió la propina» que el archivo dice preservar, y `portal/cuenta-publica.ts:125` empezará a servir `propina_porcentaje: 0`. Además el UPDATE no toca `version` ni `updated_at`, así que la fila cambia sin dejar rastro.

### 6. [GRAVE] packages/app/src/propinas/esquemas.ts:58

**Regla:** Un importe que llega del cliente tiene que tener tope. `propinaCentavos` es el único campo de dinero del cobro sin cota superior y va directo a `movimientos_caja`.

**Escenario:** esquemas.ts:54 define `centavosNoNegativos = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)` y :58 lo usa para `propinaCentavos`. A diferencia de `montoCentavos`, que queda atado por `suma !== totalCentavos` (venta/pagos.ts:128), la propina no se contrasta con nada: ni con el total de la venta, ni con `propinaPuntosBase`, ni con un máximo absoluto. Escenario: alguien con sesión de cajero (o un script con esa cookie) hace POST /api/venta/cobrar con `{"pagos":[{"metodo":"efectivo","montoCentavos":<el total exacto>,"propinaCentavos":9007199254740991}]}` y SIN `recibidoCentavos` — así no dispara la guarda de efectivo insuficiente de pagos.ts:103. El cobro se confirma. En la base queda: una fila de `pagos` con `propina_centavos = 9007199254740991` y, por cobrar.ts:159-168, un `movimientos_caja` con `tipo='propina'` y ese importe; como `arqueoDeSesion` deriva `efectivoEsperadoCentavos` de la suma de movimientos (repos/caja.ts:169-172), el corte de ese turno pide 90 billones de pesos en el cajón y queda inservible. La misma cifra se arrastra a `liquidaciones_propina.total_centavos` en la siguiente liquidación.

### 7. [MENOR] packages/app/src/propinas/repositorio.ts:53

**Regla:** Rendimiento: el filtro de fecha no puede usar el índice previsto.

**Escenario:** 045_restaurante.sql:63-65 crea `ordenes_propina_pendiente on ordenes (organizacion_id, empleado_atiende_id, cerrada_en) where propina_liquidacion_id is null`, pero repositorio.ts:53-54 filtra por `coalesce(o.cerrada_en, o.created_at)`, que no es sargable contra esa columna. Las tres lecturas de pendientes y el UPDATE de reclamo hacen recorrido completo de las órdenes no liquidadas. Con 3 000 ventas/mes no duele; con dos años de histórico sin liquidar, el diálogo tarda y el UPDATE mantiene bloqueadas más filas de las necesarias. Nota adicional: en una base con la migración 045 aplicada, `orden_cerrada_con_fecha` (045:52-54) impide que una orden 'pagada' tenga `cerrada_en` nulo, así que el `coalesce` que cuesta el índice no protege de nada.

### 8. [MENOR] packages/app/src/propinas/liquidar.ts:139

**Regla:** Un identificador repetido no debería abortar la liquidación entera.

**Escenario:** `ordenIds` no tiene refine de unicidad (esquemas.ts:90). Si la pantalla manda la misma orden dos veces —una lista construida por concatenación, un doble render—, `solicitadas.length` es 2 y `reclamadas.length` es 1. liquidar.ts:139-142 consulta `ordenesDeOtraLiquidacion`, que devuelve vacío porque esa orden ya apunta a ESTA liquidación, y reclamo.ts:56-67 lanza LIQUIDACION_INVALIDA («Algunas ventas del listado ya no cumplen el periodo…»). En la base no queda nada mal, pero la administradora ve un mensaje que la manda a refrescar una pantalla que está bien, y no puede liquidar hasta que alguien deduplique en el cliente.

### 9. [MENOR] packages/app/src/propinas/liquidar.ts:166

**Regla:** Todos los efectos con nombre deberían ser interrumpibles por la prueba de atomicidad.

**Escenario:** `propinasPorMeseroDeOrdenes(ctx.tx, …)` es la única lectura del comando que no va envuelta en `ctx.paso`. Está dentro de `ctx.tx`, así que la atomicidad no se rompe; lo que se pierde es la posibilidad de interrumpir ahí desde `peticion.interrumpirEn` (comando.ts:170-176), que es el mecanismo con el que este repositorio prueba las reversiones. Combinado con el incumplimiento de cobertura, significa que ni siquiera queda la vía para probarlo.

### 10. [MENOR] packages/app/src/propinas/consultas.ts:55

**Regla:** Mínimo privilegio en la consulta. El cajero puede leer 366 días de propina por mesero de toda la organización.

**Escenario:** `propinas.pendientes` admite `cajero` (consultas.ts:55) y su entrada no acota el rango más allá del tope de 366 días de rango.ts:39, ni la sucursal. Un cajero teclea (o un script manda) `{"desde":"2025-09-10","hasta":"2026-09-09"}` y recibe `meseros[]` con nombre e importe acumulado de propina de cada mesero durante un año entero. La justificación del informe —que el desglose por método es parte de su corte— cubre el desglose agregado, no el reparto nominal por persona ni un año de histórico.

### 11. [MENOR] packages/app/src/propinas/liquidar.ts:41

**Regla:** El informe afirma que `propina_liquidada` «se deriva del puntero». No lo deriva nadie.

**Escenario:** La entidad `Venta` del puente (packages/app/src/puente/mapa.ts:386-395) expone `propina_liquidacion_id` y `propina_liquidada_fecha`, pero no hay ninguna entrada `derivados` que produzca el booleano `propina_liquidada`; el único `derivados` cercano es el de `LiquidacionPropina` (mapa.ts:1116-1129), que sólo sabe unir por columna contra otra tabla. Mientras tanto ocho puntos del código heredado lo leen: LiquidarPropinasDialog.jsx:105, PropinasDashboardSection.jsx:59-60, PropinasRegistros.jsx:98-99,106,330,333. Hoy esas pantallas recibirían `undefined` y pintarían TODA venta como «Pendiente», incluida la ya liquidada. No es culpa de un archivo de este módulo —`mapa.ts` está fuera del perímetro autorizado— pero el informe lo declara resuelto en vez de declararlo hueco, y quien lea el informe creerá que la migración de esas cuatro pantallas ya está cubierta. Atenuante real: `escribir.ts:79-84` rechaza con PUENTE_SIN_PERMISO cualquier escritura de `LiquidacionPropina` por el puente, así que el diálogo viejo falla en voz alta y no puede re-liquidar en silencio.

## Archivos fuera de sitio
- packages/app/src/venta/pagos.ts — AUTORIZADO (perímetro de propinas). Cambios acotados: PagoEntrante.propinaCentavos, PagoValidado.propinaCentavos, la propina no entra en `suma` (:69), guarda de propina negativa (:73-75), segunda guarda disjunta de efectivo insuficiente (:107-114), cambio = recibido − monto − propina (:123). Coincide con el check real de la base `pago_efectivo_recibido_suficiente` (recibido >= monto + propina), verificado contra DATABASE_URL.
- packages/app/src/venta/cobrar.ts — AUTORIZADO (perímetro de propinas). registrarPagoConPropina en vez de repoOrdenes.registrarPago (:121; comprobé que el reemplazo es réplica exacta de repos/ordenes/cierre.ts:26-42 más la columna propina_centavos, no se pierde ningún efecto), movimiento de caja tipo='propina' (:159-168; 'propina' sí está en el check real de movimientos_caja y sí lo suma arqueoDeSesion), paso registrar_propina (:189), ResultadoCobro.propinaCentavos (:218).
- apps/web/heredado/components/configuracion/ModoPresentacion.jsx — NO ATRIBUIBLE a propinas: apareció modificado a mitad de esta revisión.
- packages/app/package.json — NO ATRIBUIBLE a propinas: el único cambio frente a HEAD es el export './puente-presentacion'. El export './propinas' ya estaba en HEAD (verificado con `git show HEAD:packages/app/package.json`), así que el agente de propinas no necesitó tocarlo.
- packages/app/src/puente/configuracion.ts — NO ATRIBUIBLE a propinas (SOLO_POR_COMANDO / paquete_modo).
- packages/app/src/puente/presentacion.ts — NUEVO, NO ATRIBUIBLE a propinas.
- apps/web/app/api/configuracion/ — NUEVO, NO ATRIBUIBLE a propinas.
- apps/web/app/api/compras/, apps/web/app/api/gastos/, apps/web/app/api/publico/, apps/web/app/api/restaurante/, packages/app/src/compras/, packages/app/src/portal/, packages/app/src/restaurante/ — NUEVOS, de otros módulos que se están escribiendo en paralelo en el mismo árbol.

## Resumen del verificador

Leí los trece archivos del módulo, las dos rutas, el envoltorio `comando()`, `definicion.ts`, `rutaDeComando`, los dos archivos de venta modificados y las migraciones 003/045/046 — y además ejecuté consultas de sólo lectura y una transacción abortada contra la base real de DATABASE_URL. Verdicto: NO CUMPLE, por dos motivos bloqueantes.

BLOQUEANTE 1 — el comando no puede ejecutarse en una segunda sucursal. `liquidar.ts:95` toma el folio con un contador por sucursal (`folios_pkey` = org+sucursal+serie) y lo inserta contra `liquidaciones_folio_unico`, que es único POR ORGANIZACIÓN (org+serie+folio). Reproduje la colisión exacta en la base (`23505 · liquidaciones_folio_unico`), dentro de una transacción que reverti: nada quedó escrito. Como la reversión devuelve el consecutivo, la segunda sucursal queda bloqueada de forma permanente, no intermitente.

BLOQUEANTE 2 — las 34 pruebas no ejecutan el cuerpo del comando ni una sola vez. Las cuatro pruebas «con los comandos REALES» mueren en las puertas (paquete, rol, idempotencia) antes de `ejecutar`. Lo demostré saboteando liquidar.ts en tres sitios a la vez —total fijo en 1 centavo, guarda de PROPINA_YA_LIQUIDADA neutralizada, lista de órdenes ignorada— y la suite siguió dando 34/34 en verde. La afirmación central del entregable («una propina no se liquida dos veces», «el total lo suma el servidor») no la respalda ninguna prueba repetible; el archivo de humo que el informe cita fue borrado.

Lo que SÍ está bien y comprobé una por una: (1) ningún esquema acepta total, precio ni rol — `entradaLiquidarPropinas` y `entradaPropinasPendientes` no declaran dinero y zod descarta un `totalCentavos` colado; el único importe es la propina POR MÉTODO, que es legítima aunque no tenga tope (ver GRAVE). (2) La autorización sale de `ctx.ambito.rol` en comando.ts:98, antes de tocar la base, y `definicion.ts:23-36` prohíbe declarar `rol`/`organizacionId` en la entrada; los ROLES de los dos comandos son constantes estáticas. (3) No hay ni un catch vacío, `.catch(() => {})` ni try sin relanzar en todo el módulo. (4) Cero `any`, `as unknown as`, `@ts-ignore` o `eslint-disable`. (5) El dinero es bigint de centavos de principio a fin: no hay `Math.round(x*100)`, ni `parseFloat`, ni aritmética de pesos; el único `Number()` (fragmentos.ts:88) convierte un `count(*)`, no un importe. (6) Todo lo transaccional va sobre `ctx.tx`: no hay un solo await fuera de la transacción. (7) Las nueve consultas filtran `organizacion_id` — ninguna lo olvida; las ejecuté las nueve contra la base real y todas compilan y corren. (8) Las pruebas de aritmética pura sí afirman de verdad: mutando `suma += monto` para que la propina cubriera la venta caen 3, y sustituyendo el desglose exacto por uno proporcional caen 4.

Lo que falla además de los dos bloqueantes: `ordenIds: []` liquida todo el periodo en vez de nada, contradiciendo su propio comentario; ninguna consulta filtra por sucursal aunque la fila se selle con la sucursal de la sesión, de modo que una sucursal liquida y lee las propinas de la otra; `marcarPropinaDeOrden` sobrescribe las tres columnas de propina de la orden y destruye lo que escribió `portal.pedir_cuenta`; y `propinaCentavos` es el único campo de dinero del cobro sin cota, con vía directa a `movimientos_caja` y por tanto al efectivo esperado del corte.

Ficheros: el agente tocó exactamente los dos archivos ajenos autorizados (`venta/pagos.ts` y `venta/cobrar.ts`) y nada más; revisé el reemplazo de `repoOrdenes.registrarPago` línea a línea y no pierde ningún efecto. El resto de lo que aparece sucio en `git status --short` pertenece a otros módulos que se están escribiendo en paralelo en el mismo árbol (presentación/configuración, compras, portal, restaurante) — apareció a mitad de esta revisión y no es atribuible a propinas. No modifiqué nada: todas las mutaciones que hice para probar las pruebas quedaron restauradas y verificadas con `diff -q`, y las tres puertas vuelven a dar verde sobre el árbol original.
