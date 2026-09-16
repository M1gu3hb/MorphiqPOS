-- 090 · Presentaciones: el corazón del modelo de retail (F-111 y F-112).
--
-- ── La plantilla `esencial` NO tiene inventario ───────────────────────────
-- Se vende y el stock no baja. El dueño no puede saber qué le falta ni qué le
-- robaron: los dos dolores más caros de una tiendita quedan sin respuesta, y es
-- el hueco que D-01 señala por su nombre al renombrar `esencial` a `tienda`.
--
-- ── Una fila por forma de comprar o vender el mismo producto ──────────────
-- El refresco se vende suelto y en six y se compra en reja; el cigarro se vende
-- suelto de una cajetilla de veinte. La EXISTENCIA se lleva siempre en unidad
-- base: vender un six descuenta seis piezas. Llevarla en la presentación que se
-- vendió obligaría a sumar manzanas con cajas de manzanas.
--
-- ── Por qué el factor es `numeric(14,4)` y no entero ──────────────────────
-- El cigarro suelto tiene factor 1/20 = 0.05 y el huevo por kilo ≈16.6. Un
-- entero obligaría a invertir la unidad base y a llevar el inventario de
-- cigarros en cigarros, que es contraintuitivo para el tendero.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table producto_presentaciones (
  id                     uuid          primary key default gen_random_uuid(),
  organizacion_id        uuid          not null references organizaciones (id) on delete cascade,
  producto_id            uuid          not null references productos (id) on delete cascade,

  nombre                 text          not null check (length(trim(nombre)) > 0),
  -- Cuántas unidades base contiene. La base vale exactamente 1.
  factor                 numeric(14, 4) not null check (factor > 0),
  codigo_barras          text,
  sku                    text,
  -- Nulo = se deriva como `factor × precio base`. Con valor, manda éste: un six
  -- casi nunca cuesta exactamente seis veces la pieza, y ése es el punto.
  precio_venta_centavos  bigint        check (precio_venta_centavos >= 0),

  es_base                boolean       not null default false,
  es_compra_default      boolean       not null default false,
  es_venta_default       boolean       not null default false,
  activa                 boolean       not null default true,

  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now(),

  -- La base SIEMPRE vale 1. Una base con factor 3 convertiría la unidad de
  -- inventario en otra cosa sin que nadie lo dijera, y todas las existencias
  -- históricas pasarían a significar un tercio de lo que dicen.
  constraint presentacion_base_factor_uno check (not es_base or factor = 1),

  constraint presentaciones_producto_misma_org
    foreign key (producto_id, organizacion_id) references productos (id, organizacion_id)
    on delete cascade
);

comment on table producto_presentaciones is
  'F-112 · Una fila por forma de comprar o vender un producto. La existencia se lleva en unidad base: vender un six descuenta seis piezas.';
comment on column producto_presentaciones.factor is
  'Cuántas unidades base contiene. Decimal a propósito: el cigarro suelto vale 0.05 de una cajetilla.';
comment on column producto_presentaciones.precio_venta_centavos is
  'Nulo = factor × precio base. Con valor manda éste: un six casi nunca cuesta seis veces la pieza.';

-- UNA sola base por producto. Sin esto, dos bases con factores distintos harían
-- que el mismo producto llevara dos inventarios.
create unique index presentaciones_una_base_por_producto
  on producto_presentaciones (producto_id) where es_base;

-- Un código de barras apunta a UNA presentación. Es el error que más se va a
-- intentar —pegar el código del six en la pieza— y el que más caro sale: el
-- escáner descontaría seis veces menos de lo que salió del anaquel.
create unique index presentaciones_codigo_unico
  on producto_presentaciones (organizacion_id, codigo_barras)
  where codigo_barras is not null and activa;

-- Una sola preseleccionada por lado, o la pantalla elegiría al azar.
create unique index presentaciones_una_venta_default
  on producto_presentaciones (producto_id) where es_venta_default;
create unique index presentaciones_una_compra_default
  on producto_presentaciones (producto_id) where es_compra_default;

create index presentaciones_por_producto
  on producto_presentaciones (organizacion_id, producto_id) where activa;

create trigger producto_presentaciones_tocar_updated_at
  before update on producto_presentaciones
  for each row execute function tocar_updated_at();

-- ── Backfill: NADIE se queda sin base ─────────────────────────────────────
--
-- Cada producto existente recibe su presentación base con factor 1, heredando
-- el código de barras y el precio que ya tiene. Sin esto, el primer producto que
-- alguien vendiera después de aplicar la migración no encontraría presentación
-- y la venta fallaría — sobre un catálogo que llevaba años funcionando.
insert into producto_presentaciones (
  organizacion_id, producto_id, nombre, factor, codigo_barras, sku,
  precio_venta_centavos, es_base, es_compra_default, es_venta_default
)
select p.organizacion_id,
       p.id,
       coalesce(nullif(trim(p.unidad_venta), ''), 'pieza'),
       1,
       p.codigo_barras,
       p.sku,
       p.precio_venta_centavos,
       true,
       true,
       true
  from productos p
on conflict do nothing;

-- El producto apunta a la presentación con la que se vende por omisión. Es
-- caché: la verdad es `es_venta_default`, y se conserva porque el mostrador
-- resuelve esto en cada tecleo de la ráfaga.
alter table productos add column presentacion_venta_id uuid references producto_presentaciones (id);

update productos p
   set presentacion_venta_id = pp.id
  from producto_presentaciones pp
 where pp.producto_id = p.id and pp.es_base;

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table producto_presentaciones enable row level security;
  alter table producto_presentaciones force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table producto_presentaciones from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table producto_presentaciones to morphiqpos_app;
  end if;
end;
$$;
