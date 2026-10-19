'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { CalendarClock } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * PIEZA · cafeteria · los apartados de hoy (C.14 de la 2.4)
 *
 * Los pedidos que la gente aparta desde el menú público (`/n/<slug>/pedir`) sin pagar:
 * se preparan cuando toca, se COBRAN al recoger y se entregan. Aquí los ve quien
 * atiende, por hora, con el paso que sigue en cada uno:
 *
 *   programado → «Preparar»: manda la comanda a la barra ANTES del pago; si se
 *                preparara al cobrar, el apartado no adelantaría nada.
 *   sin cobrar → «Cobrar»: abre el cobro de ESA orden.
 *   cobrado    → «Entregar»: el servidor se niega a entregar lo que no se cobró.
 *
 * El que ya toca preparar —faltan diez minutos o menos— se marca: es la única
 * decisión de tiempo de la pieza.
 */

/** Cuántos minutos antes de la hora se marca «toca preparar». */
const MINUTOS_PARA_PREPARAR = 10;

export interface Apartado {
  readonly id: string;
  readonly orden_id: string | null;
  readonly nombre: string | null;
  readonly hora_prometida: string | null;
  readonly estado: string | null;
  /** Centavos enteros (`entero` en el puente). Se lee con `centavosDe`. */
  readonly total_centavos: number | null;
  readonly orden_estado: string | null;
}

export interface ApartadosDeHoyProps {
  /** Cuando llegan, la pieza no consulta: es lo que usan las pruebas. */
  readonly apartadosIniciales?: readonly Apartado[];
  readonly ahora?: number;
}

const HORA = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function horaDe(iso: string | null): string {
  return iso === null ? '—' : HORA.format(new Date(iso));
}

export function ApartadosDeHoy({ apartadosIniciales, ahora }: ApartadosDeHoyProps) {
  const [apartados, setApartados] = useState<readonly Apartado[] | null>(
    apartadosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [reloj, setReloj] = useState(ahora ?? 0);

  useEffect(() => {
    if (ahora !== undefined) return;
    const arranque = setTimeout(() => {
      setReloj(Date.now());
    });
    return () => {
      clearTimeout(arranque);
    };
  }, [ahora, recarga]);

  useEffect(() => {
    if (apartadosIniciales !== undefined) return;
    const control = new AbortController();
    // Los de las últimas doce horas en adelante, por hora; los vivos se eligen aquí:
    // el filtro del puente es de igualdad, y los vivos son dos estados.
    const desde = new Date(Date.now() - 12 * 3_600_000).toISOString();
    consultarPuente<Apartado>('PedidoAnticipado', {
      rango: { campo: 'hora_prometida', desde },
      orden: 'hora_prometida',
      limite: 60,
      signal: control.signal,
    })
      .then((filas) => {
        if (control.signal.aborted) return;
        setApartados(filas.filter((a) => a.estado === 'programado' || a.estado === 'en_fila'));
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer.');
      });
    return () => {
      control.abort();
    };
  }, [apartadosIniciales, recarga]);

  async function hacer(ruta: string, pedidoId: string): Promise<void> {
    setOcupado(pedidoId);
    setError(null);
    try {
      await invocarComando(ruta, { pedidoId });
      setRecarga((previa) => previa + 1);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo.');
    } finally {
      setOcupado(null);
    }
  }

  const columnas: readonly ColumnaDeTabla<Apartado>[] = [
    {
      clave: 'hora',
      titulo: 'Hora',
      celda: (a) => {
        const faltan =
          a.hora_prometida === null || reloj === 0
            ? null
            : (new Date(a.hora_prometida).getTime() - reloj) / 60_000;
        const toca =
          a.estado === 'programado' && faltan !== null && faltan <= MINUTOS_PARA_PREPARAR;
        return (
          <span className="flex items-center gap-(--espacio-2)">
            <span className="font-numeros tabular-nums">{horaDe(a.hora_prometida)}</span>
            {toca ? <Badge variant="destructive">toca preparar</Badge> : null}
          </span>
        );
      },
    },
    { clave: 'nombre', titulo: 'A nombre de', celda: (a) => a.nombre ?? '—' },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      celda: (a) => (
        <Dinero
          centavos={centavosDe('PedidoAnticipado', 'total_centavos', a.total_centavos) ?? 0}
          tamano="sm"
        />
      ),
    },
    {
      clave: 'paso',
      titulo: 'Sigue',
      celda: (a) => {
        const cobrado = a.orden_estado === 'pagada';
        if (a.estado === 'programado') {
          return (
            <Button
              size="sm"
              variant="outline"
              cargando={ocupado === a.id}
              disabled={ocupado !== null}
              onClick={() => {
                void hacer('/api/cafeteria/anticipado/encolar', a.id);
              }}
            >
              Preparar
            </Button>
          );
        }
        if (!cobrado) {
          return (
            <Button asChild size="sm">
              <a href={`/cafeteria/cobro-y-propina?pedido=${a.orden_id ?? ''}`}>Cobrar</a>
            </Button>
          );
        }
        return (
          <Button
            size="sm"
            cargando={ocupado === a.id}
            disabled={ocupado !== null}
            onClick={() => {
              void hacer('/api/cafeteria/anticipado/entregar', a.id);
            }}
          >
            Entregar
          </Button>
        );
      },
    },
  ];

  return (
    <Superficie relleno={4} como="section" aria-label="Apartados de hoy">
      <h2 className="mb-(--espacio-3) flex items-center gap-(--espacio-2) text-sm font-semibold">
        <CalendarClock aria-hidden="true" className="size-4" />
        Apartados
      </h2>
      {error === null ? null : (
        <Aviso tono="peligro" titulo={error}>
          El apartado sigue donde estaba.
        </Aviso>
      )}
      {falloDeCarga !== null ? (
        <Aviso
          tono="atencion"
          titulo="No se pudieron leer los apartados"
          accion={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFalloDeCarga(null);
                setApartados(null);
                setRecarga((previa) => previa + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        >
          El mostrador cobra igual; los apartados se ven al volver la conexión.
        </Aviso>
      ) : apartados === null ? (
        <EsqueletoDeLista filas={2} />
      ) : apartados.length === 0 ? (
        <Vacio
          icono={<CalendarClock />}
          titulo="Nadie ha apartado todavía."
          explicacion="Los pedidos que la gente aparta desde el menú público llegan aquí con su hora, para prepararlos y cobrarlos al recoger."
          className="py-0"
        />
      ) : (
        <Tabla etiqueta="Apartados" columnas={columnas} filas={apartados} claveDe={(a) => a.id} />
      )}
    </Superficie>
  );
}
