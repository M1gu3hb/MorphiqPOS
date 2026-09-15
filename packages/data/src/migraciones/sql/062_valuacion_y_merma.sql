-- 062 · F-108 valuación del inventario y F-109 merma con motivo.
--
-- ── F-108 · Por qué faltaba la mitad ───────────────────────────────────────
-- Hoy existe el costo promedio: `insumos.costo_unitario_centavos` se recalcula
-- al recibir una compra. Lo que NO existe es la valuación del inventario —
-- cuánto dinero hay en el estante— ni su histórico. Sin histórico no se puede
-- contestar «¿cuánto dinero tengo dormido y desde cuándo?», que es el número del
-- que depende la decisión de rematar.
--
-- ── F-109 · Por qué la merma va como ESTRATEGIA y no en el tronco ──────────
-- Está marcada `[≠]` en el catálogo y con razón: la merma de una cocina
-- (calibración, vaporizado, platillo rehecho), la de un lote caducado (fecha de
-- entrada, remate antes de tirar) y la de un corte de cable (retazo invendible)
-- no se registran igual ni disparan la misma decisión. El TRONCO guarda el
-- movimiento; el MOTIVO lo declara cada giro.
--
-- Lo que sí es del tronco: que todo motivo esté declarado y que ninguno sea
-- texto libre. Una merma con motivo escrito a mano es una merma que no se puede
-- agrupar, y una merma que no se agrupa no sirve para detectar robo — que es
-- para lo único que se registra.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ───────────────────────────────

-- ── F-108 · Corte de valuación ─────────────────────────────────────────────
create table valuaciones_inventario (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  almacen_id      uuid        references almacenes (id),
  metodo          text        not null,
  tomada_en       timestamptz not null default now(),
  -- El valor total en centavos. `bigint` y no `numeric`: es dinero, y el dinero
  -- de este sistema vive en centavos enteros sin excepción.
  valor_centavos  bigint      not null,
  articulos       int         not null,
  empleado_id     uuid        references empleos (id) on delete set null,

  constraint valuaciones_metodo_valido check (metodo in ('promedio', 'peps')),
  constraint valuaciones_valor_no_negativo check (valor_centavos >= 0),
  constraint valuaciones_articulos_no_negativo check (articulos >= 0)
);

comment on table valuaciones_inventario is
  'F-108 · Foto del valor del inventario en un instante. Es histórico: sirve para ver cuánto dinero lleva dormido y desde cuándo, que es lo que dispara la decisión de rematar.';

create index valuaciones_por_fecha
  on valuaciones_inventario (organizacion_id, tomada_en desc);

-- El detalle por artículo. Sin él, el total es un número que nadie puede
-- auditar ni descomponer, y el primer desacuerdo lo vuelve inútil.
create table valuacion_lineas (
  valuacion_id            uuid    not null references valuaciones_inventario (id) on delete cascade,
  insumo_id               uuid    not null references insumos (id),
  cantidad                numeric(14, 4) not null,
  costo_unitario_centavos bigint  not null,
  valor_centavos          bigint  not null,

  primary key (valuacion_id, insumo_id),

  constraint valuacion_lineas_costo_no_negativo check (costo_unitario_centavos >= 0)
);

-- ── F-109 · Los motivos de merma, declarados por giro ──────────────────────
--
-- Tabla y no `check`: los motivos crecen con cada giro nuevo —la calibración de
-- una cafetería, el retazo de una ferretería— y un `check` obligaría a una
-- migración por cada uno. Con tabla, añadir un motivo es una fila.
create table motivos_merma (
  clave       text        primary key,
  etiqueta    text        not null,
  -- El giro que lo usa. `null` = lo usan todos, y ésos son el tronco.
  giro        text,
  -- Si el motivo apunta a un responsable. `caducado` no; `roto_por_personal` sí,
  -- y esa diferencia es la que decide si el número sirve para detectar robo.
  imputable   boolean     not null default false,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now(),

  constraint motivos_merma_clave_no_vacia check (length(btrim(clave)) > 0)
);

comment on table motivos_merma is
  'F-109 · Los motivos de merma. Tabla y no check porque cada giro añade los suyos; un check obligaría a una migración por motivo.';
comment on column motivos_merma.giro is
  'El giro que lo usa. NULL = lo usan todos: ésos son el tronco de la merma.';
comment on column motivos_merma.imputable is
  'Si el motivo apunta a un responsable. Es lo que separa una merma que se acepta de una que hay que investigar.';

-- Los motivos del TRONCO. Los de cada giro los siembra su propia migración.
insert into motivos_merma (clave, etiqueta, giro, imputable) values
  ('caducado',      'Caducado',                     null, false),
  ('dañado',        'Dañado en almacén',            null, false),
  ('roto',          'Roto al manipular',            null, true),
  ('robo',          'Faltante sin explicación',     null, true),
  ('muestra',       'Muestra o degustación',        null, false),
  ('ajuste_conteo', 'Diferencia de conteo físico',  null, false)
on conflict (clave) do nothing;

-- `movimientos_stock.motivo` deja de ser texto libre y apunta aquí. Se declara
-- como `foreign key` NO validada sobre lo histórico: los movimientos viejos
-- llevan motivos escritos a mano y reescribirlos sería inventar datos.
alter table movimientos_stock
  add constraint movimientos_stock_motivo_conocido
  foreign key (motivo) references motivos_merma (clave)
  not valid;

comment on constraint movimientos_stock_motivo_conocido on movimientos_stock is
  'NOT VALID a propósito: lo histórico lleva motivos escritos a mano y reescribirlos sería inventar datos. Lo nuevo sí se valida.';

-- ── RLS ────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach t in array array['valuaciones_inventario', 'valuacion_lineas']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert on table %I to morphiqpos_app', t);
    end if;
  end loop;

  -- `motivos_merma` es catálogo compartido, no datos de un negocio: se lee
  -- desde cualquier organización y sólo la escribe una migración.
  if roles_publicos is not null then
    execute format('revoke all privileges on table motivos_merma from %s', roles_publicos);
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on table motivos_merma to morphiqpos_app;
  end if;
end;
$$;
