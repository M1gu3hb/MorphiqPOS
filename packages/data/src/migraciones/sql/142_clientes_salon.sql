-- 142 · Lo que le falta a `clientes` para un salón (F-040).
--
-- ⚠ TOCA UNA TABLA VIVA. `clientes` la usan hoy cuatro negocios en producción.
--    Todas las columnas de aquí son nullable o con `default`, así que el
--    relleno es nulo y nada existente se rompe. Aun así NO SE APLICA SIN
--    DECISIÓN EXPLÍCITA, por la misma razón que la 143.
--
-- ── Por qué el salón necesita más que nombre y teléfono ──────────────────
-- Porque aquí el cliente no es quien paga: es una persona a la que se le toca
-- el pelo cada seis semanas, cuyo nombre se dice en voz alta en un salón lleno
-- y a la que se le manda un recordatorio a las nueve de la noche. Cada una de
-- esas tres cosas necesita un dato que hoy no existe.
--
-- ── El recordatorio necesita PERMISO, no sólo un teléfono ────────────────
-- Mandar un WhatsApp a quien no lo pidió es cómo se pierde un cliente bueno y
-- cómo un negocio acaba con el número bloqueado. `acepta_recordatorios` nace en
-- `false` a propósito: el silencio no es un sí.
--
-- ── Y por qué `primera_visita` se guarda si `citas` la tiene ─────────────
-- Porque la primera visita puede ser anterior al sistema. Una clienta de ocho
-- años que empezó a agendarse el mes pasado NO es una clienta nueva, y tratarla
-- como tal en el reporte de retención hace que el número diga lo contrario de
-- lo que pasa.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

alter table clientes
  add column genero text,
  add column whatsapp text,
  add column acepta_recordatorios boolean not null default false,
  add column primera_visita date,
  add column profesional_habitual_id uuid references profesionales (id) on delete set null,
  add column como_se_llama text;

alter table clientes
  -- `prefiere_no_decir` es una respuesta, no un hueco. Sin ella, quien no se
  -- reconoce en las otras tres se queda en `null` y no hay forma de saber si
  -- nadie preguntó o si contestó eso.
  add constraint cliente_genero_valido check (
    genero is null or genero in ('femenino', 'masculino', 'no_binario', 'prefiere_no_decir')
  );

comment on column clientes.acepta_recordatorios is
  'Nace en `false` a propósito: el silencio no es un sí. Mandar un WhatsApp a quien no lo pidió es cómo se pierde un cliente bueno y cómo un negocio acaba con el número bloqueado.';
comment on column clientes.primera_visita is
  'Puede ser anterior al sistema. Una clienta de ocho años que empezó a agendarse el mes pasado NO es nueva, y contarla como nueva hace que el reporte de retención diga lo contrario de lo que pasa.';
comment on column clientes.como_se_llama is
  'Cómo se le dice en voz alta en un salón lleno. No es un apodo cariñoso: es el dato que evita gritar el nombre completo de alguien delante de doce personas.';
comment on column clientes.profesional_habitual_id is
  'Con quién se atiende siempre. Es lo primero que la recepción necesita al agendar, y hoy vive en la memoria de quien contesta el teléfono.';

-- A quién le toca volver: la consulta de F-951, y se hace sobre toda la base de
-- clientes del salón, no sobre una cita.
create index clientes_con_recordatorio
  on clientes (organizacion_id, primera_visita)
  where acepta_recordatorios;

create index clientes_por_profesional_habitual
  on clientes (organizacion_id, profesional_habitual_id)
  where profesional_habitual_id is not null;
