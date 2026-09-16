'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · estetica-salon · ficha-del-profesional
 *
 * «Mi día»: lo que la estilista mira entre clienta y clienta, de pie.
 *
 * ── Por qué NO es la agenda filtrada ────────────────────────────────────
 * La agenda del salón la lee la recepción para COLOCAR gente; ésta la lee ella,
 * con el teléfono en una mano y el tinte en la otra. Lleva quién sigue, a qué
 * hora, qué le toca hacer y cuánto lleva ganado — y NO lleva el margen del
 * servicio ni el costo del material que absorbe el salón, que no le tocan.
 *
 * ── Por qué lo primero que se ve es CUÁNDO QUEDA LIBRE ──────────────────
 * Porque el procesado la libera aunque la clienta siga sentada, y ése es el
 * minuto en que puede tomar a otra. Sin ese dato la pantalla es una lista de
 * citas, y el 25 %–40 % de capacidad intercalable sigue sin verse.
 *
 * ── Por qué la comisión del día se enseña TODOS los días ────────────────
 * La discusión de fin de quincena —«a mí me salían otros números»— se evita
 * dejándola mirar el acumulado todos los días. Un salón que sólo la enseña el
 * día del pago tiene esa discusión cada quince días, con la persona que le está
 * atendiendo a las clientas.
 *
 * ── Y por qué la propina va SEPARADA ────────────────────────────────────
 * No es del salón y no se comisiona. Sumarlas en un solo número haría que
 * pareciera que el salón le paga más de lo que le paga, y que la propina entra
 * en el cálculo de su comisión.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el día, lo siguiente, la comisión y la propina. Queda fuera cobrar,
 * que pasa en el mostrador y es otra pantalla.
 */

const RUTA_MI_DIA = '/api/profesionales';

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface CitaDeMiDia {
  readonly citaServicioId: string;
  readonly folio: string;
  readonly clienta: string | null;
  readonly servicio: string;
  readonly estado: string;
  readonly inicio: string;
  readonly fin: string;
  readonly libreDesde: string | null;
  readonly precioCentavos: string;
}

export interface MiDia {
  readonly profesionalId: string;
  readonly fecha: string;
  readonly citas: readonly CitaDeMiDia[];
  readonly comisionDelDiaCentavos: string;
  readonly propinaDelDiaCentavos: string;
  readonly siguiente: CitaDeMiDia | null;
}

export interface FichaDelProfesionalProps {
  readonly profesionalId: string;
  readonly diaInicial?: MiDia;
}

function pesos(centavos: string): string {
  return PESOS.format(Number(centavos) / 100);
}

function hora(iso: string): string {
  return iso.slice(11, 16);
}

/** Lo que se lee de un vistazo: «libre a las 10:40» o «ocupada hasta las 11:50». */
export function cuandoQuedaLibre(cita: CitaDeMiDia): string {
  if (cita.libreDesde === null) return `hasta las ${hora(cita.fin)}`;
  if (cita.libreDesde === cita.fin) return `hasta las ${hora(cita.fin)}`;
  return `libre a las ${hora(cita.libreDesde)}`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo leer tu día.';
}

export function FichaDelProfesional({ profesionalId, diaInicial }: FichaDelProfesionalProps) {
  const [dia, setDia] = useState<MiDia | null>(diaInicial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (diaInicial !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      invocarComando<MiDia>(`${RUTA_MI_DIA}/${profesionalId}/mi-dia`, { fecha: null })
        .then((datos) => {
          if (sigueMontada()) setDia(datos);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setError(mensajeDe(fallo));
        });
    };
    const arranque = setTimeout(cargar);
    // Se refresca solo: la pantalla se mira de pie y nadie la va a recargar
    // entre clienta y clienta.
    const latido = setInterval(cargar, 60_000);
    return () => {
      clearTimeout(arranque);
      clearInterval(latido);
      control.abort();
    };
  }, [profesionalId, diaInicial]);

  if (dia === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Mi día</h1>
        <p className="text-muted-foreground text-sm">{dia.fecha}</p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {dia.siguiente !== null && (
        <section className="rounded-lg border-2 p-4">
          <p className="text-muted-foreground text-sm">Sigue</p>
          <p className="text-2xl font-semibold">{dia.siguiente.clienta ?? 'Sin nombre'}</p>
          <p className="text-lg">{dia.siguiente.servicio}</p>
          <p className="text-muted-foreground">
            {hora(dia.siguiente.inicio)} · {cuandoQuedaLibre(dia.siguiente)}
          </p>
        </section>
      )}

      {dia.siguiente === null && dia.citas.length > 0 && (
        <p className="text-lg">Ya terminaste el día.</p>
      )}

      {dia.citas.length === 0 && <p className="text-muted-foreground">Hoy no tienes citas.</p>}

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Comisión de hoy</p>
          <p className="text-2xl font-semibold tabular-nums">{pesos(dia.comisionDelDiaCentavos)}</p>
        </div>
        <div className="rounded-lg border p-4">
          {/* Separada del salón, siempre: no se comisiona y no es suya. */}
          <p className="text-muted-foreground text-sm">Propina de hoy</p>
          <p className="text-2xl font-semibold tabular-nums">{pesos(dia.propinaDelDiaCentavos)}</p>
        </div>
      </section>

      <Separator />

      <section>
        <h2 className="mb-2 font-medium">Todo el día</h2>
        <ul className="divide-y">
          {dia.citas.map((cita) => (
            <li key={cita.citaServicioId} className="py-3">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{cita.clienta ?? 'Sin nombre'}</span>
                <span className="tabular-nums">{hora(cita.inicio)}</span>
              </div>
              <p className="text-muted-foreground text-sm">
                {cita.servicio} · {cuandoQuedaLibre(cita)}
              </p>
              <p className="text-muted-foreground text-sm">
                {pesos(cita.precioCentavos)} · {cita.estado}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Button
        variant="outline"
        className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
        onClick={() => {
          setDia(null);
        }}
      >
        Actualizar
      </Button>
    </main>
  );
}
