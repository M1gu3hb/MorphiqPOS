-- 060 · F-103 · Kardex: el historial de un artículo con su saldo corrido.
--
-- ── Por qué es una vista y no una tabla ────────────────────────────────────
-- Porque el dato ya existe. `movimientos_stock` es un ledger inmutable desde la
-- migración 011: cada entrada, salida, ajuste y merma está ahí con su cantidad
-- firmada, su referencia y su fecha. El kardex es esa misma verdad LEÍDA de
-- otra forma — con el saldo acumulado al lado de cada renglón.
--
-- Guardarlo en una tabla obligaría a mantener dos fuentes del mismo número y
-- crearía la posibilidad de que discrepen, que es exactamente el defecto que un
-- ledger inmutable existe para no tener. Es la trampa del stock read-then-write
-- (P1-03 de la Fase 1) aplicada al historial.
--
-- ── Lo que resuelve, en la operación ───────────────────────────────────────
-- «¿Cuánto dinero tengo dormido y en qué?» y «¿por qué el sistema dice 40 y hay
-- 36?». Hoy, sin kardex, la segunda no tiene renglón: se sabe el saldo actual y
-- no cómo se llegó a él. La carpeta de `ferreteria` lo marca como la mitad de su
-- dolor 2.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- El índice que hace que el kardex de un artículo no recorra el ledger entero.
-- Sin él, una ferretería con 6 000 claves y dos años de movimientos tarda
-- segundos en abrir una ficha, y una ficha que tarda no se consulta.
create index if not exists movimientos_stock_kardex
  on movimientos_stock (organizacion_id, insumo_id, almacen_id, created_at, id);

create view kardex as
select
  m.organizacion_id,
  m.almacen_id,
  m.insumo_id,
  m.id                                                as movimiento_id,
  m.created_at,
  m.tipo,
  m.motivo,
  m.cantidad,
  m.unidad,
  m.costo_unitario_centavos,
  -- El costo del renglón en pesos-centavos. `cantidad` viene firmada, así que
  -- una salida da un costo negativo y la suma corrida funciona sola.
  round(m.cantidad * m.costo_unitario_centavos)::bigint as importe_centavos,
  m.referencia_tipo,
  m.referencia_id,
  m.empleado_id,
  -- EL SALDO CORRIDO. La partición es por (organización, almacén, insumo)
  -- porque el mismo insumo en dos almacenes son dos saldos, y sumarlos daría un
  -- número que no existe en ningún estante.
  sum(m.cantidad) over (
    partition by m.organizacion_id, m.almacen_id, m.insumo_id
    order by m.created_at, m.id
    rows between unbounded preceding and current row
  ) as saldo
from movimientos_stock m;

comment on view kardex is
  'F-103 · El ledger de movimientos con su saldo corrido por almacén. Es una VISTA: la verdad sigue siendo movimientos_stock, que es inmutable.';

-- Una vista hereda la RLS de su tabla base sólo si se declara `security_invoker`.
-- Sin esto, la vista correría con los permisos de quien la creó y sería una
-- puerta trasera al ledger de todas las organizaciones.
alter view kardex set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on kardex from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on kardex to morphiqpos_app;
  end if;
end;
$$;
