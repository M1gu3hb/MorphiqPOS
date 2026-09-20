'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · liquidacion
 *
 * El día de pago: lo que se le debe a cada quien, renglón por renglón.
 *
 * ── Por qué se enseña el DETALLE y no el total ──────────────────────────
 * Porque la conversación del quince no es «cuánto me toca», es «por qué me toca
 * eso». Un total sin renglones obliga a la dueña a defenderlo de memoria, y al
 * tercer mes deja de liquidar por sistema y vuelve al papel — que es donde
 * estaba el problema.
 *
 * ── Por qué la propina NUNCA se mezcla con la comisión ──────────────────
 * No es del salón. Sumarlas haría que la comisión se calculara sobre dinero que
 * la clienta le dejó a ella mirándola a los ojos, y que el salón le pagara
 * comisión sobre su propia propina.
 *
 * ── Por qué lo que ella cobró se RESTA y se dice ────────────────────────
 * Si atendió y cobró directo —renta de estación, servicio a domicilio—, ese
 * dinero ya está en su bolsa. No restarlo es pagarle dos veces, y es el error
 * más caro de esta pantalla porque nadie lo nota hasta el cierre del mes.
 *
 * ── Por qué el comprobante se ve ANTES de pagar ─────────────────────────
 * Porque una vez pagado ya no se discute: se reclama. Verlo antes convierte una
 * reclamación en una pregunta.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el periodo, el detalle por profesional, el comprobante y el pago. Queda
 * fuera la edición de la regla de comisión, que es del catálogo.
 */

const RUTA_PROFESIONALES = '/api/profesionales';
const RUTA_LIQUIDAR = '/api/liquidaciones';
const RUTA_COMPROBANTE = '/api/liquidaciones';

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface FichaDeProfesional {
  readonly profesionalId: string;
  readonly nombreCompleto: string;
  readonly rentaEstacion: boolean;
}

export interface ComisionDeLinea {
  readonly comisionId: string;
  readonly tipo: string;
  readonly baseCentavos: string;
  readonly tasaBp: number;
  readonly montoCentavos: string;
  readonly liquidada: boolean;
  readonly causadaEn: string;
}

export interface Comisiones {
  readonly causadoCentavos: string;
  readonly liquidadoCentavos: string;
  readonly pendienteCentavos: string;
  readonly lineas: readonly ComisionDeLinea[];
}

export interface Comprobante {
  readonly liquidacionId: string;
  readonly nombreCompleto: string;
  readonly comisionCentavos: string;
  readonly propinaCentavos: string;
  readonly materialCargadoCentavos: string;
  readonly rentaCentavos: string;
  readonly cobradoPorEllaCentavos: string;
  readonly anticiposCentavos: string;
  readonly totalCentavos: string;
  readonly pagadaEn: string | null;
}

export interface LiquidacionProps {
  readonly profesionalesIniciales?: readonly FichaDeProfesional[];
  readonly desde?: string;
  readonly hasta?: string;
}

function pesos(centavos: string): string {
  return PESOS.format(Number(centavos) / 100);
}

/**
 * Los renglones del comprobante, en el orden en que se explican.
 *
 * Lo que SUMA primero y lo que RESTA después: leído al revés, el total parece
 * un castigo en vez de una cuenta.
 */
export function renglonesDe(
  comprobante: Comprobante,
  /**
   * Cómo se llama la UNIDAD DE SERVICIO en este giro: estación en un salón, silla
   * en una barbería, cabina en un spa. Tecleada, el comprobante de la barbería
   * cobraba «renta de estación» por una silla.
   */
  comoSeLlamaLaEstacion = 'estación',
): readonly {
  readonly etiqueta: string;
  readonly importe: string;
  readonly resta: boolean;
}[] {
  return [
    { etiqueta: 'Comisión', importe: comprobante.comisionCentavos, resta: false },
    { etiqueta: 'Propina', importe: comprobante.propinaCentavos, resta: false },
    { etiqueta: 'Material cargado', importe: comprobante.materialCargadoCentavos, resta: true },
    {
      etiqueta: `Renta de ${comoSeLlamaLaEstacion}`,
      importe: comprobante.rentaCentavos,
      resta: true,
    },
    { etiqueta: 'Lo que ella cobró', importe: comprobante.cobradoPorEllaCentavos, resta: true },
    { etiqueta: 'Anticipos', importe: comprobante.anticiposCentavos, resta: true },
  ];
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo liquidar. Vuelve a intentarlo.';
}

export function Liquidacion({ profesionalesIniciales, desde, hasta }: LiquidacionProps) {
  const voc = useVocabulario();
  const [profesionales, setProfesionales] = useState<readonly FichaDeProfesional[] | null>(
    profesionalesIniciales ?? null,
  );
  const [elegida, setElegida] = useState<FichaDeProfesional | null>(null);
  const [periodo, setPeriodo] = useState({ desde: desde ?? '', hasta: hasta ?? '' });
  const [comisiones, setComisiones] = useState<Comisiones | null>(null);
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (profesionalesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      invocarComando<{ readonly profesionales: readonly FichaDeProfesional[] }>(
        RUTA_PROFESIONALES,
        { incluirInactivos: false },
      )
        .then((salida) => {
          if (sigueMontada()) setProfesionales(salida.profesionales);
        })
        .catch(() => {
          if (sigueMontada()) setProfesionales([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [profesionalesIniciales]);

  function abrir(profesional: FichaDeProfesional): void {
    setElegida(profesional);
    setComisiones(null);
    setComprobante(null);
    setError(null);
    if (periodo.desde === '' || periodo.hasta === '') return;
    invocarComando<Comisiones>(`${RUTA_PROFESIONALES}/${profesional.profesionalId}/comisiones`, {
      desde: periodo.desde,
      hasta: periodo.hasta,
    })
      .then((datos) => {
        setComisiones(datos);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      });
  }

  function liquidar(): void {
    if (elegida === null) return;
    if (periodo.desde === '' || periodo.hasta === '') {
      setError('Elige el periodo.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly liquidacionId: string }>(RUTA_LIQUIDAR, {
      profesionalId: elegida.profesionalId,
      periodoDesde: periodo.desde,
      periodoHasta: periodo.hasta,
    })
      .then((salida) =>
        // El comprobante se pide ENSEGUIDA y se enseña antes de pagar: una vez
        // pagado ya no se discute, se reclama.
        invocarComando<Comprobante>(`${RUTA_COMPROBANTE}/${salida.liquidacionId}/comprobante`, {}),
      )
      .then((datos) => {
        setComprobante(datos);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (profesionales === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[18rem_1fr]">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Liquidación</h1>
        <div>
          <Label htmlFor="desde">Desde</Label>
          <Input
            id="desde"
            type="date"
            className="h-[calc(var(--altura-control)*1.2)]"
            value={periodo.desde}
            onChange={(evento) => {
              setPeriodo({ ...periodo, desde: evento.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="hasta">Hasta</Label>
          <Input
            id="hasta"
            type="date"
            className="h-[calc(var(--altura-control)*1.2)]"
            value={periodo.hasta}
            onChange={(evento) => {
              setPeriodo({ ...periodo, hasta: evento.target.value });
            }}
          />
        </div>

        <Separator />

        <ul className="divide-y">
          {profesionales.map((profesional) => (
            <li key={profesional.profesionalId}>
              <button
                type="button"
                className={`w-full py-2 text-left ${
                  elegida?.profesionalId === profesional.profesionalId ? 'font-medium' : ''
                }`}
                onClick={() => {
                  abrir(profesional);
                }}
              >
                {profesional.nombreCompleto}
                {profesional.rentaEstacion && (
                  <span className="text-muted-foreground ml-2 text-xs">renta</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        {elegida === null && (
          <p className="text-muted-foreground">Elige a quién se le va a pagar.</p>
        )}

        {elegida !== null && comisiones !== null && comprobante === null && (
          <>
            <h2 className="text-xl font-medium">{elegida.nombreCompleto}</h2>
            <div className="flex gap-8">
              <div>
                <p className="text-muted-foreground text-sm">Causado</p>
                <p className="text-xl tabular-nums">{pesos(comisiones.causadoCentavos)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Ya liquidado</p>
                <p className="text-xl tabular-nums">{pesos(comisiones.liquidadoCentavos)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Pendiente</p>
                <p className="text-xl font-semibold tabular-nums">
                  {pesos(comisiones.pendienteCentavos)}
                </p>
              </div>
            </div>

            <h3 className="font-medium">Renglón por renglón</h3>
            <ul className="divide-y text-sm">
              {comisiones.lineas.map((linea) => (
                <li key={linea.comisionId} className="flex items-baseline justify-between py-1">
                  <span>{linea.causadaEn.slice(0, 10)}</span>
                  <span className="text-muted-foreground">
                    {linea.tipo} · {(linea.tasaBp / 100).toFixed(1)} % de{' '}
                    {pesos(linea.baseCentavos)}
                  </span>
                  <span className="tabular-nums">{pesos(linea.montoCentavos)}</span>
                </li>
              ))}
            </ul>

            <Button
              className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
              disabled={ocupado}
              onClick={liquidar}
            >
              Calcular la liquidación
            </Button>
          </>
        )}

        {comprobante !== null && (
          <div className="space-y-3 rounded-lg border p-4">
            <h2 className="text-xl font-medium">{comprobante.nombreCompleto}</h2>
            <ul className="divide-y">
              {renglonesDe(comprobante, voc.singular('unidad_servicio')).map((renglon) => (
                <li key={renglon.etiqueta} className="flex items-baseline justify-between py-2">
                  <span>{renglon.etiqueta}</span>
                  <span className="tabular-nums">
                    {renglon.resta ? '− ' : ''}
                    {pesos(renglon.importe)}
                  </span>
                </li>
              ))}
            </ul>
            <Separator />
            <p className="flex items-baseline justify-between text-xl font-semibold">
              <span>Se le paga</span>
              <span className="tabular-nums">{pesos(comprobante.totalCentavos)}</span>
            </p>
            <p className="text-muted-foreground text-sm">
              La propina va aparte de la comisión: no es del salón y no se comisiona.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
