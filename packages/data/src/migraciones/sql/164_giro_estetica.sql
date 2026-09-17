-- 164 · El giro `estetica` existe (A3 · arquetipo de servicios con cita).
--
-- ── Qué desbloquea ────────────────────────────────────────────────────────
-- `organizaciones_giro_check` lo escribió la 054 con CINCO valores, y ese check
-- es lo que hoy rechaza `pnpm db:alta-negocio --giro estetica`: no hay dónde
-- escribir el giro de un salón. Once modelos de «servicios con cita» —barbería,
-- uñas, spa, tatuajes, podología…— heredan de `estetica-salon`, y ninguno puede
-- darse de alta mientras la columna no lo admita. Con el giro, además, F-017 le
-- entrega su vocabulario: «estación» donde el restaurante dice mesa, «cita»
-- donde dice cuenta, «clienta» donde el sistema decía «el cliente».
--
-- ── Por qué el check se TIRA y se vuelve a escribir entero ─────────────────
-- Un `check` de lista cerrada no se extiende: se suelta y se declara completo.
-- Dejar fuera uno de los cinco anteriores convierte esta migración en la que
-- rompe a los cuatro negocios vivos con un 23514 al validar la tabla. Es la
-- misma mecánica que la 141 con `almacenes.tipo`, y por eso la lista se escribe
-- entera con un comentario por tanda en vez de añadirse con un `or`.
--
-- ── Lo que esta migración NO hace: la plantilla `salon` ────────────────────
-- El `FILE-MAP.md` del modelo declara «Plantilla destino: `salon` (nueva)» y eso
-- NO se implementa, ni aquí ni en el código. `PAQUETES` tiene TRES plantillas y
-- una estética usa `tienda`: es la que trae mostrador, caja e inventario, y la
-- que no trae sala. Una cuarta plantilla obligaría a declarar sus módulos, su
-- gate de comandos y su `check`, y el primer negocio que la estrenara sería el
-- único que la ejercita — con la de `tienda` estrenan lo que ya usan cuatro.
-- `organizaciones_paquete_compatible_con_giro` (058) reserva `restaurante` a los
-- giros de alimentos, así que una estética no puede acabar con sala ni por un
-- dato corrupto. Eso es correcto y se deja como está: un salón no tiene mesas.
--
-- ── El giro no es la plantilla, y por eso esto basta ───────────────────────
-- `plantillaDe('estetica', …)` cae en `tienda` con los tres nombres heredados y
-- con cualquier basura, porque `estetica` no está en `GIROS_DE_ALIMENTOS`. Lo
-- único que decide el giro es CÓMO HABLA el negocio, y eso vive en
-- `packages/domain/src/vocabulario/diccionarios.ts`, no en una fila: el
-- diccionario es la misma decisión de producto para los 78 modelos y tiene que
-- poder corregirse en un despliegue, no negocio por negocio (066 lo dice igual).
--
-- ── VA EN LA MISMA TANDA QUE LAS DEMÁS PENDIENTES ─────────────────────────
-- Miguel la autoriza junto con el resto del acople. No lleva la nota de «escrita
-- y no aplicada» porque el ejecutor aplica TODAS las pendientes o NINGUNA, en
-- una sola transacción: tratar una como excepción no aplica una menos, no aplica
-- nada. Su orden importa poco y su lugar sí: la poscondición de la 066 exige que
-- ningún `motivos_merma.giro` apunte fuera de los cinco de la 054, y corre
-- ANTES, así que la semilla de abajo no la puede romper.

-- ── 1 · El check de `organizaciones.giro`, con los seis ───────────────────
alter table organizaciones drop constraint organizaciones_giro_check;

alter table organizaciones
  add constraint organizaciones_giro_check check (
    giro in (
      -- 054 · los cinco con los que se separó el giro del paquete comercial.
      'tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante',
      -- 164 · el arquetipo de servicios con cita.
      'estetica'
    )
  );

comment on column organizaciones.giro is
  'Tipo de negocio: tienda, ferreteria, farmacia, cafeteria, restaurante o estetica. Determina reglas operativas propias y, con F-017, el vocabulario de las pantallas. Distinto de la plantilla: el giro dice qué NEGOCIO es, la plantilla dice qué COMPRÓ.';

-- ── 2 · Las mermas propias del giro (F-109 · 03-INVENTARIO §8) ────────────
--
-- El modelo documenta CUATRO motivos y aquí se siembran DOS. Los otros dos ya
-- son del tronco desde la 062 y volver a declararlos crearía dos claves para lo
-- mismo, que es como un reporte acaba contando la misma merma dos veces:
--
--   · «Caducado» → `caducado`. El tinte caduca y el decolorante activado caduca
--     en minutos, pero eso es CUÁNDO caduca, no otro motivo.
--   · «Diferencia de conteo» → `ajuste_conteo`. Y el modelo pide expresamente
--     que siga siendo neutro: *«nunca se llama robo; acusar en un motivo de
--     inventario es cómo se rompe un equipo de cinco personas»*.
--
-- Ninguno de los dos que sí se siembran es IMPUTABLE, y es una decisión con la
-- misma forma que la de la 085 y la 113: la mezcla sobrante es el 10 %-20 % de
-- todo el consumo de color —estructural, y va al costeo del servicio— y si una
-- persona tira el 30 % sistemáticamente eso es capacitación, no robo. El bote
-- que se quedó destapado es orden de trabajo. Marcarlos imputables llenaría el
-- reporte de robo con la operación normal del giro, y ahí deja de servir.
insert into motivos_merma (clave, etiqueta, giro, imputable) values
  ('mezcla_sobrante',    'Mezcla de color sobrante',      'estetica', false),
  ('secado_contaminado', 'Producto secado o contaminado', 'estetica', false)
on conflict (clave) do nothing;

-- ── 3 · Poscondición · el check admite los seis y sólo los seis ───────────
--
-- Se comprueba la DEFINICIÓN del check y no un insert de prueba: `organizaciones`
-- es la tabla de los cuatro negocios vivos y una fila de prueba ahí es
-- exactamente lo que F3-REGLAS §4.5 prohíbe. Lo que esto sí caza es el fallo
-- probable —reescribir la lista dejando un giro fuera, o colar uno de más— y lo
-- caza aquí, no en producción con un 23514.
do $$
declare
  definicion text;
  g          text;
  cuantos    int;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into definicion
    from pg_catalog.pg_constraint c
   where c.conrelid = 'organizaciones'::regclass
     and c.conname = 'organizaciones_giro_check';

  if definicion is null then
    raise exception
      'La 164 dejó organizaciones SIN check de giro: cualquier texto entraría en la columna'
      using errcode = 'check_violation';
  end if;

  foreach g in array
    array['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante', 'estetica']
  loop
    if position(quote_literal(g) in definicion) = 0 then
      raise exception 'El check de giro ya no admite «%»: al reescribirlo se quedó fuera', g
        using errcode = 'check_violation';
    end if;
  end loop;

  select count(*) into cuantos from regexp_matches(definicion, '''[a-z_]+''', 'g');

  if cuantos <> 6 then
    raise exception
      'El check de giro admite % valores y tienen que ser los 6 de GIROS', cuantos
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ── 4 · Poscondición · el salón tiene sus cuatro motivos de merma ─────────
--
-- Dos propios y dos del tronco. Se comprueban los CUATRO porque el daño no es
-- que falte la semilla: es que alguien renombre `caducado` o `ajuste_conteo` y
-- el salón se quede con la mitad de sus motivos sin que nada avise.
do $$
declare
  propios int;
  del_tronco int;
begin
  select count(*) into propios
    from motivos_merma
   where giro = 'estetica' and activo;

  if propios <> 2 then
    raise exception
      'La semilla dejó % motivo(s) de merma de estética y tienen que ser 2', propios
      using errcode = 'check_violation';
  end if;

  select count(*) into del_tronco
    from motivos_merma
   where clave in ('caducado', 'ajuste_conteo') and giro is null and activo;

  if del_tronco <> 2 then
    raise exception
      'Los 2 motivos del tronco que reutiliza la estética ya no están (encontré %)', del_tronco
      using errcode = 'check_violation';
  end if;
end;
$$;
