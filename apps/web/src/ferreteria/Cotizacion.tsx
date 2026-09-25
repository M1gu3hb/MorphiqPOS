'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, Copy, FileText, Search, Send } from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · cotizacion
 *
 * Armar 40 partidas para una obra, mandarla y darle seguimiento. 2 a 6 por
 * semana, 10 a 30 minutos cada una. La acción principal es MANDAR.
 *
 * ── Por qué aquí SÍ cabe un formulario largo ─────────────────────────────
 * Es la única pantalla EPISÓDICA del modelo. El mostrador se diseña para 40
 * segundos con el cliente enfrente; esto se hace sentado, con el plano de la
 * obra al lado. Optimizar por velocidad aquí sería optimizar lo que no duele.
 *
 * ── Por qué las partidas son una TABLA con el total al pie ───────────────
 * Cuarenta partidas se revisan de arriba abajo: precio, cantidad, descuento e
 * importe, cada uno en su columna y en cifras tabulares. El total va dos veces,
 * y no sobra: arriba, junto al cliente y la vigencia, que es lo que se revisa
 * antes de mandar; y al pie, debajo de SU columna, que es donde se comprueba.
 *
 * ── Por qué la vigencia no trae valor por omisión ────────────────────────
 * El precio del cable y del acero se mueve, y una cotización sin fecha es una
 * promesa abierta que se cobra cara meses después. Un valor por omisión la
 * volvería un campo que nadie mira; sin él MANDAR está apagado. Por eso arriba
 * van cliente, vigencia y total: es lo que se revisa antes de mandar, y por lo
 * que se reclama después.
 *
 * ── Por qué el margen sólo lo ve el dueño ────────────────────────────────
 * El documento lo dice: márgenes para el encargado NO van aquí. Lo decide
 * `esDuenio` y no una clase que lo esconda: la columna ni siquiera existe para el
 * encargado —lo que no se debe ver, no se dibuja ni viaja dentro del marcado—.
 *
 * ── Por qué «perdida» pide motivo, y de una lista corta ──────────────────
 * Es el único dato de mercado que este negocio recolecta sin esfuerzo: a los
 * seis meses dice si se pierde por precio o por surtido, que son dos remedios
 * opuestos. Son botones porque una lista larga no se contesta, y «perdida» no
 * se guarda hasta que hay motivo — el motivo ES el dato.
 *
 * ── Por qué en TELÉFONO no se arma ───────────────────────────────────────
 * Cuarenta partidas en 390 px es una mala idea, y ofrecerlo sería vender una
 * frustración. Bajo `md` el buscador y las columnas editables no se pintan: la
 * partida se vuelve un renglón de consulta —material, cantidad por precio e
 * importe— y quedan las salidas de reenvío, que es para lo que se abre desde el
 * teléfono.
 *
 * ── Por qué un catálogo que no llega NO vacía la pantalla ────────────────
 * Una cotización a medio armar vale veinte minutos de alguien. Si el catálogo no
 * se lee, lo dice el BUSCADOR, con su reintento; las partidas, la vigencia y las
 * salidas siguen donde estaban.
 *
 * ── Qué NO va aquí, y qué se recortó para caber ──────────────────────────
 * No van cobro ni inventario: una cotización no mueve stock ni dinero hasta
 * que se convierte. Y por el límite de tamaño de este archivo quedan fuera, en
 * pantalla propia, el surtido parcial con su remisión por entrega y el PDF,
 * que lo arma el servidor; aquí «convertir» es un solo botón sin el diálogo de
 * qué se entrega hoy y qué se pide.
 */

/** 7, 15 o 30. No hay una cuarta ni hay campo libre. */
const VIGENCIAS = [7, 15, 30] as const;

/** La lista corta de por qué se perdió, tal cual la fija el documento. */
const MOTIVOS = ['Precio', 'Tiempo de entrega', 'No había', 'Se fue con otro', 'La obra no salió'];

type Seguimiento = 'pendiente' | 'ganada' | 'perdida';

/** La palabra acompaña siempre a la insignia: el color nunca significa solo. */
const PALABRA = { pendiente: 'Pendiente', ganada: 'Ganada', perdida: 'Perdida' };

/** Lo que se edita de una partida en la tabla. El precio es el del catálogo. */
type Ajuste = 'cantidad' | 'descuentoPct';

export interface MaterialCotizable {
  readonly id: string;
  readonly nombre: string;
  readonly medida: string;
  readonly unidad: string;
  readonly precioCentavos: number;
  readonly costoCentavos: number;
}

export interface PartidaCotizada {
  readonly material: MaterialCotizable;
  readonly cantidad: number;
  readonly precioCentavos: number;
  readonly descuentoPct: number;
}

export interface CotizacionProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly catalogoInicial?: readonly MaterialCotizable[];
  readonly filasIniciales?: readonly PartidaCotizada[];
  readonly clienteNombre?: string;
  readonly clienteObra?: string;
  /** El margen es información del dueño. El encargado cotiza sin verlo. */
  readonly esDuenio?: boolean;
}

export function importeDe(p: PartidaCotizada): number {
  return Math.round(p.precioCentavos * p.cantidad * (1 - p.descuentoPct / 100));
}

/** Margen sobre el precio YA con descuento: es el número que decide bajarlo más. */
export function margenDe(p: PartidaCotizada): number {
  const importe = importeDe(p);
  if (importe === 0) return 0;
  // El costo es de la fila del puente: en centavos por `centavosDe`, que lee la
  // unidad del mapa. Ausente cuenta cero, como contaba antes.
  const costo = centavosDe('MaterialMostrador', 'costoCentavos', p.material.costoCentavos) ?? 0;
  return Math.round(((importe - costo * p.cantidad) / importe) * 100);
}

/**
 * Cuántos decimales enseñar de una cantidad: los que trae, hasta cuatro, que son los
 * que viajan al servidor (`toFixed(4)`). «12.5 m» no es «13 m», ni «1.125 kg» es «1.13».
 */
function decimalesDe(valor: number): number {
  if (Number.isInteger(valor)) return 0;
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(4, fraccion.length);
}

/** Traduce el fallo a algo con lo que una persona pueda hacer algo. */
function mensajeDe(fallo: unknown): string {
  if (!(fallo instanceof ErrorApi)) return 'Se perdió la conexión. La cotización no se mandó.';
  // El límite de intentos NO es un código: es el 429 y vive en el estado.
  if (fallo.estado === 429) return 'Muchos envíos seguidos. Espera un momento y vuelve a mandarla.';
  if (fallo.error.codigo === 'PAQUETE_NO_INCLUYE') return 'Tu paquete no incluye cotizaciones.';
  if (fallo.error.codigo === 'CONFLICTO_ESTADO') return 'Alguien más ya la cerró en otro equipo.';
  return fallo.error.mensaje;
}

/** Un resultado del buscador: qué es, y a cuánto se cotiza. */
function columnasDeResultado(
  nombreDeMaterial: string,
): readonly ColumnaDeTabla<MaterialCotizable>[] {
  return [
    {
      clave: 'material',
      titulo: nombreDeMaterial,
      celda: (m) => (
        <span className="flex flex-col">
          <span className="font-medium">{m.nombre}</span>
          <span className="text-xs text-texto-sutil">{m.medida}</span>
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      celda: (m) => (
        <Dinero
          centavos={centavosDe('MaterialMostrador', 'precioCentavos', m.precioCentavos) ?? 0}
          tamano="sm"
        />
      ),
    },
  ];
}

/**
 * Las columnas de las partidas. Las editables son `desde: 'md'`: en el teléfono no
 * se arma, así que ahí no hay campos que encoger. El margen se AGREGA sólo para el
 * dueño —no se esconde con una clase—.
 */
function columnasDePartidas(
  nombreDeMaterial: string,
  esDuenio: boolean,
  alAjustar: (id: string, clave: Ajuste, valor: number) => void,
): readonly ColumnaDeTabla<PartidaCotizada>[] {
  const campo = (p: PartidaCotizada, clave: Ajuste) => (
    <Input
      type="number"
      value={p[clave]}
      aria-label={`${clave === 'cantidad' ? 'Cantidad' : 'Descuento'} de ${p.material.nombre}`}
      className="ml-auto w-20 text-right tabular-nums"
      onChange={(evento: ChangeEvent<HTMLInputElement>) => {
        alAjustar(p.material.id, clave, Number(evento.target.value));
      }}
    />
  );
  const columnas: readonly ColumnaDeTabla<PartidaCotizada>[] = [
    {
      clave: 'material',
      titulo: nombreDeMaterial,
      celda: (p) => (
        <span className="flex flex-col">
          <span className="font-medium">
            {p.material.nombre}{' '}
            <span className="font-normal text-texto-sutil">{p.material.medida}</span>
          </span>
          {/* En teléfono la partida es un renglón de consulta, no un campo. */}
          <span className="text-xs text-texto-sutil md:hidden">
            <Cifra
              valor={p.cantidad}
              unidad={p.material.unidad}
              decimales={decimalesDe(p.cantidad)}
              tamano="xs"
            />{' '}
            × <Dinero centavos={p.precioCentavos} tamano="xs" />
            {p.descuentoPct > 0 ? ` · desc. ${String(p.descuentoPct)} %` : null}
            {/* Bajo `md` no existe la columna del margen: la fila roja dice aquí por
                qué, o el color quedaría solo. Y sólo al dueño, como la columna. */}
            {esDuenio && margenDe(p) < 0 ? (
              <span className="font-semibold text-peligro">
                {' · margen '}
                <Cifra valor={margenDe(p)} unidad="%" tamano="xs" />
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      desde: 'md',
      celda: (p) => <Dinero centavos={p.precioCentavos} tamano="sm" />,
    },
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      numerica: true,
      desde: 'md',
      celda: (p) => (
        // La unidad al lado del número: tres «m» de cable no son tres piezas.
        <span className="flex items-center justify-end gap-(--espacio-2)">
          {campo(p, 'cantidad')}
          <span className="w-(--espacio-8) text-left text-xs text-texto-sutil">
            {p.material.unidad}
          </span>
        </span>
      ),
    },
    {
      clave: 'descuento',
      titulo: 'Desc. %',
      numerica: true,
      desde: 'md',
      celda: (p) => campo(p, 'descuentoPct'),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (p) => <Dinero centavos={importeDe(p)} tamano="sm" className="font-semibold" />,
    },
  ];
  if (!esDuenio) return columnas;
  return [
    ...columnas,
    {
      clave: 'margen',
      titulo: 'Margen',
      numerica: true,
      desde: 'md',
      // Bajo cero es vender debajo del costo: lo dice el signo, y la fila se tiñe.
      celda: (p) => (
        <Cifra
          valor={margenDe(p)}
          unidad="%"
          tamano="sm"
          className={margenDe(p) < 0 ? 'font-semibold text-peligro' : ''}
        />
      ),
    },
  ];
}

export function Cotizacion({
  catalogoInicial,
  filasIniciales,
  clienteNombre,
  clienteObra,
  esDuenio = false,
}: CotizacionProps) {
  const voc = useVocabulario();
  const [catalogo, setCatalogo] = useState<readonly MaterialCotizable[] | null>(
    catalogoInicial ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [partidas, setPartidas] = useState<readonly PartidaCotizada[]>(filasIniciales ?? []);
  const [consulta, setConsulta] = useState('');
  const [vigencia, setVigencia] = useState<number | null>(null);
  const [seguimiento, setSeguimiento] = useState<Seguimiento>('pendiente');
  /**
   * LA COTIZACIÓN, cuando ya existe.
   *
   * La pantalla no la tenía, y por eso sus tres botones publicaban en
   * `/api/cotizaciones/<verbo>` —plural, y con verbos que no son de ningún comando—
   * contra un servidor que no tiene esa carpeta: 404, «El servidor respondió algo
   * inesperado», y la cotización sin crear. Mandar CREA la cotización y registra su
   * envío; ganada y perdida necesitan su id, así que hasta que exista van apagadas.
   */
  const [creada, setCreada] = useState<{ readonly id: string; readonly folio: string } | null>(
    null,
  );
  const [nota, setNota] = useState<{ readonly texto: string; readonly malo: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (catalogoInicial !== undefined) return;
    const control = new AbortController();
    // El centinela es una FUNCIÓN: un `let vivo = true` el compilador lo da por
    // siempre-verdadero y la regla de condiciones innecesarias lo rechaza.
    const sigueMontada = () => !control.signal.aborted;
    consultarPuente<MaterialCotizable>('MaterialMostrador', {
      limite: 4000,
      signal: control.signal,
    })
      .then((filas) => {
        if (sigueMontada()) setCatalogo(filas);
      })
      .catch((fallo: unknown) => {
        // La pantalla NO se vacía por un error de red: una cotización a medio
        // armar vale veinte minutos de alguien. Lo dice el buscador, y se sigue.
        if (sigueMontada()) {
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
        }
      });
    return () => {
      control.abort();
    };
  }, [catalogoInicial, intento]);

  const resultados = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    if (texto === '' || catalogo === null) return [];
    const coincide = (m: MaterialCotizable) =>
      `${m.nombre} ${m.medida}`.toLowerCase().includes(texto);
    return catalogo.filter(coincide).slice(0, 8);
  }, [catalogo, consulta]);

  const columnasDelBuscador = useMemo(() => columnasDeResultado(voc.titulo('producto')), [voc]);

  const total = partidas.reduce((suma, p) => suma + importeDe(p), 0);
  const sinPartidas = partidas.length === 0;
  const partidasEnTitulo = voc.titulo('linea_orden', true);

  function alBuscar(evento: ChangeEvent<HTMLInputElement>): void {
    setConsulta(evento.target.value);
  }

  function agregar(material: MaterialCotizable): void {
    setConsulta('');
    // La partida guarda el precio YA en centavos: de aquí en adelante (importe,
    // margen, el comando) nadie vuelve a preguntar en qué unidad llegó.
    const nueva = {
      material,
      cantidad: 1,
      precioCentavos:
        centavosDe('MaterialMostrador', 'precioCentavos', material.precioCentavos) ?? 0,
      descuentoPct: 0,
    };
    setPartidas((previas) =>
      previas.some((p) => p.material.id === material.id)
        ? previas.map((p) =>
            p.material.id === material.id ? { ...p, cantidad: p.cantidad + 1 } : p,
          )
        : [...previas, nueva],
    );
  }

  function ajustar(id: string, clave: Ajuste, crudo: number): void {
    const valor = Number.isFinite(crudo) ? crudo : 0;
    setPartidas((previas) =>
      previas.map((p) => {
        if (p.material.id !== id) return p;
        if (clave === 'cantidad') return { ...p, cantidad: Math.max(1, valor) };
        return { ...p, descuentoPct: Math.min(100, Math.max(0, valor)) };
      }),
    );
  }

  /**
   * Lo común a las tres acciones: apagar los botones, y decir qué pasó.
   *
   * Aquí había una sola función que armaba la ruta con una plantilla
   * —`` `/api/cotizaciones/${verbo}` ``— con dos verbos, `mandar` y `seguimiento`,
   * que no son de ningún comando y cuya carpeta ni siquiera existe. Los tres
   * botones daban 404. Ahora cada uno llama al comando que le corresponde, con su
   * nombre y su entrada.
   */
  async function conLaPantallaOcupada(trabajo: () => Promise<string>): Promise<void> {
    setEnviando(true);
    setNota(null);
    try {
      setNota({ texto: await trabajo(), malo: false });
    } catch (fallo: unknown) {
      setNota({ texto: mensajeDe(fallo), malo: true });
    } finally {
      setEnviando(false);
    }
  }

  /**
   * MANDAR · crea la cotización y registra que se mandó, en ese orden.
   *
   * Son dos comandos porque son dos hechos distintos y el documento los separa:
   * `cotizacion.crear` deja el documento con su folio y su vigencia, y
   * `cotizacion.registrar_envio` anota CUÁNDO y POR DÓNDE se mandó, que es de lo
   * que vive el seguimiento —«¿a quién no le hemos marcado desde hace cuatro
   * días?»—. El folio no se inventa aquí: lo toma el servidor de la serie «C».
   */
  function mandar(): void {
    void conLaPantallaOcupada(async () => {
      const cotizacion = await invocarComando<{
        readonly cotizacionId: string;
        readonly folio: string;
      }>('/api/cotizacion', {
        vigenciaDias: vigencia,
        nombreLibre: (clienteNombre ?? '').trim() === '' ? 'Mostrador' : clienteNombre,
        lineas: partidas.map((p) => ({
          productoId: p.material.id,
          descripcion: `${p.material.nombre} ${p.material.medida}`.trim().slice(0, 200),
          cantidad: p.cantidad.toFixed(4),
          unidad: p.material.unidad,
          // El descuento de la partida va en el PRECIO: la línea del comando no
          // tiene columna de descuento, y el importe que se cobra es éste.
          precioUnitarioCentavos: Math.round(p.precioCentavos * (1 - p.descuentoPct / 100)),
        })),
      });
      setCreada({ id: cotizacion.cotizacionId, folio: cotizacion.folio });
      await invocarComando('/api/cotizacion/enviar', {
        cotizacionId: cotizacion.cotizacionId,
        medio: 'whatsapp',
      });
      return `Cotización ${cotizacion.folio} mandada.`;
    });
  }

  function marcar(estado: Seguimiento): void {
    setSeguimiento(estado);
    // «Perdida» espera al motivo; «ganada» no tiene nada más que preguntar.
    if (estado !== 'ganada' || creada === null) return;
    void conLaPantallaOcupada(async () => {
      await invocarComando('/api/cotizacion/aprobar', { cotizacionId: creada.id });
      return `Cotización ${creada.folio} marcada como ganada.`;
    });
  }

  /** PERDIDA lleva motivo, y el motivo ES el dato: sin él la base la rechaza. */
  function marcarPerdida(motivo: string): void {
    if (creada === null) return;
    void conLaPantallaOcupada(async () => {
      await invocarComando('/api/cotizacion/cerrar', {
        cotizacionId: creada.id,
        resultado: 'perdida',
        motivo,
      });
      return `Cotización ${creada.folio} cerrada como perdida: ${motivo.toLowerCase()}.`;
    });
  }

  /**
   * COPIAR COMO TEXTO · el botón que estaba apagado y sin nada detrás.
   *
   * Tenía `disabled={sinPartidas}` y ningún `onClick`: en cuanto había una partida
   * se encendía y no hacía nada. Lo que hace falta es lo que se manda por WhatsApp
   * desde el teléfono: las partidas, su importe y el total, en texto plano. El
   * importe sale de `dineroEnTexto`, el mismo que se lee en `<Dinero>`.
   */
  function copiarComoTexto(): void {
    const renglones = partidas.map(
      (p) =>
        `${p.cantidad} ${p.material.unidad} · ${p.material.nombre} ${p.material.medida}`.trim() +
        ` · ${dineroEnTexto(importeDe(p))}`,
    );
    const texto = [
      ...renglones,
      `TOTAL ${dineroEnTexto(total)}`,
      vigencia === null ? '' : `Vigencia: ${String(vigencia)} días.`,
    ]
      .filter((linea) => linea !== '')
      .join('\n');
    void conLaPantallaOcupada(async () => {
      await navigator.clipboard.writeText(texto);
      return 'Cotización copiada. Pégala donde la quieras mandar.';
    });
  }

  /** Lo que el buscador enseña debajo del campo: fallo, forma de lo que viene, o hallazgos. */
  const hallazgos = (() => {
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo={`No se pudo leer el catálogo de ${voc.plural('producto')}`}
          queHacer={`Sin él no se agregan ${voc.plural('linea_orden')}. Lo que ya armaste sigue aquí: revisa la conexión y vuelve a leerlo.`}
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
      );
    }
    // La forma de la lista que viene, nunca una rueda.
    if (catalogo === null) return <EsqueletoDeLista filas={6} />;
    if (consulta.trim() === '') return null;
    return (
      <Tabla
        etiqueta="Resultados"
        columnas={columnasDelBuscador}
        filas={resultados}
        claveDe={(m) => m.id}
        alActivar={(id) => {
          const material = resultados.find((m) => m.id === id);
          if (material !== undefined) agregar(material);
        }}
        alto="max-h-[50vh]"
        vacio={
          <Vacio
            titulo={`No encontramos ${voc.enFraseCon('ese', 'producto')}.`}
            explicacion="Búscalo por otra palabra o por su medida."
            className="py-(--espacio-6)"
          />
        }
      />
    );
  })();

  return (
    <div className="flex flex-col gap-(--espacio-3) p-(--espacio-3) md:p-(--espacio-4)">
      {/* PRIMERO SE VE: el cliente, la vigencia y el total. Es lo que se revisa
          antes de mandar y por lo que se reclama después. */}
      <Superficie
        como="header"
        relleno={4}
        className="flex flex-wrap items-end justify-between gap-(--espacio-4)"
      >
        <div className="min-w-0">
          {creada !== null && (
            <p className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
              Folio {creada.folio}
            </p>
          )}
          <h1 className="text-xl font-bold">{clienteNombre ?? 'Cotización sin cliente'}</h1>
          <p className="text-sm text-texto-sutil">{clienteObra ?? 'Obra por definir'}</p>
        </div>
        <div
          role="group"
          aria-label="Vigencia de la cotización"
          className="flex flex-col gap-(--espacio-1)"
        >
          <span className="text-xs text-texto-sutil">Vigencia obligatoria</span>
          <div className="flex gap-(--espacio-1)">
            {VIGENCIAS.map((dias) => {
              const elegida = vigencia === dias;
              return (
                <Button
                  key={dias}
                  type="button"
                  size="sm"
                  aria-pressed={elegida}
                  variant={elegida ? 'default' : 'outline'}
                  onClick={() => {
                    setVigencia(dias);
                  }}
                >
                  {/* El color no puede ser el único que diga cuál está elegida. */}
                  {elegida ? <Check aria-hidden="true" /> : null}
                  {dias} días
                </Button>
              );
            })}
          </div>
        </div>
        <p className="flex flex-col items-end">
          <span className="text-xs text-texto-sutil">Total</span>
          <Dinero centavos={total} tamano="total" />
        </p>
      </Superficie>

      {nota !== null &&
        (nota.malo ? (
          <Aviso tono="peligro" titulo={nota.texto}>
            Lo que ya armaste sigue aquí.
          </Aviso>
        ) : (
          <Aviso tono="exito" titulo={nota.texto} />
        ))}

      <div className="grid gap-(--espacio-3) xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
        {/* El buscador, en UNA columna como la pantalla 1. No existe bajo `md`. */}
        <Superficie
          como="section"
          relleno={3}
          aria-labelledby="titulo-buscador"
          className="hidden flex-col gap-(--espacio-2) md:flex"
        >
          <h2 id="titulo-buscador" className="text-sm font-semibold">
            Agregar {voc.singular('producto')}
          </h2>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              value={consulta}
              onChange={alBuscar}
              aria-label={`Buscar ${voc.singular('producto')} por nombre o medida`}
              placeholder="cable 12, tinaco 1100…"
              className="pl-(--espacio-8)"
            />
          </div>
          {hallazgos}
        </Superficie>

        <section
          aria-labelledby="titulo-partidas"
          className="flex min-w-0 flex-col gap-(--espacio-2)"
        >
          <h2 id="titulo-partidas" className="text-sm font-semibold">
            {partidasEnTitulo} ({partidas.length})
          </h2>
          <Tabla
            etiqueta={`${partidasEnTitulo} de la cotización`}
            columnas={columnasDePartidas(voc.titulo('producto'), esDuenio, ajustar)}
            filas={partidas}
            claveDe={(p) => p.material.id}
            tonoDeFila={(p) => (esDuenio && margenDe(p) < 0 ? 'peligro' : undefined)}
            pie={{ material: 'Total', importe: <Dinero centavos={total} tamano="base" /> }}
            vacio={
              // El vacío ENSEÑA el flujo; no se disculpa por estar vacío.
              <Superficie nivel={0} relleno={0} className="border-dashed">
                <Vacio
                  icono={<FileText />}
                  titulo={`Una cotización empieza por ${voc.enFrase('producto')}.`}
                  explicacion="Búscalo por nombre o por medida: cantidad, precio y descuento se editan aquí mismo. Elige la vigencia —7, 15 o 30 días— y mándala por WhatsApp. Cuando el contratista conteste, se marca ganada o perdida desde esta pantalla."
                >
                  <p className="max-w-prose text-sm text-texto-sutil md:hidden">
                    Desde el teléfono se consulta y se reenvía. Ábrela en la computadora para
                    armarla.
                  </p>
                </Vacio>
              </Superficie>
            }
          />
        </section>
      </div>

      {/* MANDAR es la acción principal y la única llena. Sin vigencia va apagada. */}
      <Superficie como="footer" relleno={3} className="flex flex-col gap-(--espacio-3)">
        <div className="flex flex-wrap items-center gap-(--espacio-2)">
          <Button
            type="button"
            size="lg"
            disabled={sinPartidas || vigencia === null || enviando}
            onClick={mandar}
          >
            <Send aria-hidden="true" />
            Mandar por WhatsApp
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={sinPartidas || enviando}
            onClick={copiarComoTexto}
          >
            <Copy aria-hidden="true" />
            Copiar como texto
          </Button>
          <Button type="button" variant="secondary" disabled={sinPartidas}>
            Convertir en venta o pedido
          </Button>
          {/* El botón apagado dice por qué, o parece roto. */}
          {!sinPartidas && vigencia === null && (
            <p className="text-sm text-texto-sutil">
              Sin vigencia no se manda: elige 7, 15 o 30 días.
            </p>
          )}
        </div>

        <div
          role="group"
          aria-label="Seguimiento de la cotización"
          className="flex flex-wrap items-center gap-(--espacio-2) border-t border-borde pt-(--espacio-3)"
        >
          <span className="text-sm font-medium">Seguimiento</span>
          <Badge variant={seguimiento === 'perdida' ? 'destructive' : 'secondary'}>
            {PALABRA[seguimiento]}
          </Badge>
          {/* Hasta que la cotización exista, marcarla no tiene sobre qué: el seguimiento
              es de un documento con folio, no de lo que hay en la pantalla. Apagados y
              con el motivo escrito, que es mejor que un botón que promete y no cumple. */}
          {(['ganada', 'perdida'] as const).map((estado) => (
            <Button
              key={estado}
              type="button"
              size="sm"
              variant="outline"
              disabled={creada === null || enviando}
              title={creada === null ? 'Primero mándala: el seguimiento es de una cotización' : ''}
              onClick={() => {
                marcar(estado);
              }}
            >
              Marcar {estado}
            </Button>
          ))}
        </div>

        {seguimiento === 'perdida' && (
          <div
            className="flex flex-col gap-(--espacio-1)"
            role="group"
            aria-label="Motivo por el que se perdió"
          >
            <p className="text-xs text-texto-sutil">
              ¿Por qué se perdió? A los seis meses este campo dice si es precio o si es surtido.
            </p>
            <div className="flex flex-wrap gap-(--espacio-1)">
              {MOTIVOS.map((motivo) => (
                <Button
                  key={motivo}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={creada === null || enviando}
                  onClick={() => {
                    marcarPerdida(motivo);
                  }}
                >
                  {motivo}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Superficie>
    </div>
  );
}
