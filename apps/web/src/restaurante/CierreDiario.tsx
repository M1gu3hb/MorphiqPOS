'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
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
import { ChevronDown, CircleCheck, Lock, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { CorteEnPdf } from '~/corte/CorteEnPdf';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · cierre-diario-y-arqueo
 *
 * Cerrar el día y saber si cuadró. Una vez al día, a las 23:30, el encargado o
 * el dueño. Es la pantalla que menos se usa y la que más cuesta cuando falla.
 *
 * ── El arqueo A CIEGAS es la regla que define esta pantalla ──────────────
 * El campo de conteo va PRIMERO, vacío y con el foco puesto, y el esperado no
 * aparece hasta que hay una cifra escrita. Si se enseñara antes, todo el mundo
 * teclearía ese número y el arqueo dejaría de existir como control: sería un
 * formulario que se copia solo.
 *
 * ── Y sin embargo las secciones van en el orden del PDF ──────────────────
 * Porque quien cierra ya sabe leer ese documento antes de generarlo, y cambiar
 * el orden le obligaría a aprenderlo dos veces. Se resuelve con el ESPACIO y no
 * con el orden: el conteo vive en su propia columna —fija arriba en teléfono y
 * tablet, carril derecho pegajoso en PC—, así que encabeza la jerarquía sin
 * desordenar el 1·2·3. En el DOM va primero, que es lo que decide el foco y lo
 * que oye un lector de pantalla. Es además la única superficie levantada
 * (`nivel 2`): las tres secciones del corte se leen, el conteo se opera.
 *
 * ── Las mesas abiertas son un MURO, y se comprueba DOS veces ─────────────
 * Al abrir el diálogo y otra vez justo antes de ejecutar. Entre una cosa y la
 * otra pasan los tres minutos que se tarda en contar el cajón, y en esos tres
 * minutos alguien sienta una mesa. Cerrar con una cuenta viva deja esa venta
 * fuera del corte, y eso no lo cuadra nadie después.
 *
 * ── El PDF se descarga solo ──────────────────────────────────────────────
 * Salvo que la perilla esté apagada. El dueño se va y lo lee en el coche; un
 * documento que hay que ir a buscar es un documento que no se lee.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * Inventario, historial, edición de ventas y reportes de otros días. Esto
 * cierra HOY; lo demás se pregunta en «Registros».
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * 1. El efectivo esperado se DERIVA aquí (fondo + ventas en efectivo + propina
 *    en efectivo − gastos pagados en efectivo) para poder enseñar el semáforo
 *    sin cerrar. La cifra que manda es la de `caja.cerrar`, calculada dentro de
 *    su transacción; si difieren gana la del corte, y se ve al cerrar.
 * 2. El fondo que se deja en el cajón viaja como CAMPO (`fondoDejadoCentavos`): el
 *    servidor guarda lo retirado y la apertura de mañana lo espera (C.6 de la 2.4).
 * 3. El PDF del cierre lo arma `CorteEnPdf` con la hoja del servidor
 *    (`caja.hoja_del_corte`) en el orden del §9.3, y se baja solo al cerrar. Antes
 *    el botón «Imprimir el cierre» llamaba a un callback que ninguna página pasaba:
 *    no hacía NADA (C.6 de la 2.4).
 * 4. Todo importe se pinta con `Dinero` y se teclea con `CampoDeDinero`, del
 *    sistema: la pantalla habla sólo en centavos.
 */

const CANALES = ['efectivo', 'tarjeta', 'transferencia'] as const;
type Canal = (typeof CANALES)[number];

const NOMBRE_DEL_CANAL: Readonly<Record<Canal, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

/** Por debajo de esto el descuadre es «se me fue un peso»; por encima, no. */
const TOLERANCIA_CENTAVOS = 2000;

/**
 * La venta del día tal como la nombra el puente. Los importes van en PESOS, y se leen
 * sólo por `centavosDe`: la unidad la decide la conversión del campo, no quien lo lee.
 */
export interface VentaDelDia {
  readonly id: string;
  readonly estado: string | null;
  readonly total: number | null;
  readonly costo_total_snapshot: number | null;
  readonly propina_efectivo: number | null;
  readonly propina_tarjeta: number | null;
  readonly propina_transferencia: number | null;
  readonly monto_efectivo: number | null;
  readonly monto_tarjeta: number | null;
  readonly monto_transferencia: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly fecha_apertura: string | null;
}

export interface GastoDelDia {
  readonly id: string;
  readonly monto: number | null;
  readonly metodo_pago: string | null;
}

export interface MesaViva {
  readonly id: string;
  readonly numero: number | null;
  readonly venta_activa_id: string | null;
  readonly mesero_asignado_nombre: string | null;
}

export interface DatosDelDia {
  readonly ventas: readonly VentaDelDia[];
  readonly gastos: readonly GastoDelDia[];
  readonly mesas: readonly MesaViva[];
  /** Lo que se contó al abrir: la primera pieza del efectivo esperado. */
  readonly fondoInicial: number;
  readonly cajaAbierta: boolean;
}

/** Lo que devuelve `caja.cerrar`. Sus importes llegan como texto de BigInt. */
export interface ResultadoDelCierre {
  readonly sesionCajaId: string;
  readonly serie: string;
  readonly folio: string;
  readonly efectivoEsperadoCentavos: string;
  readonly diferenciaCentavos: string;
  readonly numeroVentas: number;
}

export interface MesaQueBloquea {
  readonly id: string;
  readonly rotulo: string;
  readonly mesero: string;
  readonly total: number;
  readonly abierta: string;
}

export interface CierreDiarioProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly datosIniciales?: DatosDelDia;
}

/** Un gasto, en centavos. Sin monto cuenta como cero: no suma, y no rompe la suma. */
function montoDe(gasto: GastoDelDia): number {
  return centavosDe('GastoOperativo', 'monto', gasto.monto) ?? 0;
}

export interface ResumenDelDia {
  readonly ventas: number;
  readonly tickets: number;
  readonly promedio: number;
  readonly costo: number;
  readonly utilidad: number;
  /** En puntos base sobre la venta: 6543 se lee 65.43 %. */
  readonly margen: number;
  readonly gastos: number;
  readonly neta: number;
  readonly propinas: Readonly<Record<Canal, number>>;
  readonly porCanal: Readonly<Record<Canal, number>>;
  readonly gastosEnEfectivo: number;
}

/**
 * El resumen del día, SIN propinas dentro del dinero del negocio.
 *
 * La propina no es venta ni margen: es dinero de los meseros que pasó por la
 * caja. Mezclarla infla la utilidad del día, y quien lea el PDF creerá que ganó
 * lo que en realidad debe.
 */
export function resumirDia(
  ventas: readonly VentaDelDia[],
  gastos: readonly GastoDelDia[],
): ResumenDelDia {
  const pagadas = ventas.filter((venta) => venta.estado === 'pagada');
  // Cada lector ya devuelve CENTAVOS —pasa por `centavosDe`—; lo que no vino suma cero.
  const suma = (lee: (venta: VentaDelDia) => number | null): number =>
    pagadas.reduce((total, venta) => total + (lee(venta) ?? 0), 0);
  const total = suma((venta) => centavosDe('Venta', 'total', venta.total));
  const costo = suma((venta) =>
    centavosDe('Venta', 'costo_total_snapshot', venta.costo_total_snapshot),
  );
  const utilidad = total - costo;
  const operativos = gastos.reduce((lleva, gasto) => lleva + montoDe(gasto), 0);
  return {
    ventas: total,
    tickets: pagadas.length,
    promedio: pagadas.length === 0 ? 0 : Math.round(total / pagadas.length),
    costo,
    utilidad,
    margen: total === 0 ? 0 : Math.round((utilidad * 10000) / total),
    gastos: operativos,
    neta: utilidad - operativos,
    propinas: {
      efectivo: suma((venta) => centavosDe('Venta', 'propina_efectivo', venta.propina_efectivo)),
      tarjeta: suma((venta) => centavosDe('Venta', 'propina_tarjeta', venta.propina_tarjeta)),
      transferencia: suma((venta) =>
        centavosDe('Venta', 'propina_transferencia', venta.propina_transferencia),
      ),
    },
    porCanal: {
      efectivo: suma((venta) => centavosDe('Venta', 'monto_efectivo', venta.monto_efectivo)),
      tarjeta: suma((venta) => centavosDe('Venta', 'monto_tarjeta', venta.monto_tarjeta)),
      transferencia: suma((venta) =>
        centavosDe('Venta', 'monto_transferencia', venta.monto_transferencia),
      ),
    },
    gastosEnEfectivo: gastos
      .filter((gasto) => gasto.metodo_pago === 'efectivo' || gasto.metodo_pago === null)
      .reduce((lleva, gasto) => lleva + montoDe(gasto), 0),
  };
}

/** Lo que DEBERÍA haber en el cajón. No se enseña hasta que hay un conteo. */
export function esperadoEnCaja(datos: DatosDelDia, resumen: ResumenDelDia): number {
  const entra = resumen.porCanal.efectivo + resumen.propinas.efectivo;
  return datos.fondoInicial + entra - resumen.gastosEnEfectivo;
}

/** Los tres tonos del arqueo: cuadra, se fue poco, se fue mucho. */
export type TonoDelArqueo = 'exito' | 'atencion' | 'peligro';

export interface Semaforo {
  readonly texto: string;
  readonly tono: TonoDelArqueo;
}

/** Dice la PALABRA además del color: el color nunca viaja solo. */
export function semaforoDe(diferencia: number): Semaforo {
  if (diferencia === 0) return { texto: 'Cuadra exacto', tono: 'exito' };
  const falta = diferencia < 0;
  if (Math.abs(diferencia) <= TOLERANCIA_CENTAVOS) {
    return { texto: falta ? 'Falta poco' : 'Sobra poco', tono: 'atencion' };
  }
  const texto = falta ? 'FALTA dinero en el cajón' : 'SOBRA dinero en el cajón';
  return { texto, tono: 'peligro' };
}

/** El tinte de la caja de cada tono: el fondo y el borde, nunca solos. */
const TINTE_DEL_TONO: Readonly<Record<TonoDelArqueo, string>> = {
  exito: 'border-exito/50 bg-exito/10',
  atencion: 'border-advertencia/60 bg-advertencia/15',
  peligro: 'border-peligro/50 bg-peligro/10',
};

/**
 * El icono de cada tono. Es la FORMA del estado —círculo, triángulo, octágono—,
 * así que el semáforo se lee también sin color.
 */
function IconoDelTono({ tono }: { readonly tono: TonoDelArqueo }) {
  if (tono === 'exito') {
    return <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-exito" />;
  }
  if (tono === 'atencion') {
    return <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-advertencia" />;
  }
  return <OctagonAlert aria-hidden="true" className="size-5 shrink-0 text-peligro" />;
}

/** Traduce el fallo a algo accionable. El 429 no es un código: es el estado. */
export function mensajeDe(fallo: unknown, porOmision: string): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve.';
    if (fallo.error.codigo === 'CONFLICTO_ESTADO') return 'Esa caja ya se cerró en otra terminal.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede cerrar la caja.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : porOmision;
}

/** Cuánto lleva abierta, en palabras: el dato se lee, nunca se infiere. */
function desdeHace(iso: string | null, ahora: number): string {
  if (iso === null) return 'sin dato';
  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'recién';
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** Las mesas con cuenta viva, con las cuatro columnas que pide el documento. */
export function mesasQueBloquean(datos: DatosDelDia, ahora: number): readonly MesaQueBloquea[] {
  const porId = new Map(datos.ventas.map((venta) => [venta.id, venta]));
  return datos.mesas
    .filter((mesa) => mesa.venta_activa_id !== null)
    .map((mesa) => {
      const viva = mesa.venta_activa_id === null ? undefined : porId.get(mesa.venta_activa_id);
      return {
        id: mesa.id,
        rotulo: mesa.numero === null ? 'Sin número' : `Mesa ${mesa.numero}`,
        mesero: viva?.usuario_mesero_nombre ?? mesa.mesero_asignado_nombre ?? 'sin mesero',
        total: centavosDe('Venta', 'total', viva?.total) ?? 0,
        abierta: desdeHace(viva?.fecha_apertura ?? null, ahora),
      };
    });
}

interface SesionDeCaja {
  readonly estado: string | null;
  readonly efectivo_inicial_contado: number | null;
}

async function leerElDia(signal: AbortSignal): Promise<DatosDelDia> {
  const [ventas, gastos, mesas, sesiones] = await Promise.all([
    consultarPuente<VentaDelDia>('Venta', { limite: 500, signal }),
    consultarPuente<GastoDelDia>('GastoOperativo', { limite: 200, signal }),
    consultarPuente<MesaViva>('Mesa', { limite: 200, signal }),
    consultarPuente<SesionDeCaja>('CorteCaja', { limite: 1, signal }),
  ]);
  const sesion = sesiones[0];
  return {
    ventas,
    gastos,
    mesas,
    fondoInicial:
      centavosDe('CorteCaja', 'efectivo_inicial_contado', sesion?.efectivo_inicial_contado) ?? 0,
    cajaAbierta: sesion?.estado === 'abierto',
  };
}

type Dialogo =
  | { readonly tipo: 'confirmar' }
  | { readonly tipo: 'bloqueo'; readonly mesas: readonly MesaQueBloquea[] };

/** Un renglón del método de pago: lo que entró por ese canal, venta y propina. */
interface FilaDeCanal {
  readonly canal: Canal;
  readonly ventas: number;
  readonly propinas: number;
}

/**
 * Una cifra con su rótulo, dentro de un `<dl>`. Es la pieza de las secciones 1 y
 * 2 —«Ventas reales», «Ticket promedio»— y va con el rótulo ENCIMA y pequeño:
 * lo que se compara de un vistazo es la cifra, y en la rejilla de cuatro las
 * cifras quedan alineadas en su renglón.
 */
function Indicador({
  rotulo,
  children,
}: {
  readonly rotulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-(--espacio-1)">
      <dt className="text-xs text-texto-sutil">{rotulo}</dt>
      <dd className="text-texto">{children}</dd>
    </div>
  );
}

/**
 * Una sección del corte, en el orden del PDF. `details` nativo: el teclado y el
 * lector de pantalla ya saben abrirlo, y en teléfono se pliega sin código. El
 * número va tenue delante del título: es el orden del documento, no un adorno.
 */
function SeccionDelCorte({
  numero,
  titulo,
  children,
}: {
  readonly numero: number;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <Superficie como="details" open relleno={0} className="group">
      <summary className="flex min-h-(--area-tactil-minima) cursor-pointer list-none items-center gap-(--espacio-2) px-(--espacio-4) text-sm font-semibold tracking-wide uppercase [&::-webkit-details-marker]:hidden">
        <span className="font-numeros text-texto-sutil tabular-nums">{numero} ·</span>{' '}
        <span className="flex-1">{titulo}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-texto-sutil group-open:rotate-180" />
      </summary>
      <div className="px-(--espacio-4) pb-(--espacio-4)">{children}</div>
    </Superficie>
  );
}

export function CierreDiario({ datosIniciales }: CierreDiarioProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<DatosDelDia | null>(datosIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: el botón de reintentar lo sube y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  /** Lo que se contó en el cajón. `null` es «todavía no hay un importe», nunca cero. */
  const [contado, setContado] = useState<number | null>(null);
  const [fondo, setFondo] = useState<number | null>(null);
  const [alImprimir, setAlImprimir] = useState(true);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [releyendo, setReleyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [corte, setCorte] = useState<ResultadoDelCierre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    // El centinela es la señal de aborto: dice si la pantalla sigue montada y
    // además cancela las cuatro lecturas en vuelo.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    leerElDia(control.signal)
      .then((frescos) => {
        if (sigueMontada()) setDatos(frescos);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setFalloDeCarga(mensajeDe(fallo, 'No se pudo leer el día.'));
      });
    return () => {
      control.abort();
    };
  }, [datosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setDatos(null);
    setIntento((previo) => previo + 1);
  }

  // La pantalla NUNCA se vacía por un error de comando: el aviso va encima del
  // último dato, y dice lo que NO pasó.
  const avisoDeFallo =
    error === null ? null : (
      <Aviso tono="peligro" titulo={error}>
        La caja NO se cerró.
      </Aviso>
    );

  if (datos === null) {
    if (falloDeCarga !== null) {
      return (
        <div className="mx-auto max-w-lg p-(--espacio-6)">
          <ErrorDePantalla
            titulo="No se pudo leer el día"
            queHacer="Sin las ventas, los gastos y el salón de hoy no hay corte que cuadrar. Revisa la conexión y vuelve a leer: no se cerró nada."
            detalle={falloDeCarga}
            reintentar={<Button onClick={reintentar}>Volver a leer</Button>}
          />
        </div>
      );
    }
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Leyendo el día"
        className="grid items-start gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        {/* La forma del conteo y de las tres secciones, no una rueda: al llegar
            los datos nada salta de sitio, y el ojo ya sabe dónde va a mirar. */}
        <Esqueleto className="h-(--altura-control) w-72 max-w-full xl:col-span-2" />
        <Esqueleto className="h-80 w-full rounded-lg xl:col-start-2 xl:row-start-2" />
        <div className="flex flex-col gap-(--espacio-4) xl:col-start-1 xl:row-start-2">
          <Esqueleto className="h-48 w-full rounded-lg" />
          <Esqueleto className="h-36 w-full rounded-lg" />
          <Esqueleto className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // El vacío ENSEÑA de dónde sale un cierre; no se disculpa por no tenerlo.
  if (!datos.cajaAbierta && corte === null) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-(--espacio-4) p-(--espacio-6)">
        {avisoDeFallo}
        <Vacio
          icono={<Lock />}
          titulo="No hay ninguna caja abierta que cerrar."
          explicacion="El día se cierra desde la terminal donde se abrió la caja: ahí vive el fondo que se contó por la mañana y de esa sesión cuelgan las ventas que entran al corte."
          accion={
            <Button asChild>
              <a href="/restaurante/caja">Ir a la caja</a>
            </Button>
          }
        />
      </div>
    );
  }

  if (corte !== null) {
    const diferencia = Number(corte.diferenciaCentavos);
    const cerrado = semaforoDe(diferencia);
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-(--espacio-4) p-(--espacio-6)">
        <header className="flex flex-col gap-(--espacio-1) text-center">
          <h1 className="text-xl font-bold">Caja cerrada</h1>
          <p className="text-sm text-texto-sutil">
            Corte {corte.serie}-{corte.folio} · {corte.numeroVentas} tickets
          </p>
        </header>
        {/* LA respuesta del día, y lo único grande: ¿cuadró? La cifra manda y la
            palabra con su forma dice cómo leerla. */}
        <Superficie
          role="status"
          nivel={0}
          relleno={6}
          className={`flex flex-col items-center gap-(--espacio-2) text-center ${TINTE_DEL_TONO[cerrado.tono]}`}
        >
          <Dinero centavos={diferencia} tamano="total" />
          <p className="flex items-center gap-(--espacio-2) font-medium">
            <IconoDelTono tono={cerrado.tono} />
            {cerrado.texto}
          </p>
        </Superficie>
        <dl className="grid grid-cols-2 gap-(--espacio-4)">
          <Indicador rotulo="Esperado">
            <Dinero centavos={Number(corte.efectivoEsperadoCentavos)} tamano="lg" />
          </Indicador>
          <Indicador rotulo="Contado">
            <Dinero centavos={contado ?? 0} tamano="lg" />
          </Indicador>
        </dl>
        {/* El PDF del cierre (§9.3), que se baja solo si quien cerró dejó encendido el
            interruptor y el negocio no apagó la descarga automática (C.6 de la 2.4). */}
        <CorteEnPdf sesionCajaId={corte.sesionCajaId} descargarAlCerrar={alImprimir} />
      </div>
    );
  }

  const resumen = resumirDia(datos.ventas, datos.gastos);
  const cuenta = contado;
  const dejado = fondo ?? 0;
  const esperado = esperadoEnCaja(datos, resumen);
  const semaforo = semaforoDe((cuenta ?? 0) - esperado);
  const totalDePropinas = CANALES.reduce((suman, canal) => suman + resumen.propinas[canal], 0);
  const filasDeCanal: readonly FilaDeCanal[] = CANALES.map((canal) => ({
    canal,
    ventas: resumen.porCanal[canal],
    propinas: resumen.propinas[canal],
  }));
  const ventasPorCanal = filasDeCanal.reduce((suman, fila) => suman + fila.ventas, 0);

  const columnasDeCanal: readonly ColumnaDeTabla<FilaDeCanal>[] = [
    { clave: 'metodo', titulo: 'Método', celda: (fila) => NOMBRE_DEL_CANAL[fila.canal] },
    {
      clave: 'ventas',
      titulo: 'Ventas',
      numerica: true,
      celda: (fila) => <Dinero centavos={fila.ventas} tamano="sm" />,
    },
    {
      clave: 'propinas',
      titulo: 'Propinas',
      numerica: true,
      celda: (fila) => <Dinero centavos={fila.propinas} tamano="sm" />,
    },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      celda: (fila) => (
        <Dinero centavos={fila.ventas + fila.propinas} tamano="sm" className="font-semibold" />
      ),
    },
  ];

  const columnasDeMesa: readonly ColumnaDeTabla<MesaQueBloquea>[] = [
    {
      clave: 'mesa',
      titulo: voc.titulo('unidad_servicio'),
      celda: (mesa) => <span className="font-semibold">{mesa.rotulo}</span>,
    },
    { clave: 'mesero', titulo: voc.titulo('responsable'), celda: (mesa) => mesa.mesero },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      celda: (mesa) => <Dinero centavos={mesa.total} tamano="sm" />,
    },
    { clave: 'tiempo', titulo: 'Tiempo', celda: (mesa) => mesa.abierta },
  ];
  const conCuentaViva = `${voc.plural('unidad_servicio')} con ${voc.singular('orden')} abiert${voc.terminacion('orden')}`;

  /** Primera verificación: al abrir el diálogo. */
  async function pedirCierre(): Promise<void> {
    setError(null);
    setReleyendo(true);
    try {
      const frescos = await leerElDia(new AbortController().signal);
      setDatos(frescos);
      const abiertas = mesasQueBloquean(frescos, Date.now());
      const paso = abiertas.length === 0 ? 'confirmar' : 'bloqueo';
      setDialogo(
        paso === 'confirmar' ? { tipo: 'confirmar' } : { tipo: 'bloqueo', mesas: abiertas },
      );
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo releer el salón.'));
    } finally {
      setReleyendo(false);
    }
  }

  /**
   * Segunda verificación, y sólo entonces la escritura. Entre el diálogo y este
   * clic pasan los minutos de contar el cajón, y en esos minutos se sienta una
   * mesa que nadie ha vuelto a mirar.
   */
  async function cerrar(contadoCentavos: number): Promise<void> {
    setEnviando(true);
    try {
      const frescos = await leerElDia(new AbortController().signal);
      setDatos(frescos);
      const abiertas = mesasQueBloquean(frescos, Date.now());
      if (abiertas.length > 0) {
        setDialogo({ tipo: 'bloqueo', mesas: abiertas });
        return;
      }
      // Un NÚMERO, no su texto: `caja.cerrar` valida `efectivoContadoCentavos` como entero y
      // rechazaba el `String(…)` que iba aquí, así que este botón no cerraba nunca (C.6 de
      // la 2.4; el e2e cerraba por la API y no lo veía). Y el fondo que se deja es un campo.
      const hecho = await invocarComando<ResultadoDelCierre>('/api/caja/cerrar', {
        efectivoContadoCentavos: contadoCentavos,
        fondoDejadoCentavos: dejado,
      });
      setDialogo(null);
      setCorte(hecho);
    } catch (fallo) {
      setDialogo(null);
      setError(mensajeDe(fallo, 'No se pudo cerrar la caja.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid items-start gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_24rem]">
      <h1 className="text-xl font-bold xl:col-span-2">Cierre diario y arqueo</h1>

      {/* 4 · CONTEO — primero en el DOM porque encabeza la jerarquía y se lleva
          el foco. Fijo arriba en teléfono y tablet —con tope de alto, para que
          nunca tape el corte entero— y carril derecho pegajoso en PC. */}
      <Superficie
        como="section"
        nivel={2}
        aria-labelledby="titulo-conteo"
        className="sticky top-0 z-20 flex max-h-[65dvh] flex-col gap-(--espacio-3) overflow-y-auto xl:top-(--espacio-4) xl:col-start-2 xl:row-start-2 xl:max-h-none xl:overflow-visible"
      >
        <h2 id="titulo-conteo" className="text-sm font-semibold tracking-wide uppercase">
          <span className="font-numeros text-texto-sutil tabular-nums">4 ·</span> Conteo de efectivo
          y fondo
        </h2>
        <div className="grid gap-(--espacio-3) sm:grid-cols-2 xl:grid-cols-1">
          <div className="flex flex-col gap-(--espacio-1) sm:col-span-2 xl:col-span-1">
            <Label htmlFor="contado">Efectivo contado físicamente *</Label>
            {/* El campo que manda: el más grande de la pantalla, porque es lo
                único que aquí se TECLEA y se teclea contando billetes. `enorme`
                (text-2xl) y no `grande` (text-lg): las cifras del resumen van en
                text-xl, y lo que se relee antes de sellar no puede quedar debajo. */}
            <CampoDeDinero
              id="contado"
              autoFocus
              placeholder="0.00"
              aria-describedby="ayuda-contado"
              centavos={contado}
              alCambiar={setContado}
              tamano="enorme"
            />
            <p id="ayuda-contado" className="text-xs text-texto-sutil">
              Cuenta el cajón antes de mirar nada más: el esperado aparece cuando escribas, para que
              el arqueo siga siendo un control y no un número que se copia.
            </p>
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="fondo">Dinero dejado en caja (fondo)</Label>
            <CampoDeDinero id="fondo" placeholder="0.00" centavos={fondo} alCambiar={setFondo} />
          </div>
        </div>

        {cuenta !== null && (
          <Superficie
            role="status"
            nivel={0}
            radio="md"
            relleno={3}
            className={`flex flex-col gap-(--espacio-2) ${TINTE_DEL_TONO[semaforo.tono]}`}
          >
            <p className="flex items-center gap-(--espacio-2) text-sm font-semibold">
              <IconoDelTono tono={semaforo.tono} />
              {semaforo.texto}
            </p>
            <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-(--espacio-3) gap-y-(--espacio-1) text-sm">
              <dt className="text-texto-sutil">Esperado</dt>
              <dd className="text-right">
                <Dinero centavos={esperado} tamano="sm" />
              </dd>
              <dt className="text-texto-sutil">Diferencia</dt>
              <dd className="text-right">
                <Dinero centavos={cuenta - esperado} tamano="lg" className="font-bold" />
              </dd>
              <dt className="text-texto-sutil">A entregar hoy</dt>
              <dd className="text-right">
                <Dinero centavos={Math.max(cuenta - dejado, 0)} tamano="sm" />
              </dd>
            </dl>
          </Superficie>
        )}

        {avisoDeFallo}

        <div className="flex items-center gap-(--espacio-2)">
          <Switch id="imprimir" checked={alImprimir} onCheckedChange={setAlImprimir} />
          <Label htmlFor="imprimir" className="font-normal">
            Descargar el PDF del cierre al terminar
          </Label>
        </div>
        <Button
          size="lg"
          className="h-[calc(var(--altura-control)*1.5)] w-full text-lg"
          disabled={enviando || cuenta === null}
          cargando={releyendo}
          onClick={() => {
            void pedirCierre();
          }}
        >
          CERRAR CAJA
        </Button>
        {cuenta === null && (
          <p className="text-center text-sm text-texto-sutil">
            Escribe primero el efectivo contado.
          </p>
        )}
      </Superficie>

      {/* 1 · 2 · 3 en el orden del PDF. */}
      <div className="flex flex-col gap-(--espacio-4) xl:col-start-1 xl:row-start-2">
        <SeccionDelCorte numero={1} titulo="Resumen financiero (sin propinas)">
          <dl className="grid grid-cols-2 gap-(--espacio-4) md:grid-cols-4">
            <Indicador rotulo="Ventas reales">
              <Dinero centavos={resumen.ventas} tamano="lg" />
            </Indicador>
            <Indicador rotulo="Tickets">
              <Cifra valor={resumen.tickets} tamano="lg" />
            </Indicador>
            <Indicador rotulo="Ticket promedio">
              <Dinero centavos={resumen.promedio} tamano="lg" />
            </Indicador>
            <Indicador rotulo="Costo de ventas">
              <Dinero centavos={resumen.costo} tamano="lg" />
            </Indicador>
            <Indicador rotulo="Utilidad bruta">
              <Dinero centavos={resumen.utilidad} tamano="lg" />
            </Indicador>
            <Indicador rotulo="Margen promedio">
              <Cifra valor={resumen.margen / 100} decimales={2} unidad="%" tamano="lg" />
            </Indicador>
            <Indicador rotulo="Gastos operativos">
              <Dinero centavos={resumen.gastos} tamano="lg" />
            </Indicador>
            <Indicador rotulo="Utilidad neta est.">
              <Dinero centavos={resumen.neta} tamano="lg" />
            </Indicador>
          </dl>
        </SeccionDelCorte>

        <SeccionDelCorte numero={2} titulo="Propinas del día (pendientes de liquidar)">
          <dl className="grid grid-cols-2 gap-(--espacio-4) md:grid-cols-4">
            <Indicador rotulo="Total">
              <Dinero centavos={totalDePropinas} tamano="lg" />
            </Indicador>
            <Indicador rotulo={NOMBRE_DEL_CANAL.efectivo}>
              <Dinero centavos={resumen.propinas.efectivo} tamano="lg" />
            </Indicador>
            <Indicador rotulo={NOMBRE_DEL_CANAL.tarjeta}>
              <Dinero centavos={resumen.propinas.tarjeta} tamano="lg" />
            </Indicador>
            <Indicador rotulo={NOMBRE_DEL_CANAL.transferencia}>
              <Dinero centavos={resumen.propinas.transferencia} tamano="lg" />
            </Indicador>
          </dl>
          <p className="mt-(--espacio-3) text-xs text-texto-sutil">
            No entran en la utilidad: son dinero de {voc.enFrase('responsable', true)} que pasó por
            la caja.
          </p>
        </SeccionDelCorte>

        <SeccionDelCorte numero={3} titulo="Métodos de pago (ventas + propinas)">
          <Tabla
            etiqueta="Métodos de pago"
            columnas={columnasDeCanal}
            filas={filasDeCanal}
            claveDe={(fila) => fila.canal}
            alto="max-h-none"
            pie={{
              metodo: 'Total',
              ventas: <Dinero centavos={ventasPorCanal} tamano="sm" />,
              propinas: <Dinero centavos={totalDePropinas} tamano="sm" />,
              total: <Dinero centavos={ventasPorCanal + totalDePropinas} tamano="sm" />,
            }}
          />
        </SeccionDelCorte>
      </div>

      <Dialog
        open={dialogo !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setDialogo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogo?.tipo === 'bloqueo' ? `Hay ${conCuentaViva}` : '¿Cerrar la caja?'}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === 'bloqueo'
                ? `Cobra o cancela ${voc.enFraseCon('este', 'orden', true)} antes de cerrar: si la caja se cierra ahora, esas ventas quedan fuera del corte y ya no las cuadra nadie.`
                : 'El corte se sella y no se puede editar. El salón se vuelve a revisar justo antes de ejecutar.'}
            </DialogDescription>
          </DialogHeader>
          {dialogo?.tipo === 'bloqueo' && (
            <Tabla
              etiqueta={conCuentaViva}
              columnas={columnasDeMesa}
              filas={dialogo.mesas}
              claveDe={(mesa) => mesa.id}
              alto="max-h-[50vh]"
            />
          )}
          {/* Lo que se va a sellar, tal como se tecleó: un cero de más en el
              conteo se ve aquí, no en el corte impreso. */}
          {dialogo?.tipo === 'confirmar' && cuenta !== null && (
            <dl className="grid grid-cols-2 gap-(--espacio-4)">
              <Indicador rotulo="Efectivo contado">
                <Dinero centavos={cuenta} tamano="lg" />
              </Indicador>
              <Indicador rotulo="Dinero dejado en caja">
                <Dinero centavos={dejado} tamano="lg" />
              </Indicador>
            </dl>
          )}
          <DialogFooter>
            {dialogo?.tipo === 'bloqueo' ? (
              <Button asChild>
                <a href="/restaurante/mapa-de-mesas">
                  Ver el mapa de {voc.plural('unidad_servicio')}
                </a>
              </Button>
            ) : (
              <Button
                disabled={enviando || cuenta === null}
                cargando={enviando}
                onClick={() => {
                  if (cuenta !== null) void cerrar(cuenta);
                }}
              >
                {enviando ? 'Cerrando…' : 'Sí, cerrar el día'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
