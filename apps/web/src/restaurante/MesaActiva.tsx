'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dialog, DialogContent, DialogTitle } from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Sheet, SheetContent, SheetTitle } from '@morphiqpos/ui/primitivas/sheet';
import {
  Aviso,
  BarraFija,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowLeft,
  ConciergeBell,
  Minus,
  Plus,
  Search,
  Send,
  Split,
  TriangleAlert,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { ViewTransition, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { consultarPuente, invocarComando, nuevaClave } from '~/cliente/api';
import { AnularLineaDialog } from './AnularLineaDialog';
import { DividirCuentaDialog } from './DividirCuentaDialog';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · mesa-activa
 *
 * La comanda. 80-200 veces al día por mesero. No es una pantalla nueva: es la
 * mesa, abierta. Jerarquía (`04-INTERFAZ`): ENVIAR A COCINA, lo pedido, el
 * catálogo y, al final, el total — el mesero no cobra.
 *
 * ── La mesa se expande a la cuenta ───────────────────────────────────────
 * La cabecera lleva `<ViewTransition>` con `VIAJE.mesa(id)`, el MISMO nombre que
 * la tesela de `MapaDeMesas`: la tesela crece hasta ser esta barra. Por eso se
 * pinta desde el primer instante, con el id de la dirección y antes de que llegue
 * la mesa: si naciera después, el navegador no tendría con quién emparejarla.
 *
 * ── «Cuenta actual» y «Agregar a la cuenta» son DOS bloques ──────────────
 * Lo mandado a cocina no se puede confundir con lo que está por mandarse: en una
 * sola lista el mesero reenvía platillos —el error más caro del turno—. Por eso
 * son dos tablas: la línea del borrador se quita, la enviada sólo se ANULA.
 *
 * ── «Listos para recoger» va arriba de todo ──────────────────────────────
 * Es información que CADUCA, y el catálogo no. Lleva el acento, el tinte con el
 * que el mapa pinta la mesa con la comida lista; fuera del panel viaja de
 * insignia en el encabezado.
 *
 * ── En tablet el pedido es una HOJA, no un panel lateral ─────────────────
 * El mesero sostiene la tablet con la izquierda y opera con el pulgar derecho:
 * el botón flotante vive en el borde inferior derecho. Y como con la hoja
 * cerrada no se ve el borrador, cada tesela lleva su cuenta en la esquina.
 *
 * ── Idempotencia y dinero ────────────────────────────────────────────────
 * Una clave por envío, que sólo se renueva cuando el envío triunfa: dos toques
 * no mandan dos comandas. El puente entrega pesos; se pasan a centavos contando
 * dígitos y se suma en centavos.
 *
 * ── Recortado, y queda dicho ─────────────────────────────────────────────
 * Fuera: las pestañas de categoría, la nota de la comanda, «Solicitar cuenta»
 * (pantalla propia: Precuenta), la mesa huérfana y el tiempo de servicio.
 * «Listos» entra por props hasta que el puente filtre la cocina por orden. Y no
 * van costos, márgenes, descuentos ni el cobro: esa separación es control interno.
 */

/** Un producto del catálogo. El puente entrega el dinero ya en pesos. */
export interface ProductoDeComanda {
  readonly id: string;
  readonly nombre: string;
  readonly precio_venta: number;
  /** Hoy el puente no expone existencia: llega por props hasta que la exponga. */
  readonly agotado?: boolean;
}
/** Una línea YA enviada a cocina: vive en el bloque de arriba, el intocable. */
export interface LineaEnviada {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: number;
  readonly total: number;
}
export interface MesaAbierta {
  /** Lo que el mapa pasa en la dirección, y lo que el comando pide para ABRIRLA. */
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly personas_actuales: number | null;
  readonly notas_alergias: string | null;
  readonly venta_activa_id: string | null;
}
export interface MesaActivaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly mesaInicial?: MesaAbierta;
  readonly productosIniciales?: readonly ProductoDeComanda[];
  readonly lineasIniciales?: readonly LineaEnviada[];
  /** Los nombres de lo que cocina ya dejó en la ventana. */
  readonly listosIniciales?: readonly string[];
}

type Vocabulario = ReturnType<typeof useVocabulario>;

/** Para cuántas personas se puede abrir, como mucho. */
const PERSONAS_MAXIMAS = 20;

/** El estado, como lo dice el salón (`04-INTERFAZ` §4.1): las palabras del mapa. */
const ESTADOS_DE_MESA: Readonly<Record<string, string>> = {
  libre: 'Libre',
  esperando_orden: 'Esperando orden',
  pedido_enviado: 'Pedido enviado',
  en_preparacion: 'En preparación',
  en_espera_entrega: 'Esperando entrega',
  ocupada: 'Ocupada',
  cuenta_solicitada: 'Cuenta solicitada',
  limpieza: 'Limpieza',
};

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number): number {
  if (!Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

const volverAlMapa = (): void => {
  window.history.back();
};

/** Lo ya enviado de una cuenta, o el fallo. Quien llama decide dónde se dice. */
type LecturaDeLoEnviado =
  | { readonly leidas: true; readonly lineas: readonly LineaEnviada[] }
  | { readonly leidas: false; readonly fallo: unknown };

const SIN_LINEAS: LecturaDeLoEnviado = { leidas: true, lineas: [] };

async function leerLoEnviado(
  ordenId: string,
  opciones: { readonly signal?: AbortSignal } = {},
): Promise<LecturaDeLoEnviado> {
  try {
    const filtro = { venta_id: ordenId };
    const lineas = await consultarPuente<LineaEnviada>('DetalleVenta', {
      filtro,
      limite: 120,
      ...opciones,
    });
    return { leidas: true, lineas };
  } catch (fallo: unknown) {
    return { leidas: false, fallo };
  }
}

/** Lo ya enviado: se lee, y se ANULA con motivo. Nunca se edita. */
function columnasDeLoEnviado(
  voc: Vocabulario,
  anular: (linea: LineaEnviada) => () => void,
): readonly ColumnaDeTabla<LineaEnviada>[] {
  return [
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (l) => (
        <span className="line-clamp-2">
          <span className="font-numeros font-semibold tabular-nums">{l.cantidad} ×</span>{' '}
          {l.producto_nombre}
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (l) => <Dinero centavos={aCentavos(l.total)} tamano="sm" />,
    },
    {
      clave: 'anular',
      titulo: '',
      celda: (l) => (
        <span className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Anular ${l.producto_nombre}`}
            onClick={anular(l)}
          >
            Anular
          </Button>
        </span>
      ),
    },
  ];
}

/** Lo que está por mandarse: se quita con el botón de su línea, se suma tocando. */
function columnasDelBorrador(
  voc: Vocabulario,
  cantidadDe: (producto: ProductoDeComanda) => number,
  tocar: (productoId: string, delta: number) => () => void,
): readonly ColumnaDeTabla<ProductoDeComanda>[] {
  return [
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      celda: (p) => (
        <span className="flex items-center gap-(--espacio-2)">
          <Button
            size="icon"
            variant="outline"
            onClick={tocar(p.id, -1)}
            aria-label={`Quitar ${p.nombre}`}
          >
            <Minus />
          </Button>
          <span className="min-w-5 text-center font-numeros font-semibold tabular-nums">
            {cantidadDe(p)}
          </span>
        </span>
      ),
    },
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (p) => <span className="line-clamp-2">{p.nombre}</span>,
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (p) => <Dinero centavos={aCentavos(p.precio_venta) * cantidadDe(p)} tamano="sm" />,
    },
  ];
}

/** Cargando: la forma real del catálogo y del panel, no una rueda. */
function EsqueletoDeLaComanda({ etiqueta }: { readonly etiqueta: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
      className="grid gap-(--espacio-4) p-(--espacio-3) xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div className="flex flex-col gap-(--espacio-3)">
        <Esqueleto className="h-[calc(var(--altura-control)*1.25)] w-full" />
        <div className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Esqueleto key={i} className="min-h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <Esqueleto className="hidden h-96 w-full rounded-lg xl:block" />
    </div>
  );
}

export function MesaActiva(props: MesaActivaProps) {
  const voc = useVocabulario();
  const { mesaInicial, productosIniciales } = props;
  /** Desde el primer render: da nombre al viaje antes de que llegue la mesa. */
  const idDeLaDireccion = useSearchParams().get('mesa');
  const [mesa, setMesa] = useState<MesaAbierta | null>(mesaInicial ?? null);
  const [productos, setProductos] = useState<readonly ProductoDeComanda[] | null>(
    productosIniciales ?? (mesaInicial === undefined ? null : []),
  );
  const [enviadas, setEnviadas] = useState<readonly LineaEnviada[]>(props.lineasIniciales ?? []);
  /**
   * Lo enviado NO se pudo leer nunca: no hay «último dato conocido» que enseñar, y
   * pintar el vacío de mesa recién abierta haría que el mesero lo volviera a mandar.
   */
  const [falloLineas, setFalloLineas] = useState<string | null>(null);
  const [releyendo, setReleyendo] = useState(false);
  /** Producto → cantidad todavía sin enviar. Nunca se muta: se recrea. */
  const [borrador, setBorrador] = useState<Readonly<Record<string, number>>>({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState(false);
  const [hoja, setHoja] = useState(false);
  /** Para cuántas personas se abre. Dos es la mesa más común de un comedor. */
  const [personasAlAbrir, setPersonasAlAbrir] = useState(2);
  const [abriendo, setAbriendo] = useState(false);
  /** F-324 · La línea que se anula: una línea, no un «está abierto» compartido. */
  const [anulando, setAnulando] = useState<LineaEnviada | null>(null);
  /** F-321 · Dividir la cuenta. Sólo se ofrece cuando hay algo que repartir. */
  const [dividiendo, setDividiendo] = useState(false);
  /**
   * Cada vez que se abre «Dividir», un diálogo NUEVO. Se queda montado para poder cerrar
   * con su animación, y así sus partes sobrevivían de una apertura a la otra: tras dividir,
   * lo que se había repartido apuntaba a líneas que ya no existían.
   */
  const [aperturaDeDividir, setAperturaDeDividir] = useState(0);
  /** Cada lectura es un número: «Volver a intentar» lo sube y el efecto relee. */
  const [intento, setIntento] = useState(0);
  const claveEnvio = useRef(nuevaClave());
  const refBusqueda = useRef<HTMLInputElement>(null);
  const listos = props.listosIniciales ?? [];

  useEffect(() => {
    if (mesaInicial !== undefined) return;
    // La señal de aborto, no un `let vivo`: además CANCELA las consultas en vuelo.
    const control = new AbortController();
    const señal = control.signal;
    void (async () => {
      try {
        const [mesas, catalogo] = await Promise.all([
          consultarPuente<MesaAbierta>('Mesa', {
            filtro: { id: idDeLaDireccion },
            limite: 1,
            signal: señal,
          }),
          consultarPuente<ProductoDeComanda>('ProductoTerminado', { limite: 300, signal: señal }),
        ]);
        const orden = mesas[0]?.venta_activa_id ?? null;
        // Lo enviado se lee ANTES de pintar la comanda: sin ello, «Cuenta actual»
        // diría «toca un platillo para empezar» sobre una cuenta que ya los lleva.
        const loEnviado =
          orden === null ? SIN_LINEAS : await leerLoEnviado(orden, { signal: señal });
        if (señal.aborted) return;
        setMesa(mesas[0] ?? null);
        setProductos(catalogo);
        if (loEnviado.leidas) {
          setEnviadas(loEnviado.lineas);
          setFalloLineas(null);
        } else {
          setFalloLineas(
            loEnviado.fallo instanceof Error
              ? loEnviado.fallo.message
              : `No se pudo leer ${voc.enFrase('orden')}.`,
          );
        }
      } catch (fallo: unknown) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (señal.aborted) return;
        setError(
          fallo instanceof Error
            ? fallo.message
            : `No se pudo leer ${voc.enFrase('unidad_servicio')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [mesaInicial, voc, idDeLaDireccion, intento]);

  const mesaLibre = mesa !== null && mesa.venta_activa_id === null;
  const comandaVisible = productos !== null && !mesaLibre;

  useEffect(() => {
    // Sólo con teclado físico (en la tablet el teclado en pantalla taparía el
    // catálogo), y cuando el catálogo APARECE: antes no hay campo que enfocar.
    if (!comandaVisible) return;
    if (window.matchMedia('(min-width: 1280px)').matches) refBusqueda.current?.focus();
  }, [comandaVisible]);

  const catalogo = productos ?? [];
  const texto = busqueda.trim().toLocaleLowerCase('es-MX');
  const visibles = catalogo.filter((p) => p.nombre.toLocaleLowerCase('es-MX').includes(texto));
  const pendientes = catalogo.filter((p) => (borrador[p.id] ?? 0) > 0);
  const piezas = Object.values(borrador).reduce((s, n) => s + n, 0);
  const cantidadDe = (p: ProductoDeComanda): number => borrador[p.id] ?? 0;
  const total =
    enviadas.reduce((s, l) => s + aCentavos(l.total), 0) +
    pendientes.reduce((s, p) => s + aCentavos(p.precio_venta) * cantidadDe(p), 0);
  const alergias = mesa?.notas_alergias ?? null;
  const sinEnviar = piezas === 0 || enviando;

  /** Sumar es tocar el platillo; restar, el botón de su línea. */
  const tocar = (productoId: string, delta: number) => () => {
    setBorrador((actual) => {
      const siguiente = { ...actual, [productoId]: (actual[productoId] ?? 0) + delta };
      return Object.fromEntries(Object.entries(siguiente).filter(([, n]) => n > 0));
    });
  };

  function reintentar(): void {
    setError(null);
    setProductos(null);
    setIntento((previo) => previo + 1);
  }

  /**
   * ABRIR LA MESA, cuando se llega a una libre. Vive aquí y no en el mapa porque
   * «¿cuántas personas?» es el PRIMER DATO DE LA COMANDA: decide el reparto de la
   * cuenta y el tiempo de servicio, y se contesta ya mirando el catálogo.
   */
  async function abrirLaMesa(): Promise<void> {
    if (mesa?.venta_activa_id != null) return;
    if (mesa === null) return;
    setAbriendo(true);
    setError(null);
    try {
      await invocarComando('/api/restaurante/abrir-mesa', {
        mesaId: mesa.id,
        personas: personasAlAbrir,
      });
      // Se vuelve a leer la mesa en vez de suponer su nuevo estado: la apertura
      // escribe el estado, la cuenta y la hora, y el encabezado los enseña.
      const frescas = await consultarPuente<MesaAbierta>('Mesa', {
        filtro: { id: mesa.id },
        limite: 1,
      });
      setMesa(frescas[0] ?? mesa);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir la mesa.');
    } finally {
      setAbriendo(false);
    }
  }

  async function enviarACocina(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null || pendientes.length === 0) return;
    setEnviando(true);
    setFalloEnvio(false);
    const clave = claveEnvio.current;
    const lineas = pendientes.map((p) => ({ productoId: p.id, cantidad: borrador[p.id] ?? 0 }));
    try {
      const entrada = { ordenId: orden, lineas };
      await invocarComando('/api/restaurante/enviar-pedido', entrada, { idempotencyKey: clave });
      // Lo enviado cruza al bloque de arriba con identificadores provisionales;
      // los definitivos llegan con la siguiente lectura de la mesa.
      const nuevas = pendientes.map((p, i) => ({
        id: `${clave}-${String(i)}`,
        producto_nombre: p.nombre,
        cantidad: borrador[p.id] ?? 0,
        total: p.precio_venta * (borrador[p.id] ?? 0),
      }));
      setEnviadas([...enviadas, ...nuevas]);
      setBorrador({});
      setHoja(false);
      claveEnvio.current = nuevaClave();
    } catch {
      // Nunca se traga: una comanda perdida en silencio es un plato que no sale.
      setFalloEnvio(true);
    } finally {
      setEnviando(false);
    }
  }

  const enviar = (): void => {
    void enviarACocina();
  };
  const abrirHoja = (): void => {
    setHoja(true);
  };
  const buscar = (e: ChangeEvent<HTMLInputElement>): void => {
    setBusqueda(e.target.value);
  };

  /**
   * Tras anular o dividir, la cuenta se RELEE: una división reparte líneas entre
   * cuentas nuevas y sólo el servidor sabe cuáles se quedaron en la madre.
   */
  async function recargarLineas(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null) return;
    // Si nunca se leyeron, el fallo se queda en su bloque: arriba diría «se muestra
    // el último dato conocido», y no hay ninguno.
    const nuncaSeLeyeron = falloLineas !== null;
    setReleyendo(true);
    const loEnviado = await leerLoEnviado(orden);
    setReleyendo(false);
    if (loEnviado.leidas) {
      setEnviadas(loEnviado.lineas);
      setFalloLineas(null);
      return;
    }
    const mensaje =
      loEnviado.fallo instanceof Error
        ? loEnviado.fallo.message
        : `No se pudo releer ${voc.enFrase('orden')}.`;
    if (nuncaSeLeyeron) setFalloLineas(mensaje);
    else setError(mensaje);
  }

  const abrirAnular = (linea: LineaEnviada) => () => {
    setAnulando(linea);
  };
  const cerrarAnular = (): void => {
    setAnulando(null);
  };
  const abrirDividir = (): void => {
    setAperturaDeDividir((n) => n + 1);
    setDividiendo(true);
  };
  const cerrarDividir = (): void => {
    setDividiendo(false);
  };
  const traslaAnulacion = (): void => {
    setAnulando(null);
    void recargarLineas();
  };
  const traslaDivision = (): void => {
    setDividiendo(false);
    void recargarLineas();
  };
  const releerLoEnviado = (): void => {
    void recargarLineas();
  };
  /** Sin lo enviado no hay total: sumar sólo el borrador daría un total que no es. */
  const totalConocido = falloLineas === null;

  const numero = mesa === null ? '—' : String(mesa.numero);
  const personasDeLaMesa = mesa?.personas_actuales ?? null;
  const mesaId = mesa?.id ?? idDeLaDireccion;

  /* ── La cabecera: la mesa, abierta. Es el DESTINO del viaje del mapa. ───── */
  const barra = (
    <BarraFija className="border-b border-borde">
      <header className="flex flex-wrap items-center gap-x-(--espacio-3) gap-y-(--espacio-2) px-(--espacio-3) py-(--espacio-2)">
        <Button variant="ghost" size="icon" aria-label="Volver al mapa" onClick={volverAlMapa}>
          <ArrowLeft />
        </Button>
        {/* El número es lo más grande: es lo que se grita en el salón. */}
        <h1 className="text-2xl font-bold">
          {voc.titulo('unidad_servicio')}{' '}
          <span className="font-numeros tabular-nums">{numero}</span>
        </h1>
        {mesa !== null && (
          <Badge variant="secondary">
            {ESTADOS_DE_MESA[mesa.estado] ?? mesa.estado.replace(/_/g, ' ')}
          </Badge>
        )}
        {personasDeLaMesa !== null && (
          <span className="inline-flex items-center gap-(--espacio-1) text-sm text-texto-sutil">
            <Users aria-hidden="true" className="size-4" />
            {personasDeLaMesa} personas
          </span>
        )}
        {/* Nunca sólo el icono: un error aquí no es un descuadre, es médico. */}
        {alergias !== null && (
          <Badge variant="destructive">
            <TriangleAlert aria-hidden="true" />
            Alergias: {alergias}
          </Badge>
        )}
        {listos.length > 0 && (
          <Badge className="ml-auto xl:hidden">
            <ConciergeBell aria-hidden="true" />
            {listos.length} listos
          </Badge>
        )}
      </header>
    </BarraFija>
  );
  /* Por FUERA de la barra: el viaje se pone en su primer nodo, la barra entera. */
  const cabecera =
    mesaId === null ? (
      barra
    ) : (
      <ViewTransition name={VIAJE.mesa(mesaId)} share="auto" default="none">
        {barra}
      </ViewTransition>
    );

  /* ── El panel de la cuenta: a la derecha en PC, en la hoja en tableta. ──── */
  const panel = (
    <div className="flex flex-col gap-(--espacio-4)">
      {listos.length > 0 && (
        <Superficie
          como="section"
          nivel={0}
          radio="md"
          relleno={3}
          aria-label="Listos para recoger"
          className="border-acento bg-acento-suave text-acento-suave-texto"
        >
          {/* El texto va en `acento-suave-texto`, el par del tinte: `text-acento` sobre
              `bg-acento-suave` no llega a 4.5:1 en `noche` ni en `bloque`. */}
          <h2 className="flex items-center gap-(--espacio-2) text-xs font-bold uppercase">
            <ConciergeBell aria-hidden="true" className="size-4" />
            Listos para recoger ({listos.length})
          </h2>
          <p className="mt-(--espacio-1) text-sm font-medium">{listos.join(' · ')}</p>
        </Superficie>
      )}
      {/* «Pedido» es de la CAFETERÍA: aquí lo que se manda es la cuenta. */}
      <section
        aria-label={`${voc.titulo('orden')} actual, ya enviad${voc.terminacion('orden')} a ${voc.enFrase('preparacion')}`}
        className="flex flex-col gap-(--espacio-2)"
      >
        <h2 className="text-xs font-bold tracking-wide text-texto-sutil uppercase">
          {voc.titulo('orden')} actual
        </h2>
        {falloLineas === null ? (
          <>
            <Tabla
              etiqueta={`${voc.titulo('orden')} actual`}
              columnas={columnasDeLoEnviado(voc, abrirAnular)}
              filas={enviadas}
              claveDe={(l) => l.id}
              alto="max-h-none"
              vacio={
                <Vacio
                  titulo={`${voc.titulo('unidad_servicio')} ${numero} abiert${voc.terminacion('unidad_servicio')} para ${String(personasDeLaMesa ?? 0)} personas.`}
                  explicacion={`Toca ${voc.enFraseCon('un', 'linea_orden')} para empezar.`}
                  className="px-(--espacio-3) py-(--espacio-4)"
                />
              }
            />
            {enviadas.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={abrirDividir}
                aria-label={`Dividir ${voc.enFrase('orden')} de ${voc.enFrase('unidad_servicio')}`}
              >
                <Split aria-hidden="true" />
                Dividir {voc.singular('orden')}
              </Button>
            )}
          </>
        ) : (
          /* No leyó nada: ni el vacío de mesa recién abierta ni «Dividir», que
             repartiría una cuenta que la pantalla no conoce. */
          <ErrorDePantalla
            titulo={`No se pudo leer lo ya enviado a ${voc.enFrase('preparacion')}`}
            queHacer={`Hasta leerlo no se sabe qué lleva ${voc.enFrase('orden')} ni cuánto suma. Antes de volver a mandar ${voc.enFraseCon('un', 'linea_orden')}, confírmalo con ${voc.enFrase('preparacion')}.`}
            detalle={falloLineas}
            reintentar={
              <Button size="sm" variant="outline" cargando={releyendo} onClick={releerLoEnviado}>
                Volver a intentar
              </Button>
            }
          />
        )}
      </section>
      <section
        aria-label={`Agregar a ${voc.enFrase('orden')}, sin enviar`}
        className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)"
      >
        <h2 className="text-xs font-bold tracking-wide text-primario uppercase">
          Agregar a {voc.enFrase('orden')}
        </h2>
        <Tabla
          etiqueta={`Agregar a ${voc.enFrase('orden')}`}
          columnas={columnasDelBorrador(voc, cantidadDe, tocar)}
          filas={pendientes}
          claveDe={(p) => p.id}
          alto="max-h-none"
          vacio={
            <p className="text-sm text-texto-sutil">
              Toca {voc.enFraseCon('un', 'linea_orden')} para agregarlo.
            </p>
          }
        />
      </section>
      <Button
        size="lg"
        className="min-h-[calc(var(--altura-control)*1.6)] w-full text-lg font-bold"
        disabled={sinEnviar}
        onClick={enviar}
      >
        <Send aria-hidden="true" />
        {enviando ? 'Enviando…' : 'ENVIAR A COCINA'}
      </Button>
      {totalConocido && (
        <p className="flex items-baseline justify-between border-t border-borde pt-(--espacio-3)">
          <span className="text-sm font-bold">TOTAL</span>
          <Dinero centavos={total} tamano="lg" />
        </p>
      )}
    </div>
  );

  /* ── MESA LIBRE · lo único que se puede hacer aquí es abrirla. ──────────── */
  const abrir =
    mesa === null ? null : (
      /* El catálogo con la mesa cerrada sería un pedido sin dónde caer. */
      <Superficie
        como="section"
        nivel={2}
        relleno={6}
        aria-label={`Abrir ${voc.enFrase('unidad_servicio')}`}
        className="mx-auto mt-(--espacio-6) flex max-w-md flex-col items-center gap-(--espacio-4) text-center"
      >
        <p className="text-xl font-semibold">
          {voc.titulo('unidad_servicio')} {mesa.numero} está libre
        </p>
        <p className="text-sm text-texto-sutil">
          ¿Para cuántas personas? Es el primer dato de {voc.enFrase('orden')}: de ahí salen el
          reparto y el tiempo de servicio.
        </p>
        <div className="flex items-center justify-center gap-(--espacio-6)">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Una persona menos"
            disabled={personasAlAbrir <= 1}
            onClick={() => {
              setPersonasAlAbrir(Math.max(1, personasAlAbrir - 1));
            }}
          >
            <Minus />
          </Button>
          <span
            aria-live="polite"
            className="min-w-16 font-numeros text-display font-bold tabular-nums"
          >
            {personasAlAbrir}
          </span>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Una persona más"
            disabled={personasAlAbrir >= PERSONAS_MAXIMAS}
            onClick={() => {
              setPersonasAlAbrir(Math.min(PERSONAS_MAXIMAS, personasAlAbrir + 1));
            }}
          >
            <Plus />
          </Button>
        </div>
        <Button
          size="lg"
          className="min-h-[calc(var(--altura-control)*1.6)] w-full text-lg font-bold"
          disabled={abriendo}
          onClick={() => {
            void abrirLaMesa();
          }}
        >
          {abriendo ? 'Abriendo…' : `Abrir ${voc.enFrase('unidad_servicio')}`}
        </Button>
      </Superficie>
    );

  /* El vacío enseña: dice qué falta y lleva a donde se resuelve. */
  const vacioDelCatalogo = (
    <Vacio
      icono={texto === '' ? <UtensilsCrossed /> : <Search />}
      titulo={
        texto === ''
          ? `Todavía no hay ${voc.plural('producto')}.`
          : `No hay ${voc.plural('producto')} que se llamen así.`
      }
      accion={
        <Button asChild variant="outline">
          <a href="/productos">Ir a {voc.titulo('producto', true)}</a>
        </Button>
      }
    />
  );

  const comanda = (
    <div className="grid gap-(--espacio-4) p-(--espacio-3) xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <section
        aria-label={`Catálogo de ${voc.plural('linea_orden')}`}
        className="flex flex-col gap-(--espacio-3)"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            ref={refBusqueda}
            value={busqueda}
            onChange={buscar}
            aria-label={`Buscar ${voc.singular('linea_orden')}`}
            placeholder={`Buscar ${voc.singular('linea_orden')}…`}
            className="h-[calc(var(--altura-control)*1.25)] pl-(--espacio-10) text-lg"
          />
        </div>
        {visibles.length === 0 ? (
          vacioDelCatalogo
        ) : (
          /* La zona de toque nunca baja de 96 px: la acierta un pulgar. */
          <ul className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-3 xl:grid-cols-4">
            {visibles.map((p) => {
              const agotado = p.agotado === true;
              const enBorrador = cantidadDe(p);
              return (
                <li key={p.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    relleno={3}
                    activa={enBorrador > 0}
                    disabled={agotado}
                    onClick={tocar(p.id, 1)}
                    className={`relative flex min-h-24 w-full flex-col items-start justify-between gap-(--espacio-2) ${agotado ? 'bg-fondo-sutil text-texto-sutil' : ''}`}
                  >
                    <span className="line-clamp-2 pr-(--espacio-6) text-base leading-tight font-semibold">
                      {p.nombre}
                    </span>
                    {/* El precio, en segundo plano; «Agotado», con palabra. */}
                    {agotado ? (
                      <span className="text-xs font-medium">Agotado</span>
                    ) : (
                      <Dinero
                        centavos={aCentavos(p.precio_venta)}
                        tamano="xs"
                        className="text-texto-sutil"
                      />
                    )}
                    {/* El anillo solo no dice cuántos: el número sí. */}
                    {enBorrador > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-(--espacio-2) right-(--espacio-2) flex h-[calc(var(--altura-control)*0.6)] min-w-[calc(var(--altura-control)*0.6)] items-center justify-center rounded-full px-(--espacio-1) bg-primario font-numeros text-xs font-bold text-primario-texto tabular-nums"
                      >
                        {enBorrador}
                      </span>
                    )}
                  </Superficie>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Superficie
        como="aside"
        relleno={4}
        aria-label={`Pedido de ${voc.enFrase('unidad_servicio')}`}
        className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto xl:block"
      >
        {panel}
      </Superficie>
    </div>
  );

  const contenido = (() => {
    if (productos === null) {
      if (error === null) {
        return <EsqueletoDeLaComanda etiqueta={`Cargando ${voc.enFrase('unidad_servicio')}`} />;
      }
      // No leyó nada: no hay «último dato conocido» que enseñar.
      return (
        <div className="mx-auto max-w-lg p-(--espacio-6)">
          <ErrorDePantalla
            titulo={`No se pudo leer ${voc.enFrase('unidad_servicio')} ni ${voc.enFrase('producto', true)}`}
            queHacer={`Sin eso no se puede levantar la comanda: no se sabría a qué ${voc.singular('orden')} va ni qué se puede pedir. Revisa la conexión y vuelve a intentarlo.`}
            detalle={error}
            reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
          />
        </div>
      );
    }
    return mesaLibre ? abrir : comanda;
  })();

  return (
    <div className="min-h-dvh bg-fondo pb-28 xl:pb-0">
      {cabecera}
      {productos !== null && error !== null && (
        <Aviso tono="peligro" titulo={error} className="mx-(--espacio-3) mt-(--espacio-3)">
          Se muestra el último dato conocido.
        </Aviso>
      )}
      {contenido}
      {comandaVisible && (
        /* Tablet y teléfono: la cuenta vive donde alcanza el pulgar derecho. */
        <Button
          size="lg"
          onClick={abrirHoja}
          aria-label={`Abrir el pedido: ${voc.conNumero('linea_orden', piezas)}${totalConocido ? `, ${dineroEnTexto(total)}` : ''}`}
          className="fixed right-(--espacio-4) bottom-(--espacio-4) z-20 min-h-[calc(var(--altura-control)*1.6)] gap-(--espacio-3) rounded-full px-(--espacio-6) text-lg font-bold shadow-3 xl:hidden"
        >
          <span className="font-numeros tabular-nums">{piezas}</span>
          {totalConocido && (
            <>
              <span aria-hidden="true">·</span>
              <Dinero centavos={total} tamano="base" />
            </>
          )}
        </Button>
      )}
      <Sheet open={hoja} onOpenChange={setHoja}>
        <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto p-(--espacio-4)">
          <SheetTitle>Pedido de la mesa {mesa?.numero ?? ''}</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>
      <Dialog open={falloEnvio} onOpenChange={setFalloEnvio}>
        <DialogContent className="border-2 border-peligro">
          <DialogTitle>La comanda NO llegó a {voc.singular('preparacion')}</DialogTitle>
          <Aviso tono="peligro" titulo="Vuelve a intentar.">
            El pedido sigue completo en la pantalla y el reintento usa la misma clave, así que no
            puede duplicarse.
          </Aviso>
          <Button size="lg" disabled={enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Reintentar envío'}
          </Button>
        </DialogContent>
      </Dialog>
      {anulando !== null && mesa?.venta_activa_id != null && (
        <AnularLineaDialog
          abierto
          ordenId={mesa.venta_activa_id}
          lineaId={anulando.id}
          nombreDelPlatillo={anulando.producto_nombre}
          /* «Ya se preparó» = cocina lo dejó en la ventana: el insumo ya se gastó. */
          yaSePreparo={listos.includes(anulando.producto_nombre)}
          onCerrar={cerrarAnular}
          onAnulada={traslaAnulacion}
        />
      )}
      {mesa?.venta_activa_id != null && (
        <DividirCuentaDialog
          key={aperturaDeDividir}
          abierto={dividiendo}
          ordenId={mesa.venta_activa_id}
          lineas={enviadas.map((l) => ({
            id: l.id,
            nombre: l.producto_nombre,
            cantidad: l.cantidad,
          }))}
          onCerrar={cerrarDividir}
          onDividida={traslaDivision}
        />
      )}
    </div>
  );
}
