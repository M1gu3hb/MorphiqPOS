-- 046 · Las restricciones del restaurante (F1-02 E3-2, F1-04 §35).
--
-- Cada índice de aquí sustituye una comprobación que hoy vive en el navegador y
-- es TOCTOU: leer la lista, decidir, y escribir después. Entre la lectura y la
-- escritura cabe otro mesero, otra pestaña y otro dispositivo.
--
-- Criterio de aceptación de `F1-02`: «Intentar dos ventas activas en la misma
-- mesa lo rechaza la base.»

-- ── Prerrequisito: `unaccent` inmutable (F1-04 §34.0) ──────────────────────
--
-- `unaccent()` es STABLE, no IMMUTABLE, porque depende de un diccionario que se
-- puede recargar, y Postgres RECHAZA una función no inmutable en la expresión
-- de un índice. Sin este envoltorio, los tres únicos de §35.10 abortan con
-- `functions in index expression must be marked IMMUTABLE`.
create extension if not exists unaccent with schema extensions;

-- Se marca inmutable a sabiendas: el diccionario `unaccent` es estático en esta
-- instalación y nadie lo recarga. Si algún día se recargara, habría que
-- reindexar — que es exactamente el trato que hace todo el mundo, y se escribe
-- aquí en vez de descubrirlo cuando falle. El `search_path` fijo va por la
-- misma razón que `006_endurecimiento.sql:29` se lo puso a `tocar_updated_at`.
create or replace function clave_texto(t text) returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, extensions, public
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(regexp_replace(t, '\s+', ' ', 'g'))));
$$;

comment on function clave_texto is
  'Clave de comparación de nombres: sin acentos, sin mayúsculas, sin espacios repetidos. '
  'Equivale a estacionKey() de utils/estacionUtils.js:22 y a '
  'normalizarNombreIngrediente() de utils/ingredienteMatcher.js:20, que hoy viven en el navegador.';

-- ── §35.2 · Folio único de corte, de turno y de liquidación ────────────────
--
-- Hoy los tres son `Math.random()` de cuatro caracteres (financialUtils.js:64)
-- salvo el de liquidación, que es un sello de tiempo
-- (LiquidarPropinasDialog.jsx:92). Dos cortes con el mismo folio hacen que el
-- histórico deje de poder reclamarse.
create unique index cortes_folio_unico
  on sesiones_caja (organizacion_id, sucursal_id, serie, folio)
  where folio is not null;

create unique index cortes_turno_folio_unico
  on cortes_turno (organizacion_id, serie, folio);

create unique index liquidaciones_folio_unico
  on liquidaciones_propina (organizacion_id, serie, folio);

-- ── §35.5 · Una sola venta activa por mesa — corrige D-16 ──────────────────
--
-- Dos meseros abriendo la misma mesa a la vez: el segundo INSERT choca aquí.
-- Hoy eso se «resuelve» cancelando la venta duplicada a posteriori
-- (qrPedidoFlow.js:122-134, motivo 'duplicado_apertura_qr'), que es limpiar
-- después en vez de impedir antes.
--
-- Los cinco estados son exactamente los de ESTADOS_VENTA_ACTIVA
-- (qrPedidoFlow.js:20-25, duplicado en entregaPedidos.js:46), traducidos con la
-- tabla de F1-04 §6.6.
create unique index ordenes_una_activa_por_mesa
  on ordenes (organizacion_id, mesa_id)
  where mesa_id is not null
    and estado in ('borrador','confirmada','en_preparacion','lista','cuenta_solicitada');

-- El recíproco, con una corrección al DDL del mapa. `F1-04` §35.5 lo escribe
-- como `on mesas (id) where orden_activa_id is not null`, que NO IMPONE NADA:
-- `id` ya es la clave primaria, así que ese índice es trivialmente único
-- siempre. Lo que falta impedir es que DOS mesas apunten a la MISMA venta
-- activa, y eso se expresa sobre `orden_activa_id`.
create unique index mesas_una_orden_activa
  on mesas (organizacion_id, orden_activa_id)
  where orden_activa_id is not null;

-- ── §35.6 · Una sola caja abierta por SUCURSAL ─────────────────────────────
--
-- `003_venta_caja_inventario.sql:96-98` ya impone una por terminal, y no basta:
-- su sistema no tiene terminales. `useCajaAbierta.js` busca una caja abierta en
-- TODO el negocio y `Caja.jsx:913-922` aborta si encuentra cualquier otra. Con
-- sólo el índice por terminal, dos dispositivos abrirían dos cajas y su
-- interfaz tomaría una al azar. Conviven: el más estrecho gana.
create unique index sesiones_caja_una_abierta_por_sucursal
  on sesiones_caja (organizacion_id, sucursal_id)
  where estado = 'abierta';

-- ── §35.8 · Una sola estación general ──────────────────────────────────────
--
-- Con el `check estacion_general_siempre_activa` de 045, las dos mitades de la
-- regla 10 quedan en la base. Sustituyen a `crearCocinaGeneral`
-- (EstacionesPreparacionSection.jsx:190-199), que lee la lista y luego escribe.
create unique index estaciones_una_general
  on estaciones_preparacion (organizacion_id)
  where es_general;

-- ── §35.9 · Estrechar el carrito de mostrador ──────────────────────────────
--
-- SIN ESTO EL FLUJO DE MESERO NO ARRANCA. El borrador ES el carrito de
-- mostrador, y ahí la unicidad por terminal es correcta: si hubiera dos, el
-- cajero vería uno y cobraría el otro. Pero un restaurante tiene ocho mesas
-- abiertas a la vez y cada mesa abierta es una orden en 'borrador': sin acotar
-- a mostrador, la segunda mesa choca con violación de unicidad.
drop index ordenes_borrador_por_terminal;

create unique index ordenes_carrito_por_terminal
  on ordenes (terminal_id)
  where estado = 'borrador'
    and terminal_id is not null
    and estrategia_captura = 'mostrador';

-- ── §35.10 · Únicos sin acentos ni mayúsculas ──────────────────────────────
--
-- `F1-01` §6: «para que el anti-duplicado deje de vivir en el cliente».
--
-- Los tres son TOTALES, no parciales. Un insumo desactivado sigue ocupando su
-- nombre: reactivarlo es la operación correcta y `Inventario.jsx:141` ya tiene
-- el botón. Crear un segundo «Jitomate» porque el primero está desactivado es
-- exactamente el duplicado que estos índices existen para impedir.

-- Sustituye normalizarNombreIngrediente() (utils/ingredienteMatcher.js:20), que
-- hoy compara contra la lista completa descargada al navegador.
create unique index insumos_nombre_unico
  on insumos (organizacion_id, clave_texto(nombre));

-- Reemplaza el `categorias_nombre_unico` anterior, que sólo aplicaba lower() y
-- por tanto dejaba pasar «Café» junto a «Cafe».
drop index categorias_nombre_unico;
create unique index categorias_nombre_unico
  on categorias (organizacion_id, tipo, clave_texto(nombre));

-- Sustituye findExistingEstacion() (utils/estacionUtils.js:37-43).
create unique index estaciones_nombre_unico
  on estaciones_preparacion (organizacion_id, clave_texto(nombre));

-- ── §35.11 · Una sola solicitud QR pendiente por mesa y tipo — D-17 ────────
--
-- `PortalCliente.jsx:524-532` consulta antes de crear. Dos comensales pulsando
-- «llamar al mesero» a la vez producen dos solicitudes idénticas.
create unique index solicitudes_qr_una_pendiente
  on solicitudes_qr (organizacion_id, mesa_id, tipo)
  where estado = 'pendiente';

-- ── §35.12 · Unidades base del restaurante: sólo g, ml y pieza — regla 7 ───
--
-- `insumos.unidad_base` admite seis valores (003_venta_caja_inventario.sql:47).
-- Es correcto para la tiendita, que vende por kilos, y más permisivo que la
-- regla 7 del restaurante. Un insumo con unidad_base 'kg' rompe todo el
-- consumo: `convertirAUnidadBase` produce gramos (unidadesMedida.js:136) y
-- `validarCompatibilidad` (:98-121) compara contra la base esperando una de las
-- tres. El error no aparece al capturar: aparece al cobrar, multiplicado por mil.
--
-- ESTA ES LA ÚNICA EXCEPCIÓN DECLARADA a «cero lógica de negocio en la base»
-- (R7, A-27), y se declara aquí en vez de descubrirse. No cabe en un `check` de
-- columna porque la condición depende de OTRA TABLA (el giro de la
-- organización), y dejarla sólo en el comando falla en cuanto alguien escriba
-- por otro camino: una importación CSV, una semilla, un `psql`.
create or replace function insumo_unidad_base_valida() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  giro text;
begin
  select paquete into giro from organizaciones where id = new.organizacion_id;
  if giro = 'restaurante' and new.unidad_base not in ('g', 'ml', 'pieza') then
    raise exception
      'Un insumo de restaurante sólo se mide en g, ml o pieza (recibido: %)', new.unidad_base
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger insumos_unidad_base_por_giro
  before insert or update of unidad_base, organizacion_id on insumos
  for each row execute function insumo_unidad_base_valida();
