-- 072 · El ledger de lo que le pasa a una mesa (F-305).
--
-- ── La pregunta que el dueño no puede contestar hoy ────────────────────────
-- «¿Cuánto tarda una mesa en mi restaurante?» De ese número depende su
-- rotación, y de su rotación depende el negocio. Hoy `mesas.estado` sólo guarda
-- el estado ACTUAL: cuando la mesa vuelve a `libre` se borra la historia de la
-- noche y no queda nada que promediar.
--
-- ── Ledger, no columnas ────────────────────────────────────────────────────
-- Añadir `ocupada_desde` y `liberada_en` a `mesas` habría contestado la
-- pregunta del promedio y ninguna otra: no diría cuánto tardó la cuenta en
-- pedirse, ni cuántas veces se sentó gente en la mesa 5 el viernes, ni si la
-- mesa estuvo en limpieza veinte minutos. Un ledger inmutable las contesta
-- todas y no hay que volver a migrar cada vez que alguien pregunta otra cosa.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table eventos_mesa (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id     uuid        not null references sucursales (id),
  mesa_id         uuid        not null references mesas (id) on delete cascade,
  -- La cuenta que había sobre la mesa en ese momento, si había alguna. Nula en
  -- `libre` y en `limpieza`.
  orden_id        uuid        references ordenes (id) on delete set null,
  estado_anterior text,
  estado_nuevo    text        not null,
  personas        smallint    check (personas >= 0),
  empleado_id     uuid        references empleos (id),
  ocurrido_en     timestamptz not null default now(),

  -- Los mismos diez estados de la 045. Se repiten en vez de referenciarlos
  -- porque un `check` no puede mirar otra tabla, y dejarlo en texto libre
  -- convertiría la vista de abajo en un promedio de estados inventados.
  constraint eventos_mesa_estado_valido check (
    estado_nuevo in (
      'libre', 'esperando_orden', 'pedido_enviado', 'en_preparacion',
      'en_espera_entrega', 'ocupada', 'cuenta_solicitada', 'limpieza',
      'pagada', 'cancelada'
    )
  ),
  -- Un evento que no mueve nada es ruido que ensucia la rotación.
  constraint eventos_mesa_transicion_real check (
    estado_anterior is null or estado_anterior <> estado_nuevo
  )
);

comment on table eventos_mesa is
  'F-305 · Ledger INMUTABLE de transiciones de mesa. Sin updated_at y sin update, igual que movimientos_stock. Es la única fuente de la rotación.';

create index eventos_mesa_por_mesa on eventos_mesa (mesa_id, ocurrido_en desc);
create index eventos_mesa_por_sucursal
  on eventos_mesa (organizacion_id, sucursal_id, ocurrido_en desc);

-- ── Conveniencia para el mapa del salón ────────────────────────────────────
--
-- Desnormalización declarada: el mapa pinta 40 mesas y preguntarle al ledger
-- «¿desde cuándo lleva ocupada cada una?» serían 40 consultas con ventana en
-- cada refresco. La verdad sigue siendo `eventos_mesa`; esto es una caché de
-- una sola columna que el mismo comando que escribe el evento mantiene.
alter table mesas add column ocupada_desde timestamptz;

comment on column mesas.ocupada_desde is
  'F-305 · Caché del inicio del ciclo vigente, para el mapa del salón. La verdad es eventos_mesa.';

-- ── Semilla: el presente también es historia ───────────────────────────────
--
-- Sin esta fila, la primera mesa que se libere después de aplicar la migración
-- daría una ocupación que empieza en el instante de la migración, no cuando se
-- sentó la gente. Se siembra con `created_at` de la orden viva cuando la hay, y
-- con el instante de la migración cuando la mesa está libre.
insert into eventos_mesa (organizacion_id, sucursal_id, mesa_id, orden_id, estado_nuevo, personas, ocurrido_en)
select m.organizacion_id,
       m.sucursal_id,
       m.id,
       m.orden_activa_id,
       m.estado,
       nullif(m.personas_actuales, 0),
       coalesce(o.created_at, now())
  from mesas m
  left join ordenes o on o.id = m.orden_activa_id;

update mesas m
   set ocupada_desde = o.created_at
  from ordenes o
 where o.id = m.orden_activa_id
   and m.estado <> 'libre';

-- ── La vista que contesta la pregunta ──────────────────────────────────────
--
-- Un CICLO es todo lo que le pasa a una mesa entre que deja de estar libre y
-- vuelve a estarlo. El truco del `sum() over (... rows between unbounded
-- preceding and 1 preceding)` es contar cuántas veces se liberó ANTES de este
-- evento: así el propio evento `libre` cae dentro del ciclo que cierra, que es
-- lo que hace que `fin` exista.
--
-- El ciclo todavía abierto sale con `fin` nulo a propósito: es lo que permite
-- preguntar «¿cuánto lleva ocupada la mesa 5 ahora mismo?» con la misma vista
-- que da el promedio de la semana. Quien promedie tiene que filtrar
-- `fin is not null`, y por eso está dicho aquí y no sólo en el código.
create view ocupacion_mesas as
with numerados as (
  select e.organizacion_id,
         e.sucursal_id,
         e.mesa_id,
         e.orden_id,
         e.estado_nuevo,
         e.personas,
         e.ocurrido_en,
         sum(case when e.estado_nuevo = 'libre' then 1 else 0 end) over (
           partition by e.organizacion_id, e.mesa_id
           order by e.ocurrido_en, e.id
           rows between unbounded preceding and 1 preceding
         ) as ciclo
    from eventos_mesa e
)
-- Una vista agrupada no tiene clave propia, y el puente exige que toda entidad
-- traiga `id`: su frontend lo usa como clave de lista. Se compone de lo que YA
-- identifica al renglón —la mesa y el número de ciclo—, así que es estable
-- entre consultas y no hace falta materializar nada.
select n.mesa_id::text || ':' || n.ciclo::text                             as id,
       n.organizacion_id,
       n.sucursal_id,
       n.mesa_id,
       n.ciclo,
       max(n.orden_id::text)::uuid                                       as orden_id,
       max(n.personas)                                                   as personas,
       min(n.ocurrido_en)                                                as inicio,
       max(n.ocurrido_en) filter (where n.estado_nuevo = 'libre')        as fin,
       round(extract(epoch from (
         max(n.ocurrido_en) filter (where n.estado_nuevo = 'libre') - min(n.ocurrido_en)
       )) / 60)::int                                                     as minutos_ocupada,
       round(extract(epoch from (
         min(n.ocurrido_en) filter (where n.estado_nuevo = 'cuenta_solicitada')
           - min(n.ocurrido_en)
       )) / 60)::int                                                     as minutos_hasta_cuenta
  from numerados n
 group by n.organizacion_id, n.sucursal_id, n.mesa_id, n.ciclo
-- Un ciclo que sólo contiene el evento `libre` que lo cierra no es una
-- ocupación: es la mesa que ya estaba vacía. Sin esto, el promedio de rotación
-- se llenaría de ceros.
having count(*) filter (where n.estado_nuevo <> 'libre') > 0;

comment on view ocupacion_mesas is
  'F-305 · Un renglón por ciclo de ocupación. `fin` nulo es el ciclo vigente: para promediar rotación hay que filtrarlo.';

-- Una vista hereda la RLS de su tabla base sólo si se declara `security_invoker`.
-- Sin esto correría con los permisos de quien la creó y sería una puerta
-- trasera a la operación de todas las organizaciones.
alter view ocupacion_mesas set (security_invoker = on);

-- ── RLS ────────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table eventos_mesa enable row level security;
  alter table eventos_mesa force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table eventos_mesa from %s', roles_publicos);
    execute format('revoke all privileges on ocupacion_mesas from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    -- Inmutable: sin update ni delete, igual que movimientos_stock.
    grant select, insert on table eventos_mesa to morphiqpos_app;
    grant select on ocupacion_mesas to morphiqpos_app;
  end if;
end;
$$;
