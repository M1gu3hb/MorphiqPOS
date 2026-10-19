'use client';

import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Users } from 'lucide-react';

import { useVocabulario } from '~/cliente/vocabulario';

import { minutosConFactor, type AsignacionEditable } from './quien-da-el-servicio.ts';

/**
 * QUIÉN LO DA · la pieza del catálogo de servicios donde se asigna cada servicio a cada
 * profesional, con su tiempo y su precio (F-423; C.10 de la 2.4). Sin marcar a nadie el
 * servicio existe en el catálogo y la agenda no lo deja agendar: se dice aquí.
 */
export interface QuienDaElServicioProps {
  /** `null` mientras se leen. */
  readonly asignaciones: readonly AsignacionEditable[] | null;
  readonly falloDeLectura: string | null;
  /** Los minutos que ocupan a la persona, para enseñar los de cada una con su factor. */
  readonly minutosActivos: number;
  readonly alCambiar: (asignaciones: readonly AsignacionEditable[]) => void;
}

export function QuienDaElServicio({
  asignaciones,
  falloDeLectura,
  minutosActivos,
  alCambiar,
}: QuienDaElServicioProps) {
  const voc = useVocabulario();
  if (falloDeLectura !== null) {
    return (
      <Aviso tono="atencion" titulo="No se pudo leer quién da este servicio.">
        {falloDeLectura} Guardar ahora no cambia a quién se le asigna.
      </Aviso>
    );
  }
  if (asignaciones === null) return <EsqueletoDeLista filas={3} />;

  const cambiar = (profesionalId: string, cambio: Partial<AsignacionEditable>): void => {
    alCambiar(
      asignaciones.map((a) => (a.profesionalId === profesionalId ? { ...a, ...cambio } : a)),
    );
  };
  const nadie = asignaciones.every((a) => !a.da);

  const columnas: readonly ColumnaDeTabla<AsignacionEditable>[] = [
    {
      clave: 'da',
      titulo: 'Lo da',
      celda: (a) => (
        <label className="flex items-center gap-(--espacio-2)">
          <input
            type="checkbox"
            className="size-5 accent-primario"
            checked={a.da}
            onChange={(evento) => {
              cambiar(a.profesionalId, { da: evento.target.checked });
            }}
          />
          <span className="font-medium">{a.nombre}</span>
        </label>
      ),
    },
    {
      clave: 'tiempo',
      titulo: 'Su tiempo',
      celda: (a) => (
        <span className="flex items-center gap-(--espacio-2)">
          <Input
            aria-label={`Tiempo de ${a.nombre}, en por ciento del catálogo`}
            inputMode="decimal"
            disabled={!a.da}
            className="w-20 text-right font-numeros tabular-nums"
            value={a.factorPorciento}
            onChange={(evento) => {
              cambiar(a.profesionalId, { factorPorciento: evento.target.value });
            }}
          />
          <span className="text-sm text-texto-sutil">%</span>
        </span>
      ),
    },
    {
      clave: 'minutos',
      titulo: 'Le ocupa',
      numerica: true,
      desde: 'sm',
      celda: (a) => (
        <Cifra
          valor={a.da ? minutosConFactor(minutosActivos, a.factorPorciento) : null}
          unidad="min"
          tamano="sm"
        />
      ),
    },
    {
      clave: 'precio',
      titulo: 'Su precio',
      desde: 'md',
      celda: (a) => (
        <CampoDeDinero
          aria-label={`Precio de ${a.nombre}; vacío es el del catálogo`}
          className="w-36"
          centavos={a.precioCentavos}
          alCambiar={(centavos) => {
            cambiar(a.profesionalId, { precioCentavos: centavos });
          }}
        />
      ),
    },
  ];

  return (
    <section aria-labelledby="quien-lo-da-titulo" className="flex flex-col gap-(--espacio-2)">
      <h3 id="quien-lo-da-titulo" className="font-medium">
        Quién lo da
      </h3>
      <p className="max-w-prose text-sm text-texto-sutil">
        El tiempo es respecto al del catálogo: 80 % es más rápida, 110 % más lenta. El precio vacío
        cobra el del catálogo.
      </p>
      {nadie && asignaciones.length > 0 ? (
        <Aviso tono="atencion" titulo={`Nadie lo da: la agenda no deja agendarlo.`}>
          Marca a quién lo hace.
        </Aviso>
      ) : null}
      <Tabla
        etiqueta="Quién lo da"
        columnas={columnas}
        filas={asignaciones}
        claveDe={(a) => a.profesionalId}
        vacio={
          <Vacio
            icono={<Users />}
            titulo={`Todavía no hay ${voc.plural('responsable')} dadas de alta.`}
            explicacion="Un servicio se agenda con alguien: primero da de alta a tu equipo."
          />
        }
      />
    </section>
  );
}
