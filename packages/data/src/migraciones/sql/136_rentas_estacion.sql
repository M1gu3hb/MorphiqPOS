-- 136 · La renta de estación (F-441).
--
-- ── El modelo de negocio que el sistema no sabía nombrar ─────────────────
-- En una parte de los salones la estilista no es empleada ni comisionista:
-- RENTA la silla. Paga fijo por semana o por mes, cobra ella sus servicios y el
-- salón no toca ese dinero. Sin esto, el salón mete a esas personas como
-- empleadas con comisión del 100 %, y entonces sus servicios inflan la venta
-- del negocio, el IVA que reporta y el impuesto que paga por dinero que nunca
-- entró al cajón.
--
-- ── Por qué la renta se COBRA y no se «descuenta» ────────────────────────
-- La 130 ya lo dijo en `profesional_renta_sin_comision`: quien renta no tiene
-- regla de comisión. Su renta no es una línea de su liquidación —no hay
-- liquidación— sino un cobro con su propio movimiento de caja. Colgarla de la
-- liquidación obligaría a inventar una liquidación de cero pesos cada semana
-- sólo para poder restarle la renta.
--
-- ── Y por qué el periodo es un RANGO y no una fecha ──────────────────────
-- Para que dos cobros del mismo periodo no puedan existir. Una renta cobrada
-- dos veces es la discusión más cara que puede tener un salón con alguien que
-- no depende de él: no hay nómina donde ajustarlo.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table rentas_estacion (
  id                 uuid        primary key default gen_random_uuid(),
  organizacion_id    uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id        uuid        references sucursales (id) on delete cascade,
  profesional_id     uuid        not null references profesionales (id) on delete restrict,
  recurso_id         uuid        references recursos (id) on delete set null,

  monto_centavos     bigint      not null check (monto_centavos > 0),
  periodicidad       text        not null,
  -- El día en que toca. Con `semanal` es el día de la semana (0 = domingo);
  -- con lo demás, el día del mes de 1 a 28 —el 31 no existe en febrero, y quien
  -- paga «el 31» se quedaría sin fecha de cobro cuatro meses al año—.
  dia_de_cobro       smallint    not null,

  vigente_desde      date        not null,
  vigente_hasta      date,
  activa             boolean     not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint renta_periodicidad_valida check (periodicidad in ('semanal', 'quincenal', 'mensual')),
  constraint renta_dia_coherente check (
    (periodicidad = 'semanal' and dia_de_cobro between 0 and 6)
    or (periodicidad <> 'semanal' and dia_de_cobro between 1 and 28)
  ),
  constraint renta_vigencia_coherente check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  )
);

comment on table rentas_estacion is
  'F-441 · Lo que paga quien RENTA la silla. Sin esta tabla el salón mete a esas personas como comisionistas del 100 %, y su venta —que nunca entró al cajón— infla el IVA y el impuesto del negocio.';

create index rentas_vigentes
  on rentas_estacion (organizacion_id, profesional_id, vigente_desde) where activa;

create trigger rentas_estacion_tocar_updated_at
  before update on rentas_estacion for each row execute function tocar_updated_at();

create table cobros_renta (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  renta_id            uuid        not null references rentas_estacion (id) on delete restrict,
  profesional_id      uuid        not null references profesionales (id) on delete restrict,

  periodo             daterange   not null,
  monto_centavos      bigint      not null check (monto_centavos > 0),
  metodo              text        not null,
  movimiento_caja_id  uuid        references movimientos_caja (id),
  sesion_caja_id      uuid        references sesiones_caja (id),

  cobrado_en          timestamptz not null default now(),
  cobrado_por         uuid        references empleos (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint cobro_renta_metodo_valido check (
    metodo in ('efectivo', 'transferencia', 'tarjeta', 'descuento_liquidacion')
  ),
  constraint cobro_renta_periodo_con_duracion check (not isempty(periodo)),

  -- Dos cobros del mismo periodo NO pueden existir. Una renta cobrada dos veces
  -- es la discusión más cara con alguien que no depende del salón: no hay
  -- nómina donde ajustarlo. Necesita `btree_gist`, que la 130 ya instala.
  exclude using gist (renta_id with =, periodo with &&)
);

comment on table cobros_renta is
  'F-441 · Cada cobro de renta, con su periodo. La restricción de exclusión es la que impide cobrar dos veces la misma semana.';

create index cobros_renta_por_profesional
  on cobros_renta (organizacion_id, profesional_id, cobrado_en desc);

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

  foreach t in array array['rentas_estacion', 'cobros_renta']
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
