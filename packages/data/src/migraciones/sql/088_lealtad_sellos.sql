-- 088 · F-930, F-934 y F-936 · Los sellos, el canje, y lo que se debe por ellos.
--
-- ── Por qué en una cafetería esto ES el negocio ───────────────────────────
-- «La tarjeta de cartón se pierde, se falsifica y no se mide. En una cafetería
-- de barrio la recurrencia **es** el negocio, y hoy no hay un solo dato sobre
-- ella.» No es un programa de puntos: es la diferencia entre un cliente que
-- viene tres veces por semana y uno que vino una vez.
--
-- ── El saldo es una PROYECCIÓN del ledger, igual que el stock ─────────────
-- `lealtad_saldos` es caché con índice, no la verdad. La verdad está en
-- `lealtad_movimientos` y se puede reconstruir sumando. Es la misma decisión que
-- se tomó con `movimientos_stock` y por la misma razón: **un saldo escribible es
-- un saldo que alguien va a "arreglar"**, y el día que lo arregle nadie va a
-- poder decir por qué la clienta tenía cinco sellos y ahora tiene nueve.
--
-- ── Y el pasivo (F-936) NO es una columna ─────────────────────────────────
-- Es una consulta: `sellos vivos / sellos_por_premio × costo del premio`. Cambia
-- con cada venta, y un pasivo guardado se desincroniza el primer día. Se
-- materializa como VISTA para que el corte lo lea sin recalcularlo a mano en
-- dos sitios distintos.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── 1 · El ledger. Inmutable, como todos los de este sistema ──────────────
create table lealtad_movimientos (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        references sucursales (id),
  cliente_id      uuid        not null references clientes (id) on delete cascade,

  tipo            text        not null,
  -- Firmado: `+1` al otorgar, `−5` al canjear. El saldo es la SUMA, y así no hay
  -- una expresión con ramas que alguien pueda escribir mal en un reporte.
  sellos          integer     not null,

  orden_id        uuid        references ordenes (id) on delete set null,
  -- Qué se canjeó, y cuánto costaba ESE DÍA. Congelado: el premio de hace un año
  -- se valuó con el costo de hace un año, no con el de hoy.
  producto_id     uuid        references productos (id) on delete set null,
  costo_centavos  bigint,

  motivo          text,
  empleado_id     uuid        not null references empleos (id),
  created_at      timestamptz not null default now(),

  constraint lealtad_tipo_valido check (tipo in ('otorga', 'canje', 'ajuste', 'caduca')),
  -- Un movimiento de cero no dice nada y ensucia el ledger.
  constraint lealtad_sellos_no_cero check (sellos <> 0),
  -- Otorgar SUMA, canjear y caducar RESTAN. Un ajuste puede ir en las dos
  -- direcciones, y por eso es el único que exige motivo.
  constraint lealtad_signo_coherente check (
    case
      when tipo = 'otorga' then sellos > 0
      when tipo in ('canje', 'caduca') then sellos < 0
      else true
    end
  ),
  constraint lealtad_ajuste_con_motivo check (
    tipo <> 'ajuste' or (motivo is not null and length(btrim(motivo)) > 0)
  ),
  -- Un canje sin producto es un premio que nadie puede nombrar seis meses
  -- después, y el pasivo no se puede valuar.
  constraint lealtad_canje_con_producto check (
    tipo <> 'canje' or (producto_id is not null and costo_centavos is not null)
  )
);

comment on table lealtad_movimientos is
  'F-930/F-934 · Ledger INMUTABLE de sellos. La verdad está aquí; lealtad_saldos es caché.';
comment on column lealtad_movimientos.sucursal_id is
  'Dónde ocurrió. Está en el MOVIMIENTO y no en el saldo a propósito: el sello se gana en un local y se canjea en cualquiera. El saldo es del negocio.';

create index lealtad_movimientos_por_cliente
  on lealtad_movimientos (organizacion_id, cliente_id, created_at desc);

-- ── 2 · El saldo, que es caché ────────────────────────────────────────────
create table lealtad_saldos (
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  cliente_id      uuid        not null references clientes (id) on delete cascade,
  sellos          integer     not null default 0,
  canjes_totales  integer     not null default 0,
  actualizado_en  timestamptz not null default now(),

  primary key (organizacion_id, cliente_id),

  -- El saldo NUNCA baja de cero. Si el trigger lo intentara, es que se canjeó
  -- sin saldo, y eso es un premio regalado que nadie va a poder explicar.
  constraint lealtad_saldos_no_negativo check (sellos >= 0),
  constraint lealtad_canjes_no_negativos check (canjes_totales >= 0)
);

comment on table lealtad_saldos is
  'Proyección de lealtad_movimientos. Caché con índice, no la verdad: se puede reconstruir sumando el ledger.';

-- ── 3 · El trigger que mantiene la proyección ─────────────────────────────
--
-- En la base y no en el comando, por la misma razón que el saldo de existencias:
-- dos cobros simultáneos del mismo cliente tienen que sumar dos sellos, y eso
-- sólo lo garantiza un `on conflict do update` dentro de la misma transacción
-- que escribe el ledger.
create or replace function lealtad_proyectar_saldo() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into lealtad_saldos (organizacion_id, cliente_id, sellos, canjes_totales, actualizado_en)
  values (
    new.organizacion_id,
    new.cliente_id,
    new.sellos,
    case when new.tipo = 'canje' then 1 else 0 end,
    new.created_at
  )
  on conflict (organizacion_id, cliente_id) do update
  set sellos = lealtad_saldos.sellos + excluded.sellos,
      canjes_totales = lealtad_saldos.canjes_totales + excluded.canjes_totales,
      actualizado_en = excluded.actualizado_en;

  return new;
end;
$$;

create trigger lealtad_movimientos_proyectan
  after insert on lealtad_movimientos
  for each row execute function lealtad_proyectar_saldo();

-- ── 4 · El ledger no se corrige: se compensa ──────────────────────────────
--
-- Mismo cerrojo que la 063 le puso a `pasivos_terceros`. Una corrección es una
-- contrapartida con su motivo y su autor, nunca un `update` — que borraría la
-- historia que la clienta puede reclamar en el mostrador.
create or replace function lealtad_movimientos_inmutables() returns trigger
language plpgsql
as $$
begin
  raise exception 'lealtad_movimientos es inmutable: una corrección es un ajuste con motivo, no un update'
    using errcode = 'restrict_violation';
end;
$$;

create trigger lealtad_movimientos_sin_update
  before update or delete on lealtad_movimientos
  for each row execute function lealtad_movimientos_inmutables();

-- ── 5 · Cuántos sellos da cada producto ───────────────────────────────────
alter table productos add column sellos_otorga integer not null default 0;

alter table productos
  add constraint productos_sellos_no_negativos check (sellos_otorga >= 0);

comment on column productos.sellos_otorga is
  'F-930 · Un latte da 1; una bolsa de grano da 0. Que la bolsa no dé sellos es una decisión de margen, no un olvido.';

-- ── 6 · El pasivo, como vista ─────────────────────────────────────────────
create view lealtad_pasivo as
select
  s.organizacion_id,
  sum(s.sellos)::bigint as sellos_vivos,
  count(*)::int         as clientes_con_saldo,
  -- El costo del premio se toma del ÚLTIMO canje de la organización: es el dato
  -- real de lo que cuesta el premio hoy, y no una estimación de configuración
  -- que nadie actualiza.
  coalesce(
    (select m.costo_centavos
       from lealtad_movimientos m
      where m.organizacion_id = s.organizacion_id
        and m.tipo = 'canje'
      order by m.created_at desc
      limit 1),
    0
  )::bigint as costo_premio_centavos
from lealtad_saldos s
where s.sellos > 0
group by s.organizacion_id;

comment on view lealtad_pasivo is
  'F-936 · Lo que el negocio debe en premios. Es una consulta y no una columna: cambia con cada venta y un pasivo guardado se desincroniza el primer día.';

alter view lealtad_pasivo set (security_invoker = on);

-- ── 7 · RLS ───────────────────────────────────────────────────────────────
alter table lealtad_movimientos enable row level security;
alter table lealtad_movimientos force row level security;
alter table lealtad_saldos enable row level security;
alter table lealtad_saldos force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format(
      'revoke all privileges on table lealtad_movimientos, lealtad_saldos from %s',
      roles_publicos
    );
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert on table lealtad_movimientos to morphiqpos_app;
    grant select on table lealtad_saldos to morphiqpos_app;
  end if;
end;
$$;
