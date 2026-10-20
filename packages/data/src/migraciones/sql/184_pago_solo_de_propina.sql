-- 184 · Un renglón de pago puede ser SÓLO propina.
--
-- ── EL CASO, y por qué no cabía ─────────────────────────────────────────────
-- Lo más normal en un restaurante: la mesa paga la cuenta entera con tarjeta y deja la
-- propina en billete. Son dos renglones de `pagos`, cada uno con su método: el de tarjeta
-- con la venta y el de efectivo con la propina y SIN venta (la propina por método es la que
-- fue, `F1-01` §3 regla 3). `pagos_monto_centavos_check` exigía `monto_centavos > 0`, así que
-- ese renglón no cabía: la pantalla nueva del cobro lo rechazaba y la heredada lo descartaba
-- con todo y propina. La salida falsa —inventarle un centavo de venta al efectivo— descuadra
-- la venta por método, y no se hizo.
--
-- ── Lo que hace ──────────────────────────────────────────────────────────────
-- `monto_centavos` pasa a admitir cero (nunca negativo) y un `check` nuevo exige que cada
-- renglón lleve venta o propina: un pago vacío sigue sin existir. Es un ENSANCHE: todas las
-- filas de hoy tienen `monto_centavos > 0` y cumplen las dos reglas. No toca datos, y el
-- código anterior funciona igual con el esquema nuevo (nunca escribe un renglón en cero).
--
-- Lo demás ya estaba bien para este renglón: la propina en efectivo entra al cajón como
-- `movimientos_caja.tipo = 'propina'` (venta/cobrar.ts), el corte separa venta y propina por
-- método, y una devolución reparte sobre `monto_centavos`, así que la propina no se devuelve
-- como venta.

-- ── Precondición ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.pagos where monto_centavos <= 0) then
    raise exception '184: hay pagos con monto_centavos <= 0; el check vigente no lo permite y algo lo saltó';
  end if;
end;
$$;

alter table pagos drop constraint pagos_monto_centavos_check;
alter table pagos add constraint pagos_monto_centavos_check check (monto_centavos >= 0);
alter table pagos add constraint pago_con_venta_o_propina
  check (monto_centavos > 0 or propina_centavos > 0);

comment on constraint pago_con_venta_o_propina on pagos is
  '184 · Un renglón lleva venta o es sólo propina (la cuenta con tarjeta y la propina en billete). Vacío no es un pago.';

-- ── Poscondición ────────────────────────────────────────────────────────────
do $$
declare
  monto text;
  combinada text;
begin
  select pg_catalog.pg_get_constraintdef(oid) into monto
    from pg_catalog.pg_constraint
   where conrelid = 'public.pagos'::regclass and conname = 'pagos_monto_centavos_check';
  select pg_catalog.pg_get_constraintdef(oid) into combinada
    from pg_catalog.pg_constraint
   where conrelid = 'public.pagos'::regclass and conname = 'pago_con_venta_o_propina';
  if monto is distinct from 'CHECK ((monto_centavos >= 0))'
     or combinada is distinct from 'CHECK (((monto_centavos > 0) OR (propina_centavos > 0)))' then
    raise exception '184: las restricciones de pagos no quedaron como se esperaba: % / %',
      coalesce(monto, '(no existe)'), coalesce(combinada, '(no existe)');
  end if;
end;
$$;
