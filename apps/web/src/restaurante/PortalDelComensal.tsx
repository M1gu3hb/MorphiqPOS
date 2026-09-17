'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · portal-del-comensal
 *
 * Lo que ve quien escanea el código de la mesa: el menú y su cuenta.
 *
 * ── Por qué es UNA petición y no cinco ──────────────────────────────────
 * Antes eran cinco consultas anónimas desde el navegador, una de ellas la
 * configuración COMPLETA del negocio dos veces. En el teléfono de alguien
 * sentado en una terraza con una raya de señal, cinco peticiones es una pantalla
 * en blanco. El portal se pinta entero con `GET /api/publico/qr/:token`.
 *
 * ── Por qué el token dice QUÉ MESA y no de qué negocio ──────────────────
 * La organización sale del despliegue. Si viniera en la petición, el token de
 * una mesa serviría para leer el menú —y la cuenta— de otra.
 *
 * ── Por qué la cuenta no se puede pagar desde aquí ──────────────────────
 * Pagar en línea mete una pasarela y una obligación de devolución que no decide
 * esta pantalla. Lo que sí resuelve es la espera: ver la cuenta y PEDIRLA sin
 * levantar la mano quita los quince minutos que separan «ya terminamos» de «ya
 * nos vamos».
 *
 * ── Por qué el estado de la mesa manda sobre todo ───────────────────────
 * Una mesa libre no enseña cuenta: enseña el menú. Una mesa que ya pidió la
 * cuenta no ofrece pedir más. Enseñar todo siempre es cómo alguien pide un café
 * después de que el mesero ya cerró la caja.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el menú, la cuenta, pedir la cuenta y llamar al mesero. Queda fuera el
 * pedido desde el portal cuando el negocio lo tiene apagado.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Cada cuánto se refresca. Diez segundos: la cuenta cambia mientras se come. */
const MS_REFRESCO = 10_000;

export interface ProductoDelMenu {
  readonly id: string;
  readonly nombre: string;
  readonly precioCentavos: string;
  readonly seccion: string;
}

export interface LineaDeLaCuenta {
  readonly id: string;
  readonly nombre: string;
  readonly cantidad: string;
  readonly totalCentavos: string;
}

export interface PayloadDelPortal {
  readonly negocio: { readonly nombre: string };
  readonly mesa: { readonly numero: string; readonly estado: string };
  readonly menu: readonly ProductoDelMenu[];
  readonly cuenta: {
    readonly lineas: readonly LineaDeLaCuenta[];
    readonly totalCentavos: string;
  } | null;
  readonly puedePedir: boolean;
}

export interface PortalProps {
  readonly token: string;
  readonly datosIniciales?: PayloadDelPortal;
}

function pesos(centavos: string): string {
  return PESOS.format(Number(centavos) / 100);
}

/** Una mesa libre no enseña cuenta: enseña el menú. */
export function enseñaCuenta(datos: PayloadDelPortal): boolean {
  return datos.cuenta !== null && datos.cuenta.lineas.length > 0;
}

/** Ya pedida la cuenta, ofrecer pedir más es cómo alguien pide tras el cierre. */
export function puedeSeguirPidiendo(datos: PayloadDelPortal): boolean {
  return datos.puedePedir && datos.mesa.estado !== 'cuenta_solicitada';
}

interface Respuesta {
  readonly ok: boolean;
  readonly datos?: PayloadDelPortal;
}

/** Lo mínimo para creerle a la respuesta: que diga si salió bien. */
function esRespuesta(valor: unknown): valor is Respuesta {
  return typeof valor === 'object' && valor !== null && 'ok' in valor;
}

export function PortalDelComensal({ token, datosIniciales }: PortalProps) {
  const voc = useVocabulario();
  // F-017 · Cómo llama este negocio a la unidad de servicio. Lo resuelve el
  // envoltorio de servidor, así que en la primera pintada ya está.
  const vocabulario = useVocabulario();
  const [datos, setDatos] = useState<PayloadDelPortal | null>(datosIniciales ?? null);
  const [sinConexion, setSinConexion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const latir = (): void => {
      fetch(`/api/publico/qr/${token}`, { signal: control.signal })
        // `json()` devuelve `any`: se estrecha AQUÍ, en el borde, y no más
        // adentro. Un `any` que viaja dos líneas más ya contagió todo lo que
        // toca, y el compilador deja de avisar de lo que de verdad importa.
        .then(async (respuesta): Promise<Respuesta> => {
          const cuerpo: unknown = await respuesta.json();
          return esRespuesta(cuerpo) ? cuerpo : { ok: false };
        })
        .then((cuerpo) => {
          if (!sigueMontada()) return;
          if (cuerpo.ok && cuerpo.datos !== undefined) {
            setDatos(cuerpo.datos);
            setSinConexion(false);
          }
        })
        .catch(() => {
          // Ni se vacía ni enseña el fallo: se queda lo último y se enciende el
          // punto. Una pantalla en blanco en una terraza es una pantalla que se
          // cierra.
          if (sigueMontada()) setSinConexion(true);
        });
    };

    const arranque = setTimeout(latir);
    const latido = setInterval(latir, MS_REFRESCO);
    return () => {
      clearTimeout(arranque);
      clearInterval(latido);
      control.abort();
    };
  }, [token, datosIniciales]);

  function solicitar(tipo: 'cuenta' | 'mesero'): void {
    setEnviando(true);
    fetch(`/api/publico/qr/${token}/solicitud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-morphiqpos-request': '1' },
      body: JSON.stringify({ tipo }),
    })
      .then(() => {
        setAviso(tipo === 'cuenta' ? `Ya va ${voc.enFrase('orden')}.` : 'Ya viene alguien.');
      })
      .catch(() => {
        setAviso('No se pudo avisar. Levanta la mano.');
      })
      .finally(() => {
        setEnviando(false);
      });
  }

  if (datos === null) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const secciones = [...new Set(datos.menu.map((p) => p.seccion))];

  return (
    <main className="mx-auto max-w-lg space-y-6 p-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{datos.negocio.nombre}</h1>
          {/* «Mesa» en un restaurante, «estación» en una estética, «bahía» en un
              taller. El sustantivo sale del giro del negocio, no de esta línea. */}
          <p className="text-muted-foreground text-sm">
            {vocabulario.conArticulo('unidad_servicio')} {datos.mesa.numero}
          </p>
        </div>
        {sinConexion && (
          <span className="text-muted-foreground text-xs" aria-label="sin conexión">
            ●
          </span>
        )}
      </header>

      {aviso !== null && <p className="text-sm">{aviso}</p>}

      {enseñaCuenta(datos) && datos.cuenta !== null && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Tu {voc.singular('orden')}</h2>
          <ul className="divide-y">
            {datos.cuenta.lineas.map((linea) => (
              <li key={linea.id} className="flex items-baseline justify-between py-2">
                <span>
                  {linea.cantidad} × {linea.nombre}
                </span>
                <span className="tabular-nums">{pesos(linea.totalCentavos)}</span>
              </li>
            ))}
          </ul>
          <Separator className="my-2" />
          <p className="flex items-baseline justify-between text-xl font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{pesos(datos.cuenta.totalCentavos)}</span>
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Se paga en {voc.enFrase('unidad_servicio')}. Desde aquí sólo se pide.
          </p>
        </section>
      )}

      <section className="flex gap-3">
        <Button
          className="h-[calc(var(--altura-control)*1.4)] flex-1 text-base"
          disabled={enviando}
          onClick={() => {
            solicitar('cuenta');
          }}
        >
          Pedir {voc.enFrase('orden')}
        </Button>
        <Button
          variant="outline"
          className="h-[calc(var(--altura-control)*1.4)] flex-1 text-base"
          disabled={enviando}
          onClick={() => {
            solicitar('mesero');
          }}
        >
          Llamar al {voc.singular('responsable')}
        </Button>
      </section>

      {secciones.map((seccion) => (
        <section key={seccion}>
          <h2 className="mb-2 font-medium capitalize">{seccion}</h2>
          <ul className="divide-y">
            {datos.menu
              .filter((producto) => producto.seccion === seccion)
              .map((producto) => (
                <li key={producto.id} className="flex items-baseline justify-between py-2">
                  <span>{producto.nombre}</span>
                  <span className="tabular-nums">{pesos(producto.precioCentavos)}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {!puedeSeguirPidiendo(datos) && (
        <p className="text-muted-foreground text-sm">
          {datos.mesa.estado === 'cuenta_solicitada'
            ? `Ya pediste ${voc.enFrase('orden')}. Si falta algo, llama al ${voc.singular('responsable')}.`
            : 'Hoy no se pide desde aquí: pídele a quien te atiende.'}
        </p>
      )}
    </main>
  );
}
