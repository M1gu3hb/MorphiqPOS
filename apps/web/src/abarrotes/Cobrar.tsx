'use client';

import type { LayoutEanInterno } from '@morphiqpos/domain/catalogo';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
} from '@morphiqpos/ui/sistema';
import { Check, PackagePlus, ScanBarcode, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { AvisoSinConexion, useEnLinea } from '~/cliente/en-linea';
import { pitar } from '~/cliente/pitido';
import { useVocabulario } from '~/cliente/vocabulario';

import { AltaRapida, type ProductoDadoDeAlta } from './AltaRapida.tsx';
import { AbonoRapido } from './cobro/AbonoRapido.tsx';
import { AvisoDelCobro, type AvisoDeCobro } from './cobro/Avisos.tsx';
import {
  CobroEnReposo,
  CobroExpandido,
  Tecla,
  accionDeTecla,
  type Metodo,
} from './cobro/BloqueDeCobro.tsx';
import {
  armarCatalogo,
  lineasDeRetomada,
  presentacionDeCobro,
  productoDeCobro,
  type PresentacionDelPuente,
  type ProductoDelPuente,
  type RenglonRetomado,
} from './cobro/catalogo.ts';
import { columnasDeLaVenta } from './cobro/columnas.tsx';
import { ElegirCliente, type ClienteDelCobro } from './cobro/ElegirCliente.tsx';
import { EnEspera } from './cobro/EnEspera.tsx';
import { layoutDeLaConfiguracion, resolverCodigo } from './cobro/escaneo.ts';
import {
  articulosDe,
  conCantidad,
  conGranel,
  conPresentacion,
  conProducto,
  ivaIncluido,
  paraElServidor,
  totalDe,
  type LineaDeVenta,
  type ProductoDeCobro,
} from './cobro/lineas.ts';
import { TECLAS_RAPIDAS, TeclasRapidas, teclaDe } from './cobro/TeclasRapidas.tsx';

/**
 * PANTALLA · abarrotes · cobrar
 *
 * El 90% del uso del sistema: 50 a 400 veces al día, siempre con fila detrás.
 *
 * ── Por qué el TOTAL es lo más grande de toda la aplicación ──────────────
 * Porque **el cliente también lo lee, desde el otro lado del mostrador**, y porque decirlo
 * en voz alta mientras se escanea es lo que hace avanzar la fila.
 *
 * ── Por qué no hay botón de «agregar» ────────────────────────────────────
 * Escanear es el estado por omisión, no una acción. La captura vive en la ventana y no en un
 * input, así que el foco **no se puede perder**. Lector y humano se separan por el RITMO
 * —ocho o más caracteres a menos de 35 ms terminados en Enter—. Sin *cooldown*: seis
 * refrescos iguales son seis lecturas y `× 6` en UNA línea.
 *
 * ── Lo que canta el lector (`cobro/escaneo.ts`) ──────────────────────────
 * Un producto; la CAJA de 24 por el código de su presentación (F-147), que entra como
 * «1 caja (24 pz)» a su precio y descuenta 24; una ETIQUETA de la báscula (F-148), que entra
 * como su pesada ya resuelta —si el negocio declaró cómo etiqueta su báscula, en Productos—;
 * o nada del catálogo: dos tonos que bajan y el ALTA RÁPIDA encima, con el código ya puesto.
 *
 * ── Tres canales, porque hay ruido ───────────────────────────────────────
 * El pitido (`cliente/pitido.ts`), la línea resaltada un segundo y el nombre en la barra de
 * estado. El color nunca va solo.
 *
 * ── El teclado ───────────────────────────────────────────────────────────
 * F12 efectivo, F9 tarjeta, F10 transferencia, F11 fiado, F2 al buscador, F4 el cliente del
 * fiado, F6 apartar o retomar, F7 un abono, Supr deshace la última línea, + / − la cantidad
 * y Esc empieza de nuevo. Los ocho de siempre llevan su tecla donde está libre —F1, F3, F5 y
 * F8— porque F2, F4, F6 y F7 ya son acciones (D-21).
 *
 * ── El fiado ─────────────────────────────────────────────────────────────
 * F11 va a nombre de alguien: sin cliente, pide elegirlo (F4) antes de confirmar. La venta
 * suma a ventas y no al cajón, y la deuda queda escrita en la misma transacción del cobro.
 *
 * ── Sin conexión ─────────────────────────────────────────────────────────
 * No hay cola, por decisión (A-27, F-988 en EXCEPCIONES): sin red la pantalla lo DICE
 * —«Sin internet. No se puede cobrar»— y CONFIRMAR no se deja pulsar.
 */

/** Un lector escribe cada carácter en menos de esto; una mano, jamás. */
const MS_ENTRE_TECLAS = 35;
/** Ocho dígitos es el EAN-8 más corto: debajo hay alguien tecleando. */
const LARGO_MINIMO_CODIGO = 8;
/** Lo que dura el resaltado de la línea recién escaneada. */
const MS_DESTACADO = 1000;

/** Lo que `caja.estado` contesta, y lo único que esta pantalla necesita de él. */
interface EstadoDeLaCaja {
  readonly abierta: boolean;
  readonly sesionCajaId: string | null;
}

type Panel =
  | { readonly tipo: 'alta'; readonly codigo: string }
  | { readonly tipo: 'cliente' }
  | { readonly tipo: 'abono' }
  | { readonly tipo: 'espera' };

const TITULOS: Readonly<Record<Exclude<Panel['tipo'], 'alta'>, readonly [string, string]>> = {
  cliente: ['A quién', 'El fiado va a nombre de alguien: elígelo antes de cobrar.'],
  abono: ['Abono de fiado', 'Entra a su cuenta, no a la venta.'],
  espera: ['Apartar o retomar', 'La venta apartada se retoma con su número.'],
};

export interface CobrarProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly productosIniciales?: readonly ProductoDelPuente[];
  readonly presentacionesIniciales?: readonly PresentacionDelPuente[];
  readonly cajaAbiertaInicial?: boolean;
  readonly onCobrado?: (ventaId: string) => void;
}

interface Lectura {
  readonly productos: readonly ProductoDeCobro[];
  readonly presentaciones: readonly ReturnType<typeof presentacionDeCobro>[];
  readonly cajaAbierta: boolean;
}

export function Cobrar({
  productosIniciales,
  presentacionesIniciales,
  cajaAbiertaInicial,
  onCobrado,
}: CobrarProps) {
  const enLinea = useEnLinea();
  const voc = useVocabulario();
  const router = useRouter();
  const [lectura, setLectura] = useState<Lectura | null>(
    productosIniciales === undefined
      ? null
      : {
          productos: productosIniciales.map(productoDeCobro),
          presentaciones: (presentacionesIniciales ?? []).map(presentacionDeCobro),
          cajaAbierta: cajaAbiertaInicial ?? true,
        },
  );
  const [bascula, setBascula] = useState<LayoutEanInterno | null>(null);
  const [masVendidos, setMasVendidos] = useState<readonly string[]>([]);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [lineas, setLineas] = useState<readonly LineaDeVenta[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [destacada, setDestacada] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [recibido, setRecibido] = useState<number | null>(null);
  const [cliente, setCliente] = useState<ClienteDelCobro | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [aviso, setAviso] = useState<AvisoDeCobro | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  // La ráfaga del lector no es estado de la vista: repintar en cada tecla costaría un
  // render por carácter, trece por producto escaneado.
  const racha = useRef({ texto: '', ultima: 0 });
  const hayLineas = lineas.length > 0;

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    /**
     * LA CAJA SE PREGUNTA A `/api/caja/estado`, NO AL PUENTE: una sesión de caja es de UNA
     * terminal, y `venta.cobrar` exige la de ésta. Leer «la primera caja abierta del negocio»
     * dejaba armar la venta con la caja de la otra terminal abierta y el servidor contestaba
     * «Abre la caja» al confirmar.
     */
    Promise.all([
      consultarPuente<ProductoDelPuente>('ProductoTerminado', {
        limite: 2000,
        signal: control.signal,
      }),
      consultarPuente<PresentacionDelPuente>('Presentacion', {
        filtro: { activa: true },
        limite: 2000,
        signal: control.signal,
      }),
      invocarComando<EstadoDeLaCaja>('/api/caja/estado', {}, { signal: control.signal }),
    ])
      .then(([productos, presentaciones, caja]) => {
        if (!sigueMontada()) return;
        setLectura({
          productos: productos.map(productoDeCobro),
          presentaciones: presentaciones.map(presentacionDeCobro),
          cajaAbierta: caja.abierta,
        });
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
      });
    // La báscula y los ocho de siempre AYUDAN a cobrar; si no se leen, se cobra igual.
    consultarPuente<Record<string, unknown>>('ConfiguracionNegocio', {
      limite: 1,
      signal: control.signal,
    })
      .then(([config]) => {
        if (sigueMontada()) setBascula(layoutDeLaConfiguracion(config?.['bascula_etiqueta']));
      })
      .catch(() => undefined);
    invocarComando<{ productos: readonly { productoId: string }[] }>(
      '/api/venta/mas-vendidos',
      {},
      { signal: control.signal },
    )
      .then((respuesta) => {
        if (sigueMontada()) setMasVendidos(respuesta.productos.map((p) => p.productoId));
      })
      .catch(() => undefined);
    return () => {
      control.abort();
    };
  }, [productosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setLectura(null);
    setIntento((previo) => previo + 1);
  }

  useEffect(() => {
    if (destacada === null) return;
    const reloj = setTimeout(() => {
      setDestacada(null);
    }, MS_DESTACADO);
    return () => {
      clearTimeout(reloj);
    };
  }, [destacada]);

  const catalogo = useMemo(
    () => armarCatalogo(lectura?.productos ?? [], lectura?.presentaciones ?? []),
    [lectura],
  );
  const rapidos = useMemo(
    () =>
      masVendidos
        .map((id) => catalogo.porId.get(id))
        .filter((p): p is ProductoDeCobro => p !== undefined)
        .slice(0, TECLAS_RAPIDAS.length),
    [masVendidos, catalogo],
  );

  /** Una línea nueva o una más: el pitido, el resaltado y la barra de estado, juntos. */
  const alAgregar = useCallback((nuevas: readonly LineaDeVenta[], nombre: string) => {
    const ultima = nuevas.at(-1);
    setLineas(nuevas);
    setDestacada(ultima?.clave ?? null);
    setUltimo(nombre);
    setAviso(null);
    setBusqueda('');
    pitar('agregado');
  }, []);

  const agregar = useCallback(
    (producto: ProductoDeCobro) => {
      setLineas((previas) => {
        const nuevas = conProducto(previas, producto);
        queueMicrotask(() => {
          alAgregar(nuevas, producto.nombre);
        });
        return nuevas;
      });
    },
    [alAgregar],
  );

  /** Lo que cantó el lector, resuelto: producto, caja, pesada, o nada del catálogo. */
  const escaneado = useCallback(
    (codigo: string) => {
      const leido = resolverCodigo(codigo, catalogo, bascula);
      if (leido.tipo === 'producto') {
        agregar(leido.producto);
      } else if (leido.tipo === 'presentacion') {
        alAgregar(
          conPresentacion(lineas, leido.producto, leido.presentacion),
          leido.producto.nombre,
        );
      } else if (leido.tipo === 'pesada') {
        alAgregar(
          conGranel(lineas, leido.producto, leido.cantidad, leido.unidad),
          leido.producto.nombre,
        );
      } else if (leido.tipo === 'malLeido') {
        pitar('desconocido');
        setAviso({ tipo: 'malLeido', motivo: leido.motivo });
      } else {
        // No un `toast` que se va solo: el alta rápida, encima, con el código ya puesto.
        pitar('desconocido');
        setPanel({ tipo: 'alta', codigo: leido.codigo });
      }
    },
    [agregar, alAgregar, bascula, catalogo, lineas],
  );

  /** Lo que F2 encuentra: el primero que coincide, para agregarlo con Enter. */
  const hallazgo = useMemo(() => {
    const aguja = busqueda.trim().toLocaleLowerCase('es-MX');
    if (aguja === '') return undefined;
    return (lectura?.productos ?? []).find((p) =>
      p.nombre.toLocaleLowerCase('es-MX').includes(aguja),
    );
  }, [lectura, busqueda]);

  /** F11 sin cliente pide el cliente primero; con él, abre el cobro a fiado. */
  const elegirMetodo = useCallback(
    (elegido: Metodo) => {
      if (!hayLineas) return;
      setMetodo(elegido);
      if (elegido === 'fiado' && cliente === null) setPanel({ tipo: 'cliente' });
    },
    [cliente, hayLineas],
  );

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      // Con un diálogo abierto, el teclado es suyo.
      if (panel !== null) return;
      const previo = racha.current;
      const enCampo =
        evento.target instanceof HTMLInputElement || evento.target instanceof HTMLTextAreaElement;

      if (evento.key === 'Enter') {
        racha.current = { texto: '', ultima: 0 };
        if (metodo !== null || previo.texto.length < LARGO_MINIMO_CODIGO) return;
        evento.preventDefault();
        escaneado(previo.texto);
        return;
      }
      if (evento.key.length === 1) {
        // El ritmo se mide SIEMPRE, también con el foco dentro de un campo.
        const seguida = evento.timeStamp - previo.ultima < MS_ENTRE_TECLAS;
        racha.current = {
          texto: seguida ? previo.texto + evento.key : evento.key,
          ultima: evento.timeStamp,
        };
        // Un código de barras no trae signos: esto nunca pisa un escaneo.
        if (!enCampo && (evento.key === '+' || evento.key === '-')) {
          setLineas((previas) => {
            const fin = previas.at(-1);
            return fin === undefined
              ? previas
              : conCantidad(previas, fin.clave, evento.key === '+' ? 1 : -1);
          });
        }
        return;
      }
      const rapido = TECLAS_RAPIDAS.findIndex((t, i) => t === evento.key && teclaDe(i) !== null);
      if (rapido !== -1 && metodo === null) {
        const producto = rapidos[rapido];
        evento.preventDefault();
        if (producto !== undefined) agregar(producto);
        return;
      }
      if (evento.key === 'Escape') {
        setMetodo(null);
        setLineas([]);
        setRecibido(null);
      } else if (evento.key === 'Delete' && !enCampo) {
        // Supr DESHACE la última línea: el error se corrige, no se previene.
        setLineas((previas) => previas.slice(0, -1));
      } else if (evento.key === 'F2') {
        evento.preventDefault();
        campo.current?.focus();
      } else if (evento.key === 'F6') {
        evento.preventDefault();
        setPanel({ tipo: 'espera' });
      } else if (evento.key === 'F7') {
        evento.preventDefault();
        setPanel({ tipo: 'abono' });
      } else {
        // Las teclas del cobro —F12, F9, F10, F11 y F4— se resuelven JUNTO a donde se
        // imprimen (`BloqueDeCobro`), con la misma guarda que su botón.
        const accion = accionDeTecla(evento);
        if (accion === null) return;
        evento.preventDefault();
        if (accion.tipo === 'cliente') setPanel({ tipo: 'cliente' });
        else elegirMetodo(accion.metodo);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [agregar, elegirMetodo, escaneado, metodo, panel, rapidos]);

  const total = totalDe(lineas);

  /**
   * Un solo viaje (`/api/venta/cobrar-mostrador`). El total viaja para que el servidor RECHACE
   * si no coincide con el suyo —cobrar un número distinto del que ya se dijo en voz alta es
   * peor que fallar— y la clave de idempotencia la pone `invocarComando`: un doble Enter no
   * cobra dos veces.
   */
  async function confirmar(): Promise<void> {
    // Sin red no se cobra (F-988): ni con el botón —deshabilitado— ni con Enter.
    if (!enLinea || metodo === null) return;
    if (metodo === 'fiado' && cliente === null) {
      setPanel({ tipo: 'cliente' });
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const venta = await invocarComando<{ ventaId: string }>('/api/venta/cobrar-mostrador', {
        metodo,
        totalEsperadoCentavos: total,
        recibidoCentavos: metodo === 'efectivo' ? (recibido ?? 0) : total,
        ...(metodo === 'fiado' && cliente !== null ? { clienteId: cliente.id } : {}),
        lineas: paraElServidor(lineas),
      });
      setLineas([]);
      setRecibido(null);
      setMetodo(null);
      setUltimo(null);
      // El cliente era de ESTA venta: la siguiente empieza sin nadie.
      setCliente(null);
      onCobrado?.(venta.ventaId);
    } catch (fallo) {
      // La venta NO se pierde nunca: la lista sigue ahí y sólo se dice qué pasó.
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cobrar. No se cobró nada.');
    } finally {
      setEnviando(false);
    }
  }

  /** El alta rápida guardó: se lee su ficha del puente —con SU precio— y entra a la venta. */
  async function alDarDeAlta(producto: ProductoDadoDeAlta): Promise<void> {
    setPanel(null);
    try {
      const [fila] = await consultarPuente<ProductoDelPuente>('ProductoTerminado', {
        filtro: { id: producto.productoId },
        limite: 1,
      });
      if (fila === undefined) return;
      const nuevo = productoDeCobro(fila);
      setLectura((previa) =>
        previa === null ? previa : { ...previa, productos: [...previa.productos, nuevo] },
      );
      agregar(nuevo);
    } catch {
      setError(`«${producto.nombre}» quedó dado de alta; escanéalo otra vez para agregarlo.`);
    }
  }

  function alRetomar(renglones: readonly RenglonRetomado[], codigo: string): void {
    const { lineas: recuperadas, perdidos } = lineasDeRetomada(renglones, catalogo);
    setPanel(null);
    setLineas(recuperadas);
    setAviso({ tipo: 'retomada', codigo, perdidos });
  }

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo="No se pudo leer el catálogo ni la caja"
          queHacer="Sin el catálogo no se reconoce ningún código, y sin la caja no se sabe a qué corte pertenece lo que se cobra. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  if (lectura === null) return <EsqueletoDelCobro />;

  if (!lectura.cajaAbierta) {
    // UN MURO, no un vacío. La acción va DEBAJO del motivo.
    return (
      <div className="mx-auto max-w-xl px-(--espacio-4) py-(--espacio-12)">
        <Aviso tono="atencion" titulo="La caja está cerrada">
          <p>
            {`${voc.conDeterminante('un', 'orden')} sin caja no pertenece a ningún corte: al terminar el día no habría contra qué cuadrarl${voc.terminacion('orden')}.`}
          </p>
          <Button asChild className="mt-(--espacio-3)">
            <a href="/abarrotes/caja">Ábrela para empezar a vender</a>
          </Button>
        </Aviso>
      </div>
    );
  }

  if (lectura.productos.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-4)">
        <Vacio
          icono={<PackagePlus />}
          titulo="Todavía no hay nada que escanear."
          explicacion={`Esta pantalla vive del código de barras: en cuanto el catálogo tenga ${voc.plural('producto')} con su código y su precio, pasar el lector por uno lo pone en la lista y lo cobra.`}
          accion={
            <Button asChild>
              <a href="/abarrotes/alta-rapida-de-producto">Dar de alta el primero</a>
            </Button>
          }
        />
      </div>
    );
  }

  const columnas = columnasDeLaVenta(voc, (quitar) => {
    setLineas((previas) =>
      quitar.granel
        ? previas.filter((l) => l.clave !== quitar.clave)
        : conCantidad(previas, quitar.clave, -1),
    );
  });

  const piezas = articulosDe(lineas);

  return (
    // FLEX en teléfono, rejilla de tablet para arriba: en una rejilla lo pegajoso sólo se
    // pega dentro de su celda, y el total no se quedaba arriba.
    <div className="flex flex-col gap-(--espacio-3) p-(--espacio-3) pb-56 md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:grid-rows-[auto_1fr_auto] md:pb-48 xl:grid-cols-[minmax(0,1fr)_26rem] xl:pb-(--espacio-3)">
      <h1 className="sr-only">Cobrar</h1>
      {enLinea ? null : <AvisoSinConexion className="md:col-span-2" />}

      {/* PRIMARIO · el total. */}
      <Superficie
        nivel={2}
        relleno={4}
        como="section"
        aria-label={`Total de ${voc.enFrase('orden')}`}
        className="sticky top-0 z-20 flex flex-col items-center gap-(--espacio-1) text-center md:static md:col-start-2 md:row-start-1 md:self-start md:shadow-1"
      >
        <p className="text-xs font-medium tracking-widest text-texto-sutil uppercase">Total</p>
        <Dinero centavos={total} tamano="total" className="leading-none" />
        {/* En teléfono desaparecen el desglose y el conteo: ahí no se vende. */}
        <p className="mt-(--espacio-2) hidden items-baseline justify-center gap-(--espacio-4) text-sm text-texto-sutil md:flex">
          <Cifra valor={piezas} unidad={piezas === 1 ? 'artículo' : 'artículos'} tamano="sm" />
          <span className="inline-flex items-baseline gap-(--espacio-1)">
            IVA incluido <Dinero centavos={ivaIncluido(total)} tamano="sm" />
          </span>
        </p>
      </Superficie>

      {/* SECUNDARIO · la lista, con el campo de búsqueda encima. */}
      <section
        aria-label={`${voc.titulo('orden')} en curso`}
        className="flex min-w-0 flex-col gap-(--espacio-2) md:col-start-1 md:row-span-2 md:row-start-1"
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="cobrar-busqueda">Código o nombre · F2</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              id="cobrar-busqueda"
              ref={campo}
              value={busqueda}
              placeholder={`${voc.conArticulo('producto')} sin código, o el que no leyó`}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' && hallazgo !== undefined) agregar(hallazgo);
              }}
              className="pl-(--espacio-10)"
            />
          </div>
          {hallazgo !== undefined && (
            <p className="flex items-baseline justify-between gap-(--espacio-2) text-sm text-texto-sutil">
              <span>Enter agrega: {hallazgo.nombre}</span>
              <Dinero centavos={hallazgo.precioCentavos} tamano="sm" />
            </p>
          )}
        </div>

        <AvisoDelCobro aviso={aviso} />

        {/* Crece hacia abajo: nunca un scroll automático que mueva las de arriba. */}
        <Tabla
          etiqueta={`Artículos de ${voc.enFrase('orden')}`}
          columnas={columnas}
          filas={lineas}
          claveDe={(linea) => linea.clave}
          // La recién escaneada es la fila activa durante un segundo.
          {...(destacada === null ? {} : { activa: destacada })}
          alto="max-h-[50vh] md:max-h-[60vh] xl:max-h-[68vh]"
          vacio={
            <Superficie
              nivel={0}
              relleno={0}
              className="flex min-h-64 items-center justify-center border-dashed"
            >
              <Vacio
                icono={<ScanBarcode />}
                titulo={`Escanea el primer ${voc.singular('producto')}`}
                explicacion="El lector ya está escuchando: no hay nada que tocar."
              />
            </Superficie>
          }
        />

        <TeclasRapidas productos={rapidos} onElegir={agregar} />
      </section>

      {/* TERCIARIO · el cobro. En PC es la columna derecha; de tablet para abajo, la franja
          fija del borde inferior, a la altura del pulgar. */}
      <Superficie
        como="aside"
        nivel={3}
        radio="sm"
        relleno={3}
        aria-label="Cobro"
        className="fixed inset-x-0 bottom-0 z-20 rounded-none xl:static xl:col-start-2 xl:row-start-2 xl:self-start xl:rounded-lg xl:shadow-1"
      >
        <div className="flex w-full flex-col gap-(--espacio-2) md:mx-auto md:max-w-3xl xl:max-w-none">
          {/* El error vive EN el bloque de cobro, donde se estaba mirando. */}
          {error !== null && (
            <Aviso tono="peligro" titulo={error}>
              {`${voc.conArticulo('orden')} sigue complet${voc.terminacion('orden')} en la lista: no se perdió nada.`}
            </Aviso>
          )}
          {metodo === null ? (
            <CobroEnReposo hayLineas={hayLineas} onElegir={elegirMetodo} />
          ) : (
            <CobroExpandido
              metodo={metodo}
              total={total}
              recibido={recibido}
              onRecibido={setRecibido}
              cliente={cliente}
              onElegirCliente={() => {
                setPanel({ tipo: 'cliente' });
              }}
              enLinea={enLinea}
              enviando={enviando}
              onConfirmar={() => {
                void confirmar();
              }}
              onRegresar={() => {
                setMetodo(null);
              }}
            />
          )}
        </div>
      </Superficie>

      {/* CUATERNARIO · el único informativo permitido, y sólo porque confirma que el
          escaneo funcionó: el tercer canal, el que se mira de reojo. */}
      <footer
        role="status"
        className="hidden items-center justify-between gap-(--espacio-3) border-t border-borde pt-(--espacio-2) text-xs text-texto-sutil md:col-span-2 md:row-start-3 md:flex"
      >
        <span className="inline-flex items-center gap-(--espacio-2)">
          Caja abierta ·{' '}
          <button
            type="button"
            className="inline-flex items-center gap-(--espacio-1) underline-offset-2 hover:underline"
            onClick={() => {
              setPanel({ tipo: 'cliente' });
            }}
          >
            Cliente: {cliente?.nombre ?? '—'}
          </button>
          ·
          <button
            type="button"
            className="inline-flex items-center gap-(--espacio-1) underline-offset-2 hover:underline"
            onClick={() => {
              setPanel({ tipo: 'espera' });
            }}
          >
            Apartar <Tecla>F6</Tecla>
          </button>
          ·
          <button
            type="button"
            className="inline-flex items-center gap-(--espacio-1) underline-offset-2 hover:underline"
            onClick={() => {
              setPanel({ tipo: 'abono' });
            }}
          >
            Abono <Tecla>F7</Tecla>
          </button>
        </span>
        {ultimo === null ? (
          <span>Sin escaneos todavía</span>
        ) : (
          <span className="inline-flex items-center gap-(--espacio-1)">
            Últ: <span className="font-medium text-texto">{ultimo}</span>
            <Check aria-hidden="true" className="size-4 text-exito" />
          </span>
        )}
      </footer>

      {panel?.tipo === 'alta' ? (
        <AltaRapida
          enCapa
          codigoInicial={panel.codigo}
          onGuardado={(producto) => {
            void alDarDeAlta(producto);
          }}
          onCancelar={() => {
            setPanel(null);
          }}
          onAgregarPresentacion={(productoId) => {
            router.push(`/abarrotes/producto?producto=${encodeURIComponent(productoId)}`);
          }}
        />
      ) : null}

      <Dialog
        open={panel !== null && panel.tipo !== 'alta'}
        onOpenChange={(abierto) => {
          if (!abierto) setPanel(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          {panel === null || panel.tipo === 'alta' ? null : (
            <>
              <DialogHeader>
                <DialogTitle>{TITULOS[panel.tipo][0]}</DialogTitle>
                <DialogDescription>{TITULOS[panel.tipo][1]}</DialogDescription>
              </DialogHeader>
              {panel.tipo === 'cliente' ? (
                <ElegirCliente
                  importe={total}
                  onElegir={(elegido) => {
                    setCliente(elegido);
                    setPanel(null);
                  }}
                />
              ) : panel.tipo === 'abono' ? (
                <AbonoRapido
                  onListo={(abono) => {
                    setPanel(null);
                    setAviso({ tipo: 'abono', abono });
                  }}
                />
              ) : (
                <EnEspera
                  lineas={lineas}
                  onApartada={(codigo) => {
                    setPanel(null);
                    setLineas([]);
                    setMetodo(null);
                    setCliente(null);
                    setAviso({ tipo: 'apartada', codigo });
                  }}
                  onRetomada={alRetomar}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Esqueletos con la forma de la venta, no un spinner: el total a la derecha, el campo y los
 * renglones del ticket a la izquierda. Así nada salta al llegar el catálogo.
 */
function EsqueletoDelCobro() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Leyendo el catálogo y la caja"
      className="grid gap-(--espacio-3) p-(--espacio-3) md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
    >
      <div className="flex flex-col gap-(--espacio-3) md:col-start-2 md:row-start-1">
        <Esqueleto className="h-40 w-full rounded-lg" />
        <Esqueleto className="hidden h-48 w-full rounded-lg xl:block" />
      </div>
      <div className="flex flex-col gap-(--espacio-2) md:col-start-1 md:row-start-1">
        <Esqueleto className="h-(--altura-control) w-full" />
        {Array.from({ length: 6 }, (_, indice) => (
          <div key={indice} className="flex items-center gap-(--espacio-3) py-(--espacio-1)">
            <Esqueleto className="h-4 w-8" />
            <Esqueleto className="h-4 flex-1" />
            <Esqueleto className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
