-- 073 · La lista de espera del viernes por la noche (F-306).
--
-- ── El papelito ───────────────────────────────────────────────────────────
-- El viernes a las 21:00 hay doce personas esperando y el control es un papel
-- en el atril. Nadie sabe a quién le toca, el que llegó primero reclama, y el
-- sistema no puede decir cuánto falta porque no sabe cuánto dura una mesa.
--
-- ── Por qué depende de F-305 ──────────────────────────────────────────────
-- `espera_estimada_minutos` se CALCULA del promedio real de ocupación, no se
-- teclea. Una espera tecleada es una promesa que el anfitrión inventa, y el
-- comensal que se va a los veinte minutos porque le dijeron «diez» no vuelve.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table lista_espera (
  id                      uuid        primary key default gen_random_uuid(),
  organizacion_id         uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id             uuid        not null references sucursales (id),

  -- Lo que se grita: «familia Pérez».
  nombre                  text        not null check (length(trim(nombre)) > 0),
  -- Para avisar por mensaje en vez de gritar. DATO PERSONAL: el puente se lo
  -- niega al mesero, que no lo necesita para sentar a nadie.
  telefono                text,
  personas                smallint    not null check (personas > 0 and personas <= 40),

  estado                  text        not null default 'esperando',
  mesa_id                 uuid        references mesas (id),
  orden_id                uuid        references ordenes (id),
  -- Calculado de F-305 al registrar, congelado. Recalcularlo al consultar haría
  -- que la pantalla enseñara un número que baila cada vez que se refresca.
  espera_estimada_minutos smallint    check (espera_estimada_minutos >= 0),

  creada_en               timestamptz not null default now(),
  avisada_en              timestamptz,
  sentada_en              timestamptz,
  notas                   text,
  empleado_id             uuid        references empleos (id),

  constraint lista_espera_estado_valido check (
    estado in ('esperando', 'avisado', 'sentado', 'abandono')
  ),

  -- Una espera SENTADA tiene mesa y hora; una que no lo está, ninguna de las
  -- dos. Sin esto, «sentado» sin mesa deja a alguien fuera de la cola y fuera
  -- del salón, que es justo el caso que el papelito resuelve mal.
  constraint lista_espera_sentada_completa check (
    (estado = 'sentado') = (mesa_id is not null and sentada_en is not null)
  ),
  constraint lista_espera_avisada_con_hora check (
    (avisada_en is null) or (estado in ('avisado', 'sentado', 'abandono'))
  )
);

comment on table lista_espera is
  'F-306 · La cola del viernes. La espera estimada sale del promedio real de F-305, nunca tecleada.';
comment on column lista_espera.telefono is
  'Dato personal. El puente sólo lo sirve a dirección y caja: el mesero no lo necesita para sentar a nadie.';

-- La consulta caliente es «quién sigue esperando en esta sucursal, por orden de
-- llegada», y se hace cada vez que se libera una mesa.
create index lista_espera_cola
  on lista_espera (organizacion_id, sucursal_id, creada_en)
  where estado in ('esperando', 'avisado');

create index lista_espera_por_dia
  on lista_espera (organizacion_id, sucursal_id, creada_en desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table lista_espera enable row level security;
  alter table lista_espera force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table lista_espera from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table lista_espera to morphiqpos_app;
  end if;
end;
$$;
