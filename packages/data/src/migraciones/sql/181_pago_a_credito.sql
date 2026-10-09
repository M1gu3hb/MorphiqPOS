-- 181 · La venta a crédito de la ferretería es VENTA, y su pago se llama `credito`.
--
-- ── EL DEFECTO, y cómo se encontró ──────────────────────────────────────────
-- La remisión firmada (`credito.registrar_remision`) subía el saldo del contratista y
-- dejaba la orden en `confirmada`: sin folio de venta, sin pago y sin salida de almacén.
-- Para el servidor, el material que salió por la puerta firmado no era una venta del día,
-- y el corte, la conciliación y el inventario no lo veían. `ferreteria/02-DINERO-Y-CAJA`
-- lo dice en dos sitios: §1 —«Material entregado con remisión firmada (crédito) · Sí, en
-- el momento de la entrega … Método de pago `credito`»— y §6.3 —«Es venta, método
-- credito … baja el stock, no entra dinero»—. Lo encontró el día completo de la
-- ferretería (bloque D de la 2.4).
--
-- ── Lo que cambia ────────────────────────────────────────────────────────────
-- La remisión cierra la orden como pagada, igual que el fiado en `venta.cobrar`: folio,
-- salida de almacén y un renglón en `pagos` que NO mueve el cajón. Ese renglón necesita
-- su método, y `pagos_metodo_check` (003) no conocía `credito`. Se añade a la lista.
--
-- Es ADITIVA para el código de `main`: ensancha una lista; nada de lo que ya estaba deja
-- de caber.

-- ── Precondición ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'pagos_metodo_check'
       and conrelid = 'public.pagos'::regclass
  ) then
    raise exception '181: pagos no tiene la restricción de métodos de la 003 que esta migración ensancha';
  end if;
end;
$$;

alter table pagos drop constraint pagos_metodo_check;

alter table pagos
  add constraint pagos_metodo_check check (
    metodo in (
      -- 003 · el tronco.
      'efectivo', 'tarjeta', 'transferencia', 'fiado', 'puntos', 'monedero',
      -- 181 · la remisión firmada de la ferretería: suma a la venta y no al cajón.
      'credito'
    )
  );

comment on constraint pagos_metodo_check on pagos is
  'Los métodos con que se paga una venta. `credito` es la remisión firmada: venta del día sin dinero en el cajón (181).';

-- ── La comprobación de la propia migración ─────────────────────────────────
-- La lista quedó con TODOS los métodos de antes y con el nuevo.
do $$
declare
  definicion text;
  falta text;
begin
  select pg_catalog.pg_get_constraintdef(oid)
    into definicion
    from pg_catalog.pg_constraint
   where conname = 'pagos_metodo_check'
     and conrelid = 'public.pagos'::regclass;

  select string_agg(m, ', ')
    into falta
    from unnest(array['efectivo', 'tarjeta', 'transferencia', 'fiado', 'puntos', 'monedero',
                      'credito']) as m
   where definicion is null or position('''' || m || '''' in definicion) = 0;

  if falta is not null then
    raise exception '181: la lista de pagos.metodo se quedó sin: %', falta;
  end if;
end;
$$;
