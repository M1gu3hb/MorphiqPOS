'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { Vacio } from '@morphiqpos/ui/sistema';
import { CalendarSearch, TriangleAlert } from 'lucide-react';
import { Fragment, type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

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
 * ── Por qué Cortes va primero y no Ventas ────────────────────────────────
 * Porque «¿cuánto vendí?» ya lo contesta el tablero. Aquí la unidad de consulta
 * de este negocio es el corte, y ponerlo segundo le cobraría un clic a la
 * pregunta más frecuente, varias veces al día.
 *
 * ── Por qué en teléfono desaparecen cuatro pestañas ──────────────────────
 * Porque nadie audita compras en 375 px. Las dos primeras se quedan; las otras
 * cuatro no se encogen: se esconden. Encogerlas sería fingir que se pueden leer
 * y hacer perder el viaje a quien lo intente.
 *
 * ── Recortado, para que el archivo quepa en 300 líneas ───────────────────
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
  /** En PC es una columna más; en tablet y teléfono sale al expandir la fila. */
  readonly secundaria?: boolean;
}

interface Pestana {
  readonly clave: string;
  readonly rotulo: string;
  readonly entidad: string;
  readonly campoFecha: string;
  readonly columnas: readonly Columna[];
}

/**
 * El rótulo que se lee: el del diccionario cuando la columna lo declara.
 *
 * Si el giro APAGA esa entidad —un salón no tiene preparación— el diccionario
 * devuelve cadena vacía y se cae al rótulo escrito, que es mejor que una columna
 * sin encabezado.
 */
function rotuloDe(columna: Columna, voc: ReturnType<typeof useVocabulario>): string {
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
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const FECHA = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

const PERIODOS = [
  { clave: 'hoy', rotulo: 'Hoy' },
  { clave: '7d', rotulo: '7 días' },
  { clave: '30d', rotulo: '30 días' },
  { clave: 'mes', rotulo: 'Este mes' },
  { clave: 'anio', rotulo: 'Este año' },
  { clave: 'personalizado', rotulo: 'Personalizado' },
];

const TABLA = 'hidden max-h-[70dvh] overflow-auto rounded-lg border border-border md:block';
const SOLO_PC = 'hidden xl:table-cell';
const TARJETA = 'rounded-lg border border-border bg-card p-3 text-card-foreground shadow-1';
const BANDA = 'mb-3 rounded-md border border-destructive bg-destructive/15 p-2 text-sm';
const AVISO = 'mb-3 rounded-md border border-border bg-warning/15 p-2 text-sm';

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

/** Lo que se lee en la celda. Nunca en blanco: un hueco no dice si falta o es cero. */
export function celda(fila: Registro, columna: Columna): string {
  const valor = fila[columna.campo];
  if (valor === null || valor === undefined || valor === '') return '—';
  if (columna.tipo === 'dinero') return PESOS.format(Number(valor));
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
  const [pestana, setPestana] = useState(pestanaInicial ?? 'cortes');
  const [periodo, setPeriodo] = useState('hoy');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filas, setFilas] = useState<readonly Registro[] | null>(filasIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [descarga, setDescarga] = useState<string | null>(null);

  const actual: Pestana = PESTANAS.find((p) => p.clave === pestana) ?? PESTANAS[0];
  const importe = actual.columnas.find((c) => c.tipo === 'dinero') ?? null;

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
  }, [actual.entidad, filasIniciales]);

  const visibles = useMemo(() => {
    const [inicio, tope] = rangoDe(periodo, desde, hasta);
    const aguja = busqueda.trim().toLowerCase();
    return (filas ?? []).filter((fila) => {
      const instante = Date.parse(comoTexto(fila[actual.campoFecha]) ?? '');
      if (!Number.isNaN(instante) && (instante < inicio || instante > tope)) return false;
      if (aguja === '') return true;
      return actual.columnas
        .map((columna) => celda(fila, columna))
        .join(' ')
        .toLowerCase()
        .includes(aguja);
    });
  }, [filas, periodo, desde, hasta, busqueda, actual]);

  const suma = useMemo(() => {
    if (importe === null) return null;
    return visibles.reduce((total, fila) => total + Number(fila[importe.campo] ?? 0), 0);
  }, [visibles, importe]);

  const alCambiarPestana = (valor: string) => {
    setPestana(valor);
    setAbierta(null);
    setDescarga(null);
    if (filasIniciales === undefined) setFilas(null);
  };

  const alBuscar = (evento: ChangeEvent<HTMLInputElement>) => {
    setBusqueda(evento.target.value);
  };

  // Ruta por convención /api/<dominio>/<verbo>: el documento no la nombra. El
  // archivo llega como ENLACE y no como descarga sola porque una descarga que
  // el navegador bloquea en silencio se lee como «el botón no hizo nada».
  const alExportar = (formato: string) => () => {
    const [inicio, tope] = rangoDe(periodo, desde, hasta);
    setDescarga(null);
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
        setError(mensajeDe(fallo));
      });
  };

  const principales = actual.columnas.filter((columna) => columna.secundaria !== true);
  const secundarias = actual.columnas.filter((columna) => columna.secundaria === true);

  let cuerpo: ReactNode;
  if (filas === null) {
    // Esqueletos con la forma de las filas, nunca un rehilete: la tabla no salta
    // al llegar el dato y el ojo ya sabe dónde va a caer cada cifra.
    cuerpo = (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg md:h-[var(--altura-control)]" />
        ))}
      </div>
    );
  } else if (visibles.length === 0) {
    // El vacío ENSEÑA cuál es la palanca: casi siempre el periodo es muy corto.
    cuerpo = (
      <section className={TARJETA}>
        <Vacio
          className="py-(--espacio-6)"
          icono={<CalendarSearch />}
          titulo={`Sin ${actual.rotulo.toLowerCase()} en este periodo.`}
          explicacion="Aquí el periodo es lo que manda. Ábrelo y vuelve a preguntar."
        />
        <div className="mt-3 flex flex-wrap justify-center gap-2">
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
      </section>
    );
  } else {
    cuerpo = (
      <>
        {/* Tablet y PC comparten la MISMA tabla densa de cabecera fija. En
            tablet las columnas secundarias se esconden y salen al expandir. */}
        <div className={TABLA}>
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                {principales.map((columna) => (
                  <TableHead key={columna.campo}>{rotuloDe(columna, voc)}</TableHead>
                ))}
                {secundarias.map((columna) => (
                  <TableHead key={columna.campo} className={SOLO_PC}>
                    {columna.rotulo}
                  </TableHead>
                ))}
                <TableHead className="xl:hidden">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((fila, indice) => {
                const clave = textoDe(fila['id']) ?? String(indice);
                const expandida = abierta === clave;
                return (
                  <Fragment key={clave}>
                    <TableRow>
                      {principales.map((columna) => (
                        <TableCell key={columna.campo}>{celda(fila, columna)}</TableCell>
                      ))}
                      {secundarias.map((columna) => (
                        <TableCell key={columna.campo} className={SOLO_PC}>
                          {celda(fila, columna)}
                        </TableCell>
                      ))}
                      <TableCell className="xl:hidden">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={expandida}
                          onClick={() => {
                            setAbierta(expandida ? null : clave);
                          }}
                        >
                          {expandida ? 'Ocultar' : 'Ver más'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandida && (
                      <TableRow className="xl:hidden">
                        <TableCell colSpan={principales.length + 1}>
                          <dl className="grid grid-cols-2 gap-1 text-sm">
                            {secundarias.map((columna) => (
                              <Fragment key={columna.campo}>
                                <dt className="text-muted-foreground">{rotuloDe(columna, voc)}</dt>
                                <dd>{celda(fila, columna)}</dd>
                              </Fragment>
                            ))}
                          </dl>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Teléfono: tarjetas. Cinco columnas en 375 px se leen girando el
            aparato, y nadie gira el teléfono para auditar un corte. */}
        <ul className="flex flex-col gap-2 md:hidden">
          {visibles.map((fila, indice) => (
            <li key={textoDe(fila['id']) ?? String(indice)} className={TARJETA}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {principales.map((columna) => (
                  <Fragment key={columna.campo}>
                    <dt className="text-muted-foreground">{rotuloDe(columna, voc)}</dt>
                    <dd className={columna.tipo === 'dinero' ? 'font-bold tabular-nums' : ''}>
                      {celda(fila, columna)}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold">Registros</h1>

      {/* 1 · El periodo. Arriba, en botones y siempre visible: es LA acción. */}
      <nav aria-label="Periodo consultado" className="mt-3 flex flex-wrap gap-1">
        {PERIODOS.map((opcion) => (
          <Button
            key={opcion.clave}
            size="sm"
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

      {periodo === 'personalizado' && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="registros-desde" className="block text-sm font-medium">
              Desde
            </label>
            <Input
              id="registros-desde"
              type="date"
              value={desde}
              onChange={(evento) => {
                setDesde(evento.target.value);
              }}
            />
          </div>
          <div>
            <label htmlFor="registros-hasta" className="block text-sm font-medium">
              Hasta
            </label>
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

      {/* 2 · El resumen del periodo y el buscador universal, en la misma línea. */}
      <section className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <dl className="flex items-center gap-6">
          <div>
            <dt className="text-xs text-muted-foreground">Registros</dt>
            <dd className="text-xl font-bold tabular-nums">{String(visibles.length)}</dd>
          </div>
          {suma !== null && importe !== null && (
            <div>
              <dt className="text-xs text-muted-foreground">{importe.rotulo}</dt>
              <dd className="text-xl font-bold tabular-nums">{PESOS.format(suma)}</dd>
            </div>
          )}
        </dl>
        <Input
          type="search"
          aria-label="Buscar dentro del periodo"
          placeholder="Folio, persona, concepto…"
          value={busqueda}
          onChange={alBuscar}
          className="md:max-w-xs"
        />
      </section>

      {/* 3 · Las pestañas. Las cuatro últimas no existen en teléfono. */}
      <Tabs value={pestana} onValueChange={alCambiarPestana} className="mt-4">
        <TabsList className="overflow-x-auto">
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

        {/* Un solo panel, el de la pestaña viva: seis paneles serían seis
            lecturas montadas a la vez para enseñar una. */}
        <TabsContent value={pestana} className="mt-3">
          {error !== null && (
            <p role="alert" className={BANDA}>
              {error} · Se muestra el último dato conocido.
            </p>
          )}
          {filas !== null && filas.length >= VENTANA && (
            <p role="status" className={AVISO}>
              <TriangleAlert aria-hidden="true" className="inline size-4 shrink-0" /> Se leyeron los{' '}
              {String(VENTANA)} registros más recientes: un periodo largo puede dejar fuera los más
              antiguos.
            </p>
          )}
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={alExportar('csv')}>
              Exportar a CSV
            </Button>
            {descarga !== null && (
              <Badge variant="secondary" asChild>
                <a href={descarga}>Descargar el archivo listo</a>
              </Badge>
            )}
          </div>
          {cuerpo}
        </TabsContent>
      </Tabs>
    </main>
  );
}
