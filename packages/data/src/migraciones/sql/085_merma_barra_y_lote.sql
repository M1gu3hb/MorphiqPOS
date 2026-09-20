-- 085 · La merma de barra y la frescura del grano (F-156 y F-157).
--
-- ── $700 al mes, invisibles ───────────────────────────────────────────────
-- La calibración del molino tira café todas las mañanas; el vapor, el derrame y
-- la bebida rehecha se llevan entre el 5 y el 15 % de la leche. Nada de eso se
-- registra, así que el inventario de café NUNCA cuadra y la dueña concluye que
-- «las recetas no sirven» — y deja de confiar en el único número que tenía.
--
-- ── F-156 NO CREA TABLA ───────────────────────────────────────────────────
-- La merma ya se escribe en `movimientos_stock` con su motivo tipado desde la
-- 062, y los motivos son una TABLA justamente para que cada giro siembre los
-- suyos. Esta migración siembra los cuatro de barra, añade el vínculo con el
-- turno y crea la vista. Una tabla paralela de merma daría el mismo hecho en dos
-- sitios y el día que uno se escriba y el otro no, el inventario y el reporte
-- dirían cosas distintas.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── F-156 · Los motivos de barra ──────────────────────────────────────────
insert into motivos_merma (clave, etiqueta, giro, imputable) values
  ('calibracion',    'Calibración del molino',    'cafeteria', false),
  ('derrame',        'Derrame o vaso tirado',     'cafeteria', true),
  ('bebida_rehecha', 'Bebida rehecha',            'cafeteria', true),
  ('vapor_leche',    'Leche sobrante del vapor',  'cafeteria', false)
on conflict (clave) do nothing;

-- `calibracion` y `vapor_leche` NO son imputables y eso es una decisión, no un
-- descuido: calibrar es obligatorio para que el espresso salga bien, y la leche
-- que sobra del vapor es física. Cobrárselas a alguien haría que dejara de
-- registrarlas, y entonces volveríamos al punto de partida.

alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in (
      'orden', 'compra', 'conteo', 'manual', 'consumo_interno', 'anulacion', 'merma_barra'
    )
  );

-- La merma de barra se reporta POR TURNO, que es la unidad en la que el
-- negocio piensa: «esta mañana se fueron 180 g calibrando». Deducir el turno
-- por rango de horas contra `sesiones_caja` funcionaría hasta el día que dos
-- turnos se solapen cinco minutos en el cambio.
alter table movimientos_stock
  add column sesion_caja_id uuid references sesiones_caja (id);

create index movimientos_stock_por_sesion
  on movimientos_stock (organizacion_id, sesion_caja_id)
  where sesion_caja_id is not null;

comment on column movimientos_stock.sesion_caja_id is
  'F-156 · El turno al que pertenece el movimiento. Nulo en lo histórico y en lo que no nace de un turno.';

-- ── F-157 · El lote de grano que está en la tolva ─────────────────────────
--
-- ── Lo que esta tabla NO hace, dicho sin adornos ──────────────────────────
-- No traza. No sabe qué lote se usó en el latte del martes. Sabe qué lote está
-- en la tolva HOY y cuántos días lleva del tueste, que es lo único que dispara
-- una decisión —«este café ya no sirve para espresso»—. Trazabilidad completa
-- sería V4 (F-124) y nadie en este giro la pediría jamás. Es el 90 % del
-- beneficio por el 10 % del trabajo, y está escrito aquí para que nadie lo
-- «mejore» después.
create table lotes_grano (
  id               uuid          primary key default gen_random_uuid(),
  organizacion_id  uuid          not null references organizaciones (id) on delete cascade,
  sucursal_id      uuid          not null references sucursales (id),
  insumo_id        uuid          not null references insumos (id) on delete cascade,
  fecha_tueste     date          not null,
  compra_linea_id  uuid,
  abierto_en       timestamptz,
  agotado_en       timestamptz,
  gramos_recibidos numeric(14, 4) not null check (gramos_recibidos > 0),
  empleado_id      uuid          not null references empleos (id),
  created_at       timestamptz   not null default now(),

  constraint lote_agota_despues_de_abrir check (
    agotado_en is null or (abierto_en is not null and agotado_en >= abierto_en)
  ),
  -- Un tueste futuro es un error de tecleo, y uno que se cuela arruina el
  -- único dato que esta tabla aporta.
  constraint lote_tueste_no_futuro check (fecha_tueste <= current_date)
);

comment on table lotes_grano is
  'F-157 · Qué lote está en la tolva y cuántos días lleva del tueste. NO traza: no sabe qué lote se usó en el latte del martes, y no le hace falta.';

-- UN solo lote abierto por insumo. Dos bolsas abiertas a la vez es lo que pasa
-- en la barra de verdad, pero el sistema no puede saber de cuál se sirvió: con
-- una sola el dato es exacto, con dos sería una media que no describe nada.
create unique index lotes_grano_uno_abierto_por_insumo
  on lotes_grano (insumo_id)
  where abierto_en is not null and agotado_en is null;

create index lotes_grano_por_insumo
  on lotes_grano (organizacion_id, insumo_id, fecha_tueste desc);

alter table insumos
  add column dias_frescura_optima smallint check (dias_frescura_optima > 0),
  add column lote_abierto_id      uuid references lotes_grano (id),
  -- La leche se compra en litros y se mide en ml. Que la unidad de CAPTURA sea
  -- distinta de la unidad base es lo que evita que alguien «arregle» la unidad
  -- base y abra el error de 1000× que la 080 acaba de cerrar.
  add column unidad_captura_preferida text;

comment on column insumos.dias_frescura_optima is
  'F-157 · A partir de aquí el grano se nota en la taza. Nulo = no aplica: sólo el café lo lleva.';
comment on column insumos.lote_abierto_id is
  'F-157 · Caché del lote en la tolva. La verdad es lotes_grano; esto evita una consulta con ventana en cada pantalla.';

-- ── F-157 · Productos que se sirven por shot ──────────────────────────────
--
-- El gramaje del shot es lo que convierte «calibré cuatro shots» en «se fueron
-- 72 g de grano» sin que el barista tenga que pesar nada en la ráfaga.
alter table productos add column gramaje_shot numeric(14, 4) check (gramaje_shot > 0);

comment on column productos.gramaje_shot is
  'F-156 · Gramos de grano por shot. Es lo que traduce «calibré cuatro» a una salida de inventario exacta.';

-- ── La vista del corte y del dashboard ────────────────────────────────────
create view merma_barra_turno as
select m.organizacion_id,
       m.sesion_caja_id,
       m.motivo,
       max(mm.etiqueta)                              as etiqueta,
       m.insumo_id,
       max(i.nombre)                                 as insumo_nombre,
       max(m.unidad)                                 as unidad,
       sum(abs(m.cantidad))                          as cantidad,
       sum(abs(m.cantidad) * m.costo_unitario_centavos)::bigint as costo_centavos,
       count(*)::int                                 as eventos
  from movimientos_stock m
  join insumos i on i.id = m.insumo_id
  left join motivos_merma mm on mm.clave = m.motivo
 where m.referencia_tipo = 'merma_barra'
 group by m.organizacion_id, m.sesion_caja_id, m.motivo, m.insumo_id;

comment on view merma_barra_turno is
  'F-156 · La sección 11 del corte: qué se fue en la barra este turno, por motivo e insumo, con su costo.';

alter view merma_barra_turno set (security_invoker = on);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table lotes_grano enable row level security;
  alter table lotes_grano force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table lotes_grano from %s', roles_publicos);
    execute format('revoke all privileges on merma_barra_turno from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table lotes_grano to morphiqpos_app;
    grant select on merma_barra_turno to morphiqpos_app;
  end if;
end;
$$;
