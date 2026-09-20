-- 096 · El envase retornable y su depósito (F-256).
--
-- ── El caso, con números ─────────────────────────────────────────────────
-- La reja de refresco de vidrio se vende con $150 de depósito por los envases.
-- Ese dinero NO es del negocio: es del cliente, que lo recupera cuando trae los
-- cascos. Entra al cajón, se queda semanas, y vuelve a salir. Una tiendita con
-- tres rutas de refresco puede tener $4,000 a $8,000 de casco ajeno dentro del
-- cajón sin saberlo.
--
-- ── Por qué esto no es una línea de venta con precio ─────────────────────
-- Porque una línea de venta es ingreso: sube el total del día, el IVA y —si el
-- negocio paga comisión— la comisión. El depósito no es nada de eso. Y porque
-- la devolución del casco no es una devolución de mercancía: no hay producto
-- que regrese al anaquel, hay dinero ajeno que se salda.
--
-- ── Por qué el envase es un PRODUCTO y no un atributo ────────────────────
-- Porque el mismo casco sirve para tres refrescos distintos, tiene su propio
-- precio de depósito y su propia existencia —los cascos vacíos son cosas que
-- ocupan sitio y que el proveedor cuenta—. Ponerlo como columna del refresco
-- obligaría a repetir el precio en cada uno y a no poder contarlos.
--
-- ── Y por qué el saldo va por CLIENTE cuando se sabe quién es ────────────
-- En la mayoría de los casos no se sabe: el casco lo trae quien lo trae y el
-- depósito es anónimo. Pero con el cliente de ruta —el que se lleva ocho rejas—
-- sí se sabe, y ahí el saldo es lo que impide pagar dos veces los mismos cascos.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── 1 · El producto sabe qué envase lleva ────────────────────────────────
alter table productos
  add column envase_producto_id uuid references productos (id) on delete restrict,
  add column envases_por_unidad smallint;

alter table productos
  -- Un refresco que declara envase TIENE que decir cuántos. Sin el número, la
  -- reja de 24 cobra un depósito y se devuelven veinticuatro.
  add constraint producto_envase_completo check (
    envase_producto_id is null
    or (envases_por_unidad is not null and envases_por_unidad > 0)
  ),
  -- Un envase no puede ser envase de sí mismo.
  add constraint producto_envase_no_circular check (
    envase_producto_id is null or envase_producto_id <> id
  );

comment on column productos.envase_producto_id is
  'F-256 · Qué casco lleva. Es un PRODUCTO y no una columna de precio porque el mismo casco sirve para tres refrescos, tiene su propia existencia y el proveedor lo cuenta.';

create index productos_con_envase
  on productos (organizacion_id, envase_producto_id)
  where envase_producto_id is not null;

-- ── 2 · Los depósitos ────────────────────────────────────────────────────
create table depositos_envase (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  envase_producto_id  uuid        not null references productos (id) on delete restrict,
  -- Casi siempre `null`: el casco lo trae quien lo trae. Con el cliente de ruta
  -- sí se sabe, y ahí el saldo es lo que impide pagar dos veces los mismos.
  cliente_id          uuid        references clientes (id) on delete set null,
  orden_id            uuid        references ordenes (id) on delete set null,

  tipo                text        not null,
  -- Firmado: cobrar depósito suma dinero ajeno, devolverlo lo resta. El saldo
  -- de casco es una suma, igual que todos los pasivos de este sistema.
  piezas              int         not null check (piezas <> 0),
  monto_centavos      bigint      not null check (monto_centavos <> 0),

  sesion_caja_id      uuid        references sesiones_caja (id),
  movimiento_caja_id  uuid        references movimientos_caja (id),
  empleado_id         uuid        references empleos (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint deposito_tipo_valido check (tipo in ('cobrado', 'devuelto', 'ajuste')),
  -- Cobrar mete cascos en la calle y dinero en el cajón; devolver hace lo
  -- contrario. Un `devuelto` en positivo haría crecer el pasivo cada vez que se
  -- le paga a alguien sus cascos.
  constraint deposito_signo_coherente check (
    (tipo = 'cobrado' and piezas > 0 and monto_centavos > 0)
    or (tipo = 'devuelto' and piezas < 0 and monto_centavos < 0)
    or tipo = 'ajuste'
  )
);

comment on table depositos_envase is
  'F-256 · El depósito NO es venta: es dinero del cliente que entra al cajón y vuelve a salir. Una tiendita con tres rutas puede tener $8,000 de casco ajeno dentro sin saberlo.';
comment on column depositos_envase.piezas is
  'Firmado, igual que el monto. Cobrar mete cascos en la calle; devolver los trae de vuelta. Así el saldo es una suma y no una resta entre dos consultas.';

create index depositos_por_envase
  on depositos_envase (organizacion_id, envase_producto_id, created_at desc);
create index depositos_por_cliente
  on depositos_envase (organizacion_id, cliente_id)
  where cliente_id is not null;

-- ── 3 · La vista que contesta «¿cuánto casco ajeno tengo?» ───────────────
create view saldo_envases as
select d.organizacion_id,
       d.sucursal_id,
       d.envase_producto_id,
       p.nombre                  as envase_nombre,
       sum(d.piezas)             as piezas_en_la_calle,
       sum(d.monto_centavos)     as pasivo_centavos,
       max(d.created_at)         as ultimo_movimiento
  from depositos_envase d
  join productos p on p.id = d.envase_producto_id
 group by d.organizacion_id, d.sucursal_id, d.envase_producto_id, p.nombre;

comment on view saldo_envases is
  'F-256 · Cuántos cascos hay en la calle y cuánto dinero ajeno representan. Es el número que hoy no existe en ninguna tiendita.';

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table depositos_envase enable row level security;
alter table depositos_envase force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table depositos_envase from %s', roles_publicos);
  end if;

  -- Sin `delete`: el dinero ajeno no se borra, se contrapone con un ajuste.
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert on table depositos_envase to morphiqpos_app;
  end if;
end;
$$;
