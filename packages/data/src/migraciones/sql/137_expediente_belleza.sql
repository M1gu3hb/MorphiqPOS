-- 137 · El expediente de belleza (F-153, F-154, F-436).
--
-- ── Por qué esto NO es «notas del cliente» ───────────────────────────────
-- En los otros cuatro modelos la ficha del cliente se consulta cuando hace
-- falta. Aquí se ABRE EN CADA VISITA, antes de tocar a la clienta, y se llena
-- durante el servicio con guantes puestos. Eso cambia la forma entera: la
-- captura tiene que ser de UN TOQUE sobre la fórmula anterior —REPETIR— y sólo
-- se edita lo que cambió.
--
-- ── La fórmula se CONGELA, no se referencia ──────────────────────────────
-- Cada aplicación guarda su propio jsonb con lo que de verdad se mezcló: marca,
-- tono, volumen, gramos y minutos. Apuntar al catálogo dejaría el histórico a
-- merced de un cambio de precio o de un producto descontinuado, y el valor de
-- este expediente es justo poder repetir dentro de dos años lo que se hizo hoy.
--
-- ── Y por qué las alergias van en columna propia ─────────────────────────
-- Porque una alergia dentro de un jsonb de notas es una alergia que nadie
-- consulta. Aquí es un campo que la pantalla enseña arriba de todo y que la
-- base obliga a contestar aunque sea con «ninguna conocida»: el hueco en blanco
-- y el «no tiene» son cosas distintas y sólo una de las dos es una decisión.
--
-- ── La foto trae consentimiento, y el consentimiento trae fecha ──────────
-- Son 20 a 60 fotos al mes por salón, de la cara de una persona. El
-- consentimiento no es una casilla en la ficha: es un registro con fecha, texto
-- y alcance, porque «dijo que sí hace tres años para una foto interna» no
-- autoriza publicarla hoy en redes.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table expedientes_belleza (
  cliente_id            uuid        primary key references clientes (id) on delete cascade,
  organizacion_id       uuid        not null references organizaciones (id) on delete cascade,

  -- Las cuatro nacen vacías y la pantalla las pide en la primera visita: el
  -- hueco en blanco y el «no tiene» son cosas distintas, y sólo una de las dos
  -- es una decisión de alguien.
  alergias              text        not null default '',
  antecedentes          text        not null default '',
  como_llego            text        not null default '',
  que_busca             text        not null default '',

  tipo_cabello          text,
  porcentaje_canas      smallint,
  ultimo_alisado_en     date,
  frecuencia_dias       smallint,

  abierto_en            timestamptz not null default now(),
  abierto_por           uuid        references empleos (id) on delete set null,
  updated_at            timestamptz not null default now(),

  constraint expediente_canas_en_rango check (
    porcentaje_canas is null or porcentaje_canas between 0 and 100
  ),
  constraint expediente_frecuencia_en_rango check (
    frecuencia_dias is null or frecuencia_dias between 1 and 730
  )
);

comment on table expedientes_belleza is
  'F-153 · El expediente se abre en CADA visita, antes de tocar a la clienta, y se llena con guantes puestos. No es «notas del cliente».';
comment on column expedientes_belleza.alergias is
  'Obligatoria aunque sea «ninguna conocida»: un hueco en blanco no dice si se preguntó y no había, o si nadie preguntó.';
comment on column expedientes_belleza.frecuencia_dias is
  'Cada cuánto vuelve. De aquí sale «le toca volver» (F-951): sin este número, recordar a quien no ha vuelto es adivinar.';

create trigger expedientes_tocar_updated_at
  before update on expedientes_belleza for each row execute function tocar_updated_at();

create table formulas_aplicadas (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cliente_id          uuid        not null references clientes (id) on delete cascade,
  cita_servicio_id    uuid        references cita_servicios (id) on delete set null,
  servicio_id         uuid        references servicios (producto_id) on delete set null,
  profesional_id      uuid        references profesionales (id) on delete set null,

  -- CONGELADA. `{marca, tono, volumen, gramos, minutos, notas}`. No apunta al
  -- catálogo: el valor del expediente es poder repetir en dos años lo que se
  -- hizo hoy, y un producto descontinuado no puede borrar esa memoria.
  formula             jsonb       not null,
  minutos_procesado   smallint,
  resultado           text,

  aplicada_en         timestamptz not null default now(),
  created_at          timestamptz not null default now(),

  constraint formula_no_vacia check (formula <> '{}'::jsonb),
  constraint formula_procesado_en_rango check (
    minutos_procesado is null or minutos_procesado between 0 and 600
  )
);

comment on table formulas_aplicadas is
  'F-154 · Lo que de verdad se mezcló, congelado. De aquí sale el botón REPETIR, que es lo que convierte la captura en un toque.';

-- La última fórmula de una clienta para un servicio: es literalmente la
-- consulta del botón REPETIR, y se hace con la clienta sentada delante.
create index formulas_ultima
  on formulas_aplicadas (organizacion_id, cliente_id, servicio_id, aplicada_en desc);

create table consentimientos (
  id                uuid        primary key default gen_random_uuid(),
  organizacion_id   uuid        not null references organizaciones (id) on delete cascade,
  cliente_id        uuid        not null references clientes (id) on delete cascade,

  alcance           text        not null,
  texto             text        not null check (length(trim(texto)) > 0),
  otorgado_en       timestamptz not null default now(),
  revocado_en       timestamptz,
  recogido_por      uuid        references empleos (id) on delete set null,

  constraint consentimiento_alcance_valido check (
    alcance in ('expediente', 'foto_interna', 'foto_publicable', 'recordatorios')
  ),
  constraint consentimiento_revocado_despues check (
    revocado_en is null or revocado_en >= otorgado_en
  )
);

comment on table consentimientos is
  'El consentimiento no es una casilla: es un registro con fecha, texto y alcance. «Dijo que sí hace tres años para una foto interna» no autoriza publicarla hoy.';

create index consentimientos_vigentes
  on consentimientos (organizacion_id, cliente_id, alcance) where revocado_en is null;

create table fotos_expediente (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cliente_id          uuid        not null references clientes (id) on delete cascade,
  cita_servicio_id    uuid        references cita_servicios (id) on delete set null,

  momento             text        not null,
  -- La URL y no un `archivo_id`: en este sistema no hay tabla de archivos, el
  -- almacén los guarda y lo que viaja es la ruta —igual que `productos.imagen_url`
  -- y `profesionales.foto_url`—. Inventar aquí una tabla dejaría dos formas de
  -- guardar lo mismo, y la de subida ya existe y está probada.
  archivo_url         text        not null check (length(trim(archivo_url)) > 0),
  consentimiento_id   uuid        references consentimientos (id) on delete set null,

  tomada_en           timestamptz not null default now(),
  tomada_por          uuid        references empleos (id) on delete set null,

  constraint foto_momento_valido check (momento in ('antes', 'despues')),
  -- Una foto por momento y por servicio. La segunda «antes» sustituye a la
  -- primera sin que nadie sepa después cuál era la buena.
  unique (cita_servicio_id, momento)
);

comment on table fotos_expediente is
  'F-436 · Antes y después, dentro del expediente. Comparte almacenamiento con la foto de catálogo pero no la bolsa: son 20 a 60 al mes, de la cara de una persona.';

create index fotos_por_clienta
  on fotos_expediente (organizacion_id, cliente_id, tomada_en desc);

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

  foreach t in array array[
    'expedientes_belleza', 'formulas_aplicadas', 'consentimientos', 'fotos_expediente'
  ]
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
