-- 135 · La liquidación y su salida de caja (F-427, F-259).
--
-- ── La salida más grande del día ─────────────────────────────────────────
-- Cuando el salón le paga a sus estilistas, sale del cajón más dinero que en
-- ninguna otra operación de la semana. Hoy eso sería «gasto: nómina», y el
-- corte no podría explicar por qué bajó el cajón: diría que se gastaron $18,400
-- sin poder decir de quién ni de qué periodo.
--
-- ── Comisión y propina son DOS columnas y no se suman ────────────────────
-- Es la regla 5 del corte (`02-DINERO-Y-CAJA.md` §9.4) y vive AQUÍ, en el
-- esquema, no sólo en la plantilla del PDF. La propina NO es del salón: es de
-- quien la recibió, y el salón sólo la guardó. Sumarlas en un total haría que el
-- gasto de nómina del negocio incluyera dinero que nunca fue suyo, y el margen
-- reportado saldría más bajo de lo que es.
--
-- ── La renta se RESTA, no se cobra aparte ────────────────────────────────
-- A quien renta la estación se le descuenta de lo que se le entrega. Cobrarla
-- por separado obliga a dos movimientos de caja el mismo día con la misma
-- persona, y el arqueo tiene que explicar dos veces la misma conversación.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table liquidaciones (
  id                          uuid        primary key default gen_random_uuid(),
  organizacion_id             uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id                 uuid        references sucursales (id) on delete cascade,
  profesional_id              uuid        not null references profesionales (id) on delete restrict,

  periodo_desde               date        not null,
  periodo_hasta               date        not null,

  comision_centavos           bigint      not null default 0,
  -- SEPARADA. Siempre. No es del salón: es de quien la recibió.
  propina_centavos            bigint      not null default 0 check (propina_centavos >= 0),
  material_cargado_centavos   bigint      not null default 0 check (material_cargado_centavos >= 0),
  -- Se RESTA del total.
  renta_centavos              bigint      not null default 0 check (renta_centavos >= 0),
  -- Lo que ella ya cobró en mano durante el periodo, y que por lo tanto no se
  -- le vuelve a entregar.
  cobrado_por_ella_centavos   bigint      not null default 0 check (cobrado_por_ella_centavos >= 0),
  anticipos_centavos          bigint      not null default 0 check (anticipos_centavos >= 0),
  total_centavos              bigint      not null,

  movimiento_caja_id          uuid        references movimientos_caja (id),
  pagada_en                   timestamptz,
  pagada_por                  uuid        references empleos (id) on delete set null,
  comprobante_url             text,

  created_at                  timestamptz not null default now(),

  constraint liquidacion_periodo_coherente check (periodo_hasta >= periodo_desde),
  -- Pagada sin movimiento de caja es dinero que salió del cajón y no está en
  -- ningún corte. Es la misma regla que el abono de fiado de `abarrotes`.
  constraint liquidacion_pagada_con_movimiento check (
    pagada_en is null or movimiento_caja_id is not null
  ),

  -- Un periodo, una liquidación por persona. Dos son la misma comisión pagada
  -- dos veces, y eso se descubre el mes siguiente cuando el ledger no cuadra.
  unique (organizacion_id, profesional_id, periodo_desde, periodo_hasta)
);

comment on column liquidaciones.propina_centavos is
  'SEPARADA de la comisión, siempre. La propina no es del salón: sumarlas haría que el gasto de nómina incluyera dinero que nunca fue suyo.';
comment on column liquidaciones.renta_centavos is
  'Se RESTA. Cobrarla aparte obliga a dos movimientos de caja el mismo día con la misma persona, y el arqueo explica dos veces la misma conversación.';

create index liquidaciones_por_periodo
  on liquidaciones (organizacion_id, profesional_id, periodo_hasta desc);

-- La referencia que la 133 dejó apuntando a esta tabla.
alter table comisiones_causadas
  add constraint comisiones_liquidacion_fk
  foreign key (liquidacion_id) references liquidaciones (id);

-- ── Los tipos de movimiento de caja que el salón añade ───────────────────
-- La lista COMPLETA VIGENTE otra vez, no la de la 086 con cuatro valores
-- pegados: así escrita se llevaba por delante `devolucion` y `propina`, que
-- llevan ahí desde la 003 y que producción usa.
alter table movimientos_caja drop constraint movimientos_caja_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_tipo_check check (
    tipo in (
      -- 003 · el tronco.
      'apertura', 'venta', 'devolucion', 'gasto', 'retiro', 'deposito', 'ajuste', 'propina',
      -- 086 · el cierre de turno y el fondo de cambio de la cafetería.
      'cierre', 'entrada_cambio',
      -- esta migración · la liquidación, la propina entregada, la renta y el anticipo.
      'liquidacion', 'propina_entregada', 'cobro_renta', 'anticipo_cita'
    )
  );

alter table movimientos_caja drop constraint movimientos_caja_referencia_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_referencia_tipo_check check (
    referencia_tipo in ('orden', 'gasto', 'manual', 'pasivo', 'redondeo',
                        'liquidacion', 'cita', 'renta')
  );

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table liquidaciones enable row level security;
  alter table liquidaciones force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table liquidaciones from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table liquidaciones to morphiqpos_app;
  end if;
end;
$$;
