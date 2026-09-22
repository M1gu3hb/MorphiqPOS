'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Dinero, Esqueleto, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { ReceiptText } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';

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
 * ── La única fricción deliberada: el desglose del pago mixto ─────────────
 * Tres campos que tienen que sumar EXACTO, con el botón apagado hasta que
 * cuadren. Con centavos enteros la tolerancia de ±$0.01 del documento sobra:
 * cuadra o no cuadra, y con eso desaparece una clase entera de descuadre que
 * sólo se descubre en el arqueo de las once de la noche.
 *
 * ── La propina pendiente es un muro, no un aviso ─────────────────────────
 * Cobrar con la propina sin decidir deja al mesero sin su parte y sin manera de
 * reclamarla: el cobro ya se selló.
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
 */

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'] as const;
type Metodo = (typeof METODOS)[number];
type MetodoBase = Exclude<Metodo, 'mixto'>;
const BASES: readonly MetodoBase[] = ['efectivo', 'tarjeta', 'transferencia'];
/** Los `propina_tipo` que significan «todavía nadie la decidió». */
const SIN_DECIDIR = ['pendiente', 'pendiente_cliente', 'decidir_en_caja'];
/** En PUNTOS BASE, como viaja el porcentaje en el sistema. El 0 es «sin». */
const PROPINAS = [1000, 1250, 1500, 0];

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

/** Lo que teclea el cajero. `null` es «esto no es un importe», nunca cero. */
export function centavosDeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/[\s,$]/g, '');
  if (limpio === '') return 0;
  const partes = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(limpio);
  if (partes === null) return null;
  return Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(monto: number): string {
  const bruto = Math.abs(monto);
  const con = String(Math.trunc(bruto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${monto < 0 ? '-' : ''}$${con}.${(bruto % 100).toString().padStart(2, '0')}`;
}

/** Qué impide cobrar, dicho con palabras y no sólo con un botón apagado. */
function bloqueoDe(
  pendiente: boolean,
  total: number,
  metodo: Metodo,
  mano: number,
  suma: number,
  voc: Vocabulario,
) {
  if (pendiente) return 'Confirma la propina antes de cobrar.';
  if (total <= 0) return `${voc.conDeterminante('este', 'orden')} no tiene importe que cobrar.`;
  if (metodo === 'efectivo' && mano < 0) return 'Lo recibido no es un importe.';
  if (metodo === 'efectivo') return mano > 0 && mano < total ? 'Lo recibido no alcanza.' : null;
  if (metodo !== 'mixto' || suma === total) return null;
  if (suma < 0) return 'Alguno de los tres importes no es un número.';
  const falta = total - suma;
  return falta > 0 ? `Faltan ${enPesos(falta)} por desglosar.` : `Sobran ${enPesos(-falta)}.`;
}

/**
 * Los renglones de `venta.cobrar`. La propina se reconoce de efectivo hacia
 * abajo: el billete que el comensal deja de más va a la bolsa del mesero esa
 * misma noche, y la de tarjeta espera a la liquidación.
 */
function renglonesDePago(
  metodo: Metodo,
  partes: Record<MetodoBase, string>,
  venta: number,
  propina: number,
  mano: number,
): readonly Record<string, unknown>[] {
  if (metodo !== 'mixto') {
    const enMano = metodo === 'efectivo' && mano > 0 ? { recibidoCentavos: mano } : {};
    return [{ metodo, montoCentavos: venta, propinaCentavos: propina, ...enMano }];
  }
  let porAsignar = propina;
  return BASES.map((base) => {
    const importe = centavosDeTexto(partes[base]) ?? 0;
    const suya = Math.min(importe, porAsignar);
    porAsignar -= suya;
    return { metodo: base, montoCentavos: importe - suya, propinaCentavos: suya };
  }).filter((renglon) => renglon.montoCentavos > 0 || renglon.propinaCentavos > 0);
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
  const [recibido, setRecibido] = useState('');
  const [partes, setPartes] = useState<Record<MetodoBase, string>>({
    efectivo: '',
    tarjeta: '',
    transferencia: '',
  });
  const [propina, setPropina] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cambio, setCambio] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError(
          fallo instanceof Error ? fallo.message : `No se pudo leer ${voc.enFrase('orden')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [cuentaInicial, cuentaId, voc]);

  const venta = aCentavos(cuenta?.total);
  const suPropina = propina ?? aCentavos(cuenta?.propina_monto);
  const total = venta + suPropina;
  const pendiente = propina === null && SIN_DECIDIR.includes(cuenta?.propina_tipo ?? '');
  const mano = centavosDeTexto(recibido) ?? -1;
  const suma = BASES.reduce((suman, base) => suman + (centavosDeTexto(partes[base]) ?? -1), 0);
  const bloqueo = bloqueoDe(pendiente, total, metodo, mano, suma, voc);
  // La pantalla no se vacía por un error: la banda va encima del último dato.
  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="rounded-md border border-peligro bg-peligro/10 p-2 text-sm text-texto"
      >
        {error} · La cuenta NO se marcó como pagada.
      </p>
    );

  async function cobrar(id: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const hecho = await invocarComando<{ readonly cambioCentavos: string }>('/api/venta/cobrar', {
        ordenId: id,
        pagos: renglonesDePago(metodo, partes, venta, suPropina, mano),
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

  // Esqueletos con la forma del cobro: así el total no salta de sitio al cargar.
  if (cuenta === undefined) {
    return (
      <div className="grid gap-(--espacio-4) p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Esqueleto className="h-64 w-full" />
        <Esqueleto className="h-64 w-full" />
        {banda}
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
        {banda}
      </div>
    );
  }
  if (cambio !== null) {
    return (
      <div role="status" className="mx-auto max-w-lg p-(--espacio-4)">
        {/* COBRADO · el cambio pesa más que el total, porque es lo único que queda
            por hacer: contarlo y darlo. El total ya se leyó en voz alta. */}
        <Superficie
          nivel={2}
          relleno={6}
          como="section"
          className="flex flex-col items-center gap-(--espacio-3) text-center"
        >
          <p className="text-sm font-medium tracking-wide text-exito uppercase">Cobrado</p>
          <span className="flex flex-col items-center gap-(--espacio-1)">
            <span className="text-xs text-texto-sutil">Cambio</span>
            <Dinero centavos={cambio} tamano="total" />
          </span>
          <p className="text-sm text-texto-sutil">
            Se cobraron <Dinero centavos={total} tamano="sm" /> ·{' '}
            {voc.conArticulo('unidad_servicio')} pasa sola a limpieza.
          </p>
          <Button className="w-full" onClick={() => onImprimir?.(cuenta.id)}>
            Imprimir ticket
          </Button>
        </Superficie>
      </div>
    );
  }

  const detalle = (
    <Superficie relleno={4}>
      <ul className="flex flex-col gap-(--espacio-1) text-sm">
        {lineas.map((linea) => (
          <li key={linea.id} className="flex items-baseline justify-between gap-(--espacio-3)">
            <span className="truncate">
              {/* La cantidad en cifras tabulares: una columna de «2 ×», «12 ×» que
                  no está alineada se relee, y aquí se relee con gente esperando. */}
              <span className="font-numeros tabular-nums">{linea.cantidad ?? 1}</span> ×{' '}
              {linea.producto_nombre ?? 'Platillo'}
            </span>
            <Dinero centavos={aCentavos(linea.total)} tamano="sm" />
          </li>
        ))}
      </ul>
      <dl className="mt-(--espacio-3) grid grid-cols-2 gap-y-(--espacio-1) border-t border-borde pt-(--espacio-3) text-sm">
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
    </Superficie>
  );

  function elegirMetodo(evento: MouseEvent<HTMLButtonElement>): void {
    setMetodo(evento.currentTarget.value as Metodo);
  }
  function elegirPropina(evento: MouseEvent<HTMLButtonElement>): void {
    setPropina(Number(evento.currentTarget.value));
  }

  return (
    <div className="grid gap-(--espacio-4) p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_26rem]">
      <h1 className="text-xl font-bold xl:col-span-2">
        Cobro · {cuenta.codigo_caja ?? 'sin código'} · {cuenta.cliente_nombre ?? 'sin nombre'}
      </h1>
      <div className="xl:col-span-2">{banda}</div>
      {/* El cobro va primero en el DOM: en teléfono es lo único que se ve. */}
      <section
        aria-label="Cobro"
        className="flex flex-col gap-(--espacio-3) xl:order-2 xl:self-start"
      >
        {/* EL TOTAL, en la superficie más alta de la pantalla y a solas.
            Sube de nivel 1 a 2 a propósito: lo que se lee desde el otro lado del
            mostrador tiene que separarse del papel, no compartir plano con el
            desglose. Y el rótulo va DEBAJO del número: lo que el ojo busca es la
            cifra, y la palabra «total» sólo confirma qué es. */}
        <Superficie nivel={2} relleno={4} className="flex flex-col items-center gap-(--espacio-1)">
          <Dinero centavos={total} tamano="total" />
          <p className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
            Total a cobrar
          </p>
        </Superficie>
        {/* «Sin propina» pesa lo mismo que los porcentajes: es voluntaria. */}
        {pendiente && (
          <div className="flex flex-col gap-(--espacio-2) rounded-lg border border-advertencia bg-advertencia/10 p-(--espacio-3)">
            <p role="alert" className="text-sm font-medium">
              Confirma la propina antes de cobrar.
            </p>
            <div className="grid grid-cols-4 gap-(--espacio-2)">
              {PROPINAS.map((puntos) => (
                <Button
                  key={puntos}
                  value={Math.round((venta * puntos) / 10000)}
                  variant="outline"
                  className="h-auto flex-col py-(--espacio-3)"
                  onClick={elegirPropina}
                >
                  <span>{puntos === 0 ? 'Sin' : `${puntos / 100} %`}</span>
                  <Dinero
                    centavos={Math.round((venta * puntos) / 10000)}
                    tamano="xs"
                    className="text-texto-sutil"
                  />
                </Button>
              ))}
            </div>
          </div>
        )}
        {/* La palomita: el color no puede ser el único que diga cuál está. */}
        <div className="grid grid-cols-2 gap-(--espacio-2) xl:grid-cols-1">
          {METODOS.map((opcion) => (
            <Button
              key={opcion}
              value={opcion}
              variant={metodo === opcion ? 'default' : 'outline'}
              aria-pressed={metodo === opcion}
              className="justify-between capitalize"
              onClick={elegirMetodo}
            >
              {opcion}
              <span aria-hidden>{metodo === opcion ? '✓' : ''}</span>
            </Button>
          ))}
        </div>
        {metodo === 'efectivo' && (
          <label className="flex flex-col gap-(--espacio-1) text-sm">
            Recibido
            <Input
              inputMode="decimal"
              value={recibido}
              onChange={(evento) => {
                setRecibido(evento.target.value);
              }}
            />
            {/* El cambio, al peso de un dato y no de una etiqueta: es el número que
                el cajero saca del cajón, y se equivoca si lo tiene que buscar. */}
            <span className="flex items-baseline justify-between">
              <span className="text-texto-sutil">Cambio</span>
              <Dinero centavos={Math.max(mano - total, 0)} tamano="lg" />
            </span>
          </label>
        )}
        {/* El desglose exacto: cada campo lleva el importe COMPLETO que entra por
            ese método —venta y propina juntas—, que es lo que el cajero ve pasar;
            separarlas es aritmética, no una segunda cuenta que pedirle a mano. */}
        {metodo === 'mixto' &&
          BASES.map((base) => (
            <label key={base} className="flex flex-col gap-(--espacio-1) text-sm capitalize">
              {base}
              <Input
                inputMode="decimal"
                value={partes[base]}
                onChange={(evento) => {
                  setPartes({ ...partes, [base]: evento.target.value });
                }}
              />
            </label>
          ))}
        <Button
          size="lg"
          cargando={enviando}
          className="w-full text-lg"
          disabled={enviando || bloqueo !== null}
          onClick={() => {
            void cobrar(cuenta.id);
          }}
        >
          {enviando ? 'Cobrando…' : 'COBRAR · F12'}
        </Button>
        {bloqueo !== null && <p className="text-center text-sm">{bloqueo}</p>}
      </section>
      {/* `details` nativo: el teclado y el lector de pantalla ya saben abrirlo. */}
      <section aria-label={voc.conArticulo('orden')} className="xl:order-1">
        <details className="rounded-lg border border-borde xl:hidden">
          <summary className="flex cursor-pointer items-baseline justify-between p-(--espacio-3) text-sm">
            <span>{lineas.length} platillos</span>
            <span className="text-texto-sutil">ver el desglose</span>
          </summary>
          {detalle}
        </details>
        <div className="hidden xl:block">{detalle}</div>
      </section>
    </div>
  );
}
