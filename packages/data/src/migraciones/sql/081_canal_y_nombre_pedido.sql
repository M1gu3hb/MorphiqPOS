-- 081 · El canal y el nombre del vaso (F-331 y F-328).
--
-- ── `canal` es el campo más barato y más rentable de la carpeta ───────────
-- Un latte para tomar aquí va en taza; el mismo latte para llevar va en vaso,
-- tapa y funda. Hoy la receta es una sola, así que el empaque no existe en el
-- costo y TODOS los márgenes de la plantilla están inflados entre 5 y 8 puntos.
-- Y de paso nadie puede contestar cuántos vasos pedir el mes que viene.
--
-- ── `nombre_pedido` NO es `cliente_nombre` ────────────────────────────────
-- `ordenes.cliente_nombre` ya existe y es del cliente identificado, con su
-- ficha. Éste es la etiqueta efímera que el barista grita: «Ana», «el de la
-- gorra». Confundirlos metería nombres de pila sueltos en el padrón de clientes
-- y ensuciaría para siempre la base con la que se hace la lealtad.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

alter table ordenes
  add column canal         text not null default 'aqui',
  add column nombre_pedido text;

alter table ordenes
  add constraint ordenes_canal_valido check (
    canal in ('aqui', 'llevar', 'plataforma', 'anticipado')
  );

comment on column ordenes.canal is
  'F-331 · Decide el empaque y con él el costo real. `aqui` por omisión: es lo que era todo lo histórico.';
comment on column ordenes.nombre_pedido is
  'F-328 · La etiqueta que se grita. NO es cliente_nombre: ése es del cliente identificado y éste es efímero.';

-- El histórico se queda en `aqui` y eso es exacto: el sistema no tenía canal,
-- así que no hay forma de saber cuál de esas ventas fue para llevar. Marcarlas
-- de otro modo sería inventar el dato; dejarlas en el valor por omisión es
-- decir la verdad —«no se sabe, y antes todo se servía igual»—.
update ordenes set canal = 'aqui' where canal is null;

create index ordenes_por_canal on ordenes (organizacion_id, canal, created_at desc);

-- La fila de barra busca por nombre cuando el cliente vuelve a preguntar.
create index ordenes_por_nombre_pedido
  on ordenes (organizacion_id, nombre_pedido)
  where nombre_pedido is not null;
