-- 071 · Unir mesas, separarlas y cambiar de mesa (F-302 y F-303).
--
-- ── Lo que duele hoy ───────────────────────────────────────────────────────
-- Llegan diez personas, se juntan físicamente las mesas 4 y 5, y el sistema
-- sigue viendo dos cuentas: el mesero comanda partido y la cuenta sale partida.
-- Y «nos pasamos a la terraza» obliga a cerrar y reabrir, con la comanda ya
-- enviada apuntando a la mesa vieja: cocina saca el plato a un lugar vacío.
--
-- ── Por qué DOS tablas y no una columna `mesa_padre_id` ────────────────────
-- Porque una unión tiene principio y fin. Con una columna no se puede saber que
-- anoche las mesas 4 y 5 estuvieron unidas, y la rotación de mesas (F-305)
-- necesita ese histórico para no contar dos ocupaciones donde hubo una.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table uniones_mesa (
  id                 uuid        primary key default gen_random_uuid(),
  organizacion_id    uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id        uuid        not null references sucursales (id),
  -- La mesa que conserva la cuenta. Las demás quedan absorbidas.
  mesa_principal_id  uuid        not null references mesas (id),
  -- La cuenta única del grupo: la de la principal.
  orden_id           uuid        not null references ordenes (id),
  abierta_en         timestamptz not null default now(),
  cerrada_en         timestamptz,
  empleado_id        uuid        not null references empleos (id),
  empleado_cierra_id uuid        references empleos (id),

  constraint union_cierra_despues_de_abrir check (
    cerrada_en is null or cerrada_en >= abierta_en
  ),
  -- Quién separó sólo tiene sentido si se separó.
  constraint union_cerrada_con_empleado check (
    (cerrada_en is null) = (empleado_cierra_id is null)
  )
);

comment on table uniones_mesa is
  'F-302 · Una unión de mesas, con principio y fin. El histórico es lo que permite a F-305 no contar dos ocupaciones donde hubo una.';

-- Una mesa principal no encabeza dos uniones vivas, y una cuenta no pertenece a
-- dos grupos. Índices únicos parciales y no triggers: esto tiene que aguantar
-- dos meseros pulsando «unir» en el mismo segundo desde dos tabletas.
create unique index uniones_una_abierta_por_principal
  on uniones_mesa (organizacion_id, mesa_principal_id) where cerrada_en is null;

create unique index uniones_una_abierta_por_orden
  on uniones_mesa (orden_id) where cerrada_en is null;

create index uniones_por_sucursal
  on uniones_mesa (organizacion_id, sucursal_id, abierta_en desc);

create table union_mesa_miembros (
  union_id           uuid    not null references uniones_mesa (id) on delete cascade,
  mesa_id            uuid    not null references mesas (id),
  -- La cuenta que traía esa mesa y que se absorbió, si traía alguna. Es lo que
  -- permite deshacer la unión sabiendo de dónde vino cada línea.
  orden_absorbida_id uuid    references ordenes (id),
  -- Copia del estado de la unión. Ver el docblock del índice de abajo.
  union_abierta      boolean not null default true,

  primary key (union_id, mesa_id)
);

comment on column union_mesa_miembros.union_abierta is
  'Copia de uniones_mesa.cerrada_en is null. Existe SÓLO para que el índice único parcial de abajo sea posible: un índice no puede mirar otra tabla. Lo mantiene el trigger union_miembros_siguen_a_la_union.';

-- INVARIANTE · una mesa no puede estar unida a dos grupos a la vez.
--
-- Se impone con un índice y no con un `check` cruzado porque un `check` no
-- puede mirar otra tabla, y tampoco con un trigger a secas porque un trigger
-- que consulta y luego inserta pierde contra la concurrencia: dos uniones
-- simultáneas que reclamen la mesa 5 se verían mutuamente como inexistentes.
create unique index union_mesa_una_union_viva_por_mesa
  on union_mesa_miembros (mesa_id) where union_abierta;

-- Y el trigger que mantiene honesta a la copia. Sin él, cerrar una unión
-- dejaría sus mesas marcadas como unidas para siempre.
create or replace function union_miembros_siguen_a_la_union() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (new.cerrada_en is null) is distinct from (old.cerrada_en is null) then
    update union_mesa_miembros
       set union_abierta = (new.cerrada_en is null)
     where union_id = new.id;
  end if;
  return new;
end;
$$;

create trigger union_miembros_siguen_a_la_union
  after update on uniones_mesa
  for each row execute function union_miembros_siguen_a_la_union();

-- ── La cuenta sabe a qué grupo pertenece ───────────────────────────────────
alter table ordenes
  add column union_id uuid references uniones_mesa (id);

comment on column ordenes.union_id is
  'F-302 · El grupo de mesas al que pertenece esta cuenta. Las cuentas absorbidas lo conservan aunque queden en estado `union`, para poder reconstruir el reparto.';

create index ordenes_por_union on ordenes (union_id) where union_id is not null;

-- ── La cuenta absorbida no se cobra, igual que la madre de una división ────
--
-- `union` es terminal para la cuenta que se absorbió: su consumo ya se cobra en
-- la cuenta principal. Si admitiera pago, se cobraría dos veces.
alter table ordenes drop constraint ordenes_estado_check;
alter table ordenes
  add constraint ordenes_estado_check check (
    estado in (
      'borrador', 'confirmada', 'en_preparacion', 'lista', 'cuenta_solicitada',
      'parcialmente_pagada', 'pagada', 'parcialmente_reembolsada', 'reembolsada',
      'cancelada', 'dividida', 'absorbida'
    )
  );

create or replace function orden_absorbida_sin_pagos() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from ordenes o
     where o.id = new.orden_id and o.estado in ('dividida', 'absorbida')
  ) then
    raise exception
      'Esa cuenta no se cobra: se cobra la cuenta que la absorbió o sus partes (orden %)',
      new.orden_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Reemplaza al de la 070, que sólo miraba `dividida`. Se sustituye entero en
-- vez de añadir un segundo trigger: dos triggers sobre el mismo `insert`
-- diciendo casi lo mismo es como nacen los mensajes contradictorios.
drop trigger pagos_no_sobre_cuenta_dividida on pagos;
create trigger pagos_no_sobre_cuenta_sellada
  before insert on pagos
  for each row execute function orden_absorbida_sin_pagos();

-- ── RLS ────────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table uniones_mesa        enable row level security;
  alter table uniones_mesa        force  row level security;
  alter table union_mesa_miembros enable row level security;
  alter table union_mesa_miembros force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table uniones_mesa from %s', roles_publicos);
    execute format('revoke all privileges on table union_mesa_miembros from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table uniones_mesa        to morphiqpos_app;
    grant select, insert, update, delete on table union_mesa_miembros to morphiqpos_app;
  end if;
end;
$$;
