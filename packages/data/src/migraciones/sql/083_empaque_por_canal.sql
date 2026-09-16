-- 083 · El empaque, que es una columna y arregla todos los márgenes (F-331).
--
-- ── Cinco a ocho puntos de margen, invisibles ─────────────────────────────
-- Un latte para tomar aquí va en taza; el mismo latte para llevar va en vaso,
-- tapa y funda. Hoy la receta es una sola, así que el empaque no está en el
-- costo y TODOS los márgenes de la plantilla están inflados entre 5 y 8 puntos.
-- La dueña cree que gana un 68 % donde gana un 61 %.
--
-- ── Una columna, no una segunda receta ────────────────────────────────────
-- La tentación es duplicar la receta por canal. Sería la misma bebida escrita
-- dos veces: el día que cambie el gramaje del espresso habría que cambiarlo en
-- dos sitios, y el día que alguien cambie uno solo, el margen de `llevar`
-- dejaría de significar nada. Una línea de receta dice a qué canales aplica, y
-- las líneas comunes aplican a todos.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

alter table recetas add column aplica_canal text[];

-- Nulo = TODOS los canales, que es lo que era todo lo histórico. Se prefiere
-- nulo a sembrar el arreglo completo porque «esta línea no depende del canal»
-- y «esta línea aplica a los cuatro canales que existen hoy» son afirmaciones
-- distintas: la segunda envejece mal en cuanto entre un quinto canal.
alter table recetas
  add constraint receta_canales_validos check (
    aplica_canal is null
      or (
        array_length(aplica_canal, 1) > 0
        and aplica_canal <@ array['aqui', 'llevar', 'plataforma', 'anticipado']::text[]
      )
  );

comment on column recetas.aplica_canal is
  'F-331 · Nulo = aplica a todos. Con valores, sólo a esos canales: es lo que mete el vaso y la tapa en el costo de lo que se lleva.';

-- La explosión de receta al cobrar filtra por canal, y lo hace por cada línea
-- de cada venta: 180 veces al día en la hora pico.
create index recetas_por_producto_y_canal on recetas (producto_id) where activa;
