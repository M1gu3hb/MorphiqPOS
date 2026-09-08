-- ═══════════════════════════════════════════════════════════════════════════
-- 004 · Integridad multi-inquilino
--
-- Hasta aquí, cada tabla operativa lleva `organizacion_id` y cada llave foránea
-- apunta a su padre. Suena suficiente. No lo es.
--
-- Nada impedía esto:
--
--   insert into orden_lineas (orden_id, organizacion_id, ...)
--   values (<orden de la Ferretería>, <id de la Cafetería>, ...);
--
-- Las dos llaves foráneas se cumplen —la orden existe, la organización
-- existe— y sin embargo la fila es una línea de venta de un negocio metida
-- dentro de la orden de otro. El total de la orden deja de cuadrar con la suma
-- de sus líneas, y el corte de caja de la Cafetería incluye una venta que
-- nunca hizo.
--
-- Un `where organizacion_id = $1` no protege de esto: la fila YA está mal
-- escrita, y la consulta la devuelve o la esconde según por dónde entre. R16
-- dice que el aislamiento no puede depender de que nadie olvide un WHERE; esto
-- es peor, porque aquí NADIE olvidó nada.
--
-- La corrección estructural es la llave foránea COMPUESTA: la hija no
-- referencia `padre(id)`, sino `padre(id, organizacion_id)`. Así el motor exige
-- que la organización de la hija sea LA MISMA que la del padre. La fila de
-- arriba deja de poder escribirse, venga del comando, de una migración, de un
-- seed o de una consola de psql.
--
-- ── Dos decisiones que conviene explicar ───────────────────────────────────
--
-- 1 · Las llaves foráneas simples NO se retiran, aunque la compuesta las
--     implica. Retirarlas exigiría nombrar las restricciones que Postgres
--     generó solo (`orden_lineas_orden_id_fkey`), y atar una migración a un
--     nombre autogenerado es la misma trampa contra la que avisa
--     `contratos-por-mutacion`: se ata al identificador y no al uso. El costo
--     de dejarlas es una comprobación de índice extra por escritura, que a
--     escala de punto de venta no se mide.
--
-- 2 · `on delete set null (columna)` —sintaxis de Postgres 15+— es obligatoria
--     donde el padre se puede borrar. El `set null` clásico anularía TODAS las
--     columnas de la llave, incluida `organizacion_id`, que es `not null`: el
--     borrado fallaría. Nombrando la columna, sólo se anula el puntero y la
--     organización se queda donde estaba.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Paso 1 · Los padres publican (id, organizacion_id) como llave ──────────
-- Redundante frente a la llave primaria, y aun así necesaria: Postgres exige
-- que el destino de una llave foránea tenga una restricción de unicidad
-- exactamente sobre esas columnas.
alter table sucursales    add constraint sucursales_id_org_unica    unique (id, organizacion_id);
alter table terminales    add constraint terminales_id_org_unica    unique (id, organizacion_id);
alter table personas      add constraint personas_id_org_unica      unique (id, organizacion_id);
alter table empleos       add constraint empleos_id_org_unica       unique (id, organizacion_id);
alter table categorias    add constraint categorias_id_org_unica    unique (id, organizacion_id);
alter table productos     add constraint productos_id_org_unica     unique (id, organizacion_id);
alter table modificadores add constraint modificadores_id_org_unica unique (id, organizacion_id);
alter table clientes      add constraint clientes_id_org_unica      unique (id, organizacion_id);
alter table almacenes     add constraint almacenes_id_org_unica     unique (id, organizacion_id);
alter table insumos       add constraint insumos_id_org_unica       unique (id, organizacion_id);
alter table sesiones_caja add constraint sesiones_caja_id_org_unica unique (id, organizacion_id);
alter table ordenes       add constraint ordenes_id_org_unica       unique (id, organizacion_id);

-- ── Paso 2 · Plataforma ────────────────────────────────────────────────────
alter table terminales add constraint terminales_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;

alter table empleos add constraint empleos_persona_misma_org
  foreign key (persona_id, organizacion_id)
  references personas (id, organizacion_id) on delete restrict;

-- `sucursal_id` es nulo para un empleo de alcance organizacional (un dueño).
-- Con MATCH SIMPLE —el modo por omisión— una llave con alguna columna nula no
-- se comprueba, que es justo lo que se quiere: sin sucursal no hay nada que
-- contrastar.
alter table empleos add constraint empleos_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;

alter table folios add constraint folios_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete cascade;

alter table auditoria add constraint auditoria_terminal_misma_org
  foreign key (terminal_id, organizacion_id)
  references terminales (id, organizacion_id) on delete set null (terminal_id);

-- ── Paso 3 · Catálogo ──────────────────────────────────────────────────────
alter table productos add constraint productos_categoria_misma_org
  foreign key (categoria_id, organizacion_id)
  references categorias (id, organizacion_id) on delete set null (categoria_id);

alter table clientes add constraint clientes_persona_misma_org
  foreign key (persona_id, organizacion_id)
  references personas (id, organizacion_id) on delete set null (persona_id);

-- `producto_modificadores` no tenía `organizacion_id`, y por eso permitía la
-- unión más cara de todas: enganchar el grupo de modificadores de un negocio a
-- los productos de otro. El cajero de la Ferretería vería los extras de la
-- Cafetería —con sus precios— y esos precios SÍ entran al total.
alter table producto_modificadores add column organizacion_id uuid not null
  references organizaciones(id) on delete cascade;

alter table producto_modificadores add constraint producto_modificadores_producto_misma_org
  foreign key (producto_id, organizacion_id)
  references productos (id, organizacion_id) on delete cascade;

alter table producto_modificadores add constraint producto_modificadores_modificador_misma_org
  foreign key (modificador_id, organizacion_id)
  references modificadores (id, organizacion_id) on delete cascade;

-- ── Paso 4 · Venta, caja e inventario ──────────────────────────────────────
alter table almacenes add constraint almacenes_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete cascade;

alter table insumos add constraint insumos_categoria_misma_org
  foreign key (categoria_id, organizacion_id)
  references categorias (id, organizacion_id) on delete set null (categoria_id);

alter table insumos add constraint insumos_producto_misma_org
  foreign key (producto_id, organizacion_id)
  references productos (id, organizacion_id) on delete cascade;

alter table sesiones_caja add constraint sesiones_caja_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;

alter table sesiones_caja add constraint sesiones_caja_terminal_misma_org
  foreign key (terminal_id, organizacion_id)
  references terminales (id, organizacion_id) on delete restrict;

-- Quien abre y quien cierra la caja tienen que ser empleos de ESTA
-- organización. Sin esto, un arqueo podría quedar firmado por alguien de otro
-- negocio, y la auditoría de un faltante apuntaría a una persona equivocada.
alter table sesiones_caja add constraint sesiones_caja_abre_misma_org
  foreign key (empleado_abre_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

alter table sesiones_caja add constraint sesiones_caja_cierra_misma_org
  foreign key (empleado_cierra_id, organizacion_id)
  references empleos (id, organizacion_id) on delete restrict;

alter table ordenes add constraint ordenes_sucursal_misma_org
  foreign key (sucursal_id, organizacion_id)
  references sucursales (id, organizacion_id) on delete restrict;

alter table ordenes add constraint ordenes_terminal_misma_org
  foreign key (terminal_id, organizacion_id)
  references terminales (id, organizacion_id) on delete set null (terminal_id);

-- La que sostiene el arqueo: una orden sólo puede colgar de una sesión de caja
-- de su propia organización. Es lo que hace que CASH-03 —la suma de pagos
-- cuadra con el efectivo contado— pueda siquiera plantearse.
alter table ordenes add constraint ordenes_sesion_caja_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;

alter table ordenes add constraint ordenes_cliente_misma_org
  foreign key (cliente_id, organizacion_id)
  references clientes (id, organizacion_id) on delete set null (cliente_id);

-- Quién atendió, quién cobró y quién canceló. Los tres apuntan a `empleos`, y
-- los tres salen impresos o auditados: un empleo de otra organización en
-- `empleado_cobra_id` pondría el nombre de un desconocido en el ticket y en el
-- rastro de una cancelación.
alter table ordenes add constraint ordenes_atiende_misma_org
  foreign key (empleado_atiende_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_atiende_id);

alter table ordenes add constraint ordenes_cobra_misma_org
  foreign key (empleado_cobra_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_cobra_id);

alter table ordenes add constraint ordenes_cancela_misma_org
  foreign key (cancelada_por, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (cancelada_por);

-- El caso del encabezado del archivo.
alter table orden_lineas add constraint orden_lineas_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete cascade;

alter table orden_lineas add constraint orden_lineas_producto_misma_org
  foreign key (producto_id, organizacion_id)
  references productos (id, organizacion_id) on delete set null (producto_id);

alter table pagos add constraint pagos_orden_misma_org
  foreign key (orden_id, organizacion_id)
  references ordenes (id, organizacion_id) on delete restrict;

alter table pagos add constraint pagos_sesion_caja_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;

alter table movimientos_caja add constraint movimientos_caja_sesion_misma_org
  foreign key (sesion_caja_id, organizacion_id)
  references sesiones_caja (id, organizacion_id) on delete restrict;

alter table movimientos_caja add constraint movimientos_caja_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_id);

alter table movimientos_stock add constraint movimientos_stock_almacen_misma_org
  foreign key (almacen_id, organizacion_id)
  references almacenes (id, organizacion_id) on delete restrict;

alter table movimientos_stock add constraint movimientos_stock_insumo_misma_org
  foreign key (insumo_id, organizacion_id)
  references insumos (id, organizacion_id) on delete restrict;

alter table movimientos_stock add constraint movimientos_stock_empleado_misma_org
  foreign key (empleado_id, organizacion_id)
  references empleos (id, organizacion_id) on delete set null (empleado_id);

alter table existencias add constraint existencias_almacen_misma_org
  foreign key (almacen_id, organizacion_id)
  references almacenes (id, organizacion_id) on delete cascade;

alter table existencias add constraint existencias_insumo_misma_org
  foreign key (insumo_id, organizacion_id)
  references insumos (id, organizacion_id) on delete cascade;

-- ── Lo que esta migración NO cubre, dicho en voz alta ──────────────────────
--
-- Tres tablas siguen sin `organizacion_id`, y es deliberado:
--
--   · `identidades` y `credenciales_pin` cuelgan de `personas` por un único
--     camino. No hay una segunda referencia con la que puedan discrepar, así
--     que no existe la incoherencia que corregir.
--
--   · `modificador_opciones` cuelga sólo de `modificadores`. Mismo argumento.
--
--   · `orden_linea_modificadores` sí tiene dos caminos (su línea, y el
--     modificador de origen), pero copia `modificador_nombre`, `opcion_nombre`
--     y `precio_extra_centavos` en la propia fila. Los punteros al catálogo son
--     `on delete set null`: sirven para rastrear procedencia, no se leen para
--     cobrar. Un puntero cruzado no puede mover un total ni filtrar un dato que
--     no esté ya copiado. Se deja como está, y queda escrito por qué — un hueco
--     declarado es honesto; una restricción decorativa, no.
