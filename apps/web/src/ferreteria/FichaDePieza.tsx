'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { ToggleGroup, ToggleGroupItem } from '@morphiqpos/ui/primitivas/toggle-group';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Camera, Check, MapPin, Plus, ZoomIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · ficha-de-pieza
 *
 * El resultado ampliado: resuelve la duda cuando la tabla del mostrador no
 * basta. 10 a 25 veces al día, con el cliente enfrente.
 *
 * ── Por qué primero la foto y la MEDIDA, y no el nombre ──────────────────
 * El nombre es idéntico en las cinco filas que acaban de salir en el mostrador
 * —«tornillo tirafondo»—; lo que distingue a ésta de las otras es la medida.
 * El nombre queda arriba y chico; la medida va en grande, y en las DOS
 * notaciones: pulgada y milímetro es la conversión que aquí se hace de cabeza
 * cincuenta veces al día y que el electricista joven ya no sabe hacer.
 *
 * ── Por qué la foto exige escala, y se dice dentro de la pantalla ────────
 * Una foto de tornillo sin una moneda al lado no dice nada: podría ser de un
 * cuarto o de media pulgada. La leyenda no decora, es la instrucción a quien
 * toma la foto; separa una galería inútil de una herramienta de venta.
 *
 * ── Por qué DECLARAR UN EQUIVALENTE se hace aquí y no en administración ──
 * F-060 sólo se alimenta mientras se opera. Chava acaba de descubrir que el
 * métrico de 6 mm sirve: si para decirlo tuviera que ir a otra pantalla, no lo
 * diría nunca y la base no se llenaría jamás. Por eso el campo está a la vista
 * y el vacío PIDE —«nadie ha dicho todavía qué le puede sustituir»— en vez de
 * disculparse: ese vacío es el mecanismo de captura, no un hueco.
 *
 * ── Por qué «va con» es otra cosa que «equivalente» ──────────────────────
 * El equivalente reemplaza; el «va con» acompaña. Es la venta complementaria,
 * media línea más por venta, que es el indicador del mostradorista.
 *
 * ── Por qué los precios son una tabla que se toca ────────────────────────
 * «Pieza $2.80 · kilo $195 · caja $1,180» se COMPARA en columna, y la fila que
 * se toca es la unidad que se vende: la misma elección que el grupo de la barra
 * de abajo, que sigue siendo la que se alcanza con el pulgar en el pasillo.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Caben la foto, la medida, los atributos, existencia, ubicación, precios por
 * unidad, equivalentes con su alta, «va con», «se usa en», historial del
 * cliente y AGREGAR A LA VENTA. Quedan FUERA el corte de material (tiene
 * pantalla propia) y la SUBIDA de la foto —`invocarComando` manda JSON y una
 * imagen necesita multipart—, así que el botón de cámara deja la foto elegida
 * y lo dice, en vez de fingir que subió.
 */

/** Una forma de vender la misma pieza: «pieza», «kilo (≈91 pz)», «caja 500». */
export interface UnidadDeVenta {
  readonly clave: string;
  readonly etiqueta: string;
  readonly precioCentavos: number;
}

export interface EquivalenteDeFicha {
  readonly id: string;
  readonly nombre: string;
  /** «métrico», «si no importa el acabado»: por qué sustituye. */
  readonly nota: string | null;
  readonly precioCentavos: number | null;
}

export interface PiezaDeFicha {
  readonly id: string;
  readonly nombre: string;
  /** La ruta del catálogo: «Fijación › Tornillo › Tirafondo». */
  readonly familia: string;
  readonly medidaPulgada: string;
  readonly medidaMilimetro: string;
  readonly rosca: string | null;
  readonly cabeza: string | null;
  readonly material: string | null;
  readonly acabado: string | null;
  readonly marca: string | null;
  readonly sku: string;
  readonly fotoUrl: string | null;
  readonly existencia: number;
  /** «4 cajas + 340 sueltos»: cómo está guardado, no sólo cuánto hay. */
  readonly desglose: string | null;
  readonly pesoKg: number | null;
  /** F-152. Sin la gaveta, la ficha informa y no termina la venta. */
  readonly ubicacion: string | null;
  readonly unidades: readonly UnidadDeVenta[];
  readonly equivalentes: readonly EquivalenteDeFicha[];
  readonly vaCon: readonly string[];
  readonly seUsaEn: readonly string[];
  readonly historialCliente: string | null;
}

/**
 * La fila del puente, con los HIJOS como los sirve `PiezaFerreteria`.
 *
 * El puente devuelve los hijos con la forma de SU entidad —`Presentacion` y
 * `Equivalencia`— y esta pantalla lee otra: `unidades` con `clave`/`etiqueta`,
 * `equivalentes` con `nota` y precio. La traducción vive aquí, en una función, y
 * no en la vista: lo que la vista no puede hacer es partir una lista en dos por su
 * `tipo`, que es justo la diferencia entre «le sirve» y «va con».
 */
type FilaDelPuente = Omit<PiezaDeFicha, 'unidades' | 'equivalentes' | 'vaCon' | 'seUsaEn'> & {
  readonly unidades?: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly factor: number | null;
    readonly precio_venta_centavos: number | null;
  }[];
  readonly equivalencias?: readonly {
    readonly equivalente_id: string;
    readonly nombre: string | null;
    readonly nota: string | null;
    readonly precioCentavos: number | null;
    readonly tipo: string;
  }[];
};

/** La pieza como la lee esta pantalla, armada de la fila y sus hijos. */
export function comoFicha(fila: FilaDelPuente): PiezaDeFicha {
  const equivalencias = fila.equivalencias ?? [];
  const deTipo = (tipo: string) => equivalencias.filter((e) => e.tipo === tipo);
  return {
    ...fila,
    // La unidad base primero: es la que el mostrador cobra por omisión.
    unidades: (fila.unidades ?? []).map((u) => ({
      clave: u.id,
      etiqueta: u.factor === null || u.factor <= 1 ? u.nombre : `${u.nombre} (${String(u.factor)})`,
      precioCentavos: u.precio_venta_centavos ?? 0,
    })),
    // `sustituto` REEMPLAZA y `complemento` ACOMPAÑA: son dos listas distintas
    // porque ofrecer una llave a quien pide teflón es ruido en el mostrador.
    equivalentes: deTipo('sustituto').map((e) => ({
      id: e.equivalente_id,
      nombre: e.nombre ?? 'Sin nombre',
      nota: e.nota,
      precioCentavos: e.precioCentavos,
    })),
    vaCon: deTipo('complemento').map((e) => e.nombre ?? 'Sin nombre'),
    // `seUsaEn` sale de las listas de trabajo y todavía no se sirve: el vacío de
    // esa fila ya lo dice —«ninguna lista de trabajo lo pide todavía»— y decirlo
    // es mejor que rellenarlo con lo primero que se parezca.
    seUsaEn: [],
  };
}

export interface FichaDePiezaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly piezaInicial?: PiezaDeFicha | null;
  /** Sin él la ficha abre la primera del catálogo; el mostrador sí lo manda. */
  readonly piezaId?: string;
  readonly onAgregar?: (piezaId: string, cantidad: number, unidad: string) => void;
}

/**
 * Traduce un fallo a algo que el mostradorista pueda hacer.
 *
 * El límite de intentos no es un código: es el 429, y por eso se lee del
 * estado de la respuesta y no del código estable.
 */
export function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Vas muy rápido. Espera unos segundos y vuelve a intentarlo.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede hacer esto.';
    if (fallo.error.codigo === 'NO_ENCONTRADO') return 'Esa pieza ya no está en el catálogo.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';
}

/** Un comando que no salió: lo que pasó y, aparte, lo que NO pasó. */
interface FalloDeComando {
  readonly que: string;
  readonly queNo: string;
}

const NO_SE_AGREGO = 'No se agregó nada a la venta.';
const NO_SE_GUARDO = 'El equivalente no se guardó.';

/** El rótulo de un bloque —HAY, DÓNDE, MEDIDA—: chico, en versales, siempre igual. */
const ROTULO = 'text-xs font-semibold tracking-wide text-texto-sutil uppercase';

/** Los equivalentes se leen como el mostrador: qué es y por qué sirve, y su precio. */
const COLUMNAS_DE_EQUIVALENTES: readonly ColumnaDeTabla<EquivalenteDeFicha>[] = [
  {
    clave: 'equivalente',
    titulo: 'Le sirve',
    celda: (eq) => (
      <span className="flex flex-col">
        <span className="font-medium">{eq.nombre}</span>
        {eq.nota === null ? null : <span className="text-xs text-texto-sutil">{eq.nota}</span>}
      </span>
    ),
  },
  {
    clave: 'precio',
    titulo: 'Precio',
    numerica: true,
    celda: (eq) =>
      eq.precioCentavos === null ? (
        <span className="text-texto-sutil">—</span>
      ) : (
        <Dinero centavos={eq.precioCentavos} tamano="sm" />
      ),
  },
];

/** La unidad elegida lleva su marca escrita: el fondo solo no dice cuál es. */
function columnasDePrecio(elegida: string | undefined): readonly ColumnaDeTabla<UnidadDeVenta>[] {
  return [
    {
      clave: 'unidad',
      titulo: 'Unidad',
      celda: (u) => (
        <span className="inline-flex items-center gap-(--espacio-1)">
          {u.clave === elegida ? (
            <Check aria-label="la que se vende" className="size-4 shrink-0" />
          ) : null}
          {u.etiqueta}
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      celda: (u) => <Dinero centavos={u.precioCentavos} tamano="sm" />,
    },
  ];
}

export function FichaDePieza({ piezaInicial, piezaId, onAgregar }: FichaDePiezaProps) {
  const voc = useVocabulario();
  const enrutador = useRouter();
  const [pieza, setPieza] = useState<PiezaDeFicha | null>(piezaInicial ?? null);
  const [equivalentes, setEquivalentes] = useState<readonly EquivalenteDeFicha[]>(
    piezaInicial?.equivalentes ?? [],
  );
  const [cargando, setCargando] = useState(piezaInicial === undefined);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [fallo, setFallo] = useState<FalloDeComando | null>(null);
  const [intento, setIntento] = useState(0);
  const [cantidad, setCantidad] = useState('1');
  const [unidad, setUnidad] = useState('pieza');
  const [propuesta, setPropuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fotoElegida, setFotoElegida] = useState<string | null>(null);

  useEffect(() => {
    if (piezaInicial !== undefined) return;
    // Centinela por AbortController y no por una bandera: la bandera el
    // compilador la da por siempre-verdadera y además no corta la petición.
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    const filtro = piezaId === undefined ? {} : { id: piezaId };
    consultarPuente<FilaDelPuente>('PiezaFerreteria', {
      filtro,
      limite: 1,
      signal: control.signal,
    })
      .then((filas) => {
        if (!sigueMontada()) return;
        const cruda = filas[0];
        const primera = cruda === undefined ? null : comoFicha(cruda);
        setPieza(primera);
        if (primera !== null) setEquivalentes(primera.equivalentes);
        setFalloDeCarga(null);
        setCargando(false);
      })
      .catch((error: unknown) => {
        // La ficha no se vacía por un error: si ya había datos siguen sirviendo
        // y si no los había, la pantalla dice que no leyó y deja reintentar.
        if (!sigueMontada()) return;
        setFalloDeCarga(mensajeDe(error));
        setCargando(false);
      });
    return () => {
      control.abort();
    };
  }, [piezaInicial, piezaId, intento]);

  /** Reintentar limpia EN EL CLIC, no en el efecto: el efecto sólo vuelve a leer. */
  function volverALeer(): void {
    setFalloDeCarga(null);
    setCargando(true);
    setIntento((previo) => previo + 1);
  }

  /** Un solo sitio donde una escritura se anuncia, falla y termina. */
  async function enviar(
    ruta: string,
    entrada: unknown,
    queNo: string,
    despues: () => void,
  ): Promise<void> {
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando(ruta, entrada);
      despues();
    } catch (error) {
      setFallo({ que: mensajeDe(error), queNo });
    } finally {
      setEnviando(false);
    }
  }

  // Las rutas de escritura no están en el documento: se usa la convención
  // /api/<dominio>/<verbo> hasta que el de datos y backend las fije.
  function agregarALaVenta(): void {
    if (pieza === null) return;
    const piezas = Number.parseInt(cantidad, 10);
    if (!Number.isFinite(piezas) || piezas <= 0) {
      setFallo({ que: 'Pon una cantidad mayor que cero.', queNo: NO_SE_AGREGO });
      return;
    }
    // La cantidad va como TEXTO: quien convierte cantidades es el servidor, y un
    // `number` de JavaScript no representa 0.1 sin error.
    const entrada = { piezaId: pieza.id, cantidad: String(piezas), unidad };
    void enviar('/api/ferreteria/agregar-partida', entrada, NO_SE_AGREGO, () => {
      onAgregar?.(pieza.id, piezas, unidad);
    });
  }

  function declararEquivalente(): void {
    const texto = propuesta.trim();
    if (pieza === null || texto === '') return;
    const entrada = { piezaId: pieza.id, texto };
    void enviar('/api/ferreteria/declarar-equivalencia', entrada, NO_SE_GUARDO, () => {
      // Se pinta al momento: quien acaba de declararlo tiene que verlo ahí.
      const recien = { id: texto, nombre: texto, nota: 'lo dijiste tú', precioCentavos: null };
      setEquivalentes((actuales) => [...actuales, recien]);
      setPropuesta('');
    });
  }

  if (cargando) {
    // Esqueleto con la forma de la ficha —foto, medida, los tres bloques—, nunca
    // una rueda: el ojo ya sabe dónde va a mirar cuando lleguen los datos.
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando la ficha de la pieza"
        className="mx-auto flex max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-3)"
      >
        <div className="flex flex-col gap-(--espacio-2)">
          <Esqueleto className="h-3 w-1/3" />
          <Esqueleto className="h-5 w-2/3" />
        </div>
        <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <Esqueleto className="aspect-square w-full rounded-lg" />
          <div className="flex flex-col gap-(--espacio-2)">
            <Esqueleto className="h-(--altura-control) w-1/2" />
            <Esqueleto className="h-5 w-1/3" />
            {Array.from({ length: 6 }, (_, indice) => (
              <Esqueleto key={indice} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <div className="grid gap-(--espacio-3) md:grid-cols-3">
          {Array.from({ length: 3 }, (_, indice) => (
            <Esqueleto key={indice} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (pieza === null && falloDeCarga !== null) {
    // No leyó nada: no hay ficha que seguir usando, así que se dice y se reintenta.
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-(--espacio-3) p-(--espacio-6)">
        <h1 className="sr-only">Ficha de pieza</h1>
        <ErrorDePantalla
          titulo="No se pudo leer la pieza"
          queHacer="Sin la ficha no se ve la medida, cuánto hay ni de qué gaveta se saca. Revisa la conexión y vuelve a leerla."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={volverALeer}>
              Volver a leer
            </Button>
          }
        />
      </div>
    );
  }

  if (pieza === null) {
    // El vacío ENSEÑA: dice qué resuelve esta pantalla y cómo se llega a ella.
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-(--espacio-3) p-(--espacio-6)">
        <h1 className="sr-only">Ficha de pieza</h1>
        <Vacio
          icono={<ZoomIn />}
          titulo="Aquí se amplía una pieza"
          explicacion="La ficha se abre desde el mostrador: toca el renglón del material y verás su foto con escala, la medida en pulgada y en milímetro, cuánto hay, de qué gaveta se saca y qué le puede sustituir."
          accion={
            <Button
              type="button"
              onClick={() => {
                enrutador.push('/ferreteria/mostrador');
              }}
            >
              Ir al mostrador a buscar una pieza
            </Button>
          }
        />
      </div>
    );
  }

  const atributos = [
    ['Rosca', pieza.rosca],
    ['Cabeza', pieza.cabeza],
    ['Material', pieza.material],
    ['Acabado', pieza.acabado],
    ['Marca', pieza.marca],
    ['SKU', pieza.sku],
  ] as const;

  /** Lo que acompaña y lo que ya se llevó: cada uno con su vacío que invita. */
  const relaciones = [
    ['Va con', pieza.vaCon, 'Nadie ha registrado todavía qué lo acompaña.'],
    ['Se usa en', pieza.seUsaEn, 'Ninguna lista de trabajo lo pide todavía.'],
    [
      'Historial',
      historialDe(pieza),
      `${voc.conDeterminante('este', 'cliente')} no se lo ha llevado antes.`,
    ],
  ] as const;

  const elegida = pieza.unidades.find((u) => u.clave === unidad) ?? pieza.unidades[0];
  const pedidas = Number.parseInt(cantidad, 10);
  const importe = (elegida?.precioCentavos ?? 0) * (Number.isFinite(pedidas) ? pedidas : 0);

  return (
    <article className="mx-auto flex max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-3) text-sm">
      {falloDeCarga === null ? null : (
        <Aviso tono="peligro" titulo={falloDeCarga}>
          Lo que ya está en pantalla sigue sirviendo.
        </Aviso>
      )}
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo.que}>
          {fallo.queNo} Lo que ya está en pantalla sigue sirviendo.
        </Aviso>
      )}

      <header className="flex flex-col gap-(--espacio-1)">
        <p className={ROTULO}>{pieza.familia}</p>
        <h1 className="text-lg font-semibold md:text-xl">{pieza.nombre}</h1>
      </header>

      {/* En teléfono la foto va primero y a ancho completo; de tablet para
          arriba pasa a columna y los datos se leen a su lado. Un solo marcado. */}
      <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <section aria-label="Foto de la pieza" className="flex flex-col gap-(--espacio-1)">
          {pieza.fotoUrl === null ? (
            <Superficie
              como="label"
              interactiva
              nivel={0}
              relleno={4}
              className="flex min-h-48 flex-col items-center justify-center gap-(--espacio-2) border-2 border-dashed bg-fondo-sutil text-center focus-within:ring-[3px] focus-within:ring-anillo/60 md:aspect-square"
            >
              <Camera
                aria-hidden="true"
                className="size-(--altura-control) shrink-0 text-texto-sutil"
              />
              <span className="text-lg font-semibold">Tomar foto</span>
              <span className="text-xs text-texto-sutil">
                Ponle una moneda al lado: sin escala la foto no dice nada.
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(evento) => {
                  setFotoElegida(evento.target.files?.[0]?.name ?? null);
                }}
              />
            </Superficie>
          ) : (
            // Fondo y no <img> para no depender del cargador remoto de Next. Se
            // limpian comillas y barras: la URL viene de la base y entra a CSS.
            <Superficie
              role="img"
              aria-label={`Foto de ${pieza.nombre} con una moneda de referencia`}
              nivel={0}
              relleno={0}
              className="aspect-square w-full bg-fondo-sutil bg-cover bg-center"
              style={{ backgroundImage: `url("${pieza.fotoUrl.replace(/["\\]/g, '')}")` }}
            >
              {null}
            </Superficie>
          )}
          {fotoElegida !== null && (
            <p className="inline-flex items-center gap-(--espacio-1) text-xs text-texto-sutil">
              <Check aria-hidden="true" className="size-4 shrink-0" />
              Foto lista: {fotoElegida} · se sube cuando se guarde la pieza.
            </p>
          )}
        </section>

        <section aria-label="Medida y atributos" className="flex flex-col gap-(--espacio-3)">
          <div>
            <p className={ROTULO}>Medida</p>
            <p className="font-numeros text-3xl leading-tight font-bold">{pieza.medidaPulgada}</p>
            <p className="font-numeros text-lg text-texto-sutil">{pieza.medidaMilimetro}</p>
          </div>
          <dl className="grid gap-x-(--espacio-4) sm:grid-cols-2">
            {atributos.map(([etiqueta, valor]) => (
              <div
                key={etiqueta}
                className="flex justify-between gap-(--espacio-2) border-b border-borde py-(--espacio-2)"
              >
                <dt className="text-texto-sutil">{etiqueta}</dt>
                <dd className="text-right font-medium">{valor ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* Cuánto hay, de dónde se saca y a cuánto: lo que se dice en voz alta con
          el cliente enfrente, en tres bloques que se leen de un vistazo. */}
      <div className="grid gap-(--espacio-3) md:grid-cols-3">
        <Superficie
          como="section"
          aria-label="Existencia"
          relleno={3}
          className="flex flex-col gap-(--espacio-1)"
        >
          <p className={ROTULO}>Hay</p>
          {/* Negativo es un dato que NO es verdad: falta capturar una entrada. */}
          {pieza.existencia < 0 ? (
            <p className="text-xl font-semibold text-peligro">revisar entradas</p>
          ) : (
            <Cifra
              valor={pieza.existencia}
              unidad="pz"
              tamano="lg"
              className="text-2xl font-bold"
            />
          )}
          <p className="text-texto-sutil">
            {pieza.desglose ?? 'sin desglose de empaque'}
            {pieza.pesoKg === null ? null : (
              <>
                {' · ≈ '}
                <Cifra valor={pieza.pesoKg} unidad="kg" decimales={1} tamano="sm" />
              </>
            )}
          </p>
        </Superficie>

        <Superficie
          como="section"
          aria-label="Ubicación"
          relleno={3}
          className="flex flex-col gap-(--espacio-1)"
        >
          <p className={ROTULO}>Dónde</p>
          {/* En negritas: en el pasillo es el dato que se está usando. */}
          {pieza.ubicacion === null ? (
            <p className="text-base text-texto-sutil">Sin ubicación registrada</p>
          ) : (
            <p className="inline-flex items-center gap-(--espacio-2) text-xl font-bold">
              <MapPin aria-hidden="true" className="size-5 shrink-0" />
              {pieza.ubicacion}
            </p>
          )}
        </Superficie>

        <Superficie como="section" aria-label="Precios" relleno={0} className="overflow-hidden">
          <Tabla
            etiqueta="Precio por unidad de venta"
            columnas={columnasDePrecio(elegida?.clave)}
            filas={pieza.unidades}
            claveDe={(u) => u.clave}
            {...(elegida === undefined ? {} : { activa: elegida.clave })}
            alActivar={(clave) => {
              setUnidad(clave);
            }}
            alto="max-h-48"
            className="rounded-none border-0"
            vacio={
              <p className="p-(--espacio-3) text-texto-sutil">
                <span className={`block ${ROTULO}`}>Precio</span>
                Sin precio capturado
              </p>
            }
          />
        </Superficie>
      </div>

      {/* El alta de equivalentes va desplegada y arriba de todo lo demás: es el
          control más importante de la pantalla, y escondido no se usaría. */}
      <Superficie
        como="section"
        aria-labelledby="titulo-equivalentes"
        relleno={4}
        className="flex flex-col gap-(--espacio-3)"
      >
        <h2 id="titulo-equivalentes" className="text-base font-semibold">
          Equivalentes ({equivalentes.length})
        </h2>
        <Tabla
          etiqueta="Equivalentes de la pieza"
          columnas={COLUMNAS_DE_EQUIVALENTES}
          filas={equivalentes}
          claveDe={(eq) => eq.id}
          alto="max-h-60"
          vacio={null}
        />
        <form
          className="flex flex-col gap-(--espacio-2) sm:flex-row sm:items-end"
          onSubmit={(evento) => {
            evento.preventDefault();
            declararEquivalente();
          }}
        >
          <div className="flex grow flex-col gap-(--espacio-1)">
            <Label htmlFor="equivalente">
              {equivalentes.length === 0
                ? 'Nadie ha dicho todavía qué le puede sustituir. Si sabes, dilo aquí.'
                : '¿Sabes de otro que sirva? Dilo aquí.'}
            </Label>
            <Input
              id="equivalente"
              /**
               * REQUERIDO, y por eso enviar en vacío DICE algo.
               *
               * Sin esto, pulsar Enter con el campo vacío no hacía absolutamente nada:
               * `declararEquivalente` se iba de vuelta en su primera línea y la pantalla
               * se quedaba igual, sin un aviso. Lo destapó el rastreador en CI, que
               * envía los formularios que encuentra. Con `required`, el navegador
               * enseña su propio mensaje en el campo —en el idioma del sistema— y no
               * llega a enviarse: la validación nativa es gratis y es la que un lector
               * de pantalla ya sabe anunciar.
               */
              required
              value={propuesta}
              placeholder="Tornillo 6 mm × 50 mm galvanizado"
              onChange={(evento) => {
                setPropuesta(evento.target.value);
              }}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={enviando || propuesta.trim() === ''}>
            <Plus aria-hidden="true" />
            Declarar
          </Button>
        </form>
      </Superficie>

      <dl className="flex flex-col">
        {relaciones.map(([titulo, lineas, vacio]) => (
          <div
            key={titulo}
            className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-(--espacio-3) border-b border-borde py-(--espacio-2)"
          >
            <dt className={ROTULO}>{titulo}</dt>
            <dd className={lineas.length === 0 ? 'text-texto-sutil' : 'font-medium'}>
              {lineas.length === 0 ? vacio : lineas.join(' · ')}
            </dd>
          </div>
        ))}
      </dl>

      {/* En el pasillo la barra se pega abajo —el pulgar la alcanza sin subir—;
          en PC se queda donde cae, al final de la ficha. */}
      <Superficie
        como="footer"
        nivel={3}
        radio="sm"
        relleno={3}
        className="sticky bottom-0 z-10 -mx-(--espacio-3) flex flex-wrap items-end gap-(--espacio-3) rounded-none md:static md:mx-0 md:rounded-lg md:shadow-1"
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="cantidad">Cantidad</Label>
          <Input
            id="cantidad"
            inputMode="numeric"
            value={cantidad}
            className="w-24 font-numeros text-lg tabular-nums"
            onChange={(evento) => {
              setCantidad(evento.target.value);
            }}
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={unidad}
          aria-label="Unidad de venta"
          onValueChange={(valor) => {
            if (valor !== '') setUnidad(valor);
          }}
        >
          {pieza.unidades.map((u) => (
            <ToggleGroupItem key={u.clave} value={u.clave} className="px-(--espacio-3)">
              {u.etiqueta}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          type="button"
          size="lg"
          className="w-full justify-between gap-(--espacio-3) sm:ml-auto sm:w-auto"
          disabled={enviando}
          cargando={enviando}
          onClick={() => {
            agregarALaVenta();
          }}
        >
          <span>{enviando ? 'Agregando…' : 'AGREGAR A LA VENTA'}</span>
          <Dinero centavos={importe} />
        </Button>
      </Superficie>
    </article>
  );
}

/** El historial es una frase o no es nada; la lista lo unifica con las otras. */
function historialDe(pieza: PiezaDeFicha): readonly string[] {
  return pieza.historialCliente === null ? [] : [pieza.historialCliente];
}
