'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · ferreteria · conteo
 *
 * Contar seis mil tornillos sin contarlos: la báscula, y lo que eso significa.
 *
 * ── Por qué el resultado NUNCA se presenta como exacto ──────────────────
 * Nadie cuenta seis mil tornillos: se pesa la caja y se divide. Ese número es
 * una ESTIMACIÓN, y presentarlo como conteo lo mete al kardex como si alguien
 * hubiera contado pieza por pieza. A partir de ahí nadie puede distinguir un
 * faltante real de la tolerancia de la balanza, que es exactamente el dato que
 * el conteo existía para dar.
 *
 * ── Por qué se enseña el RANGO y no sólo el número ──────────────────────
 * «Unas 6,000, entre 5,550 y 6,520» permite decidir; «6,000» obliga a creerse
 * una precisión que la báscula no tiene. Cuando el rango es tan ancho que no
 * sirve para decidir, la pantalla lo dice y no lo esconde.
 *
 * ── Por qué la tara es un campo y no una suposición ─────────────────────
 * La cubeta pesa. Pesar el material con el recipiente y no restarlo suma dos
 * kilos de plástico al conteo de tornillería, y esos dos kilos son cuatrocientas
 * piezas que no existen.
 *
 * ── Por qué sin calibrar no se puede contar ─────────────────────────────
 * Sin el peso de una pieza, dividir es inventarse el número. El mensaje dice
 * qué falta: «no se puede» manda a alguien a buscar por qué.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben calibrar, contar por peso y capturar a mano lo que no se pesa. Queda
 * fuera el cierre de la toma con su ajuste, que es del tronco.
 */

const RUTA_CALIBRAR = '/api/catalogo/calibrar-peso';
const RUTA_CONTAR = '/api/inventario/conteo/peso';

const PESO_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,3})?$/;

/** Gramos a miligramos: todo el peso vive en la unidad entera. */
const MG_POR_GRAMO = 1_000;

export interface ClaveContable {
  readonly id: string;
  readonly nombre: string;
  /** `conversion: 'entero'` en el puente: NÚMERO de miligramos. */
  readonly peso_por_pieza_mg: number | null;
  /** `conversion: 'decimal'`: NÚMERO de por ciento. */
  readonly tolerancia_peso_pct: number;
}

export interface Estimacion {
  readonly piezasEstimadas: number;
  readonly minimo: number;
  readonly maximo: number;
  readonly confiable: boolean;
}

export interface ConteoProps {
  readonly tomaId: string;
  readonly clavesIniciales?: readonly ClaveContable[];
}

export function aMiligramos(gramos: string): number | null {
  const limpio = gramos.trim().replace(',', '.');
  if (limpio === '' || !PESO_CON_FORMA.test(limpio)) return null;
  return Math.round(Number(limpio) * MG_POR_GRAMO);
}

/** El rango, dicho como se dice en el mostrador. */
export function leerEstimacion(estimacion: Estimacion): string {
  if (estimacion.confiable) {
    return `Unas ${String(estimacion.piezasEstimadas)} piezas`;
  }
  return `Entre ${String(estimacion.minimo)} y ${String(estimacion.maximo)}: la báscula no da para más`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

export function Conteo({ tomaId, clavesIniciales }: ConteoProps) {
  const [claves, setClaves] = useState<readonly ClaveContable[] | null>(clavesIniciales ?? null);
  const [elegida, setElegida] = useState<ClaveContable | null>(null);
  const [muestra, setMuestra] = useState({ peso: '', piezas: '' });
  const [pesada, setPesada] = useState({ total: '', tara: '' });
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (clavesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      // Sin id no se consulta.
      //
      // Estas pantallas se abren SIN nada seleccionado -`page.tsx` las monta con
      // la cadena vacia- y consultar con ella manda un `where id = ''` a una
      // columna uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en
      // cada apertura. El estado de «elige algo» ya esta escrito debajo; lo que
      // faltaba era no pedir datos de lo que nadie eligio.
      if (tomaId === '') return;
      consultarPuente<ClaveContable>('ProductoTerminado', { limite: 200, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setClaves(filas);
        })
        .catch(() => {
          if (sigueMontada()) setClaves([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [clavesIniciales, tomaId]);

  function calibrar(): void {
    if (elegida === null) return;
    const peso = aMiligramos(muestra.peso);
    const piezas = Number(muestra.piezas);
    if (peso === null || !Number.isInteger(piezas) || piezas < 10) {
      setError('La muestra va con su peso y al menos diez piezas contadas de verdad.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly pesoPorPiezaMg: string; readonly variacionPct: string | null }>(
      RUTA_CALIBRAR,
      { productoId: elegida.id, pesoMuestraMg: peso, piezasMuestra: piezas, toleranciaPct: 8 },
    )
      .then((salida) => {
        // El comando contesta el peso en TEXTO —`bigint.toString()`— y el puente lo
        // sirve como número: la fila de la pantalla guarda lo segundo, que es lo que
        // se leerá la próxima vez.
        const actualizada = {
          ...elegida,
          peso_por_pieza_mg: Number(salida.pesoPorPiezaMg),
        };
        setElegida(actualizada);
        setClaves((claves ?? []).map((c) => (c.id === elegida.id ? actualizada : c)));
        // La variación se dice: recalibrar de 5 g a 50 g casi siempre es un cero
        // de más al teclear, y el conteo daría la décima parte durante meses.
        setAviso(
          salida.variacionPct === null
            ? 'Calibrado.'
            : `Calibrado. Cambió ${salida.variacionPct} % contra lo anterior.`,
        );
        setMuestra({ peso: '', piezas: '' });
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function contar(): void {
    if (elegida === null) return;
    const total = aMiligramos(pesada.total);
    const tara = aMiligramos(pesada.tara) ?? 0;
    if (total === null) {
      setError('Pon lo que marcó la báscula.');
      return;
    }
    setOcupado(true);
    setError(null);
    setEstimacion(null);
    invocarComando<Estimacion>(RUTA_CONTAR, {
      tomaId,
      productoId: elegida.id,
      pesoTotalMg: total,
      taraMg: tara,
    })
      .then((salida) => {
        setEstimacion(salida);
        setPesada({ total: '', tara: '' });
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  // El VACÍO QUE ENSEÑA. Ver el mismo caso en `abarrotes/Producto`: sin toma
  // abierta esta pantalla se quedaba en su esqueleto, en blanco, para siempre.
  if (tomaId === '' && clavesIniciales === undefined) {
    return (
      <main className="mx-auto max-w-prose space-y-(--espacio-3) p-(--espacio-8) text-center">
        <h1 className="text-xl font-semibold">Aquí se cuenta una zona del almacén</h1>
        <p className="text-muted-foreground text-sm">
          El conteo cíclico cuenta un anaquel al día en vez de cerrar la cortina un domingo entero.
          Se abre desde Existencias, eligiendo la zona que toca; aquí sólo se captura lo contado.
        </p>
        <Button asChild>
          <a href="/ferreteria/existencias">Ir a Existencias</a>
        </Button>
      </main>
    );
  }

  if (claves === null) {
    return (
      <div className="space-y-(--espacio-4) p-(--espacio-6)">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const calibrada = elegida !== null && elegida.peso_por_pieza_mg !== null;

  return (
    <main className="mx-auto grid max-w-5xl gap-(--espacio-6) p-(--espacio-6) md:grid-cols-[20rem_1fr]">
      <section className="space-y-(--espacio-3)">
        <h1 className="text-2xl font-semibold">Conteo</h1>
        <ul className="divide-y">
          {claves.map((clave) => (
            <li key={clave.id}>
              <button
                type="button"
                className={`w-full py-2 text-left ${elegida?.id === clave.id ? 'font-medium' : ''}`}
                onClick={() => {
                  setElegida(clave);
                  setEstimacion(null);
                  setError(null);
                  setAviso(null);
                }}
              >
                {clave.nombre}
                <span className="text-muted-foreground ml-2 text-xs">
                  {clave.peso_por_pieza_mg === null ? 'sin calibrar' : 'se pesa'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-(--espacio-4)">
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {aviso !== null && <p className="text-sm">{aviso}</p>}

        {elegida === null && (
          <p className="text-muted-foreground">Elige una clave para contarla.</p>
        )}

        {elegida !== null && (
          <>
            <h2 className="text-xl font-medium">{elegida.nombre}</h2>

            {!calibrada && (
              <div className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
                <h3 className="font-medium">Primero se calibra</h3>
                <p className="text-muted-foreground text-sm">
                  Se pesa una muestra y se cuentan sus piezas de verdad. Sin esto, dividir es
                  inventarse el número.
                </p>
                <div className="grid gap-(--espacio-3) md:grid-cols-2">
                  <div>
                    <Label htmlFor="m-peso">Peso de la muestra (g)</Label>
                    <Input
                      id="m-peso"
                      inputMode="decimal"
                      className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                      value={muestra.peso}
                      onChange={(evento) => {
                        setMuestra({ ...muestra, peso: evento.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="m-piezas">Piezas contadas</Label>
                    <Input
                      id="m-piezas"
                      inputMode="numeric"
                      className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                      value={muestra.piezas}
                      onChange={(evento) => {
                        setMuestra({ ...muestra, piezas: evento.target.value });
                      }}
                    />
                  </div>
                </div>
                <Button
                  className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
                  disabled={ocupado}
                  onClick={calibrar}
                >
                  Calibrar
                </Button>
              </div>
            )}

            {calibrada && (
              <div className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
                <h3 className="font-medium">Pesar</h3>
                <div className="grid gap-(--espacio-3) md:grid-cols-2">
                  <div>
                    <Label htmlFor="p-total">Lo que marca la báscula (g)</Label>
                    <Input
                      id="p-total"
                      inputMode="decimal"
                      className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                      value={pesada.total}
                      onChange={(evento) => {
                        setPesada({ ...pesada, total: evento.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="p-tara">La cubeta pesa (g)</Label>
                    <Input
                      id="p-tara"
                      inputMode="decimal"
                      className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                      value={pesada.tara}
                      onChange={(evento) => {
                        setPesada({ ...pesada, tara: evento.target.value });
                      }}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      No restarla suma dos kilos de plástico al conteo.
                    </p>
                  </div>
                </div>
                <Button
                  className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
                  disabled={ocupado}
                  onClick={contar}
                >
                  Contar
                </Button>
              </div>
            )}

            {estimacion !== null && (
              <div className="space-y-2 rounded-lg border p-(--espacio-4)">
                <p className="text-2xl font-semibold">{leerEstimacion(estimacion)}</p>
                <p className="text-muted-foreground text-sm">
                  Entre {estimacion.minimo} y {estimacion.maximo}. Es una estimación por peso, no un
                  conteo pieza por pieza, y así queda anotada.
                </p>
                {!estimacion.confiable && (
                  <p className="text-sm">
                    El rango es demasiado ancho para decidir con él. Si importa, hay que contarlo.
                  </p>
                )}
              </div>
            )}

            <Separator />

            {calibrada && (
              <p className="text-muted-foreground text-sm">
                Una pieza pesa {String(elegida.peso_por_pieza_mg)} mg, con ±
                {String(elegida.tolerancia_peso_pct)} % de tolerancia.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
