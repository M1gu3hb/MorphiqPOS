-- 040 · Relación explícita del producto variable con su insumo base (B-04)
--
-- `estrategia_consumo='insumo_base'` ya existía, pero no había una columna que
-- dijera qué insumo descontar. Sin ella, peso y porción eran configurables en
-- catálogo pero imposibles de cobrar sin inventar la relación en memoria.

alter table productos
  add column insumo_base_id uuid;

alter table productos
  add constraint productos_insumo_base_misma_org
  foreign key (insumo_base_id, organizacion_id)
  references insumos (id, organizacion_id)
  on delete restrict;

alter table productos
  add constraint producto_consumo_base_completo check (
    estrategia_consumo <> 'insumo_base' or insumo_base_id is not null
  );

comment on column productos.insumo_base_id is
  'Insumo descontado por productos de peso o porción. Siempre pertenece a la misma organización.';
