# 05 · DATOS Y BACKEND · Estética / salón de belleza

Se construye **aparte** del punto de venta pero **como si ya estuviera dentro**: mismos contratos,
mismos nombres, misma estructura de carpetas. Migraciones numeradas y **no aplicadas**
(`00-LEEME-PRIMERO.md` §3).

Las reglas de la Fase 1 que mandan sobre todo lo que sigue:

- **bigint de centavos.** Nunca flotantes, nunca `Math.round(x*100)`.
- **Precios y totales en el servidor.** El comando no acepta importes del cliente.
- **Autorización por sesión.** Un comando que declare `rol`, `organizacion_id`, `sucursal_id`,
  `empleo_id`, `identidad_id` o `terminal_id` **no compila**.
- **Cero SQL concatenado.** Kysely, siempre.
- **Migraciones nuevas, numeradas, nunca editar una aplicada.**

**Numeración:** `abarrotes` reservó 070–082 y `ferreteria` 083–095. **Este modelo arranca en 096.**

---

## 1 · LO QUE HACE DISTINTO A ESTE BACKEND

Tres cosas que ningún modelo anterior necesitó, y que hay que decidir antes de escribir una tabla:

**1 · La cita no es una orden.** Nace días antes de que exista dinero, puede reprogramarse, puede no
ocurrir nunca. `citas` es una entidad propia que **en algún momento engendra una orden**, y muchas
veces nunca lo hace. Modelarla como un estado de `ordenes` obliga a tener órdenes fantasma en $0 que
contaminan toda la venta.

**2 · El solapamiento se impide en la base, no en la aplicación.** Dos recepcionistas agendando desde
dos dispositivos es el caso normal. Una validación en el comando tiene una ventana de carrera; una
**restricción de exclusión GiST** no la tiene. Ver §4.1.

**3 · La comisión es un ledger, no un cálculo.** Mismo patrón que `movimientos_stock`, por la misma
razón y con más fuerza: **un número que cambia solo después de que una persona lo vio destruye la
confianza**. Ver §2.7 y §4.3.

---

## 2 · ENTIDADES NUEVAS

Todas llevan `organizacion_id`, `sucursal_id`, `creado_en`, `creado_por`, `actualizado_en` y RLS por
organización, como el resto del esquema. No se repiten abajo.

### 2.1 · `profesionales`

Extiende `empleados`, no lo sustituye. **Un profesional independiente puede no tener `empleado_id`.**

```
profesionales
  id                      uuid pk
  empleado_id             uuid null → empleados(id)   ← NULL si renta (F-441)
  nombre_completo         text not null
  nombre_corto            text not null   check (char_length ≤ 10)  ← cabe en la columna
  foto_url                text null
  tipo_relacion           text not null
     check in ('empleado','empleado_comision','independiente_renta')
  nivel                   text not null default 'estilista'
     check in ('junior','estilista','senior','director')
  color_agenda            text not null   check (~ '^#[0-9a-f]{6}$')
  regla_comision_id       uuid null → reglas_comision(id)
  activo                  boolean not null default true
  orden_agenda            int not null default 0        ← orden de las columnas

  check (tipo_relacion = 'independiente_renta' or empleado_id is not null)
  check (tipo_relacion <> 'independiente_renta' or regla_comision_id is null)
```

**Por qué `empleado_id` nullable y con check:** Sol no es empleada. Si se fuerza a serlo, entra en la
nómina, en los permisos de empleado y en los reportes de venta del salón, y **los cuatro errores de
`02-DINERO-Y-CAJA.md` §7.4** ocurren a la vez.

### 2.2 · `horarios_profesional` y `bloqueos_agenda`

```
horarios_profesional
  id                  uuid pk
  profesional_id      uuid not null → profesionales(id)
  dia_semana          smallint not null check (0..6)
  hora_inicio         time not null
  hora_fin            time not null
  vigente_desde       date not null
  vigente_hasta       date null
  check (hora_fin > hora_inicio)

bloqueos_agenda                                    ← F-416
  id                  uuid pk
  profesional_id      uuid null → profesionales(id)  ← NULL = todo el salón
  rango               tstzrange not null
  motivo              text not null
     check in ('comida','curso','personal','vacaciones','junta','cerrado')
  nota                text null
  exclude using gist (profesional_id with =, rango with &&)
```

**`profesional_id` nullable es el cierre del salón entero** (el lunes, un puente, una capacitación).

### 2.3 · `servicios` · extiende el catálogo

No es una tabla nueva de productos: es la extensión de `productos` cuando `tipo = 'servicio'`.

```
servicios
  producto_id             uuid pk → productos(id)
  duracion_activa_1_min   smallint not null check (> 0)   ← aplicación
  duracion_pasiva_min     smallint not null default 0     ← PROCESADO · F-415
  duracion_activa_2_min   smallint not null default 0     ← terminado
  duracion_cierre_min     smallint not null default 0     ← limpieza
  pasivo_intercalable     boolean not null default false
  requiere_estacion       boolean not null default true
  formula_base            jsonb null                      ← sugerencia, NO explota
  regla_comision_id       uuid null → reglas_comision(id) ← si null, la del profesional

  check (duracion_pasiva_min = 0 or duracion_activa_2_min > 0)
```

**`duracion_pasiva_min = 0` es el caso de barbería y de consultorio.** El mismo modelo sirve para los
once vecinos sin ramas.

```
servicios_profesional                              ← F-421 + F-023
  servicio_id             uuid → servicios(producto_id)
  profesional_id          uuid → profesionales(id)
  precio_centavos         bigint null   ← null = el del catálogo
  factor_duracion_bp      int not null default 10000   ← Karla es más rápida
  pk (servicio_id, profesional_id)
```

**`factor_duracion_bp` en puntos base** porque Karla hace el mismo tinte en 80 min y Dany en 110. Si
la agenda usa el mismo número, la de Karla queda con huecos y la de Dany se recorre todos los días.

### 2.4 · `recursos` y `recursos_servicio`

```
recursos                                           ← F-403
  id                  uuid pk
  nombre              text not null      -- "Lavabo 1", "Estación 3", "Secadora"
  tipo                text not null check in ('estacion','lavabo','secadora','cabina','otro')
  capacidad           smallint not null default 1
  activo              boolean not null default true

recursos_servicio
  servicio_id         uuid → servicios(producto_id)
  tipo_recurso        text not null
  tramo               text not null check in ('todo','activa_1','pasiva','activa_2')
  minutos             smallint null      -- null = todo el tramo
  pk (servicio_id, tipo_recurso, tramo)
```

### 2.5 · `citas` y `cita_servicios` · **el núcleo**

```
citas                                              ← F-400
  id                    uuid pk
  folio                 text not null              ← consecutivo por sucursal
  cliente_id            uuid null → clientes(id)   ← NULL sólo en walk-in sin datos
  origen                text not null
     check in ('mostrador','telefono','whatsapp','en_linea','walk_in','recurrente')
  estado                text not null
     check in ('agendada','confirmada','en_curso','terminada','cobrada',
               'no_llego','cancelada','reprogramada')
  agendada_para         timestamptz not null
  llego_en              timestamptz null
  inicio_real           timestamptz null
  fin_real              timestamptz null
  orden_id              uuid null → ordenes(id)    ← se llena AL COBRAR, no antes
  cita_origen_id        uuid null → citas(id)      ← reprogramada de / rehacer de
  es_rehacer            boolean not null default false     ← F-444
  es_cortesia           boolean not null default false
  motivo_cancelacion    text null
  no_llego_marcado_en   timestamptz null
  no_llego_marcado_por  uuid null
  notas                 text null

  check (estado <> 'cobrada' or orden_id is not null)
  check (estado <> 'no_llego' or no_llego_marcado_en is not null)
  check (not es_rehacer or cita_origen_id is not null)
```

**`orden_id` nullable y llenado al cobrar** es la decisión del §1.1. Una cita que no se cobró nunca
—no llegó, se canceló, fue cortesía— **no genera orden**, y por lo tanto no aparece en ninguna suma
de ventas por accidente.

```
cita_servicios                                     ← la línea de la cita
  id                    uuid pk
  cita_id               uuid not null → citas(id)
  servicio_id           uuid not null → servicios(producto_id)
  profesional_id        uuid not null → profesionales(id)
  precio_centavos       bigint not null            ← congelado al agendar
  rango_activo          tstzrange not null         ← activa_1 + activa_2 (puede ser multirango)
  rango_ocupacion       tstzrange not null         ← todo, incluido pasivo y cierre
  estado                text not null
     check in ('pendiente','en_curso','cerrado','cancelado')
  cerrado_en            timestamptz null           ← dispara el consumo de cabina
  orden_linea_id        uuid null → orden_lineas(id)

  check (rango_activo <@ rango_ocupacion)
  check (estado <> 'cerrado' or cerrado_en is not null)

  exclude using gist (
    profesional_id with =,
    rango_activo   with &&
  ) where (estado <> 'cancelado')                  ← ★ LA RESTRICCIÓN CLAVE
```

**`rango_activo` y `rango_ocupacion` separados es F-415 hecho esquema.** El profesional se bloquea por
el activo; la estación, por el de ocupación. Son dos recursos con disponibilidad distinta al mismo
tiempo, y de ahí sale el 25%–40% de capacidad que ningún competidor aprovecha.

```
cita_recursos
  cita_servicio_id    uuid → cita_servicios(id)
  recurso_id          uuid → recursos(id)
  rango               tstzrange not null
  exclude using gist (recurso_id with =, rango with &&)
```

### 2.6 · `reglas_comision` · **F-440**

```
reglas_comision
  id                      uuid pk
  nombre                  text not null
  version                 int not null default 1
  esquema                 text not null
     check in ('porcentaje_fijo','sueldo_mas_comision','escalonado','sin_comision')
  tasa_servicio_bp        int not null default 0      ← 5000 = 50%
  tasa_producto_bp        int not null default 0
  tasa_venta_paquete_bp   int not null default 0
  base                    text not null
     check in ('cobrado','lista','mitad')                        ← pregunta 1
  sobre_iva               boolean not null default false         ← pregunta 2
  material                text not null
     check in ('salon','descuenta_base','cobra_profesional')     ← pregunta 3 · F-442
  reparto                 text not null default 'por_servicio'
     check in ('por_servicio','todo_a_quien_tomo')               ← pregunta 4 · F-428
  rehacer_paga            boolean not null default false         ← pregunta 5 · F-444
  anticipo_perdido_paga   boolean not null default false
  escalones               jsonb null      -- [{hasta_centavos, tasa_bp}, …]
  tasa_cliente_casa_bp    int null                               ← F-429
  tasa_cliente_propia_bp  int null                               ← F-429
  vigente_desde           date not null
  vigente_hasta           date null

  check (esquema <> 'escalonado' or escalones is not null)
```

**La regla lleva `version` y vigencia y nunca se edita en sitio.** Cambiar el porcentaje de Dany crea
una fila nueva; la anterior se cierra con `vigente_hasta`. **Lo ya causado no se recalcula jamás.**

### 2.7 · `comisiones_causadas` · **F-443 · el ledger**

```
comisiones_causadas
  id                    uuid pk
  orden_linea_id        uuid null → orden_lineas(id)
  cita_servicio_id      uuid null → cita_servicios(id)
  profesional_id        uuid not null → profesionales(id)
  regla_id              uuid not null → reglas_comision(id)
  regla_version         int not null                 ← QUÉ regla, en qué versión
  tipo                  text not null
     check in ('servicio','producto','venta_paquete','ajuste','contrapartida')
  base_centavos         bigint not null
  tasa_bp               int not null
  monto_centavos        bigint not null              ← puede ser NEGATIVO
  material_descontado_centavos  bigint not null default 0
  contrapartida_de_id   uuid null → comisiones_causadas(id)
  motivo                text null                    ← obligatorio en contrapartida
  liquidacion_id        uuid null → liquidaciones(id)
  causada_en            timestamptz not null default now()

  check (tipo <> 'contrapartida' or (contrapartida_de_id is not null and motivo is not null))
  check (tipo <> 'contrapartida' or monto_centavos < 0)
```

**Sin `UPDATE` nunca.** Un trigger lo impide (§4.3). Una cancelación escribe una fila negativa con
motivo y autor. Karla ve `$1,840` y abajo *"− $50, ticket 3471 cancelado a las 18:12 por Paty"*, y eso
sí lo entiende.

### 2.8 · `liquidaciones` y `liquidacion_lineas` · **F-427 + F-259**

```
liquidaciones
  id                        uuid pk
  profesional_id            uuid not null → profesionales(id)
  periodo_desde             date not null
  periodo_hasta             date not null
  comision_centavos         bigint not null default 0
  propina_centavos          bigint not null default 0     ← SEPARADA. Siempre
  material_cargado_centavos bigint not null default 0
  renta_centavos            bigint not null default 0     ← se RESTA
  cobrado_por_ella_centavos bigint not null default 0     ← §3.38 de 01-FUNCIONES
  anticipos_centavos        bigint not null default 0
  total_centavos            bigint not null
  movimiento_caja_id        uuid null → movimientos_caja(id)
  pagada_en                 timestamptz null
  pagada_por                uuid null
  comprobante_url           text null

  check (pagada_en is null or movimiento_caja_id is not null)
```

**`comision_centavos` y `propina_centavos` son dos columnas y nunca se suman en el modelo.** La regla
5 del corte (`02-DINERO-Y-CAJA.md` §9.4) vive aquí, en el esquema, no sólo en la plantilla del PDF.

### 2.9 · `rentas_estacion` · **F-441**

```
rentas_estacion
  id                  uuid pk
  profesional_id      uuid not null → profesionales(id)
  monto_centavos      bigint not null
  periodicidad        text not null check in ('diaria','semanal','quincenal','mensual')
  dia_cobro           smallint null
  vigente_desde       date not null
  vigente_hasta       date null

cobros_renta
  id                  uuid pk
  renta_id            uuid not null → rentas_estacion(id)
  periodo_desde       date not null
  periodo_hasta       date not null
  monto_centavos      bigint not null
  movimiento_caja_id  uuid not null → movimientos_caja(id)
  unique (renta_id, periodo_desde)
```

### 2.10 · `expedientes_belleza` y `formulas_aplicadas` · **F-434 + F-154**

```
expedientes_belleza
  cliente_id              uuid pk → clientes(id)
  alergias                text null
  bandera_alergia         boolean not null default false      ← se pinta en la agenda
  prueba_mecha_fecha      date null
  tipo_cabello            text null
  notas_servicio          text null
  profesional_habitual_id uuid null → profesionales(id)       ← F-425
  origen_cartera          text null check in ('casa','profesional')   ← F-429
  frecuencia_dias         smallint null      ← calculada del historial, no capturada
  permite_foto            boolean not null default false
  permite_publicar_foto   boolean not null default false      ← DISTINTO del anterior

formulas_aplicadas                                            ← F-154
  id                      uuid pk
  cita_servicio_id        uuid not null unique → cita_servicios(id)
  cliente_id              uuid not null → clientes(id)
  profesional_id          uuid not null → profesionales(id)
  componentes             jsonb not null
      -- [{producto_id, cantidad_milesimas, unidad}, …]
  mezclado_milesimas      bigint not null default 0
  usado_milesimas         bigint not null default 0
  sobrante_milesimas      bigint not null default 0
  procesado_min           smallint null
  costo_centavos          bigint not null
  nota                    text null

  check (sobrante_milesimas = mezclado_milesimas - usado_milesimas)
```

**`permite_foto` y `permite_publicar_foto` son dos columnas distintas.** *"Puedo guardar tu foto"* no
es *"puedo publicarla en Instagram"*. Confundirlas es un problema legal y de confianza, y es un error
que cometen casi todos los sistemas del segmento.

**`cantidad_milesimas` en milésimas de gramo/ml** por la misma razón que el dinero va en centavos:
cero flotantes. 60.5 g son `60500`.

### 2.11 · `anticipos_cita` · **F-414**

```
anticipos_cita
  id                    uuid pk
  cita_id               uuid not null → citas(id)
  monto_centavos        bigint not null check (> 0)
  cobrado_en            timestamptz not null
  movimiento_caja_id    uuid null → movimientos_caja(id)
  estado                text not null
     check in ('vivo','aplicado','devuelto','retenido')
  aplicado_a_orden_id   uuid null → ordenes(id)
  resuelto_en           timestamptz null

  unique (cita_id) where (estado = 'vivo')      ← ★ impide el descuadre 4
  check (estado <> 'aplicado' or aplicado_a_orden_id is not null)
```

**El índice único parcial es lo que impide cobrar el anticipo dos veces.** Es una línea de SQL contra
el cuarto descuadre del giro.

### 2.12 · `paquetes_vendidos` y `sesiones_paquete` · **F-439**

```
paquetes_vendidos
  id                    uuid pk
  cliente_id            uuid not null → clientes(id)
  producto_paquete_id   uuid not null → productos(id)
  orden_id              uuid not null → ordenes(id)     ← el cobro
  sesiones_totales      smallint not null check (> 0)
  sesiones_usadas       smallint not null default 0
  valor_sesion_centavos bigint not null
  vence_el              date not null                   ← OBLIGATORIO
  vendido_por_id        uuid not null → profesionales(id)

  check (sesiones_usadas ≤ sesiones_totales)

sesiones_paquete
  id                    uuid pk
  paquete_id            uuid not null → paquetes_vendidos(id)
  cita_servicio_id      uuid not null unique → cita_servicios(id)
  profesional_id        uuid not null → profesionales(id)
  valor_centavos        bigint not null      ← aquí se reconoce la venta
  consumida_en          timestamptz not null
```

**La venta se reconoce en `sesiones_paquete`, no en `paquetes_vendidos`.** `02-DINERO-Y-CAJA.md` §6.2.

### 2.13 · `saldos_propina` · **F-260**

```
movimientos_propina
  id                    uuid pk
  profesional_id        uuid not null → profesionales(id)
  orden_id              uuid null → ordenes(id)
  tipo                  text not null
     check in ('recibida_efectivo_mano','recibida_efectivo_caja',
               'recibida_terminal','entregada')
  monto_centavos        bigint not null       ← negativo en 'entregada'
  movimiento_caja_id    uuid null → movimientos_caja(id)
  liquidacion_id        uuid null → liquidaciones(id)

  check ((tipo = 'entregada') = (monto_centavos < 0))
```

**`recibida_efectivo_mano` no lleva `movimiento_caja_id` y es correcto:** ese dinero nunca entró al
cajón. Se registra para el corte y para la cuenta de la profesional, no para el arqueo.

### 2.14 · `lista_espera` y `no_shows`

```
lista_espera                                       ← F-409
  id                  uuid pk
  cliente_id          uuid not null → clientes(id)
  servicio_id         uuid null → servicios(producto_id)
  profesional_id      uuid null → profesionales(id)
  ventanas            jsonb not null   -- [{dia_semana, desde, hasta}, …]
  vigente_hasta       date not null
  estado              text not null check in ('activa','ofrecida','atendida','vencida')

no_shows                                           ← F-412
  id                  uuid pk
  cita_id             uuid not null unique → citas(id)
  cliente_id          uuid not null → clientes(id)
  profesional_id      uuid not null → profesionales(id)
  minutos_perdidos    smallint not null
  valor_centavos      bigint not null              ← F-417
  anticipo_retenido_centavos bigint not null default 0
```

---

## 3 · ENTIDADES EXISTENTES QUE HAY QUE EXTENDER

| Tabla | Campo | Tipo | Por qué |
|---|---|---|---|
| `clientes` | `genero` | text check in ('f','m','x') | §4.1 de `04-INTERFAZ.md`. "El clienta llegó" delata el sistema |
| `clientes` | `whatsapp` | text | Es el canal, no un dato de contacto más |
| `clientes` | `acepta_recordatorios` | boolean | Sin esto no se puede mandar nada |
| `clientes` | `primera_visita` | date | Antigüedad de la relación |
| `productos` | `tipo` | añadir `'servicio'` y `'paquete'` al check | Hoy sólo hay producto |
| `productos` | `destino` | text check in ('venta','cabina','ambos') | **F-155**. El eje del inventario mixto |
| `productos` | `factor_apertura` | numeric | 1 pieza = 1000 ml. El evento ABRIR |
| `productos` | `unidad_cabina` | text check in ('g','ml','pza','m') | |
| `almacenes` | `tipo` | text check in ('venta','cabina') | **F-155** |
| `orden_lineas` | `profesional_id` | uuid null → profesionales(id) | **Sin esto no hay comisión.** La columna que ningún carrito de A1 ni A2 tiene |
| `orden_lineas` | `cita_servicio_id` | uuid null | El puente entre agenda y venta |
| `orden_lineas` | `sesion_paquete_id` | uuid null | La sesión consumida |
| `ordenes` | `cita_id` | uuid null → citas(id) | |
| `ordenes` | `anticipo_aplicado_centavos` | bigint default 0 | Que se vea en el ticket |
| `ordenes` | `cuenta_destino_transferencia` | text check in ('salon','profesional') | **§3.38.** Convierte la fuga en flujo |
| `ordenes` | `profesional_cobro_id` | uuid null | Quién recibió, si fue a su cuenta |
| `movimientos_caja` | `tipo` | añadir `'anticipo_cita'`, `'renta_estacion'`, `'liquidacion'`, `'entrega_propina'`, `'propina_caja'` | **F-259, F-260, F-414, F-441.** Cinco categorías nuevas, no una genérica |
| `movimientos_stock` | `motivo` | añadir `'consumo_servicio'`, `'merma_mezcla'`, `'apertura'`, `'rehacer'`, `'cortesia'`, `'cargado_profesional'` | §6 de `03-INVENTARIO.md` |
| `movimientos_stock` | `cita_servicio_id` | uuid null | Trazar el consumo hasta el servicio |
| `cortes_caja` | `citas_atendidas`, `citas_no_llego`, `minutos_hueco`, `valor_hueco_centavos`, `ocupacion_bp` | — | La sección 7 del corte |
| `cortes_caja` | `comision_causada_centavos`, `comision_pagada_centavos`, `propina_pendiente_centavos` | bigint | Secciones 6 y 11 |
| `empleados` | — | — | **Intacta.** `profesionales` la extiende, no la reemplaza |

**28 campos nuevos, 0 tablas existentes reescritas.**

---

## 4 · REGLAS DE INTEGRIDAD QUE GARANTIZA LA BASE

No la aplicación. Doce, y las tres primeras son las que definen el modelo.

**1 · Un profesional no puede tener dos citas en tiempo activo solapado.**
```sql
exclude using gist (profesional_id with =, rango_activo with &&)
  where (estado <> 'cancelado')
```
**Y el tiempo pasivo SÍ puede solaparse**, porque de eso se trata F-415. La restricción es sobre
`rango_activo`, nunca sobre `rango_ocupacion`. Si se pusiera sobre el segundo, el sistema perdería el
25%–40% de capacidad que es su principal ventaja competitiva. **Es la línea de SQL más importante de
la carpeta.**

**2 · Un recurso no puede estar en dos citas a la vez.**
```sql
exclude using gist (recurso_id with =, rango with &&)
```
Aquí sí sobre la ocupación completa: la estación está ocupada durante el procesado.

**3 · Una comisión causada no se actualiza nunca.**
```sql
create trigger comisiones_solo_insert
  before update or delete on comisiones_causadas
  for each row execute function rechazar_mutacion();
```
Igual que `movimientos_stock`. La corrección es una fila nueva con `tipo = 'contrapartida'`,
`monto_centavos < 0`, `contrapartida_de_id` y `motivo` — y los tres son obligatorios por `check`.

**4 · Un anticipo vivo por cita.** `unique (cita_id) where (estado = 'vivo')`. Impide el descuadre 4.

**5 · El reparto de una cita entre profesionales suma 100%.** Trigger de constraint diferido sobre
`cita_servicios` agrupado por `cita_id` cuando hay reparto por porcentaje.

**6 · No se cobra una cita que no está cerrada.** `check (estado <> 'cobrada' or …)` más validación en
`cobrarCita`: todas sus `cita_servicios` en estado `cerrado` o `cancelado`.

**7 · El consumo de cabina sólo sale de un almacén `tipo = 'cabina'`.** Trigger sobre
`movimientos_stock` cuando `motivo = 'consumo_servicio'`.

**8 · Un producto con `destino = 'cabina'` no puede estar en una línea de venta.** Trigger sobre
`orden_lineas`. Es lo que impide vender el galón abierto del lavabo.

**9 · La propina nunca entra en `ordenes.total_centavos`.** Ya existe en el esquema de Fase 1 y se
respeta. Los `movimientos_propina` no tocan `ordenes`.

**10 · `sesiones_usadas ≤ sesiones_totales`** y `unique` sobre `cita_servicio_id` en
`sesiones_paquete`: una sesión no se consume dos veces.

**11 · Una liquidación pagada tiene su movimiento de caja.**
`check (pagada_en is null or movimiento_caja_id is not null)`. Uno no existe sin el otro.

**12 · Un profesional `independiente_renta` no tiene regla de comisión.** `check` en `profesionales`.
Es lo que impide que Sol acabe modelada como empleada al 100%.

---

## 5 · COMANDOS

Todos pasan por `comando()`: rol → paquete → validación → idempotencia → transacción → auditoría.
**Ninguno declara `rol`, `organizacion_id`, `sucursal_id`, `empleo_id`, `identidad_id` ni
`terminal_id` en su entrada.** El ámbito nace de la sesión y se relee de la base en cada petición.

| Comando | Entrada | Roles | Idempotente | Qué escribe |
|---|---|---|---|---|
| `crearProfesional` | nombre, tipo_relacion, nivel, color | dueña | no | `profesionales` |
| `definirHorario` | profesional_id, tramos, vigencia | dueña | no | `horarios_profesional` |
| `definirServiciosDe` | profesional_id, servicios[] con precio y factor | dueña | no | `servicios_profesional` |
| `crearReglaComision` | esquema, tasas, las 5 respuestas, vigencia | dueña | no | `reglas_comision` **nueva versión** |
| `definirRenta` | profesional_id, monto, periodicidad | dueña | no | `rentas_estacion` |
| **`agendarCita`** | cliente_id?, servicios[] {servicio, profesional}, inicio | dueña, recepción, prof. | **sí** (clave de idempotencia) | `citas`, `cita_servicios`, `cita_recursos` |
| **`agendarWalkIn`** | servicio_id, profesional_id, cliente_id? | todos | **sí** | igual, `origen='walk_in'` |
| `reprogramarCita` | cita_id, nuevo_inicio, motivo | dueña, recepción | no | `citas` + mueve el anticipo |
| `cancelarCita` | cita_id, motivo, devolver_anticipo | dueña, recepción | no | `citas`, `anticipos_cita` |
| **`marcarNoLlego`** | cita_id | dueña, recepción | sí | `citas`, `no_shows`, retiene anticipo, libera hueco |
| `iniciarCita` | cita_id | todos | sí | `citas.estado='en_curso'`, `inicio_real` |
| **`cerrarServicio`** | cita_servicio_id, formula{}, mezclado, usado | prof., dueña | **sí por `cita_servicio_id`** | `cita_servicios`, `formulas_aplicadas`, **N `movimientos_stock`** |
| `agregarServicioACita` | cita_id, servicio_id, profesional_id | prof., dueña | no | `cita_servicios` |
| **`cobrarCita`** | cita_id, pagos[], propina{destinatario, monto}, cuenta_destino | todos | **sí** | `ordenes`, `orden_lineas`, **`comisiones_causadas`**, `movimientos_propina`, `movimientos_caja`, stock de anaquel, aplica anticipo |
| `cobrarAnticipo` | cita_id, monto, metodo | dueña, recepción | sí | `anticipos_cita`, `movimientos_caja` |
| `venderPaquete` | cliente_id, paquete_id, vendido_por | todos | sí | `paquetes_vendidos`, `ordenes`, comisión de venta |
| `consumirSesion` | paquete_id, cita_servicio_id | prof., dueña | sí | `sesiones_paquete`, venta reconocida, comisión de servicio |
| **`registrarRehacer`** | cita_origen_id, servicios[] | dueña | no | `citas` con `es_rehacer`, sin orden |
| `registrarCortesia` | cita_id | dueña | no | `citas.es_cortesia` |
| `cancelarVenta` | orden_id, motivo | dueña | sí | `ordenes`, **contrapartidas en `comisiones_causadas`** |
| **`liquidarProfesional`** | profesional_id, periodo, forma_pago | dueña | **sí** | `liquidaciones`, marca comisiones, `movimientos_caja`, `movimientos_propina` |
| `entregarPropina` | profesional_id, monto | dueña | sí | `movimientos_propina`, `movimientos_caja` |
| `cobrarRenta` | renta_id, periodo | dueña | sí | `cobros_renta`, `movimientos_caja` |
| **`abrirProducto`** | producto_id, piezas | dueña, prof. | sí | **2 `movimientos_stock`** (anaquel −, cabina +) |
| `bloquearAgenda` | profesional_id?, rango, motivo | dueña | no | `bloqueos_agenda` |
| `apuntarEnListaEspera` | cliente_id, servicio, profesional?, ventanas | recepción, dueña | no | `lista_espera` |
| `ofrecerHueco` | hueco, candidatos[] | recepción, dueña | no | `lista_espera.estado` |
| `guardarExpediente` | cliente_id, alergias, notas, permisos | prof., dueña | no | `expedientes_belleza` |
| `subirFotoServicio` | cita_servicio_id, tipo, archivo | prof. | sí | `archivos`, `formulas_aplicadas` |
| `registrarConsentimiento` | cliente_id, tipo, firma | recepción, dueña | sí | `consentimientos` |
| `cerrarDia` | conteo_efectivo | dueña | sí | `cortes_caja` con las secciones de agenda |

### 5.1 · Los tres comandos que hay que escribir con más cuidado

**`cerrarServicio`** — es idempotente **por `cita_servicio_id`**, no por clave de petición, porque el
teléfono de la estilista pierde red a mitad y reintenta. Escribe la fórmula y N movimientos de stock
en **una transacción**, y **no toca el cobro**. Si el producto de cabina no alcanza, **falla en vez de
silenciar** (regla de Fase 1) y dice cuánto falta.

**`cobrarCita`** — la transacción más grande del modelo. En un solo `BEGIN`:
orden + líneas (con `profesional_id` en cada una) → aplicar anticipo → stock de anaquel → **causar
comisiones con la regla vigente al momento** → movimientos de propina → movimiento de caja → estado
de la cita. **Si algo falla, no queda nada.** Y **los importes los calcula el servidor**: la entrada
trae qué servicios, no cuánto cuestan.

**`liquidarProfesional`** — escribe la liquidación, **marca las comisiones como liquidadas**, escribe
el movimiento de caja **y** los movimientos de propina de entrega, todo en la misma transacción. Uno
no existe sin el otro (mismo criterio que `registrarAbono` de `abarrotes`). Genera el comprobante
individual.

---

## 6 · ENTRADAS DEL PUENTE

`packages/app/src/puente/mapa.ts`. Toda entidad declara `rolesLectura` **obligatoriamente, a nivel de
tipo**.

| Entidad expuesta | `rolesLectura` | Campos que se descartan |
|---|---|---|
| **`Cliente`** | dueña, recepción, profesional | — · **⚠ HOY NO ESTÁ DECLARADA.** La tabla existe desde `002_catalogo.sql`. `abarrotes` y `ferreteria` ya lo señalaron. **Aquí es bloqueante: no hay cita sin clienta** |
| `Profesional` | todos | `regla_comision_id` para quien no sea dueña |
| `Cita` | dueña, recepción, profesional | el profesional sólo ve las suyas si no tiene `ver_agenda_ajena` |
| `CitaServicio` | dueña, recepción, profesional | `precio_centavos` oculto al profesional que no lo dio |
| `HuecoDisponible` (vista) | dueña, recepción, profesional | — |
| `BloqueoAgenda` | todos | `nota` sólo para dueña y el propio |
| `Servicio` | todos | `formula_base` sólo dueña y profesional |
| `ServicioProfesional` | dueña, recepción | precios ajenos ocultos al profesional |
| `Recurso` | todos | — |
| **`ReglaComision`** | **dueña · y el propio profesional la suya** | — · el profesional **tiene derecho a leer su regla**. Ocultársela es lo que hace que el sistema se vuelva un instrumento contra ella |
| **`ComisionCausada`** | **dueña · y la propia** | **nunca las ajenas.** Es el permiso más delicado del modelo |
| `Liquidacion` | dueña · y la propia | |
| `SaldoPropina` (vista) | dueña · y la propia | |
| `RentaEstacion` | dueña · y el propio | |
| `ExpedienteBelleza` | dueña, recepción, profesional | `notas_servicio` marcadas privadas sólo para quien las escribió y la dueña |
| `FormulaAplicada` | dueña, recepción, profesional | `costo_centavos` oculto al profesional si el material lo absorbe el salón |
| `AnticipoCita` | dueña, recepción | |
| `PaqueteVendido` | dueña, recepción, profesional | |
| `NoShow` | dueña, recepción | |
| `ListaEspera` | dueña, recepción | |
| `OcupacionProfesional` (vista) | dueña · y la propia | |
| `ProductoCabina` (vista) | dueña, profesional | **excluida de la búsqueda de venta por diseño** |
| `MargenServicio` (vista) | **dueña sola** | Nunca a recepción ni a profesional |

**Veintitrés entradas, y la primera es la deuda de tres modelos.**

---

## 7 · RUTAS DE API

```
GET   /api/agenda/dia?fecha&sucursal            la rejilla completa
GET   /api/agenda/huecos?servicio&profesional&desde&hasta
                                                 ← el motor de F-404 + F-415
GET   /api/agenda/proximos-huecos?servicio&profesional&n=6
                                                 ← lo que alimenta AGENDAR
POST  /api/citas                                 agendar
POST  /api/citas/walk-in
PATCH /api/citas/:id/reprogramar
PATCH /api/citas/:id/cancelar
POST  /api/citas/:id/no-llego
POST  /api/citas/:id/iniciar
POST  /api/citas/:id/cobrar
POST  /api/cita-servicios/:id/cerrar             ← dispara el consumo de cabina
POST  /api/cita-servicios/:id/foto
GET   /api/clientes/:id/expediente
PUT   /api/clientes/:id/expediente
GET   /api/clientes/:id/ultima-formula?servicio  ← lo que llena el botón REPETIR
GET   /api/clientes/por-volver                   ← F-951
POST  /api/anticipos
GET   /api/profesionales
GET   /api/profesionales/:id/mi-dia              ← la pantalla 4.3.6
GET   /api/profesionales/:id/comisiones?periodo
POST  /api/liquidaciones
POST  /api/propinas/entregar
POST  /api/rentas/:id/cobrar
POST  /api/productos/:id/abrir                   ← F-155
GET   /api/inventario/cabina/alcanza             ← existencia CONTRA la agenda futura
GET   /api/lista-espera?hueco                    ← a quién ofrecerle
GET   /api/reportes/ocupacion?desde&hasta
GET   /api/reportes/huecos?desde&hasta           ← F-417
GET   /api/cortes/:id/pdf
GET   /api/liquidaciones/:id/comprobante
```

**`/api/agenda/huecos` es el endpoint más difícil de todo el modelo.** Tiene que, en una consulta:
descontar bloqueos, respetar el horario del profesional, aplicar su factor de duración, considerar
recursos, **y ofrecer los tramos pasivos de otras citas como espacio utilizable**. Se resuelve con
una vista materializada por día y profesional que se recalcula al escribir en `cita_servicios` o
`bloqueos_agenda`. Es la pieza que hay que probar primero y la que hay que medir.

---

## 8 · MIGRACIONES · escritas, **no aplicadas**

```
packages/data/src/migraciones/sql/
├── 096_profesionales.sql              profesionales, horarios, bloqueos
│                                      ⚠ crea la extensión btree_gist
├── 097_servicios.sql                  servicios, servicios_profesional,
│                                      recursos, recursos_servicio
│                                      + productos.tipo acepta 'servicio','paquete'
├── 098_citas.sql                      citas, cita_servicios, cita_recursos
│                                      ★ LAS RESTRICCIONES DE EXCLUSIÓN GiST
├── 099_reglas_comision.sql            reglas_comision (versionada)
├── 100_comisiones_ledger.sql          comisiones_causadas + trigger anti-UPDATE
├── 101_liquidaciones.sql              liquidaciones, liquidacion_lineas
├── 102_rentas_estacion.sql            rentas_estacion, cobros_renta
├── 103_expediente_belleza.sql         expedientes_belleza, formulas_aplicadas,
│                                      consentimientos, fotos
├── 104_anticipos_y_paquetes.sql       anticipos_cita, paquetes_vendidos,
│                                      sesiones_paquete
│                                      ★ el unique parcial del anticipo vivo
├── 105_propinas_v4.sql                movimientos_propina
├── 106_no_show_y_espera.sql           no_shows, lista_espera
├── 107_inventario_cabina.sql          almacenes.tipo, productos.destino,
│                                      factor_apertura, motivos de movimiento
├── 108_clientes_salon.sql             genero, whatsapp, acepta_recordatorios,
│                                      primera_visita
│                                      ⚠ TOCA UNA TABLA VIVA — ver §8.1
├── 109_ordenes_salon.sql              orden_lineas.profesional_id,
│                                      cita_servicio_id, ordenes.cita_id,
│                                      cuenta_destino_transferencia
│                                      ⚠ TOCA TABLAS VIVAS — ver §8.1
├── 110_caja_salon.sql                 5 tipos nuevos de movimiento_caja
│                                      + columnas de agenda en cortes_caja
├── 111_vistas_salon.sql               hueco_disponible, ocupacion_profesional,
│                                      saldo_propina, margen_servicio,
│                                      producto_cabina, clientes_por_volver
└── 112_plantilla_salon.sql            la plantilla `salon` + su diccionario
                                       ⚠ NO SE APLICA SIN DECISIÓN DE MIGUEL
```

### 8.1 · Las tres migraciones delicadas

**`096`** necesita `create extension if not exists btree_gist`. Sin ella no se pueden combinar
`uuid with =` y `tstzrange with &&` en la misma restricción de exclusión. **Hay que verificar que
Supabase la permita en el proyecto `wyqmzhliurwyxuyxznpb` antes de dar por buena la arquitectura**, y
si no, el plan B es un índice único sobre slots discretos de 5 minutos — mucho peor, pero funciona.
**Es el único riesgo técnico serio de la carpeta y hay que resolverlo antes de escribir el resto.**

**`108` y `109` tocan tablas vivas** (`clientes`, `ordenes`, `orden_lineas`) que hoy usan cuatro
negocios en producción. Todos los campos nuevos son **nullable o con `default`**, así que el backfill
es nulo y nada existente se rompe. Aun así **no se aplican sin decisión explícita**, por la misma
razón que la `082` de `abarrotes`.

**`112` no se aplica nunca en automático.** Crea una plantilla nueva y ninguno de los cuatro negocios
vivos es un salón.

---

## 9 · DEPENDENCIAS EXTERNAS

| Dependencia | Versión | Para qué | Por qué ésa |
|---|---|---|---|
| **`btree_gist`** | extensión de PG 17.6 | Las restricciones de exclusión de §4 | Es de PostgreSQL, no un paquete. **Cero dependencias nuevas para lo más importante del modelo** |
| **`@js-temporal/polyfill`** o `Temporal` nativo | — | Aritmética de rangos horarios con zona | Las citas cruzan cambio de horario y `Date` de JS es una trampa aquí. **Se decide una vez para todo A3 y A7** |
| **WhatsApp Business Cloud API** | v20+ | F-406 recordatorios, F-950, F-951 | **La decisión comercial más importante de este modelo.** Ver §9.1 |
| **Supabase Storage** | ya en el stack | Fotos de antes y después | 20–60 fotos al mes por salón. **Bucket propio, separado del catálogo**, con política por organización |
| **`browser-image-compression`** | 2.x | Comprimir la foto antes de subir | Una foto de teléfono son 4–6 MB. Sin comprimir, la estilista no sube ninguna |
| **Pasarela (Stripe / Mercado Pago / Clip)** | — | F-215, sólo para el anticipo en reserva en línea | **No hace falta si no hay reserva en línea.** Se pospone |
| **PAC de facturación** | — | F-940…F-945 | Misma decisión pendiente P-02 que en los otros modelos |

### 9.1 · La decisión de WhatsApp

**Todo el giro opera en WhatsApp.** Las clientas piden cita ahí, confirman ahí, cancelan ahí y mandan
fotos de lo que quieren ahí. Y la función que más dinero mueve —bajar el no-show de 18% a 8%— depende
de mandar un mensaje que **pida respuesta**.

Hay tres caminos y ninguno es obvio:

1. **API oficial de Meta (Cloud API).** Plantillas aprobadas, costo por conversación, alta como
   negocio verificado. Es lo correcto y es una fricción de alta real para un salón de tres sillas.
2. **Enlace `wa.me` con el mensaje prerredactado.** Cero costo, cero alta, cero API: el sistema arma
   la lista y el texto, y **la dueña toca y manda**. No hay automatización, **pero es exactamente el
   comportamiento semiautomático que este giro quiere** (§3.13 de `01-FUNCIONES.md`).
3. **Un proveedor intermedio.** Costo por mensaje y dependencia de un tercero.

**La recomendación: empezar por el 2 y dejar el 1 como perilla.** El camino 2 se construye en un día,
funciona el primer día, y **respeta que la relación es personal**. El camino 1 se enciende cuando el
salón ya confía y pide automatizar. Construir primero la API oficial es gastar semanas en algo que la
mitad de los clientes no va a querer encender.

**La decisión la toma Miguel**, porque tiene consecuencia comercial: AgendaPro presume recordatorios
automáticos por WhatsApp y es su argumento principal. Ir con el camino 2 es aceptar una desventaja de
folleto a cambio de algo que funciona sin alta.

---

## 10 · QUÉ SE REUTILIZA TAL CUAL

| Bloque | Ruta | Qué se toma |
|---|---|---|
| Identidad, PIN, sesión, bitácora | `packages/app/src/identidad/` | Completo, intacto |
| Cobro y métodos de pago | `packages/app/src/venta/pagos.ts` | Completo. Se **extiende** con destino de transferencia y propina con destinatario |
| Caja, arqueo, corte de turno | `packages/app/src/caja/` | Completo. Se **añaden** cinco tipos de movimiento |
| Tronco de inventario y ledger | `packages/app/src/inventario/` | Completo. Se **añaden** seis motivos |
| Costo promedio ponderado | `packages/app/src/compras/costeo.ts` | Intacto |
| Compras y proveedores | `packages/app/src/compras/` | **Intacto, sin una línea nueva.** Es el módulo más fácil del proyecto en este giro |
| Impuestos IVA tasa única | `packages/app/src/fiscal/` (de abarrotes) | Se usa el camino simple. **IVA mixto e IEPS existen y no se encienden** |
| Catálogo base y búsqueda | `packages/app/src/catalogo/` | Se **extiende** con servicios |
| Propinas: desglose exacto por método | `packages/app/src/propinas/` | El desglose se reutiliza. **El reparto NO: V2 es tronco y aquí es directa** |
| Conteo físico | `packages/app/src/inventario/conteo.ts` (de abarrotes) | El motor de esperado-contra-contado con alcance parcial, tal cual |
| Caducidad sin lote | `packages/app/src/inventario/caducidad.ts` (de abarrotes) | Completo |
| Stock simple V2 | `packages/app/src/retail/` (de abarrotes) | La parte de V2 para el anaquel |
| Generación de PDF | `heredado/lib/pdfDownload.js` | El camino completo, sobre un nodo propio |
| Autorización de descuento | `packages/app/src/venta/autorizacion-descuento.ts` | De abarrotes, intacto |

**Lo que hay que escribir de cero, y es mucho:** todo `packages/app/src/agenda/`, todo
`packages/app/src/profesional/`, todo `packages/app/src/expediente/`, y la parte de cabina de
inventario. **Es el arquetipo que más código nuevo cuesta de los tres construidos hasta hoy** —y el
que más modelos desbloquea: veintidós.
