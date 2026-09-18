-- 091 · Zonas de anaquel y conteo cíclico (F-149), sobre la toma física (F-106).
--
-- ── Por qué F-149 antes que F-106, aunque dependa de ella ─────────────────
-- La toma completa de una tienda de 1,800 SKU tarda un domingo entero y por eso
-- se hace una vez al año o nunca. El conteo cíclico cuenta UNA zona por día —hoy
-- la reja de refrescos, mañana el anaquel de aceites— en veinte minutos, en el
-- valle de las once. Es lo único que convierte el dolor número uno de una
-- tiendita en una rutina sostenible. Sin F-149, F-106 existe y no se usa.
--
-- ── Lo que esta migración NO vuelve a construir ───────────────────────────
-- El motor ya está: la 061 creó `tomas_inventario` y `toma_conteos` con el
-- `esperado` sellado al contar, y `packages/data/src/repos/tomas-inventario.ts`
-- lo opera. Lo que falta es lo que hace que el conteo vuelva mañana: una zona
-- que sepa cada cuántos días toca y cuándo se contó por última vez.
--
-- ── La zona deja de ser texto libre ───────────────────────────────────────
-- La 061 la dejó como `tomas_inventario.zona text` porque entonces no había nada
-- que colgarle. Un texto no puede llevar `dias_entre_conteos` ni
-- `ultimo_conteo_en`, que son los dos datos que responden «¿qué toca contar
-- hoy?». Sin esa pregunta contestada, el conteo cíclico es una intención.
-- Además, dos personas escriben «Refrescos» y «refrescos» y el historial de una
-- misma zona queda partido en dos.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table zonas_anaquel (
  id                  uuid        primary key default gen_random_uuid(),
  organizacion_id     uuid        not null references organizaciones (id) on delete cascade,
  -- La zona es física y es de la sucursal: «Congelador» no significa lo mismo en
  -- dos tiendas, y recorrerla es caminar por una de ellas.
  sucursal_id         uuid        references sucursales (id) on delete cascade,

  nombre              text        not null check (length(trim(nombre)) > 0),
  -- Para recorrer la tienda en el orden físico. Contar saltando de la reja al
  -- congelador y de vuelta es cómo se cuenta dos veces lo mismo.
  orden               int         not null default 0,
  -- 7 en refrescos, 90 en abarrote seco. Lo que rota rápido se cuenta seguido;
  -- una sola frecuencia para todo hace que sobre conteo donde no hace falta y
  -- falte donde sí.
  dias_entre_conteos  int         not null default 30 check (dias_entre_conteos between 1 and 365),
  ultimo_conteo_en    timestamptz,
  activa              boolean     not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (organizacion_id, sucursal_id, nombre)
);

comment on table zonas_anaquel is
  'F-149 · Una zona física de la tienda. Lleva cada cuántos días toca contarla y cuándo se contó por última vez: es lo que convierte el conteo en rutina.';
comment on column zonas_anaquel.dias_entre_conteos is
  '7 en refrescos, 90 en abarrote seco. Una sola frecuencia para todo sobra donde no hace falta y falta donde sí.';

create index zonas_anaquel_por_recorrido
  on zonas_anaquel (organizacion_id, sucursal_id, orden) where activa;

create trigger zonas_anaquel_tocar_updated_at
  before update on zonas_anaquel
  for each row execute function tocar_updated_at();

-- ── La zona se cuelga del INSUMO, no del producto ─────────────────────────
--
-- `05-DATOS-Y-BACKEND.md` §2 propone `productos.zona_id`. Es lo que se cuenta lo
-- que tiene que saber dónde vive, y lo que se cuenta es el insumo: `toma_conteos`
-- lleva `insumo_id`. Con la zona en el producto, un insumo sin producto —el
-- envase, el granel que aún no se empaquetó— sería invisible para el recorrido, y
-- un producto con dos insumos no sabría en qué anaquel contarse.
alter table insumos add column zona_id uuid references zonas_anaquel (id) on delete set null;

create index insumos_por_zona
  on insumos (organizacion_id, zona_id) where zona_id is not null;

-- ── `tomas_inventario.zona` asciende de texto a fila ──────────────────────
alter table tomas_inventario add column zona_id uuid references zonas_anaquel (id);

-- Cada texto distinto que ya existiera se convierte en su zona, una por
-- organización. Sin esto, las tomas históricas perderían el único dato que decía
-- qué se había contado.
insert into zonas_anaquel (organizacion_id, sucursal_id, nombre)
select distinct t.organizacion_id, null::uuid, trim(t.zona)
  from tomas_inventario t
 where t.zona is not null and length(trim(t.zona)) > 0
on conflict do nothing;

update tomas_inventario t
   set zona_id = z.id
  from zonas_anaquel z
 where z.organizacion_id = t.organizacion_id
   and z.sucursal_id is null
   and z.nombre = trim(t.zona)
   and t.zona is not null;

alter table tomas_inventario drop column zona;

create index tomas_inventario_por_zona
  on tomas_inventario (organizacion_id, zona_id) where zona_id is not null;

-- ── Lo que tecleó la persona, tal cual ────────────────────────────────────
--
-- Cuando alguien reclama «yo conté nueve cajas», tiene que poder verse que
-- capturó nueve cajas y que el sistema convirtió a 216 piezas. Sin el crudo,
-- toda discusión de conteo acaba en la palabra de uno contra la del sistema, y
-- ésa es una discusión que el sistema pierde aunque tenga razón.
alter table toma_conteos add column capturas jsonb not null default '[]'::jsonb;

-- El ajuste que salió de esta línea. Null mientras la toma esté abierta: el
-- conteo NO escribe existencias, escribe lo contado, y el ajuste es un
-- movimiento aparte con su motivo para que el kardex lo pueda explicar.
alter table toma_conteos add column movimiento_ajuste_id uuid references movimientos_stock (id);

comment on column toma_conteos.capturas is
  'Lo que tecleó la persona, tal cual: [{presentacionId, cantidad, factor}]. Sin el crudo, «yo conté nueve cajas» no se puede comprobar.';

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table zonas_anaquel enable row level security;
  alter table zonas_anaquel force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table zonas_anaquel from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table zonas_anaquel to morphiqpos_app;
  end if;
end;
$$;
