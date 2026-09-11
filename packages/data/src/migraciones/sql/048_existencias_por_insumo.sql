-- 048 · La vista `existencias_por_insumo` (F1-02 E4-2, F1-04 §14.3).
--
-- `Ingrediente.stock_actual` es, en el sistema de Miguel, una columna que se
-- lee, se calcula y se ESCRIBE (`POS.jsx:314`, `POS.jsx:359`, `Caja.jsx:745`).
-- Es el defecto D-06: dos cajas cobrando a la vez se pisan el número.
--
-- En el esquema nuevo no existe esa columna. El stock es la proyección del
-- ledger, en `existencias`, movida siempre con `cantidad = cantidad + $delta`
-- dentro de la transacción que la causa. Nunca por sobrescritura.
--
-- Esta vista es sólo el camino de LECTURA: le da al puente un número por
-- insumo para que su pantalla de Inventario siga viéndose igual. Escribir
-- `Ingrediente.stock_actual` deja de funcionar, y es intencionado: es
-- exactamente la operación que corrompe el inventario.
--
-- ── Una desviación declarada respecto a `F1-04` §14.3 ──────────────────────
-- El mapa dice «el almacén principal de la sucursal». Aquí se SUMAN todos los
-- almacenes de la organización. Motivo: su sistema no tiene almacenes —hay un
-- número por ingrediente y ya— y sumar es lo más parecido a lo que él ve hoy.
-- Con un solo almacén, que es el caso de Fase 1, las dos definiciones dan el
-- mismo número. Si algún día hay dos y hace falta distinguirlos, se estrecha
-- aquí y no en veinte pantallas.
create view existencias_por_insumo as
select
  e.insumo_id,
  e.organizacion_id,
  sum(e.cantidad)                                          as cantidad,
  -- El valor del inventario a costo actual, en centavos. Se calcula aquí y no
  -- en el navegador para que la tarjeta «Valor de inventario» no dependa de
  -- que la pantalla haya descargado la lista entera de insumos.
  sum(round(e.cantidad * i.costo_unitario_centavos))::bigint as valor_centavos
from existencias e
join insumos i on i.id = e.insumo_id and i.organizacion_id = e.organizacion_id
group by e.insumo_id, e.organizacion_id;

comment on view existencias_por_insumo is
  'Stock por insumo, sumado sobre los almacenes de la organización. Es el camino de LECTURA '
  'que alimenta Ingrediente.stock_actual en el puente. Escribir stock nunca pasa por aquí: '
  'lo mueve un movimiento de stock dentro de su transacción. Ver F1-04 §14.3 y el defecto D-06.';

-- Misma postura que 005_rls.sql. Una vista hereda los permisos de quien la
-- define, así que sin este revoke sería la puerta abierta a `existencias` que
-- esa tabla ya tiene cerrada.
do $$
declare roles text;
begin
  select string_agg(quote_ident(rolname), ', ') into roles
    from pg_roles where rolname in ('anon','authenticated');
  if roles is null then return; end if;
  execute format('revoke all on public.existencias_por_insumo from %s', roles);
end;
$$;
