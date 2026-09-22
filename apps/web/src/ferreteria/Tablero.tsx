'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { GraficaDeBarras } from '@morphiqpos/ui/sistema';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferretería · EL TABLERO (F-056 · §4.4)
 *
 * ── Por qué no es el de la tiendita, ni el del restaurante ────────────────
 * Porque el orden dice lo que el negocio teme. En una tiendita lo primero es la
 * venta del día; aquí lo primero es **la cartera**, porque «es la pérdida que no
 * admite vuelta atrás»: una ferretería fía ciento veinte mil pesos a una obra que
 * puede no volver, y la llamada se hace hoy o no se hace.
 *
 * Y se diseña primero para PC: Beto lo mira en la máquina del mostrador, no en el
 * teléfono. Por eso dos columnas en pantalla ancha y una sola cuando no cabe.
 *
 * Los ocho, en su orden: cartera · dinero dormido · salió hoy y no se cobró · venta
 * y margen · qué pedir · mostrador por persona · lo que debo esta semana · y el
 * cajón de lo que se enfría.
 */

const RUTA = '/api/reportes/tablero-ferreteria';

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const TARJETA = 'rounded-xl border border-borde bg-superficie p-(--espacio-4) text-texto';
const ROTULO = 'text-xs font-semibold uppercase tracking-wide text-texto-sutil';
const CIFRA = 'text-3xl font-bold tabular-nums';
const CIFRA_CHICA = 'text-xl font-semibold tabular-nums';
const RENGLON = 'flex items-baseline justify-between gap-(--espacio-3) py-1';

interface DeudorDeObra {
  readonly cliente: string;
  readonly obra: string | null;
  readonly saldoCentavos: string;
  readonly dias: number;
}

interface LineaDormida {
  readonly linea: string;
  readonly dineroCentavos: string;
  readonly claves: number;
}

interface PersonaDelMostrador {
  readonly persona: string;
  readonly ventaCentavos: string;
  readonly tickets: number;
  readonly lineasPorVentaBp: number;
}

interface PorPagar {
  readonly proveedor: string;
  readonly dia: string;
  readonly saldoCentavos: string;
}

interface PorPedir {
  readonly proveedor: string;
  readonly pasaManana: boolean;
  readonly claves: number;
  readonly importeCentavos: string;
}

export interface TableroDeFerreteria {
  readonly fecha: string;
  readonly cartera: {
    readonly totalCentavos: string;
    readonly vencidoCentavos: string;
    readonly masViejos: readonly DeudorDeObra[];
  };
  readonly dormido: {
    readonly dineroCentavos: string;
    readonly delInventarioBp: number;
    readonly peores: readonly LineaDormida[];
  };
  readonly aCredito: {
    readonly importeCentavos: string;
    readonly sobreVentaBp: number;
    readonly remisionesSinFirma: number;
  };
  readonly venta: {
    readonly hoyCentavos: string;
    readonly referenciaCentavos: string;
    readonly tickets: number;
  };
  readonly margen: { readonly hoyCentavos: string; readonly hoyBp: number };
  readonly porPedir: readonly PorPedir[];
  readonly mostrador: readonly PersonaDelMostrador[];
  readonly porPagar: {
    readonly totalCentavos: string;
    readonly documentos: readonly PorPagar[];
  };
  readonly pendientes: {
    readonly garantias: number;
    readonly rentasVencidas: number;
    readonly rollosViejos: number;
    readonly cotizacionesPorVencer: number;
  };
}

export interface TableroProps {
  readonly datosIniciales?: TableroDeFerreteria;
}

const pesos = (centavos: string): string => PESOS.format(Number(centavos) / 100);
const porciento = (bp: number): string => `${(bp / 100).toFixed(1)} %`;

/** La fecha del negocio, a mediodía para que la zona no la corra un día. */
function comoFecha(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${fecha}T12:00:00`));
}

/** «$14,600, −12 % contra el mismo día de la semana pasada». */
function comparacion(hoy: string, referencia: string): string {
  const base = Number(referencia);
  if (base <= 0) return 'sin venta ese día la semana pasada';
  const cambio = Math.round(((Number(hoy) - base) / base) * 100);
  return `${cambio > 0 ? '+' : ''}${String(cambio)} % contra el mismo día de la semana pasada`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return 'No se pudo cargar el tablero.';
}

export function Tablero({ datosIniciales }: TableroProps) {
  const voc = useVocabulario();
  const [datos, setDatos] = useState<TableroDeFerreteria | null>(datosIniciales ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    invocarComando<TableroDeFerreteria>(RUTA, {}, { signal: control.signal })
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
        <p role="alert" className="rounded-md border border-peligro bg-peligro/15 p-(--espacio-3)">
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
      </main>
    );
  }

  const { cartera, dormido, aCredito, venta, margen, porPedir, mostrador, porPagar, pendientes } =
    datos;

  return (
    <main className="space-y-(--espacio-3) p-(--espacio-4)">
      {/* La misma forma que el `PageHeader` heredado: el bloque del título y, de
          hermano, el de las acciones. */}
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Buen día</h1>
          <p className="text-sm text-texto-sutil">{comoFecha(datos.fecha)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <a href="/ferreteria/mostrador">Ir al mostrador</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/ferreteria/entradas">Registrar compra</a>
          </Button>
        </div>
      </header>

      <div className="grid gap-(--espacio-3) xl:grid-cols-2">
        {/* 1 · LA CARTERA. Primero, porque es lo que no vuelve. */}
        <section className={TARJETA} aria-labelledby="t-cartera">
          <h2 id="t-cartera" className={ROTULO}>
            Lo que me deben
          </h2>
          <p className={CIFRA}>{pesos(cartera.totalCentavos)}</p>
          <p className="text-sm text-texto-sutil">Vencido {pesos(cartera.vencidoCentavos)}</p>
          {/* LA CARTERA, DIBUJADA. Es el indicador estrella del giro —«la pérdida que
              no admite vuelta atrás»— y la lista de abajo ya dice quién y cuánto; lo
              que la lista NO dice es la PROPORCIÓN: si son cuatro obras parecidas o
              una sola que se comió la mitad. Eso decide a quién se le habla hoy, y es
              exactamente lo que una barra contesta y una columna de cifras no.
              Empieza en cero siempre, como todas las de este sistema. */}
          {cartera.masViejos.length > 1 && (
            <GraficaDeBarras
              className="mt-(--espacio-3)"
              titulo="Las obras que más deben, por saldo"
              ejes={cartera.masViejos.map((quien) => quien.obra ?? quien.cliente)}
              series={[
                {
                  etiqueta: 'Saldo',
                  valores: cartera.masViejos.map((quien) => Number(quien.saldoCentavos)),
                },
              ]}
              formato={(valor) => PESOS.format(valor / 100)}
              alto={150}
            />
          )}
          {cartera.masViejos.length > 0 && (
            <ul className="mt-2 divide-y divide-borde">
              {cartera.masViejos.map((quien) => (
                <li key={`${quien.cliente}-${quien.obra ?? ''}`} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">
                    {quien.cliente}
                    {quien.obra !== null && (
                      <span className="text-texto-sutil"> · {quien.obra}</span>
                    )}
                  </span>
                  <span className="text-sm text-texto-sutil">{quien.dias} d</span>
                  <span className="tabular-nums">{pesos(quien.saldoCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="secondary" className="mt-2">
            <a href="/ferreteria/cuentas">Ver la cartera</a>
          </Button>
        </section>

        {/* 2 · EL DINERO DORMIDO, en pesos: «1,840 claves no significa nada». */}
        <section className={TARJETA} aria-labelledby="t-dormido">
          <h2 id="t-dormido" className={ROTULO}>
            Dinero dormido
          </h2>
          <p className={CIFRA}>{pesos(dormido.dineroCentavos)}</p>
          <p className="text-sm text-texto-sutil">
            {porciento(dormido.delInventarioBp)} del inventario · sin venta en 90 días
          </p>
          {dormido.peores.length > 0 && (
            <ul className="mt-2 divide-y divide-borde">
              {dormido.peores.map((linea) => (
                <li key={linea.linea} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">{linea.linea}</span>
                  <span className="text-sm text-texto-sutil">{linea.claves} claves</span>
                  <span className="tabular-nums">{pesos(linea.dineroCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="secondary" className="mt-2">
            <a href="/ferreteria/existencias">Ver qué está dormido</a>
          </Button>
        </section>

        {/* 3 · LO QUE SALIÓ Y NO ES DINERO. Las firmas son de HOY. */}
        <section className={TARJETA} aria-labelledby="t-credito">
          <h2 id="t-credito" className={ROTULO}>
            Salió hoy y no se cobró
          </h2>
          <p className={CIFRA}>{pesos(aCredito.importeCentavos)}</p>
          <p
            className={
              aCredito.remisionesSinFirma > 0
                ? 'text-sm font-semibold text-peligro'
                : 'text-sm text-texto-sutil'
            }
          >
            {porciento(aCredito.sobreVentaBp)} de la venta ·{' '}
            {aCredito.remisionesSinFirma === 0
              ? 'todas las remisiones con firma'
              : `${String(aCredito.remisionesSinFirma)} remisión(es) SIN FIRMA capturada`}
          </p>
        </section>

        {/* 4 · VENTA Y MARGEN, juntos: «vendí mucho» no es «gané mucho». */}
        <section className={TARJETA} aria-labelledby="t-venta">
          <h2 id="t-venta" className={ROTULO}>
            {voc.titulo('orden', true)} de hoy
          </h2>
          <p className={CIFRA}>
            {pesos(venta.hoyCentavos)}{' '}
            <span className={CIFRA_CHICA}>margen {porciento(margen.hoyBp)}</span>
          </p>
          <p className="text-sm text-texto-sutil">
            {comparacion(venta.hoyCentavos, venta.referenciaCentavos)} ·{' '}
            {voc.conNumero('orden', venta.tickets)}
          </p>
        </section>

        {/* 5 · QUÉ PEDIR, sólo lo que se mueve. */}
        <section className={TARJETA} aria-labelledby="t-pedir">
          <h2 id="t-pedir" className={ROTULO}>
            Qué pedir
          </h2>
          {porPedir.length === 0 ? (
            <p className="text-sm text-texto-sutil">Nada que se mueva está bajo mínimo.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {porPedir.map((fila) => (
                <li key={fila.proveedor} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">
                    {fila.proveedor}
                    {fila.pasaManana && (
                      <span className="ml-2 rounded-md bg-primario/15 px-1 text-xs font-semibold text-primario">
                        pasa mañana
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-texto-sutil">{fila.claves} claves</span>
                  <span className="tabular-nums">{pesos(fila.importeCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 6 · EL MOSTRADOR. «Líneas por venta» es lo que mide la asesoría. */}
        <section className={TARJETA} aria-labelledby="t-mostrador">
          <h2 id="t-mostrador" className={ROTULO}>
            Mostrador
          </h2>
          {mostrador.length === 0 ? (
            <p className="text-sm text-texto-sutil">Todavía no se ha cobrado nada hoy.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {mostrador.map((quien) => (
                <li key={quien.persona} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">{quien.persona}</span>
                  <span className="text-sm text-texto-sutil">
                    {(quien.lineasPorVentaBp / 100).toFixed(1)} líneas por {voc.singular('orden')}
                  </span>
                  <span className="tabular-nums">{pesos(quien.ventaCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 7 · LO QUE DEBO. La pregunta que quita el sueño. */}
        <section className={TARJETA} aria-labelledby="t-pagar">
          <h2 id="t-pagar" className={ROTULO}>
            Lo que debo esta semana
          </h2>
          <p className={CIFRA}>{pesos(porPagar.totalCentavos)}</p>
          {porPagar.documentos.length > 0 && (
            <ul className="mt-2 divide-y divide-borde">
              {porPagar.documentos.map((doc) => (
                <li key={`${doc.proveedor}-${doc.dia}`} className={RENGLON}>
                  <span className="min-w-0 flex-1 truncate">{doc.proveedor}</span>
                  <span className="text-sm text-texto-sutil">{doc.dia}</span>
                  <span className="tabular-nums">{pesos(doc.saldoCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 8 · EL CAJÓN, y está declarado como cajón a propósito. */}
        <section className={TARJETA} aria-labelledby="t-pendientes">
          <h2 id="t-pendientes" className={ROTULO}>
            Pendientes que se enfrían
          </h2>
          <ul className="divide-y divide-borde">
            <li className={RENGLON}>
              <span className="flex-1">Garantías sin resolver</span>
              <span className={CIFRA_CHICA}>{pendientes.garantias}</span>
            </li>
            <li className={RENGLON}>
              <span className="flex-1">Herramienta que no volvió</span>
              <span className={CIFRA_CHICA}>{pendientes.rentasVencidas}</span>
            </li>
            <li className={RENGLON}>
              <span className="flex-1">Rollos abiertos de más de 60 días</span>
              <span className={CIFRA_CHICA}>{pendientes.rollosViejos}</span>
            </li>
            <li className={RENGLON}>
              <span className="flex-1">Cotizaciones por vencer</span>
              <span className={CIFRA_CHICA}>{pendientes.cotizacionesPorVencer}</span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
