-- 092 · La caducidad SIN lote (F-106).
--
-- ── Por qué «sin lote» está en el título ─────────────────────────────────
-- Un sistema de lotes exige que cada entrada declare su lote, que cada salida
-- diga de qué lote sale y que el conteo cuadre por lote. En una tiendita, donde
-- entran cuarenta cajas a las siete de la mañana y las acomoda una persona sola,
-- eso no se captura: se abandona a la tercera semana y entonces el inventario
-- entero deja de ser fiable, no sólo la caducidad.
--
-- Lo que sí se captura es «esta caja de leche caduca el 12 de marzo, son 24».
-- Eso es esta tabla: una fecha, una cantidad y el producto. Ni lote, ni número
-- de serie, ni trazabilidad hacia atrás. Cubre el 90 % del dolor —la merma que
-- se descubre cuando ya caducó— con el 10 % de la captura.
--
-- ── Por qué la alerta va en DÍAS y por producto ──────────────────────────
-- El yogur hay que rematarlo con cinco días; el atún, con sesenta, porque a
-- cinco días nadie compra una lata que caduca. Un umbral único o avisa tarde de
-- lo fresco o llena la lista con lo que todavía no urge, y una lista que no se
-- puede vaciar es una lista que nadie abre.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

alter table productos
  add column controla_caducidad boolean not null default false,
  add column dias_alerta_caducidad smallint;

alter table productos
  add constraint producto_alerta_caducidad_coherente check (
    not controla_caducidad
    or (dias_alerta_caducidad is not null and dias_alerta_caducidad between 1 and 365)
  );

comment on column productos.dias_alerta_caducidad is
  'Con cuántos días de anticipación avisar. El yogur se remata con cinco; el atún, con sesenta, porque a cinco días nadie compra una lata que caduca.';

create table caducidades (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  almacen_id          uuid        not null references almacenes (id) on delete cascade,
  producto_id         uuid        not null references productos (id) on delete cascade,

  caduca_el           date        not null,
  -- Cantidad en la unidad base del producto. `numeric(14,4)` como todo el stock.
  cantidad            numeric(14, 4) not null check (cantidad > 0),

  -- Lo que se ha ido dando de baja de esta fila, por venta o por merma. No se
  -- resta de `cantidad`: así la fila conserva cuánto entró, y la diferencia es
  -- exactamente la merma que este producto genera en este anaquel.
  consumida           numeric(14, 4) not null default 0 check (consumida >= 0),

  compra_id           uuid        references compras (id) on delete set null,
  registrada_en       timestamptz not null default now(),
  registrada_por      uuid        references empleos (id) on delete set null,

  constraint caducidad_no_sobreconsumida check (consumida <= cantidad),
  -- Una fecha, un producto, un almacén: la segunda captura del mismo lote de
  -- leche suma a la fila que ya existe en vez de crear una hermana que después
  -- nadie sabe cuál rematar primero.
  unique (almacen_id, producto_id, caduca_el)
);

comment on table caducidades is
  'F-106 · La caducidad SIN lote: una fecha, una cantidad y el producto. Cubre el 90 % del dolor con el 10 % de la captura, y por eso se sigue capturando en la semana cuatro.';
comment on column caducidades.consumida is
  'No se resta de `cantidad`: la diferencia entre las dos ES la merma que este producto genera en este anaquel, y ése es el número que el negocio nunca ha tenido.';

-- Lo que hay que rematar: se lee cada mañana y ordena por urgencia real.
create index caducidades_proximas
  on caducidades (organizacion_id, almacen_id, caduca_el)
  where consumida < cantidad;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table caducidades enable row level security;
alter table caducidades force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table caducidades from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update, delete on table caducidades to morphiqpos_app;
  end if;
end;
$$;
