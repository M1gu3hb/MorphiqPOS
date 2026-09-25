'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
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
  VIAJE,
  Vacio,
  conTransicion,
  textoParaCampo,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Ban, Check, Coffee, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe, valorDelPuente } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

import { gruposPorProducto, ivaEnPalabras, type OpcionDeBebida } from './productos-de-barra.ts';

/**
 * PANTALLA · cafeteria · productos
 *
 * El catálogo de la barra: qué se vende, a cuánto y en qué canal.
 *
 * ── Por qué el precio de plataforma va AQUÍ y no en la plataforma ───────
 * Porque hoy se vende al precio de barra y la comisión se come el 29 % del
 * margen sin que nadie lo vea. Tener el precio por canal en la ficha convierte
 * una pérdida invisible en una decisión: se ve el margen de cada canal al lado
 * del otro, y quien decide puede decidir.
 *
 * ── Por qué la comisión se resta del PRECIO y no del margen ─────────────
 * La plataforma cobra sobre lo que el cliente paga, no sobre lo que el negocio
 * gana. Calcularla sobre el margen da un número más bonito y equivocado, y es
 * el error que hace que el dueño crea que le va bien en la aplicación.
 *
 * ── Por qué el disponible es una perilla y no una existencia ────────────
 * «Hoy no hay» es una decisión de la barra a las once de la mañana: se acabó la
 * leche de avena. Atarlo a la existencia obligaría a que el inventario de la
 * barra estuviera al día al minuto, que no lo está nunca.
 *
 * ── Por qué una tabla densa y no la rejilla de tarjetas ─────────────────
 * `04-INTERFAZ` pide tarjetas con imagen, precio, costo, margen y familia. El
 * puente no sirve imagen, y cada producto lleva además su perilla: una tarjeta
 * que se toca para abrir la ficha y que dentro tiene otro botón es un botón
 * dentro de un botón. Es una pantalla de fondo, de la tarde y en la PC, y su
 * pregunta es comparar —¿cuál deja menos en la plataforma?—: precio, costo y lo
 * que deja cada canal van en columnas que se leen de arriba abajo, y la perilla
 * vive en su celda sin abrir la fila.
 *
 * ── La fila se convierte en la ficha ────────────────────────────────────
 * Tocar un renglón lo hace VIAJAR hasta la ficha (`VIAJE.fila`): con cincuenta
 * renglones, el movimiento dice cuál se abrió sin tener que leer el título. En
 * la PC la ficha es la columna derecha; en tableta y teléfono sube desde abajo
 * con su botón de cerrar, porque apilada bajo la lista no se vería nunca.
 *
 * ── Los dos campos que la cafetería tiene y el restaurante no (C.10 de la 2.4)
 * Los GRUPOS DE OPCIONES asignados —lo que decide si al tocar la bebida se abre el
 * diálogo de opciones— salen de `Modificador` (la vista de las opciones de cada
 * bebida, con su grupo), y la TASA DE IMPUESTO de `tasa_iva_bp`: el grano en bolsa
 * va al 0 % y la bebida al 16 %. Las recetas son su pantalla (`Recetas`) y el alta
 * de un producto nuevo es la del catálogo del tronco, a la que lleva «Dar de alta».
 */

const RUTA_PRECIO = '/api/catalogo/productos/precio';
// La perilla de «hoy no hay» escribe por el PUENTE y no por
// `catalogo.actualizar_producto`, que no acepta ese campo. Ver `cambiarDisponible`.
const RUTA_ESCRIBIR = '/api/datos/escribir';

/** Siete cifras de pesos: lo más que la ficha acepta como precio. */
const PRECIO_MAXIMO_CENTAVOS = 999_999_999;

/**
 * Desde aquí la ficha es la columna derecha (`xl:`); por debajo es una hoja que sube
 * desde abajo y TAPA la lista. Es el `xl` de Tailwind 4: 80rem.
 */
const ANCHO_DE_COLUMNA = '(min-width: 80rem)';
/** Lo más que mide la hoja: su `max-h`, y el `pb` que deja la lista por encima. */
const ALTO_DE_LA_HOJA = '70dvh';

function esHoja(): boolean {
  return !window.matchMedia(ANCHO_DE_COLUMNA).matches;
}

/** Lo que cobran las plataformas de reparto, en puntos base. */
const CANALES = [
  { clave: 'barra', etiqueta: 'Barra', comisionBp: 0 },
  { clave: 'plataforma', etiqueta: 'Plataforma', comisionBp: 2_800 },
] as const;

type Canal = (typeof CANALES)[number]['clave'];

/**
 * El producto como lo sirve el PUENTE, y por qué los nombres son ésos.
 *
 * Aquí se leían `precio_venta_centavos` y `costo_unitario_centavos`, que **el
 * puente no sirve**: la entidad `ProductoTerminado` los expone como `precio_venta`
 * y `costo_unitario`, ya convertidos a PESOS por la conversión `dinero`. Los dos
 * campos llegaban `undefined`, la pantalla los dividía entre 100 y el catálogo
 * entero de una cafetería enseñaba **`$NaN`** en cada renglón. La suite la daba por
 * probada porque el HTML respondía 200.
 *
 * Se leen en pesos y se convierten a centavos en un solo sitio —`precioDe` y
 * `costoDe`, por `centavosDe`— porque la aritmética del margen es entera: con pesos
 * decimales, la comisión del 29 % de una plataforma sale con tres decimales que
 * nadie puede cobrar.
 */
export interface ProductoDeBarra {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  /** EN PESOS, como lo sirve el puente. */
  readonly precio_venta: number | null;
  /** EN PESOS: la entidad sirve `costo_calculado_actual`, el promedio ponderado. */
  readonly costo_calculado_actual: number | null;
  /**
   * `visible_en_pos`, que es como se llama en el puente.
   *
   * La perilla de «hoy no hay» leía `disponible` y no llegaba nunca: todo el
   * catálogo salía agotado en el menú y en la pantalla de productos. No se declara
   * un segundo nombre en el mapa a propósito —dos nombres para la misma columna
   * dejarían a quien escribe eligiendo cuál gana—, así que la pantalla usa el suyo.
   */
  readonly visible_en_pos: boolean;
  /** La tasa de IVA en puntos base: 1600 la bebida, 0 el grano en bolsa. */
  readonly tasa_iva_bp?: number | null;
}

/**
 * El precio y el costo del puente, en centavos.
 *
 * Los dos llegan en pesos, y `centavosDe` los convierte según la unidad del campo en
 * el mapa, contando dígitos: `12.34 * 100` en coma flotante da `1233.9999999999998`.
 * Sin dato cuenta cero, como contaba antes.
 */
function precioDe(producto: ProductoDeBarra): number {
  return centavosDe('ProductoTerminado', 'precio_venta', producto.precio_venta) ?? 0;
}

function costoDe(producto: ProductoDeBarra): number {
  return (
    centavosDe('ProductoTerminado', 'costo_calculado_actual', producto.costo_calculado_actual) ?? 0
  );
}

export interface ProductosProps {
  readonly productosIniciales?: readonly ProductoDeBarra[];
}

export interface MargenDeCanal {
  readonly netoCentavos: number;
  readonly margenCentavos: number;
  readonly margenBp: number;
}

/**
 * Lo que de verdad queda por canal.
 *
 * La comisión se resta del PRECIO y no del margen: la plataforma cobra sobre lo
 * que el cliente paga. Restarla del margen da un número más bonito y equivocado,
 * y es el que hace creer que en la aplicación va bien.
 */
export function margenDelCanal(
  precioCentavos: number,
  costoCentavos: number,
  comisionBp: number,
): MargenDeCanal {
  const comision = Math.round((precioCentavos * comisionBp) / 10_000);
  const neto = precioCentavos - comision;
  const margen = neto - costoCentavos;
  return {
    netoCentavos: neto,
    margenCentavos: margen,
    margenBp: neto <= 0 ? 0 : Math.round((margen * 10_000) / neto),
  };
}

function margenDe(producto: ProductoDeBarra, comisionBp: number): MargenDeCanal {
  return margenDelCanal(precioDe(producto), costoDe(producto), comisionBp);
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Vuelve a intentarlo.';
}

/**
 * Las columnas del catálogo. Lo que deja cada canal va en su propia columna y
 * al lado de la otra: es la comparación que esta pantalla existe para hacer.
 */
function columnasDelCatalogo(
  tituloDeProducto: string,
  alCambiarDisponible: (producto: ProductoDeBarra) => void,
  gruposDe: (productoId: string) => readonly string[],
): readonly ColumnaDeTabla<ProductoDeBarra>[] {
  const porCanal = CANALES.map((canal): ColumnaDeTabla<ProductoDeBarra> => ({
    clave: `deja-${canal.clave}`,
    titulo: `Deja en ${canal.etiqueta.toLowerCase()}`,
    numerica: true,
    desde: 'lg',
    orden: (p) => margenDe(p, canal.comisionBp).margenCentavos,
    celda: (p) => {
      const margen = margenDe(p, canal.comisionBp);
      return (
        <span className="flex flex-col items-end">
          <Dinero centavos={margen.margenCentavos} tamano="sm" />
          <Cifra
            valor={margen.margenBp / 100}
            decimales={1}
            unidad="%"
            tamano="xs"
            className="text-texto-sutil"
          />
        </span>
      );
    },
  }));

  return [
    {
      clave: 'producto',
      titulo: tituloDeProducto,
      orden: (p) => p.nombre,
      celda: (p) => (
        <span className="flex flex-col">
          <span className="font-medium">{p.nombre}</span>
          <span className="text-xs text-texto-sutil">
            <span className="capitalize">{p.familia}</span>
            {ivaEnPalabras(p.tasa_iva_bp) === null
              ? null
              : ` · ${ivaEnPalabras(p.tasa_iva_bp) ?? ''}`}
          </span>
        </span>
      ),
    },
    {
      clave: 'opciones',
      titulo: 'Opciones',
      desde: 'lg',
      celda: (p) => {
        const grupos = gruposDe(p.id);
        return grupos.length === 0 ? (
          <span className="text-texto-sutil">sin opciones</span>
        ) : (
          <span>{grupos.join(' · ')}</span>
        );
      },
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (p) => precioDe(p),
      celda: (p) => <Dinero centavos={precioDe(p)} tamano="sm" />,
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      desde: 'md',
      orden: (p) => costoDe(p),
      celda: (p) => <Dinero centavos={costoDe(p)} tamano="sm" />,
    },
    ...porCanal,
    {
      clave: 'hoy',
      titulo: 'Hoy',
      // La palabra y el icono, no sólo el relleno: el color solo no dice cuál es.
      celda: (p) => (
        <Button
          size="sm"
          variant={p.visible_en_pos ? 'outline' : 'default'}
          onClick={() => {
            alCambiarDisponible(p);
          }}
        >
          {p.visible_en_pos ? <Check aria-hidden="true" /> : <Ban aria-hidden="true" />}
          {p.visible_en_pos ? 'Hay' : 'Hoy no hay'}
        </Button>
      ),
    },
  ];
}

interface FichaDelProductoProps {
  readonly producto: ProductoDeBarra;
  /** Los grupos de opciones que se abren al tocarla en el cobro. */
  readonly grupos: readonly string[];
  readonly canal: Canal;
  readonly alElegirCanal: (canal: Canal) => void;
  readonly precioCentavos: number | null;
  readonly alCambiarPrecio: (centavos: number | null) => void;
  readonly ocupado: boolean;
  readonly alGuardar: () => void;
  readonly alCerrar: () => void;
}

/**
 * LA FICHA · el renglón convertido en panel. Lleva el MISMO nombre de viaje que
 * tuvo su fila, y por eso el navegador los une.
 */
function FichaDelProducto({
  producto,
  grupos,
  canal,
  alElegirCanal,
  precioCentavos,
  alCambiarPrecio,
  ocupado,
  alGuardar,
  alCerrar,
}: FichaDelProductoProps) {
  const costo = costoDe(producto);
  const titulo = useRef<HTMLHeadingElement>(null);

  /**
   * POR DEBAJO DE `xl` EL FOCO ENTRA EN LA HOJA.
   *
   * La hoja tapa el 70 % de abajo: con el foco en la fila que la abrió, quien usa
   * teclado seguía recorriendo filas y botones «Hoy» escondidos bajo ella. En la PC
   * la ficha es la columna de al lado, se ve, y el foco se queda en la lista.
   */
  useEffect(() => {
    if (esHoja()) titulo.current?.focus();
  }, [producto.id]);

  return (
    <Superficie
      como="aside"
      nivel={3}
      relleno={4}
      aria-label={`Margen de ${producto.nombre}`}
      style={{ viewTransitionName: VIAJE.fila(producto.id) }}
      // Escape cierra la HOJA, como cierra un diálogo. En la PC no hay botón de
      // cerrar, y un Escape tecleado en el precio no debe tirar la ficha.
      onKeyDown={(evento: KeyboardEvent<HTMLElement>) => {
        if (evento.key !== 'Escape' || !esHoja()) return;
        evento.preventDefault();
        alCerrar();
      }}
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[70dvh] flex-col gap-(--espacio-4) overflow-y-auto rounded-b-none xl:static xl:col-start-2 xl:max-h-none xl:rounded-b-lg xl:shadow-1"
    >
      <header className="flex items-start justify-between gap-(--espacio-3)">
        <div className="min-w-0">
          <h2
            ref={titulo}
            tabIndex={-1}
            className="text-xl font-semibold focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none"
          >
            {producto.nombre}
          </h2>
          <p className="text-sm text-texto-sutil">
            <span className="capitalize">{producto.familia}</span>
            {ivaEnPalabras(producto.tasa_iva_bp) === null
              ? null
              : ` · ${ivaEnPalabras(producto.tasa_iva_bp) ?? ''}`}
          </p>
          <p className="text-sm">
            {grupos.length === 0
              ? 'Sin opciones: se cobra al tocarla.'
              : `Al tocarla pregunta: ${grupos.join(', ')}.`}
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Cerrar"
          className="xl:hidden"
          onClick={alCerrar}
        >
          <X />
        </Button>
      </header>

      <div role="group" aria-label="Canal" className="grid grid-cols-2 gap-(--espacio-2)">
        {CANALES.map((opcion) => (
          <Button
            key={opcion.clave}
            type="button"
            aria-pressed={canal === opcion.clave}
            variant={canal === opcion.clave ? 'default' : 'outline'}
            onClick={() => {
              alElegirCanal(opcion.clave);
            }}
          >
            {/* El color no puede ser el único que diga cuál está elegido. */}
            {canal === opcion.clave ? <Check aria-hidden="true" /> : null}
            {opcion.etiqueta}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="precio">Precio</Label>
        <div className="flex gap-(--espacio-2)">
          {/* Una por producto: al cambiar de ficha el campo arranca con SU precio. */}
          <CampoDeDinero
            key={producto.id}
            id="precio"
            tamano="grande"
            centavos={precioCentavos}
            alCambiar={alCambiarPrecio}
            className="flex-1"
          />
          <Button
            className="h-[calc(var(--altura-control)*1.4)]"
            disabled={ocupado}
            cargando={ocupado}
            onClick={alGuardar}
          >
            Guardar
          </Button>
        </div>
      </div>

      {/* Los dos canales lado a lado, con la misma resta: entra, cuesta, deja. */}
      <div className="grid grid-cols-2 gap-(--espacio-2)">
        {CANALES.map((opcion) => {
          const margen = margenDe(producto, opcion.comisionBp);
          return (
            <Superficie
              key={opcion.clave}
              nivel={0}
              radio="md"
              relleno={3}
              activa={canal === opcion.clave}
              className="flex flex-col gap-(--espacio-2)"
            >
              <p className="flex flex-col">
                <span className="text-xs font-semibold tracking-wide uppercase">
                  {opcion.etiqueta}
                </span>
                <span className="text-xs text-texto-sutil">
                  {opcion.comisionBp === 0 ? (
                    'sin comisión'
                  ) : (
                    <>
                      comisión <Cifra valor={opcion.comisionBp / 100} unidad="%" tamano="xs" />
                    </>
                  )}
                </span>
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-(--espacio-2) gap-y-(--espacio-1) text-sm">
                <dt className="text-texto-sutil">Entra</dt>
                <dd className="text-right">
                  <Dinero centavos={margen.netoCentavos} tamano="sm" />
                </dd>
                <dt className="text-texto-sutil">Cuesta</dt>
                <dd className="text-right">
                  <Dinero centavos={costo} tamano="sm" />
                </dd>
              </dl>
              <p className="flex flex-col items-end border-t border-borde pt-(--espacio-2)">
                <span className="self-start text-xs text-texto-sutil">Deja</span>
                <Dinero centavos={margen.margenCentavos} tamano="lg" />
                <Cifra
                  valor={margen.margenBp / 100}
                  decimales={1}
                  unidad="%"
                  tamano="sm"
                  className="text-texto-sutil"
                />
              </p>
            </Superficie>
          );
        })}
      </div>

      <p className="text-xs text-texto-sutil">
        La comisión se calcula sobre el precio, no sobre el margen: es lo que de verdad cobra la
        plataforma.
      </p>
    </Superficie>
  );
}

export function Productos({ productosIniciales }: ProductosProps) {
  const voc = useVocabulario();
  const [grupos, setGrupos] = useState<ReadonlyMap<string, readonly string[]>>(new Map());
  const [productos, setProductos] = useState<readonly ProductoDeBarra[] | null>(
    productosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: el botón de reintentar lo sube, y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState<ProductoDeBarra | null>(null);
  /** La fila que está viajando a la ficha: sólo ella lleva el nombre del viaje. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [canal, setCanal] = useState<Canal>('barra');
  const [precioCentavos, setPrecioCentavos] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** La lista, para devolverle el foco a la fila de la ficha que se cierra. */
  const lista = useRef<HTMLElement>(null);
  const hayFicha = elegido !== null;

  /**
   * CON LA HOJA ABIERTA, LO ENFOCADO NO QUEDA DEBAJO DE ELLA.
   *
   * La hoja es `fixed` y tapa el 70 % de abajo: una fila que recibía el foco con el
   * tabulador se desplazaba «a la vista», pero a la vista quedaba bajo la hoja. El
   * `scroll-padding` del documento le dice al navegador que esa franja no cuenta
   * como vista (la técnica C43 de las WCAG). Sólo por debajo de `xl`, que es donde la
   * ficha es hoja, y se devuelve el valor que había al cerrarla.
   */
  useEffect(() => {
    if (!hayFicha) return;
    const raiz = document.documentElement;
    const previo = raiz.style.scrollPaddingBottom;
    const columna = window.matchMedia(ANCHO_DE_COLUMNA);
    const ajustar = (): void => {
      raiz.style.scrollPaddingBottom = columna.matches ? previo : ALTO_DE_LA_HOJA;
    };
    ajustar();
    columna.addEventListener('change', ajustar);
    return () => {
      columna.removeEventListener('change', ajustar);
      raiz.style.scrollPaddingBottom = previo;
    };
  }, [hayFicha]);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      // Las opciones AYUDAN a leer el catálogo: si no llegan, cada producto dice «sin
      // opciones» y el precio por canal se sigue decidiendo igual.
      consultarPuente<OpcionDeBebida>('Modificador', { limite: 2000, signal: control.signal })
        .then((opciones) => {
          if (sigueMontada()) setGrupos(gruposPorProducto(opciones));
        })
        .catch(() => undefined);
      consultarPuente<ProductoDeBarra>('ProductoTerminado', {
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setProductos(filas);
        })
        .catch((fallo: unknown) => {
          // Un catálogo que no se leyó NO es un catálogo vacío: con la lista vacía
          // parecía que la cafetería no vendía nada.
          if (sigueMontada())
            setFalloDeCarga(
              fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.',
            );
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

  function abrir(producto: ProductoDeBarra): void {
    setElegido(producto);
    setPrecioCentavos(precioDe(producto));
    setError(null);
  }

  /**
   * La fila se convierte en la ficha. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma la FICHA, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function elegir(id: string): void {
    const producto = productos?.find((p) => p.id === id);
    if (producto === undefined) return;
    if (elegido?.id === id) {
      abrir(producto);
      return;
    }
    flushSync(() => {
      setViajando(id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        abrir(producto);
      });
    });
  }

  /**
   * Al cerrar, el foco VUELVE a la fila que abrió la ficha. El botón de cerrar se
   * desmonta con ella, y sin esto el foco caía en `<body>`: quien usa teclado perdía
   * el renglón en el que iba. La fila se busca ANTES de cerrar, mientras aún es la
   * activa; el elemento es el mismo después, así que el foco se queda en ella.
   */
  function cerrarFicha(): void {
    const fila = lista.current?.querySelector<HTMLElement>('tr[data-activa]');
    setElegido(null);
    fila?.focus();
  }

  function guardarPrecio(): void {
    if (elegido === null) return;
    const centavos = precioCentavos;
    if (centavos === null || centavos > PRECIO_MAXIMO_CENTAVOS) {
      setError('Revisa el precio: sólo pesos y centavos.');
      return;
    }
    setOcupado(true);
    setError(null);
    // `importe` es una cadena en PESOS, no un número de centavos: con
    // `precioVentaCentavos` el comando contestaba 400 en cada guardado.
    invocarComando(RUTA_PRECIO, {
      productoId: elegido.id,
      precioVenta: textoParaCampo(centavos),
    })
      .then(() => {
        // La fila local imita la del puente: el precio vuelve en su unidad, pesos.
        const actualizado = {
          ...elegido,
          precio_venta: valorDelPuente('ProductoTerminado', 'precio_venta', centavos),
        };
        setElegido(actualizado);
        setProductos((productos ?? []).map((p) => (p.id === elegido.id ? actualizado : p)));
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function cambiarDisponible(producto: ProductoDeBarra): void {
    const siguiente = { ...producto, visible_en_pos: !producto.visible_en_pos };
    setProductos((productos ?? []).map((p) => (p.id === producto.id ? siguiente : p)));
    if (elegido?.id === producto.id) setElegido(siguiente);
    /**
     * ── ESTA PERILLA NUNCA GUARDÓ NADA ──────────────────────────────
     * Publicaba en `catalogo.actualizar_producto` con `{productoId, disponible}` y
     * un comentario que decía «el comando sí se llama `disponible`». **No existe**:
     * `entradaActualizarProducto` pide `nombre`, `descripcion`, `categoriaId`,
     * `marca`, `imagenUrl`, `visibleEnPos`, `permiteVentaSinStock` y `stockMinimo`,
     * y ninguno de ellos es `disponible`. CADA toque contestaba **400**, y la
     * perilla volvía a su sitio con un mensaje genérico: el barista marcaba «hoy no
     * hay» y el menú público seguía ofreciendo la bebida. El rastreador lo contó
     * dieciséis veces, una por producto.
     *
     * Se escribe por el PUENTE, que es donde vive ese campo y lo que ya hace la
     * misma perilla del restaurante: una columna, una escritura, sin inventar un
     * comando para un booleano.
     */
    invocarComando(RUTA_ESCRIBIR, {
      entidad: 'ProductoTerminado',
      operacion: 'update',
      id: producto.id,
      datos: { visible_en_pos: siguiente.visible_en_pos },
    }).catch((fallo: unknown) => {
      // Se devuelve la perilla a su sitio: dejarla movida haría creer que el
      // menú público cambió cuando no cambió.
      setProductos((productos ?? []).map((p) => (p.id === producto.id ? producto : p)));
      setError(mensajeDe(fallo));
    });
  }

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer el catálogo"
          queHacer="Sin él no se ve el precio ni lo que deja cada canal, y no se puede marcar lo que hoy no hay. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (productos === null) {
    return (
      <div className="mx-auto grid max-w-7xl gap-(--espacio-4) p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-(--espacio-6) xl:p-(--espacio-6)">
        {/* La forma del catálogo y de la ficha, no una rueda: al llegar los datos
            nada salta, y el ojo ya sabe dónde va a mirar. */}
        <div className="flex flex-col gap-(--espacio-4)">
          <Esqueleto className="h-(--altura-control) w-48" />
          <EsqueletoDeLista filas={8} />
        </div>
        <Esqueleto className="hidden h-96 w-full rounded-lg xl:block" />
      </div>
    );
  }

  const agotados = productos.filter((p) => !p.visible_en_pos).length;
  const columnas = columnasDelCatalogo(
    voc.titulo('producto'),
    cambiarDisponible,
    (id) => grupos.get(id) ?? [],
  );

  return (
    <main
      className={`mx-auto grid max-w-7xl gap-(--espacio-4) p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-(--espacio-6) xl:p-(--espacio-6) ${elegido === null ? '' : 'pb-[70dvh] xl:pb-(--espacio-6)'}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2) xl:col-span-2">
        <h1 className="text-2xl font-semibold">{voc.titulo('producto', true)}</h1>
        {/* Lo que la barra quiere saber a media mañana: cuántos y cuántos no hay. */}
        <div className="flex flex-wrap items-center gap-(--espacio-3)">
          <p className="text-sm text-texto-sutil">
            {voc.conNumero('producto', productos.length)}
            {agotados === 0 ? null : ` · ${String(agotados)} hoy no hay`}
          </p>
          {/* El alta es la del catálogo del tronco: la foto, la receta, la familia y el IVA. */}
          <Button asChild size="sm" variant="outline">
            <a href="/productos">Dar de alta</a>
          </Button>
        </div>
      </header>

      {error === null ? null : (
        <Aviso tono="peligro" titulo={error} className="xl:col-span-2">
          Nada cambió en el catálogo.
        </Aviso>
      )}

      <section
        ref={lista}
        aria-label={voc.titulo('producto', true)}
        className="min-w-0 xl:col-start-1"
      >
        <Tabla
          etiqueta={`${voc.titulo('producto', true)} con su precio y lo que deja cada canal`}
          columnas={columnas}
          filas={productos}
          claveDe={(p) => p.id}
          {...(elegido === null ? {} : { activa: elegido.id })}
          alActivar={elegir}
          // Se atenúa y NO se esconde: la celda dice «Hoy no hay», y mañana vuelve.
          tonoDeFila={(p) => (p.visible_en_pos ? undefined : 'tenue')}
          viajeDeFila={(p) => (p.id === viajando ? VIAJE.fila(p.id) : undefined)}
          alto="max-h-[70vh]"
          vacio={
            <Vacio
              icono={<Coffee />}
              titulo={`Todavía no hay ${voc.plural('producto')} en el catálogo.`}
              explicacion="El alta vive en el catálogo. En cuanto haya precios, aquí se ve cuánto deja cada uno en la barra y en la plataforma, y se marca lo que hoy no hay."
            />
          }
        />
      </section>

      {elegido === null ? (
        <Vacio
          icono={<Coffee />}
          titulo={`Elige ${voc.enFraseCon('un', 'producto')} para ver su margen.`}
          explicacion="Su precio, lo que cuesta y lo que deja en la barra y en la plataforma, uno al lado del otro."
          className="hidden xl:col-start-2 xl:flex"
        />
      ) : (
        <FichaDelProducto
          producto={elegido}
          grupos={grupos.get(elegido.id) ?? []}
          canal={canal}
          alElegirCanal={setCanal}
          precioCentavos={precioCentavos}
          alCambiarPrecio={setPrecioCentavos}
          ocupado={ocupado}
          alGuardar={guardarPrecio}
          alCerrar={cerrarFicha}
        />
      )}
    </main>
  );
}
