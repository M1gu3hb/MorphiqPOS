-- 113 · Material continuo: lo que se vende cortado (F-150, F-063, F-064).
--
-- ── El descuadre 3 del giro ───────────────────────────────────────────────
-- Se cortan 60 m de un rollo de 100. Entre lo que se lleva la segueta, lo que
-- se mide de más «para que no le falte» y el pedazo que queda torcido, salen
-- 61.2 m y se cobran 60. Nadie lo nota: son 1.2 m. Pero pasa ocho veces al día
-- en cable, manguera, cadena y alambre, y a fin de mes son decenas de metros
-- que el sistema cree que están y no están. Cuando llega el conteo, la
-- diferencia aparece completa y de golpe, y no hay forma de explicarla.
--
-- ── Por qué esto es propio de este giro ──────────────────────────────────
-- `abarrotes` no corta nada: pesar 800 g de frijol no destruye frijol. Aquí el
-- acto de vender CONSUME MATERIAL ADICIONAL al vendido, y si eso no se modela,
-- el inventario de todo el material lineal es ficción desde el primer mes.
--
-- ── `piezas_abiertas` NO es el inventario ────────────────────────────────
-- El inventario sigue siendo `movimientos_stock` en unidad base, sin excepción.
-- La pieza abierta es una DESCOMPOSICIÓN INFORMATIVA de una parte de esa
-- existencia: dice cómo está repartido lo que ya está contado. La suma de los
-- restantes debe ser MENOR O IGUAL a la existencia, y no está obligada a ser
-- igual: los rollos cerrados son el resto. Obligarlo a cuadrar convertiría cada
-- venta en una asignación de pieza, y eso es trazabilidad completa — que es V4
-- y es de farmacia.
--
-- ── Sólo se modela el ABIERTO ────────────────────────────────────────────
-- Los rollos cerrados son intercambiables y no necesitan identidad. Llevar
-- identidad de las 400 piezas continuas del catálogo sería un sistema de
-- trazabilidad que nadie va a alimentar. Se etiqueta AL ABRIRLO, que es un acto
-- que ya ocurre: el mostradorista ya le pone una cinta con el sobrante escrito
-- a mano. El sistema sólo le da folio y memoria.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

create table piezas_abiertas (
  id                     uuid        primary key default gen_random_uuid(),
  organizacion_id        uuid        not null references organizaciones (id) on delete cascade,
  producto_id            uuid        not null references productos (id) on delete restrict,
  almacen_id             uuid        not null references almacenes (id) on delete restrict,

  -- Corto y legible: `R-114`. Se escribe en la etiqueta física, y por eso NO es
  -- el uuid: nadie copia un uuid a mano en una cinta.
  folio                  text        not null,
  -- En unidad base. Mayor que cero SIEMPRE: una pieza sin material no está
  -- abierta, está cerrada, y ése es otro estado.
  medida_restante_base   bigint      not null check (medida_restante_base > 0),
  estado                 text        not null default 'abierta',
  -- Sólo cuando es retazo. Un precio de remate en una pieza abierta haría que
  -- el rollo entero se vendiera barato.
  precio_remate_centavos bigint      check (precio_remate_centavos is null or precio_remate_centavos >= 0),

  ubicacion_id           uuid        references ubicaciones (id) on delete set null,
  abierta_en             timestamptz not null default now(),
  cerrada_en             timestamptz,
  movimiento_cierre_id   uuid        references movimientos_stock (id),

  constraint pieza_estado_valido check (estado in ('abierta', 'retazo', 'cerrada')),
  constraint pieza_remate_solo_en_retazo check (
    precio_remate_centavos is null or estado = 'retazo'
  ),
  constraint pieza_cerrada_con_fecha check (estado <> 'cerrada' or cerrada_en is not null),

  unique (organizacion_id, folio)
);

comment on table piezas_abiertas is
  'F-145 · El rollo abierto. NO es el inventario: es una descomposición informativa de parte de la existencia. La suma de restantes es ≤ la existencia, y no está obligada a ser igual.';
comment on column piezas_abiertas.folio is
  'Corto y legible: R-114. Se escribe en la etiqueta física, y por eso no es el uuid: nadie copia un uuid a mano en una cinta.';

-- Lo que el mostrador consulta antes de cortar: qué piezas de este producto
-- tienen material. `medida_restante_base` en el índice para que la elección de
-- «la más chica que alcance» no recorra todas.
create index piezas_abiertas_vivas
  on piezas_abiertas (organizacion_id, producto_id, medida_restante_base)
  where estado <> 'cerrada';

-- Las piezas viejas: rollos abiertos hace meses que nadie cierra. Es la alerta
-- que evita que se acumulen tres retazos del mismo cable.
create index piezas_abiertas_por_antiguedad
  on piezas_abiertas (organizacion_id, abierta_en) where estado <> 'cerrada';

create table cortes_material (
  id                     uuid        primary key default gen_random_uuid(),
  organizacion_id        uuid        not null references organizaciones (id) on delete cascade,
  -- Un corte pertenece a UNA partida de la venta. Sin la partida, el corte es
  -- material que salió sin que nadie lo cobrara.
  orden_linea_id         uuid        not null references orden_lineas (id) on delete cascade,
  producto_id            uuid        not null references productos (id) on delete restrict,
  pieza_abierta_id       uuid        references piezas_abiertas (id),

  medida_entregada_base  bigint      not null check (medida_entregada_base > 0),
  merma_base             bigint      not null default 0 check (merma_base >= 0),

  movimiento_venta_id    uuid        not null references movimientos_stock (id),
  movimiento_merma_id    uuid        references movimientos_stock (id),
  pieza_resultante_id    uuid        references piezas_abiertas (id),

  empleado_id            uuid        references empleos (id) on delete set null,
  created_at             timestamptz not null default now(),

  -- Si se declaró merma, tiene que existir su movimiento. Van juntas o no van:
  -- una merma declarada sin movimiento es material que el sistema cree que
  -- sigue en el rollo.
  constraint corte_merma_con_movimiento check (
    merma_base = 0 or movimiento_merma_id is not null
  ),

  -- Un corte por partida. Dos cortes sobre la misma línea son dos descuentos de
  -- stock por una sola venta.
  unique (orden_linea_id)
);

comment on constraint corte_merma_con_movimiento on cortes_material is
  'Si se declaró merma tiene que existir su movimiento. Van juntas o no van: una merma sin movimiento es material que el sistema cree que sigue en el rollo.';

create index cortes_por_producto
  on cortes_material (organizacion_id, producto_id, created_at desc);

-- ── Lo que `productos` gana para poder cortarse ──────────────────────────
alter table productos add column es_continuo boolean not null default false;
alter table productos add column tipo_corte text
  check (tipo_corte is null or tipo_corte in ('lineal', 'plano', 'tubular'));
-- Lo que la pantalla propone al cortar. Un valor por omisión es lo que hace que
-- la merma se capture: pedirla en blanco con fila en el mostrador es pedir que
-- se teclee cero.
alter table productos add column merma_corte_default_base bigint not null default 0
  check (merma_corte_default_base >= 0);
-- Debajo de esto, el sobrante deja de ser vendible a precio de lista.
alter table productos add column umbral_retazo_base bigint not null default 0
  check (umbral_retazo_base >= 0);

alter table productos add constraint producto_corte_solo_si_continuo check (
  es_continuo or tipo_corte is null
);

-- ── Los tipos de movimiento que este giro añade ──────────────────────────
--
-- Se reescribe el `check` entero, que es la única forma de ampliarlo en
-- Postgres. `consumo_servicio` entra aquí porque F-258 lo necesita en la misma
-- migración que lo hace posible.
alter table movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_tipo_check check (
    tipo in ('entrada_compra', 'salida_venta', 'ajuste', 'merma', 'devolucion',
             'cancelacion', 'traspaso_entrada', 'traspaso_salida',
             'inventario_inicial', 'produccion', 'salida_consumo_interno',
             'devolucion_proveedor', 'garantia_proveedor', 'garantia_retorno',
             'renta_salida', 'renta_retorno', 'consumo_servicio')
  );

alter table movimientos_stock drop constraint movimiento_stock_signo_coherente;
alter table movimientos_stock
  add constraint movimiento_stock_signo_coherente check (
    case
      when tipo in ('entrada_compra', 'devolucion', 'cancelacion',
                    'traspaso_entrada', 'inventario_inicial', 'produccion',
                    'garantia_retorno', 'renta_retorno')
        then cantidad > 0
      when tipo in ('salida_venta', 'merma', 'traspaso_salida',
                    'salida_consumo_interno', 'devolucion_proveedor',
                    'garantia_proveedor', 'renta_salida', 'consumo_servicio')
        then cantidad < 0
      else true
    end
  );

alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in ('orden', 'compra', 'conteo', 'manual', 'consumo_interno',
                        'anulacion', 'redondeo', 'corte', 'servicio', 'garantia', 'renta')
  );

-- `corte` y `retazo` como motivos de merma. La 062 los declaró como tabla
-- precisamente para que cada giro siembre los suyos.
insert into motivos_merma (clave, etiqueta, giro, imputable)
values
  -- Ninguno de los dos es imputable: cortar destruye material y el retazo es
  -- geometría, no descuido. Marcarlos imputables llenaría el reporte de robo
  -- con la operación normal del giro, y ahí el reporte deja de servir.
  ('corte',  'Merma de corte de material', 'ferreteria', false),
  ('retazo', 'Retazo invendible',          'ferreteria', false)
on conflict do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  foreach t in array array['piezas_abiertas', 'cortes_material']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force  row level security', t);

    if roles_publicos is not null then
      execute format('revoke all privileges on table %I from %s', t, roles_publicos);
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
      execute format('grant select, insert, update on table %I to morphiqpos_app', t);
    end if;
  end loop;
end;
$$;
