-- 115 · Crédito de ferretería: obra, autorizados, remisión y cobranza (F-610…F-634).
--
-- ── Las tres puertas por las que se pierde el dinero ─────────────────────
-- Es el dolor 1 de una ferretería y es la parte que ningún punto de venta del
-- segmento modela.
--
-- PUERTA 1 · El contratista tiene tres albañiles con permiso. El cuarto llega,
-- dice «vengo de parte del inge», se lleva $6,000 y firma con un garabato.
-- Cuando llega la cuenta, el ingeniero la desconoce Y TIENE RAZÓN.
--
-- PUERTA 2 · Loera lleva tres obras. Le pagaron la de Las Torres y no la de la
-- colonia. Sin separación por obra, el estado de cuenta es un número grande y
-- la conversación de cobro es imposible. Con separación es «de Las Torres me
-- debes $18,400, y ésa ya te la pagaron». Además el contratista necesita esa
-- separación para su propia contabilidad de obra, y la ferretería que se la da
-- se vuelve difícil de cambiar.
--
-- PUERTA 3 · El material sale a las 7:40 con prisa y el saldo está en una
-- libreta bajo el mostrador. Cuando el dueño lo revisa a las once, ya salió.
--
-- ── Aviso, no muro ───────────────────────────────────────────────────────
-- Nada de esto bloquea, salvo la mora, y la mora siempre tiene llave del dueño.
-- Un sistema que le impida a Beto surtirle a su mejor cliente en una emergencia
-- es un sistema que se apaga esa misma tarde.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table obras (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  -- `restrict` y no `cascade`: borrar un cliente no puede llevarse por delante
  -- las remisiones de tres obras que todavía se están cobrando.
  cliente_id       uuid        not null references clientes (id) on delete restrict,
  nombre           text        not null check (length(trim(nombre)) > 0),
  direccion        text,
  estado           text        not null default 'activa',
  -- Sub-límite DENTRO del límite del cliente. Nulo = sólo aplica el del cliente.
  limite_centavos  bigint      check (limite_centavos is null or limite_centavos >= 0),
  abierta_en       timestamptz not null default now(),
  cerrada_en       timestamptz,

  constraint obra_estado_valido check (estado in ('activa', 'cerrada')),
  constraint obra_cerrada_con_fecha check (estado <> 'cerrada' or cerrada_en is not null),

  unique (cliente_id, nombre)
);

comment on table obras is
  'F-639 · La obra se CIERRA, nunca se borra: las remisiones que cuelgan de ella tienen que poder consultarse años después.';

create index obras_activas on obras (organizacion_id, cliente_id) where estado = 'activa';

create table autorizados_cuenta (
  id                        uuid        primary key default gen_random_uuid(),
  organizacion_id           uuid        not null references organizaciones (id) on delete cascade,
  cliente_id                uuid        not null references clientes (id) on delete restrict,
  -- Nulo significa «todas las obras de este cliente». Es el caso del maestro de
  -- confianza que puede retirar para cualquiera.
  obra_id                   uuid        references obras (id) on delete restrict,
  nombre                    text        not null check (length(trim(nombre)) > 0),
  telefono                  text,
  -- Lo que enseñó al darse de alta. Es lo que se mira cuando se impugna.
  identificacion            text,
  foto_url                  text,
  tope_por_salida_centavos  bigint      check (tope_por_salida_centavos is null or tope_por_salida_centavos > 0),
  activo                    boolean     not null default true,
  dado_de_baja_en           timestamptz,
  -- Quién lo autorizó, y con qué respaldo. Sin esto, la lista es una lista sin
  -- responsable y la impugnación se gana sola.
  alta_por                  uuid        references empleos (id) on delete set null,
  created_at                timestamptz not null default now(),

  constraint autorizado_baja_coherente check (activo or dado_de_baja_en is not null)
);

comment on table autorizados_cuenta is
  'F-638 · Se da de baja, NUNCA se borra. Las remisiones que firmó siguen siendo válidas y auditables; borrarlo rompería la trazabilidad justo del caso que importa, que es la cuenta impugnada.';

create index autorizados_vivos
  on autorizados_cuenta (organizacion_id, cliente_id, obra_id) where activo;

create table remisiones (
  id                            uuid        primary key default gen_random_uuid(),
  organizacion_id               uuid        not null references organizaciones (id) on delete cascade,
  -- UNA orden, UNA remisión. Dos remisiones de la misma entrega son dos
  -- documentos que suman dos veces al saldo del cliente.
  orden_id                      uuid        not null unique references ordenes (id) on delete restrict,
  folio                         text        not null,
  cliente_id                    uuid        not null references clientes (id) on delete restrict,
  obra_id                       uuid        references obras (id) on delete restrict,
  autorizado_id                 uuid        references autorizados_cuenta (id) on delete restrict,

  -- Si no estaba autorizado, se escribe a mano. NUNCA se deja vacío: un
  -- documento de entrega sin nombre de quien recibió no sirve para nada, que es
  -- exactamente el estado de hoy con el talonario de papel carbón.
  nombre_firmante               text        not null check (length(trim(nombre_firmante)) > 0),
  -- EL DATO QUE IMPORTA CUANDO SE IMPUGNA. Se sella en el momento de entregar
  -- y no se deriva después de `autorizado_id`: el autorizado pudo darse de baja
  -- entre la entrega y el pleito, y entonces la derivación mentiría al revés.
  autorizado_estaba_en_lista    boolean     not null,
  firma_url                     text,

  importe_centavos              bigint      not null check (importe_centavos > 0),
  saldo_documento_centavos      bigint      not null check (saldo_documento_centavos >= 0),

  entregada_en                  timestamptz not null default now(),
  entregada_por                 uuid        references empleos (id) on delete set null,

  constraint remision_saldo_no_excede_importe check (saldo_documento_centavos <= importe_centavos),
  unique (organizacion_id, folio)
);

comment on column remisiones.autorizado_estaba_en_lista is
  'El dato que importa cuando se impugna. Se sella al entregar: el autorizado pudo darse de baja entre la entrega y el pleito, y derivarlo después mentiría al revés.';

-- La cartera por obra, que es la consulta de cobranza. Sólo lo que debe algo.
create index remisiones_con_saldo
  on remisiones (organizacion_id, cliente_id, obra_id, entregada_en)
  where saldo_documento_centavos > 0;

-- ── Lo que `clientes` gana ───────────────────────────────────────────────
alter table clientes add column tipo text not null default 'particular';
alter table clientes add constraint cliente_tipo_valido check (
  tipo in ('particular', 'contratista', 'plomero', 'electricista', 'empresa')
);
alter table clientes add column dias_plazo int not null default 0 check (dias_plazo between 0 and 180);
-- El muro por mora. SIEMPRE hay llave y siempre es del dueño.
alter table clientes add column bloqueado_por_mora boolean not null default false;

-- ── Lo que `ordenes` gana ────────────────────────────────────────────────
alter table ordenes add column obra_id uuid references obras (id);
alter table ordenes add column autorizado_id uuid references autorizados_cuenta (id);
-- Quién DESPACHÓ, distinto de quién cobró. En una venta a crédito no hay cobro,
-- así que sin esta columna no queda registro de quién atendió.
alter table ordenes add column mostradorista_id uuid references empleos (id);

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

  foreach t in array array['obras', 'autorizados_cuenta', 'remisiones']
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
