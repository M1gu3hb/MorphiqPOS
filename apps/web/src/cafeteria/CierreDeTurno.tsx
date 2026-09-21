'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@morphiqpos/ui/primitivas/accordion';
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
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · cierre-de-turno-y-arqueo
 *
 * Dos veces al día: el barista saliente cuenta y la dueña mira.
 *
 * ── Los DOS arqueos a ciegas son la regla que define la pantalla ─────────
 * Los cuatro campos van primero, vacíos, con el foco en el primero, y los
 * esperados NO existen hasta después. Enseñarlos antes convierte el arqueo en
 * un dictado: se teclea el número que se ve y deja de ser un control.
 *
 * Y va un paso más allá del enunciado: el efectivo esperado **no viaja al
 * navegador** antes del cierre. Lo deriva `caja.cerrar` dentro de su propia
 * transacción y llega en la respuesta. Un esperado precargado, aunque esté
 * tapado por CSS, se lee abriendo las herramientas del navegador — y quien
 * cierra la caja es justo quien tendría motivo para mirarlo.
 *
 * ── El bloqueo por pedidos sin entregar, verificado DOS veces ────────────
 * F-262. Una al cargar —la banda de arriba— y otra contra el servidor al tocar
 * CERRAR TURNO: los dos minutos del conteo alcanzan para que alguien cobre un
 * café. Tres salidas y sólo tres, sin puerta trasera.
 *
 * ── «Confirmar reparto» y no «Guardar» ───────────────────────────────────
 * Porque lo que pasa después del botón es que se cuentan billetes sobre la
 * barra. Va DESPUÉS del cierre porque `cafeteria.repartir_bote` exige la sesión
 * cerrada: repartir un bote abierto es repartir un número que aún va a cambiar.
 *
 * ── Una columna, secciones colapsables, el conteo fijo arriba ────────────
 * El teléfono importa aquí: hay dueñas que cierran desde el teléfono mientras
 * el barista cuenta. En PC el conteo se queda pegado a la izquierda y las cinco
 * secciones se leen en el orden del PDF, que es el que quien cierra ya sabe.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * `Bebidas`, `Comisión estimada`, el canal y la merma de barra no tienen campo
 * en el puente: entran por props o se pintan «—». En una pantalla de arqueo no
 * se inventa un número. El bote esperado sí se deriva aquí, de
 * `Venta.propina_efectivo`, así que es menos ciego que el efectivo. Y el PDF
 * que «se descarga solo» necesita una ruta de impresión que aún no existe: en
 * su lugar se enseña el folio del corte.
 */

const RUTA_CERRAR = '/api/caja/cerrar';
const RUTA_REPARTIR = '/api/propinas/repartir-bote';
const RUTA_ENTREGAR = '/api/cafeteria/entregar-pedido';
const RUTA_NADIE_VINO = '/api/cafeteria/no-recogido';

/** Hasta $20 de descuadre es morralla; más arriba es una pregunta. */
const TOLERANCIA_CENTAVOS = 2_000;
const CAJA = 'rounded-lg border border-border bg-card p-3 text-card-foreground';
const CIFRA = 'flex items-baseline justify-between gap-2 border-b border-border py-1';

/** Los cuatro campos del conteo. Los dos primeros son obligatorios. */
const CAMPOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo contado en el cajón *', grande: true },
  { clave: 'bote', etiqueta: 'Bote de propina contado *', grande: true },
  { clave: 'dejado', etiqueta: 'Dinero que dejas en caja', grande: false },
  { clave: 'cambio', etiqueta: '· de eso, en cambio', grande: false },
] as const;

export interface Cifra {
  readonly etiqueta: string;
  readonly valor: string;
}

/** Los nombres son los del PUENTE, en snake_case. Aquí no se traduce nada. */
export interface TurnoDeCierre {
  readonly id: string;
  readonly estado: string | null;
  readonly usuario_apertura_nombre: string | null;
}

export interface VentaDelTurno {
  readonly estado: string | null;
  readonly total: number | null;
  readonly costo_total_snapshot: number | null;
  readonly propina_efectivo: number | null;
}

export interface GastoDelTurno {
  readonly monto: number | null;
}

export interface PedidoEnFila {
  readonly id: string;
  readonly estado: string | null;
  readonly nombre_pedido: string | null;
  readonly created_date: string | null;
  readonly items?: readonly { readonly id: string; readonly producto_nombre: string | null }[];
}

/** Lo que responde `caja.cerrar`: aquí nacen los esperados y los semáforos. */
interface ResultadoCierre {
  readonly sesionCajaId: string;
  readonly serie: string;
  readonly folio: string;
  readonly efectivoEsperadoCentavos: string;
  readonly diferenciaCentavos: string;
}

interface ParteDelBote {
  readonly empleoId: string;
  readonly minutos: number;
  readonly montoCentavos: string;
}

export interface CierreDeTurnoProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly turnoInicial?: TurnoDeCierre | null;
  readonly ventasIniciales?: readonly VentaDelTurno[];
  readonly gastosIniciales?: readonly GastoDelTurno[];
  readonly filaInicial?: readonly PedidoEnFila[];
  readonly canalesIniciales?: readonly Cifra[];
  readonly mermasIniciales?: readonly Cifra[];
  readonly onCerrado?: (sesionCajaId: string) => void;
}

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
export function aCentavos(valor: number | string | null | undefined): number {
  const numero = typeof valor === 'string' ? Number(valor.replace(/[^\d.-]/g, '')) : (valor ?? 0);
  if (!Number.isFinite(numero)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(numero).toFixed(2).split('.');
  return (numero < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const bruto = Math.abs(centavos);
  const miles = Math.trunc(bruto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

/** El semáforo del arqueo. La palabra manda; el color sólo acompaña. */
export function semaforo(diferencia: number): { readonly clase: string; readonly palabra: string } {
  if (diferencia === 0) return { clase: 'bg-success/25', palabra: 'cuadró exacto' };
  if (Math.abs(diferencia) <= TOLERANCIA_CENTAVOS) {
    return { clase: 'bg-warning/25', palabra: diferencia > 0 ? 'sobra poco' : 'falta poco' };
  }
  return { clase: 'bg-destructive/25', palabra: diferencia > 0 ? 'SOBRA' : 'FALTA' };
}

/** Minutos que un pedido lleva esperando desde que se cobró. */
export function minutosEsperando(desde: string | null, ahora: number): number {
  if (desde === null) return 0;
  const minutos = Math.floor((ahora - new Date(desde).getTime()) / 60_000);
  return Number.isNaN(minutos) || minutos < 0 ? 0 : minutos;
}

/** Las diez cifras del §2, en el orden del PDF. Lo que no hay se pinta «—». */
export function resumenDelTurno(
  ventas: readonly VentaDelTurno[],
  gastos: readonly GastoDelTurno[],
): readonly Cifra[] {
  const cobradas = ventas.filter((v) => v.estado !== 'cancelada' && v.estado !== 'abierta');
  const total = cobradas.reduce((suma, v) => suma + aCentavos(v.total), 0);
  const costo = cobradas.reduce((suma, v) => suma + aCentavos(v.costo_total_snapshot), 0);
  const gasto = gastos.reduce((suma, g) => suma + aCentavos(g.monto), 0);
  const bruta = total - costo;
  return [
    { etiqueta: 'Ventas', valor: enPesos(total) },
    { etiqueta: 'Tickets', valor: String(cobradas.length) },
    {
      etiqueta: 'Ticket promedio',
      valor: enPesos(cobradas.length === 0 ? 0 : Math.round(total / cobradas.length)),
    },
    { etiqueta: 'Bebidas', valor: '—' },
    { etiqueta: 'Comisión estimada', valor: '—' },
    { etiqueta: 'Costo', valor: enPesos(costo) },
    { etiqueta: 'Utilidad bruta', valor: enPesos(bruta) },
    { etiqueta: 'Margen', valor: total === 0 ? '—' : `${((bruta / total) * 100).toFixed(1)} %` },
    { etiqueta: 'Gastos', valor: enPesos(gasto) },
    { etiqueta: 'Utilidad neta estimada', valor: enPesos(bruta - gasto) },
  ];
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    // El límite de intentos no es un código de la API: es el 429.
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera un momento.';
    return fallo.message;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';
}

/** La fila que sigue viva. El servidor manda; esto sólo la pinta. */
async function leerFila(signal?: AbortSignal): Promise<readonly PedidoEnFila[]> {
  const filas = await consultarPuente<PedidoEnFila>('PedidoPreparacion', {
    limite: 60,
    ...(signal === undefined ? {} : { signal }),
  });
  return filas.filter((f) => f.estado !== 'entregada' && f.estado !== 'cancelada');
}

/** Dos columnas de etiqueta y número. La misma forma en las tres secciones. */
function Cifras({ lista, vacio }: { readonly lista: readonly Cifra[]; readonly vacio: string }) {
  if (lista.length === 0) return <p className="text-muted-foreground">{vacio}</p>;
  return (
    <dl className="grid gap-x-6 sm:grid-cols-2">
      {lista.map((cifra) => (
        <div key={cifra.etiqueta} className={CIFRA}>
          <dt className="text-muted-foreground">{cifra.etiqueta}</dt>
          <dd className="font-medium tabular-nums">{cifra.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CierreDeTurno({
  turnoInicial,
  ventasIniciales,
  gastosIniciales,
  filaInicial,
  canalesIniciales,
  mermasIniciales,
  onCerrado,
}: CierreDeTurnoProps) {
  const voc = useVocabulario();
  // `undefined` es «todavía no se sabe»; `null` es «no hay turno abierto».
  const [turno, setTurno] = useState<TurnoDeCierre | null | undefined>(turnoInicial);
  const [ventas, setVentas] = useState<readonly VentaDelTurno[]>(ventasIniciales ?? []);
  const [gastos, setGastos] = useState<readonly GastoDelTurno[]>(gastosIniciales ?? []);
  const [fila, setFila] = useState<readonly PedidoEnFila[]>(filaInicial ?? []);
  const [conteo, setConteo] = useState<Readonly<Record<string, string>>>({});
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);
  const [partes, setPartes] = useState<readonly ParteDelBote[] | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /**
   * El reloj NO se lee durante el render. Leerlo ahí da un valor en el
   * servidor y otro en el navegador —un desajuste de hidratación por cada
   * pedido de la fila— y además hace impura la función. Entra por el efecto y
   * avanza solo, porque «esperando 4 min» deja de ser cierto en 60 segundos.
   */
  const [reloj, setReloj] = useState(0);
  useEffect(() => {
    const tic = (): void => {
      setReloj(Date.now());
    };
    const primero = setTimeout(tic);
    const cada = setInterval(tic, 30_000);
    return () => {
      clearTimeout(primero);
      clearInterval(cada);
    };
  }, []);

  useEffect(() => {
    if (turnoInicial !== undefined) return;
    // Centinela real y no un `let vivo`: el compilador da por siempre-cierto un
    // booleano que sólo cambia en la limpieza, y la lectura no se cancelaría.
    const control = new AbortController();
    const senal = control.signal;
    Promise.all([
      consultarPuente<TurnoDeCierre>('CorteCaja', { limite: 5, signal: senal }),
      consultarPuente<VentaDelTurno>('Venta', { limite: 400, signal: senal }),
      consultarPuente<GastoDelTurno>('GastoOperativo', { limite: 100, signal: senal }),
      leerFila(senal),
    ])
      .then(([turnos, deVenta, deGasto, enFila]) => {
        setTurno(turnos.find((t) => t.estado === 'abierto') ?? null);
        setVentas(deVenta);
        setGastos(deGasto);
        setFila(enFila);
      })
      .catch((fallo: unknown) => {
        // La pantalla NO se vacía por un error de red: se dice qué pasó y se
        // deja contar, que es lo único que no depende del servidor.
        if (senal.aborted) return;
        setTurno(null);
        setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [turnoInicial]);

  const cifras = useMemo(() => resumenDelTurno(ventas, gastos), [ventas, gastos]);
  const boteEsperado = ventas.reduce((suma, v) => suma + aCentavos(v.propina_efectivo), 0);
  const contadoBote = aCentavos(conteo['bote']);
  const faltaContar =
    (conteo['efectivo'] ?? '').trim() === '' || (conteo['bote'] ?? '').trim() === '';
  const cerrado = resultado !== null;

  /** Las tres salidas del diálogo y ninguna más. */
  async function resolverPedido(pedidoId: string, ruta: string): Promise<void> {
    setError(null);
    try {
      await invocarComando(ruta, { pedidoId });
      const quedan = await leerFila();
      setFila(quedan);
      if (quedan.length === 0) setDialogo(false);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    }
  }

  async function cerrarTurno(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      // F-262, segunda verificación: entre el conteo y el toque alguien pudo
      // cobrar un café, y ese café ya está en la fila.
      const enFila = await leerFila();
      if (enFila.length > 0) {
        setFila(enFila);
        setDialogo(true);
        return;
      }
      /**
       * UN SOLO COMANDO, y ésta es la corrección.
       *
       * Aquí había una llamada previa a `/api/cafeteria/contar-bote` con un
       * comentario que decía «el documento no nombra la ruta y todavía no existe
       * ninguna». **No existía.** El 404 devolvía la página de error de Next, que
       * no es `{ok, datos}`, así que el cliente decía «El servidor respondió algo
       * inesperado» y el turno no se cerraba NUNCA — ni el bote se contaba, ni la
       * caja se cerraba, porque el cierre venía después.
       *
       * El bote va ahora dentro de `caja.cerrar`: se cuenta el cajón y se cuenta
       * el bote con las manos en el mismo dinero y en el mismo momento, así que
       * es una sola transacción. Y `cafeteria.repartir_bote`, que EXIGE ese
       * número, por fin lo encuentra escrito.
       *
       * Lo que NO se guarda todavía —y se dice en vez de fingir— es «dinero que
       * dejas en caja» y «de eso, en cambio»: `sesiones_caja` no tiene columnas
       * para ellos. Se siguen pidiendo porque ayudan a quien cuenta, y el día que
       * haya que conservarlos hará falta una migración.
       */
      const corte = await invocarComando<ResultadoCierre>(RUTA_CERRAR, {
        efectivoContadoCentavos: aCentavos(conteo['efectivo']),
        boteContadoCentavos: contadoBote,
      });
      setResultado(corte);
      onCerrado?.(corte.sesionCajaId);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarReparto(sesionCajaId: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const hecho = await invocarComando<{ readonly partes: readonly ParteDelBote[] }>(
        RUTA_REPARTIR,
        { sesionCajaId },
      );
      setPartes(hecho.partes);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  if (turno === undefined) {
    return (
      <div className="grid gap-3 p-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Esqueletos con la forma del conteo y del resumen, nunca un spinner:
            así nada salta de sitio cuando llegan los datos. */}
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (turno === null && !cerrado) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <p className="text-xl font-semibold">No hay ningún turno abierto que cerrar.</p>
        <p className="text-muted-foreground">
          El cierre cuenta dos recipientes físicos —el cajón y el bote— contra lo que el turno dice
          que debería haber. Sin turno no hay contra qué contar: el turno se abre al empezar el día,
          con el fondo desglosado por denominación.
        </p>
        <Button asChild>
          <a href="/cafeteria/turno">Abrir el turno</a>
        </Button>
        {error !== null && (
          <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-2">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3 pb-8 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
      <header className="flex flex-wrap items-baseline justify-between gap-2 xl:col-span-2">
        <h1 className="text-xl font-bold">Cierre de turno</h1>
        <p className="text-sm text-muted-foreground">
          {turno?.usuario_apertura_nombre ?? 'Turno sin nombre'}
          {resultado === null ? '' : ` · corte ${resultado.serie}-${resultado.folio}`}
        </p>
      </header>

      {error !== null && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/15 p-2 text-sm xl:col-span-2"
        >
          {error} · No se cerró ni se repartió nada.
        </p>
      )}

      {fila.length > 0 && !cerrado && (
        <p
          role="alert"
          className="rounded-md border border-warning/60 bg-warning/15 p-2 text-sm xl:col-span-2"
        >
          Hay {fila.length} pedido(s) cobrados que nadie ha entregado. El turno no cierra hasta
          resolverlos uno por uno.
        </p>
      )}

      {/* 1 · CONTEO. Fijo arriba en teléfono y tablet, pegado a la izquierda en
          PC: es lo primero, y lo único obligatorio de la pantalla. */}
      <section
        aria-label="Conteo del cajón y del bote"
        className={`sticky top-0 z-20 space-y-3 ${CAJA} xl:static`}
      >
        <div className="grid grid-cols-2 gap-2">
          {CAMPOS.map((campo) => (
            <div key={campo.clave} className={campo.grande ? 'col-span-2 space-y-1' : 'space-y-1'}>
              <Label htmlFor={`cierre-${campo.clave}`}>{campo.etiqueta}</Label>
              <Input
                id={`cierre-${campo.clave}`}
                inputMode="decimal"
                autoFocus={campo.clave === 'efectivo'}
                disabled={cerrado}
                placeholder="$ 0.00"
                value={conteo[campo.clave] ?? ''}
                className={campo.grande ? 'min-h-20 text-2xl tabular-nums' : 'tabular-nums'}
                onChange={(evento) => {
                  setConteo({ ...conteo, [campo.clave]: evento.target.value });
                }}
              />
            </div>
          ))}
        </div>

        {/* ... y HASTA ENTONCES los dos esperados con sus dos semáforos. */}
        {resultado !== null && (
          <dl className="space-y-2 border-t border-border pt-2 text-sm">
            {[
              {
                nombre: 'Cajón',
                esperado: Number(resultado.efectivoEsperadoCentavos),
                diferencia: Number(resultado.diferenciaCentavos),
              },
              { nombre: 'Bote', esperado: boteEsperado, diferencia: contadoBote - boteEsperado },
            ].map((arqueo) => {
              const marca = semaforo(arqueo.diferencia);
              return (
                <div key={arqueo.nombre} className={`rounded-md px-2 py-1 ${marca.clase}`}>
                  <dt className="font-medium">
                    {arqueo.nombre} · esperado {enPesos(arqueo.esperado)}
                  </dt>
                  {/* El color nunca va solo: cada tramo trae su palabra. */}
                  <dd className="tabular-nums">
                    {enPesos(arqueo.diferencia)} · {marca.palabra}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        {!cerrado && (
          <>
            <Button
              size="lg"
              className="min-h-20 w-full text-lg"
              disabled={enviando || faltaContar}
              onClick={() => {
                void cerrarTurno();
              }}
            >
              {enviando ? 'Cerrando…' : 'CERRAR TURNO'}
            </Button>
            {/* Un botón apagado sin razón es un muro mudo. */}
            {faltaContar && (
              <p className="text-center text-sm text-muted-foreground">
                Cuenta el cajón y el bote. Los dos, antes de ver nada.
              </p>
            )}
          </>
        )}
      </section>

      {/* 2 a 5 · en el orden del PDF y colapsables, porque en teléfono la dueña
          baja con el pulgar mientras el barista cuenta. */}
      <Accordion
        type="multiple"
        defaultValue={['resumen', 'canal', 'bote', 'merma']}
        className={CAJA}
      >
        <AccordionItem value="resumen">
          <AccordionTrigger>Resumen del turno (sin propinas)</AccordionTrigger>
          <AccordionContent>
            <Cifras lista={cifras} vacio="Este turno todavía no tiene ventas." />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="canal">
          <AccordionTrigger>{voc.titulo('linea_orden', true)} por canal</AccordionTrigger>
          <AccordionContent>
            <Cifras
              lista={canalesIniciales ?? []}
              vacio="El puente aún no expone el canal de la venta ni el empaque consumido; en cuanto lo haga, aquí van Aquí · Para llevar · Plataforma."
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bote">
          <AccordionTrigger>Bote y reparto</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-lg font-semibold tabular-nums">
              Total a repartir: {cerrado ? enPesos(contadoBote) : '—'}
            </p>
            {partes === null ? (
              <>
                <p className="text-muted-foreground">
                  Se reparte por las horas de cada quien y se confirma delante de las personas del
                  turno: después del botón se cuentan billetes sobre la barra.
                </p>
                <Button
                  variant="secondary"
                  className="min-h-20 w-full"
                  disabled={enviando || !cerrado}
                  onClick={() => {
                    if (resultado !== null) void confirmarReparto(resultado.sesionCajaId);
                  }}
                >
                  {cerrado ? 'Confirmar reparto' : 'Primero cierra el turno'}
                </Button>
              </>
            ) : (
              <ul>
                {partes.map((parte) => (
                  <li key={parte.empleoId} className={CIFRA}>
                    <span>
                      {parte.empleoId} · {Math.floor(parte.minutos / 60)} h {parte.minutos % 60} min
                    </span>
                    <span className="font-medium tabular-nums">
                      {enPesos(Number(parte.montoCentavos))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="merma">
          <AccordionTrigger>Merma de {voc.singular('preparacion')} del turno</AccordionTrigger>
          <AccordionContent>
            <Cifras
              lista={mermasIniciales ?? []}
              vacio="Sin merma registrada en este turno. Se registra desde la barra, en el momento en que se tira la bebida, no aquí."
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* F-262 · tres salidas y sólo tres. No hay «cerrar de todos modos». */}
      <Dialog
        open={dialogo}
        onOpenChange={(abierto) => {
          setDialogo(abierto);
        }}
      >
        <DialogContent className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {voc.titulo('unidad_servicio', true)} cobrad{voc.terminacion('unidad_servicio', true)}{' '}
              que nadie ha entregado
            </DialogTitle>
            <DialogDescription>
              Cada uno es un café pagado. Resuélvelos y vuelve a tocar CERRAR TURNO.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {fila.map((pedido) => (
              <li key={pedido.id} className="space-y-2 rounded-md border border-border p-2">
                <p className="font-medium">
                  {pedido.nombre_pedido ?? 'Sin nombre'} ·{' '}
                  {pedido.items?.[0]?.producto_nombre ?? 'Bebida'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Esperando {minutosEsperando(pedido.created_date, reloj)} min
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      void resolverPedido(pedido.id, RUTA_ENTREGAR);
                    }}
                  >
                    Entregarlo
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void resolverPedido(pedido.id, RUTA_NADIE_VINO);
                    }}
                  >
                    Nadie vino
                  </Button>
                  {/* Devolver el dinero: saca el efectivo del cajón con su
                      renglón y deja los pagos en «reembolsado», para que el corte
                      no cuente una venta que se devolvió. */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void resolverPedido(pedido.id, '/api/venta/devolver');
                    }}
                  >
                    Devolverlo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
