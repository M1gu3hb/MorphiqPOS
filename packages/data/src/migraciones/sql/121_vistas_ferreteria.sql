-- 121 · Las cinco vistas de la ferretería.
--
-- ── `busqueda_material` SÍ es materializada, y aquí está el porqué ───────
-- Es la única de todo el proyecto que lo es, y la excepción está razonada: se
-- consulta en CADA TECLEO del mostrador sobre un catálogo de 6,000 a 50,000
-- claves, cruzando cuatro tablas y agregando atributos en texto. Calcularla al
-- vuelo son cientos de milisegundos por pulsación, y un buscador que responde en
-- 300 ms no se usa: el mostradorista vuelve a su memoria, que es justo el
-- problema que este modelo viene a resolver.
--
-- Lo que la hace segura es que su dato NO caduca en segundos: los atributos de
-- una pieza cambian cuando alguien edita el catálogo, no cuando se vende. Por
-- eso el refresco va por trigger sobre las tres tablas que la alimentan y no por
-- reloj — que es lo que la deja siempre al día sin recalcularla cada minuto.
--
-- La existencia NO va dentro: ésa sí cambia cada venta, y meterla obligaría a
-- refrescar la vista entera en cada ticket. Se junta al consultar.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · La búsqueda del mostrador ────────────────────────────────────────
create materialized view busqueda_material as
select p.id                                  as producto_id,
       p.organizacion_id,
       p.nombre,
       p.sku,
       p.codigo_barras,
       l.nombre                              as linea,
       u.codigo                              as ubicacion,
       -- Los atributos aplanados a texto, con su valor ORIGINAL: el
       -- mostradorista teclea `1/4` y espera encontrar `1/4"`, no `6350`.
       string_agg(pa.clave || ' ' || pa.valor_original, ' ' order by pa.clave) as atributos,
       -- Y los normalizados aparte, para poder filtrar por medida de verdad.
       jsonb_object_agg(pa.clave, pa.valor_normalizado)
         filter (where pa.valor_normalizado is not null)                      as medidas
  from productos p
  left join lineas l             on l.id = p.linea_id
  left join ubicaciones u        on u.id = p.ubicacion_id
  left join producto_atributos pa on pa.producto_id = p.id
 where p.activo
 group by p.id, p.organizacion_id, p.nombre, p.sku, p.codigo_barras, l.nombre, u.codigo;

comment on materialized view busqueda_material is
  'La única vista materializada del proyecto, y la excepción está razonada: se consulta en cada tecleo sobre hasta 50,000 claves. Su dato cambia al editar el catálogo, no al vender, y por eso se puede materializar sin mentir.';

-- Un índice único es REQUISITO para poder refrescar sin bloquear lecturas.
create unique index busqueda_material_pk on busqueda_material (producto_id);
create index busqueda_material_texto
  on busqueda_material using gin (to_tsvector('spanish', nombre || ' ' || coalesce(atributos, '')));

create or replace function refrescar_busqueda_material() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- `concurrently` para que el mostrador pueda seguir buscando mientras se
  -- refresca. Necesita el índice único de arriba.
  refresh materialized view concurrently busqueda_material;
  return null;
end;
$$;

-- Por SENTENCIA y no por fila: una carga de catálogo de 2,000 renglones
-- dispararía 2,000 refrescos completos, y el alta masiva tardaría horas.
create trigger productos_refrescan_busqueda
  after insert or update or delete on productos
  for each statement execute function refrescar_busqueda_material();
create trigger atributos_refrescan_busqueda
  after insert or update or delete on producto_atributos
  for each statement execute function refrescar_busqueda_material();
create trigger ubicaciones_refrescan_busqueda
  after insert or update or delete on ubicaciones
  for each statement execute function refrescar_busqueda_material();

-- ── 2 · La existencia de lo que se vende cortado ─────────────────────────
--
-- El material continuo no se cuenta en piezas: se cuenta en metros repartidos
-- entre un rollo entero y los retazos que quedaron. «Hay 47 m» y «hay un rollo
-- de 30 y cuatro retazos» son la misma cifra y dos respuestas distintas, y la
-- segunda es la que sirve cuando el cliente pide 12 metros.
create view existencia_continua as
select p.organizacion_id,
       p.id                                            as producto_id,
       p.nombre,
       pz.almacen_id,
       count(pz.id)                                    as piezas_abiertas,
       coalesce(sum(pz.medida_restante_base), 0)       as base_en_piezas_abiertas,
       max(pz.medida_restante_base)                    as pieza_mas_grande
  from productos p
  left join piezas_abiertas pz
         on pz.producto_id = p.id and pz.estado = 'abierta'
 where p.es_continuo
 group by p.organizacion_id, p.id, p.nombre, pz.almacen_id;

comment on view existencia_continua is
  '«Hay 47 m» y «hay un rollo de 30 y cuatro retazos» son la misma cifra y dos respuestas distintas. La segunda es la que sirve cuando el cliente pide 12 metros.';

-- ── 3 · El dinero dormido ────────────────────────────────────────────────
--
-- Lo que lleva más de un año sin venderse, valuado. En una ferretería son
-- típicamente entre el 15 % y el 30 % del inventario, y es el único número que
-- convierte «tengo mucho material» en «tengo $180,000 parados en el patio».
create view dinero_dormido as
select p.organizacion_id,
       p.id                                     as producto_id,
       p.nombre,
       l.nombre                                 as linea,
       u.codigo                                 as ubicacion,
       coalesce(e.cantidad, 0)                  as existencia,
       p.costo_unitario_centavos,
       (coalesce(e.cantidad, 0) * p.costo_unitario_centavos)::bigint as valor_centavos,
       ultima.ultima_venta
  from productos p
  left join lineas l      on l.id = p.linea_id
  left join ubicaciones u on u.id = p.ubicacion_id
  left join existencias e on e.insumo_id = p.insumo_base_id
  left join lateral (
    select max(ms.created_at) as ultima_venta
      from movimientos_stock ms
     where ms.insumo_id = p.insumo_base_id
       and ms.tipo = 'salida_venta'
  ) ultima on true
 where p.activo
   and coalesce(e.cantidad, 0) > 0
   and (ultima.ultima_venta is null or ultima.ultima_venta < now() - interval '365 days');

comment on view dinero_dormido is
  'Entre el 15 % y el 30 % del inventario de una ferretería. Es lo que convierte «tengo mucho material» en «tengo $180,000 parados en el patio».';

-- ── 4 · La rotación por línea ────────────────────────────────────────────
create view rotacion_por_linea as
select p.organizacion_id,
       p.linea_id,
       l.nombre                                       as linea,
       count(distinct p.id)                           as claves,
       coalesce(sum(-ms.cantidad) filter (
         where ms.tipo = 'salida_venta'
           and ms.created_at >= now() - interval '90 days'
       ), 0)                                          as vendido_90_dias,
       coalesce(sum(e.cantidad), 0)                   as existencia
  from productos p
  left join lineas l             on l.id = p.linea_id
  left join existencias e        on e.insumo_id = p.insumo_base_id
  left join movimientos_stock ms on ms.insumo_id = p.insumo_base_id
 where p.activo
 group by p.organizacion_id, p.linea_id, l.nombre;

comment on view rotacion_por_linea is
  'Qué líneas se mueven y cuáles sostienen el patio. Es el corte que decide qué se deja de comprar, y hoy se decide de memoria.';

-- ── 5 · Lo que salió y no se ha cobrado ──────────────────────────────────
--
-- La sección estrella del modelo. Junta las tres formas en que la mercancía sale
-- sin dinero: la remisión a crédito, la nota apartada y la herramienta rentada.
-- Verlas por separado es cómo cada una se olvida por su cuenta.
create view salio_sin_cobrar as
select r.organizacion_id,
       'remision'::text              as clase,
       r.id                          as referencia_id,
       r.cliente_id,
       r.saldo_documento_centavos    as monto_centavos,
       -- La remision no lleva `created_at`: lleva `entregada_en`, que es el dato
       -- que importa cuando se impugna una entrega. Escrito como `created_at`
       -- esta vista abortaba y se llevaba la tanda entera por delante.
       r.entregada_en                as salio_en
  from remisiones r
 where r.saldo_documento_centavos > 0
union all
select n.organizacion_id,
       'nota_apartada',
       n.id,
       n.cliente_id,
       0::bigint,
       n.armada_en
  from notas_mostrador n
 where n.estado in ('apartada', 'por_cobrar')
union all
select rh.organizacion_id,
       'renta',
       rh.id,
       rh.cliente_id,
       rh.deposito_centavos,
       rh.salio_en
  from rentas_herramienta rh
 where rh.estado = 'fuera';

comment on view salio_sin_cobrar is
  'Las tres formas en que la mercancía sale sin dinero —remisión, apartado y renta— en una sola lista. Verlas por separado es cómo cada una se olvida por su cuenta.';
