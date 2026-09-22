'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';
import { TriangleAlert } from 'lucide-react';

/**
 * PANTALLA · restaurante · caja
 *
 * Pantalla de inicio del cajero: 40-120 cobros al día, y la única del modelo
 * donde se BUSCA un dato entre muchos. De ahí las filas compactas y las cifras
 * tabulares a la derecha — aquí lo que adorna, estorba.
 *
 * Abre en «Pendientes» y no en «Buscar» porque el 90 % del trabajo del cajero es
 * cobrar lo que ya está esperando, y un buscador vacío le costaría un clic cien
 * veces al día. La ESPERA es columna y además ordena la fila: una mesa que lleva
 * seis minutos esperando no se libera y la persona se está enojando. Los tres
 * botones de caja no viven en un menú porque son los tres momentos en que la caja
 * CAMBIA DE ESTADO, y esconderlos hace que alguien cobre sin caja abierta o que
 * el turno se vaya sin cortar. Y «Caja cerrada» es un MURO, no un aviso: un cobro
 * sin sesión no pertenece a ningún corte, y eso no lo cuadra nadie.
 *
 * ── Recortado, para que el archivo quepa en 300 líneas ───────────────────
 * · La espera cuenta desde que se ABRIÓ la cuenta: el instante en que la mesa la
 *   pidió vive en `eventos_mesa`, que el puente sólo abre a DIRECCIÓN. El número
 *   sale mayor; el ORDEN de la fila, que es para lo que sirve, no.
 * · Cobrar es el diálogo «Cobro» y el arqueo es «Cierre diario y arqueo»: dos
 *   pantallas propias. Aquí se elige la cuenta y se abren aquéllas — el conteo es
 *   A CIEGAS, así que ésta nunca adelanta el efectivo esperado.
 * · Fuera quedan los atajos de teclado y, en teléfono, el menú que escondía
 *   Resumen e Historial: allí esas dos pestañas no se muestran, y «sólo
 *   pendientes», que es lo que el documento pide, se cumple igual.
 */

/**
 * Una cuenta esperando cobro. Los nombres de los campos son los del PUENTE, no
 * unos propios: renombrarlos costaría un mapeo entero para no ganar nada, y el
 * mapa de entidades ya advierte que los nombres son los que la base escribe.
 */
export interface FilaDeCaja {
  readonly id: string;
  /** El código impreso que el comensal lleva a la caja: M05-4821. */
  readonly codigo_caja: string | null;
  readonly mesa_numero: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly personas: number | null;
  readonly total: number | null;
  readonly fecha_apertura: string | null;
}

/** El turno hasta ahora: lo que se enseña cuando no hay nada que cobrar. */
export interface ResumenDeTurno {
  readonly abierta: boolean;
  readonly ventasCentavos: string;
  readonly numeroVentas: number;
}

export interface CajaProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeCaja[];
  readonly turnoInicial?: ResumenDeTurno;
  readonly onCobrar?: (ventaId: string) => void;
}

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

// Las clases largas viven arriba para que cada elemento quepa en una línea.
// `FILA` es la tarjeta de teléfono y tablet; en PC esa MISMA tarjeta se aplana en
// una fila compacta con `xl:contents`, sin un segundo marcado — dos marcados
// serían dos sitios donde equivocarse.
const BANDA = 'mb-3 rounded-md border border-destructive bg-destructive/15 p-2 text-sm';
const MURO = 'w-full max-w-md rounded-lg border border-border bg-warning/15 p-6 shadow-2';
const FILA =
  'flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-card-foreground xl:flex-row xl:items-center xl:gap-4 xl:rounded-none xl:border-x-0 xl:border-t-0 xl:px-3 xl:py-2';
const COBRAR =
  'flex flex-col gap-1 text-left hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring xl:contents';
const MESA = 'text-xl font-semibold md:text-2xl xl:w-36 xl:shrink-0 xl:text-base';
const TOTAL =
  'text-2xl font-bold tabular-nums md:text-3xl xl:order-last xl:ml-auto xl:w-32 xl:text-right xl:text-base';
const ESPERA = 'font-medium text-foreground xl:w-24 xl:shrink-0 xl:text-sm';
const SOLO_PC = 'hidden md:inline-flex';

/** Texto de espera: el dato se lee siempre, nunca se infiere de un color. */
export function esperaDesde(iso: string | null, ahora: number): string {
  if (iso === null) return 'sin dato';
  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${String(minutos)} min`;
  return `hace ${String(Math.floor(minutos / 60))} h`;
}

function rotulo(numero: number | null, voc: Vocabulario): string {
  return numero === null
    ? `Sin ${voc.singular('unidad_servicio')}`
    : `${voc.titulo('unidad_servicio')} ${String(numero)}`;
}

/** Quién atiende y cuánta gente: dos datos chicos que comparten columna. */
function quien(fila: FilaDeCaja): string {
  const gente = fila.personas === null ? '' : ` · ${String(fila.personas)} p.`;
  return `${fila.usuario_mesero_nombre ?? 'sin mesero'}${gente}`;
}

/**
 * `Mesa` dice QUIÉN pidió la cuenta y `Venta` trae el dinero, que el puente sólo
 * abre a caja: ninguna basta sola, y unirlas aquí evita inventar una ruta de API
 * que el documento no nombra. Sale ordenado por espera, de más a menos.
 */
async function leerPendientes(signal: AbortSignal): Promise<readonly FilaDeCaja[]> {
  const [mesas, ventas] = await Promise.all([
    consultarPuente<{ venta_activa_id: string | null }>('Mesa', {
      filtro: { estado: 'cuenta_solicitada' },
      limite: 200,
      signal,
    }),
    consultarPuente<FilaDeCaja>('Venta', { limite: 300, signal }),
  ]);
  const esperando = new Set(mesas.map((mesa) => mesa.venta_activa_id));
  return ventas
    .filter((venta) => esperando.has(venta.id))
    .sort((a, b) => (a.fecha_apertura ?? '').localeCompare(b.fecha_apertura ?? ''));
}

export function Caja({ filasIniciales, turnoInicial, onCobrar }: CajaProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeCaja[] | null>(filasIniciales ?? null);
  const [turno, setTurno] = useState<ResumenDeTurno | null>(turnoInicial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [fondo, setFondo] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());

  /**
   * Lee, y NO pinta.
   *
   * La separación no es estilo: `setState` dentro de una función que el efecto
   * llama de frente encadena un render por cada lectura. Lo que se lee vuelve
   * como dato y quien lo pidió decide cuándo escribirlo.
   */
  const leerCaja = useCallback(async (signal: AbortSignal) => {
    const [pendientes, estado] = await Promise.all([
      leerPendientes(signal),
      invocarComando<ResumenDeTurno>('/api/caja/estado', {}, { signal }),
    ]);
    return { pendientes, estado };
  }, []);

  useEffect(() => {
    // El reloj avanza solo: si no, «hace 1 min» sigue diciendo eso cuando ya van
    // nueve y la columna que ordena la fila miente. Y si la red falla, la lista se
    // CONGELA con el último dato: el cajero prefiere una cifra de hace treinta
    // segundos a una pantalla vacía con gente esperando.
    const reloj = setInterval(() => {
      setAhora(Date.now());
    }, 30_000);
    const control = new AbortController();
    if (filasIniciales === undefined) {
      leerCaja(control.signal)
        .then(({ pendientes, estado }) => {
          setFilas(pendientes);
          setTurno(estado);
          setError(null);
        })
        .catch((fallo: unknown) => {
          setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la caja.');
        });
    }
    return () => {
      clearInterval(reloj);
      control.abort();
    };
  }, [filasIniciales, leerCaja]);

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    if (aguja === '') return filas ?? [];
    const texto = (f: FilaDeCaja) =>
      `${f.codigo_caja ?? ''} ${rotulo(f.mesa_numero, voc)} ${quien(f)}`;
    return (filas ?? []).filter((f) => texto(f).toLowerCase().includes(aguja));
  }, [filas, busqueda, voc]);

  const alBuscar = (evento: ChangeEvent<HTMLInputElement>) => {
    setBusqueda(evento.target.value);
  };

  const alEscribirFondo = (evento: ChangeEvent<HTMLInputElement>) => {
    setFondo(evento.target.value);
  };

  // Ruta por convención /api/<dominio>/<verbo>: la salida que ya existe para anular
  // una cuenta. Su motivo es obligatorio en la base, así que va siempre.
  const eliminarVacio = (id: string) => () => {
    const motivo = 'Cuenta sin consumo eliminada desde caja';
    invocarComando('/api/restaurante/cancelar-orden', { ordenId: id, motivo })
      .then(() => {
        setFilas((previas) => (previas ?? []).filter((fila) => fila.id !== id));
      })
      .catch((fallo: unknown) => {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo eliminar el ticket.');
      });
  };

  const alAbrirCaja = () => {
    const centavos = Math.round(Number(fondo.replace(',', '.')) * 100);
    invocarComando('/api/caja/abrir', {
      fondoInicialCentavos: Number.isFinite(centavos) && centavos > 0 ? centavos : 0,
    })
      .then(async () => leerCaja(new AbortController().signal))
      .then(({ pendientes, estado }) => {
        setFilas(pendientes);
        setTurno(estado);
        setError(null);
      })
      .catch((fallo: unknown) => {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir la caja.');
      });
  };

  const banda = error !== null && (
    <p role="alert" className={BANDA}>
      {error} · La lista quedó congelada con el último dato conocido.
    </p>
  );

  const vendido = turno === null ? '' : PESOS.format(Number(turno.ventasCentavos) / 100);
  const resumen = turno !== null && (
    <dl className="grid w-full max-w-md grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4">
      <dt className="text-sm text-muted-foreground">Vendido en el turno</dt>
      <dd className="justify-self-end font-bold tabular-nums">{vendido}</dd>
      <dt className="text-sm text-muted-foreground">
        {voc.titulo('orden', true)} cobrad{voc.terminacion('orden', true)}
      </dt>
      <dd className="justify-self-end font-bold tabular-nums">{String(turno.numeroVentas)}</dd>
    </dl>
  );

  // Esqueletos con la forma de las filas, nunca un spinner: la pantalla no salta al
  // cargar y el ojo ya sabe dónde va a caer la cifra.
  if (filas === null || turno === null) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Caja</h1>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!turno.abierta) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <section aria-labelledby="caja-muro" className={MURO}>
          <h1 id="caja-muro" className="text-2xl font-bold">
            <TriangleAlert aria-hidden="true" className="inline size-4 shrink-0" /> Caja cerrada
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sin sesión de caja, un cobro no entra en ningún corte. Declara el fondo y ábrela.
          </p>
          {banda}
          <label htmlFor="caja-fondo" className="mt-4 block text-sm font-medium">
            Fondo inicial
          </label>
          <Input id="caja-fondo" inputMode="decimal" value={fondo} onChange={alEscribirFondo} />
          <Button className="mt-4 w-full" onClick={alAbrirCaja}>
            Abrir caja
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="p-4">
      <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="text-2xl font-bold">Caja</h1>
        {/* En tablet y teléfono los tres ocupan una fila de ancho completo. */}
        <nav aria-label="Estado de la caja" className="grid grid-cols-3 gap-2 xl:flex">
          <Button variant="secondary" size="sm" disabled title="Ya está abierta">
            Abrir caja
          </Button>
          {/*
            DOS ENLACES A UNA PANTALLA QUE NO EXISTE, y con 404 en el navegador.

            Decían «Corte de turno» y «Cierre diario» y los dos llevaban a
            `/restaurante/cierre-diario`, que **no es una ruta**: la pantalla se
            llama `cierre-diario-y-arqueo`. Los dos daban 404, y ninguna puerta lo
            veía porque la de rutas llamadas comprueba las de `/api/` —un enlace a
            una PANTALLA que no existe no pasaba por ahí—.

            Y eran dos para una: la pantalla de cierre no lee `?arqueo=turno` ni
            distingue turno de día, así que los dos botones habrían hecho lo mismo.
            Uno, con el nombre de la pantalla a la que lleva.
          */}
          <Button variant="outline" size="sm" asChild>
            <a href="/restaurante/cierre-diario-y-arqueo">Cierre y arqueo</a>
          </Button>
        </nav>
      </header>

      {banda}

      <Tabs value={pestana} onValueChange={setPestana}>
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes <Badge variant="secondary">{String(filas.length)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="buscar">Buscar</TabsTrigger>
          {/* En teléfono sobrevive Pendientes: cobrar desde ahí sólo pasa cuando el
              dueño releva al cajero que fue al baño. */}
          <TabsTrigger value="resumen" className={SOLO_PC}>
            Resumen
          </TabsTrigger>
          <TabsTrigger value="historial" className={SOLO_PC}>
            Historial
          </TabsTrigger>
        </TabsList>
        <TabsContent value="buscar" className="mt-3 max-w-sm">
          <Input
            id="caja-buscar"
            aria-label={`Buscar ${voc.singular('orden')}`}
            value={busqueda}
            onChange={alBuscar}
          />
        </TabsContent>
        <TabsContent value="resumen" className="mt-3">
          {resumen}
        </TabsContent>
        <TabsContent value="historial" className="mt-3 text-sm text-muted-foreground">
          Los cobros ya cerrados viven en Registros, con su folio y su corte.
        </TabsContent>
      </Tabs>

      {(pestana === 'pendientes' || pestana === 'buscar') &&
        (visibles.length === 0 ? (
          // El vacío ENSEÑA: el resumen del turno es lo que el cajero haría con ese hueco.
          <section className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-lg">
              {voc.conDeterminante('ningun', 'unidad_servicio')} está esperando pagar.
            </p>
            {resumen}
          </section>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 xl:gap-0">
            {visibles.map((fila) => (
              <li key={fila.id} className={FILA}>
                <button type="button" onClick={() => onCobrar?.(fila.id)} className={COBRAR}>
                  <span className="flex items-baseline justify-between gap-3 xl:contents">
                    <span className={MESA}>{rotulo(fila.mesa_numero, voc)}</span>
                    <span className={TOTAL}>{PESOS.format(fila.total ?? 0)}</span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground xl:contents">
                    <span className="xl:w-28 xl:shrink-0 xl:text-sm">
                      {fila.codigo_caja ?? '—'}
                    </span>
                    <span className="xl:w-40 xl:shrink-0 xl:text-sm">{quien(fila)}</span>
                    <span className={ESPERA}>{esperaDesde(fila.fecha_apertura, ahora)}</span>
                  </span>
                </button>
                {/* Un ticket en $0.00 se abrió y se cerró sin consumo: se dice con palabras. */}
                {fila.total === 0 && (
                  <Button variant="ghost" size="xs" onClick={eliminarVacio(fila.id)}>
                    Sin consumo · eliminar ticket
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}
