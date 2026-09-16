-- 094 · El fiado de la tiendita (F-610 a F-617, versión abarrotes).
--
-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ AQUÍ NO SE CREA `abonos_fiado`, Y ÉSA ES LA DECISIÓN DE LA MIGRACIÓN. ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- El plan de esta carpeta pedía una tabla `abonos_fiado` con su trigger de
-- saldo. No se escribe, porque el fiado YA ESTÁ IMPLEMENTADO y probado sobre
-- `pasivos_terceros` (migración 063, F-254): el comando `fiado.registrar_abono`
-- escribe ahí, con `naturaleza = 'credito_cliente'`, monto firmado y el
-- movimiento de caja gemelo atado.
--
-- Crear la tabla del plan dejaría DOS sitios donde vive la misma deuda. Y dos
-- sitios no es redundancia: es que el mostrador consulta uno, la cobranza el
-- otro, y a los dos meses nadie sabe cuál de los dos números es el bueno. Ésa es
-- la señal 4 de desviación arquitectónica de `04-ARQUITECTURA §9`, y es
-- exactamente el defecto que este proyecto ya arrastró en otros dos bloques.
--
-- Queda escrito aquí y no en un comentario de código para que dentro de un año
-- nadie vuelva a abrir el plan, vea `abonos_fiado` en la lista, y la cree.
--
-- ── Lo que SÍ falta, y es lo que hace esta migración ─────────────────────
-- Tres datos que `pasivos_terceros` no puede tener porque no son del
-- movimiento, son del cliente y de la venta:
--
--   1 · Qué día pasa a pagar. Es lo único que convierte «me debe $340» en «me
--       debe $340 y pasa los viernes». Sin él, la cobranza de una tiendita es
--       acordarse, y acordarse no escala más allá de doce personas.
--   2 · Que la venta salió FIADA. El ingreso se reconoce igual —la mercancía ya
--       salió— pero el efectivo no entró, y el arqueo tiene que poder
--       separarlos o el corte del día dice que falta dinero.
--   3 · Cuándo se terminó de pagar. Es lo que distingue lo que sigue vivo en la
--       libreta de lo que ya se cobró.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · Lo que le falta a `clientes` para fiar ───────────────────────────
alter table clientes
  add column dia_pago_semana smallint,
  add column fiado_activo boolean not null default false,
  add column fiado_desde date;

alter table clientes
  -- 0 es domingo, igual que en `horarios_profesional` (130). Una convención
  -- distinta por modelo es cómo se manda el recordatorio un día antes.
  add constraint cliente_dia_pago_semana_valido check (
    dia_pago_semana is null or dia_pago_semana between 0 and 6
  ),
  -- Fiar sin fecha de alta deja una libreta sin principio: no se puede decir
  -- desde cuándo se le fía a alguien, ni cortarle el crédito con un argumento.
  add constraint cliente_fiado_con_alta check (not fiado_activo or fiado_desde is not null);

comment on column clientes.dia_pago_semana is
  'Qué día pasa a pagar. Es lo que convierte «me debe $340» en «me debe $340 y pasa los viernes»: sin él, la cobranza de una tiendita es acordarse.';
comment on column clientes.fiado_activo is
  'Si hoy se le fía. Distinto de tener saldo: a quien debe y ya no se le fía se le sigue cobrando, y ésa es justo la lista que el dueño necesita ver aparte.';

-- A quién hay que cobrarle hoy. `saldo_pendiente_centavos` ya existe desde la
-- 002 y lo mantiene el comando de fiado sobre `pasivos_terceros`.
create index clientes_a_cobrar_hoy
  on clientes (organizacion_id, dia_pago_semana)
  where dia_pago_semana is not null and saldo_pendiente_centavos > 0;

-- ── 2 · La orden sabe que se fió ─────────────────────────────────────────
alter table ordenes
  add column metodo_credito boolean not null default false,
  add column cobrada_en timestamptz;

alter table ordenes
  -- Una venta de contado no puede tener fecha de cobro posterior: si la tiene,
  -- alguien está usando la columna para otra cosa y el reporte de cartera
  -- empezará a contar ventas que nunca se fiaron.
  add constraint orden_cobrada_solo_si_credito check (
    cobrada_en is null or metodo_credito
  );

comment on column ordenes.metodo_credito is
  'La venta salió fiada. El ingreso se reconoce igual —la mercancía ya salió— pero el efectivo no entró, y el arqueo tiene que poder separarlos.';
comment on column ordenes.cobrada_en is
  'Cuándo se terminó de pagar. `null` con `metodo_credito` es exactamente lo que sigue vivo en la libreta.';

create index ordenes_fiadas_vivas
  on ordenes (organizacion_id, created_at desc)
  where metodo_credito and cobrada_en is null;
