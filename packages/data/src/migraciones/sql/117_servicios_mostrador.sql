-- 117 · Servicios de mostrador: lo que se cobra sin inventario (F-141…F-144).
--
-- ── Lo que hoy se cobra «aparte» y no está en ningún reporte ─────────────
-- Copia de llave, entonado de pintura, corte de vidrio y de madera a medida,
-- cuerda a tubo. Puede ser del 4 % al 8 % de la venta con márgenes del 60 % al
-- 80 %, y hoy **no está en ningún reporte de ningún sistema del segmento**: se
-- cobra suelto, el material que consume sale del inventario sin renglón, y el
-- margen del negocio se reporta más bajo de lo que es.
--
-- ── Por qué NO es F-255 ni F-507 ────────────────────────────────────────
-- F-255 es dinero ajeno en tránsito, donde el negocio no hace nada: aquí el
-- negocio TRABAJA y el material es suyo. F-507 es la orden de trabajo de A4,
-- con cita, diagnóstico y entrega en otro día: aquí se hace en el mostrador, en
-- tres minutos, dentro de la misma venta.
--
-- ── Por qué `consumos` es jsonb y el ledger sigue mandando ──────────────
-- Cada consumo escribe su propio movimiento en `movimientos_stock`, como
-- cualquier otra salida. El `jsonb` guarda el índice —qué se usó y cuál fue su
-- movimiento— para poder pintar el servicio completo sin recorrer el ledger. La
-- FUENTE sigue siendo el ledger; esto es la vista, y si alguna vez discrepan,
-- gana el ledger.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table servicios_mostrador (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  -- Un servicio pertenece a UNA partida de la venta: es lo que hace que entre
  -- al ticket, al corte y al margen en vez de cobrarse «aparte».
  orden_linea_id      uuid        not null references orden_lineas (id) on delete cascade,
  tipo                text        not null,
  -- Sólo la MANO DE OBRA. El material va por su lado, valuado a costo por el
  -- ledger: sumarlos aquí escondería el margen, que es justo lo que esta
  -- función viene a sacar a la luz.
  mano_obra_centavos  bigint      not null check (mano_obra_centavos >= 0),
  -- Medidas del corte, fórmula del color, tipo de llave. Es lo que se consulta
  -- cuando el cliente vuelve por «otra igual».
  parametros          jsonb       not null default '{}'::jsonb,
  -- `[{productoId, cantidadBase, movimientoStockId}]` — el índice, no la fuente.
  consumos            jsonb       not null default '[]'::jsonb,

  empleado_id         uuid        references empleos (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint servicio_tipo_valido check (
    tipo in ('copia_llave', 'entonado', 'corte_vidrio', 'corte_madera', 'cuerda_tubo', 'otro')
  ),

  -- Un servicio por partida. Dos sobre la misma línea son dos manos de obra
  -- cobradas una sola vez.
  unique (orden_linea_id)
);

comment on table servicios_mostrador is
  'F-258 · Copia de llave, entonado, corte a medida. Consume material propio y cobra mano de obra en la misma línea. Hoy se cobra aparte y no está en ningún reporte del segmento.';
comment on column servicios_mostrador.consumos is
  'El índice de lo que se consumió, con su movimiento. La FUENTE es el ledger: si discrepan, gana el ledger.';

create index servicios_por_tipo
  on servicios_mostrador (organizacion_id, tipo, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table servicios_mostrador enable row level security;
  alter table servicios_mostrador force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table servicios_mostrador from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert on table servicios_mostrador to morphiqpos_app;
  end if;
end;
$$;
