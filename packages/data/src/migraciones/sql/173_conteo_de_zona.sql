-- 173 · `conteo_de_zona`: los productos de la zona que TOCA CONTAR HOY.
--
-- ── EL HUECO ────────────────────────────────────────────────────────────────
-- `abarrotes/Conteo.tsx` se hidrata de la entidad `ConteoDeZona` del puente y
-- **esa entidad no existía**: el puente contestaba `PUENTE_ENTIDAD_DESCONOCIDA`,
-- la pantalla caía en su rama de error y el conteo cíclico —el único renglón que
-- contesta «¿quién me está robando?»— no tenía por dónde entrar. La 091 construyó
-- `zonas_anaquel` con `dias_entre_conteos` y `ultimo_conteo_en`, y la 061
-- `tomas_inventario`/`toma_conteos`: el motor estaba y nadie podía verlo.
--
-- ── POR QUÉ LA VISTA ELIGE LA ZONA, y no la pantalla ───────────────────────
-- Porque «¿qué toca contar hoy?» se contesta con dos columnas que ya están en la
-- base —cada cuántos días toca y cuándo se contó— y la pantalla que tuviera que
-- calcularlo pediría primero la lista de zonas, después sus productos, y con el
-- encargado de pie frente al anaquel. Se sirve UNA zona: la más atrasada de la
-- organización, y con eso `filas[0].zona` es la zona del recorrido de hoy.
--
-- El desempate es `orden` y luego `nombre`, que es el orden FÍSICO del recorrido:
-- dos zonas igual de atrasadas se cuentan en el orden en que se camina la tienda,
-- no en el que Postgres devuelva las filas.
--
-- ── POR QUÉ EL `esperado` DE AQUÍ NO ES EL QUE AJUSTA ──────────────────────
-- El `esperado` que decide el ajuste es el que `repoTomas.anotarConteo` SELLA en
-- `toma_conteos` al capturar cada renglón, contra el almacén de la toma, que sale
-- de la sesión. El de esta vista es el que la pantalla usa para su resumen —y que
-- **no se pinta mientras se cuenta**, a ciegas a propósito—, así que se suma sobre
-- los almacenes PRINCIPALES de la sucursal de la zona: es el saldo que el
-- encargado tiene enfrente. Una zona sin sucursal —la tiendita de un local— suma
-- los principales de la organización, que en ese caso es el mismo almacén.
--
-- Decirlo importa: si algún día la vista y el sello discreparan, el que manda es
-- el sello, y este comentario es el que evita que alguien "arregle" el ajuste
-- cambiando la vista.
--
-- ── POR QUÉ `piezas_por_caja` ES EL FACTOR MÁS GRANDE ──────────────────────
-- La pantalla pide dos campos, «cajas» y «piezas», porque así se cuenta un
-- anaquel: nueve cajas y cuatro sueltas. La caja es la presentación más grande
-- que el catálogo tenga de ese producto; sin ninguna, es 1 y los dos campos suman
-- piezas, que es lo correcto para lo que se vende de uno en uno.

create view conteo_de_zona as
with atrasadas as (
  select z.id,
         z.organizacion_id,
         z.sucursal_id,
         z.nombre,
         z.orden,
         -- Sin conteo previo, la zona lleva esperando desde que se creó: tratar
         -- el nulo como «recién contada» esconde justo la zona que nunca se ha
         -- contado, que es la que más falta hace.
         floor(
           extract(epoch from (now() - coalesce(z.ultimo_conteo_en, z.created_at))) / 86400
         )::int as dias_sin_contar,
         z.dias_entre_conteos
    from zonas_anaquel z
   where z.activa
),
elegida as (
  select a.*,
         row_number() over (
           partition by a.organizacion_id
           order by (a.dias_sin_contar - a.dias_entre_conteos) desc, a.orden, a.nombre
         ) as turno
    from atrasadas a
)
select i.id                                         as insumo_id,
       i.organizacion_id,
       -- El nombre del PRODUCTO cuando lo hay: es el que está impreso en el
       -- anaquel. El del insumo es el de almacén —«refresco cola 600 granel»— y
       -- no es el que el encargado tiene delante.
       coalesce(p.nombre, i.nombre)                 as nombre,
       e.nombre                                     as zona,
       e.dias_sin_contar,
       coalesce(p.codigo_barras, p.sku)             as codigo,
       coalesce(caja.factor, 1)                     as piezas_por_caja,
       coalesce(saldo.cantidad, 0)                  as esperado,
       coalesce(p.costo_unitario_centavos, i.costo_unitario_centavos) as costo_centavos
  from elegida e
  join insumos i
    on i.zona_id = e.id
   and i.organizacion_id = e.organizacion_id
   and i.activo
  left join productos p
    on p.id = i.producto_id
   and p.organizacion_id = i.organizacion_id
  left join lateral (
    select max(pp.factor) as factor
      from producto_presentaciones pp
     where pp.producto_id = i.producto_id
       and pp.organizacion_id = i.organizacion_id
       and pp.activa
  ) caja on true
  left join lateral (
    select sum(x.cantidad) as cantidad
      from existencias x
      join almacenes a
        on a.id = x.almacen_id
       and a.activo
       and a.principal
     where x.insumo_id = i.id
       and x.organizacion_id = i.organizacion_id
       and (e.sucursal_id is null or a.sucursal_id = e.sucursal_id)
  ) saldo on true
 where e.turno = 1;

comment on view conteo_de_zona is
  'F-149 · Los productos de la zona que toca contar hoy: la más atrasada de la organización, desempatada por el orden físico del recorrido. El `esperado` es para el resumen de la pantalla; el que ajusta es el que `toma_conteos` sella al capturar.';

alter view conteo_de_zona set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on conteo_de_zona from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on conteo_de_zona to morphiqpos_app;
  end if;
end;
$$;

-- ── La comprobación de la propia migración ─────────────────────────────────
-- UNA zona por organización. Si el `row_number` se rompe —alguien le quita el
-- `partition by`, o el desempate deja dos filas con turno 1— la pantalla
-- mezclaría dos anaqueles en un solo recorrido y el porcentaje de diferencia,
-- que es lo único que el dueño se lleva, saldría de una zona y media.
do $$
declare
  mezcladas int;
begin
  select count(*)
    into mezcladas
    from (
      select organizacion_id
        from conteo_de_zona
       group by organizacion_id
      having count(distinct zona) > 1
    ) revueltas;

  if mezcladas > 0 then
    raise exception 'conteo_de_zona sirve más de una zona en % organizacion(es)', mezcladas;
  end if;
end;
$$;
