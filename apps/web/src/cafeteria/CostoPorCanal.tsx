'use client';

import { Cifra, Dinero, type TamanoDeDinero } from '@morphiqpos/ui/sistema';

import { margenDe, type CostoDeCanal } from './receta-de-barra.ts';
import { semaforoDe } from './semaforo-de-margen.ts';

/**
 * LO QUE CUESTA LA BEBIDA EN CADA CANAL, y lo que deja: el margen es lo que va grande
 * (`04-INTERFAZ` de cafetería · Recetas). Es una pieza de `Recetas`: recibe el costo ya
 * sumado y sólo lo pinta.
 */

/** Un importe que puede no saberse: «—», nunca $0.00 en su lugar. */
export function ImporteSiSeSabe({
  centavos,
  tamano,
  className,
}: {
  readonly centavos: number | null;
  readonly tamano: TamanoDeDinero;
  readonly className?: string;
}) {
  if (centavos === null) return <span className="text-texto-sutil">—</span>;
  return <Dinero centavos={centavos} tamano={tamano} className={className} />;
}

/** Por qué un canal no tiene margen, con lo que falta para tenerlo. */
function sinMargenPorque(sinCosto: number): string {
  if (sinCosto === 0) return 'Sin precio de venta no hay margen que medir.';
  const cuantos = sinCosto === 1 ? 'un ingrediente' : `${String(sinCosto)} ingredientes`;
  return `Falta el costo de ${cuantos}: sin él no hay costo ni margen que medir.`;
}

/** Lo que cuesta en cada canal, y lo que deja: el margen es lo que va grande. */
export function CostoPorCanal({
  precio,
  aqui,
  llevar,
}: {
  readonly precio: number | null;
  readonly aqui: CostoDeCanal;
  readonly llevar: CostoDeCanal;
}) {
  return (
    <div className="flex flex-col gap-(--espacio-2)">
      <div className="grid grid-cols-2 gap-(--espacio-4)">
        <MargenDeCanal etiqueta="Aquí cuesta" costo={aqui} precio={precio} />
        <MargenDeCanal etiqueta="Para llevar cuesta" costo={llevar} precio={precio} />
      </div>
      <p className="text-sm text-texto-sutil">
        La diferencia es el empaque. Cargarlo siempre infla el costo de lo que se toma aquí; no
        cargarlo nunca regala cinco pesos por bebida.
      </p>
    </div>
  );
}

/**
 * El costo y el margen de un canal. Con una sola línea sin costo NO hay costo ni
 * margen: la suma de las que sí lo tienen es un total que no es total, y su margen
 * saldría de «sano» sobre una bebida que cuesta más.
 */
function MargenDeCanal({
  etiqueta,
  costo,
  precio,
}: {
  readonly etiqueta: string;
  readonly costo: CostoDeCanal;
  readonly precio: number | null;
}) {
  const completo = costo.sinCosto === 0;
  const margen = completo && precio !== null ? margenDe(precio, costo.centavos) : null;
  const semaforo = margen === null ? null : semaforoDe(margen);
  return (
    <div className="flex flex-col gap-(--espacio-1)">
      <p className="text-sm text-texto-sutil">
        {etiqueta}{' '}
        <ImporteSiSeSabe
          centavos={completo ? costo.centavos : null}
          tamano="lg"
          className="font-semibold text-texto"
        />
      </p>
      {margen === null || semaforo === null ? (
        <p className="text-sm text-texto-sutil">{sinMargenPorque(costo.sinCosto)}</p>
      ) : (
        <>
          <p className="flex items-baseline gap-(--espacio-2)">
            <Cifra valor={margen} unidad="%" tamano="total" className="font-bold" />
            <span className="text-sm text-texto-sutil">de margen</span>
          </p>
          <p
            className={`flex w-fit items-center gap-(--espacio-1) rounded-md px-(--espacio-2) py-(--espacio-1) text-xs font-medium ${semaforo.clase}`}
          >
            <semaforo.Icono aria-hidden="true" className="size-3.5" />
            {semaforo.palabra}
          </p>
        </>
      )}
    </div>
  );
}
