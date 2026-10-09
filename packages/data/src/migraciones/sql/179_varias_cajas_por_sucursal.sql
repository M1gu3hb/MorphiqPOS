-- 179 · Varias cajas abiertas a la vez en una sucursal, cuando el negocio lo usa (F-235).
--
-- ── EL HUECO, y cómo se encontró ────────────────────────────────────────────
-- Preparando el día completo de la cafetería (bloque D de la 2.4), que abre dos cajas
-- a la vez: su `02-DINERO-Y-CAJA §8.1` dice «Una entre semana. Dos el fin de semana y
-- en temporada», cada una con su fondo, su arqueo y su corte. `caja/multiples.ts`
-- (F-235) se escribió para eso y dice que «la base ya impide dos sesiones abiertas EN
-- LA MISMA TERMINAL»; la 046 había creado ADEMÁS `sesiones_caja_una_abierta_por_sucursal`,
-- un índice único parcial que impide la segunda caja en CUALQUIER terminal. F-235 no
-- podía funcionar nunca, y ninguna prueba abría dos cajas.
--
-- ── Por qué no se borra la regla sin más ────────────────────────────────────
-- Porque para cuatro de los cinco giros es CORRECTA: el restaurante declara «una sola
-- caja física, una sola sesión abierta a la vez» (§8.1), y su pantalla heredada busca
-- la caja abierta en todo el negocio. Lo que cambia es que el CUPO es de la sucursal:
-- `sucursales.cajas_simultaneas`, uno por omisión —que es exactamente la regla de la
-- 046 para todo negocio existente—, y el que lo use lo sube.
--
-- ── Cómo se hace cumplir ────────────────────────────────────────────────────
-- Un índice único no sabe contar hasta dos, así que la regla pasa a un disparador que
-- BLOQUEA la fila de la sucursal antes de contar: dos aperturas simultáneas se forman
-- en fila en ese bloqueo y la segunda ve a la primera. Rechaza con el MISMO código
-- (23505) y el MISMO nombre de restricción que el índice, para que todo lo que ya
-- traducía esa violación siga diciendo lo mismo.
--
-- Es ADITIVA para el código de `main`: con el cupo en uno, la base rechaza lo mismo que
-- antes, con el mismo error.

alter table sucursales
  add column cajas_simultaneas smallint not null default 1
  check (cajas_simultaneas between 1 and 4);

comment on column sucursales.cajas_simultaneas is
  'F-235 · Cuántas cajas puede haber abiertas a la vez en esta sucursal. Uno por omisión (el restaurante, la tienda, la ferretería, el salón); la cafetería abre dos el fin de semana.';

create function sesiones_caja_cupo_de_la_sucursal() returns trigger
language plpgsql
set search_path = public
as $$
declare
  cupo smallint;
  abiertas integer;
begin
  -- La fila de la sucursal, BLOQUEADA: dos aperturas a la vez se forman aquí, y la
  -- segunda cuenta con la primera ya escrita.
  select s.cajas_simultaneas
    into cupo
    from sucursales s
   where s.id = new.sucursal_id
     and s.organizacion_id = new.organizacion_id
     for update;

  select count(*)
    into abiertas
    from sesiones_caja c
   where c.organizacion_id = new.organizacion_id
     and c.sucursal_id = new.sucursal_id
     and c.estado = 'abierta'
     and c.id <> new.id;

  if abiertas >= coalesce(cupo, 1) then
    raise exception 'La sucursal ya tiene % caja(s) abierta(s) y su cupo es %.', abiertas, coalesce(cupo, 1)
      using errcode = 'unique_violation',
            constraint = 'sesiones_caja_una_abierta_por_sucursal',
            table = 'sesiones_caja';
  end if;
  return new;
end;
$$;

comment on function sesiones_caja_cupo_de_la_sucursal() is
  'F-235 · Hace cumplir `sucursales.cajas_simultaneas` al abrir una caja. Sustituye al índice único parcial de la 046 y rechaza con su mismo nombre y su mismo código.';

create trigger sesiones_caja_cupo_de_la_sucursal
  before insert or update of estado on sesiones_caja
  for each row
  when (new.estado = 'abierta')
  execute function sesiones_caja_cupo_de_la_sucursal();

drop index sesiones_caja_una_abierta_por_sucursal;

-- La función no es de nadie más que de su disparador.
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');
  execute 'revoke all on function sesiones_caja_cupo_de_la_sucursal() from public';
  if roles_publicos is not null then
    execute format(
      'revoke all on function sesiones_caja_cupo_de_la_sucursal() from %s',
      roles_publicos
    );
  end if;
end;
$$;

-- ── La comprobación de la propia migración ─────────────────────────────────
-- Que ninguna sucursal quede con más cajas abiertas que su cupo: con el cupo en uno y
-- el índice de la 046 hasta hace un momento, no puede haber ninguna. Si la hay, la
-- regla nueva no describe la base y la migración se detiene sin tocar nada.
do $$
declare
  excedidas integer;
begin
  select count(*)
    into excedidas
    from (
      select c.sucursal_id
        from sesiones_caja c
        join sucursales s on s.id = c.sucursal_id
       where c.estado = 'abierta'
       group by c.sucursal_id, s.cajas_simultaneas
      having count(*) > s.cajas_simultaneas
    ) x;
  if excedidas > 0 then
    raise exception '179: % sucursal(es) con más cajas abiertas que su cupo', excedidas;
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'sesiones_caja_cupo_de_la_sucursal'
  ) then
    raise exception '179: falta el disparador del cupo';
  end if;
end;
$$;
