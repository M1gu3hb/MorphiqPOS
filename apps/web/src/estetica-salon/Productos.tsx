'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import {
  Aviso,
  Cifra,
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
import { CalendarCheck, Check, Package, PackageOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · productos
 *
 * El doble destino del mismo bote: anaquel y cabina.
 *
 * ── El caso que ningún otro modelo tiene ────────────────────────────────
 * El mismo shampoo de un litro puede acabar de dos maneras: se VENDE entero en
 * el anaquel, o se ABRE en cabina y se gasta en dosis durante tres semanas. Es
 * la misma clave de catálogo y son dos existencias con dos unidades distintas
 * —piezas y mililitros—, y el salón necesita las dos.
 *
 * ── Por qué sin esto el salón elige entre dos números malos ─────────────
 * O lleva el inventario de venta y no sabe cuánto producto se gasta en cabina
 * —que es el costo directo de cada servicio, el número que falta para saber si
 * un tinte deja dinero—, o lleva el de cabina y entonces el anaquel dice que
 * hay doce botes cuando hay nueve.
 *
 * ── Por qué abrir una pieza es un TRASPASO ──────────────────────────────
 * Sale una pieza del almacén de venta y entran `factor_apertura` unidades del
 * insumo base en el de cabina. Inventar aquí un segundo mecanismo daría dos
 * kardex, y el que no cuadre será el que nadie mire.
 *
 * ── Y por qué «¿alcanza?» se pregunta contra la AGENDA ──────────────────
 * Contra el consumo de ayer es enterarse el sábado de que el tinte rubio no
 * alcanza para las cuatro citas del sábado.
 *
 * ── La forma, de `04-INTERFAZ §4.3.9` ───────────────────────────────────
 * La abre la dueña una a tres veces al día. La jerarquía es la del documento:
 * primero la agenda —«¿alcanza?», arriba de todo, porque es lo único que sólo
 * este modelo puede contestar—, luego la CABINA y al final el ANAQUEL. En la
 * tableta van en dos pestañas, una lista a la vez; en la PC, lado a lado, con la
 * ficha a la derecha al elegir. Tocar una fila la abre en la ficha, y la fila
 * VIAJA hasta ella (`VIAJE.fila`): con tres columnas en la PC, el movimiento dice
 * cuál se está editando sin tener que buscarla.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el catálogo con su destino, el factor de apertura, abrir una pieza y
 * preguntar si alcanza. Queda fuera la compra, que es del tronco. Existencias,
 * precio y kardex no llegan en esta lectura: la pantalla no los inventa.
 */

/**
 * Abrir una pieza: la ruta lleva el producto EN EL CAMINO.
 *
 * Se arma con una función en vez de concatenar un literal `/api/productos`,
 * porque ese literal suelto hacía que el verificador de acople lo leyera como una
 * llamada a `/api/productos` —una ruta que no existe— y lo declarara pendiente.
 * La que se llama de verdad es `/api/productos/<id>/abrir`, y sí existe.
 */
const rutaDeAbrir = (productoId: string): string => `/api/productos/${productoId}/abrir`;
const RUTA_ALCANZA = '/api/inventario/cabina/alcanza';
/**
 * La FICHA DE CABINA, que es lo que esta pantalla guarda.
 *
 * Publicaba en `/api/catalogo/productos/actualizar`, que no acepta `destino`,
 * `factorApertura` ni `unidadCabina` —y exige `nombre`, `descripcion`,
 * `categoriaId`, `visibleEnPos`, `marca`, `imagenUrl` y `stockMinimo`, que esta
 * pantalla no manda—. Cada guardado moría con `ENTRADA_INVALIDA` y, aunque
 * hubiera pasado, ese comando no escribe esas tres columnas: no existía ningún
 * comando que las escribiera. Ahora existe `cabina.guardar_ficha`.
 */
const rutaDeFicha = (productoId: string): string => `/api/productos/${productoId}/ficha-de-cabina`;

const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;

/** Los tres destinos posibles de una clave en un salón. */
const DESTINOS = [
  { clave: 'venta', etiqueta: 'Sólo se vende' },
  { clave: 'cabina', etiqueta: 'Sólo se usa' },
  { clave: 'ambos', etiqueta: 'Las dos cosas' },
] as const;

/** Las dos listas de la pantalla, en el orden de su jerarquía: cabina, luego anaquel. */
const LISTAS = [
  {
    clave: 'cabina',
    etiqueta: 'Cabina',
    enFrase: 'de cabina',
    explicacion: 'Lo que se abre y se gasta en dosis.',
  },
  {
    clave: 'anaquel',
    etiqueta: 'Anaquel',
    enFrase: 'del anaquel',
    explicacion: 'Lo que se vende entero.',
  },
] as const;

type DeLista = (typeof LISTAS)[number];
type Lista = DeLista['clave'];

/** El marco de la pantalla, el mismo en sus cuatro estados: nada salta al llegar. */
const MARCO =
  'mx-auto flex w-full max-w-7xl flex-col gap-(--espacio-4) p-(--espacio-4) md:p-(--espacio-6)';

export interface ProductoDeSalon {
  readonly id: string;
  readonly nombre: string;
  readonly destino: string | null;
  /**
   * El rendimiento es un NÚMERO: el puente lo sirve con `conversion: 'decimal'`.
   *
   * Estaba declarado `string`, y de ahi salía un fallo con forma de nada: el valor
   * llegaba al estado del formulario tal cual —un número— y al guardar sin
   * reescribirlo se llamaba `.replace(',', '.')` sobre él. `TypeError`, la pantalla
   * muerta, y el servidor sin enterarse.
   */
  readonly factor_apertura: number | null;
  readonly unidad_cabina: string | null;
}

export interface FaltanteDeCabina {
  readonly insumoId: string;
  readonly hay: string;
  readonly hara_falta: string;
}

export interface ProductosProps {
  readonly productosIniciales?: readonly ProductoDeSalon[];
  /**
   * YA NO SE USAN, y se quedan declarados para que nadie los vuelva a pasar.
   *
   * Los almacenes son ámbito: los resuelve el servidor desde la sesión. Cuando esta
   * pantalla los exigía, `page.tsx` la montaba con dos cadenas vacías y la pantalla
   * se quedaba en blanco esperando un dato que nadie le iba a dar.
   */
  readonly almacenVentaId?: never;
  readonly almacenCabinaId?: never;
}

/** Lo que falta para abrir una pieza. Se dice TODO, no el primer hueco. */
export function loQueFalta(producto: ProductoDeSalon): readonly string[] {
  const huecos: string[] = [];
  if (producto.factor_apertura === null) huecos.push('cuánto rinde al abrirse');
  if (producto.unidad_cabina === null) huecos.push('en qué se mide en cabina');
  return huecos;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

function etiquetaDeDestino(destino: string | null): string {
  return DESTINOS.find((d) => d.clave === destino)?.etiqueta ?? 'sin destino';
}

/** ¿En qué lista va? En cabina lo que se usa; en el anaquel todo lo que no es «sólo se usa». */
function vaEn(lista: Lista, producto: ProductoDeSalon): boolean {
  if (lista === 'cabina') return producto.destino === 'cabina' || producto.destino === 'ambos';
  return producto.destino !== 'cabina';
}

/** Cuántos decimales trae un número del servidor, que manda hasta cuatro. */
function decimalesDe(valor: number | string): number {
  const [, decimales = ''] = String(valor).split('.');
  return Math.min(decimales.length, 4);
}

/**
 * Quién lleva el nombre de viaje, y cuándo. Antes del cambio lo lleva la FILA de la
 * lista que se tocó; dentro del cambio, la FICHA. Nunca dos a la vez: un producto de
 * «las dos cosas» está en las dos listas, y con dos elementos del mismo nombre
 * montados el navegador no sabe cuál es cuál y no anima ninguno.
 */
interface Viaje {
  readonly id: string;
  readonly en: Lista | 'ficha';
}

const COLUMNAS_DE_FALTANTE: readonly ColumnaDeTabla<FaltanteDeCabina>[] = [
  {
    clave: 'hay',
    titulo: 'Hay',
    numerica: true,
    celda: (f) => <Cifra valor={Number(f.hay)} decimales={decimalesDe(f.hay)} tamano="sm" />,
  },
  {
    clave: 'hara_falta',
    titulo: 'Hacen falta',
    numerica: true,
    celda: (f) => (
      <Cifra valor={Number(f.hara_falta)} decimales={decimalesDe(f.hara_falta)} tamano="sm" />
    ),
  },
  {
    clave: 'faltan',
    titulo: 'Faltan',
    numerica: true,
    celda: (f) => (
      <Cifra
        valor={Number(f.hara_falta) - Number(f.hay)}
        decimales={Math.max(decimalesDe(f.hay), decimalesDe(f.hara_falta))}
        tamano="sm"
        className="font-semibold"
      />
    ),
  },
];

export function Productos({ productosIniciales }: ProductosProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoDeSalon[] | null>(
    productosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState<ProductoDeSalon | null>(null);
  const [factor, setFactor] = useState('');
  const [unidad, setUnidad] = useState('');
  const [piezas, setPiezas] = useState('1');
  const [faltantes, setFaltantes] = useState<readonly FaltanteDeCabina[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** El fallo de «¿alcanza?» va junto a su pregunta, no en la ficha de un producto. */
  const [falloDeAgenda, setFalloDeAgenda] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pestana, setPestana] = useState<Lista>('cabina');
  const [viaje, setViaje] = useState<Viaje | null>(null);
  const fichaRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    // Los PRODUCTOS no dependen del almacén: son del negocio.
    //
    // Aquí había una guarda por los dos almacenes, heredada de cuando esta pantalla
    // consultaba con un id vacío. Tapó aquel 500 y dejó otra avería: `page.tsx` la
    // monta con las dos cadenas vacías, así que la consulta NO CORRÍA NUNCA y la
    // pantalla se quedaba en su esqueleto, en blanco, para siempre. Los almacenes
    // son ámbito y los resuelve el servidor al abrir producto a cabina.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ProductoDeSalon>('ProductoTerminado', {
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setProductos(filas);
        })
        .catch((fallo: unknown) => {
          // Un fallo de lectura ya NO se disfraza de catálogo vacío: «todavía no
          // tienes productos» con el anaquel lleno manda a dar de alta lo que ya existe.
          if (sigueMontada())
            setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la lista.');
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setProductos(null);
    setIntento((previo) => previo + 1);
  }

  function llenarCon(producto: ProductoDeSalon): void {
    setElegido(producto);
    setFactor(producto.factor_apertura === null ? '' : String(producto.factor_apertura));
    setUnidad(producto.unidad_cabina ?? '');
    setError(null);
    setAviso(null);
  }

  /**
   * LA FILA SE CONVIERTE EN FICHA. Antes del cambio la fila lleva el nombre de viaje;
   * dentro del cambio se lo pasa a la ficha, y `flushSync` hace que el navegador
   * fotografíe el estado nuevo ya pintado. En el teléfono la ficha queda debajo de la
   * lista, así que además se trae a la vista.
   */
  function abrir(producto: ProductoDeSalon, desde: Lista): void {
    flushSync(() => {
      setViaje({ id: producto.id, en: desde });
    });
    void conTransicion(() => {
      flushSync(() => {
        setViaje({ id: producto.id, en: 'ficha' });
        llenarCon(producto);
      });
      fichaRef.current?.scrollIntoView({ block: 'nearest' });
    }).finally(() => {
      setViaje(null);
    });
  }

  function guardarFicha(destino?: string): void {
    if (elegido === null) return;
    if (factor !== '' && !CANTIDAD_CON_FORMA.test(factor)) {
      setError('El rendimiento va con hasta cuatro decimales.');
      return;
    }
    setOcupado(true);
    setError(null);
    // El formulario escribe texto —y admite la coma—; la entidad guarda el número
    // que el puente sirve, y el comando recibe el texto decimal que valida.
    const enTexto = factor === '' ? null : factor.replace(',', '.');
    const siguiente: ProductoDeSalon = {
      ...elegido,
      destino: destino ?? elegido.destino,
      factor_apertura: enTexto === null ? null : Number(enTexto),
      unidad_cabina: unidad === '' ? null : unidad,
    };
    invocarComando(rutaDeFicha(elegido.id), {
      destino: siguiente.destino ?? 'venta',
      factorApertura: enTexto,
      unidadCabina: siguiente.unidad_cabina,
    })
      .then(() => {
        setElegido(siguiente);
        setProductos((productos ?? []).map((p) => (p.id === elegido.id ? siguiente : p)));
        setAviso('Guardado.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function abrirPieza(): void {
    if (elegido === null) return;
    const cuantas = Number(piezas);
    if (!Number.isInteger(cuantas) || cuantas <= 0) {
      setError('Cuántas piezas se abren.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly unidadesACabina: string; readonly unidadCabina: string }>(
      rutaDeAbrir(elegido.id),
      // Los almacenes NO se mandan: salen de la sesión del servidor (R16).
      { piezas: cuantas },
    )
      .then((salida) => {
        setAviso(`Entraron ${salida.unidadesACabina} ${salida.unidadCabina} a cabina.`);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function preguntarSiAlcanza(): void {
    setOcupado(true);
    setFalloDeAgenda(null);
    /**
     * SIN CONSUMO: lo calcula el servidor con la agenda de hoy.
     *
     * Antes iba `consumoEsperado: []` y el esquema exigía al menos uno: cada
     * «¿alcanza?» contestaba 400. Esta pantalla no tiene la agenda —ni tiene por
     * qué—, y el servidor sí: las citas de hoy, sus servicios y sus recetas.
     */
    invocarComando<{ readonly alcanza: boolean; readonly faltantes: readonly FaltanteDeCabina[] }>(
      RUTA_ALCANZA,
      {},
    )
      .then((salida) => {
        // Se devuelven TODOS los faltantes: quien va a comprar hace un viaje, y
        // enterarse de uno en uno son tres viajes.
        setFaltantes(salida.faltantes);
      })
      .catch((fallo: unknown) => {
        setFalloDeAgenda(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const cabecera = (
    <header className="flex flex-col gap-(--espacio-1)">
      <h1 className="text-2xl font-semibold">{voc.titulo('producto', true)}</h1>
      <p className="text-sm text-texto-sutil">
        Cabina y anaquel
        {productos === null ? null : ` · ${voc.conNumero('producto', productos.length)}`}
      </p>
    </header>
  );

  // ── ERROR · no se pudo leer la lista ──────────────────────────────────────
  if (falloDeCarga !== null) {
    return (
      <main className={MARCO}>
        {cabecera}
        <ErrorDePantalla
          titulo={`No se pudo leer la lista de ${voc.plural('producto')}`}
          queHacer="Sin la lista no se sabe qué hay en cabina ni en el anaquel, ni se puede abrir una pieza. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  // ── CARGANDO · la forma de la pantalla, no una rueda ─────────────────────
  if (productos === null) {
    return (
      <main className={MARCO}>
        {cabecera}
        <Esqueleto className="h-28 w-full rounded-lg" />
        <div className="flex flex-col gap-(--espacio-4) md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
          <EsqueletoDeLista filas={6} />
          <Esqueleto className="hidden h-80 w-full rounded-lg xl:block" />
          <Esqueleto className="hidden h-80 w-full rounded-lg md:block" />
        </div>
      </main>
    );
  }

  // ── VACÍO · que enseñe, no que se disculpe ───────────────────────────────
  if (productos.length === 0) {
    return (
      <main className={MARCO}>
        {cabecera}
        <Superficie como="section" nivel={0} relleno={0} aria-label={voc.titulo('producto', true)}>
          <Vacio
            icono={<Package />}
            titulo={`Todavía no tienes ${voc.plural('producto')}`}
            explicacion="Aquí se ve qué se usa en cabina y qué se vende en el anaquel, y se abre una pieza cuando se acaba el bote. Primero se dan de alta en el catálogo."
            accion={
              <Button asChild>
                <a href="/productos">Dar de alta {voc.plural('producto')}</a>
              </Button>
            }
          />
        </Superficie>
      </main>
    );
  }

  const filasDe = (lista: Lista): readonly ProductoDeSalon[] =>
    productos.filter((p) => vaEn(lista, p));

  const columnaDeProducto: ColumnaDeTabla<ProductoDeSalon> = {
    clave: 'producto',
    titulo: voc.titulo('producto'),
    orden: (p) => p.nombre,
    celda: (p) => (
      <span className="flex flex-col">
        <span className="font-medium">{p.nombre}</span>
        <span className="text-xs text-texto-sutil">{etiquetaDeDestino(p.destino)}</span>
      </span>
    ),
  };

  const columnasDe: Readonly<Record<Lista, readonly ColumnaDeTabla<ProductoDeSalon>[]>> = {
    cabina: [
      columnaDeProducto,
      {
        clave: 'rinde',
        titulo: 'Rinde al abrirse',
        numerica: true,
        // La fila en tono de advertencia NUNCA va sola: la celda dice por qué.
        celda: (p) =>
          p.factor_apertura === null || p.unidad_cabina === null ? (
            <span className="font-medium">Falta la ficha</span>
          ) : (
            <Cifra
              valor={p.factor_apertura}
              unidad={p.unidad_cabina}
              decimales={decimalesDe(p.factor_apertura)}
              tamano="sm"
            />
          ),
      },
    ],
    anaquel: [columnaDeProducto],
  };

  const vacioDe: Readonly<
    Record<Lista, { readonly titulo: string; readonly explicacion: string }>
  > = {
    cabina: {
      titulo: `${voc.conDeterminante('ningun', 'producto')} se usa en cabina todavía`,
      explicacion:
        'Elige uno del anaquel y márcalo «Sólo se usa» o «Las dos cosas»: desde ahí se abre una pieza y se gasta en dosis.',
    },
    anaquel: {
      titulo: `${voc.conDeterminante('ningun', 'producto')} se vende en el anaquel`,
      explicacion: 'Todos están marcados «Sólo se usa»: ninguno se vende entero.',
    },
  };

  function tablaDe({ clave: lista, enFrase }: DeLista) {
    return (
      <Tabla
        etiqueta={`${voc.titulo('producto', true)} ${enFrase}`}
        columnas={columnasDe[lista]}
        filas={filasDe(lista)}
        claveDe={(p) => p.id}
        {...(elegido === null ? {} : { activa: elegido.id })}
        alActivar={(id) => {
          const producto = filasDe(lista).find((p) => p.id === id);
          if (producto !== undefined) abrir(producto, lista);
        }}
        viajeDeFila={(p) =>
          viaje?.en === lista && viaje.id === p.id ? VIAJE.fila(p.id) : undefined
        }
        tonoDeFila={(p) =>
          (lista === 'cabina' && loQueFalta(p).length > 0) ||
          (lista === 'anaquel' && p.destino === null)
            ? 'advertencia'
            : undefined
        }
        alto="max-h-[55vh] xl:max-h-[calc(100dvh-20rem)]"
        vacio={
          <Superficie nivel={0} relleno={0}>
            <Vacio
              icono={<PackageOpen />}
              titulo={vacioDe[lista].titulo}
              explicacion={vacioDe[lista].explicacion}
              className="py-(--espacio-8)"
            />
          </Superficie>
        }
      />
    );
  }

  const faltanDeFicha = filasDe('cabina').filter((p) => loQueFalta(p).length > 0).length;
  const huecos = elegido === null ? [] : loQueFalta(elegido);

  return (
    <main className={MARCO}>
      {cabecera}

      {/* 1 · LA AGENDA, arriba de todo: es lo único que sólo este modelo contesta. */}
      <Superficie
        como="section"
        relleno={4}
        aria-label="La cabina contra la agenda"
        className="flex flex-col gap-(--espacio-3)"
      >
        <div className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
          <div className="flex flex-col gap-(--espacio-1)">
            <h2 className="text-base font-semibold">La cabina contra la agenda</h2>
            <p className="text-sm text-texto-sutil">
              Se calcula con {voc.enFrase('orden', true)} de hoy y las fórmulas de sus{' '}
              {voc.plural('linea_orden')}.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={ocupado}
            onClick={preguntarSiAlcanza}
          >
            <CalendarCheck aria-hidden="true" />
            ¿Alcanza para lo agendado?
          </Button>
        </div>

        {falloDeAgenda !== null && (
          <Aviso tono="peligro" titulo={falloDeAgenda}>
            No se sabe todavía si alcanza. Vuelve a preguntar.
          </Aviso>
        )}
        {faltantes !== null && faltantes.length === 0 && (
          <Aviso tono="exito" titulo="Alcanza para todo lo que está agendado." />
        )}
        {faltantes !== null && faltantes.length > 0 && (
          <>
            <Aviso tono="atencion" titulo="No alcanza para lo agendado">
              {faltantes.length === 1
                ? 'Falta 1 material.'
                : `Faltan ${String(faltantes.length)} materiales.`}{' '}
              Van todos juntos: quien va a comprar hace un solo viaje.
            </Aviso>
            <Tabla
              etiqueta="Materiales que no alcanzan para lo agendado"
              columnas={COLUMNAS_DE_FALTANTE}
              filas={faltantes}
              claveDe={(f) => f.insumoId}
              tonoDeFila={() => 'advertencia'}
              alto="max-h-64"
            />
          </>
        )}
      </Superficie>

      <div className="flex flex-col gap-(--espacio-4) md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
        {/* 2 y 3 · En la tableta y el teléfono, una lista a la vez; en la PC, las dos. */}
        <nav
          aria-label="Cabina o anaquel"
          className="grid grid-cols-2 gap-(--espacio-2) md:col-start-1 md:row-start-1 xl:hidden"
        >
          {LISTAS.map((lista) => (
            <Button
              key={lista.clave}
              type="button"
              size="lg"
              aria-pressed={pestana === lista.clave}
              variant={pestana === lista.clave ? 'default' : 'outline'}
              onClick={() => {
                setPestana(lista.clave);
              }}
            >
              {/* El color no puede ser el único que diga cuál está elegida. */}
              {pestana === lista.clave ? <Check aria-hidden="true" /> : null}
              {lista.etiqueta}
              <Cifra valor={filasDe(lista.clave).length} tamano="sm" />
            </Button>
          ))}
        </nav>

        {LISTAS.map((lista) => (
          <section
            key={lista.clave}
            aria-label={lista.etiqueta}
            className={`${pestana === lista.clave ? 'flex' : 'hidden xl:flex'} flex-col gap-(--espacio-2) md:col-start-1 md:row-start-2 xl:row-start-1 ${lista.clave === 'anaquel' ? 'xl:col-start-2' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-(--espacio-2)">
              <h2 className="text-sm font-semibold tracking-wide text-texto-sutil uppercase">
                {lista.etiqueta}
              </h2>
              <p className="text-xs text-texto-sutil">{lista.explicacion}</p>
            </div>
            {lista.clave === 'cabina' && faltanDeFicha > 0 && (
              <p className="text-sm font-medium">
                {faltanDeFicha === 1
                  ? `A 1 ${voc.singular('producto')} le falta la ficha: no se puede abrir.`
                  : `A ${String(faltanDeFicha)} ${voc.plural('producto')} les falta la ficha: no se pueden abrir.`}
              </p>
            )}
            {tablaDe(lista)}
          </section>
        ))}

        {/* LA FICHA · a la derecha en tableta y PC, debajo en el teléfono. */}
        <Superficie
          como="aside"
          ref={fichaRef}
          relleno={4}
          aria-label={elegido === null ? 'Ficha' : `Ficha de ${elegido.nombre}`}
          style={viaje?.en === 'ficha' ? { viewTransitionName: VIAJE.fila(viaje.id) } : undefined}
          className={`${elegido === null ? 'hidden md:flex' : 'flex'} flex-col gap-(--espacio-4) md:col-start-2 md:row-span-2 md:row-start-1 xl:sticky xl:top-(--espacio-4) xl:col-start-3 xl:row-span-1`}
        >
          {elegido === null ? (
            <Vacio
              icono={<PackageOpen />}
              titulo={`Elige ${voc.enFraseCon('un', 'producto')} para ver su destino.`}
              explicacion="Aquí se dice si se vende, si se usa en cabina o las dos cosas, y se abre una pieza cuando se acaba el bote."
              className="px-(--espacio-2) py-(--espacio-8)"
            />
          ) : (
            <>
              <h2 className="text-xl font-semibold">{elegido.nombre}</h2>

              {error !== null && (
                <Aviso tono="peligro" titulo={error}>
                  No se guardó ni se abrió nada.
                </Aviso>
              )}
              {aviso !== null && <Aviso tono="exito" titulo={aviso} />}

              <section aria-label="Destino" className="flex flex-col gap-(--espacio-2)">
                <h3 className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
                  Destino
                </h3>
                <div className="flex flex-wrap gap-(--espacio-2)">
                  {DESTINOS.map((destino) => (
                    <Button
                      key={destino.clave}
                      type="button"
                      aria-pressed={elegido.destino === destino.clave}
                      variant={elegido.destino === destino.clave ? 'default' : 'outline'}
                      onClick={() => {
                        guardarFicha(destino.clave);
                      }}
                    >
                      {elegido.destino === destino.clave ? <Check aria-hidden="true" /> : null}
                      {destino.etiqueta}
                    </Button>
                  ))}
                </div>
              </section>

              {elegido.destino !== 'venta' && (
                <>
                  <Separator />
                  <section aria-label="Ficha de cabina" className="flex flex-col gap-(--espacio-3)">
                    <h3 className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
                      Ficha de cabina
                    </h3>
                    <div className="grid grid-cols-2 gap-(--espacio-3)">
                      <div className="flex flex-col gap-(--espacio-1)">
                        <Label htmlFor="factor">Rinde al abrirse</Label>
                        <Input
                          id="factor"
                          inputMode="decimal"
                          className="h-[calc(var(--altura-control)*1.2)] text-right"
                          placeholder="1000"
                          value={factor}
                          onChange={(evento) => {
                            setFactor(evento.target.value);
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-(--espacio-1)">
                        <Label htmlFor="unidad">Se mide en</Label>
                        <Input
                          id="unidad"
                          className="h-[calc(var(--altura-control)*1.2)]"
                          placeholder="ml"
                          value={unidad}
                          onChange={(evento) => {
                            setUnidad(evento.target.value);
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-sm text-texto-sutil">
                      Si entrara «uno» en vez del rendimiento, el consumo de tres semanas daría
                      negativo al segundo servicio.
                    </p>
                    <Button
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => {
                        guardarFicha();
                      }}
                    >
                      Guardar la ficha
                    </Button>
                  </section>

                  <Separator />

                  {/* LA ACCIÓN PRINCIPAL de la pantalla: abrir producto (F-155). */}
                  <section aria-label="Abrir una pieza" className="flex flex-col gap-(--espacio-3)">
                    <h3 className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
                      Abrir una pieza
                    </h3>
                    {elegido.factor_apertura !== null && elegido.unidad_cabina !== null && (
                      <p className="text-sm text-texto-sutil">
                        Cada pieza que se abre entra a cabina como{' '}
                        <Cifra
                          valor={elegido.factor_apertura}
                          unidad={elegido.unidad_cabina}
                          decimales={decimalesDe(elegido.factor_apertura)}
                          tamano="sm"
                          className="font-semibold text-texto"
                        />
                        .
                      </p>
                    )}
                    <div className="flex items-end gap-(--espacio-3)">
                      <div className="flex w-28 flex-col gap-(--espacio-1)">
                        <Label htmlFor="piezas">Piezas</Label>
                        <Input
                          id="piezas"
                          inputMode="numeric"
                          className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                          value={piezas}
                          onChange={(evento) => {
                            setPiezas(evento.target.value);
                          }}
                        />
                      </div>
                      <Button
                        size="lg"
                        className="h-[calc(var(--altura-control)*1.4)] flex-1 text-base"
                        disabled={ocupado || huecos.length > 0}
                        onClick={abrirPieza}
                      >
                        <PackageOpen aria-hidden="true" />
                        Abrir en cabina
                      </Button>
                    </div>
                    {huecos.length > 0 && (
                      <Aviso tono="atencion" titulo={`Falta por decir: ${huecos.join(' y ')}.`} />
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </Superficie>
      </div>
    </main>
  );
}
