-- 098 · La tasa de IVA y el IEPS por producto (F-011, F-012).
--
-- ── Por qué el 16 % de todo es una mentira que cuesta dinero ─────────────
-- En una tiendita mexicana conviven tres tasas en el mismo anaquel: la leche y
-- el pan van al 0 %, el refresco al 16 % más IEPS por litro, y el cigarro al
-- 16 % más un IEPS que es un porcentaje. Un sistema que cobra 16 % de todo
-- infla el precio de la mitad del catálogo o —si el precio ya estaba puesto—
-- hace que el negocio pague IVA de lo que no lo causa.
--
-- ── Por qué el IEPS es una TABLA y no un porcentaje más ──────────────────
-- Porque no siempre es un porcentaje. En bebidas saborizadas es una CUOTA por
-- litro, y en tabaco es cuota más porcentaje a la vez. Modelarlo como un número
-- obligaría a inventar un porcentaje equivalente por producto y a recalcularlo
-- cada año cuando la cuota se actualiza por inflación.
--
-- ── Y por qué las cuotas van FECHADAS ────────────────────────────────────
-- La cuota de bebidas se actualiza cada enero. Sin vigencia, actualizarla
-- cambiaría el impuesto de las ventas del año pasado, y un ticket reimpreso en
-- marzo diría un total distinto del que el cliente pagó en diciembre.
--
-- ── El relleno va POR CATEGORÍA y con un contador delante ────────────────
-- Está escrito y NO se ejecuta aquí. Un relleno que ponga todo al 16 % es peor
-- que no hacer nada, porque queda invisible: nadie vuelve a revisar un campo
-- que ya tiene valor. La tabla de mapeo se escribe a mano contra la LIVA art.
-- 2-A y la revisa un contador antes de aplicarla.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · Los regímenes de IEPS, con sus cuotas fechadas ───────────────────
create table regimenes_ieps (
  id                  uuid        primary key default gen_random_uuid(),
  clave               text        not null,
  descripcion         text        not null check (length(trim(descripcion)) > 0),

  -- Las dos formas, y pueden darse a la vez (tabaco).
  cuota_centavos_por_litro  bigint,
  tasa_bp                   int,

  vigente_desde       date        not null,
  vigente_hasta       date,
  created_at          timestamptz not null default now(),

  constraint ieps_tiene_alguna_forma check (
    cuota_centavos_por_litro is not null or tasa_bp is not null
  ),
  constraint ieps_cuota_no_negativa check (
    cuota_centavos_por_litro is null or cuota_centavos_por_litro >= 0
  ),
  constraint ieps_tasa_en_rango check (tasa_bp is null or tasa_bp between 0 and 20000),
  constraint ieps_vigencia_coherente check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  -- Una clave, una vigencia. Dos filas vigentes de la misma clave harían que el
  -- impuesto dependiera de cuál leyó primero la consulta.
  unique (clave, vigente_desde)
);

comment on table regimenes_ieps is
  'F-012 · El IEPS no siempre es un porcentaje: en bebidas saborizadas es una CUOTA por litro y en tabaco es cuota más porcentaje. Modelarlo como un número obligaría a inventar un equivalente por producto.';
comment on column regimenes_ieps.vigente_desde is
  'La cuota de bebidas se actualiza cada enero. Sin vigencia, actualizarla cambiaría el impuesto de las ventas del año pasado y un ticket reimpreso diría otro total.';

-- Las cuotas de 2026, con su fecha. Son datos de referencia, no de un negocio:
-- por eso esta tabla no lleva `organizacion_id`.
insert into regimenes_ieps (clave, descripcion, cuota_centavos_por_litro, tasa_bp, vigente_desde)
values
  -- `exento` lleva tasa CERO, no dos nulos. Con los dos nulos violaba su propio
  -- `ieps_tiene_alguna_forma` y la migración abortaba en su primer `insert`.
  -- Y cero es lo correcto además de lo que pasa: «sin IEPS» es una tasa del
  -- 0 %, no un régimen que no sabe decir cuánto cobra. Así cualquier cálculo
  -- que multiplique por la tasa da cero sin tener que conocer esta clave.
  ('exento',            'Sin IEPS',                                    null,     0, date '2026-01-01'),
  ('bebida_saborizada', 'Bebidas saborizadas con azúcares añadidos',   164,   null, date '2026-01-01'),
  ('alimento_alta_densidad', 'Alimentos no básicos de alta densidad calórica',
                                                                        null,  800, date '2026-01-01'),
  ('cerveza',           'Cerveza y bebidas con hasta 14° G.L.',         null, 2650, date '2026-01-01'),
  ('tabaco',            'Cigarros y tabacos labrados',                 6445, 16000, date '2026-01-01');

comment on column regimenes_ieps.clave is
  'Las cuotas cargadas son las de 2026 y llevan su `vigente_desde`. Cuando cambien, se inserta una fila nueva y la anterior se cierra: no se edita, o el histórico se mueve solo.';

-- ── 2 · Lo que el producto necesita saber ────────────────────────────────
alter table productos
  add column tasa_iva_bp int not null default 1600,
  add column regimen_ieps text,
  add column litros_por_unidad numeric(10, 4);

alter table productos
  -- Las tres tasas que conviven en el mismo anaquel. Es una lista cerrada a
  -- propósito: un porcentaje libre permite teclear 15 % y nadie lo vería.
  add constraint producto_tasa_iva_valida check (tasa_iva_bp in (0, 800, 1600)),
  add constraint producto_ieps_cuota_con_litros check (
    regimen_ieps is null
    or regimen_ieps <> 'bebida_saborizada'
    or (litros_por_unidad is not null and litros_por_unidad > 0)
  );

comment on column productos.tasa_iva_bp is
  'En puntos base: 0, 800 (frontera) o 1600. Lista cerrada a propósito: con un porcentaje libre alguien teclea 15 % y nadie lo ve hasta la declaración.';
comment on column productos.litros_por_unidad is
  'Cuántos litros trae una unidad. Sin esto, el IEPS por litro de una lata de 355 ml no se puede calcular, y es obligatorio justo en el producto que más se vende.';

create index productos_por_regimen_ieps
  on productos (organizacion_id, regimen_ieps)
  where regimen_ieps is not null and regimen_ieps <> 'exento';

-- ── 3 · El relleno · ESCRITO Y NO EJECUTADO ──────────────────────────────
--
-- Se deja aquí como comentario y no como sentencia, porque ejecutarlo sin que
-- un contador haya revisado el mapeo es exactamente el daño que esta migración
-- viene a evitar: un campo con valor que nadie vuelve a mirar.
--
--   update productos p
--      set tasa_iva_bp = m.tasa_bp,
--          regimen_ieps = m.regimen
--     from mapeo_fiscal_por_categoria m
--    where p.categoria_id = m.categoria_id;
--
-- `mapeo_fiscal_por_categoria` se escribe a mano contra la LIVA art. 2-A para
-- el catálogo real de CADA negocio. No hay mapeo genérico que sirva: la misma
-- categoría «bebidas» puede traer agua embotellada al 0 % y refresco al 16 %.
