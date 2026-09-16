-- 076 · Quién recibe la propina, y en qué proporción (F-242 y F-325).
--
-- ── Dos huecos que son el mismo ───────────────────────────────────────────
-- F-325: a las 17:00 el mesero de mediodía se va con mesas vivas. Hoy o se
-- cierra la mesa antes de tiempo o la propina de la noche se le acredita a quien
-- ya se fue.
-- F-242: cocina y lavaloza no reciben nada del reparto actual. En cuanto el
-- restaurante pasa de quince empleados, la propina sólo para meseros genera
-- rotación de personal en cocina.
--
-- Los dos son «a quién le toca esta propina», y por eso van en la misma
-- migración: el reparto por puntos necesita saber quién estuvo en el piso, y eso
-- es justo lo que el ledger de relevos guarda.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- `EXCLUDE USING gist` con una igualdad de uuid necesita los operadores btree
-- dentro de un índice gist. Sin esta extensión, la restricción de vigencias no
-- se puede crear.
create extension if not exists btree_gist;

-- ── F-325 · El ledger de quién tuvo la cuenta, y cuándo ───────────────────
create table relevos_atencion (
  id                           uuid        primary key default gen_random_uuid(),
  organizacion_id              uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id                  uuid        not null references sucursales (id),
  orden_id                     uuid        not null references ordenes (id) on delete cascade,
  empleado_id                  uuid        not null references empleos (id),
  desde                        timestamptz not null,
  hasta                        timestamptz,
  -- El consumo de la cuenta al empezar y al terminar el tramo. Es lo que
  -- permite repartir la propina por lo que CADA UNO levantó, en vez de por
  -- minutos: una mesa que estuvo dos horas con el café no le debe propina a
  -- quien la relevó.
  consumo_inicio_centavos      bigint      not null default 0,
  consumo_fin_centavos         bigint,
  empleado_releva_id           uuid        references empleos (id),
  created_at                   timestamptz not null default now(),

  constraint relevo_cierra_despues check (hasta is null or hasta >= desde),
  constraint relevo_consumo_no_baja check (
    consumo_fin_centavos is null or consumo_fin_centavos >= consumo_inicio_centavos
  ),
  constraint relevo_cerrado_completo check ((hasta is null) = (consumo_fin_centavos is null))
);

comment on table relevos_atencion is
  'F-325 · Quién atendió cada cuenta y en qué tramo. Es lo que permite partir la propina de una mesa que cambió de mesero a media noche.';

-- Una cuenta tiene UN tramo abierto: dos significarían dos meseros
-- responsables a la vez, que es el estado que esta función viene a cerrar.
create unique index relevos_un_tramo_abierto_por_orden
  on relevos_atencion (orden_id) where hasta is null;

create index relevos_por_empleado
  on relevos_atencion (organizacion_id, empleado_id, desde desc);

-- ── F-242 · El esquema de reparto, versionado ─────────────────────────────
--
-- Versionado con vigencia y no editable a propósito: cambiar el reparto NO
-- puede reescribir liquidaciones pasadas. Si el dueño sube los puntos de cocina
-- en marzo, la liquidación de febrero tiene que seguir enseñando la fórmula de
-- febrero. Sin esto, el sistema resuelve un pleito y crea otro.
create table esquemas_propina (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        not null references sucursales (id),
  nombre          text        not null check (length(trim(nombre)) > 0),
  vigente_desde   date        not null,
  vigente_hasta   date,
  activo          boolean     not null default true,
  empleado_id     uuid        references empleos (id),
  created_at      timestamptz not null default now(),

  constraint esquema_vigencia_valida check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  -- DOS esquemas vigentes a la vez en la misma sucursal harían que la
  -- liquidación eligiera uno de los dos sin criterio, y el criterio es
  -- exactamente lo que estaba en disputa.
  constraint esquemas_propina_sin_traslape exclude using gist (
    sucursal_id with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  )
);

comment on table esquemas_propina is
  'F-242 · El reparto acordado por escrito, con vigencia. Cambiarlo no reescribe liquidaciones pasadas: se cierra el vigente y nace otro.';

create table esquema_propina_puntos (
  esquema_id uuid          not null references esquemas_propina (id) on delete cascade,
  puesto     text          not null,
  puntos     numeric(6, 2) not null check (puntos >= 0),

  primary key (esquema_id, puesto),
  constraint esquema_puesto_valido check (
    puesto in ('mesero', 'garrotero', 'barra', 'cocina', 'lavaloza', 'caja')
  )
);

comment on table esquema_propina_puntos is
  'F-242 · Puntos por PUESTO, no por persona: el acuerdo es con el puesto y sobrevive a que alguien se vaya.';

-- ── F-242 · A quién se le pagó, y cuánto ──────────────────────────────────
create table liquidacion_propina_beneficiarios (
  -- El `05-DATOS-Y-BACKEND` propone `(liquidacion_id, empleado_id)` como clave
  -- primaria. Se conserva como UNIQUE y se añade un `id` propio: el puente
  -- exige que toda entidad expuesta traiga `id` —su frontend lo usa como clave
  -- de lista— y una clave compuesta no lo da. Queda anotado como corrección.
  id             uuid          primary key default gen_random_uuid(),
  liquidacion_id uuid          not null references liquidaciones_propina (id) on delete cascade,
  empleado_id    uuid          not null references empleos (id),
  -- Instantáneas: el puesto y los puntos que tenía ESA noche. El de hoy puede
  -- ser otro y el documento tiene que seguir explicándose solo.
  puesto         text          not null,
  puntos         numeric(6, 2) not null check (puntos >= 0),
  monto_centavos bigint        not null check (monto_centavos >= 0),

  constraint beneficiario_una_vez_por_liquidacion unique (liquidacion_id, empleado_id)
);

comment on table liquidacion_propina_beneficiarios is
  'F-242 · El reparto REAL de una liquidación, con puesto y puntos congelados. Es el documento que cierra el pleito.';

alter table liquidaciones_propina
  add column esquema_id       uuid references esquemas_propina (id),
  -- La fórmula usada, congelada. El esquema se puede cerrar, renombrar o
  -- borrar; el papel que se le enseña al mesero no cambia.
  add column formula_snapshot jsonb;

comment on column liquidaciones_propina.esquema_id is
  'F-242 · Nulo = reparto directo al mesero, el de hoy. Con esquema, el reparto por puntos y sus beneficiarios.';

-- ── INVARIANTE · el reparto suma el total ─────────────────────────────────
--
-- Es la única regla que F-242 no puede permitirse perder: repartir $5,000 de
-- propina en cinco personas y que sumen $4,999 no es un error de redondeo, es
-- un pleito. DIFERIDO porque la cabecera y los beneficiarios se escriben en la
-- misma transacción y pasan por estados intermedios donde todavía no cuadra.
create or replace function reparto_suma_la_liquidacion() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  objetivo bigint;
  repartido bigint;
  cual uuid;
begin
  cual := coalesce(new.liquidacion_id, old.liquidacion_id);

  select l.total_centavos into objetivo
    from liquidaciones_propina l where l.id = cual;
  -- Una liquidación sin esquema no reparte por puntos: no hay nada que cuadrar.
  if objetivo is null then return null; end if;

  select coalesce(sum(b.monto_centavos), 0) into repartido
    from liquidacion_propina_beneficiarios b where b.liquidacion_id = cual;

  if repartido <> 0 and repartido <> objetivo then
    raise exception
      'El reparto no cuadra: la liquidación suma % y los beneficiarios %', objetivo, repartido
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger reparto_cuadra
  after insert or update or delete on liquidacion_propina_beneficiarios
  deferrable initially deferred
  for each row execute function reparto_suma_la_liquidacion();

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
  tabla          text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach tabla in array array[
    'relevos_atencion', 'esquemas_propina', 'esquema_propina_puntos',
    'liquidacion_propina_beneficiarios'
  ] loop
    execute format('alter table %I enable row level security', tabla);
    execute format('alter table %I force row level security', tabla);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', tabla, roles_publicos);
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update, delete on table %I to morphiqpos_app', tabla);
    end if;
  end loop;
end;
$$;
