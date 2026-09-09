-- 043 · Operación reciente para que el tablero de la demo ferretera sea útil.

insert into folios (organizacion_id, sucursal_id, serie, siguiente)
values ('10000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'A', 3);

insert into sesiones_caja (
  id, organizacion_id, sucursal_id, terminal_id, empleado_abre_id,
  fondo_inicial_centavos, abierta_en
) values (
  '17000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000002',
  100000,
  now() - interval '3 hours'
);

insert into movimientos_caja (
  sesion_caja_id, organizacion_id, tipo, monto_centavos,
  referencia_tipo, empleado_id, motivo, created_at
) values (
  '17000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'apertura', 100000, 'manual', '15000000-0000-4000-8000-000000000002',
  'Fondo inicial de demostración', now() - interval '3 hours'
);

insert into ordenes (
  id, organizacion_id, sucursal_id, terminal_id, sesion_caja_id,
  folio, estado, empleado_atiende_id, empleado_cobra_id,
  subtotal_centavos, total_centavos, costo_total_centavos,
  utilidad_centavos, margen_bp, idempotency_key, created_at
) values
  ('18000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   '11000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002',
   '17000000-0000-4000-8000-000000000002', 1, 'pagada',
   '15000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002',
   18900, 18900, 12850, 6050, 3201, 'demo:venta:1', now() - interval '95 minutes'),
  ('18000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '11000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002',
   '17000000-0000-4000-8000-000000000002', 2, 'pagada',
   '15000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002',
   15800, 15800, 9440, 6360, 4025, 'demo:venta:2', now() - interval '28 minutes');

insert into orden_lineas (
  orden_id, organizacion_id, producto_id, producto_nombre, sku,
  cantidad, precio_unitario_centavos, costo_unitario_centavos,
  subtotal_centavos, total_centavos, utilidad_centavos
)
select '18000000-0000-4000-8000-000000000001'::uuid, p.organizacion_id, p.id,
  p.nombre, p.sku, 1, p.precio_venta_centavos, p.costo_unitario_centavos,
  p.precio_venta_centavos, p.precio_venta_centavos,
  p.precio_venta_centavos - p.costo_unitario_centavos
from productos p where p.organizacion_id = '10000000-0000-4000-8000-000000000002'
  and p.nombre = 'Martillo uña pulida 16 oz'
union all
select '18000000-0000-4000-8000-000000000002'::uuid, p.organizacion_id, p.id,
  p.nombre, p.sku, 2, p.precio_venta_centavos, p.costo_unitario_centavos,
  p.precio_venta_centavos * 2, p.precio_venta_centavos * 2,
  (p.precio_venta_centavos - p.costo_unitario_centavos) * 2
from productos p where p.organizacion_id = '10000000-0000-4000-8000-000000000002'
  and p.nombre = 'Brocha profesional 3 pulgadas';

insert into pagos (
  orden_id, organizacion_id, sesion_caja_id, metodo, monto_centavos,
  recibido_centavos, cambio_centavos, idempotency_key, created_at
) values
  ('18000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
   '17000000-0000-4000-8000-000000000002', 'efectivo', 18900, 20000, 1100,
   'demo:pago:1', now() - interval '95 minutes'),
  ('18000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '17000000-0000-4000-8000-000000000002', 'tarjeta', 15800, null, 0,
   'demo:pago:2', now() - interval '28 minutes');

insert into movimientos_caja (
  sesion_caja_id, organizacion_id, tipo, monto_centavos,
  referencia_tipo, referencia_id, empleado_id, created_at
) values
  ('17000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'venta', 18900, 'orden', '18000000-0000-4000-8000-000000000001',
   '15000000-0000-4000-8000-000000000002', now() - interval '95 minutes'),
  ('17000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'venta', 15800, 'orden', '18000000-0000-4000-8000-000000000002',
   '15000000-0000-4000-8000-000000000002', now() - interval '28 minutes');

update existencias e set cantidad = e.cantidad - d.salida, actualizado_en = now()
from (values
  ('Martillo uña pulida 16 oz', 1::numeric),
  ('Brocha profesional 3 pulgadas', 2::numeric)
) d(nombre, salida)
join insumos i on i.nombre = d.nombre
  and i.organizacion_id = '10000000-0000-4000-8000-000000000002'
where e.insumo_id = i.id and e.organizacion_id = i.organizacion_id;

insert into movimientos_stock (
  organizacion_id, almacen_id, insumo_id, tipo, cantidad, unidad,
  costo_unitario_centavos, referencia_tipo, referencia_id,
  empleado_id, idempotency_key, created_at
)
select i.organizacion_id, e.almacen_id, i.id, 'salida_venta', -d.salida,
  i.unidad_base, i.costo_unitario_centavos, 'orden', d.orden_id,
  '15000000-0000-4000-8000-000000000002', 'demo:stock:' || d.orden_id,
  d.creada_en
from (values
  ('Martillo uña pulida 16 oz', 1::numeric, '18000000-0000-4000-8000-000000000001'::uuid, now() - interval '95 minutes'),
  ('Brocha profesional 3 pulgadas', 2::numeric, '18000000-0000-4000-8000-000000000002'::uuid, now() - interval '28 minutes')
) d(nombre, salida, orden_id, creada_en)
join insumos i on i.nombre = d.nombre and i.organizacion_id = '10000000-0000-4000-8000-000000000002'
join existencias e on e.insumo_id = i.id and e.organizacion_id = i.organizacion_id;
