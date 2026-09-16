-- 140 · El no-show con antecedente, y la lista de espera (F-434, F-409).
--
-- ── Por qué el no-show necesita tabla propia si `citas` ya lo marca ──────
-- La 132 guarda que ESTA cita no llegó. Lo que no guarda es el ANTECEDENTE: si
-- ésta es la primera vez de la clienta o la cuarta. Y de eso cuelgan las dos
-- únicas decisiones que el salón puede tomar al respecto: a quién se le pide
-- anticipo (F-414) y a quién se le deja de agendar a la hora pico. Leerlo
-- recorriendo `citas` cada vez que alguien agenda es la consulta que se hace
-- con la clienta al teléfono.
--
-- ── Y por qué se guarda si se le RETUVO el dinero ────────────────────────
-- Porque el antecedente sin esa columna es una acusación sin consecuencia
-- registrada. La discusión de mostrador es «yo no falté» o «a mí no me
-- cobraron», y las dos se contestan con la misma fila.
--
-- ── La lista de espera es el otro lado de la misma moneda ────────────────
-- Un hueco que se abre a las diez de la mañana del sábado se llena en quince
-- minutos SI alguien sabe a quién llamar. Sin lista, ese hueco se queda vacío y
-- la capacidad perdida del no-show se duplica: se pierde la cita y se pierde la
-- que habría entrado en su lugar.
--
-- ── Por qué la espera guarda una VENTANA y no una hora ───────────────────
-- Nadie dice «quiero el sábado a las 11:00»: dice «el sábado por la mañana» o
-- «cualquier día de esta semana después de las cinco». Guardar una hora exacta
-- obligaría a inventar una, y a no encontrar a nadie cuando el hueco cae a las
-- 11:30.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table no_shows (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cliente_id          uuid        not null references clientes (id) on delete cascade,
  cita_id             uuid        not null references citas (id) on delete cascade,
  profesional_id      uuid        references profesionales (id) on delete set null,

  ocurrio_en          timestamptz not null,
  -- El valor de la capacidad que se perdió, congelado: el precio del servicio
  -- puede cambiar mañana y el hueco del martes ya se perdió a este precio.
  valor_perdido_centavos bigint   not null default 0 check (valor_perdido_centavos >= 0),

  anticipo_id         uuid        references anticipos_cita (id) on delete set null,
  anticipo_retenido   boolean     not null default false,

  marcado_por         uuid        references empleos (id) on delete set null,
  nota                text,
  created_at          timestamptz not null default now(),

  -- Una cita, un no-show. Marcarla dos veces duplicaría el antecedente de la
  -- clienta sin que ella hubiera faltado dos veces.
  unique (cita_id),
  -- Retener sin anticipo es imposible: no había nada que retener.
  constraint no_show_retencion_con_anticipo check (
    not anticipo_retenido or anticipo_id is not null
  )
);

comment on table no_shows is
  'F-434 · El ANTECEDENTE, que `citas` no guarda. De aquí cuelgan las dos únicas decisiones posibles: a quién se le pide anticipo y a quién se le deja de agendar en hora pico.';
comment on column no_shows.anticipo_retenido is
  'La discusión de mostrador es «yo no falté» o «a mí no me cobraron», y las dos se contestan con esta fila.';

-- Cuántas veces ha faltado ESTA clienta: se consulta con ella al teléfono.
create index no_shows_por_cliente
  on no_shows (organizacion_id, cliente_id, ocurrio_en desc);

create table lista_espera (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  cliente_id          uuid        not null references clientes (id) on delete cascade,
  servicio_id         uuid        references servicios (producto_id) on delete set null,
  -- `null` es «con quien sea», y es una respuesta perfectamente válida: para un
  -- corte de caballero la mitad de la lista dice eso.
  profesional_id      uuid        references profesionales (id) on delete set null,

  -- La VENTANA, no una hora. Nadie dice «el sábado a las 11:00».
  ventana             tstzrange   not null,
  flexible_de_dia     boolean     not null default false,
  prioridad           smallint    not null default 0,

  estado              text        not null default 'esperando',
  avisada_en          timestamptz,
  cita_id             uuid        references citas (id) on delete set null,
  nota                text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint espera_estado_valido check (
    estado in ('esperando', 'avisada', 'agendada', 'vencida', 'cancelada')
  ),
  constraint espera_ventana_con_duracion check (not isempty(ventana)),
  constraint espera_agendada_con_cita check (estado <> 'agendada' or cita_id is not null),
  constraint espera_avisada_con_fecha check (estado <> 'avisada' or avisada_en is not null)
);

comment on table lista_espera is
  'F-409 · A quién llamar cuando se abre un hueco. Sin ella, el no-show pierde dos citas: la que faltó y la que habría entrado en su lugar.';
comment on column lista_espera.ventana is
  'Un rango y no una hora: nadie dice «el sábado a las 11:00», dice «el sábado por la mañana». Una hora exacta no encuentra a nadie cuando el hueco cae a las 11:30.';

-- A quién ofrecerle ESTE hueco: se filtra por solape de ventana, y por eso el
-- índice es GiST y no b-tree.
create index espera_por_ventana
  on lista_espera using gist (ventana)
  where estado = 'esperando';
create index espera_viva
  on lista_espera (organizacion_id, sucursal_id, prioridad desc, created_at)
  where estado in ('esperando', 'avisada');

create trigger lista_espera_tocar_updated_at
  before update on lista_espera for each row execute function tocar_updated_at();

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

  foreach t in array array['no_shows', 'lista_espera']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update on table %I to morphiqpos_app', t);
    end if;
  end loop;
end;
$$;
