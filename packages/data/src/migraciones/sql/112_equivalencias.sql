-- 112 · «No tengo la de 1/2, pero la de 13 mm le sirve» (F-060).
--
-- ── Lo que se pierde sin esto ────────────────────────────────────────────
-- Es la venta que se cae sin que nadie la registre. El cliente pide una medida
-- que no hay, el mostradorista nuevo dice «no tenemos» y el cliente se va a la
-- de enfrente —donde sí se la dan, porque allá atiende alguien con veinte años
-- de oficio—. El que sabe la equivalencia nunca pierde esa venta; el que no,
-- la pierde todos los días y no aparece en ningún reporte.
--
-- ── Sustituto y complemento NO son lo mismo ──────────────────────────────
-- `sustituto` es «le sirve en lugar de»; `complemento` es «va con». Meterlos en
-- la misma bolsa haría que la pantalla ofreciera teflón a quien pide una llave,
-- y a la tercera vez el mostradorista deja de mirar la sugerencia.
--
-- ── Y por qué se guarda QUIÉN la declaró ─────────────────────────────────
-- No es auditoría: es producto. El día que el mostradorista experto se jubile,
-- las 340 equivalencias que declaró se quedan, y se sabe que fueron suyas. Ése
-- es exactamente el conocimiento que el negocio quería retener y que hoy se va
-- caminando por la puerta.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table equivalencias (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  producto_id      uuid        not null references productos (id) on delete cascade,
  equivalente_id   uuid        not null references productos (id) on delete cascade,
  -- `sustituto` es «le sirve»; `complemento` es «va con». Son cosas distintas y
  -- confundirlas ofrecería un teflón a quien pide una llave.
  tipo             text        not null check (tipo in ('sustituto', 'complemento')),
  nota             text,
  bidireccional    boolean     not null default true,
  declarado_por    uuid        references empleos (id) on delete set null,
  declarado_en     timestamptz not null default now(),
  created_at       timestamptz not null default now(),

  constraint equivalencia_no_es_de_si_mismo check (producto_id <> equivalente_id),
  unique (producto_id, equivalente_id, tipo)
);

comment on table equivalencias is
  'F-060 · Lo que le sirve en lugar de lo que no hay. Sin esto, la venta se cae sin quedar registrada en ningún sitio.';
comment on column equivalencias.declarado_por is
  'No es auditoría: es producto. Cuando el mostradorista experto se vaya, lo que declaró se queda, y se sabe que fue él.';
comment on column equivalencias.bidireccional is
  'Casi siempre cierto en el sustituto —si la de 13 mm sirve por la de 1/2, la de 1/2 sirve por la de 13— y casi siempre falso en el complemento: el teflón va con la llave, la llave no va con el teflón.';

create index equivalencias_por_producto on equivalencias (organizacion_id, producto_id);
-- La vuelta: «¿de qué es equivalente esta pieza?». Sin este índice, la búsqueda
-- bidireccional recorre la tabla entera en cada tecleo del mostrador.
create index equivalencias_por_equivalente
  on equivalencias (organizacion_id, equivalente_id) where bidireccional;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table equivalencias enable row level security;
alter table equivalencias force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table equivalencias from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update, delete on table equivalencias to morphiqpos_app;
  end if;
end;
$$;
