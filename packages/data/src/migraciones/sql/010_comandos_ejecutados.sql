-- ═══════════════════════════════════════════════════════════════════════════
-- 010 · Idempotencia de comandos  (carril A · A-01)
--
-- R10 exige que cobro, comanda, stock, caja, mesa y compra sean idempotentes:
-- «un reintento produce el mismo resultado, no un duplicado». Las tablas de
-- negocio ya traen su propio `unique (organizacion_id, idempotency_key)`, pero
-- eso resuelve el caso concreto de una orden o un pago, no el general.
--
-- Esta tabla es la que hace que la idempotencia sea una propiedad del
-- ENVOLTORIO y no algo que cada comando reimplemente — que es justo lo que
-- `04-ARQUITECTURA §3` pide: «El envoltorio resuelve, una sola vez y para
-- todos: ... clave de idempotencia ... Ningún comando reimplementa eso.»
--
-- ── Por qué la reclamación de la clave vive DENTRO de la transacción ────────
--
-- Es la decisión que define el comportamiento, y las dos consecuencias son
-- requisitos, no efectos secundarios:
--
--   1. Si el comando falla a la mitad —SALE-02 interrumpe el paso de stock— el
--      ROLLBACK libera también la clave. Un reintento legítimo vuelve a
--      ejecutar de verdad. Si la clave se guardara fuera de la transacción, un
--      fallo la dejaría quemada y el reintento devolvería un éxito falso sin
--      haber cobrado: el peor error posible en una caja.
--
--   2. Dos peticiones simultáneas con la misma clave se serializan en el
--      INSERT: la segunda espera el bloqueo de fila de la primera. Si la
--      primera confirma, la segunda recibe violación de unicidad y devuelve la
--      respuesta guardada. Si la primera revierte, la segunda ejecuta. Sin un
--      solo candado en memoria, que es lo que no sobrevive a dos procesos.
-- ═══════════════════════════════════════════════════════════════════════════

create table comandos_ejecutados (
  id              uuid        primary key default gen_random_uuid(),
  organizacion_id uuid        not null references organizaciones(id) on delete cascade,

  -- El nombre estable del comando: `venta.cobrar`, `caja.abrir`. Es el mismo
  -- vocabulario `dominio.verbo` que usan el permiso y `auditoria.accion`, para
  -- que exista UNA sola fuente de cadenas y no tres que se desincronizan.
  comando         text        not null check (comando ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),

  idempotency_key text        not null check (length(idempotency_key) between 8 and 200),

  -- Huella de la entrada ya validada. Es lo que distingue un reintento legítimo
  -- («la misma operación otra vez») de un error del cliente («reusé la clave
  -- para otra cosa»). Sin ella, el segundo caso devolvería en silencio el
  -- resultado de una operación distinta.
  huella_entrada  text        not null check (length(huella_entrada) = 64),

  identidad_id    uuid        references identidades(id) on delete set null,
  correlation_id  uuid        not null,

  -- Nula mientras la ejecución no ha confirmado. Como la fila se escribe en la
  -- MISMA transacción que los efectos, una fila visible con `respuesta` nula no
  -- puede existir: o se confirmó todo, o no hay fila.
  respuesta       jsonb,
  reintentos      integer     not null default 0 check (reintentos >= 0),
  completado_en   timestamptz,
  created_at      timestamptz not null default now(),

  constraint comando_completo_con_respuesta check (
    (respuesta is null) = (completado_en is null)
  )
);

-- El alcance de la clave es (organización, comando, clave):
--   · no global, porque un inquilino no puede pisar la clave de otro;
--   · no por entidad, porque el mismo doble toque puede afectar entidades
--     distintas y aun así ser el mismo reintento.
create unique index comandos_ejecutados_clave
  on comandos_ejecutados (organizacion_id, comando, idempotency_key);

-- Para la purga por antigüedad y para reconstruir una petición por su rastro.
create index comandos_ejecutados_por_fecha on comandos_ejecutados (created_at);
create index comandos_ejecutados_por_correlacion on comandos_ejecutados (correlation_id);

comment on table comandos_ejecutados is
  'Idempotencia de R10, resuelta en el envoltorio comando(). La clave se reclama DENTRO de la transaccion: un fallo la libera, un exito la quema.';

comment on column comandos_ejecutados.huella_entrada is
  'sha256 del JSON canonico de la entrada validada. Misma clave + huella distinta = error del cliente, no reintento.';

-- ── Auditoría: índices que la consulta del histórico necesita ───────────────
-- `001_plataforma.sql` creó la tabla con dos índices. Faltan los dos que usa el
-- envoltorio: buscar por acción (¿cuántas veces se denegó un cobro?) y
-- reconstruir una petición completa por su correlation id.
create index auditoria_por_accion
  on auditoria (organizacion_id, accion, created_at desc);
create index auditoria_por_correlacion
  on auditoria (correlation_id) where correlation_id is not null;

-- ── RLS, igual que el resto (005) ──────────────────────────────────────────
-- La tabla nace cerrada. Si se omitiera, nacería abierta a PostgREST con la
-- clave publicable, que va en el navegador.
alter table comandos_ejecutados enable row level security;
alter table comandos_ejecutados force row level security;

do $$
declare
  roles text;
begin
  select coalesce(string_agg(quote_ident(rolname), ', '), '')
    into roles
    from pg_roles
   where rolname in ('anon', 'authenticated');

  if roles <> '' then
    execute format('revoke all on public.comandos_ejecutados from %s', roles);
  else
    raise notice 'Roles anon/authenticated ausentes: no es Supabase. RLS queda activo igual.';
  end if;
end;
$$;
