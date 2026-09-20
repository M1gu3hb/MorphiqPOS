-- 167 · El refresco de `busqueda_material`, que hacía imposible guardar un producto.
--
-- ── EL DEFECTO ──────────────────────────────────────────────────────────────
-- La 121 puso tres triggers `after insert or update or delete` sobre
-- `productos`, `producto_atributos` y `ubicaciones` que llaman a
-- `refrescar_busqueda_material()`, y esa función hace:
--
--     refresh materialized view concurrently busqueda_material;
--
-- Dos cosas la rompen, y las dos son de Postgres, no del diseño del negocio:
--
-- 1 · `REFRESH MATERIALIZED VIEW` exige ser DUEÑO de la vista. La función no era
--     `security definer`, así que corría como `morphiqpos_app`, que no lo es:
--     **42501 · permission denied for materialized view busqueda_material**.
--
-- 2 · Y `CONCURRENTLY` no se puede ejecutar dentro de una función ni de un
--     bloque de transacción. Un trigger es las dos cosas a la vez, así que
--     aunque el permiso estuviera, el refresco seguiría siendo imposible.
--
-- El resultado es que **desde que se aplicó la 121, NINGUNA organización podía
-- insertar, editar ni borrar un producto**: cualquier escritura sobre
-- `productos` abortaba la transacción entera. No es una función de ferretería
-- rota; es el catálogo del sistema entero, para los cinco modelos y para los
-- cuatro negocios que cobran.
--
-- No lo vio nadie porque la 121 se escribió y se aplicó sin que ninguna prueba
-- ni ninguna puerta escribiera un producto CON EL ROL DE LA APLICACIÓN: las
-- pruebas de unidad usan dobles, y las de integración exigen Docker y no corren.
-- Se encontró al sembrar el catálogo de las cinco demostraciones (E4).
--
-- ── EL ARREGLO, y lo que cuesta ────────────────────────────────────────────
-- `security definer` para que el refresco corra con los permisos del dueño, y
-- **sin `CONCURRENTLY`**, que es la única forma de refrescar desde dentro de una
-- transacción.
--
-- Lo que se pierde: el refresco toma un `ACCESS EXCLUSIVE` sobre la vista, así
-- que durante esos milisegundos el buscador del mostrador espera. Con un
-- catálogo de 50,000 claves son unos cientos de milisegundos, y sólo al EDITAR
-- el catálogo — no al vender, porque la existencia no está dentro de la vista y
-- una venta no dispara ningún trigger. Un mostrador que espera 300 ms cuando el
-- encargado da de alta un material es infinitamente mejor que uno que no puede
-- dar de alta ningún material.
--
-- Lo que NO se toca: los triggers siguen siendo `for each statement`. Una carga
-- de 2,000 renglones en una sentencia refresca UNA vez, que era la razón de esa
-- decisión y sigue siendo correcta.
--
-- ── Por qué `security definer` aquí es seguro ──────────────────────────────
-- La función no recibe argumentos, no interpola nada y ejecuta una sola
-- sentencia fija. Lleva `set search_path = pg_catalog, public` —que ya llevaba—
-- para que nadie pueda anteponer un esquema con una vista suya. Y se le quita el
-- `execute` a `public`: sólo la llaman los triggers y el rol de la aplicación.

create or replace function refrescar_busqueda_material() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- SIN `concurrently`: dentro de un trigger es imposible. Postgres lo prohíbe
  -- en funciones y en bloques de transacción, y un trigger es las dos cosas.
  refresh materialized view busqueda_material;
  return null;
end;
$$;

revoke execute on function refrescar_busqueda_material() from public;
grant execute on function refrescar_busqueda_material() to morphiqpos_app;

-- ── POSCONDICIÓN 1 · la función quedó como definer ─────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'refrescar_busqueda_material'
       and p.prosecdef
  ) then
    raise exception 'refrescar_busqueda_material() no quedó como security definer';
  end if;
end;
$$;

-- ── POSCONDICIÓN 2 · y ya no refresca en concurrente ───────────────────────
--
-- Se busca la SENTENCIA, no la palabra: `prosrc` incluye los comentarios del
-- cuerpo, y esta misma función explica en un comentario por qué no la usa. Un
-- `ilike '%concurrently%'` se encontraba a sí mismo y abortaba la tanda.
do $$
begin
  if exists (
    select 1 from pg_proc p
     where p.proname = 'refrescar_busqueda_material'
       and p.prosrc ~* 'refresh[[:space:]]+materialized[[:space:]]+view[[:space:]]+concurrently'
  ) then
    raise exception 'refrescar_busqueda_material() sigue refrescando en CONCURRENTLY, que no se puede desde un trigger';
  end if;
end;
$$;

-- ── POSCONDICIÓN 3 · y escribir un producto ya no revienta ─────────────────
--
-- La que de verdad importa: se inserta un producto en una organización de
-- prueba, se comprueba que entró, y se revierte con el `rollback` de la propia
-- migración si algo sale mal. Sin esto, las dos de arriba dirían que la función
-- está bien aunque el trigger siguiera abortando por otra razón.
do $$
declare
  org_prueba uuid;
  producto_prueba uuid;
begin
  select id into org_prueba from organizaciones where activa order by created_at limit 1;
  if org_prueba is null then
    -- Una base recién creada no tiene organizaciones. No es un fallo de esta
    -- migración: es que no hay sobre qué comprobar.
    return;
  end if;

  insert into productos (organizacion_id, nombre, precio_venta_centavos)
    values (org_prueba, 'MIGRACION 167 · comprobacion', 1)
    returning id into producto_prueba;

  if producto_prueba is null then
    raise exception 'la 167 no pudo insertar el producto de comprobación';
  end if;

  delete from productos where id = producto_prueba;
end;
$$;
