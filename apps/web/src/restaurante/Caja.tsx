'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · restaurante · caja
 *
 * La pantalla de inicio del cajero: 40-120 cobros al día. Es la única del
 * modelo donde se BUSCA un dato entre muchos, así que las filas son compactas
 * y las cifras van tabulares a la derecha. Aquí lo que adorna, estorba.
 *
 * Abre en «Pendientes» y no en «Buscar» porque el 90 % del trabajo del cajero
 * es cobrar lo que ya está esperando: un buscador vacío le costaría un clic
 * cada vez, cien veces al día. La ESPERA es una columna y además ordena la
 * fila, porque una mesa que lleva seis minutos esperando no se libera y la
 * persona se está enojando. Los tres botones de caja no viven en ningún menú:
 * son los tres momentos en que la caja CAMBIA DE ESTADO, y esconderlos hace
 * que alguien cobre sin caja abierta o que el turno se vaya sin cortar. Y
 * «Caja cerrada» es un MURO, no un aviso: un cobro sin sesión de caja no
 * pertenece a ningún corte, y lo que no pertenece a un corte nadie lo cuadra.
 *
 * ── Lo que queda fuera, para que el archivo quepa en 300 líneas ───────────
 * · La espera se cuenta desde que se ABRIÓ la cuenta. El instante en que la
 *   mesa pidió la cuenta vive en `eventos_mesa`, que el puente sólo abre a
 *   DIRECCIÓN y el cajero no puede leer. El número sale mayor; el ORDEN de la
 *   fila, que es para lo que sirve, es el mismo.
 * · Cobrar es el diálogo «Cobro» y el arqueo es «Cierre diario y arqueo»: dos
 *   pantallas propias. Aquí se elige la cuenta y se abren aquéllas. El conteo
 *   es A CIEGAS, así que ésta jamás adelanta el efectivo esperado.
 * · En teléfono, Resumen e Historial se quedan fuera en lugar de esconderse
 *   tras un menú desplegable. «Sólo pendientes», que es lo que el documento
 *   pide del teléfono, se cumple igual.
 */

/** Una fila ya unida: quién espera (mesa) y cuánto debe (venta). */
export interface FilaDeCaja {
  readonly id: string;
  /** El código impreso que el comensal lleva a la caja: M05-4821. */
  readonly codigo: string | null;
  readonly mesa: string;
  readonly mesero: string | null;
  readonly personas: number | null;
  readonly total: number;
  readonly abiertaEn: string | null;
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

interface VentaViva {
  readonly id: string;
  readonly codigo_caja: string | null;
  readonly mesa_numero: number | null;
  readonly usuario_mesero_nombre: string | null;
  readonly personas: number | null;
  readonly total: number | null;
  readonly fecha_apertura: string | null;
}

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Texto de espera: el dato se lee siempre, nunca se infiere de un color. */
export function esperaDesde(iso: string | null, ahora: number): string {
  if (iso === null) return 'sin dato';
  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${String(minutos)} min`;
  return `hace ${String(Math.floor(minutos / 60))} h`;
}

/** Primero quien lleva más esperando. Es la señal que ordena la fila. */
export function porEspera(filas: readonly FilaDeCaja[]): readonly FilaDeCaja[] {
  return [...filas].sort((a, b) => (a.abiertaEn ?? '').localeCompare(b.abiertaEn ?? ''));
}

/**
 * Une las dos lecturas del puente: `Mesa` dice QUIÉN pidió la cuenta y `Venta`
 * trae el dinero, que el puente sólo abre a caja. Ninguna basta sola, y unirlas
 * aquí evita inventar una ruta de API que el documento no nombra.
 */
async function leerPendientes(signal: AbortSignal): Promise<readonly FilaDeCaja[]> {
  const [mesas, ventas] = await Promise.all([
    consultarPuente<{ venta_activa_id: string | null }>('Mesa', {
      filtro: { estado: 'cuenta_solicitada' },
      limite: 200,
      signal,
    }),
    consultarPuente<VentaViva>('Venta', { limite: 300, signal }),
  ]);
  const esperando = new Set(mesas.map((mesa) => mesa.venta_activa_id));
  return ventas
    .filter((venta) => esperando.has(venta.id))
    .map((venta) => ({
      id: venta.id,
      codigo: venta.codigo_caja,
      mesa: venta.mesa_numero === null ? 'Sin mesa' : `Mesa ${String(venta.mesa_numero)}`,
      mesero: venta.usuario_mesero_nombre,
      personas: venta.personas,
      total: venta.total ?? 0,
      abiertaEn: venta.fecha_apertura,
    }));
}

export function Caja({ filasIniciales, turnoInicial, onCobrar }: CajaProps) {
  const [filas, setFilas] = useState<readonly FilaDeCaja[] | null>(filasIniciales ?? null);
  const [turno, setTurno] = useState<ResumenDeTurno | null>(turnoInicial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [fondo, setFondo] = useState('');
  const [ahora, setAhora] = useState(() => Date.now());

  const fallar = (fallo: unknown, respaldo: string) => {
    setError(fallo instanceof Error ? fallo.message : respaldo);
  };

  const recargar = useCallback(async (signal: AbortSignal) => {
    const [pendientes, estado] = await Promise.all([
      leerPendientes(signal),
      invocarComando<ResumenDeTurno>('/api/caja/estado', {}, { signal }),
    ]);
    setFilas(pendientes);
    setTurno(estado);
    setError(null);
  }, []);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    const control = new AbortController();
    // La lista se CONGELA con el último dato: el cajero prefiere una cifra de
    // hace treinta segundos a una pantalla en blanco con gente esperando.
    recargar(control.signal).catch((fallo: unknown) => {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la caja.');
    });
    return () => {
      control.abort();
    };
  }, [filasIniciales, recargar]);

  useEffect(() => {
    // El reloj avanza solo; si no, «hace 1 min» sigue diciendo eso cuando ya
    // van nueve y la columna que ordena la fila miente. `F2` es el atajo que el
    // documento nombra: cien cobros al día con el ratón son cien viajes de más.
    const reloj = setInterval(() => {
      setAhora(Date.now());
    }, 30_000);
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'F2') return;
      evento.preventDefault();
      setPestana('buscar');
      document.getElementById('caja-buscar')?.focus();
    };
    window.addEventListener('keydown', alPulsar);
    return () => {
      clearInterval(reloj);
      window.removeEventListener('keydown', alPulsar);
    };
  }, []);

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    const base = filas ?? [];
    if (aguja === '') return porEspera(base);
    const texto = (f: FilaDeCaja) => `${f.codigo ?? ''} ${f.mesa} ${f.mesero ?? ''}`.toLowerCase();
    return porEspera(base.filter((f) => texto(f).includes(aguja)));
  }, [filas, busqueda]);

  const eliminarVacio = async (id: string) => {
    try {
      // Ruta por convención /api/<dominio>/<verbo>: es la salida que ya existe
      // para anular una cuenta, y su motivo es obligatorio en la base.
      const entrada = { ordenId: id, motivo: 'Cuenta sin consumo eliminada desde caja' };
      await invocarComando('/api/restaurante/cancelar-orden', entrada);
      setFilas((previas) => (previas ?? []).filter((fila) => fila.id !== id));
    } catch (fallo: unknown) {
      fallar(fallo, 'No se pudo eliminar el ticket.');
    }
  };

  const abrirCaja = async () => {
    try {
      const centavos = Math.round(Number(fondo.replace(',', '.')) * 100);
      const valido = Number.isFinite(centavos) && centavos > 0;
      await invocarComando('/api/caja/abrir', { fondoInicialCentavos: valido ? centavos : 0 });
      await recargar(new AbortController().signal);
    } catch (fallo: unknown) {
      fallar(fallo, 'No se pudo abrir la caja.');
    }
  };

  const banda = error !== null && (
    <p
      role="alert"
      className="mb-3 rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
    >
      {error} · La lista quedó congelada con el último dato conocido.
    </p>
  );

  const resumen = turno !== null && (
    <dl className="grid w-full max-w-md grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <dt className="text-sm text-muted-foreground">Vendido en el turno</dt>
      <dd className="justify-self-end font-bold tabular-nums">{dinero(turno.ventasCentavos)}</dd>
      <dt className="text-sm text-muted-foreground">Cuentas cobradas</dt>
      <dd className="justify-self-end font-bold tabular-nums">{String(turno.numeroVentas)}</dd>
    </dl>
  );

  if (filas === null || turno === null) {
    // Esqueletos con la forma de las filas, nunca un spinner: la pantalla no
    // salta al cargar y el ojo ya sabe dónde va a caer la cifra.
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
        <section
          aria-labelledby="caja-muro"
          className="w-full max-w-md rounded-lg border border-border bg-warning/15 p-6 shadow-2"
        >
          <h1 id="caja-muro" className="text-2xl font-bold">
            <span aria-hidden>⚠️ </span>Caja cerrada
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sin sesión de caja, un cobro no entra en ningún corte. Declara el fondo con el que
            empiezas y ábrela.
          </p>
          {banda}
          <label htmlFor="caja-fondo" className="mt-4 block text-sm font-medium">
            Fondo inicial en caja
          </label>
          <Input
            id="caja-fondo"
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1"
            value={fondo}
            onChange={(evento) => {
              setFondo(evento.target.value);
            }}
          />
          <Button
            className="mt-4 w-full"
            onClick={() => {
              void abrirCaja();
            }}
          >
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
          <Button variant="secondary" size="sm" disabled title="La caja ya está abierta">
            Abrir caja
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/restaurante/cierre-diario?arqueo=turno">Corte de turno</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/restaurante/cierre-diario">Cierre diario</a>
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
          {/* En teléfono sobrevive Pendientes: el único caso real de cobrar
              desde ahí es el dueño cuando el cajero fue al baño. */}
          <TabsTrigger value="resumen" className="hidden md:inline-flex">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="historial" className="hidden md:inline-flex">
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buscar" className="mt-3">
          <Input
            id="caja-buscar"
            className="max-w-sm"
            aria-label="Buscar por código, mesa o mesero"
            placeholder="M05-4821 · Mesa 5 · Luis"
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
          />
        </TabsContent>

        <TabsContent value="resumen" className="mt-3">
          {resumen}
        </TabsContent>

        <TabsContent value="historial" className="mt-3 text-sm text-muted-foreground">
          Los cobros ya cerrados viven en Registros, con su folio y su corte.{' '}
          <a href="/restaurante/registros" className="underline underline-offset-4">
            Abrir Registros
          </a>
        </TabsContent>
      </Tabs>

      {(pestana === 'pendientes' || pestana === 'buscar') &&
        (visibles.length === 0 ? (
          // El vacío ENSEÑA: el turno hasta ahora es justo lo que el cajero
          // haría con ese hueco de tiempo.
          <section className="mt-6 flex flex-col items-center gap-4 text-center">
            <p className="text-lg">Ninguna mesa está esperando pagar.</p>
            {resumen}
          </section>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 xl:gap-0">
            {visibles.map((fila) => (
              <li key={fila.id}>
                <Fila
                  fila={fila}
                  ahora={ahora}
                  onCobrar={onCobrar}
                  onEliminar={() => {
                    void eliminarVacio(fila.id);
                  }}
                />
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}

function dinero(centavos: string): string {
  return PESOS.format(Number(centavos) / 100);
}

interface FilaProps {
  readonly fila: FilaDeCaja;
  readonly ahora: number;
  readonly onCobrar?: (ventaId: string) => void;
  readonly onEliminar: () => void;
}

/**
 * Teléfono y tablet: tarjeta de dos líneas con el total en el tamaño mayor.
 * PC: la MISMA tarjeta se aplana en una fila compacta con `xl:contents`, sin
 * duplicar el marcado — dos marcados serían dos sitios donde equivocarse.
 */
function Fila({ fila, ahora, onCobrar, onEliminar }: FilaProps) {
  const quien = [
    fila.mesero ?? 'sin mesero',
    fila.personas === null ? null : `${String(fila.personas)} p.`,
  ]
    .filter((parte) => parte !== null)
    .join(' · ');
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-card-foreground xl:flex-row xl:items-center xl:gap-4 xl:rounded-none xl:border-x-0 xl:border-t-0 xl:px-3 xl:py-2">
      <button
        type="button"
        onClick={() => onCobrar?.(fila.id)}
        className="flex flex-col gap-1 text-left hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring xl:contents"
      >
        <span className="flex items-baseline justify-between gap-3 xl:contents">
          <span className="text-xl font-semibold md:text-2xl xl:w-36 xl:shrink-0 xl:text-base">
            {fila.mesa}
          </span>
          <span className="text-2xl font-bold tabular-nums md:text-3xl xl:order-last xl:ml-auto xl:w-32 xl:text-right xl:text-base">
            {PESOS.format(fila.total)}
          </span>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground xl:contents">
          <span className="xl:w-28 xl:shrink-0 xl:text-sm">{fila.codigo ?? 'sin código'}</span>
          <span className="xl:w-44 xl:shrink-0 xl:text-sm">{quien}</span>
          <span className="font-medium text-foreground xl:w-24 xl:shrink-0 xl:text-sm">
            {esperaDesde(fila.abiertaEn, ahora)}
          </span>
        </span>
      </button>
      {/* Una cuenta en $0.00 se abrió y se cerró sin consumo: se señala con
          palabras, no con color, y se ofrece quitarla de la fila. */}
      {fila.total === 0 && (
        <span className="flex items-center gap-2 xl:order-last">
          <Badge variant="outline">Sin consumo</Badge>
          <Button variant="ghost" size="xs" onClick={onEliminar}>
            Eliminar ticket
          </Button>
        </span>
      )}
    </div>
  );
}
