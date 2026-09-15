-- 057 · Proyección de pagos que consume la interfaz heredada.
--
-- `ordenes.total_centavos` conserva la venta SIN propina. Los importes de la
-- propina y su método viven en `pagos`; exponerlos desde la misma tabla de la
-- orden los duplicaría y permitiría que se desincronizaran. Esta vista hace el
-- salto de lectura que necesita el puente sin crear una segunda verdad.
create view ordenes_pagos_resumen as
select
  o.id as orden_id,
  o.organizacion_id,
  coalesce(sum(p.propina_centavos) filter (where p.estado = 'confirmado'), 0)::bigint
    as propina_monto_centavos,
  coalesce(sum(p.propina_centavos) filter (
    where p.estado = 'confirmado' and p.metodo = 'efectivo'
  ), 0)::bigint as propina_efectivo_centavos,
  coalesce(sum(p.propina_centavos) filter (
    where p.estado = 'confirmado' and p.metodo = 'tarjeta'
  ), 0)::bigint as propina_tarjeta_centavos,
  coalesce(sum(p.propina_centavos) filter (
    where p.estado = 'confirmado' and p.metodo = 'transferencia'
  ), 0)::bigint as propina_transferencia_centavos,
  (
    o.total_centavos +
    coalesce(sum(p.propina_centavos) filter (where p.estado = 'confirmado'), 0)
  )::bigint as total_cobrado_centavos,
  case count(distinct p.metodo) filter (where p.estado = 'confirmado')
    when 0 then null
    when 1 then min(p.metodo) filter (where p.estado = 'confirmado')
    else 'mixto'
  end as metodo_pago,
  coalesce(sum(p.monto_centavos + p.propina_centavos) filter (
    where p.estado = 'confirmado' and p.metodo = 'efectivo'
  ), 0)::bigint as monto_efectivo_centavos,
  coalesce(sum(p.monto_centavos + p.propina_centavos) filter (
    where p.estado = 'confirmado' and p.metodo = 'tarjeta'
  ), 0)::bigint as monto_tarjeta_centavos,
  coalesce(sum(p.monto_centavos + p.propina_centavos) filter (
    where p.estado = 'confirmado' and p.metodo = 'transferencia'
  ), 0)::bigint as monto_transferencia_centavos,
  coalesce(sum(p.cambio_centavos) filter (where p.estado = 'confirmado'), 0)::bigint
    as cambio_centavos
from ordenes o
left join pagos p
  on p.orden_id = o.id
 and p.organizacion_id = o.organizacion_id
group by o.id, o.organizacion_id, o.total_centavos;

comment on view ordenes_pagos_resumen is
  'Importes de pago y propina por orden, derivados de pagos confirmados. '
  'Los montos por método son lo físicamente recibido: venta más propina, después del cambio.';

-- La aplicación la usa con credenciales de servidor. PostgREST no debe poder
-- convertir la vista en una vía pública hacia pagos u órdenes.
do $$
declare roles text;
begin
  select string_agg(quote_ident(rolname), ', ') into roles
    from pg_roles where rolname in ('anon','authenticated');
  if roles is null then return; end if;
  execute format('revoke all on public.ordenes_pagos_resumen from %s', roles);
end;
$$;
