-- ═══════════════════════════════════════════════════════════════════════════
-- 004 · Row Level Security — defensa en profundidad
--
-- R7 es clara: **cero lógica de negocio en RLS.** Toda la autorización real
-- vive en el envoltorio `comando()` de la API TypeScript, que es lo que permite
-- que el backend completo corra en el Postgres pelón de un cliente sin internet
-- (A-27). Una policy con reglas de negocio dentro haría que el sistema se
-- comportara distinto fuera de Supabase, y eso mataría la promesa.
--
-- Entonces, ¿para qué RLS?
--
-- Porque Supabase publica automáticamente TODA tabla del schema `public` por
-- PostgREST, y la `anon key` es pública por definición: va en el bundle del
-- navegador. Sin RLS, cualquiera con esa clave —que se lee del código fuente en
-- diez segundos— leería el catálogo, las ventas y los clientes de todas las
-- organizaciones.
--
-- La postura de este esquema es la más simple que es correcta:
--
--   **`anon` y `authenticated` no pueden hacer NADA. Ni leer.**
--
-- La aplicación no usa PostgREST: habla con Postgres por Kysely, con las
-- credenciales del servidor, y esas ya no pasan por RLS. Así que negar todo por
-- ese canal no le quita nada al producto y cierra la superficie entera.
--
-- Cuando F1.4 abra el portal QR público, expondrá una API propia y estrecha
-- (R33), no PostgREST. Esta postura no estorba a eso.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Portabilidad: los roles de Supabase no existen en un Postgres pelón ─────
--
-- `revoke ... from anon` lanza «role "anon" does not exist» y aborta la
-- migración entera. En Supabase los roles existen; en el `postgres:17-alpine`
-- del compose, no.
--
-- Si esta migración fuera incondicional, la prueba de portabilidad en CI
-- fallaría siempre — y esa prueba es la ÚNICA defensa de la promesa A-27 de
-- poder instalarle su propio servidor a un cliente sin internet. Se habría
-- desactivado la prueba en vez de arreglar el SQL, que es como se pierden las
-- promesas.
--
-- Se resuelve preguntando por los roles en vez de suponerlos.
do $$
declare
  t          text;
  roles      text;
  publicos   text[];
begin
  -- Sólo los roles que EXISTEN en esta base.
  select coalesce(array_agg(quote_ident(rolname)), array[]::text[])
    into publicos
    from pg_roles
   where rolname in ('anon', 'authenticated');

  roles := array_to_string(publicos, ', ');

  foreach t in array array[
    'organizaciones', 'sucursales', 'terminales', 'personas', 'identidades',
    'credenciales_pin', 'empleos', 'configuracion', 'folios', 'auditoria',
    'categorias', 'productos', 'modificadores', 'modificador_opciones',
    'producto_modificadores', 'clientes',
    'almacenes', 'insumos', 'sesiones_caja', 'ordenes', 'orden_lineas',
    'orden_linea_modificadores', 'pagos', 'movimientos_caja',
    'movimientos_stock', 'existencias', '_migraciones'
  ]
  loop
    -- 1 · RLS activo. Sin una sola policy, el efecto es negar todo a cualquier
    --     rol que NO tenga BYPASSRLS. El rol de la aplicación sí lo tiene.
    execute format('alter table public.%I enable row level security', t);

    -- 2 · Y además FORCE, para que ni el dueño de la tabla se salte las policies
    --     por accidente al conectarse con otra herramienta.
    execute format('alter table public.%I force row level security', t);

    -- 3 · Retirar los permisos que Supabase concede por omisión a los roles
    --     públicos. RLS sin esto sigue permitiendo que PostgREST descubra la
    --     tabla y devuelva 200 con lista vacía, que es peor: parece que la
    --     tabla está vacía en vez de decir que no hay acceso.
    if roles <> '' then
      execute format('revoke all on public.%I from %s', t, roles);
    end if;
  end loop;

  if roles <> '' then
    -- Las secuencias también se exponen por PostgREST.
    execute format('revoke all on all sequences in schema public from %s', roles);

    -- Y toda tabla FUTURA nace sin permisos: si alguien agrega una en una
    -- migración y olvida el revoke, nace cerrada en vez de abierta.
    --
    -- (`supabase-vercel-produccion §4` advierte de la trampa contraria: con los
    -- default privileges revocados, una tabla nueva no funciona y un shim
    -- devuelve `[]` en silencio. Aquí no aplica: la aplicación NO lee por
    -- PostgREST, así que un permiso faltante no puede pasar desapercibido en
    -- ningún camino de lectura real.)
    execute format(
      'alter default privileges in schema public revoke all on tables from %s', roles
    );
    execute format(
      'alter default privileges in schema public revoke all on sequences from %s', roles
    );
  else
    raise notice
      'Roles anon/authenticated ausentes: no es Supabase. RLS queda activo igual.';
  end if;
end;
$$;

comment on schema public is
  'MorphiqPOS. Toda la autorizacion vive en la API TypeScript (R7). RLS niega todo a anon y authenticated: la aplicacion no usa PostgREST.';
