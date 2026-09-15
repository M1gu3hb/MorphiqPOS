-- 110 · Atributos técnicos, ubicación y equivalencias (F-059, F-152, F-060).
--
-- ── Sin esto no hay modelo ────────────────────────────────────────────────
-- Un producto de ferretería NO tiene nombre útil: tiene una combinación de
-- atributos. `Tornillo · tirafondo · 1/4" · 2" · galvanizado · hexagonal`. Hoy
-- la búsqueda es por nombre y «tornillo» devuelve 340 resultados sin orden, así
-- que el mostradorista no usa el sistema: usa su memoria. Y en ese momento el
-- inventario, el margen y los faltantes se vuelven ficción, porque lo que se
-- vendió no es lo que se tecleó.
--
-- ── Por qué el valor normalizado va en MICRÓMETROS ───────────────────────
-- `1/4"` son 6.35 mm exactos y `1/8"` son 3.175 mm. En milímetros enteros se
-- pierde; con decimales vuelven los flotantes que esta fase prohíbe. En
-- micrómetros los dos son enteros: 6,350 y 3,175. Misma decisión que los
-- centavos, llevada a la longitud.
--
-- ── Por qué se conserva el valor ORIGINAL al lado ────────────────────────
-- El mostradorista busca `1/4` y espera ver `1/4"`, no `6.35 mm`. Reconstruir
-- la fracción desde el decimal es ambiguo —6,350 µm podría presentarse de las
-- dos formas— y la correcta es la que se capturó.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── F-021 · La línea, con su esquema de atributos ────────────────────────
--
-- Una línea agrupa lo que comparte atributos: «tornillería» tiene diámetro,
-- longitud, acabado y cabeza; «cable» tiene calibre y número de hilos. El
-- esquema vive en la LÍNEA y no en el producto porque si no, cada alta
-- inventaría sus propias claves y la búsqueda por medida volvería a no existir.
create table lineas (
  id                 uuid        primary key default gen_random_uuid(),
  organizacion_id    uuid        not null references organizaciones (id) on delete cascade,
  padre_id           uuid        references lineas (id) on delete restrict,
  nombre             text        not null check (length(trim(nombre)) > 0),
  -- `[{clave, etiqueta, tipo: 'medida'|'lista'|'texto', opciones?}]`
  esquema_atributos  jsonb       not null default '[]'::jsonb,
  orden              int         not null default 0,
  activa             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (organizacion_id, padre_id, nombre)
);

comment on table lineas is
  'F-021 · Categoría jerárquica con esquema de atributos. El esquema vive aquí y no en el producto: si no, cada alta inventa sus claves y la búsqueda por medida deja de existir.';

create index lineas_por_padre on lineas (organizacion_id, padre_id, orden) where activa;

create trigger lineas_tocar_updated_at
  before update on lineas for each row execute function tocar_updated_at();

-- ── F-152 · Dónde está la pieza ──────────────────────────────────────────
--
-- `zonas_anaquel` (F-149, migración 091) NO sirve para esto y las dos tablas
-- conviven a propósito: la zona existe para CONTAR —una vez al día, por el
-- encargado, agrupando muchas gavetas— y la ubicación existe para VENDER
-- —sesenta veces al día, por el mostradorista, gaveta por gaveta—. Fusionarlas
-- obligaría a que la unidad de conteo fuera la gaveta, y contar 400 gavetas es
-- una vuelta de dos años.
create table ubicaciones (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  almacen_id       uuid        not null references almacenes (id) on delete cascade,
  codigo           text        not null check (length(trim(codigo)) > 0),
  descripcion      text,
  -- Una zona agrupa varias ubicaciones: es lo que une el vender con el contar.
  zona_id          uuid        references zonas_anaquel (id) on delete set null,
  orden_recorrido  int         not null default 0,
  activa           boolean     not null default true,
  created_at       timestamptz not null default now(),

  unique (almacen_id, codigo)
);

comment on table ubicaciones is
  'F-152 · Dónde está esta pieza. Distinta de zonas_anaquel: la zona es para contar una vez al día; la ubicación es para vender sesenta veces al día.';

create index ubicaciones_por_recorrido
  on ubicaciones (organizacion_id, almacen_id, orden_recorrido) where activa;

-- ── F-059 · El atributo, normalizado ─────────────────────────────────────
create table producto_atributos (
  id                 uuid   primary key default gen_random_uuid(),
  organizacion_id    uuid   not null references organizaciones (id) on delete cascade,
  producto_id        uuid   not null references productos (id) on delete cascade,
  clave              text   not null check (length(trim(clave)) > 0),
  -- Para atributos de lista: 'galvanizado', 'hexagonal'.
  valor_texto        text,
  -- Para atributos de medida: en MICRÓMETROS. `1/4"` = 6350.
  valor_normalizado  bigint,
  -- Lo que tecleó la persona: `'1/4"'`. Se conserva tal cual y NUNCA se deriva.
  valor_original     text   not null check (length(trim(valor_original)) > 0),
  created_at         timestamptz not null default now(),

  -- Un atributo o es de lista o es de medida. Con los dos vacíos es una fila
  -- que dice que el producto tiene un atributo y no dice cuál.
  constraint atributo_con_valor check (valor_texto is not null or valor_normalizado is not null),

  -- Una clave, un valor, por producto. Dos filas de `diametro` harían que el
  -- mismo tornillo apareciera en dos búsquedas distintas y en ninguna completo.
  unique (producto_id, clave)
);

comment on column producto_atributos.valor_normalizado is
  'En MICRÓMETROS. 1/4" = 6350 y 1/8" = 3175, los dos enteros. En milímetros se pierde; con decimales vuelven los flotantes.';
comment on column producto_atributos.valor_original is
  'Lo que se tecleó. El mostradorista busca 1/4 y espera ver 1/4", y reconstruir la fracción desde el decimal es ambiguo.';

-- Los dos índices que sostienen la búsqueda por medida. Sin ellos, filtrar por
-- diámetro sobre 6,000 claves recorre la tabla entera en cada tecleo.
create index atributos_por_medida
  on producto_atributos (organizacion_id, clave, valor_normalizado)
  where valor_normalizado is not null;
create index atributos_por_lista
  on producto_atributos (organizacion_id, clave, valor_texto)
  where valor_texto is not null;

-- ── F-060 · «No tengo la de 1/2 pero la de 13 mm le sirve» ───────────────
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
  -- NO es auditoría: es producto. Cuando Chava se jubile, Beto va a poder ver
  -- que 340 equivalencias las declaró él, y eso es el conocimiento que se
  -- quería retener. También sirve para lo incómodo.
  declarado_por    uuid        references empleos (id) on delete set null,
  declarado_en     timestamptz not null default now(),

  constraint equivalencia_no_es_de_si_mismo check (producto_id <> equivalente_id),
  unique (producto_id, equivalente_id, tipo)
);

comment on column equivalencias.declarado_por is
  'No es auditoría: es producto. Cuando el mostradorista experto se vaya, lo que declaró se queda, y se sabe que fue él.';

create index equivalencias_por_producto on equivalencias (organizacion_id, producto_id);

-- ── Lo que `productos` gana ──────────────────────────────────────────────
alter table productos add column linea_id uuid references lineas (id);
alter table productos add column ubicacion_id uuid references ubicaciones (id);
-- F-151 · En MILIGRAMOS, enteros. El tornillo de 5 g es 5000.
alter table productos add column peso_por_pieza_mg bigint check (peso_por_pieza_mg is null or peso_por_pieza_mg > 0);
alter table productos add column tolerancia_peso_pct numeric(5, 2) not null default 8.00
  check (tolerancia_peso_pct >= 0 and tolerancia_peso_pct <= 100);
alter table productos add column peso_calibrado_en timestamptz;
-- Sólo estas ~200 disparan alerta de mínimo: con 6,000 claves, alertar de todas
-- es una lista que nadie lee.
alter table productos add column es_alta_rotacion boolean not null default false;
alter table productos add column requiere_serie boolean not null default false;

create index productos_por_linea on productos (organizacion_id, linea_id) where linea_id is not null;
create index productos_por_ubicacion on productos (organizacion_id, ubicacion_id) where ubicacion_id is not null;

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

  foreach t in array array['lineas', 'ubicaciones', 'producto_atributos', 'equivalencias']
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
