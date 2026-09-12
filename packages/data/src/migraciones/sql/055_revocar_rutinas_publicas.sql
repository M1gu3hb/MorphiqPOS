-- 055 · Impide ejecutar rutinas public a través de los roles de PostgREST.
--
-- PostgreSQL concede EXECUTE a PUBLIC al crear una función. Revocar sólo a
-- anon/authenticated no basta porque ambos heredan esa concesión de PUBLIC.
-- Primero se retira la herencia general y luego cualquier concesión directa.

revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

do $$
declare
  roles_postgrest text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_postgrest
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_postgrest is null then
    raise notice 'Roles anon/authenticated ausentes: no es Supabase.';
    return;
  end if;

  execute format(
    'revoke execute on all functions in schema public from %s',
    roles_postgrest
  );
  execute format(
    'alter default privileges in schema public revoke execute on functions from %s',
    roles_postgrest
  );
end;
$$;

-- El rol privado de la aplicación conserva las concesiones explícitas que
-- necesita. Revocar EXECUTE no afecta la invocación interna de triggers.
