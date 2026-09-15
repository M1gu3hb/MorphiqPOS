-- 162 · F-040 y F-635 · La ficha del cliente, y lo que el negocio DEBE.
--
-- ── F-040 · «La deuda transversal más cara del proyecto» ──────────────────
-- Lo dicen tres carpetas con esas palabras. La tabla `clientes` existe desde la
-- migración 002 y hasta hoy **no hay comandos, no hay pantalla y no hay nada**.
-- Sin cliente no hay fiado en abarrotes, no hay crédito en ferretería, y en
-- estética no hay cita, ni expediente, ni cartera, ni recordatorio.
--
-- Lo que falta no es la tabla: son los campos que cada giro necesita y que nadie
-- añadió porque nadie escribió su comando.
--
-- ── Los campos fiscales van AHORA aunque el CFDI esté bloqueado ───────────
-- La decisión P-02 mantiene el CFDI fuera de esta fase, y el encargo dice qué
-- hacer con lo bloqueado: *«dejar el hueco limpio. Que la entidad tenga los
-- campos que van a hacer falta —RFC y régimen fiscal en el cliente, por
-- ejemplo— para que meterlo después no obligue a migrar todo.»* Eso es esto, y
-- nada más: columnas, sin PAC, sin timbrado y sin lógica.
--
-- ── F-635 · Cuentas por pagar, que tres modelos señalaron ────────────────
-- «No sabe cuánto debe. Con crédito de 30 a 60 días del distribuidor, es la
-- mitad de su flujo.» Es el reflejo exacto de la cartera: allí el negocio cobra,
-- aquí paga. La estructura es la misma a propósito —documento con vencimiento y
-- saldo, más pagos— porque la antigüedad de saldos se calcula igual, y tener dos
-- aritméticas para el mismo concepto es cómo acaban dando números distintos.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · F-040 · Lo que le falta a la ficha del cliente ───────────────────
alter table clientes
  -- Fiscales. Bloqueados por P-02: se declaran y no se usan.
  add column rfc text,
  add column regimen_fiscal text,
  add column uso_cfdi text,
  add column codigo_postal text,
  -- Operativos, y éstos sí se usan desde el primer día.
  add column dia_pago smallint,
  add column direccion text,
  add column notas_cobranza text;

alter table clientes
  -- El RFC mexicano: 12 posiciones para persona moral, 13 para física. No se
  -- valida el dígito verificador aquí —eso lo hace el PAC— pero sí la forma,
  -- porque un RFC de nueve caracteres es un tecleo y se descubre al facturar.
  add constraint clientes_rfc_con_forma check (
    rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
  ),
  add constraint clientes_cp_con_forma check (
    codigo_postal is null or codigo_postal ~ '^[0-9]{5}$'
  ),
  -- Día del mes en que paga. Uno a 28 y no a 31: el 31 no existe en febrero y un
  -- cliente que paga «el 31» acabaría sin fecha de cobro cuatro meses al año.
  add constraint clientes_dia_pago_valido check (dia_pago is null or dia_pago between 1 and 28);

comment on column clientes.rfc is
  'F-940 · Declarado y sin usar: el CFDI está bloqueado por P-02. Está aquí para que meterlo después no obligue a migrar la tabla con datos vivos dentro.';
comment on column clientes.dia_pago is
  'F-612 · Qué día del mes paga. De 1 a 28: el 31 no existe en febrero, y quien «paga el 31» se quedaría sin fecha cuatro meses al año.';

create index clientes_por_rfc
  on clientes (organizacion_id, rfc)
  where rfc is not null;

-- El teléfono es la llave real con la que se busca a un cliente en el mostrador.
-- Nadie pregunta «¿cuál es tu id?».
create index clientes_por_telefono
  on clientes (organizacion_id, telefono)
  where telefono is not null;

-- ── 2 · F-635 · Lo que el negocio debe a sus proveedores ─────────────────
create table documentos_por_pagar (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  proveedor_id    uuid        not null references proveedores (id) on delete cascade,

  folio_proveedor text        not null,
  compra_id       uuid        references compras (id) on delete set null,

  emitido_en      timestamptz not null default now(),
  vence_en        timestamptz not null,
  importe_centavos bigint     not null,
  saldo_centavos  bigint      not null,

  empleado_id     uuid        references empleos (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint por_pagar_importe_positivo check (importe_centavos > 0),
  constraint por_pagar_saldo_en_rango check (
    saldo_centavos >= 0 and saldo_centavos <= importe_centavos
  ),
  constraint por_pagar_vence_despues check (vence_en >= emitido_en),
  -- Dos veces el mismo folio del mismo proveedor es la factura capturada dos
  -- veces, que es como se paga dos veces.
  unique (organizacion_id, proveedor_id, folio_proveedor)
);

comment on table documentos_por_pagar is
  'F-635 · Lo que el negocio debe. Es el reflejo de documentos_credito, con la misma forma a propósito: la antigüedad se calcula igual y dos aritméticas para el mismo concepto acaban dando números distintos.';

create index por_pagar_vivos
  on documentos_por_pagar (organizacion_id, vence_en)
  where saldo_centavos > 0;

create table pagos_a_proveedor (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  proveedor_id    uuid        not null references proveedores (id) on delete cascade,
  documento_id    uuid        references documentos_por_pagar (id) on delete set null,

  monto_centavos  bigint      not null,
  metodo          text        not null,
  referencia      text,
  sesion_caja_id  uuid        references sesiones_caja (id),

  empleado_id     uuid        not null references empleos (id),
  created_at      timestamptz not null default now(),

  constraint pagos_proveedor_positivo check (monto_centavos > 0),
  constraint pagos_proveedor_metodo_valido check (
    metodo in ('efectivo', 'transferencia', 'cheque', 'tarjeta')
  )
);

create index pagos_a_proveedor_por_proveedor
  on pagos_a_proveedor (organizacion_id, proveedor_id, created_at desc);

-- El pago a proveedor SALE del cajón: su movimiento de caja necesita su propia
-- referencia, o el arqueo no puede explicar el retiro.
alter table movimientos_caja drop constraint movimientos_caja_referencia_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_referencia_tipo_check check (
    referencia_tipo in (
      'orden', 'gasto', 'manual', 'pasivo', 'redondeo',
      'liquidacion', 'cita', 'renta', 'pago_credito',
      -- 162 · lo que se le paga al distribuidor.
      'pago_proveedor'
    )
  );

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table documentos_por_pagar enable row level security;
alter table documentos_por_pagar force row level security;
alter table pagos_a_proveedor enable row level security;
alter table pagos_a_proveedor force row level security;

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
      'revoke all privileges on table documentos_por_pagar, pagos_a_proveedor from %s',
      roles_publicos
    );
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table documentos_por_pagar to morphiqpos_app;
    grant select, insert on table pagos_a_proveedor to morphiqpos_app;
  end if;
end;
$$;
