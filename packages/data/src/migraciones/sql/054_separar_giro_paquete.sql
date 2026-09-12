-- 054 · El giro del negocio y el paquete comercial son ejes distintos.

alter table organizaciones add column giro text;

-- Hasta esta migración `paquete` guardaba el giro. Se conserva antes de
-- transformar esa columna al vocabulario comercial.
update organizaciones set giro = paquete;

alter table organizaciones
  alter column giro set not null,
  alter column giro set default 'tienda',
  add constraint organizaciones_giro_check
    check (giro in ('tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'));

alter table organizaciones drop constraint organizaciones_paquete_check;

update organizaciones
set paquete = case
  when giro in ('cafeteria', 'restaurante') then 'restaurante_pro'
  else 'operativo'
end;

alter table organizaciones
  alter column paquete set default 'esencial',
  add constraint organizaciones_paquete_check
    check (paquete in ('esencial', 'operativo', 'restaurante_pro')),
  add constraint organizaciones_paquete_compatible_con_giro
    check (paquete <> 'restaurante_pro' or giro in ('cafeteria', 'restaurante'));

comment on column organizaciones.giro is
  'Tipo de negocio. Determina reglas operativas propias de tienda, farmacia, cafetería o restaurante.';
comment on column organizaciones.paquete is
  'Paquete comercial contratado. Gobierna módulos y comandos permitidos en el servidor.';

-- La 046 consultaba `paquete` porque entonces esa columna también era el giro.
create or replace function insumo_unidad_base_valida() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  giro text;
begin
  select o.giro into giro from organizaciones o where o.id = new.organizacion_id;
  if giro = 'restaurante' and new.unidad_base not in ('g', 'ml', 'pieza') then
    raise exception
      'Un insumo de restaurante sólo se mide en g, ml o pieza (recibido: %)', new.unidad_base
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
