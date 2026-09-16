-- 100 · El arqueo por denominaciones y el saldo de recargas (F-231, F-255).
--
-- ── Por qué contar por billetes y no escribir un total ───────────────────
-- Cuando el arqueo pide un número, quien cierra escribe el que el sistema
-- espera. No por deshonestidad: porque son las diez de la noche, porque contar
-- otra vez toma cinco minutos y porque «ha de estar bien». Y en ese momento el
-- arqueo deja de medir nada.
--
-- Cuando pide denominaciones, el total lo calcula la máquina y la diferencia
-- aparece sola. El cambio no es de precisión: es que ya no se puede escribir el
-- número esperado sin inventar billetes que no están, y eso es una decisión
-- distinta y consciente.
--
-- ── Y por qué se guarda el CONTEO y no sólo el total ─────────────────────
-- Porque un faltante de $500 es una historia y un faltante de veinticinco
-- monedas de $20 es otra. La primera es un billete que se fue; la segunda es
-- cambio que se dio de más durante todo el día. Con el total no se distinguen, y
-- son dos problemas con dos soluciones opuestas.
--
-- ── El saldo de recargas dentro del corte ────────────────────────────────
-- El saldo de las plataformas de recarga es dinero del negocio que no está en el
-- cajón: está en el celular. Cerrar el día sin anotarlo hace que el corte diga
-- que falta dinero cada vez que se compró saldo, y que sobre cuando se vendió.
-- La caja deja de cuadrar por diseño, y a la tercera semana nadie la cuadra.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · El conteo, denominación por denominación ─────────────────────────
create table conteos_denominacion (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sesion_caja_id      uuid        not null references sesiones_caja (id) on delete cascade,

  momento             text        not null,
  -- En CENTAVOS, como todo el dinero: la moneda de 50 centavos es 50 y el
  -- billete de 500 pesos es 50000. Una denominación en pesos aquí volvería a
  -- meter decimales en la única cuenta que no los admite.
  denominacion_centavos bigint    not null check (denominacion_centavos > 0),
  piezas              int         not null check (piezas >= 0),

  contado_en          timestamptz not null default now(),
  contado_por         uuid        references empleos (id) on delete set null,

  constraint conteo_momento_valido check (momento in ('apertura', 'corte', 'cierre')),
  -- Una denominación, una fila, por momento. La segunda captura de los billetes
  -- de $200 es la que duplica el efectivo contado sin que nadie lo vea.
  unique (sesion_caja_id, momento, denominacion_centavos)
);

comment on table conteos_denominacion is
  'F-231 · El total lo calcula la máquina. Cuando el arqueo pide un número, quien cierra escribe el que el sistema espera —no por deshonestidad, sino porque son las diez de la noche— y entonces el arqueo deja de medir nada.';
comment on column conteos_denominacion.piezas is
  'Un faltante de $500 es un billete que se fue; veinticinco monedas de $20 es cambio dado de más durante todo el día. Con el total no se distinguen, y son dos problemas con soluciones opuestas.';

create index conteos_por_sesion
  on conteos_denominacion (organizacion_id, sesion_caja_id, momento);

-- ── 2 · Lo que la sesión de caja gana ────────────────────────────────────
alter table sesiones_caja
  add column efectivo_esperado_centavos bigint,
  add column diferencia_centavos bigint,
  add column saldo_recargas_apertura_centavos bigint not null default 0,
  add column saldo_recargas_cierre_centavos bigint;

alter table sesiones_caja
  add constraint sesion_saldo_recargas_no_negativo check (
    saldo_recargas_apertura_centavos >= 0
    and (saldo_recargas_cierre_centavos is null or saldo_recargas_cierre_centavos >= 0)
  );

comment on column sesiones_caja.diferencia_centavos is
  'Contado menos esperado. Se guarda calculada y no se deduce después: el esperado cambia cuando llega un movimiento tardío, y entonces la diferencia de ayer se movería sola.';
comment on column sesiones_caja.saldo_recargas_cierre_centavos is
  'El saldo de las plataformas es dinero del negocio que no está en el cajón: está en el celular. Sin anotarlo, el corte dice que falta dinero cada vez que se compró saldo.';

-- ── 3 · La categoría del movimiento ──────────────────────────────────────
--
-- El corte de una tiendita necesita separar lo propio de lo ajeno y lo
-- operativo. Sin categoría hay que deducirlo del `tipo`, y el tipo ya significa
-- otra cosa: `deposito` es a la vez meter cambio y recibir un abono de fiado.
alter table movimientos_caja add column categoria text;

alter table movimientos_caja
  add constraint movimiento_caja_categoria_valida check (
    categoria is null
    or categoria in ('venta', 'ajeno', 'operacion', 'fondo', 'comisionista')
  );

comment on column movimientos_caja.categoria is
  'Separa lo propio de lo ajeno en el corte. No se deduce del `tipo` porque el tipo ya significa otra cosa: `deposito` es a la vez meter cambio y recibir un abono de fiado.';

create index movimientos_caja_por_categoria
  on movimientos_caja (organizacion_id, sesion_caja_id, categoria)
  where categoria is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table conteos_denominacion enable row level security;
alter table conteos_denominacion force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table conteos_denominacion from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table conteos_denominacion to morphiqpos_app;
  end if;
end;
$$;
