'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  TablaAdaptable,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  Check,
  ClipboardList,
  Clock,
  PackageCheck,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { consultarPuente, ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · trabajos-de-mostrador
 *
 * Las notas apartadas, las listas del albañil y las garantías: las tres cosas
 * que hoy viven en papel detrás del mostrador.
 *
 * ── Por qué las tres en una pantalla ────────────────────────────────────
 * Porque son el mismo mueble: el clavo donde se pinchan los papeles. Quien
 * llega a preguntar «¿ya llegó mi taladro?» y quien llega a recoger lo apartado
 * son la misma persona en la misma barra, y separarlas en tres pantallas obliga
 * a buscar en tres.
 *
 * ── Por qué las tres pestañas enseñan su CUENTA ─────────────────────────
 * El clavo se lee de un vistazo: cuántos papeles hay y cuántos ya se enfriaron.
 * Una pestaña que sólo dice su nombre obliga a abrirla para saber si hay algo.
 *
 * ── Por qué la nota apartada CADUCA y se dice cuándo ────────────────────
 * Material apartado es material que no se vende. Sin fecha, el anaquel se llena
 * de cosas de alguien que no volvió, y la existencia miente hacia arriba. Por eso
 * la tabla abre ordenada por lo que vence primero.
 *
 * ── Por qué la lista se captura TAL CUAL la dijo el albañil ─────────────
 * «Diez de varilla del tres» no es una clave del catálogo, y traducirla al
 * capturar pierde lo que de verdad pidió. Se guarda el texto y se empareja
 * después: si nadie lo empareja, al menos queda qué se pidió.
 *
 * ── Y por qué la garantía enseña los DÍAS esperando ─────────────────────
 * «Lleva 90 días» es lo que hace que alguien llame al proveedor. «Pendiente» no.
 * Por eso abre ordenada por la más vieja, y en el teléfono los días son lo grande.
 *
 * ── Tabla en la PC, tarjetas en el pasillo ──────────────────────────────
 * Las tres listas son `TablaAdaptable`: en la PC del mostrador se comparan en
 * columnas; en el teléfono del pasillo cada papel es una tarjeta.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben las tres listas, apartar, entregar, capturar una lista y recibir una
 * garantía. Queda fuera el surtido línea por línea de la lista, que pasa en la
 * pantalla de venta.
 */

/**
 * LAS RUTAS, y las tres que aquí se pedían mal.
 *
 * Esta pantalla leía sus tres listas haciendo POST a rutas de ESCRITURA con
 * `{listar: true}`: `nota_mostrador.apartar` pide un `notaId`, `lista_trabajo.capturar`
 * pide sus renglones y `inventario.recibir_garantia` pide la pieza. Las tres
 * contestaban **400**, los tres `.catch` de abajo lo convertían en tres listas
 * vacías, y la pantalla decía «no hay nada apartado · no hay listas abiertas · no
 * hay garantías pendientes» con las tres cosas en la base. Abría en 200, así que la
 * suite la daba por probada.
 *
 * Ahora cada cosa se lee por donde se lee: los apartados y las listas por el
 * PUENTE —que es el único camino de lectura— y las garantías por el comando de
 * lectura que ya existía y no tenía ruta. Y una lectura que falla ya no se
 * disfraza de lista vacía: se dice que no se pudo leer.
 */
const RUTA_ENTREGAR = '/api/venta/nota-mostrador/entregar';
const RUTA_LISTA = '/api/venta/lista-trabajo';
const RUTA_GARANTIAS_PENDIENTES = '/api/inventario/garantias-pendientes';

/** Una garantía que pasa de aquí ya es dinero que alguien tiene que ir a cobrar. */
const DIAS_DE_GARANTIA_FRIA = 30;

const PESTANAS = [
  { clave: 'apartados', etiqueta: 'Apartado' },
  { clave: 'listas', etiqueta: 'Listas' },
  { clave: 'garantias', etiqueta: 'Garantías' },
] as const;

type Pestana = (typeof PESTANAS)[number]['clave'];

/** Qué lectura no llegó, con su motivo. `null` es que llegó o que no se ha pedido. */
type Fallos = Readonly<Record<Pestana, string | null>>;

const SIN_FALLOS: Fallos = { apartados: null, listas: null, garantias: null };

export interface NotaApartada {
  readonly notaId: string;
  readonly folio: string;
  readonly cliente: string;
  readonly totalCentavos: string;
  readonly venceEn: string;
  readonly diasRestantes: number;
}

export interface ListaDeTrabajo {
  readonly listaId: string;
  readonly folio: string;
  readonly cliente: string;
  readonly lineas: number;
  readonly surtidas: number;
}

export interface GarantiaPendiente {
  readonly garantiaId: string;
  readonly productoId: string;
  readonly piezas: number;
  readonly estado: string;
  readonly valorCentavos: string;
  readonly diasEsperando: number;
}

/**
 * LA FILA DEL PUENTE de una nota apartada, con los nombres que `NotaDeCaja` sirve.
 *
 * Es la vista `notas_de_caja`, que resuelve el estado real de los dos documentos
 * —el de la orden dice si entró el dinero, el de la nota si salió el material— y
 * `apartada` es uno de ellos. Los días que le quedan NO son un campo: se derivan
 * de `vence` aquí, que es donde se pintan.
 */
interface FilaDeNotaApartada {
  readonly nota_id: string;
  readonly codigo_caja: string | null;
  readonly cliente_nombre: string | null;
  readonly totalCentavos: number;
  readonly vence: string | null;
}

/** La fila del puente de una lista, con sus renglones ya contados por la vista. */
interface FilaDeLista {
  readonly id: string;
  readonly folio: string;
  readonly cliente: string | null;
  readonly renglones: number;
  readonly surtidos: number;
}

/** Lo que salió mal al TOCAR algo, y lo que por eso no pasó. */
interface FalloDeComando {
  readonly titulo: string;
  readonly queNoPaso: string;
}

/**
 * Cuántos días de CALENDARIO faltan, que es lo que el mostrador pregunta.
 *
 * Por días de calendario y no por horas: una resta de milisegundos dice «0 días»
 * a las 23:00 de la víspera y «1 día» a las 00:30 del mismo día de vencimiento,
 * y las dos respuestas se leen al revés de lo que pasa.
 */
function diasHasta(fecha: string | null): number {
  if (fecha === null || fecha === '') return 0;
  const aMedianoche = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((aMedianoche(new Date(fecha)) - aMedianoche(new Date())) / 86_400_000);
}

function comoNotaApartada(fila: FilaDeNotaApartada): NotaApartada {
  return {
    notaId: fila.nota_id,
    folio: fila.codigo_caja ?? 'sin folio',
    cliente: fila.cliente_nombre ?? 'sin nombre',
    // A texto: el importe viaja en centavos enteros y `<Dinero>` lo vuelve número.
    totalCentavos: String(fila.totalCentavos),
    venceEn: fila.vence ?? '',
    diasRestantes: diasHasta(fila.vence),
  };
}

function comoLista(fila: FilaDeLista): ListaDeTrabajo {
  return {
    listaId: fila.id,
    folio: fila.folio,
    cliente: fila.cliente ?? 'sin nombre',
    lineas: fila.renglones,
    surtidas: fila.surtidos,
  };
}

export interface TrabajosProps {
  readonly apartadosIniciales?: readonly NotaApartada[];
  readonly listasIniciales?: readonly ListaDeTrabajo[];
  readonly garantiasIniciales?: readonly GarantiaPendiente[];
  /**
   * YA NO SE USA, y se queda declarado para que nadie lo vuelva a pasar.
   *
   * Ninguna de las tres consultas de esta pantalla lleva almacén, y exigirlo la
   * dejaba en blanco: `page.tsx` la monta con la cadena vacía.
   */
  readonly almacenId?: never;
}

/** «Vence hoy» y «le quedan 3 días» no se leen igual, y no se atienden igual. */
export function leerVencimiento(dias: number): string {
  if (dias < 0) return `Venció hace ${String(-dias)} d`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Le queda 1 día';
  return `Le quedan ${String(dias)} días`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

function motivoDeLectura(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : 'No se pudo leer.';
}

// ── El clavo de un vistazo ────────────────────────────────────────────────

interface Resumen {
  readonly cuenta: number | null;
  readonly detalle: string;
  /** Hay algo que ya se enfrió: el detalle va en rojo y con su icono. */
  readonly urgente: boolean;
}

function resumirApartados(notas: readonly NotaApartada[]): Resumen {
  const vencidas = notas.filter((n) => n.diasRestantes <= 0).length;
  if (vencidas === 0) return { cuenta: notas.length, detalle: 'ninguna vencida', urgente: false };
  const detalle =
    vencidas === 1 ? '1 vence hoy o ya venció' : `${String(vencidas)} vencen hoy o ya vencieron`;
  return { cuenta: notas.length, detalle, urgente: true };
}

function resumirListas(listas: readonly ListaDeTrabajo[]): Resumen {
  const porSurtir = listas.reduce((suma, l) => suma + Math.max(0, l.lineas - l.surtidas), 0);
  const detalle =
    porSurtir === 0
      ? 'nada por surtir'
      : `${String(porSurtir)} ${porSurtir === 1 ? 'renglón' : 'renglones'} por surtir`;
  return { cuenta: listas.length, detalle, urgente: false };
}

function resumirGarantias(garantias: readonly GarantiaPendiente[]): Resumen {
  const frias = garantias.filter((g) => g.diasEsperando > DIAS_DE_GARANTIA_FRIA).length;
  return {
    cuenta: garantias.length,
    detalle:
      frias === 0
        ? `ninguna de más de ${String(DIAS_DE_GARANTIA_FRIA)} días`
        : `${String(frias)} con más de ${String(DIAS_DE_GARANTIA_FRIA)} días`,
    urgente: frias > 0,
  };
}

function Pestanas({
  pestana,
  resumenes,
  fallos,
  alElegir,
}: {
  readonly pestana: Pestana;
  readonly resumenes: Readonly<Record<Pestana, Resumen | null>>;
  readonly fallos: Fallos;
  readonly alElegir: (pestana: Pestana) => void;
}) {
  return (
    <ul aria-label="Qué papeles ver" className="grid grid-cols-3 gap-(--espacio-2)">
      {PESTANAS.map((opcion) => {
        const elegida = pestana === opcion.clave;
        const resumen = resumenes[opcion.clave];
        const sinLeer = fallos[opcion.clave] !== null;
        return (
          <li key={opcion.clave} className="flex">
            <Superficie
              como="button"
              type="button"
              interactiva
              activa={elegida}
              aria-pressed={elegida}
              relleno={3}
              radio="md"
              className="flex w-full flex-col items-start gap-(--espacio-1)"
              onClick={() => {
                alElegir(opcion.clave);
              }}
            >
              <span className="flex w-full items-center justify-between gap-(--espacio-1) text-sm font-semibold">
                {opcion.etiqueta}
                {elegida && <Check aria-hidden="true" className="size-4 shrink-0 text-primario" />}
              </span>
              {resumen === null ? (
                sinLeer ? (
                  <span className="text-xs text-peligro">sin leer</span>
                ) : (
                  <Esqueleto className="h-(--espacio-8) w-(--espacio-10)" />
                )
              ) : (
                <>
                  <span className="font-numeros text-2xl font-semibold tabular-nums">
                    {resumen.cuenta}
                  </span>
                  <span
                    className={
                      resumen.urgente
                        ? 'text-xs font-medium text-peligro'
                        : 'text-xs text-texto-sutil'
                    }
                  >
                    {resumen.detalle}
                  </span>
                </>
              )}
            </Superficie>
          </li>
        );
      })}
    </ul>
  );
}

// ── Los tres estados de una lectura ───────────────────────────────────────

/**
 * NO LEYÓ, TODAVÍA NO, O YA: los tres estados de cada pestaña, en el mismo orden.
 *
 * Cada pestaña los tiene por separado: que las garantías no llegaran no es razón
 * para esconder lo apartado, y el formulario de la lista sirve aunque la lista de
 * listas no se haya podido leer.
 */
function SegunLectura<F>({
  filas,
  fallo,
  titulo,
  queHacer,
  alReintentar,
  children,
}: {
  readonly filas: readonly F[] | null;
  readonly fallo: string | null;
  readonly titulo: string;
  readonly queHacer: string;
  readonly alReintentar: () => void;
  readonly children: (filas: readonly F[]) => ReactNode;
}) {
  if (fallo !== null) {
    return (
      <ErrorDePantalla
        titulo={titulo}
        queHacer={queHacer}
        detalle={fallo}
        reintentar={
          <Button type="button" onClick={alReintentar}>
            Volver a leer
          </Button>
        }
      />
    );
  }
  // La forma de la tabla, nunca una rueda: el ojo ya sabe dónde va a mirar.
  if (filas === null) return <EsqueletoDeLista filas={5} />;
  return <>{children(filas)}</>;
}

// ── Apartado ──────────────────────────────────────────────────────────────

function Vencimiento({ dias }: { readonly dias: number }) {
  if (dias > 0) return <span className="text-texto-sutil">{leerVencimiento(dias)}</span>;
  // El color no va solo: el icono y la frase dicen que ya no hay plazo.
  return (
    <span className="inline-flex items-center gap-(--espacio-1) font-medium text-peligro">
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      {leerVencimiento(dias)}
    </span>
  );
}

function TablaDeApartados({
  notas,
  ocupado,
  alEntregar,
}: {
  readonly notas: readonly NotaApartada[];
  readonly ocupado: boolean;
  readonly alEntregar: (nota: NotaApartada) => void;
}) {
  const voc = useVocabulario();
  // Lo que vence primero, arriba: es lo que hay que llamar hoy.
  const porVencer = useMemo(
    () => notas.toSorted((a, b) => a.diasRestantes - b.diasRestantes),
    [notas],
  );
  const apartadoTotal = notas.reduce((suma, n) => suma + Number(n.totalCentavos), 0);
  const columnas: readonly ColumnaDeTabla<NotaApartada>[] = [
    {
      clave: 'folio',
      titulo: voc.titulo('orden'),
      orden: (n) => n.folio,
      celda: (n) => <span className="font-medium">{n.folio}</span>,
    },
    {
      clave: 'cliente',
      titulo: voc.titulo('cliente'),
      orden: (n) => n.cliente,
      celda: (n) => n.cliente,
    },
    {
      clave: 'total',
      titulo: 'Importe',
      numerica: true,
      orden: (n) => Number(n.totalCentavos),
      celda: (n) => <Dinero centavos={Number(n.totalCentavos)} tamano="sm" />,
    },
    {
      clave: 'vence',
      titulo: 'Vence',
      orden: (n) => n.diasRestantes,
      celda: (n) => <Vencimiento dias={n.diasRestantes} />,
    },
    {
      clave: 'entrega',
      titulo: 'Entrega',
      celda: (n) => (
        <Button
          type="button"
          size="sm"
          disabled={ocupado}
          onClick={() => {
            alEntregar(n);
          }}
        >
          Entregar
        </Button>
      ),
    },
  ];
  return (
    <TablaAdaptable
      etiqueta={`${voc.titulo('orden', true)} apartadas`}
      principal="cliente"
      desde="lg"
      columnas={columnas}
      filas={porVencer}
      claveDe={(n) => n.notaId}
      tonoDeFila={(n) => (n.diasRestantes <= 0 ? 'peligro' : undefined)}
      pie={{
        folio: <span className="text-texto-sutil">Apartado</span>,
        total: <Dinero centavos={apartadoTotal} tamano="sm" />,
      }}
      alto="max-h-[60vh]"
      vacio={
        <Vacio
          icono={<PackageCheck />}
          titulo="No hay nada apartado."
          explicacion={`Cuando se aparta ${voc.enFraseCon('un', 'orden')}, aquí se ve de quién es y cuándo vence.`}
        />
      }
    />
  );
}

// ── Listas ────────────────────────────────────────────────────────────────

function TablaDeListas({ listas }: { readonly listas: readonly ListaDeTrabajo[] }) {
  const voc = useVocabulario();
  const columnas: readonly ColumnaDeTabla<ListaDeTrabajo>[] = [
    {
      clave: 'folio',
      titulo: 'Folio',
      orden: (l) => l.folio,
      celda: (l) => <span className="font-medium">{l.folio}</span>,
    },
    {
      clave: 'cliente',
      titulo: voc.titulo('cliente'),
      orden: (l) => l.cliente,
      celda: (l) => l.cliente,
    },
    {
      clave: 'surtido',
      titulo: 'Surtido',
      numerica: true,
      orden: (l) => l.lineas - l.surtidas,
      celda: (l) => (
        <span className="tabular-nums">
          {l.surtidas} de {l.lineas}
        </span>
      ),
    },
  ];
  return (
    <TablaAdaptable
      etiqueta="Listas de trabajo abiertas"
      principal="cliente"
      desde="lg"
      columnas={columnas}
      filas={listas}
      claveDe={(l) => l.listaId}
      alto="max-h-[60vh]"
      vacio={
        <Vacio
          icono={<ClipboardList />}
          titulo="No hay listas abiertas."
          explicacion="La que dicte el albañil se captura en «Capturar una lista», tal cual la dijo."
        />
      }
    />
  );
}

function CapturaDeLista({
  nombre,
  texto,
  ocupado,
  alCambiarNombre,
  alCambiarTexto,
  alGuardar,
}: {
  readonly nombre: string;
  readonly texto: string;
  readonly ocupado: boolean;
  readonly alCambiarNombre: (valor: string) => void;
  readonly alCambiarTexto: (valor: string) => void;
  readonly alGuardar: () => void;
}) {
  return (
    <Superficie
      como="section"
      aria-labelledby="capturar-lista"
      relleno={4}
      radio="md"
      className="flex flex-col gap-(--espacio-3)"
    >
      <h2 id="capturar-lista" className="font-semibold">
        Capturar una lista
      </h2>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="quien">De quién</Label>
        <Input
          id="quien"
          className="h-[calc(var(--altura-control)*1.2)]"
          placeholder="Don Beto, obra de la esquina"
          value={nombre}
          onChange={(evento) => {
            alCambiarNombre(evento.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="lista">Lo que pidió, tal cual</Label>
        <Textarea
          id="lista"
          rows={6}
          placeholder={'diez de varilla del tres\nun bulto de cemento\ndos kilos de clavo'}
          value={texto}
          onChange={(evento) => {
            alCambiarTexto(evento.target.value);
          }}
        />
        <p className="text-sm text-texto-sutil">
          Un renglón por línea. No se traduce al capturar: se empareja después.
        </p>
      </div>
      <Button type="button" disabled={ocupado} cargando={ocupado} onClick={alGuardar}>
        Guardar la lista
      </Button>
    </Superficie>
  );
}

// ── Garantías ─────────────────────────────────────────────────────────────

function Esperando({ dias }: { readonly dias: number }) {
  if (dias <= DIAS_DE_GARANTIA_FRIA) {
    return (
      <span className="text-texto-sutil">
        <Cifra valor={dias} unidad="d" /> esperando
      </span>
    );
  }
  // «Lleva 90 días» es lo que hace que alguien llame al proveedor. «Pendiente» no.
  return (
    <span className="inline-flex items-center gap-(--espacio-1) font-semibold text-peligro">
      <Clock aria-hidden="true" className="size-4 shrink-0" />
      <Cifra valor={dias} unidad="d" /> esperando
    </span>
  );
}

function TablaDeGarantias({ garantias }: { readonly garantias: readonly GarantiaPendiente[] }) {
  // La más vieja arriba: es la que ya debería estar cobrada.
  const porAntiguedad = useMemo(
    () => garantias.toSorted((a, b) => b.diasEsperando - a.diasEsperando),
    [garantias],
  );
  const enElProveedor = garantias.reduce((suma, g) => suma + Number(g.valorCentavos), 0);
  const columnas: readonly ColumnaDeTabla<GarantiaPendiente>[] = [
    { clave: 'estado', titulo: 'Estado', orden: (g) => g.estado, celda: (g) => g.estado },
    {
      clave: 'piezas',
      titulo: 'Piezas',
      numerica: true,
      orden: (g) => g.piezas,
      celda: (g) => <Cifra valor={g.piezas} unidad="pz" />,
    },
    {
      clave: 'valor',
      titulo: 'Valor',
      numerica: true,
      orden: (g) => Number(g.valorCentavos),
      celda: (g) => <Dinero centavos={Number(g.valorCentavos)} tamano="sm" />,
    },
    {
      clave: 'esperando',
      titulo: 'Esperando',
      orden: (g) => g.diasEsperando,
      celda: (g) => <Esperando dias={g.diasEsperando} />,
    },
  ];
  return (
    <TablaAdaptable
      etiqueta="Garantías en el proveedor"
      principal="esperando"
      desde="lg"
      columnas={columnas}
      filas={porAntiguedad}
      claveDe={(g) => g.garantiaId}
      tonoDeFila={(g) => (g.diasEsperando > DIAS_DE_GARANTIA_FRIA ? 'peligro' : undefined)}
      pie={{
        estado: <span className="text-texto-sutil">En el proveedor</span>,
        valor: <Dinero centavos={enElProveedor} tamano="sm" />,
      }}
      alto="max-h-[60vh]"
      vacio={
        <Vacio
          icono={<ShieldCheck />}
          titulo="No hay nada en el proveedor."
          explicacion="Cuando una pieza se manda a garantía, aquí se cuentan los días que lleva esperando."
        />
      }
    />
  );
}

// ── La pantalla ───────────────────────────────────────────────────────────

export function TrabajosDeMostrador({
  apartadosIniciales,
  listasIniciales,
  garantiasIniciales,
}: TrabajosProps) {
  const voc = useVocabulario();
  const [pestana, setPestana] = useState<Pestana>('apartados');
  const [apartados, setApartados] = useState<readonly NotaApartada[] | null>(
    apartadosIniciales ?? null,
  );
  const [listas, setListas] = useState<readonly ListaDeTrabajo[] | null>(listasIniciales ?? null);
  const [garantias, setGarantias] = useState<readonly GarantiaPendiente[] | null>(
    garantiasIniciales ?? null,
  );
  const [fallos, setFallos] = useState<Fallos>(SIN_FALLOS);
  const [intento, setIntento] = useState(0);
  const [textoLista, setTextoLista] = useState('');
  const [nombreLista, setNombreLista] = useState('');
  const [error, setError] = useState<FalloDeComando | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (
      apartadosIniciales !== undefined &&
      listasIniciales !== undefined &&
      garantiasIniciales !== undefined
    ) {
      return;
    }
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    /** Una lectura que no llegó se DICE: ya no se disfraza de lista vacía. */
    const fallar =
      (cual: Pestana) =>
      (fallo: unknown): void => {
        if (sigueMontada())
          setFallos((previos) => ({ ...previos, [cual]: motivoDeLectura(fallo) }));
      };
    const cargar = (): void => {
      // Las notas apartadas, las listas y las garantías son del NEGOCIO: ninguna
      // de las tres consultas de abajo lleva almacén.
      //
      // Aquí había una guarda `if (almacenId === '') return;` heredada de cuando
      // esta pantalla consultaba con un id vacío. Tapó aquel 500 y dejó otra
      // avería: `page.tsx` la monta con la cadena vacía, así que las tres consultas
      // NO CORRÍAN NUNCA y la pantalla se quedaba en blanco para siempre.
      if (apartadosIniciales === undefined) {
        consultarPuente<FilaDeNotaApartada>('NotaDeCaja', {
          // El estado que la vista calcula de los dos documentos: material
          // comprometido que no ha salido.
          filtro: { estado: 'apartada' },
          limite: 60,
          signal: control.signal,
        })
          .then((filas) => {
            if (sigueMontada()) setApartados(filas.map(comoNotaApartada));
          })
          .catch(fallar('apartados'));
      }
      if (listasIniciales === undefined) {
        consultarPuente<FilaDeLista>('ListaDeTrabajo', { limite: 60, signal: control.signal })
          .then((filas) => {
            if (sigueMontada()) setListas(filas.map(comoLista));
          })
          .catch(fallar('listas'));
      }
      if (garantiasIniciales === undefined) {
        invocarComando<{ readonly pendientes: readonly GarantiaPendiente[] }>(
          RUTA_GARANTIAS_PENDIENTES,
          // Todas, de cualquier proveedor: la pestaña es «qué está en el limbo».
          { proveedorId: null },
        )
          .then((salida) => {
            if (sigueMontada()) setGarantias(salida.pendientes);
          })
          .catch(fallar('garantias'));
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [apartadosIniciales, listasIniciales, garantiasIniciales, intento]);

  /** Se limpia EN EL CLIC: lo que no llegó vuelve a su esqueleto y se relee. */
  function volverALeer(): void {
    if (fallos.apartados !== null) setApartados(null);
    if (fallos.listas !== null) setListas(null);
    if (fallos.garantias !== null) setGarantias(null);
    setFallos(SIN_FALLOS);
    setIntento((previo) => previo + 1);
  }

  function entregar(nota: NotaApartada): void {
    setOcupado(true);
    setError(null);
    invocarComando(RUTA_ENTREGAR, { notaId: nota.notaId })
      .then(() => {
        setApartados((apartados ?? []).filter((n) => n.notaId !== nota.notaId));
        setAviso(`Entregada la ${nota.folio}.`);
      })
      .catch((fallo: unknown) => {
        setError({
          titulo: mensajeDe(fallo),
          queNoPaso: `La ${nota.folio} sigue apartada: no salió material.`,
        });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function capturarLista(): void {
    const renglones = textoLista
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter((t) => t !== '');
    if (nombreLista.trim() === '' || renglones.length === 0) {
      setError({
        titulo: 'La lista lleva nombre y al menos un renglón.',
        queNoPaso: 'No se guardó nada.',
      });
      return;
    }
    setOcupado(true);
    setError(null);
    /**
     * LO QUE EL COMANDO PIDE, que no es lo que aquí se mandaba.
     *
     * `lista_trabajo.capturar` recibe `titulo` y `renglones`; esto mandaba `lineas`
     * y ningún título, así que capturar una lista contestaba 400 con el formulario
     * entero escrito —y el albañil esperando—. El folio ya no se manda: lo pone el
     * servidor en su serie `LT`, como el de la nota y el del crédito.
     *
     * El título se arma con el nombre porque esta pantalla no pide uno: lo que se
     * enseña de una lista es su folio y de quién es. Un campo más en el formulario
     * del mostrador es un campo que nadie llena.
     */
    const nombre = nombreLista.trim();
    invocarComando<{
      readonly listaId: string;
      readonly folio: string;
      readonly renglones: number;
    }>(RUTA_LISTA, {
      titulo: `Lista de ${nombre}`,
      nombreLibre: nombre,
      // Tal cual lo dijo: traducirlo al capturar pierde lo que de verdad pidió.
      renglones: renglones.map((texto) => ({ textoPedido: texto })),
    })
      .then((creada) => {
        setListas([
          {
            listaId: creada.listaId,
            folio: creada.folio,
            cliente: nombre,
            lineas: creada.renglones,
            // Recién capturada: ninguno surtido todavía. Es el dato, no un cero
            // de relleno.
            surtidas: 0,
          },
          ...(listas ?? []),
        ]);
        setTextoLista('');
        setNombreLista('');
        setAviso('Lista capturada tal cual la dictó.');
      })
      .catch((fallo: unknown) => {
        setError({
          titulo: mensajeDe(fallo),
          queNoPaso: 'La lista no se guardó; lo escrito sigue en el formulario.',
        });
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const resumenes: Readonly<Record<Pestana, Resumen | null>> = {
    apartados: apartados === null ? null : resumirApartados(apartados),
    listas: listas === null ? null : resumirListas(listas),
    garantias: garantias === null ? null : resumirGarantias(garantias),
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6)">
      <header className="flex flex-col gap-(--espacio-1)">
        <h1 className="text-2xl font-semibold">Trabajos de mostrador</h1>
        <p className="text-sm text-texto-sutil">
          El clavo donde se pinchan los papeles, sin papeles.
        </p>
      </header>

      <Pestanas pestana={pestana} resumenes={resumenes} fallos={fallos} alElegir={setPestana} />

      {error !== null && (
        <Aviso tono="peligro" titulo={error.titulo}>
          {error.queNoPaso}
        </Aviso>
      )}
      {aviso !== null && <Aviso tono="exito" titulo={aviso} />}

      {pestana === 'apartados' && (
        <section
          aria-label={`${voc.titulo('orden', true)} apartadas`}
          className="flex flex-col gap-(--espacio-3)"
        >
          <SegunLectura
            filas={apartados}
            fallo={fallos.apartados}
            titulo={`No se pudieron leer ${voc.conArticulo('orden', true).toLowerCase()} apartadas`}
            queHacer="Revisa la conexión y vuelve a leer. No se entregó nada: el material sigue apartado."
            alReintentar={volverALeer}
          >
            {(notas) => <TablaDeApartados notas={notas} ocupado={ocupado} alEntregar={entregar} />}
          </SegunLectura>
          <p className="text-sm text-texto-sutil">
            Material apartado es material que no se vende: por eso caduca y por eso se ve cuándo.
          </p>
        </section>
      )}

      {pestana === 'listas' && (
        <div className="flex flex-col gap-(--espacio-4) lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <section aria-label="Listas de trabajo abiertas">
            <SegunLectura
              filas={listas}
              fallo={fallos.listas}
              titulo="No se pudieron leer las listas de trabajo"
              queHacer="Revisa la conexión y vuelve a leer. Mientras, una lista nueva se puede capturar."
              alReintentar={volverALeer}
            >
              {(abiertas) => <TablaDeListas listas={abiertas} />}
            </SegunLectura>
          </section>
          <CapturaDeLista
            nombre={nombreLista}
            texto={textoLista}
            ocupado={ocupado}
            alCambiarNombre={setNombreLista}
            alCambiarTexto={setTextoLista}
            alGuardar={capturarLista}
          />
        </div>
      )}

      {pestana === 'garantias' && (
        <section aria-label="Garantías en el proveedor" className="flex flex-col gap-(--espacio-3)">
          <SegunLectura
            filas={garantias}
            fallo={fallos.garantias}
            titulo="No se pudieron leer las garantías pendientes"
            queHacer="Revisa la conexión y vuelve a leer. Las garantías siguen registradas: sólo no llegaron."
            alReintentar={volverALeer}
          >
            {(pendientes) => <TablaDeGarantias garantias={pendientes} />}
          </SegunLectura>
          <p className="text-sm text-texto-sutil">
            Un negocio mediano pierde entre $20,000 y $60,000 al año porque nadie lleva esta cuenta.
          </p>
        </section>
      )}
    </main>
  );
}
