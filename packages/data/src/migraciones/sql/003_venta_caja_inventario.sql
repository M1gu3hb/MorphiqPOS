-- ═══════════════════════════════════════════════════════════════════════════
-- 003 · Venta, caja e inventario
--
-- Es el corazón del corte. Casi todas las restricciones de aquí existen para
-- corregir un defecto concreto y documentado de las dos fuentes, y lo corrigen
-- DESDE LA BASE: una regla que sólo vive en el código se salta la primera vez
-- que alguien escribe por otro camino.
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────── almacenes
create table almacenes (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  sucursal_id     uuid        not null references sucursales(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  principal       boolean     not null default false,
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index almacenes_por_organizacion on almacenes (organizacion_id, activo);

-- Un solo almacén principal por sucursal: si hubiera dos, "descontar del
-- principal" sería ambiguo y dependería del orden de la consulta.
create unique index almacenes_principal_unico on almacenes (sucursal_id)
  where principal;

-- ──────────────────────────────────────────────────────────────────── insumos
-- En retail un producto ES su propio insumo (relación 1:1 automática). La tabla
-- existe desde ya porque el ledger de stock apunta aquí, y en F1.3 las recetas
-- la usan sin migrar nada.
create table insumos (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  categoria_id    uuid        references categorias(id) on delete set null,

  -- Cuando el insumo es el producto mismo, esta columna lo enlaza.
  producto_id     uuid        references productos(id) on delete cascade,

  nombre          text        not null check (length(trim(nombre)) > 0),
  unidad_base     text        not null default 'pieza'
                              check (unidad_base in ('pieza', 'kg', 'g', 'l', 'ml', 'm')),
  costo_unitario_centavos bigint not null default 0 check (costo_unitario_centavos >= 0),
  stock_minimo    numeric(14,4) not null default 0 check (stock_minimo >= 0),
  activo          boolean     not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index insumos_por_organizacion on insumos (organizacion_id, activo);
create unique index insumos_por_producto on insumos (producto_id)
  where producto_id is not null;

-- ────────────────────────────────────────────────────────────── sesiones_caja
create table sesiones_caja (
  id                 uuid        primary key default gen_random_uuid(),
  organizacion_id    uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id        uuid        not null references sucursales(id) on delete restrict,
  terminal_id        uuid        not null references terminales(id) on delete restrict,

  empleado_abre_id   uuid        not null references empleos(id) on delete restrict,
  empleado_cierra_id uuid        references empleos(id) on delete restrict,

  abierta_en         timestamptz not null default now(),
  cerrada_en         timestamptz,
  estado             text        not null default 'abierta' check (estado in ('abierta', 'cerrada')),

  fondo_inicial_centavos     bigint not null default 0 check (fondo_inicial_centavos >= 0),
  efectivo_contado_centavos  bigint,
  efectivo_retirado_centavos bigint check (efectivo_retirado_centavos >= 0),
  notas_cierre               text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint caja_cerrada_completa check (
    estado <> 'cerrada' or (cerrada_en is not null and efectivo_contado_centavos is not null)
  ),
  constraint caja_cierra_despues_de_abrir check (cerrada_en is null or cerrada_en >= abierta_en)
);

-- ── LA restricción de CASH-01, y la razón por la que está en la base ────────
-- Corrige CASH-02. La comprobación equivalente en código es
-- "busca si hay una abierta, y si no, inserta" — y entre el SELECT y el INSERT
-- cabe otra transacción haciendo lo mismo. Dos cajas abiertas en la misma
-- terminal significa que el arqueo nunca cuadra y nadie sabe por qué.
--
-- El índice parcial único lo hace imposible: la segunda apertura recibe
-- violación de unicidad y el comando la traduce a un conflicto tipado.
create unique index sesiones_caja_una_abierta_por_terminal
  on sesiones_caja (terminal_id)
  where estado = 'abierta';

create index sesiones_caja_por_organizacion
  on sesiones_caja (organizacion_id, abierta_en desc);

comment on index sesiones_caja_una_abierta_por_terminal is
  'CASH-01/CASH-02. La segunda apertura concurrente falla aquí, no en el código.';

-- ─────────────────────────────────────────────────────────────────── ordenes
-- Unifica `Venta` (restaurante) y `ventas` (tiendita). El carrito ES la orden
-- en borrador (P1-10): en la fuente el carrito se cerraba al final, así que un
-- fallo a media venta hacía que el cajero reintentara y duplicara.
create table ordenes (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,
  terminal_id     uuid        references terminales(id) on delete set null,
  sesion_caja_id  uuid        references sesiones_caja(id) on delete restrict,

  serie           text        not null default 'A' check (serie ~ '^[A-Z]{1,6}$'),
  folio           bigint      check (folio > 0),

  estrategia_captura     text not null default 'mostrador'
                         check (estrategia_captura in ('mostrador', 'escaner', 'mesa',
                                                       'qr', 'cita', 'tienda_en_linea')),
  estrategia_cumplimiento text not null default 'inmediato'
                         check (estrategia_cumplimiento in ('inmediato', 'preparacion',
                                                            'agendado', 'envio', 'retiro')),

  estado          text        not null default 'borrador'
                              check (estado in ('borrador', 'confirmada', 'en_preparacion',
                                                'lista', 'cuenta_solicitada',
                                                'parcialmente_pagada', 'pagada',
                                                'parcialmente_reembolsada', 'reembolsada',
                                                'cancelada')),

  cliente_id            uuid references clientes(id) on delete set null,
  empleado_atiende_id   uuid references empleos(id) on delete set null,
  empleado_cobra_id     uuid references empleos(id) on delete set null,

  -- ── Totales: SIEMPRE calculados en el servidor (P0-07) ──────────────────
  -- En la fuente, subtotal, total y los snapshots eran un `reduce` del carrito
  -- hecho en el navegador e insertado verbatim. El endpoint de MorphiqPOS no
  -- acepta importes: recibe producto, cantidad y unidad, y recalcula.
  subtotal_centavos     bigint not null default 0,
  descuento_centavos    bigint not null default 0 check (descuento_centavos >= 0),
  impuestos_centavos    bigint not null default 0 check (impuestos_centavos >= 0),
  total_centavos        bigint not null default 0,
  costo_total_centavos  bigint not null default 0,
  utilidad_centavos     bigint not null default 0,
  margen_bp             integer not null default 0,

  notas                 text,
  motivo_cancelacion    text,
  cancelada_por         uuid references empleos(id) on delete set null,
  cancelada_en          timestamptz,

  -- ── Idempotencia (R10) ──────────────────────────────────────────────────
  idempotency_key text,
  version         integer     not null default 1 check (version > 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Una orden pagada SIN folio no se puede reclamar ni auditar.
  constraint orden_pagada_con_folio check (
    estado not in ('pagada', 'parcialmente_pagada') or folio is not null
  ),
  constraint orden_cancelada_con_motivo check (
    estado <> 'cancelada' or (motivo_cancelacion is not null and cancelada_en is not null)
  )
);

-- SALE-03: el mismo cobro reintentado tres veces produce UN solo resultado.
create unique index ordenes_idempotencia
  on ordenes (organizacion_id, idempotency_key)
  where idempotency_key is not null;

-- FOLIO-01: 100 cobros concurrentes, cero colisiones.
create unique index ordenes_folio_unico
  on ordenes (organizacion_id, sucursal_id, serie, folio)
  where folio is not null;

create index ordenes_por_organizacion on ordenes (organizacion_id, created_at desc);
create index ordenes_por_estado on ordenes (organizacion_id, estado, created_at desc);
create index ordenes_por_sesion_caja on ordenes (sesion_caja_id) where sesion_caja_id is not null;

-- Un borrador por terminal: es el carrito. Si hubiera dos, el cajero vería uno
-- y cobraría el otro.
create unique index ordenes_borrador_por_terminal
  on ordenes (terminal_id)
  where estado = 'borrador' and terminal_id is not null;

-- ──────────────────────────────────────────────────────────── orden_lineas
create table orden_lineas (
  id              uuid        primary key default gen_random_uuid(),
  orden_id        uuid        not null references ordenes(id) on delete cascade,
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  producto_id     uuid        references productos(id) on delete set null,

  -- Instantáneas: el ticket de hace un año tiene que seguir diciendo lo que
  -- decía, aunque el producto se haya renombrado o borrado.
  producto_nombre text        not null check (length(trim(producto_nombre)) > 0),
  sku             text,
  codigo_barras   text,

  cantidad        numeric(14,4) not null check (cantidad > 0),
  unidad          text        not null default 'pieza',

  precio_unitario_centavos bigint not null check (precio_unitario_centavos >= 0),
  costo_unitario_centavos  bigint not null default 0 check (costo_unitario_centavos >= 0),
  descuento_centavos       bigint not null default 0 check (descuento_centavos >= 0),
  subtotal_centavos        bigint not null check (subtotal_centavos >= 0),
  total_centavos           bigint not null check (total_centavos >= 0),
  utilidad_centavos        bigint not null default 0,

  es_mayoreo      boolean     not null default false,
  tipo_venta      text        not null default 'precio_fijo'
                              check (tipo_venta in ('precio_fijo', 'variable_medida',
                                                    'porcion_contenedor', 'servicio')),
  cantidad_variable numeric(14,4) check (cantidad_variable > 0),
  unidad_variable   text,
  nombre_porcion    text,
  cantidad_porciones numeric(14,4) check (cantidad_porciones > 0),

  notas           text,
  orden_visual    integer     not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index orden_lineas_por_orden on orden_lineas (orden_id, orden_visual);
create index orden_lineas_por_producto on orden_lineas (organizacion_id, producto_id);

-- ───────────────────────────────────────── orden_linea_modificadores
-- Instantánea del modificador elegido, con su precio en el momento de la venta.
create table orden_linea_modificadores (
  id                    uuid   primary key default gen_random_uuid(),
  orden_linea_id        uuid   not null references orden_lineas(id) on delete cascade,
  modificador_id        uuid   references modificadores(id) on delete set null,
  modificador_nombre    text   not null,
  opcion_id             uuid   references modificador_opciones(id) on delete set null,
  opcion_nombre         text   not null,
  precio_extra_centavos bigint not null default 0 check (precio_extra_centavos >= 0),
  created_at            timestamptz not null default now()
);

create index orden_linea_modificadores_por_linea
  on orden_linea_modificadores (orden_linea_id);

-- ────────────────────────────────────────────────────────────────────── pagos
-- Nueva como tabla. En AMBAS fuentes el pago eran columnas dentro de la venta
-- (`monto_efectivo`, `monto_tarjeta`, …), y por eso el sync offline mapeaba
-- todo a efectivo y descuadraba el arqueo (P1-11).
--
-- Un pago mixto son varias filas. CASH-03 comprueba que la suma cuadre.
create table pagos (
  id              uuid        primary key default gen_random_uuid(),
  orden_id        uuid        not null references ordenes(id) on delete restrict,
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sesion_caja_id  uuid        references sesiones_caja(id) on delete restrict,

  metodo          text        not null
                              check (metodo in ('efectivo', 'tarjeta', 'transferencia',
                                                'fiado', 'puntos', 'monedero')),

  monto_centavos     bigint   not null check (monto_centavos > 0),
  propina_centavos   bigint   not null default 0 check (propina_centavos >= 0),
  recibido_centavos  bigint   check (recibido_centavos >= 0),
  cambio_centavos    bigint   not null default 0 check (cambio_centavos >= 0),
  referencia         text,

  estado          text        not null default 'confirmado'
                              check (estado in ('confirmado', 'reembolsado')),
  idempotency_key text,

  created_at      timestamptz not null default now(),

  -- El cambio sale del efectivo recibido. Sin esta comprobación, un error de
  -- signo devolvería cambio de un pago con tarjeta.
  constraint pago_cambio_solo_en_efectivo check (
    cambio_centavos = 0 or metodo = 'efectivo'
  ),
  constraint pago_efectivo_recibido_suficiente check (
    metodo <> 'efectivo'
    or recibido_centavos is null
    or recibido_centavos >= monto_centavos + propina_centavos
  )
);

create unique index pagos_idempotencia
  on pagos (organizacion_id, idempotency_key)
  where idempotency_key is not null;

create index pagos_por_orden on pagos (orden_id);
create index pagos_por_sesion_caja on pagos (sesion_caja_id, created_at)
  where sesion_caja_id is not null;

-- ──────────────────────────────────────────────────────────── movimientos_caja
-- El saldo se DERIVA de aquí. No se guarda.
--
-- Corrige P2-10: en la fuente, `cortes_caja` guardaba `total_ventas`,
-- `total_efectivo` y `numero_ventas` como columnas, y nunca se actualizaban al
-- cobrar. El corte mostraba ceros con la caja llena.
create table movimientos_caja (
  id              uuid        primary key default gen_random_uuid(),
  sesion_caja_id  uuid        not null references sesiones_caja(id) on delete restrict,
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,

  tipo            text        not null
                              check (tipo in ('apertura', 'venta', 'devolucion', 'gasto',
                                              'retiro', 'deposito', 'ajuste', 'propina')),

  -- Con signo: entrada positiva, salida negativa. Así el saldo es una SUMA y no
  -- una expresión con ramas que alguien puede escribir mal en un reporte.
  monto_centavos  bigint      not null,

  referencia_tipo text        check (referencia_tipo in ('orden', 'gasto', 'manual')),
  referencia_id   uuid,
  empleado_id     uuid        references empleos(id) on delete set null,
  motivo          text,

  created_at      timestamptz not null default now(),

  constraint movimiento_signo_coherente check (
    case
      when tipo in ('apertura', 'venta', 'deposito', 'propina') then monto_centavos >= 0
      when tipo in ('devolucion', 'gasto', 'retiro') then monto_centavos <= 0
      else true
    end
  )
);

create index movimientos_caja_por_sesion on movimientos_caja (sesion_caja_id, created_at);
create index movimientos_caja_por_organizacion
  on movimientos_caja (organizacion_id, created_at desc);

comment on column movimientos_caja.monto_centavos is
  'Con signo. El saldo esperado es SUM(monto_centavos), no una expresión con ramas.';

-- ────────────────────────────────────────────────────────── movimientos_stock
-- Ledger INMUTABLE (R13). Se insertan movimientos y el saldo se deriva.
--
-- Deliberadamente NO existen `stock_anterior` ni `stock_nuevo`: esos campos son
-- la firma del patrón leer-calcular-escribir, que es lo que hacía perder
-- actualizaciones con dos ventas simultáneas (P1-03).
create table movimientos_stock (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  almacen_id      uuid        not null references almacenes(id) on delete restrict,
  insumo_id       uuid        not null references insumos(id) on delete restrict,

  tipo            text        not null
                              check (tipo in ('entrada_compra', 'salida_venta', 'ajuste',
                                              'merma', 'devolucion', 'cancelacion',
                                              'traspaso_entrada', 'traspaso_salida',
                                              'inventario_inicial', 'produccion')),

  -- Con signo, igual que la caja y por la misma razón.
  cantidad        numeric(14,4) not null check (cantidad <> 0),
  unidad          text        not null,

  costo_unitario_centavos bigint not null default 0 check (costo_unitario_centavos >= 0),
  referencia_tipo text        check (referencia_tipo in ('orden', 'compra', 'conteo', 'manual')),
  referencia_id   uuid,
  empleado_id     uuid        references empleos(id) on delete set null,
  motivo          text,
  idempotency_key text,

  created_at      timestamptz not null default now(),

  constraint movimiento_stock_signo_coherente check (
    case
      when tipo in ('entrada_compra', 'devolucion', 'cancelacion',
                    'traspaso_entrada', 'inventario_inicial', 'produccion')
        then cantidad > 0
      when tipo in ('salida_venta', 'merma', 'traspaso_salida') then cantidad < 0
      else true
    end
  )
);

create unique index movimientos_stock_idempotencia
  on movimientos_stock (organizacion_id, idempotency_key)
  where idempotency_key is not null;

create index movimientos_stock_por_insumo
  on movimientos_stock (organizacion_id, almacen_id, insumo_id, created_at desc);
create index movimientos_stock_por_referencia
  on movimientos_stock (referencia_tipo, referencia_id)
  where referencia_id is not null;

-- ─────────────────────────────────────────────────────────────── existencias
-- Proyección materializada del ledger, por rendimiento.
--
-- Se actualiza DENTRO de la misma transacción que inserta el movimiento, con
-- `set cantidad = cantidad + $1` — decremento atómico, nunca sobrescritura.
--
-- ── Por qué NO hay `check (cantidad >= 0)`, y dónde está la defensa real ───
--
-- Sería lo natural, y es tentador porque P1-03 es exactamente la sobreventa
-- silenciada con `Math.max(0, …)`. Pero `productos.permite_venta_sin_stock`
-- existe y es una función legítima: la tiendita que vende el último refresco
-- del refrigerador sin haber capturado la entrada. Ahí el negativo no es
-- corrupción, es INFORMACIÓN — dice cuánto se debe al conteo físico. Un CHECK
-- rígido convertiría esa venta en un error y el cajero acabaría apagando el
-- inventario entero, que es peor.
--
-- La defensa real vive en la escritura, no en la tabla:
--
--   update existencias set cantidad = cantidad + $delta
--    where almacen_id = $a and insumo_id = $i
--      and ($permite_negativo or cantidad + $delta >= 0)
--
-- Si la guarda no se cumple, el UPDATE afecta CERO filas, y el comando traduce
-- esas cero filas a un error tipado. Nunca se lee-calcula-escribe, así que dos
-- ventas simultáneas no se pisan: el `cantidad + $delta` lo resuelve el motor
-- con la fila bloqueada.
--
-- Lo que la BASE sí impone estructuralmente es que ese patrón sea el único
-- posible: `movimientos_stock` no tiene `stock_anterior` ni `stock_nuevo`, así
-- que la variante peligrosa ni siquiera se puede expresar.
--
-- Esto deja un hueco declarado: nada impide, a nivel de tabla, un UPDATE con
-- asignación absoluta (`set cantidad = 5`). Se cierra en T14 con INV-03 —dos
-- ventas concurrentes del último artículo, una falla— y con un contrato
-- estático que prohíbe la asignación absoluta en el código. Se escribe aquí en
-- vez de fingir que un CHECK inexistente lo cubre.
create table existencias (
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  almacen_id      uuid        not null references almacenes(id) on delete cascade,
  insumo_id       uuid        not null references insumos(id) on delete cascade,

  cantidad        numeric(14,4) not null default 0,
  actualizado_en  timestamptz not null default now(),

  primary key (almacen_id, insumo_id)
);

create index existencias_por_organizacion on existencias (organizacion_id, insumo_id);

comment on table existencias is
  'Proyección del ledger. Un reconciliador compara SUM(movimientos_stock) contra esta tabla.';

-- ───────────────────────────────────────────────────── updated_at automático
do $$
declare
  t text;
begin
  foreach t in array array[
    'almacenes', 'insumos', 'sesiones_caja', 'ordenes', 'orden_lineas'
  ]
  loop
    execute format(
      'create trigger %I_tocar_updated_at before update on %I
         for each row execute function tocar_updated_at()',
      t, t
    );
  end loop;
end;
$$;
