-- 171 · `materiales_continuos` y `piezas_de_material`: lo que la pantalla de
--       corte lee.
--
-- ── EL HUECO ────────────────────────────────────────────────────────────────
-- `ferreteria/CorteDeMaterial.tsx` se hidrata de dos entidades del puente,
-- `MaterialContinuo` y `PiezaDeMaterial`, y **ninguna de las dos existía**: el
-- puente contestaba `PUENTE_ENTIDAD_DESCONOCIDA`, la pantalla caía en su estado
-- vacío —«ningún material está marcado como pieza continua»— y la función más
-- propia de una ferretería no tenía por dónde entrar.
--
-- Y el vacío decía la verdad por otra razón: hasta la semilla de hoy, **ningún
-- producto de ninguna organización tenía `es_continuo` encendido**. La columna
-- estaba desde la 113 y nadie la escribía.
--
-- ── LA ESCALA, dicha una vez ───────────────────────────────────────────────
-- La unidad base de un material continuo es su unidad de venta en
-- DIEZMILÉSIMAS: 37.5 m son 375 000. Es la escala de `numeric(14,4)` y la de
-- `Cantidad` en el dominio, o sea la que el sistema usa para toda cantidad de
-- inventario. Las dos vistas sirven el dato YA CONVERTIDO a unidades de venta,
-- porque es lo que una persona lee y teclea: «quedan 37.50 m», no «375000».
--
-- ── POR QUÉ `iguales` ES SIEMPRE 1 ─────────────────────────────────────────
-- La pantalla puede enseñar «hay 3» de un rollo cerrado, y aquí no se puede
-- saber: la 113 decide **a propósito** no darle identidad a los rollos cerrados
-- —«llevar identidad de las 400 piezas continuas del catálogo sería un sistema
-- de trazabilidad que nadie va a alimentar»— así que el sistema no sabe si los
-- 250 m que no están en piezas abiertas son dos rollos de 125 o cinco de 50. Lo
-- que sí es cierto de cada fila de aquí es que es UNA pieza con su etiqueta.
-- Inventar el conteo sería peor que servir el 1 que es verdad.

create view materiales_continuos as
select p.id                                                    as producto_id,
       p.organizacion_id,
       p.nombre,
       p.unidad_venta,
       p.tipo_corte,
       p.precio_venta_centavos,
       p.costo_unitario_centavos,
       -- En unidades de venta: lo que la pantalla propone como desperdicio.
       (p.merma_corte_default_base::numeric / 10000)            as merma_tipica,
       (p.umbral_retazo_base::numeric / 10000)                  as umbral_retazo,
       -- El precio de remate SUGERIDO. Si alguna pieza ya está marcada como
       -- retazo con precio, manda ése —lo puso una persona—; si no, el COSTO:
       -- «que salga sin perder dinero» es una sugerencia que se puede explicar
       -- en una frase, y un porcentaje inventado no.
       coalesce(remate.precio, p.costo_unitario_centavos)       as precio_remate_centavos
  from productos p
  left join lateral (
    select max(pa.precio_remate_centavos) as precio
      from piezas_abiertas pa
     where pa.producto_id = p.id
       and pa.precio_remate_centavos is not null
  ) remate on true
 where p.es_continuo
   and p.activo;

comment on view materiales_continuos is
  'F-145 · El material que se vende cortado, con su merma típica y su umbral de retazo YA en unidades de venta. El precio de remate sugerido sale de una pieza ya marcada, y si no hay ninguna, del costo: que salga sin perder dinero.';

create view piezas_de_material as
select pa.id,
       pa.organizacion_id,
       pa.producto_id,
       pa.folio,
       -- `abierta` es lo contrario de cerrada: un RETAZO sigue estando abierto
       -- —se puede cortar de él, y es lo primero que hay que ofrecer— y tratarlo
       -- como cerrado lo escondería justo cuando conviene gastarlo.
       (pa.estado <> 'cerrada')                                 as abierta,
       (pa.medida_restante_base::numeric / 10000)               as restante,
       pa.estado,
       -- Ver la cabecera: los rollos cerrados no llevan identidad a propósito.
       1                                                        as iguales
  from piezas_abiertas pa
 where pa.estado <> 'cerrada';

comment on view piezas_de_material is
  'F-145 · Los rollos abiertos con su etiqueta y su restante en unidades de venta. Un retazo cuenta como abierto: se puede cortar de él y conviene gastarlo antes que abrir otro.';

alter view materiales_continuos set (security_invoker = on);
alter view piezas_de_material  set (security_invoker = on);

do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  if roles_publicos is not null then
    execute format('revoke all privileges on materiales_continuos from %s', roles_publicos);
    execute format('revoke all privileges on piezas_de_material from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    grant select on materiales_continuos to morphiqpos_app;
    grant select on piezas_de_material to morphiqpos_app;
  end if;
end;
$$;

-- La comprobación de la propia migración: la conversión de escala. Si alguien
-- cambia el divisor, un rollo de 37.5 m pasa a medir 375 000 y la pantalla
-- ofrecería cortar de un rollo que no existe.
do $$
declare
  desviadas int;
begin
  select count(*)
    into desviadas
    from piezas_de_material v
    join piezas_abiertas pa on pa.id = v.id
   where v.restante <> pa.medida_restante_base::numeric / 10000;

  if desviadas > 0 then
    raise exception 'piezas_de_material sirve % restantes que no son su medida base', desviadas;
  end if;
end;
$$;
