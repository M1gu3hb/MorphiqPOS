-- 169 · `notas_de_caja`: lo que el cajero de una ferretería tiene delante.
--
-- ── EL HUECO ────────────────────────────────────────────────────────────────
-- `ferreteria/Caja.tsx` se hidrataba de la entidad `Venta` del puente y filtraba
-- por `estado = 'pendiente_cobro'`. Ese estado **no existe en el `check` de
-- `ordenes.estado`**, así que su lista de notas pendientes no podía tener una
-- fila nunca: la caja de una ferretería enseñaba «La caja está al día» con el
-- mostrador lleno de notas. Y los otros once campos que la pantalla lee
-- —`codigo_caja`, `cliente_nombre`, `atendio`, `vence`, `saldo_cliente`…—
-- tampoco estaban en `Venta`, así que cada renglón habría salido «—».
--
-- ── POR QUÉ UNA VISTA Y NO MÁS CAMPOS EN `Venta` ───────────────────────────
-- Porque lo que la caja lista no son órdenes: son NOTAS DE MOSTRADOR (F-140),
-- que son el envoltorio de una orden y tienen su propio folio, su propio estado
-- —`armando`, `apartada`, `por_cobrar`, `entregada`— y su propia caducidad. Una
-- orden pagada cuyo material sigue en el patio no se distingue mirando
-- `ordenes`: hace falta `notas_mostrador.entregada_en`, y eso es justo el
-- descuadre que hace que alguien entregue dos veces el mismo material.
--
-- Y porque los cinco `left join` que la pantalla necesita —cliente, obra,
-- autorizado, mostradorista, persona— no caben en los `derivados` del puente,
-- que hacen un join de una sola tabla por campo.
--
-- ── EL ESTADO ES DE LA CAJA, NO DE LA TABLA ────────────────────────────────
-- Se calcula aquí, en un sitio, a partir de los dos estados reales: el de la
-- orden dice si ya entró el dinero, el de la nota dice si el material ya salió.
-- Calcularlo en la pantalla dejaría a la caja del teléfono y a la del mostrador
-- discrepando el día que una de las dos se edite.
--
-- ── SÓLO LO VIVO ───────────────────────────────────────────────────────────
-- Lo entregado y lo cancelado es historia y no vuelve a esta pantalla. Si
-- estuvieran, la caja de un negocio con seis meses de notas pediría ochenta
-- filas y recibiría ochenta notas entregadas en marzo, sin una sola por cobrar.

create view notas_de_caja as
select n.orden_id                                          as id,
       n.id                                                as nota_id,
       n.organizacion_id,
       n.sucursal_id,
       n.folio                                             as codigo_caja,
       -- El estado de la CAJA: dinero y material son dos preguntas distintas.
       case
         when o.estado in ('cancelada', 'absorbida')  then 'cancelada'
         when o.estado in ('pagada', 'parcialmente_pagada') then 'pagada_sin_entregar'
         when n.estado = 'apartada'                   then 'apartada'
         else 'por_cobrar'
       end                                                 as estado,
       -- Con ficha manda la ficha; sin ficha, el nombre escrito a mano.
       coalesce(c.nombre, n.nombre_libre, o.cliente_nombre) as cliente_nombre,
       n.cliente_id,
       ob.nombre                                           as obra,
       -- F-638 · Quién viene a recoger, y si estaba en la lista. Las dos cosas:
       -- un nombre sin el sello no dice si se le puede entregar.
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
  -- El mostradorista es un EMPLEO; su nombre está en la persona detrás.
  left join lateral (
    select p.nombre
      from empleos e
      join personas p on p.id = e.persona_id
     where e.id = n.mostradorista_id
  ) quien on true
 where n.entregada_en is null
   and n.estado <> 'cancelada';

comment on view notas_de_caja is
  'F-140 · La caja de una ferretería: las notas vivas con su folio, quién las armó, a quién se le entregan y qué falta —cobrarlas o entregarlas—. El estado se calcula de los dos reales: el de la orden dice si entró el dinero, el de la nota si salió el material.';

-- Sin `security_invoker` la vista correría con los permisos de quien la creó y
-- sería una puerta trasera a las notas, los saldos y los límites de crédito de
-- las nueve organizaciones.
alter view notas_de_caja set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on notas_de_caja from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on notas_de_caja to morphiqpos_app;
  end if;
end;
$$;

-- La comprobación de la propia migración: una nota, una fila. Si alguno de los
-- cinco `left join` multiplicara —dos autorizados con el mismo id, dos empleos
-- por persona—, la caja enseñaría la misma nota dos veces y el cajero la
-- cobraría dos veces. Eso se dice aquí, no en el mostrador.
do $$
declare
  cuantas int;
  distintas int;
begin
  select count(*), count(distinct nota_id) into cuantas, distintas from notas_de_caja;

  if cuantas <> distintas then
    raise exception 'notas_de_caja duplica notas: % filas para % notas', cuantas, distintas;
  end if;
end;
$$;
