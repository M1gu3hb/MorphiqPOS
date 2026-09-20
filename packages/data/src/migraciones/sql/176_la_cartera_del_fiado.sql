-- 176 · La nota del cliente en la cartera, para que el FIADO de una tiendita
--       pueda leer la misma vista que las CUENTAS de una ferretería.
--
-- ── EL HUECO ────────────────────────────────────────────────────────────────
-- `abarrotes/Fiado.tsx` lee la entidad `CarteraFiado` y **no existía**: la pantalla
-- del fiado de una tiendita —que es de las que más se usan, porque medio barrio
-- debe— enseñaba su título y nada más. Lo encontró el contrato nuevo
-- `lecturas-del-puente`, no un navegador: ninguna prueba mira si la entidad que una
-- pantalla consulta existe.
--
-- ── Por qué la MISMA vista y no una segunda ────────────────────────────────
-- Porque es la misma pregunta con otras palabras: «¿quién me debe, cuánto, desde
-- cuándo y cuándo pagó por última vez?». La ferretería la parte por obra y la
-- tiendita no tiene obras —esas filas salen con `obra_nombre` nula—, y eso es la
-- diferencia entera. Dos vistas darían dos aritméticas del saldo, y la segunda
-- sería la que nadie revisa.
--
-- Lo único que le faltaba es la NOTA del cliente: «paga los viernes», «no fiar
-- más». En una tiendita esa frase es la mitad de la decisión, y vive en
-- `clientes.notas`.

create or replace view cartera_por_obra as
select coalesce(o.id::text, d.cliente_id::text) || ':' || d.cliente_id::text as id,
       d.organizacion_id,
       d.cliente_id,
       c.nombre                                                as cliente_nombre,
       c.telefono,
       o.nombre                                                as obra_nombre,
       sum(d.saldo_centavos)                                   as saldo_centavos,
       max(floor(extract(epoch from (now() - d.emitido_en)) / 86400))::int as dias_mas_viejo,
       max(c.limite_credito_centavos)                          as limite_centavos,
       min(ultimo.dias)                                        as dias_ultimo_pago,
       -- «Paga los viernes», «no fiar más». En una tiendita esa frase es la mitad
       -- de la decisión de seguir fiando.
       max(c.notas)                                            as nota
  from documentos_credito d
  join clientes c on c.id = d.cliente_id and c.organizacion_id = d.organizacion_id
  left join ordenes ord on ord.id = d.origen_id and ord.organizacion_id = d.organizacion_id
  left join obras o on o.id = ord.obra_id and o.organizacion_id = d.organizacion_id
  left join lateral (
    select floor(extract(epoch from (now() - max(p.recibido_en))) / 86400)::int as dias
      from pagos_credito p
     where p.cliente_id = d.cliente_id
       and p.organizacion_id = d.organizacion_id
  ) ultimo on true
 where d.saldo_centavos > 0
 group by o.id, d.organizacion_id, d.cliente_id, c.nombre, c.telefono, o.nombre;

comment on view cartera_por_obra is
  'F-612 · Lo que cada cliente debe POR OBRA, con la antigüedad del saldo más viejo, los días desde su último pago y la nota del cliente. La tiendita lee la misma vista: sus filas salen sin obra, que es la diferencia entera.';

alter view cartera_por_obra set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on cartera_por_obra from %s', roles_publicos);
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on cartera_por_obra to morphiqpos_app;
  end if;
end;
$$;

-- La comprobación: la vista responde y trae la columna nueva.
do $$
declare
  cuantas int;
begin
  select count(nota) into cuantas from cartera_por_obra;
end;
$$;
