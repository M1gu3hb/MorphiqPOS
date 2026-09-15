-- 131 · El servicio, su secuencia y quién lo da (F-401, F-415, F-421, F-403).
--
-- ── La duración es una SECUENCIA, nunca un número ────────────────────────
-- Un tinte son 120 minutos, pero no son 120 minutos de estilista: son 40 de
-- aplicación, 45 de PROCESADO —la clienta sentada sola con el tinte puesto—, 25
-- de terminado y 10 de limpieza. Si la agenda bloquea al profesional durante el
-- procesado, el salón atiende 6 clientas al día; si lo libera, atiende 9 con la
-- misma gente y el mismo local. Es entre el 25 % y el 40 % de capacidad que
-- ningún competidor del segmento aprovecha.
--
-- ── Y se construye como secuencia AUNQUE la barbería no la necesite ──────
-- `duracion_pasiva_min = 0` es el caso de barbería y de consultorio. El mismo
-- modelo sirve para los once vecinos sin una sola rama. Nacer con un entero y
-- meter el tiempo pasivo después obligaría a reescribir la agenda entera.
--
-- ── `servicios` extiende `productos`, no crea un catálogo paralelo ───────
-- El servicio se vende, se cobra, entra al ticket y lleva precio: es un producto
-- con `tipo = 'servicio'`. Una tabla aparte duplicaría precio, impuesto y
-- catálogo, y el ticket tendría que unir dos fuentes para pintarse.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- `servicio` YA existe en el check de la 002: no hace falta tocarlo. Lo que
-- falta es `paquete` —el bono de diez sesiones—, y se añade reescribiendo el
-- check entero, que es la única forma de ampliarlo en Postgres.
alter table productos drop constraint productos_tipo_venta_check;
alter table productos
  add constraint productos_tipo_venta_check check (
    tipo_venta in ('precio_fijo', 'variable_medida', 'porcion_contenedor', 'servicio', 'paquete')
  );

create table servicios (
  producto_id             uuid        primary key references productos (id) on delete cascade,
  organizacion_id         uuid        not null references organizaciones (id) on delete cascade,

  -- La aplicación. Mayor que cero: un servicio de cero no se agenda.
  duracion_activa_1_min   smallint    not null check (duracion_activa_1_min > 0),
  -- EL PROCESADO. Cero en barbería y en consultorio.
  duracion_pasiva_min     smallint    not null default 0 check (duracion_pasiva_min >= 0),
  duracion_activa_2_min   smallint    not null default 0 check (duracion_activa_2_min >= 0),
  -- La limpieza. Ocupa el MUEBLE, no a la persona: contarla como tiempo del
  -- profesional le quita diez minutos de agenda por servicio, y a seis
  -- servicios al día es una hora perdida por persona.
  duracion_cierre_min     smallint    not null default 0 check (duracion_cierre_min >= 0),

  pasivo_intercalable     boolean     not null default false,
  requiere_estacion       boolean     not null default true,
  -- SUGERENCIA de fórmula, no receta: no explota el inventario. Lo que descuenta
  -- es lo que la estilista declara haber mezclado al cerrar el servicio, porque
  -- un tinte no se aplica en gramos exactos.
  formula_base            jsonb,
  regla_comision_id       uuid,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Un procesado sin terminado no existe: el tinte se enjuaga y se seca.
  -- Dejaría a la clienta sentada y a nadie esperándola.
  constraint servicio_procesado_con_terminado check (
    duracion_pasiva_min = 0 or duracion_activa_2_min > 0
  )
);

comment on table servicios is
  'F-401 + F-415 · La duración es una secuencia: aplicación, procesado, terminado, limpieza. El procesado libera al profesional y no a la estación, y de ahí sale el 25-40 % de capacidad que nadie aprovecha.';
comment on column servicios.formula_base is
  'SUGERENCIA, no receta: no explota el inventario. Lo que descuenta es lo que se declara haber mezclado al cerrar, porque un tinte no se aplica en gramos exactos.';

create trigger servicios_tocar_updated_at
  before update on servicios for each row execute function tocar_updated_at();

-- ── F-421 · Quién da qué, a qué precio y a qué velocidad ─────────────────
create table servicios_profesional (
  servicio_id          uuid     not null references servicios (producto_id) on delete cascade,
  profesional_id       uuid     not null references profesionales (id) on delete cascade,
  organizacion_id      uuid     not null references organizaciones (id) on delete cascade,
  -- NULL = el del catálogo. Con valor, el de esta persona: un director cobra
  -- más por el mismo corte, y ésa es la escalera de precios del salón.
  precio_centavos      bigint   check (precio_centavos is null or precio_centavos >= 0),
  -- En PUNTOS BASE. Karla hace el mismo tinte en 80 min y Dany en 110: con el
  -- mismo número, la agenda de Karla queda con huecos y la de Dany se recorre
  -- todos los días. 10000 es «igual que el catálogo».
  factor_duracion_bp   int      not null default 10000 check (factor_duracion_bp between 2500 and 40000),

  created_at           timestamptz not null default now(),

  primary key (servicio_id, profesional_id)
);

comment on column servicios_profesional.factor_duracion_bp is
  'En puntos base. Karla hace el mismo tinte en 80 min y Dany en 110: con el mismo número la agenda de una queda con huecos y la de la otra se recorre todos los días.';

-- ── F-403 · El recurso físico: la estación, el lavabo, la secadora ──────
create table recursos (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id      uuid        references sucursales (id) on delete cascade,
  nombre           text        not null check (length(trim(nombre)) > 0),
  tipo             text        not null,
  capacidad        smallint    not null default 1 check (capacidad > 0),
  activo           boolean     not null default true,
  created_at       timestamptz not null default now(),

  constraint recurso_tipo_valido check (
    tipo in ('estacion', 'lavabo', 'secadora', 'cabina', 'otro')
  ),
  unique (organizacion_id, sucursal_id, nombre)
);

create table recursos_servicio (
  servicio_id    uuid     not null references servicios (producto_id) on delete cascade,
  tipo_recurso   text     not null,
  -- Qué tramo del servicio necesita ESE recurso. El lavabo se usa en el
  -- terminado, no durante el procesado: reservarlo todo el rato deja un lavabo
  -- bloqueado 45 minutos que otras tres clientas podrían haber usado.
  tramo          text     not null,
  minutos        smallint check (minutos is null or minutos > 0),

  constraint recurso_servicio_tramo_valido check (
    tramo in ('todo', 'activa_1', 'pasiva', 'activa_2')
  ),
  primary key (servicio_id, tipo_recurso, tramo)
);

comment on column recursos_servicio.tramo is
  'El lavabo se usa en el terminado, no durante el procesado: reservarlo todo el rato bloquea 45 minutos que otras tres clientas podrían haber usado.';

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

  foreach t in array array['servicios', 'servicios_profesional', 'recursos', 'recursos_servicio']
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
