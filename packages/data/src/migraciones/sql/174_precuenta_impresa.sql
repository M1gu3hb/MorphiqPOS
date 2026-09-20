-- 174 · Cuántas veces se imprimió la precuenta de una cuenta, y cuándo la última.
--
-- ── EL HUECO ────────────────────────────────────────────────────────────────
-- `restaurante/Precuenta.tsx` tiene una sola acción, IMPRIMIR, y publicaba en
-- `/api/restaurante/imprimir-precuenta`, **una ruta que no existía**. El fallo no
-- se tragaba —la pantalla lo enseña y da la salida alterna— pero el servidor no
-- se enteraba nunca de que esa hoja había salido.
--
-- ── POR QUÉ ESTO ES UN DATO DEL NEGOCIO Y NO UN REGISTRO TÉCNICO ───────────
-- Porque la precuenta es el papel que el comensal tiene en la mano, y una cuenta
-- se escapa justamente por ahí: se imprime una, se agregan dos cervezas, se
-- imprime otra, y en caja se paga la primera. Que la segunda hoja diga
-- «REIMPRESIÓN · 2ª» es lo que hace que el cajero mire el total antes de cobrar.
-- Un contador vive en la orden porque es de la orden, no de la sesión ni del
-- mesero: la misma cuenta la puede imprimir el que releva.
--
-- No se guarda el ANCHO del rollo. Es del hardware de la terminal, no de la
-- cuenta: guardarlo en la orden diría que esta cuenta «es de 80 mm», que no
-- significa nada el día que se imprima desde la otra caja.

alter table ordenes add column if not exists precuentas_impresas int not null default 0;
alter table ordenes add column if not exists precuenta_impresa_en timestamptz;

comment on column ordenes.precuentas_impresas is
  'F-330 · Cuántas veces salió la precuenta de esta cuenta. Desde la segunda, la hoja se imprime marcada como reimpresión: una cuenta se escapa cuando el cajero cobra la hoja vieja.';
comment on column ordenes.precuenta_impresa_en is
  'Cuándo salió la última. Con el contador basta para saber si la hoja que trae el comensal es la de hace un minuto o la de hace media hora.';

-- El contador no puede ir hacia atrás: una precuenta impresa no se «desimprime»,
-- y un update que lo bajara borraría la única señal de que hubo dos hojas.
alter table ordenes drop constraint if exists precuentas_impresas_no_negativas;
alter table ordenes add constraint precuentas_impresas_no_negativas
  check (precuentas_impresas >= 0);

-- Y la fecha SÓLO existe si hubo impresión: una fecha con el contador en cero
-- diría que salió una hoja que nadie contó.
alter table ordenes drop constraint if exists precuenta_fecha_con_contador;
alter table ordenes add constraint precuenta_fecha_con_contador
  check ((precuentas_impresas = 0) = (precuenta_impresa_en is null));
