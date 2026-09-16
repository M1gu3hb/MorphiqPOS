-- 145 · Las seis vistas del salón.
--
-- ── Por qué vistas y no consultas en el código ───────────────────────────
-- Porque las seis se hacen desde más de un sitio —la agenda, el corte, el
-- reporte y la pantalla de la profesional— y la que más duele es la de huecos,
-- que se calcula en cada tecleo del buscador de agenda. Tener la definición en
-- un solo lugar es lo que evita que dos pantallas contesten distinto a la misma
-- pregunta, que es como se pierde la confianza en un reporte.
--
-- ── Ninguna es materializada, y eso es deliberado ────────────────────────
-- El plan proponía materializar `hueco_disponible`. No se hace: una vista
-- materializada de huecos tiene que refrescarse en cada escritura de
-- `cita_servicios` y `bloqueos_agenda` —decenas por hora— y una agenda que
-- enseña un hueco que ya se llenó hace treinta segundos es peor que una lenta.
-- Si la medición dice que hace falta, se materializa entonces y con datos, no
-- ahora y por si acaso.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · Lo OCUPADO, que es de donde se deduce lo libre ───────────────────
--
-- No hay vista de «hueco» porque un hueco no es una fila: es la resta entre el
-- horario y esto. Lo que la base puede dar barato es lo ocupado con su rango, y
-- la resta la hace quien pregunta, que es el único que sabe cuánto dura el
-- servicio que quiere meter.
create view ocupacion_agenda as
select cs.organizacion_id,
       cs.profesional_id,
       cs.rango_ocupacion as rango,
       'cita'::text       as motivo,
       cs.id              as origen_id
  from cita_servicios cs
 where cs.estado <> 'cancelado'
union all
select b.organizacion_id,
       b.profesional_id,
       b.rango,
       b.motivo,
       b.id
  from bloqueos_agenda b
 where b.profesional_id is not null;

comment on view ocupacion_agenda is
  'Lo OCUPADO de la agenda, citas y bloqueos en la misma forma. El hueco no es una fila: es la resta entre el horario del profesional y esto, y la hace quien pregunta porque es el único que sabe cuánto dura lo que quiere meter.';

-- ── 2 · La ocupación por profesional y día ───────────────────────────────
create view ocupacion_profesional as
select cs.organizacion_id,
       cs.profesional_id,
       date_trunc('day', lower(cs.rango_ocupacion))                       as dia,
       count(*)                                                           as servicios,
       sum(extract(epoch from (upper(cs.rango_ocupacion) - lower(cs.rango_ocupacion))) / 60)::int
                                                                          as minutos_ocupados,
       sum(cs.precio_centavos)                                            as valor_centavos
  from cita_servicios cs
 where cs.estado not in ('cancelado')
 group by cs.organizacion_id, cs.profesional_id, date_trunc('day', lower(cs.rango_ocupacion));

comment on view ocupacion_profesional is
  'El numerador de la ocupación. El denominador son los minutos de horario, que viven en horarios_profesional: dividirlos aquí obligaría a repetir la vigencia del horario dentro de la vista.';

-- ── 3 · El saldo de propina, que es dinero AJENO ─────────────────────────
--
-- Una suma y no una resta entre dos tablas: la 139 guarda el monto firmado
-- justamente para que este número no pueda desincronizarse.
create view saldo_propina as
select mp.organizacion_id,
       mp.profesional_id,
       sum(mp.monto_centavos)                                      as saldo_centavos,
       sum(mp.monto_centavos) filter (where mp.medio = 'efectivo') as saldo_efectivo_centavos,
       max(mp.created_at)                                          as ultimo_movimiento
  from movimientos_propina mp
 group by mp.organizacion_id, mp.profesional_id;

comment on view saldo_propina is
  'Cuánto dinero ajeno hay dentro del cajón ahora mismo, por persona. Es una SUMA sobre una sola tabla: dos tablas que se restan es como se le paga dos veces a alguien.';

-- ── 4 · El margen de un servicio ─────────────────────────────────────────
--
-- Precio menos material menos comisión. Es el número que hoy no existe y el que
-- contesta si un tinte deja dinero: el servicio que más se vende puede ser el
-- que menos margen deja, y hoy nadie lo sabe.
create view margen_servicio as
select ol.organizacion_id,
       ol.producto_id                                as servicio_id,
       ol.profesional_id,
       count(*)                                      as veces,
       sum(ol.total_centavos)                        as ingreso_centavos,
       sum(ol.material_centavos)                     as material_centavos,
       coalesce(sum(cc.monto_centavos), 0)           as comision_centavos,
       sum(ol.total_centavos)
         - sum(ol.material_centavos)
         - coalesce(sum(cc.monto_centavos), 0)       as margen_centavos
  from orden_lineas ol
  left join comisiones_causadas cc on cc.orden_linea_id = ol.id
 where ol.profesional_id is not null
 group by ol.organizacion_id, ol.producto_id, ol.profesional_id;

comment on view margen_servicio is
  'Precio menos material menos comisión. El servicio que más se vende puede ser el que menos margen deja, y hoy eso no se sabe en ningún salón.';

-- ── 5 · El producto de cabina, con sus dos existencias ───────────────────
create view producto_cabina as
select p.organizacion_id,
       p.id                                   as producto_id,
       p.nombre,
       p.destino,
       p.factor_apertura,
       p.unidad_cabina,
       sum(e.cantidad) filter (where a.tipo = 'venta')  as existencia_venta,
       sum(e.cantidad) filter (where a.tipo = 'cabina') as existencia_cabina
  from productos p
  -- El puente producto→insumo es `productos.insumo_base_id`, de la 040. No hay
  -- tabla intermedia: un producto de cabina tiene UN insumo base, porque lo que
  -- se gasta al abrirlo es una sola cosa.
  join existencias e on e.insumo_id = p.insumo_base_id
  join almacenes a   on a.id = e.almacen_id
 where p.destino <> 'venta'
   and p.insumo_base_id is not null
 group by p.organizacion_id, p.id, p.nombre, p.destino, p.factor_apertura, p.unidad_cabina;

comment on view producto_cabina is
  'F-155 · El mismo SKU con sus dos existencias y sus dos unidades. Sin esta vista hay que elegir entre saber qué hay en el anaquel y saber cuánto se gasta en cabina.';

-- ── 6 · A quién le toca volver ───────────────────────────────────────────
--
-- F-951. La frecuencia sale del expediente y la última visita, de las citas. El
-- filtro de consentimiento va DENTRO de la vista a propósito: si se dejara para
-- el código, el primer sitio que olvide ponerlo manda un recordatorio a quien
-- no lo pidió.
create view clientes_por_volver as
select c.organizacion_id,
       c.id                                            as cliente_id,
       c.nombre,
       c.whatsapp,
       eb.frecuencia_dias,
       max(ci.agendada_para)                           as ultima_visita,
       max(ci.agendada_para) + (eb.frecuencia_dias * interval '1 day') as toca_volver_en
  from clientes c
  join expedientes_belleza eb on eb.cliente_id = c.id
  left join citas ci          on ci.cliente_id = c.id and ci.estado = 'cobrada'
 where c.acepta_recordatorios
   and eb.frecuencia_dias is not null
 group by c.organizacion_id, c.id, c.nombre, c.whatsapp, eb.frecuencia_dias;

comment on view clientes_por_volver is
  'F-951 · El filtro de `acepta_recordatorios` va DENTRO de la vista: si se dejara para el código, el primer sitio que lo olvide manda un mensaje a quien no lo pidió.';
