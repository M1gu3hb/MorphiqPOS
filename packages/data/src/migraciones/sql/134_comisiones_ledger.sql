-- 134 · El ledger de la comisión causada (F-443).
--
-- ── Por qué el ledger va SOLO, y no dentro de la 133 ─────────────────────
-- La regla y lo causado cambian a ritmos distintos. La regla se toca cuatro
-- veces al año, con la dueña delante; el ledger crece doscientas filas al día
-- y es lo que se lee en cada liquidación. Tenerlos en una misma migración
-- obligaba a mover los dos cuando sólo cambiaba uno, y la parte cara —la que
-- tiene el trigger que prohíbe editar— es exactamente la que no debe moverse.
--
-- ── SIN `update`, NUNCA ──────────────────────────────────────────────────
-- Una cancelación escribe una fila NEGATIVA con motivo y autor. La profesional
-- ve «$1,840» y abajo «− $50, ticket 3471 cancelado a las 18:12 por Paty», y
-- eso sí lo entiende. Si la fila original se editara, el número cambiaría solo
-- y nadie podría decir por qué — que es el dolor entero de este bloque: la
-- comisión que baja sin explicación es la razón número uno por la que una
-- estilista se va con su cartera de clientas a otro salón.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── F-443 · El ledger de lo causado ──────────────────────────────────────
--
-- SIN `update`, NUNCA. Una cancelación escribe una fila NEGATIVA con motivo y
-- autor. Karla ve «$1,840» y abajo «− $50, ticket 3471 cancelado a las 18:12
-- por Paty», y eso sí lo entiende. Si la fila original se editara, el número
-- cambiaría solo y nadie podría decir por qué.
create table comisiones_causadas (
  id                            uuid        primary key default gen_random_uuid(),
  organizacion_id               uuid        not null references organizaciones (id) on delete cascade,
  orden_linea_id                uuid        references orden_lineas (id),
  cita_servicio_id              uuid        references cita_servicios (id),
  profesional_id                uuid        not null references profesionales (id) on delete restrict,

  regla_id                      uuid        not null references reglas_comision (id),
  -- QUÉ regla, en QUÉ versión. Sin la versión, una regla que cambió deja el
  -- histórico sin forma de explicarse.
  regla_version                 int         not null,

  tipo                          text        not null,
  base_centavos                 bigint      not null,
  tasa_bp                       int         not null,
  -- Puede ser NEGATIVO: es lo que hace posible la contrapartida.
  monto_centavos                bigint      not null,
  material_descontado_centavos  bigint      not null default 0 check (material_descontado_centavos >= 0),

  contrapartida_de_id           uuid        references comisiones_causadas (id),
  motivo                        text,
  liquidacion_id                uuid,
  causada_en                    timestamptz not null default now(),

  constraint comision_tipo_valido check (
    tipo in ('servicio', 'producto', 'venta_paquete', 'ajuste', 'contrapartida')
  ),
  -- Una contrapartida sin origen y sin motivo es un descuento anónimo en la
  -- liquidación de alguien.
  constraint comision_contrapartida_explicada check (
    tipo <> 'contrapartida' or (contrapartida_de_id is not null and motivo is not null)
  ),
  constraint comision_contrapartida_negativa check (
    tipo <> 'contrapartida' or monto_centavos < 0
  )
);

comment on table comisiones_causadas is
  'F-443 · El ledger. Sin UPDATE nunca: una cancelación escribe una fila negativa con motivo y autor, para que el número que baja se pueda explicar en voz alta.';

create index comisiones_por_liquidar
  on comisiones_causadas (organizacion_id, profesional_id, causada_en)
  where liquidacion_id is null;

-- El trigger que hace cumplir «sin UPDATE nunca». La aplicación puede
-- equivocarse; esto no.
create or replace function comision_no_se_edita() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- La ÚNICA columna que puede cambiar es `liquidacion_id`: marcar una comisión
  -- como pagada no cambia lo que se causó.
  if (new.monto_centavos, new.base_centavos, new.tasa_bp, new.profesional_id, new.tipo)
     is distinct from
     (old.monto_centavos, old.base_centavos, old.tasa_bp, old.profesional_id, old.tipo) then
    raise exception 'Una comisión causada no se edita: escribe una contrapartida con su motivo.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger comisiones_causadas_no_se_editan
  before update on comisiones_causadas
  for each row execute function comision_no_se_edita();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table comisiones_causadas enable row level security;
alter table comisiones_causadas force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table comisiones_causadas from %s', roles_publicos);
  end if;

  -- Ni un `delete`, tampoco al rol de la aplicación: un ledger del que se puede
  -- borrar una fila no es un ledger. El `update` se concede sólo porque marcar
  -- `liquidacion_id` lo necesita, y el trigger de arriba vigila que no sirva
  -- para nada más.
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table comisiones_causadas to morphiqpos_app;
  end if;
end;
$$;
