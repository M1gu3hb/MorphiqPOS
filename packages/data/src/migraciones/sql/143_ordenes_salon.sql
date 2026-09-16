-- 143 · La orden sabe de quién es cada línea (F-442, F-443).
--
-- ⚠ TOCA TABLAS VIVAS: `ordenes` y `orden_lineas`, que usan hoy cuatro
--    negocios en producción. Todo lo de aquí es nullable, así que el relleno es
--    nulo y nada existente se rompe. Aun así NO SE APLICA SIN DECISIÓN
--    EXPLÍCITA.
--
-- ── El renglón sin dueño es el origen del dolor 2 ────────────────────────
-- En los otros cuatro modelos da igual quién capturó la línea: el dinero es del
-- negocio. Aquí no. Cada renglón de la cuenta se le paga a alguien, y si el
-- renglón no dice a quién, la comisión se saca el domingo con calculadora
-- —que es exactamente lo que este bloque viene a quitar—.
--
-- Y no basta con el profesional de la CITA: en la misma cuenta puede ir el
-- corte de Dany, el tinte de Karla y un shampoo que vendió la recepcionista. Si
-- la comisión se calculara por cita, las tres cobrarían lo mismo.
--
-- ── `cita_servicio_id` es lo que cierra el círculo ───────────────────────
-- Con él, el renglón cobrado apunta al servicio agendado, y de ahí al precio
-- congelado, a la regla de comisión vigente ese día y a la fórmula que se
-- aplicó. Sin él hay que cruzar por hora y por nombre, que es adivinar.
--
-- ── Y la cuenta de destino de la transferencia ───────────────────────────
-- Quien renta la silla cobra a SU cuenta, no a la del salón. Cuando el cliente
-- paga con transferencia en la terminal del salón, el dinero entra al negocio y
-- hay que devolvérselo: sin registrar a dónde va, ese pase se convierte en una
-- nota en el teléfono de alguien.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

alter table orden_lineas
  add column profesional_id uuid references profesionales (id) on delete set null,
  add column cita_servicio_id uuid references cita_servicios (id) on delete set null,
  -- Lo que costó el material que se gastó en ESTE renglón. Es lo que permite
  -- contestar la pregunta 3 de la regla de comisión —«¿el material lo pone el
  -- salón o se descuenta de la base?»— sin recalcular nada después.
  add column material_centavos bigint not null default 0;

alter table orden_lineas
  add constraint orden_linea_material_no_negativo check (material_centavos >= 0);

comment on column orden_lineas.profesional_id is
  'F-442 · De quién es este renglón. En la misma cuenta puede ir el corte de una, el tinte de otra y un shampoo que vendió la recepción: calcular la comisión por CITA les pagaría lo mismo a las tres.';
comment on column orden_lineas.material_centavos is
  'Lo que costó el material de ESTE renglón, congelado al cobrar. Contesta la tercera de las cinco preguntas de la regla sin tener que recalcular nada después.';

create index orden_lineas_por_profesional
  on orden_lineas (organizacion_id, profesional_id)
  where profesional_id is not null;

alter table ordenes
  add column cita_id uuid references citas (id) on delete set null,
  -- A dónde va la transferencia cuando quien atiende renta la silla: el dinero
  -- entra a la terminal del salón y hay que devolvérselo.
  add column cuenta_destino_transferencia text;

comment on column ordenes.cuenta_destino_transferencia is
  'Quien renta la silla cobra a SU cuenta. El pase por la terminal del salón entra al negocio y hay que devolverlo: sin este campo, ese traspaso vive en una nota en el teléfono de alguien.';

create index ordenes_por_cita
  on ordenes (organizacion_id, cita_id) where cita_id is not null;

-- Las dos referencias que la 132 dejó apuntando en el otro sentido ya existen
-- (`citas.orden_id`, `cita_servicios.orden_linea_id`). Este índice es el que
-- hace barata la vuelta: de la cuenta a la cita, que es como se entra desde el
-- mostrador cuando alguien pregunta «¿esto de qué fue?».
