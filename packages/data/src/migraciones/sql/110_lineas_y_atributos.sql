-- 110 · La línea y el atributo técnico (F-021, F-059).
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
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

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

-- ── Lo que `productos` gana ──────────────────────────────────────────────
alter table productos add column linea_id uuid references lineas (id);
-- Sólo estas ~200 disparan alerta de mínimo: con 6,000 claves, alertar de todas
-- es una lista que nadie lee.
alter table productos add column es_alta_rotacion boolean not null default false;
alter table productos add column requiere_serie boolean not null default false;

create index productos_por_linea on productos (organizacion_id, linea_id) where linea_id is not null;

-- ── El relleno · cada categoría existente se vuelve una línea de nivel 1 ──
--
-- Sin esto, el día que se aplique la migración el catálogo entero queda sin
-- línea: 6,000 productos que la búsqueda por atributos no encuentra, y un
-- mostradorista que vuelve a su memoria. Se hace aquí y no a mano porque «lo
-- capturamos después» es como los catálogos se quedan a medio migrar.
--
-- El esquema de atributos nace VACÍO a propósito: inventarlo por el nombre de
-- la categoría acertaría en «tornillería» y erraría en todo lo demás, y un
-- esquema equivocado es peor que ninguno —la ficha pide medidas que esa línea
-- no tiene y el capturista aprende a dejarlas en blanco—.
--
-- Sólo las categorías de PRODUCTO. Las de insumo agrupan harina y detergente,
-- que no se venden por mostrador y no tienen atributos técnicos que buscar.
insert into lineas (organizacion_id, padre_id, nombre, orden)
select c.organizacion_id, null, c.nombre, c.orden
  from categorias c
 where c.tipo = 'producto'
   and not exists (
     select 1 from lineas l
      where l.organizacion_id = c.organizacion_id
        and l.padre_id is null
        and l.nombre = c.nombre
   );

update productos p
   set linea_id = l.id
  from categorias c
  join lineas l
    on l.organizacion_id = c.organizacion_id
   and l.padre_id is null
   and l.nombre = c.nombre
 where c.tipo = 'producto'
   and p.categoria_id = c.id
   and p.linea_id is null;

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

  foreach t in array array['lineas', 'producto_atributos']
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
