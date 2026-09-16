-- 139 · La propina V4: directa a la profesional (F-243).
--
-- ── Por qué el salón necesita una CUARTA variante ────────────────────────
-- El tronco ya sabe repartir un bote por puntos de puesto (V1), por mesero (V2)
-- y por horas presentes (V3). Ninguna sirve aquí: en un salón la propina es de
-- QUIEN HIZO EL SERVICIO, con nombre y apellido, y no se reparte con nadie.
-- Meterla al bote sería quitarle a la estilista dinero que la clienta le dejó a
-- ella mirándola a los ojos, y eso se nota en la primera quincena.
--
-- ── Y es dinero AJENO desde que entra ────────────────────────────────────
-- La propina que llega por tarjeta entra al cajón del salón y NO es del salón:
-- es un pasivo con la profesional hasta que se le entrega. Registrarla como
-- ingreso infla la venta, el IVA y la comisión que se calcula sobre esa venta.
-- Por eso vive en su propia tabla y no como una línea más de la orden.
--
-- ── El monto va FIRMADO, y eso no es un detalle ──────────────────────────
-- Lo recibido suma y lo entregado resta, sobre una sola tabla. La alternativa
-- —una tabla de recibidas y otra de entregadas— obliga a restar dos consultas
-- para saber el saldo, y dos consultas que se desincronizan es exactamente
-- cómo se le paga dos veces a alguien.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table movimientos_propina (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  profesional_id      uuid        not null references profesionales (id) on delete restrict,

  orden_id            uuid        references ordenes (id) on delete set null,
  cita_servicio_id    uuid        references cita_servicios (id) on delete set null,

  tipo                text        not null,
  -- Firmado. Ver el encabezado: es lo que hace del saldo una suma sobre una
  -- sola tabla, en vez de la diferencia entre dos que pueden separarse.
  monto_centavos      bigint      not null,
  medio               text        not null,

  liquidacion_id      uuid        references liquidaciones (id),
  movimiento_caja_id  uuid        references movimientos_caja (id),
  entregada_en        timestamptz,
  entregada_por       uuid        references empleos (id) on delete set null,
  nota                text,
  created_at          timestamptz not null default now(),

  constraint propina_tipo_valido check (tipo in ('recibida', 'entregada', 'ajuste')),
  constraint propina_medio_valido check (medio in ('efectivo', 'tarjeta', 'transferencia')),
  -- Un `entregada` positivo haría crecer el saldo cada vez que se paga.
  constraint propina_signo_coherente check (
    (tipo = 'recibida' and monto_centavos > 0)
    or (tipo = 'entregada' and monto_centavos < 0)
    or (tipo = 'ajuste' and monto_centavos <> 0)
  ),
  constraint propina_entregada_con_sello check (
    tipo <> 'entregada' or (entregada_en is not null and entregada_por is not null)
  ),
  -- Un ajuste sin nota es un movimiento anónimo en el dinero de otra persona.
  constraint propina_ajuste_con_nota check (
    tipo <> 'ajuste' or (nota is not null and length(trim(nota)) > 0)
  )
);

comment on table movimientos_propina is
  'F-243 · La propina del salón es de QUIEN hizo el servicio y no se reparte. Y hasta que se entrega es dinero AJENO: contarla como ingreso infla la venta, el IVA y la comisión que se calcula sobre esa venta.';
comment on column movimientos_propina.monto_centavos is
  'Firmado. Lo recibido suma y lo entregado resta, para que el saldo sea una suma sobre una sola tabla y no la diferencia entre dos que pueden desincronizarse.';

-- El saldo por profesional: la consulta del viernes, y la que dice cuánto
-- dinero ajeno hay dentro del cajón ahora mismo.
create index propinas_por_profesional
  on movimientos_propina (organizacion_id, profesional_id, created_at desc);
create index propinas_sin_entregar
  on movimientos_propina (organizacion_id, profesional_id)
  where tipo = 'recibida' and liquidacion_id is null;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table movimientos_propina enable row level security;
alter table movimientos_propina force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table movimientos_propina from %s', roles_publicos);
  end if;

  -- Ni un `delete`: el dinero de otra persona no se borra, se contrapone con un
  -- ajuste que lleva nota y autor.
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table movimientos_propina to morphiqpos_app;
  end if;
end;
$$;
