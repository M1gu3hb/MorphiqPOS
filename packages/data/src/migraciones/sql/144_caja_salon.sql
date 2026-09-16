-- 144 · La caja de un salón, y el corte que habla de la AGENDA.
--
-- ── Los cinco tipos de movimiento ya entraron, y aquí se dice por qué ────
-- El plan pedía «5 tipos nuevos de movimiento_caja». Los cinco —`entrada_cambio`,
-- `liquidacion`, `propina_entregada`, `cobro_renta` y `anticipo_cita`— los metió
-- la 135 al declarar la liquidación, porque sin ellos esa migración no podía
-- registrar lo que registra.
--
-- Repetirlos aquí no sería redundante: sería PELIGROSO. Un `check` de lista
-- cerrada se tira y se vuelve a crear entero, y una segunda lista escrita desde
-- cero es exactamente cómo se pierden los valores de otro modelo —ya pasó
-- cuatro veces en este proyecto, y por eso existe
-- `valores-de-check.contrato.test.ts`—. Se queda dicho, y no se toca.
--
-- ── La tabla se llama `cortes_turno` ─────────────────────────────────────
-- El plan la nombra «cortes_caja» y en la base es `cortes_turno`, de la 045.
-- Se usa la que existe: crear una tabla con el nombre del plan dejaría dos
-- sitios donde se cierra el día.
--
-- ── Lo que SÍ le falta al corte de un salón ──────────────────────────────
-- Un corte de caja de restaurante cierra sobre lo que entró. Un corte de salón
-- tiene que cerrar sobre lo que entró Y sobre la agenda, porque las dos cifras
-- que la dueña mira al cerrar no son de dinero: son cuántos huecos quedaron sin
-- llenar y cuánta gente no llegó. Sin ellas, el corte dice «$18,400» y no dice
-- que pudieron ser $24,000.
--
-- ── Y por qué el dinero AJENO va aparte en el corte ──────────────────────
-- En el cajón de un salón conviven tres dineros que no son del salón: la
-- propina de cada profesional, el anticipo de un servicio que no ha ocurrido, y
-- lo que le toca a quien renta la silla. Un corte que los sume al ingreso da un
-- número que nadie puede usar para nada.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

alter table cortes_turno
  -- Agenda. Son las dos cifras que la dueña mira al cerrar.
  add column citas_agendadas smallint not null default 0,
  add column citas_atendidas smallint not null default 0,
  add column citas_no_llegaron smallint not null default 0,
  add column minutos_ocupados int not null default 0,
  add column minutos_disponibles int not null default 0,
  -- Dinero que está en el cajón y NO es del salón.
  add column propinas_por_entregar_centavos bigint not null default 0,
  add column anticipos_vivos_centavos bigint not null default 0,
  add column rentas_cobradas_centavos bigint not null default 0;

alter table cortes_turno
  add constraint corte_turno_citas_no_negativas check (
    citas_agendadas >= 0 and citas_atendidas >= 0 and citas_no_llegaron >= 0
  ),
  -- Atendidas más no-shows no pueden pasar de las agendadas: si pasan, alguien
  -- contó dos veces la misma cita y la ocupación del día sale por encima del
  -- 100 %, que es el número que hace desconfiar del reporte entero.
  add constraint corte_turno_citas_cuadran check (
    citas_atendidas + citas_no_llegaron <= citas_agendadas
  ),
  add constraint corte_turno_minutos_no_negativos check (
    minutos_ocupados >= 0 and minutos_disponibles >= 0
  ),
  add constraint corte_turno_ajeno_no_negativo check (
    propinas_por_entregar_centavos >= 0
    and anticipos_vivos_centavos >= 0
    and rentas_cobradas_centavos >= 0
  );

comment on column cortes_turno.minutos_disponibles is
  'La capacidad del día según los horarios de los profesionales. Es el denominador de la ocupación, y sin él el corte dice «$18,400» sin decir que pudieron ser $24,000.';
comment on column cortes_turno.propinas_por_entregar_centavos is
  'Dinero AJENO dentro del cajón. Sumarlo al ingreso del día da un número que nadie puede usar para nada.';
comment on column cortes_turno.anticipos_vivos_centavos is
  'Cobrado por servicios que todavía no ocurren. Contarlo como venta del día adelanta el ingreso, el IVA y la comisión de quien aún no ha trabajado.';
