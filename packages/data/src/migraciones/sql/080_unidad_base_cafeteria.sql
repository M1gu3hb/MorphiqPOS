-- 080 · La puerta de 1000× que hoy está abierta en cafetería (§0.1).
--
-- ── El hallazgo ───────────────────────────────────────────────────────────
-- `054_separar_giro_paquete.sql` creó `insumo_unidad_base_valida()`, que obliga
-- a que un insumo se mida en `g`, `ml` o `pieza`. Su condición es
-- `giro = 'restaurante'` y NADA MÁS. Para una cafetería no valida nada: hoy se
-- puede dar de alta la leche con `unidad_base = 'litro'` y el consumo se
-- dividiría entre mil sin que falle en ningún lado.
--
-- Es el error de 1000× en el insumo más caro del giro, y por eso esta migración
-- va PRIMERA de la carpeta: no es una función nueva, es un error de datos con
-- la puerta abierta.
--
-- ── Y falla en vez de convertir a ciegas ──────────────────────────────────
-- Si ya hay insumos que violan la regla, esta migración ABORTA y los enseña.
-- Convertirlos automáticamente —multiplicar por mil el que estuviera en litros—
-- sería adivinar: un insumo en `litro` puede tener existencias capturadas en
-- litros o capturadas en ml por alguien que ya sabía del problema, y el sistema
-- no puede distinguirlos. Lo arregla una persona mirando su almacén.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

do $$
declare
  malos text;
begin
  select string_agg(format('%s (%s, %s)', i.nombre, i.unidad_base, o.giro), ', ')
    into malos
    from insumos i
    join organizaciones o on o.id = i.organizacion_id
   where o.giro in ('cafeteria', 'restaurante')
     and i.unidad_base not in ('g', 'ml', 'pieza');

  if malos is not null then
    raise exception
      'Hay insumos con unidad base inválida para su giro y hay que corregirlos a mano antes de aplicar esta migración: %', malos;
  end if;
end;
$$;

-- La misma función, con la condición ampliada a los giros que usan inventario
-- V6 (receta y peso). Se enumeran en vez de negar «todos menos tienda» porque
-- el día que entre `panaderia` la decisión tiene que ser explícita.
create or replace function insumo_unidad_base_valida() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  giro text;
begin
  select o.giro into giro from organizaciones o where o.id = new.organizacion_id;
  if giro in ('restaurante', 'cafeteria') and new.unidad_base not in ('g', 'ml', 'pieza') then
    raise exception
      'Un insumo de %  sólo se mide en g, ml o pieza (recibido: %)', giro, new.unidad_base
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function insumo_unidad_base_valida() is
  'F2-E4 §0.1 · La condición decía `giro = restaurante` y dejaba a cafetería sin protección: la leche en litros habría consumido mil veces menos.';
