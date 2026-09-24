'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import {
  Aviso,
  Cifra,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  IndicadorDeGuardado,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
  type EstadoDeGuardado,
} from '@morphiqpos/ui/sistema';
import {
  CalendarClock,
  Contact,
  FlaskConical,
  Phone,
  Search,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · clientas
 *
 * La ficha y el expediente: lo que hay que saber ANTES de tocar a alguien.
 *
 * ── Por qué la búsqueda arriba y «les toca volver» pegado a ella ─────────
 * Es lo que la recepción hace entre clienta y clienta: encontrar a alguien para
 * agendar, y ver quién se está yendo. `04-INTERFAZ` §4.3.12: la lista por omisión NO
 * es «todas las clientas» —eso no dispara nada—, es quién se está yendo. Así que sin
 * buscar, debajo del campo va «les toca volver»; al teclear, las que coinciden salen
 * justo debajo del campo, y «les toca volver» se queda después. En la tableta del
 * mostrador —el dispositivo de esta pantalla— eso va en una columna y la ficha a su
 * derecha, pegada arriba, para que abrirla no mueva la lista. En la PC son tres
 * columnas: la búsqueda, les toca volver y la ficha. En el teléfono la ficha aparece
 * justo debajo de lo que se encontró, donde se tocó.
 *
 * ── Por qué las alergias van arriba de todo y en rojo ───────────────────
 * Porque es el único dato de esta pantalla que puede mandar a alguien al
 * hospital. Enterrarlo en una pestaña de «datos médicos» es tenerlo sin usar:
 * nadie abre una pestaña con la clienta ya sentada y el tinte mezclándose.
 *
 * ── La fila se convierte en la ficha ─────────────────────────────────────
 * Al tocar a una clienta su renglón viaja hasta el panel (`VIAJE.fila`). No es
 * adorno: con la clienta al lado, el movimiento confirma de reojo a quién se le
 * abrió el expediente. Por lo mismo, lo que llega tarde de OTRA clienta se tira:
 * las alergias de una no pueden aparecer bajo el nombre de otra.
 *
 * ── Por qué el hueco en blanco NO es «no tiene» ─────────────────────────
 * «Se preguntó y no había» y «nadie preguntó» son cosas distintas y sólo una es
 * una decisión. La pantalla señala lo que falta por contestar, uno por uno,
 * porque «falta algo» manda a la recepcionista a buscar qué mientras la clienta
 * espera.
 *
 * ── Por qué la última fórmula va antes que el cuestionario ──────────────
 * Es lo que convierte la captura del expediente en un toque. Trae la fórmula
 * congelada y los días que han pasado: «este tono hace cinco semanas» y «hace
 * ocho meses» no se repiten igual, y quien está mezclando no tiene tiempo de
 * restar fechas.
 *
 * ── Por qué «le toca volver» vive aquí y no en un reporte ───────────────
 * Porque se llama desde el mostrador, entre clienta y clienta, con el teléfono
 * en la mano. Un reporte que hay que ir a abrir es un reporte que no se abre.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben buscar, la ficha, el expediente con sus huecos, la última fórmula y a
 * quién le toca volver. Quedan fuera las fotos, que cuelgan del servicio.
 */

const RUTA_EXPEDIENTE = '/api/clientes';
const RUTA_POR_VOLVER = '/api/clientes/por-volver';
const RUTA_ALTA = '/api/clientes';

/** Cuántas de las que se están yendo se ven a la vez. */
const POR_VOLVER_A_LA_VISTA = 10;

export interface FichaDeClienta {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
}

export interface Expediente {
  readonly clienteId: string;
  readonly alergias: string;
  readonly antecedentes: string;
  readonly comoLlego: string;
  readonly queBusca: string;
  readonly tipoCabello: string | null;
  readonly porcentajeCanas: number | null;
  readonly frecuenciaDias: number | null;
  readonly esPrimeraVisita: boolean;
  readonly sinContestar: readonly string[];
}

export interface FormulaAnterior {
  readonly formulaId: string;
  readonly formula: unknown;
  readonly resultado: string | null;
  readonly aplicadaEn: string;
  readonly diasDesde: number;
}

export interface ClientaPorVolver {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly diasDeRetraso: number;
}

export interface ClientasProps {
  readonly clientasIniciales?: readonly FichaDeClienta[];
  readonly porVolverIniciales?: readonly ClientaPorVolver[];
}

/**
 * Un guardado que falló cuando su ficha ya no estaba a la vista: se abrió otra
 * clienta —u otra vez ésta— mientras la petición viajaba, y `vaciarFicha` ya había
 * borrado el borrador. Se guarda lo que se mandó para poder recuperarlo: tirar el
 * fallo perdía, sin decir nada, las alergias que alguien acababa de capturar.
 */
interface GuardadoPerdido {
  readonly clienta: FichaDeClienta;
  readonly borrador: Readonly<Record<string, string>>;
  readonly detalle: string;
}

/** Los cuatro campos del expediente, con el nombre que se lee en pantalla. */
const CAMPOS = [
  { clave: 'alergias', etiqueta: 'Alergias' },
  { clave: 'antecedentes', etiqueta: 'Antecedentes' },
  { clave: 'como_llego', etiqueta: 'Cómo llegó' },
  { clave: 'que_busca', etiqueta: 'Qué busca' },
] as const;

type ClaveDeCampo = (typeof CAMPOS)[number]['clave'];

/** Lo que el expediente ya tiene guardado en cada campo. */
const GUARDADO_EN: Readonly<Record<ClaveDeCampo, (expediente: Expediente) => string>> = {
  alergias: (expediente) => expediente.alergias,
  antecedentes: (expediente) => expediente.antecedentes,
  como_llego: (expediente) => expediente.comoLlego,
  que_busca: (expediente) => expediente.queBusca,
};

export function nombreDelHueco(clave: string): string {
  return CAMPOS.find((campo) => campo.clave === clave)?.etiqueta ?? clave;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Lo capturado sigue aquí.';
}

/** El detalle de una lectura que falló, para quien tenga que reportarlo. */
function detalleDe(fallo: unknown, siNoDice: string): string {
  return fallo instanceof Error ? fallo.message : siNoDice;
}

function esSimple(valor: unknown): valor is string | number | boolean {
  return typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean';
}

/**
 * La fórmula como se lee en el tocador —marca, tono, volumen, gramos—, si es un
 * objeto plano. Con algo anidado devuelve `null` y se enseña tal cual llegó: una
 * fórmula a medias es peor que una fea.
 */
function paresDeFormula(formula: unknown): readonly (readonly [string, string])[] | null {
  if (formula === null || typeof formula !== 'object' || Array.isArray(formula)) return null;
  const pares: (readonly [string, string])[] = [];
  for (const [clave, valor] of Object.entries(formula as Readonly<Record<string, unknown>>)) {
    if (valor === null || valor === undefined) continue;
    if (!esSimple(valor)) return null;
    pares.push([clave, String(valor)]);
  }
  return pares.length === 0 ? null : pares;
}

export function Clientas({ clientasIniciales, porVolverIniciales }: ClientasProps) {
  const voc = useVocabulario();
  const [clientas, setClientas] = useState<readonly FichaDeClienta[] | null>(
    clientasIniciales ?? null,
  );
  const [falloDeLista, setFalloDeLista] = useState<string | null>(null);
  const [porVolver, setPorVolver] = useState<readonly ClientaPorVolver[] | null>(
    porVolverIniciales ?? null,
  );
  const [falloDePorVolver, setFalloDePorVolver] = useState<string | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [elegida, setElegida] = useState<FichaDeClienta | null>(null);
  /** El renglón que va viajando hacia la ficha, sólo durante el cambio. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [ultima, setUltima] = useState<FormulaAnterior | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [falloDeAlta, setFalloDeAlta] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<EstadoDeGuardado>('quieto');
  const [ocupado, setOcupado] = useState(false);
  const [perdidos, setPerdidos] = useState<readonly GuardadoPerdido[]>([]);
  /**
   * DE QUIÉN ES LA FICHA ABIERTA, para las respuestas que llegan tarde. Se toca a
   * Ana, luego a Mariel, y el expediente de Ana llega segundo: sin esto, las
   * alergias de Ana se pintaban bajo el nombre de Mariel.
   */
  const abierta = useRef<string | null>(null);
  /**
   * Cuántas veces se ha vaciado la ficha. Un guardado compara la suya al volver: si
   * cambió, el borrador que mandó ya no está en pantalla —aunque sea la misma clienta,
   * reabierta—, y su resultado no se pinta sobre la ficha de ahora.
   */
  const apertura = useRef(0);

  useEffect(() => {
    if (clientasIniciales !== undefined && porVolverIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      if (clientasIniciales === undefined) {
        consultarPuente<FichaDeClienta>('Cliente', { limite: 200, signal: control.signal })
          .then((filas) => {
            if (!sigueMontada()) return;
            setClientas(filas);
            setFalloDeLista(null);
          })
          .catch((fallo: unknown) => {
            if (sigueMontada()) setFalloDeLista(detalleDe(fallo, 'La lectura no respondió.'));
          });
      }
      if (porVolverIniciales === undefined) {
        invocarComando<{ readonly clientas: readonly ClientaPorVolver[] }>(RUTA_POR_VOLVER, {})
          .then((salida) => {
            if (!sigueMontada()) return;
            setPorVolver(salida.clientas);
            setFalloDePorVolver(null);
          })
          .catch((fallo: unknown) => {
            if (sigueMontada()) setFalloDePorVolver(detalleDe(fallo, 'La lectura no respondió.'));
          });
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [clientasIniciales, porVolverIniciales, intento]);

  function releerLista(): void {
    setFalloDeLista(null);
    setClientas(null);
    setIntento((previo) => previo + 1);
  }

  function releerPorVolver(): void {
    setFalloDePorVolver(null);
    setPorVolver(null);
    setIntento((previo) => previo + 1);
  }

  /** Pide el expediente y la última fórmula. Lo que llegue de otra clienta se tira. */
  function leerFicha(clienta: FichaDeClienta): void {
    invocarComando<Expediente>(`${RUTA_EXPEDIENTE}/${clienta.id}/expediente`, {})
      .then((datos) => {
        if (abierta.current === clienta.id) setExpediente(datos);
      })
      .catch((fallo: unknown) => {
        if (abierta.current === clienta.id) setError(mensajeDe(fallo));
      });

    invocarComando<{ readonly ultima: FormulaAnterior | null }>(
      `${RUTA_EXPEDIENTE}/${clienta.id}/ultima-formula`,
      {},
    )
      .then((salida) => {
        if (abierta.current === clienta.id) setUltima(salida.ultima);
      })
      .catch(() => {
        if (abierta.current === clienta.id) setUltima(null);
      });
  }

  /**
   * La ficha en blanco para `clienta`: nada de la anterior se queda a la vista. Con
   * `borradorInicial`, lo capturado de un guardado que falló, para volver a mandarlo.
   */
  function vaciarFicha(
    clienta: FichaDeClienta,
    borradorInicial: Record<string, string> = {},
  ): void {
    abierta.current = clienta.id;
    apertura.current += 1;
    setElegida(clienta);
    setExpediente(null);
    setUltima(null);
    setBorrador(borradorInicial);
    setError(null);
    setGuardado('quieto');
  }

  /**
   * La fila viaja a la ficha. Antes del cambio el RENGLÓN lleva el nombre; dentro
   * del cambio se lo quita y lo lleva el PANEL, y `flushSync` hace que el navegador
   * fotografíe el estado nuevo ya pintado. Las lecturas salen después de vaciar la
   * ficha: una respuesta muy rápida no puede quedar borrada por el vaciado.
   */
  function abrir(clienta: FichaDeClienta, borradorInicial?: Record<string, string>): void {
    flushSync(() => {
      setViajando(clienta.id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        vaciarFicha(clienta, borradorInicial);
      });
      leerFicha(clienta);
    });
  }

  /** Vuelve a abrir la ficha de un guardado perdido, con lo que se había capturado. */
  function recuperar(perdido: GuardadoPerdido): void {
    setPerdidos((previos) => previos.filter((otro) => otro.clienta.id !== perdido.clienta.id));
    abrir(perdido.clienta, { ...perdido.borrador });
  }

  function reabrir(clienta: FichaDeClienta): void {
    vaciarFicha(clienta);
    leerFicha(clienta);
  }

  function guardar(): void {
    if (elegida === null) return;
    const clienta = elegida;
    const loQueSeManda = borrador;
    const estaApertura = apertura.current;
    setOcupado(true);
    setError(null);
    setGuardado('guardando');
    invocarComando<Expediente>(`${RUTA_EXPEDIENTE}/${clienta.id}/expediente`, {
      // Sólo lo que se tocó. Mandar el formulario entero desde la pantalla que
      // sólo quería corregir las canas borraría las alergias.
      ...(borrador['alergias'] === undefined ? {} : { alergias: borrador['alergias'] }),
      ...(borrador['antecedentes'] === undefined ? {} : { antecedentes: borrador['antecedentes'] }),
      ...(borrador['como_llego'] === undefined ? {} : { comoLlego: borrador['como_llego'] }),
      ...(borrador['que_busca'] === undefined ? {} : { queBusca: borrador['que_busca'] }),
    })
      .then((datos) => {
        // Guardado: si su ficha ya no está a la vista, no hay nada que perder.
        if (apertura.current !== estaApertura) return;
        setExpediente(datos);
        setBorrador({});
        setGuardado('guardado');
      })
      .catch((fallo: unknown) => {
        if (apertura.current === estaApertura) {
          setError(mensajeDe(fallo));
          setGuardado('quieto');
          return;
        }
        // Su ficha ya no está a la vista y el borrador se vació con ella: el fallo NO
        // se tira. Se dice arriba, con nombre, y lo capturado se puede recuperar.
        if (Object.keys(loQueSeManda).length === 0) return;
        const perdido: GuardadoPerdido = {
          clienta,
          borrador: loQueSeManda,
          detalle: fallo instanceof ErrorApi ? fallo.message : 'La conexión no respondió.',
        };
        setPerdidos((previos) => [
          ...previos.filter((otro) => otro.clienta.id !== clienta.id),
          perdido,
        ]);
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function darDeAlta(): void {
    const nombre = busqueda.trim();
    if (nombre === '') return;
    setOcupado(true);
    setFalloDeAlta(null);
    invocarComando<FichaDeClienta>(RUTA_ALTA, { nombre, telefono: null })
      .then((creada) => {
        setClientas([creada, ...(clientas ?? [])]);
        abrir(creada);
        setBusqueda('');
      })
      .catch((fallo: unknown) => {
        setFalloDeAlta(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const filtro = busqueda.trim().toLowerCase();
  const visibles =
    clientas === null
      ? []
      : clientas.filter(
          (c) => c.nombre.toLowerCase().includes(filtro) || (c.telefono ?? '').includes(filtro),
        );

  const columnasDelDirectorio: readonly ColumnaDeTabla<FichaDeClienta>[] = [
    {
      clave: 'nombre',
      titulo: voc.titulo('cliente'),
      celda: (c) => <span className="font-medium">{c.nombre}</span>,
    },
    {
      clave: 'telefono',
      titulo: 'Teléfono',
      celda: (c) => (
        <span className="font-numeros whitespace-nowrap text-texto-sutil tabular-nums">
          {c.telefono ?? '—'}
        </span>
      ),
    },
  ];

  const directorio = (() => {
    if (falloDeLista !== null) {
      return (
        <ErrorDePantalla
          titulo={`No se pudo leer la lista de ${voc.plural('cliente')}`}
          queHacer="Sin la lista no se encuentra a nadie. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeLista}
          reintentar={<Button onClick={releerLista}>Volver a intentar</Button>}
        />
      );
    }
    const sinClientas = (
      <Vacio
        icono={<Users />}
        titulo={`Todavía no tienes ${voc.plural('cliente')} registrad${voc.terminacion('cliente', true)}.`}
        explicacion="Cada vez que atiendas a alguien, pídele su teléfono. Escribe su nombre en «Buscar» y se da de alta desde ahí."
        className="py-(--espacio-8)"
      />
    );
    // Sin buscar NO va la lista entera (§4.3.12): debajo del campo va a quién le toca
    // volver. Sólo el salón que aún no tiene a nadie enseña aquí su vacío, con el consejo.
    if (filtro === '') return clientas?.length === 0 ? sinClientas : null;
    // La forma de la lista, nunca una rueda: el ojo ya sabe dónde va a mirar.
    if (clientas === null) return <EsqueletoDeLista filas={6} />;
    const sinCoincidencias = (
      <Vacio
        titulo={`${voc.conDeterminante('ningun', 'cliente')} coincide con «${busqueda.trim()}».`}
        accion={
          <Button disabled={ocupado} onClick={darDeAlta}>
            <UserPlus aria-hidden="true" />
            Dar de alta «{busqueda.trim()}»
          </Button>
        }
        className="py-(--espacio-6)"
      >
        {falloDeAlta === null ? null : (
          <Aviso tono="peligro" titulo={falloDeAlta} className="text-left">
            No se dio de alta a nadie.
          </Aviso>
        )}
      </Vacio>
    );
    return (
      <Tabla
        etiqueta={voc.titulo('cliente', true)}
        columnas={columnasDelDirectorio}
        filas={visibles}
        claveDe={(c) => c.id}
        {...(elegida === null ? {} : { activa: elegida.id })}
        alActivar={(id) => {
          const clienta = visibles.find((c) => c.id === id);
          if (clienta !== undefined) abrir(clienta);
        }}
        viajeDeFila={(c) => (c.id === viajando ? VIAJE.fila(c.id) : undefined)}
        alto="max-h-[45vh] md:max-h-[50vh] xl:max-h-[calc(100dvh-12rem)]"
        vacio={sinCoincidencias}
      />
    );
  })();

  // El panel lleva el nombre del viaje salvo MIENTRAS el renglón lo tiene: dos
  // elementos con el mismo nombre a la vez dejan al navegador sin saber cuál es cuál.
  const nombreDeViaje = viajando === null && elegida !== null ? VIAJE.fila(elegida.id) : 'none';

  return (
    <main className="mx-auto grid w-full max-w-[100rem] gap-(--espacio-4) p-(--espacio-3) md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start md:p-(--espacio-4) xl:grid-cols-[minmax(0,20rem)_minmax(0,20rem)_minmax(0,1fr)] xl:grid-rows-[auto]">
      {/* PRIMARIO · buscar. El foco arranca aquí: es la acción de la pantalla. */}
      <div className="flex flex-col gap-(--espacio-3) md:col-start-1 md:row-start-1">
        <h1 className="text-xl font-bold">{voc.titulo('cliente', true)}</h1>
        {perdidos.map((perdido) => (
          <Aviso
            key={perdido.clienta.id}
            tono="peligro"
            titulo={`No se guardó el expediente de ${perdido.clienta.nombre}.`}
          >
            {perdido.detalle} Lo capturado no se perdió: recupéralo y vuelve a guardarlo.
            <Button
              variant="outline"
              size="sm"
              className="mt-(--espacio-2) flex"
              onClick={() => {
                recuperar(perdido);
              }}
            >
              Recuperar lo capturado
            </Button>
          </Aviso>
        ))}
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="buscar">Buscar</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              id="buscar"
              autoFocus
              className="h-[calc(var(--altura-control)*1.25)] pl-(--espacio-10) text-lg"
              placeholder="nombre o teléfono"
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
            />
          </div>
        </div>
        {directorio}
      </div>

      {/* LA FICHA · a la derecha y pegada arriba en tableta y PC; en el teléfono,
          debajo de la lista y sólo cuando hay a quién enseñar. */}
      <Superficie
        como="section"
        relleno={0}
        aria-label={elegida === null ? 'Expediente' : `Expediente de ${elegida.nombre}`}
        style={{ viewTransitionName: nombreDeViaje }}
        className={`${elegida === null ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden md:sticky md:top-(--espacio-4) md:col-start-2 md:row-span-2 md:row-start-1 md:max-h-[calc(100dvh-var(--espacio-8))] md:overflow-y-auto xl:col-start-3 xl:row-span-1`}
      >
        {elegida === null ? (
          <Vacio
            icono={<Contact />}
            titulo={`Elige ${voc.enFraseCon('un', 'cliente')} para abrir su expediente.`}
            explicacion="Sus alergias, su última fórmula y lo que falta por preguntar."
          />
        ) : (
          <Ficha
            clienta={elegida}
            expediente={expediente}
            ultima={ultima}
            borrador={borrador}
            error={error}
            guardado={guardado}
            ocupado={ocupado}
            alCambiar={(clave, valor) => {
              setBorrador((previo) => ({ ...previo, [clave]: valor }));
            }}
            alGuardar={guardar}
            alReintentar={() => {
              reabrir(elegida);
            }}
          />
        )}
      </Superficie>

      <LesTocaVolver
        porVolver={porVolver}
        fallo={falloDePorVolver}
        tituloDeClienta={voc.titulo('cliente')}
        alReintentar={releerPorVolver}
        className="md:col-start-1 md:row-start-2 xl:col-start-2 xl:row-start-1"
      />
    </main>
  );
}

/**
 * LES TOCA VOLVER · quién pasó ya su frecuencia, con el teléfono a la vista.
 *
 * El retraso a la derecha y en cifras tabulares: la lista llega ordenada por él, y
 * compararlo de un vistazo es decidir a quién se le habla primero.
 */
function LesTocaVolver({
  porVolver,
  fallo,
  tituloDeClienta,
  alReintentar,
  className,
}: {
  readonly porVolver: readonly ClientaPorVolver[] | null;
  readonly fallo: string | null;
  readonly tituloDeClienta: string;
  readonly alReintentar: () => void;
  readonly className: string;
}) {
  const columnas: readonly ColumnaDeTabla<ClientaPorVolver>[] = [
    {
      clave: 'clienta',
      titulo: tituloDeClienta,
      celda: (c) => (
        <span className="flex flex-col">
          <span className="font-medium">{c.nombre}</span>
          {c.telefono === null ? null : (
            <span className="font-numeros text-xs text-texto-sutil tabular-nums">{c.telefono}</span>
          )}
        </span>
      ),
    },
    {
      clave: 'retraso',
      titulo: 'Retraso',
      numerica: true,
      celda: (c) => <Cifra valor={c.diasDeRetraso} unidad="d" tamano="sm" />,
    },
  ];

  const cuerpo = (() => {
    if (fallo !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudo leer a quién le toca volver"
          queHacer="La búsqueda sigue funcionando. Vuelve a intentarlo en un momento."
          detalle={fallo}
          reintentar={
            <Button variant="outline" onClick={alReintentar}>
              Volver a intentar
            </Button>
          }
        />
      );
    }
    if (porVolver === null) return <EsqueletoDeLista filas={4} />;
    return (
      <Tabla
        etiqueta="Les toca volver"
        columnas={columnas}
        filas={porVolver.slice(0, POR_VOLVER_A_LA_VISTA)}
        claveDe={(c) => c.clienteId}
        alto="max-h-[50vh] xl:max-h-[calc(100dvh-12rem)]"
        vacio={<Vacio titulo="Nadie va con retraso." className="py-(--espacio-6)" />}
      />
    );
  })();

  return (
    <section
      aria-labelledby="les-toca-volver"
      className={`flex flex-col gap-(--espacio-2) ${className}`}
    >
      <header>
        <h2
          id="les-toca-volver"
          className="flex items-center gap-(--espacio-2) text-base font-semibold"
        >
          <CalendarClock aria-hidden="true" className="size-5 text-texto-sutil" />
          Les toca volver
        </h2>
        <p className="text-sm text-texto-sutil">Ya pasaron su frecuencia de visita.</p>
      </header>
      {cuerpo}
    </section>
  );
}

interface FichaProps {
  readonly clienta: FichaDeClienta;
  readonly expediente: Expediente | null;
  readonly ultima: FormulaAnterior | null;
  readonly borrador: Readonly<Record<string, string>>;
  readonly error: string | null;
  readonly guardado: EstadoDeGuardado;
  readonly ocupado: boolean;
  readonly alCambiar: (clave: ClaveDeCampo, valor: string) => void;
  readonly alGuardar: () => void;
  readonly alReintentar: () => void;
}

/**
 * LA FICHA de la clienta elegida. El nombre se ve desde el primer instante —es lo
 * que se tocó—, y lo demás llega con su esqueleto o con su error.
 */
function Ficha({
  clienta,
  expediente,
  ultima,
  borrador,
  error,
  guardado,
  ocupado,
  alCambiar,
  alGuardar,
  alReintentar,
}: FichaProps) {
  const cuerpo = (() => {
    if (expediente === null && error !== null) {
      return (
        <ErrorDePantalla
          className="m-(--espacio-4)"
          titulo={`No se pudo abrir el expediente de ${clienta.nombre}`}
          queHacer="No se cambió nada. Revisa la conexión y vuelve a abrirlo."
          detalle={error}
          reintentar={<Button onClick={alReintentar}>Volver a intentar</Button>}
        />
      );
    }
    if (expediente === null) {
      return (
        <div
          role="status"
          aria-busy="true"
          aria-label={`Abriendo el expediente de ${clienta.nombre}`}
          className="flex flex-col gap-(--espacio-4) p-(--espacio-4)"
        >
          <Esqueleto className="h-28 w-full" />
          <Esqueleto className="h-24 w-full" />
          <Esqueleto className="h-20 w-full" />
          <Esqueleto className="h-20 w-full" />
        </div>
      );
    }
    return (
      <ExpedienteAbierto
        expediente={expediente}
        ultima={ultima}
        borrador={borrador}
        error={error}
        guardado={guardado}
        ocupado={ocupado}
        alCambiar={alCambiar}
        alGuardar={alGuardar}
      />
    );
  })();

  return (
    <>
      <header className="flex flex-col gap-(--espacio-1) border-b border-borde p-(--espacio-4)">
        <h2 className="text-2xl font-semibold">{clienta.nombre}</h2>
        {clienta.telefono === null ? null : (
          <p className="flex items-center gap-(--espacio-1) text-sm text-texto-sutil">
            <Phone aria-hidden="true" className="size-4" />
            <span className="font-numeros tabular-nums">{clienta.telefono}</span>
          </p>
        )}
        {expediente === null ? null : <DatosDelExpediente expediente={expediente} />}
      </header>
      {cuerpo}
    </>
  );
}

/** Lo que el expediente ya sabe de ella y no se captura aquí: el ritmo y el cabello. */
function DatosDelExpediente({ expediente }: { readonly expediente: Expediente }) {
  const { frecuenciaDias, tipoCabello, porcentajeCanas } = expediente;
  if (frecuenciaDias === null && tipoCabello === null && porcentajeCanas === null) return null;
  return (
    <p className="flex flex-wrap gap-x-(--espacio-3) gap-y-(--espacio-1) text-sm text-texto-sutil">
      {frecuenciaDias === null ? null : (
        <span>
          Viene cada <Cifra valor={frecuenciaDias} unidad="d" tamano="sm" className="text-texto" />
        </span>
      )}
      {tipoCabello === null ? null : (
        <span>
          Cabello <span className="text-texto">{tipoCabello}</span>
        </span>
      )}
      {porcentajeCanas === null ? null : (
        <span>
          Canas <Cifra valor={porcentajeCanas} unidad="%" tamano="sm" className="text-texto" />
        </span>
      )}
    </p>
  );
}

function ExpedienteAbierto({
  expediente,
  ultima,
  borrador,
  error,
  guardado,
  ocupado,
  alCambiar,
  alGuardar,
}: Omit<FichaProps, 'clienta' | 'expediente' | 'alReintentar'> & {
  readonly expediente: Expediente;
}) {
  const sinAlergias = expediente.alergias.trim() === '';

  return (
    <>
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        {/* Arriba de todo y en rojo: es el único dato de esta pantalla que
            puede mandar a alguien al hospital. */}
        <Superficie
          nivel={0}
          relleno={4}
          className="flex flex-col gap-(--espacio-2) border-2 border-peligro bg-peligro/5"
        >
          <Label
            htmlFor="alergias"
            className="flex items-center gap-(--espacio-2) text-base font-semibold text-peligro"
          >
            <TriangleAlert aria-hidden="true" className="size-5" />
            Alergias
          </Label>
          <Textarea
            id="alergias"
            rows={2}
            className="bg-superficie"
            aria-describedby={sinAlergias ? 'alergias-sin-contestar' : undefined}
            value={borrador['alergias'] ?? expediente.alergias}
            onChange={(evento) => {
              alCambiar('alergias', evento.target.value);
            }}
          />
          {sinAlergias ? (
            <p id="alergias-sin-contestar" className="text-sm font-medium text-peligro">
              Sin contestar. «Ninguna conocida» también es una respuesta.
            </p>
          ) : null}
        </Superficie>

        <TarjetaDeFormula ultima={ultima} />

        <AvisoDeHuecos expediente={expediente} />

        {CAMPOS.filter((campo) => campo.clave !== 'alergias').map((campo) => (
          <div key={campo.clave} className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor={campo.clave}>{campo.etiqueta}</Label>
            <Textarea
              id={campo.clave}
              rows={2}
              value={borrador[campo.clave] ?? GUARDADO_EN[campo.clave](expediente)}
              onChange={(evento) => {
                alCambiar(campo.clave, evento.target.value);
              }}
            />
          </div>
        ))}
      </div>

      {/* Guardar se queda a mano al bajar por el expediente: en la tableta la
          ficha tiene su propio scroll y el botón no se va con él. */}
      <footer className="sticky bottom-0 flex flex-col gap-(--espacio-2) border-t border-borde bg-superficie p-(--espacio-3)">
        {error === null ? null : (
          <Aviso tono="peligro" titulo={error}>
            El expediente sigue como estaba.
          </Aviso>
        )}
        <div className="flex flex-wrap items-center gap-(--espacio-3)">
          <Button
            className="h-[calc(var(--altura-control)*1.4)] flex-1 sm:flex-none sm:px-(--espacio-8)"
            disabled={ocupado}
            onClick={alGuardar}
          >
            Guardar expediente
          </Button>
          <IndicadorDeGuardado estado={guardado} />
        </div>
      </footer>
    </>
  );
}

/** Primera visita, o lo que falta por preguntar: con nombre, uno por uno. */
function AvisoDeHuecos({ expediente }: { readonly expediente: Expediente }) {
  const faltan = expediente.sinContestar.map(nombreDelHueco).join(', ');
  if (expediente.esPrimeraVisita && faltan !== '') {
    return (
      <Aviso tono="atencion" titulo="Primera visita: hay que preguntarlo todo.">
        Falta por contestar: {faltan}.
      </Aviso>
    );
  }
  if (expediente.esPrimeraVisita) {
    return <Aviso tono="atencion" titulo="Primera visita: hay que preguntarlo todo." />;
  }
  if (faltan === '') return null;
  return <Aviso tono="atencion" titulo={`Falta por contestar: ${faltan}.`} />;
}

/** La última fórmula, congelada, con los días que han pasado desde entonces. */
function TarjetaDeFormula({ ultima }: { readonly ultima: FormulaAnterior | null }) {
  const pares = ultima === null ? null : paresDeFormula(ultima.formula);
  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={3}
      aria-labelledby="ultima-formula"
      className="flex flex-col gap-(--espacio-2) bg-fondo-sutil"
    >
      <h3 id="ultima-formula" className="flex items-center gap-(--espacio-2) text-sm font-semibold">
        <FlaskConical aria-hidden="true" className="size-4 text-texto-sutil" />
        Última fórmula
      </h3>
      {ultima === null ? (
        <p className="text-sm text-texto-sutil">Todavía no hay ninguna.</p>
      ) : (
        <>
          <p className="text-sm">
            Hace <span className="font-numeros font-semibold tabular-nums">{ultima.diasDesde}</span>{' '}
            día{ultima.diasDesde === 1 ? '' : 's'}
            {ultima.resultado === null ? '' : ` · ${ultima.resultado}`}
          </p>
          {pares === null ? (
            <pre className="overflow-x-auto rounded-md bg-superficie p-(--espacio-3) text-sm">
              {JSON.stringify(ultima.formula, null, 2)}
            </pre>
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-(--espacio-4) gap-y-(--espacio-1) text-sm">
              {pares.map(([clave, valor]) => (
                <div key={clave} className="contents">
                  <dt className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
                    {clave}
                  </dt>
                  <dd className="font-medium">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </Superficie>
  );
}
