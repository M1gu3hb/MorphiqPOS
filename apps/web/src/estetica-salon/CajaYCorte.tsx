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
 * PANTALLA · estetica-salon · caja-y-corte
 *
 * El cierre del día en un salón, que tiene una salida que los demás no tienen:
 * las liquidaciones.
 *
 * ── Por qué la liquidación aparece EN el corte ──────────────────────────
 * Porque es la salida de efectivo más grande del día y sale del mismo cajón. Un
 * corte que no la ve encuentra $18,000 de menos un viernes cada quince y nadie
 * puede explicarlo con el arqueo delante. Aquí se ve como lo que es: dinero que
 * salió, con nombre.
 *
 * ── Por qué la propina entregada tampoco es un gasto ────────────────────
 * Es dinero de las clientas que pasó por el cajón. Contarla como gasto del
 * salón baja la utilidad del mes con dinero que nunca fue del salón; no
 * contarla deja el cajón descuadrado. Se enseña en su propio renglón.
 *
 * ── Por qué el esperado no se ve antes de contar ────────────────────────
 * Si se muestra, todo el mundo teclea ese número. Aparece con la diferencia,
 * después, que es cuando sirve.
 *
 * ── Y por qué se avisa de las citas sin cerrar ──────────────────────────
 * Un servicio sin cerrar no descontó producto de cabina. Cerrar el día con tres
 * pendientes deja el inventario de tinte inflado hasta que alguien se acuerde,
 * y nadie se acuerda.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben abrir, el resumen del día con sus salidas, el arqueo y el cierre. Queda
 * fuera el detalle de cada cobro, que vive en el histórico de citas.
 */

const RUTA_ESTADO = '/api/caja/estado';
const RUTA_ABRIR = '/api/caja/abrir';
const RUTA_CERRAR = '/api/caja/cerrar';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/**
 * Lo que `caja.cerrar` devuelve, y de donde sale el ESPERADO de verdad.
 *
 * ── El mismo defecto que tenia el corte del mostrador ─────────────────────
 * `esperadoCentavos` NO existe en la respuesta de `caja.estado`: lo que hay es
 * `efectivoEsperadoCentavos`, y solo cuando se le manda lo contado —a proposito,
 * porque contar con el numero delante no es contar—. Asi que el esperado valia
 * `NaN` aqui y `0` en el mostrador, y el dia se cerraba diciendo «Sobran <todo
 * lo contado>». Es el numero con el que se decide si alguien se llevo dinero.
 *
 * El cierre SI devuelve el arqueo entero. Se usa el suyo.
 */
export interface ResultadoDelCorte {
  readonly efectivoEsperadoCentavos: string;
  readonly efectivoContadoCentavos: string;
  readonly diferenciaCentavos: string;
}

export interface EstadoDelSalon {
  readonly sesionCajaId: string | null;
  readonly cobradoCentavos: string;
  readonly liquidacionesCentavos: string;
  readonly propinasEntregadasCentavos: string;
  readonly rentasCobradasCentavos: string;
  readonly citasSinCerrar: number;
}

export interface CajaYCorteProps {
  readonly estadoInicial?: EstadoDelSalon;
}

function pesos(centavos: string | number): string {
  return PESOS.format(Number(centavos) / 100);
}

function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/** «Faltan $340», no «−340»: leído de prisa a las nueve de la noche se confunde. */
export function leerDiferencia(centavos: number): string {
  if (centavos === 0) return 'Cuadra exacto';
  if (centavos < 0) return `Faltan ${PESOS.format(-centavos / 100)}`;
  return `Sobran ${PESOS.format(centavos / 100)}`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

export function CajaYCorte({ estadoInicial }: CajaYCorteProps) {
  const voc = useVocabulario();
  const [estado, setEstado] = useState<EstadoDelSalon | null>(estadoInicial ?? null);
  const [fondo, setFondo] = useState('');
  const [contado, setContado] = useState('');
  const [corte, setCorte] = useState<ResultadoDelCorte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (estadoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      invocarComando<EstadoDelSalon>(RUTA_ESTADO, {})
        .then((datos) => {
          if (sigueMontada()) setEstado(datos);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setError(mensajeDe(fallo));
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [estadoInicial]);

  function abrir(): void {
    const centavos = aCentavos(fondo);
    if (centavos === null) {
      setError('Revisa el fondo: sólo pesos y centavos.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando(RUTA_ABRIR, { fondoInicialCentavos: centavos })
      .then(() => invocarComando<EstadoDelSalon>(RUTA_ESTADO, {}))
      .then((datos) => {
        setEstado(datos);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function cerrar(): void {
    const centavos = aCentavos(contado);
    if (centavos === null) {
      setError('Pon lo que contaste.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<ResultadoDelCorte>(RUTA_CERRAR, { efectivoContadoCentavos: centavos })
      .then((resultado) => {
        setCorte(resultado);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (estado === null) {
    return (
      <div className="space-y-(--espacio-4) p-(--espacio-6)">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const abierta = estado.sesionCajaId !== null;
  const cerrado = corte !== null;
  // Lo dice el CIERRE, que es quien lo calculo sumando los movimientos del dia.
  const esperado = Number(corte?.efectivoEsperadoCentavos ?? 0);

  return (
    <main className="mx-auto max-w-2xl space-y-(--espacio-6) p-(--espacio-6)">
      <header>
        <h1 className="text-2xl font-semibold">Caja y corte</h1>
        <p className="text-texto-sutil text-sm">
          {abierta ? 'El día está abierto.' : 'Ábrelo para poder cobrar.'}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-peligro text-sm">
          {error}
        </p>
      )}

      {!abierta && (
        <section className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
          <Label htmlFor="fondo">Fondo con el que abres</Label>
          <Input
            id="fondo"
            inputMode="decimal"
            className="h-[calc(var(--altura-control)*1.4)] w-40 text-right text-lg"
            value={fondo}
            onChange={(evento) => {
              setFondo(evento.target.value);
            }}
          />
          <Button
            className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
            disabled={ocupado}
            onClick={abrir}
          >
            Abrir el día
          </Button>
        </section>
      )}

      {abierta && (
        <>
          <section className="space-y-2 rounded-lg border p-(--espacio-4)">
            <h2 className="font-medium">El día</h2>
            <p className="flex justify-between">
              <span>Cobrado</span>
              <span className="tabular-nums">{pesos(estado.cobradoCentavos)}</span>
            </p>
            <p className="flex justify-between">
              <span>Rentas cobradas</span>
              <span className="tabular-nums">{pesos(estado.rentasCobradasCentavos)}</span>
            </p>
            <Separator />
            {/* La salida más grande del día, y sale del mismo cajón: un corte
                que no la ve encuentra $18,000 de menos un viernes cada quince. */}
            <p className="flex justify-between">
              <span>Liquidaciones pagadas</span>
              <span className="tabular-nums">− {pesos(estado.liquidacionesCentavos)}</span>
            </p>
            <p className="flex justify-between">
              <span>Propinas entregadas</span>
              <span className="tabular-nums">− {pesos(estado.propinasEntregadasCentavos)}</span>
            </p>
            <p className="text-texto-sutil text-sm">
              La propina no es un gasto del salón: es dinero de {voc.enFrase('cliente', true)} que
              pasó por el cajón.
            </p>
          </section>

          {estado.citasSinCerrar > 0 && (
            <p className="text-sm">
              Hay {estado.citasSinCerrar} servicio{estado.citasSinCerrar === 1 ? '' : 's'} sin
              cerrar. Sin cerrarlos, el producto de cabina no se descontó y el inventario de tinte
              queda inflado.
            </p>
          )}

          {!cerrado && (
            <section className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
              <Label htmlFor="contado">Lo que contaste en el cajón</Label>
              <Input
                id="contado"
                inputMode="decimal"
                className="h-[calc(var(--altura-control)*1.4)] w-40 text-right text-lg"
                value={contado}
                onChange={(evento) => {
                  setContado(evento.target.value);
                }}
              />
              <Button
                className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
                disabled={ocupado}
                onClick={cerrar}
              >
                Cerrar el día
              </Button>
            </section>
          )}

          {cerrado && (
            <section className="space-y-2 rounded-lg border p-(--espacio-4)">
              <h2 className="font-medium">Día cerrado</h2>
              <p className="text-texto-sutil text-sm">
                Esperado {pesos(esperado)} · contado{' '}
                {PESOS.format(Number(corte.efectivoContadoCentavos) / 100)}
              </p>
              <p className="text-2xl font-semibold">
                {leerDiferencia(Number(corte.diferenciaCentavos))}
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
