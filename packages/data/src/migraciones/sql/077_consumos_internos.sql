-- 077 · La comida del personal y las cortesías (F-261).
--
-- ── Lo que hoy ensucia dos números a la vez ───────────────────────────────
-- La comida del personal y las cortesías al cliente frecuente salen del
-- inventario todos los días. Hoy o se registran como MERMA —y ensucian la merma,
-- que es el número con el que se persigue el desperdicio— o no se registran —y
-- aparecen como faltante en la toma física, que es el número con el que se
-- persigue el robo—. Las dos salidas acusan a alguien de algo que no hizo.
--
-- ── Sale del stock, NO entra a ventas ─────────────────────────────────────
-- Es la regla entera de esta función. `consumos_internos` nunca toca `ordenes`:
-- no hay ruta por la que un consumo interno se convierta en venta, y está
-- escrito aquí para que nadie lo «mejore» después.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table consumos_internos (
  id               uuid          primary key default gen_random_uuid(),
  organizacion_id  uuid          not null references organizaciones (id) on delete cascade,
  sucursal_id      uuid          not null references sucursales (id),
  almacen_id       uuid          not null references almacenes (id),

  tipo             text          not null,
  -- Sólo en cortesía y reposición: el platillo que se repuso pertenece a una
  -- cuenta. En el consumo del personal no hay cuenta ninguna.
  orden_id         uuid          references ordenes (id),

  producto_id      uuid          references productos (id) on delete set null,
  -- Instantánea: el reporte de hace seis meses tiene que seguir diciendo qué
  -- se consumió aunque el producto se haya renombrado o borrado.
  producto_nombre  text          not null check (length(trim(producto_nombre)) > 0),
  cantidad         numeric(14, 4) not null check (cantidad > 0),
  unidad           text          not null,

  -- CALCULADO EN EL SERVIDOR desde la receta, nunca recibido. Un costo que
  -- llega del navegador convierte este registro en un número que el empleado
  -- elige.
  costo_centavos   bigint        not null check (costo_centavos >= 0),

  motivo           text          not null check (length(trim(motivo)) > 0),
  -- Quién lo autorizó. Sin responsable, esta tabla sería el camino cómodo para
  -- que salga comida sin que nadie responda.
  empleado_id      uuid          not null references empleos (id),
  created_at       timestamptz   not null default now(),

  constraint consumo_interno_tipo_valido check (
    tipo in ('personal', 'cortesia', 'reposicion', 'degustacion')
  ),
  -- El consumo del personal no cuelga de una cuenta, y una cortesía sí: es la
  -- diferencia entre «se lo comió el cocinero» y «se lo regalamos a la mesa 4».
  constraint consumo_interno_orden_segun_tipo check (
    (tipo in ('cortesia', 'reposicion')) or orden_id is null
  )
);

comment on table consumos_internos is
  'F-261 · Sale del stock y NO entra a ventas. Separa la comida del personal de la merma y del faltante, que son tres cosas distintas.';

create index consumos_internos_por_dia
  on consumos_internos (organizacion_id, sucursal_id, created_at desc);
create index consumos_internos_por_tipo
  on consumos_internos (organizacion_id, tipo, created_at desc);

-- ── El ledger admite los dos tipos nuevos ─────────────────────────────────
--
-- Se reescribe el `check` entero, que es la única forma de ampliar un
-- `check in (...)` en Postgres.
alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in ('orden', 'compra', 'conteo', 'manual', 'consumo_interno', 'anulacion')
  );

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table consumos_internos enable row level security;
  alter table consumos_internos force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table consumos_internos from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    -- Inmutable: lo que salió del almacén, salió. Corregirlo es otro registro.
    grant select, insert on table consumos_internos to morphiqpos_app;
  end if;
end;
$$;
