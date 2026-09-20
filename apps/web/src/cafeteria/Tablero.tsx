'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafetería · EL TABLERO (F-056 · §4.4)
 *
 * ── La hora a la que se mira es lo que lo diseña ──────────────────────────
 * «A las ocho de la mañana **nadie** mira el dashboard»: es la hora de más trabajo
 * del día, y las pantallas que existen a esa hora son la de cobrar y la barra. Éste
 * se mira **a las 10:30, cuando baja la ráfaga, y a las 20:40, al cerrar**.
 *
 * Por eso lo primero es la RÁFAGA —07:00 a 10:30 contra el mismo día de la semana
 * pasada— y no la venta del día: es la única franja con volumen suficiente para que
 * la diferencia signifique algo, y a las 10:30 es lo único que ya pasó.
 *
 * ── Y sobre el turno, no sobre el día ─────────────────────────────────────
 * El dinero que importa es el del turno abierto, porque es el que se va a cortar.
 * Sin turno abierto, la pantalla lo DICE en vez de enseñar ceros que parecen un mal
 * día.
 */

const RUTA = '/api/reportes/tablero-cafeteria';

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const PESOS_EXACTOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Arriba de esto la fila se sale a la calle y se pierde gente que ni entra. */
const BEBIDAS_POR_HORA_QUE_APRIETAN = 45;
/** Del cobro a la entrega: bajar de 180 a 120 s deja atender 50 % más gente. */
const SEGUNDOS_QUE_APRIETAN = 180;

const TARJETA = 'rounded-xl border border-border bg-card p-4 text-card-foreground';
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const CIFRA = 'text-3xl font-bold tabular-nums';
const CIFRA_CHICA = 'text-xl font-semibold tabular-nums';
const RENGLON = 'flex items-baseline justify-between gap-3 py-1';

interface BebidaDelDia {
  readonly producto: string;
  readonly unidades: number;
  readonly utilidadCentavos: string;
}

interface MermaPorMotivo {
  readonly motivo: string;
  readonly veces: number;
  readonly costoCentavos: string;
}

export interface TableroDeCafeteria {
  readonly fecha: string;
  readonly turnoAbierto: boolean;
  readonly rafaga: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly bebidas: number;
  };
  readonly pico: { readonly bebidasPorHora: number; readonly hora: string | null };
  readonly entrega: { readonly segundos: number | null; readonly comandas: number };
  readonly seAcaba: {
    readonly insumo: string | null;
    readonly dias: number | null;
    readonly existencia: string;
    readonly unidad: string | null;
  };
  readonly cajon: { readonly efectivoCentavos: string; readonly cambioCentavos: string };
  readonly costoPorBebida: { readonly centavos: string; readonly bebidas: number };
  readonly tarjeta: { readonly centavos: string; readonly deLaVentaBp: number };
  readonly utilidad: { readonly centavos: string; readonly margenBp: number };
  readonly mezcla: readonly { readonly canal: string; readonly centavos: string }[];
  readonly porUtilidad: readonly BebidaDelDia[];
  readonly grano: { readonly dias: number | null; readonly optimos: number | null };
  readonly merma: readonly MermaPorMotivo[];
  readonly sellos: {
    readonly otorgadosHoy: number;
    readonly vivos: number;
    readonly costoSiSeCanjeanCentavos: string;
  };
}

export interface TableroProps {
  readonly datosIniciales?: TableroDeCafeteria;
}

const pesos = (centavos: string): string => PESOS.format(Number(centavos) / 100);
const pesosExactos = (centavos: string): string => PESOS_EXACTOS.format(Number(centavos) / 100);
const porciento = (bp: number): string => `${(bp / 100).toFixed(1)} %`;

/** El canal, como se dice en la barra. */
const CANALES: Readonly<Record<string, string>> = {
  aqui: 'Aquí',
  llevar: 'Para llevar',
  plataforma: 'Plataforma',
  domicilio: 'A domicilio',
};

function comoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${fecha}T12:00:00`));
}

function comparacion(hoy: string, referencia: string): string {
  const base = Number(referencia);
  if (base <= 0) return 'sin ráfaga ese día la semana pasada';
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  return `${cambio > 0 ? '+' : ''}${String(cambio)} % contra el mismo día de la semana pasada`;
}

/** «2:35» se lee mejor que «155 s» cuando se habla de una fila. */
function comoReloj(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  return `${String(minutos)}:${String(segundos % 60).padStart(2, '0')}`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeCafeteria | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeCafeteria>(RUTA, {}, { signal: control.signal })
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
      <main className="space-y-3 p-4">
        <h1 className="text-2xl font-bold">Buen día</h1>
        <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3">
          {error}
        </p>
      </main>
    );
  }

  if (datos === null) {
    return (
      <main className="space-y-3 p-4">
        <h1 className="text-2xl font-bold">Buen día</h1>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  const { rafaga, pico, entrega, seAcaba, cajon, costoPorBebida, tarjeta, utilidad } = datos;
  const { mezcla, porUtilidad, grano, merma, sellos } = datos;
  const totalMezcla = mezcla.reduce((suma, m) => suma + Number(m.centavos), 0);

  return (
    <main className="space-y-3 p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Buen día</h1>
          <p className="text-sm text-muted-foreground">{comoFecha(datos.fecha)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href="/cafeteria/cobrar">Ir a cobrar</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/cafeteria/barra">Ver {voc.enFrase('preparacion')}</a>
          </Button>
        </div>
      </header>

      {!datos.turnoAbierto && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          Sin turno abierto: lo del turno está en cero porque todavía no empieza, no porque haya ido
          mal. Ábrelo en Turno y el tablero se llena solo.
        </p>
      )}

      {/* ── FILA 1 · los cuatro de las 10:30 ────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <section className={TARJETA} aria-labelledby="t-rafaga">
          <h2 id="t-rafaga" className={ROTULO}>
            Lo cobrado en la ráfaga
          </h2>
          <p className={CIFRA}>{pesos(rafaga.hoyCentavos)}</p>
          <p className="text-sm text-muted-foreground">
            07:00 a 10:30 · {comparacion(rafaga.hoyCentavos, rafaga.referenciaCentavos)}
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-pico">
          <h2 id="t-pico" className={ROTULO}>
            {voc.titulo('linea_orden', true)} por hora en el pico
          </h2>
          <p className={CIFRA}>{pico.bebidasPorHora}</p>
          <p
            className={
              pico.bebidasPorHora >= BEBIDAS_POR_HORA_QUE_APRIETAN
                ? 'text-sm font-semibold text-destructive'
                : 'text-sm text-muted-foreground'
            }
          >
            {pico.hora === null ? 'sin movimiento todavía' : `la hora de las ${pico.hora}`}
            {pico.bebidasPorHora >= BEBIDAS_POR_HORA_QUE_APRIETAN
              ? ' · con dos personas la fila se sale a la calle'
              : ''}
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-entrega">
          <h2 id="t-entrega" className={ROTULO}>
            Del cobro a la entrega
          </h2>
          <p className={CIFRA}>{entrega.segundos === null ? '—' : comoReloj(entrega.segundos)}</p>
          <p
            className={
              entrega.segundos !== null && entrega.segundos > SEGUNDOS_QUE_APRIETAN
                ? 'text-sm font-semibold text-destructive'
                : 'text-sm text-muted-foreground'
            }
          >
            {entrega.comandas === 0
              ? 'todavía no se entrega nada hoy'
              : `${String(entrega.comandas)} entregas · bajar a 2:00 deja atender 50 % más`}
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-acaba">
          <h2 id="t-acaba" className={ROTULO}>
            Lo que se acaba primero
          </h2>
          <p className={CIFRA}>{seAcaba.dias === null ? '—' : `${String(seAcaba.dias)} d`}</p>
          <p className="text-sm text-muted-foreground">
            {seAcaba.insumo === null
              ? 'todavía no hay consumo que medir'
              : `${seAcaba.insumo} · quedan ${seAcaba.existencia} ${seAcaba.unidad ?? ''}`}
          </p>
        </section>
      </div>

      {/* ── FILA 2 · los cinco del dinero ───────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <section className={TARJETA} aria-labelledby="t-cajon">
          <h2 id="t-cajon" className={ROTULO}>
            Efectivo en el cajón
          </h2>
          <p className={CIFRA}>{pesos(cajon.efectivoCentavos)}</p>
          <p className="text-sm text-muted-foreground">
            El cajón está en {voc.enFrase('preparacion')}, a la vista de la calle.
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-cambio">
          <h2 id="t-cambio" className={ROTULO}>
            Cambio disponible
          </h2>
          <p className={CIFRA}>{pesos(cajon.cambioCentavos)}</p>
          <p className="text-sm text-muted-foreground">
            En monedas y billetes chicos. Quedarse sin cambio a las 8:00 con quince personas en fila
            es perder la ráfaga entera.
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-costo">
          <h2 id="t-costo" className={ROTULO}>
            Costo por {voc.singular('linea_orden')}
          </h2>
          <p className={CIFRA}>{pesosExactos(costoPorBebida.centavos)}</p>
          <p className="text-sm text-muted-foreground">
            {costoPorBebida.bebidas} en el turno · si sube, o el molino está mal calibrado o alguien
            sirve de más
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-tarjeta">
          <h2 id="t-tarjeta" className={ROTULO}>
            Tarjeta del turno
          </h2>
          <p className={CIFRA}>{pesos(tarjeta.centavos)}</p>
          <p className="text-sm text-muted-foreground">
            {porciento(tarjeta.deLaVentaBp)} de lo cobrado
          </p>
        </section>
      </div>

      <section className={TARJETA} aria-labelledby="t-utilidad">
        <h2 id="t-utilidad" className={ROTULO}>
          Utilidad del turno
        </h2>
        <p
          className={
            Number(utilidad.centavos) < 0 ? `${CIFRA} text-destructive` : `${CIFRA} text-success`
          }
        >
          {pesos(utilidad.centavos)}
        </p>
        <p className="text-sm text-muted-foreground">
          {porciento(utilidad.margenBp)} de margen, con los gastos del turno ya restados
        </p>
      </section>

      {/* ── BLOQUES DE ABAJO ────────────────────────────────────────────── */}
      <div className="grid gap-3 xl:grid-cols-2">
        <section className={TARJETA} aria-labelledby="t-mezcla">
          <h2 id="t-mezcla" className={ROTULO}>
            Mezcla del día
          </h2>
          {mezcla.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se cobra nada hoy.</p>
          ) : (
            <ul className="space-y-1">
              {mezcla.map((canal) => {
                const parte = totalMezcla === 0 ? 0 : Number(canal.centavos) / totalMezcla;
                return (
                  <li key={canal.canal}>
                    <div className={RENGLON}>
                      <span className="flex-1">{CANALES[canal.canal] ?? canal.canal}</span>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(parte * 100)} %
                      </span>
                      <span className="tabular-nums">{pesos(canal.centavos)}</span>
                    </div>
                    {/* La barra es la proporción, que es lo único que una gráfica
                        hace mejor que una lista. */}
                    <div className="h-1 w-full rounded-full bg-muted">
                      <div
                        className="h-1 rounded-full bg-primary"
                        style={{ width: `${String(Math.round(parte * 100))}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={TARJETA} aria-labelledby="t-utilidades">
          <h2 id="t-utilidades" className={ROTULO}>
            {voc.titulo('linea_orden', true)} por utilidad
          </h2>
          {porUtilidad.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se vende nada hoy.</p>
          ) : (
            <ul className="divide-y divide-border">
              {porUtilidad.map((bebida) => (
                <li key={bebida.producto} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">{bebida.producto}</span>
                  <span className="text-sm text-muted-foreground">{bebida.unidades}</span>
                  <span className="tabular-nums">{pesos(bebida.utilidadCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Por lo que DEJAN, no por unidades: el latte vende más y el americano deja más.
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-grano">
          <h2 id="t-grano" className={ROTULO}>
            Frescura del grano abierto
          </h2>
          <p className={CIFRA}>{grano.dias === null ? '—' : `${String(grano.dias)} d`}</p>
          <p
            className={
              grano.dias !== null && grano.optimos !== null && grano.dias > grano.optimos
                ? 'text-sm font-semibold text-destructive'
                : 'text-sm text-muted-foreground'
            }
          >
            {grano.dias === null
              ? 'no hay lote abierto declarado'
              : grano.optimos === null
                ? 'desde el tueste'
                : `desde el tueste · óptimo hasta ${String(grano.optimos)} d`}
          </p>
        </section>

        <section className={TARJETA} aria-labelledby="t-merma">
          <h2 id="t-merma" className={ROTULO}>
            Merma de {voc.singular('preparacion')} del turno
          </h2>
          {merma.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin merma declarada en este turno.</p>
          ) : (
            <ul className="divide-y divide-border">
              {merma.map((motivo) => (
                <li key={motivo.motivo} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">{motivo.motivo}</span>
                  <span className="text-sm text-muted-foreground">{motivo.veces}</span>
                  <span className="tabular-nums">{pesosExactos(motivo.costoCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={TARJETA} aria-labelledby="t-sellos">
          <h2 id="t-sellos" className={ROTULO}>
            Sellos
          </h2>
          <p className={CIFRA_CHICA}>
            {sellos.otorgadosHoy} otorgados hoy · {sellos.vivos} vivos
          </p>
          <p className="text-sm text-muted-foreground">
            Costarían {pesos(sellos.costoSiSeCanjeanCentavos)} si se canjearan todos.
          </p>
        </section>
      </div>
    </main>
  );
}
