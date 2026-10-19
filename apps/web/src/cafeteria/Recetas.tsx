'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
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
import { ClipboardList, CupSoda, Plus, ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import { CostoPorCanal, ImporteSiSeSabe } from './CostoPorCanal.tsx';
import { FormularioDeLinea } from './FormularioDeLinea.tsx';
import {
  CAMPO_DE_LISTA,
  CANALES,
  LINEA_EN_BLANCO,
  canalDe,
  costoDeLinea,
  costoEnCanal,
  lineasParaGuardar,
  precioDe,
  type InsumoDisponible,
  type LineaDeReceta,
  type NuevaLinea,
  type ProductoConReceta,
} from './receta-de-barra.ts';
import {
  gruposDeLaBebida,
  type GrupoDeLaBebida,
  type OpcionDeLaBebida,
} from './variantes-de-receta.ts';
import { VariantesDeLaReceta } from './VariantesDeLaReceta.tsx';

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
 * solo: cada tramo lleva su icono y su palabra. Y sin el costo de TODAS las líneas
 * no hay semáforo: se dice cuántas faltan. Contarlas como $0.00 pintaba de «margen
 * sano» cualquier bebida.
 *
 * ── La fila se convierte en panel ───────────────────────────────────────
 * En la terminal la lista de bebidas vive a la izquierda y la receta a la
 * derecha, lejos de la fila. Al tocar una bebida, su fila viaja hasta el panel
 * (`VIAJE.fila`): dice de quién es la receta sin leer el nombre. Dura lo que
 * diga la perilla de movimiento, y cero con la preferencia del sistema.
 *
 * ── Las variantes: la leche y el tamaño, con su costo (C.10 de la 2.4) ─
 * Cada línea dice qué grupo de opciones la CAMBIA —la leche entera, el grupo
 * «Leche»; el vaso, el grupo «Tamaño»— y debajo de la receta va la tabla de lo que
 * cuesta y deja la bebida con cada opción (`VariantesDeLaReceta`). La cuenta es la
 * misma función del dominio con la que el cobro descuenta el inventario, así que la
 * tabla no puede enseñar un latte de avena que el almacén no descuente.
 *
 * `merma_bp` no se enseña: vale cero en casi todas las líneas de una cafetería, y
 * un campo que siempre vale cero enseña a ignorar los campos. Pero SE CONSERVA: la
 * pantalla reenvía la receta entera al guardar, y reenviarla en cero borraba la que
 * hubiera. El escandallo de producción por lotes es de otro arquetipo (restaurante).
 */

const RUTA_GUARDAR = '/api/inventario/recetas';
// Quitar una línea es GUARDAR la receta sin ella: `inventario.eliminar_receta`
// borra la receta entera y archiva el producto, que no es lo que pide un
// ingrediente de menos. Ver `eliminar`.

const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;

/** Los decimales que una cantidad de receta puede traer: los del comando. */
const DECIMALES_MAXIMOS = 4;

export interface RecetasProps {
  readonly productosIniciales?: readonly ProductoConReceta[];
  readonly insumosIniciales?: readonly InsumoDisponible[];
}

/**
 * Cuántos decimales trae la cantidad, para no redondear 0.0125 kg a 0.01 kg: el
 * `'auto'` de `Cifra` se queda en dos y una receta admite cuatro.
 */
function decimalesDe(valor: number | null): number {
  if (valor === null) return 0;
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

/** Lo que se dice cuando una línea leída no trae cantidad y no se puede reenviar. */
const SIN_CANTIDAD = 'Una línea de esta receta llegó sin cantidad, y guardar sin ella la borraría.';

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
  const [opciones, setOpciones] = useState<readonly OpcionDeLaBebida[] | null>(null);
  const [falloDeOpciones, setFalloDeOpciones] = useState<string | null>(null);
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

  /**
   * Las opciones de la bebida: los grupos que pueden cambiar una línea y la tabla de
   * variantes. Van aparte de las líneas porque la receta sirve sin ellas.
   */
  function leerOpciones(productoId: string): void {
    consultarPuente<OpcionDeLaBebida>('Modificador', {
      filtro: { producto_id: productoId },
      limite: 100,
    })
      .then((filas) => {
        if (lineasDe.current === productoId) setOpciones(filas);
      })
      .catch((fallo: unknown) => {
        if (lineasDe.current !== productoId) return;
        setFalloDeOpciones(
          fallo instanceof Error ? fallo.message : 'No se pudieron leer las opciones.',
        );
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
    setOpciones(null);
    setFalloDeOpciones(null);
    setProblema(null);
    leerLineas(producto.id);
    leerOpciones(producto.id);
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
    const yaEstaban = lineasParaGuardar(lineas ?? []);
    if (yaEstaban === null) {
      setProblema({ tono: 'peligro', texto: SIN_CANTIDAD });
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
    const quedan = lineasParaGuardar((lineas ?? []).filter((l) => l.id !== linea.id));
    if (quedan === null) {
      setProblema({ tono: 'peligro', texto: SIN_CANTIDAD });
      return;
    }
    setOcupado(true);
    setProblema(null);
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

  /**
   * QUÉ GRUPO CAMBIA UNA LÍNEA: la leche entera la cambia «Leche». Es guardar la receta
   * entera con esa línea apuntando al grupo —el comando reemplaza la receta— y releer,
   * porque los identificadores de las líneas son nuevos.
   */
  function cambiarSustituto(linea: LineaDeReceta, grupoId: string | null): void {
    if (elegido === null) return;
    const todas = lineasParaGuardar(
      (lineas ?? []).map((l) =>
        l.id === linea.id ? { ...l, sustituible_por_grupo_id: grupoId } : l,
      ),
    );
    if (todas === null) {
      setProblema({ tono: 'peligro', texto: SIN_CANTIDAD });
      return;
    }
    setOcupado(true);
    setProblema(null);
    invocarComando(RUTA_GUARDAR, { productoId: elegido.id, ingredientes: todas })
      .then(() => {
        if (lineasDe.current !== elegido.id) return;
        leerLineas(elegido.id);
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
      orden: (producto) => precioDe(producto) ?? -1,
      celda: (producto) => <ImporteSiSeSabe centavos={precioDe(producto)} tamano="sm" />,
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
              Se vende a <ImporteSiSeSabe centavos={precioDe(elegido)} tamano="base" />
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
            grupos={gruposDeLaBebida(opciones ?? [])}
            alQuitar={eliminar}
            alCambiarSustituto={cambiarSustituto}
            alReintentar={reintentarLineas}
            campoDeInsumo={campoDeInsumo}
          />

          {lineas === null || lineas.length === 0 || falloDeLineas !== null ? null : (
            <VariantesDeLaReceta
              lineas={lineas}
              opciones={opciones}
              falloDeOpciones={falloDeOpciones}
              insumos={insumos}
              precioCentavos={precioDe(elegido)}
            />
          )}

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
  /** Los grupos de opciones de la bebida: los que pueden cambiar una línea. */
  readonly grupos: readonly GrupoDeLaBebida[];
  readonly alQuitar: (linea: LineaDeReceta) => void;
  readonly alCambiarSustituto: (linea: LineaDeReceta, grupoId: string | null) => void;
  readonly alReintentar: () => void;
  readonly campoDeInsumo: RefObject<HTMLSelectElement | null>;
}

/** El costo por canal y las líneas: lo que se lee de la receta, en sus tres estados. */
function ContenidoDeReceta({
  producto,
  lineas,
  fallo,
  ocupado,
  grupos,
  alQuitar,
  alCambiarSustituto,
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

  const precio = precioDe(producto);

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
          valor={linea.cantidad_convertida_unidad_base}
          unidad={linea.unidad}
          decimales={decimalesDe(linea.cantidad_convertida_unidad_base)}
          tamano="sm"
        />
      ),
    },
    {
      clave: 'canal',
      titulo: 'Cuándo',
      celda: (linea) => <EtiquetaDeCanal canal={canalDe(linea.aplica_canal)} />,
    },
    ...(grupos.length === 0
      ? []
      : [
          {
            clave: 'cambia',
            titulo: 'La cambia',
            desde: 'md' as const,
            celda: (linea: LineaDeReceta) => (
              <select
                aria-label={`Qué opción cambia ${linea.ingrediente_nombre ?? 'esta línea'}`}
                className={CAMPO_DE_LISTA}
                disabled={ocupado}
                value={linea.sustituible_por_grupo_id ?? ''}
                onChange={(evento) => {
                  alCambiarSustituto(
                    linea,
                    evento.target.value === '' ? null : evento.target.value,
                  );
                }}
              >
                <option value="">Ninguna</option>
                {grupos.map((grupo) => (
                  <option key={grupo.grupoId} value={grupo.grupoId}>
                    {grupo.nombre}
                  </option>
                ))}
              </select>
            ),
          },
        ]),
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      celda: (linea) => <ImporteSiSeSabe centavos={costoDeLinea(linea)} tamano="sm" />,
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
