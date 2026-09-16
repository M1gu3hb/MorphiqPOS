-- 119 · La lista de trabajo (F-153, ferretería).
--
-- ── Qué es una lista de trabajo y por qué no es una cotización ───────────
-- El albañil llega con un papel: «para la losa del 3er piso» y veintitrés
-- renglones escritos a mano, la mitad sin medida. No quiere un precio: quiere
-- que se lo surtan. La cotización es otra cosa —lleva vigencia, se manda y se
-- aprueba— y confundirlas obliga a cotizar para poder surtir.
--
-- ── Por qué el renglón guarda lo que PIDIERON, no sólo lo que se dio ─────
-- Porque la mitad de los renglones son «cemento del gris» y «medio bulto de
-- cal». La traducción a claves de catálogo la hace el mostradorista, y si el
-- sistema sólo guarda el resultado se pierde lo único que permite resolver la
-- discusión de la tarde: «yo pedí varilla del 3, no del 4».
--
-- ── Y por qué la lista se puede surtir a MEDIAS ──────────────────────────
-- Es el caso normal, no la excepción: siempre falta algo. Una lista que sólo
-- pueda estar abierta o cerrada obliga a cerrarla con renglones sin surtir —y
-- entonces nadie sabe qué se quedó a deber— o a dejarla abierta para siempre.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table listas_trabajo (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,

  folio               text        not null,
  titulo              text        not null check (length(trim(titulo)) > 0),
  cliente_id          uuid        references clientes (id) on delete set null,
  obra_id             uuid        references obras (id) on delete set null,
  nombre_libre        text,
  telefono_libre      text,

  estado              text        not null default 'abierta',
  -- La nota que la surtió, cuando ya se armó. Puede haber varias a lo largo de
  -- una semana: por eso vive en la línea y no aquí. Ésta es la última.
  orden_id            uuid        references ordenes (id) on delete set null,

  capturada_en        timestamptz not null default now(),
  capturada_por       uuid        references empleos (id) on delete set null,
  cerrada_en          timestamptz,
  nota                text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint lista_estado_valido check (
    estado in ('abierta', 'parcial', 'surtida', 'cancelada')
  ),
  constraint lista_cerrada_con_fecha check (
    estado not in ('surtida', 'cancelada') or cerrada_en is not null
  ),
  constraint lista_con_alguien check (
    cliente_id is not null or (nombre_libre is not null and length(trim(nombre_libre)) > 0)
  ),
  unique (organizacion_id, folio)
);

comment on table listas_trabajo is
  'F-153 · El papel del albañil. No es una cotización: no lleva vigencia ni se aprueba. Confundirlas obliga a cotizar para poder surtir.';

create index listas_trabajo_vivas
  on listas_trabajo (organizacion_id, sucursal_id, capturada_en desc)
  where estado in ('abierta', 'parcial');

create trigger listas_trabajo_tocar_updated_at
  before update on listas_trabajo for each row execute function tocar_updated_at();

create table lineas_lista_trabajo (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  lista_id            uuid        not null references listas_trabajo (id) on delete cascade,
  orden_visual        int         not null default 0,

  -- LO QUE PIDIERON, tal cual se dijo. Se conserva siempre y nunca se deriva:
  -- es lo único que resuelve «yo pedí varilla del 3, no del 4».
  texto_pedido        text        not null check (length(trim(texto_pedido)) > 0),

  -- La traducción, cuando el mostradorista la hace. En `null` mientras el
  -- renglón sigue siendo un papel.
  producto_id         uuid        references productos (id) on delete set null,
  cantidad            numeric(14, 4),
  unidad              text,

  surtida             numeric(14, 4) not null default 0 check (surtida >= 0),
  orden_linea_id      uuid        references orden_lineas (id) on delete set null,
  sin_existencia      boolean     not null default false,
  nota                text,
  created_at          timestamptz not null default now(),

  -- Una cantidad sin producto es un número sin unidad de medida: o van los dos
  -- o no va ninguno.
  constraint linea_lista_traducida_completa check (
    (producto_id is null and cantidad is null)
    or (producto_id is not null and cantidad is not null and cantidad > 0 and unidad is not null)
  ),
  constraint linea_lista_no_sobresurtida check (cantidad is null or surtida <= cantidad)
);

comment on column lineas_lista_trabajo.texto_pedido is
  'Lo que dijo el albañil, tal cual. Se conserva aunque ya esté traducido: es lo único que resuelve la discusión de la tarde sobre qué se pidió.';
comment on column lineas_lista_trabajo.sin_existencia is
  'Marcado cuando no hay y hay que pedirlo. Es lo que convierte una lista a medias en un pedido a proveedor, en vez de en un renglón que alguien tiene que recordar.';

create index lineas_lista_por_lista
  on lineas_lista_trabajo (lista_id, orden_visual);
-- Lo que se quedó a deber, para el pedido al proveedor del lunes.
create index lineas_lista_sin_surtir
  on lineas_lista_trabajo (organizacion_id, producto_id)
  where sin_existencia;

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

  foreach t in array array['listas_trabajo', 'lineas_lista_trabajo']
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
