-- 056 · Reserva atómica de la cuota de archivos por organización (F1-10 O-4).
--
-- El tamaño observado en S3 sirve para inicializar y reconciliar el contador.
-- La decisión de aceptar N bytes ocurre después en un único UPSERT condicional;
-- dos subidas concurrentes no pueden aprobarse leyendo el mismo total anterior.

create table cuotas_archivos (
  organizacion_id uuid primary key references organizaciones (id) on delete cascade,
  bytes_usados    bigint      not null default 0,
  updated_at      timestamptz not null default now(),

  constraint cuotas_archivos_bytes_no_negativos check (bytes_usados >= 0)
);

alter table cuotas_archivos enable row level security;
alter table cuotas_archivos force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table cuotas_archivos from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table cuotas_archivos to morphiqpos_app;
  end if;
end;
$$;

comment on table cuotas_archivos is
  'Contador servidor para reservar bytes antes de escribir en S3. La aceptación se decide con un UPSERT condicional atómico.';
