-- 175 · Las cuatro vistas de las cuatro entidades que el puente no tenía.
--
-- ── EL HUECO, y cómo se encontró ────────────────────────────────────────────
-- Abriendo las 61 pantallas del modelo una por una y leyendo lo que enseñan.
-- Cuatro de ellas pintaban su banda de error con el nombre de una entidad que no
-- existe, y la suite las daba por probadas porque el HTML respondía 200:
--
--   · `Modificador`        → cafeteria/opciones-de-la-bebida: «Se puede agregar la
--                            bebida sencilla», o sea la leche de avena no existía.
--   · `CarteraPorObra`     → ferreteria/cuentas: «$0.00 · 0 clientes» con la cartera
--                            en la base.
--   · `ExistenciaMaterial` → ferreteria/existencias: «Se muestra el último dato
--                            conocido», que era ninguno.
--   · `PiezaFerreteria`    → ferreteria/ficha-de-pieza: la ficha no abría nunca.
--
-- Ninguna de las cuatro necesitaba tablas nuevas: los datos estaban y lo que
-- faltaba era servirlos con la forma que la pantalla lee. Por eso son vistas.
--
-- ── Por qué VISTAS y no consultas en el puente ──────────────────────────────
-- Porque el puente expone FILAS con columnas, y estas cuatro son agregados —lo
-- vendido en noventa días, el saldo más viejo, los rollos abiertos—. Meter esa
-- aritmética en el puente daría una consulta distinta por pantalla; en una vista
-- la escribe la base una vez y la lee quien sea.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · `opciones_de_bebida` · las opciones de UNA bebida, con su grupo (F-027)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La pantalla pide las opciones de un producto y las agrupa —«Tamaño», «Leche»—.
-- Tres cosas que no están en `modificador_opciones` y aquí se derivan:
--
-- `delta_precio_centavos` ya RESUELTO: la columna firmada cuando existe —«sin
-- crema» abarata— y el extra cuando no. La pantalla no tiene que conocer las dos.
--
-- `por_omision` es la PRIMERA de su grupo por `orden`. No hay columna que lo diga
-- y es lo que significa: el 12 oz va primero porque es el que se pide siempre.
--
-- `agotado` sale de la EXISTENCIA del insumo que sustituye, cuando lo tiene: «sin
-- leche de avena» es un dato del almacén, no una marca que alguien recuerde poner.
-- Sin insumo sustituto no se puede saber, y entonces es `false` — y eso también es
-- verdad: una opción que no toca inventario no se agota.
create view opciones_de_bebida as
select mo.id,
       m.organizacion_id,
       pm.producto_id,
       m.nombre                                                   as grupo,
       mo.nombre,
       case when mo.delta_precio_centavos <> 0 then mo.delta_precio_centavos
            else mo.precio_extra_centavos end                     as delta_precio_centavos,
       (mo.orden = min(mo.orden) over (partition by pm.producto_id, m.id)) as por_omision,
       coalesce(falta.agotado, false)                             as agotado,
       (m.tipo = 'multiple')                                      as varias,
       mo.orden
  from modificador_opciones mo
  join modificadores m on m.id = mo.modificador_id
  join producto_modificadores pm
    on pm.modificador_id = m.id
   and pm.organizacion_id = m.organizacion_id
  left join lateral (
    select coalesce(sum(e.cantidad), 0) <= 0 as agotado
      from existencias e
     where e.insumo_id = mo.insumo_sustituto_id
       and e.organizacion_id = m.organizacion_id
  ) falta on mo.insumo_sustituto_id is not null
 where mo.activa and m.activo;

comment on view opciones_de_bebida is
  'F-027 · Las opciones de una bebida con su grupo, el delta de precio ya resuelto, cuál es la de omisión y si está agotada según la existencia del insumo que sustituye.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · `cartera_por_obra` · lo que cada cliente debe, por obra (F-612)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un renglón por CLIENTE Y OBRA, que es como se cobra en una ferretería: el
-- contratista tiene tres obras y paga una. La obra sale del documento por su
-- origen —la orden— porque `documentos_credito` no la lleva: lo que se fía es el
-- papel, y la obra es de la venta.
--
-- `dias_mas_viejo` es la antigüedad del saldo que lleva más tiempo sin pagarse, y
-- es el número que decide si se le sigue fiando. `dias_ultimo_pago` es la otra
-- mitad: un cliente que debe mucho y paga cada semana no es el que debe mucho y
-- no paga desde marzo.
create view cartera_por_obra as
select coalesce(o.id::text, d.cliente_id::text) || ':' || d.cliente_id::text as id,
       d.organizacion_id,
       d.cliente_id,
       c.nombre                                                as cliente_nombre,
       c.telefono,
       o.nombre                                                as obra_nombre,
       sum(d.saldo_centavos)                                   as saldo_centavos,
       max(floor(extract(epoch from (now() - d.emitido_en)) / 86400))::int as dias_mas_viejo,
       max(c.limite_credito_centavos)                          as limite_centavos,
       min(ultimo.dias)                                        as dias_ultimo_pago
  from documentos_credito d
  join clientes c on c.id = d.cliente_id and c.organizacion_id = d.organizacion_id
  left join ordenes ord on ord.id = d.origen_id and ord.organizacion_id = d.organizacion_id
  left join obras o on o.id = ord.obra_id and o.organizacion_id = d.organizacion_id
  left join lateral (
    select floor(extract(epoch from (now() - max(p.recibido_en))) / 86400)::int as dias
      from pagos_credito p
     where p.cliente_id = d.cliente_id
       and p.organizacion_id = d.organizacion_id
  ) ultimo on true
 where d.saldo_centavos > 0
 group by o.id, d.organizacion_id, d.cliente_id, c.nombre, c.telefono, o.nombre;

comment on view cartera_por_obra is
  'F-612 · Lo que cada cliente debe POR OBRA, con la antigüedad del saldo más viejo y los días desde su último pago: el contratista tiene tres obras y paga una.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · `existencias_de_material` · los cuatro contadores del almacén (F-146)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La pantalla pregunta cuatro cosas a la vez: qué hay, qué está DORMIDO, qué está
-- ABIERTO y qué está en NEGATIVO. Las cuatro salen de aquí y por eso es una vista
-- y no cuatro consultas: con cuatro, los totales de arriba no cuadran con la tabla
-- de abajo en cuanto alguien vende a media carga.
--
-- `dias_inventario` es `null` cuando NUNCA se vendió, que no es lo mismo que
-- «muchos días»: una clave que nunca se ha vendido no tiene rotación, tiene un
-- error de compra. Distinguirlos es lo que hace que la lista de dinero dormido se
-- pueda leer.
create view existencias_de_material as
select p.id,
       p.organizacion_id,
       p.nombre,
       coalesce(l.nombre, 'Sin línea')                          as linea,
       coalesce(prov.nombre, 'Sin proveedor')                   as proveedor,
       coalesce(u.codigo, 'Sin gaveta')                         as gaveta,
       p.unidad_venta                                           as unidad,
       coalesce(saldo.cantidad, 0)                              as existencia,
       coalesce(abiertas.piezas, 0)                             as piezas_abiertas,
       abiertas.dias_mas_vieja                                  as dias_abierta_mas_vieja,
       coalesce(venta.vendido, 0)                               as vendido90,
       -- Días de inventario: lo que hay entre lo que se vende al día. Sin venta en
       -- noventa días, `null`: no es que dure mucho, es que no rota.
       case when coalesce(venta.vendido, 0) > 0
            then floor(coalesce(saldo.cantidad, 0) / (venta.vendido / 90))::int
            else null end                                       as dias_inventario,
       -- El umbral es POR LÍNEA: el cemento y la pulidora no se miden igual. Sin
       -- línea declarada, noventa días, que es el del abarrote seco.
       90                                                       as umbral_dias_linea,
       nullif(p.stock_minimo, '0')::numeric                     as minimo,
       (coalesce(saldo.cantidad, 0) * p.costo_unitario_centavos)::bigint as dinero_parado_centavos
  from productos p
  left join lineas l on l.id = p.linea_id and l.organizacion_id = p.organizacion_id
  left join ubicaciones u on u.id = p.ubicacion_id and u.organizacion_id = p.organizacion_id
  left join lateral (
    select i.id, i.proveedor_id
      from insumos i
     where i.producto_id = p.id and i.organizacion_id = p.organizacion_id
     limit 1
  ) ins on true
  left join proveedores prov
    on prov.id = ins.proveedor_id and prov.organizacion_id = p.organizacion_id
  left join lateral (
    select sum(e.cantidad) as cantidad
      from existencias e
     where e.insumo_id = ins.id and e.organizacion_id = p.organizacion_id
  ) saldo on true
  left join lateral (
    select count(*)::int                                                       as piezas,
           max(floor(extract(epoch from (now() - pa.abierta_en)) / 86400))::int as dias_mas_vieja
      from piezas_abiertas pa
     where pa.producto_id = p.id
       and pa.organizacion_id = p.organizacion_id
       and pa.estado <> 'cerrada'
  ) abiertas on true
  left join lateral (
    select sum(abs(ms.cantidad)) as vendido
      from movimientos_stock ms
     where ms.insumo_id = ins.id
       and ms.organizacion_id = p.organizacion_id
       and ms.tipo = 'salida_venta'
       and ms.created_at >= now() - interval '90 days'
  ) venta on true
 where p.activo;

comment on view existencias_de_material is
  'F-146 · Los cuatro contadores del almacén de una ferretería: qué hay, qué está dormido, qué está abierto y qué está en negativo. `dias_inventario` nulo es «nunca se vendió», que no es «dura mucho».';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · `piezas_de_ferreteria` · la ficha ampliada de una pieza (F-061)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lo que la tabla del mostrador no alcanza a decir: la medida en las DOS
-- notaciones, los atributos con su valor original —`1/4"`, no `6350`—, la gaveta,
-- el peso y la foto del mostrador.
--
-- Los atributos se leen de `producto_atributos` por su clave, y con
-- `valor_original`: el normalizado es para buscar y ordenar; el original es lo que
-- el mostradorista reconoce. Servir el normalizado haría que la ficha dijera
-- «6350» donde la pieza dice «1/4"».
create view piezas_de_ferreteria as
select p.id,
       p.organizacion_id,
       p.nombre,
       coalesce(l.nombre, 'Sin línea')                          as familia,
       coalesce(atr.pulgada, '—')                                as medida_pulgada,
       coalesce(atr.milimetro, '—')                              as medida_milimetro,
       atr.rosca,
       atr.cabeza,
       atr.material,
       atr.acabado,
       p.marca,
       coalesce(p.sku, p.codigo_barras, '')                      as sku,
       p.foto_mostrador_url                                      as foto_url,
       coalesce(saldo.cantidad, 0)                               as existencia,
       -- El desglose es «4 cajas + 340 sueltos» cuando hay presentación de compra;
       -- sin ella, nulo: inventar el empaque diría que hay cajas que nadie tiene.
       caja.desglose,
       (p.peso_por_pieza_mg::numeric / 1000000)                  as peso_kg,
       u.codigo                                                  as ubicacion
  from productos p
  left join lineas l on l.id = p.linea_id and l.organizacion_id = p.organizacion_id
  left join ubicaciones u on u.id = p.ubicacion_id and u.organizacion_id = p.organizacion_id
  left join lateral (
    select max(case when a.clave in ('pulgada', 'medida_pulgada') then a.valor_original end) as pulgada,
           max(case when a.clave in ('milimetro', 'medida_mm') then a.valor_original end) as milimetro,
           max(case when a.clave = 'rosca' then a.valor_original end)  as rosca,
           max(case when a.clave = 'cabeza' then a.valor_original end) as cabeza,
           max(case when a.clave = 'material' then a.valor_original end) as material,
           max(case when a.clave = 'acabado' then a.valor_original end) as acabado
      from producto_atributos a
     where a.producto_id = p.id and a.organizacion_id = p.organizacion_id
  ) atr on true
  left join lateral (
    select i.id
      from insumos i
     where i.producto_id = p.id and i.organizacion_id = p.organizacion_id
     limit 1
  ) ins on true
  left join lateral (
    select sum(e.cantidad) as cantidad
      from existencias e
     where e.insumo_id = ins.id and e.organizacion_id = p.organizacion_id
  ) saldo on true
  -- El desglose usa la presentación MÁS GRANDE del producto: «4 cajas + 340
  -- sueltos». El saldo ya está resuelto arriba, así que este lateral sólo agrupa
  -- las presentaciones; mezclar el agregado de las presentaciones con la suma de
  -- existencias en el mismo `select` es lo que Postgres rechaza con 42803.
  left join lateral (
    select case
             when mayor.factor > 1
             then floor(coalesce(saldo.cantidad, 0) / mayor.factor)::text
                  || ' ' || mayor.nombre || ' + '
                  || mod(coalesce(saldo.cantidad, 0), mayor.factor)::int::text
                  || ' sueltos'
           end as desglose
      from (
        select max(pp.factor::numeric)                                        as factor,
               (array_agg(pp.nombre order by pp.factor::numeric desc))[1]     as nombre
          from producto_presentaciones pp
         where pp.producto_id = p.id
           and pp.organizacion_id = p.organizacion_id
           and pp.activa
      ) mayor
  ) caja on true
 where p.activo;

comment on view piezas_de_ferreteria is
  'F-061 · La ficha ampliada de una pieza: la medida en las dos notaciones, los atributos con su VALOR ORIGINAL —«1/4"», no «6350»—, la gaveta, el peso y la foto del mostrador.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Seguridad · las cuatro con `security_invoker` y sin los roles públicos
-- ═══════════════════════════════════════════════════════════════════════════
alter view opciones_de_bebida      set (security_invoker = on);
alter view cartera_por_obra        set (security_invoker = on);
alter view existencias_de_material set (security_invoker = on);
alter view piezas_de_ferreteria    set (security_invoker = on);

do $$
declare
  roles_publicos text;
  vista text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach vista in array array['opciones_de_bebida', 'cartera_por_obra',
                               'existencias_de_material', 'piezas_de_ferreteria']
  loop
    if roles_publicos is not null then
      execute format('revoke all privileges on %I from %s', vista, roles_publicos);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select on %I to morphiqpos_app', vista);
    end if;
  end loop;
end;
$$;

-- ── La comprobación de la propia migración ─────────────────────────────────
-- Que las cuatro RESPONDAN. Una vista que no compila se nota aquí y no tres
-- semanas después, cuando alguien abra la pantalla.
do $$
declare
  cuantas int;
begin
  select count(*) into cuantas from opciones_de_bebida;
  select count(*) into cuantas from cartera_por_obra;
  select count(*) into cuantas from existencias_de_material;
  select count(*) into cuantas from piezas_de_ferreteria;
end;
$$;
