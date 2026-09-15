-- 082 · La fila de despacho de mostrador (F-328 y F-329).
--
-- ── El hueco más grande de la carpeta ─────────────────────────────────────
-- Se cobra y el vaso DESAPARECE del sistema. Quince personas esperando algo que
-- el punto de venta no sabe que existe: la barra trabaja de memoria, el cliente
-- pregunta y nadie puede contestar. Es lo que convierte a `operativo` en «un POS
-- de tienda vendiendo café».
--
-- ── Se reutiliza `comandas`, no se crea una tabla nueva ───────────────────
-- El `05-DATOS-Y-BACKEND` habla de `pedidos_preparacion`, que es el nombre que
-- la entidad tiene en el frontend de Miguel; en el esquema es `comandas` y el
-- puente ya las traduce. Crear una tabla paralela para la barra daría dos sitios
-- donde vive «lo que la cocina está preparando», y el día que uno se escriba y
-- el otro no, la pantalla de barra y la de cocina dirían cosas distintas.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

alter table comandas drop constraint comandas_estado_check;
alter table comandas
  add constraint comandas_estado_check check (
    estado in ('nuevo', 'en_preparacion', 'listo', 'entregado', 'cancelado', 'no_recogido')
  );

alter table comandas
  -- Cuándo se cobró. En mostrador el reloj de la espera arranca AQUÍ y no al
  -- crear la comanda: el cliente empieza a esperar cuando paga, no cuando el
  -- sistema decide encolarlo.
  add column cobrado_en timestamptz,
  add column llamados   smallint not null default 0 check (llamados >= 0);

comment on column comandas.cobrado_en is
  'F-328 · El reloj de la espera de mostrador arranca al cobrar, que es cuando el cliente empieza a esperar.';
comment on column comandas.llamados is
  'F-329 · Caché del conteo. La verdad es llamados_pedido, que además dice por qué medio y con cuánto tiempo entre uno y otro.';

-- La consulta caliente es «qué hay vivo en esta barra», y corre cada segundo
-- en la pantalla de despacho.
create index comandas_fila_viva
  on comandas (organizacion_id, estado, cobrado_en)
  where estado in ('nuevo', 'en_preparacion', 'listo');

-- ── F-329 · El ledger de llamados ─────────────────────────────────────────
--
-- ── Por qué una tabla y no un contador ────────────────────────────────────
-- Un contador contesta «¿cuántas veces?». Lo que hace falta contestar es
-- «¿cuántas veces, por qué medio y con cuánto tiempo entre una y otra?». Tres
-- llamados en veinte segundos son un barista nervioso; tres llamados en cuatro
-- minutos son un cliente que ya se fue. Son dos problemas distintos y un
-- contador los confunde.
create table llamados_pedido (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        not null references sucursales (id),
  comanda_id      uuid        not null references comandas (id) on delete cascade,
  medio           text        not null,
  numero_llamado  smallint    not null check (numero_llamado > 0),
  empleado_id     uuid        not null references empleos (id),
  ocurrido_en     timestamptz not null default now(),

  constraint llamado_medio_valido check (medio in ('pantalla', 'voz', 'whatsapp')),
  -- El segundo llamado es el segundo: no hay dos segundos. Sin esto, dos
  -- baristas tocando a la vez dejarían dos «llamado 2» y el conteo de tres que
  -- autoriza marcar `no_recogido` se alcanzaría con dos gritos.
  constraint llamado_numero_unico unique (comanda_id, numero_llamado)
);

comment on table llamados_pedido is
  'F-329 · Ledger INMUTABLE de llamados. Convierte «le grité» en un dato: cuántas veces, por qué medio y con cuánto tiempo entre una y otra.';

create index llamados_por_comanda on llamados_pedido (comanda_id, ocurrido_en);

-- ── INVARIANTE · no se abandona un pedido sin llamarlo tres veces ─────────
--
-- `no_recogido` no es un estado de limpieza: es la decisión de tirar una bebida
-- que alguien pagó. Exigir tres llamados es la diferencia entre «el cliente se
-- fue» y «el barista se hartó», y la que permite defender el dato después.
create or replace function no_recogido_con_tres_llamados() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.estado = 'no_recogido' and coalesce(new.llamados, 0) < 3 then
    raise exception
      'Ese pedido sólo se llamó % vez(ces): hacen falta tres antes de darlo por no recogido', coalesce(new.llamados, 0)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger comandas_no_recogido_con_llamados
  before update on comandas
  for each row execute function no_recogido_con_tres_llamados();

-- ── La vista que lee la pantalla de barra y la de recogida ────────────────
--
-- Las dos leen lo mismo con distinto filtro, y por eso es UNA vista: dos
-- consultas separadas divergirían el día que alguien añada un campo a una.
--
-- `segundos_espera` se mide desde `cobrado_en` y, si falta —una comanda de mesa,
-- que no pasa por barra—, desde `created_at`. NO expone costo, margen ni
-- gramaje: la regla 12 sigue siendo que la barra no ve lo que el negocio gana.
create view fila_barra as
select c.id,
       c.organizacion_id,
       c.sucursal_id,
       c.orden_id,
       o.nombre_pedido,
       o.canal,
       c.estado,
       c.estacion_preparacion_id,
       c.estacion_nombre,
       c.llamados,
       c.notas,
       c.notas_alergias,
       coalesce(c.cobrado_en, c.created_at)                    as encolado_en,
       c.lista_en,
       c.entregada_en,
       greatest(
         0,
         round(
           extract(
             epoch from (
               coalesce(c.entregada_en, now()) - coalesce(c.cobrado_en, c.created_at)
             )
           )
         )
       )::int                                                  as segundos_espera
  from comandas c
  join ordenes o on o.id = c.orden_id
 where c.estado <> 'cancelado';

comment on view fila_barra is
  'F-328 · Un renglón por pedido de barra, con el nombre del vaso, su canal y cuánto lleva esperando. Sin costo, sin margen y sin gramaje.';

alter view fila_barra set (security_invoker = on);

-- `comandas` no tenía sucursal: la heredaba de la orden. La fila de barra se
-- filtra POR SUCURSAL en cada refresco, y resolverla con un `join` en cada
-- lectura de una pantalla que refresca cada segundo es el camino corto a un
-- plan de consulta caro.
alter table comandas add column sucursal_id uuid references sucursales (id);

update comandas c set sucursal_id = o.sucursal_id from ordenes o where o.id = c.orden_id;

create index comandas_por_sucursal on comandas (organizacion_id, sucursal_id, estado);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table llamados_pedido enable row level security;
  alter table llamados_pedido force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table llamados_pedido from %s', roles_publicos);
    execute format('revoke all privileges on fila_barra from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    -- Inmutable: sin update ni delete.
    grant select, insert on table llamados_pedido to morphiqpos_app;
    grant select on fila_barra to morphiqpos_app;
  end if;
end;
$$;
