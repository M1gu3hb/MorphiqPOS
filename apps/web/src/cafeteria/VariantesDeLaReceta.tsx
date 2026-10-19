'use client';

import {
  Aviso,
  Cifra,
  Dinero,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Layers } from 'lucide-react';

import type { InsumoDisponible, LineaDeReceta } from './receta-de-barra.ts';
import { semaforoDe } from './semaforo-de-margen.ts';
import {
  variantesDeLaReceta,
  type CostoDeVariante,
  type OpcionDeLaBebida,
  type VarianteDeReceta,
} from './variantes-de-receta.ts';

/**
 * LA TABLA DE VARIANTES de la bebida: cuánto cuesta y cuánto deja con cada leche y cada
 * tamaño (C.10 de la 2.4). La cuenta es la de `variantesDeLaReceta`, con la misma
 * sustitución y el mismo escalado con los que el cobro descuenta el inventario.
 *
 * Va DEBAJO de la receta y no en otra pantalla: la decisión que ayuda a tomar —«¿la avena
 * se cobra $10 o $12?»— se toma con la receta a la vista.
 */
export interface VariantesDeLaRecetaProps {
  readonly lineas: readonly LineaDeReceta[];
  /** `null` mientras se leen; la lista vacía es «esta bebida no tiene opciones». */
  readonly opciones: readonly OpcionDeLaBebida[] | null;
  readonly falloDeOpciones: string | null;
  readonly insumos: readonly InsumoDisponible[];
  readonly precioCentavos: number | null;
}

export function VariantesDeLaReceta({
  lineas,
  opciones,
  falloDeOpciones,
  insumos,
  precioCentavos,
}: VariantesDeLaRecetaProps) {
  if (falloDeOpciones !== null) {
    // La receta sigue sirviendo sin esto: se dice qué falta, no se tapa la pantalla.
    return (
      <Aviso tono="atencion" titulo="No se pudieron leer las opciones de esta bebida.">
        {falloDeOpciones} La receta y su costo de arriba no dependen de ellas.
      </Aviso>
    );
  }
  if (opciones === null) return <EsqueletoDeLista filas={3} />;

  const variantes = variantesDeLaReceta(lineas, opciones, insumos, precioCentavos);

  const columnas: readonly ColumnaDeTabla<VarianteDeReceta>[] = [
    {
      clave: 'opcion',
      titulo: 'Opción',
      celda: (v) => (
        <span className="flex flex-col">
          <span className="font-medium">{v.opcion}</span>
          <span className="text-xs text-texto-sutil">{v.grupo}</span>
        </span>
      ),
    },
    {
      clave: 'cambia',
      titulo: 'Qué cambia en la receta',
      desde: 'md',
      celda: (v) =>
        v.queCambia ?? <span className="text-texto-sutil">nada: es la receta base</span>,
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      celda: (v) =>
        v.precioCentavos === null ? (
          <span className="text-texto-sutil">—</span>
        ) : (
          <Dinero centavos={v.precioCentavos} tamano="sm" />
        ),
    },
    {
      clave: 'aqui',
      titulo: 'Aquí',
      numerica: true,
      celda: (v) => <CostoYMargen costo={v.aqui} />,
    },
    {
      clave: 'llevar',
      titulo: 'Para llevar',
      numerica: true,
      celda: (v) => <CostoYMargen costo={v.llevar} />,
    },
  ];

  return (
    <section aria-labelledby="variantes-titulo" className="flex flex-col gap-(--espacio-2)">
      <h3 id="variantes-titulo" className="text-base font-semibold">
        Con cada opción
      </h3>
      <Tabla
        etiqueta="Costo y margen de cada opción"
        columnas={columnas}
        filas={variantes}
        claveDe={(v) => v.opcionId}
        alto="max-h-80"
        vacio={
          <Vacio
            icono={<Layers />}
            titulo="Ninguna opción cambia esta receta."
            explicacion="Si la leche o el tamaño deben cambiarla, di en «La cambia» qué línea sustituye cada grupo: la leche entera, el grupo «Leche»."
          />
        }
      />
    </section>
  );
}

/** El costo de la variante y su margen con semáforo; «—» si falta el costo de algo. */
function CostoYMargen({ costo }: { readonly costo: CostoDeVariante }) {
  if (costo.centavos === null) {
    return <span className="text-xs text-texto-sutil">falta el costo de un insumo</span>;
  }
  if (costo.margen === null) return <Dinero centavos={costo.centavos} tamano="sm" />;
  const semaforo = semaforoDe(costo.margen);
  return (
    <span className="flex flex-col items-end gap-(--espacio-1)">
      <Dinero centavos={costo.centavos} tamano="sm" />
      <span
        className={`flex items-center gap-(--espacio-1) rounded-md px-(--espacio-2) text-xs font-medium ${semaforo.clase}`}
      >
        <semaforo.Icono aria-hidden="true" className="size-3.5" />
        <Cifra valor={costo.margen} unidad="%" tamano="sm" />
        <span className="sr-only">{semaforo.palabra}</span>
      </span>
    </span>
  );
}
