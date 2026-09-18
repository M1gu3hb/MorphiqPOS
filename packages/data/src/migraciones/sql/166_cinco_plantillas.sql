-- 166 · Las plantillas pasan de TRES a CINCO.
--
-- ── Qué estaba mal ─────────────────────────────────────────────────────────
-- De las tres plantillas, DOS ERAN LA MISMA: `tienda` y `cafeteria` tenían los
-- mismos 28 módulos, uno por uno. Y ninguno de los 38 módulos nombraba agenda,
-- cita, comisión, expediente, cotización, corte de material ni crédito — que es
-- lo que una estética y una ferretería HACEN todo el día. El resultado es que
-- dos de los cinco modelos construidos no tenían plantilla propia: la ferretería
-- operaba con la de una tiendita y la estética también.
--
-- `MODULOS_POR_PLANTILLA` ya reparte los 62 módulos entre las cinco, y esta
-- migración abre la columna para que se puedan guardar.
--
-- ── Qué cambia para los negocios vivos ─────────────────────────────────────
-- Ferretería La Broca pasa de `tienda` a `ferreteria`. Sólo GANA: la plantilla
-- de ferretería es un superconjunto estricto de la de tienda —le añade
-- mostrador por medida, corte de material, cotizaciones, crédito, trabajos y
-- facturación— y no le quita un solo módulo. Los otros tres negocios no se
-- mueven: su giro ya tenía plantilla propia.
--
-- ── El `check` de compatibilidad, reescrito ────────────────────────────────
-- El de la 058 decía «`restaurante` sólo en giro de alimentos». Ahora hay dos
-- plantillas de alimentos y tres de mostrador, así que la regla se escribe
-- entera y en los dos sentidos, y es la MISMA que `paquetePermitidoParaGiro`
-- en `packages/contracts/src/comandos/ambito.ts`: la pantalla no puede ofrecer
-- lo que el POST rechaza, y ésa es justo la incoherencia que costó esta fase.

-- ── 1 · La columna admite las cinco ───────────────────────────────────────
alter table organizaciones drop constraint organizaciones_paquete_check;

alter table organizaciones
  add constraint organizaciones_paquete_check check (
    paquete in (
      -- 058 · el renombre de D-01.
      'tienda', 'cafeteria', 'restaurante',
      -- 166 · las dos que faltaban, y por las que dos modelos no tenían la suya.
      'ferreteria', 'estetica'
    )
  );

-- ── 2 · Cada negocio, a la plantilla de su giro ───────────────────────────
--
-- Sólo se mueve quien está en la plantilla GENÉRICA de mostrador teniendo una
-- propia. Quien ya eligió otra cosa —Café Jacaranda tiene contratado el paquete
-- de restaurante aunque su giro sea cafetería— no se toca: el giro dice qué
-- NEGOCIO es, la plantilla dice qué COMPRÓ, y sólo la segunda se cambia en
-- caliente.
update organizaciones
   set paquete = giro
 where giro in ('ferreteria', 'estetica')
   and paquete = 'tienda';

-- ── 3 · La compatibilidad giro ↔ plantilla, entera ────────────────────────
alter table organizaciones drop constraint organizaciones_paquete_compatible_con_giro;

alter table organizaciones
  add constraint organizaciones_paquete_compatible_con_giro check (
    case
      -- Sala y barra sólo donde hay cocina.
      when paquete in ('restaurante', 'cafeteria') then giro in ('cafeteria', 'restaurante')
      -- Y las tres de mostrador, sólo donde NO la hay. Un restaurante con la
      -- plantilla de tienda perdería mesas, mesero y comanda sin que nadie lo
      -- decidiera.
      else giro not in ('cafeteria', 'restaurante')
    end
  );

-- ── 4 · Poscondición · el check admite las cinco, y sólo las cinco ────────
--
-- Se comprueba la DEFINICIÓN del constraint y no con un insert de prueba:
-- `organizaciones` es la tabla de los cuatro negocios vivos y una fila de
-- prueba ahí es lo que F2.3-REGLAS §4.5 prohíbe.
do $$
declare
  definicion text;
  p          text;
  cuantos    int;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into definicion
    from pg_catalog.pg_constraint c
   where c.conrelid = 'organizaciones'::regclass
     and c.conname = 'organizaciones_paquete_check';

  if definicion is null then
    raise exception 'La 166 dejó organizaciones SIN check de paquete'
      using errcode = 'check_violation';
  end if;

  foreach p in array array['tienda', 'cafeteria', 'restaurante', 'ferreteria', 'estetica']
  loop
    if position(quote_literal(p) in definicion) = 0 then
      raise exception 'El check de paquete ya no admite «%»: al reescribirlo se quedó fuera', p
        using errcode = 'check_violation';
    end if;
  end loop;

  select count(*) into cuantos from regexp_matches(definicion, '''[a-z_]+''', 'g');

  if cuantos <> 5 then
    raise exception 'El check de paquete admite % valores y tienen que ser las 5 plantillas', cuantos
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ── 5 · Poscondición · ningún negocio se quedó con una plantilla ajena ────
--
-- El daño que esto caza no es el `check` mal escrito: es que el `update` de
-- arriba se quede corto y una ferretería siga operando con la plantilla de una
-- tiendita, que es exactamente lo que esta migración viene a arreglar.
do $$
declare
  descolgados int;
  incompatibles int;
begin
  select count(*) into descolgados
    from organizaciones
   where giro in ('ferreteria', 'estetica')
     and paquete <> giro;

  if descolgados > 0 then
    raise exception
      '% negocio(s) de ferretería o estética siguen sin su plantilla propia', descolgados
      using errcode = 'check_violation';
  end if;

  select count(*) into incompatibles
    from organizaciones
   where (paquete in ('restaurante', 'cafeteria')) <> (giro in ('cafeteria', 'restaurante'));

  if incompatibles > 0 then
    raise exception
      '% negocio(s) con plantilla incompatible con su giro', incompatibles
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on column organizaciones.paquete is
  'La PLANTILLA de negocio: tienda, cafeteria, restaurante, ferreteria o estetica. Decide qué módulos trae, qué menú se pinta y en qué pantalla abre. Distinta del giro: el giro dice qué NEGOCIO es y no se cambia en caliente; la plantilla dice qué COMPRÓ y se cambia desde Configuración.';
