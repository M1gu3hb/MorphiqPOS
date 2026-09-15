-- 058 · F-015 plantilla de negocio y F-016 perillas por módulo (D-01, D-12).
--
-- ── Lo que hace ────────────────────────────────────────────────────────────
-- Los tres valores de `organizaciones.paquete` dejan de ser niveles comerciales
-- —`esencial`, `operativo`, `restaurante_pro`— y pasan a nombrar el MODELO DE
-- NEGOCIO al que sirven: `tienda`, `cafeteria`, `restaurante`.
--
-- ── Por qué el update parte POR GIRO y no por paquete ──────────────────────
-- Escrito plano, `operativo → cafeteria` arrastra a Abarrotes Don Chuy y a
-- Ferretería La Broca —los dos en `operativo` hoy— a la plantilla de un negocio
-- de café. Dos clientes que pagan, operando, con recetas y portal QR donde
-- debería haber presentaciones y código de barras.
--
-- Café Jacaranda, en cambio, se queda en `restaurante` AUNQUE SU GIRO SEA
-- CAFETERÍA: tiene contratado el paquete completo con mesero y cocina, y
-- bajarlo a `cafeteria` le quitaría módulos que paga. El giro dice qué NEGOCIO
-- es; la plantilla dice qué COMPRÓ. Ésa es justo la razón por la que la 054
-- separó las dos columnas.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ───────────────────────────────
-- Cambia el valor de una columna de la que dependen los cuatro negocios vivos.
-- El acople la aplica con los negocios CERRADOS y con respaldo hecho, que es la
-- condición de la decisión pendiente P-04. Mientras tanto, el código entiende
-- los seis valores (ver `packages/contracts/src/comandos/plantillas.ts`), que
-- es la regla de orden de despliegue: primero lo aditivo, luego el frontend, y
-- sólo entonces se retira lo viejo.

-- ── 1 · El renombre, partido por giro ──────────────────────────────────────

-- El `check` viejo tiene que irse ANTES del update: sus valores ya no existen.
alter table organizaciones drop constraint organizaciones_paquete_check;
alter table organizaciones drop constraint organizaciones_paquete_compatible_con_giro;

update organizaciones
set paquete = case
  -- Giro de alimentos con el paquete completo: conserva sala y cocina.
  when giro in ('cafeteria', 'restaurante') and paquete = 'restaurante_pro' then 'restaurante'
  -- Giro de alimentos sin sala: mostrador.
  when giro in ('cafeteria', 'restaurante') and paquete = 'operativo'       then 'cafeteria'
  -- Retail con operación: tienda, NUNCA cafeteria.
  when giro in ('tienda', 'ferreteria', 'farmacia') and paquete = 'operativo' then 'tienda'
  -- Esencial va a tienda sea cual sea el giro: D-01 dice que el renombre no es
  -- sólo de nombre, y que una tienda sin inventario no es una tienda.
  when paquete = 'esencial' then 'tienda'
  -- Cualquier combinación que no contemplen las anteriores cae a la plantilla
  -- MÁS RESTRICTIVA. Un dato inesperado no puede abrir módulos no contratados.
  else 'tienda'
end
where paquete in ('esencial', 'operativo', 'restaurante_pro');

alter table organizaciones
  alter column paquete set default 'tienda',
  add constraint organizaciones_paquete_check
    check (paquete in ('tienda', 'cafeteria', 'restaurante')),
  add constraint organizaciones_paquete_compatible_con_giro
    check (paquete <> 'restaurante' or giro in ('cafeteria', 'restaurante'));

comment on column organizaciones.paquete is
  'Plantilla de negocio contratada (F-015): tienda, cafeteria o restaurante. Gobierna módulos y comandos en el servidor. Distinta del giro: el giro dice qué negocio es, la plantilla qué compró.';

-- ── 2 · Poscondición: ningún negocio vivo quedó en la plantilla equivocada ──
--
-- Se comprueba DENTRO de la migración y falla sin tocar nada más si no cuadra,
-- que es la regla de `supabase-vercel-produccion` §3. Un renombre que manda un
-- cliente a la plantilla de otro giro no se puede descubrir en producción.
do $$
declare
  descolocadas int;
begin
  select count(*) into descolocadas
    from organizaciones
   where (giro in ('tienda', 'ferreteria', 'farmacia') and paquete <> 'tienda')
      or (giro in ('cafeteria', 'restaurante') and paquete not in ('cafeteria', 'restaurante'));

  if descolocadas > 0 then
    raise exception
      'El renombre dejó % organización(es) en una plantilla incompatible con su giro', descolocadas
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ── 3 · F-016 · Las perillas por módulo ────────────────────────────────────
--
-- La tabla guarda EXCEPCIONES, no el estado completo. Un negocio sin filas usa
-- el preajuste de su plantilla tal cual, y cambiar ese preajuste llega a todos
-- los que no lo hayan personalizado — que es justo lo que se espera de un
-- preajuste. Guardar el estado completo congelaría cada negocio en el día que
-- se dio de alta.
create table organizacion_modulos (
  organizacion_id uuid        not null references organizaciones (id) on delete cascade,
  modulo          text        not null,
  activo          boolean     not null,
  motivo          text,
  empleado_id     uuid        references empleos (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (organizacion_id, modulo),

  constraint organizacion_modulos_modulo_no_vacio check (length(btrim(modulo)) > 0)
);

comment on table organizacion_modulos is
  'F-016 · Perillas por módulo. Guarda SÓLO las excepciones al preajuste de la plantilla: una fila significa "este negocio cambió este módulo a mano".';
comment on column organizacion_modulos.motivo is
  'Por qué se encendió o apagó. Una perilla sin motivo es una decisión que nadie va a poder explicar en seis meses.';

create index organizacion_modulos_por_organizacion
  on organizacion_modulos (organizacion_id)
  where activo;

alter table organizacion_modulos enable row level security;
alter table organizacion_modulos force row level security;

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on table organizacion_modulos from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select, insert, update, delete on table organizacion_modulos to morphiqpos_app;
  end if;
end;
$$;
