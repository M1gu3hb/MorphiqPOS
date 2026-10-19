-- 182 · La devolución de una venta A CUENTA: el fiado de la tienda y el crédito de la ferretería.
--
-- ── EL HUECO, y cómo se encontró ────────────────────────────────────────────
-- `ferreteria/02-DINERO-Y-CAJA` §8.3: «Devolución de venta a crédito · Encargado · cero ·
-- Resta de ventas y del saldo». La 178 creó la devolución de venta con tres métodos
-- —efectivo, tarjeta y transferencia— y `venta.devolver_venta` exige devolver por el
-- método con que se PAGÓ: una venta fiada o remitida a crédito no se pagó con ninguno de
-- los tres, así que NO SE PODÍA DEVOLVER. El contratista que regresa los ocho sacos que le
-- sobraron seguía debiéndolos, y la única salida era sacar el dinero del cajón por un
-- material que nunca se pagó. Lo encontró el cierre de la estabilización (2.4).
--
-- ── Lo que cambia ────────────────────────────────────────────────────────────
-- · `devoluciones.metodo` admite `fiado` y `credito`: la devolución sale por el método
--   con que se pagó, y esos dos son los de la venta a cuenta (003, 181).
-- · `devoluciones.documento_credito_id`: el documento de cartera cuyo saldo bajó. Una
--   devolución a cuenta SIEMPRE nombra su documento y ninguna otra lo nombra: es lo que
--   deja reconstruir el saldo de un documento —importe − pagos aplicados − devoluciones—
--   sin creerle a la columna cacheada.
-- · `documentos_credito` gana `unique (id, organizacion_id)` —la llave primaria ya lo
--   cumple— para que la referencia exija la MISMA organización (la regla de la 004).
--
-- Es ADITIVA para el código de `main`: ensancha una lista, añade una columna nula y dos
-- restricciones que todo dato existente ya cumple (ninguna devolución tiene documento y
-- ninguna es a cuenta). El código de `main` sigue funcionando con ella aplicada.

-- ── Precondición ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'devoluciones_metodo_check'
       and conrelid = 'public.devoluciones'::regclass
  ) then
    raise exception '182: devoluciones no tiene la lista de métodos de la 178 que esta migración ensancha';
  end if;
  if exists (select 1 from public.devoluciones where metodo not in ('efectivo', 'tarjeta', 'transferencia')) then
    raise exception '182: hay devoluciones con un método fuera de la lista de la 178';
  end if;
end;
$$;

-- ── 1 · La misma organización, también hacia el documento ──────────────────
alter table documentos_credito
  add constraint documentos_credito_id_org_unica unique (id, organizacion_id);

-- ── 2 · El documento cuyo saldo bajó ─────────────────────────────────────────
alter table devoluciones add column documento_credito_id uuid;

alter table devoluciones add constraint devoluciones_documento_misma_org
  foreign key (documento_credito_id, organizacion_id)
  references documentos_credito (id, organizacion_id) on delete restrict;

create index devoluciones_por_documento on devoluciones (organizacion_id, documento_credito_id)
  where documento_credito_id is not null;

comment on column devoluciones.documento_credito_id is
  '182 · El documento de cartera cuyo saldo bajó con esta devolución. Sólo las devoluciones a cuenta (fiado, crédito) lo tienen, y todas lo tienen.';

-- ── 3 · Los métodos: los de la 178 y los dos de la venta a cuenta ───────────
alter table devoluciones drop constraint devoluciones_metodo_check;
alter table devoluciones
  add constraint devoluciones_metodo_check check (
    metodo in (
      -- 178 · lo que sale de la caja o se reversa en la terminal o el banco.
      'efectivo', 'tarjeta', 'transferencia',
      -- 182 · lo que baja el saldo que el cliente debe: no sale un peso.
      'fiado', 'credito'
    )
  );

-- Una devolución a cuenta nombra su documento, y ninguna otra lo hace.
alter table devoluciones add constraint devolucion_a_cuenta_con_documento
  check ((metodo in ('fiado', 'credito')) = (documento_credito_id is not null));

comment on constraint devoluciones_metodo_check on devoluciones is
  'Por dónde regresa el dinero: el cajón (efectivo), la terminal o el banco (tarjeta, transferencia), o el saldo que se debe (fiado, crédito; 182).';

-- ── La comprobación de la propia migración ─────────────────────────────────
do $$
declare
  definicion text;
  falta text;
begin
  select pg_catalog.pg_get_constraintdef(oid)
    into definicion
    from pg_catalog.pg_constraint
   where conname = 'devoluciones_metodo_check'
     and conrelid = 'public.devoluciones'::regclass;

  select string_agg(m, ', ')
    into falta
    from unnest(array['efectivo', 'tarjeta', 'transferencia', 'fiado', 'credito']) as m
   where definicion is null or position('''' || m || '''' in definicion) = 0;

  if falta is not null then
    raise exception '182: la lista de devoluciones.metodo se quedó sin: %', falta;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'devolucion_a_cuenta_con_documento'
       and conrelid = 'public.devoluciones'::regclass
  ) then
    raise exception '182: falta la regla que ata la devolución a cuenta con su documento';
  end if;
end;
$$;
