'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Badge } from '@morphiqpos/ui/primitivas/badge';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  GraficaDeBarras,
  Superficie,
  Tabla,
  Vacio,
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  PackagePlus,
  Store,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferretería · EL TABLERO (F-056 · §4.4)
 *
 * ── Por qué no es el de la tiendita, ni el del restaurante ────────────────
 * Porque el orden dice lo que el negocio teme. En una tiendita lo primero es la
 * venta del día; aquí lo primero es **la cartera**, porque «es la pérdida que no
 * admite vuelta atrás»: una ferretería fía ciento veinte mil pesos a una obra que
 * puede no volver, y la llamada se hace hoy o no se hace.
 *
 * ── Y se diseña primero para PC ───────────────────────────────────────────
 * Beto lo mira en la máquina de la oficinita de atrás, entre cliente y cliente, no
 * en el teléfono. Por eso el layout es el de su §4.4, en tres anchos:
 *
 *   · PC (xl) · TRES columnas: a la izquierda 1 y 2, los dos dolores, que ocupan
 *     más alto; al centro 3 y 4; a la derecha 5, 6, 7 y 8 apilados, más chicos.
 *   · Tableta (md) · DOS columnas, con 1 y 2 a todo lo ancho arriba.
 *   · Teléfono · UNA: 1, 3, 2, 4, y el resto plegado. Es el domingo o el mayorista:
 *     lo que se abre fuera es a quién hablarle, no el pedido.
 *
 * Las columnas de la PC son cajas reales sólo en `xl`; por debajo se vuelven
 * `contents` y cada indicador se acomoda con su `order` en la rejilla de una o dos
 * columnas. Un solo árbol, sin pintar nada dos veces.
 *
 * Los ocho, en su orden: cartera · dinero dormido · salió hoy y no se cobró · venta
 * y margen · qué pedir · mostrador por persona · lo que debo esta semana · y el
 * cajón de lo que se enfría.
 */

const RUTA = '/api/reportes/tablero-ferreteria';

const ROTULO = 'text-xs font-semibold tracking-wide text-texto-sutil uppercase';
const NOTA = 'text-sm text-texto-sutil';

/** El tamaño de la cifra dice el rango del indicador: grande, mediano o chico (§4.4). */
const CIFRA = {
  grande: 'text-3xl font-bold tracking-tight',
  mediano: 'text-2xl font-semibold',
  chico: 'text-xl font-semibold',
} as const;

/** Una columna de la PC; por debajo de `xl` sus indicadores caen a la rejilla. */
const COLUMNA_DE_PC = 'contents xl:flex xl:min-w-0 xl:flex-col xl:gap-(--espacio-3)';
/** La de la derecha, plegada en el teléfono: desde la tableta se ve siempre. */
const COLUMNA_PLEGADA = 'hidden md:contents xl:flex xl:min-w-0 xl:flex-col xl:gap-(--espacio-3)';

interface DeudorDeObra {
  readonly cliente: string;
  readonly obra: string | null;
  readonly saldoCentavos: string;
  readonly dias: number;
}

interface LineaDormida {
  readonly linea: string;
  readonly dineroCentavos: string;
  readonly claves: number;
}

interface PersonaDelMostrador {
  readonly persona: string;
  readonly ventaCentavos: string;
  readonly tickets: number;
  readonly lineasPorVentaBp: number;
}

interface PorPagar {
  readonly proveedor: string;
  readonly dia: string;
  readonly saldoCentavos: string;
}

interface PorPedir {
  readonly proveedor: string;
  readonly pasaManana: boolean;
  readonly claves: number;
  readonly importeCentavos: string;
}

export interface TableroDeFerreteria {
  readonly fecha: string;
  readonly cartera: {
    readonly totalCentavos: string;
    readonly vencidoCentavos: string;
    readonly masViejos: readonly DeudorDeObra[];
  };
  readonly dormido: {
    readonly dineroCentavos: string;
    readonly delInventarioBp: number;
    readonly peores: readonly LineaDormida[];
  };
  readonly aCredito: {
    readonly importeCentavos: string;
    readonly sobreVentaBp: number;
    readonly remisionesSinFirma: number;
  };
  readonly venta: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly tickets: number;
  };
  readonly margen: { readonly hoyCentavos: string; readonly hoyBp: number };
  readonly porPedir: readonly PorPedir[];
  readonly mostrador: readonly PersonaDelMostrador[];
  readonly porPagar: {
    readonly totalCentavos: string;
    readonly documentos: readonly PorPagar[];
  };
  readonly pendientes: {
    readonly garantias: number;
    readonly rentasVencidas: number;
    readonly rollosViejos: number;
    readonly cotizacionesPorVencer: number;
  };
}

export interface TableroProps {
  readonly datosIniciales?: TableroDeFerreteria;
}

/** Un documento por pagar con su clave: dos del mismo proveedor pueden vencer el mismo día. */
interface DocumentoPorPagar extends PorPagar {
  readonly clave: string;
}

/** La fecha del negocio, a mediodía para que la zona no la corra un día. */
function conFormato(fecha: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-MX', opciones).format(new Date(`${fecha}T12:00:00`));
}

/** «−12 % contra el mismo día de la semana pasada». */
function comparacion(hoy: string, referencia: string): string {
  const base = Number(referencia);
  if (base <= 0) return 'sin venta ese día la semana pasada';
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  return `${cambio > 0 ? '+' : ''}${String(cambio)} % contra el mismo día de la semana pasada`;
}

const SIN_LEER = 'No se pudo cargar el tablero.';

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return SIN_LEER;
}

/** Puntos base a porcentaje, con UNA cifra: 2,640 bp son «26.4 %». */
function Porcentaje({
  bp,
  tamano = 'base',
}: {
  readonly bp: number;
  readonly tamano?: 'sm' | 'base' | 'lg';
}) {
  return <Cifra valor={bp / 100} decimales={1} unidad="%" tamano={tamano} />;
}

// ── Las columnas que no dependen del vocabulario ────────────────────────────

const COLUMNAS_DE_CARTERA: readonly ColumnaDeTabla<DeudorDeObra>[] = [
  {
    clave: 'quien',
    titulo: 'Cliente · obra',
    // La obra es lo que hace posible la llamada: «de Las Torres me debes…».
    celda: (quien) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{quien.cliente}</span>
        {quien.obra !== null && (
          <span className="truncate text-xs text-texto-sutil">{quien.obra}</span>
        )}
      </span>
    ),
  },
  {
    clave: 'dias',
    titulo: 'Días',
    numerica: true,
    celda: (quien) => <Cifra valor={quien.dias} unidad="d" tamano="sm" />,
  },
  {
    clave: 'saldo',
    titulo: 'Saldo',
    numerica: true,
    celda: (quien) => (
      <Dinero centavos={Number(quien.saldoCentavos)} tamano="sm" className="font-semibold" />
    ),
  },
];

const COLUMNAS_DE_DORMIDO: readonly ColumnaDeTabla<LineaDormida>[] = [
  { clave: 'linea', titulo: 'Línea', celda: (linea) => linea.linea },
  {
    clave: 'claves',
    titulo: 'Claves',
    numerica: true,
    celda: (linea) => <Cifra valor={linea.claves} tamano="sm" />,
  },
  {
    clave: 'costo',
    titulo: 'A costo',
    numerica: true,
    celda: (linea) => (
      <Dinero centavos={Number(linea.dineroCentavos)} tamano="sm" className="font-semibold" />
    ),
  },
];

const COLUMNAS_DE_PEDIDO: readonly ColumnaDeTabla<PorPedir>[] = [
  {
    clave: 'proveedor',
    titulo: 'Proveedor',
    celda: (fila) => (
      <span className="flex flex-wrap items-center gap-(--espacio-2)">
        {fila.proveedor}
        {fila.pasaManana && <Badge variant="secondary">pasa mañana</Badge>}
      </span>
    ),
  },
  {
    clave: 'claves',
    titulo: 'Claves',
    numerica: true,
    celda: (fila) => <Cifra valor={fila.claves} tamano="sm" />,
  },
  {
    clave: 'importe',
    titulo: 'Importe',
    numerica: true,
    celda: (fila) => <Dinero centavos={Number(fila.importeCentavos)} tamano="sm" />,
  },
];

/** Lo que debo: el día de la semana, que es como se pregunta («¿el jueves?»). */
function columnasPorPagar(hoy: string): readonly ColumnaDeTabla<DocumentoPorPagar>[] {
  return [
    { clave: 'proveedor', titulo: 'Proveedor', celda: (doc) => doc.proveedor },
    {
      clave: 'vence',
      titulo: 'Vence',
      // La palabra dice por qué la fila va en rojo: el tono nunca va solo.
      celda: (doc) =>
        doc.dia < hoy ? (
          <span className="font-semibold text-peligro">vencido</span>
        ) : (
          <span className="whitespace-nowrap">
            {conFormato(doc.dia, { weekday: 'long', day: 'numeric' })}
          </span>
        ),
    },
    {
      clave: 'saldo',
      titulo: 'Saldo',
      numerica: true,
      celda: (doc) => <Dinero centavos={Number(doc.saldoCentavos)} tamano="sm" />,
    },
  ];
}

// ── Las piezas de la pantalla ───────────────────────────────────────────────

/**
 * El saludo y sus dos salidas. La misma forma que el `PageHeader` heredado —el
 * bloque del título y, de hermano, el `div` de las acciones— porque las pruebas
 * encuentran las acciones por esa relación.
 */
function Encabezado({ fecha }: { readonly fecha: string | null }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-(--espacio-3)">
      <div>
        <h1 className="text-2xl font-bold text-texto">Buen día</h1>
        {fecha === null ? (
          <Esqueleto className="mt-(--espacio-1) h-4 w-40" />
        ) : (
          <p className={`${NOTA} first-letter:uppercase`}>
            {conFormato(fecha, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-(--espacio-2)">
        <Button asChild size="sm">
          <a href="/ferreteria/mostrador">
            <Store aria-hidden="true" />
            Ir al mostrador
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/ferreteria/entradas">
            <PackagePlus aria-hidden="true" />
            Registrar compra
          </a>
        </Button>
      </div>
    </header>
  );
}

/** La salida de un indicador: el enlace a la pantalla donde se actúa sobre él. */
function Salida({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <div className="mt-auto border-t border-borde px-(--espacio-3) py-(--espacio-2)">
      <Button asChild size="sm" variant="ghost">
        <a href={href}>
          {children}
          <ArrowRight aria-hidden="true" />
        </a>
      </Button>
    </div>
  );
}

/**
 * UN INDICADOR · la tarjeta, su rótulo, su cifra y lo que la explica.
 *
 * Relleno cero: la cabecera lleva el suyo y la tabla va A SANGRE, de borde a borde,
 * con su franja de títulos como único separador. Una tabla con borde dentro de una
 * tarjeta con borde son dos cajas para una sola lista.
 */
function Indicador({
  id,
  titulo,
  cifra,
  children,
  debajo,
  salida,
  className = '',
}: {
  readonly id: string;
  readonly titulo: string;
  readonly cifra?: ReactNode;
  readonly children?: ReactNode;
  readonly debajo?: ReactNode;
  readonly salida?: ReactNode;
  readonly className?: string;
}) {
  return (
    <Superficie
      como="section"
      relleno={0}
      aria-labelledby={id}
      className={`flex min-w-0 flex-col overflow-hidden ${className}`}
    >
      <div className="flex flex-col gap-(--espacio-1) px-(--espacio-4) pt-(--espacio-4) pb-(--espacio-3)">
        <h2 id={id} className={ROTULO}>
          {titulo}
        </h2>
        {cifra}
        {children}
      </div>
      {debajo}
      {salida}
    </Superficie>
  );
}

/** Una de las cuatro cosas del cajón: la cuenta grande, apagada cuando es cero. */
function Pendiente({ etiqueta, valor }: { readonly etiqueta: string; readonly valor: number }) {
  return (
    <div className="flex flex-col gap-(--espacio-1)">
      <dt className="text-xs text-texto-sutil">{etiqueta}</dt>
      <dd>
        <Cifra
          valor={valor}
          tamano="lg"
          className={valor > 0 ? 'font-semibold text-texto' : 'text-texto-tenue'}
        />
      </dd>
    </div>
  );
}

/** Cargando: la forma de las tres columnas, nunca una rueda. */
function TableroCargando() {
  return (
    <div className="grid gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {['cartera', 'credito', 'pedir'].map((clave) => (
        <Superficie key={clave} className="flex flex-col gap-(--espacio-3)">
          <Esqueleto className="h-3 w-32" />
          <Esqueleto className="h-(--altura-control) w-44" />
          <EsqueletoDeLista filas={3} />
        </Superficie>
      ))}
    </div>
  );
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeFerreteria | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  // Sólo en el teléfono: 5 a 8 se abren a pedido. En tableta y PC se ven siempre.
  const [plegado, setPlegado] = useState(true);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeFerreteria>(RUTA, {}, { signal: control.signal })
      .then((salida) => {
        if (sigueMontada()) setDatos(salida);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo));
      });

    return () => {
      control.abort();
    };
  }, [datosIniciales, intento]);

  if (error !== null) {
    return (
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado fecha={null} />
        <ErrorDePantalla
          titulo={SIN_LEER}
          queHacer="Revisa la conexión y vuelve a intentarlo: esta pantalla sólo lee, no cambia nada."
          // El mensaje del servidor, sólo si dice algo más que el título.
          {...(error === SIN_LEER ? {} : { detalle: error })}
          reintentar={
            <Button
              onClick={() => {
                setError(null);
                setDatos(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
        />
      </main>
    );
  }

  if (datos === null) {
    return (
      <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado fecha={null} />
        <TableroCargando />
      </main>
    );
  }

  const { cartera, dormido, aCredito, venta, margen, porPedir, mostrador, porPagar, pendientes } =
    datos;
  const hoy = datos.fecha;
  const vencido = Number(cartera.vencidoCentavos);
  const documentos: readonly DocumentoPorPagar[] = porPagar.documentos.map((doc, indice) => ({
    ...doc,
    clave: `${doc.proveedor}-${doc.dia}-${String(indice)}`,
  }));

  const columnasDelMostrador: readonly ColumnaDeTabla<PersonaDelMostrador>[] = [
    {
      clave: 'persona',
      titulo: 'Quién',
      celda: (quien) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{quien.persona}</span>
          <span className="text-xs text-texto-sutil">{voc.conNumero('orden', quien.tickets)}</span>
        </span>
      ),
    },
    {
      clave: 'lineas',
      // «Líneas por nota» es lo que mide la asesoría: ¿vende la solución completa?
      titulo: `Líneas por ${voc.singular('orden')}`,
      numerica: true,
      celda: (quien) => (
        <Cifra
          valor={quien.lineasPorVentaBp / 100}
          decimales={1}
          tamano="sm"
          className="font-semibold"
        />
      ),
    },
    {
      clave: 'venta',
      titulo: 'Venta',
      numerica: true,
      celda: (quien) => <Dinero centavos={Number(quien.ventaCentavos)} tamano="sm" />,
    },
  ];

  return (
    <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <Encabezado fecha={datos.fecha} />

      <div className="grid gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)] xl:items-start">
        {/* ── COLUMNA IZQUIERDA · los dos dolores ─────────────────────────── */}
        <div className={COLUMNA_DE_PC}>
          {/* 1 · LA CARTERA. Primero, porque es lo que no vuelve. */}
          <Indicador
            id="t-cartera"
            titulo="Lo que me deben"
            className="order-1 md:col-span-2"
            cifra={
              <Dinero
                centavos={Number(cartera.totalCentavos)}
                tamano="lg"
                className={CIFRA.grande}
              />
            }
            debajo={
              cartera.masViejos.length > 0 && (
                <Tabla
                  etiqueta="Las obras que más deben"
                  columnas={COLUMNAS_DE_CARTERA}
                  filas={cartera.masViejos}
                  claveDe={(quien) => `${quien.cliente}-${quien.obra ?? ''}`}
                  alto="max-h-none"
                  className="rounded-none border-0"
                />
              )
            }
            salida={<Salida href="/ferreteria/cuentas">Ver la cartera</Salida>}
          >
            <p className={vencido > 0 ? 'text-sm font-semibold text-peligro' : NOTA}>
              Vencido <Dinero centavos={vencido} tamano="sm" />
            </p>
            {/* LA CARTERA, DIBUJADA. La tabla de abajo dice quién y cuánto; lo que
                NO dice es la PROPORCIÓN: si son cuatro obras parecidas o una sola que
                se comió la mitad. Eso decide a quién se le habla hoy, y es lo que una
                barra contesta y una columna de cifras no. Empieza en cero siempre. */}
            {cartera.masViejos.length > 1 && (
              <GraficaDeBarras
                className="mt-(--espacio-2)"
                titulo="Las obras que más deben, por saldo"
                ejes={cartera.masViejos.map((quien) => quien.obra ?? quien.cliente)}
                series={[
                  {
                    etiqueta: 'Saldo',
                    valores: cartera.masViejos.map((quien) => Number(quien.saldoCentavos)),
                  },
                ]}
                formato={dineroEnTexto}
                alto={130}
              />
            )}
          </Indicador>

          {/* 2 · EL DINERO DORMIDO, en pesos: «1,840 claves no significa nada». */}
          <Indicador
            id="t-dormido"
            titulo="Dinero dormido"
            className="order-3 md:order-2 md:col-span-2"
            cifra={
              <Dinero
                centavos={Number(dormido.dineroCentavos)}
                tamano="lg"
                className={CIFRA.grande}
              />
            }
            debajo={
              dormido.peores.length > 0 && (
                <Tabla
                  etiqueta="Las líneas con más dinero dormido"
                  columnas={COLUMNAS_DE_DORMIDO}
                  filas={dormido.peores}
                  claveDe={(linea) => linea.linea}
                  alto="max-h-none"
                  className="rounded-none border-0"
                />
              )
            }
            salida={<Salida href="/ferreteria/existencias">Ver qué está dormido</Salida>}
          >
            <p className={NOTA}>
              <Porcentaje bp={dormido.delInventarioBp} tamano="sm" /> del inventario · sin venta en
              90 días
            </p>
          </Indicador>
        </div>

        {/* ── COLUMNA DEL CENTRO · lo de hoy ──────────────────────────────── */}
        <div className={COLUMNA_DE_PC}>
          {/* 3 · LO QUE SALIÓ Y NO ES DINERO. El único que pide hacer algo HOY. */}
          <Indicador
            id="t-credito"
            titulo="Salió hoy y no se cobró"
            className="order-2 md:order-3"
            cifra={
              <Dinero
                centavos={Number(aCredito.importeCentavos)}
                tamano="lg"
                className={CIFRA.grande}
              />
            }
          >
            <p className={NOTA}>
              <Porcentaje bp={aCredito.sobreVentaBp} tamano="sm" /> de la venta
            </p>
            {aCredito.remisionesSinFirma === 0 ? (
              <p className={`${NOTA} flex items-center gap-(--espacio-1)`}>
                <Check aria-hidden="true" className="size-4 text-exito" />
                todas las remisiones con firma
              </p>
            ) : (
              <Aviso
                tono="atencion"
                titulo={`${String(aCredito.remisionesSinFirma)} remisión(es) SIN FIRMA capturada`}
                className="mt-(--espacio-2) p-(--espacio-3)"
              >
                Hay que capturarlas antes de cerrar.
              </Aviso>
            )}
          </Indicador>

          {/* 4 · VENTA Y MARGEN, juntos: «vendí mucho» no es «gané mucho». */}
          <Indicador
            id="t-venta"
            titulo={`${voc.titulo('orden', true)} de hoy`}
            className="order-4"
            cifra={
              <p className="flex flex-wrap items-baseline gap-x-(--espacio-3) gap-y-(--espacio-1)">
                <Dinero
                  centavos={Number(venta.hoyCentavos)}
                  tamano="lg"
                  className={CIFRA.mediano}
                />
                <span className="text-lg font-semibold text-texto">
                  margen <Porcentaje bp={margen.hoyBp} tamano="lg" />
                </span>
              </p>
            }
          >
            <p className={NOTA}>
              {comparacion(venta.hoyCentavos, venta.referenciaCentavos)} ·{' '}
              {voc.conNumero('orden', venta.tickets)}
            </p>
          </Indicador>
        </div>

        {/* En el teléfono, 5 a 8 esperan plegados: fuera del negocio se abre la
            cartera, no el pedido. */}
        <Button
          type="button"
          variant="outline"
          className="order-5 h-auto min-h-(--altura-control) justify-between py-(--espacio-2) text-left whitespace-normal md:hidden"
          aria-expanded={!plegado}
          aria-controls="t-resto"
          onClick={() => {
            setPlegado((previo) => !previo);
          }}
        >
          Qué pedir · Mostrador · Lo que debo · Pendientes
          {plegado ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </Button>

        {/* ── COLUMNA DERECHA · lo que se revisa, más chico ───────────────── */}
        <div id="t-resto" className={plegado ? COLUMNA_PLEGADA : COLUMNA_DE_PC}>
          {/* 5 · QUÉ PEDIR, sólo lo que se mueve. */}
          <Indicador
            id="t-pedir"
            titulo="Qué pedir"
            className="order-6"
            debajo={
              <Tabla
                etiqueta="Qué pedir, por proveedor"
                columnas={COLUMNAS_DE_PEDIDO}
                filas={porPedir}
                claveDe={(fila) => fila.proveedor}
                alto="max-h-none"
                className="rounded-none border-0"
                vacio={
                  <Vacio
                    icono={<PackageCheck />}
                    titulo="Nada que se mueva está bajo mínimo."
                    className="px-(--espacio-4) py-(--espacio-4)"
                  />
                }
              />
            }
          />

          {/* 6 · EL MOSTRADOR. «Líneas por venta» es lo que mide la asesoría. */}
          <Indicador
            id="t-mostrador"
            titulo="Mostrador"
            className="order-6"
            debajo={
              <Tabla
                etiqueta="El mostrador, por persona"
                columnas={columnasDelMostrador}
                filas={mostrador}
                claveDe={(quien) => quien.persona}
                alto="max-h-none"
                className="rounded-none border-0"
                vacio={
                  <Vacio
                    icono={<UserRound />}
                    titulo="Todavía no se ha cobrado nada hoy."
                    className="px-(--espacio-4) py-(--espacio-4)"
                  />
                }
              />
            }
          />

          {/* 7 · LO QUE DEBO. La pregunta que quita el sueño: ¿tengo con qué el jueves? */}
          <Indicador
            id="t-pagar"
            titulo="Lo que debo esta semana"
            className="order-6"
            cifra={
              <Dinero
                centavos={Number(porPagar.totalCentavos)}
                tamano="lg"
                className={CIFRA.chico}
              />
            }
            debajo={
              documentos.length > 0 && (
                <Tabla
                  etiqueta="Lo que vence esta semana"
                  columnas={columnasPorPagar(hoy)}
                  filas={documentos}
                  claveDe={(doc) => doc.clave}
                  alto="max-h-none"
                  className="rounded-none border-0"
                  tonoDeFila={(doc) => (doc.dia < hoy ? 'peligro' : undefined)}
                />
              )
            }
          />

          {/* 8 · EL CAJÓN, y está declarado como cajón a propósito: cuatro cosas
              chicas que juntas son dinero detenido. */}
          <Indicador id="t-pendientes" titulo="Pendientes que se enfrían" className="order-6">
            <dl className="mt-(--espacio-1) grid grid-cols-2 gap-(--espacio-3)">
              <Pendiente etiqueta="Garantías sin resolver" valor={pendientes.garantias} />
              <Pendiente etiqueta="Herramienta que no volvió" valor={pendientes.rentasVencidas} />
              <Pendiente
                etiqueta="Rollos abiertos de más de 60 días"
                valor={pendientes.rollosViejos}
              />
              <Pendiente
                etiqueta="Cotizaciones por vencer"
                valor={pendientes.cotizacionesPorVencer}
              />
            </dl>
          </Indicador>
        </div>
      </div>
    </main>
  );
}
