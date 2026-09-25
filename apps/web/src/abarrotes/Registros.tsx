'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
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
  type ColumnaDeTabla,
  type TamanoDeDinero,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import { CalendarX, CircleAlert, ListFilter, Package, Receipt, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { consultarPuente } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · registros
 *
 * Qué pasó: ventas, movimientos de caja y entradas, en una sola línea de tiempo.
 *
 * ── Por qué es UNA lista y no tres pantallas ────────────────────────────
 * Porque la pregunta que trae aquí a alguien nunca es «enséñame las ventas»:
 * es «qué pasó a las siete y media», o «de dónde salió ese dinero». Tres
 * pantallas obligan a buscar en las tres y a cruzar horas a ojo, que es
 * exactamente lo que nadie hace — y por eso hoy nadie revisa nada.
 *
 * ── Por qué lo que NO tiene motivo se marca ─────────────────────────────
 * Un retiro sin explicación es la única salida de dinero que puede esconder un
 * faltante. Marcarlo en la lista lo convierte en una pregunta que alguien puede
 * hacer esa misma noche, en vez de una diferencia que aparece en el corte y que
 * ya no se puede reconstruir.
 *
 * ── Por qué la cancelación se enseña con quién la hizo ──────────────────
 * Cancelar una venta cobrada es la operación más sensible del mostrador. Sin el
 * nombre al lado, el registro existe y no sirve: nadie va a abrir la ficha de
 * cada una.
 *
 * ── Por qué el filtro es por DÍA y no por rango ─────────────────────────
 * La pregunta es de un día concreto. Un rango obliga a elegir dos fechas para
 * contestar una pregunta de una, y a las diez de la noche eso es una pantalla
 * que se cierra sin usar.
 *
 * ── Cómo se lee, en la PC del mostrador ─────────────────────────────────
 * `04-INTERFAZ` §4.3: el dispositivo principal es la PC y la densidad es alta.
 * Es una TABLA densa de un renglón por hecho —hora, tipo, qué pasó, detalle e
 * importe—, con la hora en cifras tabulares a la izquierda porque es por donde
 * entra la pregunta. Lo que hay que preguntar hoy se tiñe de peligro y lo DICE
 * en la celda; la cancelación se tiñe de advertencia y su importe va tachado.
 * En el teléfono del dueño la misma tabla se queda en hora, qué pasó e importe,
 * con el detalle en un segundo renglón chico: se lee igual, de arriba abajo.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben la línea de tiempo del día, el filtro por tipo y el detalle de cada
 * renglón. Queda fuera la exportación, que es del reporte y no del registro.
 */

const TIPOS = [
  { clave: 'todo', etiqueta: 'Todo' },
  // El rótulo de ésta lo pone el DICCIONARIO: «Ventas», «Notas» o «Cuentas» según
  // el giro. `etiqueta` se queda de reserva por si el giro la apaga.
  { clave: 'venta', etiqueta: 'Ventas', voz: 'orden' },
  { clave: 'caja', etiqueta: 'Caja' },
  { clave: 'inventario', etiqueta: 'Inventario' },
] as const;

type Tipo = (typeof TIPOS)[number]['clave'];

/** De dónde sale un renglón: las tres fuentes de la línea de tiempo. */
type Origen = Exclude<Tipo, 'todo'>;

/** La forma de cada fuente, además de su palabra: el color no es lo único que la dice. */
const ICONOS: Readonly<Record<Origen, ReactNode>> = {
  venta: <Receipt aria-hidden="true" className="size-4 shrink-0" />,
  caja: <Wallet aria-hidden="true" className="size-4 shrink-0" />,
  inventario: <Package aria-hidden="true" className="size-4 shrink-0" />,
};

/**
 * LAS TRES FUENTES, con los nombres que el puente SIRVE.
 *
 * Ninguna de las tres leía los nombres correctos, y las tres llegaban con la mitad
 * de los campos en `undefined`: la línea de tiempo del día —lo único que esta
 * pantalla existe para enseñar— salía con importes `NaN` y «sin firma» en cada
 * renglón.
 *
 *   · `Venta` sirve `created_date`, `total` (en PESOS) y `usuario_cajero_nombre`.
 *   · El movimiento del cajón se leía de `MovimientoCuenta`, que es el movimiento de
 *     una CUENTA A OTRA en un restaurante (F-321) y no el del dinero. La fuente
 *     correcta es `MovimientoCaja`, que se declaró para esto.
 *   · `MovimientoInventario` sirve `tipo_movimiento` e `ingrediente_nombre`.
 */
export interface VentaRegistrada {
  readonly id: string;
  readonly created_date: string;
  /** EN PESOS, como lo sirve el puente. */
  readonly total: number | null;
  readonly estado: string;
  readonly usuario_cajero_nombre: string | null;
}

export interface MovimientoRegistrado {
  readonly id: string;
  readonly created_at: string;
  readonly tipo: string;
  /** CON SIGNO y en centavos: el esperado del arqueo es su suma. */
  readonly monto_centavos: number;
  readonly motivo: string | null;
  readonly empleado_nombre: string | null;
}

export interface MovimientoDeInventario {
  readonly id: string;
  readonly created_date: string;
  readonly tipo_movimiento: string;
  readonly ingrediente_nombre: string | null;
  /** `conversion: 'decimal'` en el puente: NÚMERO. */
  readonly cantidad: number;
  readonly motivo: string | null;
}

export interface RenglonDeRegistro {
  readonly id: string;
  readonly hora: string;
  readonly tipo: Origen;
  readonly titulo: string;
  readonly detalle: string;
  /**
   * EN CENTAVOS, y en la caja CON SIGNO: lo que entra al cajón y lo que sale. `null`
   * en inventario, que mueve piezas y no dinero. Se pinta con `<Dinero>`, nunca aquí.
   */
  readonly importeCentavos: number | null;
  /** Cuánto se movió de inventario. `null` en lo que no es inventario. */
  readonly cantidad: number | null;
  /** La venta cobrada que se canceló: su importe va tachado, no borrado. */
  readonly cancelada: boolean;
  /** Lo que hay que preguntar esta misma noche. */
  readonly sinExplicacion: boolean;
}

export interface RegistrosProps {
  readonly dia?: string;
  readonly ventasIniciales?: readonly VentaRegistrada[];
  readonly movimientosIniciales?: readonly MovimientoRegistrado[];
  readonly inventarioInicial?: readonly MovimientoDeInventario[];
}

function hora(fecha: string): string {
  return fecha.slice(11, 16);
}

/**
 * HOY, con el año, el mes y el día de la hora LOCAL: `AAAA-MM-DD`.
 *
 * Decía `new Date().toISOString().slice(0, 10)`, que es la fecha en UTC: en México,
 * desde las seis de la tarde ya es mañana, así que a las 22:45 —cuando el dueño
 * revisa— la pantalla abría en el día siguiente y decía «Ese día no tiene
 * movimientos». Es el mismo error de UTC contra hora local que el rango del día.
 */
function hoyEnHoraLocal(): string {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${String(ahora.getFullYear())}-${mes}-${dia}`;
}

function mensajeDe(fallo: unknown, porOmision: string): string {
  return fallo instanceof Error ? fallo.message : porOmision;
}

/**
 * El monto del movimiento, en centavos y con signo. `MovimientoCaja` ya lo sirve en
 * centavos (`conversion: 'entero'`), pero la unidad la decide la conversión del campo y
 * no su nombre, así que pasa por `centavosDe`. `null`: no se pudo leer, y se pinta «—».
 */
function montoDe(movimiento: MovimientoRegistrado): number | null {
  return centavosDe('MovimientoCaja', 'monto_centavos', movimiento.monto_centavos);
}

/** Lo que sale del cajón sin explicación. Entrar no necesita motivo; salir sí. */
export function saleSinExplicacion(movimiento: MovimientoRegistrado): boolean {
  const vacio = movimiento.motivo === null || movimiento.motivo.trim() === '';
  return vacio && (montoDe(movimiento) ?? 0) < 0;
}

/**
 * Las tres fuentes en UNA línea de tiempo, de lo más reciente a lo más viejo.
 *
 * Se mezcla aquí y no en tres listas porque la pregunta que trae a alguien
 * nunca es «enséñame las ventas»: es «qué pasó a las siete y media».
 */
export function componerLinea(
  ventas: readonly VentaRegistrada[],
  movimientos: readonly MovimientoRegistrado[],
  inventario: readonly MovimientoDeInventario[],
  /**
   * Cómo se llama una VENTA en este giro: «Venta» en la tiendita, «Nota» en la
   * ferretería, «Cuenta» en la barra. Tecleada, esta pantalla —que es de las cinco
   * plantillas— decía «Venta» en una ferretería que sólo habla de notas.
   */
  comoSeLlamaLaVenta = 'Venta',
  /**
   * Cómo se llama lo que entra y sale del anaquel cuando el movimiento no trae
   * nombre: «producto» en la tiendita, «material» en la ferretería. Decía «insumo»,
   * que es la palabra de la cocina y en una tienda está apagada.
   */
  comoSeLlamaElProducto = 'producto',
): readonly RenglonDeRegistro[] {
  const renglones: RenglonDeRegistro[] = [];

  for (const venta of ventas) {
    const cancelada = venta.estado === 'cancelada';
    renglones.push({
      id: `v-${venta.id}`,
      hora: hora(venta.created_date),
      tipo: 'venta',
      titulo: cancelada ? `${comoSeLlamaLaVenta} cancelada` : comoSeLlamaLaVenta,
      // Quién la hizo va EN la línea: cancelar una venta cobrada es la
      // operación más sensible del mostrador, y nadie abre la ficha de cada una.
      detalle: venta.usuario_cajero_nombre ?? 'sin firma',
      // `total` llega en PESOS (`conversion: 'dinero'`): a centavos contando dígitos,
      // no multiplicando coma flotante.
      importeCentavos: centavosDe('Venta', 'total', venta.total) ?? 0,
      cantidad: null,
      cancelada,
      sinExplicacion: cancelada && venta.usuario_cajero_nombre === null,
    });
  }

  for (const movimiento of movimientos) {
    renglones.push({
      id: `c-${movimiento.id}`,
      hora: hora(movimiento.created_at),
      tipo: 'caja',
      titulo: movimiento.tipo.replace(/_/g, ' '),
      detalle: movimiento.motivo ?? movimiento.empleado_nombre ?? 'sin motivo',
      importeCentavos: montoDe(movimiento),
      cantidad: null,
      cancelada: false,
      sinExplicacion: saleSinExplicacion(movimiento),
    });
  }

  for (const fila of inventario) {
    renglones.push({
      id: `i-${fila.id}`,
      hora: hora(fila.created_date),
      tipo: 'inventario',
      titulo: fila.tipo_movimiento.replace(/_/g, ' '),
      detalle: fila.ingrediente_nombre ?? comoSeLlamaElProducto,
      importeCentavos: null,
      cantidad: fila.cantidad,
      cancelada: false,
      sinExplicacion: false,
    });
  }

  return renglones.sort((a, b) => b.hora.localeCompare(a.hora));
}

/** Los decimales que la cantidad TRAE, hasta tres: 1.5 kg no se redondea a 2. */
function decimalesDe(cantidad: number): number {
  const [, fraccion = ''] = String(cantidad).split('.');
  return Math.min(3, fraccion.length);
}

/** El detalle del renglón: quién o por qué, y en inventario cuánto. */
function Detalle({
  renglon,
  tamano,
}: {
  readonly renglon: RenglonDeRegistro;
  readonly tamano: TamanoDeDinero;
}) {
  if (renglon.cantidad === null) return <>{renglon.detalle}</>;
  return (
    <>
      {renglon.detalle} ·{' '}
      <Cifra valor={renglon.cantidad} decimales={decimalesDe(renglon.cantidad)} tamano={tamano} />
    </>
  );
}

/** Lo que se pinta en la columna del dinero. La caja lleva signo: entra o sale. */
function Importe({ renglon }: { readonly renglon: RenglonDeRegistro }) {
  if (renglon.importeCentavos === null) return <span className="text-texto-sutil">—</span>;
  return (
    <Dinero
      centavos={renglon.importeCentavos}
      tamano="sm"
      conSigno={renglon.tipo === 'caja'}
      className={renglon.cancelada ? 'line-through' : ''}
    />
  );
}

/**
 * El tono de la fila, y NUNCA solo: la celda dice «sin explicación» o «cancelada».
 * Lo que hay que preguntar hoy gana sobre la cancelación que sí tiene firma.
 */
function tonoDe(renglon: RenglonDeRegistro): TonoDeFila | undefined {
  if (renglon.sinExplicacion) return 'peligro';
  if (renglon.cancelada) return 'advertencia';
  return undefined;
}

/** Cargando: la forma de la tabla que viene —hora, tipo, qué pasó, importe—. */
function EsqueletoDeRegistros() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Leyendo los registros del día"
      className="flex flex-col rounded-lg border border-borde"
    >
      <div className="flex items-center gap-(--espacio-4) bg-fondo-sutil px-(--espacio-3) py-(--espacio-2)">
        <Esqueleto className="h-3 w-10" />
        <Esqueleto className="hidden h-3 w-16 sm:block" />
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="ml-auto h-3 w-16" />
      </div>
      {Array.from({ length: 8 }, (_, indice) => (
        <div
          key={indice}
          className="flex items-center gap-(--espacio-4) border-t border-borde px-(--espacio-3) py-(--espacio-2)"
        >
          <Esqueleto className="h-4 w-10" />
          <Esqueleto className="hidden h-4 w-20 sm:block" />
          <Esqueleto className="h-4 flex-1" />
          <Esqueleto className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function Registros({
  dia,
  ventasIniciales,
  movimientosIniciales,
  inventarioInicial,
}: RegistrosProps) {
  const voc = useVocabulario();
  const [fecha, setFecha] = useState(dia ?? '');
  const [tipo, setTipo] = useState<Tipo>('todo');
  const [ventas, setVentas] = useState<readonly VentaRegistrada[] | null>(ventasIniciales ?? null);
  const [movimientos, setMovimientos] = useState<readonly MovimientoRegistrado[] | null>(
    movimientosIniciales ?? null,
  );
  const [inventario, setInventario] = useState<readonly MovimientoDeInventario[] | null>(
    inventarioInicial ?? null,
  );
  /** Lo que no se pudo leer. Una lista vacía por un 400 diría «no pasó nada», y mentiría. */
  const [fallo, setFallo] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  const [intento, setIntento] = useState(0);
  const conTodoInicial =
    ventasIniciales !== undefined &&
    movimientosIniciales !== undefined &&
    inventarioInicial !== undefined;

  useEffect(() => {
    if (dia !== undefined || fecha !== '') return;
    // El día de hoy se lee en un efecto: un reloj leído durante el render es un
    // desajuste de hidratación garantizado. Y en un `setTimeout`: escribir
    // estado de forma síncrona aquí encadena renders.
    const arranque = setTimeout(() => {
      setFecha(hoyEnHoraLocal());
    });
    return () => {
      clearTimeout(arranque);
    };
  }, [dia, fecha]);

  useEffect(() => {
    if (fecha === '') return;
    if (
      ventasIniciales !== undefined &&
      movimientosIniciales !== undefined &&
      inventarioInicial !== undefined
    ) {
      return;
    }
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    /**
     * EL DÍA, como RANGO y con el campo de fecha de CADA entidad.
     *
     * Aquí decía `const filtro = { fecha }` y se pasaba igual a las tres. `fecha` no
     * es un campo de ninguna: el puente contestaba 400 ««fecha» no es un campo de
     * Venta» y los tres `.catch` de abajo lo convertían en tres listas vacías. La
     * pantalla se veía impecable —«no hubo movimientos ese día»— y estaba mintiendo
     * sobre el día entero, que es lo único que existe para contar. Es el mismo
     * defecto que la agenda del salón tuvo con `Cita`, y se arregla igual: por rango.
     *
     * Por lo mismo, un `.catch` ya no deja la lista vacía: pinta el error, y el
     * vacío queda para el día que de verdad no tuvo nada.
     *
     * Cada entidad nombra su fecha a su manera y hay que respetarlo: `Venta` y
     * `MovimientoInventario` sirven `created_date`; `MovimientoCaja`, `created_at`.
     *
     * Los dos extremos se arman en hora LOCAL y viajan en ISO. `new Date('2026-09-20')`
     * a secas es medianoche UTC, que en México deja fuera las seis primeras horas del
     * día y mete las seis últimas del anterior: la venta de las 21:00 aparecería en el
     * día siguiente, que es justo la clase de error que nadie nota hasta que el corte
     * no cuadra.
     */
    const delDia = (campo: string): { campo: string; desde: string; hasta: string } => ({
      campo,
      desde: new Date(`${fecha}T00:00:00`).toISOString(),
      hasta: new Date(`${fecha}T23:59:59.999`).toISOString(),
    });

    const cargar = (): void => {
      consultarPuente<VentaRegistrada>('Venta', {
        rango: delDia('created_date'),
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setVentas(filas);
        })
        .catch((error: unknown) => {
          if (sigueMontada()) setFallo(mensajeDe(error, 'No se pudieron leer las ventas.'));
        });
      consultarPuente<MovimientoRegistrado>('MovimientoCaja', {
        rango: delDia('created_at'),
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setMovimientos(filas);
        })
        .catch((error: unknown) => {
          if (sigueMontada())
            setFallo(mensajeDe(error, 'No se pudieron leer los movimientos de caja.'));
        });
      consultarPuente<MovimientoDeInventario>('MovimientoInventario', {
        rango: delDia('created_date'),
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setInventario(filas);
        })
        .catch((error: unknown) => {
          if (sigueMontada())
            setFallo(mensajeDe(error, 'No se pudieron leer los movimientos de inventario.'));
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [fecha, ventasIniciales, movimientosIniciales, inventarioInicial, intento]);

  /**
   * Se limpia EN EL GESTO, no en el efecto: al cambiar de día lo del día anterior no
   * se queda en pantalla con la fecha nueva encima, que es leer un día por otro.
   */
  function olvidarLoLeido(): void {
    setFallo(null);
    if (conTodoInicial) return;
    setVentas(null);
    setMovimientos(null);
    setInventario(null);
  }

  function volverALeer(): void {
    olvidarLoLeido();
    setIntento((previo) => previo + 1);
  }

  const nombreDeVenta = voc.titulo('orden') === '' ? 'Venta' : voc.titulo('orden');
  const nombreDelProducto = voc.singular('producto') === '' ? 'producto' : voc.singular('producto');
  const ventasEnFrase =
    voc.enFrase('orden', true) === '' ? 'las ventas' : voc.enFrase('orden', true);

  const cargando = ventas === null || movimientos === null || inventario === null;
  const linea = cargando
    ? []
    : componerLinea(ventas, movimientos, inventario, nombreDeVenta, nombreDelProducto);
  const visibles = tipo === 'todo' ? linea : linea.filter((r) => r.tipo === tipo);
  const porPreguntar = linea.filter((r) => r.sinExplicacion).length;

  function etiquetaDe(opcion: (typeof TIPOS)[number]): string {
    return 'voz' in opcion && voc.titulo(opcion.voz, true) !== ''
      ? voc.titulo(opcion.voz, true)
      : opcion.etiqueta;
  }

  function cuantosDe(clave: Tipo): number {
    return clave === 'todo' ? linea.length : linea.filter((r) => r.tipo === clave).length;
  }

  /** La palabra de cada fuente en su columna: «Venta» la pone el giro. */
  function nombreDeOrigen(origen: Origen): string {
    if (origen === 'venta') return nombreDeVenta;
    return origen === 'caja' ? 'Caja' : 'Inventario';
  }

  const columnas: readonly ColumnaDeTabla<RenglonDeRegistro>[] = [
    {
      clave: 'hora',
      titulo: 'Hora',
      // Ordenable: de lo más reciente a lo más viejo por omisión, y al revés para
      // leer el día como pasó.
      orden: (r) => r.hora,
      celda: (r) => <span className="font-numeros text-texto-sutil tabular-nums">{r.hora}</span>,
    },
    {
      clave: 'tipo',
      titulo: 'Tipo',
      desde: 'sm',
      celda: (r) => (
        <span className="inline-flex items-center gap-(--espacio-2) whitespace-nowrap text-texto-sutil">
          {ICONOS[r.tipo]}
          {nombreDeOrigen(r.tipo)}
        </span>
      ),
    },
    {
      clave: 'que',
      titulo: 'Qué pasó',
      celda: (r) => (
        <span className="flex flex-col gap-(--espacio-1)">
          <span className="flex flex-wrap items-center gap-x-(--espacio-2)">
            <span className="inline-block font-medium first-letter:uppercase">{r.titulo}</span>
            {r.sinExplicacion && (
              <span className="inline-flex items-center gap-(--espacio-1) text-xs font-semibold text-peligro">
                <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                sin explicación
              </span>
            )}
          </span>
          {/* En el teléfono el detalle no cabe en su columna: va aquí, chico. */}
          <span className="text-xs text-texto-sutil md:hidden">
            <span className="sm:hidden">{nombreDeOrigen(r.tipo)} · </span>
            <Detalle renglon={r} tamano="xs" />
          </span>
        </span>
      ),
    },
    {
      clave: 'detalle',
      titulo: 'Detalle',
      desde: 'md',
      celda: (r) => (
        <span className="text-texto-sutil">
          <Detalle renglon={r} tamano="sm" />
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (r) => <Importe renglon={r} />,
    },
  ];

  const vacio =
    linea.length === 0 ? (
      <Vacio
        icono={<CalendarX />}
        titulo="Ese día no tiene movimientos."
        explicacion={`Aquí salen, en orden, ${ventasEnFrase}, los movimientos de caja y los de inventario de ese día. Elige otro día arriba.`}
      />
    ) : (
      <Vacio
        icono={<ListFilter />}
        titulo="Ese día no tiene movimientos de este tipo."
        accion={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTipo('todo');
            }}
          >
            Ver todo
          </Button>
        }
      />
    );

  const contenido = (() => {
    if (fallo !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudo leer lo que pasó ese día."
          queHacer="Sin eso, esta lista diría que no pasó nada, y no sería cierto. Revisa la conexión y vuelve a leerlo: desde aquí no se cambia nada."
          detalle={fallo}
          reintentar={
            <Button type="button" onClick={volverALeer}>
              Volver a leer
            </Button>
          }
        />
      );
    }
    // La forma de la tabla, nunca una rueda: el ojo ya sabe dónde va a mirar.
    if (cargando) return <EsqueletoDeRegistros />;
    return (
      <Tabla
        etiqueta="Registros del día"
        columnas={columnas}
        filas={visibles}
        claveDe={(r) => r.id}
        tonoDeFila={tonoDe}
        alto="max-h-[70vh]"
        vacio={vacio}
      />
    );
  })();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-4) md:p-(--espacio-6)">
      <header className="flex flex-wrap items-end justify-between gap-(--espacio-4)">
        <div>
          <h1 className="text-2xl font-semibold">Registros</h1>
          <p className="text-sm text-texto-sutil">Qué pasó, en orden y en una sola lista.</p>
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="dia">Día</Label>
          <Input
            id="dia"
            type="date"
            className="h-[calc(var(--altura-control)*1.2)] w-48 font-numeros tabular-nums"
            value={fecha}
            onChange={(evento) => {
              olvidarLoLeido();
              setFecha(evento.target.value);
            }}
          />
        </div>
      </header>

      {/* Un control segmentado: se elige UNO, y cada uno dice cuántos hay ese día. Del
          alto de control por omisión y no `sm`: con 4 px entre uno y otro, sólo el
          tamaño los deja en el área táctil del sistema, y el dueño lo abre en el
          teléfono. */}
      <Superficie
        role="group"
        aria-label="Qué enseñar"
        nivel={0}
        radio="md"
        relleno={0}
        className="flex w-fit flex-wrap gap-(--espacio-1) bg-fondo-sutil p-(--espacio-1)"
      >
        {TIPOS.map((opcion) => {
          const elegida = tipo === opcion.clave;
          return (
            <Button
              key={opcion.clave}
              type="button"
              aria-pressed={elegida}
              variant={elegida ? 'default' : 'ghost'}
              onClick={() => {
                setTipo(opcion.clave);
              }}
            >
              {etiquetaDe(opcion)}
              {cargando || fallo !== null ? null : (
                <span
                  className={`font-numeros text-xs tabular-nums ${elegida ? '' : 'text-texto-sutil'}`}
                >
                  {cuantosDe(opcion.clave)}
                </span>
              )}
            </Button>
          );
        })}
      </Superficie>

      {porPreguntar > 0 && fallo === null && (
        <Aviso
          tono="atencion"
          titulo={`Hay ${String(porPreguntar)} movimiento${porPreguntar === 1 ? '' : 's'} sin explicación.`}
        >
          Es lo que hay que preguntar hoy, no mañana.
        </Aviso>
      )}

      {contenido}
    </main>
  );
}
