-- 183 · El número de mesa no se repite entre las mesas activas de un restaurante.
--
-- ── EL HUECO, y cómo se encontró ────────────────────────────────────────────
-- Producción (`wyqmzhliurwyxuyxznpb`) tiene el índice `mesas_numero_unico` y NINGUNA
-- migración lo crea: llegó a la base viva fuera del ledger, como el de la 052. Se comprobó el
-- 20-10-2026 leyendo sólo el catálogo: las 1727 columnas, 1362 restricciones y 439 índices de
-- producción son exactamente los de las 182 migraciones más este índice, nada más (el resumen
-- de `verify:esquema` coincide). `scripts/esquema-esperado.json` lo traía desde la C-12.
--
-- La consecuencia: una base nueva —la de CI, la desechable de la laptop— acepta dos
-- «Mesa 5» activas en el mismo restaurante, y producción no. El editor de mesas propone el
-- número siguiente, pero se puede cambiar a mano; lo que en CI se guardaba, en producción
-- contestaba un error. Las pruebas no veían la regla que el negocio sí tiene.
--
-- ── Lo que hace ──────────────────────────────────────────────────────────────
-- Crea el índice tal como está en producción: único por negocio y PARCIAL (`where activa`),
-- así que una mesa dada de baja conserva su número y no impide crear otra con el mismo.
-- En producción no cambia nada: `if not exists` lo encuentra y sigue, sin bloquear la tabla
-- ni reconstruirlo. La poscondición exige que, exista de antes o no, quede con esa definición.

-- ── Precondición ────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1
      from public.mesas
     where activa
     group by organizacion_id, numero
    having count(*) > 1
  ) then
    raise exception '183: hay mesas activas con el mismo número en un negocio; renumérelas antes de aplicar';
  end if;
end;
$$;

create unique index if not exists mesas_numero_unico
  on mesas (organizacion_id, numero)
  where activa;

-- ── Poscondición ────────────────────────────────────────────────────────────
do $$
declare
  definicion text;
begin
  select pg_catalog.pg_get_indexdef(i.indexrelid)
    into definicion
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
   where c.relname = 'mesas_numero_unico'
     and i.indrelid = 'public.mesas'::regclass;
  if definicion is null
     or regexp_replace(definicion, ' ON (public\.)?mesas ', ' ON mesas ')
        <> 'CREATE UNIQUE INDEX mesas_numero_unico ON mesas USING btree (organizacion_id, numero) WHERE activa' then
    raise exception '183: mesas_numero_unico no quedó como en producción: %', coalesce(definicion, '(no existe)');
  end if;
end;
$$;
