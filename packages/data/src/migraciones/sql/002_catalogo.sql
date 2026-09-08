-- ═══════════════════════════════════════════════════════════════════════════
-- 002 · Catálogo
--
-- Categorías, productos con los cuatro tipos de venta, y modificadores
-- normalizados.
--
-- `productos` es la tabla con más fusión de todo el esquema: junta
-- `ProductoTerminado` del restaurante con `productos` de la tiendita.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────── categorias
-- Unifica `CategoriaProducto` y `CategoriaIngrediente` de la fuente en una sola
-- tabla con discriminador.
create table categorias (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,

  tipo            text        not null default 'producto'
                              check (tipo in ('producto', 'insumo')),
  nombre          text        not null check (length(trim(nombre)) > 0),
  color           text        check (color ~ '^#[0-9a-fA-F]{6}$'),
  icono           text,
  orden           integer     not null default 0,
  activa          boolean     not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index categorias_por_organizacion on categorias (organizacion_id, tipo, orden);
create unique index categorias_nombre_unico
  on categorias (organizacion_id, tipo, lower(nombre));

-- ───────────────────────────────────────────────────────────────── productos
create table productos (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  categoria_id    uuid        references categorias(id) on delete set null,

  nombre          text        not null check (length(trim(nombre)) > 0),
  descripcion     text,
  imagen_url      text,
  sku             text,
  codigo_barras   text,
  marca           text,

  -- ── Dinero: bigint de centavos, SIEMPRE (R15) ───────────────────────────
  precio_venta_centavos          bigint  not null default 0 check (precio_venta_centavos >= 0),
  costo_unitario_centavos        bigint  not null default 0 check (costo_unitario_centavos >= 0),

  -- Mayoreo por volumen. Ambos o ninguno: un precio de mayoreo sin cantidad
  -- mínima no se puede aplicar, y una cantidad sin precio tampoco.
  precio_mayoreo_centavos        bigint  check (precio_mayoreo_centavos >= 0),
  cantidad_minima_mayoreo        numeric(14,4) check (cantidad_minima_mayoreo > 0),

  -- ── Tipo de venta: el eje que la fuente del restaurante resolvió bien ────
  tipo_venta      text        not null default 'precio_fijo'
                              check (tipo_venta in ('precio_fijo', 'variable_medida',
                                                    'porcion_contenedor', 'servicio')),
  unidad_venta    text        not null default 'pieza'
                              check (unidad_venta in ('pieza', 'caja', 'paquete',
                                                      'kg', 'g', 'l', 'ml', 'm')),

  -- variable_medida: se vende por peso o medida
  unidad_variable                text
                                 check (unidad_variable in ('kg', 'g', 'l', 'ml', 'm')),
  precio_por_unidad_variable_centavos bigint
                                 check (precio_por_unidad_variable_centavos >= 0),
  cantidad_minima_variable       numeric(14,4) check (cantidad_minima_variable > 0),
  cantidad_maxima_variable       numeric(14,4) check (cantidad_maxima_variable > 0),
  incremento_variable            numeric(14,4) check (incremento_variable > 0),

  -- porcion_contenedor: una botella que se sirve por copas
  capacidad_contenedor_ml        numeric(14,4) check (capacidad_contenedor_ml > 0),
  porciones_por_contenedor       numeric(14,4) check (porciones_por_contenedor > 0),
  ml_por_porcion                 numeric(14,4) check (ml_por_porcion > 0),
  nombre_porcion                 text,
  precio_por_porcion_centavos    bigint check (precio_por_porcion_centavos >= 0),

  -- ── Inventario ──────────────────────────────────────────────────────────
  -- `sku` descuenta el producto mismo; `receta` llega en F1.3; `ninguno` es un
  -- servicio. F1.1 sólo implementa `sku` y `ninguno`.
  estrategia_consumo             text not null default 'sku'
                                 check (estrategia_consumo in ('sku', 'receta',
                                                               'insumo_base', 'ninguno')),
  permite_venta_sin_stock        boolean not null default false,
  stock_minimo                   numeric(14,4) not null default 0 check (stock_minimo >= 0),

  -- ── Presentación ────────────────────────────────────────────────────────
  visible_en_pos                 boolean not null default true,
  activo                         boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- ── Coherencia del tipo de venta, impuesta por la BASE ──────────────────
  -- Sin estos checks, un producto por medida sin precio por unidad se vendería
  -- a cero y nadie se enteraría hasta el corte de caja.
  constraint producto_variable_completo check (
    tipo_venta <> 'variable_medida' or (
      unidad_variable is not null
      and precio_por_unidad_variable_centavos is not null
    )
  ),
  constraint producto_porcion_completo check (
    tipo_venta <> 'porcion_contenedor' or (
      capacidad_contenedor_ml is not null
      and ml_por_porcion is not null
      and precio_por_porcion_centavos is not null
    )
  ),
  constraint producto_mayoreo_completo check (
    (precio_mayoreo_centavos is null) = (cantidad_minima_mayoreo is null)
  ),
  constraint producto_rango_variable check (
    cantidad_maxima_variable is null
    or cantidad_minima_variable is null
    or cantidad_maxima_variable >= cantidad_minima_variable
  ),
  -- Un servicio no descuenta inventario. Es lo que distingue "corte de cabello"
  -- de "shampoo".
  constraint producto_servicio_sin_stock check (
    tipo_venta <> 'servicio' or estrategia_consumo = 'ninguno'
  )
);

create index productos_por_organizacion on productos (organizacion_id, activo);
create index productos_por_categoria on productos (organizacion_id, categoria_id)
  where activo;

-- Índice PARCIAL: un producto sin código de barras es normal y no debe chocar
-- con los otros que tampoco lo tienen.
create unique index productos_codigo_barras_unico
  on productos (organizacion_id, codigo_barras)
  where codigo_barras is not null;

create unique index productos_sku_unico
  on productos (organizacion_id, lower(sku))
  where sku is not null;

-- Búsqueda por nombre sin acentos ni mayúsculas: el cajero escribe "cafe" y
-- tiene que encontrar "Café". Sin esto se resuelve con `ilike '%...%'`, que no
-- usa índice y hace lento el catálogo a los 2,000 productos.
create extension if not exists pg_trgm;
create index productos_busqueda_nombre on productos using gin (nombre gin_trgm_ops);

-- ────────────────────────────────────────────────────────────── modificadores
-- La fuente los guardaba como `jsonb` anidado dentro del producto. Normalizarlos
-- permite reusar un grupo entre productos y consultarlo.
--
-- Mejora sobre la fuente: las opciones pueden tener precio. Allí eran "sólo
-- informativas", así que un extra de queso no se cobraba.
create table modificadores (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  nombre          text        not null check (length(trim(nombre)) > 0),
  obligatorio     boolean     not null default false,
  tipo            text        not null default 'unica' check (tipo in ('unica', 'multiple')),
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index modificadores_por_organizacion on modificadores (organizacion_id, activo);

create table modificador_opciones (
  id                   uuid        primary key default gen_random_uuid(),
  modificador_id       uuid        not null references modificadores(id) on delete cascade,
  nombre               text        not null check (length(trim(nombre)) > 0),
  precio_extra_centavos bigint     not null default 0 check (precio_extra_centavos >= 0),
  orden                integer     not null default 0,
  activa               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index modificador_opciones_por_grupo
  on modificador_opciones (modificador_id, orden) where activa;

create table producto_modificadores (
  producto_id     uuid    not null references productos(id) on delete cascade,
  modificador_id  uuid    not null references modificadores(id) on delete cascade,
  orden           integer not null default 0,
  primary key (producto_id, modificador_id)
);

-- ──────────────────────────────────────────────────────────────── clientes
create table clientes (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  persona_id      uuid        references personas(id) on delete set null,

  nombre          text        not null check (length(trim(nombre)) > 0),
  telefono        text,
  correo          text,
  notas           text,

  total_visitas          integer not null default 0 check (total_visitas >= 0),
  total_consumido_centavos bigint not null default 0 check (total_consumido_centavos >= 0),
  ultima_visita          timestamptz,

  -- El fiado llega en F1.3, pero las columnas entran ya: agregarlas después
  -- obligaría a migrar una tabla con datos, y A-41 dice que se difiere lo que
  -- se puede agregar sin reescribir, no lo que fuerza una migración de datos.
  saldo_pendiente_centavos bigint not null default 0,
  limite_credito_centavos  bigint not null default 0 check (limite_credito_centavos >= 0),

  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index clientes_por_organizacion on clientes (organizacion_id, activo);
create index clientes_busqueda_nombre on clientes using gin (nombre gin_trgm_ops);

-- ───────────────────────────────────────────────────── updated_at automático
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'productos', 'modificadores', 'modificador_opciones', 'clientes'
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
