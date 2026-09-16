-- 101 · Las cinco vistas del retail.
--
-- ── Por qué vistas ───────────────────────────────────────────────────────
-- Las cinco se consultan desde más de una pantalla, y las cinco son la clase de
-- cuenta que si se escribe dos veces acaba dando dos números. «¿Cuántas piezas
-- hay?» contestada distinto en el mostrador y en el reporte de compras es cómo
-- un dueño deja de creerle al sistema, y no vuelve.
--
-- ── Ninguna materializada ────────────────────────────────────────────────
-- Misma razón que en la 145: una existencia de hace treinta segundos es peor
-- que una consulta lenta cuando hay alguien esperando en el mostrador. Si la
-- medición dice que hace falta, se materializa entonces y con datos.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · La existencia en la PRESENTACIÓN que se vende ────────────────────
--
-- El almacén cuenta piezas sueltas; el mostrador vende cajas de 24. «Hay 73» no
-- le dice nada a quien pregunta si le quedan rejas: son tres rejas y una
-- pieza suelta, y esa forma es la única que se puede decir en voz alta.
create view existencia_presentada as
select e.organizacion_id,
       e.almacen_id,
       p.id                                              as producto_id,
       p.nombre,
       pp.id                                             as presentacion_id,
       pp.nombre                                         as presentacion,
       pp.factor,
       e.cantidad                                        as unidades_base,
       floor(e.cantidad / pp.factor)::bigint             as presentaciones_completas,
       (e.cantidad - floor(e.cantidad / pp.factor) * pp.factor) as unidades_sueltas
  from existencias e
  join productos p                on p.insumo_base_id = e.insumo_id
  join producto_presentaciones pp on pp.producto_id = p.id
 where pp.activa
   and pp.factor > 0;

comment on view existencia_presentada is
  'F-021 · «Hay 73» no le dice nada a quien pregunta si le quedan rejas. Tres rejas y una pieza suelta sí, y ésa es la única forma que se puede decir en voz alta.';

-- ── 2 · La cartera de fiado ──────────────────────────────────────────────
--
-- Sale de `pasivos_terceros` (063) y no de una tabla propia: ahí es donde el
-- comando de fiado escribe, y tener dos sitios con la misma deuda es cómo nadie
-- sabe después cuál número es el bueno. Ver el encabezado de la 094.
create view cartera_fiado as
select pt.organizacion_id,
       pt.titular_id                                     as cliente_id,
       c.nombre,
       c.telefono,
       c.dia_pago_semana,
       sum(pt.monto_centavos)                            as saldo_centavos,
       min(pt.created_at) filter (where pt.monto_centavos > 0) as fiado_mas_viejo,
       max(pt.created_at)                                as ultimo_movimiento
  from pasivos_terceros pt
  join clientes c on c.id = pt.titular_id
 where pt.naturaleza = 'credito_cliente'
   and pt.titular_tipo = 'cliente'
 group by pt.organizacion_id, pt.titular_id, c.nombre, c.telefono, c.dia_pago_semana
having sum(pt.monto_centavos) <> 0;

comment on view cartera_fiado is
  'Quién debe, cuánto y qué día pasa. Sale de pasivos_terceros porque ahí escribe el comando de fiado: una segunda tabla con la misma deuda es cómo nadie sabe después cuál número es el bueno.';

-- ── 3 · Qué pedirle a cada proveedor ─────────────────────────────────────
--
-- Lo que se vendió en los últimos treinta días contra lo que hay. No decide por
-- nadie: pone los dos números juntos, que es lo que hoy no pasa —el pedido se
-- hace de memoria mirando el anaquel, y lo que no se ve no se pide—.
--
-- El proveedor cuelga del INSUMO, no del producto: lo añadió la 045 a
-- `insumos`. Escrito como `p.proveedor_id` sobre `productos`, este `create
-- view` abortaba con «column p.proveedor_id does not exist» y se llevaba por
-- delante la tanda entera, que corre en una sola transacción.
--
-- Y el sitio correcto es el insumo: a quién se le compra es del material, no
-- del renglón del catálogo. Dos productos que salen del mismo saco de azúcar
-- se le piden al mismo proveedor una sola vez.
create view sugerencia_pedido as
select p.organizacion_id,
       i.proveedor_id,
       p.id                                      as producto_id,
       p.nombre,
       coalesce(sum(-ms.cantidad) filter (
         where ms.tipo = 'salida_venta'
           and ms.created_at >= now() - interval '30 days'
       ), 0)                                     as vendido_30_dias,
       coalesce(max(e.cantidad), 0)              as existencia,
       p.stock_minimo
  from productos p
  join insumos i              on i.id = p.insumo_base_id
  left join existencias e     on e.insumo_id = p.insumo_base_id
  left join movimientos_stock ms on ms.insumo_id = p.insumo_base_id
 where p.activo
   and i.proveedor_id is not null
 group by p.organizacion_id, i.proveedor_id, p.id, p.nombre, p.stock_minimo;

comment on view sugerencia_pedido is
  'Lo vendido en 30 días contra lo que hay. No decide por nadie: pone los dos números juntos, que es lo que hoy no pasa porque el pedido se hace mirando el anaquel y lo que no se ve no se pide.';

-- ── 4 · La diferencia del conteo, por periodo ────────────────────────────
--
-- Un conteo aislado dice «faltan cuatro». La serie dice si faltan cuatro todos
-- los meses en el mismo pasillo, que es una cosa muy distinta y la única
-- accionable.
--
-- Las tablas son `tomas_inventario` y `toma_conteos`, del tronco (061). El plan
-- las llamaba `conteos` y `conteo_lineas`; se usan las que existen, porque un
-- segundo par de tablas para contar lo mismo es cómo dos pantallas acaban
-- contestando distinto.
create view diferencia_conteo_periodo as
select ti.organizacion_id,
       ti.almacen_id,
       date_trunc('month', ti.cerrada_en)        as mes,
       tc.insumo_id,
       count(*)                                  as veces_contado,
       sum(tc.contado - tc.esperado)             as diferencia_total,
       sum(abs(tc.contado - tc.esperado))        as diferencia_absoluta
  from toma_conteos tc
  join tomas_inventario ti on ti.id = tc.toma_id
 where ti.estado = 'cerrada'
   and ti.cerrada_en is not null
 group by ti.organizacion_id, ti.almacen_id, date_trunc('month', ti.cerrada_en), tc.insumo_id;

comment on view diferencia_conteo_periodo is
  'Un conteo aislado dice «faltan cuatro»; la serie dice si faltan cuatro todos los meses en el mismo pasillo. Sólo la segunda se puede accionar.';

-- ── 5 · El margen por categoría ──────────────────────────────────────────
--
-- El número que contesta la pregunta que ninguna tiendita sabe contestar: de
-- dónde sale de verdad la ganancia. Casi siempre no es de lo que más se vende.
--
-- El costo se reconstruye como `costo_unitario × cantidad`: `orden_lineas` no
-- guarda un costo de renglón, y el `costo_total_centavos` que sí existe es de la
-- ORDEN entera, que no se puede repartir por categoría sin inventar un criterio.
create view margen_por_categoria as
select ol.organizacion_id,
       p.categoria_id,
       cat.nombre                                as categoria,
       date_trunc('month', o.created_at)         as mes,
       count(*)                                  as lineas,
       sum(ol.total_centavos)                    as ingreso_centavos,
       sum((ol.costo_unitario_centavos * ol.cantidad)::bigint) as costo_centavos,
       sum(ol.total_centavos - (ol.costo_unitario_centavos * ol.cantidad)::bigint)
                                                 as margen_centavos
  from orden_lineas ol
  join ordenes o    on o.id = ol.orden_id
  join productos p  on p.id = ol.producto_id
  left join categorias cat on cat.id = p.categoria_id
 where ol.anulada_en is null
 group by ol.organizacion_id, p.categoria_id, cat.nombre, date_trunc('month', o.created_at);

comment on view margen_por_categoria is
  'De dónde sale de verdad la ganancia. Casi nunca es de lo que más se vende, y ésa es la pregunta que ninguna tiendita sabe contestar hoy.';
