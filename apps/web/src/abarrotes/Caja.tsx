'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Vacio,
} from '@morphiqpos/ui/sistema';
import { ArrowDownToLine, Check, LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import { CampoDePesos } from '~/venta/CampoDePesos';
import { DevolucionDeVenta } from '~/venta/DevolucionDeVenta';
import { GastoDeCaja } from '~/venta/GastoDeCaja';
import { aCentavos } from '~/venta/importe-tecleado';
import { RetiroDeCaja } from '~/venta/RetiroDeCaja';

import {
  estadoDeLaPantalla,
  horaDeApertura,
  PREGUNTA_DEL_ESTADO,
  type EstadoCajaDelServidor,
  type EstadoDeCaja,
} from './estado-de-caja.ts';

/**
 * PANTALLA · abarrotes · caja
 *
 * Abrir el cajón, meterle cambio a media mañana y sacar lo que se lleva al
 * banco. No es el corte: el corte cuenta lo que hubo y esto mueve lo que hay.
 *
 * ── Por qué el fondo se captura DESGLOSADO ──────────────────────────────
 * «$1,500» no dice si se puede dar cambio. A las siete de la mañana con un
 * billete de quinientos y sin monedas de diez, la tienda no puede cobrar un
 * refresco — y el número que dice si eso va a pasar es cuánto hay EN MONEDAS.
 * Un solo importe esconde exactamente el problema que el fondo viene a
 * resolver, y por eso son tres campos y no uno.
 *
 * ── Por qué la entrada de cambio es su propio botón ─────────────────────
 * Porque no es un depósito ni una venta: es fondo. Registrarla como venta infla
 * el día; no registrarla hace que el arqueo de la noche encuentre $600 de más y
 * que el cajero pase veinte minutos buscando una venta que no existe. Tenerla
 * escondida dentro de «movimiento» es tenerla sin usar.
 *
 * ── Por qué el retiro pide motivo y el cambio pide ORIGEN ───────────────
 * Son preguntas distintas. Lo que sale necesita explicarse —un retiro sin
 * motivo es la única salida de dinero que puede esconder un faltante—, y lo que
 * entra necesita saberse de dónde vino, porque casi siempre salió de la bolsa
 * de alguien y hay que devolvérselo.
 *
 * ── Por qué el esperado NO se enseña al abrir ───────────────────────────
 * Misma regla del arqueo: si se muestra, todo el mundo teclea ese número. Aquí
 * se enseña DESPUÉS de abrir, porque a partir de ese momento ya no es un dato
 * que se pueda copiar: es contra lo que se va a cuadrar en la noche. Al abrir
 * sí se lee la SUMA de lo que se va tecleando: es el conteo propio, no uno que
 * copiar, y es el total que el servidor va a guardar.
 *
 * ── Cómo se reparte, en la PC del mostrador ─────────────────────────────
 * `04-INTERFAZ` §4.3 · pantalla 9: «primero se ve el estado de la caja y cuánto
 * lleva». Arriba, abierta desde cuándo; debajo, lo que debería haber, en el
 * número más grande de la pantalla —y aun así un escalón por debajo del total
 * del cobro, que es el único que se lee desde el otro lado del mostrador—. Lo
 * que entra y lo que sale van LADO A LADO en la PC, con el mismo peso y el
 * botón al pie de cada uno: son los dos movimientos del día y se buscan con la
 * vista, no con el ratón. En tableta y teléfono se apilan en ese orden.
 *
 * Cada panel es un formulario, pero Enter en un importe NO registra: pasa al
 * campo que sigue. Registrar desde el primer montón abría la caja con lo que
 * llevaba tecleado y los otros dos en cero, y metía el cambio «del banco» antes de
 * que nadie llegara a decir de dónde vino. Registran el último campo —«Billetes
 * grandes», «A dónde va»— y el botón; en el cambio lo último es elegir el origen,
 * así que registra sólo el botón. Y lo que sale mal se dice JUNTO al botón que se
 * tocó, no arriba de todo, que es donde nadie está mirando.
 *
 * ── Y el cierre, en su pantalla ─────────────────────────────────────────
 * Aquí se abre, se mete cambio, se retira y se ve el esperado del turno. El
 * cierre —el arqueo por denominación, lo que se deja para mañana y el PDF del
 * corte— es la pantalla CORTES, y con la caja abierta se llega a ella desde aquí
 * mismo (`rutaDeCortes`): cerrar no se busca en el menú al final del día.
 */

const RUTA_ABRIR = '/api/caja/abrir';
const RUTA_CAMBIO = '/api/caja/entrada-cambio';
const RUTA_ESTADO = '/api/caja/estado';

/** Los tres montones en que de verdad se reparte un fondo de mostrador. */
const DENOMINACIONES = [
  { clave: 'monedas', etiqueta: 'Monedas', ayuda: 'de $1, $2, $5 y $10' },
  { clave: 'chicos', etiqueta: 'Billetes chicos', ayuda: 'de $20, $50 y $100' },
  { clave: 'grandes', etiqueta: 'Billetes grandes', ayuda: 'de $200 y $500' },
] as const;

type Denominacion = (typeof DENOMINACIONES)[number]['clave'];

const ORIGENES = [
  { clave: 'banco', etiqueta: 'Del banco' },
  { clave: 'caja_chica', etiqueta: 'De caja chica' },
  { clave: 'dueno', etiqueta: 'De mi bolsa' },
  { clave: 'otra_caja', etiqueta: 'De la otra caja' },
] as const;

type Origen = (typeof ORIGENES)[number]['clave'];

/**
 * Los formularios propios de la pantalla. El aviso sale en el que se tocó. El retiro es
 * de `venta/RetiroDeCaja` —el mismo del salón— y lleva su aviso consigo.
 */
type Panel = 'apertura' | 'cambio';

interface Tropiezo {
  readonly panel: Panel;
  readonly mensaje: string;
  /** Lo contestó el servidor (`true`), o no llegó a mandarse (`false`). */
  readonly delServidor: boolean;
}

export type { EstadoDeCaja } from './estado-de-caja.ts';

/** El estado de la caja de ESTA terminal, ya en la forma de la pantalla. */
async function leerEstado(): Promise<EstadoDeCaja> {
  return estadoDeLaPantalla(
    await invocarComando<EstadoCajaDelServidor>(RUTA_ESTADO, PREGUNTA_DEL_ESTADO),
  );
}

export interface CajaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly estadoInicial?: EstadoDeCaja;
  /** Dónde se cierra: la tienda y la ferretería comparten esta caja y no su menú. */
  readonly rutaDeCortes?: string;
}

/** La suma de varios importes tecleados, o `null` si alguno no es un importe. */
function sumaDe(montos: readonly (number | null)[]): number | null {
  let suma = 0;
  for (const monto of montos) {
    if (monto === null) return null;
    suma += monto;
  }
  return suma;
}

/** El campo del montón que sigue al de `indice`, o nada si ése es el último. */
function idDelMontonSiguiente(indice: number): string | undefined {
  const siguiente = DENOMINACIONES[indice + 1];
  return siguiente === undefined ? undefined : `fondo-${siguiente.clave}`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Lo capturado sigue aquí: vuelve a intentarlo.';
}

/**
 * Lo que salió mal en ESTE panel. Si ni siquiera se mandó, es una corrección
 * —atención—; si el servidor lo rechazó, es un fallo —peligro— y el mensaje es
 * el suyo, que ya dice qué pasó.
 */
function AvisoDelPanel({
  tropiezo,
  panel,
}: {
  readonly tropiezo: Tropiezo | null;
  readonly panel: Panel;
}) {
  if (tropiezo?.panel !== panel) return null;
  if (tropiezo.delServidor) return <Aviso tono="peligro" titulo={tropiezo.mensaje} />;
  return (
    <Aviso tono="atencion" titulo={tropiezo.mensaje}>
      No se mandó nada.
    </Aviso>
  );
}

export function Caja({ estadoInicial, rutaDeCortes = '/abarrotes/cortes' }: CajaProps) {
  const voc = useVocabulario();
  const [estado, setEstado] = useState<EstadoDeCaja | null>(estadoInicial ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  const [intento, setIntento] = useState(0);
  const [fondo, setFondo] = useState<Record<Denominacion, string>>({
    monedas: '',
    chicos: '',
    grandes: '',
  });
  const [cambio, setCambio] = useState({ monedas: '', chicos: '' });
  const [origen, setOrigen] = useState<Origen>('banco');
  const [tropiezo, setTropiezo] = useState<Tropiezo | null>(null);
  /** El panel cuyo comando va en camino: apaga los tres botones y el suyo gira. */
  const [guardando, setGuardando] = useState<Panel | null>(null);

  useEffect(() => {
    if (estadoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const cargar = (): void => {
      leerEstado()
        .then((datos) => {
          if (sigueMontada()) setEstado(datos);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada())
            setFalloDeCarga(
              fallo instanceof Error ? fallo.message : 'No se pudo leer el estado de la caja.',
            );
        });
    };
    // En un `setTimeout` y no en el cuerpo del efecto: escribir estado aquí de
    // forma síncrona es lo que caza `set-state-in-effect`.
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [estadoInicial, intento]);

  const abierta = estado?.sesionCajaId !== null && estado?.sesionCajaId !== undefined;
  const fondoTecleado = sumaDe(DENOMINACIONES.map((d) => aCentavos(fondo[d.clave])));
  const entraDeCambio = sumaDe([aCentavos(cambio.monedas), aCentavos(cambio.chicos)]);
  const origenElegido = ORIGENES.find((o) => o.clave === origen)?.etiqueta ?? '';

  /** Vuelve a leer la caja: un gasto o una devolución cambiaron lo que debería haber. */
  function recargar(): void {
    setIntento((previo) => previo + 1);
  }

  function tropezar(panel: Panel, mensaje: string): void {
    setTropiezo({ panel, mensaje, delServidor: false });
  }

  async function ejecutar(panel: Panel, accion: () => Promise<EstadoDeCaja>): Promise<void> {
    setGuardando(panel);
    setTropiezo(null);
    try {
      setEstado(await accion());
    } catch (fallo: unknown) {
      setTropiezo({ panel, mensaje: mensajeDe(fallo), delServidor: true });
    } finally {
      setGuardando(null);
    }
  }

  function abrir(): void {
    const montos = DENOMINACIONES.map((d) => aCentavos(fondo[d.clave]));
    if (montos.some((m) => m === null)) {
      tropezar('apertura', 'Revisa el desglose: sólo pesos y centavos.');
      return;
    }
    void ejecutar('apertura', async () => {
      await invocarComando(RUTA_ABRIR, {
        fondoMonedasCentavos: montos[0] ?? 0,
        fondoChicosCentavos: montos[1] ?? 0,
        fondoGrandesCentavos: montos[2] ?? 0,
      });
      return leerEstado();
    });
  }

  function meterCambio(): void {
    const monedas = aCentavos(cambio.monedas);
    const chicos = aCentavos(cambio.chicos);
    if (monedas === null || chicos === null) {
      tropezar('cambio', 'Revisa el desglose del cambio.');
      return;
    }
    if (monedas + chicos === 0) {
      tropezar('cambio', 'No entró nada: revisa el desglose.');
      return;
    }
    void ejecutar('cambio', async () => {
      await invocarComando(RUTA_CAMBIO, {
        monedasCentavos: monedas,
        chicosCentavos: chicos,
        origen,
        motivo: null,
      });
      setCambio({ monedas: '', chicos: '' });
      return leerEstado();
    });
  }

  if (falloDeCarga !== null) {
    return (
      <main className="mx-auto w-full max-w-xl p-(--espacio-4)">
        <h1 className="sr-only">Caja</h1>
        <ErrorDePantalla
          titulo="No se pudo leer el estado de la caja."
          queHacer="Sin él no se sabe si la caja del día está abierta ni cuánto debería haber en el cajón. Revisa la conexión y vuelve a leerlo: desde aquí no se movió nada."
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
    // La forma de la caja abierta —que es como se encuentra casi siempre—, no una
    // rueda: al llegar el estado nada salta de sitio.
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Leyendo el estado de la caja"
        className="mx-auto flex w-full max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-4)"
      >
        <Esqueleto className="h-(--altura-control) w-48" />
        <Esqueleto className="h-32 w-full rounded-lg" />
        <div className="grid gap-(--espacio-4) lg:grid-cols-2">
          <Esqueleto className="h-72 w-full rounded-lg" />
          <Esqueleto className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const apertura = (
    <Superficie
      como="form"
      relleno={4}
      aria-labelledby="apertura-fondo"
      onSubmit={(evento) => {
        evento.preventDefault();
        abrir();
      }}
      className="flex flex-col gap-(--espacio-4) sm:p-(--espacio-6)"
    >
      {/* No hay caja del día: no hay nada que enseñar de lo que hay en el cajón, y
          lo que toca es abrirla. Las mismas palabras que el muro del cobro. */}
      <Vacio
        icono={<LockKeyhole />}
        titulo="La caja está cerrada"
        explicacion="Ábrela para poder cobrar."
        className="items-start gap-(--espacio-2) p-0 text-left"
      />

      <fieldset>
        <legend id="apertura-fondo" className="font-semibold">
          Fondo con el que abres
        </legend>
        <p className="mt-(--espacio-1) text-sm text-texto-sutil">
          Por montones. «$1,500» no dice si se puede dar cambio; cuánto hay en monedas, sí.
        </p>
        <div className="mt-(--espacio-3) divide-y divide-borde border-y border-borde">
          {DENOMINACIONES.map((denominacion, indice) => (
            <div
              key={denominacion.clave}
              className="grid items-center gap-(--espacio-2) py-(--espacio-3) sm:grid-cols-[minmax(0,1fr)_12rem] sm:gap-(--espacio-4)"
            >
              <Label
                htmlFor={`fondo-${denominacion.clave}`}
                className="flex-col items-start gap-(--espacio-1)"
              >
                {denominacion.etiqueta}
                <span className="text-xs font-normal text-texto-sutil">{denominacion.ayuda}</span>
              </Label>
              <CampoDePesos
                id={`fondo-${denominacion.clave}`}
                // El cajero llega aquí a contar: el primer montón ya espera el número.
                autoFocus={indice === 0}
                // Enter pasa al montón siguiente; sólo el último abre la caja.
                siguiente={idDelMontonSiguiente(indice)}
                value={fondo[denominacion.clave]}
                onChange={(evento) => {
                  setFondo({ ...fondo, [denominacion.clave]: evento.target.value });
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <AvisoDelPanel tropiezo={tropiezo} panel="apertura" />

      <div className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
        <p className="text-sm text-texto-sutil">
          {fondoTecleado === null ? null : (
            <>
              Abres con <Dinero centavos={fondoTecleado} tamano="lg" className="text-texto" />
            </>
          )}
        </p>
        <Button
          type="submit"
          size="lg"
          className="min-w-48"
          disabled={guardando !== null}
          cargando={guardando === 'apertura'}
        >
          Abrir caja
        </Button>
      </div>
    </Superficie>
  );

  const loQueDeberiaHaber = (
    <Superficie
      como="section"
      relleno={4}
      aria-labelledby="caja-esperado"
      className="flex flex-wrap items-end justify-between gap-(--espacio-4) sm:p-(--espacio-6) lg:col-span-2"
    >
      <div className="flex flex-col gap-(--espacio-2)">
        <h2 id="caja-esperado" className="text-sm font-medium text-texto-sutil">
          Lo que debería haber
        </h2>
        <Dinero
          centavos={Number(estado.fondoEsperadoCentavos)}
          tamano="lg"
          className="text-3xl leading-none font-semibold"
        />
        <p className="text-xs text-texto-sutil">Contra esto se cuadra el corte de la noche.</p>
      </div>
      <dl className="flex flex-wrap gap-x-(--espacio-8) gap-y-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">En monedas</dt>
          <dd>
            {estado.fondoMonedasCentavos === null ? (
              <span className="text-sm text-texto-sutil">sin desglose</span>
            ) : (
              <Dinero centavos={Number(estado.fondoMonedasCentavos)} />
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">En billetes chicos</dt>
          <dd>
            {estado.fondoChicosCentavos === null ? (
              <span className="text-sm text-texto-sutil">sin desglose</span>
            ) : (
              <Dinero centavos={Number(estado.fondoChicosCentavos)} />
            )}
          </dd>
        </div>
      </dl>
    </Superficie>
  );

  const panelDeCambio = (
    <Superficie
      como="form"
      nivel={0}
      relleno={4}
      aria-labelledby="cambio-titulo"
      onSubmit={(evento) => {
        evento.preventDefault();
        meterCambio();
      }}
      className="flex flex-col gap-(--espacio-4)"
    >
      <div className="flex items-start gap-(--espacio-3)">
        <ArrowDownToLine
          aria-hidden="true"
          className="mt-(--espacio-1) size-5 shrink-0 text-texto-sutil"
        />
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="cambio-titulo" className="font-semibold">
            Meter cambio
          </h2>
          <p className="text-sm text-texto-sutil">
            No es {voc.enFraseCon('un', 'orden')}: es fondo. Sube lo que la caja debería tener.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-2)">
          <Label htmlFor="cambio-monedas">Monedas</Label>
          <CampoDePesos
            id="cambio-monedas"
            siguiente="cambio-chicos"
            value={cambio.monedas}
            onChange={(evento) => {
              setCambio({ ...cambio, monedas: evento.target.value });
            }}
          />
        </div>
        <div className="flex flex-col gap-(--espacio-2)">
          <Label htmlFor="cambio-chicos">Billetes chicos</Label>
          <CampoDePesos
            id="cambio-chicos"
            // De los importes se pasa a decir de dónde vino: el origen elegido
            // recibe el foco, y el cambio lo registra sólo el botón.
            siguiente={`origen-${origen}`}
            value={cambio.chicos}
            onChange={(evento) => {
              setCambio({ ...cambio, chicos: evento.target.value });
            }}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-(--espacio-2) text-sm font-medium">De dónde vino</legend>
        <div className="grid grid-cols-2 gap-(--espacio-2)">
          {ORIGENES.map((opcion) => {
            const elegida = origen === opcion.clave;
            return (
              <Button
                key={opcion.clave}
                id={`origen-${opcion.clave}`}
                type="button"
                aria-pressed={elegida}
                variant={elegida ? 'default' : 'outline'}
                onClick={() => {
                  setOrigen(opcion.clave);
                }}
              >
                {/* El color no puede ser el único que diga cuál está elegido. */}
                {elegida ? <Check aria-hidden="true" /> : null}
                {opcion.etiqueta}
              </Button>
            );
          })}
        </div>
      </fieldset>

      <AvisoDelPanel tropiezo={tropiezo} panel="cambio" />

      <div className="mt-auto flex flex-col gap-(--espacio-2)">
        {/* Las tres respuestas juntas antes de registrar: cuánto, en qué y de dónde. */}
        {entraDeCambio !== null && entraDeCambio > 0 ? (
          <p className="text-sm text-texto-sutil">
            Entran <Dinero centavos={entraDeCambio} tamano="sm" className="text-texto" />{' '}
            {origenElegido.toLowerCase()}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={guardando !== null}
          cargando={guardando === 'cambio'}
        >
          Registrar el cambio
        </Button>
      </div>
    </Superficie>
  );

  return (
    <main
      className={`mx-auto flex w-full flex-col gap-(--espacio-4) p-(--espacio-4) ${abierta ? 'max-w-5xl' : 'max-w-xl'}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
        <h1 className="text-2xl font-semibold">Caja</h1>
        {abierta ? (
          <div className="flex flex-wrap items-center gap-(--espacio-3)">
            <p className="inline-flex items-center gap-(--espacio-2) text-sm">
              <LockKeyholeOpen aria-hidden="true" className="size-4 text-exito" />
              Abierta desde las {horaDeApertura(estado.abiertaEn)}
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={rutaDeCortes}>
                <LockKeyhole aria-hidden="true" />
                Cerrar la caja
              </a>
            </Button>
          </div>
        ) : null}
      </header>

      {abierta ? (
        <div className="grid items-stretch gap-(--espacio-4) lg:grid-cols-2">
          {loQueDeberiaHaber}
          {panelDeCambio}
          <RetiroDeCaja alRetirar={recargar} />
          {/* El gasto y la devolución son de quien administra; el servidor lo exige igual. */}
          {estado.puedeAdministrar ? (
            <>
              <GastoDeCaja alRegistrar={recargar} />
              <DevolucionDeVenta alDevolver={recargar} />
            </>
          ) : null}
        </div>
      ) : (
        apertura
      )}
    </main>
  );
}
