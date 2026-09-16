-- 116 · La nota de mostrador (F-140, F-142).
--
-- ── Por qué una ferretería no tiene «cuenta abierta» sino NOTA ───────────
-- En el mostrador de una ferretería el cliente no se sienta: pide, se le arma
-- lo que pidió, y en ese momento puede pasar cualquiera de tres cosas. Se lo
-- lleva y paga; se lo lleva a crédito; o dice «déjamelo apartado, ahorita
-- vuelvo con la camioneta». Las tres son la misma nota en tres estados, y
-- ninguna es una orden cerrada.
--
-- Con sólo `ordenes`, la tercera —que es diaria— no tiene sitio: o se cierra
-- una venta que no se cobró, o se pierde el armado y hay que hacerlo otra vez
-- cuando el cliente vuelva.
--
-- ── Por qué el MOSTRADORISTA va en la orden y no sólo el cajero ──────────
-- Porque son dos personas distintas y el que arma no es el que cobra. Sin esa
-- columna, la comisión de mostrador y la pregunta «¿quién armó esta nota?»
-- —que es la primera cuando algo sale mal— no tienen respuesta.
--
-- ── Y por qué el almacén sabe de qué tipo es ─────────────────────────────
-- Una ferretería tiene mostrador, bodega y patio, y lo que está en patio no se
-- puede vender sin que alguien lo traiga. Marcar el tipo es lo que permite que
-- la nota diga «hay 40, pero 30 están en la bodega de atrás» en vez de prometer
-- lo que no se puede entregar en el momento.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · El tipo de almacén ───────────────────────────────────────────────
alter table almacenes add column tipo text not null default 'general';

alter table almacenes
  add constraint almacen_tipo_valido check (
    tipo in ('general', 'venta', 'bodega', 'transito')
  );

comment on column almacenes.tipo is
  'Lo que está en `bodega` o en `transito` no se puede entregar en el momento. Marcarlo es lo que permite decir «hay 40, pero 30 están atrás» en vez de prometer lo que no hay a la mano.';

-- ── 2 · La nota de mostrador ─────────────────────────────────────────────
create table notas_mostrador (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id         uuid        references sucursales (id) on delete cascade,
  -- La orden existe desde el primer renglón: la nota es su envoltorio de
  -- mostrador, no una copia de sus líneas. Duplicar las líneas aquí sería el
  -- segundo sitio donde vive la misma venta.
  orden_id            uuid        not null references ordenes (id) on delete cascade,

  folio               text        not null,
  estado              text        not null default 'armando',
  cliente_id          uuid        references clientes (id) on delete set null,
  -- Para el cliente sin ficha, que es la mayoría: un nombre y un teléfono
  -- escritos a mano bastan para apartar mercancía.
  nombre_libre        text,
  telefono_libre      text,

  mostradorista_id    uuid        references empleos (id) on delete set null,
  armada_en           timestamptz not null default now(),
  -- Lo apartado CADUCA. Sin fecha, el patio se llena de material comprometido
  -- para clientes que no volvieron, y la existencia miente hacia abajo.
  aparta_hasta        timestamptz,
  entregada_en        timestamptz,
  cerrada_en          timestamptz,
  nota                text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint nota_estado_valido check (
    estado in ('armando', 'apartada', 'por_cobrar', 'entregada', 'cancelada')
  ),
  -- Apartar sin fecha de caducidad es como el patio se llena de material
  -- comprometido para clientes que no volvieron.
  constraint nota_apartada_con_vencimiento check (
    estado <> 'apartada' or aparta_hasta is not null
  ),
  constraint nota_entregada_con_fecha check (
    estado <> 'entregada' or entregada_en is not null
  ),
  -- O ficha, o nombre a mano. Una nota sin ninguno de los dos no se le puede
  -- devolver a nadie cuando aparece la camioneta.
  constraint nota_con_alguien check (
    cliente_id is not null or (nombre_libre is not null and length(trim(nombre_libre)) > 0)
  ),
  unique (organizacion_id, folio)
);

comment on table notas_mostrador is
  'F-140 · Las tres cosas que pasan en un mostrador —se lo lleva y paga, se lo lleva a crédito, o lo aparta— son la misma nota en tres estados. Con sólo `ordenes`, la tercera no tiene sitio.';
comment on column notas_mostrador.mostradorista_id is
  'El que arma no es el que cobra. Sin esta columna, «¿quién armó esta nota?» —la primera pregunta cuando algo sale mal— no tiene respuesta.';

create index notas_vivas
  on notas_mostrador (organizacion_id, sucursal_id, armada_en desc)
  where estado in ('armando', 'apartada', 'por_cobrar');
-- Lo apartado que ya venció: se revisa cada mañana para liberar material.
create index notas_apartadas_vencidas
  on notas_mostrador (organizacion_id, aparta_hasta)
  where estado = 'apartada';

create trigger notas_mostrador_tocar_updated_at
  before update on notas_mostrador for each row execute function tocar_updated_at();

-- ── 3 · Lo que la orden gana ─────────────────────────────────────────────
--
-- `mostradorista_id` ya la declara la 115, un numero antes, con el mismo
-- `on delete set null`. Declararla dos veces abortaba la tanda entera con
-- «column "mostradorista_id" ... already exists», y la tanda es una sola
-- transaccion: no se quedaba a medias, no se aplicaba NADA. Aqui queda su
-- indice, que es lo que esta migracion si aporta.

create index ordenes_por_mostradorista
  on ordenes (organizacion_id, mostradorista_id)
  where mostradorista_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table notas_mostrador enable row level security;
alter table notas_mostrador force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table notas_mostrador from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table notas_mostrador to morphiqpos_app;
  end if;
end;
$$;
