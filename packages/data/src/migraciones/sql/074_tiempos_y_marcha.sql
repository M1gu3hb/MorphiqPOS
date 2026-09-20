-- 074 · Marcha por tiempos y reloj de cocina (F-323 y F-315).
--
-- ── La operación normal del servicio de mesa en México ─────────────────────
-- Se comandan las entradas, se RETIENEN los fuertes, y el mesero los «marcha»
-- cuando ve que la mesa va terminando. Hoy el sistema manda todo de golpe y el
-- fuerte se enfría en la barra mientras el comensal come su sopa. No lo cubre
-- F-310 —enviar— ni F-314 —estados—: retener y liberar es otra cosa.
--
-- ── Y por eso el reloj de F-315 arranca al MARCHAR ────────────────────────
-- Cocina ve «hace 12 minutos» en texto relativo, sin umbral ni color, y no hay
-- forma de saber si 12 minutos es normal para ese platillo o es un desastre.
-- Pero el reloj no puede arrancar al capturar: un fuerte retenido cuarenta
-- minutos saldría siempre en rojo sin que la cocina haya hecho nada mal.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── F-323 · La línea sabe en qué tiempo va y si ya se marchó ──────────────
alter table orden_lineas
  add column marcha_estado   text     not null default 'inmediata',
  add column tiempo_servicio smallint;

alter table orden_lineas
  add constraint orden_linea_marcha_valida check (
    marcha_estado in ('inmediata', 'retenida', 'marchada')
  );

-- Seis tiempos es más de lo que cualquier menú de este giro usa —entrada,
-- fuerte, postre son tres— y el tope existe para que un cliente no cree
-- cuatrocientos tiempos vacíos en una cuenta.
alter table orden_lineas
  add constraint orden_linea_tiempo_valido check (
    tiempo_servicio is null or (tiempo_servicio >= 1 and tiempo_servicio <= 6)
  );

-- Una línea RETENIDA o MARCHADA pertenece a un tiempo; una inmediata, no. Sin
-- esto, «marchar el tiempo 2» no encontraría sus líneas y el fuerte se quedaría
-- retenido para siempre.
alter table orden_lineas
  add constraint orden_linea_marcha_con_tiempo check (
    (marcha_estado = 'inmediata') or (tiempo_servicio is not null)
  );

comment on column orden_lineas.marcha_estado is
  'F-323 · `retenida` no se manda a cocina hasta que el mesero la marcha. El reloj de F-315 arranca ahí.';

create index orden_lineas_retenidas
  on orden_lineas (orden_id, tiempo_servicio)
  where marcha_estado = 'retenida';

-- El menú dice qué es entrada y qué es fuerte; el mesero lo puede cambiar por
-- línea, porque la mesa que pide el postre primero existe.
alter table productos add column tiempo_servicio_default smallint;

alter table productos
  add constraint producto_tiempo_valido check (
    tiempo_servicio_default is null
      or (tiempo_servicio_default >= 1 and tiempo_servicio_default <= 6)
  );

comment on column productos.tiempo_servicio_default is
  'F-323 · 1 la entrada, 2 el fuerte, 3 el postre. Nulo = va inmediato.';

-- ── INVARIANTE · lo retenido NO llega a cocina ────────────────────────────
--
-- Es la única regla que F-323 no puede permitirse perder: si una línea retenida
-- se cuela en una comanda, el plato sale cuarenta minutos antes de tiempo y el
-- comensal lo recibe frío junto con la sopa. Se impone en la base y no sólo en
-- el comando porque el comando es uno de varios caminos —el portal QR es otro—.
create or replace function comanda_item_no_retenido() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from orden_lineas l
     where l.id = new.orden_linea_id and l.marcha_estado = 'retenida'
  ) then
    raise exception
      'Esa línea está retenida: se marcha antes de mandarla a cocina (línea %)', new.orden_linea_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger comanda_items_no_retenidos
  before insert on comanda_items
  for each row execute function comanda_item_no_retenido();

-- ── F-315 · El reloj de cada platillo ─────────────────────────────────────
alter table comandas add column marchada_en timestamptz;

comment on column comandas.marchada_en is
  'F-315 · Cuándo se soltó a cocina. El reloj arranca AQUÍ, no al crear la comanda: un fuerte retenido saldría siempre en rojo.';

alter table comanda_items
  add column iniciado_en       timestamptz,
  add column listo_en          timestamptz,
  -- Instantánea de `productos.minutos_preparacion` al comandar. Leerlo del
  -- catálogo al consultar compararía el tiempo real de anoche contra el
  -- estimado que alguien cambió esta mañana.
  add column minutos_estimados smallint;

alter table comanda_items
  add constraint comanda_item_listo_despues check (
    listo_en is null or iniciado_en is null or listo_en >= iniciado_en
  );

create index comanda_items_por_tiempo on comanda_items (comanda_id, listo_en);

-- ── La vista que le pone color a la pantalla de cocina ────────────────────
--
-- `minutos_reales` se mide de la MARCHA a `listo`, no del `insert` de la
-- comanda: es el tiempo que la cocina tuvo el plato, que es lo único de lo que
-- la cocina responde.
--
-- `desviacion_bp` en puntos base y no en porcentaje flotante, por la misma
-- razón que el dinero: un 33.333333 % redondeado distinto en dos pantallas
-- hace que dos personas discutan sobre el mismo plato.
-- ── Por qué la sucursal sale de la ORDEN y no de la comanda ───────────────
-- `comandas.sucursal_id` no existe todavía cuando esta migración corre: lo
-- añade la 082, ocho números más adelante, como denormalización para la fila
-- de barra. Escrito como `c.sucursal_id`, este `create view` abortaba con
-- «column c.sucursal_id does not exist» — y como la tanda entera va en UNA
-- transacción, eso no dejaba a medias las migraciones: no dejaba aplicar
-- NINGUNA. Lo cazó el ensayo con datos, no las 2 567 pruebas unitarias.
--
-- La orden SIEMPRE tiene sucursal (`not null` desde la 003) y es de donde la
-- comanda la heredaba antes de que la 082 la copiara. El valor es el mismo.
create view tiempos_preparacion as
select i.id,
       i.organizacion_id,
       o.sucursal_id,
       i.comanda_id,
       c.estacion_preparacion_id,
       i.orden_linea_id,
       i.producto_id,
       i.producto_nombre,
       i.minutos_estimados,
       round(extract(epoch from (i.listo_en - coalesce(c.marchada_en, i.iniciado_en))) / 60)::int
         as minutos_reales,
       case
         when i.minutos_estimados is null or i.minutos_estimados = 0 then null
         when i.listo_en is null then null
         else round(
           (extract(epoch from (i.listo_en - coalesce(c.marchada_en, i.iniciado_en))) / 60
             - i.minutos_estimados) * 10000 / i.minutos_estimados
         )::int
       end as desviacion_bp,
       coalesce(c.marchada_en, i.iniciado_en) as arrancado_en,
       i.listo_en
  from comanda_items i
  join comandas c on c.id = i.comanda_id
  join ordenes  o on o.id = c.orden_id
 where i.estado <> 'cancelado';

comment on view tiempos_preparacion is
  'F-315 · Un renglón por item con su estimado, su real y la desviación en puntos base. `minutos_reales` nulo es un plato que todavía no sale.';

alter view tiempos_preparacion set (security_invoker = on);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on tiempos_preparacion from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on tiempos_preparacion to morphiqpos_app;
  end if;
end;
$$;
