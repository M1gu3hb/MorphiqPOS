-- 084 · F-027 y F-030 · Las opciones de la bebida, con su efecto en la receta.
--
-- ── El dolor, en números del propio modelo ────────────────────────────────
-- «El 60 % de las líneas del pico se captura mal o no se captura. La leche de
-- avena nunca baja del inventario. El ticket promedio no crece porque ofrecer
-- opciones cuesta cinco toques.»
--
-- Hoy `modificadores` existe y sólo sabe sumar pesos al precio. Lo que falta es
-- que una opción **cambie la receta**: la avena sustituye a la entera, el 16 oz
-- multiplica todo por 1.44, el shot extra añade una línea. Sin eso, el
-- inventario de leche de un negocio de café es ficción — y la leche es su
-- segundo costo.
--
-- ── Por qué el factor es una columna y no un producto aparte ──────────────
-- Porque «latte 12 oz» y «latte 16 oz» como dos productos distintos obligan a
-- mantener dos recetas, dos precios y dos costos, y a que alguien se acuerde de
-- cambiar los dos. Con un factor, la receta es una y el tamaño la escala.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · La receta declara qué línea puede sustituir una opción ────────────
alter table recetas
  add column sustituible_por_grupo_id uuid references modificadores (id) on delete set null;

comment on column recetas.sustituible_por_grupo_id is
  'F-027 · Declara que un grupo de opciones puede sustituir esta línea. La leche entera del latte la sustituye el grupo «tipo de leche».';

create index recetas_sustituibles
  on recetas (sustituible_por_grupo_id)
  where sustituible_por_grupo_id is not null;

-- ── 2 · La OPCIÓN declara con qué sustituye, y cuánto escala ─────────────
--
-- En `modificador_opciones` y no en `modificadores`: el grupo es «tipo de
-- leche» y la opción es «avena». Lo que sustituye un insumo es la opción, y
-- ponerlo en el grupo obligaría a que todas las leches sustituyeran por la misma.
alter table modificador_opciones
  add column insumo_sustituto_id uuid references insumos (id) on delete set null,
  -- El 16 oz escala la receta entera ×1.44. Cuatro decimales porque la razón de
  -- dos volúmenes casi nunca es redonda, y redondearla a dos mete un error que
  -- se acumula en cada bebida del día.
  add column factor_cantidad numeric(6, 4) not null default 1,
  -- Firmado, a diferencia de `precio_extra_centavos`, que es `>= 0`: una opción
  -- puede ABARATAR —«sin crema», «vaso propio»— y con la columna vieja eso no se
  -- podía expresar. Las dos conviven: la vieja es el extra que ya cobran los
  -- cuatro negocios vivos, ésta es el delta que puede ir en cualquier dirección.
  add column delta_precio_centavos bigint not null default 0;

alter table modificador_opciones
  add constraint modificador_opciones_factor_positivo check (factor_cantidad > 0);

comment on column modificador_opciones.factor_cantidad is
  'Cuánto escala la receta entera esta opción. El 16 oz es 1.44. Cuatro decimales: la razón de dos volúmenes casi nunca es redonda.';
comment on column modificador_opciones.delta_precio_centavos is
  'Lo que suma o RESTA al precio. Firmado, al contrario que precio_extra_centavos: «sin crema» abarata.';
comment on column modificador_opciones.insumo_sustituto_id is
  'Con qué insumo sustituye a la línea de receta que su grupo puede reemplazar. Sin esto, la pantalla ofrece avena y el inventario descuenta leche entera.';

-- ── 3 · La línea de venta congela lo que se eligió ────────────────────────
--
-- Instantánea, no referencia. Si mañana sube el precio de la avena, el ticket de
-- hoy no puede cambiar: es el mismo principio por el que la línea guarda el
-- nombre del producto y no sólo su id.
alter table orden_lineas
  add column opciones jsonb,
  add column combo_id uuid references productos (id) on delete set null,
  add column tipo_linea text not null default 'venta';

alter table orden_lineas
  add constraint orden_lineas_tipo_valido check (tipo_linea in ('venta', 'canje_lealtad'));

comment on column orden_lineas.opciones is
  'F-027 · Instantánea de las opciones elegidas y de su efecto en precio y receta. Congelada: el ticket de hace un año tiene que poder repintarse.';
comment on column orden_lineas.combo_id is
  'F-030 · Qué combo agrupó esta línea. Sin él, un combo es dos líneas y un descuento a mano, y ni el margen del combo ni cuántos se vendieron existen.';
comment on column orden_lineas.tipo_linea is
  'El canje del sexto café sale del stock y NO cuenta como ticket ni entra al ticket promedio.';

create index orden_lineas_por_combo
  on orden_lineas (combo_id)
  where combo_id is not null;

-- ── 4 · El producto dice a qué familia pertenece ─────────────────────────
--
-- `gramaje_shot` estaba declarado AQUÍ y otra vez en la 085, con dos tipos
-- distintos —numeric(6,2) aquí, numeric(14,4) con check allí—. La segunda
-- abortaba con «column "gramaje_shot" of relation "productos" already exists»
-- y se llevaba por delante la tanda entera, que corre en una sola transacción.
--
-- Se queda la de la 085 y no ésta, por dos razones: lleva `check (> 0)` y usa
-- la escala numeric(14,4) que el proyecto fijó para TODA cantidad. Con (6,2),
-- 18.005 g se guardaban como 18.01 y la salida de inventario de una ráfaga de
-- shots se desviaba en la cuarta cifra, que es justo donde se acumula.
alter table productos
  add column familia text not null default 'otro';

alter table productos
  add constraint productos_familia_valida check (
    familia in ('bebida', 'alimento', 'grano', 'otro')
  );

comment on column productos.familia is
  'Ordena el catálogo y decide la tasa por omisión. «grano» es la bolsa que se vende para llevar, que no es lo mismo que el grano que se muele.';

-- ── 5 · Poscondición ─────────────────────────────────────────────────────
--
-- Ningún modificador puede quedar declarando un sustituto que no existe en la
-- organización del producto al que cuelga. El `fk` no lo puede exigir —son dos
-- saltos— y sin esto una opción de un negocio descontaría el insumo de otro.
do $$
declare
  cruzados int;
begin
  select count(*) into cruzados
    from modificador_opciones o
    join modificadores m on m.id = o.modificador_id
    join insumos i on i.id = o.insumo_sustituto_id
   where i.organizacion_id <> m.organizacion_id;

  if cruzados > 0 then
    raise exception 'Hay % opción(es) que sustituyen con un insumo de otra organización', cruzados
      using errcode = 'check_violation';
  end if;
end;
$$;
