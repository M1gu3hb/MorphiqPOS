-- 133 · La REGLA de comisión, versionada y nunca editada en sitio (F-442).
--
-- ── El dolor 2, y por qué la REGLA va antes que el cálculo ───────────────
-- Hoy la comisión se saca con calculadora el domingo, y es la fuente número uno
-- de pleitos y de rotación en un salón. En pesos es el mayor costo variable del
-- negocio y el que nadie tiene medido.
--
-- Lo que hace confiable un cálculo de comisión no es la aritmética: es que las
-- CINCO PREGUNTAS estén contestadas por escrito ANTES de calcular nada. Cuando
-- no lo están, cada quien contesta la suya y el pleito del domingo es inevitable
-- porque los dos tienen razón con su propia respuesta.
--
--   1 · ¿Sobre lo COBRADO o sobre el precio de LISTA? Un descuento del 20 %,
--       ¿lo pone el salón o lo paga también la estilista?
--   2 · ¿Sobre el IVA o sobre el subtotal?
--   3 · ¿El material lo pone el salón, se descuenta de la base, o lo paga ella?
--   4 · Con dos personas en un servicio, ¿se reparte o se lo lleva quien lo tomó?
--   5 · Un servicio que hay que REHACER, ¿se paga dos veces?
--
-- ── La regla se VERSIONA y nunca se edita en sitio ───────────────────────
-- Cambiar el porcentaje de Dany crea una fila nueva; la anterior se cierra con
-- su vigencia. LO YA CAUSADO NO SE RECALCULA JAMÁS. Editando en sitio, subirle
-- el porcentaje en marzo le cambiaría lo que ya cobró en enero, y eso convierte
-- una liquidación firmada en una cifra que se mueve sola.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

create table reglas_comision (
  id                      uuid        primary key default gen_random_uuid(),
  organizacion_id         uuid        not null references organizaciones (id) on delete cascade,
  nombre                  text        not null check (length(trim(nombre)) > 0),
  version                 int         not null default 1 check (version > 0),

  esquema                 text        not null,
  tasa_servicio_bp        int         not null default 0 check (tasa_servicio_bp between 0 and 10000),
  tasa_producto_bp        int         not null default 0 check (tasa_producto_bp between 0 and 10000),
  tasa_venta_paquete_bp   int         not null default 0 check (tasa_venta_paquete_bp between 0 and 10000),

  -- Pregunta 1. `mitad` es el trato más común y el que nadie modela: ni el
  -- salón absorbe el descuento entero ni ella lo paga entero.
  base                    text        not null default 'cobrado',
  -- Pregunta 2. El IVA no es del salón: es del SAT. Por omisión NO se comisiona.
  sobre_iva               boolean     not null default false,
  -- Pregunta 3 · F-442.
  material                text        not null default 'salon',
  -- Pregunta 4 · F-428.
  reparto                 text        not null default 'por_servicio',
  -- Pregunta 5 · F-444.
  rehacer_paga            boolean     not null default false,
  anticipo_perdido_paga   boolean     not null default false,

  -- `[{hastaCentavos, tasaBp}, …]`, de menor a mayor.
  escalones               jsonb,
  -- F-429 · La clienta que trajo ella no se paga igual que la de la casa.
  tasa_cliente_casa_bp    int         check (tasa_cliente_casa_bp between 0 and 10000),
  tasa_cliente_propia_bp  int         check (tasa_cliente_propia_bp between 0 and 10000),

  vigente_desde           date        not null,
  vigente_hasta           date,

  created_at              timestamptz not null default now(),
  creada_por              uuid        references empleos (id) on delete set null,

  constraint regla_esquema_valido check (
    esquema in ('porcentaje_fijo', 'sueldo_mas_comision', 'escalonado', 'sin_comision')
  ),
  constraint regla_base_valida check (base in ('cobrado', 'lista', 'mitad')),
  constraint regla_material_valido check (
    material in ('salon', 'descuenta_base', 'cobra_profesional')
  ),
  constraint regla_reparto_valido check (reparto in ('por_servicio', 'todo_a_quien_tomo')),
  constraint regla_escalonado_con_escalones check (esquema <> 'escalonado' or escalones is not null),
  constraint regla_vigencia_coherente check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  -- Una versión por nombre. Cambiar la regla crea la versión siguiente; pisar
  -- la misma es exactamente lo que se quiere impedir.
  unique (organizacion_id, nombre, version)
);

comment on table reglas_comision is
  'F-440 · Las cinco preguntas contestadas por escrito ANTES de calcular. Se versiona y nunca se edita en sitio: lo ya causado no se recalcula jamás.';

create index reglas_vigentes
  on reglas_comision (organizacion_id, nombre, vigente_desde desc);

-- Las dos referencias que la 130 y la 131 dejaron apuntando a esta tabla.
alter table profesionales
  add constraint profesionales_regla_comision_fk
  foreign key (regla_comision_id) references reglas_comision (id);
alter table servicios
  add constraint servicios_regla_comision_fk
  foreign key (regla_comision_id) references reglas_comision (id);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table reglas_comision enable row level security;
alter table reglas_comision force  row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table reglas_comision from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table reglas_comision to morphiqpos_app;
  end if;
end;
$$;
