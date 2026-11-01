-- ─────────────────────────────────────────────────────────────────────────────
-- 186 · EL PEDIDO COMPARTIDO DE LA MESA (DP-9.5, fase B).
--
-- Hasta aquí cada teléfono que escaneaba el QR de una mesa armaba su carrito en su propia
-- memoria y cada «Enviar» salía a cocina como comandas aparte. Ahora la mesa tiene UN carrito:
-- lo que cada quien agrega lo ven todos (sondeo de 2-3 s), cada quien quita lo suyo, y el
-- carrito sale a cocina UNA vez, entero, y se vacía para todos.
--
--   · `carrito_mesa_lineas`: lo que hay en el carrito de una mesa, con la huella del teléfono
--     que lo agregó (sólo él lo quita). Sin precio: el precio lo pone el servidor al enviar,
--     como siempre (R9).
--   · `dispositivos_mesa`: los teléfonos con el portal de una mesa abierto y su último latido.
--     Las «personas conectadas» son las que latieron en el último minuto desde que se abrió la
--     cuenta.
--   · `carritos_mesa`: la ronda de cada mesa. Cada envío la sube y deja quién y cuándo: los
--     demás teléfonos ven «Pedido enviado» al notar que subió.
--
-- El id del teléfono lo inventa su navegador; aquí se guarda su HUELLA (HMAC con la pimienta
-- del servidor), nunca el valor que viaja. Con mesas unidas (DP-9.6) todo cuelga de la mesa
-- principal: el QR de una mesa absorbida cae en el carrito de la principal.
-- ─────────────────────────────────────────────────────────────────────────────

create table carrito_mesa_lineas (
  id                   uuid          primary key default gen_random_uuid(),
  organizacion_id      uuid          not null references organizaciones (id) on delete cascade,
  mesa_id              uuid          not null references mesas (id) on delete cascade,
  dispositivo_huella   text          not null check (length(dispositivo_huella) = 64),
  producto_id          uuid          not null references productos (id) on delete cascade,
  cantidad             numeric(14,4) not null check (cantidad > 0 and cantidad <= 999),
  notas                text          not null default '' check (length(notas) <= 300),
  created_at           timestamptz   not null default now()
);

create index carrito_mesa_lineas_por_mesa
  on carrito_mesa_lineas (organizacion_id, mesa_id, created_at);

comment on table carrito_mesa_lineas is
  'DP-9.5 · El carrito compartido de una mesa en el portal QR. Sale a cocina UNA vez, entero, y se vacía para todos.';

create table dispositivos_mesa (
  organizacion_id      uuid          not null references organizaciones (id) on delete cascade,
  mesa_id              uuid          not null references mesas (id) on delete cascade,
  dispositivo_huella   text          not null check (length(dispositivo_huella) = 64),
  visto_en             timestamptz   not null default now(),
  primary key (organizacion_id, mesa_id, dispositivo_huella)
);

create index dispositivos_mesa_recientes
  on dispositivos_mesa (organizacion_id, mesa_id, visto_en desc);

comment on table dispositivos_mesa is
  'DP-9.5 · Los teléfonos con el portal de una mesa abierto. Conectados = los que latieron en el último minuto desde que se abrió la cuenta.';

create table carritos_mesa (
  organizacion_id      uuid          not null references organizaciones (id) on delete cascade,
  mesa_id              uuid          not null references mesas (id) on delete cascade,
  ronda                integer       not null default 0 check (ronda >= 0),
  enviado_en           timestamptz,
  enviado_por_huella   text          check (enviado_por_huella is null or length(enviado_por_huella) = 64),
  primary key (organizacion_id, mesa_id),
  constraint carritos_mesa_envio_completo check ((enviado_en is null) = (enviado_por_huella is null))
);

comment on table carritos_mesa is
  'DP-9.5 · La ronda del carrito de cada mesa: cada envío la sube. Su fila es también el cerrojo que vuelve un solo pedido dos «Enviar» simultáneos.';

-- ── RLS: como el resto de las tablas del negocio ──────────────────────────────
do $$
declare
  t text;
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach t in array array['carrito_mesa_lineas', 'dispositivos_mesa', 'carritos_mesa']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);
    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update, delete on table %I to morphiqpos_app', t);
    end if;
  end loop;
end;
$$;
