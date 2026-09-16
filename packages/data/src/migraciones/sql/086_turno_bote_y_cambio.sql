-- 086 · El turno, el bote y el cambio (F-248 y el arqueo de mostrador).
--
-- ── El bote se reparte a ojo ──────────────────────────────────────────────
-- Es el equivalente exacto del dolor 2 de `restaurante`, en su versión de
-- mostrador: el reparto se hace en efectivo, a ojo, y en cuanto entra un tercero
-- los fines de semana empieza el resentimiento. Para poder repartirlo por horas
-- hay que saber primero CUÁNTO había, y hoy el bote no se cuenta: se vacía.
--
-- ── El fondo en tres columnas, y no en una ────────────────────────────────
-- «$1,500 de fondo» no dice si hay cambio. Una cafetería que abre con
-- $1,500 en billetes de 500 no puede cobrar un café de $55 en efectivo, y eso
-- pasa de verdad. Monedas, chicos y grandes por separado es lo que convierte el
-- fondo en una decisión operativa en vez de en un número.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

alter table sesiones_caja
  add column fondo_monedas_centavos  bigint  not null default 0
                                     check (fondo_monedas_centavos >= 0),
  add column fondo_chicos_centavos   bigint  not null default 0
                                     check (fondo_chicos_centavos >= 0),
  add column fondo_grandes_centavos  bigint  not null default 0
                                     check (fondo_grandes_centavos >= 0),
  -- Lo que había en el bote al cerrar, CONTADO. Nulo mientras el turno sigue
  -- abierto y nulo también en los turnos que no lo cuentan: un cero significaría
  -- «no había nada», que es otra afirmación.
  add column bote_contado_centavos   bigint  check (bote_contado_centavos >= 0),
  add column turno                   text;

alter table sesiones_caja
  add constraint sesion_turno_valido check (
    turno is null or turno in ('matutino', 'vespertino', 'nocturno', 'completo')
  );

comment on column sesiones_caja.bote_contado_centavos is
  'F-248 · Lo que había en el bote, contado al cerrar. Nulo = no se contó, que NO es lo mismo que cero.';
comment on column sesiones_caja.fondo_monedas_centavos is
  'F-984 · El fondo desglosado. «$1,500 de fondo» no dice si se puede dar cambio de un café de $55.';

-- El desglose tiene que sumar el fondo. Sin esto, las tres columnas serían
-- decoración y el primero que abra con un total distinto de la suma dejaría el
-- arqueo cuadrando contra un número y el cajón contra otro.
alter table sesiones_caja
  add constraint sesion_fondo_desglosado_cuadra check (
    fondo_monedas_centavos + fondo_chicos_centavos + fondo_grandes_centavos = 0
      or fondo_monedas_centavos + fondo_chicos_centavos + fondo_grandes_centavos
         = fondo_inicial_centavos
  );

-- ── La entrada de cambio ──────────────────────────────────────────────────
--
-- A media mañana se acaban las monedas y alguien va al banco o cambia con el
-- vecino. Ese dinero ENTRA al cajón y no es una venta: registrarlo como
-- `deposito` lo mezclaría con el efectivo del negocio y el arqueo diría que
-- sobran $500 que en realidad son cambio prestado.
-- Se reescribe la lista COMPLETA VIGENTE, no la de la 003 con un valor nuevo
-- pegado. Escrita como estaba —sin `devolucion` ni `propina`— esta migración
-- abortaba con «check constraint ... is violated by some row»: en producción hay
-- un movimiento de propina de un negocio que cobra. Y de no haberlo habido
-- habría sido peor, porque la lista se habría estrechado en silencio y el fallo
-- habría salido en la primera propina, no aquí.
alter table movimientos_caja drop constraint movimientos_caja_tipo_check;
alter table movimientos_caja
  add constraint movimientos_caja_tipo_check check (
    tipo in (
      -- 003 · el tronco. `devolucion` y `propina` están desde el principio, y
      -- `movimiento_signo_coherente` de la 003 todavía nombra `devolucion`.
      'apertura', 'venta', 'devolucion', 'gasto', 'retiro', 'deposito', 'ajuste', 'propina',
      -- esta migración · el cierre de turno y el fondo de cambio de la cafetería.
      'cierre', 'entrada_cambio'
    )
  );

-- ── F-262 · No se cierra el turno con pedidos en la fila ──────────────────
--
-- En mostrador el equivalente de «mesas abiertas» es la fila de barra: cerrar
-- con bebidas pagadas sin entregar deja al cliente con un ticket y sin café, y
-- al turno siguiente sin saber que existían.
create or replace function turno_sin_pedidos_en_fila() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  pendientes int;
begin
  if new.estado <> 'cerrada' or old.estado = 'cerrada' then return new; end if;

  select count(*) into pendientes
    from comandas c
   where c.organizacion_id = new.organizacion_id
     and c.sucursal_id = new.sucursal_id
     and c.cobrado_en is not null
     and c.estado in ('nuevo', 'en_preparacion', 'listo');

  if pendientes > 0 then
    raise exception
      'No se puede cerrar el turno con % pedido(s) en la fila de barra', pendientes
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sesiones_caja_sin_fila_pendiente
  before update on sesiones_caja
  for each row execute function turno_sin_pedidos_en_fila();
