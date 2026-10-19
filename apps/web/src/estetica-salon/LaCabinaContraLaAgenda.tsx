'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Cifra, Superficie, Tabla, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * LA CABINA CONTRA LA AGENDA (§4.3.9): ¿alcanza lo que hay en la cabina para lo que está
 * agendado hoy? Es lo único que sólo este modelo contesta, y va arriba de todo.
 *
 * ── Lo que ahora dice de cada material (C.10 de la 2.4) ──────────────────
 * `cabina.alcanza` devolvía sólo el id de los que faltaban, y la pantalla adivinaba el
 * nombre por el producto que se abre en él —el que ningún producto surtía se quedaba sin
 * nombre—. Ahora trae TODOS los materiales del día con su nombre y su unidad, cuántos
 * servicios de hoy lo piden y para cuántos de ésos alcanza: «tinte 7.1 · alcanza para 2 de
 * 5» se decide distinto que «falta tinte».
 */

const RUTA_ALCANZA = '/api/inventario/cabina/alcanza';

export interface MaterialDelDia {
  readonly insumoId: string;
  readonly nombre: string | null;
  readonly unidad: string | null;
  readonly hay: string;
  readonly hara_falta: string;
  readonly servicios: number | null;
  readonly alcanzaPara: number | null;
  readonly falta: boolean;
}

function decimalesDe(valor: string): number {
  const [, fraccion = ''] = valor.replace(/0+$/, '').split('.');
  return Math.min(fraccion.length, 4);
}

function cifra(valor: string, unidad: string | null) {
  return (
    <Cifra
      valor={Number(valor)}
      unidad={unidad ?? undefined}
      decimales={decimalesDe(valor)}
      tamano="sm"
    />
  );
}

const COLUMNAS: readonly ColumnaDeTabla<MaterialDelDia>[] = [
  {
    clave: 'material',
    titulo: 'Material',
    celda: (m) => (
      <span className="flex flex-col">
        <span className="font-medium">{m.nombre ?? 'Sin nombre en el inventario'}</span>
        {/* La palabra, no sólo el tono de la fila. */}
        {m.falta ? <span className="text-xs font-medium">no alcanza</span> : null}
      </span>
    ),
  },
  { clave: 'hay', titulo: 'Hay', numerica: true, celda: (m) => cifra(m.hay, m.unidad) },
  {
    clave: 'hara_falta',
    titulo: 'Hacen falta',
    numerica: true,
    celda: (m) => cifra(m.hara_falta, m.unidad),
  },
  {
    clave: 'alcanza',
    titulo: 'Alcanza para',
    numerica: true,
    celda: (m) =>
      m.servicios === null || m.alcanzaPara === null ? (
        <span className="text-texto-sutil">—</span>
      ) : (
        <span className="font-numeros tabular-nums">
          {m.alcanzaPara} de {m.servicios}
        </span>
      ),
  },
];

export function LaCabinaContraLaAgenda() {
  const voc = useVocabulario();
  const [materiales, setMateriales] = useState<readonly MaterialDelDia[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function preguntar(): void {
    setOcupado(true);
    setFallo(null);
    // SIN consumo: lo calcula el servidor con la agenda de hoy, sus servicios y sus recetas.
    invocarComando<{ readonly insumos: readonly MaterialDelDia[] }>(RUTA_ALCANZA, {})
      .then((salida) => {
        setMateriales(salida.insumos);
      })
      .catch((error: unknown) => {
        setFallo(error instanceof ErrorApi ? error.message : 'No se pudo preguntar.');
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const faltan = (materiales ?? []).filter((m) => m.falta).length;

  return (
    <Superficie
      como="section"
      relleno={4}
      aria-label="La cabina contra la agenda"
      className="flex flex-col gap-(--espacio-3)"
    >
      <div className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 className="text-base font-semibold">La cabina contra la agenda</h2>
          <p className="text-sm text-texto-sutil">
            Se calcula con {voc.enFrase('orden', true)} de hoy y las fórmulas de sus{' '}
            {voc.plural('linea_orden')}.
          </p>
        </div>
        <Button type="button" variant="outline" size="lg" disabled={ocupado} onClick={preguntar}>
          <CalendarCheck aria-hidden="true" />
          ¿Alcanza para lo agendado?
        </Button>
      </div>

      {fallo !== null && (
        <Aviso tono="peligro" titulo={fallo}>
          No se sabe todavía si alcanza. Vuelve a preguntar.
        </Aviso>
      )}
      {materiales !== null && materiales.length === 0 && (
        <Aviso
          tono="exito"
          titulo="Hoy no hay servicios agendados que gasten material de cabina."
        />
      )}
      {materiales !== null && materiales.length > 0 && (
        <>
          {faltan === 0 ? (
            <Aviso tono="exito" titulo="Alcanza para todo lo que está agendado." />
          ) : (
            <Aviso tono="atencion" titulo="No alcanza para lo agendado">
              {faltan === 1 ? 'Falta 1 material.' : `Faltan ${String(faltan)} materiales.`}
            </Aviso>
          )}
          <Tabla
            etiqueta="Los materiales de hoy contra lo que hay en cabina"
            columnas={COLUMNAS}
            filas={materiales}
            claveDe={(m) => m.insumoId}
            tonoDeFila={(m) => (m.falta ? 'advertencia' : undefined)}
            alto="max-h-64"
          />
        </>
      )}
    </Superficie>
  );
}
