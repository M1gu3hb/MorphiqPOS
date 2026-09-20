-- 172 · El movimiento de stock recupera su NOTA, y los motivos que le faltaban.
--
-- ── EL DEFECTO, QUE ES SISTÉMICO ────────────────────────────────────────────
-- La 062 hizo lo correcto: `movimientos_stock.motivo` dejó de ser texto libre y
-- pasó a apuntar a `motivos_merma.clave`, «porque cada giro añade los suyos y un
-- check obligaría a una migración por motivo».
--
-- Lo que nadie hizo fue revisar quién escribía esa columna. **Siete comandos
-- seguían metiendo frases**: «Diferencia de conteo físico», «redondeo en especie»,
-- «reposición al cliente · Taladro», «apertura para cabina de Tinte 7.1», el
-- `motivo` que teclea el operador en un ajuste, el de un traspaso, y el tipo de un
-- consumo de servicio. Ninguna es una clave, así que la base rechazaba el
-- movimiento con `23503` y **la transacción entera se abortaba**: el conteo no
-- cerraba, la garantía no se reponía, la cabina no se abría y el ajuste de
-- inventario no se podía guardar. Medido el 19-09-2026 al cerrar un servicio con
-- consumos y al cortar material.
--
-- ── LO QUE ESTA MIGRACIÓN DECIDE ────────────────────────────────────────────
-- 1. `motivo` es una CLAVE de merma, y sólo tiene sentido donde hubo merma o
--    ajuste. En un traspaso, una apertura de cabina o un consumo de servicio no
--    hay motivo de merma: hay una explicación, que es otra cosa.
-- 2. Esa explicación vuelve a tener columna: `nota`. Perderla no era una opción
--    —«$430 de ajuste» sin el «se cayó la caja de foquitos» es un número que
--    nadie puede revisar— y meterla en `motivo` es lo que rompía la foránea.
-- 3. Los dos motivos que sí son merma y no estaban se añaden como filas, que es
--    exactamente para lo que la 062 hizo esto una tabla.

alter table movimientos_stock add column if not exists nota text;

comment on column movimientos_stock.nota is
  'La explicación en palabras: «se cayó la caja de foquitos», «apertura para cabina de Tinte 7.1». El `motivo` es una clave de `motivos_merma` y sólo aplica a merma o ajuste; esto es lo que una persona escribió, y sin ello un ajuste de $430 es un número que nadie puede revisar.';

-- ── Los dos motivos que faltaban ───────────────────────────────────────────
--
-- `redondeo_especie`: el «te doy un chicle en vez de los 50 centavos» de una
-- tiendita. Es producto que sale sin cobrarse, o sea merma, y no es imputable a
-- nadie: lo decide el cajero con el cliente delante y es la práctica del giro.
--
-- `reposicion_garantia`: el taladro que se cambia al cliente. Sale del almacén sin
-- venta, y SÍ es imputable —al proveedor— porque de ahí sale la reclamación: sin
-- separarlo de una merma cualquiera, la garantía que el proveedor debe reponer se
-- pierde entre las cajas mojadas.
insert into motivos_merma (clave, etiqueta, giro, imputable) values
  ('redondeo_especie',    'Redondeo entregado en especie', null, false),
  ('reposicion_garantia', 'Reposición al cliente por garantía', null, true)
on conflict (clave) do nothing;

-- La comprobación de la propia migración: los motivos que el código usa como
-- literales tienen que existir. Si mañana alguien añade un literal nuevo sin su
-- fila, esto lo dice aquí y no en el mostrador.
do $$
declare
  faltan text;
begin
  select string_agg(clave, ', ')
    into faltan
    from (values
      ('ajuste_conteo'), ('corte'), ('retazo_invendible'), ('redondeo_especie'),
      ('reposicion_garantia'), ('calibracion'), ('derrame'), ('bebida_rehecha'),
      ('vapor_leche')
    ) as usados (clave)
   where not exists (select 1 from motivos_merma m where m.clave = usados.clave);

  if faltan is not null then
    raise exception 'faltan motivos de merma que el código usa: %', faltan;
  end if;
end;
$$;
