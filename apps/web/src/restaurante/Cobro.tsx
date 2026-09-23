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
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowLeftRight,
  Banknote,
  Check,
  ChevronDown,
  CircleCheck,
  CreditCard,
  Printer,
  ReceiptText,
  Split,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * PANTALLA · restaurante · cobro
 *
 * Convertir una cuenta cerrada en dinero contado. 40–120 veces al día, y siempre
 * con una persona esperando enfrente.
 *
 * ── El TOTAL es lo más grande de toda la aplicación ──────────────────────
 * Porque el cajero no lo consulta: lo LEE EN VOZ ALTA. Si tiene que buscarlo
 * entre el desglose lo lee mal. Por eso mismo el desglose se colapsa en tablet y
 * en teléfono: es para cuando alguien pregunta, y casi nadie pregunta.
 *
 * ── Los métodos son teselas, no botones de formulario ────────────────────
 * Se tocan sin mirar, con el icono antes que la palabra, y la elegida lleva el
 * anillo Y la palomita: el color no puede ser el único que diga cuál está.
 *
 * ── La única fricción deliberada: el desglose del pago mixto ─────────────
 * Tres campos que tienen que sumar EXACTO, con el botón apagado hasta que
 * cuadren. Con centavos enteros la tolerancia de ±$0.01 del documento sobra:
 * cuadra o no cuadra, y con eso desaparece una clase entera de descuadre que
 * sólo se descubre en el arqueo de las once de la noche.
 *
 * ── La propina pendiente es un muro, no un aviso ─────────────────────────
 * Cobrar con la propina sin decidir deja al mesero sin su parte y sin manera de
 * reclamarla: el cobro ya se selló. «Sin propina» es una tesela del mismo tamaño
 * que los porcentajes, porque es voluntaria.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Inventario, reportes, historial y edición de la cuenta. Si hay que corregir un
 * platillo, se corrige en la mesa.
 *
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. El documento la llama «diálogo»: el envoltorio lo pone quien la abre desde
 *    Caja. Aquí es la superficie, para que la ruta exista y se pruebe sola.
 * 2. De la propina quedan los porcentajes con su importe y «Sin propina» al
 *    mismo peso; el campo de monto libre se queda en el diálogo de Caja.
 * 3. `F12` va impreso en el botón pero no se engancha: esa tecla es del
 *    navegador. El atajo se instala en el `AppLayout` al acoplar.
 * 4. Sin id en la ruta se abre la cuenta que lleva más tiempo esperando.
 * 5. Lo recibido y el desglose se teclean en `CampoDeDinero`, que habla en
 *    centavos y da `null` tanto para el campo vacío como para lo que no es un
 *    importe: los dos cuentan como «no tecleó nada».
 */

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const;
type Metodo = (typeof METODOS)[number];
type MetodoBase = Exclude<Metodo, 'mixto'>;
const BASES: readonly MetodoBase[] = ['efectivo', 'tarjeta', 'transferencia'];
/** Cómo se lee cada método en su tesela. El icono se reconoce antes que la palabra. */
const METODO: Readonly<Record<Metodo, { readonly etiqueta: string; readonly Icono: LucideIcon }>> =
  {
    efectivo: { etiqueta: 'Efectivo', Icono: Banknote },
    tarjeta: { etiqueta: 'Tarjeta', Icono: CreditCard },
    transferencia: { etiqueta: 'Transferencia', Icono: ArrowLeftRight },
    mixto: { etiqueta: 'Mixto', Icono: Split },
  };
/** Los `propina_tipo` que significan «todavía nadie la decidió». */
const SIN_DECIDIR = ['pendiente', 'pendiente_cliente', 'decidir_en_caja'];
/** En PUNTOS BASE, como viaja el porcentaje en el sistema. El 0 es «sin». */
const PROPINAS = [1000, 1250, 1500, 0];
/** Los renglones del esqueleto del desglose: los de una cuenta de cuatro personas. */
const RENGLONES_DE_ESPERA = 5;
/**
 * Una sola columna, a lo ancho de una tableta, hasta PC. En PC, la cuenta a la
 * izquierda y el cobro a la derecha, del ancho de un ticket.
 */
const REJILLA =
  'mx-auto grid w-full max-w-2xl gap-(--espacio-4) p-(--espacio-4) xl:max-w-none xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start';

/** La fila de `Venta` del puente, con sus nombres. Los importes van en PESOS. */
export interface CuentaPorCobrar {
  readonly id: string;
  readonly codigo_caja: string | null;
  readonly cliente_nombre: string | null;
  readonly subtotal: number | null;
  readonly impuestos: number | null;
  readonly total: number | null;
  readonly propina_monto: number | null;
  readonly propina_tipo: string | null;
}

/** La fila de `DetalleVenta`: sólo lo que el comensal reconoce de su cuenta. */
export interface LineaDeCuenta {
  readonly id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly total: number | null;
}

export interface CobroProps {
  /** Cuando llega —aunque sea `null`— la pantalla no consulta. Para pruebas. */
  readonly cuentaInicial?: CuentaPorCobrar | null;
  readonly lineasIniciales?: readonly LineaDeCuenta[];
  readonly onCobrada?: (ordenId: string) => void;
  readonly onImprimir?: (ordenId: string) => void;
  /**
   * LA CUENTA QUE SE VA A COBRAR, cuando quien llega ya eligió una.
   *
   * Sin esto, la pantalla siempre tomaba «la primera cuenta solicitada», y por eso
   * el botón de cada fila de la pantalla de Caja no podía llevar a NINGUNA en
   * concreto: el cajero elige a Mesa 7 y habría cobrado la que estuviera primero.
   */
  readonly cuentaId?: string;
}

/** Pesos a centavos contando dígitos: `1234.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Qué impide cobrar, dicho con palabras y no sólo con un botón apagado. */
function bloqueoDe(
  pendiente: boolean,
  total: number,
  metodo: Metodo,
  recibido: number | null,
  suma: number,
  voc: Vocabulario,
): ReactNode {
  if (pendiente) return 'Confirma la propina antes de cobrar.';
  if (total <= 0) return `${voc.conDeterminante('este', 'orden')} no tiene importe que cobrar.`;
  if (metodo === 'efectivo') {
    return recibido !== null && recibido > 0 && recibido < total ? 'Lo recibido no alcanza.' : null;
  }
  if (metodo !== 'mixto' || suma === total) return null;
  const falta = total - suma;
  return falta > 0 ? (
    <>
      Faltan <Dinero centavos={falta} tamano="sm" /> por desglosar.
    </>
  ) : (
    <>
      Sobran <Dinero centavos={-falta} tamano="sm" />.
    </>
  );
}

/**
 * Los renglones de `venta.cobrar`. La propina se reconoce de efectivo hacia
 * abajo: el billete que el comensal deja de más va a la bolsa del mesero esa
 * misma noche, y la de tarjeta espera a la liquidación.
 */
function renglonesDePago(
  metodo: Metodo,
  partes: Readonly<Record<MetodoBase, number | null>>,
  venta: number,
  propina: number,
  recibido: number | null,
): readonly Record<string, unknown>[] {
  if (metodo !== 'mixto') {
    const enMano =
      metodo === 'efectivo' && recibido !== null && recibido > 0
        ? { recibidoCentavos: recibido }
        : {};
    return [{ metodo, montoCentavos: venta, propinaCentavos: propina, ...enMano }];
  }
  let porAsignar = propina;
  return BASES.map((base) => {
    const importe = partes[base] ?? 0;
    const suya = Math.min(importe, porAsignar);
    porAsignar -= suya;
    return { metodo: base, montoCentavos: importe - suya, propinaCentavos: suya };
  }).filter((renglon) => renglon.montoCentavos > 0 || renglon.propinaCentavos > 0);
}

/** Las columnas del desglose: la cantidad alineada, el platillo y su importe. */
function columnasDeLaCuenta(platillo: string): readonly ColumnaDeTabla<LineaDeCuenta>[] {
  return [
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      numerica: true,
      // En cifras tabulares y en su propia columna: una columna de «2», «12» que no
      // está alineada se relee, y aquí se relee con gente esperando.
      celda: (linea) => {
        const cantidad = linea.cantidad ?? 1;
        return (
          <Cifra valor={cantidad} decimales={Number.isInteger(cantidad) ? 0 : 2} tamano="sm" />
        );
      },
    },
    { clave: 'platillo', titulo: platillo, celda: (linea) => linea.producto_nombre ?? platillo },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={aCentavos(linea.total)} tamano="sm" />,
    },
  ];
}

export function Cobro({
  cuentaInicial,
  lineasIniciales,
  onCobrada,
  onImprimir,
  cuentaId,
}: CobroProps) {
  const voc = useVocabulario();
  const [cuenta, setCuenta] = useState<CuentaPorCobrar | null | undefined>(cuentaInicial);
  const [lineas, setLineas] = useState<readonly LineaDeCuenta[]>(lineasIniciales ?? []);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  // Lo que teclea el cajero, ya en centavos. `null` es «no tecleó un importe».
  const [recibido, setRecibido] = useState<number | null>(null);
  const [partes, setPartes] = useState<Readonly<Record<MetodoBase, number | null>>>({
    efectivo: null,
    tarjeta: null,
    transferencia: null,
  });
  const [propina, setPropina] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cambio, setCambio] = useState<number | null>(null);
  /** El cobro falló: la cuenta sigue en pantalla y NO se marcó como pagada. */
  const [error, setError] = useState<string | null>(null);
  /** La lectura falló: sin cuenta no hay nada que cobrar. */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (cuentaInicial !== undefined) return;
    // El centinela es la señal de aborto: dice si la pantalla sigue montada y
    // además cancela la lectura en vuelo.
    const control = new AbortController();
    const señal = control.signal;
    /**
     * Se pregunta con una LLAMADA y no leyendo la propiedad dos veces: tras el
     * primer `if (señal.aborted)` el compilador da por hecho que sigue en
     * falso, y entre un `await` y el siguiente eso deja de ser cierto.
     */
    const sigueMontada = (): boolean => !control.signal.aborted;
    void (async () => {
      try {
        // Con una cuenta dicha se pide ESA; sin ella, la primera que pidió su cuenta.
        const filtro = cuentaId === undefined ? { estado: 'cuenta_solicitada' } : { id: cuentaId };
        const [fila] = await consultarPuente<CuentaPorCobrar>('Venta', {
          filtro,
          limite: 1,
          signal: señal,
        });
        if (señal.aborted) return;
        setCuenta(fila ?? null);
        if (fila === undefined) return;
        const suyas = await consultarPuente<LineaDeCuenta>('DetalleVenta', {
          filtro: { venta_id: fila.id },
          signal: señal,
        });
        if (sigueMontada()) setLineas(suyas);
      } catch (fallo) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (señal.aborted) return;
        setFalloDeCarga(
          fallo instanceof Error ? fallo.message : `No se pudo leer ${voc.enFrase('orden')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [cuentaInicial, cuentaId, voc, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setCuenta(undefined);
    setLineas([]);
    setIntento((previo) => previo + 1);
  }

  const venta = aCentavos(cuenta?.total);
  const suPropina = propina ?? aCentavos(cuenta?.propina_monto);
  const total = venta + suPropina;
  const pendiente = propina === null && SIN_DECIDIR.includes(cuenta?.propina_tipo ?? '');
  const suma = BASES.reduce((suman, base) => suman + (partes[base] ?? 0), 0);
  const bloqueo = bloqueoDe(pendiente, total, metodo, recibido, suma, voc);

  async function cobrar(id: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const hecho = await invocarComando<{ readonly cambioCentavos: string }>('/api/venta/cobrar', {
        ordenId: id,
        pagos: renglonesDePago(metodo, partes, venta, suPropina, recibido),
        totalEsperadoCentavos: venta,
        propinaOrigen: 'caja',
      });
      setCambio(Number(hecho.cambioCentavos));
      onCobrada?.(id);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cobrar.');
    } finally {
      setEnviando(false);
    }
  }

  // No se leyó ni la cuenta: no hay total que leer en voz alta, así que no se
  // enseña un cobro a medias.
  if (falloDeCarga !== null && cuenta === undefined) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-6)">
        <ErrorDePantalla
          titulo={`No se pudo leer ${voc.enFrase('orden')}`}
          queHacer={`Sin ${voc.enFrase('orden')} no se sabe cuánto cobrar. Revisa la conexión y vuelve a intentarlo: no se cobró nada.`}
          detalle={falloDeCarga}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </div>
    );
  }

  // Esqueletos con la forma del cobro: así el total no salta de sitio al cargar.
  if (cuenta === undefined) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={`Cargando ${voc.enFrase('orden')}`}
        className={REJILLA}
      >
        <Esqueleto className="h-[calc(var(--altura-control)*0.7)] w-72 max-w-full xl:col-span-2" />
        <div className="flex flex-col gap-(--espacio-3) xl:order-2">
          <Esqueleto className="h-36 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-(--espacio-2) xl:grid-cols-1">
            {METODOS.map((opcion) => (
              <Esqueleto key={opcion} className="h-(--altura-control) w-full" />
            ))}
          </div>
          <Esqueleto className="h-[calc(var(--altura-control)*1.5)] w-full" />
        </div>
        <div className="flex flex-col gap-(--espacio-2) xl:order-1">
          <Esqueleto className="h-(--altura-control) w-full rounded-lg xl:hidden" />
          {Array.from({ length: RENGLONES_DE_ESPERA }, (_, indice) => (
            <div key={indice} className="hidden gap-(--espacio-3) xl:flex">
              <Esqueleto className="h-4 w-8" />
              <Esqueleto className="h-4 flex-1" />
              <Esqueleto className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // El vacío ENSEÑA de dónde salen las cuentas; no se disculpa por no tener.
  if (cuenta === null) {
    return (
      <div className="mx-auto max-w-lg p-(--espacio-4)">
        <Vacio
          icono={<ReceiptText />}
          titulo={`${voc.conDeterminante('ningun', 'orden')} está esperando cobro.`}
          explicacion={`${voc.conDeterminante('un', 'orden')} llega aquí cuando ${voc.enFrase('responsable')} la cierra y ${voc.enFrase('cliente')} pide pagar.`}
          accion={
            <Button asChild>
              <a href="/restaurante/mapa-de-mesas">
                Ver el mapa de {voc.plural('unidad_servicio')}
              </a>
            </Button>
          }
        />
      </div>
    );
  }

  const platillo = voc.titulo('linea_orden');
  const cuantos = voc.conNumero('linea_orden', lineas.length);
  // El desglose es un recibo: tabla densa con la cantidad y el importe alineados,
  // y debajo lo que el comensal pregunta cuando pregunta.
  const detalle = (
    <div className="flex flex-col gap-(--espacio-3)">
      <Tabla
        etiqueta={`${voc.titulo('linea_orden', true)} de ${voc.enFrase('orden')}`}
        columnas={columnasDeLaCuenta(platillo)}
        filas={lineas}
        claveDe={(linea) => linea.id}
        alto="max-h-[50vh]"
        vacio={
          <Vacio
            titulo={`${voc.conDeterminante('este', 'orden')} no tiene ${voc.plural('linea_orden')}.`}
            explicacion={`Si hay que corregir ${voc.enFraseCon('un', 'linea_orden')}, se corrige en ${voc.enFrase('unidad_servicio')}.`}
            className="py-(--espacio-4)"
          />
        }
      />
      <dl className="grid grid-cols-[1fr_auto] gap-x-(--espacio-4) gap-y-(--espacio-1) px-(--espacio-3) text-sm">
        <dt className="text-texto-sutil">Subtotal</dt>
        <dd className="text-right">
          <Dinero centavos={aCentavos(cuenta.subtotal)} tamano="sm" />
        </dd>
        <dt className="text-texto-sutil">Impuestos</dt>
        <dd className="text-right">
          <Dinero centavos={aCentavos(cuenta.impuestos)} tamano="sm" />
        </dd>
        <dt className="text-texto-sutil">Propina</dt>
        <dd className="text-right">
          <Dinero centavos={suPropina} tamano="sm" />
        </dd>
      </dl>
    </div>
  );

  if (cambio !== null) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-4) p-(--espacio-4)">
        {/* COBRADO · el cambio pesa más que el total, porque es lo único que queda
            por hacer: contarlo y darlo. El total ya se leyó en voz alta. */}
        <Superficie
          nivel={2}
          relleno={6}
          como="section"
          aria-label="Cobrado"
          className="flex flex-col items-center gap-(--espacio-4) text-center"
        >
          <div role="status" className="flex flex-col items-center gap-(--espacio-2)">
            <p className="flex items-center gap-(--espacio-1) text-sm font-medium tracking-wide text-exito uppercase">
              <CircleCheck aria-hidden="true" className="size-4" />
              Cobrado
            </p>
            <span className="text-xs text-texto-sutil">Cambio</span>
            <Dinero centavos={cambio} tamano="total" />
            <p className="text-sm text-texto-sutil">
              Se cobraron <Dinero centavos={total} tamano="sm" /> ·{' '}
              {voc.conArticulo('unidad_servicio')} pasa sola a limpieza.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              onImprimir?.(cuenta.id);
            }}
          >
            <Printer aria-hidden="true" />
            Imprimir ticket
          </Button>
        </Superficie>
        {/* El ticket completo, debajo: es lo que se imprime y lo que se le enseña
            al comensal si pregunta qué pagó. */}
        <Superficie como="section" relleno={4} aria-label={`Ticket de ${voc.enFrase('orden')}`}>
          {detalle}
        </Superficie>
      </div>
    );
  }

  return (
    <div className={REJILLA}>
      <h1 className="text-xl font-bold xl:col-span-2">
        Cobro{' '}
        <span className="font-normal text-texto-sutil">
          · {cuenta.codigo_caja ?? 'sin código'} · {cuenta.cliente_nombre ?? 'sin nombre'}
        </span>
      </h1>
      {/* La pantalla no se vacía por un error: el aviso va encima del último dato. */}
      {falloDeCarga === null ? null : (
        <Aviso
          tono="peligro"
          titulo={falloDeCarga}
          className="xl:col-span-2"
          accion={
            <Button size="sm" variant="outline" onClick={reintentar}>
              Volver a leer
            </Button>
          }
        >
          {`No se leyeron ${voc.enFrase('linea_orden', true)}; el total sí, y se puede cobrar.`}
        </Aviso>
      )}
      {error === null ? null : (
        <Aviso tono="peligro" titulo={error} className="xl:col-span-2">
          {`${voc.conArticulo('orden')} NO se marcó como pagad${voc.terminacion('orden')}. Se puede volver a cobrar.`}
        </Aviso>
      )}

      {/* El cobro va primero en el DOM: en teléfono es lo único que se ve. */}
      <section aria-label="Cobro" className="flex flex-col gap-(--espacio-3) xl:order-2">
        {/* EL TOTAL, en la superficie más alta de la pantalla y a solas.
            Sube de nivel 1 a 2 a propósito: lo que se lee desde el otro lado del
            mostrador tiene que separarse del papel, no compartir plano con el
            desglose. Y el rótulo va DEBAJO del número: lo que el ojo busca es la
            cifra, y la palabra «total» sólo confirma qué es. */}
        <Superficie
          nivel={2}
          relleno={6}
          className="flex flex-col items-center gap-(--espacio-1) text-center"
        >
          <Dinero centavos={total} tamano="total" />
          <p className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
            Total a cobrar
          </p>
          {/* En tableta y teléfono el desglose está plegado: la propina que va
              dentro del total se dice aquí, porque es lo que el comensal pregunta. */}
          {suPropina > 0 ? (
            <p className="text-xs text-texto-sutil xl:hidden">
              Con propina de <Dinero centavos={suPropina} tamano="xs" />
            </p>
          ) : null}
        </Superficie>

        {/* EL MURO de la propina: antes de los métodos, porque sin decidirla no se
            cobra. «Sin propina» pesa lo mismo que los porcentajes: es voluntaria. */}
        {pendiente ? (
          <div role="group" aria-label="Propina" className="flex flex-col gap-(--espacio-2)">
            <Aviso tono="atencion" titulo="Confirma la propina antes de cobrar." />
            <ul className="grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-4">
              {PROPINAS.map((puntos) => {
                const importe = Math.round((venta * puntos) / 10000);
                return (
                  <li key={puntos}>
                    <Superficie
                      como="button"
                      type="button"
                      interactiva
                      relleno={3}
                      radio="md"
                      onClick={() => {
                        setPropina(importe);
                      }}
                      className="flex min-h-20 w-full flex-col items-center justify-center gap-(--espacio-1) text-center"
                    >
                      <span className="text-sm font-semibold">
                        {puntos === 0 ? 'Sin propina' : `${String(puntos / 100)} %`}
                      </span>
                      <Dinero centavos={importe} tamano="xs" className="text-texto-sutil" />
                    </Superficie>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div
          role="group"
          aria-label="Método de pago"
          className="grid grid-cols-2 gap-(--espacio-2) xl:grid-cols-1"
        >
          {METODOS.map((opcion) => {
            const { etiqueta, Icono } = METODO[opcion];
            const elegido = metodo === opcion;
            return (
              <Superficie
                key={opcion}
                como="button"
                type="button"
                interactiva
                activa={elegido}
                aria-pressed={elegido}
                relleno={3}
                radio="md"
                onClick={() => {
                  setMetodo(opcion);
                }}
                className="relative flex min-h-(--altura-control) w-full items-center gap-(--espacio-2) text-sm font-semibold md:text-base"
              >
                <Icono aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
                {etiqueta}
                {/* La palomita: el anillo no puede ser el único que diga cuál está. */}
                {elegido ? (
                  <Check
                    aria-hidden="true"
                    className="absolute top-(--espacio-1) right-(--espacio-1) size-4 text-primario"
                  />
                ) : null}
              </Superficie>
            );
          })}
        </div>

        {metodo === 'efectivo' ? (
          <div className="flex flex-col gap-(--espacio-2)">
            <Label htmlFor="cobro-recibido">Recibido</Label>
            <CampoDeDinero id="cobro-recibido" centavos={recibido} alCambiar={setRecibido} />
            {/* El cambio, al peso de un dato y no de una etiqueta: es el número que
                el cajero saca del cajón, y se equivoca si lo tiene que buscar. */}
            <p className="flex items-baseline justify-between">
              <span className="text-sm text-texto-sutil">Cambio</span>
              <Dinero centavos={Math.max((recibido ?? 0) - total, 0)} tamano="lg" />
            </p>
          </div>
        ) : null}

        {/* El desglose exacto: cada campo lleva el importe COMPLETO que entra por
            ese método —venta y propina juntas—, que es lo que el cajero ve pasar;
            separarlas es aritmética, no una segunda cuenta que pedirle a mano. */}
        {metodo === 'mixto' ? (
          <div className="grid gap-(--espacio-2) sm:grid-cols-3">
            {BASES.map((base) => (
              <div key={base} className="flex flex-col gap-(--espacio-1)">
                <Label htmlFor={`cobro-${base}`}>{METODO[base].etiqueta}</Label>
                <CampoDeDinero
                  id={`cobro-${base}`}
                  centavos={partes[base]}
                  alCambiar={(centavos) => {
                    setPartes((previas) => ({ ...previas, [base]: centavos }));
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}

        <Button
          size="lg"
          cargando={enviando}
          className="h-[calc(var(--altura-control)*1.5)] w-full text-lg font-bold"
          disabled={enviando || bloqueo !== null}
          onClick={() => {
            void cobrar(cuenta.id);
          }}
        >
          {enviando ? 'Cobrando…' : 'COBRAR · F12'}
        </Button>
        {bloqueo === null ? null : <p className="text-center text-sm font-medium">{bloqueo}</p>}
      </section>

      {/* La cuenta: siempre a la vista en PC; en tableta y teléfono, plegada en una
          sola línea, porque es para cuando alguien pregunta. */}
      <section aria-label={voc.conArticulo('orden')} className="xl:order-1">
        {/* `details` nativo: el teclado y el lector de pantalla ya saben abrirlo. */}
        <Superficie como="details" relleno={0} className="group xl:hidden">
          <summary className="flex min-h-(--area-tactil-minima) cursor-pointer list-none items-center justify-between gap-(--espacio-2) px-(--espacio-3) text-sm">
            <span className="font-medium">{cuantos}</span>
            <span className="flex items-center gap-(--espacio-1) text-texto-sutil">
              ver el desglose
              <ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-borde p-(--espacio-3)">{detalle}</div>
        </Superficie>
        <Superficie relleno={4} className="hidden flex-col gap-(--espacio-3) xl:flex">
          <h2 className="text-sm font-semibold tracking-wide text-texto-sutil uppercase">
            {voc.conArticulo('orden')} · {cuantos}
          </h2>
          {detalle}
        </Superficie>
      </section>
    </div>
  );
}
