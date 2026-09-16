-- 087 · Quién estuvo, cuánto tiempo y cuánto le toca del bote (F-248).
--
-- ── DEPENDE DE LA 076 DE `restaurante` ────────────────────────────────────
-- `liquidacion_propina_beneficiarios` y `liquidaciones_propina.formula_snapshot`
-- nacen allí. El reparto por horas de una cafetería y el reparto por puntos de
-- un restaurante escriben en la MISMA tabla de beneficiarios a propósito: son
-- dos formas de contestar «a quién le toca esta propina», y separarlas daría dos
-- documentos distintos para el mismo pleito.
--
-- ── Y es la semilla de F-960/F-961 ────────────────────────────────────────
-- Reloj checador y horas trabajadas. Se declara así para que nadie construya
-- dos cosas: cuando lleguen, extienden esta tabla en vez de crear otra.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table presencias_turno (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sesion_caja_id  uuid        not null references sesiones_caja (id) on delete cascade,
  empleado_id     uuid        not null references empleos (id),
  entro_en        timestamptz not null,
  salio_en        timestamptz,
  -- Columna GENERADA: los minutos no se guardan aparte porque un número que se
  -- puede escribir es un número que alguien va a «arreglar», y el reparto del
  -- bote depende de él.
  minutos         int generated always as (
                    case
                      when salio_en is null then null
                      else (extract(epoch from (salio_en - entro_en)) / 60)::int
                    end
                  ) stored,
  -- `pin` = lo registró el sistema al acceder. `manual` = alguien lo corrigió.
  -- El documento de reparto lo dice: un reparto calculado sobre horas tecleadas
  -- no es lo mismo que uno calculado sobre horas registradas.
  origen          text        not null default 'pin',
  ajustada_por    uuid        references empleos (id),
  motivo_ajuste   text,
  created_at      timestamptz not null default now(),

  constraint presencia_origen_valido check (origen in ('pin', 'manual')),
  constraint presencia_sale_despues check (salio_en is null or salio_en >= entro_en),
  -- Un ajuste sin motivo es el camino corto para inflarse las horas: cada
  -- corrección apunta a quien la hizo y dice por qué.
  constraint presencia_ajuste_con_motivo check (
    origen <> 'manual' or (ajustada_por is not null and motivo_ajuste is not null)
  )
);

comment on table presencias_turno is
  'F-248 · Quién estuvo en el turno y cuánto. Es la base del reparto del bote por horas, y la semilla de F-960/F-961.';
comment on column presencias_turno.origen is
  'F-248 · `pin` lo registró el sistema; `manual` lo corrigió una persona. El documento de reparto lo enseña.';

-- Una persona no está dos veces en el mismo turno. Sin esto, cerrar sesión y
-- volver a entrar duplicaría sus horas y le duplicaría la parte del bote.
create unique index presencias_una_abierta_por_empleado
  on presencias_turno (sesion_caja_id, empleado_id)
  where salio_en is null;

create index presencias_por_sesion on presencias_turno (sesion_caja_id, entro_en);

-- ── El documento dice CÓMO se repartió ────────────────────────────────────
--
-- `reparto_base` es lo que distingue las tres formas que ya conviven: directa
-- al mesero (lo de hoy), por puntos de puesto (F-242) y por horas (F-248). Sin
-- este campo, dos liquidaciones con el mismo total y repartos distintos serían
-- indistinguibles seis meses después.
alter table liquidaciones_propina
  add column reparto_base   text,
  -- El TURNO que se repartió. En restaurante la liquidación cubre un rango de
  -- fechas; en una cafetería el bote es de un turno concreto, y sin este
  -- puntero no habría forma de impedir que el mismo bote se repartiera dos
  -- veces — que es exactamente el defecto que `propinas.liquidar` cierra para
  -- las ventas.
  add column sesion_caja_id uuid references sesiones_caja (id);

-- Un turno se reparte UNA vez. Es la misma protección que
-- `propina_liquidacion_id is null` da a las ventas, en la unidad que este giro
-- usa.
create unique index liquidaciones_un_reparto_por_turno
  on liquidaciones_propina (sesion_caja_id)
  where sesion_caja_id is not null;

alter table liquidaciones_propina
  add constraint liquidacion_reparto_valido check (
    reparto_base is null or reparto_base in ('directo', 'puntos', 'horas')
  );

comment on column liquidaciones_propina.reparto_base is
  'F-242/F-248 · `directo` al mesero, `puntos` por puesto, `horas` por presencia. Nulo = lo histórico, que era directo.';

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table presencias_turno enable row level security;
  alter table presencias_turno force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table presencias_turno from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table presencias_turno to morphiqpos_app;
  end if;
end;
$$;
