'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · abarrotes · cortes
 *
 * El arqueo de la noche y el histórico de los cortes que ya se hicieron.
 *
 * ── Por qué el esperado NO se enseña mientras se cuenta ─────────────────
 * Si se muestra, todo el mundo teclea ese número y el arqueo deja de existir:
 * deja de ser un conteo y pasa a ser una confirmación. Aparece DESPUÉS de
 * contar, junto a la diferencia, que es cuando de verdad sirve para algo.
 *
 * ── Por qué se cuenta por denominación y no de un tirón ─────────────────
 * Faltan $500 y falta un billete de $500 son el mismo número y dos problemas
 * distintos: el primero puede ser cambio mal dado durante todo el día, el
 * segundo es un billete que se fue. Con el total no se distinguen, y son dos
 * conversaciones opuestas.
 *
 * ── Por qué la diferencia se dice con palabra y no sólo con signo ───────
 * «−340» leído de prisa a las diez de la noche se confunde. «Faltan $340» no.
 *
 * ── Por qué se avisa de los movimientos SIN MOTIVO ──────────────────────
 * «Faltan $340» no le sirve a nadie. «Faltan $340 y hubo tres retiros sin
 * explicación» es una conversación que se puede tener con quien corresponde.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben contar, cerrar y ver los cortes anteriores con su diferencia. Queda
 * fuera el detalle movimiento por movimiento, que vive en REGISTROS.
 */

const RUTA_CERRAR = '/api/caja/cerrar';
const RUTA_ESTADO = '/api/caja/estado';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Las denominaciones que de verdad hay en un cajón de tiendita. */
const DENOMINACIONES = [500_00, 200_00, 100_00, 50_00, 20_00, 10_00, 5_00, 2_00, 1_00] as const;

/**
 * UN CORTE DEL HISTÓRICO, con los nombres que el puente SIRVE.
 *
 * Aquí se leían `fecha`, `esperado_centavos`, `contado_centavos` y `empleado`, y la
 * entidad `CorteCaja` no sirve ninguno de los cuatro: sirve `fecha_cierre`,
 * `efectivo_contado` —en PESOS, por la conversión `dinero`— y
 * `usuario_cajero_nombre`. Los cuatro llegaban `undefined`, así que el histórico
 * enseñaba «sin firma» en cada renglón y la diferencia salía `NaN`.
 *
 * El ESPERADO no se sirve, y no es un olvido: no es una columna. Se deriva de la
 * suma de `movimientos_caja` de esa sesión, y el que decide el arqueo lo calcula
 * `caja.documento_corte`. Aquí se declara opcional para que la pantalla tenga que
 * decir «—» en vez de restar contra `undefined` y enseñar un faltante inventado.
 */
export interface CorteHecho {
  readonly id: string;
  readonly fecha_cierre: string | null;
  /** EN PESOS, como lo sirve el puente. */
  readonly efectivo_contado: number | null;
  readonly usuario_cajero_nombre: string | null;
  /** No se sirve: se deriva de los movimientos. Ver la cabecera. */
  readonly esperado_centavos?: number;
}

export interface ResumenDelTurno {
  readonly sesionCajaId: string | null;
  readonly movimientosSinMotivo: number;
}

/**
 * Lo que `caja.cerrar` devuelve, y de donde sale el ESPERADO de verdad.
 *
 * ── El defecto que esto arregla ────────────────────────────────────────────
 * Esta pantalla leía `esperadoCentavos` del estado del turno, y **ese campo no
 * existe**: `caja.estado` sirve `efectivoEsperadoCentavos`, y sólo cuando se le
 * manda lo contado —a proposito, porque contar con el numero delante no es
 * contar—. Asi que `esperado` valia siempre 0 y cada cierre decia «Sobran
 * <todo lo contado>»: un cajero que cerraba con $542.90 leia «Sobran $542.90»,
 * que es justo el numero con el que se decide si alguien se llevo dinero.
 *
 * El cierre SI devuelve el arqueo entero. Se usa el suyo.
 */
export interface ResultadoDelCorte {
  readonly efectivoEsperadoCentavos: string;
  readonly efectivoContadoCentavos: string;
  readonly diferenciaCentavos: string;
}

export interface CortesProps {
  readonly resumenInicial?: ResumenDelTurno;
  readonly historicoInicial?: readonly CorteHecho[];
}

const PESOS_ENTEROS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function pesos(centavos: number | string): string {
  return PESOS.format(Number(centavos) / 100);
}

/** «Faltan $340», no «−340»: leído de prisa a las diez de la noche se confunde. */
export function leerDiferencia(centavos: number): string {
  if (centavos === 0) return 'Cuadra exacto';
  if (centavos < 0) return `Faltan ${PESOS.format(-centavos / 100)}`;
  return `Sobran ${PESOS.format(centavos / 100)}`;
}

/** Piezas × denominación, en centavos enteros. Nada de punto flotante. */
export function totalContado(piezas: Readonly<Record<number, string>>): number {
  let total = 0;
  for (const denominacion of DENOMINACIONES) {
    const texto = (piezas[denominacion] ?? '').trim();
    if (texto === '' || !/^\d{1,4}$/.test(texto)) continue;
    total += Number(texto) * denominacion;
  }
  return total;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo cerrar. Lo contado sigue aquí: vuelve a intentarlo.';
}

export function Cortes({ resumenInicial, historicoInicial }: CortesProps) {
  const [resumen, setResumen] = useState<ResumenDelTurno | null>(resumenInicial ?? null);
  const [historico, setHistorico] = useState<readonly CorteHecho[] | null>(
    historicoInicial ?? null,
  );
  const [piezas, setPiezas] = useState<Record<number, string>>({});
  const [otrosCentavos, setOtrosCentavos] = useState('');
  const [corte, setCorte] = useState<ResultadoDelCorte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (resumenInicial !== undefined && historicoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const cargar = (): void => {
      if (resumenInicial === undefined) {
        invocarComando<ResumenDelTurno>(RUTA_ESTADO, {})
          .then((datos) => {
            if (sigueMontada()) setResumen(datos);
          })
          .catch(() => {
            if (sigueMontada()) setError('No se pudo leer el turno.');
          });
      }
      if (historicoInicial === undefined) {
        consultarPuente<CorteHecho>('CorteCaja', {
          limite: 20,
          // Descendente se escribe con un guion delante, que es la sintaxis del
          // puente —`orden.startsWith('-')`— y la de su código original. Aquí
          // decía `'fecha_cierre:desc'`, de la plataforma anterior, y el puente
          // contestaba 400 «no se puede ordenar por «fecha_cierre:desc»»: el
          // histórico de cortes salía vacío en una pantalla que abría en 200.
          orden: '-fecha_cierre',
          signal: control.signal,
        })
          .then((filas) => {
            if (sigueMontada()) setHistorico(filas);
          })
          .catch(() => {
            if (sigueMontada()) setHistorico([]);
          });
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [resumenInicial, historicoInicial]);

  const sueltos = aCentavosSueltos(otrosCentavos);
  const contado = totalContado(piezas) + (sueltos ?? 0);
  const cerrado = corte !== null;
  // El esperado lo dice el CIERRE, que es quien lo calcula sumando los
  // movimientos del turno —la apertura con su fondo y cada venta en efectivo—.
  const esperado = Number(corte?.efectivoEsperadoCentavos ?? 0);
  const contadoDelCorte = corte === null ? contado : Number(corte.efectivoContadoCentavos);
  const abierta = resumen?.sesionCajaId != null;

  function cerrar(): void {
    if (sueltos === null) {
      setError('Revisa el importe suelto: sólo pesos y centavos.');
      return;
    }
    setGuardando(true);
    setError(null);
    invocarComando<ResultadoDelCorte>(RUTA_CERRAR, { efectivoContadoCentavos: contado })
      .then((resultado) => {
        // El esperado aparece AHORA, y no antes: contar con el número delante
        // no es contar. Y sale del cierre, que es quien lo calculó.
        setCorte(resultado);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  if (resumen === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Cortes</h1>
        <p className="text-muted-foreground text-sm">
          {abierta ? 'Cuenta el cajón y ciérralo.' : 'No hay turno abierto.'}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {abierta && !cerrado && (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="font-medium">Cuenta el cajón</h2>
            <p className="text-muted-foreground text-sm">
              Por denominación. Faltar $500 y faltar un billete de $500 son dos problemas distintos.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {DENOMINACIONES.map((denominacion) => (
              <div key={denominacion}>
                <Label htmlFor={`d-${String(denominacion)}`}>
                  {PESOS_ENTEROS.format(denominacion / 100)}
                </Label>
                <Input
                  id={`d-${String(denominacion)}`}
                  inputMode="numeric"
                  className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                  value={piezas[denominacion] ?? ''}
                  onChange={(evento) => {
                    setPiezas({ ...piezas, [denominacion]: evento.target.value });
                  }}
                />
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="sueltos">Centavos sueltos</Label>
            <Input
              id="sueltos"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.4)] w-40 text-right text-lg"
              value={otrosCentavos}
              onChange={(evento) => {
                setOtrosCentavos(evento.target.value);
              }}
            />
          </div>

          <Separator />

          <p className="text-lg">
            Contado <span className="font-semibold tabular-nums">{pesos(contado)}</span>
          </p>
          <Button
            className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
            disabled={guardando || contado === 0}
            onClick={cerrar}
          >
            Cerrar el turno
          </Button>
        </section>
      )}

      {cerrado && (
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="font-medium">Turno cerrado</h2>
          <p className="text-muted-foreground text-sm">
            Esperado {pesos(esperado)} · contado {pesos(contadoDelCorte)}
          </p>
          <p className="text-2xl font-semibold">
            {leerDiferencia(Number(corte.diferenciaCentavos))}
          </p>
          {resumen.movimientosSinMotivo > 0 && (
            <p className="text-sm">
              Hubo {resumen.movimientosSinMotivo} movimiento
              {resumen.movimientosSinMotivo === 1 ? '' : 's'} sin explicación. Es lo primero que hay
              que mirar.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium">Cortes anteriores</h2>
        {historico === null && <Skeleton className="h-24 w-full" />}
        {historico !== null && historico.length === 0 && (
          <p className="text-muted-foreground text-sm">Todavía no hay cortes.</p>
        )}
        <ul className="divide-y">
          {(historico ?? []).map((corte) => (
            <li key={corte.id} className="flex items-baseline justify-between py-2">
              <span>{(corte.fecha_cierre ?? '').slice(0, 10)}</span>
              <span className="text-muted-foreground text-sm">
                {corte.usuario_cajero_nombre ?? 'sin firma'}
              </span>
              <span className="tabular-nums">
                {corte.esperado_centavos === undefined
                  ? '—'
                  : leerDiferencia(
                      Math.round((corte.efectivo_contado ?? 0) * 100) - corte.esperado_centavos,
                    )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function aCentavosSueltos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return 0;
  if (!IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}
