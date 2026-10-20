-- 185 · Una división que se borra ENTERA no tiene nada que cuadrar.
--
-- ── EL CASO ──────────────────────────────────────────────────────────────────
-- `division_cuadra` (070) es un disparador DIFERIDO: al confirmar, por cada fila tocada de
-- `ordenes` que cuelga de una madre, compara el total de la madre con la suma de sus hijas
-- vivas. El reseteo de una demostración (`configuracion.resetear_demo`, y con él
-- `scripts/sembrar-demos.mjs`) borra en UNA transacción todas las cuentas del negocio, madres e
-- hijas. Al confirmar, la madre ya no existe: `total_madre` queda NULL, `NULL is distinct from
-- 0` es verdadero y el commit revienta con 23514 «La división no cuadra: la madre suma <NULL> y
-- las hijas 0». Bastaba con que alguien dividiera una cuenta en la demo para que ya no se
-- pudiera volver a dejar limpia (lo encontró la suite de operaciones del restaurante, D-6 del
-- cierre del 21-10).
--
-- ── Lo que hace ──────────────────────────────────────────────────────────────
-- Si la madre ya no existe, el disparador no compara nada. La llave `orden_padre_id` (070) no
-- admite hijas vivas sin madre: si la madre se fue, sus hijas se fueron en la misma
-- transacción (o dejaron de colgar de ella), y no queda división que cuadrar. Con la madre viva,
-- la regla es la misma de siempre, igual de estricta. No toca datos, tablas ni restricciones.

create or replace function division_suma_igual_a_la_madre() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  madre    uuid;
  total_madre  bigint;
  total_hijas  bigint;
begin
  madre := coalesce(new.orden_padre_id, old.orden_padre_id);
  if madre is null then return null; end if;

  select o.total_centavos into total_madre from ordenes o where o.id = madre;
  -- 185 · La madre se borró en esta misma transacción: no hay división viva que cuadrar.
  if not found then return null; end if;

  select coalesce(sum(h.total_centavos), 0) into total_hijas
    from ordenes h
   where h.orden_padre_id = madre
     and h.estado <> 'cancelada';

  if total_madre is distinct from total_hijas then
    raise exception
      'La división no cuadra: la madre suma % y las hijas %', total_madre, total_hijas
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- ── Poscondición ────────────────────────────────────────────────────────────
do $$
declare
  fuente text;
begin
  select p.prosrc into fuente
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'division_suma_igual_a_la_madre';
  if fuente is null or position('if not found then return null; end if;' in fuente) = 0 then
    raise exception '185: division_suma_igual_a_la_madre no quedó con la salida para la madre borrada';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.ordenes'::regclass and tgname = 'division_cuadra' and tgdeferrable
  ) then
    raise exception '185: falta el disparador diferido division_cuadra sobre ordenes';
  end if;
end;
$$;
