-- 047 · La vista `empleados_visibles` (F1-02 E3-3).
--
-- El puente tiene que devolver campos DERIVADOS: `Mesa.mesero_asignado_nombre`,
-- `Venta.usuario_mesero_nombre`, `SolicitudQR.atendido_por_nombre`… Todos son
-- el mismo viaje: un identificador de empleo, y el nombre de la persona detrás.
--
-- Sin esta vista, cada uno de esos campos sería un `join` de DOS saltos
-- (`empleos.persona_id → personas.nombre`), y el mecanismo genérico de
-- derivados del puente tendría que saber encadenar. Con la vista, cada derivado
-- es un `left join` de un salto y el mecanismo se queda en diez líneas.
--
-- Es una vista, no una tabla: no duplica nada y no se puede desincronizar.
create view empleados_visibles as
select
  e.id,
  e.organizacion_id,
  e.persona_id,
  e.sucursal_id,
  e.rol,
  e.activo,
  e.color,
  e.estacion_preparacion_id,
  e.ve_todas_las_estaciones,
  p.nombre,
  -- El nombre completo para los sitios donde su interfaz lo enseña entero.
  trim(p.nombre || coalesce(' ' || p.apellidos, '')) as nombre_completo
from empleos e
join personas p on p.id = e.persona_id and p.organizacion_id = e.organizacion_id;

comment on view empleados_visibles is
  'Empleo + persona en una fila. Existe para que los campos derivados del puente '
  '(nombre y color del mesero, del cajero, de quien atiende) sean un join de un salto. '
  'NO expone el PIN: `credenciales_pin` no entra aquí, ni entrará.';

-- Misma postura que 005_rls.sql: la aplicación habla por Kysely con
-- credenciales de servidor; anon y authenticated no pueden hacer nada.
-- Una vista hereda los permisos de quien la define, así que sin este revoke
-- sería la puerta abierta a `empleos` y `personas` que las dos ya tienen cerrada.
do $$
declare roles text;
begin
  select string_agg(quote_ident(rolname), ', ') into roles
    from pg_roles where rolname in ('anon','authenticated');
  if roles is null then return; end if;
  execute format('revoke all on public.empleados_visibles from %s', roles);
end;
$$;
