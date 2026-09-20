-- 138 · El anticipo de la cita y el paquete de sesiones (F-414, F-419).
--
-- ── Por qué el anticipo, y por qué ahora ─────────────────────────────────
-- Entre el 15 % y el 20 % de las citas no llegan, y la capacidad de un salón no
-- se recupera: el martes a las once ya pasó. El anticipo es lo único que
-- convierte una intención en un compromiso, y el giro ya sabe cuánto: 20-30 %
-- en servicio estándar, hasta 50 % en los caros o largos.
--
-- ── El anticipo es dinero AJENO hasta que el servicio ocurre ─────────────
-- Entra al cajón el jueves por un servicio del sábado. Contarlo como venta del
-- jueves adelanta el ingreso, el IVA y —peor— la comisión de una profesional
-- que todavía no ha trabajado. Vive como pasivo con su propio movimiento y se
-- aplica el día que el servicio se cobra.
--
-- ── El `unique` parcial del anticipo VIVO ────────────────────────────────
-- Una cita no puede tener dos anticipos vivos a la vez. Sin esto, dos capturas
-- del mismo pago —que es lo que pasa cuando la terminal tarda y alguien vuelve
-- a cobrar— dejan a la clienta con crédito doble y al corte con un descuadre
-- que nadie encuentra. Es parcial porque los devueltos y los aplicados SÍ se
-- acumulan: son historia y no se borran.
--
-- ── El paquete se vende una vez y se consume en sesiones ─────────────────
-- «Diez sesiones de láser» es dinero cobrado por adelantado por trabajo que
-- ocupará diez huecos de agenda a lo largo de medio año. Sin `sesiones_paquete`
-- nadie sabe cuántas quedan: ni la clienta, ni la profesional, ni la dueña, que
-- es quien tiene ese pasivo en la caja sin verlo.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table anticipos_cita (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cita_id             uuid        not null references citas (id) on delete cascade,
  cliente_id          uuid        references clientes (id) on delete set null,

  monto_centavos      bigint      not null check (monto_centavos > 0),
  metodo              text        not null,
  estado              text        not null default 'vivo',

  movimiento_caja_id  uuid        references movimientos_caja (id),
  sesion_caja_id      uuid        references sesiones_caja (id),
  -- Cuando se aplica, la orden que lo consumió. Cuando se retiene, queda en
  -- `null` y el motivo lo cuenta el no-show de la 140.
  orden_id            uuid        references ordenes (id) on delete set null,

  recibido_en         timestamptz not null default now(),
  recibido_por        uuid        references empleos (id) on delete set null,
  resuelto_en         timestamptz,
  motivo_resolucion   text,
  created_at          timestamptz not null default now(),

  constraint anticipo_metodo_valido check (
    metodo in ('efectivo', 'tarjeta', 'transferencia')
  ),
  constraint anticipo_estado_valido check (
    estado in ('vivo', 'aplicado', 'devuelto', 'retenido')
  ),
  -- Salir del estado `vivo` es una decisión de alguien y lleva fecha. Sin ella,
  -- un anticipo retenido no se distingue de uno que nadie tocó.
  constraint anticipo_resuelto_con_fecha check (
    estado = 'vivo' or resuelto_en is not null
  ),
  constraint anticipo_aplicado_con_orden check (
    estado <> 'aplicado' or orden_id is not null
  )
);

comment on table anticipos_cita is
  'F-414 · El anticipo es dinero AJENO hasta que el servicio ocurre. Contarlo como venta del día que entra adelanta el ingreso, el IVA y la comisión de quien todavía no ha trabajado.';

-- ★ Una cita, UN anticipo vivo. Es parcial a propósito: los devueltos y los
-- aplicados sí se acumulan —son historia— y sólo el vivo es excluyente.
create unique index anticipo_vivo_unico
  on anticipos_cita (cita_id) where estado = 'vivo';

create index anticipos_por_cliente
  on anticipos_cita (organizacion_id, cliente_id, recibido_en desc);

create table paquetes_vendidos (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  cliente_id          uuid        not null references clientes (id) on delete restrict,
  producto_id         uuid        not null references productos (id) on delete restrict,
  orden_id            uuid        references ordenes (id) on delete set null,

  sesiones_totales    smallint    not null check (sesiones_totales between 1 and 100),
  -- Se guarda además de poder contarse, porque la consulta de mostrador es
  -- «¿cuántas le quedan?» con la clienta enfrente y no admite un recuento.
  sesiones_usadas     smallint    not null default 0 check (sesiones_usadas >= 0),
  precio_centavos     bigint      not null check (precio_centavos >= 0),

  vendido_en          timestamptz not null default now(),
  vence_en            date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint paquete_no_sobreconsumido check (sesiones_usadas <= sesiones_totales)
);

comment on table paquetes_vendidos is
  'F-419 · Dinero cobrado por adelantado por trabajo que ocupará huecos de agenda durante medio año. Es un pasivo en la caja que hoy nadie ve.';
comment on column paquetes_vendidos.sesiones_usadas is
  'Se guarda además de poder contarse: la consulta del mostrador es «¿cuántas le quedan?» con la clienta enfrente, y eso no admite un recuento.';

create index paquetes_con_saldo
  on paquetes_vendidos (organizacion_id, cliente_id)
  where sesiones_usadas < sesiones_totales;

create trigger paquetes_tocar_updated_at
  before update on paquetes_vendidos for each row execute function tocar_updated_at();

create table sesiones_paquete (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  paquete_id          uuid        not null references paquetes_vendidos (id) on delete cascade,
  cita_servicio_id    uuid        references cita_servicios (id) on delete set null,
  numero              smallint    not null check (numero >= 1),

  consumida_en        timestamptz not null default now(),
  consumida_por       uuid        references empleos (id) on delete set null,

  -- La sesión número tres de un paquete existe una sola vez. Sin esto, dos
  -- capturas del mismo día gastan dos sesiones por un servicio.
  unique (paquete_id, numero)
);

comment on table sesiones_paquete is
  'F-419 · Cada sesión consumida, con su número. El unique es lo que impide que un servicio gaste dos sesiones cuando alguien captura dos veces.';

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

  foreach t in array array['anticipos_cita', 'paquetes_vendidos', 'sesiones_paquete']
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
