-- 160 · Las listas cerradas que el código ya no respeta, puestas al día.
--
-- ── Por qué esta migración existe, y por qué está fuera de los rangos ──────
-- La decisión D-08 reparte 058-159 entre el tronco y los cinco modelos, y deja
-- 160-199 reservado. Esto es lo primero que ocupa ese rango, y por una razón de
-- ORDEN: los defectos que corrige son de migraciones de tres modelos distintos
-- —cafetería, abarrotes y ferretería— y la corrección tiene que aplicarse
-- DESPUÉS de las tres. Ponerla en el rango del tronco (0xx) la dejaría delante,
-- y la migración de abarrotes volvería a pisarla.
--
-- ── El defecto de fondo, que es de método y no de columna ──────────────────
-- `movimientos_stock.referencia_tipo` se ha redeclarado CUATRO veces —077, 085,
-- 097 y 111— y cada una **escribe la lista entera**. Un `check` no se puede
-- «añadir a»: hay que tirarlo y volverlo a poner. Y cada modelo escribió la
-- lista que él conocía:
--
--     085 (cafetería) … 'consumo_interno', 'anulacion', 'merma_barra'
--     097 (abarrotes) … 'consumo_interno', 'anulacion', 'redondeo'
--                                                        ↑ y aquí se PERDIÓ
--                                                          'merma_barra'
--     111 (ferretería)… 'redondeo', 'corte', 'servicio', 'garantia', 'renta'
--                                                          sigue perdido
--
-- O sea: al aplicar las migraciones en orden, `registrarMermaDeBarra` —que E4
-- construyó y que está probado— revienta con 23514 en la primera merma de leche
-- de la cafetería. Ninguna de las 1 954 pruebas lo ve: la base falsa no lleva
-- `check` y las migraciones de la Fase 2 no se aplican.
--
-- Lo encontró `valores-de-check.contrato.test.ts`, que compara los literales del
-- código contra los `check` vigentes. La puerta vale más que esta migración: el
-- defecto no es de estas dos columnas, es de la forma de trabajar.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── 1 · `movimientos_stock.referencia_tipo` · la UNIÓN de las cuatro ───────
--
-- Se escribe la unión completa y se añaden los tres que el código de la etapa 8
-- necesita: `merma` (F-109), `traspaso` (F-105) y el `merma_barra` que la 097
-- tiró sin querer.
alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in (
      -- Los del tronco, desde la 003.
      'orden', 'compra', 'conteo', 'manual',
      -- 077 · consumo interno y cortesías.
      'consumo_interno', 'anulacion',
      -- 085 · la merma de barra de la cafetería. LA 097 SE LA LLEVÓ POR DELANTE.
      'merma_barra',
      -- 097 · el redondeo en especie de abarrotes.
      'redondeo',
      -- 113 y 117 · corte de material y servicio de mostrador de la ferretería.
      'corte', 'servicio',
      -- 118 · garantía y renta de la ferretería.
      'garantia', 'renta',
      -- 141 · abrir una pieza para cabina, y lo que se gasta en el servicio.
      'apertura_cabina', 'consumo_cabina',
      -- 160 · la etapa 8 del tronco: merma con motivo y traspaso entre almacenes.
      'merma', 'traspaso'
    )
  );

comment on column movimientos_stock.referencia_tipo is
  'De dónde salió el movimiento. Lista cerrada, y la vigila valores-de-check.contrato.test.ts: cada modelo que añada un valor tiene que escribir la lista ENTERA, o se lleva por delante los de los demás.';

-- ── 2 · `liquidaciones_propina.rango_tipo` · el turno ──────────────────────
--
-- El bote de una cafetería se reparte POR TURNO, no por día: la mañana y la
-- tarde son dos equipos distintos y repartirles juntos es el origen del
-- resentimiento que F-248 viene a quitar. `repartirBote` escribe `'turno'` desde
-- la etapa 4 y el `check` de la 045 nunca lo admitió.
alter table liquidaciones_propina drop constraint liquidaciones_propina_rango_tipo_check;
alter table liquidaciones_propina
  add constraint liquidaciones_propina_rango_tipo_check check (
    rango_tipo in ('dia', 'semana', 'quincena', 'mes', 'personalizado', 'mesero', 'turno')
  );

comment on column liquidaciones_propina.rango_tipo is
  'Qué periodo cubre la liquidación. «turno» es el de la cafetería: la mañana y la tarde son dos equipos y su bote no se reparte junto.';

-- ── 3 · `movimientos_caja.tipo` · el segundo caso de lo mismo, y peor ──────
--
-- La 003 admitía `'devolucion'` y `'propina'`. La 086 (cafetería) reescribió la
-- lista para añadir `'entrada_cambio'` y **se llevó las dos por delante**; la
-- 135 (estética) copió esa lista y añadió las suyas, así que siguieron fuera.
--
-- `packages/app/src/venta/cobrar.ts` escribe `tipo: 'propina'` en CADA cobro con
-- propina. Aplicadas las migraciones en orden, **todo cobro con propina revienta
-- con 23514**. Es más grave que el de la merma de barra y se descubrió igual: no
-- por una prueba de ese código, sino por el contrato que compara las listas.
--
-- `'devolucion'` vuelve también: el `check` `movimiento_signo_coherente` de la
-- 003 sigue nombrándolo en su rama de signo negativo, así que retirarlo del tipo
-- dejaba media regla apuntando a un valor imposible.
alter table movimientos_caja drop constraint movimientos_caja_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_tipo_check check (
    tipo in (
      -- 003 · el tronco. `devolucion` y `propina` estaban aquí desde el principio.
      'apertura', 'venta', 'devolucion', 'gasto', 'retiro', 'deposito', 'ajuste', 'propina',
      -- añadidos por el camino.
      'cierre',
      -- 086 · el fondo de cambio de la cafetería.
      'entrada_cambio',
      -- 135 · la liquidación, la propina entregada, la renta y el anticipo.
      'liquidacion', 'propina_entregada', 'cobro_renta', 'anticipo_cita'
    )
  );

-- ── 4 · Poscondición ───────────────────────────────────────────────────────
--
-- Se comprueba DENTRO de la migración, que es la regla de
-- `supabase-vercel-produccion` §3: una lista que se quedó corta no se puede
-- descubrir en producción, porque se descubre en la primera venta del giro que
-- la necesita y no en la del que la escribió.
do $$
declare
  faltan text;
begin
  select string_agg(v, ', ')
    into faltan
    from unnest(array[
      'merma_barra', 'redondeo', 'corte', 'servicio', 'garantia', 'renta', 'merma', 'traspaso'
    ]) as v
   where not exists (
     select 1
       from pg_constraint c
      where c.conname = 'movimientos_stock_referencia_tipo_check'
        and pg_get_constraintdef(c.oid) like '%''' || v || '''%'
   );

  if faltan is not null then
    raise exception 'La lista de referencia_tipo se quedó sin: %', faltan
      using errcode = 'check_violation';
  end if;

  select string_agg(v, ', ')
    into faltan
    from unnest(array['devolucion', 'propina', 'entrada_cambio', 'liquidacion']) as v
   where not exists (
     select 1
       from pg_constraint c
      where c.conname = 'movimientos_caja_tipo_check'
        and pg_get_constraintdef(c.oid) like '%''' || v || '''%'
   );

  if faltan is not null then
    raise exception 'La lista de movimientos_caja.tipo se quedó sin: %', faltan
      using errcode = 'check_violation';
  end if;
end;
$$;
