-- 178 · La devolución de venta, total y parcial (D-29 de la 2.4).
--
-- ── EL HUECO, y cómo se encontró ────────────────────────────────────────────
-- Escribiendo el día completo de la tienda (bloque D de la 2.4), que tiene que
-- devolver una venta entera y otra a medias. Cuatro de los cinco
-- `02-DINERO-Y-CAJA.md` la definen —«Devolución de venta en efectivo · Encargado ·
-- − monto · Resta de ventas»— y NO EXISTÍA en ningún modelo: `venta.devolver` es la
-- del pedido de barra de la cafetería, total y sólo mientras está en la fila. Una
-- tienda que devolvía un aceite lo hacía sacando el dinero del cajón a mano, y el
-- arqueo salía con un faltante que nadie sabía explicar.
--
-- ── Cómo se modela, y por qué así ───────────────────────────────────────────
-- · La devolución es un DOCUMENTO PROPIO, con sus renglones. No se toca el ticket
--   original: «no se reabre el ticket ni se corrige la venta del día pasado: el
--   histórico no se toca» (ferretería §1). La venta conserva su total y sus pagos;
--   la devolución resta de la venta del DÍA EN QUE SE DEVUELVE.
-- · Cada renglón dice qué línea de la venta, cuánto de ella y cuánto dinero. La
--   suma de lo devuelto de una línea nunca pasa de lo vendido, y el importe se
--   calcula acumulado —el último renglón se lleva el centavo que el redondeo dejó—,
--   así que devolver una línea a pedazos suma EXACTAMENTE lo que costó.
-- · El dinero sale por un método. En efectivo, del cajón de la terminal que
--   devuelve —un movimiento `devolucion` de su sesión, que el arqueo ya resta—; con
--   tarjeta o transferencia no toca el cajón y queda «por reversar».
-- · La mercancía regresa al inventario a su costo, con un movimiento `devolucion`
--   POSITIVO referido a este documento. Lo que no se puede revender (una bebida ya
--   servida) se devuelve sin regresar: `regresa_al_inventario = false`.
--
-- Es ADITIVA: dos tablas nuevas, una restricción `unique (id, organizacion_id)` que
-- ya cumple la llave primaria, y un valor más en una lista cerrada. El código de
-- `main` sigue funcionando con ella aplicada.

-- La llave compuesta que necesita el renglón para exigir la misma organización (004).
alter table orden_lineas add constraint orden_lineas_id_org_unica unique (id, organizacion_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- `devoluciones` · el documento
-- ═══════════════════════════════════════════════════════════════════════════
create table devoluciones (
  id                    uuid        primary key default gen_random_uuid(),
  organizacion_id       uuid        not null references organizaciones (id) on delete restrict,
  sucursal_id           uuid        not null references sucursales (id) on delete restrict,
  orden_id              uuid        not null references ordenes (id) on delete restrict,
  -- La caja de la que salió el efectivo. Nula cuando el dinero no tocó el cajón.
  sesion_caja_id        uuid        references sesiones_caja (id) on delete restrict,
  empleado_id           uuid        not null references empleos (id) on delete restrict,
  metodo                text        not null
                                    check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  monto_centavos        bigint      not null check (monto_centavos > 0),
  motivo                text        not null check (length(trim(motivo)) between 4 and 200),
  regresa_al_inventario boolean     not null default true,
  created_at            timestamptz not null default now(),

  -- El efectivo sale de UN cajón: sin sesión, el arqueo no lo restaría nunca.
  constraint devolucion_en_efectivo_con_caja
    check (metodo <> 'efectivo' or sesion_caja_id is not null)
);

alter table devoluciones add constraint devoluciones_id_org_unica unique (id, organizacion_id);

alter table devoluciones add constraint devoluciones_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;

alter table devoluciones add constraint devoluciones_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete restrict;

alter table devoluciones add constraint devoluciones_sesion_caja_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;

alter table devoluciones add constraint devoluciones_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

create index devoluciones_por_orden on devoluciones (organizacion_id, orden_id);
create index devoluciones_por_sesion on devoluciones (organizacion_id, sesion_caja_id)
  where sesion_caja_id is not null;
create index devoluciones_por_dia on devoluciones (organizacion_id, created_at desc);

comment on table devoluciones is
  'D-29 · La devolución de una venta cobrada: documento propio que resta de la venta del día en que se devuelve. El ticket original no se toca.';

-- ═══════════════════════════════════════════════════════════════════════════
-- `devoluciones_lineas` · qué se devolvió de cada línea, y cuánto dinero
-- ═══════════════════════════════════════════════════════════════════════════
create table devoluciones_lineas (
  id              uuid          primary key default gen_random_uuid(),
  organizacion_id uuid          not null references organizaciones (id) on delete restrict,
  devolucion_id   uuid          not null references devoluciones (id) on delete restrict,
  orden_linea_id  uuid          not null references orden_lineas (id) on delete restrict,
  cantidad        numeric(14,4) not null check (cantidad > 0),
  monto_centavos  bigint        not null check (monto_centavos >= 0),
  created_at      timestamptz   not null default now()
);

alter table devoluciones_lineas add constraint devoluciones_lineas_devolucion_misma_org
  foreign key (devolucion_id, organizacion_id)
  references devoluciones (id, organizacion_id) on delete restrict;

alter table devoluciones_lineas add constraint devoluciones_lineas_linea_misma_org
  foreign key (orden_linea_id, organizacion_id)
  references orden_lineas (id, organizacion_id) on delete restrict;

create index devoluciones_lineas_por_devolucion
  on devoluciones_lineas (organizacion_id, devolucion_id);
create index devoluciones_lineas_por_linea on devoluciones_lineas (organizacion_id, orden_linea_id);

comment on table devoluciones_lineas is
  'D-29 · Lo devuelto de cada línea de la venta. Lo devuelto de una línea nunca pasa de lo vendido (lo exige `venta.devolver_venta` con la orden bloqueada).';

-- ═══════════════════════════════════════════════════════════════════════════
-- `movimientos_stock.referencia_tipo` · la mercancía que regresa
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠ Lista cerrada: se reescribe ENTERA con lo vigente (160) más `devolucion`.
alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in (
      -- Los del tronco, desde la 003.
      'orden', 'compra', 'conteo', 'manual',
      -- 077 · consumo interno y cortesías.
      'consumo_interno', 'anulacion',
      -- 085 · la merma de barra de la cafetería.
      'merma_barra',
      -- 097 · el redondeo en especie de abarrotes.
      'redondeo',
      -- 113 y 117 · corte de material y servicio de mostrador de la ferretería.
      'corte', 'servicio',
      -- 118 · garantía y renta de la ferretería.
      'garantia', 'renta',
      -- 141 · abrir una pieza para cabina, y lo que se gasta en el servicio.
      'apertura_cabina', 'consumo_cabina',
      -- 160 · merma con motivo y traspaso entre almacenes.
      'merma', 'traspaso',
      -- 178 · la mercancía de una devolución de venta, de vuelta al almacén.
      'devolucion'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- `movimientos_caja.referencia_tipo` · el efectivo que sale por una devolución
-- ═══════════════════════════════════════════════════════════════════════════
-- El movimiento `devolucion` del cajón apunta a SU documento, no a la venta: una venta
-- puede tener varias devoluciones, y el arqueo tiene que poder decir cuál sacó qué.
-- ⚠ Lista cerrada: se reescribe ENTERA con lo vigente (162) más `devolucion`.
alter table movimientos_caja drop constraint movimientos_caja_referencia_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_referencia_tipo_check check (
    referencia_tipo in (
      'orden', 'gasto', 'manual', 'pasivo', 'redondeo',
      'liquidacion', 'cita', 'renta', 'pago_credito',
      -- 162 · lo que se le paga al distribuidor.
      'pago_proveedor',
      -- 178 · el efectivo de una devolución de venta.
      'devolucion'
    )
  );

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

  foreach t in array array['devoluciones', 'devoluciones_lineas']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;

    -- Sin `update`: una devolución no se corrige, se hace otra. Se REVOCA a propósito,
    -- porque los privilegios por omisión de la base (`credencial-db.mjs`) se lo darían.
    -- El `delete` sí: lo usan el reseteo de las demos y las purgas de mantenimiento.
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, delete on table %I to morphiqpos_app', t);
      execute format('revoke update on table %I from morphiqpos_app', t);
    end if;
  end loop;
end;
$$;

-- ── La comprobación de la propia migración ─────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devolucion_en_efectivo_con_caja'
  ) then
    raise exception '178: falta la restricción del efectivo con caja';
  end if;
  if not exists (
    select 1 from pg_class where relname = 'devoluciones_lineas' and relrowsecurity
  ) then
    raise exception '178: devoluciones_lineas nació sin RLS';
  end if;
  perform count(*) from devoluciones;
  perform count(*) from devoluciones_lineas;
end;
$$;
