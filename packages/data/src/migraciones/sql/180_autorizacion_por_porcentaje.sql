-- 180 · La autorización de un descuento que pasa el tope POR PORCENTAJE (F-205, D-28).
--
-- ── EL DEFECTO, y cómo se encontró ──────────────────────────────────────────
-- El tope de un puesto tiene DOS ramas (`topes_descuento`, 078): un importe Y un
-- porcentaje, y un descuento pasa el tope si pasa CUALQUIERA de las dos
-- (`evaluarDescuento`, `packages/domain/src/venta/descuento.ts`). La tabla de
-- autorizaciones sólo conocía la primera:
--
--   constraint autorizacion_supera_el_tope check (descuento_centavos > tope_centavos)
--
-- Así que un descuento que pasa el tope por porcentaje y no por importe —$20 sobre una
-- venta de $84 con tope de cajera de $50 o el 10 %: 24 %— pedía el PIN del supervisor, el
-- supervisor lo tecleaba, y la base rechazaba la fila con 23514. La cajera veía «Algo
-- falló de nuestro lado» y ese descuento NO SE PODÍA AUTORIZAR NUNCA. Lo encontró el día
-- completo de la tienda (bloque D de la 2.4).
--
-- ── Lo que cambia ────────────────────────────────────────────────────────────
-- La fila guarda también la base de la venta y el tope en puntos base, y el `check` acepta
-- las dos ramas, con la misma aritmética que el dominio: multiplicando en cruz, nunca
-- dividiendo (dividir en enteros trunca y tolera en silencio un centavo de más).
--
-- Es ADITIVA para el código de `main`: las columnas nuevas son opcionales y, sin ellas, el
-- `check` exige lo mismo que antes —que el importe pase el tope—.

-- ── Precondición ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'autorizacion_supera_el_tope'
       and conrelid = 'public.autorizaciones_descuento'::regclass
  ) then
    raise exception '180: autorizaciones_descuento no tiene la restricción de la 078 que esta migración sustituye';
  end if;
end;
$$;

alter table autorizaciones_descuento
  add column base_centavos bigint,
  add column tope_bp integer;

comment on column autorizaciones_descuento.base_centavos is
  'F-205 · El importe de la venta sobre el que se pidió el descuento. Con él se comprueba la rama del porcentaje.';
comment on column autorizaciones_descuento.tope_bp is
  'F-205 · El tope en puntos base del puesto que pidió el descuento (1000 = 10 %).';

alter table autorizaciones_descuento
  add constraint autorizacion_base_positiva check (base_centavos is null or base_centavos > 0),
  add constraint autorizacion_tope_bp_valido check (tope_bp is null or tope_bp between 0 and 10000),
  add constraint autorizacion_base_y_tope_juntos check ((base_centavos is null) = (tope_bp is null));

alter table autorizaciones_descuento drop constraint autorizacion_supera_el_tope;

alter table autorizaciones_descuento
  add constraint autorizacion_supera_el_tope check (
    descuento_centavos > tope_centavos
    or (
      base_centavos is not null
      and tope_bp is not null
      and descuento_centavos * 10000 > base_centavos * tope_bp
    )
  );

comment on constraint autorizacion_supera_el_tope on autorizaciones_descuento is
  'Autorizar por debajo del tope propio es ruido: si cabía, no hacía falta. El tope tiene dos ramas —importe o porcentaje— y basta pasar una (180).';

-- ── La comprobación de la propia migración ─────────────────────────────────
-- Toda fila que ya estaba cumple la regla nueva (la vieja es un caso de ella), y la
-- restricción quedó con las dos ramas.
do $$
declare
  definicion text;
begin
  select pg_catalog.pg_get_constraintdef(oid)
    into definicion
    from pg_catalog.pg_constraint
   where conname = 'autorizacion_supera_el_tope'
     and conrelid = 'public.autorizaciones_descuento'::regclass;
  if definicion is null or position('tope_bp' in definicion) = 0 then
    raise exception '180: la restricción del tope no quedó con la rama del porcentaje';
  end if;
end;
$$;
