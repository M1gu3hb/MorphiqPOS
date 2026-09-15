-- 097 · El redondeo de cambio y su registro (F-257).
--
-- ── «No tengo cambio, ¿le doy un chicle?» ─────────────────────────────────
-- Es una operación real, diaria, y hoy no existe en ningún sitio: el chicle
-- sale del anaquel sin registro y el cajón descuadra por pesos sueltos que a
-- fin de mes son cientos. Es exactamente el tipo de cosa que hace que el arqueo
-- no cuadre NUNCA por poquito, que es peor que no cuadrar por mucho: un
-- descuadre grande se busca, uno chico se asume, y en cuanto se asume el arqueo
-- deja de servir para detectar el robo, que es para lo que existe.
--
-- ── Por qué lleva movimiento de caja, aunque `05` no lo pedía ─────────────
-- `05-DATOS-Y-BACKEND.md` §1.9 declara la tabla sin `movimiento_caja_id`. Sin
-- esa fila gemela el arqueo sigue descuadrando por los mismos veinte centavos:
-- la orden dice que se cobraron $47.30 y en el cajón hay $47.50. El redondeo ES
-- la explicación de esa diferencia, y una explicación que el corte no puede leer
-- no explica nada. Se corrige aquí y se anota en la bitácora.
--
-- ── Por qué un tope duro ─────────────────────────────────────────────────
-- Un redondeo de $50 no es un redondeo: es un descuento sin autorizar con otro
-- nombre. El tope vive en la base porque es donde no se puede olvidar, y porque
-- la alternativa —confiar en que la pantalla no mande más— es la misma puerta
-- que F-205 cierra para los descuentos.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── Un defecto que esta migración cierra ─────────────────────────────────
--
-- `movimientos_caja.referencia_tipo` sigue con el `check` de la 003:
-- `('orden', 'gasto', 'manual')`. Los comandos de F-254/F-255/F-256 escriben su
-- fila gemela con `referencia_tipo = 'pasivo'`, y contra una base con la 003
-- aplicada ESO REVIENTA. No se vio antes porque en la Fase 2 las migraciones no
-- se aplican y las pruebas corren contra la base falsa, que no lleva `check`.
-- Es justo el hueco que el propio `contratos-por-mutacion` advierte: «¿qué
-- camino de ejecución NO recorre ninguna de mis puertas?».
alter table movimientos_caja drop constraint movimientos_caja_referencia_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_referencia_tipo_check check (
    referencia_tipo in ('orden', 'gasto', 'manual', 'pasivo', 'redondeo')
  );

-- ── Y un segundo defecto, del mismo tipo ─────────────────────────────────
--
-- `packages/domain/src/inventario/consumo.ts` planea movimientos con
-- `tipo = 'salida_consumo_interno'` desde F-261, y NINGUNA migración lo añadió
-- al `check` de la 003. Contra una base real, la primera cortesía revienta. Se
-- cierra aquí junto con el tipo que el redondeo en especie necesita, y el signo
-- se declara a la vez: lo que sale del almacén sale en negativo, siempre.
alter table movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_tipo_check check (
    tipo in ('entrada_compra', 'salida_venta', 'ajuste', 'merma', 'devolucion',
             'cancelacion', 'traspaso_entrada', 'traspaso_salida',
             'inventario_inicial', 'produccion', 'salida_consumo_interno',
             'devolucion_proveedor')
  );

alter table movimientos_stock drop constraint movimiento_stock_signo_coherente;
alter table movimientos_stock
  add constraint movimiento_stock_signo_coherente check (
    case
      when tipo in ('entrada_compra', 'devolucion', 'cancelacion',
                    'traspaso_entrada', 'inventario_inicial', 'produccion')
        then cantidad > 0
      when tipo in ('salida_venta', 'merma', 'traspaso_salida',
                    'salida_consumo_interno', 'devolucion_proveedor')
        then cantidad < 0
      else true
    end
  );

alter table movimientos_stock drop constraint movimientos_stock_referencia_tipo_check;
alter table movimientos_stock
  add constraint movimientos_stock_referencia_tipo_check check (
    referencia_tipo in ('orden', 'compra', 'conteo', 'manual', 'consumo_interno',
                        'anulacion', 'redondeo')
  );

create table redondeos (
  id                    uuid        primary key default gen_random_uuid(),
  organizacion_id       uuid        not null references organizaciones (id) on delete cascade,
  orden_id              uuid        not null references ordenes (id) on delete cascade,

  -- `a_favor`: el cajón se queda los centavos. `en_contra`: se entrega de más.
  -- `especie`: se dio producto en vez de monedas.
  tipo                  text        not null,
  -- Con signo: positivo es a favor del negocio, negativo en contra. Guardarlo
  -- sin signo obligaría a leer el tipo para saber hacia dónde suma, y el día
  -- que alguien sume la columna sin mirar el tipo el corte miente.
  importe_centavos      bigint      not null,

  producto_especie_id   uuid        references productos (id),
  movimiento_stock_id   uuid        references movimientos_stock (id),
  movimiento_caja_id    uuid        references movimientos_caja (id),

  sesion_caja_id        uuid        not null references sesiones_caja (id),
  empleado_id           uuid        references empleos (id) on delete set null,
  created_at            timestamptz not null default now(),

  constraint redondeo_tipo_valido check (tipo in ('a_favor', 'en_contra', 'especie')),

  -- Un peso. Por encima de eso no es redondeo.
  constraint redondeo_dentro_del_tope check (abs(importe_centavos) between 1 and 100),

  -- El signo tiene que decir lo mismo que el tipo. Un `a_favor` negativo haría
  -- que el corte restara lo que el cajón tiene de más.
  constraint redondeo_signo_coherente check (
    case
      when tipo = 'en_contra' then importe_centavos < 0
      else importe_centavos > 0
    end
  ),

  -- Un redondeo en especie sin producto es un redondeo que se disfraza de
  -- chicle: el cajón cuadra y el anaquel no.
  constraint redondeo_especie_con_producto check (
    tipo <> 'especie' or producto_especie_id is not null
  )
);

comment on table redondeos is
  'F-257 · «No tengo cambio, ¿le doy un chicle?». Sin esta tabla el chicle sale sin registro y el cajón descuadra por pesos sueltos que a fin de mes son cientos.';
comment on column redondeos.importe_centavos is
  'Con signo: positivo a favor del negocio, negativo en contra. Sin signo habría que leer el tipo para saber hacia dónde suma.';

-- UNO por orden. Dos redondeos sobre el mismo ticket son la forma corta de
-- convertir el redondeo en un descuento repetible de un peso en un peso.
create unique index redondeos_uno_por_orden on redondeos (orden_id);

create index redondeos_por_turno on redondeos (organizacion_id, sesion_caja_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
do $$
declare
  roles_publicos text;
begin
  select string_agg(quote_ident(rolname), ', ' order by rolname)
    into roles_publicos
    from pg_catalog.pg_roles
   where rolname in ('anon', 'authenticated');

  alter table redondeos enable row level security;
  alter table redondeos force  row level security;

  if roles_publicos is not null then
    execute format('revoke all privileges on table redondeos from %s', roles_publicos);
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'morphiqpos_app') then
    -- `update` porque la fila se liga a su gemelo de caja justo después de
    -- escribirla: el id del movimiento no existe hasta que el movimiento existe.
    grant select, insert, update on table redondeos to morphiqpos_app;
  end if;
end;
$$;
