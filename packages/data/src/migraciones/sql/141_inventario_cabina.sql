-- 141 · El doble destino del mismo SKU: cabina y anaquel (F-155).
--
-- ── El caso que ningún otro modelo tiene ─────────────────────────────────
-- El mismo bote de shampoo de un litro puede acabar de dos maneras distintas: se
-- VENDE entero en el anaquel, o se ABRE en cabina y se gasta en dosis a lo largo
-- de tres semanas. Es la misma clave de catálogo y son dos existencias con dos
-- unidades distintas —piezas y mililitros—, y el negocio necesita las dos.
--
-- Sin esto, el salón elige: o lleva el inventario de venta y no sabe cuánto
-- producto se gasta en cabina —que es el costo directo de cada servicio y el
-- número que falta para saber si un tinte deja dinero—, o lleva el de cabina y
-- entonces el anaquel dice que hay doce botes cuando hay nueve.
--
-- ── Por qué son DOS ALMACENES y no una columna en el producto ────────────
-- Porque el tronco ya sabe mover existencias entre almacenes, y el paso de
-- anaquel a cabina ES un traspaso: sale una pieza de un sitio y entra medio
-- litro en otro. Inventar una segunda existencia dentro del producto obligaría
-- a reescribir el kardex, la valuación y el conteo para un solo modelo.
--
-- ── El factor de apertura, y por qué vive en el PRODUCTO ─────────────────
-- Un litro son 1,000 ml y eso no cambia, pero un bote de tinte de 60 g rinde
-- «dos aplicaciones» sólo en la cabeza de quien lo usa. El factor es el número
-- de unidades base que entran a cabina al abrir UNA pieza, y es del producto
-- porque es una propiedad del envase, no de la política del salón.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · El almacén de CABINA ─────────────────────────────────────────────
--
-- La columna `almacenes.tipo` ya la creó la 116 para la ferretería. Aquí sólo
-- se abre la lista para el tipo que este modelo necesita, y se reescribe ENTERA
-- —incluidos los de la 116— porque un `check` de lista cerrada no se extiende:
-- se tira y se vuelve a crear, y dejar fuera uno rompe al otro modelo.
alter table almacenes drop constraint almacen_tipo_valido;
alter table almacenes
  add constraint almacen_tipo_valido check (
    -- 116 · los de la ferretería.
    tipo in ('general', 'venta', 'bodega', 'transito',
    -- 141 · el que se gasta en dosis y no se vende.
             'cabina')
  );

comment on column almacenes.tipo is
  'F-155 · `cabina` es el que se gasta en dosis y no se vende. Separarlo del de venta es lo único que permite tener a la vez el costo del servicio y la existencia del anaquel.';

-- ── 2 · El producto dice a dónde puede ir, y cuánto rinde al abrirse ──────
alter table productos add column destino text not null default 'venta';
alter table productos add column factor_apertura numeric(14, 4);
alter table productos add column unidad_cabina text;

alter table productos
  add constraint producto_destino_valido check (
    destino in ('venta', 'cabina', 'ambos')
  ),
  -- Lo que se abre TIENE que decir cuánto rinde y en qué se mide. Sin el
  -- factor, abrir una pieza mete «uno» a cabina y el consumo de tres semanas
  -- se descuenta contra una existencia de uno: al segundo servicio da negativo.
  add constraint producto_apertura_completa check (
    destino = 'venta'
    or (factor_apertura is not null and factor_apertura > 0 and unidad_cabina is not null)
  );

comment on column productos.factor_apertura is
  'F-155 · Cuántas unidades base entran a cabina al abrir UNA pieza. Un litro son 1000 ml; un bote de tinte de 60 g rinde «dos aplicaciones» sólo en la cabeza de quien lo usa, y por eso el número vive aquí y no en la receta.';
comment on column productos.destino is
  '`venta` se vende entero, `cabina` sólo se abre, `ambos` puede acabar de las dos formas. El mismo SKU con dos existencias y dos unidades.';

create index productos_de_cabina
  on productos (organizacion_id, destino) where destino <> 'venta';

-- ── 3 · Los dos motivos de movimiento que esto necesita ──────────────────
--
-- ⚠ Lista cerrada: se reescribe ENTERA con todo lo que cualquier migración
-- anterior admitió, más los dos de aquí. Dejar fuera uno rompe a otro modelo
-- con un 23514 el día que se aplique. La 160 vuelve a escribirla más adelante y
-- tiene que seguir incluyendo éstos dos.
alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in (
      -- 003 · el tronco.
      'orden', 'compra', 'conteo', 'manual',
      -- 077 · consumo interno y cortesías.
      'consumo_interno', 'anulacion',
      -- 085 · la merma de barra de la cafetería.
      'merma_barra',
      -- 097 · el redondeo en especie de abarrotes.
      'redondeo',
      -- 113 y 117 · corte de material y servicio de mostrador de la ferretería.
      'corte', 'servicio',
      -- 118 · garantía y renta de la ferretería.
      'garantia', 'renta',
      -- 141 · abrir una pieza para cabina, y lo que se gasta en el servicio.
      'apertura_cabina', 'consumo_cabina'
    )
  );

-- ── 4 · La existencia de cabina NO es una tabla nueva ────────────────────
--
-- `existencias` (003) lleva la pareja insumo/almacén, y el puente entre el
-- producto que se vende y el insumo que se gasta ya existe desde la 040
-- (`producto_insumo_base`). Abrir una pieza es, exactamente, un traspaso: sale
-- una pieza del almacén de venta y entran `factor_apertura` unidades del insumo
-- base en el de cabina.
--
-- Lo único que le falta a `existencias` es poder decir en qué unidad está
-- medida ESTA fila, porque la de venta cuenta piezas y la de cabina cuenta
-- mililitros o gramos del mismo insumo.
alter table existencias add column unidad_medida text;

comment on column existencias.unidad_medida is
  'F-155 · Sólo se llena en almacenes de cabina: es la unidad en la que está medida ESTA fila. La existencia de venta del mismo insumo sigue contando piezas.';
