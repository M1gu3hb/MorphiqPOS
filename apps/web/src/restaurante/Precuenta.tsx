'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · restaurante · precuenta
 *
 * La hoja que el mesero entrega al comensal para que revise antes de pagar.
 * 40-100 veces al día. Una sola acción: IMPRIMIR.
 *
 * ── Por qué a TAMAÑO REAL, y por qué lo que cambia es el ALREDEDOR ───────
 * Lo que se ve es lo que sale del rollo: si un nombre de platillo cabe en la
 * pantalla y en el papel se parte en dos, el mesero descubre el corte con el
 * comensal delante. Por eso la hoja no se encoge con la ventana y lo que
 * cambia por dispositivo es lo de fuera — teléfono, acción pegada al borde
 * inferior, que es donde llega el pulgar; tablet, barra flotante angosta,
 * porque se opera de pie y con una mano; PC, dos columnas con carril fijo.
 *
 * ── Por qué PRE-CUENTA y nunca «ticket», y por qué manda el CÓDIGO ───────
 * Porque no se ha cobrado nada, y un papel que dice TICKET sobre algo no
 * pagado es la puerta por la que se escapa una cuenta. Y porque el cajero
 * tiene que hallar esa cuenta entre veinte pendientes: el número de mesa se
 * reutiliza cinco veces por noche, el código es de ESA cuenta. De ahí que vaya
 * abajo, grande y monoespaciado — segunda jerarquía, después del total.
 *
 * ── Ni la impresora ni la red detienen el turno ──────────────────────────
 * Los dos fallos se anuncian con `role="alert"` y NUNCA vacían la pantalla. El
 * de impresión dice la salida que dicta el documento: enseñar esta hoja y
 * llevar al comensal a caja con el código.
 *
 * ── Lo que no hace, y lo que quedó fuera ─────────────────────────────────
 * No cobra ni fija propina: el mesero no cobra, y esa separación es control
 * interno. Si el puente recorta el dinero de la cuenta —es de rol caja— la
 * hoja dice «a definir en caja», que es lo que el documento pide cuando se
 * difirió; si falta el TOTAL el botón se apaga y dice por qué, porque una
 * precuenta sin total no es un documento sino una trampa. Fuera de alcance por
 * el límite de 300 líneas: el rollo de 58 mm comparte maqueta con el de 80.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** La banda de error. Nunca es sólo color: siempre lleva su frase. */
const BANDA = 'mb-3 rounded-md border border-destructive bg-destructive/10 p-2 text-sm';

export interface LineaPrecuenta {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: number;
  readonly precio_unitario_snapshot: number;
  readonly total: number;
  readonly notas_producto: string | null;
}

/**
 * Los importes van OPCIONALES a propósito: `total`, `subtotal`, `impuestos` y
 * `propina_monto` declaran `rolesLectura: CAJA`, así que a un mesero llegan
 * ausentes, no en cero. Tiparlos `number` volvería «$0.00» un campo que falta.
 */
export interface CuentaPrecuenta {
  readonly id: string;
  readonly folio: string;
  readonly mesa_numero: string | null;
  readonly personas: number | null;
  readonly codigo_caja: string | null;
  readonly subtotal?: number | null;
  readonly impuestos?: number | null;
  readonly total?: number | null;
  readonly propina_monto?: number | null;
}

export interface PrecuentaProps {
  /** La cuenta a imprimir. Si no viene, se lee de `?cuenta=` en la dirección. */
  readonly ordenId?: string;
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly cuentaInicial?: CuentaPrecuenta | null;
  readonly filasIniciales?: readonly LineaPrecuenta[];
  /** Los dos anchos de rollo térmico que existen en la vida real. */
  readonly anchoMm?: 58 | 80;
}

/** Un importe recortado por rol llega vacío, no en cero. Se dice, no se finge. */
function importe(valor: number | null | undefined): string {
  return valor == null ? '—' : PESOS.format(valor);
}

function idDeLaUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('cuenta');
}

export function Precuenta({
  ordenId,
  cuentaInicial,
  filasIniciales,
  anchoMm = 80,
}: PrecuentaProps) {
  const [cuenta, setCuenta] = useState<CuentaPrecuenta | null | undefined>(cuentaInicial);
  const [lineas, setLineas] = useState<readonly LineaPrecuenta[]>(filasIniciales ?? []);
  const [error, setError] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [falloImpresion, setFalloImpresion] = useState(false);

  useEffect(() => {
    if (cuentaInicial !== undefined) return;
    const id = ordenId ?? idDeLaUrl();
    if (id === null) {
      setCuenta(null);
      return;
    }
    let vivo = true;
    // `orden_visual` es el orden en que el mesero capturó, que es el que el
    // comensal reconoce cuando repasa la hoja con el dedo.
    Promise.all([
      consultarPuente<CuentaPrecuenta>('Venta', { filtro: { id }, limite: 1 }),
      consultarPuente<LineaPrecuenta>('DetalleVenta', {
        filtro: { venta_id: id },
        orden: 'orden_visual',
      }),
    ])
      .then(([cuentas, filas]) => {
        if (!vivo) return;
        setCuenta(cuentas[0] ?? null);
        setLineas(filas);
      })
      .catch((fallo: unknown) => {
        if (!vivo) return;
        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer la cuenta.');
        setCuenta(null);
      });
    return () => {
      vivo = false;
    };
  }, [cuentaInicial, ordenId]);

  async function imprimir(): Promise<void> {
    if (cuenta == null) return;
    setImprimiendo(true);
    setFalloImpresion(false);
    try {
      // El documento no nombra ruta para esto: se usa la convención
      // /api/<dominio>/<verbo>, hermana de `imprimir-comanda` (05-DATOS §6).
      await invocarComando('/api/restaurante/imprimir-precuenta', { ordenId: cuenta.id, anchoMm });
    } catch {
      // El error no se traga: tiene salida alterna, y es la que dicta el documento.
      setFalloImpresion(true);
    } finally {
      setImprimiendo(false);
    }
  }

  const hayHoja = cuenta != null && lineas.length > 0;
  const sinTotal = importe(cuenta?.total) === '—';
  const codigo = cuenta?.codigo_caja ?? cuenta?.folio ?? '';
  const estilo = { width: `${anchoMm}mm`, maxWidth: '100%' };

  function hoja() {
    // Esqueleto con la FORMA de la hoja: así nada salta cuando llegan los datos.
    if (cuenta === undefined) {
      return (
        <div
          role="status"
          aria-label="Armando la precuenta"
          className="mx-auto space-y-2 bg-card p-3 shadow-2"
          style={estilo}
        >
          <Skeleton className="mx-auto h-5 w-32" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
          <Skeleton className="mx-auto h-20 w-40" />
        </div>
      );
    }
    // El vacío ENSEÑA de dónde sale una precuenta; no se disculpa por no tenerla.
    if (cuenta === null || lineas.length === 0) {
      const sinCuenta = cuenta === null;
      return (
        <section className="mx-auto max-w-prose rounded-xl border border-border bg-card p-6 text-center text-card-foreground">
          <p className="mb-2 text-lg font-semibold">
            {sinCuenta
              ? 'Aquí se imprime la precuenta de una cuenta abierta'
              : 'Esta cuenta todavía no tiene platillos'}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {sinCuenta
              ? 'Abre la mesa en el mapa y pide la precuenta desde ahí: el código para caja es el de esa cuenta, no el de la mesa.'
              : 'Una hoja en blanco manda al comensal a caja sin nada que revisar. Toma la orden y vuelve: la hoja se arma sola.'}
          </p>
          <Button asChild>
            <a href="/restaurante/mapa-de-mesas">Ir al mapa de mesas</a>
          </Button>
        </section>
      );
    }
    return <Hoja cuenta={cuenta} lineas={lineas} estilo={estilo} />;
  }

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 xl:flex-row xl:items-start xl:justify-center xl:gap-10 xl:py-10">
        <main className="w-full min-w-0 xl:w-auto">
          {/* Título sólo para el lector de pantalla: el documento manda que lo
              PRIMERO que se vea sea la hoja completa. */}
          <h1 className="sr-only">Precuenta</h1>
          {error !== null && (
            <p role="alert" className={`mx-auto max-w-prose ${BANDA}`}>
              {error} No se pudo leer la cuenta completa: no entregues una precuenta a medias.
            </p>
          )}
          {hoja()}
        </main>

        {hayHoja && (
          <aside className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background p-4 md:mx-auto md:w-full md:max-w-sm md:rounded-xl md:border md:shadow-2 xl:bottom-auto xl:top-10 xl:mx-0 xl:w-60 xl:self-start">
            {falloImpresion && (
              <p role="alert" className={BANDA}>
                No se pudo imprimir. Puedes enseñar esta pantalla al comensal y llevarlo a caja con
                el código {codigo}.
              </p>
            )}
            {/* Un solo botón: el mesero no cobra, y eso es control interno. */}
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={imprimiendo || sinTotal}
              onClick={() => {
                void imprimir();
              }}
            >
              {imprimiendo ? 'Imprimiendo…' : 'Imprimir'}
            </Button>
            {/* Un botón apagado sin motivo es peor que uno que falla: aquí el
                motivo va debajo, en la misma mirada. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {sinTotal
                ? 'El total de esta cuenta no llegó a esta pantalla. Pídela desde caja.'
                : `Se ve a tamaño real: papel de ${anchoMm} mm.`}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

interface HojaProps {
  readonly cuenta: CuentaPrecuenta;
  readonly lineas: readonly LineaPrecuenta[];
  /** Milímetros de verdad, con tope del 100 % para no desbordar a 320 px. */
  readonly estilo: { readonly width: string; readonly maxWidth: string };
}

/** La hoja térmica. Lo que se ve aquí es lo que sale del rollo. */
function Hoja({ cuenta, lineas, estilo }: HojaProps) {
  const mesa = cuenta.mesa_numero ?? '—';
  const propina = cuenta.propina_monto;
  // La propina que no se decidió se DICE: el hueco lo rellena el comensal en su
  // cabeza, y casi nunca a favor de nadie.
  const propinaTexto = propina == null ? 'a definir en caja' : PESOS.format(propina);

  return (
    <article
      aria-label={`Precuenta de la mesa ${mesa}, folio ${cuenta.folio}`}
      className="mx-auto bg-card p-3 font-mono text-xs leading-snug text-card-foreground shadow-2"
      style={estilo}
    >
      <header className="text-center">
        <p className="text-base font-bold tracking-widest">PRE-CUENTA</p>
        <p className="text-muted-foreground">No es comprobante de pago</p>
      </header>
      <Separator className="my-2" />
      <p className="text-center">
        Folio {cuenta.folio} · Mesa {mesa} · {cuenta.personas ?? '—'} personas
      </p>
      <Separator className="my-2" />
      <ul>
        {lineas.map((linea) => (
          <li key={linea.id} className="mb-1 flex justify-between gap-2">
            <span className="min-w-0">
              <span className="font-bold">{linea.cantidad}×</span> {linea.producto_nombre}
              <span className="block text-muted-foreground">
                {PESOS.format(linea.precio_unitario_snapshot)} c/u
                {linea.notas_producto === null ? '' : ` · ${linea.notas_producto}`}
              </span>
            </span>
            <span className="tabular-nums">{PESOS.format(linea.total)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-2" />
      <dl className="grid grid-cols-2 gap-x-2 tabular-nums">
        <dt>Subtotal</dt>
        <dd className="text-right">{importe(cuenta.subtotal)}</dd>
        <dt>IVA</dt>
        <dd className="text-right">{importe(cuenta.impuestos)}</dd>
        <dt>Propina</dt>
        <dd className="text-right">{propinaTexto}</dd>
        <dt className="mt-1 text-lg font-bold">TOTAL</dt>
        <dd className="mt-1 text-right text-lg font-bold">{importe(cuenta.total)}</dd>
      </dl>
      <Separator className="my-2" />
      <section className="text-center">
        <p className="text-muted-foreground">CÓDIGO PARA CAJA</p>
        <p className="text-2xl font-bold tracking-widest">{cuenta.codigo_caja ?? cuenta.folio}</p>
      </section>
      <p className="mt-2 text-center text-muted-foreground">Pasa a caja con este código.</p>
    </article>
  );
}
