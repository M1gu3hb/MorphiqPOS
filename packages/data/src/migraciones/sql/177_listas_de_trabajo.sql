-- 177 · La vista de las listas de trabajo, con sus renglones contados.
--
-- ── EL HUECO, y cómo se encontró ────────────────────────────────────────────
-- Corriendo la suite de navegador de la ferretería con la vigilancia de fallos
-- encendida. `ferreteria/trabajos-de-mostrador` abría en 200, enseñaba sus tres
-- pestañas —Apartado, Listas, Garantías— y las TRES salían vacías, porque las
-- tres se pedían por POST a rutas de ESCRITURA con `{listar: true}`:
--
--   400 /api/venta/nota-mostrador     · `nota_mostrador.apartar` pide un `notaId`
--   400 /api/venta/lista-trabajo      · `lista_trabajo.capturar` pide sus líneas
--   400 /api/inventario/garantia      · `inventario.recibir_garantia` pide la pieza
--
-- Los tres `.catch` de la pantalla convertían el 400 en una lista vacía, así que
-- la pantalla decía «no hay apartados, no hay listas, no hay garantías» con las
-- tres cosas en la base. Es el mismo defecto que las lecturas del puente por un
-- campo que no existe: una lista vacía es indistinguible de «hoy no pasó nada».
--
-- ── Qué se arregla con qué ──────────────────────────────────────────────────
-- · Los APARTADOS ya tenían por dónde leerse: la vista `notas_de_caja` sirve el
--   estado «apartada» con su folio, su cliente, su total y su vencimiento, y el
--   puente ya la expone como `NotaDeCaja`. La pantalla pasa a leerla.
-- · Las GARANTÍAS también: `inventario.garantias_pendientes` existe, está probado
--   y devuelve exactamente lo que la pantalla enseña. Lo que faltaba era su RUTA.
-- · Las LISTAS no tenían nada, y necesitan una CUENTA —«4 de 7 surtidos»— que el
--   puente no sabe hacer sobre una tabla. De ahí esta vista.
--
-- ── Por qué una vista y no `hijos` en el puente ──────────────────────────────
-- Porque la pantalla enseña dos números por lista, no los renglones. Con `hijos`
-- habría que bajar hasta cuarenta renglones por lista para contar dos cosas, y
-- son cuarenta filas por lista que nadie pinta. La cuenta la hace la base una vez.

-- ═══════════════════════════════════════════════════════════════════════════
-- `listas_de_trabajo` · el papel del albañil, con lo surtido contado (F-153)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `renglones` es cuántos pidió y `surtidos` cuántos están completos. Completo es
-- `surtida >= cantidad` y NO `surtida > 0`: media varilla entregada no es un
-- renglón surtido, y contarlo como tal hace que la lista se vea terminada cuando
-- al cliente le falta material. Un renglón sin traducir —`cantidad is null`, que
-- es el estado normal mientras sigue siendo un papel— no cuenta como surtido.
--
-- `cliente` sale del cliente registrado o del nombre libre, en ese orden: la
-- tabla exige uno de los dos (`lista_con_alguien`), así que nunca es nulo.
create view listas_de_trabajo as
select l.id,
       l.organizacion_id,
       l.sucursal_id,
       l.folio,
       l.titulo,
       l.estado,
       coalesce(c.nombre, l.nombre_libre) as cliente,
       coalesce(c.telefono, l.telefono_libre) as telefono,
       l.capturada_en,
       l.cerrada_en,
       l.nota,
       coalesce(r.renglones, 0) as renglones,
       coalesce(r.surtidos, 0) as surtidos,
       coalesce(r.sin_existencia, 0) as sin_existencia
  from listas_trabajo l
  left join clientes c
    on c.id = l.cliente_id
   and c.organizacion_id = l.organizacion_id
  left join lateral (
    select count(*) as renglones,
           count(*) filter (
             where ll.cantidad is not null and ll.surtida >= ll.cantidad
           ) as surtidos,
           count(*) filter (where ll.sin_existencia) as sin_existencia
      from lineas_lista_trabajo ll
     where ll.lista_id = l.id
       and ll.organizacion_id = l.organizacion_id
  ) r on true;

comment on view listas_de_trabajo is
  'F-153 · Las listas de trabajo con sus renglones contados. `surtidos` exige surtida >= cantidad: media varilla entregada no es un renglón surtido.';

-- `security_invoker`: la vista consulta CON los permisos de quien la llama, así
-- que la RLS de `listas_trabajo` sigue mandando. Sin esto la vista sería un
-- agujero por el que se leen listas de otra organización.
alter view listas_de_trabajo set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on listas_de_trabajo from %s', roles_publicos);
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on listas_de_trabajo to morphiqpos_app;
  end if;
end;
$$;

-- ── La comprobación de la propia migración ─────────────────────────────────
-- Que RESPONDA. Una vista que no compila se nota aquí y no la semana que viene,
-- cuando alguien abra la pantalla del mostrador.
do $$
declare
  cuantas int;
begin
  select count(*) into cuantas from listas_de_trabajo;
end;
$$;
