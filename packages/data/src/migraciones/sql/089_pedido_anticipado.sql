-- 089 · F-330 · El pedido anticipado, que es el cliente de oficina.
--
-- ── El dolor ──────────────────────────────────────────────────────────────
-- «Se pierde el cliente de oficina que quiere seis cafés a las 8:15 y no tiene
-- forma de pedirlos antes.» Seis cafés es media hora de barra en el pico, y
-- llega justo cuando la fila da la vuelta a la esquina.
--
-- ── Por qué el pedido anticipado NO es una orden más ──────────────────────
-- Porque tiene una hora PROMETIDA, y esa promesa es lo único que el negocio
-- vende de más. Un pedido que entra a la fila cuando llega el cliente no es un
-- pedido anticipado: es un pedido normal con el cliente esperando. El dato que
-- importa —y que hoy no existe— es la distancia entre `hora_prometida` y
-- `entregado_en`.
--
-- ── Y por qué la CAPACIDAD por hueco no vive aquí ────────────────────────
-- Es una consulta de conteo sobre `hora_prometida` truncada a cinco minutos,
-- contra un límite configurable. Materializarla crearía un segundo sitio donde
-- la verdad puede divergir, y el primero que se desincronice va a ser el que
-- decide si se acepta el pedido.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table pedidos_anticipados (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        not null references sucursales (id),
  -- La orden ya está COBRADA. Un pedido anticipado sin cobrar es una reserva, y
  -- una reserva sin prenda es exactamente el no-show que este giro no se puede
  -- permitir en su hora pico.
  orden_id        uuid        not null references ordenes (id) on delete cascade,

  nombre          text        not null,
  telefono        text,
  hora_prometida  timestamptz not null,
  estado          text        not null default 'programado',
  -- Cuándo entró DE VERDAD a la fila. La distancia contra `hora_prometida` es el
  -- dato que dice si la promesa se está cumpliendo.
  encolado_en     timestamptz,
  entregado_en    timestamptz,
  empleado_id     uuid        references empleos (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint pedidos_anticipados_estado_valido check (
    estado in ('programado', 'en_fila', 'entregado', 'no_recogido')
  ),
  constraint pedidos_anticipados_nombre_no_vacio check (length(btrim(nombre)) > 0),
  -- La familia de `check` que ya rompió el sistema dos veces: un estado que
  -- exige una columna y no la escribe. Se declara aquí para que
  -- `estados-con-columna.contrato.test.ts` lo vigile desde el primer día.
  constraint pedido_anticipado_en_fila_con_hora check (
    estado <> 'en_fila' or encolado_en is not null
  ),
  constraint pedido_anticipado_entregado_con_hora check (
    estado <> 'entregado' or entregado_en is not null
  ),
  -- Una orden sólo puede tener UN pedido anticipado. Dos serían dos promesas
  -- sobre el mismo café.
  unique (orden_id)
);

comment on table pedidos_anticipados is
  'F-330 · El pedido que se cobra antes y se recoge a una hora prometida. Lo que se vende de más es la promesa.';
comment on column pedidos_anticipados.hora_prometida is
  'A qué hora se dijo que estaría. La distancia contra entregado_en es el único número que dice si la promesa se cumple.';

-- El índice que lee el planificador cada minuto. Parcial: los entregados de
-- ayer no se miran nunca y meterlos en el índice lo haría crecer sin fin.
create index pedidos_anticipados_por_hora
  on pedidos_anticipados (sucursal_id, hora_prometida)
  where estado = 'programado';

create index pedidos_anticipados_por_orden on pedidos_anticipados (orden_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table pedidos_anticipados enable row level security;
alter table pedidos_anticipados force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table pedidos_anticipados from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table pedidos_anticipados to morphiqpos_app;
  end if;
end;
$$;
