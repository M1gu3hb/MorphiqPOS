'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
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
 * ── Por qué la vigencia no trae valor por omisión ────────────────────────
 * El precio del cable y del acero se mueve, y una cotización sin fecha es una
 * promesa abierta que se cobra cara meses después. Un valor por omisión la
 * volvería un campo que nadie mira; sin él MANDAR está apagado. Por eso arriba
 * van cliente, vigencia y total: es lo que se revisa antes de mandar, y por lo
 * que se reclama después.
 *
 * ── Por qué el margen sólo lo ve el dueño ────────────────────────────────
 * El documento lo dice: márgenes para el encargado NO van aquí. Lo decide
 * `esDuenio` y no una clase que lo esconda: lo que no se debe ver, no se
 * dibuja ni viaja dentro del marcado.
 *
 * ── Por qué «perdida» pide motivo, y de una lista corta ──────────────────
 * Es el único dato de mercado que este negocio recolecta sin esfuerzo: a los
 * seis meses dice si se pierde por precio o por surtido, que son dos remedios
 * opuestos. Son botones porque una lista larga no se contesta, y «perdida» no
 * se guarda hasta que hay motivo — el motivo ES el dato.
 *
 * ── Por qué en TELÉFONO no se arma ───────────────────────────────────────
 * Cuarenta partidas en 390 px es una mala idea, y ofrecerlo sería vender una
 * frustración. Bajo `md` el buscador y los campos NO EXISTEN —no están
 * encogidos—: la partida se vuelve un renglón de consulta y quedan las salidas
 * de reenvío, que es para lo que se abre desde el teléfono.
 *
 * ── Qué NO va aquí, y qué se recortó para caber ──────────────────────────
 * No van cobro ni inventario: una cotización no mueve stock ni dinero hasta
 * que se convierte. Y por el límite de tamaño de este archivo quedan fuera, en
 * pantalla propia, el surtido parcial con su remisión por entrega y el PDF,
 * que lo arma el servidor; aquí «convertir» es un solo botón sin el diálogo de
 * qué se entrega hoy y qué se pide.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** 7, 15 o 30. No hay una cuarta ni hay campo libre. */
const VIGENCIAS = [7, 15, 30] as const;

/** La lista corta de por qué se perdió, tal cual la fija el documento. */
const MOTIVOS = ['Precio', 'Tiempo de entrega', 'No había', 'Se fue con otro', 'La obra no salió'];

const CABECERAS = ['Material', 'Precio', 'Cant.', 'Desc. %', 'Importe'];

const FRANJA = 'rounded-lg border border-border bg-card p-3 text-card-foreground shadow-1';
const FILA =
  'grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-md border border-border bg-card p-2 text-sm text-card-foreground';
const SUGERENCIA =
  'w-full rounded-md border border-border bg-card p-2 text-left text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground';
const CAMPO = 'hidden w-20 text-right tabular-nums md:block';

type Seguimiento = 'pendiente' | 'ganada' | 'perdida';

/** La palabra acompaña siempre a la insignia: el color nunca significa solo. */
const PALABRA = { pendiente: 'Pendiente', ganada: 'Ganada', perdida: 'Perdida' };

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
  return Math.round(((importe - p.material.costoCentavos * p.cantidad) / importe) * 100);
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
        // armar vale veinte minutos de alguien. Se avisa y se sigue.
        if (sigueMontada()) {
          setCatalogo([]);
          setNota({ texto: mensajeDe(fallo), malo: true });
        }
      });
    return () => {
      control.abort();
    };
  }, [catalogoInicial]);

  const resultados = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    if (texto === '' || catalogo === null) return [];
    const coincide = (m: MaterialCotizable) =>
      `${m.nombre} ${m.medida}`.toLowerCase().includes(texto);
    return catalogo.filter(coincide).slice(0, 8);
  }, [catalogo, consulta]);

  const total = partidas.reduce((suma, p) => suma + importeDe(p), 0);
  const columnas = esDuenio ? 'md:grid-cols-6' : 'md:grid-cols-5';
  const sinPartidas = partidas.length === 0;

  function alBuscar(evento: ChangeEvent<HTMLInputElement>): void {
    setConsulta(evento.target.value);
  }

  function agregar(material: MaterialCotizable): void {
    setConsulta('');
    const nueva = {
      material,
      cantidad: 1,
      precioCentavos: material.precioCentavos,
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

  function ajustar(id: string, clave: 'cantidad' | 'descuentoPct', crudo: number): void {
    const valor = Number.isFinite(crudo) ? crudo : 0;
    setPartidas((previas) =>
      previas.map((p) => {
        if (p.material.id !== id) return p;
        if (clave === 'cantidad') return { ...p, cantidad: Math.max(1, valor) };
        return { ...p, descuentoPct: Math.min(100, Math.max(0, valor)) };
      }),
    );
  }

  /** Las props del campo editable. Viven aquí para que la fila quepa de un vistazo. */
  function campo(p: PartidaCotizada, clave: 'cantidad' | 'descuentoPct') {
    const nombre = clave === 'cantidad' ? 'Cantidad' : 'Descuento';
    return {
      type: 'number' as const,
      value: p[clave],
      className: CAMPO,
      'aria-label': `${nombre} de ${p.material.nombre}`,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        ajustar(p.material.id, clave, Number(e.target.value));
      },
    };
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
   * desde el teléfono: las partidas, su importe y el total, en texto plano.
   */
  function copiarComoTexto(): void {
    const renglones = partidas.map(
      (p) =>
        `${p.cantidad} ${p.material.unidad} · ${p.material.nombre} ${p.material.medida}`.trim() +
        ` · ${PESOS.format(importeDe(p) / 100)}`,
    );
    const texto = [
      ...renglones,
      `TOTAL ${PESOS.format(total / 100)}`,
      vigencia === null ? '' : `Vigencia: ${String(vigencia)} días.`,
    ]
      .filter((linea) => linea !== '')
      .join('\n');
    void conLaPantallaOcupada(async () => {
      await navigator.clipboard.writeText(texto);
      return 'Cotización copiada. Pégala donde la quieras mandar.';
    });
  }

  if (catalogo === null) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[var(--altura-control)] w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <header className={`${FRANJA} flex flex-wrap items-end justify-between gap-4`}>
        <div>
          <h1 className="text-xl font-bold">{clienteNombre ?? 'Cotización sin cliente'}</h1>
          <p className="text-sm text-muted-foreground">{clienteObra ?? 'Obra por definir'}</p>
        </div>
        <div
          role="group"
          aria-label="Vigencia de la cotización"
          className="flex items-center gap-1"
        >
          <span className="mr-1 text-xs text-muted-foreground">Vigencia obligatoria</span>
          {VIGENCIAS.map((dias) => (
            <Button
              key={dias}
              type="button"
              size="sm"
              aria-pressed={vigencia === dias}
              variant={vigencia === dias ? ('default' as const) : ('outline' as const)}
              onClick={() => {
                setVigencia(dias);
              }}
            >
              {dias} días
            </Button>
          ))}
        </div>
        <p className="text-2xl font-bold tabular-nums">{PESOS.format(total / 100)}</p>
      </header>

      {nota !== null && (
        <p
          role={nota.malo ? 'alert' : 'status'}
          className={`rounded-md border p-2 text-sm ${nota.malo ? 'border-destructive bg-destructive/15' : 'border-border bg-success/20'}`}
        >
          {nota.texto} {nota.malo && 'Lo que ya armaste sigue aquí.'}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
        {/* El buscador, en UNA columna como la pantalla 1. No existe bajo `md`. */}
        <section className="hidden md:block" aria-labelledby="titulo-buscador">
          <h2 id="titulo-buscador" className="mb-2 text-sm font-semibold">
            Agregar {voc.singular('producto')}
          </h2>
          <Input
            value={consulta}
            onChange={alBuscar}
            aria-label={`Buscar ${voc.singular('producto')} por nombre o medida`}
            placeholder="cable 12, tinaco 1100…"
          />
          <ul className="mt-2 space-y-1">
            {resultados.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={SUGERENCIA}
                  onClick={() => {
                    agregar(m);
                  }}
                >
                  <span className="font-medium">{m.nombre}</span>{' '}
                  <span className="text-muted-foreground">{m.medida}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-partidas">
          <h2 id="titulo-partidas" className="mb-2 text-sm font-semibold">
            Partidas ({partidas.length})
          </h2>

          {sinPartidas && (
            // El vacío ENSEÑA el flujo; no se disculpa por estar vacío.
            <div className="rounded-lg border border-dashed border-border p-6 text-sm">
              <p className="font-medium">Una cotización empieza por {voc.enFrase('producto')}.</p>
              <p className="mt-2 text-muted-foreground">
                Búscalo por nombre o por medida: cantidad, precio y descuento se editan aquí mismo.
                Elige la vigencia —7, 15 o 30 días— y mándala por WhatsApp. Cuando el contratista
                conteste, se marca ganada o perdida desde esta pantalla.
              </p>
              <p className="mt-2 text-muted-foreground md:hidden">
                Desde el teléfono se consulta y se reenvía. Ábrela en la computadora para armarla.
              </p>
            </div>
          )}

          <div className={`${FILA} ${columnas} hidden border-transparent text-xs md:grid`}>
            {(esDuenio ? [...CABECERAS, 'Margen'] : CABECERAS).map((titulo, i) => (
              <span key={titulo} className={i === 0 ? 'font-semibold' : 'text-right font-semibold'}>
                {titulo}
              </span>
            ))}
          </div>

          <ul className="space-y-2 md:space-y-1">
            {partidas.map((p) => (
              <li key={p.material.id} className={`${FILA} ${columnas}`}>
                <span className="font-medium">
                  {p.material.nombre}{' '}
                  <span className="font-normal text-muted-foreground">{p.material.medida}</span>
                </span>
                {/* En teléfono la partida es un renglón de consulta, no un campo. */}
                <span className="text-right tabular-nums md:hidden">
                  {p.cantidad} {p.material.unidad} · {PESOS.format(importeDe(p) / 100)}
                </span>
                <span className={`${CAMPO} w-auto`}>{PESOS.format(p.precioCentavos / 100)}</span>
                <Input {...campo(p, 'cantidad')} />
                <Input {...campo(p, 'descuentoPct')} />
                <span className={`${CAMPO} w-auto font-medium`}>
                  {PESOS.format(importeDe(p) / 100)}
                </span>
                {esDuenio && <span className={`${CAMPO} w-auto`}>{margenDe(p)}%</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* MANDAR es la acción principal y la única llena. Sin vigencia va apagada. */}
      <footer className={`${FRANJA} flex flex-wrap items-center gap-2`}>
        <Button
          type="button"
          disabled={sinPartidas || vigencia === null || enviando}
          onClick={mandar}
        >
          Mandar por WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={sinPartidas || enviando}
          onClick={copiarComoTexto}
        >
          Copiar como texto
        </Button>
        <Button type="button" variant="secondary" disabled={sinPartidas}>
          Convertir en venta o pedido
        </Button>
        <Badge
          className="ml-auto"
          variant={seguimiento === 'perdida' ? ('destructive' as const) : ('secondary' as const)}
        >
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
        {seguimiento === 'perdida' && (
          <div className="w-full" role="group" aria-label="Motivo por el que se perdió">
            <p className="mb-1 text-xs text-muted-foreground">
              ¿Por qué se perdió? A los seis meses este campo dice si es precio o si es surtido.
            </p>
            <div className="flex flex-wrap gap-1">
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
      </footer>
    </div>
  );
}
