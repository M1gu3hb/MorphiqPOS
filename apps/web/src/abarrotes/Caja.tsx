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
 * PANTALLA · abarrotes · caja
 *
 * Abrir el cajón, meterle cambio a media mañana y sacar lo que se lleva al
 * banco. No es el corte: el corte cuenta lo que hubo y esto mueve lo que hay.
 *
 * ── Por qué el fondo se captura DESGLOSADO ──────────────────────────────
 * «$1,500» no dice si se puede dar cambio. A las siete de la mañana con un
 * billete de quinientos y sin monedas de diez, la tienda no puede cobrar un
 * refresco — y el número que dice si eso va a pasar es cuánto hay EN MONEDAS.
 * Un solo importe esconde exactamente el problema que el fondo viene a
 * resolver, y por eso son tres campos y no uno.
 *
 * ── Por qué la entrada de cambio es su propio botón ─────────────────────
 * Porque no es un depósito ni una venta: es fondo. Registrarla como venta infla
 * el día; no registrarla hace que el arqueo de la noche encuentre $600 de más y
 * que el cajero pase veinte minutos buscando una venta que no existe. Tenerla
 * escondida dentro de «movimiento» es tenerla sin usar.
 *
 * ── Por qué el retiro pide motivo y el cambio pide ORIGEN ───────────────
 * Son preguntas distintas. Lo que sale necesita explicarse —un retiro sin
 * motivo es la única salida de dinero que puede esconder un faltante—, y lo que
 * entra necesita saberse de dónde vino, porque casi siempre salió de la bolsa
 * de alguien y hay que devolvérselo.
 *
 * ── Por qué el esperado NO se enseña al abrir ───────────────────────────
 * Misma regla del arqueo: si se muestra, todo el mundo teclea ese número. Aquí
 * se enseña DESPUÉS de abrir, porque a partir de ese momento ya no es un dato
 * que se pueda copiar: es contra lo que se va a cuadrar en la noche.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben abrir, meter cambio, retirar y ver el esperado del turno. Queda fuera
 * el cierre con arqueo por denominación, que es la pantalla CORTES.
 */

const RUTA_ABRIR = '/api/caja/abrir';
const RUTA_CAMBIO = '/api/caja/entrada-cambio';
const RUTA_MOVIMIENTO = '/api/caja/movimiento';
const RUTA_ESTADO = '/api/caja/estado';

/** Forma de un importe tecleado. Sin `Number` ni `parseFloat` de por medio. */
const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Los tres montones en que de verdad se reparte un fondo de mostrador. */
const DENOMINACIONES = [
  { clave: 'monedas', etiqueta: 'Monedas', ayuda: 'de $1, $2, $5 y $10' },
  { clave: 'chicos', etiqueta: 'Billetes chicos', ayuda: 'de $20, $50 y $100' },
  { clave: 'grandes', etiqueta: 'Billetes grandes', ayuda: 'de $200 y $500' },
] as const;

type Denominacion = (typeof DENOMINACIONES)[number]['clave'];

const ORIGENES = [
  { clave: 'banco', etiqueta: 'Del banco' },
  { clave: 'caja_chica', etiqueta: 'De caja chica' },
  { clave: 'dueno', etiqueta: 'De mi bolsa' },
  { clave: 'otra_caja', etiqueta: 'De la otra caja' },
] as const;

export interface EstadoDeCaja {
  readonly sesionCajaId: string | null;
  readonly fondoEsperadoCentavos: string;
  readonly fondoMonedasCentavos: string;
  readonly fondoChicosCentavos: string;
  readonly abiertaEn: string | null;
}

export interface CajaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly estadoInicial?: EstadoDeCaja;
}

/** Centavos como TEXTO: el dinero no pasa por punto flotante en el navegador. */
export function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return 0;
  if (!IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

function pesos(centavos: string | number): string {
  return PESOS.format(Number(centavos) / 100);
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Lo capturado sigue aquí: vuelve a intentarlo.';
}

export function Caja({ estadoInicial }: CajaProps) {
  const voc = useVocabulario();
  const [estado, setEstado] = useState<EstadoDeCaja | null>(estadoInicial ?? null);
  const [fondo, setFondo] = useState<Record<Denominacion, string>>({
    monedas: '',
    chicos: '',
    grandes: '',
  });
  const [cambio, setCambio] = useState({ monedas: '', chicos: '' });
  const [origen, setOrigen] = useState<(typeof ORIGENES)[number]['clave']>('banco');
  const [retiro, setRetiro] = useState({ importe: '', motivo: '' });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (estadoInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const cargar = (): void => {
      invocarComando<EstadoDeCaja>(RUTA_ESTADO, {})
        .then((datos) => {
          if (sigueMontada()) setEstado(datos);
        })
        .catch(() => {
          if (sigueMontada()) setError('No se pudo leer el estado de la caja.');
        });
    };
    // En un `setTimeout` y no en el cuerpo del efecto: escribir estado aquí de
    // forma síncrona es lo que caza `set-state-in-effect`.
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [estadoInicial]);

  const abierta = estado?.sesionCajaId !== null && estado?.sesionCajaId !== undefined;

  async function ejecutar(accion: () => Promise<EstadoDeCaja>): Promise<void> {
    setGuardando(true);
    setError(null);
    try {
      setEstado(await accion());
    } catch (fallo: unknown) {
      setError(mensajeDe(fallo));
    } finally {
      setGuardando(false);
    }
  }

  function abrir(): void {
    const montos = DENOMINACIONES.map((d) => aCentavos(fondo[d.clave]));
    if (montos.some((m) => m === null)) {
      setError('Revisa el desglose: sólo pesos y centavos.');
      return;
    }
    void ejecutar(async () => {
      await invocarComando(RUTA_ABRIR, {
        fondoMonedasCentavos: montos[0] ?? 0,
        fondoChicosCentavos: montos[1] ?? 0,
        fondoGrandesCentavos: montos[2] ?? 0,
      });
      return invocarComando<EstadoDeCaja>(RUTA_ESTADO, {});
    });
  }

  function meterCambio(): void {
    const monedas = aCentavos(cambio.monedas);
    const chicos = aCentavos(cambio.chicos);
    if (monedas === null || chicos === null) {
      setError('Revisa el desglose del cambio.');
      return;
    }
    if (monedas + chicos === 0) {
      setError('No entró nada: revisa el desglose.');
      return;
    }
    void ejecutar(async () => {
      await invocarComando(RUTA_CAMBIO, {
        monedasCentavos: monedas,
        chicosCentavos: chicos,
        origen,
        motivo: null,
      });
      setCambio({ monedas: '', chicos: '' });
      return invocarComando<EstadoDeCaja>(RUTA_ESTADO, {});
    });
  }

  function retirar(): void {
    const importe = aCentavos(retiro.importe);
    if (importe === null || importe === 0) {
      setError('Pon cuánto se retira.');
      return;
    }
    if (retiro.motivo.trim().length < 3) {
      // Un retiro sin motivo es la única salida de dinero que puede esconder un
      // faltante. No se guarda sin explicación.
      setError('Escribe a dónde va ese dinero.');
      return;
    }
    void ejecutar(async () => {
      await invocarComando(RUTA_MOVIMIENTO, {
        tipo: 'retiro',
        montoCentavos: -importe,
        motivo: retiro.motivo.trim(),
      });
      setRetiro({ importe: '', motivo: '' });
      return invocarComando<EstadoDeCaja>(RUTA_ESTADO, {});
    });
  }

  if (estado === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Caja</h1>
        <p className="text-muted-foreground text-sm">
          {abierta
            ? `Abierta desde las ${(estado.abiertaEn ?? '').slice(11, 16)}`
            : 'Cerrada. Ábrela para poder cobrar.'}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {!abierta && (
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="font-medium">Fondo con el que abres</h2>
            <p className="text-muted-foreground text-sm">
              Por montones. «$1,500» no dice si se puede dar cambio; cuánto hay en monedas, sí.
            </p>
          </div>
          {DENOMINACIONES.map((denominacion) => (
            <div key={denominacion.clave} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <Label htmlFor={`fondo-${denominacion.clave}`}>
                {denominacion.etiqueta}
                <span className="text-muted-foreground ml-2 text-xs">{denominacion.ayuda}</span>
              </Label>
              <Input
                id={`fondo-${denominacion.clave}`}
                inputMode="decimal"
                className="h-[calc(var(--altura-control)*1.4)] w-36 text-right text-lg"
                value={fondo[denominacion.clave]}
                onChange={(evento) => {
                  setFondo({ ...fondo, [denominacion.clave]: evento.target.value });
                }}
              />
            </div>
          ))}
          <Button
            className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
            disabled={guardando}
            onClick={abrir}
          >
            Abrir caja
          </Button>
        </section>
      )}

      {abierta && (
        <>
          <section className="rounded-lg border p-4">
            <h2 className="font-medium">Lo que debería haber</h2>
            <p className="text-3xl font-semibold tabular-nums">
              {pesos(estado.fondoEsperadoCentavos)}
            </p>
            <p className="text-muted-foreground text-sm">
              {pesos(estado.fondoMonedasCentavos)} en monedas · {pesos(estado.fondoChicosCentavos)}{' '}
              en chicos
            </p>
          </section>

          <Separator />

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-medium">Meter cambio</h2>
              <p className="text-muted-foreground text-sm">
                No es {voc.enFraseCon('un', 'orden')}: es fondo. Sube lo que la caja debería tener.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="cambio-monedas">Monedas</Label>
                <Input
                  id="cambio-monedas"
                  inputMode="decimal"
                  className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                  value={cambio.monedas}
                  onChange={(evento) => {
                    setCambio({ ...cambio, monedas: evento.target.value });
                  }}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="cambio-chicos">Billetes chicos</Label>
                <Input
                  id="cambio-chicos"
                  inputMode="decimal"
                  className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                  value={cambio.chicos}
                  onChange={(evento) => {
                    setCambio({ ...cambio, chicos: evento.target.value });
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {ORIGENES.map((opcion) => (
                <Button
                  key={opcion.clave}
                  type="button"
                  aria-pressed={origen === opcion.clave}
                  variant={origen === opcion.clave ? 'default' : 'outline'}
                  onClick={() => {
                    setOrigen(opcion.clave);
                  }}
                >
                  {opcion.etiqueta}
                </Button>
              ))}
            </div>
            <Button
              className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
              disabled={guardando}
              onClick={meterCambio}
            >
              Registrar el cambio
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-medium">Retirar</h2>
              <p className="text-muted-foreground text-sm">
                Lo que sale del cajón lleva escrito a dónde va.
              </p>
            </div>
            <Label htmlFor="retiro-importe">Cuánto</Label>
            <Input
              id="retiro-importe"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
              value={retiro.importe}
              onChange={(evento) => {
                setRetiro({ ...retiro, importe: evento.target.value });
              }}
            />
            <Label htmlFor="retiro-motivo">A dónde va</Label>
            <Input
              id="retiro-motivo"
              className="h-[calc(var(--altura-control)*1.4)]"
              placeholder="al banco · pago a Bimbo · caja fuerte"
              value={retiro.motivo}
              onChange={(evento) => {
                setRetiro({ ...retiro, motivo: evento.target.value });
              }}
            />
            <Button
              variant="outline"
              className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
              disabled={guardando}
              onClick={retirar}
            >
              Registrar el retiro
            </Button>
          </section>
        </>
      )}
    </main>
  );
}
