-- 045 · Las tablas del restaurante (F1-02 E3-1).
--
-- Trece entidades del sistema de Miguel no tenían destino en el esquema nuevo:
-- zonas, estaciones de preparación, mesas, comandas, solicitudes del portal QR,
-- secciones del menú, proveedores, compras, gastos, plantillas, liquidaciones
-- de propina y la bitácora de sincronización.
--
-- El DDL sale de `docs/fase-1/F1-04-MAPA-DE-ENTIDADES.md`, que se construyó
-- leyendo QUÉ CAMPOS toca su código de verdad, no suponiéndolos.
--
-- Las reglas de negocio de `F1-01` §3 que hoy viven en un `if` del navegador
-- bajan aquí como restricciones: la estación general no se puede desactivar,
-- una mesa libre no puede tener venta viva, una sola venta activa por mesa.
-- Un `if` se puede saltar abriendo la consola; una restricción no.
-- ── Primero: las columnas que faltan en las tablas que YA existen ───────────
--
-- Van antes que las tablas nuevas porque las claves foráneas compuestas del
-- final (`ordenes.mesa_id → mesas`, `insumos.proveedor_id → proveedores`…)
-- necesitan que la columna exista para poder colgarse de ella.

-- `ordenes` — 17 columnas (F1-04 §34.1).
alter table ordenes
  add column cerrada_en              timestamptz,
  add column mesa_id                 uuid,
  add column personas                integer     not null default 0 check (personas >= 0),
  add column cliente_nombre          text,
  add column notas_alergias          text,
  add column celebracion_especial    boolean     not null default false,
  add column tipo_celebracion        text,
  add column codigo_caja             text,
  add column propina_puntos_base     integer     not null default 0
                                     check (propina_puntos_base between 0 and 10000),
  add column propina_tipo            text        check (propina_tipo in (
                                       'sin_propina','porcentaje','monto_manual',
                                       'pendiente','pendiente_cliente','decidir_en_caja')),
  add column propina_origen          text        check (propina_origen in (
                                       'mesero','caja','tradicional','portal_qr','pendiente_portal_qr')),
  add column propina_liquidacion_id  uuid,
  add column propina_liquidada_en    timestamptz,
  add column satisfaccion_score      smallint    check (satisfaccion_score between 1 and 5),
  add column satisfaccion_emoji      text,
  add column satisfaccion_comentario text,
  add column satisfaccion_en         timestamptz;

-- Las órdenes ya cerradas antes de que la columna existiera. Sin esto el
-- `check` de abajo no se puede imponer sobre lo que ya está en la base, y una
-- restricción que no se puede imponer se acaba quitando.
update ordenes set cerrada_en = updated_at
  where estado in ('pagada','cancelada') and cerrada_en is null;

alter table ordenes add constraint orden_cerrada_con_fecha check (
  estado not in ('pagada','cancelada') or cerrada_en is not null
);
alter table ordenes add constraint orden_cierra_despues_de_abrir check (
  cerrada_en is null or cerrada_en >= created_at
);
alter table ordenes add constraint orden_satisfaccion_completa check (
  (satisfaccion_score is null) = (satisfaccion_en is null)
);

create index ordenes_por_mesa on ordenes (organizacion_id, mesa_id)
  where mesa_id is not null;
create index ordenes_propina_pendiente
  on ordenes (organizacion_id, empleado_atiende_id, cerrada_en)
  where propina_liquidacion_id is null;

comment on column ordenes.codigo_caja is
  'Código que el comensal lleva impreso a la caja (M05-4821). NO es una terminal.';

-- `orden_lineas` — el contrato de trazabilidad, 7 columnas (F1-04 §34.2).
alter table orden_lineas
  add column estado_preparacion        text not null default 'pendiente'
                                       check (estado_preparacion in (
                                         'pendiente','en_preparacion','listo','entregado','cancelado')),
  add column area_preparacion_snapshot text check (area_preparacion_snapshot in (
                                         'cocina','barra','ambos','ninguno')),
  add column cantidad_base_consumo     numeric(14,4) check (cantidad_base_consumo > 0),
  add column insumo_base_id            uuid,
  add column insumo_base_nombre        text,
  add column precio_por_unidad_centavos bigint check (precio_por_unidad_centavos >= 0),
  add column ml_por_porcion            numeric(14,4) check (ml_por_porcion > 0);

alter table orden_lineas add constraint orden_lineas_insumo_base_misma_org
  foreign key (insumo_base_id, organizacion_id)
  references insumos (id, organizacion_id) on delete set null (insumo_base_id);

alter table orden_lineas add constraint orden_linea_insumo_base_con_nombre check (
  insumo_base_id is null or insumo_base_nombre is not null
);

create index orden_lineas_por_estado
  on orden_lineas (organizacion_id, estado_preparacion)
  where estado_preparacion in ('pendiente','en_preparacion');

comment on column orden_lineas.insumo_base_nombre is
  'Instantánea: un insumo desactivado no puede borrar el nombre de un ticket de hace seis meses.';
comment on column orden_lineas.cantidad_base_consumo is
  'Lo que se descuenta del inventario, en unidad base. No coincide con la cantidad vendida cuando el producto se vende por peso o por porción.';

-- `insumos` — 11 columnas (F1-04 §34.3).
alter table insumos
  add column unidad_compra_default      text,
  add column cantidad_por_compra_default numeric(14,4) check (cantidad_por_compra_default > 0),
  add column costo_compra_default_centavos bigint not null default 0
                                        check (costo_compra_default_centavos >= 0),
  add column stock_critico              numeric(14,4) not null default 0 check (stock_critico >= 0),
  add column proveedor_id               uuid,
  add column notas                      text,
  add column tipo_insumo                text not null default 'normal'
                                        check (tipo_insumo in ('normal','contenedor')),
  add column capacidad_contenedor_ml    numeric(14,4) check (capacidad_contenedor_ml > 0),
  add column porciones_por_contenedor   numeric(14,4) check (porciones_por_contenedor > 0),
  add column ml_por_porcion             numeric(14,4) check (ml_por_porcion > 0),
  add column nombre_porcion             text;

alter table insumos add constraint insumo_contenedor_completo check (
  tipo_insumo <> 'contenedor' or (capacidad_contenedor_ml is not null and ml_por_porcion is not null)
);
alter table insumos add constraint insumo_umbrales_coherentes check (
  stock_critico <= stock_minimo
);

-- `productos` — 6 columnas (F1-04 §34.4).
alter table productos
  add column area_preparacion        text not null default 'ninguno'
                                     check (area_preparacion in ('cocina','barra','ambos','ninguno')),
  add column visible_en_menu_digital boolean not null default true,
  add column minutos_preparacion     smallint check (minutos_preparacion >= 0),
  add column notas                   text,
  add column presets_variable        jsonb check (jsonb_typeof(presets_variable) = 'array'),
  add column presets_porcion         jsonb check (jsonb_typeof(presets_porcion) = 'array');

create index productos_menu_digital on productos (organizacion_id, categoria_id)
  where activo and visible_en_menu_digital;

-- `categorias` — 4 columnas (F1-04 §34.5).
alter table categorias
  add column descripcion            text,
  add column estacion_preparacion_id uuid,
  add column estacion_nombre        text,
  add column estacion_color         text check (estacion_color ~ '^#[0-9a-fA-F]{6}$');

comment on column categorias.estacion_nombre is
  'Instantánea del nombre de la estación: la comanda impresa de ayer no cambia porque hoy se renombre la estación.';

-- `empleos` — 3 columnas (F1-04 §34.6).
alter table empleos
  add column color                    text check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column estacion_preparacion_id  uuid,
  add column ve_todas_las_estaciones  boolean not null default false;

alter table empleos add constraint empleo_estacion_o_todas check (
  not (ve_todas_las_estaciones and estacion_preparacion_id is not null)
);

-- `recetas` — 4 columnas (F1-04 §34.7).
alter table recetas
  add column cantidad_capturada numeric(14,4) check (cantidad_capturada > 0),
  add column unidad_capturada   text,
  add column activa             boolean not null default true,
  add column notas              text;

create index recetas_activas on recetas (organizacion_id, producto_id) where activa;

-- `sesiones_caja` — 4 columnas (F1-04 §34.8).
alter table sesiones_caja
  add column serie                   text   not null default 'CC' check (serie ~ '^[A-Z]{1,6}$'),
  add column folio                   bigint check (folio > 0),
  add column fondo_esperado_centavos bigint not null default 0 check (fondo_esperado_centavos >= 0),
  add column notas_apertura          text;

-- Las cajas cerradas antes de que el folio existiera reciben uno por orden de
-- apertura. Mismo motivo que arriba: una caja cerrada sin folio no se puede
-- reclamar ni auditar, y sin el relleno la restricción no se podría añadir.
update sesiones_caja s
   set folio = n.numero
  from (select id, row_number() over (partition by organizacion_id order by abierta_en, id) as numero
          from sesiones_caja
         where estado = 'cerrada') n
 where s.id = n.id and s.folio is null;

alter table sesiones_caja add constraint caja_cerrada_con_folio check (
  estado <> 'cerrada' or folio is not null
);
alter table sesiones_caja add constraint caja_retiro_no_excede_contado check (
  efectivo_retirado_centavos is null
  or efectivo_contado_centavos is null
  or efectivo_retirado_centavos <= efectivo_contado_centavos
);


-- Hoy es una constante del navegador (lib/constants.js:118). Como tabla, una
-- zona que no está en la lista deja de poder escribirse — y con ella deja de
-- existir el caso en que una mesa desaparece de la interfaz por tener una zona
-- que ninguna pestaña muestra (Configuracion.jsx:291).
create table zonas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  orden           integer     not null default 0,
  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint zonas_id_org_unica unique (id, organizacion_id)
);

create index zonas_por_organizacion on zonas (organizacion_id, orden) where activa;

create table estaciones_preparacion (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  descripcion     text,
  color           text        not null default '#4A5568' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icono           text,
  orden           integer     not null default 0,
  activa          boolean     not null default true,
  es_general      boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- REGLA 10 de F1-01 §3: la estación general NO se puede desactivar.
  -- Hoy eso es un `if` en EstacionesPreparacionSection.jsx:218-221.
  constraint estacion_general_siempre_activa check (not es_general or activa),
  constraint estaciones_id_org_unica unique (id, organizacion_id)
);

create index estaciones_por_organizacion on estaciones_preparacion (organizacion_id, orden)
  where activa;

create table mesas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,
  zona_id         uuid        references zonas(id) on delete set null,

  numero          smallint    not null check (numero > 0),
  nombre          text,
  capacidad       smallint    not null default 4 check (capacidad > 0),
  forma           text        not null default 'redonda'
                              check (forma in ('redonda','cuadrada','rectangular')),
  tamano          text        not null default 'mediana'
                              check (tamano in ('chica','mediana','grande')),
  posicion_x      integer     not null default 100,
  posicion_y      integer     not null default 100,
  orden           integer     not null default 0,

  estado          text        not null default 'libre'
                              check (estado in ('libre','esperando_orden','pedido_enviado',
                                                'en_preparacion','en_espera_entrega','ocupada',
                                                'cuenta_solicitada','limpieza','pagada','cancelada')),

  -- Puntero a la venta viva. Es lo que hace posible el índice único parcial de
  -- "una sola venta activa por mesa" (F1-04 §35.5) y lo que corrige D-16.
  orden_activa_id uuid,

  personas_actuales smallint  not null default 0 check (personas_actuales >= 0),
  cliente_temporal  text,
  notas_alergias    text,
  celebracion_especial boolean not null default false,
  tipo_celebracion  text,

  qr_token        text,
  qr_activa       boolean     not null default true,

  empleado_asignado_id uuid   references empleos(id) on delete set null,
  empleado_atiende_id  uuid   references empleos(id) on delete set null,

  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Una mesa libre no tiene venta viva, y una ocupada sí. Sin esto vuelven las
  -- "mesas huérfanas" que detectarHuerfano busca con cuatro reglas heurísticas
  -- (F1-01 §4).
  constraint mesa_libre_sin_orden check (
    estado <> 'libre' or orden_activa_id is null
  ),
  constraint mesas_id_org_unica unique (id, organizacion_id)
);

alter table mesas add constraint mesas_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table mesas add constraint mesas_zona_misma_org
  foreign key (zona_id, organizacion_id)
  references zonas (id, organizacion_id) on delete set null (zona_id);
alter table mesas add constraint mesas_asignado_misma_org
  foreign key (empleado_asignado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_asignado_id);
alter table mesas add constraint mesas_atiende_misma_org
  foreign key (empleado_atiende_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_atiende_id);

create index mesas_por_organizacion on mesas (organizacion_id, zona_id, orden) where activa;
create index mesas_por_estado on mesas (organizacion_id, estado) where activa;

create table comandas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  orden_id        uuid        not null references ordenes(id) on delete cascade,
  mesa_id         uuid        references mesas(id) on delete set null,
  estacion_preparacion_id uuid references estaciones_preparacion(id) on delete set null,

  -- LEGACY declarado en PedidoPreparacion.jsonc:24. Cocina.jsx filtra por él
  -- cuando las estaciones están apagadas. Se conserva a propósito.
  area            text        check (area in ('cocina','barra')),

  estado          text        not null default 'nuevo'
                              check (estado in ('nuevo','en_preparacion','listo','entregado','cancelado')),

  iniciada_en     timestamptz,
  lista_en        timestamptz,
  entregada_en    timestamptz,

  empleado_responsable_id uuid references empleos(id) on delete set null,
  notas           text,

  -- Snapshots: la cocina los pinta y la estación se puede desactivar.
  estacion_nombre text,
  estacion_color  text        check (estacion_color ~ '^#[0-9a-fA-F]{6}$'),

  origen          text        not null default 'mesero'
                              check (origen in ('mesero','portal_qr','pos')),

  notas_alergias  text,
  celebracion_especial boolean not null default false,
  tipo_celebracion text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint comanda_tiempos_ordenados check (
    (lista_en is null or iniciada_en is null or lista_en >= iniciada_en)
    and (entregada_en is null or lista_en is null or entregada_en >= lista_en)
  ),
  constraint comandas_id_org_unica unique (id, organizacion_id)
);

alter table comandas add constraint comandas_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete cascade;
alter table comandas add constraint comandas_mesa_misma_org
  foreign key (mesa_id, organizacion_id)
  references mesas (id, organizacion_id) on delete set null (mesa_id);
alter table comandas add constraint comandas_estacion_misma_org
  foreign key (estacion_preparacion_id, organizacion_id)
  references estaciones_preparacion (id, organizacion_id)
  on delete set null (estacion_preparacion_id);

-- El canal de tiempo real `pedidos:estacion:<id>` (F1-01 §6) se apoya aquí.
create index comandas_por_estacion
  on comandas (organizacion_id, estacion_preparacion_id, estado, created_at);
create index comandas_por_orden on comandas (orden_id);
create index comandas_activas on comandas (organizacion_id, created_at)
  where estado in ('nuevo','en_preparacion','listo');

create table comanda_items (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  comanda_id      uuid        not null references comandas(id) on delete cascade,

  -- El vínculo que HOY NO EXISTE, y por el que el estado de preparación tiene
  -- que vivir duplicado. Ver F1-04 §10.3.
  orden_linea_id  uuid        references orden_lineas(id) on delete set null,

  producto_id     uuid        references productos(id) on delete set null,
  producto_nombre text        not null check (length(trim(producto_nombre)) > 0),
  cantidad        numeric(14,4) not null check (cantidad > 0),
  notas           text,

  -- Mismo conjunto que orden_lineas.estado_preparacion. Hoy Mesero escribe
  -- 'pendiente' y POS escribe 'nuevo' para el mismo hecho (F1-04 §7.5).
  estado          text        not null default 'pendiente'
                              check (estado in ('pendiente','en_preparacion','listo',
                                                'entregado','cancelado')),

  tipo_venta         text     check (tipo_venta in ('precio_fijo','variable_medida',
                                                    'porcion_contenedor','servicio')),
  unidad_variable    text,
  cantidad_variable  numeric(14,4) check (cantidad_variable > 0),
  nombre_porcion     text,
  cantidad_porciones numeric(14,4) check (cantidad_porciones > 0),

  orden_visual    integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table comanda_items add constraint comanda_items_comanda_misma_org
  foreign key (comanda_id, organizacion_id)
  references comandas (id, organizacion_id) on delete cascade;
alter table comanda_items add constraint comanda_items_producto_misma_org
  foreign key (producto_id, organizacion_id)
  references productos (id, organizacion_id) on delete set null (producto_id);

create index comanda_items_por_comanda on comanda_items (comanda_id, orden_visual);
create index comanda_items_por_linea on comanda_items (orden_linea_id)
  where orden_linea_id is not null;

create table solicitudes_qr (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  mesa_id         uuid        not null references mesas(id) on delete cascade,
  orden_id        uuid        references ordenes(id) on delete set null,

  tipo            text        not null check (tipo in ('ordenar','cuenta','ayuda')),
  estado          text        not null default 'pendiente'
                              check (estado in ('pendiente','atendida','resuelta','cancelada')),

  atendida_en     timestamptz,
  resuelta_en     timestamptz,

  empleado_atiende_id uuid    references empleos(id) on delete set null,
  empleado_destino_id uuid    references empleos(id) on delete set null,
  ruteo_modo      text        not null default 'general' check (ruteo_modo in ('asignado','general')),
  origen          text        not null default 'portal_qr',

  -- Snapshot del token con el que entró el comensal.
  token_mesa      text,
  notas           text,

  subtotal_consumo_centavos  bigint check (subtotal_consumo_centavos >= 0),
  propina_sugerida_centavos  bigint check (propina_sugerida_centavos >= 0),
  propina_sugerida_bp        integer check (propina_sugerida_bp between 0 and 10000),
  propina_tipo    text        check (propina_tipo in ('sin_propina','porcentaje','monto_manual',
                                                      'decidir_en_caja','pendiente_cliente')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table solicitudes_qr add constraint solicitudes_qr_mesa_misma_org
  foreign key (mesa_id, organizacion_id)
  references mesas (id, organizacion_id) on delete cascade;
alter table solicitudes_qr add constraint solicitudes_qr_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete set null (orden_id);

create index solicitudes_qr_pendientes
  on solicitudes_qr (organizacion_id, estado, created_at)
  where estado = 'pendiente';
create index solicitudes_qr_por_mesa on solicitudes_qr (organizacion_id, mesa_id, created_at desc);

create table menu_qr_secciones (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  descripcion     text,
  imagen_url      text,
  orden           integer     not null default 0,
  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index menu_qr_secciones_publicas on menu_qr_secciones (organizacion_id, orden)
  where activa;

create table proveedores (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  contacto        text,
  telefono        text,
  whatsapp        text,
  correo          text,
  direccion       text,
  notas           text,
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint proveedores_id_org_unica unique (id, organizacion_id)
);

create index proveedores_por_organizacion on proveedores (organizacion_id) where activo;

comment on table proveedores is
  'Borrado suave obligatorio: las compras guardan proveedor_nombre como snapshot '
  '(ProveedoresSection.jsx:88-89).';

create table compras (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,
  proveedor_id    uuid        references proveedores(id) on delete set null,

  -- SNAPSHOT not null: es lo que permite el borrado suave del proveedor.
  proveedor_nombre text       not null default 'Compra directa',

  fecha           date        not null default current_date,
  total_centavos  bigint      not null default 0 check (total_centavos >= 0),
  metodo_pago     text        check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  factura_folio   text,
  notas           text,
  empleado_id     uuid        references empleos(id) on delete set null,

  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint compras_id_org_unica unique (id, organizacion_id)
);

alter table compras add constraint compras_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table compras add constraint compras_proveedor_misma_org
  foreign key (proveedor_id, organizacion_id)
  references proveedores (id, organizacion_id) on delete set null (proveedor_id);
alter table compras add constraint compras_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_id);

create unique index compras_idempotencia on compras (organizacion_id, idempotency_key)
  where idempotency_key is not null;
create index compras_por_organizacion on compras (organizacion_id, fecha desc);

create table compra_lineas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  compra_id       uuid        not null references compras(id) on delete cascade,
  insumo_id       uuid        not null references insumos(id) on delete restrict,

  insumo_nombre   text        not null check (length(trim(insumo_nombre)) > 0),

  -- Lo que el usuario tecleó, en su unidad.
  cantidad_capturada numeric(14,4) not null check (cantidad_capturada > 0),
  unidad_capturada   text        not null,

  -- Cuántas unidades base trae UNA unidad capturada. Sin esto, una compra en
  -- cajas o bolsas no se puede auditar: hoy se usa para calcular
  -- (RegistrarCompraDialog.jsx:301) y NO se guarda. Ver F1-04 §23.1.
  equivalencia    numeric(14,4) not null default 1 check (equivalencia > 0),

  -- Ya convertida a la unidad base del insumo.
  cantidad        numeric(14,4) not null check (cantidad > 0),

  costo_total_centavos bigint  not null check (costo_total_centavos >= 0),
  caduca_el       date,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table compra_lineas add constraint compra_lineas_compra_misma_org
  foreign key (compra_id, organizacion_id)
  references compras (id, organizacion_id) on delete cascade;
alter table compra_lineas add constraint compra_lineas_insumo_misma_org
  foreign key (insumo_id, organizacion_id)
  references insumos (id, organizacion_id) on delete restrict;

create index compra_lineas_por_compra on compra_lineas (compra_id);
create index compra_lineas_por_insumo on compra_lineas (organizacion_id, insumo_id, created_at desc);

create table gastos (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,

  -- Un gasto en efectivo sale del cajón: por eso se ata a la sesión y además
  -- genera un movimiento_caja de tipo 'gasto'. Ver F1-04 §25.2.
  sesion_caja_id  uuid        references sesiones_caja(id) on delete restrict,
  plantilla_gasto_id uuid,

  fecha           date        not null default current_date,
  categoria       text        not null check (categoria in ('limpieza','transporte','reparacion',
                                                            'servicios','pago_extraordinario',
                                                            'marketing','otro')),
  descripcion     text        not null check (length(trim(descripcion)) > 0),
  monto_centavos  bigint      not null check (monto_centavos > 0),
  metodo_pago     text        not null check (metodo_pago in ('efectivo','tarjeta','transferencia')),

  -- Hoy viaja como el prefijo de texto "[RECURRENTE/FIJO MENSUAL]" dentro de
  -- notas (RegistrarGastoDialog.jsx:51-53) y se pierde al editar la nota.
  es_recurrente   boolean     not null default false,

  empleado_id     uuid        references empleos(id) on delete set null,
  notas           text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table gastos add constraint gastos_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table gastos add constraint gastos_sesion_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;
alter table gastos add constraint gastos_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_id);

create unique index gastos_idempotencia on gastos (organizacion_id, idempotency_key)
  where idempotency_key is not null;
create index gastos_por_organizacion on gastos (organizacion_id, fecha desc);
create index gastos_por_sesion on gastos (sesion_caja_id) where sesion_caja_id is not null;

create table plantillas_gasto (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  categoria       text        not null default 'servicios'
                              check (categoria in ('limpieza','transporte','reparacion','servicios',
                                                   'pago_extraordinario','marketing','otro')),
  monto_sugerido_centavos bigint not null default 0 check (monto_sugerido_centavos >= 0),
  metodo_pago     text        not null default 'efectivo'
                              check (metodo_pago in ('efectivo','tarjeta','transferencia')),
  periodicidad    text        not null default 'mensual'
                              check (periodicidad in ('mensual','semanal','quincenal','anual','unico')),
  dia_pago_sugerido smallint  check (dia_pago_sugerido between 1 and 31),
  notas           text,
  activa          boolean     not null default true,
  ultimo_uso_en   timestamptz,
  veces_usada     integer     not null default 0 check (veces_usada >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint plantillas_gasto_id_org_unica unique (id, organizacion_id)
);

create index plantillas_gasto_activas on plantillas_gasto (organizacion_id, nombre) where activa;

alter table gastos add constraint gastos_plantilla_misma_org
  foreign key (plantilla_gasto_id, organizacion_id)
  references plantillas_gasto (id, organizacion_id) on delete set null (plantilla_gasto_id);

create table plantillas_compra (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  proveedor_nombre text,

  -- Se queda como jsonb, al contrario que comanda_items: se lee entera para
  -- precargar un formulario y nunca se actualiza parcialmente. Ver F1-04 §27.1.
  lineas          jsonb       not null default '[]'::jsonb
                              check (jsonb_typeof(lineas) = 'array'),

  activa          boolean     not null default true,
  notas           text,
  ultimo_uso_en   timestamptz,
  veces_usada     integer     not null default 0 check (veces_usada >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index plantillas_compra_activas on plantillas_compra (organizacion_id, nombre) where activa;

create table liquidaciones_propina (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        not null references sucursales(id) on delete restrict,

  serie           text        not null default 'LIQ' check (serie ~ '^[A-Z]{1,6}$'),
  folio           bigint      not null check (folio > 0),

  liquidada_en    timestamptz not null default now(),
  rango_inicio    timestamptz not null,
  rango_fin       timestamptz not null,
  rango_tipo      text        not null default 'personalizado'
                              check (rango_tipo in ('dia','semana','quincena','mes',
                                                    'personalizado','mesero')),

  -- Nulo = liquidación global de varios meseros.
  empleado_id     uuid        references empleos(id) on delete restrict,
  total_centavos  bigint      not null default 0 check (total_centavos >= 0),

  empleado_liquida_id uuid    not null references empleos(id) on delete restrict,
  notas           text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint liquidacion_rango_ordenado check (rango_fin >= rango_inicio),
  constraint liquidaciones_id_org_unica unique (id, organizacion_id)
);

alter table liquidaciones_propina add constraint liquidaciones_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;
alter table liquidaciones_propina add constraint liquidaciones_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;
alter table liquidaciones_propina add constraint liquidaciones_liquida_misma_org
  foreign key (empleado_liquida_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

create unique index liquidaciones_idempotencia
  on liquidaciones_propina (organizacion_id, idempotency_key)
  where idempotency_key is not null;
create index liquidaciones_por_organizacion
  on liquidaciones_propina (organizacion_id, liquidada_en desc);

comment on table liquidaciones_propina is
  'venta_ids y desglose_meseros NO se guardan: se derivan de ordenes.propina_liquidacion_id, '
  'que además hace consultable qué ventas entraron. Ver F1-04 §30.1.';

-- El corte de turno es un arqueo INTERMEDIO que el cajero firma sin cerrar la
-- caja. No es una sesión, así que no va en sesiones_caja.
--
-- Sólo se guarda lo que no se puede derivar: lo que alguien contó y lo que
-- alguien escribió. Los totales salen de movimientos_caja y pagos acotados al
-- rango, igual que en el cierre diario (F1-04 §20.2).
create table cortes_turno (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sesion_caja_id  uuid        not null references sesiones_caja(id) on delete restrict,

  serie           text        not null default 'CT' check (serie ~ '^[A-Z]{1,6}$'),
  folio           bigint      not null check (folio > 0),

  rango_inicio    timestamptz not null,
  cortado_en      timestamptz not null default now(),

  empleado_id     uuid        not null references empleos(id) on delete restrict,

  efectivo_contado_centavos  bigint not null check (efectivo_contado_centavos >= 0),
  efectivo_retirado_centavos bigint not null default 0 check (efectivo_retirado_centavos >= 0),
  notas           text,

  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint corte_turno_rango_ordenado check (cortado_en >= rango_inicio),
  constraint corte_turno_retiro_no_excede check (
    efectivo_retirado_centavos <= efectivo_contado_centavos
  )
);

alter table cortes_turno add constraint cortes_turno_sesion_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;
alter table cortes_turno add constraint cortes_turno_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

create unique index cortes_turno_idempotencia
  on cortes_turno (organizacion_id, idempotency_key) where idempotency_key is not null;
create index cortes_turno_por_sesion on cortes_turno (sesion_caja_id, cortado_en);

create table bitacora_sincronizacion (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  tipo_registro   text        not null check (length(trim(tipo_registro)) > 0),
  registro_id     uuid        not null,
  destino         text        not null check (destino in ('google_sheets','google_drive','local_export')),
  estado          text        not null default 'pending_external_sync'
                              check (estado in ('pending','pending_external_sync','synced','failed')),
  intentos        integer     not null default 0 check (intentos >= 0),
  ultimo_intento_en timestamptz,
  mensaje_error   text,
  archivo_url     text,
  pestana_hoja    text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index bitacora_pendientes on bitacora_sincronizacion (organizacion_id, estado, created_at)
  where estado in ('pending','pending_external_sync');

comment on table bitacora_sincronizacion is
  'La forma es correcta; el trabajador que la consuma no existe. Hoy intentos y '
  'ultimo_intento_en se escriben una vez y nunca se actualizan, y el botón Reintentar '
  'es un setTimeout (IntegracionesRespaldos.jsx:68-73). Ver F1-04 §32.1.';

-- Ahora que existen las dos tablas.
alter table ordenes add constraint ordenes_mesa_misma_org
  foreign key (mesa_id, organizacion_id)
  references mesas (id, organizacion_id) on delete set null (mesa_id);

alter table ordenes add constraint ordenes_liquidacion_misma_org
  foreign key (propina_liquidacion_id, organizacion_id)
  references liquidaciones_propina (id, organizacion_id)
  on delete set null (propina_liquidacion_id);

alter table mesas add constraint mesas_orden_activa_misma_org
  foreign key (orden_activa_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete set null (orden_activa_id);

alter table insumos add constraint insumos_proveedor_misma_org
  foreign key (proveedor_id, organizacion_id)
  references proveedores (id, organizacion_id) on delete set null (proveedor_id);

alter table categorias add constraint categorias_estacion_misma_org
  foreign key (estacion_preparacion_id, organizacion_id)
  references estaciones_preparacion (id, organizacion_id)
  on delete set null (estacion_preparacion_id);

alter table empleos add constraint empleos_estacion_misma_org
  foreign key (estacion_preparacion_id, organizacion_id)
  references estaciones_preparacion (id, organizacion_id)
  on delete set null (estacion_preparacion_id);

-- DescuentoInventarioVenta no es una tabla: es una lectura de movimientos_stock
-- (F1-02 §8, trampa T4). Cuatro de sus campos salen null porque el ledger
-- agrega por insumo y su referencia apunta a la orden, no a la línea — y
-- ninguno de los cuatro se lee en el frontend. Ver F1-04 §19.1.
create view descuentos_inventario_venta as
select
  m.id,
  m.organizacion_id,
  m.referencia_id                         as venta_id,
  null::uuid                              as detalle_venta_id,
  null::uuid                              as producto_id,
  m.insumo_id                             as ingrediente_id,
  i.nombre                                as ingrediente_nombre,
  null::numeric                           as cantidad_producto,
  null::numeric                           as cantidad_ingrediente_por_producto,
  abs(m.cantidad)                         as cantidad_total_descontada,
  m.unidad                                as unidad_base,
  m.costo_unitario_centavos               as costo_unitario_snapshot,
  (abs(m.cantidad) * m.costo_unitario_centavos)::bigint as costo_total_descontado,
  m.created_at                            as fecha
from movimientos_stock m
join insumos i on i.id = m.insumo_id and i.organizacion_id = m.organizacion_id
where m.referencia_tipo = 'orden'
  and m.tipo = 'salida_venta';

do $$
declare t text;
begin
  foreach t in array array[
    'zonas','mesas','estaciones_preparacion','comandas','comanda_items',
    'solicitudes_qr','menu_qr_secciones','proveedores','compras','compra_lineas',
    'gastos','plantillas_gasto','plantillas_compra','liquidaciones_propina',
    'cortes_turno','bitacora_sincronizacion'
  ]
  loop
    execute format(
      'create trigger %I_tocar_updated_at before update on %I
         for each row execute function tocar_updated_at()', t, t);

    -- Misma postura que 005_rls.sql: anon y authenticated no pueden hacer NADA.
    -- La aplicación habla por Kysely con credenciales de servidor.
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- Portabilidad: los roles de Supabase no existen en un Postgres pelón, y un
-- `revoke ... from anon` incondicional aborta la migración entera en el compose
-- de CI, que es la única prueba de la promesa A-27.
do $$
declare roles text; t text;
begin
  select string_agg(quote_ident(rolname), ', ') into roles
    from pg_roles where rolname in ('anon','authenticated');
  if roles is null then return; end if;
  foreach t in array array[
    'zonas','mesas','estaciones_preparacion','comandas','comanda_items',
    'solicitudes_qr','menu_qr_secciones','proveedores','compras','compra_lineas',
    'gastos','plantillas_gasto','plantillas_compra','liquidaciones_propina',
    'cortes_turno','bitacora_sincronizacion'
  ]
  loop
    execute format('revoke all on public.%I from %s', t, roles);
  end loop;
  -- La vista hereda los permisos de quien la define, no los de las tablas de
  -- las que lee: si no se revoca aquí, `descuentos_inventario_venta` sería la
  -- puerta abierta a `movimientos_stock` que el bucle acaba de cerrar.
  execute format('revoke all on public.descuentos_inventario_venta from %s', roles);
end;
$$;

-- ── Semilla obligatoria por organización de restaurante (F1-04 §34.28) ─────
--
-- Sin esto la primera mesa no tiene zona a la que apuntar y la primera comanda
-- no tiene estación general. Los cinco nombres son los de `lib/constants.js:118`;
-- el nombre y el color de la estación, los de `utils/estacionUtils.js:49-50`.
--
-- Se escribe POR GIRO y no por identificador —el DDL del mapa lo dejaba como
-- `$1`, que no es ejecutable en una migración— para que valga también para la
-- siguiente organización de restaurante que se cree. El `not exists` la hace
-- idempotente: aplicarla dos veces no duplica nada.
insert into zonas (organizacion_id, nombre, orden)
select o.id, z.nombre, z.orden
from organizaciones o
cross join (values ('Interior',0),('Exterior',1),('Terraza',2),('Barra',3),('Otro',4)) as z(nombre, orden)
where o.paquete = 'restaurante'
  and not exists (select 1 from zonas x where x.organizacion_id = o.id and x.nombre = z.nombre);

insert into estaciones_preparacion (organizacion_id, nombre, descripcion, color, orden, es_general)
select o.id, 'Cocina general', 'Estación por defecto', '#4A5568', 0, true
from organizaciones o
where o.paquete = 'restaurante'
  and not exists (select 1 from estaciones_preparacion e where e.organizacion_id = o.id and e.es_general);
