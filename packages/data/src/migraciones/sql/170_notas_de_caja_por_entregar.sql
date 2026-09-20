-- 170 · `notas_de_caja`: la segunda lista se llama por lo que FALTA, no por lo
--       que entró.
--
-- La 169 calculó el estado de la caja mirando sólo el dinero: una nota pagada
-- pasaba a `pagada_sin_entregar` y todo lo demás quedaba `por_cobrar`. Eso deja
-- fuera el caso más común de una ferretería: **la venta a crédito no se cobra**.
-- El cliente firma la remisión, se lleva el material y no toca dinero — y con la
-- 169 esa nota se quedaba en «por cobrar» para siempre, ofreciéndose al cajero
-- como pendiente una y otra vez.
--
-- La pregunta de la segunda lista de la caja no es «¿ya pagaron?»: es **«¿esto
-- ya salió?»**, porque lo que evita es entregar dos veces el mismo material. Una
-- nota pagada en efectivo y una nota firmada a crédito están en el mismo sitio:
-- cerradas para la caja, con el material todavía en el patio. Así que el estado
-- se llama `por_entregar` y lo alcanzan las dos.
--
-- El resto de la vista no cambia. Se reemplaza entera porque `create or replace
-- view` no admite quitar ni renombrar columnas, y aquí no se quita ninguna: sólo
-- cambia lo que decide el `case`.

create or replace view notas_de_caja as
select n.orden_id                                          as id,
       n.id                                                as nota_id,
       n.organizacion_id,
       n.sucursal_id,
       n.folio                                             as codigo_caja,
       case
         when o.estado in ('cancelada', 'absorbida')  then 'cancelada'
         -- Cerrada para la caja, por dinero o por firma. Las dos cosas dejan el
         -- material esperando en el patio, y es ahí donde se entrega dos veces.
         when o.estado in ('pagada', 'parcialmente_pagada') then 'por_entregar'
         when exists (
           select 1 from remisiones r where r.orden_id = n.orden_id
         )                                            then 'por_entregar'
         when n.estado = 'apartada'                   then 'apartada'
         else 'por_cobrar'
       end                                                 as estado,
       coalesce(c.nombre, n.nombre_libre, o.cliente_nombre) as cliente_nombre,
       n.cliente_id,
       ob.nombre                                           as obra,
       a.nombre                                            as recoge_nombre,
       coalesce(a.activo, false)                           as recoge_autorizado,
       quien.nombre                                        as atendio,
       n.armada_en                                         as creada,
       n.aparta_hasta                                      as vence,
       o.total_centavos,
       coalesce(c.saldo_pendiente_centavos, 0)             as saldo_cliente_centavos,
       coalesce(c.limite_credito_centavos, 0)              as limite_cliente_centavos
  from notas_mostrador n
  join ordenes o           on o.id = n.orden_id
  left join clientes c     on c.id = n.cliente_id
  left join obras ob       on ob.id = o.obra_id
  left join autorizados_cuenta a on a.id = o.autorizado_id
  left join lateral (
    select p.nombre
      from empleos e
      join personas p on p.id = e.persona_id
     where e.id = n.mostradorista_id
  ) quien on true
 where n.entregada_en is null
   and n.estado <> 'cancelada';

comment on view notas_de_caja is
  'F-140 · La caja de una ferretería: las notas vivas con su folio, quién las armó, a quién se le entregan y qué falta. `por_cobrar` es lo que espera dinero; `por_entregar` es lo que ya está cerrado para la caja —pagado o firmado a crédito— y sigue en el patio.';

-- `create or replace` conserva permisos y opciones, pero declararlos otra vez
-- cuesta nada y evita que un reemplazo futuro los pierda en silencio.
alter view notas_de_caja set (security_invoker = on);

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on notas_de_caja to morphiqpos_app;
  end if;
end;
$$;

-- Lo que esta migración arregla, comprobado: ninguna nota con remisión puede
-- seguir ofreciéndose como pendiente de cobro.
do $$
declare
  fiadas_pendientes int;
begin
  select count(*)
    into fiadas_pendientes
    from notas_de_caja v
   where v.estado = 'por_cobrar'
     and exists (select 1 from remisiones r where r.orden_id = v.id);

  if fiadas_pendientes > 0 then
    raise exception 'notas_de_caja ofrece % notas fiadas como pendientes de cobro',
      fiadas_pendientes;
  end if;
end;
$$;
