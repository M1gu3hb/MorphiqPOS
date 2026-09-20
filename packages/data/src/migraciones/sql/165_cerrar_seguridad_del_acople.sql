-- 165 · Cerrar la seguridad de todo lo que el acople creó.
--
-- ── Por qué hace falta ─────────────────────────────────────────────────────
-- La tanda del acople aplicó 71 migraciones de golpe y con ellas entraron unas
-- sesenta tablas, más de cien funciones y una extensión. Las dos migraciones
-- que cierran la superficie pública —la 050 (RLS en toda relación) y la 055
-- (EXECUTE retirado de las rutinas de `public`)— corrieron en las versiones 50
-- y 55, es decir ANTES de que nada de eso existiera. PostgreSQL concede EXECUTE
-- a PUBLIC al crear una función y no activa RLS al crear una tabla, así que lo
-- nuevo nació abierto.
--
-- `pnpm verify:rls` lo cazó en cuanto la tanda estuvo aplicada: **404 problemas**.
--
--   · 2 tablas de catálogo sin RLS —`motivos_merma` (062) y `regimenes_ieps`
--     (098)—. A las dos se les revocaron los privilegios de `anon` y
--     `authenticated` y a ninguna se le activó RLS: media defensa.
--   · 12 funciones de disparador nuestras con EXECUTE para `anon` y
--     `authenticated`, heredado de PUBLIC.
--   · el resto, casi cuatrocientas, de `btree_gist`, que la 130 creó **en
--     `public`** y no en `extensions`.
--
-- ── Por qué se consulta el catálogo y no se enumera ────────────────────────
-- Porque enumerar es lo que falló. Lo dice la 050 con estas palabras: «La
-- migración 045 enumeró las tablas que creaba. En producción se aplicó sólo una
-- parte del archivo y ocho quedaron expuestas. Enumerar otra vez repetiría el
-- mismo defecto: la tabla 46 volvería a depender de que alguien recordara
-- agregar su nombre». Esta migración es la 050 y la 055 otra vez, sobre lo que
-- hay HOY, y con la poscondición que ninguna de las dos traía.
--
-- ── Lo que esto NO le quita a la aplicación ────────────────────────────────
-- `morphiqpos_app` tiene `BYPASSRLS`, así que activar y FORZAR RLS no le esconde
-- una sola fila: la pared es para `anon` y `authenticated`, que son los roles
-- por los que PostgREST publica automáticamente todo `public` con una clave que
-- viaja en el navegador. Y las doce funciones son TODAS de disparador:
-- PostgreSQL no comprueba EXECUTE al dispararlas, que es la misma razón por la
-- que la 055 pudo revocar sin romper nada.
--
-- ── Por qué `btree_gist` se MUEVE en vez de revocarse ──────────────────────
-- Porque el problema no es el permiso, es el sitio. Las otras seis extensiones
-- de este proyecto —`pg_trgm`, `unaccent`, `pgcrypto`, `uuid-ossp`,
-- `pg_stat_statements`— viven en `extensions`; `btree_gist` es la única que
-- cayó en `public`, y cayó ahí porque la 130 escribió `create extension
-- btree_gist` sin `with schema`. Revocarle el EXECUTE a cuatrocientas rutinas
-- ajenas dejaría el síntoma tapado y la anomalía dentro. Moverla la saca de
-- `public`, que es donde vive lo NUESTRO, y la deja donde el proyecto ya guarda
-- lo de fuera.
--
-- Mover una extensión relocalizable no toca los índices: las restricciones de
-- exclusión GiST de la 132 y la 136 referencian sus clases de operadores por
-- OID, y el OID no cambia al cambiar de esquema. Lo que sí cambia es cómo se
-- IMPRIME la definición del índice —`gist_uuid_ops` pasa a `extensions.
-- gist_uuid_ops`—, y eso ya está contemplado: `verificar-esquema-aplicado.mjs`
-- normaliza el prefijo de esquema de las clases de operadores desde que
-- `gin_trgm_ops` hizo exactamente esto mismo.

-- ── 1 · `btree_gist` a `extensions`, donde están las otras seis ────────────
do $$
begin
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'extensions') then
    -- Un Postgres pelón (A-27) no trae el esquema `extensions` de Supabase. Ahí
    -- la extensión se queda donde está y el punto 3 le retira el EXECUTE como a
    -- cualquier otra rutina de `public`: el resultado de seguridad es el mismo.
    raise notice 'No hay esquema `extensions`: btree_gist se queda en public.';
    return;
  end if;

  if exists (
    select 1
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'btree_gist'
       and n.nspname = 'public'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end;
$$;

-- ── 2 · RLS activa y FORZADA en toda tabla de `public` ─────────────────────
--
-- Se recorre el catálogo, no una lista. Y se aplica también a las que ya la
-- tienen: `enable row level security` sobre una tabla que ya la tiene no hace
-- nada, y el precio de esa idempotencia es no tener que decidir cuáles faltan.
do $$
declare
  relacion record;
begin
  for relacion in
    select c.relname as nombre
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', relacion.nombre);
    execute format('alter table public.%I force row level security', relacion.nombre);
  end loop;
end;
$$;

-- ── 3 · `anon` y `authenticated` sin un solo privilegio ────────────────────
--
-- Activar RLS y dejar el privilegio puesto hace que PostgREST conteste 200 con
-- una lista vacía en vez de negarse; se quitan los dos. Las vistas entran
-- porque se ejecutan con los permisos de su dueño y pueden reabrir una tabla
-- cerrada, y las secuencias porque `usage` sobre una secuencia filtra cuántas
-- filas lleva la tabla.
do $$
declare
  roles_publicos text;
  relacion record;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is null then
    raise notice 'Roles anon/authenticated ausentes: no es Supabase.';
    return;
  end if;

  for relacion in
    select c.relname as nombre, c.relkind
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'S')
  loop
    if relacion.relkind = 'S' then
      execute format(
        'revoke all privileges on sequence public.%I from %s',
        relacion.nombre,
        roles_publicos
      );
    else
      execute format(
        'revoke all privileges on table public.%I from %s',
        relacion.nombre,
        roles_publicos
      );
    end if;
  end loop;
end;
$$;

-- ── 4 · EXECUTE retirado de las rutinas de `public` ────────────────────────
--
-- Primero a PUBLIC, porque `anon` y `authenticated` heredan de ahí y revocarles
-- a ellos sin quitar la herencia no cambia nada. Y las concesiones por omisión,
-- para que la próxima función que alguien cree no nazca abierta — aunque eso
-- sólo alcanza a las que cree ESTE rol, que es justo por lo que esta migración
-- existe y por lo que `verify:rls` está en la cadena.
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is null then
    raise notice 'Roles anon/authenticated ausentes: no es Supabase.';
    return;
  end if;

  execute format('revoke execute on all functions in schema public from %s', roles_publicos);
  execute format(
    'alter default privileges in schema public revoke execute on functions from %s',
    roles_publicos
  );
end;
$$;

-- ── 5 · Poscondición · las MISMAS tres reglas que la puerta ────────────────
--
-- `packages/data/src/verificacion/rls.ts` declara tres invariantes y esta
-- migración las comprueba aquí, dentro de la transacción: si algo quedó abierto,
-- la tanda entera se deshace y la base se queda como estaba. Una migración de
-- seguridad que no comprueba el estado que dejó es una que nadie sabe si cerró
-- algo — y las dos que la precedieron, la 050 y la 055, no lo comprobaban: por
-- eso hizo falta ésta.
do $$
declare
  abiertas   int;
  legibles   int;
  ejecutables int;
  hay_roles  boolean;
begin
  select exists (select 1 from pg_catalog.pg_roles where rolname in ('anon', 'authenticated'))
    into hay_roles;

  select count(*) into abiertas
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and (not c.relrowsecurity or not c.relforcerowsecurity);

  if abiertas > 0 then
    raise exception 'Quedan % tabla(s) de public sin RLS activa y forzada', abiertas
      using errcode = 'insufficient_privilege';
  end if;

  if not hay_roles then
    raise notice 'Sin anon/authenticated no hay nada más que comprobar.';
    return;
  end if;

  select count(*) into legibles
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and (
       has_table_privilege('anon', c.oid, 'SELECT')
       or has_table_privilege('authenticated', c.oid, 'SELECT')
     );

  if legibles > 0 then
    raise exception 'anon o authenticated todavía pueden leer % relación(es) de public', legibles
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into ejecutables
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (
       has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE')
     );

  if ejecutables > 0 then
    raise exception
      'anon o authenticated todavía pueden ejecutar % rutina(s) de public', ejecutables
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;
