-- 099 · La ruta del proveedor y su crédito (F-107, F-632, F-635).
--
-- ── Sin el día de visita, la sugerencia de pedido no existe ───────────────
-- Bimbo llega el martes a las siete y se va en diez minutos. Lo que hay que
-- pedirle no es «lo que falta para el mínimo»: es lo que se va a vender hasta
-- que vuelva. Sin saber cuándo vuelve, el sistema sólo puede contestar «te
-- queda poco refresco», que no es una respuesta y no cambia lo que el tendero
-- hace.
--
-- ── Por qué `int[]` y no un día ──────────────────────────────────────────
-- Porque un proveedor puede venir martes Y viernes, y es lo normal en refresco
-- y pan. Con un solo día, la mitad de las rutas se declaran mal y el cálculo de
-- cobertura pide de más el martes y de menos el viernes.
--
-- ── Por qué el canje va aquí y no en la compra ───────────────────────────
-- Porque es una propiedad del proveedor, no de la nota: Bimbo acepta canje de
-- caducado y los cigarros no, y eso no cambia de una entrega a otra. En la nota
-- sería una pregunta que alguien tiene que contestar cada semana.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

alter table proveedores add column dia_visita int[] not null default '{}';
alter table proveedores add column frecuencia text not null default 'ninguna';
alter table proveedores add column dias_credito int not null default 0;
alter table proveedores add column acepta_canje boolean not null default false;

-- 1 = lunes … 7 = domingo, como la norma ISO. Un cero o un ocho en el arreglo
-- haría que la ruta se leyera como «no tiene día» en unos sitios y como un día
-- imposible en otros: se rechaza en la base, que es donde no se puede olvidar.
alter table proveedores add constraint proveedor_dias_de_semana_validos check (
  dia_visita <@ array[1, 2, 3, 4, 5, 6, 7]
);

alter table proveedores add constraint proveedor_frecuencia_valida check (
  frecuencia in ('ninguna', 'diaria', 'semanal', 'quincenal', 'preventa')
);

alter table proveedores add constraint proveedor_dias_credito_razonables check (
  dias_credito between 0 and 180
);

comment on column proveedores.dia_visita is
  'F-107 · Días de visita, 1 = lunes … 7 = domingo. Un proveedor puede venir martes y viernes, y es lo normal en refresco y pan.';
comment on column proveedores.acepta_canje is
  'Bimbo acepta canje de caducado; los cigarros no. Es del proveedor, no de la nota: en la nota sería una pregunta que alguien contesta cada semana.';

-- ── El mínimo y el crítico ya existen en `insumos` ────────────────────────
--
-- `stock_minimo` y `stock_critico` están desde la 003 y NO se vuelven a crear.
-- Lo que faltaba es de quién se pide, y eso también estaba: `insumos.proveedor_id`.
-- La sugerencia agrupa por ahí. Un índice, porque la consulta de la mañana
-- entra por proveedor y hoy recorre el catálogo entero.
create index insumos_por_proveedor
  on insumos (organizacion_id, proveedor_id) where proveedor_id is not null and activo;
