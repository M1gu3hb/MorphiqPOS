-- 051 · Registro de sesiones revocables (F1-10 B-3).
--
-- La cookie sigue siendo autocontenida y firmada, pero su `sid` deja de ser
-- decorativo. Cada petición exige que exista aquí una fila vigente. Así un
-- cierre de sesión, una baja o un cambio de puesto invalidan la cookie antes
-- de sus ocho horas de vencimiento.

create table sesiones (
  sid              text        primary key check (sid ~ '^[0-9a-f]{32}$'),
  organizacion_id  uuid        not null,
  empleo_id        uuid        not null,
  creada_en        timestamptz not null default now(),
  expira_en        timestamptz not null,
  revocada_en      timestamptz,

  constraint sesiones_empleo_misma_org
    foreign key (empleo_id, organizacion_id)
    references empleos (id, organizacion_id) on delete cascade,
  constraint sesiones_vencen_despues_de_crearse
    check (expira_en > creada_en),
  constraint sesiones_se_revocan_despues_de_crearse
    check (revocada_en is null or revocada_en >= creada_en)
);

-- Cambiar el puesto o dar de baja a un empleo revoca todas sus sesiones con
-- una actualización acotada. La fecha permite purgarlas después sin perder
-- de inmediato el rastro operativo del cierre.
create index sesiones_empleo_activas
  on sesiones (organizacion_id, empleo_id)
  where revocada_en is null;

create index sesiones_expira_en on sesiones (expira_en);

alter table sesiones enable row level security;
alter table sesiones force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format(
      'revoke all privileges on table sesiones from %s',
      roles_publicos
    );
  else
    raise notice 'Roles anon/authenticated ausentes: no es Supabase. RLS queda activo igual.';
  end if;
end;
$$;

comment on table sesiones is
  'Registro servidor de los sid emitidos. Una cookie firmada sólo autoriza mientras su fila siga vigente y no revocada.';
