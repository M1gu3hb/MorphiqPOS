'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Aviso, Esqueleto, Superficie } from '@morphiqpos/ui/sistema';
import { ClipboardList } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PIEZA · ferreteria · abrir un conteo desde Existencias (C.8 de la 2.4)
 *
 * `inventario.abrir_conteo` existía y NADIE lo llamaba: Conteo decía «abrirla desde
 * Existencias todavía no está», y además su página nunca leía la toma de la dirección.
 * Ahora se abre aquí —una zona del almacén o la ferretería entera— y se va directo a
 * contarla (`/ferreteria/conteo?toma=`).
 *
 * Si ya hay una toma abierta, lo primero que se ofrece es SEGUIRLA: dos tomas a la vez
 * del mismo anaquel cuentan dos veces la misma diferencia.
 *
 * Abrir es de quien lleva el inventario (almacén y dirección). A quien no puede leer
 * las tomas —el cajero— el puente le contesta 403, y la pieza no se pinta: un botón que
 * al tocarse dice «no puedes» es peor que no tenerlo.
 */

export interface ZonaDelAlmacen {
  readonly id: string;
  readonly nombre: string | null;
  readonly activa: boolean | null;
}

export interface TomaAbierta {
  readonly id: string;
  readonly zona_id: string | null;
  readonly estado: string | null;
}

/** El valor del selector que significa «toda la ferretería», que no es una zona. */
const COMPLETA = 'completa';

export interface AbrirConteoProps {
  /** Cuando llegan, la pieza no consulta: es lo que usan las pruebas. */
  readonly zonasIniciales?: readonly ZonaDelAlmacen[];
  readonly tomasIniciales?: readonly TomaAbierta[];
}

export function AbrirConteo({ zonasIniciales, tomasIniciales }: AbrirConteoProps) {
  const enrutador = useRouter();
  const [zonas, setZonas] = useState<readonly ZonaDelAlmacen[] | null>(zonasIniciales ?? null);
  const [abiertas, setAbiertas] = useState<readonly TomaAbierta[] | null>(tomasIniciales ?? null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [alcance, setAlcance] = useState<string>(COMPLETA);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (zonasIniciales !== undefined && tomasIniciales !== undefined) return;
    const control = new AbortController();
    Promise.all([
      consultarPuente<ZonaDelAlmacen>('ZonaAnaquel', { limite: 100, signal: control.signal }),
      consultarPuente<TomaAbierta>('Conteo', {
        filtro: { estado: 'abierta' },
        limite: 5,
        signal: control.signal,
      }),
    ])
      .then(([leidas, tomas]) => {
        if (control.signal.aborted) return;
        setZonas(leidas.filter((z) => z.activa !== false));
        setAbiertas(tomas);
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        if (fallo instanceof ErrorApi && fallo.estado === 403) setSinPermiso(true);
        else setFalloDeLectura(fallo instanceof Error ? fallo.message : 'No se pudo leer.');
      });
    return () => {
      control.abort();
    };
  }, [zonasIniciales, tomasIniciales]);

  if (sinPermiso) return null;

  if (falloDeLectura !== null) {
    return (
      <Aviso tono="atencion" titulo="No se pudo saber si hay un conteo abierto">
        Existencias se lee igual; abrir un conteo tendrá que esperar a que vuelva la conexión.
      </Aviso>
    );
  }

  if (zonas === null || abiertas === null) {
    return <Esqueleto className="h-(--altura-control) w-48" />;
  }

  const abierta = abiertas[0];
  if (abierta !== undefined) {
    const deQue =
      abierta.zona_id === null
        ? 'de toda la ferretería'
        : `de ${zonas.find((z) => z.id === abierta.zona_id)?.nombre ?? 'una zona'}`;
    return (
      <Aviso
        tono="info"
        titulo={`Hay un conteo abierto ${deQue}`}
        accion={
          <Button asChild size="sm">
            <a href={`/ferreteria/conteo?toma=${abierta.id}`}>Seguir contando</a>
          </Button>
        }
      >
        Termínalo antes de abrir otro: dos tomas del mismo anaquel cuentan dos veces la misma
        diferencia.
      </Aviso>
    );
  }

  async function abrir(): Promise<void> {
    setAbriendo(true);
    setError(null);
    try {
      const salida = await invocarComando<{ readonly tomaId: string }>(
        '/api/inventario/conteo/abrir',
        alcance === COMPLETA ? { alcance: 'completo' } : { alcance: 'zona', zonaId: alcance },
      );
      enrutador.push(`/ferreteria/conteo?toma=${salida.tomaId}`);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir el conteo.');
      setAbriendo(false);
    }
  }

  if (!eligiendo) {
    return (
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          setEligiendo(true);
        }}
      >
        <ClipboardList aria-hidden="true" />
        Abrir conteo
      </Button>
    );
  }

  return (
    <Superficie nivel={0} relleno={3} radio="md" className="flex flex-col gap-(--espacio-3)">
      <span className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="conteo-alcance">Qué se cuenta</Label>
        <Select value={alcance} onValueChange={setAlcance}>
          <SelectTrigger id="conteo-alcance" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zonas.map((zona) => (
              <SelectItem key={zona.id} value={zona.id}>
                {zona.nombre ?? 'Zona sin nombre'}
              </SelectItem>
            ))}
            <SelectItem value={COMPLETA}>Toda la ferretería</SelectItem>
          </SelectContent>
        </Select>
      </span>
      {/* Una zona es el conteo cíclico de veinte minutos; la ferretería entera es cerrar
          la cortina. Se dice, porque la segunda opción está a un toque de la primera. */}
      <p className="text-sm text-texto-sutil">
        {alcance === COMPLETA
          ? 'Toda la ferretería: todo el material queda en conteo hasta que se cierre.'
          : 'Una zona: el anaquel se cuenta y se cierra hoy mismo.'}
      </p>
      {error === null ? null : <Aviso tono="peligro" titulo={error} />}
      <div className="flex justify-end gap-(--espacio-2)">
        <Button
          type="button"
          variant="ghost"
          disabled={abriendo}
          onClick={() => {
            setEligiendo(false);
            setError(null);
          }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          cargando={abriendo}
          disabled={abriendo}
          onClick={() => {
            void abrir();
          }}
        >
          {abriendo ? 'Abriendo…' : 'Abrir y contar'}
        </Button>
      </div>
    </Superficie>
  );
}
