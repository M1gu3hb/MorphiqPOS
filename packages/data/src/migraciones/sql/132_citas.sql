-- 132 · La cita. El núcleo del arquetipo A3 (F-400, F-402, F-415).
--
-- ── La agenda es tres cosas a la vez ─────────────────────────────────────
-- Es la pantalla de inicio, la unidad de trabajo y el inventario del negocio.
-- Un salón no vende productos: vende TIEMPO DE PERSONA, y ese inventario se
-- agota todos los días a las siete de la tarde sin posibilidad de recuperarlo.
-- Por eso la restricción de exclusión de abajo es la regla más importante de
-- toda la carpeta: agendar dos clientas con la misma persona a la misma hora no
-- es un error de captura, es una clienta que se va.
--
-- ── `orden_id` nullable y llenado AL COBRAR ──────────────────────────────
-- Una cita que no se cobró —no llegó, se canceló, fue cortesía— NO genera
-- orden, y por lo tanto no aparece en ninguna suma de ventas por accidente.
-- Crear la orden al agendar metería el importe de todo lo que se agendó en el
-- reporte del día, y el salón cerraría el mes creyendo que vendió un 18 % más.
--
-- ── `rango_activo` y `rango_ocupacion` separados ES F-415 hecho esquema ──
-- El profesional se bloquea por el ACTIVO; la estación, por el de OCUPACIÓN.
-- Son dos recursos con disponibilidad distinta al mismo tiempo, y de esa
-- distinción sale el 25 %–40 % de capacidad que ningún competidor aprovecha.
-- La exclusión se declara sobre `rango_activo` y NO sobre la ocupación: si se
-- declarara sobre la ocupación, el procesado volvería a bloquear al profesional
-- y la función entera se caería sin que nadie lo notara.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table citas (
  id                    uuid        primary key default gen_random_uuid(),
  organizacion_id       uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id           uuid        references sucursales (id) on delete cascade,
  folio                 text        not null,
  -- NULL SÓLO en walk-in sin datos. Todo lo demás cuelga de la clienta: el
  -- expediente, el recordatorio, la cartera y la recuperación.
  cliente_id            uuid        references clientes (id) on delete restrict,

  origen                text        not null,
  estado                text        not null default 'agendada',
  agendada_para         timestamptz not null,
  llego_en              timestamptz,
  inicio_real           timestamptz,
  fin_real              timestamptz,

  -- Se llena AL COBRAR, no antes. Ver arriba.
  orden_id              uuid        references ordenes (id),
  -- Reprogramada de / rehacer de.
  cita_origen_id        uuid        references citas (id),
  es_rehacer            boolean     not null default false,
  es_cortesia           boolean     not null default false,

  motivo_cancelacion    text,
  no_llego_marcado_en   timestamptz,
  no_llego_marcado_por  uuid        references empleos (id) on delete set null,
  notas                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint cita_origen_valido check (
    origen in ('mostrador', 'telefono', 'whatsapp', 'en_linea', 'walk_in', 'recurrente')
  ),
  constraint cita_estado_valido check (
    estado in ('agendada', 'confirmada', 'en_curso', 'terminada', 'cobrada',
               'no_llego', 'cancelada', 'reprogramada')
  ),
  -- Cobrada sin orden es una venta sin ticket.
  constraint cita_cobrada_con_orden check (estado <> 'cobrada' or orden_id is not null),
  -- Un no-show sin hora ni autor es una acusación sin firma, y de eso depende
  -- si se retiene el anticipo y si la clienta entra al historial.
  constraint cita_no_llego_con_sello check (
    estado <> 'no_llego' or (no_llego_marcado_en is not null and no_llego_marcado_por is not null)
  ),
  constraint cita_rehacer_con_origen check (not es_rehacer or cita_origen_id is not null),
  constraint cita_cancelada_con_motivo check (estado <> 'cancelada' or motivo_cancelacion is not null),

  unique (organizacion_id, folio)
);

comment on column citas.orden_id is
  'Se llena AL COBRAR. Una cita que no se cobró no genera orden y por lo tanto no entra en ninguna suma de ventas por accidente.';
comment on constraint cita_no_llego_con_sello on citas is
  'Un no-show sin hora ni autor es una acusación sin firma, y de eso depende si se retiene el anticipo y si la clienta entra al historial.';

create index citas_del_dia
  on citas (organizacion_id, sucursal_id, agendada_para)
  where estado not in ('cancelada', 'reprogramada');
create index citas_por_cliente on citas (organizacion_id, cliente_id, agendada_para desc);

create trigger citas_tocar_updated_at
  before update on citas for each row execute function tocar_updated_at();

create table cita_servicios (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cita_id             uuid        not null references citas (id) on delete cascade,
  servicio_id         uuid        not null references servicios (producto_id) on delete restrict,
  profesional_id      uuid        not null references profesionales (id) on delete restrict,

  -- CONGELADO al agendar. Si el salón sube el tinte entre que se agenda y que
  -- se cobra, la clienta paga lo que se le dijo: ése es el trato, y el sistema
  -- no lo puede romper solo.
  precio_centavos     bigint      not null check (precio_centavos >= 0),

  -- Cuándo está ocupada LA PERSONA. Multirango porque el procesado lo parte.
  rango_activo        tstzmultirange not null,
  -- Cuándo está ocupada LA ESTACIÓN. Uno solo, de principio a fin.
  rango_ocupacion     tstzrange   not null,

  estado              text        not null default 'pendiente',
  -- Dispara el consumo de producto de cabina: lo que la estilista declara haber
  -- mezclado. El tinte no se aplica en gramos exactos y por eso se declara al
  -- cerrar y no se explota de una receta.
  cerrado_en          timestamptz,
  orden_linea_id      uuid        references orden_lineas (id),

  created_at          timestamptz not null default now(),

  constraint cita_servicio_estado_valido check (
    estado in ('pendiente', 'en_curso', 'cerrado', 'cancelado')
  ),
  constraint cita_servicio_cerrado_con_fecha check (estado <> 'cerrado' or cerrado_en is not null),
  -- Lo activo cabe dentro de la ocupación, siempre. Si no, el profesional
  -- estaría trabajando fuera de la estación que tiene reservada.
  constraint cita_servicio_activo_dentro check (
    rango_activo <@ multirange(rango_ocupacion)
  ),

  -- ★ LA RESTRICCIÓN CLAVE DE TODA LA CARPETA ★
  --
  -- Dos clientas con la misma persona a la misma hora no es un error de
  -- captura: es una clienta que se va. Vive en la BASE y no en la aplicación
  -- porque dos peticiones simultáneas —la recepcionista y la clienta desde el
  -- portal— pasan las dos la comprobación de la aplicación y sólo una puede
  -- pasar la de Postgres.
  --
  -- Sobre `rango_activo` y NO sobre la ocupación: con la ocupación, el procesado
  -- volvería a bloquear al profesional y el 25-40 % de capacidad se perdería
  -- sin que nadie lo notara.
  exclude using gist (
    profesional_id with =,
    rango_activo   with &&
  ) where (estado <> 'cancelado')
);

comment on column cita_servicios.precio_centavos is
  'Congelado al agendar. Si el salón sube el tinte entre agendar y cobrar, la clienta paga lo que se le dijo: ése es el trato.';
comment on column cita_servicios.rango_activo is
  'Cuándo está ocupada LA PERSONA. Multirango porque el procesado lo parte en dos, y de esa partición sale la capacidad extra.';

create index cita_servicios_por_cita on cita_servicios (cita_id);
create index cita_servicios_por_profesional
  on cita_servicios using gist (profesional_id, rango_ocupacion)
  where estado <> 'cancelado';

create table cita_recursos (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cita_servicio_id    uuid        not null references cita_servicios (id) on delete cascade,
  recurso_id          uuid        not null references recursos (id) on delete restrict,
  rango               tstzrange   not null,

  created_at          timestamptz not null default now(),

  -- Dos clientas en el mismo lavabo a la misma hora. La misma regla que arriba,
  -- para el mueble en vez de para la persona.
  exclude using gist (recurso_id with =, rango with &&)
);

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

  foreach t in array array['citas', 'cita_servicios', 'cita_recursos']
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
