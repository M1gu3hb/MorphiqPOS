-- ─────────────────────────────────────────────────────────────────────────────
-- 187 · UNIR MESAS DESDE EL MAPA (DP-9.6, fase B).
--
-- Hasta aquí una unión (071) nacía de una cuenta abierta y moría con ella: al cobrar, el grupo
-- se cerraba solo. Ahora las mesas se juntan en el mapa —se arrastran, se atraen y se funden—, y
-- la unión es del SALÓN, no de una cuenta: sobrevive al cobro; al limpiar se pregunta «¿Separar
-- mesas o dejarlas unidas?», y unidas sirven al siguiente cliente con el mismo número.
--
--   · `uniones_mesa.orden_id` admite NULL: una unión sin cuenta (las mesas se juntaron antes de
--     que llegara la gente, o la cuenta ya se cobró y la siguiente aún no se abre). Cuando se abre
--     una cuenta en la principal, la unión la toma.
--   · Las posiciones ORIGINALES en el plano —de la principal y de cada mesa del grupo— se guardan
--     al unir: separar devuelve cada mesa a donde estaba. El número y la zona no cambian: la
--     principal ES el número que se eligió («¿Qué número queda?») y las demás sólo se ocultan.
--   · `mesas.unida_a_mesa_id`: la principal de la unión viva en la que está absorbida una mesa.
--     Copia de `union_mesa_miembros` + `uniones_mesa`, para que el mapa oculte las absorbidas y el
--     QR de una absorbida caiga en la principal sin otra lectura. La mantienen unir y separar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table uniones_mesa alter column orden_id drop not null;

alter table uniones_mesa
  add column principal_x_original integer,
  add column principal_y_original integer;

comment on column uniones_mesa.orden_id is
  'La cuenta del grupo. NULL desde DP-9.6 (187): una unión del salón puede vivir sin cuenta entre un cliente y el siguiente.';
comment on column uniones_mesa.principal_x_original is
  'DP-9.6 · Dónde estaba la principal en el plano antes de unir: separar la regresa ahí.';

alter table union_mesa_miembros
  add column posicion_x_original integer,
  add column posicion_y_original integer;

comment on column union_mesa_miembros.posicion_x_original is
  'DP-9.6 · Dónde estaba esta mesa en el plano antes de unir: separar la regresa ahí.';

alter table mesas
  add column unida_a_mesa_id uuid references mesas (id) on delete set null,
  add constraint mesas_no_unida_a_si_misma check (unida_a_mesa_id is null or unida_a_mesa_id <> id);

create index mesas_unidas
  on mesas (organizacion_id, unida_a_mesa_id)
  where unida_a_mesa_id is not null;

comment on column mesas.unida_a_mesa_id is
  'DP-9.6 · La principal de la unión viva que absorbió esta mesa (NULL si no está unida). El mapa la oculta y su QR cae en la principal.';

-- RELLENO · Las uniones que ya estaban vivas al aplicar esta migración: sus mesas absorbidas
-- quedan marcadas igual que las que se unan desde ahora. Sin esto, una mesa unida antes de la
-- Fase B se seguiría viendo en el mapa y se podría liberar como si fuera la principal.
update mesas m
   set unida_a_mesa_id = u.mesa_principal_id
  from union_mesa_miembros mm
  join uniones_mesa u on u.id = mm.union_id
 where mm.mesa_id = m.id
   and u.cerrada_en is null
   and u.organizacion_id = m.organizacion_id;
