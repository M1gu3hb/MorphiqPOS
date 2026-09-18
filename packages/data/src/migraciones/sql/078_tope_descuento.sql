-- 078 · F-205 · El tope de descuento por puesto, y quién autorizó saltárselo.
--
-- ── El agujero que tapa ───────────────────────────────────────────────────
-- Hoy cualquiera que pueda cobrar puede descontar lo que quiera. No hay tope, no
-- hay autorización y no hay rastro: un descuento del 40 % y una venta regalada
-- se ven exactamente igual en el corte, y las dos se ven igual que un cobro
-- normal. Es el camino más corto para que se vaya dinero sin que nadie mienta.
--
-- ── Por qué en PESOS y no en puntos base ──────────────────────────────────
-- El `02-DINERO-Y-CAJA.md` de cafetería lo dice con todas sus letras, y tiene
-- razón: un 10 % sobre un café es tres pesos y sobre una charola de cincuenta
-- es doscientos. Un tope porcentual deja pasar el descuento grande y bloquea el
-- chico, que es justo al revés de lo que hace falta.
--
-- Se guardan LOS DOS a propósito: el tope en pesos es el que manda, y el
-- porcentual es un segundo cerrojo para la venta pequeña donde el 100 % cabe
-- dentro del tope en pesos. Un café de $45 con el tope en $200 se podría regalar
-- entero sin que nada saltara.
--
-- ── Y por qué la autorización es una FILA y no un permiso ────────────────
-- Porque «el gerente lo autorizó» sin fila es una frase, y lo que hace falta al
-- revisar el corte es saber QUIÉN, CUÁNDO y SOBRE QUÉ VENTA. Una autorización
-- sin rastro no es una autorización: es un permiso que se concede solo.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table topes_descuento (
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  rol             text        not null,
  -- Lo que este puesto puede descontar SIN pedir permiso, en centavos.
  tope_centavos   bigint      not null default 0,
  -- El segundo cerrojo, en puntos base. 2000 = 20 %.
  tope_bp         integer     not null default 0,
  actualizado_en  timestamptz not null default now(),
  empleado_id     uuid        references empleos (id) on delete set null,

  primary key (organizacion_id, rol),

  constraint topes_rol_valido check (
    rol in ('dueno', 'administrador', 'gerente', 'cajero', 'mesero', 'cocina', 'almacen')
  ),
  constraint topes_no_negativos check (tope_centavos >= 0 and tope_bp >= 0),
  -- Un tope porcentual por encima del 100 % no es un tope: es una forma de
  -- escribir «sin límite» que nadie va a leer como tal seis meses después.
  constraint topes_bp_hasta_cien check (tope_bp <= 10000)
);

comment on table topes_descuento is
  'F-205 · Cuánto puede descontar cada puesto sin permiso. En PESOS y en puntos base: el 10% de un café son tres pesos y el de una charola son doscientos.';

-- ── La bitácora de autorizaciones ─────────────────────────────────────────
create table autorizaciones_descuento (
  id                uuid        primary key default gen_random_uuid(),
  organizacion_id   uuid        not null references organizaciones (id) on delete cascade,
  sucursal_id       uuid        references sucursales (id),
  orden_id          uuid        references ordenes (id) on delete set null,

  -- Quién pidió y quién concedió. NUNCA el mismo: una autorización que uno se da
  -- a sí mismo no es una autorización, y el `check` lo impide en la base además
  -- del comando, porque este dato es la única defensa contra el fraude interno.
  solicita_empleo_id uuid       not null references empleos (id),
  autoriza_empleo_id uuid       not null references empleos (id),
  autoriza_rol       text       not null,

  descuento_centavos bigint     not null,
  tope_centavos      bigint     not null,
  motivo             text       not null,
  created_at         timestamptz not null default now(),

  constraint autorizacion_descuento_positivo check (descuento_centavos > 0),
  constraint autorizacion_con_motivo check (length(btrim(motivo)) > 0),
  constraint autorizacion_no_es_de_uno_mismo check (solicita_empleo_id <> autoriza_empleo_id),
  -- Autorizar por debajo del tope propio es ruido: si cabía, no hacía falta.
  constraint autorizacion_supera_el_tope check (descuento_centavos > tope_centavos)
);

comment on table autorizaciones_descuento is
  'F-205 · Quién autorizó saltarse su tope, sobre qué venta y por qué. Sin fila, «el gerente lo autorizó» es una frase.';
comment on constraint autorizacion_no_es_de_uno_mismo on autorizaciones_descuento is
  'Una autorización que uno se da a sí mismo no es una autorización. Va en la base además del comando porque es la única defensa contra el fraude interno.';

create index autorizaciones_por_orden on autorizaciones_descuento (organizacion_id, orden_id);
create index autorizaciones_por_fecha
  on autorizaciones_descuento (organizacion_id, created_at desc);

-- ── Los topes de partida ──────────────────────────────────────────────────
--
-- Se siembran para TODAS las organizaciones vivas, porque un tope que no existe
-- se lee como cero y dejaría a los cuatro negocios sin poder descontar nada el
-- día que se aplique. Los números salen del giro: un cajero puede quitar los
-- pesos sueltos del redondeo, un mesero no descuenta, y el dueño no tiene tope.
insert into topes_descuento (organizacion_id, rol, tope_centavos, tope_bp)
select o.id, v.rol, v.tope_centavos, v.tope_bp
  from organizaciones o
 cross join (values
   ('dueno',         100000000::bigint, 10000),
   ('administrador',    500000::bigint,  5000),
   ('gerente',          200000::bigint,  3000),
   ('cajero',             5000::bigint,  1000),
   ('mesero',                0::bigint,     0),
   ('cocina',                0::bigint,     0),
   ('almacen',               0::bigint,     0)
 ) as v(rol, tope_centavos, tope_bp)
on conflict (organizacion_id, rol) do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table topes_descuento enable row level security;
alter table topes_descuento force row level security;
alter table autorizaciones_descuento enable row level security;
alter table autorizaciones_descuento force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format(
      'revoke all privileges on table topes_descuento, autorizaciones_descuento from %s',
      roles_publicos
    );
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update on table topes_descuento to morphiqpos_app;
    grant select, insert on table autorizaciones_descuento to morphiqpos_app;
  end if;
end;
$$;
