-- 061 · F-105 traspaso entre almacenes y F-106 toma de inventario físico.
--
-- Van juntas porque comparten el mismo problema y la misma solución: las dos
-- mueven stock por una razón que NO es una venta, y las dos tienen que dejar el
-- ledger cuadrado o no dejar nada.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── F-105 · Traspaso entre almacenes ───────────────────────────────────────
--
-- Un traspaso son DOS movimientos de stock —salida en el origen, entrada en el
-- destino— que tienen que existir los dos o ninguno. Esta tabla es la cabecera
-- que los amarra: sin ella, una caída a mitad deja producto que salió de un
-- almacén y no llegó al otro, y eso no se detecta hasta el conteo físico.
create table traspasos (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  almacen_origen  uuid        not null references almacenes (id),
  almacen_destino uuid        not null references almacenes (id),
  estado          text        not null default 'borrador',
  motivo          text,
  empleado_id     uuid        references empleos (id) on delete set null,
  enviado_en      timestamptz,
  recibido_en     timestamptz,
  created_at      timestamptz not null default now(),

  constraint traspasos_almacenes_distintos check (almacen_origen <> almacen_destino),
  constraint traspasos_estado_valido check (estado in ('borrador', 'enviado', 'recibido', 'cancelado')),

  -- La misma familia de `check` que ya rompió el sistema dos veces en la Fase 1:
  -- un estado que exige una columna y no la escribe. Se declara aquí para que el
  -- contrato `estados-con-columna` lo vigile desde el primer día.
  constraint traspaso_enviado_con_fecha check (estado <> 'enviado' or enviado_en is not null),
  constraint traspaso_recibido_completo check (
    estado <> 'recibido' or (enviado_en is not null and recibido_en is not null)
  )
);

create table traspaso_lineas (
  id            uuid    primary key default gen_random_uuid(),
  traspaso_id   uuid    not null references traspasos (id) on delete cascade,
  insumo_id     uuid    not null references insumos (id),
  cantidad      numeric(14, 4) not null,
  unidad        text    not null,
  -- Lo que de verdad llegó. Puede diferir de lo enviado —se rompió, se mojó, se
  -- contó mal— y ESA diferencia es el dato que importa: sin ella el traspaso
  -- cuadra siempre en el papel y nunca en el estante.
  cantidad_recibida numeric(14, 4),

  constraint traspaso_lineas_cantidad_positiva check (cantidad > 0),
  constraint traspaso_lineas_recibida_no_negativa check (
    cantidad_recibida is null or cantidad_recibida >= 0
  ),

  unique (traspaso_id, insumo_id)
);

comment on table traspasos is
  'F-105 · Cabecera que amarra la salida y la entrada de un traspaso. Sin ella, una caída a mitad deja producto que salió y no llegó.';
comment on column traspaso_lineas.cantidad_recibida is
  'Lo que de verdad llegó. La diferencia contra `cantidad` es el dato que importa: sin ella el traspaso cuadra en el papel y no en el estante.';

-- ── F-106 · Toma de inventario físico ──────────────────────────────────────
--
-- El conteo NO escribe existencias directamente. Escribe lo contado, se compara
-- contra lo esperado, y el ajuste sale como un movimiento de stock con su
-- motivo. Así el kardex explica por qué cambió el saldo, que es la única razón
-- por la que se cuenta.
create table tomas_inventario (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  almacen_id      uuid        not null references almacenes (id),
  estado          text        not null default 'abierta',
  -- Null = toma completa. Con valor = conteo cíclico de una zona (F-149), que es
  -- lo único que convierte la toma anual en una rutina de veinte minutos.
  zona            text,
  iniciada_en     timestamptz not null default now(),
  cerrada_en      timestamptz,
  empleado_id     uuid        references empleos (id) on delete set null,

  constraint tomas_inventario_estado_valido check (estado in ('abierta', 'cerrada', 'cancelada')),
  constraint toma_cerrada_con_fecha check (estado <> 'cerrada' or cerrada_en is not null)
);

create table toma_conteos (
  id          uuid    primary key default gen_random_uuid(),
  toma_id     uuid    not null references tomas_inventario (id) on delete cascade,
  insumo_id   uuid    not null references insumos (id),
  -- El saldo del sistema EN EL MOMENTO DE CONTAR, congelado. Compararlo después
  -- contra el saldo actual daría una diferencia falsa: entre el conteo y el
  -- cierre pudo haber ventas.
  esperado    numeric(14, 4) not null,
  contado     numeric(14, 4) not null,
  unidad      text    not null,
  contado_en  timestamptz not null default now(),
  empleado_id uuid    references empleos (id) on delete set null,

  constraint toma_conteos_contado_no_negativo check (contado >= 0),

  unique (toma_id, insumo_id)
);

comment on column toma_conteos.esperado is
  'El saldo del sistema congelado AL CONTAR. Compararlo contra el saldo actual daría una diferencia falsa: entre el conteo y el cierre pudo haber ventas.';

create index tomas_inventario_abiertas
  on tomas_inventario (organizacion_id, almacen_id)
  where estado = 'abierta';

-- ── RLS para las cuatro ────────────────────────────────────────────────────
do $$
declare
  t text;
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach t in array array['traspasos', 'traspaso_lineas', 'tomas_inventario', 'toma_conteos']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update, delete on table %I to morphiqpos_app', t);
    end if;
  end loop;
end;
$$;
