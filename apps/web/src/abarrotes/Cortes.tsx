'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  TablaAdaptable,
  Vacio,
  dineroEnTexto,
  type ColumnaDeTabla,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import { ArrowDown, ArrowUp, Check, Receipt } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · cortes
 *
 * El arqueo de la noche y el histórico de los cortes que ya se hicieron.
 *
 * ── Por qué el esperado NO se enseña mientras se cuenta ─────────────────
 * Si se muestra, todo el mundo teclea ese número y el arqueo deja de existir:
 * deja de ser un conteo y pasa a ser una confirmación. Aparece DESPUÉS de
 * contar, junto a la diferencia, que es cuando de verdad sirve para algo.
 *
 * ── Por qué se cuenta por denominación y no de un tirón ─────────────────
 * Faltan $500 y falta un billete de $500 son el mismo número y dos problemas
 * distintos: el primero puede ser cambio mal dado durante todo el día, el
 * segundo es un billete que se fue. Con el total no se distinguen, y son dos
 * conversaciones opuestas.
 *
 * ── Por qué la diferencia se dice con palabra y no sólo con signo ───────
 * «−340» leído de prisa a las diez de la noche se confunde. «Faltan $340» no.
 * Y la palabra lleva además su flecha y su color: tres canales, no uno.
 *
 * ── Por qué se avisa de los movimientos SIN MOTIVO ──────────────────────
 * «Faltan $340» no le sirve a nadie. «Faltan $340 y hubo tres retiros sin
 * explicación» es una conversación que se puede tener con quien corresponde.
 *
 * ── Cómo se ve (`04-INTERFAZ` §PANTALLA 9 y 10) ─────────────────────────
 * El conteo es una HOJA DE ARQUEO: una tabla densa —denominación, piezas,
 * importe— con los números a la derecha, que se llena de arriba abajo con el
 * teclado. En la PC de la caja, que es donde se cierra, lo contado vive a la
 * derecha y se queda a la vista mientras se baja por la hoja; en tableta y
 * teléfono es una franja pegada abajo. El histórico es de lectura del dueño:
 * tabla desde la tableta, tarjetas en el teléfono, y la diferencia se puede
 * ordenar para encontrar el día que no cuadró.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben contar, cerrar y ver los cortes anteriores con su diferencia. Queda
 * fuera el detalle movimiento por movimiento, que vive en REGISTROS.
 */

const RUTA_CERRAR = '/api/caja/cerrar';
const RUTA_ESTADO = '/api/caja/estado';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PIEZAS_CON_FORMA = /^\d{1,4}$/;

/** Las denominaciones que de verdad hay en un cajón de tiendita. */
const DENOMINACIONES = [500_00, 200_00, 100_00, 50_00, 20_00, 10_00, 5_00, 2_00, 1_00] as const;

/** El ancho y el ritmo de la pantalla, el mismo en sus tres estados. */
const CONTENEDOR =
  'mx-auto flex w-full max-w-5xl flex-col gap-(--espacio-6) p-(--espacio-4) md:p-(--espacio-6)';
const DOS_COLUMNAS = 'grid gap-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start';

/**
 * UN CORTE DEL HISTÓRICO, con los nombres que el puente SIRVE.
 *
 * Aquí se leían `fecha`, `esperado_centavos`, `contado_centavos` y `empleado`, y la
 * entidad `CorteCaja` no sirve ninguno de los cuatro: sirve `fecha_cierre`,
 * `efectivo_contado` —en PESOS, por la conversión `dinero`— y
 * `usuario_cajero_nombre`. Los cuatro llegaban `undefined`, así que el histórico
 * enseñaba «sin firma» en cada renglón y la diferencia salía `NaN`.
 *
 * El ESPERADO no se sirve, y no es un olvido: no es una columna. Se deriva de la
 * suma de `movimientos_caja` de esa sesión, y el que decide el arqueo lo calcula
 * `caja.documento_corte`. Aquí se declara opcional para que la pantalla tenga que
 * decir «—» en vez de restar contra `undefined` y enseñar un faltante inventado.
 */
export interface CorteHecho {
  readonly id: string;
  readonly fecha_cierre: string | null;
  /** EN PESOS, como lo sirve el puente. */
  readonly efectivo_contado: number | null;
  readonly usuario_cajero_nombre: string | null;
  /** No se sirve: se deriva de los movimientos. Ver la cabecera. */
  readonly esperado_centavos?: number;
}

export interface ResumenDelTurno {
  readonly sesionCajaId: string | null;
  readonly movimientosSinMotivo: number;
}

/**
 * Lo que `caja.cerrar` devuelve, y de donde sale el ESPERADO de verdad.
 *
 * ── El defecto que esto arregla ────────────────────────────────────────────
 * Esta pantalla leía `esperadoCentavos` del estado del turno, y **ese campo no
 * existe**: `caja.estado` sirve `efectivoEsperadoCentavos`, y sólo cuando se le
 * manda lo contado —a proposito, porque contar con el numero delante no es
 * contar—. Asi que `esperado` valia siempre 0 y cada cierre decia «Sobran
 * <todo lo contado>»: un cajero que cerraba con $542.90 leia «Sobran $542.90»,
 * que es justo el numero con el que se decide si alguien se llevo dinero.
 *
 * El cierre SI devuelve el arqueo entero. Se usa el suyo.
 */
export interface ResultadoDelCorte {
  readonly efectivoEsperadoCentavos: string;
  readonly efectivoContadoCentavos: string;
  readonly diferenciaCentavos: string;
}

export interface CortesProps {
  readonly resumenInicial?: ResumenDelTurno;
  readonly historicoInicial?: readonly CorteHecho[];
}

/** «Faltan», no «−»: leído de prisa a las diez de la noche el signo se confunde. */
type Sentido = 'cuadra' | 'faltan' | 'sobran';

function sentidoDe(centavos: number): Sentido {
  if (centavos === 0) return 'cuadra';
  return centavos < 0 ? 'faltan' : 'sobran';
}

const PALABRA: Readonly<Record<Sentido, string>> = {
  cuadra: 'Cuadra exacto',
  faltan: 'Faltan',
  sobran: 'Sobran',
};
const ICONO = { cuadra: Check, faltan: ArrowDown, sobran: ArrowUp } as const;
const TONO_DEL_ICONO: Readonly<Record<Sentido, string>> = {
  cuadra: 'text-exito',
  faltan: 'text-peligro',
  sobran: 'text-advertencia',
};
/** La palabra grande. Lo que sobra no es una buena noticia, pero tampoco una alarma. */
const TONO_DE_LA_PALABRA: Readonly<Record<Sentido, string>> = {
  cuadra: 'text-exito',
  faltan: 'text-peligro',
  sobran: 'text-texto',
};
const TINTE: Readonly<Record<Sentido, string>> = {
  cuadra: 'border-exito bg-exito/5',
  faltan: 'border-peligro bg-peligro/5',
  sobran: 'border-advertencia bg-advertencia/10',
};
const TONO_DE_FILA: Readonly<Record<Sentido, TonoDeFila | undefined>> = {
  cuadra: undefined,
  faltan: 'peligro',
  sobran: 'advertencia',
};

/** Las piezas de una denominación. Vacío es cero; lo que no es un número, `null`. */
function piezasDe(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === '') return 0;
  return PIEZAS_CON_FORMA.test(limpio) ? Number(limpio) : null;
}

/** Piezas × denominación, en centavos enteros. Nada de punto flotante. */
export function totalContado(piezas: Readonly<Record<number, string>>): number {
  return DENOMINACIONES.reduce(
    (total, denominacion) => total + (piezasDe(piezas[denominacion] ?? '') ?? 0) * denominacion,
    0,
  );
}

function aCentavosSueltos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return 0;
  if (!IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo cerrar. Lo contado sigue aquí: vuelve a intentarlo.';
}

/** Lo contado de un corte del histórico, en centavos. `null`: no se contó. */
function contadoDe(corte: CorteHecho): number | null {
  return corte.efectivo_contado === null ? null : Math.round(corte.efectivo_contado * 100);
}

/** La diferencia de un corte del histórico. `null`: no hay esperado contra qué restar. */
function diferenciaDe(corte: CorteHecho): number | null {
  if (corte.esperado_centavos === undefined) return null;
  return Math.round((corte.efectivo_contado ?? 0) * 100) - corte.esperado_centavos;
}

const CUANDO = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** El día Y la hora: dos cortes el mismo día son dos turnos, y la hora dice cuál. */
function cuandoSeCerro(fecha: string | null): string {
  if (fecha === null) return 'Sin cerrar';
  const momento = new Date(fecha);
  return Number.isNaN(momento.getTime()) ? fecha.slice(0, 10) : CUANDO.format(momento);
}

/** La diferencia, dicha: flecha, palabra e importe sin signo. */
function Diferencia({
  centavos,
  grande = false,
}: {
  readonly centavos: number;
  readonly grande?: boolean;
}) {
  const sentido = sentidoDe(centavos);
  const Icono = ICONO[sentido];
  return (
    <span className={grande ? 'text-3xl font-semibold' : 'font-medium'}>
      <Icono
        aria-hidden="true"
        className={`mr-(--espacio-1) inline size-[0.9em] align-[-0.1em] ${TONO_DEL_ICONO[sentido]}`}
      />
      <span className={grande ? TONO_DE_LA_PALABRA[sentido] : ''}>{PALABRA[sentido]}</span>
      {sentido === 'cuadra' ? null : (
        <>
          {' '}
          <Dinero
            centavos={Math.abs(centavos)}
            tamano={grande ? 'lg' : 'sm'}
            {...(grande ? { className: 'text-3xl font-semibold' } : {})}
          />
        </>
      )}
    </span>
  );
}

/** Una celda sin dato: el guion se ve, y el lector de pantalla oye por qué. */
function SinDato({ porque }: { readonly porque: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-texto-sutil">
        —
      </span>
      <span className="sr-only">{porque}</span>
    </>
  );
}

/** Un renglón de la hoja: una denominación, o los sueltos que se teclean en pesos. */
interface RenglonDeLaHoja {
  /** El `id` del campo —`d-50000`, `sueltos`—: las pruebas lo usan. */
  readonly id: string;
  /** `null`: el renglón de los sueltos. */
  readonly denominacion: number | null;
}

const RENGLONES: readonly RenglonDeLaHoja[] = [
  ...DENOMINACIONES.map((denominacion) => ({ id: `d-${String(denominacion)}`, denominacion })),
  { id: 'sueltos', denominacion: null },
];

interface HojaDeArqueoProps {
  readonly piezas: Readonly<Record<number, string>>;
  readonly alCambiarPiezas: (denominacion: number, texto: string) => void;
  readonly otrosCentavos: string;
  readonly alCambiarSueltos: (texto: string) => void;
  readonly sueltos: number | null;
  readonly contado: number;
  readonly guardando: boolean;
  readonly error: string | null;
  readonly alCerrar: () => void;
}

/** ¿El renglón tiene algo tecleado que no se puede leer? Se dice en su importe. */
function renglonInvalido(renglon: RenglonDeLaHoja, props: HojaDeArqueoProps): boolean {
  if (renglon.denominacion === null) return props.sueltos === null;
  return piezasDe(props.piezas[renglon.denominacion] ?? '') === null;
}

function importeDelRenglon(renglon: RenglonDeLaHoja, props: HojaDeArqueoProps): ReactNode {
  const { denominacion } = renglon;
  const texto = denominacion === null ? props.otrosCentavos : (props.piezas[denominacion] ?? '');
  if (texto.trim() === '') return <SinDato porque="sin contar" />;
  if (renglonInvalido(renglon, props)) {
    return (
      <span className="text-sm font-medium text-peligro">
        {denominacion === null ? 'Sólo pesos y centavos' : 'Sólo piezas enteras'}
      </span>
    );
  }
  const centavos =
    denominacion === null ? (props.sueltos ?? 0) : (piezasDe(texto) ?? 0) * denominacion;
  return <Dinero centavos={centavos} tamano="sm" />;
}

function campoDelRenglon(renglon: RenglonDeLaHoja, props: HojaDeArqueoProps): ReactNode {
  const { denominacion } = renglon;
  const clases = 'h-[calc(var(--altura-control)*0.85)] text-right font-numeros tabular-nums';
  if (denominacion === null) {
    return (
      <Input
        id="sueltos"
        inputMode="decimal"
        placeholder="0.00"
        aria-invalid={props.sueltos === null}
        className={`w-28 ${clases}`}
        value={props.otrosCentavos}
        onChange={(evento) => {
          props.alCambiarSueltos(evento.target.value);
        }}
      />
    );
  }
  return (
    <Input
      id={renglon.id}
      inputMode="numeric"
      placeholder="0"
      aria-label={`Piezas de ${dineroEnTexto(denominacion)}`}
      aria-invalid={renglonInvalido(renglon, props)}
      className={`w-24 ${clases}`}
      value={props.piezas[denominacion] ?? ''}
      onChange={(evento) => {
        props.alCambiarPiezas(denominacion, evento.target.value);
      }}
    />
  );
}

/**
 * LA HOJA DE ARQUEO · se cuenta de arriba abajo, y lo contado se queda a la vista.
 *
 * Es una tabla porque es una hoja: la misma columna de piezas se llena con el
 * tabulador de billete en billete, y el importe de cada renglón deja ver al
 * momento si un «4» cayó en los de $500 en vez de en los de $50.
 */
function HojaDeArqueo(props: HojaDeArqueoProps) {
  const columnas: readonly ColumnaDeTabla<RenglonDeLaHoja>[] = [
    {
      clave: 'denominacion',
      titulo: 'Denominación',
      celda: (renglon) => (
        <Label htmlFor={renglon.id}>
          {renglon.denominacion === null ? (
            'Centavos sueltos'
          ) : (
            <Dinero centavos={renglon.denominacion} tamano="base" />
          )}
        </Label>
      ),
    },
    {
      clave: 'piezas',
      titulo: 'Piezas',
      numerica: true,
      celda: (renglon) => campoDelRenglon(renglon, props),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (renglon) => importeDelRenglon(renglon, props),
    },
  ];

  return (
    <section aria-labelledby="cuenta-el-cajon" className={DOS_COLUMNAS}>
      <div className="flex flex-col gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="cuenta-el-cajon" className="text-lg font-semibold">
            Cuenta el cajón
          </h2>
          <p className="max-w-prose text-sm text-texto-sutil">
            Por denominación. Faltar $500 y faltar un billete de $500 son dos problemas distintos.
            El esperado aparece al cerrar: contar con el número delante no es contar.
          </p>
        </div>
        <Tabla
          etiqueta="Hoja de arqueo"
          columnas={columnas}
          filas={RENGLONES}
          claveDe={(renglon) => renglon.id}
          tonoDeFila={(renglon) => (renglonInvalido(renglon, props) ? 'peligro' : undefined)}
          alto="max-h-none"
        />
      </div>

      {/* Pegado abajo en tableta y teléfono, a la derecha en la PC: lo contado no
          se pierde de vista mientras se baja por la hoja. */}
      <Superficie
        como="aside"
        aria-label="Lo contado"
        nivel={3}
        className="sticky bottom-(--espacio-2) z-10 flex flex-col gap-(--espacio-3) xl:top-(--espacio-4) xl:bottom-auto xl:shadow-1"
      >
        <p className="flex flex-col">
          <span className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
            Contado
          </span>{' '}
          <Dinero centavos={props.contado} tamano="lg" className="text-3xl font-semibold" />
        </p>
        <Button
          size="lg"
          className="w-full"
          disabled={props.guardando || props.contado === 0}
          cargando={props.guardando}
          onClick={props.alCerrar}
        >
          Cerrar el turno
        </Button>
        {props.error !== null && (
          <Aviso tono="peligro" titulo={props.error}>
            El turno sigue abierto y lo contado sigue en la hoja.
          </Aviso>
        )}
      </Superficie>
    </section>
  );
}

/** El arqueo ya hecho: la diferencia manda, y el esperado aparece por fin. */
function CorteDelTurno({
  corte,
  movimientosSinMotivo,
}: {
  readonly corte: ResultadoDelCorte;
  readonly movimientosSinMotivo: number;
}) {
  const diferencia = Number(corte.diferenciaCentavos);
  return (
    <Superficie
      como="section"
      aria-labelledby="turno-cerrado"
      relleno={6}
      className={`flex flex-col gap-(--espacio-3) ${TINTE[sentidoDe(diferencia)]}`}
    >
      <h2 id="turno-cerrado" className="text-lg font-semibold">
        Turno cerrado
      </h2>
      <p>
        <Diferencia centavos={diferencia} grande />
      </p>
      <p className="text-base">
        Esperado <Dinero centavos={Number(corte.efectivoEsperadoCentavos)} /> · contado{' '}
        <Dinero centavos={Number(corte.efectivoContadoCentavos)} />
      </p>
      {movimientosSinMotivo > 0 && (
        <Aviso
          tono="atencion"
          titulo={`Hubo ${String(movimientosSinMotivo)} movimiento${movimientosSinMotivo === 1 ? '' : 's'} sin explicación`}
        >
          Es lo primero que hay que mirar.
        </Aviso>
      )}
    </Superficie>
  );
}

function columnasDelHistorico(cajero: string): readonly ColumnaDeTabla<CorteHecho>[] {
  return [
    {
      clave: 'fecha',
      titulo: 'Fecha',
      orden: (corte) => corte.fecha_cierre ?? '',
      celda: (corte) => <span className="font-medium">{cuandoSeCerro(corte.fecha_cierre)}</span>,
    },
    {
      clave: 'cajero',
      titulo: cajero,
      celda: (corte) => corte.usuario_cajero_nombre ?? 'sin firma',
    },
    {
      clave: 'contado',
      titulo: 'Contado',
      numerica: true,
      orden: (corte) => contadoDe(corte) ?? -1,
      celda: (corte) => {
        const contado = contadoDe(corte);
        return contado === null ? (
          <SinDato porque="sin conteo" />
        ) : (
          <Dinero centavos={contado} tamano="sm" />
        );
      },
    },
    {
      clave: 'diferencia',
      titulo: 'Diferencia',
      numerica: true,
      // Ascendente, el faltante más grande sale primero: el dueño entra aquí
      // buscando el día que no cuadró. Lo que no tiene esperado va al final.
      orden: (corte) => diferenciaDe(corte) ?? Number.MAX_SAFE_INTEGER,
      celda: (corte) => {
        const diferencia = diferenciaDe(corte);
        return diferencia === null ? (
          <SinDato porque="sin esperado contra qué comparar" />
        ) : (
          <Diferencia centavos={diferencia} />
        );
      },
    },
  ];
}

function HistoricoDeCortes({
  historico,
  fallo,
  alReintentar,
  cajero,
}: {
  readonly historico: readonly CorteHecho[] | null;
  readonly fallo: string | null;
  readonly alReintentar: () => void;
  readonly cajero: string;
}) {
  const contenido = (() => {
    if (fallo !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudieron leer los cortes anteriores"
          queHacer="El arqueo de hoy no depende de esto: se puede contar y cerrar. Revisa la conexión y vuelve a leerlos."
          detalle={fallo}
          reintentar={
            <Button variant="outline" onClick={alReintentar}>
              Volver a leer
            </Button>
          }
        />
      );
    }
    if (historico === null) return <EsqueletoDeLista filas={5} />;
    return (
      <TablaAdaptable
        etiqueta="Cortes anteriores"
        principal="fecha"
        desde="md"
        columnas={columnasDelHistorico(cajero)}
        filas={historico}
        claveDe={(corte) => corte.id}
        tonoDeFila={(corte) => {
          const diferencia = diferenciaDe(corte);
          return diferencia === null ? undefined : TONO_DE_FILA[sentidoDe(diferencia)];
        }}
        vacio={
          <Vacio
            icono={<Receipt />}
            titulo="Todavía no hay cortes."
            explicacion="Cada turno que se cierra deja aquí su corte: cuándo, quién cerró y cuánto contó."
          />
        }
      />
    );
  })();

  return (
    <section aria-labelledby="cortes-anteriores" className="flex flex-col gap-(--espacio-3)">
      <h2 id="cortes-anteriores" className="text-lg font-semibold">
        Cortes anteriores
      </h2>
      {contenido}
    </section>
  );
}

export function Cortes({ resumenInicial, historicoInicial }: CortesProps) {
  const voc = useVocabulario();
  const [resumen, setResumen] = useState<ResumenDelTurno | null>(resumenInicial ?? null);
  const [falloDelTurno, setFalloDelTurno] = useState<string | null>(null);
  const [historico, setHistorico] = useState<readonly CorteHecho[] | null>(
    historicoInicial ?? null,
  );
  const [falloDelHistorico, setFalloDelHistorico] = useState<string | null>(null);
  // Cada lectura tiene su intento: reintentar sube el número y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intentoDelTurno, setIntentoDelTurno] = useState(0);
  const [intentoDelHistorico, setIntentoDelHistorico] = useState(0);
  const [piezas, setPiezas] = useState<Readonly<Record<number, string>>>({});
  const [otrosCentavos, setOtrosCentavos] = useState('');
  const [corte, setCorte] = useState<ResultadoDelCorte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (resumenInicial !== undefined) return;
    let vivo = true;
    const arranque = setTimeout(() => {
      invocarComando<ResumenDelTurno>(RUTA_ESTADO, {})
        .then((datos) => {
          if (vivo) setResumen(datos);
        })
        .catch((fallo: unknown) => {
          if (vivo) setFalloDelTurno(fallo instanceof Error ? fallo.message : 'Sin respuesta.');
        });
    });
    return () => {
      vivo = false;
      clearTimeout(arranque);
    };
  }, [resumenInicial, intentoDelTurno]);

  useEffect(() => {
    if (historicoInicial !== undefined) return;
    const control = new AbortController();
    const arranque = setTimeout(() => {
      consultarPuente<CorteHecho>('CorteCaja', {
        limite: 20,
        // Descendente se escribe con un guion delante, que es la sintaxis del
        // puente —`orden.startsWith('-')`— y la de su código original. Aquí
        // decía `'fecha_cierre:desc'`, de la plataforma anterior, y el puente
        // contestaba 400 «no se puede ordenar por «fecha_cierre:desc»»: el
        // histórico de cortes salía vacío en una pantalla que abría en 200.
        orden: '-fecha_cierre',
        signal: control.signal,
      })
        .then((filas) => {
          if (!control.signal.aborted) setHistorico(filas);
        })
        .catch((fallo: unknown) => {
          // Un histórico que no se leyó NO es un histórico vacío: «todavía no hay
          // cortes» con cortes hechos es la mentira que más tarda en verse.
          if (!control.signal.aborted)
            setFalloDelHistorico(fallo instanceof Error ? fallo.message : 'Sin respuesta.');
        });
    });
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [historicoInicial, intentoDelHistorico]);

  const sueltos = aCentavosSueltos(otrosCentavos);
  const contado = totalContado(piezas) + (sueltos ?? 0);
  const abierta = resumen?.sesionCajaId != null;
  const cajero = voc.titulo('responsable');

  function cerrar(): void {
    if (sueltos === null) {
      setError('Revisa el importe suelto: sólo pesos y centavos.');
      return;
    }
    setGuardando(true);
    setError(null);
    invocarComando<ResultadoDelCorte>(RUTA_CERRAR, { efectivoContadoCentavos: contado })
      .then((resultado) => {
        // El esperado aparece AHORA, y no antes: contar con el número delante
        // no es contar. Y sale del cierre, que es quien lo calculó sumando los
        // movimientos del turno —la apertura con su fondo y cada venta en efectivo—.
        setCorte(resultado);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  const encabezado = <h1 className="text-2xl font-semibold">Cortes</h1>;

  if (falloDelTurno !== null) {
    return (
      <main className={CONTENEDOR}>
        {encabezado}
        <ErrorDePantalla
          className="max-w-lg"
          titulo="No se pudo leer el turno"
          queHacer="Sin saber si hay un turno abierto no se puede contar ni cerrar. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDelTurno}
          reintentar={
            <Button
              onClick={() => {
                setFalloDelTurno(null);
                setIntentoDelTurno((previo) => previo + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
        />
      </main>
    );
  }

  if (resumen === null) {
    return (
      <main className={CONTENEDOR}>
        {encabezado}
        {/* La forma de la hoja y de lo contado, no una rueda: al llegar el turno
            nada salta de sitio. */}
        <div role="status" aria-busy="true" aria-label="Leyendo el turno" className={DOS_COLUMNAS}>
          <div className="flex flex-col gap-(--espacio-2)">
            {DENOMINACIONES.map((denominacion) => (
              <div key={denominacion} className="flex items-center gap-(--espacio-3)">
                <Esqueleto className="h-4 w-20" />
                <Esqueleto className="ml-auto h-[calc(var(--altura-control)*0.85)] w-24" />
                <Esqueleto className="h-4 w-24" />
              </div>
            ))}
          </div>
          <Esqueleto className="h-40 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  return (
    <main className={CONTENEDOR}>
      {encabezado}

      {corte !== null && (
        <CorteDelTurno corte={corte} movimientosSinMotivo={resumen.movimientosSinMotivo} />
      )}

      {corte === null && abierta && (
        <HojaDeArqueo
          piezas={piezas}
          alCambiarPiezas={(denominacion, texto) => {
            setPiezas((previas) => ({ ...previas, [denominacion]: texto }));
          }}
          otrosCentavos={otrosCentavos}
          alCambiarSueltos={setOtrosCentavos}
          sueltos={sueltos}
          contado={contado}
          guardando={guardando}
          error={error}
          alCerrar={cerrar}
        />
      )}

      {corte === null && !abierta && (
        <Aviso
          tono="info"
          titulo="No hay turno abierto"
          accion={
            <Button asChild variant="outline" size="sm">
              <a href="/abarrotes/caja">Ir a Caja</a>
            </Button>
          }
        >
          No hay cajón que contar. El turno se abre en Caja; aquí quedan los cortes que ya se
          hicieron.
        </Aviso>
      )}

      <HistoricoDeCortes
        historico={historico}
        fallo={falloDelHistorico}
        cajero={cajero === '' ? 'Quién cerró' : cajero}
        alReintentar={() => {
          setFalloDelHistorico(null);
          setHistorico(null);
          setIntentoDelHistorico((previo) => previo + 1);
        }}
      />
    </main>
  );
}
