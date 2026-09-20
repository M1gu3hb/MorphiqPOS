# 05 · DATOS Y BACKEND · Restaurante de mesa

Todo lo que sigue se escribe **como si ya estuviera dentro del monorepo** (D-05): mismos
contratos, mismos nombres, misma estructura. Las migraciones se escriben numeradas y listas y
**no se aplican**.

Reglas heredadas que condicionan cada línea de este archivo:

- Dinero en **bigint de centavos**. Nunca flotantes.
- Precios y totales **siempre** en el servidor. El endpoint no acepta importes del cliente.
- Autorización **por sesión**. Un comando que declare `rol`, `organizacion_id`, `sucursal_id`,
  `empleo_id`, `identidad_id` o `terminal_id` en su entrada **no compila**.
- Cobro, caja, stock y pedido: **transaccionales e idempotentes**.
- Stock: ledger inmutable, decremento atómico, falla en vez de silenciar.
- Migraciones nuevas y numeradas. Nunca editar una aplicada: el ejecutor valida por hash.
- Cero SQL concatenado. Cero `any`, cero `@ts-ignore`, cero `catch` vacío.

La última migración aplicada es **`057_resumen_pagos_por_orden.sql`**. Lo nuevo arranca en **060**,
dejando 058 y 059 libres para lo que Codex cierre en la Fase 1.

---

## 1 · ENTIDADES NUEVAS

Siete tablas y dos vistas. Todas llevan `organizacion_id` y `sucursal_id` con RLS, como el resto
del esquema.

### 1.1 · `movimientos_cuenta` — la bitácora de qué le pasó a una cuenta

Sostiene **F-321, F-302, F-303 y F-324** de una sola vez. Las cuatro son la misma operación de
fondo —mover líneas entre cuentas o entre mesas— y sin una bitácora común un ticket dividido deja
de ser auditable.

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | uuid | pk |
| `organizacion_id`, `sucursal_id` | uuid | not null, fk |
| `tipo` | text | not null, `check in ('division','union','separacion','cambio_mesa','anulacion_linea','traspaso_linea')` |
| `orden_origen_id` | uuid | not null, fk `ordenes` |
| `orden_destino_id` | uuid | null, fk `ordenes` |
| `mesa_origen_id` | uuid | null, fk `mesas` |
| `mesa_destino_id` | uuid | null, fk `mesas` |
| `lineas` | jsonb | not null, `[{linea_id, cantidad, producto_nombre, importe_centavos}]` |
| `motivo` | text | null — **not null cuando `tipo = 'anulacion_linea'`**, por `check` |
| `empleado_id` | uuid | not null, fk |
| `created_at` | timestamptz | not null, default now() |

**Inmutable**: sin `updated_at`, sin `update`, sin `delete`. Igual que `movimientos_stock`.

### 1.2 · `uniones_mesa` y `union_mesa_miembros` — F-302

```
uniones_mesa
  id · organizacion_id · sucursal_id
  mesa_principal_id  uuid not null fk mesas
  orden_id           uuid not null fk ordenes      ← la cuenta única del grupo
  abierta_en         timestamptz not null
  cerrada_en         timestamptz null
  empleado_id        uuid not null

union_mesa_miembros
  union_id  uuid not null fk uniones_mesa on delete cascade
  mesa_id   uuid not null fk mesas
  pk (union_id, mesa_id)
```

**Por qué dos tablas y no una columna `mesa_padre_id` en `mesas`.** Porque una unión tiene
principio y fin, y con una columna no se puede saber que anoche las mesas 4 y 5 estuvieron unidas.
La rotación de mesas (F-305) necesita ese histórico para no contar dos ocupaciones donde hubo una.

### 1.3 · `eventos_mesa` — F-305

Ledger inmutable de transiciones. Es el que permite calcular por fin el número que este negocio
no puede calcular hoy: cuánto dura una mesa.

| Campo | Tipo |
|---|---|
| `id` | uuid pk |
| `mesa_id` | uuid not null fk |
| `orden_id` | uuid null fk |
| `estado_anterior` | text null |
| `estado_nuevo` | text not null, `check` contra los diez estados vivos |
| `personas` | int null |
| `empleado_id` | uuid null |
| `ocurrido_en` | timestamptz not null default now() |

**Índice** `(mesa_id, ocurrido_en desc)` y `(sucursal_id, ocurrido_en desc)`.

### 1.4 · `lista_espera` — F-306

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `nombre` | text not null | Lo que se grita: "familia Pérez" |
| `telefono` | text null | Para avisar por WhatsApp en vez de gritar |
| `personas` | int not null, `check > 0` | |
| `estado` | text not null | `esperando` · `avisado` · `sentado` · `abandono` |
| `mesa_id` | uuid null fk | Se llena al sentar |
| `orden_id` | uuid null fk | Se llena al sentar |
| `espera_estimada_minutos` | int null | Calculado del promedio real de F-305, no tecleado |
| `creada_en`, `avisada_en`, `sentada_en` | timestamptz | |
| `notas` | text null | "quieren terraza", "traen carriola" |

### 1.5 · `impresiones_comanda` — F-318

Es una **cola**, no una acción. Las impresoras térmicas de cocina fallan por papel, por calor y
por red, y una impresión que se pierde en silencio es un plato que nunca sale.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `comanda_id` | uuid not null fk | |
| `estacion_preparacion_id` | uuid not null fk | Cada estación es una impresora |
| `destino` | text not null | Instantánea de la impresora al encolar |
| `estado` | text not null | `pendiente` · `impresa` · `fallida` |
| `intentos` | int not null default 0 | |
| `ultimo_intento_en` | timestamptz null | |
| `mensaje_error` | text null | |
| `es_reimpresion` | boolean not null default false | Una reimpresión se marca en el papel |
| `created_at` | timestamptz not null | |

**Índice único parcial** `(comanda_id, estacion_preparacion_id) where es_reimpresion = false` — una
comanda se imprime una vez por estación, y el reintento no duplica el papel.

### 1.6 · `esquemas_propina` y `esquema_propina_puntos` — F-242

```
esquemas_propina
  id · organizacion_id · sucursal_id
  nombre           text not null        "Reparto 2026"
  vigente_desde    date not null
  vigente_hasta    date null
  activo           boolean not null default true
  exclusion daterange sin traslape por sucursal (constraint EXCLUDE)

esquema_propina_puntos
  esquema_id  uuid not null fk on delete cascade
  puesto      text not null   'mesero'|'garrotero'|'barra'|'cocina'|'lavaloza'|'caja'
  puntos      numeric(6,2) not null check (puntos >= 0)
  pk (esquema_id, puesto)
```

**Por qué versionado con vigencia y no un campo editable.** Porque cambiar el reparto **no puede**
reescribir liquidaciones pasadas. Si el dueño sube los puntos de cocina en marzo, la liquidación
de febrero tiene que seguir enseñando la fórmula de febrero. Sin esto, el sistema resuelve un
pleito y crea otro.

### 1.7 · `liquidacion_propina_beneficiarios` — F-242

| Campo | Tipo |
|---|---|
| `liquidacion_id` | uuid not null fk on delete cascade |
| `empleado_id` | uuid not null fk |
| `puesto` | text not null — instantánea |
| `puntos` | numeric(6,2) not null — instantánea |
| `monto_centavos` | bigint not null, `check >= 0` |
| pk | `(liquidacion_id, empleado_id)` |

**Restricción de la base, no de la aplicación:** la suma de `monto_centavos` de una liquidación
tiene que igualar su `total_centavos`. Se impone con un trigger de constraint diferido. El
redondeo de la última fracción va al de más puntos, y eso queda escrito en la liquidación.

### 1.8 · `consumos_internos` — F-261

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `tipo` | text not null | `personal` · `cortesia` · `reposicion` · `degustacion` |
| `orden_id` | uuid null fk | Sólo en cortesía y reposición |
| `producto_id` | uuid not null fk | |
| `producto_nombre` | text not null | Instantánea |
| `cantidad` | numeric not null, `check > 0` | |
| `costo_centavos` | bigint not null | Calculado en el servidor desde la receta |
| `motivo` | text not null | |
| `empleado_id` | uuid not null fk | Quién lo autorizó |
| `created_at` | timestamptz not null | |

Escribe además movimientos en `movimientos_stock` con `referencia_tipo = 'consumo_interno'`, en la
misma transacción. **Sale del stock, no entra a ventas.**

### 1.9 · Vistas

```
ocupacion_mesas                            ← F-305
  Sobre `eventos_mesa`. Por cada ciclo abierto→liberada de una mesa:
  mesa_id, orden_id, personas, inicio, fin, minutos_ocupada, minutos_hasta_cuenta.
  Es la base de la rotación, de la espera estimada y del dashboard futuro.

tiempos_preparacion                        ← F-315
  Sobre `comandas` y `comanda_items`. Por item: minutos_estimados (del producto),
  minutos_reales (marcha → listo), desviacion_bp, estacion_id.
```

---

## 2 · ENTIDADES EXISTENTES QUE HAY QUE EXTENDER

| Tabla | Campo nuevo | Tipo | Para qué |
|---|---|---|---|
| `ordenes` | `orden_padre_id` | uuid null fk `ordenes` | F-321. La cuenta hija apunta a la que se dividió |
| `ordenes` | `division_indice` | int null | F-321. "2 de 4" impreso en el ticket |
| `ordenes` | `union_id` | uuid null fk `uniones_mesa` | F-302 |
| `orden_lineas` | `anulada_en` | timestamptz null | F-324 |
| `orden_lineas` | `motivo_anulacion` | text null | F-324, `check`: not null si `anulada_en` not null |
| `orden_lineas` | `empleado_anula_id` | uuid null fk | F-324 |
| `orden_lineas` | `marcha_estado` | text not null default `'inmediata'` | F-323: `inmediata` · `retenida` · `marchada` |
| `orden_lineas` | `tiempo_servicio` | int null | F-323: 1, 2, 3… el "tiempo" del menú |
| `comanda_items` | `iniciado_en` | timestamptz null | F-315 |
| `comanda_items` | `listo_en` | timestamptz null | F-315 |
| `comanda_items` | `minutos_estimados` | int null | F-315, instantánea del producto al comandar |
| `comandas` | `marchada_en` | timestamptz null | F-323. El reloj de F-315 arranca **aquí**, no al crear |
| `estaciones_preparacion` | `impresora_destino` | text null | F-318 |
| `estaciones_preparacion` | `impresion_automatica` | boolean not null default false | F-318 |
| `mesas` | `ocupada_desde` | timestamptz null | F-305, desnormalización de conveniencia para el mapa |
| `liquidaciones_propina` | `esquema_id` | uuid null fk `esquemas_propina` | F-242. Null = reparto directo al mesero (el de hoy) |
| `liquidaciones_propina` | `formula_snapshot` | jsonb null | F-242. La fórmula usada, congelada |
| `productos` | `tiempo_servicio_default` | int null | F-323. La entrada es tiempo 1, el fuerte tiempo 2 |
| `configuracion` (documento) | `descuento_maximo_bp` | objeto por rol | F-205 |

---

## 3 · REGLAS DE INTEGRIDAD QUE GARANTIZA LA BASE

No la aplicación. La base. Ésta es la diferencia entre un sistema que cuadra y uno que cuadra
mientras nadie abra dos pestañas.

1. **Una mesa no puede tener dos cuentas vivas.** Índice único parcial sobre
   `ordenes (mesa_id) where estado in ('borrador','confirmada')`. Cierra de raíz la mesa huérfana.
2. **Una cuenta dividida no se puede cobrar.** `check`: si `estado = 'dividida'` entonces no puede
   haber pagos. La que se cobra es la hija.
3. **La suma de las hijas iguala a la madre.** Trigger de constraint diferido sobre
   `ordenes.total_centavos` cuando existe `orden_padre_id`. Si no cuadra, la transacción entera
   falla. Dividir una cuenta y perder $40 en el camino no puede ser posible.
4. **Una línea anulada no puede tener comanda activa.** `check` cruzado: anular la línea exige
   que su `comanda_item` esté en estado `cancelado`.
5. **Una línea anulada exige motivo.** `check (anulada_en is null) = (motivo_anulacion is null)`.
6. **Una mesa unida no puede tener cuenta propia.** `check`: si la mesa está en
   `union_mesa_miembros` con la unión abierta, su `orden_activa_id` es null, salvo la principal.
7. **Los esquemas de propina no se traslapan.** `EXCLUDE USING gist` sobre
   `(sucursal_id with =, daterange(vigente_desde, vigente_hasta) with &&)`.
8. **El reparto de una liquidación suma su total.** Trigger de constraint diferido.
9. **Una comanda se imprime una vez por estación.** Índice único parcial, ya descrito.
10. **El signo del ledger lo impone el tipo.** Ya existe y se extiende a los tipos nuevos
    (`consumo_interno`, `anulacion`): entradas positivas, salidas negativas, con `check`.
11. **No se cierra la caja con cuentas vivas.** Se valida en el comando **y** con un `check` sobre
    el cierre: la sesión de caja no pasa a `cerrada` si existe una orden en `borrador` o
    `confirmada` con `sesion_caja_id` apuntando a ella. **F-262.**
12. **`consumos_internos` nunca toca `ordenes`.** No hay ruta por la que un consumo interno se
    convierta en venta. Es una restricción de modelo, y está escrita aquí para que nadie la
    "mejore" después.

---

## 4 · COMANDOS

Todos pasan por `comando()`: rol → paquete → validación → idempotencia → transacción → auditoría.
Ninguno acepta ámbito en su entrada: el ámbito nace de la sesión y se relee de la base en cada
petición.

| Comando | Entrada | Roles | Paquete | Qué escribe | Idem. |
|---|---|---|---|---|---|
| `dividirCuenta` | `{ordenId, particiones:[{lineas:[{lineaId,cantidad}]}], clave}` | administrador, caja | restaurante | N `ordenes` hijas con folio propio, mueve `orden_lineas`, marca la madre `dividida`, escribe `movimientos_cuenta` | **Sí** |
| `unirMesas` | `{mesaPrincipalId, mesaIds[], clave}` | administrador, caja, mesero | restaurante | `uniones_mesa` + miembros, mueve líneas a la cuenta principal, cierra las cuentas absorbidas, `movimientos_cuenta`, `eventos_mesa` | **Sí** |
| `separarMesas` | `{unionId, clave}` | administrador, caja, mesero | restaurante | Cierra la unión, libera las mesas miembro, `movimientos_cuenta` | **Sí** |
| `cambiarMesa` | `{ordenId, mesaDestinoId, clave}` | administrador, caja, mesero | restaurante | Reapunta `ordenes.mesa_id`, **reapunta las comandas vivas**, libera origen, ocupa destino, `movimientos_cuenta`, `eventos_mesa` | **Sí** |
| `anularLinea` | `{ordenId, lineaId, cantidad?, motivo, nota?, clave}` | administrador, caja | restaurante | Marca la línea (o la parte anulada, en fila hermana), ajusta su `comanda_item`, recotiza la cuenta, `movimientos_cuenta` | **Sí** |

> **Corregido el 15-09-2026 al construir F-324.** Esta fila decía que `anularLinea`
> «revierte el consumo si ya se cobró». **Eso es F-222, devolución, y es otro camino.**
> Una cuenta cobrada se devuelve; darle a la anulación una segunda puerta al reembolso lo
> dejaría fuera del control de F-222 —folio, motivo, método por el que vuelve el dinero—.
> F-324 se acota a cuentas vivas y su mensaje de error manda a devolución. El inventario no
> se toca porque **no se había descontado**: el stock sale al COBRAR (regla 5 de `F1-01` §3),
> así que una cuenta que nunca se cobró no tiene nada que revertir. El platillo que la cocina
> sí preparó y se tiró se registra con **F-261**, tipo `reposicion`, que es donde ese costo
> pertenece.
| `marcharTiempo` | `{ordenId, tiempoServicio, clave}` | mesero, caja, administrador | restaurante | Pasa las líneas `retenida` → `marchada`, crea o libera la comanda, sella `comandas.marchada_en` | **Sí** |
| `registrarEspera` | `{nombre, telefono?, personas, notas?}` | caja, mesero, administrador | restaurante | `lista_espera` | No |
| `sentarEspera` | `{esperaId, mesaId, clave}` | caja, mesero, administrador | restaurante | Cierra la espera y abre la mesa en la misma transacción | **Sí** |
| `encolarImpresionComanda` | `{comandaId, estacionId?, esReimpresion?}` | cocina, caja, administrador | restaurante | `impresiones_comanda` | **Sí** |
| `marcarImpresion` | `{impresionId, resultado, error?}` | terminal de impresión | restaurante | Actualiza estado e intentos | **Sí** |
| `guardarEsquemaPropina` | `{nombre, vigenteDesde, puntos:[{puesto,puntos}]}` | dueño, administrador | restaurante | `esquemas_propina` + puntos, cierra la vigencia del anterior | No |
| `liquidarPropinas` *(se extiende)* | `{rango, esquemaId?, clave}` | dueño, administrador | restaurante | `liquidaciones_propina` + **beneficiarios**, marca las ventas | **Sí** (ya lo es) |
| `registrarConsumoInterno` | `{tipo, productoId, cantidad, motivo, ordenId?, clave}` | administrador, gerente | restaurante | `consumos_internos` + movimientos de stock | **Sí** |
| `autorizarDescuento` | `{ordenId, montoBp, pinSupervisor}` | caja (solicita), administrador (autoriza) | todos | Registra la autorización en la bitácora y libera el descuento | **Sí** |

**Nota sobre el modo "partes iguales" de F-321.** No necesita comando nuevo ni tabla nueva.
`cobrarVenta` ya recibe un arreglo de `pagos`, y una cuenta dividida en partes iguales es **una
cuenta con N pagos**, cada uno con su método y su propina exacta. Dividir por consumo sí mueve
líneas y por eso sí necesita `dividirCuenta`. Son dos cosas distintas y modelarlas igual sería el
error clásico del giro.

---

## 5 · ENTRADAS DEL PUENTE

Se declaran en `packages/app/src/puente/mapa.ts`, con `rolesLectura` **obligatorio** a nivel de
tipo. Lo que no se declara no se lee.

| Entidad expuesta | Tabla | `rolesLectura` | Escritura | Campos que se descartan |
|---|---|---|---|---|
| `MovimientoCuenta` | `movimientos_cuenta` | dueño, administrador, gerente, cajero | `comando` | Ninguno |
| `UnionMesa` | `uniones_mesa` | operación restaurante | `comando` | Ninguno |
| `EventoMesa` | `eventos_mesa` | dueño, administrador, gerente | `lectura` | Ninguno |
| `EsperaMesa` | `lista_espera` | operación restaurante | `comando` | `telefono` fuera de dirección y caja — es dato personal y el mesero no lo necesita |
| `ImpresionComanda` | `impresiones_comanda` | dueño, administrador, gerente, cocina | `comando` | `mensaje_error` sólo dirección |
| `EsquemaPropina` | `esquemas_propina` | dueño, administrador, gerente | `directa` | Ninguno |
| `BeneficiarioPropina` | `liquidacion_propina_beneficiarios` | dueño, administrador | `comando` | `monto_centavos` **sólo dirección**: un mesero no ve lo que se le liquidó a otro |
| `ConsumoInterno` | `consumos_internos` | dueño, administrador, gerente | `comando` | `costo_centavos` sólo quienes ven márgenes |
| `OcupacionMesa` | vista `ocupacion_mesas` | dueño, administrador, gerente | `lectura` | Ninguno |
| `TiempoPreparacion` | vista `tiempos_preparacion` | dueño, administrador, gerente, cocina | `lectura` | Ninguno |

**Ampliaciones a entidades existentes del puente:** `Venta` gana `orden_padre_id`,
`division_indice` y `union_id`; `DetalleVenta` gana `anulada_en`, `motivo_anulacion`,
`marcha_estado` y `tiempo_servicio`; `PedidoPreparacionItem` gana `iniciado_en`, `listo_en` y
`minutos_estimados`; `EstacionPreparacion` gana `impresora_destino` e `impresion_automatica`.

**Regla que se mantiene sin excepción:** cocina nunca lee costos, márgenes ni gramajes. Se declara
por campo, no por entidad, porque cocina **tiene** que leer el nombre y la cantidad del platillo y
cerrar la entidad entera dejaría su pantalla en blanco.

---

## 6 · RUTAS DE API NUEVAS

Mismo patrón que las existentes: una ruta por comando, `POST`, cuerpo validado por esquema, ámbito
desde la sesión.

```
apps/web/app/api/restaurante/dividir-cuenta/route.ts
apps/web/app/api/restaurante/unir-mesas/route.ts
apps/web/app/api/restaurante/separar-mesas/route.ts
apps/web/app/api/restaurante/cambiar-mesa/route.ts
apps/web/app/api/restaurante/anular-linea/route.ts
apps/web/app/api/restaurante/marchar-tiempo/route.ts
apps/web/app/api/restaurante/espera/registrar/route.ts
apps/web/app/api/restaurante/espera/sentar/route.ts
apps/web/app/api/restaurante/imprimir-comanda/route.ts
apps/web/app/api/restaurante/impresion/resultado/route.ts
apps/web/app/api/propinas/esquema/route.ts
apps/web/app/api/inventario/consumo-interno/route.ts
apps/web/app/api/venta/autorizar-descuento/route.ts
```

Lecturas, por el puente ya existente (`/api/datos/consultar`), sin rutas nuevas.

---

## 7 · MIGRACIONES

Numeradas, en orden, **escritas y no aplicadas**. Cada una es independiente y reversible por
compensación, nunca editando la anterior.

| Nº | Archivo | Qué crea |
|---|---|---|
| **070** | `070_movimientos_cuenta.sql` | Tabla `movimientos_cuenta`, sus índices y su RLS. Columnas `orden_padre_id`, `division_indice` en `ordenes`; `anulada_en`, `motivo_anulacion`, `empleado_anula_id` en `orden_lineas`. Índice único parcial de una cuenta viva por mesa. Trigger de constraint de suma madre/hijas |
| **071** | `071_union_y_cambio_de_mesa.sql` | `uniones_mesa`, `union_mesa_miembros`, `ordenes.union_id`, sus `check` y su RLS |
| **072** | `072_eventos_mesa.sql` | `eventos_mesa` + `mesas.ocupada_desde` + vista `ocupacion_mesas` + backfill del estado actual como evento inicial |
| **073** | `073_lista_espera.sql` | `lista_espera`, índices por estado y fecha, RLS |
| **074** | `074_tiempos_y_marcha.sql` | `orden_lineas.marcha_estado`, `orden_lineas.tiempo_servicio`, `productos.tiempo_servicio_default`, `comandas.marchada_en`, `comanda_items.iniciado_en/listo_en/minutos_estimados`, vista `tiempos_preparacion` |
| **075** | `075_impresion_comanda.sql` | `impresiones_comanda`, índice único parcial, `estaciones_preparacion.impresora_destino` e `impresion_automatica` |
| **076** | `076_esquemas_propina.sql` | `esquemas_propina`, `esquema_propina_puntos`, `liquidacion_propina_beneficiarios`, `liquidaciones_propina.esquema_id` y `formula_snapshot`, constraint de exclusión por vigencia, trigger de suma |
| **077** | `077_consumos_internos.sql` | `consumos_internos`, ampliación del `check` de tipos de `movimientos_stock` con `consumo_interno` y `anulacion` |
| **078** | `078_tope_descuento.sql` | `descuento_maximo_bp` en el documento de configuración + bitácora de autorizaciones |
| **066** | `066_plantillas_semilla.sql` | **D-01**: renombra el valor `restaurante_pro` a `restaurante` en `paquete`, con actualización de los negocios vivos y `check` nuevo. Va al final a propósito: es la que toca datos de producción |

**Sobre la 066.** Es la única que migra datos de clientes que están operando. No se aplica sin
respaldo probado y sin la respuesta de Miguel a la decisión pendiente **P-04**. Escribirla ahora y
dejarla lista es correcto; aplicarla sin eso, no.

> **Corregido el 15-09-2026.** Este párrafo decía «Sobre 069», un número que la tabla de arriba
> no lista: la consolidación de la etapa 0 convirtió las cinco migraciones de plantilla en la
> **066**, y la advertencia le corresponde a ella.

**Lo que de verdad se escribió en la Fase 2, y en qué orden.** La tabla de arriba es el plan; esto
es el resultado, para que quien acople no tenga que deducirlo de `git log`:

| Nº | Archivo | Función | Estado |
|---|---|---|---|
| **070** | `070_movimientos_cuenta.sql` | F-321 + las columnas de F-324 | escrita |
| **071** | `071_union_y_cambio_de_mesa.sql` | F-302 y F-303 | escrita |
| **072** | `072_eventos_mesa.sql` | F-305 | escrita |
| **073** | `073_lista_espera.sql` | F-306 | escrita |
| **074** | `074_tiempos_y_marcha.sql` | F-323 y F-315 | escrita |
| **075** | — | F-318 impresión de comanda | **BLOQUEADA**, esperando la decisión de Miguel entre agente local, impresora de red y `window.print()` |
| **076** | `076_esquemas_propina.sql` | F-242 **y F-325** | escrita |
| **077** | `077_consumos_internos.sql` | F-261 | escrita |
| **078** | — | F-205 tope de descuento | fuera del alcance de estas cinco funciones |

> **F-325 no tenía migración asignada** y comparte la 076 con F-242 a propósito: las dos
> contestan «a quién le toca esta propina», y el reparto por puntos necesita el ledger de
> relevos para saber quién estuvo en el piso.

---

## 8 · DEPENDENCIAS EXTERNAS

| Dependencia | Versión | Para qué | Por qué ésa |
|---|---|---|---|
| `jspdf` | ya en uso | PDF del corte y del periodo | Ya está integrada y funciona sin conexión. Cambiarla por generación en servidor es trabajo sin beneficio para el usuario |
| `html2canvas` | ya en uso | Rasteriza el nodo del corte | Permite que el PDF se vea **idéntico** a lo que se ve en pantalla. Es lo que hace que el dueño confíe en el documento |
| `date-fns` + locale `es` | ya en uso | Fechas y tiempos relativos | Ligera, tree-shakeable y con locale español correcto |
| `recharts` | ya en uso | La dona de métodos de pago | Una sola gráfica en todo el sistema. No se agregan más |
| **Impresión térmica ESC/POS** | **nueva** | F-318 | Ver abajo |

**La decisión de F-318, que hay que tomar antes de construir.** Tres caminos:

1. **Agente local** en la PC de la cocina que escucha la cola y manda ESC/POS por USB o red.
   Es lo que hacen Soft Restaurant y los sistemas instalados. Funciona sin internet, que en una
   cocina mexicana no es un detalle menor. Cuesta un instalador y soporte de Windows.
2. **Impresora de red directa** desde el servidor por IP y puerto 9100. No necesita instalar nada,
   pero exige que la impresora esté en red y que el servidor alcance la red del local — lo que en
   la práctica significa VPN o túnel, y eso es frágil.
3. **`window.print()` sobre una plantilla de 80 mm** desde la pantalla de cocina. Es lo más barato
   y lo peor: exige que alguien toque la pantalla para imprimir, que es justo lo que F-318 viene a
   evitar.

**Recomendación: (1), con (3) como salida de emergencia.** El agente local es lo que el giro
espera y lo que sobrevive a que se caiga el internet a media cena. La cola `impresiones_comanda`
está diseñada para soportar cualquiera de las tres sin cambiar el modelo de datos.

**Integraciones con terceros que NO entran en este modelo:** PAC de facturación (llega con CFDI,
transversal a los 78), pasarela de pago (no aplica: se cobra en mostrador), WhatsApp (sólo cuando
entre F-306 para avisar a la lista de espera), mapas (no aplica).

---

## 9 · QUÉ SE REUTILIZA TAL CUAL

Lo que **no se toca** porque ya funciona. Rutas reales del monorepo.

| Pieza | Ruta | Se reutiliza para |
|---|---|---|
| Envoltorio de comandos | `packages/app/src/definicion.ts` | Los catorce comandos nuevos |
| Mapa del puente | `packages/app/src/puente/mapa.ts` | Las diez entidades nuevas se declaran aquí |
| Roles del puente | `packages/app/src/puente/roles.ts` | `rolesLectura` de lo nuevo |
| Comandos de mesa | `packages/app/src/restaurante/mesas-escrituras.ts` | `unirMesas`, `separarMesas`, `cambiarMesa` extienden este módulo |
| Transiciones de mesa | `packages/app/src/restaurante/transiciones.ts` | La máquina de estados que `eventos_mesa` va a sellar |
| Comandas y preparación | `packages/app/src/restaurante/comandas.ts`, `preparacion-escrituras.ts` | `marcharTiempo` y la cola de impresión |
| Propagación de alergias | `packages/app/src/restaurante/propagacion.ts` | Se conserva íntegra al dividir y al cambiar de mesa |
| Cobro y pagos | `packages/app/src/venta/pagos.ts`, `escala.ts` | El modo "partes iguales" de F-321 no toca nada de aquí |
| Propinas: desglose, folio, rango | `packages/app/src/propinas/desglose.ts`, `folio.ts`, `rango.ts` | F-242 se apoya en los tres sin modificarlos |
| Liquidación | `packages/app/src/propinas/liquidadas.ts` | Se extiende con beneficiarios, no se reescribe |
| Caja y turno | `packages/app/src/caja/turno.ts` | Sin cambios |
| Inventario | `packages/app/src/inventario/index.ts` | `consumosInternos` escribe por aquí |
| Centavos | `packages/domain/src/dinero/centavos.ts` | Todo el dinero nuevo |
| Primitivas de interfaz | `packages/ui/src/primitivas/` | Las pantallas nuevas no traen componentes propios |
| Tokens de diseño | `packages/ui/src/tokens/` | Colores de estado, espaciado, radios |
| Documento del corte | `apps/web/heredado/components/tickets/CorteTicket.jsx` | Gana dos secciones (reparto por puntos y consumos internos). El resto queda igual |
| Desglose exacto | `apps/web/heredado/utils/tipsUtils.js` | **Intacto.** Es la pieza mejor resuelta del sistema |
| Conversión de unidades | `apps/web/heredado/utils/unitConversions.js` | F-261 la necesita para costear el consumo interno |
| Utilidades de estación | `apps/web/heredado/utils/preparacionEstacionUtils.js` | El ruteo de impresión reutiliza el ruteo de pantalla |

**Lo que hay que tocar del heredado, y es poco:** `Mesero.jsx` (acciones de unir, cambiar y
marchar), `Caja.jsx` (dividir cuenta), `Cocina.jsx` (umbrales de tiempo y botón de reimprimir),
`CorteTicket.jsx` (dos secciones). Nada de eso se toca **mientras Codex siga en la Fase 1**.
