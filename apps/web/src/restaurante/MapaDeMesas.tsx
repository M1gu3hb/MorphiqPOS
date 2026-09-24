'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { ErrorDePantalla, Esqueleto, Superficie, VIAJE, Vacio } from '@morphiqpos/ui/sistema';
import { LayoutGrid, PartyPopper, TriangleAlert } from 'lucide-react';
import { ViewTransition, useEffect, useMemo, useState, type ReactNode } from 'react';

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
 * primera pantalla lo único que quería saber. Por eso el piso del salón —la
 * superficie hundida sobre la que se levantan las mesas— sólo se pinta de tableta
 * para arriba: en el teléfono son tarjetas sueltas, a todo el ancho.
 *
 * ── El color dice qué NECESITA la mesa, no qué le pasó ───────────────────
 * Neutra la libre, azul lo que va en marcha (pedido, cocina, comiendo), ámbar la
 * que espera al mesero, el acento la que tiene la comida lista y rojo la que pidió
 * la cuenta. Es el mismo orden de la urgencia, leído a tres metros; la palabra del
 * estado va siempre debajo del número, porque el color nunca va solo.
 *
 * ── La mesa se expande a la cuenta ───────────────────────────────────────
 * Cada tesela va envuelta en un `<ViewTransition>` con `VIAJE.mesa(id)`, y la
 * cabecera de la mesa activa lleva el MISMO nombre: al tocarla, la tesela crece
 * hasta ser la cuenta. No es adorno: el mesero toca sin mirar mientras camina, y
 * el movimiento le confirma qué mesa abrió. La navegación de Next ya es una
 * transición, y `default="none"` hace que nada más se mueva: ni al llegar los
 * datos ni al cambiar de zona.
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

/**
 * Los ocho estados del ciclo de una mesa, con su tinte y su palabra.
 *
 * El tinte es el de la tesela Y el de su muestra en la leyenda: la leyenda es la
 * misma superficie en miniatura, así que no puede decir un color y la mesa otro.
 */
const ESTADOS = {
  libre: { etiqueta: 'Libre', clase: 'border-borde bg-superficie text-texto' },
  esperando_orden: {
    etiqueta: 'Esperando orden',
    clase: 'border-advertencia bg-advertencia/15 text-texto',
  },
  pedido_enviado: {
    etiqueta: 'Pedido enviado',
    clase: 'border-primario/40 bg-primario/10 text-texto',
  },
  en_preparacion: {
    etiqueta: 'En preparación',
    clase: 'border-primario/60 bg-primario/25 text-texto',
  },
  esperando_entrega: {
    etiqueta: 'Esperando entrega',
    clase: 'border-acento bg-acento-suave text-acento-suave-texto',
  },
  ocupada: { etiqueta: 'Ocupada', clase: 'border-primario bg-superficie text-texto' },
  cuenta_solicitada: {
    etiqueta: 'Cuenta solicitada',
    clase: 'border-peligro bg-peligro/15 text-texto',
  },
  limpieza: {
    etiqueta: 'Limpieza',
    clase: 'border-dashed border-borde-fuerte bg-fondo-sutil text-texto-sutil',
  },
} as const;

type ClaveEstado = keyof typeof ESTADOS;

/** Un estado que el puente sirve y este mapa no conoce: se pinta, pero sin tinte. */
const SIN_TINTE = 'border-borde bg-superficie text-texto-sutil';

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

/**
 * El rótulo de la pantalla, con lo que va a su lado: las zonas, o su esqueleto.
 * En tableta las zonas bajan a una fila propia a todo el ancho; en PC suben a la
 * derecha del título.
 */
function Encabezado({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-(--espacio-3) xl:flex-row xl:items-center xl:justify-between">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      {children}
    </header>
  );
}

/**
 * EL PISO DEL SALÓN · la superficie hundida sobre la que se levantan las mesas.
 *
 * Nivel 0, con el fondo sutil: las teselas (nivel 1, sobre `bg-superficie`) se leen
 * como objetos puestos encima. En el teléfono no hay piso —ahí el mapa ya no es un
 * mapa—, y las tarjetas van a sangre para ganar el ancho que el marco se comería.
 */
function PisoDelSalon({
  etiqueta,
  children,
}: {
  readonly etiqueta: string;
  readonly children: ReactNode;
}) {
  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={0}
      aria-label={etiqueta}
      className="border-0 bg-transparent md:border md:bg-fondo-sutil md:p-(--espacio-4)"
    >
      {children}
    </Superficie>
  );
}

/** La rejilla: dos columnas en teléfono, cuatro en tableta vertical, seis en PC. */
const REJILLA =
  'grid grid-cols-2 gap-(--espacio-3) sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

export function MapaDeMesas({ mesasIniciales, onAbrirMesa }: MapaDeMesasProps) {
  const voc = useVocabulario();
  const [mesas, setMesas] = useState<readonly MesaDelMapa[] | null>(mesasIniciales ?? null);
  const [zona, setZona] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  // Cada intento de lectura es un número: el botón de reintentar lo sube, y el
  // efecto lee otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (mesasIniciales !== undefined) return;
    let vivo = true;
    consultarPuente<MesaDelMapa>('Mesa', { limite: 200 })
      .then((filas) => {
        if (vivo) setMesas(filas);
      })
      .catch((error: unknown) => {
        // El mapa se lee UNA vez, al montarse (volver de una mesa lo monta otra
        // vez); no hay relectura periódica. Así que un fallo siempre llega SIN
        // mapa, y se dice con `ErrorDePantalla`: el estado «último dato conocido,
        // en gris» de 04-INTERFAZ pide primero un mapa que se refresque solo.
        if (vivo) setFallo(error instanceof Error ? error.message : 'No se pudo leer el salón.');
      });
    return () => {
      vivo = false;
    };
  }, [mesasIniciales, intento]);

  const zonas = useMemo(() => (mesas === null ? [] : zonasDe(mesas)), [mesas]);
  const visibles = useMemo(() => {
    if (mesas === null) return [];
    const deLaZona = zona === null ? mesas : mesas.filter((m) => (m.zona ?? 'Salón') === zona);
    return porUrgencia(deLaZona);
  }, [mesas, zona]);

  const titulo = voc.titulo('unidad_servicio', true);

  if (mesas === null && fallo !== null) {
    // Sin ningún dato conocido no hay mapa que enseñar: se dice qué pasó y se
    // ofrece volver a leer, que es lo único que el mesero puede hacer aquí.
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado titulo={titulo} />
        <ErrorDePantalla
          className="max-w-lg"
          titulo={`No se pudo leer el mapa de ${voc.plural('unidad_servicio')}`}
          queHacer={`Sin el mapa no se sabe qué ${voc.singular('unidad_servicio')} está libre ni cuál pidió ${voc.enFrase('orden')}. Revisa la conexión y vuelve a intentarlo.`}
          detalle={fallo}
          reintentar={
            <Button
              type="button"
              onClick={() => {
                setFallo(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
        />
      </div>
    );
  }

  if (mesas === null) {
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado titulo={titulo}>
          <div aria-hidden="true" className="flex gap-(--espacio-2)">
            {Array.from({ length: 3 }, (_, i) => (
              <Esqueleto key={i} className="h-(--altura-control) w-24" />
            ))}
          </div>
        </Encabezado>
        {/* Esqueletos con la forma de las mesas, no un spinner: así la pantalla
            no salta al cargar y el ojo ya sabe dónde va a mirar. */}
        <PisoDelSalon etiqueta={titulo}>
          <div
            role="status"
            aria-busy="true"
            aria-label={`Cargando ${voc.enFrase('unidad_servicio', true)}`}
            className={REJILLA}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <Esqueleto key={i} className="min-h-28 w-full rounded-lg" />
            ))}
          </div>
        </PisoDelSalon>
      </div>
    );
  }

  if (mesas.length === 0) {
    // El vacío ENSEÑA, no se disculpa: lleva directo a donde se resuelve. Va sobre
    // el piso vacío del salón, que es exactamente lo que falta dibujar.
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        <Encabezado titulo={titulo} />
        <PisoDelSalon etiqueta={titulo}>
          <Vacio
            icono={<LayoutGrid />}
            titulo={`Todavía no hay ${voc.plural('unidad_servicio')} configurad${voc.terminacion('unidad_servicio', true)}.`}
            explicacion={`El mapa es la pantalla de inicio del mesero: la memoria del salón es espacial, no alfabética, y por eso ${voc.conArticulo('unidad_servicio')} va en su sitio real y no en una lista.`}
            accion={
              <Button asChild>
                <a href="/configuracion">Crear mi primer mapa de {voc.plural('unidad_servicio')}</a>
              </Button>
            }
          />
        </PisoDelSalon>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <Encabezado titulo={titulo}>
        {/*
          `aria-pressed` no es decoración: es lo ÚNICO que dice qué zona está puesta a
          quien no ve el color del botón. Faltaba en las dos, así que un lector de
          pantalla anunciaba cuatro botones iguales y ninguno «pulsado». El catálogo
          de este mismo modelo ya lo pone en su fila de filtros; esta se quedó atrás.

          Del alto de un control y no chicas: esta pantalla es de dedo, y en tableta
          la fila entera se desliza si hay más zonas que ancho.
        */}
        <nav
          aria-label="Zonas del salón"
          className="flex gap-(--espacio-2) overflow-x-auto pb-(--espacio-1) xl:overflow-visible xl:pb-0"
        >
          {[null, ...zonas].map((z) => (
            <Button
              key={z ?? 'todas'}
              type="button"
              className="shrink-0"
              aria-pressed={zona === z}
              variant={zona === z ? 'default' : 'outline'}
              onClick={() => {
                setZona(z);
              }}
            >
              {z ?? 'Todas'}
            </Button>
          ))}
        </nav>
      </Encabezado>

      {/* Rejilla en teléfono, piso del salón de tableta para arriba. Las mesas
          nunca bajan de 64 px de lado: es el mínimo que un dedo acierta. */}
      <PisoDelSalon etiqueta={zona === null ? titulo : `${titulo} · ${zona}`}>
        <ul className={REJILLA}>
          {visibles.map((mesa) => {
            const estado = esEstado(mesa.estado) ? ESTADOS[mesa.estado] : null;
            const conAlergias = (mesa.notas_alergias ?? '') !== '';
            return (
              <li key={mesa.id}>
                {/* Por FUERA de la tesela: el nombre del viaje se lo pone a su
                    primer nodo, y ése tiene que ser la tesela entera. */}
                <ViewTransition name={VIAJE.mesa(mesa.id)} share="auto" default="none">
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    relleno={3}
                    onClick={() => onAbrirMesa?.(mesa.id)}
                    className={`relative flex min-h-28 w-full flex-col items-center justify-center gap-(--espacio-1) border-2 text-center ${estado?.clase ?? SIN_TINTE}`}
                  >
                    {/* La celebración arriba a la izquierda: para que cualquiera que
                        pase sepa que ahí va el postre con vela. */}
                    {mesa.celebracion_especial && (
                      <PartyPopper
                        aria-label="Celebración"
                        className="absolute top-(--espacio-2) left-(--espacio-2) size-4 shrink-0"
                      />
                    )}
                    {/* El color del mesero arriba a la derecha: identifica sus mesas
                        de un barrido, sin leer nombres. El color es un dato del
                        registro, no un token: por eso va en `style`. */}
                    {mesa.mesero_asignado_color !== null && (
                      <span
                        aria-hidden="true"
                        className="absolute top-(--espacio-2) right-(--espacio-2) size-3 rounded-full border border-borde"
                        style={{ backgroundColor: mesa.mesero_asignado_color }}
                      />
                    )}

                    {/* El número es lo más grande: es lo que se grita en el salón. */}
                    <span className="font-numeros text-3xl leading-none font-bold tabular-nums">
                      {String(mesa.numero)}
                    </span>
                    {/* El color NUNCA es el único portador de significado. */}
                    <span className="text-xs font-medium">{estado?.etiqueta ?? mesa.estado}</span>

                    {mesa.cliente_temporal !== null && (
                      <Badge
                        variant="secondary"
                        className="mt-(--espacio-1) max-w-full truncate text-xs"
                      >
                        {mesa.cliente_temporal}
                        {mesa.personas_actuales === null
                          ? ''
                          : ` · ${String(mesa.personas_actuales)} p.`}
                      </Badge>
                    )}

                    {/* Esquina propia, separada de todo: un error aquí no es un
                        descuadre, es una urgencia médica. */}
                    {conAlergias && (
                      <TriangleAlert
                        className="absolute bottom-(--espacio-2) left-(--espacio-2) size-5 shrink-0 text-peligro"
                        aria-label={`Hay alergias declaradas en ${voc.enFraseCon('este', 'unidad_servicio')}`}
                      />
                    )}
                  </Superficie>
                </ViewTransition>
              </li>
            );
          })}
        </ul>
      </PisoDelSalon>

      {/* La leyenda, al final y en chico: es lo cuarto que se mira. Cada estado
          lleva cuántas mesas hay así en la zona puesta, que es el resumen del
          salón de un vistazo —sin un peso del negocio: el mesero no ve dinero—. */}
      <ul
        aria-label="Leyenda de estados"
        className="flex flex-wrap gap-x-(--espacio-4) gap-y-(--espacio-2) text-xs text-texto-sutil"
      >
        {(Object.keys(ESTADOS) as ClaveEstado[]).map((clave) => {
          const cuantas = visibles.filter((m) => m.estado === clave).length;
          return (
            <li key={clave} className="flex items-center gap-(--espacio-1)">
              <Superficie
                como="span"
                aria-hidden="true"
                nivel={0}
                radio="sm"
                relleno={0}
                className={`size-3 border-2 ${ESTADOS[clave].clase}`}
              >
                {null}
              </Superficie>
              {ESTADOS[clave].etiqueta}
              <span
                className={`font-numeros font-semibold tabular-nums ${cuantas === 0 ? 'text-texto-tenue' : 'text-texto'}`}
              >
                {cuantas}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
