'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
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
import {
  Check,
  ClipboardList,
  CupSoda,
  OctagonAlert,
  Plus,
  ShoppingBag,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · recetas
 *
 * Qué lleva cada bebida, en gramos y mililitros, y cuánto cuesta de verdad.
 *
 * ── Por qué el empaque va en la receta y por CANAL ──────────────────────
 * El vaso para llevar, la tapa y la manga cuestan entre $3 y $5, y sólo se
 * gastan cuando el pedido sale por la puerta. Cargarlos siempre infla el costo
 * del que se toma aquí; no cargarlos nunca es regalar cinco pesos por bebida
 * para llevar. Es una línea de receta condicionada al canal, y es lo que arregla
 * el margen de TODAS las bebidas.
 *
 * ── Por qué el tipo de leche SUSTITUYE en vez de sumar ──────────────────
 * Entera, deslactosada y avena son tres insumos con tres costos y el cliente
 * elige uno. Modelarlo como suma haría que un latte de avena descontara también
 * la entera: el inventario de avena nunca bajaría y el de entera bajaría de más
 * — los dos errores a la vez, y ninguno visible.
 *
 * ── Por qué el costo se enseña en la misma pantalla ─────────────────────
 * Una receta sin su costo es una lista de ingredientes. Con el costo al lado, la
 * decisión de subir el precio o cambiar de proveedor se puede tomar aquí, que es
 * donde se tiene toda la información.
 *
 * ── Lo que va grande: el MARGEN, con semáforo ───────────────────────────
 * Es lo primero en la jerarquía del documento de interfaz: verde arriba de 65%,
 * ámbar de 50 a 65%, rojo debajo de 50%. No son los umbrales de `restaurante`
 * (60/40): una bebida de café con food cost de 30–35% debería dejar 65–70%, y
 * con los del restaurante saldrían en verde bebidas que están mal. El color no va
 * solo: cada tramo lleva su icono y su palabra.
 *
 * ── La fila se convierte en panel ───────────────────────────────────────
 * En la terminal la lista de bebidas vive a la izquierda y la receta a la
 * derecha, lejos de la fila. Al tocar una bebida, su fila viaja hasta el panel
 * (`VIAJE.fila`): dice de quién es la receta sin leer el nombre. Dura lo que
 * diga la perilla de movimiento, y cero con la preferencia del sistema.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben ver, editar y costear la receta, con sus líneas por canal. Queda fuera
 * el escandallo de producción por lotes, que es de otro arquetipo, y la tabla de
 * variantes (leche, tamaño), que necesita una lectura que el puente aún no sirve.
 * `merma_bp` no se enseña: vale cero en casi todas las líneas de una cafetería, y
 * un campo que siempre vale cero enseña a ignorar los campos.
 */

const RUTA_GUARDAR = '/api/inventario/recetas';
// Quitar una línea es GUARDAR la receta sin ella: `inventario.eliminar_receta`
// borra la receta entera y archiva el producto, que no es lo que pide un
// ingrediente de menos. Ver `eliminar`.

const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;

/** El semáforo del margen, en puntos porcentuales. Ver la cabecera. */
const MARGEN_SANO = 65;
const MARGEN_JUSTO = 50;

/** Los decimales que una cantidad de receta puede traer: los del comando. */
const DECIMALES_MAXIMOS = 4;

/** El empaque sólo se gasta cuando el pedido sale por la puerta. */
const CANALES = [
  { clave: 'ambos', etiqueta: 'Siempre' },
  { clave: 'aqui', etiqueta: 'Sólo aquí' },
  { clave: 'llevar', etiqueta: 'Sólo para llevar' },
] as const;

/** Un `<select>` nativo con la forma de un campo del sistema. */
const CAMPO_DE_LISTA =
  'h-(--altura-control) w-full rounded-md border border-borde-fuerte bg-fondo px-(--espacio-3) text-sm focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:opacity-50';

export interface ProductoConReceta {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad NO sirve: lo expone como
   * `precio_venta`, ya convertido por `dinero`. Llegaba `undefined` y la pantalla
   * enseñaba `$NaN`.
   */
  readonly precio_venta: number | null;
}

/**
 * UNA LÍNEA DE RECETA, con los nombres que el puente SIRVE.
 *
 * `RecetaEscandallo` sirve `ingrediente_id`, `ingrediente_nombre`, `cantidad_usada`
 * y `costo_unitario_base_snapshot` —el costo CONGELADO al guardar la receta, que es
 * el que explica el margen de ese día—. Los cuatro llegaban `undefined`: el
 * escandallo enseñaba el nombre vacío y el costo de la receta salía `NaN`.
 *
 * `aplica_canal` no se sirve y no es un olvido: NO EXISTE la columna. El canal de
 * una línea de receta —«esto sólo va en el de 16 oz»— está declarado en la pantalla
 * y no en la base; hasta que exista, se trata como «ambos», que es lo que hoy hace
 * el cálculo del consumo al cobrar.
 */
export interface LineaDeReceta {
  readonly id: string;
  readonly ingrediente_id: string;
  readonly ingrediente_nombre: string | null;
  /**
   * La cantidad es un NÚMERO: el puente la sirve con `conversion: 'decimal'`.
   *
   * Declarada `string`, el costo de la receta hacía
   * `Number(linea.cantidad_usada.replace(',', '.'))` sobre un número y la pantalla
   * moría con `TypeError: …replace is not a function` en cuanto la receta tenía una
   * línea. Ni 500 ni `{ok:false}`: el servidor ni se enteraba.
   */
  readonly cantidad_usada: number;
  readonly unidad: string;
  /** El costo CONGELADO al guardar, en pesos. */
  readonly costo_unitario_base_snapshot: number | null;
  /** No se sirve: la columna no existe. Ver la cabecera. */
  readonly aplica_canal?: string;
}

/**
 * El canal de una línea, tal como lo entiende el comando.
 *
 * En la base es `text[]` y nulo significa «todos» (083). El puente lo sirve como
 * viene; aquí se traduce a la palabra que el esquema acepta.
 */
export function canalDe(valor: string | undefined): 'ambos' | 'aqui' | 'llevar' {
  if (valor === undefined || valor === '') return 'ambos';
  if (valor.includes('llevar')) return 'llevar';
  if (valor.includes('aqui')) return 'aqui';
  return 'ambos';
}

export interface InsumoDisponible {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  /** EN PESOS: la entidad `Ingrediente` sirve `costo_por_unidad_base`. */
  readonly costo_por_unidad_base: number | null;
}

export interface RecetasProps {
  readonly productosIniciales?: readonly ProductoConReceta[];
  readonly insumosIniciales?: readonly InsumoDisponible[];
}

/** Pesos del puente a centavos enteros: el dinero de la pantalla es entero. */
function aCentavos(pesos: number | null): number {
  if (pesos === null || !Number.isFinite(pesos)) return 0;
  return Math.round(pesos * 100);
}

/** Lo que cuesta UNA línea con el costo congelado al guardar, en centavos. */
function costoDeLinea(linea: LineaDeReceta): number {
  const cantidad = linea.cantidad_usada;
  if (!Number.isFinite(cantidad)) return 0;
  return Math.round(cantidad * aCentavos(linea.costo_unitario_base_snapshot));
}

/**
 * El costo de la receta EN UN CANAL.
 *
 * Se pide el canal porque el empaque sólo entra cuando el pedido sale por la
 * puerta: un costo único mezclaría las dos y ninguno de los dos números serviría
 * para decidir el precio.
 */
export function costoEnCanal(lineas: readonly LineaDeReceta[], canal: 'aqui' | 'llevar'): number {
  let total = 0;
  for (const linea of lineas) {
    // Sin canal declarado, la línea entra en los dos: es lo que hace el consumo
    // al cobrar, y suponer lo contrario descontaría de menos.
    const aplica = linea.aplica_canal ?? 'ambos';
    if (aplica !== 'ambos' && aplica !== canal) continue;
    total += costoDeLinea(linea);
  }
  return total;
}

/** El margen bruto en puntos enteros, o nada si no hay precio contra qué medirlo. */
function margenDe(precioCentavos: number, costoCentavos: number): number | null {
  if (precioCentavos <= 0) return null;
  return Math.round(((precioCentavos - costoCentavos) * 100) / precioCentavos);
}

interface Semaforo {
  readonly palabra: string;
  readonly clase: string;
  readonly Icono: LucideIcon;
}

function semaforoDe(margen: number): Semaforo {
  if (margen > MARGEN_SANO) return { palabra: 'margen sano', clase: 'bg-exito/20', Icono: Check };
  if (margen >= MARGEN_JUSTO)
    return { palabra: 'margen justo', clase: 'bg-advertencia/30', Icono: TriangleAlert };
  return { palabra: 'margen bajo', clase: 'bg-peligro/15 text-peligro', Icono: OctagonAlert };
}

/** Cuántos decimales trae la cantidad, para no redondear 0.5 g a 1 g. */
function decimalesDe(valor: number): number {
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(fraccion.length, DECIMALES_MAXIMOS);
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar la receta. Vuelve a intentarlo.';
}

/** Lo que se le dice a quien captura: un dato que falta, o un comando que falló. */
interface Problema {
  readonly tono: 'atencion' | 'peligro';
  readonly texto: string;
}

interface NuevaLinea {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly canal: string;
}

const LINEA_EN_BLANCO: NuevaLinea = { insumoId: '', cantidad: '', canal: 'ambos' };

const MARCO =
  'mx-auto grid w-full max-w-6xl gap-(--espacio-4) p-(--espacio-4) lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:p-(--espacio-6)';

export function Recetas({ productosIniciales, insumosIniciales }: RecetasProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoConReceta[] | null>(
    productosIniciales ?? null,
  );
  const [insumos, setInsumos] = useState<readonly InsumoDisponible[] | null>(
    insumosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: el botón de reintentar lo sube, y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState<ProductoConReceta | null>(null);
  const [viajando, setViajando] = useState<string | null>(null);
  const [lineas, setLineas] = useState<readonly LineaDeReceta[] | null>(null);
  const [falloDeLineas, setFalloDeLineas] = useState<string | null>(null);
  const [nueva, setNueva] = useState<NuevaLinea>(LINEA_EN_BLANCO);
  const [problema, setProblema] = useState<Problema | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /**
   * De qué bebida son las líneas que se están leyendo. Tocar dos bebidas seguidas
   * lanza dos lecturas, y la primera puede llegar después: sin esto, la receta de
   * una se pintaba bajo el nombre de la otra, y «Agregar» la guardaba ahí.
   */
  const lineasDe = useRef<string | null>(null);
  const campoDeInsumo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (productosIniciales !== undefined && insumosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const fallar = (fallo: unknown): void => {
      if (!sigueMontada()) return;
      setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el menú.');
    };
    const cargar = (): void => {
      if (productosIniciales === undefined) {
        consultarPuente<ProductoConReceta>('ProductoTerminado', {
          limite: 200,
          signal: control.signal,
        })
          .then((filas) => {
            if (sigueMontada()) setProductos(filas);
          })
          .catch(fallar);
      }
      if (insumosIniciales === undefined) {
        consultarPuente<InsumoDisponible>('Ingrediente', { limite: 200, signal: control.signal })
          .then((filas) => {
            if (sigueMontada()) setInsumos(filas);
          })
          .catch(fallar);
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productosIniciales, insumosIniciales, intento]);

  function reintentarCarga(): void {
    setFalloDeCarga(null);
    setProductos(productosIniciales ?? null);
    setInsumos(insumosIniciales ?? null);
    setIntento((previo) => previo + 1);
  }

  /** Las líneas de la receta de ese producto, leídas del puente. */
  function leerLineas(productoId: string): void {
    lineasDe.current = productoId;
    consultarPuente<LineaDeReceta>('RecetaEscandallo', {
      filtro: { producto_id: productoId },
      limite: 60,
    })
      .then((filas) => {
        if (lineasDe.current === productoId) setLineas(filas);
      })
      .catch((fallo: unknown) => {
        if (lineasDe.current !== productoId) return;
        setFalloDeLineas(fallo instanceof Error ? fallo.message : 'No se pudo leer la receta.');
      });
  }

  function reintentarLineas(): void {
    if (elegido === null) return;
    setFalloDeLineas(null);
    setLineas(null);
    leerLineas(elegido.id);
  }

  function elegir(producto: ProductoConReceta): void {
    setElegido(producto);
    setLineas(null);
    setFalloDeLineas(null);
    setProblema(null);
    leerLineas(producto.id);
  }

  /**
   * La fila se convierte en el panel. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma el PANEL, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrir(id: string): void {
    if (id === elegido?.id) return;
    const producto = (productos ?? []).find((p) => p.id === id);
    if (producto === undefined) return;
    flushSync(() => {
      setViajando(id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        elegir(producto);
      });
    });
  }

  function agregar(): void {
    if (elegido === null) return;
    const insumo = (insumos ?? []).find((i) => i.id === nueva.insumoId);
    if (insumo === undefined) {
      setProblema({ tono: 'atencion', texto: 'Elige un ingrediente.' });
      return;
    }
    if (!CANTIDAD_CON_FORMA.test(nueva.cantidad)) {
      setProblema({ tono: 'atencion', texto: 'La cantidad va con hasta cuatro decimales.' });
      return;
    }
    setOcupado(true);
    setProblema(null);
    /**
     * ── AGREGAR UN INGREDIENTE NUNCA FUNCIONÓ ────────────────────────
     * Mandaba `{productoId, insumoId, cantidad, aplicaCanal}` y
     * `inventario.guardar_receta` REEMPLAZA la receta entera con
     * `{productoId, ingredientes: […]}`: cada «Agregar» contestaba **400** y la
     * receta de una bebida no se podía capturar. Y la unidad no es opcional: el
     * comando exige que sea la MISMA del insumo, porque una receta en litros sobre
     * un insumo en mililitros descuenta mil veces de menos.
     *
     * Se manda la lista completa —las líneas que ya había más la nueva— porque eso es
     * lo que el comando escribe: un `delete` y un `insert` de todo, en una
     * transacción.
     */
    const yaEstaban = (lineas ?? []).map((linea) => ({
      insumoId: linea.ingrediente_id,
      cantidad: String(linea.cantidad_usada),
      unidad: linea.unidad,
      mermaBp: 0,
      aplicaCanal: canalDe(linea.aplica_canal),
    }));
    invocarComando(RUTA_GUARDAR, {
      productoId: elegido.id,
      ingredientes: [
        ...yaEstaban,
        {
          insumoId: insumo.id,
          cantidad: nueva.cantidad.replace(',', '.'),
          unidad: insumo.unidad_base,
          mermaBp: 0,
          aplicaCanal: nueva.canal,
        },
      ],
    })
      .then(() => {
        // Se vuelve a leer: los identificadores de las líneas son nuevos —el comando
        // borra y reinserta— y conservar los viejos dejaría la pantalla mintiendo.
        // Sólo si sigue abierta la misma bebida: si ya se eligió otra, releer ésta
        // pintaría su receta bajo el nombre de la nueva.
        if (lineasDe.current !== elegido.id) return;
        leerLineas(elegido.id);
        setNueva(LINEA_EN_BLANCO);
      })
      .catch((fallo: unknown) => {
        setProblema({ tono: 'peligro', texto: mensajeDe(fallo) });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  /**
   * QUITAR UNA LÍNEA es guardar la receta SIN ella.
   *
   * ── Lo que hacía, y por qué era peor que no funcionar ───────────────
   * Publicaba `{recetaId}` en `inventario.eliminar_receta`, que pide `{productoId}`:
   * 400 en cada intento. Y si hubiera acertado el nombre habría sido peor, porque
   * ese comando **borra la receta entera y archiva el producto**: quitar un
   * ingrediente habría retirado la bebida de la carta.
   */
  function eliminar(linea: LineaDeReceta): void {
    if (elegido === null) return;
    setOcupado(true);
    setProblema(null);
    const quedan = (lineas ?? [])
      .filter((l) => l.id !== linea.id)
      .map((l) => ({
        insumoId: l.ingrediente_id,
        cantidad: String(l.cantidad_usada),
        unidad: l.unidad,
        mermaBp: 0,
        aplicaCanal: canalDe(l.aplica_canal),
      }));
    invocarComando(RUTA_GUARDAR, { productoId: elegido.id, ingredientes: quedan })
      .then(() => {
        if (lineasDe.current !== elegido.id) return;
        setLineas((lineas ?? []).filter((l) => l.id !== linea.id));
      })
      .catch((fallo: unknown) => {
        setProblema({ tono: 'peligro', texto: mensajeDe(fallo) });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const cabecera = (
    <header className="flex flex-col gap-(--espacio-1) lg:col-span-2">
      <h1 className="text-2xl font-bold">Recetas</h1>
      <p className="text-sm text-texto-sutil">
        Qué lleva, cuánto cuesta aquí y para llevar, y cuánto deja.
      </p>
    </header>
  );

  if (falloDeCarga !== null) {
    return (
      <main className={MARCO}>
        {cabecera}
        <ErrorDePantalla
          className="lg:col-span-2"
          titulo="No se pudo leer el menú ni los ingredientes"
          queHacer="Sin ellos no se puede armar ni costear una receta. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentarCarga}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  if (productos === null || insumos === null) {
    return (
      <main aria-busy="true" className={MARCO}>
        {cabecera}
        {/* La forma de la lista y del panel, no una rueda: al llegar los datos nada
            salta, y el ojo ya sabe dónde va a mirar. */}
        <EsqueletoDeLista filas={8} />
        <Esqueleto className="h-80 w-full rounded-lg" />
      </main>
    );
  }

  if (productos.length === 0) {
    return (
      <main className={MARCO}>
        {cabecera}
        <Vacio
          className="lg:col-span-2"
          icono={<CupSoda />}
          titulo={`Todavía no hay ${voc.plural('linea_orden')} en el menú`}
          explicacion={`Cada receta es de ${voc.enFraseCon('un', 'linea_orden')} del menú: en cuanto el menú tenga sus productos con precio, aparecen aquí para decir qué llevan y cuánto cuestan.`}
          accion={
            <Button asChild>
              <a href="/cafeteria/productos">Cargar el menú</a>
            </Button>
          }
        />
      </main>
    );
  }

  const columnasDeProducto: readonly ColumnaDeTabla<ProductoConReceta>[] = [
    {
      clave: 'nombre',
      titulo: voc.titulo('linea_orden'),
      orden: (producto) => producto.nombre,
      celda: (producto) => (
        <span className="flex flex-col">
          <span className="font-medium">{producto.nombre}</span>
          <span className="text-xs text-texto-sutil">{producto.familia}</span>
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (producto) => aCentavos(producto.precio_venta),
      celda: (producto) => <Dinero centavos={aCentavos(producto.precio_venta)} tamano="sm" />,
    },
  ];

  return (
    <main className={MARCO}>
      {cabecera}
      <Tabla
        etiqueta={voc.titulo('linea_orden', true)}
        columnas={columnasDeProducto}
        filas={productos}
        claveDe={(producto) => producto.id}
        {...(elegido === null ? {} : { activa: elegido.id })}
        alActivar={abrir}
        viajeDeFila={(producto) => (producto.id === viajando ? VIAJE.fila(producto.id) : undefined)}
        alto="max-h-72 lg:max-h-[70vh]"
      />

      {elegido === null ? (
        <Vacio
          icono={<ClipboardList />}
          titulo={`Elige ${voc.enFraseCon('un', 'linea_orden')} para ver qué lleva.`}
          explicacion="Su costo aquí y para llevar sale al lado del precio: es donde se decide si hay que subirlo."
        />
      ) : (
        <Superficie
          como="section"
          nivel={1}
          conBorde
          relleno={4}
          aria-label={`Receta de ${elegido.nombre}`}
          style={{ viewTransitionName: VIAJE.fila(elegido.id) }}
          className="flex flex-col gap-(--espacio-4) lg:sticky lg:top-(--espacio-4)"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
            <h2 className="text-xl font-bold">{elegido.nombre}</h2>
            <p className="text-sm text-texto-sutil">
              Se vende a <Dinero centavos={aCentavos(elegido.precio_venta)} tamano="base" />
            </p>
          </header>

          {problema === null ? null : (
            <Aviso tono={problema.tono} titulo={problema.texto}>
              {problema.tono === 'peligro'
                ? 'La receta quedó como estaba: no se guardó ningún cambio.'
                : null}
            </Aviso>
          )}

          <ContenidoDeReceta
            producto={elegido}
            lineas={lineas}
            fallo={falloDeLineas}
            ocupado={ocupado}
            alQuitar={eliminar}
            alReintentar={reintentarLineas}
            campoDeInsumo={campoDeInsumo}
          />

          {lineas === null || falloDeLineas !== null ? null : (
            <FormularioDeLinea
              insumos={insumos}
              nueva={nueva}
              ocupado={ocupado}
              campoDeInsumo={campoDeInsumo}
              alCambiar={setNueva}
              alAgregar={agregar}
            />
          )}
        </Superficie>
      )}
    </main>
  );
}

/* ── El panel, por piezas ─────────────────────────────────────────────── */

interface ContenidoDeRecetaProps {
  readonly producto: ProductoConReceta;
  readonly lineas: readonly LineaDeReceta[] | null;
  readonly fallo: string | null;
  readonly ocupado: boolean;
  readonly alQuitar: (linea: LineaDeReceta) => void;
  readonly alReintentar: () => void;
  readonly campoDeInsumo: RefObject<HTMLSelectElement | null>;
}

/** El costo por canal y las líneas: lo que se lee de la receta, en sus tres estados. */
function ContenidoDeReceta({
  producto,
  lineas,
  fallo,
  ocupado,
  alQuitar,
  alReintentar,
  campoDeInsumo,
}: ContenidoDeRecetaProps) {
  if (fallo !== null) {
    // Sin las líneas no se ofrece agregar ni quitar: el comando reemplaza la receta
    // entera, y guardar sobre una lista que no se leyó borraría las que ya tiene.
    return (
      <ErrorDePantalla
        titulo={`No se pudo leer la receta de ${producto.nombre}`}
        queHacer="Mientras no se lea no se puede agregar ni quitar nada: se guardaría sin las líneas que ya tiene. Vuelve a intentarlo."
        detalle={fallo}
        reintentar={<Button onClick={alReintentar}>Volver a intentar</Button>}
      />
    );
  }

  if (lineas === null) return <EsqueletoDeLista filas={4} />;

  const precio = aCentavos(producto.precio_venta);

  const columnas: readonly ColumnaDeTabla<LineaDeReceta>[] = [
    {
      clave: 'ingrediente',
      titulo: 'Ingrediente',
      celda: (linea) => linea.ingrediente_nombre ?? 'Sin nombre',
    },
    {
      clave: 'cantidad',
      titulo: 'Cantidad',
      numerica: true,
      celda: (linea) => (
        <Cifra
          valor={linea.cantidad_usada}
          unidad={linea.unidad}
          decimales={decimalesDe(linea.cantidad_usada)}
          tamano="sm"
        />
      ),
    },
    {
      clave: 'canal',
      titulo: 'Cuándo',
      celda: (linea) => <EtiquetaDeCanal canal={canalDe(linea.aplica_canal)} />,
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      celda: (linea) => <Dinero centavos={costoDeLinea(linea)} tamano="sm" />,
    },
    {
      clave: 'quitar',
      titulo: '',
      celda: (linea) => (
        <span className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            disabled={ocupado}
            aria-label={`Quitar ${linea.ingrediente_nombre ?? 'la línea'} de la receta`}
            onClick={() => {
              alQuitar(linea);
            }}
          >
            Quitar
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      {lineas.length === 0 ? null : (
        <CostoPorCanal
          precio={precio}
          aqui={costoEnCanal(lineas, 'aqui')}
          llevar={costoEnCanal(lineas, 'llevar')}
        />
      )}
      <Tabla
        etiqueta={`Ingredientes de ${producto.nombre}`}
        columnas={columnas}
        filas={lineas}
        claveDe={(linea) => linea.id}
        alto="max-h-[50vh]"
        vacio={
          <Vacio
            icono={<ClipboardList />}
            titulo={`${producto.nombre} no tiene receta.`}
            explicacion="Sin receta no sabemos cuánto cuesta ni cuánto ganas con ella."
            accion={
              <Button
                variant="outline"
                onClick={() => {
                  campoDeInsumo.current?.focus();
                }}
              >
                <Plus aria-hidden="true" />
                Agregar el primer ingrediente
              </Button>
            }
          />
        }
      />
    </>
  );
}

function EtiquetaDeCanal({ canal }: { readonly canal: 'ambos' | 'aqui' | 'llevar' }) {
  const etiqueta = CANALES.find((c) => c.clave === canal)?.etiqueta ?? 'Siempre';
  if (canal === 'ambos') return <span className="text-texto-sutil">{etiqueta}</span>;
  // El empaque se ve distinto: es la línea que sólo cuesta cuando el pedido sale.
  return (
    <Badge variant="outline">
      {canal === 'llevar' ? <ShoppingBag aria-hidden="true" /> : null}
      {etiqueta}
    </Badge>
  );
}

/** Lo que cuesta en cada canal, y lo que deja: el margen es lo que va grande. */
function CostoPorCanal({
  precio,
  aqui,
  llevar,
}: {
  readonly precio: number;
  readonly aqui: number;
  readonly llevar: number;
}) {
  return (
    <div className="flex flex-col gap-(--espacio-2)">
      <div className="grid grid-cols-2 gap-(--espacio-4)">
        <MargenDeCanal etiqueta="Aquí cuesta" costo={aqui} precio={precio} />
        <MargenDeCanal etiqueta="Para llevar cuesta" costo={llevar} precio={precio} />
      </div>
      <p className="text-sm text-texto-sutil">
        La diferencia es el empaque. Cargarlo siempre infla el costo de lo que se toma aquí; no
        cargarlo nunca regala cinco pesos por bebida.
      </p>
    </div>
  );
}

function MargenDeCanal({
  etiqueta,
  costo,
  precio,
}: {
  readonly etiqueta: string;
  readonly costo: number;
  readonly precio: number;
}) {
  const margen = margenDe(precio, costo);
  const semaforo = margen === null ? null : semaforoDe(margen);
  return (
    <div className="flex flex-col gap-(--espacio-1)">
      <p className="text-sm text-texto-sutil">
        {etiqueta} <Dinero centavos={costo} tamano="lg" className="font-semibold text-texto" />
      </p>
      {margen === null || semaforo === null ? (
        <p className="text-sm text-texto-sutil">Sin precio de venta no hay margen que medir.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-(--espacio-2)">
            <Cifra valor={margen} unidad="%" tamano="total" className="font-bold" />
            <span className="text-sm text-texto-sutil">de margen</span>
          </p>
          <p
            className={`flex w-fit items-center gap-(--espacio-1) rounded-md px-(--espacio-2) py-(--espacio-1) text-xs font-medium ${semaforo.clase}`}
          >
            <semaforo.Icono aria-hidden="true" className="size-3.5" />
            {semaforo.palabra}
          </p>
        </>
      )}
    </div>
  );
}

interface FormularioDeLineaProps {
  readonly insumos: readonly InsumoDisponible[];
  readonly nueva: NuevaLinea;
  readonly ocupado: boolean;
  readonly campoDeInsumo: RefObject<HTMLSelectElement | null>;
  readonly alCambiar: (nueva: NuevaLinea) => void;
  readonly alAgregar: () => void;
}

/** La acción principal de la pantalla: agregar un ingrediente. */
function FormularioDeLinea({
  insumos,
  nueva,
  ocupado,
  campoDeInsumo,
  alCambiar,
  alAgregar,
}: FormularioDeLineaProps) {
  const unidad = insumos.find((i) => i.id === nueva.insumoId)?.unidad_base;
  return (
    <form
      aria-label="Agregar un ingrediente"
      onSubmit={(evento) => {
        // El formulario es para que Enter en la cantidad agregue; la página no se va.
        evento.preventDefault();
        alAgregar();
      }}
      className="grid gap-(--espacio-3) border-t border-borde pt-(--espacio-4) sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end"
    >
      {insumos.length === 0 ? (
        <Aviso
          tono="atencion"
          titulo="Todavía no hay ingredientes dados de alta"
          className="sm:col-span-3"
          accion={
            <Button asChild variant="outline">
              <a href="/cafeteria/inventario">Ir al inventario</a>
            </Button>
          }
        >
          Una receta se arma con los ingredientes del inventario.
        </Aviso>
      ) : null}
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="insumo">Ingrediente</Label>
        <select
          id="insumo"
          ref={campoDeInsumo}
          className={CAMPO_DE_LISTA}
          value={nueva.insumoId}
          onChange={(evento) => {
            alCambiar({ ...nueva, insumoId: evento.target.value });
          }}
        >
          <option value="">Elige…</option>
          {insumos.map((insumo) => (
            <option key={insumo.id} value={insumo.id}>
              {insumo.nombre} ({insumo.unidad_base})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="cantidad">
          Cantidad{' '}
          {unidad === undefined ? null : <span className="text-texto-sutil">en {unidad}</span>}
        </Label>
        <Input
          id="cantidad"
          inputMode="decimal"
          className="text-right font-numeros tabular-nums"
          value={nueva.cantidad}
          onChange={(evento) => {
            alCambiar({ ...nueva, cantidad: evento.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="canal">Cuándo</Label>
        <select
          id="canal"
          className={CAMPO_DE_LISTA}
          value={nueva.canal}
          onChange={(evento) => {
            alCambiar({ ...nueva, canal: evento.target.value });
          }}
        >
          {CANALES.map((canal) => (
            <option key={canal.clave} value={canal.clave}>
              {canal.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={ocupado} className="sm:col-span-3 sm:justify-self-end">
        <Plus aria-hidden="true" />
        Agregar a la receta
      </Button>
    </form>
  );
}
