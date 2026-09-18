-- 093 · Los dos movimientos que el retail hace todos los días (F-107, F-108).
--
-- ── La devolución al proveedor no es una merma ───────────────────────────
-- Hoy, cuando el repartidor de la ruta se lleva las doce piezas hinchadas, el
-- sistema sólo sabe decir «merma». Y no lo es: la merma es dinero perdido y esto
-- es dinero recuperado —o una nota de crédito que hay que cobrarle a alguien—.
-- Con los dos en el mismo cajón, el reporte de merma de una tiendita sale tres
-- veces más grande de lo que es, y el dueño deja de mirarlo porque no le cuadra
-- con lo que ve.
--
-- ── El consumo interno tampoco ───────────────────────────────────────────
-- El refresco que se toma el dependiente y el jabón que se usa para trapear
-- salen del inventario y no son venta ni merma: son gasto de operación. Sin este
-- tipo, o se registran como merma —y contaminan el mismo reporte— o no se
-- registran, y entonces el conteo del sábado no cuadra y nadie sabe por qué.
--
-- ── Y por qué el SIGNO se declara a la vez ───────────────────────────────
-- Porque el saldo del almacén es `sum(cantidad)` y no una expresión con ramas.
-- Un tipo nuevo sin su signo declarado puede entrar en positivo un día y en
-- negativo otro, según quién escriba el comando, y entonces la existencia deja
-- de ser una suma para volverse una interpretación.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ⚠ Lista cerrada: se escribe ENTERA, con todo lo que la 003 admitía más los
-- dos de aquí. Ésta es la regla que este proyecto ya rompió cuatro veces y que
-- vigila `valores-de-check.contrato.test.ts`.
alter table movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_tipo_check check (
    tipo in (
      -- 003 · el tronco.
      'entrada_compra', 'salida_venta', 'ajuste', 'merma', 'devolucion',
      'cancelacion', 'traspaso_entrada', 'traspaso_salida',
      'inventario_inicial', 'produccion',
      -- 093 · lo que el retail hace todos los días.
      'salida_consumo_interno', 'devolucion_proveedor'
    )
  );

alter table movimientos_stock drop constraint movimiento_stock_signo_coherente;
alter table movimientos_stock
  add constraint movimiento_stock_signo_coherente check (
    case
      when tipo in ('entrada_compra', 'devolucion', 'cancelacion',
                    'traspaso_entrada', 'inventario_inicial', 'produccion')
        then cantidad > 0
      -- Los dos de esta migración SALEN del almacén. Declararlo aquí es lo que
      -- mantiene la existencia como una suma y no como una interpretación.
      when tipo in ('salida_venta', 'merma', 'traspaso_salida',
                    'salida_consumo_interno', 'devolucion_proveedor')
        then cantidad < 0
      else true
    end
  );

comment on column movimientos_stock.tipo is
  'Lista cerrada. `devolucion_proveedor` NO es merma: la merma es dinero perdido y esto es dinero recuperado. Mezclarlos hace que el reporte de merma salga tres veces más grande de lo que es.';

-- El motivo deja de ser opcional para lo que sale sin venderse. Un movimiento
-- de merma o de consumo interno sin motivo es un faltante sin autor: no se
-- puede corregir el mes que viene porque no se sabe qué pasó.
alter table movimientos_stock
  add constraint movimiento_stock_salida_con_motivo check (
    tipo not in ('merma', 'salida_consumo_interno', 'devolucion_proveedor')
    or (motivo is not null and length(trim(motivo)) > 0)
  );

-- Lo que salió sin venderse, por almacén y por mes: es el reporte que el dueño
-- SÍ va a mirar, porque ya no trae las devoluciones dentro.
create index movimientos_stock_salidas_sin_venta
  on movimientos_stock (organizacion_id, almacen_id, created_at desc)
  where tipo in ('merma', 'salida_consumo_interno', 'devolucion_proveedor');
