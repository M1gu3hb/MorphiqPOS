-- 163 · La cotización y su seguimiento (F-600 a F-607).
--
-- ── Por qué esta migración está en el rango 160 y no en el de ferretería ─
-- El plan de `ferreteria` numeró sus migraciones del 110 al 121 y no dejó hueco
-- para la cotización, aunque sus ocho funciones sí están declaradas. Meterla
-- entre las existentes obligaría a renumerar cinco archivos ya escritos; el
-- rango 160-199, reservado para lo transversal, existe exactamente para esto.
--
-- ── El dolor, con sus palabras ───────────────────────────────────────────
-- «La venta grande se cotiza en una hoja de Excel y se pierde el seguimiento. No
-- se sabe cuántas se ganan ni cuántas se pierden ni por qué.» Las tres partes
-- de esa frase son tres columnas: el documento, su estado, y el motivo.
--
-- ── La VERSIÓN es una fila nueva, nunca una edición ──────────────────────
-- Cotizar una obra son tres o cuatro vueltas: se quita una partida, se cambia
-- una medida, se pide descuento. Editar en sitio haría que la versión que el
-- cliente aprobó dejara de existir, y la discusión de la entrega —«yo aprobé
-- otra cosa»— no se podría resolver con nada. Cada versión apunta a la
-- anterior y sólo la última está viva.
--
-- ── La VIGENCIA no es decoración: es el margen ───────────────────────────
-- El acero cambia de precio cada semana. Una cotización sin fecha de caducidad
-- se honra tres meses después al precio de entonces, y esa venta grande —la que
-- se celebró— se cierra en pérdida. Por eso `vence_el` es obligatorio.
--
-- ── Y el SURTIDO PARCIAL es el caso normal ───────────────────────────────
-- Se convierte a pedido y se entrega en tres viajes, porque nunca está todo. La
-- cantidad surtida vive en la línea y no en el documento: preguntarle al
-- documento «¿ya está completo?» obliga a recorrer las líneas, y es la pregunta
-- que se hace cuando el camión ya está cargado.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table cotizaciones (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,

  folio               text        not null,
  version             int         not null default 1 check (version >= 1),
  -- F-601 · A qué versión sustituye. `null` en la primera.
  version_anterior_id uuid        references cotizaciones (id) on delete set null,
  vigente             boolean     not null default true,

  cliente_id          uuid        references clientes (id) on delete set null,
  obra_id             uuid        references obras (id) on delete set null,
  nombre_libre        text,
  correo_libre        text,
  telefono_libre      text,

  estado              text        not null default 'borrador',
  -- F-600 · Obligatoria. El acero cambia de precio cada semana, y una
  -- cotización sin caducidad se honra tres meses después en pérdida.
  vence_el            date        not null,

  subtotal_centavos   bigint      not null default 0 check (subtotal_centavos >= 0),
  descuento_centavos  bigint      not null default 0 check (descuento_centavos >= 0),
  impuestos_centavos  bigint      not null default 0 check (impuestos_centavos >= 0),
  total_centavos      bigint      not null default 0 check (total_centavos >= 0),

  -- F-604 · La orden en que se convirtió, cuando se ganó.
  orden_id            uuid        references ordenes (id) on delete set null,
  -- F-607 · Por qué se perdió. Sin esto, «se perdió» no enseña nada.
  motivo_cierre       text,
  competidor          text,

  creada_en           timestamptz not null default now(),
  creada_por          uuid        references empleos (id) on delete set null,
  enviada_en          timestamptz,
  aprobada_en         timestamptz,
  cerrada_en          timestamptz,
  updated_at          timestamptz not null default now(),

  constraint cotizacion_estado_valido check (
    estado in ('borrador', 'enviada', 'aprobada', 'ganada', 'perdida', 'vencida')
  ),
  -- F-602 · «Enviada» sin fecha de envío no se puede perseguir: el seguimiento
  -- entero es «¿a quién no le hemos marcado desde hace cuatro días?».
  constraint cotizacion_enviada_con_fecha check (estado <> 'enviada' or enviada_en is not null),
  constraint cotizacion_aprobada_con_fecha check (estado <> 'aprobada' or aprobada_en is not null),
  -- F-604 · Ganada es que se convirtió: sin orden, es un deseo.
  constraint cotizacion_ganada_con_orden check (
    estado <> 'ganada' or (orden_id is not null and cerrada_en is not null)
  ),
  -- F-607 · Perdida SIN MOTIVO es el estado de hoy, y es el que no enseña nada.
  constraint cotizacion_perdida_con_motivo check (
    estado <> 'perdida'
    or (motivo_cierre is not null and length(trim(motivo_cierre)) > 0 and cerrada_en is not null)
  ),
  -- O ficha, o nombre a mano: una cotización que no se le puede mandar a nadie
  -- no es una cotización.
  constraint cotizacion_con_alguien check (
    cliente_id is not null or (nombre_libre is not null and length(trim(nombre_libre)) > 0)
  ),
  unique (organizacion_id, folio, version)
);

comment on table cotizaciones is
  'F-600 a F-607 · La venta grande que hoy vive en una hoja de Excel. La versión es una fila nueva y nunca una edición: la que el cliente aprobó tiene que seguir existiendo el día de la entrega.';
comment on column cotizaciones.vence_el is
  'F-600 · Obligatorio. El acero cambia de precio cada semana: una cotización sin caducidad se honra tres meses después al precio de entonces, y la venta que se celebró se cierra en pérdida.';
comment on column cotizaciones.motivo_cierre is
  'F-607 · «Se perdió» sin motivo no enseña nada. Con motivo, tres meses de cotizaciones perdidas dicen si el problema es el precio, el plazo o que no se marcó a tiempo.';

-- Sólo una versión viva por folio. Sin esto, dos versiones vigentes de la misma
-- cotización son dos precios distintos que el cliente puede elegir.
create unique index cotizacion_version_viva
  on cotizaciones (organizacion_id, folio) where vigente;

-- El seguimiento: a quién no se le ha marcado, y qué está por vencer.
create index cotizaciones_en_juego
  on cotizaciones (organizacion_id, estado, vence_el)
  where estado in ('enviada', 'aprobada');

create trigger cotizaciones_tocar_updated_at
  before update on cotizaciones for each row execute function tocar_updated_at();

create table cotizacion_lineas (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cotizacion_id       uuid        not null references cotizaciones (id) on delete cascade,
  orden_visual        int         not null default 0,

  producto_id         uuid        references productos (id) on delete set null,
  descripcion         text        not null check (length(trim(descripcion)) > 0),
  cantidad            numeric(14, 4) not null check (cantidad > 0),
  unidad              text        not null,
  -- CONGELADO al cotizar. Es lo que se honra mientras la cotización viva, y por
  -- eso no apunta al precio del catálogo.
  precio_unitario_centavos bigint not null check (precio_unitario_centavos >= 0),
  total_centavos      bigint      not null check (total_centavos >= 0),

  -- F-605 · Cuánto se ha entregado ya. Vive en la LÍNEA: preguntarle al
  -- documento «¿ya está completo?» obliga a recorrerlas, y es la pregunta que
  -- se hace con el camión cargado.
  surtida             numeric(14, 4) not null default 0 check (surtida >= 0),
  created_at          timestamptz not null default now(),

  constraint cotizacion_linea_no_sobresurtida check (surtida <= cantidad)
);

comment on column cotizacion_lineas.precio_unitario_centavos is
  'Congelado al cotizar. Es lo que se honra mientras la cotización viva: apuntar al catálogo haría que el precio cambiara entre el envío y la aprobación.';

create index cotizacion_lineas_por_documento
  on cotizacion_lineas (cotizacion_id, orden_visual);
-- Lo que falta por entregar de lo ya ganado: la lista del almacén.
create index cotizacion_lineas_por_surtir
  on cotizacion_lineas (organizacion_id, cotizacion_id)
  where surtida < cantidad;

create table cotizacion_eventos (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cotizacion_id       uuid        not null references cotizaciones (id) on delete cascade,

  tipo                text        not null,
  medio               text,
  nota                text,
  ocurrio_en          timestamptz not null default now(),
  empleado_id         uuid        references empleos (id) on delete set null,

  constraint cotizacion_evento_tipo_valido check (
    tipo in ('creada', 'enviada', 'vista', 'aprobada', 'rechazada', 'recordatorio', 'convertida')
  ),
  constraint cotizacion_evento_medio_valido check (
    medio is null or medio in ('correo', 'whatsapp', 'impresa', 'mostrador')
  )
);

comment on table cotizacion_eventos is
  'F-602 y F-603 · El rastro: cuándo se mandó, por dónde, y cuándo contestaron. Sin él, «le mandé la cotización» es una afirmación que nadie puede comprobar tres semanas después.';

create index cotizacion_eventos_por_documento
  on cotizacion_eventos (cotizacion_id, ocurrio_en desc);

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

  foreach t in array array['cotizaciones', 'cotizacion_lineas', 'cotizacion_eventos']
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
