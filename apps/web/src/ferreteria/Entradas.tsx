'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  dineroEnTexto,
  textoParaCampo,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ArrowRight,
  Check,
  ClipboardList,
  Copy,
  History,
  PackageOpen,
  Phone,
  Send,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { KardexDelProducto } from '~/abarrotes/KardexDelProducto';
import { ErrorApi, consultarPuente, invocarComando, subirImagen } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import { ContraElPedido } from './ContraElPedido.tsx';
import { importeDe, pesosDe } from './entrada-del-archivo.ts';
import { ImportarLaNota, type NotaDelArchivo } from './ImportarLaNota.tsx';

/**
 * PANTALLA · ferreteria · entradas
 *
 * Recepción y pedido. De dos a cinco veces por semana, encargado o almacén,
 * ritmo EPISÓDICO: aquí cabe la calma y cabe un archivo de doscientas líneas.
 *
 * ── Lo primero que se ve no es la captura: es lo que viene en camino ──────
 * La acción principal es RECIBIR NOTA, pero la pregunta que trae al encargado
 * a esta pantalla es «¿qué viene en camino y qué tengo que pedir?». Si lo que
 * ya viene no se ve antes de pedir, se pide dos veces lo mismo. Por eso la franja
 * de la derecha —arriba del todo en el teléfono— abre con CUÁNDO llega el
 * proveedor, en grande, y debajo el pedido sugerido.
 *
 * ── Y «en camino» es la RUTA DEL PROVEEDOR, no un pedido en tránsito ──────
 * Esta franja leía una entidad del puente, `PedidoProveedor`, **que no existe**:
 * el sistema no lleva pedidos a proveedor —no hay tabla, ni comando que los cree—
 * y el puente contestaba `PUENTE_ENTIDAD_DESCONOCIDA`, así que la franja nacía
 * vacía con una banda de error encima.
 *
 * Lo que el sistema SÍ sabe, y es la respuesta útil a la misma pregunta, es
 * cuándo pasa el proveedor: `proveedores.dia_visita` («Bimbo viene martes y
 * viernes») y de ahí los días de cobertura que la sugerencia ya calcula. La
 * franja dice quién llega, en cuántos días, y qué cuesta lo que habría que
 * pedirle. Prometer un tránsito que nadie registra sería peor que no prometerlo.
 *
 * ── El archivo es el camino 1 y el manual el 3 ────────────────────────────
 * Doscientas líneas a mano son dos horas mal invertidas y mal capturadas. El
 * archivo —el CSV del proveedor— se LEE en el navegador y viaja como renglones a
 * `compras.importar_nota`, que empareja y PROPONE (`ImportarLaNota`): lo que casó
 * entra como partida —lo que casó por NOMBRE, marcado para revisarlo—, lo que no
 * queda «sin emparejar» y se resuelve con el alta, que ahora SÍ lo mete a la
 * entrada. El camino 3 es el proveedor chico de diez renglones, contra el catálogo
 * para que no nazcan diez claves duplicadas, con Enter para el siguiente.
 *
 * ── El camino 2: lo pedido contra lo que llegó ────────────────────────────
 * Lo que se le pidió —la sugerencia de hoy— contra lo que se va capturando, con lo
 * que NO llegó primero (`ContraElPedido`): se le reclama al repartidor antes de
 * firmarle.
 *
 * ── «Sin emparejar» va arriba del total, no en un reporte ─────────────────
 * Porque una línea sin emparejar QUEDA FUERA de la entrada. El botón de
 * guardar dice cuántas se van a perder ANTES de perderlas, y el resumen de la
 * nota pone las tres cifras —líneas, emparejadas, sin emparejar— al mismo tamaño:
 * «de 198 quedan 12» es lo que decide si la entrada se captura hoy. Y el aviso de
 * costo trae el precio de venta sugerido porque en cable y cobre, sin ese aviso,
 * el mostrador vende a pérdida toda la semana sin enterarse.
 *
 * ── Por qué el pedido sugerido lleva la columna DORMIDO ───────────────────
 * Porque es el único momento en que el dinero parado puede cambiar la
 * decisión: ver «$18,400 en brocas ya paradas» justo cuando el vendedor trae
 * promoción de brocas es lo que detiene la compra. En un reporte de fin de mes
 * ese mismo dato no cambia nada. Por eso esas líneas se ordenan primero, van
 * con el tono de advertencia Y con su icono, y por eso los dos importes los
 * calcula el SERVIDOR: `compras.sugerir_pedido` los devuelve con el costo de la
 * unidad base, y no el navegador multiplicando.
 *
 * ── Teléfono: recepción rápida con foto, y nada más ───────────────────────
 * Existe para el proveedor chico que llega con diez líneas. Las doscientas NO
 * se capturan en teléfono, así que ese bloque ni siquiera se ofrece ahí:
 * ofrecerlo sería prometer algo que acaba en una captura a medias.
 *
 * ── El alta es la RÁPIDA, a propósito, y el kardex está a un toque ────────
 * El alta de un renglón sin emparejar es la rápida (`compras.alta_material`): con
 * el repartidor esperando nadie contesta ocho campos, y el material nace marcado
 * como incompleto —categoría, precio— en la lista de pendientes del catálogo, que es
 * donde se completa. Aquí se da de alta Y entra a la nota con su cantidad y su
 * costo. Cada partida abre su kardex, para ver qué entró y qué salió antes de firmar.
 *
 * ── La foto del teléfono ──────────────────────────────────────────────────
 * Se sube (sólo quien administra puede subir archivos) y viaja con la entrada: queda
 * en las notas de la compra, para conciliar el papel cuando el proveedor reclame.
 */

/** Debería venir del proveedor; mientras ese campo no exista, vive aquí. */
const MINIMO_PEDIDO_CENTAVOS = 2_500_000;

/** Desde aquí, el dinero dormido de una línea merece frenar un pedido. */
const UMBRAL_DORMIDO_CENTAVOS = 500_000;

const CLAVE_GUARDAR = 'guardar';

/** La página y su rejilla: en PC, la captura a la izquierda y la franja de 26 rem. */
const PAGINA = 'flex flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-4)';
const REJILLA = 'grid gap-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start';
const ROTULO = 'text-xs font-semibold tracking-wide text-texto-sutil uppercase';

/** Los tres caminos, en el orden en que resuelven el problema. */
const CAMINOS = [
  {
    clave: 'archivo',
    numero: 1,
    etiqueta: 'Importar archivo',
    ayuda: '198 líneas en un minuto',
  },
  {
    clave: 'pedido',
    numero: 2,
    etiqueta: 'Escanear contra pedido',
    ayuda: 'Enseña lo que no llegó',
  },
  { clave: 'manual', numero: 3, etiqueta: 'Manual', ayuda: 'Para diez líneas o menos' },
] as const;

type Camino = (typeof CAMINOS)[number]['clave'];

export interface LineaSinEmparejar {
  readonly id: string;
  readonly codigoProveedor: string;
  readonly descripcion: string;
  /** Lo que traía la hoja: con esto, el alta mete el renglón a la entrada. */
  readonly cantidad?: string;
  readonly costoUnitarioCentavos?: number;
}

export interface SubidaDeCosto {
  readonly id: string;
  readonly material: string;
  readonly costoAnteriorCentavos: number;
  readonly costoNuevoCentavos: number;
  readonly precioHoyCentavos: number;
  readonly precioSugeridoCentavos: number;
}

/** Una partida de la nota, ya atada a un material del catálogo. */
export interface PartidaCapturada {
  /** Única en la nota: el mismo material puede venir en dos renglones. */
  readonly clave: string;
  readonly insumoId: string;
  readonly nombre: string;
  /** Lo que se teclea: «3» cajas, «12.5» metros. Texto: convierte el servidor. */
  readonly cantidad: string;
  readonly unidad: string;
  /** Cuántas unidades base trae UNA unidad de compra. Texto, por lo mismo. */
  readonly equivalencia: string;
  /** Lo que costó el renglón COMPLETO, en pesos y como texto. */
  readonly costoTotal: string;
  /** Casó POR NOMBRE al importar: el único camino que se equivoca. Se revisa. */
  readonly porNombre?: boolean;
  /** Lo que decía la hoja del proveedor, para revisar lo que casó por nombre. */
  readonly delProveedor?: string | null;
  /** La clave de SU hoja: se guarda con la línea y empareja sola la nota siguiente. */
  readonly claveProveedor?: string | null;
}

export interface NotaEnCaptura {
  readonly archivo: string | null;
  readonly lineas: number;
  readonly sinEmparejar: readonly LineaSinEmparejar[];
  readonly subidas: readonly SubidaDeCosto[];
  readonly partidas: readonly PartidaCapturada[];
  readonly totalCentavos: number;
  readonly vence: string | null;
}

/** Un proveedor del catálogo, con lo que hace falta para recibirle. */
export interface ProveedorDeEntrada {
  readonly id: string;
  readonly nombre: string;
  readonly dias_credito: number;
}

/** Un material de ESTE proveedor, para capturar su renglón sin duplicar claves. */
export interface MaterialDeProveedor {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  readonly unidad_compra_default: string | null;
  readonly cantidad_por_compra_default: number | null;
}

/** Quién llega y cuándo. Es lo que el sistema sabe de «en camino». */
export interface RutaDelProveedor {
  readonly proveedor: string;
  /** `null` cuando no tiene ruta: a ése se le llama por teléfono. */
  readonly diasHastaLaVisita: number | null;
  readonly diasDeCobertura: number;
}

export interface LineaSugerida {
  readonly id: string;
  readonly material: string;
  readonly hay: number;
  readonly vendido90d: number;
  /** Ya con su unidad: «4 rollos», «1 caja». El cero se marca aparte. */
  readonly sugerido: string;
  readonly importeCentavos: number;
  readonly dormidoCentavos: number;
  readonly linea: string;
  /** Cuántas presentaciones se sugieren: lo que se compara contra lo que llegó. */
  readonly presentaciones?: number;
}

/** Lo que contesta `compras.sugerir_pedido`, tal cual. */
interface RespuestaSugerencia {
  readonly proveedor: string;
  readonly diasHastaLaVisita: number | null;
  readonly diasDeCobertura: number;
  readonly renglones: readonly {
    readonly insumoId: string;
    readonly nombre: string;
    readonly existenciaBase: string;
    readonly ventaDelPeriodoBase: string;
    readonly presentacionesSugeridas: number;
    readonly unidadCompra: string;
    readonly importeCentavos: string;
    readonly dormidoCentavos: string;
    readonly alerta: string;
  }[];
}

export interface EntradasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly proveedoresIniciales?: readonly ProveedorDeEntrada[];
  readonly filasIniciales?: readonly LineaSugerida[];
  readonly notaInicial?: NotaEnCaptura;
  readonly rutaInicial?: RutaDelProveedor;
}

/** El código estable de la API, traducido a la frase que sirve en el almacén. */
export function mensajeDe(fallo: unknown): string {
  if (!(fallo instanceof ErrorApi)) {
    return fallo instanceof Error ? fallo.message : 'No se pudo hablar con el servidor.';
  }
  // El límite de intentos no es un código: es el 429, y vive en `estado`.
  if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera y vuelve a intentar.';
  switch (fallo.error.codigo) {
    case 'IDEMPOTENCIA_CONFLICTO':
    case 'COMANDO_EN_CURSO':
      return 'Esa entrada ya se está guardando. No la mandes dos veces.';
    case 'CONFLICTO_ESTADO':
      return 'La nota cambió mientras la capturabas. Vuelve a abrirla antes de guardar.';
    case 'SIN_PERMISO':
    case 'PAQUETE_NO_INCLUYE':
      return 'Tu usuario no puede recibir notas. Pídeselo al encargado.';
    default:
      return fallo.error.mensaje;
  }
}

/** ¿Este dinero dormido merece frenar la compra? */
function frenaLaCompra(fila: LineaSugerida): boolean {
  return fila.dormidoCentavos >= UMBRAL_DORMIDO_CENTAVOS;
}

/** Primero lo que puede frenar una compra; después lo que más cuesta pedir. */
export function ordenarSugeridas(filas: readonly LineaSugerida[]): readonly LineaSugerida[] {
  const frena = (f: LineaSugerida) => (frenaLaCompra(f) ? 1 : 0);
  return [...filas].sort((a, b) => frena(b) - frena(a) || b.importeCentavos - a.importeCentavos);
}

/** `'40.0000'` → `40`. Para enseñar, no para calcular. */
function comoNumero(texto: string): number {
  const valor = Number.parseFloat(texto);
  return Number.isFinite(valor) ? valor : 0;
}

/** Cuántos decimales enseñar: los que trae, hasta cuatro. «12.5 m» no es «13 m». */
function decimalesDe(valor: number): number {
  if (Number.isInteger(valor)) return 0;
  const [, fraccion = ''] = String(valor).split('.');
  return Math.min(4, fraccion.length);
}

/** Cuánto subió el costo, en porcentaje. Sin costo anterior no hay contra qué medir. */
function alzaDe(subida: SubidaDeCosto): number | null {
  if (subida.costoAnteriorCentavos <= 0) return null;
  const diferencia = subida.costoNuevoCentavos - subida.costoAnteriorCentavos;
  return (diferencia / subida.costoAnteriorCentavos) * 100;
}

/** El renglón del servidor, con la forma que esta pantalla pinta. */
function comoLinea(renglon: RespuestaSugerencia['renglones'][number]): LineaSugerida {
  return {
    id: renglon.insumoId,
    material: renglon.nombre,
    hay: comoNumero(renglon.existenciaBase),
    vendido90d: comoNumero(renglon.ventaDelPeriodoBase),
    sugerido: `${String(renglon.presentacionesSugeridas)} ${renglon.unidadCompra}`,
    presentaciones: renglon.presentacionesSugeridas,
    importeCentavos: Number(renglon.importeCentavos),
    dormidoCentavos: Number(renglon.dormidoCentavos),
    linea: renglon.nombre,
  };
}

/** Cuándo llega, en palabras. «Hoy» y «mañana» se leen de un golpe. */
function cuandoLlega(dias: number | null): string {
  if (dias === null) return 'sin ruta · se le llama';
  if (dias === 0) return 'llega hoy';
  if (dias === 1) return 'llega mañana';
  return `llega en ${String(dias)} días`;
}

/**
 * Las columnas del pedido sugerido. TRES y no cinco: en PC viven en la franja de
 * 26 rem, y «hay» y «vendido» se leen como el renglón chico del material —que es
 * como se leen: dos datos de contexto, no dos columnas que comparar—.
 */
function columnasDelPedido(nombreDeMaterial: string): readonly ColumnaDeTabla<LineaSugerida>[] {
  return [
    {
      clave: 'material',
      titulo: nombreDeMaterial,
      celda: (f) => (
        <span className="flex flex-col">
          <span className="font-medium">{f.material}</span>
          <span className="text-xs text-texto-sutil">
            Hay <Cifra valor={f.hay} decimales={decimalesDe(f.hay)} tamano="xs" /> · vendido{' '}
            <Cifra valor={f.vendido90d} decimales={decimalesDe(f.vendido90d)} tamano="xs" />
          </span>
        </span>
      ),
    },
    {
      clave: 'sugerido',
      titulo: 'Sugerido',
      // El cero va en negritas: «no le pidas» también es una sugerencia.
      celda: (f) =>
        f.importeCentavos === 0 ? (
          <span className="font-numeros text-base font-bold">0</span>
        ) : (
          <span className="font-semibold whitespace-nowrap">{f.sugerido}</span>
        ),
    },
    {
      clave: 'dormido',
      titulo: 'Dormido en la línea',
      numerica: true,
      // El color no es el único portador: la línea que frena lleva su icono.
      celda: (f) => (
        <span
          className={`inline-flex flex-col items-end ${frenaLaCompra(f) ? 'font-semibold text-peligro' : 'text-texto-sutil'}`}
        >
          <span className="inline-flex items-center gap-(--espacio-1)">
            {frenaLaCompra(f) ? <TriangleAlert aria-hidden="true" className="size-4" /> : null}
            <Dinero centavos={f.dormidoCentavos} tamano="sm" />
          </span>
          {f.linea === f.material ? null : (
            <span className="text-xs font-normal">en {f.linea}</span>
          )}
        </span>
      ),
    },
  ];
}

/** Lo primero que se ve: quién llega y cuándo, para no volver a pedirle lo que trae. */
function EnCamino({
  ruta,
  porPedir,
  estimado,
}: {
  readonly ruta: RutaDelProveedor | null;
  readonly porPedir: number;
  readonly estimado: number;
}) {
  const voc = useVocabulario();
  const sinRuta = ruta?.diasHastaLaVisita === null;
  return (
    <Superficie
      como="section"
      aria-label="Ruta del proveedor"
      className="flex flex-col gap-(--espacio-3) xl:col-start-2"
    >
      <h2 className={ROTULO}>En camino</h2>
      {ruta === null ? (
        <p className="text-sm text-texto-sutil">
          Elige un proveedor y aquí sale cuándo pasa y qué conviene pedirle.
        </p>
      ) : (
        <>
          <p className="flex items-center gap-(--espacio-3)">
            {sinRuta ? (
              <Phone aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
            ) : (
              <Truck aria-hidden="true" className="size-5 shrink-0 text-primario" />
            )}
            <span className="flex flex-col">
              <span className="text-2xl leading-tight font-bold first-letter:uppercase">
                {cuandoLlega(ruta.diasHastaLaVisita)}
              </span>
              <span className="text-sm text-texto-sutil">{ruta.proveedor}</span>
            </span>
          </p>
          <p className="text-sm text-texto-sutil">
            Se pide para <Cifra valor={ruta.diasDeCobertura} unidad="días" tamano="sm" /> ·{' '}
            <Cifra valor={porPedir} tamano="sm" /> {voc.plural('producto')} por pedir ·{' '}
            <Dinero centavos={estimado} tamano="sm" />
          </p>
          {/* Lo que el sistema NO sabe, dicho aquí y no fingido. */}
          <p className="border-t border-borde pt-(--espacio-2) text-xs text-texto-sutil">
            El sistema no lleva pedidos en tránsito: lo que se ve es la ruta del proveedor y lo que
            habría que pedirle hoy.
          </p>
        </>
      )}
    </Superficie>
  );
}

/** Lo que conviene pedir, con el dinero dormido al lado para frenar lo que sobra. */
function PedidoSugerido({
  proveedor,
  filas,
  estimado,
  aviso,
  alCopiar,
  alMandar,
}: {
  readonly proveedor: string | null;
  readonly filas: readonly LineaSugerida[];
  readonly estimado: number;
  readonly aviso: string | null;
  readonly alCopiar: () => void;
  readonly alMandar: () => void;
}) {
  const voc = useVocabulario();
  const columnas = useMemo(() => columnasDelPedido(voc.titulo('producto')), [voc]);
  const faltante = Math.max(0, MINIMO_PEDIDO_CENTAVOS - estimado);
  return (
    <Superficie
      como="section"
      aria-label="Pedido sugerido"
      className="flex flex-col gap-(--espacio-3) xl:col-start-2"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
        <h2 className={ROTULO}>Pedido sugerido · {proveedor ?? '—'}</h2>
        <p className="text-xs text-texto-sutil">
          mínimo <Dinero centavos={MINIMO_PEDIDO_CENTAVOS} tamano="xs" />
        </p>
      </header>

      <Tabla
        etiqueta="Pedido sugerido"
        columnas={columnas}
        filas={filas}
        claveDe={(f) => f.id}
        tonoDeFila={(f) => (frenaLaCompra(f) ? 'advertencia' : undefined)}
        alto="max-h-[50vh]"
        vacio={
          <Vacio
            icono={<ClipboardList />}
            titulo="Sin sugerencias"
            explicacion={`Se arman con la venta de los últimos días y el mínimo de cada ${voc.singular('producto')}. Recibe un par de notas y esta lista empieza a decir qué pedir y qué no.`}
            className="px-(--espacio-3) py-(--espacio-6)"
          />
        }
      />

      <div className="flex flex-wrap items-baseline justify-between gap-(--espacio-2) border-t border-borde pt-(--espacio-3)">
        <p className="flex items-baseline gap-(--espacio-2)">
          <span className="text-sm text-texto-sutil">Estimado</span>
          <Dinero centavos={estimado} tamano="lg" />
        </p>
        <p className="text-sm text-texto-sutil">
          {faltante === 0 ? (
            <span className="inline-flex items-center gap-(--espacio-1) font-medium text-texto">
              <Check aria-hidden="true" className="size-4 text-exito" />
              llega al mínimo del proveedor
            </span>
          ) : (
            <>
              faltan <Dinero centavos={faltante} tamano="sm" /> para el mínimo
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-(--espacio-2)">
        <Button type="button" variant="outline" disabled={filas.length === 0} onClick={alCopiar}>
          <Copy aria-hidden="true" />
          Copiar
        </Button>
        <Button type="button" variant="secondary" disabled={filas.length === 0} onClick={alMandar}>
          <Send aria-hidden="true" />
          Mandar por WhatsApp
        </Button>
      </div>
      {aviso !== null && (
        <p role="status" className="text-xs text-texto-sutil">
          {aviso}
        </p>
      )}
    </Superficie>
  );
}

export function Entradas({
  proveedoresIniciales,
  filasIniciales,
  notaInicial,
  rutaInicial,
}: EntradasProps) {
  const voc = useVocabulario();
  const sembrada = proveedoresIniciales !== undefined || filasIniciales !== undefined;
  const [proveedores, setProveedores] = useState<readonly ProveedorDeEntrada[] | null>(
    sembrada ? (proveedoresIniciales ?? []) : null,
  );
  /** La lectura de los proveedores que no llegó. Sin ellos no hay a quién recibirle. */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [materiales, setMateriales] = useState<readonly MaterialDeProveedor[]>([]);
  const [ruta, setRuta] = useState<RutaDelProveedor | null>(rutaInicial ?? null);
  const [sugeridas, setSugeridas] = useState<readonly LineaSugerida[]>(filasIniciales ?? []);
  const [nota, setNota] = useState<NotaEnCaptura | null>(notaInicial ?? null);
  /** Lo que se dice después de copiar o de abrir WhatsApp. Sin esto, tocar no se ve. */
  const [avisoDelPedido, setAvisoDelPedido] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState(proveedoresIniciales?.[0]?.id ?? '');
  const [folio, setFolio] = useState('');
  const [aCredito, setACredito] = useState(true);
  const [dias, setDias] = useState('30');
  const [camino, setCamino] = useState<Camino>('archivo');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // La captura manual, un renglón a la vez. El costo, en CENTAVOS desde el campo.
  const [material, setMaterial] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costoCentavos, setCostoCentavos] = useState<number | null>(null);
  /** Lo que se dijo del archivo: cuántos renglones y qué filas no se pudieron leer. */
  const [avisoDelArchivo, setAvisoDelArchivo] = useState<string | null>(null);
  /** La foto de la nota en papel, ya subida: viaja con la entrada. */
  const [fotoDeLaNota, setFotoDeLaNota] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  /** De qué partida se está viendo el kardex. */
  const [kardexDe, setKardexDe] = useState<{
    readonly insumoId: string;
    readonly nombre: string;
  } | null>(null);

  // ── Los proveedores del catálogo, que es de donde sale todo lo demás ─────
  useEffect(() => {
    if (sembrada) return;
    const control = new AbortController();
    consultarPuente<ProveedorDeEntrada>('Proveedor', { limite: 50, signal: control.signal })
      .then((lista) => {
        if (control.signal.aborted) return;
        setProveedores(lista);
        setProveedorId((actual) => (actual === '' ? (lista[0]?.id ?? '') : actual));
      })
      // Sin proveedores no hay nada que capturar —ni a quién, ni qué pedirle—, y a
      // estas alturas todavía no se capturó nada que perder: es un error de pantalla,
      // con su reintento. Los fallos de DESPUÉS, con la nota a medias, son un aviso
      // y la captura se queda en pantalla.
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        setFalloDeCarga(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [sembrada, intento]);

  // ── Del proveedor elegido: su ruta, su sugerencia y sus materiales ───────
  useEffect(() => {
    if (proveedorId === '' || filasIniciales !== undefined) return;
    const control = new AbortController();
    void (async () => {
      try {
        const [sugerencia, delProveedor] = await Promise.all([
          invocarComando<RespuestaSugerencia>('/api/compras/sugerencia', { proveedorId }),
          consultarPuente<MaterialDeProveedor>('Ingrediente', {
            filtro: { proveedor_default_id: proveedorId },
            limite: 200,
            signal: control.signal,
          }),
        ]);
        if (control.signal.aborted) return;
        setRuta({
          proveedor: sugerencia.proveedor,
          diasHastaLaVisita: sugerencia.diasHastaLaVisita,
          diasDeCobertura: sugerencia.diasDeCobertura,
        });
        setSugeridas(sugerencia.renglones.map(comoLinea));
        setMateriales(delProveedor);
      } catch (fallo: unknown) {
        if (control.signal.aborted) return;
        setError(mensajeDe(fallo));
      }
    })();
    return () => {
      control.abort();
    };
  }, [proveedorId, filasIniciales]);

  const proveedor = useMemo(
    () => (proveedores ?? []).find((p) => p.id === proveedorId) ?? null,
    [proveedores, proveedorId],
  );
  const ordenadas = useMemo(() => ordenarSugeridas(sugeridas), [sugeridas]);
  const estimado = ordenadas.reduce((suma, f) => suma + f.importeCentavos, 0);
  const pendientes = nota?.sinEmparejar.length ?? 0;
  const partidas = nota?.partidas ?? [];

  /**
   * EL PEDIDO EN TEXTO · lo que se copia y lo que se manda.
   *
   * Los dos botones de abajo tenían `disabled` y NINGÚN `onClick`: en cuanto había
   * una línea sugerida se encendían y no hacían nada. Y no es un adorno —es el
   * final del trabajo de esta pantalla: lo que se pide se pide por teléfono o por
   * WhatsApp, y lo que hace falta es el texto, no un pedido en el sistema (aquí no
   * hay tabla de pedidos a propósito: ver la cabecera).
   */
  function pedidoEnTexto(): string {
    const renglones = ordenadas.map((fila) => `${fila.sugerido} · ${fila.material}`);
    return [
      ruta === null ? 'Pedido' : `Pedido para ${ruta.proveedor}`,
      ...renglones,
      `Estimado ${dineroEnTexto(estimado)}`,
    ].join('\n');
  }

  async function copiarElPedido(): Promise<void> {
    try {
      await navigator.clipboard.writeText(pedidoEnTexto());
      setAvisoDelPedido('Pedido copiado. Pégalo donde lo vayas a mandar.');
    } catch {
      // El portapapeles lo puede negar el navegador —permiso, o pestaña sin foco—.
      // Decirlo es mejor que no hacer nada: el texto sigue en la pantalla.
      setAvisoDelPedido('El navegador no dejó copiar. Selecciona la lista y cópiala a mano.');
    }
  }

  /**
   * Abre WhatsApp con el pedido ESCRITO y sin mandar.
   *
   * La misma regla que el fiado de `abarrotes`: el sistema redacta, la persona
   * manda. Un mensaje automático a un proveedor —o a una vecina— rompe la relación
   * que sostiene el negocio, y además aquí no hay número: se elige en WhatsApp.
   */
  function mandarElPedidoPorWhatsApp(): void {
    const url = `https://wa.me/?text=${encodeURIComponent(pedidoEnTexto())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setAvisoDelPedido('WhatsApp abierto con el pedido escrito. Elige a quién y mándalo tú.');
  }

  /**
   * El documento no nombra rutas de escritura para esta pantalla, así que se
   * usa la convención `/api/<dominio>/<verbo>`. Al resolver un pendiente se
   * quita de la nota; al guardar, la nota entera se cierra.
   */
  async function ejecutar(ruta: string, clave: string, entrada: Record<string, unknown>) {
    setOcupado(clave);
    setError(null);
    try {
      await invocarComando(ruta, entrada);
      setNota((previa) =>
        clave === CLAVE_GUARDAR || previa === null
          ? null
          : {
              ...previa,
              sinEmparejar: previa.sinEmparejar.filter((l) => l.id !== clave),
              subidas: previa.subidas.filter((s) => s.id !== clave),
            },
      );
      if (clave === CLAVE_GUARDAR) {
        setFolio('');
        setFotoDeLaNota(null);
        setAvisoDelArchivo(null);
        setKardexDe(null);
      }
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setOcupado(null);
    }
  }

  function iniciar() {
    setNota({
      archivo: null,
      lineas: 0,
      sinEmparejar: [],
      subidas: [],
      partidas: [],
      totalCentavos: 0,
      vence: null,
    });
  }

  /**
   * Agrega un renglón capturado a mano, CONTRA EL CATÁLOGO.
   *
   * Contra el catálogo y no como texto libre: diez notas capturadas con el nombre
   * escrito a mano son diez claves nuevas para el mismo tornillo, y entonces el
   * inventario de la ferretería vuelve a no servir. Si el material no está, el
   * camino es el alta rápida, que esta misma pantalla ofrece.
   */
  function agregarPartida(): void {
    const buscado = material.trim().toLowerCase();
    const elegido = materiales.find((m) => m.nombre.toLowerCase() === buscado);
    if (elegido === undefined) {
      setError(
        `«${material.trim()}» no es un ${voc.singular('producto')} de este proveedor. Elígelo de ` +
          'la lista, o dalo de alta primero.',
      );
      return;
    }
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(cantidad.trim())) {
      setError('La cantidad va con hasta cuatro decimales.');
      return;
    }
    if (costoCentavos === null) {
      setError('El costo del renglón va en pesos y centavos.');
      return;
    }
    setError(null);
    const partida: PartidaCapturada = {
      clave: crypto.randomUUID(),
      insumoId: elegido.id,
      nombre: elegido.nombre,
      cantidad: cantidad.trim(),
      unidad: elegido.unidad_compra_default ?? elegido.unidad_base,
      equivalencia: String(elegido.cantidad_por_compra_default ?? 1),
      // El campo ya habla en centavos; al servidor le va el texto en pesos, que
      // es lo que pide `lineaDeCompra` y lo que él convierte.
      costoTotal: textoParaCampo(costoCentavos),
    };
    setNota((previa) => {
      const base = previa ?? {
        archivo: null,
        lineas: 0,
        sinEmparejar: [],
        subidas: [],
        partidas: [],
        totalCentavos: 0,
        vence: null,
      };
      const juntas = [...base.partidas, partida];
      return {
        ...base,
        partidas: juntas,
        lineas: juntas.length + base.sinEmparejar.length,
        // En CENTAVOS y con enteros: sumar pesos con decimales en el navegador es
        // cómo un total acaba en 1234.9999999.
        totalCentavos: juntas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
      };
    });
    setMaterial('');
    setCantidad('');
    setCostoCentavos(null);
  }

  function quitarPartida(clave: string): void {
    setNota((previa) => {
      if (previa === null) return previa;
      const juntas = previa.partidas.filter((p) => p.clave !== clave);
      return {
        ...previa,
        partidas: juntas,
        lineas: juntas.length + previa.sinEmparejar.length,
        totalCentavos: juntas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
      };
    });
  }

  /**
   * «NO ES»: lo que casó por nombre y no es ese material vuelve a «sin emparejar»,
   * donde se busca o se da de alta. Sin esto, la única salida era quitarlo y el
   * renglón se perdía de la entrada.
   */
  function noEsEse(partida: PartidaCapturada): void {
    setNota((previa) => {
      if (previa === null) return previa;
      const juntas = previa.partidas.filter((p) => p.clave !== partida.clave);
      const pendiente: LineaSinEmparejar = {
        id: partida.clave,
        codigoProveedor: partida.claveProveedor ?? '—',
        descripcion: partida.delProveedor ?? partida.nombre,
        cantidad: partida.cantidad,
        costoUnitarioCentavos: 0,
      };
      return {
        ...previa,
        partidas: juntas,
        sinEmparejar: [...previa.sinEmparejar, pendiente],
        lineas: juntas.length + previa.sinEmparejar.length + 1,
        totalCentavos: juntas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
      };
    });
  }

  /** Lo que propuso el servidor para el archivo, sumado a lo que ya había en la nota. */
  function recibirElArchivo(delArchivo: NotaDelArchivo): void {
    setError(null);
    setNota((previa) => {
      const base = previa ?? {
        archivo: null,
        lineas: 0,
        sinEmparejar: [],
        subidas: [],
        partidas: [],
        totalCentavos: 0,
        vence: null,
      };
      const partidas = [...base.partidas, ...delArchivo.partidas];
      const sinEmparejar = [...base.sinEmparejar, ...delArchivo.porResolver];
      const yaAvisadas = new Set(base.subidas.map((s) => s.id));
      return {
        ...base,
        archivo: delArchivo.archivo,
        partidas,
        sinEmparejar,
        subidas: [...base.subidas, ...delArchivo.subidas.filter((s) => !yaAvisadas.has(s.id))],
        lineas: partidas.length + sinEmparejar.length,
        totalCentavos: partidas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
      };
    });
    const porNombre = delArchivo.partidas.filter((p) => p.porNombre).length;
    setAvisoDelArchivo(
      [
        `${String(delArchivo.lineas)} renglones leídos de ${delArchivo.archivo}.`,
        porNombre > 0 ? `${String(porNombre)} casaron por nombre: revísalos.` : '',
        delArchivo.filasConProblema.length > 0
          ? `No se pudieron leer las filas ${delArchivo.filasConProblema.join(', ')}: revísalas en la hoja.`
          : '',
      ]
        .filter((texto) => texto !== '')
        .join(' '),
    );
  }

  /**
   * EL ALTA que ahora sí mete el renglón a la entrada. Antes quitaba el renglón de
   * «sin emparejar» y ya: el material nacía en el catálogo y la nota se guardaba SIN
   * él, que es justo el defecto que esta pantalla existe para cerrar.
   */
  async function darDeAlta(linea: LineaSinEmparejar): Promise<void> {
    setOcupado(linea.id);
    setError(null);
    try {
      const costo = linea.costoUnitarioCentavos ?? 0;
      const creado = await invocarComando<{ readonly insumoId: string; readonly nombre: string }>(
        '/api/entradas/alta-material',
        {
          codigoProveedor: linea.codigoProveedor,
          descripcion: linea.descripcion.slice(0, 120),
          // El costo de la hoja, si lo traía; el precio nace pendiente (ver la cabecera).
          costo: costo > 0 ? pesosDe(costo) : '',
        },
      );
      setNota((previa) => {
        if (previa === null) return previa;
        const sinEmparejar = previa.sinEmparejar.filter((l) => l.id !== linea.id);
        const partidas =
          linea.cantidad === undefined
            ? previa.partidas
            : [
                ...previa.partidas,
                {
                  clave: linea.id,
                  insumoId: creado.insumoId,
                  nombre: creado.nombre,
                  cantidad: linea.cantidad,
                  // Nace por pieza: el alta rápida no pregunta presentación.
                  unidad: 'pieza',
                  equivalencia: '1',
                  costoTotal: pesosDe(importeDe(costo, linea.cantidad)),
                  claveProveedor: linea.codigoProveedor === '—' ? null : linea.codigoProveedor,
                },
              ];
        return {
          ...previa,
          sinEmparejar,
          partidas,
          lineas: partidas.length + sinEmparejar.length,
          totalCentavos: partidas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
        };
      });
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setOcupado(null);
    }
  }

  /** La foto de la nota en papel: se sube ya, y su enlace viaja con la entrada. */
  async function subirLaFoto(archivo: File): Promise<void> {
    setSubiendoFoto(true);
    setError(null);
    try {
      setFotoDeLaNota(await subirImagen(archivo));
    } catch (fallo) {
      setFotoDeLaNota(null);
      setError(
        fallo instanceof ErrorApi && fallo.estado === 403
          ? 'Tu usuario no puede subir archivos: la foto la sube quien administra. La entrada se captura igual.'
          : mensajeDe(fallo),
      );
    } finally {
      setSubiendoFoto(false);
    }
  }

  const encabezado = (
    <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
      <h1 className="text-2xl font-bold">Entradas</h1>
      <p className="text-sm text-texto-sutil">Recepción y pedido</p>
    </header>
  );

  if (falloDeCarga !== null) {
    return (
      <div className={PAGINA}>
        {encabezado}
        <ErrorDePantalla
          className="max-w-2xl"
          titulo="No se pudieron leer los proveedores"
          queHacer="Sin ellos no se sabe a quién se le recibe ni qué conviene pedirle. Revisa la conexión y vuelve a leerlos: todavía no se había capturado nada."
          detalle={falloDeCarga}
          reintentar={
            <Button
              type="button"
              onClick={() => {
                setFalloDeCarga(null);
                setProveedores(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        />
      </div>
    );
  }

  if (proveedores === null) {
    // Esqueletos con la forma de los tres bloques, nunca un giro que gira: el
    // ojo ya sabe dónde va a mirar cuando lleguen los datos.
    return (
      <div className={PAGINA}>
        {encabezado}
        <div className={REJILLA} aria-busy="true">
          <Esqueleto className="h-36 w-full rounded-lg xl:col-start-2" />
          <Esqueleto className="h-80 w-full rounded-lg xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:h-[32rem]" />
          <EsqueletoDeLista filas={5} className="xl:col-start-2" />
        </div>
      </div>
    );
  }

  const columnasDePartidas: readonly ColumnaDeTabla<PartidaCapturada>[] = [
    {
      clave: 'material',
      titulo: voc.titulo('producto'),
      celda: (p) => (
        <span className="flex flex-col">
          <span className="font-medium">{p.nombre}</span>
          {p.porNombre === true && (
            // Lo que casó por nombre se REVISA: la hoja decía otra cosa.
            <span className="inline-flex items-center gap-(--espacio-1) text-xs text-advertencia">
              <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
              casó por nombre · la hoja dice «{p.delProveedor ?? ''}»
            </span>
          )}
        </span>
      ),
    },
    {
      clave: 'cantidad',
      titulo: 'Cantidad',
      numerica: true,
      celda: (p) => (
        <Cifra
          valor={Number(p.cantidad)}
          decimales={decimalesDe(Number(p.cantidad))}
          unidad={p.unidad}
          tamano="sm"
        />
      ),
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      celda: (p) => <Dinero centavos={aCentavos(p.costoTotal)} tamano="sm" />,
    },
    {
      clave: 'quitar',
      titulo: 'Acciones',
      celda: (p) => (
        <span className="flex justify-end gap-(--espacio-1)">
          {p.porNombre === true && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                noEsEse(p);
              }}
            >
              No es
            </Button>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Kardex de ${p.nombre}`}
            aria-pressed={kardexDe?.insumoId === p.insumoId}
            onClick={() => {
              setKardexDe((previo) =>
                previo?.insumoId === p.insumoId ? null : { insumoId: p.insumoId, nombre: p.nombre },
              );
            }}
          >
            <History aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Quitar ${p.nombre}`}
            onClick={() => {
              quitarPartida(p.clave);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </span>
      ),
    },
  ];

  const columnasSinEmparejar: readonly ColumnaDeTabla<LineaSinEmparejar>[] = [
    {
      clave: 'clave',
      titulo: 'Clave',
      celda: (l) => <span className="font-mono text-xs">{l.codigoProveedor}</span>,
    },
    { clave: 'descripcion', titulo: 'Descripción', celda: (l) => l.descripcion },
    {
      clave: 'resolver',
      titulo: 'Resolver',
      celda: (l) => (
        <span className="flex justify-end gap-(--espacio-1)">
          <Button asChild size="sm" variant="outline">
            <a href={`/ferreteria/mostrador?buscar=${encodeURIComponent(l.descripcion)}`}>
              Buscar…
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={ocupado !== null}
            cargando={ocupado === l.id}
            onClick={() => {
              // El alta RÁPIDA: nombre, clave del proveedor y el costo de la hoja. El
              // precio nace pendiente del catálogo; inventarlo aquí acaba en la etiqueta.
              void darDeAlta(l);
            }}
          >
            Alta
          </Button>
        </span>
      ),
    },
  ];

  const columnasDeSubidas: readonly ColumnaDeTabla<SubidaDeCosto>[] = [
    {
      clave: 'material',
      titulo: voc.titulo('producto'),
      celda: (s) => <span className="font-medium">{s.material}</span>,
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      celda: (s) => {
        const alza = alzaDe(s);
        return (
          <span className="inline-flex flex-col items-end">
            <span className="inline-flex items-center gap-(--espacio-1)">
              <Dinero centavos={s.costoAnteriorCentavos} tamano="xs" className="text-texto-sutil" />
              <ArrowRight aria-hidden="true" className="size-3 text-texto-sutil" />
              <span className="sr-only">a</span>
              <Dinero centavos={s.costoNuevoCentavos} tamano="sm" className="font-semibold" />
            </span>
            {alza === null ? null : (
              <span className="text-xs text-peligro">
                +<Cifra valor={alza} decimales={1} unidad="%" tamano="xs" />
              </span>
            )}
          </span>
        );
      },
    },
    {
      clave: 'venta',
      titulo: 'Venta sugerida',
      // El precio sugerido y el botón en el mismo renglón: se lee y se aplica sin
      // cruzar la tabla con la vista.
      celda: (s) => (
        <span className="flex items-center justify-between gap-(--espacio-3)">
          <span className="flex flex-col">
            <Dinero centavos={s.precioSugeridoCentavos} tamano="sm" className="font-semibold" />
            <span className="text-xs text-texto-sutil">
              hoy <Dinero centavos={s.precioHoyCentavos} tamano="xs" />
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={ocupado !== null}
            cargando={ocupado === s.id}
            onClick={() => {
              void ejecutar('/api/precios/aplicar-sugerido', s.id, {
                materialId: s.id,
                precioCentavos: s.precioSugeridoCentavos,
              });
            }}
          >
            Aplicar
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className={PAGINA}>
      {encabezado}

      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          Lo que ya estaba capturado sigue en pantalla.
        </Aviso>
      )}

      <div className={REJILLA}>
        {/* PRIMERO SE VE · quién llega, para no volver a pedirle lo que trae. */}
        <EnCamino ruta={ruta} porPedir={ordenadas.length} estimado={estimado} />

        <Superficie
          como="main"
          className="flex flex-col gap-(--espacio-4) xl:col-start-1 xl:row-span-2 xl:row-start-1"
        >
          <h2 className="text-lg font-semibold">
            Entrada <span className="font-normal text-texto-sutil">·</span>{' '}
            {proveedor?.nombre ?? 'sin proveedor'}
          </h2>

          <div className="flex flex-wrap items-end gap-(--espacio-3)">
            <div className="flex min-w-48 flex-1 flex-col gap-(--espacio-1)">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Select
                value={proveedorId}
                onValueChange={(valor) => {
                  setProveedorId(valor);
                  const elegido = proveedores.find((p) => p.id === valor);
                  // Los días los pone el proveedor: teclearlos cada vez es cómo
                  // una nota queda a 30 cuando el trato era a 15.
                  if (elegido !== undefined) setDias(String(elegido.dias_credito));
                }}
              >
                <SelectTrigger id="proveedor" className="w-full">
                  <SelectValue placeholder="Elige el proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Binario: un segmentado se lee de un golpe y no abre nada. */}
            <div role="group" aria-label="Forma de pago" className="flex gap-(--espacio-1)">
              <Button
                type="button"
                variant={aCredito ? 'default' : 'outline'}
                aria-pressed={aCredito}
                onClick={() => {
                  setACredito(true);
                }}
              >
                {aCredito ? <Check aria-hidden="true" /> : null}
                Crédito
              </Button>
              <Button
                type="button"
                variant={aCredito ? 'outline' : 'default'}
                aria-pressed={!aCredito}
                onClick={() => {
                  setACredito(false);
                }}
              >
                {aCredito ? null : <Check aria-hidden="true" />}
                Contado
              </Button>
            </div>
            {aCredito && (
              <>
                <div className="flex w-24 flex-col gap-(--espacio-1)">
                  <Label htmlFor="dias">Días</Label>
                  <Input
                    id="dias"
                    inputMode="numeric"
                    value={dias}
                    className="text-right font-numeros tabular-nums"
                    onChange={(evento) => {
                      setDias(evento.target.value);
                    }}
                  />
                </div>
                {/* A crédito el folio es OBLIGATORIO: es lo que se concilia
                    cuando el proveedor reclame, y el servidor lo exige. */}
                <div className="flex w-36 flex-col gap-(--espacio-1)">
                  <Label htmlFor="folio">Folio de la nota</Label>
                  <Input
                    id="folio"
                    value={folio}
                    className="font-numeros"
                    onChange={(evento) => {
                      setFolio(evento.target.value);
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Los tres caminos. En teléfono no se ofrecen. */}
          <ul
            aria-label="Cómo llega la nota"
            className="hidden gap-(--espacio-2) md:grid md:grid-cols-3"
          >
            {CAMINOS.map((paso) => (
              <li key={paso.clave} className="flex">
                <Superficie
                  como="button"
                  type="button"
                  interactiva
                  activa={camino === paso.clave}
                  nivel={camino === paso.clave ? 2 : 1}
                  relleno={3}
                  radio="md"
                  aria-pressed={camino === paso.clave}
                  className="flex w-full items-start gap-(--espacio-3)"
                  onClick={() => {
                    setCamino(paso.clave);
                    if (nota === null) iniciar();
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`font-numeros text-2xl leading-none font-bold ${camino === paso.clave ? 'text-primario' : 'text-texto-sutil'}`}
                  >
                    {paso.numero}
                  </span>
                  <span className="flex flex-col gap-(--espacio-1)">
                    <span className="text-sm font-semibold">{paso.etiqueta}</span>
                    <span className="text-xs text-texto-sutil">{paso.ayuda}</span>
                  </span>
                </Superficie>
              </li>
            ))}
          </ul>

          {/* El proveedor chico de diez líneas, en el pasillo. */}
          <div className="flex flex-col gap-(--espacio-1) md:hidden">
            <Label htmlFor="foto">Recepción rápida · foto de la nota</Label>
            <Input
              id="foto"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={subiendoFoto}
              aria-busy={subiendoFoto}
              onChange={(evento) => {
                const archivo = evento.target.files?.[0];
                if (archivo !== undefined) void subirLaFoto(archivo);
              }}
            />
            <p role="status" className="text-xs text-texto-sutil">
              {subiendoFoto
                ? 'Subiendo la foto…'
                : fotoDeLaNota === null
                  ? 'Hasta diez líneas. Las notas largas se capturan en la computadora.'
                  : 'Foto guardada: viaja con la entrada.'}
            </p>
          </div>

          <div className="flex flex-col gap-(--espacio-4) border-t border-borde pt-(--espacio-4)">
            {nota === null ? (
              // El VACÍO enseña qué resuelve la pantalla, y abre el camino.
              <Vacio
                icono={<PackageOpen />}
                titulo="Todavía no hay ninguna nota en captura."
                explicacion="Elige un camino y captura la nota del proveedor: el sistema empareja lo que reconoce, tú resuelves sólo lo que no, y te avisa de lo que subió de costo antes de que se venda a pérdida. Una entrada capturada el mismo día evita una semana en negativo."
                accion={
                  <Button type="button" size="lg" onClick={iniciar}>
                    Recibir nota
                  </Button>
                }
                className="py-(--espacio-8)"
              />
            ) : (
              <>
                {/* «De 198 quedan 12»: las tres cifras al mismo peso, porque la
                    tercera es la que decide si la entrada se captura hoy. */}
                <div className="flex flex-col gap-(--espacio-2)">
                  <p className="text-sm text-texto-sutil">
                    Archivo:{' '}
                    <span className="font-medium text-texto">{nota.archivo ?? 'sin cargar'}</span>
                  </p>
                  <dl className="grid grid-cols-3 gap-(--espacio-3)">
                    <div className="flex flex-col">
                      <dt className="text-xs text-texto-sutil">Líneas</dt>
                      <dd>
                        <Cifra valor={nota.lineas} tamano="lg" />
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-texto-sutil">Emparejadas</dt>
                      <dd className="inline-flex items-center gap-(--espacio-1)">
                        <Check aria-hidden="true" className="size-4 text-exito" />
                        <Cifra valor={nota.lineas - pendientes} tamano="lg" />
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-texto-sutil">Sin emparejar</dt>
                      <dd
                        className={`inline-flex items-center gap-(--espacio-1) ${pendientes > 0 ? 'font-semibold text-peligro' : ''}`}
                      >
                        {pendientes > 0 ? (
                          <TriangleAlert aria-hidden="true" className="size-4" />
                        ) : null}
                        <Cifra valor={pendientes} tamano="lg" />
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* ── El camino 1, el archivo del proveedor ───────────────── */}
                {camino === 'archivo' && (
                  <ImportarLaNota
                    proveedorId={proveedorId}
                    folio={folio}
                    alImportar={recibirElArchivo}
                    alFallar={setError}
                  />
                )}
                {avisoDelArchivo !== null && (
                  <p role="status" className="text-sm text-texto-sutil">
                    {avisoDelArchivo}
                  </p>
                )}

                {/* ── El camino 2, lo pedido contra lo que llegó ──────────── */}
                {camino === 'pedido' && (
                  <ContraElPedido
                    pedido={ordenadas.map((f) => ({
                      id: f.id,
                      material: f.material,
                      sugerido: f.sugerido,
                      presentaciones: f.presentaciones ?? (Number.parseInt(f.sugerido, 10) || 0),
                    }))}
                    llego={partidas}
                  />
                )}

                {/* ── El camino 3, capturado contra el catálogo ────────────── */}
                <section
                  aria-label={`Capturar ${voc.singular('linea_orden')}`}
                  className="flex flex-col gap-(--espacio-2)"
                >
                  <h3 className="text-sm font-semibold">Capturar {voc.singular('linea_orden')}</h3>
                  {/* Un formulario: Enter en el costo agrega y deja listo el siguiente. */}
                  <form
                    className="flex flex-wrap items-end gap-(--espacio-2)"
                    onSubmit={(evento) => {
                      evento.preventDefault();
                      agregarPartida();
                    }}
                  >
                    <div className="flex min-w-48 flex-1 flex-col gap-(--espacio-1)">
                      <Label htmlFor="material">{voc.titulo('producto')}</Label>
                      <Input
                        id="material"
                        list="materiales-del-proveedor"
                        value={material}
                        placeholder={
                          materiales.length === 0
                            ? `Este proveedor no tiene ${voc.plural('producto')} dados de alta`
                            : 'Escribe y elige de la lista'
                        }
                        onChange={(evento) => {
                          setMaterial(evento.target.value);
                        }}
                      />
                      {/* La lista es la del CATÁLOGO: capturar por texto libre
                          crea diez claves nuevas para el mismo tornillo. */}
                      <datalist id="materiales-del-proveedor">
                        {materiales.map((m) => (
                          <option key={m.id} value={m.nombre} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex w-24 flex-col gap-(--espacio-1)">
                      <Label htmlFor="cantidad">Cantidad</Label>
                      <Input
                        id="cantidad"
                        inputMode="decimal"
                        value={cantidad}
                        className="text-right font-numeros tabular-nums"
                        onChange={(evento) => {
                          setCantidad(evento.target.value);
                        }}
                      />
                    </div>
                    <div className="flex w-32 flex-col gap-(--espacio-1)">
                      <Label htmlFor="costo">Costo del renglón</Label>
                      <CampoDeDinero
                        id="costo"
                        centavos={costoCentavos}
                        alCambiar={setCostoCentavos}
                      />
                    </div>
                    <Button type="submit" variant="secondary">
                      Agregar
                    </Button>
                  </form>
                  {partidas.length > 0 && (
                    <Tabla
                      etiqueta={voc.titulo('linea_orden', true)}
                      columnas={columnasDePartidas}
                      filas={partidas}
                      claveDe={(p) => p.clave}
                      tonoDeFila={(p) => (p.porNombre === true ? 'advertencia' : undefined)}
                      alto="max-h-[40vh]"
                    />
                  )}
                  {kardexDe !== null && (
                    <Superficie
                      como="section"
                      nivel={0}
                      relleno={3}
                      radio="md"
                      aria-label={`Kardex de ${kardexDe.nombre}`}
                      className="flex flex-col gap-(--espacio-2)"
                    >
                      <header className="flex items-center justify-between gap-(--espacio-2)">
                        <h4 className="text-sm font-semibold">Kardex · {kardexDe.nombre}</h4>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Cerrar el kardex"
                          onClick={() => {
                            setKardexDe(null);
                          }}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </header>
                      <KardexDelProducto insumoId={kardexDe.insumoId} />
                    </Superficie>
                  )}
                </section>

                {pendientes > 0 && (
                  <Superficie
                    como="section"
                    nivel={0}
                    relleno={3}
                    radio="md"
                    aria-label="Líneas sin emparejar"
                    className="flex flex-col gap-(--espacio-2) border-advertencia/60 bg-advertencia/10"
                  >
                    <h3 className="flex items-center gap-(--espacio-2) text-sm font-semibold">
                      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                      Sin emparejar — resuélvelas o quedan fuera
                    </h3>
                    <Tabla
                      etiqueta="Líneas sin emparejar"
                      columnas={columnasSinEmparejar}
                      filas={nota.sinEmparejar}
                      claveDe={(l) => l.id}
                      alto="max-h-[40vh]"
                      className="bg-superficie"
                    />
                  </Superficie>
                )}

                {nota.subidas.length > 0 && (
                  <section
                    aria-label={`${voc.titulo('producto', true)} que subieron de costo`}
                    className="flex flex-col gap-(--espacio-2)"
                  >
                    <h3 className="flex items-center gap-(--espacio-2) text-sm font-semibold">
                      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-peligro" />
                      {nota.subidas.length} {voc.plural('producto')} subieron de costo
                    </h3>
                    <Tabla
                      etiqueta={`${voc.titulo('producto', true)} que subieron de costo`}
                      columnas={columnasDeSubidas}
                      filas={nota.subidas}
                      claveDe={(s) => s.id}
                      alto="max-h-[40vh]"
                    />
                  </section>
                )}

                <div className="flex flex-wrap items-center justify-between gap-(--espacio-3) border-t border-borde pt-(--espacio-4)">
                  <p className="flex flex-wrap items-baseline gap-x-(--espacio-2)">
                    <span className="text-sm text-texto-sutil">A pagar</span>
                    <Dinero centavos={nota.totalCentavos} tamano="lg" />
                    <span className="text-sm text-texto-sutil">
                      {aCredito ? `· vence ${nota.vence ?? `a ${dias} días`}` : '· de contado'}
                    </span>
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    disabled={ocupado !== null || proveedorId === ''}
                    cargando={ocupado === CLAVE_GUARDAR}
                    onClick={() => {
                      // Las partidas van en la forma que pide `lineaDeCompra`: la
                      // equivalencia es cuántas unidades base trae UNA de compra,
                      // y sin ella «3 cajas» no dice cuántos kilos entraron.
                      void ejecutar('/api/entradas/recibir', CLAVE_GUARDAR, {
                        proveedorId,
                        folio: folio.trim() === '' ? null : folio.trim(),
                        aCredito,
                        dias: Number(dias),
                        camino,
                        fotoDeLaNota,
                        lineas: partidas.map((p) => ({
                          insumoId: p.insumoId,
                          cantidadCapturada: p.cantidad,
                          unidadCapturada: p.unidad,
                          equivalencia: p.equivalencia,
                          costoTotal: p.costoTotal,
                          // La memoria de la nota siguiente: la clave de SU hoja.
                          ...(p.claveProveedor == null ? {} : { claveProveedor: p.claveProveedor }),
                        })),
                      });
                    }}
                  >
                    {pendientes > 0 ? `Guardar · ${pendientes} quedan fuera` : 'Guardar entrada'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Superficie>

        <PedidoSugerido
          proveedor={proveedor?.nombre ?? null}
          filas={ordenadas}
          estimado={estimado}
          aviso={avisoDelPedido}
          alCopiar={() => {
            void copiarElPedido();
          }}
          alMandar={mandarElPedidoPorWhatsApp}
        />
      </div>
    </div>
  );
}

/**
 * `'123.45'` → `12345`. Enteros, y con la misma regla que el servidor.
 *
 * `Math.round(x * 100)` pierde el medio centavo justo en el caso que importa
 * —`1234.995 * 100` da `123499.4999…`— así que se parte por el punto y se
 * rellenan los centavos. Esto SÓLO se usa para enseñar el total mientras se
 * captura: lo que se guarda va como texto y lo convierte el servidor.
 */
function aCentavos(pesos: string): number {
  const [enteros, decimales = ''] = pesos.trim().split('.');
  const centavos = `${decimales}00`.slice(0, 2);
  return Number.parseInt(enteros ?? '0', 10) * 100 + Number.parseInt(centavos, 10);
}
