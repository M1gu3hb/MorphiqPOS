-- ═══════════════════════════════════════════════════════════════════════════
-- 006 · Endurecimiento
--
-- Cierra las dos advertencias que el linter de Supabase levantó sobre el
-- esquema recién aplicado. Ninguna es cosmética.
--
-- Va en su propia migración, y no como una corrección dentro de 001 y 002,
-- porque esas YA están aplicadas y su hash está en el ledger. Editarlas haría
-- que el ejecutor propio avisara —con razón— de una migración modificada
-- después de aplicarse. El ledger sólo sirve si se le hace caso cuando estorba.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · `tocar_updated_at` tenía search_path mutable ───────────────────────
--
-- Una función `plpgsql` sin `search_path` fijo resuelve los nombres que usa
-- —aquí `now()`— contra el search_path de QUIEN la dispara. Quien pueda crear
-- un objeto en un esquema que vaya antes que `pg_catalog` puede sustituir esa
-- función, y el trigger ejecutaría código ajeno con los privilegios del dueño
-- de la tabla.
--
-- Hoy nadie puede crear nada en `public` (Postgres 15+ ya no lo concede a
-- PUBLIC, y 005 retiró todo a anon y authenticated), así que la vía está
-- cerrada por otro lado. Se arregla igual: una defensa que depende de que otra
-- siga en pie no es una defensa, es una coincidencia.
create or replace function tocar_updated_at() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function tocar_updated_at is
  'Unico trigger con logica del sistema, y no es logica de negocio: es metadato de fila. R7 se respeta. search_path fijo (006).';

-- ── 2 · `pg_trgm` vivía en el esquema public ───────────────────────────────
--
-- Mismo razonamiento, un nivel más arriba: las funciones de una extensión en
-- `public` se pueden ensombrecer. La convención de Supabase es un esquema
-- `extensions` aparte.
--
-- Se crea aquí en vez de darlo por hecho: en el Postgres pelón del compose ese
-- esquema no existe, y suponerlo rompería la prueba de portabilidad que
-- sostiene A-27.
--
-- El índice `productos_busqueda_nombre` NO se recrea: la clase de operadores
-- `gin_trgm_ops` quedó resuelta por OID cuando se creó, y mover la extensión
-- no la invalida.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- Para que `%` y `similarity()` sigan encontrándose sin calificar el esquema
-- en cada consulta. Se hace sobre la base actual, sin escribir su nombre, para
-- que la misma migración valga en Supabase y en la instalación de un cliente.
do $$
begin
  execute format(
    'alter database %I set search_path = "$user", public, extensions',
    current_database()
  );
end;
$$;

-- El `alter database` sólo surte efecto en conexiones NUEVAS. Esta sesión
-- necesita el ajuste para que las poscondiciones de abajo se puedan comprobar
-- aquí mismo.
set search_path = "$user", public, extensions;

-- ── Poscondiciones ─────────────────────────────────────────────────────────
-- Una migración que no comprueba lo que hizo es una intención, no un cambio.
do $$
declare
  esquema_trgm text;
  config_fn    text[];
begin
  select n.nspname into esquema_trgm
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  if esquema_trgm is distinct from 'extensions' then
    raise exception 'pg_trgm quedó en "%", se esperaba "extensions"', esquema_trgm;
  end if;

  select p.proconfig into config_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tocar_updated_at';

  if config_fn is null or not (config_fn && array['search_path=pg_catalog, public']) then
    raise exception 'tocar_updated_at sigue con search_path mutable: %', config_fn;
  end if;

  -- Lo que NO debía cambiar: el índice de búsqueda por nombre sigue en pie.
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'productos_busqueda_nombre') then
    raise exception 'productos_busqueda_nombre desapareció al mover la extensión';
  end if;
end;
$$;
