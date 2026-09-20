-- 168 · `materiales_mostrador`: el índice que el mostrador de una ferretería lee.
--
-- ── EL HUECO ────────────────────────────────────────────────────────────────
-- `ferreteria/Mostrador.tsx:125` y `ferreteria/Cotizacion.tsx:148` se hidratan de
-- la entidad `MaterialMostrador` del puente, y **esa entidad no existía**: el
-- puente contestaba `PUENTE_ENTIDAD_DESCONOCIDA`, las dos pantallas se comían el
-- error —«la pantalla no se vacía por un error de red: se avisa y se sigue»— y el
-- mostradorista se quedaba mirando su «punto de partida» sin un solo material.
--
-- Sin índice no hay resultados, sin resultados no hay partidas, y «Mandar a caja»
-- no se enciende nunca: **una ferretería no podía vender NADA por su pantalla.**
--
-- ── POR QUÉ UNA VISTA NUEVA Y NO `busqueda_material` ───────────────────────
-- `busqueda_material` (121) es MATERIALIZADA, y con razón: agrega los atributos
-- de cada producto en un texto para que teclear «1/4» encuentre `1/4"`, y eso se
-- consulta en cada tecleo. Su dato cambia al editar el catálogo, no al vender.
--
-- Pero al mostrador le hacen falta dos números que cambian CON CADA VENTA —el
-- precio y la existencia— y servirlos desde una vista materializada sería decirle
-- al cliente que hay seis tramos de tubo cuando quedan dos. Así que esta vista es
-- NORMAL y se apoya en la materializada para lo que sí es estable: el texto de
-- los atributos y la línea. Lo volátil se lee en vivo.
--
-- ── Las tres columnas de display ───────────────────────────────────────────
-- `medida`, `acabado` y `marca` salen de `producto_atributos` con su
-- `valor_original` —el que el mostradorista lee y dice en voz alta, `1/4"` y no
-- `6350`—. La versión normalizada sigue en `busqueda_material.medidas` para
-- filtrar de verdad.
--
-- ── La existencia ──────────────────────────────────────────────────────────
-- Un producto de ferretería es su propio insumo: `insumos.producto_id` apunta al
-- producto, y `existencias_por_insumo` (048) proyecta el ledger. Se lee con un
-- `lateral` acotado a una fila para que un producto con dos insumos —que no
-- debería existir, pero la tabla lo permite— no duplique el material en la lista
-- del pasillo.

create view materiales_mostrador as
select p.id                                                        as producto_id,
       p.organizacion_id,
       p.nombre,
       p.sku,
       p.codigo_barras,
       p.precio_venta_centavos,
       p.costo_unitario_centavos,
       p.unidad_venta,
       coalesce(l.nombre, '')                                      as linea,
       u.codigo                                                    as ubicacion,
       coalesce(atributos.medida, '')                              as medida,
       atributos.acabado,
       atributos.marca,
       coalesce(existencia.cantidad, 0)                            as existencia
  from productos p
  left join lineas l      on l.id = p.linea_id
  left join ubicaciones u on u.id = p.ubicacion_id
  left join lateral (
    select max(pa.valor_original) filter (where pa.clave = 'medida')  as medida,
           max(pa.valor_original) filter (where pa.clave = 'acabado') as acabado,
           max(pa.valor_original) filter (where pa.clave = 'marca')   as marca
      from producto_atributos pa
     where pa.producto_id = p.id
  ) atributos on true
  left join lateral (
    select e.cantidad
      from insumos i
      join existencias_por_insumo e on e.insumo_id = i.id
     where i.producto_id = p.id
     limit 1
  ) existencia on true
 where p.activo;

comment on view materiales_mostrador is
  'F-150 · El índice del mostrador: lo que el mostradorista busca en el pasillo. Precio y existencia EN VIVO —cambian con cada venta—; los atributos de display salen de producto_atributos con su valor original. La búsqueda por texto sigue en busqueda_material, que es materializada a propósito.';

-- Una vista hereda la RLS de su tabla base sólo si se declara `security_invoker`.
-- Sin esto correría con los permisos de quien la creó y sería una puerta trasera
-- al catálogo y a las existencias de las nueve organizaciones.
alter view materiales_mostrador set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on materiales_mostrador from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on materiales_mostrador to morphiqpos_app;
  end if;
end;
$$;

-- La comprobación de la propia migración: la vista tiene que devolver los
-- materiales de una ferretería con su precio. Si el `lateral` de la existencia
-- duplicara filas, esto lo diría aquí y no en el pasillo.
do $$
declare
  org_ferreteria uuid;
  cuantos int;
  distintos int;
begin
  select id into org_ferreteria
    from organizaciones
   where giro = 'ferreteria' and activa
   order by created_at
   limit 1;

  if org_ferreteria is null then
    return;
  end if;

  select count(*), count(distinct producto_id)
    into cuantos, distintos
    from materiales_mostrador
   where organizacion_id = org_ferreteria;

  if cuantos <> distintos then
    raise exception 'materiales_mostrador duplica materiales: % filas para % productos',
      cuantos, distintos;
  end if;
end;
$$;
