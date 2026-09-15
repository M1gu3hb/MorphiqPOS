-- 050 · Cierra por defecto toda relación pública (F1-10 B-0).
--
-- La migración 045 enumeró las tablas que creaba. En producción se aplicó sólo
-- una parte del archivo y ocho quedaron expuestas. Enumerar otra vez repetiría
-- el mismo defecto: la tabla 46 volvería a depender de que alguien recordara
-- agregar su nombre. Esta reparación consulta el catálogo y cubre también lo
-- que se agregue antes de ejecutarla.

do $$
declare
  relacion record;
begin
  for relacion in
    select n.nspname as esquema, c.relname as nombre
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
  loop
    execute format(
      'alter table %I.%I enable row level security',
      relacion.esquema,
      relacion.nombre
    );
    execute format(
      'alter table %I.%I force row level security',
      relacion.esquema,
      relacion.nombre
    );
  end loop;
end;
$$;

-- Quitar los privilegios además de activar RLS hace que PostgREST rechace el
-- acceso en vez de responder 200 con una lista vacía. Las vistas se incluyen:
-- se ejecutan con los permisos de su dueño y pueden reabrir una tabla cerrada.
do $$
declare
  relacion record;
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is null then
    raise notice 'Roles anon/authenticated ausentes: no es Supabase.';
    return;
  end if;

  for relacion in
    select n.nspname as esquema, c.relname as nombre, c.relkind
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'S')
  loop
    if relacion.relkind = 'S' then
      execute format(
        'revoke all privileges on sequence %I.%I from %s',
        relacion.esquema,
        relacion.nombre,
        roles_publicos
      );
    else
      execute format(
        'revoke all privileges on table %I.%I from %s',
        relacion.esquema,
        relacion.nombre,
        roles_publicos
      );
    end if;
  end loop;

  execute format(
    'alter default privileges in schema public revoke all privileges on tables from %s',
    roles_publicos
  );
  execute format(
    'alter default privileges in schema public revoke all privileges on sequences from %s',
    roles_publicos
  );
end;
$$;

comment on schema public is
  'MorphiqPOS. La API TypeScript autoriza; anon y authenticated no acceden por PostgREST. Toda tabla pública tiene RLS ENABLE + FORCE.';
