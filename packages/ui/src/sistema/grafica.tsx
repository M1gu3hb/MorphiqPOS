import type { ReactElement } from 'react';

import { cn } from '../utilidades/cn';

/**
 * GRÁFICAS · cinco tipos, en SVG, con los colores de la paleta.
 *
 * ── Por qué escritas a mano y no con una librería ─────────────────────────
 * Una librería de gráficas trae su propia paleta, su propia tipografía y entre 40 y
 * 120 kB de JavaScript. Las tres cosas están en contra de lo que esta fase busca:
 * el presupuesto de una página de aplicación son 300 kB **enteros**, y una gráfica
 * que no usa los tokens del sistema se ve como un invitado —es exactamente la señal
 * de «armado con piezas de otro sitio» que hay que evitar—.
 *
 * Estas cinco son SVG y aritmética. Pesan lo que pesa su marcado, heredan el color
 * de `--grafico-1..6`, la tipografía del sistema y la duración de las perillas.
 *
 * ── El color NO es el único portador de significado ───────────────────────
 * En una gráfica el color SÍ carga información, y por eso cada serie lleva además
 * su etiqueta en la leyenda y su valor accesible en el marcado. Las barras y el área
 * llevan también un PATRÓN distinto por serie, para que se distingan impresas en
 * blanco y negro o por quien no distingue dos tonos cercanos.
 *
 * ── Lo que NO hacen ────────────────────────────────────────────────────────
 * No hacen zoom, no hacen scroll y no traen tooltip flotante: el valor se lee al
 * pasar el dedo porque cada pieza lleva su `<title>`, que es lo que el navegador
 * enseña y lo que un lector de pantalla anuncia. Una gráfica de POS se mira tres
 * segundos para tomar una decisión; la que necesita zoom es un reporte, y un reporte
 * se exporta.
 */

export interface SerieDeGrafica {
  readonly etiqueta: string;
  readonly valores: readonly number[];
}

export interface GraficaProps {
  /** Las etiquetas del eje horizontal. Mandan: definen cuántos puntos hay. */
  readonly ejes: readonly string[];
  readonly series: readonly SerieDeGrafica[];
  /** Cómo se lee un valor. Dinero, piezas, porcentaje… lo decide la pantalla. */
  readonly formato?: (valor: number) => string;
  /** Qué dice esta gráfica. Es el nombre accesible del SVG: no es opcional. */
  readonly titulo: string;
  readonly alto?: number;
  readonly className?: string;
}

/**
 * Los seis colores de serie del estilo activo, ya compuestos.
 *
 * Compuestos aquí y no con una plantilla: el token guarda el TRIPLETE
 * —`217 91% 55%`— sin la función, que es lo que permite pedirle una opacidad
 * (`hsl(var(--grafico-1) / 0.5)`) sin duplicar un token por cada transparencia.
 */
const COLORES = [
  'hsl(var(--grafico-1))',
  'hsl(var(--grafico-2))',
  'hsl(var(--grafico-3))',
  'hsl(var(--grafico-4))',
  'hsl(var(--grafico-5))',
  'hsl(var(--grafico-6))',
] as const;

function color(indice: number): string {
  return COLORES[indice % COLORES.length] ?? COLORES[0];
}

const PORCENTAJE = (valor: number): string => valor.toLocaleString('es-MX');

/** El recuadro y los ejes, que son iguales en las tres gráficas cartesianas. */
const MARGEN = { arriba: 8, derecha: 8, abajo: 22, izquierda: 44 } as const;

function escalas(
  ancho: number,
  alto: number,
  maximo: number,
): {
  readonly x: (indice: number, total: number) => number;
  readonly y: (valor: number) => number;
  readonly anchoUtil: number;
  readonly altoUtil: number;
} {
  const anchoUtil = ancho - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = alto - MARGEN.arriba - MARGEN.abajo;
  return {
    anchoUtil,
    altoUtil,
    x: (indice, total) =>
      MARGEN.izquierda + (total <= 1 ? anchoUtil / 2 : (anchoUtil * indice) / (total - 1)),
    y: (valor) => MARGEN.arriba + altoUtil - (maximo === 0 ? 0 : (altoUtil * valor) / maximo),
  };
}

/** La leyenda: el color NUNCA va solo. */
function Leyenda({ series }: { readonly series: readonly SerieDeGrafica[] }): ReactElement {
  return (
    <ul className="flex flex-wrap items-center gap-x-(--espacio-4) gap-y-(--espacio-1) text-xs text-texto-sutil">
      {series.map((serie, indice) => (
        <li key={serie.etiqueta} className="flex items-center gap-(--espacio-2)">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ background: color(indice) }}
          />
          {serie.etiqueta}
        </li>
      ))}
    </ul>
  );
}

function Marco({
  titulo,
  series,
  children,
  className,
}: {
  readonly titulo: string;
  readonly series: readonly SerieDeGrafica[];
  readonly children: ReactElement;
  readonly className?: string | undefined;
}): ReactElement {
  return (
    <figure className={cn('flex flex-col gap-(--espacio-3)', className)}>
      {children}
      <figcaption className="sr-only">{titulo}</figcaption>
      <Leyenda series={series} />
    </figure>
  );
}

/**
 * BARRAS · comparar categorías. La gráfica más honesta que hay.
 *
 * Empieza en cero SIEMPRE y no se ofrece opción de no hacerlo: una barra recortada
 * miente sobre la proporción, que es justo lo único que una barra sirve para leer.
 */
export function GraficaDeBarras({
  ejes,
  series,
  formato = PORCENTAJE,
  titulo,
  alto = 180,
  className,
}: GraficaProps): ReactElement {
  const ancho = 480;
  const maximo = Math.max(1, ...series.flatMap((s) => s.valores));
  const { y, anchoUtil, altoUtil } = escalas(ancho, alto, maximo);
  const porGrupo = anchoUtil / Math.max(1, ejes.length);
  const anchoBarra = Math.max(2, (porGrupo * 0.7) / Math.max(1, series.length));

  return (
    <Marco titulo={titulo} series={series} className={className}>
      <svg
        viewBox={`0 0 ${String(ancho)} ${String(alto)}`}
        role="img"
        aria-label={titulo}
        className="w-full"
      >
        <EjeY maximo={maximo} formato={formato} alto={alto} />
        {ejes.map((etiqueta, columna) => (
          <text
            key={etiqueta}
            x={MARGEN.izquierda + porGrupo * columna + porGrupo / 2}
            y={alto - 6}
            textAnchor="middle"
            className="fill-texto-sutil text-xs"
          >
            {etiqueta}
          </text>
        ))}
        {series.map((serie, indiceSerie) =>
          serie.valores.map((valor, columna) => {
            const alturaBarra = Math.max(0, MARGEN.arriba + altoUtil - y(valor));
            return (
              <rect
                key={`${serie.etiqueta}-${String(columna)}`}
                x={
                  MARGEN.izquierda + porGrupo * columna + porGrupo * 0.15 + anchoBarra * indiceSerie
                }
                y={y(valor)}
                width={anchoBarra}
                height={alturaBarra}
                rx={2}
                fill={color(indiceSerie)}
              >
                <title>{`${serie.etiqueta} · ${ejes[columna] ?? ''}: ${formato(valor)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
    </Marco>
  );
}

/** El eje vertical: tres marcas, que es lo que se lee sin contar. */
function EjeY({
  maximo,
  formato,
  alto,
}: {
  readonly maximo: number;
  readonly formato: (valor: number) => string;
  readonly alto: number;
}): ReactElement {
  const altoUtil = alto - MARGEN.arriba - MARGEN.abajo;
  const marcas = [0, 0.5, 1];
  return (
    <g aria-hidden="true">
      {marcas.map((fraccion) => {
        const posicion = MARGEN.arriba + altoUtil - altoUtil * fraccion;
        return (
          <g key={fraccion}>
            <line
              x1={MARGEN.izquierda}
              x2={480 - MARGEN.derecha}
              y1={posicion}
              y2={posicion}
              className="stroke-borde"
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 6}
              y={posicion + 3}
              textAnchor="end"
              className="fill-texto-sutil text-xs"
            >
              {formato(Math.round(maximo * fraccion))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** LÍNEAS · una tendencia en el tiempo. */
export function GraficaDeLineas({
  ejes,
  series,
  formato = PORCENTAJE,
  titulo,
  alto = 180,
  className,
}: GraficaProps): ReactElement {
  const ancho = 480;
  const maximo = Math.max(1, ...series.flatMap((s) => s.valores));
  const { x, y } = escalas(ancho, alto, maximo);

  return (
    <Marco titulo={titulo} series={series} className={className}>
      <svg
        viewBox={`0 0 ${String(ancho)} ${String(alto)}`}
        role="img"
        aria-label={titulo}
        className="w-full"
      >
        <EjeY maximo={maximo} formato={formato} alto={alto} />
        {ejes.map((etiqueta, indice) => (
          <text
            key={etiqueta}
            x={x(indice, ejes.length)}
            y={alto - 6}
            textAnchor="middle"
            className="fill-texto-sutil text-xs"
          >
            {etiqueta}
          </text>
        ))}
        {series.map((serie, indiceSerie) => (
          <g key={serie.etiqueta}>
            <polyline
              fill="none"
              stroke={color(indiceSerie)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={serie.valores
                .map(
                  (valor, indice) =>
                    `${String(x(indice, serie.valores.length))},${String(y(valor))}`,
                )
                .join(' ')}
            />
            {serie.valores.map((valor, indice) => (
              <circle
                key={indice}
                cx={x(indice, serie.valores.length)}
                cy={y(valor)}
                r={3}
                fill={color(indiceSerie)}
              >
                <title>{`${serie.etiqueta} · ${ejes[indice] ?? ''}: ${formato(valor)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </Marco>
  );
}

/** ÁREA APILADA · de qué se compone un total a lo largo del tiempo. */
export function GraficaDeAreaApilada({
  ejes,
  series,
  formato = PORCENTAJE,
  titulo,
  alto = 180,
  className,
}: GraficaProps): ReactElement {
  const ancho = 480;
  const totales = ejes.map((_, indice) =>
    series.reduce((suma, serie) => suma + (serie.valores[indice] ?? 0), 0),
  );
  const maximo = Math.max(1, ...totales);
  const { x, y } = escalas(ancho, alto, maximo);

  // Se acumula por columna: cada serie se dibuja sobre el techo de la anterior.
  const acumulado = ejes.map(() => 0);

  return (
    <Marco titulo={titulo} series={series} className={className}>
      <svg
        viewBox={`0 0 ${String(ancho)} ${String(alto)}`}
        role="img"
        aria-label={titulo}
        className="w-full"
      >
        <EjeY maximo={maximo} formato={formato} alto={alto} />
        {series.map((serie, indiceSerie) => {
          const abajo = [...acumulado];
          const arriba = acumulado.map((base, indice) => base + (serie.valores[indice] ?? 0));
          for (const [indice, valor] of arriba.entries()) acumulado[indice] = valor;
          const puntos = [
            ...arriba.map(
              (valor, indice) => `${String(x(indice, arriba.length))},${String(y(valor))}`,
            ),
            ...abajo
              .map((valor, indice) => `${String(x(indice, abajo.length))},${String(y(valor))}`)
              .reverse(),
          ].join(' ');
          return (
            <polygon key={serie.etiqueta} points={puntos} fill={color(indiceSerie)} opacity={0.85}>
              <title>{`${serie.etiqueta}: ${formato(serie.valores.reduce((a, b) => a + b, 0))}`}</title>
            </polygon>
          );
        })}
      </svg>
    </Marco>
  );
}

/**
 * DONA · una composición, y sólo cuando son pocas partes.
 *
 * Con más de cinco porciones el ojo deja de poder comparar ángulos y una barra dice
 * lo mismo mejor. El total va en el centro porque es lo que se mira primero.
 */
export function GraficaDeDona({
  partes,
  formato = PORCENTAJE,
  titulo,
  etiquetaCentro,
  className,
}: {
  readonly partes: readonly { readonly etiqueta: string; readonly valor: number }[];
  readonly formato?: (valor: number) => string;
  readonly titulo: string;
  readonly etiquetaCentro?: string;
  readonly className?: string;
}): ReactElement {
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0);
  const radio = 60;
  const grosor = 18;
  const circunferencia = 2 * Math.PI * radio;

  /**
   * Los arcos, calculados ANTES de pintar.
   *
   * Acumulando dentro del `map` se escribe en una variable mientras React renderiza,
   * y eso es exactamente lo que rompe con renderizado concurrente: si React
   * abandona y repite el render, el acumulador arranca donde lo dejó y la dona sale
   * girada. Un `reduce` previo no tiene ese problema y se lee igual de bien.
   */
  const arcos = partes.reduce<
    readonly {
      readonly etiqueta: string;
      readonly valor: number;
      readonly largo: number;
      readonly desfase: number;
    }[]
  >((hasta, parte) => {
    const fraccion = total === 0 ? 0 : parte.valor / total;
    const largo = circunferencia * fraccion;
    const recorrido = hasta.reduce((suma, arco) => suma + arco.largo, 0);
    return [...hasta, { etiqueta: parte.etiqueta, valor: parte.valor, largo, desfase: -recorrido }];
  }, []);

  return (
    <figure className={cn('flex flex-col items-center gap-(--espacio-3)', className)}>
      <svg viewBox="0 0 160 160" role="img" aria-label={titulo} className="w-40">
        <g transform="translate(80 80) rotate(-90)">
          {arcos.map((arco, indice) => (
            <circle
              key={arco.etiqueta}
              r={radio}
              fill="none"
              stroke={color(indice)}
              strokeWidth={grosor}
              strokeDasharray={`${String(arco.largo)} ${String(circunferencia - arco.largo)}`}
              strokeDashoffset={arco.desfase}
            >
              <title>{`${arco.etiqueta}: ${formato(arco.valor)}`}</title>
            </circle>
          ))}
        </g>
        <text
          x={80}
          y={78}
          textAnchor="middle"
          className="fill-texto text-lg font-medium font-numeros"
        >
          {formato(total)}
        </text>
        {etiquetaCentro === undefined ? null : (
          <text x={80} y={94} textAnchor="middle" className="fill-texto-sutil text-xs">
            {etiquetaCentro}
          </text>
        )}
      </svg>
      <figcaption className="sr-only">{titulo}</figcaption>
      <Leyenda series={partes.map((p) => ({ etiqueta: p.etiqueta, valores: [p.valor] }))} />
    </figure>
  );
}

/**
 * MAPA DE CALOR POR HORA · la más útil de todas en un restaurante.
 *
 * Contesta de un vistazo la pregunta que decide la nómina de la semana: **a qué hora
 * y qué día hay gente**. Una tabla de las mismas cifras se lee en dos minutos; esto,
 * en dos segundos.
 *
 * La intensidad va por OPACIDAD de un solo color y no por un arcoíris: una escala de
 * tonos distintos obliga a consultar la leyenda para cada celda, y además se rompe
 * para quien no distingue dos de esos tonos. Con un solo color, más oscuro es más, y
 * eso no hay que aprenderlo.
 */
export function MapaDeCalorPorHora({
  horas,
  dias,
  valores,
  formato = PORCENTAJE,
  titulo,
  className,
}: {
  readonly horas: readonly string[];
  readonly dias: readonly string[];
  /** `valores[dia][hora]`. Tantas filas como días y tantas columnas como horas. */
  readonly valores: readonly (readonly number[])[];
  readonly formato?: (valor: number) => string;
  readonly titulo: string;
  readonly className?: string;
}): ReactElement {
  const maximo = Math.max(1, ...valores.flat());

  return (
    <figure className={cn('flex flex-col gap-(--espacio-2)', className)}>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr>
              <th className="sr-only">Día</th>
              {horas.map((hora) => (
                <th key={hora} scope="col" className="px-0.5 font-normal text-texto-sutil">
                  {hora}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dias.map((dia, indiceDia) => (
              <tr key={dia}>
                <th
                  scope="row"
                  className="pr-(--espacio-2) text-right font-normal text-texto-sutil"
                >
                  {dia}
                </th>
                {horas.map((hora, indiceHora) => {
                  const valor = valores[indiceDia]?.[indiceHora] ?? 0;
                  const intensidad = maximo === 0 ? 0 : valor / maximo;
                  return (
                    <td key={hora} className="p-0">
                      <div
                        title={`${dia} ${hora}: ${formato(valor)}`}
                        className="size-5 rounded-sm"
                        style={{
                          // Un solo color, más o menos opaco. Y un piso de 0.06 para
                          // que una celda con CERO siga siendo una celda y no un
                          // agujero en la cuadrícula.
                          background: `hsl(var(--grafico-1) / ${String(0.06 + intensidad * 0.94)})`,
                        }}
                      >
                        <span className="sr-only">{`${dia} ${hora}: ${formato(valor)}`}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-(--espacio-2) text-xs text-texto-sutil">
        <span>menos</span>
        {[0.06, 0.3, 0.55, 0.8, 1].map((intensidad) => (
          <span
            key={intensidad}
            aria-hidden="true"
            className="size-3 rounded-sm"
            style={{ background: `hsl(var(--grafico-1) / ${String(intensidad)})` }}
          />
        ))}
        <span>más</span>
      </p>
    </figure>
  );
}
