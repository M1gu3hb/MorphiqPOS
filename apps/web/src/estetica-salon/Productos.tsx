'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
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
import { Check, Package, PackageOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';
import { KardexDelProducto } from '~/abarrotes/KardexDelProducto';

import { LaCabinaContraLaAgenda } from './LaCabinaContraLaAgenda.tsx';
import { sinServicios } from './productos-del-salon.ts';

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
 * ── Lo que se lee de cada producto (C.10 de la 2.4) ─────────────────────
 * Cuánto hay en el anaquel, en piezas, y cuánto abierto en la cabina, en su unidad
 * (`cabina.existencias`): el puente las suma y un tinte en piezas más gramos no es
 * ni una cosa ni la otra. El precio del anaquel, y el kardex del producto en su
 * ficha, con la apertura a cabina y el consumo de cada servicio.
 *
 * «¿Alcanza?» (`LaCabinaContraLaAgenda`) trae ya el nombre y la unidad de cada
 * material, cuántos servicios de hoy lo piden y para cuántos alcanza, como dibuja el
 * §4.3.9. La compra es del tronco: aquí se decide QUÉ comprar, no se compra.
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
  /** El insumo en que se abre el producto (`insumo_base_id`), y su nombre. */
  readonly ingrediente_base_id?: string | null;
  readonly ingrediente_base_nombre?: string | null;
  /** EN PESOS, como lo sirve el puente: el precio del anaquel. */
  readonly precio_venta?: number | null;
  /**
   * Sólo la tienen los SERVICIOS (vive en `servicios`, que cuelga del producto). Aquí
   * sirve para no listarlos: el corte y el tinte no están en el anaquel ni se abren en
   * cabina, y salían como «Sólo se vende» con su «—» de existencia.
   */
  readonly duracion_activa_1_min?: number | null;
}

/** Cuánto hay de cada producto EN CADA LUGAR (`cabina.existencias`). */
export interface ExistenciaDelSalon {
  readonly productoId: string;
  readonly insumoId: string;
  readonly enAnaquel: string;
  readonly enCabina: string | null;
  readonly unidadCabina: string | null;
}

/** Un comando que falló en la ficha, y lo que NO pasó por eso: de ESE intento, no de todos. */
interface FalloDeLaFicha {
  readonly titulo: string;
  readonly queNoPaso: string;
}

const NO_SE_GUARDO = 'No se guardó: la ficha sigue como estaba.';
const NO_SE_ABRIO = 'No se abrió ninguna pieza.';

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

/**
 * El nombre de la fila para un lector de pantalla: qué abre, y lo que dicen sus
 * celdas —el destino y, en cabina, cuánto rinde o que le falta la ficha—, porque
 * con nombre propio la fila ya no se lee celda por celda al enfocarla.
 */
function etiquetaDeFilaDe(lista: Lista, producto: ProductoDeSalon): string {
  const base = `Abrir la ficha de ${producto.nombre}, ${etiquetaDeDestino(producto.destino)}`;
  if (lista !== 'cabina') return base;
  if (producto.factor_apertura === null || producto.unidad_cabina === null) {
    return `${base}, falta la ficha`;
  }
  return `${base}, rinde ${String(producto.factor_apertura)} ${producto.unidad_cabina}`;
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

/** El material del insumo, tomado del primer producto de la lista que se abre en él. */
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
  const [error, setError] = useState<FalloDeLaFicha | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pestana, setPestana] = useState<Lista>('cabina');
  const [viaje, setViaje] = useState<Viaje | null>(null);
  const fichaRef = useRef<HTMLElement>(null);
  /** Anaquel y cabina por separado; nulo mientras se lee o si no se pudo. */
  const [existencias, setExistencias] = useState<ReadonlyMap<string, ExistenciaDelSalon> | null>(
    null,
  );
  /** La existencia que no se pudo leer. Ayuda a decidir: se DICE, no se calla. */
  const [falloDeExistencias, setFalloDeExistencias] = useState<string | null>(null);

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
      // La existencia AYUDA a decidir; sin ella la lista y la ficha siguen sirviendo.
      invocarComando<{ readonly existencias: readonly ExistenciaDelSalon[] }>(
        '/api/inventario/cabina/existencias',
        {},
        { signal: control.signal },
      )
        .then((salida) => {
          if (!sigueMontada()) return;
          setExistencias(new Map(salida.existencias.map((e) => [e.productoId, e])));
          setFalloDeExistencias(null);
        })
        // Antes se tragaba: la lista pintaba «—» en todo y nadie sabía por qué.
        .catch((fallo: unknown) => {
          if (sigueMontada())
            setFalloDeExistencias(
              fallo instanceof ErrorApi ? fallo.message : 'No se pudo leer cuánto hay.',
            );
        });
      consultarPuente<ProductoDeSalon>('ProductoTerminado', {
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setProductos(sinServicios(filas));
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
    // El éxito de la operación anterior se va ANTES de validar: si no, «Entraron
    // 1000 ml a cabina.» convivía con el fallo de este intento y la pantalla decía
    // a la vez que se abrió y que no.
    setAviso(null);
    if (factor !== '' && !CANTIDAD_CON_FORMA.test(factor)) {
      setError({
        titulo: 'El rendimiento va con hasta cuatro decimales.',
        queNoPaso: NO_SE_GUARDO,
      });
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
        setError({ titulo: mensajeDe(fallo), queNoPaso: NO_SE_GUARDO });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function abrirPieza(): void {
    if (elegido === null) return;
    // Igual que al guardar: el aviso de la pieza anterior no sobrevive a este intento.
    setAviso(null);
    const cuantas = Number(piezas);
    if (!Number.isInteger(cuantas) || cuantas <= 0) {
      setError({ titulo: 'Cuántas piezas se abren.', queNoPaso: NO_SE_ABRIO });
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
        setError({ titulo: mensajeDe(fallo), queNoPaso: NO_SE_ABRIO });
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

  const existenciaDe = (p: ProductoDeSalon) => existencias?.get(p.id);

  const columnasDe: Readonly<Record<Lista, readonly ColumnaDeTabla<ProductoDeSalon>[]>> = {
    cabina: [
      columnaDeProducto,
      {
        clave: 'en-cabina',
        titulo: 'Hay abierto',
        numerica: true,
        celda: (p) => {
          const hay = existenciaDe(p);
          return hay?.enCabina == null ? (
            <span className="text-texto-sutil">—</span>
          ) : (
            <Cifra
              valor={Number(hay.enCabina)}
              unidad={hay.unidadCabina ?? undefined}
              decimales={decimalesDe(hay.enCabina)}
              tamano="sm"
            />
          );
        },
      },
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
    anaquel: [
      columnaDeProducto,
      {
        clave: 'en-anaquel',
        titulo: 'Hay',
        numerica: true,
        celda: (p) => {
          const hay = existenciaDe(p);
          return hay === undefined ? (
            <span className="text-texto-sutil">—</span>
          ) : (
            <Cifra valor={Number(hay.enAnaquel)} unidad="pz" tamano="sm" />
          );
        },
      },
      {
        clave: 'precio',
        titulo: 'Precio',
        numerica: true,
        desde: 'sm',
        celda: (p) => {
          const precio = centavosDe('ProductoTerminado', 'precio_venta', p.precio_venta);
          return precio === null ? (
            <span className="text-texto-sutil">—</span>
          ) : (
            <Dinero centavos={precio} tamano="sm" />
          );
        },
      },
    ],
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
        // La fila es un control: su nombre dice qué abre. Cuál está abierta lo dice la
        // tabla con `aria-current`.
        etiquetaDeFila={(p) => etiquetaDeFilaDe(lista, p)}
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

      {falloDeExistencias !== null && (
        <Aviso tono="atencion" titulo="No se pudo leer cuánto hay de cada producto">
          La lista y la ficha sirven igual; lo que no se sabe es la existencia. {falloDeExistencias}
        </Aviso>
      )}

      {/* 1 · LA AGENDA, arriba de todo: es lo único que sólo este modelo contesta. */}
      <LaCabinaContraLaAgenda />

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
                <Aviso tono="peligro" titulo={error.titulo}>
                  {error.queNoPaso}
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

              {/* Sus movimientos, del anaquel a la cabina y de la cabina al servicio. */}
              <KardexDelProducto
                insumoId={existenciaDe(elegido)?.insumoId ?? elegido.ingrediente_base_id ?? null}
              />
            </>
          )}
        </Superficie>
      </div>
    </main>
  );
}
