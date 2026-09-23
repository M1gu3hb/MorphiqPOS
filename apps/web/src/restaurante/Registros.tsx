'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  EsqueletoDeLista,
  Superficie,
  TablaAdaptable,
  VIAJE,
  Vacio,
  conTransicion,
  dineroEnTexto,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { CalendarSearch, Download, FileSpreadsheet, Search, X } from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · registros
 *
 * El archivo del negocio: 3-10 veces al día, dueño y administrador. Nadie entra
 * aquí a mirar; se entra a CONTESTAR una pregunta concreta sobre algo que ya
 * pasó, y se sale en cuanto está contestada.
 *
 * ── Por qué el periodo manda sobre todo lo demás ─────────────────────────
 * Porque la pregunta nunca es «los cortes»: es «el corte DEL SÁBADO». El
 * periodo va arriba, siempre visible y en botones, no escondido tras un menú
 * que cuesta dos clics — una acción principal que cuesta dos clics deja de
 * hacerse. Y cambiar de pestaña NO lo reinicia: la misma pregunta se repite
 * sobre el mismo rango mirando otro dato.
 *
 * ── Por qué el importe del periodo es lo más grande ──────────────────────
 * Porque ES la respuesta. El resumen va en su propia superficie, con el
 * buscador al lado: es lo primero que se ve (`04-INTERFAZ`, «Registros»), y el
 * mismo total vuelve a estar al pie de su columna, donde el ojo lo busca.
 *
 * ── Por qué Cortes va primero y no Ventas ────────────────────────────────
 * Porque «¿cuánto vendí?» ya lo contesta el tablero. Aquí la unidad de consulta
 * de este negocio es el corte, y ponerlo segundo le cobraría un clic a la
 * pregunta más frecuente, varias veces al día.
 *
 * ── PC, tableta y teléfono ───────────────────────────────────────────────
 * En PC la tabla es densa, de cabecera fija, con TODAS sus columnas. En la
 * tableta —el dispositivo del modelo— caben menos: las secundarias salen al
 * pedir «Ver más», y la fila se convierte en una hoja de detalle anclada abajo
 * (`VIAJE.fila`), que no empuja nada de lo que está bajo el dedo. En teléfono
 * son tarjetas, y cuatro pestañas desaparecen: nadie audita compras en 375 px.
 * Encogerlas sería fingir que se pueden leer.
 *
 * ── Recortado, para que el archivo quepa ─────────────────────────────────
 * · El puente sólo filtra por IGUALDAD, así que el rango NO viaja al servidor:
 *   se lee una ventana de las filas más recientes y el periodo se aplica aquí.
 *   Pasada esa ventana faltarían las más viejas del rango, y por eso hay un
 *   aviso — un total corto sin decirlo es peor que no dar el total.
 * · Propinas enseña el historial de liquidaciones con folio. El filtro
 *   pendientes/liquidadas y el total por mesero piden cruzar `Venta` con
 *   `LiquidacionPropina`: es otra lectura entera y no cabe en este archivo.
 */

/** Una fila cruda del puente. Cada pestaña lee otra entidad: por eso genérica. */
type Registro = Readonly<Record<string, unknown>>;

interface Columna {
  readonly campo: string;
  readonly rotulo: string;
  /**
   * La entidad del diccionario cuando el rótulo es una palabra del GIRO.
   *
   * «Mesero» y «Mesa» no son rótulos: son el vocabulario de un restaurante, y en
   * una estética se leen «Estilista» y «Estación». Escritos a mano, esta pantalla
   * —que es de las cinco plantillas, no sólo del restaurante— hablaría de mesas en
   * un salón. El `rotulo` se queda como reserva para cuando el diccionario apaga
   * esa entidad en un giro.
   */
  readonly voz?:
    'unidad_servicio' | 'orden' | 'linea_orden' | 'responsable' | 'cliente' | 'producto';
  readonly tipo: 'texto' | 'dinero' | 'fecha';
  /** En PC es una columna más; en tableta y teléfono sale al abrir la fila. */
  readonly secundaria?: boolean;
}

interface Pestana {
  readonly clave: string;
  readonly rotulo: string;
  readonly entidad: string;
  readonly campoFecha: string;
  readonly columnas: readonly Columna[];
}

/** Una fila con su clave ya resuelta: la tabla y la hoja hablan de la misma. */
interface FilaDeRegistro {
  readonly clave: string;
  readonly registro: Registro;
}

type Vocabulario = ReturnType<typeof useVocabulario>;

/**
 * El rótulo que se lee: el del diccionario cuando la columna lo declara.
 *
 * Si el giro APAGA esa entidad —un salón no tiene preparación— el diccionario
 * devuelve cadena vacía y se cae al rótulo escrito, que es mejor que una columna
 * sin encabezado.
 */
function rotuloDe(columna: Columna, voc: Vocabulario): string {
  if (columna.voz === undefined) return columna.rotulo;
  const suyo = voc.titulo(columna.voz);
  return suyo === '' ? columna.rotulo : suyo;
}

/** El orden es el del documento, y no es decorativo: ver arriba. */
const PESTANAS = [
  {
    clave: 'cortes',
    rotulo: 'Cortes',
    entidad: 'CorteCaja',
    campoFecha: 'fecha_cierre',
    columnas: [
      { campo: 'folio', rotulo: 'Folio', tipo: 'texto' },
      { campo: 'fecha_cierre', rotulo: 'Cerrado', tipo: 'fecha' },
      { campo: 'usuario_cajero_nombre', rotulo: 'Cajero', tipo: 'texto' },
      { campo: 'efectivo_contado', rotulo: 'Contado', tipo: 'dinero' },
      { campo: 'efectivo_inicial_contado', rotulo: 'Fondo', tipo: 'dinero', secundaria: true },
    ],
  },
  {
    clave: 'ventas',
    rotulo: 'Ventas',
    entidad: 'Venta',
    campoFecha: 'fecha_cierre',
    columnas: [
      { campo: 'folio', rotulo: 'Folio', tipo: 'texto' },
      { campo: 'fecha_cierre', rotulo: 'Cobrada', tipo: 'fecha' },
      { campo: 'usuario_mesero_nombre', rotulo: 'Mesero', voz: 'responsable', tipo: 'texto' },
      { campo: 'total', rotulo: 'Total', tipo: 'dinero' },
      {
        campo: 'mesa_numero',
        rotulo: 'Mesa',
        voz: 'unidad_servicio',
        tipo: 'texto',
        secundaria: true,
      },
    ],
  },
  {
    clave: 'propinas',
    rotulo: 'Propinas',
    entidad: 'LiquidacionPropina',
    campoFecha: 'fecha_liquidacion',
    columnas: [
      { campo: 'folio', rotulo: 'Folio', tipo: 'texto' },
      { campo: 'fecha_liquidacion', rotulo: 'Liquidada', tipo: 'fecha' },
      { campo: 'mesero_nombre', rotulo: 'Mesero', voz: 'responsable', tipo: 'texto' },
      { campo: 'total_liquidado', rotulo: 'Liquidado', tipo: 'dinero' },
      { campo: 'usuario_liquido_nombre', rotulo: 'Autorizó', tipo: 'texto', secundaria: true },
    ],
  },
  {
    clave: 'compras',
    rotulo: 'Compras',
    entidad: 'CompraInsumo',
    campoFecha: 'fecha',
    columnas: [
      { campo: 'factura_folio', rotulo: 'Factura', tipo: 'texto' },
      { campo: 'fecha', rotulo: 'Fecha', tipo: 'fecha' },
      { campo: 'proveedor_nombre', rotulo: 'Proveedor', tipo: 'texto' },
      { campo: 'total_compra', rotulo: 'Total', tipo: 'dinero' },
      { campo: 'metodo_pago', rotulo: 'Pago', tipo: 'texto', secundaria: true },
    ],
  },
  {
    clave: 'movimientos',
    rotulo: 'Movimientos',
    entidad: 'MovimientoCuenta',
    campoFecha: 'created_date',
    columnas: [
      { campo: 'created_date', rotulo: 'Cuándo', tipo: 'fecha' },
      { campo: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { campo: 'motivo', rotulo: 'Motivo', tipo: 'texto' },
      { campo: 'usuario_nombre', rotulo: 'Quién', tipo: 'texto', secundaria: true },
    ],
  },
  {
    clave: 'gastos',
    rotulo: 'Gastos',
    entidad: 'GastoOperativo',
    campoFecha: 'fecha',
    columnas: [
      { campo: 'fecha', rotulo: 'Fecha', tipo: 'fecha' },
      { campo: 'categoria', rotulo: 'Categoría', tipo: 'texto' },
      { campo: 'descripcion', rotulo: 'Descripción', tipo: 'texto' },
      { campo: 'monto', rotulo: 'Monto', tipo: 'dinero' },
      { campo: 'metodo_pago', rotulo: 'Pago', tipo: 'texto', secundaria: true },
    ],
  },
] as const satisfies readonly Pestana[];

/** Cuántas pestañas sobreviven al teléfono, contando desde la primera. */
const EN_TELEFONO = 2;
const VENTANA = 300;
const MS_DIA = 86_400_000;
const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });
/** Desde este ancho (`xl`) la tabla enseña TODAS sus columnas y la fila ya no se abre. */
const ANCHO_DE_PC = '(min-width: 1280px)';
/** El `id` de la hoja de detalle, para el `aria-controls` del botón que la abre. */
const HOJA = 'registro-abierto';

const PERIODOS = [
  { clave: 'hoy', rotulo: 'Hoy' },
  { clave: '7d', rotulo: '7 días' },
  { clave: '30d', rotulo: '30 días' },
  { clave: 'mes', rotulo: 'Este mes' },
  { clave: 'anio', rotulo: 'Este año' },
  { clave: 'personalizado', rotulo: 'Personalizado' },
];

/** El rango vivo del periodo, en milisegundos. `hasta` incluye el día escrito. */
export function rangoDe(clave: string, desde: string, hasta: string): readonly [number, number] {
  const hoy = new Date();
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const fin = Date.now();
  if (clave === 'hoy') return [dia, fin];
  if (clave === '7d') return [dia - 6 * MS_DIA, fin];
  if (clave === '30d') return [dia - 29 * MS_DIA, fin];
  if (clave === 'mes') return [new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime(), fin];
  if (clave === 'anio') return [new Date(hoy.getFullYear(), 0, 1).getTime(), fin];
  const inicio = Date.parse(desde);
  const tope = Date.parse(hasta);
  return [Number.isNaN(inicio) ? dia : inicio, Number.isNaN(tope) ? fin : tope + MS_DIA];
}

/** ¿La pantalla está en PC? Sin ancho que medir —servidor, primer pintado— se asume que sí. */
function suscribirAlAncho(avisar: () => void): () => void {
  const medio = window.matchMedia(ANCHO_DE_PC);
  medio.addEventListener('change', avisar);
  return () => {
    medio.removeEventListener('change', avisar);
  };
}

function useEsPc(): boolean {
  return useSyncExternalStore(
    suscribirAlAncho,
    () => window.matchMedia(ANCHO_DE_PC).matches,
    () => true,
  );
}

/**
 * Lo que trae el puente es `unknown`: puede ser un objeto anidado, y de esos
 * `String(...)` saca «[object Object]» sin quejarse. Un registro con esa
 * cadena en una columna es un dato perdido que además parece un dato.
 */
function comoTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint' || typeof valor === 'boolean') {
    return String(valor);
  }
  return null;
}

/**
 * El puente trae los importes en PESOS; la pantalla trabaja en centavos enteros.
 * Se cuentan dígitos y no se multiplica: `58.995 * 100` pierde medio centavo.
 */
function aCentavos(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const importe = Number(valor);
  if (!Number.isFinite(importe)) return null;
  const [entero = '0', decimal = '00'] = Math.abs(importe).toFixed(2).split('.');
  return (importe < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/**
 * La celda como TEXTO: lo que se lee en una columna de texto o de fecha, y lo que
 * el buscador compara. Nunca en blanco: un hueco no dice si falta o es cero. El
 * importe sale aquí sólo para que «1,250» encuentre su fila; en pantalla un
 * importe es `<Dinero>` (ver `pintarCelda`).
 */
export function celda(fila: Registro, columna: Columna): string {
  const valor = fila[columna.campo];
  if (valor === null || valor === undefined || valor === '') return '—';
  if (columna.tipo === 'dinero') {
    const centavos = aCentavos(valor);
    return centavos === null ? '—' : dineroEnTexto(centavos);
  }
  const texto = comoTexto(valor);
  // Ni «[object Object]» ni una cadena vacía: la raya dice «aquí no hay nada
  // legible», que es exactamente lo que pasa.
  if (texto === null) return '—';
  if (columna.tipo === 'fecha') {
    const instante = Date.parse(texto);
    return Number.isNaN(instante) ? texto : FECHA.format(instante);
  }
  return texto;
}

/** La celda en pantalla: el importe con `<Dinero>`, la fecha en cifras que no bailan. */
function pintarCelda(fila: Registro, columna: Columna): ReactNode {
  if (columna.tipo === 'dinero') {
    const centavos = aCentavos(fila[columna.campo]);
    return centavos === null ? '—' : <Dinero centavos={centavos} tamano="sm" />;
  }
  if (columna.tipo === 'fecha') {
    return (
      <span className="font-numeros whitespace-nowrap tabular-nums">{celda(fila, columna)}</span>
    );
  }
  return celda(fila, columna);
}

/** Con qué se ordena una columna: el importe en centavos, la fecha en su instante. */
function ordenDe(fila: Registro, columna: Columna): number {
  if (columna.tipo === 'dinero') return aCentavos(fila[columna.campo]) ?? 0;
  const instante = Date.parse(comoTexto(fila[columna.campo]) ?? '');
  return Number.isNaN(instante) ? 0 : instante;
}

/**
 * Las columnas de la pestaña. En PC, todas; fuera de la PC, las principales y el
 * botón que abre la fila, porque las secundarias no caben y salen en la hoja.
 */
function columnasDe(
  pestana: Pestana,
  voc: Vocabulario,
  esPc: boolean,
  detalle: (fila: FilaDeRegistro) => ReactNode,
): readonly ColumnaDeTabla<FilaDeRegistro>[] {
  const propias = pestana.columnas
    .filter((columna) => esPc || columna.secundaria !== true)
    .map((columna): ColumnaDeTabla<FilaDeRegistro> => ({
      clave: columna.campo,
      titulo: rotuloDe(columna, voc),
      numerica: columna.tipo === 'dinero',
      celda: (fila) => pintarCelda(fila.registro, columna),
      ...(columna.tipo === 'texto'
        ? {}
        : { orden: (fila: FilaDeRegistro) => ordenDe(fila.registro, columna) }),
    }));
  if (esPc) return propias;
  return [...propias, { clave: 'detalle', titulo: 'Detalle', celda: detalle }];
}

function textoDe(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/** Traduce el fallo a algo accionable. El límite NO es un código: es el 429. */
function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiadas consultas seguidas. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu rol no puede leer estos registros.';
    if (fallo.error.codigo === 'PAQUETE_NO_INCLUYE') return 'Tu paquete no incluye esta pestaña.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudieron leer los registros.';
}

export interface RegistrosProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly Registro[];
  readonly pestanaInicial?: string;
}

export function Registros({ filasIniciales, pestanaInicial }: RegistrosProps) {
  const voc = useVocabulario();
  const esPc = useEsPc();
  const [pestana, setPestana] = useState(pestanaInicial ?? 'cortes');
  const [periodo, setPeriodo] = useState('hoy');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filas, setFilas] = useState<readonly Registro[] | null>(filasIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [abierta, setAbierta] = useState<string | null>(null);
  /** La fila que está viajando a la hoja: sólo ella lleva el nombre del viaje. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [descarga, setDescarga] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [falloAlExportar, setFalloAlExportar] = useState<string | null>(null);

  const actual: Pestana = PESTANAS.find((p) => p.clave === pestana) ?? PESTANAS[0];
  const importe = actual.columnas.find((c) => c.tipo === 'dinero') ?? null;
  const [primera, ...resto] = actual.columnas;

  useEffect(() => {
    // Un centinela `let vivo` el compilador lo da por siempre-verdadero; el
    // aborto es un hecho del objeto, y además cancela la petición de verdad.
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    if (filasIniciales === undefined) {
      consultarPuente<Registro>(actual.entidad, { limite: VENTANA, signal: control.signal })
        .then((leidas) => {
          if (sigueMontada()) {
            setFilas(leidas);
            setError(null);
          }
        })
        .catch((fallo: unknown) => {
          // La pantalla NO se vacía por un fallo: quien audita prefiere el dato
          // de hace un minuto a una tabla en blanco que no sabe interpretar.
          if (sigueMontada()) setError(mensajeDe(fallo));
        });
    }
    return () => {
      control.abort();
    };
  }, [actual.entidad, filasIniciales, intento]);

  // Sin `useMemo` a mano: el compilador de React memoiza esto solo, y una
  // memoización escrita que él no puede conservar le hace saltarse el componente.
  const [desdeElPeriodo, hastaElPeriodo] = rangoDe(periodo, desde, hasta);
  const aguja = busqueda.trim().toLowerCase();
  const visibles = (filas ?? []).filter((fila) => {
    const instante = Date.parse(comoTexto(fila[actual.campoFecha]) ?? '');
    if (!Number.isNaN(instante) && (instante < desdeElPeriodo || instante > hastaElPeriodo))
      return false;
    if (aguja === '') return true;
    return actual.columnas
      .map((columna) => celda(fila, columna))
      .join(' ')
      .toLowerCase()
      .includes(aguja);
  });

  const filasVisibles = visibles.map((registro, indice): FilaDeRegistro => ({
    clave: textoDe(registro['id']) ?? String(indice),
    registro,
  }));

  /** La suma en CENTAVOS: sumar pesos con decimales acumula medio centavo por fila. */
  const suma =
    importe === null
      ? null
      : visibles.reduce((total, fila) => total + (aCentavos(fila[importe.campo]) ?? 0), 0);

  // En PC todo está a la vista: la hoja sólo existe donde las columnas no caben.
  const filaAbierta = esPc ? null : (filasVisibles.find((f) => f.clave === abierta) ?? null);

  const alCambiarPestana = (valor: string) => {
    setPestana(valor);
    setAbierta(null);
    setDescarga(null);
    setFalloAlExportar(null);
    setError(null);
    if (filasIniciales === undefined) setFilas(null);
  };

  const reintentar = () => {
    setError(null);
    setFilas(null);
    setIntento((previo) => previo + 1);
  };

  /**
   * La fila se convierte en la hoja. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma la HOJA, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrir(clave: string): void {
    flushSync(() => {
      setViajando(clave);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        setAbierta(clave);
      });
    });
  }

  /** El camino de vuelta: la hoja se recoge en su fila. */
  function cerrar(): void {
    const clave = abierta;
    if (clave === null) return;
    void conTransicion(() => {
      flushSync(() => {
        setAbierta(null);
        setViajando(clave);
      });
    }).finally(() => {
      setViajando(null);
    });
  }

  // Ruta por convención /api/<dominio>/<verbo>: el documento no la nombra. El
  // archivo llega como ENLACE y no como descarga sola porque una descarga que
  // el navegador bloquea en silencio se lee como «el botón no hizo nada».
  const alExportar = (formato: string) => () => {
    const [inicio, tope] = rangoDe(periodo, desde, hasta);
    setDescarga(null);
    setFalloAlExportar(null);
    setExportando(true);
    invocarComando<{ readonly url: string }>('/api/reportes/exportar', {
      entidad: actual.entidad,
      formato,
      desde: new Date(inicio).toISOString(),
      hasta: new Date(tope).toISOString(),
    })
      .then((respuesta) => {
        setDescarga(respuesta.url);
      })
      .catch((fallo: unknown) => {
        setFalloAlExportar(mensajeDe(fallo));
      })
      .finally(() => {
        setExportando(false);
      });
  };

  const botonDeDetalle = (fila: FilaDeRegistro): ReactNode => {
    const expandida = filaAbierta?.clave === fila.clave;
    return (
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={expandida}
        aria-controls={expandida ? HOJA : undefined}
        onClick={() => {
          if (expandida) cerrar();
          else abrir(fila.clave);
        }}
      >
        {expandida ? 'Ocultar' : 'Ver más'}
      </Button>
    );
  };

  const columnas = columnasDe(actual, voc, esPc, botonDeDetalle);
  const pie =
    importe === null || suma === null || primera === undefined
      ? undefined
      : { [primera.campo]: 'Total', [importe.campo]: <Dinero centavos={suma} tamano="sm" /> };

  let cuerpo: ReactNode;
  if (filas === null && error !== null) {
    // No leyó nada: se dice qué pasó y se ofrece volver a leer, sin perder el periodo.
    cuerpo = (
      <ErrorDePantalla
        titulo="No se pudo leer esta pestaña."
        queHacer="Vuelve a intentarlo: el periodo y la búsqueda se conservan."
        detalle={error}
        reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
      />
    );
  } else if (filas === null) {
    // Esqueletos con la forma de las filas, nunca un rehilete: la tabla no salta
    // al llegar el dato y el ojo ya sabe dónde va a caer cada cifra.
    cuerpo = <EsqueletoDeLista filas={8} />;
  } else if (filasVisibles.length === 0) {
    // El vacío ENSEÑA cuál es la palanca: casi siempre el periodo es muy corto.
    cuerpo = (
      <Superficie como="section" relleno={0}>
        <Vacio
          icono={<CalendarSearch />}
          titulo={`Sin ${actual.rotulo.toLowerCase()} en este periodo.`}
          explicacion="Aquí el periodo es lo que manda. Ábrelo y vuelve a preguntar."
          accion={
            <div className="flex flex-wrap justify-center gap-(--espacio-2)">
              <Button
                variant="secondary"
                onClick={() => {
                  setPeriodo('30d');
                }}
              >
                Ver 30 días
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPeriodo('anio');
                }}
              >
                Ver este año
              </Button>
            </div>
          }
        />
      </Superficie>
    );
  } else {
    // Tableta y PC comparten la MISMA tabla densa de cabecera fija; en teléfono,
    // la misma lista en tarjetas con el importe arriba. Se pinta una sola.
    cuerpo = (
      <TablaAdaptable
        etiqueta={`${actual.rotulo} del periodo`}
        desde="md"
        principal={importe?.campo ?? actual.campoFecha}
        columnas={columnas}
        filas={filasVisibles}
        claveDe={(fila) => fila.clave}
        alto="max-h-[70dvh]"
        viajeDeFila={(fila) => (fila.clave === viajando ? VIAJE.fila(fila.clave) : undefined)}
        {...(filaAbierta === null ? {} : { activa: filaAbierta.clave })}
        {...(pie === undefined ? {} : { pie })}
      />
    );
  }

  return (
    <main className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      {/* 1 · El periodo. Arriba, en botones y siempre visible: es LA acción. */}
      <header className="flex flex-col gap-(--espacio-3) lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold">Registros</h1>
        <nav aria-label="Periodo consultado" className="flex flex-wrap gap-(--espacio-1)">
          {PERIODOS.map((opcion) => (
            <Button
              key={opcion.clave}
              variant={periodo === opcion.clave ? 'default' : 'ghost'}
              aria-pressed={periodo === opcion.clave}
              onClick={() => {
                setPeriodo(opcion.clave);
              }}
            >
              {opcion.rotulo}
            </Button>
          ))}
        </nav>
      </header>

      {periodo === 'personalizado' && (
        <div className="flex flex-wrap items-end gap-(--espacio-3) lg:justify-end">
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="registros-desde">Desde</Label>
            <Input
              id="registros-desde"
              type="date"
              value={desde}
              onChange={(evento) => {
                setDesde(evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="registros-hasta">Hasta</Label>
            <Input
              id="registros-hasta"
              type="date"
              value={hasta}
              onChange={(evento) => {
                setHasta(evento.target.value);
              }}
            />
          </div>
        </div>
      )}

      {/* 2 · El resumen del periodo y el buscador universal, en la misma superficie. */}
      <Superficie
        como="section"
        aria-label="Resumen del periodo"
        className="flex flex-col gap-(--espacio-4) md:flex-row md:items-end md:justify-between"
      >
        <dl className="flex flex-wrap items-end gap-x-(--espacio-8) gap-y-(--espacio-3)">
          {suma !== null && importe !== null && (
            <div>
              <dt className="text-xs text-texto-sutil">{importe.rotulo}</dt>
              <dd>
                <Dinero centavos={suma} tamano="total" />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-texto-sutil">Registros</dt>
            <dd>
              <Cifra valor={visibles.length} tamano="lg" />
            </dd>
          </div>
        </dl>
        <div className="relative md:w-80">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            type="search"
            aria-label="Buscar dentro del periodo"
            placeholder="Folio, persona, concepto…"
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
            className="pl-(--espacio-8)"
          />
        </div>
      </Superficie>

      {/* 3 · Las pestañas. Las cuatro últimas no existen en teléfono. */}
      <Tabs value={pestana} onValueChange={alCambiarPestana} className="gap-(--espacio-3)">
        <div className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
          <TabsList className="max-w-full overflow-x-auto">
            {PESTANAS.map((opcion, indice) => (
              <TabsTrigger
                key={opcion.clave}
                value={opcion.clave}
                className={indice < EN_TELEFONO ? '' : 'hidden md:inline-flex'}
              >
                {opcion.rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
          {/*
            LOS DOS BOTÓNES QUE SIEMPRE FALLABAN, y eran los ÚNICOS de la pantalla.

            Decían «Exportar a Excel» y «Exportar a PDF», y el servidor contestaba a
            los dos lo mismo: `CONFIGURACION_INVALIDA · Ese formato no se exporta
            todavía. Hoy: csv.` El único formato que existe es CSV —`FORMATOS` de
            reportes tiene un solo elemento— y esta pantalla no lo ofrecía. Así que
            la única acción propia de «Registros» era pedir dos cosas imposibles: el
            contador pedía «mándame el mes» y la respuesta volvía a ser una captura
            de pantalla. Lo encontró el rastreador: 422 en las dos.
          */}
          <div className="flex flex-wrap items-center gap-(--espacio-2)">
            <Button size="sm" variant="outline" cargando={exportando} onClick={alExportar('csv')}>
              <FileSpreadsheet aria-hidden="true" />
              Exportar a CSV
            </Button>
            {descarga !== null && (
              <Button asChild size="sm" variant="secondary">
                <a href={descarga}>
                  <Download aria-hidden="true" />
                  Descargar el archivo listo
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Un solo panel, el de la pestaña viva: seis paneles serían seis
            lecturas montadas a la vez para enseñar una. */}
        <TabsContent value={pestana} className="flex flex-col gap-(--espacio-3)">
          {falloAlExportar !== null && (
            <Aviso tono="peligro" titulo={falloAlExportar}>
              No se generó ningún archivo.
            </Aviso>
          )}
          {error !== null && filas !== null && (
            <Aviso tono="peligro" titulo={error}>
              Se muestra el último dato conocido.
            </Aviso>
          )}
          {filas !== null && filas.length >= VENTANA && (
            <Aviso
              tono="atencion"
              titulo={`Se leyeron los ${String(VENTANA)} registros más recientes.`}
            >
              Un periodo largo puede dejar fuera los más antiguos.
            </Aviso>
          )}
          {cuerpo}
        </TabsContent>
      </Tabs>

      {/* La hoja de la fila abierta: anclada abajo, no empuja la tabla que se toca. */}
      {filaAbierta !== null && primera !== undefined && (
        <Superficie
          como="aside"
          id={HOJA}
          nivel={3}
          aria-label={`${rotuloDe(primera, voc)} ${celda(filaAbierta.registro, primera)}`}
          style={{ viewTransitionName: VIAJE.fila(filaAbierta.clave) }}
          className="fixed inset-x-(--espacio-3) bottom-(--espacio-3) z-20 mx-auto flex max-h-[60dvh] max-w-xl flex-col gap-(--espacio-3) overflow-y-auto"
        >
          <header className="flex items-start justify-between gap-(--espacio-3)">
            <div>
              <p className="text-xs text-texto-sutil uppercase">{rotuloDe(primera, voc)}</p>
              <h2 className="text-xl font-semibold">
                {pintarCelda(filaAbierta.registro, primera)}
              </h2>
            </div>
            <Button size="icon-sm" variant="ghost" aria-label="Cerrar el detalle" onClick={cerrar}>
              <X />
            </Button>
          </header>
          <dl className="grid grid-cols-[auto_1fr] gap-x-(--espacio-4) gap-y-(--espacio-2) text-sm">
            {resto.map((columna) => (
              <Fragment key={columna.campo}>
                <dt className="text-texto-sutil">{rotuloDe(columna, voc)}</dt>
                <dd className="text-right">{pintarCelda(filaAbierta.registro, columna)}</dd>
              </Fragment>
            ))}
          </dl>
        </Superficie>
      )}
    </main>
  );
}
