-- 041 · Recetas normalizadas y rentabilidad derivada.

alter table productos
  add column utilidad_unitaria_centavos bigint generated always as
    (precio_venta_centavos - costo_unitario_centavos) stored,
  add column margen_bp bigint generated always as
    (case
      when precio_venta_centavos = 0 then 0
      else round(
        ((precio_venta_centavos - costo_unitario_centavos)::numeric * 10000)
        / precio_venta_centavos
      )::bigint
    end) stored;

create table recetas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  producto_id     uuid        not null references productos(id) on delete cascade,
  insumo_id       uuid        not null references insumos(id) on delete restrict,
  cantidad        numeric(14,4) not null check (cantidad > 0),
  unidad          text        not null check (unidad in ('pieza', 'kg', 'g', 'l', 'ml', 'm')),
  merma_bp        integer     not null default 0 check (merma_bp between 0 and 10000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organizacion_id, producto_id, insumo_id),
  constraint recetas_producto_misma_org foreign key (producto_id, organizacion_id)
    references productos(id, organizacion_id) on delete cascade,
  constraint recetas_insumo_misma_org foreign key (insumo_id, organizacion_id)
    references insumos(id, organizacion_id) on delete restrict
);

create index recetas_por_producto on recetas (organizacion_id, producto_id);
create index recetas_por_insumo on recetas (organizacion_id, insumo_id);

create trigger recetas_tocar_updated_at before update on recetas
  for each row execute function tocar_updated_at();

alter table recetas enable row level security;
alter table recetas force row level security;

do $$
declare
  roles text;
begin
  select string_agg(quote_ident(rolname), ', ') into roles
    from pg_roles where rolname in ('anon', 'authenticated');
  if roles is not null then
    execute format('revoke all on public.recetas from %s', roles);
  end if;
end;
$$;

comment on table recetas is
  'Ingredientes por producto. El costo se recalcula en el comando de receta/costo; utilidad y margen son columnas generadas.';
