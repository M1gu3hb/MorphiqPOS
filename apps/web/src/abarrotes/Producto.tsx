'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  textoParaCampo,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowLeft,
  CalendarClock,
  CalendarOff,
  Check,
  Layers,
  PackageSearch,
  Plus,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe, valorDelPuente } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

import { CatalogoDeProductos } from './CatalogoDeProductos.tsx';

/**
 * PANTALLA · abarrotes · producto
 *
 * La ficha: precio, costo, presentaciones y el impuesto que le toca.
 *
 * ── Por qué el precio de la caja NO es 24 veces el de la pieza ──────────
 * Es menos, siempre, y por eso cada presentación lleva su propio precio en vez
 * de derivarse del factor. Derivarlo haría que el mayoreo no existiera: el
 * sistema cobraría el precio de menudeo multiplicado y nadie compraría la caja.
 *
 * ── Por qué el margen se enseña en PESOS y en PORCENTAJE ────────────────
 * Los dos números deciden cosas distintas. El porcentaje dice si el producto
 * vale la pena en el anaquel; los pesos dicen cuánto deja cada venta, que es lo
 * que se compara contra el esfuerzo de venderlo. Con uno solo se toman
 * decisiones a medias.
 *
 * ── Por qué el margen sigue a lo que se TECLEA ──────────────────────────
 * `04-INTERFAZ` · pantalla 8: el margen se ve mientras se escribe el precio,
 * antes de guardar, que es cuando todavía se puede corregir. La fila de cifras
 * repite además el precio YA LEÍDO por el campo: si alguien teclea «18,50» y el
 * campo entiende mil ochocientos, se ve ahí, junto a un margen absurdo.
 *
 * ── Por qué la caducidad es una PERILLA y no un campo ───────────────────
 * Lo que no caduca no tiene que aparecer en la lista de la mañana. Una lista de
 * caducidades llena de tornillos y bolsas de carbón deja de leerse a la tercera
 * mañana, y entonces no sirve para la leche, que era el punto.
 *
 * ── Por qué el IVA es una lista cerrada ─────────────────────────────────
 * Cero, 8 % de frontera y 16 %. Con un porcentaje libre alguien teclea 15 % y
 * nadie lo ve hasta la declaración.
 *
 * ── La ficha, de un vistazo ─────────────────────────────────────────────
 * Se usa en la PC, de 5 a 20 productos por semana, y su acción es GUARDAR. Lo
 * primero que se ve es el precio con su costo y su margen; a la derecha, las dos
 * perillas; abajo, las presentaciones como una tabla densa con el margen de cada
 * una contra el mismo costo. En tableta y teléfono es una sola columna, en ese
 * orden.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben la ficha, el precio, el costo, las presentaciones y el régimen fiscal.
 * Queda fuera el kardex del producto, que es su propia pantalla.
 */

const RUTA_ACTUALIZAR = '/api/catalogo/productos/actualizar';
const RUTA_PRECIO = '/api/catalogo/productos/precio';
const RUTA_PRESENTACION = '/api/catalogo/presentacion';

/** Cerrada a propósito: con un porcentaje libre alguien teclea 15 %. */
const TASAS_IVA = [
  { bp: 0, etiqueta: 'Exento' },
  { bp: 800, etiqueta: '8 % frontera' },
  { bp: 1600, etiqueta: '16 %' },
] as const;

const MARCO = 'mx-auto w-full max-w-6xl p-(--espacio-4) xl:p-(--espacio-6)';
const REJILLA = 'grid gap-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_20rem]';
const TITULO_DE_SECCION = 'text-base font-semibold';

export interface FichaDeProducto {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly codigo_barras: string | null;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad NO sirve: lo expone como
   * `precio_venta`, ya convertido por `dinero`. Llegaba `undefined` y la pantalla
   * enseñaba `$NaN`.
   */
  readonly precio_venta: number | null;
  /** EN PESOS: la entidad sirve `costo_calculado_actual`. */
  readonly costo_calculado_actual: number | null;
  readonly controla_caducidad: boolean;
  readonly tasa_iva_bp: number;
}

export interface PresentacionDeProducto {
  readonly id: string;
  readonly nombre: string;
  /** El puente lo sirve con `conversion: 'decimal'`: es un NÚMERO, no texto. */
  readonly factor: number;
  /**
   * EN PESOS: `Presentacion` sirve el precio con la conversión `dinero`. Se lee por su
   * gemelo honesto `precio_venta_pesos` —la misma columna— y no por
   * `precio_venta_centavos`, que se llama así y también llega en pesos.
   *
   * Aquí se leía `precio_centavos`, que no existe: el six de refrescos enseñaba
   * `$NaN` en su renglón con el precio puesto en la base.
   */
  readonly precio_venta_pesos: number | null;
  readonly codigo_barras: string | null;
}

/**
 * Lo que `catalogo.crear_presentacion` DEVUELVE (`ResultadoPresentacion`, en
 * `packages/app/src/abarrotes/presentaciones.ts`), que no es la fila del puente:
 * el id se llama `presentacionId`, el factor y el precio llegan como TEXTO, y el
 * precio ya en CENTAVOS. Meterlo tal cual en la tabla pintaba un renglón sin
 * nombre, a $0.00 y con la clave `undefined`.
 */
interface PresentacionCreada {
  readonly presentacionId: string;
  readonly productoId: string;
  readonly factor: string;
  readonly precioVentaCentavos: string;
  readonly precioDerivado: boolean;
}

/** Una presentación como la pinta la tabla: el precio, ya en centavos enteros. */
interface FilaDePresentacion {
  readonly id: string;
  readonly nombre: string;
  readonly factor: number;
  readonly precioCentavos: number;
  readonly codigo_barras: string | null;
}

export interface ProductoProps {
  readonly productoId: string;
  readonly fichaInicial?: FichaDeProducto;
  readonly presentacionesIniciales?: readonly PresentacionDeProducto[];
}

export interface Margen {
  /** Lo que deja cada venta, en centavos enteros: se pinta con `<Dinero>`. */
  readonly centavos: number;
  /** Sobre el precio, sin redondear: `<Cifra decimales={1}>` lo enseña. */
  readonly porcentaje: number;
}

/** Lo que se captura para una presentación nueva. El precio, ya en centavos. */
interface PresentacionNueva {
  readonly nombre: string;
  readonly factor: string;
  readonly precio: number | null;
  readonly codigo: string;
}

const PRESENTACION_EN_BLANCO: PresentacionNueva = {
  nombre: '',
  factor: '',
  precio: null,
  codigo: '',
};

/**
 * El precio y el costo de la ficha, en centavos enteros: el margen en pesos con
 * decimales sale con tres cifras que nadie puede cobrar. La unidad en que llegan la
 * decide `centavosDe` por la conversión del campo. Sin dato cuentan como cero.
 */
function precioDe(ficha: FichaDeProducto): number {
  return centavosDe('ProductoTerminado', 'precio_venta', ficha.precio_venta) ?? 0;
}

function costoDe(ficha: FichaDeProducto): number {
  return (
    centavosDe('ProductoTerminado', 'costo_calculado_actual', ficha.costo_calculado_actual) ?? 0
  );
}

/** La fila del puente, con su precio en centavos. */
function filaDelPuente(presentacion: PresentacionDeProducto): FilaDePresentacion {
  return {
    id: presentacion.id,
    nombre: presentacion.nombre,
    factor: presentacion.factor,
    precioCentavos:
      centavosDe('Presentacion', 'precio_venta_pesos', presentacion.precio_venta_pesos) ?? 0,
    codigo_barras: presentacion.codigo_barras,
  };
}

/** Cuántos decimales enseñar de un factor: la caja trae «24», y medio kilo «0.5», no «1». */
function decimalesDe(valor: number): number {
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(fraccion.length, 3);
}

/** «24», «0,5» → número. Lo que no es un factor positivo no da margen. */
function factorDe(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  const valor = Number(limpio);
  return limpio !== '' && Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * Los dos números del margen, porque deciden cosas distintas.
 *
 * El porcentaje dice si vale la pena el anaquel; los pesos, cuánto deja cada
 * venta. Devolver uno solo es tomar la decisión a medias.
 */
export function margenDe(precioCentavos: number, costoCentavos: number): Margen | null {
  if (precioCentavos <= 0) return null;
  const ganancia = precioCentavos - costoCentavos;
  return { centavos: ganancia, porcentaje: (ganancia * 100) / precioCentavos };
}

/** Una presentación contra el costo de lo que trae: la caja lleva 24 veces el de la pieza. */
function margenDePresentacion(
  presentacion: FilaDePresentacion,
  costoPorUnidad: number,
): Margen | null {
  return margenDe(presentacion.precioCentavos, Math.round(costoPorUnidad * presentacion.factor));
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Lo capturado sigue aquí.';
}

/** Un dato de la fila de cifras: su nombre arriba, en pequeño, y la cifra debajo. */
function Dato({ titulo, children }: { readonly titulo: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-(--espacio-1)">
      <dt className="text-xs font-medium tracking-wide text-texto-sutil uppercase">{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** El margen en una celda. Por debajo del costo lo DICE, además del rojo. */
function MargenEnCelda({ margen }: { readonly margen: Margen | null }) {
  if (margen === null) return <span className="text-texto-sutil">—</span>;
  const pierde = margen.centavos < 0;
  return (
    <span className={pierde ? 'font-medium text-peligro' : undefined}>
      {pierde ? 'bajo costo · ' : null}
      <Cifra valor={margen.porcentaje} unidad="%" decimales={1} tamano="sm" />
    </span>
  );
}

/** Las columnas de una presentación: las de `04-INTERFAZ`, pantalla 8. */
function columnasDePresentacion(
  costoPorUnidad: number,
): readonly ColumnaDeTabla<FilaDePresentacion>[] {
  return [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      celda: (p) => <span className="font-medium">{p.nombre}</span>,
    },
    {
      clave: 'factor',
      titulo: 'Trae',
      numerica: true,
      orden: (p) => p.factor,
      celda: (p) => <Cifra valor={p.factor} decimales={decimalesDe(p.factor)} tamano="sm" />,
    },
    {
      clave: 'codigo',
      titulo: 'Código',
      desde: 'md',
      celda: (p) => (
        <span className="font-numeros text-texto-sutil tabular-nums">{p.codigo_barras ?? '—'}</span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (p) => p.precioCentavos,
      celda: (p) => <Dinero centavos={p.precioCentavos} tamano="sm" />,
    },
    {
      clave: 'margen',
      titulo: 'Margen',
      numerica: true,
      desde: 'sm',
      celda: (p) => <MargenEnCelda margen={margenDePresentacion(p, costoPorUnidad)} />,
    },
  ];
}

/** La forma de la ficha mientras llega, no una rueda: al llegar nada salta. */
function EsqueletoDeFicha() {
  return (
    <main className={MARCO}>
      <div role="status" aria-busy="true" aria-label="Cargando la ficha" className={REJILLA}>
        <div className="flex flex-col gap-(--espacio-2) xl:col-span-2">
          <Esqueleto className="h-[calc(var(--altura-control)*0.9)] w-72 max-w-full" />
          <Esqueleto className="h-4 w-48" />
        </div>
        <Esqueleto className="h-56 w-full rounded-lg" />
        <Esqueleto className="h-56 w-full rounded-lg" />
        <Esqueleto className="h-40 w-full rounded-lg xl:col-span-2" />
      </div>
    </main>
  );
}

export function Producto({ productoId, fichaInicial, presentacionesIniciales }: ProductoProps) {
  // F-017 · Esta pantalla la heredan los dieciocho modelos de retail, y no todos
  // venden «productosº: Ferretería La Broca vende MATERIAL, y su propia carpeta
  // lo levantó como defecto —«artículo donde debe decir material»—. El sustantivo
  // sale del giro del negocio, que es la mitad de lo que hace que una plantilla
  // se sienta propia y no prestada.
  const vocabulario = useVocabulario();
  const [ficha, setFicha] = useState<FichaDeProducto | null>(fichaInicial ?? null);
  const [presentaciones, setPresentaciones] = useState<readonly FilaDePresentacion[] | null>(
    () => presentacionesIniciales?.map(filaDelPuente) ?? null,
  );
  /** En centavos, como todo el dinero; `null` mientras el campo no diga un importe. */
  const [precio, setPrecio] = useState<number | null>(null);
  const [nueva, setNueva] = useState<PresentacionNueva>(PRESENTACION_EN_BLANCO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** La ficha no se pudo leer: sin ella no hay pantalla, hay un error que lo dice. */
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  /** El id que se consultó y no existe. Guardar el id, y no un sí/no, no deja nada que limpiar. */
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null);
  /**
   * Las presentaciones no se pudieron leer. Enseñar la tabla vacía diría «no tiene»,
   * y el dueño daría de alta otra vez la caja que ya existe.
   */
  const [presentacionesSinLeer, setPresentacionesSinLeer] = useState(false);
  // Cada lectura tiene su intento: reintentar lo sube y su efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  //
  // Son DOS a propósito. Con uno solo, «Volver a leer» las presentaciones releía
  // también la ficha y le devolvía al campo el precio guardado: el que el dueño
  // acababa de teclear, sin guardar, desaparecía en silencio junto con su «Sin
  // guardar».
  const [intentoDeFicha, setIntentoDeFicha] = useState(0);
  const [intentoDePresentaciones, setIntentoDePresentaciones] = useState(0);

  // Sin id no se consulta.
  //
  // Estas pantallas se abren SIN nada seleccionado -`page.tsx` las monta con
  // la cadena vacia- y consultar con ella manda un `where id = ''` a una
  // columna uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en
  // cada apertura. El estado de «elige algo» ya esta escrito debajo; lo que
  // faltaba era no pedir datos de lo que nadie eligio.
  useEffect(() => {
    if (fichaInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const arranque = setTimeout(() => {
      if (productoId === '') return;
      consultarPuente<FichaDeProducto>('ProductoTerminado', {
        filtro: { id: productoId },
        limite: 1,
        signal: control.signal,
      })
        .then((filas) => {
          if (!sigueMontada()) return;
          const primera = filas[0];
          if (primera === undefined) {
            setNoEncontrado(productoId);
            return;
          }
          setFicha(primera);
          setPrecio(precioDe(primera));
        })
        .catch((fallo: unknown) => {
          if (!sigueMontada()) return;
          setFalloDeLectura(fallo instanceof Error ? fallo.message : 'No se pudo leer la ficha.');
        });
    });
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productoId, fichaInicial, intentoDeFicha]);

  useEffect(() => {
    if (presentacionesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const arranque = setTimeout(() => {
      if (productoId === '') return;
      consultarPuente<PresentacionDeProducto>('Presentacion', {
        filtro: { producto_id: productoId },
        limite: 40,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setPresentaciones(filas.map(filaDelPuente));
        })
        .catch(() => {
          if (!sigueMontada()) return;
          setPresentaciones([]);
          setPresentacionesSinLeer(true);
        });
    });
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productoId, presentacionesIniciales, intentoDePresentaciones]);

  /** Sólo las presentaciones: el precio tecleado y sin guardar se queda donde está. */
  function releerPresentaciones(): void {
    setPresentacionesSinLeer(false);
    if (presentacionesIniciales === undefined) setPresentaciones(null);
    setIntentoDePresentaciones((previo) => previo + 1);
  }

  /** La ficha no se leyó. Si tampoco las presentaciones, se piden con ella. */
  function reintentar(): void {
    setFalloDeLectura(null);
    setIntentoDeFicha((previo) => previo + 1);
    if (presentacionesSinLeer) releerPresentaciones();
  }

  function guardarPrecio(): void {
    const centavos = precio;
    if (centavos === null) {
      setError('Revisa el precio: sólo pesos y centavos.');
      return;
    }
    setGuardando(true);
    setError(null);
    // `importe` es una cadena en PESOS. Antes iba `precioVentaCentavos` —un número de
    // centavos que el esquema no conoce— y cada guardado contestaba 400.
    invocarComando(RUTA_PRECIO, { productoId, precioVenta: textoParaCampo(centavos) })
      .then(() => {
        // La ficha imita la fila del puente: el precio vuelve en SU unidad, pesos.
        setFicha(
          ficha === null
            ? null
            : {
                ...ficha,
                precio_venta: valorDelPuente('ProductoTerminado', 'precio_venta', centavos),
              },
        );
        setAviso('Precio guardado.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  function cambiarPerilla(cambios: Partial<FichaDeProducto>): void {
    if (ficha === null) return;
    const siguiente = { ...ficha, ...cambios };
    setFicha(siguiente);
    invocarComando(RUTA_ACTUALIZAR, { productoId, ...cambios }).catch((fallo: unknown) => {
      // Se devuelve la perilla a su sitio: dejarla movida haría creer que se
      // guardó algo que no se guardó, y la lista de la mañana no cambiaría.
      setFicha(ficha);
      setError(mensajeDe(fallo));
    });
  }

  function agregarPresentacion(): void {
    const centavos = nueva.precio;
    if (nueva.nombre.trim() === '' || centavos === null) {
      setError('La presentación necesita nombre y precio.');
      return;
    }
    setGuardando(true);
    setError(null);
    /**
     * Dos cosas que el comando NO acepta como iban:
     *
     *  · `precioCentavos` se llama `precioVentaCentavos` en `entradaCrearPresentacion`;
     *  · `codigoBarras` es `optional()` y NO `nullable()`: mandar `null` es un 400. Sin
     *    código, la clave no viaja.
     */
    const codigo = nueva.codigo.trim();
    const nombre = nueva.nombre.trim();
    invocarComando<PresentacionCreada>(RUTA_PRESENTACION, {
      productoId,
      nombre,
      factor: nueva.factor.replace(',', '.'),
      precioVentaCentavos: centavos,
      ...(codigo === '' ? {} : { codigoBarras: codigo }),
    })
      .then((creada) => {
        // El renglón se arma con lo que el comando devuelve —id, factor y precio,
        // que es el que quedó guardado— y con el nombre y el código que se mandaron.
        const fila: FilaDePresentacion = {
          id: creada.presentacionId,
          nombre,
          factor: Number(creada.factor),
          precioCentavos: Number(creada.precioVentaCentavos),
          codigo_barras: codigo === '' ? null : codigo,
        };
        setPresentaciones((previas) => [...(previas ?? []), fila]);
        setNueva(PRESENTACION_EN_BLANCO);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  const alCatalogo = (
    <Button asChild>
      <a href="/abarrotes/producto">Volver al catálogo</a>
    </Button>
  );

  // SIN PRODUCTO ELEGIDO, EL CATÁLOGO (C.10 de la 2.4).
  //
  // Antes era un vacío que decía «se llega desde el catálogo» y apuntaba a Existencias, que no
  // enlaza a ninguna ficha: con la página montando siempre el id vacío, esta ficha no se
  // abría NUNCA. Ahora la pantalla sin producto es el catálogo, y cada renglón abre su ficha
  // con `?producto=`.
  if (productoId === '' && fichaInicial === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl p-(--espacio-4) lg:p-(--espacio-6)">
        <CatalogoDeProductos />
      </main>
    );
  }

  if (ficha === null && falloDeLectura !== null) {
    return (
      <main className="mx-auto w-full max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer la ficha"
          queHacer="Sin ella no se puede poner precio ni ver el margen. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeLectura}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  if (ficha === null && noEncontrado === productoId) {
    return (
      <main className="mx-auto w-full max-w-2xl p-(--espacio-6)">
        <h1 className="sr-only">{vocabulario.titulo('producto')}</h1>
        <Vacio
          icono={<PackageSearch />}
          titulo={`${vocabulario.conDeterminante('este', 'producto')} no está en el catálogo`}
          accion={alCatalogo}
        />
      </main>
    );
  }

  if (ficha === null) return <EsqueletoDeFicha />;

  const costo = costoDe(ficha);
  const precioGuardado = precioDe(ficha);
  // El margen sigue al campo; con el campo vacío o ilegible, al precio guardado.
  const precioALaVista = precio ?? precioGuardado;
  const margen = margenDe(precioALaVista, costo);
  const sinGuardar = precio !== null && precio !== precioGuardado;
  const factorNuevo = factorDe(nueva.factor);
  const margenNuevo =
    nueva.precio === null || factorNuevo === null
      ? null
      : margenDe(nueva.precio, Math.round(costo * factorNuevo));

  const listaDePresentaciones = (() => {
    if (presentacionesSinLeer) {
      return (
        <Aviso
          tono="atencion"
          titulo="No se pudieron leer las presentaciones."
          accion={
            <Button variant="outline" size="sm" onClick={releerPresentaciones}>
              Volver a leer
            </Button>
          }
        >
          Las que ya existen no aparecen aquí: vuelve a leerlas antes de agregar otra.
        </Aviso>
      );
    }
    if (presentaciones === null) return <EsqueletoDeLista filas={3} />;
    return (
      <Tabla
        etiqueta="Presentaciones"
        columnas={columnasDePresentacion(costo)}
        filas={presentaciones}
        claveDe={(p) => p.id}
        // La presentación que se vende por debajo de su costo: el renglón se tiñe y
        // la celda de margen lo dice con palabras.
        tonoDeFila={(p) =>
          (margenDePresentacion(p, costo)?.centavos ?? 0) < 0 ? 'peligro' : undefined
        }
        vacio={
          <Vacio
            icono={<Layers />}
            titulo="Todavía no hay presentaciones"
            explicacion="Agrega la primera aquí abajo: su nombre, cuántas trae y su precio."
            className="py-(--espacio-6)"
          />
        }
      />
    );
  })();

  return (
    <main className={`${MARCO} ${REJILLA}`}>
      <header className="flex flex-col gap-(--espacio-1) xl:col-span-2">
        <a
          href="/abarrotes/producto"
          className="inline-flex w-fit items-center gap-(--espacio-1) text-sm text-texto-sutil underline-offset-2 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Catálogo
        </a>
        <h1 className="text-2xl font-semibold">{ficha.nombre}</h1>
        <p className="text-sm text-texto-sutil">
          {vocabulario.conArticulo('producto')} ·{' '}
          <span className="font-numeros tabular-nums">
            {ficha.codigo_barras ?? ficha.sku ?? 'Sin código'}
          </span>
        </p>
      </header>

      {error !== null && (
        <Aviso tono="peligro" titulo={error} className="xl:col-span-2">
          No se guardó ningún cambio.
        </Aviso>
      )}

      {/* PRIMARIO · el precio, lo que cuesta y lo que deja. Lo primero que se ve. */}
      <Superficie
        como="section"
        aria-labelledby="precio-y-margen"
        className="flex flex-col gap-(--espacio-4)"
      >
        <h2 id="precio-y-margen" className={TITULO_DE_SECCION}>
          Precio y margen
        </h2>
        {/* Un formulario de verdad: Enter guarda, que es la acción de esta pantalla. */}
        <form
          className="flex flex-wrap items-end gap-(--espacio-3)"
          onSubmit={(evento) => {
            evento.preventDefault();
            guardarPrecio();
          }}
        >
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="precio">Precio de venta</Label>
            <CampoDeDinero
              id="precio"
              tamano="grande"
              centavos={precio}
              alCambiar={(centavos) => {
                setPrecio(centavos);
                setAviso(null);
              }}
              className="w-48"
            />
          </div>
          <Button type="submit" size="lg" disabled={guardando}>
            Guardar
          </Button>
          {aviso !== null && (
            <p role="status" className="flex items-center gap-(--espacio-1) text-sm">
              <Check aria-hidden="true" className="size-4 text-exito" />
              {aviso}
            </p>
          )}
          {sinGuardar && aviso === null && <p className="text-sm text-texto-sutil">Sin guardar</p>}
        </form>

        <dl className="grid grid-cols-2 gap-(--espacio-4) border-t border-borde pt-(--espacio-4) sm:grid-cols-4">
          <Dato titulo="Precio">
            <Dinero centavos={precioALaVista} tamano="lg" />
          </Dato>
          <Dato titulo="Costo promedio">
            <Dinero centavos={costo} tamano="lg" />
          </Dato>
          <Dato titulo="Deja">
            {margen === null ? (
              <span className="text-texto-sutil">—</span>
            ) : (
              <Dinero centavos={margen.centavos} tamano="lg" />
            )}
          </Dato>
          <Dato titulo="Margen">
            {margen === null ? (
              <span className="text-texto-sutil">—</span>
            ) : (
              <Cifra valor={margen.porcentaje} unidad="%" decimales={1} tamano="lg" />
            )}
          </Dato>
        </dl>
        {margen === null && (
          <p className="text-sm text-texto-sutil">Sin precio no hay margen que calcular.</p>
        )}
        {margen !== null && margen.centavos < 0 && (
          <p className="text-sm font-medium text-peligro">
            Con este precio se vende por debajo del costo.
          </p>
        )}
      </Superficie>

      {/* SECUNDARIO · las dos perillas. Al lado en PC; debajo, en pareja, en tableta. */}
      <div className="grid gap-(--espacio-4) md:grid-cols-2 xl:grid-cols-1 xl:content-start">
        <Superficie
          como="section"
          aria-labelledby="impuesto"
          className="flex flex-col gap-(--espacio-3)"
        >
          <h2 id="impuesto" className={TITULO_DE_SECCION}>
            Impuesto
          </h2>
          <div
            role="group"
            aria-labelledby="impuesto"
            className="grid grid-cols-3 gap-(--espacio-2)"
          >
            {TASAS_IVA.map((tasa) => {
              const elegida = ficha.tasa_iva_bp === tasa.bp;
              return (
                <Button
                  key={tasa.bp}
                  type="button"
                  aria-pressed={elegida}
                  variant={elegida ? 'default' : 'outline'}
                  onClick={() => {
                    cambiarPerilla({ tasa_iva_bp: tasa.bp });
                  }}
                >
                  {/* El color no puede ser el único que diga cuál está elegida. */}
                  {elegida ? <Check aria-hidden="true" /> : null}
                  {tasa.etiqueta}
                </Button>
              );
            })}
          </div>
        </Superficie>

        <Superficie
          como="section"
          aria-labelledby="caducidad"
          className="flex flex-col gap-(--espacio-3)"
        >
          <h2 id="caducidad" className={TITULO_DE_SECCION}>
            Caducidad
          </h2>
          <p className="text-sm text-texto-sutil">
            Enciéndela sólo en lo que de verdad caduca: una lista llena de lo que no se lee.
          </p>
          <Button
            type="button"
            size="lg"
            variant={ficha.controla_caducidad ? 'default' : 'outline'}
            onClick={() => {
              cambiarPerilla({ controla_caducidad: !ficha.controla_caducidad });
            }}
          >
            {ficha.controla_caducidad ? (
              <CalendarClock aria-hidden="true" />
            ) : (
              <CalendarOff aria-hidden="true" />
            )}
            {ficha.controla_caducidad ? 'Lleva caducidad' : 'No caduca'}
          </Button>
        </Superficie>
      </div>

      {/* TERCIARIO · las presentaciones: una tabla densa, cada una con su margen. */}
      <Superficie
        como="section"
        aria-labelledby="presentaciones"
        className="flex flex-col gap-(--espacio-4) xl:col-span-2"
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="presentaciones" className={TITULO_DE_SECCION}>
            Presentaciones
          </h2>
          <p className="text-sm text-texto-sutil">
            Cada una con su precio: el de la caja no es el de la pieza multiplicado.
          </p>
        </div>

        {listaDePresentaciones}

        <div className="grid grid-cols-2 gap-(--espacio-3) border-t border-borde pt-(--espacio-4) md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="pres-nombre">Nombre</Label>
            <Input
              id="pres-nombre"
              placeholder="caja de 24"
              value={nueva.nombre}
              onChange={(evento) => {
                setNueva({ ...nueva, nombre: evento.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="pres-factor">Trae</Label>
            <Input
              id="pres-factor"
              inputMode="decimal"
              className="text-right font-numeros tabular-nums"
              value={nueva.factor}
              onChange={(evento) => {
                setNueva({ ...nueva, factor: evento.target.value });
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="pres-precio">Precio</Label>
            <CampoDeDinero
              id="pres-precio"
              centavos={nueva.precio}
              alCambiar={(centavos) => {
                setNueva({ ...nueva, precio: centavos });
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="pres-codigo">Código</Label>
            <Input
              id="pres-codigo"
              className="font-numeros tabular-nums"
              value={nueva.codigo}
              onChange={(evento) => {
                setNueva({ ...nueva, codigo: evento.target.value });
              }}
            />
          </div>
          <Button
            variant="outline"
            className="col-span-2 md:col-span-1"
            disabled={guardando}
            onClick={agregarPresentacion}
          >
            <Plus aria-hidden="true" />
            Agregar presentación
          </Button>
        </div>
        {margenNuevo !== null && (
          <p className="text-sm text-texto-sutil">
            Esa presentación deja <Dinero centavos={margenNuevo.centavos} tamano="sm" /> ·{' '}
            <MargenEnCelda margen={margenNuevo} />
          </p>
        )}
      </Superficie>
    </main>
  );
}
