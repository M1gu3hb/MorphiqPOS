'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
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
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import {
  Banknote,
  Check,
  ChevronRight,
  CircleCheckBig,
  CreditCard,
  Info,
  Landmark,
  NotebookPen,
  Timer,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { AvisoSinConexion, useEnLinea } from '~/cliente/en-linea';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · caja
 *
 * Cobrar la nota que el mostrador armó. 25 a 60 veces al día, siempre con una
 * persona enfrente y casi siempre con otra detrás de ella.
 *
 * ── Por qué es una pantalla aparte del mostrador ─────────────────────────
 * Por el modo B: el que despacha no cobra. Son dos personas y dos
 * responsabilidades, y juntarlas obligaría a la caja a ver el catálogo y al
 * mostrador a ver el dinero. En modo A el bloque de cobro se expande a la
 * derecha de la pantalla 1 — eso lo decide quien la monta, no este archivo.
 *
 * ── Cómo se ve en la PC, y por qué ───────────────────────────────────────
 * Dos columnas. A la izquierda, la cola: las notas por cobrar y, debajo, las
 * cerradas sin entregar, las dos como tablas densas con el total alineado a la
 * derecha —se comparan de un vistazo, como en el `04-INTERFAZ` §PANTALLA 4—. A la
 * derecha, la nota elegida: su TOTAL es lo más grande de la pantalla, porque es
 * el número que se dice en voz alta, y debajo los cuatro métodos. Al tocar una
 * nota, su fila VIAJA hasta el encabezado del panel (`VIAJE.fila`): con gente
 * enfrente, el movimiento le confirma a la cajera, sin leer, qué nota acaba de
 * abrir. El total y los métodos no viajan: son lo que la mano va a tocar.
 *
 * ── Por qué los cuatro métodos son del MISMO tamaño ──────────────────────
 * En abarrotes el efectivo gana 200 de 220 veces y los demás son desvíos. Aquí
 * los cuatro compiten de verdad, y presuponer uno sale caro: una venta de
 * $6,000 marcada como efectivo cuando entró por transferencia descuadra el
 * arqueo de forma escandalosa. Por eso «A cuenta» se ve tan disponible como
 * «Efectivo»: es un tercio del valor del giro, y esconderlo en un menú sería
 * negar la forma del negocio.
 *
 * ── Por qué «pagadas, sin entregar» no se puede plegar ───────────────────
 * Porque es el descuadre que hace que alguien entregue dos veces el mismo
 * material. Verla todo el día, aunque estorbe, es justo lo que lo evita.
 *
 * ── Por qué el saldo del cliente se repite aquí ──────────────────────────
 * Ya se vio en el mostrador, sí, pero quien cobra es OTRA persona y la
 * decisión de dar crédito es suya. El dato tiene que estar delante de quien
 * decide, no de quien decidió antes.
 *
 * ── Por qué el teléfono no es esta pantalla ──────────────────────────────
 * La caja no se opera desde el teléfono: el cajón, la impresora y la terminal
 * están en el mostrador. Lo único que se hace desde fuera es confirmar una
 * transferencia contra el banco, y eso es lo único que el teléfono trae —con o
 * sin notas en la caja: la cola no es asunto de quien está fuera—.
 *
 * ── Los tres fallos que tenía esta pantalla, y qué se hizo ───────────────
 * 1. Filtraba por `pendiente_cobro`, un estado que **no existe** en el `check`
 *    de `ordenes.estado`: su lista de notas pendientes no podía tener una fila
 *    nunca. Ahora lee `NotaDeCaja`, la vista `notas_de_caja` (169/170), cuyo
 *    estado se calcula de los dos reales —el de la orden dice si entró el
 *    dinero, el de la nota si salió el material—.
 * 2. Leía once campos que la entidad `Venta` no tiene —`codigo_caja`,
 *    `atendio`, `vence`, `saldo_cliente`…—, así que cada renglón habría salido
 *    «—» incluso con el estado arreglado. Ahora salen de la vista.
 * 3. Publicaba en `/api/venta/cobrar` un cuerpo que ese comando rechaza
 *    (`{ventaId, metodo}` en vez de `{ordenId, pagos:[…]}`): **la caja nunca
 *    cobró**. Ahora manda los pagos como el comando los pide.
 *
 * ── Y «A cuenta» no es un método de pago ─────────────────────────────────
 * `venta.cobrar` acepta efectivo, tarjeta y transferencia, y hace bien: a
 * cuenta **no entra dinero**. Lo que pasa es que el material sale firmado, y eso
 * es `credito.registrar_remision`: sube el saldo del cliente, toma folio de
 * remisión y sella quién recibió. Mandarlo por el cobro habría necesitado un
 * cuarto método que no mueve caja y dejaría el arqueo cuadrando de milagro.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. Apertura con denominaciones, movimientos, arqueo a ciegas y los cuatro
 *    bloqueos de cierre se heredan de `abarrotes` §PANTALLA 9 y viven en sus
 *    propias pantallas; por eso el pie muestra lo que esta lectura sí sabe
 *    —lo que falta por cobrar— y no el fondo del cajón, que no llega aquí.
 * 2. El desglose de pago mixto y el cálculo de cambio no caben en un archivo:
 *    esta pantalla sella un método por nota.
 */

/** Los cuatro métodos, en el orden del documento y con el mismo peso visual. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
  { clave: 'cuenta', etiqueta: 'A cuenta' },
] as const;

export type MetodoDeCobro = (typeof METODOS)[number]['clave'];

/** El icono de cada método: la palabra manda, el icono se reconoce de reojo. */
const ICONO_DE_METODO: Readonly<Record<MetodoDeCobro, LucideIcon>> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  transferencia: Landmark,
  // A cuenta sale material FIRMADO: es la libreta del crédito, no un cobro.
  cuenta: NotebookPen,
};

/**
 * Los tres estados que la vista calcula, escritos una vez.
 *
 * `por_entregar` se llama por lo que FALTA y no por lo que entró: la pregunta de
 * la segunda lista no es «¿ya pagaron?» sino «¿esto ya salió?», porque lo que
 * evita es entregar dos veces el mismo material. Una nota pagada en efectivo y
 * una firmada a crédito están en el mismo sitio: cerradas para la caja, con el
 * material todavía en el patio.
 */
const PENDIENTE = 'por_cobrar';
const POR_ENTREGAR = 'por_entregar';
const APARTADA = 'apartada';

/** Minutos de vigencia a partir de los cuales la nota ya se avisa. */
const AVISO_MINUTOS = 10;

/** Más de tres decimales en una cantidad de mostrador es ruido: nadie corta 6.2004 m. */
const DECIMALES_MAXIMOS = 3;

export interface NotaDeCaja {
  /** La ORDEN: es lo que `venta.cobrar` recibe y con lo que se leen sus partidas. */
  readonly id: string;
  /** La NOTA, para entregarla. No es lo mismo, y confundirlas cobra otra venta. */
  readonly nota_id: string | null;
  readonly codigo_caja: string | null;
  readonly cliente_nombre: string | null;
  readonly cliente_id: string | null;
  readonly obra: string | null;
  readonly recoge_nombre: string | null;
  readonly recoge_autorizado: boolean;
  readonly atendio: string | null;
  readonly creada: string | null;
  readonly vence: string | null;
  readonly estado: string | null;
  /** En CENTAVOS, como los sirve la vista. Sin división de ida y vuelta. */
  readonly totalCentavos: number | null;
  readonly saldoClienteCentavos: number | null;
  readonly limiteClienteCentavos: number | null;
}

/** F-212 · Una transferencia de crédito que todavía no se vio en el banco. */
export interface TransferenciaPendiente {
  readonly pagoId: string;
  readonly montoCentavos: string;
  readonly referencia: string | null;
  readonly horasEsperando: number;
}

export interface LineaDeNota {
  readonly id: string;
  readonly venta_id: string;
  readonly producto_nombre: string | null;
  readonly cantidad: number | null;
  readonly unidad: string | null;
  readonly total: number | null;
}

export interface CajaProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly notasIniciales?: readonly NotaDeCaja[];
  readonly lineasIniciales?: readonly LineaDeNota[];
  readonly transferenciasIniciales?: readonly TransferenciaPendiente[];
  readonly onCobrada?: (notaId: string, metodo: MetodoDeCobro) => void;
}

/**
 * Lo último que se leyó de `DetalleVenta`, CON la nota a la que pertenece: las
 * partidas de otra nota no son las de ésta, ni mientras llegan las suyas.
 */
interface LecturaDePartidas {
  readonly notaId: string;
  readonly filas: readonly LineaDeNota[];
  readonly fallo: string | null;
}

type Vocabulario = ReturnType<typeof useVocabulario>;

/** Pesos a centavos contando dígitos: `1234.995 * 100` pierde medio centavo. */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Minutos enteros que faltan. `null` cuando no caduca o todavía no hay reloj. */
export function minutosPara(vence: string | null, ahora: number | null): number | null {
  if (vence === null || ahora === null) return null;
  const limite = Date.parse(vence);
  if (Number.isNaN(limite)) return null;
  return Math.ceil((limite - ahora) / 60000);
}

function horaDe(iso: string | null): string {
  if (iso === null) return '';
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return '';
  return momento.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Una nota sin cliente es del mostrador, y así se dice en la lista. */
function nombreDe(nota: NotaDeCaja): string {
  return nota.cliente_nombre ?? 'mostrador';
}

/** El total de la nota, en centavos. Nulo es cero: una nota vacía no debe nada. */
function totalDe(nota: NotaDeCaja): number {
  return nota.totalCentavos ?? 0;
}

function sumaDe(notas: readonly NotaDeCaja[]): number {
  return notas.reduce((suma, nota) => suma + totalDe(nota), 0);
}

/** 120 piezas se leen «120»; 6.2 m de cable, «6.2». Nunca se redondea un corte. */
function decimalesDe(valor: number): number {
  if (Number.isInteger(valor)) return 0;
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(fraccion.length, DECIMALES_MAXIMOS);
}

/** El tono de una nota en la cola: sólo cuando su vigencia ya se avisa. */
function tonoDeVigencia(faltan: number | null): TonoDeFila | undefined {
  if (faltan === null || faltan > AVISO_MINUTOS) return undefined;
  return faltan > 0 ? 'advertencia' : 'peligro';
}

/** La vigencia, con palabras: el tono de la fila nunca va solo. */
function Vigencia({ faltan }: { readonly faltan: number | null }) {
  if (tonoDeVigencia(faltan) === undefined || faltan === null) return null;
  return (
    <span
      className={`inline-flex items-center gap-(--espacio-1) text-xs font-medium ${faltan > 0 ? '' : 'text-peligro'}`}
    >
      <Timer aria-hidden="true" className="size-3 shrink-0" />
      {faltan > 0 ? (
        <span>
          vence en <Cifra valor={faltan} unidad="min" tamano="xs" />
        </span>
      ) : (
        'ya venció'
      )}
    </span>
  );
}

interface ContextoDeLaCola {
  readonly notaId: string | null;
  readonly ahora: number | null;
  readonly voc: Vocabulario;
  readonly alElegir: (id: string) => void;
}

/**
 * LA COLA · folio grande, a quién es, y el total a la derecha.
 *
 * El folio es un BOTÓN y no sólo texto: es el número que el cliente canta en la
 * caja, y la cajera lo busca por él. La fila entera también se toca y se opera con
 * Enter; el botón no suma una parada de tabulador más por fila.
 */
function columnasDeLaCola({
  notaId,
  ahora,
  voc,
  alElegir,
}: ContextoDeLaCola): readonly ColumnaDeTabla<NotaDeCaja>[] {
  return [
    {
      clave: 'nota',
      titulo: voc.titulo('orden'),
      celda: (nota) => {
        const activa = nota.id === notaId;
        return (
          <button
            type="button"
            tabIndex={-1}
            aria-current={activa ? 'true' : undefined}
            onClick={() => {
              alElegir(nota.id);
            }}
            className="flex w-full items-start gap-(--espacio-1) text-left"
          >
            {/* La flecha, no sólo el fondo: señala el panel donde está abierta. */}
            <ChevronRight
              aria-hidden="true"
              className={`mt-1 size-4 shrink-0 ${activa ? 'text-primario' : 'invisible'}`}
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-numeros text-base font-semibold tabular-nums">
                {nota.codigo_caja ?? '—'}
              </span>
              <span className="text-xs text-texto-sutil">{nombreDe(nota)}</span>
              {/* Avisa ANTES de liberar el material, no después. */}
              <Vigencia faltan={minutosPara(nota.vence, ahora)} />
            </span>
          </button>
        );
      },
    },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      celda: (nota) => <Dinero centavos={totalDe(nota)} tamano="sm" />,
    },
  ];
}

function columnasDelAnden(voc: Vocabulario): readonly ColumnaDeTabla<NotaDeCaja>[] {
  return [
    {
      clave: 'nota',
      titulo: voc.titulo('orden'),
      celda: (nota) => (
        <span className="flex flex-col">
          <span className="font-numeros font-medium tabular-nums">{nota.codigo_caja ?? '—'}</span>
          <span className="text-xs text-texto-sutil">{nombreDe(nota)}</span>
        </span>
      ),
    },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      celda: (nota) => <Dinero centavos={totalDe(nota)} tamano="sm" />,
    },
  ];
}

function columnasDePartidas(voc: Vocabulario): readonly ColumnaDeTabla<LineaDeNota>[] {
  return [
    {
      clave: 'partida',
      titulo: voc.titulo('linea_orden'),
      celda: (linea) => (
        <span className="font-medium">{linea.producto_nombre ?? voc.titulo('producto')}</span>
      ),
    },
    {
      clave: 'cantidad',
      titulo: 'Cantidad',
      numerica: true,
      celda: (linea) => {
        const cantidad = linea.cantidad ?? 1;
        return (
          <Cifra
            valor={cantidad}
            unidad={linea.unidad ?? 'pz'}
            decimales={decimalesDe(cantidad)}
            tamano="sm"
          />
        );
      },
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={aCentavos(linea.total)} tamano="sm" />,
    },
  ];
}

function columnasDeTransferencias(
  enviando: string | null,
  alConfirmar: (transferencia: TransferenciaPendiente) => void,
): readonly ColumnaDeTabla<TransferenciaPendiente>[] {
  return [
    {
      clave: 'transferencia',
      titulo: 'Transferencia',
      celda: (transferencia) => (
        <span className="flex flex-col gap-(--espacio-1)">
          <Dinero centavos={Number(transferencia.montoCentavos)} tamano="lg" />
          {/* Las horas esperando van en la lista: una de hace veinte minutos y
              una de hace tres días no se revisan con la misma prisa. */}
          <span className="text-xs text-texto-sutil">
            {transferencia.referencia ?? 'sin referencia'} · hace{' '}
            <Cifra valor={transferencia.horasEsperando} unidad="h" tamano="xs" />
          </span>
        </span>
      ),
    },
    {
      clave: 'banco',
      titulo: 'Banco',
      celda: (transferencia) => (
        <span className="flex justify-end">
          <Button
            type="button"
            disabled={enviando !== null}
            cargando={enviando === `${transferencia.pagoId}·transferencia`}
            onClick={() => {
              alConfirmar(transferencia);
            }}
          >
            Confirmar
          </Button>
        </span>
      ),
    },
  ];
}

/** La forma de la caja mientras llega: la cola a la izquierda, el cobro a la derecha. */
function EsqueletoDeCaja() {
  return (
    <div className="grid gap-(--espacio-4) md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
      <EsqueletoDeLista filas={5} />
      <div className="flex flex-col gap-(--espacio-3)">
        <Esqueleto className="h-(--altura-control) w-1/2" />
        <Esqueleto className="h-40 w-full rounded-lg" />
        <Esqueleto className="min-h-20 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-(--espacio-3)">
          {METODOS.map((metodo) => (
            <Esqueleto key={metodo.clave} className="min-h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TransferenciasDelTelefonoProps {
  readonly transferencias: readonly TransferenciaPendiente[] | null;
  readonly avisoBanco: string | null;
  readonly enviando: string | null;
  readonly alConfirmar: (transferencia: TransferenciaPendiente) => void;
}

/**
 * TELÉFONO · otra pantalla, no ésta encogida. Fuera del mostrador lo único que se
 * hace es cotejar una transferencia contra el banco.
 */
function TransferenciasDelTelefono({
  transferencias,
  avisoBanco,
  enviando,
  alConfirmar,
}: TransferenciasDelTelefonoProps) {
  return (
    <section
      aria-label="Transferencias por confirmar"
      className="flex flex-col gap-(--espacio-3) md:hidden"
    >
      <h2 className="text-lg font-semibold">Transferencias por confirmar</h2>
      <p className="text-sm text-texto-sutil">
        La caja se opera en el mostrador. Desde el teléfono sólo se confirman transferencias.
      </p>
      {/* El aviso del banco va APARTE del de cobrar: «no se pudo leer el banco» y
          «ninguna nota se marcó como pagada» son dos cosas, y juntarlas diría que
          falló un cobro que nadie intentó. */}
      {avisoBanco === null ? null : (
        <Aviso tono="peligro" titulo={avisoBanco}>
          Ninguna transferencia se marcó como confirmada.
        </Aviso>
      )}
      {transferencias === null ? (
        avisoBanco === null ? (
          <EsqueletoDeLista filas={3} />
        ) : null
      ) : (
        <Tabla
          etiqueta="Transferencias por confirmar"
          columnas={columnasDeTransferencias(enviando, alConfirmar)}
          filas={transferencias}
          claveDe={(transferencia) => transferencia.pagoId}
          vacio={
            <Vacio
              icono={<Landmark />}
              titulo="Ninguna transferencia espera confirmación."
              explicacion="Cuando un cliente pague su cuenta así, el pago aparece aquí para cotejarlo contra el banco — y hasta entonces su saldo no baja."
            />
          }
        />
      )}
    </section>
  );
}

interface PanelDeLaNotaProps {
  readonly nota: NotaDeCaja;
  /** `null` mientras llegan: el hueco se reserva, no se inventa una lista vacía. */
  readonly partidas: readonly LineaDeNota[] | null;
  readonly falloDePartidas: string | null;
  readonly error: string | null;
  readonly enviando: string | null;
  /** El nombre de viaje del ENCABEZADO: la fila de la cola llega ahí. */
  readonly nombreDeViaje: string;
  readonly alSellar: (metodo: MetodoDeCobro) => void;
}

/**
 * LA NOTA ELEGIDA · su fila de la cola, convertida en panel.
 *
 * La jerarquía es la del cobro: 1 el total, 2 los cuatro métodos, 3 el desglose.
 * Lo de arriba —folio, quién atendió, cliente, obra y quién recoge— se lee antes de
 * cobrar y ya no se vuelve a mirar.
 *
 * ── Lo que viaja es el ENCABEZADO, no el panel entero ────────────────────
 * La fila de la cola dice folio y cliente, y eso mismo es el encabezado: es la fila
 * convertida en panel. El total y los cuatro métodos cambian en seco y en su sitio,
 * porque son lo siguiente que la mano va a tocar, y lo que está a punto de tocarse
 * no se mueve (`sistema/movimiento.ts`).
 */
function PanelDeLaNota({
  nota,
  partidas,
  falloDePartidas,
  error,
  enviando,
  nombreDeViaje,
  alSellar,
}: PanelDeLaNotaProps) {
  const voc = useVocabulario();
  const total = totalDe(nota);
  const saldo = nota.saldoClienteCentavos ?? 0;
  const limite = nota.limiteClienteCentavos ?? 0;
  const excede = limite > 0 && saldo + total > limite;
  // A cuenta necesita a alguien a quien fiarle: sin ficha no hay saldo que subir
  // ni documento que cobrar después.
  const sinFicha = nota.cliente_id === null;
  const quienYCuando = [nota.atendio ?? 'mostrador', horaDe(nota.creada)]
    .filter((parte) => parte !== '')
    .join(' · ');

  return (
    <Superficie
      como="section"
      relleno={0}
      aria-label={`${voc.titulo('orden')} seleccionad${voc.terminacion('orden')}`}
      className="flex flex-col md:sticky md:top-(--espacio-4)"
    >
      <header
        style={{ viewTransitionName: nombreDeViaje }}
        className="flex flex-wrap items-start justify-between gap-(--espacio-3) p-(--espacio-4)"
      >
        <div className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold">
            {voc.titulo('orden')}{' '}
            <span className="font-numeros tabular-nums">{nota.codigo_caja ?? '—'}</span>
          </h2>
          <p className="text-sm text-texto-sutil">{quienYCuando}</p>
        </div>
        <div className="flex min-w-0 flex-col items-end text-right">
          <p className="font-semibold">{nombreDe(nota)}</p>
          {nota.obra === null ? null : <p className="text-sm text-texto-sutil">obra {nota.obra}</p>}
        </div>
        {nota.recoge_nombre === null ? null : (
          <p className="flex w-full flex-wrap items-center gap-(--espacio-2) text-sm">
            <span>
              Recoge: <span className="font-medium">{nota.recoge_nombre}</span>
            </span>
            <Badge variant={nota.recoge_autorizado ? 'secondary' : 'destructive'}>
              {nota.recoge_autorizado ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
              {nota.recoge_autorizado ? 'autorizado' : 'sin autorizar'}
            </Badge>
          </p>
        )}
      </header>

      <div className="px-(--espacio-4) pb-(--espacio-4)">
        {falloDePartidas !== null ? (
          <Aviso tono="peligro" titulo={falloDePartidas}>
            El total de {voc.enFrase('orden')} sí se leyó y se puede cobrar; lo que falta es el
            detalle de sus {voc.plural('linea_orden')}.
          </Aviso>
        ) : partidas === null ? (
          <EsqueletoDeLista filas={3} />
        ) : (
          <Tabla
            etiqueta={`${voc.titulo('linea_orden', true)} de ${voc.enFrase('orden')}`}
            columnas={columnasDePartidas(voc)}
            filas={partidas}
            claveDe={(linea) => linea.id}
            alto="max-h-[36vh]"
            vacio={
              <Vacio
                titulo={`${voc.titulo('orden')} sin ${voc.plural('linea_orden')}.`}
                className="py-(--espacio-4)"
              />
            }
          />
        )}
      </div>

      {/* Región con nombre, como en los otros cuatro modelos: es EL número que se
          dice en voz alta, y tenerlo nombrado es lo que permite que un lector de
          pantalla —y la suite— lo encuentren sin agarrarse de una clase de CSS. */}
      <section
        aria-label={`Total de ${voc.enFrase('orden')}`}
        className="flex flex-wrap items-baseline justify-between gap-(--espacio-3) border-y border-borde bg-fondo-sutil px-(--espacio-4) py-(--espacio-3)"
      >
        <span className="text-sm font-medium tracking-wide text-texto-sutil uppercase">Total</span>
        <Dinero centavos={total} tamano="total" />
      </section>

      <div className="flex flex-col gap-(--espacio-3) p-(--espacio-4)">
        {/* Encima de los métodos, donde están los ojos, y lo primero que dice
            después de qué pasó es que nada se cobró. */}
        {error === null ? null : (
          <Aviso tono="peligro" titulo={error}>
            Ninguna nota se marcó como pagada.
          </Aviso>
        )}

        {/* Los cuatro en la misma rejilla y del mismo tamaño: aquí compiten de
            verdad, y presuponer uno descuadra el arqueo de la noche. */}
        <div className="grid grid-cols-2 gap-(--espacio-3)">
          {METODOS.map((metodo) => {
            const Icono = ICONO_DE_METODO[metodo.clave];
            const bloqueado = metodo.clave === 'cuenta' && (excede || sinFicha);
            const cobrando = enviando === `${nota.id}·${metodo.clave}`;
            return (
              <Button
                key={metodo.clave}
                type="button"
                size="lg"
                variant={bloqueado ? 'outline' : 'default'}
                disabled={enviando !== null || bloqueado}
                cargando={cobrando}
                className="min-h-20 flex-col gap-(--espacio-1) text-base"
                onClick={() => {
                  alSellar(metodo.clave);
                }}
              >
                {cobrando ? null : <Icono aria-hidden="true" className="size-5" />}
                {cobrando ? 'Cobrando…' : metodo.etiqueta}
              </Button>
            );
          })}
        </div>

        {/* El saldo se repite aquí porque quien cobra es otra persona, y el
            bloqueo se dice con palabras: un botón apagado no explica nada. */}
        {limite > 0 && (
          <p className="flex items-start gap-(--espacio-2) text-sm">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              A cuenta: debe <Dinero centavos={saldo} tamano="sm" /> de{' '}
              <Dinero centavos={limite} tamano="sm" />.
            </span>
          </p>
        )}
        {excede && (
          <Aviso
            tono="atencion"
            titulo="Con esta nota pasa de su límite: no se puede cobrar a cuenta."
          />
        )}
        {/* Un botón apagado no explica nada, y ésta es la razón más común de que
            lo esté: la nota es del mostrador, sin nadie a quien fiarle. */}
        {sinFicha && (
          <p className="flex items-start gap-(--espacio-2) text-sm text-texto-sutil">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Esta nota es de mostrador, sin {voc.enFrase('cliente')} con cuenta: a cuenta no se
              puede. Dale de alta {voc.enFraseCon('un', 'cliente')} para fiarle.
            </span>
          </p>
        )}
      </div>
    </Superficie>
  );
}

export function Caja({
  notasIniciales,
  lineasIniciales,
  transferenciasIniciales,
  onCobrada,
}: CajaProps) {
  const voc = useVocabulario();
  const enLinea = useEnLinea();
  const [notas, setNotas] = useState<readonly NotaDeCaja[] | null>(notasIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  // El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [lectura, setLectura] = useState<LecturaDePartidas | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  /** La fila que lleva el nombre de viaje mientras se convierte en panel. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `null` mientras se leen: «ninguna espera confirmación» dicho antes de leer
  // sería una afirmación falsa, no un vacío.
  const [transferencias, setTransferencias] = useState<readonly TransferenciaPendiente[] | null>(
    transferenciasIniciales ?? null,
  );
  const [avisoBanco, setAvisoBanco] = useState<string | null>(null);
  // Arranca en `null` y lo llena el efecto: el reloj del servidor y el del
  // navegador no son el mismo, y pintarlo en el HTML inicial rompe la hidratación.
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    const tic = (): void => {
      setAhora(Date.now());
    };
    // El primer tic va en el siguiente turno del bucle, no en el cuerpo del
    // efecto: así la hora entra sin encadenar un render extra en cada montaje.
    const primero = setTimeout(tic);
    const reloj = setInterval(tic, 30000);
    return () => {
      clearTimeout(primero);
      clearInterval(reloj);
    };
  }, []);

  useEffect(() => {
    if (notasIniciales !== undefined) return;
    let vivo = true;
    // `NotaDeCaja`, no `Venta`: lo que la caja lista son NOTAS —con su folio, su
    // caducidad y su propio estado—, y una orden pagada cuyo material sigue en el
    // patio no se distingue mirando `ordenes`.
    consultarPuente<NotaDeCaja>('NotaDeCaja', { limite: 80 })
      .then((filas) => {
        if (vivo) setNotas(filas);
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la caja.');
      });
    return () => {
      vivo = false;
    };
  }, [notasIniciales, intento]);

  const todas = notas ?? [];
  const pendientes = todas.filter((nota) => nota.estado === PENDIENTE);
  const porEntregar = todas.filter((nota) => nota.estado === POR_ENTREGAR);
  // Apartadas no se cobran —el cliente dijo «ahorita vuelvo»— pero tampoco se
  // esconden: son material comprometido, y no verlas es como el patio se llena.
  const apartadas = todas.filter((nota) => nota.estado === APARTADA);
  const seleccionada = todas.find((nota) => nota.id === elegida) ?? pendientes[0] ?? null;
  const notaId = seleccionada === null ? null : seleccionada.id;

  useEffect(() => {
    if (lineasIniciales !== undefined || notaId === null) return;
    let vivo = true;
    consultarPuente<LineaDeNota>('DetalleVenta', { filtro: { venta_id: notaId } })
      .then((filas) => {
        if (vivo) setLectura({ notaId, filas, fallo: null });
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setLectura({
            notaId,
            filas: [],
            fallo:
              fallo instanceof Error ? fallo.message : `No se pudo leer ${voc.enFrase('orden')}.`,
          });
      });
    return () => {
      vivo = false;
    };
  }, [lineasIniciales, notaId, voc]);

  useEffect(() => {
    if (transferenciasIniciales !== undefined) return;
    let vivo = true;
    invocarComando<{ readonly pendientes: readonly TransferenciaPendiente[] }>(
      '/api/credito/transferencias-pendientes',
      { horas: 72 },
    )
      .then((resultado) => {
        if (vivo) setTransferencias(resultado.pendientes);
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setAvisoBanco(
            fallo instanceof Error
              ? fallo.message
              : 'No se pudieron leer las transferencias por confirmar.',
          );
      });
    return () => {
      vivo = false;
    };
  }, [transferenciasIniciales]);

  const deLaNota = (filas: readonly LineaDeNota[]): readonly LineaDeNota[] =>
    filas.filter((linea) => linea.venta_id === notaId);
  const partidas: readonly LineaDeNota[] | null =
    lineasIniciales !== undefined
      ? deLaNota(lineasIniciales)
      : lectura !== null && lectura.notaId === notaId && lectura.fallo === null
        ? deLaNota(lectura.filas)
        : null;
  const falloDePartidas =
    lineasIniciales === undefined && lectura !== null && lectura.notaId === notaId
      ? lectura.fallo
      : null;

  function reintentar(): void {
    setFalloDeCarga(null);
    setNotas(null);
    setIntento((previo) => previo + 1);
  }

  /**
   * La fila se convierte en el panel. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma el ENCABEZADO del panel, y `flushSync`
   * hace que el navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function elegir(id: string): void {
    // Mientras un cobro viaja, la cola no cambia de nota: lo que conteste —el fallo,
    // o la nota que pasa al andén— se pinta en el panel, y el panel tiene que seguir
    // siendo el de la nota que se está cobrando. Si no, el fallo de la nota A salía
    // bajo el total de la B, que nadie intentó cobrar.
    if (enviando !== null) return;
    // El aviso de un cobro fallido es de la nota que se intentó, no de la que se abre.
    setError(null);
    if (id === notaId) {
      setElegida(id);
      return;
    }
    flushSync(() => {
      setViajando(id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        setElegida(id);
      });
    });
  }

  async function sellar(nota: NotaDeCaja, metodo: MetodoDeCobro): Promise<void> {
    // Sin red no se cobra (F-988, A-27): no hay cola que guarde el cobro para después.
    if (!enLinea) return;
    // Un doble toque llega antes que el re-pintado que apaga los métodos.
    if (enviando !== null) return;
    setEnviando(`${nota.id}·${metodo}`);
    setError(null);
    try {
      if (metodo === 'cuenta') {
        // A CUENTA · no entra dinero, sale material firmado. Es una remisión:
        // sube el saldo del cliente, toma su propio folio y sella quién recibió.
        await invocarComando('/api/credito/remision', {
          ordenId: nota.id,
          clienteId: nota.cliente_id,
          importeCentavos: totalDe(nota),
          // Quien firma es quien viene por el material: el autorizado si hay
          // uno, y si no el cliente mismo. El documento sin nombre no sirve.
          nombreFirmante: nota.recoge_nombre ?? nota.cliente_nombre ?? 'Sin nombre',
        });
      } else {
        // El cuerpo que `venta.cobrar` pide. `totalEsperadoCentavos` no cobra:
        // si el servidor recalcula otro total, rechaza en vez de cobrar el suyo
        // en silencio —el cajero ya le dijo un número al cliente—.
        await invocarComando('/api/venta/cobrar', {
          ordenId: nota.id,
          totalEsperadoCentavos: totalDe(nota),
          pagos: [
            {
              metodo,
              montoCentavos: totalDe(nota),
              // En efectivo, lo recibido sirve para el cambio. Esta pantalla
              // sella un método exacto por nota, así que es el total.
              ...(metodo === 'efectivo' ? { recibidoCentavos: totalDe(nota) } : {}),
            },
          ],
        });
      }
      // Cerrada para la caja; el material sigue en el patio hasta que se entrega.
      setNotas(
        todas.map((fila) => (fila.id === nota.id ? { ...fila, estado: POR_ENTREGAR } : fila)),
      );
      setElegida(null);
      onCobrada?.(nota.id, metodo);
    } catch (fallo) {
      setError(
        fallo instanceof Error ? fallo.message : `No se pudo cobrar ${voc.enFrase('orden')}.`,
      );
    } finally {
      setEnviando(null);
    }
  }

  /**
   * F-212 · Confirmar contra el banco lo que un cliente dijo que transfirió.
   *
   * Es lo ÚNICO que se hace desde fuera del mostrador, y es de la cartera, no de
   * esta venta: lo que se confirma es un pago de crédito (`pagos_credito`), y
   * hasta que se confirma no baja ningún saldo. La versión anterior mandaba
   * `{ventaId}` al comando, que pide `{pagoId}` sobre otra tabla: no confirmaba
   * nada.
   */
  async function confirmar(transferencia: TransferenciaPendiente): Promise<void> {
    setEnviando(`${transferencia.pagoId}·transferencia`);
    setAvisoBanco(null);
    try {
      await invocarComando('/api/credito/confirmar-transferencia', {
        pagoId: transferencia.pagoId,
        referenciaBancaria: null,
      });
      setTransferencias((previas) =>
        previas === null ? previas : previas.filter((t) => t.pagoId !== transferencia.pagoId),
      );
    } catch (fallo) {
      setAvisoBanco(fallo instanceof Error ? fallo.message : 'No se pudo confirmar.');
    } finally {
      setEnviando(null);
    }
  }

  const escritorio = (() => {
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudo leer la caja"
          queHacer={`Sin la lista no se sabe qué ${voc.plural('orden')} esperan cobro. Revisa la conexión y vuelve a leerla: no se cobró nada.`}
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentar}>
              Volver a leer
            </Button>
          }
          className="mx-auto max-w-lg"
        />
      );
    }
    // La forma de la caja, nunca una rueda: el total no salta de sitio al llegar.
    if (notas === null) return <EsqueletoDeCaja />;
    if (todas.length === 0) {
      // El vacío ENSEÑA de dónde salen las notas; no se disculpa por no tener.
      // Y lleva la palomita y no un hueco: «al día» es una buena noticia.
      return (
        <Vacio
          icono={<CircleCheckBig />}
          titulo="La caja está al día."
          explicacion="Una nota llega aquí cuando el mostrador la cierra. Mientras no haya ninguna, el sitio donde mirar es el mostrador."
          accion={
            <Button asChild>
              <a href="/ferreteria/mostrador">Ir al mostrador</a>
            </Button>
          }
        />
      );
    }

    return (
      // PC y TABLET · la cola a la izquierda, la que se cobra a la derecha. En
      // tablet la cola se estrecha, pero no se esconde: elegir a quién cobrar es
      // la mitad del trabajo.
      <div className="grid items-start gap-(--espacio-4) md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-(--espacio-6)">
          <section
            aria-label={`${voc.titulo('orden', true)} pendientes`}
            className="flex flex-col gap-(--espacio-2)"
          >
            <h2 className="text-sm font-semibold tracking-wide text-texto-sutil uppercase">
              Notas pendientes ({pendientes.length})
            </h2>
            <Tabla
              etiqueta={`${voc.titulo('orden', true)} pendientes`}
              columnas={columnasDeLaCola({ notaId, ahora, voc, alElegir: elegir })}
              filas={pendientes}
              claveDe={(nota) => nota.id}
              {...(notaId === null ? {} : { activa: notaId })}
              alActivar={elegir}
              tonoDeFila={(nota) => tonoDeVigencia(minutosPara(nota.vence, ahora))}
              viajeDeFila={(nota) => (nota.id === viajando ? VIAJE.fila(nota.id) : undefined)}
              alto="max-h-[45vh]"
              vacio={
                <p className="text-sm text-texto-sutil">
                  {voc.conDeterminante('ningun', 'orden')} espera cobro.
                </p>
              }
            />
          </section>

          {/* Siempre a la vista, nunca plegable: es lo que evita entregar dos
              veces el mismo material. Están las pagadas y las firmadas a
              crédito, porque las dos dejan material esperando en el patio. */}
          <section aria-label="Cerradas, sin entregar" className="flex flex-col gap-(--espacio-2)">
            <h2 className="text-sm font-semibold tracking-wide text-texto-sutil uppercase">
              Cerradas, sin entregar ({porEntregar.length})
            </h2>
            <Tabla
              etiqueta="Cerradas, sin entregar"
              columnas={columnasDelAnden(voc)}
              filas={porEntregar}
              claveDe={(nota) => nota.id}
              alto="max-h-[30vh]"
              vacio={<p className="text-sm text-texto-sutil">Nada cerrado espera en el andén.</p>}
            />
          </section>

          <dl className="flex flex-col gap-(--espacio-1) border-t border-borde pt-(--espacio-3) text-sm">
            <div className="flex items-baseline justify-between gap-(--espacio-2)">
              <dt className="text-texto-sutil">
                Por cobrar · {voc.conNumero('orden', pendientes.length)}
              </dt>
              <dd>
                <Dinero centavos={sumaDe(pendientes)} className="font-semibold" />
              </dd>
            </div>
            {/* Lo apartado no se cobra hoy, y tampoco se esconde: es material
                comprometido, y no verlo es como el patio se llena de pedidos de
                clientes que no volvieron. */}
            {apartadas.length > 0 && (
              <div className="flex items-baseline justify-between gap-(--espacio-2)">
                <dt className="text-texto-sutil">
                  Apartadas · {voc.conNumero('orden', apartadas.length)}, esperando a su dueño
                </dt>
                <dd>
                  <Dinero centavos={sumaDe(apartadas)} tamano="sm" />
                </dd>
              </div>
            )}
          </dl>
        </div>

        {seleccionada === null ? (
          <Superficie
            como="section"
            aria-label={`${voc.titulo('orden')} seleccionad${voc.terminacion('orden')}`}
          >
            <Vacio
              icono={<CircleCheckBig />}
              titulo="Nada por cobrar."
              explicacion="Una nota llega aquí cuando el mostrador la cierra."
            />
          </Superficie>
        ) : (
          <PanelDeLaNota
            nota={seleccionada}
            partidas={partidas}
            falloDePartidas={falloDePartidas}
            error={error}
            enviando={enviando}
            nombreDeViaje={viajando === null ? VIAJE.fila(seleccionada.id) : 'none'}
            alSellar={(metodo) => {
              void sellar(seleccionada, metodo);
            }}
          />
        )}
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <h1 className="text-xl font-bold">Caja</h1>
      {enLinea ? null : <AvisoSinConexion />}
      <TransferenciasDelTelefono
        transferencias={transferencias}
        avisoBanco={avisoBanco}
        enviando={enviando}
        alConfirmar={(transferencia) => {
          void confirmar(transferencia);
        }}
      />
      <div className="hidden md:block">{escritorio}</div>
    </div>
  );
}
