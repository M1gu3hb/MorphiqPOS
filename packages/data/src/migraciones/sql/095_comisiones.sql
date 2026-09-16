-- 095 · El dinero de las terceras: recargas, servicios y pago de recibos (F-255).
--
-- ── Lo que de verdad pasa en el mostrador ────────────────────────────────
-- La señora paga $500 de luz. Entran $500 al cajón y el negocio gana $8. Los
-- $500 NO son venta: son de la CFE, y la tiendita los va a entregar el jueves
-- cuando el comisionista pase o cuando el saldo de la plataforma se descargue.
-- Lo único que es ingreso son los $8.
--
-- Si eso se registra como una venta de $500, la tiendita reporta cinco veces su
-- venta real, paga impuesto sobre dinero ajeno y —peor— cree que vendió bien un
-- día que no vendió nada. Es el error más caro de este modelo y el que no se ve:
-- el corte cuadra, porque el dinero sí está.
--
-- ── Por qué un SALDO por comisionista y no sólo movimientos ──────────────
-- Porque la operación tiene dos sentidos. En la recarga el negocio COMPRA saldo
-- por adelantado —pone dinero— y lo va vendiendo; en el pago de recibo RECIBE
-- dinero ajeno y lo debe. Los dos acaban en un número que hay que poder mirar a
-- las nueve de la noche: «¿cuánto saldo me queda?» y «¿cuánto debo entregar?».
-- Sacar ese número sumando movimientos cada vez es lo que hace que nadie lo
-- mire.
--
-- ── Y por qué la comisión se congela en cada operación ───────────────────
-- Las plataformas cambian el porcentaje sin avisar. Guardar sólo el porcentaje
-- vigente y multiplicarlo después haría que la ganancia de marzo cambiara en
-- abril, que es la forma más rápida de que un dueño deje de creerle al sistema.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table comisionistas (
  id                    uuid        primary key default gen_random_uuid(),
  organizacion_id       uuid        not null references organizaciones (id) on delete cascade,
  nombre                text        not null check (length(trim(nombre)) > 0),
  tipo                  text        not null,
  -- `prepago` es el saldo que el negocio compra por adelantado; `pospago` es el
  -- dinero ajeno que recibe y entrega después. La mecánica del saldo es la
  -- misma, el signo con el que empieza no.
  modelo                text        not null,
  comision_bp           int         not null default 0,
  activo                boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint comisionista_tipo_valido check (
    tipo in ('recarga', 'servicio', 'recibo', 'paqueteria', 'otro')
  ),
  constraint comisionista_modelo_valido check (modelo in ('prepago', 'pospago')),
  constraint comisionista_comision_en_rango check (comision_bp between 0 and 10000),
  unique (organizacion_id, nombre)
);

comment on table comisionistas is
  'F-255 · Con quién se opera dinero que no es del negocio. `prepago` compra saldo por adelantado; `pospago` recibe dinero ajeno y lo entrega después.';

create table operaciones_comision (
  id                    uuid        primary key default gen_random_uuid(),
  organizacion_id       uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id           uuid        references sucursales (id) on delete cascade,
  comisionista_id       uuid        not null references comisionistas (id) on delete restrict,
  orden_id              uuid        references ordenes (id) on delete set null,

  tipo                  text        not null,
  -- Lo que la persona entregó en el mostrador. NO es venta: es de la tercera.
  monto_ajeno_centavos  bigint      not null default 0 check (monto_ajeno_centavos >= 0),
  -- Lo único que el negocio gana. ESTO sí es ingreso.
  comision_centavos     bigint      not null default 0 check (comision_centavos >= 0),
  -- El porcentaje CONGELADO con el que se calculó. Las plataformas lo cambian
  -- sin avisar, y sin esta columna la ganancia de marzo cambiaría en abril.
  comision_bp_aplicada  int         not null,

  referencia            text,
  telefono              text,
  sesion_caja_id        uuid        references sesiones_caja (id),
  movimiento_caja_id    uuid        references movimientos_caja (id),
  empleado_id           uuid        references empleos (id) on delete set null,
  created_at            timestamptz not null default now(),

  constraint operacion_comision_tipo_valido check (
    tipo in ('venta', 'compra_saldo', 'entrega', 'ajuste', 'cancelacion')
  ),
  constraint operacion_comision_bp_en_rango check (comision_bp_aplicada between 0 and 10000),
  -- Una venta al público mueve dinero ajeno; una compra de saldo o una entrega
  -- al comisionista, no. Sin esto, comprar saldo contaría como venta de $5,000.
  constraint operacion_comision_ajeno_coherente check (
    tipo <> 'venta' or monto_ajeno_centavos > 0
  )
);

comment on table operaciones_comision is
  'F-255 · Cada operación de dinero ajeno. Los $500 del recibo de luz NO son venta; los $8 sí. Registrarlos juntos hace que la tiendita reporte cinco veces su venta real y pague impuesto sobre dinero de la CFE.';
comment on column operaciones_comision.comision_bp_aplicada is
  'Congelada. Las plataformas cambian el porcentaje sin avisar, y recalcular después haría que la ganancia de marzo cambiara en abril.';

create index operaciones_por_comisionista
  on operaciones_comision (organizacion_id, comisionista_id, created_at desc);
create index operaciones_del_dia
  on operaciones_comision (organizacion_id, sucursal_id, created_at desc);

create table saldos_comisionista (
  organizacion_id       uuid        not null references organizaciones (id) on delete cascade,
  comisionista_id       uuid        not null references comisionistas (id) on delete cascade,

  -- Firmado, y su significado depende del modelo: en `prepago` es lo que le
  -- queda al negocio por vender; en `pospago`, lo que debe entregar.
  saldo_centavos        bigint      not null default 0,
  comision_acumulada_centavos bigint not null default 0
                        check (comision_acumulada_centavos >= 0),
  ultima_entrega_en     timestamptz,
  actualizado_en        timestamptz not null default now(),

  primary key (organizacion_id, comisionista_id)
);

comment on table saldos_comisionista is
  'El número que se mira a las nueve de la noche: «¿cuánto saldo me queda?» y «¿cuánto debo entregar?». Sacarlo sumando movimientos cada vez es lo que hace que nadie lo mire.';

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

  foreach t in array array['comisionistas', 'operaciones_comision', 'saldos_comisionista']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update on table %I to morphiqpos_app', t);
    end if;
  end loop;
end;
$$;
