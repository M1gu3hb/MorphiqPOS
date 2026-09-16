-- 118 · La garantía con el proveedor y la renta de herramienta (F-146, F-147).
--
-- ── La garantía es mercancía que SALE y no se vendió ─────────────────────
-- El cliente devuelve el taladro a los dos meses. La ferretería se lo cambia
-- ese mismo día —porque si no, pierde al cliente— y manda el averiado al
-- proveedor, que tarda entre tres semanas y nunca en reponerlo.
--
-- En ese intervalo hay una pieza fuera del inventario que no se vendió, y hay un
-- crédito con el proveedor que casi siempre se olvida. Es dinero que la
-- ferretería ya pagó y que no vuelve porque nadie lleva la cuenta: un negocio
-- mediano pierde entre $20,000 y $60,000 al año exactamente así.
--
-- ── Por qué la garantía tiene ESTADO y fecha de reclamo ──────────────────
-- Porque el valor de esta tabla no es guardar que pasó: es poder preguntar «¿qué
-- llevo mandado y no me han repuesto?». Sin estado, la respuesta exige revisar
-- notas una por una y por eso nadie la hace.
--
-- ── La renta es lo contrario y por eso comparte forma ────────────────────
-- Sale una pieza que TIENE que volver, y entra un depósito que hay que devolver
-- cuando vuelve. Es el envase retornable de abarrotes con otro nombre, y por eso
-- el depósito se registra igual: firmado, y saldado al retorno.
--
-- ── Y por qué el depósito de renta NO es venta ───────────────────────────
-- Misma razón que el casco: es dinero del cliente que entra al cajón y vuelve a
-- salir. Contarlo como ingreso el día que se renta infla la venta y el impuesto
-- por dinero que se va a devolver el jueves.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table garantias_proveedor (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  proveedor_id        uuid        not null references proveedores (id) on delete restrict,
  producto_id         uuid        not null references productos (id) on delete restrict,

  -- La venta original, cuando se encuentra. No es obligatoria: media ferretería
  -- acepta la garantía con la caja y sin ticket, y negarla por eso es perder al
  -- cliente para ahorrarse una columna nula.
  orden_id            uuid        references ordenes (id) on delete set null,
  cliente_id          uuid        references clientes (id) on delete set null,

  piezas              int         not null check (piezas > 0),
  costo_unitario_centavos bigint  not null check (costo_unitario_centavos >= 0),
  falla               text        not null check (length(trim(falla)) > 0),

  estado              text        not null default 'recibida',
  recibida_en         timestamptz not null default now(),
  enviada_en          timestamptz,
  folio_proveedor     text,
  resuelta_en         timestamptz,
  resolucion          text,

  -- Lo que se le dio al cliente ese mismo día. Es lo que separa «se la cambié»
  -- de «se la debo», que para el cliente son dos negocios distintos.
  repuesta_al_cliente boolean     not null default false,
  empleado_id         uuid        references empleos (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint garantia_estado_valido check (
    estado in ('recibida', 'enviada', 'repuesta', 'rechazada', 'abonada')
  ),
  constraint garantia_enviada_con_fecha check (estado = 'recibida' or enviada_en is not null),
  -- Cerrar una garantía sin decir cómo acabó la deja contando como pendiente
  -- para siempre, que es justo el número que esta tabla viene a arreglar.
  constraint garantia_resuelta_explicada check (
    estado not in ('repuesta', 'rechazada', 'abonada')
    or (resuelta_en is not null and resolucion is not null)
  )
);

comment on table garantias_proveedor is
  'F-146 · Lo que se mandó al proveedor y no ha vuelto. Un negocio mediano pierde entre $20,000 y $60,000 al año porque nadie lleva esta cuenta.';

-- «¿Qué llevo mandado y no me han repuesto?». Es la consulta entera, y sin este
-- índice exige revisar notas una por una: por eso hoy nadie la hace.
create index garantias_pendientes
  on garantias_proveedor (organizacion_id, proveedor_id, enviada_en)
  where estado in ('recibida', 'enviada');

create trigger garantias_tocar_updated_at
  before update on garantias_proveedor for each row execute function tocar_updated_at();

create table rentas_herramienta (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  producto_id         uuid        not null references productos (id) on delete restrict,
  cliente_id          uuid        references clientes (id) on delete set null,
  nombre_libre        text,
  telefono_libre      text,

  piezas              int         not null check (piezas > 0),
  tarifa_centavos     bigint      not null check (tarifa_centavos >= 0),
  unidad_tarifa       text        not null,
  -- El depósito NO es venta: es dinero del cliente que entra y vuelve a salir.
  -- Mismo caso que el casco retornable de abarrotes (096).
  deposito_centavos   bigint      not null default 0 check (deposito_centavos >= 0),

  estado              text        not null default 'fuera',
  salio_en            timestamptz not null default now(),
  compromiso_retorno  timestamptz not null,
  volvio_en           timestamptz,
  cobro_centavos      bigint,
  deposito_devuelto_centavos bigint,
  danos               text,

  orden_id            uuid        references ordenes (id) on delete set null,
  empleado_id         uuid        references empleos (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint renta_unidad_tarifa_valida check (unidad_tarifa in ('hora', 'dia', 'semana')),
  constraint renta_estado_valido check (estado in ('fuera', 'devuelta', 'perdida', 'dañada')),
  constraint renta_retorno_despues check (volvio_en is null or volvio_en >= salio_en),
  constraint renta_cerrada_con_cobro check (
    estado = 'fuera' or (volvio_en is not null and cobro_centavos is not null)
  ),
  constraint renta_cobro_no_negativo check (cobro_centavos is null or cobro_centavos >= 0),
  -- Devolver más depósito del que se cobró es dinero que sale del cajón sin
  -- respaldo, y es el error de teclado que nadie revisa.
  constraint renta_deposito_devuelto_en_rango check (
    deposito_devuelto_centavos is null
    or (deposito_devuelto_centavos >= 0 and deposito_devuelto_centavos <= deposito_centavos)
  ),
  constraint renta_con_alguien check (
    cliente_id is not null or (nombre_libre is not null and length(trim(nombre_libre)) > 0)
  )
);

comment on table rentas_herramienta is
  'F-147 · Sale una pieza que TIENE que volver y entra un depósito que hay que devolver. Es el envase retornable de abarrotes con otro nombre, y por eso el depósito se trata igual: dinero ajeno, no venta.';

-- Lo que está fuera y ya venció el compromiso: se revisa cada mañana.
create index rentas_fuera
  on rentas_herramienta (organizacion_id, compromiso_retorno)
  where estado = 'fuera';

create trigger rentas_herramienta_tocar_updated_at
  before update on rentas_herramienta for each row execute function tocar_updated_at();

-- ── Los cuatro movimientos de stock que esto necesita ────────────────────
--
-- ⚠ Lista cerrada: se escribe ENTERA, con lo que la 093 dejó más los cuatro de
-- aquí. Y el SIGNO se declara a la vez, o la existencia deja de ser una suma:
-- lo que sale al proveedor o al cliente sale en negativo, y lo que vuelve entra
-- en positivo.
alter table movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_tipo_check check (
    tipo in (
      -- 003 · el tronco.
      'entrada_compra', 'salida_venta', 'ajuste', 'merma', 'devolucion',
      'cancelacion', 'traspaso_entrada', 'traspaso_salida',
      'inventario_inicial', 'produccion',
      -- 093 · lo que el retail hace todos los días.
      'salida_consumo_interno', 'devolucion_proveedor',
      -- 117 · lo que se gasta en un trabajo de mostrador (lo declara la 113).
      'consumo_servicio',
      -- 118 · garantía y renta, cada una con su ida y su vuelta.
      'garantia_proveedor', 'garantia_retorno', 'renta_salida', 'renta_retorno'
    )
  );

alter table movimientos_stock drop constraint movimiento_stock_signo_coherente;
alter table movimientos_stock
  add constraint movimiento_stock_signo_coherente check (
    case
      when tipo in ('entrada_compra', 'devolucion', 'cancelacion',
                    'traspaso_entrada', 'inventario_inicial', 'produccion',
                    'garantia_retorno', 'renta_retorno')
        then cantidad > 0
      when tipo in ('salida_venta', 'merma', 'traspaso_salida',
                    'salida_consumo_interno', 'devolucion_proveedor',
                    'consumo_servicio', 'garantia_proveedor', 'renta_salida')
        then cantidad < 0
      else true
    end
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

  foreach t in array array['garantias_proveedor', 'rentas_herramienta']
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
