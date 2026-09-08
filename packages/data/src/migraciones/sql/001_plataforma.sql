-- ═══════════════════════════════════════════════════════════════════════════
-- 001 · Núcleo de plataforma
--
-- Organización, sucursal, terminal, personas, identidades, empleos,
-- configuración, folios y auditoría.
--
-- Convenciones fijas de `03-MODELO-DE-DATOS-UNIFICADO`, que valen para TODAS
-- las migraciones de este esquema:
--
--   · snake_case plural en español.
--   · `id uuid primary key default gen_random_uuid()`.
--   · Toda tabla operativa lleva `organizacion_id uuid not null`, y todo índice
--     compuesto la pone PRIMERO. Sin eso, el aislamiento por organización
--     depende de que nadie olvide un WHERE (R16).
--   · Dinero en `bigint` de centavos. El nombre del campo termina en
--     `_centavos`, para que un `numeric` colado se vea a simple vista (R15).
--   · Cantidades de inventario en `numeric(14,4)`: hacen falta fracciones de gramo.
--   · Los enumerados son `text` con `check`, no tipos `enum` de Postgres:
--     agregar un valor a un `enum` en producción bloquea la tabla.
-- ═══════════════════════════════════════════════════════════════════════════

-- `gen_random_uuid()` es nativa desde Postgres 13; no hace falta pgcrypto.

-- ───────────────────────────────────────────────────────────── organizaciones
create table organizaciones (
  id            uuid        primary key default gen_random_uuid(),
  nombre        text        not null check (length(trim(nombre)) > 0),
  slug          text        not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),

  -- El selector de paquete (A-42). Es lo que Miguel cambia delante del cliente
  -- para enseñarle "así se vería el tuyo".
  --
  -- No es un adorno de interfaz: el envoltorio `comando()` lo lee para decidir
  -- si un comando está incluido, y responde 403 PAQUETE_NO_INCLUYE antes de
  -- ejecutar el caso de uso. Ocultar un botón no es autorización (R11).
  paquete       text        not null default 'tienda'
                            check (paquete in ('tienda', 'ferreteria', 'farmacia',
                                               'cafeteria', 'restaurante')),

  moneda        text        not null default 'MXN' check (moneda in ('MXN')),
  zona_horaria  text        not null default 'America/Mexico_City',
  activa        boolean     not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column organizaciones.paquete is
  'Tipo de negocio. Gobierna navegación, pantallas y comandos permitidos. Se verifica en servidor (A-42).';

-- ──────────────────────────────────────────────────────────────── sucursales
create table sucursales (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  nombre          text        not null check (length(trim(nombre)) > 0),
  direccion       text,
  telefono        text,
  activa          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sucursales_por_organizacion on sucursales (organizacion_id, activa);

-- ──────────────────────────────────────────────────────────────── terminales
-- Una terminal se da de alta UNA vez y queda autorizada (A-28). El código de
-- enrolamiento es de un solo uso y caduca; el token vive hasheado, nunca en claro.
create table terminales (
  id                 uuid        primary key default gen_random_uuid(),
  organizacion_id    uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id        uuid        not null references sucursales(id) on delete restrict,
  nombre             text        not null check (length(trim(nombre)) > 0),

  device_token_hash  text,
  codigo_enrolamiento_hash text,
  codigo_expira_en   timestamptz,

  enrolada_en        timestamptz,
  ultima_actividad   timestamptz,
  activa             boolean     not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index terminales_por_organizacion on terminales (organizacion_id, activa);
create unique index terminales_nombre_unico on terminales (sucursal_id, lower(nombre));

comment on column terminales.device_token_hash is
  'Hash del token del dispositivo. El token en claro sólo existe en la cookie de la terminal.';

-- ─────────────────────────────────────────────────────────────────── personas
-- Separa el ser humano de su rol: una persona puede ser cajera en una sucursal
-- y gerente en otra, y su historial de cobros no se parte al cambiar de puesto.
create table personas (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  nombre          text        not null check (length(trim(nombre)) > 0),
  apellidos       text,
  telefono        text,
  correo          text,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index personas_por_organizacion on personas (organizacion_id);

-- ────────────────────────────────────────────────────────────── identidades
-- `auth_user_id` es nullable a propósito: un cajero que sólo entra con PIN en
-- la terminal NO necesita cuenta de correo.
create table identidades (
  id           uuid        primary key default gen_random_uuid(),
  persona_id   uuid        not null references personas(id) on delete cascade,
  auth_user_id uuid        unique,
  correo       text,
  activa       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index identidades_por_persona on identidades (persona_id);
create unique index identidades_correo_unico on identidades (lower(correo))
  where correo is not null;

-- ─────────────────────────────────────────────────────────── credenciales_pin
-- Corrige P0-01 y SEC-AUTH-001: en la fuente, POSLogin.jsx descargaba los
-- usuarios CON su PIN y lo comparaba en el navegador.
--
-- Aquí el hash NUNCA sale de la base. Ninguna consulta de la aplicación
-- selecciona esta tabla salvo el comando de autenticación, y ese devuelve
-- únicamente un booleano.
create table credenciales_pin (
  id                uuid        primary key default gen_random_uuid(),
  identidad_id      uuid        not null unique references identidades(id) on delete cascade,

  -- Argon2id con pimienta del entorno. El algoritmo va en la fila para poder
  -- rotar parámetros sin invalidar los PIN existentes.
  pin_hash          text        not null,
  algoritmo         text        not null default 'argon2id' check (algoritmo in ('argon2id')),

  intentos_fallidos integer     not null default 0 check (intentos_fallidos >= 0),
  bloqueada_hasta   timestamptz,
  rotada_en         timestamptz not null default now(),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table credenciales_pin is
  'El hash NUNCA sale de la base. Prueba AUTH-05 recorre todos los endpoints para comprobarlo.';

-- ───────────────────────────────────────────────────────────────────── empleos
-- Persona × organización × sucursal × rol × vigencia.
create table empleos (
  id              uuid        primary key default gen_random_uuid(),
  persona_id      uuid        not null references personas(id) on delete restrict,
  organizacion_id uuid        not null references organizaciones(id) on delete restrict,
  sucursal_id     uuid        references sucursales(id) on delete restrict,

  rol             text        not null
                              check (rol in ('dueno', 'administrador', 'gerente',
                                             'cajero', 'mesero', 'cocina', 'almacen')),

  vigente_desde   date        not null default current_date,
  vigente_hasta   date,
  activo          boolean     not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create index empleos_por_organizacion on empleos (organizacion_id, activo);
create unique index empleos_persona_activa on empleos (persona_id, organizacion_id)
  where activo;

-- ──────────────────────────────────────────────────────────────── configuracion
-- Corrige P1-01 de raíz. En la fuente había SIETE registros de configuración y
-- el código hacía `list()[0]`, así que la configuración efectiva dependía del
-- orden que devolviera la base.
--
-- F1.1 usa UNA configuración por organización (A-41 difiere el multi-ámbito a
-- F1.5). La restricción única es lo que hace imposible el segundo registro.
create table configuracion (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null unique references organizaciones(id) on delete cascade,
  valores         jsonb       not null default '{}'::jsonb,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────── folios
-- Corrige P1-09. En la fuente el folio era timestamp + 3 dígitos aleatorios,
-- con `unique (negocio_id, folio)`: colisión garantizada en hora pico.
--
-- Aquí el consecutivo se obtiene con `update … returning` DENTRO de la
-- transacción del cobro. Dos cobros simultáneos se serializan en esta fila y
-- salen con folios distintos y sin huecos.
create table folios (
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  sucursal_id     uuid        not null references sucursales(id) on delete cascade,
  serie           text        not null check (serie ~ '^[A-Z]{1,6}$'),
  siguiente       bigint      not null default 1 check (siguiente > 0),
  primary key (organizacion_id, sucursal_id, serie)
);

-- ────────────────────────────────────────────────────────────────── auditoria
-- Sólo acciones sensibles (A-41): cobro, cancelación, ajuste, cambio de precio,
-- apertura y cierre de caja. Cubre donde se pierde dinero.
--
-- Sin política de INSERT para roles de cliente: sólo el servidor escribe aquí.
create table auditoria (
  id              bigserial   primary key,
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,
  identidad_id    uuid        references identidades(id) on delete set null,
  terminal_id     uuid        references terminales(id) on delete set null,

  accion          text        not null check (length(accion) > 0),
  entidad         text        not null,
  entidad_id      uuid,

  payload         jsonb       not null default '{}'::jsonb,
  ip              inet,
  correlation_id  uuid,

  created_at      timestamptz not null default now()
);

create index auditoria_por_organizacion on auditoria (organizacion_id, created_at desc);
create index auditoria_por_entidad on auditoria (organizacion_id, entidad, entidad_id);

-- ───────────────────────────────────────────────────── updated_at automático
create or replace function tocar_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function tocar_updated_at is
  'Único trigger con lógica del sistema, y no es lógica de negocio: es metadato de fila. R7 se respeta.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizaciones', 'sucursales', 'terminales', 'personas', 'identidades',
    'credenciales_pin', 'empleos', 'configuracion'
  ]
  loop
    execute format(
      'create trigger %I_tocar_updated_at before update on %I
         for each row execute function tocar_updated_at()',
      t, t
    );
  end loop;
end;
$$;
