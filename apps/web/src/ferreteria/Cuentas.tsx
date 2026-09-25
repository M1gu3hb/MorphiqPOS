'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@morphiqpos/ui/primitivas/sheet';
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
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FileSignature,
  HandCoins,
  Phone,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · cuentas
 *
 * La cartera de crédito: quién debe, desde cuándo, de qué obra y a quién
 * hablarle. 10 a 20 consultas rápidas al día más una revisión completa, sobre
 * un tercio del valor del giro. Acción principal: REGISTRAR PAGO.
 *
 * ── Por qué la fila se abre POR OBRA ─────────────────────────────────────
 * F-639 hecho visible. El saldo de un contratista sin desglose por obra es un
 * número con el que no se puede tener una conversación de cobro; con desglose
 * la llamada es «de Las Torres me debes $12,100, y ésa ya te la pagaron». Por
 * eso lo que se lee es la vista `CarteraPorObra` —un renglón por obra— y el
 * cliente se arma aquí, no en la base. En la tabla las obras son renglones
 * HIJOS, debajo del suyo y en sus mismas columnas: el importe de cada obra cae
 * bajo el «Debe» del cliente, que es como se suma de un vistazo.
 *
 * ── «Más viejo» y no «fecha del último cargo» ────────────────────────────
 * Porque la pregunta es «¿desde cuándo me debe?», no «¿qué le vendí al
 * final?». La antigüedad es la que decide a quién se le llama hoy, y por eso la
 * tabla NO se reordena por columna: los cinco más viejos van arriba siempre.
 *
 * ── El semáforo y el límite son DOS problemas distintos ──────────────────
 * Días: verde hasta 15, ámbar 16–30, rojo 31+. La marca del límite es
 * independiente del color, porque un cliente puede estar al corriente y aun
 * así pasado de límite. Y el color nunca va solo: cada punto lleva su palabra
 * al lado, porque quien no distingue rojo de ámbar también cobra.
 *
 * ── «Cobrado hoy» arriba, con el método ──────────────────────────────────
 * Las transferencias entran fuera de la sesión de caja (`02` §8.3): si no se
 * ven aquí no se ven en ningún lado hasta el corte, y para entonces el arqueo
 * ya no cuadra y nadie se acuerda de por qué.
 *
 * ── El pago se aplica a DOCUMENTOS, no al saldo ──────────────────────────
 * F-614 en variante. La ficha lista las remisiones abiertas con casillas y
 * trae la más vieja marcada de entrada: sugiere, no impone, y la casilla se
 * quita. Aplicar al saldo automáticamente le rompe al contratista la
 * conciliación con su propio cliente, y ése es el motivo por el que cambia de
 * proveedor.
 *
 * ── La fila se convierte en la ficha ─────────────────────────────────────
 * «Registrar pago» no abre una hoja que llega de la nada: la FILA viaja hasta
 * la ficha (`VIAJE.fila`) y, al cerrarla, la ficha se recoge en su fila. Por
 * eso la hoja no trae su deslizamiento propio: dos movimientos a la vez no
 * explican nada. Donde el navegador no sabe, o se pidió quietud, cambia seco.
 *
 * ── El teléfono NO es esta pantalla encogida ─────────────────────────────
 * Es la pantalla que más se usa desde el teléfono. A 390 px cada cliente es
 * un renglón de dos líneas ordenado por vencido —la primera lleva el nombre y lo
 * que debe, la segunda los días y su palabra—, con su botón de llamar a un toque,
 * y la ficha entra como hoja inferior. De tablet para arriba vuelven las cinco
 * columnas del documento y la ficha se va al costado.
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. QUIÉN PUEDE RECOGER (F-638) y el alta de obras y autorizados no caben en
 *    300 líneas: viven en la ficha completa del cliente.
 * 2. «Nuevo cliente», «Estado de cuenta» y «A quién hablarle» tampoco; de la
 *    cobranza, esta pantalla sólo trae el teléfono a un toque.
 * 3. `/api/credito/pago` está nombrada en `05-DATOS-Y-BACKEND` §6. Las tres
 *    lecturas van por el puente, que es el único camino de lectura.
 */

/** Los tres tramos de antigüedad. El color SIEMPRE viaja con su palabra. */
const SEMAFORO = [
  { hasta: 15, punto: 'bg-exito', palabra: 'al corriente' },
  { hasta: 30, punto: 'bg-advertencia', palabra: 'por vencer' },
  { hasta: Number.POSITIVE_INFINITY, punto: 'bg-peligro', palabra: 'vencido' },
] as const;

/** A partir de aquí la deuda cuenta como vencida, en la cifra y en el filtro. */
const DIAS_VENCIDO = 30;

/** Los dos métodos que entran por esta pantalla; la tarjeta pasa por caja. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
] as const;

const FILTROS = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'vencidos', etiqueta: 'Vencidos' },
  { clave: 'hoy', etiqueta: 'Hoy' },
] as const;

/** El lienzo de la pantalla en sus tres estados: nada salta al llegar los datos. */
const LIENZO =
  'mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-3) p-(--espacio-3) md:p-(--espacio-4)';

/** Las tres cifras de arriba: una franja en teléfono, tres columnas de tablet arriba. */
const REJILLA_DEL_RESUMEN =
  'grid grid-cols-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]';

const ROTULO = 'text-xs font-medium tracking-wide text-texto-sutil uppercase';

type ClaveFiltro = (typeof FILTROS)[number]['clave'];
type ClaveMetodo = (typeof METODOS)[number]['clave'];
type Vocabulario = ReturnType<typeof useVocabulario>;

/** Un renglón de `CarteraPorObra`: uno por OBRA, no uno por cliente. */
export interface RenglonDeCartera {
  readonly id: string;
  readonly cliente_id: string;
  readonly cliente_nombre: string | null;
  readonly telefono: string | null;
  readonly obra_nombre: string | null;
  readonly saldo_centavos: number | null;
  readonly dias_mas_viejo: number | null;
  readonly limite_centavos: number | null;
  readonly dias_ultimo_pago: number | null;
}

export interface PagoDeCredito {
  readonly id: string;
  readonly cliente_id: string;
  readonly metodo: string | null;
  readonly monto_centavos: number | null;
  readonly fecha: string | null;
}

/** Una remisión abierta: a esto se aplica el pago, no al saldo. */
export interface DocumentoPorCobrar {
  readonly id: string;
  readonly folio: string | null;
  readonly obra_nombre: string | null;
  /**
   * Los DÍAS de la remisión no se sirven: son la diferencia contra hoy, y una
   * columna con eso dentro estaría mal el día siguiente. Se cuentan al leerla, que
   * es cada vez que se abre la ficha. `null` sin fecha de entrega: «—», no «0 d».
   */
  readonly dias?: number | null;
  /** En CENTAVOS, como los manda el comando. El puente lo sirve en pesos: `aDocumento`. */
  readonly saldo_documento_centavos: number | null;
  /** Cuándo se entregó: de aquí salen los días y el orden. */
  readonly entregada_en: string | null;
}

/**
 * Una fila de `Remision` TAL COMO LLEGA. `saldo_documento_centavos` viene en PESOS
 * aunque se llame así (`conversion: 'dinero'` en `puente/mapa.ts`): dárselo tal cual
 * a `<Dinero>` pintaba $180.00 donde se debían $18,000.00, y el pago salía por eso.
 * Por eso se lee su gemelo honesto, `saldo_documento_pesos` —la misma columna, con el
 * nombre de lo que trae—, y no el nombre que miente.
 */
interface RemisionDelPuente {
  readonly id: string;
  readonly folio: string | null;
  readonly obra_nombre: string | null;
  readonly saldo_documento_pesos: number | null;
  readonly entregada_en: string | null;
}

export interface ClienteDeCartera {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly debe: number;
  readonly dias: number;
  readonly limite: number;
  readonly diasUltimoPago: number | null;
  readonly obras: readonly RenglonDeCartera[];
}

export interface CuentasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly renglonesIniciales?: readonly RenglonDeCartera[];
  readonly pagosIniciales?: readonly PagoDeCredito[];
  readonly documentosIniciales?: readonly DocumentoPorCobrar[];
  readonly onPagoRegistrado?: (clienteId: string, centavos: number) => void;
}

/** Un renglón de la tabla: el cliente, o una de sus obras debajo de él. */
type FilaDeCartera =
  | { readonly tipo: 'cliente'; readonly cliente: ClienteDeCartera }
  | {
      readonly tipo: 'obra';
      readonly cliente: ClienteDeCartera;
      readonly obra: RenglonDeCartera;
    };

/** Lo que se dice arriba cuando un pago entró: de quién y cuánto. */
interface PagoRegistrado {
  readonly nombre: string;
  readonly centavos: number;
}

function tramoDe(dias: number): { readonly punto: string; readonly palabra: string } {
  return SEMAFORO.find((tramo) => dias <= tramo.hasta) ?? SEMAFORO[2];
}

/** Sólo los pagos de hoy: la cifra de arriba es el corte del día. */
function esDeHoy(fecha: string | null): boolean {
  if (fecha === null) return false;
  const momento = new Date(fecha);
  if (Number.isNaN(momento.getTime())) return false;
  return momento.toDateString() === new Date().toDateString();
}

function sumaDePagos(pagos: readonly PagoDeCredito[]): number {
  return pagos.reduce(
    (suma, pago) => suma + (centavosDe('PagoCredito', 'monto_centavos', pago.monto_centavos) ?? 0),
    0,
  );
}

/**
 * El saldo de una obra, en centavos. `CarteraPorObra.saldo_centavos` es `entero` y ya
 * llega en centavos, pero eso lo dice el mapa y no el nombre: se lee por `centavosDe`,
 * en un solo sitio para las cuatro lecturas. Nulo es cero: sin saldo no se debe nada.
 */
function saldoDe(obra: RenglonDeCartera): number {
  return centavosDe('CarteraPorObra', 'saldo_centavos', obra.saldo_centavos) ?? 0;
}

function obrasEnTexto(cuantas: number): string {
  return cuantas === 1 ? '1 obra' : `${String(cuantas)} obras`;
}

function claveDeFila(fila: FilaDeCartera): string {
  return fila.tipo === 'cliente' ? fila.cliente.id : `obra:${fila.obra.id}`;
}

const MS_POR_DIA = 86_400_000;

/** El instante de una fecha del puente; `NaN` si no hay fecha que leer. */
function instanteDe(fecha: string | null): number {
  return fecha === null ? Number.NaN : Date.parse(fecha);
}

/** Lo que se entregó primero, primero: es lo que se sugiere. Sin fecha, al final. */
function porAntiguedad(a: DocumentoPorCobrar, b: DocumentoPorCobrar): number {
  const antes = instanteDe(a.entregada_en);
  const despues = instanteDe(b.entregada_en);
  if (Number.isNaN(antes)) return Number.isNaN(despues) ? 0 : 1;
  if (Number.isNaN(despues)) return -1;
  return antes - despues;
}

/** La remisión del puente en la forma de la pantalla: el saldo en centavos, y sus días. */
function aDocumento(remision: RemisionDelPuente, ahora: number): DocumentoPorCobrar {
  const entrega = instanteDe(remision.entregada_en);
  return {
    id: remision.id,
    folio: remision.folio,
    obra_nombre: remision.obra_nombre,
    saldo_documento_centavos: centavosDe(
      'Remision',
      'saldo_documento_pesos',
      remision.saldo_documento_pesos,
    ),
    entregada_en: remision.entregada_en,
    dias: Number.isNaN(entrega) ? null : Math.max(0, Math.floor((ahora - entrega) / MS_POR_DIA)),
  };
}

/** Los renglones por obra se vuelven clientes con sus obras dentro (F-639). */
export function agruparPorCliente(
  renglones: readonly RenglonDeCartera[],
): readonly ClienteDeCartera[] {
  const porId = new Map<string, ClienteDeCartera>();
  for (const fila of renglones) {
    const base = porId.get(fila.cliente_id) ?? {
      id: fila.cliente_id,
      nombre: fila.cliente_nombre ?? 'Cliente sin nombre',
      telefono: fila.telefono,
      debe: 0,
      dias: 0,
      limite: 0,
      diasUltimoPago: fila.dias_ultimo_pago,
      obras: [],
    };
    porId.set(fila.cliente_id, {
      ...base,
      debe: base.debe + saldoDe(fila),
      dias: Math.max(base.dias, fila.dias_mas_viejo ?? 0),
      limite: Math.max(
        base.limite,
        centavosDe('CarteraPorObra', 'limite_centavos', fila.limite_centavos) ?? 0,
      ),
      obras: [...base.obras, fila],
    });
  }
  // Por vencido y no por nombre: lo que hay que cobrar primero se ve primero.
  return [...porId.values()].sort((a, b) =>
    b.dias === a.dias ? b.debe - a.debe : b.dias - a.dias,
  );
}

/** Los códigos estables de la API, traducidos a algo que Beto puede hacer. */
function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no registra cobros de crédito.';
    if (fallo.error.codigo === 'CONFLICTO_ESTADO')
      return 'Alguien más aplicó un pago a estos documentos. Vuelve a abrir la ficha.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo hablar con el servidor.';
}

/** El semáforo de antigüedad: el punto, los días y, al lado, su palabra. */
function Semaforo({
  dias,
  tamano = 'sm',
}: {
  readonly dias: number;
  readonly tamano?: 'xs' | 'sm';
}) {
  const tramo = tramoDe(dias);
  return (
    <span className="inline-flex items-center gap-(--espacio-1) whitespace-nowrap">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tramo.punto}`} />
      <Cifra valor={dias} unidad="d" tamano={tamano} />
      <span>· {tramo.palabra}</span>
    </span>
  );
}

/**
 * Lo primero que se ve: el total, lo vencido y lo que ya entró hoy. Grande lo
 * que me deben; en rojo lo vencido, y sólo cuando hay algo vencido —una cifra en
 * cero pintada de alarma enseña a no hacerle caso al rojo—.
 */
function ResumenDeCartera({
  renglones,
  clientes,
  pagos,
}: {
  readonly renglones: readonly RenglonDeCartera[];
  readonly clientes: readonly ClienteDeCartera[];
  readonly pagos: readonly PagoDeCredito[];
}) {
  const voc = useVocabulario();
  const atrasados = renglones.filter((fila) => (fila.dias_mas_viejo ?? 0) > DIAS_VENCIDO);
  const totalDebido = clientes.reduce((suma, cliente) => suma + cliente.debe, 0);
  const totalVencido = atrasados.reduce((suma, fila) => suma + saldoDe(fila), 0);
  const hayVencido = totalVencido > 0;
  return (
    <Superficie
      como="section"
      aria-label="Resumen de la cartera"
      relleno={0}
      className="overflow-hidden"
    >
      <dl className={REJILLA_DEL_RESUMEN}>
        <div className="col-span-2 flex flex-col gap-(--espacio-1) border-b border-borde p-(--espacio-4) md:col-span-1 md:border-r md:border-b-0">
          <dt className={ROTULO}>Lo que me deben</dt>
          <dd>
            <Dinero centavos={totalDebido} tamano="lg" className="text-3xl font-bold" />
          </dd>
          <dd className="text-sm text-texto-sutil">{voc.conNumero('cliente', clientes.length)}</dd>
        </div>
        <div
          className={`flex flex-col gap-(--espacio-1) border-r border-borde p-(--espacio-4) ${hayVencido ? 'bg-peligro/5' : ''}`}
        >
          <dt className={ROTULO}>Vencido · 31 días o más</dt>
          <dd>
            <Dinero
              centavos={totalVencido}
              tamano="lg"
              className={`md:text-2xl ${hayVencido ? 'font-semibold text-peligro' : ''}`}
            />
          </dd>
          <dd className="text-sm text-texto-sutil">
            {voc.conNumero('cliente', new Set(atrasados.map((fila) => fila.cliente_id)).size)}
          </dd>
        </div>
        <div className="flex flex-col gap-(--espacio-1) p-(--espacio-4)">
          <dt className={ROTULO}>Cobrado hoy</dt>
          <dd>
            <Dinero centavos={sumaDePagos(pagos)} tamano="lg" className="md:text-2xl" />
          </dd>
          <dd className="flex flex-col text-sm text-texto-sutil lg:flex-row lg:flex-wrap lg:gap-x-(--espacio-3)">
            {METODOS.map((uno) => (
              <span key={uno.clave}>
                {uno.etiqueta}{' '}
                <Dinero
                  centavos={sumaDePagos(pagos.filter((pago) => pago.metodo === uno.clave))}
                  tamano="sm"
                />
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </Superficie>
  );
}

/**
 * El renglón del nombre, en una rejilla y no en un flex. `Tabla` es de ancho
 * automático: ahí un texto sin saltos fija el ancho mínimo de su columna, y un
 * `truncate` no recorta nada —el nombre largo empujaba los botones de la fila fuera
 * de la vista—. La pista `minmax(0,1fr)` no pide ancho mínimo: el nombre se recorta
 * contra lo que dejan las otras columnas. La tercera pista es lo que se debe, que en
 * teléfono va aquí.
 */
const RENGLON_DEL_NOMBRE =
  'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-(--espacio-1) sm:grid-cols-[auto_minmax(0,1fr)]';

/**
 * El nombre del cliente es el control que despliega sus obras. En teléfono lleva
 * además lo que debe, y en su segunda línea los días y su palabra: ahí las columnas
 * «Debe» y «Más viejo» no caben junto a los dos botones de la fila.
 */
function CeldaDeCliente({
  cliente,
  desplegado,
  alAlternar,
}: {
  readonly cliente: ClienteDeCartera;
  readonly desplegado: boolean;
  readonly alAlternar: (clienteId: string) => void;
}) {
  const excede = cliente.limite > 0 && cliente.debe > cliente.limite;
  return (
    <button
      type="button"
      aria-expanded={desplegado}
      onClick={() => {
        alAlternar(cliente.id);
      }}
      className="flex min-h-(--area-tactil-minima) w-full min-w-0 flex-col justify-center gap-(--espacio-1) rounded-sm text-left focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none"
    >
      <span className={RENGLON_DEL_NOMBRE}>
        {desplegado ? (
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-texto-sutil" />
        ) : (
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-texto-sutil" />
        )}
        <span className="truncate text-base font-semibold">{cliente.nombre}</span>
        <Dinero centavos={cliente.debe} className="font-semibold sm:hidden" />
      </span>
      <span className="flex flex-wrap items-center gap-x-(--espacio-2) gap-y-(--espacio-1) pl-(--espacio-5) text-xs text-texto-sutil">
        <span>{obrasEnTexto(cliente.obras.length)}</span>
        <span className="md:hidden">
          <Semaforo dias={cliente.dias} tamano="xs" />
        </span>
        {/* El aviso de límite es OTRO problema que la antigüedad: su propia marca. */}
        {excede ? (
          <Badge variant="destructive">
            <TriangleAlert aria-hidden="true" />
            pasa el límite
          </Badge>
        ) : null}
      </span>
    </button>
  );
}

/** Una obra, colgada de su cliente: sangrada, y con su saldo y sus días en teléfono. */
function CeldaDeObra({ obra }: { readonly obra: RenglonDeCartera }) {
  return (
    <span className="flex min-w-0 flex-col gap-(--espacio-1) pl-(--espacio-5)">
      <span className={RENGLON_DEL_NOMBRE}>
        <CornerDownRight aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{obra.obra_nombre ?? 'Sin obra'}</span>
        <Dinero centavos={saldoDe(obra)} tamano="sm" className="sm:hidden" />
      </span>
      <span className="pl-(--espacio-5) text-xs md:hidden">
        <Semaforo dias={obra.dias_mas_viejo ?? 0} tamano="xs" />
      </span>
    </span>
  );
}

/**
 * Llamar a un toque y registrar el pago: así se cobra de verdad, desde la fila.
 *
 * Los dos miden el área táctil —es la pantalla que más se usa desde el teléfono, con
 * el pulgar— y van separados: llamar cuando se quería registrar el pago es un error
 * que se nota en la cara de quien contesta.
 */
function CeldaDeCobranza({
  cliente,
  alRegistrarPago,
}: {
  readonly cliente: ClienteDeCartera;
  readonly alRegistrarPago: (clienteId: string) => void;
}) {
  return (
    <span className="flex items-center justify-end gap-(--espacio-2)">
      {cliente.telefono === null ? null : (
        <Button asChild variant="outline" size="icon">
          <a href={`tel:${cliente.telefono}`} aria-label={`Llamar a ${cliente.nombre}`}>
            <Phone aria-hidden="true" />
          </a>
        </Button>
      )}
      <Button
        type="button"
        className="min-w-(--area-tactil-minima)"
        aria-label={`Registrar pago de ${cliente.nombre}`}
        onClick={() => {
          alRegistrarPago(cliente.id);
        }}
      >
        <HandCoins aria-hidden="true" />
        {/* La palabra, sólo en la PC: en teléfono el nombre necesita el ancho, y en
            tablet lo necesitan las cinco columnas del documento. */}
        <span className="hidden lg:inline">Registrar pago</span>
      </Button>
    </span>
  );
}

/** Las columnas del documento. Cada una se gana su lugar (`04-INTERFAZ` §PANTALLA 5). */
function columnasDeCartera({
  voc,
  abierto,
  alAlternar,
  alRegistrarPago,
}: {
  readonly voc: Vocabulario;
  readonly abierto: string | null;
  readonly alAlternar: (clienteId: string) => void;
  readonly alRegistrarPago: (clienteId: string) => void;
}): readonly ColumnaDeTabla<FilaDeCartera>[] {
  return [
    {
      clave: 'cliente',
      titulo: `${voc.titulo('cliente')} / obra`,
      celda: (fila) =>
        fila.tipo === 'cliente' ? (
          <CeldaDeCliente
            cliente={fila.cliente}
            desplegado={abierto === fila.cliente.id}
            alAlternar={alAlternar}
          />
        ) : (
          <CeldaDeObra obra={fila.obra} />
        ),
    },
    {
      clave: 'debe',
      titulo: 'Debe',
      numerica: true,
      // En teléfono va en la celda del nombre: junto a los dos botones no cabe.
      desde: 'sm',
      celda: (fila) =>
        fila.tipo === 'cliente' ? (
          <Dinero centavos={fila.cliente.debe} className="font-semibold" />
        ) : (
          <Dinero centavos={saldoDe(fila.obra)} tamano="sm" />
        ),
    },
    {
      clave: 'viejo',
      titulo: 'Más viejo',
      desde: 'md',
      // El punto de color NUNCA va solo: al lado va su palabra.
      celda: (fila) => (
        <Semaforo
          dias={fila.tipo === 'cliente' ? fila.cliente.dias : (fila.obra.dias_mas_viejo ?? 0)}
        />
      ),
    },
    {
      clave: 'limite',
      titulo: 'Límite',
      numerica: true,
      desde: 'md',
      celda: (fila) => {
        if (fila.tipo === 'obra') return null;
        return fila.cliente.limite === 0 ? (
          <span className="text-texto-sutil">sin límite</span>
        ) : (
          <Dinero centavos={fila.cliente.limite} tamano="sm" />
        );
      },
    },
    {
      clave: 'ultimo',
      titulo: 'Últ. pago',
      desde: 'md',
      celda: (fila) => {
        if (fila.tipo === 'obra') return null;
        const dias = fila.cliente.diasUltimoPago;
        return (
          <span className="text-texto-sutil">
            {dias === null ? 'sin pagos' : `hace ${String(dias)} d`}
          </span>
        );
      },
    },
    {
      clave: 'cobranza',
      titulo: 'Cobranza',
      celda: (fila) =>
        fila.tipo === 'obra' ? null : (
          <CeldaDeCobranza cliente={fila.cliente} alRegistrarPago={alRegistrarPago} />
        ),
    },
  ];
}

/** Las remisiones abiertas: la casilla y el folio van juntos, y el folio la marca. */
function columnasDeDocumentos(
  elegidos: readonly string[],
  alCambiar: (ids: readonly string[]) => void,
): readonly ColumnaDeTabla<DocumentoPorCobrar>[] {
  return [
    {
      clave: 'remision',
      titulo: 'Remisión',
      celda: (doc) => (
        <span className="flex min-w-0 items-center gap-(--espacio-2)">
          <Checkbox
            id={`doc-${doc.id}`}
            checked={elegidos.includes(doc.id)}
            onCheckedChange={(marcado) => {
              alCambiar(
                marcado === true ? [...elegidos, doc.id] : elegidos.filter((uno) => uno !== doc.id),
              );
            }}
          />
          <label htmlFor={`doc-${doc.id}`} className="flex min-w-0 cursor-pointer flex-col">
            <span className="font-medium">{doc.folio ?? 'Sin folio'}</span>
            <span className="truncate text-xs text-texto-sutil">
              {doc.obra_nombre ?? 'Sin obra'}
            </span>
          </label>
        </span>
      ),
    },
    {
      clave: 'dias',
      titulo: 'Días',
      numerica: true,
      celda: (doc) => <Cifra valor={doc.dias} unidad="d" tamano="sm" />,
    },
    {
      clave: 'saldo',
      titulo: 'Saldo',
      numerica: true,
      celda: (doc) => <Dinero centavos={doc.saldo_documento_centavos ?? 0} tamano="sm" />,
    },
  ];
}

interface FichaDePagoProps {
  readonly cliente: ClienteDeCartera;
  readonly documentos: readonly DocumentoPorCobrar[] | null;
  readonly falloDeDocumentos: string | null;
  readonly elegidos: readonly string[];
  readonly sumaElegida: number;
  readonly metodo: ClaveMetodo;
  readonly enviando: boolean;
  readonly error: string | null;
  readonly alCambiarElegidos: (ids: readonly string[]) => void;
  readonly alCambiarMetodo: (metodo: ClaveMetodo) => void;
  readonly alReintentarDocumentos: () => void;
  readonly alRegistrar: () => void;
}

/** Las remisiones: su esqueleto, su error o su tabla. */
function DocumentosDeLaFicha({
  documentos,
  falloDeDocumentos,
  elegidos,
  alCambiarElegidos,
  alReintentarDocumentos,
}: Pick<
  FichaDePagoProps,
  'documentos' | 'falloDeDocumentos' | 'elegidos' | 'alCambiarElegidos' | 'alReintentarDocumentos'
>) {
  const voc = useVocabulario();
  if (falloDeDocumentos !== null) {
    return (
      <ErrorDePantalla
        titulo="No se pudieron leer las remisiones abiertas"
        queHacer="Sin ellas no se arma el importe del pago. Vuelve a leerlas; no se registró ningún pago."
        detalle={falloDeDocumentos}
        reintentar={
          <Button type="button" variant="outline" onClick={alReintentarDocumentos}>
            Volver a leer
          </Button>
        }
      />
    );
  }
  if (documentos === null) return <EsqueletoDeLista filas={3} />;
  return (
    <Tabla
      etiqueta="Remisiones abiertas"
      columnas={columnasDeDocumentos(elegidos, alCambiarElegidos)}
      filas={documentos}
      claveDe={(doc) => doc.id}
      alto="max-h-[40dvh]"
      vacio={
        <Vacio
          icono={<FileSignature />}
          titulo={`${voc.conDeterminante('este', 'cliente')} no tiene remisiones abiertas.`}
          explicacion="Su saldo ya quedó aplicado a documentos cerrados."
          className="py-(--espacio-4)"
        />
      }
    />
  );
}

/**
 * La ficha del pago: quién, cuánto debe, con qué paga y a qué remisiones. El
 * importe y el botón quedan pegados abajo: es la acción principal de la pantalla.
 */
function FichaDePago(props: FichaDePagoProps) {
  const { cliente, metodo, enviando, error, elegidos, sumaElegida } = props;
  return (
    <>
      <SheetHeader className="gap-(--espacio-3) border-b border-borde">
        <div className="flex flex-col gap-(--espacio-1) pr-(--espacio-8)">
          <SheetTitle className="text-lg">{cliente.nombre}</SheetTitle>
          <SheetDescription>
            El pago se aplica a documentos, no al saldo. Viene marcado el más viejo; el cliente
            decide.
          </SheetDescription>
        </div>
        <dl className="flex flex-wrap gap-x-(--espacio-6) gap-y-(--espacio-2)">
          <div className="flex flex-col gap-(--espacio-1)">
            <dt className={ROTULO}>Debe</dt>
            <dd>
              <Dinero centavos={cliente.debe} tamano="lg" className="font-semibold" />
            </dd>
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <dt className={ROTULO}>Más viejo</dt>
            <dd className="text-sm">
              <Semaforo dias={cliente.dias} />
            </dd>
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <dt className={ROTULO}>Límite</dt>
            <dd className="text-sm">
              {cliente.limite === 0 ? (
                <span className="text-texto-sutil">sin definir</span>
              ) : (
                <Dinero centavos={cliente.limite} tamano="sm" />
              )}
            </dd>
          </div>
        </dl>
      </SheetHeader>

      <div className="flex flex-col gap-(--espacio-3) px-(--espacio-4)">
        <div
          role="group"
          aria-label="Método del pago"
          className="grid grid-cols-2 gap-(--espacio-2)"
        >
          {METODOS.map((uno) => (
            <Button
              key={uno.clave}
              type="button"
              variant={metodo === uno.clave ? 'default' : 'outline'}
              aria-pressed={metodo === uno.clave}
              onClick={() => {
                props.alCambiarMetodo(uno.clave);
              }}
            >
              {/* El color no puede ser el único que diga cuál está elegido. */}
              {metodo === uno.clave ? <Check aria-hidden="true" /> : null}
              {uno.etiqueta}
            </Button>
          ))}
        </div>

        <p className="text-xs text-texto-sutil">
          Lo que marques SUMA el importe. El pago se aplica a lo que venció primero, que es como se
          lleva una cuenta de crédito.
        </p>

        <DocumentosDeLaFicha
          documentos={props.documentos}
          falloDeDocumentos={props.falloDeDocumentos}
          elegidos={elegidos}
          alCambiarElegidos={props.alCambiarElegidos}
          alReintentarDocumentos={props.alReintentarDocumentos}
        />

        {/* Dentro de la ficha y no detrás de ella: el velo taparía lo que pasó. */}
        {error === null ? null : (
          <Aviso tono="peligro" titulo={error}>
            Ningún pago quedó registrado.
          </Aviso>
        )}
      </div>

      <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-(--espacio-3) border-t border-borde bg-fondo p-(--espacio-4)">
        <p className="flex flex-col">
          <span className={ROTULO}>Importe del pago</span>
          <Dinero centavos={sumaElegida} tamano="lg" className="font-semibold" />
        </p>
        <Button
          type="button"
          size="lg"
          cargando={enviando}
          disabled={enviando || elegidos.length === 0}
          onClick={props.alRegistrar}
        >
          <HandCoins aria-hidden="true" />
          {enviando ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </footer>
    </>
  );
}

/** Cargando, con la forma de la cartera: las cifras no saltan al llegar. */
function CarteraCargando() {
  return (
    <div className={LIENZO}>
      <h1 className="text-xl font-semibold">Cuentas</h1>
      <Superficie
        relleno={0}
        aria-hidden="true"
        className={`overflow-hidden ${REJILLA_DEL_RESUMEN}`}
      >
        <div className="col-span-2 flex flex-col gap-(--espacio-2) p-(--espacio-4) md:col-span-1">
          <Esqueleto className="h-3 w-28" />
          <Esqueleto className="h-[calc(var(--altura-control)*0.8)] w-44" />
          <Esqueleto className="h-3 w-20" />
        </div>
        {[0, 1].map((indice) => (
          <div key={indice} className="flex flex-col gap-(--espacio-2) p-(--espacio-4)">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="h-[calc(var(--altura-control)*0.6)] w-32" />
            <Esqueleto className="h-3 w-16" />
          </div>
        ))}
      </Superficie>
      <Esqueleto className="h-(--altura-control) w-full md:w-80" />
      <EsqueletoDeLista filas={6} />
    </div>
  );
}

export function Cuentas({
  renglonesIniciales,
  pagosIniciales,
  documentosIniciales,
  onPagoRegistrado,
}: CuentasProps) {
  const voc = useVocabulario();
  const [renglones, setRenglones] = useState<readonly RenglonDeCartera[] | null>(
    renglonesIniciales ?? null,
  );
  const [pagos, setPagos] = useState<readonly PagoDeCredito[]>(pagosIniciales ?? []);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<ClaveFiltro>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  /** La fila que lleva el nombre de viaje: sólo en el instante antes del cambio. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [documentos, setDocumentos] = useState<readonly DocumentoPorCobrar[] | null>(null);
  const [falloDeDocumentos, setFalloDeDocumentos] = useState<string | null>(null);
  const [intentoDeDocumentos, setIntentoDeDocumentos] = useState(0);
  const [elegidos, setElegidos] = useState<readonly string[]>([]);
  const [metodo, setMetodo] = useState<ClaveMetodo>('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagoRegistrado, setPagoRegistrado] = useState<PagoRegistrado | null>(null);
  /** El pago ENTRÓ y lo que falló fue volver a leer la cartera: otro aviso, no `error`. */
  const [falloDeRelectura, setFalloDeRelectura] = useState<string | null>(null);

  useEffect(() => {
    if (renglonesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    // Las dos lecturas viajan juntas porque la cabecera es una sola frase: lo
    // que me deben y lo que ya entró hoy se leen de un vistazo, o no sirven.
    Promise.all([
      consultarPuente<RenglonDeCartera>('CarteraPorObra', { limite: 400, signal: control.signal }),
      consultarPuente<PagoDeCredito>('PagoCredito', { limite: 120, signal: control.signal }),
    ])
      .then(([cartera, cobros]) => {
        if (!sigueMontada()) return;
        setRenglones(cartera);
        setPagos(cobros.filter((pago) => esDeHoy(pago.fecha)));
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setFalloDeCarga(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [renglonesIniciales, intento]);

  useEffect(() => {
    if (ficha === null || documentosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    consultarPuente<RemisionDelPuente>('Remision', {
      filtro: { cliente_id: ficha },
      signal: control.signal,
    })
      .then((filas) => {
        if (!sigueMontada()) return;
        const ahora = Date.now();
        // El saldo llega en pesos y la lista por la entrega MÁS NUEVA
        // (`-entregada_en`): se pasa a centavos y se da la vuelta, porque lo que
        // se sugiere es lo que venció primero.
        const pendientes = filas
          .map((remision) => aDocumento(remision, ahora))
          .filter((doc) => (doc.saldo_documento_centavos ?? 0) > 0)
          .toSorted(porAntiguedad);
        setDocumentos(pendientes);
        // La sugerencia es el más viejo, ya marcado. Se puede desmarcar.
        const viejo = pendientes[0];
        setElegidos(viejo === undefined ? [] : [viejo.id]);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setFalloDeDocumentos(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [ficha, documentosIniciales, intentoDeDocumentos]);

  const clientes = useMemo(() => agruparPorCliente(renglones ?? []), [renglones]);
  const pagaronHoy = useMemo(() => new Set(pagos.map((pago) => pago.cliente_id)), [pagos]);
  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    return clientes.filter((cliente) => {
      const obras = cliente.obras.map((obra) => obra.obra_nombre ?? '').join(' ');
      if (aguja !== '' && !`${cliente.nombre} ${obras}`.toLowerCase().includes(aguja)) return false;
      if (filtro === 'vencidos') return cliente.dias > DIAS_VENCIDO;
      if (filtro === 'hoy') return pagaronHoy.has(cliente.id);
      return true;
    });
  }, [clientes, busqueda, filtro, pagaronHoy]);
  // Las obras del cliente desplegado van justo debajo de él, en sus columnas.
  const filas = useMemo(
    () =>
      visibles.flatMap((cliente): FilaDeCartera[] => [
        { tipo: 'cliente', cliente },
        ...(abierto === cliente.id
          ? cliente.obras.map((obra): FilaDeCartera => ({ tipo: 'obra', cliente, obra }))
          : []),
      ]),
    [visibles, abierto],
  );

  const elegida = clientes.find((cliente) => cliente.id === ficha) ?? null;
  const sumaElegida = (documentos ?? [])
    .filter((doc) => elegidos.includes(doc.id))
    .reduce((suma, doc) => suma + (doc.saldo_documento_centavos ?? 0), 0);

  function abrirFicha(clienteId: string): void {
    setFicha(clienteId);
    setDocumentos(documentosIniciales ?? null);
    setFalloDeDocumentos(null);
    setElegidos([]);
    setPagoRegistrado(null);
    // El pago que falló era de la ficha anterior: en ésta se pintaría como suyo.
    setError(null);
  }

  /**
   * La fila viaja a la ficha. Antes del cambio la FILA lleva el nombre; dentro
   * del cambio se lo quita y se lo pone la ficha, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrirFichaDesdeLaFila(clienteId: string): void {
    flushSync(() => {
      setViajando(clienteId);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        abrirFicha(clienteId);
      });
    });
  }

  /** El camino de vuelta: la ficha se recoge en su fila. */
  function cerrarFicha(): void {
    const id = ficha;
    if (id === null) return;
    void conTransicion(() => {
      flushSync(() => {
        setFicha(null);
        setViajando(id);
      });
    }).finally(() => {
      setViajando(null);
    });
  }

  function reintentarCarga(): void {
    setFalloDeCarga(null);
    setRenglones(null);
    setIntento((previo) => previo + 1);
  }

  function verTodaLaCartera(): void {
    setBusqueda('');
    setFiltro('todos');
  }

  /**
   * Se relee la cartera entera: un pago toca el saldo de varias obras a la vez, y
   * adivinar aquí cuál bajó cuánto es inventar el estado del servidor.
   */
  async function releerCartera(): Promise<void> {
    setFalloDeRelectura(null);
    try {
      setRenglones(await consultarPuente<RenglonDeCartera>('CarteraPorObra', { limite: 400 }));
    } catch (fallo) {
      setFalloDeRelectura(mensajeDe(fallo));
    }
  }

  async function registrarPago(cliente: ClienteDeCartera): Promise<void> {
    // Un doble toque llega antes que el re-pintado que apaga el botón.
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      /**
       * LOS DOCUMENTOS ELEGIDOS SUMAN, NO DIRIGEN — y antes se mandaban como si
       * dirigieran.
       *
       * `credito.registrar_pago` aplica el dinero con `repartirPago` POR
       * VENCIMIENTO —«lo que se paga primero es lo que venció primero», y es la misma
       * función en los dos giros—. La clave `documentos` no está en su esquema, así
       * que zod la tiraba EN SILENCIO: la cajera elegía la remisión 3 y el pago
       * bajaba de la 1. El importe era correcto y la aplicación no, sin un error en
       * ninguna parte.
       *
       * La selección se queda porque SIRVE: es como se arma el importe. Lo que se
       * quita es la clave que prometía dirigir el pago, y la pantalla dice en voz
       * alta a qué se aplica.
       */
      await invocarComando('/api/credito/pago', {
        clienteId: cliente.id,
        metodo,
        montoCentavos: sumaElegida,
      });
    } catch (fallo) {
      // Sólo aquí es verdad que «ningún pago quedó registrado».
      setError(mensajeDe(fallo));
      setEnviando(false);
      return;
    }
    // DESDE AQUÍ EL PAGO YA ENTRÓ. Lo que falle después no lo deshace: se cierra la
    // ficha antes de releer, porque un fallo de la relectura con la ficha abierta y
    // el botón encendido invitaba a registrarlo dos veces.
    setEnviando(false);
    // Lo que se dice es lo que pasa: el importe sale de lo elegido y el sistema
    // lo aplica a lo que venció primero.
    setPagoRegistrado({ nombre: cliente.nombre, centavos: sumaElegida });
    setFicha(null);
    onPagoRegistrado?.(cliente.id, sumaElegida);
    await releerCartera();
  }

  if (falloDeCarga !== null) {
    return (
      <div className={LIENZO}>
        <h1 className="text-xl font-semibold">Cuentas</h1>
        <ErrorDePantalla
          titulo="No se pudo leer la cartera"
          queHacer="Sin ella no se sabe quién debe ni cuánto. Revisa la conexión y vuelve a intentarlo; no se registró ningún pago."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentarCarga}>
              Volver a intentar
            </Button>
          }
        />
      </div>
    );
  }

  if (renglones === null) return <CarteraCargando />;

  if (renglones.length === 0) {
    // El vacío ENSEÑA el flujo: de dónde sale un cliente de cuenta.
    return (
      <div className="mx-auto max-w-lg p-(--espacio-8)">
        <h1 className="sr-only">Cuentas</h1>
        <Vacio
          icono={<FileSignature />}
          titulo="Todavía no le das crédito a nadie."
          explicacion="Cuando despaches con «Remisión a cuenta» (F11) en el mostrador, el cliente aparece aquí con su obra, su antigüedad y su límite."
          accion={
            <Button asChild>
              <a href="/ferreteria/mostrador">Ir al mostrador</a>
            </Button>
          }
        />
      </div>
    );
  }

  const columnas = columnasDeCartera({
    voc,
    abierto,
    alAlternar: (clienteId) => {
      setAbierto(abierto === clienteId ? null : clienteId);
    },
    alRegistrarPago: abrirFichaDesdeLaFila,
  });
  const debeVisible = visibles.reduce((suma, cliente) => suma + cliente.debe, 0);

  return (
    <div className={LIENZO}>
      <h1 className="text-xl font-semibold">Cuentas</h1>

      {/* Encima del último dato conocido, nunca en lugar de él, y lo primero que
          dice es que no se aplicó ningún pago. Con la ficha abierta va dentro. */}
      {error !== null && elegida === null ? (
        <Aviso tono="peligro" titulo={error}>
          Ningún pago quedó registrado.
        </Aviso>
      ) : null}
      {pagoRegistrado === null ? null : (
        <Aviso tono="exito" titulo={`Pago de ${pagoRegistrado.nombre} registrado.`}>
          <Dinero centavos={pagoRegistrado.centavos} tamano="sm" /> · se aplica a lo que venció
          primero.
        </Aviso>
      )}
      {/* El pago entró; lo que no llegó es la cartera nueva. Dice las dos cosas, para
          que nadie lo registre otra vez al ver el saldo de antes. */}
      {falloDeRelectura === null ? null : (
        <Aviso
          tono="atencion"
          titulo="El pago sí quedó registrado, pero la cartera no se pudo volver a leer."
          accion={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void releerCartera();
              }}
            >
              Volver a leer
            </Button>
          }
        >
          Los saldos de abajo son de antes del pago: no lo registres otra vez. {falloDeRelectura}
        </Aviso>
      )}

      <ResumenDeCartera renglones={renglones} clientes={clientes} pagos={pagos} />

      <div className="flex flex-col gap-(--espacio-2) md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            type="search"
            aria-label={`Buscar ${voc.singular('cliente')} u obra`}
            placeholder={`Buscar ${voc.singular('cliente')} u obra`}
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
            className="pl-(--espacio-10)"
          />
        </div>
        <div role="group" aria-label="Filtro de la cartera" className="flex gap-(--espacio-1)">
          {FILTROS.map((uno) => (
            <Button
              key={uno.clave}
              type="button"
              size="sm"
              variant={filtro === uno.clave ? 'default' : 'outline'}
              aria-pressed={filtro === uno.clave}
              onClick={() => {
                setFiltro(uno.clave);
              }}
            >
              {uno.etiqueta}
            </Button>
          ))}
        </div>
      </div>

      <Tabla
        etiqueta="Cartera de crédito"
        columnas={columnas}
        filas={filas}
        claveDe={claveDeFila}
        {...(abierto === null ? {} : { activa: abierto })}
        // Las obras son el desglose de su cliente, no otro renglón de su altura.
        tonoDeFila={(fila) => (fila.tipo === 'obra' ? 'tenue' : undefined)}
        viajeDeFila={(fila) =>
          fila.tipo === 'cliente' && fila.cliente.id === viajando
            ? VIAJE.fila(fila.cliente.id)
            : undefined
        }
        alto="max-h-[65dvh]"
        pie={{
          // En teléfono la columna «Debe» no está: su total va junto a la cuenta.
          cliente: (
            <span className="flex items-baseline justify-between gap-(--espacio-2)">
              {voc.conNumero('cliente', visibles.length)}
              <Dinero centavos={debeVisible} className="font-semibold sm:hidden" />
            </span>
          ),
          debe: <Dinero centavos={debeVisible} className="font-semibold" />,
        }}
        vacio={
          <Vacio
            icono={<Search />}
            titulo={`${voc.conDeterminante('ningun', 'cliente')} cae en este filtro.`}
            explicacion="Quita la búsqueda o vuelve a «Todos»."
            accion={
              <Button type="button" variant="outline" onClick={verTodaLaCartera}>
                Ver toda la cartera
              </Button>
            }
            className="py-(--espacio-6)"
          />
        }
      />

      {/* Hoja inferior en teléfono, costado de tablet arriba. Sin deslizamiento
          propio: la que se mueve es la fila, que viaja hasta ser la ficha. */}
      <Sheet
        open={elegida !== null}
        onOpenChange={(visible) => {
          if (!visible) cerrarFicha();
        }}
      >
        <SheetContent
          side="bottom"
          style={elegida === null ? undefined : { viewTransitionName: VIAJE.fila(elegida.id) }}
          className="max-h-[85dvh] gap-(--espacio-3) overflow-y-auto data-[state=closed]:animate-none data-[state=open]:animate-none md:inset-y-0 md:left-auto md:max-h-none md:w-full md:max-w-md"
        >
          {elegida === null ? null : (
            <FichaDePago
              cliente={elegida}
              documentos={documentos}
              falloDeDocumentos={falloDeDocumentos}
              elegidos={elegidos}
              sumaElegida={sumaElegida}
              metodo={metodo}
              enviando={enviando}
              error={error}
              alCambiarElegidos={setElegidos}
              alCambiarMetodo={setMetodo}
              alReintentarDocumentos={() => {
                setFalloDeDocumentos(null);
                setDocumentos(null);
                setIntentoDeDocumentos((previo) => previo + 1);
              }}
              alRegistrar={() => {
                void registrarPago(elegida);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
