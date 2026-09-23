'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Progreso,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
  type TamanoDeDinero,
} from '@morphiqpos/ui/sistema';
import { ArrowLeft, ChefHat, ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · recetas
 *
 * Se usa a ráfagas —treinta veces en dos días al configurar la carta, dos por
 * semana después— y siempre la usa el dueño. Puede permitirse un formulario;
 * lo que no puede permitirse es aburrir: capturar recetas es trabajo que no
 * paga el primer día, y el único incentivo que funciona es VER el margen.
 *
 * ── Manda el margen, no el nombre ────────────────────────────────────────
 * La jerarquía del documento es 1 margen · 2 si tiene receta · 3 precio, así
 * que el margen lleva semáforo —verde arriba de 60 %, ámbar de 40 a 60, rojo
 * debajo— y la lista se ordena por urgencia: lo que pierde dinero primero, lo
 * que ni siquiera tiene receta después, y hasta el final lo sano. Alfabético
 * escondería los seis platillos que importan entre noventa que no. El número del
 * margen va en cifras y más grande que el precio; la palabra lo acompaña, porque
 * el color nunca va solo.
 *
 * ── La fila se convierte en panel ────────────────────────────────────────
 * Abrir un platillo es la fila que se expande hasta ser su receta: en PC y
 * tableta horizontal, a un panel fijo al lado de la lista —se capturan treinta
 * seguidas sin perder de vista cuál falta—; en teléfono, el panel ocupa el lugar
 * de la lista y «Volver» la devuelve. La fila y el panel llevan el mismo nombre
 * de viaje (`VIAJE.fila`), nunca los dos a la vez.
 *
 * ── La cantidad se teclea en la unidad que uno quiera ────────────────────
 * En cocina se dice «250 gramos» y «medio litro». Obligar a teclear en unidad
 * base garantiza el error de 1000×. El servidor convierte, guarda las dos
 * cosas y falla si las dimensiones no coinciden.
 *
 * ── Agregar un ingrediente manda la receta ENTERA ────────────────────────
 * `inventario.guardar_receta` reemplaza el escandallo en una transacción.
 * Enviar sólo la línea nueva dejaría al platillo con un único ingrediente.
 *
 * ── Fuera de alcance ─────────────────────────────────────────────────────
 * Editar o quitar una línea ya capturada, capturar la merma al agregar (se
 * manda en cero y se ve en la receta abierta), el aviso de cordura al guardar
 * («cuesta $412 y se vende en $180») y la importación por Excel.
 */

/** Las únicas unidades que el comando admite. Ampliarlas es abrir el error de mil. */
const UNIDADES = ['g', 'kg', 'ml', 'l', 'pieza', 'm'] as const;

/** El comando del escandallo, que ya existe (`/api/<dominio>/<verbo>`). */
const RUTA_GUARDAR = '/api/inventario/recetas';

const MARGEN_SANO = 60;
const MARGEN_AJUSTADO = 40;
const PUNTOS_BASE_POR_PUNTO = 100;
const HTTP_DEMASIADOS_INTENTOS = 429;
const CANTIDAD_VALIDA = /^\d{1,10}(?:\.\d{1,4})?$/;
/** El puente entrega PESOS —ya dividió los centavos— y `Dinero` pinta centavos enteros. */
const CENTAVOS_POR_PESO = 100;
const DECIMALES_MAXIMOS = 4;
const PORCENTAJE_COMPLETO = 100;

/** Lista y panel lado a lado desde la tableta horizontal; debajo, uno a la vez. */
const MARCO =
  'grid gap-(--espacio-4) p-(--espacio-4) lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start';

export interface ProductoConMargen {
  readonly id: string;
  readonly nombre: string;
  readonly categoria_nombre: string | null;
  readonly precio_venta: number | null;
  readonly costo_calculado_actual: number | null;
  readonly margen_bruto_actual: number | null;
}

export interface LineaDeReceta {
  readonly id: string;
  readonly producto_id: string;
  readonly ingrediente_id: string;
  readonly ingrediente_nombre: string | null;
  readonly cantidad_usada: number | null;
  readonly unidad_usada: string | null;
  readonly merma_porcentaje: number | null;
  readonly costo_linea_calculado: number | null;
}

export interface IngredienteDisponible {
  readonly id: string;
  readonly nombre: string;
}

export interface FilaDeReceta {
  readonly producto: ProductoConMargen;
  readonly lineas: readonly LineaDeReceta[];
}

export interface RecetasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeReceta[];
  readonly ingredientesIniciales?: readonly IngredienteDisponible[];
}

type Campo = 'productoId' | 'insumoId' | 'cantidad' | 'unidad';
type Borrador = Readonly<Record<Campo, string>>;
const VACIO: Borrador = { productoId: '', insumoId: '', cantidad: '', unidad: 'g' };

/** Lo que se le dice a quien captura: un dato que falta, o un comando que falló. */
interface Problema {
  readonly tono: 'atencion' | 'peligro';
  readonly titulo: string;
  /** Lo que pasó y lo que NO pasó: si la receta se guardó o quedó como estaba. */
  readonly consecuencia: string | null;
}

/** El semáforo del margen. La PALABRA acompaña al color: el color nunca va solo. */
export function semaforoDeMargen(margen: number | null): { etiqueta: string; clase: string } {
  if (!Number.isFinite(margen)) return { etiqueta: 'Sin costo', clase: 'bg-fondo-sutil' };
  const valor = margen ?? 0;
  if (valor >= MARGEN_SANO) return { etiqueta: 'Sano', clase: 'bg-exito/30' };
  if (valor >= MARGEN_AJUSTADO) return { etiqueta: 'Ajustado', clase: 'bg-advertencia/35' };
  return { etiqueta: 'En riesgo', clase: 'bg-peligro/25' };
}

/** Rojo en el semáforo: el platillo se vende, pero deja menos de lo que debe. */
const pierdeMargen = (margen: number | null): boolean =>
  Number.isFinite(margen) && (margen ?? 0) < MARGEN_AJUSTADO;

/**
 * La lista es una cola de trabajo, no un catálogo.
 *
 * Sin receta pesa −1: va después de un platillo que ya pierde dinero —ése es el
 * único caso más urgente— y antes de cualquier margen sano.
 */
export function armarFilas(
  productos: readonly ProductoConMargen[],
  lineas: readonly LineaDeReceta[],
): readonly FilaDeReceta[] {
  const porProducto = new Map<string, LineaDeReceta[]>();
  for (const linea of lineas) {
    const grupo = porProducto.get(linea.producto_id) ?? [];
    grupo.push(linea);
    porProducto.set(linea.producto_id, grupo);
  }
  const peso = (fila: FilaDeReceta) =>
    fila.lineas.length === 0 ? -1 : (fila.producto.margen_bruto_actual ?? Number.MAX_SAFE_INTEGER);
  return productos
    .map((producto) => ({ producto, lineas: porProducto.get(producto.id) ?? [] }))
    .sort((a, b) => {
      const orden = peso(a) - peso(b);
      return orden === 0 ? a.producto.nombre.localeCompare(b.producto.nombre, 'es-MX') : orden;
    });
}

const aCentavos = (pesos: number): number => Math.round(pesos * CENTAVOS_POR_PESO);

/** Cuántos decimales tiene lo que se capturó: «0.25 kg» no se lee «0 kg». */
function decimalesDe(valor: number): number {
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(fraccion.length, DECIMALES_MAXIMOS);
}

/** El límite de intentos no es un código: es el 429, y vive en `estado`. */
function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) return 'Demasiados intentos. Espera un momento.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo leer el recetario.';
}

const aIngrediente = (linea: LineaDeReceta) => ({
  insumoId: linea.ingrediente_id,
  cantidad: String(linea.cantidad_usada ?? 0),
  unidad: linea.unidad_usada ?? 'pieza',
  mermaBp: Math.round((linea.merma_porcentaje ?? 0) * PUNTOS_BASE_POR_PUNTO),
});

async function leerTodo(signal: AbortSignal) {
  const [productos, lineas, ingredientes] = await Promise.all([
    consultarPuente<ProductoConMargen>('ProductoTerminado', { limite: 500, signal }),
    consultarPuente<LineaDeReceta>('RecetaEscandallo', { limite: 2000, signal }),
    consultarPuente<IngredienteDisponible>('Ingrediente', { limite: 500, signal }),
  ]);
  return { filas: armarFilas(productos, lineas), ingredientes };
}

/* ── Las piezas que se repiten en la lista y en el panel ──────────────── */

/** Un importe que puede no existir todavía: sin costo calculado es «—», no «$0.00». */
function Importe({
  pesos,
  tamano = 'sm',
}: {
  readonly pesos: number | null;
  readonly tamano?: TamanoDeDinero;
}) {
  if (pesos === null || !Number.isFinite(pesos)) {
    return <span className="text-texto-tenue">—</span>;
  }
  return <Dinero centavos={aCentavos(pesos)} tamano={tamano} />;
}

/** El margen: la cifra, que es lo que se lee, y el semáforo con su palabra al lado. */
function Margen({
  margen,
  tamano = 'base',
}: {
  readonly margen: number | null;
  readonly tamano?: TamanoDeDinero;
}) {
  const semaforo = semaforoDeMargen(margen);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-(--espacio-2)">
      {Number.isFinite(margen) ? (
        <Cifra
          valor={Math.round(margen ?? 0)}
          unidad="%"
          tamano={tamano}
          className="font-semibold"
        />
      ) : null}
      <Badge variant="outline" className={`${semaforo.clase} border-borde`}>
        {semaforo.etiqueta}
      </Badge>
    </span>
  );
}

const ingredientes = (cuantos: number): string =>
  `${String(cuantos)} ingrediente${cuantos === 1 ? '' : 's'}`;

/** Si tiene receta: el segundo dato de la jerarquía, dicho con palabras. */
function EstadoDeReceta({ fila }: { readonly fila: FilaDeReceta }) {
  if (fila.lineas.length === 0) return <Badge variant="secondary">Sin receta</Badge>;
  return <span className="text-texto-sutil">{ingredientes(fila.lineas.length)}</span>;
}

/** Las columnas de la lista, en el orden de la jerarquía leída de derecha a izquierda. */
function columnasDePlatillos(tituloDePlatillo: string): readonly ColumnaDeTabla<FilaDeReceta>[] {
  return [
    {
      clave: 'platillo',
      titulo: tituloDePlatillo,
      orden: (fila) => fila.producto.nombre,
      celda: (fila) => (
        <span className="flex flex-col gap-(--espacio-1)">
          <span className="font-medium">{fila.producto.nombre}</span>
          <span className="text-xs text-texto-sutil">
            {fila.producto.categoria_nombre ?? 'Sin categoría'}
          </span>
          {/* En teléfono no cabe la columna «Receta»: el dato baja aquí. */}
          <span className="text-xs sm:hidden">
            <EstadoDeReceta fila={fila} />
          </span>
        </span>
      ),
    },
    {
      clave: 'receta',
      titulo: 'Receta',
      desde: 'sm',
      orden: (fila) => fila.lineas.length,
      celda: (fila) => <EstadoDeReceta fila={fila} />,
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      desde: 'md',
      orden: (fila) => fila.producto.costo_calculado_actual ?? -1,
      celda: (fila) => <Importe pesos={fila.producto.costo_calculado_actual} />,
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      desde: 'md',
      orden: (fila) => fila.producto.precio_venta ?? -1,
      celda: (fila) => <Importe pesos={fila.producto.precio_venta} />,
    },
    {
      clave: 'margen',
      titulo: 'Margen',
      numerica: true,
      orden: (fila) => fila.producto.margen_bruto_actual ?? Number.MAX_SAFE_INTEGER,
      celda: (fila) => <Margen margen={fila.producto.margen_bruto_actual} />,
    },
  ];
}

/** Las líneas de la receta abierta: qué lleva, cuánto, cuánto se tira y cuánto cuesta. */
const COLUMNAS_DE_LINEAS: readonly ColumnaDeTabla<LineaDeReceta>[] = [
  {
    clave: 'ingrediente',
    titulo: 'Ingrediente',
    celda: (linea) => (
      <span className="font-medium">{linea.ingrediente_nombre ?? 'Ingrediente'}</span>
    ),
  },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    numerica: true,
    celda: (linea) => {
      const cantidad = linea.cantidad_usada ?? 0;
      return (
        <Cifra
          valor={cantidad}
          decimales={decimalesDe(cantidad)}
          tamano="sm"
          {...(linea.unidad_usada === null ? {} : { unidad: linea.unidad_usada })}
        />
      );
    },
  },
  {
    clave: 'merma',
    titulo: 'Merma',
    numerica: true,
    desde: 'sm',
    celda: (linea) => {
      const merma = linea.merma_porcentaje ?? 0;
      return <Cifra valor={merma} decimales={decimalesDe(merma)} unidad="%" tamano="sm" />;
    },
  },
  {
    clave: 'costo',
    titulo: 'Costo',
    numerica: true,
    celda: (linea) => <Importe pesos={linea.costo_linea_calculado} />,
  },
];

export function Recetas({ filasIniciales, ingredientesIniciales }: RecetasProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeReceta[] | null>(filasIniciales ?? null);
  const [insumos, setInsumos] = useState<readonly IngredienteDisponible[]>(
    ingredientesIniciales ?? [],
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: el botón de reintentar lo sube y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [viajando, setViajando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [problema, setProblema] = useState<Problema | null>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return undefined;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    leerTodo(control.signal)
      .then((leido) => {
        if (!sigueMontada()) return;
        setFilas(leido.filas);
        setInsumos(leido.ingredientes);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setFalloDeCarga(mensajeDeFallo(fallo));
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  function reintentarCarga(): void {
    setFalloDeCarga(null);
    setFilas(null);
    setIntento((previo) => previo + 1);
  }

  /**
   * La fila se convierte en el panel. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma el PANEL, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrir(id: string): void {
    if (id === abierta) return;
    flushSync(() => {
      setViajando(id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        setAbierta(id);
        setProblema(null);
      });
    });
  }

  /** En teléfono: el panel vuelve a ser la fila de la que salió. */
  function volver(): void {
    const id = abierta;
    if (id === null) return;
    void conTransicion(() => {
      flushSync(() => {
        setAbierta(null);
        setViajando(id);
        setProblema(null);
      });
    });
  }

  // Un solo borrador para toda la lista: nadie captura dos recetas a la vez, y
  // `productoId` dice de quién es.
  const escribir = (productoId: string, cambio: Partial<Borrador>) => {
    setBorrador((previo) => ({
      ...(previo.productoId === productoId ? previo : VACIO),
      ...cambio,
      productoId,
    }));
  };

  const agregar = async (fila: FilaDeReceta) => {
    const datos = borrador.productoId === fila.producto.id ? borrador : VACIO;
    if (datos.insumoId === '' || !CANTIDAD_VALIDA.test(datos.cantidad)) {
      setProblema({
        tono: 'atencion',
        titulo: 'Elige un ingrediente y escribe una cantidad como 250 o 0.5.',
        consecuencia: null,
      });
      return;
    }
    setGuardando(fila.producto.id);
    let seGuardo = false;
    try {
      await invocarComando(RUTA_GUARDAR, {
        productoId: fila.producto.id,
        ingredientes: [
          ...fila.lineas.map(aIngrediente),
          { insumoId: datos.insumoId, cantidad: datos.cantidad, unidad: datos.unidad, mermaBp: 0 },
        ],
      });
      seGuardo = true;
      // Se relee entero: el costo y el margen los recalcula el servidor en
      // cascada, y son los dos números por los que alguien captura esto.
      const leido = await leerTodo(new AbortController().signal);
      setFilas(leido.filas);
      setBorrador(VACIO);
      setProblema(null);
    } catch (fallo: unknown) {
      setProblema({
        tono: seGuardo ? 'atencion' : 'peligro',
        titulo: mensajeDeFallo(fallo),
        consecuencia: seGuardo
          ? 'El ingrediente sí se guardó; lo que no se pudo es releer el costo y el margen. Vuelve a abrir la pantalla para verlos.'
          : 'No se guardó nada: la receta quedó como estaba.',
      });
    } finally {
      setGuardando(null);
    }
  };

  const cabecera = (
    <div className="flex flex-col gap-(--espacio-1)">
      <h1 className="text-2xl font-bold">Recetas</h1>
      <p className="text-sm text-texto-sutil">
        Por urgencia: lo que deja poco margen primero, lo que no tiene receta después.
      </p>
    </div>
  );

  if (falloDeCarga !== null) {
    return (
      <div className={MARCO}>
        <header className="lg:col-span-2">{cabecera}</header>
        <ErrorDePantalla
          className="lg:col-span-2"
          titulo="No se pudo leer el recetario"
          queHacer="Sin los platillos y sus ingredientes no hay costo ni margen que enseñar. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentarCarga}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (filas === null) {
    return (
      <div aria-busy="true" className={MARCO}>
        <header className="lg:col-span-2">{cabecera}</header>
        {/* La forma de la lista y del panel, nunca una rueda: así nada salta al
            llegar el dato y el ojo ya sabe dónde va a mirar. */}
        <EsqueletoDeLista filas={8} />
        <Esqueleto className="hidden h-80 w-full lg:block" />
      </div>
    );
  }

  if (filas.length === 0) {
    return (
      <div className={MARCO}>
        <header className="lg:col-span-2">{cabecera}</header>
        <Vacio
          className="lg:col-span-2"
          icono={<ChefHat />}
          titulo={`Todavía no hay ${voc.plural('linea_orden')} en la carta.`}
          explicacion={`Sin ${voc.plural('linea_orden')} no hay recetas, y sin recetas no sabemos cuánto cuesta cada plato ni cuánto ganas con él.`}
          accion={
            <Button asChild>
              <a href="/restaurante/productos">Crear mi primer {voc.singular('linea_orden')}</a>
            </Button>
          }
        />
      </div>
    );
  }

  const conReceta = filas.filter((fila) => fila.lineas.length > 0).length;
  const filaAbierta = filas.find((fila) => fila.producto.id === abierta) ?? null;

  return (
    <div className={MARCO}>
      <header className="flex flex-wrap items-end justify-between gap-(--espacio-3) lg:col-span-2">
        {cabecera}
        {/* La cobertura, arriba: capturar quince recetas y creer que terminaste
            es lo que hace que el consumo teórico no cuadre nunca. */}
        <Progreso
          className="w-full sm:w-72"
          valor={(conReceta / filas.length) * PORCENTAJE_COMPLETO}
          etiqueta={`${String(conReceta)} de ${voc.conNumero('linea_orden', filas.length)} tienen receta`}
        />
      </header>

      <Tabla
        etiqueta={voc.titulo('linea_orden', true)}
        columnas={columnasDePlatillos(voc.titulo('linea_orden'))}
        filas={filas}
        claveDe={(fila) => fila.producto.id}
        {...(filaAbierta === null ? {} : { activa: filaAbierta.producto.id })}
        alActivar={abrir}
        viajeDeFila={(fila) =>
          fila.producto.id === viajando ? VIAJE.fila(fila.producto.id) : undefined
        }
        tonoDeFila={(fila) =>
          pierdeMargen(fila.producto.margen_bruto_actual) ? 'peligro' : undefined
        }
        alto="max-h-[70vh]"
        className={filaAbierta === null ? '' : 'hidden lg:block'}
      />

      {filaAbierta === null ? (
        <Vacio
          className="hidden lg:flex"
          icono={<ClipboardList />}
          titulo={`Elige ${voc.enFraseCon('un', 'linea_orden')} para ver de qué está hecho.`}
          explicacion="Sus ingredientes, lo que cuesta cada uno y el margen que deja."
        />
      ) : (
        <PanelDeReceta
          fila={filaAbierta}
          insumos={insumos}
          datos={borrador.productoId === filaAbierta.producto.id ? borrador : VACIO}
          guardando={guardando === filaAbierta.producto.id}
          problema={problema}
          textoDeVolver={`Volver a ${voc.enFrase('linea_orden', true)}`}
          alEscribir={(cambio) => {
            escribir(filaAbierta.producto.id, cambio);
          }}
          alAgregar={() => {
            void agregar(filaAbierta);
          }}
          alVolver={volver}
        />
      )}
    </div>
  );
}

/* ── El panel ─────────────────────────────────────────────────────────── */

interface PanelDeRecetaProps {
  readonly fila: FilaDeReceta;
  readonly insumos: readonly IngredienteDisponible[];
  readonly datos: Borrador;
  readonly guardando: boolean;
  readonly problema: Problema | null;
  readonly textoDeVolver: string;
  readonly alEscribir: (cambio: Partial<Borrador>) => void;
  readonly alAgregar: () => void;
  readonly alVolver: () => void;
}

/** La receta abierta: sus tres números, sus líneas y la acción principal. */
function PanelDeReceta({
  fila,
  insumos,
  datos,
  guardando,
  problema,
  textoDeVolver,
  alEscribir,
  alAgregar,
  alVolver,
}: PanelDeRecetaProps) {
  const voc = useVocabulario();
  const producto = fila.producto;

  return (
    <Superficie
      como="section"
      nivel={1}
      conBorde
      relleno={4}
      aria-label={`Receta de ${producto.nombre}`}
      style={{ viewTransitionName: VIAJE.fila(producto.id) }}
      className="flex flex-col gap-(--espacio-4) lg:sticky lg:top-(--espacio-4)"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start lg:hidden"
        onClick={alVolver}
      >
        <ArrowLeft aria-hidden="true" />
        {textoDeVolver}
      </Button>

      <header className="flex flex-col gap-(--espacio-1)">
        <h2 className="text-xl font-bold">{producto.nombre}</h2>
        <p className="text-sm text-texto-sutil">{producto.categoria_nombre ?? 'Sin categoría'}</p>
      </header>

      {/* Los tres números en el orden de la jerarquía: el margen, grande. */}
      <dl className="flex flex-wrap items-end gap-x-(--espacio-6) gap-y-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">Margen</dt>
          <dd>
            <Margen margen={producto.margen_bruto_actual} tamano="lg" />
          </dd>
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">Costo</dt>
          <dd>
            <Importe pesos={producto.costo_calculado_actual} tamano="base" />
          </dd>
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <dt className="text-xs text-texto-sutil">Precio</dt>
          <dd>
            <Importe pesos={producto.precio_venta} tamano="base" />
          </dd>
        </div>
      </dl>

      <Tabla
        etiqueta={`Ingredientes de ${producto.nombre}`}
        columnas={COLUMNAS_DE_LINEAS}
        filas={fila.lineas}
        claveDe={(linea) => linea.id}
        alto="max-h-[40vh]"
        pie={{
          ingrediente: 'Costo del platillo',
          costo: <Importe pesos={producto.costo_calculado_actual} />,
        }}
        vacio={
          // El vacío explica la consecuencia; el formulario de abajo es su salida.
          <Vacio
            className="py-(--espacio-6)"
            titulo={`${voc.conDeterminante('este', 'linea_orden')} no tiene receta.`}
            explicacion="Sin receta no sabemos cuánto cuesta ni cuánto ganas con él."
          />
        }
      />

      {problema === null ? null : (
        <Aviso tono={problema.tono} titulo={problema.titulo}>
          {problema.consecuencia}
        </Aviso>
      )}

      {/* La acción principal. En teléfono el ingrediente va a lo ancho y la
          cantidad con su unidad debajo; desde la tableta es una sola línea, que es
          como se capturan treinta seguidas sin levantar la mano del teclado. */}
      <form
        className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)"
        onSubmit={(evento) => {
          evento.preventDefault();
          alAgregar();
        }}
      >
        <div className="grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-[minmax(0,1fr)_5.5rem_6rem]">
          <Select
            value={datos.insumoId}
            onValueChange={(valor) => {
              alEscribir({ insumoId: valor });
            }}
          >
            <SelectTrigger aria-label="Ingrediente" className="col-span-2 w-full sm:col-span-1">
              <SelectValue placeholder="Elige el ingrediente" />
            </SelectTrigger>
            <SelectContent>
              {insumos.map((insumo) => (
                <SelectItem key={insumo.id} value={insumo.id}>
                  {insumo.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Cantidad"
            inputMode="decimal"
            placeholder="250"
            className="w-full"
            value={datos.cantidad}
            onChange={(evento) => {
              alEscribir({ cantidad: evento.target.value });
            }}
          />
          {/* La unidad la elige quien captura: en cocina se dice «250 gramos»,
              no «250». Convertir es trabajo del servidor, no del cocinero. */}
          <Select
            value={datos.unidad}
            onValueChange={(valor) => {
              alEscribir({ unidad: valor });
            }}
          >
            <SelectTrigger aria-label="Unidad de la cantidad" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIDADES.map((unidad) => (
                <SelectItem key={unidad} value={unidad}>
                  {unidad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={guardando} className="w-full sm:w-auto sm:self-end">
          {guardando ? 'Guardando…' : 'Agregar ingrediente'}
        </Button>
      </form>
    </Superficie>
  );
}
