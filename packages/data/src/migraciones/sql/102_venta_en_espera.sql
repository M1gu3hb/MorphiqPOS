-- 102 · La venta que se aparta para atender a otro (F-224).
--
-- ── Por qué esta migración no estaba en la lista ──────────────────────────
-- `05-DATOS-Y-BACKEND.md` declara `venta.suspender` / `venta.retomar` y dice, en
-- su propia tabla de comandos, que escriben `ordenes.estado`. Pero el `check` de
-- esa columna —003, ampliado por la 070 y la 071— no admite ningún estado que
-- signifique «apartada». El comando existía en el papel y no podía existir en la
-- base: el primer `suspender` habría sido un 23514 en producción. Se escribe
-- aquí, dentro del rango de `abarrotes` (090-109), y se declara en el árbol de
-- migraciones del modelo.
--
-- ── El caso, que es de todos los días ─────────────────────────────────────
-- El cliente lleva doce artículos escaneados y se acuerda de que falta el pan.
-- Detrás hay cuatro personas. Sin esto hay dos salidas y las dos cuestan más que
-- una columna: se cancela y se vuelve a escanear todo cuando regrese —y la fila
-- se para dos veces— o se le pide a la fila que espere.
--
-- ── Suspender NO es cancelar ──────────────────────────────────────────────
-- Cancelar deja la orden muerta y su folio quemado. Suspender la deja VIVA y
-- recuperable, con sus líneas, su descuento autorizado y su cliente
-- identificado, que es justo lo que costó tiempo. Por eso es un estado nuevo y
-- no un uso del que ya hay.
--
-- ── Y por qué NO se reutiliza `codigo_caja` ───────────────────────────────
-- `ordenes.codigo_caja` ya significa otra cosa desde la 045: es el código que el
-- comensal lleva impreso a la caja en `restaurante` (`M05-4821`). Meter aquí el
-- código de una venta apartada haría que las dos cosas compartieran columna en
-- un sistema donde el mismo negocio puede tener las dos —una cafetería con
-- mostrador y mesas—, y entonces el «47» de la caja y el «M05-4821» de la mesa
-- se pisarían. Son dos conceptos, y llevan dos columnas.
--
-- ── El código es corto porque se dice en voz alta ─────────────────────────
-- «Tu venta es la 47.» Un uuid no se dice, y un consecutivo global haría que el
-- código del martes fuera 1,284. Se recicla dentro de la terminal: el índice
-- único parcial es lo que garantiza que dos ventas vivas de la misma caja nunca
-- compartan número, que es la única forma de que «la 47» signifique una sola
-- cosa cuando el cliente vuelve.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── 1 · El estado ────────────────────────────────────────────────────────
--
-- ⚠ Lista cerrada: se reescribe ENTERA con lo VIGENTE más `suspendida`, y lo
-- vigente NO es lo que dejó la 003. Un `check` que se amplía copiando una lista
-- vieja borra en silencio lo que las migraciones de en medio añadieron, y el
-- primer `dividir cuenta` después de aplicar esto sería un 23514 en un
-- restaurante que llevaba meses funcionando.
alter table ordenes drop constraint ordenes_estado_check;
alter table ordenes
  add constraint ordenes_estado_check check (
    estado in (
      -- 003 · el tronco.
      'borrador', 'confirmada', 'en_preparacion', 'lista', 'cuenta_solicitada',
      'parcialmente_pagada', 'pagada', 'parcialmente_reembolsada', 'reembolsada',
      'cancelada',
      -- 070 · F-321 · la cuenta madre de una división: terminal, no se cobra.
      'dividida',
      -- 071 · F-302 · la cuenta absorbida al unir mesas: se cobra en la otra.
      'absorbida',
      -- 102 · F-224 · apartada en el mostrador, viva y recuperable.
      'suspendida'
    )
  );

-- ── 2 · El código con que se retoma ──────────────────────────────────────
alter table ordenes add column codigo_espera text;

comment on column ordenes.codigo_espera is
  'F-224 · El número corto que el cajero dice en voz alta: «tu venta es la 47». Se recicla por terminal, y por eso es texto corto y no un consecutivo global: el del martes seria 1,284 y nadie lo repite bien.';

-- Suspendida sin código es una venta que nadie puede volver a encontrar, y
-- suspenderla fue exactamente para poder encontrarla.
alter table ordenes add constraint orden_suspendida_con_codigo check (
  estado <> 'suspendida' or codigo_espera is not null
);

-- Y el código sólo vive mientras la venta está apartada: dejarlo puesto al
-- retomarla haría que la siguiente suspensión de esa caja tuviera que saltárselo,
-- y a la tercera venta del día los códigos ya no serían cortos.
alter table ordenes add constraint orden_codigo_espera_solo_suspendida check (
  codigo_espera is null or estado = 'suspendida'
);

-- Dos ventas vivas de la misma caja NUNCA comparten número. Sin esto, «la 47»
-- deja de significar una sola cosa justo cuando el cliente vuelve.
create unique index ordenes_codigo_espera_unico
  on ordenes (organizacion_id, terminal_id, codigo_espera)
  where estado = 'suspendida';

-- Lo que la caja tiene apartado, para la lista del mostrador y para el corte:
-- una venta suspendida a las nueve de la noche es alguien que ya no volvió.
create index ordenes_suspendidas
  on ordenes (organizacion_id, terminal_id, updated_at)
  where estado = 'suspendida';

-- ── 3 · Lo que esta migración deliberadamente NO hace ────────────────────
--
-- No toca inventario ni caja. El descuento de stock cuelga del cobro y una venta
-- suspendida no se cobró: descontar al apartar dejaría el anaquel corto mientras
-- el cliente busca el pan, y corto para siempre si no vuelve. Y no hay
-- caducidad automática: una venta apartada que nadie retoma se cancela a mano o
-- muere con el corte, porque borrarla sola se llevaría por delante la del
-- cliente que sí volvió a los veinte minutos.
