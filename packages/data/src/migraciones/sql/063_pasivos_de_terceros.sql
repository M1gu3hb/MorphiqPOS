-- 063 · UN ledger para el dinero que pasa por el cajón y NO es del negocio.
--
-- ── Lo que descubrió la reconciliación del catálogo ────────────────────────
-- Cuatro funciones que cinco agentes propusieron por separado resultaron ser
-- cuatro PANTALLAS sobre un mismo objeto:
--
--   F-254  abono de fiado            abarrotes, ferreteria
--   F-255  recarga, recibo, paquete  abarrotes
--   F-256  depósito de envase        abarrotes
--   F-260  propina en tarjeta        estetica-salon
--
-- `estetica-salon` ya lo había visto y lo dejó escrito: «es, mecánicamente, el
-- mismo objeto que F-256». En los cuatro entra dinero al cajón, en los cuatro
-- ese dinero NO es del negocio, y en los cuatro hay que devolverlo o entregarlo.
--
-- Escritos cuatro veces se descuadran de cuatro formas distintas. Uno solo.
--
-- ── La regla de dinero que gobierna esta tabla ─────────────────────────────
-- **Nada de lo que entra aquí es venta.** No suma a ventas, no suma a utilidad,
-- no suma a margen y no entra al costo. Es exactamente el mismo trato que las
-- propinas, y por la misma razón: el dinero está en el cajón y no es del
-- negocio. Si entrara como venta, el margen reportado se destruye — que es lo
-- que hoy pasa en `abarrotes` con las recargas, donde la mitad de lo que pasa
-- por el cajón no es suyo.
--
-- ── Por qué es un LEDGER y no un saldo ─────────────────────────────────────
-- Mismo patrón que `movimientos_stock`, y por la misma razón: un saldo que
-- cambia solo después de que alguien lo vio destruye la confianza en el sistema
-- entero, aunque el número final sea correcto. Se apunta el movimiento, el
-- saldo se deriva, y una corrección es una contrapartida con motivo y autor,
-- nunca un `update`.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ───────────────────────────────

create table pasivos_terceros (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        references sucursales (id),

  -- Qué clase de dinero ajeno es. Decide la pantalla, el reporte y a quién se
  -- le debe, pero NO la mecánica: la mecánica es la misma para los cuatro.
  naturaleza      text        not null,

  -- A quién se le debe. Es polimórfico a propósito: un casco se le debe a quien
  -- traiga el envase (sin titular), una propina de tarjeta a un empleo concreto,
  -- y un abono de fiado baja el saldo de un cliente.
  titular_tipo    text        not null,
  titular_id      uuid,

  -- Firmado. POSITIVO = el negocio contrae la deuda (entra dinero ajeno).
  -- NEGATIVO = la salda (se devuelve o se entrega). El saldo es la suma.
  monto_centavos  bigint      not null,

  -- De dónde salió. Una entrada de pasivo sin referencia al cobro que la generó
  -- es un número que nadie va a poder explicar en el corte.
  referencia_tipo text,
  referencia_id   uuid,

  -- El movimiento de caja gemelo. El dinero entró al cajón: si no queda atado,
  -- el arqueo no puede explicar de dónde salió — que es el descuadre número uno
  -- de `abarrotes` y de `estetica-salon`, los dos.
  movimiento_caja_id uuid     references movimientos_caja (id),
  sesion_caja_id  uuid        references sesiones_caja (id),

  motivo          text,
  empleado_id     uuid        references empleos (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint pasivos_naturaleza_valida check (
    naturaleza in (
      'credito_cliente',      -- F-254 · abono de fiado o de crédito
      'servicio_terceros',    -- F-255 · recarga, recibo de luz, paquetería
      'envase_retornable',    -- F-256 · casco de botella o garrafón
      'propina_por_entregar', -- F-260 · propina de tarjeta hacia el profesional
      'anticipo_cliente'      -- F-414 · anticipo que asegura una cita
    )
  ),

  constraint pasivos_titular_valido check (
    titular_tipo in ('cliente', 'empleo', 'proveedor', 'portador')
  ),

  -- «portador» es quien traiga el envase: no se sabe quién es y por eso NO
  -- lleva id. Los demás sí, o el saldo no se le puede cobrar a nadie.
  constraint pasivos_titular_identificado check (
    (titular_tipo = 'portador' and titular_id is null)
    or (titular_tipo <> 'portador' and titular_id is not null)
  ),

  -- Un movimiento en cero no dice nada y ensucia el ledger.
  constraint pasivos_monto_no_cero check (monto_centavos <> 0)
);

comment on table pasivos_terceros is
  'Ledger INMUTABLE del dinero que entra al cajón y no es del negocio: fiado, servicios de terceros, envases y propina por entregar. Nada de esto es venta, utilidad ni margen.';
comment on column pasivos_terceros.monto_centavos is
  'Firmado. Positivo = se contrae la deuda (entra dinero ajeno). Negativo = se salda. El saldo es la suma; nunca hay UPDATE.';
comment on column pasivos_terceros.movimiento_caja_id is
  'El movimiento de caja gemelo. Sin él, el arqueo no puede explicar de dónde salió el dinero: es el descuadre número uno de abarrotes y de estética.';

-- El saldo por titular se consulta constantemente —antes de fiar, al entregar
-- propina, al devolver un casco— y sin este índice recorre el ledger entero.
create index pasivos_por_titular
  on pasivos_terceros (organizacion_id, naturaleza, titular_tipo, titular_id);

create index pasivos_por_sesion
  on pasivos_terceros (sesion_caja_id)
  where sesion_caja_id is not null;

/**
 * El saldo vivo. Es una VISTA porque derivarlo del ledger es lo que impide que
 * un saldo y sus movimientos discrepen.
 */
create view saldos_pasivos as
select
  p.organizacion_id,
  p.naturaleza,
  p.titular_tipo,
  p.titular_id,
  sum(p.monto_centavos)::bigint as saldo_centavos,
  max(p.created_at)             as ultimo_movimiento,
  count(*)::int                 as movimientos
from pasivos_terceros p
group by p.organizacion_id, p.naturaleza, p.titular_tipo, p.titular_id
having sum(p.monto_centavos) <> 0;

comment on view saldos_pasivos is
  'Saldo vivo por titular, derivado del ledger. Los saldos en cero no aparecen: una deuda saldada no es una deuda.';

alter view saldos_pasivos set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table pasivos_terceros enable row level security;
  alter table pasivos_terceros force row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table pasivos_terceros from %s', roles_publicos);
    execute format('revoke all privileges on saldos_pasivos from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    -- SIN update ni delete: el ledger es inmutable. Una corrección es una
    -- contrapartida, no una edición.
    grant select, insert on table pasivos_terceros to morphiqpos_app;
    grant select on saldos_pasivos to morphiqpos_app;
  end if;
end;
$$;
