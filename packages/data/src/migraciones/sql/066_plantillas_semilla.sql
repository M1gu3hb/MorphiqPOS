-- 066 · La semilla de las cinco plantillas, consolidada.
--
-- ── Por qué una y no cinco ─────────────────────────────────────────────────
-- La documentación traía cinco migraciones —`069_plantilla_restaurante`,
-- `080_plantilla_cafeteria`, `082_plantilla_tienda`, `095_plantilla_ferreteria`
-- y `112_plantilla_salon`—, una por carpeta. La reconciliación del catálogo las
-- consolidó aquí por dos razones:
--
--   1. Una plantilla es una FILA DE UN CATÁLOGO. Cinco migraciones que insertan
--      un puñado de filas cada una reparten en cinco archivos una decisión
--      (F-015) que es del tronco.
--   2. `cafeteria` no cabía en su rango: D-08 le da diez números (080–089) y
--      tenía once migraciones. Consolidar ésta liberó exactamente el hueco.
--
-- Efecto lateral bueno: la condición de la decisión pendiente **P-04** —no
-- aplicar un cambio de plantilla sin respaldo y con los negocios cerrados— pasa
-- a cubrir las cinco de golpe, en vez de estar repetida en cinco archivos.
--
-- ── Qué siembra, y qué NO ──────────────────────────────────────────────────
-- Siembra lo que es DATO: los motivos de merma propios de cada giro (F-109 como
-- estrategia). No siembra los módulos por plantilla ni el diccionario de
-- vocabulario: ésos viven en el código —`plantillas.ts` y `diccionarios.ts`—
-- porque son la misma decisión de producto para los 78 modelos y tienen que
-- poder corregirse en un despliegue, no negocio por negocio.
--
-- ── APLICADA EN LA FASE 3 (acople) ─────────────────────────────
--
-- Aqui decia «ESTA MIGRACION NO SE APLICA EN LA FASE 2», y era cierto: la
-- decision P-04 pedia aplicarla con respaldo y con los negocios cerrados. P-04
-- esta RESUELTA (F3-REGLAS §2): Miguel autoriza el renombre y el acople la
-- aplica. La nota se retira porque el ejecutor aplica TODAS las pendientes o
-- NINGUNA, en una sola transaccion: tratar una como excepcion no aplica una
-- menos, no aplica nada.

-- ── Restaurante y cafetería · la merma de una cocina ───────────────────────
--
-- La calibración es un EVENTO DIARIO DE APERTURA con gramaje conocido, y la
-- bebida rehecha consume el insumo DOS VECES después de cobrada. Ninguna de las
-- dos es «merma genérica con motivo»: son la razón por la que F-156 existe.
insert into motivos_merma (clave, etiqueta, giro, imputable) values
  ('calibracion',     'Calibración del molino',      'cafeteria',   false),
  ('vaporizado',      'Vaporizado sobrante',         'cafeteria',   false),
  ('bebida_rehecha',  'Bebida rehecha',              'cafeteria',   true),
  ('caducidad_leche', 'Leche caducada',              'cafeteria',   false),
  ('platillo_rehecho','Platillo rehecho',            'restaurante', true),
  ('prueba_cocina',   'Prueba o ajuste de cocina',   'restaurante', false),
  ('consumo_personal','Consumo de personal',         'restaurante', false)
on conflict (clave) do nothing;

-- ── Tienda y ferretería · la merma de un anaquel ───────────────────────────
--
-- `caducado_sin_lote` es F-146: la tiendita no maneja lote, maneja «la leche que
-- llegó el jueves». `retazo_invendible` es F-150: los dos metros de cable que
-- quedaron del rollo, que existen físicamente, valen dinero a costo y no se le
-- pueden vender a nadie.
insert into motivos_merma (clave, etiqueta, giro, imputable) values
  ('caducado_sin_lote',  'Caducado (fecha de entrada)', 'tienda',     false),
  ('empaque_dañado',     'Empaque dañado en anaquel',   'tienda',     false),
  ('retazo_invendible',  'Retazo de corte invendible',  'ferreteria', false),
  ('corte_mal_medido',   'Error de medida en el corte', 'ferreteria', true),
  ('herramienta_dañada', 'Herramienta dañada en renta', 'ferreteria', true)
on conflict (clave) do nothing;

-- ── Poscondición ───────────────────────────────────────────────────────────
--
-- Un motivo de giro que apunte a un giro inexistente no lo usaría nadie, y
-- nadie se enteraría: sería una semilla muerta. Se comprueba aquí.
do $$
declare
  huerfanos int;
begin
  select count(*) into huerfanos
    from motivos_merma
   where giro is not null
     and giro not in ('tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante');

  if huerfanos > 0 then
    raise exception
      'La semilla dejó % motivo(s) de merma apuntando a un giro que no existe', huerfanos
      using errcode = 'check_violation';
  end if;
end;
$$;
