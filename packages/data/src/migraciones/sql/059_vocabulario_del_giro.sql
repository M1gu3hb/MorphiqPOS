-- 059 · F-017 · El vocabulario que el negocio cambió a mano.
--
-- ── Qué guarda, y qué NO ───────────────────────────────────────────────────
-- Sólo las EXCEPCIONES. El diccionario del giro vive en el código
-- (`packages/domain/src/vocabulario/diccionarios.ts`) porque es la misma
-- decisión de producto para los 78 modelos y tiene que poder corregirse en un
-- despliegue, no negocio por negocio.
--
-- Lo que sí es de cada negocio: que Doña Meche llame «tablón» a lo que el
-- sistema llama «mesa». Eso vive aquí, y es una fila.
--
-- ── Por qué el género es una columna y no se deduce ────────────────────────
-- Porque no se puede deducir. «Mesa» y «cabina» acaban en -a y son femeninos;
-- «día» y «sofá» también y son masculinos. Un sistema que adivine el género por
-- la terminación va a escribir «la día» tarde o temprano, y ese error es
-- exactamente lo que F-017 existe para impedir.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table vocabulario_negocio (
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  entidad         text        not null,
  singular        text        not null,
  plural          text        not null,
  genero          text        not null,
  empleado_id     uuid        references empleos (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (organizacion_id, entidad),

  -- La lista cerrada es el contrato con el dominio. Una entidad que no existe
  -- en el código se guardaría aquí y no la leería nadie: una personalización
  -- que el cliente cree que hizo y que no se ve en ningún lado.
  constraint vocabulario_negocio_entidad_conocida check (
    entidad in (
      'unidad_servicio',
      'orden',
      'linea_orden',
      'responsable',
      'cliente',
      'preparacion',
      'producto'
    )
  ),

  constraint vocabulario_negocio_genero_valido check (genero in ('femenino', 'masculino')),

  -- Un singular o un plural vacíos dejarían la pantalla con un hueco donde
  -- debería ir un sustantivo, que se lee peor que el nombre por omisión.
  constraint vocabulario_negocio_singular_no_vacio check (length(btrim(singular)) > 0),
  constraint vocabulario_negocio_plural_no_vacio check (length(btrim(plural)) > 0)
);

comment on table vocabulario_negocio is
  'F-017 · Vocabulario propio de un negocio. Guarda SÓLO lo que cambió a mano; el diccionario de su giro vive en el código.';
comment on column vocabulario_negocio.genero is
  'femenino o masculino. Es columna y no se deduce de la terminación: «día» y «sofá» acaban en -a y son masculinos.';

alter table vocabulario_negocio enable row level security;
alter table vocabulario_negocio force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table vocabulario_negocio from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update, delete on table vocabulario_negocio to morphiqpos_app;
  end if;
end;
$$;
