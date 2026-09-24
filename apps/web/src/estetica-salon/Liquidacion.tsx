'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { CalendarRange, HandCoins, ReceiptText, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · liquidacion
 *
 * El día de pago: lo que se le debe a cada quien, renglón por renglón.
 *
 * ── Por qué se enseña el DETALLE y no el total ──────────────────────────
 * Porque la conversación del quince no es «cuánto me toca», es «por qué me toca
 * eso». Un total sin renglones obliga a la dueña a defenderlo de memoria, y al
 * tercer mes deja de liquidar por sistema y vuelve al papel — que es donde
 * estaba el problema.
 *
 * ── Por qué la propina NUNCA se mezcla con la comisión ──────────────────
 * No es del salón. Sumarlas haría que la comisión se calculara sobre dinero que
 * la clienta le dejó a ella mirándola a los ojos, y que el salón le pagara
 * comisión sobre su propia propina.
 *
 * ── Por qué lo que ella cobró se RESTA y se dice ────────────────────────
 * Si atendió y cobró directo —renta de estación, servicio a domicilio—, ese
 * dinero ya está en su bolsa. No restarlo es pagarle dos veces, y es el error
 * más caro de esta pantalla porque nadie lo nota hasta el cierre del mes.
 *
 * ── Por qué el comprobante se ve ANTES de pagar ─────────────────────────
 * Porque una vez pagado ya no se discute: se reclama. Verlo antes convierte una
 * reclamación en una pregunta.
 *
 * ── Dos columnas en la PC, una debajo de otra en la tableta ─────────────
 * La liquidación se hace de noche, en la PC (`04-INTERFAZ` §4.3.7): la lista de
 * personas a la izquierda y el detalle a la derecha, pegado arriba mientras se
 * baja por los renglones. En la tableta y el teléfono la lista va arriba y el
 * detalle abajo; al tocar un nombre la pantalla baja hasta él, que es lo más
 * cerca de «pantalla completa» que se llega sin inventar un botón de volver.
 *
 * ── La fila VIAJA al panel ──────────────────────────────────────────────
 * Al tocar un nombre, su renglón se convierte en el panel (`VIAJE.fila`). No es
 * adorno: con cinco o seis personas por liquidar, el movimiento confirma de reojo
 * de quién son los números que se están leyendo. Dura cero con `movimiento: nula`
 * o con la preferencia del sistema.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el periodo, el detalle por profesional, el comprobante y el pago. Queda
 * fuera la edición de la regla de comisión, que es del catálogo. La lista no
 * trae el total por persona que dibuja el documento: el puente de profesionales
 * no lo expone, y el total se ve al abrir a cada una.
 */

const RUTA_PROFESIONALES = '/api/profesionales';
const RUTA_LIQUIDAR = '/api/liquidaciones';
const RUTA_COMPROBANTE = '/api/liquidaciones';

export interface FichaDeProfesional {
  readonly profesionalId: string;
  readonly nombreCompleto: string;
  readonly rentaEstacion: boolean;
}

export interface ComisionDeLinea {
  readonly comisionId: string;
  readonly tipo: string;
  readonly baseCentavos: string;
  readonly tasaBp: number;
  readonly montoCentavos: string;
  readonly liquidada: boolean;
  readonly causadaEn: string;
}

export interface Comisiones {
  readonly causadoCentavos: string;
  readonly liquidadoCentavos: string;
  readonly pendienteCentavos: string;
  readonly lineas: readonly ComisionDeLinea[];
}

export interface Comprobante {
  readonly liquidacionId: string;
  readonly nombreCompleto: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly materialCargadoCentavos: string;
  readonly rentaCentavos: string;
  readonly cobradoPorEllaCentavos: string;
  readonly anticiposCentavos: string;
  readonly totalCentavos: string;
  readonly pagadaEn: string | null;
}

export interface LiquidacionProps {
  readonly profesionalesIniciales?: readonly FichaDeProfesional[];
  readonly desde?: string;
  readonly hasta?: string;
}

/**
 * Los renglones del comprobante, en el orden en que se explican.
 *
 * Lo que SUMA primero y lo que RESTA después: leído al revés, el total parece
 * un castigo en vez de una cuenta.
 */
export function renglonesDe(
  comprobante: Comprobante,
  /**
   * Cómo se llama la UNIDAD DE SERVICIO en este giro: estación en un salón, silla
   * en una barbería, cabina en un spa. Tecleada, el comprobante de la barbería
   * cobraba «renta de estación» por una silla.
   */
  comoSeLlamaLaEstacion = 'estación',
): readonly {
  readonly etiqueta: string;
  readonly importe: string;
  readonly resta: boolean;
}[] {
  return [
    { etiqueta: 'Comisión', importe: comprobante.comisionCentavos, resta: false },
    { etiqueta: 'Propina', importe: comprobante.propinaCentavos, resta: false },
    { etiqueta: 'Material cargado', importe: comprobante.materialCargadoCentavos, resta: true },
    {
      etiqueta: `Renta de ${comoSeLlamaLaEstacion}`,
      importe: comprobante.rentaCentavos,
      resta: true,
    },
    { etiqueta: 'Lo que ella cobró', importe: comprobante.cobradoPorEllaCentavos, resta: true },
    { etiqueta: 'Anticipos', importe: comprobante.anticiposCentavos, resta: true },
  ];
}

type Renglon = ReturnType<typeof renglonesDe>[number];

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo liquidar. Vuelve a intentarlo.';
}

/** La lista de personas: el nombre grande, y la renta dicha, no adivinada. */
function columnasDeProfesionales(unidad: string): readonly ColumnaDeTabla<FichaDeProfesional>[] {
  return [
    {
      clave: 'nombre',
      titulo: 'Profesional',
      orden: (p) => p.nombreCompleto,
      celda: (p) => (
        <span className="flex flex-col">
          <span className="text-base font-semibold">{p.nombreCompleto}</span>
          {p.rentaEstacion ? (
            <span className="text-xs text-texto-sutil">renta de {unidad}</span>
          ) : null}
        </span>
      ),
    },
  ];
}

/**
 * Cada comisión con su base, su tasa y su monto: lo que convierte una cifra en un
 * documento auditable. En la PC la tasa y la base van en su columna, alineadas;
 * por debajo de eso van dentro del concepto, porque no caben y no se pueden perder.
 */
const COLUMNAS_DE_LINEAS: readonly ColumnaDeTabla<ComisionDeLinea>[] = [
  {
    clave: 'fecha',
    titulo: 'Fecha',
    orden: (l) => l.causadaEn,
    celda: (l) => <span className="font-numeros tabular-nums">{l.causadaEn.slice(0, 10)}</span>,
  },
  {
    clave: 'concepto',
    titulo: 'Concepto',
    celda: (l) => (
      <span className="flex flex-col">
        <span className="font-medium">{l.tipo}</span>
        <span className="text-xs text-texto-sutil lg:hidden">
          <Cifra valor={l.tasaBp / 100} unidad="%" decimales={1} tamano="xs" /> de{' '}
          <Dinero centavos={Number(l.baseCentavos)} tamano="xs" />
        </span>
        {/* El gris de la fila no basta: la palabra dice por qué está apagada. */}
        {l.liquidada ? <span className="text-xs font-medium">ya liquidada</span> : null}
      </span>
    ),
  },
  {
    clave: 'tasa',
    titulo: 'Tasa',
    numerica: true,
    desde: 'lg',
    orden: (l) => l.tasaBp,
    celda: (l) => <Cifra valor={l.tasaBp / 100} unidad="%" decimales={1} tamano="sm" />,
  },
  {
    clave: 'base',
    titulo: 'Base',
    numerica: true,
    desde: 'lg',
    orden: (l) => Number(l.baseCentavos),
    celda: (l) => <Dinero centavos={Number(l.baseCentavos)} tamano="sm" />,
  },
  {
    clave: 'comision',
    titulo: 'Comisión',
    numerica: true,
    orden: (l) => Number(l.montoCentavos),
    celda: (l) => <Dinero centavos={Number(l.montoCentavos)} tamano="sm" />,
  },
];

/** Lo que resta va en negativo: entre paréntesis y leído «menos», nunca escondido. */
const COLUMNAS_DEL_COMPROBANTE: readonly ColumnaDeTabla<Renglon>[] = [
  { clave: 'concepto', titulo: 'Concepto', celda: (r) => r.etiqueta },
  {
    clave: 'importe',
    titulo: 'Importe',
    numerica: true,
    celda: (r) => <Dinero centavos={r.resta ? -Number(r.importe) : Number(r.importe)} />,
  },
];

/** Causado, ya liquidado y pendiente. El pendiente es el grande: es lo que se va a pagar. */
function ResumenDeComisiones({ comisiones }: { readonly comisiones: Comisiones }) {
  return (
    <dl className="grid grid-cols-2 gap-(--espacio-4) sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end sm:gap-(--espacio-8)">
      <div className="flex flex-col gap-(--espacio-1)">
        <dt className="text-sm text-texto-sutil">Causado</dt>
        <dd>
          <Dinero centavos={Number(comisiones.causadoCentavos)} tamano="lg" />
        </dd>
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <dt className="text-sm text-texto-sutil">Ya liquidado</dt>
        <dd>
          <Dinero centavos={Number(comisiones.liquidadoCentavos)} tamano="lg" />
        </dd>
      </div>
      <div className="col-span-2 flex flex-col gap-(--espacio-1) border-t border-borde pt-(--espacio-3) sm:col-span-1 sm:border-t-0 sm:pt-0 sm:text-right">
        <dt className="text-sm font-medium">Pendiente</dt>
        <dd>
          <Dinero
            centavos={Number(comisiones.pendienteCentavos)}
            tamano="total"
            className="text-3xl"
          />
        </dd>
      </div>
    </dl>
  );
}

/** El comprobante: lo que suma, lo que resta y, abajo y bajo su columna, lo que se le paga. */
function ComprobanteDePago({
  comprobante,
  unidad,
}: {
  readonly comprobante: Comprobante;
  readonly unidad: string;
}) {
  return (
    <section aria-labelledby="comprobante-titulo" className="flex flex-col gap-(--espacio-3)">
      <h3
        id="comprobante-titulo"
        className="text-xs font-medium tracking-wide text-texto-sutil uppercase"
      >
        Comprobante
      </h3>
      <Tabla
        etiqueta={`Comprobante de ${comprobante.nombreCompleto}`}
        columnas={COLUMNAS_DEL_COMPROBANTE}
        filas={renglonesDe(comprobante, unidad)}
        claveDe={(r) => r.etiqueta}
        alto="max-h-none"
        pie={{
          concepto: <span className="text-base font-semibold text-texto">Se le paga</span>,
          importe: <Dinero centavos={Number(comprobante.totalCentavos)} tamano="total" />,
        }}
      />
      <p className="text-sm text-texto-sutil">
        La propina va aparte de la comisión: no es del salón y no se comisiona.
      </p>
    </section>
  );
}

/** Mientras se leen sus comisiones: la forma del resumen y de los renglones. */
function EsqueletoDelDetalle() {
  return (
    <div className="flex flex-col gap-(--espacio-4)">
      <div className="grid grid-cols-3 gap-(--espacio-4)">
        <Esqueleto className="h-[calc(var(--altura-control)*1.25)] w-full" />
        <Esqueleto className="h-[calc(var(--altura-control)*1.25)] w-full" />
        <Esqueleto className="h-[calc(var(--altura-control)*1.25)] w-full" />
      </div>
      <EsqueletoDeLista filas={4} />
    </div>
  );
}

export function Liquidacion({ profesionalesIniciales, desde, hasta }: LiquidacionProps) {
  const voc = useVocabulario();
  const unidad = voc.singular('unidad_servicio');
  const [profesionales, setProfesionales] = useState<readonly FichaDeProfesional[] | null>(
    profesionalesIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [elegida, setElegida] = useState<FichaDeProfesional | null>(null);
  const [periodo, setPeriodo] = useState({ desde: desde ?? '', hasta: hasta ?? '' });
  const [comisiones, setComisiones] = useState<Comisiones | null>(null);
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** De quién se están leyendo las comisiones: el esqueleto del panel es suyo. */
  const [leyendo, setLeyendo] = useState<string | null>(null);
  /** El renglón que va viajando hacia el panel, sólo durante el cambio. */
  const [viajando, setViajando] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  /**
   * LA LECTURA DE COMISIONES QUE VALE. Cada toque en un nombre la sube, lea o no
   * lea, y una respuesta que llega con otro número se tira. Sin esto, tocar a A y
   * enseguida a B dejaba que la respuesta tardía de A pintara su Causado, su
   * Pendiente y sus renglones bajo el nombre de B, y «Calcular la liquidación»
   * liquidaba a B enseñando lo que causó A.
   */
  const lecturaVigente = useRef(0);

  useEffect(() => {
    if (profesionalesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      invocarComando<{ readonly profesionales: readonly FichaDeProfesional[] }>(
        RUTA_PROFESIONALES,
        { incluirInactivos: false },
      )
        .then((salida) => {
          if (sigueMontada()) setProfesionales(salida.profesionales);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada())
            setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la lista.');
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [profesionalesIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setProfesionales(null);
    setIntento((previo) => previo + 1);
  }

  function leerComisiones(profesional: FichaDeProfesional, lectura: number): void {
    // El dato, el fallo y el esqueleto son de ESTA lectura: si mientras tanto se tocó
    // otro nombre —u otra vez el mismo con otro periodo—, lo que llega ya no es de nadie.
    const sigueVigente = (): boolean => lecturaVigente.current === lectura;
    invocarComando<Comisiones>(`${RUTA_PROFESIONALES}/${profesional.profesionalId}/comisiones`, {
      desde: periodo.desde,
      hasta: periodo.hasta,
    })
      .then((datos) => {
        if (sigueVigente()) setComisiones(datos);
      })
      .catch((fallo: unknown) => {
        if (sigueVigente()) setError(mensajeDe(fallo));
      })
      .finally(() => {
        if (sigueVigente()) setLeyendo(null);
      });
  }

  /**
   * La fila se convierte en el panel. Antes del cambio el RENGLÓN lleva el nombre;
   * dentro del cambio se lo quita y lo toma el PANEL, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrir(profesional: FichaDeProfesional): void {
    const conPeriodo = periodo.desde !== '' && periodo.hasta !== '';
    // Desde este toque, ninguna lectura anterior vale: tampoco cuando éste no lee
    // porque falta el periodo.
    lecturaVigente.current += 1;
    const lectura = lecturaVigente.current;
    flushSync(() => {
      setViajando(profesional.profesionalId);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        setElegida(profesional);
        setComisiones(null);
        setComprobante(null);
        setError(null);
        setLeyendo(conPeriodo ? profesional.profesionalId : null);
      });
      panel.current?.scrollIntoView({ block: 'nearest' });
      if (conPeriodo) leerComisiones(profesional, lectura);
    });
  }

  function liquidar(): void {
    if (elegida === null) return;
    if (periodo.desde === '' || periodo.hasta === '') {
      setError('Elige el periodo.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly liquidacionId: string }>(RUTA_LIQUIDAR, {
      profesionalId: elegida.profesionalId,
      periodoDesde: periodo.desde,
      periodoHasta: periodo.hasta,
    })
      .then((salida) =>
        // El comprobante se pide ENSEGUIDA y se enseña antes de pagar: una vez
        // pagado ya no se discute, se reclama.
        invocarComando<Comprobante>(`${RUTA_COMPROBANTE}/${salida.liquidacionId}/comprobante`, {}),
      )
      .then((datos) => {
        setComprobante(datos);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer a quién se le paga"
          queHacer="Sin la lista de profesionales no se puede liquidar a nadie. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (profesionales === null) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6) xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-(--espacio-6)">
        {/* La forma de la lista y del panel, no una rueda: al llegar los nombres
            nada salta de sitio. */}
        <div className="flex flex-col gap-(--espacio-4)">
          <Esqueleto className="h-[calc(var(--altura-control)*0.8)] w-40" />
          <div className="grid grid-cols-2 gap-(--espacio-3)">
            <Esqueleto className="h-[calc(var(--altura-control)*1.2)] w-full" />
            <Esqueleto className="h-[calc(var(--altura-control)*1.2)] w-full" />
          </div>
          <EsqueletoDeLista filas={5} />
        </div>
        <Esqueleto className="hidden h-80 w-full rounded-lg md:block" />
      </div>
    );
  }

  const detalle = (() => {
    if (elegida === null) {
      return (
        <Vacio
          icono={<HandCoins />}
          titulo="Elige a quién se le va a pagar."
          explicacion="Primero el periodo, luego su nombre: se ve lo que causó renglón por renglón y su comprobante antes de pagar."
        />
      );
    }
    const encabezado = (
      <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
        <h2 className="text-xl font-semibold">
          {comprobante?.nombreCompleto ?? elegida.nombreCompleto}
        </h2>
        {elegida.rentaEstacion ? (
          <span className="text-sm text-texto-sutil">renta de {unidad}</span>
        ) : null}
      </header>
    );
    const aviso = error === null ? null : <Aviso tono="peligro" titulo={error} />;

    if (comprobante !== null) {
      return (
        <>
          {encabezado}
          {aviso}
          <ComprobanteDePago comprobante={comprobante} unidad={unidad} />
        </>
      );
    }
    if (comisiones !== null) {
      return (
        <>
          {encabezado}
          {aviso}
          <ResumenDeComisiones comisiones={comisiones} />
          <section aria-labelledby="renglones-titulo" className="flex flex-col gap-(--espacio-2)">
            <h3 id="renglones-titulo" className="font-medium">
              Renglón por renglón
            </h3>
            <Tabla
              etiqueta={`Comisiones de ${elegida.nombreCompleto}`}
              columnas={COLUMNAS_DE_LINEAS}
              filas={comisiones.lineas}
              claveDe={(l) => l.comisionId}
              tonoDeFila={(l) => (l.liquidada ? 'tenue' : undefined)}
              alto="max-h-[50vh]"
              vacio={
                <Vacio
                  icono={<ReceiptText />}
                  titulo="No hay comisiones pendientes de liquidar"
                  explicacion="En este periodo no causó ninguna."
                  className="py-(--espacio-6)"
                />
              }
            />
          </section>
          <Button
            size="lg"
            className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
            cargando={ocupado}
            onClick={liquidar}
          >
            Calcular la liquidación
          </Button>
        </>
      );
    }
    if (leyendo === elegida.profesionalId) {
      return (
        <>
          {encabezado}
          <EsqueletoDelDetalle />
        </>
      );
    }
    if (aviso !== null) {
      return (
        <>
          {encabezado}
          {aviso}
        </>
      );
    }
    return (
      <>
        {encabezado}
        <Vacio
          icono={<CalendarRange />}
          titulo="Elige el periodo."
          explicacion="Con las dos fechas puestas, vuelve a tocar su nombre para ver lo que causó."
          className="py-(--espacio-6)"
        />
      </>
    );
  })();

  // El panel lleva el nombre del viaje salvo MIENTRAS el renglón lo tiene.
  const nombreDeViaje =
    viajando === null && elegida !== null ? VIAJE.fila(elegida.profesionalId) : 'none';

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6) xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start xl:gap-(--espacio-6)">
      <section aria-labelledby="liquidacion-titulo" className="flex flex-col gap-(--espacio-4)">
        <h1 id="liquidacion-titulo" className="text-2xl font-semibold">
          Liquidación
        </h1>

        {/* El periodo va ANTES que los nombres: sin las dos fechas, tocar un nombre
            no tiene qué leer. */}
        <fieldset className="flex flex-col gap-(--espacio-2)">
          <legend className="mb-(--espacio-2) text-sm font-medium text-texto-sutil">Periodo</legend>
          <div className="grid grid-cols-2 gap-(--espacio-3)">
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                type="date"
                className="h-[calc(var(--altura-control)*1.2)]"
                value={periodo.desde}
                onChange={(evento) => {
                  setPeriodo({ ...periodo, desde: evento.target.value });
                }}
              />
            </div>
            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                type="date"
                className="h-[calc(var(--altura-control)*1.2)]"
                value={periodo.hasta}
                onChange={(evento) => {
                  setPeriodo({ ...periodo, hasta: evento.target.value });
                }}
              />
            </div>
          </div>
        </fieldset>

        <Tabla
          etiqueta="Profesionales"
          columnas={columnasDeProfesionales(unidad)}
          filas={profesionales}
          claveDe={(p) => p.profesionalId}
          {...(elegida === null ? {} : { activa: elegida.profesionalId })}
          alActivar={(id) => {
            const profesional = profesionales.find((p) => p.profesionalId === id);
            if (profesional !== undefined) abrir(profesional);
          }}
          // La fila es un control: su nombre dice qué abre, no sólo «fila». Cuál está
          // abierta lo dice la tabla con `aria-current`.
          etiquetaDeFila={(p) =>
            `Abrir la liquidación de ${p.nombreCompleto}${p.rentaEstacion ? `, renta de ${unidad}` : ''}`
          }
          viajeDeFila={(p) =>
            p.profesionalId === viajando ? VIAJE.fila(p.profesionalId) : undefined
          }
          alto="max-h-[50vh] xl:max-h-[calc(100dvh-20rem)]"
          vacio={
            <Vacio
              icono={<UsersRound />}
              titulo="Todavía no hay a quién liquidar."
              explicacion="Aquí aparece cada profesional activo. Cuando haya uno, se elige el periodo y se toca su nombre."
              className="py-(--espacio-8)"
            />
          }
        />
      </section>

      {/* EL DETALLE · a la derecha y pegado arriba en la PC; debajo de la lista en la
          tableta, y en el teléfono sólo cuando hay a quién enseñar. */}
      <Superficie
        como="section"
        ref={panel}
        relleno={4}
        aria-label={
          elegida === null
            ? 'Detalle de la liquidación'
            : `Liquidación de ${elegida.nombreCompleto}`
        }
        style={{ viewTransitionName: nombreDeViaje }}
        className={`${elegida === null ? 'hidden md:flex' : 'flex'} scroll-mt-(--espacio-4) flex-col gap-(--espacio-4) md:p-(--espacio-6) xl:sticky xl:top-(--espacio-4)`}
      >
        {detalle}
      </Superficie>
    </main>
  );
}
