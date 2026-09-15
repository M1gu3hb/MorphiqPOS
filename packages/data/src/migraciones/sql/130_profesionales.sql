-- 130 · Profesionales, horario y bloqueos de agenda (F-420, F-422, F-416, F-441).
--
-- ── El arquetipo A3 no existe hoy ────────────────────────────────────────
-- No hay plantilla, no hay agenda, no hay nada del bloque F-4xx. MorphiqPOS no
-- tiene ni un calendario. Esta migración es el primer ladrillo: sin saber quién
-- atiende y cuándo, no hay cita que agendar.
--
-- ── `profesionales` EXTIENDE a `empleos`, no lo sustituye ────────────────
-- Y `empleo_id` es NULLABLE a propósito: Sol renta la estación y **no es
-- empleada**. Si se la fuerza a serlo, entra en la nómina, en los permisos de
-- empleado y en los reportes de venta del salón, y los cuatro errores de
-- `02-DINERO-Y-CAJA.md` §7.4 ocurren a la vez: el ticket promedio, la ocupación
-- y el margen del salón salen todos mal.
--
-- ── `btree_gist`, y por qué esto es el riesgo técnico de la carpeta ──────
-- La restricción que impide agendar dos clientas con la misma persona a la misma
-- hora combina `uuid with =` y `tstzrange with &&`. Postgres sólo puede hacerlo
-- con la extensión `btree_gist`. **Hay que verificar que el proyecto de Supabase
-- la permita ANTES de dar por buena esta arquitectura**; si no, el plan B es un
-- índice único sobre slots discretos de cinco minutos —mucho peor, y con huecos
-- que no se pueden usar— pero funciona.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create extension if not exists btree_gist;

create table profesionales (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  -- NULL cuando renta la estación (F-441). Ver arriba.
  empleo_id           uuid        references empleos (id) on delete set null,

  nombre_completo     text        not null check (length(trim(nombre_completo)) > 0),
  -- Cabe en la columna de la agenda. Diez caracteres es lo que se lee de un
  -- vistazo en una rejilla de cinco columnas en una tableta.
  nombre_corto        text        not null check (char_length(nombre_corto) between 1 and 10),
  foto_url            text,

  tipo_relacion       text        not null,
  nivel               text        not null default 'estilista',
  -- La agenda se lee por color antes que por texto: es lo primero que mira la
  -- recepcionista cuando entra alguien preguntando por Karla.
  color_agenda        text        not null check (color_agenda ~ '^#[0-9a-f]{6}$'),
  regla_comision_id   uuid,
  activo              boolean     not null default true,
  orden_agenda        int         not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profesional_tipo_valido check (
    tipo_relacion in ('empleado', 'empleado_comision', 'independiente_renta')
  ),
  constraint profesional_nivel_valido check (
    nivel in ('junior', 'estilista', 'senior', 'director')
  ),
  -- Quien NO renta tiene que ser alguien de la casa: un profesional sin empleo
  -- y sin renta es una persona que cobra y que no está en ningún lado.
  constraint profesional_empleo_salvo_renta check (
    tipo_relacion = 'independiente_renta' or empleo_id is not null
  ),
  -- Y quien renta NO lleva comisión: si lleva las dos cosas, el salón le paga
  -- por trabajar Y le cobra por el mueble, que no es el trato.
  constraint profesional_renta_sin_comision check (
    tipo_relacion <> 'independiente_renta' or regla_comision_id is null
  )
);

comment on column profesionales.empleo_id is
  'NULL cuando renta la estación. Forzarla a ser empleada la mete en la nómina, en los permisos y en los reportes de venta del salón, y los cuatro errores de 02 §7.4 ocurren a la vez.';
comment on column profesionales.nombre_corto is
  'Cabe en la columna de la agenda: diez caracteres es lo que se lee de un vistazo en una rejilla de cinco columnas.';

create index profesionales_en_agenda
  on profesionales (organizacion_id, sucursal_id, orden_agenda) where activo;

create trigger profesionales_tocar_updated_at
  before update on profesionales for each row execute function tocar_updated_at();

create table horarios_profesional (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  profesional_id   uuid        not null references profesionales (id) on delete cascade,
  -- 0 = domingo … 6 = sábado, como `extract(dow)`. Se elige el criterio de
  -- Postgres y no el ISO porque quien va a consultar esto es una consulta.
  dia_semana       smallint    not null check (dia_semana between 0 and 6),
  hora_inicio      time        not null,
  hora_fin         time        not null,
  -- El horario CAMBIA y lo viejo no se borra: la agenda de marzo tiene que
  -- poder explicarse con el horario de marzo.
  vigente_desde    date        not null,
  vigente_hasta    date,

  created_at       timestamptz not null default now(),

  constraint horario_termina_despues check (hora_fin > hora_inicio),
  constraint horario_vigencia_coherente check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index horarios_vigentes
  on horarios_profesional (organizacion_id, profesional_id, dia_semana, vigente_desde);

-- ── F-416 · El tiempo que NO es productivo, y que hay que declarar ───────
--
-- Va ANTES que cualquier métrica de ocupación: sin distinguir la comida, el
-- curso y las vacaciones de los huecos vacíos, el reporte de ocupación dice que
-- el salón trabaja al 60 % cuando en realidad trabaja al 85 % con dos horas de
-- comida. Y con ese número se toman decisiones de contratación.
create table bloqueos_agenda (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id      uuid        references sucursales (id) on delete cascade,
  -- NULL = TODO el salón. El lunes, un puente, una capacitación.
  profesional_id   uuid        references profesionales (id) on delete cascade,
  rango            tstzrange   not null,
  motivo           text        not null,
  nota             text,

  created_at       timestamptz not null default now(),
  creado_por       uuid        references empleos (id) on delete set null,

  constraint bloqueo_motivo_valido check (
    motivo in ('comida', 'curso', 'personal', 'vacaciones', 'junta', 'cerrado')
  ),
  constraint bloqueo_rango_con_duracion check (not isempty(rango)),

  -- Dos bloqueos encimados del mismo profesional son dos comidas a la misma
  -- hora: el segundo tapa al primero y el reporte de tiempo no productivo
  -- cuenta doble.
  exclude using gist (profesional_id with =, rango with &&)
);

comment on column bloqueos_agenda.profesional_id is
  'NULL = todo el salón. El lunes, un puente, una capacitación.';

create index bloqueos_por_rango on bloqueos_agenda using gist (rango);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach t in array array['profesionales', 'horarios_profesional', 'bloqueos_agenda']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update, delete on table %I to morphiqpos_app', t);
    end if;
  end loop;
end;
$$;
