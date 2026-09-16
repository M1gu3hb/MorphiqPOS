-- 161 · F-610 a F-617 · El crédito y la cobranza, una sola vez para los dos giros.
--
-- ── Por qué aquí y no en el rango de un modelo ────────────────────────────
-- Porque son las MISMAS ocho funciones en `abarrotes` y en `ferreteria`, y el
-- mapa las pide además en otros catorce modelos de A5. Ponerlas en el rango de
-- uno de los dos obligaría al otro a heredar de un vecino, que es justo lo que
-- los rangos de D-08 evitan. Y tiene que aplicarse DESPUÉS de la 112, que es
-- donde nacen las remisiones de obra.
--
-- ── El dolor, con el número del propio modelo ─────────────────────────────
-- «Es el dolor 1 completo. Hoy es una libreta y un talonario de papel carbón, y
-- las tres puertas de pérdida están abiertas.» Las tres puertas son: se fía sin
-- límite, se fía sin plazo, y nadie sabe cuánto lleva vencido.
--
-- ── La decisión de fondo: UN documento, no tres ───────────────────────────
-- Un fiado de tiendita, una remisión de obra y una nota de mostrador son el
-- mismo hecho contable —«este cliente me debe esto desde esta fecha»— con tres
-- papeles distintos encima. Modelarlos como tres tablas obligaría a escribir
-- tres veces la antigüedad de saldos, tres veces la aplicación de pagos y tres
-- veces el bloqueo por mora, y a que las tres dieran el mismo número. Nunca lo
-- dan.
--
-- `documentos_credito` es ese hecho. `origen_tipo` dice qué papel lo respalda.
--
-- ── Y por qué el saldo del documento NO se recalcula sumando pagos ────────
-- Se guarda y se decrementa en el mismo `update` que aplica el pago, con guarda.
-- Sumar las aplicaciones en cada consulta convierte el estado de cuenta de una
-- ferretería con dos años de crédito en una consulta de segundos, y un estado
-- de cuenta que tarda no se manda.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · F-611 y F-617 · Lo que le falta al plazo y al bloqueo ────────────
--
-- `clientes.dias_plazo` y `clientes.bloqueado_por_mora` YA los creó la 112 de
-- ferretería. Aquí no se vuelven a crear —eso reventaría con un 42701— sino que
-- se les añade lo que les faltaba para servir a los dos giros:
--
--   · el plazo llegaba a 180 días y una obra de ferretería se pacta a 365;
--   · el bloqueo era un booleano suelto, y «está bloqueado» sin autor ni motivo
--     es una decisión que nadie va a poder explicar cuando el cliente llame al
--     dueño. Se le ponen las tres columnas que lo hacen auditable.
alter table clientes drop constraint clientes_dias_plazo_check;
alter table clientes
  add constraint clientes_dias_plazo_check check (dias_plazo between 0 and 365);

alter table clientes
  add column bloqueado_en timestamptz,
  add column bloqueado_por uuid references empleos (id) on delete set null,
  add column motivo_bloqueo text;

alter table clientes
  add constraint clientes_bloqueo_con_motivo check (
    not bloqueado_por_mora or (motivo_bloqueo is not null and length(btrim(motivo_bloqueo)) > 0)
  );

comment on column clientes.dias_plazo is
  'F-611 · Cuántos días tiene para pagar. Cero = contado. Sin plazo, «me debe» y «me debe desde hace 90 días» son el mismo dato.';
comment on column clientes.motivo_bloqueo is
  'F-617 · Por qué se bloqueó. Obligatorio por check cuando bloqueado_por_mora es cierto: un muro sin motivo no se puede levantar delante del cliente.';

-- ── 2 · El documento: lo que se debe, desde cuándo y hasta cuándo ─────────
create table documentos_credito (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        references sucursales (id),
  cliente_id      uuid        not null references clientes (id) on delete cascade,

  -- Qué papel lo respalda. El hecho contable es el mismo; el papel cambia.
  origen_tipo     text        not null,
  origen_id       uuid,
  folio           text        not null,

  emitido_en      timestamptz not null default now(),
  -- `emitido_en + dias_plazo`, CONGELADO al emitir. Si el plazo del cliente
  -- cambia mañana, lo que ya se fió vence cuando se dijo que vencía.
  vence_en        timestamptz not null,

  importe_centavos bigint     not null,
  -- Se decrementa al aplicar un pago, en el mismo `update` y con guarda. Ver el
  -- docblock de arriba: recalcularlo sumando pagos hace que el estado de cuenta
  -- de dos años tarde segundos, y uno que tarda no se manda.
  saldo_centavos  bigint      not null,

  empleado_id     uuid        references empleos (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint documentos_credito_origen_valido check (
    origen_tipo in ('venta', 'remision', 'nota_mostrador', 'ajuste')
  ),
  constraint documentos_credito_importe_positivo check (importe_centavos > 0),
  -- El saldo vive entre cero y el importe. Por encima sería un documento que
  -- creció solo; por debajo, un pago aplicado de más — y las dos cosas se
  -- descubren en el estado de cuenta del cliente, delante del cliente.
  constraint documentos_credito_saldo_en_rango check (
    saldo_centavos >= 0 and saldo_centavos <= importe_centavos
  ),
  constraint documentos_credito_vence_despues check (vence_en >= emitido_en),
  unique (organizacion_id, folio)
);

comment on table documentos_credito is
  'F-612 · Lo que un cliente debe, con su fecha de emisión y su vencimiento. Un fiado, una remisión y una nota de mostrador son el mismo hecho con tres papeles encima.';
comment on column documentos_credito.vence_en is
  'Congelado al emitir. Si mañana se le cambia el plazo al cliente, lo que ya se fió vence cuando se dijo que vencía.';

-- El índice de la cartera: lo vivo, por cliente y por vencimiento. Parcial
-- porque lo saldado no se consulta nunca y metería años de historia en el
-- índice que se lee todos los días.
create index documentos_credito_vivos
  on documentos_credito (organizacion_id, cliente_id, vence_en)
  where saldo_centavos > 0;

-- ── 3 · F-614 y F-615 · El pago, y cómo se reparte ───────────────────────
create table pagos_credito (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        references sucursales (id),
  cliente_id      uuid        not null references clientes (id) on delete cascade,

  monto_centavos  bigint      not null,
  metodo          text        not null,
  referencia      text,
  -- El movimiento de caja gemelo. El dinero entró al cajón: sin esta fila el
  -- arqueo no puede explicar de dónde salió.
  movimiento_caja_id uuid     references movimientos_caja (id),
  sesion_caja_id  uuid        references sesiones_caja (id),
  -- Lo que sobró después de cubrir todo lo vencido. Es un anticipo, no un
  -- error: el cliente que paga de más está pagando por adelantado.
  a_cuenta_centavos bigint    not null default 0,

  empleado_id     uuid        not null references empleos (id),
  created_at      timestamptz not null default now(),

  constraint pagos_credito_positivo check (monto_centavos > 0),
  constraint pagos_credito_metodo_valido check (
    metodo in ('efectivo', 'tarjeta', 'transferencia', 'cheque')
  ),
  constraint pagos_credito_a_cuenta_en_rango check (
    a_cuenta_centavos >= 0 and a_cuenta_centavos <= monto_centavos
  )
);

-- ── F-212 · La transferencia no se aplica hasta que alguien ve el banco ──
--
-- Este bloque vivia en la 115 de ferreteria, donde no podia funcionar: alli
-- `pagos_credito` todavia no existe. Va aqui, pegado a la tabla que altera.
--
--
-- Las transferencias son el 20 %–35 % del valor en una ferretería, y llegan con
-- un comprobante que se ve en la pantalla del cliente. Un comprobante falso de
-- $80 es una molestia; uno de $12,000 es un problema, y el sistema no puede
-- distinguirlos: lo único que puede hacer es NO APLICAR el pago al saldo hasta
-- que alguien mire el banco.
--
-- `confirmado` nace en `true` a propósito. El efectivo, la tarjeta y el cheque
-- ya están confirmados en el momento en que se cobran, y ponerlos en `false`
-- llenaría la lista de pendientes con todo lo que no hace falta revisar —que es
-- exactamente cómo una lista de revisión deja de leerse—. La transferencia es
-- la única que entra en `false`, y lo hace el comando.
alter table pagos_credito add column confirmado boolean not null default true;
alter table pagos_credito add column confirmado_en timestamptz;
alter table pagos_credito add column confirmado_por uuid references empleos (id) on delete set null;
-- La fecha REAL del depósito, que puede no ser la de captura: el dinero entró al
-- banco el domingo a las nueve y alguien lo registra el lunes. Con una sola
-- fecha, la antigüedad de la cartera cuenta un día de mora que no existió.
alter table pagos_credito add column recibido_en timestamptz;

-- Confirmar sin decir cuándo deja un pago que dice estar revisado y no dice por
-- quién ni desde cuándo, que es justo lo que se pregunta cuando no cuadra.
alter table pagos_credito add constraint pago_confirmado_con_fecha check (
  confirmado = false or confirmado_en is not null or metodo <> 'transferencia'
);

comment on column pagos_credito.confirmado is
  'F-212 · La transferencia no baja el saldo del cliente hasta que alguien ve el banco. El comprobante falso no se puede detectar; lo que se puede es no creerle todavía.';

-- Lo que hay que revisar antes de cerrar el día. Sin este índice parcial, la
-- consulta recorre todos los pagos del año en cada corte.
create index pagos_credito_por_confirmar
  on pagos_credito (organizacion_id, created_at) where not confirmado;

-- La aplicación, documento por documento. Sin ella, «pagó $3 000» no dice qué
-- facturas quedaron saldadas, y el cliente y el negocio llevan cuentas
-- distintas desde el primer pago parcial.
create table aplicaciones_pago (
  pago_id        uuid    not null references pagos_credito (id) on delete cascade,
  documento_id   uuid    not null references documentos_credito (id) on delete cascade,
  monto_centavos bigint  not null,

  primary key (pago_id, documento_id),

  constraint aplicaciones_pago_positiva check (monto_centavos > 0)
);

comment on table aplicaciones_pago is
  'F-614 · Qué documento cubrió cada peso del pago. Sin esto, «pagó $3 000» no dice qué quedó saldado y las dos partes llevan cuentas distintas.';

create index pagos_credito_por_cliente
  on pagos_credito (organizacion_id, cliente_id, created_at desc);

-- ── 4 · Los movimientos de caja y de pasivo que esto añade ───────────────
alter table movimientos_caja drop constraint movimientos_caja_referencia_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_referencia_tipo_check check (
    referencia_tipo in (
      'orden', 'gasto', 'manual', 'pasivo', 'redondeo',
      'liquidacion', 'cita', 'renta',
      -- 161 · el pago de crédito, que entra al cajón y NO es una venta nueva:
      -- la venta ya se registró el día que se fió.
      'pago_credito'
    )
  );

-- ── 5 · Poscondición ─────────────────────────────────────────────────────
--
-- Ningún documento puede nacer con saldo mayor que su importe ni vencer antes de
-- emitirse. Se comprueba aquí además del `check` porque un backfill futuro que
-- migre la libreta de papel es exactamente donde eso se cuela.
do $$
declare
  rotos int;
begin
  select count(*) into rotos
    from documentos_credito
   where saldo_centavos > importe_centavos
      or saldo_centavos < 0
      or vence_en < emitido_en;

  if rotos > 0 then
    raise exception 'Hay % documento(s) de crédito con saldo o vencimiento imposible', rotos
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table documentos_credito enable row level security;
alter table documentos_credito force row level security;
alter table pagos_credito enable row level security;
alter table pagos_credito force row level security;
alter table aplicaciones_pago enable row level security;
alter table aplicaciones_pago force row level security;

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
      'revoke all privileges on table documentos_credito, pagos_credito, aplicaciones_pago from %s',
      roles_publicos
    );
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table documentos_credito to morphiqpos_app;
    grant select, insert on table pagos_credito, aplicaciones_pago to morphiqpos_app;
  end if;
end;
$$;
