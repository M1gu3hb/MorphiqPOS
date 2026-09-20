-- 114 · La doble unidad con conversión por peso (F-151).
--
-- ── El caso que no resuelve ningún otro modelo ───────────────────────────
-- El tornillo se COMPRA por kilo y se VENDE por pieza. No es una presentación
-- —la caja de 100 sí lo es—: es que las dos unidades miden cosas distintas del
-- mismo producto y hay que poder cruzar de una a la otra sin capturar nada dos
-- veces. Sin esto, el kilo entra al inventario y las piezas salen, y al tercer
-- mes la existencia dice 12 kg donde hay dos puños.
--
-- ── Por qué MILIGRAMOS enteros ───────────────────────────────────────────
-- El tornillo de 5 g es 5000. Un `numeric` con decimales volvería a meter
-- flotantes en una cuenta que después se multiplica por 1,400 piezas, y el
-- redondeo acumulado ahí ya no es un gramo: son dos kilos al año. Misma
-- decisión que los centavos, llevada al peso.
--
-- ── Por qué la tolerancia es una COLUMNA y no una constante ──────────────
-- Un tornillo estampado varía poco; una pija de tres pulgadas varía mucho más,
-- y el clavo de alambrón es otra historia. Una tolerancia única obligaría a
-- ponerla en el peor caso —y entonces deja de avisar cuando de verdad falta
-- material— o en el mejor —y entonces avisa cuarenta veces al día y nadie la
-- mira—. El 8 % es de dónde se parte, no dónde se queda.
--
-- ── Y por qué se guarda CUÁNDO se calibró ────────────────────────────────
-- Un peso por pieza calibrado hace dos años sobre un lote de otro proveedor no
-- es un dato: es una cifra con la forma de un dato. La fecha es lo único que
-- permite decir «esto hay que volver a pesarlo» sin adivinar.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

alter table productos
  -- F-151 · En MILIGRAMOS, enteros. El tornillo de 5 g es 5000.
  add column peso_por_pieza_mg bigint check (peso_por_pieza_mg is null or peso_por_pieza_mg > 0),
  add column tolerancia_peso_pct numeric(5, 2) not null default 8.00
    check (tolerancia_peso_pct >= 0 and tolerancia_peso_pct <= 100),
  add column peso_calibrado_en timestamptz,
  add column peso_calibrado_por uuid references empleos (id) on delete set null;

comment on column productos.peso_por_pieza_mg is
  'F-151 · Cuánto pesa UNA pieza, en miligramos enteros. Es lo que convierte el kilo que entra en las piezas que salen.';
comment on column productos.tolerancia_peso_pct is
  'Cuánto puede desviarse el peso real del esperado antes de avisar. Es por producto porque un tornillo estampado varía poco y una pija de tres pulgadas mucho: una tolerancia única o no avisa nunca o avisa siempre.';
comment on column productos.peso_calibrado_en is
  'Cuándo se pesó. Un peso por pieza de hace dos años sobre un lote de otro proveedor no es un dato: es una cifra con forma de dato.';

-- Los que se pueden contar pesando. Es la lista que abre la pantalla de conteo
-- por báscula, y sin el índice recorre las 6,000 claves del catálogo.
create index productos_con_peso_calibrado
  on productos (organizacion_id, linea_id)
  where peso_por_pieza_mg is not null;

-- ── La presentación, cuando lo que cambia es el PESO y no la cuenta ──────
--
-- `producto_presentaciones` (migración 090) ya sabe que una caja son 100
-- piezas. Lo que no sabe es que un rollo son 25 kg: ahí el factor no es un
-- número de piezas, es masa. Se añade al lado del factor de piezas, en vez de
-- reinterpretarlo, porque un mismo producto puede tener las dos —caja de 100 y
-- costal de 25 kg— y reinterpretar el factor haría que la caja pesara 100 mg.
alter table producto_presentaciones
  add column factor_por_peso_mg bigint
    check (factor_por_peso_mg is null or factor_por_peso_mg > 0);

comment on column producto_presentaciones.factor_por_peso_mg is
  'F-151 · Cuánto PESA esta presentación, en miligramos. Va al lado del factor de piezas y no en su lugar: un producto puede tener caja de 100 y costal de 25 kg a la vez.';
