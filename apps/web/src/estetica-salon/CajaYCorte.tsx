'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  CampoDeDinero,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  CircleAlert,
  CircleCheck,
  LockKeyhole,
  LockKeyholeOpen,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · caja-y-corte
 *
 * El cierre del día en un salón, que tiene una salida que los demás no tienen:
 * las liquidaciones.
 *
 * ── Por qué la liquidación aparece EN el corte ──────────────────────────
 * Porque es la salida de efectivo más grande del día y sale del mismo cajón. Un
 * corte que no la ve encuentra $18,000 de menos un viernes cada quince y nadie
 * puede explicarlo con el arqueo delante. Aquí se ve como lo que es: dinero que
 * salió, con nombre.
 *
 * ── Por qué la propina entregada tampoco es un gasto ────────────────────
 * Es dinero de las clientas que pasó por el cajón. Contarla como gasto del
 * salón baja la utilidad del mes con dinero que nunca fue del salón; no
 * contarla deja el cajón descuadrado. Se enseña en su propio renglón.
 *
 * ── Por qué el esperado no se ve antes de contar ────────────────────────
 * Si se muestra, todo el mundo teclea ese número. Aparece con la diferencia,
 * después, que es cuando sirve.
 *
 * ── Y por qué se avisa de las citas sin cerrar ──────────────────────────
 * Un servicio sin cerrar no descontó producto de cabina. Cerrar el día con tres
 * pendientes deja el inventario de tinte inflado hasta que alguien se acuerde,
 * y nadie se acuerda.
 *
 * ── Cómo se reparte · la tableta de recepción y la PC de la noche ───────
 * `04-INTERFAZ` §4.3.8: 1 el estado · 2 el movimiento del día · 3 el arqueo. Arriba,
 * si el día está abierto. Debajo, lo que entró y lo que salió como un RECIBO —una
 * tabla con una sola columna de importes, que se lee de arriba abajo—. Y al pie, el
 * arqueo con el botón grande: en la tableta y en el teléfono es lo último que se
 * toca. En la PC el arqueo va a la derecha y el día se queda abierto a su lado,
 * porque ahí es donde se revisa cuando algo no cuadró.
 *
 * La diferencia es lo más grande de la pantalla y sólo aparece al cerrar, con su
 * palabra —cuadra, faltan, sobran—, su icono y su tinte. El color nunca va solo.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben abrir, el resumen del día con sus salidas, el arqueo y el cierre. Queda
 * fuera el detalle de cada cobro, que vive en el histórico de citas.
 */

const RUTA_ESTADO = '/api/caja/estado';
const RUTA_ABRIR = '/api/caja/abrir';
const RUTA_CERRAR = '/api/caja/cerrar';

/** El marco de la pantalla: una columna en la tableta, dos en la PC. */
const MARCO =
  'mx-auto flex w-full max-w-2xl flex-col gap-(--espacio-6) p-(--espacio-4) sm:p-(--espacio-6) xl:max-w-5xl';
const REJILLA = 'grid gap-(--espacio-6) xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start';
/** Los dos botones del día se tocan con el pulgar, de pie, al abrir y al cerrar. */
const BOTON_DEL_DIA = 'h-[calc(var(--altura-control)*1.4)] w-full text-base';

/**
 * Lo que `caja.cerrar` devuelve, y de donde sale el ESPERADO de verdad.
 *
 * ── El mismo defecto que tenia el corte del mostrador ─────────────────────
 * `esperadoCentavos` NO existe en la respuesta de `caja.estado`: lo que hay es
 * `efectivoEsperadoCentavos`, y solo cuando se le manda lo contado —a proposito,
 * porque contar con el numero delante no es contar—. Asi que el esperado valia
 * `NaN` aqui y `0` en el mostrador, y el dia se cerraba diciendo «Sobran <todo
 * lo contado>». Es el numero con el que se decide si alguien se llevo dinero.
 *
 * El cierre SI devuelve el arqueo entero. Se usa el suyo.
 */
export interface ResultadoDelCorte {
  readonly efectivoEsperadoCentavos: string;
  readonly efectivoContadoCentavos: string;
  readonly diferenciaCentavos: string;
}

export interface EstadoDelSalon {
  readonly sesionCajaId: string | null;
  readonly cobradoCentavos: string;
  readonly liquidacionesCentavos: string;
  readonly propinasEntregadasCentavos: string;
  readonly rentasCobradasCentavos: string;
  readonly citasSinCerrar: number;
}

export interface CajaYCorteProps {
  readonly estadoInicial?: EstadoDelSalon;
}

/** Un renglón del día. Con signo: lo que entró suma, lo que salió del cajón resta. */
interface Movimiento {
  readonly clave: string;
  readonly concepto: string;
  readonly nota?: string;
  readonly centavos: number;
}

/** Lo que salió mal, y de quién: una corrección del tecleo o un rechazo del servidor. */
interface Tropiezo {
  readonly mensaje: string;
  readonly delServidor: boolean;
}

type TonoDeDiferencia = 'exito' | 'peligro' | 'atencion';

/** Cómo se lee la diferencia del arqueo: su palabra, su importe y su tono. */
export interface LecturaDeDiferencia {
  readonly palabra: 'Cuadra exacto' | 'Faltan' | 'Sobran';
  /** Siempre positivo: la palabra ya dice hacia dónde. */
  readonly centavos: number;
  readonly tono: TonoDeDiferencia;
}

/** Cómo está el día: se lee antes que cualquier número. */
type Situacion = 'abierta' | 'cerrada' | 'cortada';

const SITUACIONES: Readonly<
  Record<Situacion, { readonly icono: LucideIcon; readonly frase: string; readonly tinte: string }>
> = {
  abierta: { icono: LockKeyholeOpen, frase: 'El día está abierto.', tinte: 'text-exito' },
  cerrada: { icono: LockKeyhole, frase: 'Ábrelo para poder cobrar.', tinte: 'text-texto-sutil' },
  cortada: { icono: LockKeyhole, frase: 'El día quedó cerrado.', tinte: 'text-texto-sutil' },
};

/** El tinte y el icono de la diferencia. El icono va SIEMPRE con la palabra. */
const DIFERENCIAS: Readonly<
  Record<TonoDeDiferencia, { readonly icono: LucideIcon; readonly tinte: string }>
> = {
  exito: { icono: CircleCheck, tinte: 'border-exito bg-exito/10' },
  peligro: { icono: TriangleAlert, tinte: 'border-peligro bg-peligro/10' },
  atencion: { icono: CircleAlert, tinte: 'border-advertencia bg-advertencia/10' },
};

/** El recibo del día: el concepto con su nota, y una sola columna de importes. */
const COLUMNAS_DEL_DIA: readonly ColumnaDeTabla<Movimiento>[] = [
  {
    clave: 'concepto',
    titulo: 'Movimiento',
    celda: (m) => (
      <span className="flex flex-col gap-(--espacio-1)">
        <span className="font-medium">{m.concepto}</span>
        {m.nota === undefined ? null : <span className="text-xs text-texto-sutil">{m.nota}</span>}
      </span>
    ),
  },
  {
    clave: 'importe',
    titulo: 'Importe',
    numerica: true,
    // Con signo: lo que entró en verde, lo que salió en rojo y entre paréntesis.
    celda: (m) => <Dinero centavos={m.centavos} conSigno />,
  },
];

/** «Faltan $340», no «−340»: leído de prisa a las nueve de la noche se confunde. */
export function leerDiferencia(centavos: number): LecturaDeDiferencia {
  if (centavos === 0) return { palabra: 'Cuadra exacto', centavos: 0, tono: 'exito' };
  if (centavos < 0) return { palabra: 'Faltan', centavos: -centavos, tono: 'peligro' };
  return { palabra: 'Sobran', centavos, tono: 'atencion' };
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

/** Los cuatro renglones del día, en el orden en que se explican: lo que entró y lo que salió. */
function movimientosDe(estado: EstadoDelSalon, notaDePropina: string): readonly Movimiento[] {
  return [
    { clave: 'cobrado', concepto: 'Cobrado', centavos: Number(estado.cobradoCentavos) },
    {
      clave: 'rentas',
      concepto: 'Rentas cobradas',
      centavos: Number(estado.rentasCobradasCentavos),
    },
    // La salida más grande del día, y sale del mismo cajón: un corte que no la ve
    // encuentra $18,000 de menos un viernes cada quince.
    {
      clave: 'liquidaciones',
      concepto: 'Liquidaciones pagadas',
      centavos: -Number(estado.liquidacionesCentavos),
    },
    {
      clave: 'propinas',
      concepto: 'Propinas entregadas',
      nota: notaDePropina,
      centavos: -Number(estado.propinasEntregadasCentavos),
    },
  ];
}

/** Lo que salió mal, JUNTO al botón que se tocó, y lo que NO pasó. */
function AvisoDeTropiezo({
  tropiezo,
  siRechaza,
}: {
  readonly tropiezo: Tropiezo | null;
  readonly siRechaza?: string;
}) {
  if (tropiezo === null) return null;
  if (tropiezo.delServidor) {
    return (
      <Aviso tono="peligro" titulo={tropiezo.mensaje}>
        {siRechaza}
      </Aviso>
    );
  }
  return (
    <Aviso tono="atencion" titulo={tropiezo.mensaje}>
      No se mandó nada.
    </Aviso>
  );
}

function Encabezado({ situacion }: { readonly situacion: Situacion | 'leyendo' | null }) {
  let linea = null;
  if (situacion === 'leyendo') linea = <Esqueleto className="h-5 w-48" />;
  else if (situacion !== null) {
    const { icono: Icono, frase, tinte } = SITUACIONES[situacion];
    linea = (
      <p className="flex items-center gap-(--espacio-2) font-medium">
        <Icono aria-hidden="true" className={`size-5 shrink-0 ${tinte}`} />
        {frase}
      </p>
    );
  }
  return (
    <header className="flex flex-col gap-(--espacio-2)">
      <h1 className="text-2xl font-semibold">Caja y corte</h1>
      {linea}
    </header>
  );
}

/** El recibo del día. En la PC se queda abierto junto al arqueo: es la cascada. */
function ElDia({ movimientos }: { readonly movimientos: readonly Movimiento[] }) {
  return (
    <section aria-labelledby="el-dia-titulo" className="flex flex-col gap-(--espacio-3)">
      <h2 id="el-dia-titulo" className="font-semibold">
        El día
      </h2>
      <Tabla
        etiqueta="Movimiento del día"
        columnas={COLUMNAS_DEL_DIA}
        filas={movimientos}
        claveDe={(m) => m.clave}
        alto="max-h-none"
      />
    </section>
  );
}

/** La respuesta a «¿cuadró?», que es la pregunta de la pantalla. */
function Resultado({ corte }: { readonly corte: ResultadoDelCorte }) {
  const lectura = leerDiferencia(Number(corte.diferenciaCentavos));
  const { icono: Icono, tinte } = DIFERENCIAS[lectura.tono];
  // Lo dice el CIERRE, que es quien lo calculo sumando los movimientos del dia.
  const esperado = Number(corte.efectivoEsperadoCentavos);
  return (
    <Superficie
      como="section"
      relleno={4}
      aria-labelledby="corte-titulo"
      className={`flex flex-col gap-(--espacio-4) sm:p-(--espacio-6) ${tinte}`}
    >
      <h2 id="corte-titulo" className="text-sm font-medium text-texto-sutil">
        Día cerrado
      </h2>
      <p className="flex flex-wrap items-center gap-(--espacio-2) text-3xl leading-none font-semibold">
        <Icono aria-hidden="true" className="size-[0.9em] shrink-0" />
        <span>{lectura.palabra}</span>{' '}
        {lectura.centavos === 0 ? null : (
          <Dinero
            centavos={lectura.centavos}
            tamano="lg"
            className="text-3xl leading-none font-semibold"
          />
        )}
      </p>
      <dl className="grid grid-cols-2 gap-(--espacio-3) border-t border-borde pt-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">Esperado</dt>
          <dd>
            <Dinero centavos={esperado} />
          </dd>
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">Contado</dt>
          <dd>
            <Dinero centavos={Number(corte.efectivoContadoCentavos)} />
          </dd>
        </div>
      </dl>
    </Superficie>
  );
}

export function CajaYCorte({ estadoInicial }: CajaYCorteProps) {
  const voc = useVocabulario();
  const [estado, setEstado] = useState<EstadoDelSalon | null>(estadoInicial ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  const [intento, setIntento] = useState(0);
  const [fondo, setFondo] = useState<number | null>(null);
  const [contado, setContado] = useState<number | null>(null);
  const [corte, setCorte] = useState<ResultadoDelCorte | null>(null);
  const [tropiezo, setTropiezo] = useState<Tropiezo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (estadoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      invocarComando<EstadoDelSalon>(RUTA_ESTADO, {})
        .then((datos) => {
          if (sigueMontada()) setEstado(datos);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setFalloDeCarga(mensajeDe(fallo));
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [estadoInicial, intento]);

  function abrir(): void {
    const centavos = fondo;
    if (centavos === null) {
      setTropiezo({ mensaje: 'Revisa el fondo: sólo pesos y centavos.', delServidor: false });
      return;
    }
    setOcupado(true);
    setTropiezo(null);
    invocarComando(RUTA_ABRIR, { fondoInicialCentavos: centavos })
      .then(() => invocarComando<EstadoDelSalon>(RUTA_ESTADO, {}))
      .then((datos) => {
        setEstado(datos);
      })
      .catch((fallo: unknown) => {
        setTropiezo({ mensaje: mensajeDe(fallo), delServidor: true });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function cerrar(): void {
    const centavos = contado;
    if (centavos === null) {
      setTropiezo({ mensaje: 'Pon lo que contaste.', delServidor: false });
      return;
    }
    setOcupado(true);
    setTropiezo(null);
    invocarComando<ResultadoDelCorte>(RUTA_CERRAR, { efectivoContadoCentavos: centavos })
      .then((resultado) => {
        setCorte(resultado);
      })
      .catch((fallo: unknown) => {
        setTropiezo({ mensaje: mensajeDe(fallo), delServidor: true });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (falloDeCarga !== null) {
    return (
      <main className={MARCO}>
        <Encabezado situacion={null} />
        <ErrorDePantalla
          titulo="No se pudo leer el estado de la caja."
          queHacer="Sin él no se sabe si el día está abierto ni qué salió del cajón. Revisa la conexión y vuelve a leerlo: desde aquí no se movió nada."
          detalle={falloDeCarga}
          reintentar={
            <Button
              type="button"
              onClick={() => {
                setFalloDeCarga(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        />
      </main>
    );
  }

  if (estado === null) {
    // La forma del día abierto —que es como se encuentra casi siempre—, no una
    // rueda: al llegar el estado nada salta de sitio.
    return (
      <main className={MARCO}>
        <Encabezado situacion="leyendo" />
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo el estado de la caja"
          className={REJILLA}
        >
          <div className="flex flex-col gap-(--espacio-3)">
            <Esqueleto className="h-5 w-24" />
            <Esqueleto className="h-56 w-full rounded-lg" />
          </div>
          <Esqueleto className="h-64 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  const abierta = estado.sesionCajaId !== null;

  if (!abierta) {
    return (
      <main className={MARCO}>
        <Encabezado situacion="cerrada" />
        {/* El vacío de esta pantalla: sin caja no hay día que enseñar, y lo que
            toca es abrirla con el botón grande. */}
        <Superficie
          como="section"
          relleno={4}
          aria-label="Abrir la caja"
          className="flex flex-col gap-(--espacio-4) sm:p-(--espacio-6) xl:max-w-xl"
        >
          <Vacio
            icono={<LockKeyhole />}
            titulo="La caja está cerrada"
            explicacion="El fondo es lo que dejas en el cajón para dar cambio, y contra él se cuadra el corte de la noche."
            className="items-start gap-(--espacio-2) p-0 text-left"
          />
          <div className="flex flex-col gap-(--espacio-2)">
            <Label htmlFor="fondo" className="text-base font-semibold">
              Fondo con el que abres
            </Label>
            <CampoDeDinero
              id="fondo"
              tamano="grande"
              centavos={fondo}
              alCambiar={setFondo}
              aria-invalid={tropiezo !== null && !tropiezo.delServidor}
            />
          </div>
          <AvisoDeTropiezo tropiezo={tropiezo} />
          <Button size="lg" className={BOTON_DEL_DIA} cargando={ocupado} onClick={abrir}>
            Abrir el día
          </Button>
        </Superficie>
      </main>
    );
  }

  const cerrado = corte !== null;
  const notaDePropina = `La propina no es un gasto del salón: es dinero de ${voc.enFrase('cliente', true)} que pasó por el cajón.`;
  const sinCerrar = estado.citasSinCerrar;

  return (
    <main className={MARCO}>
      <Encabezado situacion={cerrado ? 'cortada' : 'abierta'} />

      <div className={REJILLA}>
        <ElDia movimientos={movimientosDe(estado, notaDePropina)} />

        <div className="flex flex-col gap-(--espacio-4)">
          {sinCerrar > 0 && (
            <Aviso
              tono="atencion"
              titulo={`Hay ${voc.conNumero('linea_orden', sinCerrar)} sin cerrar`}
            >
              Sin cerrarl{voc.terminacion('linea_orden', sinCerrar !== 1)}, el producto de cabina no
              se descontó y el inventario de tinte queda inflado.
            </Aviso>
          )}

          {cerrado ? (
            <Resultado corte={corte} />
          ) : (
            <Superficie
              como="section"
              relleno={4}
              aria-labelledby="contado-titulo"
              className="flex flex-col gap-(--espacio-4) sm:p-(--espacio-6)"
            >
              <div className="flex flex-col gap-(--espacio-2)">
                <Label id="contado-titulo" htmlFor="contado" className="text-base font-semibold">
                  Lo que contaste en el cajón
                </Label>
                {/* A ciegas: con el esperado delante, todo el mundo teclea ese número. */}
                <p className="text-sm text-texto-sutil">
                  Cuenta sin ver el esperado: aparece al cerrar, con la diferencia.
                </p>
                <CampoDeDinero
                  id="contado"
                  tamano="grande"
                  centavos={contado}
                  alCambiar={setContado}
                  aria-invalid={tropiezo !== null && !tropiezo.delServidor}
                />
              </div>
              <AvisoDeTropiezo tropiezo={tropiezo} siRechaza="El día sigue abierto." />
              <Button size="lg" className={BOTON_DEL_DIA} cargando={ocupado} onClick={cerrar}>
                Cerrar el día
              </Button>
            </Superficie>
          )}
        </div>
      </div>
    </main>
  );
}
