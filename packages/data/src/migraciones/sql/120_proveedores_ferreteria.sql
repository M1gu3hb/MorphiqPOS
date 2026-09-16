-- 120 · Lo que una ferretería necesita saber de su proveedor (F-160).
--
-- ── Qué añade esto y qué NO ──────────────────────────────────────────────
-- `dias_credito`, `dia_visita`, `frecuencia` y `acepta_canje` ya existen desde
-- la 099, que los puso para la ruta de abarrotes. Volver a crearlos aquí sería
-- el error 42701 el día que se aplique, así que esta migración añade sólo las
-- tres columnas que el giro de ferretería necesita y que la ruta no tenía.
--
-- ── El mínimo de pedido cambia la decisión de compra ─────────────────────
-- El distribuidor de cemento no manda por menos de $15,000. Eso no es un dato
-- de contacto: es lo que decide si hoy se pide o se espera a juntar. Sin él, el
-- sistema sugiere un pedido de $4,000 que nadie va a poder hacer, y a la tercera
-- vez la sugerencia deja de mirarse.
--
-- ── Los días de entrega no son los de crédito ────────────────────────────
-- Son dos números distintos que se confunden todo el tiempo. El crédito dice
-- cuándo hay que pagar; la entrega, cuándo llega. Si el mínimo de existencia se
-- calcula con el de crédito, el material se acaba justo cuando iba a llegar.
--
-- ── Y si acepta garantías, porque la mitad no ────────────────────────────
-- La 118 registra lo que se manda al proveedor. Esta columna es lo que evita
-- mandarlo: con un proveedor que no acepta garantías, la pieza averiada es una
-- merma y hay que decidirlo en el mostrador, no tres semanas después.
--
-- ── ESTA MIGRACIÓN NO SE APLICA EN LA FASE 2 ──────────────────────────────

-- ── Lo que `compra_lineas` gana · F-631 ──────────────────────────────────
--
-- La clave DEL PROVEEDOR, tal cual viene en su hoja. Es lo que hace que la
-- SEGUNDA nota del mismo proveedor se empareje sola: la primera vez alguien
-- confirma qué es cada renglón, y a partir de ahí la clave `TN-1425` de ese
-- proveedor ya sabe a qué tornillo apunta.
--
-- Sin esta columna, cada entrada de doscientos renglones vuelve a emparejarse
-- por nombre —que es el camino que se equivoca— y el trabajo de confirmar se
-- repite entero cada mes. Ésa es la razón real por la que las entradas no se
-- capturan y el inventario de una ferretería no sirve.
alter table compra_lineas add column clave_proveedor text;

comment on column compra_lineas.clave_proveedor is
  'F-631 · La clave del proveedor en SU hoja. Es la memoria que hace que la segunda nota se empareje sola; sin ella el trabajo de confirmar se repite entero cada mes.';

-- El emparejamiento exacto de la siguiente nota. Recorre por clave, no por
-- nombre, y por eso este indice es lo que separa dos horas de dos minutos.
create index compra_lineas_por_clave_proveedor
  on compra_lineas (organizacion_id, clave_proveedor) where clave_proveedor is not null;

alter table proveedores
  add column monto_minimo_pedido_centavos bigint not null default 0,
  add column dias_entrega smallint not null default 0,
  add column acepta_garantias boolean not null default false,
  -- Con quién se reclama. En una ferretería el proveedor es una empresa y el
  -- contacto de garantías casi nunca es el vendedor que pasa a tomar el pedido.
  add column contacto_garantias text;

alter table proveedores
  add constraint proveedor_minimo_no_negativo check (monto_minimo_pedido_centavos >= 0),
  add constraint proveedor_dias_entrega_en_rango check (dias_entrega between 0 and 180),
  -- Decir que acepta garantías sin decir con quién se reclama deja la columna
  -- en «sí» y el trámite en el aire, que es peor que un «no» honesto.
  add constraint proveedor_garantias_con_contacto check (
    not acepta_garantias
    or (contacto_garantias is not null and length(trim(contacto_garantias)) > 0)
  );

comment on column proveedores.monto_minimo_pedido_centavos is
  'F-160 · No es un dato de contacto: es lo que decide si hoy se pide o se espera a juntar. Sin él, el sistema sugiere un pedido que nadie va a poder hacer, y a la tercera vez la sugerencia deja de mirarse.';
comment on column proveedores.dias_entrega is
  'Cuándo LLEGA, que no es cuándo hay que pagar. Calcular el mínimo de existencia con los días de crédito hace que el material se acabe justo cuando iba a llegar.';
comment on column proveedores.acepta_garantias is
  'La mitad no las acepta. Saberlo en el mostrador convierte la pieza averiada en una merma decidida, en vez de en un trámite que se descubre muerto tres semanas después.';

-- Los que se pueden pedir hoy: se cruza con la sugerencia de compra.
create index proveedores_por_entrega
  on proveedores (organizacion_id, dias_entrega) where activo;
