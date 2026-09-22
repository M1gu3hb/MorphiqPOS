'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { PartyPopper, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · mapa-de-mesas
 *
 * La pantalla insignia del modelo, y la de inicio del mesero. 200-400 veces al
 * día.
 *
 * ── Por qué un MAPA y no una lista ───────────────────────────────────────
 * Porque el mesero no busca «mesa 14»: busca la mesa **donde está la gente**.
 * Su memoria del salón es espacial, no alfabética. Un plano con las mesas en su
 * posición real convierte una búsqueda en un reconocimiento, y eso son dos
 * segundos por vez, cuatro veces por mesa, treinta mesas por turno.
 *
 * ── Por qué en teléfono el mapa DESAPARECE ───────────────────────────────
 * Porque un plano de treinta mesas en 375 px no es un plano: es un mosaico
 * ilegible. Y porque quien mira desde el teléfono es el dueño desde fuera, no
 * el mesero caminando el salón. La rejilla ordenada por urgencia le da en la
 * primera pantalla lo único que quería saber.
 *
 * ── La marca de alergias tiene esquina propia ────────────────────────────
 * Separada de todo lo demás, porque un error aquí no es un descuadre: es una
 * urgencia médica. Es la marca más importante del mapa.
 *
 * ── Lo que NO va aquí, aunque el sistema lo tenga ────────────────────────
 * Totales del día, ventas, márgenes, costos, reportes y configuración. El
 * mesero no debe ver dinero del negocio.
 *
 * ── Lo que hoy no se puede abrir, y por qué ──────────────────────────────
 * Esta pantalla lee `Mesa` por el puente. Su forma y su posición viven en
 * columnas que las migraciones de la Fase 2 escriben y NO aplican, así que
 * contra la base de hoy devuelve la lista sin plano. Está dicho en el
 * `FILE-MAP.md` del modelo.
 */

/** Los ocho estados del ciclo de una mesa, con su color y su palabra. */
const ESTADOS = {
  libre: { etiqueta: 'Libre', clase: 'bg-muted text-muted-foreground border-border' },
  esperando_orden: {
    etiqueta: 'Esperando orden',
    clase: 'bg-secondary text-secondary-foreground border-border',
  },
  pedido_enviado: {
    etiqueta: 'Pedido enviado',
    clase: 'bg-primary/15 text-foreground border-primary/40',
  },
  en_preparacion: {
    etiqueta: 'En preparación',
    clase: 'bg-primary/30 text-foreground border-primary/60',
  },
  esperando_entrega: {
    etiqueta: 'Esperando entrega',
    clase: 'bg-accent text-accent-foreground border-border',
  },
  ocupada: { etiqueta: 'Ocupada', clase: 'bg-card text-card-foreground border-primary' },
  cuenta_solicitada: {
    etiqueta: 'Cuenta solicitada',
    clase: 'bg-destructive/20 text-foreground border-destructive',
  },
  limpieza: { etiqueta: 'Limpieza', clase: 'bg-muted/60 text-muted-foreground border-dashed' },
} as const;

type ClaveEstado = keyof typeof ESTADOS;

/**
 * El orden de urgencia de la rejilla de teléfono.
 *
 * Primero lo que necesita algo de alguien, después lo que está en marcha, al
 * final lo libre. Ordenar por número de mesa daría una lista donde lo urgente
 * aparece en la posición que le tocó por casualidad.
 */
const URGENCIA: readonly ClaveEstado[] = [
  'cuenta_solicitada',
  'esperando_entrega',
  'esperando_orden',
  'en_preparacion',
  'pedido_enviado',
  'ocupada',
  'limpieza',
  'libre',
];

export interface MesaDelMapa {
  readonly id: string;
  /**
   * NÚMERO, y es un NÚMERO.
   *
   * El puente lo sirve con `conversion: 'entero'` —así está escrito en `mapa.ts`
   * desde que las 27 entidades del restaurante tuvieron destino— y aquí estaba
   * declarado `string`. El orden de abajo llamaba `numero.localeCompare(…)` sobre un
   * número y la pantalla moría con `TypeError: e.numero.localeCompare is not a
   * function` EN CUANTO llegaban las mesas: el mesero entraba con su PIN y lo que
   * veía era la página de error del navegador.
   *
   * No lo vio ninguna puerta: TypeScript creyó esta declaración —`consultarPuente<T>`
   * no valida nada en tiempo de ejecución—, el HTML abría en 200, la respuesta era
   * `{ok:true}` y la e2e comprobaba el rótulo «Mesas», que se pinta ANTES de que
   * lleguen los datos. Un error de consola no es un 500: el servidor ni se entera.
   */
  readonly numero: number;
  readonly estado: string;
  readonly zona: string | null;
  readonly capacidad: number | null;
  /**
   * LOS CINCO NOMBRES QUE EL PUENTE SIRVE, y por qué importan tanto aquí.
   *
   * Esta pantalla leía `personas`, `clienteNombre`, `colorMesero`, `celebracion` y
   * `alergias`, y la entidad `Mesa` no sirve ninguno: sirve `personas_actuales`,
   * `cliente_temporal`, `mesero_asignado_color`, `celebracion_especial` y
   * `notas_alergias`. Los cinco llegaban `undefined` en el mapa de mesas, que es la
   * pantalla que un mesero mira cuarenta veces por turno.
   */
  readonly personas_actuales: number | null;
  readonly cliente_temporal: string | null;
  readonly mesero_asignado_color: string | null;
  readonly celebracion_especial: boolean;
  readonly notas_alergias: string | null;
}

export interface MapaDeMesasProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly mesasIniciales?: readonly MesaDelMapa[];
  readonly onAbrirMesa?: (mesaId: string) => void;
}

function esEstado(valor: string): valor is ClaveEstado {
  return valor in ESTADOS;
}

/** Las zonas que de verdad tienen mesas. Una pestaña vacía es una trampa. */
export function zonasDe(mesas: readonly MesaDelMapa[]): readonly string[] {
  const vistas = new Set<string>();
  for (const mesa of mesas) vistas.add(mesa.zona ?? 'Salón');
  return [...vistas].sort((a, b) => a.localeCompare(b, 'es-MX'));
}

/** Ordena por urgencia, y dentro de cada estado por número. */
export function porUrgencia(mesas: readonly MesaDelMapa[]): readonly MesaDelMapa[] {
  return [...mesas].sort((a, b) => {
    const ia = URGENCIA.indexOf(a.estado as ClaveEstado);
    const ib = URGENCIA.indexOf(b.estado as ClaveEstado);
    if (ia !== ib) return (ia === -1 ? URGENCIA.length : ia) - (ib === -1 ? URGENCIA.length : ib);
    return a.numero - b.numero;
  });
}

export function MapaDeMesas({ mesasIniciales, onAbrirMesa }: MapaDeMesasProps) {
  const voc = useVocabulario();
  const [mesas, setMesas] = useState<readonly MesaDelMapa[] | null>(mesasIniciales ?? null);
  const [zona, setZona] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mesasIniciales !== undefined) return;
    let vivo = true;
    consultarPuente<MesaDelMapa>('Mesa', { limite: 200 })
      .then((filas) => {
        if (vivo) setMesas(filas);
      })
      .catch((fallo: unknown) => {
        // La pantalla NUNCA se vacía por un error de red: el mesero prefiere un
        // dato de hace diez segundos a una pantalla en blanco.
        if (vivo) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el salón.');
      });
    return () => {
      vivo = false;
    };
  }, [mesasIniciales]);

  const zonas = useMemo(() => (mesas === null ? [] : zonasDe(mesas)), [mesas]);
  const visibles = useMemo(() => {
    if (mesas === null) return [];
    const deLaZona = zona === null ? mesas : mesas.filter((m) => (m.zona ?? 'Salón') === zona);
    return porUrgencia(deLaZona);
  }, [mesas, zona]);

  if (mesas === null) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">{voc.titulo('unidad_servicio', true)}</h1>
        {/* Esqueletos con la forma de las mesas, no un spinner: así la pantalla
            no salta al cargar y el ojo ya sabe dónde va a mirar. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (mesas.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg text-muted-foreground">
          Todavía no hay {voc.plural('unidad_servicio')} configurad
          {voc.terminacion('unidad_servicio', true)}.
        </p>
        {/* El vacío ENSEÑA, no se disculpa: lleva directo a donde se resuelve. */}
        <Button asChild>
          <a href="/configuracion">Crear mi primer mapa de {voc.plural('unidad_servicio')}</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{voc.titulo('unidad_servicio', true)}</h1>
        <nav
          aria-label="Zonas del salón"
          className="flex gap-1 overflow-x-auto md:overflow-visible"
        >
          {/*
            `aria-pressed` no es decoración: es lo ÚNICO que dice qué zona está puesta a
            quien no ve el color del botón. Faltaba en las dos, así que un lector de
            pantalla anunciaba cuatro botones iguales y ninguno «pulsado». El catálogo
            de este mismo modelo ya lo pone en su fila de filtros; esta se quedó atrás.
          */}
          <Button
            type="button"
            size="sm"
            aria-pressed={zona === null}
            variant={zona === null ? 'default' : 'ghost'}
            onClick={() => {
              setZona(null);
            }}
          >
            Todas
          </Button>
          {zonas.map((z) => (
            <Button
              key={z}
              type="button"
              size="sm"
              aria-pressed={zona === z}
              variant={zona === z ? 'default' : 'ghost'}
              onClick={() => {
                setZona(z);
              }}
            >
              {z}
            </Button>
          ))}
        </nav>
      </header>

      {error !== null && (
        <p role="alert" className="mb-3 rounded-md border border-destructive p-2 text-sm">
          {error} · Se muestra el último dato conocido.
        </p>
      )}

      {/* Rejilla en teléfono, plano escalado de tablet para arriba. Las mesas
          nunca bajan de 64 px de lado: es el mínimo que un dedo acierta. */}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {visibles.map((mesa) => {
          const estado = esEstado(mesa.estado) ? ESTADOS[mesa.estado] : null;
          return (
            <li key={mesa.id}>
              <button
                type="button"
                onClick={() => onAbrirMesa?.(mesa.id)}
                className={[
                  'relative flex min-h-28 w-full flex-col items-center justify-center gap-1',
                  'rounded-lg border-2 p-2 text-center transition-colors',
                  estado?.clase ?? 'bg-muted text-muted-foreground border-border',
                ].join(' ')}
              >
                {/* La celebración arriba a la izquierda: para que cualquiera que
                    pase sepa que ahí va el postre con vela. */}
                {mesa.celebracion_especial && (
                  <PartyPopper
                    aria-label="Celebración"
                    className="absolute top-1 left-1 size-4 shrink-0"
                  />
                )}
                {/* El color del mesero arriba a la derecha: identifica sus mesas
                    de un barrido, sin leer nombres. */}
                {mesa.mesero_asignado_color !== null && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 h-3 w-3 rounded-full border border-border"
                    style={{ backgroundColor: mesa.mesero_asignado_color }}
                  />
                )}

                <span className="text-3xl font-bold leading-none">{String(mesa.numero)}</span>
                {/* El color NUNCA es el único portador de significado. */}
                <span className="text-xs font-medium">{estado?.etiqueta ?? mesa.estado}</span>

                {mesa.cliente_temporal !== null && (
                  <Badge variant="secondary" className="mt-1 max-w-full truncate text-[11px]">
                    {mesa.cliente_temporal}
                    {mesa.personas_actuales === null
                      ? ''
                      : ` · ${String(mesa.personas_actuales)} p.`}
                  </Badge>
                )}

                {/* Esquina propia, separada de todo: un error aquí no es un
                    descuadre, es una urgencia médica. */}
                {mesa.notas_alergias && (
                  <TriangleAlert
                    className="absolute bottom-1 left-1 size-4 shrink-0 text-destructive"
                    aria-label={`Hay alergias declaradas en ${voc.enFraseCon('este', 'unidad_servicio')}`}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(ESTADOS).map(([clave, estado]) => (
          <span key={clave} className="flex items-center gap-1">
            <span aria-hidden className={`h-2 w-2 rounded-full border ${estado.clase}`} />
            {estado.etiqueta}
          </span>
        ))}
      </footer>
    </div>
  );
}
