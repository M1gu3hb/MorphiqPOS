'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { GraficaDeBarras } from '@morphiqpos/ui/sistema';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · EL TABLERO DE LA TIENDITA (F-056)
 *
 * ── Por qué esta pantalla existe, y por qué no es la que había ─────────────
 * El tablero que servía `/` es el del RESTAURANTE: nueve indicadores de una cena
 * —ventas, costo, utilidad, ticket promedio, la dona de métodos de pago, propinas—.
 * `abarrotes/04-INTERFAZ.md` §4.4 pide otro, con nombres y apellidos: **siete
 * indicadores**, cada uno con la decisión que dispara, y dos de los del restaurante
 * están PROHIBIDOS aquí:
 *
 *   · el **ticket promedio**, porque en un surtido de $20 a $80 se mueve por azar y
 *     no dispara nada;
 *   · la **dona de métodos de pago**, porque en 390 px una lista ordenada contesta
 *     mejor y ocupa menos.
 *
 * ── Para 390 px, y en ese orden ────────────────────────────────────────────
 * Lo lee el dueño en el teléfono, dos veces al día: a las 6:50 antes de abrir y a
 * las 22:45 después del corte. El orden de las tarjetas NO cambia con la hora —una
 * pantalla que se recompone destruye la memoria muscular, que es lo que permite
 * leerla en cuatro segundos— y lo que cambia es lo que cada tarjeta dice.
 *
 * ── Qué hace cada número, en una línea ────────────────────────────────────
 * 1 · Venta de hoy contra el MISMO DÍA de la semana pasada · ¿voy bien o voy mal?
 * 2 · Margen de hoy y del mes · ¿vendí mucho o gané mucho?
 * 3 · Qué pedir, por proveedor, el de mañana arriba · ¿qué le pido al que viene?
 * 4 · Diferencia de conteo del mes contra el 1.5–2.5 % de referencia · ¿me roban?
 * 5 · Fiado: total, vencido, otorgado hoy y los tres más viejos · ¿a quién le hablo?
 * 6 · Se vence esta semana, a costo · ¿qué remato el fin de semana?
 * 7 · Caja: quién la tiene, cuánto lleva y el último cierre · ¿cerró bien ayer?
 */

const RUTA = '/api/reportes/tablero-tienda';

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const PESOS_EXACTOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** La referencia del giro para la diferencia de conteo, en puntos base. */
const CONTEO_ACEPTABLE_BP = 250;

const TARJETA = 'rounded-xl border border-border bg-card p-(--espacio-4) text-card-foreground';
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const CIFRA = 'text-3xl font-bold tabular-nums';
const CIFRA_CHICA = 'text-xl font-semibold tabular-nums';
const RENGLON = 'flex items-baseline justify-between gap-(--espacio-3) py-1';

interface PorPedir {
  readonly proveedor: string;
  readonly pasaManana: boolean;
  readonly claves: number;
  readonly importeCentavos: string;
}

interface DeudorViejo {
  readonly cliente: string;
  readonly saldoCentavos: string;
  readonly dias: number;
}

interface PorVencer {
  readonly producto: string;
  readonly dias: number;
  readonly valorCentavos: string;
}

export interface TableroDeTienda {
  readonly fecha: string;
  readonly venta: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly tickets: number;
  };
  readonly margen: {
    readonly hoyCentavos: string;
    readonly hoyBp: number;
    readonly mesCentavos: string;
    readonly mesBp: number;
  };
  readonly porPedir: readonly PorPedir[];
  readonly conteo: {
    readonly hayConteos: boolean;
    readonly tomas: number;
    readonly diferenciaCentavos: string;
    readonly sobreVentaBp: number;
  };
  readonly fiado: {
    readonly totalCentavos: string;
    readonly vencidoCentavos: string;
    readonly otorgadoHoyCentavos: string;
    readonly masViejos: readonly DeudorViejo[];
  };
  readonly porVencer: readonly PorVencer[];
  readonly caja: {
    readonly abierta: boolean;
    readonly quien: string | null;
    readonly efectivoEsperadoCentavos: string;
    readonly diferenciaUltimoCierreCentavos: string | null;
  };
}

export interface TableroProps {
  /** Para la prueba y para el prerenderizado: lo mismo que devuelve la ruta. */
  readonly datosIniciales?: TableroDeTienda;
}

/**
 * La fecha del negocio, como se lee: «domingo, 20 de septiembre».
 *
 * A mediodía y no a medianoche: `new Date('2026-09-20')` es medianoche UTC, que en
 * México es el día ANTERIOR a las 18:00, y el tablero saldría fechado ayer.
 */
function comoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${fecha}T12:00:00`));
}

const pesos = (centavos: string): string => PESOS.format(Number(centavos) / 100);
const pesosExactos = (centavos: string): string => PESOS_EXACTOS.format(Number(centavos) / 100);
const porciento = (bp: number): string => `${(bp / 100).toFixed(1)} %`;

/**
 * La comparación, en la única forma que sirve: con su signo y su palabra.
 *
 * «$6,400» no significa nada; «$6,400, −18 % contra el martes pasado» sí. Cuando la
 * semana pasada no hubo venta ese día se dice eso y no se inventa un porcentaje
 * sobre cero.
 */
function comparacion(hoy: string, referencia: string): string {
  const base = Number(referencia);
  if (base <= 0) return 'sin venta ese día la semana pasada';
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  const signo = cambio > 0 ? '+' : '';
  return `${signo}${String(cambio)} % contra el mismo día de la semana pasada`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeTienda | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeTienda>(RUTA, {}, { signal: control.signal })
      .then((salida) => {
        if (sigueMontada()) setDatos(salida);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDe(fallo));
      });

    return () => {
      control.abort();
    };
  }, [datosIniciales]);

  if (error !== null) {
    return (
      <main className="space-y-(--espacio-3) p-(--espacio-4)">
        <h1 className="text-2xl font-bold">Buen día</h1>
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/15 p-(--espacio-3)"
        >
          {error}
        </p>
      </main>
    );
  }

  if (datos === null) {
    return (
      <main className="space-y-(--espacio-3) p-(--espacio-4)">
        <h1 className="text-2xl font-bold">Buen día</h1>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  const { venta, margen, porPedir, conteo, fiado, porVencer, caja } = datos;
  const diferencia = Number(conteo.diferenciaCentavos);

  return (
    <main className="space-y-(--espacio-3) p-(--espacio-4)">
      {/* La MISMA forma que el `PageHeader` heredado —el bloque del título y, de
          hermano, el de las acciones— porque es la relación por la que la prueba
          encuentra las acciones de un tablero sin agarrarse a una clase. */}
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Buen día</h1>
          <p className="text-sm text-muted-foreground">{comoFecha(datos.fecha)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href="/abarrotes/cobrar">Ir a Caja</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/abarrotes/entradas">Registrar compra</a>
          </Button>
        </div>
      </header>

      {/* 1 · LA VENTA, con la única comparación que sirve. */}
      <section className={TARJETA} aria-labelledby="t-venta">
        {/* El sustantivo del giro: una tiendita lee «Venta» y el día que la dueña
            llame «nota» a lo que cobra, este rótulo la sigue. */}
        <h2 id="t-venta" className={ROTULO}>
          {voc.titulo('orden')} de hoy
        </h2>
        <p className={CIFRA}>{pesos(venta.hoyCentavos)}</p>
        <p className="text-sm text-muted-foreground">
          {comparacion(venta.hoyCentavos, venta.referenciaCentavos)} ·{' '}
          {voc.conNumero('orden', venta.tickets)}
        </p>
      </section>

      {/* 2 · EL MARGEN, que es otra cosa que la venta. */}
      <section className={TARJETA} aria-labelledby="t-margen">
        <h2 id="t-margen" className={ROTULO}>
          Margen de hoy
        </h2>
        <p className={CIFRA}>
          {pesos(margen.hoyCentavos)} <span className={CIFRA_CHICA}>{porciento(margen.hoyBp)}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          En el mes {pesos(margen.mesCentavos)} · {porciento(margen.mesBp)}
        </p>
      </section>

      {/* 3 · QUÉ PEDIR. No «63 claves bajo mínimo»: a quién y cuánto. */}
      <section className={TARJETA} aria-labelledby="t-pedir">
        <h2 id="t-pedir" className={ROTULO}>
          Qué pedir
        </h2>
        {porPedir.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada bajo mínimo: el surtido está completo.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {porPedir.map((fila) => (
              <li key={fila.proveedor} className={RENGLON}>
                <span className="min-w-0 flex-1 truncate">
                  {fila.proveedor}
                  {fila.pasaManana && (
                    <span className="ml-2 rounded-md bg-primary/15 px-1 text-xs font-semibold text-primary">
                      pasa mañana
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{fila.claves} claves</span>
                <span className="tabular-nums">{pesos(fila.importeCentavos)}</span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild size="sm" variant="secondary" className="mt-2">
          <a href="/abarrotes/entradas">Ver el pedido renglón por renglón</a>
        </Button>
      </section>

      {/* 4 · EL CONTEO. Sin conteos, lo dice: un cero aquí sería mentira. */}
      <section className={TARJETA} aria-labelledby="t-conteo">
        <h2 id="t-conteo" className={ROTULO}>
          Diferencia de conteo del mes
        </h2>
        {!conteo.hayConteos ? (
          <>
            <p className={CIFRA_CHICA}>Sin conteos este mes</p>
            <p className="text-sm text-muted-foreground">
              El conteo cíclico no se está haciendo: un cero aquí sería mentira.
            </p>
            <Button asChild size="sm" variant="secondary" className="mt-2">
              <a href="/abarrotes/conteo">Contar una zona</a>
            </Button>
          </>
        ) : (
          <>
            <p className={CIFRA}>{pesosExactos(conteo.diferenciaCentavos)}</p>
            <p
              className={
                Math.abs(conteo.sobreVentaBp) > CONTEO_ACEPTABLE_BP
                  ? 'text-sm font-semibold text-destructive'
                  : 'text-sm text-muted-foreground'
              }
            >
              {porciento(Math.abs(conteo.sobreVentaBp))} de la venta del mes · la referencia del
              giro es 1.5 a 2.5 % · {conteo.tomas} zona(s) contada(s)
              {diferencia < 0 ? ' · falta material' : ''}
            </p>
          </>
        )}
      </section>

      {/* 5 · EL FIADO. El «otorgado hoy» es el que corrige la conducta esta noche. */}
      <section className={TARJETA} aria-labelledby="t-fiado">
        <h2 id="t-fiado" className={ROTULO}>
          Lo que me deben
        </h2>
        <p className={CIFRA}>{pesos(fiado.totalCentavos)}</p>
        <p className="text-sm text-muted-foreground">
          Vencido {pesos(fiado.vencidoCentavos)} · otorgado hoy {pesos(fiado.otorgadoHoyCentavos)}
        </p>
        {fiado.masViejos.length > 0 && (
          <ul className="mt-2 divide-y divide-border">
            {fiado.masViejos.map((quien) => (
              <li key={`${quien.cliente}-${quien.dias}`} className={RENGLON}>
                <span className="min-w-0 flex-1 truncate">{quien.cliente}</span>
                <span className="text-sm text-muted-foreground">{quien.dias} d</span>
                <span className="tabular-nums">{pesos(quien.saldoCentavos)}</span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild size="sm" variant="secondary" className="mt-2">
          <a href="/abarrotes/fiado">Ver la libreta</a>
        </Button>
      </section>

      {/* 6 · LO QUE SE VENCE. Merma prevenible, en las líneas de menor margen. */}
      <section className={TARJETA} aria-labelledby="t-vence">
        <h2 id="t-vence" className={ROTULO}>
          Se vence esta semana
        </h2>
        {porVencer.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada se vence esta semana.</p>
        ) : (
          <ul className="divide-y divide-border">
            {/* LA ÚNICA GRÁFICA DE ESTE TABLERO, y va aquí y no en la venta.
                §4.4 prohíbe la dona de métodos de pago —«en 390 px una lista ordenada
                contesta mejor y ocupa menos»— y el mismo criterio decide dónde SÍ
                cabe una: donde la pregunta es «¿cuál primero?» y las magnitudes son
                comparables. La lista de abajo dice qué y cuánto; lo que no dice es si
                el remate del sábado empieza por uno solo que se come la mitad del
                riesgo o hay que bajarle el precio a los cinco. */}
            {porVencer.length > 1 && (
              <li className="pb-(--espacio-3)">
                <GraficaDeBarras
                  titulo="Lo que se vence esta semana, a costo"
                  ejes={porVencer.map((fila) => fila.producto)}
                  series={[
                    {
                      etiqueta: 'A costo',
                      valores: porVencer.map((fila) => Number(fila.valorCentavos)),
                    },
                  ]}
                  formato={(valor) => PESOS.format(valor / 100)}
                  alto={140}
                />
              </li>
            )}
            {porVencer.map((fila) => (
              <li key={`${fila.producto}-${fila.dias}`} className={RENGLON}>
                <span className="min-w-0 flex-1 truncate">{fila.producto}</span>
                <span
                  className={fila.dias <= 0 ? 'text-sm font-semibold text-destructive' : 'text-sm'}
                >
                  {fila.dias <= 0 ? 'vencido' : `en ${String(fila.dias)} d`}
                </span>
                <span className="tabular-nums">{pesos(fila.valorCentavos)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 7 · LA CAJA. Dos preguntas de control con una mirada. */}
      <section className={TARJETA} aria-labelledby="t-caja">
        <h2 id="t-caja" className={ROTULO}>
          Caja
        </h2>
        {caja.abierta ? (
          <>
            <p className={CIFRA_CHICA}>
              Abierta · {pesosExactos(caja.efectivoEsperadoCentavos)} en el cajón
            </p>
            <p className="text-sm text-muted-foreground">La tiene {caja.quien ?? 'sin firma'}</p>
          </>
        ) : (
          <p className={CIFRA_CHICA}>Cerrada</p>
        )}
        <p className="text-sm text-muted-foreground">
          {caja.diferenciaUltimoCierreCentavos === null
            ? 'Todavía no hay ningún corte.'
            : `Último cierre: ${pesosExactos(caja.diferenciaUltimoCierreCentavos)} de diferencia.`}
        </p>
      </section>
    </main>
  );
}
