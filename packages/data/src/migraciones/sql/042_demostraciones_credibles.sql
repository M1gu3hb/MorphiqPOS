-- 042 · Tres negocios de demostración operables en la base real.

insert into organizaciones (id, nombre, slug, paquete) values
  ('10000000-0000-4000-8000-000000000001', 'Abarrotes Don Chuy', 'demo-abarrotes-don-chuy', 'tienda'),
  ('10000000-0000-4000-8000-000000000002', 'Ferretería La Broca', 'demo-ferreteria-la-broca', 'ferreteria'),
  ('10000000-0000-4000-8000-000000000003', 'Café Jacaranda', 'demo-cafe-jacaranda', 'cafeteria');

insert into sucursales (id, organizacion_id, nombre, direccion, telefono) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Sucursal Centro', 'Mercado Hidalgo, local 12, CDMX', '55 5550 1201'),
  ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Sucursal Centro', 'Av. Hidalgo 214, Col. Centro, CDMX', '55 5550 2202'),
  ('11000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Sucursal Roma', 'Jalapa 86, Roma Norte, CDMX', '55 5550 3303');

insert into terminales (id, organizacion_id, sucursal_id, nombre) values
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Caja mostrador'),
  ('12000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'Caja principal'),
  ('12000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000003', 'Barra');

insert into personas (id, organizacion_id, nombre, apellidos) values
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Jesús', 'Ramírez'),
  ('13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Elena', 'Martínez'),
  ('13000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Mariana', 'Torres');

insert into identidades (id, persona_id, correo) values
  ('14000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'dueno+abarrotes@morphiq.demo'),
  ('14000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', 'duena+ferreteria@morphiq.demo'),
  ('14000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', 'duena+cafe@morphiq.demo');

insert into empleos (id, persona_id, organizacion_id, sucursal_id, rol) values
  ('15000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'dueno'),
  ('15000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'dueno'),
  ('15000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000003', 'dueno');

insert into configuracion (organizacion_id, valores) values
  ('10000000-0000-4000-8000-000000000001', '{"contacto":{"telefono":"55 5550 1201","direccion":"Mercado Hidalgo, local 12, CDMX"},"apariencia":{"colorPrimario":"#166534","colorAcento":"#f59e0b","estilo":"base"}}'),
  ('10000000-0000-4000-8000-000000000002', '{"contacto":{"telefono":"55 5550 2202","direccion":"Av. Hidalgo 214, Col. Centro, CDMX"},"apariencia":{"colorPrimario":"#0f766e","colorAcento":"#f59e0b","estilo":"premium"}}'),
  ('10000000-0000-4000-8000-000000000003', '{"contacto":{"telefono":"55 5550 3303","direccion":"Jalapa 86, Roma Norte, CDMX"},"apariencia":{"colorPrimario":"#7c2d12","colorAcento":"#d97706","estilo":"editorial"}}');

insert into almacenes (id, organizacion_id, sucursal_id, nombre, principal) values
  ('16000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Bodega principal', true),
  ('16000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'Almacén de piso', true),
  ('16000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000003', 'Almacén de barra', true);

insert into categorias (organizacion_id, tipo, nombre, orden)
select o.id, 'producto', c.nombre, c.orden
from organizaciones o cross join lateral (values
  ('Despensa', 1), ('Bebidas', 2), ('Lácteos', 3)
) c(nombre, orden) where o.slug = 'demo-abarrotes-don-chuy'
union all
select o.id, 'producto', c.nombre, c.orden from organizaciones o cross join lateral (values
  ('Herramienta eléctrica', 1), ('Herramienta manual', 2), ('Fijación', 3), ('Pintura', 4)
) c(nombre, orden) where o.slug = 'demo-ferreteria-la-broca'
union all
select o.id, 'producto', c.nombre, c.orden from organizaciones o cross join lateral (values
  ('Café', 1), ('Bebidas frías', 2), ('Alimentos', 3)
) c(nombre, orden) where o.slug = 'demo-cafe-jacaranda';

with datos(org, categoria, nombre, sku, codigo, precio, costo, stock) as (values
  ('demo-abarrotes-don-chuy','Despensa','Tortillas de maíz 1 kg','TOR-001','7500000000001',2600,2100,'45'),
  ('demo-abarrotes-don-chuy','Despensa','Frijol pinto 1 kg','FRI-001','7500000000002',3990,3120,'24'),
  ('demo-abarrotes-don-chuy','Bebidas','Refresco de cola 600 ml','REF-600','7500000000003',2000,1450,'36'),
  ('demo-abarrotes-don-chuy','Lácteos','Leche entera 1 L','LEC-1L','7500000000004',2950,2420,'18'),
  ('demo-abarrotes-don-chuy','Despensa','Huevo blanco 18 piezas','HUE-018','7500000000005',5800,4890,'3'),
  ('demo-ferreteria-la-broca','Herramienta eléctrica','Taladro percutor Truper 1/2 pulgada','TAL-PER-012','7506240634512',164990,118025,'8'),
  ('demo-ferreteria-la-broca','Herramienta manual','Martillo uña pulida 16 oz','MAR-016','7506240644115',18900,12850,'2'),
  ('demo-ferreteria-la-broca','Fijación','Tornillo galvanizado 1/4 × 2 pulgadas','TOR-142',null,350,185,'240'),
  ('demo-ferreteria-la-broca','Herramienta manual','Cinta métrica 5 m','CIN-005','7506240614439',12900,8350,'20'),
  ('demo-ferreteria-la-broca','Pintura','Brocha profesional 3 pulgadas','BRO-003','7506240652714',7900,4720,'28')
)
insert into productos (organizacion_id, categoria_id, nombre, sku, codigo_barras, precio_venta_centavos, costo_unitario_centavos, estrategia_consumo, stock_minimo)
select o.id, c.id, d.nombre, d.sku, d.codigo, d.precio, d.costo, 'sku', 5
from datos d join organizaciones o on o.slug = d.org join categorias c on c.organizacion_id = o.id and c.nombre = d.categoria;

insert into insumos (organizacion_id, producto_id, nombre, unidad_base, costo_unitario_centavos, stock_minimo)
select organizacion_id, id, nombre, 'pieza', costo_unitario_centavos, stock_minimo
from productos where estrategia_consumo = 'sku';

with cafe(nombre, unidad, costo, minimo) as (values
  ('Café en grano mezcla de la casa','g',45,250),
  ('Leche entera','ml',3,1500),
  ('Panini caprese preparado','pieza',5200,4),
  ('Croissant de mantequilla','pieza',2100,6)
)
insert into insumos (organizacion_id, nombre, unidad_base, costo_unitario_centavos, stock_minimo)
select o.id, cafe.nombre, cafe.unidad, cafe.costo, cafe.minimo
from cafe join organizaciones o on o.slug = 'demo-cafe-jacaranda';

with cafe(categoria, nombre, precio) as (values
  ('Café','Café americano 12 oz',4900), ('Café','Latte 12 oz',6500),
  ('Alimentos','Panini caprese',11500), ('Alimentos','Croissant de mantequilla',4800)
)
insert into productos (organizacion_id, categoria_id, nombre, precio_venta_centavos, estrategia_consumo, stock_minimo)
select o.id, c.id, cafe.nombre, cafe.precio, 'receta', 0
from cafe join organizaciones o on o.slug = 'demo-cafe-jacaranda'
join categorias c on c.organizacion_id = o.id and c.nombre = cafe.categoria;

with stock(org, insumo, cantidad) as (values
  ('demo-abarrotes-don-chuy','Tortillas de maíz 1 kg','45'), ('demo-abarrotes-don-chuy','Frijol pinto 1 kg','24'),
  ('demo-abarrotes-don-chuy','Refresco de cola 600 ml','36'), ('demo-abarrotes-don-chuy','Leche entera 1 L','18'),
  ('demo-abarrotes-don-chuy','Huevo blanco 18 piezas','3'), ('demo-ferreteria-la-broca','Taladro percutor Truper 1/2 pulgada','8'),
  ('demo-ferreteria-la-broca','Martillo uña pulida 16 oz','2'), ('demo-ferreteria-la-broca','Tornillo galvanizado 1/4 × 2 pulgadas','240'),
  ('demo-ferreteria-la-broca','Cinta métrica 5 m','20'), ('demo-ferreteria-la-broca','Brocha profesional 3 pulgadas','28'),
  ('demo-cafe-jacaranda','Café en grano mezcla de la casa','5000'), ('demo-cafe-jacaranda','Leche entera','12000'),
  ('demo-cafe-jacaranda','Panini caprese preparado','18'), ('demo-cafe-jacaranda','Croissant de mantequilla','2')
)
insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
select o.id, a.id, i.id, stock.cantidad::numeric from stock join organizaciones o on o.slug = stock.org
join almacenes a on a.organizacion_id = o.id and a.principal join insumos i on i.organizacion_id = o.id and i.nombre = stock.insumo;

insert into movimientos_stock (organizacion_id, almacen_id, insumo_id, tipo, cantidad, unidad, costo_unitario_centavos, referencia_tipo, motivo, idempotency_key)
select e.organizacion_id, e.almacen_id, e.insumo_id, 'inventario_inicial', e.cantidad,
  i.unidad_base, i.costo_unitario_centavos, 'manual', 'Carga inicial de demostración', 'seed:' || e.insumo_id
from existencias e join insumos i on i.id = e.insumo_id;

with receta(producto, insumo, cantidad) as (values
  ('Café americano 12 oz','Café en grano mezcla de la casa','18'),
  ('Latte 12 oz','Café en grano mezcla de la casa','18'), ('Latte 12 oz','Leche entera','240'),
  ('Panini caprese','Panini caprese preparado','1'), ('Croissant de mantequilla','Croissant de mantequilla','1')
)
insert into recetas (organizacion_id, producto_id, insumo_id, cantidad, unidad)
select p.organizacion_id, p.id, i.id, receta.cantidad::numeric, i.unidad_base
from receta join organizaciones o on o.slug = 'demo-cafe-jacaranda'
join productos p on p.organizacion_id = o.id and p.nombre = receta.producto
join insumos i on i.organizacion_id = o.id and i.nombre = receta.insumo;

update productos p set costo_unitario_centavos = costos.costo
from (
  select r.producto_id, sum(round(i.costo_unitario_centavos::numeric * r.cantidad))::bigint costo
  from recetas r join insumos i on i.id = r.insumo_id group by r.producto_id
) costos where p.id = costos.producto_id;
