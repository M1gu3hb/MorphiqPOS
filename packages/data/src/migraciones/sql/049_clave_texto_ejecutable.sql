-- 049 · `clave_texto()` ejecutable por el rol de la aplicación.
--
-- ── El fallo, encontrado ejecutando y no leyendo ───────────────────────────
-- Los tres únicos de la migración 046 son índices sobre `clave_texto(nombre)`,
-- así que Postgres EVALÚA esa función en cada `insert` sobre `insumos`,
-- `categorias` y `estaciones_preparacion`.
--
-- `clave_texto` llama a `extensions.unaccent`, y `morphiqpos_app` no tiene
-- USAGE sobre el esquema `extensions`. Resultado: crear un insumo o una
-- categoría devolvía `permission denied for schema extensions` — en
-- producción, no en una prueba.
--
-- La migración 046 se aplicó con el rol dueño, que sí puede, así que el índice
-- se creó sin protestar. El fallo sólo aparece cuando escribe la APLICACIÓN, y
-- por eso ninguna de las cuatro puertas lo veía: es exactamente el hueco que
-- avisa `supabase-vercel-produccion` §3 — «verifica siempre con el rol que va a
-- leer en producción», y aquí, con el que va a escribir.
--
-- ── Por qué SECURITY DEFINER y no abrir el esquema ─────────────────────────
-- `clave_texto` es una función PURA de texto: no toca ninguna tabla y tiene
-- `search_path` fijo. `SECURITY DEFINER` la ejecuta con los permisos del dueño
-- sólo durante esa llamada. Dar USAGE sobre `extensions` a la aplicación le
-- abriría todo lo que hoy y mañana viva ahí, que es mucho más de lo necesario.
create or replace function clave_texto(t text) returns text
language sql
immutable
strict
parallel safe
security definer
set search_path = pg_catalog, extensions, public
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(regexp_replace(t, '\s+', ' ', 'g'))));
$$;

-- Con SECURITY DEFINER, `public` podría ejecutarla por omisión. Se revoca y se
-- concede sólo a quien la necesita.
revoke all on function clave_texto(text) from public;

do $$
declare rol text;
begin
  foreach rol in array array['morphiqpos_app', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = rol) then
      execute format('grant execute on function clave_texto(text) to %I', rol);
    end if;
  end loop;
end;
$$;

comment on function clave_texto is
  'Clave de comparación de nombres: sin acentos, sin mayúsculas, sin espacios repetidos. '
  'SECURITY DEFINER porque la evalúan los índices únicos de la migración 046 al escribir con '
  'el rol de la aplicación, que no tiene USAGE sobre el esquema extensions. '
  'Es una función pura de texto: no toca ninguna tabla.';
