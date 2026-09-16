-- 111 · Dónde está la pieza (F-152).
--
-- ── Por qué NO sirve `zonas_anaquel` ─────────────────────────────────────
-- `zonas_anaquel` (F-149, migración 091) y esto conviven a propósito: la zona
-- existe para CONTAR —una vez al día, por el encargado, agrupando muchas
-- gavetas— y la ubicación existe para VENDER —sesenta veces al día, por el
-- mostradorista, gaveta por gaveta—. Fusionarlas obligaría a que la unidad de
-- conteo fuera la gaveta, y contar 400 gavetas es una vuelta de dos años.
--
-- La zona se queda enlazada, y ése es el enganche que une el vender con el
-- contar: se vende por gaveta y se cuenta por zona sin capturar nada dos veces.
--
-- ── El orden de recorrido no es decoración ───────────────────────────────
-- Es el camino que se hace a pie por la bodega. Una lista de surtido ordenada
-- por nombre de producto hace caminar el pasillo cuatro veces; ordenada por
-- recorrido, una. En una lista de trabajo de veinte piezas eso es el turno.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table ubicaciones (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  almacen_id       uuid        not null references almacenes (id) on delete cascade,
  codigo           text        not null check (length(trim(codigo)) > 0),
  descripcion      text,
  -- Una zona agrupa varias ubicaciones: es lo que une el vender con el contar.
  zona_id          uuid        references zonas_anaquel (id) on delete set null,
  orden_recorrido  int         not null default 0,
  activa           boolean     not null default true,
  created_at       timestamptz not null default now(),

  unique (almacen_id, codigo)
);

comment on table ubicaciones is
  'F-152 · Dónde está esta pieza. Distinta de zonas_anaquel: la zona es para contar una vez al día; la ubicación es para vender sesenta veces al día.';
comment on column ubicaciones.orden_recorrido is
  'El camino que se hace a pie por la bodega. Surtir por nombre de producto hace caminar el pasillo cuatro veces; surtir por recorrido, una.';

create index ubicaciones_por_recorrido
  on ubicaciones (organizacion_id, almacen_id, orden_recorrido) where activa;
-- Para el conteo: todas las gavetas de una zona, de un tirón.
create index ubicaciones_por_zona
  on ubicaciones (organizacion_id, zona_id) where zona_id is not null;

alter table productos add column ubicacion_id uuid references ubicaciones (id);

create index productos_por_ubicacion
  on productos (organizacion_id, ubicacion_id) where ubicacion_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table ubicaciones enable row level security;
  alter table ubicaciones force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table ubicaciones from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update, delete on table ubicaciones to morphiqpos_app;
  end if;
end;
$$;
