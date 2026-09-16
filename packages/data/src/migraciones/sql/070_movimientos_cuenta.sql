-- 070 · La bitácora de qué le pasó a una cuenta, y la división (F-321).
--
-- ── Una tabla para cuatro funciones ────────────────────────────────────────
-- F-321 dividir, F-302 unir, F-303 cambiar de mesa y F-324 anular una línea son
-- la misma operación de fondo: **mover líneas entre cuentas o entre mesas**. Sin
-- una bitácora común, un ticket dividido deja de ser auditable — y el ticket
-- dividido es justo donde nacen más descuadres del giro.
--
-- ── El dolor que cierra F-321 ──────────────────────────────────────────────
-- La mesa de ocho pide cuentas separadas y hoy el cajero las calcula a mano en
-- el teléfono: de 5 a 12 minutos con gente esperando mesa detrás. Es el hueco
-- más caro de los ocho que le quedan a este modelo.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table movimientos_cuenta (
  id               uuid        primary key default gen_random_uuid(),
  organizacion_id  uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id      uuid        not null references sucursales (id),
  tipo             text        not null,
  orden_origen_id  uuid        not null references ordenes (id),
  orden_destino_id uuid        references ordenes (id),
  mesa_origen_id   uuid        references mesas (id),
  mesa_destino_id  uuid        references mesas (id),
  -- Qué líneas se movieron y por cuánto, congelado. Si se leyera de
  -- `orden_lineas` al consultar, una división de ayer se vería con los precios
  -- de hoy.
  lineas           jsonb       not null,
  motivo           text,
  empleado_id      uuid        not null references empleos (id),
  created_at       timestamptz not null default now(),

  constraint movimientos_cuenta_tipo_valido check (
    tipo in ('division', 'union', 'separacion', 'cambio_mesa', 'anulacion_linea', 'traspaso_linea')
  ),

  -- Anular una línea SIN motivo es el camino corto para que desaparezca comida
  -- sin que nadie responda. Cada motivo apunta a un responsable distinto —error
  -- de cocina, error de mesero, cortesía— y por eso es obligatorio.
  constraint movimiento_anulacion_con_motivo check (
    tipo <> 'anulacion_linea' or motivo is not null
  ),

  constraint movimientos_cuenta_lineas_no_vacio check (jsonb_array_length(lineas) > 0)
);

comment on table movimientos_cuenta is
  'Bitácora INMUTABLE de qué le pasó a una cuenta: división, unión, cambio de mesa y anulación de línea. Sin updated_at y sin update, igual que movimientos_stock.';
comment on column movimientos_cuenta.lineas is
  'Las líneas movidas, CONGELADAS. Leerlas de orden_lineas al consultar mostraría una división de ayer con los precios de hoy.';

create index movimientos_cuenta_por_orden
  on movimientos_cuenta (organizacion_id, orden_origen_id, created_at);

-- ── La división: madre e hijas ─────────────────────────────────────────────
--
-- `dividida` es un estado NUEVO y terminal para la madre: no se cobra, no se
-- cancela y no vuelve atrás. Se añade al `check` de la 003 reescribiéndolo
-- entero, que es la única forma de ampliar un `check in (...)` en Postgres.
alter table ordenes drop constraint ordenes_estado_check;
alter table ordenes
  add constraint ordenes_estado_check check (
    estado in (
      'borrador', 'confirmada', 'en_preparacion', 'lista', 'cuenta_solicitada',
      'parcialmente_pagada', 'pagada', 'parcialmente_reembolsada', 'reembolsada',
      'cancelada', 'dividida'
    )
  );

alter table ordenes
  add column orden_padre_id   uuid references ordenes (id),
  add column division_indice  int;

comment on column ordenes.orden_padre_id is
  'F-321 · La cuenta madre de la que salió esta hija. La madre queda en estado `dividida` y NO se cobra: se cobran las hijas.';

create index ordenes_por_padre on ordenes (orden_padre_id) where orden_padre_id is not null;

-- Una hija sin índice no se puede nombrar («la cuenta 2 de 4»), y el comensal
-- necesita saber cuál es la suya.
alter table ordenes
  add constraint orden_hija_con_indice check (
    (orden_padre_id is null) = (division_indice is null)
  );

-- ── Invariante 1 · una mesa, una cuenta viva · YA EXISTE ───────────────────
--
-- El `05-DATOS-Y-BACKEND.md` de este modelo lo lista como algo que hay que
-- construir. **Ya está construido**, y mejor de lo que lo describe: la 046 creó
-- `ordenes_una_activa_por_mesa`, que cubre CINCO estados —no dos— y además
-- particiona por organización. Añadir otro índice más estrecho no habría
-- reforzado nada y habría dejado dos reglas que mantener sincronizadas.
--
-- ── Y eso decide dónde cuelgan las hijas ───────────────────────────────────
-- Si cada hija llevara `mesa_id`, la segunda violaría ese índice: son varias
-- cuentas vivas de la MISMA mesa, que es justo lo que el índice prohíbe y con
-- razón — el mesero comandaría en una y el cajero cobraría otra.
--
-- Por eso **las hijas nacen sin `mesa_id`** y cuelgan de la madre por
-- `orden_padre_id`. La madre conserva la mesa y pasa a `dividida`, que no está
-- en la lista de estados activos: la mesa deja de aceptar comandas nuevas
-- mientras se cobran las partes, que es exactamente lo que pasa en el salón.

-- ── Invariante 2 · una cuenta dividida NO se cobra ─────────────────────────
--
-- La que se cobra es la hija. Si la madre admitiera pago, el consumo se cobraría
-- dos veces: una en la madre y otra repartido en las hijas.
create or replace function orden_dividida_sin_pagos() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from ordenes o
     where o.id = new.orden_id and o.estado = 'dividida'
  ) then
    raise exception
      'Una cuenta dividida no se cobra: se cobran sus hijas (orden %)', new.orden_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger pagos_no_sobre_cuenta_dividida
  before insert on pagos
  for each row execute function orden_dividida_sin_pagos();

-- ── Invariante 3 · la suma de las hijas iguala a la madre ──────────────────
--
-- DIFERIDO a propósito: durante la transacción que divide, la madre y las hijas
-- pasan por estados intermedios donde la suma todavía no cuadra. Lo que no puede
-- pasar es que la transacción TERMINE sin cuadrar. Dividir una cuenta y perder
-- $40 en el camino no puede ser posible.
create or replace function division_suma_igual_a_la_madre() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  madre    uuid;
  total_madre  bigint;
  total_hijas  bigint;
begin
  madre := coalesce(new.orden_padre_id, old.orden_padre_id);
  if madre is null then return null; end if;

  select o.total_centavos into total_madre from ordenes o where o.id = madre;

  select coalesce(sum(h.total_centavos), 0) into total_hijas
    from ordenes h
   where h.orden_padre_id = madre
     and h.estado <> 'cancelada';

  if total_madre is distinct from total_hijas then
    raise exception
      'La división no cuadra: la madre suma % y las hijas %', total_madre, total_hijas
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger division_cuadra
  after insert or update or delete on ordenes
  deferrable initially deferred
  for each row execute function division_suma_igual_a_la_madre();

-- ── F-324 · La anulación de una línea ya comandada ─────────────────────────
alter table orden_lineas
  add column anulada_en        timestamptz,
  add column motivo_anulacion  text,
  add column empleado_anula_id uuid references empleos (id);

-- Invariante 5: anular exige motivo, y un motivo sin anulación es basura.
alter table orden_lineas
  add constraint linea_anulada_con_motivo check (
    (anulada_en is null) = (motivo_anulacion is null)
  );

comment on column orden_lineas.motivo_anulacion is
  'Obligatorio al anular. Cada motivo —error de cocina, error de mesero, cortesía— apunta a un responsable y a una cuenta distinta.';

-- ── RLS ────────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table movimientos_cuenta enable row level security;
  alter table movimientos_cuenta force row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table movimientos_cuenta from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    -- Inmutable: sin update ni delete, igual que movimientos_stock.
    grant select, insert on table movimientos_cuenta to morphiqpos_app;
  end if;
end;
$$;
